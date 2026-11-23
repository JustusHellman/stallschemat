import { addDays, formatShort, localISODate, weekNumber } from '../domain/dates';
import type { SlotView } from '../domain/schedule';
import { Sheet } from './common';
import { useApp } from './context';

export function whenLabel(date: string, today: string): string {
  return date === today ? 'idag' : date === addDays(today, 1) ? 'imorgon' : formatShort(date);
}

/** Compact "your next shift" card at the top of the schedule. */
export function NextShiftCard({ mine, onShowAll }: { mine: SlotView[]; onShowAll: () => void }) {
  const { now, state } = useApp();
  const today = localISODate(now);
  const next = mine[0];
  return (
    <button class="next-card" onClick={onShowAll} data-testid="next-shift" disabled={!next}>
      {next ? (
        <>
          <span class="grow">
            <small>Ditt nästa pass</small>
            <b>
              {next.slot.name} {whenLabel(next.date, today)} {next.slot.time}
            </b>
          </span>
          <span class="all">
            Alla mina ({mine.length}) ›
          </span>
        </>
      ) : (
        <span class="grow">
          <small>Inga bokade pass de kommande {state.config.weeksAhead + 1} veckorna</small>
          <b>Tryck på ett streckat pass för att ta det</b>
        </span>
      )}
    </button>
  );
}

/** List of all own upcoming shifts. Tapping one opens its sheet (release / calendar). */
export function MyShiftsSheet({ mine, onClose, onOpen }: { mine: SlotView[]; onClose: () => void; onOpen: (s: SlotView) => void }) {
  const { now, setTab } = useApp();
  const today = localISODate(now);
  const openCalendar = () => {
    onClose();
    setTab('settings');
    setTimeout(() => document.querySelector('[data-testid="calendar-card"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
  };
  const groups: { week: number; items: SlotView[] }[] = [];
  for (const s of mine) {
    const w = weekNumber(s.date);
    if (groups.at(-1)?.week !== w) groups.push({ week: w, items: [] });
    groups.at(-1)!.items.push(s);
  }
  return (
    <Sheet label="Mina pass" onClose={onClose}>
      <h3>Mina pass ({mine.length})</h3>
      <div class="meta">Tryck på ett pass för att släppa det eller lägga det i kalendern.</div>
      {groups.map((g) => (
        <div key={g.week}>
          <div class="help" style={{ margin: '10px 2px 6px', fontWeight: 700 }}>Vecka {g.week}</div>
          {g.items.map((s) => (
            <button class="row mine" key={s.key} data-testid="my-row" onClick={() => onOpen(s)} style={{ width: '100%', textAlign: 'left' }}>
              <span class="main">
                <b>{s.slot.name}</b>
                <small>
                  {whenLabel(s.date, today)} · {s.slot.time}
                </small>
              </span>
              <span class="muted">›</span>
            </button>
          ))}
        </div>
      ))}
      <button class="btn block" onClick={openCalendar}>📆 Få in passen i telefonens kalender</button>
      <button class="btn block" onClick={onClose}>Stäng</button>
    </Sheet>
  );
}
