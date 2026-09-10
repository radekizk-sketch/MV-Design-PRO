/**
 * Model ekranu „Zbieżność rozpływu i zaczepy" (E-30, karta P-2) — czyste
 * funkcje projekcji. ZERO fizyki, ZERO wołań API z tego pliku.
 *
 * ŹRÓDŁA DANYCH — realne kontrakty read-only (mapowanie plik:linia, „zero zgadywania"):
 * - Wynik rozpływu: `PowerFlowResultV1` (`ui/power-flow-results/types.ts`):
 *   `converged`, `iterations_count`, `tolerance_used`, `base_mva`, `slack_bus_id`,
 *   `summary` (straty łączne, min/max U, moc szyny bilansującej).
 * - Ślad solvera: `PowerFlowTrace` (`ui/power-flow-results/types.ts`):
 *   `solver_method` (metoda NR/GS/FD — backend `enm/canonical_analysis.py:1535`),
 *   `max_iterations`, `iterations[]` (norma/maks. niezbilansowania, przyczyna),
 *   `oltc_control` (pętla regulacji zaczepów — solver
 *   `network_model/solvers/power_flow_oltc.py:124-217`, wpięcie
 *   `enm/canonical_analysis.py:1565-1566`; obecny TYLKO gdy przebieg miał
 *   automatyczne regulatory).
 * - Założenia zaczepów modelu: snapshot ENM (`types/enm.ts`): `transformers[]`
 *   z polami `tap_changer` (TapChanger — `types/enm.ts:208-219`) i `tap_position`.
 *
 * GAP-y kontraktu (uczciwa kreska, zero fabrykacji):
 * - `PowerFlowResultV1` NIE niesie pozycji zaczepów po regulacji — jedynym
 *   źródłem wynikowych pozycji jest `trace.oltc_control` (gdy przebieg miał
 *   regulatory automatyczne). Bez śladu → uczciwa informacja, bez tabeli.
 * - Dopasowanie `oltc_control.final_positions[branch_id]` (UUID gałęzi grafu
 *   solvera) do transformatora snapshotu (ref ENM) wymaga mapy backendu
 *   (`enm/mapping.py:_ref_to_uuid`), której kontrakt frontowy nie niesie —
 *   dlatego regulacja przebiegu i założenia modelu to DWIE osobne, uczciwie
 *   opisane tabele (bez zgadywania powiązania po stronie UI).
 * - Kontrakty nie niosą liczbowej rewizji modelu z chwili liczenia → nagłówek
 *   bez znacznika świeżości (jak adapter rozpływu, TODO-KARTA E8.1 pkt 1).
 */

import type { EnergyNetworkModel, Transformer } from '../../../types/enm';
import type {
  OltcControlTrace,
  PowerFlowResultV1,
  PowerFlowTrace,
} from '../../../ui/power-flow-results/types';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import type { WierszZalozenia } from '../wzorzec';
import { fmtLiczba, fmtTolerancja, ZBIEZNOSC_STRINGS as T } from './strings';

// ---------------------------------------------------------------------------
// Wybór przebiegu rozpływu (rejestr przebiegów — `ui/study-cases/types.ts:234-243`)
// ---------------------------------------------------------------------------

/**
 * Przebieg rozpływu do diagnostyki: aktywny przebieg, jeżeli jest zakończonym
 * rozpływem; inaczej najnowszy zakończony rozpływ (deterministycznie po dacie).
 */
