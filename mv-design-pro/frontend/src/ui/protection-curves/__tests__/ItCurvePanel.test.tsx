/**
 * Audyt E, faza E-4 — testy panelu krzywej I-t.
 *
 * Ćwiczą REALNĄ ścieżkę renderu widoku funkcji nadprądowej:
 * - krzywa DEFINITE (DT) z punktami z solvera → wykres + podsumowanie,
 * - brak krzywej (`it_curve = null`) z `["time_multiplier"]` → uczciwy stan
 *   zerowy z przyczyną po polsku (bez fabrykacji punktów).
 *
 * Render natywny (`render`), bez syntetycznych zdarzeń.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// Recharts ResponsiveContainer wymaga ResizeObserver (brak w jsdom).
beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

import { ItCurvePanel } from '../ItCurvePanel';
import { itCurveMissingReasonsPl, itCurveToProtectionCurve } from '../itCurveAdapter';
import type { ProtectionFunctionItCurve } from '../../protection';

// Krzywa DEFINITE (DT) w kształcie serializowanym przez backend
// (protection_read_model._build_it_curve): punkty { i_a, t_s }.
const definiteItCurve: ProtectionFunctionItCurve = {
  standard: 'IEC_60255',
  curve_kind: 'DEFINITE',
  curve_code: 'DT',
  curve_label_pl: 'Czas niezależny (DT)',
  pickup_a: 500,
  time_multiplier: null,
  points: [
    { i_a: 500, t_s: 0.1 },
    { i_a: 1000, t_s: 0.1 },
    { i_a: 2000, t_s: 0.1 },
    { i_a: 5000, t_s: 0.1 },
  ],
};

describe('ItCurvePanel — krzywa DEFINITE z solvera', () => {
  it('renderuje wykres I-t z punktów backendu', () => {
    render(<ItCurvePanel itCurve={definiteItCurve} curveId="OVERCURRENT_INST-50" />);

    expect(screen.getByTestId('it-curve-panel')).toBeInTheDocument();
    expect(screen.getByTestId('it-curve-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('it-curve-missing')).not.toBeInTheDocument();
  });

  it('pokazuje podsumowanie: etykieta, liczba punktów, prad rozruchowy', () => {
    render(<ItCurvePanel itCurve={definiteItCurve} curveId="OVERCURRENT_INST-50" />);

    const summary = screen.getByTestId('it-curve-summary');
    expect(summary).toHaveTextContent('Czas niezależny (DT)');
    expect(summary).toHaveTextContent('4 pkt');
    expect(summary).toHaveTextContent('Ip = 500 A');
  });
});

describe('ItCurvePanel — brak danych krzywej', () => {
  it('pokazuje uczciwy stan zerowy z przyczyna TMS', () => {
    render(
      <ItCurvePanel
        itCurve={null}
        itCurveMissingData={['time_multiplier']}
        curveId="OVERCURRENT_TIME-51"
      />,
    );

    expect(screen.getByTestId('it-curve-missing')).toBeInTheDocument();
    expect(screen.queryByTestId('it-curve-chart')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Brak mnożnika czasowego \(TMS\)/),
    ).toBeInTheDocument();
  });

  it('bez kodow braku danych pokazuje ogolny komunikat', () => {
    render(<ItCurvePanel itCurve={null} curveId="OVERCURRENT_TIME-51" />);

    expect(screen.getByTestId('it-curve-missing')).toBeInTheDocument();
    expect(screen.getByText(/Brak danych krzywej I-t z solvera/)).toBeInTheDocument();
  });
});

describe('itCurveAdapter', () => {
  it('mapuje punkty { i_a, t_s } na { current_a, time_s } bez zmiany wartosci', () => {
    const curve = itCurveToProtectionCurve(definiteItCurve, 'test-id');

    expect(curve.points).toHaveLength(4);
    expect(curve.points[0]).toMatchObject({ current_a: 500, time_s: 0.1 });
    expect(curve.points[3]).toMatchObject({ current_a: 5000, time_s: 0.1 });
    expect(curve.pickup_current_a).toBe(500);
    expect(curve.standard).toBe('IEC');
    expect(curve.curve_type).toBe('DT');
    expect(curve.enabled).toBe(true);
  });

  it('tlumaczy kody braku danych na przyczyny po polsku', () => {
    expect(itCurveMissingReasonsPl(['time_multiplier'])).toEqual([
      'Brak mnożnika czasowego (TMS) — krzywa odwrotna niedostępna',
    ]);
    expect(itCurveMissingReasonsPl(['pickup_current'])[0]).toContain(
      'Brak progu rozruchowego',
    );
    // Nieznany kod zwracany bez ukrywania.
    expect(itCurveMissingReasonsPl(['nieznany_kod'])).toEqual(['nieznany_kod']);
  });
});
