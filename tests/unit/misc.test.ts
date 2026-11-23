import { describe, expect, it } from 'vitest';
import { orphanedAssignments, withTemplate } from '../../src/domain/admin';
import { defaultConfig, randomId } from '../../src/domain/defaults';
import { buildCalendar, collectEvents, escapeText, foldLine, icsLocal } from '../../src/domain/ics';
import { computeStats } from '../../src/domain/stats';
import { weekAsText } from '../../src/domain/text';
import { hashAdminCode, isHexColor, sha256, textColorFor } from '../../src/domain/util';
import { normalizeConfig, normalizeWeek, validatePersonName, validateSlots, validateValidFrom } from '../../src/domain/validate';
import { testConfig, week } from './helpers';

describe('stats', () => {
  it('counts per person and shift type, merging weekday/weekend names', () => {
    const c = testConfig();
    const weeks = {
      '2026-W48': week({
        assignments: {
          '2026-11-23_frukost': 'maja',
          '2026-11-28_frukost': 'maja',
          '2026-11-28_mockning': 'anna',
          '2026-11-29_kvallsmat': 'lars', // inactive but has shifts -> included
        },
      }),
    };
    const s = computeStats(c, weeks, '2026-11-23', '2026-11-29');
    expect(s.totalSlots).toBe(30);
    expect(s.freeSlots).toBe(26);
    expect(s.types).toEqual(['Frukost', 'Utsläpp', 'Insläpp', 'Kvällsmat', 'Mockning+lunch']);
    expect(s.people.map((p) => p.personId)).toEqual(['maja', 'anna', 'lars', 'lisa']);
    expect(s.people[0]).toEqual({ personId: 'maja', total: 2, byType: { Frukost: 2 } });
  });

  it('includes unknown (deleted) people with assignments', () => {
    const s = computeStats(testConfig(), { '2026-W48': week({ assignments: { '2026-11-23_frukost': 'ghost' } }) }, '2026-11-23', '2026-11-23');
    expect(s.people.find((p) => p.personId === 'ghost')?.total).toBe(1);
  });
});

describe('ics', () => {
  it('escapes and folds per RFC 5545', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const long = 'SUMMARY:' + 'å'.repeat(60);
    const folded = foldLine(long);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
    expect(foldLine('short')).toBe('short');
  });

  it('formats local times and rolls over midnight', () => {
    expect(icsLocal('2026-11-23', '06:30')).toBe('20261123T063000');
    expect(icsLocal('2026-11-23', '23:30', 60)).toBe('20261124T003000');
  });

  it('builds a personal calendar with only that person’s shifts', () => {
    const c = testConfig();
    const weeks = {
      '2026-W48': week({
        assignments: { '2026-11-23_frukost': 'maja', '2026-11-23_utslapp': 'anna' },
        days: {},
      }),
    };
    const events = collectEvents(c, weeks, '2026-11-23', '2026-11-29', 'maja');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: '2026-11-23', time: '06:30', duration: 30, summary: '🐴 Frukost' });
    const ics = buildCalendar('Stall – Maja', events, new Date(Date.UTC(2026, 10, 22, 12)));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART;TZID=Europe/Stockholm:20261123T063000');
    expect(ics).toContain('DTEND;TZID=Europe/Stockholm:20261123T070000');
    expect(ics).toContain('UID:2026-11-23_frukost-maja@stallschemat');
    expect(ics).toContain('DTSTAMP:20261122T120000Z');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
  });

  it('builds an all-shifts calendar with names', () => {
    const weeks = { '2026-W48': week({ assignments: { '2026-11-23_frukost': 'maja' }, days: { '2026-11-24': { slots: [], note: 'x' } } }) };
    const events = collectEvents(testConfig(), weeks, '2026-11-23', '2026-11-29');
    expect(events.map((e) => e.summary)).toEqual(['Frukost – Maja']);
  });
});

describe('text export', () => {
  it('lists the week with names and free slots', () => {
    const c = testConfig();
    const txt = weekAsText(c, week({ assignments: { '2026-11-23_frukost': 'maja' }, days: { '2026-11-25': { slots: [], note: 'Stängt' } } }), '2026-W48');
    expect(txt).toContain('v.48 (23–29 nov)');
    expect(txt).toContain('06:30 Frukost: Maja');
    expect(txt).toContain('Utsläpp: ❗ LEDIGT');
    expect(txt).toContain('Ons 25 – Stängt');
    expect(txt).toContain('25 pass är fortfarande lediga.');
  });

  it('pluralizes free counts', async () => {
    const { freeLabel } = await import('../../src/domain/text');
    expect(freeLabel(1)).toBe('1 ledigt pass');
    expect(freeLabel(3)).toBe('3 lediga pass');
  });

  it('thanks everyone when full', () => {
    const c = testConfig();
    c.templates[0].weekday = [];
    c.templates[0].weekend = [];
    expect(weekAsText(c, week(), '2026-W48')).toContain('Alla pass är tagna');
  });
});

