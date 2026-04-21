import { beforeEach, describe, expect, it } from 'vitest';

import { useNetworkBuildStore } from '../networkBuildStore';
import {
  ANALYSIS_ROUTE_DEFAULT_TAB,
  ANALYSIS_SURFACE_SCREEN_CODE,
} from '../../workspace/types';

describe('networkBuildStore route-managed surfaces V12.5', () => {
  beforeEach(() => {
    useNetworkBuildStore.getState().reset();
  });

  it('applies the E-24 default tab from the screen matrix', () => {
    useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
      titlePl: 'Poziom analityczny',
      subjectKind: 'analysis_run',
      subjectRef: 'run-1',
    });

    const state = useNetworkBuildStore.getState();
    const activeSurface = state.activeSurface;
    const activeSession = activeSurface ? state.surfaceSessions[activeSurface.surfaceId] : null;

    expect(activeSurface?.screenCode).toBe(ANALYSIS_SURFACE_SCREEN_CODE);
    expect(activeSurface?.routeState.route).toBe('analysis');
    expect(activeSurface?.tabId).toBe(ANALYSIS_ROUTE_DEFAULT_TAB);
    expect(activeSurface?.routeState.tabId).toBe(ANALYSIS_ROUTE_DEFAULT_TAB);
    expect(activeSession?.activeTabId).toBe(ANALYSIS_ROUTE_DEFAULT_TAB);
  });

  it('keeps helper variants surface on the canonical helper route key', () => {
    useNetworkBuildStore.getState().openRouteSurface('variants_runs');

    expect(useNetworkBuildStore.getState().activeSurface?.routeState.route).toBe('variants');
  });

  it('maps the coordination inspector onto the dedicated E-28 surface', () => {
    useNetworkBuildStore.getState().openInspectorPanel('coordination', 'bay-1', 'BaySN');

    const activeSurface = useNetworkBuildStore.getState().activeSurface;
    expect(activeSurface?.screenCode).toBe('E-28');
    expect(activeSurface?.routeState.route).toBe('analysis');
  });
});
