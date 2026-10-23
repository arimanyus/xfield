"""Pure town geometry, SimCity district rules, placement, clustering, and economy math."""
import hashlib
import math
from collections import Counter, defaultdict

TOWN_HALL = (0, 0)
MIN_NEIGHBOURHOOD = 6
DISSOLVE_BELOW = 3
TOP_N = 5
MOVE_MIN_LOTS = 2
TIERS = ("cottage", "rowhouse", "mid-rise", "tower")
FACTION_COLORS = ("#2563EB", "#10B981", "#FACC15", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#F97316")
PROJECTS = ("plots", "height", "highway")
DEFAULT_PLOT_CAP = 12
DEFAULT_MAX_FLOORS = 4
START_CREDITS = 500
RECRUIT_BOUNTY = 300
EXPANSION_BASE = 600
ELECTION_MIN = 8
BLOCK = 4
CIVIC = (0, 0)
CIVIC_BLOCKS = {(x, y) for x in (-1, 0, 1) for y in (-1, 0, 1)}
HOMES_PER_BLOCK = 8
TAX_RATE = 0.1
MAYOR_BOOST = 1.5
RUN_FEE = 200
WORKPLACES = {"hospital": "Nurse", "school": "Teacher", "fire": "Firefighter", "police": "Officer",
              "market": "Shopkeeper", "bank": "Banker", "power": "Engineer", "park": "Gardener"}


def inbound_counts(docs: list) -> Counter:
    keys = {d["k"] for d in docs}
    indeg = Counter()
    for d in docs:
        for c in d.get("circle") or []:
            if c["k"] in keys and c["k"] != d["k"]:
                indeg[c["k"]] += 1
    return indeg


def should_move(old_top: list, new_top: list) -> bool:
    if not new_top:
        return False
    if not old_top:
        return True
    return len(set(new_top) - set(old_top)) / len(new_top) > 0.5


def hval(s: str) -> int:
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)


def djb2(s: str) -> int:
    h = 5381
    for ch in s:
        h = ((h * 33) ^ ord(ch)) & 0xFFFFFFFF
    return h


def color_for(key: str, taken=()) -> str:
    free = [c for c in FACTION_COLORS if c not in taken] or FACTION_COLORS
    return free[hval(key) % len(free)]


def tier_of(floors: int) -> int:
    return 3 if floors >= 5 else 2 if floors >= 3 else 1 if floors == 2 else 0


def floors_of(d: dict) -> int:
    return int(d.get("floors") or 1)


