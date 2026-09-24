/**
 * Prądy wejściowe koordynacji z REALNYCH biegów (karta F-K4 faza 3b).
 *
 * Test pilnuje tego, co było defektem: prądy nie mogą powstawać z niczego.
 * Wartości oczekiwane wynikają z niezależnego rachunku jednostkowego zapisanego
 * w każdym przypadku (kA→A tylko dla wyniku zwarciowego; wiersz rozpływu jest
 * już w amperach).
 */

import { describe, expect, it } from 'vitest';

import type { BranchResultRow, ShortCircuitRow } from '../../results-inspector/types';
import type { MiejsceUrzadzenia } from '../miejsceUrzadzenia';
import type { ProtectionDevice } from '../types';
import {
  podzielWierszeNaPrzypadki,
  pradRoboczyZWiersza,
  pradyZwarcioweZBiegu,
  zbudujPradyKoordynacji,
} from '../pradyZBiegow';

function wierszSC(over: Partial<ShortCircuitRow> = {}): ShortCircuitRow {
  return {
    target_id: 'node-1',
    element_id: 'bus/sn/1',
    target_name: 'Szyna SN 1',
    ikss_ka: 8.4,
    ip_ka: null,
    ith_ka: null,
    sk_mva: null,
    fault_type: '3F',
    flags: [],
    ...over,
  } as ShortCircuitRow;
}

function wierszGalezi(over: Partial<BranchResultRow> = {}): BranchResultRow {
  return {
    branch_id: 'graf-line-1',
    element_id: 'line/sn/1',
    name: 'Magistrala',
    from_bus: 'b1',
    to_bus: 'b2',
    // Zaciski gałęzi z susceptancją mają różne prądy — test rozróżnia kolumny.
    i_a: 187.5,
    i_do_a: 181.25,
    s_mva: null,
    p_mw: null,
    q_mvar: null,
    loading_pct: null,
    flags: [],
    ...over,
  };
}

function urzadzenie(over: Partial<ProtectionDevice> = {}): ProtectionDevice {
  return {
    id: 'dev-1',
    name: 'Zabezpieczenie pola',
    device_type: 'RELAY',
    location_element_id: 'line/sn/1',
    zacisk: 'od',
    settings: {},
    ...over,
  } as ProtectionDevice;
}

const ZACISKI_LINII = {
  od: { szyna_ref: 'bus/sn/1', etykieta_pl: 'Zacisk początkowy — szyna SN 1' },
  do: { szyna_ref: 'bus/sn/2', etykieta_pl: 'Zacisk końcowy — szyna SN 2' },
} as const;

/** Rozstrzygnięcie backendu (`GET …/enm/zacisk-lokalizacji`) — kształt 1:1. */
function miejsce(over: Partial<MiejsceUrzadzenia> = {}): MiejsceUrzadzenia {
  return {
    lokalizacja_ref: 'line/sn/1',
    rodzaj_lokalizacji: 'galaz',
    zaciski: ZACISKI_LINII,
    galaz_ref: 'line/sn/1',
    zacisk: 'od',
    zrodlo_zacisku: 'wskazanie',
    wymaga_wskazania_zacisku: true,
    odmowa_zacisku: null,
    ...over,
  };
}

const ODMOWA_BRAK_WSKAZANIA = {
  kod: 'protection.relay_terminal_indication_missing',
  powod_pl: 'Model nie wskazuje, przy którym zacisku gałęzi stoi zabezpieczenie — wskaż zacisk.',
};

function miejscaUrzadzen(...pary: [string, MiejsceUrzadzenia][]): Map<string, MiejsceUrzadzenia> {
  return new Map(pary);
}

