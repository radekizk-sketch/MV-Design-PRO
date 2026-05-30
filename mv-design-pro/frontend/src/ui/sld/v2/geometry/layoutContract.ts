/**
 * Kontrakt geometrii SLD (V1) — JEDYNE źródło pozycji obiektów i portów.
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md §1 (interfejs), §2 (algorytm drzewa), §7 (LOD)
 *
 * Reguła wiążąca (anty-„druga prawda"): silnik layoutu zwraca PEŁNĄ, ZAGNIEŻDŻONĄ
 * warstwę geometrii. Renderery/odpływy NIE liczą geometrii — czytają `NodeGeometry`
 * i `EdgeGeometry`. Geometria jest JEDNA i zagnieżdżona:
 *   stacja (L0, bbox dzieci) → pola (L1) → aparaty (L2) + porty (PortAnchor) na L2.
 * Parametr `lod` w `layout()` PROJEKTUJE z tej jednej, zagnieżdżonej kalkulacji —
 * NIE liczy trzech osobnych prawd o pozycjach.
 */

import type { PortKind } from '../core/ports';
import type { TopologyInputV1 } from '../../core/topologyInputReader';

/**
 * Wejście silnika layoutu. Kanoniczny output `readTopologyFromENM` (ENM → topologia).
 * Jedna prawda topologiczna; tryb zmienia tylko sposób liczenia pozycji (Z15).
 */
export type EnmSnapshot = TopologyInputV1;

/** Tryb layoutu. `geo` = dług (brak współrzędnych w ENM) — zwraca marker 'unavailable'. */
export type LayoutMode = 'topological' | 'geo';

/**
 * Stały rozmiar bloku przeglądowego stacji na L0 (world-space) — JEDNA prawda.
 *
 * To JEDYNA definicja footprintu bloku L0 w całym SLD. Importują ją zarówno:
 *  - renderer (`SldCanvasV2` rysuje prostokąt dokładnie tego rozmiaru), JAK I
 *  - silnik layoutu (`layoutEngine` używa go jako footprintu stacji przy
 *    rozmieszczaniu na L0 — odstępy liczone z TEGO rozmiaru, nie z treści).
 *
 * Anty-„druga prawda": brak skopiowanych literałów 120/80 gdziekolwiek indziej.
 * Wcześniej istniały DWIE niezależne definicje (renderer stałe 120×80 vs layout
 * content-based footprint skalowany przez auto-fit), przez co render rysował
 * stałe 120×80, a layout rezerwował mniejszą, przeskalowaną treść → bloki
 * nachodziły na siebie na ekranie.
 */
export const L0_STATION_BLOCK: { readonly width: number; readonly height: number } = {
  width: 120,
  height: 80,
};

/**
 * Poziom detalu. JEDNA prawda geometrii (zagnieżdżona), trzy poziomy:
 * L0 przegląd sieci (stacje-bloki) / L1 stacja-ciąg (pola) / L2 pole-szczegół (aparaty).
 */
export type LodLevel = 'L0' | 'L1' | 'L2';

/** Strona symbolu, z której wychodzi krawędź. */
export type PortSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * Kotwica portu — JEDYNE źródło pozycji punktu przyłączenia krawędzi (V-07).
 * Współrzędne w world-space (po auto-fit). Krawędź rysuje się port→port, nie slot→slot.
 */
export interface PortAnchor {
  /** ENM PortRef.port_id (np. "...FEEDER.BRANCH"). */
  readonly portId: string;
  /** Pole/stacja/GPZ, do którego port należy (ref_id). */
  readonly ownerRef: string;
  /** Rodzaj portu (głowica odpływowa / wejściowa / DER / branch_point). */
  readonly kind: PortKind;
  /** Pozycja w world-space — JEDYNE źródło. */
  readonly x: number;
  readonly y: number;
  /** Strona symbolu (kierunek wyjścia krawędzi). */
  readonly side: PortSide;
}

