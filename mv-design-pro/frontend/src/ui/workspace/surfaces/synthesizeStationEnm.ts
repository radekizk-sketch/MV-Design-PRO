/**
 * synthesizeStationEnm (R48) — czysta funkcja konwersji StationWizardDraft
 * na kompletną hierarchię ENM dla fallback'u patchSnapshot.
 *
 * KONTEKST (Zasada 13 + R47 patch):
 *   StationWizardSurface preferuje executeDomainOperation('create-station-complete')
 *   ale gdy backend nie obsługuje tej operacji (lub brak activeCaseId), fallback
 *   musi zapisać KOMPLETNĄ hierarchię do snapshot — bays, buses, transformer, DER.
 *
 *   R47 fallback zapisywał TYLKO Substation z pustym bus_refs/transformer_refs
 *   = silent partial save (HIDDEN BUG). R48 to naprawia.
 *
 * KONTRAKT:
 *   - Wszystkie ref_id deterministycznie z stationRef (powtarzalność dla Inv 4)
 *   - Substation.bus_refs i transformer_refs odzwierciedlają syntetyzowane obiekty
 *   - Bay.substation_ref + bus_ref ustawione na rzeczywiste ref_id z hierarchii
 *   - Transformer.hv_bus_ref + lv_bus_ref ustawione na zsyntezowane szyny
 *   - Generator.bus_ref + station_ref + connection_variant + pcc_ref obecne
 *
 * OGRANICZENIA (świadome):
 *   - parameter_source = 'inline' (nie z katalogu, bo brak HV-SN-LV interpolation w kliencie)
 *   - sn_mva, uk_percent itd. wartości z drafta (mogą być z formularza, nie z backend)
 *   - protection_hints i connections (sn_input/sn_output) zapisywane jako Substation.meta
 *     (do późniejszej rekoncyliacji backend op)
 */

import type {
  Substation,
  Bay,
  Bus,
  Transformer,
  Generator,
  EnergyNetworkModel,
} from '../../../types/enm';

/* =============================================================================
   Draft types (re-export shape z StationWizardSurface)
   ============================================================================= */

export type StationKind = 'rmu' | 'rm6' | 'switching' | 'mv_lv' | 'inline' | 'branch' | 'terminal' | 'sectional' | 'customer';

export interface SynthesizeBayDraft {
  readonly id: string;
  readonly role: 'LINE_FULL' | 'TR_FULL' | 'COUPLER' | 'MEASUREMENT' | 'OZE';
  readonly cbCatalogRef: string;
  readonly cbIcuKa: number;
  readonly dsCatalogRef: string;
  readonly ctCatalogRef: string;
  readonly ctRatio: string;
  readonly hasVt: boolean;
  readonly hasSurgeArrester: boolean;
  readonly hasFuse: boolean;
}

export interface SynthesizeProtectionHintDraft {
  readonly bayId: string;
  readonly relayType: 'overcurrent' | 'earth_fault' | 'differential';
  readonly irNominalA: number;
}

export interface SynthesizeStationDraft {
  // Identyfikacja
  readonly name: string;
  readonly registryNumber: string;
  readonly stationType: StationKind;
  readonly ratedVoltageKv: number;
  readonly producer: string;

  // Pola
  readonly bays: readonly SynthesizeBayDraft[];

  // Transformator
  readonly hasTransformer: boolean;
  readonly transformerCatalogRef: string;
  readonly transformerSnKva: number;
  readonly transformerVectorGroup: string;
  readonly transformerUkPercent: number;

  // nN
  readonly hasLvSide: boolean;
  readonly lvVoltageV: number;
  readonly lvSchemeKind: 'tnc' | 'tncs' | 'tns' | 'tt' | 'it';
  readonly lvMainBreakerCatalogRef: string;

