/**
 * InspectorEngineeringView - inspektor inżynierski pogrupowany domenowo.
 *
 * Wyświetla pełne dane wybranego elementu sieci w sekcjach:
 * 1. Identyfikacja (ref_id, nazwa, typ elementu, stacja nadrzędna)
 * 2. Parametry elektryczne (napięcie, impedancja, moc, prąd)
 * 3. Topologia (szyna od, szyna do, magistrala, odgałęzienie)
 * 4. Katalog (pozycja katalogowa, source=catalog/override)
 * 5. Eksploatacja (stan łącznika, NOP, w eksploatacji)
 * 6. Kontrola konfiguracji dotycząca tego elementu
 * 7. Operacje (przyciski akcji kontekstowych)
 *
 * UŻYCIE: snapshotStore + selectionStore.
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { BayWindowSchematic } from '../field/BayWindowSchematic';
import {
  availabilityLabel,
  canonicalRoleLabel,
  commandExecutionStateLabel,
  communicationStatusLabel,
  deviceKindLabel,
  integrityStatusLabel,
  resultStateLabel,
  sourceKindLabel,
  switchStateLabel,
} from '../field/fieldLabels';
import { useFieldReadModel, type FieldReadModelItem } from '../field/useFieldReadModel';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useSelectionStore } from '../selection';
import { sanitizeDisplayValue } from '../shell/displayHelpers';
import { useNetworkBuildStore } from './networkBuildStore';
import { useAppStateStore } from '../app-state';
import { useReadinessLiveStore } from '../engineering-readiness/readinessLiveStore';
import { issueTargetsElement } from './liveReadiness';
import {
  formatStationSwitchgearLayoutLabelPl,
  formatStationTypeLabelPl,
} from '../shared/stationTypeLabels';
import {
  isGenericStationName,
  isRawTechnicalIdentifier,
  publicTechnicalLabel,
  stationOrdinalCode,
} from '../shared/publicTechnicalLabels';
import {
  stationReadModelSnFields,
  stationSnFieldCount,
} from './stationSnFields';
import type { ReadinessIssue, SelectedElement } from '../types';
import type {
  EnergyNetworkModel,
  Branch,
  Generator,
  Load,
  LogicalViewsV1,
  ProtectionAssignment,
  Transformer,
} from '../../types/enm';
import type { NetworkBuildOperationName } from './networkBuildStore';
import { buildOperationContext } from './operationContext';
import { findOperationalBus } from '../shared/enmVisibility';
import { TypePicker } from '../catalog/TypePicker';
import { buildCatalogBinding } from '../catalog/catalogBinding';
import type { CatalogNamespace, TypeCategory } from '../catalog/types';
import {
  DER_DYNAMIC_MODEL_CATALOG,
  HVRT_CURVE_CATALOG,
  LVRT_CURVE_CATALOG,
  NC_RFG_PROFILE_CATALOG,
  PF_CURVE_CATALOG,
  PV_INVERTER_CATALOG,
} from './station-der/catalogs';
import type { WorkspaceSurfaceCode } from '../workspace/types';
import { TechCard, buildTechCardSubject } from '../tech-card';
import { ElementCalculationProofPanel } from '../proof';

// =============================================================================
// Types
// =============================================================================

interface PropertyField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
  source?: 'instance' | 'catalog' | 'calculated';
}

interface PropertySection {
  id: string;
  label: string;
  fields: PropertyField[];
}

interface QuickAction {
  id: string;
  label: string;
  op: NetworkBuildOperationName;
  context?: Record<string, unknown>;
  variant?: 'primary' | 'secondary' | 'danger';
}

function joinValues(values: string[] | undefined | null): string | null {
  if (!values || values.length === 0) return null;
  return values
    .map((value, index) => publicTechnicalLabel(value, `pozycja ${index + 1}`))
    .join(', ');
}

function buildBaySections(
  item: FieldReadModelItem | null,
  isLoading: boolean,
  error: string | null,
  readinessIssues: ReadinessIssue[],
  elementId: string,
  bayName: string,
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  if (!item) {
    return {
      elementType: 'bay',
      elementName: bayName,
      actions: [],
      sections: [
        {
          id: 'bay_missing',
          label: 'Kontrakt pola',
          fields: [
            {
              key: 'state',
              label: isLoading ? 'Stan odczytu' : 'Stan układu',
              value: isLoading
                ? 'Ładowanie widoku pola...'
                : error ?? 'Kanoniczny model pola nie jest dostępny dla wybranego elementu.',
            },
          ],
        },
      ],
    };
  }

  const canonicalModel = item.canonical_model;
  const baseModel = canonicalModel.base_model;
  const runtimeState = canonicalModel.runtime_state;
  const measurementChain = baseModel.measurement_chain;
  const protection = baseModel.protection_config;
  const sourceEndpoint = baseModel.source_endpoint;
  const projectResults = item.project_results;
  const activeInterlocks = baseModel.interlocks.entries.filter((entry) => entry.active);
  const activeAlarms = runtimeState?.active_alarms ?? [];
  const readinessMessages = readinessIssues
    .filter((issue) => issueTargetsElement(issue, elementId))
    .map((issue, index) => ({
      key: `readiness_${index}`,
      label: issue.severity === 'BLOCKER' ? 'Konfiguracja' : 'Ostrzeżenie',
      value: sanitizeEngineerText(issue.message_pl),
    }));

  return {
    elementType: 'bay',
    elementName: item.bay_name,
    actions: [],
    sections: [
      {
        id: 'ident',
        label: 'Identyfikacja',
        fields: [
          { key: 'bay_id', label: 'Identyfikator pola', value: item.bay_id },
          { key: 'bay_ref', label: 'Oznaczenie pola', value: item.bay_ref },
          { key: 'name', label: 'Nazwa', value: item.bay_name },
          { key: 'role', label: 'Rola kanoniczna', value: canonicalRoleLabel(baseModel.bay_role) },
          {
            key: 'integrity',
            label: 'Integralność modelu',
            value: integrityStatusLabel(canonicalModel.integrity_status),
          },
        ],
      },
      {
        id: 'runtime',
        label: 'Stan ruchowy pola',
        fields: [
          {
            key: 'comm',
            label: 'Łączność urządzenia wtórnego',
            value: communicationStatusLabel(runtimeState?.secondary_communication_status),
          },
          {
            key: 'last_good_update',
            label: 'Ostatnia poprawna aktualizacja',
            value: runtimeState?.last_good_update_at ?? null,
          },
          {
            key: 'control_availability',
            label: 'Dostępność sterowania',
            value: availabilityLabel(runtimeState?.control_availability),
          },
          {
            key: 'measurement_availability',
            label: 'Dostępność pomiarów',
            value: availabilityLabel(runtimeState?.measurement_availability),
          },
          {
            key: 'command_state',
            label: 'Stan ostatniego polecenia',
            value: commandExecutionStateLabel(runtimeState?.pending_command?.state),
          },
          {
            key: 'safe_to_work',
            label: 'Bezpieczne do pracy',
            value: runtimeState?.energization_and_safety.safe_to_work ?? null,
          },
          {
            key: 'unsafe_reason',
            label: 'Przyczyna braku bezpieczeństwa',
            value: runtimeState?.energization_and_safety.unsafe_reason_pl ?? null,
          },
          {
            key: 'energized_bus',
            label: 'Zasilanie od strony szyn',
            value: runtimeState?.energization_and_safety.energized_from_bus_side ?? null,
          },
          {
            key: 'energized_feeder',
            label: 'Zasilanie od strony odpływu',
            value: runtimeState?.energization_and_safety.energized_from_feeder_side ?? null,
          },
          {
            key: 'grounded',
            label: 'Pole uziemione',
            value: runtimeState?.energization_and_safety.grounded ?? null,
          },
          {
            key: 'visible_gap',
            label: 'Widoczna przerwa',
            value: runtimeState?.energization_and_safety.visible_isolation_gap ?? null,
          },
        ],
      },
      {
        id: 'devices',
        label: 'Aparaty pierwotne',
        fields: baseModel.primary_devices.length > 0
          ? baseModel.primary_devices.map((device, index) => ({
              key: `device_${index}`,
              label: `${deviceKindLabel(device.kind)} ${index + 1}`,
              value: `${deviceKindLabel(device.kind)} - ${switchStateLabel(device.switch_state?.actual_state ?? null)}`,
            }))
          : [
              {
                key: 'no_devices',
                label: 'Aparaty pierwotne do konfiguracji',
                value: 'Skonfiguruj pole SN z katalogu aparatury.',
              },
            ],
      },
      {
        id: 'measurements',
        label: 'Tor pomiarowy',
        fields: [
          { key: 'chain_ref', label: 'Identyfikator toru', value: measurementChain?.chain_ref ?? null },
          { key: 'ct_refs', label: 'Przekładniki prądowe', value: joinValues(measurementChain?.ct_refs) },
          { key: 'vt_refs', label: 'Przekładniki napięciowe', value: joinValues(measurementChain?.vt_refs) },
          { key: '3i0', label: 'Źródło 3I0', value: measurementChain?.zero_sequence_current_source ?? null },
          { key: '3u0', label: 'Źródło 3U0', value: measurementChain?.zero_sequence_voltage_source ?? null },
        ],
      },
      {
        id: 'protection',
        label: 'Zabezpieczenie pola',
        fields: [
          { key: 'unit_ref', label: 'Jednostka wtórna', value: protection?.unit_ref ?? null },
          { key: 'model', label: 'Model', value: protection?.model ?? null },
          {
            key: 'functions',
            label: 'Funkcje aktywne',
            value: joinValues(protection?.functions.map((entry) => entry.code)) ?? 'Nie skonfigurowano',
          },
          { key: 'spz', label: 'SPZ', value: protection?.spz?.state ?? 'SPZ nie skonfigurowany' },
        ],
      },
      {
        id: 'control',
        label: 'Sterowanie i uzależnienia',
        fields: [
          {
            key: 'controllable',
            label: 'Aparaty sterowalne',
            value: joinValues(baseModel.control_surface.controllable_device_refs) ?? 'Nie skonfigurowano',
          },
          {
            key: 'open_confirm',
            label: 'Potwierdzenie otwarcia',
            value: baseModel.control_surface.open_requires_confirmation,
          },
          {
            key: 'close_confirm',
            label: 'Potwierdzenie zamknięcia',
            value: baseModel.control_surface.close_requires_confirmation,
          },
          {
            key: 'interlocks',
            label: 'Aktywne uzależnienia',
            value: joinValues(activeInterlocks.map((entry) => entry.code)) ?? 'Nie występują',
          },
        ],
      },
      ...(sourceEndpoint
        ? [{
            id: 'source',
            label: 'Zacisk źródłowy',
            fields: [
              { key: 'source_kind', label: 'Rodzaj źródła', value: sourceKindLabel(sourceEndpoint.source_kind) },
              { key: 'requires_vt', label: 'Wymaga toru przekładnika napięciowego', value: sourceEndpoint.requires_vt },
              { key: 'requires_sync', label: 'Wymaga synchronizmu', value: sourceEndpoint.requires_synchrocheck },
              { key: 'operating_mode', label: 'Tryb pracy', value: sourceEndpoint.operating_mode },
            ],
          }]
        : []),
      {
        id: 'results',
        label: 'Wyniki projektowe pola',
        fields: [
          { key: 'run_ref', label: 'Ostatnie obliczenie', value: projectResults?.run_ref ?? null },
          { key: 'result_state', label: 'Stan wyników', value: resultStateLabel(projectResults?.result_state) },
          { key: 'result_message', label: 'Opis wyników', value: projectResults?.result_message_pl ?? null },
          {
            key: 'sc_contributions',
            label: 'Wkłady źródeł w zwarciu',
            value: projectResults?.source_contributions_sc.length ?? null,
          },
          {
            key: 'pf_contributions',
            label: 'Wkłady źródeł w rozpływie',
            value: projectResults?.source_contributions_pf.length ?? null,
          },
          {
            key: 'earth_fault',
            label: 'Tor ziemnozwarciowy',
            value: projectResults?.earth_fault_path?.neutral_grounding_mode ?? null,
          },
          {
            key: 'whole_path',
            label: 'Tor pola spełnia wymagania',
            value: projectResults?.verification.whole_power_path_ok ?? null,
          },
        ],
      },
      {
        id: 'proof',
        label: 'Wywód pola',
        fields: [
          { key: 'proof_ref', label: 'Identyfikator uzasadnienia', value: projectResults?.proof_binding.proof_ref ?? null },
          {
            key: 'input_refs',
            label: 'Powiązane dane wejściowe',
            value: projectResults?.proof_binding.input_data_refs.length ?? null,
          },
          {
            key: 'source_refs',
            label: 'Powiązane wkłady źródeł',
            value: projectResults?.proof_binding.source_contribution_refs.length ?? null,
          },
        ],
      },
      ...(activeAlarms.length || readinessMessages.length
        ? [{
            id: 'alarms',
            label: 'Alarmy i kontrola',
            fields: [
              ...activeAlarms.map((alarm, index) => ({
                key: `alarm_${index}`,
                label: 'Alarm aktywny',
                value: `${alarm.code}: ${alarm.message_pl}`,
              })),
              ...readinessMessages,
            ],
          }]
        : []),
    ],
  };
}

// =============================================================================
// Element type labels
// =============================================================================

const ELEMENT_TYPE_LABELS: Record<string, string> = {
  bus: 'Szyna',
  branch: 'Gałąź',
  line_overhead: 'Linia napowietrzna',
  cable: 'Kabel SN',
  transformer: 'Transformator',
  source: 'Źródło zasilania',
  load: 'Obciążenie',
  switch: 'Łącznik',
  breaker: 'Wyłącznik',
  disconnector: 'Odłącznik',
  fuse: 'Bezpiecznik',
  bus_coupler: 'Sprzęgło szynowe',
  Switch: 'Łącznik SN',
  substation: 'Stacja',
  bay: 'Pole',
  generator: 'Generator',
  pv_inverter: 'Układ PV',
  bess_inverter: 'Układ BESS',
  wind_inverter: 'Układ farmy wiatrowej',
  synchronous: 'Generator synchroniczny',
  genset: 'Agregat',
  ups: 'UPS',
  ct: 'Przekładnik prądowy',
  vt: 'Przekładnik napięciowy',
  relay: 'Zabezpieczenie',
  branch_pole: 'Słup rozgałęźny SN',
  zksn: 'ZKSN SN',
  BUSBAR_SECTION: 'Szyna',
  BUSBAR_SYSTEM: 'System szyn',
  MV_CABLE_SEGMENT: 'Odcinek kablowy SN',
  MV_OVERHEAD_SEGMENT: 'Odcinek napowietrzny SN',
  MV_BRANCH_POINT: 'Punkt rozgałęzienia SN',
  MV_LV_TRANSFORMER: 'Transformator SN/nN',
  TRANSFORMER: 'Transformator',
  GPZ: 'GPZ',
  SOURCE: 'Źródło',
  PV_INVERTER: 'Układ PV',
  BESS_CONVERTER: 'Magazyn energii BESS',
  WIND_SOURCE: 'Układ farmy wiatrowej',
  LV_LOAD_NODE: 'Odbiór nN',
};

function connectionVariantLabel(variant: string | null | undefined): string {
  if (!variant) return '—';
  switch (variant) {
    case 'nn_side':
      return 'Po stronie nN stacji';
    case 'block_transformer':
      return 'Blokowo przez transformator do SN';
    default:
      return variant;
  }
}

function formatElementTypeLabel(elementType: string): string {
  return ELEMENT_TYPE_LABELS[elementType] ?? elementType;
}

function formatLoadPower(loads: readonly Load[]): string {
  const totalKw = loads.reduce((sum, load) => sum + ((load.p_mw ?? 0) * 1000), 0);
  if (totalKw >= 1000) {
    return `${(totalKw / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 3 })} MW`;
  }
  return `${totalKw.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} kW`;
}

function stationNnFieldSpecs(station: { meta?: unknown }): Array<Record<string, unknown>> {
  const meta = station.meta && typeof station.meta === 'object'
    ? station.meta as Record<string, unknown>
    : null;
  const rawSpecs = meta?.nn_field_specs;
  return Array.isArray(rawSpecs)
    ? rawSpecs.filter((spec): spec is Record<string, unknown> => !!spec && typeof spec === 'object')
    : [];
}

function connectionVariantLabelPl(variant: string | null | undefined): string {
  if (!variant) return 'nie wyznaczono';
  switch (variant) {
    case 'nn_side':
    case 'LV_BEHIND_STATION_TRANSFORMER':
      return 'po stronie nN stacji, za transformatorem SN/nN';
    case 'block_transformer':
      return 'przez transformator blokowy do SN';
    case 'DEDICATED_MV_CONNECTION':
      return 'dedykowane pole SN';
    case 'SOURCE_CONNECTION_STATION':
      return 'osobna stacja przyłączeniowa';
    default:
      return 'nie wyznaczono';
  }
}

function generatorMeta(generator: Generator | null | undefined): Record<string, unknown> {
  return generator?.meta && typeof generator.meta === 'object' ? generator.meta : {};
}

function generatorMaterializedParams(generator: Generator | null | undefined): Record<string, unknown> {
  return generator?.materialized_params && typeof generator.materialized_params === 'object'
    ? generator.materialized_params
    : {};
}

function valueAsString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function valueAsNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function valueAsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function generatorStationRef(generator: Generator | null | undefined): string | null {
  const meta = generatorMeta(generator);
  return generator?.station_ref ?? valueAsString(meta.station_ref);
}

function findStationName(snapshot: EnergyNetworkModel, stationRef: string | null): string | null {
  if (!stationRef) return null;
  const station = snapshot.substations?.find((entry) => (
    entry.ref_id === stationRef || entry.id === stationRef
  ));
  return station?.name ?? null;
}

function findTransformer(snapshot: EnergyNetworkModel, transformerRef: string | null): Transformer | null {
  if (!transformerRef) return null;
  return snapshot.transformers?.find((entry) => (
    entry.ref_id === transformerRef || entry.id === transformerRef
  )) ?? null;
}

function generatorStationTransformerRef(generator: Generator | null | undefined): string | null {
  const meta = generatorMeta(generator);
  const params = generatorMaterializedParams(generator);
  return valueAsString(params.station_transformer_ref) ?? valueAsString(meta.station_transformer_ref);
}

function generatorConnectionPointRef(generator: Generator | null | undefined): string | null {
  const meta = generatorMeta(generator);
  return valueAsString(meta.connection_point_ref) ?? generator?.bus_ref ?? null;
}

function generatorProtectionIntent(generator: Generator | null | undefined): Record<string, unknown> | null {
  const metaIntent = generatorMeta(generator).protection_intent;
  if (metaIntent && typeof metaIntent === 'object') return metaIntent as Record<string, unknown>;
  const paramsIntent = generatorMaterializedParams(generator).protection_intent;
  if (paramsIntent && typeof paramsIntent === 'object') return paramsIntent as Record<string, unknown>;
  return null;
}

function findGeneratorProtection(
  snapshot: EnergyNetworkModel,
  generatorRef: string | null | undefined,
): ProtectionAssignment | null {
  if (!generatorRef) return null;
  return snapshot.protection_assignments?.find((entry) => {
    const meta = entry.meta && typeof entry.meta === 'object' ? entry.meta : {};
    return valueAsString(meta.protected_object_ref) === generatorRef;
  }) ?? null;
}

function transformerLabel(transformer: Transformer | null): string | null {
  if (!transformer) return null;
  const power = Number.isFinite(transformer.sn_mva) ? `${transformer.sn_mva} MVA` : 'moc do konfiguracji';
  const voltage = Number.isFinite(transformer.uhv_kv) && Number.isFinite(transformer.ulv_kv)
    ? `${transformer.uhv_kv}/${transformer.ulv_kv} kV`
    : 'napięcie do konfiguracji';
  const vectorGroup = transformer.vector_group ? ` ${transformer.vector_group}` : '';
  return `${transformer.name} · ${voltage} · ${power}${vectorGroup}`;
}

function sourceSideLabel(generator: Generator | null | undefined): string {
  const connectionVariant = generator?.connection_variant;
  if (connectionVariant === 'nn_side' || connectionVariant === 'LV_BEHIND_STATION_TRANSFORMER') {
    return 'nN stacji';
  }
  if (connectionVariant === 'DEDICATED_MV_CONNECTION' || connectionVariant === 'block_transformer') {
    return 'SN';
  }
  return 'nie wyznaczono';
}

function stationGeneratorKindLabel(generator: Generator): string {
  if (generator.gen_type === 'bess') return 'BESS';
  if (
    generator.gen_type === 'wind_inverter'
    || generator.gen_type === 'fw_pmsg'
    || generator.gen_type === 'fw_dfig'
    || generator.gen_type === 'fw_scig'
  ) {
    return 'FW';
  }
  if (generator.gen_type === 'pv_inverter' || generator.gen_type === null) return 'PV';
  return 'źródło';
}

function formatStationGeneratorPower(powerMw: number): string {
  return `${powerMw.toLocaleString('pl-PL', { maximumFractionDigits: 3 })} MW`;
}

function formatStationGeneratorSummary(generators: readonly Generator[]): string {
  if (generators.length === 0) return 'bez źródeł przyłączonych';

  const groups = new Map<string, { count: number; powerMw: number }>();
  generators.forEach((generator) => {
    const label = stationGeneratorKindLabel(generator);
    const current = groups.get(label) ?? { count: 0, powerMw: 0 };
    groups.set(label, {
      count: current.count + 1,
      powerMw: current.powerMw + (generator.p_mw ?? 0),
    });
  });

  return Array.from(groups.entries())
    .map(([label, group]) => `${label} ${group.count} szt. / ${formatStationGeneratorPower(group.powerMw)}`)
    .join('; ');
}

function protectionScopeLabel(scope: unknown): string | null {
  const value = valueAsString(scope);
  if (!value) return null;
  return value;
}

function findGeneratorForSelectedConverter(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
): Generator | null {
  const direct = snapshot.generators?.find((generator) =>
    generator.ref_id === selectedElement.id || generator.id === selectedElement.id,
  );
  if (direct) return direct;

  const selectedLooksLikePv = selectedElement.type === 'PVInverter'
    || selectedElement.semanticEngineeringRole === 'PV_INVERTER'
    || selectedElement.id.includes('pv_inverter')
    || selectedElement.id.includes('/pv/inverter/')
    || selectedElement.id.includes('/nn_source/pv');
  const selectedLooksLikeBess = selectedElement.type === 'BESSInverter'
    || selectedElement.semanticEngineeringRole === 'BESS_CONVERTER'
    || selectedElement.id.includes('bess');
  const selectedLooksLikeWind = selectedElement.semanticEngineeringRole === 'WIND_SOURCE'
    || selectedElement.id.includes('wind')
    || selectedElement.id.includes('/fw/');

  const byEmbeddedRef = snapshot.generators?.find((generator) => {
    const stationRef = generatorStationRef(generator);
    return selectedElement.id.includes(generator.ref_id)
      || Boolean(stationRef && selectedElement.id.includes(stationRef));
  });
  if (byEmbeddedRef) return byEmbeddedRef;

  const candidates = (snapshot.generators ?? []).filter((generator) => {
    if (selectedLooksLikePv) return generator.gen_type === 'pv_inverter' || generator.gen_type === null;
    if (selectedLooksLikeBess) return generator.gen_type === 'bess';
    if (selectedLooksLikeWind) {
      return generator.gen_type === 'wind_inverter'
        || generator.gen_type === 'fw_pmsg'
        || generator.gen_type === 'fw_dfig'
        || generator.gen_type === 'fw_scig';
    }
    return false;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function converterRoleForGenerator(
  selectedElement: SelectedElement,
  generator: Generator | null,
): 'PV_INVERTER' | 'BESS_CONVERTER' | 'WIND_SOURCE' {
  if (selectedElement.semanticEngineeringRole === 'BESS_CONVERTER') return 'BESS_CONVERTER';
  if (selectedElement.semanticEngineeringRole === 'WIND_SOURCE') return 'WIND_SOURCE';
  if (generator?.gen_type === 'bess') return 'BESS_CONVERTER';
  if (
    generator?.gen_type === 'wind_inverter'
    || generator?.gen_type === 'fw_pmsg'
    || generator?.gen_type === 'fw_dfig'
    || generator?.gen_type === 'fw_scig'
  ) {
    return 'WIND_SOURCE';
  }
  return 'PV_INVERTER';
}

function converterSurfaceCodeForRole(role: string): WorkspaceSurfaceCode {
  if (role === 'BESS_CONVERTER') return 'E-22';
  if (role === 'WIND_SOURCE') return 'E-23';
  return 'E-21';
}

function converterSurfaceTitle(role: string): string {
  if (role === 'BESS_CONVERTER') return 'Konfiguracja magazynu BESS';
  if (role === 'WIND_SOURCE') return 'Konfiguracja farmy wiatrowej';
  return 'Konfiguracja falownika PV';
}

function generatorProfileRef(generator: Generator | null | undefined, key: string): string | null {
  const meta = generatorMeta(generator);
  const params = generatorMaterializedParams(generator);
  const metaProfiles = valueAsRecord(meta.profiles);
  const paramsProfiles = valueAsRecord(params.profiles);
  return valueAsString(paramsProfiles?.[key])
    ?? valueAsString(metaProfiles?.[key])
    ?? valueAsString(params[key])
    ?? valueAsString(meta[key]);
}

function pvCatalogLabel(generator: Generator | null | undefined): string | null {
  const catalogRef = generator?.catalog_ref ?? null;
  if (!catalogRef) return null;
  return PV_INVERTER_CATALOG.find((entry) => entry.id === catalogRef)?.label_pl
    ?? valueAsString(generatorMaterializedParams(generator).catalog_label)
    ?? valueAsString(generatorMeta(generator).catalog_label)
    ?? 'Falownik PV z katalogu projektu';
}

function pvCatalogManufacturer(generator: Generator | null | undefined): string | null {
  const catalogRef = generator?.catalog_ref ?? null;
  if (!catalogRef) return null;
  return PV_INVERTER_CATALOG.find((entry) => entry.id === catalogRef)?.manufacturer
    ?? valueAsString(generatorMaterializedParams(generator).manufacturer)
    ?? valueAsString(generatorMeta(generator).manufacturer);
}

function pvCatalogVoltage(generator: Generator | null | undefined): number | null {
  const catalogRef = generator?.catalog_ref ?? null;
  const catalog = catalogRef ? PV_INVERTER_CATALOG.find((entry) => entry.id === catalogRef) : null;
  return catalog?.nominal_voltage_kv
    ?? valueAsNumber(generatorMaterializedParams(generator).nominal_voltage_kv)
    ?? valueAsNumber(generatorMeta(generator).nominal_voltage_kv);
}

function pvCatalogPower(generator: Generator | null | undefined): number | null {
  const catalogRef = generator?.catalog_ref ?? null;
  const catalog = catalogRef ? PV_INVERTER_CATALOG.find((entry) => entry.id === catalogRef) : null;
  return catalog?.nominal_power_kw
    ?? valueAsNumber(generatorMaterializedParams(generator).nominal_power_kw)
    ?? valueAsNumber(generatorMeta(generator).nominal_power_kw)
    ?? (typeof generator?.p_mw === 'number' ? generator.p_mw * 1000 : null);
}

function pvCatalogFaultContribution(generator: Generator | null | undefined): number | null {
  const catalogRef = generator?.catalog_ref ?? null;
  const catalog = catalogRef ? PV_INVERTER_CATALOG.find((entry) => entry.id === catalogRef) : null;
  return catalog?.fault_current_capability_pu
    ?? valueAsNumber(generatorMaterializedParams(generator).fault_current_capability_pu)
    ?? valueAsNumber(generatorMeta(generator).fault_current_capability_pu);
}

function catalogLabelById<T extends { id: string; label_pl: string }>(
  catalog: readonly T[],
  id: string | null,
): string | null {
  if (!id) return null;
  return catalog.find((entry) => entry.id === id)?.label_pl ?? null;
}

function dynamicModelLabel(generator: Generator | null | undefined): string | null {
  const explicit = generatorProfileRef(generator, 'dynamic_model_ref');
  if (explicit) {
    return DER_DYNAMIC_MODEL_CATALOG.find((entry) => entry.id === explicit)?.label_pl ?? explicit;
  }
  const catalogRef = generator?.catalog_ref ?? null;
  if (!catalogRef) return null;
  return DER_DYNAMIC_MODEL_CATALOG.find((entry) =>
    entry.applicable_device_ids.includes(catalogRef),
  )?.label_pl ?? null;
}

function readinessText(ready: boolean, pendingText = 'do konfiguracji'): string {
  return ready ? 'skonfigurowane' : pendingText;
}

// =============================================================================
// Helpers: branch type guard
// =============================================================================

function isLineCable(b: Branch): b is Branch & { type: 'line_overhead' | 'cable' } {
  return b.type === 'line_overhead' || b.type === 'cable';
}

function isSwitchgearBranch(b: Branch): boolean {
  return b.type === 'switch'
    || b.type === 'breaker'
    || b.type === 'bus_coupler'
    || b.type === 'disconnector'
    || b.type === 'fuse';
}

function switchgearBranchTypeLabel(branch: Branch): string {
  return ELEMENT_TYPE_LABELS[branch.type] ?? 'Aparat SN';
}

interface SegmentTechnicalPayload {
  length_km?: number | null;
  r_ohm_per_km?: number | null;
  x_ohm_per_km?: number | null;
  rating?: { in_a?: number | null } | null;
  catalog_ref?: string | null;
  catalog_namespace?: string | null;
}

function getSegmentTechnicalPayload(branch: Branch | undefined): SegmentTechnicalPayload | null {
  if (!branch) return null;
  const payload = branch as Branch & SegmentTechnicalPayload;
  if (
    payload.length_km === undefined
    && payload.r_ohm_per_km === undefined
    && payload.x_ohm_per_km === undefined
    && payload.rating === undefined
    && payload.catalog_ref === undefined
    && payload.catalog_namespace === undefined
  ) {
    return null;
  }
  return payload;
}

function hasSemanticSelection(
  selectedElement: SelectedElement | null | undefined,
): selectedElement is SelectedElement & {
  semanticHash: string;
  semanticElementKind: string;
  semanticEngineeringRole: string;
} {
  return Boolean(
    selectedElement?.semanticHash
      && selectedElement.semanticElementKind
      && selectedElement.semanticEngineeringRole,
  );
}

function semanticTypeKey(selectedElement: SelectedElement): string {
  return selectedElement.semanticEngineeringRole
    ?? selectedElement.semanticElementKind
    ?? selectedElement.type;
}

function semanticTypeLabel(selectedElement: SelectedElement): string {
  return formatElementTypeLabel(semanticTypeKey(selectedElement));
}

function semanticActionContext(
  selectedElement: SelectedElement,
  context: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...context,
    semantic_element_kind: selectedElement.semanticElementKind,
    semantic_engineering_role: selectedElement.semanticEngineeringRole,
    semantic_hash: selectedElement.semanticHash,
  };
}

function stationPublicName(
  snapshot: EnergyNetworkModel,
  station: NonNullable<EnergyNetworkModel['substations']>[number],
): { code: string; typeLabel: string; displayName: string } {
  const code = stationOrdinalCode(snapshot, station);
  const typeLabel = formatStationTypeLabelPl(station.station_type);
  const displayName = isGenericStationName(station.name)
    ? `${code} · ${typeLabel}`
    : publicTechnicalLabel(station.name, `${code} · ${typeLabel}`);
  return { code, typeLabel, displayName };
}

function isSemanticMvSegment(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'MV_CABLE_SEGMENT'
    || selectedElement.semanticElementKind === 'MV_OVERHEAD_SEGMENT'
    || selectedElement.semanticEngineeringRole === 'MV_CABLE_SEGMENT'
    || selectedElement.semanticEngineeringRole === 'MV_OVERHEAD_SEGMENT';
}

function isSemanticOverheadSegment(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'MV_OVERHEAD_SEGMENT'
    || selectedElement.semanticEngineeringRole === 'MV_OVERHEAD_SEGMENT';
}

function isSemanticCableSegment(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'MV_CABLE_SEGMENT'
    || selectedElement.semanticEngineeringRole === 'MV_CABLE_SEGMENT';
}

function isSemanticConverterSource(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'SOURCE'
    && (
      selectedElement.semanticEngineeringRole === 'PV_INVERTER'
      || selectedElement.semanticEngineeringRole === 'BESS_CONVERTER'
      || selectedElement.semanticEngineeringRole === 'WIND_SOURCE'
    );
}

function isConverterSourceSelection(selectedElement: SelectedElement): boolean {
  return isSemanticConverterSource(selectedElement)
    || selectedElement.type === 'PVInverter'
    || selectedElement.type === 'BESSInverter'
    || selectedElement.type === 'Generator'
    || selectedElement.id.includes('pv_inverter')
    || selectedElement.id.includes('/pv/inverter/')
    || selectedElement.id.includes('/nn_source/pv')
    || selectedElement.id.includes('bess')
    || selectedElement.id.includes('/fw/');
}

function isSemanticGpzSource(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'GPZ'
    || selectedElement.semanticEngineeringRole === 'GPZ_SUPPLY_NODE'
    || (selectedElement.type === 'Source' && selectedElement.id.includes('/substation'));
}

const APPARATUS_KIND_LABELS_PL: Record<string, string> = {
  disconnect_bus: 'Odłącznik szynowy',
  breaker: 'Wyłącznik SN',
  ct: 'Przekładnik prądowy',
  vt: 'Przekładnik napięciowy',
  switch_disconnector: 'Rozłącznik',
  earthing_switch: 'Uziemnik boczny',
  fuse: 'Bezpieczniki',
  cable_head: 'Głowica kablowa / port odpływowy',
  transformer_symbol: 'Transformator WN/SN',
};

const APPARATUS_ROLE_LABELS_PL: Record<string, string> = {
  disconnect_bus: 'Izolacja pola od szyny zbiorczej',
  breaker: 'Łączenie robocze i zwarciowe pola',
  ct: 'Pomiar prądu i tor zabezpieczeń',
  vt: 'Pomiar napięcia i automatyka napięciowa',
  switch_disconnector: 'Łączenie robocze pola',
  earthing_switch: 'Uziemienie odpływu po odłączeniu pola',
  fuse: 'Zabezpieczenie wkładkami bezpiecznikowymi',
  cable_head: 'Jawny punkt wyprowadzenia ciągu głównego SN',
  transformer_symbol: 'Tor transformatora WN/SN',
};

function parseApparatusSelectionId(id: string): { bayRef: string; apparatusKind: string } | null {
  const marker = id.lastIndexOf('#');
  if (marker <= 0 || marker === id.length - 1) return null;
  return { bayRef: id.slice(0, marker), apparatusKind: id.slice(marker + 1) };
}

const INTERNAL_STATION_BAY_ROLE_LABELS_PL: Readonly<Record<string, string>> = {
  in: 'Pole wejściowe SN',
  out: 'Pole wyjściowe SN',
  feeder: 'Pole odgałęźne SN',
  tr: 'Pole transformatorowe SN',
  coupler: 'Pole sprzęgłowe SN',
  measurement: 'Pole pomiarowe SN',
  oze: 'Pole przyłączeniowe OZE',
};

const INTERNAL_STATION_DEVICE_LABELS_PL: Readonly<Record<string, string>> = {
  'switch-disconnector': 'Rozłącznik',
  fuse: 'Bezpiecznik',
  'earthing-switch': 'Uziemnik',
  'cable-head': 'Głowica kablowa',
  'transformer-device': 'Transformator SN/nN',
  breaker: 'Wyłącznik',
  disconnector: 'Odłącznik',
  vt: 'Przekładnik napięciowy',
};

function stationRefFromInternalElement(id: string): string | null {
  for (const marker of ['/internal-bay/', '/nn/', '/pv/', '/transformer/']) {
    const markerIndex = id.indexOf(marker);
    if (markerIndex > 0) return id.slice(0, markerIndex);
  }
  return null;
}

function stationDisplayNameForInternalRef(
  snapshot: EnergyNetworkModel,
  stationRef: string,
): string {
  const station = (snapshot.substations ?? []).find((item) =>
    item.ref_id === stationRef || item.id === stationRef,
  );
  if (!station) return 'Stacja SN/nN';
  const stationCode = stationOrdinalCode(snapshot, station);
  const stationTypeLabel = formatStationTypeLabelPl(station.station_type);
  const fallback = [stationCode, stationTypeLabel].join(' · ');
  return isGenericStationName(station.name)
    ? fallback
    : publicTechnicalLabel(station.name, fallback);
}

function buildInternalStationElementSections(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } | null {
  const stationRef = stationRefFromInternalElement(selectedElement.id);
  if (!stationRef) return null;

  const stationName = stationDisplayNameForInternalRef(snapshot, stationRef);
  const bayPath = selectedElement.id.includes('/internal-bay/')
    ? selectedElement.id.slice(selectedElement.id.indexOf('/internal-bay/') + '/internal-bay/'.length)
    : '';
  const [bayKey, deviceKey] = bayPath.split('/');
  const roleKey = bayKey?.split('-')[0] ?? '';
  const bayLabel = INTERNAL_STATION_BAY_ROLE_LABELS_PL[roleKey] ?? 'Układ stacyjny';
  const deviceLabel = deviceKey
    ? INTERNAL_STATION_DEVICE_LABELS_PL[deviceKey] ?? selectedElement.name
    : selectedElement.name;
  const isNnBreaker = selectedElement.id.includes('/nn/') || selectedElement.id.includes('/pv/nn-breaker/');
  const isPvConnection = selectedElement.id.includes('/pv/');

  const sections: PropertySection[] = [
    {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'name', label: 'Nazwa', value: selectedElement.name },
        { key: 'kind', label: 'Rodzaj elementu', value: deviceLabel },
        { key: 'station', label: 'Stacja', value: stationName },
      ],
    },
    {
      id: 'context',
      label: 'Miejsce w układzie',
      fields: [
        { key: 'switchgear', label: 'Rozdzielnia', value: isNnBreaker ? 'Rozdzielnica nN' : 'Rozdzielnia SN' },
        { key: 'bay', label: 'Pole / tor', value: bayLabel },
        { key: 'role', label: 'Rola techniczna', value: isPvConnection ? 'Przyłączenie źródła' : 'Tor pierwotny stacji' },
      ],
    },
  ];

  return {
    sections,
    elementType: selectedElement.type,
    elementName: selectedElement.name,
    actions: [],
  };
}

function formatBayLabelForApparatus(
  bayRef: string,
  snapshot: EnergyNetworkModel | null,
  fieldItems: readonly FieldReadModelItem[],
): string {
  const fieldItem = fieldItems.find((item) => item.bay_ref === bayRef || item.bay_id === bayRef);
  const bay = snapshot?.bays?.find((item) => item.ref_id === bayRef || item.id === bayRef);
  return fieldItem?.bay_name ?? bay?.name ?? bayRef;
}

function bayVoltageLabel(
  bayRef: string,
  snapshot: EnergyNetworkModel | null,
  fieldItems: readonly FieldReadModelItem[],
): string {
  const fieldItem = fieldItems.find((item) => item.bay_ref === bayRef || item.bay_id === bayRef);
  const bay = snapshot?.bays?.find((item) => item.ref_id === bayRef || item.id === bayRef);
  const gpzSectionBusRef = fieldItem?.canonical_model.base_model.gpz_section_id
    ? snapshot?.substations
      ?.flatMap((station) => station.gpz_sections ?? [])
      .find((section) => section.section_id === fieldItem.canonical_model.base_model.gpz_section_id)
      ?.bus_ref
    : null;
  const busRef = bay?.bus_ref ?? gpzSectionBusRef ?? null;
  const bus = busRef ? findOperationalBus(snapshot, busRef) : null;
  return bus ? `${bus.voltage_kv} kV` : 'nie wyznaczono';
}

function buildApparatusSectionsForElement(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel | null,
  readinessIssues: ReadinessIssue[],
  fieldItems: readonly FieldReadModelItem[],
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } | null {
  const apparatus = parseApparatusSelectionId(selectedElement.id);
  if (!apparatus) return null;

  const apparatusLabel = APPARATUS_KIND_LABELS_PL[apparatus.apparatusKind] ?? 'Aparat SN';
  const apparatusRole = APPARATUS_ROLE_LABELS_PL[apparatus.apparatusKind] ?? 'Element toru pierwotnego pola SN';
  const bayLabel = formatBayLabelForApparatus(apparatus.bayRef, snapshot, fieldItems);
  const voltageLabel = bayVoltageLabel(apparatus.bayRef, snapshot, fieldItems);
  const readinessForApparatus = readinessIssues.filter((issue) =>
    issueTargetsElement(issue, selectedElement.id) || issueTargetsElement(issue, apparatus.bayRef),
  );
  const isCableHead = apparatus.apparatusKind === 'cable_head';

  const sections: PropertySection[] = [
    {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'name', label: 'Nazwa', value: selectedElement.name || apparatusLabel },
        { key: 'kind', label: 'Rodzaj aparatu', value: apparatusLabel },
        { key: 'bay', label: 'Pole powiązane', value: bayLabel },
        { key: 'role', label: 'Rola techniczna', value: apparatusRole },
      ],
    },
    {
      id: 'engineering',
      label: 'Parametry aparatu',
      fields: [
        { key: 'voltage', label: 'Napięcie odniesienia', value: voltageLabel },
        { key: 'source', label: 'Źródło danych', value: 'Karta pola SN i katalog aparatury' },
        {
          key: 'edit_scope',
          label: 'Zakres edycji',
          value: 'Aparatura, przekładniki, zabezpieczenia i powiązania pola',
        },
      ],
    },
  ];

  if (isCableHead) {
    sections.push({
      id: 'outgoing',
      label: 'Wyprowadzenie sieci SN',
      fields: [
        {
          key: 'rule',
          label: 'Zasada projektowa',
          value: 'Ciąg główny wyprowadza się wyłącznie z głowicy odpływowej pola SN.',
        },
        {
          key: 'variants',
          label: 'Dalsze warianty',
          value: 'stacja transformatorowa, ZKSN, słup rozgałęźny albo kolejny odcinek ciągu',
        },
      ],
    });
  }

  if (readinessForApparatus.length > 0) {
    sections.push({
      id: 'readiness',
      label: 'Zakres obliczeń',
      fields: readinessForApparatus.map((issue, index) => ({
        key: `readiness_${index}`,
        label: issue.severity === 'BLOCKER' ? 'Do konfiguracji' : 'Uwaga projektowa',
        value: issue.message_pl,
      })),
    });
  }

  const actions: QuickAction[] = [
    {
      id: 'edit_field_apparatus',
      label: 'Skonfiguruj pole SN',
      op: 'update_element_parameters',
      context: {
        element_ref: apparatus.bayRef,
        field_ref: apparatus.bayRef,
        target_tab: 'apparatus',
      },
    },
  ];

  if (isCableHead) {
    actions.unshift({
      id: 'continue_trunk_from_cable_head',
      label: 'Wyprowadź ciąg główny z głowicy',
      op: 'continue_trunk_segment_sn',
      context: {
        field_ref: apparatus.bayRef,
        bay_ref: apparatus.bayRef,
        terminal_name: `${apparatusLabel} - ${bayLabel}`,
        terminal_voltage_label: voltageLabel,
        is_first_trunk_segment: true,
      },
      variant: 'primary',
    });
  }

  return {
    sections,
    elementType: 'apparatus',
    elementName: selectedElement.name || apparatusLabel,
    actions,
  };
}

function buildSemanticSegmentSections(
  selectedElement: SelectedElement,
  branch: Branch | undefined,
  snapshot: EnergyNetworkModel,
  readinessIssues: ReadinessIssue[],
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  const elementId = selectedElement.id;
  const segmentRef = branch?.ref_id ?? elementId;
  const segmentName = branch?.name ?? selectedElement.name;
  const segmentPayload = getSegmentTechnicalPayload(branch);
  const sections: PropertySection[] = [
    {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'ref_id', label: 'Oznaczenie odcinka', value: segmentRef },
        { key: 'name', label: 'Nazwa', value: segmentName },
        { key: 'type', label: 'Typ', value: semanticTypeLabel(selectedElement) },
        { key: 'engineering_role', label: 'Rola semantyczna', value: selectedElement.semanticEngineeringRole ?? null },
        ...(branch?.status ? [{ key: 'status', label: 'Stan', value: branch.status }] : []),
      ],
    },
  ];
  const actions: QuickAction[] = [
    {
      id: 'assign_catalog',
      label: 'Przypisz katalog',
      op: 'assign_catalog_to_element',
      context: semanticActionContext(selectedElement, { element_ref: segmentRef }),
    },
    {
      id: 'insert_station_on_segment_sn',
      label: 'Wstaw stację',
      op: 'insert_station_on_segment_sn',
      context: semanticActionContext(selectedElement, { segment_ref: segmentRef }),
    },
  ];

  const branchParent = findParentStation(elementId, snapshot);
  if (branchParent) {
    sections[0].fields.push(
      { key: 'parent_station', label: 'Stacja nadrzedna', value: branchParent },
    );
  }

  if (branch) {
    sections.push({
      id: 'topology',
      label: 'Topologia',
      fields: [
        { key: 'from_bus', label: 'Szyna poczatkowa', value: branch.from_bus_ref },
        { key: 'to_bus', label: 'Szyna koncowa', value: branch.to_bus_ref },
      ],
    });
  }
  if (segmentPayload) {
    sections.push({
      id: 'electrical',
      label: 'Parametry elektryczne',
      fields: [
        { key: 'length_km', label: 'Długość', value: segmentPayload.length_km ?? null, unit: 'km' },
        { key: 'r_ohm', label: 'Rezystancja R\'', value: segmentPayload.r_ohm_per_km ?? null, unit: 'ohm/km', source: 'catalog' },
        { key: 'x_ohm', label: 'Reaktancja X\'', value: segmentPayload.x_ohm_per_km ?? null, unit: 'ohm/km', source: 'catalog' },
        { key: 'rating', label: 'Obciążalność długotrwała', value: segmentPayload.rating?.in_a ?? null, unit: 'A', source: 'catalog' },
      ],
    });
    sections.push({
      id: 'catalog',
      label: 'Katalog',
      fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: segmentPayload.catalog_ref ?? '?' },
      ],
    });
  }

  if (isSemanticOverheadSegment(selectedElement)) {
    actions.push({
      id: 'insert_branch_pole_on_segment_sn',
      label: 'Wstaw słup rozgałęźny',
      op: 'insert_branch_pole_on_segment_sn',
      context: semanticActionContext(selectedElement, { segment_ref: segmentRef }),
    });
  }
  if (isSemanticCableSegment(selectedElement)) {
    actions.push({
      id: 'insert_zksn_on_segment_sn',
      label: 'Wstaw ZKSN',
      op: 'insert_zksn_on_segment_sn',
      context: semanticActionContext(selectedElement, { segment_ref: segmentRef }),
    });
  }
  actions.push({
    id: 'insert_section_switch_sn',
    label: 'Wstaw lacznik',
    op: 'insert_section_switch_sn',
    context: semanticActionContext(selectedElement, { segmentRef: segmentRef, segmentLabel: segmentName }),
  });

  appendReadinessSection(sections, readinessIssues, elementId);

  return {
    sections,
    elementType: semanticTypeKey(selectedElement),
    elementName: segmentName,
    actions,
  };
}

function appendReadinessSection(
  sections: PropertySection[],
  readinessIssues: ReadinessIssue[],
  elementId: string,
): void {
  const elementBlockers = readinessIssues.filter(
    (issue) => issue.severity === 'BLOCKER' && issueTargetsElement(issue, elementId),
  );
  const elementWarnings = readinessIssues.filter(
    (issue) => issue.severity !== 'BLOCKER' && issueTargetsElement(issue, elementId),
  );
  if (elementBlockers.length > 0 || elementWarnings.length > 0) {
    sections.push({
      id: 'readiness',
      label: 'Kontrola',
      fields: [
        ...elementBlockers.map((b, i) => ({
          key: `blocker_${i}`,
          label: 'Konfiguracja',
          value: sanitizeEngineerText(b.message_pl),
        })),
        ...elementWarnings.map((w, i) => ({
          key: `warning_${i}`,
          label: 'Ostrzeżenie',
          value: sanitizeEngineerText(w.message_pl),
        })),
      ],
    });
  }
}

function buildSemanticConverterSections(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
  readinessIssues: ReadinessIssue[],
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  const generator = snapshot.generators?.find((g) => g.ref_id === selectedElement.id) ?? null;
  const elementName = generator?.name ?? selectedElement.name;
  const stationRef = generatorStationRef(generator);
  const stationName = findStationName(snapshot, stationRef);
  const transformer = findTransformer(snapshot, generatorStationTransformerRef(generator));
  const connectionPointRef = generatorConnectionPointRef(generator);
  const protectionIntent = generatorProtectionIntent(generator);
  const protectionAssignment = findGeneratorProtection(snapshot, generator?.ref_id ?? selectedElement.id);
  const protectionMeta = protectionAssignment?.meta && typeof protectionAssignment.meta === 'object'
    ? protectionAssignment.meta
    : {};
  const sectionsForEngineer: PropertySection[] = [
    {
      id: 'ident',
      label: 'Źródło w stacji',
      fields: [
        { key: 'name', label: 'Urządzenie', value: elementName },
        { key: 'type', label: 'Rodzaj', value: semanticTypeLabel(selectedElement) },
        { key: 'station', label: 'Stacja', value: stationName ?? 'do konfiguracji' },
        {
          key: 'connection_variant',
          label: 'Punkt przyłączenia',
          value: generator ? connectionVariantLabelPl(generator.connection_variant) : 'do konfiguracji',
        },
        { key: 'voltage_side', label: 'Strona napięciowa', value: sourceSideLabel(generator) },
      ],
    },
  ];

  if (generator) {
    sectionsForEngineer.push(
      {
        id: 'electrical',
        label: 'Parametry elektryczne',
        fields: [
          { key: 'p_mw', label: 'Moc czynna', value: generator.p_mw, unit: 'MW' },
          { key: 'q_mvar', label: 'Moc bierna', value: generator.q_mvar ?? null, unit: 'Mvar' },
          {
            key: 'connection_point',
            label: 'PCC',
            value: connectionPointRef ? 'szyna nN stacji' : 'do konfiguracji',
          },
        ],
      },
      {
        id: 'station_link',
        label: 'Powiązanie ze stacją',
        fields: [
          { key: 'station_transformer', label: 'Transformator SN/nN', value: transformerLabel(transformer) },
          {
            key: 'converter_catalog',
            label: 'Katalog falownika',
            value: generator.catalog_ref ? elementName : 'do konfiguracji',
            source: generator.catalog_ref ? 'catalog' : undefined,
          },
        ],
      },
      {
        id: 'protection',
        label: 'Zabezpieczenia przyłączeniowe nN',
        fields: [
          {
            key: 'protection_device',
            label: 'Urządzenie zabezpieczeniowe',
            value: valueAsString(protectionIntent?.device_label) ?? protectionAssignment?.name ?? 'do konfiguracji',
            source: protectionAssignment?.catalog_ref ? 'catalog' : undefined,
          },
          {
            key: 'breaker_role',
            label: 'Wyłącznik nN źródła',
            value: valueAsString(protectionIntent?.breaker_role) ?? 'do konfiguracji',
          },
          {
            key: 'protected_object',
            label: 'Chroniony obiekt',
            value: valueAsString(protectionIntent?.protected_object)
              ?? valueAsString(protectionMeta.protected_object)
              ?? 'do konfiguracji',
          },
          {
            key: 'analysis_scope',
            label: 'Zakres analizy zabezpieczeniowej',
            value: protectionScopeLabel(protectionIntent?.analysis_scope)
              ?? protectionScopeLabel(protectionMeta.analysis_scope)
              ?? 'do konfiguracji',
          },
        ],
      },
    );
  }

  appendReadinessSection(sectionsForEngineer, readinessIssues, selectedElement.id);

  return {
    sections: sectionsForEngineer,
    elementType: semanticTypeKey(selectedElement),
    elementName,
    actions: [
      {
        id: 'assign_catalog',
        label: 'Zmień katalog falownika',
        op: 'assign_catalog_to_element',
        context: semanticActionContext(selectedElement, { element_ref: selectedElement.id }),
      },
      {
        id: 'edit',
        label: 'Skonfiguruj układ PV/BESS/FW',
        op: 'update_element_parameters',
        context: semanticActionContext(selectedElement, { element_ref: selectedElement.id }),
      },
    ],
  };
  const sections: PropertySection[] = [
    {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'ref_id', label: 'Oznaczenie układu', value: publicTechnicalLabel(selectedElement.id, elementName) },
        { key: 'name', label: 'Nazwa', value: elementName },
        { key: 'type', label: 'Typ', value: semanticTypeLabel(selectedElement) },
        { key: 'engineering_role', label: 'Rola semantyczna', value: selectedElement.semanticEngineeringRole ?? null },
      ],
    },
  ];

  if (generator) {
    const generatorForLegacyPanel = generator;
    sections.push({
      id: 'electrical',
      label: 'Parametry elektryczne',
      fields: [
        { key: 'p_mw', label: 'Moc czynna', value: generator!.p_mw, unit: 'MW' },
        { key: 'q_mvar', label: 'Moc bierna', value: generator!.q_mvar ?? null, unit: 'Mvar' },
        { key: 'connection_variant', label: 'Wariant przyłączenia', value: connectionVariantLabel(generatorForLegacyPanel!.connection_variant) },
      ],
    });
    sections.push({
      id: 'catalog',
      label: 'Katalog',
      fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: generatorForLegacyPanel!.catalog_ref ?? '?' },
      ],
    });
  }

  appendReadinessSection(sections, readinessIssues, selectedElement.id);

  return {
    sections,
    elementType: semanticTypeKey(selectedElement),
    elementName,
    actions: [
      {
        id: 'assign_catalog',
        label: 'Przypisz katalog',
        op: 'assign_catalog_to_element',
        context: semanticActionContext(selectedElement, { element_ref: selectedElement.id }),
      },
      {
        id: 'edit',
        label: 'Edytuj parametry',
        op: 'update_element_parameters',
        context: semanticActionContext(selectedElement, { element_ref: selectedElement.id }),
      },
    ],
  };
}

function buildAdvancedConverterSections(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
  readinessIssues: ReadinessIssue[],
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  const generator = findGeneratorForSelectedConverter(selectedElement, snapshot);
  const role = converterRoleForGenerator(selectedElement, generator);
  const generatorRef = generator?.ref_id ?? selectedElement.id;
  const elementName = generator?.name ?? selectedElement.name;
  const stationRef = generatorStationRef(generator);
  const stationName = findStationName(snapshot, stationRef);
  const transformer = findTransformer(snapshot, generatorStationTransformerRef(generator));
  const connectionPointRef = generatorConnectionPointRef(generator);
  const protectionIntent = generatorProtectionIntent(generator);
  const protectionAssignment = findGeneratorProtection(snapshot, generatorRef);
  const protectionMeta = valueAsRecord(protectionAssignment?.meta) ?? {};
  const ncRfgRef = generatorProfileRef(generator, 'nc_rfg_profile_ref');
  const lvrtRef = generatorProfileRef(generator, 'lvrt_curve_ref');
  const hvrtRef = generatorProfileRef(generator, 'hvrt_curve_ref');
  const pfCurveRef = generatorProfileRef(generator, 'pf_curve_ref');
  const ncRfgProfile = ncRfgRef
    ? NC_RFG_PROFILE_CATALOG.find((entry) => entry.id === ncRfgRef) ?? null
    : null;
  const dynamicModel = dynamicModelLabel(generator);
  const catalogPowerKw = pvCatalogPower(generator);
  const catalogVoltageKv = pvCatalogVoltage(generator);
  const faultContributionPu = pvCatalogFaultContribution(generator);
  const hasPcc = Boolean(connectionPointRef);
  const hasCatalog = Boolean(generator?.catalog_ref);
  const hasTransformerOrMv = Boolean(transformer) || sourceSideLabel(generator) === 'SN';
  const hasProfiles = Boolean(ncRfgRef && lvrtRef && hvrtRef);
  const hasProtection = Boolean(protectionAssignment || protectionIntent);
  const actionContext = hasSemanticSelection(selectedElement)
    ? semanticActionContext(selectedElement, { element_ref: generatorRef, generator_ref: generatorRef })
    : { element_ref: generatorRef, generator_ref: generatorRef };

  const sections: PropertySection[] = [
    {
      id: 'ident',
      label: role === 'PV_INVERTER' ? 'Falownik PV w stacji' : 'Źródło w stacji',
      fields: [
        { key: 'name', label: 'Urządzenie', value: elementName },
        {
          key: 'type',
          label: 'Rodzaj',
          value: role === 'PV_INVERTER'
            ? 'falownik PV'
            : role === 'BESS_CONVERTER'
              ? 'przekształtnik BESS'
              : 'źródło wiatrowe',
        },
        { key: 'station', label: 'Stacja', value: stationName ?? 'do konfiguracji' },
        {
          key: 'connection_variant',
          label: 'Punkt przyłączenia',
          value: generator ? connectionVariantLabelPl(generator.connection_variant) : 'do konfiguracji',
        },
        { key: 'voltage_side', label: 'Strona napięciowa', value: sourceSideLabel(generator) },
      ],
    },
  ];

  sections.push(
    {
        id: 'inverter_catalog',
        label: role === 'PV_INVERTER' ? 'Falownik z katalogu' : 'Urządzenie z katalogu',
        fields: [
          {
            key: 'catalog_label',
            label: role === 'PV_INVERTER' ? 'Typ falownika' : 'Typ urządzenia',
            value: role === 'PV_INVERTER'
              ? pvCatalogLabel(generator)
              : generator?.catalog_ref
                ? 'pozycja katalogowa projektu'
                : null,
            source: generator?.catalog_ref ? 'catalog' : undefined,
          },
          {
            key: 'manufacturer',
            label: 'Producent',
            value: role === 'PV_INVERTER' ? pvCatalogManufacturer(generator) : null,
            source: generator?.catalog_ref ? 'catalog' : undefined,
          },
          {
            key: 'pn_kw',
            label: 'Moc znamionowa Pn',
            value: catalogPowerKw,
            unit: 'kW',
            source: hasCatalog ? 'catalog' : undefined,
          },
          {
            key: 'un_kv',
            label: 'Napięcie strony nN',
            value: catalogVoltageKv,
            unit: 'kV',
            source: hasCatalog ? 'catalog' : undefined,
          },
          {
            key: 'fault_current',
            label: 'Wkład zwarciowy falownika',
            value: faultContributionPu,
            unit: 'pu',
            source: hasCatalog ? 'catalog' : undefined,
          },
          {
            key: 'parallel_count',
            label: 'Liczba falowników równoległych',
            value: generator?.n_parallel ?? generator?.quantity ?? null,
          },
        ],
      },
      {
        id: 'connection_path',
        label: 'Punkt przyłączenia i tor mocy',
        fields: [
          { key: 'connection_point', label: 'PCC', value: hasPcc ? 'szyna nN stacji' : 'do konfiguracji' },
          { key: 'station_transformer', label: 'Transformator SN/nN', value: transformerLabel(transformer) },
          {
            key: 'power_path',
            label: 'Tor od strony SN do falownika',
            value: hasTransformerOrMv
              ? 'pole SN -> transformator SN/nN -> rozdzielnica nN -> wyłącznik nN -> falownik'
              : 'do konfiguracji',
          },
          { key: 'side', label: 'Strona przyłączenia', value: sourceSideLabel(generator) },
        ],
      },
      {
        id: 'ncrfg',
        label: 'NC RfG i regulacja',
        fields: [
          {
            key: 'nc_rfg',
            label: 'Profil zgodności przyłączeniowej',
            value: ncRfgProfile?.label_pl ?? 'do konfiguracji',
            source: ncRfgProfile ? 'catalog' : undefined,
          },
          {
            key: 'qu',
            label: 'Regulacja Q(U)',
            value: ncRfgProfile
              ? `martwa strefa ${ncRfgProfile.q_u_deadzone_percent}% Un, Q ${ncRfgProfile.q_u_min_pu}...${ncRfgProfile.q_u_max_pu} pu`
              : 'do konfiguracji',
            source: ncRfgProfile ? 'catalog' : undefined,
          },
          {
            key: 'pf',
            label: 'Regulacja P(f)',
            value: catalogLabelById(PF_CURVE_CATALOG, pfCurveRef)
              ?? (ncRfgProfile ? 'profil operatora' : 'do konfiguracji'),
            source: pfCurveRef || ncRfgProfile ? 'catalog' : undefined,
          },
          {
            key: 'cos_phi',
            label: 'Minimalny cos φ',
            value: ncRfgProfile?.cos_phi_min_lagging ?? null,
            source: ncRfgProfile ? 'catalog' : undefined,
          },
        ],
      },
      {
        id: 'frt',
        label: 'FRT / LVRT / HVRT',
        fields: [
          {
            key: 'lvrt',
            label: 'Krzywa LVRT',
            value: catalogLabelById(LVRT_CURVE_CATALOG, lvrtRef) ?? 'do konfiguracji',
            source: lvrtRef ? 'catalog' : undefined,
          },
          {
            key: 'hvrt',
            label: 'Krzywa HVRT',
            value: catalogLabelById(HVRT_CURVE_CATALOG, hvrtRef) ?? 'do konfiguracji',
            source: hvrtRef ? 'catalog' : undefined,
          },
          {
            key: 'dynamic_model',
            label: 'Model dynamiczny FRT',
            value: dynamicModel ?? 'do konfiguracji',
            source: dynamicModel ? 'catalog' : undefined,
          },
          {
            key: 'frt_status',
            label: 'Kontrola testu FRT/HVRT',
            value: readinessText(Boolean(lvrtRef && hvrtRef && dynamicModel)),
          },
        ],
      },
      {
        id: 'analysis',
        label: 'Obliczenia i uzasadnienie',
        fields: [
          { key: 'load_flow', label: 'Rozpływ mocy P/Q', value: readinessText(hasCatalog && hasPcc && hasProfiles) },
          { key: 'short_circuit', label: 'Wkład do zwarć', value: readinessText(Boolean(faultContributionPu), 'do konfiguracji') },
          { key: 'ncrfg_test', label: 'Test NC RfG', value: readinessText(hasProfiles) },
          {
            key: 'proof_trace',
            label: 'Uzasadnienie inżynierskie',
            value: readinessText(hasCatalog && hasPcc && hasProfiles && hasProtection, 'do konfiguracji'),
          },
        ],
      },
      {
        id: 'protection',
        label: 'Zabezpieczenia falownika i strony nN',
        fields: [
          {
            key: 'protection_device',
            label: 'Urządzenie zabezpieczeniowe',
            value: valueAsString(protectionIntent?.device_label) ?? protectionAssignment?.name ?? 'do konfiguracji',
            source: protectionAssignment?.catalog_ref ? 'catalog' : undefined,
          },
          {
            key: 'breaker_role',
            label: 'Wyłącznik nN źródła',
            value: valueAsString(protectionIntent?.breaker_role) ?? 'do konfiguracji',
          },
          {
            key: 'protected_object',
            label: 'Chroniony obiekt',
            value: valueAsString(protectionIntent?.protected_object)
              ?? valueAsString(protectionMeta.protected_object)
              ?? 'do konfiguracji',
          },
          {
            key: 'analysis_scope',
            label: 'Zakres analizy zabezpieczeniowej',
            value: protectionScopeLabel(protectionIntent?.analysis_scope)
              ?? protectionScopeLabel(protectionMeta.analysis_scope)
              ?? 'do konfiguracji',
          },
          { key: 'protection_readiness', label: 'Kontrola zabezpieczeń', value: readinessText(hasProtection) },
        ],
      },
  );

  appendReadinessSection(sections, readinessIssues, generatorRef);

  return {
    sections,
    elementType: role,
    elementName,
    actions: [
      {
        id: 'assign_catalog',
        label: role === 'PV_INVERTER' ? 'Zmień katalog falownika' : 'Zmień katalog urządzenia',
        op: 'assign_catalog_to_element',
        context: actionContext,
      },
      {
        id: 'edit',
        label: role === 'PV_INVERTER' ? 'Skonfiguruj falownik PV' : 'Skonfiguruj układ PV/BESS/FW',
        op: 'update_element_parameters',
        context: actionContext,
      },
    ],
  };
}

function buildSemanticGpzSections(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
  readinessIssues: ReadinessIssue[],
  fieldItems: readonly FieldReadModelItem[],
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  const source = snapshot.sources?.find((s) =>
    s.ref_id === selectedElement.id
    || s.id === selectedElement.id
    || s.substation_ref === selectedElement.id
  );
  const elementName = source?.name ?? selectedElement.name;
  const sourceBus = source ? findOperationalBus(snapshot, source.bus_ref) : null;
  const sourceSubstation = source?.substation_ref
    ? snapshot.substations?.find((station) => station.ref_id === source.substation_ref)
    : null;
  const sourceGpzSection = sourceSubstation && source
    ? sourceSubstation.gpz_sections?.find((section) => section.section_id === source.gpz_section_id)
      ?? sourceSubstation.gpz_sections?.[0]
      ?? null
    : null;
  const sourceGpzField = source
    ? findFieldForGpzSection(
      fieldItems,
      sourceSubstation?.id,
      sourceSubstation?.ref_id,
      sourceGpzSection?.section_id ?? source.gpz_section_id,
    )
    : null;
  const sections: PropertySection[] = [
    {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'ref_id', label: 'Oznaczenie układu', value: publicTechnicalLabel(selectedElement.id, elementName) },
        { key: 'name', label: 'Nazwa', value: elementName },
        { key: 'type', label: 'Typ', value: semanticTypeLabel(selectedElement) },
        { key: 'engineering_role', label: 'Rola semantyczna', value: selectedElement.semanticEngineeringRole ?? null },
        ...(source?.model ? [{ key: 'model', label: 'Model zastępczy', value: source.model }] : []),
      ],
    },
  ];

  if (source) {
    sections.push({
      id: 'electrical',
      label: 'Parametry sieci',
      fields: [
        { key: 'bus_voltage_kv', label: 'Napięcie szyny', value: sourceBus?.voltage_kv ?? null, unit: 'kV' },
        { key: 'sk3_mva', label: 'Moc zwarciowa Sk3', value: source.sk3_mva ?? null, unit: 'MVA' },
        { key: 'rx_ratio', label: 'Stosunek R/X', value: source.rx_ratio ?? null },
        { key: 'r_ohm', label: 'Rezystancja R', value: source.r_ohm ?? null, unit: 'ohm' },
        { key: 'x_ohm', label: 'Reaktancja X', value: source.x_ohm ?? null, unit: 'ohm' },
      ],
    });
    sections.push({
      id: 'gpz',
      label: 'Sekcje GPZ',
      fields: [
        { key: 'substation_ref', label: 'Stacja GPZ', value: sourceSubstation?.name ?? source.substation_ref ?? '-' },
        { key: 'section_id', label: 'Sekcja źródła', value: sourceGpzSection?.section_id ?? source.gpz_section_id ?? '-' },
        { key: 'section_name', label: 'Nazwa sekcji', value: sourceGpzSection?.name ?? '-' },
        { key: 'line_field', label: 'Pole liniowe GPZ', value: sourceGpzField?.bay_name ?? sourceGpzSection?.line_field_name ?? '-' },
      ],
    });
  }

  appendReadinessSection(sections, readinessIssues, selectedElement.id);

  return {
    sections,
    elementType: semanticTypeKey(selectedElement),
    elementName,
    actions: [
      {
        id: 'edit',
        label: 'Edytuj parametry',
        op: 'update_element_parameters',
        context: semanticActionContext(selectedElement, { element_ref: selectedElement.id }),
      },
    ],
  };
}

function buildSemanticSectionsForElement(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
  readinessIssues: ReadinessIssue[],
  fieldItems: readonly FieldReadModelItem[],
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  if (isSemanticMvSegment(selectedElement)) {
    return buildSemanticSegmentSections(
      selectedElement,
      snapshot.branches?.find((branch) => branch.ref_id === selectedElement.id),
      snapshot,
      readinessIssues,
    );
  }

  if (isSemanticConverterSource(selectedElement)) {
    return buildAdvancedConverterSections(selectedElement, snapshot, readinessIssues);
  }

  if (isSemanticGpzSource(selectedElement)) {
    return buildSemanticGpzSections(selectedElement, snapshot, readinessIssues, fieldItems);
  }

  const sections: PropertySection[] = [
    {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'ref_id', label: 'Oznaczenie elementu', value: selectedElement.id },
        { key: 'name', label: 'Nazwa', value: selectedElement.name },
        { key: 'type', label: 'Typ', value: semanticTypeLabel(selectedElement) },
        { key: 'engineering_role', label: 'Rola semantyczna', value: selectedElement.semanticEngineeringRole ?? null },
      ],
    },
  ];
  appendReadinessSection(sections, readinessIssues, selectedElement.id);

  return {
    sections,
    elementType: semanticTypeKey(selectedElement),
    elementName: selectedElement.name,
    actions: [
      {
        id: 'edit',
        label: 'Edytuj parametry',
        op: 'update_element_parameters',
        context: semanticActionContext(selectedElement, { element_ref: selectedElement.id }),
      },
    ],
  };
}

// =============================================================================
// Helpers: build sections from ENM element
// =============================================================================

function findParentStation(
  elementId: string,
  snapshot: EnergyNetworkModel,
): string | null {
  // Check transformer_refs
  const trStation = snapshot.substations?.find((s) =>
    s.transformer_refs?.includes(elementId),
  );
  if (trStation) return trStation.name;
  // Check generator station_ref
  const gen = snapshot.generators?.find((g) => g.ref_id === elementId);
  if (gen?.station_ref) {
    const station = snapshot.substations?.find((s) => s.id === gen.station_ref);
    return station?.name ?? null;
  }
  // Check by bus_ref for loads/generators
  const load = snapshot.loads?.find((l) => l.ref_id === elementId);
  const busRef = load?.bus_ref ?? gen?.bus_ref;
  if (busRef) {
    const station = snapshot.substations?.find((s) => s.bus_refs?.includes(busRef));
    return station?.name ?? null;
  }
  // Check branches by bus refs
  const branch = snapshot.branches?.find((b) => b.ref_id === elementId || b.id === elementId);
  if (branch) {
    const fromStation = snapshot.substations?.find((s) =>
      s.bus_refs?.includes(branch.from_bus_ref),
    );
    if (fromStation) return fromStation.name;
  }
  return null;
}

function findFieldsForStation(
  items: readonly FieldReadModelItem[],
  stationId: string | null | undefined,
  stationRef: string | null | undefined,
): FieldReadModelItem[] {
  return stationReadModelSnFields(items, stationId, stationRef);
}

function findFieldForGpzSection(
  items: readonly FieldReadModelItem[],
  stationId: string | null | undefined,
  stationRef: string | null | undefined,
  gpzSectionId: string | null | undefined,
): FieldReadModelItem | null {
  const stationFields = findFieldsForStation(items, stationId, stationRef);
  if (!gpzSectionId) {
    return stationFields[0] ?? null;
  }
  return stationFields.find(
    (item) => item.canonical_model.base_model.gpz_section_id === gpzSectionId,
  ) ?? null;
}

function buildSectionsForElement(
  elementId: string,
  snapshot: EnergyNetworkModel | null,
  readinessIssues: ReadinessIssue[],
  fieldItems: readonly FieldReadModelItem[],
  logicalViews?: LogicalViewsV1 | null,
  selectedElement?: SelectedElement | null,
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  if (!snapshot) return { sections: [], elementType: '', elementName: '', actions: [] };

  if (selectedElement) {
    const apparatusSections = buildApparatusSectionsForElement(
      selectedElement,
      snapshot,
      readinessIssues,
      fieldItems,
    );
    if (apparatusSections) {
      return apparatusSections;
    }
    const internalStationSections = buildInternalStationElementSections(selectedElement, snapshot);
    if (internalStationSections) {
      return internalStationSections;
    }
    if (isConverterSourceSelection(selectedElement)) {
      const converter = findGeneratorForSelectedConverter(selectedElement, snapshot);
      if (converter || selectedElement.type === 'PVInverter' || selectedElement.type === 'BESSInverter') {
        return buildAdvancedConverterSections(selectedElement, snapshot, readinessIssues);
      }
    }
  }

  if (hasSemanticSelection(selectedElement)) {
    return buildSemanticSectionsForElement(
      selectedElement,
      snapshot,
      readinessIssues,
      fieldItems,
    );
  }

  const sections: PropertySection[] = [];
  const actions: QuickAction[] = [];
  let elementType = '';
  let elementName = '';

  // Try to find in buses
  const bus = findOperationalBus(snapshot, elementId);
  if (bus) {
    elementType = 'bus';
    elementName = bus.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie szyny', value: bus.ref_id },
        { key: 'name', label: 'Nazwa', value: bus.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.bus },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'voltage_kv', label: 'Napięcie znamionowe', value: bus.voltage_kv, unit: 'kV' },
      ],
    });
  }

  // Try branches
  const branch = snapshot.branches?.find((b) => b.ref_id === elementId);
  if (branch) {
    if (isSwitchgearBranch(branch)) {
      elementType = 'Switch';
      elementName = branch.name;
      const apparatusLabel = switchgearBranchTypeLabel(branch);
      const branchParent = findParentStation(elementId, snapshot);
      sections.push({
        id: 'ident',
        label: 'Identyfikacja',
        fields: [
          { key: 'ref_id', label: 'Oznaczenie aparatu', value: branch.ref_id },
          { key: 'name', label: 'Nazwa', value: branch.name },
          { key: 'kind', label: 'Rodzaj aparatu', value: apparatusLabel },
          { key: 'status', label: 'Stan ruchowy', value: branch.status === 'closed' ? 'zamknięty' : 'otwarty' },
          ...(branchParent ? [{ key: 'parent_station', label: 'Stacja nadrzędna', value: branchParent }] : []),
        ],
      });
      sections.push({
        id: 'topology',
        label: 'Topologia',
        fields: [
          { key: 'from_bus', label: 'Szyna początkowa', value: branch.from_bus_ref },
          { key: 'to_bus', label: 'Szyna końcowa', value: branch.to_bus_ref },
        ],
      });
      sections.push({
        id: 'catalog',
        label: 'Katalog aparatu',
        fields: [
          { key: 'catalog_ref', label: 'Pozycja katalogowa', value: branch.catalog_ref ?? '?' },
          { key: 'catalog_namespace', label: 'Przestrzeń katalogu', value: branch.catalog_namespace ?? 'APARAT_SN' },
        ],
      });
      actions.push({
        id: 'assign_catalog',
        label: 'Przypisz katalog aparatu',
        op: 'assign_catalog_to_element',
        context: {
          element_ref: branch.ref_id,
          element_type: 'switch',
          catalog_namespace: branch.catalog_namespace ?? 'APARAT_SN',
        },
      });
      return { sections, elementType, elementName, actions };
    }

    elementType = branch.type;
    elementName = branch.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie odcinka', value: branch.ref_id },
        { key: 'name', label: 'Nazwa', value: branch.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS[branch.type] ?? branch.type },
        { key: 'status', label: 'Stan', value: branch.status },
      ],
    });
    // Parent station and role context
    const branchParent = findParentStation(elementId, snapshot);
    if (branchParent) {
      sections[sections.length - 1].fields.push(
        { key: 'parent_station', label: 'Stacja nadrzędna', value: branchParent },
      );
    }
    // Role context from logical views
    if (logicalViews) {
      let roleLabel = '—';
      const isTrunk = logicalViews.trunks?.some((t) => t.segments?.includes(elementId));
      const isBranch = logicalViews.branches?.some((br) => br.segments?.includes(elementId));
      const isSecondary = logicalViews.secondary_connectors?.some((sc) => sc.segment_ref === elementId);
      if (isTrunk) roleLabel = 'Magistrala';
      else if (isBranch) roleLabel = 'Odgałęzienie';
      else if (isSecondary) roleLabel = 'Połączenie pierścieniowe';
      sections[sections.length - 1].fields.push(
        { key: 'role', label: 'Rola w sieci', value: roleLabel },
      );
    }
    sections.push({
      id: 'topology', label: 'Topologia', fields: [
        { key: 'from_bus', label: 'Szyna początkowa', value: branch.from_bus_ref },
        { key: 'to_bus', label: 'Szyna końcowa', value: branch.to_bus_ref },
      ],
    });
    if (isLineCable(branch)) {
      sections.push({
        id: 'electrical', label: 'Parametry elektryczne', fields: [
          { key: 'length_km', label: 'Długość', value: branch.length_km, unit: 'km' },
          { key: 'r_ohm', label: 'Rezystancja R\'', value: branch.r_ohm_per_km, unit: 'Ω/km', source: 'catalog' },
          { key: 'x_ohm', label: 'Reaktancja X\'', value: branch.x_ohm_per_km, unit: 'Ω/km', source: 'catalog' },
          { key: 'rating', label: 'Obciążalność długotrwała', value: branch.rating?.in_a ?? null, unit: 'A', source: 'catalog' },
        ],
      });
    }
    sections.push({
      id: 'catalog', label: 'Katalog', fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: branch.catalog_ref ?? '?' },
      ],
    });
    actions.push({ id: 'assign_catalog', label: 'Przypisz katalog', op: 'assign_catalog_to_element', context: { element_ref: branch.ref_id } });
    if (isLineCable(branch)) {
      actions.push({ id: 'insert_station_on_segment_sn', label: 'Wstaw stację', op: 'insert_station_on_segment_sn', context: { segment_ref: branch.ref_id } });
      if (branch.type === 'line_overhead') {
        actions.push({ id: 'insert_branch_pole_on_segment_sn', label: 'Wstaw słup rozgałęźny', op: 'insert_branch_pole_on_segment_sn', context: { segment_ref: branch.ref_id } });
      }
      if (branch.type === 'cable') {
        actions.push({ id: 'insert_zksn_on_segment_sn', label: 'Wstaw ZKSN', op: 'insert_zksn_on_segment_sn', context: { segment_ref: branch.ref_id } });
      }
      actions.push({ id: 'insert_section_switch_sn', label: 'Wstaw łącznik', op: 'insert_section_switch_sn', context: { segmentRef: branch.ref_id, segmentLabel: branch.name } });
    }
  }

  // Try branch points
  const branchPoint = snapshot.branch_points?.find((bp) => bp.ref_id === elementId);
  if (branchPoint) {
    elementType = branchPoint.branch_point_type;
    elementName = branchPoint.name;
    sections.push({
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'ref_id', label: 'Oznaczenie punktu rozgałęzienia', value: branchPoint.ref_id },
        { key: 'name', label: 'Nazwa', value: branchPoint.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS[branchPoint.branch_point_type] ?? branchPoint.branch_point_type },
      ],
    });
    sections.push({
      id: 'topology',
      label: 'Topologia',
      fields: [
        { key: 'parent_segment_id', label: 'Segment nadrzędny', value: branchPoint.parent_segment_id },
        { key: 'main_in', label: 'Port główny wejściowy', value: branchPoint.ports?.MAIN_IN ?? '?' },
        { key: 'main_out', label: 'Port główny wyjściowy', value: branchPoint.ports?.MAIN_OUT ?? '?' },
        { key: 'branch_ports', label: 'Porty odgałęzień', value: branchPoint.ports?.BRANCH?.join(', ') ?? '?' },
      ],
    });
    sections.push({
      id: 'catalog',
      label: 'Katalog',
      fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: branchPoint.catalog_ref ?? '?' },
      ],
    });
    actions.push({ id: 'start_branch_segment_sn', label: 'Dodaj odgałęzienie', op: 'start_branch_segment_sn' });
  }

  // Try transformers
  const transformer = snapshot.transformers?.find((t) => t.ref_id === elementId);
  if (transformer) {
    elementType = 'transformer';
    elementName = transformer.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie transformatora', value: transformer.ref_id },
        { key: 'name', label: 'Nazwa', value: transformer.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.transformer },
      ],
    });
    sections.push({
      id: 'topology', label: 'Topologia', fields: [
        { key: 'hv_bus', label: 'Szyna GN (SN)', value: transformer.hv_bus_ref },
        { key: 'lv_bus', label: 'Szyna DN (nN)', value: transformer.lv_bus_ref },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'sn_mva', label: 'Moc znamionowa', value: transformer.sn_mva, unit: 'MVA', source: 'catalog' },
        { key: 'uk_percent', label: 'Napięcie zwarcia uk', value: transformer.uk_percent, unit: '%', source: 'catalog' },
        { key: 'pk_kw', label: 'Straty zwarciowe Pk', value: transformer.pk_kw, unit: 'kW', source: 'catalog' },
        { key: 'tap_position', label: 'Pozycja zaczepu', value: transformer.tap_position ?? 0 },
        { key: 'vector_group', label: 'Grupa wektorowa', value: transformer.vector_group ?? '?', source: 'catalog' },
      ],
    });
    sections.push({
      id: 'catalog', label: 'Katalog', fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: transformer.catalog_ref ?? '?' },
      ],
    });
    actions.push({ id: 'assign_catalog', label: 'Przypisz katalog', op: 'assign_catalog_to_element', context: { element_ref: transformer.ref_id } });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: transformer.ref_id } });
  }

  // Try sources
  const source = snapshot.sources?.find((s) =>
    s.ref_id === elementId
    || s.id === elementId
    || s.substation_ref === elementId
  );
  if (source) {
    elementType = 'source';
    elementName = source.name;
    const sourceBus = findOperationalBus(snapshot, source.bus_ref);
    const sourceSubstation = source.substation_ref
      ? snapshot.substations?.find((station) => station.ref_id === source.substation_ref)
      : null;
    const sourceGpzSection = sourceSubstation?.gpz_sections?.find(
      (section) => section.section_id === source.gpz_section_id,
    ) ?? sourceSubstation?.gpz_sections?.[0] ?? null;
    const sourceGpzField = findFieldForGpzSection(
      fieldItems,
      sourceSubstation?.id,
      sourceSubstation?.ref_id,
      sourceGpzSection?.section_id ?? source.gpz_section_id,
    );
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie GPZ', value: publicTechnicalLabel(source.ref_id, source.name) },
        { key: 'name', label: 'Nazwa', value: source.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.source },
        { key: 'model', label: 'Model zastępczy', value: source.model },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry sieci', fields: [
        { key: 'bus_voltage_kv', label: 'Napięcie szyny', value: sourceBus?.voltage_kv ?? null, unit: 'kV' },
        { key: 'sk3_mva', label: 'Moc zwarciowa Sk3', value: source.sk3_mva ?? null, unit: 'MVA' },
        { key: 'rx_ratio', label: 'Stosunek R/X', value: source.rx_ratio ?? null },
        { key: 'r_ohm', label: 'Rezystancja R', value: source.r_ohm ?? null, unit: 'Ω' },
        { key: 'x_ohm', label: 'Reaktancja X', value: source.x_ohm ?? null, unit: 'Ω' },
      ],
    });
    sections.push({
      id: 'gpz', label: 'Sekcje GPZ', fields: [
        { key: 'substation_ref', label: 'Stacja GPZ', value: sourceSubstation?.name ?? source.substation_ref ?? '?' },
        { key: 'section_id', label: 'Sekcja źródła', value: sourceGpzSection?.section_id ?? source.gpz_section_id ?? '?' },
        { key: 'section_name', label: 'Nazwa sekcji', value: sourceGpzSection?.name ?? '?' },
        { key: 'line_field', label: 'Pole liniowe GPZ', value: sourceGpzField?.bay_name ?? sourceGpzSection?.line_field_name ?? '?' },
      ],
    });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: source.ref_id } });
  }

  // Try substations
  const station = source
    ? null
    : snapshot.substations?.find((s) => s.id === elementId || s.ref_id === elementId);
  if (station) {
    elementType = 'substation';
    const stationIdentity = stationPublicName(snapshot, station);
    elementName = stationIdentity.displayName;
    const stationFieldItems = findFieldsForStation(fieldItems, station.id, station.ref_id);
    const snFieldCount = stationSnFieldCount(station, snapshot.bays, stationFieldItems);
    const snSwitchgearLabel = snFieldCount > 0
      ? `${snFieldCount} pól SN`
      : stationFieldItems.length > 0
        ? `${stationFieldItems.length} pól SN`
        : formatStationSwitchgearLayoutLabelPl(station.station_type);
    const stationTransformers = (snapshot.transformers ?? []).filter((t) =>
      station.transformer_refs.includes(t.ref_id),
    );
    const stationBusRefs = new Set(station.bus_refs ?? []);
    const stationLoads = (snapshot.loads ?? []).filter((load) => stationBusRefs.has(load.bus_ref));
    const stationGenerators = (snapshot.generators ?? []).filter((generator) => {
      const generatorStation = generatorStationRef(generator);
      return generatorStation === station.ref_id || generatorStation === station.id;
    });
    const nnFieldSpecs = stationNnFieldSpecs(station);
    const nnFeederCount = nnFieldSpecs.filter((spec) => spec.bay_role === 'FEEDER').length;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'id', label: 'Oznaczenie stacji', value: stationIdentity.code },
        { key: 'name', label: 'Nazwa', value: stationIdentity.displayName },
        { key: 'station_type', label: 'Typ stacji', value: stationIdentity.typeLabel },
      ],
    });
    sections.push({
      id: 'structure', label: 'Struktura', fields: [
        {
          key: 'bay_count',
          label: 'Rozdzielnica SN',
          value: snSwitchgearLabel,
          source: 'calculated',
        },
        { key: 'transformer_count', label: 'Transformatory', value: stationTransformers.length, source: 'calculated' },
        { key: 'bus_count', label: 'Szyny', value: station.bus_refs.length, source: 'calculated' },
        {
          key: 'nn_feeders',
          label: 'Rozdzielnica nN',
          value: nnFeederCount > 0 ? `${nnFeederCount} odpływów nN` : 'bez odpływów nN',
          source: 'calculated',
        },
        {
          key: 'nn_loads',
          label: 'Odbiory nN',
          value: stationLoads.length > 0
            ? `${stationLoads.length} odbiorów / ${formatLoadPower(stationLoads)}`
            : 'bez odbiorów nN',
          source: 'calculated',
        },
        {
          key: 'der_sources',
          label: 'Układy PV/BESS/FW',
          value: formatStationGeneratorSummary(stationGenerators),
          source: 'calculated',
        },
      ],
    });
    actions.push({ id: 'continue_trunk_from_station', label: 'Kontynuuj ciąg SN', op: 'continue_trunk_segment_sn', variant: 'primary' });
    if (stationTransformers.length === 0) {
      actions.push({ id: 'create_transformer_sn_nn', label: 'Dobierz transformator z katalogu', op: 'add_transformer_sn_nn', context: { station_ref: station.id }, variant: 'primary' });
    }
    actions.push({ id: 'create_converter_source_pv', label: 'Dodaj układ PV z katalogu', op: 'add_converter_source', context: { station_ref: station.id, source_technology: 'PV' } });
    actions.push({ id: 'create_converter_source_bess', label: 'Dodaj układ BESS z katalogu', op: 'add_converter_source', context: { station_ref: station.id, source_technology: 'BESS' } });
    actions.push({ id: 'create_converter_source_fw', label: 'Dodaj układ farmy wiatrowej z katalogu', op: 'add_converter_source', context: { station_ref: station.id, source_technology: 'FW' } });
  }

  // Try generators (PV/BESS)
  const generator = snapshot.generators?.find((g) => g.ref_id === elementId);
  if (generator) {
    const semanticRole = generator.gen_type === 'bess'
      ? 'BESS_CONVERTER'
      : generator.gen_type === 'wind_inverter'
        || generator.gen_type === 'fw_pmsg'
        || generator.gen_type === 'fw_dfig'
        || generator.gen_type === 'fw_scig'
          ? 'WIND_SOURCE'
          : 'PV_INVERTER';
    return buildSemanticConverterSections(
      {
        ...(selectedElement ?? {}),
        id: generator.ref_id,
        type: selectedElement?.type ?? 'Generator',
        name: generator.name,
        semanticHash: selectedElement?.semanticHash ?? `source:${generator.ref_id}`,
        semanticElementKind: 'SOURCE',
        semanticEngineeringRole: semanticRole,
      } as SelectedElement,
      snapshot,
      readinessIssues,
    );
    elementType = generator!.gen_type ?? 'generator';
    elementName = generator!.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie układu PV/BESS/FW', value: publicTechnicalLabel(generator!.ref_id, generator!.name) },
        { key: 'name', label: 'Nazwa', value: generator!.name },
        { key: 'gen_type', label: 'Typ', value: formatElementTypeLabel(generator!.gen_type ?? '') },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'p_mw', label: 'Moc czynna', value: generator!.p_mw, unit: 'MW' },
        { key: 'q_mvar', label: 'Moc bierna', value: generator!.q_mvar ?? null, unit: 'Mvar' },
        { key: 'connection_variant', label: 'Wariant przyłączenia', value: connectionVariantLabel(generator!.connection_variant) },
      ],
    });
    sections.push({
      id: 'catalog', label: 'Katalog', fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: generator!.catalog_ref ?? '?' },
      ],
    });
    actions.push({ id: 'assign_catalog', label: 'Przypisz katalog', op: 'assign_catalog_to_element', context: { element_ref: generator!.ref_id } });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: generator!.ref_id } });
  }

  // Try loads
  const load = snapshot.loads?.find((l) => l.ref_id === elementId);
  if (load) {
    elementType = 'load';
    elementName = load.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie odbioru', value: load.ref_id },
        { key: 'name', label: 'Nazwa', value: load.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.load },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'p_mw', label: 'Moc czynna', value: load.p_mw, unit: 'MW' },
        { key: 'q_mvar', label: 'Moc bierna', value: load.q_mvar, unit: 'Mvar' },
      ],
    });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: load.ref_id } });
  }

  // Sekcja kontroli konfiguracji dla tego elementu.
  const elementBlockers = readinessIssues.filter(
    (issue) => issue.severity === 'BLOCKER' && issueTargetsElement(issue, elementId),
  );
  const elementWarnings = readinessIssues.filter(
    (issue) => issue.severity !== 'BLOCKER' && issueTargetsElement(issue, elementId),
  );
  if (elementBlockers.length > 0 || elementWarnings.length > 0) {
    sections.push({
      id: 'readiness', label: 'Kontrola', fields: [
        ...elementBlockers.map((b, i) => ({
          key: `blocker_${i}`,
          label: 'Konfiguracja',
          value: sanitizeEngineerText(b.message_pl),
        })),
        ...elementWarnings.map((w, i) => ({
          key: `warning_${i}`,
          label: 'Ostrzeżenie',
          value: sanitizeEngineerText(w.message_pl),
        })),
      ],
    });
  }

  return { sections, elementType, elementName, actions };
}

// =============================================================================
// Component
// =============================================================================

export interface InspectorEngineeringViewProps {
  className?: string;
}

export function InspectorEngineeringView({ className }: InspectorEngineeringViewProps) {
  const [segmentCatalogPickerOpen, setSegmentCatalogPickerOpen] = useState(false);
  const selectedElements = useSelectionStore((s) => s.selectedElements);
  const selectedElement = useSelectionStore((s) => s.selectedElements[0] ?? null);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const logicalViews = useSnapshotStore((s) => s.logicalViews);
  const readinessIssues = useReadinessLiveStore((s) => s.issues);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const activeMode = useAppStateStore((s) => s.activeMode);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const {
    itemsByBayId,
    itemsByBayRef,
    data: fieldReadModelData,
    isLoading: isFieldLoading,
    error: fieldReadModelError,
  } = useFieldReadModel();

  const elementId = selectedElements.length > 0 ? selectedElements[0].id : null;
  const selectedBaySnapshot = useMemo(
    () => snapshot?.bays?.find((bay) => bay.id === elementId || bay.ref_id === elementId) ?? null,
    [snapshot, elementId],
  );
  const selectedBayField = useMemo(() => {
    if (!elementId) return null;
    return itemsByBayId.get(elementId)
      ?? itemsByBayRef.get(elementId)
      ?? (selectedBaySnapshot
        ? itemsByBayId.get(selectedBaySnapshot.id) ?? itemsByBayRef.get(selectedBaySnapshot.ref_id)
        : null)
      ?? null;
  }, [elementId, itemsByBayId, itemsByBayRef, selectedBaySnapshot]);
  const isSelectedBay = selectedElement?.type === 'BaySN' || Boolean(selectedBayField);
  const selectedBayName = selectedBayField?.bay_name
    ?? selectedElement?.name
    ?? elementId
    ?? 'Pole';
  const selectedSegment = useMemo(
    () => elementId
      ? snapshot?.branches?.find((branch) => branch.ref_id === elementId || branch.id === elementId) ?? null
      : null,
    [elementId, snapshot],
  );
  const isSelectedSegment = selectedElement?.type === 'LineBranch'
    && (!selectedSegment || isLineCable(selectedSegment));
  const selectedSegmentCatalogRef = selectedSegment?.catalog_ref ?? null;
  const selectedSegmentCatalogNamespace = inferSegmentCatalogNamespace(selectedSegment);
  const selectedSegmentPickerCategory = inferSegmentPickerCategory(selectedSegment);
  const selectedConverterGenerator = useMemo(
    () => selectedElement && snapshot
      ? findGeneratorForSelectedConverter(selectedElement, snapshot)
      : null,
    [selectedElement, snapshot],
  );
  const selectedConverterRole = selectedElement && isConverterSourceSelection(selectedElement)
    ? converterRoleForGenerator(selectedElement, selectedConverterGenerator)
    : null;
  const selectedConverterRef = selectedConverterGenerator?.ref_id ?? (
    selectedConverterRole ? elementId : null
  );
  const calculationProofRefs = useMemo(
    () => buildCalculationProofCandidateRefs(elementId, selectedElement, snapshot),
    [elementId, selectedElement, snapshot],
  );

  const { sections, elementType, elementName, actions } = useMemo(
    () => {
      if (isSelectedBay) {
        return buildBaySections(
          selectedBayField,
          isFieldLoading,
          fieldReadModelError,
          readinessIssues,
          elementId ?? '',
          selectedBayName,
        );
      }
      return buildSectionsForElement(
        elementId ?? '',
        snapshot,
        readinessIssues,
        fieldReadModelData.fields,
        logicalViews,
        selectedElement,
      );
    },
    [
      elementId,
      fieldReadModelError,
      fieldReadModelData.fields,
      isSelectedBay,
      isFieldLoading,
      logicalViews,
      readinessIssues,
      selectedBayField,
      selectedBayName,
      selectedElement,
      snapshot,
    ],
  );

  const handleAction = useCallback(
    (action: QuickAction) => {
      if (!selectedElement) {
        openOperationForm(action.op, action.context);
        return;
      }
      openOperationForm(action.op, buildOperationContext({
        canonicalOp: action.op,
        elementId: selectedElement.id,
        elementType: selectedElement.type,
        snapshot,
        logicalViews,
        extraContext: action.context,
      }));
    },
    [logicalViews, openOperationForm, selectedElement, snapshot],
  );

  const handleOpenConverterSurface = useCallback(() => {
    if (!selectedConverterRole || !selectedConverterRef) return;
    openRouteSurface(converterSurfaceCodeForRole(selectedConverterRole), {
      entityRef: selectedConverterRef,
      entityType: selectedConverterRole === 'PV_INVERTER'
        ? 'pv_source'
        : selectedConverterRole === 'BESS_CONVERTER'
          ? 'bess_source'
          : 'fw_source',
      subjectKind: 'entity',
      titlePl: converterSurfaceTitle(selectedConverterRole),
      payload: {
        derId: selectedConverterRef,
        derName: selectedElement?.name || elementName,
        derRole: selectedConverterRole,
        stationId: selectedConverterGenerator ? generatorStationRef(selectedConverterGenerator) : null,
      },
      openMode: 'replace_right_panel',
    });
  }, [
    openRouteSurface,
    selectedConverterGenerator,
    selectedConverterRef,
    selectedConverterRole,
  ]);

  const handleSelectSegmentCatalog = useCallback(
    (typeId: string) => {
      if (!activeCaseId || !elementId || !selectedSegmentCatalogNamespace) return;
      void executeDomainOperation(activeCaseId, 'assign_catalog_to_element', {
        element_ref: elementId,
        catalog_binding: buildCatalogBinding(selectedSegmentCatalogNamespace, typeId),
        source_mode: 'KATALOG',
      }).finally(() => {
        setSegmentCatalogPickerOpen(false);
      });
    },
    [activeCaseId, elementId, executeDomainOperation, selectedSegmentCatalogNamespace],
  );

  const techCardSubject = useMemo(
    () => buildTechCardSubject(snapshot, selectedElement, { readinessBlocker: null }),
    [snapshot, selectedElement],
  );
  const techCardSubjectWithActions = useMemo(() => {
    if (!techCardSubject) return null;
    const wiredActions = (techCardSubject.actions ?? []).map((action) => {
      const commandMatch = /^open_operation:(.+)$/.exec(action.id);
      if (!commandMatch) return action;
      const opName = commandMatch[1] as NetworkBuildOperationName;
      return {
        ...action,
        onClick: () => {
          if (!selectedElement) return;
          openOperationForm(opName, buildOperationContext({
            canonicalOp: opName,
            elementId: selectedElement.id,
            elementType: selectedElement.type,
            snapshot,
            logicalViews,
            // Klucze semantyczne selekcji (semantic_hash/kind/role) — ta
            // ścieżka (akcje TechCard) je GUBIŁA, w odróżnieniu od
            // `handleAction` (QuickAction.context → extraContext): operacja
            // wywołana z karty traciła tożsamość semantyczną elementu, którą
            // pilnował test „wybiera akcje segmentu po semantyce selekcji…"
            // (wykluczony w vite.config zamiast naprawiony; dług 2026-07-17).
            extraContext: semanticActionContext(selectedElement, {}),
          }));
        },
      };
    });
    return { ...techCardSubject, actions: wiredActions };
  }, [logicalViews, openOperationForm, selectedElement, snapshot, techCardSubject]);

  if (!elementId || sections.length === 0) {
    return (
      <div className={clsx('flex flex-col h-full', className)} data-testid="inspector-engineering">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-xs text-gray-500">Zaznacz element na SLD</p>
            <p className="text-[10px] text-gray-400 mt-1">
              aby zobaczyć szczegóły inżynierskie
            </p>
          </div>
        </div>
      </div>
    );
  }

  const headerIsConverterSource = Boolean(
    selectedConverterRole
      || (selectedElement && isSemanticConverterSource(selectedElement))
      || snapshot?.generators?.some((generator) => generator.ref_id === elementId),
  );
  const publicElementId = publicTechnicalLabel(elementId, elementName);
  // Podtytuł źródła przekształtnikowego: REALNY wariant przyłączenia z ENM
  // (`connection_variant` generatora → `connectionVariantLabel`), nie stała.
  // Poprzedni hardkod „PV za transformatorem SN/nN" kłamał podwójnie: rola
  // (farma wiatrowa/BESS dostawały „PV") i wariant (nn_side ≠ blokowo przez
  // transformator) — dokładnie ta regresja, której pilnował test
  // InspectorEngineeringView „pokazuje kanoniczne etykiety…", wykluczony
  // w vite.config zamiast naprawiony (dług zlikwidowany 2026-07-17).
  const headerSubtitle = headerIsConverterSource
    ? `${formatElementTypeLabel(elementType)} - ${connectionVariantLabel(selectedConverterGenerator?.connection_variant)}`
    : `${formatElementTypeLabel(elementType)} - Oznaczenie: ${publicElementId}`;

  return (
    <div className={clsx('flex flex-col h-full', className)} data-testid="inspector-engineering">
      <div data-testid="sld-engineering-inspector-wrapper" className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800 truncate">{elementName}</h3>
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {headerSubtitle}
        </p>
      </div>

      <ElementCalculationProofPanel
        runId={activeRunId ?? null}
        selectedElement={selectedElement}
        candidateRefs={calculationProofRefs}
      />

      {techCardSubjectWithActions && (
        <div
          data-testid="tech-card-host"
          data-tech-card-subject-kind={techCardSubjectWithActions.kind}
          className="flex max-h-[60vh] min-h-[14rem] flex-col border-b border-gray-200 bg-white"
        >
          <TechCard
            subject={techCardSubjectWithActions}
            onClose={clearSelection}
          />
        </div>
      )}

      {isSelectedSegment && (
        <div
          data-testid="sld-segment-inspector"
          className="border-b border-gray-200 bg-white px-4 py-2 text-[10px] text-gray-700"
        >
          <div className="font-semibold text-gray-800">Odcinek SN</div>
          <div>Oznaczenie: {publicTechnicalLabel(elementId, elementName)}</div>
          <div data-testid="sld-segment-inspector-catalog">
            Katalog: {selectedSegmentCatalogRef ?? 'nie wybrano typu'}
          </div>
          <div data-testid="sld-segment-inspector-catalog-family">
            Przestrzeń katalogu: {selectedSegmentCatalogNamespace ?? 'nie wybrano typu'}
          </div>
          <div data-testid="sld-segment-catalog-status">
            Aktualny typ: {selectedSegmentCatalogRef ?? 'nie wybrano typu'}
          </div>
          {selectedSegmentPickerCategory && (
            <button
              type="button"
              data-testid="sld-segment-open-catalog-picker"
              onClick={() => setSegmentCatalogPickerOpen(true)}
              className="mt-2 rounded border border-gray-300 px-2 py-1 font-medium text-gray-800 hover:bg-gray-50"
            >
              Zmień typ katalogowy
            </button>
          )}
        </div>
      )}

      {selectedConverterRole && (
        <div
          data-testid="pv-inverter-engineering-actions"
          className="border-b border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-700"
        >
          <div className="mb-2 font-semibold text-slate-900">
            {converterSurfaceTitle(selectedConverterRole)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="open-pv-inverter-config"
              onClick={handleOpenConverterSurface}
              className="rounded border border-cyan-300 bg-cyan-50 px-2 py-1.5 text-left font-medium text-cyan-800 hover:border-cyan-500"
            >
              Otwórz konfigurację falownika
            </button>
            <button
              type="button"
              onClick={() => handleAction({
                id: 'edit_converter_parameters',
                label: 'Uzupełnij dane',
                op: 'update_element_parameters',
                context: { element_ref: selectedConverterRef },
              })}
              className="rounded border border-cyan-200 px-2 py-1.5 text-left font-medium text-cyan-800 hover:border-cyan-500"
            >
              Uzupełnij dane wejściowe
            </button>
          </div>
          <div className="mt-2 text-[10px] leading-4 text-cyan-700">
            Karta obejmuje falownik z katalogu, PCC, tor SN/nN, NC RfG, Q(U), P(f),
            FRT/HVRT, rozpływ mocy, wkład zwarciowy i zabezpieczenia nN.
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {sections.map((section, index) => (
          <SectionBlock
            key={`${section.id}:${index}`}
            section={section}
            elementId={elementId}
            activeCaseId={activeCaseId}
            executeDomainOperation={executeDomainOperation}
          />
        ))}

        {selectedBayField && <BayWindowSchematic item={selectedBayField} />}

        {/* Quick actions */}
        {actions.length > 0 && activeMode === 'MODEL_EDIT' && !techCardSubjectWithActions && (
          <div className="px-4 py-3 border-t border-gray-200">
            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Operacje
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleAction(action)}
                  className={clsx(
                    'px-2.5 py-1 text-[10px] font-medium rounded transition-colors',
                    action.variant === 'primary'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : action.variant === 'danger'
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>

      {isSelectedSegment && selectedSegmentPickerCategory && (
        <TypePicker
          isOpen={segmentCatalogPickerOpen}
          category={selectedSegmentPickerCategory}
          currentTypeId={selectedSegmentCatalogRef}
          onSelectType={handleSelectSegmentCatalog}
          onClose={() => setSegmentCatalogPickerOpen(false)}
        />
      )}
    </div>
  );
}

function inferSegmentCatalogNamespace(branch: Branch | null | undefined): CatalogNamespace | null {
  if (branch?.catalog_namespace) return branch.catalog_namespace as CatalogNamespace;
  if (branch?.type === 'line_overhead') return 'LINIA_SN';
  if (branch?.type === 'cable') return 'KABEL_SN';
  return null;
}

function inferSegmentPickerCategory(branch: Branch | null | undefined): TypeCategory | null {
  if (branch?.type === 'line_overhead') return 'LINE';
  if (branch?.type === 'cable') return 'CABLE';
  return null;
}

function pushUniqueRef(target: string[], value: unknown): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed || target.includes(trimmed)) return;
  target.push(trimmed);
}

