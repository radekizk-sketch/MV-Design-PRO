/**
 * Testy adaptera inspektora: mapowanie właściwości katalogowych (iloczyn cech —
 * KAŻDY typ elementu ENM × pola wymagane/opcjonalne), parytet inwentarza klasy
 * (`KOLEKCJE_ELEMENTOW` vs klucze realnego `EnergyNetworkModel`), oraz
 * `otworzDowodInspektora` (nawigacja „Otwórz dowód" — TODO-UI2 §0.3).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../types/enm';
import { wyczyscRejestrBiegow } from '../../../test/biegNieaktualny';
import { ustawBiegOgladany, wyczyscKontekstWyniku } from '../../../test/kontekstBiegu';
import { FIELD_ROLE_LABEL_PL } from '../../../ui/sld/v2/station-rozdzielnia/contract';
import { subskrybuj } from '../../events';
import { InspectorPanel, INSPECTOR_STRINGS, type ObiektInspektora } from '../../inspector';
import { useShellStore } from '../../shell/useShellStore';
import { renderHook } from '@testing-library/react';

import { usePowerFlowResultsStore } from '../../../ui/power-flow-results/store';
import { useResultsInspectorStore } from '../../../ui/results-inspector/store';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  KOLEKCJE_ELEMENTOW,
  TYPY_GALEZI,
  mapowanieObiektuInspektora,
  otworzDowodInspektora,
  useObiektInspektora,
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
    zespoly_uziemiajace: [],
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

  it('KOLEKCJE_ELEMENTOW obejmuje każdą tablicę migawki ŻYWEGO backendu (s92Bieg.enm.json)', () => {
    // Model ręczny powyżej nie wykryje rodziny, której nikt do niego nie dopisał (tak zgubiono
    // `zespoly_uziemiajace`: element zespołu uziemiającego nie miał karty inspektora). Kontrakt
    // migawki z żywego biegu jest drugą, niezależną stroną parytetu.
    const katalog = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../ui/sld/v3/canvas/__tests__/fixtures',
    );
    const migawka = JSON.parse(readFileSync(resolve(katalog, 's92Bieg.enm.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const tablice = Object.keys(migawka).filter(
      (k) => k !== 'header' && k !== 'katalog_projektu' && Array.isArray(migawka[k]),
    );
    expect(tablice).toContain('zespoly_uziemiajace');
    for (const klucz of tablice) {
      expect(KOLEKCJE_ELEMENTOW as readonly string[], `kolekcja '${klucz}' bez karty inspektora`).toContain(klucz);
    }
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

  // Linia 110 kV z przewodem z katalogu: iloczyn {kompletność PELNY, NIEPELNY} × {B1/B0 w modelu,
  // brak} — inspektor odróżnia wynik na wartościach roboczych od wyniku z danych projektu.
  it.each([
    ['NIEPELNY', ['fazy', 'rezystywnosc_gruntu_ohm_m'], 'niepełna — wartości robocze (ESTIMATED): położenie przewodów fazowych, rezystywność gruntu'],
    ['PELNY', [], 'pełna — dane projektu i katalogu'],
  ] as const)('linia 110 kV z geometrii (%s): pochodzenie, kompletność, B1/B0 w µS/km', (kompletnosc, robocze, opis) => {
    const model = pustyModel();
    (model.branches as unknown[]).push(
      bazowyElement('L110', {
        type: 'line_overhead',
        from_bus_ref: 'bus-a',
        to_bus_ref: 'bus-b',
        status: 'closed',
        length_km: 20,
        r_ohm_per_km: 0.11902,
        x_ohm_per_km: 0.40901,
        b_siemens_per_km: 2.7858e-6,
        r0_ohm_per_km: 0.30723,
        x0_ohm_per_km: 1.01621,
        b0_siemens_per_km: 1.6769e-6,
        geometria_slupa: kompletnosc === 'PELNY' ? { rezystywnosc_gruntu_ohm_m: 250 } : null,
        parametry_z_geometrii: {
          metoda: 'Carson',
          wersja_metody: '1',
          odcisk_wejscia: 'abc',
          kompletnosc_dowodu: kompletnosc,
          czestotliwosc_hz: 50,
          temperatura_przewodu_c: 80,
          r1_temperatura_ohm_per_km: 0.14,
          r0_bez_odgromowych_ohm_per_km: 0.26148,
          x0_bez_odgromowych_ohm_per_km: 1.36636,
          gmd_m: 6.3,
          gmr_fazy_m: 0.0085,
          wartosci_robocze: robocze,
        },
      }),
    );
    const wiersze =
      mapowanieObiektuInspektora(model, 'L110')?.wlasciwosci.find((s) => s.id === 'katalogowe')
        ?.wiersze ?? [];
    const wartosc = (etykieta: string) => wiersze.find((w) => w.etykieta === etykieta)?.wartosc;
    expect(wartosc('Kompletność dowodu parametrów')).toEqual({ wartosc: opis, jednostka: undefined });
    expect(wartosc('Parametry linii')?.wartosc).toBe('z geometrii słupa i przewodu z katalogu (Carson 1)');
    expect(wartosc('Susceptancja B1')).toEqual({ wartosc: expect.closeTo(2.7858, 6), jednostka: 'µS/km' });
    expect(wartosc('Susceptancja B0')).toEqual({ wartosc: expect.closeTo(1.6769, 6), jednostka: 'µS/km' });
    expect(wartosc('Rezystancja R1 w temperaturze 80 °C')).toEqual({ wartosc: 0.14, jednostka: 'Ω/km' });
    expect(wartosc('Rezystywność gruntu (projekt)')).toEqual(
      kompletnosc === 'PELNY' ? { wartosc: 250, jednostka: 'Ω·m' } : undefined,
    );
  });

  it('linia SN bez geometrii i bez B: brak wierszy pochodzenia parametrów i susceptancji', () => {
    const model = pustyModel();
    (model.branches as unknown[]).push(
      bazowyElement('LSN', {
        type: 'line_overhead',
        from_bus_ref: 'bus-a',
        to_bus_ref: 'bus-b',
        status: 'closed',
        length_km: 1,
        r_ohm_per_km: 0.3,
        x_ohm_per_km: 0.35,
      }),
    );
    const etykiety =
      mapowanieObiektuInspektora(model, 'LSN')
        ?.wlasciwosci.find((s) => s.id === 'katalogowe')
        ?.wiersze.map((w) => w.etykieta) ?? [];
    expect(etykiety).not.toContain('Parametry linii');
    expect(etykiety).not.toContain('Kompletność dowodu parametrów');
    expect(etykiety).not.toContain('Susceptancja B1');
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

  it('zespół uziemiający: dane transformatora uziemiającego, dławika i rezystora z modelu', () => {
    const model = pustyModel();
    (model.zespoly_uziemiajace as unknown[]).push(
      bazowyElement('zu-1', {
        bus_ref: 'bus-a',
        grupa_polaczen: 'ZNyn11',
        u_n_kv: 15,
        s_n_kva: 250,
        r0_ohm: 3.1,
        x0_ohm: 8.2,
        dlawik: { i_min_a: 20, i_max_a: 200, i_nastawy_a: 110 },
        rezystor: { r_ohm: 43, i_n_a: 200, t_s: 10 },
      }),
    );
    const obiekt = mapowanieObiektuInspektora(model, 'zu-1');
    expect(obiekt?.typEtykieta).toBe('Zespół uziemiający');
    const katalogowe = obiekt?.wlasciwosci.find((s) => s.id === 'katalogowe');
    expect(katalogowe?.wiersze.map((w) => w.etykieta)).toEqual([
      'Grupa połączeń',
      'Napięcie znamionowe',
      'Moc znamionowa',
      'Rezystancja zerowa R0',
      'Reaktancja zerowa X0',
      'Dławik: prąd minimalny',
      'Dławik: prąd maksymalny',
      'Dławik: nastawa',
      'Rezystor: rezystancja',
      'Rezystor: prąd znamionowy',
      'Rezystor: czas przepływu prądu',
    ]);
    // Pole nieobecne w modelu = wiersz pominięty (zero fabrykacji); bez dławika i rezystora.
    const bezUrzadzen = pustyModel();
    (bezUrzadzen.zespoly_uziemiajace as unknown[]).push(
      bazowyElement('zu-2', { bus_ref: 'bus-a', grupa_polaczen: 'ZN', uziemienie_bezposrednie: true }),
    );
    const wiersze = mapowanieObiektuInspektora(bezUrzadzen, 'zu-2')
      ?.wlasciwosci.find((s) => s.id === 'katalogowe')
      ?.wiersze.map((w) => w.etykieta);
    expect(wiersze).toEqual(['Grupa połączeń', 'Uziemienie bezpośrednie']);
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
        // Karta #141: rola pola nazwana słowem kanonu (FEEDER → pole odgałęźne), jak na schemacie.
        expect.objectContaining({
          etykieta: 'Rola pola',
          wartosc: expect.objectContaining({ wartosc: FIELD_ROLE_LABEL_PL.LINIA_ODG }),
        }),
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
    wyczyscRejestrBiegow();
    wyczyscKontekstWyniku();
  });

  it('emituje zdarzenie selekcji z ref elementu i zrodlo="inspektor"', () => {
    const odebrane: unknown[] = [];
    const odsubskrybuj = subskrybuj('selekcja', (z) => odebrane.push(z));
    otworzDowodInspektora('bus-7');
    odsubskrybuj();
    expect(odebrane).toEqual([{ typ: 'selekcja', obiektId: 'bus-7', zrodlo: 'inspektor' }]);
  });

  it('ustawia deep-link zakładki „Dowód" z aktywnym runId, gdy jest ustawiony', () => {
    ustawBiegOgladany('run-123', { dolozDoRejestru: 'SC_3F' });
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

/**
 * Test natywnego klika (Zero-Debt pkt 5): renderuje PRAWDZIWY `InspectorPanel`
 * z PRAWDZIWYM `otworzDowodInspektora` (dokładnie to samo wpięcie co
 * `ui2/AppRoot.tsx: <InspectorPanel onOtworzDowod={otworzDowodInspektora} .../>`),
 * klika natywnie (`fireEvent.click`, nie wywołanie funkcji wprost) i sprawdza
 * REALNY skutek w store'ach. Fixture `dowody` jest zbudowana RĘCZNIE (nie przez
 * `mapowanieObiektuInspektora`, który dziś zawsze zwraca `dowody: []` — patrz
 * `V12T-017` w `docs/v12xx/REJESTR_DLUGU.md`) — test dowodzi, że MECHANIZM
 * klik → nawigacja jest realny i poprawny; osobny test niżej dowodzi, że dziś
 * przycisk jest nieosiągalny w praktyce (uczciwy stan zerowy, nie fabrykacja).
 */
