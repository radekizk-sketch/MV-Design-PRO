/*
 * Testy sekcji magazynu (P47a §1.1): BESS z dopasowanym rekordem katalogu →
 * pojemność [kWh] + moc + Q + cosφ + tryb regulacji; brak dopasowania → jawny
 * stan „pozycja katalogowa nieodnaleziona"; nie-BESS → brak sekcji. API mockowane.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { derFixture } from '../../macierz/__tests__/fixtures';
import { SekcjaMagazynu } from '../SekcjaMagazynu';
import { konwerteryBessFixture } from './analizyFixtures';

const pobierzKonwertery = vi.fn();
vi.mock('../../api', () => ({
  pobierzKonwertery: (kind?: string) => pobierzKonwertery(kind),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('SekcjaMagazynu — dopasowanie z katalogu (kryterium 1)', () => {
  it('BESS z dopasowanym rekordem pokazuje pojemność i parametry z katalogu', async () => {
    pobierzKonwertery.mockResolvedValue(konwerteryBessFixture());
    const der = derFixture({
      id: 'bess-1',
      der_kind: 'BESS',
      catalogs: { device_catalog_ref: 'conv-bess-nn-1mw-0p4kv' },
    });
    render(<SekcjaMagazynu der={der} trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-magazyn-rekord')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-magazyn-pojemnosc')).toHaveTextContent('2,000 MWh');
    expect(pobierzKonwertery).toHaveBeenCalledWith('BESS');
  });

  it('identyfikator rekordu i pole dopasowania tylko w trybie eksperckim', async () => {
    pobierzKonwertery.mockResolvedValue(konwerteryBessFixture());
    const der = derFixture({
      id: 'bess-1',
      der_kind: 'BESS',
      catalogs: { device_catalog_ref: 'conv-bess-nn-1mw-0p4kv' },
    });
    const { rerender } = render(<SekcjaMagazynu der={der} trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-magazyn-rekord')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-oze-magazyn-ekspert')).not.toBeInTheDocument();
    rerender(<SekcjaMagazynu der={der} trybEkspercki={true} />);
    expect(await screen.findByTestId('mvd-oze-magazyn-ekspert')).toHaveTextContent(
      'conv-bess-nn-1mw-0p4kv',
    );
  });

  it('BESS bez dopasowania → jawny stan „pozycja katalogowa nieodnaleziona"', async () => {
    pobierzKonwertery.mockResolvedValue(konwerteryBessFixture());
    const der = derFixture({
      id: 'bess-1',
      der_kind: 'BESS',
      catalogs: { battery_catalog_ref: 'bess_bat_byd_2880' },
    });
    render(<SekcjaMagazynu der={der} trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-magazyn-nieodnaleziona')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-oze-magazyn-rekord')).not.toBeInTheDocument();
  });

  it('błąd pobrania katalogu → jawny stan błędu', async () => {
    pobierzKonwertery.mockRejectedValue(new Error('sieć padła'));
    const der = derFixture({
      id: 'bess-1',
      der_kind: 'BESS',
      catalogs: { device_catalog_ref: 'conv-bess-nn-1mw-0p4kv' },
    });
    render(<SekcjaMagazynu der={der} trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-magazyn-blad')).toHaveTextContent('sieć padła');
  });

  it('moduł nie-BESS → sekcja pominięta i brak pobrania katalogu', () => {
    const der = derFixture({ id: 'pv-1', der_kind: 'PV' });
    const { container } = render(<SekcjaMagazynu der={der} trybEkspercki={false} />);
    expect(container.firstChild).toBeNull();
    expect(pobierzKonwertery).not.toHaveBeenCalled();
  });
});
