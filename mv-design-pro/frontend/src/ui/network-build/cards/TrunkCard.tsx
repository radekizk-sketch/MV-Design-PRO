/**
 * TrunkCard — karta obiektu korytarza magistralowego (trunk/corridor SN).
 *
 * Wyświetla identyfikację magistrali, segmenty z długościami, stan terminali
 * (otwarte / zajęte) oraz sumaryczną długość.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import type { OverheadLine, Cable } from '../../../types/enm';

// =============================================================================
// Helpers
// =============================================================================

function corridorTypeLabel(type: string): string {
  switch (type) {
    case 'radial':
      return 'Promieniowy';
    case 'ring':
      return 'Pierścieniowy';
    case 'mixed':
      return 'Mieszany';
    default:
      return type;
  }
}

function terminalStatusLabel(status: string): string {
  switch (status) {
    case 'OTWARTY':
      return 'Otwarty (wolny)';
    case 'ZAJETY':
      return 'Zajęty';
    case 'ZAREZERWOWANY_DLA_RINGU':
      return 'Zarezerwowany — ring';
    default:
      return status;
  }
}

function terminalStatusSeverity(status: string): 'ok' | 'warning' | 'error' | undefined {
  switch (status) {
    case 'OTWARTY':
      return 'warning';
    case 'ZAJETY':
      return 'ok';
    case 'ZAREZERWOWANY_DLA_RINGU':
      return 'warning';
    default:
      return undefined;
  }
}

function branchTypeLabel(type: string): string {
  switch (type) {
    case 'line_overhead':
      return 'linia napowietrzna';
    case 'cable':
      return 'kabel';
    default:
      return type;
  }
}

// =============================================================================
// Component
// =============================================================================

export function TrunkCard({ corridorRef }: { corridorRef: string }) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const logicalViews = useSnapshotStore((s) => s.logicalViews);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const closeObjectCard = useNetworkBuildStore((s) => s.closeObjectCard);

  const corridor = useMemo(
    () => snapshot?.corridors?.find((c) => c.ref_id === corridorRef),
    [snapshot, corridorRef],
  );

  const trunkView = useMemo(
    () => logicalViews?.trunks?.find((t) => t.corridor_ref === corridorRef),
    [logicalViews, corridorRef],
  );

  // Segment branches belonging to this corridor
  const segmentBranches = useMemo(() => {
    if (!corridor || !snapshot) return [];
    return (snapshot.branches ?? []).filter(
      (b) =>
        corridor.ordered_segment_refs.includes(b.ref_id) &&
        (b.type === 'line_overhead' || b.type === 'cable'),
    ) as (OverheadLine | Cable)[];
  }, [corridor, snapshot]);

  const totalLengthKm = useMemo(
    () => segmentBranches.reduce((acc, b) => acc + b.length_km, 0),
    [segmentBranches],
  );

  const trunkTerminals = useMemo(
    () => (trunkView?.terminals ?? []),
    [trunkView],
  );

  const sections = useMemo((): CardSection[] => {
    if (!corridor) return [];

    const identSection: CardSection = {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'name', label: 'Nazwa magistrali', value: corridor.name },
        { key: 'ref_id', label: 'ID', value: corridor.ref_id },
        { key: 'type', label: 'Rodzaj', value: corridorTypeLabel(corridor.corridor_type) },
        {
          key: 'no_point',
          label: 'Normalny punkt otwarcia',
          value: corridor.no_point_ref ?? '—',
        },
      ],
    };

    const segmentFields = segmentBranches.map((b, idx) => ({
      key: `seg_${b.ref_id}`,
      label: `Segment ${idx + 1} — ${b.name}`,
      value: `${branchTypeLabel(b.type)}, ${b.length_km.toLocaleString('pl-PL', { maximumFractionDigits: 3 })} km`,
      source: b.catalog_ref ? ('catalog' as const) : ('instance' as const),
    }));

    const segmentsSection: CardSection = {
      id: 'segments',
      label: 'Segmenty',
      fields:
        segmentFields.length > 0
          ? segmentFields
          : [{ key: 'no_seg', label: 'Brak segmentów', value: 'Magistrala bez odcinków', severity: 'warning' as const }],
    };

    const terminalFields = trunkTerminals.map((t, idx) => ({
      key: `terminal_${t.element_id}_${idx}`,
      label: `Terminal ${idx + 1} — ${t.port_id}`,
      value: terminalStatusLabel(t.status),
      severity: terminalStatusSeverity(t.status),
    }));

    const terminalsSection: CardSection = {
      id: 'terminals',
      label: 'Terminale',
      fields:
        terminalFields.length > 0
          ? terminalFields
          : [{ key: 'no_terminals', label: 'Brak terminali', value: '—' }],
    };

    const summarySection: CardSection = {
      id: 'summary',
      label: 'Podsumowanie',
      fields: [
        {
          key: 'total_length',
          label: 'Sumaryczna długość',
          value: totalLengthKm,
          unit: 'km',
          source: 'calculated',
        },
        {
          key: 'segment_count',
          label: 'Liczba segmentów',
          value: segmentBranches.length,
          unit: 'szt.',
        },
        {
          key: 'open_terminals',
          label: 'Otwarte terminale',
          value: trunkTerminals.filter((t) => t.status === 'OTWARTY').length,
          unit: 'szt.',
          severity: trunkTerminals.some((t) => t.status === 'OTWARTY') ? 'warning' : 'ok',
        },
      ],
    };

    return [identSection, segmentsSection, terminalsSection, summarySection];
  }, [corridor, segmentBranches, trunkTerminals, totalLengthKm]);

  const hasOpenTerminal = useMemo(
    () => trunkTerminals.some((t) => t.status === 'OTWARTY'),
    [trunkTerminals],
  );

  const handleContinueTrunk = useCallback(() => {
    const openTerminal = trunkTerminals.find((t) => t.status === 'OTWARTY');
    openOperationForm('continue_trunk_segment_sn', {
      trunk_id: corridorRef,
      from_terminal_id: openTerminal?.element_id ?? null,
    });
  }, [openOperationForm, corridorRef, trunkTerminals]);

  const handleInsertStation = useCallback(() => {
    openOperationForm('insert_station_on_segment_sn', { corridor_ref: corridorRef });
  }, [openOperationForm, corridorRef]);

  const actions = useMemo((): CardAction[] => [
    {
      id: 'continue_trunk_segment_sn',
      label: 'Kontynuuj magistralę',
      variant: 'primary',
      onClick: handleContinueTrunk,
      disabled: !hasOpenTerminal,
    },
    {
      id: 'insert_station_on_segment_sn',
      label: 'Wstaw stację',
      variant: 'secondary',
      onClick: handleInsertStation,
      disabled: segmentBranches.length === 0,
    },
  ], [handleContinueTrunk, handleInsertStation, hasOpenTerminal, segmentBranches.length]);

  if (!corridor) return null;

  return (
    <ObjectCard
      elementName={corridor.name}
      elementType={`Magistrala SN — ${corridorTypeLabel(corridor.corridor_type)}`}
      elementId={corridorRef}
      statusDot={hasOpenTerminal ? 'warning' : 'ok'}
      sections={sections}
      actions={actions}
      onClose={closeObjectCard}
    />
  );
}
