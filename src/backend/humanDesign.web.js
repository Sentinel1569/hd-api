import { webMethod, Permissions } from "wix-web-module";
import { computeChart } from "free-human-design";
import tzlookup from "tz-lookup";

// Flip to true only while actively debugging locally.
const DEBUG = false;

// ---------------------------------------------------------------------------
// INPUT VALIDATION
// Regex alone can't catch "2024-13-45" or "25:99" — both used to pass.
// Now backed by explicit numeric range checks.
// ---------------------------------------------------------------------------
// Frontend (Wix) actually sends date as ISO "YYYY-MM-DD" and time as
// 24-hour "HH:mm" (confirmed via debug logs: DATE: 2026-09-03, CONVERTED
// 24-HOUR TIME: 19:09) — not MM/DD/YYYY or 12-hour AM/PM as originally
// assumed. Validating directly in these formats means no conversion step
// is needed before handing either value to computeChart().
const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb generous (leap check below)
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

// Coerce to a trimmed string without throwing on non-string input (numbers,
// arrays, objects, etc.) — `(value || "").trim()` crashes for any truthy
// non-string since only strings have .trim().
function toTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTime24h(time) {
  const m = TIME_RE.exec(toTrimmedString(time));
  if (!m) return null;
  return {
    hour: Number(m[1]),
    minute: Number(m[2]),
    second: m[3] != null ? Number(m[3]) : 0
  };
}

