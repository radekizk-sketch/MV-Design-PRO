/**
 * SCHEMAT-10 S5 (FINAŁ) — REGUŁA 18 gramatyki mini-RMU
 * (`docs/sld/GRAMATYKA_MINI_RMU_2026-07.md`): „JEDNA gramatyka w CAŁYM systemie
 * (SLD, wyniki, zwarcia, rozpływ, eksport, wydruki, porównania) — zero
 * lokalnych wyjątków."
 *
 * Dotąd reguła 18 nie miała wyroczni (miała ją reguła 13–14 — geometria glifu
 * WYŁĄCZNIE z `MINI_RMU`, `symbols.test.tsx`; oraz parytet LICZNOŚCI eksportu,
 * `exportPalette.test.tsx`). Ten test dowodzi reguły 18 na NAJTWARDSZYM
 * świadku cross-powierzchniowym: powierzchnia EKSPORTU (jasny motyw techniczny)
 * jest TĄ SAMĄ gramatyką co interaktywna kanwa SCADA-dark — różni się WYŁĄCZNIE
 * paletą (kolory) i wstrzykniętym tłem, a geometria/struktura (ścieżki, pozycje,
 * symbole, etykiety) jest BAJT-IDENTYCZNA. Gdyby eksport był „drugą gramatyką"
 * (osobny renderer, lokalny wyjątek), po zdjęciu kolorów markupy by się
 * rozjechały — a tu, po zdjęciu literałów koloru, są znak w znak takie same.
 *
 * Ścieżka REALNA (nie syntetyk): renderujemy produkcyjną kanwę `SldCanvasV3`
 * na sieci referencyjnej (53 stacje) i przepuszczamy JEJ markup przez
 * produkcyjny tor eksportu `toLightTechnicalExportSvg` — dokładnie jak
 * `SldCanvasV3Workspace.handleExportSvg` (klon → paleta → kadr). Zero overlay
 * (bez `data-fault-color-token`), więc jedyne różnice to podmiana hex + tło.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { SldCanvasV3 } from '../../canvas/SldCanvasV3';
import {
  injectExportBackground,
  LIGHT_TECHNICAL_V3,
  toLightTechnicalExportSvg,
} from '../exportPalette';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

function renderCanvasMarkup(lod: 0 | 1 | 2): string {
  const { container } = render(<SldCanvasV3 snapshot={enm} width={1200} height={900} lodOverride={lod} />);
  const svgEl = container.querySelector<SVGSVGElement>('svg[data-testid="sld-canvas-v3"]');
  if (!svgEl) throw new Error('test setup: brak <svg data-testid="sld-canvas-v3"> po renderze');
  return new XMLSerializer().serializeToString(svgEl);
}

/** Zdejmuje WYŁĄCZNIE literały koloru (hex 6/3-cyfrowe, rgb()) — dokładnie to,
 *  co tor eksportu podmienia. Reszta (ścieżki, transform, pozycje, testId,
 *  struktura) zostaje nietknięta. */
function stripColorLiterals(markup: string): string {
  return markup
    .replace(/#[0-9A-Fa-f]{6}\b/g, '§C§')
    .replace(/#[0-9A-Fa-f]{3}\b/g, '§C§')
    .replace(/rgb\([^)]*\)/g, '§C§');
}

describe('REGUŁA 18 (gramatyka mini-RMU) — JEDNA gramatyka SLD↔eksport, zero lokalnych wyjątków', () => {
  for (const lod of [0, 1, 2] as const) {
    it(`L${lod}: geometria/struktura eksportu == kanwy po zdjęciu kolorów (różni się WYŁĄCZNIE paletą)`, () => {
      const dark = renderCanvasMarkup(lod);
      const light = toLightTechnicalExportSvg(dark);
      // Eksport = kanwa + wstrzyknięte tło + podmiana hex. Po zdjęciu literałów
      // koloru z OBU (kanwa-z-tłem vs eksport) muszą być znak w znak identyczne
      // — dowód, że eksport nie wprowadza drugiej gramatyki (żadnego lokalnego
      // wyjątku w geometrii/strukturze).
      const darkWithBg = injectExportBackground(dark);
      expect(stripColorLiterals(light)).toBe(stripColorLiterals(darkWithBg));
    });
  }

  it('wyrocznia GRYZIE (nie jest pusta): tor eksportu REALNIE podmienia paletę na jasną', () => {
    const dark = renderCanvasMarkup(0);
    const light = toLightTechnicalExportSvg(dark);
    // Coś się zmieniło (inaczej test byłby wydmuszką)…
    expect(light).not.toBe(dark);
    // …i to konkretnie paleta jasna (tło techniczne), nie przypadkowa różnica.
    expect(light).toContain(`fill="${LIGHT_TECHNICAL_V3.canvasBackground}"`);
    // Kontrola metody: stripColorLiterals faktycznie kasuje kolory (inaczej
    // równość wyżej nic nie znaczy).
    expect(stripColorLiterals('<rect fill="#0B0F14"/>')).toBe('<rect fill="§C§"/>');
    expect(stripColorLiterals(light)).not.toContain(LIGHT_TECHNICAL_V3.canvasBackground);
  });
});
