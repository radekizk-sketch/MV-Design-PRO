/*
 * Testy czystych adapterów okna „Ranking punktów przyłączenia". Weryfikują:
 * przyrost strat przy mocy granicznej (arytmetyka prezentacji + null), scenariusz i
 * skrajne napięcia przy granicy, zapytanie o klasyfikację backendu (moc graniczna × napięcie
 * węzła) i komórkę typu modułu z jej stanu oraz budowę kolumn/wierszy wzorca (ranking
 * malejący po mocy). Zero fizyki, zero ocen lokalnych, zero progów po stronie klienta.
 */

import { describe, expect, it } from 'vitest';

import { klasyfikacjaWgKatalogu } from '../../ncrfg/__tests__/atrapaKlasyfikacji';
import { kluczKlasyfikacji, type StanKlasyfikacji, type ZapytanieKlasyfikacji } from '../../ncrfg/klasyfikacja';
import {
  KLUCZ_WIERSZA_RANKINGU,
  kolumnyRankingu,
  napieciaPrzyGranicy,
  przyrostStratKw,
  scenariuszGraniczny,
  wierszeRankingu,
  zapytanieKlasyfikacjiWezla,
} from '../rankingModel';
import { widokRankinguFixture } from './fixtures';

const napiecie15 = (): number => 15;

/** Odczyt klasyfikacji „po odpowiedzi backendu" (progi z katalogu policzonego backendem). */
function odczytGotowy(zapytanie: ZapytanieKlasyfikacji): StanKlasyfikacji {
  const klucz = kluczKlasyfikacji(zapytanie);
  if ('brak' in klucz) return { stan: 'brak_danych', powod_pl: klucz.brak };
  return { stan: 'gotowe', klasyfikacja: klasyfikacjaWgKatalogu(klucz.pMaxKw, klucz.napiecieKv) };
}

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

describe('zapytanieKlasyfikacjiWezla — moc graniczna węzła × napięcie węzła', () => {
  it('niesie moc graniczną [MW] i napięcie ze snapshotu (konwersja jednostek w kliencie)', () => {
    expect(zapytanieKlasyfikacjiWezla(wezel('bus-b'), 15)).toEqual({ mocMw: 1.5, napiecieKv: 15 });
    expect(zapytanieKlasyfikacjiWezla(wezel('bus-c'), null)).toEqual({ mocMw: 0, napiecieKv: null });
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
  const wiersze = wierszeRankingu(widokRankinguFixture().nodes, napiecie15, odczytGotowy);

  it('domyślna kolejność: malejąco po mocy (B → A → C)', () => {
    expect(wiersze.map((w) => w[KLUCZ_WIERSZA_RANKINGU].wartosc)).toEqual(['bus-b', 'bus-a', 'bus-c']);
  });

  it('komórka mocy niesie sformatowaną wartość i liczbowy sortKey', () => {
    expect(wiersze[0].moc).toEqual({ wartosc: '1,500', sortKey: 1.5 });
  });

  it('przyrost strat i typ modułu z klasyfikacji backendu per węzeł; brak danych → „—"', () => {
    expect(wiersze[0].straty.wartosc).toBe('150,000');
    expect(wiersze[0].straty.sortKey).toBeCloseTo(150, 6);
    // Progi WOS (katalog backendu): 1500 kW i 500 kW przy 15 kV → typ B.
    expect(wiersze[0].klasa.wartosc).toBe('B');
    expect(wiersze[1].klasa.wartosc).toBe('B');
    // Węzeł C bez granicy: przyrost strat, napięcia i typ modułu jako „—".
    expect(wiersze[2].straty.wartosc).toBe('—');
    expect(wiersze[2].napiecia.wartosc).toBe('—');
    expect(wiersze[2].klasa.wartosc).toBe('—');
  });

  it('stany klasyfikacji w komórce: ładowanie → „…", błąd → „—", poniżej progu → tekst', () => {
    const wezly = widokRankinguFixture().nodes;
    expect(wierszeRankingu(wezly, napiecie15, () => ({ stan: 'ladowanie' }))[0].klasa.wartosc).toBe('…');
    expect(wierszeRankingu(wezly, napiecie15, () => ({ stan: 'blad', komunikat: 'x' }))[0].klasa.wartosc).toBe('—');
    const ponizej = wierszeRankingu(wezly, napiecie15, () => ({
      stan: 'gotowe',
      klasyfikacja: klasyfikacjaWgKatalogu(0.5, 0.4),
    }));
    expect(ponizej[0].klasa.wartosc).toBe('poniżej progu');
  });

  it('skrajne napięcia przy granicy formatowane jako para „min / maks"', () => {
    expect(wiersze[0].napiecia.wartosc).toBe('0,960 / 1,030');
  });
});
