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

import { useCallback, useMemo } from 'react';
import type { ReadinessInfo, FixAction as EnmFixAction } from '../../../../types/enm';
import type { FixAction, ReadinessIssue, ReadinessSeverity } from '../../../../ui/types';
import { useAppStateStore } from '../../../../ui/app-state/store';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';

/*
 * KD-1 (dług V12K-286): TEN moduł jest jedyną prawdą gotowości dla WSZYSTKICH
 * czytelników — nie tylko przestrzeni „Gotowość" i chromu powłoki (K6), lecz
 * także pasków i inspektorów budowy sieci (`ui/network-build`), paska
 * operacyjnego warsztatu (`ui/workspace`), panelu braków danych
 * (`ui/engineering-readiness/DataGapPanel`) i drzewa topologii
 * (`ui2/nav/adapters/topologyTreeAdapter`). Dawne drugie źródło
 * `ui/engineering-readiness/readinessLiveStore` USUNIĘTO: nikt nigdy nie wołał
 * jego `refresh`, więc każdy czytelnik dostawał pustą listę problemów i
 * `ready: true` z definicji (liczniki blokad w drzewie topologii były zawsze
 * zerowe, a paski deklarowały gotowość, której nikt nie policzył).
 */

// ---------------------------------------------------------------------------
// Stan przestrzeni
// ---------------------------------------------------------------------------

/**
 * Stan przestrzeni „Gotowość" (karta §3 + 5 stanów obowiązkowych —
 * MODEL_INTERAKCJI §2.4), rozszerzony o `nieustalona` (dług V12K-309 poz. 1).
 */
export type StanGotowosci =
  | 'brak-projektu'
  | 'ladowanie'
  | 'blad'
  | 'nieustalona'
  | 'wszystko-gotowe'
  | 'lista';

/**
 * JEDYNY predykat „gotowość jest ustalona" (reguła KLASA, NIE INSTANCJA pkt 3:
 * warunek wejścia i wyjścia z jednego źródła prawdy).
 *
 * `readiness === null` znaczy dokładnie „NIKT tego nie policzył" — odpowiedź
 * domenowa zawsze niesie `blockers`/`warnings` (choćby puste), więc brak obiektu
 * może pochodzić WYŁĄCZNIE z nieudanego odczytu gotowości
 * (`snapshotStore.refreshReadinessFromBackend` zostawia wtedy `null`, nigdy
 * wartości zmyślonej — patrz V12K-309/D5). Stan nieustalony NIE JEST gotowością:
 * każdy czytelnik, który mapuje go na werdykt pozytywny („Gotowe do analiz",
 * „brak uwag", `ready`), kłamie dokładnie wtedy, gdy nie wiadomo.
 */
export function czyGotowoscUstalona(readiness: ReadinessInfo | null): readiness is ReadinessInfo {
  return readiness !== null;
}

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
  const issue: ReadinessIssue = {
    code: wpis.code,
    severity,
    element_ref: wpis.element_ref,
    element_refs: wpis.element_ref ? [wpis.element_ref] : [],
    message_pl: wpis.message_pl,
    wizard_step_hint: null,
    suggested_fix: trafienie?.message_pl ?? null,
    fix_action: trafienie ? naFixActionUi(trafienie) : null,
  };
  // Treść kanoniczna (kod / poziom / priorytet / obszar) przepisywana WYŁĄCZNIE
  // wtedy, gdy backend ją przysłał. Pole niedostarczone zostaje niezdefiniowane
  // — brak priorytetu kanonicznego jest daną („kanon tego warunku nie szereguje"),
  // a nie luką do wypełnienia wartością zastępczą.
  if (wpis.canonical_code !== undefined) issue.canonical_code = wpis.canonical_code;
  if (wpis.canonical_level !== undefined) issue.canonical_level = wpis.canonical_level;
  if (wpis.canonical_priority !== undefined) issue.canonical_priority = wpis.canonical_priority;
  if (wpis.canonical_area !== undefined) issue.canonical_area = wpis.canonical_area;
  return issue;
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
  // DŁUG V12K-309 poz. 1 (naprawiony): dotąd `readiness === null` wpadało w tę
  // samą gałąź co „zero blokad i zero ostrzeżeń" i dawało `wszystko-gotowe` —
  // panel mówił „Gotowe do analiz" dokładnie wtedy, gdy odczyt gotowości padł.
  if (!czyGotowoscUstalona(readiness)) return 'nieustalona';
  const brakProblemow = readiness.blockers.length + readiness.warnings.length === 0;
  return brakProblemow ? 'wszystko-gotowe' : 'lista';
}

