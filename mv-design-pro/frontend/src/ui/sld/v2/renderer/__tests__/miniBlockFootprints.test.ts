/**
 * MiniBlockFootprints — Phase 1 expansion testy (operator-grade SLD plan v2).
 *
 * Pure function tests dla `deriveFootprintType` + `MINI_BLOCK_FOOTPRINT`
 * contract per 7 typów stacji.
 *
 * Reguła Acceptance Invariant 11 + 13:
 *   - Mini-RMU wynika z bays[]+ports[], NIE z station_type.
 *   - Footprint jest tylko domyślnym layoutem dla badge i koloru wewnętrznego.
 *   - BayDeviceOrderPolicy enforced: kolejność stabilna.
 *
 * Pokrycie:
 *   1. Wszystkie 7 footprintów obecne w MINI_BLOCK_FOOTPRINT.
 *   2. ALL_STATION_FOOTPRINT_TYPES eksportowany kompletny.
 *   3. deriveFootprintType: 6 cases (terminal/inline/branch/sectional/
 *      customer/switching/der_station).
 *   4. GPZ → throw (specjalny renderer).
 *   5. Każdy footprint ma labelPl + shortCodePl + defaultSnBayRoles.
 *   6. labelPl Polski operator-grade.
 */
import { describe, expect, it } from 'vitest';

import { FIELD_ROLE } from '../../domain/apparatusContracts';
import {
  ALL_STATION_FOOTPRINT_TYPES,
  MINI_BLOCK_FOOTPRINT,
  deriveFootprintType,
} from '../MiniBlockFootprints';
import { rodzajZeSkladuPol } from '../../../../shared/rodzajStacji';

describe('MINI_BLOCK_FOOTPRINT — 7 typów stacji', () => {
  it('Wszystkie 7 typów obecnych', () => {
    const expected = [
      'mv_lv_terminal',
      'mv_lv_inline',
      'mv_lv_branch',
      'mv_lv_sectional',
      'mv_lv_customer',
      'switching_station',
      'der_station',
    ];
    for (const type of expected) {
      expect(MINI_BLOCK_FOOTPRINT[type as keyof typeof MINI_BLOCK_FOOTPRINT]).toBeDefined();
    }
  });

  it('ALL_STATION_FOOTPRINT_TYPES = 7 elementów', () => {
    expect(ALL_STATION_FOOTPRINT_TYPES).toHaveLength(7);
  });

  it('Każdy footprint ma labelPl + shortCodePl + defaultSnBayRoles', () => {
    for (const type of ALL_STATION_FOOTPRINT_TYPES) {
      const fp = MINI_BLOCK_FOOTPRINT[type];
      expect(fp.labelPl).toBeTruthy();
      expect(fp.labelPl.length).toBeGreaterThan(0);
      expect(fp.shortCodePl).toBeTruthy();
      expect(fp.defaultSnBayRoles).toBeDefined();
      expect(fp.defaultSnBayRoles.length).toBeGreaterThan(0);
    }
  });

  it('labelPl Polski (zawiera "Stacja" lub "Rozdzielnia" lub kanon)', () => {
    const labelKeywordPattern = /Stacja|Rozdzielnia|OZE|Klient|Sekcja|Końcowa|Przelot|Odgał/iu;
    for (const type of ALL_STATION_FOOTPRINT_TYPES) {
      const fp = MINI_BLOCK_FOOTPRINT[type];
      expect(fp.labelPl).toMatch(labelKeywordPattern);
    }
  });
});

