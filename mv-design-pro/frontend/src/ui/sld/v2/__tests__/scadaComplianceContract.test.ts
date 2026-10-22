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

  describe('GPZ — jedyny renderer: kanwa v3 (kompozycja `v3/compose/gpz.ts`)', () => {
    // Karta GPZ-PARYTET: renderer v2 `GpzCanonicalRenderer` skasowany — żaden ekran go nie
    // renderował (kompozycja v3 czytała z niego wyłącznie typy, przeniesione do
    // `v2/canvas/canonicalGpzModel.ts`). Intencja (GPZ z sekcjami, polami TR i zakazem
    // bezpośredniego styku TR–szyna ma działający, pilnowany renderer) bez zmian, tylko plik.
    it('kompozycja GPZ v3 istnieje i ma wyrocznię zakazu bezpośredniego styku TR–szyna', () => {
      expect(fileContains('ui/sld/v3/compose/gpz.ts', 'export function noDirectTransformerBusTies')).toBe(true);
    });

    it('kompozycja GPZ v3 rysuje sekcje i pola transformatorowe', () => {
      expect(fileContains('ui/sld/v3/compose/gpz.ts', /CanonicalGpzSection/)).toBe(true);
      // GEOMETRIA-STACJI (§0 pkt 4): stała gramatyka pola TR (`transformerFieldTemplate`)
      // skasowana — pole TR rysuje się z rekordów aparatów modelu jedną funkcją
      // `specyfikacjaPolaGpz` (intencja: pole TR ma budowniczego w kompozycji — bez zmian).
      expect(fileContains('ui/sld/v3/compose/gpz.ts', /function specyfikacjaPolaGpz/)).toBe(true);
      expect(fileContains('ui/sld/v3/compose/gpz.ts', /trFieldTestIdBase/)).toBe(true);
    });

    it('renderer v2 GPZ nie wraca (jedna ścieżka renderu)', () => {
      expect(fileExists('ui/sld/v2/renderer/GpzCanonicalRenderer.tsx')).toBe(false);
      expect(fileExists('ui/sld/v2/renderer/GpzOperatorHeader.tsx')).toBe(false);
    });
  });

  describe('Stacje SN/nN — wewnętrzna struktura', () => {
    // Slice E (kasacja legacy, 2026-09-01): `StationInternalView.tsx` skasowany
    // (zero konsumentow produkcyjnych, zmierzone przed kasacja) — nastepca to
    // portal projekcji domeny nN (`LvDomainPortal.tsx` -> `LvDomainView.tsx`,
    // wpiety w `SldCanvasV3Workspace.handleElementDoubleClick`). Intencja testu
    // (wnetrze stacji SN/nN ma dzialajacy renderer) bez zmian, tylko plik.
    it('LvDomainView renderuje wnetrze stacji (nastepca StationInternalView)', () => {
      expect(fileExists('ui/sld/v3/lv-domain/LvDomainView.tsx')).toBe(true);
    });

    // GPZ-PARYTET cz. 2 (pkt 4): renderery v2 stacji (`MiniBlockRmuRenderer`,
    // `BayColumnSn`, `BayColumnLv` i cały katalog `v2/renderer/`) skasowane — żaden
    // ekran ich nie renderował (graf importów z `main.tsx`: adapter czytał z nich
    // wyłącznie typy i dwie stałe, przeniesione do `v2/model/`). Intencja testu
    // (stacja SN/nN z polami WE/WY/TR ma działający renderer) bez zmian, tylko plik:
    // kompozycja stacji kanwy v3.
    it('kompozycja stacji v3 rysuje pola SN stacji (WE/WY/TR)', () => {
      expect(fileContains('ui/sld/v3/compose/station.ts', 'export function composeStation')).toBe(true);
    });

    it('renderery v2 nie wracają (jedna ścieżka renderu)', () => {
      expect(fileExists('ui/sld/v2/renderer')).toBe(false);
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
    it('Layout substrate regression baseline istnieje (żywy silnik topologiczny)', () => {
      // Poprzedni baseline (visualFixtures na martwym HierarchicalLayout) usunięto
      // w konsolidacji 2026-07; regresję determinizmu pokrywa żywy substrate test.
      expect(fileExists('ui/sld/v2/geometry/__tests__/layoutEngine.substrate.test.ts')).toBe(true);
    });

    it('Determinism guard w skryptach repo', () => {
      // sld_determinism_guards.py — sprawdzane oddzielnie przez CI guard.
      // Tutaj tylko upewniamy, że SLD V2 ma stable test foundation (żywa geometria
      // port-anchored, nie martwy builder/ HierarchicalLayout).
      expect(fileExists('ui/sld/v2/geometry/__tests__/portAnchoredGeometry.substrate.test.ts')).toBe(true);
    });
  });

  describe('Czytelność etykiet — rozstrzyganie kolizji etykiet', () => {
    // GPZ-PARYTET cz. 3: `v2/canvas/LabelDeclutter.ts` zasilał wyłącznie martwe pola widoku
    // adaptera (`labelSpecs`/`readabilityReport`, bez czytelnika po kasacji rendererów v2)
    // i został skasowany. Kolizje etykiet rozstrzyga żywy silnik sceny v3.
    it('silnik etykiet sceny v3 istnieje (anti-collision)', () => {
      expect(fileExists('ui/sld/v3/layout/declutter.ts')).toBe(true);
    });

    it('test silnika etykiet sceny v3 istnieje', () => {
      expect(fileExists('ui/sld/v3/layout/__tests__/declutter.test.ts')).toBe(true);
    });

    it('martwy moduł v2 LabelDeclutter nie wraca', () => {
      expect(fileExists('ui/sld/v2/canvas/LabelDeclutter.ts')).toBe(false);
    });
  });

  describe('CAD mechanisms (wymaganie #4) — ortogonalne + siatka + porty', () => {
    it('cadRoutingContract.ts istnieje (ortogonalne trasowanie + grid snap)', () => {
      expect(fileExists('ui/sld/v2/geometry/cadRoutingContract.ts')).toBe(true);
    });

    it('routing.ts (L-shape engine) istnieje', () => {
      expect(fileExists('ui/sld/v2/geometry/routing.ts')).toBe(true);
    });

    it('mechanizmy siatki/portów żyją w wyroczniach v3 (F12-C: CadOverlay skasowany — ARCH-1)', () => {
      // F12-C (spec §10.1 ARCH-1, rozstrzygnięcie architekta 2026-07-16):
      // CadOverlay był martwym szkieletem edycji (zero produkcyjnych
      // wołających — dowód w spec §10.1) i został SKASOWANY razem ze ścieżką
      // renderu v2. Wymaganie #4 (ortogonalne + siatka + porty) jest
      // egzekwowane na ŻYWEJ ścieżce renderu przez wyrocznie v3:
      // grid_probe/port_probe (`allSceneGeometryOnGrid`/
      // `sceneSegmentEndpointGaps`, accept:sld-v3 §11.1/§11.2).
      expect(fileExists('ui/sld/v3/scene/buildScene.ts')).toBe(true);
      const buildScene = readFileSync(
        join(FRONTEND_SRC, 'ui/sld/v3/scene/buildScene.ts'),
        'utf-8',
      );
      expect(buildScene).toContain('allSceneGeometryOnGrid');
      expect(buildScene).toContain('sceneSegmentEndpointGaps');
    });
  });

  // Wymaganie #5 (vendor template configurators): piny plikowe
  // station-wizard-v2 usunięte kasacją N-D3 (wiersz N-D3-POMIAR-U2 w
  // docs/v12xx/REJESTR_KONFLIKTOW.md — pomiar na obu gałęziach wykazał ZERO
  // konsumentów biblioteki kontraktów; martwy kod skasowany, D3 skorygowana).
  // Szablony pól/aparatów per rola żyją po stronie backendu
  // (GET /api/catalog/bay-apparatus-kinds + bay_templates, karta
  // KOMPLETNOSC-POLA-TR) i są przypięte tam, nie pinami istnienia plików UI.
});
