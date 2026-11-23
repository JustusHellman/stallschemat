import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Backend } from '../data/backend';
import { demoNow, isDemo } from '../data/setup';
import { SyncController, type SyncState } from '../data/sync';
import { localISODate, weekId } from '../domain/dates';
import { errorMessage, type Mutation } from '../domain/rules';
import type { Config, DayOverride } from '../domain/types';
import { Admin } from './admin/Admin';
import { Dot, relativeTime, Sheet, Toast } from './common';
import { Ctx, type AppCtx, type Tab } from './context';
import { Settings } from './Settings';
import { WeekView } from './WeekView';
import { WhoAreYou } from './WhoAreYou';
import { buildWeek, horizonEnd } from '../domain/schedule';
import { freeLabel } from '../domain/text';

const ME_KEY = 'stallschemat-me';
const ADMIN_KEY = 'stallschemat-admin';

function useNow(): Date {
  const [now, setNow] = useState(() => (isDemo ? demoNow() : new Date()));
  useEffect(() => {
    if (isDemo && sessionStorage.getItem('stallschemat-now')) return; // pinned clock in demo/tests
    const tick = () => setNow(isDemo ? demoNow() : new Date());
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return now;
}

export function App({ backend }: { backend: Backend }) {
  const sync = useMemo(() => new SyncController({ backend, clock: () => (isDemo ? demoNow() : new Date()) }), [backend]);
  const [state, setState] = useState<SyncState>(sync.snapshot);
  const now = useNow();
  const [me, setMeState] = useState<string | null>(() => localStorage.getItem(ME_KEY));
  const [adminHash, setAdminHash] = useState<string | null>(() => localStorage.getItem(ADMIN_KEY));
  const [tab, setTabState] = useState<Tab>('schema');
  const [viewWeek, setViewWeek] = useState(() => weekId(localISODate(now)));
  const [adminDay, setAdminDay] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: 'info' | 'error' } | null>(null);
  const [switching, setSwitching] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const off = sync.subscribe(setState);
    sync.start();
    return () => {
      off();
      sync.stop();
    };
  }, [sync]);

  const toast = useCallback((msg: string, kind: 'info' | 'error' = 'info') => {
    setToastMsg({ msg, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), kind === 'error' ? 5000 : 3200);
  }, []);

  // Keep the shown week sensible: follow the current week when it rolls over
  // (app left open over Sunday night) and stay inside the booking horizon.
  const currentWeekId = weekId(localISODate(now));
  const prevCurrent = useRef(currentWeekId);
  useEffect(() => {
    const last = weekId(horizonEnd(now, state.config.weeksAhead));
    setViewWeek((v) => (v === prevCurrent.current && v !== currentWeekId ? currentWeekId : v > last ? last : v));
    prevCurrent.current = currentWeekId;
  }, [currentWeekId, state.config.weeksAhead]);

  const isAdmin = !!adminHash && adminHash === state.config.adminHash;
  const nameOf = (id: string | null | undefined) => (id && state.config.people[id]?.name) || (id === 'admin' ? 'Admin' : '?');
  const colorOf = (id: string | null | undefined) => (id && state.config.people[id]?.color) || '#b8a999';

  const setMe = (id: string | null) => {
    if (id) localStorage.setItem(ME_KEY, id);
    else localStorage.removeItem(ME_KEY);
    setMeState(id);
  };
  const unlockAdmin = (hash: string | null) => {
    if (hash) localStorage.setItem(ADMIN_KEY, hash);
    else localStorage.removeItem(ADMIN_KEY);
    setAdminHash(hash);
  };
  const setTab = (t: Tab) => {
    setTabState(t);
    if (t !== 'admin') setAdminDay(null);
    window.scrollTo({ top: 0 });
  };

  const offlineMsg = 'Ingen anslutning just nu – försök igen om en stund.';

  const mutate = async (m: Mutation) => {
    try {
      const r = await backend.mutate(m, { config: state.config, isAdmin, now: isDemo ? demoNow() : new Date() });
      if (!r.ok) toast(errorMessage(r.error, nameOf), 'error');
      return r.ok;
    } catch (e) {
      console.error(e);
      toast(offlineMsg, 'error');
      return false;
    }
  };
  const setDay = (date: string, day: DayOverride | null) => mutate({ type: 'setDay', date, day, actor: me ?? 'admin' });
  const updateConfig = async (fn: (c: Config) => Config) => {
    try {
      await backend.updateConfig(fn);
      return true;
    } catch (e) {
      console.error(e);
      toast(offlineMsg, 'error');
      return false;
    }
  };

  const ctx: AppCtx = {
    state, sync, now, me, setMe, isAdmin, unlockAdmin, tab, setTab, viewWeek, setViewWeek,
    adminDay,
    openAdminDay: (d) => {
      setAdminDay(d);
      setTabState('admin');
      window.scrollTo({ top: 0 });
    },
    toast, mutate, setDay, updateConfig, nameOf, colorOf,
  };

  const needsIdentity = state.configLoaded && (!me || !state.config.people[me]);
  const currentTab = tab === 'admin' && !isAdmin ? 'settings' : tab;
  const freeSoon = useMemo(() => {
    const id = weekId(localISODate(now));
    return buildWeek(state.config, state.weeks[id], id, me, now).freeCount;
  }, [state, now, me]);

  const header = (() => {
    if (!state.configLoaded) return { title: 'Stallschemat', logo: true, sub: state.status === 'error' ? 'Kunde inte hämta schemat' : 'Hämtar schemat…' };
    if (needsIdentity) return { title: 'Stallschemat', logo: true, sub: 'Välkommen! Vem är du?' };
    if (currentTab === 'schema') {
      return {
        title: 'Stallschemat', logo: true,
        sub: freeSoon > 0 ? `Hej ${nameOf(me)}! ${freeLabel(freeSoon)} den här veckan` : `Hej ${nameOf(me)}! Alla pass är tagna den här veckan`,
      };
    }
    if (currentTab === 'admin') return { title: 'Admin', sub: 'Schema, statistik och personer' };
    return { title: 'Inställningar', sub: 'Kalender, installera appen och admin' };
  })();

  return (
    <Ctx.Provider value={ctx}>
      <div class="app">
        <header class="top">
          <div class="top-row">
            {currentTab === 'settings' && !needsIdentity && (
              <button class="icon-btn" onClick={() => setTab('schema')} aria-label="Tillbaka till schemat" data-testid="back">‹</button>
            )}
            <div class="grow">
              <h1>{'logo' in header && <span class="logo">🐴 </span>}{header.title}</h1>
              <div class="sub">{header.sub}</div>
            </div>
            {!needsIdentity && me && (
              <button class="me-chip" onClick={() => setSwitching(true)} aria-label={`Du är ${nameOf(me)} – tryck för att byta`} data-testid="me-chip">
                <Dot color={colorOf(me)} />
                <span class="nm">{nameOf(me)}</span>
                <span class="caret">▾</span>
              </button>
            )}
            {!needsIdentity && me && currentTab !== 'settings' && (
              <button class="icon-btn" onClick={() => setTab('settings')} aria-label="Inställningar" data-testid="settings-btn">⚙️</button>
            )}
          </div>
        </header>
        <StatusLine state={state} now={now} onRefresh={() => sync.refresh()} />

        <main class={isAdmin && !needsIdentity ? 'with-tabs' : ''}>
          {!state.configLoaded ? (
            state.status === 'error' ? <ConnectError error={state.error} onRetry={() => sync.refresh()} /> : <div class="loading">Laddar schemat…</div>
          ) : needsIdentity ? (
            <WhoAreYou />
          ) : currentTab === 'schema' ? (
            <WeekView />
          ) : currentTab === 'admin' ? (
            <Admin />
          ) : (
            <Settings />
          )}
        </main>

        {/* The bottom menu is only needed when there is more than the schedule (admins). */}
        {!needsIdentity && state.configLoaded && isAdmin && (
          <nav class="tabs" aria-label="Meny">
            <button class={currentTab === 'schema' ? 'on' : ''} onClick={() => setTab('schema')} aria-current={currentTab === 'schema'}>
              <span class="ico">📅</span>Schema
              {freeSoon > 0 && <span class="badge" aria-label={`${freeLabel(freeSoon)} denna vecka`}>{freeSoon}</span>}
            </button>
            <button class={currentTab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')} aria-current={currentTab === 'admin'}>
              <span class="ico">🔑</span>Admin
            </button>
          </nav>
        )}

        {switching && (
          <Sheet label="Byt person" onClose={() => setSwitching(false)}>
            <h3 style={{ marginBottom: '4px' }}>Vem är du?</h3>
            <p class="help" style={{ marginTop: 0 }}>Råkade du välja fel? Välj rätt namn här.</p>
            <WhoAreYou onDone={() => setSwitching(false)} />
          </Sheet>
        )}
        {toastMsg && <Toast msg={toastMsg.msg} kind={toastMsg.kind} />}
      </div>
    </Ctx.Provider>
  );
}

