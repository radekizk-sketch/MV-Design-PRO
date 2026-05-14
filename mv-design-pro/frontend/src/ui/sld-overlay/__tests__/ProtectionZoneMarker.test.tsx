/**
 * ProtectionZoneMarker tests — P0.7 Protection overlay primitive.
 *
 * Token-only per docs/analysis/PROTECTION_CONTRACTS.md — no verdicts.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ProtectionZoneMarker,
  formatMargin,
  formatTimeSeconds,
} from '../ProtectionZoneMarker';

function renderInSvg(node: React.ReactElement) {
  return render(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 200">
      {node}
    </svg>,
  );
}

describe('formatTimeSeconds — polskie formatowanie', () => {
  it('2 miejsca po przecinku z polskim separatorem', () => {
    expect(formatTimeSeconds(0.18)).toBe('0,18 s');
    expect(formatTimeSeconds(1.0)).toBe('1,00 s');
    expect(formatTimeSeconds(2.5)).toBe('2,50 s');
  });

  it('custom precision', () => {
    expect(formatTimeSeconds(0.123456, 3)).toBe('0,123 s');
    expect(formatTimeSeconds(0.123456, 0)).toBe('0 s');
  });

  it('NaN → em-dash placeholder', () => {
    expect(formatTimeSeconds(NaN)).toBe('— s');
  });
});

describe('formatMargin — no verdicts (token-only)', () => {
  it('zwraca formatted string dla skończonej wartości', () => {
    expect(formatMargin(0.3)).toBe('0,30 s');
  });

  it('zwraca null dla undefined (brak danych)', () => {
    expect(formatMargin(undefined)).toBeNull();
  });

  it('zwraca null dla NaN', () => {
    expect(formatMargin(NaN)).toBeNull();
  });

  it('nie interpretuje wartości jako OK/NOK (brak werdyktów)', () => {
    // Wartość ujemna może być błędem selektywności, ale primitive
    // wyświetla numeric WITHOUT verdict — to decyzja warstwy wyższej.
    expect(formatMargin(-0.1)).toBe('-0,10 s');
  });
});

describe('ProtectionZoneMarker — rendering', () => {
  it('renders box + relay label + t51 label', () => {
    const { container } = renderInSvg(
      <ProtectionZoneMarker
        boxXywh={[100, 50, 200, 80]}
        relayLabel="Q01 51-NN"
        t51Seconds={0.18}
      />,
    );
    expect(container.querySelector('[data-testid$="-box"]')).not.toBeNull();
    expect(container.querySelector('[data-testid$="-relay"]')?.textContent).toBe(
      'Q01 51-NN',
    );
    expect(container.querySelector('[data-testid$="-t51"]')?.textContent).toBe(
      't51: 0,18 s',
    );
  });

  it('omits box when showBox=false (label-only mode)', () => {
    const { container } = renderInSvg(
      <ProtectionZoneMarker
        boxXywh={[100, 50, 200, 80]}
        relayLabel="Q01 51"
        t51Seconds={0.5}
        showBox={false}
      />,
    );
    expect(container.querySelector('[data-testid$="-box"]')).toBeNull();
    expect(container.querySelector('[data-testid$="-relay"]')).not.toBeNull();
  });

  it('renders upstream + downstream margins when present', () => {
    const { container } = renderInSvg(
      <ProtectionZoneMarker
        boxXywh={[0, 50, 100, 50]}
        relayLabel="TR1 87T"
        t51Seconds={0.18}
        margin={{ upstream: 0.3, downstream: 0.15 }}
      />,
    );
    const up = container.querySelector('[data-testid$="-margin-upstream"]');
    const down = container.querySelector('[data-testid$="-margin-downstream"]');
    expect(up?.textContent).toBe('Δt↑ 0,30 s');
    expect(down?.textContent).toBe('Δt↓ 0,15 s');
  });

  it('omits margin texts when values missing', () => {
    const { container } = renderInSvg(
      <ProtectionZoneMarker
        boxXywh={[0, 50, 100, 50]}
        relayLabel="TR1"
        t51Seconds={0.18}
        margin={{}}
      />,
    );
    expect(container.querySelector('[data-testid$="-margin-upstream"]')).toBeNull();
    expect(container.querySelector('[data-testid$="-margin-downstream"]')).toBeNull();
  });

  it('uses currentColor (theme-driven, brak hardcoded)', () => {
    const { container } = renderInSvg(
      <ProtectionZoneMarker
        boxXywh={[0, 50, 100, 50]}
        relayLabel="Q01"
        t51Seconds={0.18}
      />,
    );
    const box = container.querySelector('[data-testid$="-box"]');
    expect(box?.getAttribute('fill')).toBe('currentColor');
    expect(box?.getAttribute('stroke')).toBe('currentColor');
    expect(box?.getAttribute('stroke-dasharray')).toBe('4 2');
  });

  it('aria-label po polsku z relay + t51', () => {
    const { container } = renderInSvg(
      <ProtectionZoneMarker
        boxXywh={[0, 50, 100, 50]}
        relayLabel="Q01 51-NN"
        t51Seconds={0.18}
      />,
    );
    const group = container.querySelector(
      '[data-testid="sld-protection-zone-marker"]',
    );
    expect(group?.getAttribute('aria-label')).toBe(
      'Strefa zabezpieczeń Q01 51-NN, t51 0,18 s',
    );
  });

  it('determinizm — same props → identyczny DOM', () => {
    const { container: a } = renderInSvg(
      <ProtectionZoneMarker
        boxXywh={[100, 50, 200, 80]}
        relayLabel="Q01"
        t51Seconds={0.18}
        margin={{ upstream: 0.3 }}
      />,
    );
    const { container: b } = renderInSvg(
      <ProtectionZoneMarker
        boxXywh={[100, 50, 200, 80]}
        relayLabel="Q01"
        t51Seconds={0.18}
        margin={{ upstream: 0.3 }}
      />,
    );
    expect(a.innerHTML).toBe(b.innerHTML);
  });
});
