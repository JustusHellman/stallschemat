import { useState } from 'preact/hooks';
import { formatLong, localDateTime } from '../domain/dates';
import { buildCalendar, collectEvents } from '../domain/ics';
import type { SlotView } from '../domain/schedule';
import { weekId } from '../domain/dates';
import { Dot, Sheet } from './common';
import { useApp } from './context';
import { downloadFile } from './platform';

/** Bottom sheet for a tapped shift: take / release / (admin) assign. */
export function SlotSheet({ slot, onClose }: { slot: SlotView; onClose: () => void }) {
  const app = useApp();
  const { me, isAdmin, nameOf, now, state } = app;
  const [busy, setBusy] = useState(false);
  const title = `${slot.slot.name} · ${formatLong(slot.date).toLowerCase()}`;
  const start = localDateTime(slot.date, slot.slot.time).getTime();
  const soon = start - now.getTime() < 24 * 3600_000 && !slot.past;

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) onClose();
  };

  const claim = () =>
    run(async () => {
      const ok = await app.mutate({ type: 'claim', key: slot.key, person: me! });
      if (ok) app.toast(`Tack! ${slot.slot.name} ${formatLong(slot.date).toLowerCase()} är ditt 💚`);
      return ok;
    });
  const release = () =>
    run(async () => {
      const ok = await app.mutate({ type: 'release', key: slot.key, person: me! });
      if (ok) app.toast('Passet är släppt och syns nu som ledigt för alla.');
      return ok;
    });
  const assign = (person: string | null) =>
    run(() => app.mutate({ type: 'assign', key: slot.key, person, actor: me ?? 'admin' }));

  const addToCalendar = () => {
    const events = collectEvents(state.config, { [weekId(slot.date)]: state.weeks[weekId(slot.date)] }, slot.date, slot.date, me!).filter(
      (e) => e.uid.startsWith(slot.key + '-'),
    );
    downloadFile(`stall-${slot.key}.ics`, buildCalendar('Stallschemat', events, new Date()));
  };

  const people = Object.entries(state.config.people).filter(([, p]) => p.active);

  return (
    <Sheet onClose={onClose} label={title}>
      <h3>{title}</h3>
      <div class="meta">
        Kl. {slot.slot.time} ·{' '}
        {slot.status === 'free' ? 'ingen har tagit passet än' : slot.status === 'mine' ? 'ditt pass' : `taget av ${nameOf(slot.assignee)}`}
      </div>

      {slot.past && !isAdmin && <div class="warn">Det här passet har redan varit.</div>}

      {slot.status === 'free' && !slot.past && (
        <button class="btn primary block" disabled={busy} onClick={claim} data-testid="claim">
          Jag tar det
        </button>
      )}

      {slot.status === 'mine' && !slot.past && (
        <>
          {soon && <div class="warn">Passet börjar inom ett dygn – skriv gärna i gruppchatten också så att någon hinner ta det.</div>}
          <button class="btn block" onClick={addToCalendar}>📅 Lägg till i kalendern</button>
          <button class="btn danger block" disabled={busy} onClick={release} data-testid="release">
            Släpp passet – jag kan inte
          </button>
        </>
      )}

      {slot.status === 'taken' && !isAdmin && (
        <p class="help">Vill du byta? Hör av dig till {nameOf(slot.assignee)} – när passet släpps kan du ta det här.</p>
      )}

      {isAdmin && (
        <div class="mt">
          <label class="f">Admin: sätt person</label>
          <div class="people">
            {people.map(([id, p]) => (
              <button key={id} class={`person ${slot.assignee === id ? 'sel' : ''}`} disabled={busy} onClick={() => assign(id)}>
                <Dot color={p.color} size="md" />
                {p.name}
              </button>
            ))}
            <button class={`person new ${slot.assignee === null ? 'sel' : ''}`} disabled={busy} onClick={() => assign(null)}>
              Ingen (ledigt)
            </button>
          </div>
        </div>
      )}

      <button class="btn block" onClick={onClose}>Stäng</button>
    </Sheet>
  );
}
