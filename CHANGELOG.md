# Changelog

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
