/*
 * Testy jawnego przejścia E2→E3 (K4-E2, bramka #4): pasek „następnego kroku"
 * w przestrzeni „Schemat" widoczny WYŁĄCZNIE przy niepustym modelu; klik
 * nawiguję do przestrzeni „Gotowość" tą samą ścieżką co AppShell
 * (`przejdzDoPrzestrzeni`), czyszcząc trasę nadrzędną `#sld` — bez tego
 * `LegacyWarsztat` renderowałby dalej kanwę SLD zamiast PanelGotowosci.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import { NastepnyKrokSchematu } from '../NastepnyKrokSchematu';
import { SCHEMAT_STRINGS } from '../strings';

function snapshotZElementami(buses: Array<{ id: string; ref_id: string; name: string }>): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'projekt-testowy',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision: 1,
      hash_sha256: 'hash-1',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: buses.map((b) => ({ ...b, tags: [], meta: {} })),
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

describe('K4-E2 — NastepnyKrokSchematu (jawne przejście Schemat → Gotowość)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.location.hash = '';
    act(() => {
      useSnapshotStore.setState({ snapshot: null });
      useShellStore.setState({ activeSpace: 'schemat' });
    });
  });

  afterEach(() => {
    cleanup();
    act(() => {
      useSnapshotStore.setState({ snapshot: null });
    });
  });

  it('bez migawki modelu nie renderuje się (uczciwy stan zerowy — CTA GPZ ma pierwszeństwo)', () => {
    render(<NastepnyKrokSchematu />);
    expect(screen.queryByTestId('mvd-schemat-nastepny')).toBeNull();
  });

  it('przy pustym modelu (0 elementów) nie renderuje się', () => {
    act(() => {
      useSnapshotStore.setState({ snapshot: snapshotZElementami([]) });
    });
    render(<NastepnyKrokSchematu />);
    expect(screen.queryByTestId('mvd-schemat-nastepny')).toBeNull();
  });

  it('przy niepustym modelu pokazuje „Sprawdź gotowość obliczeniową"', () => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: snapshotZElementami([{ id: 'b1', ref_id: 'GPZ', name: 'GPZ' }]),
      });
    });
    render(<NastepnyKrokSchematu />);
    expect(screen.getByTestId('mvd-schemat-nastepny')).toBeInTheDocument();
    expect(screen.getByText(SCHEMAT_STRINGS.nastepnyKrokAkcja)).toBeInTheDocument();
  });

  it('klik przejścia aktywuje przestrzeń „Gotowość" i czyści trasę nadrzędną #sld', () => {
    window.location.hash = '#sld';
    act(() => {
      useSnapshotStore.setState({
        snapshot: snapshotZElementami([{ id: 'b1', ref_id: 'GPZ', name: 'GPZ' }]),
      });
    });
    render(<NastepnyKrokSchematu />);

    fireEvent.click(screen.getByTestId('mvd-schemat-nastepny-akcja'));

    expect(useShellStore.getState().activeSpace).toBe('gotowosc');
    // Trasa '#sld' nadpisuje zawartość przestrzeni w LegacyWarsztat — musi
    // zostać wyczyszczona, aby PanelGotowosci mógł się wyrenderować.
    expect(window.location.hash).toBe('');
  });

  it('klik przejścia bez trasy nadrzędnej nie zmienia trasy (deep-linki nietknięte)', () => {
    window.location.hash = '#analysis?run=abc';
    act(() => {
      useSnapshotStore.setState({
        snapshot: snapshotZElementami([{ id: 'b1', ref_id: 'GPZ', name: 'GPZ' }]),
      });
    });
    render(<NastepnyKrokSchematu />);

    fireEvent.click(screen.getByTestId('mvd-schemat-nastepny-akcja'));

    expect(useShellStore.getState().activeSpace).toBe('gotowosc');
    expect(window.location.hash).toBe('#analysis?run=abc');
  });
});
