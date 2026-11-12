/**
 * Inspektor elementu kanwy — kolejność paneli i sekcja zwarć jako ILOCZYN CECH (karta
 * INSPEKTOR-I-NAWIGACJA): rodzaj obiektu {stacja · pole · aparat · transformator · źródło OZE ·
 * odcinek · węzeł SN} × wyniki {brak · wartość} × kolejność paneli (nazwa → parametry →
 * połączenia i stany → wyniki → katalog → działania) oraz × odpowiedź pasma MAKS./MIN.
 * {obie strony · brak strony MIN · błąd serwera}. Obiekt wskazuje NATYWNY klik w uchwyt
 * trafienia kanwy (`kliknijObiekt`), wyniki — bieg w rejestrze i jego wynik (ścieżka K8).
 */
import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { REWIZJA_BIEGU } from '../../../../test/biegNieaktualny';
import { PRZYPADKI, kliknijObiekt, pasmoDlaModelu, przygotujIloczyn, ustawWyniki } from './iloczynInspektora';

przygotujIloczyn();

describe.each(PRZYPADKI)('inspektor elementu kanwy: $nazwa', (przypadek) => {
  const kliknij = () => kliknijObiekt(przypadek);

  // Kolejność paneli × rodzaj obiektu × wyniki {brak · wartość}:
  // 1 nazwa → 2 parametry → 3 połączenia i stany → 4 wyniki → 5 katalog → 6 działania. Dane
  // katalogowe nie zostają w sekcjach parametrów (jedna końcowa sekcja „Katalog”).
  for (const stan of ['brak', 'wartosc'] as const) {
    it(`kolejność paneli: nazwa, parametry, stany, wyniki, katalog, działania (wyniki: ${stan})`, () => {
      const panel = kliknij();
      ustawWyniki(przypadek.enm, stan);
      const kolejnosc = Array.from(
        panel.querySelectorAll(
          '[data-testid="inspektor-element-kontekst"], [data-testid^="inspektor-karta-"][class~="mvd-kt-sekcja"], [data-testid="inspektor-wezel"], [data-testid="inspektor-wyniki"], [data-testid="inspektor-dzialania-zwiniete"]',
        ),
      ).map((w) => {
        const id = w.getAttribute('data-testid') ?? '';
        if (id === 'inspektor-element-kontekst') return 'nazwa';
        if (id === 'inspektor-karta-katalog') return 'katalog';
        if (id === 'inspektor-wyniki') return 'wyniki';
        if (id === 'inspektor-dzialania-zwiniete') return 'dzialania';
        if (id === 'inspektor-wezel') return 'stany';
        return 'parametry';
      });
      const RANGA = { nazwa: 1, parametry: 2, stany: 3, wyniki: 4, katalog: 5, dzialania: 6 } as const;
      expect(kolejnosc[0]).toBe('nazwa');
      expect(kolejnosc).toContain('wyniki');
      const rangi = kolejnosc.map((k) => RANGA[k]);
      expect(rangi, kolejnosc.join(' → ')).toEqual([...rangi].sort((a, b) => a - b));
      expect(kolejnosc.filter((k) => k === 'katalog').length).toBeLessThanOrEqual(1);
      for (const sekcja of Array.from(panel.querySelectorAll('[class~="mvd-kt-sekcja"]'))) {
        if (sekcja.getAttribute('data-testid') === 'inspektor-karta-katalog') continue;
        const etykiety = Array.from(sekcja.querySelectorAll('.mvd-kt-etykieta')).map((e) => e.textContent ?? '');
        expect(etykiety.filter((e) => /^Typ katalogowy|^Producent$/.test(e)), sekcja.getAttribute('data-testid') ?? '').toEqual([]);
      }
    });
  }

  // Sekcja zwarć × odpowiedź pasma {obie strony · brak strony MIN · błąd serwera}: punkt zwarcia
  // dostaje rodzaj zwarcia, Ik″/ip/Ith/Sk″ w kolumnach MAKS. i MIN. osobno, warunki (c, T_k),
  // podstawę c z backendu, konfigurację i rewizję; obiekt nie będący punktem — ani zapytania,
  // ani zestawienia.
  for (const odpowiedz of ['obie', 'brak-min', 'blad'] as const) {
    it(`obliczenia zwarciowe: scenariusz maksymalny i minimalny osobno (pasmo: ${odpowiedz})`, async () => {
      const zapytania: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (!String(url).includes('/results/short-circuit/pasmo')) return new Response('{}', { status: 404 });
          zapytania.push(url);
          if (odpowiedz === 'blad') return new Response('{}', { status: 500 });
          return new Response(JSON.stringify(pasmoDlaModelu(przypadek.enm, odpowiedz === 'brak-min')), { status: 200 });
        }),
      );
      kliknij();
      ustawWyniki(przypadek.enm, 'wartosc', 'SC_3F');
      const punktZwarcia = przypadek.rodzaj === 'station' || przypadek.rodzaj === 'node';
      const sekcja = screen.getByTestId('inspektor-wyniki');
      if (!punktZwarcia) {
        await act(async () => {});
        expect(zapytania).toEqual([]);
        expect(within(sekcja).queryByTestId('inspektor-zwarcie')).toBeNull();
        expect(within(sekcja).queryByTestId('inspektor-zwarcie-stan')).toBeNull();
        return;
      }
      expect(zapytania).toEqual(['/api/analysis-runs/run-iloczyn/results/short-circuit/pasmo']);
      if (odpowiedz === 'blad') {
        await screen.findByText(/Nie udało się pobrać scenariuszy/);
        // Wartości oglądanego biegu zostają — błąd nie zamienia ich w ciszę.
        expect(within(sekcja).getByTestId('inspektor-wynik-IK_3F_A').textContent).toContain('18,5 kA');
        return;
      }
      const zestawienie = await within(sekcja).findByTestId('inspektor-zwarcie');
      expect(within(sekcja).queryAllByTestId(/^inspektor-wynik-/)).toHaveLength(0);
      expect(within(zestawienie).getByTestId('inspektor-zwarcie-rodzaj').textContent).not.toBe('');
      const komorka = (grupa: string, kod: string, kolumna: 'maks' | 'min') =>
        within(within(zestawienie).getByTestId(`inspektor-zwarcie-${grupa}-${kod}`)).getByTestId(`inspektor-zwarcie-${kolumna}`).textContent;
      expect(
        within(zestawienie).getAllByTestId(/^inspektor-zwarcie-(wielkosc|warunek)-/).map((w) => w.getAttribute('data-testid')),
      ).toEqual([
        'inspektor-zwarcie-wielkosc-IK_3F_A',
        'inspektor-zwarcie-wielkosc-IP_A',
        'inspektor-zwarcie-wielkosc-ITH_A',
        'inspektor-zwarcie-wielkosc-SK_MVA',
        'inspektor-zwarcie-warunek-c',
        'inspektor-zwarcie-warunek-tk',
      ]);
      expect(komorka('wielkosc', 'IK_3F_A', 'maks')).toBe('18,5 kA');
      expect(komorka('warunek', 'c', 'maks')).toBe('1,10');
      expect(komorka('warunek', 'tk', 'maks')).toBe('1,00 s');
      expect(within(zestawienie).getByTestId('inspektor-zwarcie-podstawa-c').textContent).toContain('IEC 60909-0 tab. 1');
      expect(within(zestawienie).getByTestId('inspektor-zwarcie-konfiguracja').textContent).toBe('stan normalny modelu');
      expect(within(zestawienie).getByTestId('inspektor-zwarcie-rewizja').textContent).toBe(`rewizja ${REWIZJA_BIEGU}`);
      if (odpowiedz === 'obie') {
        expect(komorka('wielkosc', 'IK_3F_A', 'min')).toBe('12,3 kA');
        expect(komorka('warunek', 'c', 'min')).toBe('1,00');
        expect(within(zestawienie).queryByTestId('inspektor-zwarcie-brak-strony')).toBeNull();
      } else {
        expect(komorka('wielkosc', 'IK_3F_A', 'min')).toBe('—');
        expect(within(zestawienie).getByTestId('inspektor-zwarcie-brak-strony').textContent).toBe(
          'Scenariusz minimalny niedostępny: przypadek nie ma biegu minimalnego.',
        );
      }
    });
  }
});
