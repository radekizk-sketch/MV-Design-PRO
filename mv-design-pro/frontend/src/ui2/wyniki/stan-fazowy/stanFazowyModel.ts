/**
 * Model ekranu „Stan fazowy SN" (E-31, karta P-2) — czyste funkcje projekcji.
 * ZERO fizyki, ZERO wołań API z tego pliku (klient GET żyje w `api.ts`).
 *
 * ŹRÓDŁO DANYCH — realny kontrakt read-only: wiersz wyników stanu fazowego
 * (`api.ts::WierszStanuFazowego`, 1:1 z `enm/canonical_analysis.py:1995-2035`).
 * Werdykty asymetrii pochodzą WYŁĄCZNIE z flag solvera
 * (`voltage/current/losses_unbalance_alert` — solver liczy je względem jawnego
 * wejścia `unbalance_alert_percent`, `network_model/solvers/phase_state_sn.py:223-225`).
 *
 * GAP-y kontraktu (uczciwie, zero fabrykacji):
 * - Wiersz wyników NIE niesie WARTOŚCI progu alarmu (`unbalance_alert_percent`
 *   jest echem wejścia w śladzie WHITE BOX przebiegu, nie w wierszu wyników) →
 *   UI pokazuje werdykt z flag, ale NIE pokazuje liczby progu.
 * - Wiersz NIE niesie echa wejść solvera (napięcie źródła, prąd obciążenia,
 *   rezystancja gałęzi, prąd zwarciowy) → sekcja założeń ogranicza się do celu
 *   analizy i statusów; wywód wejść żyje w dowodzie obliczeń (proof_ref).
 * - Flagi mogą być częściowe (`Partial`) — brak flagi → „bez werdyktu",
 *   nigdy zgadywanie.
 */

import type { ExecutionAnalysisType, ExecutionRun } from '../../../ui/study-cases/types';
import type { WierszZalozenia } from '../wzorzec';
import type {
  GalazNiesymetryczna,
  SzynaNiesymetryczna,
  WierszStanuFazowego,
  WynikiRozplywuNiesymetrycznego,
  ZalozenieBiegu,
} from './api';
import { fmtLubKreska, STAN_FAZOWY_STRINGS as T } from './strings';

// ---------------------------------------------------------------------------
// Wybór przebiegu fazowego (rejestr przebiegów) — DWA źródła (W5-D)
// ---------------------------------------------------------------------------

/** Źródło wyniku fazowego: który solver dał liczby na ekranie. */
export type ZrodloStanuFazowego = 'stan_fazowy' | 'rozplyw_niesymetryczny';

/** Rodzaje przebiegów, które ten ekran czyta (jedna prawda dla wyboru i gałęzi ekranu). */
export const RODZAJE_PRZEBIEGOW_FAZOWYCH: Readonly<Record<ZrodloStanuFazowego, ExecutionAnalysisType>> = {
  stan_fazowy: 'PHASE_STATE_SN',
  rozplyw_niesymetryczny: 'PF_UNBALANCED',
};

export function zrodloPrzebiegu(przebieg: ExecutionRun): ZrodloStanuFazowego | null {
  if (przebieg.analysis_type === RODZAJE_PRZEBIEGOW_FAZOWYCH.stan_fazowy) return 'stan_fazowy';
  if (przebieg.analysis_type === RODZAJE_PRZEBIEGOW_FAZOWYCH.rozplyw_niesymetryczny) {
    return 'rozplyw_niesymetryczny';
  }
  return null;
}

/**
 * Przebieg fazowy do prezentacji: aktywny przebieg, jeżeli jest zakończonym
 * stanem fazowym SN albo rozpływem niesymetrycznym; inaczej najnowszy
 * zakończony z obu rodzajów (deterministycznie).
 */
