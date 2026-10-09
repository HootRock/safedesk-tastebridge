import secrets,time
from fastapi import Request,HTTPException
from starlette.concurrency import run_in_threadpool
from .database import Database

class Sessions:
    def __init__(self,path,*,database=None):
        self.path=path
        self.database=database if database is not None else Database(path)
        with self.database.connect() as db:db.execute("CREATE TABLE IF NOT EXISTS app_sessions(id TEXT PRIMARY KEY,token TEXT,created REAL)")
    def read(self,session):
        with self.database.connect() as db: row=db.execute("SELECT token FROM app_sessions WHERE id=? AND created>?",(session,time.time()-86400)).fetchone()
        return row[0] if row else None
    def create(self):
        session,token=secrets.token_urlsafe(32),secrets.token_urlsafe(32)
        with self.database.connect() as db:
            db.execute("DELETE FROM app_sessions WHERE created<=?",(time.time()-86400,));db.execute("INSERT INTO app_sessions VALUES(?,?,?)",(session,token,time.time()))
        return session,token

async def require_session(request:Request,write=False):
    session=request.cookies.get("hackathon_session","");token=await run_in_threadpool(request.app.state.sessions.read,session)
    if not token:raise HTTPException(401,"session_required")
    if write:
        supplied=request.headers.get("X-Action-Token","")
        if not secrets.compare_digest(token,supplied):raise HTTPException(403,"action_token_required")
        origin=request.headers.get("Origin")
        # Hosted traffic terminates TLS at the provider's proxy. TrustedHost
        # middleware validates the host, so no forwarded-header trust is needed.
        expected_origin=("https://"+request.headers.get("host","")) if request.app.state.settings.public_hosting else str(request.base_url).rstrip("/")
        if origin and origin!=expected_origin:raise HTTPException(403,"wrong_origin")
    return session