function pushElementRefs(target: string[], element: unknown, keys: string[]): void {
  if (!element || typeof element !== 'object') return;
  const record = element as Record<string, unknown>;
  for (const key of keys) {
    pushUniqueRef(target, record[key]);
  }
}

function elementMatchesSelection(element: unknown, elementId: string | null): boolean {
  if (!elementId || !element || typeof element !== 'object') return false;
  const record = element as Record<string, unknown>;
  return [record.id, record.ref_id, record.name].some((value) => value === elementId);
}

function buildCalculationProofCandidateRefs(
  elementId: string | null,
  selectedElement: SelectedElement | null,
  snapshot: EnergyNetworkModel | null,
): string[] {
  const refs: string[] = [];
  pushUniqueRef(refs, elementId);
  pushUniqueRef(refs, selectedElement?.id);
  pushUniqueRef(refs, selectedElement?.name);

  if (!snapshot || !elementId) {
    return refs;
  }

  const bus = snapshot.buses?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, bus, ['id', 'ref_id', 'name']);

  const branch = snapshot.branches?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, branch, [
    'id',
    'ref_id',
    'name',
    'from_bus_ref',
    'to_bus_ref',
  ]);

  const transformer = snapshot.transformers?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, transformer, [
    'id',
    'ref_id',
    'name',
    'hv_bus_ref',
    'lv_bus_ref',
  ]);

  const bay = snapshot.bays?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, bay, [
    'id',
    'ref_id',
    'name',
    'bus_ref',
    'substation_ref',
  ]);

  const generator = snapshot.generators?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, generator, [
    'id',
    'ref_id',
    'name',
    'bus_ref',
    'station_ref',
  ]);

  const load = snapshot.loads?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, load, [
    'id',
    'ref_id',
    'name',
    'bus_ref',
  ]);

  const source = snapshot.sources?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, source, [
    'id',
    'ref_id',
    'name',
    'bus_ref',
    'substation_ref',
  ]);

  const station = snapshot.substations?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, station, ['id', 'ref_id', 'name']);
  for (const busRef of station?.bus_refs ?? []) pushUniqueRef(refs, busRef);
  for (const transformerRef of station?.transformer_refs ?? []) pushUniqueRef(refs, transformerRef);

  if (bus) {
    for (const item of snapshot.branches ?? []) {
      if (item.from_bus_ref === bus.ref_id || item.to_bus_ref === bus.ref_id) {
        pushElementRefs(refs, item, ['id', 'ref_id', 'name']);
      }
    }
  }

  return refs;
}

