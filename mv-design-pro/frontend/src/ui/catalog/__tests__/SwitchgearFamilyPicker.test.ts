// @vitest-environment node
/**
 * Predykaty rodziny rozdzielnicy SN (`SwitchgearFamilyPicker.tsx` — typ, predykat wyboru,
 * powód blokady, nazwy konstrukcji). Komponent listy rodzin skasowany 2026-11-04 (zero miejsc
 * montażu); jego reguły zostają przypięte tu, na funkcjach, które czytają kreatory i edytor
 * wyposażenia pola.
 *
 * Decyzja o dopuszczeniu jest BACKENDU (pola wyliczane rodziny, karta UX-04/POLE-LINIOWE-WZORZEC
 * — zakaz gazów fluorowanych w obiektach projektowanych): pole istniejące czyta
 * `dopuszczona_do_budowania`, każde inne (nowe, projektowane) — `dopuszczona_do_nowych_pol`.
 * Iloczyn: stan obiektu pola {brak, PROJEKTOWANY, ISTNIEJACY} × dopuszczenie do budowania
 * {tak, nie} × dopuszczenie do nowych pól {tak, nie} × tor {MODULARNY, BLOK_RMU, niepodany};
 * konstrukcja (każda z unii) × nazwa bez kodu.
 */
import { describe, expect, it } from 'vitest';

import {
  CONSTRUCTION_LABELS_PL,
  czyRodzinaDoBudowania,
  czyRodzinaPrzyjmujePojedynczePole,
  czySzablonPojedynczegoPola,
  powodBlokadyRodzinyPl,
  type StanObiektuPola,
  type SwitchgearFamily,
} from '../SwitchgearFamilyPicker';

const POWOD_BUDOWY = 'Rodzina wymaga karty katalogowej producenta.';
const POWOD_NOWYCH = 'Rozdzielnica wykorzystuje gaz fluorowany (SF₆). Akcja naprawcza: wybierz wykonanie bez gazów fluorowanych.';

function rodzina(overrides: Partial<SwitchgearFamily> = {}): SwitchgearFamily {
  return {
    switchgear_family_ref: 'DEMO__FAMILY',
    manufacturer_ref: 'DEMO',
    family_name: 'Demo Family',
    series_name: null,
    network_voltages_kv: [15],
    um_classes_kv: [17.5],
    insulation_type: 'air',
    medium_lacznikow: 'PROZNIA',
    construction_type: 'RMU',
    status: 'verified',
    source_refs: ['catalog:demo'],
    notes_pl: null,
    gaz_fluorowany: false,
    dopuszczona_do_budowania: true,
    powod_blokady_pl: null,
    dopuszczona_do_nowych_pol: true,
    powod_blokady_nowych_pol_pl: null,
    ...overrides,
  };
}

function rodzinaDopuszczona(budowa: boolean, nowe: boolean): SwitchgearFamily {
  return rodzina({
    dopuszczona_do_budowania: budowa,
    powod_blokady_pl: budowa ? null : POWOD_BUDOWY,
    dopuszczona_do_nowych_pol: nowe,
    powod_blokady_nowych_pol_pl: nowe ? null : POWOD_NOWYCH,
  });
}

const KONSTRUKCJE = {
  RMU: true,
  jednoczlonowa: true,
  dwuczlonowa: true,
  wysuwna: true,
  GIS: true,
  wnetrzowa: true,
  kontenerowa: true,
  prefabrykowana: true,
  unknown: true,
} as const satisfies Record<SwitchgearFamily['construction_type'], true>;

const STANY: readonly (StanObiektuPola | null)[] = [null, 'PROJEKTOWANY', 'ISTNIEJACY'];
const DOPUSZCZENIA = [
  [true, true],
  [true, false],
  [false, true],
  [false, false],
] as const;

