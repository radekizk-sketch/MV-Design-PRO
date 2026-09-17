import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  FILTRY_PUSTE,
  FiltrySzablonow,
  filtrujSzablony,
  filtryAktywne,
  liczbaPolSN,
  pasujeFraza,
  pasujeLiczbaPol,
  pasujeMoc,
  pasujeNapiecie,
  pasujeZastosowanie,
} from '../FiltrySzablonow';
import { SZABLONY_STRINGS } from '../strings';
import { szablonFarmaPv, szablonPelny } from './fixtures';

describe('liczbaPolSN — pole ustrukturyzowane (schema.sn_bays_count.default)', () => {
  it('czyta wprost z schema, bez parsowania tekstu', () => {
    expect(liczbaPolSN(szablonPelny({ sn_bays_count_default: 5 }))).toBe(5);
  });
});

describe('pasujeFraza — wyszukiwanie tekstowe (moc/napięcie/słowa kluczowe)', () => {
  const szablon = szablonPelny({ name_pl: 'Stacja SN/nN 630 kVA z RMU 3-pole' });

  it('pusta fraza dopasowuje wszystko', () => {
    expect(pasujeFraza(szablon, '')).toBe(true);
    expect(pasujeFraza(szablon, '   ')).toBe(true);
  });

  it('dopasowuje po fragmencie nazwy (moc wpisana w name_pl)', () => {
    expect(pasujeFraza(szablon, '630')).toBe(true);
    expect(pasujeFraza(szablon, 'kVA')).toBe(true);
  });

  it('dopasowanie jest bez rozróżniania wielkości liter', () => {
    expect(pasujeFraza(szablon, 'STACJA')).toBe(true);
  });

  it('dopasowuje po tagach i opisie zastosowania', () => {
    const s = szablonPelny({ tags: ['prosument', 'PV'], use_case_pl: 'Mikroinstalacja PV' });
    expect(pasujeFraza(s, 'prosument')).toBe(true);
    expect(pasujeFraza(s, 'mikroinstalacja')).toBe(true);
  });

  it('brak dopasowania zwraca false', () => {
    expect(pasujeFraza(szablon, 'wiatrowa-nigdzie')).toBe(false);
  });
});

describe('pasujeLiczbaPol — zakres min/max', () => {
  it('brak ograniczeń dopasowuje wszystko', () => {
    expect(pasujeLiczbaPol(3, null, null)).toBe(true);
  });
  it('odrzuca poniżej min', () => {
    expect(pasujeLiczbaPol(2, 3, null)).toBe(false);
  });
  it('odrzuca powyżej max', () => {
    expect(pasujeLiczbaPol(5, null, 4)).toBe(false);
  });
  it('akceptuje wartość graniczną (min i max włącznie)', () => {
    expect(pasujeLiczbaPol(3, 3, 3)).toBe(true);
  });
});

describe('pasujeMoc — zakres mocy [kVA] (pole strukturalne rated_power_kva)', () => {
  it('brak ograniczeń dopasowuje wszystko, także moc null', () => {
    expect(pasujeMoc(630, null, null)).toBe(true);
    expect(pasujeMoc(null, null, null)).toBe(true);
  });
  it('moc null NIE pasuje do ustawionego zakresu — uczciwe wykluczenie', () => {
    expect(pasujeMoc(null, 100, null)).toBe(false);
    expect(pasujeMoc(null, null, 1000)).toBe(false);
  });
  it('odrzuca poniżej min i powyżej max', () => {
    expect(pasujeMoc(400, 630, null)).toBe(false);
    expect(pasujeMoc(1250, null, 1000)).toBe(false);
  });
  it('akceptuje wartość graniczną (min i max włącznie)', () => {
    expect(pasujeMoc(630, 630, 630)).toBe(true);
  });
});

describe('pasujeNapiecie — dopasowanie równościowe (pole strukturalne sn_voltage_kv)', () => {
  it('filtr null dopasowuje wszystko, także napięcie null', () => {
    expect(pasujeNapiecie(15, null)).toBe(true);
    expect(pasujeNapiecie(null, null)).toBe(true);
  });
  // INTENCJA ZACHOWANA, KANON ZMIENIONY (2026-09-17): dopóki filtr czytał
  // `voltage_hv_kv`, `null` znaczyło „katalog nie dał napięcia" — brak danych,
  // więc uczciwe było wykluczenie. Po przejściu filtra na `sn_voltage_kv`
  // `null` znaczy co innego: szablon NIE WIĄŻE napięcia (rozdzielnia sieciowa,
  // rezerwa zasilania — bez transformatora i bez baterii), więc wchodzi na
  // szynę o dowolnym napięciu SN i musi być widoczny przy każdym filtrze.
  // Wykluczanie go ukrywałoby przed projektantem szablony, które faktycznie
  // pasują. Brak danych katalogowych nadal wyklucza — ale dla mocy
  // (`rated_power_kva`), gdzie `null` wciąż znaczy „nie wiem".
  it('napięcie null (szablon napięciowo obojętny) pasuje do KAŻDEGO filtra', () => {
    expect(pasujeNapiecie(null, 15)).toBe(true);
    expect(pasujeNapiecie(null, 20)).toBe(true);
  });
  it('dopasowuje wyłącznie dokładną wartość (poziom dyskretny, nie zakres)', () => {
    expect(pasujeNapiecie(15, 15)).toBe(true);
    expect(pasujeNapiecie(20, 15)).toBe(false);
  });
});

