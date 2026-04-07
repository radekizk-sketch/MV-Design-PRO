/**
 * SwitchCard — karta obiektu łącznika / wyłącznika SN.
 *
 * Wyświetla typ aparatu (łącznik, wyłącznik, odłącznik, sprzęgło, bezpiecznik),
 * topologię (szyny od/do), stan eksploatacyjny (otwarty/zamknięty, NPO),
 * oraz referencję katalogową.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import type { SwitchBranch, FuseBranch } from '../../../types/enm';

// =============================================================================
// Helpers
// =============================================================================

function switchTypeLabel(type: string): string {
  switch (type) {
    case 'switch':
      return 'Łącznik SN';
    case 'breaker':
      return 'Wyłącznik SN';
    case 'bus_coupler':
      return 'Sprzęgło szyn SN';
    case 'disconnector':
      return 'Odłącznik SN';
    case 'fuse':
      return 'Bezpiecznik SN';
    default:
      return type;
  }
}

function switchTypeShort(type: string): string {
  switch (type) {
    case 'switch':
      return 'Łącznik';
    case 'breaker':
      return 'Wyłącznik';
    case 'bus_coupler':
      return 'Sprzęgło';
    case 'disconnector':
      return 'Odłącznik';
    case 'fuse':
      return 'Bezpiecznik';
    default:
      return type;
  }
}

function statusLabel(status: string): string {
  return status === 'closed' ? 'Zamknięty (przewodzi)' : 'Otwarty (wyłączony)';
}

function statusSeverity(status: string): 'ok' | 'warning' {
  return status === 'closed' ? 'ok' : 'warning';
}

function isNopSwitch(
  elementId: string,
  corridors: Array<{ no_point_ref?: string | null }>,
): boolean {
  return corridors.some((c) => c.no_point_ref === elementId);
}

function statusDotFromReadiness(
  elementId: string,
  readiness: { blockers: Array<{ element_ref: string | null }> } | null,
): 'ok' | 'warning' | 'error' | 'none' {
  if (!readiness) return 'none';
  const hasBlocker = readiness.blockers.some((b) => b.element_ref === elementId);
  return hasBlocker ? 'error' : 'ok';
}

// =============================================================================
// Component
// =============================================================================

export function SwitchCard({ elementId }: { elementId: string }) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const closeObjectCard = useNetworkBuildStore((s) => s.closeObjectCard);
  const activeMode = useAppStateStore((s) => s.activeMode);

  const branch = useMemo(() => {
    const found = snapshot?.branches?.find((b) => b.ref_id === elementId);
    if (!found) return null;
    const allowedTypes = ['switch', 'breaker', 'bus_coupler', 'disconnector', 'fuse'];
    if (!allowedTypes.includes(found.type)) return null;
    return found as SwitchBranch | FuseBranch;
  }, [snapshot, elementId]);

  const fromBus = useMemo(
    () => snapshot?.buses?.find((b) => b.ref_id === branch?.from_bus_ref),
    [snapshot, branch],
  );

  const toBus = useMemo(
    () => snapshot?.buses?.find((b) => b.ref_id === branch?.to_bus_ref),
    [snapshot, branch],
  );

  const isNop = useMemo(
    () => isNopSwitch(elementId, snapshot?.corridors ?? []),
    [snapshot, elementId],
  );

  // Find bay containing this switch via equipment_refs
  const parentBay = useMemo(
    () =>
      snapshot?.bays?.find((bay) => bay.equipment_refs?.includes(elementId)),
    [snapshot, elementId],
  );

  const parentStation = useMemo(
    () =>
      parentBay
        ? snapshot?.substations?.find((s) => s.id === parentBay.substation_ref)
        : null,
    [snapshot, parentBay],
  );

  const sections = useMemo((): CardSection[] => {
    if (!branch) return [];

    const identSection: CardSection = {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'name', label: 'Nazwa', value: branch.name },
        { key: 'ref_id', label: 'ID elementu', value: branch.ref_id },
        {
          key: 'type',
          label: 'Typ aparatu',
          value: switchTypeShort(branch.type),
        },
        ...(parentBay
          ? [{ key: 'bay', label: 'Pole SN', value: parentBay.name }]
          : []),
        ...(parentStation
          ? [{ key: 'station', label: 'Stacja', value: parentStation.name }]
          : []),
      ],
    };

    const topoSection: CardSection = {
      id: 'topology',
      label: 'Topologia',
      fields: [
        {
          key: 'from_bus',
          label: 'Szyna — od',
          value: fromBus ? `${fromBus.name} (${fromBus.voltage_kv} kV)` : branch.from_bus_ref,
          severity: !fromBus ? 'error' : undefined,
        },
        {
          key: 'to_bus',
          label: 'Szyna — do',
          value: toBus ? `${toBus.name} (${toBus.voltage_kv} kV)` : branch.to_bus_ref,
          severity: !toBus ? 'error' : undefined,
        },
        ...((branch.type === 'switch' || branch.type === 'breaker' ||
          branch.type === 'bus_coupler' || branch.type === 'disconnector') &&
        (branch as SwitchBranch).r_ohm != null
          ? [
              {
                key: 'r_ohm',
                label: 'R stanu zamkniętego',
                value: (branch as SwitchBranch).r_ohm ?? null,
                unit: 'Ω',
                source: 'catalog' as const,
              },
              {
                key: 'x_ohm',
                label: 'X stanu zamkniętego',
                value: (branch as SwitchBranch).x_ohm ?? null,
                unit: 'Ω',
                source: 'catalog' as const,
              },
            ]
          : []),
        ...(branch.type === 'fuse'
          ? [
              {
                key: 'rated_current',
                label: 'Prąd znamionowy',
                value: (branch as FuseBranch).rated_current_a ?? null,
                unit: 'A',
                source: 'catalog' as const,
                severity: (branch as FuseBranch).rated_current_a == null
                  ? ('warning' as const)
                  : undefined,
              },
              {
                key: 'rated_voltage',
                label: 'Napięcie znamionowe',
                value: (branch as FuseBranch).rated_voltage_kv ?? null,
                unit: 'kV',
                source: 'catalog' as const,
              },
            ]
          : []),
      ],
    };

    const stateSection: CardSection = {
      id: 'state',
      label: 'Stan eksploatacyjny',
      fields: [
        {
          key: 'status',
          label: 'Stan',
          value: statusLabel(branch.status),
          severity: statusSeverity(branch.status),
        },
        {
          key: 'is_nop',
          label: 'Normalny punkt otwarcia (NPO)',
          value: isNop ? 'Tak — NPO aktywny' : 'Nie',
          severity: isNop ? 'warning' : 'ok',
        },
      ],
    };

    const catalogSection: CardSection = {
      id: 'catalog',
      label: 'Katalog',
      fields: [
        {
          key: 'catalog_ref',
          label: 'Typ katalogowy',
          value: branch.catalog_ref ?? null,
          source: 'catalog',
          severity: branch.catalog_ref == null ? 'warning' : undefined,
        },
        {
          key: 'param_source',
          label: 'Źródło parametrów',
          value: branch.parameter_source === 'CATALOG'
            ? 'Katalog (zablokowane)'
            : branch.parameter_source === 'OVERRIDE'
              ? 'Nadpisanie ręczne'
              : 'Brak katalogu — wymagane',
          severity: branch.catalog_ref == null ? 'warning' : 'ok',
        },
      ],
    };

    const result: CardSection[] = [identSection, topoSection, stateSection, catalogSection];

    if (activeMode === 'RESULT_VIEW') {
      result.push({
        id: 'analysis',
        label: 'Wyniki analizy',
        fields: [
          { key: 'i_through', label: 'Prąd przepływający I', value: null, unit: 'A', source: 'calculated' },
          { key: 'ik3_through', label: 'Prąd zwarciowy Ik₃', value: null, unit: 'kA', source: 'calculated' },
          { key: 'breaking_capacity', label: 'Zdolność wyłączalna', value: null, unit: '%', source: 'calculated' },
          { key: 'no_results', label: 'Status', value: 'Brak wyników — uruchom analizę', severity: 'warning' },
        ],
      });
    }

    return result;
  }, [branch, fromBus, toBus, isNop, parentBay, parentStation, activeMode]);

  const handleToggleState = useCallback(() => {
    openOperationForm('update_element_parameters', {
      element_ref: elementId,
      element_type: 'switch',
      toggle_status: true,
    });
  }, [openOperationForm, elementId]);

  const handleAssignCatalog = useCallback(() => {
    openOperationForm('assign_catalog_to_element', {
      element_ref: elementId,
      element_type: 'switch',
    });
  }, [openOperationForm, elementId]);

  const handleSetNop = useCallback(() => {
    openOperationForm('set_normal_open_point', {
      switch_ref: elementId,
      switch_label: branch?.name ?? elementId,
    });
  }, [branch?.name, openOperationForm, elementId]);

  const actions = useMemo((): CardAction[] => {
    const acts: CardAction[] = [
      {
        id: 'toggle_state',
        label: branch?.status === 'closed' ? 'Otwórz łącznik' : 'Zamknij łącznik',
        variant: 'primary',
        onClick: handleToggleState,
      },
      {
        id: 'assign_catalog',
        label: 'Przypisz katalog',
        variant: 'secondary',
        onClick: handleAssignCatalog,
      },
    ];

    // NPO action only for main line switches/breakers, not fuses or bus-couplers
    if (
      branch?.type === 'switch' ||
      branch?.type === 'breaker' ||
      branch?.type === 'disconnector'
    ) {
      acts.push({
        id: 'set_nop',
        label: isNop ? 'Usun oznaczenie NOP' : 'Ustaw jako NOP',
        variant: isNop ? 'danger' : 'secondary',
        onClick: handleSetNop,
      });
    }

    return acts;
  }, [branch?.status, branch?.type, handleToggleState, handleAssignCatalog, handleSetNop, isNop]);

  if (!branch) return null;

  const dot = statusDotFromReadiness(elementId, readiness);

  return (
    <ObjectCard
      elementName={branch.name}
      elementType={switchTypeLabel(branch.type)}
      elementId={elementId}
      statusDot={dot}
      sections={sections}
      actions={actions}
      onClose={closeObjectCard}
    />
  );
}