/**
 * Geometria węzła. Zagnieżdżona: `children` rozwija na następny poziom
 * (pola w stacji → aparaty w polu). Zagnieżdżenie = JEDNA prawda, nie osobne pozycje.
 */
export interface NodeGeometry {
  /** ENM ref_id obiektu (GPZ/stacja/pole/węzeł/aparat). */
  readonly ref: string;
  /** World-space (układ rodzica). JEDYNE źródło. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Poziom w drzewie topologii (0 = GPZ). Dla geo: nieużywane. */
  readonly rank: number;
  /** Poziom, na którym węzeł jest osobnym obiektem: STACJA=L0, POLE=L1, APARAT=L2. */
  readonly lod: LodLevel;
  /** L2: głowice/terminale; L0/L1: porty brzegowe (zagregowane, WCIĄŻ zakotwiczone). */
  readonly ports: readonly PortAnchor[];
  /** Rozwinięcie na następny poziom; brak → liść detalu. */
  readonly children?: readonly NodeGeometry[];
  /** Etykieta do renderu (nazwa obiektu). Opcjonalna; nie wpływa na geometrię. */
  readonly label?: string;
  /** Rodzaj węzła dla renderera (kind w domenie SLD). Opcjonalny. */
  readonly nodeKind?: string;
}

/**
 * Geometria krawędzi. Zakotwiczona do portów (V-07).
 * L0/L1 = zagregowana (porty brzegowe bloków), L2 = port→port (głowica→terminal).
 */
export interface EdgeGeometry {
  /** Ref kabla/linii (ref_id). */
  readonly ref: string;
  /** Najniższy poziom, na którym krawędź jest osobna. */
  readonly lod: LodLevel;
  /** Krawędź port→port (NIE slot→slot). */
  readonly fromPortId: string;
  readonly toPortId: string;
  /** Routing ortogonalny w world-space. */
  readonly polyline: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** Etykieta segmentu (opcjonalna). */
  readonly label?: string;
}

/** Prostokąt obejmujący całą geometrię (world-space). */
export interface LayoutBBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Pełny wynik layoutu — jedna, zagnieżdżona warstwa geometrii dla danego trybu.
 * `nodes` to KORZENIE drzewa LOD (stacje na L0); szczegóły w `children`.
 */
export interface LayoutResult {
  readonly mode: LayoutMode;
  /** Korzenie hierarchii (stacje L0). Pełna geometria w zagnieżdżeniu. */
  readonly nodes: readonly NodeGeometry[];
  readonly edges: readonly EdgeGeometry[];
  readonly bbox: LayoutBBox;
  /**
   * Marker niedostępności trybu (geo = dług). Gdy ustawiony, `nodes`/`edges` puste —
   * NIE udajemy pozycji (7.6.C). null/undefined = tryb dostępny.
   */
  readonly unavailable?: {
    readonly reason: string;
    readonly code: string;
  };
}

/** Opcje auto-fit kadru (≥75% wypełnienia, §7.3.1 / M-01). */
export interface LayoutFrame {
  /** Szerokość użytecznej powierzchni płótna [px]. */
  readonly width: number;
  /** Wysokość użytecznej powierzchni płótna [px]. */
  readonly height: number;
  /** Margines wewnętrzny [px] (domyślnie proporcjonalny). */
  readonly padding?: number;
}

/**
 * Silnik layoutu — JEDYNE źródło geometrii dla danego trybu i topologii ENM.
 *
 * `lod` PROJEKTUJE z jednej, zagnieżdżonej kalkulacji (NIE liczy trzech layoutów):
 * - brak (domyślnie) → pełna zagnieżdżona geometria (L0→L1→L2);
 * - 'L0' → tylko bloki stacji (children pominięte), krawędzie zagregowane;
 * - 'L1' → stacje + pola, krawędzie pole→pole;
 * - 'L2' → pełna głębokość (jak domyślnie).
 */
export interface LayoutEngine {
  layout(snapshot: EnmSnapshot, mode: LayoutMode, lod?: LodLevel): LayoutResult;
}
