import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { EkranPorownania } from '../EkranPorownania';
import { POROWNANIE_STRINGS } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec';
import { useShellStore } from '../../../shell/useShellStore';
import {
  createPowerFlowComparison,
  fetchPowerFlowRuns,
} from '../../../../ui/power-flow-comparison/api';
import { useStudyCasesStore } from '../../../../ui/study-cases/store';
import type { StudyCaseListItem } from '../../../../ui/study-cases/types';
import { comparisonFixture, runsFixture } from './fixtures';

function przypadekFixture(over: Partial<StudyCaseListItem> = {}): StudyCaseListItem {
  return {
    id: 'case-1',
    name: 'Wariant letni',
    description: '',
    result_status: 'FRESH',
    results_valid: true,
    is_active: false,
    updated_at: '2026-07-10T08:00:00Z',
    ...over,
  };
}

vi.mock('../../../../ui/power-flow-comparison/api', () => ({
  fetchPowerFlowRuns: vi.fn(),
  createPowerFlowComparison: vi.fn(),
}));

const mockFetch = vi.mocked(fetchPowerFlowRuns);
const mockCompare = vi.mocked(createPowerFlowComparison);

function props(over: Partial<Parameters<typeof EkranPorownania>[0]> = {}) {
  return { projektId: 'proj-1', trybZaawansowania: 'basic' as const, ...over };
}

beforeEach(() => {
  mockFetch.mockResolvedValue(runsFixture());
  mockCompare.mockResolvedValue(comparisonFixture());
  // Izolacja: store przypadków czytany read-only przez ekran — pusty domyślnie.
  useStudyCasesStore.setState({ cases: [] });
  // Izolacja deep-linku dowodu (R3-C): żadne żądanie nie zalega między testami.
  useShellStore.setState({ wynikiTab: null, wynikiTabElement: null });
});

afterEach(() => {
  useStudyCasesStore.setState({ cases: [] });
  useShellStore.setState({ wynikiTab: null, wynikiTabElement: null });
  vi.clearAllMocks();
});

/** Wybiera A=run-a, B=run-b i wyzwala porównanie; zwraca po wyrenderowaniu wyniku. */
async function wykonajPorownanie() {
  const selA = await screen.findByTestId('mvd-por-select-a');
  const selB = await screen.findByTestId('mvd-por-select-b');
  fireEvent.change(selA, { target: { value: 'run-a' } });
  fireEvent.change(selB, { target: { value: 'run-b' } });
  fireEvent.click(screen.getByTestId('mvd-por-przycisk'));
  await screen.findByTestId('mvd-por-wynik');
}

