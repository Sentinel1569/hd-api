import { webMethod, Permissions } from "wix-web-module";
import {
  parseBirthToUtc,
  jdUtcFromDate,
  getBackend,
  computeBodygraph,
  computeHouses
} from "free-human-design";
import tzlookup from "tz-lookup";

// ============================================================================
// BE YOU · Human Design backend
// ----------------------------------------------------------------------------
// Speed: computeChart() finds the design date three times and works out every
// planet's speed (only used for a "retrograde" flag nothing reads). Calling
// the package's building blocks once each takes a chart from ~150 ms to
// ~13 ms, and warmUp() lets the form page load the package while the visitor
// is still typing.
// ============================================================================

// Flip to true only while actively debugging.
const DEBUG = false;

// ---------------------------------------------------------------------------
// INPUT VALIDATION
// The form sends date as "YYYY-MM-DD" and time as 24-hour "HH:mm".
// ---------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const HTML_TAG_RE = /<[^>]*>/g;
const UNSAFE_CHARS_RE = /[\u0000-\u001f\u007f<>]/g;
const MIN_YEAR = 1800;
const MAX_YEAR = 2200;

const pad = (n) => String(n).padStart(2, "0");
const norm360 = (deg) => ((deg % 360) + 360) % 360;

// "YYYY-M-D" -> "YYYY-MM-DD", or null when it isn't a real calendar date.
function toIsoDate(value) {
  const m = typeof value === "string" ? DATE_RE.exec(value.trim()) : null;
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth ? `${year}-${pad(month)}-${pad(day)}` : null;
}

// "H:mm" / "HH:mm" / "HH:mm:ss" -> "HH:mm:ss", or null when out of range.
function toIsoTime(value) {
  const m = typeof value === "string" ? TIME_RE.exec(value.trim()) : null;
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = m[3] ? Number(m[3]) : 0;
  return hour <= 23 && minute <= 59 && second <= 59 ? `${pad(hour)}:${pad(minute)}:${pad(second)}` : null;
}

