import { webMethod, Permissions } from "wix-web-module";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* =====================================================================
   BE YOU · Chart PDF backend
   ---------------------------------------------------------------------
   Builds the PDF in memory and returns it as base64. The #downloadHelper
   element on the Full Chart page turns it into a file download.
   Nothing is uploaded to the Media Manager, so a download is one quick
   request, and visitors' names don't pile up as public files.
   ===================================================================== */

/* =====================================================================
   Content libraries — condensed copies of what's already on the Full
   Chart page, so the PDF reads the same as the site. Only the prose
   fields actually printed are kept here (gates/channels get compact
   one-line rows rather than full paragraphs, to keep the PDF to a sane
   page count).
   ===================================================================== */

const TYPE_META = {
    "Generator": { strategy: "Respond", signature: "Satisfaction", notSelf: "Frustration",
        description: "You carry a generative engine that renews itself every day. Work you genuinely respond to leaves you tired and satisfied; work you talked yourself into leaves you frustrated and drained." },
    "Manifesting Generator": { strategy: "Respond, then inform", signature: "Satisfaction & Peace", notSelf: "Frustration & Anger",
        description: "You respond like a Generator but move like a Manifestor — fast and multi-directional. Skipping steps is not a flaw; informing removes the resistance your speed would otherwise create." },
    "Projector": { strategy: "Wait for the invitation", signature: "Success", notSelf: "Bitterness",
        description: "Your gift is awareness rather than endless motor capacity. Your insight lands where it has been genuinely recognised — waiting for the invitation is the discipline, not a limitation." },
    "Manifestor": { strategy: "Inform before you act", signature: "Peace", notSelf: "Anger",
        description: "You are here to initiate. Your aura is closed, so people sense impact before they sense you — informing removes resistance without asking permission." },
    "Reflector": { strategy: "Wait a lunar cycle", signature: "Surprise", notSelf: "Disappointment",
        description: "With no consistent definition, you sample and reflect the people and places around you. Environment matters more for you than for any other type." }
};

const AUTHORITY_META = {
    "Emotional": { headline: "There is no truth in the now.",
        description: "Your solar plexus moves in a wave, and that wave is chemical rather than caused by events. Clarity is what's left when the wave has finished moving, not a feeling in the moment." },
    "Sacral": { headline: "The body answers before the mind does.",
        description: "Your gut gives an immediate yes or no in the moment a question is asked. It's always current — a yes yesterday doesn't guarantee a yes today." },
    "Splenic": { headline: "It speaks once, quietly, and doesn't repeat.",
        description: "Your spleen delivers instinctive knowing in the present moment. It is subtle and easy to talk over, and it will not argue with you." },
    "Ego": { headline: "What do I actually want?",
        description: "Your decisions run through willpower and genuine desire. If you don't truly want it, you won't sustain it." },
    "Self-Projected": { headline: "You hear your truth when you speak it.",
        description: "Your clarity becomes audible only when you talk out loud. The answer is in your own voice, not in your head." },
    "Mental": { headline: "Environment decides, not the mind.",
        description: "You find clarity by talking things through with trusted people — not for advice, but to hear yourself — and by noticing where you feel most yourself." },
    "Lunar": { headline: "Clarity arrives over 28 days.",
        description: "With no consistent inner definition, a full lunar cycle lets you sample a decision from every angle before committing." }
};

const LINE_META = {
    1: { name: "The Investigator", text: "A need for solid foundations — you research and secure the ground beneath you before acting." },
    2: { name: "The Hermit", text: "Natural, innate talent that works best undisturbed, called out by people who see it in you." },
    3: { name: "The Martyr", text: "Learning by trial and error — what looks like failure is how you acquire knowledge no book could give you." },
    4: { name: "The Opportunist", text: "Life moves through your network — opportunities and relationships arrive through people you already know." },
    5: { name: "The Heretic", text: "People project expectations onto you and expect practical solutions in the right moment." },
    6: { name: "The Role Model", text: "A life in three acts — trial and error, an observational 'roof phase', then a lived example of what you've learned." }
};

