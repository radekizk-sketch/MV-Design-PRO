/**
 * Kompozycja SCENY L2 (karta T5b-2, `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`
 * werdykt B-02 T5b — REJECT 0/10: "L2 nadal przedstawia graf encji.
 * Następna iteracja ma zamienić RGnN/TR/PV/odpływ/podrozdzielnicę na
 * rzeczywiste tory elektryczne BUS → APPARATUS → CONDUCTOR → TERMINAL →
 * DEVICE.") — GENERYCZNA z grafu domeny, ŻADNEGO szablonu TR→RGnN→odpływy.
 *
 * JĘZYK SLD (18 punktów P0, komplet w dyspozycji): sekcje szyn = KRESKA
 * magistrali (nie ikonka), sprzęgło = JAWNY aparat NA szynie ze stanem
 * OPEN/CLOSED, incomer TR→aparat→BUS jawny (zakaz skracania do ikonki),
 * każdy odpływ = BUS→zabezpieczenie→kabel→cel, boundary = odpływ→kabel
 * (impedancja z modelu)→● terminal→chip obcej domeny. Layout z topologii
 * (`hops_from_root` z backendu, REUSE, zero powtórnego BFS w TS): wiersz =
 * głębokość, kolumna = pozycja w drzewie rodzic→dziecko. Determinizm: te
 * same dane → identyczna scena (sortowanie WSZĘDZIE po `ref_id`).
 *
 * ZASADA WORLD-SCALED (werdykt T5a, `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`
 * "Nowa twarda zasada LOD"): geometria torów/szyn/odległości SKALUJE SIĘ ze
 * światem (jednostki tej sceny) — SYMBOLE/etykiety mają rozmiar EKRANOWY
 * stały (SCREEN-STABLE), egzekwowane przez SYMBOL_DEFS (gabaryty stałe,
 * niezależne od geometrii toru) i stałe rozmiary fontu tego modułu/renderu.
 * Kanwa L2 nie ma dziś kamery ciągłego zoomu (T5c HOLD) — pełna weryfikacja
 * klamrowania pod zoomem czeka na T5c; struktura (stałe gabaryty glifów,
 * oddzielone od geometrii świata) jest już gotowa pod tę kartę.
 *
 * ZAKAZ INFERENCJI CONNECTIVITY Z GEOMETRII (P0.18): `computeElectricalComponents`
 * liczy komponenty spójności WYŁĄCZNIE z grafu (`branches`, stan `status`),
 * zero odczytu współrzędnych/pozycji.
 */
import type { SymbolId } from '../symbols/defs';
import type {
  LvDomainBoundaryLink,
  LvDomainBranch,
  LvDomainBus,
  LvDomainGraphView,
  LvDomainSubSwitchboard,
  LvDomainTransformer,
  UpstreamEquivalentSnapshot,
} from './types';

// ---------------------------------------------------------------------------
// Geometria — jednostki siatki (px świata), niezależne od kamery (WŁASNA
// kanwa L2). F1/T5b-2 (dowód wizualny e2e/lv-domain-screenshot.spec.ts):
// kolumny szerokie i BOARD_HALF_WIDTH dobrane tak, żeby DWIE sekcje sprzęgła
// (kolumny sąsiednie) zostawiały CZYTELNĄ szczelinę sprzęgła (COUPLER_GAP)
// między kreskami magistral, a kotwica SN + tabliczka TR mieściły się nad
// szyną bez nakładania (zmierzone na fixturze wieloźródłowej 2×TR).
// ---------------------------------------------------------------------------
const COLUMN_WIDTH = 340;
const ROW_HEIGHT = 130;
const SOURCE_ROW_OFFSET = 60;
// F2 (dowód wizualny e2e/lv-domain-screenshot.spec.ts, zrzut
// `lv_domain_station_c_dark.png`, T5b-2): 34 j.św. NIE mieściło zacisku nN
// (kropka+etykieta) I aparatu QF-TR1 (glif+etykieta) bez nachodzenia na
// siebie ani na kreskę magistrali — cały łańcuch incomera (transformator→
// zacisk→aparat→szyna) był zbity w nieczytelny stos. Zmierzone na tej samej
// fixturze: 80 j.św. daje ~20 j.św. odstępu między KAŻDĄ parą sąsiednich
// elementów łańcucha (etykieta transformatora / zacisk / etykieta zacisku /
// aparat / etykieta aparatu / szyna) — czytelne przy foncie 9px.
const INCOMER_ROW_OFFSET = 80;
const MARGIN_X = 150;
const MARGIN_Y = 190;
const BOUNDARY_CHIP_OFFSET_X = 104;
const BOUNDARY_TERMINAL_OFFSET_X = 56;
const LOAD_ROW_OFFSET = 56;

/** Szczelina sprzęgła (P0.1/P0.2: "kreska magistrali" z JAWNYM aparatem w
 *  przerwie) — świat, nie ekran; symbol aparatu (16px) mieści się w środku. */
