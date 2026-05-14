/**
 * Browser download utility for SLD exports — P0.7 / V12K-007.
 *
 * Łączy exportSldSvg (czysty pipeline) z browserowym download flow.
 *
 * Reference:
 * - docs/v12xx/REJESTR_KONFLIKTOW.md V12K-007
 * - frontend/src/ui/sld/v2/export/exportSvg.ts
 *
 * USAGE
 * -----
 *   downloadSldSvg(svgElement, {
 *     projectName: 'Test',
 *     caseLabel: 'Wariant 1',
 *   });
 *   // → triggers browser download "sld_test_wariant_1_light_technical.svg"
 *
 * INVARIANT: Eksport zawsze w mode='light_technical' (V12K-007). Funkcja nie
 * przyjmuje 'dark_scada' — egzekwowane w exportSldSvg.
 */

import { exportSldSvg, type SvgExportOptions } from './exportSvg';

/**
 * Trigger browser download of an SVG export.
 *
 * Creates a temporary anchor element, sets its href to a Blob URL containing
 * the SVG, simulates click, and revokes the URL. Standard browser pattern.
 *
 * RETURNS the filename hint for confirmation / logging.
 */
export function downloadSldSvg(
  svgEl: SVGSVGElement,
  options: SvgExportOptions = {},
): string {
  const result = exportSldSvg(svgEl, options);
  const blob = new Blob([result.svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filenameHint;
  anchor.rel = 'noopener';
  // Append to body to make click work cross-browser
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke URL after click (small delay to ensure browser processes)
  // Synchronous revoke is safe in tests; in real browser revokeObjectURL
  // can be deferred via requestAnimationFrame for safety.
  URL.revokeObjectURL(url);

  return result.filenameHint;
}

/**
 * Find SVG element by data-testid or CSS selector and trigger download.
 *
 * Convenience for UI buttons that don't have direct ref to the SVG element.
 * Returns null if element not found (caller decides how to handle).
 */
export function downloadSldSvgBySelector(
  selector: string,
  options: SvgExportOptions = {},
): string | null {
  const root = document.querySelector(selector);
  if (root === null) {
    return null;
  }
  // Find <svg> child or use root if it IS an SVG
  const svgEl =
    root.tagName.toLowerCase() === 'svg'
      ? (root as SVGSVGElement)
      : (root.querySelector('svg') as SVGSVGElement | null);
  if (svgEl === null) {
    return null;
  }
  return downloadSldSvg(svgEl, options);
}
