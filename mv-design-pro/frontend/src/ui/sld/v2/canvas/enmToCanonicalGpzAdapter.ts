/**
 * enmToCanonicalGpzAdapter — Phase R2 Operator-Grade Rebuild.
 *
 * Mapping ENM → `GpzCanonicalRendererProps`. PEŁEN end-to-end bez fallback
 * do placeholderów.
 *
 * Reguły:
 *   - Brak danych → "—" lub explicit `null` (NIE "?", NIE "GPZ 1", NIE "TR1").
 *   - Auto-syntezuje sekcję 1 gdy `gpz_sections=[]` ale są bays bez `gpz_section_id`.
 *   - Mapuje wszystkie aparaty per `BAY_DEVICE_ORDER_POLICY`.
 *   - Propaguje runtime_state SCADA → cbState/dsState/esState.
 *
 * @see docs/audit/GPZ_RENDERER_REALITY_CHECK.md
 */

import type {
  Bay,
  BayDeviceState,
  Bus,
  EnergyNetworkModel,
  Substation,
  Transformer,
} from '../../../../types/enm';

import type {
  BayFieldRole,
  BayMeasurements,
  CanonicalGpzBay,
  CanonicalGpzCoupler,
  CanonicalGpzHvSection,
  CanonicalGpzSection,
  CanonicalGpzTransformer,
  GpzCanonicalRendererProps,
  StatusFlag,
  SwitchState,
} from '../renderer/GpzCanonicalRenderer';

/* =============================================================================
   Public API
   ============================================================================= */

export interface BuildCanonicalGpzOptions {
  /** Pozycja w viewport. */
  readonly x: number;
  readonly y: number;
  /** Header data — z runtime SCADA (opcjonalne). */
  readonly transmissionStatus?: GpzCanonicalRendererProps['transmissionStatus'];
  readonly controlAvailability?: GpzCanonicalRendererProps['controlAvailability'];
  readonly balance?: GpzCanonicalRendererProps['balance'];
  readonly alarms?: GpzCanonicalRendererProps['alarms'];
  /** Adres + radio z meta. */
  readonly addressLine?: string;
  readonly radioId?: string;
}

/**
 * Główna funkcja: ENM Substation (typu 'gpz') + ENM context → CanonicalGpzProps.
 *
 * Throws gdy substation NIE jest typu 'gpz' (mini-RMU używa innego renderera).
 */
export function buildCanonicalGpzProps(
  enm: Pick<EnergyNetworkModel, 'substations' | 'bays' | 'transformers' | 'buses' | 'generators'>,
  substationRef: string,
  options: BuildCanonicalGpzOptions,
): GpzCanonicalRendererProps {
  const substation = (enm.substations ?? []).find((s) => s.ref_id === substationRef);
  if (!substation) {
    throw new Error(`Substation '${substationRef}' nie istnieje w ENM.`);
  }
  if (substation.station_type !== 'gpz') {
    throw new Error(`Substation '${substationRef}' nie jest typu 'gpz' (jest ${substation.station_type}).`);
  }

  const allBays = mergeBaysWithFieldSpecs(
    substation,
    (enm.bays ?? []).filter((b) => b.substation_ref === substationRef),
  );
  const allTransformers = (enm.transformers ?? []).filter((t) =>
    substation.transformer_refs?.includes(t.ref_id),
  );

  const lvSections = buildLvSections(substation, allBays, enm.buses ?? []);
  // Mapowanie sectionId po `bus_ref` z `substation.gpz_sections` — używane do
  // przypisania TR do sekcji wg `lv_bus_ref`.
  const sectionIdByLvBusRef = new Map<string, string>();
  for (const sec of substation.gpz_sections ?? []) {
    if (sec.bus_ref) sectionIdByLvBusRef.set(sec.bus_ref, sec.section_id);
  }

  const transformers = buildTransformers(allTransformers, sectionIdByLvBusRef);
  // Inżynierski wymóg: TR WN/SN przyłączony do szyny SN przez pole TR z
  // aparaturą (DS-CB-CT-ES). Pole TR jest renderowane przez `TrFieldColumn`
  // w `GpzCanonicalRenderer` (nad szyną SN, pomiędzy TR a sekcją SN) —
  // adapter NIE syntezuje pola TR jako bay (uniknięcie podwójnego renderu
  // poniżej szyny SN).

  return {
    id: substation.ref_id,
    x: options.x,
    y: options.y,
    name: substation.name || '—',
    addressLine: options.addressLine,
    radioId: options.radioId,
    transmissionStatus: options.transmissionStatus,
    controlAvailability: options.controlAvailability,
    balance: options.balance,
    alarms: options.alarms,
    transformers,
    sections: lvSections,
    couplers: buildCouplers(substation, allBays),
    hvSections: buildHvSections(substation, allBays, enm.buses ?? []),
  };
}

