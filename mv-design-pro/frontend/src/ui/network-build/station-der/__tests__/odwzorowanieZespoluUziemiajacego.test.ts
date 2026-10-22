/**
 * Adapter `GET /api/catalog/zespol-uziemiajacy/odwzorowanie` (karta KATALOG-APARATURA-WN):
 * parametry zapytania, odpowiedź przekazana 1:1, odmowa 422 z kodem maszynowym.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OdmowaOdwzorowaniaZespolu,
  fetchOdwzorowanieZespoluUziemiajacego,
} from '../audit2-api';

const originalFetch = global.fetch;

const ODPOWIEDZ = {
  pozycja_ref: 'zu_rezystor_500a_15kv',
  propozycja: true,
  napiecie_sieci_kv: 15,
  grounding: { type: 'resistor_grounded', r_ohm: 17.32, x_ohm: null },
  zero_sequence: { enabled: true, r0_ohm: 52.4, x0_ohm: 4.1 },
  dane_przyjete: [
    { nazwa_pl: 'sposób uziemienia', wartosc: { wartosc: 500, jednostka: 'A' }, powod_pl: 'ENEA §16', jakosc: 'ESTIMATED' },
  ],
  wyjasnienie_pl: 'Punkt neutralny sieci 15 kV.',
  podstawa_pl: 'ENEA Operator §16',
};

describe('odwzorowanie zespołu uziemiającego', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('bez pozycji wysyła napięcie i charakter sieci, zwraca propozycję backendu', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ODPOWIEDZ,
    });
    const wynik = await fetchOdwzorowanieZespoluUziemiajacego({
      napiecieSieciKv: 15,
      charakterSieci: 'KABLOWA',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/catalog/zespol-uziemiajacy/odwzorowanie?napiecie_sieci_kv=15&charakter_sieci=KABLOWA',
    );
    expect(wynik).toEqual(ODPOWIEDZ);
  });

  it('z pozycją przekazuje jej identyfikator', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ...ODPOWIEDZ, propozycja: false }),
    });
    await fetchOdwzorowanieZespoluUziemiajacego({ napiecieSieciKv: 20, pozycjaRef: 'zu_dlawik_400a_20kv' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/catalog/zespol-uziemiajacy/odwzorowanie?napiecie_sieci_kv=20&pozycja_ref=zu_dlawik_400a_20kv',
    );
  });

  it('odmowa 422 niesie kod i zdanie backendu', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({
        kod: 'zespol_uziemiajacy.napiecie_spoza_sn',
        detail: 'Zespół uziemiający dotyczy sieci SN.',
      }),
    });
    const blad = await fetchOdwzorowanieZespoluUziemiajacego({ napiecieSieciKv: 110 }).catch((e) => e);
    expect(blad).toBeInstanceOf(OdmowaOdwzorowaniaZespolu);
    expect(blad.kod).toBe('zespol_uziemiajacy.napiecie_spoza_sn');
    expect(blad.message).toBe('Zespół uziemiający dotyczy sieci SN.');
  });
});
