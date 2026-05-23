/**
 * LineSegmentCard — karta obiektu odcinka linii / kabla SN.
 *
 * Wyświetla topologię (szyny od/do), parametry elektryczne (R', X', długość,
 * obciążalność prądową i termiczną), stan łączeniowy oraz referencję katalogową.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import type { OverheadLine, Cable } from '../../../types/enm';

// =============================================================================
// Helpers
// =============================================================================

function branchTypeLabel(type: string): string {
  switch (type) {
    case 'line_overhead':
      return 'Linia napowietrzna SN';
    case 'cable':
      return 'Kabel SN';
    default:
      return type;
  }
}

function insulationLabel(insulation: string | null | undefined): string {
  if (!insulation) return '—';
  switch (insulation) {
    case 'XLPE':
      return 'XLPE (usieciowany polietylen)';
    case 'PVC':
      return 'PVC';
    case 'PAPER':
      return 'Papierowa (impregnowana)';
    default:
      return insulation;
  }
}

function statusLabel(status: string): string {
  return status === 'closed' ? 'Zamknięty' : 'Otwarty';
}

function statusSeverity(status: string): 'ok' | 'warning' {
  return status === 'closed' ? 'ok' : 'warning';
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

export function LineSegmentCard({ elementId }: { elementId: string }) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const logicalViews = useSnapshotStore((s) => s.logicalViews);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const closeObjectCard = useNetworkBuildStore((s) => s.closeObjectCard);
  const activeMode = useAppStateStore((s) => s.activeMode);

  const branch = useMemo(() => {
    const found = snapshot?.branches?.find((b) => b.ref_id === elementId);
    if (!found) return null;
    if (found.type !== 'line_overhead' && found.type !== 'cable') return null;
    return found as OverheadLine | Cable;
  }, [snapshot, elementId]);

  const fromBus = useMemo(
    () => snapshot?.buses?.find((b) => b.ref_id === branch?.from_bus_ref),
    [snapshot, branch],
  );

  const toBus = useMemo(
    () => snapshot?.buses?.find((b) => b.ref_id === branch?.to_bus_ref),
    [snapshot, branch],
  );

  const sections = useMemo((): CardSection[] => {
    if (!branch) return [];

    const rTotal = branch.r_ohm_per_km * branch.length_km;
    const xTotal = branch.x_ohm_per_km * branch.length_km;

    const identSection: CardSection = {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'name', label: 'Nazwa', value: branch.name },
        { key: 'type', label: 'Rodzaj', value: branchTypeLabel(branch.type) },
        {
          key: 'status',
          label: 'Stan łączeniowy',
          value: statusLabel(branch.status),
          severity: statusSeverity(branch.status),
        },
        ...(branch.type === 'cable'
          ? [
              {
                key: 'insulation',
                label: 'Izolacja',
                value: insulationLabel((branch as Cable).insulation),
              },
            ]
          : []),
      ],
    };

    const topoSection: CardSection = {
      id: 'topology',
      label: 'Topologia',
      fields: [
        {
          key: 'from_bus_ref',
          label: 'Szyna — od',
          value: fromBus ? `${fromBus.name} (${fromBus.ref_id})` : branch.from_bus_ref,
        },
        {
          key: 'to_bus_ref',
          label: 'Szyna — do',
          value: toBus ? `${toBus.name} (${toBus.ref_id})` : branch.to_bus_ref,
        },
        {
          key: 'voltage',
          label: 'Napięcie nominalne',
          value: fromBus?.voltage_kv ?? null,
          unit: 'kV',
        },
      ],
    };

    const paramSection: CardSection = {
      id: 'params',
      label: 'Parametry',
      fields: [
        {
          key: 'length',
          label: 'Długość',
          value: branch.length_km,
          unit: 'km',
          source: 'instance',
        },
        {
          key: 'r_per_km',
          label: 'R′',
          value: branch.r_ohm_per_km,
          unit: 'Ω/km',
          source: branch.catalog_ref ? 'catalog' : 'instance',
          severity: branch.r_ohm_per_km == null ? 'warning' : undefined,
        },
        {
          key: 'x_per_km',
          label: 'X′',
          value: branch.x_ohm_per_km,
          unit: 'Ω/km',
          source: branch.catalog_ref ? 'catalog' : 'instance',
          severity: branch.x_ohm_per_km == null ? 'warning' : undefined,
        },
        {
          key: 'r_total',
          label: 'R całkowite',
          value: rTotal,
          unit: 'Ω',
          source: 'calculated',
        },
        {
          key: 'x_total',
          label: 'X całkowite',
          value: xTotal,
          unit: 'Ω',
          source: 'calculated',
        },
        {
          key: 'in_a',
          label: 'Obciążalność In',
          value: branch.rating?.in_a ?? null,
          unit: 'A',
          source: branch.catalog_ref ? 'catalog' : 'instance',
          severity: branch.rating?.in_a == null ? 'warning' : undefined,
        },
        {
          key: 'ith_ka',
          label: 'Wytrzymałość Ith',
          value: branch.rating?.ith_ka ?? null,
          unit: 'kA',
          source: branch.catalog_ref ? 'catalog' : 'instance',
        },
        {
          key: 'idyn_ka',
          label: 'Wytrzymałość Idyn',
          value: branch.rating?.idyn_ka ?? null,
          unit: 'kA',
          source: branch.catalog_ref ? 'catalog' : 'instance',
        },
        ...(branch.r0_ohm_per_km != null
          ? [
              {
                key: 'r0_per_km',
                label: 'R₀′',
                value: branch.r0_ohm_per_km,
                unit: 'Ω/km',
                source: 'catalog' as const,
              },
              {
                key: 'x0_per_km',
                label: 'X₀′',
                value: branch.x0_ohm_per_km ?? null,
                unit: 'Ω/km',
                source: 'catalog' as const,
              },
            ]
          : []),
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
              : 'Wariant katalogowy wymagany',
          severity: branch.catalog_ref == null ? 'warning' : 'ok',
        },
      ],
    };

    // Role context from logical views
    let roleLabel = '—';
    if (logicalViews) {
      const isTrunk = logicalViews.trunks?.some(
        (t) => t.segments?.includes(elementId),
      );
      const isBranch = logicalViews.branches?.some(
        (br) => br.segments?.includes(elementId),
      );
      const isSecondary = logicalViews.secondary_connectors?.some(
        (sc) => sc.segment_ref === elementId,
      );
      if (isTrunk) roleLabel = 'Magistrala';
      else if (isBranch) roleLabel = 'Odgałęzienie';
      else if (isSecondary) roleLabel = 'Połączenie pierścieniowe';
    }

    identSection.fields.push({
      key: 'role',
      label: 'Rola w sieci',
      value: roleLabel,
    });

    const result: CardSection[] = [identSection, topoSection, paramSection, catalogSection];

    if (activeMode === 'RESULT_VIEW') {
      result.push({
        id: 'analysis',
        label: 'Wyniki analizy',
        fields: [
          { key: 'p_flow', label: 'Przepływ P', value: null, unit: 'MW', source: 'calculated' },
          { key: 'q_flow', label: 'Przepływ Q', value: null, unit: 'Mvar', source: 'calculated' },
          { key: 'i_flow', label: 'Prąd I', value: null, unit: 'A', source: 'calculated' },
          { key: 'loading', label: 'Obciążenie In', value: null, unit: '%', source: 'calculated' },
          { key: 'du_percent', label: 'Spadek napięcia ΔU', value: null, unit: '%', source: 'calculated' },
          { key: 'no_results', label: 'Status', value: 'Uruchom analizę, aby pokazać wyniki', severity: 'warning' },
        ],
      });
    }

    return result;
  }, [branch, fromBus, toBus, logicalViews, activeMode, elementId]);

  const handleAssignCatalog = useCallback(() => {
    openOperationForm('assign_catalog_to_element', {
      element_ref: elementId,
      element_type: 'branch',
    });
  }, [openOperationForm, elementId]);

  const handleInsertStation = useCallback(() => {
    openOperationForm('insert_station_on_segment_sn', { segment_id: elementId });
  }, [openOperationForm, elementId]);

  const handleInsertBranchPole = useCallback(() => {
    openOperationForm('insert_branch_pole_on_segment_sn', { segment_id: elementId });
  }, [openOperationForm, elementId]);

  const handleInsertZksn = useCallback(() => {
    openOperationForm('insert_zksn_on_segment_sn', { segment_id: elementId });
  }, [openOperationForm, elementId]);

  const handleInsertSwitch = useCallback(() => {
    openOperationForm('insert_section_switch_sn', { segment_id: elementId });
  }, [openOperationForm, elementId]);

  const actions = useMemo((): CardAction[] => [
    {
      id: 'assign_catalog',
      label: 'Przypisz katalog',
      variant: branch?.catalog_ref ? 'secondary' : 'primary',
      onClick: handleAssignCatalog,
    },
    {
      id: 'insert_station_on_segment_sn',
      label: 'Wstaw stację',
      variant: 'secondary',
      onClick: handleInsertStation,
    },
    ...(branch?.type === 'line_overhead'
      ? [{
          id: 'insert_branch_pole_on_segment_sn',
          label: 'Wstaw słup rozgałęźny',
          variant: 'secondary' as const,
          onClick: handleInsertBranchPole,
        }]
      : []),
    ...(branch?.type === 'cable'
      ? [{
          id: 'insert_zksn_on_segment_sn',
          label: 'Wstaw ZKSN',
          variant: 'secondary' as const,
          onClick: handleInsertZksn,
        }]
      : []),
    {
      id: 'insert_section_switch_sn',
      label: 'Wstaw łącznik',
      variant: 'secondary',
      onClick: handleInsertSwitch,
    },
  ], [handleAssignCatalog, handleInsertStation, handleInsertBranchPole, handleInsertZksn, handleInsertSwitch, branch?.catalog_ref]);

  if (!branch) return null;

  const dot = statusDotFromReadiness(elementId, readiness);

  return (
    <ObjectCard
      elementName={branch.name}
      elementType={branchTypeLabel(branch.type)}
      elementId={elementId}
      statusDot={dot}
      sections={sections}
      actions={actions}
      onClose={closeObjectCard}
    />
  );
}
