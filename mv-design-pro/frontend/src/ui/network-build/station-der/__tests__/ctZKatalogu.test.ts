/**
 * V12K-233: rozwiazanie klasy przekladnika z PRAWDZIWEGO katalogu.
 *
 * Pola `ct_accuracy_class` / `ct_application` byly w kontrakcie i w regule normowej od
 * V12K-232, ale NIKT ICH NIE WYPELNIAL — wiec dla kazdego realnego przekladnika os
 * zabezpieczen zostawala „czesciowo" z kodem `der.ct_class.unresolved`. Te testy
 * pilnuja brakujacego ogniwa ORAZ jego granic: przyblizenie klasy albo zgadniecie
 * rdzenia podwojnego falszowaloby werdykt zabezpieczeniowy.
 */

import { describe, expect, it } from 'vitest';

import type { CTCatalogType } from '../../../catalog/types';
import { buildAggregatedReadiness, computeDerReadinessMatrix } from '../readiness';
import {
  klasaKanoniczna,
  wzbogacDeryOKlaseCt,
  wzbogacOKlaseCt,
  zastosowanieZKatalogu,
} from '../ctZKatalogu';
import type { StationDerConnection } from '../types';

/** Realne wpisy katalogu backendu (`/api/catalog/ct-types`). */
const TYPY_CT = [
  { id: 'ct_200_5_5p10_10va_abb', name: 'CT 200/5 A kl. 5P10 10 VA', ratio_primary_a: 200, ratio_secondary_a: 5, accuracy_class: '5P10', burden_va: 10, application: 'protection', accuracy_limit_factor: 10 },
  { id: 'ct_100_1_0_5_5va_abb', name: 'CT 100/1 A kl. 0.5 5 VA', ratio_primary_a: 100, ratio_secondary_a: 1, accuracy_class: '0.5', burden_va: 5, application: 'metering', accuracy_limit_factor: null },
  { id: 'ct_bez_klasy', name: 'CT bez klasy', ratio_primary_a: 300, ratio_secondary_a: 5, application: null, accuracy_limit_factor: null },
  { id: 'ct_klasa_nieznana', name: 'CT 5P30', ratio_primary_a: 400, ratio_secondary_a: 5, accuracy_class: '5P30', application: 'protection', accuracy_limit_factor: 30 },
] as unknown as readonly CTCatalogType[];

function der(over: Partial<StationDerConnection> = {}): StationDerConnection {
  // Karta FAB-K (§0 R3, KLASA NIE INSTANCJA): dawny `'mv_bay'` nigdy nie był
  // realną wartością `ConnectionSide` — topologia przyłączenia jest tu
  // nieistotna (testy sprawdzają wyłącznie rozwiązanie klasy przekładnika CT).
  return {
    id: 'DER-1',
    station_id: 'ST-1',
    der_kind: 'PV',
    connection_side: 'nN',
    bus_przylaczenia_ref: 'BUS-1',
    bay_ref: null,
    lv_busbar_ref: 'BUS-1',
    sn_connection_bus_ref: null,
    sn_connection_point_kind: null,
    nominal_power_kw: 500,
    connection_voltage_kv: null,
    catalogs: {
      device_catalog_ref: 'INV-1',
      block_transformer_catalog_ref: null,
      protection_catalog_ref: 'REL-1',
      ct_catalog_ref: 'ct_200_5_5p10_10va_abb',
      vt_catalog_ref: 'VT-1',
      dynamic_model_ref: null,
    },
    profiles: { nc_rfg_profile_ref: null, lvrt_curve_ref: null, hvrt_curve_ref: null },
    ...over,
  } as unknown as StationDerConnection;
}

describe('klasaKanoniczna — zwezenie tekstu katalogowego', () => {
  it('rozpoznaje klasy z kanonicznej unii, niezaleznie od wielkosci liter', () => {
    expect(klasaKanoniczna('5P10')).toBe('5P10');
    expect(klasaKanoniczna('5p10')).toBe('5P10');
    expect(klasaKanoniczna(' 0.5 ')).toBe('0.5');
    expect(klasaKanoniczna('10P20')).toBe('10P20');
  });

  it('klasa spoza kanonu daje NULL, nie najblizsze przyblizenie', () => {
    // Przyblizenie klasy przekladnika falszowaloby werdykt zabezpieczeniowy: 5P30
    // ma inny blad graniczny niz 5P20, a zapis zlozony opisuje DWA rdzenie.
    expect(klasaKanoniczna('5P30')).toBeNull();
    expect(klasaKanoniczna('5P10/0.5')).toBeNull();
    expect(klasaKanoniczna('')).toBeNull();
    expect(klasaKanoniczna(undefined)).toBeNull();
  });
});