export function wybierzPrzebiegFazowy(
  przebiegi: readonly ExecutionRun[],
  activeRunId: string | null,
): ExecutionRun | null {
  const zakonczone = przebiegi.filter((r) => r.status === 'DONE' && zrodloPrzebiegu(r) !== null);
  if (zakonczone.length === 0) return null;
  const aktywny = activeRunId ? zakonczone.find((r) => r.id === activeRunId) : undefined;
  if (aktywny) return aktywny;
  return [...zakonczone].sort((a, b) =>
    String(b.finished_at ?? b.started_at ?? '').localeCompare(
      String(a.finished_at ?? a.started_at ?? ''),
    ),
  )[0];
}

// ---------------------------------------------------------------------------
// Założenia / kontekst wyniku
// ---------------------------------------------------------------------------

export function naZalozeniaStanuFazowego(wiersz: WierszStanuFazowego): WierszZalozenia[] {
  return [
    { etykieta: T.zrodloEtykieta, wartosc: T.zrodloStanFazowy },
    {
      etykieta: T.zalCel,
      wartosc: wiersz.target_name || wiersz.target_id,
      uwaga: T.zalCelUwaga,
    },
    { etykieta: T.zalStatusUzasadnienia, wartosc: wiersz.proof_status_pl ?? T.kreska },
    { etykieta: T.zalStatusRaportowy, wartosc: wiersz.reporting_status_pl ?? T.kreska },
  ];
}

// ---------------------------------------------------------------------------
// Tabela wartości fazowych (U [kV], I [A], straty [kW] per faza)
// ---------------------------------------------------------------------------

export interface WierszFazy {
  faza: string;
  napiecieKv: string;
  pradA: string;
  stratyKw: string;
}

export function naWierszeFaz(wiersz: WierszStanuFazowego): WierszFazy[] {
  const straty = wiersz.phase_losses_kw ?? {};
  return [
    {
      faza: T.fazaA,
      napiecieKv: fmtLubKreska(wiersz.ua_kv, 3),
      pradA: fmtLubKreska(wiersz.ia_a, 1),
      stratyKw: fmtLubKreska(straty.A, 3),
    },
    {
      faza: T.fazaB,
      napiecieKv: fmtLubKreska(wiersz.ub_kv, 3),
      pradA: fmtLubKreska(wiersz.ib_a, 1),
      stratyKw: fmtLubKreska(straty.B, 3),
    },
    {
      faza: T.fazaC,
      napiecieKv: fmtLubKreska(wiersz.uc_kv, 3),
      pradA: fmtLubKreska(wiersz.ic_a, 1),
      stratyKw: fmtLubKreska(straty.C, 3),
    },
  ];
}

// ---------------------------------------------------------------------------
// Wskaźniki asymetrii z werdyktem SOLVERA (flagi — zero progów w UI)
// ---------------------------------------------------------------------------

/** Werdykt: alarm z flag solvera; brak flagi w kontrakcie → „bez werdyktu". */
export type WerdyktAsymetrii = 'przekroczenie' | 'w-normie' | 'brak';

export interface PozycjaAsymetrii {
  etykieta: string;
  /** Wartość [%] — sformatowana; kreska gdy kontrakt nie niesie wartości. */
  wartosc: string;
  werdykt: WerdyktAsymetrii;
}

function werdyktZFlagi(alert: boolean | undefined): WerdyktAsymetrii {
  if (alert === undefined) return 'brak';
  return alert ? 'przekroczenie' : 'w-normie';
}

