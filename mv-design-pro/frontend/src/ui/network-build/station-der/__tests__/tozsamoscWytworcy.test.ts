/**
 * Tożsamość wytwórcy: moc jednostki vs grupy, tor mocy, stan konfiguracji (V12K-245).
 *
 * Audyt E-21 (pkt P2/P3/P4) wykazał trzy nieprawdy na jednym ekranie: jedna etykieta
 * „Moc znamionowa AC" pokazywała raz moc grupy, raz jednostki; tor mocy był stałym
 * łańcuchem bez ani jednego elementu z modelu; słowo „kompletna" padało po spełnieniu
 * trzech warunków przy kilkunastu wymaganych. Te testy pilnują naprawy ORAZ granic:
 * brak danej nie może udawać zgodności.
 */

import { describe, expect, it } from 'vitest';

import {
  identyfikacjaMocy,
  stanKonfiguracji,
  torMocy,
} from '../tozsamoscWytworcy';
import { EMPTY_DER_CATALOGS, EMPTY_DER_PROFILES, EMPTY_DER_READINESS } from '../types';
import type { DerReadinessMatrix, StationDerConnection } from '../types';

function der(over: Partial<StationDerConnection> = {}): StationDerConnection {
  return {
    id: 'DER-1',
    project_id: 'p',
    station_id: 'ST-1',
    der_kind: 'PV',
    name: 'Blok PV-01',
    connection_side: 'dedicated_transformer',
    bus_przylaczenia_ref: 'BUS-SN-1',
    bay_ref: 'BAY-1',
    transformer_ref: 'TR-1',
    lv_busbar_ref: 'BUS-NN-1',
    sn_connection_bus_ref: 'BUS-SN-1',
    sn_connection_point_kind: 'station_bus',
    connection_voltage_kv: 15,
    catalogs: { ...EMPTY_DER_CATALOGS },
    profiles: { ...EMPTY_DER_PROFILES },
    nominal_power_kw: 8000,
    unit_count: 8,
    completeness: 'complete',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: '2026-07-27T00:00:00Z',
    updated_at: '2026-07-27T00:00:00Z',
    ...over,
  };
}

describe('identyfikacja mocy — jednostka, liczba sztuk, grupa', () => {
  it('rozróżnia moc grupy od mocy jednostki', () => {
    const moc = identyfikacjaMocy({ nominal_power_kw: 8000, unit_count: 8 }, 1000);
    expect(moc.mocGrupyKw).toBe(8000);
    expect(moc.liczbaJednostek).toBe(8);
    expect(moc.mocJednostkiKw).toBe(1000);
    expect(moc.grupaJednostek).toBe(true);
    expect(moc.sprzecznosc).toBeNull();
  });

  it('WYKRYWA sprzeczność mocy — dokładnie ta, której ekran nie umiał zauważyć', () => {
    // 8 jednostek po 1 MW zapisane w modelu jako 1 MW: do V12K-245 ekran pokazywał
    // po prostu „1000 kW" i nie miał czym wykryć, że to nie zgadza się z liczbą sztuk.
    const moc = identyfikacjaMocy({ nominal_power_kw: 1000, unit_count: 8 }, 1000);
    expect(moc.sprzecznosc).toEqual({ oczekiwanaKw: 8000, wModeluKw: 1000 });
  });

  it('drobna różnica zaokrągleń NIE jest sprzecznością', () => {
    // Kontrola odwrotna: sprzeczność ma wskazywać błąd danych, nie szum zaokrągleń.
    const moc = identyfikacjaMocy({ nominal_power_kw: 2499, unit_count: 5 }, 500);
    expect(moc.sprzecznosc).toBeNull();
  });

  it('brak liczby sztuk NIE jest zgodnością — sprawdzenia po prostu nie da się zrobić', () => {
    const moc = identyfikacjaMocy({ nominal_power_kw: 8000, unit_count: null }, 1000);
    expect(moc.liczbaJednostek).toBeNull();
    expect(moc.grupaJednostek).toBe(false);
    expect(moc.sprzecznosc).toBeNull();
  });

  it('liczba sztuk 0 lub ujemna to brak danej, nie zero jednostek', () => {
    expect(identyfikacjaMocy({ nominal_power_kw: 100, unit_count: 0 }, 100).liczbaJednostek)
      .toBeNull();
  });
});