describe('admin helpers', () => {
  it('replaces template with the same date and keeps order', () => {
    const c = defaultConfig();
    const t = { validFrom: '2026-12-01', weekday: [], weekend: [] };
    const c2 = withTemplate(withTemplate(c, t), { ...t, weekday: [{ id: 'a', name: 'A', time: '10:00', duration: 30 }] });
    expect(c2.templates.map((x) => x.validFrom)).toEqual(['2000-01-01', '2026-12-01']);
    expect(c2.templates[1].weekday).toHaveLength(1);
    expect(c.templates).toHaveLength(1); // not mutated
  });

  it('detects assignments orphaned by a template change', () => {
    const c = testConfig();
    const next = withTemplate(c, {
      validFrom: '2026-11-25',
      weekday: c.templates[0].weekday.filter((s) => s.id !== 'kvallsmat'),
      weekend: c.templates[0].weekend,
    });
    const weeks = {
      '2026-W48': week({
        assignments: { '2026-11-24_kvallsmat': 'maja', '2026-11-26_kvallsmat': 'anna', '2026-11-26_frukost': 'anna', '2026-11-27_kvallsmat': 'lisa' },
        days: { '2026-11-27': { slots: [{ id: 'kvallsmat', name: 'Kvällsmat', time: '19:00', duration: 30 }] } },
      }),
    };
    expect(orphanedAssignments(c, next, weeks)).toEqual(['2026-11-26_kvallsmat']);
  });
});

describe('util + validation', () => {
  it('hashes', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hashAdminCode(' 1234 ')).toBe(await hashAdminCode('1234'));
    expect(await hashAdminCode('1234')).not.toBe(await sha256('1234'));
  });

  it('picks readable text colours', () => {
    expect(textColorFor('#000000')).toBe('#ffffff');
    expect(textColorFor('#ffffff')).toBe('#1f1a16');
    expect(textColorFor('#f2a541')).toBe('#1f1a16'); // yellow-ish -> dark text
    expect(textColorFor('#34495e')).toBe('#ffffff');
    expect(textColorFor('bad')).toBe('#ffffff');
    expect(isHexColor('#a1B2c3')).toBe(true);
    expect(isHexColor('red')).toBe(false);
  });

  it('generates random ids', () => {
    const a = randomId();
    expect(a).toMatch(/^[a-z2-9]{10}$/);
    expect(randomId()).not.toBe(a);
  });

  it('normalizes missing or partial documents', () => {
    expect(normalizeConfig(undefined)).toEqual(defaultConfig());
    const c = normalizeConfig({ people: { x: { name: 'X' }, bad: 5 }, weeksAhead: 99 });
    expect(c.people).toEqual({ x: { name: 'X', color: '#8d6e63', active: true } });
    expect(c.weeksAhead).toBe(12);
    expect(c.templates).toEqual(defaultConfig().templates);
    expect(normalizeWeek(null)).toEqual({ assignments: {}, days: {}, log: [] });
    expect(normalizeWeek({ assignments: { a: 'b' } })).toEqual({ assignments: { a: 'b' }, days: {}, log: [] });
  });

  it('validates slots, dates and names', () => {
    const ok = [{ id: 'a', name: 'A', time: '10:00', duration: 30 }];
    expect(validateSlots(ok)).toBeNull();
    expect(validateSlots([{ ...ok[0], name: ' ' }])).toMatch(/namn/);
    expect(validateSlots([{ ...ok[0], time: '25:00' }])).toMatch(/tid/);
    expect(validateSlots([{ ...ok[0], duration: 0 }])).toMatch(/längd/);
    expect(validateSlots([ok[0], ok[0]])).toMatch(/Dubblett/);
    expect(validateValidFrom('2026-11-30')).toBeNull();
    expect(validateValidFrom('x')).not.toBeNull();
    expect(validatePersonName('Maja', ['Anna'])).toBeNull();
    expect(validatePersonName('anna', ['Anna'])).toMatch(/finns/);
    expect(validatePersonName('', [])).toMatch(/namn/);
    expect(validatePersonName('x'.repeat(30), [])).toMatch(/långt/);
  });
});
