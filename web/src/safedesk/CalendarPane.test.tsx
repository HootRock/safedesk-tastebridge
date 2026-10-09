import {render,screen,fireEvent,within} from '@testing-library/react';
import {CalendarPane} from './CalendarPane';
const event={title:'Late meeting',start_at:'2026-10-12T23:30:00+08:00',end_at:'2026-10-13T01:15:00+08:00'};
test('month event hover and focus reveal the exact cross-day time',()=>{
 render(<CalendarPane events={[event]} zone="Asia/Shanghai" referenceDate="2026-10-12"/>);
 fireEvent.click(screen.getByRole('button',{name:'Month'}));
 const buttons=screen.getAllByRole('button',{name:/Late meeting,/});
 fireEvent.mouseEnter(buttons[0]);
 expect(screen.getByRole('tooltip')).toHaveTextContent('23:30 – Oct 13, 01:15');
 expect(screen.getByRole('tooltip')).toHaveTextContent('Asia/Shanghai');
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
 fireEvent.focus(buttons[1]);expect(screen.getByRole('tooltip')).toHaveTextContent('Late meeting');
 fireEvent.click(buttons[1]);expect(screen.getByRole('dialog',{name:'Event details'})).toBeVisible();
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Close event details'}));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('view switching preserves an explicitly navigated calendar date',()=>{
 render(<CalendarPane events={[]} zone="UTC" referenceDate="2026-01-31"/>);
 fireEvent.click(screen.getByRole('button',{name:'Month'}));
 fireEvent.click(screen.getByRole('button',{name:'Next calendar period'}));
 expect(screen.getByText('February 2026')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Day'}));
 expect(screen.getByText('Sat, Feb 28, 2026')).toBeVisible();
});
test('clearing a reference date cannot crash the selected month view',()=>{
 const {rerender}=render(<CalendarPane events={[]} zone="UTC" referenceDate="2026-01-31"/>);
 fireEvent.click(screen.getByRole('button',{name:'Month'}));
 expect(()=>rerender(<CalendarPane events={[]} zone="UTC" referenceDate=""/>)).not.toThrow();
 expect(screen.getByRole('grid',{name:'Month schedule'})).toBeVisible();
});
test('fall-back marker opens exact offset endpoints and elapsed time in every calendar view',()=>{
 const fallBack={title:'Repeated hour',start_at:'2026-11-01T05:45:00Z',end_at:'2026-11-01T06:15:00Z'};
 render(<CalendarPane events={[fallBack]} zone="America/New_York" referenceDate="2026-11-01"/>);
 for(const view of ['Day','Week','Month']){
  fireEvent.click(screen.getByRole('button',{name:view}));
  fireEvent.click(screen.getByRole('button',{name:/Repeated hour,/}));
  const details=screen.getByRole('dialog',{name:'Event details'});
  expect(details).toHaveTextContent('01:45 GMT-4');
  expect(details).toHaveTextContent('01:15 GMT-5');
  expect(details).toHaveTextContent('30 min elapsed');
  fireEvent.click(within(details).getByRole('button',{name:'Close event details'}));
 }
});

