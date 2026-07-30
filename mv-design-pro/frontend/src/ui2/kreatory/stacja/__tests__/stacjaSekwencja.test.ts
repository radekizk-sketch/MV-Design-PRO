/**
 * Sekwencja operacji po zapisie stacji (K9-B krok 4): CT → VT → zabezpieczenie.
 *
 * Intencja testów: kreator dokłada wyposażenie pól WYŁĄCZNIE realnymi
 * operacjami domenowymi i wyłącznie tam, gdzie projektant coś wskazał (brak
 * wskazania = brak operacji, nie domyślny przekładnik). Przy błędzie kroku
 * pośredniego sekwencja przerywa i raportuje, ile operacji wykonano — stacja
 * pozostaje zapisana (dług B-3: brak atomowości po stronie backendu).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  polaUtworzonejStacji,
  refUtworzonejStacji,
  wykonajSekwencje,
  zbudujSekwencjeWyposazenia,
  type WyposazeniePola,
} from '../stacjaSekwencja';

type Odpowiedz = Parameters<typeof polaUtworzonejStacji>[0];

function odpowiedz(refStacji: string): Odpowiedz {
  return {
    changes: { created_element_ids: [refStacji, `${refStacji}/bus`], updated_element_ids: [], deleted_element_ids: [] },
    snapshot: {
      substations: [
        {
          ref_id: refStacji,
          meta: {
            field_specs: [
              { field_ref: 'field/1/in', meta: { field_role: 'LINIA_IN' } },
              { field_ref: 'field/1/tr', meta: { field_role: 'TRANSFORMATOROWE' } },
            ],
          },
        },
      ],
    },
  } as unknown as Odpowiedz;
}

function wyposazenie(over: Partial<WyposazeniePola> = {}): WyposazeniePola {
  return {
    field_role: 'LINIA_IN',
    ct_catalog_ref: null,
    ct_ratio_primary_a: null,
    ct_ratio_secondary_a: null,
    vt_catalog_ref: null,
    vt_ratio_primary_v: null,
    vt_ratio_secondary_v: null,
    relay_catalog_ref: null,
    relay_type: 'NADPRADOWY',
    ...over,
  };
}

describe('sekwencja wyposażenia pól stacji', () => {
  it('rozpoznaje stację utworzoną przez operację (oba wzorce identyfikatorów)', () => {
    // Podział odcinka: `stn/…/station`; dopięcie na końcu: `sub/…/substation`.
    expect(refUtworzonejStacji(odpowiedz('stn/abc/station'))).toBe('stn/abc/station');
    expect(refUtworzonejStacji(odpowiedz('sub/abc/substation'))).toBe('sub/abc/substation');
    expect(refUtworzonejStacji(null)).toBeNull();
  });

  it('czyta pola utworzonej stacji w kolejności zapisu', () => {
    const pola = polaUtworzonejStacji(odpowiedz('stn/abc/station'), null);
    expect(pola).toEqual([
      { field_role: 'LINIA_IN', field_ref: 'field/1/in' },
      { field_role: 'TRANSFORMATOROWE', field_ref: 'field/1/tr' },
    ]);
  });

  it('buduje operacje tylko dla wskazanego wyposażenia (brak wskazania = brak operacji)', () => {
    const pola = polaUtworzonejStacji(odpowiedz('stn/abc/station'), null);
    const kroki = zbudujSekwencjeWyposazenia(pola, [
      wyposazenie({
        field_role: 'LINIA_IN',
        ct_catalog_ref: 'ct-400-5',
        ct_ratio_primary_a: 400,
        ct_ratio_secondary_a: 5,
        relay_catalog_ref: 'relay-1',
      }),
      wyposazenie({ field_role: 'TRANSFORMATOROWE' }),
    ]);
    expect(kroki.map((k) => k.operacja)).toEqual(['add_ct', 'add_relay']);
    expect(kroki[0].payload).toMatchObject({
      bay_ref: 'field/1/in',
      catalog_ref: 'ct-400-5',
      ratio_primary_a: 400,
      ratio_secondary_a: 5,
    });
    // Zabezpieczenie idzie PO przekładniku (add_relay wiąże CT tego pola).
    expect(kroki[1].payload).toMatchObject({ bay_ref: 'field/1/in', relay_type: 'NADPRADOWY' });
  });

  it('CT bez przekładni z katalogu nie generuje operacji (zero fabrykacji)', () => {
    const pola = polaUtworzonejStacji(odpowiedz('stn/abc/station'), null);
    const kroki = zbudujSekwencjeWyposazenia(pola, [
      wyposazenie({ field_role: 'LINIA_IN', ct_catalog_ref: 'ct-bez-danych' }),
    ]);
    expect(kroki).toHaveLength(0);
  });

  it('przerywa na pierwszym błędzie i raportuje liczbę wykonanych operacji', async () => {
    const wykonaj = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: 'Pole SN nie ma wyłącznika wykonawczego.' });
    const wynik = await wykonajSekwencje(
      [
        { operacja: 'add_ct', fieldRef: 'f1', payload: {} },
        { operacja: 'add_relay', fieldRef: 'f1', payload: {} },
        { operacja: 'add_vt', fieldRef: 'f1', payload: {} },
      ],
      wykonaj,
    );
    expect(wynik.wykonane).toBe(1);
    expect(wynik.bladOperacji).toBe('Pole SN nie ma wyłącznika wykonawczego.');
    // Trzeci krok NIE został wykonany — brak cichego „udało się".
    expect(wykonaj).toHaveBeenCalledTimes(2);
  });

  it('komplet operacji kończy się bez błędu', async () => {
    const wykonaj = vi.fn().mockResolvedValue({ error: null });
    const wynik = await wykonajSekwencje(
      [
        { operacja: 'add_ct', fieldRef: 'f1', payload: {} },
        { operacja: 'add_vt', fieldRef: 'f1', payload: {} },
      ],
      wykonaj,
    );
    expect(wynik).toMatchObject({ wykonane: 2, bladOperacji: null });
  });
});
