import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useAppStateStore } from '../../app-state/store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import {
  clearProtectionReadModelCache,
  useProtectionReadModel,
} from '../useProtectionReadModel';

const FETCH_PAYLOAD = {
  case_id: 'case-1',
  enm_revision: 7,
  view_status: {
    data_source: 'ENM_PROTECTION_READ_MODEL' as const,
    result_state: 'FRESH' as const,
    has_protection_data: true,
  },
  summary: {
    total_elements: 3,
    total_assignments: 4,
    active_assignments: 3,
    blocked_assignments: 1,
    complete_count: 2,
    incomplete_count: 1,
    verified_count: 1,
    failed_count: 1,
    no_data_count: 1,
    error_count: 2,
    warn_count: 1,
    info_count: 0,
  },
  assignments: [
    {
      element_id: 'line-1',
      element_type: 'LineBranch',
      device_id: 'prot-1',
      device_name_pl: 'Zabezpieczenie liniowe',
      device_kind: 'RELAY_OVERCURRENT',
      status: 'ACTIVE',
      settings_summary: null,
    },
    {
      element_id: 'line-1',
      element_type: 'LineBranch',
      device_id: 'prot-2',
      device_name_pl: 'Zabezpieczenie rezerwowe',
      device_kind: 'RELAY_OVERCURRENT',
      status: 'BLOCKED',
      settings_summary: null,
    },
    {
      element_id: 'trafo-1',
      element_type: 'TransformerBranch',
      device_id: 'prot-3',
      device_name_pl: 'Zabezpieczenie transformatora',
      device_kind: 'RELAY_DIFFERENTIAL',
      status: 'ACTIVE',
      settings_summary: null,
    },
  ],
  diagnostics: [
    {
      severity: 'ERROR',
      code: 'OC_MISSING_IN',
      message_pl: 'Brak wartości In dla nastawy prądowej',
      element_id: 'line-1',
      element_type: 'LineBranch',
    },
  ],
  summaries: [
    {
      element_id: 'line-1',
      element_type: 'LineBranch',
      element_name: 'Linia 1',
      overcurrent: null,
      ct: null,
      verification_status: 'SPELNIONE',
      verification_reason: 'OK',
      margin_pct: 15,
      has_complete_data: true,
    },
    {
      element_id: 'trafo-1',
      element_type: 'TransformerBranch',
      element_name: 'Trafo 1',
      overcurrent: null,
      ct: null,
      verification_status: 'NIESPELNIONE',
      verification_reason: 'Brak selektywności',
      margin_pct: -2,
      has_complete_data: false,
    },
    {
      element_id: 'switch-1',
      element_type: 'Switch',
      element_name: 'Wyłącznik 1',
      overcurrent: null,
      ct: null,
      verification_status: 'BRAK_DANYCH',
      verification_reason: 'Brak CT',
      margin_pct: null,
      has_complete_data: true,
    },
  ],
};

describe('useProtectionReadModel', () => {
  beforeEach(() => {
    clearProtectionReadModelCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useAppStateStore.setState({
      activeCaseId: null,
      activeCaseName: null,
      activeCaseKind: null,
      activeCaseResultStatus: 'NONE',
      activeMode: 'MODEL_EDIT',
      activeSnapshotId: null,
      activeRunId: null,
      activeAnalysisType: null,
    });
    useSnapshotStore.setState({ snapshot: null });
  });

  it('returns empty state without active case and does not fetch', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useProtectionReadModel());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data.case_id).toBe('');
    expect(result.current.summary.total_elements).toBe(0);
    expect(result.current.viewStatus.result_state).toBe('NONE');
  });

  it('loads canonical summary, maps and statistics from backend read model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => FETCH_PAYLOAD,
    });
    vi.stubGlobal('fetch', fetchMock);
    useAppStateStore.setState({ activeCaseId: 'case-1' });
    useSnapshotStore.setState({ snapshot: { header: { revision: 7 } } as any });

    const { result } = renderHook(() => useProtectionReadModel());

    await waitFor(() => expect(result.current.summary.total_elements).toBe(3));

    expect(fetchMock).toHaveBeenCalledWith('/api/cases/case-1/enm/protection-view');
    expect(result.current.viewStatus.result_state).toBe('FRESH');
    expect(result.current.summary.active_assignments).toBe(3);
    expect(result.current.assignmentsByElement.get('line-1')).toHaveLength(2);
    expect(result.current.diagnosticsByElement.get('line-1')?.error_count).toBe(1);
    expect(result.current.summariesByElement.get('switch-1')?.verification_status).toBe(
      'BRAK_DANYCH',
    );
    expect(result.current.statistics).toEqual({
      total: 3,
      complete: 2,
      incomplete: 1,
      verified: 1,
      failed: 1,
      noData: 1,
    });
  });

  it('reuses cache for the same case and revision', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => FETCH_PAYLOAD,
    });
    vi.stubGlobal('fetch', fetchMock);
    useAppStateStore.setState({ activeCaseId: 'case-1' });
    useSnapshotStore.setState({ snapshot: { header: { revision: 7 } } as any });

    const first = renderHook(() => useProtectionReadModel());
    await waitFor(() => expect(first.result.current.summary.total_elements).toBe(3));

    const second = renderHook(() => useProtectionReadModel());
    await waitFor(() => expect(second.result.current.summary.total_elements).toBe(3));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes partial backend payload without crashing when summary is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        case_id: 'case-1',
        enm_revision: 7,
        assignments: [],
        diagnostics: [],
        summaries: [],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    useAppStateStore.setState({ activeCaseId: 'case-1' });
    useSnapshotStore.setState({ snapshot: { header: { revision: 7 } } as any });

    const { result } = renderHook(() => useProtectionReadModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.summary.total_elements).toBe(0);
    expect(result.current.statistics).toEqual({
      total: 0,
      complete: 0,
      incomplete: 0,
      verified: 0,
      failed: 0,
      noData: 0,
    });
    expect(result.current.viewStatus.result_state).toBe('NONE');
  });

  it('exposes a Polish error when the canonical read model request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    });
    vi.stubGlobal('fetch', fetchMock);
    useAppStateStore.setState({ activeCaseId: 'case-1' });
    useSnapshotStore.setState({ snapshot: { header: { revision: 7 } } as any });

    const { result } = renderHook(() => useProtectionReadModel());

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Nie udało się pobrać widoku zabezpieczeń: Internal Server Error',
      ),
    );

    expect(result.current.summary.total_elements).toBe(0);
    expect(result.current.viewStatus.result_state).toBe('NONE');
  });
});
