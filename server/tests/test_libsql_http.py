from concurrent.futures import ThreadPoolExecutor
import importlib
import json
import socketserver
import threading
import time

import httpx
import pytest

from hackathon_core.database import Database,DatabaseError
from hackathon_core.quota import DailyQuota
from hrana_fixture import SQLiteHrana


def connection(**kwargs):
    assert importlib.util.find_spec("hackathon_core.libsql_http"), "bounded HTTP storage transport missing"
    return importlib.import_module("hackathon_core.libsql_http").HttpConnection(**kwargs)


def http_database(tmp_path,peer=None):
    peer=peer or SQLiteHrana(str(tmp_path/"peer.db"))
    def connector(**kwargs):
        return connection(**kwargs,client=httpx.Client(transport=httpx.MockTransport(peer)))
    return Database("unused.db",remote_url="libsql://fixture.turso.io",auth_token="test-token",public_hosting=True,remote_connector=connector),peer


def test_http_protocol_transactions_rows_and_rollback(tmp_path):
    database,peer=http_database(tmp_path)
    with database.connect() as db:
        db.executescript("CREATE TABLE records(id TEXT PRIMARY KEY,json TEXT);")
        db.execute("INSERT INTO records VALUES(?,?)",("saved",'{"value":42}'))
    with pytest.raises(RuntimeError),database.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT INTO records VALUES(?,?)",("lost","{}"))
        raise RuntimeError("cancel")
    with database.connect() as db:
        row=db.execute("SELECT id,json_extract(json,'$.value') AS value FROM records").fetchone()
        assert row[0]==row["id"]=="saved" and row["value"]==42
        assert len(list(db.execute("SELECT id FROM records")))==1
        assert db.execute("DELETE FROM records").rowcount==1
    assert not peer.streams


def test_http_atomic_quota_persists_and_caps_parallel_claims(tmp_path):
    database,peer=http_database(tmp_path)
    clients=[DailyQuota(database) for _ in range(12)]
    with ThreadPoolExecutor(max_workers=12) as pool:
        allowed=list(pool.map(lambda q:q.claim("groq","2026-10-09",5),clients))
    assert sum(allowed)==5
    assert not DailyQuota(database).claim("groq","2026-10-09",5)
    assert DailyQuota(database).claim("qloo","2026-10-09",1)
    assert not peer.streams


def test_http_timeout_is_configured_on_every_request_and_not_retried():
    calls=[]
    def stalled(request):
        calls.append(request)
        assert request.extensions["timeout"]=={"connect":3.0,"read":10.0,"write":10.0,"pool":3.0}
        raise httpx.ReadTimeout("provider includes test-token",request=request)
    client=httpx.Client(transport=httpx.MockTransport(stalled))
    raw=connection(database="libsql://fixture.turso.io",auth_token="test-token",client=client)
    with pytest.raises(DatabaseError,match="^storage_unavailable$") as error:
        raw.execute("SELECT 1")
    raw.close();client.close()
    assert len(calls)==1 and "test-token" not in str(error.value)


@pytest.mark.parametrize("response",[
    httpx.Response(302,headers={"Location":"https://evil.test"}),
    *[httpx.Response(200,json={"baton":"secret-baton","base_url":base,"results":[{"type":"ok","response":{"type":"execute","result":{"cols":[],"rows":[],"affected_row_count":0,"last_insert_rowid":None}}}]})
      for base in ("https://other.turso.io","http://fixture.turso.io","https://fixture.turso.io?auth=secret")],
    httpx.Response(200,json={"baton":"secret-baton","base_url":None,"results":[{"type":"error","error":{"message":"test-token"}}]}),
])
def test_redirect_cross_origin_and_provider_errors_are_sanitized(response):
    calls=[]
    def handler(request):calls.append(request);return response
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        raw=connection(database="https://fixture.turso.io",auth_token="test-token",client=client)
        with pytest.raises(DatabaseError,match="^storage_unavailable$") as error:raw.execute("SELECT 1")
        assert "test-token" not in str(error.value) and "secret-baton" not in str(error.value)
    assert len(calls)==1 and calls[0].url.host=="fixture.turso.io"


def test_actual_socket_read_stall_times_out_offline():
    release=threading.Event()
    class StalledPeer(socketserver.BaseRequestHandler):
        def handle(self):self.request.recv(65536);release.wait(2)
    class LocalServer(socketserver.ThreadingTCPServer):daemon_threads=True
    server=LocalServer(("127.0.0.1",0),StalledPeer)
    serving=threading.Thread(target=server.serve_forever,daemon=True);serving.start()
    class LoopbackTransport(httpx.BaseTransport):
        def __init__(self):self.transport=httpx.HTTPTransport()
        def handle_request(self,request):
            assert request.url.host=="fixture.turso.io"
            mapped=httpx.Request(request.method,f"http://127.0.0.1:{server.server_address[1]}/v2/pipeline",headers=request.headers,content=request.content,extensions=request.extensions)
            return self.transport.handle_request(mapped)
        def close(self):self.transport.close()
    try:
        with httpx.Client(transport=LoopbackTransport()) as client:
            raw=connection(database="https://fixture.turso.io",auth_token="test-token",timeout=0.05,client=client)
            started=time.monotonic()
            with pytest.raises(DatabaseError,match="^storage_unavailable$"):raw.execute("SELECT 1")
            assert time.monotonic()-started<0.8
            raw.close()
    finally:
        release.set();server.shutdown();server.server_close();serving.join(2)


def test_lost_commit_response_keeps_confirmation_idempotent(tmp_path):
    from datetime import datetime,timezone
    from safedesk.store import SafeDeskStore
    from safedesk.models import CalendarPreview,CalendarEvent,SourceRef
    peer=SQLiteHrana(str(tmp_path/"peer.db"));drop_commit=[False]
    def handler(request):
        response=peer(request)
        operation=json.loads(request.content)["requests"][0]
        if drop_commit[0] and operation.get("stmt",{}).get("sql")=="COMMIT":
            drop_commit[0]=False
            raise httpx.ReadTimeout("response lost after server commit",request=request)
        return response
    database,_=http_database(tmp_path,handler)
    store=SafeDeskStore("unused.db",database=database)
    now=datetime.now(timezone.utc)
    preview=CalendarPreview(preview_id="p",run_id="r",session_id="s",version=1,events=[CalendarEvent(event_id="e",title="Review",start_at="2026-10-10T10:00:00+08:00",end_at="2026-10-10T11:00:00+08:00",source=SourceRef(document_id="d",paragraph_id="p1",quote="Review"))])
    store.save_preview(preview,now);receipt=store.issue_approval("s","r","p",now)
    drop_commit[0]=True
    with pytest.raises(DatabaseError,match="^storage_unavailable$"):
        store.commit_calendar("s","r","p",receipt.token,now)
    reopened=SafeDeskStore("unused.db",database=database)
    first=reopened.commit_calendar("s","r","p",receipt.token,now)
    assert reopened.commit_calendar("s","r","p",receipt.token,now)==first
    assert len(reopened.list_calendar_events("s"))==1
    # Simulate server expiry of the stream whose final baton was lost.
    for stream in peer.streams.values():stream.close()
