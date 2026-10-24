# XField

XField is a 3D city made of people on X. You sign in with your handle and your house goes up, with your face on it. The 8 people you talk to most get dark houses waiting next to yours, and their lights come on when they move in.

Then the city plays one game: **two houses, pick one.** Everyone gets 3 votes a day. Houses that win climb off the Docks, the poor side of town, and move uptown next to their friends.

X is only the door. It gives us your name, your face and your circle. Every score, rank and move in the city comes from votes cast inside it.

## Where things stand

*October 2026*

- The current version is **v3, "Pure Votes"**: the Docks, an Elo ladder, 3 votes a day and a daily newspaper about the city.
- Everything below is built and works locally in dev mode, where seeded fake crews fill the city and bots vote every few seconds.
- **No real users have played it yet.** The next step is staging with real friends and some analytics, to see whether people come back.
- The AI newspaper writer hasn't been tested end to end (the AI key is rejected on the dev machine), so locally the paper always uses the plain writer.

## How it plays

### Moving in

1. Someone tags you, or you find the site. You sign in with X (or, in dev, type any handle).
2. We read your recent public posts and find the 8 people you reply to, quote and mention most. That's your **circle**.
3. Your house goes up on the Docks. Everyone in your circle who isn't in XField yet gets a dark, reserved house in your district.
4. An arrival card welcomes you, says who you live next to and who hasn't moved in yet, and offers **𝕏 Post your block**, a share image that tags the friends whose houses are dark.

A dark house is cleared once it's two weeks old and no longer in anyone's circle. The city holds 200 houses.

### Your house

- A house has **1 floor, plus 1 for each person in your circle who has moved in**, so 1 to 9 floors.
- Uptown you choose your look from 12 designs: 4 homes, 4 mid-rises (need 3 floors) and 4 towers (need 6 floors). More friends moving in unlocks taller designs.
- On the Docks every house is a shack: a tin shed, a stack of containers, a plywood hut or a trailer. The Docks are meant to feel poor, with rubbish bags, junk, rusty cranes, wrecks, trawlers and stained concrete.

### The Docks and uptown

- **Every new house starts on the Docks** with 1000 points.
- At **1030 points** a house moves uptown, to its lot next to its people. The ticker and the paper announce it.
- Once a week, with the census, uptown houses that have dropped below 1030 go back to the Docks. The ticker gives the number of houses that moved down, never their names.

### Voting

- Once you've moved in, a vote card sits in the corner: **two houses, pick one. 3 votes a day**, reset at midnight UTC.
- **"Who should move up?"** When at least two of your people (someone in your circle, or who has you in theirs) are competing and you haven't voted on them today, the pair is two of them, with faces, handles and scores.
- **"Which house wins?"** Otherwise you get two strangers' houses with no names on them.
- Pairs are close on the ladder, never include your own house, and stay put until you vote, so you can't reroll.
- Scoring is Elo with K = 32: **every point the winner gains, the loser loses.** Between equals that's about 16 points. An upset is worth more, up to 32.
- After each vote, the card shows what your vote did: the winner's points gained, new rank, and how far it is from uptown (or "moved uptown!"). Then you tap "Next pair".

### What you see about yourself

- **Wins are loud, losses are silent.** Climbing uptown, into the top 10 or to #1 makes the ticker and the front page. Dropping makes no announcement and names no opponent.
- Your own panel shows your score, your rank, the points you still need for uptown, and your last 10 results, losses included.
- **Your rabbit** is the house just ahead of you on the ladder: "@x is 6 ahead of you".
- **Voted for you:** one more of the people who voted for your house is revealed each day, oldest first.

### Opting out

- **Stop competing** takes your house off the ladder. Your score freezes until you start again.
- If you stay away for 7 days, your house leaves the ladder the same way, score frozen, and rejoins when you come back.
- **Remove my house** takes you out of XField for good.

### Districts

A district is one person and their mutuals (two people who each talk to the other). The person with the most mutuals hosts first, and a district needs at least 6 people. Each one gets an AI-written name, a colour and its own city blocks.

### The newspaper, ticker and census

- **The XField Ledger** comes out at most once every 20 hours, after the daily refresh. It reports only what happened in the city: who climbed, who moved uptown, new #1s and top-10 entries, new faces on the Docks and new districts. It never writes about losses, and never about anyone's life on X.
- It looks like a real front page: masthead, headline, lead story, columns, and sidebars for climbers, people who moved uptown, new arrivals and numbers. **When a new issue comes out, it pops up for everyone** on their next visit, once per issue.
- The **live ticker** along the bottom shows move-ins, uptown moves, new #1s and top-10 entries, new districts and new paper issues. Click an item to fly to that house.
- The **weekly census** (Mondays) is a stats snapshot with its own share card.

### Downtown

The middle of the city has a few buildings that open panels:

- 🏛 City Hall, with the ladder rules and the top of the ladder
- 🗞 The Ledger
- 📰 The Timeline, with recent city events
- 📮 Post Office, listing people on your street who haven't moved in, with "tag them" buttons
- 🛎 Arrivals, with the newest residents
- ⚓ The Docks

