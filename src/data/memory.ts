import { applyMutation, mutationWeekId, type Mutation, type MutationResult } from '../domain/rules';
import type { Config, WeekDoc } from '../domain/types';
import { emptyWeek } from '../domain/types';
import { normalizeConfig, normalizeWeek } from '../domain/validate';
import type { Backend, SnapshotMeta, Unsubscribe } from './backend';

interface State {
  config: unknown;
  weeks: Record<string, WeekDoc>;
}

/**
 * In-memory backend used by unit tests, end-to-end tests and the demo build.
 * Counts "reads" the same way Firestore bills them (one per document
 * delivered to a listener or fetched), so tests can assert sync efficiency.
 */
export class MemoryBackend implements Backend {
  reads = 0;
  writes = 0;
  activeListeners = 0;
  private state: State;
  private configSubs = new Set<(c: Config, m: SnapshotMeta) => void>();
  private weekSubs = new Map<string, Set<(w: WeekDoc, m: SnapshotMeta) => void>>();

  constructor(
    initial?: { config?: Config; weeks?: Record<string, WeekDoc> },
    private persistKey?: string,
  ) {
    const saved = persistKey && typeof localStorage !== 'undefined' ? localStorage.getItem(persistKey) : null;
    this.state = saved ? JSON.parse(saved) : { config: initial?.config ?? null, weeks: initial?.weeks ?? {} };
  }

  async init() {}

  private persist() {
    if (this.persistKey && typeof localStorage !== 'undefined') localStorage.setItem(this.persistKey, JSON.stringify(this.state));
  }

  private config(): Config {
    return normalizeConfig(this.state.config);
  }

  private week(id: string): WeekDoc {
    return normalizeWeek(this.state.weeks[id] ?? emptyWeek());
  }

  subscribeConfig(cb: (c: Config, m: SnapshotMeta) => void): Unsubscribe {
    this.configSubs.add(cb);
    this.activeListeners++;
    queueMicrotask(() => {
      if (!this.configSubs.has(cb)) return;
      this.reads++;
      cb(this.config(), { fromCache: false });
    });
    return () => {
      if (this.configSubs.delete(cb)) this.activeListeners--;
    };
  }

  subscribeWeek(id: string, cb: (w: WeekDoc, m: SnapshotMeta) => void): Unsubscribe {
    let set = this.weekSubs.get(id);
    if (!set) this.weekSubs.set(id, (set = new Set()));
    set.add(cb);
    this.activeListeners++;
    queueMicrotask(() => {
      if (!set!.has(cb)) return;
      this.reads++;
      cb(this.week(id), { fromCache: false });
    });
    return () => {
      if (set!.delete(cb)) this.activeListeners--;
    };
  }

  async fetchWeeks(ids: string[]) {
    const out: Record<string, WeekDoc> = {};
    for (const id of ids) {
      this.reads++;
      out[id] = this.week(id);
    }
    return out;
  }

  async mutate(m: Mutation, ctx: { config: Config; isAdmin: boolean; now: Date }): Promise<MutationResult> {
    const id = mutationWeekId(m);
    this.reads++;
    const res = applyMutation(this.week(id), m, ctx, id);
    if (res.ok && res.changed) this.setWeek(id, res.week);
    return res;
  }

  async updateConfig(fn: (c: Config) => Config): Promise<Config> {
    this.reads++;
    const next = fn(this.config());
    this.setConfig(next);
    return next;
  }

  /** Write a week directly (also used by tests to simulate another device). */
  setWeek(id: string, week: WeekDoc) {
    this.writes++;
    this.state.weeks[id] = structuredClone(week);
    this.persist();
    for (const cb of this.weekSubs.get(id) ?? []) {
      this.reads++;
      cb(this.week(id), { fromCache: false });
    }
  }

  setConfig(config: Config) {
    this.writes++;
    this.state.config = structuredClone(config);
    this.persist();
    for (const cb of this.configSubs) {
      this.reads++;
      cb(this.config(), { fromCache: false });
    }
  }

  getWeek(id: string): WeekDoc {
    return this.week(id);
  }
}
