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
 *   scena v3 → markup arkusza SVG  → SVG / PDF / DXF (rysunek, w przeglądarce)
 *   model ENM na serwerze          → CGMES (IEC 61970 EQ+TP, backend)
 * Rysunek wchodzi tu JUŻ gotowy (kadr fit-do-treści, legenda, tabliczka,
 * paleta dokumentowa) — ten moduł go nie modyfikuje, tylko serializuje.
 *
 * Model sieci (karta KASACJA-SCL-I-CIM-KLIENT, decyzja K-14/D-41) NIE jest już
 * serializowany w przeglądarce: pozycja `cgmes` pobiera archiwum zbudowane przez
 * backend (`eksportCgmesApi.ts`). Dawne klientowe SCD i CIM skasowane — drugi
 * eksport tego samego modelu liczony obok backendu był defektem.
 */
import type { EnergyNetworkModel } from '../../../../types/enm';
import { buildSldDxf } from './exportDxfV3';
import { buildSldPdf } from './exportPdfV3';
import { pobierzEksportCgmes } from './eksportCgmesApi';
import { buildSldExportFileName } from './exportNames';
import { sldExportFormatDescriptor, type SldExportFormat } from './formats';
import { svgMarkupToDrawing } from './svgPrimitives';

export interface SldExportContext {
  /**
   * Markup arkusza gotowy do zapisu jako .svg (patrz nagłówek). `null` dla
   * formatów, których źródłem jest model (`source: 'model'` w `formats.ts`) —
   * wołający nie buduje wtedy rysunku.
   */
  readonly svgMarkup: string | null;
  /** Migawka ENM — rewizja i odcisk modelu w nazwie plików rysunku. */
  readonly snapshot: EnergyNetworkModel | null;
  /** Aktywny przypadek — adres modelu sieci na serwerze (eksport CGMES). */
  readonly caseId: string | null;
  readonly projectName?: string | null;
  readonly caseName?: string | null;
}

export interface SldExportFile {
  readonly filename: string;
  readonly mime: string;
  /** Tekst pliku rysunku albo bajty archiwum z serwera. */
  readonly content: string | Blob;
}

/** Tytuł dokumentu — człony bez danych POMIJANE (zero zaślepek). */
export function buildExportTitle(context: SldExportContext): string {
  const parts = ['Schemat jednokreskowy'];
  if (context.projectName?.trim()) parts.push(context.projectName.trim());
  if (context.caseName?.trim()) parts.push(context.caseName.trim());
  return parts.join(' — ');
}

/** Treść pliku + wersja modelu, którą ta treść faktycznie niesie (do nazwy pliku). */
interface ZbudowanaTresc {
  readonly content: string | Blob;
  readonly modelRevision: number | null;
  readonly modelHash: string | null;
}

function wymaganyRysunek(context: SldExportContext, format: string): string {
  if (context.svgMarkup === null) {
    throw new Error(`Eksport ${format}: brak rysunku schematu — nie ma czego wyeksportować.`);
  }
  return context.svgMarkup;
}

function zRysunku(context: SldExportContext, content: string): ZbudowanaTresc {
  return {
    content,
    modelRevision: context.snapshot?.header.revision ?? null,
    modelHash: context.snapshot?.header.hash_sha256 ?? null,
  };
}

const EXPORT_BUILDERS: Readonly<Record<SldExportFormat, (context: SldExportContext) => Promise<ZbudowanaTresc>>> = {
  svg: async (context) => zRysunku(context, wymaganyRysunek(context, 'SVG')),
  pdf: async (context) =>
    zRysunku(context, buildSldPdf(svgMarkupToDrawing(wymaganyRysunek(context, 'PDF')), buildExportTitle(context))),
  dxf: async (context) =>
    zRysunku(context, buildSldDxf(svgMarkupToDrawing(wymaganyRysunek(context, 'DXF')), buildExportTitle(context))),
  cgmes: async (context) => {
    if (!context.caseId) {
      throw new Error(
        'Eksport CGMES: brak aktywnego przypadku obliczeniowego — nie wiadomo, który model sieci wyeksportować.',
      );
    }
    const pobrany = await pobierzEksportCgmes(context.caseId);
    return { content: pobrany.archiwum, modelRevision: pobrany.rewizjaModelu, modelHash: pobrany.odciskModelu };
  },
};

/**
 * Buduje plik eksportu (treść + nazwa + typ MIME). Rzuca wyjątek zamiast
 * zwracać pusty plik — wołający pokazuje komunikat (także nazwaną odmowę
 * serwera dla modelu niekompletnego).
 */
export async function buildSldExportFile(format: SldExportFormat, context: SldExportContext): Promise<SldExportFile> {
  const descriptor = sldExportFormatDescriptor(format);
  const tresc = await EXPORT_BUILDERS[format](context);
  return {
    filename: buildSldExportFileName(format, {
      projectName: context.projectName,
      caseName: context.caseName,
      modelRevision: tresc.modelRevision,
      modelHash: tresc.modelHash,
    }),
    mime: descriptor.mime,
    content: tresc.content,
  };
}
