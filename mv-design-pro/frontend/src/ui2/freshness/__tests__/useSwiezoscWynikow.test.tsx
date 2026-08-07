/**
 * Testy hooka useSwiezoscWynikow (E15.2).
 * Kryteria: docs/uiux/karty/U1_E15_2_SWIEZOSC.md §3.1 — reakcje na 3 typy zdarzeń,
 * unmount bez wycieku, determinizm.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import { useAppStateStore } from '../../../ui/app-state/store';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../types/enm';
import { emituj, magistrala } from '../../events/bus';
import type { TypZdarzenia, ZdarzenieMagistrali } from '../../events/types';

import { useSwiezoscWynikow } from '../useSwiezoscWynikow';

function snapshotZRewizja(revision: number): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision,
      hash_sha256: `hash-${revision}`,
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
  } as unknown as EnergyNetworkModel;
}

function liczbaSubskrybentow(typ: TypZdarzenia): number {
  return (magistrala as unknown as { obsluzniceTypu: Map<string, Set<unknown>> })[
    'obsluzniceTypu'
  ].get(typ)?.size ?? 0;
}

/** Emisja opakowana w `act` — obsluznik zdarzenia wywoluje `setState` hooka. */
function emitujAct(zdarzenie: ZdarzenieMagistrali): void {
  act(() => {
    emituj(zdarzenie);
  });
}

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useAppStateStore.getState().reset();
});

afterEach(() => {
  cleanup();
  useSnapshotStore.getState().reset();
  useAppStateStore.getState().reset();
});

describe("useSwiezoscWynikow — stan początkowy ze store'ów (§3.1)", () => {
  it("activeCaseResultStatus='NONE', brak snapshotu -> stan 'brak', rewizjaModelu=0", () => {
    const { result } = renderHook(() => useSwiezoscWynikow());
    expect(result.current).toEqual({ stan: 'brak', rewizjaModelu: 0 });
  });

  it("activeCaseResultStatus='FRESH' -> stan 'aktualne', rewizjaDanej = rewizjaModelu", () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(5), rewizjaBiezacegoModelu: 5 });
    useAppStateStore.setState({ activeCaseResultStatus: 'FRESH' });

    const { result } = renderHook(() => useSwiezoscWynikow());
    expect(result.current).toEqual({ stan: 'aktualne', rewizjaDanej: 5, rewizjaModelu: 5 });
  });

  it("activeCaseResultStatus='OUTDATED' -> stan 'nieaktualne', rewizjaDanej nieznana (brak zgadywania)", () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(9), rewizjaBiezacegoModelu: 9 });
    useAppStateStore.setState({ activeCaseResultStatus: 'OUTDATED' });

    const { result } = renderHook(() => useSwiezoscWynikow());
    expect(result.current).toEqual({
      stan: 'nieaktualne',
      rewizjaModelu: 9,
      przyczyna: 'model-zmieniony',
    });
    expect(result.current.rewizjaDanej).toBeUndefined();
  });
});

describe("useSwiezoscWynikow — reakcja na 'model-zmieniony' (§3.1)", () => {
  it("od 'aktualne' -> 'nieaktualne' z parą rewizji (a = poprzednia aktualna, b = rev ze zdarzenia)", () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(5), rewizjaBiezacegoModelu: 5 });
    useAppStateStore.setState({ activeCaseResultStatus: 'FRESH' });
    const { result } = renderHook(() => useSwiezoscWynikow());
    expect(result.current.stan).toBe('aktualne');

    emitujAct({ typ: 'model-zmieniony', rev: 6, zakres: ['bus-1'] });

    expect(result.current).toEqual({
      stan: 'nieaktualne',
      rewizjaDanej: 5,
      rewizjaModelu: 6,
      przyczyna: 'model-zmieniony',
    });
  });

  it("kolejna zmiana modelu bez przeliczenia -> rewizjaDanej pozostaje przypięta do ostatniej aktualnej rewizji, rewizjaModelu się przesuwa", () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(5), rewizjaBiezacegoModelu: 5 });
    useAppStateStore.setState({ activeCaseResultStatus: 'FRESH' });
    const { result } = renderHook(() => useSwiezoscWynikow());

    emitujAct({ typ: 'model-zmieniony', rev: 6, zakres: [] });
    emitujAct({ typ: 'model-zmieniony', rev: 7, zakres: [] });

    expect(result.current).toEqual({
      stan: 'nieaktualne',
      rewizjaDanej: 5,
      rewizjaModelu: 7,
      przyczyna: 'model-zmieniony',
    });
  });

  it("od stanu 'brak' -> pozostaje 'brak' (nie ma czego unieważniać), ale rewizjaModelu się aktualizuje", () => {
    const { result } = renderHook(() => useSwiezoscWynikow());
    expect(result.current.stan).toBe('brak');

    emitujAct({ typ: 'model-zmieniony', rev: 3, zakres: [] });

    expect(result.current).toEqual({ stan: 'brak', rewizjaModelu: 3 });
  });
});

