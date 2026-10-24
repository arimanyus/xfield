"""Pure unit tests for district and house rules in town.py. No server needed."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import town  # noqa: E402


def test_floors_set_the_tier():
    assert town.floors_of({"floors": 5}) == 5
    assert town.floors_of({}) == 1
    assert [town.tier_of(f) for f in (1, 2, 3, 5, 6, 9, 10, 40)] == [0, 0, 1, 1, 2, 2, 3, 3]


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


def test_districts_grow_into_blocks_next_door():
    homes = {(20 + i % 4, 20 + i // 4): "a" for i in range(12)} | {(24, 20): None}
    _, blocks, _ = town.plan_blocks(homes, [{"id": "a", "bx": 20, "by": 20, "blocks": [[5, 5]]}])
    assert blocks["a"][0] == (5, 5) and len(blocks["a"]) == 2
    assert math.dist(blocks["a"][0], blocks["a"][1]) == 1


def test_the_city_has_a_margin_of_open_land():
    assert town.city_bounds({(0, 0)}) == (-8, -8, 11, 11)
    assert town.city_bounds({(-1, 0), (2, 0)})[::2] == (-12, 19)


def test_a_district_is_one_host_and_their_mutuals():
    star = {f"m{i}" for i in range(6)}
    mutuals = {"host": star | {"x"}, **{m: {"host"} for m in star}, "x": {"host", "y"}, "y": {"x"}}
    groups = town.host_groups(sorted(mutuals), mutuals)
    assert groups == [("host", ["host", *sorted(star | {"x"})])]
    assert town.host_groups(["a", "b"], {"a": {"b"}, "b": {"a"}}) == []


def test_a_house_grows_a_floor_for_each_friend_who_moved_in():
    docs = [{"k": "me", "status": "finished", "circle": [{"k": "a"}, {"k": "b"}, {"k": "gone"}, {"k": "me"}]},
            {"k": "a", "status": "finished", "circle": [{"k": "me"}]},
            {"k": "b", "status": "reserved", "circle": []}]
    assert town.street_floors(docs) == {"me": 2, "a": 2, "b": 1}
