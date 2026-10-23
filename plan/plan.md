# XField: Sign in with X, Weekly Census, and Living Streets

XField is a cartoon isometric town where every X account gets a house next to the people it actually talks to. There are only 100 spots. This round gets "Sign in with X" working, adds a weekly census card people can share, and lets the streets change as people's conversations change.

## X Developer Console values (paste these now)
- **Callback URI / Redirect URL:** `https://xfield-dev.preview.emergentagent.com/api/auth/x/callback`
- **Website URL:** `https://xfield-dev.preview.emergentagent.com`
- **Type of App:** Web App, Automated App or Bot
- **App permissions:** Read
- After you save, X shows a **Client ID** and a **Client Secret**. The Client ID is already saved. The Client Secret goes into the secure box that opens when the build starts. It never goes in the chat.
- After publishing, the live site gets its own address. Add a second callback, `https://<live-address>/api/auth/x/callback`, in the same console screen. X accepts several callbacks.

## Who it's for
- People on X who want to see where they "live" among the accounts they talk to, and tag friends whose houses are waiting.
- The town owner (you), who hides problem houses and keeps the 100 spots worth fighting for.

## Core features and experience
**Already built, checked and fixed first**
- 100-spot town with spaced-out houses, so faces and usernames are readable.
- Lawn signs: each house shows a one-line hot take from that person's posts. The owner can switch it between pun, roast and kind.
- The app is called XField everywhere. Anything left from the old predictions timeline is removed.
- The share card is 3:4 and shows your block and your neighbours. X does not crop it.

**Sign in with X (lights on)**
- Typing a handle puts that house up as "reserved". Only the real owner can turn its lights on, by signing in with X.
- Once signed in, owners can pick their lawn-sign tone. Their house shows as lit for everyone.
- If sign-in fails or is cancelled, a short friendly message appears and the house stays reserved.

**Weekly town census**
- Every Monday the town publishes a census:
  - Population (x / 100, lit vs reserved)
  - Fastest-growing neighbourhood (+N houses)
  - New towers this week
  - Biggest mover
  - Newest lit houses
- It appears as a 3:4 cartoon card in the same style as the house cards, plus a "Census" button in the town header.
- One tap shares it on X with a ready-made post and a link. The link shows the card as its preview.
- Past weeks stay viewable, so people can compare.

**Town refresh over time**
- Each resident's recent posts are re-read about once a week. The reads are spread across the week so X doesn't block them.
- If someone's circle changed, their house moves next to the people they talk to now. New circle members get reserved houses if spots are free.
- Neighbourhoods re-form as people move. New ones get a landmark and a name. Ones that empty out disappear.
- Reserved houses that are still unclaimed after 14 days, and that nobody's circle points to anymore, are demolished. This frees spots under the 100 cap.
- The town ticker announces changes, for example "@x moved to Moe's Back Alley", "New tower on Evergreen Terrace" or "A spot opened up".

## User flow
1. A visitor lands on the town, types their handle, and watches their house and their neighbours' reserved houses go up.
2. They tap "Sign in with X", approve on X, and come back to their house with the lights on.
3. They pick a lawn-sign tone and share their 3:4 card, tagging neighbours whose houses are reserved.
4. A tagged friend opens the link, flies to their reserved house, signs in, and lights it.
5. On Monday, anyone can open the census, see which neighbourhood grew fastest, and share it.
6. Over the weeks, houses shift as conversations change. Visitors come back to see where they live now.

## UI/UX feel
- Same flat cel-cartoon town under a blue sky: thick wobbly outlines, big bold type, minimal text. No hard black offset shadows.
- The census card looks like a cartoon town newspaper or noticeboard, sized for X.
- Moves and demolitions animate gently, for example a moving truck or scaffolding coming down, so changes feel alive and not glitchy.

## Implementation phases
**Phase 1 (built now)**
- Test and fix the latest batch: lawn signs, 100 spots, spacing, XField rename, timeline removal.
- Sign in with X, with the Client Secret collected through the secure box.
- Weekly census card and census page, with sharing.
- Weekly town refresh: re-reads, house moves, neighbourhood re-forming, and clearing out stale reserved houses.

**Phase 2**
- AI-drawn yellow cartoon portraits of owners on the tallest buildings.
- Owners can lock their house in place or remove it from town.

**Phase 3**
- Seasonal skins, such as a Treehouse of Horror Halloween town.
- A house X account that posts the weekly census automatically.

## Assumptions
- The census publishes every Monday at 09:00 UTC and covers the previous 7 days.
- "Biggest mover" means the house that gained the most new neighbours that week.
- Re-reads happen in small daily batches, so each house is refreshed roughly once a week. If X blocks reads, that house waits until the next batch.
- Lit houses move with their circle too. A move only happens when most of their top neighbours have changed, so houses don't jitter.
- Unclaimed reserved houses are demolished after 14 days only if no one's circle still points to them.
- Sign-in asks X only for read access to the person's name, handle and picture. Nothing is ever posted on their behalf.
- Until the Client Secret is added, the sign-in button stays hidden and houses stay "reserved". Everything else keeps working.
- Leftover code from the old predictions app is deleted. Nothing visible changes.
