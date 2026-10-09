import {formatSchedule} from './presentation';

test('readable schedule preserves the selected timezone and year',()=>{
  expect(formatSchedule('2026-10-05T10:00:00+08:00','2026-10-05T11:00:00+08:00','Asia/Shanghai')).toEqual({date:'Mon, Oct 5, 2026',time:'10:00 – 11:00'});
  expect(formatSchedule('2026-10-05T02:00:00Z','2026-10-05T03:00:00Z','Asia/Shanghai').time).toBe('10:00 – 11:00');
});
test('incomplete dates stay visible without invented times',()=>{
  expect(formatSchedule(null,null,'Asia/Shanghai')).toEqual({date:'Time to be confirmed',time:'Unscheduled'});
});
test('readable schedule keeps explicit seconds and the ending year',()=>{
  expect(formatSchedule('2026-10-05T10:00:05+08:00','2026-10-05T10:00:55+08:00').time).toBe('10:00:05 – 10:00:55');
  expect(formatSchedule('2026-12-31T23:00:00+08:00','2027-01-01T01:00:00+08:00').time).toBe('23:00 – Jan 1, 2027, 01:00');
  expect(formatSchedule('2026-10-05T10:00:05.123456+08:00','2026-10-05T10:00:55.456789+08:00').time).toBe('10:00:05.123456 – 10:00:55.456789');
});
