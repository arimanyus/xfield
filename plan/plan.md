# XField: Building Up When the City Is Full

Once all 200 ground spots in XField are taken, the city grows upwards instead of outwards. Every new player, and every friend they invite, moves in as a new floor on top of an existing building, so nobody is ever turned away.

## Who it's for
- **New players** who arrive after the city fills up. They still get a home with their face on it straight away.
- **Current players** who invite friends or share their card. The people they bring in stack onto their building, which grows taller.
- **The site owner**, who wants the city to keep growing on X without people hitting a dead end.

## Core features and experience
- **200 ground spots, then floors.** The first 200 homes each get their own building, as now. Lit homes and dark homes both count. From home 201 on, every new home is a floor added on top of a building that already exists.
- **Where a new floor goes:**
  1. An invited friend goes on top of the inviter's building, as a dark floor waiting for them to sign in. Before the city is full, invites still get a dark house next door, as now.
  2. Someone who arrives through a player's share link goes on top of that player's building.
  3. Anyone else goes on top of the shortest building on the Docks, so stacks grow evenly.
- **Each floor is a real home.** The floor shows its resident's face. It's lit when they've signed in and dark when they haven't. Dark floors stay dark forever, the same rule as dark houses.
- **Floor residents are full players.** They appear on the vote ladder, vote, get 3 invites, see Next Moves, and get a share card, exactly like ground-floor players.
- **Rich vs poor stacks:**
  - On the Docks, extra floors look patched together: stacked containers, plywood, tarps and ladders, with dim lights.
  - Uptown, extra floors are glass and steel with warm lit windows and a rooftop garden on top.
- **Building info.** Tapping a building lists who lives on each floor, top to bottom. The ground owner's card shows "N people live on my building."
- **Share cards know the floor.** A floor resident's card shows a close-up of their building with their floor marked, plus "Floor 3 of @alice's building", their rank and points, and their invites.
- **City counter.** The city shows "200/200 ground spots · N floors built" so people can see it's building up.
- **No more silent failure.** Today, people who sign in after the city is full get no home and no message. That stops: everyone who signs in gets a floor.

## User flow
1. A newcomer taps "Sign in with X" after all 200 ground spots are taken.
2. The camera flies to their building and a new floor rises on top, with their face on it.
3. Their card reads "You live on floor 4 of @alice's building on the Docks."
4. The usual walkthrough and Next Moves follow: cast votes, share the card on X, invite 3 people.
5. Each person they invite gets a dark floor stacked on their building. When that friend signs in, their floor lights up.
6. A floor resident who wins enough votes moves uptown:
   - They take a free uptown lot if there is one. Otherwise they go on top of the shortest uptown building.
   - Their old floor disappears and the floors above it drop down one.

## UI/UX feel
- Same look as the current 3D city. Stacks read as one building that grew over time, not as separate houses floating in the air.
- Docks stacks look crooked and makeshift. Uptown stacks look tall, clean and bright, which strengthens the poor Docks vs rich Uptown contrast.
- A short rising-floor animation plays when someone moves in. Each floor has a small face badge, like today's house badges.

## Implementation phases
- **Phase 1 (MVP, built now):**
  - Floors start once the 200 ground spots are full.
  - The three placement rules above (invite, share link, shortest building on the Docks).
  - Invites become dark floors on the inviter's building once the city is full.
  - Floor residents are full players.
  - Docks and Uptown floor styles in 3D.
  - Building residents list and the "N people live on my building" line.
  - Share cards with the floor number.
  - The city counter.
  - The rules for moving uptown from a floor.
  - Replacing today's silent "city full" failure.
- **Phase 2:**
  - The daily Ledger reports on towers, for example "Tallest building: @alice, 11 floors" and "XField starts building up."
  - A tallest-buildings leaderboard.
  - A tower share card for building owners.
- **Phase 3:**
  - Tower life: residents name their building together.
  - A view inside the building, floor by floor.
  - The top floor as a penthouse earned by the highest-ranked resident of the building.

## Assumptions
- 200 stays the number of ground spots, and lit and dark homes both count, as today. The number can be changed later.
- Below 200, nothing changes.
- "Invited friends skip the line" means invites always work. Once the city is full there is no line at all: an invited friend gets a dark floor on the inviter's building straight away.
- A building holds up to 12 floors. When a building is full, the next newcomer goes on top of the nearest shorter building in the same area (Docks or Uptown).
- Which floor someone lives on gives no advantage in votes or points in Phase 1.
- A building owner can't refuse floors on their building.
- If a ground-floor owner moves uptown or leaves, the stack stays where it is and the resident on the next floor down becomes the ground floor.
- Before the city is full, a share link only credits the player whose link was used. Their building only gets the newcomer as a floor once the city is full.
- Building floors are added on top of whatever height the building already has from its owner's own progress.
