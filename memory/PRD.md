# Already Aired — PRD

## Original problem statement
"I wanna build an app with virality factor on X — people put down their X username and get something out of it — at the crossroads of Simpsons predictions. Something unique with value, curiosity and network effect."

## Direction history
- v1 (retired): "lost episode predicting you" — user said the personal-prediction angle made no sense.
- 2026-06: static Simpsons-predictions timeline in a flat "Springfield sky" cartoon style (still live at `/timeline`). User rules: big bold type, minimal text, NO hard black offset shadows ("vibecodey"), flat cel look with thick wobbly outlines.
- **Now: "Springfield, X — the town built from who talks to whom"** (approved plan, Phase 1 built).

## Springfield, X — product
SimCity-style isometric cartoon town (drag + pinch zoom) under the blue sky. Type any X handle → its recent public posts are read → up to 8 accounts it replies to / mentions / quotes most become its circle → its house goes up and each circle member not yet in town gets a scaffolded "Reserved for @x" house next to it. Typing a reserved handle = "lights on": scaffold drops, house finishes, their circle gets reserved. Buildings grow with inbound attention (cottage → house → apartments → tower). Clusters of 6+ become neighbourhoods with an AI-picked Simpsons landmark + AI name. Share = 3:4 street card + X intent "I'm in Springfield. @a @b @c your houses are ready →". Arrival from a shared link: "Tagged? Tap your face" → fly to your reserved house → MOVE IN. Town Hall opens the real predictions timeline.

## Architecture
- **Backend** (FastAPI + Mongo)
  - `xreader.py` — free X guest GraphQL: `read_handle` (profile + ~25 posts + `parse_circle` weights reply 3 / quote 2 / mention 1), `read_profile_only` (avatar lookups), `Throttled` handling; nitter/syndication/fxtwitter fallbacks.
  - `town.py` — grid (plots where x%3!=2 and y%3!=2; 2×2-plot blocks with roads), `nearest_free_plot`, `free_block_near`, `frontier_target` (no-circle accounts go to the town edge), label-propagation `clusters`, `tier_of`, `djb2` (colour hash shared with the frontend).
  - `town_card.py` — Pillow 1260×1680 card (sky, title, neighbourhood pill, iso street with avatars, landmark backdrop, "@x LIVES HERE", tags, "FIND YOUR HOUSE AT host"). Fonts in `assets/` (Luckiest Guy, Fredoka); landmark PNGs in `assets/landmarks/`.
  - `server.py` — `/api/move-in` (+ status poll; background job: read → circle → place under TOWN_LOCK → refresh neighbourhoods → AI naming with Claude via Universal Key, serialized by NAMING_LOCK), `/api/town` (versioned, `?v=` unchanged short-circuit), `/api/residents/{h}`, `/api/residents/{h}/card.jpg` (disk cache `media/cards/{k}-{hash}.jpg`), `/api/s/{h}` (OG page for bots, 302 to `/h/{h}?arrive=1`), owner-only `/api/admin/check` and `/api/admin/residents/{h}/hide` (X-Admin-Key, constant-time compare, 5 wrong/15 min lockout).
  - Collections: `residents` {k,h,name,avatar_url,bio,posts,status reserved|finished,hidden,x,y,by,by_h,circle[{k,w}],nb,read_at,finished_at,created_at}, `neighbourhoods` {id,anchor,bx,by,landmark,name,named,active,size}, `events`, `jobs`, `profiles` (7-day read cache), `profiles_lite`, `movein_events` (TTL rate limit), `admin_attempts` (TTL), `meta` (town version).
  - env: ADMIN_KEY, MOVEINS_PER_HOUR, TEXT_MODEL (naming), EMERGENT_LLM_KEY.
- **Frontend** (React, Tailwind, react-zoom-pan-pinch)
  - Routes: `/` and `/h/:handle` → `TownPage`; `/timeline` → static predictions timeline (with back-to-town link).
  - `lib/iso.js` (world projection, building geometry), `components/town/*` (TownMap SVG + Ground/Tree/Building/Landmark/LandmarkLabel, TownHeader, SearchFly, MoveInBar, Ticker, ResidentSheet, ArrivalSheet, Sheet), hooks `useTown` (15 s versioned poll), `useMoveIn`, `useTownAnims` (pop-in / lights-on).
  - Landmark art: `public/art/landmarks/*.webp` (town_hall, power_plant, moes, kwik_e_mart, krusty_studios, elementary, stadium, comic_shop, lard_lad, channel6) + `src/data/landmarkMeta.json`.
  - "me" handle in localStorage `aa_me` (first handle moved in, or the face tapped on arrival) → used as "moved in by" credit; owner mode via `/?admin=KEY` → localStorage `aa_admin`.

## Implemented
- 2026-06 — Static timeline rewrite + card pictures + flat look (iteration_7).
- 2026-06 — **Springfield, X Phase 1** (iteration_8: backend 17/17, frontend 100%): isometric town, move-in with real circles, reserved/lights-on, placement by conversation, tiers, AI landmark neighbourhoods, moved-in-by credit, search, ticker, stats, 3:4 street card, OG share page, arrival flow, Town Hall → timeline, owner hide. Old episode backend removed (generator.py, predictions.py, old tests).

## Known limits
- Free X read sees ~25 recent own posts (UserTweets); replies to others are mostly not visible, so circles lean on mentions and quotes.
- `/api/town` returns the full resident list on each version change (fine for hundreds of houses).

## Backlog
- Phase 2: lawn-sign hot takes per house, weekly "Springfield census" card, AI yellow portraits for towers, periodic circle refresh.
- Phase 3: Sign in with X (claim/lock/remove house), seasonal skins (Treehouse of Horror), house X account posting the census, optional paid X reader for longer history.
- Tech: delta `/api/town` + viewport culling when the town passes ~1–2k houses; LRU avatar cache.
