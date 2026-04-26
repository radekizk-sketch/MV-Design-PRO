/**
 * Tests for QofUProfileForm — Pakiet D.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QofUProfileForm } from '../QofUProfileForm';
import type { QofUProfile } from '../profileTypes';

describe('QofUProfileForm — edytor Q(U)', () => {
  it('renderuje 3 domyślne punkty', () => {
    render(<QofUProfileForm onSubmit={vi.fn()} />);
    expect(screen.getByTestId('qu-profile-form')).toBeInTheDocument();
    expect(screen.getByTestId('qu-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('qu-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('qu-row-2')).toBeInTheDocument();
  });

  it('dodaje punkt przyciskiem +', () => {
    render(<QofUProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.click(screen.getByTestId('qu-add-point'));
    });
    expect(screen.getByTestId('qu-row-3')).toBeInTheDocument();
  });

  it('usuwa punkt przyciskiem ×', () => {
    render(<QofUProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.click(screen.getByTestId('qu-add-point'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('qu-remove-3'));
    });
    expect(screen.queryByTestId('qu-row-3')).not.toBeInTheDocument();
  });

  it('walidacja: monotoniczność u_pu naruszona → błąd + brak submit', () => {
    render(<QofUProfileForm onSubmit={vi.fn()} />);
    // Zmieniamy u_pu w środkowym punkcie na wartość niższą od pierwszego
    act(() => {
      fireEvent.change(screen.getByTestId('qu-u-1'), { target: { value: '0.9' } });
    });
    expect(screen.getByTestId('qu-validation-error')).toBeInTheDocument();
    expect(screen.getByTestId('qu-submit')).toBeDisabled();
  });

  it('walidacja: zakres u_pu poza [0.5, 1.5] → błąd', () => {
    render(<QofUProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.change(screen.getByTestId('qu-u-2'), { target: { value: '2.0' } });
    });
    expect(screen.getByTestId('qu-validation-error').textContent).toMatch(/Range/);
  });

  it('submit zwraca poprawny profil', () => {
    const onSubmit = vi.fn();
    render(<QofUProfileForm onSubmit={onSubmit} />);
    act(() => {
      fireEvent.click(screen.getByTestId('qu-submit'));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0] as QofUProfile;
    expect(arg.kind).toBe('qu');
    expect(arg.points).toHaveLength(3);
    expect(arg.points[0]).toEqual({ u_pu: 0.95, q_mvar: -0.5 });
  });

  it('catalog_ref → punkty są disabled', () => {
    const initial: QofUProfile = {
      kind: 'qu',
      catalog_ref: 'CATALOG_QU_STD_EN50549',
      points: [
        { u_pu: 0.9, q_mvar: -1 },
        { u_pu: 1.1, q_mvar: 1 },
      ],
    };
    render(<QofUProfileForm initial={initial} onSubmit={vi.fn()} />);
    expect(screen.getByTestId('qu-catalog-ref').textContent).toMatch(/CATALOG_QU_STD_EN50549/);
    expect(screen.getByTestId('qu-u-0')).toBeDisabled();
    expect(screen.getByTestId('qu-add-point')).toBeDisabled();
  });

  it('hysteresis_pu = 0 → pomijane w wyniku (undefined)', () => {
    const onSubmit = vi.fn();
    render(<QofUProfileForm onSubmit={onSubmit} />);
    act(() => {
      fireEvent.click(screen.getByTestId('qu-submit'));
    });
    const arg = onSubmit.mock.calls[0][0] as QofUProfile;
    expect(arg.hysteresis_pu).toBeUndefined();
  });

  it('hysteresis_pu != 0 → zapisany w wyniku', () => {
    const onSubmit = vi.fn();
    render(<QofUProfileForm onSubmit={onSubmit} />);
    act(() => {
      fireEvent.change(screen.getByTestId('qu-hysteresis'), { target: { value: '0.02' } });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('qu-submit'));
    });
    const arg = onSubmit.mock.calls[0][0] as QofUProfile;
    expect(arg.hysteresis_pu).toBeCloseTo(0.02);
  });
});