// =============================================================================
// SectionBlock
// =============================================================================

function SectionBlock({
  section,
  elementId,
  activeCaseId,
  executeDomainOperation,
}: {
  section: PropertySection;
  elementId: string;
  activeCaseId: string | null;
  executeDomainOperation: (
    caseId: string,
    opName: NetworkBuildOperationName,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
}) {
  return (
    <div
      className="border-b border-gray-100"
      data-testid={`engineering-section-${sectionTestId(section)}`}
    >
      <div className="px-4 py-2">
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {section.label}
        </h4>
        <div className="space-y-1">
          {section.fields.map((field, index) => (
            <EngineeringField
              key={`${field.key}:${index}`}
              field={field}
              elementId={elementId}
              activeCaseId={activeCaseId}
              executeDomainOperation={executeDomainOperation}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EngineeringField({
  field,
  elementId,
  activeCaseId,
  executeDomainOperation,
}: {
  field: PropertyField;
  elementId: string;
  activeCaseId: string | null;
  executeDomainOperation: (
    caseId: string,
    opName: NetworkBuildOperationName,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
}) {
  const editable = field.key === 'name';
  const formattedInitialValue = formatValue(field.value);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formattedInitialValue);
  const showUnit = Boolean(field.unit) && !isMissingFieldValue(value);

  const reset = useCallback(() => {
    setValue(formatValue(field.value));
    setEditing(false);
  }, [field.value]);

  const commit = useCallback(() => {
    setEditing(false);
    if (!editable || !activeCaseId || !elementId) return;
    const nextValue = value.trim();
    if (!nextValue || nextValue === formatValue(field.value)) return;
    void executeDomainOperation(activeCaseId, 'update_element_parameters', {
      element_ref: elementId,
      parameters: { [field.key]: nextValue },
    });
  }, [activeCaseId, editable, elementId, executeDomainOperation, field.key, field.value, value]);

  const valueClassName = clsx(
    'text-[11px] font-medium text-right truncate max-w-[55%]',
    editable ? 'cursor-pointer rounded px-1 hover:bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-400' : '',
    field.source === 'catalog' ? 'text-blue-700' : 'text-gray-800',
    field.source === 'calculated' ? 'text-green-700 italic' : '',
    field.label === 'Konfiguracja' ? 'text-red-600 font-normal' : '',
    field.label === 'Ostrzeżenie' ? 'text-amber-600 font-normal' : '',
  );

  return (
    <div
      data-testid={`engineering-field-${field.key}`}
      className="flex items-baseline justify-between gap-2"
    >
      <span className="text-[11px] text-gray-500 flex-shrink-0">{field.label}</span>
      {editing ? (
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Tab') {
              commit();
            }
            if (event.key === 'Escape') {
              reset();
            }
          }}
          className="max-w-[60%] rounded border border-blue-300 bg-white px-1.5 py-0.5 text-right text-[11px] font-medium text-gray-900 shadow-sm"
          autoFocus
        />
      ) : (
        <div
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : undefined}
          className={valueClassName}
          title={value}
          onClick={editable ? () => setEditing(true) : undefined}
          onKeyDown={editable ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setEditing(true);
            }
          } : undefined}
        >
          {value}
          {showUnit && <span className="text-gray-400 ml-0.5"> {field.unit}</span>}
        </div>
      )}
    </div>
  );
}

