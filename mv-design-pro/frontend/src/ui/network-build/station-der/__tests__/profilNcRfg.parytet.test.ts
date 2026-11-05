// @vitest-environment node
/**
 * Parytet lustra profilu efektywnego NC RfG z regułą backendu (dodatek karty GPZ-DANE-ANALIZ).
 *
 * Oczekiwania wytwarza backend: `enm/operator_sieci.py::efektywny_profil_ncrfg` na iloczynie
 * cech profil źródła {brak, pusty, enea, „  enea  ”, pse} × operator sieci {brak, enea} × powód
 * nadpisania {brak, podany} (`scripts/eksport_fixtur_harnessu.py::ncrfg_profil_efektywny_parytet`).
 * Rozjazd reguły po którejkolwiek stronie (np. front przestaje dziedziczyć operatora sieci albo
 * inaczej rozpoznaje nadpisanie) czerwieni test.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { efektywnyProfilNcRfg, profilNcRfgModulu } from '../profilNcRfg';

interface PrzypadekParytetu {
  readonly wejscie: {
    readonly nc_rfg_profile_ref: string | null;
    readonly nc_rfg_profile_powod: string | null;
    readonly operator_sieci: string | null;
  };
  readonly wynik: {
    readonly operator_id: string | null;
    readonly zrodlo: 'PROFIL_ZRODLA' | 'OPERATOR_SIECI' | 'BRAK';
    readonly nadpisanie: boolean;
  };
}

const SCIEZKA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../harness-fixtures/generated/ncrfg_profil_efektywny_parytet.json',
);
const { przypadki } = JSON.parse(readFileSync(SCIEZKA, 'utf-8')) as {
  readonly przypadki: readonly PrzypadekParytetu[];
};

describe('profil efektywny NC RfG — lustro reguły backendu', () => {
  it('tabela backendu pokrywa pełny iloczyn cech (5 × 2 × 2)', () => {
    expect(przypadki).toHaveLength(20);
    expect(new Set(przypadki.map((p) => p.wynik.zrodlo))).toEqual(
      new Set(['PROFIL_ZRODLA', 'OPERATOR_SIECI', 'BRAK']),
    );
    expect(przypadki.some((p) => p.wynik.nadpisanie)).toBe(true);
  });

  it.each(przypadki.map((p) => [JSON.stringify(p.wejscie), p] as const))(
    'wejście %s: operator, źródło i nadpisanie jak w backendzie',
    (_opis, { wejscie, wynik }) => {
      const oczekiwany = {
        operator_id: wynik.operator_id,
        zrodlo: wynik.zrodlo,
        nadpisanie: wynik.nadpisanie,
      };
      expect(efektywnyProfilNcRfg(wejscie.nc_rfg_profile_ref, wejscie.operator_sieci)).toEqual(
        oczekiwany,
      );
      expect(
        profilNcRfgModulu({
          profiles: { nc_rfg_profile_ref: wejscie.nc_rfg_profile_ref },
          operator_sieci: wejscie.operator_sieci,
        }),
      ).toEqual(oczekiwany);
    },
  );
});