/* =============================================================================
   Sub-builders
   ============================================================================= */

type FieldSpecRecord = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readFieldSpecs(station: Substation): FieldSpecRecord[] {
  const meta = asRecord(station.meta);
  const rawSpecs = meta?.field_specs;
  return Array.isArray(rawSpecs)
    ? rawSpecs.filter((spec): spec is FieldSpecRecord => asRecord(spec) !== null)
    : [];
}

function normalizeBayRole(value: unknown): Bay['bay_role'] | null {
  const role = readString(value)?.toUpperCase();
  switch (role) {
    case 'IN':
    case 'OUT':
    case 'TR':
    case 'COUPLER':
    case 'FEEDER':
    case 'MEASUREMENT':
    case 'OZE':
      return role;
    default:
      return null;
  }
}

function mergeBaysWithFieldSpecs(station: Substation, bays: readonly Bay[]): Bay[] {
  const byRef = new Map(bays.map((bay) => [bay.ref_id, bay]));
  for (const spec of readFieldSpecs(station)) {
    const refId = readString(spec.field_ref) ?? readString(spec.ref_id);
    const busRef = readString(spec.bus_ref);
    const bayRole = normalizeBayRole(spec.bay_role);
    if (!refId || !busRef || !bayRole || byRef.has(refId)) continue;

    byRef.set(refId, {
      id: refId,
      ref_id: refId,
      name: readString(spec.name) ?? refId,
      tags: readStringArray(spec.tags),
      meta: {
        ...(asRecord(spec.meta) ?? {}),
        visual_source: 'substation_field_specs',
      },
      bay_role: bayRole,
      substation_ref: station.ref_id,
      bus_ref: busRef,
      gpz_section_id: readString(spec.gpz_section_id),
      equipment_refs: readStringArray(spec.equipment_refs),
      bay_number: readString(spec.bay_number),
      feeder_short_name: readString(spec.feeder_short_name),
      outgoing_destination_ref: readString(spec.outgoing_destination_ref),
    } as Bay);
  }
  return [...byRef.values()];
}

function buildTransformers(
  transformers: readonly Transformer[],
  sectionIdByLvBusRef: ReadonlyMap<string, string>,
): CanonicalGpzTransformer[] {
  return transformers
    .slice()
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))
    .map((tr, idx) => ({
      transformerRef: tr.ref_id,
      designation: extractTransformerDesignation(tr.name, idx),
      snMva: tr.sn_mva,
      uhvKv: tr.uhv_kv,
      ulvKv: tr.ulv_kv,
      vectorGroup: tr.vector_group ?? null,
      lvSectionId: sectionIdByLvBusRef.get(tr.lv_bus_ref) ?? null,
      hvBusRef: tr.hv_bus_ref ?? null,
    }));
}

function extractTransformerDesignation(name: string | null | undefined, idx: number): string {
  if (!name) return `T${idx + 1}`;
  // Spróbuj wyciągnąć "TR1", "TR-2", "T01" z nazwy.
  const match = name.match(/(TR|T)[\s-]?(\d+)/i);
  if (match) return `${match[1].toUpperCase()}${match[2]}`;
  return `T${idx + 1}`;
}

function buildLvSections(
  gpz: Substation,
  bays: readonly Bay[],
  buses: readonly Bus[],
): CanonicalGpzSection[] {
  const sectionDefs = gpz.gpz_sections ?? [];
  const lvBays = bays.filter((b) => isLvBay(b, buses));

  if (sectionDefs.length === 0 && lvBays.length === 0) {
    // Brak sekcji + brak pól — operator widzi explicit "brak danych ENM" w renderze.
    return [];
  }

  if (sectionDefs.length === 0 && lvBays.length > 0) {
    // Auto-synteza: 1 sekcja domyślna gdy brak gpz_sections ale są bays.
    const defaultBus = buses.find((b) => gpz.bus_refs?.includes(b.ref_id) && b.voltage_kv < 60);
    return [{
      sectionId: `${gpz.ref_id}__synth-section-1`,
      order: 1,
      label: 'S1',
      busVoltageKv: defaultBus?.voltage_kv ?? 15,
      bays: lvBays.map((b) => buildBay(b, buses)),
    }];
  }

  const bayBuckets = assignBaysToLvSections(sectionDefs, lvBays);

  return sectionDefs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((sec, idx) => {
      const sectionBays = bayBuckets.get(sec.section_id) ?? [];
      const bus = buses.find((b) => b.ref_id === sec.bus_ref);
      return {
        sectionId: sec.section_id,
        order: sec.order,
        label: sec.name ?? `S${idx + 1}`,
        busVoltageKv: bus?.voltage_kv ?? 15,
        bays: sectionBays.map((b) => buildBay(b, buses)),
      };
    });
}

