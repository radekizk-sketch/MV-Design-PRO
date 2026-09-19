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
import { useSelectionStore } from '../../../../ui/selection/store';
import type { StudyCaseListItem } from '../../../../ui/study-cases/types';
import { busDiffFixture, comparisonFixture, runsFixture } from './fixtures';

function przypadekFixture(over: Partial<StudyCaseListItem> = {}): StudyCaseListItem {
  return {
    id: 'case-1',
    name: 'Wariant letni',
    description: '',
    result_status: 'FRESH',
    results_valid: true,
    result_status_reason: 'model-niezmieniony',
    result_status_reason_pl: 'Model nie zmienił się od chwili obliczenia.',
    rewizja_biegu: 4,
    rewizja_biezaca: 4,
    zmiany_od_biegu: [],
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
    expect(within(selA).getByRole('option', { name: /Rozpływ mocy · rew\. 1 · snap-a · 2026-07-10 08:15 · Zbieżny/ })).toBeInTheDocument();
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
      within(selA).getByRole('option', { name: /Rozpływ mocy · rew\. 1 · snap-a · 2026-07-10 08:15 · Zbieżny/ }),
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

  it('L-13: kolumna Δ% z wartością backendu (szyny i gałęzie)', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    const szyny = within(screen.getByTestId('mvd-wyn-tabela'));
    // Dwie kolumny względne w tabeli szyn (napięcie, kąt) — jednostka w nagłówku.
    expect(szyny.getAllByText(`[${POROWNANIE_STRINGS.jednProcent}]`)).toHaveLength(2);
    // Wartość z payloadu (`delta_v_percent`), nie liczona w prezentacji
    // (obie szyny fixture'u niosą tę samą różnicę względną).
    expect(szyny.getAllByText('-5,39').length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByTestId('mvd-por-tab-galezie'));
    const galezie = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(galezie.getByText('+50,00')).toBeInTheDocument();
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

  // B1/B5 (karta CV-3.3-B): dowód CO było porównywane — proweniencja obu
  // biegów R1 (rodzaj, status, rewizja, odciski), wyłącznie tryb ekspercki
  // (te same surowe identyfikatory techniczne co `comparison_id` powyżej).
  it('proweniencja biegów A/B widoczna wyłącznie w trybie eksperckim', async () => {
    const { rerender } = render(<EkranPorownania {...props({ trybZaawansowania: 'basic' })} />);
    await wykonajPorownanie();
    expect(screen.queryByTestId('mvd-por-proweniencja')).not.toBeInTheDocument();

    rerender(<EkranPorownania {...props({ trybZaawansowania: 'expert' })} />);
    const panele = screen.getAllByTestId('mvd-por-proweniencja-panel');
    expect(panele).toHaveLength(2);
    expect(panele[0]).toHaveTextContent(POROWNANIE_STRINGS.proweniencjaA);
    expect(panele[0]).toHaveTextContent('snap-a');
    expect(panele[0]).toHaveTextContent('rew. 1');
    expect(panele[1]).toHaveTextContent(POROWNANIE_STRINGS.proweniencjaB);
    expect(panele[1]).toHaveTextContent('snap-b');
    expect(panele[1]).toHaveTextContent('rew. 2');
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
    // W wierszu przyciski TYLKO na kolumnach źródłowych A/B
    // (vA, vB, katA, katB, qA, qB — moc bierna dołożona w KD-1/L-12);
    // kolumny Δ nie są przyciskami. Intencja bez zmian: różnica nie ma
    // pojedynczego wywodu WHITE BOX, więc nie otwiera dowodu.
    expect(przyciskiPierwszegoWiersza()).toHaveLength(6);
    expect(screen.getByText('-0,0550').closest('button')).toBeNull();
  });

  it('zakładka Gałęzie: wartości A/B również otwierają dowód właściwego przebiegu', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-por-tab-galezie'));
    const wiersz = screen.getAllByTestId('mvd-wyn-wiersz')[0];
    // Kolejność kolumn źródłowych: [stratyA, stratyB, mocA, mocB, qA, qB]
    // (dwie ostatnie = moc bierna gałęzi dołożona w KD-1/L-12).
    const przyciski = within(wiersz).getAllByRole('button', { name: WZORZEC_STRINGS.pokazDowod });
    expect(przyciski).toHaveLength(6);
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

describe('EkranPorownania — wskazanie elementu (F-K4, znalezisko Z4)', () => {
  it('szyna z istotną różnicą prowadzi do elementu w modelu (akcja inspekcyjna)', async () => {
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
    useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();

    const przyciski = screen.getAllByTestId('mvd-wyn-popraw');
    expect(przyciski.length).toBeGreaterThanOrEqual(1);
    // Różnica między wariantami nie jest naruszeniem kryterium — etykieta inspekcyjna.
    expect(przyciski[0]).toHaveTextContent('Pokaż na schemacie');

    fireEvent.click(przyciski[0]);
    expect(useSelectionStore.getState().selectedElement?.type).toBe('Bus');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });

  it('gałąź z wagą PONIŻEJ progu istotności nie dostaje wskazania (nie sugerujemy bez sygnału)', async () => {
    // Fixtura: problem gałęzi LINIA-GPZ-ST1 ma wagę 3, próg tagu istotności to 4,
    // więc wiersz gałęzi NIE jest oflagowany — i akcji być nie może.
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-por-tab-galezie'));

    expect(screen.queryByTestId('mvd-wyn-popraw')).toBeNull();
  });

  it('gałąź z wagą krytyczną: wskazanie prowadzi do GAŁĘZI w modelu (typ LineBranch)', async () => {
    const bazowy = comparisonFixture();
    mockCompare.mockResolvedValue(
      comparisonFixture({
        // Podnosimy wagę problemu gałęzi do krytycznej — wtedy wiersz jest oflagowany
        // jako istotna różnica i wskazanie ma sens (poniżej progu go nie ma).
        ranking: bazowy.ranking.map((pr) =>
          pr.element_ref === 'LINIA-GPZ-ST1' ? { ...pr, severity: 5 } : pr,
        ),
      }),
    );
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
    useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-por-tab-galezie'));

    fireEvent.click(screen.getAllByTestId('mvd-wyn-popraw')[0]);
    expect(useSelectionStore.getState().selectedElement).toEqual({
      id: 'LINIA-GPZ-ST1',
      type: 'LineBranch',
      name: 'LINIA-GPZ-ST1',
    });
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });
});

describe('EkranPorownania — filtr „pokaż tylko różnice" (KD-1 / L-14)', () => {
  it('domyślnie pokazuje wszystkie wiersze, po zaznaczeniu ukrywa wiersze bez różnic', async () => {
    mockCompare.mockResolvedValue(
      comparisonFixture({
        bus_diffs: [
          busDiffFixture({ bus_id: 'SZYNA-ROZNA' }),
          busDiffFixture({
            bus_id: 'SZYNA-IDENTYCZNA',
            delta_v_pu: 0,
            delta_angle_deg: 0,
            delta_p_mw: 0,
            delta_q_mvar: 0,
          }),
        ],
      }),
    );
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();

    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('mvd-por-filtr-roznice'));

    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0]).toHaveTextContent('SZYNA-ROZNA');
  });

  it('brak jakichkolwiek różnic → uczciwy stan zerowy filtru (nie „brak danych")', async () => {
    mockCompare.mockResolvedValue(
      comparisonFixture({
        bus_diffs: [
          busDiffFixture({
            bus_id: 'SZYNA-IDENTYCZNA',
            delta_v_pu: 0,
            delta_angle_deg: 0,
            delta_p_mw: 0,
            delta_q_mvar: 0,
          }),
        ],
      }),
    );
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-por-filtr-roznice'));

    expect(screen.getByTestId('mvd-por-szyny-puste')).toHaveTextContent(
      POROWNANIE_STRINGS.filtrPusto,
    );
  });

  it('zakładka Ranking nie ma filtru różnic (ranking to problemy, nie wiersze A/B)', async () => {
    render(<EkranPorownania {...props()} />);
    await wykonajPorownanie();
    expect(screen.getByTestId('mvd-por-filtr')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mvd-por-tab-ranking'));
    expect(screen.queryByTestId('mvd-por-filtr')).toBeNull();
  });
});
