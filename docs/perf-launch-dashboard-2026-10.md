# Big Surf — Launch & dashboard load time, October 2026

*Status 2026-10-26: PF-0 … PF-4.1 built on `training-plan-tp0-tp2` and on dev (queue row 15). PF-4.2 deliberately not built — measure first. Open: the phone waterfall before/after and the acceptance numbers below.*

*Written 2026-10-26 from a source read of the working tree at `9cf3b75` (TP-5). Every claim cites a file and function; line numbers drift, so search for the function name if one is off. Phases are **PF-n**, sized S/M/L, one PR each, dev-deploy gate like AP-n / SH-n. Order is by payoff ÷ effort: PF-0 → PF-1 → PF-2 → PF-3 → PF-4.*

## 0. Executive summary

The app isn't slow because of compute — the scoreboard, streaks, week pace and insights are all linear passes over the in-memory workouts list (milliseconds). It's slow because of **network round-trips, run one after another**, on two critical paths:

**Cold launch (sign-in → dashboard visible)** — `app-initialization.js#setupAuthenticationListener` awaits, *in series*, before the loading screen is allowed to hide:

| # | Step | What it costs on the network, every launch |
|---|---|---|
| 1 | `checkAndMigrateOnLogin` → `schema-migration.js#needsMigration` | **reads the entire `workouts` collection** just to look for old-style doc ids. Has run on every login since the v3 migration (2025). |
| 2 | `migrateEquipmentBaseWeight` | **reads the entire `equipment` collection** to find docs missing `baseWeight`. Idempotent, but never flagged as done. |
| 3 | `loadUserSettings` | 1 doc |
| 4 | `loadWorkoutPlans` | templates (global defaults + user customs = 2 queries) ∥ exercise library (global `exercises` + custom + overrides + hidden = 4 queries). These six run in parallel — fine. |
| 5 | `PRTracker.loadPRData` | 1 doc |
| 6 | `initializeNotifications` + `initializeFCM` | service-worker `ready` ×2, `pushManager.getSubscription()`, then **`saveSubscriptionToServer` — an `httpsCallable` to `savePushSubscription`, awaited, on every launch**. That's a v1 Cloud Function with no `minInstances`, in the same `functions/index.js` that requires firebase-admin, web-push and the whole coach stack — a cold start is routinely 2–6 s. Nothing downstream needs the result. |
| 7 | `validateUserData` | `refreshExerciseDatabase()` → `getExerciseLibrary()` **again** (4 queries) and `getUserWorkoutTemplates()` **again** (2 queries). It's a verbatim repeat of step 4. |
| 8 | `checkForInProgressWorkoutEnhanced` → `loadTodaysWorkout` | 1 query |
| 9 | `setTimeout(…, 500)` | a hard-coded half-second wait before `hideLoadingScreen()` |
| 10 | `showDashboard()` → `renderDashboard()` | **reads the entire `workouts` collection again** (`loadAllWorkouts` — cache is empty on launch), PR doc again, then the chain in the next table |

Steps 1, 2, 6 and 7 do nothing a user can see. Together with step 9 they are, in all likelihood, the majority of the cold-launch wait — and 1 + 10 mean the full history crosses the network **twice** before the first paint.

In parallel with that chain, `checkEquipmentMigrationV3` (prefs doc; and if its flag is missing, the whole equipment collection again via `runEquipmentMigrationV3` dry-run) and `loadEquipmentCatalog` (whole `equipmentCatalog` collection) share the same connection.

**Every return to the dashboard** — `navigation.js#routeToView` → `showDashboard()` → `dashboard-ui.js#renderDashboard`, which wipes the page to a skeleton and then awaits, *in series*:

