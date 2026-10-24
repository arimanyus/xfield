# XField: where we are

*Snapshot: Saturday 24 Oct 2026*

## The pitch in one line

XField is a city built from who talks to whom on X. You type your handle and your house goes up. The 8 people you talk to most get houses waiting next to yours. When they move in, their lights come on and your building grows.

## How we got here

Each version taught us something, so this history is worth knowing.

| Version | What it was | Why we moved on |
|---|---|---|
| 1. "Lost episode" | A Simpsons-style episode that "predicted" you | The personal-prediction angle didn't make sense |
| 2. Springfield, X | A flat cartoon town made from your X circle, with reserved houses for friends | The core idea worked, but the visuals were 2D and there was nothing to do after the first look |
| 3. Field war | A daily territory war: tap to claim land, raids, shields, a nemesis, co-owned towers, a leaderboard | Friends signed in, raided a few times and left. It felt like a chore, and posts like "I took your floors, @x" read as hostile |
| 4. **Now: a show about your scene** | A bright 3D city that changes because real things happened on X, with a daily paper and a live ticker | Current direction |

The big lesson from the field war: **the first look is the whole product.** People came for "see myself and my people as a city", not for a game to grind. What was missing was a reason for the city to look different the next time they visited.

## What a new visitor experiences today

1. **Sign in with X** (or type any handle). We read their recent public posts and find the 8 people they reply to, quote and mention most. That's their circle.
2. **Their house goes up.** Each circle member who isn't in XField yet gets a dark, "reserved" house nearby.
3. **Arrival card.** This replaced a three-screen rules tour. It reads "Welcome home, @you", names your district and the two people you live next to, lists who hasn't moved in yet, and shows the AI-written sign on your roof. It has two buttons: **𝕏 Post your block** and **Look around**.
4. **Your street bar** sits in the corner. It shows your street's faces and "N of M moved in", plus the Post button.
5. **When a friend moves in**, their lights come on, your building gains a floor, and you get a live toast: "@x just moved in next to you · 🔥 Roast them."
6. **When you come back after time away**, a "While you were away" card lists what changed.

## The rules that matter

### Building height
- Your building has **1 floor plus 1 for each circle member who has moved in**, so it ranges from 1 to 9 floors (`street_floors` in `backend/town.py`).
- Height is drawn in three sizes: **1–2 floors is a house, 3–5 a mid-rise, 6+ a tower.**
- Each size has 4 designs, picked by your **trade** (lab, shop, studio or exchange), which the AI decides from your posts each week.
- Lit buildings carry the owner's **profile picture** in a round frame. Dark, reserved houses show no face and have grey glass, so a face means "moved in".

### Districts
- **A district is one person and their mutuals.** Two people are mutuals when each talks to the other.
- The person with the most mutuals not yet in a district hosts one, then the next person, and so on. A district needs at least 6 people.
- Each district gets an AI name, a colour, a landmark and whole city blocks of its own. Its label is a row of faces: the host first, then the tallest members.
- Districts also have a message board, a leader, and elections that open once 3 people have moved in. These are older features that are still in the code.

### Roof signs ("roast your neighbour")
- Each week the AI writes three signs per person from their own posts: **Pun, Savage and Soft.**
- Click a neighbour's house and pick one of their three for their roof. It goes up "by @you" with an "𝕏 Post it" button. You can always pick your own sign back.
- On a dark house the button becomes "𝕏 Tag them", which invites that person.

### No brand publicity
- The AI is told not to name products or companies in signs or in the paper, and shop signs and website links were removed. Brand names can still appear inside quoted posts, because those are people's own words.

## Downtown: five buildings with a purpose

The middle of the city used to be about 50 generic skyscrapers. Now it's mostly parks, plus five buildings that each open a panel:

