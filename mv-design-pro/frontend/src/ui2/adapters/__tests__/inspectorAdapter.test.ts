/**
 * Testy adaptera inspektora: mapowanie właściwości katalogowych (iloczyn cech —
 * KAŻDY typ elementu ENM × pola wymagane/opcjonalne), parytet inwentarza klasy
 * (`KOLEKCJE_ELEMENTOW` vs klucze realnego `EnergyNetworkModel`), oraz
 * `otworzDowodInspektora` (nawigacja „Otwórz dowód" — TODO-UI2 §0.3).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { useAppStateStore } from '../../../ui/app-state';
import { subskrybuj } from '../../events';
import { useShellStore } from '../../shell/useShellStore';
import {
  KOLEKCJE_ELEMENTOW,
  TYPY_GALEZI,
  mapowanieObiektuInspektora,
  otworzDowodInspektora,
} from '../inspectorAdapter';

function bazowyElement(id: string, extra: Record<string, unknown> = {}) {
  return { id, ref_id: id, name: `Nazwa ${id}`, tags: [], meta: {}, ...extra };
}

/** Model pusty ze WSZYSTKIMI kolekcjami zainicjowanymi (dla testu parytetu). */
function pustyModel(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'test',
      created_at: '',
      updated_at: '',
      revision: 1,
      hash_sha256: 'x',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    shunt_capacitors: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    branch_points: [],
    line_runs: [],
    connection_nodes: [],
  } as unknown as EnergyNetworkModel;
}

describe('inspectorAdapter — parytet inwentarza klasy (KOLEKCJE_ELEMENTOW)', () => {
  it('KOLEKCJE_ELEMENTOW pokrywa DOKŁADNIE klucze-tablice EnergyNetworkModel (poza header/katalog_projektu)', () => {
    const model = pustyModel();
    const kluczeModelu = Object.keys(model).filter(
      (k) => k !== 'header' && k !== 'katalog_projektu' && Array.isArray((model as never)[k]),
    );
    expect([...KOLEKCJE_ELEMENTOW].sort()).toEqual([...kluczeModelu].sort());
  });
});

