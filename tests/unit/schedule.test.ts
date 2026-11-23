import { describe, expect, it } from 'vitest';
import { DEFAULT_WEEKDAY, DEFAULT_WEEKEND } from '../../src/domain/defaults';
import {
  assignmentKey, buildDay, buildWeek, horizonEnd, isSlotPast, parseAssignmentKey, slotsFor, sortSlots,
  syncedWeekIds, templateFor, templateSlotsFor, upcomingSlots,
} from '../../src/domain/schedule';
import { at, testConfig, week } from './helpers';

describe('schedule', () => {
  it('builds and parses assignment keys (slot ids may contain underscores)', () => {
    expect(assignmentKey('2026-11-23', 'frukost')).toBe('2026-11-23_frukost');
    expect(parseAssignmentKey('2026-11-23_extra_pass')).toEqual({ date: '2026-11-23', slotId: 'extra_pass' });
  });

  it('uses the default weekday and weekend schedules', () => {
    const c = testConfig();
    expect(templateSlotsFor(c, '2026-11-23').map((s) => s.name)).toEqual(['Frukost', 'Utsläpp', 'Insläpp', 'Kvällsmat']);
    expect(templateSlotsFor(c, '2026-11-28').map((s) => s.name)).toEqual([
      'Frukost', 'Utsläpp', 'Mockning+lunch', 'Insläpp', 'Kvällsmat',
    ]);
    expect(DEFAULT_WEEKDAY).toHaveLength(4);
    expect(DEFAULT_WEEKEND).toHaveLength(5);
  });

  it('picks the template version valid on a date', () => {
    const c = testConfig();
    const v2 = { validFrom: '2026-12-01', weekday: [{ id: 'x', name: 'X', time: '10:00', duration: 30 }], weekend: [] };
    c.templates.push(v2);
    expect(templateFor(c.templates, '2026-11-30')).toBe(c.templates[0]);
    expect(templateFor(c.templates, '2026-12-01')).toBe(v2);
    expect(templateFor(c.templates, '2027-06-01')).toBe(v2);
    // Before the first version: fall back to the earliest.
    expect(templateFor([v2], '2020-01-01')).toBe(v2);
  });

  it('applies single-day changes', () => {
    const c = testConfig();
    const w = week({ days: { '2026-11-25': { slots: [{ id: 'hov', name: 'Hovslagare', time: '10:00', duration: 60 }], note: 'Hovslagare kommer' } } });
    expect(slotsFor(c, w, '2026-11-25').map((s) => s.id)).toEqual(['hov']);
    expect(slotsFor(c, w, '2026-11-24').map((s) => s.id)).toEqual(['frukost', 'utslapp', 'inslapp', 'kvallsmat']);
    const day = buildDay(c, w, '2026-11-25', null, at('2026-11-22 12:00'));
    expect(day.changed).toBe(true);
    expect(day.note).toBe('Hovslagare kommer');
  });

  it('sorts slots by time', () => {
    const s = sortSlots([
      { id: 'b', name: 'B', time: '18:00', duration: 30 },
      { id: 'a', name: 'A', time: '06:00', duration: 30 },
    ]);
    expect(s.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('marks slots as mine, free or taken', () => {
    const c = testConfig();
    const w = week({ assignments: { '2026-11-23_frukost': 'maja', '2026-11-23_utslapp': 'anna' } });
    const day = buildDay(c, w, '2026-11-23', 'maja', at('2026-11-22 12:00'));
    expect(day.slots.map((s) => s.status)).toEqual(['mine', 'taken', 'free', 'free']);
    expect(day.slots[1].assignee).toBe('anna');
  });

  it('knows when a slot is past (after it ends)', () => {
    const slot = { id: 'f', name: 'F', time: '06:30', duration: 30 };
    expect(isSlotPast('2026-11-23', slot, at('2026-11-23 06:59'))).toBe(false);
    expect(isSlotPast('2026-11-23', slot, at('2026-11-23 07:00'))).toBe(true);
  });

  it('builds a week with counts of free and own upcoming slots', () => {
    const c = testConfig();
    const w = week({ assignments: { '2026-11-23_frukost': 'maja', '2026-11-24_frukost': 'maja', '2026-11-24_utslapp': 'anna' } });
    const v = buildWeek(c, w, '2026-W48', 'maja', at('2026-11-23 12:00'));
    expect(v.monday).toBe('2026-11-23');
    expect(v.days).toHaveLength(7);
    expect(v.days[0].isToday).toBe(true);
    // 5 weekdays * 4 + 2 weekend days * 5 = 30 slots; Monday frukost+utslapp are past.
    expect(v.mineCount).toBe(1);
    expect(v.freeCount).toBe(30 - 2 - 2);
  });

  it('computes the booking horizon and synced weeks', () => {
    const now = at('2026-11-25 12:00'); // Wednesday week 48
    expect(horizonEnd(now, 6)).toBe('2027-01-10'); // Sunday of week 48+6 (2026 has 53 weeks)
    expect(syncedWeekIds(now, 2)).toEqual(['2026-W48', '2026-W49', '2026-W50']);
  });

  it('lists upcoming slots chronologically', () => {
    const c = testConfig();
    c.weeksAhead = 1;
    const weeks = { '2026-W48': week({ assignments: { '2026-11-29_kvallsmat': 'maja' } }) };
    const up = upcomingSlots(c, weeks, 'maja', at('2026-11-29 17:00'));
    expect(up[0].key).toBe('2026-11-29_kvallsmat');
    expect(up[0].status).toBe('mine');
    expect(up[1].date).toBe('2026-11-30');
    expect(up.at(-1)!.date).toBe('2026-12-06');
  });
});
