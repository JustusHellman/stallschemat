/**
 * Visibility-aware sync.
 *
 * - While the app is on screen: live listeners on config + the weeks that can
 *   be booked (current week + weeksAhead). Changes by others show up within a
 *   second, and Firestore only bills one read per *changed* document.
 * - When the app goes to the background (phone locked, other app opened):
 *   listeners are dropped after a short grace period, so a dormant app costs
 *   nothing.
 * - When it comes back: listeners are re-attached, which refreshes everything
 *   (~8 document reads, less if the local cache is recent).
 * - A day rollover is detected cheaply so the synced week range moves along.
 */
import { syncedWeekIds } from '../domain/schedule';
import type { Config, WeekDoc } from '../domain/types';
import { defaultConfig } from '../domain/defaults';
import type { Backend, Unsubscribe } from './backend';

export type SyncStatus = 'connecting' | 'live' | 'offline' | 'paused' | 'error';

export interface SyncState {
  config: Config;
  configLoaded: boolean;
  weeks: Record<string, WeekDoc>;
  status: SyncStatus;
  lastUpdate: number | null;
  error?: string;
}

export interface VisibilitySource {
  isVisible(): boolean;
  onChange(cb: () => void): () => void;
}

export const documentVisibility: VisibilitySource = {
  isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
  onChange: (cb) => {
    document.addEventListener('visibilitychange', cb);
    window.addEventListener('focus', cb);
    window.addEventListener('online', cb);
    window.addEventListener('pageshow', cb);
    return () => {
      document.removeEventListener('visibilitychange', cb);
      window.removeEventListener('focus', cb);
      window.removeEventListener('online', cb);
      window.removeEventListener('pageshow', cb);
    };
  },
};

export interface SyncOptions {
  backend: Backend;
  visibility?: VisibilitySource;
  clock?: () => Date;
  /** Keep listeners this long after the app is hidden (quick app switches stay live). */
  graceMs?: number;
  /** How often to check for a day rollover while visible (no reads involved). */
  rolloverCheckMs?: number;
  initialConfig?: Config;
}

export class SyncController {
  private state: SyncState;
  private listeners = new Set<(s: SyncState) => void>();
  private configUnsub: Unsubscribe | null = null;
  private weekUnsubs = new Map<string, Unsubscribe>();
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private rolloverTimer: ReturnType<typeof setInterval> | null = null;
  private offVisibility: (() => void) | null = null;
  private readonly backend: Backend;
  private readonly visibility: VisibilitySource;
  private readonly clock: () => Date;
  private readonly graceMs: number;
  private readonly rolloverCheckMs: number;
  private cacheFlags = new Map<string, boolean>();

  constructor(opts: SyncOptions) {
    this.backend = opts.backend;
    this.visibility = opts.visibility ?? documentVisibility;
    this.clock = opts.clock ?? (() => new Date());
    this.graceMs = opts.graceMs ?? 60_000;
    this.rolloverCheckMs = opts.rolloverCheckMs ?? 5 * 60_000;
    this.state = {
      config: opts.initialConfig ?? defaultConfig(),
      configLoaded: false,
      weeks: {},
      status: 'connecting',
      lastUpdate: null,
    };
  }

  get snapshot(): SyncState {
    return this.state;
  }

  get connected(): boolean {
    return this.configUnsub !== null;
  }

  subscribe(fn: (s: SyncState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  start() {
    this.offVisibility = this.visibility.onChange(() => this.onVisibility());
    this.onVisibility();
  }

  stop() {
    this.offVisibility?.();
    this.offVisibility = null;
    this.disconnect();
    this.clearHideTimer();
  }

  /** Force a fresh read (pull-to-refresh / "Uppdatera" button). */
  refresh() {
    this.disconnect();
    this.connect();
  }

  /** Ids currently kept live. */
  get liveWeekIds(): string[] {
    return [...this.weekUnsubs.keys()];
  }

  /** Merge one-off fetched weeks (e.g. past weeks for statistics) into state. */
  async loadWeeks(ids: string[]): Promise<Record<string, WeekDoc>> {
    const missing = ids.filter((id) => !this.state.weeks[id]);
    if (missing.length) {
      const fetched = await this.backend.fetchWeeks(missing);
      this.set({ weeks: { ...this.state.weeks, ...fetched } });
    }
    return Object.fromEntries(ids.map((id) => [id, this.state.weeks[id]]));
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private onVisibility() {
    if (this.visibility.isVisible()) {
      this.clearHideTimer();
      if (!this.connected) this.connect();
      else this.syncWeekRange();
    } else if (this.connected && !this.hideTimer) {
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        if (!this.visibility.isVisible()) {
          this.disconnect();
          this.set({ status: 'paused' });
        }
      }, this.graceMs);
    }
  }

  private clearHideTimer() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  private connect() {
    this.set({ status: 'connecting', error: undefined });
    this.configUnsub = this.backend.subscribeConfig(
      (config, meta) => {
        this.cacheFlags.set('config', meta.fromCache);
        this.set({ config, configLoaded: true, lastUpdate: Date.now() });
        this.syncWeekRange();
        this.updateStatus();
      },
      (e) => this.onError(e),
    );
    this.syncWeekRange();
    this.rolloverTimer = setInterval(() => this.syncWeekRange(), this.rolloverCheckMs);
  }

  private disconnect() {
    this.configUnsub?.();
    this.configUnsub = null;
    for (const u of this.weekUnsubs.values()) u();
    this.weekUnsubs.clear();
    this.cacheFlags.clear();
    if (this.rolloverTimer) clearInterval(this.rolloverTimer);
    this.rolloverTimer = null;
  }

  /** Make the set of live week listeners match the current booking window. */
  private syncWeekRange() {
    if (!this.connected) return;
    const wanted = new Set(syncedWeekIds(this.clock(), this.state.config.weeksAhead));
    for (const [id, unsub] of this.weekUnsubs) {
      if (!wanted.has(id)) {
        unsub();
        this.weekUnsubs.delete(id);
        this.cacheFlags.delete(id);
      }
    }
    for (const id of wanted) {
      if (this.weekUnsubs.has(id)) continue;
      this.weekUnsubs.set(
        id,
        this.backend.subscribeWeek(
          id,
          (week, meta) => {
            this.cacheFlags.set(id, meta.fromCache);
            this.set({ weeks: { ...this.state.weeks, [id]: week }, lastUpdate: Date.now() });
            this.updateStatus();
          },
          (e) => this.onError(e),
        ),
      );
    }
  }

  private updateStatus() {
    if (!this.connected) return;
    const anyCache = [...this.cacheFlags.values()].some(Boolean);
    const allLoaded = this.cacheFlags.has('config') && [...this.weekUnsubs.keys()].every((id) => this.cacheFlags.has(id));
    this.set({ status: anyCache ? 'offline' : allLoaded ? 'live' : 'connecting' });
  }

  private onError(e: unknown) {
    console.error('[sync]', e);
    this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