const COUPLER_GAP = 52;
/** Połowa długości kreski magistrali — STAŁA dla WSZYSTKICH sekcji (uniknięcie
 *  nakładania kresek sąsiednich kolumn niezależnie od tego, czy są połączone
 *  sprzęgłem, czy sąsiadują przypadkiem — prostsza reguła niż wykrywanie
 *  sąsiedztwa sprzęgła per para, spełnia bieżące potrzeby fixture'ów). */
const BOARD_HALF_WIDTH = (COLUMN_WIDTH - COUPLER_GAP) / 2;
/** Margines wewnętrzny kresk (odsunięcie pierwszego/ostatniego kikuta od
 *  krawędzi szyny — czytelność, P0.13 "minimalne engineering sizes"). */
const TAP_MARGIN = 22;
/** Rozstaw kikutów odpływów NA szynie (aparaty/kable w dół) — WORLD-SCALED,
 *  minimum inżynierskie (P0.13): poniżej tej wartości etykiety aparatów by
 *  się nakładały (zmierzone na fixturze Stacja B, 3 odpływy + 1 incomer). */
export const MIN_TAP_PITCH = 40;
const NOMINAL_TAP_PITCH = 48;
/** F2 (dowód wizualny, zrzut `lv_domain_multi_source_dark.png`, T5b-2):
 *  kikuty POWYŻEJ szyny (transformatory/generatory) niosą etykiety znacznie
 *  szersze niż odpływy — tabliczka TR ("0,63 MVA · 15/0,4 kV · Dyn11 ·
 *  uk=4%") ma ok. 210 j.św. szerokości; przy `NOMINAL_TAP_PITCH` (48)
 *  sąsiedni generator (np. PV na tej samej sekcji) nachodził na tabliczkę
 *  TR. Rozstaw kikutów źródeł dostaje WŁASNĄ, szerszą stałą — odpływy
 *  (etykiety krótkie: "QF-01" itp.) zostają przy wąskim rozstawie. */
const SOURCE_TAP_PITCH = 210;

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
  /** `ref_id` elementu domeny (transformator/generator/bus/gałąź/odbiór) albo
   *  identyfikator syntetyczny dla chipów/terminali (`anchor:{transformer_ref}`,
   *  `boundary:{branch_ref}`, `boundary-terminal:{branch_ref}`) — WYROCZNIA
   *  zgodności (`sceneConformance.test.ts`) odróżnia je po prefiksie. */
  readonly ref: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly symbolId?: SymbolId;
  /** Dane WYSTAWIONE na węźle dla inspekcji (werdykt: "pełny snapshot w
   *  danych/inspekcji") — konsumowane jako `data-*`/tytuł SVG, NIGDY
   *  renderowane jako 10 liczb naraz na kanwie. */
  readonly meta?: Readonly<Record<string, unknown>>;
  /** WYŁĄCZNIE `kind==='bus'` (sekcja szyn REALNA — P0.1 "kreska magistrali,
   *  nie ikonka") — połowa długości kreski w jednostkach świata; renderer
   *  rysuje `<line>` od `x - busBarHalfWidth` do `x + busBarHalfWidth`.
   *  `busJunction` i pozostałe `kind` NIE noszą tego pola (zostają punktem —
   *  legalna konwencja SLD dla muf/punktów pośrednich/zacisków, patrz nagłówek). */
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
  /** Dane pomocnicze renderu/inspekcji (np. katalog kabla, luka modelu) —
   *  ten sam wzorzec co `LvDomainSceneNode.meta`. */
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

// ---------------------------------------------------------------------------
// P0.18 — komponenty spójności ELEKTRYCZNEJ, WYŁĄCZNIE z grafu (branch.status),
// zero geometrii. Sprzęgło/łącznik OTWARTY = krawędź NIE przewodzi (rozcina
// komponent); ZAMKNIĘTY = przewodzi. Używane przez hard-check #1/#2 (QBC
// OPEN → dwa obszary zasilania; CLOSED → jeden) i przez `meta.electricalComponentId`
// każdej szyny (dowód w DOM/testach, nie w pikselach).
// ---------------------------------------------------------------------------
export function computeElectricalComponents(view: LvDomainGraphView): ReadonlyMap<string, string> {
  const adjacency = new Map<string, string[]>();
  for (const bus of view.buses) adjacency.set(bus.ref_id, adjacency.get(bus.ref_id) ?? []);
  for (const branch of view.branches) {
    if (branch.status !== 'closed') continue;
    if (!adjacency.has(branch.from_bus_ref) || !adjacency.has(branch.to_bus_ref)) continue;
    adjacency.get(branch.from_bus_ref)!.push(branch.to_bus_ref);
    adjacency.get(branch.to_bus_ref)!.push(branch.from_bus_ref);
  }
  const componentOf = new Map<string, string>();
  for (const bus of [...view.buses].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (componentOf.has(bus.ref_id)) continue;
    const componentId = `component:${bus.ref_id}`;
    const queue: string[] = [bus.ref_id];
    componentOf.set(bus.ref_id, componentId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (componentOf.has(neighbor)) continue;
        componentOf.set(neighbor, componentId);
        queue.push(neighbor);
      }
    }
  }
  return componentOf;
}