export function naPozycjeAsymetrii(wiersz: WierszStanuFazowego): PozycjaAsymetrii[] {
  const flags = wiersz.flags ?? {};
  return [
    {
      etykieta: T.asymetriaU,
      wartosc: fmtLubKreska(wiersz.voltage_unbalance_percent, 2),
      werdykt:
        wiersz.voltage_unbalance_percent == null
          ? 'brak'
          : werdyktZFlagi(flags.voltage_unbalance_alert),
    },
    {
      etykieta: T.asymetriaI,
      wartosc: fmtLubKreska(wiersz.current_unbalance_percent, 2),
      werdykt:
        wiersz.current_unbalance_percent == null
          ? 'brak'
          : werdyktZFlagi(flags.current_unbalance_alert),
    },
    {
      etykieta: T.asymetriaStrat,
      wartosc: fmtLubKreska(wiersz.losses_unbalance_percent, 2),
      werdykt:
        wiersz.losses_unbalance_percent == null
          ? 'brak'
          : werdyktZFlagi(flags.losses_unbalance_alert),
    },
  ];
}

// ---------------------------------------------------------------------------
// Stan obwodu (zwarcie / otwarta faza) — flagi solvera
// ---------------------------------------------------------------------------

export interface ZdarzenieObwodu {
  etykieta: string;
  fazy: string;
}

export function naZdarzeniaObwodu(wiersz: WierszStanuFazowego): ZdarzenieObwodu[] {
  const flags = wiersz.flags ?? {};
  const zdarzenia: ZdarzenieObwodu[] = [];
  if (flags.has_fault) {
    zdarzenia.push({ etykieta: T.stanZwarcie, fazy: (flags.faulted_phases ?? []).join(', ') });
  }
  if (flags.has_open_phase) {
    zdarzenia.push({ etykieta: T.stanOtwartaFaza, fazy: (flags.open_phases ?? []).join(', ') });
  }
  return zdarzenia;
}

// ---------------------------------------------------------------------------
// Rozpływ niesymetryczny (W5-D) — projekcje kontraktu
// `GET /api/analysis-runs/{id}/results/rozplyw-niesymetryczny`
// ---------------------------------------------------------------------------

export function naZalozeniaRozplywuNiesymetrycznego(
  wyniki: WynikiRozplywuNiesymetrycznego,
): WierszZalozenia[] {
  const wyspy = wyniki.wyspy ?? [];
  const nierozwiazane = wyniki.summary?.unsolved_bus_ids ?? [];
  return [
    { etykieta: T.zrodloEtykieta, wartosc: T.zrodloRozplywNiesymetryczny },
    {
      etykieta: T.rnZalSolver,
      wartosc: wyniki.solver_version ?? T.kreska,
      uwaga: T.rnZalSolverUwaga,
    },
    {
      etykieta: T.rnZalZbieznosc,
      wartosc:
        wyniki.converged == null ? T.kreska : wyniki.converged ? T.rnZbiezny : T.rnNiezbiezny,
    },
    { etykieta: T.rnZalWyspy, wartosc: wyspy.length, uwaga: T.rnZalWyspyUwaga },
    {
      etykieta: T.rnZalSzynyNierozwiazane,
      wartosc: nierozwiazane.length === 0 ? '0' : nierozwiazane.join(', '),
    },
    { etykieta: T.zalStatusUzasadnienia, wartosc: wyniki.proof_status_pl ?? T.kreska },
    { etykieta: T.zalStatusRaportowy, wartosc: wyniki.reporting_status_pl ?? T.kreska },
  ];
}

export interface WierszSzynyNiesymetrycznej {
  id: string;
  nazwa: string;
  unKv: string;
  /** `null` = szyna poza wyspą zasiloną (wiersz z jawnym opisem braku). */
  fazy: { uA: string; uB: string; uC: string; vuf: string } | null;
  /** Wskazanie szyny o największym VUF (z podsumowania solvera, nie z porównania w UI). */
  najwiekszyVuf: boolean;
}

