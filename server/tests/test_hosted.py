import importlib
import json
from datetime import datetime, timezone

import httpx
import pytest

from hackathon_core.config import Settings
from hackathon_core.contracts import LimitReached, RunBudget, StrictModel, ToolDefinition
from hackathon_core.model import Message, ModelError


class ReadArgs(StrictModel):
    document_id: str


READ = ToolDefinition("read_document", ReadArgs)
SECRET = "test-only-groq-secret"


class RecordingQuota:
    def __init__(self, *, unavailable=False):
        self.claims = []
        self.counts = {}
        self.unavailable = unavailable

    def claim(self, service, day, limit):
        self.claims.append((service, day, limit))
        if self.unavailable:
            raise RuntimeError(SECRET)
        key = (service, day)
        if self.counts.get(key, 0) >= limit:
            return False
        self.counts[key] = self.counts.get(key, 0) + 1
        return True


def settings(**overrides):
    return Settings(groq_api_key=SECRET, model_provider="groq", **overrides)


def response(content=None, *, finish_reason="stop", usage=None):
    if content is None:
        content = json.dumps({"tool_calls": [{"call_id": "read-1", "name": "read_document", "arguments": '{"document_id":"doc-1"}'}], "text": None})
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 1,
        "model": "openai/gpt-oss-20b",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": finish_reason}],
        "usage": usage or {"prompt_tokens": 180, "completion_tokens": 40, "total_tokens": 220},
    }


def gateway(config, client, quota=None):
    return importlib.import_module("hackathon_core.hosted").GroqGateway(config, client=client, quota=quota)


async def test_structured_request_decodes_only_application_tools_after_claims():
    quota = RecordingQuota()
    budget = RunBudget()
    captured = []

    def handle(request):
        assert budget.model_attempts == 1
        assert len(quota.claims) == 1
        captured.append(request)
        return httpx.Response(200, json=response())

    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(handle)) as client:
        turn = await gateway(settings(public_hosting=True), client, quota).next_action(
            [Message(role="user", content="Read doc-1")], [READ], budget=budget
        )

    request = captured[0]
    payload = json.loads(request.content)
    assert request.method == "POST"
    assert str(request.url) == "https://api.groq.com/openai/v1/chat/completions"
    assert request.headers["authorization"] == f"Bearer {SECRET}"
    assert payload["model"] == "openai/gpt-oss-20b"
    assert payload["stream"] is False
    assert payload["reasoning_effort"] == "low"
    assert 0 < payload["max_completion_tokens"] <= 1024
    assert "tools" not in payload and "compound_custom" not in payload
    schema = payload["response_format"]
    assert schema["type"] == "json_schema"
    assert schema["json_schema"]["strict"] is True
    assert set(schema["json_schema"]["schema"]["required"]) == {"tool_calls", "text"}
    assert schema["json_schema"]["schema"]["additionalProperties"] is False
    prompt = json.loads(payload["messages"][1]["content"])
    assert prompt["messages"][0]["content"] == "Read doc-1"
    assert prompt["application_tools"][0]["name"] == "read_document"
    assert SECRET not in request.content.decode()
    assert quota.claims[0][0] == "groq"
    assert quota.claims[0][1] == datetime.now(timezone.utc).date().isoformat()
    assert quota.claims[0][2] == 100
    assert turn.tool_calls[0].args == {"document_id": "doc-1"}
    assert turn.usage.input_tokens == 180 and turn.usage.output_tokens == 40


async def test_exhausted_attempt_budget_prevents_quota_and_http():
    quota = RecordingQuota()
    requests = []
    budget = RunBudget(model_attempts=4)
    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(lambda request: requests.append(request))) as client:
        with pytest.raises(LimitReached, match="^model_attempt_limit$"):
            await gateway(settings(), client, quota).next_action([], [], budget=budget)
    assert not quota.claims and not requests


async def test_public_daily_quota_cannot_be_raised_above_100_requests():
    quota = RecordingQuota()
    requests = []
    content = '{"tool_calls":[],"text":"Please clarify."}'

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json=response(content))

    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(handle)) as client:
        planner = gateway(settings(public_hosting=True, daily_model_limit=9999), client, quota)
        for _ in range(100):
            await planner.next_action([], [], budget=RunBudget())
        blocked_budget = RunBudget()
        with pytest.raises(ModelError, match="^model_daily_limit$"):
            await planner.next_action([], [], budget=blocked_budget)
    assert len(requests) == 100
    assert blocked_budget.model_attempts == 1


@pytest.mark.parametrize("config,quota,error", [
    ({"groq_api_key": ""}, RecordingQuota(), "model_unconfigured"),
    ({"groq_api_key": "invalid\nheader"}, RecordingQuota(), "model_unconfigured"),
    ({"groq_api_key": "invalid-密钥"}, RecordingQuota(), "model_unconfigured"),
    ({"groq_model_name": "other/model"}, RecordingQuota(), "model_unconfigured"),
    ({"public_hosting": True}, None, "model_quota_unavailable"),
])
async def test_invalid_hosted_configuration_makes_no_attempt(config, quota, error):
    config = {"groq_api_key": SECRET, "model_provider": "groq", **config}
    requests = []
    budget = RunBudget()
    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(lambda request: requests.append(request))) as client:
        with pytest.raises(ModelError, match=f"^{error}$"):
            await gateway(Settings(**config), client, quota).next_action([], [], budget=budget)
    assert budget.model_attempts == 0 and not requests


