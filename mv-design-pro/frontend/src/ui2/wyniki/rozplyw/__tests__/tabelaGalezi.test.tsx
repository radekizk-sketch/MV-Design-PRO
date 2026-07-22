import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';

// R3-A: klient walidacji energetycznej mockowany na granicy modułu (reuse
// `jakosc/api.ts` — mock TYLKO transportu GET; mapowanie i werdykt testowane
// na realnych kształtach odpowiedzi backendu z fixtur).
vi.mock('../../jakosc/api', () => ({
  fetchWalidacjaEnergetyczna: vi.fn(),
}));

import { TabelaGalezi } from '../TabelaGalezi';
import { ROZPLYW_STRINGS } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec';
import { fetchWalidacjaEnergetyczna } from '../../jakosc/api';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { useSelectionStore } from '../../../../ui/selection/store';
import { useShellStore } from '../../../shell/useShellStore';
import {
  branchResultFixture,
  powerFlowResultFixture,
  runHeaderFixture,
  walidacjaItemFixture,
  walidacjaResponseFixture,
} from './fixtures';

const mockedWalidacja = vi.mocked(fetchWalidacjaEnergetyczna);

function props(over: Partial<Parameters<typeof TabelaGalezi>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  usePowerFlowResultsStore.getState().reset();
  // Realne store'y pętli decyzji (jak `wzorzec/__tests__/usePoprawWModelu.test.tsx`).
  useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
  useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
  // Domyślnie: walidacja NIEDOSTĘPNA (odrzucenie) — tabela działa jak przed
  // kartą R3-A; testy werdyktu nadpisują na odpowiedź z fixtury.
  mockedWalidacja.mockReset();
  mockedWalidacja.mockRejectedValue(new Error('walidacja niedostępna'));
});

function ustawWynik(over: Parameters<typeof powerFlowResultFixture>[0] = {}) {
  usePowerFlowResultsStore.setState({
    results: powerFlowResultFixture(over),
    runHeader: runHeaderFixture(),
  });
}

