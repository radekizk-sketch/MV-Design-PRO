import { useEffect, useMemo, useState } from 'react';
import { useAppStateStore } from '../app-state/store';
import { useSnapshotStore } from '../topology/snapshotStore';
import type {
  BayCanonicalModel,
  BayCanonicalRole,
  BayMeasurementChain,
  BayPrimaryDevice,
  BayPrimaryDeviceKind,
  BayPrimaryPlacement,
  BayProjectResults,
  EnergyNetworkModel,
  ProtectionSetting,
} from '../../types/enm';

export interface FieldReadModelStatus {
  data_source: 'ENM_FIELD_READ_MODEL';
  result_state: 'NONE' | 'FRESH';
  has_field_data: boolean;
}

export interface FieldReadModelSummary {
  total_fields: number;
  migrated_count: number;
  requires_completion_count: number;
  source_fields_count: number;
  coupler_fields_count: number;
  fields_with_results_count: number;
}

export interface FieldReadModelItem {
  bay_id: string;
  bay_ref: string;
  bay_name: string;
  canonical_model: BayCanonicalModel;
  project_results?: BayProjectResults | null;
}

export interface FieldReadModelResponse {
  case_id: string;
  enm_revision: number;
  view_status: FieldReadModelStatus;
  summary: FieldReadModelSummary;
  fields: FieldReadModelItem[];
}

interface FieldReadModelState {
  data: FieldReadModelResponse;
  isLoading: boolean;
  error: string | null;
}

export interface FieldReadModelView extends FieldReadModelState {
  itemsByBayRef: Map<string, FieldReadModelItem>;
  itemsByBayId: Map<string, FieldReadModelItem>;
  viewStatus: FieldReadModelStatus;
  summary: FieldReadModelSummary;
}

export const EMPTY_FIELD_READ_MODEL: FieldReadModelResponse = {
  case_id: '',
  enm_revision: 0,
  view_status: {
    data_source: 'ENM_FIELD_READ_MODEL',
    result_state: 'NONE',
    has_field_data: false,
  },
  summary: {
    total_fields: 0,
    migrated_count: 0,
    requires_completion_count: 0,
    source_fields_count: 0,
    coupler_fields_count: 0,
    fields_with_results_count: 0,
  },
  fields: [],
};

const cache = new Map<string, FieldReadModelResponse>();
const pending = new Map<string, Promise<FieldReadModelResponse>>();

type FieldSpecRecord = {
  id?: unknown;
  ref_id?: unknown;
  field_ref?: unknown;
  name?: unknown;
  bay_role?: unknown;
  substation_ref?: unknown;
  bus_ref?: unknown;
  gpz_section_id?: unknown;
  equipment_refs?: unknown;
  protection_ref?: unknown;
  tags?: unknown;
  meta?: unknown;
};

type SnapshotFieldRecord = {
  id: string;
  ref_id: string;
  name: string;
  bay_role: string;
  substation_ref: string;
  bus_ref: string;
  gpz_section_id: string | null;
  equipment_refs: string[];
  protection_ref: string | null;
  tags: string[];
  meta: Record<string, unknown>;
};

const BAY_ROLE_MAP: Record<string, BayCanonicalRole> = {
  IN: 'LINIA_IN',
  OUT: 'LINIA_OUT',
  TR: 'TRANSFORMATOROWE',
  COUPLER: 'SPRZEGLO',
  FEEDER: 'LINIA_ODG',
  MEASUREMENT: 'POMIAROWE',
  OZE: 'PV_SN',
};

const BRANCH_KIND_MAP: Record<
  string,
  { kind: BayPrimaryDeviceKind; placement: BayPrimaryPlacement; controllable: boolean }
> = {
  breaker: { kind: 'CB', placement: 'MIDSTREAM', controllable: true },
  bus_coupler: { kind: 'CB', placement: 'MIDSTREAM', controllable: true },
  disconnector: { kind: 'DS', placement: 'UPSTREAM', controllable: true },
  switch: { kind: 'LOAD_SWITCH', placement: 'MIDSTREAM', controllable: true },
  fuse: { kind: 'FUSE', placement: 'DOWNSTREAM', controllable: false },
  cable: { kind: 'CABLE_HEAD', placement: 'DOWNSTREAM', controllable: false },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
}

