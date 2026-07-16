import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TabelaSzyn } from '../TabelaSzyn';
import { ROZPLYW_STRINGS } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { powerFlowResultFixture, runHeaderFixture } from './fixtures';

function props(over: Partial<Parameters<typeof TabelaSzyn>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  usePowerFlowResultsStore.getState().reset();
});

function ustawWynik() {
  usePowerFlowResultsStore.setState({
    results: powerFlowResultFixture(),
    runHeader: runHeaderFixture(),
  });
}

describe('TabelaSzyn — stan pusty (brak wyniku w store)', () => {
  it('bez wyniku: komunikat PL zamiast tabeli', () => {
    render(<TabelaSzyn {...props()} />);
    expect(screen.getByText(ROZPLYW_STRINGS.brakWyniku)).toBeInTheDocument();
    expect(screen.getByText(ROZPLYW_STRINGS.brakWynikuOpis)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
  });
});

describe('TabelaSzyn — konkretyzacja wzorca na realnym kształcie danych', () => {
  beforeEach(ustawWynik);

  it('nagłówek: nazwa analizy PL', () => {
    render(<TabelaSzyn {...props()} />);
    expect(screen.getByText(ROZPLYW_STRINGS.analiza)).toBeInTheDocument();
  });

  it('założenia: parametry przebiegu z wyniku (moc bazowa, szyna bilansująca)', () => {
    render(<TabelaSzyn {...props()} />);
    const zalozenia = screen.getByTestId('mvd-wyn-zalozenia');
    expect(within(zalozenia).getByText(ROZPLYW_STRINGS.zalMocBazowa)).toBeInTheDocument();
    expect(within(zalozenia).getByText('SZ-GPZ')).toBeInTheDocument();
    expect(within(zalozenia).getByText(ROZPLYW_STRINGS.zalZbieznosc)).toBeInTheDocument();
  });

  it('tabela: wiersz per szyna, napięcie sformatowane z jednostką w nagłówku', () => {
    render(<TabelaSzyn {...props()} />);
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(3);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('1,0000')).toBeInTheDocument();
    expect(tabela.getByText('0,9820')).toBeInTheDocument();
    const thNapiecie = screen.getByTestId('mvd-wyn-th-napiecie');
    expect(within(thNapiecie).getByText(`[${ROZPLYW_STRINGS.jednPU}]`)).toBeInTheDocument();
  });

  it('napięcie poza przedziałem ±5% Un → tag „Poza zakresem"', () => {
    render(<TabelaSzyn {...props()} />);
    const tagi = screen.getAllByTestId('mvd-wyn-tag-ostrzezenie');
    expect(tagi).toHaveLength(1); // tylko SZ-ST2 (0,941 p.u.)
    expect(tagi[0]).toHaveTextContent(WZORZEC_STRINGS.tagOstrzezenie);
  });

  it('wykres profilu napięcia obecny w slocie wykresu', () => {
    render(<TabelaSzyn {...props()} />);
    const slot = screen.getByTestId('mvd-wyn-wykres');
    expect(within(slot).getByTestId('mvd-rozplyw-wykres')).toBeInTheDocument();
    expect(within(slot).getByText(ROZPLYW_STRINGS.wykresTytul)).toBeInTheDocument();
  });

  it('identyfikator przebiegu tylko w trybie eksperckim (§2.7)', () => {
    const { rerender } = render(<TabelaSzyn {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-wyn-run-id')).not.toBeInTheDocument();
    rerender(<TabelaSzyn {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByTestId('mvd-wyn-run-id')).toHaveTextContent('pf-run-1');
  });

  it('onEksport przekazany do stopki wzorca', () => {
    const onEksport = vi.fn();
    render(<TabelaSzyn {...props({ onEksport })} />);
    screen.getByRole('button', { name: WZORZEC_STRINGS.eksport }).click();
    expect(onEksport).toHaveBeenCalledTimes(1);
  });
});
