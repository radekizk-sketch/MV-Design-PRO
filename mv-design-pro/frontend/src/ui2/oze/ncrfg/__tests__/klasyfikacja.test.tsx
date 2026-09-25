/**
 * Klasyfikacja modułu po stronie prezentacji WYŁĄCZNIE przez `/api/ncrfg-tests/modul`
 * (karta AB-1a Pakiet D2; decyzja zarządcy nr 2). Iloczyn cech: para (moc, napięcie) —
 * poprawna / bez mocy / bez napięcia × powtórzenia (jedno zapytanie na unikalną parę) ×
 * odpowiedź backendu (typ / poniżej progu / błąd).
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BRAK_MOCY_PL,
  BRAK_NAPIECIA_PL,
  krotkiOpisKlasyfikacji,
  kluczKlasyfikacji,
  useKlasyfikacjeModulow,
  type ZapytanieKlasyfikacji,
} from '../klasyfikacja';

const klasyfikacja = (modul: 'B' | null) => ({
  modul,
  prog_min_kw: 0.8,
  progi_kw: { B: 200, C: 10000, D: 75000 },
  napiecie_d_kv: 110,
  podstawa: { rodzaj: 'WOS', dokument: 'WOS', wydanie: '2018', jednostka_redakcyjna: null, status: 'NIEUSTALONE', uwagi_pl: null },
  powod_pl: modul ? 'typ B' : 'poniżej progu istotności',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kluczKlasyfikacji', () => {
  it('brak mocy / moc ≤ 0 / brak napięcia → nazwany brak bez zapytania', () => {
    expect(kluczKlasyfikacji({ mocMw: null, napiecieKv: 15 })).toEqual({ brak: BRAK_MOCY_PL });
    expect(kluczKlasyfikacji({ mocMw: 0, napiecieKv: 15 })).toEqual({ brak: BRAK_MOCY_PL });
    expect(kluczKlasyfikacji({ mocMw: 2, napiecieKv: null })).toEqual({ brak: BRAK_NAPIECIA_PL });
  });
  it('moc w MW → kW w zapytaniu (konwersja jednostek)', () => {
    expect(kluczKlasyfikacji({ mocMw: 1.935, napiecieKv: 15 })).toMatchObject({ pMaxKw: 1935, napiecieKv: 15 });
  });
});

describe('useKlasyfikacjeModulow', () => {
  it('jedno zapytanie na unikalną parę; stany: ładowanie → gotowe; brak danych bez zapytania', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify(klasyfikacja(url.includes('p_max_kw=0.5') ? null : 'B')), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const zapytania: ZapytanieKlasyfikacji[] = [
      { mocMw: 2, napiecieKv: 15 },
      { mocMw: 2, napiecieKv: 15 },
      { mocMw: 0.0005, napiecieKv: 0.4 },
      { mocMw: null, napiecieKv: 15 },
    ];
    const { result } = renderHook(() => useKlasyfikacjeModulow(zapytania));
    expect(result.current(zapytania[0]).stan).toBe('ladowanie');
    expect(result.current(zapytania[3])).toEqual({ stan: 'brak_danych', powod_pl: BRAK_MOCY_PL });
    await waitFor(() => expect(result.current(zapytania[0]).stan).toBe('gotowe'));
    await waitFor(() => expect(result.current(zapytania[2]).stan).toBe('gotowe'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(krotkiOpisKlasyfikacji(result.current(zapytania[0]), '—')).toBe('B');
    expect(krotkiOpisKlasyfikacji(result.current(zapytania[2]), '—')).toBe('poniżej progu');
    expect(krotkiOpisKlasyfikacji(result.current(zapytania[3]), '—')).toBe('—');
  });

  it('błąd backendu → stan błędu z komunikatem (nie domysł typu)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'dane poza dziedziną' }), { status: 422 })),
    );
    const zapytania = [{ mocMw: 2, napiecieKv: 15 }];
    const { result } = renderHook(() => useKlasyfikacjeModulow(zapytania));
    await waitFor(() => expect(result.current(zapytania[0]).stan).toBe('blad'));
    expect(result.current(zapytania[0])).toEqual({ stan: 'blad', komunikat: 'dane poza dziedziną' });
    expect(krotkiOpisKlasyfikacji(result.current(zapytania[0]), '—')).toBe('—');
  });
});
