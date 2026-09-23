// =====================================================================
// BE YOU · FORM PAGE — Wix Velo page code (Section 1)
// Collects the birth details, asks the backend for the chart, saves it
// for the full chart page, and opens the "BE YOU CHART" lightbox. Each
// lead, with their newsletter opt-in, is also sent on to the CRM.
// =====================================================================

import wixWindowFrontend from "wix-window-frontend";
import wixSiteFrontend from "wix-site-frontend";
import wixLocationFrontend from "wix-location-frontend";
import { session } from "wix-storage-frontend";
import { generateHumanDesignChart, sendLeadToCrm, warmUp } from "backend/humanDesign.web";

// Flip to true only while debugging.
const DEBUG = false;

const LIGHTBOX_NAME = "BE YOU CHART";
const FULL_CHART_PATH = "/be-you-full-chart";
const CHART_STORAGE_KEY = "beYouHumanDesignChart";
// The newsletter tick box. Keep it unticked by default and not required.
const OPT_IN_CHECKBOX = "#Opt-in";
// Set to false if visitors with a single name should be able to submit.
const LAST_NAME_REQUIRED = true;

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const pad = (n) => String(n).padStart(2, "0");

let generating = false;
let buttonLabel = "";

$w.onReady(function () {
    $w("#chartResult").hide();
    buttonLabel = $w("#generateChartButton").label;
    $w("#generateChartButton").onClick(generateChart);

    // onReady also runs during server-side rendering; these only help in the browser.
    if (wixWindowFrontend.rendering.env === "browser") {
        // Start the chart engine on the server while the visitor is still typing,
        // so their click doesn't wait for a cold start.
        warmUp().catch(() => {});
        // Download the lightbox and full chart page ahead of time.
        try {
            wixSiteFrontend.prefetchPageResources({ lightboxes: [LIGHTBOX_NAME], pages: [FULL_CHART_PATH] });
        } catch (error) {
            if (DEBUG) console.warn("Prefetch skipped:", error);
        }
    }
});

async function generateChart() {
    if (generating) return;

    const firstName = textValue("#firstNameInput");
    const lastName = textValue("#lastNameInput");
    const email = textValue("#emailInput");
    const birthDate = $w("#birthDateInput").value;
    const birthTime = $w("#birthTimeInput").value;
    const birthPlace = $w("#birthPlaceInput").value;
    const newsletterOptIn = isOptedIn();

    if (!firstName || (LAST_NAME_REQUIRED && !lastName) || !email || !birthDate || !birthTime || !birthPlace) {
        showMessage("Please complete all fields before generating your chart.");
        return;
    }
    if (!EMAIL_RE.test(email)) {
        showMessage("Please enter a valid email address.");
        return;
    }

    const lat = birthPlace.location?.latitude;
    const lng = birthPlace.location?.longitude;
    if (lat == null || lng == null) {
        showMessage("Please select your birth location from the address suggestions.");
        return;
    }

    const date = toIsoDate(birthDate);
    if (!date) {
        showMessage("Please enter a valid birth date.");
        return;
    }
    const time = to24HourTime(birthTime);
    if (!time) {
        showMessage("Please enter a valid birth time.");
        return;
    }

    setGenerating(true);
    showMessage("Generating your Human Design chart…");

    try {
        const response = await generateHumanDesignChart({
            firstName,
            lastName,
            email,
            date,
            time,
            lat,
            lng,
            birthPlace: birthPlace.formatted || [birthPlace.city, birthPlace.country].filter(Boolean).join(", ")
        });

        if (!response?.success || !response.chart) {
            showMessage(response?.error || "We couldn't generate your chart. Please try again.");
            return;
        }

        const chart = response.chart;
        if (DEBUG) console.log("Chart:", chart);

        // Not awaited, so the visitor never waits on the CRM to see their chart.
        sendLeadToCrm({
            firstName: chart.firstName,
            lastName: chart.lastName,
            email: chart.email,
            newsletterOptIn,
            birthDate: chart.birthDate,
            birthTime: chart.birthTime,
            birthPlace: chart.birthPlace,
            hdType: chart.type,
            hdAuthority: chart.authority,
            hdProfile: chart.profile
        }).catch((error) => console.warn("Couldn't send the lead to the CRM:", error));

        // Saved here as well as in the lightbox, so the full chart page still
        // works if the visitor closes the lightbox and goes there another way.
        try {
            session.setItem(CHART_STORAGE_KEY, JSON.stringify(chart));
        } catch (error) {
            console.warn("Couldn't save the chart to session storage:", error);
        }

        $w("#chartResult").hide();
        setGenerating(false);
        // The lightbox closes with { goToFullChart: true } when its button is
        // clicked; navigating from here is reliable, whereas code inside a
        // closing lightbox can be stopped before it navigates.
        const result = await wixWindowFrontend.openLightbox(LIGHTBOX_NAME, chart);
        if (result && result.goToFullChart) wixLocationFrontend.to(FULL_CHART_PATH);
    } catch (error) {
        console.error("Chart request failed:", error);
        showMessage("Something went wrong while generating your chart. Please try again.");
    } finally {
        setGenerating(false);
    }
}

function textValue(selector) {
    const value = $w(selector).value;
    return typeof value === "string" ? value.trim() : "";
}

// Unticked, renamed or missing all mean "no", so the tick box can never stop a
// chart from generating. A Checkbox reports .checked; a Checkbox Group's .value
// lists its ticked options.
function isOptedIn() {
    try {
        const box = $w(OPT_IN_CHECKBOX);
        return Array.isArray(box.value) ? box.value.length > 0 : box.checked === true;
    } catch (error) {
        return false;
    }
}

// The Date Picker returns a Date at local midnight; read the local parts so
// the day never shifts with the visitor's time zone.
function toIsoDate(value) {
    if (value && typeof value.getFullYear === "function") {
        return isNaN(value.getTime())
            ? null
            : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value || "").trim());
    return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : null;
}

// The Time Picker returns "HH:mm:ss.SSS"; a text input might hold "7:09 PM".
// Either way the backend gets 24-hour "HH:mm".
function to24HourTime(value) {
    const raw = String(value || "").trim();

    const twelveHour = /^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i.exec(raw);
    if (twelveHour) {
        const hour = Number(twelveHour[1]);
        if (hour < 1 || hour > 12 || Number(twelveHour[2]) > 59) return null;
        const isPm = twelveHour[3].toUpperCase() === "P";
        return `${pad((hour % 12) + (isPm ? 12 : 0))}:${twelveHour[2]}`;
    }

    const twentyFourHour = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(raw);
    if (!twentyFourHour || Number(twentyFourHour[1]) > 23 || Number(twentyFourHour[2]) > 59) return null;
    return `${pad(twentyFourHour[1])}:${twentyFourHour[2]}`;
}

function showMessage(text) {
    const status = $w("#chartResult");
    status.text = text;
    status.show();
}

// Disabling the button stops double clicks from sending duplicate requests.
function setGenerating(on) {
    generating = on;
    const button = $w("#generateChartButton");
    if (buttonLabel) button.label = on ? "Generating…" : buttonLabel;
    if (on) button.disable();
    else button.enable();
}
