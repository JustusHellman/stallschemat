import { formatWeekRange, WEEKDAYS_SHORT, weekNumber } from './dates';
import { buildWeek } from './schedule';
import type { Config, WeekDoc } from './types';

/** Plain-text version of a week, for pasting into a group chat. */
export function weekAsText(config: Config, week: WeekDoc | undefined, id: string): string {
  const view = buildWeek(config, week, id, null, new Date(0));
  const lines = [`🐴 Stallschema v.${weekNumber(view.monday)} (${formatWeekRange(view.monday)})`];
  view.days.forEach((day, i) => {
    const d = +day.date.slice(8);
    lines.push('', `${WEEKDAYS_SHORT[i]} ${d}${day.note ? ` – ${day.note}` : ''}`);
    for (const s of day.slots) {
      const who = s.assignee ? config.people[s.assignee]?.name ?? '?' : '❗ LEDIGT';
      lines.push(`  ${s.slot.time} ${s.slot.name}: ${who}`);
    }
  });
  const free = view.days.flatMap((d) => d.slots).filter((s) => !s.assignee).length;
  lines.push('', free ? `${free} pass är fortfarande ${free === 1 ? 'ledigt' : 'lediga'}.` : 'Alla pass är tagna – tack! 💚');
  return lines.join('\n');
}

/** "1 ledigt pass" / "3 lediga pass" */
export function freeLabel(n: number): string {
  return `${n} ${n === 1 ? 'ledigt' : 'lediga'} pass`;
}
