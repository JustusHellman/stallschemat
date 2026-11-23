import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';

/**
 * Guards against two copies of Firebase's core packages being installed
 * (e.g. one pulled in by firebase-admin). With two copies the app crashes on
 * start with "Service firestore is not available".
 */
describe('Firebase install', () => {
  it('can create Firestore and Auth for an app (single @firebase/app instance)', () => {
    const app = initializeApp({ projectId: 'demo-guard', apiKey: 'demo-key' }, 'guard');
    expect(() => initializeFirestore(app, { localCache: memoryLocalCache() })).not.toThrow();
    expect(() => getAuth(app)).not.toThrow();
  });

  it('has exactly one copy of the core Firebase packages', () => {
    const copies = (pkg: string) => {
      const found: string[] = [];
      const walk = (dir: string, depth: number) => {
        if (depth > 6 || !existsSync(dir)) return;
        if (existsSync(join(dir, pkg, 'package.json'))) found.push(join(dir, pkg));
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          if (!e.isDirectory()) continue;
          const sub = join(dir, e.name);
          if (e.name.startsWith('@')) {
            for (const s of readdirSync(sub, { withFileTypes: true })) if (s.isDirectory()) walk(join(sub, s.name, 'node_modules'), depth + 1);
          } else walk(join(sub, 'node_modules'), depth + 1);
        }
      };
      walk('node_modules', 0);
      return found;
    };
    for (const pkg of ['@firebase/app', '@firebase/component', '@firebase/app-compat']) {
      expect(copies(pkg), pkg).toHaveLength(1);
    }
  });
});
