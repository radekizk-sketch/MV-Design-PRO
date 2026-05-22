/**
 * reportExportApi - klient frontendowy eksportu raportów.
 *
 * Backend udostępnia komplet endpointów eksportu:
 *   /analysis-runs/{run_id}/export/report/{json|docx|pdf}
 *   /analysis-runs/{run_id}/export/proof/{json|latex|pdf}
 *
 * Klient pobiera blob, inicjuje pobranie pliku w przeglądarce
 * i zwraca status sukcesu albo polski komunikat błędu.
 */

export type ReportExportFormat = 'pdf' | 'docx' | 'json';
export type ProofExportFormat = 'json' | 'latex' | 'pdf';

const REPORT_BASE = '/api/analysis-runs';

interface ExportEndpointSpec {
  readonly url: (runId: string) => string;
  readonly defaultFilename: (runId: string) => string;
  readonly mimeType: string;
}

const REPORT_ENDPOINTS: Readonly<Record<ReportExportFormat, ExportEndpointSpec>> = {
  pdf: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/report/pdf`,
    defaultFilename: () => 'raport-techniczny-mv-design-pro.pdf',
    mimeType: 'application/pdf',
  },
  docx: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/report/docx`,
    defaultFilename: () => 'raport-techniczny-mv-design-pro.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  json: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/report/json`,
    defaultFilename: () => 'raport-techniczny-mv-design-pro.json',
    mimeType: 'application/json',
  },
};

const PROOF_ENDPOINTS: Readonly<Record<ProofExportFormat, ExportEndpointSpec>> = {
  pdf: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/proof/pdf`,
    defaultFilename: () => 'uzasadnienie-inzynierskie-mv-design-pro.pdf',
    mimeType: 'application/pdf',
  },
  latex: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/proof/latex`,
    defaultFilename: () => 'uzasadnienie-inzynierskie-mv-design-pro.tex',
    mimeType: 'application/x-tex',
  },
  json: {
    url: (runId) => `${REPORT_BASE}/${runId}/export/proof/json`,
    defaultFilename: () => 'uzasadnienie-inzynierskie-mv-design-pro.json',
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

/** Pobiera plik bez zmiany aktualnego widoku aplikacji. */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Niektóre przeglądarki potrzebują chwili na rozpoczęcie pobierania.
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

async function fetchAndDownload(spec: ExportEndpointSpec, runId: string): Promise<ExportOutcome> {
  if (!runId || runId.trim().length === 0) {
    return { ok: false, error: 'Brak identyfikatora ostatniego obliczenia.' };
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

export async function exportReport(
  runId: string,
  format: ReportExportFormat,
): Promise<ExportOutcome> {
  return fetchAndDownload(REPORT_ENDPOINTS[format], runId);
}

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
};

export const PROOF_FORMAT_LABELS_PL: Readonly<Record<ProofExportFormat, string>> = {
  pdf: 'PDF (uzasadnienie inżynierskie)',
  latex: 'LaTeX (źródło .tex)',
  json: 'JSON (struktura uzasadnienia)',
};
