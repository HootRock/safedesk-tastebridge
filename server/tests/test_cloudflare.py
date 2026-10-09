"""Offline Cloudflare protocol, bounds and real application planning flows."""
import importlib
import json
from datetime import datetime, timezone
from uuid import UUID

import httpx
import pytest

from hackathon_core.config import Settings
from hackathon_core.contracts import LimitReached, RunBudget
from hackathon_core.model import Message, ModelError
from test_hosted import READ, RecordingQuota, response


ACCOUNT = "0123456789abcdef0123456789abcdef"
MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
SECRET = "test-only-cloudflare-token"


def settings(**overrides):
    values = dict(model_provider="cloudflare", cloudflare_account_id=ACCOUNT,
                  cloudflare_api_token=SECRET, cloudflare_model_name=MODEL)
    values.update(overrides)
    return Settings(**values)


def gateway(config, client=None, quota=None):
    return importlib.import_module("hackathon_core.hosted").CloudflareGateway(config, client=client, quota=quota)


def cf_response(content=None, *, wrapped=False, finish_reason="stop"):
    body = response(content, finish_reason=finish_reason)
    body["model"] = MODEL
    return {"success": True, "errors": [], "messages": [], "result": body} if wrapped else body


@pytest.mark.parametrize("wrapped", [False, True])
async def test_cloudflare_uses_account_endpoint_actual_schema_and_bounded_output(wrapped):
    quota = RecordingQuota()
    budget = RunBudget()
    captured = []

    def handle(request):
        assert budget.model_attempts == 1 and quota.claims == [("cloudflare", datetime.now(timezone.utc).date().isoformat(), 100)]
        captured.append(request)
        return httpx.Response(200, json=cf_response(wrapped=wrapped))

    async with httpx.AsyncClient(trust_env=False, transport=httpx.MockTransport(handle)) as client:
        turn = await gateway(settings(public_hosting=True), client, quota).next_action(
            [Message(role="user", content="Read doc-1")], [READ], budget=budget)
    request = captured[0]
    payload = json.loads(request.content)
    assert request.method == "POST"
    assert str(request.url) == f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/v1/chat/completions"
    assert request.headers["authorization"] == f"Bearer {SECRET}"
    assert payload["model"] == MODEL and payload["max_tokens"] == 1024 and payload["stream"] is False
    assert "reasoning_effort" not in payload and "max_completion_tokens" not in payload and "tools" not in payload
    schema = payload["response_format"]["json_schema"]
    assert payload["response_format"]["type"] == "json_schema"
    assert schema["type"] == "object" and schema["additionalProperties"] is False
    assert set(schema["required"]) == {"tool_calls", "text"}
    assert schema["$defs"]["PlannerCall"]["properties"]["name"]["enum"] == ["read_document"]
    assert "strict" not in schema and "schema" not in schema
    assert SECRET not in request.content.decode() and len(request.content) <= 6000
    assert turn.tool_calls[0].args == {"document_id": "doc-1"}
    assert (turn.usage.input_tokens, turn.usage.output_tokens) == (180, 40)


@pytest.mark.parametrize("overrides,error", [
    ({"cloudflare_account_id": ""}, "model_unconfigured"),
    ({"cloudflare_account_id": "a" * 31}, "model_unconfigured"),
    ({"cloudflare_account_id": "g" * 32}, "model_unconfigured"),
    ({"cloudflare_account_id": "../" + "a" * 32}, "model_unconfigured"),
    ({"cloudflare_api_token": ""}, "model_unconfigured"),
    ({"cloudflare_api_token": "bad\nheader"}, "model_unconfigured"),
    ({"cloudflare_api_token": "bad-密钥"}, "model_unconfigured"),
    ({"cloudflare_model_name": "@cf/paid-or-other-model"}, "model_unconfigured"),
    ({"daily_model_limit": 0}, "model_unconfigured"),
    ({"public_hosting": True}, "model_quota_unavailable"),
])
async def test_cloudflare_invalid_config_never_consumes_budget_or_makes_request(overrides, error):
    calls = []
    budget = RunBudget()
    async with httpx.AsyncClient(trust_env=False, transport=httpx.MockTransport(lambda request: calls.append(request))) as client:
        with pytest.raises(ModelError, match=f"^{error}$"):
            await gateway(settings(**overrides), client).next_action([], [], budget=budget)
    assert calls == [] and budget.model_attempts == 0


