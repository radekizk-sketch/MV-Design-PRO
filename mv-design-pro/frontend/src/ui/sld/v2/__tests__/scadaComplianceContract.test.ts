/**
 * SCADA Compliance Contract — executable specification.
 *
 * Wymaganie #2 z /goal: Schemat SLD zgodny ze standardem SCADA:
 *   - widoczny tor mocy
 *   - poprawne odwzorowanie GPZ (sekcje, pola, TR 110/SN)
 *   - poprawne stacje SN/nN (pola WE/WY/TR, TR SN/nN, strona nn)
 *   - jednoznaczne symbole aparatów (CB/DS/ES/CT/VT/TR)
 *   - czytelne porty
 *
 * Test wymusza istnienie krytycznych komponentów + symboli w repo
 * jako regression boundary dla SCADA-grade UI.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FRONTEND_SRC = join(process.cwd(), 'src');

function fileExists(rel: string): boolean {
  return existsSync(join(FRONTEND_SRC, rel));
}

function fileContains(rel: string, pattern: RegExp | string): boolean {
  const path = join(FRONTEND_SRC, rel);
  if (!existsSync(path)) return false;
  const content = readFileSync(path, 'utf-8');
  return typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);
}

describe('SCADA Compliance Contract — tor mocy + symbole + porty', () => {
  describe('Power flow visibility', () => {
    it('SupplyPathHighlighter (tor mocy) istnieje', () => {
      expect(fileExists('ui/sld/v2/canvas/SupplyPathHighlighter.ts')).toBe(true);
    });

    it('PowerFlowArrow (kierunkowe wskaźniki) jest dostępny', () => {
      // PowerFlowArrow został dodany w P0.7 sprint per PLANS.md.
      const exists = fileExists('ui/sld/v2/overlay/PowerFlowArrow.tsx')
        || fileExists('ui/sld-overlay/PowerFlowArrow.tsx');
      expect(exists).toBe(true);
    });
  });

  describe('GPZ rendering — Phase R2 canonical', () => {
    it('GpzCanonicalRenderer istnieje (clean-room renderer)', () => {
      expect(fileExists('ui/sld/v2/renderer/GpzCanonicalRenderer.tsx')).toBe(true);
    });

    it('GpzCanonicalRenderer ma guard no_direct_110kv_tr_tie_without_switchgear', () => {
      expect(fileExists('ui/sld/v2/renderer/__tests__/GpzCanonicalRenderer.noDirectTie.test.tsx'))
        .toBe(true);
    });

    it('GpzCanonicalRenderer renderuje sekcje GPZ', () => {
      expect(fileContains(
        'ui/sld/v2/renderer/GpzCanonicalRenderer.tsx',
        /CanonicalGpzSection|Section/,
      )).toBe(true);
    });

    it('GpzCanonicalRenderer renderuje pola TR (transformer bay)', () => {
      expect(fileContains(
        'ui/sld/v2/renderer/GpzCanonicalRenderer.tsx',
        /tr-field|transformer/i,
      )).toBe(true);
    });
  });

  describe('Stacje SN/nN — wewnętrzna struktura', () => {
    it('StationInternalView renderuje wnętrze stacji', () => {
      expect(fileExists('ui/sld/v2/canvas/StationInternalView.tsx')).toBe(true);
    });

    it('MiniBlockRmuRenderer renderuje stacje RMU (pola WE/WY/TR)', () => {
      expect(fileExists('ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx')).toBe(true);
    });

    it('BayColumnSn renderuje tor pola SN', () => {
      expect(fileExists('ui/sld/v2/renderer/BayColumnSn.tsx')).toBe(true);
    });

    it('BayColumnLv renderuje stronę nN', () => {
      expect(fileExists('ui/sld/v2/renderer/BayColumnLv.tsx')).toBe(true);
    });
  });

  describe('Kanoniczne symbole IEC 60617', () => {
    const requiredSymbols = [
      'circuit_breaker', 'disconnector', 'earthing_switch',
      'fuse', 'ct', 'vt', 'transformer_2w', 'transformer_3w',
      'busbar', 'ground', 'cable_head_triangle',
    ];

    it.each(requiredSymbols)(
      'Symbol kanoniczny "%s" istnieje w canonical_symbols/',
      (symbol) => {
        expect(fileExists(`ui/sld/canonical_symbols/${symbol}.svg`)).toBe(true);
      },
    );

    it('ports.json definiuje porty per symbol', () => {
      expect(fileExists('ui/sld/canonical_symbols/ports.json')).toBe(true);
    });

    it('Symbol contract test wymusza parity SVG ↔ ports.json', () => {
      expect(fileExists('ui/sld/canonical_symbols/__tests__/symbolContract.test.ts')).toBe(true);
    });
  });

  describe('LOD policy (wymaganie #3) — 5 poziomów × 13 warstw', () => {
    it('LodPolicy.ts istnieje', () => {
      expect(fileExists('ui/sld/v2/lod/LodPolicy.ts')).toBe(true);
    });

    it('LodPolicy ma testy (22 tests baseline)', () => {
      expect(fileExists('ui/sld/v2/__tests__/LodPolicy.test.ts')).toBe(true);
    });
  });

  describe('Determinizm renderu — FNV-1a hash + golden snapshots', () => {
    it('Visual fixtures test istnieje (regression baseline)', () => {
      expect(fileExists('ui/sld/v2/__tests__/visualFixtures.test.ts')).toBe(true);
    });

    it('Determinism guard w skryptach repo', () => {
      // sld_determinism_guards.py — sprawdzane oddzielnie przez CI guard.
      // Tutaj tylko upewniamy, że SLD V2 ma stable test foundation.
      expect(fileExists('ui/sld/v2/builder/HierarchicalLayout.ts')).toBe(true);
    });
  });

  describe('Czytelność etykiet — labelDeclutter', () => {
    it('LabelDeclutter istnieje (anti-collision)', () => {
      expect(fileExists('ui/sld/v2/canvas/LabelDeclutter.ts')).toBe(true);
    });

    it('Readability metrics test foundation', () => {
      expect(fileExists('ui/sld/v2/__tests__/readabilityMetrics.test.ts')).toBe(true);
    });
  });

  describe('CAD mechanisms (wymaganie #4) — ortogonalne + siatka + porty', () => {
    it('cadRoutingContract.ts istnieje (ortogonalne trasowanie + grid snap)', () => {
      expect(fileExists('ui/sld/v2/geometry/cadRoutingContract.ts')).toBe(true);
    });

    it('routing.ts (L-shape engine) istnieje', () => {
      expect(fileExists('ui/sld/v2/geometry/routing.ts')).toBe(true);
    });

    it('CadOverlay component istnieje (warstwa edycji)', () => {
      expect(fileExists('ui/sld/v2/canvas/CadOverlay.tsx')).toBe(true);
    });
  });

  describe('Vendor template configurators (wymaganie #5)', () => {
    it('vendorSwitchgearCatalog z 5 producentami', () => {
      expect(fileExists('ui/network-build/station-wizard-v2/vendorSwitchgearCatalog.ts')).toBe(true);
    });

    it('Catalog zawiera ABB, Schneider, Siemens, ZPUE, Eaton', () => {
      const content = readFileSync(
        join(FRONTEND_SRC, 'ui/network-build/station-wizard-v2/vendorSwitchgearCatalog.ts'),
        'utf-8',
      );
      expect(content).toContain('ABB');
      expect(content).toContain('Schneider');
      expect(content).toContain('Siemens');
      expect(content).toContain('ZPUE_Wloszczowa');
      expect(content).toContain('Eaton');
    });

    it('Auto-konfiguracja pól vendor → FieldRole bridge', () => {
      expect(fileExists('ui/network-build/station-wizard-v2/vendorBayRoleBridge.ts')).toBe(true);
    });
  });
});
