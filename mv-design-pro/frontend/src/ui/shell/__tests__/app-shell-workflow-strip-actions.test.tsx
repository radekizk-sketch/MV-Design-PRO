import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppShellV12 } from '../AppShellV12';

const { mockNavigateToCatalog } = vi.hoisted(() => ({
  mockNavigateToCatalog: vi.fn(),
}));

vi.mock('../../app-state', () => ({
  useActiveCaseId: () => 'case-1',
  useActiveMode: () => 'MODEL_EDIT',
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
      selectedElements: [],
      selectedElement: null,
    }),
}));

vi.mock('../../network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ activeSurface: null }),
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
  it('opens search, catalog, mass review, metadata and history from the workflow strip', () => {
    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    fireEvent.click(screen.getByTestId('wcs-search'));
    expect(screen.getByTestId('global-search-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wcs-catalog'));
    expect(mockNavigateToCatalog).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('wcs-project-metadata'));
    expect(screen.getByTestId('project-metadata-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wcs-history'));
    expect(screen.getByTestId('snapshot-history-modal')).toBeInTheDocument();
  });
});