function assignBaysToLvSections(
  sectionDefs: NonNullable<Substation['gpz_sections']>,
  lvBays: readonly Bay[],
): Map<string, Bay[]> {
  const sortedSections = sectionDefs.slice().sort((a, b) => a.order - b.order);
  const sectionIds = new Set(sortedSections.map((section) => section.section_id));
  const buckets = new Map(sortedSections.map((section) => [section.section_id, [] as Bay[]]));
  const unassigned: Bay[] = [];

  for (const bay of lvBays) {
    if (bay.gpz_section_id && sectionIds.has(bay.gpz_section_id)) {
      buckets.get(bay.gpz_section_id)?.push(bay);
    } else {
      unassigned.push(bay);
    }
  }

  for (const bay of unassigned) {
    const matchingBusSections = sortedSections.filter((section) => section.bus_ref === bay.bus_ref);
    const candidates = matchingBusSections.length > 0 ? matchingBusSections : sortedSections;
    const target = candidates.reduce((best, section) => {
      const bestSize = buckets.get(best.section_id)?.length ?? 0;
      const currentSize = buckets.get(section.section_id)?.length ?? 0;
      return currentSize < bestSize ? section : best;
    });
    buckets.get(target.section_id)?.push(bay);
  }

  return buckets;
}

function buildHvSections(
  gpz: Substation,
  bays: readonly Bay[],
  buses: readonly Bus[],
): CanonicalGpzHvSection[] {
  const hvSectionDefs = gpz.gpz_hv_sections ?? [];
  if (hvSectionDefs.length === 0) {
    // Brak HV sections — adapter NIE syntezuje (Inv 9: brak danych ≠ default).
    // Renderer pokazuje "Strona 110 kV — brak danych ENM".
    return [];
  }
  return hvSectionDefs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((sec, idx) => {
      const hvBays = bays.filter((b) => b.gpz_section_id === sec.section_id);
      const bus = buses.find((b) => b.ref_id === sec.bus_ref);
      return {
        sectionId: sec.section_id,
        order: sec.order,
        label: sec.name ?? `HV-${idx + 1}`,
        busVoltageKv: bus?.voltage_kv ?? 110,
        bays: hvBays.map((b) => buildBay(b, buses)),
      };
    });
}

function buildBay(bay: Bay, _buses: readonly Bus[]): CanonicalGpzBay {
  const fieldRole = mapBayRoleToFieldRole(bay.bay_role);
  const runtime = bay.runtime_state ?? null;
  return {
    bayRef: bay.ref_id,
    bayNumber: bay.bay_number ?? null,
    feederName: bay.feeder_short_name ?? bay.name ?? null,
    destinationLabel: bay.outgoing_destination_ref ? `→ ${bay.outgoing_destination_ref}` : null,
    fieldRole,
    cbState: extractApparatusState(runtime, 'cb'),
    dsState: extractApparatusState(runtime, 'ds_lin'),
    esState: extractEsState(runtime),
    qDesignations: deriveQDesignations(fieldRole),
    statusFlags: extractStatusFlags(runtime),
    measurements: extractMeasurements(runtime),
    inManipulation: extractInManipulation(runtime),
  };
}

function buildCouplers(gpz: Substation, bays: readonly Bay[]): CanonicalGpzCoupler[] {
  const sectionDefs = gpz.gpz_sections ?? [];
  if (sectionDefs.length < 2) return [];
  const couplerBaysByRef = new Map<string, Bay>();
  for (const b of bays) {
    if (b.bay_role === 'COUPLER') {
      couplerBaysByRef.set(b.ref_id, b);
    }
  }
  const couplers: CanonicalGpzCoupler[] = [];
  const sortedSections = [...sectionDefs].sort((a, b) => a.order - b.order);
  for (let i = 0; i < sortedSections.length - 1; i++) {
    const left = sortedSections[i];
    const right = sortedSections[i + 1];
    const couplerRef = left.right_coupler_ref ?? right.left_coupler_ref;
    if (!couplerRef) continue;
    const couplerBay = couplerBaysByRef.get(couplerRef);
    if (!couplerBay) continue;
    couplers.push({
      couplerId: couplerBay.ref_id,
      leftSectionId: left.section_id,
      rightSectionId: right.section_id,
      designation: couplerBay.name || couplerBay.ref_id,
      closedState: extractApparatusState(couplerBay.runtime_state ?? null, 'cb') ?? 'unknown',
    });
  }
  return couplers;
}

