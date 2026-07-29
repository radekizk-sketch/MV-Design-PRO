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
  Branch,
  Bus,
  EnergyNetworkModel,
  Source,
  Substation,
  Transformer,
} from '../../../../types/enm';
import {
  getMetric,
  type RawOverlayPayload,
} from '../../../sld-overlay/rawResultOverlayStore';

import type {
  BayFieldRole,
  BayMeasurements,
  CanonicalGpzBay,
  CanonicalGpzBusVt,
  CanonicalGpzCoupler,
  CanonicalGpzHvSection,
  CanonicalGpzHvSystemSource,
  CanonicalGpzSection,
  CanonicalGpzTransformer,
  GpzCanonicalRendererProps,
  StatusFlag,
  SwitchState,
} from '../renderer/GpzCanonicalRenderer';
// F11.1 (SLD_CAD_SPEC_V3 §17.2/§18.3/§20.1, rejestr device-ref w GPZ):
// reużycie WPROST tych samych projekcji co stacje (`buildExplicitStationMiniBays`,
// `enmToSldAdapter.ts`) — jedna prawda ENM Bay → aparat/adnotacja zabezpieczeń,
// zero duplikacji logiki dopasowania `ProtectionAssignment`/`Measurement`.
import {
  projectBayPrimaryDevices,
  resolveBayCtRatingAnnotations,
  resolveBayProtectionMarking,
  resolveBayVtMountings,
} from './enmToSldAdapter';
import { buildOltcAnnotation } from './oltcGlyph';

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
  enm: Pick<
    EnergyNetworkModel,
    | 'substations'
    | 'bays'
    | 'transformers'
    | 'buses'
    | 'generators'
    | 'branches'
    // F11.1 (spec §17.2/§18.3): rejestr device-ref — `protectionMarking`
    // (`Bay.protection_ref` → `ProtectionAssignment`) i `ctRatingAnnotations`
    // (`Measurement`) potrzebują tych dwóch kolekcji, dokładnie jak stacje
    // (`buildExplicitStationMiniBays`, `enmToSldAdapter.ts`). Addytywne —
    // istniejący wywołujący (`buildScene.ts`/`SldWorkspaceContainer.tsx`)
    // przekazuje PEŁNY `EnergyNetworkModel`, więc żaden callsite nie wymaga
    // zmiany.
    | 'protection_assignments'
    | 'measurements'
    // F13.1 (spec §21.1, D3-1): derywacja kolumny WN gdy `gpz_hv_sections`
    // puste czyta `snapshot.sources` (źródło systemowe na szynie GPZ) —
    // addytywne, `buildScene.ts` przekazuje PEŁNY `EnergyNetworkModel`.
    | 'sources'
  >,
  substationRef: string,
  options: BuildCanonicalGpzOptions,
  overlay?: RawOverlayPayload | null,
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

  // F11.1: kontekst rejestru device-ref przekazywany DALEJ do `buildBay` —
  // WYŁĄCZNIE pola faktycznie czytane przez `resolveBayProtectionMarking`/
  // `resolveBayCtRatingAnnotations` (`enmToSldAdapter.ts`).
  const protectionCtx: Pick<EnergyNetworkModel, 'protection_assignments' | 'measurements'> = {
    protection_assignments: enm.protection_assignments ?? [],
    measurements: enm.measurements ?? [],
  };

  const allBranches = enm.branches ?? [];
  const lvSections = buildLvSections(substation, allBays, enm.buses ?? [], allBranches, overlay ?? null, protectionCtx);
  // Mapowanie sectionId po `bus_ref` z `substation.gpz_sections` — używane do
  // przypisania TR do sekcji wg `lv_bus_ref`.
  const sectionIdByLvBusRef = new Map<string, string>();
  for (const sec of substation.gpz_sections ?? []) {
    if (sec.bus_ref) sectionIdByLvBusRef.set(sec.bus_ref, sec.section_id);
  }

  // Reconciliation TR-bay ↔ wieża: gdy transformator ma pole `bay_role:"TR"`
  // (jego ref w `equipment_refs` pola TR), renderuje się WYŁĄCZNIE przez to
  // pole (kolumna Q1→Q0→CT→ES + symbol TR na osi pola). Wieżę (TwoBusTrColumn /
  // HvTowerColumn) wtedy POMIJAMY — eliminacja podwójnej reprezentacji. Gdy
  // transformator NIE ma pola TR (starsze snapshoty) → wieża zostaje (brak
  // regresji). Deterministyczne: czysta funkcja zbioru refów z pól TR.
  const transformerRefsWithTrBay = collectTransformerRefsWithTrBay(allBays);
  const transformers = buildTransformers(
    allTransformers,
    sectionIdByLvBusRef,
    transformerRefsWithTrBay,
  );

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
    // V12K-219: sposób pracy punktu neutralnego sieci SN — z `Bus.grounding`
    // szyny SN GPZ (jedyna szyna stacji o napięciu z pasma SN). Mapowanie 1:1
    // z kanonu ENM, zero domysłu: brak `grounding` daje `null`, a schemat wtedy
    // nie rysuje aparatu uziemiającego.
    snNeutralEarthing: deriveSnNeutralEarthing(substation, enm.buses ?? []),
    couplers: buildCouplers(substation, allBays),
    hvSections: buildHvSections(substation, allBays, enm.buses ?? [], allBranches, overlay ?? null, protectionCtx),
    // F13.1 (spec §21.1): derywacja WYŁĄCZNIE gdy `gpz_hv_sections` puste —
    // ścieżka `hvSectionDefs` (niepuste) jest nadrzędna i NIE potrzebuje tego
    // pola (renderer/compose czyta `hvSections` wprost w tej gałęzi).
    hvSystemSource:
      (substation.gpz_hv_sections ?? []).length === 0
        ? deriveHvSystemSource(substation, enm.buses ?? [], allTransformers, enm.sources ?? [])
        : null,
    // ADAPTER-BUSREF: kanoniczny Bus ref szyny WN GPZ = jedyna szyna
    // `voltage_kv > 60` w `Substation.bus_refs` (TA SAMA derywacja co
    // `deriveHvSystemSource` pkt 2). `null` gdy brak szyny WN (uczciwy brak).
    hvBusRef:
      (enm.buses ?? []).find(
        (b) => substation.bus_refs?.includes(b.ref_id) && b.voltage_kv > 60,
      )?.ref_id ?? null,
  };
}

