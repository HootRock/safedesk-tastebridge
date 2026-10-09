from datetime import datetime,timezone,timedelta
import httpx,pytest
from tastebridge.qloo import QlooClient,QlooError

def make_client(handler):
    return QlooClient(httpx.AsyncClient(base_url="https://hackathon.api.qloo.com",transport=httpx.MockTransport(handler)),"fake-qloo-key",lambda:datetime.now(timezone.utc))

async def test_search_uses_documented_type():
    def handler(r):
        assert r.url.params["types"]=="urn:entity:movie"
        assert r.url.params["query"]=="Arrival"
        return httpx.Response(200,json={"success":True,"results":[{"entity_id":"a","name":"Arrival","types":["urn:entity:movie"],"properties":{}}]})
    results=await make_client(handler).search_entities("Arrival","movie")
    assert results[0].entity_id=="a" and results[0].year is None

async def test_insights_uses_hackathon_get():
    def handler(r):
        assert r.method=="GET" and r.url.host=="hackathon.api.qloo.com"
        assert r.headers["X-Api-Key"]=="fake-qloo-key" and "api_key" not in r.url.params
        assert r.url.params["filter.type"]=="urn:entity:movie"
        assert r.url.params["signal.interests.entities"]=="seed"
        assert "filter.exclude.entities" not in r.url.params
        assert set(r.url.params)=={'filter.type','signal.interests.entities','take'}
        return httpx.Response(200,json={"success":True,"results":{"entities":[{"entity_id":"a","name":"A","properties":{}}]},"warnings":["limited"]})
    results=await make_client(handler).recommend_movies(["seed"],[])
    assert results.movies[0].name=="A" and results.warnings==["limited"]

@pytest.mark.parametrize("status,headers,count,code",[(401,{},1,"unauthorized"),(429,{"Retry-After":"0"},2,"rate_limited"),(429,{"Retry-After":"15"},1,"rate_limited"),(302,{"Location":"https://evil.test"},1,"redirect_rejected")])
async def test_errors_are_bounded(status,headers,count,code):
    calls=[]
    def handler(r): calls.append(r); return httpx.Response(status,headers=headers)
    with pytest.raises(QlooError,match=code): await make_client(handler).search_entities("A","artist")
    assert len(calls)==count

async def test_empty_or_incomplete_response_is_honest():
    assert await make_client(lambda r:httpx.Response(404)).search_entities("no match","movie")==[]
    with pytest.raises(QlooError,match="invalid_response"):
        await make_client(lambda r:httpx.Response(200,json={"results":{}})).recommend_movies(["seed"],[])

@pytest.mark.parametrize('row',[{'entity_id':'a','name':'A','explainability':'unexpected'},{'entity_id':'a','name':'A','properties':'unexpected'}])
async def test_bad_provider_fields_are_sanitized(row):
    with pytest.raises(QlooError,match='invalid_response'):
        await make_client(lambda r:httpx.Response(200,json={'results':{'entities':[row]}})).recommend_movies(['seed'],[])

async def test_null_optional_provider_fields_are_handled():
    q=make_client(lambda r:httpx.Response(200,json={'results':[{'entity_id':'a','name':'A','properties':None}]}))
    assert (await q.search_entities('A','movie'))[0].year is None
    q=make_client(lambda r:httpx.Response(200,json={'results':{'entities':[{'entity_id':'a','name':'A'}]},'warnings':None}))
    assert (await q.recommend_movies(['seed'],[])).warnings==[]


def durable_quota(tmp_path):
    from hackathon_core.database import Database
    from hackathon_core.quota import DailyQuota
    return DailyQuota(Database(str(tmp_path / "quota.db")))


