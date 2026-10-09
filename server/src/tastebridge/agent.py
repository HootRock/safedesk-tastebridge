import json
from datetime import datetime,timezone
from pydantic import Field
from starlette.concurrency import run_in_threadpool
from hackathon_core.contracts import StrictModel,ToolDefinition,RunBudget,parse_tool_call,ToolValidationError,LimitReached
from hackathon_core.model import Message,ModelError
from hackathon_core.events import RunEvent
from .models import RecommendationRun,GroupCandidate
from .ranking import rank_for_group,make_evidence
from .store import GroupError
from .qloo import QlooError

class RefineArgs(StrictModel): excluded_ids:list[str]=Field(min_length=1,max_length=3)
class EmptyArgs(StrictModel):pass
REGISTRY={t.name:t for t in [ToolDefinition("recommend_for_group",EmptyArgs),ToolDefinition("rank_for_group",EmptyArgs),ToolDefinition("refine_preferences",RefineArgs)]}

class MovieAgent:
    def __init__(self,model,qloo,store,mode="live"):
        self.model,self.qloo,self.store,self.mode=model,qloo,store,mode
    async def run(self,run_id,session_id,expected_version,feedback,seen_entity_id=None):
        run=RecommendationRun(run_id=run_id,session_id=session_id,group_version=expected_version,status="running",mode=self.mode)
        budget=RunBudget();responses={};excluded=[];query_result=None
        def event(tool,decision,payload):run.events.append(RunEvent(seq=len(run.events)+1,kind="tool",tool_name=tool,decision=decision,payload=payload,mode=self.mode).model_dump(mode="json"))
        try:
            group=await run_in_threadpool(self.store.get_group,session_id)
            if group.version!=expected_version:raise GroupError("version_conflict")
            await run_in_threadpool(self.store.claim_attempt,session_id,datetime.now(timezone.utc))
            if (feedback or seen_entity_id) and group.feedback_rounds>=3:raise GroupError("feedback_limit")
            previous=await run_in_threadpool(self.store.latest_run,session_id)
            shown=[{"entity_id":c.entity_id,"name":c.name} for c in previous.candidates] if previous and previous.group_version==expected_version else []
            if seen_entity_id:
                if seen_entity_id not in {c['entity_id'] for c in shown}:raise GroupError('unrecommended_entity')
                feedback=feedback or 'I have seen the selected movie. Exclude only its exact entity ID.'
            messages=[Message(role="developer",content="Choose movie recommendations with real Qloo data. First call recommend_for_group with empty args: the server queries every confirmed member exactly once. Then call rank_for_group with empty args. With seen feedback, first call refine_preferences with only IDs from shown candidates, then recommend_for_group, then rank_for_group. If seen_entity_id is provided, exclude only that exact ID. For vague genre/tone changes ask clarification with no tool calls. Never invent entities or scores. Entity preferences are already confirmed. Only tools valid for the current stage are offered; do not repeat completed operations."),Message(role="user",content=json.dumps({"members":[m.model_dump() for m in group.members],"feedback":feedback,"shown_candidates":shown,'seen_entity_id':seen_entity_id},ensure_ascii=False))]
            while run.status=="running":
                if responses:available=['rank_for_group']
                elif feedback and not excluded:available=['refine_preferences']
                elif feedback and not seen_entity_id:available=['refine_preferences','recommend_for_group']
                else:available=['recommend_for_group']
                turn=await self.model.next_action(messages,[REGISTRY[name] for name in available],budget=budget)
                if not turn.tool_calls:
                    run.status="needs_clarification";run.explanations=[turn.text or "Please clarify which movie you have seen."];break
                for proposed in turn.tool_calls:
                    call=parse_tool_call(proposed.model_dump(),REGISTRY)
                    # An identical retrieval is a read replay, not another Qloo query.
                    if call.name=='recommend_for_group' and query_result is not None:
                        event(call.name,'reused',query_result)
                        messages.append(Message(role='tool',tool_call_id=call.call_id,content=json.dumps(query_result)))
                        continue
                    if call.name=='refine_preferences' and feedback and not responses and set(call.args['excluded_ids'])<=set(excluded):
                        result={'pending_exclusions':excluded,'next_step':'recommend_for_group'}
                        event(call.name,'reused',result)
                        messages.append(Message(role='tool',tool_call_id=call.call_id,content=json.dumps(result)))
                        continue
                    budget.consume_tool_call()
                    if call.name=="refine_preferences":
                        valid={x["entity_id"] for x in shown};pending=list(dict.fromkeys(call.args["excluded_ids"]))
                        if not feedback or not set(pending)<=valid:raise GroupError("unrecommended_entity")
                        if seen_entity_id and set(pending)!={seen_entity_id}:raise GroupError('seen_entity_mismatch')
                        if responses:raise GroupError("feedback_must_precede_query")
                        excluded=list(dict.fromkeys(excluded+pending))
                        result={"pending_exclusions":excluded,'next_step':'recommend_for_group'}
                    elif call.name=="recommend_for_group":
                        if feedback and not excluded:raise GroupError("feedback_needs_clarification")
                        for member in group.members:
                            responses[member.member_id]=await self.qloo.recommend_movies(member.entity_ids,group.excluded_ids+excluded)
                            event('recommend_movies','allowed',{'member_id':member.member_id,'candidate_count':len(responses[member.member_id].movies)})
                        result={'members':{member_id:len(response.movies) for member_id,response in responses.items()},'next_step':'rank_for_group'}
                        query_result=result
                    elif call.name=="rank_for_group":
                        if set(responses)!={m.member_id for m in group.members}:raise GroupError("member_queries_required")
                        ranked=rank_for_group({m:[c.entity_id for c in r.movies] for m,r in responses.items()},set(group.excluded_ids+excluded))
                        for ranking in ranked:
                            movie=next(c for r in responses.values() for c in r.movies if c.entity_id==ranking.entity_id)
                            run.candidates.append(GroupCandidate(entity_id=movie.entity_id,name=movie.name,metadata=movie.metadata,ranking=ranking))
                            run.evidence.extend(make_evidence(ranking,responses))
                        run.status="completed" if ranked else "empty"
                        run.fetched_at=min(r.fetched_at for r in responses.values())
                        run.explanations=["Group score combines the average and lowest candidate-rank utility equally.","Not in a candidate list means missing from this query, not dislike."]
                        if not any(c.explainability for r in responses.values() for c in r.movies):run.explanations.append("Qloo explanation details unavailable; rank evidence only.")
                        warnings=[w for r in responses.values() for w in r.warnings]
                        if warnings:run.explanations.append("Qloo returned limited explanation data.")
                        result={"ranked_entities":[r.entity_id for r in ranked]}
                    event(call.name,"allowed",result)
                    messages.append(Message(role="tool",tool_call_id=call.call_id,content=json.dumps(result)))
                    if run.status!="running":break
            run.counters={"model_attempts":budget.model_attempts,"tool_calls":budget.tool_calls}
            if run.status in ("completed","empty"): await run_in_threadpool(self.store.publish_run,run,expected_version,excluded,datetime.now(timezone.utc))
            else:await run_in_threadpool(self.store.save_run,run)
        except (GroupError,QlooError,ModelError,ToolValidationError,LimitReached) as exc:
            run.status="rate_limited" if "limit" in str(exc) else "failed";run.error_code=str(exc)
            run.candidates=[];run.evidence=[];run.explanations=[]
            event(None,"denied",{"reason":str(exc)})
            run.counters={"model_attempts":budget.model_attempts,"tool_calls":budget.tool_calls};await run_in_threadpool(self.store.save_run,run)
        return run
