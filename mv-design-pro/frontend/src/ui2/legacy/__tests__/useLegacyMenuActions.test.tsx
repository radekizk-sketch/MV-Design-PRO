/**
 * Testy akcji menu legacy (K3-A2 — jedno lądowisko wyników): akcje z
 * zakładkowym dostawcą ui2 (wyniki/porównanie/dowód) prowadzą do warsztatu
 * przestrzeni „Wyniki" (deep-link zakładki, wzorzec V12K-106), a nie do
 * powierzchni trasowych mostu; „protection" celowo zostaje w moście
 * (brak zakładkowego odpowiednika ui2).
 */
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLegacyMenuActions } from '../useLegacyMenuActions';
import { useShellStore } from '../../shell/useShellStore';
import { useAppStateStore } from '../../../ui/app-state';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';

let wykonaj: ((id: string) => void) | null = null;

function Probe() {
  wykonaj = useLegacyMenuActions(vi.fn(async () => {}));
  return null;
}

describe('useLegacyMenuActions (K3-A2 — lądowisko wyników ui2)', () => {
  beforeEach(() => {
    wykonaj = null;
    window.location.hash = '';
    useShellStore.setState({ activeSpace: 'projekt', wynikiTab: null, wynikiTabElement: null });
    useAppStateStore.setState({ activeRunId: 'run-77' });
    useExecutionRunsStore.setState({ activeRunId: null });
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  });

  it('compare → zakładka „porownanie" + przestrzeń „wyniki" (bez trasy mostu #compare)', async () => {
    render(<Probe />);
    await waitFor(() => expect(wykonaj).not.toBeNull());
    wykonaj!('compare');
    expect(useShellStore.getState().wynikiTab).toBe('porownanie');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(window.location.hash).toBe('');
  });

  it('proof → zakładka „dowod" z kontekstem aktywnego przebiegu + przestrzeń „wyniki"', async () => {
    render(<Probe />);
    await waitFor(() => expect(wykonaj).not.toBeNull());
    wykonaj!('proof');
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-77');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(window.location.hash).toBe('');
  });

  it('analysis → przestrzeń „wyniki" + trasa #analysis z runId (powierzchnię mostu otwiera orkiestrator, nie akcja)', async () => {
    render(<Probe />);
    await waitFor(() => expect(wykonaj).not.toBeNull());
    wykonaj!('analysis');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(window.location.hash).toContain('#analysis');
    expect(window.location.hash).toContain('run=run-77');
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });

  it('protection zostaje w moście — trasa #protection-results (brak zakładki ui2)', async () => {
    render(<Probe />);
    await waitFor(() => expect(wykonaj).not.toBeNull());
    wykonaj!('protection');
    expect(window.location.hash).toContain('#protection-results');
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });
});
