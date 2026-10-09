from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import sqlite3

import pytest
from hackathon_core.database import Database, DatabaseError
from hackathon_core.quota import DailyQuota


def remote_database(tmp_path, connector=None):
    path = tmp_path / "remote-fixture.db"
    if connector is None:
        connector = lambda **kwargs: sqlite3.connect(path, timeout=10)
    return Database(
        str(tmp_path / "must-not-exist" / "fallback.db"),
        remote_url="libsql://offline-fixture.turso.io",
        auth_token="test-only-token",
        public_hosting=True,
        remote_connector=connector,
    )


def test_remote_connection_uses_only_validated_primary_url_and_token(tmp_path):
    def connector(**kwargs):
        assert kwargs == {"database":"libsql://offline-fixture.turso.io", "auth_token":"test-only-token", "timeout":10}
        return sqlite3.connect(tmp_path / "remote-fixture.db")
    with remote_database(tmp_path, connector).connect() as db:
        assert db.execute("SELECT 1 AS value").fetchone()["value"] == 1


def test_default_remote_transport_executes_http_without_optional_sdk(tmp_path, monkeypatch):
    import httpx
    from hrana_fixture import SQLiteHrana
    peer=SQLiteHrana(str(tmp_path/"peer.db"))
    client=httpx.Client(transport=httpx.MockTransport(peer))
    monkeypatch.setattr("hackathon_core.libsql_http.httpx.Client",lambda **kwargs:client)
    database = Database(str(tmp_path / "fallback.db"), remote_url="https://fixture.turso.io", auth_token="test-token")
    with database.connect() as db:
        assert db.execute("SELECT 42 AS value").fetchone()["value"]==42
    assert not (tmp_path / "fallback.db").exists()


def test_local_connection_preserves_sqlite_rows_and_rollback(tmp_path):
    database = Database(str(tmp_path / "nested" / "local.db"))
    with database.connect() as db:
        assert isinstance(db, sqlite3.Connection)
        db.execute("CREATE TABLE records(id TEXT PRIMARY KEY, json TEXT)")
        db.execute("INSERT INTO records VALUES (?, ?)", ("saved", '{"value":42}'))
    with pytest.raises(RuntimeError), database.connect() as db:
        db.execute("INSERT INTO records VALUES (?, ?)", ("lost", "{}"))
        raise RuntimeError("cancel")
    with database.connect() as db:
        row = db.execute("SELECT id, json_extract(json, '$.value') AS value FROM records").fetchone()
        assert row[0] == row["id"] == "saved"
        assert row["value"] == 42
        assert db.execute("SELECT COUNT(*) FROM records").fetchone()[0] == 1


@pytest.mark.parametrize("url,token", [
    ("", ""), ("", "test-token"), ("libsql://fixture.turso.io", ""),
    ("file:local.db", "test-token"), ("http://fixture.turso.io", "test-token"),
    ("https://evil.test", "test-token"), ("https://fixture.turso.io.evil.test", "test-token"),
    ("libsql://fixture.turso.io/path", "test-token"),
    ("libsql://fixture.turso.io?token=secret", "test-token"),
    ("libsql://user:secret@fixture.turso.io", "test-token"),
    ("libsql://fixture.turso.io:1234", "test-token"),
    ("libsql://fixture.turso.io", " token with spaces "),
])
def test_public_database_rejects_invalid_config_without_local_fallback(tmp_path, url, token):
    path = tmp_path / "not-created" / "local.db"
    with pytest.raises(DatabaseError, match="invalid_remote_config") as error:
        Database(str(path), remote_url=url, auth_token=token, public_hosting=True)
    assert "secret" not in str(error.value)
    assert not path.parent.exists()


def test_remote_connect_failure_is_sanitized_and_cannot_create_local_db(tmp_path):
    def unavailable(**kwargs):
        raise RuntimeError("provider URL contains secret-token")
    database = remote_database(tmp_path, unavailable)
    with pytest.raises(DatabaseError, match="storage_unavailable") as error:
        database.connect()
    assert "secret-token" not in str(error.value)
    assert not (tmp_path / "must-not-exist").exists()


