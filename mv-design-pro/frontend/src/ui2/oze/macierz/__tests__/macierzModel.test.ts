/**
 * Model macierzy NC RfG na kontrakcie V2 (karta AB-1a Pakiet D2 §2–§3). Zero agregatów:
 * komórka = rekord `ocena` testu z biegu; napięcie i moc wyłącznie z modelu; formularz
 * wstępny i blokada modułu wyłącznie z wejść mostu modelu (`GET …/wejscia`, luka §5.3);
 * wejście biegu = dokładnie pola kontraktu; filtr komórek = etykiety obecne w rekordach.
 */

import { describe, expect, it } from 'vitest';

import { POLA_LICZBOWE_WEJSCIA } from '../../ncrfg/formularz';
import {
  POLA_ZDOLNOSCI,
  POLA_ZDOLNOSCI_TROJSTANOWYCH,
  etykietyObecne,
  mapujMacierz,
  ocenaWymaganModulu,
  rozwiazNapiecieKv,
  wynikModulu,
  zbudujModuly,
  zbudujWejscieModulu,
  zbudujZadanieCertyfikatu,
  type OpisModulu,
} from '../macierzModel';
import {
  biegFixture,
  derFixture,
  deryScenyMacierz,
  katalogFixture,
  wejsciaFixture,
  wejsciaZ,
  zadanieBieguFixture,
} from './fixtures';

describe('rozwiazNapiecieKv — napięcie WYŁĄCZNIE z modelu', () => {
  it.each([
    [0.4, 0.4],
    [15, 15],
    [null, null],
    [0, null],
    [-1, null],
  ] as const)('connection_voltage_kv=%s → %s (bez domyślnego 15 kV)', (wartosc, oczekiwane) => {
    expect(rozwiazNapiecieKv(derFixture({ id: 'x', connection_voltage_kv: wartosc }))).toBe(oczekiwane);
  });
});

