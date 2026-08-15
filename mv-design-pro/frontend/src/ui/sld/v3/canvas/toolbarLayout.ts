/**
 * KD-8 poz. 2 — JEDNA WARSTWA NARZĘDZI KANWY (układ deterministyczny).
 *
 * STAN PRZED (ocena właściciela): narzędzia żyły w CZTERECH niezależnych dokach
 * pozycjonowanych bezwzględnie — `left-3 top-3` (drzewo układu), środek u góry
 * (paleta PV/BESS/FW, `left:50%` + `translateX(-50%)`), `right-3 top-3`
 * (eksport) i `right-3 top-12` (widok). Każdy dok znał tylko własny róg, więc
 * przy zwężeniu kanwy chip „↓ SVG" nachodził na „+ BESS", a trzy rzędy
 * pływających kontrolek zachodziły na siebie i na rysunek.
 *
 * ROZSTRZYGNIĘCIE: jeden pas narzędzi, jeden układ. Grupy są elementami JEDNEGO
 * rzędu (flex), więc nachodzenie jest niemożliwe Z KONSTRUKCJI — przeglądarka
 * układa je obok siebie zamiast nakładać. Gdy szerokość nie mieści wszystkich
 * grup, najmniej krytyczne ZWIJAJĄ SIĘ do menu „Narzędzia" (nigdy nie
 * nachodzą). Ten moduł jest CZYSTĄ, deterministyczną decyzją „co zostaje
 * rozwinięte" — bez DOM, bez pomiaru tekstu, bez stanu.
 *
 * Szerokości minimalne grup są POMIAREM realnego rzędu przycisków (wysokość
 * 28 px, `px-2`, `text-[10px]` mono) zaokrąglonym w górę do 4 px — nie
 * szacunkiem: każda pozycja to `≈ 7 px × liczba znaków + 20 px` obudowy.
 */

/** Identyfikatory grup w KOLEJNOŚCI rysowania (od lewej). */
export type CanvasToolbarGroupId = 'drzewo' | 'uklady' | 'widok' | 'eksport';

export interface CanvasToolbarGroup {
  readonly id: CanvasToolbarGroupId;
  /** Polska etykieta grupy (menu zwinięcia, aria). */
  readonly label: string;
  /** Minimalna szerokość rozwiniętej grupy [px]. */
  readonly minWidth: number;
  /**
   * Ranga zatrzymania: WYŻSZA zostaje rozwinięta dłużej. Kolejność zwijania
   * jest podyktowana tym, jak często kontrolka jest używana przy rysowaniu
   * układu: nawigacja po drzewie i sterowanie widokiem służą KAŻDEJ czynności,
   * eksport jest jednorazowy na końcu pracy.
   */
  readonly rank: number;
}

/**
 * Minima POLICZONE z realnej treści rzędu (font mono 10 px ⇒ ≈ 6,2 px na znak;
 * `px-2` = 16 px obudowy; odstęp wewnętrzny 4 px), zaokrąglone w górę do 4 px:
 *  - drzewo  „▸ Drzewo układu" ................................ 111 → 116
 *  - układy  etykieta + 3 przyciski PV/BESS/FW (＋ … ) ......... 476 → 480
 *  - widok   „⌖ Dopasuj widok" + „Cały arkusz" + „▸ Legenda (N)"
 *            + „▸ Nawigator" .................................. 398 → 400
 *  - eksport „↓ SVG" + menu formatów + „Dołącz legendę" ....... 314 → 320
 */
export const CANVAS_TOOLBAR_GROUPS: readonly CanvasToolbarGroup[] = [
  { id: 'drzewo', label: 'Drzewo układu', minWidth: 116, rank: 4 },
  { id: 'uklady', label: 'Układy PV/BESS/FW', minWidth: 480, rank: 2 },
  { id: 'widok', label: 'Widok', minWidth: 400, rank: 3 },
  { id: 'eksport', label: 'Eksport', minWidth: 320, rank: 1 },
];

/** Odstęp między grupami [px] — `gap-2` Tailwinda. */
export const TOOLBAR_GAP_PX = 8;
/** Margines pasa od krawędzi kanwy [px] — `left-3`/`right-3`. */
export const TOOLBAR_EDGE_PX = 12;
/** Szerokość przycisku „Narzędzia ▾" [px] (pojawia się TYLKO przy zwinięciu). */
export const TOOLBAR_MENU_WIDTH_PX = 116;

/** Wysokość rzędu kontrolek doku [px] — `h-7` Tailwinda. */
export const TOOLBAR_ROW_HEIGHT_PX = 28;

/**
 * S9-8 (audyt, „obszar bezpieczny pod dokami UI") — PASY ZASŁONIĘTE kanwy.
 *
 * PROBLEM. Kamera v3 dopasowywała rysunek do CAŁEGO prostokąta kanwy z
 * jednolitym marginesem 40 px, a nad kanwą pływają doki: pas narzędzi u góry
 * (`left-3 right-3 top-3`, rząd 28 px) oraz pas kontrolek u dołu (`bottom-3`,
 * rząd 28 px — po obu stronach i pośrodku). Treść wpasowana „na styk" wchodziła
 * pod nie: dokładnie ten sam mechanizm, przez który komunikat „Ukryto N opisów"
 * musiał już wcześniej dostać własne odsunięcie (`HIDDEN_LABELS_HINT_BOTTOM_PX`,
 * `canvas/SldCanvasV3.tsx`) — łatka na jeden napis zamiast reguły na całą kanwę.
 *
 * ROZSTRZYGNIĘCIE: kadr liczony w PROSTOKĄCIE BEZPIECZNYM, wprost przez
 * `SafeInsets` kamery v2 (`v2/viewport/ViewportController.ts` — mechanizm
 * ISTNIAŁ i był udokumentowany słowami „treść nie chowa się pod nakładkami
 * toolbaru/paneli", ale v3 nigdy go nie zasilała: zdolność bez dostawcy).
 * Insety liczone są ze STAŁYCH DOKÓW z tego modułu, nie wpisane ręcznie —
 * zmiana marginesu doku przesuwa kadr sama.
 *
 * Pasy LEWY/PRAWY zostają zerowe: doki narożne (`bottom-3 left-3`, `bottom-3
 * right-3`) leżą W PASIE DOLNYM, więc są już pokryte; odjęcie ich szerokości
 * na pełnej wysokości kanwy zabrałoby rysunkowi miejsce bez powodu. Panel
 * boczny (widok wnętrza stacji) jest zasłoną STANOWĄ — podaje ją wołający
 * przez `SldCanvasV3.safeInsets`, bo tylko on wie, czy panel jest otwarty.
 */
