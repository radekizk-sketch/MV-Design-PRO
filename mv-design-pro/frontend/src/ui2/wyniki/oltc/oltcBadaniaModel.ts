/**
 * Model ekranu „Badania regulacji OLTC" (V12K-046, H2).
 *
 * ZERO fizyki w UI: badania liczy backend (silniki power_flow_oltc_studies).
 * Ten moduł buduje żądanie przebiegu (solver_input:{oltc_study,...}), orkiestruje
 * uruchomienie (createRun → executeRun → getRunResults) i parsuje wynik z
 * `global_results.oltc_*` (kontrakt H1, OLTC_ARCHITEKTURA §8.1). Wartości liczbowe
 * pochodzą wyłącznie z backendu.
 */

import { createRun, executeRun, getRunResults } from '../../../ui/study-cases/api';
import type { KrokWywodu } from '../wzorzec';

export type RodzajBadania = 'sweep' | 'annual_profile' | 'optimize';
export type CelOptymalizacji = 'minimize_losses' | 'maintain_voltage' | 'minimize_switching';

export interface PunktSweep {
  position: number;
  tap_ratio: number;
  converged: boolean;
  controlled_bus_kv: number | null;
  losses_mw: number;
  min_bus_kv: number | null;
  max_bus_kv: number | null;
}

export interface WynikSweep {
  branch_id: string;
  controlled_bus_id: string | null;
  points: PunktSweep[];
  /** Wywód dyplomowy {tekst, latex} z backendu (zasada KaTeX 2026-07-22); addytywny. */
  wywod?: KrokWywodu[];
}

export interface KrokProfilu {
  index: number;
  label: string;
  load_scale: number;
  positions: Record<string, number>;
  switch_count: number;
  controlled_bus_kv: Record<string, number>;
  within_deadband: Record<string, boolean>;
}

export interface WynikProfilu {
  steps: KrokProfilu[];
  total_switch_count: number;
  steps_outside_deadband: number;
  /** Wywód dyplomowy {tekst, latex} z backendu (zasada KaTeX 2026-07-22); addytywny. */
  wywod?: KrokWywodu[];
}

export interface KandydatOptymalizacji {
  position: number;
  converged: boolean;
  losses_mw: number;
  controlled_bus_kv: number | null;
  voltage_deviation_kv: number | null;
  objective_value: number;
  feasible: boolean;
}

export interface WynikOptymalizacji {
  branch_id: string;
  objective: string;
  best_position: number | null;
  initial_position: number;
  switch_count: number;
  candidates: KandydatOptymalizacji[];
  /** Wywód dyplomowy {tekst, latex} z backendu (zasada KaTeX 2026-07-22); addytywny. */
  wywod?: KrokWywodu[];
}

export interface KrokProfiluWejscie {
  label: string;
  load_scale: number;
}

export interface ParametryBadania {
  rodzaj: RodzajBadania;
  cel: CelOptymalizacji;
  napiecieCelKv: number | null;
  profil: KrokProfiluWejscie[];
}

export const PARAMETRY_DOMYSLNE: ParametryBadania = {
  rodzaj: 'sweep',
  cel: 'minimize_losses',
  napiecieCelKv: 15,
  profil: [
    { label: 'Noc (dolina)', load_scale: 0.3 },
    { label: 'Dzień', load_scale: 1.0 },
    { label: 'Szczyt', load_scale: 1.6 },
  ],
};

/** Buduje `solver_input` przebiegu LF z opcją badania OLTC (kontrakt H1). */
export function zbudujSolverInput(params: ParametryBadania): Record<string, unknown> {
  if (params.rodzaj === 'annual_profile') {
    return {
      oltc_study: 'annual_profile',
      oltc_load_profile: params.profil.map((p) => ({ label: p.label, load_scale: p.load_scale })),
    };
  }
  if (params.rodzaj === 'optimize') {
    const input: Record<string, unknown> = {
      oltc_study: 'optimize',
      oltc_objective: params.cel,
    };
    if (params.cel === 'maintain_voltage' || params.cel === 'minimize_switching') {
      input.oltc_target_kv = params.napiecieCelKv;
    }
    return input;
  }
  return { oltc_study: 'sweep' };
}

export interface WynikBadania {
  sweep?: WynikSweep;
  profil?: WynikProfilu;
  optymalizacja?: WynikOptymalizacji;
}

/** Wyciąga wynik badania z `global_results` przebiegu (klucze oltc_*). */
export function parsujWynik(
  rodzaj: RodzajBadania,
  globalResults: Record<string, unknown>,
): WynikBadania {
  if (rodzaj === 'sweep' && globalResults.oltc_sweep) {
    return { sweep: globalResults.oltc_sweep as WynikSweep };
  }
  if (rodzaj === 'annual_profile' && globalResults.oltc_annual_profile) {
    return { profil: globalResults.oltc_annual_profile as WynikProfilu };
  }
  if (rodzaj === 'optimize' && globalResults.oltc_optimization) {
    return { optymalizacja: globalResults.oltc_optimization as WynikOptymalizacji };
  }
  return {};
}

/**
 * Uruchamia badanie OLTC end-to-end na aktywnym przypadku i zwraca sparsowany
 * wynik. Rzuca `Error` z czytelnym komunikatem przy braku zbieżności/wyniku.
 */
export async function uruchomBadanie(
  caseId: string,
  params: ParametryBadania,
): Promise<WynikBadania> {
  const run = await createRun(caseId, {
    analysis_type: 'LOAD_FLOW',
    solver_input: zbudujSolverInput(params),
  });
  const executed = await executeRun(run.id);
  if (executed.status === 'FAILED') {
    throw new Error(executed.error_message || 'Przebieg zakończył się błędem.');
  }
  const results = await getRunResults(run.id);
  const wynik = parsujWynik(params.rodzaj, results.global_results ?? {});
  if (!wynik.sweep && !wynik.profil && !wynik.optymalizacja) {
    throw new Error(
      'Backend nie zwrócił wyniku badania OLTC — sprawdź, czy transformator ma przełącznik zaczepów.',
    );
  }
  return wynik;
}

// ------------------------------------------------------------- Formatery

export function fmtKv(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(3)} kV` : '—';
}

export function fmtMw(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(4)} MW` : '—';
}

export function fmtPozycja(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value > 0 ? `+${value}` : String(value);
}
