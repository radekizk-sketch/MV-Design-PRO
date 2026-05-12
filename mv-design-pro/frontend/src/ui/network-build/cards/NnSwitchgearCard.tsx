/**
 * NnSwitchgearCard — karta przeglądu rozdzielnicy nN stacji.
 *
 * Wyświetla identyfikację stacji, pola nN (odbiorcy, szyny nN),
 * odbiorców (Load) przyłączonych do szyn nN oraz źródła OZE/BESS.
 * Akcje: Dodaj PV, Dodaj BESS, Dodaj obciążenie.
 *
 * Props: elementId — id Substation.
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
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

function connectionVariantLabel(variant: string | null | undefined): string {
  switch (variant) {
    case 'nn_side':
      return 'Strona nN stacji';
    case 'block_transformer':
      return 'Transformator blokowy SN';
    default:
      return variant ?? '—';
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

export function NnSwitchgearCard({ elementId }: { elementId: string }) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const closeObjectCard = useNetworkBuildStore((s) => s.closeObjectCard);

  const station = useMemo(
    () => snapshot?.substations?.find((s) => s.id === elementId),
    [snapshot, elementId],
  );

  // nN buses belonging to this station (voltage < 1 kV)
  const nnBuses = useMemo(() => {
    if (!station || !snapshot) return [];
    return (snapshot.buses ?? []).filter(
      (b) => station.bus_refs.includes(b.ref_id) && b.voltage_kv < 1,
    );
  }, [snapshot, station]);

  const nnBusRefs = useMemo(() => new Set(nnBuses.map((b) => b.ref_id)), [nnBuses]);

  // Bays with OZE role
  const ozeBays = useMemo(
    () => (snapshot?.bays ?? []).filter(
      (b) => b.substation_ref === elementId && b.bay_role === 'OZE',
    ),
    [snapshot, elementId],
  );

  // Loads connected to nN buses of this station
  const nnLoads = useMemo(
    () => (snapshot?.loads ?? []).filter((l) => nnBusRefs.has(l.bus_ref)),
    [snapshot, nnBusRefs],
  );

  // Generators (OZE/BESS) attached to this station
  const stationGenerators = useMemo(
    () =>
      (snapshot?.generators ?? []).filter(
        (g) =>
          g.station_ref === elementId ||
          nnBusRefs.has(g.bus_ref),
      ),
    [snapshot, elementId, nnBusRefs],
  );

  const pvGenerators = useMemo(
    () => stationGenerators.filter((g) => g.gen_type === 'pv_inverter'),
    [stationGenerators],
  );

  const bessGenerators = useMemo(
    () => stationGenerators.filter((g) => g.gen_type === 'bess'),
    [stationGenerators],
  );

  const windGenerators = useMemo(
    () => stationGenerators.filter((g) => g.gen_type === 'wind_inverter'),
    [stationGenerators],
  );

  const sections = useMemo((): CardSection[] => {
    if (!station) return [];

    const identSection: CardSection = {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'id', label: 'ID stacji', value: station.id },
        { key: 'name', label: 'Nazwa', value: station.name },
        { key: 'type', label: 'Typ topologiczny', value: formatStationTypeLabelPl(station.station_type) },
      ],
    };

    // nN buses list
    const nNBusFields = nnBuses.map((bus) => ({
      key: `nn_bus_${bus.ref_id}`,
      label: bus.name,
      value: `${bus.voltage_kv} kV — nN`,
    }));

    const nnSection: CardSection = {
      id: 'nn_buses',
      label: 'Pola nN',
      fields:
        nNBusFields.length > 0
          ? [
              {
                key: 'nn_bus_count',
                label: 'Szyny nN',
                value: nnBuses.length,
                unit: 'szt.',
              },
              {
                key: 'oze_bays_count',
                label: 'Pola OZE',
                value: ozeBays.length,
                unit: 'szt.',
              },
              ...nNBusFields,
            ]
          : [
              {
                key: 'no_nn',
                label: 'Brak szyn nN',
                value: 'Stacja bez rozdzielnicy nN — wymagany transformator SN/nN',
                severity: 'warning' as const,
              },
            ],
    };

    // Loads
    const loadFields = nnLoads.map((load) => ({
      key: `load_${load.ref_id}`,
      label: load.name,
      value: `P=${load.p_mw * 1000} kW, Q=${load.q_mvar * 1000} kvar`,
      source: load.catalog_ref ? ('catalog' as const) : ('instance' as const),
    }));

    const totalLoadMw = nnLoads.reduce((acc, l) => acc + l.p_mw, 0);

    const loadsSection: CardSection = {
      id: 'loads',
      label: 'Odbiorcy',
      fields:
        loadFields.length > 0
          ? [
              {
                key: 'load_count',
                label: 'Liczba odbiornik?w',
                value: nnLoads.length,
                unit: 'szt.',
              },
              {
                key: 'total_load',
                label: '?czna moc czynna',
                value: totalLoadMw * 1000,
                unit: 'kW',
                source: 'calculated' as const,
              },
              ...loadFields,
            ]
          : [
              {
                key: 'no_loads',
                label: 'Brak odbiorc?w',
                value: 'Brak obciążeń przyłączonych do szyn nN',
                severity: 'warning' as const,
              },
            ],
    };

    // Sources — PV, BESS, wind
    const allSourceFields = [
      ...pvGenerators.map((g) => ({
        key: `pv_${g.ref_id}`,
        label: g.name,
        value: `PV — P=${g.p_mw * 1000} kWp / ${connectionVariantLabel(g.connection_variant)}`,
        source: g.catalog_ref ? ('catalog' as const) : ('instance' as const),
        severity: !g.connection_variant ? ('warning' as const) : undefined,
      })),
      ...bessGenerators.map((g) => ({
        key: `bess_${g.ref_id}`,
        label: g.name,
        value: `BESS — P=${g.p_mw * 1000} kW / ${connectionVariantLabel(g.connection_variant)}`,
        source: g.catalog_ref ? ('catalog' as const) : ('instance' as const),
        severity: !g.connection_variant ? ('warning' as const) : undefined,
      })),
      ...windGenerators.map((g) => ({
        key: `wind_${g.ref_id}`,
        label: g.name,
        value: `Wiatr — P=${g.p_mw * 1000} kW / ${connectionVariantLabel(g.connection_variant)}`,
        source: g.catalog_ref ? ('catalog' as const) : ('instance' as const),
        severity: !g.connection_variant ? ('warning' as const) : undefined,
      })),
    ];

    const normalizedSourceFields = allSourceFields.map((field) =>
      field.key.startsWith('wind_')
        ? { ...field, value: String(field.value).replace('Wiatr', 'FW') }
        : field,
    );

    const totalGenMw = stationGenerators.reduce((acc, g) => acc + g.p_mw, 0);

    const sourcesSection: CardSection = {
      id: 'sources',
      label: 'Źródła OZE / BESS',
      fields:
        normalizedSourceFields.length > 0
          ? [
              {
                key: 'pv_count',
                label: 'Inwertery PV',
                value: pvGenerators.length,
                unit: 'szt.',
              },
              {
                key: 'bess_count',
                label: 'Magazyny BESS',
                value: bessGenerators.length,
                unit: 'szt.',
              },
              {
                key: 'fw_count',
                label: 'Źródła FW',
                value: windGenerators.length,
                unit: 'szt.',
              },
              {
                key: 'total_gen',
                label: '?czna moc generacji',
                value: totalGenMw * 1000,
                unit: 'kWp',
                source: 'calculated' as const,
              },
              ...normalizedSourceFields,
            ]
          : [
              {
                key: 'no_sources',
                label: 'Brak źródeł OZE',
                value: 'Nie zdefiniowano źródeł OZE/BESS',
              },
            ],
    };
    sourcesSection.label = 'Źródła PV / BESS / FW';
    if (normalizedSourceFields.length === 0) {
      sourcesSection.fields[0] = {
        key: 'no_sources',
        label: 'Brak źródeł',
        value: 'Nie zdefiniowano źródeł PV, BESS ani FW',
      };
    }

    // Power balance section
    const balanceMw = totalGenMw - totalLoadMw;
    const bilansSection: CardSection = {
      id: 'bilans',
      label: 'Bilans mocy',
      fields: [
        {
          key: 'total_gen',
          label: 'Generacja P_gen',
          value: totalGenMw * 1000,
          unit: 'kW',
          source: 'calculated',
        },
        {
          key: 'total_load',
          label: 'Obciążenie P_load',
          value: totalLoadMw * 1000,
          unit: 'kW',
          source: 'calculated',
        },
        {
          key: 'balance',
          label: 'Nadwyżka / Deficyt',
          value: balanceMw * 1000,
          unit: 'kW',
          source: 'calculated',
          severity: balanceMw > 0 ? 'warning' : 'ok',
        },
      ],
    };

    return [identSection, nnSection, loadsSection, bilansSection, sourcesSection];
  }, [station, nnBuses, ozeBays, nnLoads, pvGenerators, bessGenerators, windGenerators, stationGenerators]);

  const handleAddPV = useCallback(() => {
    const nnBusRef = nnBuses[0]?.ref_id;
    openOperationForm(
      'add_converter_source',
      buildConverterSourceContext(elementId, nnBusRef ?? null, 'PV'),
    );
  }, [openOperationForm, elementId, nnBuses]);

  const handleAddBESS = useCallback(() => {
    const nnBusRef = nnBuses[0]?.ref_id;
    openOperationForm(
      'add_converter_source',
      buildConverterSourceContext(elementId, nnBusRef ?? null, 'BESS'),
    );
  }, [openOperationForm, elementId, nnBuses]);

  const handleAddFW = useCallback(() => {
    const nnBusRef = nnBuses[0]?.ref_id;
    openOperationForm(
      'add_converter_source',
      buildConverterSourceContext(elementId, nnBusRef ?? null, 'FW'),
    );
  }, [openOperationForm, elementId, nnBuses]);

  const handleAddLoad = useCallback(() => {
    const nnBusRef = nnBuses[0]?.ref_id;
    openOperationForm('add_nn_load', {
      station_ref: elementId,
      bus_nn_ref: nnBusRef ?? null,
    });
  }, [openOperationForm, elementId, nnBuses]);

  const actions = useMemo((): CardAction[] => [
    {
      id: 'add_pv',
      label: 'Dodaj PV',
      variant: 'primary',
      onClick: handleAddPV,
      disabled: nnBuses.length === 0,
    },
    {
      id: 'add_bess',
      label: 'Dodaj BESS',
      variant: 'secondary',
      onClick: handleAddBESS,
      disabled: nnBuses.length === 0,
    },
    {
      id: 'add_fw',
      label: 'Dodaj FW',
      variant: 'secondary',
      onClick: handleAddFW,
      disabled: nnBuses.length === 0,
    },
    {
      id: 'add_nn_load',
      label: 'Dodaj obciążenie',
      variant: 'secondary',
      onClick: handleAddLoad,
      disabled: nnBuses.length === 0,
    },
  ], [handleAddPV, handleAddBESS, handleAddFW, handleAddLoad, nnBuses.length]);

  if (!station) return null;

  const dot = statusDotFromReadiness(elementId, readiness);

  return (
    <ObjectCard
      elementName={station.name}
      elementType="Rozdzielnica nN stacji"
      elementId={elementId}
      statusDot={dot}
      sections={sections}
      actions={actions}
      onClose={closeObjectCard}
    />
  );
}