// Trims, collapses whitespace, drops HTML tags, control characters and stray
// angle brackets (names end up in HTML/PDF output), and caps the length.
function cleanText(value, maxLength) {
  return typeof value === "string"
    ? value.replace(HTML_TAG_RE, " ").replace(UNSAFE_CHARS_RE, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function cleanName(value) {
  const name = cleanText(value, 60);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return EMAIL_RE.test(email) ? email : "";
}

function sanitizeHexColor(value, fallback) {
  return typeof value === "string" && HEX_COLOR_RE.test(value.trim()) ? value.trim() : fallback;
}

// Accepts numbers or numeric strings; anything else (null, "", true) is null.
function toCoordinate(value) {
  if (typeof value === "string" && value.trim() !== "") value = Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// RAVE MANDALA: longitude -> gate / line / color / tone / base
// Aligned to the published gate table: Gate 55 begins at 0°07'30" Pisces
// (330.125°), which puts Gate 41 at 302° (2° Aquarius) and Gate 25 at 358.25°.
// Each gate (5.625°) holds 6 lines × 6 colors × 6 tones × 5 bases = 1080 base
// units, i.e. 192 units per degree. Working in whole units avoids the float
// drift of repeated modulo on 1/6, 1/36, 1/216 fractions.
// ---------------------------------------------------------------------------

const GATE_ORDER = [
  55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8,
  20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29,
  59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14,
  34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60, 41, 19, 13, 49, 30
];
const MANDALA_START_DEG = 330.125;
const UNITS_PER_GATE = 1080;
const UNITS_PER_DEGREE = 192;
const LAST_UNIT = 64 * UNITS_PER_GATE - 1;

function mandalaPosition(longitude) {
  const units = Math.min(LAST_UNIT, Math.floor(norm360(longitude - MANDALA_START_DEG) * UNITS_PER_DEGREE));
  const u = units % UNITS_PER_GATE;
  return {
    gate: GATE_ORDER[Math.floor(units / UNITS_PER_GATE)],
    line: Math.floor(u / 180) + 1,
    color: Math.floor((u % 180) / 30) + 1,
    tone: Math.floor((u % 30) / 5) + 1,
    base: (u % 5) + 1
  };
}

// ---------------------------------------------------------------------------
// ACTIVATIONS (13 bodies × personality + design)
// ---------------------------------------------------------------------------

// Same body order as the package's own activations.
const HD_BODIES = [
  "sun", "earth", "moon", "north_node", "south_node", "mercury", "venus",
  "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"
];
const SUN_DEG_PER_DAY = 360 / 365.2422;

// The design moment is when the Sun stood exactly 88° behind its birth
// position (~88 days earlier). The package brackets it day by day and then
// bisects (~120 Sun positions); a secant search lands on the same instant in ~5.
function designJulianDay(jdBirth, ephemeris) {
  const target = norm360(ephemeris.longitude("sun", jdBirth) - 88);
  const offset = (jd) => ((ephemeris.longitude("sun", jd) - target + 540) % 360) - 180;

  let x0 = jdBirth - 88 / SUN_DEG_PER_DAY;
  let f0 = offset(x0);
  let x1 = x0 - f0 / SUN_DEG_PER_DAY;
  let f1 = offset(x1);
  for (let i = 0; i < 20 && Math.abs(f1) > 1e-10 && f1 !== f0; i++) {
    const x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0);
    x0 = x1;
    f0 = f1;
    x1 = x2;
    f1 = offset(x1);
  }
  return x1;
}

// Earth and South Node sit exactly 180° from Sun and North Node, so they reuse
// those positions instead of asking the ephemeris again.
function streamActivations(stream, jd, ephemeris) {
  const sun = ephemeris.longitude("sun", jd);
  const northNode = ephemeris.longitude("north_node", jd);
  const derived = {
    sun,
    earth: norm360(sun + 180),
    north_node: northNode,
    south_node: norm360(northNode + 180)
  };
  return HD_BODIES.map((body) => {
    const longitude = derived[body] ?? ephemeris.longitude(body, jd);
    return { stream, body, ...mandalaPosition(longitude), longitude };
  });
}

// ---------------------------------------------------------------------------
// DERIVED DATA
// ---------------------------------------------------------------------------

// Number of separate groups the defined centers form (1 = single definition,
// 2 = split, ...). The package's own definitionCount is the channel count.
function countDefinitionGroups(definedCenters, definedChannels) {
  const parent = {};
  definedCenters.forEach((c) => { parent[c] = c; });
  const root = (c) => {
    while (parent[c] !== c) {
      parent[c] = parent[parent[c]];
      c = parent[c];
    }
    return c;
  };
  definedChannels.forEach(({ centers: [a, b] }) => {
    if (a in parent && b in parent) parent[root(a)] = root(b);
  });
  return definedCenters.filter((c) => root(c) === c).length;
}

// Sun/Earth and North/South Node pairs share color/tone/base (180° is exactly
// 32 gates), so Sun and North Node cover all four variables.
function variable(side, label, activation) {
  const tone = activation ? activation.tone : null;
  return {
    side,
    label,
    color: activation ? activation.color : null,
    tone,
    base: activation ? activation.base : null,
    direction: tone == null ? null : tone <= 3 ? "left" : "right"
  };
}

const CENTER_COLORS = {
  head: "#F4C542",
  ajna: "#76CD79",
  throat: "#B45309",
  g: "#EAB308",
  heart: "#EF4444",
  solarplexus: "#DC2626",
  sacral: "#F97316",
  spleen: "#0EA5A0",
  root: "#B45309"
};

function colorCenters(centers, colorMode, brandColor) {
  const out = {};
  for (const [key, isDefined] of Object.entries(centers)) {
    out[key] = {
      isDefined,
      fillColor: !isDefined ? "#FFFFFF" : colorMode === "monochrome" ? brandColor : CENTER_COLORS[key] || "#888888",
      strokeColor: "#000000"
    };
  }
  return out;
}

// Gene Keys spheres, read straight off the activations.
const GENE_KEY_SPHERES = {
  lifeswork: ["personality", "sun"],
  evolution: ["personality", "earth"],
  radiance: ["design", "sun"],
  purpose: ["design", "earth"],
  iq: ["personality", "venus"],
  eq: ["personality", "mars"],
  pearl: ["personality", "jupiter"],
  relating: ["personality", "mercury"],
  attraction: ["design", "moon"],
  sq: ["design", "venus"],
  core: ["design", "mars"],
  culture: ["design", "jupiter"],
  stability: ["design", "saturn"],
  creativity: ["design", "uranus"]
};

function computeHumanDesign({ date, time, timezone, lat, lng }) {
  const ephemeris = getBackend();
  const birthUtc = parseBirthToUtc({ birthdate: date, birthtime: time, timezone });
  const jdBirth = jdUtcFromDate(birthUtc);

  const activations = {
    personality: streamActivations("personality", jdBirth, ephemeris),
    design: streamActivations("design", designJulianDay(jdBirth, ephemeris), ephemeris)
  };
  // Type, authority, profile, channels and centers all come from the same
  // activations, so every section of the site agrees with the bodygraph.
  const bodygraph = computeBodygraph(activations);

  const byBody = {
    personality: Object.fromEntries(activations.personality.map((a) => [a.body, a])),
    design: Object.fromEntries(activations.design.map((a) => [a.body, a]))
  };

  const spheres = {};
  for (const [sphere, [stream, body]] of Object.entries(GENE_KEY_SPHERES)) {
    const a = byBody[stream][body];
    spheres[sphere] = { gk: a.gate, line: a.line };
  }

  // chartPdf.jsw receives the whole chart, so astrology stays in the payload
  // (~0.5 ms). houses.angles is the same object as angles.
  const houses = computeHouses({ jdUT: jdBirth, lat, lng, system: "placidus" });
  for (const key of ["ascendant", "descendant", "mc", "ic"]) {
    const angle = houses.angles[key];
    const { gate, line } = mandalaPosition(angle.longitude);
    angle.gateLine = { gate, line };
  }

  return {
    ...bodygraph,
    definitionCount: countDefinitionGroups(bodygraph.definedCenters, bodygraph.definedChannels),
    activations,
    variables: {
      determination: variable("design", "Determination", byBody.design.sun),
      environment: variable("design", "Environment", byBody.design.north_node),
      motivation: variable("personality", "Motivation", byBody.personality.sun),
      perspective: variable("personality", "Perspective", byBody.personality.north_node)
    },
    geneKeys: { spheres },
    astrology: { location: { lat, lng, source: "explicit" }, angles: houses.angles, houses },
    birthUtc: birthUtc.toISOString(),
    timezone
  };
}

// ---------------------------------------------------------------------------
// WEB METHODS
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   firstName: string, lastName: string, email: string,
 *   date: string,  // "YYYY-MM-DD"
 *   time: string,  // "HH:mm" (24-hour)
 *   lat: number, lng: number, birthPlace: string,
 *   colorMode?: "standard"|"monochrome", brandColor?: string
 * }} birthData
 */
