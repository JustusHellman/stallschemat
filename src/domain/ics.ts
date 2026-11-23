/**
 * iCalendar (RFC 5545) generation for calendar subscriptions and
 * single-shift "add to calendar" downloads.
 */
import { addDays, weekId } from './dates';
import { buildDay } from './schedule';
import type { Config, WeekDoc } from './types';

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Stockholm',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curLen + len > limit) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  out.push(cur);
  return out.map((l, i) => (i === 0 ? l : ' ' + l)).join('\r\n');
}

/** Local date+time -> "YYYYMMDDTHHMMSS", adding minutes (may roll over midnight). */
export function icsLocal(date: string, time: string, addMinutes = 0): string {
  const [h, m] = time.split(':').map(Number);
  let total = h * 60 + m + addMinutes;
  let d = date;
  while (total >= 1440) {
    total -= 1440;
    d = addDays(d, 1);
  }
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${d.replace(/-/g, '')}T${hh}${mm}00`;
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface IcsEvent {
  uid: string;
  date: string;
  time: string;
  duration: number;
  summary: string;
  description?: string;
}

export function buildCalendar(name: string, events: IcsEvent[], now: Date): string {
  const stamp = utcStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stallschemat//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Europe/Stockholm',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE,
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Stockholm:${icsLocal(e.date, e.time)}`,
      `DTEND;TZID=Europe/Stockholm:${icsLocal(e.date, e.time, e.duration)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/**
 * Events between from..to (inclusive). With personId: only that person's
 * shifts; without: every assigned shift with the person's name in the title.
 */
export function collectEvents(
  config: Config,
  weeks: Record<string, WeekDoc>,
  from: string,
  to: string,
  personId?: string,
): IcsEvent[] {
  const events: IcsEvent[] = [];
  const epoch = new Date(0);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = buildDay(config, weeks[weekId(d)], d, null, epoch);
    for (const s of day.slots) {
      if (!s.assignee || (personId && s.assignee !== personId)) continue;
      const who = config.people[s.assignee]?.name ?? '?';
      events.push({
        uid: `${s.key}-${personId ?? 'alla'}@stallschemat`,
        date: d,
        time: s.slot.time,
        duration: s.slot.duration,
        summary: personId ? `🐴 ${s.slot.name}` : `${s.slot.name} – ${who}`,
        description: day.note ? `Stallschemat · ${day.note}` : 'Stallschemat',
      });
    }
  }
  return events;
}
