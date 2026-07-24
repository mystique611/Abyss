# Changelog

## 260724-v24

- **Certification history: explicit "current" selection.** The certification modal (Diver Detail) now has a "Set as Current Certification" button when adding or editing an entry. It's greyed out/forced on when it's the only certification you have (add-the-first-one or edit-the-only-one), since there always has to be exactly one current certification. Previously "current" was always just whichever entry had the most recent date — now it's a deliberate choice, with the old date-based logic kept only as a fallback for certifications saved before this existed.
- **PDF export certification default + live preview.** The certification checked by default in "Export to PDF" is now whichever one is marked current (see above) instead of the most recent by date. The dialog also shows a live preview of the certification lines exactly as they'll print at the top of the exported page, updating as checkboxes are toggled.
- **Dashboard diver credentials card** confirmed to already track whichever certification is current, via the existing org/level/certNo/date mirror — no visible change, just verified against the new explicit-selection logic above.
- **Log a Dive: My Gear**, a reusable personal equipment library. A new "+ My Gear" button in Section 03 (Equipment), next to Hood/Gloves/Boots, opens a form to save your own gear — Category (Mask/Snorkel/Fin), Brand, Model, Custom Label, Date of Purchase, optional Serial Number, and Weight (kg) — with a "Default" toggle so it's pre-selected on every future dive log automatically. Once saved, each item becomes its own toggle button (gear icon, Custom Label as the title) right alongside Hood/Gloves/Boots, with a small pencil to edit or delete it later. Selected gear is added to the same Additional Gear list already used by PDF export and the Full Log Details view.
- **UDDF import: multi-dive selection.** A UDDF file containing more than one dive now shows a selection list (date, dive site, start/end time, max depth per dive) instead of always silently pre-filling the form from the first dive. Files with exactly one dive behave exactly as before.
- **Fixed UDDF import on iOS/mobile Safari** not showing/allowing `.uddf` files in the file picker — the file input's `accept` attribute now also includes `text/xml`, `application/xml`, and `application/octet-stream` alongside the existing `.uddf`/`.xml` extensions, since iOS Safari can't reliably match an unregistered file extension by itself.
- **Log a Dive wording**: Dive Photos section helper text shortened from "Add photos from this dive. They're only viewable via the "View Dive Photos" button in the Logbook — never shown inline in previews." to "Add photos from this dive. They're viewable via the "View Dive Photos" in Logbook".
- Service worker cache bumped (`abyss-shell-v23` → `abyss-shell-v24`) to ship all of the above.

## 260723-v23

- **PDF export is now configurable.** "Export to PDF" opens an options dialog instead of exporting immediately:
  - **Certifications to include** — every entry in your certification history, each showing organization, level, and number, as independent checkboxes. None are forced; by default only your most recent certification (by date) is checked. Each one you select gets its own line under your name on the exported page.
  - **Diver name** is always included and can't be unchecked.
  - **Fields to include** — every Log a Dive input field is now offered (not just the original 25), grouped by the same sections as the form itself (General, Environmental Profile, Equipment, Depth & Time Profile, Gas Metrics & SAC, Dive Buddy & Journal), plus a "select all" toggle. Only the original 25 fields are checked by default; the rest (air/surface temp, exact location, weather, additional gear, gas O2/N2/He %, dive buddy, buddy cert number, journal notes) are there to add if wanted.
  - Marine life sightings and photos are still never offered — not tabular data / explicitly out of scope for this export.
  - Removed the "marine life sightings excluded" note from the exported page's subtitle line.
- Service worker cache bumped (`abyss-shell-v22` → `abyss-shell-v23`) to ship the above.

## 260723-v22