def test_remote_adapter_preserves_rows_iteration_json_commit_and_rollback(tmp_path):
    database = remote_database(tmp_path)
    with database.connect() as db:
        db.executescript("CREATE TABLE records(id TEXT PRIMARY KEY, json TEXT);")
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT INTO records VALUES (?, ?)", ("saved", '{"value":42}'))
    with pytest.raises(RuntimeError), database.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT INTO records VALUES (?, ?)", ("lost", "{}"))
        raise RuntimeError("cancel")
    with database.connect() as db:
        rows = list(db.execute("SELECT id, json_extract(json, '$.value') AS value FROM records"))
        assert len(rows) == 1
        assert rows[0][0] == rows[0]["id"] == "saved"
        assert rows[0]["value"] == 42
        assert db.execute("DELETE FROM records").rowcount == 1


def test_remote_schema_errors_propagate(tmp_path):
    database = remote_database(tmp_path)
    with pytest.raises(DatabaseError, match="storage_unavailable"):
        with database.connect() as db:
            db.executescript("INVALID SQL;")


@pytest.mark.parametrize("remote", [False, True])
def test_quota_survives_reconstruction_and_separates_day_and_service(tmp_path, remote):
    database = remote_database(tmp_path) if remote else Database(str(tmp_path / "quota.db"))
    assert DailyQuota(database).claim("qloo", "2026-10-09", 2)
    assert DailyQuota(database).claim("qloo", "2026-10-09", 2)
    assert not DailyQuota(database).claim("qloo", "2026-10-09", 2)
    assert DailyQuota(database).claim("groq", "2026-10-09", 1)
    assert not DailyQuota(database).claim("groq", "2026-10-09", 1)
    assert DailyQuota(database).claim("qloo", "2026-10-10", 2)


@pytest.mark.parametrize("backend", ["sqlite", "adapter"])
def test_quota_caps_concurrent_clients_atomically(tmp_path, backend):
    database = remote_database(tmp_path) if backend == "adapter" else Database(str(tmp_path / "quota.db"))
    clients = [DailyQuota(database) for _ in range(12)]
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(lambda client: client.claim("qloo", "2026-10-09", 5), clients))
    assert sum(results) == 5
    assert not DailyQuota(database).claim("qloo", "2026-10-09", 5)


def test_zero_quota_does_not_consume_future_capacity(tmp_path):
    limit = DailyQuota(Database(str(tmp_path / "quota.db")))
    assert not limit.claim("qloo", "2026-10-09", 0)
    assert limit.claim("qloo", "2026-10-09", 1)


@pytest.mark.parametrize("backend", ["adapter", "official", "http"])
def test_all_stores_use_injected_shared_database_and_keep_session_ttl(tmp_path, monkeypatch, backend):
    from hackathon_core.sessions import Sessions
    from safedesk.store import SafeDeskStore
    from safedesk.models import CalendarPreview, CalendarEvent, SourceRef
    from tastebridge.store import TasteBridgeStore, GroupError
    from tastebridge.models import EntityChoice, MemberPreference

    if backend == "official":
        driver = pytest.importorskip("libsql")
        database = remote_database(tmp_path, lambda **kwargs: driver.connect(str(tmp_path / "official.db"), timeout=10))
    elif backend=="http":
        from hrana_fixture import http_database
        database,_=http_database(tmp_path)
    else:
        database = remote_database(tmp_path)
    path = str(tmp_path / "must-not-exist" / "fallback.db")
    sessions = Sessions(path, database=database)
    session, token = sessions.create()
    assert Sessions(path, database=database).read(session) == token
    now = datetime.now(timezone.utc)
    desk = SafeDeskStore(path, database=database)
    preview = CalendarPreview(preview_id="p", run_id="r", session_id=session, version=1, events=[
        CalendarEvent(event_id="e", title="Review", start_at="2026-10-10T10:00:00+08:00",
                      end_at="2026-10-10T11:00:00+08:00",
                      source=SourceRef(document_id="d", paragraph_id="p1", quote="Review"))])
    desk.save_preview(preview, now)
    receipt = desk.issue_approval(session, "r", "p", now)
    result = desk.commit_calendar(session, "r", "p", receipt.token, now)
    reopened = SafeDeskStore(path, database=database)
    assert reopened.commit_calendar(session, "r", "p", receipt.token, now) == result
    assert len(reopened.list_calendar_events(session)) == 1
    tastes = TasteBridgeStore(path, database=database)
    tastes.remember_choices(session, [EntityChoice(entity_id="seed", name="Fixture", kind="movie")])
    members = [MemberPreference(member_id=str(i), nickname=f"Person {i}", entity_ids=["seed"]) for i in range(2)]
    tastes.create_group(session, members, now)
    assert TasteBridgeStore(path, database=database).get_group(session).version == 1
    with pytest.raises(GroupError, match="version_conflict"):
        tastes.update_group(session, 0, members, now)
    assert tastes.get_group(session).version == 1
    from tastebridge.models import RecommendationRun
    tastes.save_run(RecommendationRun(run_id="completed", session_id=session, group_version=1, status="completed"))
    tastes.save_run(RecommendationRun(run_id="failed", session_id=session, group_version=1, status="failed"))
    assert tastes.latest_run(session).run_id == "completed"
    assert tastes.get_run(session, "completed").status == "completed"
    for _ in range(4):
        tastes.claim_attempt(session, now)
    with pytest.raises(GroupError, match="session_rate_limit"):
        TasteBridgeStore(path, database=database).claim_attempt(session, now)
    monkeypatch.setattr("hackathon_core.sessions.time.time", lambda: now.timestamp() + 86401)
    assert sessions.read(session) is None
    assert desk.purge_expired(now + timedelta(days=1, seconds=1)) > 0
    assert desk.list_calendar_events(session) == []
    assert tastes.purge_expired(now + timedelta(days=1, seconds=1)) > 0
    with pytest.raises(GroupError, match="group_unavailable"):
        tastes.get_group(session)
    assert not (tmp_path / "must-not-exist").exists()


