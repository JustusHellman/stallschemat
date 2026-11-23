import { describe, expect, it } from 'vitest';
import { MemoryBackend } from '../../src/data/memory';
import { at, testConfig } from './helpers';

describe('MemoryBackend', () => {
  it('applies mutations atomically and rejects double bookings', async () => {
    const config = testConfig();
    const b = new MemoryBackend({ config });
    const ctx = { config, isAdmin: false, now: at('2026-11-22 12:00') };
    const [r1, r2] = await Promise.all([
      b.mutate({ type: 'claim', key: '2026-11-23_frukost', person: 'maja' }, ctx),
      b.mutate({ type: 'claim', key: '2026-11-23_frukost', person: 'anna' }, ctx),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2).toEqual({ ok: false, error: { code: 'taken', by: 'maja' } });
    expect(b.getWeek('2026-W48').assignments).toEqual({ '2026-11-23_frukost': 'maja' });
  });

  it('does not write on no-op mutations', async () => {
    const config = testConfig();
    const b = new MemoryBackend({ config });
    await b.mutate({ type: 'release', key: '2026-11-23_frukost', person: 'maja' }, { config, isAdmin: false, now: at('2026-11-22 12:00') });
    expect(b.writes).toBe(0);
  });

  it('updates config and returns defaults when missing', async () => {
    const b = new MemoryBackend();
    const c = await b.updateConfig((c) => ({ ...c, people: { x: { name: 'X', color: '#000000', active: true } } }));
    expect(c.people.x.name).toBe('X');
    expect(c.weeksAhead).toBe(6);
  });

  it('persists to storage when a key is given', async () => {
    const store: Record<string, string> = {};
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => (store[k] = v),
    };
    const b1 = new MemoryBackend({ config: testConfig() }, 'k');
    await b1.updateConfig((c) => ({ ...c, weeksAhead: 3 }));
    const b2 = new MemoryBackend(undefined, 'k');
    expect((await b2.updateConfig((c) => c)).weeksAhead).toBe(3);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
