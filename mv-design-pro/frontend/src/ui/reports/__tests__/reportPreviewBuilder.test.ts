import { describe, expect, it } from 'vitest';
import {
  buildReportPreview,
  countPagesEstimate,
  describeReportContent,
} from '../reportPreviewBuilder';

describe('buildReportPreview', () => {
  it('zawsze zawiera title_page', () => {
    const blocks = buildReportPreview({
      projectName: 'GPZ',
      caseName: 'Wariant',
      investor: 'PSE',
      reportProfile: 'osd',
      sections: {},
    });
    expect(blocks[0].section).toBe('title_page');
    expect(blocks[0].page).toBe(1);
  });

  it('title page zawiera projekt + inwestor', () => {
    const blocks = buildReportPreview({
      projectName: 'GPZ Test',
      caseName: 'Wariant N-1',
      investor: 'PGE',
      reportProfile: 'audit',
      sections: {},
    });
    expect(blocks[0].content).toContain('GPZ Test');
    expect(blocks[0].content).toContain('PGE');
    expect(blocks[0].content).toContain('Wariant N-1');
  });

  it('summary i diagram domyślnie included', () => {
    const blocks = buildReportPreview({
      projectName: 'P',
      caseName: 'C',
      investor: 'I',
      reportProfile: 'executive',
      sections: {},
    });
    const sections = blocks.map((b) => b.section);
    expect(sections).toContain('summary');
    expect(sections).toContain('diagram');
  });

  it('max 3 strony w preview', () => {
    const blocks = buildReportPreview({
      projectName: 'P',
      caseName: 'C',
      investor: 'I',
      reportProfile: 'full_technical',
      sections: {
        summary: true,
        diagram: true,
        parameters: true,
        calculations: true,
        results: true,
      },
    });
    expect(blocks.length).toBeLessThanOrEqual(3);
  });

  it('summary: false → nie generuje', () => {
    const blocks = buildReportPreview({
      projectName: 'P',
      caseName: 'C',
      investor: 'I',
      reportProfile: 'osd',
      sections: { summary: false },
    });
    expect(blocks.some((b) => b.section === 'summary')).toBe(false);
  });

  it('authorName w title gdy podany', () => {
    const blocks = buildReportPreview({
      projectName: 'P',
      caseName: 'C',
      investor: 'I',
      reportProfile: 'osd',
      sections: {},
      authorName: 'Jan Kowalski',
    });
    expect(blocks[0].content).toContain('Jan Kowalski');
  });

  it('diagram block ma hasImage=true', () => {
    const blocks = buildReportPreview({
      projectName: 'P',
      caseName: 'C',
      investor: 'I',
      reportProfile: 'osd',
      sections: {},
    });
    const diagramBlock = blocks.find((b) => b.section === 'diagram');
    expect(diagramBlock?.hasImage).toBe(true);
  });
});

describe('countPagesEstimate', () => {
  it('osd profile: shorter', () => {
    const osd = countPagesEstimate('osd', { summary: true, diagram: true });
    const full = countPagesEstimate('full_technical', { summary: true, diagram: true });
    expect(osd).toBeLessThan(full);
  });

  it('więcej sekcji → więcej stron', () => {
    const less = countPagesEstimate('audit', { summary: true });
    const more = countPagesEstimate('audit', {
      summary: true,
      diagram: true,
      parameters: true,
      calculations: true,
    });
    expect(more).toBeGreaterThan(less);
  });
});

describe('describeReportContent', () => {
  it('zawiera profil + sekcje', () => {
    const desc = describeReportContent({
      projectName: 'GPZ',
      caseName: 'C1',
      investor: 'PSE',
      reportProfile: 'osd',
      sections: { summary: true, diagram: true },
    });
    expect(desc).toContain('OSD');
    expect(desc).toContain('Streszczenie');
    expect(desc).toContain('Schemat jednokreskowy');
  });
});
