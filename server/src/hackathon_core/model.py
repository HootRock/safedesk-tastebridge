from typing import Protocol
from pydantic import Field
from .contracts import StrictModel, ToolCall, ToolDefinition, RunBudget

class Message(StrictModel):
    role: str
    content: str
    tool_call_id: str | None = None

class TokenUsage(StrictModel):
    input_tokens: int
    output_tokens: int

class ModelTurn(StrictModel):
    tool_calls: list[ToolCall] = Field(default_factory=list)
    text: str | None = None
    usage: TokenUsage | None = None

class ModelError(RuntimeError): pass

class ModelGateway(Protocol):
    async def next_action(self, messages: list[Message], tools: list[ToolDefinition], *, budget: RunBudget) -> ModelTurn: ...
