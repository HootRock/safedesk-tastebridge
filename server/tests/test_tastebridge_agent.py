from datetime import datetime,timezone
import pytest
from tastebridge.agent import MovieAgent
from tastebridge.store import TasteBridgeStore
from tastebridge.models import MemberPreference,EntityChoice,QlooMovieResponse,MovieCandidate
from helpers import ScriptedModel

class QlooFixture:
    async def recommend_movies(self,seeds,excluded):
        return QlooMovieResponse(movies=[MovieCandidate(entity_id=x,name=x,rank=i+1) for i,x in enumerate(["C","D","E"]) if x not in excluded],warnings=[],fetched_at=datetime.now(timezone.utc))
def recs():return {"tool_calls":[{"call_id":"group","name":"recommend_for_group","args":{}}]}
def rank():return {"tool_calls":[{"call_id":"rank","name":"rank_for_group","args":{}}]}
def setup(tmp_path,model):
    store=TasteBridgeStore(str(tmp_path/"t.db"));store.remember_choices("s",[EntityChoice(entity_id="seed",name="Seed",kind="movie")])
    group=store.create_group("s",[MemberPreference(member_id=x,nickname=x,entity_ids=["seed"]) for x in ["a","b"]],datetime.now(timezone.utc))
    return MovieAgent(model,QlooFixture(),store,"test"),store,group
async def test_stale_group_result_is_rejected(tmp_path):
    agent,store,group=setup(tmp_path,ScriptedModel())
    run=await agent.run("r","s",0,None)
    assert run.status=="failed" and run.error_code=="version_conflict"
async def test_seen_feedback_preserves_preferences(tmp_path):
    model=ScriptedModel(recs(),rank(),{"tool_calls":[{"call_id":"f","name":"refine_preferences","args":{"excluded_ids":["C"]}}]},recs(),rank())
    agent,store,group=setup(tmp_path,model)
    initial=await agent.run("r","s",1,None)
    assert initial.status=="completed"
    updated=await agent.run("r2","s",1,"I have seen C")
    assert updated.status=="completed" and all(c.entity_id!="C" for c in updated.candidates)
    current=store.get_group("s")
    assert current.version==2 and current.feedback_rounds==1 and current.members==group.members
async def test_invented_candidate_is_rejected(tmp_path):
    model=ScriptedModel(recs(),rank(),{"tool_calls":[{"call_id":"f","name":"refine_preferences","args":{"excluded_ids":["invented"]}}]})
    agent,store,_=setup(tmp_path,model);await agent.run("r","s",1,None)
    run=await agent.run("r2","s",1,"Seen invented")
    assert run.status=="failed" and run.error_code=="unrecommended_entity"
    assert store.get_group("s").excluded_ids==[]
async def test_missing_explainability_has_limited_copy(tmp_path):
    agent,_,_=setup(tmp_path,ScriptedModel(recs(),rank()))
    run=await agent.run("r","s",1,None)
    assert any("rank evidence only" in t for t in run.explanations)
async def test_ambiguous_feedback_is_not_written(tmp_path):
    agent,store,_=setup(tmp_path,ScriptedModel({"tool_calls":[],"text":"Which movie did you see?"}))
    run=await agent.run("r","s",1,"lighter")
    assert run.status=="needs_clarification" and store.get_group("s").version==1

@pytest.mark.parametrize('same_turn',[True,False])
async def test_multiple_feedback_calls_preserve_all_exclusions(tmp_path,same_turn):
    calls=[{'call_id':x,'name':'refine_preferences','args':{'excluded_ids':[x]}} for x in ['C','D']]
    turns=[{'tool_calls':calls}] if same_turn else [{'tool_calls':[c]} for c in calls]
    agent,store,_=setup(tmp_path,ScriptedModel(recs(),rank(),*turns,{'tool_calls':recs()['tool_calls']+rank()['tool_calls']}))
    await agent.run('first','s',1,None)
    run=await agent.run('next','s',1,'I have seen C and D')
    assert run.status=='completed' and set(store.get_group('s').excluded_ids)=={'C','D'}
    assert all(c.entity_id not in {'C','D'} for c in run.candidates)

