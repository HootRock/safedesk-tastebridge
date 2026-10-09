from .models import GroupRankingItem,EvidenceRef

def rank_for_group(member_lists:dict[str,list[str]],excluded:set[str]):
    lists={m:list(dict.fromkeys(ids))[:20] for m,ids in member_lists.items()}
    all_ids=set().union(*(set(ids) for ids in lists.values()))-excluded if lists else set()
    rankings=[]
    for entity in all_ids:
        ranks={m:(ids.index(entity)+1 if entity in ids else None) for m,ids in lists.items()}
        utilities=[(21-r)/20 if r is not None else 0 for r in ranks.values()]
        mean=sum(utilities)/len(utilities);minimum=min(utilities)
        rankings.append(GroupRankingItem(entity_id=entity,score=.5*mean+.5*minimum,mean_utility=mean,min_utility=minimum,ranks=ranks))
    return sorted(rankings,key=lambda r:(-r.score,-r.min_utility,-r.mean_utility,r.entity_id))[:3]

def make_evidence(ranking,responses):
    result=[]
    for member,rank in ranking.ranks.items():
        if rank is None: continue
        result.append(EvidenceRef(evidence_id=f"{member}:{ranking.entity_id}:rank",member_id=member,entity_id=ranking.entity_id,kind="candidate_rank",value=rank))
        candidate=next((m for m in responses[member].movies if m.entity_id==ranking.entity_id),None)
        if candidate and candidate.explainability:
            result.append(EvidenceRef(evidence_id=f"{member}:{ranking.entity_id}:qloo",member_id=member,entity_id=ranking.entity_id,kind="qloo_explainability",value=candidate.explainability))
    return result