  // DER
  readonly hasDer: boolean;
  readonly derKind: 'PV' | 'BESS' | 'FW' | null;
  readonly derSnKva: number;
  readonly derConnectionVariant: 'lv_behind_tr' | 'dedicated_mv' | 'source_station' | null;
  readonly derPccRef: string;
  readonly derInverterCatalogRef: string;

  // Zabezpieczenia
  readonly protectionHints: readonly SynthesizeProtectionHintDraft[];

  // Powiązania
  readonly snInputSegmentRef: string;
  readonly snOutputSegmentRef: string;
  readonly isNopPoint: boolean;
}

/* =============================================================================
   Synthesize result
   ============================================================================= */

export interface SynthesizedStationEnm {
  readonly substation: Substation;
  readonly bays: readonly Bay[];
  readonly buses: readonly Bus[];
  readonly transformer: Transformer | null;
  readonly generator: Generator | null;
  readonly affectedRefs: readonly string[];
}

/* =============================================================================
   Helpers — deterministic ref builders
   ============================================================================= */

function refStation(stationRef: string): string {
  return stationRef;
}

function refHvBus(stationRef: string): string {
  return `${stationRef}-bus-hv`;
}

function refLvBus(stationRef: string): string {
  return `${stationRef}-bus-lv`;
}

function refBay(stationRef: string, bayDraft: SynthesizeBayDraft): string {
  return `${stationRef}-${bayDraft.id}`;
}

function refTransformer(stationRef: string): string {
  return `${stationRef}-tr`;
}

function refGenerator(stationRef: string): string {
  return `${stationRef}-der`;
}

const BAY_ROLE_MAP: Record<SynthesizeBayDraft['role'], Bay['bay_role']> = {
  LINE_FULL: 'OUT',
  TR_FULL: 'TR',
  COUPLER: 'COUPLER',
  MEASUREMENT: 'MEASUREMENT',
  OZE: 'OZE',
};

const STATION_TYPE_MAP: Record<StationKind, Substation['station_type']> = {
  rmu: 'mv_lv',
  rm6: 'mv_lv',
  switching: 'switching',
  mv_lv: 'mv_lv',
  inline: 'inline',
  branch: 'branch',
  terminal: 'terminal',
  sectional: 'sectional',
  customer: 'customer',
};

const DER_KIND_TO_GEN_TYPE: Record<NonNullable<SynthesizeStationDraft['derKind']>, NonNullable<Generator['gen_type']>> = {
  PV: 'pv_inverter',
  BESS: 'bess',
  FW: 'wind_inverter',
};

const DER_VARIANT_MAP: Record<NonNullable<SynthesizeStationDraft['derConnectionVariant']>, NonNullable<Generator['connection_variant']>> = {
  lv_behind_tr: 'LV_BEHIND_STATION_TRANSFORMER',
  dedicated_mv: 'DEDICATED_MV_CONNECTION',
  source_station: 'SOURCE_CONNECTION_STATION',
};

/* =============================================================================
   Synthesize entry point
   ============================================================================= */

/**
 * Konwertuje pełen draft wizarda na hierarchię ENM.
 *
 * @param stationRef ref_id stacji (deterministyczny — np. `station-{timestamp}` dla
 *                   create lub istniejący ref_id dla edit)
 * @param draft pełen StationWizardDraft
 * @returns kompletna hierarchia ENM gotowa do mergeu w snapshot
 */
