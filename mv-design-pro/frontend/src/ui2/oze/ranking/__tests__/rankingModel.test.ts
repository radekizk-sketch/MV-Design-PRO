/*
 * Testy czystych adapterów okna „Ranking punktów przyłączenia". Weryfikują:
 * przyrost strat przy mocy granicznej (arytmetyka prezentacji + null), scenariusz i
 * skrajne napięcia przy granicy, MAPOWANIE SŁOWNIKOWE klasy NC RfG z progów katalogu,
 * dobór klas operatora oraz budowę kolumn/wierszy wzorca (ranking malejący po mocy).
 * Zero fizyki, zero ocen lokalnych.
 */

import { describe, expect, it } from 'vitest';

import {
  KLUCZ_WIERSZA_RANKINGU,
  klasaNcRfg,
  klasyOperatora,
  kolumnyRankingu,
  napieciaPrzyGranicy,
  przyrostStratKw,
  scenariuszGraniczny,
  wierszeRankingu,
} from '../rankingModel';
import { katalogFixture, widokRankinguFixture } from './fixtures';

const klasy = katalogFixture().operators[0].module_types;
const napiecie15 = (): number => 15;

function wezel(busRef: string) {
  const w = widokRankinguFixture().nodes.find((n) => n.bus_ref === busRef);
  if (!w) throw new Error(`brak węzła ${busRef}`);
  return w;
}

describe('przyrostStratKw — przyrost strat przy mocy granicznej [kW]', () => {
  it('liczy (straty_granica − straty_bazowe) × 1000 (arytmetyka prezentacji)', () => {
    // A: (0,12 − 0,10) MW × 1000 = 20 kW
    expect(przyrostStratKw(wezel('bus-a'))).toBeCloseTo(20, 6);
    // B: (0,20 − 0,05) MW × 1000 = 150 kW
    expect(przyrostStratKw(wezel('bus-b'))).toBeCloseTo(150, 6);
  });

  it('brak straty przy granicy (null) → null', () => {
    expect(przyrostStratKw(wezel('bus-c'))).toBeNull();
  });

  it('brak pola bazowego (undefined) → null', () => {
    const w = { ...wezel('bus-b'), losses_baseline_p_mw: undefined };
    expect(przyrostStratKw(w)).toBeNull();
  });
});

describe('scenariuszGraniczny — ostatni dopuszczalny scenariusz', () => {
  it('zwraca ostatni dopuszczalny scenariusz (moc graniczna)', () => {
    expect(scenariuszGraniczny(wezel('bus-a'))?.added_power_mw).toBe(0.5);
    expect(scenariuszGraniczny(wezel('bus-b'))?.added_power_mw).toBe(1.5);
  });

  it('brak dopuszczalnego scenariusza → null', () => {
    expect(scenariuszGraniczny(wezel('bus-c'))).toBeNull();
  });
});

describe('napieciaPrzyGranicy — skrajne napięcia scenariusza granicznego [p.u.]', () => {
  it('zwraca min/maks scenariusza granicznego', () => {
    expect(napieciaPrzyGranicy(wezel('bus-b'))).toEqual({ min: 0.96, max: 1.03 });
  });

  it('brak scenariusza granicznego → null', () => {
    expect(napieciaPrzyGranicy(wezel('bus-c'))).toBeNull();
  });

  it('brak napięć w scenariuszu (undefined) → null', () => {
    const base = wezel('bus-b');
    const w = {
      ...base,
      scenarios: base.scenarios.map((s) => ({ ...s, min_voltage_pu: undefined, max_voltage_pu: undefined })),
    };
    expect(napieciaPrzyGranicy(w)).toBeNull();
  });
});

describe('klasaNcRfg — mapowanie słownikowe z progów katalogu operatora', () => {
  it('0,5 MW (500 kW) → klasa A', () => {
    expect(klasaNcRfg(0.5, 15, klasy)?.id).toBe('A');
  });

  it('1,5 MW (1500 kW) → klasa B', () => {
    expect(klasaNcRfg(1.5, 15, klasy)?.id).toBe('B');
  });

  it('60 MW (60000 kW) → klasa C, 80 MW → klasa D (najwyższa, bez górnego limitu)', () => {
    expect(klasaNcRfg(60, 15, klasy)?.id).toBe('C');
    expect(klasaNcRfg(80, 15, klasy)?.id).toBe('D');
  });

  it('napięcie ponad limit klasy przenosi do wyższej kategorii (klauzula napięciowa)', () => {
    // 0,5 MW przy 220 kV: klasy A/B/C mają voltage_kv_max=110 → wypadają; zostaje D.
    expect(klasaNcRfg(0.5, 220, klasy)?.id).toBe('D');
  });

  it('brak mocy przyłączalnej (≤ 0) → null', () => {
    expect(klasaNcRfg(0, 15, klasy)).toBeNull();
  });

  it('pusty katalog → null', () => {
    expect(klasaNcRfg(1.5, 15, [])).toBeNull();
  });
});

describe('klasyOperatora — dobór klas wybranego operatora', () => {
  it('zwraca klasy dopasowanego operatora', () => {
    expect(klasyOperatora(katalogFixture(), 'enea')).toHaveLength(4);
  });

  it('nieznany operator lub brak katalogu → pusta lista', () => {
    expect(klasyOperatora(katalogFixture(), 'xxx')).toEqual([]);
    expect(klasyOperatora(null, 'enea')).toEqual([]);
  });
});

describe('kolumnyRankingu — kolumny wzorca', () => {
  it('kolumna identyfikatora jest tylko-ekspercka, napięcia niesortowalne', () => {
    const kolumny = kolumnyRankingu();
    const id = kolumny.find((k) => k.klucz === KLUCZ_WIERSZA_RANKINGU);
    const napiecia = kolumny.find((k) => k.klucz === 'napiecia');
    expect(id?.tylkoEkspercki).toBe(true);
    expect(napiecia?.sortowalna).toBe(false);
  });
});

describe('wierszeRankingu — ranking malejący po mocy przyłączalnej', () => {
  const wiersze = wierszeRankingu(widokRankinguFixture().nodes, napiecie15, klasy);

  it('domyślna kolejność: malejąco po mocy (B → A → C)', () => {
    expect(wiersze.map((w) => w[KLUCZ_WIERSZA_RANKINGU].wartosc)).toEqual(['bus-b', 'bus-a', 'bus-c']);
  });

  it('komórka mocy niesie sformatowaną wartość i liczbowy sortKey', () => {
    expect(wiersze[0].moc).toEqual({ wartosc: '1,500', sortKey: 1.5 });
  });

  it('przyrost strat i klasa mapowane per węzeł; brak danych → „—"', () => {
    expect(wiersze[0].straty.wartosc).toBe('150,000');
    expect(wiersze[0].straty.sortKey).toBeCloseTo(150, 6);
    expect(wiersze[0].klasa.wartosc).toBe('B');
    expect(wiersze[1].klasa.wartosc).toBe('A');
    // Węzeł C bez granicy: przyrost strat, napięcia i klasa jako „—".
    expect(wiersze[2].straty.wartosc).toBe('—');
    expect(wiersze[2].napiecia.wartosc).toBe('—');
    expect(wiersze[2].klasa.wartosc).toBe('—');
  });

  it('skrajne napięcia przy granicy formatowane jako para „min / maks"', () => {
    expect(wiersze[0].napiecia.wartosc).toBe('0,960 / 1,030');
  });
});
