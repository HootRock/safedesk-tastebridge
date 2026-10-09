from dataclasses import dataclass
from hackathon_core.contracts import RunBudget,ToolCall

@dataclass
class ToolContext:
    session_id: str
    run_id: str
    allowed_tools: set[str]
    budget: RunBudget

@dataclass
class PolicyDecision:
    allowed: bool
    reason: str

def authorize(ctx:ToolContext,call:ToolCall):
    if call.name not in ctx.allowed_tools: return PolicyDecision(False,"unknown_tool")
    if call.args.get("session_id",ctx.session_id)!=ctx.session_id: return PolicyDecision(False,"wrong_session")
    if call.name=="commit_calendar": return PolicyDecision(False,"human_approval_required")
    return PolicyDecision(True,"allowed")
