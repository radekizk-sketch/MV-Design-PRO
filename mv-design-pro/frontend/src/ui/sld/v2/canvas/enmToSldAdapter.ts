/**
 * enmToSldAdapter — adapter danych ENM → propsy rendererów SldCanvasV2.
 *
 * Iteracja 11 dostawy. Czysta, deterministyczna funkcja:
 *   buildSldDataFromSnapshot(snapshot, logicalViews) → {
 *     gpzs, sections, cableRuns, stations, ders
 *   }
 *
 * Reguły:
 *  - Brak fałszywych danych: jeśli snapshot pusty → puste tablice.
 *  - Layout deterministyczny: pozycje obliczane ze stabilnych slotów hierarchii.
 *  - Brak interpretacji fizycznej: tylko geometria + identyfikatory.
 *
 * Slot system:
 *  - GPZ row:    y = Y_GPZ
 *  - Sections:   y = Y_SECTIONS (sztywna szyna pod GPZ)
 *  - Trunks:     y = Y_RUN_BASE + i × RUN_PITCH (kanały Y per ciąg)
 *  - Stations:   x = X_STATIONS_START + j × STATION_PITCH
 *  - DERs:       offset (RIGHT) względem stacji macierzystej
 */

import type {
  EnergyNetworkModel,
  LogicalViewsV1,
  Bus,
  Branch,
  Substation,
  Source,
  Generator,
  Bay,
  GPZSection,
  Transformer,
} from '../../../../types/enm';
import type { GpzRendererProps } from '../renderer/GpzRenderer';
import type { SectionRendererProps } from '../renderer/SectionRenderer';
import type { StationOnRunRendererProps } from '../renderer/StationOnRunRenderer';
import type { DerRendererProps } from '../renderer/DerRenderer';
import type {
  GpzBayDescriptor,
  GpzCouplerDescriptor,
  GpzSectionDescriptor,
} from '../renderer/GpzSwitchgearRenderer';
import { ENM_BAY_ROLE_TO_FIELD_ROLE, FIELD_ROLE } from '../domain/apparatusContracts';

// =============================================================================
// Slot constants (deterministic layout)
// =============================================================================

const X_GPZ = 100;
const Y_GPZ = 80;
const GPZ_WIDTH = 200;

const Y_SECTIONS = 200;
const SECTION_X_BASE = 100;
const SECTION_PITCH = 320;
const SECTION_WIDTH = 280;

const Y_RUN_BASE = 320;
const RUN_PITCH = 110;
const X_STATIONS_START = 200;
const STATION_PITCH = 180;

const DER_OFFSET_RIGHT = 80;

// =============================================================================
// Cable/line run helpers
// =============================================================================

interface CableRunRendererPropsLight {
  id: string;
  runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  pathPoints: ReadonlyArray<{ x: number; y: number }>;
  segmentKind: 'cable_sn' | 'overhead_line_sn';
}

function isCableLikeBranch(b: Branch): boolean {
  return b.type === 'cable' || b.type === 'line_overhead';
}

function classifySegmentKind(b: Branch): 'cable_sn' | 'overhead_line_sn' {
  return b.type === 'cable' ? 'cable_sn' : 'overhead_line_sn';
}

// =============================================================================
// Adapter result shape
// =============================================================================

export interface SldDataPayload {
  readonly gpzs: GpzRendererProps[];
  readonly sections: SectionRendererProps[];
  readonly cableRuns: CableRunRendererPropsLight[];
  readonly stations: StationOnRunRendererProps[];
  readonly ders: DerRendererProps[];
}

const EMPTY_SLD_DATA: SldDataPayload = Object.freeze({
  gpzs: [],
  sections: [],
  cableRuns: [],
  stations: [],
  ders: [],
});

// =============================================================================
// Main builder
// =============================================================================

