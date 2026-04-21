/**
 * Eksport porównania śladów obliczeń do JSON
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Eksport danych do analizy
 * - SYSTEM_SPEC.md: READ-ONLY export
 *
 * RULES (BINDING):
 * - Eksport zawiera metadane A/B i listę diffów
 * - Format JSON czytelny dla człowieka (pretty-print)
 * - Nazwa pliku z timestampem
 */

import type { TraceComparisonResult, TraceDiffExport } from './types';

/**
 * Konwertuje wynik porównania na strukturę eksportu.
 */
export function createDiffExport(result: TraceComparisonResult): TraceDiffExport {
  return {
    version: '1.0',
    export_type: 'trace_comparison',
    exported_at: new Date().toISOString(),
    metadata_a: result.metadata_a,
    metadata_b: result.metadata_b,
    summary: result.summary,
    steps: result.steps,
  };
}

/**
 * Generuje nazwę pliku eksportu.
 *
 * Format: porownanie_sladu_<runA_short>_vs_<runB_short>_<timestamp>.json
 */
export function generateExportFilename(
  runIdA: string,
  runIdB: string
): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const shortA = runIdA.slice(0, 8);
  const shortB = runIdB.slice(0, 8);

  return `porownanie_sladu_${shortA}_vs_${shortB}_${timestamp}.json`;
}

/**
 * Pobiera porównanie jako plik JSON.
 */
export function downloadDiffJson(result: TraceComparisonResult): void {
  const exportData = createDiffExport(result);
  const jsonString = JSON.stringify(exportData, null, 2);

  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const filename = generateExportFilename(
    result.metadata_a.run_id,
    result.metadata_b.run_id
  );

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Kopiuje porównanie do schowka jako JSON.
 */
export async function copyDiffJsonToClipboard(
  result: TraceComparisonResult
): Promise<boolean> {
  try {
    const exportData = createDiffExport(result);
    const jsonString = JSON.stringify(exportData, null, 2);

    await navigator.clipboard.writeText(jsonString);
    return true;
  } catch (error) {
    console.error('Błąd kopiowania do schowka:', error);
    return false;
  }
}
