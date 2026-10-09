"""Offline protocol peer backed by real SQLite; never contacts a cloud database."""
import base64
import json
import sqlite3
import threading
import uuid

import httpx


def encode(value):
    if value is None:return {"type":"null"}
    if isinstance(value,int):return {"type":"integer","value":str(value)}
    if isinstance(value,float):return {"type":"float","value":value}
    if isinstance(value,bytes):return {"type":"blob","base64":base64.b64encode(value).decode()}
    return {"type":"text","value":value}


def decode(value):
    kind=value["type"]
    if kind=="null":return None
    if kind=="integer":return int(value["value"])
    if kind=="blob":return base64.b64decode(value["base64"])
    return value["value"]


class SQLiteHrana:
    def __init__(self,path):
        self.path=path;self.streams={};self.requests=[];self.lock=threading.Lock()

    def __call__(self,request):
        assert str(request.url)=="https://fixture.turso.io/v2/pipeline"
        assert request.headers["Authorization"]=="Bearer test-token"
        body=json.loads(request.content)
        with self.lock:
            self.requests.append(body)
            baton=body.get("baton")
            db=self.streams.pop(baton) if baton else sqlite3.connect(self.path,timeout=10,check_same_thread=False,isolation_level=None)
        results=[];closed=False
        for operation in body["requests"]:
            try:
                if operation["type"]=="close":
                    db.close();closed=True;response={"type":"close"}
                elif operation["type"]=="sequence":
                    db.executescript(operation["sql"]);response={"type":"sequence"}
                else:
                    stmt=operation["stmt"]
                    cursor=db.execute(stmt["sql"],tuple(decode(arg) for arg in stmt.get("args",[])))
                    columns=[{"name":col[0],"decltype":None} for col in cursor.description or []]
                    rows=[[encode(value) for value in row] for row in cursor.fetchall()] if columns else []
                    response={"type":"execute","result":{"cols":columns,"rows":rows,"affected_row_count":max(cursor.rowcount,0),"last_insert_rowid":None}}
                results.append({"type":"ok","response":response})
            except sqlite3.Error:
                results.append({"type":"error","error":{"message":"provider error includes test-token","code":"SQLITE_ERROR"}})
        next_baton=None if closed else uuid.uuid4().hex
        if next_baton:
            with self.lock:self.streams[next_baton]=db
        return httpx.Response(200,json={"baton":next_baton,"base_url":None,"results":results})


def http_database(tmp_path,peer=None):
    from hackathon_core.database import Database
    from hackathon_core.libsql_http import HttpConnection
    peer=peer or SQLiteHrana(str(tmp_path/"peer.db"))
    def connector(**kwargs):return HttpConnection(**kwargs,client=httpx.Client(transport=httpx.MockTransport(peer)))
    return Database("unused.db",remote_url="libsql://fixture.turso.io",auth_token="test-token",public_hosting=True,remote_connector=connector),peer