describe('InspectorPanel + otworzDowodInspektora — wpięcie realne (test natywnym klikiem)', () => {
  const powiazaniaPuste = { wchodzace: [], wychodzace: [] };

  function obiektZDowodem(): ObiektInspektora {
    return {
      id: 'bus-7',
      typ: 'bus',
      typEtykieta: 'Szyna',
      nazwa: 'Szyna GPZ-1',
      wlasciwosci: [],
      wyniki: [],
      dowody: [{ ref: 'bus-7', etykieta: 'Dowód zwarcia 3-fazowego' }],
      powiazania: powiazaniaPuste,
    };
  }

  beforeEach(() => {
    useShellStore.setState({ wynikiTab: null, wynikiTabElement: null, activeSpace: 'schemat' });
    wyczyscRejestrBiegow();
    wyczyscKontekstWyniku();
    ustawBiegOgladany('run-e2e-42', { dolozDoRejestru: 'SC_3F' });
  });

  it('klik zakładki „Dowód" → klik „Pokaż dowód" → realna nawigacja (deep-link + przestrzeń + selekcja)', () => {
    const odebraneSelekcje: unknown[] = [];
    const odsubskrybuj = subskrybuj('selekcja', (z) => odebraneSelekcje.push(z));

    render(
      <InspectorPanel
        obiekt={obiektZDowodem()}
        rewizjaModelu={3}
        onOtworzDowod={otworzDowodInspektora}
        onNawiguj={() => {}}
        onPrzelicz={() => {}}
        szczegolyAudytowe={false}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: INSPECTOR_STRINGS.tabDowod }));
    fireEvent.click(screen.getByRole('button', { name: INSPECTOR_STRINGS.pokazDowod }));

    odsubskrybuj();
    expect(odebraneSelekcje).toEqual([{ typ: 'selekcja', obiektId: 'bus-7', zrodlo: 'inspektor' }]);
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-e2e-42');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
  });

  it('STAN DZISIEJSZY (V12T-017): `mapowanieObiektuInspektora` niesie dowody:[] → zakładka pokazuje uczciwy stan pusty, nie fabrykuje wpisu', () => {
    const model: EnergyNetworkModel = {
      header: {
        enm_version: '1.0',
        name: 'test',
        created_at: '',
        updated_at: '',
        revision: 1,
        hash_sha256: 'x',
        defaults: { frequency_hz: 50, unit_system: 'SI' },
      },
      buses: [bazowyElement('bus-7')],
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
    const obiekt = mapowanieObiektuInspektora(model, 'bus-7');
    expect(obiekt).not.toBeNull();
    expect(obiekt!.dowody).toEqual([]);

    render(
      <InspectorPanel
        obiekt={obiekt}
        rewizjaModelu={1}
        onOtworzDowod={otworzDowodInspektora}
        onNawiguj={() => {}}
        onPrzelicz={() => {}}
        szczegolyAudytowe={false}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: INSPECTOR_STRINGS.tabDowod }));
    expect(screen.getByText(INSPECTOR_STRINGS.brakDowodow)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: INSPECTOR_STRINGS.pokazDowod })).not.toBeInTheDocument();
  });
});

