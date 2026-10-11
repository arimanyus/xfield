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

### Iteration 3–4 — "Archive hiccuped" / Cloudflare bug + reliable X reading (user-reported)
- Root causes: one empty Claude response with no retry (→ 502 → error panel) and a synchronous 10–30s POST exposed to Cloudflare/proxy timeouts.
- Episode generation is now a background job: `POST /api/episodes` returns in ~1–3s with `text_status: pending`; `episode_job` writes text (3 attempts: sonnet → sonnet → haiku, 45s each, strict JSON check) then renders the image. Episode page polls every 2s: "SEARCHING THE ARCHIVE…" → card → still. `POST /api/episodes/{id}/retry` re-runs a failed write (no rate-limit charge, cached profile only); UI shows "TAPE DAMAGED" + Try again. Lists exclude pending/failed episodes (`PUBLIC` filter).
- X reading, new order: **X guest GraphQL API** (`from_xguest`: guest token → UserByScreenName → UserTweets, ~25 original posts incl. most popular, `source: "x"`) → Nitter mirrors (`NITTER_INSTANCES`, Cloudflare-challenge detection, 8s per request) → X syndication → twitterapi.io (paid, off until `TWITTERAPI_IO_KEY`) → FxTwitter profile-only → three taps. Overall read capped at 55s.
- Paste-your-posts UI removed per user feedback (backend still accepts optional `posts_text`, API-only).
- Tested: iteration_3 (10/10 backend + UI) and iteration_4 (7/7 backend + UI).
- Risk notes: X GraphQL query IDs rotate occasionally (overridable via `X_GQL_USER_OP` / `X_GQL_TWEETS_OP`); guest tokens have per-token/IP quotas (token auto-refreshes on 401/403/429). If both X and the mirror fail, adding a twitterapi.io key turns on the paid fallback.

### Iteration 5 — Savage default, real Simpsons cast, image share card (user request)
- Spice defaults to **savage** everywhere (API default, toggle order, find flow, handle page); writer prompt rewritten to "go for the throat" within the unchanged hard rules (no protected traits/health/family/harm).
- Episodes are now explicitly lost **Simpsons** episodes: writer returns `cast` (2–4 real characters), Springfield settings, speaker-prefixed subtitles ("KENT BROCKMAN: …"), plus a name-free `scene_visual`. UI shows "STARRING Homer Simpson, Mr. Burns & @handle"; copy, footer ("Fan parody of The Simpsons…"), OG title and share text name the show.
- Stills: Gemini refuses anything evoking the characters, so stills now come from **fal.ai FLUX dev** via the universal key (`falmedia.py`, queue proxy flow) with named cast + an avatar-derived look (Claude Haiku vision); Gemini generic is the fallback. FLUX draws recognizable Homer/Burns/Brockman alongside the user's cartoon self (~16–40s, ~$0.03).
- **Share card is an image**: `compose_share_card` builds a 1080×≥1350 portrait JPEG (still + title + starring + the three prophecy blocks + footer), stored as `cards/{id}-share.jpg`, served at `GET /api/episodes/{id}/card` (falls back to the 16:9 still for old episodes). Share to X: Web Share with the image file on phones; on desktop opens the X composer and downloads the card. Download button downloads the card. OG preview still uses the 16:9 still.
- Tested: iteration_5 (backend + full UI; one new-episode check skipped due to the per-IP rate limit; evidence quote-wrap fixed and old rows cleaned).
- Risk: FLUX output is unfiltered for IP — this is a fan parody by the user's explicit choice; disclaimer in footer.

### Iteration 6 — Savage only + copy diet (user request)
- Roast option removed entirely: `SpiceToggle` deleted, API accepts only `spice: "savage"` (422 otherwise), no `spice` URL params.
- Copy cut hard across the site: hero sub is one sentence, how-it-works section removed, strip/section headings shortened, confirm screen drops bio + hint, taps reason is one line, share hint replaced by a tiny "Preview card" link, countdown/friend/CTA/timeline/leaderboard descriptions removed, footer is one line.

### Iteration 7 — Prediction quality rewrite (user: "predictions are really not good enough")
- Diagnosis: prophecies were vague behaviour jokes ("will post the same manifesto seventeen times"), not prediction-shaped; `already_happened` restated the tweet.
- `generator.py`: new `PROPHECY_RULES` (event-not-behaviour, ≥2 specifics from their real posts, headline present tense, banned openings, "Simpsons test", savage). Writer now returns candidates (2 receipts, 4 near, 4 far); a **critic pass** (`CRITIC_SYSTEM`, same model) scores them and returns the sharpest, tightened lines; `_pick`/`BANNED_RE` fallback if the critic fails. `_verify_evidence` guarantees the evidence quote is a verbatim excerpt of a real post (else swaps in the closest post). Profile block now includes follower count and all 25 posts.
- Found & fixed: Claude Sonnet 5.5 was spending the whole `max_tokens` budget on hidden reasoning → empty output → silent Haiku fallback. Fixed with `reasoning_effort` (`WRITER_EFFORT`, default `medium`, passed via `allowed_openai_params`) + `max_tokens` 3000. Writer+critic ≈ 15s total.
- `backend/scripts_try_write.py <handle>` runs the writer against a cached profile for prompt tuning without burning rate limit/images.
- Self-tested on cached @levelsio/@pmarca/@paulg + one live E2E episode (`/ep/kZDnuYGZ`): episode page and share card render fine at the new lengths.

