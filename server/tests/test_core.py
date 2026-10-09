import pytest
from pydantic import BaseModel, ConfigDict
from hackathon_core.contracts import ToolDefinition, parse_tool_call, ToolValidationError, RunBudget, LimitReached
from hackathon_core.events import RunEvent, serialize_event

class Args(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: str

def test_unknown_tool_is_rejected():
    with pytest.raises(ToolValidationError, match="unknown_tool"):
        parse_tool_call({"call_id":"x","name":"send_email","args":{}}, {})

def test_extra_arguments_are_rejected():
    with pytest.raises(ToolValidationError, match="invalid_arguments"):
        parse_tool_call({"call_id":"x","name":"read","args":{"value":"a","extra":1}}, {"read":ToolDefinition(name="read", args_model=Args)})

@pytest.mark.parametrize("method,limit", [("consume_tool_call",8),("consume_model_attempt",4)])
def test_attempt_limit(method,limit):
    budget=RunBudget()
    for _ in range(limit): getattr(budget,method)()
    with pytest.raises(LimitReached): getattr(budget,method)()

def test_nested_secrets_are_redacted():
    event=RunEvent(seq=1,kind="tool",payload={"nested":["a fake-secret b"],"API_KEY":"other"},mode="test")
    result=serialize_event(event,("fake-secret",))
    assert result["payload"]=={"nested":["a [redacted] b"],"API_KEY":"[redacted]"}
