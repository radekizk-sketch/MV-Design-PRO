import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CanonicalLayout } from '../CanonicalLayout';

const activeSurfaceState = {
  activeSurface: null,
};

vi.mock('../../main-menu', () => ({
  MainMenuBar: () => <div data-testid="main-menu-bar">menu</div>,
}));

vi.mock('../../active-case-bar', () => ({
  ActiveCaseBar: () => <div data-testid="active-case-bar">case bar</div>,
}));

vi.mock('../../issue-panel', () => ({
  IssuePanelContainer: () => <div data-testid="issue-panel">issues</div>,
}));

vi.mock('../../inspector-panel/EmptyInspectorPanel', () => ({
  EmptyInspectorPanel: () => <div data-testid="empty-inspector-panel">empty inspector</div>,
}));

vi.mock('../../network-build/InspectorEngineeringView', () => ({
  InspectorEngineeringView: () => <div data-testid="inspector-engineering-view">engineering inspector</div>,
}));

vi.mock('../../network-build/GlobalSearch', () => ({
  GlobalSearch: () => null,
}));

vi.mock('../../network-build/TopContextBar', () => ({
  TopContextBar: () => <div data-testid="top-context-bar">top context</div>,
}));

vi.mock('../../network-build/SldVisualModes', () => ({
  SldVisualModes: () => <div data-testid="sld-visual-modes">visual modes</div>,
}));

vi.mock('../../network-build/mass-review', () => ({
  MassReviewPanel: () => null,
}));

vi.mock('../../network-build/ProjectMetadataModal', () => ({
  ProjectMetadataModal: () => null,
}));

vi.mock('../../network-build/SnapshotHistoryModal', () => ({
  SnapshotHistoryModal: () => null,
}));

vi.mock('../../network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: typeof activeSurfaceState) => unknown) => selector(activeSurfaceState),
}));

vi.mock('../../app-state', () => ({
  useIssuePanelOpen: () => false,
  useActiveCaseId: () => 'case-1',
  useActiveMode: () => 'MODEL_EDIT',
  useAppStateStore: (selector: (state: { activeCaseName: string | null }) => unknown) =>
    selector({ activeCaseName: 'Zakres podstawowy' }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: Array<unknown> }) => unknown) =>
    selector({ selectedElements: [] }),
}));

vi.mock('../../navigation/routes', () => ({
  navigateToCatalog: vi.fn(),
  navigateToConditions: vi.fn(),
  navigateToVariants: vi.fn(),
}));

vi.mock('../../workspace', () => ({
  WorkspaceOperationalBar: () => <div data-testid="workspace-operational-bar">operational</div>,
  WorkspaceSurfaceRouter: ({ region }: { region: string }) => (
    <div data-testid={`workspace-surface-router-${region}`}>surface router</div>
  ),
}));

describe('CanonicalLayout V12.5 shell', () => {
  it('renderuje shell bez legacy drzewa projektu', () => {
    render(
      <CanonicalLayout projectName="Projekt testowy">
        <div data-testid="editor-content">SLD</div>
      </CanonicalLayout>,
    );

    expect(screen.getByTestId('canonical-layout')).toBeInTheDocument();
    expect(screen.getByTestId('main-menu-bar')).toBeInTheDocument();
    expect(screen.getByTestId('active-case-bar')).toBeInTheDocument();
    expect(screen.getByTestId('top-context-bar')).toBeInTheDocument();
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-panel-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-operational-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('project-tree-sidebar')).not.toBeInTheDocument();
  });
});
