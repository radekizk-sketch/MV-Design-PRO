const API_BASE = '/api';

export type TraceExportFormat = 'jsonl' | 'pdf';

interface TraceExportScope {
  projectId?: string | null;
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
    // ignore malformed payloads and fall back to generic message
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

function buildTraceExportPath(
  runId: string,
  format: TraceExportFormat,
  scope?: TraceExportScope,
): string {
  if (scope?.projectId) {
    return `${API_BASE}/projects/${scope.projectId}/analysis-runs/${runId}/trace/export/${format}`;
  }
  return `${API_BASE}/analysis-runs/${runId}/trace/export/${format}`;
}

export async function downloadAnalysisTraceExport(
  runId: string,
  format: TraceExportFormat,
  scope?: TraceExportScope,
): Promise<void> {
  const response = await fetch(buildTraceExportPath(runId, format, scope));
  if (!response.ok) {
    throw new Error(
      await readError(
        response,
        `Błąd eksportu wywodu ${format.toUpperCase()}: ${response.statusText}`,
      ),
    );
  }

  const blob = await response.blob();
  downloadBlob(
    blob,
    inferFilename(
      response.headers.get('content-disposition'),
      `analysis_trace_${runId}.${format}`,
    ),
  );
}