export function buildSldDataFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
): SldDataPayload {
  if (!snapshot) return EMPTY_SLD_DATA;

  const gpzs = buildGpzs(snapshot);
  const sections = buildSections(snapshot);
  const stations = buildStations(snapshot);
  const cableRuns = buildCableRuns(snapshot, logicalViews);
  const ders = buildDers(snapshot, stations);

  return { gpzs, sections, cableRuns, stations, ders };
}

// -----------------------------------------------------------------------------
// GPZ
// -----------------------------------------------------------------------------

function buildGpzs(snapshot: EnergyNetworkModel): GpzRendererProps[] {
  const substations = snapshot.substations ?? [];
  const sources = snapshot.sources ?? [];
  const buses = snapshot.buses ?? [];
  const bays = snapshot.bays ?? [];
  const branches = snapshot.branches ?? [];
  const transformers = snapshot.transformers ?? [];

  const gpzStations = substations.filter((s) => s.station_type === 'gpz');

  return gpzStations.map((gpz, idx) => {
    const lvBus = findFirstBusByRefs(buses, gpz.bus_refs);
    const lvVoltageKv = lvBus?.voltage_kv ?? 15;
    /* HV voltage z ENM (transformer.uhv_kv lub bus.voltage_kv).
     * INVARIANT 9: brak danych = `null` propagowane do renderera, NIE
     * fałszywy default 110. Renderer pokaże etykietę "?" zamiast zmyślonego
     * "110 kV" (audyt system §B). */
    const hvVoltageKv = inferHvVoltageKv(transformers, gpz, buses);
    const hvVoltageKvKnown = hvVoltageKv !== null;
    const transformerCount = Math.max(1, gpz.transformer_refs?.length ?? 0);

    /* Buduj sections + couplers + bays z gpz_sections[] (LV side). */
    const { sections, couplers } = buildGpzSnSections({
      gpz,
      bays,
      branches,
      buses,
      substations,
      lvVoltageKv,
    });

    /* HV sections (110 kV): preferuje jawne `gpz_hv_sections[]` z ENM
     * (Phase 0A audit fix 8/8 — eliminacja synthesize). Fallback do synth
     * gdy ENM ich nie ma (BLOCKER-26 z audytu MV — gap backend nadal
     * częściowo otwarty dla pełnego two-bus modelowania). */
    const explicitHvSections = buildHvSectionsFromEnm({
      gpz,
      bays,
      branches,
      buses,
      substations,
      hvVoltageKv: hvVoltageKv ?? 110,
    });
    const hvSections = explicitHvSections.length > 0
      ? explicitHvSections
      : synthesizeHvSections({
          gpz,
          transformers,
          buses,
          sources,
          hvVoltageKv: hvVoltageKv ?? 110,
        });

    const feedersCount = sections.reduce(
      (acc, s) => acc + s.bays.filter((b) => b.fieldRole === FIELD_ROLE.LINE_OUT).length,
      0,
    );

    return {
      id: gpz.ref_id,
      x: X_GPZ + idx * (GPZ_WIDTH + 80),
      y: Y_GPZ,
      name: gpz.name || gpz.ref_id,
      /* INVARIANT 9: gdy null → przekazujemy 110 jako display fallback ALE
       * z `voltageHighKvKnown=false` flag żeby renderer mógł pokazać "?". */
      voltageHighKv: hvVoltageKv ?? 110,
      voltageHighKvKnown: hvVoltageKvKnown,
      voltageLowKv: lvVoltageKv,
      transformerCount,
      sections,
      couplers,
      hvSections: hvSections.length > 0 ? hvSections : undefined,
      hvCouplers: undefined, // ENM nie modeluje obecnie HV sprzęgieł — gap udokumentowany
      feedersCount,
    };
  });
}

interface SynthesizeHvArgs {
  readonly gpz: Substation;
  readonly transformers: readonly Transformer[];
  readonly buses: readonly Bus[];
  readonly sources: readonly Source[];
  readonly hvVoltageKv: number;
}

