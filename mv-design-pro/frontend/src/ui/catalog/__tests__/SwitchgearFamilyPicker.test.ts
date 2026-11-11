/**
 * Predykaty rodziny rozdzielnicy SN (`SwitchgearFamilyPicker.tsx` — typ, predykat budowy,
 * powód blokady, nazwy konstrukcji). Komponent listy rodzin skasowany 2026-11-04 (zero miejsc
 * montażu); jego reguły zostają przypięte tu, na funkcjach, które czytają kreatory.
 *
 * Iloczyn: status rodziny (każdy z unii kontraktu, rejestr zamknięty) × {wolno budować,
 * powód blokady}; konstrukcja (każda z unii) × nazwa bez kodu.
 */
import { describe, expect, it } from 'vitest';

import {
  CONSTRUCTION_LABELS_PL,
  czyRodzinaDoBudowania,
  czyRodzinaPrzyjmujePojedynczePole,
  czySzablonPojedynczegoPola,
  powodBlokadyRodzinyPl,
  STATUSY_DO_BUDOWANIA,
  type SwitchgearFamily,
} from '../SwitchgearFamilyPicker';

function rodzina(overrides: Partial<SwitchgearFamily> = {}): SwitchgearFamily {
  return {
    switchgear_family_ref: 'DEMO__FAMILY',
    manufacturer_ref: 'DEMO',
    family_name: 'Demo Family',
    series_name: null,
    network_voltages_kv: [15],
    um_classes_kv: [17.5],
    insulation_type: 'sf6',
    construction_type: 'RMU',
    status: 'verified',
    source_refs: ['catalog:demo'],
    notes_pl: null,
    ...overrides,
  };
}

/** Status → czy wolno budować (lustro `POTWIERDZONE_STATUSY_RODZINY` backendu). */
const STATUSY = {
  verified: true,
  repo_verified: true,
  user_defined: false,
  requires_catalog: false,
  deprecated: false,
} as const satisfies Record<SwitchgearFamily['status'], boolean>;

const KONSTRUKCJE = {
  RMU: true,
  jednoczlonowa: true,
  dwuczlonowa: true,
  wysuwna: true,
  GIS_SF6: true,
  wnetrzowa: true,
  kontenerowa: true,
  prefabrykowana: true,
  unknown: true,
} as const satisfies Record<SwitchgearFamily['construction_type'], true>;

describe('rodzina rozdzielnicy — predykat budowy i powód blokady', () => {
  it.each(Object.entries(STATUSY) as Array<[SwitchgearFamily['status'], boolean]>)(
    '%s: wolno budować = %s, powód blokady wtedy i tylko wtedy, gdy nie wolno',
    (status, wolno) => {
      const r = rodzina({ status });
      expect(czyRodzinaDoBudowania(r)).toBe(wolno);
      expect(STATUSY_DO_BUDOWANIA.has(status)).toBe(wolno);
      const powod = powodBlokadyRodzinyPl(r);
      if (wolno) expect(powod).toBeNull();
      else {
        expect(powod).toMatch(/^[A-ZŁŚŻŹĆ]/);
        expect(powod).not.toContain(status);
      }
    },
  );

  it('rodzina bez karty katalogowej podaje powód z karty, nie ciszę', () => {
    expect(powodBlokadyRodzinyPl(rodzina({ status: 'requires_catalog' }))).toContain('karty katalogowej');
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
 * Pojedyncze pole z szablonu (lustro planu pola katalogowego backendu): iloczyn status
 * rodziny (unia) × tor {MODULARNY, BLOK_RMU, niepodany} × referencja szablonu {rodzina
 * znana, spoza katalogu, brak}. Przyjmuje ⇔ rodzina znana ∧ oferowana ∧ tor ≠ BLOK_RMU.
 */
describe('szablon pojedynczego pola', () => {
  const TORY = ['MODULARNY', 'BLOK_RMU', null] as const;
  const przypadki = (Object.entries(STATUSY) as Array<[SwitchgearFamily['status'], boolean]>).flatMap(
    ([status, oferowana]) => TORY.map((tor) => [status, tor, oferowana && tor !== 'BLOK_RMU'] as const),
  );
  it.each(przypadki)('status %s × tor %s → przyjmuje = %s', (status, tor, oczekiwane) => {
    const r = rodzina({ status, tor_konfiguracji: tor });
    expect(czyRodzinaPrzyjmujePojedynczePole(r)).toBe(oczekiwane);
    expect(czySzablonPojedynczegoPola(r.switchgear_family_ref, [r])).toBe(oczekiwane);
    expect(czySzablonPojedynczegoPola('INNA__RODZINA', [r])).toBe(false);
    expect(czySzablonPojedynczegoPola(null, [r])).toBe(false);
    expect(czySzablonPojedynczegoPola(undefined, [r])).toBe(false);
  });
});
