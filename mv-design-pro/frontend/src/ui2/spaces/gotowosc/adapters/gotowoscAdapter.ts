/*
 * Adapter przestrzeni „Gotowość" (W-401, karta E6.1) — czyta WYŁĄCZNIE
 * store'y read-only i mapuje je na `ReadinessIssue[]` (typ istniejący,
 * `ui/types.ts`) konsumowany przez `grupowanieCelow.ts`. Zero wołań API,
 * zero mutacji (Case Immutability Rule). Funkcje `mapuj*`/`polacz*` są czyste
 * (bez Reacta) i testowalne fixture'ami; hooki `use*` spinają je z Zustandem.
 *
 * Źródła danych (mapowanie plik:linia — karta §2):
 * - Gotowość + akcje naprawcze: `useSnapshotStore`
 *   (`ui/topology/snapshotStore.ts:249`), pola `readiness`
 *   (`ReadinessInfo` — `blockers`/`warnings`, `types/enm.ts:1243-1257`),
 *   `fixActions` (`FixAction[]`, `types/enm.ts:1259-1270`), `snapshot`
 *   (obecność = projekt otwarty), `loading`, `error`
 *   (`ui/topology/snapshotStore.ts:44-71`).
 * - Wybór store'u gotowości — WZORZEC E15.1: użyto `useSnapshotStore.readiness`
 *   (ta sama odpowiedź operacji domenowej co snapshot), a NIE osobnego
 *   `useReadinessLiveStore` (`ui/engineering-readiness/readinessLiveStore.ts`),
 *   z tym samym uzasadnieniem co już udokumentowane w
 *   `ui2/events/adapters/snapshotAdapter.ts:15-22`: `readinessLiveStore`
 *   wymaga własnego `fetch` inicjowanego przez wywołującego i może być
 *   niezsynchronizowany z bieżącą rewizją snapshotu w danym momencie;
 *   `useSnapshotStore.readiness` jest zawsze spójny ze `snapshot` (ten sam
 *   `DomainOpResponseV1`). Ten sam wzorzec zastosowano już w
 *   `ui2/legacy/LegacySurface.tsx` (funkcja `LegacyGotowosc`, most
 *   zastępowany przez tę kartę) — w odróżnieniu od mostu, TEN adapter
 *   dowiązuje realny `fix_action` z `useSnapshotStore.fixActions` do
 *   każdego problemu (most legacy renderuje `fix_action: null` na sztywno).
 *
 * Dowiązanie fix-action (istniejący mechanizm — karta §1: „istniejący
 * mechanizm fix_actions"): `FixAction[]` ze store'u niesie WŁASNE `code`, bez
 * powiązania obiektowego z konkretnym wpisem blockers/warnings — dopasowanie
 * po `code` (i `element_ref`, gdy kilka akcji dzieli kod dla różnych
 * elementów) jest jedynym dostępnym kluczem łączącym (bez zgadywania).
 */

import { useMemo } from 'react';
import type { ReadinessInfo, FixAction as EnmFixAction } from '../../../../types/enm';
import type { FixAction, ReadinessIssue, ReadinessSeverity } from '../../../../ui/types';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';

// ---------------------------------------------------------------------------
// Stan przestrzeni
// ---------------------------------------------------------------------------

/** Stan przestrzeni „Gotowość" (karta §3 + 5 stanów obowiązkowych — MODEL_INTERAKCJI §2.4). */
export type StanGotowosci = 'brak-projektu' | 'ladowanie' | 'blad' | 'wszystko-gotowe' | 'lista';

// ---------------------------------------------------------------------------
// Mapowania czyste (bez React)
// ---------------------------------------------------------------------------

type WpisGotowosci = ReadinessInfo['blockers'][number];

/** Znajduje kandydata `FixAction` ze store'u dla danego kodu (+ `element_ref`, gdy niejednoznaczne). */
function znajdzFixAction(
  code: string,
  elementRef: string | null,
  fixActions: EnmFixAction[],
): EnmFixAction | null {
  const kandydaci = fixActions.filter((fa) => fa.code === code);
  if (kandydaci.length === 0) return null;
  return (elementRef !== null && kandydaci.find((fa) => fa.element_ref === elementRef)) || kandydaci[0];
}

/** Rzutuje `FixAction` store'u (`types/enm.ts`) na `FixAction` UI (`ui/types.ts`) — pola wspólne. */
function naFixActionUi(trafienie: EnmFixAction): FixAction {
  return {
    action_type: trafienie.action_type,
    element_ref: trafienie.element_ref,
    modal_type: trafienie.modal_type ?? null,
    panel: trafienie.panel ?? null,
    step: trafienie.step ?? null,
    focus: trafienie.focus ?? null,
    payload_hint: trafienie.payload_hint ?? null,
    surface_descriptor: trafienie.surface_descriptor ?? null,
  };
}