function collectFieldSpecs(substation: EnergyNetworkModel['substations'][number]): FieldSpecRecord[] {
  const meta = asRecord(substation.meta);
  const collected: FieldSpecRecord[] = [];

  for (const key of ['field_specs', 'nn_field_specs'] as const) {
    const specs = Array.isArray(meta?.[key]) ? meta[key] : [];
    specs.forEach((spec) => {
      if (asRecord(spec)) {
        collected.push(spec as FieldSpecRecord);
      }
    });
  }

  if (collected.length > 0) {
    return collected;
  }

  const sections = Array.isArray(substation.gpz_sections) ? substation.gpz_sections : [];
  return sections.flatMap((section, index) => {
    const sectionRecord = asRecord(section);
    const sectionId = readString(sectionRecord?.section_id) || String(index + 1);
    const busRef = readString(sectionRecord?.bus_ref);
    if (!busRef) {
      return [];
    }
    return [{
      field_ref: `${substation.ref_id}:section:${sectionId}:field`,
      name: readString(sectionRecord?.line_field_name) || `Pole GPZ ${index + 1}`,
      bay_role: 'FEEDER',
      bus_ref: busRef,
      gpz_section_id: sectionId,
      equipment_refs: [],
      tags: ['gpz_line_field'],
      meta: {
        gpz_section_id: sectionId,
        gpz_section_order: index,
      },
    }];
  });
}

function collectSnapshotFieldRecords(snapshot: EnergyNetworkModel): SnapshotFieldRecord[] {
  const byRef = new Map<string, SnapshotFieldRecord>();

  snapshot.bays.forEach((bay) => {
    byRef.set(bay.ref_id, {
      id: String(bay.id),
      ref_id: bay.ref_id,
      name: bay.name || bay.ref_id,
      bay_role: bay.bay_role,
      substation_ref: bay.substation_ref,
      bus_ref: bay.bus_ref,
      gpz_section_id: bay.gpz_section_id ?? null,
      equipment_refs: Array.isArray(bay.equipment_refs) ? bay.equipment_refs : [],
      protection_ref: bay.protection_ref ?? null,
      tags: bay.tags ?? [],
      meta: bay.meta ?? {},
    });
  });

  snapshot.substations.forEach((substation) => {
    collectFieldSpecs(substation).forEach((spec, index) => {
      const specMeta = asRecord(spec.meta) ?? {};
      const fieldRef = readString(spec.field_ref) || readString(spec.ref_id) || readString(spec.id);
      const busRef = readString(spec.bus_ref);
      const bayRole = readString(spec.bay_role);
      if (!fieldRef || !busRef || !bayRole || byRef.has(fieldRef)) {
        return;
      }

      byRef.set(fieldRef, {
        id: fieldRef,
        ref_id: fieldRef,
        name: readString(spec.name) || `Pole SN ${index + 1}`,
        bay_role: bayRole,
        substation_ref: readString(spec.substation_ref) || substation.ref_id,
        bus_ref: busRef,
        gpz_section_id: readString(spec.gpz_section_id) || null,
        equipment_refs: asStringArray(spec.equipment_refs ?? specMeta.equipment_refs),
        protection_ref: readString(spec.protection_ref) || null,
        tags: asStringArray(spec.tags),
        meta: specMeta,
      });
    });
  });

  return [...byRef.values()].sort((left, right) => {
    const stationCompare = left.substation_ref.localeCompare(right.substation_ref);
    return stationCompare !== 0 ? stationCompare : left.ref_id.localeCompare(right.ref_id);
  });
}

function resolveCanonicalRole(record: SnapshotFieldRecord): BayCanonicalRole {
  return BAY_ROLE_MAP[record.bay_role] ?? 'LINIA_OUT';
}