const DEFINITION_META = {
    0: { name: "No Definition", text: "With no defined centres, you sample and reflect everything around you." },
    1: { name: "Single Definition", text: "All of your defined centres are woven into one unbroken circuit. You process thoughts, feelings and expression self-sufficiently." },
    2: { name: "Split Definition", text: "Your defined centres form two separate groups. You're wired to seek the people or circumstances that bridge the gap." },
    3: { name: "Triple Split Definition", text: "Your defined centres form three unconnected groups. You typically need more than one outside connection to feel complete." },
    4: { name: "Quadruple Split Definition", text: "Your defined centres form four unconnected groups. This is rare, and you rely heavily on environment and relationships to bridge them." }
};

const CENTER_META = {
    head: { label: "Head Center", defined: "Consistent pressure to think — your questions inspire others.", open: "You amplify others' mental pressure; the wisdom is choosing which questions are actually worth thinking about." },
    ajna: { label: "Ajna Center", defined: "A fixed way of processing information and reaching conclusions.", open: "A flexible mind that can hold many frameworks — the trap is pretending to be certain to feel secure." },
    throat: { label: "Throat Center", defined: "Consistent access to expression — you can speak or act reliably.", open: "Pressure to be noticed or fill silence; waiting to be recognised gives your words real weight." },
    g: { label: "G-Center (Identity)", defined: "A stable sense of who you are and where you're going.", open: "Identity and direction shift with environment — get the place right and the right direction follows." },
    heart: { label: "Heart / Ego Center", defined: "Willpower you can call on and promises you can keep.", open: "No consistent willpower to draw on — you have nothing to prove; your value isn't earned through effort." },
    spleen: { label: "Spleen Center", defined: "Ongoing instinctive awareness of what's healthy and safe.", open: "Highly sensitive to others' wellbeing and fear — the conditioning is holding on too long out of insecurity." },
    sacral: { label: "Sacral Center", defined: "A generative engine that renews itself daily.", open: "No consistent life-force — you amplify others' energy; rest before exhaustion, not after." },
    solarplexus: { label: "Solar Plexus Center", defined: "An emotional wave — clarity arrives over time, not in the now.", open: "You amplify the room's emotions — step away and let the wave pass before deciding anything is yours." },
    root: { label: "Root Center", defined: "Steady adrenalised pressure to get things done.", open: "Amplified urgency to be free of pressure — there is never actually a rush; the pressure isn't yours." }
};
const CENTER_ORDER = ["head", "ajna", "throat", "g", "heart", "spleen", "solarplexus", "sacral", "root"];

const GATE_NAMES = {
    1: "Self-Expression", 2: "Direction of the Self", 3: "Ordering", 4: "Formulization", 5: "Fixed Rhythms",
    6: "Friction", 7: "The Role of the Self", 8: "Contribution", 9: "Focus", 10: "Behaviour of the Self",
    11: "Ideas", 12: "Caution", 13: "The Listener", 14: "Power Skills", 15: "Extremes", 16: "Skills",
    17: "Opinions", 18: "Correction", 19: "Wanting", 20: "The Now", 21: "The Hunter", 22: "Openness",
    23: "Assimilation", 24: "Rationalization", 25: "The Spirit of the Self", 26: "The Egoist", 27: "Caring",
    28: "The Game Player", 29: "Saying Yes", 30: "Recognition of Feelings", 31: "Influence", 32: "Continuity",
    33: "Privacy", 34: "Power", 35: "Change", 36: "Crisis", 37: "Friendship", 38: "The Fighter",
    39: "Provocation", 40: "Aloneness", 41: "Contraction", 42: "Growth", 43: "Insight", 44: "Alertness",
    45: "The Gatherer", 46: "Determination", 47: "Realization", 48: "Depth", 49: "Principles", 50: "Values",
    51: "Shock", 52: "Stillness", 53: "Beginnings", 54: "Ambition", 55: "Spirit", 56: "Stimulation",
    57: "Intuitive Clarity", 58: "Vitality", 59: "Sexuality", 60: "Acceptance", 61: "Inner Truth",
    62: "Detail", 63: "Doubt", 64: "Confusion"
};
const GATE_CENTER = {
    1: "g", 2: "g", 3: "sacral", 4: "ajna", 5: "sacral", 6: "solarplexus", 7: "g", 8: "throat", 9: "sacral",
    10: "g", 11: "ajna", 12: "throat", 13: "g", 14: "sacral", 15: "g", 16: "throat", 17: "ajna", 18: "spleen",
    19: "root", 20: "throat", 21: "heart", 22: "solarplexus", 23: "throat", 24: "ajna", 25: "g", 26: "heart",
    27: "sacral", 28: "spleen", 29: "sacral", 30: "solarplexus", 31: "throat", 32: "spleen", 33: "throat",
    34: "sacral", 35: "throat", 36: "solarplexus", 37: "solarplexus", 38: "root", 39: "root", 40: "heart",
    41: "root", 42: "sacral", 43: "ajna", 44: "spleen", 45: "throat", 46: "g", 47: "ajna", 48: "spleen",
    49: "solarplexus", 50: "spleen", 51: "heart", 52: "root", 53: "root", 54: "root", 55: "solarplexus",
    56: "throat", 57: "spleen", 58: "root", 59: "sacral", 60: "root", 61: "head", 62: "throat", 63: "head", 64: "head"
};

