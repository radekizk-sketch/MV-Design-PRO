/**
 * Testy Karty 6 "Strona nN i poziomy napięć" — w tym sekcji "Odbiory nN".
 *
 * Odbiory nN są wymagane dla:
 *   - Power Flow (rozpływ mocy) — P/Q per węzeł
 *   - VDROP (spadek napięcia)
 *
 * Karta nie może istnieć bez sekcji odbiorów, w przeciwnym razie obliczenia
 * rozpływu byłyby bezsensowne (brak danych wejściowych).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StationConfigNnSwitchgearCard } from '../StationConfigNnSwitchgearCard';
import type { LoadRow } from '../StationConfigLoadsCard';

const SAMPLE_LOAD_1: LoadRow = {
  loadId: 'load_001',
  name: 'Hala produkcyjna A',
  attachmentPointPl: 'Szyna nN A — pole 3',
  pMw: 0.250,
  qMvar: 0.080,
  cosPhi: 0.95,
  priority: 'I',
  statusForPf: 'gotowe',
  statusForVoltage: 'gotowe',
};

const SAMPLE_LOAD_2: LoadRow = {
  loadId: 'load_002',
  name: 'Oświetlenie + administracja',
  attachmentPointPl: 'Szyna nN A — pole 5',
  pMw: 0.045,
  qMvar: 0.012,
  cosPhi: 0.97,
  priority: 'III',
  statusForPf: 'częściowe',
  statusForVoltage: 'gotowe',
};

describe('StationConfigNnSwitchgearCard — Karta 6 "Strona nN i poziomy napięć"', () => {
  it('renderuje obie sekcje: rozdzielnice + odbiory nN', () => {
    render(<StationConfigNnSwitchgearCard switchgears={[]} loads={[]} />);
    expect(screen.getByTestId('station-config-nn-switchgear')).toBeInTheDocument();
    expect(screen.getByTestId('station-config-nn-loads-section')).toBeInTheDocument();
    expect(screen.getByText(/Odbiory nN — dane wejściowe rozpływu mocy/)).toBeInTheDocument();
  });

  it('renderuje listę odbiorów (P/Q/cos φ/kategoria) gdy są dane', () => {
    render(
      <StationConfigNnSwitchgearCard
        switchgears={[]}
        loads={[SAMPLE_LOAD_1, SAMPLE_LOAD_2]}
      />,
    );
    // Odbiory są renderowane przez StationConfigLoadsCard wewnątrz Karty 6.
    expect(screen.getByTestId('station-config-loads')).toBeInTheDocument();
    expect(screen.getByTestId('load-row-load_001')).toBeInTheDocument();
    expect(screen.getByTestId('load-row-load_002')).toBeInTheDocument();
    expect(screen.getByText('Hala produkcyjna A')).toBeInTheDocument();
    expect(screen.getByText('Oświetlenie + administracja')).toBeInTheDocument();
  });

  it('pokazuje "Brak odbiorów" gdy lista pusta — nie pokazuje 0,00', () => {
    render(<StationConfigNnSwitchgearCard switchgears={[]} loads={[]} />);
    const loadsSection = screen.getByTestId('station-config-nn-loads-section');
    // Empty state: "Brak odbiorów." (z LoadsCard)
    expect(loadsSection.textContent).toContain('Brak odbiorów');
    // Brak fałszywych zer
    expect(loadsSection.textContent).not.toContain('0,00');
  });

  it('domyślny prop `loads` to pusta tablica (backward-compat)', () => {
    // Bez przekazania loads — powinna się wyświetlić sekcja z empty state.
    render(<StationConfigNnSwitchgearCard switchgears={[]} />);
    expect(screen.getByTestId('station-config-nn-loads-section')).toBeInTheDocument();
  });

  it('etykieta wyjaśnia rolę odbiorów dla Power Flow + VDROP', () => {
    render(<StationConfigNnSwitchgearCard switchgears={[]} loads={[]} />);
    expect(screen.getByText(/Wymagane dla Power Flow \+ VDROP/)).toBeInTheDocument();
  });

  it('renderuje rozdzielnice z badge\'ami liczników odbiorów/PV/BESS', () => {
    const switchgears = [
      {
        designation: 'RNN-A',
        nnVoltageKv: 0.4,
        sectionsCount: 2,
        feedersCount: 8,
        loadsCount: 12,
        pvNnCount: 1,
        bessNnCount: 0,
        statusPl: 'kompletne' as const,
      },
    ];
    render(<StationConfigNnSwitchgearCard switchgears={switchgears} loads={[]} />);
    expect(screen.getByTestId('nn-switchgear-RNN-A')).toBeInTheDocument();
    expect(screen.getByText(/Odbiory:/)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});
