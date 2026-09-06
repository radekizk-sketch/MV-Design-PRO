/**
 * Test korzenia motywu (karta U4 §4 + TM1 §0.2).
 *
 * App to cienki wrapper aktywujący kanoniczny motyw ekranowy. JEDEN STEROWNIK:
 * wrapper renderuje się WARUNKOWO od `useThemeModeStore`:
 *   dark_scada       → markery `mv-dark-scada` + `data-ui-theme="dark-scada"`,
 *   light_technical  → markery `mv-light-technical` + `data-ui-theme="light-technical"`.
 * Sprawdzamy obie gałęzie, przełączanie store→wrapper oraz brak regresji montażu.
 */
import { screen, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { EnergyNetworkModel } from '../types/enm';
import { useSnapshotStore } from '../ui/topology/snapshotStore';
import { useThemeModeStore } from '../ui2/theme/themeMode';
// Karta FAB-J: `AppRoot` (pod `App`) czyta snapshot audytu 2 przez React Query —
// produkcja dostaje `QueryClientProvider` w `main.tsx`, test tego samego drzewa
// dostaje go tym samym helperem co testy kreatora DER.
import { renderWithQueryClient } from '../test/queryClientTestUtils';

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

describe('U4/TM1 — korzeń motywu (jeden sterownik)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.location.hash = '';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
    localStorage.clear();
    act(() => {
      useThemeModeStore.setState({ mode: 'dark_scada' });
      useSnapshotStore.setState({ snapshot: snapshotZRewizja(5) });
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    act(() => {
      useThemeModeStore.setState({ mode: 'dark_scada' });
      useSnapshotStore.setState({ snapshot: null });
    });
  });

  it('gałąź dark_scada — markery mv-dark-scada + data-ui-theme="dark-scada"', () => {
    const { container } = renderWithQueryClient(<App />);
    const korzen = container.querySelector('.mv-dark-scada');
    expect(korzen).not.toBeNull();
    expect(korzen?.getAttribute('data-ui-theme')).toBe('dark-scada');
    // Druga gałąź nie jest zamontowana jednocześnie (jeden wrapper = jeden motyw).
    expect(container.querySelector('.mv-light-technical')).toBeNull();
    // AppRoot montuje się bez regresji — jego korzeń (canonical-layout) jest
    // dzieckiem wrappera motywu.
    const powloka = screen.getByTestId('canonical-layout');
    expect(powloka).toBeTruthy();
    expect(korzen?.contains(powloka)).toBe(true);
  });

  it('gałąź light_technical — markery mv-light-technical + data-ui-theme="light-technical"', () => {
    act(() => {
      useThemeModeStore.setState({ mode: 'light_technical' });
    });
    const { container } = renderWithQueryClient(<App />);
    const korzen = container.querySelector('.mv-light-technical');
    expect(korzen).not.toBeNull();
    expect(korzen?.getAttribute('data-ui-theme')).toBe('light-technical');
    expect(container.querySelector('.mv-dark-scada')).toBeNull();
    const powloka = screen.getByTestId('canonical-layout');
    expect(korzen?.contains(powloka)).toBe(true);
  });

  it('zmiana store przełącza wrapper (jeden sterownik: store → wrapper)', () => {
    const { container } = renderWithQueryClient(<App />);
    expect(container.querySelector('.mv-dark-scada')).not.toBeNull();
    expect(container.querySelector('.mv-light-technical')).toBeNull();

    act(() => {
      useThemeModeStore.getState().toggle();
    });

    expect(container.querySelector('.mv-light-technical')).not.toBeNull();
    expect(container.querySelector('.mv-dark-scada')).toBeNull();
    expect(container.querySelector('.mv-light-technical')?.getAttribute('data-ui-theme')).toBe(
      'light-technical',
    );
  });
});
