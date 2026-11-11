// @vitest-environment node
/**
 * Predykat kluczy spoza kontraktu (TS) przypięty PARAMI do predykatu backendu.
 *
 * `wektory` kontraktu liczy backend (`klucze_spoza_kontraktu`) dla iloczynu: poziom
 * {0, 1, 2, 3} × {klucz w kontrakcie, obcy} × {obiekt, element listy} oraz napis w miejscu
 * obiektu — ten sam ładunek musi dać tę samą listę kluczy obcych po obu stronach.
 */
import { describe, expect, it } from 'vitest';

import { WEKTORY_KONTRAKTU, kluczeSpozaKontraktu } from '../kontraktLadunkuOperacji';

function glebokosc(wartosc: unknown): number {
  if (Array.isArray(wartosc)) return Math.max(0, ...wartosc.map(glebokosc));
  if (typeof wartosc !== 'object' || wartosc === null) return 0;
  return 1 + Math.max(0, ...Object.values(wartosc).map(glebokosc));
}

describe('kontraktLadunkuOperacji — parytet z backendem', () => {
  it('wektory pokrywają iloczyn cech (poziomy, obcy/w kontrakcie, lista, napis)', () => {
    expect(WEKTORY_KONTRAKTU.length).toBeGreaterThan(300);
    const poziomy = new Set(WEKTORY_KONTRAKTU.map((w) => glebokosc(w.ladunek)));
    expect([...poziomy].sort()).toEqual([1, 2, 3, 4]);
    expect(WEKTORY_KONTRAKTU.some((w) => w.obce.length === 0)).toBe(true);
    expect(WEKTORY_KONTRAKTU.some((w) => w.obce.some((k) => k.includes('[1].')))).toBe(true);
    expect(
      WEKTORY_KONTRAKTU.some((w) => Object.values(w.ladunek).includes('napis_w_miejscu_obiektu')),
    ).toBe(true);
    // Rodzina kluczy `{side}_…` (uziemienie nN) — dopasowanie wzorcem, nie równością.
    expect(
      WEKTORY_KONTRAKTU.some((w) => JSON.stringify(w.ladunek).includes('"mv_') && w.obce.length === 0),
    ).toBe(true);
  });

  it.each(WEKTORY_KONTRAKTU.map((w, i) => ({ ...w, i })))(
    'wektor $i: $operacja',
    ({ operacja, ladunek, obce }) => {
      expect(kluczeSpozaKontraktu(operacja, ladunek)).toEqual(obce);
    },
  );

  it('nieznana operacja to błąd nadawcy, nie pusta lista', () => {
    expect(() => kluczeSpozaKontraktu('operacja_ktorej_nie_ma', {})).toThrow(/Nieznana operacja/);
  });
});
