import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/** Firestore admin client from the FIREBASE_SERVICE_ACCOUNT env var (JSON string). */
export function adminDb(): Firestore {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-stallschema' }, `emulator-${getApps().length}`);
    return getFirestore(app);
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT saknas (lägg till som GitHub secret).');
  initializeApp({ credential: cert(JSON.parse(raw)) });
  return getFirestore();
}
