/**
 * Kompozycja SCENY L2 — T5b-3 VISUAL SLD REBUILD (werdykt właściciela B-02:
 * T5b-2 REJECT wizualny 0/10 — "poprawny model elektryczny przedstawiony w
 * formie debug view grafu"; mandat: dedykowany LV SLD layout engine,
 * hierarchia rang, sekcje dominujące, ORTOGONALNY raster odpływów, zero
 * ukośnych linii bez konieczności).
 *
 * SILNIK LAYOUTU (nie generyczny graf):
 * - RANGI PIONOWE (P0.2/P0.15, TOP→DOWN): RANK0 kotwica SN → RANK1 TR →
 *   RANK2 zacisk nN → (aparat incomera na pionie) → RANK3 SZYNA sekcji →
 *   RANK4 aparaty odpływów → RANK5 podrozdzielnice/terminale → RANK6 odbiory.
 * - SEKCJA = LAYOUT CONTAINER (P0.13): szerokość kreski magistrali WYNIKA z
 *   liczby kikutów (źródła nad szyną, odpływy pod szyną) × rastru — szyna
 *   jest dominująca i dokładnie tak długa, jak potrzebuje jej zawartość.
 * - ODPŁYWY ORTOGONALNIE (P0.7): kikut pionowo w dół z szyny w stałym
 *   rastrze; podrozdzielnica/odbiór/terminal CENTROWANE pod kikutem
 *   (childCenterX = tapX) — ukośna linia nie ma prawa powstać na torze
 *   odpływu. Sprzęgło: pozioma przerwa między sekcjami z aparatem (P0.4).
 * - BOUNDARY (P0.10): kikut → kabel PIONOWO → ● terminal → chip poziomo
 *   (krótki boundaryLink) — chip nie zastępuje toru.
 *
 * ZASADA WORLD-SCALED / SCREEN-STABLE (werdykt T5a): geometria torów w
 * jednostkach świata; SYMBOLE i typografia mają rozmiar EKRANOWY (renderer,
 * `LvDomainView.tsx` — trzy poziomy typografii P0.12).
 *
 * ZAKAZ INFERENCJI CONNECTIVITY (P0.18 → kanon `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`
 * §3): spójność elektryczna i energizacja NIE są liczone po stronie klienta —
 * ani z geometrii, ani z grafu (dawny `computeElectricalComponents`, własny
 * BFS, USUNIĘTY 2026-09-01: druga definicja wyspy obok backendowej rozjeżdżała
 * się przy 2×TR ze sprzęgłem otwartym). Scena czyta `graph.islands` i pola
 * `energized/supply_refs/der_only` szyn z kontraktu 2.0.0.
 * Determinizm: te same dane → identyczna scena (sortowanie po `ref_id`).
 *
 * JEDNA GEOMETRIA NA WSZYSTKIE POZIOMY SZCZEGÓŁOWOŚCI (LOD): ten moduł NIE
 * ZNA pojęcia LOD i nie ma prawa go przyjąć — scena liczy się RAZ, a poziom
 * szczegółowości jest wyłącznie filtrem prezentacji w `LvDomainView`
 * (`visualGrammar.ts::REJESTR_ELEMENTOW_KANWY`). Dodanie tu parametru LOD
 * albo warunku „gdy przegląd, licz inaczej" = druga geometria tego samego
 * schematu; pin: `__tests__/lodProjekcjaNn.test.tsx` porównuje WSZYSTKIE
 * prymitywy toru między poziomami 0/1/2.
 */
import type { SymbolId } from '../symbols/defs';
import type {
  LvDomainBoundaryLink,
  LvDomainBranch,
  LvDomainGraphView,
  LvDomainIsland,
  LvDomainSubSwitchboard,
  LvDomainTransformer,
  UpstreamEquivalentSnapshot,
} from './types';

// ---------------------------------------------------------------------------
// Geometria świata — RANGI (Y) i RASTRY (X). T5b-3: wartości dobrane pod
// czytelność przy DOMYŚLNYM wejściu do L2 (fit-to-content, P0.1/P0.12):
// scena ma być gęsta — marginesy minimalne, odstępy wynikają z typografii
// rendererów (etykiety PRIMARY 13px / SECONDARY 11px nie nachodzą przy tych
// rastrach — zmierzone na fixturach multi-source i Stacja C).
// ---------------------------------------------------------------------------
const MARGIN_X = 70;
const MARGIN_Y = 48;

/** Odstępy RANG pionowych (świat). Tor źródła: kotwica → TR → zacisk →
 *  aparat incomera → szyna; każdy człon dostaje własny, czytelny odcinek. */
const ANCHOR_TO_TR = 96;
const TR_TO_TERMINAL = 88;
/** T5b-4: tor incomera dostaje REALNY pion (zmierzona klasa kolizji: przy 84
 *  jednostkach etykieta aparatu incomera i etykieta PRIMARY magistrali
 *  (długa nazwa modelowa) lądowały w tym samym pasie tekstu). */
const TERMINAL_TO_BUS = 150;
/** Sekcja → aparat odpływu (pion) i dalej do celu odpływu. */
const BUS_TO_APPARATUS = 64;
const APPARATUS_TO_CHILD = 120;
/** Odbiór wisi na własnym kikucie POD szyną (nie w środku szyny). */
const BUS_TO_LOAD = 96;
/** Boundary: kabel pionowy do terminala, chip poziomo od terminala. */
const BUS_TO_BOUNDARY_TERMINAL = 110;
const BOUNDARY_CHIP_OFFSET_X = 120;

/** Raster kikutów ODPŁYWÓW na szynie (P0.7 — rytm rozdzielnicy). T5b-4:
 *  poszerzony pod typografię SCREEN-STABLE (etykieta „QF-xx" 12,5 px ekranu
 *  obok glifu 34 px NIE może dotykać kikuta sąsiada przy skali fitu ~0,65 —
 *  zmierzone na zrzucie Stacji C). */
const TAP_PITCH = 120;
/** Raster kikutów ŹRÓDEŁ nad szyną — tabliczka TR (blok 4 linii) jest
 *  szeroka; PV/BESS obok TR potrzebują własnego pasa. */
const SOURCE_TAP_PITCH = 220;
/** T5b-4: pas generatora ZA pasem TR — szerszy niż raster TR, bo blok
 *  tabliczki TR (PRIMARY 630 kVA + przekładnia·grupa) sięga ~150 j.św. w
 *  prawo od osi TR (zmierzona kolizja „· Dyn11" × glif PV na zrzucie
 *  multi-source przy 220). */
const GEN_AFTER_TR_PITCH = 300;
/** Margines wewnętrzny kreski magistrali (P0.3 — szyna wystaje poza skrajne
 *  kikuty, czytelna jako MAGISTRALA, nie odcinek między punktami). */
const TAP_MARGIN = 52;
/** Minimalna połowa długości kreski (sekcja bez odpływów dalej wygląda jak
 *  szyna, nie kropka). */
