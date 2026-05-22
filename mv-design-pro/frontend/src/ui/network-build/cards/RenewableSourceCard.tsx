/**
 * RenewableSourceCard — karta obiektu układu PV/BESS/FW.
 *
 * Wyświetla identyfikację, parametry elektryczne (moc czynna/bierna, cos_phi, limity),
 * dane przyłączenia (wariant, stacja, transformator blokowy) oraz referencję katalogową.
 * Akcje: Przypisz katalog, Edytuj parametry.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import {
  formatGeneratorTypeLabelPl,
  formatGeneratorTypeShortLabelPl,
} from '../../shared/generatorTypeLabels';

// =============================================================================
// Helpers
// =============================================================================

function genTypeLabel(genType: string | null | undefined): string {
  return formatGeneratorTypeLabelPl(genType);
}

function genTypeShort(genType: string | null | undefined): string {
  return formatGeneratorTypeShortLabelPl(genType);
}

function connectionVariantLabel(variant: string | null | undefined): string {
  switch (variant) {
    case 'nn_side':
      return 'Strona nN stacji (przez rozdzielnicę nN)';
    case 'block_transformer':
      return 'Transformator blokowy (bezpośrednio do SN)';
    default:
      return '—';
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

/** Oblicza cos(φ) z P i Q — jeśli oba dostępne. */
function calcCosPhi(pMw: number, qMvar: number | null | undefined): number | null {
  if (qMvar == null) return null;
  const s = Math.sqrt(pMw * pMw + qMvar * qMvar);
  if (s === 0) return null;
  return Math.round((pMw / s) * 10000) / 10000;
}

// =============================================================================
// Component
// =============================================================================

