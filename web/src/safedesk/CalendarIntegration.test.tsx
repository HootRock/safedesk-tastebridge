import {render,screen,fireEvent} from '@testing-library/react';
import {SafeDeskPage} from './SafeDeskPage';

test('calendar can switch between a full 24-hour day, week and month',()=>{
 render(<SafeDeskPage/>);
 fireEvent.click(screen.getByRole('button',{name:'Day'}));
 expect(screen.getByText('00:00')).toBeVisible();
 expect(screen.getByText('23:00')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Week'}));
 expect(screen.getByRole('grid',{name:/Week schedule/})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Month'}));
 expect(screen.getByRole('grid',{name:/Month schedule/})).toBeVisible();
 expect(screen.getAllByRole('gridcell')).toHaveLength(42);
});
test('calendar dimensions do not enable or check approval',()=>{
 render(<SafeDeskPage/>);
 for(const name of ['Month','Day','Week'])fireEvent.click(screen.getByRole('button',{name}));
 expect(screen.getByRole('checkbox')).not.toBeChecked();
 expect(screen.getByRole('button',{name:'Confirm demo calendar'})).toBeDisabled();
});