describe('zastosowanieZKatalogu — dana CZYTANA, nie wyprowadzana tutaj (V12K-239)', () => {
  it('przepuszcza rodzaj rdzenia opublikowany przez katalog', () => {
    // Regula normowa IEC 61869-2 stoi w KATALOGU (`rdzen_ct_z_klasy`, backend) — front
    // nie ma wlasnej kopii, wiec tutaj sprawdzamy odczyt, a nie norme.
    expect(zastosowanieZKatalogu(TYPY_CT[0])).toBe('protection');
    expect(zastosowanieZKatalogu(TYPY_CT[1])).toBe('metering');
  });

  it('brak danej w katalogu daje NULL — front jej nie dorabia', () => {
    // Kontrola odwrotna do przeniesienia reguly: gdyby front nadal umial wyprowadzic
    // rodzaj rdzenia z klasy, ten wpis (klasa nieobecna) dostalby wartosc mimo braku
    // danej w katalogu — i rownolegla regula wrocilaby bocznymi drzwiami.
    expect(zastosowanieZKatalogu(TYPY_CT[2])).toBeNull();
    expect(zastosowanieZKatalogu(undefined)).toBeNull();
  });

  it('wartosc spoza kanonu w odpowiedzi katalogu jest odrzucana', () => {
    const dziwny = { id: 'x', application: 'cokolwiek' } as unknown as CTCatalogType;
    expect(zastosowanieZKatalogu(dziwny)).toBeNull();
  });

  it('rdzen PODWOJNY jest przepuszczany, gdy katalog go zadeklaruje', () => {
    // `dual` to dana KONSTRUKCYJNA producenta. Front jej nie wymysla, ale musi ja
    // przepuscic — inaczej warunek 87T zostanie nierozstrzygalny nawet po uzupelnieniu
    // katalogu. Dzisiejszy katalog referencyjny nie ma takiego typu (pomiar: 12 typow,
    // zero dwurdzeniowych — test w backendzie pilnuje tej granicy).
    const dwurdzeniowy = { id: 'ct_dual', application: 'dual' } as unknown as CTCatalogType;
    expect(zastosowanieZKatalogu(dwurdzeniowy)).toBe('dual');
  });
});

describe('wzbogacOKlaseCt — brakujace ogniwo miedzy katalogiem a regula', () => {
  it('uzupelnia klase i zastosowanie z realnego wpisu katalogu', () => {
    const wynik = wzbogacOKlaseCt(der(), TYPY_CT);

    expect(wynik.ct_accuracy_class).toBe('5P10');
    expect(wynik.ct_application).toBe('protection');
  });

  it('dana JUZ OBECNA na rekordzie ma pierwszenstwo nad katalogiem', () => {
    // Rekord moze niesc klase z materializacji katalogowej w modelu — katalog jej
    // nie nadpisuje, bo model jest blizej prawdy o TYM egzemplarzu.
    const wynik = wzbogacOKlaseCt(
      der({ ct_accuracy_class: '10P20', ct_application: 'dual' }),
      TYPY_CT,
    );

    expect(wynik.ct_accuracy_class).toBe('10P20');
    expect(wynik.ct_application).toBe('dual');
  });

  it('typ nieobecny w katalogu zostawia pola PUSTE — brak wiedzy, nie spelnienie', () => {
    const wynik = wzbogacOKlaseCt(
      der({ catalogs: { ...der().catalogs, ct_catalog_ref: 'ct_nie_ma_takiego' } }),
      TYPY_CT,
    );

    expect(wynik.ct_accuracy_class).toBeUndefined();
  });

  it('wpis bez klasy albo z klasa spoza kanonu zostawia pola PUSTE', () => {
    for (const ref of ['ct_bez_klasy', 'ct_klasa_nieznana']) {
      const wynik = wzbogacOKlaseCt(
        der({ catalogs: { ...der().catalogs, ct_catalog_ref: ref } }),
        TYPY_CT,
      );
      expect(wynik.ct_accuracy_class).toBeUndefined();
    }
  });

  it('wytworca BEZ przypisanego przekladnika zostaje nietkniety', () => {
    const bezCt = der({ catalogs: { ...der().catalogs, ct_catalog_ref: null } });
    expect(wzbogacOKlaseCt(bezCt, TYPY_CT)).toBe(bezCt);
  });

  it('PUSTY katalog (jeszcze nie pobrany) nie wypelnia niczego', () => {
    // Kontrola odwrotna do calej naprawy: dopoki katalogu nie ma, regula musi
    // zglaszac brak danej, a nie dostawac zgadnieta klase.
    const wynik = wzbogacOKlaseCt(der(), []);
    expect(wynik.ct_accuracy_class).toBeUndefined();
  });
});

describe('domkniecie lancucha: katalog -> dana -> werdykt osi', () => {
  it('po wzbogaceniu os zabezpieczen jest GOTOWA dla realnego przekladnika 5P10', () => {
    // POMIAR PRZED (V12K-232): status `partial`, bloker `der.ct_class.unresolved`.
    const przed = computeDerReadinessMatrix(der());
    expect(przed.protection).toBe('partial');

    const [wzbogacony] = wzbogacDeryOKlaseCt([der()], TYPY_CT);
    const po = computeDerReadinessMatrix(wzbogacony);
    const kody = (buildAggregatedReadiness(wzbogacony).find((a) => a.axis === 'protection')
      ?.blockers ?? []).map((b) => b.code);

    expect(po.protection).toBe('ready');
    expect(kody).not.toContain('der.ct_class.unresolved');
  });

  it('realny przekladnik POMIAROWY daje werdykt naruszenia, nie brak danej', () => {
    const pomiarowy = der({
      catalogs: { ...der().catalogs, ct_catalog_ref: 'ct_100_1_0_5_5va_abb' },
    });
    const [wzbogacony] = wzbogacDeryOKlaseCt([pomiarowy], TYPY_CT);
    const kody = (buildAggregatedReadiness(wzbogacony).find((a) => a.axis === 'protection')
      ?.blockers ?? []).map((b) => b.code);

    expect(kody).toContain('der.ct_class.invalid');
    expect(kody).not.toContain('der.ct_class.unresolved');
  });
});
