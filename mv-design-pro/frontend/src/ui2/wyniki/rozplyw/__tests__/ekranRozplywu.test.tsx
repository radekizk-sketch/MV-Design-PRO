import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EkranRozplywu } from '../EkranRozplywu';
import { ROZPLYW_STRINGS } from '../strings';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { powerFlowResultFixture, runHeaderFixture } from './fixtures';

function props(over: Partial<Parameters<typeof EkranRozplywu>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  usePowerFlowResultsStore.getState().reset();
  usePowerFlowResultsStore.setState({
    results: powerFlowResultFixture(),
    runHeader: runHeaderFixture(),
  });
});

describe('EkranRozplywu — kompozycja podzakładek Szyny/Gałęzie (karta E8.3)', () => {
  it('domyślna podzakładka: Szyny (tabela szyn widoczna od razu)', () => {
    render(<EkranRozplywu {...props()} />);
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-rozplyw-galezie')).not.toBeInTheDocument();
    expect(screen.getByText(ROZPLYW_STRINGS.analiza)).toBeInTheDocument();
  });

  it('przełączenie na podzakładkę Gałęzie klikiem pokazuje TabelaGalezi', () => {
    render(<EkranRozplywu {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-rozplyw-podzakladka-galezie'));
    expect(screen.getByTestId('mvd-rozplyw-galezie')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-rozplyw-szyny')).not.toBeInTheDocument();
    expect(screen.getByText(ROZPLYW_STRINGS.analizaGalezie)).toBeInTheDocument();
  });

  it('roving tabindex: aktywna podzakładka ma tabIndex 0, nieaktywna -1', () => {
    render(<EkranRozplywu {...props()} />);
    const szyny = screen.getByTestId('mvd-rozplyw-podzakladka-szyny');
    const galezie = screen.getByTestId('mvd-rozplyw-podzakladka-galezie');
    expect(szyny).toHaveAttribute('tabindex', '0');
    expect(galezie).toHaveAttribute('tabindex', '-1');
    expect(szyny).toHaveAttribute('aria-selected', 'true');
    expect(galezie).toHaveAttribute('aria-selected', 'false');
  });

  it('strzałka klawiatury przełącza podzakładkę (roving tabindex)', () => {
    render(<EkranRozplywu {...props()} />);
    fireEvent.keyDown(screen.getByTestId('mvd-rozplyw-podzakladka-szyny'), { key: 'ArrowRight' });
    expect(screen.getByTestId('mvd-rozplyw-galezie')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('mvd-rozplyw-podzakladka-galezie'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
  });

  it('onOtworzDowod przekazany do aktywnej podzakładki', () => {
    const onOtworzDowod = vi.fn();
    render(<EkranRozplywu {...props({ onOtworzDowod })} />);
    fireEvent.click(screen.getByTestId('mvd-rozplyw-podzakladka-galezie'));
    expect(screen.getByTestId('mvd-rozplyw-galezie')).toBeInTheDocument();
  });

  it('rola tablist z etykietą dostępności (aria-label)', () => {
    render(<EkranRozplywu {...props()} />);
    expect(screen.getByRole('tablist', { name: ROZPLYW_STRINGS.ariaPodzakladki })).toBeInTheDocument();
  });
});
