// @vitest-environment node
/**
 * Lustro tabeli napięcia najwyższego sieci U_s i równości napięć znamionowych ↔ jedno źródło
 * backendu (`network_model/pochodne/pasma_napieciowe.py`).
 *
 * Oba testy (ten i `backend/tests/network_model/test_napiecie_najwyzsze_sieci.py`) chodzą po
 * jednej tablicy `backend/schemas/napiecie_najwyzsze_parytet_v1.json`: rozjazd tabeli albo reguły
 * po którejkolwiek stronie wywraca test po obu. Iloczyn cech: napięcie {brak, 0, ujemne, nN,
 * granica 1 kV, każda para tabeli IEC 60038, wartości spoza tabeli (10,5 / 12 / 13,8 / 15,75 /
 * 16,5 / 21 / 121 kV), powyżej tabeli} oraz pary równości {ta sama dana, reprezentacja binarna,
 * różnica 1 V, różnica 50 V, brak, wartość niefizyczna}.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  NAPIECIE_NAJWYZSZE_SIECI_KV,
  izolacjaPokrywaSiec,
  napiecieNajwyzszeSieciKv,
  toSamoNapiecieZnamionowe,
} from '../pasmaNapieciowe';

interface Tablica {
  readonly tabela: ReadonlyArray<{ napiecie_znamionowe_kv: number; u_s_kv: number }>;
  readonly wiersze: ReadonlyArray<{ napiecie_kv: number | null; u_s_kv: number | null }>;
  readonly pary_rownosci: ReadonlyArray<{
    pierwsze_kv: number | null;
    drugie_kv: number | null;
    to_samo: boolean;
  }>;
  readonly izolacja: ReadonlyArray<{
    u_m_kv: number | null;
    napiecie_sieci_kv: number | null;
    pokrywa: boolean | null;
  }>;
}

const SCIEZKA = path.resolve(
  __dirname,
  '../../../../../backend/schemas/napiecie_najwyzsze_parytet_v1.json',
);
const TABLICA = JSON.parse(readFileSync(SCIEZKA, 'utf-8')) as Tablica;

describe('lustro tabeli U_s — parytet z jednym źródłem backendu', () => {
  it('tabela lustra jest tabelą źródła (te same pary, ta sama kolejność)', () => {
    expect(NAPIECIE_NAJWYZSZE_SIECI_KV.map(([uN, uS]) => [uN, uS])).toEqual(
      TABLICA.tabela.map((w) => [w.napiecie_znamionowe_kv, w.u_s_kv]),
    );
  });

  it.each(TABLICA.wiersze.map((w) => [w.napiecie_kv, w.u_s_kv] as const))(
    'U_s(%s kV) = %s kV',
    (napiecie, uS) => {
      expect(napiecieNajwyzszeSieciKv(napiecie)).toBe(uS);
    },
  );

  it.each(TABLICA.pary_rownosci.map((p) => [p.pierwsze_kv, p.drugie_kv, p.to_samo] as const))(
    'to samo napięcie %s i %s kV → %s',
    (pierwsze, drugie, wynik) => {
      expect(toSamoNapiecieZnamionowe(pierwsze, drugie)).toBe(wynik);
    },
  );

  it.each(TABLICA.izolacja.map((w) => [w.u_m_kv, w.napiecie_sieci_kv, w.pokrywa] as const))(
    'izolacja U_m = %s kV w sieci %s kV → %s',
    (uM, uN, wynik) => {
      expect(izolacjaPokrywaSiec(uM, uN)).toBe(wynik);
    },
  );

  it('wartości niefizyczne spoza JSON nie mają U_s i nie są równe', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(napiecieNajwyzszeSieciKv(v)).toBeNull();
      expect(toSamoNapiecieZnamionowe(v, v)).toBe(false);
    }
  });
});
