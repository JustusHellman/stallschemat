import type { FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  doc, getDoc, onSnapshot, runTransaction, type Firestore,
} from 'firebase/firestore';
import { applyMutation, mutationWeekId, type Mutation, type MutationResult } from '../domain/rules';
import type { Config, WeekDoc } from '../domain/types';
import { normalizeConfig, normalizeWeek } from '../domain/validate';
import type { Backend, SnapshotMeta, Unsubscribe } from './backend';

const CONFIG_PATH = ['config', 'main'] as const;

/** Strip undefined values (Firestore rejects them). */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function configToDoc(c: Config) {
  return clean({ people: c.people, templates: c.templates, weeksAhead: c.weeksAhead, adminHash: c.adminHash });
}

export function weekToDoc(w: WeekDoc) {
  return clean({ assignments: w.assignments, days: w.days, log: w.log });
}

export class FirebaseBackend implements Backend {
  constructor(
    private db: Firestore,
    private app?: FirebaseApp,
  ) {}

  /** Invisible anonymous sign-in – the database rules require a signed-in user. */
  async init() {
    if (!this.app) return;
    const auth = getAuth(this.app);
    if (auth.currentUser) return;
    await new Promise<void>((resolve, reject) => {
      const off = onAuthStateChanged(auth, (u) => {
        if (u) {
          off();
          resolve();
        }
      });
      signInAnonymously(auth).catch((e) => {
        off();
        reject(e);
      });
    });
  }

  subscribeConfig(cb: (c: Config, m: SnapshotMeta) => void, onError: (e: unknown) => void): Unsubscribe {
    return onSnapshot(
      doc(this.db, ...CONFIG_PATH),
      (snap) => cb(normalizeConfig(snap.data()), { fromCache: snap.metadata.fromCache }),
      onError,
    );
  }

  subscribeWeek(id: string, cb: (w: WeekDoc, m: SnapshotMeta) => void, onError: (e: unknown) => void): Unsubscribe {
    return onSnapshot(
      doc(this.db, 'weeks', id),
      (snap) => cb(normalizeWeek(snap.data()), { fromCache: snap.metadata.fromCache }),
      onError,
    );
  }

  async fetchWeeks(ids: string[]) {
    const snaps = await Promise.all(ids.map((id) => getDoc(doc(this.db, 'weeks', id))));
    return Object.fromEntries(snaps.map((s, i) => [ids[i], normalizeWeek(s.data())]));
  }

  async mutate(m: Mutation, ctx: { config: Config; isAdmin: boolean; now: Date }): Promise<MutationResult> {
    const id = mutationWeekId(m);
    const ref = doc(this.db, 'weeks', id);
    return runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      const res = applyMutation(normalizeWeek(snap.data()), m, ctx, id);
      if (res.ok && res.changed) tx.set(ref, weekToDoc(res.week));
      return res;
    });
  }

  async updateConfig(fn: (c: Config) => Config): Promise<Config> {
    const ref = doc(this.db, ...CONFIG_PATH);
    return runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      const next = fn(normalizeConfig(snap.data()));
      tx.set(ref, configToDoc(next));
      return next;
    });
  }
}
