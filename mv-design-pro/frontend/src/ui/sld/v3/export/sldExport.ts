/**
 * S9-6 — jeden punkt wykonania eksportu schematu dla WSZYSTKICH formatów
 * oferowanych w menu (`formats.ts`).
 *
 * Mapa `EXPORT_BUILDERS` jest typu `Record<SldExportFormat, …>`, więc
 * dopisanie pozycji do listy oferowanej BEZ implementacji nie skompiluje się —
 * to jest bramka na rozjazd „oferta vs pokrycie", który audyt wykrył jako
 * trzy martwe kliknięcia i trzy pozorne sukcesy (E-1/E-2).
 *
 * ŁAŃCUCH DANYCH (dyrektywa właściciela pkt 1 „wizja globalna"):
 *   model ENM (migawka)            → SCD / CIM   (semantyka sieci)
 *   scena v3 → markup arkusza SVG  → SVG / PDF / DXF (rysunek)
 * Rysunek wchodzi tu JUŻ gotowy (kadr fit-do-treści, legenda, tabliczka,
 * paleta dokumentowa) — ten moduł go nie modyfikuje, tylko serializuje.
 */
import type { EnergyNetworkModel } from '../../../../types/enm';
import { generateCimRdfXml } from '../../v2/export/exportCim';
import { generateIec61850Scd } from '../../v2/export/exportIec61850';
import { buildSldDxf } from './exportDxfV3';
import { buildSldPdf } from './exportPdfV3';
import { buildCimInput, buildIec61850Input, cimObjectCount, iec61850ObjectCount } from './exportModelData';
import { buildSldExportFileName } from './exportNames';
import { sldExportFormatDescriptor, type SldExportFormat } from './formats';
import { svgMarkupToDrawing } from './svgPrimitives';

export interface SldExportContext {
  /** Markup arkusza gotowy do zapisu jako .svg (patrz nagłówek). */
  readonly svgMarkup: string;
  /** Migawka ENM — źródło eksportów semantycznych. */
  readonly snapshot: EnergyNetworkModel | null;
  readonly projectName?: string | null;
  readonly caseName?: string | null;
}

export interface SldExportFile {
  readonly filename: string;
  readonly mime: string;
  readonly content: string;
}

/** Tytuł dokumentu — człony bez danych POMIJANE (zero zaślepek). */
export function buildExportTitle(context: SldExportContext): string {
  const parts = ['Schemat jednokreskowy'];
  if (context.projectName?.trim()) parts.push(context.projectName.trim());
  if (context.caseName?.trim()) parts.push(context.caseName.trim());
  return parts.join(' — ');
}

function requireSnapshot(context: SldExportContext, format: string): EnergyNetworkModel {
  if (!context.snapshot) {
    throw new Error(`Eksport ${format}: brak modelu sieci — nie ma czego wyeksportować.`);
  }
  return context.snapshot;
}

const EXPORT_BUILDERS: Readonly<Record<SldExportFormat, (context: SldExportContext) => string>> = {
  svg: (context) => context.svgMarkup,
  pdf: (context) => buildSldPdf(svgMarkupToDrawing(context.svgMarkup), buildExportTitle(context)),
  dxf: (context) => buildSldDxf(svgMarkupToDrawing(context.svgMarkup), buildExportTitle(context)),
  iec61850: (context) => {
    const snapshot = requireSnapshot(context, 'SCD');
    const input = buildIec61850Input(snapshot, context.projectName);
    if (iec61850ObjectCount(input) === 0) {
      throw new Error('Eksport SCD: model nie zawiera stacji ani pól — plik bez obiektów byłby pozornym sukcesem.');
    }
    return generateIec61850Scd(input);
  },
  cim: (context) => {
    const snapshot = requireSnapshot(context, 'CIM');
    const input = buildCimInput(snapshot);
    if (cimObjectCount(input) === 0) {
      throw new Error('Eksport CIM: model nie zawiera obiektów sieci — plik bez obiektów byłby pozornym sukcesem.');
    }
    return generateCimRdfXml(input);
  },
};

/**
 * Buduje plik eksportu (treść + nazwa + typ MIME). Rzuca wyjątek zamiast
 * zwracać pusty plik — wołający pokazuje komunikat.
 */
export function buildSldExportFile(format: SldExportFormat, context: SldExportContext): SldExportFile {
  const descriptor = sldExportFormatDescriptor(format);
  const content = EXPORT_BUILDERS[format](context);
  return {
    filename: buildSldExportFileName(format, {
      projectName: context.projectName,
      caseName: context.caseName,
      modelRevision: context.snapshot?.header.revision ?? null,
      modelHash: context.snapshot?.header.hash_sha256 ?? null,
    }),
    mime: descriptor.mime,
    content,
  };
}
