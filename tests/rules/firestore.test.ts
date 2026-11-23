/**
 * Runs against the Firestore emulator: `npm run test:rules`
 * (needs Java; runs automatically in GitHub Actions).
 */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FirebaseBackend, configToDoc } from '../../src/data/firebase';
import { defaultConfig } from '../../src/domain/defaults';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-stallschema',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const authed = (uid = 'u1') => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const validWeek = { assignments: { '2026-11-23_frukost': 'maja' }, days: {}, log: [] };

describe('security rules', () => {
  it('denies everything when not signed in', async () => {
    await assertFails(getDoc(doc(anon(), 'config/main')));
    await assertFails(setDoc(doc(anon(), 'config/main'), configToDoc(defaultConfig())));
    await assertFails(getDoc(doc(anon(), 'weeks/2026-W48')));
    await assertFails(setDoc(doc(anon(), 'weeks/2026-W48'), validWeek));
  });

  it('lets signed-in users read and write valid documents', async () => {
    const db = authed();
    await assertSucceeds(setDoc(doc(db, 'config/main'), configToDoc(defaultConfig())));
    await assertSucceeds(getDoc(doc(db, 'config/main')));
    await assertSucceeds(setDoc(doc(db, 'weeks/2026-W48'), validWeek));
    await assertSucceeds(getDoc(doc(db, 'weeks/2026-W48')));
  });

  it('accepts a 64-char admin hash and rejects other values', async () => {
    const db = authed();
    await assertSucceeds(setDoc(doc(db, 'config/main'), { ...configToDoc(defaultConfig()), adminHash: 'a'.repeat(64) }));
    await assertFails(setDoc(doc(db, 'config/main'), { ...configToDoc(defaultConfig()), adminHash: '1234' }));
  });

  it('rejects malformed config', async () => {
    const db = authed();
    const base = configToDoc(defaultConfig());
    await assertFails(setDoc(doc(db, 'config/main'), { ...base, extra: 1 }));
    await assertFails(setDoc(doc(db, 'config/main'), { ...base, weeksAhead: 50 }));
    await assertFails(setDoc(doc(db, 'config/main'), { ...base, templates: [] }));
    await assertFails(setDoc(doc(db, 'config/main'), { people: {} }));
  });

  it('rejects malformed weeks and bad ids', async () => {
    const db = authed();
    await assertFails(setDoc(doc(db, 'weeks/hello'), validWeek));
    await assertFails(setDoc(doc(db, 'weeks/2026-W48'), { ...validWeek, junk: true }));
    await assertFails(setDoc(doc(db, 'weeks/2026-W48'), { assignments: {}, days: {} }));
    const many = Object.fromEntries(Array.from({ length: 121 }, (_, i) => [`k${i}`, 'x']));
    await assertFails(setDoc(doc(db, 'weeks/2026-W48'), { ...validWeek, assignments: many }));
  });

  it('never allows deletes or other collections', async () => {
    const db = authed();
    await setDoc(doc(db, 'weeks/2026-W48'), validWeek);
    await assertFails(deleteDoc(doc(db, 'weeks/2026-W48')));
    await assertFails(setDoc(doc(db, 'other/x'), { a: 1 }));
    await assertFails(getDoc(doc(db, 'other/x')));
  });
});

describe('FirebaseBackend against the emulator', () => {
  const now = new Date(2026, 10, 22, 12, 0);

  it('claims in a transaction and blocks double booking', async () => {
    const config = defaultConfig();
    const a = new FirebaseBackend(authed('a'));
    const b = new FirebaseBackend(authed('b'));
    const ctx = { config, isAdmin: false, now };
    const results = await Promise.all([
      a.mutate({ type: 'claim', key: '2026-11-23_frukost', person: 'maja' }, ctx),
      b.mutate({ type: 'claim', key: '2026-11-23_frukost', person: 'anna' }, ctx),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)[0]).toMatchObject({ ok: false, error: { code: 'taken' } });
    const weeks = await a.fetchWeeks(['2026-W48']);
    expect(Object.keys(weeks['2026-W48'].assignments)).toEqual(['2026-11-23_frukost']);
  });

  it('releases and updates config', async () => {
    const be = new FirebaseBackend(authed());
    const config = await be.updateConfig((c) => ({ ...c, people: { maja: { name: 'Maja', color: '#2e9e6a', active: true } } }));
    expect(config.people.maja.name).toBe('Maja');
    const ctx = { config, isAdmin: false, now };
    await be.mutate({ type: 'claim', key: '2026-11-28_mockning', person: 'maja' }, ctx);
    const r = await be.mutate({ type: 'release', key: '2026-11-28_mockning', person: 'maja' }, ctx);
    expect(r.ok).toBe(true);
    expect((await be.fetchWeeks(['2026-W48']))['2026-W48'].assignments).toEqual({});
  });

  it('delivers live updates to listeners', async () => {
    const be = new FirebaseBackend(authed());
    const seen: number[] = [];
    const off = be.subscribeWeek('2026-W48', (w) => seen.push(Object.keys(w.assignments).length), () => {});
    await be.mutate({ type: 'claim', key: '2026-11-23_frukost', person: 'maja' }, { config: defaultConfig(), isAdmin: false, now });
    await new Promise((r) => setTimeout(r, 500));
    off();
    expect(seen.at(-1)).toBe(1);
  });
});

describe('calendar feed script against the emulator', () => {
  it('builds personal and shared .ics files from Firestore data', async () => {
    const { mkdtempSync, readFileSync, existsSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { generateCalendars } = await import('../../scripts/build-calendars');
    const { adminDb } = await import('../../scripts/firebase-admin');
    const now = new Date();
    const config = { ...defaultConfig(), people: { maja: { name: 'Maja', color: '#2e9e6a', active: true } } };
    const { localISODate, weekId, addDays } = await import('../../src/domain/dates');
    const date = addDays(localISODate(now), 2);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(db, 'config/main'), configToDoc(config));
      await setDoc(doc(db, `weeks/${weekId(date)}`), { assignments: { [`${date}_frukost`]: 'maja' }, days: {}, log: [] });
    });
    const out = mkdtempSync(join(tmpdir(), 'cal-'));
    await generateCalendars(adminDb(), out, now);
    expect(existsSync(join(out, 'cal/alla.ics'))).toBe(true);
    const ics = readFileSync(join(out, 'cal/maja.ics'), 'utf8');
    expect(ics).toContain(`DTSTART;TZID=Europe/Stockholm:${date.replace(/-/g, '')}T`);
    expect(ics).toContain('SUMMARY:🐴 Frukost');
  });
});
