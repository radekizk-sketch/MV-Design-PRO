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

import type { ExecutionRun } from '../../../ui/study-cases/types';
import type { WierszZalozenia } from '../wzorzec';
import type { WierszStanuFazowego } from './api';
import { fmtLubKreska, STAN_FAZOWY_STRINGS as T } from './strings';

// ---------------------------------------------------------------------------
// Wybór przebiegu stanu fazowego (rejestr przebiegów)
// ---------------------------------------------------------------------------

/**
 * Przebieg stanu fazowego do prezentacji: aktywny przebieg, jeżeli jest
 * zakończonym stanem fazowym; inaczej najnowszy zakończony (deterministycznie).
 */
export function wybierzPrzebiegFazowy(
  przebiegi: readonly ExecutionRun[],
  activeRunId: string | null,
): ExecutionRun | null {
  const zakonczone = przebiegi.filter(
    (r) => r.status === 'DONE' && r.analysis_type === 'PHASE_STATE_SN',
  );
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
