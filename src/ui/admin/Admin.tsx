import { useEffect, useMemo, useState } from 'preact/hooks';
import { orphanedAssignments, withTemplate } from '../../domain/admin';
import { addDays, formatLong, formatShort, isISODate, lastOfMonth, localISODate, weekId, weekIdRange, weeksCovering, weekStart } from '../../domain/dates';
import { COLORS, MAX_WEEKS_AHEAD, randomId } from '../../domain/defaults';
import { horizonEnd, parseAssignmentKey, slotsFor, sortSlots, templateFor, templateSlotsFor } from '../../domain/schedule';
import { computeStats } from '../../domain/stats';
import type { LogEntry, Slot, WeekDoc } from '../../domain/types';
import { hashAdminCode } from '../../domain/util';
import { validatePersonName, validateSlots } from '../../domain/validate';
import { ColorPicker, Dot, relativeTime } from '../common';
import { useApp } from '../context';
import { SlotEditor } from './SlotEditor';

type Section = 'oversikt' | 'grund' | 'dagar' | 'personer' | 'logg' | 'mer';

export function Admin() {
  const { adminDay } = useApp();
  const [section, setSection] = useState<Section>(adminDay ? 'dagar' : 'oversikt');
  useEffect(() => {
    if (adminDay) setSection('dagar');
  }, [adminDay]);
  const tabs: [Section, string][] = [
    ['oversikt', 'Översikt'],
    ['grund', 'Grundschema'],
    ['dagar', 'Enstaka dag'],
    ['personer', 'Personer'],
    ['logg', 'Logg'],
    ['mer', 'Mer'],
  ];
  return (
    <div>
      <div class="seg scroll" role="tablist" style={{ marginBottom: '12px' }}>
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={section === id} class={section === id ? 'on' : ''} onClick={() => setSection(id)}>
            {label}
          </button>
        ))}
      </div>
      {section === 'oversikt' && <Overview />}
      {section === 'grund' && <TemplateEditor />}
      {section === 'dagar' && <DayEditor />}
      {section === 'personer' && <People />}
      {section === 'logg' && <Log />}
      {section === 'mer' && <More />}
    </div>
  );
}

/* ---------- Översikt ---------- */

type Period = 'past4' | 'month' | 'coming';