// ---------------------------------------------------------------------------
// Krok 1 — kolumny per szyna, drzewo rodzic→dziecko wyprowadzone Z GAŁĘZI
// (nie z szablonu): rodzic szyny B (depth d>0) = szyna A (depth d-1)
// połączona z B gałęzią o NAJMNIEJSZYM `ref_id` spośród kandydatów — reguła
// deterministyczna, czysto porządkowa (geometria, nie fizyka/topologia).
// ---------------------------------------------------------------------------

interface BusLayout {
  readonly busRef: string;
  readonly depth: number;
  readonly column: number;
}

function assignBusColumns(buses: readonly LvDomainBus[], branches: readonly LvDomainBranch[]): Map<string, BusLayout> {
  const byRef = new Map(buses.map((b) => [b.ref_id, b] as const));
  const byDepth = new Map<number, LvDomainBus[]>();
  for (const bus of buses) {
    const list = byDepth.get(bus.hops_from_root) ?? [];
    list.push(bus);
    byDepth.set(bus.hops_from_root, list);
  }
  for (const list of byDepth.values()) list.sort((a, b) => a.ref_id.localeCompare(b.ref_id));

  // Kandydaci rodzica: gałęzie łączące dwie szyny domeny o różnicy głębokości
  // dokładnie 1, posortowane po ref_id gałęzi (determinizm przy wielu
  // kandydatach — np. dwie gałęzie równoległe do tej samej szyny nadrzędnej).
  const parentBranchOf = new Map<string, LvDomainBranch>();
  const sortedBranches = [...branches].sort((a, b) => a.ref_id.localeCompare(b.ref_id));
  for (const branch of sortedBranches) {
    const fromBus = byRef.get(branch.from_bus_ref);
    const toBus = byRef.get(branch.to_bus_ref);
    if (!fromBus || !toBus) continue;
    if (toBus.hops_from_root === fromBus.hops_from_root + 1 && !parentBranchOf.has(toBus.ref_id)) {
      parentBranchOf.set(toBus.ref_id, branch);
    } else if (fromBus.hops_from_root === toBus.hops_from_root + 1 && !parentBranchOf.has(fromBus.ref_id)) {
      parentBranchOf.set(fromBus.ref_id, branch);
    }
  }

  const layout = new Map<string, BusLayout>();
  const maxDepth = Math.max(0, ...buses.map((b) => b.hops_from_root));
  let nextRootColumn = 0;

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const busesAtDepth = byDepth.get(depth) ?? [];
    if (depth === 0) {
      for (const bus of busesAtDepth) {
        layout.set(bus.ref_id, { busRef: bus.ref_id, depth, column: nextRootColumn });
        nextRootColumn += 1;
      }
      continue;
    }
    // Grupuj po rodzicu (kolumna rodzica) — dzieci tego samego rodzica
    // dostają kolejne kolumny WOKÓŁ kolumny rodzica (rozstrzygane po
    // ref_id własnej szyny dla determinizmu); szyny bez rozwiązanego
    // rodzica (dane niekompletne) trafiają na koniec, kolejne wolne kolumny.
    const byParentColumn = new Map<number, LvDomainBus[]>();
    const orphans: LvDomainBus[] = [];
    for (const bus of busesAtDepth) {
      const parentBranch = parentBranchOf.get(bus.ref_id);
      const parentRef = parentBranch
        ? parentBranch.from_bus_ref === bus.ref_id
          ? parentBranch.to_bus_ref
          : parentBranch.from_bus_ref
        : undefined;
      const parentLayout = parentRef ? layout.get(parentRef) : undefined;
      if (!parentLayout) {
        orphans.push(bus);
        continue;
      }
      const group = byParentColumn.get(parentLayout.column) ?? [];
      group.push(bus);
      byParentColumn.set(parentLayout.column, group);
    }
    let cursor = 0;
    for (const parentColumn of [...byParentColumn.keys()].sort((a, b) => a - b)) {
      const children = byParentColumn.get(parentColumn)!.sort((a, b) => a.ref_id.localeCompare(b.ref_id));
      const startColumn = Math.max(cursor, parentColumn - (children.length - 1) / 2);
      children.forEach((bus, idx) => {
        layout.set(bus.ref_id, { busRef: bus.ref_id, depth, column: startColumn + idx });
      });
      cursor = startColumn + children.length;
    }
    for (const bus of orphans.sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
      layout.set(bus.ref_id, { busRef: bus.ref_id, depth, column: cursor });
      cursor += 1;
    }
  }
  return layout;
}

