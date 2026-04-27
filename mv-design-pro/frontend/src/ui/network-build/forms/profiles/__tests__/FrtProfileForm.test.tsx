/**
 * Tests for FrtProfileForm — Pakiet D.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FrtProfileForm } from '../FrtProfileForm';
import type { FrtProfile } from '../profileTypes';

describe('FrtProfileForm — edytor FRT', () => {
  it('renderuje 2 fazy (LVRT + HVRT)', () => {
    render(<FrtProfileForm onSubmit={vi.fn()} />);
    expect(screen.getByTestId('frt-profile-form')).toBeInTheDocument();
    expect(screen.getByTestId('frt-phase-undervoltage')).toBeInTheDocument();
    expect(screen.getByTestId('frt-phase-overvoltage')).toBeInTheDocument();
  });

  it('domyślny standard EN_50549', () => {
    render(<FrtProfileForm onSubmit={vi.fn()} />);
    const select = screen.getByTestId('frt-standard') as HTMLSelectElement;
    expect(select.value).toBe('EN_50549');
  });

  it('zmiana standardu', () => {
    const onSubmit = vi.fn();
    render(<FrtProfileForm onSubmit={onSubmit} />);
    act(() => {
      fireEvent.change(screen.getByTestId('frt-standard'), { target: { value: 'IEEE_1547' } });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('frt-submit'));
    });
    const arg = onSubmit.mock.calls[0][0] as FrtProfile;
    expect(arg.standard).toBe('IEEE_1547');
  });

  it('akceptuje duplikaty t_s (step changes — non-strict ascending)', () => {
    render(<FrtProfileForm onSubmit={vi.fn()} />);
    // domyślne mają duplikat t=0.15 w UV — formularz nie powinien błędu pokazać
    expect(screen.queryByTestId('frt-undervoltage-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('frt-submit')).not.toBeDisabled();
  });

  it('walidacja: malenie t_s → błąd', () => {
    render(<FrtProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.change(screen.getByTestId('frt-undervoltage-t-2'), { target: { value: '0.05' } });
    });
    expect(screen.getByTestId('frt-undervoltage-error')).toBeInTheDocument();
    expect(screen.getByTestId('frt-submit')).toBeDisabled();
  });

  it('submit zwraca obie fazy', () => {
    const onSubmit = vi.fn();
    render(<FrtProfileForm onSubmit={onSubmit} />);
    act(() => {
      fireEvent.click(screen.getByTestId('frt-submit'));
    });
    const arg = onSubmit.mock.calls[0][0] as FrtProfile;
    expect(arg.kind).toBe('frt');
    expect(arg.phases).toHaveLength(2);
    expect(arg.phases.map((p) => p.phase).sort()).toEqual(['overvoltage', 'undervoltage']);
  });
});