describe('zbudujModuly — kolumny z modelu, formularz wstępny z wejść mostu (`GET …/wejscia`)', () => {
  const wejscia = wejsciaFixture();

  it('moduły sceny: kolejność modelu, moc i napięcie z modelu, formularz złożony z powrotem = wejście mostu 1:1', () => {
    const moduly = zbudujModuly(deryScenyMacierz(), wejscia);
    expect(moduly.map((m) => [m.derRef, m.powodBlokady])).toEqual(
      zadanieBieguFixture().modules.map((m) => [m.der_ref, null]),
    );
    for (const opis of moduly) {
      const zModelu = wejscia.modules.find((m) => m.der_ref === opis.derRef)!;
      expect(opis.wejscieModelu).toBe(zModelu);
      // Formularz wstępny bez edycji składa się z powrotem DOKŁADNIE w wejście mostu.
      expect(zbudujWejscieModulu(opis, wejscia.operator_id)).toEqual({ stan: 'ok', wejscie: zModelu });
    }
  });

  it('pola liczone przez most z danych generatora (statyzm, martwa strefa, zakres Q, Q(U), FRT) — wypełnione „z modelu"', () => {
    const pv = zbudujModuly(deryScenyMacierz(), wejscia).find((m) => m.rodzaj === 'PV')!;
    const f = pv.formularz;
    expect([f.liczby.droop_percent, f.pochodzenieLiczb.droop_percent]).toEqual(['5', 'model']);
    expect([f.liczby.dead_band_hz, f.pochodzenieLiczb.dead_band_hz]).toEqual(['0.2', 'model']);
    expect(Number(f.liczby.q_range_pct_pn_min)).toBeLessThan(0);
    expect(Number(f.liczby.q_range_pct_pn_max)).toBeGreaterThan(0);
    expect(f.pochodzenieLiczb.q_range_pct_pn_max).toBe('model');
    for (const pole of ['has_qu_curve', 'has_hvrt_curve', 'has_lvrt_curve', 'has_pf_droop'] as const) {
      expect([f.zdolnosci[pole], f.pochodzenieZdolnosci[pole]], pole).toEqual([true, 'model']);
    }
    // Brak danej w modelu (cos φ bez deklaracji) — pole puste, dane deklarowane.
    expect([f.liczby.cos_phi_min, f.pochodzenieLiczb.cos_phi_min]).toEqual(['', 'deklarowane']);
  });

  it('pochodzenie każdego pola formularza = członkostwo w `pola_z_modelu` (iloczyn: moduł × pole)', () => {
    for (const opis of zbudujModuly(deryScenyMacierz(), wejscia)) {
      const zModelu = new Set(wejscia.pola_z_modelu[opis.derRef]);
      const f = opis.formularz;
      for (const pole of POLA_ZDOLNOSCI) {
        expect(f.pochodzenieZdolnosci[pole], `${opis.derRef}:${pole}`).toBe(zModelu.has(pole) ? 'model' : 'deklarowane');
      }
      for (const pole of POLA_LICZBOWE_WEJSCIA) {
        expect(f.pochodzenieLiczb[pole], `${opis.derRef}:${pole}`).toBe(zModelu.has(pole) ? 'model' : 'deklarowane');
      }
      expect(f.pochodzenieModuluIstniejacego).toBe(zModelu.has('modul_istniejacy') ? 'model' : 'deklarowane');
      expect(f.pochodzenieDatyUmowy).toBe(zModelu.has('data_umowy_przylaczeniowej') ? 'model' : 'deklarowane');
      expect(f.pochodzenieNastaw).toBe(zModelu.has('nastawy_zabezpieczen_modulu') ? 'model' : 'deklarowane');
    }
  });

  it.each(POLA_LICZBOWE_WEJSCIA)(
    'pole liczbowe %s: dana modelu → wartość 1:1 i „z modelu" (także cos φ); brak danej → puste, dane deklarowane',
    (pole) => {
      // 0,5 spełnia ograniczenie KAŻDEGO pola kontraktu (gt 0, ge 0, le 1 — lustro pydantic).
      const wartosc = 0.5;
      const [zDana] = zbudujModuly(
        [derFixture({ id: 'x' })],
        wejsciaZ({ moduly: [{ derRef: 'x', pola: { [pole]: wartosc }, zModelu: ['der_ref', pole] }] }),
      );
      expect([zDana.formularz.liczby[pole], zDana.formularz.pochodzenieLiczb[pole]]).toEqual(['0.5', 'model']);
      // Formularz bez edycji składa się z powrotem w wejście mostu — wartość modelu 1:1.
      const wynik = zbudujWejscieModulu(zDana, 'enea');
      expect(wynik.stan === 'ok' && wynik.wejscie[pole]).toBe(wartosc);

      const [bezDanej] = zbudujModuly(
        [derFixture({ id: 'x' })],
        wejsciaZ({ moduly: [{ derRef: 'x', pola: { [pole]: null }, zModelu: ['der_ref'] }] }),
      );
      expect([bezDanej.formularz.liczby[pole], bezDanej.formularz.pochodzenieLiczb[pole]]).toEqual([
        '',
        'deklarowane',
      ]);
    },
  );

  it('flagi trójstanowe z modelu: scena niesie tak × nie × niezadeklarowane; niezadeklarowane NIGDY `false`', () => {
    const moduly = zbudujModuly(deryScenyMacierz(), wejscia);
    const stany = new Set<boolean | null>();
    for (const opis of moduly) {
      for (const pole of POLA_ZDOLNOSCI_TROJSTANOWYCH) {
        const wartosc = opis.formularz.zdolnosci[pole];
        stany.add(wartosc);
        expect(wartosc, pole).toBe(opis.wejscieModelu![pole]);
      }
    }
    expect(stany).toEqual(new Set([true, false, null]));
  });

  it('data umowy, art. 4, nastawy i wymaganie programu z wejścia modelu (rekord syntetyczny)', () => {
    const [opis] = zbudujModuly(
      [derFixture({ id: 'x' })],
      wejsciaZ({
        moduly: [
          {
            derRef: 'x',
            pola: {
              modul_istniejacy: true,
              data_umowy_przylaczeniowej: '2019-04-27',
              black_start_required: true,
              black_start_capable: null,
              nastawy_zabezpieczen_modulu: null,
            },
            zModelu: ['der_ref', 'modul_istniejacy', 'data_umowy_przylaczeniowej', 'black_start_required'],
          },
        ],
      }),
    );
    expect(opis.formularz.dataUmowy).toBe('2019-04-27');
    expect(opis.formularz.pochodzenieDatyUmowy).toBe('model');
    expect(opis.formularz.modulIstniejacy).toBe('tak');
    expect(opis.formularz.zdolnosci.black_start_required).toBe(true);
    expect(opis.formularz.pochodzenieZdolnosci.black_start_required).toBe('model');
    expect(opis.formularz.zdolnosci.black_start_capable).toBeNull();
    expect(opis.formularz.pochodzenieNastaw).toBe('deklarowane');
    const wynik = zbudujWejscieModulu(opis, 'enea');
    expect(wynik.stan === 'ok' && wynik.wejscie).toMatchObject({
      der_ref: 'x',
      modul_istniejacy: true,
      data_umowy_przylaczeniowej: '2019-04-27',
      black_start_required: true,
      black_start_capable: null,
      nastawy_zabezpieczen_modulu: null,
    });
  });

  it.each([
    ['wejścia niewczytane', null, 'brak_wejscia_modelu'],
    ['DER pominięty przez most — brak napięcia', wejsciaZ({ pominiete: [{ derRef: 'x', powod: 'brak_napiecia' }] }), 'brak_napiecia'],
    ['DER pominięty przez most — brak mocy', wejsciaZ({ pominiete: [{ derRef: 'x', powod: 'brak_mocy' }] }), 'brak_mocy'],
    ['DER spoza wejść modelu', wejsciaZ({ moduly: [{ derRef: 'inny' }] }), 'brak_wejscia_modelu'],
  ] as const)('%s → jawna blokada %s, formularz bez wejścia (nic z modelu)', (_opis, zrodlo, powod) => {
    const [opis] = zbudujModuly([derFixture({ id: 'x' })], zrodlo);
    expect(opis.powodBlokady).toBe(powod);
    expect(opis.wejscieModelu).toBeNull();
    for (const pole of POLA_ZDOLNOSCI) {
      expect(opis.formularz.pochodzenieZdolnosci[pole], pole).toBe('deklarowane');
      expect(opis.formularz.zdolnosci[pole], pole).toBe(
        (POLA_ZDOLNOSCI_TROJSTANOWYCH as readonly string[]).includes(pole) ? null : false,
      );
    }
    expect(Object.values(opis.formularz.liczby).every((v) => v === '')).toBe(true);
    expect(zbudujWejscieModulu(opis, 'enea')).toEqual({ stan: 'zablokowany', powod });
  });

  it('blokada wyłącznie z mostu: DER bez napięcia w migawce, ale objęty wejściem modelu — nie jest blokowany przez klienta', () => {
    const [opis] = zbudujModuly(
      [derFixture({ id: 'x', connection_voltage_kv: null })],
      wejsciaZ({ moduly: [{ derRef: 'x' }] }),
    );
    expect(opis.napiecieKv).toBeNull();
    expect(opis.powodBlokady).toBeNull();
  });
});