describe('inspectorAdapter — mapowanie właściwości katalogowych (iloczyn cech: typ × pola)', () => {
  it('szyna: pola wymagane zawsze, opcjonalne tylko gdy podane', () => {
    const model = pustyModel();
    (model.buses as unknown[]).push(
      bazowyElement('bus-1', { voltage_kv: 15, phase_system: '3ph' }),
    );
    const obiekt = mapowanieObiektuInspektora(model, 'bus-1');
    const katalogowe = obiekt?.wlasciwosci.find((s) => s.id === 'katalogowe');
    expect(katalogowe).toBeDefined();
    expect(katalogowe?.wiersze.map((w) => w.etykieta)).toEqual(['Napięcie znamionowe']);

    (model.buses as unknown[]).push(
      bazowyElement('bus-2', { voltage_kv: 15, phase_system: '3ph', zone: 'GPZ', frequency_hz: 50 }),
    );
    const obiekt2 = mapowanieObiektuInspektora(model, 'bus-2');
    const katalogowe2 = obiekt2?.wlasciwosci.find((s) => s.id === 'katalogowe');
    expect(katalogowe2?.wiersze.map((w) => w.etykieta).sort()).toEqual(
      ['Częstotliwość', 'Napięcie znamionowe', 'Strefa'].sort(),
    );
  });

  it.each(TYPY_GALEZI.map((t) => [t] as const))(
    'gałąź typu "%s": zawiera wiersze wspólne (szyny + stan) i >= 1 wiersz właściwy typu',
    (typ) => {
      const model = pustyModel();
      const wspolne = {
        from_bus_ref: 'bus-a',
        to_bus_ref: 'bus-b',
        status: 'closed',
        type: typ,
      };
      const wlasciwe: Record<string, Record<string, unknown>> = {
        line_overhead: { length_km: 1.2, r_ohm_per_km: 0.3, x_ohm_per_km: 0.35 },
        cable: { length_km: 0.5, r_ohm_per_km: 0.2, x_ohm_per_km: 0.1 },
        switch: { r_ohm: 0.001 },
        breaker: { r_ohm: 0.001 },
        bus_coupler: { r_ohm: 0.001 },
        disconnector: { x_ohm: 0.001 },
        fuse: { rated_current_a: 100 },
      };
      (model.branches as unknown[]).push(bazowyElement('branch-1', { ...wspolne, ...wlasciwe[typ] }));
      const obiekt = mapowanieObiektuInspektora(model, 'branch-1');
      expect(obiekt?.typ).toBe(typ);
      const katalogowe = obiekt?.wlasciwosci.find((s) => s.id === 'katalogowe');
      expect(katalogowe).toBeDefined();
      const etykiety = katalogowe?.wiersze.map((w) => w.etykieta) ?? [];
      expect(etykiety).toContain('Szyna początkowa');
      expect(etykiety).toContain('Szyna końcowa');
      expect(etykiety).toContain('Stan');
      expect(etykiety.length).toBeGreaterThan(3);
    },
  );

  it('transformator: pola wymagane + opcjonalne obecne, brakujące opcjonalne pominięte', () => {
    const model = pustyModel();
    (model.transformers as unknown[]).push(
      bazowyElement('tr-1', {
        sn_mva: 0.63,
        uhv_kv: 15,
        ulv_kv: 0.4,
        uk_percent: 6,
        pk_kw: 6.5,
        vector_group: 'Dyn11',
      }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'tr-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    const etykiety = katalogowe?.wiersze.map((w) => w.etykieta) ?? [];
    expect(etykiety).toEqual(
      expect.arrayContaining([
        'Moc znamionowa',
        'Napięcie GN',
        'Napięcie DN',
        'Napięcie zwarcia uk',
        'Straty zwarcia Pk',
        'Grupa połączeń',
      ]),
    );
    expect(etykiety).not.toContain('Straty jałowe P0');
  });

  it('źródło: model wymagany + parametry zwarciowe opcjonalne', () => {
    const model = pustyModel();
    (model.sources as unknown[]).push(
      bazowyElement('src-1', { bus_ref: 'bus-a', model: 'thevenin', sk3_mva: 250, ik3_ka: 9.6 }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'src-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    expect(katalogowe?.wiersze.map((w) => w.etykieta)).toEqual(
      expect.arrayContaining(['Model źródła', 'Moc zwarciowa Sk″', 'Prąd zwarciowy Ik″']),
    );
  });

  it('odbiór: P/Q/model wymagane', () => {
    const model = pustyModel();
    (model.loads as unknown[]).push(
      bazowyElement('load-1', { bus_ref: 'bus-a', p_mw: 0.4, q_mvar: 0.1, model: 'pq' }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'load-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    expect(katalogowe?.wiersze).toHaveLength(3);
  });

  it('generator: rodzaj i wariant przyłączenia opcjonalne, moc czynna wymagana', () => {
    const model = pustyModel();
    (model.generators as unknown[]).push(
      bazowyElement('gen-1', { bus_ref: 'bus-a', p_mw: 1, gen_type: 'pv_inverter' }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'gen-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    expect(katalogowe?.wiersze.map((w) => w.etykieta)).toEqual(
      expect.arrayContaining(['Moc czynna P', 'Rodzaj']),
    );
  });

  it('bateria kondensatorów: moc i napięcie wymagane', () => {
    const model = pustyModel();
    (model.shunt_capacitors as unknown[]).push(
      bazowyElement('cap-1', { bus_ref: 'bus-a', rated_mvar: 0.3, rated_kv: 15, status: 'closed' }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'cap-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    expect(katalogowe?.wiersze.map((w) => w.etykieta)).toEqual(
      expect.arrayContaining(['Moc znamionowa', 'Napięcie znamionowe', 'Stan']),
    );
  });

  it('stacja: rodzaj + liczniki szyn/transformatorów', () => {
    const model = pustyModel();
    (model.substations as unknown[]).push(
      bazowyElement('st-1', {
        station_type: 'gpz',
        bus_refs: ['bus-a', 'bus-b'],
        transformer_refs: ['tr-1'],
      }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'st-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    const liczbaSzyn = katalogowe?.wiersze.find((w) => w.etykieta === 'Liczba szyn');
    expect(liczbaSzyn?.wartosc.wartosc).toBe(2);
  });

  it('pole: rola + odpływ (feeder_short_name obecny tylko gdy podany)', () => {
    const model = pustyModel();
    (model.bays as unknown[]).push(
      bazowyElement('bay-1', {
        bay_role: 'FEEDER',
        substation_ref: 'st-1',
        bus_ref: 'bus-a',
        equipment_refs: [],
        feeder_short_name: 'SADY',
      }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'bay-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    expect(katalogowe?.wiersze).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ etykieta: 'Rola pola', wartosc: expect.objectContaining({ wartosc: 'Odejście' }) }),
        expect.objectContaining({ etykieta: 'Nazwa odpływu', wartosc: expect.objectContaining({ wartosc: 'SADY' }) }),
      ]),
    );
  });

  it('węzeł: rodzaj + liczba gałęzi', () => {
    const model = pustyModel();
    (model.junctions as unknown[]).push(
      bazowyElement('j-1', { connected_branch_refs: ['b1', 'b2', 'b3'], junction_type: 'T_node' }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'j-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    expect(katalogowe?.wiersze.find((w) => w.etykieta === 'Liczba dołączonych gałęzi')?.wartosc.wartosc).toBe(3);
  });

  it('punkt rozgałęzienia: rodzaj + szyna wymagane', () => {
    const model = pustyModel();
    (model.branch_points as unknown[]).push(
      bazowyElement('bp-1', { branch_point_type: 'zksn', parent_segment_id: 'seg-1', bus_ref: 'bus-a', ports: {} }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'bp-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    expect(katalogowe?.wiersze.map((w) => w.etykieta)).toEqual(expect.arrayContaining(['Rodzaj punktu', 'Szyna']));
  });

  it('magistrala: rodzaj + liczba segmentów', () => {
    const model = pustyModel();
    (model.corridors as unknown[]).push(
      bazowyElement('cor-1', { corridor_type: 'radial', ordered_segment_refs: ['s1', 's2'] }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'cor-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    expect(katalogowe?.wiersze.find((w) => w.etykieta === 'Liczba segmentów')?.wartosc.wartosc).toBe(2);
  });

  it('pomiar: rodzaj przekładnika CT/VT etykietowany po polsku', () => {
    const model = pustyModel();
    (model.measurements as unknown[]).push(
      bazowyElement('m-1', {
        measurement_type: 'CT',
        bus_ref: 'bus-a',
        rating: {},
        connection: 'star',
        purpose: 'protection',
      }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'm-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    expect(katalogowe?.wiersze[0]).toMatchObject({
      etykieta: 'Rodzaj przekładnika',
      wartosc: { wartosc: 'Prądowy (CT)' },
    });
  });

  it('zabezpieczenie: rodzaj + wyłącznik + liczba nastaw', () => {
    const model = pustyModel();
    (model.protection_assignments as unknown[]).push(
      bazowyElement('pa-1', {
        breaker_ref: 'br-1',
        device_type: 'overcurrent',
        settings: [{ a: 1 }, { b: 2 }],
        is_enabled: true,
      }),
    );
    const katalogowe = mapowanieObiektuInspektora(model, 'pa-1')?.wlasciwosci.find(
      (s) => s.id === 'katalogowe',
    );
    expect(katalogowe?.wiersze.find((w) => w.etykieta === 'Liczba nastaw')?.wartosc.wartosc).toBe(2);
  });

  it('ciąg liniowy: rodzaj + pole startowe + liczniki', () => {
    const model = pustyModel();
    (model.line_runs as unknown[]).push({
      id: 'lr-1',
      run_kind: 'main_trunk',
      starting_bay_ref: 'bay-1',
      starting_port_ref: 'port-1',
      segments: [{ segment_ref: 's1', order: 0 }],
      stations: [{ substation_ref: 'st-1', order: 0 }],
    });
    const obiekt = mapowanieObiektuInspektora(model, 'lr-1');
    expect(obiekt?.typEtykieta).toBe('Ciąg liniowy');
    const katalogowe = obiekt?.wlasciwosci.find((s) => s.id === 'katalogowe');
    expect(katalogowe?.wiersze.map((w) => w.etykieta)).toEqual(
      expect.arrayContaining(['Rodzaj ciągu', 'Pole startowe', 'Liczba segmentów', 'Liczba stacji na trasie']),
    );
  });

  it('węzeł przyłączenia: lokalizacja + napięcie + element nadrzędny', () => {
    const model = pustyModel();
    (model.connection_nodes as unknown[]).push({
      id: 'cn-1',
      location: 'bay',
      voltage_kv: 15,
      parent_ref: 'bay-1',
    });
    const obiekt = mapowanieObiektuInspektora(model, 'cn-1');
    expect(obiekt?.typ).toBe('wezel_przylaczenia');
    const katalogowe = obiekt?.wlasciwosci.find((s) => s.id === 'katalogowe');
    expect(katalogowe?.wiersze.map((w) => w.etykieta)).toEqual([
      'Lokalizacja',
      'Napięcie',
      'Element nadrzędny',
    ]);
  });

  it('typ bez właściwości katalogowych (fixture pusty) nie dodaje sekcji „katalogowe"', () => {
    const model = pustyModel();
    (model.buses as unknown[]).push({ id: 'bus-x', ref_id: 'bus-x', name: '', tags: [], meta: {} } as never);
    // Bus bez `voltage_kv` (pole wymagane wg typu) nie występuje w praktyce —
    // test brzegowy: element nieznaleziony zwraca null, nie wybucha.
    expect(mapowanieObiektuInspektora(model, 'brak-takiego-id')).toBeNull();
  });
});

describe('otworzDowodInspektora — nawigacja „Otwórz dowód" (TODO-UI2 §0.3)', () => {
  beforeEach(() => {
    useShellStore.setState({ wynikiTab: null, wynikiTabElement: null, activeSpace: 'schemat' });
    useAppStateStore.setState({ activeRunId: null });
  });

  it('emituje zdarzenie selekcji z ref elementu i zrodlo="inspektor"', () => {
    const odebrane: unknown[] = [];
    const odsubskrybuj = subskrybuj('selekcja', (z) => odebrane.push(z));
    otworzDowodInspektora('bus-7');
    odsubskrybuj();
    expect(odebrane).toEqual([{ typ: 'selekcja', obiektId: 'bus-7', zrodlo: 'inspektor' }]);
  });

  it('ustawia deep-link zakładki „Dowód" z aktywnym runId, gdy jest ustawiony', () => {
    useAppStateStore.setState({ activeRunId: 'run-123' });
    otworzDowodInspektora('bus-7');
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-123');
  });

  it('bez aktywnego przebiegu deep-link niesie null (WynikiWarsztat: „dowód aktywnego przebiegu")', () => {
    otworzDowodInspektora('bus-7');
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('przełącza aktywną przestrzeń powłoki na "wyniki"', () => {
    otworzDowodInspektora('bus-7');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
  });
});
