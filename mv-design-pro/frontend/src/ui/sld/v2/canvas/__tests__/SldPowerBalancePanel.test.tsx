/**
 * K30-101: SldPowerBalancePanel — bilans mocy panel dla OSD wniosku.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SldPowerBalancePanel } from '../SldPowerBalancePanel';

afterEach(() => cleanup());

describe('SldPowerBalancePanel — bilans mocy OSD', () => {
  it('renderuje empty values gdy data=null', () => {
    const { container } = render(<svg><SldPowerBalancePanel /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-power-balance-panel"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-power-balance-source"]')?.textContent).toBe('—');
  });

  it('renderuje wartości z LF data', () => {
    const { container } = render(
      <svg>
        <SldPowerBalancePanel data={{
          pSourceMw: 3.15,
          pLoadsMw: 2.88,
          pDersMw: 0.52,
          pLossesMw: 0.09,
        }} />
      </svg>
    );
    expect(container.querySelector('[data-testid="sld-v2-power-balance-source"]')?.textContent).toBe('3.150 MW');
    expect(container.querySelector('[data-testid="sld-v2-power-balance-loads"]')?.textContent).toBe('2.880 MW');
    expect(container.querySelector('[data-testid="sld-v2-power-balance-der"]')?.textContent).toBe('0.520 MW');
  });

  it('losses zawiera procentowy udział', () => {
    const { container } = render(
      <svg>
        <SldPowerBalancePanel data={{
          pSourceMw: 3.0, pLoadsMw: 2.7, pDersMw: 0.3, pLossesMw: 0.09,
        }} />
      </svg>
    );
    expect(container.querySelector('[data-testid="sld-v2-power-balance-losses"]')?.textContent).toContain('3.00%');
  });

  it('balance Δ pokazuje (✓) gdy |Δ| < 0.05 MW', () => {
    const { container } = render(
      <svg>
        <SldPowerBalancePanel data={{
          pSourceMw: 3.0, pLoadsMw: 2.91, pDersMw: 0.0, pLossesMw: 0.09,
        }} />
      </svg>
    );
    const panel = container.querySelector('[data-testid="sld-v2-power-balance-panel"]');
    expect(panel?.getAttribute('data-balance-ok')).toBe('true');
    expect(container.querySelector('[data-testid="sld-v2-power-balance-delta"]')?.textContent).toContain('(✓)');
  });

  it('balance Δ pokazuje (!) gdy |Δ| >= 0.05 MW', () => {
    const { container } = render(
      <svg>
        <SldPowerBalancePanel data={{
          pSourceMw: 3.0, pLoadsMw: 2.5, pDersMw: 0.0, pLossesMw: 0.09,
        }} />
      </svg>
    );
    expect(container.querySelector('[data-testid="sld-v2-power-balance-panel"]')?.getAttribute('data-balance-ok')).toBe('false');
    expect(container.querySelector('[data-testid="sld-v2-power-balance-delta"]')?.textContent).toContain('(!)');
  });
});
