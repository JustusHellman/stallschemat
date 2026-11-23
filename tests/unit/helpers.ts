import { defaultConfig } from '../../src/domain/defaults';
import type { Config, WeekDoc } from '../../src/domain/types';

export function testConfig(): Config {
  const c = defaultConfig();
  c.people = {
    anna: { name: 'Anna', color: '#e4572e', active: true },
    maja: { name: 'Maja', color: '#2e9e6a', active: true },
    lisa: { name: 'Lisa', color: '#3f88c5', active: true },
    lars: { name: 'Lars', color: '#34495e', active: false },
  };
  return c;
}

export const week = (partial: Partial<WeekDoc> = {}): WeekDoc => ({ assignments: {}, days: {}, log: [], ...partial });

/** Local time helper: at('2026-11-23 09:00') */
export function at(s: string): Date {
  const [d, t = '00:00'] = s.split(' ');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi);
}
