/**
 * automationTypes — typy automatyki sieciowej (Pakiet G).
 *
 * POLSKIE SKRÓTY (binding, NIE „AAR"):
 *   - SPZ — Samoczynne Ponowne Załączenie (auto-reclose)
 *   - SZR — Samoczynne Załączenie Rezerwy (automatic transfer to backup feeder)
 *   - SCO — Samoczynne Częstotliwościowe Odciążenie (frequency load shedding, UFLS)
 *   - FDIR — Fault Detection, Isolation & Restoration
 *
 * White box: typy są pure data — walidatory osobno.
 */

export type AutomationKind = 'SPZ' | 'SZR' | 'SCO' | 'FDIR';

export const AUTOMATION_LABELS_PL: Readonly<Record<AutomationKind, string>> = Object.freeze({
  SPZ: 'Samoczynne Ponowne Załączenie',
  SZR: 'Samoczynne Załączenie Rezerwy',
  SCO: 'Samoczynne Częstotliwościowe Odciążenie',
  FDIR: 'Lokalizacja, izolacja i przywracanie zasilania',
});

// ============================================================================
// SPZ — Samoczynne Ponowne Załączenie
// ============================================================================

export interface SpzCycle {
  /** Numer cyklu (1, 2, 3) */
  cycle_no: number;
  /** Czas bezprądowy (dead time) [s] */
  dead_time_s: number;
  /** Czas powrotu (reclaim time) [s] */
  reclaim_time_s: number;
}

export interface SpzConfig {
  kind: 'SPZ';
  device_id: string;
  enabled: boolean;
  /** Cykle SPZ (1×, 2×, 3×) — strict ascending wg cycle_no */
  cycles: ReadonlyArray<SpzCycle>;
  /** ID zabezpieczeń blokujących SPZ (np. blokada od warunków pozostałych) */
  blocking_protections?: ReadonlyArray<string>;
}

/** Walidacja SPZ: liczba cykli 1-3, dead_time > 0, monotonic cycle_no */
export function validateSpz(spz: SpzConfig): string | null {
  if (spz.cycles.length === 0) return 'SPZ musi mieć przynajmniej 1 cykl.';
  if (spz.cycles.length > 3) return `SPZ obsługuje max 3 cykle (podano ${spz.cycles.length}).`;
  for (let i = 0; i < spz.cycles.length; i += 1) {
    const c = spz.cycles[i];
    if (c.cycle_no !== i + 1) {
      return `SPZ cykl[${i}].cycle_no=${c.cycle_no}, oczekiwano ${i + 1}.`;
    }
    if (!(c.dead_time_s > 0)) return `SPZ cykl ${c.cycle_no}: dead_time_s musi być > 0.`;
    if (!(c.reclaim_time_s > 0)) return `SPZ cykl ${c.cycle_no}: reclaim_time_s musi być > 0.`;
  }
  return null;
}

// ============================================================================
// SZR — Samoczynne Załączenie Rezerwy
// ============================================================================

export interface SzrConfig {
  kind: 'SZR';
  device_id: string;
  enabled: boolean;
  /** Priorytet źródła rezerwowego (1 = najwyższy, większe = niższy) */
  backup_priority: number;
  /** Opóźnienie po wykryciu utraty zasilania [s] */
  delay_s: number;
  /** Wymagana kontrola synchronizmu przed załączeniem rezerwy */
  sync_check_required: boolean;
}

export function validateSzr(szr: SzrConfig): string | null {
  if (!(szr.backup_priority >= 1)) return 'SZR: backup_priority musi być ≥ 1.';
  if (!(szr.delay_s >= 0)) return 'SZR: delay_s nie może być ujemne.';
  return null;
}

// ============================================================================
// SCO — Samoczynne Częstotliwościowe Odciążenie
// ============================================================================

export interface ScoStage {
  /** Numer stopnia (1..N) */
  stage_no: number;
  /** Próg częstotliwości [Hz] (np. 49.0, 49.2, 49.5) */
  freq_threshold_hz: number;
  /** Procent odciążanej mocy w tym stopniu */
  shed_percent: number;
  /** Opóźnienie [s] */
  delay_s: number;
}

