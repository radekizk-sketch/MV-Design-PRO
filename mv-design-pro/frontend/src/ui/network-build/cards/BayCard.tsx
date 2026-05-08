/**
 * BayCard - kanoniczna karta pola SN oparta o field read-model V10.
 */

import { useCallback, useMemo } from 'react';
import { ObjectCard, type CardAction, type CardSection } from './ObjectCard';
import { useFieldReadModel, type FieldReadModelItem } from '../../field/useFieldReadModel';
import { BayWindowSchematic } from '../../field/BayWindowSchematic';
import { formatStationTypeLabelPl } from '../../shared/stationTypeLabels';
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
} from '../../field/fieldLabels';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { buildOperationContext } from '../operationContext';
import { useElementStatusDot } from '../liveReadiness';

function bayRoleLabel(role: string): string {
  switch (role) {
    case 'IN':
      return 'Pole zasilające';
    case 'OUT':
      return 'Pole liniowe';
    case 'TR':
      return 'Pole transformatorowe';
    case 'COUPLER':
      return 'Pole sprzęgła sekcji';
    case 'FEEDER':
      return 'Pole odgałęźne';
    case 'MEASUREMENT':
      return 'Pole pomiarowe';
    case 'OZE':
      return 'Pole źródłowe';
    default:
      return role;
  }
}

function mapCanonicalRoleToLegacyRole(role: string | null | undefined): string | null {
  switch (role) {
    case 'LINIA_IN':
      return 'IN';
    case 'LINIA_OUT':
      return 'OUT';
    case 'LINIA_ODG':
      return 'FEEDER';
    case 'TRANSFORMATOROWE':
      return 'TR';
    case 'SPRZEGLO':
      return 'COUPLER';
    case 'POMIAROWE':
      return 'MEASUREMENT';
    case 'PV_SN':
    case 'BESS_SN':
    case 'FW_SN':
      return 'OZE';
    default:
      return null;
  }
}

function resolveFieldBusRef(
  fieldItem: FieldReadModelItem | null,
  parentStation: { bus_refs?: string[]; gpz_sections?: Array<{ section_id: string; bus_ref: string }> | null } | null,
  legacyBusRef: string | null,
): string | null {
  if (legacyBusRef) {
    return legacyBusRef;
  }

  const gpzSectionId = fieldItem?.canonical_model.base_model.gpz_section_id ?? null;
  if (gpzSectionId && Array.isArray(parentStation?.gpz_sections)) {
    const section = parentStation.gpz_sections.find((item) => item.section_id === gpzSectionId);
    if (section?.bus_ref) {
      return section.bus_ref;
    }
  }

  const stationBusRefs = Array.isArray(parentStation?.bus_refs) ? parentStation.bus_refs : [];
  if (stationBusRefs.length === 1) {
    return stationBusRefs[0];
  }

  return null;
}