/**
 * F13.1 (SLD_CAD_SPEC_V3 §21.1, D3-1/D3-8/D3-10): wywodzi dane kolumny WN z
 * relacji PIERWSZOKLASOWYCH ENM — zero zgadywania, brak KTÓREGOKOLWIEK z
 * trzech rekordów (TR WN/SN, szyna WN, `Source` na szynie GPZ) ⇒ `null`
 * (uczciwy brak, `compose/gpz.ts` NIE dopisuje etykiety/tabliczki danych).
 *   1. TR WN/SN = `Substation.transformer_refs` → `snapshot.transformers`
 *      z `uhv_kv > 60`.
 *   2. szyna WN = wpis `Substation.bus_refs` → `snapshot.buses` z
 *      `voltage_kv > 60`.
 *   3. źródło systemowe = `snapshot.sources` z `bus_ref` ∈ `Substation.bus_refs`
 *      (SN lub WN — obie należą do GPZ), nazwa z `meta.source_id` (fallback
 *      `Source.name`).
 */
function deriveHvSystemSource(
  gpz: Substation,
  buses: readonly Bus[],
  gpzTransformers: readonly Transformer[],
  sources: readonly Source[],
): CanonicalGpzHvSystemSource | null {
  const hvTransformer = gpzTransformers.find((tr) => tr.uhv_kv > 60);
  if (!hvTransformer) return null;

  const hvBus = buses.find((b) => gpz.bus_refs?.includes(b.ref_id) && b.voltage_kv > 60);
  if (!hvBus) return null;

  const gpzBusRefs = new Set(gpz.bus_refs ?? []);
  const source = sources.find((s) => s.bus_ref != null && gpzBusRefs.has(s.bus_ref));
  if (!source) return null;

  const name = readString(asRecord(source.meta)?.source_id) ?? readString(source.name);
  if (!name) return null;

  // Recenzja NO-GO 2026-07-17 pkt 2/3: napięcie tabliczki = szyna ŹRÓDŁA
  // (spójność Sk″/Ik″/U), a strona zaczepu podąża za `Source.bus_ref` —
  // ekwiwalent na szynach SN NIE jest rysowany jako przyłącze WN.
  const sourceBus = buses.find((b) => b.ref_id === source.bus_ref) ?? null;
  return {
    sourceRef: source.ref_id,
    name,
    sk3Mva: source.sk3_mva ?? null,
    ik3Ka: source.ik3_ka ?? null,
    voltageKv: sourceBus?.voltage_kv ?? null,
    sourceOnHvBus: source.bus_ref === hvBus.ref_id,
    hvBusVoltageKv: hvBus.voltage_kv ?? null,
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
      protection_codes: readStringArray(spec.protection_codes),
      // F11.1 (spec §17.2, rejestr device-ref w GPZ): `protection_ref` NIE
      // był kopiowany na syntetyzowany `Bay` (znalezisko własne — pole
      // ISTNIEJE na `field_spec` źródłowym, ale ginęło tu cicho), więc
      // `resolveBayProtectionMarking` nigdy nie mogła rozwiązać
      // `ProtectionAssignment` dla pól GPZ budowanych z `field_specs` — nawet
      // gdy dane realnie niosły przypisanie. Naprawa u źródła (addytywna,
      // zero zmiany zachowania na fixturze referencyjnej: `protection_ref`
      // tam `null`).
      protection_ref: readString(spec.protection_ref),
      bay_number: readString(spec.bay_number),
      feeder_short_name: readString(spec.feeder_short_name),
      outgoing_destination_ref: readString(spec.outgoing_destination_ref),
    } as Bay);
  }
  return [...byRef.values()];
}

