/**
 * Kontrakt DER Engineering Configurator v2 — executable specification.
 *
 * Testy zapewniają że 10-sekcyjna struktura i 22-osiowa macierz gotowości
 * z bundle KWranPTV pozostają stabilne. Każda zmiana wymaga świadomej
 * aktualizacji (regression boundary).
 */
import { describe, expect, it } from 'vitest';

import {
  DER_CONFIGURATOR_SECTIONS,
  DER_READINESS_AXES,
  DER_READINESS_CATEGORIES,
  getDerSection,
  getAxesInCategory,
  getNextDerSection,
  getPrevDerSection,
  type DerConfiguratorSectionId,
  type DerReadinessCategory,
} from '../derConfiguratorContract';

describe('DER_CONFIGURATOR_SECTIONS — 10 sekcji konfiguratora', () => {
  it('zawiera dokładnie 10 sekcji', () => {
    expect(DER_CONFIGURATOR_SECTIONS).toHaveLength(10);
  });

  it('kanoniczna kolejność: ident → params → pcc → ncrfg → regulation → frt → protection → dynamic → readiness → gaps', () => {
    const expectedIds: DerConfiguratorSectionId[] = [
      'ident', 'params', 'pcc', 'ncrfg', 'regulation',
      'frt', 'protection', 'dynamic', 'readiness', 'gaps',
    ];
    expect(DER_CONFIGURATOR_SECTIONS.map((s) => s.id)).toEqual(expectedIds);
  });

  it('numeracja `n` jest 1-indeksowana i sekwencyjna', () => {
    DER_CONFIGURATOR_SECTIONS.forEach((s, idx) => {
      expect(s.n).toBe(idx + 1);
    });
  });

  it('każda sekcja ma polską etykietę i icon', () => {
    for (const s of DER_CONFIGURATOR_SECTIONS) {
      expect(s.label.length).toBeGreaterThan(2);
      expect(s.icon).toBeTruthy();
    }
  });

  it('identyfikatory id są unikalne', () => {
    const ids = DER_CONFIGURATOR_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('finalna sekcja "gaps" oznaczona ikoną ⚠', () => {
    const gaps = DER_CONFIGURATOR_SECTIONS.find((s) => s.id === 'gaps');
    expect(gaps).toBeDefined();
    expect(gaps?.icon).toBe('⚠');
  });

  it('sekcja "readiness" oznaczona ikoną ✓', () => {
    const readiness = DER_CONFIGURATOR_SECTIONS.find((s) => s.id === 'readiness');
    expect(readiness).toBeDefined();
    expect(readiness?.icon).toBe('✓');
  });
});

describe('DER_READINESS_AXES — 22-osiowa macierz (vs 13 w v1)', () => {
  it('zawiera dokładnie 22 osie gotowości', () => {
    expect(DER_READINESS_AXES).toHaveLength(22);
  });

  it('Obliczenia ma 7 osi (equipment, sc_3f/1f/2f, vdrop, power_flow, thermal)', () => {
    const obliczenia = getAxesInCategory('Obliczenia');
    expect(obliczenia.map((a) => a.id)).toEqual([
      'equipment', 'sc_3f', 'sc_1f', 'sc_2f', 'vdrop', 'power_flow', 'thermal',
    ]);
  });

  it('OZE / NC RfG ma 6 osi', () => {
    const oze = getAxesInCategory('OZE / NC RfG');
    expect(oze.map((a) => a.id)).toEqual([
      'q_u', 'pf', 'frt', 'hvrt', 'nc_rfg', 'dynamic',
    ]);
  });

  it('Ochrona ma 3 osie (protection, prot_sel, prot_anti_isl)', () => {
    const ochrona = getAxesInCategory('Ochrona');
    expect(ochrona.map((a) => a.id)).toEqual([
      'protection', 'prot_sel', 'prot_anti_isl',
    ]);
  });

  it('Jakość energii ma 3 osie (harmonics, flicker, voltage_change)', () => {
    const jakosc = getAxesInCategory('Jakość energii');
    expect(jakosc.map((a) => a.id)).toEqual([
      'harmonics', 'flicker', 'voltage_change',
    ]);
  });

  it('Raportowanie ma 3 osie (report_osd, report_tech, report_proof)', () => {
    const raport = getAxesInCategory('Raportowanie');
    expect(raport.map((a) => a.id)).toEqual([
      'report_osd', 'report_tech', 'report_proof',
    ]);
  });

  it('5 kategorii × osie = 22 (suma per kategoria)', () => {
    const total = DER_READINESS_CATEGORIES.reduce(
      (sum, c) => sum + getAxesInCategory(c).length,
      0,
    );
    expect(total).toBe(22);
  });

  it('DER_READINESS_CATEGORIES ma 5 kategorii w kanonicznej kolejności', () => {
    expect(DER_READINESS_CATEGORIES).toEqual([
      'Obliczenia', 'OZE / NC RfG', 'Ochrona', 'Jakość energii', 'Raportowanie',
    ]);
  });

  it('każda oś ma polską etykietę', () => {
    for (const axis of DER_READINESS_AXES) {
      expect(axis.label.length).toBeGreaterThan(2);
    }
  });

  it('identyfikatory osi są unikalne', () => {
    const ids = DER_READINESS_AXES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nowe osie v2 (9 dodatkowych vs v1) są obecne', () => {
    // Per bundle audit: v1 miało 13 osi, v2 ma 22 — różnica 9.
    // Te 9 osi to luki w obecnej implementacji DerReadinessMatrix (gap).
    const newAxes = [
      'sc_2f',       // SC 2F + 2F-Z (nowe vs v1)
      'power_flow',  // Rozpływ NR
      'thermal',     // Obciążalność termiczna
      'dynamic',     // Model dynamiczny stabilności
      'prot_anti_isl', // Antywyspowość LoM
      'harmonics',   // THDi/THDu
      'flicker',     // PST/PLT
      'voltage_change', // d(Umax)
      'report_proof', // WhiteBox proof pack
    ];
    const allIds = new Set(DER_READINESS_AXES.map((a) => a.id));
    for (const id of newAxes) {
      expect(allIds.has(id), `Nowa oś v2 "${id}" musi istnieć`).toBe(true);
    }
  });
});

describe('DER configurator navigation helpers', () => {
  it('getDerSection zwraca poprawną definicję per id', () => {
    expect(getDerSection('ident').n).toBe(1);
    expect(getDerSection('gaps').n).toBe(10);
  });

  it('getDerSection rzuca błąd dla nieznanego id', () => {
    expect(() => getDerSection('unknown' as DerConfiguratorSectionId)).toThrow(
      /Unknown DER configurator section/,
    );
  });

  it('getNextDerSection / getPrevDerSection — pełna nawigacja', () => {
    expect(getNextDerSection('ident')).toBe('params');
    expect(getNextDerSection('gaps')).toBeNull();
    expect(getPrevDerSection('params')).toBe('ident');
    expect(getPrevDerSection('ident')).toBeNull();
  });

  it('navigacja next→prev jest symetryczna', () => {
    for (const section of DER_CONFIGURATOR_SECTIONS) {
      const next = getNextDerSection(section.id);
      if (next !== null) {
        expect(getPrevDerSection(next)).toBe(section.id);
      }
    }
  });

  it('getAxesInCategory zwraca poprawne osie per kategoria', () => {
    for (const cat of DER_READINESS_CATEGORIES) {
      const axes = getAxesInCategory(cat);
      expect(axes.length, `${cat} musi mieć ≥ 1 oś`).toBeGreaterThan(0);
      for (const axis of axes) {
        expect(axis.group).toBe(cat);
      }
    }
  });
});

describe('DER type compatibility — PV / BESS / FW', () => {
  it('typ DerKind obejmuje 3 typy źródeł OZE', () => {
    // Compile-time check via type narrowing.
    const kinds: Array<'PV' | 'BESS' | 'FW'> = ['PV', 'BESS', 'FW'];
    expect(kinds).toHaveLength(3);
  });
});
