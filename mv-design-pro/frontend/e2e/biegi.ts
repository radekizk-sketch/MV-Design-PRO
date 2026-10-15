/**
 * Bieg w tle w specach e2e (karta DYNAMIKA-W-TLE).
 *
 * `POST …/execute` zleca bieg wykonawcy w tle (202, stan QUEUED) i wraca natychmiast;
 * wynik jest dostępny dopiero, gdy stan biegu (`GET /api/execution/runs/{id}`) dojdzie do
 * DONE/FAILED/CANCELLED. Spec, który po `execute` od razu czyta wynik albo asertuje
 * `status === 'DONE'` z odpowiedzi `execute`, ćwiczyłby ścieżkę, której produkt już nie ma.
 * Ten sam wzorzec, co pomocnicy backendu (`tests/utils/biegi.py`) — jedno miejsce
 * odpytywania dla wszystkich speców.
 */
import { expect, type APIRequestContext } from '@playwright/test';

export interface BiegHttp {
  readonly id: string;
  readonly status: string;
  readonly error_message?: string | null;
  readonly postep?: { wykonane: number; razem: number; jednostka: string; ulamek: number } | null;
}

const STANY_KONCOWE = new Set(['DONE', 'FAILED', 'CANCELLED']);
const STANY_KONCOWE_DOMENOWE = new Set(['FINISHED', 'FAILED', 'CANCELLED']);
const ODSTEP_MS = 250;

async function odpytuj<T extends { status: string }>(
  request: APIRequestContext,
  adres: string,
  stanyKoncowe: Set<string>,
  limitMs: number,
): Promise<T> {
  const termin = Date.now() + limitMs;
  for (;;) {
    const odpowiedz = await request.get(adres);
    expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
    const stan = (await odpowiedz.json()) as T;
    if (stanyKoncowe.has(stan.status)) return stan;
    expect(Date.now() < termin, `bieg ${adres} nie doszedł do stanu końcowego w ${limitMs} ms`).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, ODSTEP_MS));
  }
}

/** Odpytuj stan biegu wykonawczego do DONE/FAILED/CANCELLED; zwraca stan końcowy. */
export async function czekajNaKoniecBiegu(
  request: APIRequestContext,
  backendBase: string,
  runId: string,
  limitMs = 240000,
): Promise<BiegHttp> {
  return odpytuj<BiegHttp>(request, `${backendBase}/api/execution/runs/${runId}`, STANY_KONCOWE, limitMs);
}

/** Zleć bieg (202) i poczekaj na stan końcowy; asercja, że bieg zakończył się wynikiem (DONE). */
export async function wykonajBiegDoKonca(
  request: APIRequestContext,
  backendBase: string,
  runId: string,
  limitMs = 240000,
): Promise<BiegHttp> {
  const zlecenie = await request.post(`${backendBase}/api/execution/runs/${runId}/execute`, {
    timeout: 30000,
  });
  expect(zlecenie.ok(), await zlecenie.text()).toBeTruthy();
  const koniec = await czekajNaKoniecBiegu(request, backendBase, runId, limitMs);
  expect(koniec.status, koniec.error_message ?? '').toBe('DONE');
  return koniec;
}

/** Zleć bieg zabezpieczeń (202) i poczekaj na FINISHED/FAILED/CANCELLED. */
export async function wykonajBiegZabezpieczenDoKonca(
  request: APIRequestContext,
  backendBase: string,
  runId: string,
  limitMs = 240000,
): Promise<{ status: string; error_message?: string | null }> {
  const zlecenie = await request.post(`${backendBase}/api/protection-runs/${runId}/execute`, {
    timeout: 30000,
  });
  expect(zlecenie.ok(), await zlecenie.text()).toBeTruthy();
  return odpytuj(request, `${backendBase}/api/protection-runs/${runId}`, STANY_KONCOWE_DOMENOWE, limitMs);
}
