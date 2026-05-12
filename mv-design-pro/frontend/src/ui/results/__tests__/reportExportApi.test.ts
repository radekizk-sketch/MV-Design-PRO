/**
 * Testy reportExportApi - eksport raportu i uzasadnienia inżynierskiego.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  REPORT_FORMAT_LABELS_PL,
  PROOF_FORMAT_LABELS_PL,
  exportReport,
  exportProofPack,
} from '../reportExportApi';

const RUN_ID = 'run-123-test';
let anchorClickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  Object.defineProperty(window.URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:mock'),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window.URL, 'revokeObjectURL', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
  anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reportExportApi - eksport raportu', () => {
  it('zwraca błąd gdy identyfikator obliczenia jest pusty', async () => {
    const r = await exportReport('', 'pdf');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Brak identyfikatora/);
    }
  });

  it('exportReport(pdf) wywołuje kanoniczny endpoint raportu', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }),
      json: async () => ({}),
    } as never);
    const r = await exportReport(RUN_ID, 'pdf');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe(`/api/analysis-runs/${RUN_ID}/export/report/pdf`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.filename).toBe(`raport-${RUN_ID}.pdf`);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
  });

  it('exportReport(docx) wywołuje kanoniczny endpoint raportu', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      blob: async () =>
        new Blob([], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      json: async () => ({}),
    } as never);
    const r = await exportReport(RUN_ID, 'docx');
    expect(fetchSpy.mock.calls[0]![0]).toBe(`/api/analysis-runs/${RUN_ID}/export/report/docx`);
    expect(r.ok).toBe(true);
  });

  it('exportReport zwraca polski błąd przy HTTP 500', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      blob: async () => new Blob([]),
      json: async () => ({ detail: 'Backend exception' }),
    } as never);
    const r = await exportReport(RUN_ID, 'pdf');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Backend exception');
    }
  });

  it('exportReport zwraca polski błąd przy błędzie sieci', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('NetworkError: connection refused'));
    const r = await exportReport(RUN_ID, 'pdf');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Błąd sieci');
    }
  });
});

describe('reportExportApi - eksport uzasadnienia inżynierskiego', () => {
  it('exportProofPack(latex) wywołuje endpoint /export/proof/latex', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['\\documentclass{...}'], { type: 'application/x-tex' }),
      json: async () => ({}),
    } as never);
    const r = await exportProofPack(RUN_ID, 'latex');
    expect(fetchSpy.mock.calls[0]![0]).toBe(`/api/analysis-runs/${RUN_ID}/export/proof/latex`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.filename).toBe(`uzasadnienie-${RUN_ID}.tex`);
  });

  it('exportProofPack(pdf) wywołuje endpoint /export/proof/pdf', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob([], { type: 'application/pdf' }),
      json: async () => ({}),
    } as never);
    const r = await exportProofPack(RUN_ID, 'pdf');
    expect(fetchSpy.mock.calls[0]![0]).toBe(`/api/analysis-runs/${RUN_ID}/export/proof/pdf`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.filename).toBe(`uzasadnienie-${RUN_ID}.pdf`);
  });

  it('exportProofPack(json) wywołuje endpoint /export/proof/json', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob([], { type: 'application/json' }),
      json: async () => ({}),
    } as never);
    const r = await exportProofPack(RUN_ID, 'json');
    expect(fetchSpy.mock.calls[0]![0]).toBe(`/api/analysis-runs/${RUN_ID}/export/proof/json`);
    expect(r.ok).toBe(true);
  });
});

describe('format labels', () => {
  it('Polskie etykiety formatów raportu', () => {
    expect(REPORT_FORMAT_LABELS_PL.pdf).toContain('reportlab');
    expect(REPORT_FORMAT_LABELS_PL.docx).toContain('python-docx');
    expect(REPORT_FORMAT_LABELS_PL.json).toContain('JSON');
    expect(REPORT_FORMAT_LABELS_PL.xlsx).toContain('XLSX');
  });

  it('Polskie etykiety formatów uzasadnienia inżynierskiego', () => {
    expect(PROOF_FORMAT_LABELS_PL.pdf).toContain('PDF');
    expect(PROOF_FORMAT_LABELS_PL.latex).toContain('LaTeX');
    expect(PROOF_FORMAT_LABELS_PL.json).toContain('JSON');
  });
});
