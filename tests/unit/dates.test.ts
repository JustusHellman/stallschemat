import { describe, expect, it } from 'vitest';
import {
  addDays, dayIndex, diffDays, lastOfMonth, normalizeTime, weeksCovering, formatLong, formatShort, formatWeekRange, isISODate, isValidTime, isWeekend,
  localDateTime, localISODate, weekDates, weekId, weekIdRange, weekIdToMonday, weekNumber, weekStart,
} from '../../src/domain/dates';

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-11-23')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-1-3')).toBe(false);
    expect(isISODate('nonsense')).toBe(false);
  });

  it('adds days across months, years and DST changes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29'); // DST starts 29 mar
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26'); // DST ends 25 oct
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('knows weekdays and weekends', () => {
    expect(dayIndex('2026-11-23')).toBe(0); // Monday
    expect(dayIndex('2026-11-29')).toBe(6); // Sunday
    expect(isWeekend('2026-11-27')).toBe(false);
    expect(isWeekend('2026-11-28')).toBe(true);
    expect(isWeekend('2026-11-29')).toBe(true);
    // Public holidays are regular days (horses don't care): Christmas Day 2026 is a Friday.
    expect(isWeekend('2026-12-25')).toBe(false);
  });

  it('finds week start', () => {
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    expect(weekStart('2026-11-29')).toBe('2026-11-23');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });

  it('computes ISO week ids, including year boundaries', () => {
    expect(weekId('2026-11-23')).toBe('2026-W48');
    expect(weekId('2026-11-22')).toBe('2026-W47');
    expect(weekId('2026-12-31')).toBe('2026-W53'); // 2026 has 53 weeks
    expect(weekId('2027-01-03')).toBe('2026-W53');
    expect(weekId('2027-01-04')).toBe('2027-W01');
    expect(weekId('2024-12-30')).toBe('2025-W01');
    expect(weekId('2021-01-03')).toBe('2020-W53');
    expect(weekNumber('2026-11-25')).toBe(48);
  });

  it('round-trips week ids to Mondays', () => {
    for (let d = '2024-01-01'; d < '2029-01-01'; d = addDays(d, 7)) {
      expect(weekIdToMonday(weekId(d))).toBe(weekStart(d));
    }
    expect(() => weekIdToMonday('bad')).toThrow();
  });

  it('lists week dates and ranges', () => {
    expect(weekDates('2026-11-23')).toEqual([
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29',
    ]);
    expect(weekIdRange('2026-12-24', 3)).toEqual(['2026-W52', '2026-W53', '2027-W01']);
  });

  it('handles local time', () => {
    const now = new Date(2026, 10, 22, 23, 59);
    expect(localISODate(now)).toBe('2026-11-22');
    const dt = localDateTime('2026-11-23', '06:30');
    expect([dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes()]).toEqual([2026, 10, 23, 6, 30]);
  });

  it('computes date differences', () => {
    expect(diffDays('2026-11-23', '2026-11-30')).toBe(7);
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('formats in Swedish', () => {
    expect(formatShort('2026-11-23')).toBe('mån 23 nov');
    expect(formatLong('2026-11-28')).toBe('Lördag 28 november');
    expect(formatWeekRange('2026-11-23')).toBe('23–29 nov');
    expect(formatWeekRange('2026-11-30')).toBe('30 nov – 6 dec');
  });

  it('covers date ranges with weeks and finds month ends', () => {
    expect(weeksCovering('2026-11-25', '2026-12-07')).toEqual(['2026-W48', '2026-W49', '2026-W50']);
    expect(weeksCovering('2026-11-23', '2026-11-23')).toEqual(['2026-W48']);
    expect(lastOfMonth('2026-11-05')).toBe('2026-11-30');
    expect(lastOfMonth('2026-12-31')).toBe('2026-12-31');
    expect(lastOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(lastOfMonth('2027-02-01')).toBe('2027-02-28');
  });

  it('normalizes typed times to 24h HH:MM', () => {
    expect(normalizeTime('16:30')).toBe('16:30');
    expect(normalizeTime('1630')).toBe('16:30');
    expect(normalizeTime('16.30')).toBe('16:30');
    expect(normalizeTime('9')).toBe('09:00');
    expect(normalizeTime('930')).toBe('09:30');
    expect(normalizeTime('9:5')).toBe('09:05');
    expect(normalizeTime(' 07:00 ')).toBe('07:00');
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('12:60')).toBeNull();
    expect(normalizeTime('abc')).toBeNull();
    expect(normalizeTime('')).toBeNull();
  });

  it('validates times', () => {
    expect(isValidTime('06:30')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('6:30')).toBe(false);
  });
});
