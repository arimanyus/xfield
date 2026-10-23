"""Weekly City Ledger: compare the city now against last week's snapshot."""
from collections import Counter, defaultdict

import town


def neighbours_of(docs: list) -> dict:
    keys = {d["k"] for d in docs}
    nbrs = defaultdict(set)
    for d in docs:
        for c in d.get("circle") or []:
            if c["k"] in keys and c["k"] != d["k"]:
                nbrs[d["k"]].add(c["k"])
                nbrs[c["k"]].add(d["k"])
    return nbrs


def snapshot_of(docs: list) -> dict:
    nbrs = neighbours_of(docs)
    return {d["k"]: {"nb": d.get("nb"), "t": town.tier_of(town.floors_of(d)),
                     "n": sorted(nbrs[d["k"]]), "s": d["status"]} for d in docs}


def top_districts(docs: list, nbs: list) -> list:
    score = {n["id"]: {"id": n["id"], "name": n.get("name") or "A new district", "color": n.get("color"),
                       "floors": 0, "lit": 0, "size": 0} for n in nbs}
    for d in docs:
        s = score.get(d.get("nb"))
        if s:
            s["floors"] += town.floors_of(d)
            s["lit"] += d["status"] == "finished"
            s["size"] += 1
    return sorted(score.values(), key=lambda s: (-(s["floors"] + 2 * s["lit"]), s["id"]))[:3]


def baseline(docs: list, start_iso: str) -> dict:
    # No earlier census: rebuild last week from the houses that already existed then.
    return snapshot_of([d for d in docs if (d.get("created_at") or "") < start_iso])


def build_census(docs: list, nbs: list, prev: dict, start_iso: str, end_iso: str, events: list) -> dict:
    cur = snapshot_of(docs)
    prev = prev if prev is not None else baseline(docs, start_iso)
    by_k = {d["k"]: d for d in docs}
    nb_by_id = {n["id"]: n for n in nbs}

    def person(k):
        d = by_k[k]
        return {"k": k, "h": d["h"], "a": d.get("avatar_url"), "nb": (nb_by_id.get(d.get("nb")) or {}).get("name")}

    gained = Counter(s["nb"] for k, s in cur.items() if s["nb"] in nb_by_id and (prev.get(k) or {}).get("nb") != s["nb"])
    fastest = None
    if gained:
        nb_id = max(gained, key=lambda i: (gained[i], nb_by_id[i].get("size", 0), i))
        nb = nb_by_id[nb_id]
        fastest = {"id": nb_id, "name": nb.get("name") or "A new district", "landmark": nb.get("landmark") or "harbor",
                   "color": nb.get("color"), "gained": gained[nb_id], "size": nb.get("size", 0)}

    towers = sorted((k for k, s in cur.items() if s["t"] == 3 and (prev.get(k) or {}).get("t", -1) < 3),
                    key=lambda k: (-len(cur[k]["n"]), k))
    mover, best = None, 0
    for k in sorted(cur):
        n = len(set(cur[k]["n"]) - set((prev.get(k) or {}).get("n") or []))
        if n > best:
            mover, best = k, n
    lit = sorted((d for d in docs if d["status"] == "finished" and start_iso <= (d.get("finished_at") or "") <= end_iso),
                 key=lambda d: d["finished_at"], reverse=True)
    lit_total = sum(1 for d in docs if d["status"] == "finished")
    return {
        "population": {"taken": len(docs), "lit": lit_total, "reserved": len(docs) - lit_total,
                       "new": sum(1 for k in cur if k not in prev)},
        "fastest": fastest,
        "towers": [person(k) for k in towers[:6]],
        "towers_total": len(towers),
        "mover": {**person(mover), "gained": best} if mover else None,
        "newest_lit": [person(d["k"]) for d in lit[:6]],
        "lit_week": len(lit),
        "moves": sum(1 for e in events if e["type"] == "moved"),
        "demolished": sum(e.get("n") or 1 for e in events if e["type"] == "demolished"),
        "districts": top_districts(docs, nbs),
    }
