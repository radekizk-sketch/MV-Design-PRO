import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app-state', () => ({
  useActiveCaseId: () => 'case-1',
  useActiveMode: () => 'MODEL_EDIT',
  useIssuePanelOpen: () => false,
}));

vi.mock('../../app-state/store', () => ({
  useAppStateStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeArea: 'MODEL_SIECI',
      activeWorkMode: 'TE',
      activeCaseName: 'Przypadek testowy',
      activeCaseId: 'case-1',
      activeVariantName: 'Bazowy',
      activeSnapshotId: null,
      activeProjectName: 'Projekt testowy',
      activeCaseResultStatus: 'NONE',
      setActiveArea: vi.fn(),
    }),
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

vi.mock('../StatusBarV12', () => ({
  StatusBarV12: () => <div data-testid="status-bar-v12" />,
}));

vi.mock('../V12OverlayModeController', () => ({
  V12OverlayModeController: () => null,
}));

vi.mock('../context-panels', () => ({
  AreaContextPanel: () => <div data-testid="area-context-panel" />,
}));

import { AppShellV12 } from '../AppShellV12';

describe('AppShellV12 compact workspace layout', () => {
  it('renders top bar, navigator, canvas, inspector and status bar without the old workflow strip', () => {
    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByTestId('top-bar-v12')).toBeInTheDocument();
    expect(screen.getByTestId('context-panel')).toHaveAttribute('data-area', 'MODEL_SIECI');
    expect(screen.getByTestId('area-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('main-content')).toHaveTextContent('SLD');
    expect(screen.getByTestId('inspector-panel-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar-v12')).toBeInTheDocument();
    expect(screen.getByTestId('sld-visual-modes')).toBeInTheDocument();

    expect(screen.queryByTestId('navigation-rail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wcs-search')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wcs-catalog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wcs-mass-review')).not.toBeInTheDocument();
  });
});
