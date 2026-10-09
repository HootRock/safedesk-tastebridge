from datetime import date
import pytest
from safedesk.documents import split_document,verify_source,validate_tasks,DocumentValidationError
from safedesk.models import SourceRef,TaskItem

def item(doc,start=None,end=None):
    return TaskItem(task_id="t",title="Review",source=SourceRef(document_id=doc.document_id,paragraph_id="p1",quote=doc.paragraphs[0].text),start_at=start,end_at=end)

def test_source_must_match():
    doc=split_document("Review the proposal.","s1")
    ref=item(doc).source
    assert verify_source(doc,ref)
    assert not verify_source(doc,ref.model_copy(update={"quote":"Invented text"}))

def test_unicode_limit():
    assert len(split_document("😀"*20000,"s").paragraphs[0].text)==20000
    with pytest.raises(DocumentValidationError,match="document_too_long"): split_document("😀"*20001,"s")

def test_missing_end_needs_clarification():
    doc=split_document("Review tomorrow at 10:00.","s")
    result=validate_tasks(doc,[item(doc,"tomorrow 10:00")],date(2026,10,3),"Asia/Shanghai")
    assert result.clarifications and result.items[0].start_at is None

def test_relative_date_uses_reference():
    doc=split_document("Review tomorrow 10:00–11:00.","s")
    result=validate_tasks(doc,[item(doc,"tomorrow 10:00","tomorrow 11:00")],date(2026,10,3),"Asia/Shanghai")
    assert result.items[0].start_at=="2026-10-04T10:00:00+08:00"

@pytest.mark.parametrize("start,end",[("2026-11-01 01:15","2026-11-01 01:45"),("2026-03-08 02:15","2026-03-08 02:45")])
def test_ambiguous_timezone_needs_clarification(start,end):
    doc=split_document("Meeting", "s")
    result=validate_tasks(doc,[item(doc,start,end)],date(2026,10,3),"America/New_York")
    assert result.clarifications and result.items[0].start_at is None

def test_false_source_never_creates_task():
    doc=split_document("Meeting", "s")
    task=item(doc);task.source.quote="Invented"
    result=validate_tasks(doc,[task],date(2026,10,3),"Asia/Shanghai")
    assert result.items==[] and "source_unlocated" in result.clarifications[0]

@pytest.mark.parametrize('start,end',[
 ('2026-10-05T10:00:59+00:00','2026-10-05T11:00:59+00:00'),
 ('2026-10-05T10:00:59+08:00','2026-10-05T11:00:59+08:00'),
 ('2026-10-05T10:00:00+00:00','2026-10-05T11:00:00+00:00')])
def test_source_cannot_authorize_invented_precision_or_offset(start,end):
    doc=split_document('Meet on 2026-10-05 from 10:00 to 11:00.','s')
    draft=validate_tasks(doc,[item(doc,start,end)],date(2026,10,3),'Asia/Shanghai')
    assert draft.items[0].start_at is None and draft.clarifications

def test_aware_timestamp_cannot_bypass_dst_ambiguity():
    doc=split_document('Meet on 2026-11-01 from 01:15 to 01:45.','s')
    draft=validate_tasks(doc,[item(doc,'2026-11-01T01:15:00-04:00','2026-11-01T01:45:00-04:00')],date(2026,10,3),'America/New_York')
    assert draft.items[0].start_at is None

def test_date_overflow_needs_clarification():
    doc=split_document('Meet tomorrow 10:00 to 11:00.','s')
    draft=validate_tasks(doc,[item(doc,'tomorrow 10:00','tomorrow 11:00')],date.max,'Asia/Shanghai')
    assert draft.items[0].start_at is None and draft.clarifications
