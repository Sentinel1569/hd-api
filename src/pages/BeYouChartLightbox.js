// =====================================================================
// BE YOU CHART · LIGHTBOX — Wix Velo lightbox code (Section 2)
// Shows the Type / Authority / Profile summary and links to the full chart.
// =====================================================================

import wixWindowFrontend from "wix-window-frontend";
import wixSiteFrontend from "wix-site-frontend";
import { session } from "wix-storage-frontend";

const FULL_CHART_PATH = "/be-you-full-chart-2";
const CHART_STORAGE_KEY = "beYouHumanDesignChart";

$w.onReady(function () {
    const chart = wixWindowFrontend.lightbox.getContext() || readStoredChart();

    if (!chart) {
        console.error("No chart data in lightbox context.");
        $w("#chartIntro").text = "No chart data received.";
        return;
    }

    // Start downloading the full chart page while the visitor reads the summary.
    try {
        wixSiteFrontend.prefetchPageResources({ pages: [FULL_CHART_PATH] });
    } catch (error) {
        // Prefetching is only a speed-up.
    }

    $w("#chartIntro").text = chart.firstName
        ? `${chart.firstName}, your chart is ready!`
        : "Your chart is ready!";

    $w("#typeTitle").text = "TYPE";
    $w("#typeResult").text = formatValue(chart.type);
    $w("#typeDescription").text = getTypeDescription(chart.type);

    $w("#authorityTitle").text = "AUTHORITY";
    $w("#authorityResult").text = formatValue(chart.authority);
    $w("#authorityDescription").text = getAuthorityDescription(chart.authority);

    $w("#profileTitle").text = "PROFILE";
    $w("#profileResult").text = formatValue(chart.profile);
    $w("#profileDescription").text = getProfileDescription(chart.profile);

    $w("#viewFullChartButton").onClick(function () {
        try {
            session.setItem(CHART_STORAGE_KEY, JSON.stringify(chart));
        } catch (error) {
            console.warn("Couldn't save the chart to session storage:", error);
        }
        // The form page does the navigation once the lightbox has closed.
        wixWindowFrontend.lightbox.close({ goToFullChart: true });
    });
});

function readStoredChart() {
    try {
        const stored = session.getItem(CHART_STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        return null;
    }
}

function formatValue(value) {
    if (value === null || value === undefined || value === "") return "Not available";
    return String(value);
}

function getTypeDescription(type) {
    if (!type) return "Your Human Design Type could not be determined.";
    const descriptions = {
        Generator: "Generators are designed to respond to life and use their Sacral energy in response to what comes toward them.",
        "Manifesting Generator": "Manifesting Generators are designed to respond first and then move efficiently toward what their energy is responding to.",
        Projector: "Projectors are designed to recognize and guide energy rather than consistently generate it themselves.",
        Manifestor: "Manifestors are designed to initiate and bring new actions into motion.",
        Reflector: "Reflectors have an open and receptive design that reflects the people and environments around them."
    };
    return descriptions[type] || "Your Type describes the fundamental way your energy interacts with life.";
}

// The backend returns e.g. "Emotional (Solar Plexus)" or "Ego (Heart)", so the
// lookup uses the part before the brackets.
function getAuthorityDescription(authority) {
    if (!authority) return "Your Inner Authority could not be determined.";
    const descriptions = {
        Emotional: "Emotional Authority means clarity develops over time. Important decisions are best approached without rushing.",
        Sacral: "Sacral Authority relies on your immediate Sacral response to what life presents.",
        Splenic: "Splenic Authority is based on an intuitive awareness that operates in the present moment.",
        Ego: "Ego Authority centers decision making around your will and what you genuinely have the energy and desire to commit to.",
        "Self-Projected": "Self-Projected Authority finds clarity through expressing what feels correct when you hear yourself speak.",
        Mental: "Mental Authority finds clarity by talking decisions through with trusted people and noticing which environments feel right, rather than through an inner signal.",
        Lunar: "Lunar Authority applies to Reflectors. Major decisions benefit from observing your experience through a full lunar cycle."
    };
    const key = String(authority).replace(/\s*\(.*\)\s*$/, "").trim();
    return descriptions[key] || descriptions[authority] || "Your Authority describes the inner process through which you can make decisions that are correct for you.";
}

function getProfileDescription(profile) {
    if (!profile) return "Your Profile could not be determined.";
    return `Your ${profile} Profile describes the two-line combination that shapes how you experience yourself, relationships, learning, and life.`;
}