/**
 * Syntetyzuje HV (110 kV) sekcje z istniejących danych ENM:
 *   - TR feeder bays (po jednym na transformator z hv_bus_ref skojarzonym z GPZ)
 *   - Incoming line bays (po jednym na source na tym samym hv_bus_ref)
 *
 * Ta synteza jest deterministyczna i traceable do ENM (`transformer_refs`,
 * `transformer.hv_bus_ref`, `source.bus_ref`). Włącza two-bus topology w
 * renderze gdy GPZ ma faktyczne transformatory 110/SN.
 *
 * Gap: ENM nie modeluje obecnie sprzęgieł HV (110 kV bus jest pojedynczy w
 * większości GPZ); pierścieniowy 110 kV pozostaje przyszłym rozszerzeniem
 * (`gpz_hv_sections` + `hv_couplers`).
 */
/**
 * Phase 0A audit fix 8/8: Buduje GPZ HV sections z jawnych `gpz_hv_sections[]`
 * w ENM (eliminacja BLOCKER-26 — synthesize). Każda sekcja HV ma własny bus
 * i pola przypisane przez `gpz_section_id`.
 *
 * Zwraca pustą listę gdy ENM nie ma `gpz_hv_sections` — wtedy adapter
 * fallbackuje do `synthesizeHvSections`.
 */
interface BuildHvFromEnmArgs {
  readonly gpz: Substation;
  readonly bays: readonly Bay[];
  readonly branches: readonly Branch[];
  readonly buses: readonly Bus[];
  readonly substations: readonly Substation[];
  readonly hvVoltageKv: number;
}

function buildHvSectionsFromEnm(args: BuildHvFromEnmArgs): GpzSectionDescriptor[] {
  const { gpz, bays, branches, buses, substations, hvVoltageKv } = args;
  const hvSections = gpz.gpz_hv_sections ?? [];
  if (hvSections.length === 0) return [];

  return hvSections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const sectionBays = bays.filter(
        (b) => b.substation_ref === gpz.ref_id && b.gpz_section_id === section.section_id,
      );
      const sectionBus = buses.find((b) => b.ref_id === section.bus_ref);
      const sectionVoltageKv = sectionBus?.voltage_kv ?? hvVoltageKv;
      return {
        sectionId: section.section_id,
        order: section.order,
        name: section.name ?? `Sekcja HV ${section.order}`,
        sectionLabel: section.line_field_name ?? `S${section.order}`,
        busVoltageKv: sectionVoltageKv,
        bays: sectionBays.map((bay) =>
          bayDescriptorFromEnm(bay, branches, substations, gpz),
        ),
      };
    });
}

