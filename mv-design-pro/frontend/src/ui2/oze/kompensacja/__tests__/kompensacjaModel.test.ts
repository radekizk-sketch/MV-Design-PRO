// @vitest-environment node
/*
 * Znacznik ostrzeżenia komórek cosφ punktu z REKORDU W kandydata (karta WERDYKT-MIGRACJA-190,
 * D18). Dawniej komórka zapalała znacznik z flagi `spelnia_dzien` / `spelnia_noc`, a komórka
 * oceny pisała „spełnia / nie spełnia” bez kryterium i limitu.
 *
 * Iloczyn cech: scenariusz (dzień, noc) × stan składowej (spełniona, naruszona, bez wyniku)
 * × wartość cosφ w komórce (ta sama liczba przy każdym stanie — znacznik nie może wynikać
 * z porównania liczby w oknie).
 */
import { describe, expect, it } from 'vitest';

import type { KandydatKompensacji } from '../../api';
import { skladowaScenariusza, wierszeTabeliKompensacji } from '../kompensacjaModel';
import { REKORDY, widokNocFixture } from './fixtures';

const BAZA = widokNocFixture().candidates[1];

const STANY = {
  spelniona: REKORDY['noc_cap-0v6'],
  naruszona: REKORDY['noc_cap-0v3'],
  bez_wyniku_noc: REKORDY['bez_wyniku_noc'],
} as const;

describe('wiersz kandydata — znacznik i ocena z rekordu W', () => {
  const przypadki = (['dzien', 'noc'] as const).flatMap((scenariusz) =>
    (Object.keys(STANY) as (keyof typeof STANY)[]).map((stan) => [scenariusz, stan] as const),
  );

  it.each(przypadki)('%s · %s', (scenariusz, stan) => {
    const kandydat: KandydatKompensacji = { ...BAZA, wymaganie: STANY[stan] };
    const [wiersz] = wierszeTabeliKompensacji([kandydat], true);
    const komorka = wiersz[`cosfi_punktu_${scenariusz}`];
    const skladowa = skladowaScenariusza(kandydat, scenariusz);
    expect(skladowa).toBeDefined();
    // Liczba w komórce jest wartością kandydata, znacznik — statusem składowej rekordu.
    expect(komorka.ostrzezenie).toBe(skladowa?.status_maszynowy === 'NIE_SPELNIA');
    expect(wiersz.werdykt.wartosc).toBe(STANY[stan].etykieta.etykieta_pl);
  });

  it('bez wyniku nocy: składowa „nieocenione” bez znacznika naruszenia i bez „spełnia”', () => {
    const kandydat: KandydatKompensacji = { ...BAZA, wymaganie: STANY.bez_wyniku_noc };
    const noc = skladowaScenariusza(kandydat, 'noc');
    expect(noc?.status_maszynowy).toBe('NIE_OCENIONO');
    expect(noc?.wyjasnienie.czego_brakuje.join(' ')).toContain('nie dał rozwiązania');
    const [wiersz] = wierszeTabeliKompensacji([kandydat], true);
    expect(wiersz.cosfi_punktu_noc.ostrzezenie).toBe(false);
    expect(STANY.bez_wyniku_noc.status_maszynowy).not.toBe('SPELNIA');
  });

  it('scenariusz nocny nieliczony → brak składowej nocy', () => {
    expect(skladowaScenariusza({ ...BAZA, wymaganie: REKORDY['cap-0v6'] }, 'noc')).toBeUndefined();
  });
});