export function BayCard({ elementId }: { elementId: string }) {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const openInspectorPanel = useNetworkBuildStore((state) => state.openInspectorPanel);
  const closeObjectCard = useNetworkBuildStore((state) => state.closeObjectCard);
  const { itemsByBayRef, itemsByBayId, isLoading: isFieldLoading } = useFieldReadModel();

  const directFieldItem = useMemo(
    () => itemsByBayId.get(elementId) ?? itemsByBayRef.get(elementId) ?? null,
    [elementId, itemsByBayId, itemsByBayRef],
  );

  const bay = useMemo(
    () => snapshot?.bays?.find((item) => (
      item.id === elementId
      || item.ref_id === elementId
      || (directFieldItem != null && (item.id === directFieldItem.bay_id || item.ref_id === directFieldItem.bay_ref))
    )) ?? null,
    [snapshot, elementId, directFieldItem],
  );

  const fieldItem = useMemo(
    () => directFieldItem ?? (bay?.ref_id ? itemsByBayRef.get(bay.ref_id) ?? null : null),
    [directFieldItem, bay, itemsByBayRef],
  );

  const stationRef = fieldItem?.canonical_model.base_model.substation_ref ?? bay?.substation_ref ?? null;
  const resolvedElementId = bay?.id ?? elementId;
  const dot = useElementStatusDot(resolvedElementId);

  const effectiveLegacyRole = useMemo(
    () => bay?.bay_role ?? mapCanonicalRoleToLegacyRole(fieldItem?.canonical_model.base_model.bay_role),
    [bay, fieldItem],
  );

  const parentStation = useMemo(
    () => snapshot?.substations?.find((item) => item.id === stationRef || item.ref_id === stationRef) ?? null,
    [snapshot, stationRef],
  );

  const busRef = useMemo(
    () => resolveFieldBusRef(fieldItem, parentStation, bay?.bus_ref ?? null),
    [fieldItem, parentStation, bay],
  );

  const bus = useMemo(
    () => snapshot?.buses?.find((item) => item.ref_id === busRef || item.id === busRef) ?? null,
    [snapshot, busRef],
  );

  const sections = useMemo((): CardSection[] => {
    if (!bay && !fieldItem) return [];

    const displayName = fieldItem?.bay_name ?? bay?.name ?? elementId;
    const displayRef = fieldItem?.bay_ref ?? bay?.ref_id ?? elementId;
    const displayRole = effectiveLegacyRole ? bayRoleLabel(effectiveLegacyRole) : canonicalRoleLabel(fieldItem?.canonical_model.base_model.bay_role);

    const identSection: CardSection = {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'id', label: 'Identyfikator pola', value: bay?.id ?? fieldItem?.bay_id ?? null },
        { key: 'ref', label: 'Oznaczenie pola', value: displayRef },
        { key: 'name', label: 'Nazwa', value: displayName },
        { key: 'role', label: 'Rola pola', value: displayRole },
        {
          key: 'canonical_role',
          label: 'Rola kanoniczna',
          value: isFieldLoading
            ? 'Ładowanie...'
            : canonicalRoleLabel(fieldItem?.canonical_model.base_model.bay_role),
        },
        {
          key: 'integrity',
          label: 'Integralność modelu',
          value: isFieldLoading
            ? 'Ładowanie...'
            : integrityStatusLabel(fieldItem?.canonical_model.integrity_status),
          severity:
            fieldItem?.canonical_model.integrity_status === 'wymaga_uzupelnienia'
              ? 'warning'
              : undefined,
        },
      ],
    };

    const stationSection: CardSection = {
      id: 'station',
      label: 'Stacja nadrzędna',
      fields: [
        { key: 'station_id', label: 'Identyfikator stacji', value: stationRef },
        {
          key: 'station_name',
          label: 'Nazwa stacji',
          value: parentStation?.name ?? null,
          severity: parentStation ? undefined : 'error',
        },
        {
          key: 'station_type',
          label: 'Typ stacji',
          value: formatStationTypeLabelPl(parentStation?.station_type),
        },
      ],
    };

    const busSection: CardSection = {
      id: 'bus',
      label: 'Szyna',
      fields: [
        { key: 'bus_ref', label: 'Identyfikator szyny', value: busRef },
        {
          key: 'bus_name',
          label: 'Nazwa szyny',
          value: bus?.name ?? null,
          severity: bus ? undefined : 'error',
        },
        { key: 'bus_voltage', label: 'Napiecie nominalne', value: bus?.voltage_kv ?? null, unit: 'kV' },
        { key: 'bus_grounding', label: 'Uziemienie szyny', value: bus?.grounding?.type ?? null },
      ],
    };

    const cardSections: CardSection[] = [identSection, stationSection, busSection];

    if (!fieldItem) {
      cardSections.push({
        id: 'canonical_missing',
        label: 'Kontrakt pola',
        fields: [
          {
            key: 'field_read_model_state',
            label: isFieldLoading ? 'Stan odczytu' : 'Stan modelu',
            value: isFieldLoading
              ? 'Ładowanie widoku pola...'
              : 'Brak kanonicznego widoku pola dla tego elementu',
            severity: 'warning',
          },
        ],
      });
      return cardSections;
    }

    const canonicalModel = fieldItem.canonical_model;
    const baseModel = canonicalModel.base_model;
    const runtimeState = canonicalModel.runtime_state;
    const protection = baseModel.protection_config;
    const projectResults = fieldItem.project_results;
    const measurementChain = baseModel.measurement_chain;
    const sourceEndpoint = baseModel.source_endpoint;
    const activeInterlocks = baseModel.interlocks.entries.filter((entry) => entry.active);

    cardSections.push({
      id: 'runtime',
      label: 'Stan ruchowy pola',
      fields: [
        {
          key: 'comm_status',
          label: 'Łączność urządzenia wtórnego',
          value: communicationStatusLabel(runtimeState?.secondary_communication_status),
          severity:
            runtimeState?.secondary_communication_status === 'offline'
              ? 'warning'
              : undefined,
        },
        {
          key: 'last_update',
          label: 'Ostatnia poprawna aktualizacja',
          value: runtimeState?.last_good_update_at ?? null,
        },
        {
          key: 'pending_command_state',
          label: 'Stan ostatniego polecenia',
          value: commandExecutionStateLabel(runtimeState?.pending_command?.state),
          severity:
            runtimeState?.pending_command?.state === 'odrzucone'
              ? 'error'
              : runtimeState?.pending_command?.state === 'przeterminowane'
                ? 'warning'
                : undefined,
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
          key: 'safe_to_work',
          label: 'Bezpieczne do pracy',
          value: runtimeState?.energization_and_safety.safe_to_work ?? null,
          severity:
            runtimeState?.energization_and_safety.safe_to_work === false
              ? 'warning'
              : undefined,
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
          label: 'Uziemienie pola',
          value: runtimeState?.energization_and_safety.grounded ?? null,
        },
        {
          key: 'visible_gap',
          label: 'Widoczna przerwa',
          value: runtimeState?.energization_and_safety.visible_isolation_gap ?? null,
        },
      ],
    });

    cardSections.push({
      id: 'devices',
      label: 'Aparaty pierwotne',
      fields:
        baseModel.primary_devices.length > 0
          ? baseModel.primary_devices.map((device) => ({
              key: `device_${device.device_ref}`,
              label: device.device_ref,
              value: `${deviceKindLabel(device.kind)} - ${switchStateLabel(device.switch_state?.actual_state ?? null)}`,
              severity:
                device.switch_state?.actual_state === 'awaria'
                  ? ('error' as const)
                  : device.switch_state?.actual_state === 'nieznany'
                    ? ('warning' as const)
                    : undefined,
            }))
          : [
              {
                key: 'no_primary_devices',
                label: 'Brak aparatow',
                value: 'Model pola nie zawiera aparatow pierwotnych',
                severity: 'warning',
              },
            ],
    });

    cardSections.push({
      id: 'measurements',
      label: 'Tor pomiarowy',
      fields: [
        {
          key: 'measurement_chain_ref',
          label: 'Identyfikator toru',
          value: measurementChain?.chain_ref ?? null,
        },
        {
          key: 'ct_refs',
          label: 'Przekładniki prądowe',
          value: measurementChain?.ct_refs.join(', ') ?? null,
        },
        {
          key: 'vt_refs',
          label: 'Przekładniki napięciowe',
          value: measurementChain?.vt_refs.join(', ') ?? null,
        },
        {
          key: 'source_3i0',
          label: 'Źródło 3I0',
          value: measurementChain?.zero_sequence_current_source ?? null,
        },
        {
          key: 'source_3u0',
          label: 'Źródło 3U0',
          value: measurementChain?.zero_sequence_voltage_source ?? null,
        },
      ],
    });

    cardSections.push({
      id: 'protection',
      label: 'Zabezpieczenie i automatyka',
      fields: [
        {
          key: 'prot_unit',
          label: 'Jednostka wtora',
          value: protection?.unit_ref ?? null,
        },
        {
          key: 'prot_model',
          label: 'Model',
          value: protection?.model ?? null,
        },
        {
          key: 'prot_functions',
          label: 'Funkcje',
          value: protection?.functions.map((item) => item.code).join(', ') || null,
        },
        {
          key: 'prot_spz',
          label: 'SPZ',
          value: protection?.spz?.state ?? 'Brak SPZ',
        },
      ],
    });

    cardSections.push({
      id: 'control',
      label: 'Sterowanie i blokady',
      fields: [
        {
          key: 'controllable_devices',
          label: 'Aparaty sterowalne',
          value: baseModel.control_surface.controllable_device_refs.join(', ') || null,
        },
        {
          key: 'open_confirmation',
          label: 'Potwierdzenie otwarcia',
          value: baseModel.control_surface.open_requires_confirmation,
        },
        {
          key: 'close_confirmation',
          label: 'Potwierdzenie zamkniecia',
          value: baseModel.control_surface.close_requires_confirmation,
        },
        {
          key: 'active_interlocks',
          label: 'Aktywne blokady',
          value: activeInterlocks.map((entry) => entry.code).join(', ') || 'Brak',
          severity: activeInterlocks.length > 0 ? 'warning' : undefined,
        },
      ],
    });

    if (sourceEndpoint) {
      cardSections.push({
        id: 'source',
        label: 'Zacisk źródłowy',
        fields: [
          {
            key: 'source_kind',
            label: 'Rodzaj źródła',
            value: sourceKindLabel(sourceEndpoint.source_kind),
          },
          {
            key: 'requires_vt',
            label: 'Wymaga toru przekładnika napięciowego',
            value: sourceEndpoint.requires_vt,
          },
          {
            key: 'requires_sync',
            label: 'Wymaga synchronizmu',
            value: sourceEndpoint.requires_synchrocheck,
          },
          {
            key: 'operating_mode',
            label: 'Tryb pracy',
            value: sourceEndpoint.operating_mode,
          },
        ],
      });
    }

    cardSections.push({
      id: 'results',
      label: 'Wyniki projektowe pola',
      fields: [
        { key: 'run_ref', label: 'Identyfikator obliczenia', value: projectResults?.run_ref ?? null },
        {
          key: 'result_state',
          label: 'Stan wynikow',
          value: resultStateLabel(projectResults?.result_state),
          severity:
            projectResults?.result_state === 'bledny'
              ? 'error'
              : projectResults?.result_state === 'czesciowy'
                ? 'warning'
                : undefined,
        },
        {
          key: 'result_message',
          label: 'Opis wyników',
          value: projectResults?.result_message_pl ?? null,
        },
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
          key: 'earth_fault_path',
          label: 'Tor ziemnozwarciowy',
          value: projectResults?.earth_fault_path?.neutral_grounding_mode ?? null,
        },
        {
          key: 'whole_power_path_ok',
          label: 'Tor pola spełnia wymagania',
          value: projectResults?.verification.whole_power_path_ok ?? null,
        },
      ],
    });

    cardSections.push({
      id: 'proof',
      label: 'Wywód pola',
      fields: [
        {
          key: 'proof_ref',
          label: 'Identyfikator wywodu',
          value: projectResults?.proof_binding.proof_ref ?? null,
        },
        {
          key: 'input_data_refs',
          label: 'Powiązane dane wejściowe',
          value: projectResults?.proof_binding.input_data_refs.length ?? null,
        },
        {
          key: 'source_contribution_refs',
          label: 'Powiązane wkłady źródeł',
          value: projectResults?.proof_binding.source_contribution_refs.length ?? null,
        },
      ],
    });

    return cardSections;
  }, [bay, bus, busRef, elementId, effectiveLegacyRole, fieldItem, isFieldLoading, parentStation, stationRef]);

  const buildContext = useCallback(
    (
      op: Parameters<typeof buildOperationContext>[0]['canonicalOp'],
      extraContext?: Record<string, unknown>,
    ) =>
      buildOperationContext({
        canonicalOp: op,
        elementId,
        elementType: 'BaySN',
        snapshot,
        logicalViews,
        extraContext,
      }),
    [elementId, logicalViews, snapshot],
  );

  const canonicalFieldContext = useMemo(() => {
    const context: Record<string, unknown> = {};
    const resolvedFieldRef = fieldItem?.bay_ref ?? bay?.ref_id ?? null;

    if (resolvedFieldRef) {
      context.bay_ref = resolvedFieldRef;
      context.field_ref = resolvedFieldRef;
    }
    if (stationRef) {
      context.station_ref = stationRef;
    }
    if (busRef) {
      context.bus_ref = busRef;
      context.from_bus_ref = busRef;
      context.from_terminal_id = busRef;
    }

    return context;
  }, [fieldItem, bay, stationRef, busRef]);

  const handleAssignCatalog = useCallback(() => {
    openOperationForm(
      'assign_catalog_to_element',
      buildContext('assign_catalog_to_element', canonicalFieldContext),
    );
  }, [buildContext, canonicalFieldContext, openOperationForm]);

  const handleContinueTrunk = useCallback(() => {
    openOperationForm(
      'continue_trunk_segment_sn',
      buildContext('continue_trunk_segment_sn', canonicalFieldContext),
    );
  }, [buildContext, canonicalFieldContext, openOperationForm]);

  const handleStartBranch = useCallback(() => {
    openOperationForm(
      'start_branch_segment_sn',
      buildContext('start_branch_segment_sn', canonicalFieldContext),
    );
  }, [buildContext, canonicalFieldContext, openOperationForm]);

  const handleAddTransformer = useCallback(() => {
    openOperationForm(
      'add_transformer_sn_nn',
      buildContext('add_transformer_sn_nn', canonicalFieldContext),
    );
  }, [buildContext, canonicalFieldContext, openOperationForm]);

  const handleAddPV = useCallback(() => {
    openOperationForm(
      'add_converter_source',
      buildContext('add_converter_source', {
        ...canonicalFieldContext,
        source_technology: 'PV',
      }),
    );
  }, [buildContext, canonicalFieldContext, openOperationForm]);

  const handleAddBESS = useCallback(() => {
    openOperationForm(
      'add_converter_source',
      buildContext('add_converter_source', {
        ...canonicalFieldContext,
        source_technology: 'BESS',
      }),
    );
  }, [buildContext, canonicalFieldContext, openOperationForm]);

  const handleAddFW = useCallback(() => {
    openOperationForm(
      'add_converter_source',
      buildContext('add_converter_source', {
        ...canonicalFieldContext,
        source_technology: 'FW',
      }),
    );
  }, [buildContext, canonicalFieldContext, openOperationForm]);

  const inspectorElementId = fieldItem?.bay_ref ?? bay?.ref_id ?? elementId;

  const handleOpenMeasurements = useCallback(() => {
    openInspectorPanel('field_measurements', inspectorElementId, 'BaySN');
  }, [inspectorElementId, openInspectorPanel]);

  const handleOpenControl = useCallback(() => {
    openInspectorPanel('field_control', inspectorElementId, 'BaySN');
  }, [inspectorElementId, openInspectorPanel]);

  const handleOpenProtection = useCallback(() => {
    openInspectorPanel('field_protection', inspectorElementId, 'BaySN');
  }, [inspectorElementId, openInspectorPanel]);

  const handleOpenSourceContributions = useCallback(() => {
    openInspectorPanel('field_source_contributions', inspectorElementId, 'BaySN');
  }, [inspectorElementId, openInspectorPanel]);

  const handleOpenEarthFault = useCallback(() => {
    openInspectorPanel('field_earth_fault', inspectorElementId, 'BaySN');
  }, [inspectorElementId, openInspectorPanel]);

  const handleOpenWorkSafety = useCallback(() => {
    openInspectorPanel('field_work_safety', inspectorElementId, 'BaySN');
  }, [inspectorElementId, openInspectorPanel]);

  const handleOpenCompare = useCallback(() => {
    openInspectorPanel('field_compare', inspectorElementId, 'BaySN');
  }, [inspectorElementId, openInspectorPanel]);

  const commonInspectorActions = useMemo((): CardAction[] => {
    if (!fieldItem) {
      return [];
    }

    return [
      {
        id: 'field_measurements',
        label: 'Pomiary pola',
        variant: 'secondary',
        onClick: handleOpenMeasurements,
      },
      {
        id: 'field_control',
        label: 'Sterowanie polem',
        variant: 'secondary',
        onClick: handleOpenControl,
      },
      {
        id: 'field_protection',
        label: 'Zabezpieczenie pola',
        variant: 'secondary',
        onClick: handleOpenProtection,
      },
      {
        id: 'field_source_contributions',
        label: 'Wkłady źródeł',
        variant: 'secondary',
        onClick: handleOpenSourceContributions,
      },
      {
        id: 'field_earth_fault',
        label: 'Tor ziemnozwarciowy',
        variant: 'secondary',
        onClick: handleOpenEarthFault,
      },
      {
        id: 'field_work_safety',
        label: 'Bezpieczeństwo do pracy',
        variant: 'secondary',
        onClick: handleOpenWorkSafety,
      },
      {
        id: 'field_compare',
        label: 'Porównaj pola',
        variant: 'secondary',
        onClick: handleOpenCompare,
      },
    ];
  }, [
    fieldItem,
    handleOpenCompare,
    handleOpenControl,
    handleOpenEarthFault,
    handleOpenMeasurements,
    handleOpenProtection,
    handleOpenSourceContributions,
    handleOpenWorkSafety,
  ]);

  const actions = useMemo((): CardAction[] => {
    if (!effectiveLegacyRole && !fieldItem) return [];

    switch (effectiveLegacyRole) {
      case 'IN':
      case 'OUT':
        return [
          {
            id: 'continue_trunk_segment_sn',
            label: 'Kontynuuj magistrale',
            variant: 'primary',
            onClick: handleContinueTrunk,
          },
          ...commonInspectorActions,
        ];
      case 'FEEDER':
        return [
          {
            id: 'start_branch_segment_sn',
            label: 'Rozpocznij odgalezienie',
            variant: 'primary',
            onClick: handleStartBranch,
          },
          ...commonInspectorActions,
        ];
      case 'TR':
        return [
          {
            id: 'add_transformer_sn_nn',
            label: 'Przypisz transformator',
            variant: 'primary',
            onClick: handleAddTransformer,
          },
          ...commonInspectorActions,
        ];
      case 'OZE':
        return [
          {
            id: 'create_converter_source_pv',
            label: 'Dodaj PV',
            variant: 'primary',
            onClick: handleAddPV,
          },
          {
            id: 'create_converter_source_bess',
            label: 'Dodaj BESS',
            variant: 'secondary',
            onClick: handleAddBESS,
          },
          {
            id: 'create_converter_source_fw',
            label: 'Dodaj FW',
            variant: 'secondary',
            onClick: handleAddFW,
          },
          ...commonInspectorActions,
        ];
      case 'COUPLER':
      case 'MEASUREMENT':
      default:
        return [
          {
            id: 'assign_catalog',
            label: 'Przypisz katalog',
            variant: 'secondary',
            onClick: handleAssignCatalog,
          },
          ...commonInspectorActions,
        ];
    }
  }, [
    commonInspectorActions,
    effectiveLegacyRole,
    fieldItem,
    handleContinueTrunk,
    handleStartBranch,
    handleAddTransformer,
    handleAddPV,
    handleAddBESS,
    handleAddFW,
    handleAssignCatalog,
  ]);

  if (!bay && !fieldItem) return null;

  const displayRole = fieldItem
    ? canonicalRoleLabel(fieldItem.canonical_model.base_model.bay_role)
    : bayRoleLabel(effectiveLegacyRole ?? '');

  return (
    <ObjectCard
      elementName={fieldItem?.bay_name ?? bay?.name ?? elementId}
      elementType={`Pole SN - ${displayRole}`}
      elementId={fieldItem?.bay_ref ?? bay?.ref_id ?? elementId}
      statusDot={dot}
      sections={sections}
      actions={actions}
      onClose={closeObjectCard}
      footer={fieldItem ? <BayWindowSchematic item={fieldItem} /> : null}
    />
  );
}
