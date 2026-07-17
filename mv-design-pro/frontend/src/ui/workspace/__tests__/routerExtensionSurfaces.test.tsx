import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient as render } from '../../../test/queryClientTestUtils';

import { useAppStateStore } from '../../app-state';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
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

  // F12-C (spec par. 10.1 ARCH-4): sciezka renderu v2 i host USUNIETE —
  // E-01 jako rozszerzona powierzchnia renderuje bezposrednio JEDYNY render
  // (SldCanvasV3Workspace), spojnie z App.tsx.
  describe('SldCanvasV3Workspace jako E-01 (WorkspaceSurfaceRouter drugi punkt osadzenia)', () => {
    it('renderuje SldCanvasV3Workspace dla rozszerzonej powierzchni E-01', () => {
      useNetworkBuildStore.setState({
        activeSurface: buildSurface('E-01', 'Środowisko pracy SLD'),
      });
      const { container } = render(<WorkspaceSurfaceRouter region="main" />);
      expect(container.querySelector('[data-testid="sld-canvas-v3-workspace"]')).toBeTruthy();
    });
  });
});

describe('AnalysisSurfaceComparisonWizard (component-level)', () => {
  it('AnalysisSurfaceComparisonWizard pokazuje empty state gdy <2 runs', async () => {
    const { AnalysisSurfaceComparisonWizard } = await import('../routerExtensionSurfaces');
    const { render } = await import('@testing-library/react');
    const { container } = render(<AnalysisSurfaceComparisonWizard />);
    expect(container.textContent).toMatch(/Brak dostępnych przebiegów/i);
  });

  // Test AnalysisSurfaceSensitivityTab usunięty w W5b-2: stub niedostarczony,
  // decyzja właściciela D2 2026-07-17 (tab "sensitivity" wygaszony w E-35).
});
