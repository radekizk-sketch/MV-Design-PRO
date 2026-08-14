/**
 * T2-WYNIKI (PLAN_SLD_NN_TOPOLOGIA_2026-08 §T2) — klient GET pętli
 * zwarcia/SWZ per stacja+obwód nN, dostawca WSPÓLNY dla:
 *  (a) odznaki SWZ na kanwie (`useSwzOverlay.ts` → `overlay.ts
 *      ::buildSwzOverlayFromResponses`),
 *  (b) sekcji Ik1_min/SWZ panelu wyników odpływu nN (`nnCircuitResults.ts`).
 *
 * `GET /{case_id}/enm/fault-loop-feeders` (karta P0.6, G-05) → enumeruje
 * WSZYSTKIE odpływy rozpoznane dla stacji (`feeder_root_branch_ref` =
 * `breaker_ref` dla `/enm/swz`, `worst_point_bus_ref` = `bus_ref` — punkt
 * NAJGORSZY, wymagany normatywnie do weryfikacji SWZ).
 * `GET /{case_id}/enm/swz` (karta P0.6, G-22) → werdykt 3-stanowy + dowód
 * liczbowy dla JEDNEGO obwodu (`station_ref`+`bus_ref`+`breaker_ref`).
 *
 * GRANICA: zero fizyki i zero arytmetyki tutaj — pobranie + sprawdzenie
 * kształtu odpowiedzi, WYŁĄCZNIE (wzorzec `sld-overlay/sldDeltaOverlay.api.ts`).
 */
import type { SwzApiResponse } from './overlay';

export interface FaultLoopFeederGroup {
  readonly feeder_root_branch_ref: string;
  readonly worst_point_bus_ref: string | null;
}

export interface FaultLoopFeedersResponse {
  readonly status: 'OK' | 'brak danych' | 'nie dotyczy';
  readonly station_ref: string;
  readonly feeders: readonly FaultLoopFeederGroup[];
}

function maKsztaltFeedersResponse(dane: unknown): dane is FaultLoopFeedersResponse {
  if (typeof dane !== 'object' || dane === null) return false;
  const d = dane as Record<string, unknown>;
  if (typeof d.status !== 'string' || typeof d.station_ref !== 'string') return false;
  if (!Array.isArray(d.feeders)) return false;
  return d.feeders.every((f) => {
    if (typeof f !== 'object' || f === null) return false;
    const g = f as Record<string, unknown>;
    return typeof g.feeder_root_branch_ref === 'string'
      && (g.worst_point_bus_ref === null || typeof g.worst_point_bus_ref === 'string');
  });
}

function maKsztaltSwzResponse(dane: unknown): dane is SwzApiResponse {
  if (typeof dane !== 'object' || dane === null) return false;
  const d = dane as Record<string, unknown>;
  if (typeof d.status !== 'string' || typeof d.breaker_ref !== 'string') return false;
  if (d.swz === undefined) return true;
  if (typeof d.swz !== 'object' || d.swz === null) return false;
  const swz = d.swz as Record<string, unknown>;
  return typeof swz.status === 'string' && typeof swz.przyczyna_pl === 'string' && typeof swz.ik1_min_a === 'number';
}

/**
 * Pętla zwarcia we WSZYSTKICH punktach nN stacji, pogrupowana per odpływ.
 * Rzuca `Error` (komunikat PL) na błąd sieci/kształtu — WOŁAJĄCY łapie i
 * traktuje jak brak danych (uczciwy stan, nie crash kanwy).
 */
export async function pobierzOdplywyPetliZwarcia(
  caseId: string,
  stationRef: string,
  signal?: AbortSignal,
): Promise<FaultLoopFeedersResponse> {
  const odpowiedz = await fetch(
    `/api/cases/${caseId}/enm/fault-loop-feeders?station_ref=${encodeURIComponent(stationRef)}`,
    { signal },
  );
  if (!odpowiedz.ok) {
    throw new Error(`Nie udało się pobrać odpływów pętli zwarcia (HTTP ${odpowiedz.status}).`);
  }
  const dane: unknown = await odpowiedz.json();
  if (!maKsztaltFeedersResponse(dane)) {
    throw new Error('Odpowiedź odpływów pętli zwarcia ma nieoczekiwany kształt — sprawdź wersję API.');
  }
  return dane;
}

/** Werdykt SWZ dla JEDNEGO obwodu (`station_ref`+`bus_ref`+`breaker_ref`). */
export async function pobierzSwz(
  caseId: string,
  stationRef: string,
  busRef: string,
  breakerRef: string,
  signal?: AbortSignal,
): Promise<SwzApiResponse> {
  const params = new URLSearchParams({ station_ref: stationRef, bus_ref: busRef, breaker_ref: breakerRef });
  const odpowiedz = await fetch(`/api/cases/${caseId}/enm/swz?${params.toString()}`, { signal });
  if (!odpowiedz.ok) {
    throw new Error(`Nie udało się pobrać SWZ dla obwodu (HTTP ${odpowiedz.status}).`);
  }
  const dane: unknown = await odpowiedz.json();
  if (!maKsztaltSwzResponse(dane)) {
    throw new Error('Odpowiedź SWZ ma nieoczekiwany kształt — sprawdź wersję API.');
  }
  return dane;
}

export interface VoltageProfileRowApi {
  readonly bus_id: string;
  readonly delta_pct: number | null;
}

interface VoltageProfileResponse {
  readonly rows: readonly VoltageProfileRowApi[];
}

function maKsztaltVoltageProfileResponse(dane: unknown): dane is VoltageProfileResponse {
  if (typeof dane !== 'object' || dane === null) return false;
  const d = dane as Record<string, unknown>;
  if (!Array.isArray(d.rows)) return false;
  return d.rows.every((r) => {
    if (typeof r !== 'object' || r === null) return false;
    const row = r as Record<string, unknown>;
    return typeof row.bus_id === 'string' && (row.delta_pct === null || typeof row.delta_pct === 'number');
  });
}

/**
 * Profil napięć przebiegu rozpływu mocy — zwraca WYŁĄCZNIE wiersz szyny
 * `busRef` (albo `undefined`, gdy szyna nie występuje w przebiegu — sieć
 * bez tej szyny w topologii przebiegu, uczciwy brak). `runId` MUSI być
 * przebiegiem `PF` (rozpływ mocy) — inny rodzaj przebiegu daje 422 z
 * backendu, mapowane tu na rzucony `Error`.
 */
export async function pobierzWierszProfiluNapiec(
  runId: string,
  busRef: string,
  signal?: AbortSignal,
): Promise<VoltageProfileRowApi | undefined> {
  const odpowiedz = await fetch(
    `/api/quality/voltage-profile?run_id=${encodeURIComponent(runId)}`,
    { signal },
  );
  if (!odpowiedz.ok) {
    throw new Error(`Nie udało się pobrać profilu napięć (HTTP ${odpowiedz.status}).`);
  }
  const dane: unknown = await odpowiedz.json();
  if (!maKsztaltVoltageProfileResponse(dane)) {
    throw new Error('Odpowiedź profilu napięć ma nieoczekiwany kształt — sprawdź wersję API.');
  }
  return dane.rows.find((row) => row.bus_id === busRef);
}
