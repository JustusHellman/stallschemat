import { parseAssignmentKey, slotsFor } from './schedule';
import type { Config, Template, WeekDoc } from './types';

/** Insert a template version (replacing one with the same validFrom). */
export function withTemplate(config: Config, t: Template): Config {
  const templates = config.templates.filter((x) => x.validFrom !== t.validFrom);
  templates.push(t);
  templates.sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  return { ...config, templates };
}

/**
 * Assignments that would disappear if `next` config were used
 * (their slot no longer exists on that date). Used to warn the admin.
 */
export function orphanedAssignments(current: Config, next: Config, weeks: Record<string, WeekDoc>): string[] {
  const out: string[] = [];
  for (const week of Object.values(weeks)) {
    for (const key of Object.keys(week.assignments)) {
      const { date, slotId } = parseAssignmentKey(key);
      const before = slotsFor(current, week, date).some((s) => s.id === slotId);
      const after = slotsFor(next, week, date).some((s) => s.id === slotId);
      if (before && !after) out.push(key);
    }
  }
  return out.sort();
}