/**
 * Zbiór ref_id transformatorów, które mają pole `bay_role:"TR"` (transformator
 * w `equipment_refs` pola). Te transformatory renderują się przez pole TR, nie
 * przez wieżę — `buildTransformers` je pomija. Deterministyczne (czysta funkcja).
 */
function collectTransformerRefsWithTrBay(bays: readonly Bay[]): ReadonlySet<string> {
  const refs = new Set<string>();
  for (const bay of bays) {
    if (bay.bay_role !== 'TR') continue;
    for (const ref of bay.equipment_refs ?? []) {
      if (ref) refs.add(ref);
    }
  }
  return refs;
}

function buildTransformers(
  transformers: readonly Transformer[],
  sectionIdByLvBusRef: ReadonlyMap<string, string>,
  transformerRefsWithTrBay: ReadonlySet<string>,
): CanonicalGpzTransformer[] {
  return transformers
    .filter((tr) => !transformerRefsWithTrBay.has(tr.ref_id))
    .slice()
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))
    .map((tr, idx) => ({
      transformerRef: tr.ref_id,
      designation: extractTransformerDesignation(tr.name, idx),
      snMva: tr.sn_mva,
      uhvKv: tr.uhv_kv,
      ulvKv: tr.ulv_kv,
      vectorGroup: tr.vector_group ?? null,
      // Recenzja NO-GO 2026-07-17 pkt 4: uk%/Pk WPROST z ENM (materializacja
      // katalogowa) — tabliczka TR na rysunku bez tych danych była modelowo
      // niekompletna, mimo że model je NIÓSŁ.
      ukPercent: tr.uk_percent ?? null,
      pkKw: tr.pk_kw ?? null,
      lvSectionId: sectionIdByLvBusRef.get(tr.lv_bus_ref) ?? null,
      hvBusRef: tr.hv_bus_ref ?? null,
      // SLD-02 (V12K-091): adnotacja OLTC/DETC z kanonicznego tap_changer
      // (reuse buildOltcAnnotation; null gdy brak regulacji).
      oltc: buildOltcAnnotation(tr.tap_changer),
    }));
}

function extractTransformerDesignation(name: string | null | undefined, idx: number): string {
  if (!name) return `T${idx + 1}`;
  // Spróbuj wyciągnąć "TR1", "TR-2", "T01" z nazwy.
  const match = name.match(/(TR|T)[\s-]?(\d+)/i);
  if (match) return `${match[1].toUpperCase()}${match[2]}`;
  return `T${idx + 1}`;
}

/** F11.1: kontekst rejestru device-ref (`ProtectionAssignment`/`Measurement`),
 *  wyłącznie pola faktycznie czytane przez `resolveBayProtectionMarking`/
 *  `resolveBayCtRatingAnnotations` — wzorzec `BuildCanonicalGpzOptions`. */
type ProtectionCtx = Pick<EnergyNetworkModel, 'protection_assignments' | 'measurements'>;