describe('EkranPorownania — lista przebiegów i stany', () => {
  it('brak przebiegów → uczciwy komunikat zamiast selektorów', async () => {
    mockFetch.mockResolvedValue([]);
    render(<EkranPorownania {...props()} />);
    expect(await screen.findByTestId('mvd-por-brak-przebiegow')).toBeInTheDocument();
    expect(screen.getByText(POROWNANIE_STRINGS.brakPrzebiegow)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-por-select-a')).not.toBeInTheDocument();
  });

  it('błąd wczytywania listy → komunikat błędu', async () => {
    mockFetch.mockRejectedValue(new Error('sieć padła'));
    render(<EkranPorownania {...props()} />);
    expect(await screen.findByTestId('mvd-por-lista-blad')).toHaveTextContent('sieć padła');
  });

  it('selektory renderują przebiegi po polsku (data + zbieżność)', async () => {
    render(<EkranPorownania {...props()} />);
    const selA = await screen.findByTestId('mvd-por-select-a');
    expect(within(selA).getByRole('option', { name: /Rozpływ mocy · 2026-07-10 08:15 · Zbieżny/ })).toBeInTheDocument();
    expect(within(selA).getByRole('option', { name: /Niezbieżny/ })).toBeInTheDocument();
  });

  it('etykieta przebiegu pokazuje nazwę przypadku ze store’u (gdy znana)', async () => {
    useStudyCasesStore.setState({ cases: [przypadekFixture()] });
    render(<EkranPorownania {...props()} />);
    const selA = await screen.findByTestId('mvd-por-select-a');
    expect(
      within(selA).getByRole('option', { name: /2026-07-10 08:15 · Wariant letni · Zbieżny/ }),
    ).toBeInTheDocument();
  });

  it('brak przypadku w store’u → dzisiejsza etykieta (zero zgadywania)', async () => {
    render(<EkranPorownania {...props()} />);
    const selA = await screen.findByTestId('mvd-por-select-a');
    expect(
      within(selA).getByRole('option', { name: /Rozpływ mocy · 2026-07-10 08:15 · Zbieżny/ }),
    ).toBeInTheDocument();
    expect(within(selA).queryByRole('option', { name: /Wariant letni/ })).not.toBeInTheDocument();
  });

  it('etykieta przebiegu ujawnia identyfikatory tylko w trybie eksperckim', async () => {
    const { rerender } = render(<EkranPorownania {...props({ trybZaawansowania: 'basic' })} />);
    let selA = await screen.findByTestId('mvd-por-select-a');
    expect(within(selA).queryByRole('option', { name: /run-a/ })).not.toBeInTheDocument();
    rerender(<EkranPorownania {...props({ trybZaawansowania: 'expert' })} />);
    selA = await screen.findByTestId('mvd-por-select-a');
    expect(within(selA).getByRole('option', { name: /run-a/ })).toBeInTheDocument();
  });
});

describe('EkranPorownania — jawne uruchomienie porównania (zero automatyzmu)', () => {
  it('przycisk zablokowany bez wyboru A i B', async () => {
    render(<EkranPorownania {...props()} />);
    await screen.findByTestId('mvd-por-select-a');
    expect(screen.getByTestId('mvd-por-przycisk')).toBeDisabled();
  });

  it('nie woła backendu, dopóki nie klikniemy „Porównaj przebiegi"', async () => {
    render(<EkranPorownania {...props()} />);
    const selA = await screen.findByTestId('mvd-por-select-a');
    fireEvent.change(selA, { target: { value: 'run-a' } });
    fireEvent.change(screen.getByTestId('mvd-por-select-b'), { target: { value: 'run-b' } });
    expect(mockCompare).not.toHaveBeenCalled();
  });

  it('ten sam przebieg A i B → walidacja „muszą być różne"', async () => {
    render(<EkranPorownania {...props()} />);
    const selA = await screen.findByTestId('mvd-por-select-a');
    fireEvent.change(selA, { target: { value: 'run-a' } });
    fireEvent.change(screen.getByTestId('mvd-por-select-b'), { target: { value: 'run-a' } });
    fireEvent.click(screen.getByTestId('mvd-por-przycisk'));
    expect(screen.getByTestId('mvd-por-blad')).toHaveTextContent(POROWNANIE_STRINGS.walidacjaTeSame);
    expect(mockCompare).not.toHaveBeenCalled();
  });

  it('klik uruchamia backend z wybranymi przebiegami A i B', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    expect(mockCompare).toHaveBeenCalledWith('run-a', 'run-b');
  });

  it('błąd backendu → uczciwy komunikat błędu porównania', async () => {
    mockCompare.mockRejectedValue(new Error('niezgodne przebiegi'));
    render(<EkranPorownania {...props()} />);
    const selA = await screen.findByTestId('mvd-por-select-a');
    fireEvent.change(selA, { target: { value: 'run-a' } });
    fireEvent.change(screen.getByTestId('mvd-por-select-b'), { target: { value: 'run-b' } });
    fireEvent.click(screen.getByTestId('mvd-por-przycisk'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-por-blad')).toHaveTextContent('niezgodne przebiegi'),
    );
    expect(screen.queryByTestId('mvd-por-wynik')).not.toBeInTheDocument();
  });
});

describe('EkranPorownania — prezentacja wyniku backendu', () => {
  it('podsumowanie jako założenia: zbieżność, straty A/B/Δ, liczby problemów', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    const zal = screen.getByTestId('mvd-wyn-zalozenia');
    expect(within(zal).getByText(POROWNANIE_STRINGS.podsumZbieznosc)).toBeInTheDocument();
    expect(within(zal).getByText(/0,200 · 0,300 · Δ \+0,100/)).toBeInTheDocument();
    expect(within(zal).getByText('1 · 0 · 1 · 0')).toBeInTheDocument();
  });

  it('zakładka Szyny: wiersz per szyna z napięciami A/B/Δ', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(2);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('1,0200')).toBeInTheDocument();
    expect(tabela.getByText('-0,0550')).toBeInTheDocument();
  });

  it('delta z tagiem „poza zakresem" na szynie z wagą krytyczną', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    expect(screen.getAllByTestId('mvd-wyn-tag-ostrzezenie').length).toBeGreaterThanOrEqual(1);
  });

  it('zakładka Gałęzie: straty i moc gałęzi A/B/Δ', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-por-tab-galezie'));
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('LINIA-GPZ-ST1')).toBeInTheDocument();
    expect(tabela.getByText('+0,700')).toBeInTheDocument();
  });

  it('zakładka Ranking: problemy z wagą PL i rodzajem PL', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-por-tab-ranking'));
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('Krytyczny')).toBeInTheDocument();
    expect(tabela.getByText('Duża zmiana napięcia')).toBeInTheDocument();
  });

  it('wybór wiersza rankingu → szczegół problemu (opis PL)', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-por-tab-ranking'));
    expect(screen.getByText(POROWNANIE_STRINGS.szczegolWybierz)).toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[0]);
    const szczegol = within(screen.getByTestId('mvd-por-szczegol'));
    expect(
      szczegol.getByText('Napięcie na szynie GPZ spadło o ponad 5% względem wariantu A.'),
    ).toBeInTheDocument();
  });

  it('pusty ranking → uczciwy komunikat „bez problemów"', async () => {
    mockCompare.mockResolvedValue(comparisonFixture({ ranking: [] }));
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-por-tab-ranking'));
    expect(screen.getByTestId('mvd-por-ranking-puste')).toHaveTextContent(
      POROWNANIE_STRINGS.brakRankingu,
    );
  });

  it('identyfikator porównania widoczny wyłącznie w trybie eksperckim', async () => {
    const { rerender } = render(<EkranPorownania {...props({ trybZaawansowania: 'basic' })} />);
    await wykonajPorownanie();
    expect(screen.queryByTestId('mvd-por-id')).not.toBeInTheDocument();
    rerender(<EkranPorownania {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByTestId('mvd-por-id')).toHaveTextContent('cmp-001');
  });
});

