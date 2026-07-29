import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
import { NowyPrzypadek } from '../NowyPrzypadek';
import { PRZYPADKI_STRINGS as T } from '../strings';
import type { PrzypadekWiersz } from '../adapters/przypadkiAdapter';
import { studyCaseFixture } from './fixtures';

const WIERSZE: PrzypadekWiersz[] = [
  { id: 'K1', nazwa: 'Stan normalny', konfiguracja: 'A', statusWynikow: 'FRESH', zmienionoISO: null, aktywny: false },
  { id: 'K2', nazwa: 'Zwarcia maks.', konfiguracja: 'B', statusWynikow: 'NONE', zmienionoISO: null, aktywny: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listStudyCases).mockResolvedValue([]);
  useAppStateStore.setState({ activeProjectId: 'P-1' });
  useStudyCasesStore.setState({ projectId: 'P-1', isCreating: false, isCloning: false, error: null, cases: [] });
});

describe('NowyPrzypadek — walidacja i API', () => {
  it('pusta nazwa → błąd walidacji, brak wołania API', () => {
    render(<NowyPrzypadek wiersze={WIERSZE} onZamknij={() => {}} />);
    fireEvent.submit(screen.getByTestId('mvd-nowy-utworz').closest('form')!);
    expect(screen.getByTestId('mvd-nowy-blad')).toHaveTextContent(T.bladNazwaPusta);
    expect(api.createStudyCase).not.toHaveBeenCalled();
  });

  it('tryb „nowy": woła createStudyCase z nazwą i opisem, zamyka', async () => {
    vi.mocked(api.createStudyCase).mockResolvedValue(studyCaseFixture('K9', 'Nowy'));
    const onZamknij = vi.fn();
    const onUtworzono = vi.fn();
    render(<NowyPrzypadek wiersze={WIERSZE} onZamknij={onZamknij} onUtworzono={onUtworzono} />);
    fireEvent.change(screen.getByTestId('mvd-nowy-nazwa'), { target: { value: 'Nowy' } });
    fireEvent.change(screen.getByTestId('mvd-nowy-opis'), { target: { value: 'zakres' } });
    fireEvent.click(screen.getByTestId('mvd-nowy-utworz'));
    await waitFor(() => expect(api.createStudyCase).toHaveBeenCalled());
    expect(api.createStudyCase).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Nowy', description: 'zakres', project_id: 'P-1' }),
    );
    expect(onUtworzono).toHaveBeenCalledWith('K9');
    expect(onZamknij).toHaveBeenCalled();
  });

  it('tryb „dziedzicz": woła cloneStudyCase ze źródłem', async () => {
    vi.mocked(api.cloneStudyCase).mockResolvedValue(studyCaseFixture('K10', 'Klon'));
    render(<NowyPrzypadek wiersze={WIERSZE} zrodloPoczatkowe="K2" onZamknij={() => {}} />);
    expect(screen.getByTestId('mvd-nowy-zrodlo')).toHaveValue('K2');
    fireEvent.change(screen.getByTestId('mvd-nowy-nazwa'), { target: { value: 'Klon' } });
    fireEvent.click(screen.getByTestId('mvd-nowy-utworz'));
    await waitFor(() => expect(api.cloneStudyCase).toHaveBeenCalledWith('K2', 'Klon'));
  });

  it('przycisk „Anuluj" zamyka dialog', () => {
    const onZamknij = vi.fn();
    render(<NowyPrzypadek wiersze={WIERSZE} onZamknij={onZamknij} />);
    fireEvent.click(screen.getByTestId('mvd-nowy-anuluj'));
    expect(onZamknij).toHaveBeenCalled();
  });

  it('przełączenie na „dziedzicz" pokazuje wybór źródła', () => {
    render(<NowyPrzypadek wiersze={WIERSZE} onZamknij={() => {}} />);
    expect(screen.queryByTestId('mvd-nowy-zrodlo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-nowy-tryb-dziedzicz'));
    expect(screen.getByTestId('mvd-nowy-zrodlo')).toBeInTheDocument();
  });
});
