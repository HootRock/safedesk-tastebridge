import {render,screen,fireEvent} from '@testing-library/react';
import {RecommendationCards} from './RecommendationCards';
const run={run_id:'r',status:'completed',group_version:1,mode:'test',candidates:[{entity_id:'a',name:'First film',metadata:{description:'First plot'},ranking:{score:.2,ranks:{a:1,b:2}}},{entity_id:'b',name:'Second film',metadata:{description:'Second plot'},ranking:{score:.1,ranks:{a:2,b:3}}}],explanations:[],events:[]};
test('poster workspace shows all candidates and details are revealed by explicit selection',()=>{
 render(<RecommendationCards run={run} onSeen={()=>{}}/>);
 expect(screen.getAllByRole('article',{name:/Film option:/})).toHaveLength(2);
 expect(screen.queryByText('Second plot')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Explore Second film'}));
 expect(screen.getByText('Second plot')).toBeVisible();
 expect(screen.queryByText('First plot')).not.toBeInTheDocument();
});

