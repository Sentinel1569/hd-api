# BE YOU · Human Design calculator (Wix Velo)

Copy each file's full contents into the matching place in the Wix editor, replacing what is there.

| Section | File | Paste into |
|---|---|---|
| 1 · Form | `src/pages/BeYouForm.js` | Page code of the form page |
| 2 · Lightbox | `src/pages/BeYouChartLightbox.js` | Code of the **BE YOU CHART** lightbox |
| 3 · Full chart | `src/pages/BeYouFullChart.js` | Page code of `/be-you-full-chart-2` |
| 4 · Backend | `src/backend/humanDesign.web.js` | `backend/humanDesign.web.js` |
| PDF backend | `src/backend/chartPdf.web.js` | `backend/chartPdf.web.js` (new file; delete the old `chartPdf.jsw`) |
| 5 · Bodygraph | `src/embeds/BeYouBodygraph.html` | The `#bodygraphImage` HTML embed (Code option) |
| Download helper | `src/embeds/DownloadHelper.html` | An HTML embed with ID `#downloadHelper` on the full chart page |

npm packages: `free-human-design`, `tz-lookup` and `pdf-lib`.

## Editor settings

- **Form page:** the last name input must have the ID `#lastNameInput`. Tick *Hidden on load* for `#chartResult` so it never flashes on page load.
- **Full chart page:** leave `#loadingOverlay` visible on load. The page code hides it once the chart is filled in, so visitors never see placeholder text.
- **Download helper:** make `#downloadHelper` tiny (e.g. 10 × 10 px) but not hidden or collapsed on load, or Wix may never load it.
- **Last name optional?** Set `LAST_NAME_REQUIRED = false` at the top of `BeYouForm.js`.

## Data flow

1. The form sends first name, last name, email, date, time, place and coordinates to `generateHumanDesignChart()`.
2. The backend returns one chart object with the cleaned-up names (`firstName`, `lastName`, `fullName`), `email`, birth details, type/authority/profile, centers, channels, gates, activations, variables, Gene Keys and astrology.
3. The form saves that object in session storage (`beYouHumanDesignChart`) and passes it to the lightbox.
4. The full chart page reads the object, fills in the text and sends the bodygraph only the four fields it draws. The PDF button sends the whole chart plus `_ownerName` (now the full name), `_detailLine` and `_definitionCount` to `generateChartPdf()`, which returns the PDF as base64; `#downloadHelper` saves it as a file.
