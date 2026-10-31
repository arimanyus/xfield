"""Millionaires' Row: ten mansions downtown for the week's top ten on the ladder. Every Monday at 9:00 UTC the holders
move in for the week, then the row is handed out again. Pure rules, no database."""
from datetime import datetime, timedelta

import arena

SEATS = 10
HANDOVER_HOUR = 9


def next_handover(at: datetime) -> datetime:
    """The first Monday 9:00 UTC after at."""
    t = (at + timedelta(days=(0 - at.weekday()) % 7)).replace(hour=HANDOVER_HOUR, minute=0, second=0, microsecond=0)
    return t if t > at else t + timedelta(days=7)


def week_start(at: datetime) -> datetime:
    """The Monday 9:00 UTC this week's row belongs to, counting one due within the next half hour."""
    return next_handover(at + timedelta(minutes=30)) - timedelta(days=7)


def handed_this_week(handed_at: datetime, at: datetime) -> bool:
    """A row handed out since this week's handover (or just before it) stands until next Monday."""
    return handed_at >= week_start(at) - timedelta(minutes=30)


def seat(d: dict, rank: int) -> dict:
    return {"k": d["k"], "h": d["h"], "rank": rank, "score": arena.score(d)}


def hand_out(pool: list) -> list:
    """The ten players with the most points, #1 first."""
    return [seat(d, i + 1) for i, d in enumerate(arena.ladder(pool)[:SEATS])]


def reseat(holders: list, pool: list, gone: set) -> list:
    """Holders who left or were hidden give up their mansion: everyone below them moves up one, and the next players in
    line take the free mansions at the bottom of the row."""
    kept = [h for h in holders if h["k"] not in gone]
    extra = in_line(kept, [d for d in pool if d["k"] not in gone], len(holders) - len(kept))
    return [{**h, "rank": i + 1} for i, h in enumerate(kept)] + [seat(d, len(kept) + i + 1) for i, d in enumerate(extra)]


def in_line(holders: list, pool: list, n: int = 3) -> list:
    """The next n players on the ladder who hold no mansion."""
    have = {h["k"] for h in holders}
    return [d for d in arena.ladder(pool) if d["k"] not in have][:max(0, n)]


def seat_of(row: dict, k: str):
    return next((h for h in (row or {}).get("holders") or [] if h["k"] == k), None)
