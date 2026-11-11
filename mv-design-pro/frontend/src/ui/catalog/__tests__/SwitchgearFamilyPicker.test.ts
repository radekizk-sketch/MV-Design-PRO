// @vitest-environment node
/**
 * Predykaty rodziny rozdzielnicy SN (`SwitchgearFamilyPicker.tsx` — predykat budowy, powód
 * blokady, pojedyncze pole z szablonu, nazwy konstrukcji). Komponent listy rodzin skasowany
 * 2026-11-04 (zero miejsc montażu); jego reguły zostają przypięte tu, na funkcjach, które czytają
 * kreatory.
 *
 * Reguła dopuszczenia jest BACKENDU (pola wyliczane rodziny: `dopuszczona_do_budowania` — status,
 * `dopuszczona_do_nowych_pol` — status i zakaz gazów fluorowanych w obiektach projektowanych,
 * rozporządzenie (UE) 2024/573 art. 13 ust. 9); front nie trzyma kopii zbioru statusów (parytet
 * statusów przypina `backend/tests/ci/test_parytet_statusow_rodzin_rozdzielnic.py`). Intencja
 * dawnego testu (status × wolno budować × powód blokady wtedy i tylko wtedy) zostaje: iloczyn
 * {dopuszczona do budowania} × {dopuszczona do nowych pól} × stan obiektu pola {istniejący,
 * projektowany, niepodany} — predykat czyta flagę właściwą stanowi, powód blokady stoi wtedy
 * i tylko wtedy, gdy nie wolno; konstrukcja (każda z unii kontraktu) × nazwa bez kodu.
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
const POWOD_NOWYCH = 'Rodzina z gazem fluorowanym — niedopuszczona w obiektach projektowanych.';

function rodzina(
  budowa: boolean,
  nowePola: boolean,
  overrides: Partial<SwitchgearFamily> = {},
): SwitchgearFamily {
  return {
    switchgear_family_ref: 'DEMO__FAMILY',
    manufacturer_ref: 'DEMO',
    family_name: 'Demo Family',
    series_name: null,
    network_voltages_kv: [15],
    um_classes_kv: [17.5],
    insulation_type: 'sf6',
    gaz_fluorowany: !nowePola,
    dopuszczona_do_budowania: budowa,
    powod_blokady_pl: budowa ? null : POWOD_BUDOWY,
    dopuszczona_do_nowych_pol: nowePola,
    powod_blokady_nowych_pol_pl: nowePola ? null : POWOD_NOWYCH,
    construction_type: 'RMU',
    status: budowa ? 'verified' : 'requires_catalog',
    source_refs: ['catalog:demo'],
    notes_pl: null,
    ...overrides,
  };
}

const FLAGI = [true, false] as const;
const STANY: readonly (StanObiektuPola | null)[] = ['ISTNIEJACY', 'PROJEKTOWANY', null];

describe('rodzina rozdzielnicy — predykat budowy i powód blokady (reguła backendu)', () => {
  const przypadki = FLAGI.flatMap((budowa) =>
    FLAGI.flatMap((nowe) => STANY.map((stan) => [budowa, nowe, stan] as const)),
  );
  it.each(przypadki)(
    'do budowania %s × do nowych pól %s × stan %s: flaga stanu i powód wtedy i tylko wtedy',
    (budowa, nowe, stan) => {
      const r = rodzina(budowa, nowe);
      // Pole istniejące czyta dopuszczenie do budowania; każde inne (projektowane, niepodane)
      // — dopuszczenie do nowych pól.
      const wolno = stan === 'ISTNIEJACY' ? budowa : nowe;
      expect(czyRodzinaDoBudowania(r, stan)).toBe(wolno);
      const powod = powodBlokadyRodzinyPl(r, stan);
      if (wolno) expect(powod).toBeNull();
      else expect(powod).toBe(stan === 'ISTNIEJACY' ? POWOD_BUDOWY : POWOD_NOWYCH);
    },
  );

  it('domyślny stan obiektu to pole nowe (projektowane), nie istniejące', () => {
    const r = rodzina(true, false);
    expect(czyRodzinaDoBudowania(r)).toBe(false);
    expect(powodBlokadyRodzinyPl(r)).toBe(POWOD_NOWYCH);
  });
});

/** Każda konstrukcja z unii kontraktu (`satisfies` — nowa konstrukcja bez wpisu łamie tsc). */
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

describe('rodzina rozdzielnicy — nazwy konstrukcji', () => {
  it.each(Object.keys(KONSTRUKCJE) as Array<SwitchgearFamily['construction_type']>)('%s ma nazwę', (k) => {
    const nazwa = CONSTRUCTION_LABELS_PL[k];
    expect(nazwa).toBeTruthy();
    expect(nazwa).not.toMatch(/_/);
  });

  it('słownik nazw nie ma konstrukcji spoza unii kontraktu', () => {
    expect(Object.keys(CONSTRUCTION_LABELS_PL).sort()).toEqual(Object.keys(KONSTRUKCJE).sort());
  });
});

/**
 * Pojedyncze pole z szablonu (lustro planu pola katalogowego backendu): iloczyn dopuszczenie
 * rodziny do nowych pól × tor {MODULARNY, BLOK_RMU, niepodany} × referencja szablonu {rodzina
 * znana, spoza katalogu, brak}. Przyjmuje ⇔ rodzina znana ∧ dopuszczona ∧ tor ≠ BLOK_RMU.
 */
describe('szablon pojedynczego pola', () => {
  const TORY = ['MODULARNY', 'BLOK_RMU', null] as const;
  const przypadki = FLAGI.flatMap((nowe) =>
    TORY.map((tor) => [nowe, tor, nowe && tor !== 'BLOK_RMU'] as const),
  );
  it.each(przypadki)('do nowych pól %s × tor %s → przyjmuje = %s', (nowe, tor, oczekiwane) => {
    const r = rodzina(true, nowe, { tor_konfiguracji: tor });
    expect(czyRodzinaPrzyjmujePojedynczePole(r)).toBe(oczekiwane);
    expect(czySzablonPojedynczegoPola(r.switchgear_family_ref, [r])).toBe(oczekiwane);
    expect(czySzablonPojedynczegoPola('INNA__RODZINA', [r])).toBe(false);
    expect(czySzablonPojedynczegoPola(null, [r])).toBe(false);
    expect(czySzablonPojedynczegoPola(undefined, [r])).toBe(false);
  });
});
