/*
 * Stan prezentacji powłoki (okno W-110) — WYŁĄCZNIE ustawienia UI, nie dane modelu
 * (SPEC_UKLAD_PANELI §1.5: „zapis układu nie jest danymi modelu"). To nie jest
 * shadow-state: aktywny przypadek/gotowość/rewizja są czytane z istniejących
 * store'ów przez adapter (shellStatus.ts). Tutaj żyją tylko: aktywna przestrzeń,
 * „Szczegóły audytowe" (jeden przełącznik, karta K1 POWLOKA — zastępuje dawne trzy
 * tryby zaawansowania), szerokości/zwinięcia paneli (per przestrzeń) oraz panel dolny.
 *
 * Trwałość: magazyn ustawień powłoki (localStorage) per przestrzeń, pod stałym
 * kluczem `'mvd-shell-ui-local'`. Klucz NIE ma wymiaru „per użytkownik" — backend
 * nie wystawia żadnej trasy uwierzytelniania (zmierzone V12T-015, `docs/v12xx/
 * REJESTR_DLUGU.md`: 0 tras `auth`/`/me` wśród 44 routerów `api/main.py`), więc
 * ustawienia layoutu są dzielone przez każdego, kto otwiera powłokę w tej samej
 * przeglądarce. Dodanie tożsamości użytkownika (i per-użytkownik prefiksu klucza)
 * jest zakresem programu 10x F1 „auth/perimeter" — GRANICA PRODUKTU, nie luka tej
 * karty: wymaga zaprojektowania całej warstwy sesji/ról, nie punktowej zmiany
 * jednego stringa.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_SPACE, type SpaceId } from './spaces';

/*
 * Granice paneli (kontrakt UIUX przemysłowy, UI-02, karty K1 POWLOKA i K6 INSPEKTOR):
 * lewy panel 220–260 px (domyślnie 240), inspektor 340–420 px (domyślnie 360) —
 * przeciąganie i klawiatura NIGDY nie wychodzą poza 420 px. Szerokość 560 px (tabele
 * karty technicznej z pełnym nagłówkiem kolumn) daje WYŁĄCZNIE jawne polecenie „Tryb
 * szeroki" (przycisk w nagłówku inspektora i pozycja menu Widok), odwracalne tym samym
 * poleceniem i zapisywane per przestrzeń. Szerokość nie zmienia się samoczynnie: selekcja
 * obiektu nie czyta ani nie pisze żadnego z tych pól. Panel dolny: regulowana wysokość.
 */
export const LEFT_MIN = 220;
export const LEFT_MAX = 260;
export const LEFT_DEFAULT = 240;
export const RIGHT_MIN = 340;
export const RIGHT_MAX = 420;
export const RIGHT_DEFAULT = 360;
export const RIGHT_WIDE = 560;
export const RAIL_WIDTH = 48;
export const BOTTOM_MIN = 140;
export const BOTTOM_MAX = 480;
export const BOTTOM_DEFAULT = 220;

/**
 * Identyfikator zakładki panelu dolnego. Rejestr zakładek jest ROZSZERZALNY
 * (`panelDolny/rejestrZakladek.ts`) — kolejne karty dopisują zakładki bez zmiany
 * powłoki, więc typ jest napisem, a nie zamkniętą unią.
 */
export type BottomPanelTab = string;

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
  /** K6: tryb szeroki inspektora (560 px) — wyłącznie z jawnego polecenia. */
  rightWide: boolean;
}

export const DEFAULT_LAYOUT: PanelLayoutState = {
  leftWidth: LEFT_DEFAULT,
  rightWidth: RIGHT_DEFAULT,
  leftCollapsed: false,
  // K11-A (dyrektywa SLD-first 2026-07-30): inspektor bez zawartości nie
  // zabiera przestrzeni roboczej — otwiera go selekcja albo powierzchnia
  // panelowa (useInspektorZaZawartoscia), nie sam montaż powłoki.
  rightCollapsed: true,
  rightWide: false,
};

function przytnij(min: number, max: number, wartosc: number, domyslna: number): number {
  if (!Number.isFinite(wartosc)) return domyslna;
  return Math.min(max, Math.max(min, Math.round(wartosc)));
}

export function clampLeftWidth(width: number): number {
  return przytnij(LEFT_MIN, LEFT_MAX, width, LEFT_DEFAULT);
}