describe('przeliczenie jednostek', () => {
  it('prąd zwarciowy z kA na A (8,4 kA = 8400 A)', () => {
    expect(pradyZwarcioweZBiegu([wierszSC()]).get('bus/sn/1')).toBe(8400);
  });

  it('prąd roboczy rozpływu zostaje w amperach (bez mnożenia przez 1000)', () => {
    expect(pradRoboczyZWiersza([wierszGalezi()], miejsce())).toEqual({ wartosc: 187.5 });
  });

  it('brak wartości w wierszu nie tworzy pozycji', () => {
    expect(pradyZwarcioweZBiegu([wierszSC({ ikss_ka: null })]).size).toBe(0);
    expect(pradRoboczyZWiersza([wierszGalezi({ i_a: null })], miejsce())).toEqual({ powod: null });
  });
});

/**
 * Decyzja O-51 (klasa P9, miejsce 7): prąd roboczy = prąd ZACISKU rozstrzygniętego przez
 * backend. Iloczyn cech: rodzaj lokalizacji {gałąź ze wskazaniem od, gałąź ze wskazaniem
 * do, gałąź bez wskazania, łącznik (zacisk z modelu), szyna, brak rozstrzygnięcia} ×
 * wynik {kolumna prądu, brak z powodem backendu, brak bez powodu}.
 */
describe('prąd roboczy urządzenia — zacisk z rozstrzygnięcia backendu', () => {
  const przypadki: Array<[string, MiejsceUrzadzenia | undefined, unknown]> = [
    ['gałąź, wskazanie od → i_a', miejsce(), { wartosc: 187.5 }],
    ['gałąź, wskazanie do → i_do_a', miejsce({ zacisk: 'do' }), { wartosc: 181.25 }],
    [
      'gałąź bez wskazania → brak z powodem z rekordu odmowy, nigdy i_a',
      miejsce({ zacisk: null, galaz_ref: null, zrodlo_zacisku: null, odmowa_zacisku: ODMOWA_BRAK_WSKAZANIA }),
      { powod: ODMOWA_BRAK_WSKAZANIA.powod_pl },
    ],
    [
      'łącznik w szeregu z zaciskiem do → i_do_a gałęzi rozstrzygniętej przez model',
      miejsce({
        lokalizacja_ref: 'cb/1',
        rodzaj_lokalizacji: 'lacznik',
        zacisk: 'do',
        zrodlo_zacisku: 'model',
        wymaga_wskazania_zacisku: false,
      }),
      { wartosc: 181.25 },
    ],
    [
      'szyna → brak bez zacisków (prąd gałęzi nie dotyczy)',
      miejsce({
        lokalizacja_ref: 'bus/sn/1',
        rodzaj_lokalizacji: 'szyna',
        zaciski: null,
        galaz_ref: null,
        zacisk: null,
        zrodlo_zacisku: null,
        wymaga_wskazania_zacisku: false,
      }),
      { powod: null },
    ],
    ['brak rozstrzygnięcia → brak', undefined, { powod: null }],
  ];

  it.each(przypadki)('%s', (_opis, rozstrzygniecie, oczekiwane) => {
    expect(pradRoboczyZWiersza([wierszGalezi()], rozstrzygniecie)).toEqual(oczekiwane);
  });

  it('brak zacisku trafia do listy braków z powodem backendu (tekst ekranu)', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie({ zacisk: undefined })],
      wierszeMax: [wierszSC()],
      wierszeMin: [wierszSC({ ikss_ka: 3.1 })],
      wierszeGalezi: [wierszGalezi()],
      miejsca: miejscaUrzadzen([
        'dev-1',
        miejsce({ zacisk: null, galaz_ref: null, zrodlo_zacisku: null, odmowa_zacisku: ODMOWA_BRAK_WSKAZANIA }),
      ]),
    });
    expect(wynik.operatingCurrents).toEqual([]);
    const brak = wynik.braki.find((b) => b.czegoBrakuje === 'prad_roboczy');
    expect(brak?.powod).toBe(ODMOWA_BRAK_WSKAZANIA.powod_pl);
  });

  it('prąd zwarciowy w miejscu urządzenia = szyna ZACISKU (ten sam zacisk co prąd roboczy)', () => {
    const wiersze = [wierszSC({ ikss_ka: 8.4 }), wierszSC({ element_id: 'bus/sn/2', ikss_ka: 5.0 })];
    const wierszeMin = [
      wierszSC({ ikss_ka: 3.1 }),
      wierszSC({ element_id: 'bus/sn/2', ikss_ka: 2.0 }),
    ];
    const od = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie()],
      wierszeMax: wiersze,
      wierszeMin,
      wierszeGalezi: [wierszGalezi()],
      miejsca: miejscaUrzadzen(['dev-1', miejsce()]),
    });
    const doZacisk = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie({ zacisk: 'do' })],
      wierszeMax: wiersze,
      wierszeMin,
      wierszeGalezi: [wierszGalezi()],
      miejsca: miejscaUrzadzen(['dev-1', miejsce({ zacisk: 'do' })]),
    });
    expect(od.faultCurrents).toEqual([
      { location_id: 'line/sn/1', ik_max_3f_a: 8400, ik_min_3f_a: 3100 },
    ]);
    expect(doZacisk.faultCurrents).toEqual([
      { location_id: 'line/sn/1', ik_max_3f_a: 5000, ik_min_3f_a: 2000 },
    ]);
    expect(od.operatingCurrents).toEqual([{ location_id: 'line/sn/1', i_operating_a: 187.5 }]);
    expect(doZacisk.operatingCurrents).toEqual([{ location_id: 'line/sn/1', i_operating_a: 181.25 }]);
  });
});