@pytest.mark.parametrize("status,error", [(400, "model_unavailable"), (401, "model_unconfigured"), (403, "model_unconfigured"), (429, "model_usage_limit"), (500, "model_unavailable"), (302, "model_unavailable")])
async def test_cloudflare_provider_failure_has_no_retry_redirect_or_secret_reflection(status, error):
    quota = RecordingQuota()
    calls = []
    budget = RunBudget()

    def handle(request):
        calls.append(request)
        return httpx.Response(status, json={"error": {"message": SECRET}}, headers={"location": "https://example.test/steal"})

    async with httpx.AsyncClient(trust_env=False, follow_redirects=True, transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(ModelError, match=f"^{error}$") as exc:
            await gateway(settings(public_hosting=True), client, quota).next_action([], [], budget=budget)
    assert len(calls) == len(quota.claims) == budget.model_attempts == 1
    assert SECRET not in str(exc.value)


@pytest.mark.parametrize("body", [
    {"response": '{"tool_calls":[],"text":null}'},
    {"result": {"response": '{"tool_calls":[],"text":null}'}},
    {"success": False, "result": response()},
    {"choices": [], "result": response()},
    cf_response('{"tool_calls":[],"text":null}', finish_reason="length"),
    cf_response('{"tool_calls":[],"text":null,"extra":true}'),
    cf_response('{"tool_calls":[{"call_id":"a","name":"shell","arguments":"{}"}],"text":null}'),
    cf_response('{"tool_calls":[{"call_id":"a","name":"read_document","arguments":"{}"}],"text":null}'),
    cf_response('{"tool_calls":[],"text":"\\u0074est-only-cloudflare-token"}'),
])
async def test_cloudflare_rejects_legacy_shapes_failed_wrappers_truncation_and_invalid_output(body):
    async with httpx.AsyncClient(trust_env=False, transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body))) as client:
        with pytest.raises(ModelError, match="^invalid_model_output$") as exc:
            await gateway(settings(), client).next_action([], [READ], budget=RunBudget())
    assert SECRET not in str(exc.value)


async def test_cloudflare_and_groq_mask_all_configured_server_credentials():
    hosted = importlib.import_module("hackathon_core.hosted")
    secrets = (SECRET, "test-only-groq-token", "test-only-qloo-token", "test-only-database-token")
    config = settings(groq_api_key=secrets[1], qloo_api_key=secrets[2], remote_db_auth_token=secrets[3])
    calls = []

    def handle(request):
        calls.append(request.content.decode())
        return httpx.Response(200, json=cf_response('{"tool_calls":[],"text":"Please clarify."}'))

    async with httpx.AsyncClient(trust_env=False, transport=httpx.MockTransport(handle)) as client:
        for klass in (hosted.CloudflareGateway, hosted.GroqGateway):
            await klass(config, client=client).next_action([Message(role="user", content=" ".join(secrets))], [], budget=RunBudget())
    assert len(calls) == 2 and all(secret not in call for secret in secrets for call in calls)


async def test_cloudflare_complete_payload_cap_and_attempt_limit_fail_before_quota_or_http():
    calls = []
    quota = RecordingQuota()
    async with httpx.AsyncClient(trust_env=False, transport=httpx.MockTransport(lambda request: calls.append(request))) as client:
        planner = gateway(settings(public_hosting=True), client, quota)
        with pytest.raises(ModelError, match="^model_context_limit$"):
            await planner.next_action([Message(role="user", content="界" * 10000)], [READ], budget=RunBudget())
        with pytest.raises(LimitReached, match="^model_attempt_limit$"):
            await planner.next_action([], [], budget=RunBudget(model_attempts=4))
    assert calls == [] and quota.claims == []


async def test_cloudflare_daily_limit_is_persistent_and_cannot_exceed_100(tmp_path):
    from hackathon_core.database import Database
    from hackathon_core.quota import DailyQuota
    path = str(tmp_path / "quota.db")
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(200, json=cf_response('{"tool_calls":[],"text":"Please clarify."}'))

    async with httpx.AsyncClient(trust_env=False, transport=httpx.MockTransport(handle)) as client:
        planner = gateway(settings(public_hosting=True, daily_model_limit=9999), client, DailyQuota(Database(path)))
        for _ in range(100):
            await planner.next_action([], [], budget=RunBudget())
        reconstructed = gateway(settings(public_hosting=True, daily_model_limit=9999), client, DailyQuota(Database(path)))
        with pytest.raises(ModelError, match="^model_daily_limit$"):
            await reconstructed.next_action([], [], budget=RunBudget())
    assert len(calls) == 100


