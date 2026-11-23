import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryBackend } from '../../src/data/memory';
import { SyncController, type VisibilitySource } from '../../src/data/sync';
import { at, testConfig, week } from './helpers';

class FakeVisibility implements VisibilitySource {
  visible = true;
  private cbs = new Set<() => void>();
  isVisible = () => this.visible;
  onChange(cb: () => void) {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }
  set(v: boolean) {
    this.visible = v;
    this.cbs.forEach((cb) => cb());
  }
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('SyncController', () => {
  let backend: MemoryBackend;
  let vis: FakeVisibility;
  let now: Date;
  let sync: SyncController;

  beforeEach(() => {
    vi.useFakeTimers();
    const config = testConfig();
    config.weeksAhead = 2;
    backend = new MemoryBackend({ config, weeks: { '2026-W48': week({ assignments: { '2026-11-23_frukost': 'anna' } }) } });
    vis = new FakeVisibility();
    now = at('2026-11-23 08:00');
    sync = new SyncController({ backend, visibility: vis, clock: () => now, graceMs: 60_000, rolloverCheckMs: 60_000 });
  });

  afterEach(() => {
    sync.stop();
    vi.useRealTimers();
  });

  it('loads config and the bookable weeks when started visible', async () => {
    sync.start();
    expect(sync.snapshot.status).toBe('connecting');
    await flush();
    const s = sync.snapshot;
    expect(s.status).toBe('live');
    expect(s.configLoaded).toBe(true);
    expect(sync.liveWeekIds).toEqual(['2026-W48', '2026-W49', '2026-W50']);
    expect(s.weeks['2026-W48'].assignments['2026-11-23_frukost']).toBe('anna');
    // 1 config + 3 weeks
    expect(backend.reads).toBe(4);
    expect(backend.activeListeners).toBe(4);
  });

  it('pushes changes made by others while visible (1 read per change)', async () => {
    sync.start();
    await flush();
    const before = backend.reads;
    backend.setWeek('2026-W49', week({ assignments: { '2026-11-30_frukost': 'lisa' } }));
    expect(sync.snapshot.weeks['2026-W49'].assignments['2026-11-30_frukost']).toBe('lisa');
    expect(backend.reads - before).toBe(1);
  });

  it('does not connect while hidden, and connects when shown', async () => {
    vis.visible = false;
    sync.start();
    await flush();
    expect(backend.activeListeners).toBe(0);
    expect(backend.reads).toBe(0);
    vis.set(true);
    await flush();
    expect(backend.activeListeners).toBe(4);
  });

  it('keeps listeners during a short app switch (grace period)', async () => {
    sync.start();
    await flush();
    vis.set(false);
    await vi.advanceTimersByTimeAsync(30_000);
    vis.set(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backend.activeListeners).toBe(4);
    expect(backend.reads).toBe(4); // no re-reads
  });

  it('drops listeners when dormant (no cost) and refreshes on return', async () => {
    sync.start();
    await flush();
    vis.set(false);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(backend.activeListeners).toBe(0);
    expect(sync.snapshot.status).toBe('paused');

    // Someone books while the app sleeps – costs nothing for this device…
    const before = backend.reads;
    backend.setWeek('2026-W48', week({ assignments: { '2026-11-24_frukost': 'lisa' } }));
    expect(backend.reads).toBe(before);

    // …and it is visible as soon as the app is opened again.
    vis.set(true);
    await flush();
    expect(sync.snapshot.status).toBe('live');
    expect(sync.snapshot.weeks['2026-W48'].assignments['2026-11-24_frukost']).toBe('lisa');
  });

  it('moves the synced range when the week rolls over', async () => {
    sync.start();
    await flush();
    now = at('2026-11-30 06:00');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync.liveWeekIds.sort()).toEqual(['2026-W49', '2026-W50', '2026-W51']);
    expect(backend.activeListeners).toBe(4);
  });

  it('follows weeksAhead changes from the admin', async () => {
    sync.start();
    await flush();
    await backend.updateConfig((c) => ({ ...c, weeksAhead: 4 }));
    await flush();
    expect(sync.liveWeekIds).toHaveLength(5);
  });

  it('refresh() re-reads everything', async () => {
    sync.start();
    await flush();
    sync.refresh();
    await flush();
    expect(backend.reads).toBe(8);
    expect(backend.activeListeners).toBe(4);
  });

  it('loads extra (past) weeks once and caches them', async () => {
    sync.start();
    await flush();
    const r1 = await sync.loadWeeks(['2026-W46', '2026-W48']);
    expect(Object.keys(r1)).toEqual(['2026-W46', '2026-W48']);
    const reads = backend.reads;
    await sync.loadWeeks(['2026-W46']);
    expect(backend.reads).toBe(reads);
  });

  it('notifies subscribers and stops cleanly', async () => {
    const seen: string[] = [];
    const off = sync.subscribe((s) => seen.push(s.status));
    sync.start();
    await flush();
    expect(seen[0]).toBe('connecting');
    expect(seen.at(-1)).toBe('live');
    off();
    sync.stop();
    expect(backend.activeListeners).toBe(0);
  });

  it('a whole day of typical use stays far below the free quota', async () => {
    // 6 people × open the app 6 times a day × ~4 changes seen per session
    sync.start();
    await flush();
    let reads = backend.reads;
    for (let i = 0; i < 6; i++) {
      vis.set(false);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      vis.set(true);
      await flush();
      for (let c = 0; c < 4; c++) backend.setWeek('2026-W48', backend.getWeek('2026-W48'));
    }
    reads = backend.reads - reads;
    expect(reads).toBeLessThan(60); // per person per day; ×6 people ≈ 360 of 50 000 free reads
  });
});