const CHANNEL_META = {
    "1-8": "Inspiration — Creative contribution that needs recognition to land.",
    "2-14": "The Beat — Direction powered by consistent life-force.",
    "3-60": "Mutation — Pressure that innovates through limitation.",
    "4-63": "Logic — Doubt refined into patterns that can be trusted.",
    "5-15": "Rhythm — Natural timing and flow with life's cycles.",
    "6-59": "Intimacy — Emotional bonding and fertile connection.",
    "7-31": "The Alpha — Leadership for the good of the collective.",
    "9-52": "Concentration — Focused determination and stillness to complete.",
    "10-20": "Awakening — Embodied self-expression in the now.",
    "10-34": "Exploration — Following what is correct for your own conviction.",
    "10-57": "Perfected Form — Instinctive alignment with survival and beauty.",
    "11-56": "Curiosity — Ideas seeking stimulation and storytelling.",
    "12-22": "Openness — Social timing and emotional expression.",
    "13-33": "The Prodigal — Witnessing and sharing the story of experience.",
    "16-48": "The Wavelength — Skill refined through depth and practice.",
    "17-62": "Acceptance — Opinions organized into clear, practical detail.",
    "18-58": "Judgment — Correction in service of joy and better standards.",
    "19-49": "Synthesis — Sensitivity to needs and principles of belonging.",
    "20-34": "Charisma — Busy life-force expressed in the present.",
    "20-57": "The Brain Wave — Instinctive awareness spoken in the moment.",
    "21-45": "Money — Control and distribution of material resources.",
    "23-43": "Structuring — Unique insight that needs simple explanation.",
    "24-61": "Awareness — Mental pressure resolving into knowing.",
    "25-51": "Initiation — Competitive shock that wakes the spirit.",
    "26-44": "Surrender — Transmitter of patterns, sales, and memory.",
    "27-50": "Preservation — Care, values, and responsibility for others.",
    "28-38": "Struggle — Finding purpose through meaningful challenge.",
    "29-46": "Discovery — Saying yes to the experience of the body in life.",
    "30-41": "Recognition — Feeling and hunger that start new experiences.",
    "32-54": "Transformation — Ambition tempered by instinct for what endures.",
    "34-57": "Power — Archetypal life-force guided by intuition.",
    "35-36": "Transitoriness — Crisis and change that expand experience.",
    "37-40": "Community — Family, bargains, and emotional support structures.",
    "39-55": "Emoting — Spirit and mood that provoke emotional truth.",
    "42-53": "Maturation — Cycles that begin, develop, and complete.",
    "47-64": "Abstraction — Mental pressure making sense of the past."
};

function normalizeCenterKey(key) {
    return String(key || "").toLowerCase().replace(/[\s_-]+/g, "").replace(/^ego$/, "heart");
}

