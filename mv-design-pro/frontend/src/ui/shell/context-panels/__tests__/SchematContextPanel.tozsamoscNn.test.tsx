/**
 * Drzewo układu — tożsamość elementów nN (karta OBIEKT-KABEL-NN, znalezisko scenariusza 630 kVA:
 * kable nN liczone jako „Magistrale i odcinki SN", złącza kablowe ZK jako „Stacje SN/nN").
 *
 * Iloczyn cech: rodzaj elementu (kabel nN / kabel SN / rozdzielnica nN / stacja SN/nN) ×
 * sekcja drzewa × klik natywny (zaznaczenie bez okna powierzchni, inspektor pokazuje kartę).
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openRouteSurface: vi.fn(),
  openOperationForm: vi.fn(),
  clearRouteManagedSurface: vi.fn(),
}));

vi.mock('../../../network-build/networkBuildStore', () => ({
  useNetworkBuildDerived: () => ({ blockersByCategory: { total: 0 }, configuredGpzSnFields: [], openTerminals: [] }),
  useNetworkBuildStore: (selector: (s: unknown) => unknown) => selector(mocks),
}));

import { SchematContextPanel } from '../SchematContextPanel';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useSelectionStore } from '../../../selection';

const MIGAWKA = {
  header: { hash_sha256: 'hash-nn' },
  sources: [{ ref_id: 'gpz/1/source/main', name: 'Źródło GPZ' }],
  buses: [
    { ref_id: 'sn-1', name: 'Szyna SN', voltage_kv: 15 },
    { ref_id: 'sn-2', name: 'Szyna SN 2', voltage_kv: 15 },
    { ref_id: 'nn-rg', name: 'RG nN', voltage_kv: 0.4 },
    { ref_id: 'nn-zk', name: 'Szyna ZK-1', voltage_kv: 0.4 },
  ],
  bays: [],
  branches: [
    { ref_id: 'kab-sn', type: 'cable', length_km: 0.5, name: 'Odcinek SN 1', from_bus_ref: 'sn-1', to_bus_ref: 'sn-2' },
    { ref_id: 'kab-nn', type: 'cable', length_km: 0.15, name: 'Kabel nN 1', from_bus_ref: 'nn-rg', to_bus_ref: 'nn-zk' },
  ],
  substations: [
    { ref_id: 'st-1', name: 'Stacja 1', station_type: 'mv_lv', bus_refs: ['sn-2', 'nn-rg'] },
    { ref_id: 'zk-1', name: 'ZK-1 budynek A', station_type: 'rozdzielnica_nn', bus_refs: ['nn-zk'] },
  ],
  transformers: [],
  generators: [],
  loads: [],
  branch_points: [],
};

describe('SchematContextPanel — tożsamość elementów nN w drzewie', () => {
  it('kabel nN w „Odcinki nN", rozdzielnica nN w „Rozdzielnice i złącza nN", SN osobno', async () => {
    act(() => {
      useSnapshotStore.setState({ snapshot: MIGAWKA as never, readiness: { ready: true, blockers: [], warnings: [] } } as never);
      useSelectionStore.getState().selectElement(null);
    });
    render(<SchematContextPanel />);

    const odcinkiSn = screen.getByTestId('model-tree-section-magistrale-i-odcinki-sn');
    const odcinkiNn = screen.getByTestId('model-tree-section-odcinki-nn');
    const stacje = screen.getByTestId('model-tree-section-stacje-sn-nn');
    const rozdzielnice = screen.getByTestId('model-tree-section-rozdzielnice-i-z-acza-nn');

    expect(within(odcinkiSn).queryByTestId('model-tree-row-kab-nn')).toBeNull();
    expect(within(odcinkiSn).getByTestId('model-tree-row-kab-sn')).toBeInTheDocument();
    expect(within(odcinkiNn).getByTestId('model-tree-row-kab-nn')).toHaveTextContent('Kabel nN 1');
    expect(within(stacje).queryByTestId('model-tree-row-zk-1')).toBeNull();
    expect(within(rozdzielnice).getByTestId('model-tree-row-zk-1')).toHaveTextContent('rozdzielnica nN');
    // Rodzaj bez typu katalogowego z pasma modelu, nie założone „SN".
    expect(within(odcinkiNn).getByTestId('model-tree-row-kab-nn')).toHaveTextContent('kabel nN');
    expect(within(odcinkiSn).getByTestId('model-tree-row-kab-sn')).toHaveTextContent('kabel SN');

    const user = userEvent.setup();
    mocks.openRouteSurface.mockClear();
    await user.click(within(odcinkiNn).getByTestId('model-tree-row-kab-nn'));
    expect(useSelectionStore.getState().selectedElements[0]).toMatchObject({ id: 'kab-nn', type: 'LineBranch' });
    expect(mocks.openRouteSurface).not.toHaveBeenCalled();
    await user.click(within(rozdzielnice).getByTestId('model-tree-row-zk-1'));
    expect(useSelectionStore.getState().selectedElements[0]).toMatchObject({ id: 'zk-1', type: 'Station' });
    expect(mocks.openRouteSurface).not.toHaveBeenCalled();
  });
});