/**
 * Ponowienie odczytu gotowości BIEŻĄCEGO modelu — akcja stanu nieustalonego.
 *
 * Reużywa ISTNIEJĄCĄ akcję store'u `refreshReadinessFromBackend` (tę samą,
 * którą przy zimnym wejściu na link przebiegu woła `useLegacyOrchestrator`) —
 * adapter nie ma własnego `fetch` ani własnej kopii danych. To jedyne miejsce
 * w tym module, które sięga po akcję zapisującą do store'u; uzasadnienie jest
 * takie samo jak dla wyjątku w `ui2/events/adapters/caseAdapter.ts`: uczciwy
 * stan zerowy musi mieć wyjście, a jedynym wyjściem ze stanu „nie wiadomo" jest
 * ponowne zapytanie serwera.
 *
 * `null`, gdy nie ma o co pytać (brak przypadku w zasięgu) — panel nie rysuje
 * wtedy przycisku (zakaz kontrolek bez pokrycia w backendzie, phantom rule).
 * Źródło identyfikatora przypadku jest to samo, co w orkiestratorze:
 * migawka, a gdy jej nie ma — aktywny przypadek stanu aplikacji.
 */
export function usePonowOdczytGotowosci(): (() => void) | null {
  const caseIdMigawki = useSnapshotStore((s) => s.caseId);
  const caseIdAplikacji = useAppStateStore((s) => s.activeCaseId);
  const refreshReadinessFromBackend = useSnapshotStore((s) => s.refreshReadinessFromBackend);
  const caseId = caseIdMigawki ?? caseIdAplikacji;

  const ponow = useCallback(() => {
    if (!caseId) return;
    void refreshReadinessFromBackend(caseId);
  }, [caseId, refreshReadinessFromBackend]);

  return caseId ? ponow : null;
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
  /**
   * Gotowość została w ogóle policzona (`czyGotowoscUstalona`). `false` znaczy
   * „nie wiadomo" — liczby poniżej są wtedy BRAKIEM DANEJ, nie wynikiem zerowym,
   * i chrom nie ma prawa czytać ich jako „brak uwag" (dług V12K-309 poz. 1).
   */
  readonly ustalona: boolean;
  readonly blokady: number;
  readonly ostrzezenia: number;
}

/**
 * Czysta projekcja `ReadinessInfo` → liczby chromu. Bez migawki (brak projektu
 * albo migawka jeszcze nieodczytana) model NIE JEST zwalidowany — chrom nie ma
 * prawa deklarować gotowości, której nikt nie policzył (defekt H-6/R1: dawne
 * źródło `readinessLiveStore` miało `ready: true` w stanie początkowym i nigdy
 * nie było odświeżane, więc pasek zawsze pokazywał „Model: zwalidowany").
 * `ustalona` odróżnia „policzono: zero uwag" od „nie policzono" — bez tego pola
 * obie sytuacje wyglądały w chromie identycznie (0 blokad, 0 ostrzeżeń).
 */