function apparatusSymbolFor(branchType: LvDomainBranch['type']): SymbolId | undefined {
  switch (branchType) {
    case 'breaker':
      return 'nnBreaker';
    case 'switch':
    case 'disconnector':
      return 'nnBreaker';
    case 'fuse':
      return 'nnFuseSwitch';
    case 'bus_coupler':
      return 'nnBreaker';
    case 'cable':
    case 'line_overhead':
      return undefined; // przewód — kreska, bez glifu aparatu
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

/** Etykieta tabliczki TR (werdykt: "Sn·przekładnia·grupa·uk%"). */
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

/** Etykieta chipa kotwicy SN (werdykt: chip kompakt na ekranie, pełny
 *  snapshot w meta). */
export function anchorChipLabel(snapshot: UpstreamEquivalentSnapshot): string {
  if (snapshot.status !== 'OK') {
    return 'SN · brak danych';
  }
  const uVoltage = snapshot.voltage_kv != null ? `${snapshot.voltage_kv} kV` : '—';
  const sk = snapshot.sk_mva != null ? `Sk″=${snapshot.sk_mva.toFixed(1)} MVA` : 'Sk″=—';
  const ik = snapshot.ikss_ka != null ? `Ik″=${snapshot.ikss_ka.toFixed(2)} kA` : 'Ik″=—';
  return `SN ${uVoltage} · ${sk} · ${ik}`;
}

/**
 * Nagłówek OPISUJĄCY DOMENĘ (P0.14: "`0,4 kV · 2×TR · 2 sekcje · PV ·
 * 1 boundary`; parametry Sn/uk/grupa przy T1/T2, nie w nagłówku"). Sekcje =
 * WYŁĄCZNIE szyny "board" (główna sekcja lub podrozdzielnica) — punkty
 * pośrednie/zaciski nie liczą się jako "sekcja" dla projektanta.
 */
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

function spreadOffsets(count: number, halfWidth: number, pitch: number = NOMINAL_TAP_PITCH): readonly number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const usableHalf = Math.max(0, halfWidth - TAP_MARGIN);
  const desiredSpan = (count - 1) * pitch;
  const span = Math.min(desiredSpan, usableHalf * 2);
  const start = -span / 2;
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => start + i * step);
}

function otherBusRef(branch: LvDomainBranch, busRef: string): string | null {
  if (branch.from_bus_ref === busRef) return branch.to_bus_ref;
  if (branch.to_bus_ref === busRef) return branch.from_bus_ref;
  return null;
}

/**
 * T1-analog dla L2 (P0.3/P0.4: "LV incomer każdego TR pokazany"; "Jawny tor:
 * TR → incomer → BUS (zakaz skracania TR→ikonka rozdzielnicy)") — mirror
 * INTENCJI `electrical/viewModel.ts::findLvIncomerEdge` (T0, operuje na
 * `TerminalGraph`) na kształt danych `LvDomainGraphView` (L2, bus/branch z
 * REST). Kryterium topologiczne (P0.18: zero geometrii): `trafo.lv_bus_ref`
 * ma DOKŁADNIE JEDNĄ gałąź dotykającą i NIE jest ona sprzęgłem ⇒ ten bus jest
 * DEDYKOWANYM zaciskiem nN transformatora (LV terminal), a druga strona tej
 * gałęzi jest prawdziwą SEKCJĄ ("board") — incomer JAWNY. W przeciwnym razie
 * (0 gałęzi / >1 gałąź / jedyna gałąź to sprzęgło) transformator zasila szynę
 * WPROST — sekcja = `trafo.lv_bus_ref` (zero fabrykacji incomera, którego
 * model nie niesie).
 */
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

interface AboveItem {
  readonly kind: 'transformer' | 'generator';
  readonly ref: string;
}

interface BelowItem {
  readonly kind: 'branch' | 'boundary';
  readonly ref: string;
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

  const electricalComponents = computeElectricalComponents(view);

  // --- P0.3/P0.4: incomer per transformator; zaciski nN dedykowane
  // WYŁĄCZONE z siatki kolumn (nie są sekcją — dostają pozycję WPROST nad
  // kikutem incomera swojej sekcji, nie własną kolumnę).
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

  const gridBuses = view.buses.filter((b) => !terminalBusRefs.has(b.ref_id));
  const busLayout = assignBusColumns(gridBuses, view.branches);
  const busByRef = new Map(view.buses.map((b) => [b.ref_id, b] as const));
  const subSwitchboardBusRefs = new Set<string>(
    view.sub_switchboards.flatMap((s: LvDomainSubSwitchboard) => s.bus_refs),
  );