| Order | Read | Notes |
|---|---|---|
| a | `loadAllWorkouts` ∥ `loadPRData` ∥ week plan ∥ program | workouts cache hits within 5 min; PR doc is re-read from the server every visit (`pr-tracker.js#loadPRData` — no "already loaded" shortcut) |
| b | `wm.getUserWorkoutTemplates()` | 2 server queries — though `AppState.workoutPlans` already holds them (loaded at startup; refreshed at 29 write sites) |
| c | `loadBodyWeightData` → `loadBodyWeightHistory(90)` | 1 server query |
| d | `reportCardEntry` | 1 doc, Sat/Sun only |
| e | `renderBodyCard` → `getLatestDexaScan` **then** `loadDexaHistory()` | 2 server queries, the second only to get `history[1]` — the first is a strict subset of the second |
| f | `wm.getUserLocations()` | 1 server query, used only to hide/show "Manage locations" in the More menu |

That's 6–7 serial round-trips after the cache hit. On a phone on the gym's Wi-Fi each one is 150–400 ms through the Firestore channel → **1–3 s of skeleton on every tab switch back**, even when nothing changed. Why "serial" matters: every `await` here waits for the previous one to come back before the next request is even sent.

**One Firestore fact underneath both paths.** The persistent IndexedDB cache (11a) does *not* make online reads fast. `getDocs()` with the default source goes to the server and waits; the cache is used only when the device is offline or `readWithCacheFallback` times out (10 s). So right now the device holds a complete, mostly-fresh copy of everything the dashboard needs, and never paints from it. PF-3 fixes that.

**Also on cold launch only:** the module graph. 132 ES modules (505 static `import` edges, 258 dynamic), no bundle, hosting sends `no-cache`, and the service worker serves our JS **network-first with no timeout** (deliberately — version skew). Every launch therefore revalidates ~100 files, and the browser discovers them depth-first — a waterfall whose depth, not count, sets the time. PF-4 flattens it without a bundler.

**Expected result:** cold launch bound by auth-token refresh + one parallel batch of reads (roughly 1–1.5 s on a decent connection, down from "several seconds"); returning to the dashboard paints instantly from memory and quietly refreshes.

## Before you start — measure once (PF-0, S, 30 min)

You can't verify the fix without a before/after. Two ways; do both once.

**1. The waterfall, on the phone.** Chrome remote debugging (Android) or Safari Web Inspector (iOS, standalone PWA counts): Network tab, reload, screenshot the waterfall. Note (a) the time from the first `firestore.googleapis.com` request to the last before the dashboard paints, (b) how many `js/…` requests there are and the depth of their staircase, (c) whether a `savePushSubscription` call sits in the middle with a multi-second bar. That single screenshot is the "before".

**2. A `?debug` timing trace in code**, so you can read it on the phone without DevTools. Add to `config.js`:

```js
// PF-0: perf marks, ?debug only. perfMark('auth:settings') … perfReport() prints the table.
const _perf = [];
export function perfMark(label) { if (isDebug()) _perf.push([label, performance.now()]); }
export function perfReport() {
    if (!isDebug() || !_perf.length) return;
    const t0 = _perf[0][1];
    console.table(_perf.map(([l, t], i) => ({ step: l, at_ms: Math.round(t - t0), delta_ms: Math.round(t - (_perf[i - 1]?.[1] ?? t)) })));
}
```

(`isDebug()` = whatever `debugLog` already checks.) Then `perfMark('…')` after each `await` in `setupAuthenticationListener` (the numbered steps above), at the top and bottom of `renderDashboard`, and after each `await` inside it; `perfReport()` at the end of `renderDashboard`. Also expose `window.perfReport`. Open the app with `?debug`, read the table. Commit it — it's the regression check for every phase below, and it's gated so prod never pays for it.

**Acceptance for the whole workstream:** cold launch, settings → dashboard, under 1.5 s on home Wi-Fi; dashboard return paints in under 100 ms with no skeleton when the cache is warm.

## PF-1 — Cold launch: take the dead weight off the critical path (S, biggest launch win)

All in `app-initialization.js#setupAuthenticationListener` unless noted.

