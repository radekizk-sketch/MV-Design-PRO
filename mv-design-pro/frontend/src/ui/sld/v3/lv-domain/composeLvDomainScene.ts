/**
 * Kompozycja SCENY projekcji nN z `LvDomainGraphView` (kontrakt 3.0.0) —
 * DEDYKOWANY silnik układu rozdzielnicy nN (mandat „profesjonalizacja SLD
 * nN" §8/§9/§10/§11/§12/§13/§22/§23/§24/§31/§42).
 *
 * ELEKTRYKA PRZED GRAFIKĄ (§1): ten moduł NIE liczy energizacji, wysp, ról
 * urządzeń, torów zasilania ani ostrzeżeń. Czyta je z projekcji
 * (`graph.buses[].energization_state`, `graph.segments[]`, `graph.devices[]
 * .device_role`, `graph.sections[]`, `graph.supply_paths[]`, `graph.islands[]`)
 * i przepisuje do meta węzłów/krawędzi. Jedyna „topologia", jaką zna, to
 * KOLEJNOŚĆ RYSOWANIA (który slot, która ranga) — wyprowadzona z ról
 * backendu, nie z własnego BFS (guard R4).
 *
 * SILNIK UKŁADU:
 * - RANGI PIONOWE (góra → dół): kotwica systemu SN → transformator → zacisk
 *   nN → wyłącznik główny → SZYNA sekcji → aparat odpływu → zacisk/kabel →
 *   podrozdzielnica / odbiór / źródło rozproszone / terminal granicy.
 * - DYSCYPLINA SLOTÓW X (§8): każdy element ma WŁASNY slot na szynie —
 *   incomer, odpływy, źródła bez pola, przekładniki napięciowe — nigdy dwa
 *   elementy w jednej osi. Incomer stoi na KRAŃCU sekcji (lewym; ostatnia z
 *   ≥2 sekcji korzeniowych — lustrzanie, prawym), jak w rozdzielnicach
 *   dwuwlotowych ze sprzęgłem w środku (ABB/PowerFactory).
 * - SEKCJA = KONTENER (§22): długość kreski wynika z liczby slotów × raster;
 *   podrozdzielnica wisi pod swoim odpływem i zaczyna kreskę od punktu wejścia.
 * - ODPŁYWY ORTOGONALNIE (§23): kikut pionowo w dół, dziecko pod kikutem.
 *   Każdy APARAT ma DWA kikuty (`{ref}#a` rodzic→aparat, `{ref}#b`
 *   aparat→dziecko), każdy w stanie SWOJEGO zacisku (§5/§7) — aparat otwarty
 *   z obu stron pod napięciem z różnych wysp rysuje się poprawnie z danych.
 * - ZACISKI (§24): kropka tylko w punkcie o stopniu ≠ 2 (rozgałęzienie,
 *   koniec toru) — zacisk przelotowy jest linią, nie plamką.
 * - KOTWICA SYSTEMU SN (§10/§11): transformatory o tym samym
 *   `equivalent_id` (albo `upstream_system_id`, gdy równoważnik nieobliczalny)
 *   wiszą na JEDNEJ kresce systemu SN — wspólne zasilanie nie wygląda jak dwa
 *   niezależne systemy; różne systemy dostają osobne kreski.
 * - PEŁNY TOR DER I ODBIORÓW (§12/§13): pola z modelu (aparat → kabel →
 *   punkt przyłączenia → symbol) rysowane w dół jak odpływy; element wprost
 *   na szynie (bez pola) dostaje własny slot i znacznik audytu z backendu.
 *
 * JEDNA GEOMETRIA NA WSZYSTKIE POZIOMY LOD: ten moduł NIE ZNA pojęcia LOD.
 * Determinizm: te same dane → identyczna scena (sortowanie po `ref_id`).
 */
import type { CadOrientation, CadSymbolId } from '../cad/cadSymbolRegistry';
import { SYMBOL_ODBIORU, SYMBOL_TRANSFORMATORA, SYMBOL_ZABEZPIECZENIA, SYMBOL_ZACISKU, symbolPomiaru, symbolPunktuToru, symbolZrodlaDer, wpisAparatu } from './symbolRegistry';
import type {
  LvDeviceState,
  LvDomainBus,
  LvDomainDevice,
  LvDomainGraphView,
  LvDomainSegment,
  LvEnergizationState,
  LvTerminalState,
  UpstreamEquivalentSnapshot,
} from './types';
import { RASTER, TOKENY_GEOMETRII as T, doRastra, plFixed, plNumber } from './visualGrammar';

// ---------------------------------------------------------------------------
// Typy sceny.
// ---------------------------------------------------------------------------

export type LvDomainSceneNodeKind =
  | 'anchorBar'
  | 'transformer'
  | 'terminal'
  | 'bus'
  | 'apparatus'
  | 'generator'
  | 'load'
  | 'measurement'
  | 'relay'
  | 'boundaryChip'
  | 'boundaryTerminal';

export interface LvDomainSceneNode {
  readonly kind: LvDomainSceneNodeKind;
  /** `ref_id` elementu domeny albo identyfikator syntetyczny
   *  (`anchor:{grupa}`, `boundary:{branch_ref}`, `boundary-terminal:{branch_ref}`,
   *  `relay:{ref}`). */
  readonly ref: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  /** Symbol CAD z rejestru (`cad/cadSymbolRegistry.ts`); brak = element bez symbolu. */
  readonly symbolId?: CadSymbolId;
  /** Orientacja symbolu: pozioma WYŁĄCZNIE dla aparatu sprzęgła w osi szyny. */
  readonly orientation?: CadOrientation;
  readonly meta?: Readonly<Record<string, unknown>>;
  /** WYŁĄCZNIE `kind==='bus'`/`'anchorBar'`: lewy i prawy koniec kreski. */
  readonly barLeft?: number;
  readonly barRight?: number;
}

export type LvDomainSceneEdgeKind =
  | 'anchorDrop'
  | 'sourceDrop'
  | 'incomer'
  | 'coupler'
  | 'branch'
  | 'cable'
  | 'leafDrop'
  | 'boundaryLink'
  | 'relayLink';

