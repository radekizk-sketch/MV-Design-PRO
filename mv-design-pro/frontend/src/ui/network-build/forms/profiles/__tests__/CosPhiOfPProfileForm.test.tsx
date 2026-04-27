/**
 * Tests for CosPhiOfPProfileForm — Pakiet D.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CosPhiOfPProfileForm } from '../CosPhiOfPProfileForm';
import type { CosPhiOfPProfile } from '../profileTypes';

describe('CosPhiOfPProfileForm — edytor cos φ(P)', () => {
  it('renderuje formularz i 3 punkty domyślne', () => {
    render(<CosPhiOfPProfileForm onSubmit={vi.fn()} />);
    expect(screen.getByTestId('cosphi-profile-form')).toBeInTheDocument();
    expect(screen.getByTestId('cosphi-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('cosphi-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('cosphi-row-2')).toBeInTheDocument();
  });

  it('walidacja: cos φ > 1 → błąd zakresu', () => {
    render(<CosPhiOfPProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.change(screen.getByTestId('cosphi-v-2'), { target: { value: '1.5' } });
    });
    expect(screen.getByTestId('cosphi-validation-error').textContent).toMatch(/Range/);
    expect(screen.getByTestId('cosphi-submit')).toBeDisabled();
  });

  it('walidacja: cos φ < -1 → błąd zakresu', () => {
    render(<CosPhiOfPProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.change(screen.getByTestId('cosphi-v-2'), { target: { value: '-1.5' } });
    });
    expect(screen.getByTestId('cosphi-validation-error').textContent).toMatch(/Range/);
  });

  it('walidacja: monotoniczność P_pu', () => {
    render(<CosPhiOfPProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.change(screen.getByTestId('cosphi-p-1'), { target: { value: '0.0' } });
    });
    expect(screen.getByTestId('cosphi-validation-error').textContent).toMatch(/Monotonicity/);
  });

  it('submit zwraca poprawny profil', () => {
    const onSubmit = vi.fn();
    render(<CosPhiOfPProfileForm onSubmit={onSubmit} />);
    act(() => {
      fireEvent.click(screen.getByTestId('cosphi-submit'));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0] as CosPhiOfPProfile;
    expect(arg.kind).toBe('cosphi');
    expect(arg.points).toHaveLength(3);
  });

  it('catalog_ref → wszystko disabled', () => {
    const initial: CosPhiOfPProfile = {
      kind: 'cosphi',
      catalog_ref: 'CATALOG_COSPHI_STANDARD',
      points: [
        { p_pu: 0, cos_phi: 1 },
        { p_pu: 1, cos_phi: 0.9 },
      ],
    };
    render(<CosPhiOfPProfileForm initial={initial} onSubmit={vi.fn()} />);
    expect(screen.getByTestId('cosphi-catalog-ref').textContent).toMatch(/CATALOG_COSPHI/);
    expect(screen.getByTestId('cosphi-p-0')).toBeDisabled();
  });
});
