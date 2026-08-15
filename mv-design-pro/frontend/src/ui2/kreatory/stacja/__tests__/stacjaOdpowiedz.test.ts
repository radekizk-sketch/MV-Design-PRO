/**
 * Odczyt odpowiedzi operacji stacyjnej (kreator stacji, krok 8).
 *
 * Intencja zachowana z testów sekwencji wyposażenia (K9-B): kreator musi
 * rozpoznać UTWORZONĄ stację niezależnie od wzorca identyfikatora operacji
 * (`stn/…/station` przy podziale odcinka, `sub/…/substation` przy dopięciu na
 * końcu), bo od tej referencji zależy łańcuchowanie kolejnego kroku.
 *
 * Testy sekwencji `add_ct`/`add_vt`/`add_relay` po zapisie zniknęły razem z
 * samą sekwencją: po zamknięciu długu B-3 (karta KD-2) wyposażenie pól powstaje
 * W TEJ SAMEJ operacji co stacja — atomowość pilnują testy backendu
 * (`tests/enm/test_station_field_equipment_atomic.py`) oraz test kreatora
 * sprawdzający payload (`stacjaModel.test.ts`, `KreatorStacjiSnNn.test.tsx`).
 */

import { describe, expect, it } from 'vitest';

import { refUtworzonejStacji } from '../stacjaOdpowiedz';

type Odpowiedz = Parameters<typeof refUtworzonejStacji>[0];

function odpowiedz(refStacji: string): Odpowiedz {
  return {
    changes: {
      created_element_ids: [refStacji, `${refStacji}/bus`],
      updated_element_ids: [],
      deleted_element_ids: [],
    },
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

describe('odczyt odpowiedzi operacji stacyjnej', () => {
  it('rozpoznaje stację utworzoną przez operację (oba wzorce identyfikatorów)', () => {
    // Podział odcinka: `stn/…/station`; dopięcie na końcu: `sub/…/substation`.
    expect(refUtworzonejStacji(odpowiedz('stn/abc/station'))).toBe('stn/abc/station');
    expect(refUtworzonejStacji(odpowiedz('sub/abc/substation'))).toBe('sub/abc/substation');
    expect(refUtworzonejStacji(null)).toBeNull();
  });

  it('stacja spoza `created_element_ids` nie jest uznana za utworzoną', () => {
    const cudza = odpowiedz('stn/abc/station') as unknown as {
      changes: { created_element_ids: string[] };
    };
    cudza.changes.created_element_ids = ['stn/inna/station'];
    expect(refUtworzonejStacji(cudza as unknown as Odpowiedz)).toBeNull();
  });
});
