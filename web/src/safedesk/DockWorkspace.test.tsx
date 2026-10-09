import {render,screen,fireEvent} from '@testing-library/react';
import {DockWorkspace} from './DockWorkspace';
beforeEach(()=>localStorage.clear());
afterEach(()=>localStorage.clear());
const panels={tasks:<input aria-label="Unsaved task title" defaultValue="First title"/>,calendar:<p>Calendar content</p>,document:<p>Document content</p>};
test('keyboard docking persists arrangement and preserves unsaved panel input',()=>{
 const {container,unmount}=render(<DockWorkspace panels={panels}/>);
 fireEvent.change(screen.getByLabelText('Unsaved task title'),{target:{value:'Edited title'}});
 fireEvent.click(screen.getByText('Layout',{selector:'summary'}));
 fireEvent.change(screen.getByLabelText('Dock position'),{target:{value:'top'}});
 fireEvent.click(screen.getByRole('button',{name:'Move panel'}));
 expect([...container.querySelectorAll('[data-panel]')].map(e=>e.getAttribute('data-panel'))).toEqual(['document','tasks','calendar']);
 expect(screen.getByLabelText('Unsaved task title')).toHaveValue('Edited title');
 unmount();
 const restored=render(<DockWorkspace panels={panels}/>);
 expect([...restored.container.querySelectorAll('[data-panel]')].map(e=>e.getAttribute('data-panel'))).toEqual(['document','tasks','calendar']);
 fireEvent.click(screen.getByRole('button',{name:'Reset layout'}));
 expect([...restored.container.querySelectorAll('[data-panel]')].map(e=>e.getAttribute('data-panel'))).toEqual(['tasks','calendar','document']);
});
test('keyboard split resize changes the adjoining ratio and maximize restores all panels',()=>{
 render(<DockWorkspace panels={panels}/>);
 const split=screen.getAllByRole('separator')[0],before=Number(split.getAttribute('aria-valuenow'));
 fireEvent.keyDown(split,{key:'ArrowRight'});
 expect(Number(screen.getAllByRole('separator')[0].getAttribute('aria-valuenow'))).toBeGreaterThan(before);
 fireEvent.click(screen.getByRole('button',{name:'Maximize Demo calendar'}));
 expect(screen.getByText('Calendar content')).toBeVisible();
 expect(screen.getByText('Document content')).not.toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Restore Demo calendar'}));
 expect(screen.getByText('Document content')).toBeVisible();
});

test('layout menu stays open inside its form and dismisses on outside pointer or click',()=>{
 const {container}=render(<DockWorkspace panels={panels}/>);
 const menu=container.querySelector('details')!;
 fireEvent.click(screen.getByText('Layout',{selector:'summary'}));
 expect(menu).toHaveAttribute('open');
 fireEvent.pointerDown(screen.getByLabelText('Panel to move'));
 expect(menu).toHaveAttribute('open');
 fireEvent.pointerDown(screen.getByText('Calendar content'));
 expect(menu).not.toHaveAttribute('open');
 fireEvent.click(screen.getByText('Layout',{selector:'summary'}));
 fireEvent.click(screen.getByText('Document content'));
 expect(menu).not.toHaveAttribute('open');
});

test('Escape dismisses the layout menu and returns focus to its trigger',()=>{
 const {container}=render(<DockWorkspace panels={panels}/>);
 const trigger=screen.getByText('Layout',{selector:'summary'});
 fireEvent.click(trigger);
 screen.getByLabelText('Panel to move').focus();
 fireEvent.keyDown(screen.getByLabelText('Panel to move'),{key:'Escape'});
 expect(container.querySelector('details')).not.toHaveAttribute('open');
 expect(trigger).toHaveFocus();
});

test('clicking a panel move handle opens layout options for that panel',()=>{
 const {container}=render(<DockWorkspace panels={panels}/>);
 fireEvent.click(screen.getByRole('button',{name:'Drag Tasks panel'}));
 expect(container.querySelector('details')).toHaveAttribute('open');
 expect(screen.getByLabelText('Panel to move')).toHaveValue('tasks');
 expect(screen.getByLabelText('Target panel')).not.toHaveValue('tasks');
});

