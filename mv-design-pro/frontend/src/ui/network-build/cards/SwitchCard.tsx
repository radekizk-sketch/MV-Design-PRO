/**
 * SwitchCard — karta obiektu łącznika / wyłącznika SN.
 *
 * Wyświetla typ aparatu (łącznik, wyłącznik, odłącznik, sprzęgło, bezpiecznik),
 * topologię (szyny od/do), stan łączeniowy i referencję katalogową.
 *
 * W5-C (jedna prawda stanu łącznika): bieżące położenie to `status` gałęzi i zmieniają je
 * WYŁĄCZNIE operacje `open_switch` / `close_switch`; pozycja normalna (punkt normalnie
 * otwarty) to `normal_state` i ustawia ją WYŁĄCZNIE `set_normal_open_point`. Dawna karta
 * czytała punkt podziału z kopii przy magistrali i „przełączała" łącznik korektą
 * parametrów (`toggle_status`), której backend nie zna — zapis był fantomem.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { notify } from '../../notifications/store';
import type { SwitchBranch, FuseBranch } from '../../../types/enm';
import {
  czyLacznikZPozycjaNormalna,
  czyPunktPodzialu,
  etykietaPozycjiNormalnej,
  pozycjaNormalna,
  rolaLacznika,
} from '../../shared/stanLacznika';

// =============================================================================
// Helpers
// =============================================================================

/** Etykieta PL źródła parametru — wyczerpujące wg unii `SwitchBranch['parameter_source']`
 *  (Record wymusza obsłużenie KAŻDEJ wartości; brakująca powodowałaby błąd
 *  kompilacji). FAB-F: `MANUAL_EQUIVALENT` dawniej wpadał w gałąź „else" i
 *  pokazywał mylącą etykietę „Wariant katalogowy wymagany", mimo że
 *  parametr źródła BYŁ ustawiony. */
const PARAMETER_SOURCE_LABELS_PL: Record<NonNullable<SwitchBranch['parameter_source']>, string> = {
  CATALOG: 'Katalog (zablokowane)',
  OVERRIDE: 'Nadpisanie ręczne',
  MANUAL_EQUIVALENT: 'Zastępczy ręczny',
};

function switchTypeLabel(type: string): string {
  switch (type) {
    case 'switch':
      return 'Łącznik SN';
    case 'breaker':
      return 'Wyłącznik SN';
    case 'bus_coupler':
      return 'Sprzęgło szyn SN';
    case 'disconnector':
      return 'Odłącznik SN';
    case 'fuse':
      return 'Bezpiecznik SN';
    default:
      return type;
  }
}

function switchTypeShort(type: string): string {
  switch (type) {
    case 'switch':
      return 'Łącznik';
    case 'breaker':
      return 'Wyłącznik';
    case 'bus_coupler':
      return 'Sprzęgło';
    case 'disconnector':
      return 'Odłącznik';
    case 'fuse':
      return 'Bezpiecznik';
    default:
      return type;
  }
}

