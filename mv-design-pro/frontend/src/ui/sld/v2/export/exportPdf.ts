/**
 * SLD PDF Export — P0.7 / PLAN_SLD_REWORK F4 — Eksport PDF vector.
 *
 * STATUS: SCAFFOLDING (PDFKit binding planowane w pełnym F4 sprint)
 * Reference:
 * - docs/v12xx/REJESTR_KONFLIKTOW.md V12K-007 (eksport zawsze light_technical)
 * - docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md § 8.2 (PDF vector)
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 7.2
 *
 * Helpers do generowania deterministycznego PDF z SVG SLD:
 * - buildPdfMetadata(options) — projekt, case, autor, timestamp
 * - generatePdfFilenameHint(options) — stable slug filename
 * - exportSldPdfSpec(svg, options) — opis specyfikacji eksportu (PdfExportSpec)
 *
 * INVARIANTY (V12K-007 binding)
 * -----------------------------
 * - mode='dark_scada' → throw (eksport ZAWSZE w light_technical)
 * - PDF vector (nie raster) — pipeline planowany na PDFKit + svg-to-pdfkit
 * - Page size A3 (420 × 297 mm) default, opcjonalnie A2/A1
 * - Embedded fonts (Inter subset) per docs/sld/SLD_INDUSTRIAL_SPEC_v1 § 5.3
 * - Deterministyczny hash output (same input → identical bytes)
 *
 * NOTE: Sama generacja PDF (bytes) wymaga PDFKit, który ma niemały footprint.
 * Ten plik dostarcza KONTRAKT + spec object. Wiązanie na rzeczywiste PDFKit
 * (lub @react-pdf/renderer w wariancie SSR) zaplanowane w pełnym F4 sprint po
 * decyzji architektonicznej (PDFKit nodejs server-side vs. browser-side
 * client generation).
 */

import { type ThemeMode } from '../theme/tokens';

export type PdfPageSize = 'A4' | 'A3' | 'A2' | 'A1';

/**
 * Orientation handling — A3 landscape jest standardem dla SLD CAD.
 */
export type PdfOrientation = 'portrait' | 'landscape';

export interface PdfExportOptions {
  /** Motyw eksportu — V12K-007 wymusza light_technical. */
  mode?: ThemeMode;
  /** Page size; domyślnie A3 (typowy format projektu). */
  pageSize?: PdfPageSize;
  /** Page orientation; default 'landscape' dla SLD. */
  orientation?: PdfOrientation;
  /** Nazwa projektu (do nagłówka + metadata). */
  projectName?: string;
  /** Identyfikator case'a / snapshota. */
  caseLabel?: string;
  /** Autor (typowo projektant). */
  author?: string;
  /** Deterministyczny timestamp (ISO string). Default = stała epoka dla
   *  deterministycznego output'u. */
  createdAtIso?: string;
}

/**
 * PDF dimensions in millimeters per ISO 216.
 */
export const PDF_PAGE_SIZE_MM: Record<PdfPageSize, { width: number; height: number }> = {
  A4: { width: 297, height: 210 }, // landscape default for A4
  A3: { width: 420, height: 297 },
  A2: { width: 594, height: 420 },
  A1: { width: 841, height: 594 },
} as const;

/**
 * Effective dimensions accounting for orientation.
 */
export function getPdfDimensions(
  pageSize: PdfPageSize,
  orientation: PdfOrientation,
): { width: number; height: number } {
  const base = PDF_PAGE_SIZE_MM[pageSize];
  if (orientation === 'portrait') {
    return { width: Math.min(base.width, base.height), height: Math.max(base.width, base.height) };
  }
  return { width: Math.max(base.width, base.height), height: Math.min(base.width, base.height) };
}

/**
 * PDF metadata bundle — used in DocInfo dict (PDF 1.4).
 */
export interface PdfMetadata {
  title: string;
  subject: string;
  author: string;
  creator: string;
  producer: string;
  keywords: string;
  createdAtIso: string;
}

export function buildPdfMetadata(options: PdfExportOptions): PdfMetadata {
  const project = options.projectName ?? 'MV-DESIGN-PRO project';
  const caseLabel = options.caseLabel ?? 'snapshot';
  return {
    title: `SLD — ${project} — ${caseLabel}`,
    subject: 'Schemat jednokreskowy (SLD)',
    author: options.author ?? 'MV-DESIGN-PRO',
    creator: 'MV-DESIGN-PRO SLD Exporter',
    producer: 'MV-DESIGN-PRO PDF Pipeline (F4)',
    keywords: 'SLD, SN, sieć średniego napięcia, IEC 60617, light_technical',
    createdAtIso: options.createdAtIso ?? '2026-05-13T00:00:00Z',
  };
}

/**
 * Generate a stable filename hint.
 *
 * Format: `sld_{projectSlug}_{caseSlug}_{pageSize}.pdf`
 */
export function generatePdfFilenameHint(options: PdfExportOptions): string {
  const slug = (s: string | undefined, fallback: string) =>
    (s ?? fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || fallback;

  const projectSlug = slug(options.projectName, 'projekt');
  const caseSlug = slug(options.caseLabel, 'snapshot');
  const pageSize = (options.pageSize ?? 'A3').toLowerCase();
  return `sld_${projectSlug}_${caseSlug}_${pageSize}.pdf`;
}

/**
 * Export spec — opisuje co PDF pipeline ma wygenerować.
 *
 * Pozwala testować kontrakt bez wiązania na rzeczywiste PDFKit i bez
 * tworzenia rzeczywistych binarnych output'ów w jednostkowych testach
 * (PDF binarny zostaje zaplanowany w F4 sprint full).
 */
export interface PdfExportSpec {
  svg: string;
  metadata: PdfMetadata;
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  pageDimensionsMm: { width: number; height: number };
  filenameHint: string;
  /** Theme mode used for the embedded SVG (always 'light_technical' per V12K-007). */
  themeMode: 'light_technical';
}

/**
 * Build PdfExportSpec from SVG string + options.
 *
 * Enforces V12K-007 invariant: mode MUSI być 'light_technical' (lub default).
 * Zwraca spec object — pełna generacja PDF binarna (Uint8Array) planowana
 * w pełnym F4 sprint.
 */
export function buildPdfExportSpec(
  svg: string,
  options: PdfExportOptions = {},
): PdfExportSpec {
  const mode = options.mode ?? 'light_technical';
  if (mode !== 'light_technical') {
    throw new Error(
      `exportPdf: V12K-007 invariant violated — eksport PDF MUSI być w trybie light_technical, otrzymano '${mode}'.`,
    );
  }

  const pageSize = options.pageSize ?? 'A3';
  const orientation = options.orientation ?? 'landscape';

  return {
    svg,
    metadata: buildPdfMetadata(options),
    pageSize,
    orientation,
    pageDimensionsMm: getPdfDimensions(pageSize, orientation),
    filenameHint: generatePdfFilenameHint(options),
    themeMode: 'light_technical',
  };
}
