import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../../../../ui/study-cases/api', () => ({
  getStudyCase: vi.fn(),
  createStudyCase: vi.fn(),
  cloneStudyCase: vi.fn(),
  setActiveStudyCase: vi.fn(),
  listStudyCases: vi.fn(),
  getActiveStudyCase: vi.fn(),
}));

import * as api from '../../../../ui/study-cases/api';
import { useAppStateStore } from '../../../../ui/app-state/store';
import { useStudyCasesStore } from '../../../../ui/study-cases/store';
import {
  mapujWiersze,
  rozniceKonfiguracji,
  useAktywujPrzypadek,
  useTworzeniePrzypadku,
  type PrzypadekWiersz,
} from '../adapters/przypadkiAdapter';
import { caseListItem, studyCaseFixture } from './fixtures';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listStudyCases).mockResolvedValue([]);
  useAppStateStore.setState({
    activeProjectId: null,
    activeCaseId: null,
    activeCaseName: null,
  });
  useStudyCasesStore.setState({ projectId: null, cases: [], error: null, isCreating: false, isCloning: false });
});

describe('mapujWiersze — projekcja streszczeń na wiersze', () => {
  it('mapuje pola i zamienia pusty opis na „—"', () => {
    const wiersze = mapujWiersze([
      caseListItem('K1', 'Stan normalny', 'FRESH'),
      caseListItem('K2', 'Zwarcia maks.', 'OUTDATED', { description: '  ', is_active: true }),
    ]);
    expect(wiersze[0]).toMatchObject({ id: 'K1', nazwa: 'Stan normalny', statusWynikow: 'FRESH' });
    expect(wiersze[1].konfiguracja).toBe('—');
    expect(wiersze[1].aktywny).toBe(true);
  });

  it('przenosi znacznik czasu zmiany', () => {
    const [w] = mapujWiersze([caseListItem('K1', 'A', 'NONE')]);
    expect(w.zmienionoISO).toBe('2026-07-15T11:05:00Z');
  });
});

describe('rozniceKonfiguracji — tabela różnic', () => {
  it('zwraca [] dla mniej niż dwóch przypadków', () => {
    expect(rozniceKonfiguracji([studyCaseFixture('K1', 'A')])).toEqual([]);
  });

  it('identyczna konfiguracja → żaden wiersz nie jest różny', () => {
    const wiersze = rozniceKonfiguracji([
      studyCaseFixture('K1', 'A'),
      studyCaseFixture('K2', 'B'),
    ]);
    expect(wiersze.length).toBeGreaterThanOrEqual(12);
    expect(wiersze.every((w) => !w.rozne)).toBe(true);
  });

  it('różnica w c_factor_max → tylko ten wiersz różny', () => {
    const wiersze = rozniceKonfiguracji([
      studyCaseFixture('K1', 'A', { config: { c_factor_max: 1.1 } }),
      studyCaseFixture('K2', 'B', { config: { c_factor_max: 1.05 } }),
    ]);
    const rozne = wiersze.filter((w) => w.rozne);
    expect(rozne).toHaveLength(1);
    expect(rozne[0].pole).toBe('c_factor_max');
    expect(rozne[0].wartosci).toEqual(['1.1', '1.05']);
  });
});

const WIERSZ: PrzypadekWiersz = {
  id: 'K2',
  nazwa: 'Zwarcia maks.',
  konfiguracja: 'IEC 60909',
  statusWynikow: 'OUTDATED',
  zmienionoISO: '2026-07-15T14:32:00Z',
  aktywny: false,
};

describe('useAktywujPrzypadek — aktywacja przez store', () => {
  it('bez projektu study-cases: pomija utrwalenie, ustawia kontekst powłoki (app-state)', async () => {
    const { result } = renderHook(() => useAktywujPrzypadek());
    await act(async () => {
      await result.current(WIERSZ);
    });
    expect(api.setActiveStudyCase).not.toHaveBeenCalled();
    const stan = useAppStateStore.getState();
    expect(stan.activeCaseId).toBe('K2');
    expect(stan.activeCaseName).toBe('Zwarcia maks.');
    expect(stan.activeCaseResultStatus).toBe('OUTDATED');
  });

  it('z projektem study-cases: utrwala is_active przez istniejące API i ustawia app-state', async () => {
    useStudyCasesStore.setState({ projectId: 'P-1' });
    vi.mocked(api.setActiveStudyCase).mockResolvedValue(studyCaseFixture('K2', 'Zwarcia maks.'));
    const { result } = renderHook(() => useAktywujPrzypadek());
    await act(async () => {
      await result.current(WIERSZ);
    });
    expect(api.setActiveStudyCase).toHaveBeenCalledWith('P-1', 'K2');
    expect(useAppStateStore.getState().activeCaseId).toBe('K2');
  });
});

describe('useTworzeniePrzypadku — utworzenie/klonowanie przez istniejące API', () => {
  it('utworz woła createStudyCase z project_id z app-state', async () => {
    useAppStateStore.setState({ activeProjectId: 'P-1' });
    vi.mocked(api.createStudyCase).mockResolvedValue(studyCaseFixture('K9', 'Nowy'));
    const { result } = renderHook(() => useTworzeniePrzypadku());
    await act(async () => {
      await result.current.utworz('Nowy', 'opis', true);
    });
    expect(api.createStudyCase).toHaveBeenCalledWith({
      project_id: 'P-1',
      name: 'Nowy',
      description: 'opis',
      set_active: true,
    });
  });

  it('utworz bez projektu rzuca błąd i nie woła API', async () => {
    const { result } = renderHook(() => useTworzeniePrzypadku());
    await expect(result.current.utworz('Nowy', '', false)).rejects.toThrow();
    expect(api.createStudyCase).not.toHaveBeenCalled();
  });

  it('klonuj woła cloneStudyCase ze źródłem i nazwą', async () => {
    vi.mocked(api.cloneStudyCase).mockResolvedValue(studyCaseFixture('K10', 'Klon'));
    const { result } = renderHook(() => useTworzeniePrzypadku());
    await act(async () => {
      await result.current.klonuj('K2', 'Klon');
    });
    expect(api.cloneStudyCase).toHaveBeenCalledWith('K2', 'Klon');
  });
});