function channelKey(c) {
    if (!c) return "";
    if (typeof c === "string") {
        const nums = c.match(/\d+/g);
        if (nums && nums.length >= 2) {
            const sorted = nums.slice(0, 2).map(Number).sort((a, b) => a - b);
            return `${sorted[0]}-${sorted[1]}`;
        }
        return c;
    }
    if (Array.isArray(c.gates) && c.gates.length === 2) {
        const sorted = c.gates.map(Number).sort((a, b) => a - b);
        return `${sorted[0]}-${sorted[1]}`;
    }
    if (c.key) return channelKey(String(c.key));
    return "";
}

function profileLines(profile) {
    const nums = String(profile || "").match(/\d/g);
    if (!nums || nums.length < 2) return null;
    return { conscious: Number(nums[0]), unconscious: Number(nums[1]) };
}

/* =====================================================================
   Text the built-in PDF fonts can print
   Helvetica only covers Western European characters; anything else
   (e.g. "Ł" in Łódź, Chinese or Cyrillic names) makes pdf-lib throw and
   the whole PDF fails. Accents are stripped where possible ("ő" -> "o"),
   and characters with no Latin equivalent are left out.
   ===================================================================== */

const LATIN_FALLBACK = { "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ħ": "H", "ħ": "h", "ı": "i", "ß": "ss", "–": "-", "“": '"', "”": '"' };

function makeTextCleaner(font) {
    const cache = new Map();
    const canEncode = (ch) => {
        try {
            font.encodeText(ch);
            return true;
        } catch (e) {
            return false;
        }
    };
    const clean = (ch) => {
        if (ch === "\n" || ch === "\r" || ch === "\t") return " ";
        if (canEncode(ch)) return ch;
        const stripped = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (stripped && stripped !== ch && canEncode(stripped)) return stripped;
        const fallback = LATIN_FALLBACK[ch];
        return fallback && canEncode(fallback) ? fallback : "";
    };
    return (text) => {
        let out = "";
        for (const ch of String(text == null ? "" : text)) {
            if (!cache.has(ch)) cache.set(ch, clean(ch));
            out += cache.get(ch);
        }
        return out.replace(/ {2,}/g, " ").trim();
    };
}

/* =====================================================================
   PDF layout helpers
   ===================================================================== */