function synthesizeHvSections(args: SynthesizeHvArgs): GpzSectionDescriptor[] {
  const { gpz, transformers, buses, sources, hvVoltageKv } = args;
  const ownTransformers = transformers.filter((tr) =>
    gpz.transformer_refs?.includes(tr.ref_id),
  );
  if (ownTransformers.length === 0) return [];

  /* Wyznacz wspólny HV bus (zwykle jeden dla GPZ-1 / pierścieniowy poprawimy
   * gdy ENM doda hv_sections). Sortowanie deterministyczne — `Set` iteration
   * order nie jest gwarantowane stabilne między engine'ami (audyt system §7). */
  const hvBusRefs = Array.from(
    new Set(ownTransformers.map((tr) => tr.hv_bus_ref).filter(Boolean)),
  ).sort();
  if (hvBusRefs.length === 0) return [];

  const primaryHvBusRef = hvBusRefs[0];
  const hvBus = buses.find((b) => b.ref_id === primaryHvBusRef);
  const sectionVoltageKv = hvBus?.voltage_kv ?? hvVoltageKv;

  /* Incoming line bays — sources na HV busie.
   *
   * INVARIANT 9 (audyt system §1): brak danych ≠ default. Stany aparatów
   * NIE są hardkodowane jako 'closed' — adapter zostawia `undefined`,
   * renderer pokazuje neutral / "brak danych" badge. Zafałszowanie stanu
   * narusza Cardinal Rule (każdy element wizualny → ENM domain ref).
   *
   * Pole synthesized jako derived view z transformer + source data — bayRef
   * ma stabilny prefix `__hv-derived__` (BLOCKER-26 w audycie MV § 6).
   */
  const incomingSources = sources.filter((s) => s.bus_ref === primaryHvBusRef);
  const incomingBays: GpzBayDescriptor[] = incomingSources.map((src, idx) => ({
    bayRef: `${gpz.ref_id}__hv-derived-in-${src.ref_id}`,
    fieldRole: FIELD_ROLE.LINE_IN,
    designation: src.name || src.ref_id,
    feederName: (src.name || src.ref_id).slice(0, 8),
    bayNumber: `${(idx + 1) * 2 + 1}`,
    hasMissingRequiredDevice: false,
    /* energization, cbState, dsState — UNDEFINED (brak telemetrii w ENM).
     * Renderer pokaże 'unknown' (neutral) zamiast fałszywego 'energized'. */
  }));

  /* TR feeder bays. */
  const trBays: GpzBayDescriptor[] = ownTransformers.map((tr, idx) => ({
    bayRef: `${gpz.ref_id}__hv-derived-tr-${tr.ref_id}`,
    fieldRole: FIELD_ROLE.TRANSFORMER,
    designation: tr.name || `TR${idx + 1}`,
    feederName: `TR${idx + 1}`,
    bayNumber: `${(idx + 1) * 2}`,
    hasMissingRequiredDevice: false,
    /* energization/cbState/dsState undefined — patrz wyżej. */
  }));

  return [
    {
      sectionId: `${gpz.ref_id}__hv-sec-1`,
      order: 1,
      name: 'sekcja 110 kV',
      sectionLabel: 'sekcja A',
      busVoltageKv: sectionVoltageKv,
      bays: [...incomingBays, ...trBays],
    },
  ];
}

interface BuildSectionsArgs {
  readonly gpz: Substation;
  readonly bays: readonly Bay[];
  readonly branches: readonly Branch[];
  readonly buses: readonly Bus[];
  readonly substations: readonly Substation[];
  readonly lvVoltageKv: number;
}

interface BuildSectionsResult {
  readonly sections: GpzSectionDescriptor[];
  readonly couplers: GpzCouplerDescriptor[];
}

function buildGpzSnSections(args: BuildSectionsArgs): BuildSectionsResult {
  const { gpz, bays, branches, buses, substations, lvVoltageKv } = args;
  const gpzSections = (gpz.gpz_sections ?? []).slice().sort((a, b) => a.order - b.order);

  const gpzBays = bays.filter((b) => b.substation_ref === gpz.ref_id);
  const couplerBaysByRef = new Map<string, Bay>();
  for (const b of gpzBays) {
    if (b.bay_role === 'COUPLER') {
      couplerBaysByRef.set(b.ref_id, b);
    }
  }

  const sections: GpzSectionDescriptor[] = gpzSections.map((sec) =>
    sectionFromGpzSection(sec, gpzBays, branches, buses, substations, gpz, lvVoltageKv),
  );

  const couplers: GpzCouplerDescriptor[] = [];
  /* Każda granica między sekcją i (i+1) — sprzęgło, jeśli right_coupler_ref bay
   * istnieje i bay_role==='COUPLER'. */
  for (let i = 0; i < gpzSections.length - 1; i++) {
    const left = gpzSections[i];
    const right = gpzSections[i + 1];
    const couplerRef = left.right_coupler_ref ?? right.left_coupler_ref;
    if (!couplerRef) continue;
    const couplerBay = couplerBaysByRef.get(couplerRef);
    if (!couplerBay) continue;
    couplers.push({
      couplerId: couplerBay.ref_id,
      leftSectionId: left.section_id,
      rightSectionId: right.section_id,
      designation: couplerBay.name || couplerBay.ref_id,
      /* INVARIANT 9: brak danych telemetrii ≠ default 'closed'. ENM Bay
       * obecnie nie modeluje runtime switching state — adapter zwraca
       * 'unknown', renderer wyświetli neutral szary. Gdy ENM zostanie
       * rozszerzony o BayCanonicalModel.runtime_state.cb_switch_state,
       * adapter będzie czytać prawdziwy stan. */
      closed: 'unknown',
    });
  }

  return { sections, couplers };
}

