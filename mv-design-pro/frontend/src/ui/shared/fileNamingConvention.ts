/**
 * fileNamingConvention — naming convention dla exportu plików (Etap 14/15/16 z planu).
 *
 * "Naming convention: {ProjectName}_{CaseName}_{Profile}_{Date}.{pdf|docx}"
 *
 * Reguły:
 * - Sanityzacja znaków specjalnych → _
 * - Polish chars ąćęłńóśźż → aceln oszzz
 * - Spacja → _
 * - Max długość 200 znaków
 * - Format daty YYYY-MM-DD (ISO)
 */

const POLISH_CHAR_MAP: Record<string, string> = {
  ą: 'a', Ą: 'A',
  ć: 'c', Ć: 'C',
  ę: 'e', Ę: 'E',
  ł: 'l', Ł: 'L',
  ń: 'n', Ń: 'N',
  ó: 'o', Ó: 'O',
  ś: 's', Ś: 'S',
  ź: 'z', Ź: 'Z',
  ż: 'z', Ż: 'Z',
};

export function sanitizeFilenamePart(part: string): string {
  return part
    .split('')
    .map((c) => POLISH_CHAR_MAP[c] ?? c)
    .join('')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100);
}

export interface FilenameInput {
  projectName: string;
  caseName?: string;
  profile?: string;
  date?: Date;
  extension: string;
  prefix?: string;
}

export function buildFilename({
  projectName,
  caseName,
  profile,
  date,
  extension,
  prefix,
}: FilenameInput): string {
  const parts: string[] = [];
  if (prefix) parts.push(sanitizeFilenamePart(prefix));
  parts.push(sanitizeFilenamePart(projectName));
  if (caseName) parts.push(sanitizeFilenamePart(caseName));
  if (profile) parts.push(sanitizeFilenamePart(profile));
  const dateStr = (date ?? new Date()).toISOString().slice(0, 10);
  parts.push(dateStr);

  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return parts.filter((p) => p.length > 0).join('_') + ext;
}

/**
 * Naming conventions per type of export:
 */
export const NAMING_PRESETS = {
  osd_application: (project: string, date?: Date) =>
    buildFilename({
      prefix: 'Wniosek',
      projectName: project,
      profile: 'OSD',
      date,
      extension: 'pdf',
    }),

  proof_pack: (project: string, caseName: string, format: 'pdf' | 'json' | 'tex' | 'docx', date?: Date) =>
    buildFilename({
      prefix: 'Proof',
      projectName: project,
      caseName,
      date,
      extension: format,
    }),

  sld_export: (project: string, format: 'svg' | 'pdf' | 'png' | 'dxf' | 'scd' | 'cim', date?: Date) =>
    buildFilename({
      prefix: 'SLD',
      projectName: project,
      profile: format.toUpperCase(),
      date,
      extension: format,
    }),

  archive_zip: (project: string, date?: Date) =>
    buildFilename({
      prefix: 'Archive',
      projectName: project,
      date,
      extension: 'zip',
    }),

  technical_report: (project: string, caseName: string, profile: string, format: 'pdf' | 'docx', date?: Date) =>
    buildFilename({
      projectName: project,
      caseName,
      profile,
      date,
      extension: format,
    }),
};

export function isValidFilename(filename: string): boolean {
  if (filename.length === 0 || filename.length > 200) return false;
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) return false;
  // Reserved names on Windows
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
  return !reserved.test(filename);
}