async def test_seen_identity_cannot_exclude_a_different_movie(tmp_path):
    model=ScriptedModel(recs(),rank(),{'tool_calls':[{'call_id':'f','name':'refine_preferences','args':{'excluded_ids':['D']}}]})
    agent,store,_=setup(tmp_path,model);await agent.run('first','s',1,None)
    run=await agent.run('next','s',1,'I have seen the selected movie',seen_entity_id='C')
    assert run.status=='failed' and run.error_code=='seen_entity_mismatch'
    assert store.get_group('s').excluded_ids==[]

@pytest.mark.parametrize('member_count',[3,4])
async def test_group_query_covers_every_member_within_two_model_turns(tmp_path,member_count):
    model=ScriptedModel({'tool_calls':[{'call_id':'group','name':'recommend_for_group','args':{}}]},rank())
    agent,store,group=setup(tmp_path,model)
    members=[MemberPreference(member_id=str(i),nickname=str(i),entity_ids=['seed']) for i in range(member_count)]
    store.update_group('s',1,members,datetime.now(timezone.utc))
    run=await agent.run('group','s',2,None)
    assert run.status=='completed'
    assert set(run.candidates[0].ranking.ranks)=={str(i) for i in range(member_count)}
    assert run.counters=={'model_attempts':2,'tool_calls':2}

async def test_repeated_group_query_reuses_results_without_extra_qloo_requests(tmp_path):
    model=ScriptedModel({'tool_calls':[{'call_id':str(i),'name':'recommend_for_group','args':{}} for i in range(4)]},rank())
    agent,store,_=setup(tmp_path,model)
    class CountingQloo(QlooFixture):
        def __init__(self):self.requests=0
        async def recommend_movies(self,seeds,excluded):
            self.requests+=1
            return await super().recommend_movies(seeds,excluded)
    agent.qloo=CountingQloo()
    run=await agent.run('repeat','s',1,None)
    assert run.status=='completed' and len(run.candidates)==3
    assert agent.qloo.requests==2
    assert run.counters=={'model_attempts':2,'tool_calls':2}

async def test_only_tools_for_the_current_stage_are_offered(tmp_path):
    class StagePlanner:
        async def next_action(self,messages,tools,*,budget):
            budget.consume_model_attempt()
            names={tool.name for tool in tools}
            assert names==({'recommend_for_group'} if budget.model_attempts==1 else {'rank_for_group'})
            name='recommend_for_group' if budget.model_attempts==1 else 'rank_for_group'
            from hackathon_core.model import ModelTurn
            return ModelTurn.model_validate({'tool_calls':[{'call_id':str(budget.model_attempts),'name':name,'args':{}}]})
    agent,_,_=setup(tmp_path,StagePlanner())
    assert (await agent.run('staged','s',1,None)).status=='completed'

async def test_duplicate_seen_refinements_do_not_exhaust_the_tool_budget(tmp_path):
    duplicates=[{'call_id':str(i),'name':'refine_preferences','args':{'excluded_ids':['C']}} for i in range(7)]
    model=ScriptedModel(recs(),rank(),{'tool_calls':duplicates+recs()['tool_calls']+rank()['tool_calls']})
    agent,store,_=setup(tmp_path,model)
    await agent.run('first','s',1,None)
    run=await agent.run('duplicate-seen','s',1,'Seen C',seen_entity_id='C')
    assert run.status=='completed' and all(c.entity_id!='C' for c in run.candidates)
    assert run.counters=={'model_attempts':1,'tool_calls':3}
    assert store.get_group('s').excluded_ids==['C']

async def test_exact_seen_feedback_advances_to_query_after_refinement(tmp_path):
    agent,store,_=setup(tmp_path,ScriptedModel(recs(),rank()))
    await agent.run('first','s',1,None)
    class StagePlanner:
        async def next_action(self,messages,tools,*,budget):
            from hackathon_core.model import ModelTurn
            budget.consume_model_attempt()
            name=tools[0].name
            args={'excluded_ids':['C']} if name=='refine_preferences' else {}
            return ModelTurn.model_validate({'tool_calls':[{'call_id':str(budget.model_attempts),'name':name,'args':args}]})
    agent.model=StagePlanner()
    run=await agent.run('seen','s',1,'Seen C',seen_entity_id='C')
    assert run.status=='completed' and run.counters=={'model_attempts':3,'tool_calls':3}
    assert store.get_group('s').excluded_ids==['C']
