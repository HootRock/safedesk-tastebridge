import asyncio
from datetime import datetime,timezone,timedelta
from typing import Callable
import httpx
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from hackathon_core.quota import RequestQuota
from .models import EntityChoice,EntityKind,MovieCandidate,QlooMovieResponse

class QlooError(RuntimeError):
    def __init__(self,code,retry_after=None):
        super().__init__(code); self.code=code; self.retry_after=retry_after

class QlooClient:
    def __init__(self,client:httpx.AsyncClient,api_key:str,clock:Callable[[],datetime]=lambda:datetime.now(timezone.utc),daily_limit=1000,*,quota:RequestQuota|None=None):
        if client.base_url.host!="hackathon.api.qloo.com" or client.base_url.scheme!="https": raise QlooError("invalid_environment")
        self.client,self.api_key,self.clock=client,api_key,clock
        self.semaphore=asyncio.Semaphore(2); self.daily_limit=daily_limit; self.day=None; self.requests=0
        self.quota=quota
        self.cache={}; self.locks={}
    async def _get(self,path,params):
        if not self.api_key: raise QlooError("qloo_unconfigured")
        async with self.semaphore:
            for attempt in range(2):
                day=self.clock().astimezone(timezone.utc).date().isoformat()
                if self.day!=day: self.day=day; self.requests=0
                if self.quota is not None:
                    try: allowed=await run_in_threadpool(self.quota.claim,"qloo",day,self.daily_limit)
                    except Exception: raise QlooError("quota_unavailable") from None
                    if not allowed: raise QlooError("daily_limit")
                elif self.requests>=self.daily_limit: raise QlooError("daily_limit")
                self.requests+=1
                try: r=await self.client.get(path,params=params,headers={"X-Api-Key":self.api_key},timeout=10,follow_redirects=False)
                except (httpx.TimeoutException,httpx.NetworkError):
                    if attempt==0: continue
                    raise QlooError("timeout") from None
                if 300<=r.status_code<400: raise QlooError("redirect_rejected")
                if r.status_code==401: raise QlooError("unauthorized")
                if r.status_code==404 and path=="/search": return {"results":[]}
                if r.status_code==429:
                    try: delay=float(r.headers.get("Retry-After","inf"))
                    except ValueError: delay=float("inf")
                    if attempt==0 and 0<=delay<=10: await asyncio.sleep(delay); continue
                    raise QlooError("rate_limited",delay if delay!=float("inf") else None)
                if r.status_code>=500 and attempt==0: continue
                if not r.is_success: raise QlooError("service_error")
                try: data=r.json()
                except ValueError: raise QlooError("invalid_response") from None
                if not isinstance(data,dict) or data.get("success") is False: raise QlooError("invalid_response")
                return data
        raise QlooError("service_error")
    async def search_entities(self,query:str,kind:EntityKind):
        if kind not in ("movie","artist") or not 1<=len(query.strip())<=200: raise QlooError("invalid_query")
        data=await self._get("/search",{"query":query.strip(),"types":f"urn:entity:{kind}","take":5,"sort_by":"match"})
        rows=data.get("results")
        if not isinstance(rows,list): raise QlooError("invalid_response")
        try:
            return [EntityChoice(entity_id=row["entity_id"],name=row["name"],kind=kind,year=(row.get("properties") or {}).get("release_year")) for row in rows if isinstance(row,dict) and row.get("entity_id") and row.get("name") and (not row.get("types") or f"urn:entity:{kind}" in row["types"])][:5]
        except (ValidationError,TypeError,AttributeError,ValueError):raise QlooError('invalid_response') from None
    async def recommend_movies(self,seed_ids:list[str],exclude_ids:list[str]):
        if not 1<=len(set(seed_ids))<=5: raise QlooError("invalid_seeds")
        key=(str(self.client.base_url),tuple(sorted(set(seed_ids))),tuple(sorted(set(exclude_ids))))
        lock=self.locks.setdefault(key,asyncio.Lock())
        async with lock:
            cached=self.cache.get(key)
            if cached and self.clock()-cached.fetched_at<timedelta(minutes=15): return cached.model_copy(deep=True)
            params={"filter.type":"urn:entity:movie","signal.interests.entities":",".join(sorted(set(seed_ids))),"take":20}
            if exclude_ids: params["filter.exclude.entities"]=",".join(sorted(set(exclude_ids)))
            data=await self._get("/v2/insights",params)
            rows=data.get("results",{}).get("entities") if isinstance(data.get("results"),dict) else None
            if not isinstance(rows,list): raise QlooError("invalid_response")
            movies=[]; seen=set(exclude_ids)
            for row in rows:
                if not isinstance(row,dict) or not row.get("entity_id") or not row.get("name"): raise QlooError("invalid_response")
                if row["entity_id"] in seen: continue
                seen.add(row["entity_id"])
                try:movies.append(MovieCandidate(entity_id=row["entity_id"],name=row["name"],metadata=row.get("properties") or {},rank=len(movies)+1,explainability=row.get("explainability")))
                except (ValidationError,TypeError,ValueError):raise QlooError('invalid_response') from None
            warnings=data.get('warnings') or []
            if not isinstance(warnings,list):raise QlooError('invalid_response')
            result=QlooMovieResponse(movies=movies[:20],warnings=[str(w) for w in warnings],fetched_at=self.clock())
            self.cache[key]=result
            # Bound per-process cache cardinality without retaining expired sessions.
            if len(self.cache)>256:
                oldest=next(iter(self.cache)); self.cache.pop(oldest,None); self.locks.pop(oldest,None)
            return result.model_copy(deep=True)