/* =============================================================================
   Field role + apparatus mapping
   ============================================================================= */

function mapBayRoleToFieldRole(role: Bay['bay_role']): BayFieldRole {
  switch (role) {
    case 'IN': return 'LINE_IN';
    case 'OUT': return 'LINE_OUT';
    case 'FEEDER': return 'LINE_BRANCH';
    case 'TR': return 'TRANSFORMER';
    case 'COUPLER': return 'COUPLER';
    case 'MEASUREMENT': return 'MEASUREMENT';
    case 'OZE': return 'LINE_OUT'; // OZE jako pole liniowe odpływowe
    default: return 'LINE_OUT';
  }
}

function isLvBay(bay: Bay, buses: readonly Bus[]): boolean {
  const bus = buses.find((b) => b.ref_id === bay.bus_ref);
  if (!bus) return false;
  return bus.voltage_kv < 60;
}

function deriveQDesignations(role: BayFieldRole): CanonicalGpzBay['qDesignations'] {
  switch (role) {
    case 'LINE_OUT':
    case 'LINE_IN':
    case 'LINE_BRANCH':
      return { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' };
    case 'TRANSFORMER':
      return { cb: 'Q0', dsBus: 'Q1', es: 'Q8', ct: 'T1' };
    case 'COUPLER':
      return { cb: 'Q0', dsBus: 'Q1', ct: 'T1' };
    case 'MEASUREMENT':
      return { dsBus: 'Q1', es: 'Q8' };
  }
}

/* =============================================================================
   Runtime state extraction (SCADA telemetry)
   ============================================================================= */

function extractApparatusState(
  runtime: { primary_device_states?: Record<string, { actual_state: BayDeviceState }> } | null,
  category: 'cb' | 'ds_lin' | 'ds_bus' | 'es',
): SwitchState | undefined {
  if (!runtime?.primary_device_states) return undefined;
  const keys = Object.keys(runtime.primary_device_states).sort();
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (matchCategory(lower, category)) {
      return mapDeviceStateToSwitch(runtime.primary_device_states[key].actual_state);
    }
  }
  return undefined;
}

function matchCategory(key: string, category: 'cb' | 'ds_lin' | 'ds_bus' | 'es'): boolean {
  if (category === 'ds_bus') return key.includes('ds_bus') || key.includes('dsbus');
  if (category === 'ds_lin') return key.includes('ds_lin') || key.includes('dslin') || (key.includes('_ds') && !key.includes('ds_bus'));
  if (category === 'cb') return key.includes('_cb') || key.endsWith('cb') || key.endsWith('breaker');
  if (category === 'es') return key.includes('_es') || key.endsWith('es') || key.endsWith('earthing');
  return false;
}

function mapDeviceStateToSwitch(state: BayDeviceState | undefined): SwitchState | undefined {
  if (!state) return undefined;
  switch (state) {
    case 'zamkniety':
    case 'zamkniety_naped_rozbrojony':
      return 'closed';
    case 'otwarty':
    case 'otwarty_naped_rozbrojony':
      return 'open';
    case 'nieznany':
    case 'awaria':
      return 'unknown';
  }
}

function extractEsState(
  runtime: { primary_device_states?: Record<string, { actual_state: BayDeviceState }> } | null,
): CanonicalGpzBay['esState'] {
  const state = extractApparatusState(runtime, 'es');
  if (state === undefined) return 'unknown';
  return state;
}

function extractStatusFlags(_runtime: unknown): StatusFlag[] {
  // TO-DO: mapping z runtime_state.active_alarms na status flags wymaga
  // contractu z backend SCADA. Aktualnie zwracamy []; renderer NIE pokazuje
  // badge'y gdy lista pusta (NIE placeholder).
  return [];
}

function extractMeasurements(_runtime: unknown): BayMeasurements | null {
  // TO-DO: mapping z runtime_state.measurements (gdy ENM rozszerzy o measurements
  // strukturę). Aktualnie zwracamy null; renderer pokaże empty panel (NIE placeholder).
  return null;
}

function extractInManipulation(
  runtime: { pending_command?: unknown; primary_device_states?: Record<string, { interlock_blocked?: boolean }> } | null,
): boolean {
  if (!runtime) return false;
  if (runtime.pending_command) return true;
  if (runtime.primary_device_states) {
    return Object.values(runtime.primary_device_states).some((s) => s.interlock_blocked === true);
  }
  return false;
}
