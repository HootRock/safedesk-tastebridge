import {calendarDays,moveAnchor,segmentEvents,calendarClockChange} from './calendarModel';
test('week crosses a year boundary from Monday to Sunday',()=>{
 expect(calendarDays('2027-01-01','week')).toEqual(['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
});
test('month contains six complete weeks and advances Jan 31 safely',()=>{
 const days=calendarDays('2026-01-31','month');
 expect(days).toHaveLength(42);expect(days[0]).toBe('2025-12-29');expect(days[41]).toBe('2026-02-08');
 expect(moveAnchor('2026-01-31','month',1)).toBe('2026-02-28');
 expect(moveAnchor('2028-01-31','month',1)).toBe('2028-02-29');
});
test('event midnight end excludes the following day in the active timezone',()=>{
 const segments=segmentEvents([{title:'Late review',start_at:'2026-10-12T15:30:00Z',end_at:'2026-10-12T16:00:00Z'}],['2026-10-12','2026-10-13'],'Asia/Shanghai');
 expect(segments).toHaveLength(1);expect(segments[0]).toMatchObject({day:'2026-10-12',start:1410,end:1440});
});
test('cross-midnight event is split without losing either part',()=>{
 const segments=segmentEvents([{title:'Review',start_at:'2026-10-12T23:30:00+08:00',end_at:'2026-10-13T01:15:00+08:00'}],['2026-10-12','2026-10-13'],'Asia/Shanghai');
 expect(segments.map(s=>[s.day,s.start,s.end])).toEqual([['2026-10-12',1410,1440],['2026-10-13',0,75]]);
});
test('daylight saving uses wall-clock positions while preserving original instants',()=>{
 const segments=segmentEvents([{title:'DST',start_at:'2026-03-08T06:30:00Z',end_at:'2026-03-08T07:30:00Z'}],['2026-03-08'],'America/New_York');
 expect(segments[0]).toMatchObject({start:90,end:210});
 expect(segments[0].event.end_at).toBe('2026-03-08T07:30:00Z');
});
test('overlapping events use separate lanes and adjacent events share a lane',()=>{
 const events=[
 {title:'A',start_at:'2026-10-12T10:00:00+08:00',end_at:'2026-10-12T11:00:00+08:00'},
 {title:'B',start_at:'2026-10-12T10:30:00+08:00',end_at:'2026-10-12T11:30:00+08:00'},
 {title:'C',start_at:'2026-10-12T11:30:00+08:00',end_at:'2026-10-12T12:00:00+08:00'}];
 const segments=segmentEvents(events,['2026-10-12'],'Asia/Shanghai');
 expect(segments[0].lane).not.toBe(segments[1].lane);expect(segments[0].lanes).toBe(2);expect(segments[2].lanes).toBe(1);
});
test('invalid and reversed events are not given invented calendar times',()=>{
 expect(segmentEvents([{title:'Bad',start_at:'invalid',end_at:'invalid'},{title:'Backwards',start_at:'2026-10-12T12:00:00Z',end_at:'2026-10-12T11:00:00Z'}],['2026-10-12'],'UTC')).toEqual([]);
});
test.each(['day','week','month'] as const)('fall-back clock reversal stays discoverable in %s',view=>{
 const event={title:'Repeated hour',start_at:'2026-11-01T05:45:00Z',end_at:'2026-11-01T06:15:00Z'};
 const segments=segmentEvents([event],calendarDays('2026-11-01',view),'America/New_York');
 expect(segments).toHaveLength(1);
 expect(segments[0]).toMatchObject({event,day:'2026-11-01',start:105,clockFold:true});
 expect(calendarClockChange(event,'America/New_York')).toEqual({start:'01:45 GMT-4',end:'01:15 GMT-5',elapsed:30});
});
test('equal wall-clock endpoints remain visible during the repeated hour',()=>{
 const event={title:'One actual hour',start_at:'2026-11-01T05:30:00Z',end_at:'2026-11-01T06:30:00Z'};
 expect(segmentEvents([event],['2026-11-01'],'America/New_York')).toHaveLength(1);
 expect(calendarClockChange(event,'America/New_York')?.elapsed).toBe(60);
});

