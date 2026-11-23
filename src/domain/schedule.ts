import { addDays, isWeekend, localDateTime, localISODate, weekDates, weekId, weekIdToMonday, weekStart } from './dates';
import type { Config, Slot, Template, WeekDoc } from './types';
import { emptyWeek } from './types';

export const assignmentKey = (date: string, slotId: string) => `${date}_${slotId}`;

export function parseAssignmentKey(key: string): { date: string; slotId: string } {
  const i = key.indexOf('_');
  return { date: key.slice(0, i), slotId: key.slice(i + 1) };
}

/** The template version in effect on a date (latest validFrom <= date). */
export function templateFor(templates: Template[], date: string): Template {
  const sorted = [...templates].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  let found: Template | undefined;
  for (const t of sorted) if (t.validFrom <= date) found = t;
  return found ?? sorted[0];
}

export function sortSlots(slots: Slot[]): Slot[] {
  return [...slots].sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name, 'sv'));
}

/** The base-schedule slots for a date (ignoring single-day changes). */
export function templateSlotsFor(config: Config, date: string): Slot[] {
  const t = templateFor(config.templates, date);
  return sortSlots(isWeekend(date) ? t.weekend : t.weekday);
}

/** Slots for a date, taking single-day changes into account. */
export function slotsFor(config: Config, week: WeekDoc | undefined, date: string): Slot[] {
  const override = week?.days?.[date];
  return override ? sortSlots(override.slots) : templateSlotsFor(config, date);
}

export type SlotStatus = 'mine' | 'free' | 'taken';

export interface SlotView {
  key: string;
  date: string;
  slot: Slot;
  assignee: string | null;
  status: SlotStatus;
  past: boolean;
}

export interface DayView {
  date: string;
  weekend: boolean;
  changed: boolean;
  note?: string;
  isToday: boolean;
  past: boolean;
  slots: SlotView[];
}

export interface WeekView {
  id: string;
  monday: string;
  days: DayView[];
  freeCount: number;
  mineCount: number;
}

export function isSlotPast(date: string, slot: Slot, now: Date): boolean {
  return localDateTime(date, slot.time).getTime() + slot.duration * 60000 <= now.getTime();
}

export function buildDay(config: Config, week: WeekDoc | undefined, date: string, me: string | null, now: Date): DayView {
  const today = localISODate(now);
  const w = week ?? emptyWeek();
  const slots = slotsFor(config, w, date).map((slot): SlotView => {
    const key = assignmentKey(date, slot.id);
    const assignee = w.assignments[key] ?? null;
    const status: SlotStatus = assignee === null ? 'free' : assignee === me ? 'mine' : 'taken';
    return { key, date, slot, assignee, status, past: isSlotPast(date, slot, now) };
  });
  return {
    date,
    weekend: isWeekend(date),
    changed: !!w.days[date],
    note: w.days[date]?.note,
    isToday: date === today,
    past: date < today,
    slots,
  };
}

export function buildWeek(config: Config, week: WeekDoc | undefined, id: string, me: string | null, now: Date): WeekView {
  const monday = weekIdToMonday(id);
  const days = weekDates(monday).map((d) => buildDay(config, week, d, me, now));
  const upcoming = days.flatMap((d) => d.slots).filter((s) => !s.past);
  return {
    id,
    monday,
    days,
    freeCount: upcoming.filter((s) => s.status === 'free').length,
    mineCount: upcoming.filter((s) => s.status === 'mine').length,
  };
}

/** Last date that can be booked: end of the week `weeksAhead` weeks after the current week. */
export function horizonEnd(now: Date, weeksAhead: number): string {
  return addDays(weekStart(localISODate(now)), (weeksAhead + 1) * 7 - 1);
}

/** Week ids the app keeps in sync: current week + weeksAhead. */
export function syncedWeekIds(now: Date, weeksAhead: number): string[] {
  const start = weekStart(localISODate(now));
  return Array.from({ length: weeksAhead + 1 }, (_, i) => weekId(addDays(start, i * 7)));
}

/** All upcoming (not past) slots across the given weeks, chronologically. */
export function upcomingSlots(config: Config, weeks: Record<string, WeekDoc>, me: string | null, now: Date): SlotView[] {
  return syncedWeekIds(now, config.weeksAhead)
    .flatMap((id) => buildWeek(config, weeks[id], id, me, now).days.flatMap((d) => d.slots))
    .filter((s) => !s.past)
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot.time.localeCompare(b.slot.time));
}