  function boardCenterOf(busRef: string): { readonly x: number; readonly y: number } | undefined {
    const layout = busLayout.get(busRef);
    if (!layout) return undefined;
    return { x: MARGIN_X + layout.column * COLUMN_WIDTH, y: MARGIN_Y + layout.depth * ROW_HEIGHT };
  }

  function isBoardBus(busRef: string): boolean {
    const bus = busByRef.get(busRef);
    return !!bus && (bus.hops_from_root === 0 || subSwitchboardBusRefs.has(busRef));
  }

  // --- Zbierz kikuty POWYŻEJ (transformatory + generatory bezpośrednio na
  // tej sekcji) i PONIŻEJ (odpływy + boundary_link) per sekcja — kolejność
  // deterministyczna (sortowanie po ref), rozstaw dopiero na koniec.
  const aboveItemsByBoard = new Map<string, AboveItem[]>();
  const pushAbove = (boardBusRef: string, item: AboveItem): void => {
    const list = aboveItemsByBoard.get(boardBusRef) ?? [];
    list.push(item);
    aboveItemsByBoard.set(boardBusRef, list);
  };
  for (const trafo of [...view.transformers].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const { boardBusRef } = incomerByTransformerRef.get(trafo.ref_id)!;
    pushAbove(boardBusRef, { kind: 'transformer', ref: trafo.ref_id });
  }
  for (const gen of [...view.generators].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (busLayout.has(gen.bus_ref)) pushAbove(gen.bus_ref, { kind: 'generator', ref: gen.ref_id });
  }

  const belowItemsByBoard = new Map<string, BelowItem[]>();
  const pushBelow = (boardBusRef: string, item: BelowItem): void => {
    const list = belowItemsByBoard.get(boardBusRef) ?? [];
    list.push(item);
    belowItemsByBoard.set(boardBusRef, list);
  };
  for (const branch of view.branches) {
    if (consumedBranchRefs.has(branch.ref_id)) continue; // incomer — renderowany osobno
    if (branch.type === 'bus_coupler') continue; // sprzęgło — renderowane osobno (kreska między kreskami)
    const fromLayout = busLayout.get(branch.from_bus_ref);
    const toLayout = busLayout.get(branch.to_bus_ref);
    if (!fromLayout && !toLayout) continue;
    // Strona "rodzica" (płytsza głębokość) niesie kikut na SWOJEJ szynie —
    // strona dziecka jest pozycjonowana normalnie przez siatkę (bez offsetu).
    const parentSide =
      !fromLayout ? branch.to_bus_ref
      : !toLayout ? branch.from_bus_ref
      : fromLayout.depth <= toLayout.depth ? branch.from_bus_ref
      : branch.to_bus_ref;
    pushBelow(parentSide, { kind: 'branch', ref: branch.ref_id });
  }
  for (const link of view.boundary_links) {
    if (busLayout.has(link.from_bus_ref)) pushBelow(link.from_bus_ref, { kind: 'boundary', ref: link.branch_ref });
  }
  for (const list of aboveItemsByBoard.values()) {
    list.sort((a, b) => (a.kind === b.kind ? a.ref.localeCompare(b.ref) : a.kind === 'transformer' ? -1 : 1));
  }
  for (const list of belowItemsByBoard.values()) list.sort((a, b) => a.ref.localeCompare(b.ref));

  // --- Szyny (sekcje realne = kreska magistrali; punkty pośrednie/zaciski =
  // węzeł-kropka, P0.1 + legalna konwencja SLD dla muf/zacisków).
  const tapOffsetByBoardAndRef = new Map<string, number>(); // key `${boardBusRef}#${'above'|'below'}#${ref}`
  for (const bus of [...gridBuses].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const center = boardCenterOf(bus.ref_id);
    if (!center) continue;
    const board = isBoardBus(bus.ref_id);
    if (board) {
      const aboveItems = aboveItemsByBoard.get(bus.ref_id) ?? [];
      const belowItems = belowItemsByBoard.get(bus.ref_id) ?? [];
      const aboveOffsets = spreadOffsets(aboveItems.length, BOARD_HALF_WIDTH, SOURCE_TAP_PITCH);
      const belowOffsets = spreadOffsets(belowItems.length, BOARD_HALF_WIDTH);
      aboveItems.forEach((item, i) => tapOffsetByBoardAndRef.set(`${bus.ref_id}#above#${item.ref}`, aboveOffsets[i]));
      belowItems.forEach((item, i) => tapOffsetByBoardAndRef.set(`${bus.ref_id}#below#${item.ref}`, belowOffsets[i]));
      nodes.push({
        kind: 'bus',
        ref: bus.ref_id,
        x: center.x,
        y: center.y,
        label: bus.name,
        busBarHalfWidth: BOARD_HALF_WIDTH,
        meta: { voltageKv: bus.voltage_kv, voltageLevelId: bus.voltage_level_id, hopsFromRoot: bus.hops_from_root, electricalComponentId: electricalComponents.get(bus.ref_id) },
      });
    } else {
      nodes.push({
        kind: 'busJunction',
        ref: bus.ref_id,
        x: center.x,
        y: center.y,
        label: bus.name,
        symbolId: 'junction',
        meta: { voltageKv: bus.voltage_kv, voltageLevelId: bus.voltage_level_id, hopsFromRoot: bus.hops_from_root, electricalComponentId: electricalComponents.get(bus.ref_id) },
      });
    }
  }