describe('deriveFootprintType — 7 typów stacji', () => {
  // Karta ETYKIETA-STACJI-PRZELOTOWEJ: układ SN mini-bloku idzie za RODZAJEM stacji
  // wyprowadzonym z pól (jedna reguła `ui/shared/rodzajStacji.ts` — tu ze składu pól),
  // nie za deklaracją `station_type` ani za własnym liczeniem pól footprintu.
  const zPol = (role: readonly string[]) => rodzajZeSkladuPol(role, 2);

  it('1 pole liniowe → mv_lv_terminal', () => {
    expect(deriveFootprintType('terminal', zPol(['IN', 'TR']), false)).toBe('mv_lv_terminal');
  });

  it('2 połączone pola liniowe → mv_lv_inline (deklaracja końcowa bez wpływu)', () => {
    expect(deriveFootprintType('terminal', zPol(['IN', 'OUT', 'TR']), false)).toBe('mv_lv_inline');
  });

  it('mv_lv + 2 pola liniowe → mv_lv_inline', () => {
    expect(deriveFootprintType('mv_lv', zPol(['IN', 'OUT']), false)).toBe('mv_lv_inline');
  });

  it('3 pola liniowe → mv_lv_branch także przy deklaracji przelotowej', () => {
    expect(deriveFootprintType('inline', zPol(['IN', 'OUT', 'FEEDER']), false)).toBe('mv_lv_branch');
  });

  it('sprzęgło → mv_lv_sectional', () => {
    expect(deriveFootprintType('mv_lv', zPol(['IN', 'COUPLER']), false)).toBe('mv_lv_sectional');
  });

  it('customer → mv_lv_customer', () => {
    expect(deriveFootprintType('customer', zPol(['IN', 'TR']), false)).toBe('mv_lv_customer');
  });

  it('switching → switching_station', () => {
    expect(deriveFootprintType('switching', zPol(['IN', 'OUT']), false)).toBe('switching_station');
  });

  it('hasDer=true → der_station (priorytet nad układem przelotowym/odgałęźnym/końcowym)', () => {
    expect(deriveFootprintType('mv_lv', zPol(['IN']), true)).toBe('der_station');
  });
});

describe('deriveFootprintType — GPZ throw', () => {
  it('GPZ rzuca Error (osobny renderer GpzSwitchgearRenderer)', () => {
    expect(() => deriveFootprintType('gpz', 'terminal', false)).toThrow(/GPZ does not have mini-block/);
  });
});

describe('deriveFootprintType — stacja SN/nN bez deklaracji rodzaju', () => {
  it('mv_lv + rodzaj końcowy → mv_lv_terminal (bez domysłu z deklaracji)', () => {
    expect(deriveFootprintType('mv_lv', 'terminal', false)).toBe('mv_lv_terminal');
  });
});

describe('Determinizm — same input → same output', () => {
  it('5 reruny deriveFootprintType → identyczny wynik', () => {
    const ref = deriveFootprintType('inline', 'inline', false);
    for (let i = 0; i < 5; i++) {
      expect(deriveFootprintType('inline', 'inline', false)).toBe(ref);
    }
  });
});

describe('Footprint contract: defaultSnBayRoles per footprint', () => {
  it('mv_lv_terminal: ma RMU_LINE i RMU_TRANSFORMER', () => {
    const fp = MINI_BLOCK_FOOTPRINT.mv_lv_terminal;
    expect(fp.defaultSnBayRoles).toContain(FIELD_ROLE.RMU_LINE);
    expect(fp.defaultSnBayRoles).toContain(FIELD_ROLE.RMU_TRANSFORMER);
  });

  it('mv_lv_inline: ma 2 LINE bays + TR', () => {
    const fp = MINI_BLOCK_FOOTPRINT.mv_lv_inline;
    const lineCount = fp.defaultSnBayRoles.filter(
      (r) => r === FIELD_ROLE.LINE_IN || r === FIELD_ROLE.LINE_OUT || r === FIELD_ROLE.RMU_LINE,
    ).length;
    expect(lineCount).toBeGreaterThanOrEqual(2);
  });

  it('switching_station: brak transformator', () => {
    const fp = MINI_BLOCK_FOOTPRINT.switching_station;
    expect(fp.defaultSnBayRoles).not.toContain(FIELD_ROLE.TRANSFORMER);
    expect(fp.defaultSnBayRoles).not.toContain(FIELD_ROLE.RMU_TRANSFORMER);
  });

  it('der_station: przeznaczony dla OZE (label "OZE" w labelPl)', () => {
    const fp = MINI_BLOCK_FOOTPRINT.der_station;
    expect(fp.labelPl.toLowerCase()).toContain('oze');
  });
});