function naReadinessIssue(
  wpis: WpisGotowosci,
  severity: ReadinessSeverity,
  fixActions: EnmFixAction[],
): ReadinessIssue {
  const trafienie = znajdzFixAction(wpis.code, wpis.element_ref, fixActions);
  return {
    code: wpis.code,
    severity,
    element_ref: wpis.element_ref,
    element_refs: wpis.element_ref ? [wpis.element_ref] : [],
    message_pl: wpis.message_pl,
    wizard_step_hint: null,
    suggested_fix: trafienie?.message_pl ?? null,
    fix_action: trafienie ? naFixActionUi(trafienie) : null,
  };
}

/**
 * Łączy `readiness.blockers`/`readiness.warnings` + `fixActions` w jedną
 * listę `ReadinessIssue[]` (kolejność deterministyczna: najpierw blokady, w
 * kolejności store'u, potem ostrzeżenia).
 */
export function polaczGotowosc(
  readiness: ReadinessInfo | null,
  fixActions: EnmFixAction[],
): ReadinessIssue[] {
  if (!readiness) return [];
  return [
    ...readiness.blockers.map((w) => naReadinessIssue(w, 'BLOCKER', fixActions)),
    ...readiness.warnings.map((w) => naReadinessIssue(w, 'IMPORTANT', fixActions)),
  ];
}

// ---------------------------------------------------------------------------
// Hooki read-only (spięcie ze store'em)
// ---------------------------------------------------------------------------

/** Stan przestrzeni: brak projektu / ładowanie / błąd / wszystko gotowe / lista. */
export function useStanGotowosci(): StanGotowosci {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const loading = useSnapshotStore((s) => s.loading);
  const error = useSnapshotStore((s) => s.error);
  const readiness = useSnapshotStore((s) => s.readiness);

  if (!snapshot) {
    if (loading) return 'ladowanie';
    if (error) return 'blad';
    return 'brak-projektu';
  }
  const brakProblemow = (readiness?.blockers.length ?? 0) + (readiness?.warnings.length ?? 0) === 0;
  return brakProblemow ? 'wszystko-gotowe' : 'lista';
}

/** Problemy gotowości (`ReadinessIssue[]`) — projekcja read-only ze store'u. */
export function useProblemyGotowosci(): ReadinessIssue[] {
  const readiness = useSnapshotStore((s) => s.readiness);
  const fixActions = useSnapshotStore((s) => s.fixActions);
  return useMemo(() => polaczGotowosc(readiness, fixActions), [readiness, fixActions]);
}

// ---------------------------------------------------------------------------
// Podsumowanie liczbowe gotowości — JEDNA prawda dla panelu i dla chromu (K6/H-6)
// ---------------------------------------------------------------------------

/** Liczby gotowości pokazywane w chromie powłoki (chipy „Model" i „Gotowość"). */
export interface PodsumowanieGotowosci {
  /** Model przeszedł walidację gotowości (pole `ready` odpowiedzi domenowej). */
  readonly ready: boolean;
  readonly blokady: number;
  readonly ostrzezenia: number;
}

/**
 * Czysta projekcja `ReadinessInfo` → liczby chromu. Bez migawki (brak projektu
 * albo migawka jeszcze nieodczytana) model NIE JEST zwalidowany — chrom nie ma
 * prawa deklarować gotowości, której nikt nie policzył (defekt H-6/R1: dawne
 * źródło `readinessLiveStore` miało `ready: true` w stanie początkowym i nigdy
 * nie było odświeżane, więc pasek zawsze pokazywał „Model: zwalidowany").
 */
export function podsumujGotowosc(readiness: ReadinessInfo | null): PodsumowanieGotowosci {
  if (!readiness) return { ready: false, blokady: 0, ostrzezenia: 0 };
  return {
    ready: readiness.ready,
    blokady: readiness.blockers.length,
    ostrzezenia: readiness.warnings.length,
  };
}

/**
 * Podsumowanie gotowości ze WSPÓLNEGO źródła (`useSnapshotStore.readiness`) —
 * tego samego, z którego żyje przestrzeń „Gotowość". Dzięki temu chip paska
 * przypadku i panel gotowości nie mogą się rozjechać.
 */
export function usePodsumowanieGotowosci(): PodsumowanieGotowosci {
  const readiness = useSnapshotStore((s) => s.readiness);
  return useMemo(() => podsumujGotowosc(readiness), [readiness]);
}
