// @vitest-environment node
/**
 * Znamiona rozdzielnicy z aparatury pól — iloczyn cech: pole z aparatem / bez aparatu ×
 * karta z prądem cieplnym / bez (wartość robocza rejestru) / bez propozycji × kilka pól
 * (najsłabszy aparat ogranicza rozdzielnicę).
 */
import { describe, expect, it } from 'vitest';

import type { MVApparatusType } from '../../../catalog/types';
import { znamionaRozdzielnicy } from '../znamionaRozdzielnicy';

const aparat = (id: string, i_n_a: number, i_th_ka: number | null, robocza?: number): MVApparatusType =>
  ({
    id,
    name: id.toUpperCase(),
    device_kind: 'CIRCUIT_BREAKER',
    u_n_kv: 24,
    i_n_a,
    i_th_ka,
    wartosci_robocze:
      robocza === undefined
        ? []
        : [{ parametr: 'i_th_ka', nazwa_pl: 'Ith', wartosc: robocza, jednostka: 'kA', rodzaj_zrodla: 'NORMA', odniesienie: 'IEC 62271-1', uzasadnienie_pl: '', wplyw_pl: '' }],
  }) as MVApparatusType;

describe('znamionaRozdzielnicy', () => {
  it('najsłabszy aparat ogranicza rozdzielnicę; dane karty = DATASHEET', () => {
    const wynik = znamionaRozdzielnicy(
      [
        { designation: '01', apparatusCatalogRef: 'a' },
        { designation: '02', apparatusCatalogRef: 'b' },
      ],
      [aparat('a', 1250, 25), aparat('b', 630, 20)],
    );
    expect(wynik.ratedCurrent).toEqual({ wartosc: 630, jednostka: 'A', zrodloPl: 'B, pole 02', jakosc: 'DATASHEET' });
    expect(wynik.ratedShortCircuit?.wartosc).toBe(20);
    expect(wynik.baysWithoutApparatus).toBe(0);
  });

  it('karta bez prądu cieplnego → wartość robocza rejestru (ESTIMATED z podstawą)', () => {
    const wynik = znamionaRozdzielnicy([{ designation: '01', apparatusCatalogRef: 'a' }], [aparat('a', 630, null, 16)]);
    expect(wynik.ratedShortCircuit).toEqual({
      wartosc: 16,
      jednostka: 'kA',
      zrodloPl: 'A, pole 01',
      jakosc: 'ESTIMATED',
      podstawaPl: 'IEC 62271-1',
    });
  });

  it('brak propozycji i brak danych karty → brak znamienia (bez wartości z kodu)', () => {
    const wynik = znamionaRozdzielnicy([{ designation: '01', apparatusCatalogRef: 'a' }], [aparat('a', 630, null)]);
    expect(wynik.ratedShortCircuit).toBeNull();
  });

  it('pola bez aparatu (albo z nieznaną pozycją) to brak modelu, liczony jawnie', () => {
    const wynik = znamionaRozdzielnicy(
      [
        { designation: '01', apparatusCatalogRef: null },
        { designation: '02', apparatusCatalogRef: 'nieznany' },
      ],
      [aparat('a', 630, 20)],
    );
    expect(wynik).toEqual({ ratedCurrent: null, ratedShortCircuit: null, baysWithoutApparatus: 2 });
  });
});
