/*
 * Dostawca listy tabel wynikowych przebiegu (karta KD-4, luka L-15).
 *
 * „Tabela wiodaca" raportu (`focus_table`) to zamknieta lista kontraktu
 * backendu, ale KTORE tabele realnie istnieja zalezy od przebiegu. Zamiast
 * zgadywac mapowanie rodzaj analizy -> tabele, generator pyta o to backend:
 * `GET /api/analysis-runs/{run_id}/results/index` zwraca tabele TEGO przebiegu
 * wraz z polska etykieta i liczba wierszy. Brak odpowiedzi = brak listy
 * (uczciwy stan), a nie wymyslona lista.
 */

import { useEffect, useState } from 'react';

export interface TabelaWyniku {
  readonly table_id: string;
  readonly label_pl: string;
  readonly row_count: number;
}

interface OdpowiedzIndeksu {
  readonly tables?: readonly TabelaWyniku[];
}

export async function fetchTabeleWyniku(runId: string): Promise<readonly TabelaWyniku[]> {
  const response = await fetch(`/api/analysis-runs/${encodeURIComponent(runId)}/results/index`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as OdpowiedzIndeksu;
  return data.tables ?? [];
}

export interface DaneTabel {
  readonly stan: 'laduje' | 'blad' | 'gotowe';
  readonly tabele: readonly TabelaWyniku[];
}

const PUSTE: DaneTabel = { stan: 'gotowe', tabele: [] };

/** Pobiera tabele przebiegu (cache per runId na zycie ekranu). */
export function useTabeleWyniku(runId: string | null): DaneTabel {
  const [cache, setCache] = useState<Record<string, DaneTabel>>({});

  useEffect(() => {
    if (!runId || cache[runId]) return;
    let anulowane = false;
    void (async () => {
      try {
        const tabele = await fetchTabeleWyniku(runId);
        if (anulowane) return;
        setCache((c) => ({ ...c, [runId]: { stan: 'gotowe', tabele } }));
      } catch {
        if (anulowane) return;
        setCache((c) => ({ ...c, [runId]: { stan: 'blad', tabele: [] } }));
      }
    })();
    return () => {
      anulowane = true;
    };
  }, [runId, cache]);

  if (!runId) return PUSTE;
  return cache[runId] ?? { stan: 'laduje', tabele: [] };
}
