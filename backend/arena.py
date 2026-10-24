"""The ladder: houses meet two at a time and a voter picks one. Every point a house wins, the other house loses.
Pure rules, no database."""
import town

START = 1000
K = 32
VOTES_PER_DAY = 3
UPTOWN_AT = 1030
TOP = 10
FAMILIES = "hmt"
FAMILY_FLOORS = (1, 3, 6)
DESIGNS = tuple(f"{f}{i}" for f in FAMILIES for i in range(4))
DOCK_LOTS = 16


def score(d: dict) -> int:
    return d.get("elo", START)


def points(win: int, lose: int) -> int:
    """What the winner takes from the loser: about half of K between equals, more for an upset."""
    expected = 1 / (1 + 10 ** ((lose - win) / 400))
    return max(1, round(K * (1 - expected)))


def pair(pool: list, voter: str, rng) -> list:
    """Two houses close on the ladder, neither of them the voter's. Empty when there aren't two."""
    others = [d for d in pool if d["k"] != voter]
    if len(others) < 2:
        return []
    a = rng.choice(others)
    near = sorted((d for d in others if d["k"] != a["k"]), key=lambda d: (abs(score(d) - score(a)), d["k"]))[:5]
    return [a, rng.choice(near)]


def ladder(pool: list) -> list:
    return sorted(pool, key=lambda d: (-score(d), d["k"]))


def rabbit(pool: list, k: str):
    """The house just ahead of k on the ladder."""
    order = ladder(pool)
    i = next((i for i, d in enumerate(order) if d["k"] == k), None)
    return order[i - 1] if i else None


def tallest(floors: int) -> int:
    return max(i for i, f in enumerate(FAMILY_FLOORS) if floors >= f)


def model_of(d: dict, docks: bool) -> str:
    """The design a house shows: its owner's pick, never taller than its floors allow, and always a home on the Docks.
    Without a pick it is as tall as its floors allow."""
    top = 0 if docks else tallest(town.floors_of(d))
    design = d.get("design")
    fam, i = (FAMILIES.index(design[0]), int(design[1])) if design in DESIGNS else (top, town.hval(d["k"]) % 4)
    return f"{FAMILIES[min(fam, top)]}{i}"


def free_slots(taken: set, n: int) -> list:
    """The n lowest free places on the Docks."""
    out, i = [], 0
    while len(out) < n:
        if i not in taken:
            out.append(i)
        i += 1
    return out
