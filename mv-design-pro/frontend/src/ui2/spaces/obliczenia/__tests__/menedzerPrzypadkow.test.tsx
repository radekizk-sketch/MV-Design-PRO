import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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
import { MenedzerPrzypadkow } from '../MenedzerPrzypadkow';
import { PRZYPADKI_STRINGS as T } from '../strings';
import { caseListItem, studyCaseFixture } from './fixtures';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listStudyCases).mockResolvedValue([]);
  vi.mocked(api.getStudyCase).mockImplementation((id: string) =>
    Promise.resolve(studyCaseFixture(id, id === 'K1' ? 'Stan normalny' : 'Zwarcia maks.')),
  );
  useAppStateStore.setState({
    activeProjectId: 'P-1',
    activeCaseId: null,
    activeCaseName: null,
  });
  useStudyCasesStore.setState({
    projectId: null,
    isLoading: false,
    cases: [
      caseListItem('K1', 'Stan normalny', 'FRESH'),
      caseListItem('K2', 'Zwarcia maks.', 'OUTDATED'),
    ],
  });
});

describe('MenedzerPrzypadkow — stany i lista', () => {
  it('brak projektu → komunikat', () => {
    useAppStateStore.setState({ activeProjectId: null });
    render(<MenedzerPrzypadkow />);
    expect(screen.getByTestId('mvd-przypadki-brak-projektu')).toBeInTheDocument();
  });

  it('renderuje wiersze przypadków ze store', () => {
    render(<MenedzerPrzypadkow />);
    expect(screen.getByText('Stan normalny')).toBeInTheDocument();
    expect(screen.getByText('Zwarcia maks.')).toBeInTheDocument();
  });
});

describe('MenedzerPrzypadkow — gramatyka §2', () => {
  it('klik wiersza = selekcja + wczytanie karty', async () => {
    render(<MenedzerPrzypadkow />);
    fireEvent.click(screen.getByText('Stan normalny'));
    const wiersz = screen.getByText('Stan normalny').closest('tr');
    expect(wiersz).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('mvd-karta')).toBeInTheDocument();
    expect(api.getStudyCase).toHaveBeenCalledWith('K1');
  });

  it('2× klik = aktywacja odzwierciedlona w useAppStateStore (SPEC §3.2)', async () => {
    render(<MenedzerPrzypadkow />);
    fireEvent.doubleClick(screen.getByText('Zwarcia maks.'));
    await waitFor(() => expect(useAppStateStore.getState().activeCaseId).toBe('K2'));
    expect(useAppStateStore.getState().activeCaseName).toBe('Zwarcia maks.');
    expect(useAppStateStore.getState().activeCaseResultStatus).toBe('OUTDATED');
  });

  it('prawy przycisk = menu z akcjami Aktywuj / Klonuj / Porównaj', () => {
    render(<MenedzerPrzypadkow />);
    fireEvent.contextMenu(screen.getByText('Stan normalny'));
    const menu = screen.getByTestId('mvd-menu');
    expect(within(menu).getByTestId('mvd-menu-aktywuj')).toHaveTextContent(T.menuAktywuj);
    expect(within(menu).getByTestId('mvd-menu-klonuj')).toHaveTextContent(T.menuKlonuj);
    expect(within(menu).getByTestId('mvd-menu-porownaj')).toHaveTextContent(T.menuPorownaj);
  });
});

describe('MenedzerPrzypadkow — porównanie i tworzenie', () => {
  it('zaznaczenie 2 przypadków do porównania włącza przycisk „Porównaj"', () => {
    render(<MenedzerPrzypadkow />);
    const przycisk = screen.getByTestId('mvd-przypadki-porownaj');
    expect(przycisk).toBeDisabled();
    fireEvent.click(screen.getByTestId('mvd-przypadki-porownaj-K1'));
    fireEvent.click(screen.getByTestId('mvd-przypadki-porownaj-K2'));
    expect(przycisk).toBeEnabled();
  });

  it('„Porównaj" otwiera widok porównania', async () => {
    render(<MenedzerPrzypadkow />);
    fireEvent.click(screen.getByTestId('mvd-przypadki-porownaj-K1'));
    fireEvent.click(screen.getByTestId('mvd-przypadki-porownaj-K2'));
    fireEvent.click(screen.getByTestId('mvd-przypadki-porownaj'));
    expect(await screen.findByTestId('mvd-porownanie')).toBeInTheDocument();
  });

  it('przycisk „Nowy przypadek" otwiera dialog', () => {
    render(<MenedzerPrzypadkow />);
    fireEvent.click(screen.getByTestId('mvd-przypadki-nowy'));
    expect(screen.getByTestId('mvd-nowy-dialog')).toBeInTheDocument();
  });
});