export const generateHumanDesignChart = webMethod(Permissions.Anyone, (birthData) => {
  const input = birthData || {};

  const isoDate = toIsoDate(input.date);
  if (!isoDate) {
    return { success: false, error: "Please provide a valid birth date." };
  }
  const isoTime = toIsoTime(input.time);
  if (!isoTime) {
    return { success: false, error: "Please provide a valid birth time." };
  }

  const lat = toCoordinate(input.lat);
  const lng = toCoordinate(input.lng);
  if (lat === null || lng === null) {
    return {
      success: false,
      error: "Missing coordinates for the birth location. Please reselect it from the address suggestions."
    };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { success: false, error: "Those coordinates look out of range. Please reselect the birth location." };
  }

  let timezone;
  try {
    timezone = tzlookup(lat, lng);
  } catch (error) {
    if (DEBUG) console.error("tz-lookup failed:", error);
    return {
      success: false,
      error: "Couldn't determine a timezone for that location. Please reselect the birth location."
    };
  }

  try {
    const core = computeHumanDesign({ date: isoDate, time: isoTime, timezone, lat, lng });

    const firstName = cleanName(input.firstName);
    const lastName = cleanName(input.lastName);
    const colorMode = input.colorMode === "monochrome" ? "monochrome" : "standard";

    const chart = {
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(" "),
      email: cleanEmail(input.email),
      birthDate: isoDate,
      birthTime: isoTime.slice(0, 5),
      birthPlace: cleanText(input.birthPlace, 200),
      lat,
      lng,
      ...core,
      centers: colorCenters(core.centers, colorMode, sanitizeHexColor(input.brandColor, "#008080"))
    };

    if (DEBUG) console.log("Human Design chart:", JSON.stringify(chart));
    return { success: true, chart };
  } catch (error) {
    console.error("Human Design calculation error:", error?.message || error);
    return {
      success: false,
      error: "We couldn't calculate that chart. Please double-check the birth details and try again."
    };
  }
});

// Called by the form page on load: loads the package and runs one throwaway
// chart so the visitor's real request doesn't pay the cold start. Runs once
// per server instance; later calls return immediately.
let warmedUp = false;
export const warmUp = webMethod(Permissions.Anyone, () => {
  if (!warmedUp) {
    warmedUp = true;
    try {
      computeHumanDesign({ date: "2000-01-01", time: "12:00:00", timezone: "UTC", lat: 0, lng: 0 });
    } catch (error) {
      if (DEBUG) console.warn("warmUp failed:", error);
    }
  }
  return true;
});
