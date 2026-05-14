/**
 * exportSvg tests — P0.7 / V12K-007.
 *
 * Verifies:
 * - V12K-007 invariant (light_technical only — dark_scada throws)
 * - currentColor → konkretne kolory substytucja
 * - includeBackground inserts white rect
 * - Idempotent normalization (wielokrotne wywołanie = ten sam wynik)
 * - generateSvgFilenameHint slugifies + zachowuje stabilny format
 * - serializeSvgElement adds xmlns when missing
 */

import { describe, expect, it } from 'vitest';

import {
  exportSldSvg,
  generateSvgFilenameHint,
  normalizeSvgForExport,
  serializeSvgElement,
} from '../exportSvg';

function makeSvg(innerHtml: string): SVGSVGElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${innerHtml}</svg>`,
    'image/svg+xml',
  );
  return doc.documentElement as unknown as SVGSVGElement;
}

describe('normalizeSvgForExport — V12K-007', () => {
  it('replaces currentColor with light_technical line primary (black)', () => {
    const raw = '<svg><line stroke="currentColor" /></svg>';
    const out = normalizeSvgForExport(raw, { mode: 'light_technical' });
    expect(out).toContain('stroke="#000000"');
    expect(out).not.toContain('currentColor');
  });

  it('throws when called with dark_scada (V12K-007 invariant)', () => {
    expect(() =>
      normalizeSvgForExport('<svg></svg>', { mode: 'dark_scada' as never }),
    ).toThrow(/V12K-007/);
  });

  it('defaults to light_technical when mode unspecified', () => {
    const raw = '<svg><line stroke="currentColor" /></svg>';
    const out = normalizeSvgForExport(raw);
    expect(out).toContain('stroke="#000000"');
  });

  it('is idempotent — multiple calls return identical output', () => {
    const raw =
      '<svg viewBox="0 0 100 100"><line stroke="currentColor" /><line stroke="currentColor" /></svg>';
    const once = normalizeSvgForExport(raw);
    const twice = normalizeSvgForExport(once);
    expect(once).toBe(twice);
  });

  it('injects background rect when includeBackground=true', () => {
    const raw =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line /></svg>';
    const out = normalizeSvgForExport(raw, { includeBackground: true });
    expect(out).toContain('fill="#FFFFFF"');
    expect(out).toContain('<rect');
  });

  it('does not inject background when includeBackground=false (default)', () => {
    const raw =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line /></svg>';
    const out = normalizeSvgForExport(raw);
    expect(out).not.toContain('fill="#FFFFFF"');
  });

  it('CR-FIX preserves id="currentColor_xyz" (precise regex, no naive replace)', () => {
    const raw =
      '<svg><g id="currentColor_legend"><line stroke="currentColor"/></g></svg>';
    const out = normalizeSvgForExport(raw);
    // The id attribute must remain intact (not substituted)
    expect(out).toContain('id="currentColor_legend"');
    // The stroke attribute MUST be substituted
    expect(out).toContain('stroke="#000000"');
  });

  it('CR-FIX handles currentColor in style attribute', () => {
    const raw =
      '<svg><line style="fill: currentColor; stroke: currentColor;"/></svg>';
    const out = normalizeSvgForExport(raw);
    expect(out).toContain('fill: #000000');
    expect(out).toContain('stroke: #000000');
  });
});

describe('generateSvgFilenameHint', () => {
  it('produces stable hint with projectName + caseLabel', () => {
    const hint = generateSvgFilenameHint({
      projectName: 'Projekt GPZ Test',
      caseLabel: 'Wariant bazowy',
    });
    expect(hint).toBe('sld_projekt_gpz_test_wariant_bazowy_light_technical.svg');
  });

  it('falls back to defaults when project/case missing', () => {
    const hint = generateSvgFilenameHint({});
    expect(hint).toBe('sld_projekt_snapshot_light_technical.svg');
  });

  it('slugifies special characters and leading/trailing underscores', () => {
    const hint = generateSvgFilenameHint({
      projectName: '!!!Projekt SN/110 kV!!!',
      caseLabel: '  Wariant  ',
    });
    expect(hint).toBe('sld_projekt_sn_110_kv_wariant_light_technical.svg');
  });

  it('appends light_technical theme suffix by default', () => {
    const hint = generateSvgFilenameHint({ projectName: 'X' });
    expect(hint).toContain('_light_technical.svg');
  });
});

describe('serializeSvgElement', () => {
  it('adds xmlns attribute when missing', () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString('<svg viewBox="0 0 10 10"></svg>', 'image/svg+xml');
    const el = doc.documentElement as unknown as SVGSVGElement;
    // Remove xmlns if parser added it
    el.removeAttribute('xmlns');
    const out = serializeSvgElement(el);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('preserves existing content', () => {
    const el = makeSvg('<rect x="0" y="0" width="10" height="10"/>');
    const out = serializeSvgElement(el);
    expect(out).toContain('<rect');
    expect(out).toContain('width="10"');
  });
});

describe('exportSldSvg — top-level pipeline', () => {
  it('returns SvgExportResult with normalized svg + filenameHint', () => {
    const el = makeSvg('<line stroke="currentColor" />');
    const result = exportSldSvg(el, { projectName: 'TestProj' });
    expect(result.svg).toContain('stroke="#000000"');
    expect(result.svg).not.toContain('currentColor');
    expect(result.filenameHint).toContain('sld_testproj_');
    expect(result.filenameHint).toContain('_light_technical.svg');
  });

  it('eksport jest deterministic — dwa runy = ten sam svg + hint', () => {
    const el1 = makeSvg('<line stroke="currentColor" />');
    const el2 = makeSvg('<line stroke="currentColor" />');
    const r1 = exportSldSvg(el1, { projectName: 'p', caseLabel: 'c' });
    const r2 = exportSldSvg(el2, { projectName: 'p', caseLabel: 'c' });
    expect(r1.svg).toBe(r2.svg);
    expect(r1.filenameHint).toBe(r2.filenameHint);
  });
});
