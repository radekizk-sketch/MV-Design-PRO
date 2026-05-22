import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ReadinessBar } from '../ReadinessBar';
import { useAppStateStore } from '../../app-state';
import {
  selectActiveOperationForm,
  useNetworkBuildStore,
} from '../networkBuildStore';
import { useReadinessLiveStore } from '../../engineering-readiness/readinessLiveStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNotificationStore } from '../../notifications/store';
import { useSelectionStore } from '../../selection/store';

describe('ReadinessBar', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useNetworkBuildStore.getState().reset();
    useReadinessLiveStore.getState().clear();
    useNotificationStore.getState().clearAll();
    useSelectionStore.getState().clearSelection();
    useSnapshotStore.setState({
      snapshot: null,
      logicalViews: null,
      readiness: null,
      fixActions: [],
    } as never);
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'FRESH');
  });

  it('pokazuje zwinięty stan dopuszczony do analizy', () => {
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'src-1' }],
        substations: [
          {
            id: 'st-1',
            ref_id: 'st-1',
            name: 'ST-1',
            station_type: 'PRZELOTOWA',
            transformer_refs: [],
            bus_refs: [],
          },
        ],
        transformers: [],
        generators: [],
        buses: [{ ref_id: 'bus-1' }],
        branches: [{ ref_id: 'seg-1', type: 'cable', length_km: 0.5 }],
      } as never,
      logicalViews: {
        trunks: [{ id: 'trunk-1', segments: [{ segment_ref: 'seg-1' }] }],
        terminals: [],
        branches: [],
      } as never,
    });
    useReadinessLiveStore.setState({
      issues: [],
      status: 'OK',
      ready: true,
      bySeverity: { BLOCKER: 0, IMPORTANT: 0, INFO: 0 },
      loading: false,
      error: null,
      lastRevision: 1,
    });

    render(<ReadinessBar />);

    expect(screen.getByTestId('readiness-bar')).toHaveAttribute('data-ready', 'true');
    expect(screen.getByText('Układ dopuszczony do analizy')).toBeInTheDocument();
    expect(screen.getByText('Bez uwag projektowych')).toBeInTheDocument();
  });

  it('pokazuje pozycje kontroli i filtry kategorii', () => {
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'src-1' }],
        substations: [],
        transformers: [],
        generators: [],
        buses: [{ ref_id: 'bus-1' }],
        branches: [{ ref_id: 'seg-1', type: 'cable' }],
      } as never,
      logicalViews: {
        trunks: [{ id: 'trunk-1' }],
        terminals: [],
        branches: [],
      } as never,
    });
    useReadinessLiveStore.setState({
      issues: [
        {
          code: 'TOPOLOGY_ISLAND',
          severity: 'BLOCKER',
          message_pl: 'Wykryto wyspę topologiczną.',
          element_ref: 'bus-1',
          element_refs: [],
          fix_action: null,
        },
        {
          code: 'ELIG_SC3_MISSING_CATALOG_REF',
          severity: 'BLOCKER',
          message_pl: 'Brak katalogu aparatu.',
          element_ref: 'seg-1',
          element_refs: [],
          fix_action: null,
        },
        {
          code: 'WARN_PROFILE_MISSING',
          severity: 'INFO',
          message_pl: 'Brak profilu czasowego.',
          element_ref: null,
          element_refs: [],
          fix_action: null,
        },
      ] as never,
      status: 'FAIL',
      ready: false,
      bySeverity: { BLOCKER: 2, IMPORTANT: 0, INFO: 1 },
      loading: false,
      error: null,
      lastRevision: 1,
    });

    render(<ReadinessBar />);

    expect(screen.getByTestId('readiness-bar')).toHaveAttribute('data-ready', 'false');
    expect(screen.getByText('2 pozycji kontroli')).toBeInTheDocument();
    expect(screen.getByText('1 uwag technicznych')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wszystkie (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Topologia (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Katalogi (1)' })).toBeInTheDocument();
  });

  it('kliknięcie komunikatu kontroli nawiguje do elementu', () => {
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'src-1' }],
        substations: [],
        transformers: [],
        generators: [],
        buses: [{ ref_id: 'bus-1' }],
        branches: [],
      } as never,
      logicalViews: {
        trunks: [],
        terminals: [],
        branches: [],
      } as never,
    });
    useReadinessLiveStore.setState({
      issues: [
        {
          code: 'TOPOLOGY_ISLAND',
          severity: 'BLOCKER',
          message_pl: 'Wykryto wyspę topologiczną.',
          element_ref: 'bus-1',
          element_refs: [],
          fix_action: null,
        },
      ] as never,
      status: 'FAIL',
      ready: false,
      bySeverity: { BLOCKER: 1, IMPORTANT: 0, INFO: 0 },
      loading: false,
      error: null,
      lastRevision: 1,
    });

    render(<ReadinessBar />);

    fireEvent.click(screen.getByText('Wykryto wyspę topologiczną.'));

    expect(useSelectionStore.getState().selectedElement).toMatchObject({
      id: 'bus-1',
      type: 'Bus',
      name: 'bus-1',
    });
  });

  it('uruchamia kanoniczną operację naprawczą dla fallbacku bez modal_type', () => {
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'src-1' }],
        substations: [],
        transformers: [],
        generators: [],
        buses: [{ ref_id: 'bus-1' }],
        branches: [{ ref_id: 'seg-1', type: 'cable' }],
      } as never,
      logicalViews: {
        trunks: [{ id: 'trunk-1' }],
        terminals: [],
        branches: [],
      } as never,
      fixActions: [
        {
          code: 'ELIG_LF_NO_LOADS_OR_GENERATORS',
          action_type: 'ADD_MISSING_DEVICE',
          element_ref: null,
          modal_type: null,
          panel: null,
          step: null,
          focus: null,
          message_pl: 'Dodaj źródło lub odbiornik.',
        },
      ],
    } as never);
    useReadinessLiveStore.setState({
      issues: [
        {
          code: 'ELIG_LF_NO_LOADS_OR_GENERATORS',
          severity: 'BLOCKER',
          message_pl: 'Brak odbiorów i generatorów w modelu.',
          element_ref: null,
          element_refs: [],
          fix_action: null,
        },
      ] as never,
      status: 'FAIL',
      ready: false,
      bySeverity: { BLOCKER: 1, IMPORTANT: 0, INFO: 0 },
      loading: false,
      error: null,
      lastRevision: 1,
    });

    render(<ReadinessBar />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Rozwiń kontrolę układu' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Konfiguruj' }));

    expect(selectActiveOperationForm(useNetworkBuildStore.getState())).toEqual({
      op: 'add_converter_source',
      context: {},
    });
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('pokazuje ostrzeżenie, gdy nie ma kanonicznej operacji konfiguracyjnej', () => {
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'src-1' }],
        substations: [],
        transformers: [],
        generators: [],
        buses: [{ ref_id: 'bus-1' }],
        branches: [],
      } as never,
      logicalViews: {
        trunks: [],
        terminals: [],
        branches: [],
      } as never,
      fixActions: [
        {
          code: 'UNKNOWN_READINESS_CODE',
          action_type: 'ADD_MISSING_DEVICE',
          element_ref: 'bus-1',
          modal_type: null,
          panel: null,
          step: null,
          focus: null,
          message_pl: 'Skonfiguruj pozycję kontroli bez mapowania.',
        },
      ],
    } as never);
    useReadinessLiveStore.setState({
      issues: [
        {
          code: 'UNKNOWN_READINESS_CODE',
          severity: 'BLOCKER',
          message_pl: 'Nieznany brak bez mapowania.',
          element_ref: 'bus-1',
          element_refs: [],
          fix_action: null,
        },
      ] as never,
      status: 'FAIL',
      ready: false,
      bySeverity: { BLOCKER: 1, IMPORTANT: 0, INFO: 0 },
      loading: false,
      error: null,
      lastRevision: 1,
    });

    render(<ReadinessBar />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Rozwiń kontrolę układu' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Konfiguruj' }));

    expect(selectActiveOperationForm(useNetworkBuildStore.getState())).toBeNull();
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0]?.message).toContain(
      'Nie przypisano karty konfiguracyjnej do pozycji kontroli UNKNOWN_READINESS_CODE.',
    );
  });
});
