import {render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import {vi} from 'vitest';
import {TasteBridgePage} from './TasteBridgePage';
import {RecommendationCards} from './RecommendationCards';
vi.mock('../shared/api',async importOriginal=>({...await importOriginal<typeof import('../shared/api')>(),pause:async()=>{}}));

afterEach(()=>vi.unstubAllGlobals());
test('the initial shortlist gives guidance without showing films before a real request',()=>{
  render(<TasteBridgePage/>);
  const shortlist=within(screen.getByRole('region',{name:'Film shortlist'}));
  expect(shortlist.getByRole('status')).toHaveTextContent(/confirm.*favorites/i);
  expect(shortlist.queryAllByRole('article')).toHaveLength(0);
  expect(shortlist.queryAllByRole('img')).toHaveLength(0);
  expect(shortlist.queryByText(/No films were returned/)).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Find our movie'})).toBeDisabled();
});
test('real metadata supplies a poster and selecting another film reveals its own details',()=>{
  render(<RecommendationCards run={{run_id:'r',status:'completed',group_version:1,mode:'test',candidates:[{entity_id:'a',name:'First film',metadata:{image:{url:'https://m.media-amazon.com/first.jpg'},duration:120},ranking:{score:.25,ranks:{a:1,b:null}}},{entity_id:'b',name:'Second film',metadata:{image:{url:'https://m.media-amazon.com/second.jpg'},duration:95,genres:['Drama']},ranking:{score:.22,ranks:{a:2,b:1}}}],explanations:[],events:[]}} onSeen={()=>{}}/>);
  expect(screen.getByAltText('First film poster')).toHaveAttribute('src','https://m.media-amazon.com/first.jpg');
  fireEvent.click(screen.getByRole('button',{name:'Explore Second film'}));
  expect(screen.getByRole('heading',{name:'Second film',level:3})).toBeVisible();
  expect(screen.getByText('95 min')).toBeVisible();
  expect(screen.getByRole('button',{name:'Explore Second film'})).toHaveAttribute('aria-pressed','true');
  expect(screen.queryByText(/None of these shortlisted films appears in every friend's candidate list/)).not.toBeInTheDocument();
});
test('unsafe or missing poster URLs use an honest text fallback',()=>{
  render(<RecommendationCards run={{run_id:'r',status:'completed',group_version:1,mode:'test',candidates:[{entity_id:'c',name:'Test film',metadata:{image:{url:'javascript:alert(1)'}},ranking:{score:.25,ranks:{a:1,b:null}}}],explanations:[],events:[]}} onSeen={()=>{}}/>);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('Poster unavailable')).toBeVisible();
});
test('a clarification is visible without expanding recommendation details',()=>{
  render(<RecommendationCards run={{run_id:'r',status:'needs_clarification',group_version:1,mode:'test',candidates:[],explanations:['Which movie have you already seen?'],events:[]}} onSeen={()=>{}}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Which movie have you already seen?');
  expect(screen.getByText('Which movie have you already seen?')).toBeVisible();
});
test('a rate-limited attempt does not claim that Qloo returned an empty shortlist',()=>{
  const {container}=render(<RecommendationCards run={{run_id:'limited',status:'rate_limited',group_version:1,mode:'test',candidates:[],explanations:[],events:[],error_code:'model_attempt_limit'}} onSeen={()=>{}}/>);
  expect(container).toBeEmptyDOMElement();
});
test('missing candidate rank is not dislike',()=>{
  render(<RecommendationCards run={{run_id:'r',status:'completed',group_version:1,mode:'test',candidates:[{entity_id:'c',name:'Test film',metadata:{},ranking:{score:.25,ranks:{a:1,b:null}}}],explanations:[],events:[]}} onSeen={()=>{}}/>);
  fireEvent.click(screen.getByText('Taste details'));
  expect(screen.getByText('Not in this candidate list')).toBeVisible();
  expect(screen.getByText(/None of these shortlisted films appears in every friend's candidate list/)).toBeVisible();
  expect(screen.queryByText('Dislikes this movie')).not.toBeInTheDocument();
});
test('search requires explicit entity selection',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url==='/api/session'?{action_token:'t'}: [{entity_id:'a',name:'Arrival',kind:'movie',year:2016}]})));
  render(<TasteBridgePage/>);
  fireEvent.change(screen.getAllByLabelText('Search preference')[0],{target:{value:'Arrival'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Select Arrival (2016)'})).toBeVisible());
  expect(screen.getByRole('button',{name:'Find our movie'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Select Arrival (2016)'}));
  expect(screen.getByRole('button',{name:'Remove Arrival'})).toBeVisible();
});
test('a reloaded page updates the existing group before recommending',async()=>{
  const calls:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit={})=>{
    calls.push(`${init.method||'GET'} ${url}`);
    if(url==='/api/session')return {ok:true,json:async()=>({action_token:'t'})};
    if(url.includes('/entities/search'))return {ok:true,json:async()=>[{entity_id:'seed',name:'Arrival',kind:'movie',year:2016}]};
    if(url==='/api/tastebridge/groups'&&init.method==='POST')return {ok:false,status:409,json:async()=>({detail:'group_exists'})};
    if(url==='/api/tastebridge/groups')return {ok:true,json:async()=>({version:4})};
    if(url.endsWith('/preferences'))return {ok:true,json:async()=>({version:5})};
    if(url==='/api/tastebridge/recommendations')return {ok:true,json:async()=>({run_id:'r'})};
    return {ok:true,json:async()=>({run_id:'r',status:'completed',group_version:5,mode:'test',candidates:[],explanations:[],events:[]})};
  }));
  render(<TasteBridgePage/>);
  for(let i=0;i<2;i++){
    fireEvent.change(screen.getAllByLabelText('Search preference')[i],{target:{value:'Arrival'}});
    await waitFor(()=>expect(screen.getByRole('button',{name:'Select Arrival (2016)'})).toBeVisible());
    fireEvent.click(screen.getByRole('button',{name:'Select Arrival (2016)'}));
  }
  fireEvent.click(screen.getByRole('button',{name:'Find our movie'}));
  await waitFor(()=>expect(screen.getByText('Find your middle ground')).toBeVisible());
  expect(calls).toContain('PUT /api/tastebridge/groups/preferences');
});
test('empty search results allow another query',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url==='/api/session'?{action_token:'t'}:[]})));
  render(<TasteBridgePage/>);
  fireEvent.change(screen.getAllByLabelText('Search preference')[0],{target:{value:'No match'}});
  await waitFor(()=>expect(screen.getByText('No results. Try the original title or artist name.')).toBeVisible());
  expect(screen.getAllByLabelText('Search preference')[0]).toBeEnabled();
});
test('seen button preserves the identity of a same-title movie',()=>{
  const onSeen=vi.fn();
  render(<RecommendationCards run={{run_id:'r',status:'completed',group_version:1,mode:'test',candidates:[{entity_id:'second',name:'Same title',metadata:{release_year:2020},ranking:{score:.25,ranks:{a:1,b:null}}}],explanations:[],events:[]}} onSeen={onSeen}/>);
  fireEvent.click(screen.getByRole('button',{name:"I've seen this: Same title"}));
  expect(onSeen).toHaveBeenCalledWith({entity_id:'second',name:'Same title'});
});
test('a rejected seen update keeps the valid shortlist and gives a readable retry message',async()=>{
  let requests=0;
  const completed={run_id:'r',status:'completed',group_version:5,mode:'test',candidates:[{entity_id:'film',name:'Arrival',metadata:{release_year:2016},ranking:{score:.25,ranks:{'friend-1':1,'friend-2':2}}}],explanations:[],events:[]};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url==='/api/session')return {ok:true,json:async()=>({action_token:'t'})};
    if(url.includes('/entities/search'))return {ok:true,json:async()=>[{entity_id:'seed',name:'Arrival',kind:'movie',year:2016}]};
    if(url==='/api/tastebridge/groups')return {ok:true,json:async()=>({version:5})};
    if(url==='/api/tastebridge/recommendations')return {ok:true,json:async()=>({run_id:++requests===1?'r':'r2'})};
    return {ok:true,json:async()=>url.endsWith('/r2')?{...completed,run_id:'r2',status:'failed',candidates:[],error_code:'feedback_needs_clarification'}:completed};
  }));
  render(<TasteBridgePage/>);
  for(let i=0;i<2;i++){
    fireEvent.change(screen.getAllByLabelText('Search preference')[i],{target:{value:'Arrival'}});
    fireEvent.click(await screen.findByRole('button',{name:'Select Arrival (2016)'}));
  }
  fireEvent.click(screen.getByRole('button',{name:'Find our movie'}));
  fireEvent.click(await screen.findByRole('button',{name:"I've seen this: Arrival"}));
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent("Your movie update wasn't applied"));
  expect(screen.getByRole('button',{name:"I've seen this: Arrival"})).toBeEnabled();
  expect(screen.getByText('Arrival',{selector:'h3'})).toBeVisible();
});
test('double clicks create one run, polling can resume, and seen feedback uses the current group',async()=>{
  let checks=0;const requests:Record<string,unknown>[]=[];
  const completed={run_id:'r',status:'completed',group_version:7,mode:'test',candidates:[{entity_id:'C',name:'Same title',metadata:{},ranking:{score:.25,ranks:{a:1,b:null}}}],explanations:[],events:[]};
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit={})=>{
    if(url==='/api/session')return {ok:true,json:async()=>({action_token:'t'})};
    if(url.includes('/entities/search'))return {ok:true,json:async()=>[{entity_id:'seed',name:'Arrival',kind:'movie',year:2016}]};
    if(url==='/api/tastebridge/groups')return {ok:true,json:async()=>({version:7})};
    if(url==='/api/tastebridge/recommendations'){
      requests.push(JSON.parse(init.body as string));return {ok:true,json:async()=>({run_id:requests.length===1?'r':'r2'})};
    }
    if(url.endsWith('/r2'))return {ok:true,json:async()=>({...completed,run_id:'r2',group_version:8,candidates:[]})};
    checks++;return {ok:true,json:async()=>checks<=260?{...completed,status:'running',candidates:[]}:completed};
  }));
  render(<TasteBridgePage/>);
  for(let i=0;i<2;i++){
    fireEvent.change(screen.getAllByLabelText('Search preference')[i],{target:{value:'Arrival'}});
    await waitFor(()=>expect(screen.getByRole('button',{name:'Select Arrival (2016)'})).toBeVisible());
    fireEvent.click(screen.getByRole('button',{name:'Select Arrival (2016)'}));
  }
  const start=screen.getByRole('button',{name:'Find our movie'});fireEvent.click(start);fireEvent.click(start);
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Still processing'));
  expect(requests).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Check current run'}));
  fireEvent.click(await screen.findByRole('button',{name:"I've seen this: Same title"}));
  await waitFor(()=>expect(requests).toHaveLength(2));
  expect(requests[1]).toMatchObject({expected_version:7,seen_entity_id:'C'});
  await waitFor(()=>expect(screen.queryByRole('button',{name:"I've seen this: Same title"})).not.toBeInTheDocument());
});
test('a committed empty shortlist cannot resurrect cards from an earlier group version',async()=>{
  let requests=0;
  const completed={run_id:'r1',status:'completed',group_version:5,mode:'test',candidates:[{entity_id:'film',name:'Arrival',metadata:{},ranking:{score:.25,ranks:{'friend-1':1,'friend-2':2}}}],explanations:[],events:[]};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url==='/api/session')return {ok:true,json:async()=>({action_token:'t'})};
    if(url.includes('/entities/search'))return {ok:true,json:async()=>[{entity_id:'seed',name:'Arrival',kind:'movie',year:2016}]};
    if(url==='/api/tastebridge/groups')return {ok:true,json:async()=>({version:5})};
    if(url==='/api/tastebridge/recommendations')return {ok:true,json:async()=>({run_id:`r${++requests}`})};
    return {ok:true,json:async()=>url.endsWith('/r1')?completed:{...completed,run_id:`r${requests}`,group_version:6,status:requests===2?'empty':'failed',candidates:[],error_code:requests===3?'provider_failure':null}};
  }));
  render(<TasteBridgePage/>);
  for(let i=0;i<2;i++){
    fireEvent.change(screen.getAllByLabelText('Search preference')[i],{target:{value:'Arrival'}});
    fireEvent.click(await screen.findByRole('button',{name:'Select Arrival (2016)'}));
  }
  fireEvent.click(screen.getByRole('button',{name:'Find our movie'}));
  fireEvent.click(await screen.findByRole('button',{name:"I've seen this: Arrival"}));
  await screen.findByText('No candidates. Try adding another preference.');
  fireEvent.click(screen.getByRole('button',{name:'Find our movie'}));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button',{name:"I've seen this: Arrival"})).not.toBeInTheDocument();
  expect(screen.queryByText('No films were returned. Try adding another favorite.')).not.toBeInTheDocument();
  expect(screen.queryByText('No candidates. Try adding another preference.')).not.toBeInTheDocument();
});

