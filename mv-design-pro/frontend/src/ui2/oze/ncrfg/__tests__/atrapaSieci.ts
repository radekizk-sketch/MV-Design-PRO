/**
 * Atrapa GRANICY SIECI dla testów ekranów zgodności NC RfG (karta AB-1a Pakiet D2):
 * podmienia wyłącznie `fetch`, więc ekrany idą PRODUKCYJNYM klientem `ncrfg/api.ts`
 * (budowa adresu, `case_id` w zapytaniu, rozpoznanie 422 z brakami). Odpowiedzi to fixtury
 * policzone przez backend (`harness-fixtures/generated/*`), nie ręczne kopie. Zapytanie bez
 * trasy dostaje 599 z nazwaną przyczyną (test widzi błąd zamiast cichego sukcesu).
 */

import { vi } from 'vitest';

export interface WywolanieSieci {
  readonly metoda: 'GET' | 'POST';
  readonly sciezka: string;
  readonly zapytanie: URLSearchParams;
  readonly cialo: unknown;
}

export interface TrasaAtrapy {
  readonly metoda: 'GET' | 'POST';
  /** Ścieżka (dokładna) albo wzorzec ścieżki. */
  readonly sciezka: string | RegExp;
  readonly odpowiedz: (wywolanie: WywolanieSieci) => Response | Promise<Response>;
}

export function odpowiedzJson(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

export function odpowiedzPliku(tresc: string, typ: string): Response {
  return new Response(new Blob([tresc], { type: typ }), { status: 200 });
}

/** Instaluje atrapę `fetch`; zwraca listę wywołań (w kolejności). */
export function atrapaSieci(trasy: readonly TrasaAtrapy[]): WywolanieSieci[] {
  const wywolania: WywolanieSieci[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (wejscie: RequestInfo | URL, init?: RequestInit) => {
      const adres = new URL(String(wejscie), 'http://localhost');
      const wywolanie: WywolanieSieci = {
        metoda: (init?.method ?? 'GET').toUpperCase() as 'GET' | 'POST',
        sciezka: adres.pathname,
        zapytanie: adres.searchParams,
        cialo: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      };
      wywolania.push(wywolanie);
      const trasa = trasy.find(
        (t) =>
          t.metoda === wywolanie.metoda &&
          (typeof t.sciezka === 'string' ? t.sciezka === adres.pathname : t.sciezka.test(adres.pathname)),
      );
      if (!trasa) {
        return odpowiedzJson(599, { detail: `atrapa: brak trasy ${wywolanie.metoda} ${adres.pathname}` });
      }
      return trasa.odpowiedz(wywolanie);
    }),
  );
  return wywolania;
}