const MIN_BOARD_HALF_WIDTH = 120;
/** Pozioma przerwa sprzęgła między sąsiednimi sekcjami (P0.4 — sylwetka
 *  OPEN/CLOSED musi mieć miejsce na DUŻY aparat + podpis). */
const COUPLER_SPAN = 140;
/** Odstęp między sekcjami NIE połączonymi sprzęgłem oraz między kolumnami
 *  podrozdzielnic. */
const SECTION_GAP = 110;
/** Eksport historyczny (piny P0.13) — minimum inżynierskie rastru. */
export const MIN_TAP_PITCH = 40;

export type LvDomainSceneNodeKind =
  | 'anchorChip'
  | 'transformer'
  | 'generator'
  | 'bus'
  | 'busJunction'
  | 'apparatus'
  | 'load'
  | 'boundaryChip'
  | 'boundaryTerminal';

export interface LvDomainSceneNode {
  readonly kind: LvDomainSceneNodeKind;
  /** `ref_id` elementu domeny albo identyfikator syntetyczny
   *  (`anchor:{transformer_ref}`, `boundary:{branch_ref}`,
   *  `boundary-terminal:{branch_ref}`) — wyrocznia zgodności odróżnia po
   *  prefiksie. */
  readonly ref: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly symbolId?: SymbolId;
  readonly meta?: Readonly<Record<string, unknown>>;
  /** WYŁĄCZNIE `kind==='bus'` — połowa długości kreski magistrali. */
  readonly busBarHalfWidth?: number;
}

export type LvDomainSceneEdgeKind = 'sourceDrop' | 'coupler' | 'branch' | 'cable' | 'boundaryLink';

