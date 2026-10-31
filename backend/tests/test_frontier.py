import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import town  # noqa: E402


def gap(b: tuple, blocks: set) -> int:
    return min(max(abs(b[0] - c[0]), abs(b[1] - c[1])) for c in blocks)


def test_newcomer_block_touches_the_core_in_every_direction():
    occupied = town.civic_lots()
    for i in range(720):
        lot = town.nearest_free_lot(*town.frontier_target(f"user{i}", occupied), occupied)
        assert gap(town.block_of(*lot), town.CIVIC_BLOCKS) == 1, (i, lot)


def test_newcomer_block_touches_a_grown_city():
    occupied = set(town.civic_lots())
    for i in range(300):
        built = town.CIVIC_BLOCKS | {town.block_of(*p) for p in occupied}
        lot = town.nearest_free_lot(*town.frontier_target(f"grow{i}", occupied), occupied)
        assert gap(town.block_of(*lot), built) <= 1, (i, lot)
        occupied.add(lot)
