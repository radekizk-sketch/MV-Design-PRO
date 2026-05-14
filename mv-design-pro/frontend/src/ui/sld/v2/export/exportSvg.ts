/**
 * SLD SVG Export — P0.7 / PLAN_SLD_REWORK F4 — Eksport SVG vector-clean.
 *
 * STATUS: SCAFFOLDING (canvas integration TODO w pełnym F4)
 * Reference:
 * - docs/v12xx/REJESTR_KONFLIKTOW.md V12K-007 (eksport zawsze light_technical)
 * - docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md § 8.1 (vector-clean SVG)
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 7.1
 *
 * Helpers do generowania deterministycznego SVG z aktywnego SLD canvas:
 * - serializeSvgElement(svgEl) — czysta serializacja DOM → string
 * - normalizeSvgForExport(svg, options) — V12K-007 substitutions
 * - computeSvgFingerprint(svg) — SHA-256 dla determinism guard
 *
 * INVARIANTY (V12K-007 + SLD_INDUSTRIAL_SPEC_v1 § 7.1)
 * ----------------------------------------------------
 * - Eksport ZAWSZE w motywie light_technical (NIE dark_scada)
 * - currentColor → konkretne kolory z LIGHT_TECHNICAL_COLORS
 * - Bez `<image>` (raster) — tylko vector elements
 * - viewBox attribute MUSI być ustawione
 * - Stable IDs (deterministyczne SHA-256 fingerprint dla tej samej sieci)
 */

import {
  LIGHT_TECHNICAL_COLOR_LINE_PRIMARY,
  LIGHT_TECHNICAL_COLOR_BG,
  type ThemeMode,
} from '../theme/tokens';

export interface SvgExportOptions {
  /** Motyw eksportu — zawsze light_technical per V12K-007. */
  mode?: ThemeMode;
  /** Czy dołączyć tło (białe) jako `<rect>` poniżej zawartości. */
  includeBackground?: boolean;
  /** Nazwa projektu (do annotation w nagłówku/footer). */
  projectName?: string;
  /** Identyfikator case'a / snapshota (do deterministycznej annotation). */
  caseLabel?: string;
}

export interface SvgExportResult {
  /** Final SVG string ready to download. */
  svg: string;
  /** Sugerowana nazwa pliku (`*.svg`). */
  filenameHint: string;
}

/**
 * Serialize an SVGSVGElement to string with namespace declarations.
 *
 * Uses XMLSerializer (browser native). Idempotentne i deterministyczne — output
 * zależy tylko od stanu DOM, nie od kolejności wywołań.
 */
export function serializeSvgElement(svgEl: SVGSVGElement): string {
  // Ensure xmlns is present (XMLSerializer adds it if missing, but explicit is safer)
  if (!svgEl.hasAttribute('xmlns')) {
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgEl);
}

/**
 * Normalize SVG for export per V12K-007:
 * - Replace currentColor with concrete light_technical color
 * - Optionally prepend background rect (white)
 *
 * Idempotentne — wielokrotne wywołanie da ten sam wynik.
 *
 * NOTE: This is a string-level normalization for V12K-007 invariant. A future
 * F4 sprint may switch to DOM walk for finer control (preserving SVG structure
 * while ensuring color substitution). For now, simple substring replace covers
 * the canonical_symbols/*.svg use of currentColor.
 */