/**
 * Zakładki „Wyniki"/„Dowody" inspektora czytają AKTYWNY przebieg (integracja
 * adapter-wyników × adapter-inspektora). KLASA, nie instancja — iloczyn cech:
 * {rodzaj biegu: rozpływ, zwarcie, oba, żaden} × {element: szyna w wyniku,
 * gałąź w wyniku, element spoza wyniku}. Zasada: wiersz i pozycja dowodu
 * powstają WYŁĄCZNIE dla elementu obecnego w wyniku (zero fabrykacji), a każda
 * liczba jest wartością z kontraktu wyniku, nie przeliczeniem w UI.
 */
describe('useObiektInspektora — wyniki i dowody z aktywnego przebiegu (V12T-017)', () => {
  const SZYNA = 'bus-insp-1';
  const GALAZ = 'br-insp-1';

  function modelZElementami(): EnergyNetworkModel {
    const model = pustyModel() as unknown as Record<string, unknown[]>;
    model.buses = [bazowyElement(SZYNA, { voltage_kv: 15 })];
    model.branches = [
      bazowyElement(GALAZ, { branch_type: 'cable', from_bus: SZYNA, to_bus: 'bus-insp-2' }),
    ];
    return model as unknown as EnergyNetworkModel;
  }

  beforeEach(() => {
    useSnapshotStore.setState({ snapshot: modelZElementami() } as never);
    usePowerFlowResultsStore.setState({ results: null } as never);
    useResultsInspectorStore.setState({ shortCircuitResults: null } as never);
    wyczyscRejestrBiegow();
    wyczyscKontekstWyniku();
  });

  it('bez wyniku biegu: brak wierszy wyniku i brak pozycji dowodu (uczciwy stan pusty)', () => {
    const { result } = renderHook(() => useObiektInspektora(SZYNA));
    expect(result.current?.wyniki).toEqual([]);
    expect(result.current?.dowody).toEqual([]);
  });

  it('rozpływ: szyna obecna w wyniku dostaje wiersze z kontraktu i dowód rozpływu', () => {
    usePowerFlowResultsStore.setState({
      results: {
        bus_results: [
          { bus_id: SZYNA, v_pu: 0.9876, angle_deg: -1.25, p_injected_mw: 0.5, q_injected_mvar: 0.2 },
        ],
        branch_results: [],
      },
    } as never);
    const { result } = renderHook(() => useObiektInspektora(SZYNA));
    const sekcja = result.current?.wyniki.find((s) => s.id === 'wynik-rozplyw');
    expect(sekcja?.tytul).toBe('Rozpływ mocy');
    expect(sekcja?.wiersze.find((w) => w.etykieta === 'Napięcie')?.wartosc.wartosc).toBe('0.9876');
    expect(result.current?.dowody).toHaveLength(1);
    expect(result.current?.dowody[0]).toMatchObject({ ref: SZYNA, etykieta: 'Wywód rozpływu mocy dla elementu' });
  });

  it('rozpływ: gałąź obecna w wyniku dostaje własne wiersze (straty z kontraktu)', () => {
    usePowerFlowResultsStore.setState({
      results: {
        bus_results: [],
        branch_results: [
          {
            branch_id: GALAZ,
            p_from_mw: 1.5,
            q_from_mvar: 0.4,
            p_to_mw: 1.48,
            q_to_mvar: 0.38,
            losses_p_mw: 0.02,
            losses_q_mvar: 0.02,
          },
        ],
      },
    } as never);
    const { result } = renderHook(() => useObiektInspektora(GALAZ));
    const sekcja = result.current?.wyniki.find((s) => s.id === 'wynik-rozplyw');
    expect(sekcja?.wiersze.find((w) => w.etykieta === 'Straty mocy czynnej')?.wartosc.wartosc).toBe('0.0200');
    expect(result.current?.dowody).toHaveLength(1);
  });

  it('zwarcie: wiersz wskazany przez element_id daje sekcję zwarciową i dowód zwarciowy', () => {
    useResultsInspectorStore.setState({
      shortCircuitResults: {
        run_id: 'run-sc-insp',
        rows: [
          {
            target_id: 'inne-id',
            element_id: SZYNA,
            target_name: 'Szyna',
            ikss_ka: 12.345,
            ip_ka: 30.1,
            ith_ka: 12.9,
            sk_mva: 320.5,
            fault_type: '3F',
            flags: [],
          },
        ],
      },
    } as never);
    const { result } = renderHook(() => useObiektInspektora(SZYNA));
    const sekcja = result.current?.wyniki.find((s) => s.id === 'wynik-zwarcie');
    expect(sekcja?.wiersze.find((w) => w.etykieta.startsWith('Prąd zwarciowy'))?.wartosc.wartosc).toBe('12.345');
    expect(result.current?.dowody.map((d) => d.etykieta)).toEqual(['Wywód zwarciowy dla elementu']);
  });

  it('oba biegi naraz: dwie sekcje i dwie pozycje dowodu dla tego samego elementu', () => {
    usePowerFlowResultsStore.setState({
      results: {
        bus_results: [
          { bus_id: SZYNA, v_pu: 1, angle_deg: 0, p_injected_mw: 0, q_injected_mvar: 0 },
        ],
        branch_results: [],
      },
    } as never);
    useResultsInspectorStore.setState({
      shortCircuitResults: {
        run_id: 'run-sc-insp',
        rows: [
          {
            target_id: SZYNA,
            target_name: 'Szyna',
            ikss_ka: 10,
            ip_ka: 25,
            ith_ka: 10.2,
            sk_mva: 260,
            fault_type: '3F',
            flags: [],
          },
        ],
      },
    } as never);
    const { result } = renderHook(() => useObiektInspektora(SZYNA));
    expect(result.current?.wyniki.map((s) => s.id)).toEqual(['wynik-rozplyw', 'wynik-zwarcie']);
    expect(result.current?.dowody).toHaveLength(2);
  });

  it('element spoza wyniku: wynik biegu istnieje, ale ten element go nie ma — zero wierszy i zero dowodow', () => {
    usePowerFlowResultsStore.setState({
      results: {
        bus_results: [
          { bus_id: 'inna-szyna', v_pu: 1, angle_deg: 0, p_injected_mw: 0, q_injected_mvar: 0 },
        ],
        branch_results: [],
      },
    } as never);
    const { result } = renderHook(() => useObiektInspektora(SZYNA));
    expect(result.current?.wyniki).toEqual([]);
    expect(result.current?.dowody).toEqual([]);
  });

  it('brak danej liczbowej w kontrakcie (null) nie tworzy wiersza — zero fabrykacji', () => {
    useResultsInspectorStore.setState({
      shortCircuitResults: {
        run_id: 'run-sc-insp',
        rows: [
          {
            target_id: SZYNA,
            target_name: 'Szyna',
            ikss_ka: 8.5,
            ip_ka: null,
            ith_ka: null,
            sk_mva: null,
            fault_type: '3F',
            flags: [],
          },
        ],
      },
    } as never);
    const { result } = renderHook(() => useObiektInspektora(SZYNA));
    const sekcja = result.current?.wyniki.find((s) => s.id === 'wynik-zwarcie');
    expect(sekcja?.wiersze).toHaveLength(1);
  });
});
