"""Small synchronous DB-API surface for the official Hrana HTTP v2 protocol."""
import base64
import math
from urllib.parse import urlsplit

import httpx

from .database import DatabaseError,validate_remote_config


def _encode(value):
    if value is None:return {"type":"null"}
    if isinstance(value,int):return {"type":"integer","value":str(value)}
    if isinstance(value,float) and math.isfinite(value):return {"type":"float","value":value}
    if isinstance(value,str):return {"type":"text","value":value}
    if isinstance(value,bytes):return {"type":"blob","base64":base64.b64encode(value).decode("ascii")}
    raise DatabaseError("storage_unavailable")


def _decode(value):
    kind=value["type"]
    if kind=="null":return None
    if kind=="integer":return int(value["value"])
    if kind=="float":
        number=float(value["value"])
        if not math.isfinite(number):raise ValueError()
        return number
    if kind=="text" and isinstance(value["value"],str):return value["value"]
    if kind=="blob":return base64.b64decode(value["base64"],validate=True)
    raise ValueError()


class HttpConnection:
    def __init__(self,database,auth_token,timeout=10,*,client=None):
        validate_remote_config(database,auth_token)
        self._origin="https://"+urlsplit(database).hostname
        self._endpoint=self._origin+"/v2/pipeline"
        self._token=auth_token
        self._timeout=httpx.Timeout(timeout,connect=min(timeout,3.0),pool=min(timeout,3.0))
        self._owns_client=client is None
        self._client=client if client is not None else httpx.Client(timeout=self._timeout,follow_redirects=False,trust_env=False)
        self._baton=None;self._transaction=False;self._failed=False;self._closed=False

    def _pipeline(self,operation):
        if self._failed or self._closed:raise DatabaseError("storage_unavailable")
        try:
            response=self._client.post(self._endpoint,json={"baton":self._baton,"requests":[operation]},
                headers={"Authorization":f"Bearer {self._token}"},timeout=self._timeout,follow_redirects=False)
            if response.status_code!=200:raise ValueError()
            body=response.json();baton=body["baton"];base=body.get("base_url")
            if baton is not None and (not isinstance(baton,str) or not baton or len(baton)>8192):raise ValueError()
            if base is not None:
                parsed=urlsplit(base)
                if parsed.scheme!="https" or parsed.netloc!=urlsplit(self._origin).netloc or parsed.path not in ("","/") or parsed.query or parsed.fragment:
                    raise ValueError()
            results=body["results"]
            if not isinstance(results,list) or len(results)!=1:raise ValueError()
            result=results[0]
            if result["type"] not in ("ok","error"):raise ValueError()
            self._baton=baton
            if result["type"]=="ok" and result["response"]["type"]!=operation["type"]:raise ValueError()
        except Exception:
            # A transport failure leaves the outcome/baton uncertain. Never replay it.
            self._failed=True
            raise DatabaseError("storage_unavailable") from None
        if result["type"]=="error":raise DatabaseError("storage_unavailable")
        return result["response"]

    def execute(self,sql,parameters=()):
        word=sql.strip().split()[0].upper()
        if word in ("INSERT","UPDATE","DELETE","REPLACE") and not self._transaction:
            self.execute("BEGIN")
        result=self._pipeline({"type":"execute","stmt":{"sql":sql,"args":[_encode(value) for value in parameters],"want_rows":True}})["result"]
        if word=="BEGIN":self._transaction=True
        if word in ("COMMIT","ROLLBACK"):self._transaction=False
        if self._transaction and self._baton is None:
            self._failed=True;raise DatabaseError("storage_unavailable")
        try:return HttpCursor(self,result)
        except Exception:
            self._failed=True;raise DatabaseError("storage_unavailable") from None

    def cursor(self):return HttpCursor(self)

    def executescript(self,script):
        self._pipeline({"type":"sequence","sql":script})

    def commit(self):
        if self._transaction and not self._failed:self.execute("COMMIT")

    def rollback(self):
        if self._transaction and not self._failed:self.execute("ROLLBACK")

    def close(self):
        try:
            if self._baton is not None and not self._failed and not self._closed:self._pipeline({"type":"close"})
        finally:
            self._closed=True
            if self._owns_client:self._client.close()


class HttpCursor:
    def __init__(self,connection,result=None):
        self._connection=connection;self._rows=iter(());self.description=None;self.rowcount=-1
        if result is not None:
            self.description=tuple((col["name"],None,None,None,None,None,None) for col in result["cols"])
            rows=[tuple(_decode(value) for value in row) for row in result["rows"]]
            if any(len(row)!=len(self.description) for row in rows):raise ValueError()
            self._rows=iter(rows);self.rowcount=int(result["affected_row_count"])

    def fetchone(self):return next(self._rows,None)
    def executescript(self,script):self._connection.executescript(script)
    def close(self):self._rows=iter(())