def expansion_cost(nb: dict) -> int:
    expansions = max(0, (int(nb.get("plot_cap") or DEFAULT_PLOT_CAP) - DEFAULT_PLOT_CAP) // 6)
    height_ups = max(0, (int(nb.get("max_floors") or DEFAULT_MAX_FLOORS) - DEFAULT_MAX_FLOORS) // 2)
    return EXPANSION_BASE + 300 * (expansions + height_ups)


def rent(doc: dict, docs: list, highways: int = 0, boosted: bool = False) -> dict:
    """Every story in your home pays everyone who lives there; lit neighbours in your district add up too.
    The mayor's boosted district earns more, and the city keeps a tax that pays the mayor."""
    stories = floors_of(doc)
    nb = doc.get("nb")
    neighbours = sum(1 for d in docs if nb and d.get("nb") == nb and d["k"] != doc["k"] and d["status"] == "finished")
    base = 100 + 40 * (stories - 1) + 10 * min(neighbours, 30)
    mult = (1.2 if highways else 1.0) * (MAYOR_BOOST if boosted else 1.0)
    gross = round(base * mult)
    tax = round(gross * TAX_RATE)
    return {"stories": stories, "neighbours": neighbours, "base": base, "mult": mult, "gross": gross, "tax": tax,
            "net": gross - tax}


def wage(shifts: int) -> dict:
    """A shift pays more the longer you keep the same job, up to double after ten shifts."""
    gross = 60 + 6 * min(shifts, 10)
    tax = round(gross * TAX_RATE)
    return {"gross": gross, "tax": tax, "net": gross - tax}


def land_value(floors: int, inbound: int) -> int:
    return 1000 * floors + 350 * inbound


def block_of(x: int, y: int) -> tuple:
    return x // BLOCK, y // BLOCK


def block_lots(b: tuple) -> list:
    return [(b[0] * BLOCK + i, b[1] * BLOCK + j) for j in range(BLOCK) for i in range(BLOCK)]


def civic_lots() -> set:
    return {p for b in CIVIC_BLOCKS for p in block_lots(b)}


def empty_block(near: tuple, taken: set, crowd: Counter):
    cx, cy = round(near[0]), round(near[1])
    for r in range(64):
        free = [b for b in ring(cx, cy, r) if b not in taken and not crowd[b]]
        if free:
            return min(free, key=lambda b: (math.dist(b, near), b))
    return None


def plan_blocks(homes: dict, districts: list) -> tuple:
    """Give every district whole blocks of its own. homes maps lot -> district id (or None); districts come oldest
    first with "id", "bx", "by" and their current "blocks". Homes in the wrong block move.
    Returns ({old_lot: new_lot}, {district_id: [block]}, {district_id: landmark_lot})."""
    per_block = defaultdict(Counter)
    for lot, nb in homes.items():
        per_block[block_of(*lot)][nb] += 1
    crowd = Counter({b: sum(c.values()) for b, c in per_block.items()})
    size = Counter(nb for nb in homes.values() if nb)
    owner, blocks = {}, {}
    for d in districts:
        i = d["id"]
        need = -(-(size[i] + 1) // HOMES_PER_BLOCK)
        mine = [tuple(b) for b in d.get("blocks") or [] if tuple(b) not in owner and tuple(b) not in CIVIC_BLOCKS]
        while len(mine) < need:
            mine.append(empty_block(mine[0] if mine else CIVIC, {*owner, *mine, *CIVIC_BLOCKS}, crowd))
        blocks[i] = mine[:need]
        owner.update({b: i for b in blocks[i]})

    taken = set(homes) | civic_lots()
    landmarks = {d["id"]: (d["bx"], d["by"]) for d in districts
                 if block_of(d["bx"], d["by"]) in blocks[d["id"]] and (d["bx"], d["by"]) not in homes}
    taken |= set(landmarks.values())
    for d in districts:
        if d["id"] not in landmarks:
            b = blocks[d["id"]][0]
            mid = (b[0] * BLOCK + 1.5, b[1] * BLOCK + 1.5)
            free = [p for p in block_lots(b) if p not in taken]
            landmarks[d["id"]] = min(free, key=lambda p: (math.dist(p, mid), p)) if free else (d["bx"], d["by"])
            taken.add(landmarks[d["id"]])

    built = set(owner) | CIVIC_BLOCKS
    fringe = {(b[0] + dx, b[1] + dy) for b in built for dx in (-1, 0, 1) for dy in (-1, 0, 1)} - built
    moves = {}
    for lot, nb in sorted(homes.items()):
        here = block_of(*lot)
        if nb in blocks:
            if here in blocks[nb]:
                continue
            free = [p for b in blocks[nb] for p in block_lots(b) if p not in taken]
        else:
            if here in fringe:
                continue
            free = [p for b in fringe for p in block_lots(b) if p not in taken]
        if not free:
            continue
        new = min(free, key=lambda p: (math.dist(p, lot), p))
        moves[lot] = new
        taken.add(new)
    return moves, blocks, landmarks


def ring(cx: int, cy: int, r: int):
    if r == 0:
        yield cx, cy
        return
    for x in range(cx - r, cx + r + 1):
        yield x, cy - r
        yield x, cy + r
    for y in range(cy - r + 1, cy + r):
        yield cx - r, y
        yield cx + r, y


def nearest_free_lot(tx: float, ty: float, occupied: set, max_r: int = 200):
    cx, cy = round(tx), round(ty)
    best = None
    for r in range(max_r):
        for x, y in ring(cx, cy, r):
            if (x, y) not in occupied:
                key = ((x - tx) ** 2 + (y - ty) ** 2, y, x)
                if best is None or key < best[0]:
                    best = (key, (x, y))
        if best and r > math.sqrt(best[0][0]) + 1:
            break
    return best[1] if best else None


def frontier_target(key: str, occupied: set) -> tuple:
    extent = max((max(abs(x), abs(y)) for x, y in occupied), default=0)
    radius = extent + 2
    angle = math.radians(hval(key) % 360)
    return radius * math.cos(angle), radius * math.sin(angle)


def clusters(nodes: list, edges: dict) -> list:
    label = {n: n for n in nodes}
    order = sorted(nodes)
    for _ in range(15):
        changed = False
        for n in order:
            nbrs = edges.get(n)
            if not nbrs:
                continue
            score = defaultdict(float)
            for m, w in nbrs.items():
                score[label[m]] += w
            best = min(score.items(), key=lambda kv: (-kv[1], kv[0]))[0]
            if best != label[n]:
                label[n] = best
                changed = True
        if not changed:
            break
    groups = defaultdict(list)
    for n in nodes:
        groups[label[n]].append(n)
    return list(groups.values())