describe('zbudujPradyKoordynacji — zero fabrykacji', () => {
  it('oba biegi zwarciowe + rozpływ dają kompletne prądy', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie()],
      wierszeMax: [wierszSC({ ikss_ka: 8.4 })],
      wierszeMin: [wierszSC({ ikss_ka: 3.1 })],
      wierszeGalezi: [wierszGalezi()],
      miejsca: miejscaUrzadzen(['dev-1', miejsce()]),
    });

    expect(wynik.faultCurrents).toEqual([
      { location_id: 'line/sn/1', ik_max_3f_a: 8400, ik_min_3f_a: 3100 },
    ]);
    expect(wynik.operatingCurrents).toEqual([
      { location_id: 'line/sn/1', i_operating_a: 187.5 },
    ]);
    expect(wynik.braki).toEqual([]);
  });

  it('brak biegu minimalnego → pozycji prądowej NIE MA, jest jawny brak', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie()],
      wierszeMax: [wierszSC()],
      wierszeGalezi: [wierszGalezi()],
      miejsca: miejscaUrzadzen(['dev-1', miejsce()]),
    });

    // Ik_min nie da się wziąć z Ik_max — czułość liczona na przepisanej wartości
    // byłaby fałszem, więc pozycja nie powstaje.
    expect(wynik.faultCurrents).toEqual([]);
    expect(wynik.braki.map((b) => b.czegoBrakuje)).toEqual(['prad_zwarciowy_min']);
  });

  it('urządzenie w miejscu bez wyniku zwarciowego → brak prądu, nie wartość domyślna', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie({ location_element_id: 'bus/sn/9' })],
      wierszeMax: [wierszSC()],
      wierszeMin: [wierszSC({ ikss_ka: 3.1 })],
    });

    expect(wynik.faultCurrents).toEqual([]);
    expect(wynik.operatingCurrents).toEqual([]);
    expect(wynik.braki.map((b) => b.czegoBrakuje).sort()).toEqual([
      'prad_roboczy',
      'prad_zwarciowy_max',
    ]);
    expect(wynik.braki[0].deviceName).toBe('Zabezpieczenie pola');
  });

  it('brak rozpływu → brak prądu roboczego, ale prądy zwarciowe zostają', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie()],
      wierszeMax: [wierszSC()],
      wierszeMin: [wierszSC({ ikss_ka: 3.1 })],
      miejsca: miejscaUrzadzen(['dev-1', miejsce()]),
    });

    expect(wynik.faultCurrents).toHaveLength(1);
    expect(wynik.operatingCurrents).toEqual([]);
    expect(wynik.braki.map((b) => b.czegoBrakuje)).toEqual(['prad_roboczy']);
  });

  it('dopasowanie po target_id, gdy wiersz nie niesie element_id', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie({ location_element_id: 'node-7' })],
      wierszeMax: [wierszSC({ target_id: 'node-7', element_id: undefined })],
      wierszeMin: [wierszSC({ target_id: 'node-7', element_id: undefined, ikss_ka: 2.0 })],
    });

    expect(wynik.faultCurrents).toEqual([
      { location_id: 'node-7', ik_max_3f_a: 8400, ik_min_3f_a: 2000 },
    ]);
  });

  it('wynik jest deterministyczny dla tego samego wejścia', () => {
    const params = {
      urzadzenia: [urzadzenie(), urzadzenie({ id: 'dev-2', location_element_id: 'bus/sn/2' })],
      wierszeMax: [wierszSC(), wierszSC({ element_id: 'bus/sn/2', ikss_ka: 5.0 })],
      wierszeMin: [
        wierszSC({ ikss_ka: 3.1 }),
        wierszSC({ element_id: 'bus/sn/2', ikss_ka: 1.8 }),
      ],
      wierszeGalezi: [wierszGalezi()],
      miejsca: miejscaUrzadzen(['dev-1', miejsce()]),
    };

    expect(zbudujPradyKoordynacji(params)).toEqual(zbudujPradyKoordynacji(params));
  });
});