function sectionFromGpzSection(
  sec: GPZSection,
  gpzBays: readonly Bay[],
  branches: readonly Branch[],
  buses: readonly Bus[],
  substations: readonly Substation[],
  gpz: Substation,
  fallbackVoltageKv: number,
): GpzSectionDescriptor {
  const sectionBus = buses.find((b) => b.ref_id === sec.bus_ref);
  const sectionVoltageKv = sectionBus?.voltage_kv ?? fallbackVoltageKv;

  const sectionBays = gpzBays
    .filter((b) => b.gpz_section_id === sec.section_id)
    .filter((b) => b.bay_role !== 'COUPLER'); // sprzęgła traktujemy osobno

  const bayDescriptors: GpzBayDescriptor[] = sectionBays.map((b) =>
    bayDescriptorFromEnm(b, branches, substations, gpz),
  );

  return {
    sectionId: sec.section_id,
    order: sec.order,
    name: sec.name ?? `Sekcja ${sec.order}`,
    sectionLabel: sec.name ?? `S${sec.order}`,
    busVoltageKv: sectionVoltageKv,
    bays: bayDescriptors,
  };
}

function bayDescriptorFromEnm(
  bay: Bay,
  branches: readonly Branch[],
  substations: readonly Substation[],
  gpz: Substation,
): GpzBayDescriptor {
  const fieldRole = ENM_BAY_ROLE_TO_FIELD_ROLE[bay.bay_role] ?? FIELD_ROLE.GPZ_LINE_BAY;

  /* Outgoing feeder: dla bay_role IN/OUT/FEEDER szukaj branch wychodzący z
   * bus_ref bay'a do innej stacji. Cel = nazwa stacji docelowej.
   *
   * INVARIANT 9: `energized` pozostaje UNDEFINED — adapter nie zna stanu
   * SCADA telemetry (TODO przyszły kanał `BayCanonicalModel.runtime_state`).
   * Renderer wyświetli neutral kolor (`COLOR_FIELD_TRUNK_NEUTRAL`) gdy
   * brak danych zamiast fałszywego zielonego "pod napięciem".
   */
  /* Phase 0A audit fix 10/12: outgoingFeeder STRICT z ENM `outgoing_destination_ref`.
   * Eliminacja heurystyki `inferOutgoingFeederDestination` (audyt SLD §C.2).
   * Brak ENM ref → undefined (Invariant 9: brak danych ≠ wnioskowanie z grafu).
   * Wnioskowanie graph-based zachowane jako opt-in fallback przez flagę
   * env (przyszłe rozszerzenie). */
  let outgoingFeeder: GpzBayDescriptor['outgoingFeeder'] | undefined;
  const isLineRole = bay.bay_role === 'OUT' || bay.bay_role === 'FEEDER' || bay.bay_role === 'IN';
  if (isLineRole) {
    const explicitRef = bay.outgoing_destination_ref;
    if (explicitRef) {
      const target = substations.find((s) => s.ref_id === explicitRef);
      const destination = target?.name ?? explicitRef;
      outgoingFeeder = { destination: `→ ${destination}` };
    } else {
      /* Backward compat: gdy ENM nie ma `outgoing_destination_ref` (np.
       * legacy ENM przed Phase 0A audit fix 8), użyj graph inference jako
       * fallback. Phase 1+ — usunąć całkowicie i wymuszać explicit ENM. */
      const destination = inferOutgoingFeederDestination(bay, branches, substations, gpz);
      if (destination) {
        outgoingFeeder = { destination: `→ ${destination}` };
      }
    }
  }

  /* Phase 0A audit fix 8/8: konsumpcja nowych pól ENM Bay:
   * - bay_number → renderer wyświetla pod kolumną (kanoniczny ID dyspozytorski).
   * - feeder_short_name → UI label feedera (NIE bay.name — które jest długie).
   *
   * esState: większość pól GPZ klasy A ma uziemnik (BHP). Wnioskujemy z field
   * role gdy ENM nie ma explicit telemetry. Sprzęgło COUPLER zwykle bez ES.
   * Stan → 'unknown' (Invariant 9).
   *
   * qDesignations: kanon IEC 81346-2 — generowane deterministycznie z roli.
   */
  const hasEs = isLineRole || bay.bay_role === 'TR' || bay.bay_role === 'MEASUREMENT';
  const esState: GpzBayDescriptor['esState'] = hasEs ? 'unknown' : 'absent';

  return {
    bayRef: bay.ref_id,
    fieldRole,
    designation: bay.name || bay.ref_id,
    feederName: bay.feeder_short_name ?? bay.name ?? undefined,
    bayNumber: bay.bay_number ?? undefined,
    hasMissingRequiredDevice: (bay.equipment_refs?.length ?? 0) === 0,
    esState,
    qDesignations: deriveQDesignations(bay.bay_role),
    outgoingFeeder,
  };
}

