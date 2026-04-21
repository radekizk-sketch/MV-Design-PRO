/**
 * StationCard â€” karta obiektu stacji elektroenergetycznej (SN/nN).
 *
 * WyĹ›wietla identyfikacjÄ™, strukturÄ™ logicznÄ… stacji (pola SN, transformatory, szyny),
 * listÄ™ pĂłl z rolami oraz listÄ™ transformatorĂłw.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { formatStationTypeLabelPl } from '../../shared/stationTypeLabels';

// =============================================================================
// Helpers
// =============================================================================

function buildConverterSourceContext(
  stationRef: string,
  busNnRef: string | null,
  sourceTechnology: 'PV' | 'BESS' | 'FW',
): Record<string, unknown> {
  return {
    station_ref: stationRef,
    bus_nn_ref: busNnRef,
    source_technology: sourceTechnology,
    connection_variant: 'nn_side',
  };
}

function bayRoleLabel(role: string): string {
  switch (role) {
    case 'IN':
      return 'ZasilajÄ…ce (wejĹ›cie)';
    case 'OUT':
      return 'OdgaĹ‚Ä™Ĺşne (wyjĹ›cie)';
    case 'TR':
      return 'Transformatorowe';
    case 'COUPLER':
      return 'SprzÄ™gĹ‚o sekcji';
    case 'FEEDER':
      return 'ZasilajÄ…ce odgaĹ‚Ä™Ĺşne';
    case 'MEASUREMENT':
      return 'Pomiarowe';
    case 'OZE':
      return 'OZE / ĹşrĂłdĹ‚o';
    default:
      return role;
  }
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

export function StationCard({ elementId }: { elementId: string }) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const closeObjectCard = useNetworkBuildStore((s) => s.closeObjectCard);
  const activeMode = useAppStateStore((s) => s.activeMode);

  const station = useMemo(
    () => snapshot?.substations?.find((s) => s.id === elementId),
    [snapshot, elementId],
  );

  const stationBays = useMemo(
    () => (snapshot?.bays ?? []).filter((b) => b.substation_ref === elementId),
    [snapshot, elementId],
  );

  const stationTransformers = useMemo(
    () =>
      (snapshot?.transformers ?? []).filter((t) =>
        station?.transformer_refs?.includes(t.ref_id),
      ),
    [snapshot, station],
  );

  const stationBuses = useMemo(
    () =>
      (snapshot?.buses ?? []).filter((b) => station?.bus_refs?.includes(b.ref_id)),
    [snapshot, station],
  );

  const nnBuses = useMemo(
    () => stationBuses.filter((b) => b.voltage_kv < 1),
    [stationBuses],
  );

  const snBuses = useMemo(
    () => stationBuses.filter((b) => b.voltage_kv >= 1),
    [stationBuses],
  );

  const sections = useMemo((): CardSection[] => {
    if (!station) return [];

    const identSection: CardSection = {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'id', label: 'ID', value: station.id },
        { key: 'name', label: 'Nazwa', value: station.name },
        {
          key: 'station_type',
          label: 'Typ topologiczny',
          value: formatStationTypeLabelPl(station.station_type),
        },
        {
          key: 'entry_point',
          label: 'Punkt wejĹ›cia',
          value: station.entry_point_ref ?? 'â€”',
        },
      ],
    };

    const strukturaSection: CardSection = {
      id: 'struktura',
      label: 'Struktura',
      fields: [
        {
          key: 'bays_count',
          label: 'Pola SN',
          value: stationBays.length,
          unit: 'szt.',
          severity: stationBays.length === 0 ? 'warning' : 'ok',
        },
        {
          key: 'transformers_count',
          label: 'Transformatory',
          value: stationTransformers.length,
          unit: 'szt.',
          severity: stationTransformers.length === 0 ? 'warning' : 'ok',
        },
        {
          key: 'sn_buses_count',
          label: 'Szyny SN',
          value: snBuses.length,
          unit: 'szt.',
        },
        {
          key: 'nn_buses_count',
          label: 'Szyny nN',
          value: nnBuses.length,
          unit: 'szt.',
        },
      ],
    };

    // Pola SN â€” kaĹĽde pole jako wiersz
    const bayFields = stationBays.map((bay) => ({
      key: `bay_${bay.id}`,
      label: bay.name,
      value: bayRoleLabel(bay.bay_role),
    }));

    const baysSection: CardSection = {
      id: 'bays',
      label: 'Pola SN',
      fields:
        bayFields.length > 0
          ? bayFields
          : [{ key: 'no_bays', label: 'Brak pĂłl', value: 'Nie zdefiniowano pĂłl SN', severity: 'warning' as const }],
    };

    // Transformer-to-bay assignment enrichment (via equipment_refs)
    const enrichedTrFields = stationTransformers.map((tr) => {
      const trBay = stationBays.find((bay) =>
        bay.bay_role === 'TR' && bay.equipment_refs?.includes(tr.ref_id),
      );
      const bayInfo = trBay ? ` â†’ Pole: ${trBay.name}` : '';
      return {
        key: `tr_${tr.ref_id}`,
        label: tr.name,
        value: `${tr.sn_mva * 1000} kVA / uk=${tr.uk_percent}%${bayInfo}`,
        source: tr.catalog_ref ? ('catalog' as const) : ('instance' as const),
      };
    });

    const transformersSection: CardSection = {
      id: 'transformers',
      label: 'Transformatory',
      fields:
        enrichedTrFields.length > 0
          ? enrichedTrFields
          : [{ key: 'no_tr', label: 'Brak transformatora', value: 'Brak przypisanego transformatora', severity: 'warning' as const }],
    };

    const result: CardSection[] = [identSection, strukturaSection, baysSection, transformersSection];

    if (activeMode === 'RESULT_VIEW') {
      result.push({
        id: 'analysis',
        label: 'Wyniki analizy',
        fields: [
          { key: 'u_bus_pu', label: 'NapiÄ™cie U szyny', value: null, unit: 'pu', source: 'calculated' },
          { key: 'ik3', label: 'PrÄ…d zwarciowy Ikâ‚', value: null, unit: 'kA', source: 'calculated' },
          { key: 'ik1', label: 'PrÄ…d zwarciowy Ikâ‚', value: null, unit: 'kA', source: 'calculated' },
          { key: 'max_tr_loading', label: 'Maks. obciÄ…ĹĽenie trafo', value: null, unit: '%', source: 'calculated' },
          { key: 'no_results', label: 'Status', value: 'Brak wynikĂłw â€” uruchom analizÄ™', severity: 'warning' },
        ],
      });
    }

    return result;
  }, [station, stationBays, stationTransformers, snBuses, nnBuses, activeMode]);

  const handleAddTransformer = useCallback(() => {
    openOperationForm('add_transformer_sn_nn', { station_ref: elementId });
  }, [openOperationForm, elementId]);

  const handleEditStation = useCallback(() => {
    openOperationForm('update_element_parameters', {
      element_ref: elementId,
      element_type: 'substation',
    });
  }, [openOperationForm, elementId]);

  const handleAddPV = useCallback(() => {
    openOperationForm(
      'add_converter_source',
      buildConverterSourceContext(elementId, nnBuses[0]?.ref_id ?? null, 'PV'),
    );
  }, [openOperationForm, elementId, nnBuses]);

  const handleAddBESS = useCallback(() => {
    openOperationForm(
      'add_converter_source',
      buildConverterSourceContext(elementId, nnBuses[0]?.ref_id ?? null, 'BESS'),
    );
  }, [openOperationForm, elementId, nnBuses]);

  const handleAddFW = useCallback(() => {
    openOperationForm(
      'add_converter_source',
      buildConverterSourceContext(elementId, nnBuses[0]?.ref_id ?? null, 'FW'),
    );
  }, [openOperationForm, elementId, nnBuses]);

  const actions = useMemo((): CardAction[] => {
    const acts: CardAction[] = [
      {
        id: 'edit_station',
        label: 'Edytuj stację',
        variant: 'secondary',
        onClick: handleEditStation,
      },
      {
        id: 'add_transformer_sn_nn',
        label: 'Dodaj transformator',
        variant: 'primary',
        onClick: handleAddTransformer,
      },
    ];

    if (stationTransformers.length > 0) {
      acts.push({
        id: 'add_pv',
        label: 'Dodaj PV',
        variant: 'secondary',
        onClick: handleAddPV,
      });
      acts.push({
        id: 'add_bess',
        label: 'Dodaj BESS',
        variant: 'secondary',
        onClick: handleAddBESS,
      });
      acts.push({
        id: 'add_fw',
        label: 'Dodaj FW',
        variant: 'secondary',
        onClick: handleAddFW,
      });
    }

    return acts;
  }, [handleAddTransformer, handleAddBESS, handleAddFW, handleAddPV, handleEditStation, stationTransformers.length]);

  if (!station) return null;

  const dot = statusDotFromReadiness(elementId, readiness);

  return (
    <ObjectCard
      elementName={station.name}
      elementType={formatStationTypeLabelPl(station.station_type)}
      elementId={elementId}
      statusDot={dot}
      sections={sections}
      actions={actions}
      onClose={closeObjectCard}
    />
  );
}
