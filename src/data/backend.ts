import type { Mutation, MutationResult } from '../domain/rules';
import type { Config, WeekDoc } from '../domain/types';

export type Unsubscribe = () => void;

export interface SnapshotMeta {
  /** True when the data came from the local cache (e.g. offline). */
  fromCache: boolean;
}

/**
 * Storage abstraction. `FirebaseBackend` is used in production and
 * `MemoryBackend` in tests and the demo build. Both apply mutations with the
 * same pure functions from domain/rules.ts.
 */
export interface Backend {
  /** Sign in (anonymously) etc. Must be called before anything else. */
  init(): Promise<void>;
  subscribeConfig(cb: (config: Config, meta: SnapshotMeta) => void, onError: (e: unknown) => void): Unsubscribe;
  subscribeWeek(id: string, cb: (week: WeekDoc, meta: SnapshotMeta) => void, onError: (e: unknown) => void): Unsubscribe;
  /** One-off read (used for past weeks in admin statistics). */
  fetchWeeks(ids: string[]): Promise<Record<string, WeekDoc>>;
  /** Atomically apply a mutation to the week document (transaction). */
  mutate(m: Mutation, ctx: { config: Config; isAdmin: boolean; now: Date }): Promise<MutationResult>;
  /** Atomically update the config document (transaction). */
  updateConfig(fn: (c: Config) => Config): Promise<Config>;
}
