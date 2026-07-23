# Changelog

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
