# Shell checklist — run on the phone before every prod promote

Standalone (home-screen) app, `?debug` on, build = what you're promoting. Takes ~5 minutes. (SH-5, `docs/action-plan-2026-10.md` §7.)

1. **Back is tappable** on three random pages, first try with the thumb — the HUD's `snap` shows each back/close rect; none under the status bar, none under 44 px.
2. **Equipment sheet + keyboard:** type in the search — the list scrolls inside the sheet, the page behind never moves, ≥ 5 rows visible above the keyboard.
3. **Quick-add + keyboard:** same as 2.
4. **Close any sheet** → you land at the exact scroll position you left (HUD `y` unchanged, `lock 0`).
5. **Bottom actions clear the home indicator** on a sheet with a footer (Done / Save).
6. **Rest banner + a sheet open together:** both usable, nothing stuck behind a backdrop.
7. **Portrait only** — rotation is not supported; don't test it.
8. **Save one `shell_snapshot`** (HUD `snap`) on the equipment sheet for the record; paste its line into `docs/bug-log.md` if anything above failed.
9. **More + a toast:** open More, trigger a toast (e.g. save a setting first, then open More while it shows) — the toast is on top; Escape / system back closes More like any sheet. (UD-1)
10. **What a row promises:** on a drill-down page, tap one row of each kind — chevron rows open a page, value-only rows don't move or press. On the lift screen, swipe a set row left — it's removed and the toast offers Undo. (UD-3, UD-2)
