from datetime import datetime
from pydantic import Field
from hackathon_core.contracts import StrictModel
from hackathon_core.events import RunEvent

class Paragraph(StrictModel):
    paragraph_id: str
    text: str
class Document(StrictModel):
    document_id: str
    session_id: str
    paragraphs: list[Paragraph]
class SourceRef(StrictModel):
    document_id: str
    paragraph_id: str
    quote: str
class TaskItem(StrictModel):
    task_id: str
    title: str = Field(min_length=1,max_length=300)
    source: SourceRef
    start_at: str | None = None
    end_at: str | None = None
class TaskDraft(StrictModel):
    draft_id: str
    run_id: str = ""
    version: int = 1
    items: list[TaskItem]
    clarifications: list[str]
class CalendarEvent(StrictModel):
    event_id: str
    title: str
    start_at: str
    end_at: str
    source: SourceRef
class CalendarPreview(StrictModel):
    preview_id: str
    run_id: str
    session_id: str
    version: int
    events: list[CalendarEvent]
    content_hash: str = ""
class ApprovalReceipt(StrictModel):
    token: str
    expires_at: datetime
class CommitResult(StrictModel):
    commit_id: str
    event_ids: list[str]
class RunSnapshot(StrictModel):
    run_id: str
    state: str
    document: Document
    draft: TaskDraft | None = None
    preview: CalendarPreview | None = None
    events: list[RunEvent] = Field(default_factory=list)
    counters: dict = Field(default_factory=dict)
    error_code: str | None = None
    mode: str = "live"
    reference_date: str
    timezone: str