export interface ScoConfig {
  kind: 'SCO';
  device_id: string;
  enabled: boolean;
  /** Stopnie SCO — strict descending wg freq_threshold_hz (od wyższych progów) */
  stages: ReadonlyArray<ScoStage>;
}

export function validateSco(sco: ScoConfig): string | null {
  if (sco.stages.length === 0) return 'SCO musi mieć przynajmniej 1 stopień.';
  for (let i = 0; i < sco.stages.length; i += 1) {
    const s = sco.stages[i];
    if (s.stage_no !== i + 1) {
      return `SCO stopień[${i}].stage_no=${s.stage_no}, oczekiwano ${i + 1}.`;
    }
    if (!(s.freq_threshold_hz > 0 && s.freq_threshold_hz < 50)) {
      return `SCO stopień ${s.stage_no}: próg ${s.freq_threshold_hz} Hz spoza (0, 50).`;
    }
    if (!(s.shed_percent > 0 && s.shed_percent <= 100)) {
      return `SCO stopień ${s.stage_no}: shed_percent ${s.shed_percent}% spoza (0, 100].`;
    }
    if (i > 0 && s.freq_threshold_hz >= sco.stages[i - 1].freq_threshold_hz) {
      return `SCO stopień ${s.stage_no}: próg ${s.freq_threshold_hz} Hz ≥ poprzedni ${sco.stages[i - 1].freq_threshold_hz} Hz (wymagane malejąco).`;
    }
  }
  return null;
}

// ============================================================================
// FDIR — Fault Detection, Isolation & Restoration
// ============================================================================

export type FdirPhase = 'detection' | 'isolation' | 'restoration';

export interface FdirSequenceStep {
  step_no: number;
  phase: FdirPhase;
  /** Opis akcji (PL) */
  action_description_pl: string;
  /** Maks. czas wykonania [s] */
  max_duration_s: number;
}

export interface FdirConfig {
  kind: 'FDIR';
  device_id: string;
  enabled: boolean;
  /** Strefy lokalizacji (np. ["FEEDER_1_SECTION_A"]) */
  detection_zones: ReadonlyArray<string>;
  /** Sekwencja wykonania */
  sequence: ReadonlyArray<FdirSequenceStep>;
}

export function validateFdir(fdir: FdirConfig): string | null {
  if (fdir.sequence.length === 0) return 'FDIR musi mieć przynajmniej 1 krok sekwencji.';
  for (let i = 0; i < fdir.sequence.length; i += 1) {
    const s = fdir.sequence[i];
    if (s.step_no !== i + 1) {
      return `FDIR krok[${i}].step_no=${s.step_no}, oczekiwano ${i + 1}.`;
    }
    if (!(s.max_duration_s > 0)) return `FDIR krok ${s.step_no}: max_duration_s musi być > 0.`;
  }
  // Sprawdź, że fazy są w porządku detection → isolation → restoration
  const phaseOrder: Record<FdirPhase, number> = {
    detection: 0,
    isolation: 1,
    restoration: 2,
  };
  for (let i = 1; i < fdir.sequence.length; i += 1) {
    const prevPhase = phaseOrder[fdir.sequence[i - 1].phase];
    const currPhase = phaseOrder[fdir.sequence[i].phase];
    if (currPhase < prevPhase) {
      return `FDIR krok ${i + 1}: faza ${fdir.sequence[i].phase} przed ${fdir.sequence[i - 1].phase} (wymagane detection → isolation → restoration).`;
    }
  }
  return null;
}

// ============================================================================
// Union
// ============================================================================

export type AutomationConfig = SpzConfig | SzrConfig | ScoConfig | FdirConfig;

export function validateAutomation(cfg: AutomationConfig): string | null {
  switch (cfg.kind) {
    case 'SPZ':
      return validateSpz(cfg);
    case 'SZR':
      return validateSzr(cfg);
    case 'SCO':
      return validateSco(cfg);
    case 'FDIR':
      return validateFdir(cfg);
  }
}