function branchToPrimaryDevice(
  branch: EnergyNetworkModel['branches'][number],
): BayPrimaryDevice | null {
  const mapped = BRANCH_KIND_MAP[branch.type];
  if (!mapped) {
    return null;
  }

  const switchState = mapped.controllable
    ? {
        actual_state: branch.status === 'closed' ? 'zamkniety' as const : 'otwarty' as const,
        commanded_state: null,
        control_mode: 'zdalne' as const,
        armed_for_close: true,
        armed_for_open: true,
        communication_ok: true,
        interlock_blocked: false,
        cause_code: null,
      }
    : null;
  const operatingState = switchState
    ? {
        normal_position: switchState.actual_state,
        current_position: switchState.actual_state,
        discrepancy_alarm: false,
      }
    : null;

  return {
    device_ref: branch.ref_id,
    linked_ref: branch.ref_id,
    catalog_ref: branch.catalog_ref ?? null,
    symbol_ref: `symbol:${mapped.kind.toLowerCase()}`,
    kind: mapped.kind,
    placement: mapped.placement,
    is_controllable: mapped.controllable,
    render_variant: 'kanoniczny',
    switch_state: switchState,
    operating_state: operatingState,
  };
}

function measurementToPrimaryDevice(
  measurement: EnergyNetworkModel['measurements'][number],
): BayPrimaryDevice {
  const kind: BayPrimaryDeviceKind = measurement.measurement_type === 'CT' ? 'CT' : 'VT';
  return {
    device_ref: measurement.ref_id,
    linked_ref: measurement.ref_id,
    catalog_ref: measurement.catalog_ref ?? null,
    symbol_ref: `symbol:${kind.toLowerCase()}`,
    kind,
    placement: kind === 'CT' ? 'MIDSTREAM' : 'OFF_PATH',
    is_controllable: false,
    render_variant: 'kanoniczny',
  };
}

function buildMeasurementChain(
  record: SnapshotFieldRecord,
  measurements: EnergyNetworkModel['measurements'],
): BayMeasurementChain | null {
  const fieldMeasurements = measurements
    .filter((measurement) => measurement.bay_ref === record.ref_id)
    .sort((left, right) => left.ref_id.localeCompare(right.ref_id));
  if (fieldMeasurements.length === 0) {
    return null;
  }

  const ctRefs = fieldMeasurements
    .filter((measurement) => measurement.measurement_type === 'CT')
    .map((measurement) => measurement.ref_id);
  const vtRefs = fieldMeasurements
    .filter((measurement) => measurement.measurement_type === 'VT')
    .map((measurement) => measurement.ref_id);
  const uses3u0 = fieldMeasurements.some(
    (measurement) => measurement.measurement_type === 'VT' && measurement.connection === 'delta',
  );

  return {
    chain_ref: `measurement-chain:${record.ref_id}`,
    ct_refs: ctRefs,
    vt_refs: vtRefs,
    uses_3i0: ctRefs.length > 0,
    uses_3u0: uses3u0,
    zero_sequence_current_source: ctRefs.length > 0 ? 'suma_ct' : 'brak',
    zero_sequence_voltage_source: uses3u0 ? 'otwarty_trojkat_vt' : 'brak',
    topology: ctRefs.length > 0 && vtRefs.length > 0
      ? (uses3u0 ? 'ct_vt_3u0' : 'ct_vt')
      : (ctRefs.length > 0 ? 'ct_only' : 'vt_only'),
    measurement_sets: [
      {
        side: 'pole',
        values: { frequency_hz: 50 },
      },
    ],
  };
}

function functionCodeForSetting(setting: ProtectionSetting): string {
  const map: Record<ProtectionSetting['function_type'], string> = {
    overcurrent_50: '50',
    overcurrent_51: '51',
    earth_fault_50N: '50N',
    earth_fault_51N: '51N',
    directional_67: '67',
    directional_67N: '67N',
    // D10 (FAB-F): funkcje ochrony od pracy wyspowej (Loss of Mains) — patrz
    // `enm/models.py::ProtectionSetting.function_type`.
    rocof_81R: '81R',
    vector_shift_78: '78',
    underfrequency_81U: '81U',
    overfrequency_81O: '81O',
  };
  return map[setting.function_type] ?? setting.function_type;
}