export function RenewableSourceCard({ elementId }: { elementId: string }) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const closeObjectCard = useNetworkBuildStore((s) => s.closeObjectCard);

  const generator = useMemo(
    () => snapshot?.generators?.find((g) => g.ref_id === elementId),
    [snapshot, elementId],
  );

  const bus = useMemo(
    () => snapshot?.buses?.find((b) => b.ref_id === generator?.bus_ref),
    [snapshot, generator],
  );

  const parentStation = useMemo(
    () =>
      generator?.station_ref
        ? snapshot?.substations?.find((s) => s.id === generator.station_ref)
        : null,
    [snapshot, generator],
  );

  const blockingTransformer = useMemo(
    () =>
      generator?.blocking_transformer_ref
        ? snapshot?.transformers?.find((t) => t.ref_id === generator.blocking_transformer_ref)
        : null,
    [snapshot, generator],
  );

  const cosPhi = useMemo(
    () => calcCosPhi(generator?.p_mw ?? 0, generator?.q_mvar),
    [generator],
  );

  const sections = useMemo((): CardSection[] => {
    if (!generator) return [];

    const identSection: CardSection = {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'name', label: 'Nazwa', value: generator.name },
        {
          key: 'gen_type',
          label: 'Typ źródła',
          value: genTypeLabel(generator.gen_type),
        },
        ...(generator.tags?.length
          ? [{ key: 'tags', label: 'Znaczniki', value: generator.tags.join(', ') }]
          : []),
      ],
    };

    const paramSection: CardSection = {
      id: 'params',
      label: 'Parametry',
      fields: [
        {
          key: 'p_mw',
          label: 'Moc czynna P',
          value: generator.p_mw * 1000,
          unit: 'kW',
          source: generator.catalog_ref ? 'catalog' : 'instance',
          severity: generator.p_mw == null ? 'warning' : undefined,
        },
        {
          key: 'q_mvar',
          label: 'Moc bierna Q',
          value: generator.q_mvar != null ? generator.q_mvar * 1000 : null,
          unit: 'kvar',
          source: 'instance',
        },
        {
          key: 'cos_phi',
          label: 'Współczynnik mocy cos(φ)',
          value: cosPhi,
          source: 'calculated',
        },
        ...(generator.limits
          ? [
              {
                key: 'p_min',
                label: 'P min',
                value:
                  generator.limits.p_min_mw != null
                    ? generator.limits.p_min_mw * 1000
                    : null,
                unit: 'kW',
                source: 'catalog' as const,
              },
              {
                key: 'p_max',
                label: 'P max',
                value:
                  generator.limits.p_max_mw != null
                    ? generator.limits.p_max_mw * 1000
                    : null,
                unit: 'kW',
                source: 'catalog' as const,
              },
              {
                key: 'q_min',
                label: 'Q min',
                value:
                  generator.limits.q_min_mvar != null
                    ? generator.limits.q_min_mvar * 1000
                    : null,
                unit: 'kvar',
                source: 'catalog' as const,
              },
              {
                key: 'q_max',
                label: 'Q max',
                value:
                  generator.limits.q_max_mvar != null
                    ? generator.limits.q_max_mvar * 1000
                    : null,
                unit: 'kvar',
                source: 'catalog' as const,
              },
            ]
          : []),
        ...(generator.quantity != null
          ? [
              {
                key: 'quantity',
                label: 'Liczba modułów',
                value: generator.quantity,
                unit: 'szt.',
              },
            ]
          : []),
        ...(generator.n_parallel != null
          ? [
              {
                key: 'n_parallel',
                label: 'Inwertery równoległe',
                value: generator.n_parallel,
                unit: 'szt.',
              },
            ]
          : []),
      ],
    };

    const connectionSection: CardSection = {
      id: 'connection',
      label: 'Przyłączenie',
      fields: [
        {
          key: 'connection_variant',
          label: 'Wariant przyłączenia',
          value: connectionVariantLabel(generator.connection_variant),
          severity: !generator.connection_variant ? 'warning' : undefined,
        },
        {
          key: 'bus_ref',
          label: 'Szyna przyłączenia',
          value: bus ? `${bus.name} (${bus.voltage_kv} kV)` : generator.bus_ref,
          severity: !bus ? 'error' : undefined,
        },
        {
          key: 'station_ref',
          label: 'Stacja',
          value: parentStation?.name ?? generator.station_ref ?? '—',
          severity:
            generator.connection_variant === 'nn_side' && !generator.station_ref
              ? 'warning'
              : undefined,
        },
        ...(generator.connection_variant === 'block_transformer'
          ? [
              {
                key: 'blocking_tr',
                label: 'Transformator blokowy',
                value: blockingTransformer?.name ?? generator.blocking_transformer_ref ?? '—',
                severity: !generator.blocking_transformer_ref
                  ? ('error' as const)
                  : undefined,
              },
              ...(blockingTransformer
                ? [
                    {
                      key: 'blocking_tr_sn',
                      label: 'Moc trafo blokowego',
                      value: blockingTransformer.sn_mva * 1000,
                      unit: 'kVA',
                      source: 'catalog' as const,
                    },
                    {
                      key: 'blocking_tr_uk',
                      label: 'Uk trafo blokowego',
                      value: blockingTransformer.uk_percent,
                      unit: '%',
                      source: 'catalog' as const,
                    },
                  ]
                : []),
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
          value: generator.catalog_ref ?? null,
          source: 'catalog',
          severity: generator.catalog_ref == null ? 'warning' : undefined,
        },
        {
          key: 'param_source',
          label: 'Źródło parametrów',
          value: generator.parameter_source === 'CATALOG'
            ? 'Katalog (zablokowane)'
            : generator.parameter_source === 'OVERRIDE'
              ? 'Nadpisanie ręczne'
              : 'Wariant katalogowy wymagany',
          severity: generator.catalog_ref == null ? 'warning' : 'ok',
        },
      ],
    };

    return [identSection, paramSection, connectionSection, catalogSection];
  }, [generator, bus, parentStation, blockingTransformer, cosPhi]);

  const handleAssignCatalog = useCallback(() => {
    openOperationForm('assign_catalog_to_element', {
      element_ref: elementId,
      element_type: 'generator',
    });
  }, [openOperationForm, elementId]);

  const handleEditParams = useCallback(() => {
    openOperationForm('update_element_parameters', {
      element_ref: elementId,
      element_type: 'generator',
    });
  }, [openOperationForm, elementId]);

  const actions = useMemo((): CardAction[] => [
    {
      id: 'assign_catalog',
      label: 'Przypisz katalog',
      variant: generator?.catalog_ref ? 'secondary' : 'primary',
      onClick: handleAssignCatalog,
    },
    {
      id: 'edit_params',
      label: 'Edytuj parametry',
      variant: 'secondary',
      onClick: handleEditParams,
    },
  ], [handleAssignCatalog, handleEditParams, generator?.catalog_ref]);

  if (!generator) return null;

  const dot = statusDotFromReadiness(elementId, readiness);

  return (
    <ObjectCard
      elementName={generator.name}
      elementType={`Źródło OZE — ${genTypeShort(generator.gen_type)}`}
      elementId={elementId}
      statusDot={dot}
      sections={sections}
      actions={actions}
      onClose={closeObjectCard}
    />
  );
}
