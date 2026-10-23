# XField Master Plan: The Multiplayer SimCity for X

## 1. Core Vision
XField is a multiplayer isometric city-builder where corners of X form **colour-coded Districts (Boroughs)** around real handles, compete for land and skyline dominance, and grow by recruiting real X users.
- **No Simpsons IP:** Clean, crisp SimCity-style isometric architecture, road grids, faction colours, and civic landmarks.
- **Community + Selfish Pull:** The map seeds itself automatically from who talks to whom on X, but once inside, players choose a District, claim prime real estate, add floors to their buildings, elect Mayors, and expand their District’s borders.

---

## 2. Visual & Brand Overhaul (Dropping the Simpsons Layer)
We keep the isometric projection and SVG/Pillow rendering engines (`frontend/src/lib/iso.js`, `TownMap.jsx`, `backend/town_card.py`), and strip all Simpsons references:
- **Remove:** `WobbleDefs.jsx` (wobbly cartoon outlines), Simpsons yellow (`#FFD90F`), drifting cartoon clouds (`Sky.jsx`), Simpsons landmarks (`moes`, `kwik_e_mart`, `lard_lad`, `krusty_studios`, etc.), and the Fox/Disney disclaimer.
- **New SimCity Aesthetic:**
  - **Crisp Isometric Grid:** Clean architectural outlines, asphalt roads with lane markings, zoned lot bases, and **District Faction Colours** painted on street curbs, flags, and roof trims.
  - **Civic Landmarks:** SimCity-style procedural isometric landmarks: `city_hall`, `stock_exchange`, `power_grid`, `tech_campus`, `central_station`, `harbor`, `stadium`, and `broadcast_tower`.
  - **Building Progression:** Procedural isometric buildings where **each floor is visibly stacked** (1-story Lot → 2-story Rowhouse → 4-story Mid-Rise → 8-story High-Rise → 12-story Glass Skyscraper).

---

## 3. Cold-Start Hook + District Membership
1. **Graph-Seeded "Unclaimed Districts" (Cold Start):**
   - Typing *any* X handle reads their public posts (`backend/xreader.py`), places reserved lots for their circle, and runs clustering (`backend/town.py`).
   - Any cluster of 6+ accounts automatically forms an **Unclaimed District** anchored by its most-connected handle (`anchor` / `founder_k`).
2. **Joining Any Handle’s District (Community Choice):**
   - When a user signs in with X, they can either:
     - **Light up their auto-placed lot** in the district their social graph put them in, **OR**
     - **Move Into a Specific Handle’s District** (`POST /api/districts/{id}/join`), relocating to an open plot in that district and adopting that district’s **Faction Colour**.
3. **Founding / Chartering a District:**
   - Any signed-in user can charter a new frontier District or claim their anchor District (`POST /api/districts/charter`), picking its name and faction colour.

---

## 4. Governance: Founder vs. Mayor
| Role | Who it is | Powers & Rules |
| :--- | :--- | :--- |
| **Founder** | The anchor handle the District is built around | **Permanent.** Owns the District Charter, name, and faction colour. Cannot be deposed. |
| **Mayor** | The operational leader of the District | Defaults to the Founder at start. Citizens can endorse/vote for a Mayor (`POST /api/districts/{id}/vote`), and the top-voted verified citizen becomes Mayor once threshold is reached. |

### How Expansion Works
- Every District has a **Plot Cap** (`plot_cap`, starts at 12) and a **Zoning Height Cap** (`max_floors`, starts at 4 floors).
- Every citizen action feeds the **District Expansion Meter** (`treasury` vs `expansion_cost`).
- **Mayor Power:** The Mayor chooses the next District Project (`POST /api/districts/{id}/project`: `"plots"` for +6 plots, `"height"` for +2 max floors, or `"highway"` to connect to a neighbouring district).
- **Auto-Trigger:** When treasury reaches `expansion_cost`, the active project immediately executes and resets the meter so growth never stalls.

---

## 5. The Individual Loop: Credits, Land Value & Floors
1. **How Citizens Earn Credits (`credits`):**
   - **Sign-In Mint:** Claiming and lighting your lot grants starting capital (`500 Credits`).
   - **Recruit Bounty:** When someone moves into a reserved lot you spawned—or joins your District—and signs in with X, **both earn `300 Credits`**.
   - **Adjacency Yield (`POST /api/me/claim`):** Daily Credits based on your building’s floors + adjacent lit floors + highway bonus.
2. **What Citizens Spend Credits On:**
   - **Adding Floors (`POST /api/me/upgrade`):** Spend Credits to add floors (`1 → 2 → ... → max_floors`), increasing daily yield, Land Value, and physical building height on the map.
   - **Prime Real Estate (`POST /api/me/relocate`):** Lots adjacent to the Founder, Mayor, or District Landmark are **Prime Lots**. Verified citizens can buy/relocate onto an open or unclaimed Prime Lot near the District center.
   - **Funding the District Treasury (`POST /api/districts/{id}/contribute`):** Contribute Credits to trigger District Expansion and climb the District contributor leaderboard.
