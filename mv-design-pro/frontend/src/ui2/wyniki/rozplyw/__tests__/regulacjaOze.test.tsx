/*
 * RegulacjaOze (karta W3-H, wariant B — zero fabrykacji): testy stanu zerowego
 * „ślad nie niesie Q per generator — decyzja właściciela OD-15" oraz dowód
 * „ekran nie fabrykuje" (DoD karty §2) — iloczyn cech {zawartość wyniku} x
 * {tryby DER, których wynik i tak nie niesie} musi dawać ZAWSZE ten sam,
 * statyczny komunikat, nigdy liczbę/tryb wyprowadzony z fixtury.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RegulacjaOze } from '../RegulacjaOze';
import { ROZPLYW_STRINGS } from '../strings';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { busResultFixture, powerFlowResultFixture, runHeaderFixture } from './fixtures';

function ustawWynik(over: Parameters<typeof powerFlowResultFixture>[0] = {}) {
  usePowerFlowResultsStore.getState().reset();
  usePowerFlowResultsStore.setState({
    results: powerFlowResultFixture(over),
    runHeader: runHeaderFixture(),
  });
}

describe('RegulacjaOze — brak przebiegu (karta E8.1, wzorzec 1:1 z TabelaSzyn/TabelaGalezi)', () => {
  it('bez wyniku w store: uczciwy stan „brak wyniku", bez wzmianki o OD-15', () => {
    usePowerFlowResultsStore.getState().reset();
    render(<RegulacjaOze />);
    expect(screen.getByText(ROZPLYW_STRINGS.brakWyniku)).toBeInTheDocument();
    expect(screen.getByText(ROZPLYW_STRINGS.brakWynikuOpis)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-rozplyw-regulacja-oze-niedostepne')).not.toBeInTheDocument();
  });
});

describe('RegulacjaOze — wynik obecny: stan zerowy zdolności (decyzja OD-15)', () => {
  it('pokazuje tytuł, opis i odesłanie do OD-15 (badanie karty W3-H)', () => {
    ustawWynik();
    render(<RegulacjaOze />);
    const panel = screen.getByTestId('mvd-rozplyw-regulacja-oze-niedostepne');
    expect(within(panel).getByText(ROZPLYW_STRINGS.regulacjaOzeTytul)).toBeInTheDocument();
    expect(within(panel).getByText(ROZPLYW_STRINGS.regulacjaOzeOpis)).toBeInTheDocument();
    const od15 = screen.getByTestId('mvd-rozplyw-regulacja-oze-od15');
    expect(od15).toHaveTextContent('OD-15');
    expect(od15).toHaveTextContent('właściciela');
  });

  it('NIE renderuje tabeli/wykresu — wyłącznie tekst stanu zerowego', () => {
    ustawWynik();
    render(<RegulacjaOze />);
    expect(screen.queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument(); // brak wykresu SVG
  });
});

describe('RegulacjaOze — dowod „nie fabrykuje" (DoD karty W3-H §2, iloczyn cech)', () => {
  /**
   * Iloczyn cech: fixtura {liczba szyn, wartości Q, napięcia} x {teoretyczne
   * tryby DER, których PowerFlowResultV1 i tak nigdy nie niesie}. Za KAŻDYM
   * razem panel MUSI wyrenderować DOKŁADNIE ten sam, statyczny tekst — gdyby
   * komponent czytał `wynik.bus_results` żeby zgadnąć tryb/Q/limit, treść
   * zmieniłaby się między przypadkami (to byłaby fabrykacja czyli dokładnie
   * defekt, przed którym broni wariant B).
   */
  const przypadki: Array<[string, Parameters<typeof powerFlowResultFixture>[0]]> = [
    ['jedna szyna, Q dodatnie duże', {
      bus_results: [busResultFixture({ bus_id: 'SZ-A', q_injected_mvar: 987.654 })],
    }],
    ['jedna szyna, Q ujemne (absorpcja)', {
      bus_results: [busResultFixture({ bus_id: 'SZ-A', q_injected_mvar: -12.3456 })],
    }],
    ['trzy szyny, napięcie poza pasmem (mogłoby sugerować Q(U) nasycone)', {
      bus_results: [
        busResultFixture({ bus_id: 'SZ-A', v_pu: 1.049, q_injected_mvar: 5.0 }),
        busResultFixture({ bus_id: 'SZ-B', v_pu: 0.951, q_injected_mvar: -5.0 }),
        busResultFixture({ bus_id: 'SZ-C', v_pu: 1.0, q_injected_mvar: 0.0 }),
      ],
    }],
    ['zero szyn (wynik zdegenerowany)', { bus_results: [] }],
  ];

  it.each(przypadki)('%s -> zawsze ten sam statyczny komunikat OD-15', (_opis, over) => {
    ustawWynik(over);
    render(<RegulacjaOze />);
    const panel = screen.getByTestId('mvd-rozplyw-regulacja-oze-niedostepne');
    expect(panel).toHaveTextContent(ROZPLYW_STRINGS.regulacjaOzeOpis);

    // Zero fabrykacji trybu: żadna z czterech nazw trybu solvera
    // (`InverterMode`, `power_flow_inverter.py`) nie ma prawa pojawić się w
    // DOM — komponent nie zgaduje trybu z liczb wyniku.
    for (const trybSolvera of ['Q_CONST', 'COSPHI_CONST', 'COSPHI_P', 'Q_U']) {
      expect(screen.queryByText(new RegExp(trybSolvera))).not.toBeInTheDocument();
    }

    // Zero fabrykacji liczby: wartości Q wstrzykniętego z fixtury (agregat
    // SZYNY, nie generatora) nie mają prawa być zaprezentowane w tym panelu
    // jako gdyby były „Q wstrzyknięte falownika" — panel nie ma ANI JEDNEJ
    // liczby (sprawdzone wprost: brak elementu z klasą liczby wzorca).
    expect(panel.querySelectorAll('.mvd-num').length).toBe(0);
  });

  it('treść panelu jest IDENTYCZNA między dwoma skrajnie różnymi wynikami (dowód wprost)', () => {
    ustawWynik({ bus_results: [busResultFixture({ q_injected_mvar: 1.0 })] });
    const { unmount } = render(<RegulacjaOze />);
    const tekstA = screen.getByTestId('mvd-rozplyw-regulacja-oze-niedostepne').textContent;
    unmount();

    ustawWynik({
      bus_results: [
        busResultFixture({ bus_id: 'INNY', v_pu: 1.2, q_injected_mvar: -999.9 }),
      ],
    });
    render(<RegulacjaOze />);
    const tekstB = screen.getByTestId('mvd-rozplyw-regulacja-oze-niedostepne').textContent;

    expect(tekstA).toBe(tekstB);
  });
});
