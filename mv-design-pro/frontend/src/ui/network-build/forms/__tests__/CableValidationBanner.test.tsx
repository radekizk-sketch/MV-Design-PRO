import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CableValidationBanner } from '../CableValidationBanner';
import type { CableVoltageDropRequest } from '../cableVoltageDropApi';

/**
 * Spadek napięcia pochodzi z końcówki solvera. Test mockuje
 * `/api/solver/cable-voltage-drop-preview` odpowiedzią 1:1 z kontraktem
 * i czeka na render asynchroniczny (banner konsumuje gotowy ΔU%).
 */
function solverResponse(body: CableVoltageDropRequest) {
  const sinPhi = Math.sqrt(1 - body.cos_phi ** 2);
  const rTotal = body.r_ohm_per_km * body.length_km;
  const xTotal = body.x_ohm_per_km * body.length_km;
  const resistive = Math.sqrt(3) * body.current_a * rTotal * body.cos_phi;
  const reactive = Math.sqrt(3) * body.current_a * xTotal * sinPhi;
  const deltaU = resistive + reactive;
  return {
    delta_u_v: deltaU,
    delta_u_pct: (deltaU / body.line_voltage_v) * 100,
    r_total_ohm: rTotal,
    x_total_ohm: xTotal,
    delta_u_resistive_v: resistive,
    delta_u_reactive_v: reactive,
    formula_ref: 'ΔU = √3·I·(R·cosφ + X·sinφ)',
    assumptions: ['Uklad 3-fazowy symetryczny; wspolczynnik linii √3.'],
  };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/solver/cable-voltage-drop-preview');
      const body = JSON.parse(String(init?.body ?? '{}')) as CableVoltageDropRequest;
      return { ok: true, json: async () => solverResponse(body) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseProps = {
  cableType: 'cable_xlpe_al' as const,
  lengthKm: 5,
  crossSectionMm2: 240,
  ratedAmpacityA: 285,
  loadCurrentA: 100,
  shortCircuitKa: 15,
  shortCircuitDurationS: 1,
  cableResistanceOhmPerKm: 0.125,
  cableReactanceOhmPerKm: 0.1,
  cosPhi: 0.95,
  systemVoltageKv: 15,
};

describe('CableValidationBanner', () => {
  it('OK gdy obciążenie i spadek w normie', async () => {
    render(<CableValidationBanner {...baseProps} />);
    await waitFor(() => expect(screen.getByTestId('cable-validation-banner-ok')).toBeTruthy());
    expect(screen.getByText('Kabel spełnia wymagania')).toBeTruthy();
  });

  it('error gdy długość > 50 km dla SN', async () => {
    render(<CableValidationBanner {...baseProps} lengthKm={60} />);
    await waitFor(() => expect(screen.getByTestId('cable-validation-banner-error')).toBeTruthy());
  });

  it('error gdy prąd > derated ampacity', async () => {
    render(<CableValidationBanner {...baseProps} loadCurrentA={400} />);
    await waitFor(() => expect(screen.getByTestId('cable-validation-banner-error')).toBeTruthy());
  });

  it('error gdy przekrój za mały dla zwarcia', async () => {
    render(<CableValidationBanner {...baseProps} crossSectionMm2={50} shortCircuitKa={20} />);
    await waitFor(() => expect(screen.getByTestId('cable-validation-banner-error')).toBeTruthy());
  });

  it('pokazuje 2 checks (ampacity + drop)', async () => {
    render(<CableValidationBanner {...baseProps} />);
    expect(screen.getByTestId('cable-ampacity-check')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('cable-voltage-drop-check').textContent).toContain('%'),
    );
  });

  it('listę issues gdy są warnings/errors', async () => {
    render(<CableValidationBanner {...baseProps} crossSectionMm2={50} shortCircuitKa={20} />);
    expect(screen.getByTestId('cable-amp-issue-0')).toBeTruthy();
  });

  it('aria-live=polite', async () => {
    render(<CableValidationBanner {...baseProps} />);
    await waitFor(() => expect(screen.getByTestId('cable-validation-banner-ok')).toBeTruthy());
    const banner = screen.getByTestId('cable-validation-banner-ok');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.getAttribute('role')).toBe('status');
  });
});