function sectionTestId(section: PropertySection): string {
  if (section.id === 'catalog') return 'typ_i_katalog';
  return slugForTestId(section.label || section.id);
}

function slugForTestId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return 'nie podano';
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') {
    return value.toLocaleString('pl-PL', { maximumFractionDigits: 4 });
  }
  const sanitized = sanitizeEngineerText(
    sanitizeDisplayValue(String(value), { fallback: 'do konfiguracji' }),
  );
  if (isMissingFieldValue(sanitized)) return 'do konfiguracji';
  return sanitized;
}

function sanitizeEngineerText(value: string): string {
  const normalized = value.trim();
  if (!normalized) return 'do konfiguracji';
  if (isRawTechnicalIdentifier(normalized)) return 'oznaczenie techniczne';
  if (/^(?:brak danych|nie podano|nie wyznaczono|\?)$/i.test(normalized)) return 'do konfiguracji';
  const legacyConverterTerm = new RegExp(
    [
      String.raw`\bbrak katalogu `,
      String.raw`(?:źródła|zrodla) `,
      String.raw`(?:przekształtnikowego|przeksztaltnikowego)\b`,
    ].join(''),
    'gi',
  );
  const legacyConverterGenitive = new RegExp(
    String.raw`\b(?:źródła|zrodla) (?:przekształtnikowego|przeksztaltnikowego)\b`,
    'gi',
  );
  const legacyConverterNominative = new RegExp(
    String.raw`\b(?:źródło|zrodlo) (?:przekształtnikowe|przeksztaltnikowe)\b`,
    'gi',
  );
  return normalized
    .replace(/\b(?:seg|gpz|stn|bay|bus|src)\/[a-z0-9/_#-]{12,}/gi, 'element techniczny')
    .replace(/\b[0-9a-f]{24,}\b/gi, 'element techniczny')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'element techniczny')
    .replace(legacyConverterTerm, 'Wymagany wariant katalogowy układu PV/BESS/FW')
    .replace(legacyConverterGenitive, 'układu PV/BESS/FW')
    .replace(legacyConverterNominative, 'układ PV/BESS/FW')
    .replace(/\bbrak danych\b/gi, 'do konfiguracji')
    .replace(/\bblokad[ay]?\b/gi, 'zagadnienie konfiguracji')
    .replace(/\bgotowości\b/gi, 'konfiguracji');
}

function isMissingFieldValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'brak danych'
    || normalized === 'do konfiguracji'
    || normalized === 'nie podano'
    || normalized === 'oznaczenie techniczne'
    || normalized === 'nie wyznaczono'
    || normalized === 'wynik częściowy'
    || normalized === 'wynik zablokowany'
    || normalized === 'zablokowane'
    || normalized === '-'
    || normalized === '—';
}
