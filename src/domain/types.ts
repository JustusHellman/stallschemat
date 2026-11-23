/** A single shift ("pass"), e.g. Frukost 06:30. */
export interface Slot {
  id: string;
  name: string;
  /** Local time, "HH:MM". */
  time: string;
  /** Duration in minutes (used for calendar events). */
  duration: number;
}

export interface Person {
  name: string;
  color: string;
  /** Inactive people are hidden from pickers but kept for history. */
  active: boolean;
}

/** A version of the base schedule, valid from a date (inclusive) until the next version. */
export interface Template {
  validFrom: string; // YYYY-MM-DD
  weekday: Slot[];
  weekend: Slot[];
}

/** Document: config/main */
export interface Config {
  people: Record<string, Person>;
  templates: Template[];
  weeksAhead: number;
  /** SHA-256 hex of the admin code, or null if not yet set. */
  adminHash: string | null;
}

/** A single day that differs from the base schedule. */
export interface DayOverride {
  slots: Slot[];
  note?: string;
}

export type LogAction = 'claim' | 'release' | 'assign' | 'unassign' | 'day' | 'resetDay';

export interface LogEntry {
  at: number;
  /** Person id of whoever made the change ("admin" for admin actions without identity). */
  actor: string;
  action: LogAction;
  /** Assignment key (date_slotId) or date for day changes. */
  key: string;
  /** Person affected (for assignment actions). */
  person?: string;
}

/** Document: weeks/{YYYY-Www} */
export interface WeekDoc {
  /** key "YYYY-MM-DD_slotId" -> person id */
  assignments: Record<string, string>;
  days: Record<string, DayOverride>;
  log: LogEntry[];
}

export const emptyWeek = (): WeekDoc => ({ assignments: {}, days: {}, log: [] });
