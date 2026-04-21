import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadAnalysisTraceExport } from '../traceExportApi';

describe('proof trace export API', () => {
  const originalFetch = global.fetch;
  const originalCreateElement = document.createElement.bind(document);
  const createObjectURL = vi.fn(() => 'blob:trace-export');
  const revokeObjectURL = vi.fn();
  const clickMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    clickMock.mockClear();

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

  it('downloads JSONL export from canonical analysis-runs trace endpoint', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response('trace-jsonl', {
        status: 200,
        headers: {
          'content-disposition': 'attachment; filename="analysis_trace_run-1.jsonl"',
        },
      }),
    );

    await downloadAnalysisTraceExport('run-1', 'jsonl');

    expect(global.fetch).toHaveBeenCalledWith('/api/analysis-runs/run-1/trace/export/jsonl');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('prefers project-scoped canonical trace export when project id is available', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response('trace-pdf', {
        status: 200,
        headers: {
          'content-disposition': 'attachment; filename="analysis_trace_run-1.pdf"',
        },
      }),
    );

    await downloadAnalysisTraceExport('run-1', 'pdf', { projectId: 'project-1' });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/projects/project-1/analysis-runs/run-1/trace/export/pdf',
    );
  });
});