describe('tor mocy — z elementów modelu', () => {
  it('dla transformatora blokowego pokazuje pełny tor od urządzenia do PCC', () => {
    const tor = torMocy(der(), {
      stacja: 'GPZ-01',
      szynaNn: 'Szyna nN 0,4 kV',
      transformator: 'TR blokowy 15/0,4 kV',
      poleSn: 'Pole PV-01',
      pcc: 'Szyna SN 15 kV',
    });
    expect(tor.map((o) => o.rola)).toEqual([
      'Urządzenie wytwórcze',
      'Szyna nN',
      'Transformator blokowy',
      'Pole SN',
      'Stacja',
      'Punkt przyłączenia',
    ]);
    expect(tor.every((o) => o.nazwa !== null)).toBe(true);
  });

  it('brakujące ogniwo zostaje w torze jako BRAK, a nie znika', () => {
    // Pominięcie ukrywałoby dziurę w torze — projektant musi widzieć, czego nie ma.
    const tor = torMocy(der(), {
      stacja: 'GPZ-01',
      szynaNn: null,
      transformator: null,
      poleSn: 'Pole PV-01',
      pcc: 'Szyna SN 15 kV',
    });
    const transformator = tor.find((o) => o.rola === 'Transformator blokowy');
    expect(transformator).toBeDefined();
    expect(transformator?.nazwa).toBeNull();
    expect(transformator?.wymagane).toBe(true);
  });

  it('wytwórca po stronie nN dostaje transformator STACJI (nie blokowy) i pole SN nie jest wymagane', () => {
    // Karta FAB-K (§0 R3, KLASA NIE INSTANCJA): dawny gołosłowny wariant `'SN'`
    // (przyłączenie SN BEZ transformatora dedykowanego) USUNIĘTY jako fizycznie
    // niemożliwy — każde urządzenie DER w katalogu przekształtników jest
    // urządzeniem nN, więc do sieci SN dociera WYŁĄCZNIE przez transformator
    // dedykowany. Test „SN bez ogniw nN" testował stan, którego już nie da się
    // zbudować (`ConnectionSide` ma dziś dokładnie 2 wartości, obie mają Szynę
    // nN w torze — patrz test wyżej dla `dedicated_transformer`). Zastępuje go
    // ILOCZYN CECH dla DRUGIEJ, dotąd nieprzetestowanej w tym bloku wartości:
    // `nN` dostaje nazwę ogniwa 'Transformator stacji SN/nN' (nie 'blokowy') i
    // NIE wymaga własnego pola SN (dzieli pole stacyjne z resztą stacji).
    const tor = torMocy(der({ connection_side: 'nN' }), {
      stacja: 'GPZ-01',
      szynaNn: 'Szyna nN 0,4 kV',
      transformator: 'TR stacji 15/0,4 kV',
      poleSn: null,
      pcc: 'Szyna SN 15 kV',
    });
    expect(tor.map((o) => o.rola)).toEqual([
      'Urządzenie wytwórcze',
      'Szyna nN',
      'Transformator stacji SN/nN',
      'Pole SN',
      'Stacja',
      'Punkt przyłączenia',
    ]);
    const poleSn = tor.find((o) => o.rola === 'Pole SN');
    expect(poleSn?.wymagane).toBe(false);
  });
});

describe('stan konfiguracji — liczony z tej samej macierzy, którą widzi ekran', () => {
  const wszystkieGotowe = Object.fromEntries(
    Object.keys(EMPTY_DER_READINESS).map((os) => [os, 'ready']),
  ) as unknown as DerReadinessMatrix;

  it('komplet osi → zdanie mówi wprost o komplecie', () => {
    const stan = stanKonfiguracji(wszystkieGotowe);
    expect(stan.kompletna).toBe(true);
    expect(stan.zdanie).toContain('Konfiguracja kompletna');
  });

  it('choćby jedna oś niegotowa → słowo „kompletna" NIE pada', () => {
    // To jest sedno pkt P4 audytu: ekran pokazywał „kompletna konfiguracja" obok
    // listy braków, bo liczył ją z innej, trzypolowej reguły.
    const stan = stanKonfiguracji({ ...wszystkieGotowe, protection: 'partial' });
    expect(stan.kompletna).toBe(false);
    expect(stan.zdanie).toContain('Konfiguracja niekompletna');
    expect(stan.zdanie).not.toContain('Konfiguracja kompletna');
    expect(stan.osieCzesciowe).toBe(1);
  });

  it('zdanie podaje policzalny stan, a nie ogólnik', () => {
    const stan = stanKonfiguracji({
      ...wszystkieGotowe,
      protection: 'blocked',
      frt: 'blocked',
      hvrt: 'partial',
    });
    expect(stan.osieZablokowane).toBe(2);
    expect(stan.osieRazem).toBe(14);
    expect(stan.zdanie).toContain('11 z 14');
  });
});
