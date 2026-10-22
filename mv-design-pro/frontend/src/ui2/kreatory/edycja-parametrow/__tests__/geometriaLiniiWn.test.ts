/**
 * Model formularza linii 110 kV (przewód z katalogu + geometria słupa) — iloczyn cech:
 * {fazy: puste, pełne, częściowe, nie-liczba} × {przewody odgromowe: wartość robocza, brak,
 * podane, podane-puste, podane-częściowe} × {wiązka: puste, liczba całkowita, ułamek, zero}
 * × {separator dziesiętny: kropka, przecinek}; obieg model → formularz → geometria bez straty;
 * „bez zmian" dla linii bez geometrii i pustego formularza; rozpoznanie linii 110 kV wyłącznie
 * z danych katalogu.
 */

import { describe, expect, it } from 'vitest';

import type { Branch } from '../../../../types/enm';
import type { OverheadConductorType } from '../../../../ui/catalog/types';
import {
  formularzZLinii,
  geometriaZFormularza,
  geometriaZmieniona,
  liniaWnWgKatalogu,
  podzialPrzewodow,
  przewodZmieniony,
  type FormularzLiniiWn,
} from '../geometriaLiniiWn';

const PUSTY: FormularzLiniiWn = formularzZLinii(null);

function linia(zmiany: Record<string, unknown> = {}): Branch {
  return {
    ref_id: 'L1',
    name: 'Linia 110 kV',
    type: 'line_overhead',
    from_bus_ref: 'A',
    to_bus_ref: 'B',
    length_km: 20,
    r_ohm_per_km: 0.119,
    x_ohm_per_km: 0.409,
    catalog_ref: 'przewod-wn-243-al1-39-st1a',
    catalog_namespace: 'PRZEWOD_LINII_WN',
    ...zmiany,
  } as unknown as Branch;
}

const FAZY = [
  { x: '-4,2', y: '17' },
  { x: '4.2', y: '17' },
  { x: '0', y: '21.5' },
];

describe('geometriaZFormularza — fazy × separator dziesiętny', () => {
  it('formularz pusty → wszystkie składowe niepodane (wartości robocze), wiązka 1', () => {
    expect(geometriaZFormularza(PUSTY)).toEqual({
      rodzaj: 'geometria',
      geometria: {
        fazy: null,
        liczba_w_wiazce: 1,
        odstep_wiazki_m: null,
        odgromowe: null,
        przewod_odgromowy_ref: null,
        rezystywnosc_gruntu_ohm_m: null,
      },
    });
  });

  it('trzy fazy pełne (przecinek i kropka) → położenia liczbowe w kolejności faz', () => {
    const wynik = geometriaZFormularza({ ...PUSTY, fazy: FAZY });
    expect(wynik).toMatchObject({
      rodzaj: 'geometria',
      geometria: {
        fazy: [
          { x_m: -4.2, y_m: 17 },
          { x_m: 4.2, y_m: 17 },
          { x_m: 0, y_m: 21.5 },
        ],
      },
    });
  });

  it.each([
    ['dwie fazy z trzech', [FAZY[0], FAZY[1], { x: '', y: '' }]],
    ['jedna współrzędna fazy', [FAZY[0], FAZY[1], { x: '0', y: '' }]],
    ['tekst zamiast liczby', [FAZY[0], FAZY[1], { x: 'abc', y: '21' }]],
  ])('%s → błąd pola faz (nie wartość robocza po cichu)', (_opis, fazy) => {
    expect(geometriaZFormularza({ ...PUSTY, fazy })).toEqual({ rodzaj: 'blad', pole: 'fazy' });
  });
});

describe('geometriaZFormularza — przewody odgromowe × typ przewodu odgromowego', () => {
  it('wartość robocza → `odgromowe: null`, wybrany typ przewodu zachowany', () => {
    const wynik = geometriaZFormularza({
      ...PUSTY,
      trybOdgromowych: 'robocze',
      przewodOdgromowyRef: 'przewod-odgr-70',
    });
    expect(wynik).toMatchObject({
      rodzaj: 'geometria',
      geometria: { odgromowe: null, przewod_odgromowy_ref: 'przewod-odgr-70' },
    });
  });

  it('linia bez przewodu odgromowego → `odgromowe: []` i bez typu przewodu odgromowego', () => {
    const wynik = geometriaZFormularza({
      ...PUSTY,
      trybOdgromowych: 'brak',
      przewodOdgromowyRef: 'przewod-odgr-70',
    });
    expect(wynik).toMatchObject({
      rodzaj: 'geometria',
      geometria: { odgromowe: [], przewod_odgromowy_ref: null },
    });
  });

  it('podane położenia → lista tylko wierszy wypełnionych', () => {
    const wynik = geometriaZFormularza({
      ...PUSTY,
      trybOdgromowych: 'podane',
      odgromowe: [
        { x: '0', y: '25,5' },
        { x: '', y: '' },
      ],
    });
    expect(wynik).toMatchObject({
      rodzaj: 'geometria',
      geometria: { odgromowe: [{ x_m: 0, y_m: 25.5 }] },
    });
  });

  it.each([
    ['podane, ale wszystkie puste', [{ x: '', y: '' }, { x: '', y: '' }]],
    ['podane z jedną współrzędną', [{ x: '0', y: '' }, { x: '', y: '' }]],
  ])('%s → błąd pola przewodów odgromowych', (_opis, odgromowe) => {
    expect(
      geometriaZFormularza({ ...PUSTY, trybOdgromowych: 'podane', odgromowe }),
    ).toEqual({ rodzaj: 'blad', pole: 'odgromowe' });
  });
});