export function naWierszeSzynNiesymetrycznych(
  wyniki: WynikiRozplywuNiesymetrycznego,
): WierszSzynyNiesymetrycznej[] {
  const maxBus = wyniki.summary?.max_voltage_unbalance_bus_id ?? null;
  return wyniki.buses.map((szyna: SzynaNiesymetryczna) => ({
    id: szyna.bus_id,
    nazwa: szyna.name || szyna.element_id,
    unKv: fmtLubKreska(szyna.un_kv, 3),
    fazy:
      szyna.solved && szyna.faza_a && szyna.faza_b && szyna.faza_c
        ? {
            uA: fmtLubKreska(szyna.faza_a.u_kv, 3),
            uB: fmtLubKreska(szyna.faza_b.u_kv, 3),
            uC: fmtLubKreska(szyna.faza_c.u_kv, 3),
            vuf: fmtLubKreska(szyna.voltage_unbalance_factor_pct, 2),
          }
        : null,
    najwiekszyVuf: maxBus !== null && szyna.bus_id === maxBus,
  }));
}

export interface WierszGaleziNiesymetrycznej {
  id: string;
  nazwa: string;
  rodzaj: string;
  iA: string;
  iB: string;
  iC: string;
  /** Prąd znamionowy; kontrakt: `null` = brak danej → kreska (nigdy „0 A"). */
  iN: string;
  stratyKw: string;
}

/** Skalowanie jednostki MW → kW wartości z backendu (prezentacja, nie fizyka). */
function mwNaKw(mw: number): number {
  return mw * 1000;
}

export function naWierszeGaleziNiesymetrycznych(
  wyniki: WynikiRozplywuNiesymetrycznego,
): WierszGaleziNiesymetrycznej[] {
  return wyniki.branches.map((galaz: GalazNiesymetryczna) => ({
    id: galaz.branch_id,
    nazwa: galaz.name || galaz.element_id,
    rodzaj: galaz.element_type,
    iA: fmtLubKreska(galaz.faza_a.i_a, 1),
    iB: fmtLubKreska(galaz.faza_b.i_a, 1),
    iC: fmtLubKreska(galaz.faza_c.i_a, 1),
    iN: fmtLubKreska(galaz.rated_current_a, 0),
    stratyKw: fmtLubKreska(mwNaKw(galaz.losses_p_mw), 3),
  }));
}

export interface PozycjaPodsumowaniaNiesymetrii {
  etykieta: string;
  wartosc: string;
  jednostka?: string;
}

export function naPodsumowanieNiesymetrii(
  wyniki: WynikiRozplywuNiesymetrycznego,
): PozycjaPodsumowaniaNiesymetrii[] {
  const s = wyniki.summary;
  if (!s) return [];
  const szynaMax = s.max_voltage_unbalance_bus_id
    ? wyniki.buses.find((b) => b.bus_id === s.max_voltage_unbalance_bus_id)
    : undefined;
  return [
    {
      etykieta: T.rnStratyCalkowite,
      wartosc: fmtLubKreska(mwNaKw(s.total_losses_p_mw), 3),
      jednostka: T.jednKW,
    },
    {
      etykieta: T.rnStratyBierne,
      wartosc: fmtLubKreska(mwNaKw(s.total_losses_q_mvar), 3),
      jednostka: T.jednKvar,
    },
    {
      etykieta: T.rnMaxVuf,
      wartosc: fmtLubKreska(s.max_voltage_unbalance_factor_pct, 2),
      jednostka: T.jednProcent,
    },
    {
      etykieta: T.rnMaxVufSzyna,
      wartosc: szynaMax ? szynaMax.name || szynaMax.element_id : s.max_voltage_unbalance_bus_id ?? T.kreska,
    },
    { etykieta: T.rnSzynyRozwiazane, wartosc: `${s.solved_bus_count} / ${s.bus_count}` },
  ];
}

export interface WierszZalozeniaBiegu {
  kod: string;
  opis: string;
  elementy: string;
}

export function naZalozeniaBiegu(wyniki: WynikiRozplywuNiesymetrycznego): WierszZalozeniaBiegu[] {
  return (wyniki.zalozenia ?? []).map((z: ZalozenieBiegu) => ({
    kod: z.kod,
    opis: z.opis,
    elementy: z.elementy.join(', '),
  }));
}
