/**
 * Testy akcji menu legacy (K3-A2 — jedno lądowisko wyników): akcje z
 * zakładkowym dostawcą ui2 (wyniki/porównanie/dowód) prowadzą do warsztatu
 * przestrzeni „Wyniki" (deep-link zakładki, wzorzec V12K-106), a nie do
 * powierzchni trasowych mostu. K8: „protection" dołącza do tej reguły —
 * zakładka „Koordynacja zabezpieczeń" jest realnym dostawcą ui2, więc trasa
 * mostu #protection-results została wygaszona.
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

  // INTENCJA (K3-A2, zachowana): akcja „protection" ma prowadzić do JEDNEGO
  // lądowiska wyników zabezpieczeń, a nie zostawiać użytkownika w widoku bez
  // treści zabezpieczeniowej. Kanon zmieniony w K8: warsztat Wyników ma
  // zakładkę „Koordynacja zabezpieczeń" (EkranKoordynacji — dostawca ui2
  // ekranu E-28), więc trasa mostu #protection-results (generyczna tabela
  // E-35) jest wygaszona i akcja celuje w zakładkę.
  it('protection → zakładka „koordynacja" + przestrzeń „wyniki" (trasa mostu #protection-results wygaszona)', async () => {
    render(<Probe />);
    await waitFor(() => expect(wykonaj).not.toBeNull());
    wykonaj!('protection');
    expect(useShellStore.getState().wynikiTab).toBe('koordynacja');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(window.location.hash).toBe('');
  });
});