describe('pasujeZastosowanie — dopasowanie kategorii', () => {
  it('filtr null dopasowuje wszystko', () => {
    expect(pasujeZastosowanie('farma_pv', null)).toBe(true);
  });
  it('dopasowuje wyłącznie tę samą kategorię', () => {
    expect(pasujeZastosowanie('farma_pv', 'farma_pv')).toBe(true);
    expect(pasujeZastosowanie('farma_pv', 'bess')).toBe(false);
  });
});

describe('filtryAktywne', () => {
  it('stan pusty nie jest aktywny', () => {
    expect(filtryAktywne(FILTRY_PUSTE)).toBe(false);
  });
  it('dowolne pole ustawione = aktywny', () => {
    expect(filtryAktywne({ ...FILTRY_PUSTE, fraza: 'x' })).toBe(true);
    expect(filtryAktywne({ ...FILTRY_PUSTE, liczbaPolMin: 1 })).toBe(true);
    expect(filtryAktywne({ ...FILTRY_PUSTE, mocMinKva: 100 })).toBe(true);
    expect(filtryAktywne({ ...FILTRY_PUSTE, napiecieSnKv: 15 })).toBe(true);
    expect(filtryAktywne({ ...FILTRY_PUSTE, kategoria: 'bess' })).toBe(true);
  });
});

describe('filtrujSzablony — kompozycja filtrów (funkcja czysta, iloczyn cech)', () => {
  const listaSzablonow = [
    szablonPelny({ id: 'a', name_pl: 'Stacja SN/nN 630 kVA', sn_bays_count_default: 3 }),
    szablonFarmaPv(),
  ];

  it('bez filtrów zwraca wszystkie szablony', () => {
    expect(filtrujSzablony(listaSzablonow, FILTRY_PUSTE)).toHaveLength(2);
  });

  it('filtruje po frazie', () => {
    const wynik = filtrujSzablony(listaSzablonow, { ...FILTRY_PUSTE, fraza: 'farma' });
    expect(wynik.map((s) => s.id)).toEqual(['tpl_farma_pv_1mw']);
  });

  it('filtruje po zakresie liczby pól', () => {
    const wynik = filtrujSzablony(listaSzablonow, { ...FILTRY_PUSTE, liczbaPolMin: 3, liczbaPolMax: 3 });
    expect(wynik.map((s) => s.id)).toEqual(['a']);
  });

  it('filtruje po zakresie mocy (rated_power_kva: 630 vs 1250)', () => {
    const wynik = filtrujSzablony(listaSzablonow, { ...FILTRY_PUSTE, mocMinKva: 1000 });
    expect(wynik.map((s) => s.id)).toEqual(['tpl_farma_pv_1mw']);
  });

  it('filtruje po napięciu (obie fixture mają domyślnie 15 kV — filtr 20 kV nie dopasowuje nic)', () => {
    expect(filtrujSzablony(listaSzablonow, { ...FILTRY_PUSTE, napiecieSnKv: 20 })).toEqual([]);
    expect(filtrujSzablony(listaSzablonow, { ...FILTRY_PUSTE, napiecieSnKv: 15 })).toHaveLength(2);
  });

  it('filtruje po zastosowaniu (kategorii)', () => {
    const wynik = filtrujSzablony(listaSzablonow, { ...FILTRY_PUSTE, kategoria: 'farma_pv' });
    expect(wynik.map((s) => s.id)).toEqual(['tpl_farma_pv_1mw']);
  });

  it('kompozycja mocy × zastosowania (iloczyn cech): zawężenie do zera, gdy się wykluczają', () => {
    const wynik = filtrujSzablony(listaSzablonow, {
      ...FILTRY_PUSTE,
      mocMinKva: 1000,
      kategoria: 'typowa_sn_nn',
    });
    expect(wynik).toEqual([]);
  });

  it('brak dopasowania (fraza + zakres) zwraca pustą listę', () => {
    expect(filtrujSzablony(listaSzablonow, { ...FILTRY_PUSTE, fraza: 'nieistniejące' })).toEqual([]);
  });
});

