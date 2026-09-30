/**
 * Lustro granic pasm napięciowych ↔ jedno źródło backendu (karta PASMO-1KV).
 *
 * Oba testy (ten i `backend/tests/network_model/test_pasma_napieciowe.py`) chodzą po jednej
 * tablicy decyzyjnej `backend/schemas/pasmo_nn_parytet_v1.json`: rozjazd granicy po którejkolwiek
 * stronie wywraca test po obu. Iloczyn cech: napięcie {brak, 0, ujemne, 0,23…0,999, 1,0 (granica
 * włączna nN), 1,001, 6, 15, 60, 66, 109,999, 110 (granica włączna WN), 220} × predykat {pasmo,
 * w paśmie nN, powyżej nN, szyna poza SN} oraz wartości niefizyczne (NaN, ±∞) spoza JSON.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  OPIS_PASMA_NN,
  OPIS_PASMA_SN,
  PASMO_NN_MAX_KV,
  PASMO_WN_MIN_KV,
  pasmoNapieciowe,
  powyzejPasmaNn,
  szynaPozaPasmemSn,
  wPasmieNn,
  wPasmieSn,
  wPasmieWn,
  type Pasmo,
} from '../pasmaNapieciowe';

interface Wiersz {
  readonly napiecie_kv: number | null;
  readonly pasmo: Pasmo | null;
  readonly w_pasmie_nn: boolean;
  readonly powyzej_pasma_nn: boolean;
  readonly szyna_poza_pasmem_sn: boolean;
}

const TABLICA = path.resolve(__dirname, '../../../../../backend/schemas/pasmo_nn_parytet_v1.json');

function wiersze(): readonly Wiersz[] {
  return (JSON.parse(readFileSync(TABLICA, 'utf-8')) as { wiersze: readonly Wiersz[] }).wiersze;
}

describe('lustro pasm napięciowych — parytet z jednym źródłem backendu', () => {
  it('granice i brzmienie opisu są te same co w źródle', () => {
    expect(PASMO_NN_MAX_KV).toBe(1.0);
    expect(PASMO_WN_MIN_KV).toBe(110.0);
    expect(OPIS_PASMA_NN).toBe('napięcie znamionowe do 1 kV włącznie');
    expect(OPIS_PASMA_SN).toBe('napięcie znamionowe powyżej 1 kV i poniżej 110 kV');
  });

  it('tablica obejmuje obie strony każdej granicy', () => {
    const napiecia = new Set(wiersze().map((w) => w.napiecie_kv));
    for (const v of [null, 0, -0.4, 0.999, 1, 1.001, 60, 66, 109.999, 110]) {
      expect(napiecia.has(v)).toBe(true);
    }
  });

  it.each(wiersze().map((w) => [w.napiecie_kv, w] as const))('%s kV', (napiecie, w) => {
    expect(pasmoNapieciowe(napiecie)).toBe(w.pasmo);
    expect(wPasmieNn(napiecie)).toBe(w.w_pasmie_nn);
    expect(powyzejPasmaNn(napiecie)).toBe(w.powyzej_pasma_nn);
    expect(szynaPozaPasmemSn(napiecie)).toBe(w.szyna_poza_pasmem_sn);
    expect(wPasmieSn(napiecie)).toBe(w.pasmo === 'SN');
    expect(wPasmieWn(napiecie)).toBe(w.pasmo === 'WN');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'wartość niefizyczna %s nie leży w żadnym paśmie',
    (napiecie) => {
      expect(pasmoNapieciowe(napiecie)).toBeNull();
      expect(wPasmieNn(napiecie)).toBe(false);
      expect(powyzejPasmaNn(napiecie)).toBe(false);
      expect(szynaPozaPasmemSn(napiecie)).toBe(true);
    },
  );

  it('brak danej (undefined) zachowuje się jak null', () => {
    expect(pasmoNapieciowe(undefined)).toBeNull();
    expect(szynaPozaPasmemSn(undefined)).toBe(false);
  });
});
