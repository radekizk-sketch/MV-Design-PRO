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

  it('pobiera liste typow z API dla wspieranej przestrzeni', async () => {
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

  it('pobiera katalog dla przekladnikow pradowych zamiast blokowac namespace', async () => {
    fetchTypesByCategoryMock.mockResolvedValue([
      {
        id: 'ct-1',
        name: 'CT 400/5 A kl. 5P20',
        manufacturer: 'ABB',
        ratio_primary_a: 400,
        ratio_secondary_a: 5,
        accuracy_class: '5P20',
      },
    ]);

    render(<CatalogBrowser />);

    fireEvent.click(screen.getByRole('button', { name: /typy przekładników prądowych/i }));

    await waitFor(() => {
      expect(fetchTypesByCategoryMock).toHaveBeenLastCalledWith('CT');
    });

    expect(await screen.findByText('CT 400/5 A kl. 5P20')).toBeInTheDocument();
    expect(screen.getByText('ABB')).toBeInTheDocument();
  });

  it('nie pokazuje kategorii aktywnych zastrzeżonych dla konfiguratorów układów', async () => {
    fetchTypesByCategoryMock.mockResolvedValue([]);

    render(<CatalogBrowser />);

    await waitFor(() => {
      expect(fetchTypesByCategoryMock).toHaveBeenCalledWith('CABLE');
    });

    expect(screen.queryByText('GPZ')).not.toBeInTheDocument();
    expect(screen.queryByText('LD')).not.toBeInTheDocument();
    expect(screen.queryByText('PV')).not.toBeInTheDocument();
    expect(screen.queryByText('BESS')).not.toBeInTheDocument();
    expect(screen.queryByText('ZAB')).not.toBeInTheDocument();
  });

  it('po wyborze typu nie pokazuje surowego ID w stopce', async () => {
    fetchTypesByCategoryMock.mockResolvedValue([
      {
        id: 'cable-raw-technical-id',
        name: 'Kabel SN 3x150/25',
        manufacturer: 'Tele-Fonika',
      },
    ]);

    render(<CatalogBrowser />);

    const typeRow = await screen.findByText('Kabel SN 3x150/25');
    fireEvent.click(typeRow);

    expect(screen.getAllByText('Kabel SN 3x150/25')).toHaveLength(2);
    expect(screen.queryByText(/ID:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cable-raw-technical-id/i)).not.toBeInTheDocument();
  });

  it('pokazuje komunikat z klienta API przy braku polaczenia', async () => {
    fetchTypesByCategoryMock.mockRejectedValue(
      new Error('Nie mozna polaczyc sie z API katalogow. Uruchom backend i odswiez widok.'),
    );

    render(<CatalogBrowser />);

    expect(
      await screen.findByText(/nie mozna polaczyc sie z api katalogow/i),
    ).toBeInTheDocument();
  });
});