async def test_failed_quota_storage_fails_closed_without_secret_reflection():
    quota = RecordingQuota(unavailable=True)
    requests = []
    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(lambda request: requests.append(request))) as client:
        with pytest.raises(ModelError, match="^model_quota_unavailable$") as exc:
            await gateway(settings(public_hosting=True), client, quota).next_action([], [], budget=RunBudget())
    assert SECRET not in str(exc.value) and not requests


@pytest.mark.parametrize("status,error", [(400, "model_unavailable"), (401, "model_unconfigured"), (403, "model_unconfigured"), (429, "model_usage_limit"), (500, "model_unavailable"), (302, "model_unavailable")])
async def test_provider_errors_consume_one_attempt_without_retry_or_reflection(status, error):
    quota = RecordingQuota()
    requests = []
    budget = RunBudget()

    def handle(request):
        requests.append(request)
        return httpx.Response(status, json={"error": {"message": SECRET}}, headers={"location": "https://example.com/steal"})

    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(handle), follow_redirects=True) as client:
        with pytest.raises(ModelError, match=f"^{error}$") as exc:
            await gateway(settings(public_hosting=True), client, quota).next_action([], [], budget=budget)
    assert len(requests) == 1 and len(quota.claims) == 1 and budget.model_attempts == 1
    assert SECRET not in str(exc.value)


@pytest.mark.parametrize("failure,error", [(httpx.ReadTimeout, "model_timeout"), (httpx.ConnectError, "model_unavailable")])
async def test_transport_failure_keeps_claim_and_never_retries(failure, error):
    quota = RecordingQuota()
    requests = []
    budget = RunBudget()

    def handle(request):
        requests.append(request)
        raise failure(SECRET, request=request)

    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(ModelError, match=f"^{error}$") as exc:
            await gateway(settings(public_hosting=True), client, quota).next_action([], [], budget=budget)
    assert len(requests) == 1 and budget.model_attempts == 1 and len(quota.claims) == 1
    assert SECRET not in str(exc.value)


@pytest.mark.parametrize("content", [
    "not json",
    '{"tool_calls":[],"text":null,"extra":true}',
    '{"tool_calls":[{"call_id":"a","name":"shell","arguments":"{}"}],"text":null}',
    '{"tool_calls":[{"call_id":"a","name":"read_document","arguments":"[]"}],"text":null}',
    '{"tool_calls":[{"call_id":"a","name":"read_document","arguments":"{}"}],"text":null}',
    '{"tool_calls":[{"call_id":"a","name":"read_document","arguments":"{\\"document_id\\":\\"d\\",\\"extra\\":1}"}],"text":null}',
    json.dumps({"tool_calls": [], "text": SECRET}),
    '{"tool_calls":[],"text":"\\u0074est-only-groq-secret"}',
])
async def test_invalid_or_secret_bearing_model_output_is_rejected(content):
    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(lambda request: httpx.Response(200, json=response(content)))) as client:
        with pytest.raises(ModelError, match="^invalid_model_output$") as exc:
            await gateway(settings(), client).next_action([], [READ], budget=RunBudget())
    assert SECRET not in str(exc.value)


@pytest.mark.parametrize("body", [{}, {"choices": []}, response("{}", finish_reason="length"), {"choices": [{"message": {"content": None}, "finish_reason": "stop"}]}])
async def test_malformed_provider_envelope_becomes_stable_error(body):
    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body))) as client:
        with pytest.raises(ModelError, match="^invalid_model_output$"):
            await gateway(settings(), client).next_action([], [], budget=RunBudget())


async def test_tool_output_cannot_exceed_remaining_run_tool_budget():
    calls = [{"call_id": str(index), "name": "read_document", "arguments": '{"document_id":"d"}'} for index in range(2)]
    content = json.dumps({"tool_calls": calls, "text": None})
    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(lambda request: httpx.Response(200, json=response(content)))) as client:
        with pytest.raises(ModelError, match="^invalid_model_output$"):
            await gateway(settings(), client).next_action([], [READ], budget=RunBudget(tool_calls=7))


async def test_oversize_context_fails_before_attempt_quota_or_http():
    quota = RecordingQuota()
    requests = []
    budget = RunBudget()
    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(lambda request: requests.append(request))) as client:
        with pytest.raises(ModelError, match="^model_context_limit$"):
            await gateway(settings(), client, quota).next_action([Message(role="user", content="界" * 10000)], [READ], budget=budget)
    assert not requests and not quota.claims and budget.model_attempts == 0


async def test_known_server_secrets_are_removed_from_provider_context():
    captured = []
    config = settings(qloo_api_key="test-only-qloo-secret", remote_db_auth_token="test-only-db-token")

    def handle(request):
        captured.append(request.content.decode())
        return httpx.Response(200, json=response('{"tool_calls":[],"text":"Please clarify."}'))

    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(handle)) as client:
        turn = await gateway(config, client).next_action([Message(role="user", content=f"{SECRET} test-only-qloo-secret test-only-db-token")], [], budget=RunBudget())
    assert turn.text == "Please clarify."
    for value in (SECRET, "test-only-qloo-secret", "test-only-db-token"):
        assert value not in captured[0]


async def test_gateway_cleanup_leaves_injected_http_client_owned_by_caller():
    async with httpx.AsyncClient(verify=False, trust_env=False, transport=httpx.MockTransport(lambda request: httpx.Response(200))) as client:
        planner = gateway(settings(), client)
        await planner.aclose()
        assert not client.is_closed


async def test_gateway_cleanup_closes_owned_http_client():
    planner = importlib.import_module("hackathon_core.hosted").GroqGateway(settings())
    await planner.aclose()
    assert planner.client.is_closed