1. **Flag-gate the two migrations, and run them after the dashboard.** `schema-migration.js#needsMigration` and `#migrateEquipmentBaseWeight` each read a whole collection. Add `schemaV3Checked: true` and `equipmentBaseWeightChecked: true` to `preferences/settings` the first time each runs clean (same pattern as `equipmentMigrationV3` in `checkEquipmentMigrationV3`). `loadUserSettings` already brings the settings doc into `AppState.settings`, so the check is a free in-memory read: if the flag is set, skip. Move the whole migration block to *after* `showDashboard()` resolves, un-awaited (`.catch(console.error)`), so even the first flag-setting run doesn't delay the paint. Order of operations matters once: `loadUserSettings` has to come before this block (today it comes after).
2. **Delete the duplicate load.** `validateUserData()` repeats `loadWorkoutPlans` (six queries). Remove the call at step 7. If something depended on the *second* read catching a change the first missed, it was a race, not a feature — nothing writes templates or exercises between the two. Keep the function (the library-retry path uses `refreshExerciseDatabase`).
3. **Don't await notifications or push, and only save a subscription that changed.** `initializeNotifications()` and `initializeFCM()` → fire-and-forget after the dashboard (they're already try/caught). In `push-notification-manager.js#initializeFCM`, before `saveSubscriptionToServer`, compare `subscriptionJson.endpoint` with `AppState.settings.pushEndpoint`; call the function only when it differs (or is missing), and have `savePushSubscription` (or the client, with `merge: true`) write `pushEndpoint` into `preferences/settings` so the next launch skips it. The callable's cold start then happens once per device, in the background, instead of on every launch in the foreground. **Watch:** `Notification.requestPermission()` on first run must still happen from a user gesture on iOS — moving it later doesn't change that; it already runs without one today.
4. **Remove the 500 ms `setTimeout`.** It was a timing hack ("avoid timing issues" per the comment); `showDashboard` is dynamically imported and awaited inside it, so nothing needs the delay. If the loading-screen fade needs a frame, use `requestAnimationFrame`, not half a second.
5. **Parallelise what's left.** After auth: `await Promise.all([loadUserSettings(), loadWorkoutPlans(AppState), PRTracker.loadPRData(), loadTodaysWorkout(AppState)])`, then `checkForInProgressWorkoutEnhanced` (needs plans + today's doc — pass the doc in rather than re-querying), then `showDashboard()`. Only `loadUserSettings` has a true ordering need (unit, rest timer), and nothing in that batch reads settings during its own fetch.
6. **Let the dashboard's workouts read start with everything else.** `loadAllWorkouts(AppState)` can be kicked off (not awaited) in the same `Promise.all` as step 5 — it fills the 5-minute cache, so `renderDashboard` finds it warm. That turns "startup, then dashboard reads" into one batch.

**Acceptance:** perf table shows no `needsMigration` / `migrateEquipmentBaseWeight` / `validateUserData` / `savePushSubscription` step before `dashboard:painted`; `savePushSubscription` appears in the Functions log once per device, not per launch; `npm test` green; a first launch on a fresh account still sets both flags (check the settings doc in the console).

## PF-2 — Dashboard: one parallel batch, nothing fetched twice (S/M, biggest return-visit win)

All in `dashboard-ui.js#renderDashboard` unless noted.

