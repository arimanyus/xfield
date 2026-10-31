"""Pure town geometry, SimCity district rules, placement, clustering, and how tall each house stands."""
import hashlib
import math
from collections import Counter, defaultdict

TOWN_HALL = (0, 0)
MIN_NEIGHBOURHOOD = 6
DISSOLVE_BELOW = 3
TOP_N = 5
MOVE_MIN_LOTS = 2
TIERS = ("cottage", "rowhouse", "mid-rise", "tower")
FACTION_COLORS = ("#2563EB", "#16A34A", "#EAB308", "#DC2626", "#7C3AED", "#0D9488", "#DB2777", "#EA580C")
ELECTION_MIN = 3
BLOCK = 2
CIVIC = (0, 0)
# The civic core keeps its 20x20 lots: 5x5 big blocks, each 2x2 house blocks with no streets inside.
CIVIC_BLOCKS = {(x, y) for x in range(-4, 6) for y in range(-4, 6)}
HOMES_PER_BLOCK = 4
CITY_MARGIN = 4


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
    return 3 if floors >= 10 else 2 if floors >= 6 else 1 if floors >= 3 else 0


def floors_of(d: dict) -> int:
    return int(d.get("floors") or 1)


def street_floors(docs: list) -> dict:
    """Every house is 1 floor, plus 1 for each person in its circle who has moved in."""
    lit = {d["k"] for d in docs if d["status"] == "finished"}
    return {d["k"]: 1 + sum(c["k"] in lit and c["k"] != d["k"] for c in d.get("circle") or []) for d in docs}


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
    crowd = Counter({b: sum(n for nb, n in c.items() if nb) for b, c in per_block.items()})
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
            mid = (b[0] * BLOCK + (BLOCK - 1) / 2, b[1] * BLOCK + (BLOCK - 1) / 2)
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
    """Just past the city's edge in this person's own direction, walking out from the middle of the civic core, so
    the block they land in always touches the city."""
    built = CIVIC_BLOCKS | {block_of(*p) for p in occupied}
    xs = [b[0] for b in CIVIC_BLOCKS]
    c = BLOCK * (min(xs) + max(xs) + 1) / 2 - 0.5
    angle = math.radians(hval(key) % 360)
    dx, dy = math.cos(angle), math.sin(angle)
    r = 0.0
    while block_of(round(c + r * dx), round(c + r * dy)) in built:
        r += 0.5
    return c + r * dx, c + r * dy


def host_groups(nodes: list, mutuals: dict) -> list:
    """A district is one person and their mutuals: whoever has the most mutuals not yet in a district hosts them,
    then the next. Returns [(host, members)], biggest first; whoever is left over lives in no district."""
    left, out = set(nodes), []
    while left:
        host = max(sorted(left), key=lambda k: len(mutuals.get(k, set()) & left))
        crew = mutuals.get(host, set()) & left
        if len(crew) + 1 < MIN_NEIGHBOURHOOD:
            break
        out.append((host, [host, *sorted(crew)]))
        left -= crew | {host}
    return out


def city_bounds(blocks) -> tuple:
    """Inclusive lot bounds (x0, y0, x1, y1): the city's blocks plus a margin of open land."""
    xs, ys = [b[0] for b in blocks] or [0], [b[1] for b in blocks] or [0]
    m = CITY_MARGIN
    return (min(xs) - m) * BLOCK, (min(ys) - m) * BLOCK, (max(xs) + m + 1) * BLOCK - 1, (max(ys) + m + 1) * BLOCK - 1