function buildLvSections(
  gpz: Substation,
  bays: readonly Bay[],
  buses: readonly Bus[],
  branches: readonly Branch[],
  overlay: RawOverlayPayload | null,
  protectionCtx: ProtectionCtx,
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
      // ADAPTER-BUSREF: kanoniczny Bus ref sekcji syntetycznej = szyna SN GPZ
      // (ta sama, z której czytamy `busVoltageKv`). `null` gdy brak.
      busRef: defaultBus?.ref_id ?? null,
      bays: lvBays.map((b) => buildBay(b, buses, branches, overlay, protectionCtx)),
      busVtMeasurements: busVtMeasurementsOf(defaultBus?.ref_id, protectionCtx),
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
        // ADAPTER-BUSREF: kanoniczny Bus ref sekcji WPROST ze snapshotu
        // (`gpz_sections[].bus_ref`) — prymat danych, zero parsowania refów sceny.
        busRef: sec.bus_ref ?? null,
        bays: sectionBays.map((b) => buildBay(b, buses, branches, overlay, protectionCtx)),
        busVtMeasurements: busVtMeasurementsOf(sec.bus_ref, protectionCtx),
      };
    });
}

/**
 * Recenzja NO-GO 2026-07-17 pkt 12 (spec §12.5): VT SZYNY sekcji GPZ —
 * `Measurement{measurement_type:'VT', bus_ref: szyna sekcji}` BEZ `bay_ref`
 * (VT polowe żyją w `resolveBayVtArrangements`, osobny kanał). Zero danych
 * = pusta lista (kompozycja nie fabrykuje pomiaru).
 */
function busVtMeasurementsOf(
  busRef: string | null | undefined,
  protectionCtx: ProtectionCtx,
): CanonicalGpzBusVt[] {
  if (!busRef) return [];
  return (protectionCtx.measurements ?? [])
    .filter((m) => m.measurement_type === 'VT' && m.bus_ref === busRef && !m.bay_ref)
    .map((m) => ({ measurementRef: m.ref_id, arrangement: m.vt_arrangement ?? null }));
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
  branches: readonly Branch[],
  overlay: RawOverlayPayload | null,
  protectionCtx: ProtectionCtx,
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
        bays: hvBays.map((b) => buildBay(b, buses, branches, overlay, protectionCtx)),
      };
    });
}