export function wybierzPrzebiegRozplywu(
  przebiegi: readonly ExecutionRun[],
  activeRunId: string | null,
): ExecutionRun | null {
  const zakonczone = przebiegi.filter(
    (r) => r.status === 'DONE' && r.analysis_type === 'LOAD_FLOW',
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
// Założenia przebiegu (WHITE BOX — „założenia są częścią wyniku", W-602)
// ---------------------------------------------------------------------------

/** Tokeny metody solvera z śladu (`enm/canonical_analysis.py:1009-1021`) → PL. */
export const METODY_SOLVERA_PL: Record<string, string> = {
  'newton-raphson': 'Newtona–Raphsona (NR)',
  'gauss-seidel': 'Gaussa–Seidla (GS)',
  'fast-decoupled': 'szybka rozprzężona (FD)',
};

/** Sekcja ZAŁOŻENIA: parametry przebiegu z wyniku + (gdy dostępny) śladu. */
export function naZalozeniaZbieznosci(
  wynik: PowerFlowResultV1,
  slad: PowerFlowTrace | null,
): WierszZalozenia[] {
  const metodaToken = slad?.solver_method;
  const metoda = metodaToken
    ? METODY_SOLVERA_PL[metodaToken] ?? metodaToken
    : T.kreska;
  return [
    { etykieta: T.zalMetoda, wartosc: metoda, uwaga: T.zalMetodaUwaga },
    { etykieta: T.zalTolerancja, wartosc: fmtTolerancja(wynik.tolerance_used) },
    { etykieta: T.zalMocBazowa, wartosc: fmtLiczba(wynik.base_mva, 1), jednostka: T.jednMVA },
    // CV-4.3 K3b: przebieg liczony per wyspa niesie szynę bilansującą KAŻDEJ wyspy;
    // kontrakt wyniku (`slack_bus_id`) trzyma szynę pierwszej wyspy.
    slad?.wyspy && slad.wyspy.length >= 2
      ? {
          etykieta: T.zalSzynaBilansujaca,
          wartosc: slad.wyspy.map((w) => w.slack_bus_id).join(', '),
          uwaga: T.zalSzynyBilansujaceUwaga,
        }
      : { etykieta: T.zalSzynaBilansujaca, wartosc: wynik.slack_bus_id },
    {
      etykieta: T.zalMaxIteracji,
      wartosc: slad ? slad.max_iterations : T.kreska,
      uwaga: T.zalMaxIteracjiUwaga,
    },
  ];
}

// ---------------------------------------------------------------------------
// Wyspy zasilone (trace.wyspy — rozpływ per wyspa, CV-4.3 K3b)
// ---------------------------------------------------------------------------

export interface WierszWyspy {
  szynaBilansujaca: string;
  zrodloRef: string;
  liczbaSzynPq: number;
  liczbaSzynPv: number;
  iteracje: number;
  zbiezna: boolean;
}

/** Wiersze wysp zasilonych — pusta lista, gdy przebieg miał jedną wyspę (brak `wyspy`). */
export function naWierszeWysp(slad: PowerFlowTrace | null): WierszWyspy[] {
  if (!slad?.wyspy || slad.wyspy.length < 2) return [];
  return slad.wyspy.map((w) => ({
    szynaBilansujaca: w.slack_bus_id,
    zrodloRef: w.zrodlo_ref,
    liczbaSzynPq: w.pq_bus_ids.length,
    liczbaSzynPv: w.pv_bus_ids.length,
    iteracje: w.final_iterations_count,
    zbiezna: w.converged,
  }));
}

// ---------------------------------------------------------------------------
// Bilans przebiegu (summary kontraktu wyniku — klucz→wartość)
// ---------------------------------------------------------------------------

export interface PozycjaBilansu {
  etykieta: string;
  wartosc: string;
  jednostka: string;
}

export function naBilansPrzebiegu(wynik: PowerFlowResultV1): PozycjaBilansu[] {
  const s = wynik.summary;
  return [
    { etykieta: T.bilansStratyP, wartosc: fmtLiczba(s.total_losses_p_mw, 4), jednostka: T.jednMW },
    { etykieta: T.bilansStratyQ, wartosc: fmtLiczba(s.total_losses_q_mvar, 4), jednostka: T.jednMvar },
    { etykieta: T.bilansMinU, wartosc: fmtLiczba(s.min_v_pu, 4), jednostka: T.jednPU },
    { etykieta: T.bilansMaxU, wartosc: fmtLiczba(s.max_v_pu, 4), jednostka: T.jednPU },
    { etykieta: T.bilansSlackP, wartosc: fmtLiczba(s.slack_p_mw, 4), jednostka: T.jednMW },
    { etykieta: T.bilansSlackQ, wartosc: fmtLiczba(s.slack_q_mvar, 4), jednostka: T.jednMvar },
  ];
}

// ---------------------------------------------------------------------------
// Regulacja zaczepów przebiegu (trace.oltc_control — ślad pętli OLTC)
// ---------------------------------------------------------------------------

export interface WierszOltcPrzebiegu {
  branchId: string;
  strona: string;
  szynaKontrolowana: string;
  /** Napięcie zadane [kV] — sformatowane; kreska gdy regulator bez nastawy. */
  zadanaKv: string;
  pozycjaPoczatkowa: number;
  /** Pozycja końcowa z `final_positions`; kreska gdy klucz nieobecny. */
  pozycjaKoncowa: string;
  zakres: string;
  przelaczenia: number;
}

export function naWierszeOltcPrzebiegu(oltc: OltcControlTrace): WierszOltcPrzebiegu[] {
  return oltc.regulators.map((reg) => {
    const koncowa = oltc.final_positions[reg.branch_id];
    return {
      branchId: reg.branch_id,
      strona: reg.regulated_winding === 'HV' ? T.stronaGorna : T.stronaDolna,
      szynaKontrolowana: reg.controlled_bus_id,
      zadanaKv: reg.setpoint_kv != null ? `${fmtLiczba(reg.setpoint_kv, 2)} ${T.jednKV}` : T.kreska,
      pozycjaPoczatkowa: reg.initial_position,
      pozycjaKoncowa: koncowa != null ? String(koncowa) : T.kreska,
      zakres: `${reg.min_position}…${reg.max_position}`,
      przelaczenia: oltc.switch_counts[reg.branch_id] ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Założenia zaczepów modelu (snapshot ENM — bieżąca wersja układu)
// ---------------------------------------------------------------------------

const RODZAJ_REGULACJI_PL: Record<string, string> = {
  NONE: T.regulacjaBrak,
  DETC: T.regulacjaDetc,
  OLTC: T.regulacjaOltc,
};

const TRYB_STEROWANIA_PL: Record<string, string> = {
  MANUAL: T.trybReczny,
  AUTOMATIC: T.trybAutomatyczny,
  PROFILE: T.trybProfil,
  REMOTE: T.trybZdalny,
};

export interface WierszZaczepowModelu {
  /** Identyfikator elementu modelu (`ref_id`) — dla wskazania transformatora (F-K4). */
  ref: string;
  nazwa: string;
  regulacja: string;
  tryb: string;
  /** Pozycja z `tap_changer.current_position` albo `tap_position`; kreska gdy brak. */
  pozycja: string;
  zakres: string;
  krok: string;
}

/** Projekcja transformatora snapshotu na wiersz założeń zaczepów (uczciwe kreski). */
export function naWierszZaczepowModelu(trafo: Transformer): WierszZaczepowModelu {
  const tc = trafo.tap_changer ?? null;
  const pozycja = tc ? tc.current_position : trafo.tap_position ?? null;
  const min = tc ? tc.min_position : trafo.tap_min ?? null;
  const max = tc ? tc.max_position : trafo.tap_max ?? null;
  const krok = tc ? tc.step_percent : trafo.tap_step_percent ?? null;
  return {
    ref: trafo.ref_id,
    nazwa: trafo.name || trafo.ref_id,
    regulacja: tc ? RODZAJ_REGULACJI_PL[tc.regulation_type] ?? tc.regulation_type : T.kreska,
    tryb: tc ? TRYB_STEROWANIA_PL[tc.control_mode] ?? tc.control_mode : T.kreska,
    pozycja: pozycja != null ? String(pozycja) : T.kreska,
    zakres: min != null && max != null ? `${min}…${max}` : T.kreska,
    krok: krok != null ? `${fmtLiczba(krok, 2)} ${T.jednProcent}` : T.kreska,
  };
}

export function naWierszeZaczepowModelu(
  snapshot: EnergyNetworkModel | null,
): WierszZaczepowModelu[] {
  if (!snapshot) return [];
  // Kolejność deterministyczna po ref_id (jak mapowanie backendu, `enm/mapping.py:508`).
  return [...snapshot.transformers]
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))
    .map(naWierszZaczepowModelu);
}

// ---------------------------------------------------------------------------
// Ślad iteracji solvera (na żądanie)
// ---------------------------------------------------------------------------

export interface WierszIteracji {
  k: number;
  norma: string;
  maxNiezbilansowanie: string;
  przyczyna: string;
}

export function naWierszeIteracji(slad: PowerFlowTrace): WierszIteracji[] {
  return slad.iterations.map((it) => ({
    k: it.k,
    norma: it.norm_mismatch.toExponential(3).replace('.', ','),
    maxNiezbilansowanie: it.max_mismatch_pu.toExponential(3).replace('.', ','),
    przyczyna: it.cause_if_failed ?? T.kreska,
  }));
}
