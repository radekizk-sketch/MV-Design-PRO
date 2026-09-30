/**
 * Wybór biegów wejściowych koordynacji zabezpieczeń (E-28).
 *
 * Koordynacja potrzebuje biegu zwarciowego MAKSYMALNEGO (selektywność), MINIMALNEGO
 * (czułość) i — dla przeciążalności — biegu rozpływu. Scenariusz biegu zwarciowego pochodzi
 * WYŁĄCZNIE z zapisu na biegu (`konfiguracja_biegu.scenariusz`); bieg bez zapisanego
 * scenariusza nie jest kandydatem (nigdy domyślne „MAX"). Brak kandydata = `null` widoczny
 * w panelu biegów, nie zastępczy identyfikator. Backend i tak sprawdza zgodność scenariusza
 * (`SCENARIUSZ_BIEGU_NIEZGODNY`) — ten wybór tylko wskazuje najnowsze biegi.
 */

import { useEffect, useState } from 'react';

import { fetchShortCircuitResults } from '../results-inspector/api';
import { useExecutionRunsStore } from '../study-cases/runStore';

/** Rodzaje biegów zwarciowych przyjmowane przez ocenę nadprądową fazową (backend: 3F albo 2F). */
export const RODZAJE_ZWARCIA_KOORDYNACJI: ReadonlySet<string> = new Set(['SC_3F', 'SC_2F']);

export interface BiegiKoordynacji {
  max: string | null;
  min: string | null;
  pf: string | null;
}

export interface OpisBieguZwarciowego {
  runId: string;
  scenariusz: 'MAX' | 'MIN' | null;
}

/**
 * Najnowszy bieg każdego scenariusza. `opisy` muszą być uporządkowane od najnowszego.
 */
export function wybierzBiegiKoordynacji(
  opisy: readonly OpisBieguZwarciowego[],
  pf: string | null,
): BiegiKoordynacji {
  const pierwszy = (scenariusz: 'MAX' | 'MIN') =>
    opisy.find((o) => o.scenariusz === scenariusz)?.runId ?? null;
  return { max: pierwszy('MAX'), min: pierwszy('MIN'), pf };
}

/**
 * Biegi wejściowe z zakończonych biegów przypadku: najnowszy bieg zwarciowy 3F/2F każdego
 * scenariusza (scenariusz odczytany z wyniku biegu) i najnowszy rozpływ. Jedno źródło dla
 * koordynacji (E-28) i oceny zabezpieczeń na biegu zwarciowym — oba ekrany widzą te same
 * biegi. Bieg, którego wyniku nie da się odczytać, nie jest kandydatem.
 */
export function useBiegiKoordynacji(): BiegiKoordynacji {
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const [biegi, setBiegi] = useState<BiegiKoordynacji>({ max: null, min: null, pf: null });
  useEffect(() => {
    const zakonczone = przebiegi.filter((r) => r.status === 'DONE');
    const odNajnowszego = (a: { finished_at: string | null }, b: { finished_at: string | null }) =>
      (b.finished_at ?? '').localeCompare(a.finished_at ?? '');
    const zwarciowe = zakonczone
      .filter((r) => RODZAJE_ZWARCIA_KOORDYNACJI.has(r.analysis_type))
      .sort(odNajnowszego);
    const rozplywy = zakonczone.filter((r) => r.analysis_type === 'LOAD_FLOW').sort(odNajnowszego);
    let anulowane = false;
    void (async () => {
      const opisy: OpisBieguZwarciowego[] = [];
      for (const bieg of zwarciowe) {
        try {
          const wynik = await fetchShortCircuitResults(bieg.id);
          opisy.push({ runId: bieg.id, scenariusz: wynik.konfiguracja_biegu?.scenariusz ?? null });
        } catch {
          // Bieg bez odczytu wyniku nie jest kandydatem — brak widoczny w panelu biegów.
        }
      }
      if (!anulowane) setBiegi(wybierzBiegiKoordynacji(opisy, rozplywy[0]?.id ?? null));
    })();
    return () => {
      anulowane = true;
    };
  }, [przebiegi]);
  return biegi;
}