function statusLabel(status: string): string {
  return status === 'closed' ? 'Zamknięty (przewodzi)' : 'Otwarty (wyłączony)';
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

export function SwitchCard({ elementId }: { elementId: string }) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const closeObjectCard = useNetworkBuildStore((s) => s.closeObjectCard);
  const activeMode = useAppStateStore((s) => s.activeMode);

  const branch = useMemo(() => {
    const found = snapshot?.branches?.find((b) => b.ref_id === elementId);
    if (!found) return null;
    const allowedTypes = ['switch', 'breaker', 'bus_coupler', 'disconnector', 'fuse'];
    if (!allowedTypes.includes(found.type)) return null;
    return found as SwitchBranch | FuseBranch;
  }, [snapshot, elementId]);

  const fromBus = useMemo(
    () => snapshot?.buses?.find((b) => b.ref_id === branch?.from_bus_ref),
    [snapshot, branch],
  );

  const toBus = useMemo(
    () => snapshot?.buses?.find((b) => b.ref_id === branch?.to_bus_ref),
    [snapshot, branch],
  );

  const isNop = czyPunktPodzialu(snapshot, branch);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  // Find bay containing this switch via equipment_refs
  const parentBay = useMemo(
    () =>
      snapshot?.bays?.find((bay) => bay.equipment_refs?.includes(elementId)),
    [snapshot, elementId],
  );

  const parentStation = useMemo(
    () =>
      parentBay
        ? snapshot?.substations?.find((s) => s.id === parentBay.substation_ref)
        : null,
    [snapshot, parentBay],
  );

  const sections = useMemo((): CardSection[] => {
    if (!branch) return [];

    const identSection: CardSection = {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'name', label: 'Nazwa', value: branch.name },
        {
          key: 'type',
          label: 'Typ aparatu',
          value: switchTypeShort(branch.type),
        },
        ...(parentBay
          ? [{ key: 'bay', label: 'Pole SN', value: parentBay.name }]
          : []),
        ...(parentStation
          ? [{ key: 'station', label: 'Stacja', value: parentStation.name }]
          : []),
      ],
    };

    const topoSection: CardSection = {
      id: 'topology',
      label: 'Topologia',
      fields: [
        {
          key: 'from_bus',
          label: 'Szyna — od',
          value: fromBus ? `${fromBus.name} (${fromBus.voltage_kv} kV)` : branch.from_bus_ref,
          severity: !fromBus ? 'error' : undefined,
        },
        {
          key: 'to_bus',
          label: 'Szyna — do',
          value: toBus ? `${toBus.name} (${toBus.voltage_kv} kV)` : branch.to_bus_ref,
          severity: !toBus ? 'error' : undefined,
        },
        ...((branch.type === 'switch' || branch.type === 'breaker' ||
          branch.type === 'bus_coupler' || branch.type === 'disconnector') &&
        (branch as SwitchBranch).r_ohm != null
          ? [
              {
                key: 'r_ohm',
                label: 'R stanu zamkniętego',
                value: (branch as SwitchBranch).r_ohm ?? null,
                unit: 'Ω',
                source: 'catalog' as const,
              },
              {
                key: 'x_ohm',
                label: 'X stanu zamkniętego',
                value: (branch as SwitchBranch).x_ohm ?? null,
                unit: 'Ω',
                source: 'catalog' as const,
              },
            ]
          : []),
        ...(branch.type === 'fuse'
          ? [
              {
                key: 'rated_current',
                label: 'Prąd znamionowy',
                value: (branch as FuseBranch).rated_current_a ?? null,
                unit: 'A',
                source: 'catalog' as const,
                severity: (branch as FuseBranch).rated_current_a == null
                  ? ('warning' as const)
                  : undefined,
              },
              {
                key: 'rated_voltage',
                label: 'Napięcie znamionowe',
                value: (branch as FuseBranch).rated_voltage_kv ?? null,
                unit: 'kV',
                source: 'catalog' as const,
              },
            ]
          : []),
      ],
    };

    const stateSection: CardSection = {
      id: 'state',
      label: 'Stan eksploatacyjny',
      fields: [
        {
          key: 'status',
          label: 'Bieżące położenie',
          value: statusLabel(branch.status),
          severity: statusSeverity(branch.status),
        },
        ...(czyLacznikZPozycjaNormalna(branch)
          ? [
              {
                key: 'normal_state',
                label: 'Pozycja normalna',
                value: etykietaPozycjiNormalnej(pozycjaNormalna(branch), rolaLacznika(snapshot, branch)),
                severity: isNop ? ('warning' as const) : ('ok' as const),
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
          value: branch.parameter_source
            ? PARAMETER_SOURCE_LABELS_PL[branch.parameter_source]
            : 'Wariant katalogowy wymagany',
          severity: branch.catalog_ref == null ? 'warning' : 'ok',
        },
      ],
    };

    const result: CardSection[] = [identSection, topoSection, stateSection, catalogSection];

    if (activeMode === 'RESULT_VIEW') {
      result.push({
        id: 'analysis',
        label: 'Wyniki analizy',
        fields: [
          { key: 'i_through', label: 'Prąd przepływający I', value: null, unit: 'A', source: 'calculated' },
          { key: 'ik3_through', label: 'Prąd zwarciowy Ik₃', value: null, unit: 'kA', source: 'calculated' },
          { key: 'breaking_capacity', label: 'Zdolność wyłączalna', value: null, unit: '%', source: 'calculated' },
          { key: 'no_results', label: 'Status', value: 'Uruchom analizę, aby pokazać wyniki', severity: 'warning' },
        ],
      });
    }

    return result;
  }, [branch, fromBus, toBus, isNop, parentBay, parentStation, activeMode]);

  const handleToggleState = useCallback(() => {
    if (!branch) return;
    if (!activeCaseId) {
      notify('Nie wybrano aktywnego zakresu obliczeń. Wybierz zakres przed zmianą modelu.', 'warning');
      return;
    }
    const operacja = branch.status === 'closed' ? 'open_switch' : 'close_switch';
    void executeDomainOperation(activeCaseId, operacja, { switch_ref: elementId }).then((odpowiedz) => {
      // Sukces potwierdza centralny komunikat magazynu (`operationSuccessMessages`); tu
      // wyłącznie odmowa — karta łącznika nie ma własnego miejsca na błąd operacji.
      if (!odpowiedz || odpowiedz.error) {
        notify(odpowiedz?.error ?? useSnapshotStore.getState().error ?? 'Nie zmieniono stanu łącznika.', 'error');
      }
    });
  }, [activeCaseId, branch, elementId, executeDomainOperation]);

  const handleAssignCatalog = useCallback(() => {
    openOperationForm('assign_catalog_to_element', {
      element_ref: elementId,
      element_type: 'switch',
    });
  }, [openOperationForm, elementId]);

  const handleSetNop = useCallback(() => {
    openOperationForm('set_normal_open_point', { switch_ref: elementId });
  }, [openOperationForm, elementId]);

  const actions = useMemo((): CardAction[] => {
    const acts: CardAction[] = [
      {
        id: 'toggle_state',
        label: branch?.status === 'closed' ? 'Otwórz łącznik' : 'Zamknij łącznik',
        variant: 'primary',
        onClick: handleToggleState,
      },
      {
        id: 'assign_catalog',
        label: 'Przypisz katalog',
        variant: 'secondary',
        onClick: handleAssignCatalog,
      },
    ];

    // Punkt normalnie otwarty: łącznik z pozycją normalną (bez bezpiecznika), który nim
    // jeszcze nie jest. Przeniesienie punktu = wskazanie innego łącznika pierścienia
    // (operacja zamyka poprzedni punkt) — osobnego „zdjęcia" punktu backend nie ma.
    if (czyLacznikZPozycjaNormalna(branch) && !isNop) {
      acts.push({
        id: 'set_normal_open_point',
        label: 'Ustaw jako punkt normalnie otwarty',
        variant: 'secondary',
        onClick: handleSetNop,
      });
    }

    return acts;
  }, [branch, handleToggleState, handleAssignCatalog, handleSetNop, isNop]);

  if (!branch) return null;

  const dot = statusDotFromReadiness(elementId, readiness);

  return (
    <ObjectCard
      elementName={branch.name}
      elementType={switchTypeLabel(branch.type)}
      elementId={elementId}
      statusDot={dot}
      sections={sections}
      actions={actions}
      onClose={closeObjectCard}
    />
  );
}
