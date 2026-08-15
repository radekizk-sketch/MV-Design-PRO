/**
 * Testy hydratacji powłoki (karta K2, defekt H-0): po zimnym starcie persist
 * `useAppStateStore` niesie activeProjectId/activeCaseId, a stan zależny
 * (zakresy obliczeń, rejestr przebiegów, migawka po reconnect) musi zostać
 * odtworzony z serwera — z uczciwą walidacją 404 (czyszczenie stanu) i
 * odpornością na błąd sieci (stan NIE jest czyszczony).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useAppStateStore } from '../../../ui/app-state';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { hydratujPowloke, useHydratacjaPowloki } from '../useHydratacjaPowloki';
import type { BackendStatus } from '../shellStatus';

const PROJEKT_ID = 'projekt-0001';
const PRZYPADEK_ID = 'przypadek-0001';

const loadCases = vi.fn(async () => {});
const loadActiveCase = vi.fn(async () => {});
const setActiveStudyCaseId = vi.fn();
const refreshFromBackend = vi.fn(async () => null);

/** Fetch walidacyjny: mapa URL → status HTTP (brak wpisu ⇒ 200). */
function zamockujFetch(statusy: Record<string, number> = {}) {
  const spy = vi.fn(async (wejscie: RequestInfo | URL) => {
    const url = String(wejscie);
    const status = Object.entries(statusy).find(([fragment]) => url.includes(fragment))?.[1] ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStateStore.setState({ activeProjectId: null, activeCaseId: null, activeCaseName: null });
  // Wzorzec sąsiednich testów (useWpiecieWynikow.test.ts): akcje store'ów
  // zależnych podmieniane przez setState — hydratacja woła je przez getState().
  useStudyCasesStore.setState({ projectId: null, cases: [], activeCase: null, loadCases, loadActiveCase });
  useExecutionRunsStore.setState({ activeStudyCaseId: null, runs: [], setActiveStudyCaseId });
  useSnapshotStore.setState({ snapshot: null, loading: false, error: null, refreshFromBackend });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hydratujPowloke — ścieżka pełna', () => {
  it('projekt+przypadek w persist → loadCases + loadActiveCase + setActiveStudyCaseId', async () => {
    zamockujFetch();
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: PRZYPADEK_ID });

    await hydratujPowloke();

    expect(loadCases).toHaveBeenCalledWith(PROJEKT_ID);
    expect(loadActiveCase).toHaveBeenCalledWith(PROJEKT_ID);
    expect(setActiveStudyCaseId).toHaveBeenCalledWith(PRZYPADEK_ID);
    // Migawka: brak błędu ⇒ odtwarzanie należy do orkiestratora (reużycie), nie tu.
    expect(refreshFromBackend).not.toHaveBeenCalled();
  });

  it('projekt bez przypadku → tylko zakresy, bez rejestru przebiegów', async () => {
    zamockujFetch();
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: null });

    await hydratujPowloke();

    expect(loadCases).toHaveBeenCalledWith(PROJEKT_ID);
    expect(setActiveStudyCaseId).not.toHaveBeenCalled();
  });

  it('reconnect z zapamiętanym błędem migawki → refreshFromBackend(caseId)', async () => {
    zamockujFetch();
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: PRZYPADEK_ID });
    useSnapshotStore.setState({ snapshot: null, loading: false, error: 'Błąd sieci' });

    await hydratujPowloke({ wymus: true });

    expect(refreshFromBackend).toHaveBeenCalledWith(PRZYPADEK_ID);
  });
});

describe('hydratujPowloke — ścieżka bez projektu', () => {
  it('brak projektu w persist → zero wołań API i store\'ów', async () => {
    const fetchSpy = zamockujFetch();

    await hydratujPowloke();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loadCases).not.toHaveBeenCalled();
    expect(setActiveStudyCaseId).not.toHaveBeenCalled();
  });
});