function buildBay(
  bay: Bay,
  _buses: readonly Bus[],
  branches: readonly Branch[],
  overlay: RawOverlayPayload | null,
  protectionCtx: ProtectionCtx,
): CanonicalGpzBay {
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
    protectionCodes: bay.protection_codes ?? [],
    measurements: extractBayMeasurements(bay, fieldRole, branches, overlay),
    inManipulation: extractInManipulation(runtime),
    // F11.1 (SLD_CAD_SPEC_V3 §17.2/§18.3/§20.1, rejestr device-ref w GPZ —
    // parytet ze stacjami): TA SAMA projekcja co `buildExplicitStationMiniBays`
    // (`enmToSldAdapter.ts`), reużyta wprost (zero duplikacji). Na fixturze
    // referencyjnej `sldSubstrate52s` GPZ niesie 0 `Bay`/`primary_devices`/
    // `protection_assignments`/`measurements` (pola syntetyzowane z
    // `field_specs`, patrz `mergeBaysWithFieldSpecs`) — te trzy pola są tam
    // WSZĘDZIE `undefined`, dowód „brak danych = brak rysunku" (spec §17.2).
    primaryDevices: projectBayPrimaryDevices(bay),
    protectionMarking: resolveBayProtectionMarking(bay, protectionCtx),
    ctRatingAnnotations: resolveBayCtRatingAnnotations(bay, protectionCtx),
    // CTVT-RENDER (spec §20.2, parytet ze stacjami): TA SAMA projekcja montażu
    // VT co `buildExplicitStationMiniBays` — reużyta wprost (zero duplikacji).
    vtMountingAnnotations: resolveBayVtMountings(bay, protectionCtx),
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

/* =============================================================================
   Power-flow overlay → bay measurements (interpretacja wyniku solwera)
   ============================================================================= */

/**
 * Deterministyczne rozwiązanie pola → branch odpływu.
 *
 * NIE zgaduje: zwraca wynik wyłącznie gdy DOKŁADNIE jeden branch pasuje.
 *   - kandydaci = branche, których jeden koniec (from/to) == `bay.bus_ref`,
 *   - jeśli pole ma `outgoing_destination_ref`, zawężamy do kandydatów,
 *     których DRUGI koniec == ten ref (rozstrzygnięcie wieloznaczności),
 *   - dokładnie 1 kandydat → zwróć { branchRef, gpzAtFrom }, w przeciwnym
 *     razie → null (≥2 kandydatów bez disambiguacji lub brak → brak zgadywania).
 *
 * `gpzAtFrom` = czy szyna pola jest endpointem `from_bus_ref` branchu (dokumentuje
 * stronę GPZ; raw overlay i tak ma jedną wartość P/Q/I na element).
 */
export function resolveFeederBranchRef(
  bay: Pick<Bay, 'bus_ref' | 'outgoing_destination_ref'>,
  branches: readonly Branch[],
): { branchRef: string; gpzAtFrom: boolean } | null {
  const busRef = bay.bus_ref;
  if (!busRef) return null;

  let candidates = branches.filter(
    (b) => b.from_bus_ref === busRef || b.to_bus_ref === busRef,
  );

  const destinationRef = bay.outgoing_destination_ref ?? null;
  if (destinationRef) {
    candidates = candidates.filter((b) => {
      const otherEnd = b.from_bus_ref === busRef ? b.to_bus_ref : b.from_bus_ref;
      return otherEnd === destinationRef;
    });
  }

  if (candidates.length !== 1) return null;
  const branch = candidates[0];
  return { branchRef: branch.ref_id, gpzAtFrom: branch.from_bus_ref === busRef };
}

/** Skończona liczba albo null (NIE NaN/Infinity → traktujemy jako brak). */
function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Wypełnia pomiary P/Q/I pola z gotowego raw overlay rozpływu mocy.
 *
 * Interpretacja istniejącego wyniku solwera — BEZ fizyki, BEZ heurystyk:
 *   - tylko pola liniowe (LINE_OUT/LINE_IN/LINE_BRANCH) — pozostałe role nie mają
 *     jednoznacznego pojedynczego branchu odpływu,
 *   - branch musi być rozwiązany jednoznacznie (`resolveFeederBranchRef`),
 *   - czytamy P_MW / Q_Mvar / I_A z overlay; brak metryki → to pole = null,
 *   - mapujemy I_A na `i1A` (rozpływ dodatniej składowej = jedna zbalansowana
 *     wartość prądu; NIE fabrykujemy asymetrii fazowej i2A/i3A ani napięć),
 *   - gdy brak overlay / brak branchu / wszystkie 3 puste → null (panel pusty,
 *     uczciwie).
 */
export function extractBayMeasurements(
  bay: Pick<Bay, 'bus_ref' | 'outgoing_destination_ref'>,
  fieldRole: BayFieldRole,
  branches: readonly Branch[],
  overlay: RawOverlayPayload | null,
): BayMeasurements | null {
  if (!overlay) return null;
  if (fieldRole !== 'LINE_OUT' && fieldRole !== 'LINE_IN' && fieldRole !== 'LINE_BRANCH') {
    return null;
  }

  const resolved = resolveFeederBranchRef(bay, branches);
  if (!resolved) return null;

  const pMw = finiteOrNull(getMetric(overlay, resolved.branchRef, 'P_MW')?.value);
  const qMvar = finiteOrNull(getMetric(overlay, resolved.branchRef, 'Q_Mvar')?.value);
  const i1A = finiteOrNull(getMetric(overlay, resolved.branchRef, 'I_A')?.value);

  if (pMw === null && qMvar === null && i1A === null) return null;

  return { pMw, qMvar, i1A };
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

/**
 * Sposób pracy punktu neutralnego sieci SN z modelu (V12K-219).
 *
 * Szukamy szyny SN tej stacji (napięcie w pasmie SN: 1 kV < U ≤ 60 kV — ta sama
 * granica co `hvBusRef` powyżej, tylko z drugiej strony) i przepisujemy jej
 * `grounding`. Rozstrzygnięcie należy do MODELU: `isolated` to informacja
 * inżynierska (sieć pracuje z izolowanym punktem neutralnym), a BRAK pola to
 * brak danej — te dwa stany nie mogą się zlać, bo prąd zwarcia doziemnego różni
 * się między konfiguracjami o rzędy wielkości.
 */
function deriveSnNeutralEarthing(
  substation: Substation,
  buses: readonly Bus[],
): GpzCanonicalRendererProps['snNeutralEarthing'] {
  const snBus = buses.find(
    (b) => substation.bus_refs?.includes(b.ref_id) && b.voltage_kv > 1 && b.voltage_kv <= 60,
  );
  const g = snBus?.grounding;
  if (!g) return null;
  const kind =
    g.type === 'resistor_grounded'
      ? 'resistor'
      : g.type === 'petersen_coil'
        ? 'coil'
        : g.type === 'directly_grounded'
          ? 'direct'
          : 'isolated';
  return { kind, rOhm: g.r_ohm ?? undefined, xOhm: g.x_ohm ?? undefined };
}
