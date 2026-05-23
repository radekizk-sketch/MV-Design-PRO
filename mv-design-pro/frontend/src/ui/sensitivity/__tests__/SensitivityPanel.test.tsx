import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SensitivityPanel, type SensitivityEntry } from '../SensitivityPanel';

const sample: SensitivityEntry[] = [
  { elementRef: 'bus-1', elementName: 'Szyna GPZ', dV_dP: -0.001, dV_dQ: -0.003, dPloss_dP: 0.05 },
  { elementRef: 'bus-2', elementName: 'Szyna ST-1', dV_dP: -0.005, dV_dQ: -0.012, dPloss_dP: 0.08 },
  { elementRef: 'bus-3', elementName: 'Szyna ST-2', dV_dP: -0.002, dV_dQ: -0.007, dPloss_dP: 0.03 },
];

describe('SensitivityPanel', () => {
  it('idle + empty → komunikat zaproszenia', () => {
    render(<SensitivityPanel entries={[]} status="idle" />);
    expect(screen.getByTestId('sensitivity-empty')).toBeInTheDocument();
    expect(screen.getByText(/Brak wyników analizy/)).toBeInTheDocument();
  });

  it('error → komunikat błędu', () => {
    render(<SensitivityPanel entries={[]} status="error" errorMessage="Solver nie zbiegł" />);
    expect(screen.getByTestId('sensitivity-error')).toHaveTextContent('Solver nie zbiegł');
  });

  it('ready → lista wpisów posortowana po wartości abs DESC', () => {
    render(<SensitivityPanel entries={sample} status="ready" />);
    expect(screen.getByTestId('sensitivity-list')).toBeInTheDocument();
    const entries = screen.getAllByTestId(/sensitivity-entry-/);
    expect(entries).toHaveLength(3);
    // dV_dP: -0.005 (bus-2), -0.002 (bus-3), -0.001 (bus-1)
    expect(entries[0].getAttribute('data-testid')).toBe('sensitivity-entry-bus-2');
  });

  it('topN ogranicza liczbę wpisów', () => {
    render(<SensitivityPanel entries={sample} status="ready" />);
    fireEvent.change(screen.getByTestId('sensitivity-topn'), { target: { value: '5' } });
    // sample ma 3 więc 5 nie wpływa
    expect(screen.getAllByTestId(/sensitivity-entry-/)).toHaveLength(3);
  });

  it('zmiana kind przełącza wyświetlaną kolumnę', () => {
    render(<SensitivityPanel entries={sample} status="ready" />);
    fireEvent.change(screen.getByTestId('sensitivity-kind'), { target: { value: 'losses_p' } });
    // teraz sortowanie po abs(dPloss_dP): 0.08, 0.05, 0.03
    const entries = screen.getAllByTestId(/sensitivity-entry-/);
    expect(entries[0].getAttribute('data-testid')).toBe('sensitivity-entry-bus-2');
    expect(entries[1].getAttribute('data-testid')).toBe('sensitivity-entry-bus-1');
  });

  it('compute callback wywoływany', () => {
    const onCompute = vi.fn();
    render(<SensitivityPanel entries={[]} status="idle" onCompute={onCompute} />);
    fireEvent.click(screen.getByTestId('sensitivity-compute'));
    expect(onCompute).toHaveBeenCalled();
  });

  it('computing button disabled + "Obliczanie..."', () => {
    render(<SensitivityPanel entries={[]} status="computing" onCompute={vi.fn()} />);
    const btn = screen.getByTestId('sensitivity-compute') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Obliczanie');
  });

  it('onSelectElement renderuje "Pokaż na SLD"', () => {
    const onSelect = vi.fn();
    render(<SensitivityPanel entries={sample} status="ready" onSelectElement={onSelect} />);
    const buttons = screen.getAllByText('Pokaż na SLD');
    expect(buttons.length).toBe(3);
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalled();
  });
});
