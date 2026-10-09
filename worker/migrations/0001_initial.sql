PRAGMA foreign_keys = ON;
CREATE TABLE sessions(id TEXT PRIMARY KEY, token TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE TABLE choices(session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, entity_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session_id, entity_id));
CREATE TABLE groups(session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, version INTEGER NOT NULL DEFAULT 1, members TEXT NOT NULL, excluded TEXT NOT NULL DEFAULT '[]', feedback_rounds INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, published_run TEXT);
CREATE TABLE runs(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, group_version INTEGER NOT NULL, data TEXT NOT NULL, claim_group TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, lease_until INTEGER NOT NULL, released INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0, pending_exclusions TEXT NOT NULL DEFAULT '[]', published_at TEXT);
CREATE INDEX runs_attempts ON runs(session_id, created);
CREATE INDEX runs_leases ON runs(released, lease_until);
CREATE INDEX runs_expiry ON runs(expires);
CREATE TABLE quotas(kind TEXT NOT NULL, day INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(kind,day));
CREATE TABLE qloo_slots(slot INTEGER PRIMARY KEY CHECK(slot IN (1,2)), lease TEXT, expires INTEGER NOT NULL DEFAULT 0, day INTEGER NOT NULL DEFAULT 0);
INSERT INTO qloo_slots(slot) VALUES (1),(2);
CREATE TABLE cache(key TEXT PRIMARY KEY, data TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX cache_expiry ON cache(expires);
CREATE TRIGGER charge_qloo AFTER UPDATE OF lease ON qloo_slots WHEN NEW.lease IS NOT NULL AND NEW.lease IS NOT OLD.lease BEGIN
  INSERT INTO quotas(kind,day,count) VALUES ('qloo',NEW.day,1) ON CONFLICT(kind,day) DO UPDATE SET count=count+1;
  DELETE FROM quotas WHERE day < NEW.day-1;
END;
CREATE TRIGGER publish_group AFTER UPDATE OF published ON runs WHEN NEW.published=1 AND OLD.published=0 BEGIN
  UPDATE groups SET excluded=CASE WHEN json_array_length(NEW.pending_exclusions)=0 THEN excluded ELSE (SELECT json_group_array(value) FROM (SELECT value FROM json_each(groups.excluded) UNION ALL SELECT value FROM json_each(NEW.pending_exclusions))) END,
    version=version+CASE WHEN json_array_length(NEW.pending_exclusions)>0 THEN 1 ELSE 0 END,
    feedback_rounds=feedback_rounds+CASE WHEN json_array_length(NEW.pending_exclusions)>0 THEN 1 ELSE 0 END,
    updated_at=NEW.published_at, published_run=NEW.id WHERE session_id=NEW.session_id;
END;
