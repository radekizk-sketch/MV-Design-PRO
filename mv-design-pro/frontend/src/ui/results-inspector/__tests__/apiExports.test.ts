import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  downloadAnalysisRunExport,
  downloadAnalysisRunReport,
} from '../api';

describe('results-inspector export API', () => {
  const originalFetch = global.fetch;
  const originalCreateElement = document.createElement.bind(document);
  const createObjectURL = vi.fn(() => 'blob:results-export');
  const revokeObjectURL = vi.fn();
  const clickMock = vi.fn();
  let appendChildMock: ReturnType<typeof vi.spyOn>;
  let removeChildMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    clickMock.mockClear();
    appendChildMock = vi.spyOn(document.body, 'appendChild');
    removeChildMock = vi.spyOn(document.body, 'removeChild');
    appendChildMock.mockClear();
    removeChildMock.mockClear();

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(element, 'click').mockImplementation(clickMock);
      }
      return element;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('downloads backend export with filename from content-disposition', async () => {
    const response = new Response('pdf-content', {
      status: 200,
      headers: {
        'content-disposition': 'attachment; filename="analysis_run_report.pdf"',
      },
    });

    vi.mocked(global.fetch).mockResolvedValue(response);

    await downloadAnalysisRunExport('run-1', 'pdf');

    // TRASA REALNIE SERWOWANA przez `api/analysis_runs.py`
    // (`@router.get("/analysis-runs/{run_id}/export/report/pdf")`, router pod `/api`).
    // Poprzednia wersja tego testu przypinala `/api/projects/{id}/analysis-runs/{id}/export/pdf`,
    // czyli adres, ktorego backend NIGDY nie serwowal — test byl zielony, a przycisk
    // eksportu w przegladarce wynikow konczyl sie 404. Test przypinajacy zly adres
    // nie chroni niczego, tylko usypia czujnosc.
    expect(global.fetch).toHaveBeenCalledWith('/api/analysis-runs/run-1/export/report/pdf');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('downloads report generator export with normalized query string', async () => {
    const response = new Response('pdf-content', {
      status: 200,
      headers: {
        'content-disposition': 'attachment; filename="analysis_report.pdf"',
      },
    });

    vi.mocked(global.fetch).mockResolvedValue(response);

    await downloadAnalysisRunReport('run-1', 'pdf', {
      profile: 'audytowy',
      detailLevel: 'pelny',
      scope: 'active_table',
      sections: ['summary', 'trace'],
      focusTable: 'trace',
    });

    // `sections` MUSI isc jako parametr POWTORZONY — backend deklaruje
    // `sections: list[str] | None = Query(default=None)`, wiec `sections=summary,trace`
    // dotarloby jako JEDNA sekcja o nazwie „summary,trace".
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/analysis-runs/run-1/export/report/pdf?profile=audytowy&detail_level=pelny&scope=active_table&sections=summary&sections=trace&focus_table=trace',
    );
  });

  it('surfaces backend error detail on failed export', async () => {
    const response = new Response(JSON.stringify({ detail: 'Brak gotowego raportu.' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });

    vi.mocked(global.fetch).mockResolvedValue(response);

    await expect(downloadAnalysisRunExport('run-1', 'docx')).rejects.toThrow(
      'Brak gotowego raportu.',
    );
  });
});
