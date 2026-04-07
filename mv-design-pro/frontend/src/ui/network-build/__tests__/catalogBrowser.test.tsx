import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CatalogBrowser } from '../CatalogBrowser';

const fetchTypesByCategoryMock = vi.fn();

vi.mock('../../catalog', () => ({
  fetchTypesByCategory: (...args: unknown[]) => fetchTypesByCategoryMock(...args),
}));

describe('CatalogBrowser', () => {
  beforeEach(() => {
    fetchTypesByCategoryMock.mockReset();
  });

  it('pobiera listę typów z API dla wspieranej przestrzeni', async () => {
    fetchTypesByCategoryMock.mockResolvedValue([
      {
        id: 'cable-1',
        name: 'Kabel SN 3x120',
        manufacturer: 'Tele-Fonika',
        r_ohm_per_km: 0.21,
        x_ohm_per_km: 0.09,
        rated_current_a: 240,
      },
    ]);

    render(<CatalogBrowser />);

    await waitFor(() => {
      expect(fetchTypesByCategoryMock).toHaveBeenCalledWith('CABLE');
    });

    expect(await screen.findByText('Kabel SN 3x120')).toBeInTheDocument();
    expect(screen.getByText('Tele-Fonika')).toBeInTheDocument();
  });

  it('pokazuje jawny komunikat dla namespace bez mapowania API', async () => {
    fetchTypesByCategoryMock.mockResolvedValue([]);

    render(<CatalogBrowser />);

    fireEvent.click(screen.getByRole('button', { name: /Przekładniki prądowe/i }));

    expect(await screen.findByText(/brak obsługi API/i)).toBeInTheDocument();
    expect(fetchTypesByCategoryMock).toHaveBeenCalledTimes(1);
  });

  it('w trybie przegladowym nie pokazuje akcji przypisania', async () => {
    fetchTypesByCategoryMock.mockResolvedValue([
      {
        id: 'cable-1',
        name: 'Kabel SN 3x120',
        manufacturer: 'Tele-Fonika',
        r_ohm_per_km: 0.21,
      },
    ]);

    render(<CatalogBrowser mode="browse" />);

    expect(await screen.findByText('Kabel SN 3x120')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Kabel SN 3x120'));

    expect(screen.queryByRole('button', { name: /przypisz do elementu/i })).not.toBeInTheDocument();
    expect(screen.getByText(/tryb przeglądowy/i)).toBeInTheDocument();
  });
});
