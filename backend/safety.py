import re

BLOCKED_SUBSTRINGS = (
    "nigg", "fagg", "kike", "spic", "chink", "wetback", "tranny", "retard", "raghead", "beaner",
    "gook", "coon", "dyke", "paki", "heil", "hitler", "nazi", "isis", "jihad", "pedo", "rape",
    "rapist", "suicid", "kys", "killyourself", "kill yourself", "molest", "lynch", "genocide",
    "terrorist", "porn", "onlyfans", "nude", "cocaine", "heroin", "meth",
)

_NORM_RE = re.compile(r"[^a-z0-9 ]+")


def contains_blocked(*texts: str) -> bool:
    for t in texts:
        if not t:
            continue
        n = _NORM_RE.sub("", t.lower())
        squashed = n.replace(" ", "")
        for term in BLOCKED_SUBSTRINGS:
            if term.replace(" ", "") in squashed:
                return True
    return False
