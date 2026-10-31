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


## 2026-10-28: Sign in with X failing on the live site
- Root cause (deployer RCA): the live callback https://handle-prophecy.emergent.host/api/auth/x/callback is not in the X Developer Portal callback allowlist. X never redirects back (0 callback hits on live). Code and secrets are fine. Preview sign-in works.
- User action: add that URL in X Developer Portal > App > User authentication settings > Callback URI (keep the preview one too).
- Added: CityPage now shows why sign-in failed (?signin=off|cancelled|expired|x_error) inside the sign-in card (data-testid sign-in-error); it used to fail silently.
- Pending from before: dark invite houses next to yours, poorer/richer section assets, finish invite-3 flow, full testing_agent run of tour/next moves/share cards.

## 2026-10-29: House share card v3 (rank, big face, real house close-up, invites)
- Card 1200x630: left = close-up 3D snapshot of the exact house (zoom 185, house left/low, face pin on the roof); right panel = big avatar + name + @handle, "#rank of N" + points, progress bar to uptown, "MY 3 INVITES" row (lit faces, grey dark faces, "+ open lot"), CTA.
- Dark (reserved) card: "SAVED FOR YOU BY" box with inviter face + handle, sign-in nudge.
- CARD_VERSION=3 in card payload busts old cached cards; share url is /api/s/{h}?v=<hash> so X re-crawls when the card changes; share/og text now include rank on first share.
- Frontend snapshot key has SNAP_VERSION so every player's browser re-shoots the close-up on next visit. Players who haven't revisited get the drawn fallback scene with the same panel.
- Tested: iteration_12 (backend 9/9, frontend 100%), tests in backend/tests/test_share_card_v3.py.

## 2026-10-31: Building up when the city is full (Stacks Phase 1 verified + Phase 2 built)
- Phase 1 (rules in backend/stacks.py, rendering in city3d/layout.js addHome + modern.js fd0-3/fdcap/fu0-1/fucap) verified on a full preview city: crooked container/plywood floors with a tarp cap on the Docks, glass floors with a roof garden uptown, faces on every floor.
- Preview data (user chose to KEEP it): 251 sample residents (`sample: true`) fill all 200 ground spots + 52 floors. Seeder backend/tests/seed_full_city.py (one-shot), faces saved to frontend/public/sample-faces by backend/tests/sample_faces.py (DiceBear rate-limits browsers).
- House card: building block (floor list top first, "Floor N of @x's building" / "N people live on this building", "#N tallest", 𝕏 Share my building for lit owners). Next move card: "N people live on my building · #N tallest" + 𝕏 Share. Hover tooltip shows floor/building.
- Tallest buildings leaderboard: tap the "N floors built" chip (place card id "towers", also /?place=towers). Hall rules mention building up.
- Tower share card: GET /api/residents/{h}/tower.jpg (backend/tower_card.py) + share page GET /api/t/{h} (OG for bots; humans land on /?at=owner and get the xf_invite cookie so they move in on top). /api/residents/{h}.tower_share only for the ground owner.
- Ledger: paper stores towers (top 5 with grew since the last paper) + heights; facts and the AI prompt cover towers; plain fallback has tower stories; Newspaper "Tallest Buildings" box + "Floors built"; paper card adds "Floors built". Floor arrivals' moved_in events carry on_h/lv (ticker: "moved in on floor N of @x's building").
- Share card v4: "of N on the ladder · uptown" wording, invites show "open floor" once the ground is full.
- Tested: iteration_13 (backend 14/14 tests/test_floors_towers.py + floors_sim + floors_events_sim, frontend all flows). Fixes after: tower_share owner-only, URL ?place cleared on paper close, close-button testids, shorter leaderboard rows.

## Backlog
- P1 Phase 3 stacks: residents name their building together, inside-building view, penthouse (top floor) perk.
- P1 Progressive 3D loading (one Suspense boundary holds the whole city until every model loads; ~10s on a cold load).
- P2 Cache load_buildings per town version (scans all residents per /residents and card request).
- P2 Drawn fallback share card shows a lone house for floor residents (real players get the 3D snapshot).
- Earlier P1/P2 items above still open (data-testids across v3 UI, mobile sign-in card overlap, 2D route clean-up).
