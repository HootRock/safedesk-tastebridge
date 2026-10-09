from datetime import datetime,timezone
from hackathon_core.database import Database
from .models import GroupSession,RecommendationRun

class GroupError(ValueError): pass
class TasteBridgeStore:
    def __init__(self,path,*,database=None):
        self.path=path;self.database=database if database is not None else Database(path)
        with self.connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS tb_groups(session TEXT PRIMARY KEY,json TEXT,updated REAL);
            CREATE TABLE IF NOT EXISTS tb_choices(session TEXT,id TEXT,json TEXT,created REAL,PRIMARY KEY(session,id));
            CREATE TABLE IF NOT EXISTS tb_runs(id TEXT PRIMARY KEY,session TEXT,json TEXT,created REAL);
            CREATE TABLE IF NOT EXISTS tb_attempts(session TEXT,created REAL);
            """)
    def connect(self):
        return self.database.connect()
    def remember_choices(self,session_id,choices):
        with self.connect() as db:
            for choice in choices: db.execute("INSERT OR REPLACE INTO tb_choices VALUES(?,?,?,?)",(session_id,choice.entity_id,choice.model_dump_json(),datetime.now(timezone.utc).timestamp()))
            db.execute("DELETE FROM tb_choices WHERE created<=?",(datetime.now(timezone.utc).timestamp()-86400,))
    def _validate(self,db,session,members):
        if not 2<=len(members)<=4 or len({m.member_id for m in members})!=len(members): raise GroupError("invalid_group")
        for member in members:
            member.entity_ids=list(dict.fromkeys(member.entity_ids))
            if not 1<=len(member.entity_ids)<=5: raise GroupError("invalid_group")
            for entity in member.entity_ids:
                if not db.execute("SELECT 1 FROM tb_choices WHERE session=? AND id=? AND created>?",(session,entity,datetime.now(timezone.utc).timestamp()-86400)).fetchone(): raise GroupError("unconfirmed_entity")
    def _get(self,db,session):
        row=db.execute("SELECT * FROM tb_groups WHERE session=?",(session,)).fetchone()
        if not row or row["updated"]<=datetime.now(timezone.utc).timestamp()-86400: raise GroupError("group_unavailable")
        return GroupSession.model_validate_json(row["json"])
    def _save(self,db,group): db.execute("INSERT OR REPLACE INTO tb_groups VALUES(?,?,?)",(group.session_id,group.model_dump_json(),group.updated_at.timestamp()))
    def create_group(self,session_id,members,now):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE");self._validate(db,session_id,members)
            if db.execute("SELECT 1 FROM tb_groups WHERE session=?",(session_id,)).fetchone(): raise GroupError("group_exists")
            group=GroupSession(session_id=session_id,version=1,members=members,excluded_ids=[],feedback_rounds=0,updated_at=now);self._save(db,group);return group
    def get_group(self,session_id):
        with self.connect() as db:return self._get(db,session_id)
    def claim_attempt(self,session,now):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM tb_attempts WHERE created<=?",(now.timestamp()-600,))
            if db.execute("SELECT COUNT(*) FROM tb_attempts WHERE session=?",(session,)).fetchone()[0]>=4:raise GroupError("session_rate_limit")
            db.execute("INSERT INTO tb_attempts VALUES(?,?)",(session,now.timestamp()))
    def update_group(self,session_id,expected_version,members,now):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE");group=self._get(db,session_id)
            if group.version!=expected_version: raise GroupError("version_conflict")
            self._validate(db,session_id,members);group.members=members;group.version+=1;group.updated_at=now;self._save(db,group);return group
    def publish_run(self,run,expected_version,excluded,now):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE");group=self._get(db,run.session_id)
            if group.version!=expected_version: raise GroupError("version_conflict")
            if excluded:
                if group.feedback_rounds>=3: raise GroupError("feedback_limit")
                group.excluded_ids=list(dict.fromkeys(group.excluded_ids+excluded));group.feedback_rounds+=1;group.version+=1;group.updated_at=now;self._save(db,group)
            run.group_version=group.version
            db.execute("INSERT INTO tb_runs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,created=excluded.created WHERE tb_runs.session=excluded.session",(run.run_id,run.session_id,run.model_dump_json(),now.timestamp()))
    def save_run(self,run):
        with self.connect() as db:db.execute("INSERT OR REPLACE INTO tb_runs VALUES(?,?,?,?)",(run.run_id,run.session_id,run.model_dump_json(),datetime.now(timezone.utc).timestamp()))
    def get_run(self,session_id,run_id):
        with self.connect() as db:row=db.execute("SELECT * FROM tb_runs WHERE id=? AND session=?",(run_id,session_id)).fetchone()
        if not row or row["created"]<=datetime.now(timezone.utc).timestamp()-86400:raise GroupError("run_unavailable")
        return RecommendationRun.model_validate_json(row["json"])
    def latest_run(self,session):
        with self.connect() as db:row=db.execute("SELECT json FROM tb_runs WHERE session=? AND created>? AND json_extract(json,'$.status')='completed' ORDER BY created DESC LIMIT 1",(session,datetime.now(timezone.utc).timestamp()-86400)).fetchone()
        return RecommendationRun.model_validate_json(row[0]) if row else None
    def purge_expired(self,now):
        count=0
        with self.connect() as db:
            for table,col in (("tb_groups","updated"),("tb_choices","created"),("tb_runs","created")):
                count+=db.execute(f"DELETE FROM {table} WHERE {col}<=?",(now.timestamp()-86400,)).rowcount
        return count
