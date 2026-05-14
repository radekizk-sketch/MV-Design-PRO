/**
 * exportPdf tests — P0.7 / V12K-007.
 *
 * Verifies the spec contract (binary generation TODO w full F4 sprint).
 */

import { describe, expect, it } from 'vitest';

import {
  buildPdfExportSpec,
  buildPdfMetadata,
  generatePdfFilenameHint,
  getPdfDimensions,
  PDF_PAGE_SIZE_MM,
} from '../exportPdf';

describe('PDF page sizes — ISO 216', () => {
  it('A4 = 297 × 210 mm (landscape default)', () => {
    expect(PDF_PAGE_SIZE_MM.A4).toEqual({ width: 297, height: 210 });
  });

  it('A3 = 420 × 297 mm (project standard)', () => {
    expect(PDF_PAGE_SIZE_MM.A3).toEqual({ width: 420, height: 297 });
  });

  it('A2 + A1 sizes correct', () => {
    expect(PDF_PAGE_SIZE_MM.A2).toEqual({ width: 594, height: 420 });
    expect(PDF_PAGE_SIZE_MM.A1).toEqual({ width: 841, height: 594 });
  });
});

describe('getPdfDimensions — orientation handling', () => {
  it('A3 landscape: 420 × 297', () => {
    expect(getPdfDimensions('A3', 'landscape')).toEqual({ width: 420, height: 297 });
  });

  it('A3 portrait swaps dims: 297 × 420', () => {
    expect(getPdfDimensions('A3', 'portrait')).toEqual({ width: 297, height: 420 });
  });

  it('A4 landscape: 297 × 210', () => {
    expect(getPdfDimensions('A4', 'landscape')).toEqual({ width: 297, height: 210 });
  });
});

describe('buildPdfMetadata', () => {
  it('default values for missing project/case', () => {
    const meta = buildPdfMetadata({});
    expect(meta.title).toContain('SLD');
    expect(meta.title).toContain('MV-DESIGN-PRO project');
    expect(meta.title).toContain('snapshot');
    expect(meta.author).toBe('MV-DESIGN-PRO');
  });

  it('custom project + case appear in title', () => {
    const meta = buildPdfMetadata({
      projectName: 'GPZ Plonsk',
      caseLabel: 'Wariant 2026',
    });
    expect(meta.title).toBe('SLD — GPZ Plonsk — Wariant 2026');
  });

  it('subject + keywords contain Polish technical terms', () => {
    const meta = buildPdfMetadata({});
    expect(meta.subject).toContain('Schemat jednokreskowy');
    expect(meta.keywords).toContain('SN');
    expect(meta.keywords).toContain('IEC 60617');
    expect(meta.keywords).toContain('light_technical');
  });

  it('createdAtIso default = deterministic epoch (no Date.now)', () => {
    const m1 = buildPdfMetadata({});
    const m2 = buildPdfMetadata({});
    expect(m1.createdAtIso).toBe(m2.createdAtIso);
  });

  it('producer + creator identify pipeline', () => {
    const meta = buildPdfMetadata({});
    expect(meta.creator).toContain('MV-DESIGN-PRO');
    expect(meta.producer).toContain('PDF Pipeline');
  });
});

describe('generatePdfFilenameHint', () => {
  it('stable filename with project/case/pageSize', () => {
    const name = generatePdfFilenameHint({
      projectName: 'Test Projekt',
      caseLabel: 'Wariant bazowy',
      pageSize: 'A3',
    });
    expect(name).toBe('sld_test_projekt_wariant_bazowy_a3.pdf');
  });

  it('default fallbacks when missing', () => {
    const name = generatePdfFilenameHint({});
    expect(name).toBe('sld_projekt_snapshot_a3.pdf');
  });

  it('slugifies special chars', () => {
    const name = generatePdfFilenameHint({
      projectName: '110 kV / GPZ #1',
      pageSize: 'A4',
    });
    expect(name).toBe('sld_110_kv_gpz_1_snapshot_a4.pdf');
  });
});

describe('buildPdfExportSpec — V12K-007 invariant', () => {
  it('throws when mode=dark_scada', () => {
    expect(() =>
      buildPdfExportSpec('<svg/>', { mode: 'dark_scada' as never }),
    ).toThrow(/V12K-007/);
  });

  it('defaults to light_technical mode', () => {
    const spec = buildPdfExportSpec('<svg/>');
    expect(spec.themeMode).toBe('light_technical');
  });

  it('defaults to A3 landscape', () => {
    const spec = buildPdfExportSpec('<svg/>');
    expect(spec.pageSize).toBe('A3');
    expect(spec.orientation).toBe('landscape');
    expect(spec.pageDimensionsMm).toEqual({ width: 420, height: 297 });
  });

  it('embeds svg content unchanged', () => {
    const svg = '<svg viewBox="0 0 100 100"><line stroke="#000"/></svg>';
    const spec = buildPdfExportSpec(svg);
    expect(spec.svg).toBe(svg);
  });

  it('deterministic spec — same inputs → same metadata + filename', () => {
    const s1 = buildPdfExportSpec('<svg/>', {
      projectName: 'p',
      caseLabel: 'c',
    });
    const s2 = buildPdfExportSpec('<svg/>', {
      projectName: 'p',
      caseLabel: 'c',
    });
    expect(s1.metadata).toEqual(s2.metadata);
    expect(s1.filenameHint).toBe(s2.filenameHint);
  });

  it('A2 portrait is supported', () => {
    const spec = buildPdfExportSpec('<svg/>', {
      pageSize: 'A2',
      orientation: 'portrait',
    });
    expect(spec.pageDimensionsMm).toEqual({ width: 420, height: 594 });
  });
});
