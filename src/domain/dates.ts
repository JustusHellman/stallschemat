/**
 * Date helpers. Calendar dates are always handled as "YYYY-MM-DD" strings and
 * arithmetic is done in UTC so that daylight-saving changes never shift a day.
 * "now" is interpreted in the device's local time zone.
 */

export const WEEKDAYS_SHORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
export const WEEKDAYS_LONG = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const MONTHS_LONG = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

const pad = (n: number) => String(n).padStart(2, '0');

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toUTC(iso: string): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Ogiltigt datum: ${iso}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function fromUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Today's date in the device's local time zone. */
export function localISODate(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** 0 = Monday … 6 = Sunday */
export function dayIndex(iso: string): number {
  return (toUTC(iso).getUTCDay() + 6) % 7;
}

export function isWeekend(iso: string): boolean {
  return dayIndex(iso) >= 5;
}

/** Monday of the week containing the date. */
export function weekStart(iso: string): string {
  return addDays(iso, -dayIndex(iso));
}

/** ISO-8601 week id, e.g. "2026-W48". */
export function weekId(iso: string): string {
  const d = toUTC(iso);
  // Thursday of this week decides the year.
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${pad(week)}`;
}

export function weekNumber(iso: string): number {
  return +weekId(iso).slice(6);
}

/** Monday (YYYY-MM-DD) of an ISO week id. */
export function weekIdToMonday(id: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) throw new Error(`Ogiltigt vecko-id: ${id}`);
  const jan4 = new Date(Date.UTC(+m[1], 0, 4));
  const monday = addDays(fromUTC(jan4), -((jan4.getUTCDay() + 6) % 7));
  return addDays(monday, (+m[2] - 1) * 7);
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Week ids starting with the week of `fromIso`, `count` weeks in total. */
export function weekIdRange(fromIso: string, count: number): string[] {
  const start = weekStart(fromIso);
  return Array.from({ length: count }, (_, i) => weekId(addDays(start, i * 7)));
}

/** Local Date for a calendar date + "HH:MM". */
export function localDateTime(iso: string, time: string): Date {
  const [y, mo, d] = iso.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000);
}

/** "mån 23 nov" */
export function formatShort(iso: string): string {
  const d = toUTC(iso);
  return `${WEEKDAYS_SHORT[dayIndex(iso)].toLowerCase()} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Måndag 23 november" */
export function formatLong(iso: string): string {
  const d = toUTC(iso);
  return `${WEEKDAYS_LONG[dayIndex(iso)]} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]}`;
}

/** "23–29 nov" or "30 nov – 6 dec" */
export function formatWeekRange(monday: string): string {
  const a = toUTC(monday);
  const b = toUTC(addDays(monday, 6));
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  }
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

/** Week ids covering from..to (inclusive). */
export function weeksCovering(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = weekStart(from); d <= to; d = addDays(d, 7)) out.push(weekId(d));
  return out;
}

export function lastOfMonth(iso: string): string {
  const firstOfNext = addDays(iso.slice(0, 8) + '28', 4).slice(0, 8) + '01';
  return addDays(firstOfNext, -1);
}

/**
 * Lenient 24h time parsing for typed input: "1630", "16.30", "16:30", "9" ,"9:5" -> "16:30", "09:00", "09:05".
 * Returns null if it can't be understood.
 */
export function normalizeTime(input: string): string | null {
  const s = input.trim().replace(/[.,;h ]/g, ':');
  let h: number, m: number;
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  const digits = /^\d{1,4}$/.exec(s);
  if (colon) {
    h = +colon[1];
    m = +colon[2];
  } else if (digits) {
    if (s.length <= 2) {
      h = +s;
      m = 0;
    } else {
      h = +s.slice(0, s.length - 2);
      m = +s.slice(-2);
    }
  } else return null;
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

export function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}
