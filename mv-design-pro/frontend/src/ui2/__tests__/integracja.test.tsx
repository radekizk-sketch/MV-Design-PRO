/**
 * Test integracyjny powłoki (karta E1.4 §4) — scenariusz SPEC_POWIAZANIA §7 w wersji powłoki:
 * klik w drzewie → zdarzenie `selekcja` (źródło: drzewo) → inspektor pokazuje obiekt;
 * zmiana rewizji modelu → pasek stanu aktualizuje się bez przeładowania.
 * Store'y produkcyjne sterowane setState (bez API); fetch /api/health zamockowany.
 */
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel, TopologyGraphSummary } from '../../types/enm';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { useTopologyStore } from '../../ui/topology/store';
import { AppRoot } from '../AppRoot';
import { subskrybuj, type ZdarzenieSelekcja } from '../events';
import { useShellStore } from '../shell/useShellStore';

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
  } as unknown as EnergyNetworkModel;
}

function summaryZGpz(): TopologyGraphSummary {
  return {
    case_id: 'case-1',
    enm_revision: 5,
    bus_count: 1,
    branch_count: 0,
    transformer_count: 0,
    source_count: 1,
    load_count: 0,
    generator_count: 0,
    measurement_count: 0,
    protection_count: 0,
    is_radial: true,
    has_cycles: false,
    adjacency: [],
    spine: [{ bus_ref: 'GPZ', depth: 0, is_source: true, children_refs: [] }],
    lateral_roots: [],
  };
}

describe('E1.4 — integracja powłoki (shell + nav + inspector + events)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true } as Response),
    );
    act(() => {
      useSnapshotStore.setState({ snapshot: snapshotZRewizja(5) });
      useTopologyStore.setState({ summary: summaryZGpz() });
      useShellStore.setState({ activeSpace: 'model' });
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    act(() => {
      useSnapshotStore.setState({ snapshot: null });
      useTopologyStore.setState({ summary: null });
    });
  });

  it('klik w drzewie emituje selekcję ze źródłem okna i wypełnia inspektor obiektem ze snapshotu', () => {
    const odebrane: ZdarzenieSelekcja[] = [];
    const stop = subskrybuj('selekcja', (z) => odebrane.push(z));
    render(<AppRoot />);

    // Grupy startują zwinięte — rozwiń „Magistrala (od GPZ)" chevronem, potem kliknij węzeł.
    fireEvent.click(screen.getByTestId('mvd-tree-chevron-magistrala'));
    const wezel = screen.getByText('GPZ');
    fireEvent.click(wezel);

    expect(odebrane.some((z) => z.obiektId === 'GPZ' && z.zrodlo === 'drzewo-kontekstowe')).toBe(true);
    // Inspektor pokazuje nazwę obiektu ze snapshotu (adapter po ref_id) —
    // nagłówek inspektora + wiersz „Nazwa" w sekcji Podstawowe.
    expect(screen.getAllByText('GPZ Przykładowo').length).toBeGreaterThanOrEqual(1);
    stop();
  });

  it('zmiana rewizji modelu aktualizuje pasek stanu bez przeładowania', () => {
    render(<AppRoot />);
    expect(screen.getByText('Model: rew. 5')).toBeTruthy();
    act(() => {
      useSnapshotStore.setState({ snapshot: snapshotZRewizja(6) });
    });
    expect(screen.getByText('Model: rew. 6')).toBeTruthy();
  });

  it('selektor trybów drzewa jest ukryty w U1 (decyzja E1.4 §2.2 — zero martwego UI)', () => {
    render(<AppRoot />);
    expect(screen.queryByTestId('mvd-tree-mode')).toBeNull();
  });

  it('przestrzeń „Projekt" renderuje pulpit projektu (E2.1) w warsztacie', () => {
    act(() => {
      useShellStore.setState({ activeSpace: 'projekt' });
    });
    render(<AppRoot />);
    expect(screen.getByText('Pulpit projektu')).toBeTruthy();
    expect(screen.getByText('Przypadki obliczeniowe')).toBeTruthy();
  });

  it('Ctrl+K otwiera pełną wyszukiwarkę poleceń (E1.5) zamiast szkieletu', () => {
    render(<AppRoot />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByPlaceholderText('Szukaj poleceń, obiektów, okien…')).toBeTruthy();
    expect(screen.queryByTestId('mvd-search-scrim')).toBeNull();
  });

  it('drzewo kontekstowe jest ukryte przy zwiniętym lewym panelu (listwa ikon)', () => {
    render(<AppRoot />);
    expect(screen.getByTestId('mvd-left-context')).toBeTruthy();
    act(() => {
      useShellStore.getState().toggleLeftCollapsed('model');
    });
    expect(screen.queryByTestId('mvd-left-context')).toBeNull();
  });
});
