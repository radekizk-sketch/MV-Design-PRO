/**
 * Wspólny store biegu NC RfG (karta AB-1a Pakiet D2): katalog (idempotentnie), operator bez
 * wartości domyślnej, bieg „co-jeśli" = produkcyjny klient V2 z ciałem wyłącznie `modules`.
 * Granica atrapy: `fetch`; odpowiedzi policzone backendem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { biegFixture, katalogFixture, zadanieBieguFixture } from '../../macierz/__tests__/fixtures';
import { atrapaSieci, odpowiedzJson } from '../../ncrfg/__tests__/atrapaSieci';
import { useNcRfgStore } from '../../ncRfgStore';

beforeEach(() => {
  useNcRfgStore.getState().reset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  useNcRfgStore.getState().reset();
});

describe('katalog i operator', () => {
  it('zaladujKatalog wczytuje katalog i NIE ustawia operatora (zero wartości domyślnej)', async () => {
    atrapaSieci([{ metoda: 'GET', sciezka: '/api/ncrfg-tests/catalog', odpowiedz: () => odpowiedzJson(200, katalogFixture()) }]);
    await useNcRfgStore.getState().zaladujKatalog();
    expect(useNcRfgStore.getState().katalog).toEqual(katalogFixture());
    expect(useNcRfgStore.getState().operatorWybor).toBeNull();
  });

  it('zaladujKatalog jest idempotentny', async () => {
    const wywolania = atrapaSieci([
      { metoda: 'GET', sciezka: '/api/ncrfg-tests/catalog', odpowiedz: () => odpowiedzJson(200, katalogFixture()) },
    ]);
    await useNcRfgStore.getState().zaladujKatalog();
    await useNcRfgStore.getState().zaladujKatalog();
    expect(wywolania).toHaveLength(1);
  });

  it('błąd katalogu → komunikat backendu w stanie', async () => {
    atrapaSieci([{ metoda: 'GET', sciezka: '/api/ncrfg-tests/catalog', odpowiedz: () => odpowiedzJson(500, { detail: 'profile rozbieżne' }) }]);
    await useNcRfgStore.getState().zaladujKatalog();
    expect(useNcRfgStore.getState().bladKatalogu).toBe('profile rozbieżne');
  });

  it('ustawOperator: jawny wybór i jego wycofanie', () => {
    useNcRfgStore.getState().ustawOperator('pse');
    expect(useNcRfgStore.getState().operatorWybor).toBe('pse');
    useNcRfgStore.getState().ustawOperator(null);
    expect(useNcRfgStore.getState().operatorWybor).toBeNull();
  });
});

describe('bieg „co-jeśli"', () => {
  it('pusta lista modułów → bez zapytania', async () => {
    const wywolania = atrapaSieci([]);
    await useNcRfgStore.getState().przeprowadzTesty([]);
    expect(wywolania).toHaveLength(0);
    expect(useNcRfgStore.getState().status).toBe('idle');
  });

  it('ciało = wyłącznie `modules`; wynik i status „ready"', async () => {
    const wywolania = atrapaSieci([
      { metoda: 'POST', sciezka: '/api/ncrfg-tests/run', odpowiedz: () => odpowiedzJson(200, biegFixture()) },
    ]);
    await useNcRfgStore.getState().przeprowadzTesty(zadanieBieguFixture().modules);
    expect(wywolania[0].cialo).toEqual({ modules: zadanieBieguFixture().modules });
    expect(wywolania[0].zapytanie.toString()).toBe('');
    expect(useNcRfgStore.getState().status).toBe('ready');
    expect(useNcRfgStore.getState().wynik).toEqual(biegFixture());
  });

  it('odrzucenie → błąd z komunikatem backendu i status „error"', async () => {
    atrapaSieci([
      { metoda: 'POST', sciezka: '/api/ncrfg-tests/run', odpowiedz: () => odpowiedzJson(422, { detail: 'nieznany operator' }) },
    ]);
    await useNcRfgStore.getState().przeprowadzTesty(zadanieBieguFixture().modules);
    expect(useNcRfgStore.getState().status).toBe('error');
    expect(useNcRfgStore.getState().bladBiegu).toBe('nieznany operator');
  });

  it('reset przywraca stan początkowy', async () => {
    atrapaSieci([{ metoda: 'POST', sciezka: '/api/ncrfg-tests/run', odpowiedz: () => odpowiedzJson(200, biegFixture()) }]);
    await useNcRfgStore.getState().przeprowadzTesty(zadanieBieguFixture().modules);
    useNcRfgStore.getState().reset();
    expect(useNcRfgStore.getState().wynik).toBeNull();
    expect(useNcRfgStore.getState().status).toBe('idle');
  });
});
