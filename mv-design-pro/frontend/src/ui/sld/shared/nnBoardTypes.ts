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
  /**
   * T1 (SLD-nN-TOPOLOGIA, `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §0.1,
   * defekt (d)): refy ENM odcinków kabla POMIĘDZY `branchRef` (aparat/pierwsza
   * gałąź) i odbiorcą końcowym — WYŁĄCZNIE dalsze przeskoki
   * `resolveNnFeederDestination` chodzącej po torze (jeśli `branchRef` sam
   * jest kablem, TEN kabel NIE jest tu powtórzony — jego reprezentacja to
   * `branchRef` samo w sobie). `[]`, gdy odbiorca siedzi BEZPOŚREDNIO na
   * dalszej szynie aparatu (zero przeskoków kablowych) — uczciwie pusta
   * lista, nie brak danych. Kompozycja (`compose/station.ts`) rysuje KAŻDY
   * ref jako WŁASNY odcinek sceny (`ownerRef=cableRefs[i]`, `kind:'lv'`) —
   * przed T1 kable odpływów NIE miały żadnej reprezentacji na scenie
   * (dowód defektu B-02, `sceneConformance.test.ts` Check B).
   */
  readonly cableRefs: readonly string[];
}

/**
 * T1 (§0.1 „RGnN jako OBIEKT: incomer/sekcje/sprzęgło/odpływy"): aparat
 * GŁÓWNY (incomer) sekcji szyny nN — krawędź na ścieżce transformator→szyna
 * (WYŁĄCZNIE gdy szyna nN jest ODDZIELNA od terminala LV transformatora,
 * `electrical/viewModel.ts::findLvIncomerEdge`). Rysowany PRZED szyną
 * (`compose/station.ts`), NIGDY jako pozycja w liście odpływów — inaczej
 * kompozycja przedstawiałaby aparat główny jako kolejny odpływ równorzędny
 * QF-01/QF-02/… (defekt zmierzony na fixturze „Stacja B", karta T1).
 */
export interface SldNnIncomer {
  readonly branchRef: string;
  readonly apparatusKind: SldNnApparatusKind | null;
  readonly apparatusRef: string | null;
  readonly apparatusLabel: string | null;
  /** Szyna PO STRONIE transformatora (np. zacisk nN T1) — `fromBusRef`
   *  semantyczny (kierunek zasilania), NIE geometryczny. */
  readonly fromBusRef: string;
}

/**
 * T5a (KONCEPCJA_LOD_NN_2026-08 §L1, werdykt pkt 2 „szyna RGnN z sekcjami i
 * SPRZĘGŁEM"): sprzęgło międzysekcyjne — realna gałąź ENM
 * (`NnSection.coupler_ref`, `type="bus_coupler"`, `backend/src/enm/
 * domain_operations_v2.py::add_nn_section_coupler`), NIGDY fabrykowane.
 * Backend zapisuje `coupler_ref` WYŁĄCZNIE na sekcji PRAWEJ (wyższy `order`,
 * nowo dodanej) — `leftSectionId`/`rightSectionId` tu są WYPROWADZONE z pary
 * `from_bus_ref`/`to_bus_ref` gałęzi dopasowanej do `busRef` sąsiednich
 * sekcji (adapter, zero zgadywania kierunku).
 */
export interface SldNnCoupler {
  readonly branchRef: string;
  readonly apparatusKind: SldNnApparatusKind | null;
  readonly apparatusRef: string | null;
  readonly apparatusLabel: string | null;
  readonly leftSectionId: string;
  readonly rightSectionId: string;
}

export interface SldNnBoardSection {
  readonly sectionId: string;
  readonly busRef: string;
  /** T1: aparat główny sekcji — `null`, gdy sekcja NIE ma osobnego incomera
   *  (transformator podłączony wprost do tej szyny, ALBO — dla sekcji z
   *  jawnym `NnSection` — `incoming_refs` puste/nierozwiązywalne). Uczciwy
   *  brak, zero fabrykacji aparatu. */
  readonly incomer: SldNnIncomer | null;
  /** T5a: sprzęgło do sekcji SĄSIEDNIEJ — `null`, gdy ta sekcja nie niesie
   *  `NnSection.coupler_ref` (WIĘKSZOŚĆ sekcji: rozdzielnica jednosekcyjna
   *  ALBO sekcja LEWA pary sprzęglonej — sprzęgło rysowane RAZ, na sekcji
   *  prawej, `compose/station.ts`). */
  readonly coupler: SldNnCoupler | null;
  readonly feeders: readonly SldNnFeeder[];
}
