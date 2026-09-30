/*
 * Pełna historia biegów WSZYSTKICH przypadków projektu (KARTA-UI2 §1 p. 10) —
 * konsumowana przez `ui2/nav/adapters/runsTreeAdapter.ts` (drzewo przebiegów
 * WSZYSTKICH przypadków, nie tylko aktywnego) i `ui2/spaces/projekt/
 * pulpitAdapter.ts` (kolumna „Ostatni przebieg" per wiersz przypadku).
 *
 * ŹRÓDŁO: pętla po ISTNIEJĄCYM, per-przypadkowym `GET /api/execution/
 * study-cases/{case_id}/runs` (`listRuns`, `ui/study-cases/api.ts:244`) — dla
 * KAŻDEGO przypadku z `useSortedCases()`. Backend nie ma dziś JEDNEGO
 * zapytania „wszystkie biegi projektu z filtrem study_case_id" (poza per-
 * przypadkowym), więc N wywołań zamiast jednego jest świadomym kompromisem
 * wydajnościowym — akceptowalnym dla widoku historii (odświeżany przy zmianie
 * listy przypadków/zdarzeniu magistrali „wyniki-gotowe", NIE w pętli
 * odpytywania) i mniejszym ryzykiem niż zmiana kontraktu `canonical_run_views.py`
 * (własność sub-karty równoległej KARTA-UI2 — poza plikami tej karty).
 *
 * `useExecutionRunsStore.runs` NIE jest tu źródłem — ten store trzyma
 * WYŁĄCZNIE aktywny przypadek (`activeStudyCaseId`, patrz `runsTreeAdapter.ts`
 * i `przebiegiAdapter.ts` — ograniczenie udokumentowane, NIE luka).
 */

import { useEffect, useState } from 'react';

import { listRuns } from '../../ui/study-cases/api';
import { useSortedCases } from '../../ui/study-cases/store';
import type { ExecutionRun } from '../../ui/study-cases/types';
import { useBusEvent } from '../events';

export interface StanWszystkichPrzebiegow {
  runs: ExecutionRun[];
  ladowanie: boolean;
  blad: string | null;
}

const PUSTY_STAN: StanWszystkichPrzebiegow = { runs: [], ladowanie: false, blad: null };

/**
 * Hook: biegi wszystkich przypadków projektu. Odświeża przy zmianie zbioru
 * przypadków (klucz = złączone id, stabilny) i przy `wyniki-gotowe` (nowy bieg
 * może dotyczyć DOWOLNEGO przypadku, nie tylko aktywnego — inaczej niż
 * `przebiegiAdapter.useOdswiezaniePrzebiegow`, które celowo filtruje do
 * aktywnego).
 */
export function useWszystkiePrzebiegiProjektu(): StanWszystkichPrzebiegow {
  const cases = useSortedCases();
  const kluczPrzypadkow = cases.map((c) => c.id).join('|');
  const [stan, setStan] = useState<StanWszystkichPrzebiegow>(PUSTY_STAN);

  useEffect(() => {
    const ids = kluczPrzypadkow ? kluczPrzypadkow.split('|') : [];
    if (ids.length === 0) {
      setStan(PUSTY_STAN);
      return;
    }
    let anulowane = false;
    setStan((poprzedni) => ({ ...poprzedni, ladowanie: true, blad: null }));
    Promise.all(ids.map((id) => listRuns(id)))
      .then((wyniki) => {
        if (anulowane) return;
        setStan({ runs: wyniki.flatMap((w) => w.runs), ladowanie: false, blad: null });
      })
      .catch((err) => {
        if (anulowane) return;
        setStan({
          runs: [],
          ladowanie: false,
          blad: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      anulowane = true;
    };
  }, [kluczPrzypadkow]);

  useBusEvent('wyniki-gotowe', () => {
    const ids = kluczPrzypadkow ? kluczPrzypadkow.split('|') : [];
    if (ids.length === 0) return;
    Promise.all(ids.map((id) => listRuns(id)))
      .then((wyniki) => setStan({ runs: wyniki.flatMap((w) => w.runs), ladowanie: false, blad: null }))
      .catch(() => {
        /* Odświeżenie na żywo jest najlepszego wysiłku — błąd zostaje w stanie
         * z ostatniego udanego pobrania zamiast czyścić listę pod użytkownikiem. */
      });
  });

  return stan;
}