The header shows `🏠 taken/capacity lots` and `⚓ docks · 🏙 uptown`.

## Lines we don't cross

The v3 pitch called for no opt-out, no way to leave, and scores that decay in public for people who quit. We deliberately built a softer version:

- You can stop competing or leave at any time. Your score freezes instead of decaying.
- Losses get no announcement, but they're never hidden from you: your own results show them.
- Public posts never name the loser. "@x passed @y" was removed for that reason.
- **Nothing fake.** Every name in XField is a real person, so we never invent activity, recaps or quotes. The paper only reports events that happened in the city.
- No brand publicity: the AI is told not to name products or companies.

## What's next

- **Real users.** Get it on staging with real friends, add analytics, and watch whether people return.
- **Check the AI paper on staging** with a working key.
- **The rabbit moment.** Passing your rabbit should feel like an event, maybe a small ceremony and a shareable card.
- **More ways to style a house.** Right now it's 12 designs. The v3 idea also had signs and gardens.
- **Clean-up.**
  - The old 2D town page still serves `/h/:handle`, `/d/:district` and `/census`.
  - District boards and elections are still in the backend.
  - Some old integration tests check removed features.
  - [`XFIELD_STATUS.md`](XFIELD_STATUS.md) still describes the roof-sign version.

## Running it locally

You need Docker, Python 3.11+, Node and Yarn.

```powershell
docker run -d --name xfield-mongo -p 27017:27017 mongo

cd backend
pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8001

cd frontend
yarn install
yarn start
```

`backend/.env` needs:

- **Database:** `MONGO_URL` and `DB_NAME`.
- **Game settings:** `TOWN_CAPACITY` (200) and `MOVEINS_PER_HOUR`.
- **Secrets:** `ADMIN_KEY` and `WEBHOOK_CRON_SECRET`.
- **Other:** `CORS_ORIGINS`, plus `DEV_MODE=1` for local work.
- **AI paper:** `EMERGENT_LLM_KEY` and `TEXT_MODEL`.
- **Optional, real X sign-in:** `X_CLIENT_ID` and `X_CLIENT_SECRET`.
- **Optional, reading X:** `NITTER_BASE_URL` (or `NITTER_INSTANCES`) and `TWITTERAPI_IO_KEY`.

`frontend/.env.development.local` sends API calls to the local backend:

```
REACT_APP_BACKEND_URL=
DEV_PROXY=http://localhost:8001
```

The backend doesn't auto-reload, so restart it after changes. Handy dev-mode endpoints:

- `http://localhost:3000/api/dev/login?handle=vivek&next=/` signs you in as any seeded resident.
- `POST /api/dev/paper` publishes a new paper right away.
- `docker exec xfield-mongo mongosh <DB_NAME> --eval "db.dropDatabase()"` resets the city. It reseeds on the next start.

Unit tests:

```powershell
cd backend
python -m pytest tests/test_arena.py tests/test_writers.py tests/test_town.py -q
```

The other test files are integration tests that need a running server at `REACT_APP_BACKEND_URL`.

## Code map

**Backend:** FastAPI with MongoDB (Motor).

| File | What it does |
|---|---|
| `backend/server.py` | API, move-ins, districts, the Docks, voting, paper and census publishing, dev seeding |
| `backend/arena.py` | Ladder rules: Elo points, pairing, the rabbit, which design a house shows |
| `backend/town.py` | City grid, floors, districts, block layout |
| `backend/xreader.py` | Reads X profiles and posts, with fallbacks |
| `backend/paper.py` | AI front-page writer (the plain writer lives in `server.py`) |
| `backend/*_card.py` | Share images for houses, the paper and the census |

**Frontend:** React 19, CRACO, React Three Fiber.

| File | What it does |
|---|---|
| `frontend/src/pages/CityPage.jsx` | The 3D city page: header, cards, toasts, newspaper popup |
| `frontend/src/city3d/layout.js` | Turns the town into 3D placements: blocks, the Docks, props, roads |
| `frontend/src/city3d/modern.js` | Every building and prop, generated in code |
| `frontend/src/city3d/City3D.jsx` | The three.js scene and the small house previews |
| `frontend/src/city3d/Hud.jsx` | Vote card, house card, street bar, downtown panels, ticker |
| `frontend/src/city3d/Newspaper.jsx` | The Ledger front page |

## How we got here

| Version | What it was | Why we moved on |
|---|---|---|
| 1. Lost episode | A Simpsons-style episode that "predicted" you | The prediction angle didn't land |
| 2. Springfield, X | A flat cartoon town made from your X circle | The idea worked, but there was nothing to do after the first look |
| 3. Field war | Daily territory war with raids and shields | It felt like a chore, and posts read as hostile |
| 4. A show about your scene | The city changed with real X activity, plus AI roof signs and a daily paper | Fun first look, but no reason to come back |
| 5. **Pure Votes (now)** | The Docks, uptown, 3 votes a day, the Ledger | Current direction |

The lesson that carried through all of them: **the first look is the product.** The game has to stay as small as three taps a day.
