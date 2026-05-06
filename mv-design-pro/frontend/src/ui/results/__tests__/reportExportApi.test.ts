/**
 * Testy reportExportApi (Iteracja 15) — eksport raportu i Proof Pack.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  REPORT_FORMAT_LABELS_PL,
  PROOF_FORMAT_LABELS_PL,
  exportReport,
  exportProofPack,
} from '../reportExportApi';

const RUN_ID = 'run-123-test';

beforeEach(() => {
  // Mock URL.createObjectURL / revokeObjectURL.
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reportExportApi — eksport raportu', () => {
  it('zwraca błąd gdy runId pusty', async () => {
    const r = await exportReport('', 'pdf');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Brak identyfikatora/);
    }
  });

  it('exportReport(pdf) wywołuje endpoint /export/pdf', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }),
      json: async () => ({}),
    } as never);
    const r = await exportReport(RUN_ID, 'pdf');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe(`/api/power-flow-runs/${RUN_ID}/export/pdf`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.filename).toBe(`raport-${RUN_ID}.pdf`);
  });

  it('exportReport(docx) wywołuje endpoint /export/docx', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob([], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      json: async () => ({}),
    } as never);
    const r = await exportReport(RUN_ID, 'docx');
    expect(fetchSpy.mock.calls[0]![0]).toBe(`/api/power-flow-runs/${RUN_ID}/export/docx`);
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

  it('exportReport zwraca polski błąd przy network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('NetworkError: connection refused'));
    const r = await exportReport(RUN_ID, 'pdf');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Błąd sieci');
    }
  });
});

describe('reportExportApi — eksport Proof Pack', () => {
  it('exportProofPack(latex) wywołuje endpoint /export/proof/latex', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['\\documentclass{...}'], { type: 'application/x-tex' }),
      json: async () => ({}),
    } as never);
    const r = await exportProofPack(RUN_ID, 'latex');
    expect(fetchSpy.mock.calls[0]![0]).toBe(`/api/power-flow-runs/${RUN_ID}/export/proof/latex`);
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
    expect(fetchSpy.mock.calls[0]![0]).toBe(`/api/power-flow-runs/${RUN_ID}/export/proof/pdf`);
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
    expect(fetchSpy.mock.calls[0]![0]).toBe(`/api/power-flow-runs/${RUN_ID}/export/proof/json`);
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

  it('Polskie etykiety formatów Proof Pack', () => {
    expect(PROOF_FORMAT_LABELS_PL.pdf).toContain('PDF');
    expect(PROOF_FORMAT_LABELS_PL.latex).toContain('LaTeX');
    expect(PROOF_FORMAT_LABELS_PL.json).toContain('JSON');
  });
});
