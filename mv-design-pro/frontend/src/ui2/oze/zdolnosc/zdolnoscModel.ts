/*
 * Model i adaptery okna „Zdolność przyłączeniowa" (karta P2). Czyste, read-only
 * odwzorowanie odpowiedzi końcówki hosting-capacity (`../api`) na struktury
 * prezentacji (tabela / wykres / ślad). Zero fizyki, zero ocen lokalnych — rodzaj
 * kryterium, wartości i progi pochodzą WYŁĄCZNIE z backendu. Zero mutacji, zero
 * wołań API stąd. Słownik PL rodzajów kontroli reużyty z okna „Jakość wyników".
 */

import { nazwaObiektuZMigawki } from '../../wyniki/wzorzec/useNazwaObiektu';
import { rodzajKontroliPL } from '../../wyniki/jakosc/strings';
import type { RodzajKontroli } from '../../wyniki/jakosc/api';
import type { KryteriumWiazaceZdolnosci, ScenariuszZdolnosci, WezelZdolnosci } from '../api';
import { ZDOLNOSC_STRINGS, fmtWartosc } from './strings';

// ---------------------------------------------------------------------------
// Etykieta węzła — nazwa na pierwszym planie (identyfikator tylko ekspercko)
// ---------------------------------------------------------------------------

/** Pierwszoplanowa etykieta węzła: nazwa z odpowiedzi, w ostateczności ref. */
export function etykietaWezla(wezel: WezelZdolnosci): string {
  // Karta #145: brak nazwy → polska etykieta rodzaju z mostu nazw, nigdy identyfikator.
  return nazwaObiektuZMigawki(null, wezel.bus_ref, wezel.bus_name);
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

/**
 * Element wiążący — nazwa z mostu nazw wyników (brak nazwy → polska etykieta rodzaju,
 * nigdy identyfikator, karta #145); brak elementu → null.
 */
export function elementKryterium(binding: KryteriumWiazaceZdolnosci): string | null {
  if (binding.kind !== 'voltage' && binding.kind !== 'loading') return null;
  if (!binding.element_id) return binding.element_name ?? null;
  return nazwaObiektuZMigawki(null, binding.element_id, binding.element_name);
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
