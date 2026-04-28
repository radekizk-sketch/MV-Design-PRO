import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../app-state';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useResultsInspectorStore } from '../store';
import { EmbeddedSldWorkspace } from '../EmbeddedSldWorkspace';
import type { EnergyNetworkModel } from '../../../types/enm';

const fetchCurrentCaseSnapshotMock = vi.fn();
const projectEnmToSldCadV12Mock = vi.fn();

vi.mock('../api', () => ({
  fetchCurrentCaseSnapshot: (...args: unknown[]) => fetchCurrentCaseSnapshotMock(...args),
}));

vi.mock('../../sld', () => ({
  SLDView: ({ symbols }: { symbols: unknown[] }) => (
    <div data-testid="mock-sld-view" data-symbol-count={symbols.length} />
  ),
  projectEnmToSldCadV12: (...args: unknown[]) => projectEnmToSldCadV12Mock(...args),
}));

function createSnapshot(hash: string, busCount: number): EnergyNetworkModel {
  return {
    header: {
      name: `Snapshot ${hash}`,
      enm_version: '1.0',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      revision: 1,
      hash_sha256: hash,
    },
    buses: Array.from({ length: busCount }, (_, index) => ({
      id: `bus-${hash}-${index}`,
      ref_id: `bus-${hash}-${index}`,
      name: `Szyna ${index}`,
      tags: [],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
    })),
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    branch_points: [],
  };
}

describe('EmbeddedSldWorkspace', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', undefined);
    useResultsInspectorStore.getState().reset();
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    fetchCurrentCaseSnapshotMock.mockReset();
    projectEnmToSldCadV12Mock.mockReset();
    window.history.replaceState(null, '', '/#results?run=run-1&snapshot=run');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStateStore.getState().reset();
    useResultsInspectorStore.getState().reset();
    useSnapshotStore.getState().reset();
    window.history.replaceState(null, '', '/');
  });

  it('renders run snapshot by default and exposes mismatch with current model', async () => {
    const runSnapshot = createSnapshot('run-hash-001', 1);
    const currentSnapshot = createSnapshot('current-hash-002', 2);

    useAppStateStore.getState().setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'FRESH');
    useResultsInspectorStore.setState({
      runSnapshot: {
        run_id: 'run-1',
        snapshot_id: 'run-hash-001',
        snapshot: runSnapshot,
      },
      sldOverlay: {
        diagram_id: 'analysis-run-derived',
        run_id: 'run-1',
        result_status: 'VALID',
        nodes: [],
        branches: [],
      },
    });

    projectEnmToSldCadV12Mock.mockImplementation((snapshot: EnergyNetworkModel | null) => {
      const hash = snapshot?.header.hash_sha256;
      if (hash === 'current-hash-002') {
        return {
          symbols: [{ id: 'current-symbol-1' }, { id: 'current-symbol-2' }],
          connections: [],
          canonicalAnnotations: null,
        };
      }
      return {
        symbols: [{ id: 'run-symbol-1' }],
        connections: [],
        canonicalAnnotations: null,
      };
    });
    useSnapshotStore.setState({ snapshot: currentSnapshot });

    await act(async () => {
      render(
        <EmbeddedSldWorkspace
          runHeader={{
            run_id: 'run-1',
            project_id: 'project-1',
            case_id: 'case-1',
            snapshot_id: 'run-hash-001',
            created_at: '2024-01-01T00:00:00Z',
            status: 'FINISHED',
            result_state: 'VALID',
            solver_kind: 'short_circuit_sn',
            input_hash: 'input-1',
          }}
        />,
      );
    });

    expect(await screen.findByTestId('mock-sld-view')).toHaveAttribute('data-symbol-count', '1');
    expect(screen.getByTestId('embedded-sld-mismatch-banner')).toBeInTheDocument();
    expect(screen.getByTestId('embedded-sld-mode-current')).not.toBeDisabled();
    await waitFor(() => {
      expect(useAppStateStore.getState().activeSnapshotId).toBe('run-hash-001');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('embedded-sld-mode-current'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('mock-sld-view')).toHaveAttribute('data-symbol-count', '2');
      expect(useAppStateStore.getState().activeSnapshotId).toBe('current-hash-002');
    });
    expect(window.location.hash).toContain('snapshot=current');
  });
});
