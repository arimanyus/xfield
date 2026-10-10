# Already Aired

Enter an X handle and the app reads that account's public posts, then finds the "lost episode" of a 30-season yellow cartoon that predicted that person — one thing that already came true, two that are still coming. A shareable cartoon still, built to be posted and to pull friends in.

## Who it's for

- People on X who want a funny, personal thing to post about themselves (the main spreader).
- People who want to roast a friend by "finding the episode about them" and tagging them.
- Lurkers who arrive from a shared link and want their own in under a minute.

## Why this format (the network-effect question)

The Simpsons meme has two halves: "they predicted it" (proof from the past) and "it came true" (the payoff). Only the first half is instant. So the card leads with a past "prediction" that nails who the person is today — that is the screenshot moment and the reason to post now. The two dated future prophecies are the hook to come back, check, and post again ("it happened"). Spread comes from three loops: the share link unfurls into the card image on X, "prophesy a friend" tags someone who then wants their own, and every handle accumulates a public page of episodes about them, so popular handles become destinations. Future-only would be slower to spread (nothing to verify yet); past-only has no reason to return.

## How the app learns about a handle (free first, paid optional)

Free sources first, in a fixed order, each tried only if the one before returned nothing:

- **1. nitter.cf (prime source, free, no key):** verified working today — `nitter.cf/<handle>` returns the name, bio, location, profile picture, follower counts, pinned post and the latest ~20 posts; `nitter.cf/<handle>/rss` returns the same posts in a clean machine-readable feed, which is what the app reads. Reposts are tagged "RT @…" and replies "R to @…", so the app keeps only the person's own original posts (fetching a second page when the first is mostly reposts). Protected accounts return nothing.
- **2. X's embed/timeline feed (backup, free, no key):** the feed that powers "embedded timeline" widgets on websites; returns bio, picture and roughly the last 20 original posts. Rate-limited to about 30 lookups per 15 minutes per server.
- **3. FxTwitter profile API (backup for the profile only):** name, bio, picture and follower counts when neither feed above answers — enough to write a decent episode from the bio alone.
- **4. Three quick taps (last resort):** when nothing could be read — all sources down, protected or brand-new account — the person answers what they do, their vibe, their obsession. The flow never dead-ends.
- **Caching:** every handle's profile and posts are cached for 7 days, so repeat lookups during a viral spike, handle pages and leaderboards never re-hit any source. Lookups are spaced out so the app behaves like a polite visitor, not a scraper.
- **Honest risk:** nitter.cf is a donation-run community mirror of X; X has shut such mirrors down before and the instance can throttle or vanish without notice. The mirror address is a setting, so another Nitter instance can be swapped in without a code change, and the chain above is what keeps the product alive if it goes. A pay-per-use slot (twitterapi.io, about $0.003 per handle) stays wired but off until a key is added. No X developer account is ever required.

## Core features and experience

**Find your episode**
- Enter an X handle (no account, no login).
- The app reads the public posts and bio. One confirmation screen: "We read @handle as: builder · chronically online · obsessed with AI" with the three labels tappable to change. When nothing could be read, the same three choices are asked one at a time (about 12 chips each, plus "something else").
- Spice toggle: Roast (default) or Savage. Savage goes after ego, habits and online behaviour — never identity, body, or anything hateful.

**The episode card**
- Fake episode metadata: season, episode number, "aired" date in the late 90s / early 2000s, an episode title that spoofs their life.
- An AI-drawn yellow-cartoon still of them in the scene, framed like a TV capture with a subtitle bar. The real profile picture is used as a reference so the cartoon character resembles them; if the picture is unavailable or the AI declines to draw it, a generic character is used.
- Three lines: ALREADY HAPPENED (the roast of who they are now, rooted in their actual posts), COMING <next year> (a near prophecy), COMING <3–7 years out> (a far prophecy). Lines can quote or paraphrase a real post so the proof feels uncanny.
- Text appears within a few seconds while the picture finishes; the whole thing lands in roughly 10–20 seconds behind a "searching the archive" TV-static animation.

**Share**
- Share to X with a pre-written post ("The show predicted @handle in 1998. Episode: <link>"), copy link, download the image.
- Every episode has a public link that unfurls into the card image on X and other apps.
- The public episode page shows the card and a big "Find your episode" button — the loop for arrivals.

**Prophesy a friend**
- Enter the friend's handle and your own; their posts are read the same way, no taps needed. The card says "about @friend · found by @you"; the share post tags the friend.

**Handle pages**
- Every handle has a page with their picture, bio and all episodes found about them, newest first, with "Find another episode about @handle".

**Leaderboards**
- Most Prophesied: handles with the most episodes made about them (today / all time).
- Top Prophets: handles that found the most episodes for others.
- Most Shared: episodes with the most share clicks.

