/*
 * Test wykresu słupkowego mocy przyłączalnej (karta P2, kryterium 3). Sprawdza,
 * że kontener i tytuł renderują się dla danych ze słupków (Recharts, stałe
 * wymiary, animacja wyłączona — determinizm).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { WykresZdolnosciChart } from '../WykresZdolnosciChart';
import type { SlupekZdolnosci } from '../zdolnoscModel';

const slupki: SlupekZdolnosci[] = [
  { bus_ref: 'bus-a', etykieta: 'Szyna A', moc: 1.5 },
  { bus_ref: 'bus-b', etykieta: 'bus-b', moc: 20 },
];

describe('WykresZdolnosciChart', () => {
  it('renderuje kontener wykresu z tytułem', () => {
    render(<WykresZdolnosciChart slupki={slupki} />);
    expect(screen.getByTestId('mvd-zdol-wykres')).toBeInTheDocument();
    expect(screen.getByText('Maksymalna moc przyłączalna per węzeł')).toBeInTheDocument();
  });
});
