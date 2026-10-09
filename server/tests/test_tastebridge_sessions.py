from datetime import datetime,timezone,timedelta
import pytest
from tastebridge.store import TasteBridgeStore,GroupError
from tastebridge.models import MemberPreference,EntityChoice

@pytest.fixture
def store(tmp_path): return TasteBridgeStore(str(tmp_path/"t.db"))
def members(n=2,count=1):return [MemberPreference(member_id=str(i),nickname=f"Friend {i}",entity_ids=[f"e{j}" for j in range(count)]) for i in range(n)]
def setup(store):
    store.remember_choices("s",[EntityChoice(entity_id=f"e{i}",name="A",kind="movie") for i in range(6)])
@pytest.mark.parametrize("n,count",[(1,1),(5,1),(2,0),(2,6)])
def test_group_limits(store,n,count):
    setup(store)
    with pytest.raises(GroupError,match="invalid_group"): store.create_group("s",members(n,count),datetime.now(timezone.utc))
def test_unknown_entity_cannot_be_confirmed(store):
    with pytest.raises(GroupError,match="unconfirmed_entity"): store.create_group("s",members(),datetime.now(timezone.utc))
def test_cross_session_access_is_denied(store):
    setup(store);store.create_group("s",members(),datetime.now(timezone.utc))
    with pytest.raises(GroupError):store.get_group("other")
def test_revision_conflict_is_explicit(store):
    setup(store);store.create_group("s",members(),datetime.now(timezone.utc))
    with pytest.raises(GroupError,match="version_conflict"):store.update_group("s",0,members(),datetime.now(timezone.utc))
def test_24_hour_cleanup(store):
    setup(store);now=datetime.now(timezone.utc);store.create_group("s",members(),now)
    assert store.purge_expired(now+timedelta(hours=24))>0
    with pytest.raises(GroupError):store.get_group("s")
