import uuid,asyncio
from datetime import date,datetime,timezone
from fastapi import APIRouter,Request,BackgroundTasks,HTTPException
from pydantic import Field
from starlette.concurrency import run_in_threadpool
from hackathon_core.contracts import StrictModel,RunBudget
from hackathon_core.sessions import require_session
from .documents import split_document,validate_tasks
from .models import RunSnapshot,TaskItem
from .agent import SafeDeskAgent,preview_from_draft,REGISTRY
from .policy import ToolContext

router=APIRouter(prefix="/api/safedesk")
class Start(StrictModel):
    text:str=Field(min_length=1,max_length=20000)
    goal:str=Field(min_length=1,max_length=1000)
    reference_date:date
    timezone:str=Field(max_length=80)
class DraftEdit(StrictModel): expected_version:int;items:list[TaskItem]=Field(max_length=30)
class Approve(StrictModel):preview_id:str
class Commit(Approve):token:str

@router.post("/runs")
async def start(body:Start,request:Request,background:BackgroundTasks):
    session=await require_session(request,True);state=request.app.state
    if ("sd",session) in state.active or len(state.active)>=2:raise HTTPException(429,"run_in_progress")
    doc=split_document(body.text,session);validate_tasks(doc,[],body.reference_date,body.timezone)
    run_id=uuid.uuid4().hex
    initial=RunSnapshot(run_id=run_id,state="running",document=doc,reference_date=str(body.reference_date),timezone=body.timezone,mode=state.settings.mode)
    state.active.add(("sd",session))
    try:await run_in_threadpool(state.sd_store.save_run,initial)
    except BaseException:
        state.active.discard(("sd",session));raise
    async def work():
        try:await SafeDeskAgent(state.model,state.sd_store,state.settings.mode).run(ToolContext(session,run_id,set(REGISTRY),RunBudget()),body.goal,doc,body.reference_date,body.timezone)
        except asyncio.CancelledError:
            initial.state='failed';initial.error_code='run_cancelled';await run_in_threadpool(state.sd_store.save_run,initial);raise
        except Exception:
            initial.state='failed';initial.error_code='internal_error';await run_in_threadpool(state.sd_store.save_run,initial)
        finally:state.active.discard(("sd",session))
    background.add_task(work);return {"run_id":run_id}
@router.get("/runs/{run_id}")
async def get(run_id:str,request:Request):return await run_in_threadpool(request.app.state.sd_store.get_run,await require_session(request),run_id)
@router.patch("/runs/{run_id}/draft")
async def edit(run_id:str,body:DraftEdit,request:Request):
    session=await require_session(request,True);state=request.app.state;store=state.sd_store
    async with state.sd_mutation_lock:
        run=await run_in_threadpool(store.get_run,session,run_id)
        if run.state not in ('awaiting_confirmation','needs_clarification') or not run.draft or run.draft.version!=body.expected_version:raise HTTPException(409,"version_conflict")
        draft=validate_tasks(run.document,body.items,date.fromisoformat(run.reference_date),run.timezone);draft.run_id=run_id;draft.version=body.expected_version+1;run.draft=draft
        run.preview=preview_from_draft(ToolContext(session,run_id,set(),RunBudget()),draft)
        await run_in_threadpool(store.save_preview,run.preview)
        run.state="awaiting_confirmation" if run.preview.events else "needs_clarification"
        await run_in_threadpool(store.save_run,run);return run
@router.post("/runs/{run_id}/approval")
async def approval(run_id:str,body:Approve,request:Request):
    session=await require_session(request,True);state=request.app.state;store=state.sd_store
    async with state.sd_mutation_lock:
        run=await run_in_threadpool(store.get_run,session,run_id)
        if run.state!="awaiting_confirmation" or not run.preview or run.preview.preview_id!=body.preview_id:raise HTTPException(409,"preview_changed")
        return await run_in_threadpool(store.issue_approval,session,run_id,body.preview_id,datetime.now(timezone.utc))
@router.post("/runs/{run_id}/commit")
async def commit(run_id:str,body:Commit,request:Request):
    session=await require_session(request,True);state=request.app.state;store=state.sd_store
    async with state.sd_mutation_lock:
        run=await run_in_threadpool(store.get_run,session,run_id)
        result=await run_in_threadpool(store.commit_calendar,session,run_id,body.preview_id,body.token,datetime.now(timezone.utc))
        run.state="completed";await run_in_threadpool(store.save_run,run);return result
@router.get("/calendar")
async def calendar(request:Request):return await run_in_threadpool(request.app.state.sd_store.list_calendar_events,await require_session(request))
