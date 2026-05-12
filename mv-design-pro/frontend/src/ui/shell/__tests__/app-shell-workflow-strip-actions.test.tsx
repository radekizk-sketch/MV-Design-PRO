import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShellV12 } from '../AppShellV12';

const {
  mockActiveMode,
  mockNavigateToCatalog,
  mockNetworkBuildState,
  mockSelectedElements,
} = vi.hoisted(() => ({
  mockNavigateToCatalog: vi.fn(),
  mockNetworkBuildState: {
    activeSurface: null as null | {
      surfaceId: string;
      openMode: 'replace_right_panel' | 'expand_workspace';
      sizeClass?: 'A' | 'B' | 'C';
    },
  },
  mockActiveMode: { value: 'MODEL_EDIT' as 'MODEL_EDIT' | 'RESULT_VIEW' },
  mockSelectedElements: {
    value: [] as Array<{ id: string; type: string; name: string }>,
  },
}));

vi.mock('../../app-state', () => ({
  useActiveCaseId: () => 'case-1',
  useActiveMode: () => mockActiveMode.value,
  useIssuePanelOpen: () => false,
}));

vi.mock('../../app-state/store', () => ({
  useAppStateStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeArea: 'SCHEMAT_TOPOLOGIA',
      activeWorkMode: 'TE',
      activeCaseName: 'Przypadek testowy',
      activeCaseId: 'case-1',
      activeVariantName: 'Bazowy',
      activeSnapshotId: null,
      activeProjectName: 'Projekt testowy',
      activeCaseResultStatus: 'NONE',
    }),
}));

vi.mock('../../navigation/routes', () => ({
  navigateToCatalog: () => mockNavigateToCatalog(),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      selectedElements: mockSelectedElements.value,
      selectedElement: mockSelectedElements.value[0] ?? null,
    }),
}));

vi.mock('../../network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ activeSurface: mockNetworkBuildState.activeSurface }),
  useNetworkBuildDerived: () => ({
    buildPhase: 'READY',
    buildPhaseLabel: 'Gotowy',
    blockersByCategory: {
      total: 0,
      topologia: 0,
      katalogi: 0,
      eksploatacja: 0,
    },
    isReady: true,
  }),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      snapshot: {
        buses: [],
        branches: [],
        substations: [],
      },
    }),
}));

vi.mock('../../network-build/GlobalSearch', () => ({
  GlobalSearch: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="global-search-modal" /> : null,
}));

vi.mock('../../network-build/CatalogBrowser', () => ({
  CatalogBrowser: () => null,
}));

vi.mock('../../network-build/mass-review', () => ({
  MassReviewPanel: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="mass-review-panel" /> : null,
}));

vi.mock('../../network-build/ProjectMetadataModal', () => ({
  ProjectMetadataModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="project-metadata-modal" /> : null,
}));

vi.mock('../../network-build/SnapshotHistoryModal', () => ({
  SnapshotHistoryModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="snapshot-history-modal" /> : null,
}));

vi.mock('../../network-build/InspectorEngineeringView', () => ({
  InspectorEngineeringView: () => <div data-testid="inspector-engineering-view" />,
}));

vi.mock('../../network-build/SldVisualModes', () => ({
  SldVisualModes: () => <div data-testid="sld-visual-modes" />,
}));

vi.mock('../../history/UndoRedoButtons', () => ({
  UndoRedoButtons: () => null,
}));

vi.mock('../../issue-panel', () => ({
  IssuePanelContainer: () => <div data-testid="issue-panel" />,
}));

vi.mock('../../workspace', () => ({
  WorkspaceSurfaceRouter: () => <div data-testid="workspace-surface" />,
}));

vi.mock('../TopBar', () => ({
  TopBar: () => <div data-testid="top-bar-v12" />,
}));

vi.mock('../NavigationRail', () => ({
  NavigationRail: () => <div data-testid="navigation-rail" />,
}));

vi.mock('../StatusBarV12', () => ({
  StatusBarV12: () => <div data-testid="status-bar-v12" />,
}));

vi.mock('../V12OverlayModeController', () => ({
  V12OverlayModeController: () => null,
}));

vi.mock('../context-panels', () => ({
  AreaContextPanel: () => <div data-testid="area-context-panel" />,
}));

describe('AppShellV12 workflow strip actions', () => {
  beforeEach(() => {
    mockNetworkBuildState.activeSurface = null;
    mockActiveMode.value = 'MODEL_EDIT';
    mockSelectedElements.value = [];
  });

  it('opens search, catalog, mass review, metadata and history from the workflow strip', () => {
    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByText('brak odcinków')).toBeInTheDocument();
    expect(screen.queryByText('0.00 km')).not.toBeInTheDocument();
    expect(screen.getByTestId('workflow-blockers')).toHaveTextContent('Blokery:2');
    expect(screen.getByTestId('wcs-model-readiness')).toHaveTextContent('Gotowość:76%');

    fireEvent.click(screen.getByTestId('wcs-search'));
    expect(screen.getByTestId('global-search-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wcs-catalog'));
    expect(mockNavigateToCatalog).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('wcs-project-metadata'));
    expect(screen.getByTestId('project-metadata-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wcs-history'));
    expect(screen.getByTestId('snapshot-history-modal')).toBeInTheDocument();
  });

  it('ukrywa i pokazuje lewy oraz prawy pasek boczny', () => {
    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByTestId('context-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ukryj lewy pasek boczny' }));
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('context-panel-collapsed-rail')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pokaż lewy pasek boczny' }));
    expect(screen.getByTestId('context-panel')).toBeInTheDocument();

    expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Ukryj prawy pasek boczny' }));
    expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Pokaż prawy pasek boczny' }));
    expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'false');
  });

  it('obsluguje skroty klawiaturowe paneli bez pracy w polach formularza', () => {
    render(
      <AppShellV12>
        <input aria-label="Pole testowe" />
      </AppShellV12>,
    );

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(screen.getByTestId('context-panel-collapsed-rail')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'B', ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'true');

    fireEvent.focus(screen.getByRole('textbox', { name: 'Pole testowe' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Pole testowe' }), { key: 'b', ctrlKey: true });
    expect(screen.getByTestId('context-panel-collapsed-rail')).toBeInTheDocument();
  });

  it('pokazuje prawy panel automatycznie, gdy akcja otwiera formularz operacji', async () => {
    const view = render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ukryj prawy pasek boczny' }));
    expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'true');

    mockNetworkBuildState.activeSurface = {
      surfaceId: 'operation:add_converter_source:station-1',
      openMode: 'replace_right_panel',
      sizeClass: 'B',
    };

    view.rerender(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'false');
    });
  });

  it('po kliknięciu elementu SLD pokazuje inspektor inżynierski także w trybie wyników', () => {
    mockActiveMode.value = 'RESULT_VIEW';
    mockSelectedElements.value = [{ id: 'bay-1#breaker', type: 'Switch', name: 'Wyłącznik pola SN 1' }];

    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByTestId('inspector-engineering-view')).toBeInTheDocument();
  });
});