function StatusLine({ state, now, onRefresh }: { state: SyncState; now: Date; onRefresh: () => void }) {
  const text: Record<SyncState['status'], string> = {
    live: 'Uppdateras live',
    connecting: 'Hämtar senaste…',
    offline: 'Offline – visar sparat schema',
    paused: 'Pausad',
    error: 'Problem med anslutningen',
  };
  return (
    <div class={`status ${state.status}`} data-testid="status" data-status={state.status}>
      <span class="led" />
      <span>
        {text[state.status]}
        {state.lastUpdate && state.status !== 'live' && state.status !== 'connecting' && ` · ${relativeTime(state.lastUpdate, now.getTime())}`}
      </span>
      {(state.status === 'offline' || state.status === 'error') && <button onClick={onRefresh}>Försök igen</button>}
    </div>
  );
}

/** Friendly Swedish message when the first load fails (with a hint for the admin). */
function ConnectError({ error, onRetry }: { error?: string; onRetry: () => void }) {
  const denied = /permission|insufficient/i.test(error ?? '');
  return (
    <div class="card center mt" data-testid="connect-error">
      <h2>Kunde inte hämta schemat</h2>
      <p>
        {denied
          ? 'Databasen nekade åtkomst. Det beror nästan alltid på att säkerhetsreglerna inte är publicerade i Firebase (Firestore → Regler).'
          : 'Kontrollera internetanslutningen och försök igen.'}
      </p>
      <button class="btn dark block" onClick={onRetry}>Försök igen</button>
      <p class="help" style={{ fontSize: '11.5px' }}>Teknisk info: {error}</p>
    </div>
  );
}