/**
 * Wnioskuje kanoniczne oznaczenia IEC 81346-2 z roli pola.
 * Konwencja polskich GPZ: Q0=CB, Q1=DS_BUS, Q9=DS_LIN, Q8=ES, T1=CT.
 */
function deriveQDesignations(bayRole: Bay['bay_role']): GpzBayDescriptor['qDesignations'] {
  switch (bayRole) {
    case 'OUT':
    case 'IN':
    case 'FEEDER':
      return { cb: 'Q0', ds: 'Q9', dsBus: 'Q1', es: 'Q8', ct: 'T1' };
    case 'TR':
      return { cb: 'Q0', ds: 'Q1', es: 'Q8', ct: 'T1' };
    case 'COUPLER':
      return { cb: 'Q0', ds: 'Q1', ct: 'T1' };
    case 'MEASUREMENT':
      return { ds: 'Q1', es: 'Q8' };
    case 'OZE':
      return { cb: 'Q0', ds: 'Q9', es: 'Q8', ct: 'T1' };
    default:
      return undefined;
  }
}

function inferOutgoingFeederDestination(
  bay: Bay,
  branches: readonly Branch[],
  substations: readonly Substation[],
  gpz: Substation,
): string | null {
  /* Branche dotykające busa pola — jedna z końcówek == bay.bus_ref. */
  for (const br of branches) {
    if (br.from_bus_ref !== bay.bus_ref && br.to_bus_ref !== bay.bus_ref) continue;
    const otherBusRef = br.from_bus_ref === bay.bus_ref ? br.to_bus_ref : br.from_bus_ref;
    /* Stacja zawierająca otherBusRef. */
    const dest = substations.find(
      (s) => s.ref_id !== gpz.ref_id && s.bus_refs.includes(otherBusRef),
    );
    if (dest) return dest.name || dest.ref_id;
  }
  return null;
}

/**
 * Wnioskuje napięcie strony HV GPZ z dostępnych danych ENM.
 *
 * Reguła deterministyczna (audyt MV §6 BLOCKER-29: zero heurystyk):
 *   1) Trafo skojarzony z GPZ przez `transformer_refs` ma `uhv_kv` → użyj.
 *   2) Bus po stronie HV trafa (`tr.hv_bus_ref`) ma `voltage_kv` → użyj.
 *   3) Brak danych → `null` (Invariant 9: brak danych ≠ 110 kV default).
 *
 * Eliminacja heurystyki "voltage_kv > 30" (niejednoznaczne dla 30 kV
 * wytwórców). Zwracane null sygnalizuje renderowi brak danych — UI pokaże
 * placeholder zamiast fałszywego "110 kV".
 */
