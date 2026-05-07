/**
 * Tests for RunListView — Pakiet H.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RunListView } from '../RunListView';
import type { RunListEntry } from '../runListTypes';

const SAMPLES: RunListEntry[] = [
  {
    run_id: 'R1',
    case_id: 'C1',
    case_name: 'Zakres A',
    proof_type: 'SC3F_IEC60909',
    status: 'success',
    created_at: '2026-04-25T10:00:00Z',
    duration_s: 1.5,
    hash_prefix: 'aabbcc11',
  },
  {
    run_id: 'R2',
    case_id: 'C2',
    case_name: 'Zakres B',
    proof_type: 'VDROP',
    status: 'failed',
    created_at: '2026-04-26T10:00:00Z',
    duration_s: 0.5,
  },
];

describe('RunListView — cross-case run list', () => {
  it('renderuje tabelę z wpisami', () => {
    render(<RunListView runs={SAMPLES} />);
    expect(screen.getByTestId('run-list-view')).toBeInTheDocument();
    expect(screen.getByTestId('run-row-R1')).toBeInTheDocument();
    expect(screen.getByTestId('run-row-R2')).toBeInTheDocument();
    expect(screen.getByText('Historia obliczeń (przekrojowo)')).toBeInTheDocument();
  });

  it('count widoczny w nagłówku', () => {
    render(<RunListView runs={SAMPLES} />);
    expect(screen.getByTestId('run-list-count').textContent).toMatch(/2 \/ 2/);
  });

  it('filtr ProofType ogranicza wyniki', () => {
    render(<RunListView runs={SAMPLES} />);
    act(() => {
      fireEvent.change(screen.getByTestId('run-filter-proof-type'), {
        target: { value: 'VDROP' },
      });
    });
    expect(screen.queryByTestId('run-row-R1')).not.toBeInTheDocument();
    expect(screen.getByTestId('run-row-R2')).toBeInTheDocument();
    expect(screen.getByTestId('run-list-count').textContent).toMatch(/1 \/ 2/);
  });

  it('filtr status ogranicza wyniki', () => {
    render(<RunListView runs={SAMPLES} />);
    act(() => {
      fireEvent.change(screen.getByTestId('run-filter-status'), { target: { value: 'failed' } });
    });
    expect(screen.queryByTestId('run-row-R1')).not.toBeInTheDocument();
    expect(screen.getByTestId('run-row-R2')).toBeInTheDocument();
  });

  it('filtr case widoczny tylko gdy availableCases podane', () => {
    render(<RunListView runs={SAMPLES} />);
    expect(screen.queryByTestId('run-filter-case')).not.toBeInTheDocument();
    const cases = [
      { id: 'C1', name: 'A' },
      { id: 'C2', name: 'B' },
    ];
    const { rerender } = render(<RunListView runs={SAMPLES} availableCases={cases} />);
    rerender(<RunListView runs={SAMPLES} availableCases={cases} />);
    expect(screen.getAllByTestId('run-filter-case').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Zakres obliczeń:').length).toBeGreaterThan(0);
  });

  it('klik wiersza wywołuje onRunClick z run_id', () => {
    const onRunClick = vi.fn();
    render(<RunListView runs={SAMPLES} onRunClick={onRunClick} />);
    fireEvent.click(screen.getByTestId('run-row-R1'));
    expect(onRunClick).toHaveBeenCalledWith('R1');
  });

  it('empty state gdy brak runów po filtracji', () => {
    render(<RunListView runs={SAMPLES} />);
    act(() => {
      fireEvent.change(screen.getByTestId('run-filter-status'), {
        target: { value: 'cancelled' },
      });
    });
    expect(screen.getByTestId('run-list-empty')).toBeInTheDocument();
    expect(screen.getByTestId('run-list-empty')).toHaveTextContent('Brak obliczeń');
  });

  it('nie pokazuje zakazanych angielskich terminów w aktywnych etykietach', () => {
    const { container } = render(<RunListView runs={SAMPLES} />);
    const visibleText = container.textContent ?? '';
    expect(visibleText).not.toMatch(/\b(run|case|proof|snapshot|mock|placeholder)\b/i);
    expect(visibleText).not.toMatch(/Przypadek/);
  });

  it('sortowanie DESC po dacie (najnowsze najpierw)', () => {
    const { container } = render(<RunListView runs={SAMPLES} />);
    const rows = container.querySelectorAll('[data-testid^="run-row-"]');
    expect(rows[0].getAttribute('data-testid')).toBe('run-row-R2'); // 04-26 (nowszy)
    expect(rows[1].getAttribute('data-testid')).toBe('run-row-R1'); // 04-25
  });

  it('status w PL', () => {
    render(<RunListView runs={SAMPLES} />);
    expect(screen.getByTestId('run-status-R1').textContent).toBe('Sukces');
    expect(screen.getByTestId('run-status-R2').textContent).toBe('Błąd');
  });
});
