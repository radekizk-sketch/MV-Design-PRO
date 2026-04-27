/**
 * Tests for WorkProfileForm — Pakiet D (8760h, wirtualizacja, CSV, agregacje).
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkProfileForm } from '../WorkProfileForm';
import type { WorkProfile } from '../profileTypes';

describe('WorkProfileForm — edytor profilu pracy', () => {
  it('renderuje formularz z domyślną rozdzielczością 24h', () => {
    render(<WorkProfileForm onSubmit={vi.fn()} />);
    expect(screen.getByTestId('work-profile-form')).toBeInTheDocument();
    expect(screen.getByTestId('work-page-info').textContent).toMatch(/24/);
  });

  it('zmiana rozdzielczości resetuje values na nową długość', () => {
    render(<WorkProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.change(screen.getByTestId('work-resolution'), { target: { value: 'hourly_168' } });
    });
    expect(screen.getByTestId('work-page-info').textContent).toMatch(/168/);
  });

  it('8760h: wirtualizacja — rendered tylko 100 wierszy (PAGE_SIZE)', () => {
    render(<WorkProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.change(screen.getByTestId('work-resolution'), { target: { value: 'hourly_8760' } });
    });
    expect(screen.getByTestId('work-page-info').textContent).toMatch(/1.*100.*8760/);
    // Wiersz 99 obecny, wiersz 100 NIE
    expect(screen.getByTestId('work-row-99')).toBeInTheDocument();
    expect(screen.queryByTestId('work-row-100')).not.toBeInTheDocument();
  });

  it('8760h: paginacja next przewija o PAGE_SIZE', () => {
    render(<WorkProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.change(screen.getByTestId('work-resolution'), { target: { value: 'hourly_8760' } });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('work-page-next'));
    });
    expect(screen.getByTestId('work-page-info').textContent).toMatch(/101.*200/);
    expect(screen.getByTestId('work-row-100')).toBeInTheDocument();
    expect(screen.queryByTestId('work-row-99')).not.toBeInTheDocument();
  });

  it('8760h: widok agregowany dobowy ukrywa surowe wiersze', () => {
    render(<WorkProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.change(screen.getByTestId('work-resolution'), { target: { value: 'hourly_8760' } });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('work-view-daily'));
    });
    expect(screen.getByTestId('work-aggregated-daily')).toBeInTheDocument();
    expect(screen.queryByTestId('work-values-table')).not.toBeInTheDocument();
  });

  it('8760h: widok miesięczny pokazuje 12 wierszy', () => {
    render(<WorkProfileForm onSubmit={vi.fn()} />);
    act(() => {
      fireEvent.change(screen.getByTestId('work-resolution'), { target: { value: 'hourly_8760' } });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('work-view-monthly'));
    });
    const table = screen.getByTestId('work-aggregated-monthly');
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(12);
  });

  it('CSV input dostępny tylko dla 8760h', () => {
    render(<WorkProfileForm onSubmit={vi.fn()} />);
    expect(screen.queryByTestId('work-csv-input')).not.toBeInTheDocument();
    act(() => {
      fireEvent.change(screen.getByTestId('work-resolution'), { target: { value: 'hourly_8760' } });
    });
    expect(screen.getByTestId('work-csv-input')).toBeInTheDocument();
  });

  it('submit zwraca poprawny profil 24h', () => {
    const onSubmit = vi.fn();
    render(<WorkProfileForm onSubmit={onSubmit} />);
    act(() => {
      fireEvent.click(screen.getByTestId('work-submit'));
    });
    const arg = onSubmit.mock.calls[0][0] as WorkProfile;
    expect(arg.kind).toBe('work');
    expect(arg.resolution).toBe('hourly_24');
    expect(arg.values).toHaveLength(24);
  });

  it('etykieta sezonowa zapisana w wyniku', () => {
    const onSubmit = vi.fn();
    render(<WorkProfileForm onSubmit={onSubmit} />);
    act(() => {
      fireEvent.change(screen.getByTestId('work-season-label'), { target: { value: 'lato' } });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('work-submit'));
    });
    const arg = onSubmit.mock.calls[0][0] as WorkProfile;
    expect(arg.season_label).toBe('lato');
  });
});