export interface LvDomainSceneEdge {
  readonly ref: string;
  readonly kind: LvDomainSceneEdgeKind;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface LvDomainScene {
  readonly nodes: readonly LvDomainSceneNode[];
  readonly edges: readonly LvDomainSceneEdge[];
  readonly width: number;
  readonly height: number;
  readonly stationRef: string;
  readonly stationName: string;
  /** Tor zasilania per szyna (z backendu): `busRef → {sourceRef → branchRefs}`. */
  readonly supplyPaths: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  /** Refy elementów z komunikatami walidacji (z backendu) → kody. */
  readonly warningsByRef: ReadonlyMap<string, readonly string[]>;
}

// ---------------------------------------------------------------------------
// Etykiety (prezentacja danych modelu — zero fizyki).
// ---------------------------------------------------------------------------

export function transformerNameplateLabel(t: {
  readonly sn_mva: number;
  readonly uhv_kv: number;
  readonly ulv_kv: number;
  readonly vector_group?: string | null;
  readonly uk_percent: number;
}): string {
  return `${plNumber(Math.round(t.sn_mva * 1000))} kVA · ${plNumber(t.uhv_kv)}/${plNumber(t.ulv_kv)} kV · ${t.vector_group ?? '—'} · uk = ${plNumber(t.uk_percent)}%`;
}

/** Tożsamość systemu SN: poziom napięcia + źródła systemu (z modelu). */
export function anchorIdentityLabel(
  snapshot: UpstreamEquivalentSnapshot | undefined,
  systemId: string | null,
  voltageKv: number,
): string {
  const nazwy = snapshot?.upstream_source_names?.length
    ? snapshot.upstream_source_names
    : snapshot?.upstream_source_ids ?? [];
  const zrodla = nazwy.length ? ` · ${nazwy.join(', ')}` : '';
  const system = systemId && !nazwy.length ? ` · szyna SN ${systemId}` : '';
  return `SN ${plNumber(voltageKv)} kV${zrodla}${system}`;
}

/** Parametry strony SN (równoważnik Thevenina) — jawnie „strona SN", żeby
 *  Ik″ SN nie dało się pomylić z Ik″ na szynie nN (§3). */
export function anchorDetailLabel(rownowaznik: UpstreamEquivalentSnapshot | undefined): string | null {
  if (!rownowaznik) return null;
  if (rownowaznik.status !== 'OK') {
    const powod = rownowaznik.missing_data.length
      ? rownowaznik.missing_data.map((kod) => OPIS_BRAKU_ROWNOWAZNIKA_PL[kod] ?? kod).join('; ')
      : 'brak danych';
    return `Sk″/Ik″ SN: brak danych — ${powod}`;
  }
  const sk = rownowaznik.sk_mva != null ? `Sk″ SN = ${plFixed(rownowaznik.sk_mva, 1)} MVA` : 'Sk″ SN = —';
  const ik = rownowaznik.ikss_ka != null ? `Ik″ SN = ${plFixed(rownowaznik.ikss_ka, 2)} kA` : 'Ik″ SN = —';
  const scenariusz = rownowaznik.scenario_id ?? 'MAX';
  return `${sk} · ${ik} (${scenariusz})`;
}

export function domainDescriptorLabel(view: LvDomainGraphView): string {
  if (view.status !== 'OK') return 'brak danych';
  const main = view.sections.filter((s) => s.tier === 'main');
  const sub = view.sections.filter((s) => s.tier === 'sub');
  const voltage = view.buses.find((b) => b.is_board)?.voltage_kv ?? view.buses[0]?.voltage_kv;
  const parts: string[] = [];
  parts.push(voltage != null ? `${plNumber(voltage)} kV` : '—');
  if (view.transformers.length > 0) parts.push(`${view.transformers.length}×TR`);
  parts.push(`${main.length} ${main.length === 1 ? 'sekcja' : main.length >= 2 && main.length <= 4 ? 'sekcje' : 'sekcji'}`);
  if (sub.length > 0) parts.push(`${sub.length} ${sub.length === 1 ? 'podrozdzielnica' : sub.length >= 2 && sub.length <= 4 ? 'podrozdzielnice' : 'podrozdzielnic'}`);
  const genTypes = new Set(view.generators.map((g) => g.gen_type ?? 'źródło'));
  if (genTypes.has('pv_inverter')) parts.push('PV');
  if (genTypes.has('bess')) parts.push('magazyn');
  if ([...genTypes].some((t) => t !== 'pv_inverter' && t !== 'bess')) parts.push('generator');
  if (view.boundary_links.length > 0) {
    parts.push(`${view.boundary_links.length} ${view.boundary_links.length === 1 ? 'granica domeny' : 'granice domeny'}`);
  }
  const wyspy = view.islands.filter((i) => i.is_islanded);
  if (wyspy.length > 0) parts.push(`${wyspy.length} ${wyspy.length === 1 ? 'wyspa' : 'wyspy'}`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Odczyt stanów z projekcji (zero re-derywacji).
// ---------------------------------------------------------------------------

/** Stan zacisku KAŻDEJ szyny — wprost z `buses[]` (kontrakt 3.0.0). */
export function stanyZaciskow(view: LvDomainGraphView): ReadonlyMap<string, LvTerminalState> {
  const out = new Map<string, LvTerminalState>();
  for (const bus of view.buses) {
    out.set(bus.ref_id, {
      energization_state: bus.energization_state,
      is_energized: bus.is_energized,
      supply_refs: bus.supply_refs,
      island_ref: bus.island_ref,
      grid_energized: bus.grid_energized,
    });
  }
  return out;
}

function terminalMeta(state: LvTerminalState | undefined): Readonly<Record<string, unknown>> {
  return {
    energization: state?.energization_state,
    isEnergized: state?.is_energized,
    supplyRefs: state?.supply_refs,
    islandRef: state?.island_ref,
    gridEnergized: state?.grid_energized,
  };
}

function deviceStateOf(device: LvDomainDevice | undefined): LvDeviceState {
  return device?.device_state ?? 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Kompozycja.
// ---------------------------------------------------------------------------

/** Rezerwa na etykiety wystające poza geometrię (świat) — prawa kolumna
 *  tabliczek TR/odbiorów i pas nad kotwicą. Deterministyczna, niezależna od
 *  fitu (etykiety są screen-stable, więc rezerwa jest przybliżeniem na
 *  skalę fitu ≈ 0,6–1,0). */
const LABEL_RESERVE_RIGHT = 112;
const LABEL_RESERVE_TOP = 40;
const LABEL_RESERVE_BOTTOM = 48;

/** Kody `missing_data` równoważnika SN → opis po polsku (kod zostaje w
 *  danych; etykieta nie pokazuje angielskiego identyfikatora technicznego). */
const OPIS_BRAKU_ROWNOWAZNIKA_PL: Readonly<Record<string, string>> = {
  upstream_network_topology_invalid:
    'topologia sieci SN niepoprawna (źródło poza szyną modelu) — równoważnik nieobliczalny',
  upstream_network_singular: 'sieć SN osobliwa — brak drogi do źródła',
  upstream_hv_bus: 'szyna SN transformatora poza rozwiązywalną siecią',
  route: 'brak trasy do źródła w aktualnej topologii',
  transformer: 'brak transformatora',
  vector_group: 'brak grupy połączeń transformatora',
};

interface Slot {
  readonly ref: string;
  readonly kind: 'incomer' | 'feeder' | 'load' | 'boundary' | 'derDirect' | 'vt';
  readonly width: number;
}

interface SectionPlan {
  readonly busRef: string;
  readonly mirror: boolean;
  readonly slots: readonly Slot[];
  readonly width: number;
  /** Pozycja X slotu (środek) względem lewego końca kreski. */
  readonly slotX: ReadonlyMap<string, number>;
  left: number;
  busY: number;
}

export function composeLvDomainScene(
  view: LvDomainGraphView,
  upstreamEquivalents: readonly UpstreamEquivalentSnapshot[] = [],
): LvDomainScene {
  const nodes: LvDomainSceneNode[] = [];
  const edges: LvDomainSceneEdge[] = [];
  const supplyPaths = new Map<string, Map<string, readonly string[]>>();
  const warningsByRef = new Map<string, string[]>();

  if (view.status !== 'OK') {
    return { nodes, edges, width: 0, height: 0, stationRef: view.station_ref, stationName: view.station_name ?? '', supplyPaths, warningsByRef };
  }

  for (const path of view.supply_paths) {
    const perSource = supplyPaths.get(path.bus_ref) ?? new Map<string, readonly string[]>();
    perSource.set(path.source_ref, path.branch_refs);
    supplyPaths.set(path.bus_ref, perSource);
  }
  for (const island of view.islands) {
    for (const message of island.validation_messages) {
      for (const ref of message.element_refs) {
        warningsByRef.set(ref, [...(warningsByRef.get(ref) ?? []), message.code]);
      }
    }
  }

  const zaciski = stanyZaciskow(view);
  const busByRef = new Map(view.buses.map((b) => [b.ref_id, b] as const));
  const branchByRef = new Map(view.branches.map((b) => [b.ref_id, b] as const));
  const deviceByRef = new Map(view.devices.map((d) => [d.ref_id, d] as const));
  const segmentByRef = new Map(view.segments.map((s) => [s.segment_id, s] as const));
  const sectionByBus = new Map(view.sections.map((s) => [s.bus_ref, s] as const));
  const transformerByRef = new Map(view.transformers.map((t) => [t.ref_id, t] as const));
  const snapshotByTransformer = new Map(upstreamEquivalents.map((s) => [s.transformer_ref ?? '', s] as const));

  const sortRefs = (a: string, b: string): number => a.localeCompare(b, 'pl', { numeric: true });

  // --- Indeksy z ról backendu (zero własnego BFS). ------------------------
  const feedersByBoard = new Map<string, LvDomainDevice[]>();
  const incomersByBoard = new Map<string, LvDomainDevice[]>();
  const childrenByBus = new Map<string, LvDomainDevice[]>();
  const couplers: LvDomainDevice[] = [];
  const boundaryDevices = new Set<string>();
  for (const device of [...view.devices].sort((a, b) => sortRefs(a.ref_id, b.ref_id))) {
    if (device.device_role === 'feeder' && device.board_bus_ref) {
      feedersByBoard.set(device.board_bus_ref, [...(feedersByBoard.get(device.board_bus_ref) ?? []), device]);
    } else if (device.device_role === 'incomer' && device.board_bus_ref) {
      incomersByBoard.set(device.board_bus_ref, [...(incomersByBoard.get(device.board_bus_ref) ?? []), device]);
    } else if (device.device_role === 'coupler') {
      couplers.push(device);
    } else if (device.device_role === 'boundary') {
      boundaryDevices.add(device.ref_id);
    } else if (device.device_role === 'internal') {
      childrenByBus.set(device.parent_bus_ref, [...(childrenByBus.get(device.parent_bus_ref) ?? []), device]);
    }
  }
  const loadsByBus = new Map<string, typeof view.loads[number][]>();
  for (const load of [...view.loads].sort((a, b) => sortRefs(a.ref_id, b.ref_id))) {
    loadsByBus.set(load.bus_ref, [...(loadsByBus.get(load.bus_ref) ?? []), load]);
  }
  const gensByBus = new Map<string, typeof view.generators[number][]>();
  for (const gen of [...view.generators].sort((a, b) => sortRefs(a.ref_id, b.ref_id))) {
    gensByBus.set(gen.bus_ref, [...(gensByBus.get(gen.bus_ref) ?? []), gen]);
  }
  const measurementsByBus = new Map<string, typeof view.measurements[number][]>();
  for (const m of [...view.measurements].sort((a, b) => sortRefs(a.ref_id, b.ref_id))) {
    measurementsByBus.set(m.bus_ref, [...(measurementsByBus.get(m.bus_ref) ?? []), m]);
  }
  const relayByBreaker = new Map(view.protection_assignments.map((p) => [p.breaker_ref, p] as const));
  const boundaryByBus = new Map<string, typeof view.boundary_links[number][]>();
  for (const link of [...view.boundary_links].sort((a, b) => sortRefs(a.branch_ref, b.branch_ref))) {
    boundaryByBus.set(link.from_bus_ref, [...(boundaryByBus.get(link.from_bus_ref) ?? []), link]);
  }
  const transformersByBoard = new Map<string, string[]>();
  for (const section of view.sections) transformersByBoard.set(section.bus_ref, [...section.transformer_refs]);

  /** Stopień zacisku: liczba gałęzi + transformatorów + odbiorów + źródeł + granic. */
  const degreeOf = (busRef: string): number => {
    let degree = 0;
    for (const b of view.branches) if (b.from_bus_ref === busRef || b.to_bus_ref === busRef) degree += 1;
    for (const t of view.transformers) if (t.lv_bus_ref === busRef) degree += 1;
    degree += (loadsByBus.get(busRef)?.length ?? 0) + (gensByBus.get(busRef)?.length ?? 0) + (boundaryByBus.get(busRef)?.length ?? 0);
    return degree;
  };

  // --- Szerokości poddrzew (rekurencja po rolach backendu). ---------------
  const planByBus = new Map<string, SectionPlan>();

  function subtreeWidthBelow(busRef: string): number {
    const section = sectionByBus.get(busRef);
    if (section) return planSection(section.bus_ref, false).width + T.sectionGap;
    const children = childrenByBus.get(busRef) ?? [];
    const leaves = (loadsByBus.get(busRef)?.length ?? 0) + (gensByBus.get(busRef)?.length ?? 0);
    if (children.length === 0) return T.feederGap;
    const childWidths = children.map((d) => subtreeWidthBelow(d.child_bus_ref));
    return Math.max(T.feederGap, childWidths.reduce((acc, w) => acc + w, 0) + (leaves > 0 ? T.feederGap : 0));
  }

  function planSection(busRef: string, mirror: boolean): SectionPlan {
    const existing = planByBus.get(busRef);
    if (existing) return existing;
    const feeders = feedersByBoard.get(busRef) ?? [];
    const incomers = incomersByBoard.get(busRef) ?? [];
    const directTransformers = (transformersByBoard.get(busRef) ?? []).filter(
      (ref) => !incomers.some((d) => d.transformer_ref === ref),
    );
    const directLoads = loadsByBus.get(busRef) ?? [];
    const directGens = gensByBus.get(busRef) ?? [];
    const boundaries = boundaryByBus.get(busRef) ?? [];
    const vts = (measurementsByBus.get(busRef) ?? []).filter((m) => m.measurement_type === 'VT');

    const sourceSlots: Slot[] = [
      ...incomers.map((d) => ({ ref: d.ref_id, kind: 'incomer' as const, width: T.sourceSlot })),
      ...directTransformers.map((ref) => ({ ref, kind: 'incomer' as const, width: T.sourceSlot })),
    ];
    const belowSlots: Slot[] = [
      ...feeders.map((d) => ({ ref: d.ref_id, kind: 'feeder' as const, width: subtreeWidthBelow(d.child_bus_ref) })),
      ...directLoads.map((l) => ({ ref: l.ref_id, kind: 'load' as const, width: T.feederGap })),
      ...boundaries.map((l) => ({ ref: l.branch_ref, kind: 'boundary' as const, width: T.feederGap + T.boundaryChipOffset })),
    ];
    const aboveRightSlots: Slot[] = [
      ...directGens.map((g) => ({ ref: g.ref_id, kind: 'derDirect' as const, width: T.sourceSlot })),
      ...vts.map((m) => ({ ref: m.ref_id, kind: 'vt' as const, width: T.feederGap })),
    ];
    // Kolejność slotów wzdłuż kreski: [źródła] [odpływy…] [DER bez pola, VT];
    // sekcja lustrzana: [DER bez pola, VT] [odpływy…] [źródła].
    const ordered: Slot[] = mirror
      ? [...aboveRightSlots, ...belowSlots, ...sourceSlots]
      : [...sourceSlots, ...belowSlots, ...aboveRightSlots];
    const slotX = new Map<string, number>();
    let cursor = T.busOverhang;
    for (const slot of ordered) {
      slotX.set(slot.ref, doRastra(cursor + slot.width / 2));
      cursor += slot.width;
    }
    const width = Math.max(2 * T.minBusHalfWidth, doRastra(cursor + T.busOverhang));
    const plan: SectionPlan = { busRef, mirror, slots: ordered, width, slotX, left: 0, busY: 0 };
    planByBus.set(busRef, plan);
    return plan;
  }

  // --- Sekcje korzeniowe obok siebie; sprzęgło w przerwie. -----------------
  const rootSections = view.sections
    .filter((s) => s.tier === 'main')
    .sort((a, b) => a.order - b.order || sortRefs(a.bus_ref, b.bus_ref));
  rootSections.forEach((section, index) => {
    const mirror = rootSections.length >= 2 && index === rootSections.length - 1;
    planSection(section.bus_ref, mirror);
  });

  const hasIncomerAnywhere = rootSections.some((s) => (incomersByBoard.get(s.bus_ref) ?? []).length > 0);
  const anchorY = T.marginY + LABEL_RESERVE_TOP;
  const transformerY = anchorY + T.anchorToTransformer;
  const terminalY = transformerY + T.transformerToTerminal;
  const rootBusY = doRastra(hasIncomerAnywhere ? terminalY + T.terminalToBus : terminalY + T.busToDevice);

  let cursorX = T.marginX;
  rootSections.forEach((section, index) => {
    const plan = planByBus.get(section.bus_ref)!;
    plan.left = doRastra(cursorX);
    plan.busY = rootBusY;
    cursorX = plan.left + plan.width + (index < rootSections.length - 1 ? T.sectionGap : 0);
  });

  const slotAbs = (plan: SectionPlan, ref: string): number => plan.left + (plan.slotX.get(ref) ?? plan.width / 2);
  const posOfBus = new Map<string, { x: number; y: number }>();

  // --- Emisja szyny sekcji. -------------------------------------------------
  function emitBus(bus: LvDomainBus, plan: SectionPlan, tier: 'main' | 'sub', feedX: number | null = null): void {
    posOfBus.set(bus.ref_id, { x: plan.left + plan.width / 2, y: plan.busY });
    const feederCount = plan.slots.filter((s) => s.kind === 'feeder' || s.kind === 'load' || s.kind === 'boundary').length;
    // Etykiety sekcji stoją ZA kolumną incomera (sekcja zwykła: od lewej po
    // slotach źródeł; lustrzana: od lewego końca kreski) — nazwa nie może
    // leżeć pod pionem wyłącznika głównego. Podrozdzielnica: ZA pionem
    // zasilającym (`feedX`) — ten sam warunek, inny nośnik wejścia.
    const leadingSourceWidth = plan.mirror
      ? 0
      : plan.slots.filter((s, i) => s.kind === 'incomer' && plan.slots.slice(0, i).every((p) => p.kind === 'incomer')).reduce((acc, s) => acc + s.width, 0);
    const labelX = feedX != null
      ? feedX + RASTER * 2
      : plan.left + (leadingSourceWidth > 0 ? T.busOverhang + leadingSourceWidth : 0);
    nodes.push({
      kind: 'bus',
      ref: bus.ref_id,
      x: doRastra(plan.left + plan.width / 2),
      y: plan.busY,
      label: bus.name,
      barLeft: plan.left,
      barRight: plan.left + plan.width,
      meta: {
        ...terminalMeta(zaciski.get(bus.ref_id)),
        voltageKv: bus.voltage_kv,
        voltageLevelId: bus.voltage_level_id,
        hopsFromRoot: bus.hops_from_root,
        busTier: tier,
        sectionId: sectionByBus.get(bus.ref_id)?.section_id,
        feederCount,
        mirror: plan.mirror,
        labelX,
      },
    });
  }

  /** Aparat na pionie: DWA kikuty w stanach swoich zacisków (§5/§7). */
  function emitApparatus(
    device: LvDomainDevice,
    x: number,
    yTop: number,
    yDevice: number,
    yBottom: number,
    role: string,
  ): void {
    const branch = branchByRef.get(device.ref_id);
    const segment = segmentByRef.get(device.ref_id);
    const wpis = wpisAparatu(device.device_type, device.device_kind, device.catalog_namespace);
    const topIsFrom = device.parent_bus_ref === segment?.from_bus_ref;
    const topState = topIsFrom ? segment?.from_terminal : segment?.to_terminal;
    const bottomState = topIsFrom ? segment?.to_terminal : segment?.from_terminal;
    if (wpis.symbolId) {
      nodes.push({
        kind: 'apparatus',
        ref: device.ref_id,
        x,
        y: yDevice,
        label: branch?.name ?? device.ref_id,
        symbolId: wpis.symbolId,
        meta: {
          deviceType: device.device_type,
          deviceState: deviceStateOf(device),
          designation: device.designation_class,
          role,
          feederKind: device.feeder_kind,
          catalogRef: branch?.catalog_ref,
          terminalA: terminalMeta(topState),
          terminalB: terminalMeta(bottomState),
          islandTop: topState?.island_ref,
          islandBottom: bottomState?.island_ref,
          nosnikStanu: wpis.nosnikStanu,
          deviceKind: device.device_kind,
          nazwaPl: wpis.nazwaPl,
        },
      });
      const relay = relayByBreaker.get(device.ref_id);
      if (relay) {
        // Przekaźnik PO LEWEJ, PONIŻEJ wiersza etykiety aparatu: wiersz
        // etykiet (nazwa · OTWARTY) biegnie na wysokości glifu w prawo od
        // pionu, więc symbol na tej samej wysokości wchodził w etykietę
        // sąsiedniej kolumny (zrzut 12_der_full_path). Łącznik kropkowany do
        // kikuta dolnego aparatu (reguła globalna — ta sama dla incomera).
        const relayX = x - RASTER * 5;
        const relayY = yDevice + RASTER * 6;
        nodes.push({
          kind: 'relay',
          ref: `relay:${relay.ref_id}`,
          x: relayX,
          y: relayY,
          label: relay.name,
          symbolId: SYMBOL_ZABEZPIECZENIA,
          meta: { breakerRef: device.ref_id, functionCodes: relay.function_codes, ctRef: relay.ct_ref, enabled: relay.is_enabled },
        });
        edges.push({ ref: `relay:${relay.ref_id}#link`, kind: 'relayLink', x1: relayX, y1: relayY, x2: x, y2: relayY });
      }
      const edgeKind: LvDomainSceneEdgeKind = role === 'incomer' ? 'incomer' : 'branch';
      edges.push({
        ref: `${device.ref_id}#a`,
        kind: edgeKind,
        x1: x,
        y1: yTop,
        x2: x,
        y2: yDevice,
        meta: { ...terminalMeta(topState), deviceRef: device.ref_id, side: 'a', role, connectivity: segment?.connectivity_state },
      });
      edges.push({
        ref: `${device.ref_id}#b`,
        kind: edgeKind,
        x1: x,
        y1: yDevice,
        x2: x,
        y2: yBottom,
        meta: { ...terminalMeta(bottomState), deviceRef: device.ref_id, side: 'b', role, connectivity: segment?.connectivity_state },
      });
    } else {
      // Przewód bez symbolu (kabel/linia w roli odpływu — audyt NN-AUD-07 z backendu).
      edges.push({
        ref: device.ref_id,
        kind: 'cable',
        x1: x,
        y1: yTop,
        x2: x,
        y2: yBottom,
        meta: { energization: segment?.energization_state, connectivity: segment?.connectivity_state, catalogRef: branch?.catalog_ref, role },
      });
    }
  }

  function cableMeta(segment: LvDomainSegment | undefined, ref: string): Readonly<Record<string, unknown>> {
    const branch = branchByRef.get(ref);
    return {
      energization: segment?.energization_state,
      connectivity: segment?.connectivity_state,
      catalogRef: branch?.catalog_ref,
      catalogNamespace: branch?.catalog_namespace,
      sourceIds: segment?.source_ids,
    };
  }

  /** Pomiar CT na szynie-zacisku: symbol na pionowym torze wchodzącym w zacisk. */
  function emitMeasurementsOnWire(busRef: string, x: number, yWireTop: number, yWireBottom: number): void {
    const cts = (measurementsByBus.get(busRef) ?? []).filter((m) => m.measurement_type === 'CT');
    cts.forEach((m, i) => {
      const y = doRastra(yWireTop + ((yWireBottom - yWireTop) * (i + 1)) / (cts.length + 1));
      nodes.push({
        kind: 'measurement',
        ref: m.ref_id,
        x,
        y,
        label: m.name,
        symbolId: symbolPomiaru('CT'),
        meta: {
          measurementType: 'CT',
          ratio: `${plNumber(m.ratio_primary)}/${plNumber(m.ratio_secondary)} A`,
          purpose: m.purpose,
          busRef,
          accuracyClass: m.accuracy_class,
          burdenVa: m.burden_va,
          ctCores: m.ct_cores,
          ctArrangement: m.ct_arrangement,
        },
      });
    });
  }

  /** Liście na zacisku (odbiory / źródła w polu) — pod zaciskiem, własne sloty. */
  function emitLeaves(busRef: string, x: number, y: number, state: LvTerminalState | undefined): void {
    const loads = loadsByBus.get(busRef) ?? [];
    const gens = gensByBus.get(busRef) ?? [];
    const leaves = [...loads.map((l) => ({ kind: 'load' as const, ref: l.ref_id })), ...gens.map((g) => ({ kind: 'generator' as const, ref: g.ref_id }))];
    leaves.forEach((leaf, i) => {
      const lx = doRastra(x + (i - (leaves.length - 1) / 2) * T.feederGap);
      const ly = y + T.terminalToLeaf;
      if (leaf.kind === 'load') {
        const load = loads.find((l) => l.ref_id === leaf.ref)!;
        nodes.push({
          kind: 'load',
          ref: load.ref_id,
          x: lx,
          y: ly,
          label: load.name,
          symbolId: SYMBOL_ODBIORU,
          meta: { busRef, pMw: load.p_mw, qMvar: load.q_mvar, ...terminalMeta(state) },
        });
      } else {
        const gen = gens.find((g) => g.ref_id === leaf.ref)!;
        nodes.push({
          kind: 'generator',
          ref: gen.ref_id,
          x: lx,
          y: ly,
          label: gen.name,
          symbolId: symbolZrodlaDer(gen.gen_type),
          meta: {
            busRef,
            pMw: gen.p_mw,
            genType: gen.gen_type,
            islandCapability: gen.island_capability,
            capabilitySourcePl: gen.capability_source_pl,
            islandOperationCapable: gen.island_operation_capable,
            ...terminalMeta(state),
          },
        });
      }
      // Zejście liścia zaczyna się W ZACISKU (x), nie pod liściem: przy ≥2
      // liściach na zacisku tor idzie ortogonalnie (poziomo do slotu liścia,
      // potem w dół) — renderer rysuje łamaną, gdy x1 ≠ x2 (§23).
      edges.push({ ref: `${leaf.ref}#leaf-drop`, kind: 'leafDrop', x1: x, y1: y, x2: lx, y2: ly, meta: { ...terminalMeta(state), leafKind: leaf.kind } });
    });
  }

  /** Zacisk pośredni + wszystko, co z niego schodzi (rekurencja po rolach). */
  function emitJunctionSubtree(busRef: string, x: number, y: number): void {
    const bus = busByRef.get(busRef);
    if (!bus) return;
    posOfBus.set(busRef, { x, y });
    const state = zaciski.get(busRef);
    const children = childrenByBus.get(busRef) ?? [];
    const leaves = (loadsByBus.get(busRef)?.length ?? 0) + (gensByBus.get(busRef)?.length ?? 0);
    nodes.push({
      kind: 'terminal',
      ref: busRef,
      x,
      y,
      label: bus.name,
      symbolId: symbolPunktuToru(degreeOf(busRef)),
      meta: { ...terminalMeta(state), voltageKv: bus.voltage_kv, hopsFromRoot: bus.hops_from_root, degree: degreeOf(busRef) },
    });
    // Sloty dzieci: gałęzie wewnętrzne (każda ze swoim poddrzewem) + liście.
    const slots = [
      ...children.map((d) => ({ ref: d.ref_id, width: subtreeWidthBelow(d.child_bus_ref), device: d })),
      ...(leaves > 0 ? [{ ref: `${busRef}#leaves`, width: T.feederGap, device: null }] : []),
    ];
    const total = slots.reduce((acc, s) => acc + s.width, 0);
    let cursor = x - total / 2;
    for (const slot of slots) {
      const sx = doRastra(cursor + slot.width / 2);
      cursor += slot.width;
      if (!slot.device) {
        emitLeaves(busRef, x, y, state);
        continue;
      }
      emitInternalBranch(slot.device, sx, y);
    }
  }

  /** Gałąź wewnętrzna (kabel / aparat) od zacisku w dół do dziecka. */
  function emitInternalBranch(device: LvDomainDevice, x: number, yTop: number): void {
    const wpis = wpisAparatu(device.device_type, device.device_kind, device.catalog_namespace);
    const segment = segmentByRef.get(device.ref_id);
    const childRef = device.child_bus_ref;
    const childSection = sectionByBus.get(childRef);
    if (wpis.symbolId) {
      const yDevice = yTop + T.busToDevice;
      const yBottom = yDevice + T.deviceToChild;
      emitApparatus(device, x, yTop, yDevice, yBottom, 'internal');
      emitChild(childRef, x, yBottom, childSection !== undefined, yDevice);
    } else {
      const yBottom = yTop + T.deviceToChild;
      edges.push({ ref: device.ref_id, kind: 'cable', x1: x, y1: yTop, x2: x, y2: yBottom, meta: cableMeta(segment, device.ref_id) });
      emitChild(childRef, x, yBottom, childSection !== undefined, yTop);
    }
  }

  /** Dziecko pod kikutem: podrozdzielnica (kreska od punktu wejścia) albo
   *  zacisk. `wireTop` = początek pionu wchodzącego w dziecko (na nim siada
   *  przekładnik prądowy zacisku, gdy model go niesie — §12). */
  function emitChild(childRef: string, x: number, y: number, isBoard: boolean, wireTop: number): void {
    if (!isBoard) emitMeasurementsOnWire(childRef, x, wireTop, y);
    if (isBoard) {
      const plan = planSection(childRef, false);
      plan.left = doRastra(x - T.busOverhang);
      plan.busY = doRastra(y + T.busGap - T.deviceToChild);
      const bus = busByRef.get(childRef);
      if (!bus) return;
      // Pion od końca kabla do kreski podrozdzielnicy (punkt wejścia = lewy skraj).
      const state = zaciski.get(childRef);
      edges.push({ ref: `${childRef}#feed`, kind: 'branch', x1: x, y1: y, x2: x, y2: plan.busY, meta: { ...terminalMeta(state), role: 'feed' } });
      emitBus(bus, plan, 'sub', x);
      emitSectionContents(plan);
    } else {
      emitJunctionSubtree(childRef, x, y);
    }
  }

  /** Zawartość sekcji: odpływy, odbiory bez pola, granice, źródła bez pola, VT. */
  function emitSectionContents(plan: SectionPlan): void {
    const busRef = plan.busRef;
    const busState = zaciski.get(busRef);
    for (const slot of plan.slots) {
      const x = slotAbs(plan, slot.ref);
      if (slot.kind === 'feeder') {
        const device = deviceByRef.get(slot.ref)!;
        const wpis = wpisAparatu(device.device_type, device.device_kind, device.catalog_namespace);
        const childSection = sectionByBus.get(device.child_bus_ref);
        if (wpis.symbolId) {
          const yDevice = plan.busY + T.busToDevice;
          const yBottom = yDevice + T.deviceToChild;
          emitApparatus(device, x, plan.busY, yDevice, yBottom, 'feeder');
          emitChild(device.child_bus_ref, x, yBottom, childSection !== undefined, yDevice);
        } else {
          const yBottom = plan.busY + T.busToDevice + T.deviceToChild;
          edges.push({ ref: device.ref_id, kind: 'cable', x1: x, y1: plan.busY, x2: x, y2: yBottom, meta: { ...cableMeta(segmentByRef.get(device.ref_id), device.ref_id), role: 'feeder' } });
          emitChild(device.child_bus_ref, x, yBottom, childSection !== undefined, plan.busY);
        }
      } else if (slot.kind === 'load') {
        const load = view.loads.find((l) => l.ref_id === slot.ref)!;
        const ly = plan.busY + T.busToDevice + T.terminalToLeaf;
        nodes.push({ kind: 'load', ref: load.ref_id, x, y: ly, label: load.name, symbolId: SYMBOL_ODBIORU, meta: { busRef, pMw: load.p_mw, qMvar: load.q_mvar, direct: true, ...terminalMeta(busState) } });
        edges.push({ ref: `${load.ref_id}#leaf-drop`, kind: 'leafDrop', x1: x, y1: plan.busY, x2: x, y2: ly, meta: { ...terminalMeta(busState), leafKind: 'load', direct: true } });
      } else if (slot.kind === 'boundary') {
        const link = view.boundary_links.find((l) => l.branch_ref === slot.ref)!;
        const terminalPos = { x, y: plan.busY + T.busToBoundaryTerminal };
        const branch = branchByRef.get(link.branch_ref);
        edges.push({
          ref: link.branch_ref,
          kind: 'cable',
          x1: x,
          y1: plan.busY,
          x2: terminalPos.x,
          y2: terminalPos.y,
          meta: { ...terminalMeta(busState), role: 'boundary', catalogRef: branch?.catalog_ref, connectivity: branch ? (branch.status === 'closed' ? 'CLOSED' : 'OPEN') : undefined },
        });
        nodes.push({ kind: 'boundaryTerminal', ref: `boundary-terminal:${link.branch_ref}`, x: terminalPos.x, y: terminalPos.y, label: '●', symbolId: SYMBOL_ZACISKU, meta: { branchRef: link.branch_ref } });
        const chip = { x: terminalPos.x + T.boundaryChipOffset, y: terminalPos.y };
        nodes.push({
          kind: 'boundaryChip',
          ref: `boundary:${link.branch_ref}`,
          x: chip.x,
          y: chip.y,
          label: `→ ${link.target_station_name}`,
          meta: { targetStationRef: link.target_station_ref, branchRef: link.branch_ref, voltageKv: busByRef.get(link.from_bus_ref)?.voltage_kv },
        });
        edges.push({ ref: `boundary:${link.branch_ref}#link`, kind: 'boundaryLink', x1: terminalPos.x, y1: terminalPos.y, x2: chip.x, y2: chip.y, meta: terminalMeta(busState) });
      } else if (slot.kind === 'derDirect') {
        const gen = view.generators.find((g) => g.ref_id === slot.ref)!;
        const gy = plan.busY - T.terminalToLeaf;
        nodes.push({
          kind: 'generator',
          ref: gen.ref_id,
          x,
          y: gy,
          label: gen.name,
          symbolId: symbolZrodlaDer(gen.gen_type),
          meta: { busRef, pMw: gen.p_mw, genType: gen.gen_type, islandCapability: gen.island_capability, capabilitySourcePl: gen.capability_source_pl, islandOperationCapable: gen.island_operation_capable, direct: true, ...terminalMeta(busState) },
        });
        edges.push({ ref: `${gen.ref_id}#leaf-drop`, kind: 'leafDrop', x1: x, y1: gy, x2: x, y2: plan.busY, meta: { ...terminalMeta(busState), leafKind: 'generator', direct: true } });
      } else if (slot.kind === 'vt') {
        const m = view.measurements.find((mm) => mm.ref_id === slot.ref)!;
        const my = plan.busY - T.busToDevice;
        nodes.push({ kind: 'measurement', ref: m.ref_id, x, y: my, label: m.name, symbolId: symbolPomiaru('VT'), meta: { measurementType: 'VT', ratio: `${plNumber(m.ratio_primary)}/${plNumber(m.ratio_secondary)} V`, purpose: m.purpose, busRef, accuracyClass: m.accuracy_class, burdenVa: m.burden_va, ctCores: null, ctArrangement: null } });
        edges.push({ ref: `${m.ref_id}#vt-drop`, kind: 'leafDrop', x1: x, y1: my, x2: x, y2: plan.busY, meta: { ...terminalMeta(busState), leafKind: 'measurement' } });
      }
    }
  }

  // --- Emisja sekcji korzeniowych + źródeł. ---------------------------------
  interface TransformerPlacement { readonly transformerRef: string; readonly x: number; }
  const placements: TransformerPlacement[] = [];

  for (const section of rootSections) {
    const plan = planByBus.get(section.bus_ref)!;
    const bus = busByRef.get(section.bus_ref);
    if (!bus) continue;
    emitBus(bus, plan, 'main');
    emitSectionContents(plan);

    for (const slot of plan.slots.filter((s) => s.kind === 'incomer')) {
      const x = slotAbs(plan, slot.ref);
      const incomer = deviceByRef.get(slot.ref);
      const transformerRef = incomer?.transformer_ref ?? slot.ref;
      const trafo = transformerByRef.get(transformerRef);
      if (!trafo) continue;
      placements.push({ transformerRef, x });
      const terminalState = zaciski.get(trafo.lv_bus_ref);
      if (incomer) {
        // Zacisk nN transformatora (jawny) → CT → wyłącznik główny → szyna;
        // kikut dolny dłuższy (przekaźnik obok niego nie siada na szynie).
        const yDevice = doRastra(terminalY + T.terminalToIncomer);
        const terminalBus = busByRef.get(trafo.lv_bus_ref);
        posOfBus.set(trafo.lv_bus_ref, { x, y: terminalY });
        nodes.push({
          kind: 'terminal',
          ref: trafo.lv_bus_ref,
          x,
          y: terminalY,
          label: terminalBus?.name ?? trafo.lv_bus_ref,
          symbolId: symbolPunktuToru(degreeOf(trafo.lv_bus_ref)),
          meta: { ...terminalMeta(terminalState), voltageKv: terminalBus?.voltage_kv, hopsFromRoot: terminalBus?.hops_from_root, degree: degreeOf(trafo.lv_bus_ref), transformerTerminal: transformerRef },
        });
        emitApparatus(incomer, x, terminalY, yDevice, plan.busY, 'incomer');
        emitMeasurementsOnWire(trafo.lv_bus_ref, x, terminalY, yDevice);
      }
      const trY = transformerY;
      nodes.push({
        kind: 'transformer',
        ref: trafo.ref_id,
        x,
        y: trY,
        label: transformerNameplateLabel(trafo),
        symbolId: SYMBOL_TRANSFORMATORA,
        meta: {
          name: trafo.name,
          snMva: trafo.sn_mva,
          uhvKv: trafo.uhv_kv,
          ulvKv: trafo.ulv_kv,
          vectorGroup: trafo.vector_group ?? null,
          ukPercent: trafo.uk_percent,
          hvBusRef: trafo.hv_bus_ref,
          lvBusRef: trafo.lv_bus_ref,
          lvNeutral: trafo.lv_neutral,
          upstreamSystemId: trafo.upstream_system_id,
          hasExplicitIncomer: incomer !== undefined,
          ...terminalMeta(terminalState),
        },
      });
      edges.push({
        ref: `${trafo.ref_id}#lv`,
        kind: 'sourceDrop',
        x1: x,
        y1: trY,
        x2: x,
        y2: incomer ? terminalY : plan.busY,
        meta: { ...terminalMeta(terminalState), transformerRef: trafo.ref_id },
      });
      if (!incomer) emitMeasurementsOnWire(trafo.lv_bus_ref, x, trY, plan.busY);
    }
  }

  // --- Kotwice systemów SN (§10/§11): jedna kreska na grupę tożsamości. -----
  const groupKeyOf = (transformerRef: string): string => {
    const rownowaznik = snapshotByTransformer.get(transformerRef);
    const equivalentId = rownowaznik?.equivalent_id;
    if (equivalentId) return `eq:${equivalentId}`;
    const systemId = transformerByRef.get(transformerRef)?.upstream_system_id;
    return systemId ? `system:${systemId}` : `tr:${transformerRef}`;
  };
  const groups = new Map<string, TransformerPlacement[]>();
  for (const placement of placements) {
    const key = groupKeyOf(placement.transformerRef);
    groups.set(key, [...(groups.get(key) ?? []), placement]);
  }
  const groupKeys = [...groups.keys()].sort((a, b) => {
    const xa = Math.min(...groups.get(a)!.map((p) => p.x));
    const xb = Math.min(...groups.get(b)!.map((p) => p.x));
    return xa - xb;
  });
  const groupLeft = (key: string): number => Math.min(...groups.get(key)!.map((p) => p.x)) - RASTER * 4;
  groupKeys.forEach((key, index) => {
    const members = groups.get(key)!.sort((a, b) => a.x - b.x);
    const first = transformerByRef.get(members[0].transformerRef)!;
    const snapshot = members.map((m) => snapshotByTransformer.get(m.transformerRef)).find((s) => s !== undefined);
    const systemId = first.upstream_system_id ?? null;
    const left = members[0].x - RASTER * 4;
    const right = members[members.length - 1].x + RASTER * 4;
    const anchorRef = `anchor:${key}`;
    // Pas na etykiety kotwicy [świat]: do lewej krawędzi NASTĘPNEJ kotwicy
    // (dwa niezależne systemy SN obok siebie nie mogą pisać po sobie) albo do
    // prawego skraju sceny — renderer zawija opis do tej szerokości.
    const nextKey = groupKeys[index + 1];
    const labelMaxWidth = (nextKey ? groupLeft(nextKey) - RASTER * 2 : cursorX + LABEL_RESERVE_RIGHT) - left;
    nodes.push({
      kind: 'anchorBar',
      ref: anchorRef,
      x: doRastra((left + right) / 2),
      y: anchorY,
      label: anchorIdentityLabel(snapshot, systemId, first.uhv_kv),
      barLeft: left,
      barRight: right,
      meta: {
        systemId,
        systemIndex: index + 1,
        systemCount: groupKeys.length,
        transformerRefs: members.map((m) => m.transformerRef),
        upstreamSourceIds: snapshot?.upstream_source_ids ?? [],
        equivalentId: snapshot?.equivalent_id ?? null,
        status: snapshot?.status ?? 'brak danych',
        tozsamoscLabel: anchorIdentityLabel(snapshot, systemId, first.uhv_kv),
        opisLabel: anchorDetailLabel(snapshot),
        labelMaxWidth,
        shared: members.length > 1,
        snapshot: snapshot as unknown as Record<string, unknown> | undefined,
      },
    });
    for (const member of members) {
      edges.push({
        ref: `${anchorRef}#drop:${member.transformerRef}`,
        kind: 'anchorDrop',
        x1: member.x,
        y1: anchorY,
        x2: member.x,
        y2: transformerY,
        meta: { transformerRef: member.transformerRef, energization: 'ENERGIZED' as LvEnergizationState, sn: true, status: snapshot?.status ?? 'brak danych' },
      });
    }
  });

  // --- Sprzęgła między sąsiednimi sekcjami (§7). ----------------------------
  for (const device of couplers) {
    const planA = planByBus.get(device.terminal_a);
    const planB = planByBus.get(device.terminal_b);
    const segment = segmentByRef.get(device.ref_id);
    const branch = branchByRef.get(device.ref_id);
    if (!planA || !planB) continue;
    const leftPlan = planA.left <= planB.left ? planA : planB;
    const rightPlan = leftPlan === planA ? planB : planA;
    const leftState = leftPlan === planA ? segment?.from_terminal : segment?.to_terminal;
    const rightState = leftPlan === planA ? segment?.to_terminal : segment?.from_terminal;
    const x1 = leftPlan.left + leftPlan.width;
    const x2 = rightPlan.left;
    const y = leftPlan.busY;
    const mid = doRastra((x1 + x2) / 2);
    // Sprzęgło = REALNY aparat z ENM (typ gałęzi × klasa funkcjonalna z
    // katalogu) w orientacji poziomej, w osi szyny (R2 §6). Bez klasy —
    // łącznik ogólny (audyt NN-AUD-18 z backendu), nie dorysowany wyłącznik.
    const wpis = wpisAparatu(device.device_type, device.device_kind, device.catalog_namespace);
    nodes.push({
      kind: 'apparatus',
      ref: device.ref_id,
      x: mid,
      y,
      label: branch?.name ?? device.ref_id,
      symbolId: wpis.symbolId ?? 'cad.lacznik',
      orientation: 'pozioma',
      meta: {
        deviceType: device.device_type,
        deviceState: deviceStateOf(device),
        designation: device.designation_class,
        role: 'coupler',
        catalogRef: branch?.catalog_ref,
        terminalA: terminalMeta(leftState),
        terminalB: terminalMeta(rightState),
        nosnikStanu: wpis.nosnikStanu,
        deviceKind: device.device_kind,
        nazwaPl: wpis.nazwaPl,
        horizontal: true,
      },
    });
    edges.push({ ref: `${device.ref_id}#a`, kind: 'coupler', x1, y1: y, x2: mid, y2: y, meta: { ...terminalMeta(leftState), deviceRef: device.ref_id, side: 'a', role: 'coupler', connectivity: segment?.connectivity_state } });
    edges.push({ ref: `${device.ref_id}#b`, kind: 'coupler', x1: mid, y1: y, x2, y2: y, meta: { ...terminalMeta(rightState), deviceRef: device.ref_id, side: 'b', role: 'coupler', connectivity: segment?.connectivity_state } });
  }

  // --- Otoczka i gabaryt (rezerwa na etykiety, §25). -------------------------
  const xs = [...nodes.flatMap((n) => [n.x, n.barLeft ?? n.x, n.barRight ?? n.x]), ...edges.flatMap((e) => [e.x1, e.x2])];
  const ys = [...nodes.map((n) => n.y), ...edges.flatMap((e) => [e.y1, e.y2])];
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const shiftX = minX < T.marginX ? T.marginX - minX : 0;
  const shiftY = minY < T.marginY ? T.marginY - minY : 0;
  const shiftedNodes = shiftX === 0 && shiftY === 0
    ? nodes
    : nodes.map((n) => ({
        ...n,
        x: n.x + shiftX,
        y: n.y + shiftY,
        barLeft: n.barLeft === undefined ? undefined : n.barLeft + shiftX,
        barRight: n.barRight === undefined ? undefined : n.barRight + shiftX,
      }));
  const shiftedEdges = shiftX === 0 && shiftY === 0
    ? edges
    : edges.map((e) => ({ ...e, x1: e.x1 + shiftX, y1: e.y1 + shiftY, x2: e.x2 + shiftX, y2: e.y2 + shiftY }));
  const maxX = Math.max(T.marginX, ...shiftedNodes.flatMap((n) => [n.x, n.barRight ?? n.x]), ...shiftedEdges.flatMap((e) => [e.x1, e.x2]));
  const maxY = Math.max(T.marginY, ...shiftedNodes.map((n) => n.y), ...shiftedEdges.flatMap((e) => [e.y1, e.y2]));

  return {
    nodes: shiftedNodes,
    edges: shiftedEdges,
    width: maxX + T.marginX + LABEL_RESERVE_RIGHT,
    height: maxY + T.marginY + LABEL_RESERVE_BOTTOM,
    stationRef: view.station_ref,
    stationName: view.station_name ?? '',
    supplyPaths,
    warningsByRef,
  };
}
