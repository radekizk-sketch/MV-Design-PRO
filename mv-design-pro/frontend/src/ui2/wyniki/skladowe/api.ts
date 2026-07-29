/*
 * Dostawca danych ekranu „Składowe symetryczne i sieć zerowa" (E-29, karta P-3).
 *
 * REUŻYCIE read-only istniejących ścieżek API inspektora wyników
 * (`ui/results-inspector/api.ts` — zero nowych endpointów):
 *  - `fetchShortCircuitResults(runId)` → wiersze kanoniczne (bilans F1 + werdykt),
 *  - `fetchExtendedTrace(runId)` → ślad WHITE BOX (krok "Zk" ze składowymi Z1/Z2/Z0),
 *  - `fetchRunSnapshot(runId)` → ZAMROŻONA wersja układu (uziemienie punktu neutralnego).
 *
 * Celowo pobieramy do stanu LOKALNEGO modułu (cache per runId na życie ekranu),
 * a nie do współdzielonego `useResultsInspectorStore`: ekran może interpretować
 * INNY przebieg niż aktywny (najnowsze zakończone zwarcie niesymetryczne),
 * a nadpisanie stanu singletona przestawiłoby okno „Zwarcia" na inny przebieg.
 *
 * Stany uczciwe: wiersze kanoniczne są WYMAGANE (błąd → stan „blad");
 * ślad i wersja układu są opcjonalne — ich brak sekcje komunikują wprost
 * (zero fabrykacji, zero cichego pomijania).
 */

import { useEffect, useState } from 'react';

import {
  fetchExtendedTrace,
  fetchRunSnapshot,
  fetchShortCircuitResults,
} from '../../../ui/results-inspector/api';
import type {
  ExtendedTrace,
  ShortCircuitResults,
} from '../../../ui/results-inspector/types';
import type { EnergyNetworkModel } from '../../../types/enm';

export interface DaneSkladowych {
  readonly stan: 'laduje' | 'blad' | 'gotowe';
  readonly wynik: ShortCircuitResults | null;
  /** Ślad WHITE BOX przebiegu; null = niedostępny (sekcja składa uczciwy komunikat). */
  readonly slad: ExtendedTrace | null;
  /** Zamrożona wersja układu przebiegu; null = niedostępna (uczciwy komunikat). */
  readonly snapshotPrzebiegu: EnergyNetworkModel | null;
}

const LADOWANIE: DaneSkladowych = {
  stan: 'laduje',
  wynik: null,
  slad: null,
  snapshotPrzebiegu: null,
};

/**
 * Hook dostawcy: pobiera dane przebiegu przy zmianie runId (cache per runId
 * na życie ekranu — deterministyczny przebieg → deterministyczna odpowiedź).
 * `runId = null` → hook zwraca null (ekran pokazuje stan zerowy).
 */
export function useDaneSkladowych(runId: string | null): DaneSkladowych | null {
  const [cache, setCache] = useState<Record<string, DaneSkladowych>>({});

  useEffect(() => {
    if (!runId || cache[runId]) return;
    let anulowane = false;
    void (async () => {
      const [wynik, slad, snapshot] = await Promise.allSettled([
        fetchShortCircuitResults(runId),
        fetchExtendedTrace(runId),
        fetchRunSnapshot(runId),
      ]);
      if (anulowane) return;
      const dane: DaneSkladowych =
        wynik.status === 'fulfilled'
          ? {
              stan: 'gotowe',
              wynik: wynik.value,
              slad: slad.status === 'fulfilled' ? slad.value : null,
              snapshotPrzebiegu:
                snapshot.status === 'fulfilled' ? snapshot.value.snapshot : null,
            }
          : { stan: 'blad', wynik: null, slad: null, snapshotPrzebiegu: null };
      setCache((c) => ({ ...c, [runId]: dane }));
    })();
    return () => {
      anulowane = true;
    };
  }, [runId, cache]);

  if (!runId) return null;
  return cache[runId] ?? LADOWANIE;
}
