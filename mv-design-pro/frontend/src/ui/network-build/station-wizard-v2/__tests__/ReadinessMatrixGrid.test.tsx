import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ReadinessMatrixGrid } from '../ReadinessMatrixGrid';
import { buildReadinessMatrix, type ReadinessAxisState } from '../readinessMatrixContract';

function makeStates(status: 'ready' | 'partial' | 'blocked' | 'no_module' = 'ready'): readonly ReadinessAxisState[] {
  return buildReadinessMatrix().map((a) => ({ axisId: a.id, status }));
}

describe('ReadinessMatrixGrid — wizualizacja 29-osiowej macierzy', () => {
  it('renderuje 29 komórek osi', () => {
    const { container } = render(<ReadinessMatrixGrid states={makeStates('ready')} />);
    const cells = container.querySelectorAll('[data-testid^="readiness-axis-"]');
    expect(cells.length).toBe(29);
  });

  it('summary pokazuje wszystkie 5 wartości (total/ready/partial/blocked/postęp)', () => {
    render(<ReadinessMatrixGrid states={makeStates('ready')} />);
    expect(screen.getByText('Łącznie osi')).toBeInTheDocument();
    expect(screen.getByText('Gotowe')).toBeInTheDocument();
    expect(screen.getByText('Częściowe')).toBeInTheDocument();
    expect(screen.getByText('Zablokowane')).toBeInTheDocument();
    expect(screen.getByText('Postęp')).toBeInTheDocument();
  });

  it('Wszystkie osie ready → postęp 100%', () => {
    render(<ReadinessMatrixGrid states={makeStates('ready')} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('Wszystkie partial → postęp 50%', () => {
    render(<ReadinessMatrixGrid states={makeStates('partial')} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('Pojedynczy blocked → flag canRunAllAnalyses pokazuje brakuje', () => {
    const states = buildReadinessMatrix().map((a, i) => ({
      axisId: a.id,
      status: (i === 0 ? 'blocked' : 'ready') as ReadinessAxisState['status'],
    }));
    render(<ReadinessMatrixGrid states={states} />);
    expect(screen.getByText(/Brakuje danych/)).toBeInTheDocument();
  });

  it('Kategoria "Obliczenia" widoczna', () => {
    render(<ReadinessMatrixGrid states={makeStates('ready')} />);
    const obliczenia = screen.getByTestId('readiness-category-Obliczenia');
    expect(obliczenia).toBeInTheDocument();
    // 7 osi DER w kategorii Obliczenia.
    const axes = obliczenia.querySelectorAll('[data-testid^="readiness-axis-"]');
    expect(axes.length).toBe(7);
  });

  it('Kategoria "Infrastruktura" zawiera 3 osie station (cable + switchgear + construction)', () => {
    render(<ReadinessMatrixGrid states={makeStates('ready')} />);
    const infra = screen.getByTestId('readiness-category-Infrastruktura');
    const axes = infra.querySelectorAll('[data-testid^="readiness-axis-"]');
    expect(axes.length).toBe(3);
  });

  it('Klik na oś wywołuje onAxisClick z ID', () => {
    const handler = vi.fn();
    render(<ReadinessMatrixGrid states={makeStates('ready')} onAxisClick={handler} />);
    fireEvent.click(screen.getByTestId('readiness-axis-equipment'));
    expect(handler).toHaveBeenCalledWith('equipment');
  });

  it('data-status atrybut na każdej osi reflects status', () => {
    render(<ReadinessMatrixGrid states={makeStates('blocked')} />);
    const cell = screen.getByTestId('readiness-axis-equipment');
    expect(cell.getAttribute('data-status')).toBe('blocked');
  });

  it('data-source rozróżnia DER vs Station', () => {
    render(<ReadinessMatrixGrid states={makeStates('ready')} />);
    const derAxis = screen.getByTestId('readiness-axis-equipment');
    const stationAxis = screen.getByTestId('readiness-axis-cable_selection');
    expect(derAxis.getAttribute('data-source')).toBe('der');
    expect(stationAxis.getAttribute('data-source')).toBe('station');
  });

  it('density="comfortable" → grid 3 kolumny', () => {
    const { container } = render(
      <ReadinessMatrixGrid states={makeStates('ready')} density="comfortable" />,
    );
    const grid = container.querySelector('[data-testid="readiness-matrix-grid"]');
    expect(grid?.getAttribute('data-density')).toBe('comfortable');
  });
});
