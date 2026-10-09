import {describe, expect, it} from 'vitest';
import {Planner} from '../src/planner';
import {type Env, type StoreApi, type ToolName} from '../src/contracts';

describe('native planner stage output constraints', () => {
  it.each(['recommend_for_group', 'rank_for_group'] as ToolName[])('constrains %s to one offered call with exactly empty arguments', async name => {
    let request: Record<string, unknown> | undefined;
    const env = {AI: {async run(_model: string, input: Record<string, unknown>) {
      request = input;
      return {response: {tool_calls: [{call_id: 'call', name, arguments: '{}'}], text: null}};
    }}} as Env;
    const store = {async claimModelRequest() {}} as StoreApi;
    await new Planner(env, store).next([], [name], {model_attempts: 0, tool_calls: 0});
    const format = request!.response_format as {json_schema: {properties: {tool_calls: {maxItems: number; items: {properties: {name: unknown; arguments: unknown}}}}}};
    expect(format.json_schema.properties.tool_calls.items.properties.arguments).toEqual({type: 'string', enum: ['{}']});
    expect(format.json_schema.properties.tool_calls.maxItems).toBe(1);
    expect(format.json_schema.properties.tool_calls.items.properties.name).toEqual({type: 'string', enum: [name]});
  });
});