describe('hydratujPowloke — uczciwa walidacja', () => {
  it('projekt 404 na serwerze → czyszczenie stanu, bez ładowań', async () => {
    zamockujFetch({ [`/api/projects/${PROJEKT_ID}`]: 404 });
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: PRZYPADEK_ID });

    await hydratujPowloke();

    expect(useAppStateStore.getState().activeProjectId).toBeNull();
    expect(useAppStateStore.getState().activeCaseId).toBeNull();
    expect(loadCases).not.toHaveBeenCalled();
    expect(setActiveStudyCaseId).not.toHaveBeenCalled();
  });

  it('przypadek 404 na serwerze → czyszczenie przypadku, zakresy załadowane', async () => {
    zamockujFetch({ [`/api/study-cases/${PRZYPADEK_ID}`]: 404 });
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: PRZYPADEK_ID });

    await hydratujPowloke();

    expect(useAppStateStore.getState().activeProjectId).toBe(PROJEKT_ID);
    expect(useAppStateStore.getState().activeCaseId).toBeNull();
    expect(loadCases).toHaveBeenCalledWith(PROJEKT_ID);
    expect(setActiveStudyCaseId).not.toHaveBeenCalled();
  });

  it('błąd sieci → stan NIE jest czyszczony i nic nie jest ładowane', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('sieć niedostępna'))));
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: PRZYPADEK_ID });

    await hydratujPowloke();

    expect(useAppStateStore.getState().activeProjectId).toBe(PROJEKT_ID);
    expect(useAppStateStore.getState().activeCaseId).toBe(PRZYPADEK_ID);
    expect(loadCases).not.toHaveBeenCalled();
    expect(setActiveStudyCaseId).not.toHaveBeenCalled();
  });

  it('5xx serwera → traktowane jak błąd sieci (stan nietknięty)', async () => {
    zamockujFetch({ [`/api/projects/${PROJEKT_ID}`]: 500 });
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: PRZYPADEK_ID });

    await hydratujPowloke();

    expect(useAppStateStore.getState().activeProjectId).toBe(PROJEKT_ID);
    expect(loadCases).not.toHaveBeenCalled();
  });
});

describe('hydratujPowloke — idempotencja (HMR/remount)', () => {
  it('store\'y już zhydratowane dla tego kontekstu → bez ponownych ładowań', async () => {
    zamockujFetch();
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: PRZYPADEK_ID });
    useStudyCasesStore.setState({ projectId: PROJEKT_ID });
    useExecutionRunsStore.setState({ activeStudyCaseId: PRZYPADEK_ID });

    await hydratujPowloke();

    expect(loadCases).not.toHaveBeenCalled();
    expect(loadActiveCase).not.toHaveBeenCalled();
    expect(setActiveStudyCaseId).not.toHaveBeenCalled();
  });

  it('wymuszenie (reconnect) pomija guardy idempotencji', async () => {
    zamockujFetch();
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: PRZYPADEK_ID });
    useStudyCasesStore.setState({ projectId: PROJEKT_ID });
    useExecutionRunsStore.setState({ activeStudyCaseId: PRZYPADEK_ID });

    await hydratujPowloke({ wymus: true });

    expect(loadCases).toHaveBeenCalledWith(PROJEKT_ID);
    expect(setActiveStudyCaseId).toHaveBeenCalledWith(PRZYPADEK_ID);
  });
});

describe('useHydratacjaPowloki — hook powłoki', () => {
  it('montaż z persystowanym kontekstem → hydratacja uruchomiona', async () => {
    zamockujFetch();
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: PRZYPADEK_ID });

    renderHook(() => useHydratacjaPowloki('connected'));

    await waitFor(() => expect(setActiveStudyCaseId).toHaveBeenCalledWith(PRZYPADEK_ID));
    expect(loadCases).toHaveBeenCalledWith(PROJEKT_ID);
  });

  it('reconnect (error → connected) ponawia hydratację wymuszenie', async () => {
    zamockujFetch();
    useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: PRZYPADEK_ID });
    // Store'y „już zhydratowane" — zwykła hydratacja nic by nie zrobiła;
    // reconnect musi wymusić ponowne ładowanie (stan mógł być niepełny).
    useStudyCasesStore.setState({ projectId: PROJEKT_ID });
    useExecutionRunsStore.setState({ activeStudyCaseId: PRZYPADEK_ID });

    const { rerender } = renderHook(
      ({ status }: { status: BackendStatus }) => useHydratacjaPowloki(status),
      { initialProps: { status: 'connected' as BackendStatus } },
    );
    await Promise.resolve();
    expect(loadCases).not.toHaveBeenCalled();

    rerender({ status: 'error' });
    rerender({ status: 'connected' });

    await waitFor(() => expect(loadCases).toHaveBeenCalledWith(PROJEKT_ID));
    expect(setActiveStudyCaseId).toHaveBeenCalledWith(PRZYPADEK_ID);
  });
});
