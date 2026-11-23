/** Seed data for the demo build (no Firebase). Admin code in the demo: 1234 */
import { addDays, localISODate, weekId, weekStart } from '../domain/dates';
import { defaultConfig } from '../domain/defaults';
import { templateSlotsFor } from '../domain/schedule';
import type { Config, WeekDoc } from '../domain/types';

export const DEMO_ADMIN_HASH = '93793efb81c80043f5e0fa7fee919240380903dc9ac4bc6d9957ef151c9e6d02';

export function demoData(now: Date): { config: Config; weeks: Record<string, WeekDoc> } {
  const config = defaultConfig();
  config.adminHash = DEMO_ADMIN_HASH;
  config.people = {
    anna: { name: 'Anna', color: '#e4572e', active: true },
    maja: { name: 'Maja', color: '#2e9e6a', active: true },
    lisa: { name: 'Lisa', color: '#3f88c5', active: true },
    sara: { name: 'Sara', color: '#9b5de5', active: true },
    elin: { name: 'Elin', color: '#f2a541', active: true },
    karin: { name: 'Karin', color: '#d64f9c', active: true },
  };
  const ids = Object.keys(config.people);
  const weeks: Record<string, WeekDoc> = {};
  const start = addDays(weekStart(localISODate(now)), -28);
  // Deterministic pseudo-random fill: past weeks full, this week mostly, next week half, later sparse.
  let seed = 20261123;
  const rnd = () => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 7 * 7; i++) {
    const date = addDays(start, i);
    const wid = weekId(date);
    const w = (weeks[wid] ??= { assignments: {}, days: {}, log: [] });
    const weekOffset = Math.floor(i / 7) - 4;
    const fill = weekOffset < 0 ? 1 : weekOffset === 0 ? 0.85 : weekOffset === 1 ? 0.55 : 0.2;
    for (const s of templateSlotsFor(config, date)) {
      if (rnd() < fill) w.assignments[`${date}_${s.id}`] = ids[Math.floor(rnd() * ids.length)];
    }
  }
  // A changed day next week (farrier visit).
  const changed = addDays(weekStart(localISODate(now)), 9);
  const cw = weeks[weekId(changed)];
  cw.days[changed] = {
    note: 'Hovslagaren kommer',
    slots: [...templateSlotsFor(config, changed), { id: 'hovslagare', name: 'Hovslagare', time: '10:00', duration: 60 }],
  };
  return { config, weeks };
}
