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

describe('filtryAktywne', () => {
  it('stan pusty nie jest aktywny', () => {
    expect(filtryAktywne(FILTRY_PUSTE)).toBe(false);
  });
  it('dowolne pole ustawione = aktywny', () => {
    expect(filtryAktywne({ ...FILTRY_PUSTE, fraza: 'x' })).toBe(true);
    expect(filtryAktywne({ ...FILTRY_PUSTE, liczbaPolMin: 1 })).toBe(true);
  });
});

describe('filtrujSzablony — kompozycja filtrów (funkcja czysta)', () => {
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

  it('brak dopasowania (fraza + zakres) zwraca pustą listę', () => {
    expect(filtrujSzablony(listaSzablonow, { ...FILTRY_PUSTE, fraza: 'nieistniejące' })).toEqual([]);
  });
});

describe('<FiltrySzablonow /> — panel kontrolek (sterowany propsami)', () => {
  it('renderuje etykiety pól filtrów', () => {
    render(<FiltrySzablonow filtry={FILTRY_PUSTE} onZmiana={() => {}} />);
    expect(screen.getByText(SZABLONY_STRINGS.filtrSzukaj)).toBeInTheDocument();
    expect(screen.getByText(SZABLONY_STRINGS.filtrLiczbaPol)).toBeInTheDocument();
  });

  it('wpisanie frazy woła onZmiana z nowym stanem', () => {
    const onZmiana = vi.fn();
    render(<FiltrySzablonow filtry={FILTRY_PUSTE} onZmiana={onZmiana} />);
    fireEvent.change(screen.getByPlaceholderText(SZABLONY_STRINGS.filtrSzukajPlaceholder), {
      target: { value: '630' },
    });
    expect(onZmiana).toHaveBeenCalledWith({ ...FILTRY_PUSTE, fraza: '630' });
  });

  it('przycisk „Wyczyść filtry" widoczny wyłącznie gdy filtr aktywny', () => {
    const { rerender } = render(<FiltrySzablonow filtry={FILTRY_PUSTE} onZmiana={() => {}} />);
    expect(screen.queryByText(SZABLONY_STRINGS.filtrWyczysc)).not.toBeInTheDocument();
    rerender(<FiltrySzablonow filtry={{ ...FILTRY_PUSTE, fraza: 'x' }} onZmiana={() => {}} />);
    expect(screen.getByText(SZABLONY_STRINGS.filtrWyczysc)).toBeInTheDocument();
  });

  it('klik „Wyczyść filtry" woła onZmiana z FILTRY_PUSTE', () => {
    const onZmiana = vi.fn();
    render(<FiltrySzablonow filtry={{ ...FILTRY_PUSTE, fraza: 'x' }} onZmiana={onZmiana} />);
    fireEvent.click(screen.getByText(SZABLONY_STRINGS.filtrWyczysc));
    expect(onZmiana).toHaveBeenCalledWith(FILTRY_PUSTE);
  });
});
