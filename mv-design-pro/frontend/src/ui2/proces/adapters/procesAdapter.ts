/*
 * Adapter modułu procesu — spina store'y read-only z czystą regułą następnej
 * najlepszej akcji (`nastepnaAkcja.ts`). Zero wywołań API, zero mutacji, zero
 * fizyki: wyłącznie odczyt i odwzorowanie pól kontraktu.
 *
 * Źródła danych (te same store'y, z których czytają pulpit i panel gotowości —
 * ŻADNEGO drugiego magazynu stanu):
 * - `useSnapshotStore` (`ui/topology/snapshotStore.ts`) — `snapshot` (obecność
 *   = projekt otwarty) oraz gotowość z odpowiedzi operacji domenowej, czytana
 *   przez `useProblemyGotowosci` (`ui2/spaces/gotowosc/adapters/gotowoscAdapter.ts`),
 *   żeby zgłoszenia miały dowiązany `fixAction` i cel inżyniera.
 * - `useExecutionRunsStore` (`ui/study-cases/runStore.ts`) — `runs`, pole
 *   `status` przebiegu.
 * - `useActiveCase` (`ui/study-cases/store.ts`) — `result_status` i
 *   `results_valid` aktywnego przypadku obliczeniowego.
 *
 * Reguła NBA żyje w jednym miejscu i ma DWÓCH konsumentów (pulpit projektu i
 * panel gotowości) — dzięki temu oba ekrany mówią projektantowi to samo.
 */

import { useMemo } from 'react';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useActiveCase } from '../../../ui/study-cases/store';
import type { ExecutionRun, StudyCase } from '../../../ui/study-cases/types';
import { naProblemGotowosci } from '../../spaces/gotowosc/grupowanieCelow';
import {
  czyGotowoscUstalona,
  useProblemyGotowosci,
} from '../../spaces/gotowosc/adapters/gotowoscAdapter';
import { wyznaczNastepnaAkcje, type NastepnaAkcja, type SygnalyProcesu } from '../nastepnaAkcja';

/** Czy w liście przebiegów jest choć jeden zakończony (kontrakt: `status`). */
export function czyJestZakonczonyPrzebieg(runs: readonly ExecutionRun[]): boolean {
  return runs.some((run) => run.status === 'DONE');
}

/**
 * Aktualność wyników aktywnego przypadku obliczeniowego wg kontraktu:
 * `result_status` równy brakowi wyników → `null` (brak danej), w przeciwnym
 * razie wartość `results_valid`. Brak aktywnego przypadku → `null`.
 */
export function aktualnoscWynikow(activeCase: StudyCase | null): boolean | null {
  if (!activeCase || activeCase.result_status === 'NONE') return null;
  return activeCase.results_valid;
}

/** Sygnały procesu zebrane ze store'ów read-only. */
export function useSygnalyProcesu(): SygnalyProcesu {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const issues = useProblemyGotowosci();
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeCase = useActiveCase();

  const problemy = useMemo(() => issues.map(naProblemGotowosci), [issues]);

  return useMemo(
    () => ({
      projektOtwarty: Boolean(snapshot),
      // JEDNO źródło prawdy predykatu (V12K-309): ten sam `czyGotowoscUstalona`,
      // z którego korzysta panel gotowości. Drugi, „dziś zgodny" warunek byłby
      // defektem czekającym na dane brzegowe (KLASA-NIE-INSTANCJA §3).
      gotowoscUstalona: czyGotowoscUstalona(readiness),
      problemy,
      jestZakonczonyPrzebieg: czyJestZakonczonyPrzebieg(runs),
      wynikiAktualne: aktualnoscWynikow(activeCase),
    }),
    [snapshot, readiness, problemy, runs, activeCase],
  );
}

/** Następna najlepsza akcja — DOKŁADNIE JEDNA, wyznaczona regułą kontraktową. */
export function useNastepnaAkcja(): NastepnaAkcja {
  const sygnaly = useSygnalyProcesu();
  return useMemo(() => wyznaczNastepnaAkcje(sygnaly), [sygnaly]);
}