### Iteration 8 — Desktop share: card goes to the clipboard (user: "share card not working")
- X's web intent cannot attach images, so the desktop composer opened with text + link only. Now `ShareBar` pre-converts the share card to PNG, and on "Share to X" copies it to the clipboard (`ClipboardItem` with a promise, gesture-safe) → opens the composer → toast "Card copied. Paste it into the post (⌘V / Ctrl+V)". Falls back to downloading the card if the clipboard is unavailable; popup-blocked fallback shows an "Open X" toast action. Mobile Web Share (image file) unchanged.
- Verified in Chromium: composer opens, clipboard holds `image/png`.

### Iteration 9 — One episode per handle + share dialog (user request)
- **Episode cache (forever)**: `existing_episode(handle)` returns the latest non-hidden episode that is ready (or pending <5 min). `POST /api/read` short-circuits with `existing_episode_id` (no X read, no labels); FindFlow jumps straight to `/ep/{id}`. `POST /api/episodes` without `fresh: true` returns the existing episode (no rate-limit charge). `fresh: true` forces a new generation.
- **Re-roll**: "Find another episode" link on the episode page (`RerollButton`, reuses the episode's labels, `fresh: true`) → new episode becomes the handle's current one.
- **Share dialog (desktop)**: `ShareDialog` replaces the toast flow — card preview on the left, 3 steps on the right (① Card copied ✓ auto on open, ② Open X button, ③ Paste ⌘V/Ctrl+V and post), plus Download / Copy link. Mobile keeps native Web Share with the image file.
- Verified: `/find?handle=paulg` → instant redirect to existing episode; dialog copies PNG to clipboard and opens the composer; `fresh: true` creates a new pending episode which immediately becomes the handle's current one.

### Iteration 10 — Intuitive flow pass (user: "just want the flow to be more intuitive")
- **Confirm-labels step removed** (`LabelConfirm.jsx` deleted): read → auto-generate with extracted labels; 3-tap fallback only when the account can't be read. Static screens kept per user.
- **Landing form**: one input + "Find the episode"; "Roasting a friend? Add your @ →" toggle reveals the second field. Hero copy: "THE SIMPSONS PREDICTED TRUMP. THEY PREDICTED YOU TOO." + "Type an X handle. Get the lost episode, the receipt, and two dated prophecies."
- **Episode page**: Share to X is a full-width hero button under title/meta; Copy link / Download are text links; prophecies first on mobile (grid row/col placement, no duplicate DOM); timeline countdown + prophesy-a-friend + see-all moved to a secondary section below.
- **Still legibility**: solid subtitle bar, speaker name in yellow VT323 above white 40px dialogue; bigger OSD. Writer prompt: the scene must stage the already-happened moment literally. Aired date/episode number now random in code (model kept picking S12E14 / 2001-02-11).
- **Share card redesign** (`compose_share_card(ep, card16, host, avatar)`): still → "THE SIMPSONS PREDICTED / @HANDLE" headline → episode code/title/aired → "AIRED {year}" block → "CAME TRUE {now}" receipt box rendered like an X post (circular avatar, name, @handle, verbatim quote) → COMING blocks → footer. 1080×≥1350.
- Tested: iteration_6 (backend 10/10 + full UI incl. dialog/clipboard, mobile order, redirects, taps). New-handle auto-generate path (@elonmusk) verified by hand.

### Iteration 11 — Readable share card (user: "X card is hardly readable. USE bold texts, more colors, less text")
- Root cause: `assets/Outfit-Regular.ttf` is the Outfit *variable* font; Pillow rendered it at the default **Thin** instance. `_font()` now sets the variation (SemiBold default, Bold where used) → all Outfit text in stills/cards is bold.
- Share card v3: still → "THE SIMPSONS PREDICTED / @HANDLE" → green **CAME TRUE {year}** chip + green-outlined receipt box (avatar, bold name, quote) → orange **COMING {near}** and sky-blue **COMING {far}** sections with colored bars; 32px SemiBold body, max 3 lines each with ellipsis; dropped the episode-code/title line and the "AIRED" paragraph (less text). `card_url` carries `?v=3` to bust the immutable cache.
- `scripts_rerender_cards.py <host> [handles…]` re-renders stored share cards from the stored 16:9 still (ran for all existing episodes).

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
