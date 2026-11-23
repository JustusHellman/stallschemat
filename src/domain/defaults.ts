import type { Config, Slot } from './types';

export const DEFAULT_WEEKDAY: Slot[] = [
  { id: 'frukost', name: 'Frukost', time: '06:30', duration: 30 },
  { id: 'utslapp', name: 'Utsläpp', time: '07:30', duration: 30 },
  { id: 'inslapp', name: 'Insläpp', time: '16:30', duration: 30 },
  { id: 'kvallsmat', name: 'Kvällsmat', time: '19:00', duration: 30 },
];

export const DEFAULT_WEEKEND: Slot[] = [
  { id: 'frukost', name: 'Frukost', time: '07:00', duration: 30 },
  { id: 'utslapp', name: 'Utsläpp', time: '08:00', duration: 30 },
  { id: 'mockning', name: 'Mockning+lunch', time: '12:00', duration: 90 },
  { id: 'inslapp', name: 'Insläpp', time: '16:00', duration: 30 },
  { id: 'kvallsmat', name: 'Kvällsmat', time: '19:00', duration: 30 },
];

/** Colours chosen to be distinguishable and readable with either white or dark text. */
export const COLORS = [
  '#e4572e', '#2e9e6a', '#3f88c5', '#9b5de5', '#f2a541',
  '#d64f9c', '#17a2b8', '#8d6e63', '#6c8a1f', '#c0392b', '#34495e', '#e67e22',
];

export const DEFAULT_WEEKS_AHEAD = 6;
export const MAX_WEEKS_AHEAD = 12;

export function defaultConfig(): Config {
  return {
    people: {},
    templates: [
      { validFrom: '2000-01-01', weekday: structuredClone(DEFAULT_WEEKDAY), weekend: structuredClone(DEFAULT_WEEKEND) },
    ],
    weeksAhead: DEFAULT_WEEKS_AHEAD,
    adminHash: null,
  };
}

/** Short random id (not security relevant – used for people and slots). */
export function randomId(len = 10): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
