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

import { useShellStatusInfo } from '../shellStatus';
import { STAN_WYBORU_PUSTY, etykietaBiegu, kontekstyRodzin } from '../../wyniki/kontekst/kontekstWyniku';
import { SHELL_STRINGS, readinessLabel } from '../strings';
import {
  podsumujGotowosc,
  usePodsumowanieGotowosci,
} from '../../spaces/gotowosc/adapters/gotowoscAdapter';
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

describe('pozycja „Gotowość" paska stanu nie ogłasza braku uwag, gdy gotowości nikt nie policzył', () => {
  // Po karcie K1 POWLOKA gotowość ma w chromie JEDNO miejsce: pasek stanu, zasilany
  // `usePodsumowanieGotowosci` (ta sama projekcja co przestrzeń „Gotowość"). Dawny
  // chip „Model: zwalidowany / w budowie" skasowano jako powtórzenie gotowości.
  it('gotowość NIEUSTALONA → etykieta kreski braku danej, nie „brak uwag"', () => {
    const { result } = renderHook(() => usePodsumowanieGotowosci());

    expect(result.current.ustalona).toBe(false);
    expect(result.current.ready).toBe(false);
    expect(readinessLabel(result.current.ostrzezenia, result.current.blokady, result.current.ustalona)).toBe(
      `Gotowość: ${SHELL_STRINGS.emptyValue}`,
    );
  });

  it('gotowość policzona bez uwag → „Gotowość: brak uwag" (werdykt ma pokrycie)', () => {
    useSnapshotStore.setState({
      readiness: readinessFixture({ ready: true, blockers: [], warnings: [] }),
    } as never);

    const { result } = renderHook(() => usePodsumowanieGotowosci());

    expect(result.current.ustalona).toBe(true);
    expect(readinessLabel(result.current.ostrzezenia, result.current.blokady, result.current.ustalona)).toBe(
      'Gotowość: brak uwag',
    );
  });

  it('blokady w migawce → liczby chromu = liczby migawki, nigdy „brak uwag" (R1)', () => {
    useSnapshotStore.setState({ readiness: readinessFixture() } as never);

    const { result } = renderHook(() => usePodsumowanieGotowosci());

    expect(result.current).toEqual({ ready: false, ustalona: true, blokady: 1, ostrzezenia: 2 });
    expect(readinessLabel(result.current.ostrzezenia, result.current.blokady, result.current.ustalona)).toBe(
      'Gotowość: 1 blokada',
    );
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

describe('etykieta biegu na pasku stanu (R3 → karta K8: aktywny bieg RODZINY, nie „ostatni zakończony")', () => {
  // Karta K8: pasek stanu pokazuje aktywny bieg każdej rodziny z magazynu kontekstu
  // wyniku (`kontekstyRodzin`); bez wyboru — najnowszy zakończony bieg rodziny. Intencja
  // R3 zostaje: polska etykieta rodzaju i czasu, determinizm przy remisie znaczników.
  it('brak zakończonych przebiegów → brak wpisów rodzin (bieg w toku nie jest wynikiem)', () => {
    expect(kontekstyRodzin([], STAN_WYBORU_PUSTY, null, null)).toEqual([]);
    expect(kontekstyRodzin([runFixture({ status: 'RUNNING' })], STAN_WYBORU_PUSTY, null, null)).toEqual([]);
  });

  it('bez wyboru: najpóźniej zakończony bieg rodziny (nieudany pomijany), etykieta po polsku', () => {
    const wpisy = kontekstyRodzin(
      [
        runFixture({ id: 'run-a', finished_at: '2026-07-30T10:00:00Z', analysis_type: 'LOAD_FLOW' }),
        runFixture({ id: 'run-b', finished_at: '2026-07-30T12:30:00Z', analysis_type: 'LOAD_FLOW' }),
        runFixture({ id: 'run-c', status: 'FAILED', finished_at: '2026-07-30T23:00:00Z', analysis_type: 'LOAD_FLOW' }),
      ],
      STAN_WYBORU_PUSTY,
      null,
      null,
    );
    expect(wpisy.map((w) => [w.rodzina, w.bieg.id])).toEqual([['rozplyw', 'run-b']]);
    expect(etykietaBiegu(wpisy[0].bieg)).toBe('Rozpływ mocy · 2026-07-30 12:30');
  });

  it('bieg oceny zabezpieczeń (PROTECTION z listingu biegów przypadku) ma polską nazwę, nie „undefined"', () => {
    // Karta BIEG-ZABEZPIECZEN-Z-MODELU: ekran koordynacji tworzy bieg `protection_sn`, który
    // listing biegów przypadku zwraca jako `PROTECTION` — pasek stanu pokazywał „Przebieg:
    // undefined · …" (zmierzone na żywym e2e).
    const etykieta = etykietaBiegu(
      runFixture({ analysis_type: 'PROTECTION', finished_at: '2026-07-30T12:30:00Z' }),
    );
    expect(etykieta).toBe('Ocena zabezpieczeń nadprądowych · 2026-07-30 12:30');
    expect(etykieta).not.toContain('undefined');
  });

  it('remis znaczników rozstrzyga identyfikator (ta sama lista → ten sam bieg, w obu kolejnościach)', () => {
    const lista = [
      runFixture({ id: 'run-a', finished_at: '2026-07-30T10:00:00Z' }),
      runFixture({ id: 'run-z', finished_at: '2026-07-30T10:00:00Z' }),
    ];
    expect(kontekstyRodzin(lista, STAN_WYBORU_PUSTY, null, null)[0].bieg.id).toBe('run-z');
    expect(kontekstyRodzin([...lista].reverse(), STAN_WYBORU_PUSTY, null, null)[0].bieg.id).toBe('run-z');
  });
});
