# Persona re-review — the shell (SH-3…SH-6), 2026-10-25

Marcus (daily lifter) plus a freestyler second take. Read from the `shell-sh3-sh6` diff, not run on a phone, so it covers flows and copy only. The HUD numbers from the phone session (queue item 1) are what prove the keyboard, inset and scroll fixes. Verdict: **4/5**. Every sheet now behaves the same way (backdrop, swipe on grip or title, Escape, keyboard inset). "Close" and "Keep current" read better than "Cancel". System back no longer leaves the app. Logging a set takes the same number of taps as before.

| # | Finding | Disposition |
|---|---|---|
| P0-1 | A system back mid-workout "kills the rest timer" (`awConfirmExit` → `cleanup` → `clearRestTimer`) | **Not a bug.** `clearRestTimer` only stops the tick. `restTimerEndsAt` persists and `showActiveWorkout` → `resumeRestTimerIfActive()` revives the countdown, or shows "Ready", on return (7/22 fix). A rest pill on the dashboard would be a new feature; not queued. |
| P0-2 | Any accidental dismissal of the BW prompt skips bodyweight for the whole session | **Fixed.** The BW sheet is `dismissible: false`, so only Save or Skip close it. System back now respects that (`closeTopSheet({ dismissOnly: true })`), and navigating away still counts as Skip. Regression from SH-3b: the old overlay had no backdrop dismiss. |
| P1-3 | With the keyboard up on a search, the footer, subtitle and grip hide | **Kept on purpose.** This is Kevin's 10/25 ask ("I only see two exercises"). The title row stays, so swipe-down on it closes the sheet, and so do Escape and Android back (once for the keyboard, once for the sheet). Picking a row closes the sheet anyway. Re-check on the phone (checklist 2/3). |
| P1-4 | BW "Skip" link is tiny and uses a raw `0.78rem` | **Fixed.** Now `--font-sm`, 44 px min height, secondary text colour. |
| P1-5 | `navigateTo` closes open sheets, so typed input is lost | **Not reachable from a tap.** Everything behind a sheet is `inert` (the bottom nav too), so only programmatic navigation closes a sheet, and each sheet's `onClose` commits its default. |
| P1-6 | Plate calc doesn't focus the weight | **Already does.** `plate-calculator.js` focuses and selects the input after open. "Use this weight" (write the weight back into the set) would be a new feature; not queued. |
| P2-7 | Rest timer controls are unreachable under a sheet (`inert`) | **By design.** A modal sheet owns input. The countdown stays visible, and the old `aw-sheet` backdrop covered the timer the same way. |
| P2-8 | Smoke-test dashboard → workout → back → Resume → back | Traced in code: the stack pops back to the root and the guard disarms after the fade, so a second back leaves the app. **On the phone checklist.** |
| P2-9 | A sheet with no title has only the thin grip to swipe | Only the BW sheet, which is now non-dismissible. No change. |

**Freestyler take:**
- Wins:
  - The gym chooser and substitution sheets never block Start.
  - Freestyle start goes through `enterSection`, so a back swipe no longer exits the app mid-session.
  - One gesture works everywhere.
  - Edit exercise from the live workout returns straight to the workout.
- Pain: the keyboard-up search (P1-3) and the BW pop-up (P0-2, fixed). No template jargon in any new copy.
