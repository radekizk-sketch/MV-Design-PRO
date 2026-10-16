/*
 * Klient API ekranu „Dynamika czasowa RMS" (karta AB-P1). Wyłącznie istniejące
 * końcówki backendu — zero nowej kolejki:
 *  - `GET  /api/dynamika/opis-scenariusza` — rodzaje zdarzeń, pola i nastawy z kontraktów,
 *  - `GET  /api/dynamika/study-cases/{case}/gotowosc` — gotowość, braki, modele źródeł,
 *    biegi rozpływu tej samej migawki,
 *  - `GET/POST /api/dynamika/study-cases/{case}/scenariusze` — scenariusze nazwane,
 *  - `POST /api/execution/study-cases/{case}/runs` (`DYNAMIKA_RMS`, `scenario_id`) +
 *    `POST /api/execution/runs/{id}/execute` (202 — bieg liczy się w tle, karta
 *    DYNAMIKA-W-TLE) + odpytywanie `GET /api/execution/runs/{id}` (stan i postęp) +
 *    `POST /api/execution/runs/{id}/cancel` (anulowanie między krokami całkowania),
 *  - `GET  /api/analysis-runs/{id}/results/dynamika[/time-series?kanaly=…]`.
 * Wiązanie modelu dynamicznego źródła idzie operacją domenową `set_der_catalog_bindings`
 * przez magazyn migawki (`useSnapshotStore.executeDomainOperation`) — nie przez ten plik.
 */

import {
  ODSTEP_ODPYTYWANIA_BIEGU_MS,
  cancelRun,
  createRun,
  executeRunAndWait,
} from '../../../ui/study-cases/api';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import type {
  BladPolaScenariusza,
  GotowoscDynamiki,
  HarmonogramDynamiki,
  OpisScenariusza,
  PrzebiegiDynamiki,
  ScenariuszDynamiki,
  WartoscZdarzenia,
  WynikDynamiki,
} from './model';

const API = '/api';

/** Błąd odpowiedzi z komunikatem backendu (pole `detail`). */
export class BladApiDynamiki extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bledyPol: readonly BladPolaScenariusza[] = [],
  ) {
    super(message);
    this.name = 'BladApiDynamiki';
  }
}

async function odczytaj<T>(odpowiedz: Response): Promise<T> {
  if (!odpowiedz.ok) {
    const tresc = (await odpowiedz.json().catch(() => ({}))) as { detail?: unknown };
    const detail = tresc.detail;
    if (Array.isArray(detail)) {
      const bledy = detail.filter(
        (b): b is BladPolaScenariusza =>
          typeof b === 'object' && b !== null && 'pole' in b && 'komunikat' in b,
      );
      throw new BladApiDynamiki(
        bledy.map((b) => b.komunikat).join('; ') || `HTTP ${odpowiedz.status}`,
        odpowiedz.status,
        bledy,
      );
    }
    throw new BladApiDynamiki(
      typeof detail === 'string' ? detail : `HTTP ${odpowiedz.status}`,
      odpowiedz.status,
    );
  }
  return (await odpowiedz.json()) as T;
}

export async function fetchOpisScenariusza(): Promise<OpisScenariusza> {
  return odczytaj(await fetch(`${API}/dynamika/opis-scenariusza`));
}

export async function fetchGotowoscDynamiki(caseId: string): Promise<GotowoscDynamiki> {
  return odczytaj(await fetch(`${API}/dynamika/study-cases/${encodeURIComponent(caseId)}/gotowosc`));
}

export async function fetchScenariuszeDynamiki(
  caseId: string,
): Promise<{ scenariusze: ScenariuszDynamiki[]; count: number }> {
  return odczytaj(
    await fetch(`${API}/dynamika/study-cases/${encodeURIComponent(caseId)}/scenariusze`),
  );
}

export async function zapiszScenariuszDynamiki(
  caseId: string,
  zadanie: { scenario_id?: string | null; name: string; dynamika: HarmonogramDynamiki },
): Promise<ScenariuszDynamiki> {
  return odczytaj(
    await fetch(`${API}/dynamika/study-cases/${encodeURIComponent(caseId)}/scenariusze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(zadanie),
    }),
  );
}

export async function fetchWynikDynamiki(runId: string): Promise<WynikDynamiki> {
  return odczytaj(await fetch(`${API}/analysis-runs/${encodeURIComponent(runId)}/results/dynamika`));
}

export async function fetchPrzebiegiDynamiki(
  runId: string,
  klucze: readonly string[],
): Promise<PrzebiegiDynamiki> {
  const zapytanie = encodeURIComponent(klucze.join(','));
  return odczytaj(
    await fetch(
      `${API}/analysis-runs/${encodeURIComponent(runId)}/results/dynamika/time-series?kanaly=${zapytanie}`,
    ),
  );
}

/** Odstęp odpytywania stanu biegu [ms] — wspólny dla całego frontu. */
export const ODSTEP_ODPYTYWANIA_MS = ODSTEP_ODPYTYWANIA_BIEGU_MS;

export interface ZadanieBiegu {
  readonly caseId: string;
  readonly scenarioId: string;
  readonly pfRunId: string;
  readonly nastawy: Record<string, WartoscZdarzenia>;
}

/**
 * Bieg `DYNAMIKA_RMS` istniejącą ścieżką wykonania (karta DYNAMIKA-W-TLE): utworzenie
 * (scenariusz nazwany + punkt pracy + nastawy), zlecenie wykonawcy w tle (202, stan
 * QUEUED — żądanie wraca natychmiast) i ODPYTYWANIE stanu `GET /api/execution/runs/{id}`
 * do DONE/FAILED/CANCELLED. Każdy odczyt stanu (kolejka, bieg w toku z postępem w
 * czasie symulacji, koniec) trafia do `poZmianieStanu`, więc ekran pokazuje pasek
 * postępu i może anulować bieg (`anulujBiegDynamiki`) między krokami całkowania.
 */
export async function uruchomBiegDynamiki(
  zadanie: ZadanieBiegu,
  poZmianieStanu: (bieg: ExecutionRun) => void,
  czekaj?: (ms: number) => Promise<void>,
): Promise<ExecutionRun> {
  const utworzony = await createRun(zadanie.caseId, {
    analysis_type: 'DYNAMIKA_RMS',
    solver_input: { pf_run_id: zadanie.pfRunId, nastawy_solvera: zadanie.nastawy },
    scenario_id: zadanie.scenarioId,
  });
  poZmianieStanu(utworzony);
  return executeRunAndWait(utworzony.id, { onStan: poZmianieStanu, czekaj });
}

/**
 * Anuluj bieg dynamiki: w kolejce — od razu CANCELLED; w toku — wykonawca przerywa go
 * po bieżącym kroku całkowania (odpowiedź niesie stan bieżący, odpytywanie trwające w
 * `uruchomBiegDynamiki` dojdzie do CANCELLED). Bieg zakończony → odmowa 409 z powodem.
 */
export async function anulujBiegDynamiki(runId: string): Promise<ExecutionRun> {
  try {
    return await cancelRun(runId);
  } catch (blad) {
    throw new BladApiDynamiki(blad instanceof Error ? blad.message : String(blad), 409);
  }
}