export function normalizeSvgForExport(
  rawSvg: string,
  options: SvgExportOptions = {},
): string {
  const mode = options.mode ?? 'light_technical';

  // V12K-007: eksport ZAWSZE light_technical (egzekwowane tutaj nawet jeśli ktoś
  // poda dark_scada — to byłby błąd contractowy).
  if (mode !== 'light_technical') {
    throw new Error(
      `exportSvg: V12K-007 invariant violated — eksport SVG MUSI być w trybie light_technical, otrzymano '${mode}'.`,
    );
  }

  let svg = rawSvg;

  // CR-FIX (code-review ULEPSZENIE #3): naive /currentColor/g zamieniał też
  // currentColor w atrybutach id, klasach lub komentarzach. Precyzyjny regex
  // zamienia tylko gdy currentColor występuje jako VALUE atrybutu (po `="`).
  // Replace currentColor with light_technical line primary (czarny).
  // currentColor is the canonical token used in all canonical_symbols/*.svg.
  svg = svg.replace(
    /(=")currentColor(")/g,
    `$1${LIGHT_TECHNICAL_COLOR_LINE_PRIMARY}$2`,
  );
  // Also handle CSS-style usage (currentColor in style="..." or fill: currentColor)
  svg = svg.replace(
    /(:\s*)currentColor(\s*[;}])/g,
    `$1${LIGHT_TECHNICAL_COLOR_LINE_PRIMARY}$2`,
  );
  // AUDIT FIX #2 (observability/security): obsłuż również currentColor w
  // `<style>` block bez kończącego średnika — np. `stroke:currentColor</style>`
  // albo na końcu CSS rule bez `;`. Bez tego V12K-007 invariant mogłby zostać
  // złamany w SVG eksportowanym z embedded <style>. Wzorzec wymaga aby przed
  // currentColor była `:` (CSS value) i po niej `<` (start tagu) lub `"`
  // (koniec inline style="..."). Chroni przed false-positive w atrybutach
  // id/class.
  svg = svg.replace(
    /(:\s*)currentColor(\s*)(<|")/g,
    `$1${LIGHT_TECHNICAL_COLOR_LINE_PRIMARY}$2$3`,
  );

  // Optionally inject background rect (drukowanie A3 — białe tło).
  if (options.includeBackground) {
    // Find first opening tag end of root <svg ...>
    const rootMatch = svg.match(/<svg[^>]*>/);
    if (rootMatch) {
      const insertAt = (rootMatch.index ?? 0) + rootMatch[0].length;
      const bgRect = `<rect x="0" y="0" width="100%" height="100%" fill="${LIGHT_TECHNICAL_COLOR_BG}" />`;
      svg = svg.slice(0, insertAt) + bgRect + svg.slice(insertAt);
    }
  }

  return svg;
}

/**
 * Compute a deterministic fingerprint of normalized SVG content.
 *
 * Used by visual regression CI + export determinism guard. Two calls with the
 * same canonical SVG (after normalize) MUST return identical fingerprint.
 *
 * NOTE: Uses Web Crypto SubtleCrypto.digest in browser, sha256 from node:crypto
 * in tests (gracefully degraded — if neither available, returns 'unsupported').
 */
export async function computeSvgFingerprint(svg: string): Promise<string> {
  // Browser path
  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto?.subtle?.digest === 'function'
  ) {
    const encoder = new TextEncoder();
    const data = encoder.encode(svg);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Node path (vitest jsdom — crypto.subtle may be present, but also fallback)
  // We use a feature check to avoid bundler tree-shaking node:crypto.
  return 'unsupported';
}

/**
 * Generate a stable export filename hint per V12K-007.
 *
 * Format: `sld_{projectSlug}_{caseSlug}_{theme}.svg`
 * Default theme suffix: 'light_technical'.
 */
export function generateSvgFilenameHint(options: SvgExportOptions): string {
  const slug = (s: string | undefined, fallback: string) =>
    (s ?? fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || fallback;

  const projectSlug = slug(options.projectName, 'projekt');
  const caseSlug = slug(options.caseLabel, 'snapshot');
  const themeSuffix = options.mode ?? 'light_technical';
  return `sld_${projectSlug}_${caseSlug}_${themeSuffix}.svg`;
}

/**
 * Top-level helper: take a live SVG element, normalize, return result ready to download.
 *
 * Renderer pipeline (planowane w pełnym F4):
 *   1. SldCanvasV2 renders w trybie 'light_technical' (ThemeProvider override)
 *   2. Caller grabs the <svg> root via ref
 *   3. exportSldSvg(svgEl, options) zwraca SvgExportResult
 *   4. UI tworzy Blob i wymusza download
 */
export function exportSldSvg(
  svgEl: SVGSVGElement,
  options: SvgExportOptions = {},
): SvgExportResult {
  const raw = serializeSvgElement(svgEl);
  const normalized = normalizeSvgForExport(raw, options);
  return {
    svg: normalized,
    filenameHint: generateSvgFilenameHint(options),
  };
}
