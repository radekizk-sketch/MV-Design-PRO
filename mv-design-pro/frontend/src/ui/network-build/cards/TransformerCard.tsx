/**
 * TransformerCard — karta obiektu transformatora SN/nN.
 *
 * Wyświetla topologię (szyny WN/nN), parametry zwarciowe (Sn, Uk%, Pk),
 * dane przekładni i grup połączeń, pozycję zaczepów oraz referencję katalogową.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { type CardSection, type CardAction } from './ObjectCard';
import { TechCard } from '../../tech-card';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';

// =============================================================================
// Helpers
// =============================================================================

function groundingLabel(type: string | null | undefined): string {
  if (!type) return '—';
  switch (type) {
    case 'isolated':
      return 'Izolowany';
    case 'petersen_coil':
      return 'Cewka Petersena';
    case 'directly_grounded':
      return 'Bezpośrednie';
    case 'resistor_grounded':
      return 'Rezystancyjne';
    default:
      return type;
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

export function TransformerCard({ elementId }: { elementId: string }) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const closeObjectCard = useNetworkBuildStore((s) => s.closeObjectCard);
  const activeMode = useAppStateStore((s) => s.activeMode);

  const transformer = useMemo(
    () => snapshot?.transformers?.find((t) => t.ref_id === elementId),
    [snapshot, elementId],
  );

  const hvBus = useMemo(
    () => snapshot?.buses?.find((b) => b.ref_id === transformer?.hv_bus_ref),
    [snapshot, transformer],
  );

  const lvBus = useMemo(
    () => snapshot?.buses?.find((b) => b.ref_id === transformer?.lv_bus_ref),
    [snapshot, transformer],
  );

  const parentStation = useMemo(
    () =>
      snapshot?.substations?.find((s) =>
        s.transformer_refs?.includes(elementId),
      ),
    [snapshot, elementId],
  );

  const sections = useMemo((): CardSection[] => {
    if (!transformer) return [];

    const identSection: CardSection = {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'name', label: 'Nazwa', value: transformer.name },
        {
          key: 'station',
          label: 'Stacja',
          value: parentStation ? `${parentStation.name} (${parentStation.id})` : '—',
        },
      ],
    };

    const topoSection: CardSection = {
      id: 'topology',
      label: 'Topologia',
      fields: [
        {
          key: 'hv_bus',
          label: 'Szyna WN',
          value: hvBus ? `${hvBus.name} — ${hvBus.voltage_kv} kV` : transformer.hv_bus_ref,
          severity: !hvBus ? 'error' : undefined,
        },
        {
          key: 'lv_bus',
          label: 'Szyna nN',
          value: lvBus ? `${lvBus.name} — ${lvBus.voltage_kv} kV` : transformer.lv_bus_ref,
          severity: !lvBus ? 'error' : undefined,
        },
        {
          key: 'uhv_kv',
          label: 'Napięcie WN nominalne',
          value: transformer.uhv_kv,
          unit: 'kV',
        },
        {
          key: 'ulv_kv',
          label: 'Napięcie nN nominalne',
          value: transformer.ulv_kv,
          unit: 'kV',
        },
      ],
    };

    const paramSection: CardSection = {
      id: 'params',
      label: 'Parametry',
      fields: [
        {
          key: 'sn_mva',
          label: 'Moc pozorna Sn',
          value: transformer.sn_mva * 1000,
          unit: 'kVA',
          source: transformer.catalog_ref ? 'catalog' : 'instance',
          severity: transformer.sn_mva == null ? 'warning' : undefined,
        },
        {
          key: 'uk_percent',
          label: 'Napięcie zwarcia Uk',
          value: transformer.uk_percent,
          unit: '%',
          source: transformer.catalog_ref ? 'catalog' : 'instance',
          severity: transformer.uk_percent == null ? 'warning' : undefined,
        },
        {
          key: 'pk_kw',
          label: 'Straty w miedzi Pk',
          value: transformer.pk_kw,
          unit: 'kW',
          source: transformer.catalog_ref ? 'catalog' : 'instance',
        },
        {
          key: 'p0_kw',
          label: 'Straty w żelazie P₀',
          value: transformer.p0_kw ?? null,
          unit: 'kW',
          source: transformer.catalog_ref ? 'catalog' : 'instance',
        },
        {
          key: 'i0_percent',
          label: 'Prąd biegu jałowego I₀',
          value: transformer.i0_percent ?? null,
          unit: '%',
          source: transformer.catalog_ref ? 'catalog' : 'instance',
        },
        {
          key: 'vector_group',
          label: 'Grupa połączeń',
          value: transformer.vector_group ?? null,
          severity: transformer.vector_group == null ? 'warning' : undefined,
        },
        {
          key: 'tap_position',
          label: 'Pozycja zaczepu',
          value: transformer.tap_position ?? null,
        },
        ...(transformer.tap_min != null || transformer.tap_max != null
          ? [
              {
                key: 'tap_range',
                label: 'Zakres zaczepów',
                value:
                  transformer.tap_min != null && transformer.tap_max != null
                    ? `${transformer.tap_min} ÷ ${transformer.tap_max}`
                    : '—',
              },
              {
                key: 'tap_step',
                label: 'Krok zaczepu',
                value: transformer.tap_step_percent ?? null,
                unit: '%',
              },
            ]
          : []),
      ],
    };

    const neutralSection: CardSection = {
      id: 'neutral',
      label: 'Uziemienie punktu neutralnego',
      fields: [
        {
          key: 'hv_neutral',
          label: 'Strona WN',
          value: groundingLabel(transformer.hv_neutral?.type),
        },
        {
          key: 'lv_neutral',
          label: 'Strona nN',
          value: groundingLabel(transformer.lv_neutral?.type),
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
          value: transformer.catalog_ref ?? null,
          source: 'catalog',
          severity: transformer.catalog_ref == null ? 'warning' : undefined,
        },
        {
          key: 'param_source',
          label: 'Źródło parametrów',
          value: transformer.parameter_source === 'CATALOG'
            ? 'Katalog (zablokowane)'
            : transformer.parameter_source === 'OVERRIDE'
              ? 'Nadpisanie ręczne'
              : 'Brak katalogu — wymagane',
          severity: transformer.catalog_ref == null ? 'warning' : 'ok',
        },
      ],
    };

    const result: CardSection[] = [identSection, topoSection, paramSection, neutralSection, catalogSection];

    if (activeMode === 'RESULT_VIEW') {
      result.push({
        id: 'analysis',
        label: 'Wyniki analizy',
        fields: [
          { key: 'p_flow', label: 'Przepływ P', value: null, unit: 'MW', source: 'calculated' },
          { key: 'q_flow', label: 'Przepływ Q', value: null, unit: 'Mvar', source: 'calculated' },
          { key: 'i_hv', label: 'Prąd strona WN', value: null, unit: 'A', source: 'calculated' },
          { key: 'i_lv', label: 'Prąd strona nN', value: null, unit: 'A', source: 'calculated' },
          { key: 'loading', label: 'Obciążenie Sn', value: null, unit: '%', source: 'calculated' },
          { key: 'losses', label: 'Straty ΔP', value: null, unit: 'kW', source: 'calculated' },
          { key: 'tap_actual', label: 'Zaczep aktualny', value: null, source: 'calculated' },
          { key: 'no_results', label: 'Status', value: 'Brak wyników — uruchom analizę', severity: 'warning' },
        ],
      });
    }

    return result;
  }, [transformer, hvBus, lvBus, parentStation, activeMode]);

  const handleAssignCatalog = useCallback(() => {
    openOperationForm('assign_catalog_to_element', {
      element_ref: elementId,
      element_type: 'transformer',
    });
  }, [openOperationForm, elementId]);

  const handleEditParams = useCallback(() => {
    openOperationForm('update_element_parameters', {
      element_ref: elementId,
      element_type: 'transformer',
    });
  }, [openOperationForm, elementId]);

  const actions = useMemo((): CardAction[] => [
    {
      id: 'assign_catalog',
      label: 'Przypisz katalog',
      variant: transformer?.catalog_ref ? 'secondary' : 'primary',
      onClick: handleAssignCatalog,
    },
    {
      id: 'edit_params',
      label: 'Edytuj parametry',
      variant: 'secondary',
      onClick: handleEditParams,
    },
  ], [handleAssignCatalog, handleEditParams, transformer?.catalog_ref]);

  if (!transformer) return null;

  const dot = statusDotFromReadiness(elementId, readiness);

  return (
    <TechCard
      elementName={transformer.name}
      elementType="Transformator SN/nN"
      elementId={elementId}
      statusDot={dot}
      sections={sections}
      actions={actions}
      onClose={closeObjectCard}
    />
  );
}
