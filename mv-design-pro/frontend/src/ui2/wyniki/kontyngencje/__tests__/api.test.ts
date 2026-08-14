/*
 * Testy adaptera okna „Kontyngencje N-1" — DWUSTRONNE na realnym kształcie
 * odpowiedzi (fikstury przepisane ze zrzutów backendu, patrz `fixtures.ts`):
 *
 * - w dół: jak klient BUDUJE żądanie (bieg pełny = parametr pominięty; zawężony
 *   = wielokrotny `element_refs`; pusty zakres = odmowa BEZ wołania sieci),
 * - w górę: czy pola odpowiedzi DOCHODZĄ do konsumenta bez gubienia i bez
 *   dorabiania (adapter przepuszczający własne pole przeszedłby test na
 *   fiksturze zmyślonej — dlatego fikstura jest zrzutem).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchMacierzN1, fetchZakresN1 } from '../api';
import { MACIERZ, ZAKRES } from './fixtures';

/** Stub `fetch` z JAWNYM parametrem adresu — bez niego `mock.calls[0][0]` jest
 *  krotką zerowej długości i asercje o zbudowanym adresie nie dałyby się napisać
 *  (typy pilnują tu, że test faktycznie sprawdza to, co deklaruje). */
function stubFetch(odpowiedz: unknown) {
  const spy = vi.fn((_url: RequestInfo | URL) =>
    Promise.resolve({ ok: true, json: async () => odpowiedz } as Response),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchZakresN1 — zapowiedź zakresu', () => {
  it('woła końcówkę zakresu z identyfikatorem przebiegu', async () => {
    const spy = stubFetch(ZAKRES);

    await fetchZakresN1('pf-1');

    expect(spy).toHaveBeenCalledWith('/api/insights/n-1-contingency/scope?run_id=pf-1');
  });

  it('identyfikator przebiegu jest kodowany (znak specjalny nie rozbija zapytania)', async () => {
    const spy = stubFetch(ZAKRES);

    await fetchZakresN1('pf 1&x=2');

    expect(spy.mock.calls[0][0]).toBe(
      '/api/insights/n-1-contingency/scope?run_id=pf%201%26x%3D2',
    );
  });

  it('przepuszcza pola zapowiedzi bez gubienia (element wykluczony z powodem)', async () => {
    stubFetch(ZAKRES);

    const dane = await fetchZakresN1('pf-1');

    expect(dane.podsumowanie).toEqual({
      kontyngencji: 4,
      biegow_rozplywu: 3,
      wykluczonych: 1,
    });
    const wykluczony = dane.elementy.find((e) => e.element_ref === 'ln_wyl');
    expect(wykluczony?.wykluczony).toBe(true);
    expect(wykluczony?.powod_pl).toContain('już wyłączony');
    // Element kwalifikowany NIE dostaje dorobionego uzasadnienia.
    expect(dane.elementy.find((e) => e.element_ref === 'tr_sn_nn')?.powod_pl).toBeNull();
  });
});

describe('fetchMacierzN1 — zamawianie biegu', () => {
  it('bieg PEŁNY pomija parametr zakresu (a nie wysyła pustej wartości)', async () => {
    const spy = stubFetch(MACIERZ);

    await fetchMacierzN1('pf-1', null);

    const adres = String(spy.mock.calls[0][0]);
    expect(adres).toBe('/api/insights/n-1-contingency?run_id=pf-1');
    expect(adres).not.toContain('element_refs');
  });

  it('bieg ZAWĘŻONY wysyła każdy element osobnym wystąpieniem parametru', async () => {
    const spy = stubFetch(MACIERZ);

    await fetchMacierzN1('pf-1', ['tr_sn_nn', 'ka_magistrala']);

    const adres = String(spy.mock.calls[0][0]);
    expect(adres).toContain('element_refs=tr_sn_nn');
    expect(adres).toContain('element_refs=ka_magistrala');
    // Kolejność wskazań zachowana — backend i tak sortuje, ale klient nie
    // przestawia zamówienia inżyniera (determinizm żądania).
    expect(adres.indexOf('tr_sn_nn')).toBeLessThan(adres.indexOf('ka_magistrala'));
  });

  it('PUSTY zakres jest odrzucany BEZ wołania sieci (nie zamienia się w bieg pełny)', async () => {
    const spy = stubFetch(MACIERZ);

    await expect(fetchMacierzN1('pf-1', [])).rejects.toThrow(/[Pp]usty zakres/);

    // Sedno: gdyby klient „naprawił" pusty zakres pominięciem parametru,
    // zamówiłby NAJDROŻSZY bieg wbrew inżynierowi, który nic nie zaznaczył.
    expect(spy).not.toHaveBeenCalled();
  });

  it('przepuszcza komplet stanów kontraktu (policzona / niezbieżna / wykluczona)', async () => {
    stubFetch(MACIERZ);

    const dane = await fetchMacierzN1('pf-1', null);

    expect(dane.kontyngencje.map((k) => k.status)).toEqual([
      'zbiegl',
      'niezbiegl',
      'wykluczony',
      'zbiegl',
    ]);
    // Liczniki NIEpoliczone zostają `null` — adapter nie zamienia ich na 0.
    const wykluczona = dane.kontyngencje.find((k) => k.status === 'wykluczony');
    expect(wykluczona?.dotkliwosc.przeciazenia).toBeNull();
    expect(wykluczona?.dotkliwosc.odbiory_bez_zasilania).toBeNull();
    const niezbiezna = dane.kontyngencje.find((k) => k.status === 'niezbiegl');
    expect(niezbiezna?.dotkliwosc.przeciazenia).toBeNull();
    // …ale kryterium topologiczne zostaje rozstrzygnięte mimo braku zbieżności.
    expect(niezbiezna?.dotkliwosc.odbiory_bez_zasilania).toBe(0);
  });

  it('przepuszcza przypadek bazowy, ranking i nierozstrzygnięte', async () => {
    stubFetch(MACIERZ);

    const dane = await fetchMacierzN1('pf-1', null);

    expect(dane.przypadek_bazowy.status).toBe('zbiegl');
    expect(dane.ranking.map((r) => r.element_ref)).toEqual(['tr_sn_nn', 'ka_magistrala']);
    expect(dane.nierozstrzygniete.map((n) => n.element_ref)).toEqual(['ln_odg', 'ln_wyl']);
    expect(dane.parameters.kryteria.ocenione_kategorie).toEqual([
      'BRANCH_LOADING',
      'TRANSFORMER_LOADING',
      'VOLTAGE_DEVIATION',
    ]);
  });

  it('odpowiedź błędna kończy się wyjątkiem z kodem (bez cichego pustego wyniku)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 422, statusText: 'Unprocessable' } as Response),
      ),
    );

    await expect(fetchMacierzN1('pf-1', null)).rejects.toThrow(/422/);
  });
});
