/**
 * projectArchivePreview — preview zawartości ZIP przed importem/eksportem (Etap 16 z planu).
 *
 * "Dialog z preview zawartości: ENM + cases + materialized params + results (opcjonalnie)"
 * "Wersjonowanie archive: SHA-256 fingerprint + timestamp w pliku"
 * "Restore z archive: preview przed importem, walidacja kompatybilności wersji"
 */

export interface ArchiveContent {
  archiveVersion: string;
  createdAt: string;
  fingerprintSha256: string;
  project: {
    name: string;
    investor: string;
    phase: string;
  };
  enmModel: {
    elementsCount: number;
    snapshotHash: string;
  };
  cases: Array<{
    id: string;
    name: string;
    type: string;
    hasResults: boolean;
  }>;
  materializedParams: number;
  resultsBlob?: {
    powerFlowRuns: number;
    shortCircuitRuns: number;
    totalSizeBytes: number;
  };
}

export interface ArchiveValidationResult {
  isValid: boolean;
  isCompatible: boolean;
  issues: string[];
  warnings: string[];
}

const SUPPORTED_ARCHIVE_VERSIONS = ['1.0', '1.1', '1.2'];
const MIN_SUPPORTED = '1.0';

export function validateArchive(content: ArchiveContent): ArchiveValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Version check
  if (!SUPPORTED_ARCHIVE_VERSIONS.includes(content.archiveVersion)) {
    if (content.archiveVersion < MIN_SUPPORTED) {
      issues.push(
        `Wersja archiwum ${content.archiveVersion} starsza niż minimalna obsługiwana ${MIN_SUPPORTED}.`,
      );
    } else {
      warnings.push(
        `Wersja archiwum ${content.archiveVersion} nowsza niż znana — niektóre dane mogą być pominięte.`,
      );
    }
  }

  // Fingerprint format
  if (!/^[a-f0-9]{64}$/i.test(content.fingerprintSha256)) {
    issues.push('Niepoprawny format fingerprint SHA-256.');
  }

  // Project metadata
  if (!content.project.name.trim()) {
    issues.push('Brak nazwy projektu w archiwum.');
  }

  // ENM model
  if (content.enmModel.elementsCount === 0) {
    warnings.push('Archiwum nie zawiera modelu ENM (pusty projekt).');
  }

  // Cases
  if (content.cases.length === 0) {
    warnings.push('Archiwum nie zawiera żadnego case (study case).');
  }

  // Results
  if (content.resultsBlob) {
    const totalRuns = content.resultsBlob.powerFlowRuns + content.resultsBlob.shortCircuitRuns;
    if (totalRuns > 100) {
      warnings.push(`Archiwum zawiera ${totalRuns} przebiegów — duży rozmiar (${formatBytes(content.resultsBlob.totalSizeBytes)}).`);
    }
  }

  const isValid = issues.length === 0;
  const isCompatible = isValid && warnings.filter((w) => w.includes('nowsza')).length === 0;

  return { isValid, isCompatible, issues, warnings };
}

export function summarizeArchiveContent(content: ArchiveContent): string {
  const parts = [
    `Projekt: ${content.project.name}`,
    `Inwestor: ${content.project.investor}`,
    `Faza: ${content.project.phase}`,
    `Elementów ENM: ${content.enmModel.elementsCount}`,
    `Case'y: ${content.cases.length}`,
    `Parametry: ${content.materializedParams}`,
  ];
  if (content.resultsBlob) {
    parts.push(
      `Wyniki: ${content.resultsBlob.powerFlowRuns} PF + ${content.resultsBlob.shortCircuitRuns} SC (${formatBytes(content.resultsBlob.totalSizeBytes)})`,
    );
  }
  return parts.join(' · ');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
