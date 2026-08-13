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
  // K11-A (dyrektywa SLD-first 2026-07-30): inspektor bez zawartości nie
  // zabiera przestrzeni roboczej — otwiera go selekcja albo powierzchnia
  // panelowa (useInspektorZaZawartoscia), nie sam montaż powłoki.
  rightCollapsed: true,
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
  /**
   * Kontekst elementu jednorazowego żądania (R2-B): ref elementu modelu,
   * którego dotyczyła akcja prowadząca deep-linkiem (np. węzeł przekroczenia
   * bilansu mocy biernej → pre-selekcja w oknie „Dobór kompensacji").
   * Ustawiany i czyszczony RAZEM z `wynikiTab`; wywołanie bez elementu zeruje
   * kontekst (żadnych zalegających refów). NIE persystowany.
   */
  wynikiTabElement: string | null;
  /**
   * Jednorazowe żądanie otwarcia dialogu „Nowy przypadek" w przestrzeni
   * „Obliczenia" (K6 / H-5 — akcja pustego drzewa przypadków). Wzorzec 1:1 jak
   * `wynikiTab`: ustawia wołający, konsumuje i czyści menedżer przypadków.
   * NIE persystowane (żądanie chwili, nie preferencja układu).
   */
  zadanieNowyPrzypadek: boolean;
  /**
   * Jednorazowe żądanie otwarcia okna „Archiwum projektu (ZIP)" w przestrzeni
   * „Projekt". Wzorzec 1:1 jak `zadanieNowyPrzypadek`: ustawia wołający (karta
   * huba dokumentacji), konsumuje przestrzeń „Projekt". Dzięki temu karta huba
   * kończy się DZIAŁAJĄCĄ akcją, a nie samym przełączeniem przestrzeni.
   * NIE persystowane (żądanie chwili, nie preferencja układu).
   */
  zadanieArchiwumProjektu: boolean;
  /**
   * Jednorazowe żądanie otwarcia okna „Import z arkusza (XLSX)" w przestrzeni
   * „Projekt" — ten sam wzorzec co `zadanieArchiwumProjektu`. NIE persystowane
   * (żądanie chwili, nie preferencja układu).
   */
  zadanieImportuArkusza: boolean;
  /**
   * Tryb PODGLĄDU schematu (KD-4, luka L-1): kanwa bez edycji. Zdolność miała
   * dotąd wyłącznie trasa mostu `#sld-view`, osiągalna jedynie z wyszukiwarki
   * poleceń — powłoka nie umiała przełączyć kanwy w tryb tylko-do-odczytu.
   * Ustawienie WIDOKU (nie danych modelu), więc żyje tu i jest persystowane
   * jak reszta preferencji układu.
   */
  podgladSchematu: boolean;
  /**
   * Który panel kontekstu wypełnia LEWY dok w przestrzeni „Schemat":
   * `'schemat'` — tor pracy na schemacie (SchematContextPanel),
   * `'model'` — warsztat budowy modelu (nawigator układu + panel procesu z
   * akcjami wstawiania, MoContextPanel).
   *
   * D1: to jest PREZENTACJA panelu, nie nawigacja. Dotąd tym przełącznikiem
   * (przycisk „Konfiguracja" w stopce panelu schematu) sterował równoległy stan
   * nawigacji `activeArea` — ten sam, którym trasa ustawiała obszar. Jedno pole
   * pełniło dwie role, więc każda zmiana adresu KASOWAŁA wybór użytkownika,
   * a lądowanie tras nie dało się zmienić bez utraty tego przełącznika.
   * Rozdzielone: adres wyznacza przestrzeń, ten stan wyznacza panel.
   */
  panelSchematu: 'schemat' | 'model';

  setActiveSpace: (space: SpaceId) => void;
  setAdvancementMode: (mode: AdvancementMode) => void;
  setWynikiTab: (tab: string | null, element?: string | null) => void;
  setZadanieNowyPrzypadek: (zadanie: boolean) => void;
  setZadanieArchiwumProjektu: (zadanie: boolean) => void;
  setZadanieImportuArkusza: (zadanie: boolean) => void;
  setPodgladSchematu: (podglad: boolean) => void;
  setPanelSchematu: (panel: 'schemat' | 'model') => void;

  getLayout: (space: SpaceId) => PanelLayoutState;
  setLeftWidth: (space: SpaceId, width: number) => void;
  setRightWidth: (space: SpaceId, width: number) => void;
  toggleLeftCollapsed: (space: SpaceId) => void;
  toggleRightCollapsed: (space: SpaceId) => void;
  /** K11-A: jawne ustawienie zwinięcia inspektora (automat za zawartością). */
  setRightCollapsed: (space: SpaceId, collapsed: boolean) => void;
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
      wynikiTabElement: null,
      zadanieNowyPrzypadek: false,
      zadanieArchiwumProjektu: false,
      zadanieImportuArkusza: false,
      podgladSchematu: false,
      panelSchematu: 'schemat' as const,

      setActiveSpace: (space) => set({ activeSpace: space }),
      setAdvancementMode: (mode) => set({ advancementMode: mode }),
      // Kontekst elementu żyje i gaśnie razem z żądaniem zakładki (element
      // domyślnie null — istniejące wywołania `setWynikiTab(tab)` działają 1:1).
      setWynikiTab: (tab, element = null) => set({ wynikiTab: tab, wynikiTabElement: element }),
      setZadanieNowyPrzypadek: (zadanie) => set({ zadanieNowyPrzypadek: zadanie }),
      setZadanieArchiwumProjektu: (zadanie) => set({ zadanieArchiwumProjektu: zadanie }),
      setZadanieImportuArkusza: (zadanie) => set({ zadanieImportuArkusza: zadanie }),
      setPodgladSchematu: (podglad) => set({ podgladSchematu: podglad }),
      setPanelSchematu: (panel) => set({ panelSchematu: panel }),

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

      setRightCollapsed: (space, collapsed) =>
        set((state) => {
          if (layoutFor(state, space).rightCollapsed === collapsed) return state;
          return { layoutBySpace: patchLayout(state, space, { rightCollapsed: collapsed }) };
        }),

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
        podgladSchematu: state.podgladSchematu,
      }),
    },
  ),
);
