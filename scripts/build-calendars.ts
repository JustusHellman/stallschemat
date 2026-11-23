/**
 * Builds the calendar subscription files from Firestore.
 * Run by GitHub Actions every hour:  npx tsx scripts/build-calendars.ts dist
 *
 * Needs FIREBASE_SERVICE_ACCOUNT (the service-account JSON as a string).
 * Reads ~10 documents per run (~240 reads/day).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCalendarFiles, feedRange } from '../src/domain/feeds';
import { normalizeConfig, normalizeWeek } from '../src/domain/validate';
import type { Firestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { adminDb } from './firebase-admin';

export async function generateCalendars(db: Firestore, outDir: string, now = new Date()) {
  const config = normalizeConfig((await db.doc('config/main').get()).data());
  const { weekIds } = feedRange(config, now);
  const snaps = await db.getAll(...weekIds.map((id) => db.doc(`weeks/${id}`)));
  const weeks = Object.fromEntries(snaps.map((s, i) => [weekIds[i], normalizeWeek(s.data())]));
  const files = buildCalendarFiles(config, weeks, now);
  for (const [name, content] of Object.entries(files)) {
    const path = join(outDir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  console.log(`Wrote ${Object.keys(files).length} calendar files (${1 + weekIds.length} document reads).`);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateCalendars(adminDb(), process.argv[2] ?? 'dist').catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