1. **Use the templates already in memory.** Replace `await wm.getUserWorkoutTemplates()` with `AppState.workoutPlans` (29 sites already keep it fresh after edits; `template-selection.js` refreshes it after every save/delete). Keep `AppState.templates = AppState.workoutPlans` so `renderScoreboardCard` and `renderForToday` are unchanged. If you'd rather keep a fetch as belt-and-braces, do it un-awaited and re-render only if the list differs (see PF-3).
2. **Stop re-reading the PR doc.** `pr-tracker.js#loadPRData` already tracks `_prDataLoaded` / `_prDataUid`; add an early return when both match (`if (_prDataLoaded && _prDataUid === uid && !force) return prData;`). Every PR write goes through `PRTracker`, so it can't go stale from the client; the Sunday jobs don't write PRs. Add a `{ force: true }` option and use it in the one place that must see server state (none today — the post-import path can call it).
3. **Fold the two DEXA reads into one.** `renderBodyCard`: call `loadDexaHistory(2)` once; `scan = history[0]`, `prevScan = history[1]`. Same result, half the round-trips.
4. **Move the locations read to where it's used.** The only consumer is the More-menu "Manage locations" toggle. Do it when the More menu opens (`navigation.js` More-menu handler), or read `AppState._cachedLocations` when present and fetch only when it's `undefined`. It should not block or follow the dashboard render.
5. **Give measurements and DEXA the same session cache as workouts.** Copy the `loadAllWorkouts` pattern (module-private `{uid, fetchedAt, data}`, 5-minute TTL, `clear…Cache()` export) into `body-measurements.js#loadBodyWeightHistory` and `dexa-scan.js#loadDexaHistory`; call the clear from their own save paths (`saveBodyWeight…`, DEXA upload, Withings sync — `withings-integration.js` after a sync that wrote entries) and from the `online` handler in `error-handler.js` next to `clearAllWorkoutsCache()`. Same for `reportCardEntryHTML`'s `loadDoc` (weekend only, but it's on the path).
6. **One `Promise.all` for everything the render needs.** With 1–5 done, the top of `renderDashboard` becomes:

```js
const [allWorkouts, bwData, dexaHistory, reportEntry] = await Promise.all([
    loadAllWorkouts(AppState),
    loadBodyWeightData(),
    loadDexaHistory(2).catch(() => []),
    reportCardEntry(),
    PRTracker.loadPRData(),               // in-memory after PF-2.2
    AppState._weekPlan === undefined ? loadWeekPlan().catch(() => null) : null,
    AppState._activeProgram === undefined ? loadActiveProgram().catch(() => null) : null,
]);
```

then streaks / weekly stats / insights (already pure over `allWorkouts`), then one `container.innerHTML`. `renderBodyCard(bwData, dexaHistory)` becomes synchronous. Round-trips per warm visit: **zero** (everything cached) — per cold visit: one batch, wall time = the slowest read, not the sum.

**Acceptance:** perf table for a return visit shows one `await` block and total under 100 ms with a warm cache; a cold visit shows the reads overlapping (their `delta_ms` collapse to one); DEXA card, body-weight line, report-card row and the More-menu toggle still render correctly; `npm test` + `npm run lint` + `npm run audit:design`.

## PF-3 — Paint from what the device already has, then refresh (M, makes both paths feel instant)

Two independent pieces; do 1 first, it's a few lines.

