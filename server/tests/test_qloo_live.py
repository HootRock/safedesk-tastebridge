import os
import pytest,httpx
from hackathon_core.config import Settings
from tastebridge.qloo import QlooClient

@pytest.mark.live
@pytest.mark.skipif(os.getenv("RUN_LIVE")!="1",reason="Live services require explicit RUN_LIVE=1")
async def test_qloo_live():
    settings=Settings.from_env()
    async with httpx.AsyncClient(base_url=settings.qloo_base_url) as http:
        qloo=QlooClient(http,settings.qloo_api_key)
        movies=await qloo.search_entities("Interstellar","movie")
        artists=await qloo.search_entities("Taylor Swift","artist")
        assert movies and artists
        result=await qloo.recommend_movies([movies[0].entity_id],[])
        assert result.movies and all(m.entity_id for m in result.movies)
        print({"movies":len(movies),"artists":len(artists),"recommendations":len(result.movies),"requests":qloo.requests})