- **Critter sighting photos and dive photos no longer get embedded as base64 inside the synced dive_data.json.** Each photo is now uploaded as its own file to OneDrive (`/Apps/AbyssDiveLog/photos/<id>.jpg` — the same path the diver avatar already used), and the dive/critter record just holds a small id reference instead. This keeps the main sync snapshot lightweight regardless of how many photos are attached, and avoids re-uploading every photo on every sync.
  - New local IndexedDB `photos` store acts as a cache of actual image bytes; a fresh in-memory cache backs that for the current page load. Displaying a photo not yet cached locally (e.g. one added on another device) transparently fetches it from OneDrive and caches it going forward.
  - **Existing photos are migrated automatically** the first time the app loads after this update — any critter/dive photo still in the old embedded-base64 shape gets moved into the new photo store and re-referenced by id, then synced normally. No action needed, and nothing is lost.
  - Known limitation: removing a photo (clearing it before saving, or deleting/editing the dive it belonged to) doesn't delete the corresponding file from OneDrive or the local cache — it's simply left as an orphan. Low-stakes for a personal single-user log, but worth knowing if you're watching your OneDrive app-folder storage.
- **Fixed a real (pre-existing) sync bug found while building the above**: a failed photo upload (bad connection mid-sync, etc.) was being silently discarded instead of retried — `syncNow()` cleared the *entire* pending-upload queue after each sync attempt regardless of whether individual photo uploads actually succeeded, so a failed one never got a real second chance despite a comment claiming otherwise. This only ever risked the diver avatar before (a single photo, easy to notice and just re-save). Now each queued item is only removed once it's confirmed to have actually gone through; anything that fails stays queued for the next sync.
- Service worker cache bumped (`abyss-shell-v21` → `abyss-shell-v22`) to ship all of the above, including updated `js/db.js` and `js/sync.js`.

## 260723-v21

