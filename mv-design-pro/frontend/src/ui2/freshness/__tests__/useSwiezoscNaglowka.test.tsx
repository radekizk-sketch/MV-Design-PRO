/**
 * Nagłówek świeżości ekranu analizy — JEDNA derywacja (V12K-264, krok 2).
 *
 * DEFEKT, KTÓRY TO ZAMYKA. Kontrakt przebiegu nie niósł LICZBOWEJ rewizji modelu,
 * więc `NaglowekAnalizy` nigdy nie dostawał pary rewizji i wspólny `FreshnessBadge`
 * NIE POKAZYWAŁ SIĘ NIGDY — mimo że komponent istniał i był przetestowany.
 * `zwarciaModel.ts` i `rozplywAdapter.ts` opisują to wprost i pomijają badge.
 *
 * Test sprawdza obie strony kontraktu: że liczba dojeżdża z kontraktu przebiegu
 * do nagłówka ORAZ że jej brak zostaje BRAKIEM (żadnego zera, żadnej podstawionej
 * rewizji bieżącej — „aktualne" byłoby wtedy werdyktem bez podstawy).
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../ui/app-state/store';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useSwiezoscNaglowka } from '../useSwiezoscNaglowka';

const kontraktMock = vi.fn();

vi.mock('../../../ui/workspace/analysisRunContract', () => ({
  useAnalysisRunContract: (runId: string | null) => kontraktMock(runId),
}));

function ustawModel(revision: number | undefined): void {
  // S9-11 / W-5: hook czyta JEDNO źródło rewizji bieżącego modelu
  // (`rewizjaBiezacegoModelu`) — zasiew odzwierciedla realne ścieżki store'u,
  // które ustawiają je razem z migawką (odpowiedź domain-ops).
  useSnapshotStore.setState({
    snapshot: revision === undefined ? null : ({ header: { revision } } as never),
    rewizjaBiezacegoModelu: revision === undefined ? null : revision,
  } as never);
}

function kontraktZRewizja(rewizjaModelu: number | null) {
  return {
    data: { analysisCaseContext: { rewizjaModelu } },
    isLoading: false,
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
  ustawModel(7);
  kontraktMock.mockReturnValue(kontraktZRewizja(4));
});

afterEach(() => {
  useSnapshotStore.setState({ snapshot: null } as never);
});

describe('useSwiezoscNaglowka — para rewizji z realnych źródeł', () => {
  it('składa rewizję modelu (migawka) i rewizję wyniku (kontrakt przebiegu)', () => {
    const { result } = renderHook(() => useSwiezoscNaglowka('run-1'));

    expect(result.current.rewizjaModelu).toBe(7);
    expect(result.current.rewizjaDanych).toBe(4);
    expect(result.current.caseId).toBe('case-1');
    expect(kontraktMock).toHaveBeenCalledWith('run-1');
  });

  it('kontrakt BEZ rewizji → brak zostaje brakiem, nie zerem', () => {
    kontraktMock.mockReturnValue(kontraktZRewizja(null));
    const { result } = renderHook(() => useSwiezoscNaglowka('run-1'));

    // Zero byłoby liczbą i dawałoby werdykt „nieaktualne (rew. 0 → 7)" bez podstawy;
    // podstawienie rewizji bieżącej dawałoby fałszywe „aktualne".
    expect(result.current.rewizjaDanych).toBeUndefined();
    expect(result.current.rewizjaModelu).toBe(7);
  });

  it('brak migawki modelu → rewizja modelu nieznana', () => {
    ustawModel(undefined);
    const { result } = renderHook(() => useSwiezoscNaglowka('run-1'));
    expect(result.current.rewizjaModelu).toBeUndefined();
  });

  it('bez przebiegu nie pyta o kontrakt cudzym identyfikatorem', () => {
    kontraktMock.mockReturnValue({ data: null, isLoading: false, error: null });
    const { result } = renderHook(() => useSwiezoscNaglowka(null));

    expect(kontraktMock).toHaveBeenCalledWith(null);
    expect(result.current.rewizjaDanych).toBeUndefined();
  });

  it('bez aktywnego wariantu pracy nie ma czym zapytać o dziennik', () => {
    useAppStateStore.setState({ activeCaseId: null } as never);
    const { result } = renderHook(() => useSwiezoscNaglowka('run-1'));
    expect(result.current.caseId).toBeUndefined();
  });
});
