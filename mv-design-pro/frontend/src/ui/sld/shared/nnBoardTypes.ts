/**
 * P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8, seam A8 §9.2.1) — kontrakt
 * struktury per-szyna/per-odpływ rozdzielnicy nN. Wydzielone (wzorzec
 * `stationBusResolution.ts`: JEDNA prawda typu, zero duplikacji struktury
 * między adapterem v2 (buduje), rendererem v2 (`StationOnRunRendererProps`,
 * przenosi) i kompozycją v3 (`measure.ts`/`compose/station.ts`, rysuje) —
 * import z JEDNEGO miejsca eliminuje ryzyko cyklu (adapter v2 importuje
 * `StationOnRunRendererProps` z renderera v2, więc typ pól WSPÓLNYCH musi
 * żyć poza obydwoma).
 */

/** Rodzaj aparatu odpływu nN, rozpoznany z katalogu (device_kind/namespace).
 *  `'UNRESOLVED'` = gałąź NIESIE aparat (branch.type 'switch'/'fuse'), ale
 *  dane katalogowe nie pozwalają rozpoznać rodzaju — kompozycja rysuje
 *  wtedy PUSTY tor + komunikat w kolorze błędu, NIE podstawia wyłącznika
 *  (karta P0.8 §0.2, wzorzec MINI-RMU `resolveBayApparatusSymbolIds`). */
export type SldNnApparatusKind = 'MCB' | 'FUSE_SWITCH' | 'UNRESOLVED';

/** Cel odpływu — WYPROWADZONY z grafu (chodzenie po gałęziach typu 'cable'
 *  bez rozgałęzień), NIGDY zgadywany. `'unknown'` = koniec toru bez
 *  rozpoznanego odbiorcy (uczciwa granica modelu). */
export type SldNnFeederDestinationKind = 'load' | 'board' | 'der' | 'unknown';

export interface SldNnFeeder {
  /** Ref PIERWSZEJ gałęzi odpływu (aparat, gdy istnieje; inaczej pierwszy
   *  odcinek kabla) — tożsamość SEGMENTU odpływu (ownerRef toru, klik →
   *  provenance, wzorzec `flowByOwnerRef`/`segmentRef`). */
  readonly branchRef: string;
  /** Aparat odpływu — `null`, gdy pierwsza gałąź jest gołym kablem (ZERO
   *  aparatu skonfigurowanego, przypadek OCZEKIWANY, nie błąd). */
  readonly apparatusKind: SldNnApparatusKind | null;
  /** Ref aparatu (ENM `ref_id` gałęzi switch/fuse) — realny ref ENM, klik
   *  otwiera rekord (karta P0.8 §0.2). `null`, gdy `apparatusKind===null`. */
  readonly apparatusRef: string | null;
  /** Etykieta aparatu (np. „MCB B16", „gG NH00 63A") — degraduje do nazwy
   *  rodzajowej, gdy katalog nie niesie klasy/wielkości (uczciwy brak, nie
   *  fabrykacja wartości). `null` dla `apparatusKind===null`. */
  readonly apparatusLabel: string | null;
  readonly destinationKind: SldNnFeederDestinationKind;
  /** Ref ENM odbiorcy końcowego toru (Load/Generator/Substation) — `null`
   *  dla `'unknown'`. */
  readonly destinationRef: string | null;
  readonly destinationLabel: string | null;
}

export interface SldNnBoardSection {
  readonly sectionId: string;
  readonly busRef: string;
  readonly feeders: readonly SldNnFeeder[];
}