| Building | What it does |
|---|---|
| 🏛 **City Hall** | City stats and how the city works |
| 📰 **The Timeline** | Recent city events and what residents are posting |
| 🗞 **The Ledger** | **The daily paper**, and a link to the weekly census |
| 📮 **Post Office** | People on your street who haven't moved in, each with a "tag them on X" button |
| 🛎 **Arrivals** | The six newest residents, shown on a big screen at a concert garden |

## What keeps the city changing

- **Live ticker** along the bottom of the screen: who moved in, new districts, new paper issues, and each resident's latest real post. Click an item to fly to that person's house.
- **Daily paper (The Ledger).** Everyone is re-read once a day (about 17 minutes for 200 people). Then one AI call turns the changes (new posts, follower changes, bio changes, city jobs) into a headline, two to five stories and some quotes. Quotes are picked from real posts by ID, so the AI can't invent them. It has a share card that tags the people featured.
- **Weekly census.** A stats snapshot every Monday: population, fastest-growing district, tallest buildings and newest arrivals. It has its own share card.
- **City jobs.** The AI gives each resident a weekly job, such as "Night Owl", "Hype Man" or "Bug Hunter".

## Look and feel

- Daytime, flat and bright. Night mode was tried and reverted.
- **One visual style.** Every building is generated in code (`frontend/src/city3d/modern.js`), in warm off-white with district colour on roofs, awnings and trim. Only roads, street lamps and cars come from model files, all from one Kenney kit.
- Pedestrians walk the pavements, cars drive the roads, and trees and parks fill the gaps.

## Sharing and growth loops

- **"Post your block":** a 3:4 image of your street that tags the friends whose houses are waiting. Being told "your house is ready" is a nice tag to get, not spam.
- **Roof signs:** "@x put this on my roof" is a funny post people happily reshare.
- **The daily paper** tags everyone it features.
- Shared links show a preview card on X. Clicking one opens the city at that person's house.

## Tech in one paragraph

The backend is FastAPI with MongoDB, using a free X reader with several fallbacks and Claude for the AI writing. The frontend is React with React Three Fiber for the 3D city. The city is **capped at 200 residents** (`TOWN_CAPACITY`). A dev mode seeds fake crews so the city looks populated locally.

## Known gaps and limits

- **We can't see what real friends did.** The local database only has seeded test accounts, so we have no real usage data. We need analytics on staging to know whether people come back.
- **The AI paper hasn't been tested end to end.** The AI key is rejected on the dev machine, so locally the paper always falls back to a plain version. Check it on staging.
- **The X reader is shallow.** It sees about 25 recent posts and no engagement numbers (likes, views). Replies to others are mostly invisible, so circles lean on mentions and quotes.
- **Posts have no dates.** A post counts as "new" if it wasn't there at the previous read.
- **Some old integration tests fail** because they still test removed features (raids, the old allies option). The current unit tests pass.
- The old 2D town page still exists alongside the 3D city and has some stale text.

## Ideas on the table (not built)

- **Weekly "opening" episode.** A 20–30 second time-lapse fly-over of what changed in your corner of the city, inspired by the HBO *Silicon Valley* opening, with a "main character of the week" on a blimp.
- **Changes driven by X activity.** Follower growth makes a building rise, a bio change swaps its look, a new back-and-forth between two people builds a bridge between their houses, and two quiet weeks bring down the shutters with a "for lease" sign.
- **Retention ideas from the team's list, in honest form (real data only, nothing fake):**
  - a "while you were gone" teaser with tap-to-reveal;
  - real rescue stories ("@x held your fence");
  - the city visibly fading while you're away and coming back when you return;
  - surprise welcome-back rewards;
  - a next-issue countdown with an opt-in reminder;
  - opening on your own familiar blocks;
  - optional ambient city sound;
  - an opt-in come-back email.
- **Ruled out:** recaps or notifications about things that never happened, fake actions attributed to real X users, reminders that are switched on by default, and features made deliberately hard to turn off. Every name in XField is a real person, so fake activity is effectively putting words in their mouths. It's also a trust and legal risk.