describe("useSwiezoscWynikow — reakcja na 'wyniki-niewazne' (§3.1)", () => {
  it("od 'aktualne' -> 'nieaktualne' z tą samą semantyką co 'model-zmieniony'", () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(10), rewizjaBiezacegoModelu: 10 });
    useAppStateStore.setState({ activeCaseResultStatus: 'FRESH' });
    const { result } = renderHook(() => useSwiezoscWynikow());

    emitujAct({ typ: 'wyniki-niewazne', przyczyna: 'model-zmieniony', rev: 11 });

    expect(result.current).toEqual({
      stan: 'nieaktualne',
      rewizjaDanej: 10,
      rewizjaModelu: 11,
      przyczyna: 'model-zmieniony',
    });
  });
});

describe("useSwiezoscWynikow — reakcja na 'wyniki-gotowe' (§3.1)", () => {
  it("od 'nieaktualne' -> 'aktualne', rewizjaDanej = bieżąca rewizjaModelu", () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(20), rewizjaBiezacegoModelu: 20 });
    useAppStateStore.setState({ activeCaseResultStatus: 'OUTDATED' });
    const { result } = renderHook(() => useSwiezoscWynikow());
    expect(result.current.stan).toBe('nieaktualne');

    emitujAct({ typ: 'wyniki-gotowe', runId: 'run-1', przypadekId: 'case-1' });

    expect(result.current).toEqual({ stan: 'aktualne', rewizjaDanej: 20, rewizjaModelu: 20 });
  });

  it("cykl pełny: aktualne -> model-zmieniony -> nieaktualne -> wyniki-gotowe -> aktualne z nową rewizją", () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(1), rewizjaBiezacegoModelu: 1 });
    useAppStateStore.setState({ activeCaseResultStatus: 'FRESH' });
    const { result } = renderHook(() => useSwiezoscWynikow());

    emitujAct({ typ: 'model-zmieniony', rev: 2, zakres: ['bus-1'] });
    expect(result.current).toEqual({
      stan: 'nieaktualne',
      rewizjaDanej: 1,
      rewizjaModelu: 2,
      przyczyna: 'model-zmieniony',
    });

    emitujAct({ typ: 'wyniki-gotowe', runId: 'run-2', przypadekId: 'case-1' });
    expect(result.current).toEqual({ stan: 'aktualne', rewizjaDanej: 2, rewizjaModelu: 2 });
  });
});

describe('useSwiezoscWynikow — unmount bez wycieku (§3.1)', () => {
  it('odsubskrybowuje wszystkie 3 typy zdarzeń przy odmontowaniu', () => {
    const przed = {
      model: liczbaSubskrybentow('model-zmieniony'),
      niewazne: liczbaSubskrybentow('wyniki-niewazne'),
      gotowe: liczbaSubskrybentow('wyniki-gotowe'),
    };

    const { unmount } = renderHook(() => useSwiezoscWynikow());

    expect(liczbaSubskrybentow('model-zmieniony')).toBe(przed.model + 1);
    expect(liczbaSubskrybentow('wyniki-niewazne')).toBe(przed.niewazne + 1);
    expect(liczbaSubskrybentow('wyniki-gotowe')).toBe(przed.gotowe + 1);

    unmount();

    expect(liczbaSubskrybentow('model-zmieniony')).toBe(przed.model);
    expect(liczbaSubskrybentow('wyniki-niewazne')).toBe(przed.niewazne);
    expect(liczbaSubskrybentow('wyniki-gotowe')).toBe(przed.gotowe);
  });

  it('emisja zdarzenia po odmontowaniu nie zmienia już niczego (brak wycieku stanu)', () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(1), rewizjaBiezacegoModelu: 1 });
    useAppStateStore.setState({ activeCaseResultStatus: 'FRESH' });
    const { result, unmount } = renderHook(() => useSwiezoscWynikow());
    const stanPrzedOdmontowaniem = result.current;

    unmount();
    // Po odmontowaniu emisja jest no-op dla tego hooka (brak subskrybenta) —
    // emitujemy poza `act`, bo nie oczekujemy żadnego renderu do opakowania.
    emituj({ typ: 'model-zmieniony', rev: 99, zakres: [] });

    // Hook odmontowany — dalsze odczyty `result.current` nadal zwracają ostatni
    // wyrenderowany stan (React Testing Library), niezmieniony przez zdarzenie.
    expect(result.current).toEqual(stanPrzedOdmontowaniem);
  });
});

describe('useSwiezoscWynikow — determinizm (§3.1)', () => {
  it('dwie niezależne instancje hooka osiągają identyczny stan końcowy po tej samej sekwencji zdarzeń', () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(1), rewizjaBiezacegoModelu: 1 });
    useAppStateStore.setState({ activeCaseResultStatus: 'FRESH' });

    const pierwsza = renderHook(() => useSwiezoscWynikow());
    const druga = renderHook(() => useSwiezoscWynikow());

    emitujAct({ typ: 'model-zmieniony', rev: 2, zakres: ['bus-1'] });
    emitujAct({ typ: 'wyniki-gotowe', runId: 'run-1', przypadekId: 'case-1' });
    emitujAct({ typ: 'model-zmieniony', rev: 3, zakres: [] });

    expect(pierwsza.result.current).toEqual(druga.result.current);
    expect(pierwsza.result.current).toEqual({
      stan: 'nieaktualne',
      rewizjaDanej: 2,
      rewizjaModelu: 3,
      przyczyna: 'model-zmieniony',
    });
  });
});
