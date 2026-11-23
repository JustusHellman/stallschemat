/**
 * Nightly backup: writes all documents to a JSON file (kept 90 days as a
 * GitHub Actions artifact).  npx tsx scripts/backup.ts backup.json
 *
 * Restore: npx tsx scripts/restore.ts backup.json
 */
import { writeFileSync } from 'node:fs';
import { adminDb } from './firebase-admin';

async function main() {
  const db = adminDb();
  const config = (await db.doc('config/main').get()).data() ?? null;
  const weeksSnap = await db.collection('weeks').get();
  const weeks = Object.fromEntries(weeksSnap.docs.map((d) => [d.id, d.data()]));
  const out = process.argv[2] ?? 'backup.json';
  writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), config, weeks }, null, 1));
  console.log(`Backup: config + ${weeksSnap.size} weeks -> ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
