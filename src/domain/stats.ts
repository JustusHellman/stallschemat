import { addDays, weekId } from './dates';
import { buildDay } from './schedule';
import type { Config, WeekDoc } from './types';

export interface PersonStats {
  personId: string;
  total: number;
  byType: Record<string, number>;
}

export interface Stats {
  from: string;
  to: string;
  /** Shift names in first-seen order (table columns). */
  types: string[];
  people: PersonStats[];
  totalSlots: number;
  freeSlots: number;
}

/**
 * Count shifts per person and shift type between two dates (inclusive).
 * Slots are grouped by name so weekday and weekend "Frukost" add up.
 */
export function computeStats(config: Config, weeks: Record<string, WeekDoc>, from: string, to: string): Stats {
  const epoch = new Date(0); // the "past" flag is irrelevant for stats
  const types: string[] = [];
  const byPerson = new Map<string, PersonStats>();
  for (const id of Object.keys(config.people)) byPerson.set(id, { personId: id, total: 0, byType: {} });
  let totalSlots = 0;
  let freeSlots = 0;

  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = buildDay(config, weeks[weekId(d)], d, null, epoch);
    for (const s of day.slots) {
      totalSlots++;
      if (!types.includes(s.slot.name)) types.push(s.slot.name);
      if (!s.assignee) {
        freeSlots++;
        continue;
      }
      let p = byPerson.get(s.assignee);
      if (!p) byPerson.set(s.assignee, (p = { personId: s.assignee, total: 0, byType: {} }));
      p.total++;
      p.byType[s.slot.name] = (p.byType[s.slot.name] ?? 0) + 1;
    }
  }

  const nameOf = (id: string) => config.people[id]?.name ?? '?';
  const people = [...byPerson.values()]
    .filter((p) => p.total > 0 || config.people[p.personId]?.active)
    .sort((a, b) => b.total - a.total || nameOf(a.personId).localeCompare(nameOf(b.personId), 'sv'));
  return { from, to, types, people, totalSlots, freeSlots };
}
