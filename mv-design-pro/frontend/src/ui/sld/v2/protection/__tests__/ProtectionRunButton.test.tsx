/**
 * ProtectionRunButton tests — P0.2 FE component.
 *
 * Verifies:
 * - Renders Polish label "Uruchom Protection"
 * - Disabled when prerequisites missing (projectId/scRunId/protectionCaseId)
 * - Polish tooltip per missing prerequisite
 * - Click triggers create + execute POST flow
 * - onRunComplete callback invoked with protection_run_id
 * - Error state shows Polish error message
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProtectionRunButton } from '../ProtectionRunButton';

const VALID_PROPS = {
  projectId: 'proj-1',
  scRunId: 'sc-run-1',
  protectionCaseId: 'pc-1',
};

beforeEach(() => {
  vi.spyOn(global, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProtectionRunButton — rendering', () => {
  it('renders Polish label "Uruchom Protection" by default', () => {
    render(<ProtectionRunButton {...VALID_PROPS} />);
    expect(screen.getByTestId('protection-run-button')).toHaveTextContent(
      'Uruchom Protection',
    );
  });

  it('exposes data-testid="protection-run-button"', () => {
    render(<ProtectionRunButton {...VALID_PROPS} />);
    expect(screen.getByTestId('protection-run-button')).toBeInTheDocument();
  });
});

describe('ProtectionRunButton — disabled states', () => {
  it('is disabled when projectId is null', () => {
    render(
      <ProtectionRunButton
        projectId={null}
        scRunId="sc-1"
        protectionCaseId="pc-1"
      />,
    );
    const btn = screen.getByTestId('protection-run-button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Wymaga aktywnego projektu');
  });

  it('is disabled when scRunId is null + Polish tooltip', () => {
    render(
      <ProtectionRunButton
        projectId="proj-1"
        scRunId={null}
        protectionCaseId="pc-1"
      />,
    );
    const btn = screen.getByTestId('protection-run-button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute(
      'title',
      'Wymaga wykonanego obliczenia zwarciowego (SC)',
    );
  });

  it('is disabled when protectionCaseId is null + Polish tooltip', () => {
    render(
      <ProtectionRunButton
        projectId="proj-1"
        scRunId="sc-1"
        protectionCaseId={null}
      />,
    );
    const btn = screen.getByTestId('protection-run-button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute(
      'title',
      'Wymaga konfiguracji protection_case w wariancie',
    );
  });

  it('is enabled when all prerequisites present', () => {
    render(<ProtectionRunButton {...VALID_PROPS} />);
    expect(screen.getByTestId('protection-run-button')).not.toBeDisabled();
  });
});

describe('ProtectionRunButton — click flow', () => {
  it('triggers POST /api/projects/{id}/protection-runs + execute', async () => {
    const fetchMock = vi
      .mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pr-1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'FINISHED' }), { status: 200 }),
      );

    const onRunComplete = vi.fn();
    render(
      <ProtectionRunButton {...VALID_PROPS} onRunComplete={onRunComplete} />,
    );

    fireEvent.click(screen.getByTestId('protection-run-button'));

    await waitFor(() => expect(onRunComplete).toHaveBeenCalledWith('pr-1'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/projects/proj-1/protection-runs',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      '/api/protection-runs/pr-1/execute',
    );

    expect(screen.getByTestId('protection-run-button')).toHaveTextContent(
      'Gotowe',
    );
  });

  it('sends sc_run_id + protection_case_id in create payload', async () => {
    const fetchMock = vi
      .mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pr-1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'FINISHED' }), { status: 200 }),
      );

    render(<ProtectionRunButton {...VALID_PROPS} />);
    fireEvent.click(screen.getByTestId('protection-run-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body).toEqual({
      sc_run_id: 'sc-run-1',
      protection_case_id: 'pc-1',
    });
  });
});

describe('ProtectionRunButton — error handling', () => {
  it('renders error message when create fails', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'SC run not found' }), {
        status: 404,
      }),
    );

    render(<ProtectionRunButton {...VALID_PROPS} />);
    fireEvent.click(screen.getByTestId('protection-run-button'));

    await waitFor(() =>
      expect(screen.getByTestId('protection-run-error')).toHaveTextContent(
        'SC run not found',
      ),
    );
    expect(screen.getByTestId('protection-run-button')).toHaveTextContent(
      'Błąd',
    );
  });

  it('renders error message when execute fails', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pr-1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 500 }));

    render(<ProtectionRunButton {...VALID_PROPS} />);
    fireEvent.click(screen.getByTestId('protection-run-button'));

    await waitFor(() =>
      expect(screen.getByTestId('protection-run-error')).toHaveTextContent(
        /Błąd wykonania: HTTP 500/,
      ),
    );
  });

  it('renders error when status is not FINISHED', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pr-1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'FAILED', error_message: 'Solver error' }),
          { status: 200 },
        ),
      );

    render(<ProtectionRunButton {...VALID_PROPS} />);
    fireEvent.click(screen.getByTestId('protection-run-button'));

    await waitFor(() =>
      expect(screen.getByTestId('protection-run-error')).toHaveTextContent(
        'Solver error',
      ),
    );
  });
});

describe('ProtectionRunButton — slownik statusu z backendu', () => {
  /**
   * PIN KLASY (K-S): kryterium sukcesu MUSI pochodzic ze slownika koncowki,
   * ktora ten przycisk wola. `POST /api/protection-runs/{id}/execute` oddaje
   * `ProtectionRunStatus` (CREATED/RUNNING/FINISHED/FAILED) — nigdy `DONE`
   * (to slownik biegow wykonawczych `/api/execution/...`). Komponent
   * porownywal z 'DONE', wiec KAZDE udane obliczenie meldowalo blad, a testy
   * tego nie widzialy, bo mockowaly odpowiedz, ktorej backend nie wysyla.
   * Ten test pinuje OBA kierunki: wlasny slownik = sukces, obcy = blad.
   */
  it('uznaje FINISHED za sukces, a obcego DONE nie', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pr-1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'FINISHED' }), { status: 200 }),
      );

    const onRunComplete = vi.fn();
    const { unmount } = render(
      <ProtectionRunButton {...VALID_PROPS} onRunComplete={onRunComplete} />,
    );
    fireEvent.click(screen.getByTestId('protection-run-button'));
    await waitFor(() => expect(onRunComplete).toHaveBeenCalledWith('pr-1'));
    unmount();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pr-2' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'DONE' }), { status: 200 }),
      );

    const onObcy = vi.fn();
    render(<ProtectionRunButton {...VALID_PROPS} onRunComplete={onObcy} />);
    fireEvent.click(screen.getByTestId('protection-run-button'));
    await waitFor(() =>
      expect(screen.getByTestId('protection-run-error')).toHaveTextContent(
        'Status: DONE',
      ),
    );
    expect(onObcy).not.toHaveBeenCalled();
  });
});
