# XField — PRD

## Original problem statement
"i wanna build an app with virality factor on X. That means, people should be able to put down their X username and get something out of it."

## Current version (source of truth: /app/README.md and /app/XFIELD_STATUS.md)
**v3 "Pure Votes"**, pulled from the user's GitHub repo https://github.com/arimanyus/xfield (commit 6cd2ed2 "new readme") on 2026-10-24. The user chose "GitHub version replaces everything".
- 3D city (React 19 + three.js / @react-three/fiber). Sign in with X, and your house goes up on the Docks with your face. Your 8-person circle gets dark reserved houses.
- The game: two houses, pick one. 3 votes a day, Elo K=32. At 1030 points a house moves uptown.
- The XField Ledger, a daily AI paper (Claude via the Emergent LLM key, TEXT_MODEL), plus a live ticker, a weekly census, districts with AI names, and 200 lots.
- Crons in `.emergent/crons.yml`: weekly-census (Mon 09:00 UTC) and town-refresh (daily 03:30 UTC, then the paper).

## Version history
1. Lost episode → 2. Springfield, X (2D town) → 3. Field war → 4. A show about your scene → 5. **Pure Votes (now)**.
- The workspace-only 2D work from 2026-10-22 (census, refresh/moves, lawn signs above pills) was superseded by the repo. A backup is at /tmp/app_backup in the old pod.

## Environment / deploy notes
- backend/.env keeps this environment's keys. TOWN_CAPACITY was set to 200, matching the README. DEV_MODE is NOT set (real X reads, no seeded bots).
- The X OAuth callback must be registered in the X Developer Console: preview `https://handle-prophecy.preview.emergentagent.com/api/auth/x/callback`, plus `https://<live-domain>/api/auth/x/callback` after deploy.
- 2026-10-24: preview smoke test passed (iteration_11: backend 22/22 smoke + 16/16 unit; frontend flows OK). Deployment dispatched.
- Preview data cleanup: removed the fake "new district" events created by migration, the test-triggered Ledger No.1 and census No.1, and the stray "@" in levelsio's name.

## Backlog (from iteration_11 + README)
- P1: Add data-testids to the v3 UI (CityPage, city3d/*). Stop migrations emitting `new_nb` events for existing districts. On mobile, the sign-in card overlaps the minimap. Arrivals panel needs an empty state.
- P1: Real users on staging plus analytics. Check the AI paper with real activity.
- P2: The rabbit moment (passing the house ahead of you). More house styling (signs, gardens).
- P2 clean-up: the old 2D TownPage routes (/h, /d, /census), district boards/elections, old integration tests, and the outdated XFIELD_STATUS.md.
