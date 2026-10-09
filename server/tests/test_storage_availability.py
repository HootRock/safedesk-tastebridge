import asyncio
import importlib
import threading
import time
from datetime import datetime,timezone

import httpx
import pytest

from hackathon_core.config import Settings
from hackathon_core.contracts import RunBudget
from hackathon_core.database import DatabaseError
from hackathon_core.hosted import GroqGateway
from hackathon_core.model import ModelError
from tastebridge.qloo import QlooClient,QlooError


@pytest.fixture
def app(tmp_path,monkeypatch):
    # Import-time app construction must use an explicit credential-free fixture.
    monkeypatch.setattr(Settings,"from_env",classmethod(lambda cls:Settings(data_dir=str(tmp_path),mode="test")))
    main=importlib.import_module("hackathon_api.main")
    return main.create_app(Settings(data_dir=str(tmp_path),mode="test"))


def identity(app):
    session,token=app.state.sessions.create()
    return session,{"Cookie":f"hackathon_session={session}","X-Action-Token":token}


@pytest.mark.parametrize("boundary",["session","safedesk_poll","tastebridge_poll"])
async def test_stalled_storage_keeps_independent_health_responsive(app,monkeypatch,boundary):
    session,headers=identity(app)
    if boundary=="session":target=app.state.sessions;method="read";path="/api/safedesk/calendar"
    elif boundary=="safedesk_poll":target=app.state.sd_store;method="get_run";path="/api/safedesk/runs/missing"
    else:target=app.state.tb_store;method="get_run";path="/api/tastebridge/recommendations/missing"
    entered=threading.Event();release=threading.Event()
    def unavailable(*args):entered.set();release.wait(2);raise DatabaseError("storage_unavailable")
    monkeypatch.setattr(target,method,unavailable)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://testserver") as client:
        pending=asyncio.create_task(client.get(path,headers=headers))
        try:
            assert await asyncio.wait_for(asyncio.to_thread(entered.wait,1),1.2)
            assert not pending.done(),"storage blocked the event loop until its wait ended"
            health=await asyncio.wait_for(client.get("/api/health"),0.2)
            assert health.status_code==200
        finally:release.set()
        response=await pending
        assert response.status_code==503 and response.json()=={"detail":"storage_unavailable"}


@pytest.mark.parametrize("provider",["groq","qloo"])
async def test_stalled_quota_claim_is_off_event_loop_and_fail_closed(provider):
    release=threading.Event();calls=[]
    class UnavailableQuota:
        def claim(self,*args):release.wait(0.3);raise DatabaseError("storage_unavailable")
    def handler(request):calls.append(request);return httpx.Response(200,json={})
    async with httpx.AsyncClient(base_url="https://hackathon.api.qloo.com",transport=httpx.MockTransport(handler)) as client:
        if provider=="groq":
            service=GroqGateway(Settings(model_provider="groq",groq_api_key="test-key"),client,UnavailableQuota())
            operation=service.next_action([],[],budget=RunBudget());error=ModelError
        else:
            service=QlooClient(client,"test-key",quota=UnavailableQuota())
            operation=service.search_entities("Fixture","movie");error=QlooError
        pending=asyncio.create_task(operation)
        try:
            started=time.monotonic();await asyncio.sleep(0.02)
            assert time.monotonic()-started<0.2
        finally:release.set()
        with pytest.raises(error,match="quota_unavailable"):await pending
    assert calls==[]


@pytest.mark.parametrize("project",["sd","tb"])
async def test_initial_storage_await_reserves_run_before_duplicate_click(app,monkeypatch,project):
    session,headers=identity(app);release=threading.Event();entered=threading.Event();calls=[]
    class NoWork:
        def __init__(self,*args):pass
        async def run(self,*args):pass
    if project=="sd":
        monkeypatch.setattr("safedesk.routes.SafeDeskAgent",NoWork)
        original=app.state.sd_store.save_run
        def delayed(run):calls.append(run);entered.set();release.wait(2);return original(run)
        monkeypatch.setattr(app.state.sd_store,"save_run",delayed)
        path="/api/safedesk/runs";body={"text":"Review the plan.","goal":"Organize","reference_date":"2026-10-09","timezone":"Asia/Shanghai"}
    else:
        from tastebridge.models import EntityChoice,MemberPreference
        store=app.state.tb_store
        store.remember_choices(session,[EntityChoice(entity_id="seed",name="Fixture",kind="movie")])
        store.create_group(session,[MemberPreference(member_id=str(i),nickname=f"Person {i}",entity_ids=["seed"]) for i in range(2)],datetime.now(timezone.utc))
        monkeypatch.setattr("tastebridge.routes.MovieAgent",NoWork)
        original=store.get_group
        def delayed(value):calls.append(value);entered.set();release.wait(2);return original(value)
        monkeypatch.setattr(store,"get_group",delayed)
        path="/api/tastebridge/recommendations";body={"expected_version":1}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://testserver") as client:
        first=asyncio.create_task(client.post(path,headers=headers,json=body))
        try:
            assert await asyncio.wait_for(asyncio.to_thread(entered.wait,1),1.2)
            second=await asyncio.wait_for(client.post(path,headers=headers,json=body),0.2)
            assert second.status_code==429 and second.json()=={"detail":"run_in_progress"}
        finally:release.set()
        assert (await first).status_code==200
    assert len(calls)==1 and app.state.active==set()


async def test_failed_initial_storage_releases_run_reservation(app,monkeypatch):
    session,headers=identity(app)
    def unavailable(*args):raise DatabaseError("storage_unavailable")
    monkeypatch.setattr(app.state.sd_store,"save_run",unavailable)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://testserver") as client:
        response=await client.post("/api/safedesk/runs",headers=headers,json={"text":"Review.","goal":"Organize","reference_date":"2026-10-09","timezone":"Asia/Shanghai"})
    assert response.status_code==503 and app.state.active==set()


async def test_cleanup_storage_wait_keeps_health_responsive(app,monkeypatch):
    entered=threading.Event();release=threading.Event()
    def delayed(now):entered.set();release.wait(2);return 0
    monkeypatch.setattr(app.state.sd_store,"purge_expired",delayed)
    async with app.router.lifespan_context(app):
        try:
            assert await asyncio.wait_for(asyncio.to_thread(entered.wait,1),1.2)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://testserver") as client:
                assert (await asyncio.wait_for(client.get("/api/health"),0.2)).status_code==200
        finally:release.set()


async def test_offloaded_draft_edits_preserve_version_conflict(app,monkeypatch):
    from datetime import date
    from safedesk.documents import split_document,validate_tasks
    from safedesk.models import RunSnapshot
    session,headers=identity(app)
    document=split_document("Review the plan.",session)
    draft=validate_tasks(document,[],date(2026,10,9),"Asia/Shanghai")
    app.state.sd_store.save_run(RunSnapshot(run_id="edit-run",state="needs_clarification",document=document,draft=draft,reference_date="2026-10-09",timezone="Asia/Shanghai"))
    original=app.state.sd_store.get_run
    def delayed_read(*args):
        snapshot=original(*args);time.sleep(0.08);return snapshot
    monkeypatch.setattr(app.state.sd_store,"get_run",delayed_read)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://testserver") as client:
        responses=await asyncio.gather(*[client.patch("/api/safedesk/runs/edit-run/draft",headers=headers,json={"expected_version":1,"items":[]}) for _ in range(2)])
    assert sorted(response.status_code for response in responses)==[200,409]
    assert original(session,"edit-run").draft.version==2
