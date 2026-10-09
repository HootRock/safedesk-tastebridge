export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const SESSION_MS = 86400000;
export const WORKFLOW_MS = 210000;
export class AppError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export type Kind = 'movie' | 'artist';
export type Choice = {entity_id: string; name: string; kind: Kind; year: number | null};
export type Member = {member_id: string; nickname: string; entity_ids: string[]};
export type Group = {session_id: string; version: number; members: Member[]; excluded_ids: string[]; feedback_rounds: number; updated_at: string};
export type Session = {id: string; token: string; created: number};
export type Movie = {entity_id: string; name: string; metadata: Record<string, unknown>; rank: number; explainability: Record<string, unknown> | unknown[] | null};
export type MovieResponse = {movies: Movie[]; warnings: string[]; fetched_at: string};
export type Ranking = {entity_id: string; score: number; mean_utility: number; min_utility: number; ranks: Record<string, number | null>};
export type Evidence = {evidence_id: string; member_id: string; entity_id: string; kind: string; value: number | Record<string, unknown> | unknown[]};
export type Candidate = {entity_id: string; name: string; metadata: Record<string, unknown>; ranking: Ranking};
export type Event = {seq: number; kind: string; tool_name: string | null; decision: string; source: string | null; payload: Record<string, unknown>; mode: 'live'};
export type Counters = {model_attempts: number; tool_calls: number};
export type MovieRun = {run_id: string; session_id: string; group_version: number; status: 'running' | 'completed' | 'empty' | 'needs_clarification' | 'failed' | 'rate_limited'; candidates: Candidate[]; evidence: Evidence[]; explanations: string[]; events: Event[]; mode: 'live'; error_code: string | null; fetched_at: string | null; counters: Counters};
export type RecommendInput = {expected_version: number; feedback?: string | null; seen_entity_id?: string | null};
export type ToolName = 'refine_preferences' | 'recommend_for_group' | 'rank_for_group';
export type Message = {role: 'developer' | 'user' | 'tool'; content: string; tool_call_id?: string};
export type Plan = {tool_calls: {call_id: string; name: ToolName; args: Record<string, unknown>}[]; text: string | null};
export interface Env {
  DB: D1Database;
  AI: {run(model: string, input: Record<string, unknown>): Promise<unknown>};
  ASSETS: {fetch(request: Request): Promise<Response>};
  QLOO_API_KEY?: string;
}
export interface StoreApi {
  sessionRead(id: string): Promise<Session | null>;
  sessionCreate(): Promise<Session>;
  rememberChoices(session: string, choices: Choice[]): Promise<void>;
  createGroup(session: string, members: Member[]): Promise<Group>;
  getGroup(session: string): Promise<Group>;
  updateGroup(session: string, expected: number, members: Member[]): Promise<Group>;
  claimRun(session: string, runId: string, expected: number): Promise<{group: Group; previous: MovieRun | null}>;
  releaseRun(session: string, runId: string): Promise<void>;
  saveRun(run: MovieRun): Promise<void>;
  getRun(session: string, runId: string): Promise<MovieRun>;
  publishRun(run: MovieRun, expected: number, excluded: string[]): Promise<void>;
  claimModelRequest(): Promise<void>;
  claimQlooRequest(): Promise<string>;
  releaseQlooRequest(lease: string): Promise<void>;
  readCache(key: string): Promise<MovieResponse | null>;
  writeCache(key: string, value: MovieResponse): Promise<void>;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('invalid_arguments', 422);
  return value as Record<string, unknown>;
}
export function exact(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  const obj = record(value);
  if (required.some(k => !(k in obj)) || Object.keys(obj).some(k => !required.includes(k) && !optional.includes(k))) throw new AppError('invalid_arguments', 422);
  return obj;
}
export function text(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw new AppError('invalid_arguments', 422);
  return value;
}
export function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new AppError('invalid_arguments', 422);
  return value as number;
}
export function parseMembers(value: unknown): Member[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) throw new AppError('invalid_group', 422);
  const members = value.map(item => {
    const obj = exact(item, ['member_id', 'nickname', 'entity_ids']);
    if (!Array.isArray(obj.entity_ids) || obj.entity_ids.length > 5) throw new AppError('invalid_group', 422);
    const ids = [...new Set(obj.entity_ids.map(id => text(id, 1, 100)))];
    if (!ids.length) throw new AppError('invalid_group', 422);
    return {member_id: text(obj.member_id, 1, 40), nickname: text(obj.nickname, 1, 40), entity_ids: ids};
  });
  if (new Set(members.map(m => m.member_id)).size !== members.length) throw new AppError('invalid_group', 422);
  return members;
}
export function parseRecommend(value: unknown): RecommendInput {
  const obj = exact(value, ['expected_version'], ['feedback', 'seen_entity_id']);
  return {expected_version: version(obj.expected_version), feedback: obj.feedback == null ? null : text(obj.feedback, 0, 1000), seen_entity_id: obj.seen_entity_id == null ? null : text(obj.seen_entity_id, 1, 100)};
}
export function initialRun(runId: string, sessionId: string, groupVersion: number): MovieRun {
  return {run_id: runId, session_id: sessionId, group_version: groupVersion, status: 'running', candidates: [], evidence: [], explanations: [], events: [], mode: 'live', error_code: null, fetched_at: null, counters: {model_attempts: 0, tool_calls: 0}};
}
