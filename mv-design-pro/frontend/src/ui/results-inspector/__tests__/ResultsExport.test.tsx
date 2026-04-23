import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResultsExport } from '../ResultsExport';
import type { RunHeader } from '../types';

const downloadAnalysisRunExportMock = vi.fn();
const downloadAnalysisRunReportMock = vi.fn();
const notifyMock = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    downloadAnalysisRunExport: (...args: unknown[]) => downloadAnalysisRunExportMock(...args),
    downloadAnalysisRunReport: (...args: unknown[]) => downloadAnalysisRunReportMock(...args),
  };
});

vi.mock('../../notifications/store', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

const baseRunHeader: RunHeader = {
  run_id: 'run-1',
  project_id: 'project-1',
  case_id: 'case-1',
  snapshot_id: 'snapshot-1',
  created_at: '2026-04-11T10:00:00Z',
  status: 'DONE',
  result_state: 'FRESH',
  solver_kind: 'PF',
  input_hash: 'hash-1',
};

describe('ResultsExport', () => {
  afterEach(() => {
    downloadAnalysisRunExportMock.mockReset();
    downloadAnalysisRunReportMock.mockReset();
    notifyMock.mockReset();
  });

  it('renders CSV, report generator and calculation artifact exports for table tabs', () => {
    render(
      <ResultsExport
        exportData={{
          activeTab: 'BUSES',
          busRows: [],
          branchRows: [],
          shortCircuitRows: [],
          runHeader: baseRunHeader,
        }}
      />,
    );

    expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument();
    expect(screen.getByTestId('report-json-btn')).toBeInTheDocument();
    expect(screen.getByTestId('report-docx-btn')).toBeInTheDocument();
    expect(screen.getByTestId('report-pdf-btn')).toBeInTheDocument();
    expect(screen.getByTestId('export-json-btn')).toBeInTheDocument();
    expect(screen.getByTestId('export-docx-btn')).toBeInTheDocument();
    expect(screen.getByTestId('export-pdf-btn')).toBeInTheDocument();
    expect(screen.getByText('Generator raportu końcowego')).toBeInTheDocument();
    expect(screen.getByText('Pomocnicze artefakty obliczenia')).toBeInTheDocument();
  });

  it('keeps report generator available for trace tab without CSV', () => {
    render(
      <ResultsExport
        exportData={{
          activeTab: 'TRACE',
          busRows: [],
          branchRows: [],
          shortCircuitRows: [],
          runHeader: baseRunHeader,
        }}
      />,
    );

    expect(screen.queryByTestId('export-csv-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('report-pdf-btn')).toBeInTheDocument();
    expect(screen.getByTestId('report-scope-select')).toBeInTheDocument();
  });

  it('calls canonical backend artifact export for PDF', async () => {
    downloadAnalysisRunExportMock.mockResolvedValue(undefined);

    render(
      <ResultsExport
        exportData={{
          activeTab: 'BRANCHES',
          busRows: [],
          branchRows: [],
          shortCircuitRows: [],
          runHeader: baseRunHeader,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('export-pdf-btn'));

    await waitFor(() => {
      expect(downloadAnalysisRunExportMock).toHaveBeenCalledWith('project-1', 'run-1', 'pdf');
    });
    expect(notifyMock).toHaveBeenCalledWith('Pobrano pomocniczy eksport obliczenia (PDF).', 'success');
  });

  it('calls report generator with selected options', async () => {
    downloadAnalysisRunReportMock.mockResolvedValue(undefined);

    render(
      <ResultsExport
        exportData={{
          activeTab: 'TRACE',
          busRows: [],
          branchRows: [],
          shortCircuitRows: [],
          runHeader: baseRunHeader,
        }}
      />,
    );

    fireEvent.change(screen.getByTestId('report-profile-select'), {
      target: { value: 'audytowy' },
    });
    fireEvent.change(screen.getByTestId('report-detail-select'), {
      target: { value: 'pelny' },
    });
    fireEvent.change(screen.getByTestId('report-scope-select'), {
      target: { value: 'active_table' },
    });
    fireEvent.click(screen.getByTestId('report-pdf-btn'));

    await waitFor(() => {
      expect(downloadAnalysisRunReportMock).toHaveBeenCalledWith('project-1', 'run-1', 'pdf', {
        profile: 'audytowy',
        detailLevel: 'pelny',
        scope: 'active_table',
        sections: ['summary', 'results', 'catalog', 'trace'],
        focusTable: 'trace',
      });
    });
    expect(notifyMock).toHaveBeenCalledWith('Pobrano raport końcowy (PDF).', 'success');
  });
});
