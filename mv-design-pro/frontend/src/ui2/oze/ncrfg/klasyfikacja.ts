/*
 * Klasyfikacja modułu NC RfG (art. 5) po stronie prezentacji — WYŁĄCZNIE przez końcówkę
 * backendu `GET /api/ncrfg-tests/modul?p_max_kw=&napiecie_kv=` (jedna klasyfikacja
 * `catalog/profiles/nc_rfg::klasyfikacja_modulu`, progi warstwy WOS). Karta AB-1a Pakiet D2:
 * dawne mapowanie z progów katalogu po stronie klienta (`rankingModel.klasaNcRfg`) jest
 * skasowane — druga prawda progów nie istnieje.
 *
 * Hook `useKlasyfikacjeModulow` zadaje JEDNO zapytanie na unikalną parę (moc, napięcie)
 * i pamięta odpowiedzi przez cały czas życia ekranu (ranking i kreator studium pytają o te
 * same warianty wielokrotnie). Brak dodatniej mocy albo brak napięcia → nazwany brak danych
 * bez zapytania (backend studium stosuje tę samą regułę — `dokument_studium._klasa_nc_rfg`).
 * Jedyna arytmetyka to konwersja jednostek MW→kW wartości otrzymanej z backendu.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { klasyfikujModulNcRfg } from './api';
import type { KlasyfikacjaModulu } from './typy';

/** Zapytanie o klasyfikację: moc przyłączalna [MW] i napięcie węzła [kV] (z backendu/modelu). */
export interface ZapytanieKlasyfikacji {
  readonly mocMw: number | null;
  readonly napiecieKv: number | null;
}

/** Stan klasyfikacji jednej pary (moc, napięcie) — każdy stan nazwany, bez domysłu. */
export type StanKlasyfikacji =
  | { readonly stan: 'brak_danych'; readonly powod_pl: string }
  | { readonly stan: 'ladowanie' }
  | { readonly stan: 'gotowe'; readonly klasyfikacja: KlasyfikacjaModulu }
  | { readonly stan: 'blad'; readonly komunikat: string };

export const BRAK_MOCY_PL = 'typ modułu nieokreślony — brak dodatniej mocy przyłączalnej';
export const BRAK_NAPIECIA_PL = 'typ modułu nieokreślony — brak napięcia przyłączenia';

/** Konwersja jednostek MW→kW wartości z backendu (nie fizyka). */
function mwNaKw(mocMw: number): number {
  return mocMw * 1000;
}

/** Klucz zapytania albo nazwany brak danych (bez zapytania do backendu). */
export function kluczKlasyfikacji(
  zapytanie: ZapytanieKlasyfikacji,
): { readonly klucz: string; readonly pMaxKw: number; readonly napiecieKv: number } | { readonly brak: string } {
  if (zapytanie.mocMw === null || !(zapytanie.mocMw > 0)) return { brak: BRAK_MOCY_PL };
  if (zapytanie.napiecieKv === null || !(zapytanie.napiecieKv > 0)) return { brak: BRAK_NAPIECIA_PL };
  const pMaxKw = mwNaKw(zapytanie.mocMw);
  return { klucz: `${pMaxKw}|${zapytanie.napiecieKv}`, pMaxKw, napiecieKv: zapytanie.napiecieKv };
}

/**
 * Klasyfikacje wielu par (moc, napięcie): jedno zapytanie `/modul` na unikalną parę.
 * Zwraca funkcję odczytu stanu dla dowolnej pary z listy (inna para → `ladowanie` do czasu
 * kolejnego efektu).
 */
export function useKlasyfikacjeModulow(
  zapytania: readonly ZapytanieKlasyfikacji[],
): (zapytanie: ZapytanieKlasyfikacji) => StanKlasyfikacji {
  const [stany, setStany] = useState<Readonly<Record<string, StanKlasyfikacji>>>({});
  // Klucze już zadane — odpowiedź dla klucza jest poprawna niezależnie od chwili nadejścia
  // (klucz jednoznacznie wyznacza zapytanie), więc żadne zapytanie nie jest ponawiane.
  const zadane = useRef(new Set<string>());

  const doPobrania = useMemo(() => {
    const unikalne = new Map<string, { pMaxKw: number; napiecieKv: number }>();
    for (const zapytanie of zapytania) {
      const k = kluczKlasyfikacji(zapytanie);
      if ('klucz' in k && !unikalne.has(k.klucz)) {
        unikalne.set(k.klucz, { pMaxKw: k.pMaxKw, napiecieKv: k.napiecieKv });
      }
    }
    return [...unikalne.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [zapytania]);

  useEffect(() => {
    const brakujace = doPobrania.filter(([klucz]) => !zadane.current.has(klucz));
    if (brakujace.length === 0) return;
    for (const [klucz] of brakujace) zadane.current.add(klucz);
    setStany((biezace) => {
      const nowe = { ...biezace };
      for (const [klucz] of brakujace) nowe[klucz] = { stan: 'ladowanie' };
      return nowe;
    });
    for (const [klucz, para] of brakujace) {
      klasyfikujModulNcRfg(para)
        .then((klasyfikacja) => {
          setStany((b) => ({ ...b, [klucz]: { stan: 'gotowe', klasyfikacja } }));
        })
        .catch((err: unknown) => {
          const komunikat = err instanceof Error ? err.message : 'Nieznany błąd klasyfikacji';
          setStany((b) => ({ ...b, [klucz]: { stan: 'blad', komunikat } }));
        });
    }
  }, [doPobrania]);

  return (zapytanie) => {
    const k = kluczKlasyfikacji(zapytanie);
    if ('brak' in k) return { stan: 'brak_danych', powod_pl: k.brak };
    return stany[k.klucz] ?? { stan: 'ladowanie' };
  };
}

/** Krótki opis stanu klasyfikacji do komórki tabeli (typ modułu z rekordu backendu). */
export function krotkiOpisKlasyfikacji(stan: StanKlasyfikacji, kreska: string): string {
  switch (stan.stan) {
    case 'gotowe':
      return stan.klasyfikacja.modul ?? 'poniżej progu';
    case 'ladowanie':
      return '…';
    case 'brak_danych':
    case 'blad':
      return kreska;
  }
}
