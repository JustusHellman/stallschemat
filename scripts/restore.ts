/**
 * Restore a backup made by backup.ts. Overwrites config and every week in the file.
 *   FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" npx tsx scripts/restore.ts backup.json
 * Add --only=2026-W48 to restore a single week.
 */
import { readFileSync } from 'node:fs';
import { adminDb } from './firebase-admin';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Ange backup-filen: npx tsx scripts/restore.ts backup.json');
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const db = adminDb();
  const batch = db.batch();
  if (!only && data.config) batch.set(db.doc('config/main'), data.config);
  for (const [id, week] of Object.entries(data.weeks ?? {})) {
    if (!only || only === id) batch.set(db.doc(`weeks/${id}`), week as object);
  }
  await batch.commit();
  console.log(`Restored from ${file} (exported ${data.exportedAt})${only ? ` – only ${only}` : ''}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
