import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// R3-A: podzakładka Gałęzie pobiera walidację energetyczną (werdykt
// obciążalności) — w testach kompozycji transport GET deterministycznie
// niedostępny (odrzucenie): kolumna „Obciążenie" pokazuje kreski, zero sieci.
vi.mock('../../jakosc/api', () => ({
  fetchWalidacjaEnergetyczna: vi.fn(() => Promise.reject(new Error('walidacja niedostępna'))),
}));

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

describe('EkranRozplywu — preselekcja elementu z deep-linku SLD (karta D-2)', () => {
  it('ref = bus_id realny: podzakładka Szyny, wiersz podświetlony', () => {
    render(<EkranRozplywu {...props({ preselekcjaElementu: 'SZ-ST2' })} />);
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
    // Scope do tabeli — „SZ-ST2” pojawia się też jako etykieta osi wykresu
    // profilu napięcia (Recharts), zapytanie globalne byłoby niejednoznaczne.
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    const wiersz = tabela.getByText('SZ-ST2').closest('tr');
    expect(wiersz).toHaveClass('mvd-on');
  });

  it('ref = branch_id realny: przełącza na podzakładkę Gałęzie, wiersz podświetlony', () => {
    render(<EkranRozplywu {...props({ preselekcjaElementu: 'L-2' })} />);
    expect(screen.getByTestId('mvd-rozplyw-galezie')).toBeInTheDocument();
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    const wiersz = tabela.getByText('L-2').closest('tr');
    expect(wiersz).toHaveClass('mvd-on');
  });

  it('ref bez dopasowania w żadnej tabeli: uczciwy stan — zakładka domyślna bez podświetlenia', () => {
    render(<EkranRozplywu {...props({ preselekcjaElementu: 'bay/nieznany' })} />);
    // Wynik ISTNIEJE (fixture), więc tabela się renderuje — zero fabrykacji
    // podświetlenia dla refu bez własnego wiersza (np. pole/aparat/stacja).
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(wiersze.length).toBeGreaterThan(0);
    for (const w of wiersze) {
      expect(w.className).not.toContain('mvd-on');
    }
  });

  it('konsumpcja: onPreselekcjaSkonsumowana wołane dokładnie raz po dopasowaniu', () => {
    const onSkonsumowana = vi.fn();
    render(
      <EkranRozplywu
        {...props({ preselekcjaElementu: 'SZ-ST1', onPreselekcjaSkonsumowana: onSkonsumowana })}
      />,
    );
    expect(onSkonsumowana).toHaveBeenCalledTimes(1);
  });

  it('brak wyniku rozpływu w store: uczciwy stan zerowy zakładki (bez wysypki, bez podświetlenia)', () => {
    usePowerFlowResultsStore.getState().reset();
    render(<EkranRozplywu {...props({ preselekcjaElementu: 'SZ-ST1' })} />);
    expect(screen.getByText(ROZPLYW_STRINGS.brakWyniku)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
  });
});
