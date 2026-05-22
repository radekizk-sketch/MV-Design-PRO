/**
 * BranchPoleCard — karta słupa rozgałęźnego SN.
 *
 * Słup rozgałęźny jest odrębną klasą obiektu (BranchPoleMV), osadzaną
 * wyłącznie na linii napowietrznej SN. NIE jest stacją.
 *
 * Wyświetla:
 * A. Identyfikację i rolę w sieci
 * B. Topologię: port MAIN_IN / MAIN_OUT / BRANCH
 * C. Parametry katalogowe
 * D. Gotowość i status kompletności
 * E. Dostępne akcje inżynierskie
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { publicTechnicalLabel, segmentPublicIdentity } from '../../shared/publicTechnicalLabels';
import type { Branch, BranchPointSN } from '../../../types/enm';

// =============================================================================
// Helpers
// =============================================================================

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
      return 'Wariant katalogowy zastosowany';
    case 'NIEKOMPLETNY':
      return 'Wariant do konfiguracji';
    case 'BRAK_KATALOGU':
      return 'Dobierz wariant katalogowy słupa';
    default:
      return 'Do konfiguracji';
  }
}

function completenessStatus(status: string | null | undefined): 'ok' | 'warning' | 'error' {
  if (status === 'KOMPLETNY') return 'ok';
  if (status === 'NIEKOMPLETNY') return 'warning';
  return 'error';
}

function connectedLabel(value: string | null | undefined): string {
  return value ? 'połączony' : 'nieprzypisany';
}

function branchPortLabel(branchPoint: BranchPointSN): string {
  const branchPort = branchPoint.ports?.BRANCH?.[0];
  if (!branchPort) return 'nieprzypisany';
  return branchPoint.branch_occupied?.BRANCH ? 'zajęty przez odgałęzienie' : 'wolny';
}

function parentSegmentLabel(snapshotBranches: readonly Branch[] | undefined, branchPoint: BranchPointSN): string {
  const parentRef = branchPoint.parent_segment_id;
  const branch = snapshotBranches?.find((candidate) =>
    candidate.ref_id === parentRef || candidate.id === parentRef,
  );
  if (branch && snapshotBranches) {
    return segmentPublicIdentity({ branches: snapshotBranches } as never, branch).displayName;
  }
  return publicTechnicalLabel(parentRef, 'Odcinek linii napowietrznej SN');
}

// =============================================================================
// BranchPoleCard
// =============================================================================

interface BranchPoleCardProps {
  elementId: string;
  onClose: () => void;
}

export function BranchPoleCard({ elementId, onClose }: BranchPoleCardProps) {
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

  const sections: CardSection[] = useMemo(() => {
    if (!branchPoint) return [];
    const parentSegment = parentSegmentLabel(snapshot?.branches, branchPoint);
    const displayName = publicTechnicalLabel(branchPoint.name, 'Słup rozgałęźny SN');

    const result: CardSection[] = [
      {
        id: 'ident',
        label: 'Identyfikacja',
        fields: [
          { key: 'name', label: 'Oznaczenie', value: displayName },
          { key: 'type', label: 'Typ obiektu', value: 'Słup rozgałęźny SN' },
          { key: 'role', label: 'Rola w sieci', value: 'węzeł linii napowietrznej z portem odgałęzienia' },
          { key: 'parent_segment', label: 'Ciąg główny', value: parentSegment },
        ],
      },
      {
        id: 'topology',
        label: 'Topologia',
        fields: [
          { key: 'main_in', label: 'Tor główny WE', value: connectedLabel(branchPoint.ports?.MAIN_IN) },
          { key: 'main_out', label: 'Tor główny WY', value: connectedLabel(branchPoint.ports?.MAIN_OUT) },
          {
            key: 'branch_port',
            label: 'Tor odgałęźny',
            value: branchPortLabel(branchPoint),
          },
          {
            key: 'medium',
            label: 'Medium',
            value: 'linia napowietrzna SN',
          },
        ],
      },
      {
        id: 'catalog',
        label: 'Wariant katalogowy',
        fields: [
          {
            key: 'catalog_ref',
            label: 'Pakiet słupa',
            value: publicTechnicalLabel(branchPoint.catalog_ref, 'Słup rozgałęźny SN'),
          },
          {
            key: 'source_mode',
            label: 'Źródło danych',
            value: sourceModeLabel(branchPoint.source_mode),
          },
          {
            key: 'completeness',
            label: 'Konfiguracja techniczna',
            value: completenessLabel(branchPoint.completeness_status),
          },
        ],
      },
    ];

    return result;
  }, [branchPoint, snapshot?.branches]);

  const handleAddBranch = useCallback(() => {
    if (!branchPoint) return;
    openOperationForm('start_branch_segment_sn', {
      from_ref: `${branchPoint.ref_id}.BRANCH`,
    });
  }, [branchPoint, openOperationForm]);

  const handleEditBranchPole = useCallback(() => {
    if (!branchPoint) return;
    openOperationForm('update_element_parameters', {
      element_ref: branchPoint.ref_id,
      element_type: 'branch_point',
    });
  }, [branchPoint, openOperationForm]);

  const handleAssignCatalog = useCallback(() => {
    if (!activeCaseId || !branchPoint) return;
    executeDomainOperation(activeCaseId, 'assign_catalog_to_element', {
      element_id: branchPoint.ref_id,
      element_type: 'branch_point',
    });
  }, [activeCaseId, branchPoint, executeDomainOperation]);

  const actions: CardAction[] = useMemo(() => {
    if (!branchPoint) return [];
    const branchPortOccupied = Boolean(branchPoint.branch_occupied?.BRANCH);

    const acts: CardAction[] = [
      {
        id: 'edit_branch_pole',
        label: 'Edytuj słup',
        variant: 'secondary',
        onClick: handleEditBranchPole,
      },
      {
        id: 'assign_catalog',
        label: 'Dobierz z katalogu',
        variant: 'secondary',
        onClick: handleAssignCatalog,
      },
    ];

    if (!branchPortOccupied) {
      acts.splice(1, 0, {
        id: 'start_branch_segment_sn',
        label: 'Dodaj odgałęzienie napowietrzne',
        variant: 'primary',
        onClick: handleAddBranch,
      });
    }

    return acts;
  }, [branchPoint, handleAddBranch, handleAssignCatalog, handleEditBranchPole]);

  if (!branchPoint) {
    return (
      <div className="p-4 text-xs text-gray-500">
        Nie znaleziono słupa rozgałęźnego.
      </div>
    );
  }

  return (
    <ObjectCard
      elementName={publicTechnicalLabel(branchPoint.name, 'Słup rozgałęźny SN')}
      elementType="Słup rozgałęźny SN"
      elementId={elementId}
      statusDot={statusDot}
      sections={sections}
      actions={actions}
      onClose={onClose}
    />
  );
}
