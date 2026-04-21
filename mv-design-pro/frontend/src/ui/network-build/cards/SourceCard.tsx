/**
 * SourceCard — karta obiektu źródła zasilania GPZ.
 *
 * Wyświetla parametry sieciowe źródła zewnętrznego (model Thevénina / moc zwarciowa),
 * szyny zasilającej oraz referencję katalogową.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { canonicalRoleLabel } from '../../field/fieldLabels';
import { useFieldReadModel } from '../../field/useFieldReadModel';

// =============================================================================
// Helpers
// =============================================================================

function modelLabel(model: string): string {
  switch (model) {
    case 'thevenin':
      return 'Model Thevénina';
    case 'short_circuit_power':
      return 'Moc zwarciowa';
    case 'external_grid':
      return 'Sieć zewnętrzna';
    default:
      return model;
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

function resolveGpzFieldBusName(
  station: { gpz_sections?: Array<{ section_id: string; bus_ref: string }> | null } | null,
  snapshot: {
    buses?: Array<{ ref_id: string; id?: string; name?: string | null }> | null;
  } | null,
  gpzSectionId: string | null | undefined,
): string {
  if (!gpzSectionId) {
    return 'Brak szyny';
  }

  const busRef = station?.gpz_sections?.find((section) => section.section_id === gpzSectionId)?.bus_ref ?? null;
  if (!busRef) {
    return 'Brak szyny';
  }

  return snapshot?.buses?.find((item) => item.ref_id === busRef || item.id === busRef)?.name ?? busRef;
}

// =============================================================================
// Component
// =============================================================================

export function SourceCard({ elementId }: { elementId: string }) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const openObjectCard = useNetworkBuildStore((s) => s.openObjectCard);
  const closeObjectCard = useNetworkBuildStore((s) => s.closeObjectCard);
  const activeMode = useAppStateStore((s) => s.activeMode);
  const fieldReadModel = useFieldReadModel();

  const source = useMemo(
    () => snapshot?.sources?.find((src) => src.ref_id === elementId),
    [snapshot, elementId],
  );

  const bus = useMemo(
    () => snapshot?.buses?.find((b) => b.ref_id === source?.bus_ref),
    [snapshot, source],
  );
  const stationRef = source?.substation_ref ?? null;
  const parentStation = useMemo(
    () => snapshot?.substations?.find((station) => station.ref_id === stationRef) ?? null,
    [snapshot, stationRef],
  );

  const gpzFields = useMemo(() => {
    if (!source || !snapshot) return [];

    if (!stationRef) return [];

    return fieldReadModel.data.fields
      .filter((item) => item.canonical_model.base_model.substation_ref === stationRef)
      .map((item) => ({
        ref_id: item.bay_ref,
        name: item.bay_name,
        role_label: canonicalRoleLabel(item.canonical_model.base_model.bay_role),
        bus_name: resolveGpzFieldBusName(
          parentStation,
          snapshot,
          item.canonical_model.base_model.gpz_section_id,
        ),
        gpz_section_id: item.canonical_model.base_model.gpz_section_id,
      }))
      .sort((left, right) => {
      const leftMatchesSection = left.gpz_section_id === source.gpz_section_id;
      const rightMatchesSection = right.gpz_section_id === source.gpz_section_id;
      if (leftMatchesSection !== rightMatchesSection) {
        return leftMatchesSection ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  }, [fieldReadModel.data.fields, parentStation, snapshot, source, stationRef]);

  const sections = useMemo((): CardSection[] => {
    if (!source) return [];

    const identSection: CardSection = {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'name', label: 'Nazwa', value: source.name },
        { key: 'ref_id', label: 'ID elementu', value: source.ref_id },
        { key: 'model', label: 'Model', value: modelLabel(source.model) },
      ],
    };

    const paramSection: CardSection = {
      id: 'params',
      label: 'Parametry sieci',
      fields: [
        {
          key: 'sk3',
          label: 'Sk₃',
          value: source.sk3_mva ?? null,
          unit: 'MVA',
          source: 'instance',
          severity: source.sk3_mva == null ? 'warning' : undefined,
        },
        {
          key: 'rx_ratio',
          label: 'R/X',
          value: source.rx_ratio ?? null,
          source: 'instance',
          severity: source.rx_ratio == null ? 'warning' : undefined,
        },
        {
          key: 'r_ohm',
          label: 'R',
          value: source.r_ohm ?? null,
          unit: 'Ω',
          source: source.rx_ratio != null ? 'calculated' : 'instance',
        },
        {
          key: 'x_ohm',
          label: 'X',
          value: source.x_ohm ?? null,
          unit: 'Ω',
          source: source.rx_ratio != null ? 'calculated' : 'instance',
        },
        {
          key: 'ik3',
          label: 'Ik₃',
          value: source.ik3_ka ?? null,
          unit: 'kA',
          source: 'calculated',
        },
        {
          key: 'c_max',
          label: 'c_max',
          value: source.c_max ?? null,
          source: 'instance',
        },
        {
          key: 'c_min',
          label: 'c_min',
          value: source.c_min ?? null,
          source: 'instance',
        },
      ],
    };

    const busSection: CardSection = {
      id: 'bus',
      label: 'Szyna zasilania',
      fields: [
        {
          key: 'bus_ref',
          label: 'ID szyny',
          value: source.bus_ref,
        },
        {
          key: 'bus_name',
          label: 'Nazwa szyny',
          value: bus?.name ?? '—',
        },
        {
          key: 'bus_voltage',
          label: 'Napięcie nominalne',
          value: bus?.voltage_kv ?? null,
          unit: 'kV',
        },
        {
          key: 'bus_grounding',
          label: 'Uziemienie',
          value: bus?.grounding?.type ?? null,
        },
      ],
    };

    const fieldSection: CardSection = {
      id: 'gpz_fields',
      label: 'Pola GPZ',
      fields:
        gpzFields.length > 0
          ? gpzFields.map((field) => ({
              key: `field_${field.ref_id}`,
              label: field.name,
              value: `${field.role_label} / ${field.bus_name}`,
            }))
          : [
              {
                key: 'no_gpz_fields',
                label: 'Stan pol GPZ',
                value: fieldReadModel.isLoading
                  ? 'Ladowanie read-modelu pola...'
                  : 'Brak aktywnego pola GPZ w kanonicznym modelu',
                severity: 'warning' as const,
              },
            ],
    };

    const catalogSection: CardSection = {
      id: 'catalog',
      label: 'Katalog',
      fields: [
        {
          key: 'no_catalog',
          label: 'Typ katalogowy',
          value: 'Brak — źródło GPZ definiuje parametry bezpośrednio',
        },
      ],
    };

    const result: CardSection[] = [identSection, paramSection, busSection, fieldSection, catalogSection];

    if (activeMode === 'RESULT_VIEW') {
      result.push({
        id: 'analysis',
        label: 'Wyniki analizy',
        fields: [
          { key: 'p_gen', label: 'Moc czynna P', value: null, unit: 'MW', source: 'calculated' },
          { key: 'q_gen', label: 'Moc bierna Q', value: null, unit: 'Mvar', source: 'calculated' },
          { key: 'i_source', label: 'Prąd zasilania I', value: null, unit: 'A', source: 'calculated' },
          { key: 'ik3_contribution', label: 'Wkład Ik₃', value: null, unit: 'kA', source: 'calculated' },
          { key: 'no_results', label: 'Status', value: 'Brak wyników — uruchom analizę', severity: 'warning' },
        ],
      });
    }

    return result;
  }, [activeMode, bus, fieldReadModel.isLoading, gpzFields, source]);

  const handleEditParams = useCallback(() => {
    openOperationForm('update_element_parameters', { element_ref: elementId, element_type: 'source' });
  }, [openOperationForm, elementId]);

  const openGpzField = useCallback((fieldRef: string) => {
    openObjectCard({ kind: 'bay', elementId: fieldRef });
  }, [openObjectCard]);

  const actions = useMemo((): CardAction[] => {
    const fieldActions: CardAction[] = gpzFields.map((field, index) => ({
      id: `open_field_${field.ref_id}`,
      label: gpzFields.length === 1 ? 'Otworz pole GPZ' : `Otworz ${field.name}`,
      variant: index === 0 ? 'primary' : 'secondary',
      onClick: () => openGpzField(field.ref_id),
    }));

    return [
      ...fieldActions,
      {
        id: 'edit_params',
        label: 'Edytuj parametry',
        variant: fieldActions.length === 0 ? 'primary' : 'secondary',
        onClick: handleEditParams,
      },
    ];
  }, [gpzFields, handleEditParams, openGpzField]);

  if (!source) return null;

  const dot = statusDotFromReadiness(elementId, readiness);

  return (
    <ObjectCard
      elementName={source.name}
      elementType="Źródło zasilania GPZ"
      elementId={elementId}
      statusDot={dot}
      sections={sections}
      actions={actions}
      onClose={closeObjectCard}
    />
  );
}
