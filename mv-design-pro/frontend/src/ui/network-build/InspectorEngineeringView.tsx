/**
 * InspectorEngineeringView â€” Inspektor inĹĽynierski pogrupowany domenowo.
 *
 * WyĹ›wietla peĹ‚ne dane wybranego elementu sieci w sekcjach:
 * 1. Identyfikacja (ref_id, nazwa, typ elementu, stacja nadrzÄ™dna)
 * 2. Parametry elektryczne (napiÄ™cie, impedancja, moc, prÄ…d)
 * 3. Topologia (szyna od, szyna do, magistrala, odgaĹ‚Ä™zienie)
 * 4. Katalog (pozycja katalogowa, source=catalog/override)
 * 5. Eksploatacja (stan Ĺ‚Ä…cznika, NOP, w eksploatacji)
 * 6. GotowoĹ›Ä‡ (blokery/ostrzeĹĽenia dotyczÄ…ce tego elementu)
 * 7. Operacje (przyciski akcji kontekstowych)
 *
 * REUĹ»YCIE: snapshotStore + selectionStore.
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo } from 'react';
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
import { useNetworkBuildStore } from './networkBuildStore';
import { useAppStateStore } from '../app-state';
import { useReadinessLiveStore } from '../engineering-readiness/readinessLiveStore';
import { issueTargetsElement } from '../topology/liveReadiness';
import { formatStationTypeLabelPl } from '../shared/stationTypeLabels';
import type { ReadinessIssue, SelectedElement } from '../types';
import type { EnergyNetworkModel, Branch, LogicalViewsV1 } from '../../types/enm';
import type { NetworkBuildOperationName } from './networkBuildStore';
import { buildOperationContext } from './operationContext';
import { findOperationalBus } from '../shared/enmVisibility';

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
  return values.join(', ');
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
              label: isLoading ? 'Stan odczytu' : 'Stan modelu',
              value: isLoading
                ? 'Ladowanie widoku pola...'
                : error ?? 'Brak kanonicznego modelu pola dla wybranego elementu.',
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
      label: issue.severity === 'BLOCKER' ? 'Blokada' : 'Ostrzezenie',
      value: issue.message_pl,
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
            label: 'Integralnosc modelu',
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
            label: 'Lacznosc urzadzenia wtorego',
            value: communicationStatusLabel(runtimeState?.secondary_communication_status),
          },
          {
            key: 'last_good_update',
            label: 'Ostatnia poprawna aktualizacja',
            value: runtimeState?.last_good_update_at ?? null,
          },
          {
            key: 'control_availability',
            label: 'Dostepnosc sterowania',
            value: availabilityLabel(runtimeState?.control_availability),
          },
          {
            key: 'measurement_availability',
            label: 'Dostepnosc pomiarow',
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
            label: 'Przyczyna braku bezpieczenstwa',
            value: runtimeState?.energization_and_safety.unsafe_reason_pl ?? null,
          },
          {
            key: 'energized_bus',
            label: 'Zasilanie od strony szyn',
            value: runtimeState?.energization_and_safety.energized_from_bus_side ?? null,
          },
          {
            key: 'energized_feeder',
            label: 'Zasilanie od strony odplywu',
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
          ? baseModel.primary_devices.map((device) => ({
              key: `device_${device.device_ref}`,
              label: device.device_ref,
              value: `${deviceKindLabel(device.kind)} - ${switchStateLabel(device.switch_state?.actual_state ?? null)}`,
            }))
          : [
              {
                key: 'no_devices',
                label: 'Brak aparatow',
                value: 'Model pola nie zawiera aparatow pierwotnych.',
              },
            ],
      },
      {
        id: 'measurements',
        label: 'Tor pomiarowy',
        fields: [
          { key: 'chain_ref', label: 'Identyfikator toru', value: measurementChain?.chain_ref ?? null },
          { key: 'ct_refs', label: 'Przekladniki pradowe', value: joinValues(measurementChain?.ct_refs) },
          { key: 'vt_refs', label: 'Przekladniki napieciowe', value: joinValues(measurementChain?.vt_refs) },
          { key: '3i0', label: 'Zrodlo 3I0', value: measurementChain?.zero_sequence_current_source ?? null },
          { key: '3u0', label: 'Zrodlo 3U0', value: measurementChain?.zero_sequence_voltage_source ?? null },
        ],
      },
      {
        id: 'protection',
        label: 'Zabezpieczenie pola',
        fields: [
          { key: 'unit_ref', label: 'Jednostka wtora', value: protection?.unit_ref ?? null },
          { key: 'model', label: 'Model', value: protection?.model ?? null },
          {
            key: 'functions',
            label: 'Funkcje aktywne',
            value: joinValues(protection?.functions.map((entry) => entry.code)) ?? 'Brak',
          },
          { key: 'spz', label: 'SPZ', value: protection?.spz?.state ?? 'Brak SPZ' },
        ],
      },
      {
        id: 'control',
        label: 'Sterowanie i blokady',
        fields: [
          {
            key: 'controllable',
            label: 'Aparaty sterowalne',
            value: joinValues(baseModel.control_surface.controllable_device_refs) ?? 'Brak',
          },
          {
            key: 'open_confirm',
            label: 'Potwierdzenie otwarcia',
            value: baseModel.control_surface.open_requires_confirmation,
          },
          {
            key: 'close_confirm',
            label: 'Potwierdzenie zamkniecia',
            value: baseModel.control_surface.close_requires_confirmation,
          },
          {
            key: 'interlocks',
            label: 'Aktywne blokady',
            value: joinValues(activeInterlocks.map((entry) => entry.code)) ?? 'Brak',
          },
        ],
      },
      ...(sourceEndpoint
        ? [{
            id: 'source',
            label: 'Endpoint zrodlowy',
            fields: [
              { key: 'source_kind', label: 'Rodzaj zrodla', value: sourceKindLabel(sourceEndpoint.source_kind) },
              { key: 'requires_vt', label: 'Wymaga toru przekladnika napieciowego', value: sourceEndpoint.requires_vt },
              { key: 'requires_sync', label: 'Wymaga synchronizmu', value: sourceEndpoint.requires_synchrocheck },
              { key: 'operating_mode', label: 'Tryb pracy', value: sourceEndpoint.operating_mode },
            ],
          }]
        : []),
      {
        id: 'results',
        label: 'Wyniki projektowe pola',
        fields: [
          { key: 'run_ref', label: 'Obliczenie', value: projectResults?.run_ref ?? null },
          { key: 'result_state', label: 'Stan wynikow', value: resultStateLabel(projectResults?.result_state) },
          { key: 'result_message', label: 'Opis wynikow', value: projectResults?.result_message_pl ?? null },
          {
            key: 'sc_contributions',
            label: 'Wklady zrodel w zwarciu',
            value: projectResults?.source_contributions_sc.length ?? null,
          },
          {
            key: 'pf_contributions',
            label: 'Wklady zrodel w rozplywie',
            value: projectResults?.source_contributions_pf.length ?? null,
          },
          {
            key: 'earth_fault',
            label: 'Tor ziemnozwarciowy',
            value: projectResults?.earth_fault_path?.neutral_grounding_mode ?? null,
          },
          {
            key: 'whole_path',
            label: 'Tor pola spelnia wymagania',
            value: projectResults?.verification.whole_power_path_ok ?? null,
          },
        ],
      },
      {
        id: 'proof',
        label: 'Wywod pola',
        fields: [
          { key: 'proof_ref', label: 'Identyfikator wywodu', value: projectResults?.proof_binding.proof_ref ?? null },
          {
            key: 'input_refs',
            label: 'Powiazane dane wejsciowe',
            value: projectResults?.proof_binding.input_data_refs.length ?? null,
          },
          {
            key: 'source_refs',
            label: 'Powiazane wklady zrodel',
            value: projectResults?.proof_binding.source_contribution_refs.length ?? null,
          },
        ],
      },
      ...(activeAlarms.length || readinessMessages.length
        ? [{
            id: 'alarms',
            label: 'Alarmy i gotowosc',
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
  branch: 'GaĹ‚Ä…Ĺş',
  line_overhead: 'Linia napowietrzna',
  cable: 'Kabel SN',
  transformer: 'Transformator',
  source: 'ĹąrĂłdĹ‚o zasilania',
  load: 'ObciÄ…ĹĽenie',
  switch: 'ÄąÂĂ„â€¦cznik',
  breaker: 'WyĹ‚Ä…cznik',
  disconnector: 'OdĹ‚Ä…cznik',
  fuse: 'Bezpiecznik',
  bus_coupler: 'SprzÄ™gĹ‚o szynowe',
  substation: 'Stacja',
  bay: 'Pole',
  generator: 'Generator',
  pv_inverter: 'ĹąrĂłdĹ‚o przeksztaĹ‚tnikowe PV',
  bess_inverter: 'ĹąrĂłdĹ‚o przeksztaĹ‚tnikowe BESS',
  wind_inverter: 'ĹąrĂłdĹ‚o przeksztaĹ‚tnikowe FW',
  synchronous: 'Generator synchroniczny',
  genset: 'Agregat',
  ups: 'UPS',
  ct: 'PrzekĹ‚adnik prÄ…dowy',
  vt: 'PrzekĹ‚adnik napiÄ™ciowy',
  relay: 'Zabezpieczenie',
  branch_pole: 'SĹ‚up rozgaĹ‚Ä™Ĺşny SN',
  zksn: 'ZKSN SN',
  BUSBAR_SECTION: 'Szyna',
  BUSBAR_SYSTEM: 'System szyn',
  MV_CABLE_SEGMENT: 'Odcinek kablowy SN',
  MV_OVERHEAD_SEGMENT: 'Odcinek napowietrzny SN',
  MV_BRANCH_POINT: 'Punkt rozgalezienia SN',
  MV_LV_TRANSFORMER: 'Transformator SN/nN',
  TRANSFORMER: 'Transformator',
  GPZ: 'GPZ',
  SOURCE: 'Zrodlo',
  PV_INVERTER: 'Zrodlo przeksztaltnikowe PV',
  BESS_CONVERTER: 'Magazyn energii BESS',
  WIND_SOURCE: 'Zrodlo wiatrowe',
  LV_LOAD_NODE: 'Odbior nN',
};

function connectionVariantLabel(variant: string | null | undefined): string {
  if (!variant) return 'â€”';
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

// =============================================================================
// Helpers: branch type guard
// =============================================================================

function isLineCable(b: Branch): b is Branch & { type: 'line_overhead' | 'cable' } {
  return b.type === 'line_overhead' || b.type === 'cable';
}

interface SegmentTechnicalPayload {
  length_km?: number | null;
  r_ohm_per_km?: number | null;
  x_ohm_per_km?: number | null;
  rating?: { in_a?: number | null } | null;
  catalog_ref?: string | null;
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

function isSemanticGpzSource(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'GPZ'
    || selectedElement.semanticEngineeringRole === 'GPZ_SUPPLY_NODE';
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
        { key: 'semantic_hash', label: 'Hash semantyczny', value: selectedElement.semanticHash ?? null },
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
      label: 'Wstaw stacje',
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
        { key: 'length_km', label: 'Dlugosc', value: segmentPayload.length_km ?? null, unit: 'km' },
        { key: 'r_ohm', label: 'Rezystancja R\'', value: segmentPayload.r_ohm_per_km ?? null, unit: 'ohm/km', source: 'catalog' },
        { key: 'x_ohm', label: 'Reaktancja X\'', value: segmentPayload.x_ohm_per_km ?? null, unit: 'ohm/km', source: 'catalog' },
        { key: 'rating', label: 'Obciazalnosc dlugotrwala', value: segmentPayload.rating?.in_a ?? null, unit: 'A', source: 'catalog' },
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
      label: 'Wstaw slup rozgalezny',
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
      label: 'Gotowosc',
      fields: [
        ...elementBlockers.map((b, i) => ({
          key: `blocker_${i}`,
          label: 'Blokada',
          value: b.message_pl,
        })),
        ...elementWarnings.map((w, i) => ({
          key: `warning_${i}`,
          label: 'Ostrzezenie',
          value: w.message_pl,
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
  const generator = snapshot.generators?.find((g) => g.ref_id === selectedElement.id);
  const elementName = generator?.name ?? selectedElement.name;
  const sections: PropertySection[] = [
    {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'ref_id', label: 'Oznaczenie zrodla', value: selectedElement.id },
        { key: 'name', label: 'Nazwa', value: elementName },
        { key: 'type', label: 'Typ', value: semanticTypeLabel(selectedElement) },
        { key: 'engineering_role', label: 'Rola semantyczna', value: selectedElement.semanticEngineeringRole ?? null },
        { key: 'semantic_hash', label: 'Hash semantyczny', value: selectedElement.semanticHash ?? null },
      ],
    },
  ];

  if (generator) {
    sections.push({
      id: 'electrical',
      label: 'Parametry elektryczne',
      fields: [
        { key: 'p_mw', label: 'Moc czynna', value: generator.p_mw, unit: 'MW' },
        { key: 'q_mvar', label: 'Moc bierna', value: generator.q_mvar ?? null, unit: 'Mvar' },
        { key: 'connection_variant', label: 'Wariant przylaczenia', value: connectionVariantLabel(generator.connection_variant) },
      ],
    });
    sections.push({
      id: 'catalog',
      label: 'Katalog',
      fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: generator.catalog_ref ?? '?' },
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

function buildSemanticGpzSections(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
  readinessIssues: ReadinessIssue[],
  fieldItems: readonly FieldReadModelItem[],
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  const source = snapshot.sources?.find((s) => s.ref_id === selectedElement.id);
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
        { key: 'ref_id', label: 'Oznaczenie zrodla', value: selectedElement.id },
        { key: 'name', label: 'Nazwa', value: elementName },
        { key: 'type', label: 'Typ', value: semanticTypeLabel(selectedElement) },
        { key: 'engineering_role', label: 'Rola semantyczna', value: selectedElement.semanticEngineeringRole ?? null },
        { key: 'semantic_hash', label: 'Hash semantyczny', value: selectedElement.semanticHash ?? null },
        ...(source?.model ? [{ key: 'model', label: 'Model zastepczy', value: source.model }] : []),
      ],
    },
  ];

  if (source) {
    sections.push({
      id: 'electrical',
      label: 'Parametry sieci',
      fields: [
        { key: 'bus_voltage_kv', label: 'Napiecie szyny', value: sourceBus?.voltage_kv ?? null, unit: 'kV' },
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
        { key: 'section_id', label: 'Sekcja zrodla', value: sourceGpzSection?.section_id ?? source.gpz_section_id ?? '-' },
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
    return buildSemanticConverterSections(selectedElement, snapshot, readinessIssues);
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
        { key: 'semantic_hash', label: 'Hash semantyczny', value: selectedElement.semanticHash ?? null },
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
  const branch = snapshot.branches?.find((b) => b.ref_id === elementId);
  if (branch) {
    const fromStation = snapshot.substations?.find((s) =>
      s.bus_refs?.includes(branch.from_bus_ref),
    );
    if (fromStation) return fromStation.name;
  }
  return null;
}

function matchesStationRef(
  item: FieldReadModelItem,
  stationId: string | null | undefined,
  stationRef: string | null | undefined,
): boolean {
  const itemStationRef = item.canonical_model.base_model.substation_ref;
  return Boolean(
    itemStationRef
      && (itemStationRef === stationId || itemStationRef === stationRef),
  );
}

function findFieldsForStation(
  items: readonly FieldReadModelItem[],
  stationId: string | null | undefined,
  stationRef: string | null | undefined,
): FieldReadModelItem[] {
  return items.filter((item) => matchesStationRef(item, stationId, stationRef));
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
        { key: 'voltage_kv', label: 'NapiÄ™cie znamionowe', value: bus.voltage_kv, unit: 'kV' },
      ],
    });
  }

  // Try branches
  const branch = snapshot.branches?.find((b) => b.ref_id === elementId);
  if (branch) {
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
        { key: 'parent_station', label: 'Stacja nadrzÄ™dna', value: branchParent },
      );
    }
    // Role context from logical views
    if (logicalViews) {
      let roleLabel = 'â€”';
      const isTrunk = logicalViews.trunks?.some((t) => t.segments?.includes(elementId));
      const isBranch = logicalViews.branches?.some((br) => br.segments?.includes(elementId));
      const isSecondary = logicalViews.secondary_connectors?.some((sc) => sc.segment_ref === elementId);
      if (isTrunk) roleLabel = 'Magistrala';
      else if (isBranch) roleLabel = 'OdgaĹ‚Ä™zienie';
      else if (isSecondary) roleLabel = 'PoĹ‚Ä…czenie pierĹ›cieniowe';
      sections[sections.length - 1].fields.push(
        { key: 'role', label: 'Rola w sieci', value: roleLabel },
      );
    }
    sections.push({
      id: 'topology', label: 'Topologia', fields: [
        { key: 'from_bus', label: 'Szyna poczÄ…tkowa', value: branch.from_bus_ref },
        { key: 'to_bus', label: 'Szyna koĹ„cowa', value: branch.to_bus_ref },
      ],
    });
    if (isLineCable(branch)) {
      sections.push({
        id: 'electrical', label: 'Parametry elektryczne', fields: [
          { key: 'length_km', label: 'DĹ‚ugoĹ›Ä‡', value: branch.length_km, unit: 'km' },
          { key: 'r_ohm', label: 'Rezystancja R\'', value: branch.r_ohm_per_km, unit: 'Î©/km', source: 'catalog' },
          { key: 'x_ohm', label: 'Reaktancja X\'', value: branch.x_ohm_per_km, unit: 'Î©/km', source: 'catalog' },
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
      actions.push({ id: 'insert_station_on_segment_sn', label: 'Wstaw stacjÄ™', op: 'insert_station_on_segment_sn', context: { segment_ref: branch.ref_id } });
      if (branch.type === 'line_overhead') {
        actions.push({ id: 'insert_branch_pole_on_segment_sn', label: 'Wstaw sĹ‚up rozgaĹ‚Ä™Ĺşny', op: 'insert_branch_pole_on_segment_sn', context: { segment_ref: branch.ref_id } });
      }
      if (branch.type === 'cable') {
        actions.push({ id: 'insert_zksn_on_segment_sn', label: 'Wstaw ZKSN', op: 'insert_zksn_on_segment_sn', context: { segment_ref: branch.ref_id } });
      }
      actions.push({ id: 'insert_section_switch_sn', label: 'Wstaw Ĺ‚Ä…cznik', op: 'insert_section_switch_sn', context: { segmentRef: branch.ref_id, segmentLabel: branch.name } });
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
        { key: 'ref_id', label: 'Oznaczenie punktu rozgaĹ‚Ä™zienia', value: branchPoint.ref_id },
        { key: 'name', label: 'Nazwa', value: branchPoint.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS[branchPoint.branch_point_type] ?? branchPoint.branch_point_type },
      ],
    });
    sections.push({
      id: 'topology',
      label: 'Topologia',
      fields: [
        { key: 'parent_segment_id', label: 'Segment nadrzÄ™dny', value: branchPoint.parent_segment_id },
        { key: 'main_in', label: 'Port główny wejściowy', value: branchPoint.ports?.MAIN_IN ?? '?' },
        { key: 'main_out', label: 'Port główny wyjściowy', value: branchPoint.ports?.MAIN_OUT ?? '?' },
        { key: 'branch_ports', label: 'Porty odgalezien', value: branchPoint.ports?.BRANCH?.join(', ') ?? '?' },
      ],
    });
    sections.push({
      id: 'catalog',
      label: 'Katalog',
      fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: branchPoint.catalog_ref ?? '?' },
      ],
    });
    actions.push({ id: 'start_branch_segment_sn', label: 'Dodaj odgaĹ‚Ä™zienie', op: 'start_branch_segment_sn' });
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
        { key: 'uk_percent', label: 'NapiÄ™cie zwarcia uk', value: transformer.uk_percent, unit: '%', source: 'catalog' },
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
  const source = snapshot.sources?.find((s) => s.ref_id === elementId);
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
        { key: 'ref_id', label: 'Oznaczenie ĹşrĂłdĹ‚a', value: source.ref_id },
        { key: 'name', label: 'Nazwa', value: source.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.source },
        { key: 'model', label: 'Model zastÄ™pczy', value: source.model },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry sieci', fields: [
        { key: 'bus_voltage_kv', label: 'Napięcie szyny', value: sourceBus?.voltage_kv ?? null, unit: 'kV' },
        { key: 'sk3_mva', label: 'Moc zwarciowa SkĂ˘â€šÂ', value: source.sk3_mva ?? null, unit: 'MVA' },
        { key: 'rx_ratio', label: 'Stosunek R/X', value: source.rx_ratio ?? null },
        { key: 'r_ohm', label: 'Rezystancja R', value: source.r_ohm ?? null, unit: 'Ω' },
        { key: 'x_ohm', label: 'Reaktancja X', value: source.x_ohm ?? null, unit: 'Ω' },
      ],
    });
    sections.push({
      id: 'gpz', label: 'Sekcje GPZ', fields: [
        { key: 'substation_ref', label: 'Stacja GPZ', value: sourceSubstation?.name ?? source.substation_ref ?? '—' },
        { key: 'section_id', label: 'Sekcja źródła', value: sourceGpzSection?.section_id ?? source.gpz_section_id ?? '—' },
        { key: 'section_name', label: 'Nazwa sekcji', value: sourceGpzSection?.name ?? '—' },
        { key: 'line_field', label: 'Pole liniowe GPZ', value: sourceGpzField?.bay_name ?? sourceGpzSection?.line_field_name ?? '—' },
      ],
    });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: source.ref_id } });
  }

  // Try substations
  const station = snapshot.substations?.find((s) => s.id === elementId);
  if (station) {
    elementType = 'substation';
    elementName = station.name;
    const stationFields = findFieldsForStation(fieldItems, station.id, station.ref_id);
    const stationTransformers = (snapshot.transformers ?? []).filter((t) =>
      station.transformer_refs.includes(t.ref_id),
    );
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'id', label: 'Oznaczenie stacji', value: station.id },
        { key: 'name', label: 'Nazwa', value: station.name },
        { key: 'station_type', label: 'Typ stacji', value: formatStationTypeLabelPl(station.station_type) },
      ],
    });
    sections.push({
      id: 'structure', label: 'Struktura', fields: [
        { key: 'bay_count', label: 'Pola SN', value: stationFields.length, source: 'calculated' },
        { key: 'transformer_count', label: 'Transformatory', value: stationTransformers.length, source: 'calculated' },
        { key: 'bus_count', label: 'Szyny', value: station.bus_refs.length, source: 'calculated' },
      ],
    });
    actions.push({ id: 'create_transformer_sn_nn', label: 'Dodaj transformator', op: 'add_transformer_sn_nn', context: { station_ref: station.id }, variant: 'primary' });
    actions.push({ id: 'create_converter_source_pv', label: 'Dodaj ĹşrĂłdĹ‚o przeksztaĹ‚tnikowe PV', op: 'add_converter_source', context: { station_ref: station.id, source_technology: 'PV' } });
    actions.push({ id: 'create_converter_source_bess', label: 'Dodaj ĹşrĂłdĹ‚o przeksztaĹ‚tnikowe BESS', op: 'add_converter_source', context: { station_ref: station.id, source_technology: 'BESS' } });
    actions.push({ id: 'create_converter_source_fw', label: 'Dodaj ĹşrĂłdĹ‚o przeksztaĹ‚tnikowe FW', op: 'add_converter_source', context: { station_ref: station.id, source_technology: 'FW' } });
  }

  // Try generators (PV/BESS)
  const generator = snapshot.generators?.find((g) => g.ref_id === elementId);
  if (generator) {
    elementType = generator.gen_type ?? 'generator';
    elementName = generator.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie ĹşrĂłdĹ‚a przeksztaĹ‚tnikowego', value: generator.ref_id },
        { key: 'name', label: 'Nazwa', value: generator.name },
        { key: 'gen_type', label: 'Typ', value: formatElementTypeLabel(generator.gen_type ?? '') },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'p_mw', label: 'Moc czynna', value: generator.p_mw, unit: 'MW' },
        { key: 'q_mvar', label: 'Moc bierna', value: generator.q_mvar ?? null, unit: 'Mvar' },
        { key: 'connection_variant', label: 'Wariant przyĹ‚Ä…czenia', value: connectionVariantLabel(generator.connection_variant) },
      ],
    });
    sections.push({
      id: 'catalog', label: 'Katalog', fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: generator.catalog_ref ?? '?' },
      ],
    });
    actions.push({ id: 'assign_catalog', label: 'Przypisz katalog', op: 'assign_catalog_to_element', context: { element_ref: generator.ref_id } });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: generator.ref_id } });
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

  // Readiness section â€” blockers/warnings for this element
  const elementBlockers = readinessIssues.filter(
    (issue) => issue.severity === 'BLOCKER' && issueTargetsElement(issue, elementId),
  );
  const elementWarnings = readinessIssues.filter(
    (issue) => issue.severity !== 'BLOCKER' && issueTargetsElement(issue, elementId),
  );
  if (elementBlockers.length > 0 || elementWarnings.length > 0) {
    sections.push({
      id: 'readiness', label: 'GotowoĹ›Ä‡', fields: [
        ...elementBlockers.map((b, i) => ({
          key: `blocker_${i}`,
          label: 'Blokada',
          value: b.message_pl,
        })),
        ...elementWarnings.map((w, i) => ({
          key: `warning_${i}`,
          label: 'OstrzeĹĽenie',
          value: w.message_pl,
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
  const selectedElements = useSelectionStore((s) => s.selectedElements);
  const selectedElement = useSelectionStore((s) => s.selectedElements[0] ?? null);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const logicalViews = useSnapshotStore((s) => s.logicalViews);
  const readinessIssues = useReadinessLiveStore((s) => s.issues);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const activeMode = useAppStateStore((s) => s.activeMode);
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

  if (!elementId || sections.length === 0) {
    return (
      <div className={clsx('flex flex-col h-full', className)} data-testid="inspector-engineering">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-xs text-gray-500">Zaznacz element na SLD</p>
            <p className="text-[10px] text-gray-400 mt-1">
              aby zobaczyÄ‡ szczegĂłĹ‚y inĹĽynierskie
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col h-full', className)} data-testid="inspector-engineering">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800 truncate">{elementName}</h3>
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {formatElementTypeLabel(elementType)} &middot; Oznaczenie: {elementId}
        </p>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {sections.map((section) => (
          <SectionBlock key={section.id} section={section} />
        ))}

        {selectedBayField && <BayWindowSchematic item={selectedBayField} />}

        {/* Quick actions */}
        {actions.length > 0 && activeMode === 'MODEL_EDIT' && (
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
  );
}

// =============================================================================
// SectionBlock
// =============================================================================

function SectionBlock({ section }: { section: PropertySection }) {
  return (
    <div className="border-b border-gray-100">
      <div className="px-4 py-2">
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {section.label}
        </h4>
        <div className="space-y-1">
          {section.fields.map((field) => (
            <div key={field.key} className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-gray-500 flex-shrink-0">{field.label}</span>
              <span
                className={clsx(
                  'text-[11px] font-medium text-right truncate max-w-[55%]',
                  field.source === 'catalog' ? 'text-blue-700' : 'text-gray-800',
                  field.source === 'calculated' ? 'text-green-700 italic' : '',
                  field.label === 'Blokada' ? 'text-red-600 font-normal' : '',
                  field.label === 'Ostrzeżenie' ? 'text-amber-600 font-normal' : '',
                )}
                title={String(field.value ?? '?')}
              >
                {formatValue(field.value)}
                {field.unit && <span className="text-gray-400 ml-0.5">{field.unit}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return 'â€”';
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') {
    return value.toLocaleString('pl-PL', { maximumFractionDigits: 4 });
  }
  return String(value);
}