function Overview() {
  const { state, sync, now, nameOf, colorOf, setTab, setViewWeek } = useApp();
  const [period, setPeriod] = useState<Period>('past4');
  const today = localISODate(now);
  const range = useMemo((): [string, string] => {
    if (period === 'past4') return [addDays(weekStart(today), -28), addDays(today, -1)];
    if (period === 'month') return [today.slice(0, 8) + '01', lastOfMonth(today)];
    return [today, horizonEnd(now, state.config.weeksAhead)];
  }, [period, today, state.config.weeksAhead]);
  const ids = useMemo(() => weeksCovering(range[0], range[1]), [range]);
  const [weeks, setWeeks] = useState<Record<string, WeekDoc> | null>(null);

  useEffect(() => {
    let alive = true;
    setWeeks(null);
    sync.loadWeeks(ids).then((w) => alive && setWeeks(w));
    return () => {
      alive = false;
    };
  }, [ids.join()]);

  // Live weeks override fetched ones (always freshest).
  const merged = weeks ? { ...weeks, ...pick(state.weeks, ids) } : null;
  const stats = merged ? computeStats(state.config, merged, range[0], range[1]) : null;
  const upcomingFree = useMemo(() => {
    const until = addDays(today, 13);
    const out: { date: string; slot: Slot }[] = [];
    for (let d = today; d <= until; d = addDays(d, 1)) {
      const w = state.weeks[weekId(d)];
      for (const s of slotsFor(state.config, w, d)) if (!w?.assignments[`${d}_${s.id}`]) out.push({ date: d, slot: s });
    }
    return out;
  }, [state, today]);
  const max = stats ? Math.max(1, ...stats.people.map((p) => p.total)) : 1;

  return (
    <div data-testid="admin-overview">
      <div class="seg" style={{ marginBottom: '12px' }}>
        <button class={period === 'past4' ? 'on' : ''} onClick={() => setPeriod('past4')}>Senaste 4 v</button>
        <button class={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>Denna månad</button>
        <button class={period === 'coming' ? 'on' : ''} onClick={() => setPeriod('coming')}>Kommande</button>
      </div>
      {!stats ? (
        <div class="loading" style={{ minHeight: '20vh' }}>Räknar…</div>
      ) : (
        <>
          <div class="kpis">
            <div class="kpi"><b>{stats.totalSlots}</b><small>pass totalt</small></div>
            <div class="kpi"><b>{stats.totalSlots - stats.freeSlots}</b><small>tagna</small></div>
            <div class={`kpi ${stats.freeSlots ? 'warn' : ''}`}><b>{stats.freeSlots}</b><small>{period === 'coming' ? 'lediga' : 'ej tagna'}</small></div>
          </div>
          <div class="card">
            <h2>Pass per person</h2>
            <p>{formatShort(range[0])} – {formatShort(range[1])}</p>
            <div style={{ overflowX: 'auto' }}>
              <table class="stats" data-testid="stats-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    {stats.types.map((t) => <th key={t}>{t}</th>)}
                    <th>Totalt</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.people.map((p) => (
                    <tr key={p.personId}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Dot color={colorOf(p.personId)} size="sm" /> {nameOf(p.personId)}
                        </span>
                        <div class="bar"><i style={{ width: `${(p.total / max) * 100}%`, background: colorOf(p.personId) }} /></div>
                      </td>
                      {stats.types.map((t) => (
                        <td key={t} class={p.byType[t] ? '' : 'zero'}>{p.byType[t] ?? 0}</td>
                      ))}
                      <td class="total">{p.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <div class="card">
        <h2>Lediga pass närmaste 2 veckorna ({upcomingFree.length})</h2>
        {upcomingFree.length === 0 && <p>Allt är tillsatt 🎉</p>}
        {upcomingFree.slice(0, 20).map(({ date, slot }) => (
          <div class="row free" key={date + slot.id}>
            <div class="main"><b>{slot.name}</b><small>{formatShort(date)} · {slot.time}</small></div>
            <button class="btn sm" onClick={() => { setViewWeek(weekId(date)); setTab('schema'); }}>Visa</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function pick<T>(o: Record<string, T>, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => o[k]).map((k) => [k, o[k]]));
}

/* ---------- Grundschema ---------- */

function TemplateEditor() {
  const app = useApp();
  const { state, now } = app;
  const today = localISODate(now);
  const nextMonday = addDays(weekStart(today), 7);
  const [validFrom, setValidFrom] = useState(nextMonday);
  const current = templateFor(state.config.templates, validFrom);
  const [kind, setKind] = useState<'weekday' | 'weekend'>('weekday');
  const [draft, setDraft] = useState(() => ({ weekday: sortSlots(current.weekday), weekend: sortSlots(current.weekend) }));
  const [err, setErr] = useState<string | null>(null);
  const [confirmOrphans, setConfirmOrphans] = useState<string[] | null>(null);

  const save = async (force = false) => {
    setErr(null);
    const e = validateSlots(draft.weekday) ?? validateSlots(draft.weekend) ?? (isISODate(validFrom) ? null : 'Välj ett datum.');
    if (e) return setErr(e);
    const t = { validFrom, weekday: sortSlots(draft.weekday.map(trimName)), weekend: sortSlots(draft.weekend.map(trimName)) };
    const next = withTemplate(state.config, t);
    const orphans = orphanedAssignments(state.config, next, state.weeks);
    if (orphans.length && !force) return setConfirmOrphans(orphans);
    setConfirmOrphans(null);
    if (await app.updateConfig((c) => withTemplate(c, t))) app.toast(`Grundschemat är sparat (gäller från ${formatShort(validFrom)}).`);
  };

  const versions = [...state.config.templates].sort((a, b) => b.validFrom.localeCompare(a.validFrom));

  return (
    <div data-testid="template-editor">
      <div class="card">
        <h2>Grundschema</h2>
        <p>Så här ser varje vecka ut. Ändringen gäller från datumet du väljer – tidigare veckor påverkas inte, och dagar som ändrats var för sig behåller sina pass.</p>
        <div class="seg">
          <button class={kind === 'weekday' ? 'on' : ''} onClick={() => setKind('weekday')}>Vardagar (mån–fre)</button>
          <button class={kind === 'weekend' ? 'on' : ''} onClick={() => setKind('weekend')}>Helg (lör–sön)</button>
        </div>
        <SlotEditor slots={draft[kind]} onChange={(s) => setDraft({ ...draft, [kind]: s })} />
        <label class="f" for="valid-from">Gäller från</label>
        <input id="valid-from" class="input" type="date" value={validFrom} min={today} onInput={(e) => setValidFrom((e.target as HTMLInputElement).value)} />
        {err && <div class="err">{err}</div>}
        {confirmOrphans ? (
          <div class="warn mt">
            {confirmOrphans.length} redan bokade pass försvinner med det nya schemat ({confirmOrphans.slice(0, 3).map((k) => { const p = parseAssignmentKey(k); return `${formatShort(p.date)}`; }).join(', ')}{confirmOrphans.length > 3 ? '…' : ''}). Säg till de berörda!
            <button class="btn amber block" onClick={() => save(true)}>Spara ändå</button>
            <button class="btn block" onClick={() => setConfirmOrphans(null)}>Avbryt</button>
          </div>
        ) : (
          <button class="btn primary block" onClick={() => save()}>Spara grundschema</button>
        )}
      </div>
      {versions.length > 1 && (
        <div class="card">
          <h2>Versioner</h2>
          {versions.map((v) => (
            <div class="row" key={v.validFrom} style={{ boxShadow: 'none', padding: '6px 0' }}>
              <div class="main">
                <b>{v.validFrom <= '2000-01-01' ? 'Från början' : `Från ${formatShort(v.validFrom)}`}</b>
                <small>{v.weekday.length} vardagspass · {v.weekend.length} helgpass</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const trimName = (s: Slot): Slot => ({ ...s, name: s.name.trim() });

/* ---------- Enstaka dag ---------- */

function DayEditor() {
  const app = useApp();
  const { state, now, adminDay } = app;
  const today = localISODate(now);
  const [date, setDate] = useState(adminDay ?? today);
  useEffect(() => {
    if (adminDay) setDate(adminDay);
  }, [adminDay]);
  const validDate = isISODate(date);
  const week = validDate ? state.weeks[weekId(date)] : undefined;
  const override = week?.days[date];
  const [slots, setSlots] = useState<Slot[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'save' | 'reset'; names: string[] } | null>(null);
  useEffect(() => {
    if (!week) return;
    setSlots(slotsFor(state.config, week, date));
    setNote(override?.note ?? '');
    setErr(null);
    setConfirm(null);
  }, [date, !!week]);
  const inRange = !!week && date >= today;

  /** Booked shifts on this date that would disappear with the given slot list. */
  const lostBookings = (next: Slot[]) =>
    slotsFor(state.config, week, date)
      .filter((s) => week?.assignments[`${date}_${s.id}`] && !next.some((n) => n.id === s.id))
      .map((s) => `${s.name} (${app.nameOf(week!.assignments[`${date}_${s.id}`])})`);

  const save = async (force = false) => {
    const e = validateSlots(slots);
    if (e) return setErr(e);
    const lost = lostBookings(slots);
    if (lost.length && !force) return setConfirm({ kind: 'save', names: lost });
    setConfirm(null);
    const ok = await app.setDay(date, { slots: sortSlots(slots.map(trimName)), ...(note.trim() ? { note: note.trim().slice(0, 80) } : {}) });
    if (ok) app.toast(`${formatLong(date)} är ändrad.`);
  };
  const reset = async (force = false) => {
    const lost = lostBookings(templateSlotsFor(state.config, date));
    if (lost.length && !force) return setConfirm({ kind: 'reset', names: lost });
    setConfirm(null);
    if (await app.setDay(date, null)) {
      setSlots(templateSlotsFor(state.config, date));
      setNote('');
      app.toast(`${formatLong(date)} följer grundschemat igen.`);
    }
  };

  return (
    <div class="card" data-testid="day-editor">
      <h2>Ändra en enstaka dag</h2>
      <p>T.ex. hovslagare, veterinär eller ett pass som inte behövs. Bokade pass som finns kvar behålls.</p>
      <label class="f" for="day-date">Datum</label>
      <input id="day-date" class="input" type="date" value={date} min={today} max={horizonEnd(now, state.config.weeksAhead)} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      {!inRange ? (
        <p class="help mt">Välj ett datum inom bokningsperioden.</p>
      ) : (
        <>
          <p class="help mt">
            <b>{formatLong(date)}</b> – {override ? 'ändrad dag' : 'följer grundschemat'}
          </p>
          <SlotEditor slots={slots} onChange={setSlots} />
          <label class="f" for="day-note">Notering (visas i schemat)</label>
          <input id="day-note" class="input" maxLength={80} placeholder="t.ex. Hovslagaren kommer 10:00" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
          {err && <div class="err">{err}</div>}
          {confirm ? (
            <div class="warn mt">
              Bokade pass försvinner: {confirm.names.join(', ')}. Säg till de berörda!
              <button class="btn amber block" onClick={() => (confirm.kind === 'save' ? save(true) : reset(true))}>
                {confirm.kind === 'save' ? 'Spara ändå' : 'Återställ ändå'}
              </button>
              <button class="btn block" onClick={() => setConfirm(null)}>Avbryt</button>
            </div>
          ) : (
            <>
              <button class="btn primary block" onClick={() => save()}>Spara dagen</button>
              {override && <button class="btn block" onClick={() => reset()}>Återställ till grundschemat</button>}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Personer ---------- */

function People() {
  const app = useApp();
  const { state } = app;
  const entries = Object.entries(state.config.people).sort((a, b) => Number(b[1].active) - Number(a[1].active) || a[1].name.localeCompare(b[1].name, 'sv'));
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [err, setErr] = useState<string | null>(null);

  const startEdit = (id: string | 'new') => {
    setEditing(id);
    setErr(null);
    if (id === 'new') {
      setName('');
      setColor(COLORS.find((c) => !entries.some(([, p]) => p.color === c)) ?? COLORS[0]);
    } else {
      setName(state.config.people[id].name);
      setColor(state.config.people[id].color);
    }
  };
  const save = async () => {
    const others = entries.filter(([id]) => id !== editing).map(([, p]) => p.name);
    const e = validatePersonName(name, others);
    if (e) return setErr(e);
    const id = editing === 'new' ? randomId() : editing!;
    const ok = await app.updateConfig((c) => ({
      ...c,
      people: { ...c.people, [id]: { name: name.trim(), color, active: c.people[id]?.active ?? true } },
    }));
    if (ok) setEditing(null);
  };
  const toggleActive = (id: string) =>
    app.updateConfig((c) => ({ ...c, people: { ...c.people, [id]: { ...c.people[id], active: !c.people[id].active } } }));

  return (
    <div data-testid="people-admin">
      {entries.map(([id, p]) => (
        <div key={id}>
          <div class="row" style={{ opacity: p.active ? 1 : 0.55 }}>
            <Dot color={p.color} />
            <div class="main">
              <b>{p.name}</b>
              <small>{p.active ? 'Aktiv' : 'Inaktiv – visas inte i listor'}</small>
            </div>
            <button class="btn sm" onClick={() => startEdit(id)}>Ändra</button>
            <button class="btn sm" onClick={() => toggleActive(id)}>{p.active ? 'Inaktivera' : 'Aktivera'}</button>
          </div>
          {editing === id && <PersonForm {...{ name, setName, color, setColor, err, save, cancel: () => setEditing(null) }} />}
        </div>
      ))}
      {editing === 'new' ? (
        <PersonForm {...{ name, setName, color, setColor, err, save, cancel: () => setEditing(null) }} />
      ) : (
        <button class="btn block" onClick={() => startEdit('new')}>＋ Lägg till person</button>
      )}
      <p class="help">Inaktiva personer försvinner från listorna men deras gamla pass finns kvar i statistiken.</p>
    </div>
  );
}

function PersonForm(p: { name: string; setName: (s: string) => void; color: string; setColor: (c: string) => void; err: string | null; save: () => void; cancel: () => void }) {
  return (
    <div class="card">
      <label class="f">Namn</label>
      <input class="input" value={p.name} maxLength={24} onInput={(e) => p.setName((e.target as HTMLInputElement).value)} aria-label="Namn" />
      <label class="f">Färg</label>
      <ColorPicker value={p.color} onChange={p.setColor} />
      {p.err && <div class="err">{p.err}</div>}
      <button class="btn primary block" onClick={p.save}>Spara</button>
      <button class="btn block" onClick={p.cancel}>Avbryt</button>
    </div>
  );
}

/* ---------- Logg ---------- */

const ACTION_TEXT: Record<LogEntry['action'], string> = {
  claim: 'tog',
  release: 'släppte',
  assign: 'satte',
  unassign: 'tog bort',
  day: 'ändrade dagen',
  resetDay: 'återställde dagen',
};

function Log() {
  const { state, sync, now, nameOf } = useApp();
  const ids = useMemo(() => weekIdRange(addDays(localISODate(now), -14), 3 + state.config.weeksAhead), [now, state.config.weeksAhead]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    sync.loadWeeks(ids).then(() => setLoaded(true));
  }, [ids.join()]);
  const entries = ids
    .flatMap((id) => state.weeks[id]?.log ?? [])
    .sort((a, b) => b.at - a.at)
    .slice(0, 100);

  const describe = (e: LogEntry) => {
    if (e.action === 'day' || e.action === 'resetDay') return `${nameOf(e.actor)} ${ACTION_TEXT[e.action]} ${formatShort(e.key)}`;
    const { date, slotId } = parseAssignmentKey(e.key);
    const slotName = slotsFor(state.config, state.weeks[weekId(date)], date).find((s) => s.id === slotId)?.name ?? slotId;
    const actor = e.actor === 'admin' ? 'Admin' : nameOf(e.actor);
    if (e.action === 'claim' || e.action === 'release') return `${actor} ${ACTION_TEXT[e.action]} ${slotName} ${formatShort(date)}`;
    return `${actor} ${ACTION_TEXT[e.action]} ${nameOf(e.person)} ${e.action === 'assign' ? 'på' : 'från'} ${slotName} ${formatShort(date)}`;
  };

  return (
    <div class="card log" data-testid="admin-log">
      <h2>Senaste ändringarna</h2>
      <p>Allt som händer i schemat loggas här – så går det att reda ut misstag.</p>
      {!loaded && <p>Hämtar…</p>}
      {loaded && entries.length === 0 && <p>Inga ändringar ännu.</p>}
      <ul>
        {entries.map((e, i) => (
          <li key={i}>
            <span>{describe(e)}</span>
            <time>{relativeTime(e.at, now.getTime())}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Mer ---------- */

function More() {
  const app = useApp();
  const { state } = app;
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const setWeeks = (n: number) => app.updateConfig((c) => ({ ...c, weeksAhead: Math.min(MAX_WEEKS_AHEAD, Math.max(1, n)) }));
  const changeCode = async () => {
    setErr(null);
    if (!/^\S{4,}$/.test(code.trim())) return setErr('Koden måste vara minst 4 tecken.');
    const hash = await hashAdminCode(code);
    if (await app.updateConfig((c) => ({ ...c, adminHash: hash }))) {
      app.unlockAdmin(hash);
      setCode('');
      app.toast('Ny admin-kod sparad. Andra enheter måste låsa upp igen.');
    }
  };

  return (
    <div>
      <div class="card">
        <h2>Hur långt fram kan man boka?</h2>
        <p>Antal veckor efter den här veckan som syns och kan bokas.</p>
        <div class="stepper">
          <button class="btn" onClick={() => setWeeks(state.config.weeksAhead - 1)} aria-label="Färre veckor">−</button>
          <b data-testid="weeks-ahead">{state.config.weeksAhead}</b>
          <button class="btn" onClick={() => setWeeks(state.config.weeksAhead + 1)} aria-label="Fler veckor">＋</button>
          <span class="muted">veckor</span>
        </div>
      </div>
      <div class="card">
        <h2>Byt admin-kod</h2>
        <input class="input" type="password" autoComplete="off" placeholder="Ny kod" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} aria-label="Ny admin-kod" />
        {err && <div class="err">{err}</div>}
        <button class="btn dark block" onClick={changeCode}>Spara ny kod</button>
      </div>
      <div class="card">
        <h2>Lås admin</h2>
        <p>Lås admin-läget på den här enheten.</p>
        <button class="btn block" onClick={() => { app.unlockAdmin(null); app.setTab('settings'); }}>Lås</button>
      </div>
    </div>
  );
}