1. **Don't wipe to a skeleton when there's something to show.** In `renderDashboard`, only set the skeleton when `container.dataset.rendered !== '1'`. Otherwise leave the previous markup up while the batch runs and swap `innerHTML` when it's ready. Set `dataset.rendered = '1'` after a successful paint; clear it on sign-out. With PF-2's caches warm, the swap is within the same frame — the user sees no transition at all. Tab switches, back from a drill-down and `navigateBack()` after completing a workout all go through this path.
2. **Stale-while-revalidate for the big read.** `loadAllWorkouts` (and, if you like it there, the measurements/DEXA loaders): when the TTL cache is empty, first `getDocsFromCache(q)` — already exported by `firebase-config.js`, resolves in tens of ms from IndexedDB — hand that list back immediately *and* start the server `readDocs(q)` in the background; when the server copy arrives, update the cache and, if the list changed (cheap check: length + newest `lastUpdated`), re-run `renderDashboard()` (it's idempotent and, after PF-3.1, flicker-free). Guard with the existing `_allWorkoutsGen` so a stale background result can't overwrite a newer invalidation. First-ever launch on a device: the cache is empty, `getDocsFromCache` returns 0 docs with `metadata.fromCache` — treat that as "no shortcut" and await the server as today (the same check `getDefaultExercises` already does). **Why this is safe:** the Firestore cache on this device is written by this device's own saves (local-first writes, 11a) and by every server read, so the only thing it can miss is a write from *another* device or the Sunday functions — and the background refresh catches exactly those within one round-trip, repainting if needed. **Why not `onSnapshot`:** it would do this for free (cache event then server event), but it keeps a listener open per collection and changes the write-cost model; the two-step get is the smaller change and keeps `readDocs` as the one read path.

**Acceptance:** returning to the dashboard never shows the skeleton after the first paint of a session; cold launch paints the dashboard from cache before the server read completes (perf table: `dashboard:painted` precedes `workouts:server`); a workout completed on the phone shows on the laptop's dashboard within one refresh; airplane mode still renders the dashboard.

## PF-4 — Cold launch only: flatten the module waterfall (M, no bundler)

Independent of PF-1–3; do it last and measure separately — its win is proportional to connection latency, so it's biggest on the phone.

1. **`modulepreload` the static graph.** Add `scripts/gen-modulepreload.mjs` (plain Node, no deps): start at `js/main.js`, follow every *static* `import … from './…'` recursively (regex is enough — the codebase has no dynamic specifiers in static imports), and emit `<link rel="modulepreload" href="js/…">` for every module in dependency order. Paste the block into `index.html` under the CDN `<script>` tags (or have the script rewrite a marked region: `<!-- modulepreload:start -->` … `<!-- modulepreload:end -->`). Add it to the pre-deploy step (`npm run build:preload`, called before `firebase deploy --only hosting:dev`). The browser then requests the whole static graph in parallel the moment `index.html` arrives, instead of discovering it one `import` level at a time. Dynamic imports (258 of them) stay lazy — they're the drill-downs and sheets, which is right. Expect the staircase to collapse to two or three rows.
2. **Keep the SW's network-first; don't add a timeout.** The no-skew argument in `service-worker.js` is correct. If after PF-4.1 the JS phase is still the long pole on the gym's signal, the proper fix is a **versioned precache**: a generated `sw-manifest.json` of every `js/` + `styles/` file with a content hash; the SW installs the whole set under a version-keyed cache and serves cache-first; on a new deploy it fetches the full new set before activating (atomic swap, so no mixed versions). That's Workbox's precache model, hand-rolled; size it M/L and decide then — it's the same change that would let the app boot with zero revalidations.
3. **Not recommended now:** a bundler. It'd give the best cold-start numbers, but it breaks the "no build step" contract everywhere — the mirrored-modules sync, the test import paths, the `?debug` tooling, every CLAUDE.md rule about `window.*` wiring. Only revisit if 1 and 2 don't get the phone under the acceptance bar.

**Acceptance:** on-phone waterfall shows `js/` requests starting together, not stepped; `npm test` green (`window-wiring.test.js` unaffected); `firebase deploy --only hosting:dev`, cold-launch timing before/after in the perf table.

## What NOT to touch (tempting, but not the problem)

- `buildScoreboard`, `calculateStreaks`, `getWeeklyStats`, `loadInsightsData(allWorkouts)`, `computeWeekPace`, `detectDeloadWeek` — all pure and linear over the in-memory list; they already share one workouts read (the 9/29 fix). Memoising them buys nothing measurable.
- `Config.FIREBASE_TIMEOUT_MS` / `READ_WAIT_MS` — lowering them doesn't speed up a healthy read; it only makes a slow read fall back to cache sooner, which PF-3 does deliberately and immediately instead.
- The 5-minute `ALL_WORKOUTS_CACHE_TTL_MS` — fine as is once PF-3.2 exists; the TTL becomes "how often to re-check the server", not "how long until the user waits again".
- The Firestore persistent cache itself — it's on and working; the app just never asks it first.