export function podsumujGotowosc(readiness: ReadinessInfo | null): PodsumowanieGotowosci {
  if (!czyGotowoscUstalona(readiness)) {
    return { ready: false, ustalona: false, blokady: 0, ostrzezenia: 0 };
  }
  return {
    ready: readiness.ready,
    ustalona: true,
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

// ---------------------------------------------------------------------------
// Pełna projekcja gotowości dla pozostałych czytelników (KD-1 / V12K-286)
// ---------------------------------------------------------------------------

/** Status gotowości w konwencji pasków i paneli (`OK` / `WARN` / `FAIL`). */
export type StatusGotowosci = 'OK' | 'WARN' | 'FAIL';

/**
 * Kształt gotowości oczekiwany przez czytelników spoza przestrzeni „Gotowość"
 * (paski budowy sieci, pasek operacyjny, panel braków danych). Pola nazwane jak
 * w kontrakcie `ReadinessIssue`/`ReadinessSeverity` (`ui/types.ts`), żeby
 * przepięcie było podmianą źródła, a nie zmianą kontraktu prezentacji.
 */
export interface GotowoscModelu {
  readonly issues: ReadinessIssue[];
  readonly status: StatusGotowosci;
  readonly ready: boolean;
  readonly bySeverity: Record<ReadinessSeverity, number>;
  readonly loading: boolean;
  readonly error: string | null;
}

/**
 * Status z odpowiedzi domenowej: blokada ⇒ `FAIL`, samo ostrzeżenie ⇒ `WARN`,
 * brak problemów ⇒ `OK`. Bez migawki status jest `OK` przy `ready: false` —
 * „nic nie policzono" nie jest awarią (stan rozróżnia `ready`, patrz
 * `podsumujGotowosc`).
 *
 * DŁUG NAZWANY (ta sama klasa co V12K-309 poz. 1, NIEnaprawiony tutaj):
 * gotowość NIEUSTALONA (`czyGotowoscUstalona === false`) daje `OK` i zerowe
 * `liczbyWgWagi`, więc czytelnicy spoza przestrzeni „Gotowość" pokazują wtedy
 * stan pozytywny zamiast „nie wiadomo". Rozróżnienie wymaga nowej wartości
 * `StatusGotowosci`, a ta jest wyczerpująco mapowana w CZTERECH plikach
 * produkcyjnych innych torów (`ui/workspace/WorkspaceOperationalBar.tsx`,
 * `ui/engineering-readiness/DataGapPanel.tsx`, `ui/network-build/networkBuildStore.ts`,
 * `ui2/nav/adapters/topologyTreeAdapter.ts`) — zmiana bez ich edycji jest
 * niewykonalna, a edycja narusza rozłączność torów. Uczciwy sygnał jest już
 * dostępny w `podsumujGotowosc().ustalona`; wpięcie go u tych czytelników należy
 * do karty obejmującej ich pliki.
 */
export function statusGotowosci(readiness: ReadinessInfo | null): StatusGotowosci {
  if (!readiness) return 'OK';
  if (readiness.blockers.length > 0) return 'FAIL';
  if (readiness.warnings.length > 0) return 'WARN';
  return 'OK';
}

/** Liczby problemów wg wagi (INFO nie występuje w odpowiedzi domenowej). */
export function liczbyWgWagi(readiness: ReadinessInfo | null): Record<ReadinessSeverity, number> {
  return {
    BLOCKER: readiness?.blockers.length ?? 0,
    IMPORTANT: readiness?.warnings.length ?? 0,
    INFO: 0,
  };
}

/**
 * Jedna prawda gotowości dla czytelników spoza przestrzeni „Gotowość".
 * Źródło: `useSnapshotStore` (`readiness` + `fixActions` + `loading`/`error`) —
 * dokładnie to samo, z którego żyje panel gotowości i chrom powłoki.
 */
export function useGotowoscModelu(): GotowoscModelu {
  const readiness = useSnapshotStore((s) => s.readiness);
  const fixActions = useSnapshotStore((s) => s.fixActions);
  const loading = useSnapshotStore((s) => s.loading);
  const error = useSnapshotStore((s) => s.error);

  return useMemo(
    () => ({
      issues: polaczGotowosc(readiness, fixActions),
      status: statusGotowosci(readiness),
      ready: podsumujGotowosc(readiness).ready,
      bySeverity: liczbyWgWagi(readiness),
      loading,
      error,
    }),
    [readiness, fixActions, loading, error],
  );
}
