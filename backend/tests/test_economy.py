"""Pure unit tests for district and economy rules in town.py. No server needed."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import town  # noqa: E402


def res(k, x, y, floors=1, status="finished", nb=None):
    return {"k": k, "x": x, "y": y, "floors": floors, "status": status, "nb": nb}


def test_stories_set_the_tier():
    assert town.floors_of({"floors": 5}) == 5
    assert town.floors_of({}) == 1
    assert [town.tier_of(f) for f in (1, 2, 3, 4, 5, 9)] == [0, 1, 2, 2, 3, 3]


def test_expansion_cost_counts_projects():
    assert town.expansion_cost({}) == town.EXPANSION_BASE
    assert town.expansion_cost({"plot_cap": 18, "max_floors": 6}) == town.EXPANSION_BASE + 600


def test_rent_rewards_stories_neighbours_boost_and_tax():
    me = res("me", 0, 0, floors=3, nb="a")
    docs = [me, res("n1", 1, 0, nb="a"), res("n2", 2, 0, nb="a", status="reserved"), res("o", 3, 0, nb="b")]
    r = town.rent(me, docs)
    assert r["base"] == 100 + 40 * 2 + 10 * 1
    assert r["tax"] == round(r["gross"] * town.TAX_RATE) and r["net"] == r["gross"] - r["tax"]
    assert town.rent(me, docs, boosted=True)["gross"] == round(r["base"] * town.MAYOR_BOOST)
    assert town.rent(res("solo", 9, 9), [])["base"] == 100


def test_land_value_grows_with_stories():
    assert town.land_value(3, 0) - town.land_value(1, 0) == 2000


def test_district_colours_are_stable_faction_colours():
    assert town.color_for("nb-1") == town.color_for("nb-1")
    assert town.color_for("nb-1") in town.FACTION_COLORS


def test_districts_get_blocks_of_their_own():
    homes = {(5, 5): "a", (6, 5): "b", (5, 6): "a", (9, 1): None, (1, 1): "a"}
    districts = [{"id": "a", "bx": 7, "by": 7}, {"id": "b", "bx": 6, "by": 6}]
    moves, blocks, landmarks = town.plan_blocks(homes, districts)
    final = {moves.get(lot, lot): nb for lot, nb in homes.items()}
    owner = {b: i for i, bs in blocks.items() for b in bs}
    assert blocks["a"] != blocks["b"]
    for lot, nb in final.items():
        b = town.block_of(*lot)
        assert b not in town.CIVIC_BLOCKS
        assert owner.get(b) == nb
    for i, lot in landmarks.items():
        assert town.block_of(*lot) in blocks[i] and lot not in final
    assert len(set(final)) == len(final)


def test_blocks_stay_put_once_assigned():
    homes = {(12, 12): "a", (13, 12): "a"}
    districts = [{"id": "a", "bx": 14, "by": 14, "blocks": [[3, 3]]}]
    moves, blocks, landmarks = town.plan_blocks(homes, districts)
    assert moves == {} and blocks == {"a": [(3, 3)]} and landmarks == {"a": (14, 14)}


def test_districts_leave_the_civic_core():
    homes = {(1, 1): "a", (2, 1): "a"}
    moves, blocks, _ = town.plan_blocks(homes, [{"id": "a", "bx": 0, "by": 0, "blocks": [[0, 0]]}])
    assert not set(blocks["a"]) & town.CIVIC_BLOCKS
    assert set(moves) == set(homes)


def test_wage_grows_with_loyalty_and_pays_tax():
    assert town.wage(0)["gross"] == 60
    assert town.wage(10)["gross"] == town.wage(50)["gross"] == 120
    assert town.wage(3)["net"] == town.wage(3)["gross"] - town.wage(3)["tax"]
