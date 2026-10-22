"""Pure town geometry: one house per lot on an isometric grid, placement, clustering and building tiers."""
import hashlib
import math
from collections import Counter, defaultdict

TOWN_HALL = (0, 0)
MIN_NEIGHBOURHOOD = 6
DISSOLVE_BELOW = 3
TOP_N = 5
MOVE_MIN_LOTS = 2
TIERS = ("cottage", "house", "apartment", "tower")


def inbound_counts(docs: list) -> Counter:
    keys = {d["k"] for d in docs}
    indeg = Counter()
    for d in docs:
        for c in d.get("circle") or []:
            if c["k"] in keys and c["k"] != d["k"]:
                indeg[c["k"]] += 1
    return indeg


def should_move(old_top: list, new_top: list) -> bool:
    # Move only when most of the top neighbours changed, so houses don't jitter.
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


def tier_of(inbound: int) -> int:
    if inbound >= 5:
        return 3
    if inbound >= 3:
        return 2
    if inbound >= 2:
        return 1
    return 0


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
