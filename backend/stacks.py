"""Buildings that grow upwards. Once every ground spot is taken, new homes go on top of a building as floors.
A floor resident has "lv" (1 up; 0 when the ground owner left and they hold the ground) and "on": "dock" (with the
building's "dock" slot) or "lot" (with the building's x, y). Pure rules, no database."""
import math
from collections import defaultdict

MAX_STACK = 12


def stacked(d: dict) -> bool:
    return d.get("lv") is not None


def key_of(d: dict) -> tuple:
    """Where a home stands: a slot on the Docks, or a lot in the city."""
    if stacked(d):
        return ("d", d["dock"]) if d.get("on") == "dock" else ("l", d["x"], d["y"])
    return ("d", d["dock"]) if d.get("dock") is not None else ("l", d["x"], d["y"])


def buildings(docs: list) -> dict:
    """Every building and who lives in it, ground first, then up."""
    out = defaultdict(list)
    for d in docs:
        out[key_of(d)].append(d)
    for ds in out.values():
        ds.sort(key=lambda d: (stacked(d), d.get("lv") or 0, d.get("placed_at") or d.get("created_at") or ""))
    return dict(out)


def renumber(blds: dict) -> dict:
    """Floors with no gaps. When the ground owner has gone, the lowest floor becomes the ground (0)."""
    changes = {}
    for ds in blds.values():
        start = 0 if stacked(ds[0]) else 1
        for i, d in enumerate(d for d in ds if stacked(d)):
            if d["lv"] != start + i:
                changes[d["k"]] = start + i
    return changes


def area_of(key: tuple, ds: list) -> str:
    if key[0] == "d":
        return "docks"
    return "uptown" if ds and ds[0]["status"] == "finished" else "dark"


def _dist(a: tuple, b: tuple) -> float:
    if a[0] != b[0]:
        return math.inf
    return abs(a[1] - b[1]) if a[0] == "d" else math.dist(a[1:], b[1:])


def shortest(blds: dict, area: str, near: tuple = None):
    """The building in an area with the fewest homes that still has room, nearest first among equals."""
    room = [k for k, ds in blds.items() if area_of(k, ds) == area and len(ds) < MAX_STACK]
    return min(room, key=lambda k: (len(blds[k]), _dist(k, near) if near else 0, str(k)), default=None)


def with_room(blds: dict, key: tuple):
    """That building if it has room, else the nearest shorter one in the same area."""
    ds = blds.get(key)
    if ds is None:
        return None
    if len(ds) < MAX_STACK:
        return key
    area = area_of(key, ds)
    room = [k for k, o in blds.items() if area_of(k, o) == area and len(o) < len(ds)]
    return min(room, key=lambda k: (_dist(k, key), len(blds[k]), str(k)), default=None)


def floor_spot(key: tuple, ds: list) -> dict:
    """The fields that put a new home on top of a building."""
    spot = {"lv": len(ds), "on": "dock" if key[0] == "d" else "lot", "x": ds[0]["x"], "y": ds[0]["y"],
            "uptown": area_of(key, ds) == "uptown"}
    if key[0] == "d":
        spot["dock"] = key[1]
    return spot


def info(doc: dict, blds: dict) -> dict:
    """Who lives in a home's building, ground first, and which floor is theirs (0 is the ground)."""
    key = key_of(doc)
    ds = blds.get(key) or [doc]
    level = next((i for i, d in enumerate(ds) if d["k"] == doc["k"]), 0)
    return {"key": key, "people": ds, "level": level, "size": len(ds), "area": area_of(key, ds)}


def towers(blds: dict) -> list:
    """Buildings that grew floors, tallest first; equals by their ground owner's handle."""
    return sorted(((k, ds) for k, ds in blds.items() if len(ds) > 1), key=lambda kv: (-len(kv[1]), kv[1][0]["k"]))


def rank_of(key: tuple, blds: dict) -> tuple:
    """A building's place among the towers, and how many towers there are."""
    order = [k for k, _ in towers(blds)]
    return (order.index(key) + 1 if key in order else None), len(order)
