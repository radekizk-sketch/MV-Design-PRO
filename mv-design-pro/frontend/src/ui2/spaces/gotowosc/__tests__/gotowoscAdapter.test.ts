import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../../types/enm';
import {
  czyGotowoscUstalona,
  podsumujGotowosc,
  polaczGotowosc,
  useProblemyGotowosci,
  useStanGotowosci,
} from '../adapters/gotowoscAdapter';
import { enmFixActionFixture, readinessInfoFixture, readinessInfoZBlokadami } from './fixtures';

function snapshotFixture(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision: 1,
      hash_sha256: 'hash-1',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
  } as unknown as EnergyNetworkModel;
}

beforeEach(() => {
  useSnapshotStore.setState({
    snapshot: null,
    readiness: null,
    fixActions: [],
    loading: false,
    error: null,
  });
});

describe('polaczGotowosc — funkcja czysta', () => {
  it('readiness=null -> pusta lista', () => {
    expect(polaczGotowosc(null, [])).toEqual([]);
  });

  it('łączy blockers (BLOCKER) i warnings (IMPORTANT) w jedną listę, w tej kolejności', () => {
    const wynik = polaczGotowosc(readinessInfoZBlokadami(), []);
    expect(wynik.map((w) => w.severity)).toEqual(['BLOCKER', 'IMPORTANT']);
    expect(wynik[0]).toMatchObject({ code: 'source.grid_supply_missing', element_ref: 'GPZ-1' });
  });

  it('dowiązuje fix_action po code + element_ref, gdy kilka akcji dzieli kod', () => {
    const readiness = readinessInfoZBlokadami();
    const fixActions = [
      enmFixActionFixture({ code: 'source.grid_supply_missing', element_ref: 'INNY-ELEMENT' }),
      enmFixActionFixture({ code: 'source.grid_supply_missing', element_ref: 'GPZ-1', message_pl: 'Dopasowanie wg elementu.' }),
    ];
    const wynik = polaczGotowosc(readiness, fixActions);
    expect(wynik[0].fix_action?.element_ref).toBe('GPZ-1');
    expect(wynik[0].suggested_fix).toBe('Dopasowanie wg elementu.');
  });

  it('brak dopasowania fix_action po code -> fix_action null, suggested_fix null', () => {
    const wynik = polaczGotowosc(readinessInfoZBlokadami(), [
      enmFixActionFixture({ code: 'inny.kod' }),
    ]);
    expect(wynik[0].fix_action).toBeNull();
    expect(wynik[0].suggested_fix).toBeNull();
  });
});

describe('useStanGotowosci', () => {
  it('brak snapshotu, brak ładowania -> brak-projektu', () => {
    const { result } = renderHook(() => useStanGotowosci());
    expect(result.current).toBe('brak-projektu');
  });

  it('brak snapshotu + loading -> ladowanie', () => {
    useSnapshotStore.setState({ loading: true });
    const { result } = renderHook(() => useStanGotowosci());
    expect(result.current).toBe('ladowanie');
  });

  it('brak snapshotu + error -> blad', () => {
    useSnapshotStore.setState({ error: 'przykladowy błąd' });
    const { result } = renderHook(() => useStanGotowosci());
    expect(result.current).toBe('blad');
  });

  it('snapshot + readiness bez problemów -> wszystko-gotowe', () => {
    useSnapshotStore.setState({ snapshot: snapshotFixture(), readiness: readinessInfoFixture() });
    const { result } = renderHook(() => useStanGotowosci());
    expect(result.current).toBe('wszystko-gotowe');
  });

  it('snapshot + readiness z blokadami -> lista', () => {
    useSnapshotStore.setState({ snapshot: snapshotFixture(), readiness: readinessInfoZBlokadami() });
    const { result } = renderHook(() => useStanGotowosci());
    expect(result.current).toBe('lista');
  });

  it('snapshot + readiness=null -> nieustalona (NIE wszystko-gotowe) — V12K-309 poz. 1', () => {
    useSnapshotStore.setState({ snapshot: snapshotFixture(), readiness: null });
    const { result } = renderHook(() => useStanGotowosci());
    expect(result.current).toBe('nieustalona');
    expect(result.current).not.toBe('wszystko-gotowe');
  });

  it('ILOCZYN CECH: nieustalona gotowość × ładowanie/błąd — brak projektu wygrywa nad „nie wiadomo"', () => {
    // Bez migawki nie ma czego oceniać: to nadal brak-projektu/ladowanie/blad,
    // a nie „nieustalona" (inaczej pusty ekran startowy straszyłby awarią).
    useSnapshotStore.setState({ snapshot: null, readiness: null, loading: true });
    expect(renderHook(() => useStanGotowosci()).result.current).toBe('ladowanie');

    useSnapshotStore.setState({ snapshot: null, readiness: null, loading: false, error: 'awaria' });
    expect(renderHook(() => useStanGotowosci()).result.current).toBe('blad');

    // Z migawką i BEZ gotowości „nie wiadomo" wygrywa, także gdy store nie
    // pamięta już żadnego błędu (nieudany odczyt gotowości go nie zapisuje).
    useSnapshotStore.setState({
      snapshot: snapshotFixture(),
      readiness: null,
      loading: false,
      error: null,
    });
    expect(renderHook(() => useStanGotowosci()).result.current).toBe('nieustalona');
  });
});

describe('czyGotowoscUstalona — jedno źródło predykatu „wiadomo / nie wiadomo"', () => {
  it('null -> nieustalona; każda odpowiedź domenowa (także pusta) -> ustalona', () => {
    expect(czyGotowoscUstalona(null)).toBe(false);
    expect(czyGotowoscUstalona(readinessInfoFixture())).toBe(true);
    expect(czyGotowoscUstalona(readinessInfoZBlokadami())).toBe(true);
  });

  it('ten sam predykat rządzi stanem panelu i podsumowaniem chromu (bez dwóch warunków)', () => {
    // Predykaty parami: stan przestrzeni i liczby chromu MUSZĄ zgadzać się co do
    // tego, czy gotowość w ogóle policzono — inaczej panel i pasek się rozjadą.
    useSnapshotStore.setState({ snapshot: snapshotFixture(), readiness: null });
    expect(renderHook(() => useStanGotowosci()).result.current).toBe('nieustalona');
    expect(podsumujGotowosc(null).ustalona).toBe(false);

    useSnapshotStore.setState({ snapshot: snapshotFixture(), readiness: readinessInfoFixture() });
    expect(renderHook(() => useStanGotowosci()).result.current).toBe('wszystko-gotowe');
    expect(podsumujGotowosc(readinessInfoFixture()).ustalona).toBe(true);
  });
});

describe('useProblemyGotowosci', () => {
  it('odzwierciedla readiness + fixActions ze store\'u', () => {
    useSnapshotStore.setState({
      snapshot: snapshotFixture(),
      readiness: readinessInfoZBlokadami(),
      fixActions: [enmFixActionFixture()],
    });
    const { result } = renderHook(() => useProblemyGotowosci());
    expect(result.current).toHaveLength(2);
    expect(result.current[0].fix_action).not.toBeNull();
  });
});
