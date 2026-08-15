/*
 * Adapter okna „Serie przebiegów" (przestrzeń „Obliczenia", karta BATCH-ROUTER).
 * Czyta trzy ISTNIEJĄCE store'y (read-only) i mapuje je na model widoku:
 * - `useBatchRunsStore` — serie przypadku (lista, ładowanie, błąd),
 * - `useFaultScenariosStore` — scenariusze do zaznaczenia (TEN SAM store,
 *   który zasila `PanelScenariuszy` — jedno źródło prawdy o scenariuszach),
 * - `useExecutionRunsStore` — statusy biegów serii (run_ids serii to zwykłe
 *   biegi kanoniczne; status czytamy z JEDNEGO źródła biegów, NIE liczymy go
 *   tutaj — reguła S9-11 „nie licz stanu osobno").
 *
 * PREDYKATY PARAMI: stan okna (`brak-przypadku`/`ladowanie`/`blad`/`lista`)
 * pochodzi z JEDNEGO werdyktu nad polami store'u serii (wzorzec
 * `useStanPrzebiegow`); status biegu w wierszu serii pochodzi wyłącznie
 * z rekordu biegu w `runStore` — brak rekordu = uczciwe „brak danych biegu",
 * nigdy zgadywany status. Zero fizyki, zero mutacji NetworkModelu.
 */

import type { BatchJob, ExecutionRun } from '../../../../../ui/study-cases/types';
import { useBatchRunsStore } from '../../../../../ui/study-cases/batchStore';
import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import { useFaultScenariosStore } from '../../../../../ui/fault-scenarios/store';
import type { FaultScenario } from '../../../../../ui/fault-scenarios/types';
import { FAULT_TYPE_LABELS } from '../../../../../ui/fault-scenarios/types';
import { etykietaAnalizy, formatCzas, formatOdcisk } from '../../przebiegi/strings';
import { etykietaStatusuSerii } from '../strings';

// ---------------------------------------------------------------------------
// Modele widoku (projekcja read-only)
// ---------------------------------------------------------------------------

/** Stan okna — jeden werdykt, predykaty parami (wzorzec `useStanPrzebiegow`). */
export type StanSerii = 'brak-przypadku' | 'ladowanie' | 'blad' | 'lista';

/** Scenariusz do zaznaczenia w formularzu nowej serii. */
export interface ScenariuszDoSerii {
  id: string;
  nazwa: string;
  rodzajEtykieta: string;
  miejsce: string;
}

/** Bieg serii — status czytany z JEDNEGO źródła biegów (`runStore`). */
export interface BiegSerii {
  runId: string;
  /** Rekord biegu z `runStore`; null = bieg spoza załadowanej listy. */
  bieg: ExecutionRun | null;
}

/** Wiersz listy serii — projekcja `BatchJob` na etykiety PL. */
export interface SeriaWiersz {
  id: string;
  utworzona: string;
  rodzajEtykieta: string;
  liczbaScenariuszy: number;
  status: BatchJob['status'];
  statusEtykieta: string;
  odcisk: string;
  bledy: string[];
  biegi: BiegSerii[];
}

// ---------------------------------------------------------------------------
// Mapowania czyste (bez React)
// ---------------------------------------------------------------------------

/** Mapuje scenariusze store'u na pozycje wyboru serii (kolejność ze store'u). */
export function mapujScenariusze(scenarios: FaultScenario[]): ScenariuszDoSerii[] {
  return scenarios.map((s) => ({
    id: s.scenario_id,
    nazwa: s.name,
    rodzajEtykieta: FAULT_TYPE_LABELS[s.fault_type] ?? s.fault_type,
    miejsce: s.location.element_ref,
  }));
}

/** Mapuje serie na wiersze widoku; statusy biegów z listy biegów przypadku. */
export function mapujSerie(batches: BatchJob[], runs: ExecutionRun[]): SeriaWiersz[] {
  const biegPoId = new Map(runs.map((r) => [r.id, r]));
  return batches.map((b) => ({
    id: b.batch_id,
    utworzona: formatCzas(b.created_at),
    rodzajEtykieta: etykietaAnalizy(b.analysis_type),
    liczbaScenariuszy: b.scenario_ids.length,
    status: b.status,
    statusEtykieta: etykietaStatusuSerii(b.status),
    odcisk: formatOdcisk(b.batch_input_hash),
    bledy: b.errors,
    biegi: b.run_ids.map((runId) => ({ runId, bieg: biegPoId.get(runId) ?? null })),
  }));
}

// ---------------------------------------------------------------------------
// Hooki read-only (spięcie ze store'ami)
// ---------------------------------------------------------------------------

/**
 * Stan okna: brak przypadku → gdy `activeStudyCaseId` store'u serii
 * nieustawiony; ładowanie/błąd → WYŁĄCZNIE przy pustej liście (pierwsze
 * pobranie); inaczej lista (odświeżenie bez remountu — wzorzec przebiegów).
 */
export function useStanSerii(): StanSerii {
  const przypadekId = useBatchRunsStore((s) => s.activeStudyCaseId);
  const ladowanie = useBatchRunsStore((s) => s.isLoading);
  // Wyłącznie błąd POBRANIA listy — błąd akcji (utworzenie/wykonanie serii)
  // jest pokazywany inline i nie przełącza stanu całego okna (predykaty parami).
  const blad = useBatchRunsStore((s) => s.listError);
  const pusto = useBatchRunsStore((s) => s.batches.length === 0);
  if (!przypadekId) return 'brak-przypadku';
  if (ladowanie && pusto) return 'ladowanie';
  if (blad && pusto) return 'blad';
  return 'lista';
}

/** Wiersze serii aktywnego przypadku (statusy biegów z `runStore`). */
export function useWierszeSerii(): SeriaWiersz[] {
  const batches = useBatchRunsStore((s) => s.batches);
  const runs = useExecutionRunsStore((s) => s.runs);
  return mapujSerie(batches, runs);
}

/** Scenariusze aktywnego przypadku do zaznaczenia w nowej serii. */
export function useScenariuszeDoSerii(): ScenariuszDoSerii[] {
  const scenarios = useFaultScenariosStore((s) => s.scenarios);
  return mapujScenariusze(scenarios);
}