function isValidTime(time) {
  const parsed = parseTime24h(time);
  if (!parsed) return false;
  const { hour, minute, second } = parsed;
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

// Normalizes an already-validated 24-hour time string to "HH:mm:ss".
// Only call after isValidTime().
function toIso24Time(time) {
  const { hour, minute, second } = parseTime24h(time);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const ss = String(second).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function parseIsoDate(date) {
  const m = DATE_RE.exec(toTrimmedString(date));
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function isValidDate(date) {
  const parsed = parseIsoDate(date);
  if (!parsed) return false;
  const { month, day, year } = parsed;
  if (month < 1 || month > 12) return false;
  if (year < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const maxDay = month === 2 && !leap ? 28 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) return false;
  return true;
}

// Normalizes an already-validated "YYYY-M-D" or "YYYY-MM-DD" string to a
// zero-padded ISO "YYYY-MM-DD" for the ephemeris library.
// Only call after isValidDate().
function toIsoDate(date) {
  const { month, day, year } = parseIsoDate(date);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function sanitizeHexColor(value, fallback) {
  return typeof value === "string" && HEX_COLOR_RE.test(value.trim()) ? value.trim() : fallback;
}

const VALID_COLOR_MODES = new Set(["standard", "monochrome"]);
function sanitizeColorMode(value) {
  return VALID_COLOR_MODES.has(value) ? value : "standard";
}

// ---------------------------------------------------------------------------
// CENTER COLOR MAP
// NOTE: verify this against your actual design reference / Jovian Archive's
// official legend before shipping — I've corrected two entries that looked
// inconsistent with the conventional Human Design chart palette (Head is
// conventionally yellow, not white; Solar Plexus is conventionally brown,
// matching Throat/Spleen/Root, not yellow like G/Sacral/Heart). Flagging
// rather than asserting, since I can't visually cross-check against your
// source of truth from here.
// ---------------------------------------------------------------------------
const CENTER_COLOR_MAP = {
  head: "#EAB308",
  ajna: "#76CD79",
  throat: "#B45309",
  g: "#EAB308",
  heart: "#EF4444",
  solarPlexus: "#B45309",
  sacral: "#EF4444",
  spleen: "#B45309",
  root: "#B45309"
};

// Accept minor key-naming variance (case, underscores, spacing) instead of
// silently falling back to gray. If a key STILL doesn't resolve after
// normalization, we now surface that loudly instead of hiding it.
function normalizeCenterKey(key) {
  return String(key).toLowerCase().replace(/[\s_-]/g, "");
}
const NORMALIZED_CENTER_COLOR_MAP = {};
Object.entries(CENTER_COLOR_MAP).forEach(([key, value]) => {
  NORMALIZED_CENTER_COLOR_MAP[normalizeCenterKey(key)] = { key, value };
});
// Known alternate spellings some HD libraries use for the same centers.
const CENTER_KEY_ALIASES = {
  ego: "heart",
  willpower: "heart",
  solar_plexus: "solarPlexus",
  emotional: "solarPlexus",
  identity: "g",
  gcenter: "g"
};

// Substructure derivation (Color / Tone / Base)
const ICHING_MAP = [
  55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8,
  20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29,
  59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14,
  34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60, 41, 19, 13, 49, 30
];

// ---------------------------------------------------------------------------
// FIX (was HIGH-RISK ZONE): fractalPosition() longitude -> gate/line offset.
//
// The old version derived its alignment offset from a hand-tuned combination
// of LINE_W/COLOR_W/TONE_W/BASE_W radian fractions that the original author
// flagged as unverified. It was off by exactly 1/24 of a degree (~2.5
// arcminutes) — small, but enough to occasionally push an activation into
// the wrong line right at a boundary (symptom reported: a chart showing
// "55.1" where a trusted reference showed "55.2").
//
// This version aligns directly to the published Human Design Rave Mandala
// gate table instead of a derived radian offset:
//   - Gate 41 (the mandala's conventional starting gate) begins at
//     2°00'00" Aquarius = 302° absolute ecliptic longitude (Aries = 0°).
//   - ICHING_MAP above is that same 64-gate order ROTATED to start at
//     Gate 55 (5 gates later than Gate 41), so Gate 55 begins at
//     302 + 5 * (360/64) = 330.125°, matching the published "0°07'30"
//     Pisces" (Pisces begins at 330°).
//
// Verified against three independent published boundaries — Gate 41
// (302°), Gate 55 (330.125°), and Gate 25 (358.25°, which straddles
// 0° Aries) — each lands on an exact integer ICHING_MAP index with zero
// remainder using the formula below.
//
// Recommended before shipping: still worth confirming against one
// known-correct real chart (e.g. the client's) as a final sanity check —
// derivation from public reference data is strong evidence, not a
// substitute for testing against ground truth.
// ---------------------------------------------------------------------------
const GATE_WIDTH_DEG = 360 / 64; // 5.625
const ICHING_MAP_START_LON = 330 + 7.5 / 60; // 330.125 — Gate 55's published start

function fractalPosition(lonDeg) {
  const lon = ((lonDeg % 360) + 360) % 360;
  const shifted = (((lon - ICHING_MAP_START_LON) % 360) + 360) % 360;
  return shifted / GATE_WIDTH_DEG; // 0–64, gate-unit fraction
}

// Clamp guards against float drift at exact boundaries cascading into
// out-of-range line/color/tone/base values (e.g. line=7, color=37).
function deriveSubstructure(longitude) {
  const f = fractalPosition(longitude);
  const gateIndex = Math.min(63, Math.max(0, Math.floor(f)));
  const gate = ICHING_MAP[gateIndex];
  const r = f - Math.floor(f);

  const line = Math.min(6, Math.floor(r / (1 / 6)) + 1);
  const inLine = r % (1 / 6);
  const color = Math.min(6, Math.floor(inLine / (1 / 36)) + 1);
  const inColor = inLine % (1 / 36);
  const tone = Math.min(6, Math.floor(inColor / (1 / 216)) + 1);
  const inTone = inColor % (1 / 216);
  const base = Math.min(5, Math.floor(inTone / (1 / 1080)) + 1);

  return { gate, line, color, tone, base };
}

/**
 * Mutates each activation in place, adding derived color/tone/base.
 * Collects discrepancies into `warnings` instead of only console-logging,
 * so callers (and monitoring) can actually see when the source package's
 * own gate/line/color disagrees with what we derive from raw longitude —
 * previously these were invisible outside local dev logs.
 */
function attachSubstructure(activations, warnings) {
  if (!Array.isArray(activations)) return;
  for (const a of activations) {
    if (typeof a.longitude !== "number") continue;
    const s = deriveSubstructure(a.longitude);

    if (a.gate !== s.gate || a.line !== s.line) {
      warnings.push(
        `Gate/line divergence for ${a.body}: package says ${a.gate}.${a.line}, ` +
        `derived from longitude says ${s.gate}.${s.line}. Using derived value.`
      );
      a.gate = s.gate;
      a.line = s.line;
    }

    if (a.color != null && a.color !== 1 && a.color !== s.color) {
      warnings.push(
        `Color divergence for ${a.body}: package says ${a.color}, derived says ${s.color}. Using derived value.`
      );
    }
    // Always trust the derived value as the single source of truth — see
    // fix note above re: this derivation's verification against the
    // published Rave Mandala table.
    a.color = s.color;
    a.tone = s.tone;
    a.base = s.base;
  }
}

function findBody(list, names) {
  if (!Array.isArray(list)) return null;
  const set = new Set(
    (Array.isArray(names) ? names : [names]).map((n) =>
      String(n).toLowerCase().replace(/[\s-]+/g, "_")
    )
  );
  return (
    list.find((a) => {
      const key = String(a.body || a.name || "")
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
      return set.has(key);
    }) || null
  );
}

function getArrowDirection(tone) {
  if (typeof tone !== "number" || tone < 1 || tone > 6) return null;
  return tone <= 3 ? "left" : "right";
}

function deriveVariables(activations) {
  if (!activations) return null;

  const design = activations.design || [];
  const personality = activations.personality || [];

  const dSun = findBody(design, ["sun"]);
  const dNode = findBody(design, ["south_node", "north_node", "south node", "north node"]);
  const pSun = findBody(personality, ["sun"]);
  const pNode = findBody(personality, ["south_node", "north_node", "south node", "north node"]);

  return {
    determination: {
      side: "design", label: "Determination",
      color: dSun?.color ?? null, tone: dSun?.tone ?? null, base: dSun?.base ?? null,
      direction: getArrowDirection(dSun?.tone)
    },
    environment: {
      side: "design", label: "Environment",
      color: dNode?.color ?? null, tone: dNode?.tone ?? null, base: dNode?.base ?? null,
      direction: getArrowDirection(dNode?.tone)
    },
    motivation: {
      side: "personality", label: "Motivation",
      color: pSun?.color ?? null, tone: pSun?.tone ?? null, base: pSun?.base ?? null,
      direction: getArrowDirection(pSun?.tone)
    },
    perspective: {
      side: "personality", label: "Perspective",
      color: pNode?.color ?? null, tone: pNode?.tone ?? null, base: pNode?.base ?? null,
      direction: getArrowDirection(pNode?.tone)
    }
  };
}

// Coerces booleans that may have arrived as "true"/"false" strings or 0/1
// from an upstream library without silently treating truthy-string "false"
// as true (Boolean("false") === true is the classic trap).
function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  if (typeof value === "number") return value === 1;
  return false;
}

function enrichCenters(centers = {}, options = {}, warnings) {
  const { colorMode = "standard", brandColor = "#008080" } = options;
  const enriched = {};
  const centerKeys = Object.keys(centers || {});

  if (centerKeys.length === 0) {
    warnings.push("enrichCenters received an empty/undefined centers object — chart rendering will be blank.");
  }

  for (const [centerKey, centerData] of Object.entries(centers)) {
    const isDefined = toBool(centerData?.defined ?? centerData?.isDefined);

    const normalized = normalizeCenterKey(CENTER_KEY_ALIASES[centerKey] || centerKey);
    const match = NORMALIZED_CENTER_COLOR_MAP[normalized];
    if (!match) {
      warnings.push(
        `Unrecognized center key "${centerKey}" — no color mapping found, defaulting to gray. ` +
        `Check whether the package renamed this center.`
      );
    }
    const standardColor = match ? match.value : "#888888";

    enriched[centerKey] = {
      ...centerData,
      isDefined,
      fillColor: isDefined ? (colorMode === "monochrome" ? brandColor : standardColor) : "#FFFFFF",
      strokeColor: "#000000"
    };
  }

  return enriched;
}

export const generateHumanDesignChart = webMethod(
  Permissions.Anyone,
  async (birthData) => {
    const {
      date,
      time,
      lat,
      lng,
      colorMode: rawColorMode = "standard",
      brandColor: rawBrandColor = "#008080"
    } = birthData || {};

    if (!date || !isValidDate(date)) {
      return { success: false, error: "Please provide a valid birth date (YYYY-MM-DD)." };
    }
    if (!time || !isValidTime(time)) {
      return { success: false, error: "Please provide a valid birth time (e.g. 19:09 or 19:09:00)." };
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (lat == null || lng == null || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return {
        success: false,
        error: "Missing coordinates for the birth location. Please reselect it from the address suggestions."
      };
    }
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return { success: false, error: "Those coordinates look out of range. Please reselect the birth location." };
    }

    const colorMode = sanitizeColorMode(rawColorMode);
    const brandColor = sanitizeHexColor(rawBrandColor, "#008080");

    let timezone;
    try {
      timezone = tzlookup(latNum, lngNum);
    } catch (err) {
      if (DEBUG) console.error("tz-lookup failed:", err?.message || err);
      return {
        success: false,
        error: "Couldn't determine a timezone for that location (it may be over open ocean). Please reselect the birth location."
      };
    }

    const isoDate = toIsoDate(date);
    const isoTime = toIso24Time(time);

    try {
      if (DEBUG) {
        console.log("Human Design request:", { date, isoDate, time, isoTime, lat: latNum, lng: lngNum, timezone });
      }

      const fullChart = computeChart({
        birthdate: isoDate,
        birthtime: isoTime,
        timezone,
        location: { lat: latNum, lng: lngNum }
      });

      const warnings = [];

      // Must run BEFORE deriveVariables so color/tone exist on each activation.
      attachSubstructure(fullChart.humanDesign?.activations?.personality, warnings);
      attachSubstructure(fullChart.humanDesign?.activations?.design, warnings);

      const variables = deriveVariables(fullChart.humanDesign?.activations);
      const centers = enrichCenters(fullChart.humanDesign?.centers, { colorMode, brandColor }, warnings);

      const chart = {
        ...fullChart.humanDesign,
        centers,
        variables,
        geneKeys: fullChart.geneKeys,
        astrology: fullChart.astrology,
        birthUtc: fullChart.input?.birth_utc
      };

      if (warnings.length && DEBUG) {
        console.warn(`Human Design chart generated with ${warnings.length} warning(s):`, warnings);
      }
      if (DEBUG) {
        console.log("Human Design result:", JSON.stringify(chart, null, 2));
        console.log("variables:", JSON.stringify(variables, null, 2));
      }

      // Surfacing warnings in the response (rather than only server logs)
      // so the frontend/QA can catch systemic issues instead of them being
      // invisible outside local dev.
      return { success: true, chart, warnings: warnings.length ? warnings : undefined };
    } catch (error) {
      console.error("Human Design calculation error:", error?.message || error, DEBUG ? error?.stack : "");
      return {
        success: false,
        error: "We couldn't calculate that chart. Please double-check the birth details and try again."
      };
    }
  }
);