function zFormularzem(opis: OpisModulu, zmiany: Partial<OpisModulu['formularz']>): OpisModulu {
  return { ...opis, formularz: { ...opis.formularz, ...zmiany } };
}

describe('zbudujWejscieModulu — dokładnie pola kontraktu', () => {
  const [bess, pv] = zbudujModuly(deryScenyMacierz(), wejsciaFixture());

  it('formularz wstępny → wejście = ciało fixtury (pola puste = null, operator z argumentu)', () => {
    expect([bess, pv].map((o) => zbudujWejscieModulu(o, 'enea'))).toEqual(
      zadanieBieguFixture().modules.map((wejscie) => ({ stan: 'ok', wejscie })),
    );
  });

  it('tożsamość modułu (referencja, nazwa, rodzaj, moc, napięcie) z wejścia modelu, nie z opisu kolumny', () => {
    const wynik = zbudujWejscieModulu({ ...pv, mocKw: 1, napiecieKv: 99, nazwa: 'inna' }, 'enea');
    expect(wynik.stan === 'ok' && wynik.wejscie).toMatchObject({
      der_ref: pv.wejscieModelu!.der_ref,
      der_name: pv.wejscieModelu!.der_name,
      der_kind: pv.wejscieModelu!.der_kind,
      p_max_kw: pv.wejscieModelu!.p_max_kw,
      voltage_kv: pv.wejscieModelu!.voltage_kv,
    });
  });

  it('art. 4, T12 i nastawy trafiają do wejścia 1:1', () => {
    const wynik = zbudujWejscieModulu(
      zFormularzem(pv, {
        modulIstniejacy: 'tak',
        dataUmowy: '2019-04-27',
        liczby: { ...pv.formularz.liczby, cease_generation_time_s: '5' },
        nastawy: { ...pv.formularz.nastawy, wartosci: { ...pv.formularz.nastawy.wartosci, u_min_pu: '0,8' }, zrodlo: 'karta' },
      }),
      'enea',
    );
    expect(wynik.stan).toBe('ok');
    if (wynik.stan !== 'ok') return;
    expect(wynik.wejscie.modul_istniejacy).toBe(true);
    expect(wynik.wejscie.data_umowy_przylaczeniowej).toBe('2019-04-27');
    expect(wynik.wejscie.cease_generation_time_s).toBe(5);
    expect(wynik.wejscie.nastawy_zabezpieczen_modulu?.u_min_pu).toBe(0.8);
    expect(wynik.wejscie.nastawy_zabezpieczen_modulu?.zrodlo_pl).toBe('karta');
  });

  it('pole spoza ograniczenia / zła data / nastawa bez źródła → nazwane błędy pól, zero żądania', () => {
    const wynik = zbudujWejscieModulu(
      zFormularzem(pv, {
        liczby: { ...pv.formularz.liczby, cos_phi_min: '1,5' },
        dataUmowy: '27.04.2019',
        nastawy: { zrodlo: '', wartosci: { ...pv.formularz.nastawy.wartosci, f_min_hz: '47' } },
      }),
      'enea',
    );
    expect(wynik.stan).toBe('blad');
    expect(wynik.stan === 'blad' && Object.keys(wynik.bledy).sort()).toEqual([
      'cos_phi_min',
      'data_umowy_przylaczeniowej',
      'zrodlo_pl',
    ]);
  });
});

