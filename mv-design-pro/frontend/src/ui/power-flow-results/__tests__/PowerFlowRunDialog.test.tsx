import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PowerFlowRunDialog, DEFAULT_RUN_OPTIONS } from '../PowerFlowRunDialog';

describe('PowerFlowRunDialog', () => {
  it('nie renderuje gdy isOpen=false', () => {
    const { container } = render(<PowerFlowRunDialog isOpen={false} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="power-flow-run-dialog"]')).toBeNull();
  });

  it('renderuje 3 algorytmy NR/GS/FD', () => {
    render(<PowerFlowRunDialog isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('pf-algorithm-NEWTON_RAPHSON')).toBeInTheDocument();
    expect(screen.getByTestId('pf-algorithm-GAUSS_SEIDEL')).toBeInTheDocument();
    expect(screen.getByTestId('pf-algorithm-FAST_DECOUPLED')).toBeInTheDocument();
  });

  it('default selected algorithm to Newton-Raphson', () => {
    render(<PowerFlowRunDialog isOpen onClose={vi.fn()} />);
    const nrRadio = screen.getByTestId('pf-algorithm-NEWTON_RAPHSON').querySelector('input') as HTMLInputElement;
    expect(nrRadio.checked).toBe(true);
  });

  it('przełącza algorytm', () => {
    render(<PowerFlowRunDialog isOpen onClose={vi.fn()} />);
    const gsRadio = screen.getByTestId('pf-algorithm-GAUSS_SEIDEL').querySelector('input') as HTMLInputElement;
    fireEvent.click(gsRadio);
    expect(gsRadio.checked).toBe(true);
  });

  it('Run wywołuje onRun z aktualnymi opcjami', async () => {
    const onRun = vi.fn();
    render(<PowerFlowRunDialog isOpen onClose={vi.fn()} onRun={onRun} />);
    fireEvent.change(screen.getByTestId('pf-tolerance'), { target: { value: '1e-7' } });
    fireEvent.change(screen.getByTestId('pf-max-iterations'), { target: { value: '50' } });
    fireEvent.click(screen.getByTestId('pf-run'));
    await waitFor(() => {
      expect(onRun).toHaveBeenCalledWith(expect.objectContaining({
        algorithm: 'NEWTON_RAPHSON',
        tolerance: 1e-7,
        maxIterations: 50,
      }));
    });
  });

  it('flat start checkbox', () => {
    const onRun = vi.fn();
    render(<PowerFlowRunDialog isOpen onClose={vi.fn()} onRun={onRun} />);
    const flatStart = screen.getByTestId('pf-flat-start') as HTMLInputElement;
    expect(flatStart.checked).toBe(false);
    fireEvent.click(flatStart);
    expect(flatStart.checked).toBe(true);
  });

  it('enforce Q limits domyślnie ON', () => {
    render(<PowerFlowRunDialog isOpen onClose={vi.fn()} />);
    const qLimits = screen.getByTestId('pf-enforce-q-limits') as HTMLInputElement;
    expect(qLimits.checked).toBe(true);
  });

  it('initialOptions ustawiają początkowe wartości', () => {
    render(<PowerFlowRunDialog isOpen onClose={vi.fn()} initialOptions={{ algorithm: 'FAST_DECOUPLED', maxIterations: 100 }} />);
    const fdRadio = screen.getByTestId('pf-algorithm-FAST_DECOUPLED').querySelector('input') as HTMLInputElement;
    expect(fdRadio.checked).toBe(true);
    const maxIter = screen.getByTestId('pf-max-iterations') as HTMLInputElement;
    expect(maxIter.value).toBe('100');
  });

  it('DEFAULT_RUN_OPTIONS = NR + 1e-6 + 30 iter', () => {
    expect(DEFAULT_RUN_OPTIONS).toEqual({
      algorithm: 'NEWTON_RAPHSON',
      tolerance: 1e-6,
      maxIterations: 30,
      flatStart: false,
      enforceQLimits: true,
    });
  });

  it('Cancel zamyka dialog', () => {
    const onClose = vi.fn();
    render(<PowerFlowRunDialog isOpen onClose={onClose} />);
    fireEvent.click(screen.getByTestId('pf-cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
