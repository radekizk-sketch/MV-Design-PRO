const PROOF_LATEX_BASE = '/api/analysis-runs';
const UZASADNIENIE_LATEX_EXPORT_PATH = ['export', 'proof', 'latex'] as const;

async function readError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
      return payload.detail;
    }
  } catch {
    // Odpowiedź może być zwykłym tekstem albo pustym body.
  }

  return `HTTP ${response.status}`;
}

export function buildProofLatexUrl(runId: string): string {
  return [
    PROOF_LATEX_BASE,
    encodeURIComponent(runId),
    ...UZASADNIENIE_LATEX_EXPORT_PATH,
  ].join('/');
}

export async function fetchProofLatex(runId: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(buildProofLatexUrl(runId), {
    method: 'GET',
    headers: {
      Accept: 'application/x-tex,text/plain,*/*',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.text();
}

export function proofLatexFilename(runId: string): string {
  const shortId = runId.trim().slice(0, 8) || 'wynik';
  return `uzasadnienie-inzynierskie-${shortId}.tex`;
}

export function downloadProofLatex(runId: string, latexSource: string): void {
  const blob = new Blob([latexSource], { type: 'application/x-tex;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = proofLatexFilename(runId);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
