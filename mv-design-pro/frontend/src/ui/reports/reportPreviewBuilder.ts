/**
 * reportPreviewBuilder — preview pierwszych 3 stron raportu (Etap 14 z planu).
 *
 * "Preview przed eksportem (pierwsze 3 strony)"
 *
 * Generuje sekcje raportu jako TextBlock z metadanymi.
 */

export type ReportSection =
  | 'title_page'
  | 'summary'
  | 'diagram'
  | 'parameters'
  | 'calculations'
  | 'results'
  | 'trace'
  | 'conclusions';

export interface ReportTextBlock {
  section: ReportSection;
  page: number;
  title: string;
  content: string;
  hasImage?: boolean;
}

export interface ReportPreviewInput {
  projectName: string;
  caseName: string;
  investor: string;
  reportProfile: 'osd' | 'executive' | 'audit' | 'full_technical';
  sections: Partial<Record<ReportSection, boolean>>;
  authorName?: string;
  date?: Date;
}

const SECTION_LABELS: Record<ReportSection, string> = {
  title_page: 'Strona tytułowa',
  summary: 'Streszczenie',
  diagram: 'Schemat jednokreskowy',
  parameters: 'Parametry sieci',
  calculations: 'Obliczenia',
  results: 'Wyniki',
  trace: 'Ślad obliczeń',
  conclusions: 'Wnioski',
};

const PROFILE_LABELS: Record<string, string> = {
  osd: 'OSD — Wniosek przyłączeniowy',
  executive: 'PW — Projekt wykonawczy',
  audit: 'PR — Projekt rzeczywisty',
  full_technical: 'Pełny raport techniczny',
};

export function buildReportPreview(input: ReportPreviewInput): ReportTextBlock[] {
  const date = input.date ?? new Date();
  const dateStr = date.toLocaleDateString('pl-PL');
  const blocks: ReportTextBlock[] = [];
  let page = 1;

  // Strona tytułowa
  blocks.push({
    section: 'title_page',
    page,
    title: PROFILE_LABELS[input.reportProfile],
    content:
      `Projekt: ${input.projectName}\n`
      + `Wariant: ${input.caseName}\n`
      + `Inwestor: ${input.investor}\n`
      + (input.authorName ? `Projektant: ${input.authorName}\n` : '')
      + `Data sporządzenia: ${dateStr}`,
  });

  // Streszczenie
  if (input.sections.summary !== false) {
    page++;
    blocks.push({
      section: 'summary',
      page,
      title: SECTION_LABELS.summary,
      content:
        'Niniejsze opracowanie zawiera analizę sieci elektroenergetycznej '
        + 'średniego napięcia (SN) zgodnie z normami PN-EN 60909, PN-IEC 60364 '
        + 'oraz wymaganiami operatora systemu dystrybucyjnego (OSD).',
    });
  }

  // SLD
  if (input.sections.diagram !== false) {
    page++;
    blocks.push({
      section: 'diagram',
      page,
      title: SECTION_LABELS.diagram,
      content: '[Tutaj będzie wstawiony schemat jednokreskowy SLD]',
      hasImage: true,
    });
  }

  return blocks.slice(0, 3); // tylko pierwsze 3 strony
}

export function countPagesEstimate(
  profile: 'osd' | 'executive' | 'audit' | 'full_technical',
  sections: Partial<Record<ReportSection, boolean>>,
): number {
  const sectionCount = Object.values(sections).filter((v) => v !== false).length;
  const sectionMultiplier: Record<string, number> = {
    osd: 2,
    executive: 3,
    audit: 4,
    full_technical: 5,
  };
  return 1 + sectionCount * (sectionMultiplier[profile] ?? 3); // title + section pages
}

export function describeReportContent(input: ReportPreviewInput): string {
  const enabledSections = Object.entries(input.sections)
    .filter(([, enabled]) => enabled !== false)
    .map(([key]) => SECTION_LABELS[key as ReportSection])
    .join(', ');
  return (
    `Raport: ${PROFILE_LABELS[input.reportProfile]}\n`
    + `Projekt: ${input.projectName} (${input.caseName})\n`
    + `Sekcje: ${enabledSections || 'brak'}`
  );
}