describe('podzielWierszeNaPrzypadki — klasyfikacja po SCENARIUSZU biegu', () => {
  const bieg = (
    scenariusz: 'MAX' | 'MIN' | null,
    wiersze: ShortCircuitRow[],
    runId: string = `run-${scenariusz ?? 'bez'}`,
  ): {
    run_id: string;
    rows: ShortCircuitRow[];
    konfiguracja_biegu?: { scenariusz: 'MAX' | 'MIN' | null };
  } =>
    scenariusz === null
      ? { run_id: runId, rows: wiersze }
      : { run_id: runId, rows: wiersze, konfiguracja_biegu: { scenariusz } };

  it('bieg MAX i bieg MIN trafiają do właściwych zbiorów', () => {
    const wynik = podzielWierszeNaPrzypadki([
      bieg('MAX', [wierszSC({ c_factor: 1.1, ikss_ka: 8.4 })]),
      bieg('MIN', [wierszSC({ c_factor: 0.95, ikss_ka: 3.1 })]),
    ]);

    expect(wynik.max.map((w) => w.ikss_ka)).toEqual([8.4]);
    expect(wynik.min.map((w) => w.ikss_ka)).toEqual([3.1]);
    expect(wynik.bezScenariusza).toEqual([]);
  });

  /**
   * ILOCZYN CECH: wariant biegu (MIN) × pasmo napięciowe punktu (SN vs nN).
   * IEC 60909-0 Tabela 1: c_min = 1,00 powyżej 1 kV, 0,95 dla nN. Bieg MINIMALNY
   * na sieci SN niesie WIĘC c = 1,00 na szynach SN i 0,95 na szynach nN — dawna
   * klasyfikacja progiem `c >= 1` wrzucała wiersze SN tego biegu do zbioru
   * MAKSYMALNEGO i ekran koordynacji nigdy nie dostawał Ik_min dla zabezpieczenia
   * na szynie SN (zmierzone na realnych biegach magistrali SN, karta
   * HARNESS-RESZTA-2).
   */
  it('bieg MIN na sieci SN (c_min = 1,00 wg IEC 60909 Tab. 1) NIE trafia do zbioru MAX', () => {
    const wynik = podzielWierszeNaPrzypadki([
      bieg('MAX', [wierszSC({ element_id: 'bus/sn/1', c_factor: 1.1, ikss_ka: 9.06 })]),
      bieg('MIN', [
        wierszSC({ element_id: 'bus/sn/1', c_factor: 1.0, ikss_ka: 8.41 }),
        wierszSC({ element_id: 'bus/nn/1', c_factor: 0.95, ikss_ka: 18.5 }),
      ]),
    ]);

    expect(wynik.max.map((w) => w.ikss_ka)).toEqual([9.06]);
    expect(wynik.min.map((w) => w.ikss_ka)).toEqual([8.41, 18.5]);

    // Zabezpieczenie linii przy zacisku `od` (szyna SN `bus/sn/1`, rozstrzygnięcie
    // backendu) — prąd zwarciowy czytany na szynie zacisku, pozycja pod lokalizacją.
    const prady = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie()],
      wierszeMax: wynik.max,
      wierszeMin: wynik.min,
      wierszeGalezi: [wierszGalezi()],
      miejsca: miejscaUrzadzen(['dev-1', miejsce()]),
    });
    expect(prady.faultCurrents).toEqual([
      { location_id: 'line/sn/1', ik_max_3f_a: 9060, ik_min_3f_a: 8410 },
    ]);
    expect(prady.braki).toEqual([]);
  });

  /**
   * Backend potwierdza prądy żądania wobec DOKŁADNIE dwóch biegów (`sc_run_id`,
   * `sc_run_id_min`). Scalanie wierszy kilku biegów jednego scenariusza dawało prądy,
   * których żaden bieg nie potwierdza — bierzemy najnowszy (pierwszy na liście).
   */
  it('jeden bieg na scenariusz: najnowszy wygrywa, starsze są jawnie pominięte', () => {
    const wynik = podzielWierszeNaPrzypadki([
      bieg('MIN', [wierszSC({ ikss_ka: 3.2 })], 'run-min-nowy'),
      bieg('MAX', [wierszSC({ ikss_ka: 8.5 })], 'run-max-nowy'),
      bieg('MAX', [wierszSC({ ikss_ka: 8.4 })], 'run-max-stary'),
      bieg('MIN', [wierszSC({ ikss_ka: 3.1 })], 'run-min-stary'),
    ]);

    expect(wynik.runIdMax).toBe('run-max-nowy');
    expect(wynik.runIdMin).toBe('run-min-nowy');
    expect(wynik.max.map((w) => w.ikss_ka)).toEqual([8.5]);
    expect(wynik.min.map((w) => w.ikss_ka)).toEqual([3.2]);
    expect(wynik.pominiete).toEqual(['run-max-stary', 'run-min-stary']);
  });

  it('brak biegu scenariusza → brak identyfikatora (nie identyfikator innego biegu)', () => {
    const wynik = podzielWierszeNaPrzypadki([bieg('MAX', [wierszSC()], 'run-max')]);
    expect(wynik.runIdMax).toBe('run-max');
    expect(wynik.runIdMin).toBeNull();
  });

  it('bieg bez zapisanego scenariusza nie trafia do żadnego przypadku (zero zgadywania)', () => {
    const wynik = podzielWierszeNaPrzypadki([bieg(null, [wierszSC({ c_factor: 1.1 })])]);

    expect(wynik.max).toEqual([]);
    expect(wynik.min).toEqual([]);
    expect(wynik.bezScenariusza).toHaveLength(1);
  });

  it('dwa biegi razem dają komplet prądów koordynacji', () => {
    const { max, min } = podzielWierszeNaPrzypadki([
      bieg('MAX', [wierszSC({ c_factor: 1.1, ikss_ka: 8.4 })]),
      bieg('MIN', [wierszSC({ c_factor: 0.95, ikss_ka: 3.1 })]),
    ]);
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie()],
      wierszeMax: max,
      wierszeMin: min,
      wierszeGalezi: [wierszGalezi()],
      miejsca: miejscaUrzadzen(['dev-1', miejsce()]),
    });

    expect(wynik.faultCurrents).toEqual([
      { location_id: 'line/sn/1', ik_max_3f_a: 8400, ik_min_3f_a: 3100 },
    ]);
    expect(wynik.operatingCurrents).toEqual([{ location_id: 'line/sn/1', i_operating_a: 187.5 }]);
    expect(wynik.braki).toEqual([]);
  });
});
