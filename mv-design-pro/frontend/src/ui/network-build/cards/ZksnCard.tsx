/**
 * ZksnCard — karta złączki kablowej rozgałęźnej SN (ZKSN).
 *
 * ZKSN jest odrębną klasą obiektu (ZksnMV), osadzaną wyłącznie na kablu SN.
 * NIE jest stacją. Może mieć 1 lub 2 porty BRANCH.
 *
 * Wyświetla:
 * A. Identyfikację i rolę w sieci
 * B. Topologię: MAIN_IN / MAIN_OUT / BRANCH_1..N + stan zajętości portów
 * C. Stan łączników portów (z gałęzi łączników — W5-C, jedna prawda stanu)
 * D. Parametry katalogowe
 * E. Gotowość i status kompletności
 * F. Dostępne akcje inżynierskie (Dodaj odgałęzienie z każdego wolnego portu)
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useCallback } from 'react';
import { ObjectCard, type CardSection, type CardAction } from './ObjectCard';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { notify } from '../../notifications/store';
import {
  resolveBranchPointBranchPortId,
  resolveBranchPointBranchPortOccupancy,
} from '../operationContextResolvers';
import type { BranchPointSN } from '../../../types/enm';
import {
  isRawTechnicalIdentifier,
  publicTechnicalLabel,
} from '../../shared/publicTechnicalLabels';
import { lacznikiPortowPunktu, opisStanuLacznika } from '../../shared/stanLacznika';

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
      return 'Kompletny';
    case 'NIEKOMPLETNY':
      return 'Niekompletny';
    case 'BRAK_KATALOGU':
      return 'Powiązanie katalogowe do konfiguracji';
    default:
      return '—';
  }
}

function completenessStatus(status: string | null | undefined): 'ok' | 'warning' | 'error' {
  if (status === 'KOMPLETNY') return 'ok';
  if (status === 'NIEKOMPLETNY') return 'warning';
  return 'error';
}

function branchPortDisplayLabel(index: number): string {
  return `ODG ${index + 1}`;
}

// =============================================================================
// ZksnCard
// =============================================================================

interface ZksnCardProps {
  elementId: string;
  onClose: () => void;
}

export function ZksnCard({ elementId, onClose }: ZksnCardProps) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const branchPoint: BranchPointSN | undefined = useMemo(
    () => snapshot?.branch_points?.find((bp) => bp.ref_id === elementId),
    [snapshot, elementId],
  );

  // W5-C: łączniki portów punktu — stan czytany z ICH gałęzi (położenie + pozycja normalna).
  const lacznikiPortow = useMemo(
    () => (branchPoint ? lacznikiPortowPunktu(snapshot, branchPoint.ref_id) : []),
    [branchPoint, snapshot],
  );

  const statusDot = useMemo(
    () => completenessStatus(branchPoint?.completeness_status),
    [branchPoint],
  );

  const branchPorts: Array<{ portId: string; busRef: string; occupied: boolean; displayLabel: string }> = useMemo(() => {
    if (!branchPoint?.ports?.BRANCH) return [];
    return branchPoint.ports.BRANCH.map((busRef: string, idx: number) => {
      const portId = resolveBranchPointBranchPortId(branchPoint.ports.BRANCH.length, idx);
      return {
        portId,
        busRef,
        occupied: Boolean(resolveBranchPointBranchPortOccupancy(branchPoint, idx)),
        displayLabel: branchPortDisplayLabel(idx),
      };
    });
  }, [branchPoint]);

  const sections: CardSection[] = useMemo(() => {
    if (!branchPoint) return [];

    const portFields = branchPorts.map((port) => ({
      key: port.portId,
      label: `Port odgałęzienia ${port.displayLabel}`,
      value: port.occupied
        ? 'Zajęty (przyłączone odgałęzienie SN)'
        : 'Wolny — gotowy do wyprowadzenia odgałęzienia',
    }));

    // W5-C: stan łącznika portu czytany z JEGO gałęzi (położenie + pozycja normalna);
    // punkt bez łączników portów mówi to wprost, bez domyślnego „zamknięty".
    const portSwitchFields = lacznikiPortow.length > 0
      ? lacznikiPortow.map((lacznik) => ({
          key: `switch_${lacznik.ref_id}`,
          label: `Stan łącznika — ${lacznik.name}`,
          value: opisStanuLacznika(lacznik),
        }))
      : [{ key: 'switch_none', label: 'Stan łącznika', value: 'Brak łączników portów w modelu' }];

    const publicName = publicTechnicalLabel(branchPoint.name, 'ZKSN');
    const parentSegmentLabel = isRawTechnicalIdentifier(branchPoint.parent_segment_id)
      ? 'Magistrala SN'
      : (branchPoint.parent_segment_id ?? 'Magistrala SN');

    const result: CardSection[] = [
      {
        id: 'ident',
        label: 'Identyfikacja',
        fields: [
          { key: 'name', label: 'Nazwa', value: publicName },
          { key: 'type', label: 'Typ obiektu', value: 'ZKSN (złączka kablowa SN)' },
          { key: 'parent_segment', label: 'Odcinek nadrzędny', value: parentSegmentLabel },
        ],
      },
      {
        id: 'topology',
        label: 'Topologia',
        fields: [
          {
            key: 'main_in',
            label: 'Wejście magistrali (MAIN_IN)',
            value: branchPoint.ports?.MAIN_IN ? 'Podłączone' : '—',
          },
          {
            key: 'main_out',
            label: 'Wyjście magistrali (MAIN_OUT)',
            value: branchPoint.ports?.MAIN_OUT ? 'Podłączone' : '—',
          },
          ...portFields,
          ...portSwitchFields,
        ],
      },
      {
        id: 'catalog',
        label: 'Katalog',
        fields: [
          {
            key: 'catalog_ref',
            label: 'Pozycja katalogowa',
            value: branchPoint.catalog_ref ?? '—',
          },
          {
            key: 'source_mode',
            label: 'Tryb źródła',
            value: sourceModeLabel(branchPoint.source_mode),
          },
          {
            key: 'completeness',
            label: 'Kompletność',
            value: completenessLabel(branchPoint.completeness_status),
          },
        ],
      },
    ];

    return result;
  }, [branchPoint, branchPorts, lacznikiPortow]);

  const handleAddBranchFromPort = useCallback(
    (portId: string) => {
      if (!branchPoint) return;
      openOperationForm('start_branch_segment_sn', {
        from_ref: `${branchPoint.ref_id}.${portId}`,
      });
    },
    [branchPoint, openOperationForm],
  );

  // Dobór z katalogu otwiera kreator przypisania (jak karty transformatora i łącznika).
  // Dawne wywołanie wysyłało `element_id` bez wskazania pozycji katalogu — operacja czyta
  // `element_ref` i wiązanie, więc przycisk zawsze kończył się odmową.
  const handleAssignCatalog = useCallback(() => {
    if (!branchPoint) return;
    openOperationForm('assign_catalog_to_element', {
      element_ref: branchPoint.ref_id,
      element_type: 'branch_point',
    });
  }, [branchPoint, openOperationForm]);

  // W5-C: dawna akcja „Ustaw stan łącznika" otwierała edycję parametrów PUNKTU (bez pola
  // stanu — fantom). Stan żyje na gałęzi łącznika portu; zmienia go `open_switch` /
  // `close_switch` na tej gałęzi (sukces: centralny komunikat magazynu, odmowa: tu).
  // `lacznikiPortow` — wyżej, obok punktu.
  const handleToggleSwitch = useCallback(
    (switchRef: string, operacja: 'open_switch' | 'close_switch') => {
      if (!activeCaseId) {
        notify('Nie wybrano aktywnego zakresu obliczeń. Wybierz zakres przed zmianą modelu.', 'warning');
        return;
      }
      void executeDomainOperation(activeCaseId, operacja, { switch_ref: switchRef }).then((odpowiedz) => {
        if (!odpowiedz || odpowiedz.error) {
          notify(odpowiedz?.error ?? useSnapshotStore.getState().error ?? 'Nie zmieniono stanu łącznika.', 'error');
        }
      });
    },
    [activeCaseId, executeDomainOperation],
  );

  const handleEditZksn = useCallback(() => {
    if (!branchPoint) return;
    openOperationForm('update_element_parameters', {
      element_ref: branchPoint.ref_id,
      element_type: 'branch_point',
    });
  }, [branchPoint, openOperationForm]);

  const actions: CardAction[] = useMemo(() => {
    if (!branchPoint) return [];

    const acts: CardAction[] = [
      {
        id: 'edit_zksn',
        label: 'Edytuj ZKSN',
        variant: 'secondary',
        onClick: handleEditZksn,
      },
    ];

    // Add branch action for each free port
    branchPorts.forEach((port) => {
      acts.push({
        id: `add_branch_${port.portId}`,
        label: `Dodaj odgałęzienie z ${port.displayLabel}`,
        variant: 'primary',
        onClick: () => handleAddBranchFromPort(port.portId),
        disabled: port.occupied,
      });
    });

    lacznikiPortow.forEach((lacznik) => {
      const operacja = lacznik.status === 'closed' ? 'open_switch' : 'close_switch';
      acts.push({
        id: `switch_${lacznik.ref_id}`,
        label: `${operacja === 'open_switch' ? 'Otwórz' : 'Zamknij'} łącznik ${lacznik.name}`,
        variant: 'secondary',
        onClick: () => handleToggleSwitch(lacznik.ref_id, operacja),
      });
    });

    acts.push({
      id: 'assign_catalog',
      label: 'Dobierz z katalogu',
      variant: 'secondary',
      onClick: handleAssignCatalog,
    });

    return acts;
  }, [branchPoint, branchPorts, handleAddBranchFromPort, handleAssignCatalog, handleEditZksn, handleToggleSwitch, lacznikiPortow]);

  if (!branchPoint) {
    return (
      <div className="p-4 text-xs text-gray-500">
        Nie znaleziono obiektu ZKSN o tym oznaczeniu.
      </div>
    );
  }

  const headerName = publicTechnicalLabel(branchPoint.name, 'ZKSN');
  return (
    <ObjectCard
      elementName={headerName}
      elementType="ZKSN (złączka kablowa SN)"
      elementId={elementId}
      statusDot={statusDot}
      sections={sections}
      actions={actions}
      onClose={onClose}
    />
  );
}
