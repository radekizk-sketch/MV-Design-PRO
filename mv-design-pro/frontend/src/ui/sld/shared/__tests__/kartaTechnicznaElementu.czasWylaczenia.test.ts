/**
 * Karta techniczna aparatu — czas wyłączenia zwarcia obwodu (wartość projektanta, zasada nr 4).
 *
 * Iloczyn cech: rodzaj gałęzi aparatu {wyłącznik, rozłącznik, odłącznik, bezpiecznik, sprzęgło}
 * × deklaracja {brak, 0,3 s}. Wiersz ma edycję operacją `update_element_parameters` z kluczem
 * `czas_wylaczenia_zwarcia_s` (lista dozwolona backendu); sprzęgło szyn nie chroni obwodu —
 * wiersza nie ma. Bez deklaracji wiersz mówi, skąd obliczenie weźmie czas, a nie „brak danych”.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { DaneElementuKanwy } from '../daneElementuKanwy';
import { buildKartaTechniczna, type WierszKarty } from '../kartaTechnicznaElementu';

type Rodzaj = 'breaker' | 'switch' | 'disconnector' | 'fuse' | 'bus_coupler';

function model(rodzaj: Rodzaj, czas: number | null): EnergyNetworkModel {
  const szyna = (ref_id: string) => ({ id: ref_id, ref_id, name: ref_id, voltage_kv: 0.4, tags: [], meta: {} });
  return {
    header: { name: 'czas wyłączenia' },
    buses: [szyna('a'), szyna('b')],
    substations: [],
    bays: [],
    branches: [
      {
        id: 'ap',
        ref_id: 'ap',
        name: 'Aparat',
        type: rodzaj,
        from_bus_ref: 'a',
        to_bus_ref: 'b',
        status: 'closed',
        tags: [],
        meta: {},
        ...(czas === null ? {} : { czas_wylaczenia_zwarcia_s: czas }),
      },
    ],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
  } as unknown as EnergyNetworkModel;
}

function wiersz(rodzaj: Rodzaj, czas: number | null): WierszKarty | undefined {
  const karta = buildKartaTechniczna(model(rodzaj, czas), {
    kind: 'apparatus',
    elementId: 'ap',
  } as DaneElementuKanwy);
  expect(karta).not.toBeNull();
  return karta!.sekcje.flatMap((s) => s.wiersze).find((w) => w.klucz === 'czas_wylaczenia_zwarcia');
}

const APARATY: readonly Rodzaj[] = ['breaker', 'switch', 'disconnector', 'fuse'];

describe('karta aparatu — czas wyłączenia zwarcia obwodu', () => {
  it.each(APARATY.flatMap((r) => [[r, null] as const, [r, 0.3] as const]))(
    '%s, deklaracja %s',
    (rodzaj, czas) => {
      const w = wiersz(rodzaj, czas);
      expect(w).toBeDefined();
      expect(w!.edycja).toEqual({
        elementRef: 'ap',
        parametr: 'czas_wylaczenia_zwarcia_s',
        wartosc: czas === null ? '' : String(czas),
      });
      if (czas === null) {
        expect(w!.wartosc).toBe('z charakterystyki aparatu albo wartość robocza PN-HD 60364-4-41');
        expect(w!.zrodloPl).toBe('wyznacza obliczenie');
      } else {
        expect(w!.wartosc).toBe('0,3 s');
        expect(w!.zrodloPl).toBe('wartość projektanta');
      }
    },
  );

  it('sprzęgło szyn nie chroni obwodu — bez wiersza czasu wyłączenia', () => {
    expect(wiersz('bus_coupler', null)).toBeUndefined();
  });
});
