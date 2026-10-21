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

/**
 * `powodBrakuWywodu` = odpowiedź bramy `…/export/proof/dostepnosc` (karta UI-02): `null` —
 * eksport potwierdzony; tekst — przyczyna braku podana przez serwer.
 */
function mockReportFetch(runPayload: Record<string, unknown>, powodBrakuWywodu: string | null = null) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/export/proof/dostepnosc')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            run_id: String(runPayload.id),
            formaty: ['json', 'latex', 'pdf'].map((format) => ({
              format,
              dostepny: powodBrakuWywodu === null,
              powod_pl: powodBrakuWywodu,
            })),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url === '/api/station-templates') {
      return Promise.resolve(
        new Response(JSON.stringify({ templates: [], total: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(runPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

const POWOD_BEZ_SLADU = 'Przebieg nie ma śladu obliczeń — wywodu nie da się zbudować.';

describe('ReportSurface - eksport diagnostyczny', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({ activeSurface: REPORT_SURFACE });
  });

  it('nie udaje pelnego dowodu, gdy aktywne obliczenie nie ma sladu solvera', async () => {
    mockReportFetch({
      id: 'run-failed',
      status: 'FAILED',
      result_status: 'VALID',
      results_valid: true,
      trace_summary: null,
      analysis_case_context: { completeness: 'failed' },
      summary_json: { row_count: 0 },
    }, POWOD_BEZ_SLADU);
    useAppStateStore.getState().setActiveRun('run-failed');
    useSnapshotStore.setState({
      readiness: { ready: true, blockers: [], warnings: [] },
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    await waitFor(() => {
      expect(screen.getByTestId('report-status').textContent).toContain('Raport diagnostyczny');
    });

    expect(screen.getByTestId('report-workflow-stage-table')).toBeInTheDocument();
    expect(screen.getByTestId('report-chapter-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('station-batch-planner')).toBeInTheDocument();
    expect(screen.getByText('Etap 3 Ciąg SN 50+')).toBeInTheDocument();
    expect(screen.getByText('Etap 10 Uzasadnienie obliczeń')).toBeInTheDocument();

    const pdfBtn = screen.getByTestId('report-export-pdf') as HTMLButtonElement;
    const docxBtn = screen.getByTestId('report-export-docx') as HTMLButtonElement;
    const jsonBtn = screen.getByTestId('report-export-json') as HTMLButtonElement;
    const latexBtn = screen.getByTestId('proof-export-latex') as HTMLButtonElement;

    expect(pdfBtn.disabled).toBe(false);
    expect(docxBtn.disabled).toBe(false);
    expect(jsonBtn.disabled).toBe(false);
    expect(latexBtn.disabled).toBe(true);
    await waitFor(() => expect(latexBtn.title).toBe(POWOD_BEZ_SLADU));
  });

  it('streszczenie śladu bez potwierdzenia bramy NIE odblokowuje eksportu (jedno źródło predykatu)', async () => {
    // Para predykatów: `trace_summary` liczy inna funkcja backendu niż eksport — dla
    // rozpływu potrafi być niepusty, gdy eksport odmawia. O przycisku rozstrzyga brama.
    mockReportFetch({
      id: 'run-pf',
      status: 'FINISHED',
      result_status: 'VALID',
      results_valid: true,
      trace_summary: { count: 4, first_step: 'Y', last_step: 'V', phases: ['Y', 'V'], warnings: [] },
      analysis_case_context: { completeness: 'complete' },
      summary_json: { row_count: 3 },
    }, POWOD_BEZ_SLADU);
    useAppStateStore.getState().setActiveRun('run-pf');
    useSnapshotStore.setState({ readiness: { ready: true, blockers: [], warnings: [] } });
    useNetworkBuildStore.setState({
      activeSurface: { ...REPORT_SURFACE, subjectRef: 'run-pf', routeState: { payload: { runId: 'run-pf' } } as never },
    });

    render(<WorkspaceSurfaceRouter region="main" />);
    await waitFor(() => {
      expect(screen.getByTestId('report-status').textContent).toContain('Raport gotowy');
    });
    const latexBtn = screen.getByTestId('proof-export-latex') as HTMLButtonElement;
    await waitFor(() => expect(latexBtn.title).toBe(POWOD_BEZ_SLADU));
    expect(latexBtn.disabled).toBe(true);
  });

  it('odblokowuje eksport LaTeX dla zakończonego obliczenia FINISHED ze śladem solvera', async () => {
    mockReportFetch({
      id: 'run-finished',
      status: 'FINISHED',
      result_status: 'VALID',
      results_valid: true,
      proof_pack_ref: 'proof-pack:run-finished',
      trace_summary: {
        count: 12,
        first_step: 'Zk',
        last_step: 'Sk',
        phases: ['Zk', 'Ikss', 'Sk'],
        warnings: [],
      },
      analysis_case_context: { completeness: 'complete' },
      summary_json: { row_count: 3 },
    });
    useAppStateStore.getState().setActiveRun('run-finished');
    useSnapshotStore.setState({
      readiness: { ready: true, blockers: [], warnings: [] },
    });
    useNetworkBuildStore.setState({
      activeSurface: {
        ...REPORT_SURFACE,
        subjectRef: 'run-finished',
        routeState: { payload: { runId: 'run-finished' } } as never,
      },
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    await waitFor(() => {
      expect(screen.getByTestId('report-status').textContent).toContain('Raport gotowy');
    });

    expect(screen.getByTestId('report-workflow-stage-table')).toBeInTheDocument();
    expect(screen.getByTestId('report-chapter-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('station-batch-planner')).toBeInTheDocument();
    expect(screen.getByText('4. Wyniki obliczeń')).toBeInTheDocument();

    const latexBtn = screen.getByTestId('proof-export-latex') as HTMLButtonElement;
    await waitFor(() => expect(latexBtn.disabled).toBe(false));
    expect(latexBtn.title).toContain('Eksportuj uzasadnienie do formatu LaTeX');
  });
});
