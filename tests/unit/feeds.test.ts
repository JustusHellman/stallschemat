import { describe, expect, it } from 'vitest';
import { buildCalendarFiles, feedRange } from '../../src/domain/feeds';
import { at, testConfig, week } from './helpers';

describe('calendar feeds', () => {
  it('covers 4 weeks back to the booking horizon', () => {
    const c = testConfig();
    const r = feedRange(c, at('2026-11-25 10:00'));
    expect(r.from).toBe('2026-10-28');
    expect(r.to).toBe('2027-01-10');
    expect(r.weekIds[0]).toBe('2026-W44');
    expect(r.weekIds.at(-1)).toBe('2027-W01');
  });

  it('writes one file per person (also inactive/without shifts) plus alla.ics', () => {
    const c = testConfig();
    const weeks = { '2026-W48': week({ assignments: { '2026-11-26_frukost': 'maja', '2026-11-26_utslapp': 'anna' } }) };
    const files = buildCalendarFiles(c, weeks, at('2026-11-25 10:00'));
    expect(Object.keys(files).sort()).toEqual(['cal/alla.ics', 'cal/anna.ics', 'cal/lars.ics', 'cal/lisa.ics', 'cal/maja.ics']);
    expect(files['cal/maja.ics']).toContain('X-WR-CALNAME:Stallschemat – Maja');
    expect(files['cal/maja.ics'].match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(files['cal/lisa.ics']).not.toContain('BEGIN:VEVENT');
    expect(files['cal/alla.ics'].match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
