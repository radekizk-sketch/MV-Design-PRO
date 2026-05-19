import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithQueryClient as render } from '../../../test/queryClientTestUtils';

import { useAppStateStore } from '../../app-state';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import { REPORT_SURFACE_SCREEN_CODE, type WorkspaceSurfaceDescriptor } from '../types';

const REPORT_SURFACE: WorkspaceSurfaceDescriptor = {
  surfaceId: 'report-diagnostic-test',
  screenCode: REPORT_SURFACE_SCREEN_CODE,
  titlePl: 'Raport techniczny',
  entityRef: null,
  entityType: null,
  routeState: { payload: { runId: 'run-failed' } } as never,
  breadcrumbs: [],
  supportsMiniSld: false,
  supportsChildren: false,
  sizeClass: 'C',
  stackLevel: 0,
  openMode: 'expand_workspace',
  subjectKind: 'report',
  subjectRef: 'run-failed',
  saveMode: 'edit',
  hasUnsavedChanges: false,
  tabId: null,
} as never;

describe('ReportSurface - eksport diagnostyczny', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({ activeSurface: REPORT_SURFACE });
  });

  it('nie udaje pelnego dowodu, gdy aktywne obliczenie nie ma sladu solvera', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'run-failed',
          status: 'FAILED',
          result_status: 'VALID',
          results_valid: true,
          trace_summary: null,
          analysis_case_context: { completeness: 'failed' },
          summary_json: { row_count: 0 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    useAppStateStore.getState().setActiveRun('run-failed');
    useSnapshotStore.setState({
      readiness: { ready: true, blockers: [], warnings: [] },
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    await waitFor(() => {
      expect(screen.getByTestId('report-status').textContent).toContain('Raport diagnostyczny');
    });

    const pdfBtn = screen.getByTestId('report-export-pdf') as HTMLButtonElement;
    const docxBtn = screen.getByTestId('report-export-docx') as HTMLButtonElement;
    const jsonBtn = screen.getByTestId('report-export-json') as HTMLButtonElement;
    const latexBtn = screen.getByTestId('proof-export-latex') as HTMLButtonElement;

    expect(pdfBtn.disabled).toBe(false);
    expect(docxBtn.disabled).toBe(false);
    expect(jsonBtn.disabled).toBe(false);
    expect(latexBtn.disabled).toBe(true);
    expect(latexBtn.title).toContain('śladu solvera');
  });
});
