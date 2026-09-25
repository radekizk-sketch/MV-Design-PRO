/*
 * Dostawca danych ekranu „Stabilność dynamiczna" (E-32, karta P-3).
 * Realne endpointy backendu (api/analysis_runs.py) — zero nowych ścieżek:
 *  - `GET /api/analysis-runs/{id}/results/dynamic-stability` → echo scenariusza + ocena,
 *  - `GET /api/analysis-runs/{id}/results/automation-trace` → efekt topologii
 *    ZADEKLAROWANY w opcjach biegu (zdarzeń brak — zabezpieczenia niesymulowane).
 * Pobieranie do stanu lokalnego (cache per runId na życie ekranu); ślad automatyki
 * jest opcjonalny — jego brak sekcja komunikuje wprost (zero fabrykacji).
 */

import { useEffect, useState } from 'react';

import type {
  OdpowiedzPrzebieguStabilnosci,
  OdpowiedzSladuAutomatyki,
  OdpowiedzStabilnosci,
  WierszStabilnosci,
  EfektTopologii,
} from './model';

const API_BASE = '/api';

export async function fetchWynikStabilnosci(runId: string): Promise<OdpowiedzStabilnosci> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/dynamic-stability`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as OdpowiedzStabilnosci;
}

export async function fetchSladAutomatyki(runId: string): Promise<OdpowiedzSladuAutomatyki> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/automation-trace`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as OdpowiedzSladuAutomatyki;
}

export async function fetchPrzebiegStabilnosci(
  runId: string,
): Promise<OdpowiedzPrzebieguStabilnosci> {
  const response = await fetch(
    `${API_BASE}/analysis-runs/${runId}/results/dynamic-stability/time-series`,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as OdpowiedzPrzebieguStabilnosci;
}

export interface DaneStabilnosci {
  readonly stan: 'laduje' | 'blad' | 'gotowe';
  /** Wiersz echa scenariusza; null przy stanie 'gotowe' = przebieg bez wyniku (uczciwy brak). */
  readonly wiersz: WierszStabilnosci | null;
  /** Ślad automatyki pobrany (false = błąd pobierania — sekcja mówi to wprost). */
  readonly sladDostepny: boolean;
  /** Efekt topologii zadeklarowany w opcjach biegu; null = brak w odpowiedzi. */
  readonly efektTopologii: EfektTopologii | null;
}

const LADOWANIE: DaneStabilnosci = {
  stan: 'laduje',
  wiersz: null,
  sladDostepny: false,
  efektTopologii: null,
};

/**
 * Hook dostawcy: pobiera echo scenariusza + ślad automatyki przy zmianie runId
 * (cache per runId). `runId = null` → null (ekran pokazuje stan zerowy).
 */
export function useWynikStabilnosci(runId: string | null): DaneStabilnosci | null {
  const [cache, setCache] = useState<Record<string, DaneStabilnosci>>({});

  useEffect(() => {
    if (!runId || cache[runId]) return;
    let anulowane = false;
    void (async () => {
      const [wynik, slad] = await Promise.allSettled([
        fetchWynikStabilnosci(runId),
        fetchSladAutomatyki(runId),
      ]);
      if (anulowane) return;
      const dane: DaneStabilnosci =
        wynik.status === 'fulfilled'
          ? {
              stan: 'gotowe',
              wiersz: wynik.value.rows[0] ?? null,
              sladDostepny: slad.status === 'fulfilled',
              efektTopologii:
                slad.status === 'fulfilled' ? slad.value.topology_effect ?? null : null,
            }
          : { stan: 'blad', wiersz: null, sladDostepny: false, efektTopologii: null };
      setCache((c) => ({ ...c, [runId]: dane }));
    })();
    return () => {
      anulowane = true;
    };
  }, [runId, cache]);

  if (!runId) return null;
  return cache[runId] ?? LADOWANIE;
}

export interface DanePrzebiegu {
  readonly stan: 'laduje' | 'blad' | 'gotowe';
  /** Przebieg z backendu; null gdy jeszcze nie pobrany (stan 'laduje') lub błąd. */
  readonly przebieg: OdpowiedzPrzebieguStabilnosci | null;
}

/**
 * Hook przebiegu czasowego NA ŻĄDANIE (zgodnie z zasadą śladu na żądanie):
 * pobiera dopiero, gdy `aktywne=true` (klik „Pokaż przebieg"). Cache per runId
 * na życie ekranu; `runId=null` lub `aktywne=false` → null (nic nie pobiera).
 */
export function usePrzebiegStabilnosci(
  runId: string | null,
  aktywne: boolean,
): DanePrzebiegu | null {
  const [cache, setCache] = useState<Record<string, DanePrzebiegu>>({});

  useEffect(() => {
    if (!runId || !aktywne || cache[runId]) return;
    let anulowane = false;
    void (async () => {
      try {
        const przebieg = await fetchPrzebiegStabilnosci(runId);
        if (anulowane) return;
        setCache((c) => ({ ...c, [runId]: { stan: 'gotowe', przebieg } }));
      } catch {
        if (anulowane) return;
        setCache((c) => ({ ...c, [runId]: { stan: 'blad', przebieg: null } }));
      }
    })();
    return () => {
      anulowane = true;
    };
  }, [runId, aktywne, cache]);

  if (!runId || !aktywne) return null;
  return cache[runId] ?? { stan: 'laduje', przebieg: null };
}