export function clampRightWidth(width: number): number {
  return przytnij(RIGHT_MIN, RIGHT_MAX, width, RIGHT_DEFAULT);
}

/**
 * Szerokość kolumny inspektora: tryb szeroki = {@link RIGHT_WIDE}, poza nim szerokość
 * z przeciągania przycięta do pasma 340–420 px. Jedna reguła dla powłoki i testów.
 */
export function efektywnaSzerokoscInspektora(layout: Pick<PanelLayoutState, 'rightWidth' | 'rightWide'>): number {
  return layout.rightWide ? RIGHT_WIDE : clampRightWidth(layout.rightWidth);
}

export function clampBottomHeight(height: number): number {
  return przytnij(BOTTOM_MIN, BOTTOM_MAX, height, BOTTOM_DEFAULT);
}

export type TrybWidokuSchematu = 'roboczy' | 'arkusz';

interface ShellState {
  activeSpace: SpaceId;
  /**
   * „Szczegóły audytowe" — JEDYNY przełącznik głębokości prezentacji (zastąpił
   * tryby Podstawowy/Rozszerzony/Ekspercki). `true` odsłania dane audytowe:
   * zakładki akademickie, ślady obliczeń, identyfikatory techniczne.
   */
  szczegolyAudytowe: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
  bottomPanelHeight: number;
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
  /**
   * K2b §0.4 — tryb widoku kanwy schematu: `'roboczy'` (domyślny — sama sieć,
   * bez ramy arkusza, pól odniesienia i tabliczki) albo `'arkusz'` (rysunek
   * arkuszowy jak w eksporcie). Ustawienie WIDOKU, persystowane jak reszta
   * preferencji; eksport zawsze rysuje arkusz.
   */
  trybWidokuSchematu: TrybWidokuSchematu;

  setActiveSpace: (space: SpaceId) => void;
  setSzczegolyAudytowe: (wlaczone: boolean) => void;
  toggleSzczegolyAudytowe: () => void;
  setWynikiTab: (tab: string | null, element?: string | null) => void;
  setZadanieNowyPrzypadek: (zadanie: boolean) => void;
  setZadanieArchiwumProjektu: (zadanie: boolean) => void;
  setZadanieImportuArkusza: (zadanie: boolean) => void;
  setPodgladSchematu: (podglad: boolean) => void;
  setPanelSchematu: (panel: 'schemat' | 'model') => void;
  setTrybWidokuSchematu: (tryb: TrybWidokuSchematu) => void;
  przelaczTrybWidokuSchematu: () => void;

  getLayout: (space: SpaceId) => PanelLayoutState;
  setLeftWidth: (space: SpaceId, width: number) => void;
  setRightWidth: (space: SpaceId, width: number) => void;
  toggleLeftCollapsed: (space: SpaceId) => void;
  toggleRightCollapsed: (space: SpaceId) => void;
  /** K11-A: jawne ustawienie zwinięcia inspektora (automat za zawartością). */
  setRightCollapsed: (space: SpaceId, collapsed: boolean) => void;
  /** K6: przełącza tryb szeroki inspektora; włączenie otwiera zwinięty inspektor. */
  toggleRightWide: (space: SpaceId) => void;
  resetLayout: (space: SpaceId) => void;

  openBottomPanel: (tab: BottomPanelTab) => void;
  closeBottomPanel: () => void;
  toggleBottomPanel: () => void;
  setBottomPanelHeight: (height: number) => void;
}

/**
 * Układ przestrzeni z PRZYCIĘCIEM przy odczycie: zapis z magazynu przeglądarki
 * mógł powstać przy dawnych granicach (lewy 200–320, inspektor 280–560). Jedno
 * miejsce odczytu = jedna reguła granic; brak migracji magazynu.
 */
