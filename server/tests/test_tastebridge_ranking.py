import pytest
from tastebridge.ranking import rank_for_group

def test_shared_pick_beats_polarized_pick():
    result=rank_for_group({"a":["X","C"],"b":["Y","C"]},set())
    assert [r.entity_id for r in result]==["C","X","Y"]
    assert result[0].score==pytest.approx(.95) and result[1].ranks["b"] is None
def test_ties_use_entity_id():
    assert [r.entity_id for r in rank_for_group({"a":["B"],"b":["A"]},set())]==["A","B"]
def test_duplicate_candidates_keep_first_rank():
    assert rank_for_group({"a":["A","A","B"],"b":["B"]},set())[0].ranks["a"]==2
def test_empty_member_is_not_dropped():
    r=rank_for_group({"a":["A"],"b":[]},set())[0]
    assert r.score==.25 and r.min_utility==0 and r.ranks["b"] is None
def test_seen_entities_are_removed():
    assert rank_for_group({"a":["A"],"b":["A"]},{"A"})==[]
