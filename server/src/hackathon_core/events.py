from datetime import datetime, timezone
from typing import Literal
from pydantic import Field
from .contracts import StrictModel

class RunEvent(StrictModel):
    seq: int
    kind: str
    tool_name: str | None = None
    decision: str | None = None
    source: dict | None = None
    payload: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda:datetime.now(timezone.utc))
    mode: Literal["live","test"] = "live"

def serialize_event(event: RunEvent, secrets: tuple[str,...]) -> dict:
    def clean(value):
        if isinstance(value,dict): return {k:("[redacted]" if any(s in k.lower() for s in ("key","token","authorization","secret")) else clean(v)) for k,v in value.items()}
        if isinstance(value,list): return [clean(v) for v in value]
        if isinstance(value,str):
            for secret in secrets:
                if secret: value=value.replace(secret,"[redacted]")
        return value
    return clean(event.model_dump(mode="json"))