describe('<FiltrySzablonow /> — panel kontrolek (sterowany propsami)', () => {
  const listaSzablonow = [
    szablonPelny({ id: 'a', name_pl: 'Stacja SN/nN 630 kVA', sn_bays_count_default: 3 }),
    szablonFarmaPv(),
  ];

  it('renderuje etykiety pól filtrów', () => {
    render(<FiltrySzablonow szablony={listaSzablonow} filtry={FILTRY_PUSTE} onZmiana={() => {}} />);
    expect(screen.getByText(SZABLONY_STRINGS.filtrSzukaj)).toBeInTheDocument();
    expect(screen.getByText(SZABLONY_STRINGS.filtrLiczbaPol)).toBeInTheDocument();
    expect(screen.getByText(SZABLONY_STRINGS.filtrMoc)).toBeInTheDocument();
    expect(screen.getByText(SZABLONY_STRINGS.filtrZastosowanie)).toBeInTheDocument();
  });

  it('wpisanie frazy woła onZmiana z nowym stanem', () => {
    const onZmiana = vi.fn();
    render(<FiltrySzablonow szablony={listaSzablonow} filtry={FILTRY_PUSTE} onZmiana={onZmiana} />);
    fireEvent.change(screen.getByPlaceholderText(SZABLONY_STRINGS.filtrSzukajPlaceholder), {
      target: { value: '630' },
    });
    expect(onZmiana).toHaveBeenCalledWith({ ...FILTRY_PUSTE, fraza: '630' });
  });

  it('lista zastosowań w select ma WYŁĄCZNIE kategorie faktycznie obecne w przekazanej liście', () => {
    render(<FiltrySzablonow szablony={listaSzablonow} filtry={FILTRY_PUSTE} onZmiana={() => {}} />);
    const select = screen.getByTestId('mvd-szablony-filtr-zastosowanie');
    const etykiety = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(etykiety).toEqual([
      SZABLONY_STRINGS.filtrZastosowanieWszystkie,
      'Farmy PV SN',
      'Typowe stacje SN/nN',
    ]);
  });

  it('wybranie zastosowania w select woła onZmiana z id kategorii', () => {
    const onZmiana = vi.fn();
    render(<FiltrySzablonow szablony={listaSzablonow} filtry={FILTRY_PUSTE} onZmiana={onZmiana} />);
    fireEvent.change(screen.getByTestId('mvd-szablony-filtr-zastosowanie'), { target: { value: 'farma_pv' } });
    expect(onZmiana).toHaveBeenCalledWith({ ...FILTRY_PUSTE, kategoria: 'farma_pv' });
  });

  it('wpisanie mocy „od" woła onZmiana z liczbą kVA', () => {
    const onZmiana = vi.fn();
    render(<FiltrySzablonow szablony={listaSzablonow} filtry={FILTRY_PUSTE} onZmiana={onZmiana} />);
    fireEvent.change(screen.getByTestId('mvd-szablony-filtr-moc-od'), { target: { value: '500' } });
    expect(onZmiana).toHaveBeenCalledWith({ ...FILTRY_PUSTE, mocMinKva: 500 });
  });

  it('napięcie: select ma wyłącznie wartości faktycznie obecne (obie fixture: 15 kV)', () => {
    render(<FiltrySzablonow szablony={listaSzablonow} filtry={FILTRY_PUSTE} onZmiana={() => {}} />);
    const select = screen.getByTestId('mvd-szablony-filtr-napiecie');
    const etykiety = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(etykiety).toEqual([SZABLONY_STRINGS.filtrZastosowanieWszystkie, '15 kV']);
  });

  it('brak wartości napięcia w liście → select napięcia nie renderuje się (zero fabrykowania)', () => {
    const bezNapiecia = [szablonPelny({ voltage_hv_kv: null, sn_voltage_kv: null })];
    render(<FiltrySzablonow szablony={bezNapiecia} filtry={FILTRY_PUSTE} onZmiana={() => {}} />);
    expect(screen.queryByTestId('mvd-szablony-filtr-napiecie')).not.toBeInTheDocument();
  });

  it('przycisk „Wyczyść filtry" widoczny wyłącznie gdy filtr aktywny', () => {
    const { rerender } = render(
      <FiltrySzablonow szablony={listaSzablonow} filtry={FILTRY_PUSTE} onZmiana={() => {}} />,
    );
    expect(screen.queryByText(SZABLONY_STRINGS.filtrWyczysc)).not.toBeInTheDocument();
    rerender(<FiltrySzablonow szablony={listaSzablonow} filtry={{ ...FILTRY_PUSTE, fraza: 'x' }} onZmiana={() => {}} />);
    expect(screen.getByText(SZABLONY_STRINGS.filtrWyczysc)).toBeInTheDocument();
  });

  it('klik „Wyczyść filtry" woła onZmiana z FILTRY_PUSTE', () => {
    const onZmiana = vi.fn();
    render(
      <FiltrySzablonow
        szablony={listaSzablonow}
        filtry={{ ...FILTRY_PUSTE, fraza: 'x' }}
        onZmiana={onZmiana}
      />,
    );
    fireEvent.click(screen.getByText(SZABLONY_STRINGS.filtrWyczysc));
    expect(onZmiana).toHaveBeenCalledWith(FILTRY_PUSTE);
  });
});
