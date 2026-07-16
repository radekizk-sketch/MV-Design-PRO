import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { TabelaGalezi } from '../TabelaGalezi';
import { ROZPLYW_STRINGS } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { powerFlowResultFixture, runHeaderFixture } from './fixtures';

function props(over: Partial<Parameters<typeof TabelaGalezi>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  usePowerFlowResultsStore.getState().reset();
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
