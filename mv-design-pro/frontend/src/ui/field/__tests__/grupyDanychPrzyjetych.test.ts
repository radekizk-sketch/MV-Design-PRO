/**
 * UX-04 (ZASADA NR 4 pkt 4): dane przyjęte wyposażenia pola podane dyskretnie — JEDNA adnotacja
 * na wspólny powód i jakość, każdy aparat nadal wymieniony z nazwy (pomiar 2026-10-29: zdanie
 * powodu powtarzało się przy każdym z dziesięciu aparatów pola Z.11.1).
 *
 * Iloczyn cech: powód {wspólny, różny} × jakość {wspólna, różna} × kolejność {przeplot grup}.
 */
import { describe, expect, it } from 'vitest';

import type { DanaPrzyjetaWyposazenia } from '../../../types/enm';
import { grupyDanychPrzyjetych } from '../EdytorWyposazeniaPola';

const BEZ_KATALOGU = 'rodzaj aparatu bez katalogu SN — przyjęty z szablonu pola jako wartość robocza';
const Z_SZABLONU = 'aparat z szablonu pola bez pozycji katalogowej — wartość robocza do zastąpienia wyborem z katalogu';

function dana(nazwa_pl: string, powod_pl: string, jakosc = 'ESTIMATED'): DanaPrzyjetaWyposazenia {
  return { nazwa_pl, wartosc: null, powod_pl, jakosc };
}

describe('grupyDanychPrzyjetych — jedna adnotacja na powód i jakość', () => {
  it('wspólny powód i jakość × przeplot z innym powodem: dwie grupy, nazwy w kolejności pola', () => {
    const grupy = grupyDanychPrzyjetych([
      dana('wskaźnik napięcia PF0', BEZ_KATALOGU),
      dana('łącznik trójpołożeniowy Q1', BEZ_KATALOGU),
      dana('przekładnik napięciowy T3', Z_SZABLONU),
      dana('głowica kablowa GK', BEZ_KATALOGU),
    ]);
    expect(grupy).toEqual([
      { powod_pl: BEZ_KATALOGU, jakosc: 'ESTIMATED', nazwy: ['wskaźnik napięcia PF0', 'łącznik trójpołożeniowy Q1', 'głowica kablowa GK'] },
      { powod_pl: Z_SZABLONU, jakosc: 'ESTIMATED', nazwy: ['przekładnik napięciowy T3'] },
    ]);
  });

  it('ten sam powód × różna jakość: osobne grupy (jakość nie jest scalana)', () => {
    const grupy = grupyDanychPrzyjetych([dana('Q1', BEZ_KATALOGU, 'ESTIMATED'), dana('Q0', BEZ_KATALOGU, 'DEFAULT')]);
    expect(grupy.map((g) => [g.jakosc, g.nazwy])).toEqual([
      ['ESTIMATED', ['Q1']],
      ['DEFAULT', ['Q0']],
    ]);
  });

  it('pusta lista: brak grup', () => {
    expect(grupyDanychPrzyjetych([])).toEqual([]);
  });

  it('każdy rekord wymieniony dokładnie raz — liczba nazw = liczba rekordów', () => {
    const dane = Array.from({ length: 10 }, (_, i) => dana(`aparat ${i}`, i % 3 === 0 ? Z_SZABLONU : BEZ_KATALOGU));
    const grupy = grupyDanychPrzyjetych(dane);
    expect(grupy.flatMap((g) => g.nazwy).sort()).toEqual(dane.map((d) => d.nazwa_pl).sort());
  });
});
