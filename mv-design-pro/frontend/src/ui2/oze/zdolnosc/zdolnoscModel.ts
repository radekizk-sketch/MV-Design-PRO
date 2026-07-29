/*
 * Model i adaptery okna „Zdolność przyłączeniowa" (karta P2). Czyste, read-only
 * odwzorowanie odpowiedzi końcówki hosting-capacity (`../api`) na struktury
 * prezentacji (tabela / wykres / ślad). Zero fizyki, zero ocen lokalnych — rodzaj
 * kryterium, wartości i progi pochodzą WYŁĄCZNIE z backendu. Zero mutacji, zero
 * wołań API stąd. Słownik PL rodzajów kontroli reużyty z okna „Jakość wyników".
 */

import type { ExecutionRun } from '../../../ui/study-cases/types';
import { rodzajKontroliPL } from '../../wyniki/jakosc/strings';
import type { RodzajKontroli } from '../../wyniki/jakosc/api';
import type { KryteriumWiazaceZdolnosci, ScenariuszZdolnosci, WezelZdolnosci } from '../api';
import { ZDOLNOSC_STRINGS, fmtWartosc } from './strings';

// ---------------------------------------------------------------------------
// Wybór przebiegu z rejestru (useExecutionRunsStore) — aktywny/ostatni LOAD_FLOW/DONE
// ---------------------------------------------------------------------------

/**
 * Identyfikator przebiegu rozpływu: preferuje aktywny (gdy LOAD_FLOW i zakończony),
 * inaczej OSTATNI zakończony rozpływ (kolejność źródłowa listy). Deterministyczny
 * dla danego wejścia. Wzorzec `ui2/wyniki/jakosc` (LOAD_FLOW/DONE).
 */
export function wybierzPrzebiegRozplywu(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
): string | null {
  const zakonczone = runs.filter((r) => r.status === 'DONE' && r.analysis_type === 'LOAD_FLOW');
  if (zakonczone.length === 0) return null;
  const aktywny = zakonczone.find((r) => r.id === activeRunId);
  return (aktywny ?? zakonczone[zakonczone.length - 1]).id;
}

// ---------------------------------------------------------------------------
// Etykieta węzła — nazwa na pierwszym planie (identyfikator tylko ekspercko)
// ---------------------------------------------------------------------------

/** Pierwszoplanowa etykieta węzła: nazwa z odpowiedzi, w ostateczności ref. */
export function etykietaWezla(wezel: WezelZdolnosci): string {
  return wezel.bus_name ?? wezel.bus_ref;
}

// ---------------------------------------------------------------------------
// Kryterium wiążące — opis PL (rodzaj + element + wartość + próg)
// ---------------------------------------------------------------------------

/** Polska nazwa rodzaju kryterium wiążącego (rodzaj kontroli lub stan biegu). */
export function rodzajKryteriumPL(binding: KryteriumWiazaceZdolnosci): string {
  switch (binding.kind) {
    case 'none':
      return ZDOLNOSC_STRINGS.kryteriumBrak;
    case 'non_convergence':
      return ZDOLNOSC_STRINGS.kryteriumNiezbieznosc;
    case 'voltage':
    case 'loading':
      if (binding.check_type) {
        return rodzajKontroliPL(binding.check_type as RodzajKontroli);
      }
      return binding.kind === 'voltage'
        ? ZDOLNOSC_STRINGS.kryteriumNapiecie
        : ZDOLNOSC_STRINGS.kryteriumObciazenie;
    default:
      return ZDOLNOSC_STRINGS.kreska;
  }
}

/** Element wiążący (nazwa na pierwszym planie, ref jako rezerwa); brak → null. */
export function elementKryterium(binding: KryteriumWiazaceZdolnosci): string | null {
  if (binding.kind !== 'voltage' && binding.kind !== 'loading') return null;
  return binding.element_name ?? binding.element_id ?? null;
}

/** Wartość obserwowana kryterium z jednostką z backendu; brak danych → null. */
export function wartoscKryterium(binding: KryteriumWiazaceZdolnosci): string | null {
  if (binding.observed_value === undefined || binding.observed_value === null) return null;
  const jedn = binding.unit ? ` ${binding.unit}` : '';
  return `${fmtWartosc(binding.observed_value)}${jedn}`;
}

/** Próg naruszenia (limit_fail) z jednostką z backendu; brak danych → null. */
export function progKryterium(binding: KryteriumWiazaceZdolnosci): string | null {
  if (binding.limit_fail === undefined || binding.limit_fail === null) return null;
  const jedn = binding.unit ? ` ${binding.unit}` : '';
  return `${fmtWartosc(binding.limit_fail)}${jedn}`;
}

// ---------------------------------------------------------------------------
// Wykres słupkowy — moc przyłączalna per węzeł
// ---------------------------------------------------------------------------

/** Słupek wykresu mocy przyłączalnej (etykieta = nazwa węzła). */
export interface SlupekZdolnosci {
  readonly bus_ref: string;
  readonly etykieta: string;
  readonly moc: number;
}

/** Adapter: węzły → słupki wykresu (kolejność źródłowa, bez sortowania). */
export function slupkiZdolnosci(nodes: readonly WezelZdolnosci[]): SlupekZdolnosci[] {
  return nodes.map((wezel) => ({
    bus_ref: wezel.bus_ref,
    etykieta: etykietaWezla(wezel),
    moc: wezel.max_hosting_capacity_mw,
  }));
}

// ---------------------------------------------------------------------------
// Ślad scenariuszy — etykieta dopuszczalności pojedynczego scenariusza
// ---------------------------------------------------------------------------

/** Polska etykieta statusu scenariusza (dopuszczalny / niezbieżny / niedopuszczalny). */
export function statusScenariuszaPL(scenariusz: ScenariuszZdolnosci): string {
  if (scenariusz.acceptable) return ZDOLNOSC_STRINGS.sladDopuszczalny;
  if (!scenariusz.converged) return ZDOLNOSC_STRINGS.sladNiezbiezny;
  return ZDOLNOSC_STRINGS.sladNiedopuszczalny;
}

/** Istotność scenariusza dla doboru koloru znacznika (wyłącznie prezentacja). */
export function istotnoscScenariusza(scenariusz: ScenariuszZdolnosci): 'ok' | 'err' {
  return scenariusz.acceptable ? 'ok' : 'err';
}
