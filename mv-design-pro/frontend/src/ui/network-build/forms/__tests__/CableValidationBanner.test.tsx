import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CableValidationBanner } from '../CableValidationBanner';

const baseProps = {
  cableType: 'cable_xlpe_al' as const,
  lengthKm: 5,
  crossSectionMm2: 240,
  ratedAmpacityA: 285,
  loadCurrentA: 100,
  shortCircuitKa: 15,
  shortCircuitDurationS: 1,
  cableResistanceOhmPerKm: 0.125,
  cableReactanceOhmPerKm: 0.10,
  cosPhi: 0.95,
  systemVoltageKv: 15,
};

describe('CableValidationBanner', () => {
  it('OK gdy obciążenie i spadek w normie', () => {
    render(<CableValidationBanner {...baseProps} />);
    expect(screen.getByTestId('cable-validation-banner-ok')).toBeTruthy();
    expect(screen.getByText('Kabel spełnia wymagania')).toBeTruthy();
  });

  it('error gdy długość > 50 km dla SN', () => {
    render(<CableValidationBanner {...baseProps} lengthKm={60} />);
    expect(screen.getByTestId('cable-validation-banner-error')).toBeTruthy();
  });

  it('error gdy prąd > derated ampacity', () => {
    render(<CableValidationBanner {...baseProps} loadCurrentA={400} />);
    expect(screen.getByTestId('cable-validation-banner-error')).toBeTruthy();
  });

  it('error gdy przekrój za mały dla zwarcia', () => {
    render(<CableValidationBanner {...baseProps} crossSectionMm2={50} shortCircuitKa={20} />);
    expect(screen.getByTestId('cable-validation-banner-error')).toBeTruthy();
  });

  it('pokazuje 2 checks (ampacity + drop)', () => {
    render(<CableValidationBanner {...baseProps} />);
    expect(screen.getByTestId('cable-ampacity-check')).toBeTruthy();
    expect(screen.getByTestId('cable-voltage-drop-check')).toBeTruthy();
  });

  it('listę issues gdy są warnings/errors', () => {
    render(<CableValidationBanner {...baseProps} crossSectionMm2={50} shortCircuitKa={20} />);
    expect(screen.getByTestId('cable-amp-issue-0')).toBeTruthy();
  });

  it('aria-live=polite', () => {
    render(<CableValidationBanner {...baseProps} />);
    const banner = screen.getByTestId('cable-validation-banner-ok');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.getAttribute('role')).toBe('status');
  });
});
