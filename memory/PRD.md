# Already Aired — PRD

## Original problem statement
"I wanna build an app with virality factor on X — people put down their X username and get something out of it — at the crossroads of Simpsons predictions. Something unique with value, curiosity and network effect."

## Current direction (2026-06 pivot, user request)
"I need cartoonish, uncommon yellow simpsons like website. Redraw every bit of it and simplify it all." + "the whole prediction of a user angle is not making much sense. do a static timeline first and then perhaps maybe we'll talk".
- Look: **Springfield sky** — blue sky gradient, drifting puffy clouds, Simpsons yellow, thick wobbly black outlines, hard pop shadows.
- Scope: ONE static page — the real Simpsons predictions timeline. User-episode flow (handle input, episodes, share cards, leaderboards, handle pages) is removed from the frontend for now.
- User is very sensitive to small fonts / text-heavy UI → big bold type, minimal copy.

## Architecture (now)
- **Frontend** (React 19, Tailwind, framer-motion, lucide-react): single catch-all route → `TimelinePage`.
  - `src/data/predictions.js` — 24 static, non-tragic predictions (id, code, title, aired, event, gap, gap_label, category, headline, detail, featured), sorted by came-true year.
  - `src/data/look.js` — category colours, per-prediction lucide icon, gap label.
  - Components: `Sky` (fixed gradient + 7 drifting SVG clouds), `WobbleDefs` (SVG turbulence filter `#wobble` used by `.toon::before`), `Hero` (logo, count pill, H1, CTA, TV + donut art, `Stats`), `FilterChips` (sticky, counts), `Timeline` (year bubbles, central spine desktop / left spine mobile, alternating cards, spring reveal), `PredictionCard` (icon, episode, headline, detail, gap sticker, Aired → Came true tags), `Footer` (SVG hills, disclaimer, back to top).
  - Fonts self-hosted in `public/fonts/` (Luckiest Guy display, Fredoka headings, Nunito body). Art in `public/art/` (tv.webp, donut.webp, og.jpg). OG/Twitter meta in `index.html` (summary_large_image).
  - Deep links `/#<id>` reset the filter to all and scroll the card in.
- **Backend** (FastAPI + Mongo, untouched, dormant): still contains the old user-episode pipeline (X reader, Claude writer, FLUX stills, PIL share cards, `/api/timeline`) — not used by the new site; kept in case the user angle returns.

## Implemented
- Phase 1 MVP + iterations 2–17 (old dark VHS app with X-handle episodes) — see git history.
- **2026-06 — Full rewrite**: Springfield-sky cartoon static timeline (24 predictions, category filters, stats, deep links, hills footer, OG meta). Old pages/components deleted. Tested: iteration_7 (frontend 100%).
- **2026-06 — Card pictures** (user: actual Simpsons family is OK): every card now opens with a big 16:9 Simpsons-style scene (`public/art/cards/{id}.webp`, 960×540, lazy-loaded), drawn once with FLUX dev via the universal key by `backend/scripts_card_art.py` (scene prompts per id; skips existing files — delete a file and rerun with its id to redraw). Round category icon now overlaps the picture's bottom-left. Self-tested desktop + mobile (24/24 images).
- **2026-06 — Flat look**: user found the hard black offset shadows "vibecodey" → removed every offset shadow (cards, stats, stickers, chips, buttons, year bubbles, icons, title, hero art). Style is now flat cel-cartoon: thick wobbly outlines only. Do NOT reintroduce neo-brutalist offset shadows.

## Backlog / next
- Wait for user feedback on the static timeline before re-introducing any user angle.
- P1: per-card "Share on X" (deep-link + pre-filled post), a per-prediction OG image for unfurls.
- P1: "Still waiting" section — famous Simpsons predictions not yet come true.
- P2: rethink the X-handle hook (only after the user decides); share card redraw in the new style (user said yes, deferred because the user angle is paused).
