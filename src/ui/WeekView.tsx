import { useEffect, useMemo, useState } from 'preact/hooks';
import { addDays, formatWeekRange, localISODate, WEEKDAYS_SHORT, weekId, weekIdToMonday, weekNumber, weekStart } from '../domain/dates';
import { buildWeek, horizonEnd, upcomingSlots, type DayView, type SlotView } from '../domain/schedule';
import { freeLabel, weekAsText } from '../domain/text';
import { textColorFor } from '../domain/util';
import { Dot } from './common';
import { useApp } from './context';
import { InstallBanner } from './Install';
import { shareText } from './platform';
import { MyShiftsSheet, NextShiftCard } from './MyShifts';
import { SlotSheet } from './SlotSheet';

const FILTER_KEY = 'stallschemat-filter';

export function WeekView() {
  const app = useApp();
  const { state, me, now, viewWeek, setViewWeek, isAdmin } = app;
  const [open, setOpen] = useState<SlotView | null>(null);
  const [onlyRelevant, setOnlyRelevant] = useState(() => localStorage.getItem(FILTER_KEY) === '1');
  const [showPast, setShowPast] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const today = localISODate(now);
  const currentWeek = weekId(today);
  const lastWeek = weekId(horizonEnd(now, state.config.weeksAhead));
  const view = useMemo(() => buildWeek(state.config, state.weeks[viewWeek], viewWeek, me, now), [state, viewWeek, me, now]);
  const loaded = !!state.weeks[viewWeek];
  const upcoming = useMemo(() => upcomingSlots(state.config, state.weeks, me, now), [state, me, now]);
  const mine = useMemo(() => upcoming.filter((s) => s.status === 'mine'), [upcoming]);

  // Past weeks are not kept live – fetch once on demand.
  useEffect(() => {
    if (viewWeek < currentWeek) app.sync.loadWeeks([viewWeek]).catch(() => app.toast('Kunde inte hämta veckan.', 'error'));
  }, [viewWeek, currentWeek]);

  const go = (delta: number) => setViewWeek(weekId(addDays(weekIdToMonday(viewWeek), delta * 7)));
  const toggleFilter = () => {
    localStorage.setItem(FILTER_KEY, onlyRelevant ? '0' : '1');
    setOnlyRelevant(!onlyRelevant);
  };
  const share = async () => {
    const r = await shareText(weekAsText(state.config, state.weeks[viewWeek], viewWeek));
    if (r === 'copied') app.toast('Veckan är kopierad – klistra in i gruppchatten.');
    if (r === 'failed') app.toast('Kunde inte kopiera.', 'error');
  };

  const scrollToFree = () => {
    const el = document.querySelector<HTMLElement>('.slot.free:not(.past)');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1200);
  };

  const isCurrent = viewWeek === currentWeek;
  const pastDays = isCurrent ? view.days.filter((d) => d.past) : [];
  const days = isCurrent && !showPast ? view.days.filter((d) => !d.past) : view.days;

  return (
    <div>
      <InstallBanner />
      <NextShiftCard mine={mine} onShowAll={() => setListOpen(true)} />
      <div class="weeknav">
        <button class="navbtn" onClick={() => go(-1)} aria-label="Föregående vecka" disabled={viewWeek <= weekId(addDays(weekStart(today), -7 * 8))}>‹</button>
        <div class="title">
          <b>Vecka {weekNumber(view.monday)}</b>
          <small>{formatWeekRange(view.monday)}</small>
        </div>
        <button class="navbtn" onClick={() => go(1)} aria-label="Nästa vecka" disabled={viewWeek >= lastWeek}>›</button>
      </div>

      <div class="toolbar">
        {view.freeCount > 0 ? (
          <button class="pill amber" data-testid="free-count" onClick={scrollToFree} aria-label={`${freeLabel(view.freeCount)} – visa första`}>
            {view.freeCount} {view.freeCount === 1 ? 'ledigt' : 'lediga'}
          </button>
        ) : (
          loaded && viewWeek >= currentWeek && <span class="pill">Alla pass tagna ✓</span>
        )}
        <button class={`pill ${onlyRelevant ? 'on' : ''}`} onClick={toggleFilter} aria-pressed={onlyRelevant}>
          {onlyRelevant ? '✓ ' : ''}Mina & lediga
        </button>
        <span class="spacer" />
        {!isCurrent && (
          <button class="pill" onClick={() => setViewWeek(currentWeek)}>Idag</button>
        )}
        <button class="pill" onClick={share} aria-label="Dela veckan som text">Dela</button>
      </div>

      {pastDays.length > 0 && (
        <button class="collapsed-note" style={{ width: '100%' }} onClick={() => setShowPast(!showPast)}>
          {showPast ? 'Dölj passerade dagar ▴' : pastDays.length === 1 ? 'Visa 1 passerad dag ▾' : `Visa ${pastDays.length} passerade dagar ▾`}
        </button>
      )}

      {!loaded ? (
        <div class="loading">Hämtar schemat…</div>
      ) : (
        days.map((d) => <DayCard key={d.date} day={d} onlyRelevant={onlyRelevant} onOpen={setOpen} isAdmin={isAdmin} />)
      )}

      {listOpen && (
        <MyShiftsSheet
          mine={mine}
          onClose={() => setListOpen(false)}
          onOpen={(s) => {
            setListOpen(false);
            setOpen(s);
          }}
        />
      )}
      {open && <SlotSheet slot={liveSlot(open, view, upcoming)} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Keep the open sheet in sync if someone else changes the slot meanwhile. */
function liveSlot(open: SlotView, view: ReturnType<typeof buildWeek>, upcoming: SlotView[]): SlotView {
  return view.days.flatMap((d) => d.slots).find((s) => s.key === open.key) ?? upcoming.find((s) => s.key === open.key) ?? open;
}

function DayCard({ day, onlyRelevant, onOpen, isAdmin }: { day: DayView; onlyRelevant: boolean; onOpen: (s: SlotView) => void; isAdmin: boolean }) {
  const app = useApp();
  const idx = (new Date(day.date + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const visible = day.slots.filter((s) => !onlyRelevant || s.status !== 'taken');
  return (
    <section class={`day ${day.isToday ? 'today' : ''} ${day.past ? 'past' : ''}`} aria-label={`${WEEKDAYS_SHORT[idx]} ${+day.date.slice(8)}`} data-date={day.date}>
      <div class="dh">
        <b>
          {WEEKDAYS_SHORT[idx]} {+day.date.slice(8)}
          {day.isToday && <span class="today-tag">IDAG</span>}
        </b>
        <small>
          {day.weekend ? 'helg' : 'vardag'}
          {day.changed && ' · ändrad'}
          {isAdmin && (
            <>
              {' · '}
              <button class="link" onClick={() => app.openAdminDay(day.date)}>ändra dag</button>
            </>
          )}
        </small>
      </div>
      {day.note && <div class="note">📌 {day.note}</div>}
      {day.slots.length === 0 && <div class="empty-day">Inga pass den här dagen.</div>}
      {onlyRelevant && visible.length === 0 && day.slots.length > 0 && <div class="empty-day">Inga lediga eller egna pass.</div>}
      <div class="slots">
        {visible.map((s) => (
          <SlotButton key={s.key} s={s} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function SlotButton({ s, onOpen }: { s: SlotView; onOpen: (s: SlotView) => void }) {
  const { nameOf, colorOf, me } = useApp();
  const style =
    s.status === 'mine' ? { background: colorOf(me), color: textColorFor(colorOf(me)) } : undefined;
  const who = s.status === 'mine' ? '✓ Du' : s.status === 'free' ? (s.past ? 'Ingen' : 'Ta ＋') : nameOf(s.assignee);
  const aria = `${s.slot.name} ${s.slot.time}, ${s.status === 'mine' ? 'ditt pass' : s.status === 'free' ? 'ledigt' : `taget av ${nameOf(s.assignee)}`}`;
  return (
    <button class={`slot ${s.status} ${s.past ? 'past' : ''}`} style={style} onClick={() => onOpen(s)} aria-label={aria} data-key={s.key} data-status={s.status}>
      {s.status === 'taken' && <Dot color={colorOf(s.assignee)} size="sm" />}
      <span>
        <span class="nm">{s.slot.name.replace(/([+/])/g, '$1\u200b')}</span>
        <span class="tm">{s.slot.time}</span>
      </span>
      <span class="who">{who}</span>
    </button>
  );
}
