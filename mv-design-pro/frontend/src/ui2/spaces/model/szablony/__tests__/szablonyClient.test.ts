import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pobierzKategorieSzablonow, pobierzSzablon, pobierzSzablony } from '../szablonyClient';

describe('szablonyClient — cienki klient owijający ui/network-build/station-templates/api.ts', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('pobierzSzablony() woła GET /api/station-templates bez filtra', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ templates: [], total: 0 }), { status: 200 }),
    );
    const odpowiedz = await pobierzSzablony();
    expect(global.fetch).toHaveBeenCalledWith('/api/station-templates');
    expect(odpowiedz).toEqual({ templates: [], total: 0 });
  });

  it('pobierzSzablony(kategoria) woła GET z parametrem category', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ templates: [], total: 0 }), { status: 200 }),
    );
    await pobierzSzablony('bess');
    expect(global.fetch).toHaveBeenCalledWith('/api/station-templates?category=bess');
  });

  it('pobierzKategorieSzablonow() woła GET /api/station-templates/categories', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ categories: [], total_templates: 0 }), { status: 200 }),
    );
    await pobierzKategorieSzablonow();
    expect(global.fetch).toHaveBeenCalledWith('/api/station-templates/categories');
  });

  it('pobierzSzablon(id) woła GET /api/station-templates/{id} i zwraca pełny kształt', async () => {
    const pelny = { id: 'tpl_x', name_pl: 'X', category: 'bess' };
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify(pelny), { status: 200 }));
    const odpowiedz = await pobierzSzablon('tpl_x');
    expect(global.fetch).toHaveBeenCalledWith('/api/station-templates/tpl_x');
    expect(odpowiedz).toEqual(pelny);
  });

  it('propaguje błąd HTTP jako wyjątek (bez fałszywego sukcesu)', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Nie znaleziono' }), { status: 404 }),
    );
    await expect(pobierzSzablon('brak')).rejects.toThrow('Nie znaleziono');
  });
});
