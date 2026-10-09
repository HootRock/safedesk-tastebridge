import {render,screen,fireEvent,within} from '@testing-library/react';
import {vi} from 'vitest';
import {RecommendationCards} from './RecommendationCards';
import {TasteBridgePage} from './TasteBridgePage';
afterEach(()=>vi.unstubAllGlobals());
const run={run_id:'r',status:'completed',group_version:1,mode:'test',candidates:[{entity_id:'a',name:'First film',metadata:{},ranking:{score:.5,ranks:{'friend-1':2,'friend-2':null}}}],explanations:[],events:[]};
test('each poster shows whose candidate list returned it, without implying dislike',()=>{
 render(<RecommendationCards run={run} memberNames={{'friend-1':'Alex','friend-2':'Sam'}} onSeen={()=>{}}/>);
 const card=screen.getByRole('article',{name:'Film option: First film'});
 expect(within(card).getByText('In 1 of 2 lists')).toBeVisible();
 expect(within(card).getByText('Alex: candidate rank 2')).toBeInTheDocument();
 expect(within(card).getByText('Sam: not returned for them')).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'One film for Alex and Sam',level:2})).toBeVisible();
});
test('the fetch time is written in English whatever the system locale',()=>{
 render(<RecommendationCards run={{...run,fetched_at:'2026-10-08T12:00:00Z'}} memberNames={{'friend-1':'Alex','friend-2':'Sam'}} onSeen={()=>{}}/>);
 expect(screen.getByText(/^Data fetched Oct \d{1,2}, 2026, \d{1,2}:\d{2}\s?[AP]M · cached up to 15 minutes$/)).toBeInTheDocument();
});
test('readiness names the friends who still need a favorite',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url==='/api/session'?{action_token:'t'}:[{entity_id:'a',name:'Arrival',kind:'movie',year:2016}]})));
 render(<TasteBridgePage/>);
 expect(screen.getByText('0 of 2 ready · waiting for Alex and Sam')).toBeVisible();
 fireEvent.change(screen.getAllByLabelText('Search preference')[0],{target:{value:'Arrival'}});
 fireEvent.click(await screen.findByRole('button',{name:'Select Arrival (2016)'}));
 expect(screen.getByText('1 of 2 ready · waiting for Sam')).toBeVisible();
});
