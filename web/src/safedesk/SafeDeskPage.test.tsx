import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {vi} from 'vitest';
import {SafeDeskPage} from './SafeDeskPage';
vi.mock('../shared/api',async importOriginal=>({...await importOriginal<typeof import('../shared/api')>(),pause:async()=>{}}));

beforeEach(()=>{vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({action_token:'test'})})));});
afterEach(()=>vi.unstubAllGlobals());
test('initial calendar requires confirmation',()=>{
  render(<SafeDeskPage/>);
  expect(screen.getByRole('button',{name:'Confirm demo calendar'})).toBeDisabled();
  expect(screen.getByRole('heading',{name:'Demo calendar'})).toBeVisible();
});
test('viewing a task source highlights its original paragraph and editing clears the stale source',async()=>{
  const source={document_id:'d',paragraph_id:'p2',quote:'Prepare the demo'};
  const run={run_id:'r',state:'awaiting_confirmation',mode:'test',document:{paragraphs:[{paragraph_id:'p1',text:'First paragraph'},{paragraph_id:'p2',text:'Prepare the demo'}]},draft:{version:1,items:[{task_id:'t',title:'Prepare the demo',source,start_at:null,end_at:null}],clarifications:[]},preview:null,events:[],counters:{}};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url==='/api/session'?{action_token:'t'}:url.endsWith('/runs')?{run_id:'r'}:run})));
  render(<SafeDeskPage/>);fireEvent.click(screen.getByRole('button',{name:'Create task draft'}));
  await screen.findByRole('button',{name:'View source p2'});
  fireEvent.click(screen.getByRole('button',{name:'Maximize Tasks'}));
  expect(screen.getByLabelText('Source paragraph p2')).not.toBeVisible();
  fireEvent.click(await screen.findByRole('button',{name:'View source p2'}));
  expect(screen.getByLabelText('Source paragraph p2')).toBeVisible();
  expect(screen.getByLabelText('Source paragraph p2')).toHaveAttribute('aria-current','true');
  expect(screen.getByLabelText('Source paragraph p1')).not.toHaveAttribute('aria-current','true');
  fireEvent.click(screen.getByRole('button',{name:'Edit document'}));
  fireEvent.change(screen.getByLabelText('Document text'),{target:{value:'A replacement document'}});
  expect(screen.queryByLabelText('Source paragraph p2')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Confirm demo calendar'})).toBeDisabled();
});
test('Unicode limit disables planning',()=>{
  render(<SafeDeskPage/>);
  fireEvent.change(screen.getByLabelText('Document text'),{target:{value:'😀'.repeat(20001)}});
  expect(screen.getByRole('button',{name:'Create task draft'})).toBeDisabled();
});
test('a clarification without a draft remains visible in the task panel',async()=>{
  const run={run_id:'r',state:'needs_clarification',mode:'test',document:{paragraphs:[]},draft:null,preview:null,events:[{kind:'clarification',payload:{message:'Add an exact task and time.'}}],counters:{}};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url==='/api/session'?{action_token:'t'}:url.endsWith('/runs')?{run_id:'r'}:run})));
  render(<SafeDeskPage/>);fireEvent.click(screen.getByRole('button',{name:'Create task draft'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Add an exact task and time.');
  expect(screen.getByRole('status')).toBeVisible();
  expect(screen.getByRole('button',{name:'Confirm demo calendar'})).toBeDisabled();
});
test('editing document ignores a late draft',async()=>{
  let resolve!:(value:unknown)=>void;
  vi.stubGlobal('fetch',vi.fn((url:string)=>url==='/api/session'?Promise.resolve({ok:true,json:async()=>({action_token:'t'})}):new Promise(r=>{resolve=r}))); 
  render(<SafeDeskPage/>);fireEvent.click(screen.getByRole('button',{name:'Create task draft'}));
  await waitFor(()=>expect(resolve).toBeDefined());
  fireEvent.change(screen.getByLabelText('Document text'),{target:{value:'New document'}});
  resolve({ok:true,json:async()=>({run_id:'old'})});
  await waitFor(()=>expect(screen.getByText('Your task draft will appear here.')).toBeVisible());
});
test('a model failure is visible and never enables confirmation',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url==='/api/session'?{action_token:'t'}:url.endsWith('/runs')?{run_id:'r'}:{run_id:'r',state:'failed',error_code:'model_timeout',mode:'live',document:{paragraphs:[]},draft:null,preview:null,events:[],counters:{}}})));
  render(<SafeDeskPage/>);fireEvent.click(screen.getByRole('button',{name:'Create task draft'}));
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('model_timeout'));
  expect(screen.getByRole('button',{name:'Confirm demo calendar'})).toBeDisabled();
});
test('editing the current draft revokes the checked approval',async()=>{
  const source={document_id:'d',paragraph_id:'p1',quote:'Meet'};
  const run={run_id:'r',state:'awaiting_confirmation',mode:'test',document:{paragraphs:[{paragraph_id:'p1',text:'Meet'}]},draft:{version:1,items:[{task_id:'t',title:'Meet',source,start_at:null,end_at:null}],clarifications:[]},preview:{preview_id:'p',version:1,events:[{title:'Meet',start_at:'10:00',end_at:'11:00'}]},events:[],counters:{}};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url==='/api/session'?{action_token:'t'}:url.endsWith('/runs')?{run_id:'r'}:run})));
  render(<SafeDeskPage/>);fireEvent.click(screen.getByRole('button',{name:'Create task draft'}));
  const checkbox=await screen.findByRole('checkbox');
  await waitFor(()=>expect(checkbox).toBeEnabled());
  fireEvent.click(checkbox);expect(screen.getByRole('button',{name:'Confirm demo calendar'})).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Task 1'),{target:{value:'Changed'}});
  expect(checkbox).not.toBeChecked();expect(screen.getByRole('button',{name:'Confirm demo calendar'})).toBeDisabled();
});
test('polling exhaustion can check the existing run without another model run',async()=>{
  let checks=0;const posts=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit={})=>{
    if(url==='/api/session')return {ok:true,json:async()=>({action_token:'t'})};
    if(init.method==='POST'){posts();return {ok:true,json:async()=>({run_id:'r'})}}
    checks++;return {ok:true,json:async()=>({run_id:'r',state:checks>260?'needs_clarification':'running',mode:'test',document:{paragraphs:[]},draft:null,preview:null,events:[],counters:{}})};
  }));
  render(<SafeDeskPage/>);fireEvent.click(screen.getByRole('button',{name:'Create task draft'}));
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Still processing'));
  fireEvent.click(screen.getByRole('button',{name:'Check current run'}));
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Check current run'})).not.toBeInTheDocument());
  expect(posts).toHaveBeenCalledTimes(1);
});
