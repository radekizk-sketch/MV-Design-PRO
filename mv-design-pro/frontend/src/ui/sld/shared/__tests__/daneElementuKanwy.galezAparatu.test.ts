/**
 * Gałąź łącznika albo bezpiecznika × wejście do panelu elementu jako odcinek (`segment`:
 * selekcja z drzewa/wyszukiwarki rozstrzygnięta kotwicą `galaz`, klik w kreskę toru).
 *
 * Predykaty PARAMI z jednego źródła: kategoria menu gałęzi (`menuKindGalezi`) i rodzaj danych
 * panelu (`buildDaneElementuKanwy`) muszą zgodnie mówić „aparat” albo „odcinek” dla KAŻDEGO
 * rodzaju gałęzi modelu (`RODZAJE_GALEZI`). Do poprawki wyłącznik wybrany z drzewa dostawał
 * menu aparatu, a kartę „Odcinek kablowy” z trasą i katalogiem kabla.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { RODZAJE_GALEZI, jestRodzajemGaleziAparatu, type RodzajGalezi } from '../../../../types/rodzajeGalezi';
import { buildSldDataFromSnapshot } from '../../v2/canvas/enmToSldAdapter';
import { menuKindGalezi } from '../../v3/canvas/canvasMenuSubject';
import { buildDaneElementuKanwy } from '../daneElementuKanwy';
import { buildKartaTechniczna } from '../kartaTechnicznaElementu';

function model(rodzaj: RodzajGalezi): EnergyNetworkModel {
  return {
    buses: [
      { id: 'b1', ref_id: 'b1', name: 'Szyna 1', voltage_kv: 15, tags: [], meta: {} },
      { id: 'b2', ref_id: 'b2', name: 'Szyna 2', voltage_kv: 15, tags: [], meta: {} },
    ],
    branches: [
      {
        id: 'g1',
        ref_id: 'g1',
        name: 'Gałąź badana',
        type: rodzaj,
        status: 'closed',
        from_bus_ref: 'b1',
        to_bus_ref: 'b2',
        tags: [],
        meta: {},
      },
    ],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    branch_points: [],
  } as unknown as EnergyNetworkModel;
}

describe('gałąź modelu × panel elementu wywołany jako odcinek', () => {
  it('lista rodzajów gałęzi nie jest pusta i zawiera oba podzbiory', () => {
    expect(RODZAJE_GALEZI.some((r) => jestRodzajemGaleziAparatu(r))).toBe(true);
    expect(RODZAJE_GALEZI.some((r) => !jestRodzajemGaleziAparatu(r))).toBe(true);
  });

  it.each(RODZAJE_GALEZI)('%s: menu i panel zgodnie — aparat albo odcinek', (rodzaj) => {
    const snapshot = model(rodzaj);
    const dane = buildDaneElementuKanwy(snapshot, buildSldDataFromSnapshot(snapshot, null), null, 'segment', 'g1', undefined);
    const aparatWMenu = menuKindGalezi(rodzaj) === 'apparatus';
    expect(dane?.kind === 'apparatus').toBe(aparatWMenu);
    expect(dane?.kind === 'cable_run').toBe(!aparatWMenu);
    const karta = buildKartaTechniczna(snapshot, dane);
    expect(karta?.rodzaj).toBe(aparatWMenu ? 'lacznik' : 'odcinek');
  });
});
