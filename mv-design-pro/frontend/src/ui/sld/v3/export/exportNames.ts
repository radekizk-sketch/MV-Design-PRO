/**
 * S9-6 (audyt E-6 „Niespójne nazewnictwo plików") — JEDNA konwencja nazw
 * plików eksportu schematu.
 *
 * PRZED: dwie konwencje z dwóch miejsc — `handleExportSvg` zapisywał zawsze
 * `schemat_sld.svg` (stała, bez kontekstu), a menu budowało `projekt_wariant.
 * <ext>` z WŁASNEGO `buildFileName` z fabrykowanymi domyślnymi („projekt",
 * „wariant" — słowa, których nie ma w projekcie użytkownika). Dwa pliki tego
 * samego rysunku nie dawały się skojarzyć.
 *
 * PO: jedna funkcja dla WSZYSTKICH formatów (`SLD_EXPORT_FORMATS`):
 *
 *   schemat-sld_<projekt>_<przypadek>_rew<N>-<hash8>.<ext>
 *
 * Reguły:
 *  - ZERO FABRYKACJI: człon, dla którego nie ma danej, jest POMIJANY (nie
 *    zastępowany słowem-zaślepką). Bez modelu zostaje `schemat-sld.<ext>`.
 *  - DETERMINIZM: nazwa zależy WYŁĄCZNIE od danych modelu/projektu — zero
 *    `Date.now()`. Ten sam model i ten sam projekt dają tę samą nazwę
 *    (rewizja + skrót odcisku ENM pełnią rolę znacznika wersji, którą data
 *    pełniła w `NAMING_PRESETS.sld_export`, ale bez zależności od zegara).
 *  - Sanityzacja znaków (polskie znaki → ASCII, reszta → `_`) REUŻYWA
 *    `sanitizeFilenamePart` z `ui/shared/fileNamingConvention.ts` — ta sama
 *    funkcja, której używają pozostałe eksporty aplikacji (dyrektywa
 *    właściciela pkt 7 „reużycie zamiast duplikacji").
 */
import { sanitizeFilenamePart } from '../../../shared/fileNamingConvention';
import { sldExportFormatDescriptor, type SldExportFormat } from './formats';

export interface SldExportNameInput {
  /** `useAppStateStore.activeProjectName` — nazwa projektu (brak = pomijana). */
  readonly projectName?: string | null;
  /** `useAppStateStore.activeCaseName` — nazwa przypadku (brak = pomijana). */
  readonly caseName?: string | null;
  /** `snapshot.header.revision` — rewizja modelu (brak = pomijana). */
  readonly modelRevision?: number | null;
  /** `snapshot.header.hash_sha256` — odcisk modelu (brak = pomijany). */
  readonly modelHash?: string | null;
}

/** Trzon nazwy — po polsku, bez kodenamów, stały dla wszystkich formatów. */
const NAME_STEM = 'schemat-sld';

/** Długość skrótu odcisku ENM w nazwie — ta sama co `shortHash`
 *  (`app-state/useEnmHashChain.ts`), żeby nazwa pliku i pasek stanu
 *  pokazywały TEN SAM ciąg. */
const HASH_PREFIX_LENGTH = 8;

export function buildSldExportFileName(format: SldExportFormat, input: SldExportNameInput): string {
  const parts: string[] = [NAME_STEM];

  const project = input.projectName ? sanitizeFilenamePart(input.projectName) : '';
  if (project) parts.push(project);

  const caseName = input.caseName ? sanitizeFilenamePart(input.caseName) : '';
  if (caseName) parts.push(caseName);

  const revision = typeof input.modelRevision === 'number' ? `rew${input.modelRevision}` : '';
  const hash = input.modelHash ? sanitizeFilenamePart(input.modelHash.slice(0, HASH_PREFIX_LENGTH)) : '';
  const version = [revision, hash].filter(Boolean).join('-');
  if (version) parts.push(version);

  return `${parts.join('_')}.${sldExportFormatDescriptor(format).extension}`;
}
