import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { SyncController, SyncState } from '../data/sync';
import type { Mutation } from '../domain/rules';
import type { Config, DayOverride } from '../domain/types';

export type Tab = 'schema' | 'settings' | 'admin';

export interface AppCtx {
  state: SyncState;
  sync: SyncController;
  now: Date;
  me: string | null;
  setMe: (id: string | null) => void;
  isAdmin: boolean;
  unlockAdmin: (hash: string | null) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  /** Week id shown in the schedule tab. */
  viewWeek: string;
  setViewWeek: (id: string) => void;
  /** Date preselected in the admin day editor. */
  adminDay: string | null;
  openAdminDay: (date: string) => void;
  toast: (msg: string, kind?: 'info' | 'error') => void;
  /** Returns true on success (errors are toasted). */
  mutate: (m: Mutation) => Promise<boolean>;
  setDay: (date: string, day: DayOverride | null) => Promise<boolean>;
  updateConfig: (fn: (c: Config) => Config) => Promise<boolean>;
  nameOf: (id: string | null | undefined) => string;
  colorOf: (id: string | null | undefined) => string;
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);