/**
 * Wymagane wejścia pomiarowe per funkcja ochrony (IEC 60255 numery ANSI).
 * FAB-F (2026-09-05): zastępuje binarną heurystykę
 * `startsWith('overcurrent') ? ['ct'] : ['3i0']`, która milcząco przypisywała
 * `3i0` (prąd składowej zerowej) FUNKCJOM CZĘSTOTLIWOŚCIOWYM (81O/81U/81R/78 —
 * D10, ochrona od pracy wyspowej), mierzącym napięcie, nie prąd — oraz
 * kierunkowym (67/67N), którym brakowało referencji napięciowej `vt`.
 * Wyczerpujące (Record wymusza obsłużenie KAŻDEJ wartości unii).
 */
const REQUIRED_INPUTS_BY_FUNCTION: Record<
  ProtectionSetting['function_type'],
  ('ct' | 'vt' | '3i0' | '3u0')[]
> = {
  overcurrent_50: ['ct'],
  overcurrent_51: ['ct'],
  earth_fault_50N: ['3i0'],
  earth_fault_51N: ['3i0'],
  directional_67: ['ct', 'vt'],
  directional_67N: ['3i0', '3u0'],
  // D10: funkcje częstotliwościowe (Loss of Mains) — mierzą napięcie, nie prąd.
  rocof_81R: ['vt'],
  vector_shift_78: ['vt'],
  underfrequency_81U: ['vt'],
  overfrequency_81O: ['vt'],
};

function buildProtectionConfig(
  record: SnapshotFieldRecord,
  assignments: EnergyNetworkModel['protection_assignments'],
): BayCanonicalModel['base_model']['protection_config'] {
  if (!record.protection_ref) {
    return null;
  }
  const assignment = assignments.find((item) => item.ref_id === record.protection_ref);
  if (!assignment) {
    return null;
  }

  return {
    unit_ref: assignment.ref_id,
    manufacturer: null,
    model: assignment.device_type,
    functions: assignment.settings.map((setting) => ({
      code: functionCodeForSetting(setting),
      available: true,
      enabled: true,
      picked_up: false,
      tripped: false,
      blocked: false,
      required_inputs: REQUIRED_INPUTS_BY_FUNCTION[setting.function_type],
      optional_inputs: [],
      missing_input_policy: 'ostrzezenie',
      settings_ref: `setting:${setting.function_type}`,
      settings: [
        ...(setting.threshold_a != null
          ? [{ key: 'prog', value: setting.threshold_a, unit: 'A', quality: 'reczne' as const }]
          : []),
        ...(setting.time_delay_s != null
          ? [{ key: 'zwloka', value: setting.time_delay_s, unit: 's', quality: 'reczne' as const }]
          : []),
        ...(setting.curve_type
          ? [{ key: 'krzywa', value: setting.curve_type, unit: null, quality: 'reczne' as const }]
          : []),
      ],
      execution_mode: 'wyzwolenie',
      execution_device_ref: assignment.breaker_ref,
      starts_spz: false,
      blocks_reclose: false,
      operator_ack_required_after_trip: false,
    })),
    measurement_inputs: {
      uses_ct: assignment.ct_ref != null,
      uses_vt: assignment.vt_ref != null,
      uses_3i0: assignment.ct_ref != null,
      uses_3u0: assignment.vt_ref != null,
    },
    automation_features: {
      synchrocheck_enabled: false,
      arc_protection_enabled: false,
      breaker_failure_enabled: false,
    },
    spz: null,
    alarms: [],
    events: [],
    disturbance_recorder: { available: false, records_count: 0 },
    trends: { available: false, channels: [] },
    settings_mode: 'reczne',
    settings_ref: `settings:${assignment.ref_id}`,
  };
}