function layoutFor(state: ShellState, space: SpaceId): PanelLayoutState {
  const zapisany = state.layoutBySpace[space];
  if (!zapisany) return DEFAULT_LAYOUT;
  return {
    leftWidth: clampLeftWidth(zapisany.leftWidth),
    rightWidth: clampRightWidth(zapisany.rightWidth),
    leftCollapsed: Boolean(zapisany.leftCollapsed),
    rightCollapsed: Boolean(zapisany.rightCollapsed),
    rightWide: zapisany.rightWide === true,
  };
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
      szczegolyAudytowe: false,
      bottomPanelOpen: false,
      bottomPanelTab: 'problemy',
      bottomPanelHeight: BOTTOM_DEFAULT,
      layoutBySpace: {},
      wynikiTab: null,
      wynikiTabElement: null,
      zadanieNowyPrzypadek: false,
      zadanieArchiwumProjektu: false,
      zadanieImportuArkusza: false,
      podgladSchematu: false,
      panelSchematu: 'schemat' as const,
      trybWidokuSchematu: 'roboczy' as TrybWidokuSchematu,

      setActiveSpace: (space) => set({ activeSpace: space }),
      setSzczegolyAudytowe: (wlaczone) => set({ szczegolyAudytowe: wlaczone }),
      toggleSzczegolyAudytowe: () =>
        set((state) => ({ szczegolyAudytowe: !state.szczegolyAudytowe })),
      // Kontekst elementu żyje i gaśnie razem z żądaniem zakładki (element
      // domyślnie null — istniejące wywołania `setWynikiTab(tab)` działają 1:1).
      setWynikiTab: (tab, element = null) => set({ wynikiTab: tab, wynikiTabElement: element }),
      setZadanieNowyPrzypadek: (zadanie) => set({ zadanieNowyPrzypadek: zadanie }),
      setZadanieArchiwumProjektu: (zadanie) => set({ zadanieArchiwumProjektu: zadanie }),
      setZadanieImportuArkusza: (zadanie) => set({ zadanieImportuArkusza: zadanie }),
      setPodgladSchematu: (podglad) => set({ podgladSchematu: podglad }),
      setPanelSchematu: (panel) => set({ panelSchematu: panel }),
      setTrybWidokuSchematu: (tryb) => set({ trybWidokuSchematu: tryb }),
      przelaczTrybWidokuSchematu: () =>
        set((state) => ({ trybWidokuSchematu: state.trybWidokuSchematu === 'roboczy' ? 'arkusz' : 'roboczy' })),

      getLayout: (space) => layoutFor(get(), space),

      setLeftWidth: (space, width) =>
        set((state) => ({
          layoutBySpace: patchLayout(state, space, { leftWidth: clampLeftWidth(width) }),
        })),

      setRightWidth: (space, width) =>
        set((state) => ({
          // Przeciąganie i klawiatura działają w paśmie 340–420 px: zmiana szerokości
          // z uchwytu kończy tryb szeroki (jedna szerokość inspektora naraz).
          layoutBySpace: patchLayout(state, space, { rightWidth: clampRightWidth(width), rightWide: false }),
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

      toggleRightWide: (space) =>
        set((state) => {
          const biezacy = layoutFor(state, space);
          const szeroki = !biezacy.rightWide;
          return {
            layoutBySpace: patchLayout(state, space, {
              rightWide: szeroki,
              ...(szeroki ? { rightCollapsed: false } : {}),
            }),
          };
        }),

      resetLayout: (space) =>
        set((state) => {
          const next = { ...state.layoutBySpace };
          delete next[space];
          return { layoutBySpace: next };
        }),

      openBottomPanel: (tab) => set({ bottomPanelOpen: true, bottomPanelTab: tab }),
      closeBottomPanel: () => set({ bottomPanelOpen: false }),
      toggleBottomPanel: () => set((state) => ({ bottomPanelOpen: !state.bottomPanelOpen })),
      setBottomPanelHeight: (height) => set({ bottomPanelHeight: clampBottomHeight(height) }),
    }),
    {
      name: 'mvd-shell-ui-local',
      storage: createJSONStorage(() => localStorage),
      // Scalanie jak domyślne w zustand (płytkie), z jedną walidacją: tryb widoku
      // schematu spoza dwóch wartości (zapis uszkodzony albo z innej wersji) wraca do
      // domyślnego 'roboczy' — kanwa nie może dostać trybu, którego nie zna.
      merge: (zapisany, biezacy) => {
        const z = (zapisany ?? {}) as Partial<ShellState>;
        return { ...biezacy, ...z, trybWidokuSchematu: z.trybWidokuSchematu === 'arkusz' ? 'arkusz' : 'roboczy' };
      },
      partialize: (state) => ({
        activeSpace: state.activeSpace,
        szczegolyAudytowe: state.szczegolyAudytowe,
        layoutBySpace: state.layoutBySpace,
        bottomPanelHeight: state.bottomPanelHeight,
        podgladSchematu: state.podgladSchematu,
        trybWidokuSchematu: state.trybWidokuSchematu,
      }),
    },
  ),
);