export function synthesizeStationEnm(
  stationRef: string,
  draft: SynthesizeStationDraft,
): SynthesizedStationEnm {
  /* ============== Buses ============== */
  const buses: Bus[] = [];
  const hvBusRef = refHvBus(stationRef);
  buses.push({
    id: hvBusRef,
    ref_id: hvBusRef,
    name: `${draft.name.trim()} — szyna SN`,
    tags: [],
    meta: {},
    voltage_kv: draft.ratedVoltageKv,
    phase_system: '3ph',
  });
  if (draft.hasLvSide) {
    const lvBusRef = refLvBus(stationRef);
    buses.push({
      id: lvBusRef,
      ref_id: lvBusRef,
      name: `${draft.name.trim()} — szyna nN`,
      tags: [],
      meta: { lv_scheme_kind: draft.lvSchemeKind },
      voltage_kv: draft.lvVoltageV / 1000,
      phase_system: '3ph',
    });
  }

  /* ============== Bays ============== */
  const bays: Bay[] = draft.bays.map((bd) => {
    const bayRefId = refBay(stationRef, bd);
    const protectionHint = draft.protectionHints.find((h) => h.bayId === bd.id);
    return {
      id: bayRefId,
      ref_id: bayRefId,
      name: `${draft.name.trim()} — pole ${bd.role}`,
      tags: [],
      meta: {
        cb_catalog_ref: bd.cbCatalogRef || null,
        cb_icu_ka: bd.cbIcuKa,
        ds_catalog_ref: bd.dsCatalogRef || null,
        ct_catalog_ref: bd.ctCatalogRef || null,
        ct_ratio: bd.ctRatio || null,
        has_vt: bd.hasVt,
        has_surge_arrester: bd.hasSurgeArrester,
        has_fuse: bd.hasFuse,
        protection_relay_type: protectionHint?.relayType ?? null,
        protection_ir_nominal_a: protectionHint?.irNominalA ?? null,
      },
      bay_role: BAY_ROLE_MAP[bd.role],
      substation_ref: stationRef,
      bus_ref: hvBusRef,
      equipment_refs: [],
    };
  });

  /* ============== Transformer ============== */
  let transformer: Transformer | null = null;
  if (draft.hasTransformer && draft.hasLvSide) {
    const trRefId = refTransformer(stationRef);
    transformer = {
      id: trRefId,
      ref_id: trRefId,
      name: `${draft.name.trim()} — TR1`,
      tags: [],
      meta: {
        catalog_ref: draft.transformerCatalogRef || null,
      },
      hv_bus_ref: hvBusRef,
      lv_bus_ref: refLvBus(stationRef),
      sn_mva: draft.transformerSnKva / 1000,
      uhv_kv: draft.ratedVoltageKv,
      ulv_kv: draft.lvVoltageV / 1000,
      uk_percent: draft.transformerUkPercent,
      pk_kw: draft.transformerSnKva * 0.011, // estymata 1.1% strat obciążeniowych dla TR SN/nN
      vector_group: draft.transformerVectorGroup,
      catalog_ref: draft.transformerCatalogRef || null,
      parameter_source: 'OVERRIDE',
    };
  }

  /* ============== Generator (DER) ============== */
  let generator: Generator | null = null;
  if (draft.hasDer && draft.derKind && draft.derConnectionVariant) {
    const genRefId = refGenerator(stationRef);
    /* Wybór bus_ref zależnie od variantu:
       lv_behind_tr → LV bus stacji
       dedicated_mv / source_station → HV bus stacji (lub PCC bezpośredni) */
    const genBusRef = draft.derConnectionVariant === 'lv_behind_tr' && draft.hasLvSide
      ? refLvBus(stationRef)
      : (draft.derPccRef || hvBusRef);
    generator = {
      id: genRefId,
      ref_id: genRefId,
      name: `${draft.name.trim()} — DER ${draft.derKind}`,
      tags: [],
      meta: {
        inverter_catalog_ref: draft.derInverterCatalogRef || null,
        pcc_ref: draft.derPccRef,
      },
      bus_ref: genBusRef,
      p_mw: draft.derSnKva / 1000,
      gen_type: DER_KIND_TO_GEN_TYPE[draft.derKind],
      connection_variant: DER_VARIANT_MAP[draft.derConnectionVariant],
      station_ref: stationRef,
    };
  }

  /* ============== Substation (z referencjami) ============== */
  const substation: Substation = {
    id: refStation(stationRef),
    ref_id: refStation(stationRef),
    name: draft.name.trim(),
    tags: [],
    meta: {
      registry_number: draft.registryNumber,
      rated_voltage_kv: draft.ratedVoltageKv,
      producer: draft.producer,
      has_transformer: draft.hasTransformer,
      has_lv_side: draft.hasLvSide,
      has_der: draft.hasDer,
      bay_count: draft.bays.length,
      sn_input_segment_ref: draft.snInputSegmentRef || null,
      sn_output_segment_ref: draft.snOutputSegmentRef || null,
      is_nop_point: draft.isNopPoint,
    },
    station_type: STATION_TYPE_MAP[draft.stationType],
    bus_refs: buses.map((b) => b.ref_id),
    transformer_refs: transformer ? [transformer.ref_id] : [],
  };

  /* ============== Affected refs (Inv 4) ============== */
  const affectedRefs: string[] = [
    substation.ref_id,
    ...bays.map((b) => b.ref_id),
    ...buses.map((b) => b.ref_id),
    ...(transformer ? [transformer.ref_id] : []),
    ...(generator ? [generator.ref_id] : []),
  ];

  return {
    substation,
    bays,
    buses,
    transformer,
    generator,
    affectedRefs,
  };
}

