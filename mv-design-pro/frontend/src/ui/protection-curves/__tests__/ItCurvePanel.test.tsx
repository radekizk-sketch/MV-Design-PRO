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

// Krzywa INVERSE (IEC SI) z nastawą TMS — kształt serializowany przez backend
// (protection_read_model._build_it_curve dla charakterystyki odwrotnej).
const inverseItCurve: ProtectionFunctionItCurve = {
  standard: 'IEC_60255',
  curve_kind: 'INVERSE',
  curve_code: 'SI',
  curve_label_pl: 'Charakterystyka odwrotna (SI)',
  pickup_a: 240,
  time_multiplier: 0.2,
  points: [
    { i_a: 264, t_s: 4.98 },
    { i_a: 480, t_s: 0.6 },
    { i_a: 1200, t_s: 0.19 },
    { i_a: 4800, t_s: 0.07 },
  ],
};

describe('ItCurvePanel — krzywa INVERSE (TMS) z solvera', () => {
  it('renderuje wykres odwrotnej charakterystyki z punktów backendu', () => {
    render(<ItCurvePanel itCurve={inverseItCurve} curveId="OVERCURRENT_TIME-51" />);

    expect(screen.getByTestId('it-curve-panel')).toBeInTheDocument();
    expect(screen.getByTestId('it-curve-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('it-curve-missing')).not.toBeInTheDocument();

    const summary = screen.getByTestId('it-curve-summary');
    expect(summary).toHaveTextContent('Charakterystyka odwrotna (SI)');
    expect(summary).toHaveTextContent('Ip = 240 A');
  });

  it('adapter przenosi TMS i typ krzywej odwrotnej z backendu', () => {
    const curve = itCurveToProtectionCurve(inverseItCurve, 'inv-id');

    expect(curve.curve_type).toBe('SI');
    expect(curve.time_multiplier).toBe(0.2);
    expect(curve.pickup_current_a).toBe(240);
    expect(curve.points).toHaveLength(4);
    // Czas opada monotonicznie ze wzrostem prądu (charakterystyka odwrotna).
    const times = curve.points.map((p) => p.time_s);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeLessThan(times[i - 1]);
    }
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