describe('EkranPorownania — dowody kolumn A/B (R3-C)', () => {
  /** Przyciski dowodu pierwszego wiersza szyn: [vA, vB, katA, katB] (kolejność kolumn). */
  function przyciskiPierwszegoWiersza() {
    const wiersz = screen.getAllByTestId('mvd-wyn-wiersz')[0];
    return within(wiersz).getAllByRole('button', { name: WZORZEC_STRINGS.pokazDowod });
  }

  it('2×klik na wartości kolumny A → deep-link dowodu z przebiegiem A (run_a_id z wyniku)', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.doubleClick(przyciskiPierwszegoWiersza()[0]); // vA
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-a');
  });

  it('2×klik na wartości kolumny B → deep-link dowodu z przebiegiem B (run_b_id z wyniku)', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.doubleClick(przyciskiPierwszegoWiersza()[1]); // vB
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-b');
  });

  it('kolumny Δ bez akcji dowodu (różnica nie ma pojedynczego wywodu WHITE BOX)', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    // W wierszu tylko 4 przyciski (vA, vB, katA, katB) — delty nie są przyciskami.
    expect(przyciskiPierwszegoWiersza()).toHaveLength(4);
    expect(screen.getByText('-0,0550').closest('button')).toBeNull();
  });

  it('zakładka Gałęzie: wartości A/B również otwierają dowód właściwego przebiegu', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-por-tab-galezie'));
    const wiersz = screen.getAllByTestId('mvd-wyn-wiersz')[0];
    // Kolejność kolumn: [stratyA, stratyB, mocA, mocB].
    const przyciski = within(wiersz).getAllByRole('button', { name: WZORZEC_STRINGS.pokazDowod });
    expect(przyciski).toHaveLength(4);
    fireEvent.doubleClick(przyciski[1]); // stratyB
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-b');
  });

  it('zakładka Ranking bez przycisków dowodu (problem nie jest wartością jednego przebiegu)', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-por-tab-ranking'));
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.queryAllByRole('button', { name: WZORZEC_STRINGS.pokazDowod })).toHaveLength(0);
  });
});
