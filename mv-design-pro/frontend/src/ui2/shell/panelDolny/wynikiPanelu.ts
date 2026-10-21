/*
 * Źródło danych zakładek „Wyniki" i „Dowody" panelu dolnego (karta UI-02 PANEL-DOLNY).
 *
 * BIEGI. Lista zakończonych przebiegów aktywnego zakresu pochodzi z rejestru biegów
 * powłoki (`useExecutionRunsStore.runs`, hydratowany z
 * `GET /api/execution/study-cases/{id}/runs`) w porządku `uporzadkujPrzebiegi`
 * (najnowszy na górze — ta sama kolejność co zakładka „Przebiegi").
 *
 * WYNIK. Tabela czyta wynik WSKAZANEGO biegu po jego identyfikatorze
 * (`GET /api/execution/runs/{run_id}/results/v1`, `overlay_payload.elements`),
 * a nie magazyn nakładki schematu, który trzyma wynik innego, aktywnego biegu.
 * Wynik zakończonego biegu jest niezmienny, więc pamięć podręczna jest kluczowana
 * identyfikatorem biegu — licznik zakładki i jej treść czytają ten sam wpis.
 */
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';

import type { RawOverlayElement } from '../../../ui/sld-overlay/rawResultOverlayStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { uporzadkujPrzebiegi } from './ZakladkaPrzebiegi';

/** Wynik biegu w kształcie konsumowanym przez tabelę (pola z `results/v1`). */
export interface WynikBieguPanelu {
  readonly runId: string;
  readonly analysisType: string;
  readonly elementy: Readonly<Record<string, RawOverlayElement>>;
}

export type StanWynikuBiegu =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'gotowe'; readonly wynik: WynikBieguPanelu }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

async function odczytajBlad(odpowiedz: Response): Promise<string> {
  try {
    const dane = await odpowiedz.json();
    if (typeof dane?.detail === 'string' && dane.detail.trim()) return dane.detail;
  } catch {
    /* ciało bez JSON — zostaje kod HTTP */
  }
  return `HTTP ${odpowiedz.status}`;
}

/** `GET /api/execution/runs/{run_id}/results/v1` → elementy nakładki wyniku. */
export async function pobierzWynikBiegu(runId: string): Promise<WynikBieguPanelu> {
  const odpowiedz = await fetch(`/api/execution/runs/${encodeURIComponent(runId)}/results/v1`, {
    headers: { Accept: 'application/json' },
  });
  if (!odpowiedz.ok) throw new Error(await odczytajBlad(odpowiedz));
  const dane = await odpowiedz.json();
  const elementy = dane?.overlay_payload?.elements;
  if (!elementy || typeof elementy !== 'object' || Array.isArray(elementy)) {
    throw new Error('Serwer zwrócił wynik w nieoczekiwanym kształcie (brak elementów nakładki).');
  }
  return {
    runId,
    analysisType: String(dane?.analysis_type ?? ''),
    elementy: elementy as Record<string, RawOverlayElement>,
  };
}

interface WynikiPaneluState {
  /** Bieg wybrany ręcznie w zakładce „Wyniki"; `null` = najnowszy zakończony. */
  readonly wybranyRunId: string | null;
  readonly wyniki: Readonly<Record<string, StanWynikuBiegu>>;
  readonly wybierzBieg: (runId: string | null) => void;
  /** Idempotentne: bieg już wczytany albo wczytywany nie jest pobierany drugi raz. */
  readonly wczytaj: (runId: string) => void;
  /** Ponowienie po błędzie odczytu. */
  readonly ponow: (runId: string) => void;
}

export const useWynikiPaneluStore = create<WynikiPaneluState>((set, get) => {
  const pobierz = (runId: string) => {
    set((s) => ({ wyniki: { ...s.wyniki, [runId]: { rodzaj: 'ladowanie' } } }));
    pobierzWynikBiegu(runId)
      .then((wynik) => set((s) => ({ wyniki: { ...s.wyniki, [runId]: { rodzaj: 'gotowe', wynik } } })))
      .catch((blad: unknown) =>
        set((s) => ({
          wyniki: {
            ...s.wyniki,
            [runId]: {
              rodzaj: 'blad',
              komunikat: blad instanceof Error ? blad.message : 'Nie udało się pobrać wyniku przebiegu.',
            },
          },
        })),
      );
  };
  return {
    wybranyRunId: null,
    wyniki: {},
    wybierzBieg: (runId) => set({ wybranyRunId: runId }),
    wczytaj: (runId) => {
      if (get().wyniki[runId]) return;
      pobierz(runId);
    },
    ponow: (runId) => pobierz(runId),
  };
});

/** Zakończone przebiegi aktywnego zakresu, najnowszy na górze. */
export function biegiZakonczone(runs: readonly ExecutionRun[]): ExecutionRun[] {
  return uporzadkujPrzebiegi(runs.filter((run) => run.status === 'DONE'));
}

export function useBiegiZakonczone(): ExecutionRun[] {
  const runs = useExecutionRunsStore((s) => s.runs);
  return useMemo(() => biegiZakonczone(runs), [runs]);
}

export interface BiegWynikowPanelu {
  readonly biegi: readonly ExecutionRun[];
  /** Bieg, którego wynik pokazuje tabela (`null` = brak zakończonego biegu). */
  readonly bieg: ExecutionRun | null;
  readonly stan: StanWynikuBiegu | null;
}

/**
 * Bieg tabeli: wybrany ręcznie, jeśli nadal jest na liście zakończonych; inaczej
 * najnowszy zakończony. Wczytuje jego wynik (jedno pobranie na bieg).
 */
export function useBiegWynikowPanelu(): BiegWynikowPanelu {
  const biegi = useBiegiZakonczone();
  const wybranyRunId = useWynikiPaneluStore((s) => s.wybranyRunId);
  const bieg = biegi.find((run) => run.id === wybranyRunId) ?? biegi[0] ?? null;
  const stan = useWynikiPaneluStore((s) => (bieg ? s.wyniki[bieg.id] ?? null : null));
  const wczytaj = useWynikiPaneluStore((s) => s.wczytaj);
  const runId = bieg?.id ?? null;
  useEffect(() => {
    if (runId) wczytaj(runId);
  }, [runId, wczytaj]);
  return { biegi, bieg, stan };
}
