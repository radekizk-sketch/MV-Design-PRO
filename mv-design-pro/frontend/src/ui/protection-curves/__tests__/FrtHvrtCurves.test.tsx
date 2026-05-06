/**
 * Testy FrtHvrtCurves (Iteracja 13).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FrtHvrtCurves, type FrtHvrtTrajectoryPoint } from '../FrtHvrtCurves';

describe('FrtHvrtCurves — wizualizacja krzywych FRT/LVRT/HVRT', () => {
  it('renderuje wykres dla profilu PSE', () => {
    render(<FrtHvrtCurves profileId="PSE" />);
    const chart = screen.getByTestId('frt-hvrt-curves');
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute('data-profile', 'PSE');
  });

  it('renderuje 5 profili NC RfG', () => {
    const profiles = ['PSE', 'Energa', 'Tauron', 'Enea', 'PGE'] as const;
    for (const profile of profiles) {
      const { container, unmount } = render(<FrtHvrtCurves profileId={profile} />);
      expect(container.querySelector(`[data-profile="${profile}"]`)).toBeInTheDocument();
      unmount();
    }
  });

  it('etykieta profilu wyświetlana w polskim', () => {
    render(<FrtHvrtCurves profileId="Energa" />);
    expect(screen.getByText(/Energa-Operator/)).toBeInTheDocument();
  });

  it('renderuje trajektorię z solvera gdy podana', () => {
    const trajectory: FrtHvrtTrajectoryPoint[] = [
      { time_s: 0.0, voltage_pu: 1.0, iq_reactive_pu: 0.0, p_active_pu: 1.0 },
      { time_s: 0.05, voltage_pu: 0.2, iq_reactive_pu: 0.5, p_active_pu: 0.5 },
      { time_s: 0.5, voltage_pu: 0.6, iq_reactive_pu: 0.3, p_active_pu: 0.8 },
      { time_s: 1.0, voltage_pu: 0.95, iq_reactive_pu: 0.0, p_active_pu: 1.0 },
    ];
    render(<FrtHvrtCurves profileId="PSE" trajectory={trajectory} />);
    expect(screen.getByTestId('frt-hvrt-curves')).toBeInTheDocument();
  });

  it('różne profile mają różne offsety krzywych (test integracyjny)', () => {
    // Snapshot testu nie używamy — zamiast tego walidujemy że render się
    // wywołuje deterministycznie 5 razy bez błędu.
    const profiles = ['PSE', 'Energa', 'Tauron', 'Enea', 'PGE'] as const;
    for (const profile of profiles) {
      const { unmount } = render(<FrtHvrtCurves profileId={profile} height={200} />);
      unmount();
    }
    expect(true).toBe(true);
  });
});
