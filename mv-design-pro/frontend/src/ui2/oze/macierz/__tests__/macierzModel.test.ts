import { describe, it, expect } from 'vitest';

import {
  mapujMacierz,
  podsumowanieModulu,
  podsumowanieProjektu,
  rozwiazNapiecieKv,
  zbudujModuly,
  zbudujWejscieModulu,
} from '../macierzModel';
import { derFixture, katalogFixture, wynikFixture } from './fixtures';

describe('rozwiazNapiecieKv — napięcie WYŁĄCZNIE z modelu (ZAKAZ zgadywania)', () => {
  it('rozwiązuje 0,4 kV z napięcia szyny przyłączenia (connection_voltage_kv)', () => {
    expect(rozwiazNapiecieKv(derFixture({ id: 'pv-1', connection_voltage_kv: 0.4 }))).toBe(0.4);
  });

  it('zwraca null gdy brak napięcia szyny przyłączenia — NIE zgaduje 15 kV', () => {
    const der = derFixture({ id: 'pv-1', connection_voltage_kv: null, connection_side: 'dedicated_transformer' });
    expect(rozwiazNapiecieKv(der)).toBeNull();
  });

  // Karta FAB-K (§0 R4): dawny test „nieznane odwołanie poziomu napięcia"
  // (`voltage_level_ref: 'nieistnieje'`) sprawdzał odporność na ZGADYWALNY,
  // tekstowy identyfikator referencji katalogowej — pole USUNIĘTE jako fantom.
  // `connection_voltage_kv` jest typowane jako `number | null` (kompilator
  // eliminuje klasę „nieparsowalny string" u źródła, nie w runtime) — scenariusz
  // testu przestał być możliwy do skonstruowania, nie tylko przestał występować.
});

describe('zbudujModuly — projekcja realnego źródła DER', () => {
  it('zachowuje kolejność i buduje kolumnę per DER', () => {
    const moduly = zbudujModuly([
      derFixture({ id: 'pv-1', name: 'PV A' }),
      derFixture({ id: 'bess-1', name: 'BESS B', der_kind: 'BESS' }),
    ]);
    expect(moduly.map((m) => m.derRef)).toEqual(['pv-1', 'bess-1']);
    expect(moduly[1].rodzaj).toBe('BESS');
  });

  it('brak napięcia → blokada „brak_napiecia" (jawny stan braku danych)', () => {
    const [modul] = zbudujModuly([derFixture({ id: 'pv-1', connection_voltage_kv: null })]);
    expect(modul.napiecieKv).toBeNull();
    expect(modul.powodBlokady).toBe('brak_napiecia');
  });

  it('brak mocy → blokada „brak_mocy"', () => {
    const [modul] = zbudujModuly([derFixture({ id: 'pv-1', nominal_power_kw: null })]);
    expect(modul.powodBlokady).toBe('brak_mocy');
  });

  it('zdolność LVRT z profilu → pochodzenie „katalog"; SCADA → „deklarowane"', () => {
    const [modul] = zbudujModuly([
      derFixture({ id: 'pv-1', profiles: { lvrt_curve_ref: 'lvrt-enea-b' } }),
    ]);
    expect(modul.zdolnosci.hasLvrtCurve).toBe(true);
    expect(modul.pochodzenieZdolnosci.hasLvrtCurve).toBe('katalog');
    expect(modul.pochodzenieZdolnosci.hasScadaCommunication).toBe('deklarowane');
  });

  it('certyfikat PTPiREE z katalogu → ptpiree_verified', () => {
    const [modul] = zbudujModuly([
      derFixture({ id: 'pv-1', catalogs: { ptpiree_certificate_ref: 'cert-1' } }),
    ]);
    expect(modul.certyfikat).toBe('ptpiree_verified');
  });
});

describe('zbudujWejscieModulu — wejście biegu', () => {
  it('moduł zablokowany → null (nie trafia do biegu)', () => {
    const [modul] = zbudujModuly([derFixture({ id: 'pv-1', connection_voltage_kv: null })]);
    expect(zbudujWejscieModulu(modul, 'enea')).toBeNull();
  });

  it('składa NcRfgModuleInput z napięciem z modelu, mocą i operatorem', () => {
    const [modul] = zbudujModuly([
      derFixture({ id: 'pv-1', nominal_power_kw: 500, connection_voltage_kv: 0.4 }),
    ]);
    const wejscie = zbudujWejscieModulu(modul, 'pge');
    expect(wejscie).not.toBeNull();
    expect(wejscie?.voltage_kv).toBe(0.4);
    expect(wejscie?.p_max_kw).toBe(500);
    expect(wejscie?.operator_id).toBe('pge');
    expect(wejscie?.der_ref).toBe('pv-1');
  });
});

