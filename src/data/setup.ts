/** Creates the backend for this build: Firebase in production, in-memory for demo/tests. */
import type { Backend } from './backend';

export const isDemo = import.meta.env.VITE_BACKEND === 'memory';

export async function createBackend(): Promise<Backend> {
  if (isDemo) {
    const [{ MemoryBackend }, { demoData }] = await Promise.all([import('./memory'), import('./demo')]);
    const params = new URLSearchParams(location.search);
    if (params.has('reset')) {
      localStorage.removeItem('stallschemat-demo-db');
      params.delete('reset');
      history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
    }
    const backend = new MemoryBackend(params.has('empty') ? undefined : demoData(demoNow()), 'stallschemat-demo-db');
    (window as unknown as { __stallBackend: unknown }).__stallBackend = backend; // test hook (demo only)
    return backend;
  }
  const [{ initializeApp }, fs, { FirebaseBackend }] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
    import('./firebase'),
  ]);
  const env = import.meta.env;
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  // Local cache: instant start, works offline, and resumed listeners only
  // download what changed.
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  return new FirebaseBackend(db, app);
}

/** In the demo build the clock can be pinned with ?now=2026-11-23T09:00 (used by tests/screenshots). */
export function demoNow(): Date {
  if (!isDemo) return new Date();
  const p = new URLSearchParams(location.search).get('now') ?? sessionStorage.getItem('stallschemat-now');
  if (p) {
    sessionStorage.setItem('stallschemat-now', p);
    const d = new Date(p);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}
