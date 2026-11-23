import { addDays, localISODate, weeksCovering } from './dates';
import { buildCalendar, collectEvents } from './ics';
import { horizonEnd } from './schedule';
import type { Config, WeekDoc } from './types';

/** How far back calendar feeds include past shifts. */
export const FEED_HISTORY_DAYS = 28;

export function feedRange(config: Config, now: Date): { from: string; to: string; weekIds: string[] } {
  const from = addDays(localISODate(now), -FEED_HISTORY_DAYS);
  const to = horizonEnd(now, config.weeksAhead);
  return { from, to, weekIds: weeksCovering(from, to) };
}

/**
 * All calendar files: one per person (cal/<id>.ics) plus cal/alla.ics.
 * A file is written for every person (also inactive) so subscribed links never break.
 */
export function buildCalendarFiles(config: Config, weeks: Record<string, WeekDoc>, now: Date): Record<string, string> {
  const { from, to } = feedRange(config, now);
  const files: Record<string, string> = {};
  for (const [id, p] of Object.entries(config.people)) {
    files[`cal/${id}.ics`] = buildCalendar(`Stallschemat – ${p.name}`, collectEvents(config, weeks, from, to, id), now);
  }
  files['cal/alla.ics'] = buildCalendar('Stallschemat – alla pass', collectEvents(config, weeks, from, to), now);
  return files;
}