@pytest.mark.parametrize("first_failure", ["timeout", "server", "rate"])
async def test_retries_consume_durable_quota_before_every_physical_request(tmp_path, first_failure):
    calls = []
    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            if first_failure == "timeout":
                raise httpx.ReadTimeout("offline fixture", request=request)
            return httpx.Response(500 if first_failure == "server" else 429, headers={"Retry-After":"0"})
        return httpx.Response(200, json={"results":[]})
    clock = lambda: datetime(2026, 10, 9, tzinfo=timezone.utc)
    async with httpx.AsyncClient(base_url="https://hackathon.api.qloo.com", transport=httpx.MockTransport(handler)) as http:
        first = QlooClient(http, "test-key", clock, daily_limit=2, quota=durable_quota(tmp_path))
        assert await first.search_entities("Fixture", "movie") == []
        reconstructed = QlooClient(http, "test-key", clock, daily_limit=2, quota=durable_quota(tmp_path))
        with pytest.raises(QlooError, match="daily_limit"):
            await reconstructed.search_entities("Fixture", "movie")
    assert len(calls) == 2


async def test_exhausted_quota_blocks_retry_without_another_provider_request(tmp_path):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(500)
    async with httpx.AsyncClient(base_url="https://hackathon.api.qloo.com", transport=httpx.MockTransport(handler)) as http:
        client = QlooClient(http, "test-key", daily_limit=1, quota=durable_quota(tmp_path))
        with pytest.raises(QlooError, match="daily_limit"):
            await client.search_entities("Fixture", "movie")
    assert len(calls) == 1


async def test_recommendation_cache_does_not_consume_daily_quota(tmp_path):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"results":{"entities":[{"entity_id":"movie", "name":"Fixture", "properties":{}}]}})
    async with httpx.AsyncClient(base_url="https://hackathon.api.qloo.com", transport=httpx.MockTransport(handler)) as http:
        client = QlooClient(http, "test-key", daily_limit=1, quota=durable_quota(tmp_path))
        assert (await client.recommend_movies(["seed"], [])).movies[0].entity_id == "movie"
        assert (await client.recommend_movies(["seed"], [])).movies[0].entity_id == "movie"
        with pytest.raises(QlooError, match="daily_limit"):
            await client.recommend_movies(["different-seed"], [])
    assert len(calls) == 1


async def test_quota_uses_utc_day_and_qloo_service(tmp_path):
    moment = [datetime(2026, 10, 9, 23, 59, tzinfo=timezone.utc)]
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"results":[]})
    limit = durable_quota(tmp_path)
    assert limit.claim("groq", "2026-10-09", 1)
    async with httpx.AsyncClient(base_url="https://hackathon.api.qloo.com", transport=httpx.MockTransport(handler)) as http:
        client = QlooClient(http, "test-key", lambda: moment[0], daily_limit=1, quota=limit)
        assert await client.search_entities("Fixture", "movie") == []
        moment[0] = datetime(2026, 10, 10, 0, 1, tzinfo=timezone(timedelta(hours=8)))
        with pytest.raises(QlooError, match="daily_limit"):
            await client.search_entities("Fixture", "movie")
        moment[0] = datetime(2026, 10, 10, 0, 1, tzinfo=timezone.utc)
        assert await client.search_entities("Fixture", "movie") == []
    assert len(calls) == 2


async def test_quota_storage_failure_blocks_request_with_sanitized_error():
    class UnavailableQuota:
        def claim(self, service, day, limit):
            raise RuntimeError("connection includes secret-token")
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"results":[]})
    async with httpx.AsyncClient(base_url="https://hackathon.api.qloo.com", transport=httpx.MockTransport(handler)) as http:
        client = QlooClient(http, "test-key", quota=UnavailableQuota())
        with pytest.raises(QlooError, match="quota_unavailable") as error:
            await client.search_entities("Fixture", "movie")
    assert "secret-token" not in str(error.value)
    assert calls == []


async def test_unconfigured_qloo_does_not_consume_daily_capacity(tmp_path):
    limit = durable_quota(tmp_path)
    async with httpx.AsyncClient(base_url="https://hackathon.api.qloo.com") as http:
        client = QlooClient(http, "", lambda: datetime(2026, 10, 9, tzinfo=timezone.utc), daily_limit=1, quota=limit)
        with pytest.raises(QlooError, match="qloo_unconfigured"):
            await client.search_entities("Fixture", "movie")
    assert limit.claim("qloo", "2026-10-09", 1)