@pytest.mark.parametrize("backend", ["adapter", "official", "http"])
def test_failed_calendar_commit_rolls_back_partial_events_and_receipt(tmp_path, backend):
    from safedesk.store import SafeDeskStore
    from safedesk.models import CalendarPreview, CalendarEvent, SourceRef
    if backend == "official":
        driver = pytest.importorskip("libsql")
        database = remote_database(tmp_path, lambda **kwargs: driver.connect(str(tmp_path / "official.db"), timeout=10))
    elif backend=="http":
        from hrana_fixture import http_database
        database,_=http_database(tmp_path)
    else:
        database = remote_database(tmp_path)
    store = SafeDeskStore("unused.db", database=database)
    event = CalendarEvent(event_id="collision", title="Review", start_at="2026-10-10T10:00:00+08:00",
                          end_at="2026-10-10T11:00:00+08:00", source=SourceRef(document_id="d", paragraph_id="p1", quote="Review"))
    preview = CalendarPreview(preview_id="p", run_id="r", session_id="s", version=1, events=[event, event.model_copy(deep=True)])
    now = datetime.now(timezone.utc)
    store.save_preview(preview, now)
    receipt = store.issue_approval("s", "r", "p", now)
    with pytest.raises(DatabaseError, match="storage_unavailable"):
        store.commit_calendar("s", "r", "p", receipt.token, now)
    assert store.list_calendar_events("s") == []
    with database.connect() as db:
        assert db.execute("SELECT result FROM sd_approvals").fetchone()[0] is None


def test_real_official_driver_adapter_offline(tmp_path):
    libsql = pytest.importorskip("libsql")
    path = str(tmp_path / "official-driver.db")
    database = remote_database(tmp_path, lambda **kwargs: libsql.connect(path, timeout=10))
    with database.connect() as db:
        db.executescript("CREATE TABLE records(id TEXT PRIMARY KEY, json TEXT);")
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT INTO records VALUES (?, ?)", ("saved", '{"value":42}'))
    with pytest.raises(RuntimeError), database.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT INTO records VALUES (?, ?)", ("lost", "{}"))
        raise RuntimeError("cancel")
    with database.connect() as db:
        row = db.execute("SELECT id, json_extract(json, '$.value') AS value FROM records").fetchone()
        assert row[0] == row["id"] == "saved"
        assert row["value"] == 42
        assert len(list(db.execute("SELECT id FROM records"))) == 1
        assert db.execute("DELETE FROM records").rowcount == 1
    assert DailyQuota(database).claim("qloo", "2026-10-09", 1)
    assert not DailyQuota(database).claim("qloo", "2026-10-09", 1)
