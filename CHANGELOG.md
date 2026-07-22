# Changelog

## Sync

- **Fixed: mobile sign-in could crash with "Can't find variable: msal".** The Microsoft auth library was loaded from `alcdn.msauth.net`; on some mobile browsers/networks (ad/tracker blockers, flaky mobile data, DNS filtering) that request could silently fail, leaving `msal` undefined and crashing sign-in with a raw ReferenceError. The library is now vendored locally at `js/msal-browser.min.js`, served from the same origin, and precached by the service worker like the rest of the app shell. `js/auth.js` also now checks for this case explicitly and throws a clear, actionable error instead of a cryptic crash if the library still isn't available for any reason.
- **Fixed: signing in on a new/reinstalled device could still overwrite real OneDrive data with an empty logbook.** Added a dedicated `syncAfterSignIn()` path (in `js/sync.js`) that runs on every sign-in — whether via the button or the popup-blocked redirect fallback — and on any app startup where this device has never completed a sync before. Instead of comparing timestamps, it always downloads the OneDrive snapshot first: if it already contains dives, that data always wins and is pulled down, no exceptions; only if the OneDrive file is missing entirely or genuinely empty does it fall back to the normal push flow. The regular timestamp-based `syncNow()` (used for every edit on an already-synced device) is unchanged, so deleting all your dives on an established device still syncs correctly.
- Service worker cache bumped twice (`abyss-shell-v8` → `abyss-shell-v9` → `abyss-shell-v10`) to ship the above fixes, including precaching the newly-vendored `js/msal-browser.min.js`, to existing installs.

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