/* =============================================================================
   Merge into snapshot — handles both create and update
   ============================================================================= */

/**
 * Merge'uje syntetyzowaną hierarchię stacji do snapshot.
 *
 * Mode 'create': dodaje wszystkie obiekty na koniec list.
 * Mode 'update': zastępuje istniejący Substation + powiązane Bay/Bus/TR/Gen
 *               (po deterministycznych ref_id z synthesizeStationEnm).
 *
 * Typ snapshot: `EnergyNetworkModel` — zachowuje wszystkie pozostałe pola
 * (header, branches, sources, loads, switches itd.) niezmienione.
 */
export function mergeStationEnmIntoSnapshot(
  snap: EnergyNetworkModel,
  synthesized: SynthesizedStationEnm,
  mode: 'create' | 'update',
): EnergyNetworkModel {
  const newSubsRef = synthesized.substation.ref_id;
  const synthBusRefs = new Set(synthesized.buses.map((b) => b.ref_id));

  if (mode === 'create') {
    return {
      ...snap,
      substations: [...(snap.substations ?? []), synthesized.substation],
      bays: [...(snap.bays ?? []), ...synthesized.bays],
      buses: [...(snap.buses ?? []), ...synthesized.buses],
      transformers: synthesized.transformer
        ? [...(snap.transformers ?? []), synthesized.transformer]
        : (snap.transformers ?? []),
      generators: synthesized.generator
        ? [...(snap.generators ?? []), synthesized.generator]
        : (snap.generators ?? []),
    };
  }

  /* update: replace by ref_id, drop other bays/buses dla TEJ stacji nie obecnych
     w synthesized (czyszczenie usuniętych w wizardzie). */
  return {
    ...snap,
    substations: (snap.substations ?? []).map((s) =>
      s.ref_id === newSubsRef ? synthesized.substation : s,
    ),
    bays: [
      ...(snap.bays ?? []).filter((b) => b.substation_ref !== newSubsRef),
      ...synthesized.bays,
    ],
    buses: [
      ...(snap.buses ?? []).filter((b) => !synthBusRefs.has(b.ref_id)),
      ...synthesized.buses,
    ],
    transformers: synthesized.transformer
      ? [
          ...(snap.transformers ?? []).filter((t) => t.ref_id !== synthesized.transformer!.ref_id),
          synthesized.transformer,
        ]
      : (snap.transformers ?? []).filter((t) => t.ref_id !== `${newSubsRef}-tr`),
    generators: synthesized.generator
      ? [
          ...(snap.generators ?? []).filter((g) => g.ref_id !== synthesized.generator!.ref_id),
          synthesized.generator,
        ]
      : (snap.generators ?? []).filter((g) => g.ref_id !== `${newSubsRef}-der`),
  };
}