- **Naming consistency**: "Logbook Verification Number" and Log a Dive's "License Number"/"Verification Number" are now all just **Certification Number** everywhere. The Logbook/Log a Dive/Full Detail section formerly called "Verification & Journal Entry" is now **Dive Buddy & Dive Journal**. "Exposure Suit / Rig" is now **Exposure / Weight**.
- **Dive Tags**: optional multi-select tags (Wreck, Night, Drift, Training) in Log a Dive Section 1, shown as icon-free pill buttons like Additional Gear. Filterable from the Logbook (see below) and shown in the Full Log Details view.
- **Logbook filter button**: filter the dive list by Country, Dive Site, Dive Type, and Dive Tags, independent of the existing text search.
- **Log a Dive map**: added a place search box and a "use current location" button (browser geolocation) next to the existing click-to-pin map.
- **Dive Site and Dive Buddy are now autocomplete fields** — still plain text (not a managed list), but typing suggests every value already used elsewhere in the logbook.
- **Turtles** added to AquaDex and the Log a Dive marine life checklist (7 species, Green through Leatherback).
- **UDDF import reworked**: importing a UDDF file no longer silently creates saved dive records. It now pre-fills whichever Log a Dive form is currently open (date, site, temps, visibility, depths, bottom time, pressures, notes) from the first dive in the file, leaving anything UDDF has no concept of — Country, Dive Type, Buddy, Tags, gear — for manual entry. The import button moved from the Logbook header to the Log a Dive form itself. If a file's summary stats are missing, they're now computed from its depth/time waypoints, including bottom time (previously only max/avg depth had this fallback).
- **Depth & Time Profile graph**: Log a Dive Section 4 now plots a live depth-over-time line as you fill in (or import) Max Depth and Bottom Time — a real UDDF sample trace when one was imported, otherwise a synthesized 0 → max → 0 triangle. The same graph appears in the Logbook's expanded card preview and the Full Log Details modal for any saved dive.
- **Dive Photos**: new Section 7 in Log a Dive for uploading general dive photos (separate from marine life sighting photos). Never shown inline in any Logbook preview or the Full Log Details modal — only via a new "View Dive Photos" button next to "View Full Log Details".
- **Diver Detail additions**: SAC Rate widgets now show a ± standard deviation alongside the average (last 20 dives and all-time); a new Gas Mixture Breakdown pie chart; a new Dive Buddy Analytics widget showing who you last dived with and who you've dived with most.
- **PDF export**: added alongside the existing CSV/UDDF export options — a landscape A4, single-table logbook printout (Dive #, Date, Dive Type, Tags, Country, Site, Time In/Out, Bottom Time, Max/Avg Depth, Water Temp, Visibility, Water Type, Body of Water, Waves, Current, Surge, Weight, Exposure Suit, Tank Type/Volume, Gas Type, Start/End Pressure). Marine life sightings are intentionally excluded.
- Also removed a redundant repeated "L/min"/"Bar/min" sub-label under the SAC preview numbers in Log a Dive Section 5.
- Service worker cache bumped (`abyss-shell-v20` → `abyss-shell-v21`) to ship all of the above.

## 260723-v20

- **Real light mode is back.** A new theme toggle (sun/moon button in the nav bar, next to Sync) switches between dark and light, persists the choice, and syncs it across devices via the same OneDrive snapshot the dive data uses.
- The previous light mode (removed a while back) had a real bug: it paired `dark:` utility classes with a `light:` variant that was never actually registered in the Tailwind config, so it silently did nothing — text stayed at its dark-mode color (often white or light gray) while a handful of custom CSS rules still flipped backgrounds to white, producing unreadable white-on-white/light text. This rebuild uses Tailwind's real convention instead: proper light-appropriate base colors paired with `dark:` overrides, so both themes are independently correct rather than one being a broken mirror of the other.
- Covers the full app: nav bar, dashboard stat cards and map (CARTO tiles now switch light/dark variant too), Diver Detail credential card and trend charts (chart axis/legend colors now adapt to the theme), Logbook cards and full-detail modal, Log a Dive form and gear icons, AquaDex grid and species detail modal, toasts, and every confirm/sign-in dialog.
- Fixed several modal titles and card labels that would have gone invisible in light mode specifically because they sat on `.glass-panel` surfaces (which do turn white in light mode) while still being hardcoded to white text — the confirm dialog, sign-out warning, login prompt, Share Profile, and Dive Log Details modal titles, plus AquaDex species cards and the sighting gallery.
- Service worker cache bumped (`abyss-shell-v19` → `abyss-shell-v20`) to ship all of the above.

## 260723-v19

- **Fixed a real data-loss risk introduced by the v18 sign-out feature.** Signing out clears the on-screen view by emptying the in-memory dive list (IndexedDB itself was always meant to be untouched) — but logging, editing, deleting, or importing a dive right after sign-out (before signing back in) saved that emptied list straight back to IndexedDB, permanently wiping every other dive on the device. Fixed by re-loading the real data from IndexedDB before any such action if the view was cleared by a sign-out, so nothing is lost no matter what's done while signed out.
- **Fixed the OneDrive sync overwrite bug**: signing back in after logging a dive while offline or signed out could silently discard that dive, because the post-sign-in sync always let remote data win outright whenever it had any dives at all, without checking whether local had its own newer changes to protect. Now that unconditional shortcut only applies when local is genuinely empty (a fresh device with nothing to lose); otherwise it falls through to the existing timestamp-based comparison, which correctly keeps whichever side — local or remote — was actually edited more recently.
- **Average Weight by month chart simplified**: now shows a single line — the simple average of that month's per-dive weight across the entire logbook — matching the SAC chart's earlier simplification. The "Last 20 dives" line and its legend have been removed.
- **All Diver Detail trend charts are now line charts**, including the previously bar-style Total Dives (Quarter/Year) chart, for visual consistency across Section 4.
- Service worker cache bumped (`abyss-shell-v18` → `abyss-shell-v19`) to ship all of the above.

## 260723-v18

- **Diver Detail "Trends Over Time"**: removed the color-dot legend under the header; replaced with the subtitle "Diver's analytic trend over time". (The weight trend chart's own Chart.js legend still shows "Last 20 dives"/"All logged dives" per line.)
- **Full dive log preview (Logbook "View Full Details") is now sectioned** the same way as the Log a Dive form — General, Environmental Profile, Equipment, Depth & Time Profile, Gas Metrics & SAC, Marine Life Sightings, Verification & Journal Entry — instead of one flat two-column list. The General section now also shows a small map preview of the dive's exact pinned location when one was set, or a note that none was pinned.
- **Log a Dive location picker auto-zooms to fit the selected country.** Choosing a country now recenters/zooms the map to roughly frame that country (a new `COUNTRY_ZOOM` lookup with size-tier approximations, since no real bounding-box dataset is available) instead of always using one fixed zoom regardless of whether the country is Russia or Singapore. Any pin already placed is untouched — only the map view moves.
- **Additional Gear (Hood/Gloves/Boots) is now selectable icon buttons** instead of checkboxes, in Log a Dive Section 3. The underlying checkboxes still exist (hidden) so all existing save/load logic is unchanged — the icons are a pure visual layer over them.
- **Added a Sign Out button** (next to the sync button, shown only while signed in). Signing out asks for confirmation, then signs out of OneDrive and clears what's currently shown on screen — the local dive log itself is untouched in this device's storage and reappears on reload or the next sign-in. The "Log in to save your information" prompt now only appears right after an explicit sign-out, not automatically on every page load — so it can no longer pop up just because the device is offline or has never signed in.
- Service worker cache bumped (`abyss-shell-v17` → `abyss-shell-v18`) to ship all of the above.

## 260723-v17 — Performance cleanup

- **Removed dead `defaultImage` field** from all 239 `CRITTER_DATABASE` entries — a leftover Unsplash stock-photo fallback that was never actually read anywhere in the code once the "No Photo" placeholder replaced it. Pure bloat; `index.html` shrank from 392K to ~364K.
- **Stripped leftover `light:` Tailwind classes** (231 occurrences across `class="..."` attributes, `.className` assignments, and `classList.add/remove` calls) now that light mode was removed entirely and the app is dark-mode only. No visual change, less markup for Tailwind's compiler to churn through on every render.
- **Dashboard map and Diver Detail charts are now reused instead of destroyed and rebuilt.** `initLeafletMap()` creates the Leaflet map + tile layer once and just clears/repopulates markers (calling `invalidateSize()` so it re-measures correctly after being hidden on another tab) instead of calling `map.remove()` + `new L.map()` every time the Dashboard tab is shown. The three Diver Detail charts (SAC, weight, total dives) now call `.update()` with fresh data instead of `.destroy()` + `new Chart()` on every render.
- **`updateUI()` no longer rebuilds every tab's content on every action.** Previously, saving a dive, switching tabs, or a background OneDrive sync applying new data would unconditionally re-render the full Logbook list, the full ~230-species AquaDex grid, Diver Detail's analytics/milestones/certifications, and the Dashboard stats — regardless of which tab was actually visible. Each of those now only renders when its own tab is the active one, and `switchTab()` already sets the active tab before calling `updateUI()`, so switching tabs (or a background sync landing while a tab is open) still refreshes exactly what's on screen — nothing goes stale.
- Service worker cache bumped (`abyss-shell-v16` → `abyss-shell-v17`) to ship all of the above.

## 260723-v16

- **Dashboard**: "Critters" stat renamed to "Marine Life".
- **Logbook**: sighting card badge simplified from "Photo Locked" to just "Photo".
- **SAC Rate by Month chart simplified**: now shows a single line — the simple average of that month's per-dive SAC values across the entire logbook. The "Last 20 dives" line and the 20 L/min benchmark reference line have both been removed.
- **New: exact dive location pinning.** The Log a Dive form now has an interactive map (Section 1) for dropping a precise pin at the actual dive site, stored as `latitude`/`longitude` on the dive record. The Dashboard map now uses that exact pin when present; dives without one still fall back to the existing jittered country-level marker, so nothing changes for previously logged dives.
- **New: Share Diver Profile as an image.** A "Share Profile" button on Diver Detail renders a shareable card (via html2canvas, vendored from cdnjs) — top half is a certificate-style card with avatar, name, certification organisation, and level; bottom half is a widget-style grid with Total Dives, Total Bottom Time, Max Depth, Countries Visited, Avg Depth (Last 20), and Avg SAC (Last 20). Uses the native OS share sheet (`navigator.share`) when available, with a direct PNG download as the fallback.
- Service worker cache bumped (`abyss-shell-v15` → `abyss-shell-v16`) to ship all of the above.

## Diver Detail

- **Fixed: trend charts (SAC rate, weight, total dives) rendered nothing at all.** Root cause: cdnjs's `chart.min.js` for Chart.js v4+ is an ES module (it starts with an `import` statement), which fails silently when loaded via a plain `<script>` tag — the global `Chart` never got defined, so every chart's `typeof Chart === 'undefined'` guard bailed out permanently, no matter how much dive data existed. Fixed by vendoring the correct UMD build (`js/chart.umd.min.js`, which does define `window.Chart`) locally instead of pointing at the CDN. Also hardened chart creation to only happen while the Diver Detail tab is actually visible (creating a Chart.js instance against a hidden `display:none` canvas can leave it permanently blank at 0×0 even after the tab is shown later), and switched the post-tab-switch re-render from a fixed timeout to a double `requestAnimationFrame`, which more reliably waits for layout to settle before charts are created.

- **Certification history**: the Diver Detail page now tracks every certification you've earned, not just one. Each entry has a required organisation, level, certification number, and date, plus optional dive center name, dive center location, instructor name, and instructor certification number. Add new certifications or edit/delete existing ones from the new "Certification History" list; the credentials card always shows whichever certification has the most recent date as your "Current" one. Existing single-certification profiles are migrated automatically the first time the app loads — nothing is lost.
- **Sub-surface Analytics rebuilt into 4 sections**: Section 1 (Lifetime Totals: Total Dives, Total Time, Maximum Depth, Max Bottom Time); Section 2 (Average — Last 20 Dives: Average Depth, Average Bottom Time, Average SAC Rate, Average Weight); Section 3 (Average — All Logged Dives: same four metrics, computed across the full logbook instead of just the last 20); Section 4 (Trends: monthly SAC rate chart with a 20 L/min benchmark line, monthly average weight chart, and a total-dives-by-quarter chart — each trend chart plots a light-blue "last 20 dives" line/series against a light-magenta "all logged dives" one). This also fixes a pre-existing bug where "Avg Bottom Time" was labeled "last 20 dives" but was actually averaged across the entire logbook.
- Added Chart.js (via CDN, same pattern as Leaflet/Font Awesome) to render the new Section 4 trend charts.

## General

- Diver Detail sub-header capitalization audit: fixed one sub-header ("your logged dives, mapped worldwide" → "Your logged dives, mapped worldwide") that wasn't capitalized.

## Sync

- **Fixed: signing in from the installed iOS home-screen app failed with "block_nested_popups".** Root cause: `loginPopup()` (and its `acquireTokenPopup()`/`logoutPopup()` counterparts) tries to open a separate popup window for the Microsoft sign-in page, but an installed/standalone PWA on iOS doesn't support real child popup windows the way a normal Safari tab does — MSAL detects this and refuses to open the popup at all, throwing `block_nested_popups` before the user ever sees a login screen. `js/auth.js` now detects standalone/installed-PWA mode (`display-mode: standalone` media query, plus `navigator.standalone` on iOS) up front and goes straight to the full-page redirect flow (`loginRedirect`/`acquireTokenRedirect`/`logoutRedirect`) in that case, skipping the popup attempt entirely instead of discovering the failure after the fact. Normal browser-tab usage (not installed) is unaffected and still uses the faster popup flow first.
- **Added import/export**: Logbook header now has an **Import** control (UDDF 3.2 files) and an **Export** menu with two options — **UDDF** (full dive profile export, standard-compliant) and **CSV** (one row per dive, `abyss-divelog-<diver name>.csv`, 36 columns covering every logged field). Imported UDDF dives that don't map to an Abyss-specific field (country, dive type, buddy, gear, weight, critters) are left blank with a toast prompting a manual review pass.
- Service worker cache bumped (`abyss-shell-v14` → `abyss-shell-v15`) to ship the above two changes to existing installs.
- **Fixed: mobile sign-in could crash with "Can't find variable: msal".** The Microsoft auth library was loaded from `alcdn.msauth.net`; on some mobile browsers/networks (ad/tracker blockers, flaky mobile data, DNS filtering) that request could silently fail, leaving `msal` undefined and crashing sign-in with a raw ReferenceError. The library is now vendored locally at `js/msal-browser.min.js`, served from the same origin, and precached by the service worker like the rest of the app shell. `js/auth.js` also now checks for this case explicitly and throws a clear, actionable error instead of a cryptic crash if the library still isn't available for any reason.
- **Fixed: signing in on a new/reinstalled device could still overwrite real OneDrive data with an empty logbook.** Added a dedicated `syncAfterSignIn()` path (in `js/sync.js`) that runs on every sign-in — whether via the button or the popup-blocked redirect fallback — and on any app startup where this device has never completed a sync before. Instead of comparing timestamps, it always downloads the OneDrive snapshot first: if it already contains dives, that data always wins and is pulled down, no exceptions; only if the OneDrive file is missing entirely or genuinely empty does it fall back to the normal push flow. The regular timestamp-based `syncNow()` (used for every edit on an already-synced device) is unchanged, so deleting all your dives on an established device still syncs correctly.
- Service worker cache bumped (`abyss-shell-v8` → `abyss-shell-v9` → `abyss-shell-v10` → `abyss-shell-v11`) to ship the above fixes, including precaching the newly-vendored `js/msal-browser.min.js`, to existing installs.

## Log a Dive

- **Dive Site field**: placeholder text updated to `e.g. Crystal Bay, Nusa Penida`.

## Critterdex

- **Sightings without a photo** no longer show a random stock/reference image in their place. They now display plain **"No Photo"** text instead, so it's clear at a glance which sightings actually have your own photo attached.

## Platform-wide

- **Sample dive logs cleared**: the two demo/seed dives (`INITIAL_DIVE_LOGS`) have been removed, so the app now starts with an empty logbook. This will be kept empty in all future packaged builds going forward.
- **Date format standardized to DD-MM-YYYY** everywhere a date is displayed to the user (Logbook cards, Dashboard recent dives list, Critterdex sighting galleries, Diver certification date). Internal storage/sorting still uses ISO (`YYYY-MM-DD`) format under the hood, since that's required by native date inputs and JavaScript's `Date()` parsing — only the display layer changed.
- **Light mode removed**: the app is now dark-mode only. The theme toggle button has been removed from the header, and the map now always uses the dark CARTO tiles (no more light/dark tile switching logic).

## Bug fixes

- **Fixed: deleted sample dive log reappearing after refresh.** Root cause: a legacy localStorage migration path in `loadState()` was pulling in stale cached data from earlier testing sessions even after the seed data itself was cleared. This migration path has been removed entirely — the app now reads exclusively from IndexedDB, so cleared data stays cleared.
- **Fixed: "+ " quick-action button size mismatch.** The mobile "Log Dive" plus button now matches the Sync button's padding and icon size exactly, so the two sit consistently in the header at any screen width.
- **Improved: OneDrive sign-in error handling.** Previously, any sign-in failure showed a generic "Sign-in failed. Check your connection and try again." message, regardless of the actual cause. Now:
  - If `js/auth.js` still has the placeholder Client ID (not yet configured), sign-in immediately throws a clear, actionable error explaining exactly that, instead of a cryptic MSAL failure.
  - Any other sign-in failure now surfaces the actual MSAL error code/message in the toast and browser console, so the real cause is visible instead of being swallowed by a generic message.
  - The popup→redirect fallback no longer blindly retries when the user simply cancels/closes the popup themselves — it only falls back to redirect when the popup genuinely couldn't open (e.g. blocked by the browser).

## Maintenance

- **Service worker cache version bumped** (`abyss-shell-v1` → `abyss-shell-v2`) so that returning visitors to the deployed site actually receive all of the above updates, instead of continuing to load a stale cached copy of the app shell.
