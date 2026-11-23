import { describe, expect, it } from 'vitest';
import { applyMutation, errorMessage, genitive, MAX_LOG, mutationWeekId, type Ctx } from '../../src/domain/rules';
import { at, testConfig, week } from './helpers';

const ctx = (now = at('2026-11-22 12:00'), isAdmin = false): Ctx => ({ config: testConfig(), now, isAdmin });

describe('claim', () => {
  it('claims a free slot and logs it', () => {
    const r = applyMutation(week(), { type: 'claim', key: '2026-11-23_frukost', person: 'maja' }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toBe(true);
    expect(r.week.assignments['2026-11-23_frukost']).toBe('maja');
    expect(r.week.log[0]).toMatchObject({ actor: 'maja', action: 'claim', key: '2026-11-23_frukost', person: 'maja' });
  });

  it('does not mutate the input', () => {
    const w = week();
    applyMutation(w, { type: 'claim', key: '2026-11-23_frukost', person: 'maja' }, ctx());
    expect(w.assignments).toEqual({});
    expect(w.log).toEqual([]);
  });

  it('refuses a slot someone else took (double-booking protection)', () => {
    const w = week({ assignments: { '2026-11-23_frukost': 'anna' } });
    const r = applyMutation(w, { type: 'claim', key: '2026-11-23_frukost', person: 'maja' }, ctx());
    expect(r).toEqual({ ok: false, error: { code: 'taken', by: 'anna' } });
  });

  it('is a no-op when claiming own slot again', () => {
    const w = week({ assignments: { '2026-11-23_frukost': 'maja' } });
    const r = applyMutation(w, { type: 'claim', key: '2026-11-23_frukost', person: 'maja' }, ctx());
    expect(r).toMatchObject({ ok: true, changed: false });
  });

  it('refuses past slots for normal users but allows admin', () => {
    const m = { type: 'claim', key: '2026-11-23_frukost', person: 'maja' } as const;
    expect(applyMutation(week(), m, ctx(at('2026-11-23 09:00')))).toEqual({ ok: false, error: { code: 'past' } });
    expect(applyMutation(week(), m, ctx(at('2026-11-23 09:00'), true)).ok).toBe(true);
  });

  it('refuses slots beyond the horizon', () => {
    // weeksAhead 6 from week 47 -> last bookable day is Sunday of week 53 (2027-01-03)
    expect(applyMutation(week(), { type: 'claim', key: '2027-01-03_frukost', person: 'maja' }, ctx()).ok).toBe(true);
    expect(applyMutation(week(), { type: 'claim', key: '2027-01-04_frukost', person: 'maja' }, ctx())).toEqual({
      ok: false, error: { code: 'horizon' },
    });
  });

  it('refuses unknown slots (e.g. weekend-only shift on a weekday)', () => {
    expect(applyMutation(week(), { type: 'claim', key: '2026-11-23_mockning', person: 'maja' }, ctx())).toEqual({
      ok: false, error: { code: 'notFound' },
    });
    expect(applyMutation(week(), { type: 'claim', key: '2026-11-28_mockning', person: 'maja' }, ctx()).ok).toBe(true);
  });

  it('refuses mutations sent to the wrong week document', () => {
    const r = applyMutation(week(), { type: 'claim', key: '2026-11-23_frukost', person: 'maja' }, ctx(), '2026-W49');
    expect(r).toEqual({ ok: false, error: { code: 'wrongWeek' } });
    expect(mutationWeekId({ type: 'setDay', date: '2026-11-29', day: null, actor: 'x' })).toBe('2026-W48');
  });
});

describe('release', () => {
  it('releases own slot', () => {
    const w = week({ assignments: { '2026-11-23_frukost': 'maja' } });
    const r = applyMutation(w, { type: 'release', key: '2026-11-23_frukost', person: 'maja' }, ctx());
    expect(r.ok && r.week.assignments).toEqual({});
    expect(r.ok && r.week.log[0].action).toBe('release');
  });

  it("cannot release someone else's slot unless admin", () => {
    const w = week({ assignments: { '2026-11-23_frukost': 'anna' } });
    const m = { type: 'release', key: '2026-11-23_frukost', person: 'maja' } as const;
    expect(applyMutation(w, m, ctx())).toEqual({ ok: false, error: { code: 'notYours', by: 'anna' } });
    expect(applyMutation(w, m, ctx(undefined, true)).ok).toBe(true);
  });

  it('cannot release a past slot', () => {
    const w = week({ assignments: { '2026-11-23_frukost': 'maja' } });
    const r = applyMutation(w, { type: 'release', key: '2026-11-23_frukost', person: 'maja' }, ctx(at('2026-11-23 10:00')));
    expect(r).toEqual({ ok: false, error: { code: 'past' } });
  });

  it('is a no-op on a free slot', () => {
    expect(applyMutation(week(), { type: 'release', key: '2026-11-23_frukost', person: 'maja' }, ctx())).toMatchObject({
      ok: true, changed: false,
    });
  });
});

describe('admin assign + day changes', () => {
  it('assigns and unassigns as admin', () => {
    const c = ctx(undefined, true);
    const r1 = applyMutation(week(), { type: 'assign', key: '2026-11-23_frukost', person: 'lisa', actor: 'admin' }, c);
    expect(r1.ok && r1.week.assignments['2026-11-23_frukost']).toBe('lisa');
    if (!r1.ok) return;
    const r2 = applyMutation(r1.week, { type: 'assign', key: '2026-11-23_frukost', person: null, actor: 'admin' }, c);
    expect(r2.ok && r2.week.assignments).toEqual({});
    expect(r2.ok && r2.week.log.map((l) => l.action)).toEqual(['assign', 'unassign']);
    expect(r2.ok && r2.week.log[1].person).toBe('lisa');
  });

  it('refuses assign for non-admins', () => {
    const r = applyMutation(week(), { type: 'assign', key: '2026-11-23_frukost', person: 'lisa', actor: 'maja' }, ctx());
    expect(r.ok).toBe(false);
  });

  it('sets and resets a day override', () => {
    const day = { slots: [{ id: 'hov', name: 'Hovslagare', time: '10:00', duration: 60 }] };
    const r1 = applyMutation(week(), { type: 'setDay', date: '2026-11-25', day, actor: 'admin' }, ctx(undefined, true));
    expect(r1.ok && r1.week.days['2026-11-25']).toEqual(day);
    if (!r1.ok) return;
    // the new slot can now be claimed
    const r2 = applyMutation(r1.week, { type: 'claim', key: '2026-11-25_hov', person: 'maja' }, ctx());
    expect(r2.ok).toBe(true);
    const r3 = applyMutation(r1.week, { type: 'setDay', date: '2026-11-25', day: null, actor: 'admin' }, ctx(undefined, true));
    expect(r3.ok && r3.week.days).toEqual({});
    expect(r3.ok && r3.week.log.at(-1)!.action).toBe('resetDay');
  });

  it('caps the log', () => {
    let w = week();
    const c = ctx(undefined, true);
    for (let i = 0; i < MAX_LOG + 20; i++) {
      const r = applyMutation(w, { type: 'assign', key: '2026-11-23_frukost', person: i % 2 ? 'anna' : 'lisa', actor: 'admin' }, c);
      if (r.ok) w = r.week;
    }
    expect(w.log).toHaveLength(MAX_LOG);
  });
});

describe('messages', () => {
  const nameOf = (id: string) => ({ anna: 'Anna', lars: 'Lars' })[id] ?? '?';
  it('uses Swedish genitive', () => {
    expect(genitive('Lisa')).toBe('Lisas');
    expect(genitive('Lars')).toBe('Lars');
    expect(errorMessage({ code: 'notYours', by: 'lars' }, nameOf)).toBe('Passet är Lars.');
  });
  it('has a message for every error', () => {
    for (const e of [
      { code: 'taken', by: 'anna' }, { code: 'past' }, { code: 'horizon' }, { code: 'notFound' },
      { code: 'notYours', by: null }, { code: 'wrongWeek' },
    ] as const) {
      expect(errorMessage(e, nameOf).length).toBeGreaterThan(5);
    }
    expect(errorMessage({ code: 'taken', by: 'anna' }, nameOf)).toContain('Anna');
  });
});
