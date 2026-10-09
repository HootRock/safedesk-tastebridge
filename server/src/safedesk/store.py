import hashlib,json,secrets,uuid
from datetime import datetime,timezone,timedelta
from hackathon_core.database import Database
from .models import CalendarPreview,CalendarEvent,ApprovalReceipt,CommitResult,RunSnapshot

class ApprovalError(ValueError): pass
def content_hash(preview):
    payload={"session_id":preview.session_id,"run_id":preview.run_id,"version":preview.version,"events":[e.model_dump(mode="json") for e in preview.events]}
    return hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False,separators=(",",":")).encode()).hexdigest()

class SafeDeskStore:
    def __init__(self,path:str,*,database=None):
        self.path=path;self.database=database if database is not None else Database(path)
        with self.connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS sd_previews(id TEXT PRIMARY KEY, session TEXT, run TEXT, json TEXT, hash TEXT, updated REAL);
            CREATE UNIQUE INDEX IF NOT EXISTS sd_one_preview ON sd_previews(session,run);
            CREATE TABLE IF NOT EXISTS sd_approvals(token_hash TEXT PRIMARY KEY, session TEXT, run TEXT, preview TEXT, hash TEXT, expires REAL, result TEXT);
            CREATE TABLE IF NOT EXISTS sd_events(id TEXT PRIMARY KEY, session TEXT, json TEXT, created REAL);
            CREATE TABLE IF NOT EXISTS sd_runs(id TEXT PRIMARY KEY, session TEXT, json TEXT, updated REAL);
            """)
    def connect(self):
        return self.database.connect()
    def save_preview(self,preview:CalendarPreview,now:datetime|None=None):
        now=now or datetime.now(timezone.utc); preview.content_hash=content_hash(preview)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old=db.execute("SELECT * FROM sd_previews WHERE session=? AND run=?",(preview.session_id,preview.run_id)).fetchone()
            if old and old["hash"]!=preview.content_hash:
                db.execute("DELETE FROM sd_approvals WHERE session=? AND run=?",(preview.session_id,preview.run_id))
                db.execute("DELETE FROM sd_previews WHERE id=?",(old["id"],))
            db.execute("INSERT OR REPLACE INTO sd_previews VALUES(?,?,?,?,?,?)",(preview.preview_id,preview.session_id,preview.run_id,preview.model_dump_json(),preview.content_hash,now.timestamp()))
    def _preview(self,db,session,run,preview,now):
        row=db.execute("SELECT * FROM sd_previews WHERE id=? AND session=? AND run=?",(preview,session,run)).fetchone()
        if not row or row["updated"]<=now.timestamp()-86400: raise ApprovalError("preview_unavailable")
        return row
    def issue_approval(self,session_id,run_id,preview_id,now):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE");row=self._preview(db,session_id,run_id,preview_id,now)
            if not CalendarPreview.model_validate_json(row["json"]).events: raise ApprovalError("empty_preview")
            # More than one confirmation cannot create more than one set of events.
            previous=db.execute("SELECT result FROM sd_approvals WHERE session=? AND run=? AND result IS NOT NULL",(session_id,run_id)).fetchone()
            if previous: raise ApprovalError("already_committed")
            db.execute("DELETE FROM sd_approvals WHERE session=? AND run=?",(session_id,run_id))
            token=secrets.token_urlsafe(32);expiry=now+timedelta(minutes=10)
            db.execute("INSERT INTO sd_approvals VALUES(?,?,?,?,?,?,NULL)",(hashlib.sha256(token.encode()).hexdigest(),session_id,run_id,preview_id,row["hash"],expiry.timestamp()))
            return ApprovalReceipt(token=token,expires_at=expiry)
    def commit_calendar(self,session_id,run_id,preview_id,token,now):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE");row=self._preview(db,session_id,run_id,preview_id,now)
            receipt=db.execute("SELECT * FROM sd_approvals WHERE token_hash=? AND session=? AND run=? AND preview=?",(hashlib.sha256(token.encode()).hexdigest(),session_id,run_id,preview_id)).fetchone()
            if not receipt: raise ApprovalError("approval_required")
            if now.timestamp()>=receipt["expires"]: raise ApprovalError("approval_expired")
            preview=CalendarPreview.model_validate_json(row["json"])
            if receipt["hash"]!=content_hash(preview): raise ApprovalError("preview_changed")
            if receipt["result"]: return CommitResult.model_validate_json(receipt["result"])
            result=CommitResult(commit_id=uuid.uuid4().hex,event_ids=[e.event_id for e in preview.events])
            for event in preview.events: db.execute("INSERT INTO sd_events VALUES(?,?,?,?)",(event.event_id,session_id,event.model_dump_json(),now.timestamp()))
            db.execute("UPDATE sd_approvals SET result=? WHERE token_hash=?",(result.model_dump_json(),receipt["token_hash"]))
            return result
    def list_calendar_events(self,session_id):
        with self.connect() as db: return [CalendarEvent.model_validate_json(r[0]) for r in db.execute("SELECT json FROM sd_events WHERE session=?",(session_id,))]
    def save_run(self,snapshot:RunSnapshot):
        with self.connect() as db: db.execute("INSERT OR REPLACE INTO sd_runs VALUES(?,?,?,?)",(snapshot.run_id,snapshot.document.session_id,snapshot.model_dump_json(),datetime.now(timezone.utc).timestamp()))
    def get_run(self,session_id,run_id):
        with self.connect() as db: row=db.execute("SELECT * FROM sd_runs WHERE id=? AND session=?",(run_id,session_id)).fetchone()
        if not row or row["updated"]<=datetime.now(timezone.utc).timestamp()-86400: raise ApprovalError("run_unavailable")
        return RunSnapshot.model_validate_json(row["json"])
    def purge_expired(self,now):
        cutoff=now.timestamp()-86400; count=0
        with self.connect() as db:
            for table,column in (("sd_runs","updated"),("sd_previews","updated"),("sd_events","created")):
                count+=db.execute(f"DELETE FROM {table} WHERE {column}<=?",(cutoff,)).rowcount
            db.execute("DELETE FROM sd_approvals WHERE preview NOT IN (SELECT id FROM sd_previews)")
        return count
