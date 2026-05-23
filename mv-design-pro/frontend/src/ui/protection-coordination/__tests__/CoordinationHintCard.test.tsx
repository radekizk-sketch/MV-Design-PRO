import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CoordinationHintCard } from '../CoordinationHintCard';

const selectivePair = {
  downstream: { tms: 0.1, pickup: 100, curve: 'SI' as const },
  upstream: { tms: 0.3, pickup: 200, curve: 'SI' as const },
  faultCurrent: 1000,
  ctiMin: 0.3,
};

const nonSelectivePair = {
  downstream: { tms: 0.5, pickup: 100, curve: 'SI' as const },
  upstream: { tms: 0.1, pickup: 200, curve: 'SI' as const },
  faultCurrent: 1000,
  ctiMin: 0.3,
};

describe('CoordinationHintCard', () => {
  it('selective: zielony badge + brak suggest', () => {
    render(<CoordinationHintCard pair={selectivePair} />);
    expect(screen.getByTestId('coordination-hint-selective')).toBeTruthy();
    expect(screen.queryByTestId('coordination-apply-tms')).toBeNull();
  });

  it('non-selective: amber badge + suggest', () => {
    render(<CoordinationHintCard pair={nonSelectivePair} />);
    expect(screen.getByTestId('coordination-hint-non-selective')).toBeTruthy();
    expect(screen.getByText(/Sugerowana korekta TMS/)).toBeTruthy();
  });

  it('button "Zastosuj" wywołuje onApplyAdjustment z new TMS', () => {
    const onApply = vi.fn();
    render(<CoordinationHintCard pair={nonSelectivePair} onApplyAdjustment={onApply} />);
    fireEvent.click(screen.getByTestId('coordination-apply-tms'));
    expect(onApply).toHaveBeenCalledOnce();
    const newTms = onApply.mock.calls[0][0];
    expect(newTms).toBeGreaterThan(nonSelectivePair.upstream.tms);
  });

  it('bez onApplyAdjustment → brak buttona', () => {
    render(<CoordinationHintCard pair={nonSelectivePair} />);
    expect(screen.queryByTestId('coordination-apply-tms')).toBeNull();
  });

  it('aria-live=polite dla screen reader', () => {
    render(<CoordinationHintCard pair={selectivePair} />);
    const root = screen.getByTestId('coordination-hint-selective');
    expect(root.getAttribute('aria-live')).toBe('polite');
    expect(root.getAttribute('role')).toBe('status');
  });
});