function inferHvVoltageKv(
  transformers: readonly Transformer[],
  gpz: Substation,
  buses: readonly Bus[],
): number | null {
  const ownTransformers = transformers.filter((tr) =>
    gpz.transformer_refs?.includes(tr.ref_id),
  );
  /* (1) Wprost z trafo: uhv_kv. */
  for (const tr of ownTransformers) {
    if (tr.uhv_kv) return tr.uhv_kv;
  }
  /* (2) Z busa po stronie HV trafa. */
  for (const tr of ownTransformers) {
    if (!tr.hv_bus_ref) continue;
    const hvBus = buses.find((b) => b.ref_id === tr.hv_bus_ref);
    if (hvBus?.voltage_kv) return hvBus.voltage_kv;
  }
  return null;
}

function findFirstBusByRefs(buses: readonly Bus[], busRefs: readonly string[]): Bus | null {
  for (const ref of busRefs) {
    const bus = buses.find((b) => b.ref_id === ref);
    if (bus) return bus;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Sections (GPZ szyny SN)
// -----------------------------------------------------------------------------

function buildSections(snapshot: EnergyNetworkModel): SectionRendererProps[] {
  const substations = snapshot.substations ?? [];
  const buses = snapshot.buses ?? [];
  const sectionList: SectionRendererProps[] = [];

  for (const gpz of substations.filter((s) => s.station_type === 'gpz')) {
    const sections = gpz.gpz_sections ?? [];
    if (sections.length === 0) continue;

    const sortedSections = [...sections].sort((a, b) => a.order - b.order);

    sortedSections.forEach((sec, idx) => {
      const bus = buses.find((b) => b.ref_id === sec.bus_ref);
      const voltageKv = bus?.voltage_kv ?? 15;
      // Liczba pól dla danej sekcji = liczba bay'ów odwołujących się do tej sekcji.
      const bayCount = (snapshot.bays ?? []).filter(
        (b) => b.gpz_section_id === sec.section_id,
      ).length;
      sectionList.push({
        id: `${gpz.ref_id}__${sec.section_id}`,
        x: SECTION_X_BASE + idx * SECTION_PITCH,
        y: Y_SECTIONS,
        number: sec.order,
        busVoltageKv: voltageKv,
        bayCount,
      });
    });
    void SECTION_WIDTH;
  }
  return sectionList;
}

// -----------------------------------------------------------------------------
// Stations (na ciągach)
// -----------------------------------------------------------------------------

function buildStations(snapshot: EnergyNetworkModel): StationOnRunRendererProps[] {
  const substations = snapshot.substations ?? [];
  const stations: StationOnRunRendererProps[] = [];

  // Stacje typu mv_lv / inline / branch / terminal / sectional → wzdłuż ciągu.
  const fieldStations = substations.filter((s) =>
    ['mv_lv', 'inline', 'branch', 'terminal', 'sectional', 'switching', 'customer'].includes(
      s.station_type,
    ),
  );

  fieldStations.forEach((st, idx) => {
    const runIndex = Math.floor(idx / 5); // 5 stacji per ciąg, potem nowy kanał Y
    const positionInRun = idx % 5;
    stations.push({
      id: st.ref_id,
      x: X_STATIONS_START + positionInRun * STATION_PITCH,
      y: Y_RUN_BASE + runIndex * RUN_PITCH,
      name: st.name || st.ref_id,
      topologicalType: classifyTopologicalType(st),
      nnVoltageLevelsCount: 1,
    });
  });

  return stations;
}

function classifyTopologicalType(
  s: Substation,
): StationOnRunRendererProps['topologicalType'] {
  switch (s.station_type) {
    case 'terminal':
      return 'końcowa';
    case 'inline':
      return 'przelotowa';
    case 'branch':
      return 'odgałęźna';
    case 'sectional':
      return 'sekcyjna';
    default:
      return 'końcowa';
  }
}

// -----------------------------------------------------------------------------
// Cable runs (kable + linie napowietrzne SN)
// -----------------------------------------------------------------------------

function buildCableRuns(
  snapshot: EnergyNetworkModel,
  logicalViews: LogicalViewsV1 | null,
): CableRunRendererPropsLight[] {
  const branches = (snapshot.branches ?? []).filter(isCableLikeBranch);
  const runs: CableRunRendererPropsLight[] = [];

  if (logicalViews && logicalViews.trunks.length > 0) {
    // Dla każdego trunku — pojedynczy widoczny ciąg główny.
    logicalViews.trunks.forEach((trunk, idx) => {
      const segments = trunk.segments
        .map((segId) => branches.find((b) => b.ref_id === segId))
        .filter((b): b is Branch => Boolean(b));
      if (segments.length === 0) return;

      const y = Y_RUN_BASE + idx * RUN_PITCH;
      const xStart = SECTION_X_BASE + 60;
      const xEnd = X_STATIONS_START + 5 * STATION_PITCH;
      const segmentKind = classifySegmentKind(segments[0]);

      runs.push({
        id: trunk.corridor_ref,
        runKind: 'main_trunk',
        segmentKind,
        pathPoints: [
          { x: xStart, y: Y_SECTIONS + 40 },
          { x: xStart, y },
          { x: xEnd, y },
        ],
      });
    });

    // Odgałęzienia (branches).
    logicalViews.branches.forEach((br, brIdx) => {
      const segments = br.segments
        .map((segId) => branches.find((b) => b.ref_id === segId))
        .filter((b): b is Branch => Boolean(b));
      if (segments.length === 0) return;
      const segmentKind = classifySegmentKind(segments[0]);
      const yBranch = Y_RUN_BASE + (logicalViews.trunks.length + brIdx) * RUN_PITCH;
      const xStart = X_STATIONS_START + brIdx * STATION_PITCH;

      runs.push({
        id: br.branch_id,
        runKind: 'branch',
        segmentKind,
        pathPoints: [
          { x: xStart, y: Y_RUN_BASE - 10 },
          { x: xStart, y: yBranch },
          { x: xStart + 3 * STATION_PITCH, y: yBranch },
        ],
      });
    });
    return runs;
  }

  // Fallback: każda branch → osobna prosta linia (nie ma logical_views).
  branches.forEach((b, idx) => {
    runs.push({
      id: b.ref_id,
      runKind: 'main_trunk',
      segmentKind: classifySegmentKind(b),
      pathPoints: [
        { x: SECTION_X_BASE + 60, y: Y_SECTIONS + 40 + idx * 4 },
        { x: SECTION_X_BASE + 60, y: Y_RUN_BASE + idx * RUN_PITCH },
        { x: X_STATIONS_START + 4 * STATION_PITCH, y: Y_RUN_BASE + idx * RUN_PITCH },
      ],
    });
  });

  return runs;
}

// -----------------------------------------------------------------------------
// DERs (PV/BESS/FW)
// -----------------------------------------------------------------------------

function buildDers(
  snapshot: EnergyNetworkModel,
  stations: readonly StationOnRunRendererProps[],
): DerRendererProps[] {
  const generators = snapshot.generators ?? [];
  const ders: DerRendererProps[] = [];

  for (const gen of generators) {
    const kind = mapGenTypeToDerKind(gen);
    if (!kind) continue;
    const stationRef = gen.station_ref ?? null;
    const station = stationRef ? stations.find((s) => s.id === stationRef) : null;
    const baseX = station ? station.x + DER_OFFSET_RIGHT : 800;
    const baseY = station ? station.y + 60 : Y_RUN_BASE + 60;

    ders.push({
      id: gen.ref_id,
      x: baseX,
      y: baseY,
      kind,
      name: gen.name || gen.ref_id,
      nominalPowerKw: (gen.p_mw ?? 0) * 1000,
      hasBlockTransformer: gen.connection_variant === 'block_transformer',
    });
  }
  return ders;
}

function mapGenTypeToDerKind(gen: Generator): DerRendererProps['kind'] | null {
  switch (gen.gen_type) {
    case 'pv_inverter':
      return 'PV';
    case 'bess':
      return 'BESS';
    case 'wind_inverter':
    case 'fw_pmsg':
    case 'fw_dfig':
    case 'fw_scig':
      return 'FW';
    default:
      return null;
  }
}
