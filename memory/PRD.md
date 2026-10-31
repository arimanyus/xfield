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

## 2026-10-31: Bigger houses on their land
- city3d/layout.js: every house (lots and Docks) now scales to fill its lot (LOT = 0.98 of a tile, was shrink-only to 0.86, so most homes grew ~25%); stacked floors, their spacing and roof caps scale with the house under them.
- Verified by screenshots (uptown, Docks towers, floors aligned). Then published to live.
- Note: Docks blocks keep gaps where residents moved uptown (slots aren't compacted) — possible follow-up.

## 2026-10-31: 2x2 house blocks, admin panel, billboards
- House lots now sit in 2x2 blocks (backend town.py BLOCK=2, HOMES_PER_BLOCK=4, CITY_MARGIN=4; CIVIC_BLOCKS range(-4,6) keeps the same 20x20 civic lots). Frontend layout.js: civic core, downtown ring and Docks use "big blocks" (2x2 house blocks, 5 tiles, no inner streets; BIG/BIG_W/SIDE/bigLot); 16 shacks per Docks block; land widened to cover the Docks strip. Existing districts re-pack into the new blocks on the next refresh.
- Admin panel at /admin (password = ADMIN_KEY; POST /api/admin/login -> httpOnly xf_admin cookie, 12h; X-Admin-Key header still accepted). Tabs: Live stats (lit/dark/hidden, sign-ups, votes, share clicks + X previews, ground, uptown, latest Ledger, top 5, tallest 5, newest 8; refresh 15s), Billboards, Residents (search, hidden only, set points, move uptown/Docks, hide/unhide), The Ledger (edit headline/stories, publish fresh now), City limits (ground spots + move-ins/hour stored in db.meta settings, reloaded every 30s).
- Billboards: 6 fixed slots (hero huge downtown north of City Hall, west, east, corner, ledger, docks yard) — image (object storage, browser-shrunk, re-encoded <=2048px) + caption + link; rendered by city3d/Billboard.jsx facing the camera; click opens link. First upload to a never-saved slot stays off. Hero is switched on with no picture, ready for the owner's Sydney Sweeney image.
- Security: client_ip() now takes the rightmost X-Forwarded-For hop that isn't the load balancer or Cloudflare (was spoofable); admin routes use dependencies=[ADMIN] so unauthenticated calls get 401 before body validation.
- Share-link tracking: /api/s, /api/t, /api/p log db.share_visits (bot = X preview).
- Tested: iteration_14 (backend 39/39 + regressions, frontend all admin flows, 3D blocks + billboards). Fixes after it verified by curl/pytest/screenshot.
- Not yet published to live.

## 2026-10-31: A Fuller City Phase 1 (Millionaires' Row, downtown fill, grittier Docks)
- City (city3d/layout.js + fill.js + rng.js, models in modern.js): Millionaires' Row on the 3 front downtown plots (#1/#2 estates, #3-#10 villas; gold/silver trim, "#N THIS WEEK" stand signs, holder's face); before the first handover the empty mansions show "HANDOVER MONDAY" signs (after: "FOR SALE" for empty seats). Financial District towers (2 back plots), Library/Museum + Cinema/Grand Hotel (2 west plots), plazas with food trucks/kiosks round the billboard plots, shops/cafe/pharmacy/gym/laundromat/playground/garden on empty lots, fenced building sites with @handle on lots of people still on the Docks, outskirts landmarks (Stadium, Amusement Park, University, Central Station + train, Airport).
- Docks: mud, chain-link fence + DOCKS gate, burning barrels, bulb poles; a row of warehouse yards always sits between the Docks and the city. City3D.jsx renders smoke puffs, low grey haze and bare bulbs (Smoke/Haze/Bulbs, instanced).
- Mansions backend (mansions.py rules, server.py): db.mansions one doc per week; GET /api/town has mansions + next_handover; resident payload `mansion` with share text/url/card; /api/residents/{h}/mansion.jpg (mansion_card.py) and /api/m/{h} share page (OG for bots, 302 + invite cookie for humans). Holders who leave/are hidden are reseated. Cron mansion-handover Mon 09:00 UTC -> /api/cron/mansions (skips if this week's row was already handed out, so a manual hand-out mid-week does not block Monday), then prints the Ledger with a Row story.
- UI: house card mansion block (holder sees card preview + "Share my mansion"), Row place card (label "Millionaires' Row" or tap an empty mansion), hover "Mansion #N", City Hall rule, ticker line.
- Admin: Mansions tab (holders with points then/now, next in line, next handover, "Hand out now" with confirm). User chose preview + hand-out button.
- Preview left in the before-first-handover state. /api/auth/me now returns only k/h/name/avatar_url/nb.
- Tested: iteration_15 (backend 12/12 tests/test_mansions.py, frontend flows + 3D checks). Not published to live yet.

## Backlog (Fuller City)
- P1 Phase 2: mansion history, countdown to the next handover, clickable public buildings/landmarks with info cards, day/night traffic in the outskirts, admin renames skyscrapers / sells signs.
- P2 Phase 3: mansion customisation, player-funded public buildings, ferry between the Docks and Downtown.
- P1 Progressive 3D loading (cold load is slow; ~40 s in headless Chrome).

## 2026-10-31: Landmark billboards, city chat, Arrivals at the airport
- Billboards: 3 new admin slots (backend BILLBOARDS + layout BILLBOARD_SPOTS): Stadium big screen (back corner of the stadium), Airport terminal (behind the terminal), Central Station (north of the station). Placed by fill.js addOutskirts via ctx.addBoard(slot, x, z, lift); Billboard.jsx takes a lift override. Left switched off with no picture for the owner to fill.
- Arrivals moved to the airport: City3D ArrivalsBoard (flight board "✈ ARRIVALS / XFIELD INTL", last 3 arrivals with "● LANDED", waiting crowd), label "✈ Arrivals". The old downtown block (0,2) is now a plaza.
- City chat (one room): GET /api/chat (public, last 50 or ?after=<at> + removed ids, me.muted), POST /api/chat (signed-in lit residents; 280 chars; blocked words; 8/minute flood guard; muted -> 403). db.chat {id,k,h,a,text,at,deleted,deleted_at}; residents.chat_muted. Badges: Docks / Uptown / Mansion #N. Frontend city3d/Chat.jsx: pill with unread badge (first visit starts at 0), panel polling 3 s open / 15 s closed, @mentions open houses.
- Admin Chat tab: last 100 messages (remove = soft delete), mute/unmute, muted list.
- Tested: iteration_16 (backend 11/11 tests/test_chat_billboards.py + regressions, frontend all flows). Fix after: first-visit unread count.

## Backlog additions
- P2: stadium big screen can sit under the minimap in the default desktop view (pan to see it).
- P2: chat reactions / reply-to, chat mention notifications.
