/**
 * Testy dostawcy przestrzeni „Dokumentacja" (MostDokumentacji, karta F-E8.1):
 * przełączanie HUB ↔ powierzchnia dokumentu (E-37/E-36) z paskiem powrotu.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { MostDokumentacji } from '../MostDokumentacji';

describe('MostDokumentacji — przełączanie hub ↔ dokument', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeProjectName: null, activeCaseName: null, activeCaseId: null });
    useSnapshotStore.setState({ snapshot: null });
    useExecutionRunsStore.setState({ runs: [] });
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  });

  afterEach(() => {
    cleanup();
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  });

  it('brak aktywnej powierzchni dokumentu → renderuje hub prowadzący', () => {
    render(<MostDokumentacji />);
    expect(screen.getByTestId('mvd-dokumentacja-hub')).toBeTruthy();
    expect(screen.queryByTestId('mvd-dok-most-dziecko')).toBeNull();
  });

  it('powierzchnia obcej przestrzeni (E-35) NIE jest dublowana — przestrzeń pokazuje własny hub', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-35');
    render(<MostDokumentacji />);
    expect(screen.getByTestId('mvd-dokumentacja-hub')).toBeTruthy();
    expect(screen.queryByTestId('mvd-dok-most-dziecko')).toBeNull();
  });

  // Gałąź powierzchni dokumentu (E-37/E-36 → WorkspaceSurfaceRouter z paskiem
  // powrotu) renderuje realny generator raportu (react-query/mutacje) — pokryta
  // testem integracyjnym/e2e, nie unitem (jak MostAnalizTechnicznych, świadomie
  // nietestowany z realnym routerem). Tu dowodzimy gałęzi HUBA (własność mostu).
});
