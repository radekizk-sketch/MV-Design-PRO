import type {
  BranchResults,
  BusResults,
  ExtendedTrace,
  ResultsIndex,
  ResultsRunSnapshot,
  ShortCircuitResults,
  SldResultOverlay,
} from './types';
import type { EnergyNetworkModel } from '../../types/enm';
import { mergeAnalysisCaseContexts } from './analysisCaseContextView';

const API_BASE = '/api';

export type AnalysisRunExportFormat = 'json' | 'docx' | 'pdf';

export interface AnalysisRunReportOptions {
  profile: string;
  detailLevel: string;
  scope: string;
  sections: string[];
  focusTable?: string;
}

function inferFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallback;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // fall back to generic message
  }

  return fallback;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function normalizeResultsIndex(payload: ResultsIndex): ResultsIndex {
  const analysisCaseContext = mergeAnalysisCaseContexts(
    payload.analysis_case_context,
    payload.run_header.analysis_case_context,
  );

  return {
    ...payload,
    analysis_case_context: analysisCaseContext,
    run_header: {
      ...payload.run_header,
      analysis_case_context: analysisCaseContext,
    },
  };
}

export async function fetchResultsIndex(runId: string): Promise<ResultsIndex> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/index`);
  if (!response.ok) {
    throw new Error(`Blad pobierania indeksu wynikow: ${response.statusText}`);
  }
  return normalizeResultsIndex(await response.json());
}

export async function fetchBusResults(runId: string): Promise<BusResults> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/buses`);
  if (!response.ok) {
    throw new Error(`Blad pobierania wynikow wezlowych: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchBranchResults(runId: string): Promise<BranchResults> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/branches`);
  if (!response.ok) {
    throw new Error(`Blad pobierania wynikow galeziowych: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchShortCircuitResults(runId: string): Promise<ShortCircuitResults> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/short-circuit`);
  if (!response.ok) {
    throw new Error(`Blad pobierania wynikow zwarciowych: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchExtendedTrace(runId: string): Promise<ExtendedTrace> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/trace`);
  if (!response.ok) {
    throw new Error(`Blad pobierania sladu obliczen: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchRunSnapshot(runId: string): Promise<ResultsRunSnapshot> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/snapshot`);
  if (!response.ok) {
    throw new Error(`Blad pobierania migawki uruchomienia: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchCurrentCaseSnapshot(caseId: string): Promise<EnergyNetworkModel> {
  const response = await fetch(`${API_BASE}/cases/${caseId}/enm`);
  if (!response.ok) {
    throw new Error(`Blad pobierania biezacego modelu: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchSldOverlay(
  _projectId: string,
  diagramId: string,
  runId: string,
): Promise<SldResultOverlay> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/overlay?diagram_id=${diagramId}`);
  if (!response.ok) {
    throw new Error(`Blad pobierania nakladki SLD: ${response.statusText}`);
  }
  const payload = await response.json();

  if ('nodes' in payload && 'branches' in payload) {
    return payload as SldResultOverlay;
  }

  const nodes = Array.isArray(payload.bus_overlays) ? payload.bus_overlays : [];
  const branches = Array.isArray(payload.branch_overlays) ? payload.branch_overlays : [];
  return {
    diagram_id: diagramId,
    run_id: runId,
    result_status: 'VALID',
    nodes,
    buses: nodes,
    branches,
  };
}

/**
 * Eksport raportu uruchomienia w domyslnej kompozycji backendu.
 *
 * ADRES (karta PREFIKSY): `/api/analysis-runs/{run_id}/export/report/{format}`.
 * Wczesniej klient wolal `/api/projects/{project_id}/analysis-runs/{run_id}/export/{format}`
 * — trase, ktorej ZADEN router nie serwowal. Przycisk eksportu w przegladarce
 * wynikow konczyl sie 404 przy kazdym uzyciu. Eksport jest zakresu URUCHOMIENIA,
 * nie projektu, wiec `project_id` nie wchodzi juz do adresu.
 */
export async function downloadAnalysisRunExport(
  runId: string,
  format: AnalysisRunExportFormat,
): Promise<void> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/export/report/${format}`);
  if (!response.ok) {
    throw new Error(
      await readError(
        response,
        `Blad pobierania eksportu uruchomienia ${format.toUpperCase()}: ${response.statusText}`,
      ),
    );
  }

  const blob = await response.blob();
  downloadBlob(
    blob,
    inferFilename(response.headers.get('content-disposition'), `analysis_run_${runId}.${format}`),
  );
}

/**
 * Eksport raportu uruchomienia w JAWNEJ kompozycji (profil, poziom szczegolu,
 * zakres, sekcje, tabela wiodaca).
 *
 * ADRES (karta PREFIKSY): ta sama koncowka co eksport domyslny —
 * `/api/analysis-runs/{run_id}/export/report/{format}` — rozniaca sie wylacznie
 * parametrami zapytania, ktore backend przyjmuje 1:1 (`profile`, `detail_level`,
 * `scope`, `sections`, `focus_table`). Wczesniej klient wolal nieistniejace
 * `/api/projects/{project_id}/analysis-runs/{run_id}/report/{format}`, wiec
 * kompozycja raportu nie docierala do backendu w ogole (404).
 *
 * `sections` idzie jako POWTORZONY parametr, bo backend deklaruje go jako
 * `list[str] = Query(...)` — sklejenie przecinkiem dawaloby jedna sekcje
 * o nazwie „summary,results,...".
 */
export async function downloadAnalysisRunReport(
  runId: string,
  format: AnalysisRunExportFormat,
  options: AnalysisRunReportOptions,
): Promise<void> {
  const params = new URLSearchParams({
    profile: options.profile,
    detail_level: options.detailLevel,
    scope: options.scope,
  });
  for (const section of options.sections) {
    params.append('sections', section);
  }

  if (options.focusTable) {
    params.set('focus_table', options.focusTable);
  }

  const response = await fetch(
    `${API_BASE}/analysis-runs/${runId}/export/report/${format}?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(
      await readError(
        response,
        `Blad pobierania raportu ${format.toUpperCase()}: ${response.statusText}`,
      ),
    );
  }

  const blob = await response.blob();
  downloadBlob(
    blob,
    inferFilename(response.headers.get('content-disposition'), `analysis_report_${runId}.${format}`),
  );
}
