# Springfield, X — the town built from who talks to whom

A SimCity-style isometric cartoon Springfield where every X account gets a house placed right next to the people it actually replies to, mentions and quotes.
Type a handle, and its house goes up along with a "Reserved for @friend" house for each person in its circle. Each share tags those friends with "your house is ready", so the town grows outward one circle at a time.

## Who it's for
- X users who want to see their circle as a real place, and who love being tagged into something about them.
- Scenes on X (tech, crypto, design, sports, politics) that will see themselves turn into neighbourhoods.
- Curious visitors who want to fly to a friend's or a famous account's house and see who lives around them.

## Core features and experience
- **The town**
  - One big isometric, SimCity-like Springfield you can drag and pinch-zoom. It has grass tiles, roads, houses and landmark buildings, in the flat cartoon style under the Springfield sky.
  - Each house shows its owner's X profile photo and handle.
- **Placement from real conversations:** your house sits closest to the people you talk to most. Clusters of people who talk to each other become blocks and neighbourhoods on their own.
- **Buildings grow with attention:** the more residents talk to you, the bigger your building gets, from a cottage to a house to an apartment block to a tower. Popular accounts become the skyline.
- **Neighbourhoods**
  - Each big cluster gets a Simpsons landmark at its centre, picked by AI from what its residents post about. Tech circles get the Power Plant, crypto gets Moe's, founders get the Kwik-E-Mart, media gets Krusty Studios.
  - Each one also gets a fun AI name like "Power Plant Heights".
- **Move in**
  - Type any X handle, yours or anyone's.
  - The site reads that account's recent public posts, finds up to 8 accounts it talks to most, and builds its house.
  - Every person in that circle who isn't in town yet gets a house under scaffolding with a "Reserved for @handle" sign.
  - The camera flies to the new block as the houses pop up.
- **Lights on:** when anyone types a reserved handle (usually the person themselves after being tagged), the scaffolding drops, the house is finished, and that person's own circle gets added. The town spreads outward from them.
- **"Moved in by" credit:** each house shows who brought it into town. Your page counts how many houses you got built.
- **Share to X**
  - A bold 3:4 card with an isometric close-up of your block: you, your neighbours' photos and the neighbourhood name.
  - A pre-filled post tags up to 3 neighbours: "I'm in Springfield. @a @b @c your houses are ready →".
- **Arrival:** a tagged person opens the link and the camera flies to their own reserved house: "@you, your house is ready. @friend moved you in." One big button reads "Move in".
- **Live town**
  - A "just moved in" ticker, town stats (population, finished houses, biggest neighbourhood) and search to fly to any handle.
- **The real predictions:** the Town Hall landmark opens the existing 24-prediction timeline.

## User flow
1. A visitor is tagged in a friend's post, taps the link and lands on the map flying into their own reserved house next to that friend.
2. They tap "Move in". In a few seconds their scaffolding drops and their own circle appears around them as new reserved houses.
3. A single screen shows their block, neighbourhood name and building size, with one big "Share my street" button.
4. The X composer opens with the card and their top 3 neighbours tagged. Those people get notified by X and the loop repeats.
5. Anyone can drag around, search famous accounts and see whole scenes laid out as neighbourhoods.

## UI/UX feel
- An isometric, SimCity-like town drawn in the Simpsons style. Flat colours, thick wobbly outlines, no hard black shadows, and the current blue sky with drifting clouds above.
- The map fills the screen. Only floating bubbles sit on top: the handle box, search and the ticker.
- Huge bold type, almost no text, and one input or one tap per step. No confirmation screens.
- Satisfying building moments: scaffolding pops off, houses bounce up from the ground, the camera swoops between blocks, and towers rise as accounts get more popular.

## Implementation phases
- **Phase 1 — MVP (built now)**
  - The isometric draggable, zoomable town.
  - Move any handle in, with its circle read from recent posts. Reserved houses go up for that circle, and the lights-on arrival flow finishes them.
  - Placement by who talks to whom, building size by attention, and AI landmark neighbourhoods with names.
  - "Moved in by" credit, search, ticker and town stats.
  - The 3:4 street share card with a post tagging 3 neighbours.
  - The Town Hall link to the real predictions timeline.
  - An owner-only hide button.
  - The old "lost episode about you" feature is retired.
- **Phase 2 — Make the town talk**
  - Lawn signs: a one-line hot take or prediction on each house, in the style of the classic church-sign gag.
  - A weekly "Springfield census" card: fastest-growing neighbourhood and new towers.
  - AI-drawn yellow portraits of owners on the tallest buildings.
  - Circles refresh over time, so streets shift as who-talks-to-whom changes.
- **Phase 3 — Claim and reach**
  - Sign in with X to claim, lock or remove your house.
  - Seasonal town skins, such as a Treehouse of Horror Halloween version.
  - A house X account that posts the census.
  - Optional paid X reading for longer post history and more accurate circles.

## Assumptions
- **Look:** "SimCity-like" means an isometric 2.5D cartoon town that you drag and zoom, not full 3D.
- **Anyone can type any public handle.** People in that account's circle get reserved houses automatically.
  - Only public info is shown: name, handle, photo and the neighbourhood.
  - The site owner can hide any house.
- **Reading X:** handles are read with the current free method, which sees roughly the last 25 posts, so there are no X API costs.
  - A circle is up to 8 accounts that the person replies to, mentions or quotes most.
  - Accounts with no conversations get a house at the edge of town.
  - Protected accounts can't move in.
- **Only typed handles get read.** Reserved houses don't read their owner's posts until someone types that handle. This keeps cost and X throttling in check.
- **Caching and throttling:** every read is cached for 7 days. If X slows the free reading down, the move-in waits a moment ("the movers are stuck in traffic").
- **Tagging:** share posts tag at most 3 neighbours, because heavier tagging can look like spam to X. Tags only happen in the person's own post. The site never posts or tags anyone itself.
- **Cost:** AI is used only for neighbourhood landmarks and names, a tiny cost from the Universal Key balance. There are no per-person images. The town art is drawn once.
- **Layout shifts:** the town re-arranges a little as it grows, so a house can shift a few plots when new friends move in.
- **The Simpsons:** it's a fan site with a visible "Fan site, not affiliated" note. The site name stays "Already Aired" for now, with the map titled "Springfield, X".
- **Language and sharing:** English only, phone-first, and sharing always goes through X's own composer.
