/**
 * BranchPoleCard â€” karta sĹ‚upa rozgaĹ‚Ä™Ĺşnego SN.
 *
 * SĹ‚up rozgaĹ‚Ä™Ĺşny jest odrÄ™bnÄ… klasÄ… obiektu (BranchPoleMV), osadzanÄ…
 * wyĹ‚Ä…cznie na linii napowietrznej SN. NIE jest stacjÄ….
 *
 * WyĹ›wietla:
 * A. IdentyfikacjÄ™ i rolÄ™ w sieci
 * B. TopologiÄ™: port MAIN_IN / MAIN_OUT / BRANCH
 * C. Parametry katalogowe
 * D. GotowoĹ›Ä‡ i status kompletnoĹ›ci
 * E. DostÄ™pne akcje inĹĽynierskie
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import type { BranchPointSN } from '../../../types/enm';

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
      return 'RÄ™czny (ekspert)';
    default:
      return mode ?? 'â€”';
  }
}

function completenessLabel(status: string | null | undefined): string {
  switch (status) {
    case 'KOMPLETNY':
      return 'Kompletny';
    case 'NIEKOMPLETNY':
      return 'Niekompletny';
    case 'BRAK_KATALOGU':
      return 'Brak powiÄ…zania katalogowego';
    default:
      return 'â€”';
  }
}

function completenessStatus(status: string | null | undefined): 'ok' | 'warning' | 'error' {
  if (status === 'KOMPLETNY') return 'ok';
  if (status === 'NIEKOMPLETNY') return 'warning';
  return 'error';
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

    const result: CardSection[] = [
      {
        id: 'ident',
        label: 'Identyfikacja',
        fields: [
          { key: 'ref_id', label: 'Identyfikator', value: branchPoint.ref_id },
          { key: 'name', label: 'Nazwa', value: branchPoint.name },
          { key: 'type', label: 'Typ obiektu', value: 'SĹ‚up rozgaĹ‚Ä™Ĺşny SN' },
          { key: 'parent_segment', label: 'Odcinek nadrzÄ™dny', value: branchPoint.parent_segment_id },
        ],
      },
      {
        id: 'topology',
        label: 'Topologia',
        fields: [
          { key: 'main_in', label: 'Port MAIN_IN', value: branchPoint.ports?.MAIN_IN ?? 'â€”' },
          { key: 'main_out', label: 'Port MAIN_OUT', value: branchPoint.ports?.MAIN_OUT ?? 'â€”' },
          {
            key: 'branch_port',
            label: 'Port odgalezienia',
            value: branchPoint.ports?.BRANCH?.[0] ?? 'â€”',
          },
          {
            key: 'branch_occupied',
            label: 'Port odgalezienia zajety',
            value: branchPoint.branch_occupied?.['BRANCH']
              ? `Tak (${branchPoint.branch_occupied['BRANCH']})`
              : 'Wolny',
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
            value: branchPoint.catalog_ref ?? 'â€”',
          },
          {
            key: 'catalog_namespace',
            label: 'PrzestrzeĹ„ nazw',
            value: branchPoint.catalog_namespace ?? 'â€”',
          },
          {
            key: 'source_mode',
            label: 'Tryb ĹşrĂłdĹ‚a',
            value: sourceModeLabel(branchPoint.source_mode),
          },
          {
            key: 'completeness',
            label: 'KompletnoĹ›Ä‡',
            value: completenessLabel(branchPoint.completeness_status),
          },
        ],
      },
    ];

    return result;
  }, [branchPoint]);

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

    const acts: CardAction[] = [
      {
        id: 'edit_branch_pole',
        label: 'Edytuj sĹ‚up',
        variant: 'secondary',
        onClick: handleEditBranchPole,
      },
      {
        id: 'start_branch_segment_sn',
        label: 'Dodaj odgaĹ‚Ä™zienie',
        variant: 'primary',
        onClick: handleAddBranch,
        disabled: !!(branchPoint.branch_occupied?.['BRANCH']),
      },
      {
        id: 'assign_catalog',
        label: 'Dobierz z katalogu',
        variant: 'secondary',
        onClick: handleAssignCatalog,
      },
    ];

    return acts;
  }, [branchPoint, handleAddBranch, handleAssignCatalog, handleEditBranchPole]);

  if (!branchPoint) {
    return (
      <div className="p-4 text-xs text-gray-500">
        SĹ‚up rozgaĹ‚Ä™Ĺşny nie znaleziony: {elementId}
      </div>
    );
  }

  return (
    <ObjectCard
      elementName={branchPoint.name}
      elementType="SĹ‚up rozgaĹ‚Ä™Ĺşny SN"
      elementId={elementId}
      statusDot={statusDot}
      sections={sections}
      actions={actions}
      onClose={onClose}
    />
  );
}