export const SLD_CANVAS_DOCK_INSETS: {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
} = {
  top: TOOLBAR_EDGE_PX + TOOLBAR_ROW_HEIGHT_PX,
  right: 0,
  bottom: TOOLBAR_EDGE_PX + TOOLBAR_ROW_HEIGHT_PX,
  left: 0,
};

/** S9-8: maksymalna szerokość panelu bocznego „wnętrze stacji" [px] — TA SAMA
 *  liczba, którą niesie klasa panelu (`max-w-[min(760px,calc(100%-1.5rem))]`,
 *  `canvas/SldCanvasV3Workspace.tsx`). Stała mieszka tu, obok pozostałej
 *  geometrii doków, żeby kadr i panel czytały jedną wartość. */
export const STATION_INTERNAL_PANEL_MAX_WIDTH_PX = 760;

/**
 * Szerokość, przy której WSZYSTKIE grupy mieszczą się rozwinięte. Liczona z
 * kontraktu (suma minimów + odstępy + marginesy), nie wpisana ręcznie —
 * dodanie grupy podnosi próg samo.
 */
export const TOOLBAR_FULL_WIDTH_PX =
  CANVAS_TOOLBAR_GROUPS.reduce((sum, g) => sum + g.minWidth, 0) +
  TOOLBAR_GAP_PX * (CANVAS_TOOLBAR_GROUPS.length - 1) +
  TOOLBAR_EDGE_PX * 2;

export interface CanvasToolbarSlot {
  readonly id: CanvasToolbarGroupId;
  /** Lewa krawędź slotu [px] względem kanwy. */
  readonly x: number;
  readonly width: number;
}

export interface CanvasToolbarLayout {
  /** Grupy rozwinięte, w kolejności rysowania, z rozłącznymi prostokątami. */
  readonly slots: readonly CanvasToolbarSlot[];
  /** Grupy zwinięte do menu „Narzędzia" (kolejność rysowania). */
  readonly collapsed: readonly CanvasToolbarGroupId[];
  /** Slot menu „Narzędzia" — `null`, gdy nic nie jest zwinięte. */
  readonly menuSlot: CanvasToolbarSlot | null;
}

/**
 * Rozkłada pas narzędzi na dostępnej szerokości.
 *
 * Zasada: rozwinięte zostają grupy o najwyższej randze, które MIESZCZĄ SIĘ
 * w całości; reszta idzie do menu. Wynik jest funkcją wyłącznie szerokości —
 * ta sama szerokość zawsze daje ten sam układ (P7 determinizm).
 */
export function layoutCanvasToolbar(availableWidth: number): CanvasToolbarLayout {
  const width = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  const kolejnoscZwijania = [...CANVAS_TOOLBAR_GROUPS].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

  let rozwiniete = [...CANVAS_TOOLBAR_GROUPS];
  const zwiniete: CanvasToolbarGroupId[] = [];

  const potrzebna = (grupy: readonly CanvasToolbarGroup[], zMenu: boolean): number => {
    const pozycje = grupy.length + (zMenu ? 1 : 0);
    if (pozycje === 0) return TOOLBAR_EDGE_PX * 2;
    const suma = grupy.reduce((s, g) => s + g.minWidth, 0) + (zMenu ? TOOLBAR_MENU_WIDTH_PX : 0);
    return suma + TOOLBAR_GAP_PX * (pozycje - 1) + TOOLBAR_EDGE_PX * 2;
  };

  for (const kandydat of kolejnoscZwijania) {
    if (potrzebna(rozwiniete, zwiniete.length > 0) <= width) break;
    if (rozwiniete.length === 0) break;
    rozwiniete = rozwiniete.filter((g) => g.id !== kandydat.id);
    zwiniete.push(kandydat.id);
  }

  // Sloty liczone od lewej krawędzi — rozłączne z konstrukcji (kolejne
  // przesunięcie = poprzednia szerokość + odstęp).
  const slots: CanvasToolbarSlot[] = [];
  let x = TOOLBAR_EDGE_PX;
  for (const grupa of rozwiniete) {
    slots.push({ id: grupa.id, x, width: grupa.minWidth });
    x += grupa.minWidth + TOOLBAR_GAP_PX;
  }
  const menuSlot: CanvasToolbarSlot | null =
    zwiniete.length > 0 ? { id: 'eksport', x, width: TOOLBAR_MENU_WIDTH_PX } : null;

  return {
    slots,
    collapsed: CANVAS_TOOLBAR_GROUPS.filter((g) => zwiniete.includes(g.id)).map((g) => g.id),
    menuSlot,
  };
}

/** Czy grupa jest rozwinięta w danym układzie (wygoda dla renderu). */
export function isToolbarGroupExpanded(layout: CanvasToolbarLayout, id: CanvasToolbarGroupId): boolean {
  return layout.slots.some((slot) => slot.id === id);
}