function buildSnapshotFieldReadModel(
  caseId: string,
  snapshot: EnergyNetworkModel,
): FieldReadModelResponse {
  const branchByRef = new Map(snapshot.branches.map((branch) => [branch.ref_id, branch] as const));
  const records = collectSnapshotFieldRecords(snapshot);
  const items = records.map((record): FieldReadModelItem => {
    const measurementChain = buildMeasurementChain(record, snapshot.measurements);
    const primaryDevices = [
      ...record.equipment_refs
        .map((ref) => branchByRef.get(ref))
        .filter((branch): branch is EnergyNetworkModel['branches'][number] => Boolean(branch))
        .map(branchToPrimaryDevice)
        .filter((device): device is BayPrimaryDevice => Boolean(device)),
      ...snapshot.measurements
        .filter((measurement) => measurement.bay_ref === record.ref_id)
        .map(measurementToPrimaryDevice),
    ].sort((left, right) => `${left.placement}:${left.device_ref}`.localeCompare(
      `${right.placement}:${right.device_ref}`,
    ));
    const controllableRefs = primaryDevices
      .filter((device) => device.is_controllable)
      .map((device) => device.device_ref);
    const protectionConfig = buildProtectionConfig(record, snapshot.protection_assignments);
    const secondaryUnits = [
      ...(protectionConfig
        ? [{
            unit_ref: protectionConfig.unit_ref,
            unit_kind: 'zabezpieczenie' as const,
            shared_with_bay_refs: [],
          }]
        : []),
      ...(measurementChain
        ? [{
            unit_ref: measurementChain.chain_ref,
            unit_kind: 'pomiar' as const,
            shared_with_bay_refs: [],
          }]
        : []),
    ];
    const integrityStatus = controllableRefs.length > 0 ? 'po_migracji' : 'wymaga_uzupelnienia';
    return {
      bay_id: record.id,
      bay_ref: record.ref_id,
      bay_name: record.name,
      canonical_model: {
        schema_version: 'v10.bay.1',
        created_from: 'migracja',
        integrity_status: integrityStatus,
        audit_trail_ref: `bay:${record.ref_id}`,
        base_model: {
          bay_ref: record.ref_id,
          bay_role: resolveCanonicalRole(record),
          specialization: 'BRAK',
          substation_ref: record.substation_ref,
          gpz_section_id: record.gpz_section_id,
          primary_devices: primaryDevices,
          measurement_chain: measurementChain,
          secondary_units: secondaryUnits,
          secondary_architecture: {
            type: protectionConfig
              ? 'zintegrowane_zabezpieczenie_i_sterownik'
              : 'brak_urzadzenia_wtornego',
            measurement_provider: protectionConfig ? 'zabezpieczenie' : 'brak',
          },
          protection_config: protectionConfig,
          control_surface: {
            controllable_device_refs: controllableRefs,
            open_requires_confirmation: false,
            close_requires_confirmation: true,
            kas_available: false,
            local_remote_transfer_supported: controllableRefs.length > 0,
          },
          interlocks: { entries: [] },
          source_endpoint: null,
        },
        runtime_state: null,
        scenario_state: null,
        project_results_ref: null,
      },
      project_results: null,
    };
  });
  const requiresCompletion = items.filter(
    (item) => item.canonical_model.integrity_status === 'wymaga_uzupelnienia',
  ).length;
  return {
    case_id: caseId,
    enm_revision: snapshot.header.revision,
    view_status: {
      data_source: 'ENM_FIELD_READ_MODEL',
      result_state: items.length > 0 ? 'FRESH' : 'NONE',
      has_field_data: items.length > 0,
    },
    summary: {
      total_fields: items.length,
      migrated_count: items.length,
      requires_completion_count: requiresCompletion,
      source_fields_count: items.filter((item) => (
        item.canonical_model.base_model.bay_role === 'PV_SN'
        || item.canonical_model.base_model.bay_role === 'BESS_SN'
        || item.canonical_model.base_model.bay_role === 'FW_SN'
      )).length,
      coupler_fields_count: items.filter((item) => item.canonical_model.base_model.bay_role === 'SPRZEGLO').length,
      fields_with_results_count: 0,
    },
    fields: items,
  };
}

function buildCacheKey(caseId: string, revision: number | null): string {
  return `${caseId}:${revision ?? 'live'}`;
}

