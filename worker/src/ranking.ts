import type {Evidence, MovieResponse, Ranking} from './contracts';
export function rankForGroup(memberLists: Record<string, string[]>, excluded: Set<string>): Ranking[] {
  const lists = Object.entries(memberLists).map(([member, ids]) => [member, [...new Set(ids)].slice(0, 20)] as const);
  const ids = new Set(lists.flatMap(([, values]) => values).filter(id => !excluded.has(id)));
  const rankings = [...ids].map(entity_id => {
    const ranks = Object.fromEntries(lists.map(([member, values]) => {
      const index = values.indexOf(entity_id);
      return [member, index < 0 ? null : index + 1];
    }));
    const utilities = Object.values(ranks).map(rank => rank == null ? 0 : (21 - rank) / 20);
    const mean_utility = utilities.reduce((sum, value) => sum + value, 0) / utilities.length;
    const min_utility = Math.min(...utilities);
    return {entity_id, score: 0.5 * mean_utility + 0.5 * min_utility, mean_utility, min_utility, ranks};
  });
  return rankings.sort((a, b) => b.score - a.score || b.min_utility - a.min_utility || b.mean_utility - a.mean_utility || (a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0)).slice(0, 3);
}
export function makeEvidence(ranking: Ranking, responses: Record<string, MovieResponse>): Evidence[] {
  const result: Evidence[] = [];
  for (const [member_id, rank] of Object.entries(ranking.ranks)) {
    if (rank == null) continue;
    const base = {member_id, entity_id: ranking.entity_id};
    result.push({...base, evidence_id: `${member_id}:${ranking.entity_id}:rank`, kind: 'candidate_rank', value: rank});
    const explanation = responses[member_id]?.movies.find(movie => movie.entity_id === ranking.entity_id)?.explainability;
    if (explanation && Object.keys(explanation).length) result.push({...base, evidence_id: `${member_id}:${ranking.entity_id}:qloo`, kind: 'qloo_explainability', value: structuredClone(explanation)});
  }
  return result;
}
