import { isISODate, isValidTime } from './dates';
import { defaultConfig, MAX_WEEKS_AHEAD } from './defaults';
import type { Config, Slot, WeekDoc } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Make a possibly partial / missing config document safe to use. */
export function normalizeConfig(raw: unknown): Config {
  const def = defaultConfig();
  if (!isObj(raw)) return def;
  const people: Config['people'] = {};
  if (isObj(raw.people)) {
    for (const [id, p] of Object.entries(raw.people)) {
      if (isObj(p) && typeof p.name === 'string') {
        people[id] = { name: p.name, color: typeof p.color === 'string' ? p.color : '#8d6e63', active: p.active !== false };
      }
    }
  }
  const templates = Array.isArray(raw.templates) && raw.templates.length ? (raw.templates as Config['templates']) : def.templates;
  const wa = typeof raw.weeksAhead === 'number' ? Math.min(MAX_WEEKS_AHEAD, Math.max(1, Math.round(raw.weeksAhead))) : def.weeksAhead;
  return { people, templates, weeksAhead: wa, adminHash: typeof raw.adminHash === 'string' ? raw.adminHash : null };
}

export function normalizeWeek(raw: unknown): WeekDoc {
  if (!isObj(raw)) return { assignments: {}, days: {}, log: [] };
  return {
    assignments: isObj(raw.assignments) ? (raw.assignments as WeekDoc['assignments']) : {},
    days: isObj(raw.days) ? (raw.days as WeekDoc['days']) : {},
    log: Array.isArray(raw.log) ? (raw.log as WeekDoc['log']) : [],
  };
}

/** Returns a Swedish error message, or null if the slot list is valid. */
export function validateSlots(slots: Slot[]): string | null {
  const ids = new Set<string>();
  for (const s of slots) {
    if (!s.name.trim()) return 'Alla pass måste ha ett namn.';
    if (s.name.length > 40) return 'Passnamnet är för långt.';
    if (!isValidTime(s.time)) return `Ogiltig tid för "${s.name}" (använd TT:MM).`;
    if (!Number.isInteger(s.duration) || s.duration < 5 || s.duration > 720) return `Ogiltig längd för "${s.name}".`;
    if (ids.has(s.id)) return 'Dubblett-id bland passen.';
    ids.add(s.id);
  }
  if (slots.length > 12) return 'Max 12 pass per dag.';
  return null;
}

export function validateValidFrom(date: string): string | null {
  return isISODate(date) ? null : 'Ogiltigt datum.';
}

export function validatePersonName(name: string, existing: string[]): string | null {
  const n = name.trim();
  if (!n) return 'Skriv ett namn.';
  if (n.length > 24) return 'Namnet är för långt (max 24 tecken).';
  if (existing.some((e) => e.toLocaleLowerCase('sv') === n.toLocaleLowerCase('sv'))) return 'Det namnet finns redan.';
  return null;
}
