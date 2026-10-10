# Already Aired — PRD

## Original problem statement
"I wanna build an app with virality factor on X — people put down their X username and get something out of it — at the crossroads of Simpsons predictions. Something unique with value, curiosity and network effect."

## Concept (approved plan)
Enter an X handle → the app reads the public posts → finds the "lost episode" of a fictional 30-season yellow cartoon ("The Fortunes", 1990–2020) that predicted that person: one thing that ALREADY HAPPENED (roast grounded in real posts, with an evidence quote) + two dated future prophecies (next year, 3–7 years out). Output is a 16:9 VHS-framed cartoon still with subtitle bar, built to be posted on X and pull friends in.

Growth loops: share link unfurls to the card image on X; "prophesy a friend" tags someone who then wants their own; handle pages accumulate every episode about a handle; leaderboards.

## Architecture
- **Frontend**: React 19 (CRA/craco), Tailwind, shadcn/ui, react-query, sonner. Self-hosted fonts (Bebas Neue / VT323 / Outfit) at `public/fonts/`. Dark navy + yellow CRT/VHS aesthetic (`design_guidelines.json`).
- **Backend**: FastAPI + Motor/MongoDB.
  - `xreader.py` — post-reading chain: nitter.cf RSS (`NITTER_BASE_URL`, swappable) → X syndication timeline → twitterapi.io (paid slot, off until `TWITTERAPI_IO_KEY` set) → FxTwitter profile → empty (→ three-taps UI). Only original posts (no RT / replies). Polite 1s spacing. 7-day cache (1h for not-found) in `profiles`.
  - `generator.py` — Claude (`TEXT_MODEL`, claude-sonnet-5-5) writes episode JSON; Claude Haiku (`LABEL_MODEL`) extracts the 3 labels; Gemini Nano Banana (`IMAGE_MODEL`) draws the still using the profile picture as a loose style reference (falls back to no-reference, then to a "tape damaged" generic card); PIL composes the 1200×675 share card (OSD labels, subtitle bar, handle/title strip, scanlines).
  - `storage.py` — Emergent Object Storage (`already-aired/cards/{id}.jpg`), local `media/` fallback.
  - `safety.py` — blocklist for handles and free-text labels.
  - Rate limit: `EPISODES_PER_HOUR` per IP (10 in preview; plan says ~5 for prod). Reports: 3 → hidden.
  - OG previews: `/api/s/{id}` serves OG/Twitter-card HTML to bots, 302 to `/ep/{id}` for humans.
- **API** (all under `/api`): `POST /read`, `POST /episodes`, `GET /episodes/{id}`, `GET /episodes/{id}/image`, `POST /episodes/{id}/share`, `POST /episodes/{id}/report`, `GET /recent`, `GET /handles/{handle}`, `GET /leaderboard?type=prophesied|prophets|shared&period=today|all`, `GET /s/{id}`.
- **Routes** (frontend): `/` landing, `/find?handle=&by=&spice=` flow (reading → confirm labels / three taps → generating), `/ep/:id` episode page, `/u/:handle` handle page, `/leaderboards`.

## User personas
- Self-poster: wants a funny, personal card about themselves to post.
- Roaster: finds "the episode about" a friend and tags them.
- Arrival: lands from a shared link, wants their own in <1 min.

## Core requirements (static)
- No login; handle typed in is trusted. Only public posts; protected accounts never read.
- Card = 1 past "prediction" + 2 future prophecies; Roast default, Savage opt-in; never identity/body/health/family/harm.
- Shareable link with image unfurl; copy link; download; prophesy a friend; handle pages; leaderboards; report; blocklist; rate limit.
- Original IP only — no Simpsons names/characters/catchphrases.

## Implemented (2026-06 / env date 2026-10-10) — Phase 1 MVP complete
- Landing (hero, me/friend form, spice toggle, live ticker, how-it-works, latest grid).
- Read flow with confirm-or-tweak labels (chip pickers + "something else") and three-taps fallback.
- Episode generation: text in ~10s, still in ~15–25s (background job; frontend polls every 2s), typewriter reveal, static/rolling-counter loading states.
- Episode page: card, metadata, 3 lines + evidence, Share to X (intent), copy link, download, share counter, report dialog, prophesy-a-friend, CTA.
- Handle pages, leaderboards (3 tabs, today/all), OG previews, caching, safety, rate limit, paid-provider slot (off).
- Tested: 17/17 backend tests + all frontend flows (iteration_1).

### Iteration 2 — Simpsons angle made explicit + real-predictions timeline (user request)
- Hero/CTA copy names The Simpsons openly as the inspiration (nominative use); generated cards keep the fictional show name. Footer disclaimer (not affiliated with The Simpsons / Disney / Fox).
- `backend/predictions.py`: 23 documented, non-tragic Simpsons predictions (episode code, title, aired, came-true year, gap, headline, detail, category, featured flag). `GET /api/timeline` → confirmed (sorted by came-true year) + pending (coming_near/coming_far of latest 60 archive episodes, grouped by year on the client).
- `/timeline` page: hero, category filters, vertical timeline, `#pending` "Your turn on the timeline" section with countdowns per year, CTA. Hash deep links (`/timeline#trump`, `#pending`).
- Landing: `PredictionStrip` under the hero (8 featured calls, "Full timeline (23) →"). Nav: "Predictions".
- Episode page: `TimelineCountdown` block ("Your prophecies join the timeline", countdown to each prophecy year, link to `#pending`).
- Prompt hardened with an explicit forbidden-names list (Homer, Bart, Springfield, …) after one generated title used "Homer".
- Tested: 6/6 backend + all new UI flows (iteration_2); mobile nav logo wrap fixed.

## Known limitations / risks
- nitter.cf is a community mirror and can throttle/vanish; chain + env-swappable mirror + paid slot mitigate.
- Gemini often declines real-person likeness → generic character (`still_kind: generic`); expected.
- Share counts are client-reported (no verification). "found by" credit unverified.
- Leaderboards need volume to be interesting.

## Backlog
**P0 (polish on MVP)**
- Verify OG unfurl on real X post once deployed (needs a public URL).
- Lower `EPISODES_PER_HOUR` to 5 for production.

**P1 — Phase 2 (payoff & claim)**
- "Came true" / "Nope" votes on prophecies; verified-prophecies feed; accuracy leaderboard.
- Sign in with X to claim a handle: pin an episode, hide episodes about you, see who prophesied you.
- Re-roll an episode; duo episodes; email reminder when a prophecy year arrives.

**P2 — Phase 3 (reach)**
- House X account auto-posting daily best + weekly "season finale".
- Turn on paid post-reading (deeper history) for sharper episodes.
- Embeds, more languages, poster-quality stills.

## Next tasks
1. Deploy and test X link unfurl with a live URL.
2. Phase 2: came-true votes + claim-your-handle (X login).
