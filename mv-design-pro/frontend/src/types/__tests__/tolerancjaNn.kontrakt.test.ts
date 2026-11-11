// @vitest-environment node
/**
 * Słownik tolerancji napięcia sieci nN frontu PRZYPIĘTY do jedynego źródła backendu
 * (`backend/src/network_model/core/voltage_factor.py`: `TOLERANCJE_NAPIECIA_NN`,
 * `ETYKIETA_TOLERANCJI_NN`, `_TABELA_1_NN`) — karta WSPOLCZYNNIK-C-JEDEN-NOSNIK.
 *
 * Etykieta opcji opisuje wiersz nN tabeli 1 IEC 60909-0 (c_max; c_min). UI tych liczb
 * nie używa do obliczeń, ale gdyby rozjechały się z tabelą backendu, inżynier wybierałby
 * opcję opisaną fałszywie — dlatego rozjazd ma być czerwonym testem, nie cichą drugą listą.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ETYKIETA_PL_TOLERANCJI_NN, TOLERANCJE_NAPIECIA_NN } from '../uziemienie';

const ZRODLO = readFileSync(
  resolve(__dirname, '../../../../backend/src/network_model/core/voltage_factor.py'),
  'utf8',
);

function fmtPL(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

describe('tolerancja napięcia sieci nN — słownik frontu = backend', () => {
  it('lista wartości = TOLERANCJE_NAPIECIA_NN', () => {
    const m = /TOLERANCJE_NAPIECIA_NN:[^=]*=\s*\(([^)]*)\)/.exec(ZRODLO);
    expect(m).not.toBeNull();
    const wartosci = [...(m?.[1] ?? '').matchAll(/"([A-Z0-9_]+)"/g)].map((x) => x[1]);
    expect([...TOLERANCJE_NAPIECIA_NN]).toEqual(wartosci);
  });

  it.each(TOLERANCJE_NAPIECIA_NN.map((t) => [t]))(
    'etykieta %s = brzmienie backendu i wiersz nN tabeli 1 (c_max; c_min)',
    (tolerancja) => {
      const etykieta = new RegExp(`"${tolerancja}":\\s*"([^"]+)"`).exec(
        ZRODLO.slice(ZRODLO.indexOf('ETYKIETA_TOLERANCJI_NN')),
      );
      const tabela = new RegExp(`"${tolerancja}":\\s*\\(([0-9.]+),\\s*([0-9.]+)\\)`).exec(
        ZRODLO.slice(ZRODLO.indexOf('_TABELA_1_NN')),
      );
      expect(etykieta).not.toBeNull();
      expect(tabela).not.toBeNull();
      const [cMax, cMin] = [Number(tabela?.[1]), Number(tabela?.[2])];
      expect(ETYKIETA_PL_TOLERANCJI_NN[tolerancja]).toBe(
        `${etykieta?.[1]} (c_max ${fmtPL(cMax)}; c_min ${fmtPL(cMin)})`,
      );
    },
  );
});