describe('mapujMacierz — siatka test × moduł', () => {
  const moduly = zbudujModuly([
    derFixture({ id: 'pv-1', name: 'PV Dach A' }),
    derFixture({ id: 'bess-1', name: 'Magazyn energii 1', der_kind: 'BESS', nominal_power_kw: 800 }),
    derFixture({ id: 'fw-1', name: 'Farma wiatrowa', der_kind: 'FW', connection_voltage_kv: null }),
  ]);

  it('wiersze = testy katalogu; kolumny = wszystkie moduły', () => {
    const wiersze = mapujMacierz(katalogFixture(), null, moduly);
    expect(wiersze).toHaveLength(3);
    expect(wiersze[0].komorki).toHaveLength(3);
  });

  it('przed biegiem → komórki w stanie „brak_biegu"', () => {
    const wiersze = mapujMacierz(katalogFixture(), null, moduly);
    expect(wiersze[0].komorki[0].stan).toBe('brak_biegu');
    expect(wiersze[0].komorki[0].werdykt).toBeNull();
  });

  it('po biegu → werdykty z wyniku; moduł zablokowany → „brak_danych_modul"', () => {
    const wiersze = mapujMacierz(katalogFixture(), wynikFixture(), moduly);
    const lvrt = wiersze.find((w) => w.test.test_id === 'FRT_LVRT')!;
    expect(lvrt.komorki[0].werdykt).toBe('pass'); // pv-1
    expect(lvrt.komorki[1].werdykt).toBe('fail'); // bess-1
    expect(lvrt.komorki[2].stan).toBe('brak_danych_modul'); // fw-1 (brak napięcia)
    expect(lvrt.komorki[2].powodModulu).toBe('brak_napiecia');
  });

  it('werdykt „niewymagany" jest odwzorowany z wyniku', () => {
    const wiersze = mapujMacierz(katalogFixture(), wynikFixture(), moduly);
    const bs = wiersze.find((w) => w.test.test_id === 'BLACK_START')!;
    expect(bs.komorki[0].werdykt).toBe('not_required');
  });
});

describe('podsumowania per moduł i per projekt', () => {
  const moduly = zbudujModuly([
    derFixture({ id: 'pv-1', name: 'PV Dach A' }),
    derFixture({ id: 'bess-1', name: 'Magazyn energii 1', der_kind: 'BESS' }),
    derFixture({ id: 'fw-1', name: 'Farma wiatrowa', der_kind: 'FW', connection_voltage_kv: null }),
  ]);

  it('per moduł: zgodny/niezgodny z wyniku; zablokowany → brak_danych', () => {
    const wynik = wynikFixture();
    expect(podsumowanieModulu(moduly[0], wynik).overallStatus).toBe('zgodny');
    expect(podsumowanieModulu(moduly[1], wynik).overallStatus).toBe('niezgodny');
    expect(podsumowanieModulu(moduly[2], wynik).overallStatus).toBe('brak_danych');
    expect(podsumowanieModulu(moduly[2], wynik).zablokowany).toBe(true);
  });

  it('per moduł: klasa (module_type) przenoszona z wyniku biegu; brak wyniku → null', () => {
    const bazowy = wynikFixture();
    // Klasa A/B/C/D pochodzi z odpowiedzi solvera (`module_type`) — tu nadpisana
    // realistyczną klasą, aby zweryfikować przeniesienie wartości bez zmian logiki.
    const wynik = {
      ...bazowy,
      modules: [
        { ...bazowy.modules[0], module_type: 'B' },
        { ...bazowy.modules[1], module_type: 'D' },
      ],
    };
    expect(podsumowanieModulu(moduly[0], wynik).moduleType).toBe('B');
    expect(podsumowanieModulu(moduly[1], wynik).moduleType).toBe('D');
    // Moduł zablokowany (brak danych) nie ma wyniku biegu → klasa null.
    expect(podsumowanieModulu(moduly[2], wynik).moduleType).toBeNull();
    // Brak biegu w ogóle → klasa null.
    expect(podsumowanieModulu(moduly[0], null).moduleType).toBeNull();
  });

  it('per projekt: agreguje moduły i wymagane/spełnione', () => {
    const p = podsumowanieProjektu(moduly, wynikFixture());
    expect(p.liczbaModulow).toBe(3);
    expect(p.zgodne).toBe(1);
    expect(p.niezgodne).toBe(1);
    expect(p.brakDanych).toBe(1);
    expect(p.wymaganeRazem).toBe(4); // 2 + 2 (moduł zablokowany nie wnosi)
    expect(p.spelnioneRazem).toBe(3); // 2 + 1
  });
});
