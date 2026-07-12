import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient as render } from '../../../test/queryClientTestUtils';

import { useAppStateStore } from '../../app-state';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { SLD_RENDER_VERSION_STORAGE_KEY } from '../../sld/sldRenderVersion';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import type { WorkspaceSurfaceDescriptor } from '../types';

function buildSurface(screenCode: string, titlePl: string): WorkspaceSurfaceDescriptor {
  return {
    surfaceId: `surface-${screenCode}`,
    screenCode: screenCode as never,
    titlePl,
    entityRef: null,
    entityType: null,
    routeState: { payload: {} } as never,
    breadcrumbs: [],
    supportsMiniSld: false,
    supportsChildren: false,
    sizeClass: 'C',
    stackLevel: 0,
    openMode: 'expand_workspace',
    subjectKind: 'analysis',
    subjectRef: null,
    saveMode: 'edit',
    hasUnsavedChanges: false,
    tabId: null,
  } as never;
}

describe('routerExtensionSurfaces', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
  });

  describe('AuditTrailSurface (E-09)', () => {
    it('renderuje panel historii operacji', () => {
      useNetworkBuildStore.setState({
        activeSurface: buildSurface('E-09', 'Wersje układu i historia obliczeń'),
      });
      render(<WorkspaceSurfaceRouter region="main" />);
      // AuditTrailPanel zawsze renderuje stan (pusty lub z danymi)
      expect(document.body.textContent).toMatch(/historia|operac/i);
    });
  });

  // F8b-2 zakres A: WorkspaceSurfaceRouter (drugi punkt osadzenia SLD, poza
  // App.tsx) przełączony z `SldWorkspaceContainer` (bezpośrednio) na
  // `SldRenderHost` — ten sam cutover v2/v3 + fallback localStorage co
  // App.tsx (REBUILD_PLAN_V3 §F8b-2, znalezisko F8b-1: WorkspaceSurfaceRouter
  // .tsx:3131).
  describe('SldRenderHost jako E-01 (WorkspaceSurfaceRouter drugi punkt osadzenia)', () => {
    afterEach(() => {
      localStorage.removeItem(SLD_RENDER_VERSION_STORAGE_KEY);
    });

    it('domyślnie renderuje v3 (SldCanvasV3Workspace) dla rozszerzonej powierzchni E-01', () => {
      useNetworkBuildStore.setState({
        activeSurface: buildSurface('E-01', 'Środowisko pracy SLD'),
      });
      const { container } = render(<WorkspaceSurfaceRouter region="main" />);
      expect(container.querySelector('[data-testid="sld-canvas-v3-workspace"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="sld-workspace-container"]')).toBeNull();
    });

    it('override localStorage="v2" renderuje fallback v2 (SldWorkspaceContainer) również tu', () => {
      localStorage.setItem(SLD_RENDER_VERSION_STORAGE_KEY, 'v2');
      useNetworkBuildStore.setState({
        activeSurface: buildSurface('E-01', 'Środowisko pracy SLD'),
      });
      const { container } = render(<WorkspaceSurfaceRouter region="main" />);
      expect(container.querySelector('[data-testid="sld-workspace-container"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="sld-canvas-v3-workspace"]')).toBeNull();
    });
  });
});

describe('AnalysisSurfaceComparisonWizard / SensitivityTab (component-level)', () => {
  it('AnalysisSurfaceComparisonWizard pokazuje empty state gdy <2 runs', async () => {
    const { AnalysisSurfaceComparisonWizard } = await import('../routerExtensionSurfaces');
    const { render } = await import('@testing-library/react');
    const { container } = render(<AnalysisSurfaceComparisonWizard />);
    expect(container.textContent).toMatch(/Brak dostępnych przebiegów/i);
  });

  it('AnalysisSurfaceSensitivityTab renderuje SensitivityPanel z empty state', async () => {
    const { AnalysisSurfaceSensitivityTab } = await import('../routerExtensionSurfaces');
    const { render } = await import('@testing-library/react');
    const { container } = render(<AnalysisSurfaceSensitivityTab />);
    // SensitivityPanel always renders status header
    expect(container.textContent).toMatch(/Czułość|sensitivity|wrażliwość/i);
  });
});