  function tapPointOn(boardBusRef: string, side: 'above' | 'below', itemRef: string): { readonly x: number; readonly y: number } {
    const center = boardCenterOf(boardBusRef)!;
    const offset = tapOffsetByBoardAndRef.get(`${boardBusRef}#${side}#${itemRef}`) ?? 0;
    return { x: center.x + offset, y: center.y };
  }

  // --- Źródła: transformatory — TOR JAWNY TR → (incomer) → BUS (P0.4).
  const snapshotByTransformerRef = new Map(upstreamEquivalents.map((s) => [s.transformer_ref, s] as const));
  for (const trafo of [...view.transformers].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const { boardBusRef, incomerBranch } = incomerByTransformerRef.get(trafo.ref_id)!;
    const tap = tapPointOn(boardBusRef, 'above', trafo.ref_id);

    let terminalPos = tap;
    if (incomerBranch) {
      // Zacisk nN dedykowany — mały węzeł WPROST nad kikutem incomera.
      terminalPos = { x: tap.x, y: tap.y - INCOMER_ROW_OFFSET };
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
          electricalComponentId: electricalComponents.get(trafo.lv_bus_ref),
        },
      });
      const incomerSymbolId = apparatusSymbolFor(incomerBranch.type);
      const midX = (terminalPos.x + tap.x) / 2;
      const midY = (terminalPos.y + tap.y) / 2;
      if (incomerSymbolId) {
        nodes.push({
          kind: 'apparatus',
          ref: incomerBranch.ref_id,
          x: midX,
          y: midY,
          label: incomerBranch.name,
          symbolId: incomerSymbolId,
          meta: { status: incomerBranch.status, catalogRef: incomerBranch.catalog_ref, type: incomerBranch.type, role: 'incomer' },
        });
      }
      edges.push({
        ref: incomerBranch.ref_id,
        kind: 'branch',
        x1: terminalPos.x,
        y1: terminalPos.y,
        x2: tap.x,
        y2: tap.y,
        status: incomerBranch.status,
        meta: { role: 'incomer' },
      });
    }

    const trafoPos = { x: terminalPos.x, y: terminalPos.y - SOURCE_ROW_OFFSET };
    nodes.push({
      kind: 'transformer',
      ref: trafo.ref_id,
      x: trafoPos.x,
      y: trafoPos.y,
      label: transformerNameplateLabel(trafo),
      symbolId: 'transformer2W',
      meta: { hvBusRef: trafo.hv_bus_ref, lvBusRef: trafo.lv_bus_ref, boardBusRef, hasExplicitIncomer: !!incomerBranch },
    });
    edges.push({
      ref: `${trafo.ref_id}#source-drop`,
      kind: 'sourceDrop',
      x1: trafoPos.x,
      y1: trafoPos.y,
      x2: terminalPos.x,
      y2: terminalPos.y,
    });

    const snapshot = snapshotByTransformerRef.get(trafo.ref_id);
    const anchorPos = { x: trafoPos.x, y: trafoPos.y - SOURCE_ROW_OFFSET };
    nodes.push({
      kind: 'anchorChip',
      ref: `anchor:${trafo.ref_id}`,
      x: anchorPos.x,
      y: anchorPos.y,
      label: snapshot ? anchorChipLabel(snapshot) : 'SN · brak danych',
      meta: snapshot as unknown as Record<string, unknown> | undefined,
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

  // --- Generatory (PV/BESS/G1) — kikut NA szynie, do której są podłączone
  // (dowolna głębokość — wieloźródłowość jawna). P0.7: gdy `bus_ref` generatora
  // jest zaciskiem OSIĄGNIĘTYM przez własną gałąź aparatu/kabla (model niesie
  // pełny tor pola źródłowego), tor renderuje się AUTOMATYCZNIE przez zwykłą
  // pętlę odpływów/szyn niżej (ta sama, generyczna maszyneria) — generator
  // siada NAD swoim zaciskiem, który sam jest końcem odpływu chronionego
  // aparatem. Gdy `bus_ref` generatora jest WPROST sekcją (model NIE niesie
  // pola źródłowego jako elementu grafu — luka, patrz raport karty), kikut
  // dostaje jawną adnotację braku aparatu (`meta.apparatusGapPl`) — ZERO
  // fabrykacji glifu wyłącznika, którego dane nie potwierdzają.
  for (const gen of [...view.generators].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (!busLayout.has(gen.bus_ref)) continue;
    const tap = tapPointOn(gen.bus_ref, 'above', gen.ref_id);
    const genPos = { x: tap.x, y: tap.y - SOURCE_ROW_OFFSET };
    const directOnBoard = isBoardBus(gen.bus_ref);
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
      x2: tap.x,
      y2: tap.y,
      meta: directOnBoard
        ? {
            apparatusGapPl:
              'Brak jawnego aparatu pola źródłowego w grafie domeny (LvDomainGraphView.generators nie niesie ' +
              'tor pola: aparat/kabel/PCC — dane pola źródłowego istnieją WYŁĄCZNIE jako meta stacji ' +
              '`nn_field_specs`, nieeksponowana przez /enm/lv-domain). Punkt renderowany jako bezpośrednie ' +
              'podłączenie do sekcji — luka modelu, patrz raport karty T5b-2 P0.7.',
          }
        : undefined,
    });
  }

  // --- Gałęzie odpływów (nie-coupler, nie-incomer): BUS → zabezpieczenie →
  // kabel → cel (P0.5). Kabel (cable/line_overhead) dostaje kind='cable'
  // (bez glifu aparatu, dystynkcja wizualna od aparatu — P0.6).
  for (const branch of [...view.branches].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (consumedBranchRefs.has(branch.ref_id)) continue;
    if (branch.type === 'bus_coupler') continue;
    const fromLayout = busLayout.get(branch.from_bus_ref);
    const toLayout = busLayout.get(branch.to_bus_ref);
    if (!fromLayout && !toLayout) continue;

    const parentBusRef =
      !fromLayout ? branch.to_bus_ref
      : !toLayout ? branch.from_bus_ref
      : fromLayout.depth <= toLayout.depth ? branch.from_bus_ref
      : branch.to_bus_ref;
    const childBusRef = parentBusRef === branch.from_bus_ref ? branch.to_bus_ref : branch.from_bus_ref;

    const fromPos = tapPointOn(parentBusRef, 'below', branch.ref_id);
    const toPos = boardCenterOf(childBusRef) ?? fromPos;

    const symbolId = apparatusSymbolFor(branch.type);
    if (symbolId) {
      const midX = (fromPos.x + toPos.x) / 2;
      const midY = (fromPos.y + toPos.y) / 2;
      nodes.push({
        kind: 'apparatus',
        ref: branch.ref_id,
        x: midX,
        y: midY,
        label: branch.name,
        symbolId,
        meta: { status: branch.status, catalogRef: branch.catalog_ref, type: branch.type },
      });
    }
    const edgeKind: LvDomainSceneEdgeKind = branch.type === 'cable' || branch.type === 'line_overhead' ? 'cable' : 'branch';
    edges.push({
      ref: branch.ref_id,
      kind: edgeKind,
      x1: fromPos.x,
      y1: fromPos.y,
      x2: toPos.x,
      y2: toPos.y,
      status: branch.status,
      meta: edgeKind === 'cable' ? { catalogRef: branch.catalog_ref, catalogNamespace: branch.catalog_namespace } : undefined,
    });
  }

  // --- Sprzęgło (bus_coupler) MIĘDZY sekcjami tej samej głębokości: JAWNY
  // aparat W SZCZELINIE między kreskami magistral (P0.1/P0.2 — "kreska
  // między sekcjami bez aparatu ZAKAZANA"). Krawędź łączy KRAWĘDZIE
  // (facing edges) obu kresek, nie ich środki — szczelina = COUPLER_GAP.
  for (const branch of [...view.branches].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (branch.type !== 'bus_coupler') continue;
    const fromBus = busByRef.get(branch.from_bus_ref);
    const toBus = busByRef.get(branch.to_bus_ref);
    const fromCenter = boardCenterOf(branch.from_bus_ref);
    const toCenter = boardCenterOf(branch.to_bus_ref);
    if (!fromBus || !toBus || !fromCenter || !toCenter) continue;
    const sameDepthBoards = fromBus.hops_from_root === toBus.hops_from_root && isBoardBus(branch.from_bus_ref) && isBoardBus(branch.to_bus_ref);

    let x1: number;
    let x2: number;
    if (sameDepthBoards) {
      const leftIsFrom = fromCenter.x <= toCenter.x;
      x1 = leftIsFrom ? fromCenter.x + BOARD_HALF_WIDTH : fromCenter.x - BOARD_HALF_WIDTH;
      x2 = leftIsFrom ? toCenter.x - BOARD_HALF_WIDTH : toCenter.x + BOARD_HALF_WIDTH;
    } else {
      x1 = fromCenter.x;
      x2 = toCenter.x;
    }
    const y = fromCenter.y;
    const midX = (x1 + x2) / 2;
    const symbolId = apparatusSymbolFor('bus_coupler')!;
    nodes.push({
      kind: 'apparatus',
      ref: branch.ref_id,
      x: midX,
      y,
      label: branch.name,
      symbolId,
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
    });
  }

  // --- Odbiory (liście) — mała etykieta pod szyną, do której są podłączone.
  for (const load of [...view.loads].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const busPos = boardCenterOf(load.bus_ref);
    if (!busPos) continue;
    nodes.push({
      kind: 'load',
      ref: load.ref_id,
      x: busPos.x,
      y: busPos.y + LOAD_ROW_OFFSET,
      label: `${load.name} · ${load.p_mw} MW`,
      symbolId: 'loadArrow',
      meta: { busRef: load.bus_ref, pMw: load.p_mw, qMvar: load.q_mvar },
    });
  }

  // --- Boundary: odpływ → kabel (impedancja NALEŻY do modelu, P0.8) →
  // ● terminal granicy → chip obcej domeny. Gdy backend/fixture eksponuje
  // gałąź boundary_link W `view.branches` (aparat rozpoznawalny z `type`),
  // aparat renderuje się jawnie; real `build_lv_domain_view` DZIŚ nie
  // eksponuje jej tam (patrz raport, luka `LvDomainBoundaryLink` bez `type`)
  // — wtedy tor honestly pomija glif aparatu (zero fabrykacji), ale ZAWSZE
  // pokazuje kabel + terminal + chip (nigdy skrótu bus→chip).
  const boundaryBranchByRef = new Map(view.branches.map((b) => [b.ref_id, b] as const));
  for (const link of [...view.boundary_links].sort((a: LvDomainBoundaryLink, b) => a.branch_ref.localeCompare(b.branch_ref))) {
    if (!busLayout.has(link.from_bus_ref)) continue;
    const tap = tapPointOn(link.from_bus_ref, 'below', link.branch_ref);
    const terminalPos = { x: tap.x + BOUNDARY_TERMINAL_OFFSET_X, y: tap.y };
    const knownBranch = boundaryBranchByRef.get(link.branch_ref);
    const symbolId = knownBranch ? apparatusSymbolFor(knownBranch.type) : undefined;

    let cableFromPos = tap;
    if (symbolId && knownBranch) {
      const midX = (tap.x + terminalPos.x) / 2;
      nodes.push({
        kind: 'apparatus',
        ref: link.branch_ref,
        x: midX,
        y: tap.y,
        label: knownBranch.name,
        symbolId,
        meta: { status: knownBranch.status, catalogRef: knownBranch.catalog_ref, type: knownBranch.type, role: 'boundary' },
      });
      cableFromPos = { x: midX, y: tap.y };
    }
    edges.push({
      ref: link.branch_ref,
      kind: 'cable',
      x1: cableFromPos.x,
      y1: cableFromPos.y,
      x2: terminalPos.x,
      y2: terminalPos.y,
      status: knownBranch?.status,
      meta: {
        role: 'boundary',
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
      meta: { targetStationRef: link.target_station_ref, branchRef: link.branch_ref },
    });
    edges.push({
      ref: `boundary:${link.branch_ref}#link`,
      kind: 'boundaryLink',
      x1: terminalPos.x,
      y1: terminalPos.y,
      x2: chipPos.x,
      y2: chipPos.y,
    });
  }

  // F2 (dowód wizualny, T5b-2, zrzut `lv_domain_station_c_dark.png`): kotwica
  // SN łańcucha incomera potrafi wypaść PONIŻEJ y=0 (TR→terminal→aparat→BUS
  // dodaje głębokość NAD wiersz 0, poza samą regulacją stałych marginesów) —
  // `viewBox="0 0 W H"` przycina WSZYSTKO co ujemne niezależnie od tego, jak
  // duże jest W/H (powiększanie samego gabarytu, jak w poprzedniej wersji
  // tego bloku, NIE cofa przycięcia). Poprawka: policz otoczkę PRZED zwrotem
  // i przesuń CAŁĄ scenę (węzły + krawędzie) tak, żeby min(x)/min(y) >=
  // margines bazowy — odporne na dowolną głębokość łańcucha źródła, nie
  // tylko na dzisiejsze stałe.
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

  const maxX = shiftedNodes.length > 0 ? Math.max(...shiftedNodes.map((n) => n.x)) : MARGIN_X;
  const maxY = shiftedNodes.length > 0 ? Math.max(...shiftedNodes.map((n) => n.y)) : MARGIN_Y;

  return {
    nodes: shiftedNodes,
    edges: shiftedEdges,
    // P0.12 (Auto-layout: "sensowna część viewportu po Fit, nie 15-20%
    // kanwy"): gabaryt sceny = DOKŁADNIE otoczka treści + margines stały —
    // NIGDY narzucony fixed rozmiar niezależny od zawartości (to właśnie
    // powodowało pustą kanwę przy Fit).
    width: maxX + MARGIN_X,
    height: maxY + MARGIN_Y,
    stationRef: view.station_ref,
    stationName: view.station_name ?? '',
  };
}
