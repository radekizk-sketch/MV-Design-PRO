import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
