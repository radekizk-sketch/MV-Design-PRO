/**
 * ZksnCard — karta złączki kablowej rozgałęźnej SN (ZKSN).
 *
 * ZKSN jest odrębną klasą obiektu (ZksnMV), osadzaną wyłącznie na kablu SN.
 * NIE jest stacją. Może mieć 1 lub 2 porty BRANCH.
 *
 * Wyświetla:
 * A. Identyfikację i rolę w sieci
 * B. Topologię: MAIN_IN / MAIN_OUT / BRANCH_1..N + stan zajętości portów
 * C. Stan łącznika (switch_state)
 * D. Parametry katalogowe
 * E. Gotowość i status kompletności
 * F. Dostępne akcje inżynierskie (Dodaj odgałęzienie z każdego wolnego portu)
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { type CardSection, type CardAction } from './ObjectCard';
import { TechCard } from '../../tech-card';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import type { BranchPointSN } from '../../../types/enm';

// =============================================================================
// Helpers
// =============================================================================

function switchStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'closed':
      return 'Zamknięty';
    case 'open':
      return 'Otwarty';
    default:
      return 'Nieokreślony';
  }
}

function sourceModeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case 'KATALOG':
      return 'Z katalogu';
    case 'MIGRACJA':
      return 'Migracja danych';
    case 'EKSPERCKI_RECZNY':
      return 'Ręczny (ekspert)';
    default:
      return mode ?? '—';
  }
}

function completenessLabel(status: string | null | undefined): string {
  switch (status) {
    case 'KOMPLETNY':
      return 'Kompletny';
    case 'NIEKOMPLETNY':
      return 'Niekompletny';
    case 'BRAK_KATALOGU':
      return 'Brak powiązania katalogowego';
    default:
      return '—';
  }
}

function completenessStatus(status: string | null | undefined): 'ok' | 'warning' | 'error' {
  if (status === 'KOMPLETNY') return 'ok';
  if (status === 'NIEKOMPLETNY') return 'warning';
  return 'error';
}

// =============================================================================
// ZksnCard
// =============================================================================

interface ZksnCardProps {
  elementId: string;
  onClose: () => void;
}

export function ZksnCard({ elementId, onClose }: ZksnCardProps) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const branchPoint: BranchPointSN | undefined = useMemo(
    () => snapshot?.branch_points?.find((bp) => bp.ref_id === elementId),
    [snapshot, elementId],
  );

  const statusDot = useMemo(
    () => completenessStatus(branchPoint?.completeness_status),
    [branchPoint],
  );

  const branchPorts: Array<{ portId: string; busRef: string; occupied: boolean }> = useMemo(() => {
    if (!branchPoint?.ports?.BRANCH) return [];
    return branchPoint.ports.BRANCH.map((busRef: string, idx: number) => {
      const portId = `BRANCH_${idx + 1}`;
      return {
        portId,
        busRef,
        occupied: !!(branchPoint.branch_occupied?.[portId]),
      };
    });
  }, [branchPoint]);

  const sections: CardSection[] = useMemo(() => {
    if (!branchPoint) return [];

    const portFields = branchPorts.map((port) => ({
      key: port.portId,
      label: `Port ${port.portId}`,
      value: port.occupied
        ? `Zajęty (${branchPoint.branch_occupied?.[port.portId] ?? '?'})`
        : `Wolny (szyna: ${port.busRef})`,
    }));

    const result: CardSection[] = [
      {
        id: 'ident',
        label: 'Identyfikacja',
        fields: [
          { key: 'ref_id', label: 'Identyfikator', value: branchPoint.ref_id },
          { key: 'name', label: 'Nazwa', value: branchPoint.name },
          { key: 'type', label: 'Typ obiektu', value: 'ZKSN (złączka kablowa SN)' },
          { key: 'parent_segment', label: 'Odcinek nadrzędny', value: branchPoint.parent_segment_id },
        ],
      },
      {
        id: 'topology',
        label: 'Topologia',
        fields: [
          { key: 'main_in', label: 'Port MAIN_IN', value: branchPoint.ports?.MAIN_IN ?? '—' },
          { key: 'main_out', label: 'Port MAIN_OUT', value: branchPoint.ports?.MAIN_OUT ?? '—' },
          ...portFields,
          {
            key: 'switch_state',
            label: 'Stan łącznika',
            value: switchStateLabel(branchPoint.switch_state),
          },
        ],
      },
      {
        id: 'catalog',
        label: 'Katalog',
        fields: [
          {
            key: 'catalog_ref',
            label: 'Pozycja katalogowa',
            value: branchPoint.catalog_ref ?? '—',
          },
          {
            key: 'source_mode',
            label: 'Tryb źródła',
            value: sourceModeLabel(branchPoint.source_mode),
          },
          {
            key: 'completeness',
            label: 'Kompletność',
            value: completenessLabel(branchPoint.completeness_status),
          },
        ],
      },
    ];

    return result;
  }, [branchPoint, branchPorts]);

  const handleAddBranchFromPort = useCallback(
    (portId: string) => {
      if (!branchPoint) return;
      openOperationForm('start_branch_segment_sn', {
        from_ref: `${branchPoint.ref_id}.${portId}`,
      });
    },
    [branchPoint, openOperationForm],
  );

  const handleAssignCatalog = useCallback(() => {
    if (!activeCaseId || !branchPoint) return;
    executeDomainOperation(activeCaseId, 'assign_catalog_to_element', {
      element_id: branchPoint.ref_id,
      element_type: 'branch_point',
    });
  }, [activeCaseId, branchPoint, executeDomainOperation]);

  const handleSetSwitchState = useCallback(() => {
    if (!activeCaseId || !branchPoint) return;
    openOperationForm('update_element_parameters', {
      element_ref: branchPoint.ref_id,
      element_type: 'branch_point',
    });
  }, [activeCaseId, branchPoint, openOperationForm]);

  const handleEditZksn = useCallback(() => {
    if (!branchPoint) return;
    openOperationForm('update_element_parameters', {
      element_ref: branchPoint.ref_id,
      element_type: 'branch_point',
    });
  }, [branchPoint, openOperationForm]);

  const actions: CardAction[] = useMemo(() => {
    if (!branchPoint) return [];

    const acts: CardAction[] = [
      {
        id: 'edit_zksn',
        label: 'Edytuj ZKSN',
        variant: 'secondary',
        onClick: handleEditZksn,
      },
    ];

    // Add branch action for each free port
    branchPorts.forEach((port) => {
      acts.push({
        id: `add_branch_${port.portId}`,
        label: `Dodaj odgałęzienie z ${port.portId}`,
        variant: 'primary',
        onClick: () => handleAddBranchFromPort(port.portId),
        disabled: port.occupied,
      });
    });

    acts.push({
      id: 'set_switch_state',
      label: 'Ustaw stan łącznika',
      variant: 'secondary',
      onClick: handleSetSwitchState,
    });

    acts.push({
      id: 'assign_catalog',
      label: 'Dobierz z katalogu',
      variant: 'secondary',
      onClick: handleAssignCatalog,
    });

    return acts;
  }, [branchPoint, branchPorts, handleAddBranchFromPort, handleAssignCatalog, handleEditZksn, handleSetSwitchState]);

  if (!branchPoint) {
    return (
      <div className="p-4 text-xs text-gray-500">
        ZKSN nie znaleziony: {elementId}
      </div>
    );
  }

  return (
    <TechCard
      elementName={branchPoint.name}
      elementType="ZKSN (złączka kablowa SN)"
      elementId={elementId}
      statusDot={statusDot}
      sections={sections}
      actions={actions}
      onClose={onClose}
    />
  );
}
