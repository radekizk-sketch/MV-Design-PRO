/**
 * Lokalizacje urządzeń zabezpieczeniowych z modelu (V12K-262).
 *
 * Testy pilnują JEDNEJ rzeczy, od której zależy cała koordynacja: identyfikatorem
 * lokalizacji jest `ref_id`, bo tą samą przestrzenią nazw posługują się wiersze
 * wyników (`element_id`). Gdyby ktoś przełączył to na `id`, ekran wróciłby do
 * stanu „bieg policzony, a prądów brak" — tyle że po cichu.
 */

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { etykietaLokalizacji, lokalizacjeKoordynacji } from '../lokalizacjeZModelu';

function model(czesci: Partial<EnergyNetworkModel>): EnergyNetworkModel {
  return {
    buses: [],
    branches: [],
    transformers: [],
    ...czesci,
  } as unknown as EnergyNetworkModel;
}

describe('lokalizacjeKoordynacji', () => {
  it('identyfikatorem jest ref_id, NIE id — to przestrzeń nazw wierszy wyniku', () => {
    const wynik = lokalizacjeKoordynacji(
      model({
        buses: [
          { id: 'wewnetrzny-uuid', ref_id: 'gpz/sekcja_a/bus_sn', name: 'GPZ szyna A' },
        ],
      } as unknown as Partial<EnergyNetworkModel>),
    );
    expect(wynik).toHaveLength(1);
    expect(wynik[0].refId).toBe('gpz/sekcja_a/bus_sn');
    expect(wynik[0].nazwa).toBe('GPZ szyna A');
  });

  it('zbiera szyny, gałęzie i transformatory w deterministycznej kolejności', () => {
    const wynik = lokalizacjeKoordynacji(
      model({
        buses: [
          { id: 'b2', ref_id: 'bus/z', name: 'Szyna Z' },
          { id: 'b1', ref_id: 'bus/a', name: 'Szyna A' },
        ],
        branches: [{ id: 'l1', ref_id: 'lin/1', name: 'Linia 1' }],
        transformers: [{ id: 't1', ref_id: 'tr/1', name: 'Transformator 1' }],
      } as unknown as Partial<EnergyNetworkModel>),
    );
    expect(wynik.map((l) => l.refId)).toEqual(['bus/a', 'bus/z', 'lin/1', 'tr/1']);
    expect(wynik.map((l) => l.rodzaj)).toEqual(['szyna', 'szyna', 'galaz', 'transformator']);
  });

  it('element bez ref_id NIE trafia na listę — nie da się go dopasować do wyniku', () => {
    const wynik = lokalizacjeKoordynacji(
      model({
        buses: [
          { id: 'b1', ref_id: '', name: 'Szyna bez ref' },
          { id: 'b2', ref_id: 'bus/ok', name: 'Szyna z ref' },
        ],
      } as unknown as Partial<EnergyNetworkModel>),
    );
    expect(wynik.map((l) => l.refId)).toEqual(['bus/ok']);
  });

  it('bez modelu lista jest pusta (a nie wymyślona)', () => {
    expect(lokalizacjeKoordynacji(null)).toEqual([]);
  });

  it('etykieta niesie nazwę, rodzaj i identyfikator modelu', () => {
    expect(
      etykietaLokalizacji({ refId: 'bus/a', nazwa: 'Szyna A', rodzaj: 'szyna' }),
    ).toBe('Szyna A (szyna) · bus/a');
  });
});
