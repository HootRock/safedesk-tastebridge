import asyncio,re
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime,timezone
import httpx
from fastapi import FastAPI,Request,Response
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.concurrency import run_in_threadpool
from hackathon_core.config import Settings
from hackathon_core.codex import CodexGateway
from hackathon_core.hosted import GroqGateway,GROQ_MODEL
from hackathon_core.database import Database,DatabaseError
from hackathon_core.quota import DailyQuota
from hackathon_core.sessions import Sessions
from safedesk.store import SafeDeskStore,ApprovalError
from safedesk.documents import DocumentValidationError
from safedesk.routes import router as sd_router
from tastebridge.store import TasteBridgeStore,GroupError
from tastebridge.qloo import QlooClient,QlooError
from tastebridge.routes import router as tb_router

def create_app(settings: Settings) -> FastAPI:
    if settings.model_provider not in ("codex","groq"):
        raise ValueError("invalid_model_provider")
    if settings.public_hosting:
        if settings.model_provider!="groq":raise ValueError("public_provider_required")
        if not settings.allowed_hosts or any(not re.fullmatch(r"[A-Za-z0-9.-]+",host) for host in settings.allowed_hosts):
            raise ValueError("public_host_required")
    Path(settings.data_dir).mkdir(parents=True,exist_ok=True)
    path=str(Path(settings.data_dir)/"app.db")
    database=Database(path,remote_url=settings.remote_db_url,auth_token=settings.remote_db_auth_token,public_hosting=settings.public_hosting)
    @asynccontextmanager
    async def lifespan(app):
        async def cleanup():
            while True:
                try:
                    now=datetime.now(timezone.utc)
                    await run_in_threadpool(app.state.sd_store.purge_expired,now)
                    await run_in_threadpool(app.state.tb_store.purge_expired,now)
                except DatabaseError:
                    # A temporary storage outage is retried on the next cleanup;
                    # request handlers still return an explicit storage failure.
                    pass
                await asyncio.sleep(3600)
        task=asyncio.create_task(cleanup())
        try:yield
        finally:
            task.cancel()
            try:await task
            except asyncio.CancelledError:pass
            await app.state.http.aclose()
            if isinstance(app.state.model,GroqGateway):await app.state.model.aclose()
    app=FastAPI(title="SafeDesk + TasteBridge",lifespan=lifespan)
    app.state.settings=settings
    app.state.sd_store=SafeDeskStore(path,database=database);app.state.tb_store=TasteBridgeStore(path,database=database)
    app.state.sessions=Sessions(path,database=database);app.state.active=set()
    app.state.sd_mutation_lock=asyncio.Lock()
    app.state.quota=DailyQuota(database)
    app.state.model=GroqGateway(settings,quota=app.state.quota) if settings.model_provider=="groq" else CodexGateway(settings)
    app.state.http=httpx.AsyncClient(base_url=settings.qloo_base_url)
    app.state.qloo=QlooClient(app.state.http,settings.qloo_api_key,daily_limit=min(settings.daily_qloo_limit,500) if settings.public_hosting else 1000,quota=app.state.quota)
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=list(settings.allowed_hosts) if settings.public_hosting else ["127.0.0.1","localhost","testserver"])
    async def storage_error(request,exc):
        return JSONResponse(status_code=503,content={"detail":"storage_unavailable"})
    app.add_exception_handler(DatabaseError,storage_error)
    async def known_error(request,exc):
        code=str(exc);status=404 if code.endswith("unavailable") else 409 if "conflict" in code or "changed" in code or "committed" in code else 429 if "limit" in code else 400
        return JSONResponse(status_code=status,content={"detail":code})
    for cls in (ApprovalError,DocumentValidationError,GroupError,QlooError):app.add_exception_handler(cls,known_error)
    @app.get("/api/session")
    def session(request:Request,response:Response):
        current=request.cookies.get("hackathon_session","");token=app.state.sessions.read(current)
        if not token:
            current,token=app.state.sessions.create();response.set_cookie("hackathon_session",current,httponly=True,secure=settings.public_hosting,samesite="lax",max_age=86400)
        return {"action_token":token,"mode":settings.mode,"model_enabled":model_enabled(),"model_name":settings.groq_model_name if settings.model_provider=="groq" else settings.model_name,"model":settings.model_provider,"public_hosting":settings.public_hosting,"qloo_configured":bool(settings.qloo_api_key)}
    def model_enabled():
        return bool(settings.groq_api_key and settings.groq_model_name==GROQ_MODEL and settings.daily_model_limit>0) if settings.model_provider=="groq" else settings.codex_enabled and not settings.public_hosting
    @app.get("/api/health")
    async def health(): return {"mode":settings.mode,"model":settings.model_provider,"model_enabled":model_enabled(),"public_hosting":settings.public_hosting,"qloo_configured":bool(settings.qloo_api_key),"additional_model_budget":0}
    app.include_router(sd_router);app.include_router(tb_router)
    web_dist=Path(__file__).resolve().parents[3]/"web"/"dist"
    if (web_dist/"assets").is_dir():app.mount("/assets",StaticFiles(directory=web_dist/"assets"),name="assets")
    @app.get("/{page:path}")
    def frontend(page:str):
        if page not in ("","safedesk","tastebridge"):return JSONResponse(status_code=404,content={"detail":"not_found"})
        if not (web_dist/"index.html").is_file():return JSONResponse(status_code=503,content={"detail":"frontend_not_built"})
        return FileResponse(web_dist/"index.html")
    return app

app=create_app(Settings.from_env())
