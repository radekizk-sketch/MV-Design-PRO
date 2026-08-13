import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { KatalogPanel } from '../KatalogPanel';
import { FIXTURE_UZYCIA, stubLoader } from './fixtures';

describe('KatalogPanel', () => {
  it('renderuje wszystkie kategorie katalogu', async () => {
    render(<KatalogPanel zaladujTypy={stubLoader} />);
    expect(screen.getByRole('button', { name: 'Linie napowietrzne' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kable SN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transformatory' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aparaty łączeniowe SN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Falowniki (OZE)' })).toBeInTheDocument();
    // L-16 (karta KD-3): cztery przestrzenie dołożone do adaptera ui2.
    expect(screen.getByRole('button', { name: 'Przekładniki prądowe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Przekładniki napięciowe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kable nN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aparaty nN' })).toBeInTheDocument();
    // Poczekaj na zakończenie asynchronicznego ładowania listy (unik ostrzeżeń act()).
    await screen.findByRole('button', { name: /AFL-6 120/ });
  });

  it('wczytuje listę typów kategorii początkowej z loadera', async () => {
    render(<KatalogPanel zaladujTypy={stubLoader} />);
    expect(await screen.findByRole('button', { name: /AFL-6 120/ })).toBeInTheDocument();
  });

  it('pokazuje kartę techniczną po wyborze typu', async () => {
    render(<KatalogPanel zaladujTypy={stubLoader} />);
    fireEvent.click(await screen.findByRole('button', { name: /AFL-6 120/ }));
    await waitFor(() =>
      expect(screen.getByText('Rezystancja jednostkowa')).toBeInTheDocument(),
    );
    expect(screen.getByText('0,2392 Ω/km')).toBeInTheDocument();
  });

  it('filtruje listę typów po frazie wyszukiwania', async () => {
    render(<KatalogPanel zaladujTypy={stubLoader} poczatkowaKategoria="FALOWNIK" />);
    expect(await screen.findByRole('button', { name: /Falownik PV 2,5 MVA/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'magazyn' } });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Falownik PV 2,5 MVA/ })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: /Magazyn BESS/ })).toBeInTheDocument();
  });

  it('przełącza kategorię i wczytuje odpowiednią listę', async () => {
    render(<KatalogPanel zaladujTypy={stubLoader} />);
    fireEvent.click(screen.getByRole('button', { name: 'Transformatory' }));
    fireEvent.click(await screen.findByRole('button', { name: /TOn 630/ }));
    await waitFor(() => expect(screen.getByText('Napięcie zwarcia')).toBeInTheDocument());
  });

  it('integruje „Gdzie użyty" ze snapshotu i nawiguje przez callback', async () => {
    const onPokaz = vi.fn();
    render(
      <KatalogPanel
        zaladujTypy={stubLoader}
        uzyciaSnapshot={FIXTURE_UZYCIA}
        onPokazElement={onPokaz}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /AFL-6 120/ }));
    const link = await screen.findByRole('button', { name: /Linia L1/ });
    fireEvent.click(link);
    expect(onPokaz).toHaveBeenCalledWith('branch-1');
  });

  it('używa domyślnego loadera (realny klient katalogu), gdy nie wstrzyknięto', async () => {
    // Bez zaladujTypy panel korzysta z realnego klienta `ui/catalog/api.ts`,
    // który trafia do endpointu `/api/catalog/line-types`. Stub fetch → [].
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(<KatalogPanel />);
      expect(screen.getByText('Wczytywanie typów…')).toBeInTheDocument();
      expect(await screen.findByText('Brak typów w tej kategorii.')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0][0]).toBe('/api/catalog/line-types');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