function normalizeFieldReadModelResponse(
  payload: Partial<FieldReadModelResponse> | null | undefined,
): FieldReadModelResponse {
  return {
    ...EMPTY_FIELD_READ_MODEL,
    ...payload,
    view_status: {
      ...EMPTY_FIELD_READ_MODEL.view_status,
      ...(payload?.view_status ?? {}),
    },
    summary: {
      ...EMPTY_FIELD_READ_MODEL.summary,
      ...(payload?.summary ?? {}),
    },
    fields: Array.isArray(payload?.fields) ? payload.fields : [],
  };
}

function fieldReadModelRichness(data: FieldReadModelResponse): number {
  return data.fields.reduce((score, item) => {
    const baseModel = item.canonical_model.base_model;
    const primaryCount = baseModel.primary_devices.length;
    const controllableCount = baseModel.primary_devices.filter((device) => device.is_controllable).length;
    const measurementCount = (baseModel.measurement_chain?.ct_refs.length ?? 0)
      + (baseModel.measurement_chain?.vt_refs.length ?? 0);
    const protectionCount = baseModel.protection_config ? 1 : 0;
    return score + primaryCount + controllableCount * 3 + measurementCount * 5 + protectionCount * 8;
  }, 0);
}

async function fetchFieldReadModel(caseId: string): Promise<FieldReadModelResponse> {
  const response = await fetch(`/api/cases/${caseId}/enm/field-view`);
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać widoku pola: ${response.statusText}`);
  }
  return normalizeFieldReadModelResponse(
    (await response.json()) as Partial<FieldReadModelResponse>,
  );
}

function ensureFieldReadModel(
  caseId: string,
  revision: number | null,
): Promise<FieldReadModelResponse> {
  const key = buildCacheKey(caseId, revision);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const activePending = pending.get(key);
  if (activePending) return activePending;

  const request = fetchFieldReadModel(caseId)
    .then((data) => {
      cache.set(key, data);
      return data;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}

export function useFieldReadModel(): FieldReadModelView {
  const caseId = useAppStateStore((state) => state.activeCaseId);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const revision = snapshot?.header.revision ?? null;

  const [state, setState] = useState<FieldReadModelState>({
    data: EMPTY_FIELD_READ_MODEL,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!caseId) {
      setState({
        data: EMPTY_FIELD_READ_MODEL,
        isLoading: false,
        error: null,
      });
      return;
    }

    const key = buildCacheKey(caseId, revision);
    const cached = cache.get(key);
    if (cached) {
      setState({
        data: normalizeFieldReadModelResponse(cached),
        isLoading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, isLoading: true, error: null }));

    ensureFieldReadModel(caseId, revision)
      .then((data) => {
        if (cancelled) return;
        setState({
          data: normalizeFieldReadModelResponse(data),
          isLoading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          data: EMPTY_FIELD_READ_MODEL,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Nieznany błąd odczytu pola',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, revision]);

  const snapshotReadModel = useMemo(() => {
    if (!snapshot) {
      return EMPTY_FIELD_READ_MODEL;
    }
    return buildSnapshotFieldReadModel(
      caseId || `snapshot:${snapshot.header.hash_sha256}`,
      snapshot,
    );
  }, [caseId, snapshot]);

  const data = useMemo(() => {
    const normalized = normalizeFieldReadModelResponse(state.data);
    if (normalized.fields.length > 0 || snapshotReadModel.fields.length === 0) {
      if (
        snapshotReadModel.fields.length > 0
        && snapshotReadModel.enm_revision >= normalized.enm_revision
        && fieldReadModelRichness(snapshotReadModel) > fieldReadModelRichness(normalized)
      ) {
        return snapshotReadModel;
      }
      return normalized;
    }
    return snapshotReadModel;
  }, [snapshotReadModel, state.data]);

  const itemsByBayRef = useMemo(
    () => new Map(data.fields.map((item) => [item.bay_ref, item] as const)),
    [data.fields],
  );
  const itemsByBayId = useMemo(
    () => new Map(data.fields.map((item) => [item.bay_id, item] as const)),
    [data.fields],
  );

  return {
    ...state,
    data,
    itemsByBayRef,
    itemsByBayId,
    viewStatus: data.view_status,
    summary: data.summary,
  };
}