describe('geometriaZFormularza — wiązka, odstęp, rezystywność', () => {
  it('wiązka 2 z odstępem i rezystywnością (przecinek) → liczby', () => {
    const wynik = geometriaZFormularza({
      ...PUSTY,
      liczbaWWiazce: '2',
      odstepWiazki: '0,4',
      rezystywnosc: '250',
    });
    expect(wynik).toMatchObject({
      rodzaj: 'geometria',
      geometria: { liczba_w_wiazce: 2, odstep_wiazki_m: 0.4, rezystywnosc_gruntu_ohm_m: 250 },
    });
  });

  it.each(['0', '1,5', 'dwa'])('wiązka „%s" → błąd pola wiązki', (liczbaWWiazce) => {
    expect(geometriaZFormularza({ ...PUSTY, liczbaWWiazce })).toEqual({
      rodzaj: 'blad',
      pole: 'liczbaWWiazce',
    });
  });

  it('odstęp i rezystywność nie-liczby → błędy swoich pól', () => {
    expect(geometriaZFormularza({ ...PUSTY, odstepWiazki: 'x' })).toEqual({
      rodzaj: 'blad',
      pole: 'odstepWiazki',
    });
    expect(geometriaZFormularza({ ...PUSTY, rezystywnosc: 'x' })).toEqual({
      rodzaj: 'blad',
      pole: 'rezystywnosc',
    });
  });
});

describe('obieg model → formularz → geometria i wykrycie zmian', () => {
  const GEOMETRIA = {
    fazy: [
      { x_m: -4.2, y_m: 17 },
      { x_m: 4.2, y_m: 17 },
      { x_m: 0, y_m: 21.5 },
    ],
    liczba_w_wiazce: 2,
    odstep_wiazki_m: 0.4,
    odgromowe: [{ x_m: 0, y_m: 25.5 }],
    przewod_odgromowy_ref: 'przewod-odgr-70',
    rezystywnosc_gruntu_ohm_m: 250,
  };

  it('geometria zapisana w linii wraca z formularza bez straty i bez zmian', () => {
    const galaz = linia({ geometria_slupa: GEOMETRIA });
    const formularz = formularzZLinii(galaz);
    expect(geometriaZFormularza(formularz)).toEqual({ rodzaj: 'geometria', geometria: GEOMETRIA });
    expect(geometriaZmieniona(formularz, galaz)).toBe(false);
  });

  it('jawne „bez przewodu odgromowego" wraca jako tryb „brak"', () => {
    const galaz = linia({ geometria_slupa: { ...GEOMETRIA, odgromowe: [] } });
    expect(formularzZLinii(galaz).trybOdgromowych).toBe('brak');
  });

  it('linia bez geometrii i pusty formularz → bez zmian (nic do zapisu)', () => {
    const galaz = linia({ geometria_slupa: null });
    expect(geometriaZmieniona(formularzZLinii(galaz), galaz)).toBe(false);
  });

  it('zmiana rezystywności → zmiana; błąd kształtu → brak zmiany do zapisu', () => {
    const galaz = linia({ geometria_slupa: GEOMETRIA });
    const formularz = formularzZLinii(galaz);
    expect(geometriaZmieniona({ ...formularz, rezystywnosc: '100' }, galaz)).toBe(true);
    expect(geometriaZmieniona({ ...formularz, rezystywnosc: 'x' }, galaz)).toBe(false);
  });

  it('przewód: ten sam → bez zmian; inny → zmiana; linia SN → pole przewodu puste', () => {
    const galaz = linia();
    const formularz = formularzZLinii(galaz);
    expect(formularz.przewodId).toBe('przewod-wn-243-al1-39-st1a');
    expect(przewodZmieniony(formularz, galaz)).toBe(false);
    expect(przewodZmieniony({ ...formularz, przewodId: 'przewod-wn-inny' }, galaz)).toBe(true);
    const liniaSn = linia({ catalog_namespace: 'LINIA_SN', catalog_ref: 'linia-sn-70' });
    expect(formularzZLinii(liniaSn).przewodId).toBe('');
    expect(przewodZmieniony(formularzZLinii(liniaSn), liniaSn)).toBe(false);
  });
});

describe('rozpoznanie linii 110 kV z danych katalogu', () => {
  const przewody = [
    { id: 'fazowy-a', przeznaczenie: 'FAZOWY', voltage_rating_kv: 110 },
    { id: 'odgromowy-a', przeznaczenie: 'ODGROMOWY', voltage_rating_kv: 110 },
  ] as unknown as OverheadConductorType[];
  const { fazowe, odgromowe } = podzialPrzewodow(przewody);

  it('podział katalogu: fazowe do wyboru przewodu linii, odgromowe do przewodu odgromowego', () => {
    expect(fazowe.map((p) => p.id)).toEqual(['fazowy-a']);
    expect(odgromowe.map((p) => p.id)).toEqual(['odgromowy-a']);
  });

  it.each([
    ['wiązanie PRZEWOD_LINII_WN (dowolna szyna)', linia(), null, true],
    ['linia SN na szynie 110 kV', linia({ catalog_namespace: 'LINIA_SN' }), 110, true],
    ['linia SN na szynie 15 kV', linia({ catalog_namespace: 'LINIA_SN' }), 15, false],
    ['linia bez wiązania i bez napięcia szyny', linia({ catalog_namespace: null }), null, false],
    ['kabel na szynie 110 kV', linia({ type: 'cable', catalog_namespace: null }), 110, false],
  ])('%s → %s', (_opis, galaz, napiecie, oczekiwane) => {
    expect(liniaWnWgKatalogu(galaz, napiecie, fazowe)).toBe(oczekiwane);
  });
});