**Safety and cost control**
- Handles validated to X's format; a handle that returns no profile is still allowed via the three taps.
- Blocklist for slurs/sensitive terms in handles and free-text answers; the AI is instructed to stay off protected characteristics, health, family, and real-world harm, and to use only what the person posted publicly.
- "Report this episode" on every card; three reports hide it automatically.
- Limit of a handful of episodes per visitor per hour to keep AI costs predictable.

## User flow

1. Land on the page: headline hook, a handle input, a live ticker of recently found episodes.
2. Type a handle, choose "it's me" or "it's a friend" (friend flow asks for your own handle too).
3. "Reading @handle…" — a second or two. Confirm or tweak the three read labels (or answer the three taps if nothing was read). Pick Roast or Savage.
4. "Searching the archive…" — static, a season/episode counter rolling, the episode text types in, then the still fades in.
5. Episode card. Share to X / copy link / download. Below: "Prophesy a friend" and "See all episodes about @handle".
6. Friend sees the post, taps the link, sees the card, taps "Find your episode" → back to step 2.
7. Leaderboards reachable from the top of every page.

## UI/UX feel

Late-90s broadcast archive: deep ink-blue background, one warm cartoon-yellow accent, chunky condensed display type, CRT scanline and grain overlays, VHS-style timestamps and "ARCHIVE" labels. The card is the hero object everywhere — a 16:9 still with a subtitle bar, framed like a paused tape. Interactions feel like a TV: static flicker while generating, a channel-change wipe between steps, counters that roll. Mobile-first, one-thumb flow, since nearly all traffic arrives from the X app. The share image is rendered at the size X expects so link previews are crisp.

## Implementation phases

**Phase 1 — MVP (built now)**
- Landing with handle input, me/friend choice, free post-reading (nitter.cf first, then backups) with 7-day cache, confirm-or-tweak screen, three-tap fallback, spice toggle.
- AI-written episode (title, metadata, three lines grounded in real posts) and AI-drawn cartoon still using the profile picture as reference.
- Episode card page with share to X, copy link, download; link previews that show the card image.
- Handle pages, leaderboards (Most Prophesied, Top Prophets, Most Shared), recent-episodes ticker.
- Reporting with auto-hide, blocklist, per-visitor limits; inactive paid-provider slot.

**Phase 2 — Payoff and claim**
- "Came true" / "Nope" votes on future prophecies, with a verified-prophecies feed and an accuracy leaderboard.
- Sign in with X to claim your handle: pin a favourite episode, hide episodes about you, see who prophesied you.
- Email reminder when a prophecy's year arrives; re-roll for a different episode; duo episodes starring two handles.

**Phase 3 — Reach**
- A house X account that auto-posts the day's best episodes and weekly "season finale" recaps.
- Switch the paid post-reading on and read deeper history (top posts of all time) for sharper episodes.
- Embeds for newsletters/sites, more languages, premium poster-quality stills.

## Assumptions

- Post-reading is free-first in a fixed order — nitter.cf, then X's embed feed, then FxTwitter for the profile — with the three taps as the last resort; a paid provider slot stays off until a key is added. Any free source may break or throttle at any time; the fallback chain is what keeps the product working, the swappable mirror address and the paid slot are the fixes for outages and scale.
- Only the person's own original posts (not reposts or replies) and their bio feed the episode; roughly the latest 20 are used.
- Reading someone's public posts to joke about them is done without their consent, like xholic and similar tools; only public posts are used, protected accounts are never read, and anyone can report an episode about them. Phase 2 adds claiming a handle to hide episodes.
- App name "Already Aired" and the in-universe show "The Fortunes" are placeholders; both are original and avoid Simpsons names, characters, catchphrases, logos and fonts — the resemblance is in the genre (yellow cartoon family, decades of episodes), not the brand.
- Card format is one past "prediction" plus two future prophecies, chosen because it answers the spreading question above.
- Both spice levels are offered as a toggle; Roast is the default, Savage is opt-in and still rules out hateful or identity-based content.
- Writing and images use the Emergent universal AI key (Claude for the writing, Gemini image generation for the stills); the user can swap in their own keys later.
- The cartoon likeness is best-effort: a resemblance, not a portrait; the AI may decline for some public figures, in which case a generic character is drawn.
- No login or account of any kind in Phase 1; the handle typed in is taken on trust. A "found by @you" credit on friend cards is also unverified.
- Everything generated is public by default and appears on the handle page and leaderboards; removal in Phase 1 is via the report button only.
- No X API and no posting on anyone's behalf: sharing opens X's own compose screen with text prefilled.
- Rate limit of about 5 episodes per visitor per hour; one episode is generated per request.
- English only; prophecy years are "next year" and "3–7 years out" from the day of generation.
- Generated images are kept permanently so old share links keep working.
- The site is a web app optimised for phones, not a native app.