describe('rodzina rozdzielnicy — predykat wyboru i powód blokady z backendu', () => {
  const przypadki = STANY.flatMap((stan) =>
    DOPUSZCZENIA.map(([budowa, nowe]) => [stan, budowa, nowe] as const),
  );
  it.each(przypadki)(
    'stan %s × do budowania %s × do nowych pól %s',
    (stan, budowa, nowe) => {
      const r = rodzinaDopuszczona(budowa, nowe);
      const istniejace = stan === 'ISTNIEJACY';
      const wolno = istniejace ? budowa : nowe;
      expect(czyRodzinaDoBudowania(r, stan)).toBe(wolno);
      const powod = powodBlokadyRodzinyPl(r, stan);
      if (wolno) expect(powod).toBeNull();
      else expect(powod).toBe(istniejace ? POWOD_BUDOWY : POWOD_NOWYCH);
    },
  );

  it('rodzina z SF₆: w nowym i projektowanym polu niewybieralna z powodem backendu, w istniejącym — wybieralna', () => {
    const r = rodzina({
      insulation_type: 'sf6',
      medium_lacznikow: 'SF6',
      gaz_fluorowany: true,
      dopuszczona_do_nowych_pol: false,
      powod_blokady_nowych_pol_pl: POWOD_NOWYCH,
    });
    expect(czyRodzinaDoBudowania(r)).toBe(false);
    expect(czyRodzinaDoBudowania(r, 'PROJEKTOWANY')).toBe(false);
    expect(czyRodzinaDoBudowania(r, 'ISTNIEJACY')).toBe(true);
    expect(powodBlokadyRodzinyPl(r)).toBe(POWOD_NOWYCH);
    expect(powodBlokadyRodzinyPl(r, 'ISTNIEJACY')).toBeNull();
  });
});

describe('rodzina rozdzielnicy — nazwy konstrukcji', () => {
  it.each(Object.keys(KONSTRUKCJE) as Array<SwitchgearFamily['construction_type']>)('%s ma nazwę', (k) => {
    const nazwa = CONSTRUCTION_LABELS_PL[k];
    expect(nazwa).toBeTruthy();
    expect(nazwa).not.toMatch(/_/);
  });
});

/**
 * Pojedyncze pole z szablonu (lustro planu pola katalogowego backendu): iloczyn stan obiektu ×
 * dopuszczenia rodziny × tor {MODULARNY, BLOK_RMU, niepodany} × referencja szablonu {rodzina
 * znana, spoza katalogu, brak}. Przyjmuje ⇔ rodzina znana ∧ dopuszczona dla stanu pola
 * ∧ tor ≠ BLOK_RMU.
 */
describe('szablon pojedynczego pola', () => {
  const TORY = ['MODULARNY', 'BLOK_RMU', null] as const;
  const przypadki = STANY.flatMap((stan) =>
    DOPUSZCZENIA.flatMap(([budowa, nowe]) =>
      TORY.map(
        (tor) =>
          [stan, budowa, nowe, tor, (stan === 'ISTNIEJACY' ? budowa : nowe) && tor !== 'BLOK_RMU'] as const,
      ),
    ),
  );
  it.each(przypadki)(
    'stan %s × budowa %s × nowe %s × tor %s → przyjmuje = %s',
    (stan, budowa, nowe, tor, oczekiwane) => {
      const r = { ...rodzinaDopuszczona(budowa, nowe), tor_konfiguracji: tor };
      expect(czyRodzinaPrzyjmujePojedynczePole(r, stan)).toBe(oczekiwane);
      expect(czySzablonPojedynczegoPola(r.switchgear_family_ref, [r], stan)).toBe(oczekiwane);
      expect(czySzablonPojedynczegoPola('INNA__RODZINA', [r], stan)).toBe(false);
      expect(czySzablonPojedynczegoPola(null, [r], stan)).toBe(false);
      expect(czySzablonPojedynczegoPola(undefined, [r], stan)).toBe(false);
    },
  );
});
