from dataclasses import dataclass
from pydantic import BaseModel, ConfigDict, ValidationError

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class ToolCall(StrictModel):
    call_id: str
    name: str
    args: dict

@dataclass(frozen=True)
class ToolDefinition:
    name: str
    args_model: type[BaseModel]
    @property
    def args_schema(self): return self.args_model.model_json_schema()

class ToolValidationError(ValueError): pass
class LimitReached(RuntimeError): pass

@dataclass
class RunBudget:
    model_attempts: int = 0
    tool_calls: int = 0
    def consume_model_attempt(self):
        if self.model_attempts >= 4: raise LimitReached("model_attempt_limit")
        self.model_attempts += 1
    def consume_tool_call(self):
        if self.tool_calls >= 8: raise LimitReached("tool_call_limit")
        self.tool_calls += 1

def parse_tool_call(payload: dict, registry: dict[str,ToolDefinition]) -> ToolCall:
    try: call=ToolCall.model_validate(payload)
    except ValidationError as exc: raise ToolValidationError("invalid_arguments") from exc
    if call.name not in registry: raise ToolValidationError("unknown_tool")
    try: registry[call.name].args_model.model_validate(call.args)
    except ValidationError as exc: raise ToolValidationError("invalid_arguments") from exc
    return call