function wrapLines(font, text, size, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const w of words) {
        const test = current ? `${current} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
            lines.push(current);
            current = w;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current);
    return lines;
}

async function buildChartPdf(chart) {
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const safe = makeTextCleaner(fontRegular);

    const PAGE_W = 595.28, PAGE_H = 841.89; // A4
    const MARGIN = 54;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    const GOLD = rgb(0.69, 0.55, 0.34);
    const DARK = rgb(0.23, 0.19, 0.16);
    const GRAY = rgb(0.42, 0.38, 0.33);
    const LINE = rgb(0.91, 0.87, 0.78);

    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    function newPage() {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
    }
    function ensureSpace(needed) {
        if (y - needed < MARGIN) newPage();
    }
    // Every draw goes through here, so long names/places wrap instead of
    // running off the page.
    function lines(text, font, size, color, lineHeight) {
        wrapLines(font, safe(text), size, CONTENT_W).forEach((line) => {
            ensureSpace(lineHeight);
            page.drawText(line, { x: MARGIN, y, size, font, color });
            y -= lineHeight;
        });
    }
    function label(text) {
        lines(String(text).toUpperCase(), fontBold, 9, GOLD, 16);
    }
    function title(text, size = 18) {
        lines(text, fontBold, size, DARK, size + 8);
    }
    function subtitle(text) {
        lines(text, fontBold, 12.5, DARK, 17);
    }
    function paragraph(text, size = 10.5, color = GRAY, lineHeight = 14) {
        lines(text, fontRegular, size, color, lineHeight);
        y -= 6;
    }
    function divider() {
        ensureSpace(16);
        page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: LINE });
        y -= 16;
    }

    /* ---------- Cover ---------- */
    label("Human Design Synthesis");
    title("Be You Full Chart", 22);
    if (chart._ownerName) subtitle(chart._ownerName);
    if (chart._detailLine) paragraph(chart._detailLine, 10, GRAY, 13);
    divider();

    /* ---------- Type / Strategy / Authority ---------- */
    const typeMeta = TYPE_META[String(chart.type || "").trim()];
    label("Type");
    title(chart.type || "Not available", 16);
    paragraph(typeMeta ? typeMeta.description : "Your Type describes how your energy interacts with life.");
    if (typeMeta) {
        paragraph(`Strategy: ${typeMeta.strategy}   ·   Signature: ${typeMeta.signature}   ·   Not-Self Theme: ${typeMeta.notSelf}`, 10, DARK, 13);
    }
    divider();

    const authRaw = String(chart.authority || "").trim();
    const authKey = authRaw.replace(/\s*\(.*\)\s*$/, "").trim();
    const authMeta = AUTHORITY_META[authKey] || AUTHORITY_META[authRaw];
    label("Authority");
    title(chart.authority || "Not available", 16);
    if (authMeta) paragraph(`${authMeta.headline} ${authMeta.description}`);
    else paragraph("Your Authority describes the inner process for making correct decisions.");
    divider();

    /* ---------- Profile ---------- */
    label("Profile");
    title(chart.profile || "Not available", 16);
    const pl = profileLines(chart.profile);
    if (pl) {
        const c = LINE_META[pl.conscious], u = LINE_META[pl.unconscious];
        if (c) { subtitle(`Line ${pl.conscious} · ${c.name} (Personality)`); paragraph(c.text); }
        if (u) { subtitle(`Line ${pl.unconscious} · ${u.name} (Design)`); paragraph(u.text); }
    }
    divider();

    /* ---------- Definition ---------- */
    const defCount = chart._definitionCount != null ? chart._definitionCount : chart.definitionCount;
    const defMeta = DEFINITION_META[defCount];
    label("Definition");
    title(defMeta ? defMeta.name : "Not available", 16);
    paragraph(defMeta ? defMeta.text : "Your Definition describes how your defined centres connect to each other.");
    divider();

    /* ---------- Centres ---------- */
    const definedSet = new Set((chart.definedCenters || []).map(normalizeCenterKey));
    title("The 9 Energy Centres", 16);
    CENTER_ORDER.forEach((key) => {
        const meta = CENTER_META[key];
        const isDefined = definedSet.has(key);
        subtitle(`${meta.label} — ${isDefined ? "DEFINED" : "OPEN"}`);
        paragraph(isDefined ? meta.defined : meta.open);
    });
    divider();

    /* ---------- Gates ---------- */
    const gates = [...new Set((chart.activatedGates || chart.gates || []).map(Number))]
        .filter((n) => n >= 1 && n <= 64)
        .sort((a, b) => a - b);
    if (gates.length) {
        title(`Activated Gates (${gates.length})`, 16);
        gates.forEach((g) => {
            const center = GATE_CENTER[g];
            const status = definedSet.has(center) ? "defined" : "open";
            paragraph(`Gate ${g} · ${GATE_NAMES[g]}  —  ${CENTER_META[center].label} (${status})`, 10, DARK, 13.5);
        });
        divider();
    }

    /* ---------- Channels ---------- */
    const channels = (chart.definedChannels || chart.channels || []).slice(0, 36);
    if (channels.length) {
        title(`Full Channels (${channels.length})`, 16);
        channels.forEach((ch) => {
            const key = channelKey(ch);
            const text = CHANNEL_META[key];
            if (text) paragraph(`${key} · ${text}`, 10, DARK, 14);
        });
    }

    return pdfDoc.saveAsBase64();
}

/* =====================================================================
   Web method
   ===================================================================== */

export const generateChartPdf = webMethod(Permissions.Anyone, async (chart) => {
    try {
        if (!chart || typeof chart !== "object") {
            return { success: false, error: "No chart data was provided." };
        }

        const base64 = await buildChartPdf(chart);

        const safeName = Array.from(String(chart._ownerName || chart.firstName || ""), (ch) => LATIN_FALLBACK[ch] || ch)
            .join("")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
            .slice(0, 60) || "be-you";
        const fileName = `${safeName}-human-design-chart.pdf`;

        return { success: true, base64, fileName };
    } catch (error) {
        console.error("PDF generation error:", error?.message || error);
        return { success: false, error: "We couldn't generate the PDF right now. Please try again." };
    }
});
