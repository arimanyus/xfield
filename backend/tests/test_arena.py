"""Pure unit tests for the ladder rules in arena.py. No server needed."""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import arena  # noqa: E402


def house(k, elo=arena.START, **extra):
    return {"k": k, "elo": elo, **extra}


def test_a_vote_moves_points_and_upsets_move_more():
    even = arena.points(1000, 1000)
    assert even == arena.K // 2
    assert arena.points(900, 1100) > even > arena.points(1100, 900) >= 1


def test_the_voter_never_judges_their_own_house():
    pool = [house("me"), house("a"), house("b")]
    for seed in range(20):
        pair = arena.pair(pool, "me", random.Random(seed))
        assert len(pair) == 2 and {d["k"] for d in pair} == {"a", "b"}
    assert arena.pair([house("me"), house("a")], "me", random.Random(0)) == []


def test_pairs_stay_close_on_the_ladder():
    pool = [house(f"h{i}", 1000 + i * 10) for i in range(30)]
    for seed in range(20):
        a, b = arena.pair(pool, "nobody", random.Random(seed))
        assert abs(arena.score(a) - arena.score(b)) <= 30


def test_the_rabbit_is_the_house_just_ahead():
    pool = [house("top", 1100), house("mid", 1040), house("me", 1030), house("low", 990)]
    assert arena.rabbit(pool, "me")["k"] == "mid"
    assert arena.rabbit(pool, "top") is None
    assert arena.rabbit(pool, "stranger") is None


def test_designs_are_capped_by_floors_and_by_the_docks():
    assert arena.model_of({"k": "a", "design": "t2", "floors": 7}, docks=False) == "t2"
    assert arena.model_of({"k": "a", "design": "t2", "floors": 4}, docks=False) == "m2"
    assert arena.model_of({"k": "a", "design": "t2", "floors": 7}, docks=True) == "h2"
    assert arena.model_of({"k": "a", "floors": 7}, docks=False)[0] == "t"
    assert arena.model_of({"k": "a", "floors": 7}, docks=True)[0] == "h"


def test_docks_places_fill_the_lowest_gaps():
    assert arena.free_slots({0, 1, 3}, 3) == [2, 4, 5]
    assert arena.free_slots(set(), 0) == []
