"""Pure town geometry: plots on an isometric grid, placement, clustering and building tiers."""
import hashlib
import math
from collections import defaultdict

TOWN_HALL_BLOCK = (0, 0)
MIN_NEIGHBOURHOOD = 6
TIERS = ("cottage", "house", "apartment", "tower")


def is_plot(x: int, y: int) -> bool:
    return x % 3 != 2 and y % 3 != 2


def block_plots(bx: int, by: int) -> list:
    return [(3 * bx + i, 3 * by + j) for j in (0, 1) for i in (0, 1)]


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


def nearest_free_plot(tx: float, ty: float, occupied: set, max_r: int = 200):
    cx, cy = round(tx), round(ty)
    best = None
    for r in range(max_r):
        for x, y in ring(cx, cy, r):
            if is_plot(x, y) and (x, y) not in occupied:
                key = ((x - tx) ** 2 + (y - ty) ** 2, y, x)
                if best is None or key < best[0]:
                    best = (key, (x, y))
        if best and r > math.sqrt(best[0][0]) + 1:
            break
    return best[1] if best else None


def free_block_near(tx: float, ty: float, occupied: set, taken_blocks: set, max_r: int = 80):
    bx0, by0 = round(tx / 3), round(ty / 3)
    for r in range(max_r):
        cands = [b for b in ring(bx0, by0, r)
                 if b not in taken_blocks and all(p not in occupied for p in block_plots(*b))]
        if cands:
            return min(cands, key=lambda b: ((3 * b[0] + 0.5 - tx) ** 2 + (3 * b[1] + 0.5 - ty) ** 2, b[1], b[0]))
    return None


def frontier_target(key: str, occupied: set) -> tuple:
    extent = max((max(abs(x), abs(y)) for x, y in occupied), default=0)
    radius = extent + 3
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
