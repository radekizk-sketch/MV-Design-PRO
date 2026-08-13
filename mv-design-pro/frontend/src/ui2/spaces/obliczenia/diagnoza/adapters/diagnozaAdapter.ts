/*
 * Adapter powierzchni „Diagnoza przebiegu" (przestrzeń „Obliczenia", D7).
 *
 * ŹRÓDŁA DANYCH (wszystkie read-only — mapowanie w `diagnozaApi.ts`):
 * - kontrola przed obliczeniem + braki modelu: końcówki diagnostyki przypadku,
 * - diagnoza zbieżności: końcówka diagnozy biegu.
 *
 * KTÓRY BIEG DIAGNOZUJEMY. Najnowszy bieg aktywnego przypadku, czyli
 * `useExecutionRunsStore.runs[0]` — repozytorium sortuje `created_at DESC,
 * id DESC` (`infrastructure/persistence/repositories/canonical_run_repository.py:264-270`),
 * więc „pierwszy z listy" jest deterministycznie najnowszy (rozstrzygnięcie po
 * `id` chroni przed równym znacznikiem czasu). Wybór biegu to czysta SELEKCJA
 * w prezentacji — żadnej oceny wyniku, żadnej fizyki.
 *
 * Store przebiegów czytamy TYLKO do odczytu; napełnia go hydratacja powłoki
 * (`ui2/shell/useHydratacjaPowloki.ts:125` → `setActiveStudyCaseId` → `loadRuns`),
 * ten sam mechanizm, z którego korzysta okno „Przebiegi obliczeń".
 *
 * Zero fizyki: wszystkie liczby pochodzą z backendu i są wyłącznie formatowane.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import { useBusEvent } from '../../../../events';
import {
  pobierzDiagnostykeModelu,
  pobierzDiagnozePrzebiegu,
  pobierzPreflight,
  type DiagnostykaOdpowiedz,
  type DiagnozaPrzebieguOdpowiedz,
  type PreflightOdpowiedz,
} from '../diagnozaApi';

/** Stan powierzchni. */
export type StanDiagnozy = 'brak-przypadku' | 'ladowanie' | 'blad' | 'gotowe';

/** Komplet danych powierzchni w jednym miejscu (jedno pobranie = jeden stan). */
export interface DaneDiagnozy {
  readonly stan: StanDiagnozy;
  readonly preflight: PreflightOdpowiedz | null;
  readonly diagnostyka: DiagnostykaOdpowiedz | null;
  /** `null`, gdy przypadek nie ma jeszcze ANI JEDNEGO biegu (uczciwy stan zerowy). */
  readonly diagnoza: DiagnozaPrzebieguOdpowiedz | null;
  /** Ponowna próba po błędzie — realna akcja, nie ozdoba przycisku. */
  readonly odswiez: () => void;
}

interface StanWewnetrzny {
  stan: StanDiagnozy;
  preflight: PreflightOdpowiedz | null;
  diagnostyka: DiagnostykaOdpowiedz | null;
  diagnoza: DiagnozaPrzebieguOdpowiedz | null;
}

const STAN_POCZATKOWY: StanWewnetrzny = {
  stan: 'ladowanie',
  preflight: null,
  diagnostyka: null,
  diagnoza: null,
};

/**
 * Identyfikator najnowszego biegu przypadku (albo `null`, gdy biegów nie ma).
 * Kolejność ze store'u jest autorytatywna — patrz nagłówek pliku.
 */
export function najnowszyBieg(runy: readonly { id: string }[]): string | null {
  return runy.length > 0 ? runy[0].id : null;
}

/**
 * Pobiera komplet danych powierzchni. Pobranie jest ATOMOWE z punktu widzenia
 * ekranu: dopóki nie wrócą wszystkie trzy odpowiedzi, ekran jest w stanie
 * „ładowanie" — inaczej sekcje pojawiałyby się kaskadą i projektant czytałby
 * werdykt biegu przy jeszcze pustej kontroli przed obliczeniem.
 *
 * Odpowiedź spóźniona po zmianie przypadku albo po odmontowaniu jest
 * ODRZUCANA (licznik pokoleń) — bez tego dane poprzedniego przypadku mogłyby
 * nadpisać bieżące.
 */
export function useDaneDiagnozy(): DaneDiagnozy {
  const przypadekId = useExecutionRunsStore((s) => s.activeStudyCaseId);
  const runy = useExecutionRunsStore((s) => s.runs);
  const biegId = najnowszyBieg(runy);

  const [stanWewnetrzny, setStanWewnetrzny] = useState<StanWewnetrzny>(STAN_POCZATKOWY);
  const [licznikOdswiezen, setLicznikOdswiezen] = useState(0);
  const pokolenieRef = useRef(0);

  const odswiez = useCallback(() => {
    setLicznikOdswiezen((poprzedni) => poprzedni + 1);
  }, []);

  useEffect(() => {
    if (!przypadekId) {
      setStanWewnetrzny({
        stan: 'brak-przypadku',
        preflight: null,
        diagnostyka: null,
        diagnoza: null,
      });
      return;
    }

    pokolenieRef.current += 1;
    const mojePokolenie = pokolenieRef.current;
    let aktualne = true;

    setStanWewnetrzny((poprzedni) => ({ ...poprzedni, stan: 'ladowanie' }));

    Promise.all([
      pobierzPreflight(przypadekId),
      pobierzDiagnostykeModelu(przypadekId),
      biegId ? pobierzDiagnozePrzebiegu(biegId) : Promise.resolve(null),
    ])
      .then(([preflight, diagnostyka, diagnoza]) => {
        if (!aktualne || pokolenieRef.current !== mojePokolenie) return;
        setStanWewnetrzny({ stan: 'gotowe', preflight, diagnostyka, diagnoza });
      })
      .catch(() => {
        if (!aktualne || pokolenieRef.current !== mojePokolenie) return;
        setStanWewnetrzny({
          stan: 'blad',
          preflight: null,
          diagnostyka: null,
          diagnoza: null,
        });
      });

    return () => {
      aktualne = false;
    };
  }, [przypadekId, biegId, licznikOdswiezen]);

  // Nowe wyniki dla ŚLEDZONEGO przypadku = nowy bieg do zdiagnozowania.
  // Pobranie autorytatywne, bez zgadywania treści ze zdarzenia magistrali
  // (ten sam wzorzec co `useOdswiezaniePrzebiegow`).
  useBusEvent('wyniki-gotowe', (zdarzenie) => {
    const aktywny = useExecutionRunsStore.getState().activeStudyCaseId;
    if (aktywny && zdarzenie.przypadekId === aktywny) odswiez();
  });

  // Zmiana modelu unieważnia kontrolę przed obliczeniem (diagnostyka opisuje
  // BIEŻĄCY model, nie migawkę biegu), więc pobieramy ją ponownie.
  useBusEvent('wyniki-niewazne', () => {
    if (useExecutionRunsStore.getState().activeStudyCaseId) odswiez();
  });

  return {
    stan: stanWewnetrzny.stan,
    preflight: stanWewnetrzny.preflight,
    diagnostyka: stanWewnetrzny.diagnostyka,
    diagnoza: stanWewnetrzny.diagnoza,
    odswiez,
  };
}
