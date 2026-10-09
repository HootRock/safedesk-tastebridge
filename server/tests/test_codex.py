import json,pytest
from hackathon_core.codex import CodexGateway,decode_planner_output,build_command
from hackathon_core.config import Settings
from hackathon_core.contracts import RunBudget
from hackathon_core.model import Message,ModelError

def test_bad_arguments_json_stops_safely():
    with pytest.raises(ModelError,match="invalid_model_output"):
        decode_planner_output('{"tool_calls":[{"call_id":"a","name":"read","arguments":"invalid"}],"text":null}')

def test_model_output_becomes_server_tool_request():
    turn=decode_planner_output('{"tool_calls":[{"call_id":"a","name":"read","arguments":"{\\"id\\":\\"d\\"}"}],"text":null}')
    assert turn.tool_calls[0].args=={"id":"d"}

async def test_disabled_connector_makes_no_model_attempt():
    budget=RunBudget()
    with pytest.raises(ModelError,match="model_unconfigured"):
        await CodexGateway(Settings()).next_action([Message(role="user",content="hi")],[],budget=budget)
    assert budget.model_attempts==0

async def test_public_hosting_cannot_use_local_subscription():
    with pytest.raises(ModelError,match="local_model_only"):
        await CodexGateway(Settings(codex_enabled=True,public_hosting=True)).next_action([],[],budget=RunBudget())

def test_command_disables_host_tools_and_forces_subscription():
    args=build_command("codex","gpt-6-luna","schema","out")
    assert "read-only" in args and '--ignore-user-config' in args
    assert 'forced_login_method="chatgpt"' in args
    for feature in ("shell_tool","apps","hooks","multi_agent","remote_plugin"):
        assert args[args.index(feature)-1]=="--disable"
