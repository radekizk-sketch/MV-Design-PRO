import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComparisonWizard, type ComparisonRun } from '../ComparisonWizard';

const runs: ComparisonRun[] = [
  {
    id: 'run-1',
    label: 'PF — Wariant bazowy',
    runType: 'power_flow',
    timestamp: '2026-05-01T10:00:00Z',
    caseRef: 'case-1',
  },
  {
    id: 'run-2',
    label: 'PF — Wariant N-1',
    runType: 'power_flow',
    timestamp: '2026-05-02T11:00:00Z',
    caseRef: 'case-1',
  },
  {
    id: 'run-3',
    label: 'SC — Zwarcie 3F',
    runType: 'short_circuit',
    timestamp: '2026-05-03T12:00:00Z',
    caseRef: 'case-1',
  },
];

describe('ComparisonWizard', () => {
  it('renderuje stepper z 4 krokami', () => {
    render(
      <ComparisonWizard availableRuns={runs} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('step-run_a-active')).toBeTruthy();
    expect(screen.getByTestId('step-run_b')).toBeTruthy();
    expect(screen.getByTestId('step-type')).toBeTruthy();
    expect(screen.getByTestId('step-review')).toBeTruthy();
  });

  it('button "Dalej" wyłączony gdy Run A nie wybrany', () => {
    render(
      <ComparisonWizard availableRuns={runs} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const nextBtn = screen.getByTestId('comparison-next') as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);
  });

  it('po wyborze Run A → next aktywny', () => {
    render(
      <ComparisonWizard availableRuns={runs} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByTestId('run-a-select'), { target: { value: 'run-1' } });
    const nextBtn = screen.getByTestId('comparison-next') as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(false);
  });

  it('Run B select nie zawiera Run A', () => {
    render(
      <ComparisonWizard
        availableRuns={runs}
        initialRunAId="run-1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('comparison-next'));
    const runBSelect = screen.getByTestId('run-b-select') as HTMLSelectElement;
    const options = runBSelect.querySelectorAll('option');
    expect(Array.from(options).map((o) => o.value)).not.toContain('run-1');
    expect(Array.from(options).map((o) => o.value)).toContain('run-2');
  });

  it('flow: A → B → type → review → confirm', () => {
    const onConfirm = vi.fn();
    render(
      <ComparisonWizard availableRuns={runs} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByTestId('run-a-select'), { target: { value: 'run-1' } });
    fireEvent.click(screen.getByTestId('comparison-next'));

    fireEvent.change(screen.getByTestId('run-b-select'), { target: { value: 'run-2' } });
    fireEvent.click(screen.getByTestId('comparison-next'));

    fireEvent.change(screen.getByTestId('comparison-type-select'), {
      target: { value: 'power_flow' },
    });
    fireEvent.click(screen.getByTestId('comparison-next'));

    expect(screen.getByTestId('review-run-a')).toBeTruthy();
    expect(screen.getByTestId('review-run-b')).toBeTruthy();

    fireEvent.click(screen.getByTestId('comparison-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
    const [a, b, type] = onConfirm.mock.calls[0];
    expect(a.id).toBe('run-1');
    expect(b.id).toBe('run-2');
    expect(type).toBe('power_flow');
  });

  it('prev step działa wstecz', () => {
    render(
      <ComparisonWizard
        availableRuns={runs}
        initialRunAId="run-1"
        initialRunBId="run-2"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('comparison-next'));
    expect(screen.getByTestId('step-run_b-active')).toBeTruthy();
    fireEvent.click(screen.getByTestId('comparison-prev'));
    expect(screen.getByTestId('step-run_a-active')).toBeTruthy();
  });

  it('onCancel wywołane po kliknięciu Anuluj', () => {
    const onCancel = vi.fn();
    render(
      <ComparisonWizard availableRuns={runs} onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId('comparison-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
