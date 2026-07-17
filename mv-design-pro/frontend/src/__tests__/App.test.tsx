/**
 * Test korzenia motywu dark-SCADA (karta U4 §4).
 *
 * App to cienki wrapper aktywujący kanoniczny motyw ekranowy: renderuje AppRoot
 * wewnątrz elementu z markerami `mv-dark-scada` + `data-ui-theme="dark-scada"`.
 * Sprawdzamy obecność markerów oraz brak regresji montażu AppRoot.
 */
import { render, screen, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { EnergyNetworkModel } from '../types/enm';
import { useSnapshotStore } from '../ui/topology/snapshotStore';

// Kanwa SLD (ciężki komponent canvas) jest atrapowana — test korzenia motywu
// sprawdza kontrakt markerów i montaż powłoki, nie silnik SLD.
vi.mock('../ui/sld/v3/canvas/SldCanvasV3Workspace', () => ({
  SldCanvasV3Workspace: () => null,
}));

function snapshotZRewizja(revision: number): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'projekt-testowy',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision,
      hash_sha256: `hash-${revision}`,
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [{ id: 'bus-gpz', ref_id: 'GPZ', name: 'GPZ Przykładowo', tags: [], meta: {} }],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

describe('U4 — korzeń motywu dark-SCADA', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.location.hash = '';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
    act(() => {
      useSnapshotStore.setState({ snapshot: snapshotZRewizja(5) });
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    act(() => {
      useSnapshotStore.setState({ snapshot: null });
    });
  });

  it('renderuje AppRoot wewnątrz korzenia z markerami motywu', () => {
    const { container } = render(<App />);
    const korzen = container.querySelector('.mv-dark-scada');
    expect(korzen).not.toBeNull();
    expect(korzen?.getAttribute('data-ui-theme')).toBe('dark-scada');
    // AppRoot montuje się bez regresji — jego korzeń (canonical-layout) jest
    // dzieckiem wrappera motywu.
    const powloka = screen.getByTestId('canonical-layout');
    expect(powloka).toBeTruthy();
    expect(korzen?.contains(powloka)).toBe(true);
  });
});
