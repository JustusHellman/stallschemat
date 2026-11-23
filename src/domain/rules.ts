/**
 * Pure state transitions for a week document. The same functions are used by
 * the Firestore transaction and the in-memory backend, so double bookings are
 * prevented the same way everywhere.
 */
import { weekId } from './dates';
import { horizonEnd, isSlotPast, parseAssignmentKey, slotsFor } from './schedule';
import type { Config, DayOverride, LogEntry, WeekDoc } from './types';

export const MAX_LOG = 300;

export type MutationError =
  | { code: 'taken'; by: string }
  | { code: 'past' }
  | { code: 'horizon' }
  | { code: 'notFound' }
  | { code: 'notYours'; by: string | null }
  | { code: 'wrongWeek' };

export type MutationResult = { ok: true; week: WeekDoc; changed: boolean } | { ok: false; error: MutationError };

export type Mutation =
  | { type: 'claim'; key: string; person: string }
  | { type: 'release'; key: string; person: string }
  | { type: 'assign'; key: string; person: string | null; actor: string }
  | { type: 'setDay'; date: string; day: DayOverride | null; actor: string };

export interface Ctx {
  config: Config;
  now: Date;
  isAdmin: boolean;
}

function withLog(week: WeekDoc, entry: LogEntry): LogEntry[] {
  const log = [...(week.log ?? []), entry];
  return log.length > MAX_LOG ? log.slice(log.length - MAX_LOG) : log;
}

/** Week id a mutation belongs to. */
export function mutationWeekId(m: Mutation): string {
  return weekId(m.type === 'setDay' ? m.date : parseAssignmentKey(m.key).date);
}

export function applyMutation(week: WeekDoc, m: Mutation, ctx: Ctx, docWeekId?: string): MutationResult {
  if (docWeekId && mutationWeekId(m) !== docWeekId) return { ok: false, error: { code: 'wrongWeek' } };
  const at = ctx.now.getTime();

  if (m.type === 'setDay') {
    const days = { ...week.days };
    if (m.day) days[m.date] = m.day;
    else delete days[m.date];
    return {
      ok: true,
      changed: true,
      week: { ...week, days, log: withLog(week, { at, actor: m.actor, action: m.day ? 'day' : 'resetDay', key: m.date }) },
    };
  }

  const { date, slotId } = parseAssignmentKey(m.key);
  const slot = slotsFor(ctx.config, week, date).find((s) => s.id === slotId);
  if (!slot) return { ok: false, error: { code: 'notFound' } };
  const current = week.assignments[m.key] ?? null;
  const past = isSlotPast(date, slot, ctx.now);

  if (m.type === 'claim') {
    if (current === m.person) return { ok: true, week, changed: false };
    if (current !== null) return { ok: false, error: { code: 'taken', by: current } };
    if (past && !ctx.isAdmin) return { ok: false, error: { code: 'past' } };
    if (date > horizonEnd(ctx.now, ctx.config.weeksAhead) && !ctx.isAdmin) return { ok: false, error: { code: 'horizon' } };
    return {
      ok: true,
      changed: true,
      week: {
        ...week,
        assignments: { ...week.assignments, [m.key]: m.person },
        log: withLog(week, { at, actor: m.person, action: 'claim', key: m.key, person: m.person }),
      },
    };
  }

  if (m.type === 'release') {
    if (current === null) return { ok: true, week, changed: false };
    if (current !== m.person && !ctx.isAdmin) return { ok: false, error: { code: 'notYours', by: current } };
    if (past && !ctx.isAdmin) return { ok: false, error: { code: 'past' } };
    const assignments = { ...week.assignments };
    delete assignments[m.key];
    return {
      ok: true,
      changed: true,
      week: { ...week, assignments, log: withLog(week, { at, actor: m.person, action: 'release', key: m.key, person: current }) },
    };
  }

  // assign (admin)
  if (!ctx.isAdmin) return { ok: false, error: { code: 'notYours', by: current } };
  if (current === m.person) return { ok: true, week, changed: false };
  const assignments = { ...week.assignments };
  if (m.person) assignments[m.key] = m.person;
  else delete assignments[m.key];
  return {
    ok: true,
    changed: true,
    week: {
      ...week,
      assignments,
      log: withLog(week, {
        at,
        actor: m.actor,
        action: m.person ? 'assign' : 'unassign',
        key: m.key,
        person: m.person ?? current ?? undefined,
      }),
    },
  };
}

/** Swedish genitive: "Lisa" -> "Lisas", "Lars" -> "Lars". */
export function genitive(name: string): string {
  return /[sxz]$/i.test(name) ? name : `${name}s`;
}

/** Human readable (Swedish) error message. */
export function errorMessage(e: MutationError, nameOf: (id: string) => string): string {
  switch (e.code) {
    case 'taken':
      return `Hoppsan – ${nameOf(e.by)} hann före och tog passet.`;
    case 'past':
      return 'Passet har redan varit.';
    case 'horizon':
      return 'Det går inte att boka så långt fram än.';
    case 'notFound':
      return 'Passet finns inte längre (schemat kan ha ändrats).';
    case 'notYours':
      return e.by ? `Passet är ${genitive(nameOf(e.by))}.` : 'Passet är inte ditt.';
    case 'wrongWeek':
      return 'Internt fel: fel vecka.';
  }
}
