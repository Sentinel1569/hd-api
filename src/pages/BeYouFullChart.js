/* =====================================================================
   BE YOU · FULL CHART — Wix Velo page code (Section 3)
   ---------------------------------------------------------------------
   Every result on the chart now renders with its own interpretation:
     · Type            → aura, strategy, signature, not-self, % of people
     · Authority       → how the decision process actually works
     · Profile         → both lines named and explained separately
     · Definition      → derived from the channels, not trusted blindly
     · 9 Centres       → a different reading for DEFINED vs OPEN
     · 64 Gates        → name, home centre, and what the gate carries
     · 36 Channels     → name, circuitry, and what the channel does
   Plain-text output goes to your existing #ids via safeText().
   Rich output goes to optional HTML elements via safeHtml().
   Long text is only built for elements that exist on the page.
   ===================================================================== */

import wixWindowFrontend from "wix-window-frontend";
import { session } from "wix-storage-frontend";
import { generateChartPdf } from "backend/chartPdf.web";

const CHART_STORAGE_KEY = "beYouHumanDesignChart";

/* =====================================================================
   1 · SAFE DOM HELPERS
   ===================================================================== */

// Returns the element only if it is on this page and supports `prop`, so the
// same code works whether or not an optional element has been added.
function findElement(selector, prop) {
    try {
        const el = $w(selector);
        return el && prop in el ? el : null;
    } catch (e) {
        return null;
    }
}

function hideOverlay() {
    const el = findElement("#loadingOverlay", "hide");
    if (el) el.hide();
}

// `value` may be a function, so long text is only built when the element exists.
function safeText(selector, value) {
    const el = findElement(selector, "text");
    if (!el) return;
    const text = typeof value === "function" ? value() : value;
    el.text = text == null ? "" : String(text);
}

/* Writes into an HTML-capable element (Text element set to accept HTML).
   Silently skips if the element doesn't exist. */
function safeHtml(selector, value) {
    const el = findElement(selector, "html");
    if (!el) return;
    const html = typeof value === "function" ? value() : value;
    el.html = html == null ? "" : String(html);
}

