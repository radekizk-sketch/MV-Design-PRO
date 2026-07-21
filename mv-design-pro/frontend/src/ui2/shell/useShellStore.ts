/*
 * Stan prezentacji powłoki (okno W-110) — WYŁĄCZNIE ustawienia UI, nie dane modelu
 * (SPEC_UKLAD_PANELI §1.5: „zapis układu nie jest danymi modelu"). To nie jest
 * shadow-state: aktywny przypadek/gotowość/rewizja są czytane z istniejących
 * store'ów przez adapter (shellStatus.ts). Tutaj żyją tylko: aktywna przestrzeń,
 * tryb zaawansowania, szerokości/zwinięcia paneli (per przestrzeń) oraz panel dolny.
 *
 * Trwałość: magazyn ustawień powłoki (localStorage) per przestrzeń. Wymiar
 * „per użytkownik" realizuje `userScope` (prefiks nazwy magazynu) — domyślnie
 * 'local' do czasu wpięcia tożsamości użytkownika w programie 10x (TODO-KARTA).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_SPACE, type SpaceId } from './spaces';
import type { AdvancementMode } from './modeModel';

export const LEFT_MIN = 200;
export const LEFT_MAX = 320;
export const LEFT_DEFAULT = 240;
export const RIGHT_MIN = 280;
export const RIGHT_MAX = 560;
export const RIGHT_DEFAULT = 320;
export const RAIL_WIDTH = 48;

export type BottomPanelTab = 'problemy' | 'przebiegi' | 'dziennik';

/**
 * REZERWA (Reference Engine V1, HANDOFF pkt 2.6): punkt ustawień widoku
 * „Profil renderowania schematu". Do czasu pozyskania ZWERYFIKOWANYCH
 * wzorników graficznych producentów (legendy symboli 8DJH/UniGear — patrz
 * docs/uiux/SLOWNIK_IA_2026-07.md §2) jedyną wartością jest 'standard';
 * implementacja stylów producenckich ZAKAZANA („nie fabrykuj danych
 * producenta"). Sam typ rezerwuje miejsce — ZERO implementacji przełącznika.
 */
export type RenderProfileId = 'standard';
export const DEFAULT_RENDER_PROFILE: RenderProfileId = 'standard';

export interface PanelLayoutState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

export const DEFAULT_LAYOUT: PanelLayoutState = {
  leftWidth: LEFT_DEFAULT,
  rightWidth: RIGHT_DEFAULT,
  leftCollapsed: false,
  rightCollapsed: false,
};

export function clampLeftWidth(width: number): number {
  return Math.min(LEFT_MAX, Math.max(LEFT_MIN, Math.round(width)));
}

export function clampRightWidth(width: number): number {
  return Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, Math.round(width)));
}

interface ShellState {
  activeSpace: SpaceId;
  advancementMode: AdvancementMode;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
  layoutBySpace: Partial<Record<SpaceId, PanelLayoutState>>;
  /**
   * Jednorazowe żądanie otwarcia konkretnej zakładki przestrzeni „Wyniki"
   * (deep-link między-przestrzenny, np. z huba Dokumentacji do generatora
   * studium OZE). `WynikiWarsztat` konsumuje i czyści (null). NIE persystowane.
   */
  wynikiTab: string | null;

  setActiveSpace: (space: SpaceId) => void;
  setAdvancementMode: (mode: AdvancementMode) => void;
  setWynikiTab: (tab: string | null) => void;

  getLayout: (space: SpaceId) => PanelLayoutState;
  setLeftWidth: (space: SpaceId, width: number) => void;
  setRightWidth: (space: SpaceId, width: number) => void;
  toggleLeftCollapsed: (space: SpaceId) => void;
  toggleRightCollapsed: (space: SpaceId) => void;
  resetLayout: (space: SpaceId) => void;

  openBottomPanel: (tab: BottomPanelTab) => void;
  closeBottomPanel: () => void;
}

function layoutFor(state: ShellState, space: SpaceId): PanelLayoutState {
  return state.layoutBySpace[space] ?? DEFAULT_LAYOUT;
}

function patchLayout(
  state: ShellState,
  space: SpaceId,
  patch: Partial<PanelLayoutState>,
): Partial<Record<SpaceId, PanelLayoutState>> {
  return {
    ...state.layoutBySpace,
    [space]: { ...layoutFor(state, space), ...patch },
  };
}

export const useShellStore = create<ShellState>()(
  persist(
    (set, get) => ({
      activeSpace: DEFAULT_SPACE,
      advancementMode: 'basic',
      bottomPanelOpen: false,
      bottomPanelTab: 'problemy',
      layoutBySpace: {},
      wynikiTab: null,

      setActiveSpace: (space) => set({ activeSpace: space }),
      setAdvancementMode: (mode) => set({ advancementMode: mode }),
      setWynikiTab: (tab) => set({ wynikiTab: tab }),

      getLayout: (space) => layoutFor(get(), space),

      setLeftWidth: (space, width) =>
        set((state) => ({
          layoutBySpace: patchLayout(state, space, { leftWidth: clampLeftWidth(width) }),
        })),

      setRightWidth: (space, width) =>
        set((state) => ({
          layoutBySpace: patchLayout(state, space, { rightWidth: clampRightWidth(width) }),
        })),

      toggleLeftCollapsed: (space) =>
        set((state) => ({
          layoutBySpace: patchLayout(state, space, {
            leftCollapsed: !layoutFor(state, space).leftCollapsed,
          }),
        })),

      toggleRightCollapsed: (space) =>
        set((state) => ({
          layoutBySpace: patchLayout(state, space, {
            rightCollapsed: !layoutFor(state, space).rightCollapsed,
          }),
        })),

      resetLayout: (space) =>
        set((state) => {
          const next = { ...state.layoutBySpace };
          delete next[space];
          return { layoutBySpace: next };
        }),

      openBottomPanel: (tab) => set({ bottomPanelOpen: true, bottomPanelTab: tab }),
      closeBottomPanel: () => set({ bottomPanelOpen: false }),
    }),
    {
      name: 'mvd-shell-ui-local',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeSpace: state.activeSpace,
        advancementMode: state.advancementMode,
        layoutBySpace: state.layoutBySpace,
      }),
    },
  ),
);
