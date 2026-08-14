import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { budujDrzewoNn, listujOdcinkiKablowNn, listujStacjeNn } from '../nnStudioTreeAdapter';

/**
 * Migawka: TR → odpływ pośredni (szyna zwykła) → RGnN dwusekcyjna (sprzęgło
 * sekcyjne) → odpływ sekcji 2 → szyna liścia z odbiorem i źródłem. Kształt
 * pól 1:1 z realną odpowiedzią backendu (mirror `enm/models.py`).
 */
function migawka(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Test nN STUDIO',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
      revision: 1,
      hash_sha256: '',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [
      { id: 'bus-sn-id', ref_id: 'bus-sn', name: 'Szyna SN', tags: [], meta: {}, voltage_kv: 15, phase_system: '3ph' },
      { id: 'bus-tr-lv-id', ref_id: 'bus-tr-lv', name: 'Szyna nN TR1', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
      { id: 'bus-mid-id', ref_id: 'bus-mid', name: 'Szyna nN pośrednia', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
      { id: 'bus-rgnn-s1-id', ref_id: 'bus-rgnn-s1', name: 'RGnN sekcja 1', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
      { id: 'bus-rgnn-s2-id', ref_id: 'bus-rgnn-s2', name: 'RGnN sekcja 2', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
      { id: 'bus-leaf-id', ref_id: 'bus-leaf', name: 'Szyna K1', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
    ],
    branches: [
      { id: 'cbl-1-id', ref_id: 'cbl-1', name: 'Kabel nN 1', tags: [], meta: {}, type: 'cable', from_bus_ref: 'bus-tr-lv', to_bus_ref: 'bus-mid', status: 'closed', length_km: 0.05, r_ohm_per_km: 0.5, x_ohm_per_km: 0.08 },
      { id: 'cbl-2-id', ref_id: 'cbl-2', name: 'Kabel nN 2', tags: [], meta: {}, type: 'cable', from_bus_ref: 'bus-mid', to_bus_ref: 'bus-rgnn-s1', status: 'closed', length_km: 0.03, r_ohm_per_km: 0.5, x_ohm_per_km: 0.08 },
      { id: 'coupler-1-id', ref_id: 'coupler-1', name: 'Sprzęgło sekcyjne RGnN', tags: [], meta: {}, type: 'bus_coupler', from_bus_ref: 'bus-rgnn-s1', to_bus_ref: 'bus-rgnn-s2', status: 'closed', r_ohm: 0, x_ohm: 0 },
      { id: 'cbl-3-id', ref_id: 'cbl-3', name: 'Kabel nN 3', tags: [], meta: {}, type: 'cable', from_bus_ref: 'bus-rgnn-s2', to_bus_ref: 'bus-leaf', status: 'closed', length_km: 0.02, r_ohm_per_km: 0.5, x_ohm_per_km: 0.08 },
    ],
    transformers: [
      {
        id: 'tr-1-id', ref_id: 'tr-1', name: 'TR1', tags: [], meta: {},
        hv_bus_ref: 'bus-sn', lv_bus_ref: 'bus-tr-lv', sn_mva: 0.4, uhv_kv: 15, ulv_kv: 0.4,
        uk_percent: 4, pk_kw: 3.5,
      },
    ],
    sources: [],
    loads: [
      { id: 'load-1-id', ref_id: 'load-1', name: 'Odbiór K1', tags: [], meta: {}, bus_ref: 'bus-leaf', p_mw: 0.01, q_mvar: 0.002, model: 'pq' },
    ],
    generators: [
      { id: 'gen-1-id', ref_id: 'gen-1', name: 'PV K1', tags: [], meta: {}, bus_ref: 'bus-leaf', p_mw: 0.02 },
    ],
    substations: [
      {
        id: 'st-tr-id', ref_id: 'st-tr', name: 'Stacja SN/nN 1', tags: [], meta: {},
        station_type: 'mv_lv', bus_refs: ['bus-sn', 'bus-tr-lv'], transformer_refs: ['tr-1'],
      },
      {
        id: 'st-rgnn-id', ref_id: 'st-rgnn', name: 'RGnN Hala A', tags: [], meta: {},
        station_type: 'rozdzielnica_nn', bus_refs: ['bus-rgnn-s1'], transformer_refs: [],
        nn_sections: [
          { section_id: 'sec-1', order: 1, bus_ref: 'bus-rgnn-s1', coupler_ref: 'coupler-1' },
          { section_id: 'sec-2', order: 2, bus_ref: 'bus-rgnn-s2', coupler_ref: 'coupler-1' },
        ],
      },
    ],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  };
}

describe('nnStudioTreeAdapter', () => {
  it('zwraca pustą listę bez migawki albo bez stacji', () => {
    expect(budujDrzewoNn(null, 'st-tr')).toEqual([]);
    expect(budujDrzewoNn(migawka(), null)).toEqual([]);
    expect(budujDrzewoNn(migawka(), 'nieznana-stacja')).toEqual([]);
  });

  it('buduje korzeń transformatora dla stacji SN/nN', () => {
    const drzewo = budujDrzewoNn(migawka(), 'st-tr');
    expect(drzewo).toHaveLength(1);
    expect(drzewo[0]).toMatchObject({ id: 'nn-tr-tr-1', etykietaPL: 'Transformator SN/nN TR1', ikona: 'transformator' });
  });

  it('wstawia zwykły węzeł szyny dla odpływu pośredniego (bez rozdzielnicy)', () => {
    const [tr] = budujDrzewoNn(migawka(), 'st-tr');
    const busTrLv = tr.dzieci[0];
    expect(busTrLv).toMatchObject({ id: 'nn-bus-bus-tr-lv', ikona: 'szyna' });
    const busMid = busTrLv.dzieci[0];
    expect(busMid).toMatchObject({ id: 'nn-bus-bus-mid', ikona: 'szyna' });
  });

  it('rozpoznaje rozdzielnicę nN w głębi drzewa i rozkłada ją na sekcje wg order', () => {
    const [tr] = budujDrzewoNn(migawka(), 'st-tr');
    const busMid = tr.dzieci[0].dzieci[0];
    const stacja = busMid.dzieci[0];
    expect(stacja).toMatchObject({ id: 'nn-station-st-rgnn', etykietaPL: 'RGnN Hala A', ikona: 'stacja' });
    expect(stacja.dzieci.map((s) => s.id)).toEqual(['nn-section-sec-1', 'nn-section-sec-2']);
    expect(stacja.dzieci.map((s) => s.etykietaPL)).toEqual(['Sekcja 1', 'Sekcja 2']);
  });

  it('nie duplikuje sprzęgła jako dziecka sekcji (sąsiednia sekcja to węzeł-rodzeństwo, nie zagnieżdżenie)', () => {
    const [tr] = budujDrzewoNn(migawka(), 'st-tr');
    const busMid = tr.dzieci[0].dzieci[0];
    const stacja = busMid.dzieci[0];
    const [sekcja1] = stacja.dzieci;
    // Sekcja 1 nie ma dzieci: jej JEDYNY sąsiad (sprzęgło do sekcji 2) jest
    // odfiltrowany, bo prowadzi do szyny NALEŻĄCEJ do tej samej stacji.
    expect(sekcja1.dzieci).toEqual([]);
  });

  it('kontynuuje odpływ z sekcji 2 do szyny liścia i dołącza odbiór + źródło jako liście', () => {
    const [tr] = budujDrzewoNn(migawka(), 'st-tr');
    const busMid = tr.dzieci[0].dzieci[0];
    const stacja = busMid.dzieci[0];
    const [, sekcja2] = stacja.dzieci;
    expect(sekcja2.dzieci).toHaveLength(1);
    const busLeaf = sekcja2.dzieci[0];
    expect(busLeaf).toMatchObject({ id: 'nn-bus-bus-leaf', ikona: 'szyna' });
    expect(busLeaf.dzieci).toEqual([
      { id: 'nn-load-load-1', etykietaPL: 'Odbiór K1', ikona: 'szyna', liczniki: { blokady: 0, ostrzezenia: 0 }, dzieci: [], trybMin: 'basic' },
      { id: 'nn-gen-gen-1', etykietaPL: 'PV K1', ikona: 'zrodlo', liczniki: { blokady: 0, ostrzezenia: 0 }, dzieci: [], trybMin: 'basic' },
    ]);
  });

  it('buduje korzeń wprost ze stacji, gdy wejściem jest samodzielna rozdzielnica nN', () => {
    const drzewo = budujDrzewoNn(migawka(), 'st-rgnn');
    expect(drzewo).toHaveLength(1);
    expect(drzewo[0]).toMatchObject({ id: 'nn-station-st-rgnn', ikona: 'stacja' });
    expect(drzewo[0].dzieci.map((s) => s.id)).toEqual(['nn-section-sec-1', 'nn-section-sec-2']);
  });

  it('pomija stację SN/nN bez strony nN (transformator nieobecny albo poza pasmem nN)', () => {
    const snapshot = migawka();
    snapshot.substations[0].transformer_refs = [];
    expect(budujDrzewoNn(snapshot, 'st-tr')).toEqual([]);
  });

  it('listujStacjeNn zwraca stacje z transformatorem nN i samodzielne rozdzielnice nN, posortowane wg nazwy', () => {
    const stacje = listujStacjeNn(migawka());
    // Posortowane wg `name` (localeCompare 'pl'): „RGnN Hala A" przed „Stacja SN/nN 1".
    expect(stacje.map((s) => s.ref_id)).toEqual(['st-rgnn', 'st-tr']);
  });

  it('listujStacjeNn pomija stacje bez żadnej strony nN', () => {
    const snapshot = migawka();
    snapshot.substations.push({
      id: 'st-gpz-id', ref_id: 'st-gpz', name: 'GPZ', tags: [], meta: {},
      station_type: 'gpz', bus_refs: ['bus-sn'], transformer_refs: [],
    });
    const stacje = listujStacjeNn(snapshot);
    expect(stacje.map((s) => s.ref_id)).not.toContain('st-gpz');
  });
});

describe('listujOdcinkiKablowNn', () => {
  it('zwraca pustą listę bez migawki, bez stacji albo bez transformatora nN', () => {
    expect(listujOdcinkiKablowNn(null, 'st-tr')).toEqual([]);
    expect(listujOdcinkiKablowNn(migawka(), null)).toEqual([]);
    const snapshot = migawka();
    snapshot.substations[0].transformer_refs = [];
    expect(listujOdcinkiKablowNn(snapshot, 'st-tr')).toEqual([]);
  });

  it('zbiera WSZYSTKIE kable nN od korzenia transformatora, pomijając sprzęgło (nie jest kablem)', () => {
    const odcinki = listujOdcinkiKablowNn(migawka(), 'st-tr');
    expect(odcinki.map((o) => o.ref)).toEqual(['cbl-1', 'cbl-2', 'cbl-3']);
  });

  it('niesie pola strukturalne 1:1 z modelu (od/do/długość/n_torów/status)', () => {
    const [cbl1] = listujOdcinkiKablowNn(migawka(), 'st-tr');
    expect(cbl1).toMatchObject({
      ref: 'cbl-1',
      nazwa: 'Kabel nN 1',
      fromBusRef: 'bus-tr-lv',
      fromBusName: 'Szyna nN TR1',
      toBusRef: 'bus-mid',
      toBusName: 'Szyna nN pośrednia',
      lengthM: 50,
      nParallel: 1,
      status: 'closed',
      catalogRef: null,
    });
  });

  it('n_parallel > 1 przechodzi bez zmian (materializacja P0.1)', () => {
    const snapshot = migawka();
    (snapshot.branches[0] as { n_parallel?: number }).n_parallel = 3;
    const [cbl1] = listujOdcinkiKablowNn(snapshot, 'st-tr');
    expect(cbl1.nParallel).toBe(3);
  });

  it('listujStacjeNn pomija stacje bez żadnej strony nN', () => {
    const snapshot = migawka();
    snapshot.substations.push({
      id: 'st-gpz-id', ref_id: 'st-gpz', name: 'GPZ', tags: [], meta: {},
      station_type: 'gpz', bus_refs: ['bus-sn'], transformer_refs: [],
    });
    const stacje = listujStacjeNn(snapshot);
    expect(stacje.map((s) => s.ref_id)).not.toContain('st-gpz');
  });
});
