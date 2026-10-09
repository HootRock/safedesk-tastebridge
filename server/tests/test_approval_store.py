from datetime import datetime,timezone,timedelta
from concurrent.futures import ThreadPoolExecutor
import pytest
from safedesk.store import SafeDeskStore,ApprovalError
from safedesk.models import CalendarPreview,CalendarEvent,SourceRef

@pytest.fixture
def store(tmp_path): return SafeDeskStore(str(tmp_path/"calendar.db"))
@pytest.fixture
def now(): return datetime(2026,10,3,tzinfo=timezone.utc)
@pytest.fixture
def preview():
    return CalendarPreview(preview_id="p",run_id="r",session_id="s",version=1,events=[CalendarEvent(event_id="e",title="Review",start_at="2026-10-05T10:00:00+08:00",end_at="2026-10-05T11:00:00+08:00",source=SourceRef(document_id="d",paragraph_id="p1",quote="Review"))])

def test_no_approval_creates_no_events(store,preview,now):
    store.save_preview(preview,now)
    with pytest.raises(ApprovalError): store.commit_calendar("s","r","p","fake",now)
    assert store.list_calendar_events("s")==[]

@pytest.mark.parametrize("session,run",[("other","r"),("s","other")])
def test_wrong_scope_is_denied(store,preview,now,session,run):
    store.save_preview(preview,now); receipt=store.issue_approval("s","r","p",now)
    with pytest.raises(ApprovalError): store.commit_calendar(session,run,"p",receipt.token,now)

def test_content_change_revokes_approval(store,preview,now):
    store.save_preview(preview,now);receipt=store.issue_approval("s","r","p",now)
    preview.events[0].title="Changed";store.save_preview(preview,now)
    with pytest.raises(ApprovalError): store.commit_calendar("s","r","p",receipt.token,now)
    assert store.list_calendar_events("s")==[]

def test_expiry_at_ten_minutes(store,preview,now):
    store.save_preview(preview,now);receipt=store.issue_approval("s","r","p",now)
    with pytest.raises(ApprovalError,match="approval_expired"): store.commit_calendar("s","r","p",receipt.token,now+timedelta(minutes=10))

def test_repeated_commit_is_idempotent(store,preview,now):
    store.save_preview(preview,now);receipt=store.issue_approval("s","r","p",now)
    args=("s","r","p",receipt.token,now)
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(lambda _:store.commit_calendar(*args),range(2)))
    assert results[0].commit_id==results[1].commit_id
    reopened=SafeDeskStore(store.path)
    assert reopened.commit_calendar(*args).commit_id==results[0].commit_id
    assert len(reopened.list_calendar_events("s"))==1

def test_24_hour_cleanup(store,preview,now):
    store.save_preview(preview,now);receipt=store.issue_approval("s","r","p",now)
    store.commit_calendar("s","r","p",receipt.token,now)
    assert store.purge_expired(now+timedelta(hours=24))>0
    assert store.list_calendar_events("s")==[]
