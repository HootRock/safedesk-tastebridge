import uuid,asyncio
from datetime import datetime,timezone
from fastapi import APIRouter,Request,BackgroundTasks,HTTPException
from pydantic import Field
from starlette.concurrency import run_in_threadpool
from hackathon_core.contracts import StrictModel
from hackathon_core.sessions import require_session
from .models import MemberPreference,EntityKind,RecommendationRun
from .agent import MovieAgent

router=APIRouter(prefix="/api/tastebridge")
class Members(StrictModel):members:list[MemberPreference]=Field(min_length=2,max_length=4)
class Update(Members):expected_version:int
class Recommend(StrictModel):
    expected_version:int
    feedback:str|None=Field(default=None,max_length=1000)
    seen_entity_id:str|None=Field(default=None,min_length=1,max_length=100)
@router.get("/entities/search")
async def search(request:Request,query:str,kind:EntityKind):
    session=await require_session(request);state=request.app.state
    choices=await state.qloo.search_entities(query,kind);await run_in_threadpool(state.tb_store.remember_choices,session,choices);return choices
@router.post("/groups")
async def create(body:Members,request:Request):return await run_in_threadpool(request.app.state.tb_store.create_group,await require_session(request,True),body.members,datetime.now(timezone.utc))
@router.get("/groups")
async def get_group(request:Request):return await run_in_threadpool(request.app.state.tb_store.get_group,await require_session(request))
@router.put("/groups/preferences")
async def update(body:Update,request:Request):return await run_in_threadpool(request.app.state.tb_store.update_group,await require_session(request,True),body.expected_version,body.members,datetime.now(timezone.utc))
@router.post("/recommendations")
async def recommend(body:Recommend,request:Request,background:BackgroundTasks):
    session=await require_session(request,True);state=request.app.state
    if ("tb",session) in state.active or len(state.active)>=2:raise HTTPException(429,"run_in_progress")
    state.active.add(("tb",session))
    try:
        group=await run_in_threadpool(state.tb_store.get_group,session)
        if group.version!=body.expected_version:raise HTTPException(409,"version_conflict")
        run_id=uuid.uuid4().hex
        initial=RecommendationRun(run_id=run_id,session_id=session,group_version=group.version,status="running",mode=state.settings.mode)
        await run_in_threadpool(state.tb_store.save_run,initial)
    except BaseException:
        state.active.discard(("tb",session));raise
    async def work():
        try:await MovieAgent(state.model,state.qloo,state.tb_store,state.settings.mode).run(run_id,session,body.expected_version,body.feedback,body.seen_entity_id)
        except asyncio.CancelledError:
            initial.status='failed';initial.error_code='run_cancelled';await run_in_threadpool(state.tb_store.save_run,initial);raise
        except Exception:
            initial.status='failed';initial.error_code='internal_error';await run_in_threadpool(state.tb_store.save_run,initial)
        finally:state.active.discard(("tb",session))
    background.add_task(work);return {"run_id":run_id}
@router.get("/recommendations/{run_id}")
async def get(run_id:str,request:Request):return await run_in_threadpool(request.app.state.tb_store.get_run,await require_session(request),run_id)
