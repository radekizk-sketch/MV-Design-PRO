import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../../types/enm';
import migawkaSceny from '../../../../harness-fixtures/generated/koordynacja_scena_migawka.json';

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
    const user = userEvent.setup();
    render(<MenedzerPrzypadkow />);
    const komorka = screen.getByText('Stan normalny');
    await user.click(komorka);
    const wiersz = komorka.closest('tr');
    expect(wiersz).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('mvd-karta')).toBeInTheDocument();
    expect(api.getStudyCase).toHaveBeenCalledWith('K1');
  });

  it('2× klik = aktywacja odzwierciedlona w useAppStateStore (SPEC §3.2)', async () => {
    const user = userEvent.setup();
    render(<MenedzerPrzypadkow />);
    await user.dblClick(screen.getByText('Zwarcia maks.'));
    await waitFor(() => expect(useAppStateStore.getState().activeCaseId).toBe('K2'));
    expect(useAppStateStore.getState().activeCaseName).toBe('Zwarcia maks.');
    expect(useAppStateStore.getState().activeCaseResultStatus).toBe('OUTDATED');
  });

  it('prawy przycisk = menu z akcjami Aktywuj / Klonuj / Porównaj', async () => {
    const user = userEvent.setup();
    render(<MenedzerPrzypadkow />);
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('Stan normalny') });
    const menu = screen.getByTestId('mvd-menu');
    expect(within(menu).getByTestId('mvd-menu-aktywuj')).toHaveTextContent(T.menuAktywuj);
    expect(within(menu).getByTestId('mvd-menu-klonuj')).toHaveTextContent(T.menuKlonuj);
    expect(within(menu).getByTestId('mvd-menu-porownaj')).toHaveTextContent(T.menuPorownaj);
  });
});

describe('MenedzerPrzypadkow — porównanie i tworzenie', () => {
  it('zaznaczenie 2 przypadków do porównania włącza przycisk „Porównaj"', async () => {
    const user = userEvent.setup();
    render(<MenedzerPrzypadkow />);
    const przycisk = screen.getByTestId('mvd-przypadki-porownaj');
    expect(przycisk).toBeDisabled();
    await user.click(screen.getByTestId('mvd-przypadki-porownaj-K1'));
    await user.click(screen.getByTestId('mvd-przypadki-porownaj-K2'));
    expect(przycisk).toBeEnabled();
  });

  it('„Porównaj" otwiera widok porównania', async () => {
    const user = userEvent.setup();
    render(<MenedzerPrzypadkow />);
    await user.click(screen.getByTestId('mvd-przypadki-porownaj-K1'));
    await user.click(screen.getByTestId('mvd-przypadki-porownaj-K2'));
    await user.click(screen.getByTestId('mvd-przypadki-porownaj'));
    expect(await screen.findByTestId('mvd-porownanie')).toBeInTheDocument();
  });

  it('przycisk „Nowy przypadek" otwiera dialog', async () => {
    const user = userEvent.setup();
    render(<MenedzerPrzypadkow />);
    await user.click(screen.getByTestId('mvd-przypadki-nowy'));
    expect(screen.getByTestId('mvd-nowy-dialog')).toBeInTheDocument();
  });
});

describe('MenedzerPrzypadkow — zapis zabezpieczeń przypadku odświeża jego status', () => {
  it('zmiana grupy nastaw w karcie K1 → karta i lista czytają status z backendu ponownie', async () => {
    const user = userEvent.setup();
    const model = migawkaSceny as unknown as EnergyNetworkModel;
    const ref = model.protection_assignments!.find((p) => p.grupy_nastaw.length > 0)!.ref_id;
    useSnapshotStore.setState({ snapshot: model, error: null } as never);
    const pusty = { case_id: 'K1', scenario_id: null, revision: null, hash: null, protection_groups: {}, protection_overrides: {} };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(
        JSON.stringify(init?.method === 'PUT' ? { ...pusty, ...JSON.parse(String(init.body)), revision: 1 } : pusty),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(<MenedzerPrzypadkow />);
      await user.click(screen.getByText('Stan normalny'));
      const select = await screen.findByTestId(`mvd-zabezpieczenia-przypadku-${ref}-grupa`);
      expect(api.getStudyCase).toHaveBeenCalledTimes(1);
      await user.selectOptions(select, '1');
      await user.click(screen.getByTestId('mvd-zabezpieczenia-przypadku-zapisz'));
      await screen.findByTestId('mvd-zabezpieczenia-przypadku-zapisano');
      await waitFor(() => expect(api.getStudyCase).toHaveBeenCalledTimes(2));
      expect(api.getStudyCase).toHaveBeenLastCalledWith('K1');
      expect(api.listStudyCases).toHaveBeenCalledWith('P-1');
      expect(api.getActiveStudyCase).toHaveBeenCalledWith('P-1');
      // Ciche odświeżenie: karta nie przechodzi w stan ładowania, sekcja zostaje z komunikatem.
      expect(screen.queryByTestId('mvd-karta-ladowanie')).toBeNull();
      expect(screen.getByTestId('mvd-zabezpieczenia-przypadku-zapisano')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
      useSnapshotStore.setState({ snapshot: null } as never);
    }
  });
});