async def test_cloudflare_timeout_retains_quota_and_is_off_event_loop():
    import asyncio
    import threading
    from hackathon_core.database import DatabaseError
    calls = []
    quota = RecordingQuota()

    def timeout(request):
        calls.append(request)
        raise httpx.ReadTimeout(SECRET, request=request)

    async with httpx.AsyncClient(trust_env=False, transport=httpx.MockTransport(timeout)) as client:
        with pytest.raises(ModelError, match="^model_timeout$"):
            await gateway(settings(public_hosting=True), client, quota).next_action([], [], budget=RunBudget())
    assert len(calls) == len(quota.claims) == 1
    entered = threading.Event()
    release = threading.Event()

    class StalledQuota:
        def claim(self, *args):
            entered.set()
            release.wait(2)
            raise DatabaseError(SECRET)

    async with httpx.AsyncClient(trust_env=False, transport=httpx.MockTransport(timeout)) as client:
        pending = asyncio.create_task(gateway(settings(public_hosting=True), client, StalledQuota()).next_action([], [], budget=RunBudget()))
        try:
            assert await asyncio.wait_for(asyncio.to_thread(entered.wait, 1), 1.2)
            assert not pending.done()
            await asyncio.wait_for(asyncio.sleep(0.001), 0.1)
        finally:
            release.set()
        with pytest.raises(ModelError, match="^model_quota_unavailable$") as exc:
            await pending
    assert SECRET not in str(exc.value) and len(calls) == 1


async def test_cloudflare_cleanup_closes_owned_client_but_preserves_injected_client():
    planner = gateway(settings())
    await planner.aclose()
    assert planner.client.is_closed
    async with httpx.AsyncClient(trust_env=False) as client:
        await gateway(settings(), client).aclose()
        assert not client.is_closed


async def test_real_cloudflare_gateway_two_members_and_three_exact_watched_updates_fit_payload_cap(tmp_path):
    from tastebridge.agent import MovieAgent
    from tastebridge.models import EntityChoice, MemberPreference, MovieCandidate, QlooMovieResponse
    from tastebridge.store import TasteBridgeStore
    store = TasteBridgeStore(str(tmp_path / "group.db"))
    seeds = [str(UUID(int=number, version=4)) for number in (1, 2)]
    store.remember_choices("s", [EntityChoice(entity_id=seed, name=f"Synthetic seed {i}", kind="movie") for i, seed in enumerate(seeds)])
    members = [MemberPreference(member_id=f"member-{i}", nickname=f"Member {i}", entity_ids=[seed]) for i, seed in enumerate(seeds)]
    store.create_group("s", members, datetime.now(timezone.utc))
    ids = [f"00000000-0000-4000-8000-{i:012d}" for i in range(10, 20)]
    queried = []

    class QlooFixture:
        async def recommend_movies(self, member_seeds, excluded):
            queried.append((tuple(member_seeds), tuple(excluded)))
            return QlooMovieResponse(movies=[MovieCandidate(entity_id=entity, name=f"Synthetic film {i}", rank=i+1) for i, entity in enumerate(ids) if entity not in excluded], warnings=[], fetched_at=datetime.now(timezone.utc))

    sequence = iter(["recommend_for_group", "rank_for_group"] + [name for _ in range(3) for name in ("refine_preferences", "recommend_for_group", "rank_for_group")])
    requests = []

    def handle(request):
        requests.append(request)
        payload = json.loads(request.content)
        assert len(request.content) <= 6000
        assert payload["max_tokens"] == 1024
        name = next(sequence)
        schema = payload["response_format"]["json_schema"]
        assert schema["$defs"]["PlannerCall"]["properties"]["name"]["enum"] == [name]
        prompt = json.loads(payload["messages"][1]["content"])
        args = {"excluded_ids": [json.loads(prompt["messages"][1]["content"])["seen_entity_id"]]} if name == "refine_preferences" else {}
        content = json.dumps({"tool_calls": [{"call_id": str(len(requests)), "name": name, "arguments": json.dumps(args)}], "text": None})
        return httpx.Response(200, json=cf_response(content, wrapped=len(requests) % 2 == 0))

    async with httpx.AsyncClient(trust_env=False, transport=httpx.MockTransport(handle)) as client:
        agent = MovieAgent(gateway(settings(public_hosting=True), client, RecordingQuota()), QlooFixture(), store, "live")
        run = await agent.run("initial", "s", 1, None)
        assert run.status == "completed" and run.counters == {"model_attempts": 2, "tool_calls": 2}
        excluded = []
        for round_no in range(3):
            seen = run.candidates[0].entity_id
            excluded.append(seen)
            run = await agent.run(f"update-{round_no}", "s", round_no + 1, None, seen_entity_id=seen)
            assert run.status == "completed" and run.counters == {"model_attempts": 3, "tool_calls": 3}
            assert all(candidate.entity_id not in excluded for candidate in run.candidates)
    group = store.get_group("s")
    assert group.feedback_rounds == 3 and group.version == 4 and group.members == members
    assert group.excluded_ids == excluded and len(requests) == 11 and len(queried) == 8