function esc(str) {
    return String(str == null ? "" : str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/* =====================================================================
   1b · CHART OWNER NAME + DETAIL LINE
   Builds "Jane Doe" and "7th March 2001 @ 06:45 in Lima, Peru" from
   whatever shape the stored chart has — birthPlace has arrived as both a
   plain string and a nested object with .formatted, and birthDate as both
   an ISO date and a full JS Date string, so both are handled.
   ===================================================================== */

function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function getOwnerName(chart) {
    const first = String(chart.firstName || chart.name || chart.ownerName || "").trim();
    const last = String(chart.lastName || "").trim();
    return [first, last].filter(Boolean).map(capitalize).join(" ");
}

function ordinal(day) {
    const n = Number(day);
    if (isNaN(n)) return String(day);
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

function formatBirthDate(birthDate) {
    if (!birthDate) return "";
    // Read "YYYY-MM-DD" directly: new Date("2001-03-07") means UTC midnight,
    // which displays as the 6th for anyone west of Greenwich (e.g. Lima).
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(birthDate).trim());
    if (iso) return `${ordinal(iso[3])} ${MONTH_NAMES[Number(iso[2]) - 1] || iso[2]} ${iso[1]}`;
    const d = new Date(birthDate);
    if (isNaN(d.getTime())) return String(birthDate);
    return `${ordinal(d.getDate())} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function formatBirthTime(birthTime) {
    if (!birthTime) return "";
    // Strips seconds/millis off "16:35:00.000" -> "16:35"; leaves "06:45" as is.
    const match = String(birthTime).match(/^(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : String(birthTime);
}

function formatBirthPlace(birthPlace) {
    if (!birthPlace) return "";
    if (typeof birthPlace === "string") return birthPlace;
    if (typeof birthPlace === "object") {
        if (birthPlace.formatted) return birthPlace.formatted;
        if (birthPlace.city && birthPlace.country) return `${birthPlace.city}, ${birthPlace.country}`;
        if (birthPlace.city) return birthPlace.city;
    }
    return "";
}

function getChartDetailLine(chart) {
    const date = formatBirthDate(chart.birthDate || chart.birthdate);
    const time = formatBirthTime(chart.birthTime || chart.birthtime);
    const place = formatBirthPlace(chart.birthPlace || chart.location);
    let line = date;
    if (time) line += (line ? " @ " : "") + time;
    if (place) line += (line ? " in " : "") + place;
    return line;
}

/* =====================================================================
   2 · CENTRE LIBRARY
   Each centre carries a defined reading and an open reading, because the
   same centre means two opposite things depending on colour.
   ===================================================================== */

const CENTER_META = {
    head: {
        label: "Head Center",
        blurb: "Inspiration & Wonder",
        theme: "Pressure to think, question, and receive inspiration.",
        defined: "You carry a consistent pressure to think. Questions, doubts and inspirations arrive on their own schedule and you are built to hold them rather than resolve them on demand. Your mental pressure is meant to inspire other people, so the work is choosing which questions deserve your attention instead of chasing every one.",
        open: "You take in the mental pressure of everyone around you and can mistake it for your own. The trap is feeling obliged to answer questions that were never yours. Your wisdom is knowing which questions are actually worth thinking about — and letting the rest pass through."
    },
    ajna: {
        label: "Ajna Center",
        blurb: "Cognitive Processing",
        theme: "How you conceptualize, analyze, and form mental certainty.",
        defined: "You have a fixed way of processing information and a mind that reliably reaches conclusions. That consistency is a gift to others, but certainty is not the same as truth — your mind is designed to research and explain, never to make your decisions for you.",
        open: "Your mind is flexible and can hold many frameworks at once, which makes you a genuine learner. The conditioning is pretending to be certain to feel secure. You don't need a fixed opinion to be valuable; your openness is what lets you see what fixed minds can't."
    },
    throat: {
        label: "Throat Center",
        blurb: "Manifestation & Voice",
        theme: "Expression, communication, and making things real in the world.",
        defined: "You have consistent access to expression. Your voice works reliably and you can speak or act without waiting for the right conditions internally. The discipline is timing — having the ability to speak doesn't mean every moment is correct for it.",
        open: "You feel pressure to speak up, be noticed, or fill silence — often speaking before you're actually recognised. When you wait to be asked, your words land with real weight. Your gift is knowing exactly when speech matters and when it doesn't."
    },
    g: {
        label: "G-Center (Identity)",
        blurb: "Love & Life Direction",
        theme: "Sense of self, direction, and who you are drawn to love.",
        defined: "You carry a stable sense of who you are and where you are going. Your identity doesn't shift with the room. Direction comes from within, so environment supports you rather than defining you.",
        open: "Your sense of self and direction shifts with your environment and the people you are with — this is flexibility, not instability. The conditioning is searching endlessly for 'who I really am'. Place matters enormously to you: get the environment right and the right direction and people appear."
    },
    heart: {
        label: "Heart / Ego Center",
        blurb: "Willpower & Worth",
        theme: "Will, material commitment, and proving your value.",
        defined: "You have willpower you can actually call on and you can make promises you'll keep. Your worth doesn't need proving — it's already there. The caution is over-committing simply because you can.",
        open: "You have no consistent willpower to draw on, so you cannot keep pushing yourself to prove your worth. The conditioning is making promises to demonstrate value and then burning out honouring them. You have nothing to prove; your value is not earned through effort."
    },
    spleen: {
        label: "Spleen Center",
        blurb: "Intuition & Health",
        theme: "Instinct, timing, immune awareness, and survival intuition.",
        defined: "You have an ongoing instinctive awareness of what is healthy and safe for you. It speaks once, quietly, in the present moment. Your body knows before your mind catches up — the work is trusting it the first time.",
        open: "You are highly sensitive to the wellbeing of everyone around you and can absorb their fear as your own. The conditioning is holding on to people, jobs and habits that are no longer good for you, out of an inherited sense of insecurity. Your wisdom is an unusually sharp read on health and timing — in others."
    },
    sacral: {
        label: "Sacral Center",
        blurb: "Vital Workforce Energy",
        theme: "Life-force, sustainable work energy, and gut response.",
        defined: "You have a generative engine that renews itself daily. Used on work you genuinely respond to, it produces deep satisfaction; forced into work you don't, it produces frustration. You're designed to go to bed tired, not depleted.",
        open: "You do not have consistent life-force energy, and you amplify the energy of the Generators around you — which is why you can feel tireless in company and flattened alone. The conditioning is not knowing when enough is enough. Rest before exhaustion, and protect your sleep."
    },
    solarplexus: {
        label: "Solar Plexus Center",
        blurb: "Emotional Intelligence",
        theme: "Emotional wave, feelings, and clarity over time.",
        defined: "You move through an emotional wave — highs, lows and neutral stretches that are chemical, not circumstantial. There is no truth in the now for you. Clarity arrives by riding the wave rather than acting at either end of it.",
        open: "You take in and amplify the emotions in the room and can carry other people's moods home. The conditioning is avoiding confrontation and truth-telling to keep the peace. Step away, let the wave pass, and notice what was actually yours."
    },
    root: {
        label: "Root Center",
        blurb: "Adrenal & Stress Drive",
        theme: "Pressure to act, stress fuel, and momentum to finish.",
        defined: "You carry a steady adrenalised pressure to get things done and move things forward. You handle stress well, but the pressure never fully switches off — deliberate rest has to be chosen, not waited for.",
        open: "You amplify pressure and feel a constant rush to be free of it, which leads to hurrying through things just to be done. The conditioning is 'I have to finish this now'. There is never actually a rush — the pressure isn't yours."
    }
};

const CENTER_ORDER = ["head", "ajna", "throat", "g", "heart", "spleen", "solarplexus", "sacral", "root"];

function normalizeCenterKey(key) {
    return String(key || "")
        .toLowerCase()
        .replace(/[\s_-]+/g, "")
        .replace(/^solarplexuscenter$/, "solarplexus")
        .replace(/^ego$/, "heart");
}

/* =====================================================================
   3 · GATE LIBRARY — all 64
   Format: gate: [name, home centre, interpretation]
   ===================================================================== */

const GATE_META = {
    1:  ["Self-Expression", "g", "The drive to create in a way that is unmistakably your own. Creativity here is not produced on demand — it arrives, and it needs to be witnessed to matter."],
    2:  ["Direction of the Self", "g", "A receptive knowing about which way to go. You don't push toward direction; you recognise it when it appears and others often follow it."],
    3:  ["Ordering", "sacral", "The energy to bring order to new beginnings. Early confusion is part of the process, not a sign you chose wrong."],
    4:  ["Formulization", "ajna", "A mind that wants to answer the unanswerable. Answers here are theories to be tested over time, not conclusions to act on immediately."],
    5:  ["Fixed Rhythms", "sacral", "A deep need for consistent personal rhythm — sleep, food, movement, routine. Keeping your pattern is what keeps you in flow with natural timing."],
    6:  ["Friction", "solarplexus", "The gatekeeper of intimacy. Conflict and closeness arrive together here, and the emotional wave decides who gets let in and when."],
    7:  ["The Role of the Self", "g", "Leadership from behind and beside rather than in front. You influence direction most when you guide the leader instead of becoming them."],
    8:  ["Contribution", "throat", "The urge to make an individual contribution visible. It needs the right creative partnership — and recognition — to have an effect."],
    9:  ["Focus", "sacral", "The energy to concentrate on detail for as long as something takes. Focus is your power, but only when aimed at the right thing."],
    10: ["Behaviour of the Self", "g", "Love of self expressed as how you conduct yourself. Being genuinely yourself in every setting is the whole assignment here."],
    11: ["Ideas", "ajna", "A mind filled with ideas looking for someone to share them with. These ideas are for teaching and stimulating others, not necessarily for you to act on."],
    12: ["Caution", "throat", "A moody, articulate voice that can be extraordinarily moving — but only in the right mood and the right moment. Silence is a valid answer."],
    13: ["The Listener", "g", "People tell you things they tell no one else. You are a keeper of stories and secrets, and direction emerges from what you hear."],
    14: ["Power Skills", "sacral", "Life-force directed at work that carries real meaning. Resources tend to gather around what you genuinely respond to."],
    15: ["Extremes", "g", "A wide, irregular rhythm and a love of humanity in all its variety. Your inconsistency is the pattern — don't let anyone standardise it."],
    16: ["Skills", "throat", "Enthusiasm that leaps into experimentation. Mastery comes from repetition and practice, not from the initial burst of excitement."],
    17: ["Opinions", "ajna", "A mind that forms strong opinions and wants to voice them. Opinions here are potential answers awaiting proof — most useful when shared on request."],
    18: ["Correction", "spleen", "An instinct for what is off-pattern and how it could be improved. Aimed well it perfects things; aimed carelessly it wounds people."],
    19: ["Wanting", "root", "Sensitivity to need — your own and other people's, material and emotional. You feel what a group requires before it says so."],
    20: ["The Now", "throat", "Expression rooted in the present moment. Words arrive as awareness arrives, which is powerful when timed and jarring when forced."],
    21: ["The Hunter", "heart", "A need for control over your own territory and resources. You do badly under close supervision and well when given ownership."],
    22: ["Openness", "solarplexus", "Emotional grace and social charm that comes and goes with the wave. When the mood is right you can open almost anyone."],
    23: ["Assimilation", "throat", "The ability to explain the unusual in simple language. Said at the wrong time it sounds strange; at the right time it sounds like genius."],
    24: ["Rationalization", "ajna", "A mind that returns again and again to the same question until understanding clicks. The returning is the mechanism — it isn't rumination."],
    25: ["The Spirit of the Self", "g", "Universal love and innocence — a capacity to care without needing a personal reason. It matures through being tested."],
    26: ["The Egoist", "heart", "Persuasion, memory and the ability to make a case. Integrity is the whole issue here: the same gift either sells truth or sells fiction."],
    27: ["Caring", "sacral", "The energy to nourish and take responsibility for others. The line to watch is between care and over-care."],
    28: ["The Game Player", "spleen", "The search for meaning through challenge and risk. You'd rather struggle toward something that matters than coast through something that doesn't."],
    29: ["Saying Yes", "sacral", "The power to commit and see it through. Because the yes is so strong, it should only ever be given in response — never out of obligation."],
    30: ["Recognition of Feelings", "solarplexus", "Desire, yearning and emotional intensity that fuels new experience. Feelings here are fuel to feel, not instructions to act on."],
    31: ["Influence", "throat", "A voice others follow. The influence is only healthy when you've actually been elected or asked — leading uninvited exhausts everyone."],
    32: ["Continuity", "spleen", "An instinct for what has staying power and what doesn't. It protects ambition from investing in the wrong thing."],
    33: ["Privacy", "throat", "The need to retreat, digest experience, and later tell the story. Your withdrawal is how the lesson gets made into something shareable."],
    34: ["Power", "sacral", "Pure, independent life-force. It works best when busy with your own thing rather than being borrowed by everyone else."],
    35: ["Change", "throat", "A hunger for new experience and progress. Once something is tasted the appetite moves on — the risk is collecting experiences without digesting them."],
    36: ["Crisis", "solarplexus", "Emotional intensity that brings turbulence and growth. Jumping into new experience unprepared is the pattern to slow down."],
    37: ["Friendship", "solarplexus", "Warmth, family and the bargains that hold a community together. Agreements need to be spoken aloud, not assumed."],
    38: ["The Fighter", "root", "Stubborn energy for a fight worth having. Purpose comes from opposition — the task is picking battles that deserve you."],
    39: ["Provocation", "root", "A knack for poking at people until their true feelings surface. Provocative by nature, valuable when aimed with care."],
    40: ["Aloneness", "heart", "Work hard, then withdraw and recover. The retreat is not rejection of anyone; it's how the willpower recharges."],
    41: ["Contraction", "root", "The starting pressure of all new experience — fantasy, daydream and hunger for something not yet lived. Feel it fully before acting."],
    42: ["Growth", "sacral", "The energy to see cycles through to completion. Beginnings need finishing here, even when the middle is unglamorous."],
    43: ["Insight", "ajna", "Sudden inner knowing that arrives whole and is hard to explain. It sounds odd until the listener is ready for it."],
    44: ["Alertness", "spleen", "Instinctive read of people and their patterns — an almost physical memory of who someone is. Trust the first impression."],
    45: ["The Gatherer", "throat", "The voice of ownership and stewardship over a group's resources. Natural authority, provided it is legitimately given."],
    46: ["Determination", "g", "Love of the body and being in the right place at the right time. Success here is embodiment rather than effort."],
    47: ["Realization", "ajna", "A mind that sifts through past confusion until meaning surfaces. Not every memory yields an answer, and that's survivable."],
    48: ["Depth", "spleen", "A deep well of instinctive knowledge, paired with a fear of inadequacy. The depth is real; the fear rarely is."],
    49: ["Principles", "solarplexus", "Sensitivity to whether a relationship's principles still hold. Revolution and rejection live here — make sure the break is real, not moody."],
    50: ["Values", "spleen", "Guardianship of values and responsibility for the group. You feel accountable for others' wellbeing, sometimes more than is yours to carry."],
    51: ["Shock", "heart", "Competitive courage and the ability to be shocked awake. You go first where others hesitate."],
    52: ["Stillness", "root", "Pressure to be still and concentrate. Sitting with it produces focus; resisting it produces restlessness."],
    53: ["Beginnings", "root", "Pressure to start new cycles. You are built to begin — not necessarily to finish everything you start."],
    54: ["Ambition", "root", "Drive to rise, materially and spiritually. Ambition needs recognition from above to go anywhere."],
    55: ["Spirit", "solarplexus", "Emotional abundance, melancholy and moods that swing without reason. Your spirit is your own — no one else gets to set it."],
    56: ["Stimulation", "throat", "The storyteller. You connect ideas through narrative and keep people interested in possibility."],
    57: ["Intuitive Clarity", "spleen", "Acute intuition, especially through hearing — a clear knowing in the present moment. It speaks once, softly."],
    58: ["Vitality", "root", "Joy as a life-force pressure, and the urge to improve things. The vitality is real; the criticism needs an invitation."],
    59: ["Sexuality", "sacral", "The energy to break down barriers and create real intimacy. Defences come down here — choose carefully with whom."],
    60: ["Acceptance", "root", "Limitation as the doorway to mutation. Accepting what can't be changed is what releases what can."],
    61: ["Inner Truth", "head", "Pressure to know the unknowable. Mystical insight and mental pressure are the same force here — it's inspiration, not a problem to solve."],
    62: ["Detail", "throat", "Naming, ordering and organising facts into something practical and communicable. Detail is how you make the abstract usable."],
    63: ["Doubt", "head", "Pressure to question whether a pattern actually holds up. Healthy scepticism — turned inward on yourself it becomes corrosive."],
    64: ["Confusion", "head", "A mind flooded with images from the past looking for a pattern. The confusion is the process; meaning arrives when it's ready."]
};

/* =====================================================================
   4 · CHANNEL LIBRARY — all 36, with circuitry
   ===================================================================== */

const CHANNEL_META = {
    "1-8":   { name: "Inspiration",      circuit: "Individual · Knowing",     blurb: "Creative contribution that needs recognition to land. You are here to be an example, not to explain yourself." },
    "2-14":  { name: "The Beat",         circuit: "Individual · Knowing",     blurb: "Direction powered by consistent life-force. You keep your own beat, and resources follow it." },
    "3-60":  { name: "Mutation",         circuit: "Individual · Knowing",     blurb: "Pressure that innovates through limitation. Change here is pulsed and unpredictable — it can't be scheduled." },
    "4-63":  { name: "Logic",            circuit: "Collective · Understanding", blurb: "Doubt refined into patterns that can be trusted. You test whether something actually holds up over time." },
    "5-15":  { name: "Rhythm",           circuit: "Collective · Understanding", blurb: "Natural timing and flow with life's cycles. Your routine is not rigidity — it's how you stay in rhythm." },
    "6-59":  { name: "Intimacy",         circuit: "Tribal · Defense",         blurb: "Emotional bonding and fertile connection. You can dissolve barriers between people, on your wave's timing." },
    "7-31":  { name: "The Alpha",        circuit: "Collective · Understanding", blurb: "Leadership for the good of the collective — legitimate only when you've been asked to lead." },
    "9-52":  { name: "Concentration",    circuit: "Collective · Understanding", blurb: "Focused determination and stillness to complete. Sustained attention is your unusual advantage." },
    "10-20": { name: "Awakening",        circuit: "Individual · Integration",  blurb: "Embodied self-expression in the now. Being yourself out loud is the entire design." },
    "10-34": { name: "Exploration",      circuit: "Individual · Integration",  blurb: "Following what is correct for your own conviction, regardless of who approves." },
    "10-57": { name: "Perfected Form",   circuit: "Individual · Integration",  blurb: "Instinctive alignment with survival and beauty. The body knows how to be in the world." },
    "11-56": { name: "Curiosity",        circuit: "Collective · Sensing",      blurb: "Ideas seeking stimulation and storytelling. You carry ideas to share, not necessarily to live out." },
    "12-22": { name: "Openness",         circuit: "Individual · Knowing",      blurb: "Social timing and emotional expression. In the right mood you are deeply moving; in the wrong one, silent." },
    "13-33": { name: "The Prodigal",     circuit: "Collective · Sensing",      blurb: "Witnessing and sharing the story of experience. People confide in you and you carry the record." },
    "16-48": { name: "The Wavelength",   circuit: "Collective · Understanding", blurb: "Skill refined through depth and practice. Talent becomes mastery through repetition." },
    "17-62": { name: "Acceptance",       circuit: "Collective · Understanding", blurb: "Opinions organized into clear, practical detail. You turn a point of view into something people can actually use." },
    "18-58": { name: "Judgment",         circuit: "Collective · Understanding", blurb: "Correction in service of joy and better standards. Welcome when invited, painful when not." },
    "19-49": { name: "Synthesis",        circuit: "Tribal · Defense",          blurb: "Sensitivity to needs and principles of belonging. You feel what a group requires to stay together." },
    "20-34": { name: "Charisma",         circuit: "Individual · Integration",  blurb: "Busy life-force expressed in the present. Doing and saying converge into presence." },
    "20-57": { name: "The Brain Wave",   circuit: "Individual · Integration",  blurb: "Instinctive awareness spoken in the moment. You know, and it comes out of your mouth." },
    "21-45": { name: "Money",            circuit: "Tribal · Ego",              blurb: "Control and distribution of material resources. Natural stewardship of what a group owns." },
    "23-43": { name: "Structuring",      circuit: "Individual · Knowing",      blurb: "Unique insight that needs simple explanation. Genius or gibberish depending entirely on timing." },
    "24-61": { name: "Awareness",        circuit: "Individual · Knowing",      blurb: "Mental pressure resolving into knowing. The mind circles a question until insight arrives on its own." },
    "25-51": { name: "Initiation",       circuit: "Individual · Centering",    blurb: "Competitive shock that wakes the spirit. You are initiated through the unexpected." },
    "26-44": { name: "Surrender",        circuit: "Tribal · Ego",              blurb: "Transmitter of patterns, sales, and memory. You remember what worked and can sell it." },
    "27-50": { name: "Preservation",     circuit: "Tribal · Defense",          blurb: "Care, values, and responsibility for others. The channel of the guardian." },
    "28-38": { name: "Struggle",         circuit: "Individual · Knowing",      blurb: "Finding purpose through meaningful challenge. Struggle isn't the problem — a pointless struggle is." },
    "29-46": { name: "Discovery",        circuit: "Collective · Sensing",      blurb: "Saying yes to the experience of the body in life. Commitment leads to discovery you couldn't have planned." },
    "30-41": { name: "Recognition",      circuit: "Collective · Sensing",      blurb: "Feeling and hunger that start new experiences. Desire builds as fantasy long before it becomes action." },
    "32-54": { name: "Transformation",   circuit: "Tribal · Ego",              blurb: "Ambition tempered by instinct for what endures. Drive plus a filter for what's actually worth building." },
    "34-57": { name: "Power",            circuit: "Individual · Integration",  blurb: "Archetypal life-force guided by intuition. Energy and instinct moving as one." },
    "35-36": { name: "Transitoriness",   circuit: "Collective · Sensing",      blurb: "Crisis and change that expand experience. A life of many chapters, and restlessness between them." },
    "37-40": { name: "Community",        circuit: "Tribal · Ego",              blurb: "Family, bargains, and emotional support structures. Agreements need to be explicit." },
    "39-55": { name: "Emoting",          circuit: "Individual · Knowing",      blurb: "Spirit and mood that provoke emotional truth. Your moods are creative material, not malfunctions." },
    "42-53": { name: "Maturation",       circuit: "Collective · Sensing",      blurb: "Cycles that begin, develop, and complete. Things take the time they take." },
    "47-64": { name: "Abstraction",      circuit: "Collective · Sensing",      blurb: "Mental pressure making sense of the past. Confusion sorts itself into meaning if you stop forcing it." }
};

/* =====================================================================
   5 · TYPE, AUTHORITY, PROFILE, DEFINITION LIBRARIES
   ===================================================================== */

const TYPE_META = {
    "Generator": {
        aura: "Open & Enveloping",
        population: "Approx. 37% of population",
        strategy: "Respond",
        signature: "Satisfaction",
        notSelf: "Frustration",
        description: "You carry a generative engine that renews itself every day. Life is designed to come to you first — your gut responds, and that response is more reliable than any plan your mind makes. Work you genuinely respond to leaves you tired and satisfied; work you talked yourself into leaves you frustrated and drained.",
        strategyDetail: "Wait for something to respond to rather than initiating from scratch. Ask yourself yes/no questions out loud and listen for the gut sound before the explanation arrives."
    },
    "Manifesting Generator": {
        aura: "Open & Enveloping",
        population: "Approx. 33% of population",
        strategy: "Respond, then inform",
        signature: "Satisfaction & Peace",
        notSelf: "Frustration & Anger",
        description: "You respond like a Generator but move like a Manifestor — fast, multi-directional, and prone to skipping steps. Skipping steps is not a flaw; going back for the ones that actually mattered is part of your process. Doing several things at once is correct for you.",
        strategyDetail: "Respond first, then tell the people affected before you move. Informing removes the resistance your speed would otherwise create."
    },
    "Projector": {
        aura: "Focused & Absorbing",
        population: "Approx. 20% of population",
        strategy: "Wait for the invitation",
        signature: "Success",
        notSelf: "Bitterness",
        description: "Your gift is awareness rather than endless motor capacity. You are built to see systems and people clearly and to guide the energy of others — not to generate continuous energy yourself. That means your rhythm needs real spaciousness, and your insight only lands where it has been genuinely recognised.",
        strategyDetail: "Wait to be recognised and invited for the big things — work, relationships, where you live. Outside those, study what genuinely interests you; mastery is what makes you recognisable in the first place."
    },
    "Manifestor": {
        aura: "Closed & Repelling",
        population: "Approx. 9% of population",
        strategy: "Inform before you act",
        signature: "Peace",
        notSelf: "Anger",
        description: "You are here to initiate — to start things that would not otherwise exist. Your aura is closed, which means people sense impact before they sense you, and they resist what they didn't see coming. Your independence is not negotiable, and it isn't rudeness.",
        strategyDetail: "Tell the people your action will affect before you act, not to ask permission but to remove resistance. Then move, and rest deeply afterwards."
    },
    "Reflector": {
        aura: "Resistant & Sampling",
        population: "Approx. 1% of population",
        strategy: "Wait a lunar cycle",
        signature: "Surprise",
        notSelf: "Disappointment",
        description: "With no consistent definition, you sample and reflect the health of the people and places around you. You are the most environmentally sensitive design there is — who you are with and where you live matters more for you than for anyone else.",
        strategyDetail: "Give major decisions a full 28-day lunar cycle, and talk them through with a range of trusted people before committing."
    }
};

const AUTHORITY_META = {
    "Emotional": {
        label: "Emotional Solar Plexus",
        headline: "There is no truth in the now.",
        description: "Your solar plexus moves in a wave of highs, lows and flat stretches, and that wave is chemical rather than caused by events. A yes at the peak and a no at the trough are both distortions. Clarity is not a feeling — it's what's left when the wave has finished moving.",
        practice: "Sleep on it. Revisit the same question across several days and notice whether the answer stays the same regardless of mood. Never decide anything important in a spike, up or down."
    },
    "Sacral": {
        label: "Sacral Response",
        headline: "The body answers before the mind does.",
        description: "Your gut gives an immediate yes or no in the moment a question is asked — often as a sound rather than a sentence. It's always current, so a yes yesterday doesn't guarantee a yes today.",
        practice: "Have someone ask you yes/no questions out loud and listen for the first response. If your mind starts building a case, the answer already happened."
    },
    "Splenic": {
        label: "Splenic Intuition",
        headline: "It speaks once, quietly, and doesn't repeat.",
        description: "Your spleen delivers instinctive knowing in the present moment — about safety, health and timing. It is subtle and easy to talk over, and it will not argue with you.",
        practice: "Act on the first quiet impulse. If you find yourself building reasons, you've already moved past the answer into your mind."
    },
    "Ego": {
        label: "Ego / Heart Authority",
        headline: "What do I actually want?",
        description: "Your decisions run through willpower and genuine desire. If you don't truly want it, you won't sustain it — and no amount of should will fix that.",
        practice: "Listen to what you say when you speak spontaneously about the choice. 'I want' is a yes; 'I should' is a no."
    },
    "Self-Projected": {
        label: "Self-Projected Authority",
        headline: "You hear your truth when you speak it.",
        description: "Your clarity runs through identity and direction, and it becomes audible only when you talk out loud. The answer is in your own voice, not in your head.",
        practice: "Find trusted listeners who let you talk without advising. Listen back to what you said and how you said it."
    },
    "Lunar": {
        label: "Lunar Authority",
        headline: "Clarity arrives over 28 days.",
        description: "With no consistent inner definition, your reliable process is time. A full lunar cycle lets you sample a decision from every angle before you commit.",
        practice: "Take 28 days for anything significant, and discuss it with several different people along the way."
    },
    "Mental": {
        label: "Mental Projected Authority",
        headline: "Environment decides, not the mind.",
        description: "You need to talk things through out loud with trusted people — not for advice, but to hear yourself. The correct decision is strongly tied to being in the right place.",
        practice: "Talk it out with several sounding boards and pay close attention to where you feel most yourself."
    },
    "None": {
        label: "No Inner Authority",
        headline: "Clarity comes from outside the mind.",
        description: "Your process depends on environment and time rather than an internal signal.",
        practice: "Use trusted conversation and a slow timeline before committing."
    }
};

const LINE_META = {
    1: { name: "The Investigator", text: "A need for solid foundations. You research, dig and secure the ground beneath you before you feel safe to act — and the insecurity that drives it is what makes you genuinely knowledgeable." },
    2: { name: "The Hermit",       text: "Natural, innate talent that works best undisturbed. You need real time alone, and you'll be called out of it by people who see something in you that you can't see yourself." },
    3: { name: "The Martyr",       text: "Learning by trial and error. Things break, get discovered and get rebuilt — what looks like failure from outside is how you acquire knowledge no book could give you." },
    4: { name: "The Opportunist",  text: "Life moves through your network. Opportunities, work and relationships arrive through people you already know, so friendships are foundational rather than optional." },
    5: { name: "The Heretic",      text: "People project expectations onto you and expect practical solutions. When you deliver in the right moment you're seen as a saviour; when you take on projections that aren't yours, reputation suffers." },
    6: { name: "The Role Model",   text: "A life in three acts — trial and error until around 30, an observational 'roof phase' until around 50, then emerging as a lived example of what you've learned." }
};

const PROFILE_META = {
    "1/3": "Investigation paired with lived experiment. You research a thing thoroughly, then test it in real life and find out where it breaks — and that breakage is precisely how your authority gets built. Your foundation is not theoretical; it's earned.",
    "1/4": "Deep research shared through a close network. You build solid foundations and then influence people who already know and trust you. Your opportunities almost always come through relationships.",
    "2/4": "Natural talent called out by your network. You need your alone time, and the people around you will keep interrupting it to ask for the thing you do effortlessly.",
    "2/5": "Innate talent plus heavy projection. People see a saviour in you before they know you. Protect your hermit time or the expectations will consume it.",
    "3/5": "Trial and error meeting practical problem-solving. You find out what doesn't work and then offer that hard-won correction to others — provided you resist projections that aren't yours.",
    "3/6": "Experimentation in early life, observation in mid-life, wisdom afterwards. Nothing is wasted, though a lot of it feels wasted while it's happening.",
    "4/6": "A networked life that matures into being an example. Relationships carry your opportunities, and your later years carry your authority.",
    "4/1": "A fixed, foundational perspective shared through your network. You don't change direction easily, and you don't need to.",
    "5/1": "Practical solutions built on deep research. People come to you expecting answers; the research is what keeps the reputation intact.",
    "5/2": "A natural talent under constant projection. You're seen as the fixer, but you need withdrawal to keep your gift alive.",
    "6/2": "A three-act life with an innate gift held quietly at the centre. Trial and error until around 30, watching from the roof until around 50, then stepping into visible, sovereign example.",
    "6/3": "A three-act life built on experimentation. Even the observation phase keeps testing — you learn by contact, not theory."
};

const DEFINITION_META = {
    1: { name: "Single Definition",         text: "All of your defined centres are woven into one unbroken circuit. Energy and information move through you without gaps, so you process thoughts, feelings and expression self-sufficiently. You don't need another person to complete your inner conversation — which can make you seem self-contained, and makes solitude genuinely restorative." },
    2: { name: "Split Definition",          text: "Your defined centres form two separate groups with no channel between them. You are naturally wired to look for the people and circumstances that bridge the gap, which is why certain company makes you feel suddenly whole. The work is to stop treating that search as neediness — but also not to choose partners purely because they bridge you." },
    3: { name: "Triple Split Definition",   text: "Your defined centres form three unconnected groups. You typically need more than one outside connection to feel complete, and busier environments often suit you better than intimate ones. You process life differently depending on which part of your system is currently activated — that variability is the design, not a fault." },
    4: { name: "Quadruple Split Definition", text: "Your defined centres form four unconnected groups. This is rare, and it means you rely heavily on environment and relationships to bridge the parts of your design. You need real patience with your own process — things take time to connect internally, and being rushed is particularly costly for you." },
    0: { name: "No Definition",             text: "With no defined centres, you sample and reflect everything around you. Environment and company are the single biggest factors in your wellbeing." }
};

/* =====================================================================
   6 · DERIVED LOGIC
   Definition is recomputed from the channels rather than trusted, because
   an incorrect definitionCount upstream silently misreads the whole chart.
   ===================================================================== */

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

function gateCenter(gate) {
    const meta = GATE_META[Number(gate)];
    return meta ? meta[1] : null;
}

/* Union-find over defined centres, linked by the defined channels. */
function computeDefinitionCount(channels, definedCenters) {
    const centers = (definedCenters || []).map(normalizeCenterKey).filter(Boolean);
    if (!centers.length) return 0;

    const parent = {};
    centers.forEach((c) => { parent[c] = c; });

    function find(x) {
        while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
        return x;
    }
    function union(a, b) {
        if (!(a in parent) || !(b in parent)) return;
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    }

    (channels || []).forEach((c) => {
        const key = channelKey(c);
        const nums = key.split("-").map(Number);
        if (nums.length !== 2 || nums.some(isNaN)) return;
        const a = gateCenter(nums[0]);
        const b = gateCenter(nums[1]);
        if (a && b) union(a, b);
    });

    const roots = new Set(centers.map(find));
    return roots.size;
}

function getTypeMeta(type) {
    return TYPE_META[String(type || "").trim()] || null;
}

function getAuthorityMeta(authority) {
    const raw = String(authority || "").trim();
    const key = raw.replace(/\s*\(.*\)\s*$/, "").trim();
    return AUTHORITY_META[key] || AUTHORITY_META[raw] || null;
}

function profileLines(profile) {
    const nums = String(profile || "").match(/\d/g);
    if (!nums || nums.length < 2) return null;
    return { conscious: Number(nums[0]), unconscious: Number(nums[1]) };
}

/* =====================================================================
   7 · PLAIN-TEXT FORMATTERS (for your existing text elements)
   ===================================================================== */

function formatValue(value) {
    if (value === null || value === undefined || value === "") return "Not available";
    return String(value);
}

function formatCentersDetailed(definedList) {
    const definedSet = new Set((definedList || []).map(normalizeCenterKey));
    return CENTER_ORDER.map((key) => {
        const meta = CENTER_META[key];
        const isDefined = definedSet.has(key);
        const status = isDefined ? "DEFINED" : "OPEN";
        const reading = isDefined ? meta.defined : meta.open;
        return `${meta.label} — ${meta.blurb} [${status}]\n${reading}`;
    }).join("\n\n");
}

/* Same per-center description, but scoped to just the defined OR just the
   open list — used for #definedCentersResult / #openCentersResult so each
   name in those two fields carries its own interpretation instead of
   appearing as a bare comma-separated list. */
function formatCenterGroupDetailed(list, isDefinedGroup) {
    if (!list || !list.length) return "None";
    return list
        .map((key) => {
            const norm = normalizeCenterKey(key);
            const meta = CENTER_META[norm];
            if (!meta) return String(key);
            const reading = isDefinedGroup ? meta.defined : meta.open;
            return `${meta.label} — ${meta.blurb}\n${reading}`;
        })
        .join("\n\n");
}

function formatGatesDetailed(gates, definedCenters) {
    if (!gates || !gates.length) return "None";
    const definedSet = new Set((definedCenters || []).map(normalizeCenterKey));
    return gates
        .map(Number)
        .filter((g) => !isNaN(g))
        .sort((a, b) => a - b)
        .map((g) => {
            const meta = GATE_META[g];
            if (!meta) return `Gate ${g}`;
            const [name, center, text] = meta;
            const cMeta = CENTER_META[center];
            const state = definedSet.has(center) ? "defined" : "open";
            return `Gate ${g} · ${name} (${cMeta ? cMeta.label : center} · ${state})\n${text}`;
        })
        .join("\n\n");
}

function formatChannelsDetailed(channels) {
    if (!channels || !channels.length) return "None";
    return channels
        .map((c) => {
            const key = channelKey(c);
            const meta = CHANNEL_META[key];
            if (!meta) return `Channel ${key}`;
            const gates = key.split("-").map(Number);
            const ends = gates.map((g) => {
                const gm = GATE_META[g];
                return gm ? `Gate ${g} ${gm[0]}` : `Gate ${g}`;
            }).join(" ↔ ");
            return `${meta.name} (${key}) — ${meta.circuit}\n${ends}\n${meta.blurb}`;
        })
        .filter(Boolean)
        .join("\n\n");
}

/* =====================================================================
   8 · HTML FORMATTERS (optional rich rendering, styled to the reference)
   Add Text elements set to accept HTML, with these IDs:
   #centersHtml  #gatesHtml  #channelsHtml  #profileHtml  #typeHtml
   ===================================================================== */

const CSS = {
    label: "font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#B08C57;",
    title: "font-family:Georgia,serif;font-size:19px;color:#3B3229;margin:2px 0 4px;",
    body: "font-size:14px;line-height:1.65;color:#6B6055;margin:0;",
    tagOn: "font-size:10px;letter-spacing:.1em;padding:2px 8px;border-radius:99px;background:#EADCC6;color:#8A6A3B;",
    tagOff: "font-size:10px;letter-spacing:.1em;padding:2px 8px;border-radius:99px;background:#F1EDE6;color:#9A9086;",
    card: "border:1px solid #EDE4D6;border-radius:14px;padding:16px 18px;margin-bottom:12px;background:#FFFDFA;"
};

function centersHtml(definedList) {
    const definedSet = new Set((definedList || []).map(normalizeCenterKey));
    const rows = CENTER_ORDER.map((key) => {
        const meta = CENTER_META[key];
        const on = definedSet.has(key);
        return `<div style="${CSS.card}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <span style="${CSS.title}">${esc(meta.label)}</span>
        <span style="${on ? CSS.tagOn : CSS.tagOff}">${on ? "DEFINED" : "OPEN"}</span>
      </div>
      <div style="${CSS.label}">${esc(meta.blurb)}</div>
      <p style="${CSS.body}margin-top:8px;">${esc(on ? meta.defined : meta.open)}</p>
    </div>`;
    }).join("");
    return `<div>${rows}</div>`;
}

function gatesHtml(gates, definedCenters) {
    if (!gates || !gates.length) return "<p>No activated gates found.</p>";
    const definedSet = new Set((definedCenters || []).map(normalizeCenterKey));
    const rows = gates
        .map(Number).filter((g) => !isNaN(g)).sort((a, b) => a - b)
        .map((g) => {
            const meta = GATE_META[g];
            if (!meta) return "";
            const [name, center, text] = meta;
            const cMeta = CENTER_META[center];
            const on = definedSet.has(center);
            return `<div style="${CSS.card}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <span style="${CSS.label}">Gate ${g}</span>
          <span style="${on ? CSS.tagOn : CSS.tagOff}">${esc(cMeta ? cMeta.label : center)}</span>
        </div>
        <div style="${CSS.title}">${esc(name)}</div>
        <p style="${CSS.body}">${esc(text)}</p>
      </div>`;
        }).join("");
    return `<div>${rows}</div>`;
}

function channelsHtml(channels) {
    if (!channels || !channels.length) return "<p>No full channels found.</p>";
    const rows = channels.map((c) => {
        const key = channelKey(c);
        const meta = CHANNEL_META[key];
        if (!meta) return "";
        const ends = key.split("-").map(Number).map((g) => {
            const gm = GATE_META[g];
            return `Gate ${g} · ${gm ? gm[0] : ""}`;
        }).join(" &nbsp;↔&nbsp; ");
        return `<div style="${CSS.card}">
      <div style="${CSS.label}">${esc(meta.circuit)}</div>
      <div style="${CSS.title}">${esc(meta.name)} (${esc(key)})</div>
      <div style="font-size:12px;color:#9A8C78;margin-bottom:6px;">${ends}</div>
      <p style="${CSS.body}">${esc(meta.blurb)}</p>
    </div>`;
    }).join("");
    return `<div>${rows}</div>`;
}

function profileHtml(profile) {
    const lines = profileLines(profile);
    if (!lines) return "";
    const c = LINE_META[lines.conscious];
    const u = LINE_META[lines.unconscious];
    if (!c || !u) return "";
    return `<div>
    <div style="${CSS.card}">
      <div style="${CSS.label}">Personality (conscious)</div>
      <div style="${CSS.title}">Line ${lines.conscious}: ${esc(c.name)}</div>
      <p style="${CSS.body}">${esc(c.text)}</p>
    </div>
    <div style="${CSS.card}">
      <div style="${CSS.label}">Design (unconscious)</div>
      <div style="${CSS.title}">Line ${lines.unconscious}: ${esc(u.name)}</div>
      <p style="${CSS.body}">${esc(u.text)}</p>
    </div>
  </div>`;
}

/* =====================================================================
   9 · DESCRIPTION GETTERS (kept as named functions for your existing code)
   ===================================================================== */

function getTypeDescription(type) {
    const meta = getTypeMeta(type);
    return meta ? meta.description : "Your Type describes the fundamental way your energy interacts with life.";
}

function getAuthorityDescription(authority) {
    const meta = getAuthorityMeta(authority);
    if (!meta) return "Your Authority describes the inner process through which you make decisions that are correct for you.";
    return `${meta.headline} ${meta.description}`;
}

function getProfileDescription(profile) {
    const key = String(profile || "").trim();
    const base = PROFILE_META[key];
    const lines = profileLines(key);
    if (!lines) return "Your Profile could not be determined.";
    const c = LINE_META[lines.conscious];
    const u = LINE_META[lines.unconscious];
    const name = c && u ? `${key} · The ${c.name.replace("The ", "")} ${u.name.replace("The ", "")}` : key;
    const body = base || "Your Profile is the two-line combination that shapes how you learn, relate and move through life.";
    return `${name}. ${body}`;
}

function getDefinition(count) {
    const meta = DEFINITION_META[count];
    return meta ? meta.name : "Not available";
}

function getDefinitionDescription(count) {
    const meta = DEFINITION_META[count];
    return meta ? meta.text : "Your Definition describes how the defined centres in your chart connect to each other.";
}

/* =====================================================================
   10 · PAGE READY
   ===================================================================== */

$w.onReady(function () {
    // The chart lives in the visitor's browser session, which doesn't exist
    // during server-side rendering. Rendering in the browser only also stops
    // "No chart available" flashing up before the real chart.
    if (wixWindowFrontend.rendering.env !== "browser") return;

    const chart = readStoredChart();
    try {
        if (chart) {
            // Hook up the bodygraph first so its handshake runs while the text renders.
            connectBodygraph(chart);
            renderChart(chart);
        } else {
            showNoChart();
        }
    } catch (error) {
        console.error("Could not render the chart:", error);
        showNoChart();
    } finally {
        hideOverlay();
    }
});

function readStoredChart() {
    try {
        const stored = session.getItem(CHART_STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        console.error("Could not read the stored chart:", error);
        return null;
    }
}

function renderChart(chart) {
    const definedCenters = chart.definedCenters || [];
    const openCenters = chart.openCenters || [];
    const channels = chart.definedChannels || chart.channels || [];
    const gates = [...new Set((chart.activatedGates || chart.gates || []).map(Number))];
    const ownerName = getOwnerName(chart);
    const detailLine = getChartDetailLine(chart);

    /* ---------- HEADER / META ---------- */
    safeText("#ChartOwner", ownerName);
    safeText("#Chartdetail", detailLine);

    /* ---------- TYPE ---------- */
    const typeMeta = getTypeMeta(chart.type);
    safeText("#typeTitle", "TYPE");
    safeText("#typeResult", formatValue(chart.type));
    safeText("#typeDescription", getTypeDescription(chart.type));
    safeText("#typeAura", typeMeta ? typeMeta.aura : "");
    safeText("#typePopulation", typeMeta ? typeMeta.population : "");

    /* ---------- STRATEGY · SIGNATURE · NOT-SELF ---------- */
    safeText("#strategyTitle", "STRATEGY");
    safeText("#strategyResult", typeMeta ? typeMeta.strategy : "Not available");
    safeText("#strategyDescription", typeMeta ? typeMeta.strategyDetail : "");
    safeText("#signatureResult", typeMeta ? typeMeta.signature : "");
    safeText("#signatureDescription", typeMeta ? `When you follow your strategy, life feels like ${typeMeta.signature.toLowerCase()}.` : "");
    safeText("#notSelfResult", typeMeta ? typeMeta.notSelf : "");
    safeText("#notSelfDescription", typeMeta ? `${typeMeta.notSelf} is the alarm bell — it means you've moved against your design, not that something is wrong with you.` : "");

    /* ---------- AUTHORITY ---------- */
    const authMeta = getAuthorityMeta(chart.authority);
    safeText("#authorityTitle", "AUTHORITY");
    safeText("#authorityResult", authMeta ? authMeta.label : formatValue(chart.authority));
    safeText("#authorityDescription", getAuthorityDescription(chart.authority));
    safeText("#authorityPractice", authMeta ? authMeta.practice : "");

    /* ---------- PROFILE ---------- */
    safeText("#profileTitle", "PROFILE");
    safeText("#profileResult", formatValue(chart.profile));
    safeText("#profileDescription", getProfileDescription(chart.profile));
    const pl = profileLines(chart.profile);
    if (pl && LINE_META[pl.conscious] && LINE_META[pl.unconscious]) {
        safeText("#profileLine1Title", `Line ${pl.conscious}: ${LINE_META[pl.conscious].name}`);
        safeText("#profileLine1Description", LINE_META[pl.conscious].text);
        safeText("#profileLine2Title", `Line ${pl.unconscious}: ${LINE_META[pl.unconscious].name}`);
        safeText("#profileLine2Description", LINE_META[pl.unconscious].text);
    }
    safeHtml("#profileHtml", () => profileHtml(chart.profile));

    /* ---------- DEFINITION (recomputed from the channels) ---------- */
    let definitionCount = computeDefinitionCount(channels, definedCenters);
    if (!definitionCount && typeof chart.definitionCount === "number") {
        definitionCount = chart.definitionCount;
    }
    safeText("#definitionTitle", "DEFINITION");
    safeText("#definitionResult", getDefinition(definitionCount));
    safeText("#definitionDescription", getDefinitionDescription(definitionCount));
    safeText("#splitPoints", definitionCount <= 1 ? "0 (Direct)" : String(definitionCount - 1));

    /* ---------- CENTRES ---------- */
    const definedKeys = new Set(definedCenters.map(normalizeCenterKey));
    const openList = openCenters.length ? openCenters : CENTER_ORDER.filter((c) => !definedKeys.has(c));

    safeText("#definedCentersTitle", "DEFINED CENTERS");
    safeText("#definedCentersResult", () => formatCenterGroupDetailed(definedCenters, true));
    safeText("#definedCentersCount", `${definedCenters.length} / 9`);
    safeText("#openCentersTitle", "OPEN CENTERS");
    safeText("#openCentersResult", () => formatCenterGroupDetailed(openList, false));
    safeText("#openCentersCount", `${9 - definedCenters.length} / 9`);
    safeText("#centersDetailed", () => formatCentersDetailed(definedCenters));
    safeHtml("#centersHtml", () => centersHtml(definedCenters));

    /* ---------- CHANNELS ---------- */
    safeText("#channelsTitle", "CHANNELS");
    safeText("#channelsCount", String(channels.length));
    safeText("#channelsResult", () => formatChannelsDetailed(channels));
    safeHtml("#channelsHtml", () => channelsHtml(channels));

    /* ---------- GATES ---------- */
    safeText("#gatesTitle", "GATES");
    safeText("#gatesCount", String(gates.length));
    safeText("#gatesResult", () => formatGatesDetailed(gates, definedCenters));
    safeHtml("#gatesHtml", () => gatesHtml(gates, definedCenters));

    /* ---------- DOWNLOAD PDF BUTTON ---------- */
    wirePdfDownload({
        ...chart,
        definedCenters,
        activatedGates: gates,
        definedChannels: channels,
        _ownerName: ownerName,
        _detailLine: detailLine,
        _definitionCount: definitionCount
    });
}

/* =====================================================================
   11 · DOWNLOAD PDF BUTTON
   The backend returns the PDF as base64; the hidden #downloadHelper HTML
   element turns it into a file download (page code has no DOM access,
   same reason the bodygraph uses postMessage). The PDF is built once per
   visit and starts building as soon as the mouse is over the button.
   ===================================================================== */

function wirePdfDownload(chartPayload) {
    const btn = findElement("#downloadPdfChartButton", "onClick"); // confirm this matches your button's actual ID
    if (!btn) return;

    const helper = findElement("#downloadHelper", "postMessage");
    const originalLabel = btn.label;
    let helperReady = false;
    let pendingFile = null;
    let pdfRequest = null;

    if (helper) {
        helper.onMessage((event) => {
            const type = event.data && event.data.type;
            if (type === "downloadHelperReady") {
                helperReady = true;
                if (pendingFile) {
                    helper.postMessage(pendingFile);
                    pendingFile = null;
                }
            } else if (type === "downloadError") {
                console.error("Download failed:", event.data.message);
                if ("label" in btn) btn.label = "Download failed – try again";
            }
        });
        // The helper announces itself on load; this covers it loading first.
        helper.postMessage({ type: "downloadHelperPing" });
    }

    const requestPdf = () => {
        if (!pdfRequest) {
            pdfRequest = generateChartPdf(chartPayload).then(
                (result) => {
                    if (!result || !result.success) pdfRequest = null; // allow a retry
                    return result;
                },
                (error) => {
                    pdfRequest = null;
                    throw error;
                }
            );
        }
        return pdfRequest;
    };

    if (typeof btn.onMouseIn === "function") {
        btn.onMouseIn(() => { requestPdf().catch(() => {}); });
    }

    btn.onClick(async () => {
        if (!helper) {
            console.error("Add the #downloadHelper HTML element to this page to enable PDF downloads.");
            return;
        }
        try {
            if ("label" in btn) btn.label = "Preparing your PDF…";
            btn.disable();

            const result = await requestPdf();
            if (result && result.success && result.base64) {
                const file = { type: "downloadFile", base64: result.base64, fileName: result.fileName };
                if (helperReady) {
                    helper.postMessage(file);
                } else {
                    pendingFile = file; // sent as soon as the helper says it's ready
                    helper.postMessage({ type: "downloadHelperPing" });
                }
                if ("label" in btn) btn.label = originalLabel;
            } else {
                console.error("PDF generation failed:", result && result.error);
                if ("label" in btn) btn.label = "Download failed – try again";
            }
        } catch (err) {
            console.error("Download click error:", err);
            if ("label" in btn) btn.label = "Download failed – try again";
        } finally {
            btn.enable();
        }
    });
}

/* =====================================================================
   12 · BODYGRAPH + EMPTY STATE
   The bodygraph HTML element keeps posting "bodygraphReady" until it has
   a chart, so the page answers every ping instead of guessing with timers.
   One extra send up front covers an element that loaded before this code
   ran (and an older bodygraph HTML that stops asking after 1.5 s).
   ===================================================================== */

function connectBodygraph(chart) {
    const frame = findElement("#bodygraphImage", "postMessage");
    if (!frame) return;

    // Only what the bodygraph draws, to keep the message small.
    const message = {
        type: "renderBodygraph",
        chart: {
            activations: chart.activations,
            definedCenters: chart.definedCenters,
            definedChannels: chart.definedChannels,
            variables: chart.variables
        }
    };

    try {
        frame.onMessage((event) => {
            if (event.data && event.data.type === "bodygraphReady") frame.postMessage(message);
        });
        frame.postMessage(message);
    } catch (error) {
        console.error("BODYGRAPH ERROR:", error);
    }
}

function showNoChart() {
    const msg = "No chart available yet. Enter your birth details on the Be You page to generate your chart.";
    ["#typeResult", "#authorityResult", "#profileResult", "#definitionResult"].forEach((id) => safeText(id, "No chart available"));
    ["#typeDescription", "#authorityDescription", "#profileDescription", "#definitionDescription"].forEach((id) => safeText(id, msg));
    safeText("#centersDetailed", msg);
    safeText("#gatesResult", msg);
    safeText("#channelsResult", msg);
}