describe('mapujMacierz — komórka = rekord oceny testu', () => {
  const katalog = katalogFixture();
  const bieg = biegFixture();
  const moduly = [
    ...zbudujModuly(deryScenyMacierz(), wejsciaFixture()),
    ...zbudujModuly([derFixture({ id: 'fw-bez-napiecia', der_kind: 'FW', connection_voltage_kv: null })], null),
  ];

  it('przed biegiem: wiersze = katalog testów, komórki „brak biegu" / „brak danych modułu"', () => {
    const wiersze = mapujMacierz(katalog.tests, null, moduly);
    expect(wiersze.map((w) => w.test.test_id)).toEqual(katalog.tests.map((t) => t.test_id));
    for (const wiersz of wiersze) {
      expect(wiersz.komorki.map((k) => k.stan)).toEqual(['brak_biegu', 'brak_biegu', 'brak_danych_modul']);
    }
  });

  it('po biegu: komórka niesie rekord `ocena` testu tego modułu (ten sam obiekt z biegu)', () => {
    const wiersze = mapujMacierz(bieg.test_catalog, bieg, moduly);
    for (const wiersz of wiersze) {
      wiersz.komorki.slice(0, 2).forEach((komorka) => {
        expect(komorka.stan).toBe('wynik');
        if (komorka.stan !== 'wynik') return;
        const test = wynikModulu(bieg, komorka.derRef)!.tests.find((t) => t.test_id === wiersz.test.test_id)!;
        expect(komorka.wynik.ocena).toBe(test.ocena);
      });
      expect(wiersz.komorki[2].stan).toBe('brak_danych_modul');
    }
  });

  it('wynikModulu/ocenaWymaganModulu po der_ref; moduł spoza biegu → null', () => {
    const [bess] = moduly;
    expect(wynikModulu(bieg, bess.derRef)?.der_ref).toBe(bess.derRef);
    expect(ocenaWymaganModulu(bieg, bess.derRef)?.wymagania.length).toBeGreaterThan(0);
    expect(wynikModulu(bieg, 'nieznany')).toBeNull();
    expect(ocenaWymaganModulu(null, bess.derRef)).toBeNull();
  });
});

describe('etykietyObecne — opcje filtra z rekordów (bez mapy status → tekst)', () => {
  it('unikalne etykiety w kolejności pierwszego wystąpienia, status z rekordu', () => {
    const bieg = biegFixture();
    const opcje = etykietyObecne(bieg);
    const wszystkie = bieg.modules.flatMap((m) => m.tests.map((t) => t.ocena));
    expect(opcje.map((o) => o.etykieta.etykieta_pl)).toEqual([
      ...new Set(wszystkie.map((o) => o.etykieta.etykieta_pl)),
    ]);
    for (const opcja of opcje) {
      const zrodlo = wszystkie.find((o) => o.etykieta.etykieta_pl === opcja.etykieta.etykieta_pl)!;
      expect(opcja.status).toBe(zrodlo.status_maszynowy);
    }
    expect(etykietyObecne(null)).toEqual([]);
  });
});

describe('zbudujZadanieCertyfikatu — pola CertyfikatZgodnosciRequest', () => {
  it.each([
    [' Farma ', ' Stan normalny ', { nazwa_projektu: 'Farma', nazwa_przypadku: 'Stan normalny', operator_id: 'enea' }],
    ['', null, { nazwa_projektu: 'Projekt bez nazwy', nazwa_przypadku: null, operator_id: 'enea' }],
    [null, '  ', { nazwa_projektu: 'Projekt bez nazwy', nazwa_przypadku: null, operator_id: 'enea' }],
  ] as const)('projekt=%j przypadek=%j', (nazwaProjektu, nazwaPrzypadku, oczekiwane) => {
    expect(
      zbudujZadanieCertyfikatu({ nazwaProjektu, nazwaPrzypadku, operatorId: 'enea', nazwaZastepcza: 'Projekt bez nazwy' }),
    ).toEqual(oczekiwane);
  });
});