describe('TabelaGalezi — stan pusty (brak wyniku w store)', () => {
  it('bez wyniku: komunikat PL zamiast tabeli', () => {
    render(<TabelaGalezi {...props()} />);
    expect(screen.getByText(ROZPLYW_STRINGS.brakWyniku)).toBeInTheDocument();
    expect(screen.getByText(ROZPLYW_STRINGS.brakWynikuOpis)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
  });
});

describe('TabelaGalezi — konkretyzacja wzorca na realnym kształcie danych', () => {
  beforeEach(() => ustawWynik());

  it('nagłówek: nazwa analizy PL (gałęzie)', () => {
    render(<TabelaGalezi {...props()} />);
    expect(screen.getByText(ROZPLYW_STRINGS.analizaGalezie)).toBeInTheDocument();
  });

  it('założenia: reużyte z tabeli szyn (moc bazowa, szyna bilansująca)', () => {
    render(<TabelaGalezi {...props()} />);
    const zalozenia = screen.getByTestId('mvd-wyn-zalozenia');
    expect(within(zalozenia).getByText(ROZPLYW_STRINGS.zalMocBazowa)).toBeInTheDocument();
    expect(within(zalozenia).getByText('SZ-GPZ')).toBeInTheDocument();
  });

  it('tabela: wiersz per gałąź, branch_id jako oznaczenie w kolumnie głównej', () => {
    render(<TabelaGalezi {...props()} />);
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(2);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('L-1')).toBeInTheDocument();
    expect(tabela.getByText('L-2')).toBeInTheDocument();
  });

  it('kolumny niosą jednostki w nagłówku (MW/Mvar/kW/kvar)', () => {
    render(<TabelaGalezi {...props()} />);
    const thPPoczatek = screen.getByTestId('mvd-wyn-th-pPoczatek');
    expect(within(thPPoczatek).getByText(`[${ROZPLYW_STRINGS.jednMW}]`)).toBeInTheDocument();
    const thStratyP = screen.getByTestId('mvd-wyn-th-stratyP');
    expect(within(thStratyP).getByText(`[${ROZPLYW_STRINGS.jednKW}]`)).toBeInTheDocument();
    const thStratyQ = screen.getByTestId('mvd-wyn-th-stratyQ');
    expect(within(thStratyQ).getByText(`[${ROZPLYW_STRINGS.jednKvar}]`)).toBeInTheDocument();
  });

  it('sortowanie po kolumnie liczbowej (straty P) przez klik nagłówka', () => {
    render(<TabelaGalezi {...props()} />);
    const thStratyP = screen.getByTestId('mvd-wyn-th-stratyP');
    fireEvent.click(within(thStratyP).getByRole('button')); // rosnąco
    let wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(within(wiersze[0]).getByText('L-2')).toBeInTheDocument(); // 80,00 kW < 100,00 kW

    fireEvent.click(within(thStratyP).getByRole('button')); // malejąco
    wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(within(wiersze[0]).getByText('L-1')).toBeInTheDocument();
  });

  it('wiersz sumy strat pod tabelą: Σ P i Σ Q z gałęzi (arytmetyka prezentacji)', () => {
    render(<TabelaGalezi {...props()} />);
    const suma = screen.getByTestId('mvd-rozplyw-suma-strat');
    expect(within(suma).getByText(ROZPLYW_STRINGS.sumaStrat)).toBeInTheDocument();
    // 0,1 MW + 0,08 MW = 180,00 kW; 0,1 Mvar + 0,04 Mvar = 140,00 kvar
    expect(within(screen.getByTestId('mvd-rozplyw-suma-p')).getByText('180,00')).toBeInTheDocument();
    expect(within(screen.getByTestId('mvd-rozplyw-suma-q')).getByText('140,00')).toBeInTheDocument();
  });

  it('identyfikator przebiegu tylko w trybie eksperckim (§2.7)', () => {
    const { rerender } = render(<TabelaGalezi {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-wyn-run-id')).not.toBeInTheDocument();
    rerender(<TabelaGalezi {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByTestId('mvd-wyn-run-id')).toHaveTextContent('pf-run-1');
  });

  it('onEksport przekazany do stopki wzorca', () => {
    const onEksport = vi.fn();
    render(<TabelaGalezi {...props({ onEksport })} />);
    screen.getByRole('button', { name: WZORZEC_STRINGS.eksport }).click();
    expect(onEksport).toHaveBeenCalledTimes(1);
  });
});

describe('TabelaGalezi — stan pusty uczciwy (wynik obecny, brak gałęzi)', () => {
  it('wynik bez gałęzi: komunikat wzorca "Brak wyników", bez wiersza sumy', () => {
    ustawWynik({ branch_results: [] });
    render(<TabelaGalezi {...props()} />);
    expect(screen.getByText(WZORZEC_STRINGS.brakWynikow)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-rozplyw-suma-strat')).not.toBeInTheDocument();
  });
});

describe('TabelaGalezi — werdykt obciążalności z walidacji energetycznej (R3-A / K1-G2)', () => {
  beforeEach(() => ustawWynik());

  it('pobiera walidację energetyczną dla przebiegu z nagłówka (run_id z store)', async () => {
    mockedWalidacja.mockResolvedValue(walidacjaResponseFixture());
    render(<TabelaGalezi {...props()} />);
    await screen.findByText('92,0');
    expect(mockedWalidacja).toHaveBeenCalledWith('pf-run-1');
  });

  it('kolumna „Obciążenie [%]": wartość PL z fixtury backendu + tag przekroczenia na WARNING', async () => {
    mockedWalidacja.mockResolvedValue(walidacjaResponseFixture());
    render(<TabelaGalezi {...props()} />);
    // Nagłówek kolumny z jednostką (jednostki zawsze).
    const th = screen.getByTestId('mvd-wyn-th-obciazenie');
    expect(within(th).getByText(ROZPLYW_STRINGS.kolObciazenie)).toBeInTheDocument();
    expect(within(th).getByText(`[${ROZPLYW_STRINGS.jednProcent}]`)).toBeInTheDocument();
    // Wartości z odpowiedzi backendu (L-1 WARNING 92%, L-2 PASS 65%).
    expect(await screen.findByText('92,0')).toBeInTheDocument();
    expect(screen.getByText('65,0')).toBeInTheDocument();
    // Tag ostrzeżenia WYŁĄCZNIE na wierszu z werdyktem backendu (L-1).
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    const wierszL1 = wiersze.find((w) => within(w).queryByText('L-1') !== null)!;
    const wierszL2 = wiersze.find((w) => within(w).queryByText('L-2') !== null)!;
    expect(within(wierszL1).getByTestId('mvd-wyn-tag-ostrzezenie')).toBeInTheDocument();
    expect(within(wierszL2).queryByTestId('mvd-wyn-tag-ostrzezenie')).not.toBeInTheDocument();
  });

  it('sortowanie po kolumnie obciążenia jest liczbowe (sortKey), mimo formatu PL', async () => {
    mockedWalidacja.mockResolvedValue(walidacjaResponseFixture());
    render(<TabelaGalezi {...props()} />);
    await screen.findByText('92,0');
    const th = screen.getByTestId('mvd-wyn-th-obciazenie');
    fireEvent.click(within(th).getByRole('button')); // rosnąco
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(within(wiersze[0]).getByText('L-2')).toBeInTheDocument(); // 65,0 < 92,0
  });

  it('brak odpowiedzi walidacji → komórki „—", bez werdyktu i bez przycisku decyzji', async () => {
    // Domyślny mock z beforeEach: odrzucenie (walidacja niedostępna).
    render(<TabelaGalezi {...props()} />);
    await waitFor(() => expect(mockedWalidacja).toHaveBeenCalledTimes(1));
    // Obie gałęzie: kreska w kolumnie obciążenia (uczciwie, bez zgadywania).
    expect(screen.getAllByText(ROZPLYW_STRINGS.kreska)).toHaveLength(2);
    expect(screen.queryByTestId('mvd-wyn-popraw')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-tag-ostrzezenie')).not.toBeInTheDocument();
  });

  it('klik „Popraw w modelu" na przeciążonej gałęzi → selekcja LineBranch + przestrzeń „Schemat" (realne store\'y)', async () => {
    mockedWalidacja.mockResolvedValue(walidacjaResponseFixture());
    render(<TabelaGalezi {...props()} />);
    await screen.findByText('92,0');
    // Przycisk decyzji WYŁĄCZNIE na wierszu z werdyktem backendu (L-1 WARNING).
    const przyciski = screen.getAllByTestId('mvd-wyn-popraw');
    expect(przyciski).toHaveLength(1);
    expect(przyciski[0]).toHaveTextContent(WZORZEC_STRINGS.poprawWModelu);
    fireEvent.click(przyciski[0]);
    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toMatchObject({ id: 'L-1', type: 'LineBranch', name: 'L-1' });
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });

  it('pozycja TRANSFORMER_LOADING → klik „Popraw" zaznacza TransformerBranch (rodzaj obciazalnosc-transformatora)', async () => {
    ustawWynik({ branch_results: [branchResultFixture({ branch_id: 'T-1' })] });
    mockedWalidacja.mockResolvedValue(
      walidacjaResponseFixture([
        walidacjaItemFixture({
          check_type: 'TRANSFORMER_LOADING',
          target_id: 'T-1',
          target_name: 'Transformator T-1',
          observed_value: 104.0,
          status: 'FAIL',
          why_pl: 'Obciążenie transformatora 104% — powyżej progu przekroczenia 100%.',
        }),
      ]),
    );
    render(<TabelaGalezi {...props()} />);
    await screen.findByText('104,0');
    fireEvent.click(screen.getByTestId('mvd-wyn-popraw'));
    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toMatchObject({ id: 'T-1', type: 'TransformerBranch' });
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });
});
