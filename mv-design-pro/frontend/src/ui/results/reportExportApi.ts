/**
 * reportExportApi — frontend client dla eksportu raportów (Iteracja 15).
 *
 * Backend udostępnia kompletny zestaw endpointów eksportu w
 *   /power-flow-runs/{run_id}/export/{json|docx|pdf|xlsx}
 *   /power-flow-runs/{run_id}/export/proof/{json|latex|pdf}
 * korzystających z reportlab (PDF) i python-docx (DOCX).
 *
 * Frontend client:
 *   - fetchuje endpoint
 *   - zapisuje blob przez Object URL → download (anchor click)
 *   - zwraca status sukces/błąd z polskimi komunikatami
 */

export type ReportExportFormat = 'pdf' | 'docx' | 'json' | 'xlsx';
export type ProofExportFormat = 'json' | 'latex' | 'pdf';

const REPORT_BASE = '/api/power-flow-runs';

interface ExportEndpointSpec {
  readonly url: (runId: string) => string;
  readonly defaultFilename: (runId: string) => string;
  readonly mimeType: string;
}

const REPORT_ENDPOINTS: Readonly<Record<ReportExportFormat, ExportEndpointSpec>> = {
  pdf: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/pdf`,
    defaultFilename: (runId) => `raport-${runId}.pdf`,
    mimeType: 'application/pdf',
  },
  docx: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/docx`,
    defaultFilename: (runId) => `raport-${runId}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  json: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/json`,
    defaultFilename: (runId) => `raport-${runId}.json`,
    mimeType: 'application/json',
  },
  xlsx: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/xlsx`,
    defaultFilename: (runId) => `raport-${runId}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

const PROOF_ENDPOINTS: Readonly<Record<ProofExportFormat, ExportEndpointSpec>> = {
  pdf: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/proof/pdf`,
    defaultFilename: (runId) => `uzasadnienie-${runId}.pdf`,
    mimeType: 'application/pdf',
  },
  latex: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/proof/latex`,
    defaultFilename: (runId) => `uzasadnienie-${runId}.tex`,
    mimeType: 'application/x-tex',
  },
  json: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/proof/json`,
    defaultFilename: (runId) => `uzasadnienie-${runId}.json`,
    mimeType: 'application/json',
  },
};

interface ExportResult {
  readonly ok: true;
  readonly filename: string;
}

interface ExportError {
  readonly ok: false;
  readonly error: string;
}

export type ExportOutcome = ExportResult | ExportError;

/** Triggers download of a blob via anchor click — without router/route changes. */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Niewielkie opóźnienie zwolnienia URL — niektóre przeglądarki potrzebują
  // czasu na zainicjowanie pobrania zanim URL zostanie zniszczony.
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

/** Wykonuje fetch eksportu i triggeruje pobranie pliku. */
async function fetchAndDownload(spec: ExportEndpointSpec, runId: string): Promise<ExportOutcome> {
  if (!runId || runId.trim().length === 0) {
    return { ok: false, error: 'Brak identyfikatora obliczenia (runId).' };
  }
  let response: Response;
  try {
    response = await fetch(spec.url(runId), {
      method: 'GET',
      headers: { Accept: spec.mimeType },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Nieznany błąd sieci.';
    return { ok: false, error: `Błąd sieci podczas pobierania raportu: ${msg}` };
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data?.detail) detail = String(data.detail);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      error: `Eksport zakończony niepowodzeniem: ${detail}.`,
    };
  }
  const blob = await response.blob();
  const filename = spec.defaultFilename(runId);
  triggerBlobDownload(blob, filename);
  return { ok: true, filename };
}

/** Eksportuj raport w wybranym formacie. */
export async function exportReport(
  runId: string,
  format: ReportExportFormat,
): Promise<ExportOutcome> {
  return fetchAndDownload(REPORT_ENDPOINTS[format], runId);
}

/** Eksportuj uzasadnienie inżynierskie (Proof Pack) w wybranym formacie. */
export async function exportProofPack(
  runId: string,
  format: ProofExportFormat,
): Promise<ExportOutcome> {
  return fetchAndDownload(PROOF_ENDPOINTS[format], runId);
}

export const REPORT_FORMAT_LABELS_PL: Readonly<Record<ReportExportFormat, string>> = {
  pdf: 'PDF (reportlab)',
  docx: 'DOCX (python-docx)',
  json: 'JSON (struktura raportu)',
  xlsx: 'XLSX (arkusz danych)',
};

export const PROOF_FORMAT_LABELS_PL: Readonly<Record<ProofExportFormat, string>> = {
  pdf: 'PDF (LaTeX → PDF)',
  latex: 'LaTeX (źródło .tex)',
  json: 'JSON (struktura proof)',
};