export interface LvDomainSceneEdge {
  readonly ref: string;
  readonly kind: LvDomainSceneEdgeKind;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly status?: 'closed' | 'open';
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface LvDomainScene {
  readonly nodes: readonly LvDomainSceneNode[];
  readonly edges: readonly LvDomainSceneEdge[];
  readonly width: number;
  readonly height: number;
  readonly stationRef: string;
  readonly stationName: string;
}

/**
 * T5b-4 (P0-V3 SYMBOL GRAMMAR, werdykt pkt 5: „projektant rozpoznaje
 * funkcję urządzenia PRZED przeczytaniem napisu … nie powiększać jednego
 * uniwersalnego kwadratu"): sylwetka ZA FUNKCJĄ z `branch.type` — poprzednie
 * mapowanie zlewało switch/disconnector/breaker w jeden glif `nnBreaker`
 * (dokładnie wada nazwana w werdykcie). Rozłącznik → nóż z poprzeczką
 * (IEC 60617 S00504), odłącznik → nóż bez poprzeczki, wyłącznik → korpus
 * MCB, bezpiecznik → kaseta wkładki. Biblioteka glifów (`symbols/glyphs.tsx`)
 * niesie te sylwetki od dawna — wada była w mapowaniu, nie w bibliotece.
 */
function apparatusSymbolFor(branchType: LvDomainBranch['type']): SymbolId | undefined {
  switch (branchType) {
    case 'breaker':
      return 'nnBreaker';
    case 'switch':
      return 'loadBreakSwitch';
    case 'disconnector':
      return 'disconnector';
    case 'fuse':
      return 'nnFuseSwitch';
    case 'bus_coupler':
      return 'nnBreaker';
    case 'cable':
    case 'line_overhead':
      return undefined;
    default:
      return undefined;
  }
}

function symbolForGenerator(genType: string | null | undefined): SymbolId {
  switch (genType) {
    case 'pv_inverter':
      return 'derPv';
    case 'bess':
      return 'derBess';
    default:
      return 'derGenerator';
  }
}

/** Etykieta tabliczki TR (renderer rozbija na blok wieloliniowy — P0.5). */
export function transformerNameplateLabel(t: {
  readonly sn_mva: number;
  readonly uhv_kv: number;
  readonly ulv_kv: number;
  readonly vector_group?: string | null;
  readonly uk_percent: number;
}): string {
  const sn = `${t.sn_mva} MVA`;
  const ratio = `${t.uhv_kv}/${t.ulv_kv} kV`;
  const group = t.vector_group ?? '—';
  return `${sn} · ${ratio} · ${group} · uk=${t.uk_percent}%`;
}

/**
 * TOŻSAMOŚĆ kotwicy zasilania SN — krótka, bez parametrów. Kotwica jest
 * początkiem toru domeny nN, więc jej oznaczenie zostaje na KAŻDYM poziomie
 * szczegółowości (`visualGrammar.ts::REJESTR_ELEMENTOW_KANWY`,
 * `nazwaKotwicyZrodla`); parametry zwarciowe idą osobno, jako opis.
 */
export function anchorChipIdentityLabel(snapshot: UpstreamEquivalentSnapshot): string {
  if (snapshot.status !== 'OK') return 'SN · brak danych';
  const uVoltage = snapshot.voltage_kv != null ? `${snapshot.voltage_kv} kV` : '—';
  return `SN ${uVoltage}`;
}

/** Liczba ze stałą liczbą miejsc po przecinku w zapisie POLSKIM (przecinek
 *  dziesiętny) — wyłącznie prezentacja wartości policzonych przez backend. */
export function plFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

/** OPIS kotwicy (Sk″/Ik″) — poziom pełny; `null`, gdy snapshot bez danych. */
export function anchorChipDetailLabel(snapshot: UpstreamEquivalentSnapshot): string | null {
  if (snapshot.status !== 'OK') return null;
  const sk = snapshot.sk_mva != null ? `Sk″=${plFixed(snapshot.sk_mva, 1)} MVA` : 'Sk″=—';
  const ik = snapshot.ikss_ka != null ? `Ik″=${plFixed(snapshot.ikss_ka, 2)} kA` : 'Ik″=—';
  return `${sk} · ${ik}`;
}

/** Pełna etykieta kotwicy = tożsamość + opis (JEDNO źródło obu części —
 *  renderer nie parsuje tej etykiety, tylko czyta obie części z meta). */
export function anchorChipLabel(snapshot: UpstreamEquivalentSnapshot): string {
  const identity = anchorChipIdentityLabel(snapshot);
  const detail = anchorChipDetailLabel(snapshot);
  return detail ? `${identity} · ${detail}` : identity;
}

/** Stan zasilania szyny — jedno rozstrzygnięcie dla całej sceny. */
export interface StanZasilaniaSzyny {
  readonly energized: boolean;
  readonly derOnly: boolean;
  readonly supplyRefs: readonly string[];
  /** Wyspa (spójna składowa energetyczna) szyny — JEDYNY „komponent
   *  elektryczny" sceny; `undefined` wyłącznie dla szyny, której backend nie
   *  przypisał do żadnej wyspy (niespójna odpowiedź — nie fabrykujemy). */
  readonly islandRef: string | undefined;
}

/**
 * ENERGIZACJA/WYSPY — JEDNO źródło prawdy dla całej sceny (reguła
 * predykatów parami: kreska szyny i kreski jej odpływów muszą wynikać z tego
 * samego rozstrzygnięcia, inaczej „dziś się zgadzają", a rozjadą się na
 * danych brzegowych). Stan czytamy Z DANYCH backendu (`buses[i].energized/
 * supply_refs/der_only`, `graph.islands`) — zero wyprowadzania energizacji
 * ani spójności z topologii w warstwie prezentacji (kanon
 * `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md` §3: zakaz BFS po stronie klienta).
 */
export function stanZasilaniaSzyn(view: LvDomainGraphView): ReadonlyMap<string, StanZasilaniaSzyny> {
  const wynik = new Map<string, StanZasilaniaSzyny>();
  const islandOfBus = new Map<string, LvDomainIsland>();
  for (const island of [...view.islands].sort((a, b) => a.island_ref.localeCompare(b.island_ref))) {
    for (const busRef of island.bus_refs) {
      if (!islandOfBus.has(busRef)) islandOfBus.set(busRef, island);
    }
  }
  for (const bus of view.buses) {
    wynik.set(bus.ref_id, {
      energized: bus.energized,
      derOnly: bus.der_only,
      supplyRefs: bus.supply_refs,
      islandRef: islandOfBus.get(bus.ref_id)?.island_ref,
    });
  }
  return wynik;
}

export function domainDescriptorLabel(view: LvDomainGraphView): string {
  if (view.status !== 'OK') return 'brak danych';
  const boardVoltageKv = view.buses.find((b) => b.hops_from_root === 0)?.voltage_kv ?? view.buses[0]?.voltage_kv;
  const parts: string[] = [];
  parts.push(boardVoltageKv != null ? `${boardVoltageKv} kV` : '—');
  if (view.transformers.length > 0) parts.push(`${view.transformers.length}×TR`);
  const subSwitchboardBusRefs = new Set(view.sub_switchboards.flatMap((s) => s.bus_refs));
  const sectionCount = view.buses.filter(
    (b) => b.hops_from_root === 0 || subSwitchboardBusRefs.has(b.ref_id),
  ).length;
  parts.push(`${sectionCount} ${sectionCount === 1 ? 'sekcja' : 'sekcje'}`);
  const genTypes = new Set(view.generators.map((g) => g.gen_type ?? 'źródło'));
  if (genTypes.has('pv_inverter')) parts.push('PV');
  if (genTypes.has('bess')) parts.push('BESS');
  for (const other of genTypes) {
    if (other !== 'pv_inverter' && other !== 'bess') parts.push('DER');
  }
  if (view.boundary_links.length > 0) {
    parts.push(`${view.boundary_links.length} boundary`);
  }
  return parts.join(' · ');
}

function otherBusRef(branch: LvDomainBranch, busRef: string): string | null {
  if (branch.from_bus_ref === busRef) return branch.to_bus_ref;
  if (branch.to_bus_ref === busRef) return branch.from_bus_ref;
  return null;
}

/** Incomer TR (P0.3/P0.4) — kryterium topologiczne, zero geometrii. */
export function findTransformerIncomer(
  trafo: LvDomainTransformer,
  branches: readonly LvDomainBranch[],
): { readonly boardBusRef: string; readonly incomerBranch: LvDomainBranch | null } {
  const touching = branches.filter(
    (b) => b.from_bus_ref === trafo.lv_bus_ref || b.to_bus_ref === trafo.lv_bus_ref,
  );
  if (touching.length === 1 && touching[0].type !== 'bus_coupler') {
    const boardBusRef = otherBusRef(touching[0], trafo.lv_bus_ref);
    if (boardBusRef) return { boardBusRef, incomerBranch: touching[0] };
  }
  return { boardBusRef: trafo.lv_bus_ref, incomerBranch: null };
}

// ---------------------------------------------------------------------------
// T5b-3 LAYOUT ENGINE — sekcja jako kontener.
// ---------------------------------------------------------------------------

interface AboveItem {
  readonly kind: 'transformer' | 'generator';
  readonly ref: string;
}

/** Kikut POD szyną: odpływ do dziecka / odbiór na tej szynie / boundary. */
interface BelowItem {
  readonly kind: 'branch' | 'load' | 'boundary';
  readonly ref: string;
  /** Dla `branch`: ref szyny-dziecka (celu odpływu). */
  readonly childBusRef?: string;
}

interface SectionPlan {
  readonly busRef: string;
  readonly above: readonly AboveItem[];
  readonly below: readonly BelowItem[];
  /** T5b-4 (P0-V10, werdykt pkt 18 „centralna oś TR→incomer→BUS"): offset X
   *  źródła od OSI sekcji — transformator(y) CENTROWANE na osi (pojedynczy
   *  TR = dokładnie środek kreski), generatory (PV/BESS) na kolejnych
   *  slotach NA PRAWO od pasa TR (kreska pozostaje symetryczna wokół osi,
   *  więc oś TR == geometryczny środek magistrali). */
  readonly aboveOffsetByRef: ReadonlyMap<string, number>;
  /** T5b-4 (P0-V4 FEEDER SLOT): offset X kikuta odpływu od osi sekcji —
   *  każdy odpływ dostaje SLOT o szerokości swojego PODDRZEWA (sekcja-
   *  dziecko szersza niż raster NIE wjeżdża w kolumnę sąsiada; zmierzona
   *  klasa: kreska RGN-2 kończyła się dokładnie w kolumnie PV/PCC, co
   *  sugerowało nieistniejące połączenie). */
  readonly belowOffsetByRef: ReadonlyMap<string, number>;
  /** Szerokość CAŁEGO kontenera sekcji (kreska + poddrzewa dzieci). */
  width: number;
  /** Połowa długości samej kreski magistrali. */
  barHalfWidth: number;
  /** Wypełniane przy pozycjonowaniu. */
  centerX: number;
  busY: number;
}

export function composeLvDomainScene(
  view: LvDomainGraphView,
  upstreamEquivalents: readonly UpstreamEquivalentSnapshot[] = [],
): LvDomainScene {
  const nodes: LvDomainSceneNode[] = [];
  const edges: LvDomainSceneEdge[] = [];

  if (view.status !== 'OK') {
    return { nodes, edges, width: 0, height: 0, stationRef: view.station_ref, stationName: view.station_name ?? '' };
  }

  const zasilanieSzyn = stanZasilaniaSzyn(view);
  /**
   * Stan zasilania ODCINKA: „bez napięcia" WYŁĄCZNIE wtedy, gdy KAŻDY znany
   * koniec jest bez napięcia. Odcinek między szyną pod napięciem a szyną bez
   * napięcia (np. za otwartym łącznikiem) NIE dostaje stylu wygaszonego —
   * jego jeden koniec jest pod napięciem i udawanie inaczej byłoby fałszem
   * ruchowym. Brak danych na obu końcach = brak oznaczenia.
   */
  const energiaOdcinka = (...busRefs: readonly (string | undefined)[]): boolean | undefined => {
    const znane = busRefs
      .map((ref) => (ref === undefined ? undefined : zasilanieSzyn.get(ref)?.energized))
      .filter((value): value is boolean => value !== undefined);
    if (znane.length === 0) return undefined;
    return znane.some((value) => value);
  };
  const busByRef = new Map(view.buses.map((b) => [b.ref_id, b] as const));
  const subSwitchboardBusRefs = new Set<string>(
    view.sub_switchboards.flatMap((s: LvDomainSubSwitchboard) => s.bus_refs),
  );

  // --- Incomery TR: zaciski dedykowane wyłączone z sekcji (rysowane na
  // pionie źródła), gałąź incomera skonsumowana.
  const incomerByTransformerRef = new Map<string, { readonly boardBusRef: string; readonly incomerBranch: LvDomainBranch | null }>();
  const terminalBusRefs = new Set<string>();
  const consumedBranchRefs = new Set<string>();
  for (const trafo of [...view.transformers].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const result = findTransformerIncomer(trafo, view.branches);
    incomerByTransformerRef.set(trafo.ref_id, result);
    if (result.incomerBranch) {
      terminalBusRefs.add(trafo.lv_bus_ref);
      consumedBranchRefs.add(result.incomerBranch.ref_id);
    }
  }

  const isBoardBus = (busRef: string): boolean => {
    const bus = busByRef.get(busRef);
    return !!bus && (bus.hops_from_root === 0 || subSwitchboardBusRefs.has(busRef));
  };

  // --- Drzewo sekcji: rodzic szyny-dziecka = szyna o mniejszej głębokości
  // połączona gałęzią (deterministycznie po ref_id gałęzi). Zaciski pośrednie
  // (nie-board, nie-terminal TR) wiszą na torze odpływu między rodzicem a
  // dzieckiem — reprezentowane jako childBusRef kolejnych segmentów.
  const gridBuses = view.buses.filter((b) => !terminalBusRefs.has(b.ref_id));
  const gridBusRefs = new Set(gridBuses.map((b) => b.ref_id));

  const aboveByBus = new Map<string, AboveItem[]>();
  const pushAbove = (busRef: string, item: AboveItem): void => {
    const list = aboveByBus.get(busRef) ?? [];
    list.push(item);
    aboveByBus.set(busRef, list);
  };
  for (const trafo of [...view.transformers].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const { boardBusRef } = incomerByTransformerRef.get(trafo.ref_id)!;
    pushAbove(boardBusRef, { kind: 'transformer', ref: trafo.ref_id });
  }
  for (const gen of [...view.generators].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (gridBusRefs.has(gen.bus_ref)) pushAbove(gen.bus_ref, { kind: 'generator', ref: gen.ref_id });
  }

  const belowByBus = new Map<string, BelowItem[]>();
  const parentOfChild = new Map<string, string>();
  const pushBelow = (busRef: string, item: BelowItem): void => {
    const list = belowByBus.get(busRef) ?? [];
    list.push(item);
    belowByBus.set(busRef, list);
  };
  for (const branch of [...view.branches].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (consumedBranchRefs.has(branch.ref_id)) continue;
    if (branch.type === 'bus_coupler') continue;
    const fromBus = busByRef.get(branch.from_bus_ref);
    const toBus = busByRef.get(branch.to_bus_ref);
    if (!fromBus || !toBus) continue;
    if (!gridBusRefs.has(fromBus.ref_id) || !gridBusRefs.has(toBus.ref_id)) continue;
    const parentRef = fromBus.hops_from_root <= toBus.hops_from_root ? fromBus.ref_id : toBus.ref_id;
    const childRef = parentRef === fromBus.ref_id ? toBus.ref_id : fromBus.ref_id;
    if (!parentOfChild.has(childRef)) parentOfChild.set(childRef, parentRef);
    pushBelow(parentRef, { kind: 'branch', ref: branch.ref_id, childBusRef: childRef });
  }
  for (const load of [...view.loads].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (gridBusRefs.has(load.bus_ref)) pushBelow(load.bus_ref, { kind: 'load', ref: load.ref_id });
  }
  for (const link of [...view.boundary_links].sort((a, b) => a.branch_ref.localeCompare(b.branch_ref))) {
    if (gridBusRefs.has(link.from_bus_ref)) pushBelow(link.from_bus_ref, { kind: 'boundary', ref: link.branch_ref });
  }
  for (const list of aboveByBus.values()) {
    list.sort((a, b) => (a.kind === b.kind ? a.ref.localeCompare(b.ref) : a.kind === 'transformer' ? -1 : 1));
  }
  for (const list of belowByBus.values()) list.sort((a, b) => a.ref.localeCompare(b.ref));

  // --- Plan sekcji (kontener): szerokość rekurencyjnie z zawartości.
  const planByBus = new Map<string, SectionPlan>();

  /** Szerokość poddrzewa wiszącego pod szyną `busRef` (P0-V4): sekcja =
   *  pełny kontener + odstęp; zacisk pośredni = suma poddrzew jego dzieci
   *  (fan wielodzieciowy junctiona), liść = raster. Graf odpływów jest
   *  drzewem (parentOfChild przypisuje rodzica raz), więc rekurencja
   *  terminuje. */
  function subtreeWidth(busRef: string): number {
    if (isBoardBus(busRef)) return planSection(busRef).width + SECTION_GAP;
    const children = (belowByBus.get(busRef) ?? []).filter((i) => i.kind === 'branch' && i.childBusRef);
    if (children.length === 0) return TAP_PITCH;
    return Math.max(
      TAP_PITCH,
      children.reduce((acc, child) => acc + subtreeWidth(child.childBusRef!), 0),
    );
  }
  function planSection(busRef: string): SectionPlan {
    const existing = planByBus.get(busRef);
    if (existing) return existing;
    const above = aboveByBus.get(busRef) ?? [];
    const below = belowByBus.get(busRef) ?? [];
    // T5b-4 (P0-V10/pkt 18): TR-y symetrycznie WOKÓŁ OSI sekcji (1×TR =
    // dokładnie oś == środek kreski); generatory na slotach NA PRAWO od
    // pasa TR (a bez TR — symetrycznie, jak dotąd).
    const aboveOffsetByRef = new Map<string, number>();
    const aboveTrs = above.filter((i) => i.kind === 'transformer');
    const aboveGens = above.filter((i) => i.kind === 'generator');
    /**
     * OŚ SEKCJI PODRZĘDNEJ NALEŻY DO TORU Z SEKCJI RODZICA. Kikut rodzica
     * (aparat odpływu → kabel) wchodzi DOKŁADNIE w środek kreski sekcji
     * podrzędnej, więc jej WŁASNE źródła nie mogą stanąć na osi — muszą iść
     * kolejnymi slotami na prawo. Zmierzone na fixturze wysp: źródło PV
     * podrozdzielnicy zasilanej przez OTWARTY odłącznik lądowało glifem
     * NA glifie tego odłącznika (dwa aparaty w jednym punkcie rysunku).
     * Klasa, nie instancja: dotyczy KAŻDEGO źródła własnego (TR i DER) na
     * KAŻDEJ sekcji, która ma rodzica — sekcje korzeniowe zachowują kanon
     * „oś TR == środek kreski" (ich oś nie niesie toru z góry).
     */
    const osZajetaTorem = parentOfChild.has(busRef);
    if (osZajetaTorem) {
      aboveTrs.forEach((item, i) => aboveOffsetByRef.set(item.ref, (i + 1) * SOURCE_TAP_PITCH));
      const trRightEdge = aboveTrs.length * SOURCE_TAP_PITCH;
      aboveGens.forEach((item, j) =>
        aboveOffsetByRef.set(
          item.ref,
          aboveTrs.length > 0 ? trRightEdge + (j + 1) * GEN_AFTER_TR_PITCH : (j + 1) * SOURCE_TAP_PITCH,
        ),
      );
    } else {
      aboveTrs.forEach((item, i) => aboveOffsetByRef.set(item.ref, (i - (aboveTrs.length - 1) / 2) * SOURCE_TAP_PITCH));
      if (aboveTrs.length > 0) {
        const trRightEdge = ((aboveTrs.length - 1) / 2) * SOURCE_TAP_PITCH;
        aboveGens.forEach((item, j) => aboveOffsetByRef.set(item.ref, trRightEdge + (j + 1) * GEN_AFTER_TR_PITCH));
      } else {
        aboveGens.forEach((item, j) => aboveOffsetByRef.set(item.ref, (j - (aboveGens.length - 1) / 2) * SOURCE_TAP_PITCH));
      }
    }
    const aboveSpanHalf = Math.max(0, ...[...aboveOffsetByRef.values()].map((v) => Math.abs(v)));
    // P0-V4 FEEDER SLOT: szerokość slotu odpływu = szerokość CAŁEGO
    // PODDRZEWA za kikutem (sekcja-dziecko może wisieć ZA łańcuchem
    // zacisków — rekurencja `subtreeWidth` schodzi przez junctiony, nie
    // tylko jeden poziom). Kikuty na ŚRODKACH slotów ⇒ żadna kolumna
    // (w tym kreska sekcji-dziecka) nie wjeżdża w kolumnę sąsiada.
    const belowSlots = below.map((item) => ({
      ref: item.ref,
      width: item.kind === 'branch' && item.childBusRef ? subtreeWidth(item.childBusRef) : TAP_PITCH,
    }));
    const belowTotal = belowSlots.reduce((acc, slot) => acc + slot.width, 0);
    const belowOffsetByRef = new Map<string, number>();
    let slotCursor = -belowTotal / 2;
    for (const slot of belowSlots) {
      belowOffsetByRef.set(slot.ref, slotCursor + slot.width / 2);
      slotCursor += slot.width;
    }
    const belowSpanHalf = Math.max(0, ...[...belowOffsetByRef.values()].map((v) => Math.abs(v)));
    const barHalfWidth = Math.max(MIN_BOARD_HALF_WIDTH, aboveSpanHalf + TAP_MARGIN, belowSpanHalf + TAP_MARGIN);
    const plan: SectionPlan = {
      busRef,
      above,
      below,
      aboveOffsetByRef,
      belowOffsetByRef,
      width: Math.max(barHalfWidth * 2, belowTotal),
      barHalfWidth,
      centerX: 0,
      busY: 0,
    };
    planByBus.set(busRef, plan);
    return plan;
  }

  // --- Sekcje korzeniowe (hops 0) obok siebie; sprzęgło = przerwa COUPLER_SPAN.
  const rootBuses = gridBuses
    .filter((b) => b.hops_from_root === 0)
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
  for (const bus of rootBuses) planSection(bus.ref_id);

  // Głębokość toru źródła nad szyną korzeniową (kotwica+TR+zacisk).
  const SOURCE_STACK = ANCHOR_TO_TR + TR_TO_TERMINAL + TERMINAL_TO_BUS;
  const ROOT_BUS_Y = MARGIN_Y + SOURCE_STACK;

  let cursorX = MARGIN_X;
  const orderedRootPlans: SectionPlan[] = [];
  rootBuses.forEach((bus, idx) => {
    const plan = planByBus.get(bus.ref_id)!;
    plan.centerX = cursorX + plan.width / 2;
    plan.busY = ROOT_BUS_Y;
    orderedRootPlans.push(plan);
    const gap = idx < rootBuses.length - 1 ? COUPLER_SPAN : 0;
    cursorX += plan.width + gap;
  });

  // --- Pozycjonowanie rekurencyjne dzieci: dziecko CENTROWANE pod kikutem.
  function tapXFor(plan: SectionPlan, side: 'above' | 'below', ref: string): number {
    // P0-V10 (above: oś TR = oś sekcji) / P0-V4 (below: środek SLOTU
    // odpływu) — oba offsety policzone w planie sekcji, JEDNO źródło prawdy.
    const offsets = side === 'above' ? plan.aboveOffsetByRef : plan.belowOffsetByRef;
    return plan.centerX + (offsets.get(ref) ?? 0);
  }

  // BFS po CAŁYM drzewie odpływów (P0.7 — tor pionowy): każdy bus siatki
  // (board LUB zacisk pośredni) dostaje pozycję pod kikutem rodzica.
  // Łańcuch board→aparat→zacisk→kabel→zacisk→… schodzi kolejnymi rangami;
  // dziecko CENTROWANE pod kikutem ⇒ segmenty pionowe. Wielo-dziecko
  // zacisku pośredniego rozkłada się rastrem wokół pionu (ukośna kreska =
  // dopuszczalny wyjątek, nie podstawa layoutu).
  const JUNCTION_STEP = 104;
  const junctionPos = new Map<string, { x: number; y: number }>();
  const placeQueue: string[] = rootBuses.map((b) => b.ref_id);
  const placed = new Set<string>(placeQueue);
  while (placeQueue.length > 0) {
    const busRef = placeQueue.shift()!;
    const parentIsBoard = isBoardBus(busRef);
    const parentPlan = parentIsBoard ? planByBus.get(busRef) : undefined;
    const parentPos = parentIsBoard
      ? { x: parentPlan!.centerX, y: parentPlan!.busY }
      : junctionPos.get(busRef);
    if (!parentPos) continue;
    const items = (belowByBus.get(busRef) ?? []).filter((i) => i.kind === 'branch' && i.childBusRef);
    items.forEach((item, idx) => {
      const childRef = item.childBusRef!;
      if (placed.has(childRef)) return;
      const tapX = parentIsBoard
        ? tapXFor(parentPlan!, 'below', item.ref)
        : parentPos.x + (idx - (items.length - 1) / 2) * TAP_PITCH;
      const childY = parentPos.y + (parentIsBoard ? BUS_TO_APPARATUS + APPARATUS_TO_CHILD : JUNCTION_STEP);
      if (isBoardBus(childRef)) {
        const childPlan = planSection(childRef);
        childPlan.centerX = tapX;
        childPlan.busY = childY;
      } else {
        junctionPos.set(childRef, { x: tapX, y: childY });
      }
      placed.add(childRef);
      placeQueue.push(childRef);
    });
  }

  const posOfBus = (busRef: string): { x: number; y: number } | undefined => {
    const plan = planByBus.get(busRef);
    if (plan && (plan.centerX !== 0 || plan.busY !== 0)) return { x: plan.centerX, y: plan.busY };
    return junctionPos.get(busRef);
  };

  // --- EMISJA: szyny.
  for (const bus of [...gridBuses].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const pos = posOfBus(bus.ref_id);
    if (!pos) continue;
    const zasilanie = zasilanieSzyn.get(bus.ref_id);
    const meta = {
      voltageKv: bus.voltage_kv,
      voltageLevelId: bus.voltage_level_id,
      hopsFromRoot: bus.hops_from_root,
      // T5b-4 (P0-V5): hierarchia magistral — MAIN (sekcje korzeniowe RGnN)
      // vs SUB (podrozdzielnice) rozpoznawalna bez czytania etykiety.
      busTier: bus.hops_from_root === 0 ? 'main' : 'sub',
      // Stan zasilania i wyspa — Z DANYCH backendu (kontrakt 2.0.0).
      energized: zasilanie?.energized,
      derOnly: zasilanie?.derOnly,
      supplyRefs: zasilanie?.supplyRefs,
      islandRef: zasilanie?.islandRef,
    };
    if (isBoardBus(bus.ref_id)) {
      const plan = planByBus.get(bus.ref_id)!;
      nodes.push({
        kind: 'bus',
        ref: bus.ref_id,
        x: pos.x,
        y: pos.y,
        label: bus.name,
        busBarHalfWidth: plan.barHalfWidth,
        meta: {
          ...meta,
          // Liczba kikutów POD szyną (odpływ do dziecka / odbiór / granica) —
          // policzona RAZ w kompozytorze; renderer wyłącznie ją formatuje
          // (na przeglądzie zastępuje nazwy poszczególnych odpływów).
          feederCount: plan.below.length,
        },
      });
    } else {
      nodes.push({
        kind: 'busJunction',
        ref: bus.ref_id,
        x: pos.x,
        y: pos.y,
        label: bus.name,
        symbolId: 'junction',
        meta,
      });
    }
  }

  // --- EMISJA: źródła (TR z torem jawnym; generatory nad kikutem).
  const snapshotByTransformerRef = new Map(upstreamEquivalents.map((s) => [s.transformer_ref, s] as const));
  for (const trafo of [...view.transformers].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const { boardBusRef, incomerBranch } = incomerByTransformerRef.get(trafo.ref_id)!;
    const plan = planByBus.get(boardBusRef);
    if (!plan) continue;
    const tapX = tapXFor(plan, 'above', trafo.ref_id);
    const busY = plan.busY;

    let terminalPos = { x: tapX, y: busY };
    if (incomerBranch) {
      terminalPos = { x: tapX, y: busY - TERMINAL_TO_BUS };
      nodes.push({
        kind: 'busJunction',
        ref: trafo.lv_bus_ref,
        x: terminalPos.x,
        y: terminalPos.y,
        label: busByRef.get(trafo.lv_bus_ref)?.name ?? trafo.lv_bus_ref,
        symbolId: 'junction',
        meta: {
          voltageKv: busByRef.get(trafo.lv_bus_ref)?.voltage_kv,
          hopsFromRoot: busByRef.get(trafo.lv_bus_ref)?.hops_from_root,
          islandRef: zasilanieSzyn.get(trafo.lv_bus_ref)?.islandRef,
          energized: zasilanieSzyn.get(trafo.lv_bus_ref)?.energized,
          derOnly: zasilanieSzyn.get(trafo.lv_bus_ref)?.derOnly,
          supplyRefs: zasilanieSzyn.get(trafo.lv_bus_ref)?.supplyRefs,
        },
      });
      const incomerSymbolId = apparatusSymbolFor(incomerBranch.type);
      const midY = (terminalPos.y + busY) / 2;
      if (incomerSymbolId) {
        nodes.push({
          kind: 'apparatus',
          ref: incomerBranch.ref_id,
          x: tapX,
          y: midY,
          label: incomerBranch.name,
          symbolId: incomerSymbolId,
          meta: { status: incomerBranch.status, catalogRef: incomerBranch.catalog_ref, type: incomerBranch.type, role: 'incomer' },
        });
      }
      edges.push({
        ref: incomerBranch.ref_id,
        kind: 'branch',
        x1: tapX,
        y1: terminalPos.y,
        x2: tapX,
        y2: busY,
        status: incomerBranch.status,
        meta: { role: 'incomer', energized: energiaOdcinka(trafo.lv_bus_ref, boardBusRef) },
      });
    }

    const trafoPos = { x: tapX, y: terminalPos.y - TR_TO_TERMINAL };
    nodes.push({
      kind: 'transformer',
      ref: trafo.ref_id,
      x: trafoPos.x,
      y: trafoPos.y,
      label: transformerNameplateLabel(trafo),
      symbolId: 'transformer2W',
      meta: {
        hvBusRef: trafo.hv_bus_ref,
        lvBusRef: trafo.lv_bus_ref,
        boardBusRef,
        hasExplicitIncomer: !!incomerBranch,
        // T5b-4 (werdykt pkt 4 — blok TR w hierarchii, nie 5 mikrolinii):
        // renderer buduje blok z DANYCH modelu, nie z parsowania etykiety
        // (predykaty parami — etykieta i blok z JEDNEGO źródła: modelu).
        name: trafo.name,
        snMva: trafo.sn_mva,
        uhvKv: trafo.uhv_kv,
        ulvKv: trafo.ulv_kv,
        vectorGroup: trafo.vector_group ?? null,
        ukPercent: trafo.uk_percent,
      },
    });
    edges.push({
      ref: `${trafo.ref_id}#source-drop`,
      kind: 'sourceDrop',
      x1: trafoPos.x,
      y1: trafoPos.y,
      x2: terminalPos.x,
      y2: terminalPos.y,
      meta: { energized: energiaOdcinka(trafo.lv_bus_ref, incomerBranch ? undefined : boardBusRef) },
    });

    const snapshot = snapshotByTransformerRef.get(trafo.ref_id);
    const anchorPos = { x: trafoPos.x, y: trafoPos.y - ANCHOR_TO_TR };
    nodes.push({
      kind: 'anchorChip',
      ref: `anchor:${trafo.ref_id}`,
      x: anchorPos.x,
      y: anchorPos.y,
      label: snapshot ? anchorChipLabel(snapshot) : 'SN · brak danych',
      meta: {
        ...(snapshot as unknown as Record<string, unknown> | undefined),
        // Obie części etykiety kotwicy z JEDNEGO źródła (renderer NIE
        // parsuje `label` — tożsamość i opis mają różny zasięg poziomów).
        tozsamoscLabel: snapshot ? anchorChipIdentityLabel(snapshot) : 'SN · brak danych',
        opisLabel: snapshot ? anchorChipDetailLabel(snapshot) : null,
      },
    });
    edges.push({
      ref: `anchor:${trafo.ref_id}#drop`,
      kind: 'sourceDrop',
      x1: anchorPos.x,
      y1: anchorPos.y,
      x2: trafoPos.x,
      y2: trafoPos.y,
    });
  }

  for (const gen of [...view.generators].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const busPos = posOfBus(gen.bus_ref);
    if (!busPos) continue;
    const plan = planByBus.get(gen.bus_ref);
    const directOnBoard = isBoardBus(gen.bus_ref);
    const tapX = plan && directOnBoard ? tapXFor(plan, 'above', gen.ref_id) : busPos.x;
    // Generator na zacisku toru (pełne pole źródłowe): symbol na PIONIE toru,
    // nad zaciskiem. Generator wprost na sekcji: nad własnym kikutem.
    // T5b-4: 104 j.św. nad zaciskiem — glif źródła (54 px ekranu) i jego
    // etykieta nie wchodzą w pas etykiety szyny podrzędnej obok (zmierzona
    // kolizja PV1 × „Szyna RGN-2" na zrzucie Stacji C).
    const genPos = { x: tapX, y: busPos.y - (directOnBoard ? TR_TO_TERMINAL : 104) };
    nodes.push({
      kind: 'generator',
      ref: gen.ref_id,
      x: genPos.x,
      y: genPos.y,
      label: `${gen.name} · ${gen.p_mw} MW`,
      symbolId: symbolForGenerator(gen.gen_type),
      meta: { busRef: gen.bus_ref, genType: gen.gen_type, connectionVariant: gen.connection_variant },
    });
    edges.push({
      ref: `${gen.ref_id}#source-drop`,
      kind: 'sourceDrop',
      x1: genPos.x,
      y1: genPos.y,
      x2: tapX,
      y2: busPos.y,
      meta: directOnBoard
        ? {
            energized: energiaOdcinka(gen.bus_ref),
            apparatusGapPl:
              'Brak jawnego aparatu pola źródłowego w grafie domeny (LvDomainGraphView.generators nie niesie ' +
              'tor pola: aparat/kabel/PCC — dane pola źródłowego istnieją WYŁĄCZNIE jako meta stacji ' +
              '`nn_field_specs`, nieeksponowana przez /enm/lv-domain). Punkt renderowany jako bezpośrednie ' +
              'podłączenie do sekcji — luka modelu, patrz raport karty T5b-2 P0.7.',
          }
        : { energized: energiaOdcinka(gen.bus_ref) },
    });
  }

  // --- EMISJA: odpływy ORTOGONALNIE (P0.7). Aparat na pionie kikuta;
  // kabel pionowo do celu (dziecko centrowane pod kikutem ⇒ x stały).
  for (const branch of [...view.branches].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (consumedBranchRefs.has(branch.ref_id)) continue;
    if (branch.type === 'bus_coupler') continue;
    const fromBus = busByRef.get(branch.from_bus_ref);
    const toBus = busByRef.get(branch.to_bus_ref);
    if (!fromBus || !toBus) continue;
    if (!gridBusRefs.has(fromBus.ref_id) || !gridBusRefs.has(toBus.ref_id)) continue;
    const parentRef = fromBus.hops_from_root <= toBus.hops_from_root ? fromBus.ref_id : toBus.ref_id;
    const childRef = parentRef === fromBus.ref_id ? toBus.ref_id : fromBus.ref_id;
    const parentPlan = planByBus.get(parentRef);
    const parentIsBoard = isBoardBus(parentRef) && !!parentPlan;
    const parentPos = posOfBus(parentRef);
    const childPos = posOfBus(childRef);
    if (!parentPos || !childPos) continue;

    const tapX = parentIsBoard ? tapXFor(parentPlan!, 'below', branch.ref_id) : parentPos.x;
    const symbolId = apparatusSymbolFor(branch.type);
    if (symbolId) {
      nodes.push({
        kind: 'apparatus',
        ref: branch.ref_id,
        x: tapX,
        y: parentPos.y + BUS_TO_APPARATUS,
        label: branch.name,
        symbolId,
        meta: { status: branch.status, catalogRef: branch.catalog_ref, type: branch.type },
      });
    }
    const edgeKind: LvDomainSceneEdgeKind = branch.type === 'cable' || branch.type === 'line_overhead' ? 'cable' : 'branch';
    const energized = energiaOdcinka(parentRef, childRef);
    edges.push({
      ref: branch.ref_id,
      kind: edgeKind,
      x1: tapX,
      y1: parentPos.y,
      x2: childPos.x,
      y2: childPos.y,
      status: branch.status,
      meta:
        edgeKind === 'cable'
          ? { catalogRef: branch.catalog_ref, catalogNamespace: branch.catalog_namespace, energized }
          : { energized },
    });
  }

  // --- EMISJA: sprzęgło w PRZERWIE między kreskami sąsiednich sekcji (P0.4).
  for (const branch of [...view.branches].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (branch.type !== 'bus_coupler') continue;
    const fromPlan = planByBus.get(branch.from_bus_ref);
    const toPlan = planByBus.get(branch.to_bus_ref);
    const fromPos = posOfBus(branch.from_bus_ref);
    const toPos = posOfBus(branch.to_bus_ref);
    if (!fromPos || !toPos) continue;
    const sameDepthBoards = !!fromPlan && !!toPlan && fromPos.y === toPos.y;
    let x1: number;
    let x2: number;
    if (sameDepthBoards) {
      const leftIsFrom = fromPos.x <= toPos.x;
      x1 = leftIsFrom ? fromPos.x + fromPlan!.barHalfWidth : fromPos.x - fromPlan!.barHalfWidth;
      x2 = leftIsFrom ? toPos.x - toPlan!.barHalfWidth : toPos.x + toPlan!.barHalfWidth;
    } else {
      x1 = fromPos.x;
      x2 = toPos.x;
    }
    const y = fromPos.y;
    const midX = (x1 + x2) / 2;
    nodes.push({
      kind: 'apparatus',
      ref: branch.ref_id,
      x: midX,
      y,
      label: branch.name,
      symbolId: apparatusSymbolFor('bus_coupler')!,
      meta: { status: branch.status, catalogRef: branch.catalog_ref, type: branch.type, role: 'coupler' },
    });
    edges.push({
      ref: branch.ref_id,
      kind: 'coupler',
      x1,
      y1: y,
      x2,
      y2: y,
      status: branch.status,
      meta: { energized: energiaOdcinka(branch.from_bus_ref, branch.to_bus_ref) },
    });
  }

  // --- EMISJA: odbiory NA WŁASNYM KIKUCIE pod szyną (P0.7 — raster, nie
  // środek szyny) z pionowym zejściem.
  for (const load of [...view.loads].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const busPos = posOfBus(load.bus_ref);
    if (!busPos) continue;
    const plan = planByBus.get(load.bus_ref);
    const tapX = plan && isBoardBus(load.bus_ref) ? tapXFor(plan, 'below', load.ref_id) : busPos.x;
    const loadPos = { x: tapX, y: busPos.y + BUS_TO_LOAD };
    nodes.push({
      kind: 'load',
      ref: load.ref_id,
      x: loadPos.x,
      y: loadPos.y,
      label: `${load.name} · ${load.p_mw} MW`,
      symbolId: 'loadArrow',
      meta: { busRef: load.bus_ref, pMw: load.p_mw, qMvar: load.q_mvar },
    });
    edges.push({
      ref: `${load.ref_id}#feeder-drop`,
      kind: 'branch',
      x1: tapX,
      y1: busPos.y,
      x2: loadPos.x,
      y2: loadPos.y,
      meta: { role: 'loadDrop', energized: energiaOdcinka(load.bus_ref) },
    });
  }

  // --- EMISJA: boundary — kikut → kabel PIONOWO → ● terminal → chip poziomo.
  const boundaryBranchByRef = new Map(view.branches.map((b) => [b.ref_id, b] as const));
  for (const link of [...view.boundary_links].sort((a: LvDomainBoundaryLink, b) => a.branch_ref.localeCompare(b.branch_ref))) {
    const busPos = posOfBus(link.from_bus_ref);
    if (!busPos) continue;
    const plan = planByBus.get(link.from_bus_ref);
    const tapX = plan && isBoardBus(link.from_bus_ref) ? tapXFor(plan, 'below', link.branch_ref) : busPos.x;
    const terminalPos = { x: tapX, y: busPos.y + BUS_TO_BOUNDARY_TERMINAL };
    const knownBranch = boundaryBranchByRef.get(link.branch_ref);
    const symbolId = knownBranch ? apparatusSymbolFor(knownBranch.type) : undefined;

    let cableFrom = { x: tapX, y: busPos.y };
    if (symbolId && knownBranch) {
      // T5b-4 (P0-V4 DEVICE BASELINE): aparat granicy na TEJ SAMEJ randze co
      // aparaty odpływów (BUS_TO_APPARATUS), nie na własnej wysokości.
      const appY = busPos.y + BUS_TO_APPARATUS;
      nodes.push({
        kind: 'apparatus',
        ref: link.branch_ref,
        x: tapX,
        y: appY,
        label: knownBranch.name,
        symbolId,
        meta: { status: knownBranch.status, catalogRef: knownBranch.catalog_ref, type: knownBranch.type, role: 'boundary' },
      });
      cableFrom = { x: tapX, y: appY };
    }
    edges.push({
      ref: link.branch_ref,
      kind: 'cable',
      x1: cableFrom.x,
      y1: cableFrom.y,
      x2: terminalPos.x,
      y2: terminalPos.y,
      status: knownBranch?.status,
      meta: {
        role: 'boundary',
        energized: energiaOdcinka(link.from_bus_ref),
        gapPl: knownBranch
          ? undefined
          : 'LvDomainBoundaryLink nie niesie typu/impedancji gałęzi granicznej — kabel renderowany bez ' +
            'katalogu/przekroju/długości (luka modelu, patrz raport karty T5b-2 P0.6/P0.8).',
      },
    });
    nodes.push({
      kind: 'boundaryTerminal',
      ref: `boundary-terminal:${link.branch_ref}`,
      x: terminalPos.x,
      y: terminalPos.y,
      label: '●',
      symbolId: 'junction',
      meta: { branchRef: link.branch_ref },
    });
    const chipPos = { x: terminalPos.x + BOUNDARY_CHIP_OFFSET_X, y: terminalPos.y };
    nodes.push({
      kind: 'boundaryChip',
      ref: `boundary:${link.branch_ref}`,
      x: chipPos.x,
      y: chipPos.y,
      label: `→ ${link.target_station_name}`,
      meta: {
        targetStationRef: link.target_station_ref,
        branchRef: link.branch_ref,
        // T5b-4 (P0-V8): napięcie zacisku granicznego z modelu (szyna
        // źródłowa linku) — renderer pokazuje „terminal + referencja",
        // nie przycisk; napięcie jest częścią referencji elektrycznej.
        voltageKv: busByRef.get(link.from_bus_ref)?.voltage_kv,
      },
    });
    edges.push({
      ref: `boundary:${link.branch_ref}#link`,
      kind: 'boundaryLink',
      x1: terminalPos.x,
      y1: terminalPos.y,
      x2: chipPos.x,
      y2: chipPos.y,
      meta: { energized: energiaOdcinka(link.from_bus_ref) },
    });
  }

  // --- Otoczka i przesunięcie bbox-safe (kotwice/tabliczki nad wierszem 0).
  const allX = [...nodes.map((n) => n.x), ...edges.flatMap((e) => [e.x1, e.x2])];
  const allY = [...nodes.map((n) => n.y), ...edges.flatMap((e) => [e.y1, e.y2])];
  const minX = allX.length > 0 ? Math.min(...allX) : MARGIN_X;
  const minY = allY.length > 0 ? Math.min(...allY) : MARGIN_Y;
  const shiftX = minX < MARGIN_X ? MARGIN_X - minX : 0;
  const shiftY = minY < MARGIN_Y ? MARGIN_Y - minY : 0;

  const shiftedNodes: LvDomainSceneNode[] =
    shiftX === 0 && shiftY === 0 ? nodes : nodes.map((n) => ({ ...n, x: n.x + shiftX, y: n.y + shiftY }));
  const shiftedEdges: LvDomainSceneEdge[] =
    shiftX === 0 && shiftY === 0
      ? edges
      : edges.map((e) => ({ ...e, x1: e.x1 + shiftX, y1: e.y1 + shiftY, x2: e.x2 + shiftX, y2: e.y2 + shiftY }));

  // Gabaryt = otoczka treści (w tym KOŃCE kresek magistral) + margines —
  // fit-to-electrical-content (P0.1): scena nie niesie pustych pól.
  const extentX = shiftedNodes.map((n) => n.x + (n.busBarHalfWidth ?? 0));
  const maxX = Math.max(...extentX, ...shiftedEdges.flatMap((e) => [e.x1, e.x2]), MARGIN_X);
  const maxY = Math.max(...shiftedNodes.map((n) => n.y), ...shiftedEdges.flatMap((e) => [e.y1, e.y2]), MARGIN_Y);

  return {
    nodes: shiftedNodes,
    edges: shiftedEdges,
    width: maxX + MARGIN_X,
    height: maxY + MARGIN_Y + 40,
    stationRef: view.station_ref,
    stationName: view.station_name ?? '',
  };
}