test.each(['rate_limited','cancelled','running'])('a %s update preserves the current group shortlist',async(status)=>{
  let requests=0;
  const completed={run_id:'r1',status:'completed',group_version:5,mode:'test',candidates:[{entity_id:'film',name:'Arrival',metadata:{release_year:2016},ranking:{score:.25,ranks:{'friend-1':1,'friend-2':2}}}],explanations:[],events:[]};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url==='/api/session')return {ok:true,json:async()=>({action_token:'t'})};
    if(url.includes('/entities/search'))return {ok:true,json:async()=>[{entity_id:'seed',name:'Arrival',kind:'movie',year:2016}]};
    if(url==='/api/tastebridge/groups')return {ok:true,json:async()=>({version:5})};
    if(url==='/api/tastebridge/recommendations')return {ok:true,json:async()=>({run_id:`r${++requests}`})};
    return {ok:true,json:async()=>url.endsWith('/r1')?completed:{...completed,run_id:'r2',status,candidates:[],error_code:status==='rate_limited'?'model_attempt_limit':null}};
  }));
  render(<TasteBridgePage/>);
  for(let i=0;i<2;i++){
    fireEvent.change(screen.getAllByLabelText('Search preference')[i],{target:{value:'Arrival'}});
    fireEvent.click(await screen.findByRole('button',{name:'Select Arrival (2016)'}));
  }
  fireEvent.click(screen.getByRole('button',{name:'Find our movie'}));
  fireEvent.click(await screen.findByRole('button',{name:"I've seen this: Arrival"}));
  await waitFor(()=>expect(requests).toBe(2));
  await waitFor(()=>expect(screen.getByText(/Showing your previous shortlist/)).toBeVisible());
  expect(screen.getByText('Arrival',{selector:'h3'})).toBeVisible();
  expect(screen.queryByText(/No films were returned/)).not.toBeInTheDocument();
  if(status==='running')expect(screen.getByRole('button',{name:"I've seen this: Arrival"})).toBeDisabled();
  if(status==='rate_limited')expect(screen.getByRole('alert')).toHaveTextContent(/limit/i);
});
