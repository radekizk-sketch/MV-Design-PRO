/**
 * JEDNA PRAWDA WSKAŹNIKÓW CHROMU (karta K6 / H-6, R1 + R3 + R4 + R5).
 *
 * Defekt bazowy (R1): chip „Model" i „Gotowość" czytały `readinessLiveStore`,
 * którego `refresh()` NIGDY nie był wołany w produkcji — stan początkowy
 * (`ready: true`, zerowe liczniki) sprawiał, że pasek zawsze deklarował
 * „Model: zwalidowany", nawet przy blokadach gotowości widocznych w przestrzeni
 * „Gotowość". Testy poniżej wiążą chrom z tym samym źródłem, co panel gotowości
 * (`useSnapshotStore.readiness`), i pilnują pozostałych rozstrzygnięć H-6.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import {
  etykietaPrzebiegu,
  ostatniZakonczonyPrzebieg,
  ostatniZakonczonyPrzebiegPrzypadku,
  useShellCaseInfo,
  useShellStatusInfo,
} from '../shellStatus';
import { SHELL_STRINGS, readinessLabel } from '../strings';
import { podsumujGotowosc } from '../../spaces/gotowosc/adapters/gotowoscAdapter';
import { useAppStateStore } from '../../../ui/app-state';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import type { ReadinessInfo } from '../../../types/enm';

const PROJEKT_ID = 'projekt-K6';

function readinessFixture(over: Partial<ReadinessInfo> = {}): ReadinessInfo {
  return {
    ready: false,
    blockers: [
      { code: 'brak.katalogu', message_pl: 'Brak typu katalogowego', element_ref: 'L-1', severity: 'BLOCKER' },
    ],
    warnings: [
      { code: 'brak.nastaw', message_pl: 'Brak nastaw zabezpieczenia', element_ref: 'Q-1', severity: 'IMPORTANT' },
      { code: 'brak.pomiaru', message_pl: 'Brak przekładnika', element_ref: 'Q-2', severity: 'IMPORTANT' },
    ],
    ...over,
  };
}

function runFixture(over: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: 'run-1',
    study_case_id: 'case-1',
    analysis_type: 'SC_3F',
    solver_input_hash: 'hash',
    status: 'DONE',
    started_at: '2026-07-30T10:00:00Z',
    finished_at: '2026-07-30T10:00:12Z',
    error_message: null,
    ...over,
  };
}

beforeEach(() => {
  useAppStateStore.setState({ activeProjectId: PROJEKT_ID, activeCaseId: null, activeCaseName: null });
  useSnapshotStore.setState({ snapshot: null, readiness: null, fixActions: [] } as never);
});

describe('podsumujGotowosc — projekcja gotowości dla chromu (R1)', () => {
  it('brak migawki → model NIEzwalidowany, liczniki zerowe i gotowość NIEUSTALONA', () => {
    // `ustalona: false` odróżnia „policzono: zero uwag" od „nie policzono" —
    // bez tego pola obie sytuacje dawały w chromie „Gotowość: brak uwag"
    // (dług V12K-309 poz. 1, ta sama klasa co panel „Gotowe do analiz").
    expect(podsumujGotowosc(null)).toEqual({
      ready: false,
      ustalona: false,
      blokady: 0,
      ostrzezenia: 0,
    });
  });

  it('gotowość z blokadami → ready=false + liczby wprost z odpowiedzi domenowej', () => {
    expect(podsumujGotowosc(readinessFixture())).toEqual({
      ready: false,
      ustalona: true,
      blokady: 1,
      ostrzezenia: 2,
    });
  });

  it('gotowość bez uwag → ready=true, ustalona=true (POLICZONE zero, nie brak danej)', () => {
    expect(podsumujGotowosc(readinessFixture({ ready: true, blockers: [], warnings: [] }))).toEqual({
      ready: true,
      ustalona: true,
      blokady: 0,
      ostrzezenia: 0,
    });
  });
});

describe('chip „Gotowość" nie ogłasza braku uwag, gdy gotowości nikt nie policzył', () => {
  it('gotowość NIEUSTALONA → etykieta kreski braku danej, nie „brak uwag"', () => {
    const { result } = renderHook(() => useShellCaseInfo());

    expect(result.current.readinessGotowoscUstalona).toBe(false);
    expect(readinessLabel(
      result.current.readinessWarnings,
      result.current.readinessBlockers,
      result.current.readinessGotowoscUstalona,
    )).toBe(`Gotowość: ${SHELL_STRINGS.emptyValue}`);
  });

  it('gotowość policzona bez uwag → „Gotowość: brak uwag" (werdykt ma pokrycie)', () => {
    useSnapshotStore.setState({
      readiness: readinessFixture({ ready: true, blockers: [], warnings: [] }),
    } as never);

    const { result } = renderHook(() => useShellCaseInfo());

    expect(result.current.readinessGotowoscUstalona).toBe(true);
    expect(readinessLabel(
      result.current.readinessWarnings,
      result.current.readinessBlockers,
      result.current.readinessGotowoscUstalona,
    )).toBe('Gotowość: brak uwag');
  });
});

describe('useShellCaseInfo — chrom czyta migawkę, nie martwy store gotowości (R1)', () => {
  it('blokady w migawce → „Model: w budowie" i liczniki chromu = liczniki migawki', () => {
    useSnapshotStore.setState({ readiness: readinessFixture() } as never);

    const { result } = renderHook(() => useShellCaseInfo());

    expect(result.current.modelValidated).toBe(false);
    expect(result.current.readinessBlockers).toBe(1);
    expect(result.current.readinessWarnings).toBe(2);
  });

  it('gotowość bez uwag → model zwalidowany (projekt obecny)', () => {
    useSnapshotStore.setState({
      readiness: readinessFixture({ ready: true, blockers: [], warnings: [] }),
    } as never);

    const { result } = renderHook(() => useShellCaseInfo());

    expect(result.current.modelValidated).toBe(true);
    expect(result.current.readinessBlockers).toBe(0);
  });

  it('brak migawki → model NIE jest ogłaszany jako zwalidowany (defekt R1)', () => {
    const { result } = renderHook(() => useShellCaseInfo());
    expect(result.current.modelValidated).toBe(false);
  });
});

describe('useShellStatusInfo — wersja modelu i rewizja (R4 + R5)', () => {
  it('„Wersja modelu" = hash_sha256 migawki (realne źródło, nie martwy odcisk)', () => {
    useSnapshotStore.setState({
      snapshot: { header: { hash_sha256: 'abc123def456' } },
    } as never);

    const { result } = renderHook(() => useShellStatusInfo());

    expect(result.current.wersjaModelu).toBe('abc123def456');
  });

  it('brak migawki → brak wersji modelu (bez zgadywania)', () => {
    const { result } = renderHook(() => useShellStatusInfo());
    expect(result.current.wersjaModelu).toBeNull();
  });

  it('rewizja modelu pochodzi WYŁĄCZNIE z powłoki (R5 — martwy fallback usunięty)', () => {
    // KD-1: dawne (martwe) źródło rewizji usunięte w całości — rewizję podaje
    // wyłącznie powłoka, więc bez podania nie ma czego pokazać.
    const bezPodania = renderHook(() => useShellStatusInfo());
    expect(bezPodania.result.current.modelRevision).toBeNull();

    const zPodaniem = renderHook(() => useShellStatusInfo({ modelRevision: 7 }));
    expect(zPodaniem.result.current.modelRevision).toBe(7);
  });
});

describe('etykieta ostatniego przebiegu (R3)', () => {
  it('brak zakończonych przebiegów → brak etykiety', () => {
    expect(ostatniZakonczonyPrzebieg([])).toBeNull();
    expect(ostatniZakonczonyPrzebieg([runFixture({ status: 'RUNNING' })])).toBeNull();
    expect(etykietaPrzebiegu(null)).toBeNull();
  });

  it('wybiera najpóźniej zakończony przebieg (deterministycznie)', () => {
    const wybrany = ostatniZakonczonyPrzebieg([
      runFixture({ id: 'run-a', finished_at: '2026-07-30T10:00:00Z' }),
      runFixture({ id: 'run-b', finished_at: '2026-07-30T12:30:00Z', analysis_type: 'LOAD_FLOW' }),
      runFixture({ id: 'run-c', status: 'FAILED', finished_at: '2026-07-30T23:00:00Z' }),
    ]);
    expect(wybrany?.id).toBe('run-b');
    expect(etykietaPrzebiegu(wybrany)).toBe('Rozpływ mocy · 2026-07-30 12:30');
  });

  it('remis znaczników rozstrzyga identyfikator (ta sama lista → ta sama etykieta)', () => {
    const lista = [
      runFixture({ id: 'run-a', finished_at: '2026-07-30T10:00:00Z' }),
      runFixture({ id: 'run-z', finished_at: '2026-07-30T10:00:00Z' }),
    ];
    expect(ostatniZakonczonyPrzebieg(lista)?.id).toBe('run-z');
    expect(ostatniZakonczonyPrzebieg([...lista].reverse())?.id).toBe('run-z');
  });
});

describe('rewizja wyniku bierze się z przebiegu WŁAŚCIWEGO przypadku (V12K-309 poz. 2)', () => {
  it('przebieg innego zakresu jest pomijany — cudza rewizja nie opisuje tego wyniku', () => {
    const lista = [
      runFixture({ id: 'run-obcy', study_case_id: 'case-INNY', finished_at: '2026-07-30T23:00:00Z' }),
      runFixture({ id: 'run-moj', study_case_id: 'case-1', finished_at: '2026-07-30T10:00:00Z' }),
    ];
    // Przebieg obcego zakresu jest PÓŹNIEJSZY — bez filtru wygrałby ranking.
    expect(ostatniZakonczonyPrzebieg(lista)?.id).toBe('run-obcy');
    expect(ostatniZakonczonyPrzebiegPrzypadku(lista, 'case-1')?.id).toBe('run-moj');
  });

  it('brak przypadku albo brak jego przebiegów → brak rewizji wyniku (bez zgadywania)', () => {
    const lista = [runFixture({ id: 'run-obcy', study_case_id: 'case-INNY' })];
    expect(ostatniZakonczonyPrzebiegPrzypadku(lista, null)).toBeNull();
    expect(ostatniZakonczonyPrzebiegPrzypadku(lista, 'case-1')).toBeNull();
    expect(ostatniZakonczonyPrzebiegPrzypadku([], 'case-1')).toBeNull();
  });

  it('niezakończony przebieg przypadku nie daje rewizji (wynik jeszcze nie istnieje)', () => {
    const lista = [runFixture({ id: 'run-w-toku', study_case_id: 'case-1', status: 'RUNNING' })];
    expect(ostatniZakonczonyPrzebiegPrzypadku(lista, 'case-1')).toBeNull();
  });
});
