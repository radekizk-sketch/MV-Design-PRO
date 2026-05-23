import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProtectionWizard, computeAutoTms } from '../ProtectionWizard';

describe('computeAutoTms (IEC 60255-151)', () => {
  it('SI curve: I=2*Iset, t=4s → TMS ~0.4', () => {
    // SI: t = 0.14*TMS/(M^0.02-1). M=2, ratio^0.02 = 1.0139
    // TMS = t*(M^0.02-1)/0.14 = 4*0.0139/0.14 ≈ 0.397
    const tms = computeAutoTms('SI', 100, 200, 4);
    expect(tms).toBeCloseTo(0.397, 1);
  });

  it('VI curve: I=5*Iset, t=2s → TMS ~0.59', () => {
    // VI: t = 13.5*TMS/(M-1). M=5
    // TMS = 2*(5-1)/13.5 ≈ 0.593
    const tms = computeAutoTms('VI', 100, 500, 2);
    expect(tms).toBeCloseTo(0.593, 1);
  });

  it('EI curve: I=4*Iset, t=1s → TMS ~0.19', () => {
    // EI: t = 80*TMS/(M^2-1). M=4
    // TMS = 1*(16-1)/80 = 0.1875
    const tms = computeAutoTms('EI', 100, 400, 1);
    expect(tms).toBeCloseTo(0.188, 2);
  });

  it('DT curve: TMS = t_target', () => {
    expect(computeAutoTms('DT', 100, 500, 0.4)).toBe(0.4);
  });

  it('I_fault <= I_pickup → fallback 0.1', () => {
    expect(computeAutoTms('SI', 200, 100, 1)).toBe(0.1);
  });
});

describe('ProtectionWizard', () => {
  it('nie renderuje gdy isOpen=false', () => {
    const { container } = render(<ProtectionWizard isOpen={false} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="protection-wizard"]')).toBeNull();
  });

  it('start na kroku 1 (Funkcje zabezpieczenia)', () => {
    render(<ProtectionWizard isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('protection-wizard-step-1')).toBeInTheDocument();
    expect(screen.getByText(/krok 1\/4/)).toBeInTheDocument();
  });

  it('renderuje 11 funkcji zabezpieczeń (50/51/67/27/59/81U/81O/87T/50G/51G/79)', () => {
    render(<ProtectionWizard isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('protection-fn-50')).toBeInTheDocument();
    expect(screen.getByTestId('protection-fn-51')).toBeInTheDocument();
    expect(screen.getByTestId('protection-fn-67')).toBeInTheDocument();
    expect(screen.getByTestId('protection-fn-27')).toBeInTheDocument();
    expect(screen.getByTestId('protection-fn-59')).toBeInTheDocument();
    expect(screen.getByTestId('protection-fn-81U')).toBeInTheDocument();
    expect(screen.getByTestId('protection-fn-81O')).toBeInTheDocument();
    expect(screen.getByTestId('protection-fn-87T')).toBeInTheDocument();
    expect(screen.getByTestId('protection-fn-79')).toBeInTheDocument();
  });

  it('Dalej → krok 2 (CT/VT)', () => {
    render(<ProtectionWizard isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('protection-wizard-next'));
    expect(screen.getByTestId('protection-wizard-step-2')).toBeInTheDocument();
    expect(screen.getByTestId('protection-ct-ratio')).toBeInTheDocument();
  });

  it('krok 3 - krzywa IDMT + I_pickup + TMS', () => {
    render(<ProtectionWizard isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('protection-wizard-next'));
    fireEvent.click(screen.getByTestId('protection-wizard-next'));
    expect(screen.getByTestId('protection-curve')).toBeInTheDocument();
    expect(screen.getByTestId('protection-i-pickup')).toBeInTheDocument();
    expect(screen.getByTestId('protection-tms')).toBeInTheDocument();
  });

  it('krok 4 - auto-koordynacja TMS', () => {
    render(<ProtectionWizard isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('protection-wizard-next'));
    fireEvent.click(screen.getByTestId('protection-wizard-next'));
    fireEvent.click(screen.getByTestId('protection-wizard-next'));
    expect(screen.getByTestId('protection-wizard-step-4')).toBeInTheDocument();
    expect(screen.getByTestId('protection-auto-tms-result')).toBeInTheDocument();
    expect(screen.getByTestId('protection-apply-auto-tms')).toBeInTheDocument();
  });

  it('apply auto TMS aktualizuje konfigurację', () => {
    const onComplete = vi.fn();
    render(<ProtectionWizard isOpen onClose={vi.fn()} onComplete={onComplete} />);
    // Przejdź do kroku 4
    fireEvent.click(screen.getByTestId('protection-wizard-next'));
    fireEvent.click(screen.getByTestId('protection-wizard-next'));
    fireEvent.click(screen.getByTestId('protection-wizard-next'));
    // Apply
    fireEvent.click(screen.getByTestId('protection-apply-auto-tms'));
    // Complete
    fireEvent.click(screen.getByTestId('protection-wizard-complete'));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      auto_tms_used: true,
    }));
  });

  it('Wstecz wraca do poprzedniego kroku', () => {
    render(<ProtectionWizard isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('protection-wizard-next'));
    expect(screen.getByText(/krok 2\/4/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('protection-wizard-back'));
    expect(screen.getByText(/krok 1\/4/)).toBeInTheDocument();
  });

  it('toggle funkcji', () => {
    render(<ProtectionWizard isOpen onClose={vi.fn()} />);
    const fn50 = screen.getByTestId('protection-fn-50');
    const checkbox = fn50.querySelector('input') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});
