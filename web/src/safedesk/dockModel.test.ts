import {defaultLayout,dockPanel,panelOrder,validateLayout,resizeSplit} from './dockModel';
test.each(['left','right','top','bottom'] as const)('docking to %s never duplicates or loses a module',side=>{
 const moved=dockPanel(defaultLayout(),'document','tasks',side);
 expect([...panelOrder(moved)].sort()).toEqual(['calendar','document','tasks']);
 expect(moved).not.toEqual(defaultLayout());
});
test('self drop is harmless and a nested module can be moved again',()=>{
 const base=defaultLayout();expect(dockPanel(base,'tasks','tasks','left')).toEqual(base);
 const moved=dockPanel(dockPanel(base,'document','tasks','top'),'calendar','document','bottom');
 expect(panelOrder(moved)).toEqual(['document','calendar','tasks']);
});
test('corrupt layouts with duplicates or missing panels recover to a usable default',()=>{
 expect(validateLayout({type:'panel',panel:'tasks'})).toEqual(defaultLayout());
 expect(validateLayout({type:'split',id:'x',axis:'horizontal',ratio:0.5,first:{type:'panel',panel:'tasks'},second:{type:'panel',panel:'tasks'}})).toEqual(defaultLayout());
 expect(validateLayout(null)).toEqual(defaultLayout());
 expect(validateLayout(defaultLayout())).toEqual(defaultLayout());
});
test('resizing cannot hide an adjoining module',()=>{
 expect(resizeSplit(defaultLayout(),'main',0).type).toBe('split');
 const resized=resizeSplit(defaultLayout(),'main',2);
 expect(resized.type==='split'&&resized.ratio).toBe(.82);
});

