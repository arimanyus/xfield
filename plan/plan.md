# XField: A Fuller City, Downtown Mansions and Grittier Docks

The empty parts of the city fill up:
- Downtown's tree plots get mansions for the week's top players, a skyscraper skyline and new public buildings.
- Empty corners of the house blocks get shops, and the outskirts get big landmarks.

The Docks stay on the north shore but look clearly poorer and grittier than the clean main city. The Docks shack showing up next to The Timeline is found and removed.

## Who it's for
- **Players:** a city worth climbing in. Mansions are a visible weekly prize, and the gap between the Docks and uptown is obvious at a glance.
- **Visitors from X:** a busy, lived-in city with real faces on the best homes, which makes them want in.
- **The owner (admin):** a fuller-looking city, a weekly mansion moment to share, and room for sponsors next to the billboards.

## Core features and experience

### 1. Fix: the Docks shack next to The Timeline
- Find what is drawing a Docks-style shack next to The Timeline tower and remove the cause.
- From then on, Docks shacks, Docks floors and Docks junk only ever appear inside the Docks strip.
- At least one row of open ground always separates the Docks strip from downtown and the house blocks, however small or large the city is.

### 2. Grittier Docks, cleaner city (the Docks stay where they are)
- **The Docks:**
  - Ground is mud and oil-stained concrete; there are no trees or lawns.
  - Shacks are rusty and crooked, with tarps, laundry lines, oil drums, smoke from chimneys and burning barrels, puddles and scrap.
  - Lighting is dim and slightly foggy, with flickering bulbs at night.
  - A chain-link fence with a gate runs along the Docks edge.
- **The main city:**
  - Clean pavements, more trees and hedges, flower beds, fountains and benches.
  - Warm street lights and a brighter, fresher colour palette.
- Moving uptown should feel like leaving the slum for the city.

### 3. Downtown fills up
The 7 downtown tree plots that aren't billboard spots each get a job:
- **Millionaires' Row (3 plots, front side, facing the camera): ten mansions for the week's top 10 players.**
  - #1 and #2 get grand estates, sharing one plot.
  - #3 to #10 share the other two plots, four mansions per plot.
  - Each mansion shows the holder's face and a "#N this week" flag. #1's estate is gold-trimmed.
  - The ten visible, moved-in players with the most points get them at the weekly handover, every Monday at 9:00 UTC. Holders keep them all week.
  - The first handover happens as soon as the feature goes live.
  - A mansion is a trophy home: the holder's real house stays where it is.
  - If the admin hides a holder, the next player in line takes that mansion.
- **Financial District (2 plots at the back):** a cluster of office skyscrapers, the tallest buildings in town, forming a skyline behind downtown without blocking the view.
- **Public buildings (2 plots on the west side):**
  - Library and Museum on one plot.
  - Cinema and Grand Hotel on the other.
- **Billboard plots:** the 5 billboard spots keep their billboards and get a small plaza with food trucks and kiosks around the base. A plot still looks lively when its billboard is off.

### 4. The rest of the city fills up
- **Empty lots inside house blocks:** small neighbourhood buildings instead of a lone tree:
  - corner shop, café, pharmacy, gym, laundromat, playground or community garden.
  - When someone new is given that lot, the building makes way for their house.
- **Lots reserved by Docks residents** (the bare brown squares) become small fenced building sites with the owner's handle on a sign. It shows the house that's coming once they make it uptown.
- **Outskirts** (open land around the city), each placed just outside the city edge and moving outward as the city grows:
  - Stadium.
  - University campus.
  - Train station with tracks.
  - Small airport.
  - Amusement park with a Ferris wheel.
  - Wind farm on the hills.
  - A warehouse and industrial yard on the Docks side, which also buffers the Docks from the city.

### 5. Mansion moments
- **Tap a mansion:** a card shows the holder, their rank, their points, "Mansion holder until Monday", and a jump to their real house.
- **Holders:**
  - Their next-move card says "You hold mansion #3 downtown this week".
  - They get a **Share my mansion** button with its own X link preview. Anyone who signs in from it moves in next to the holder.
- **Ticker and paper:** the live ticker announces each handover, and the Monday Ledger runs a "New on Millionaires' Row" story.
- **Admin panel:** a Mansions section shows this week's holders and the next three in line, with a **Hand out now** button.

## User flow
1. A visitor opens XField and sees a full city: a skyline at the back, mansions with faces up front, shops on every block, a stadium and a Ferris wheel on the outskirts, and a dim, smoky Docks strip on the north shore.
2. They tap a mansion and see "@alice · #1 this week · 1,212 points".
3. They sign in and start in a rusty Docks shack. Their future lot in the city shows a building site with their handle.
4. They vote and climb. Moving uptown, their house rises on that lot in the clean city.
5. If they reach the top ten by Monday, they get a mansion on Millionaires' Row. Their next-move card tells them and they share it on X.

## UI/UX feel
- There is a strong visual contrast between Docks and city:
  - Docks: muted browns, rust and grey haze.
  - City: bright, clean and green, with warm lights.
- Downtown reads as the richest part of town: tallest towers, grandest homes, busiest plazas.
- The default camera view stays readable: the skyline sits at the back, mansions and plazas at the front, and labels and faces stay legible.
- Everything matches the existing low-poly XField look and the white-card interface.

## Implementation phases
- **Phase 1 (MVP, built now):**
  - The Timeline shack fix and the guaranteed gap between the Docks and the city.
  - The grittier Docks and cleaner city look.
  - Downtown plots: Millionaires' Row with the weekly handover, Financial District, Library and Museum, Cinema and Hotel, and the billboard plazas.
  - Shops on empty lots and building sites on reserved lots.
  - The outskirts landmarks.
  - Mansion cards, next-move line, share button and X preview, ticker and Ledger story.
  - The admin Mansions section.
- **Phase 2:**
  - Mansion history and a countdown to the next handover.
  - Clickable public buildings with small info cards (e.g. the Museum shows the city's history, the Stadium shows ladder stats).
  - Day and night traffic in the outskirts.
  - The admin can rename skyscrapers or sell their signs to sponsors.
- **Phase 3:**
  - Holders customise their mansion.
  - Player-funded public buildings, unlocked as the city grows.
  - A ferry between the Docks and downtown for big moments.

## Assumptions
- "Same place, grittier look": the Docks stay on the north shore. The separation comes from the look, a fence, and a guaranteed gap of open ground or industrial yard.
- The mansion rules carry over from the earlier mansion plan:
  - top 10 by ladder points;
  - Monday 9:00 UTC handover with an immediate first handover;
  - trophy home only, with no change to anyone's real house;
  - no hand-picking by the admin.
- Downtown split: 3 plots for mansions (front), 2 for skyscrapers (back), 2 for public buildings (west). The 5 billboard plots keep their billboards and gain plazas.
- Skyscrapers, public buildings, shops and outskirts landmarks are scenery in Phase 1: no one owns them and tapping them does nothing yet.
- The bare lots of Docks residents now become building sites with the owner's handle, instead of staying bare as decided earlier. This adds life without moving anyone.
- Shops on empty lots always give way to a new resident's house. The 200 ground spots and floor stacking work exactly as today.
- Outskirts landmarks sit outside the city edge and never take a lot.
- The live site still runs the earlier 4x4 layout. All of this, plus the 2x2 blocks, admin panel and billboards, goes live at the next publish.
