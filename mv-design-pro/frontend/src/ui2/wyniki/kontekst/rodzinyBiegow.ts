/*
 * Rodziny analiz i JEDEN porządek biegów (karta K8) — liść bez magazynów, z którego
 * korzysta magazyn kontekstu wyniku (`kontekstWyniku.ts`) i czyste modele ekranów
 * (np. macierz analiz stacji), które z założenia nie czytają magazynów. Każda lista
 * biegów w aplikacji, z której wynika „najnowszy", porządkuje się TU — dawne kopie
 * porządkowały po różnych polach (czas zakończenia, utworzenia, kolejność listy).
 */
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { ANALYSIS_TYPE_LABELS } from '../../../ui/study-cases/types';
import { etykietaZeSlownika } from '../wzorzec/slownikWyliczen';

// ---------------------------------------------------------------------------
// Rodziny analiz
// ---------------------------------------------------------------------------

/** Rodzina analizy — jednostka „aktywnego biegu" (rozpływ, zwarcie, dynamika … osobno). */
export type RodzinaAnalizy =
  | 'rozplyw'
  | 'zwarcie'
  | 'fazowy'
  | 'zabezpieczenia'
  | 'dynamika'
  | 'akademickie';

/** Stała kolejność rodzin (pasek stanu, testy) — deterministyczna. */
export const RODZINY_ANALIZ: readonly RodzinaAnalizy[] = [
  'rozplyw',
  'zwarcie',
  'fazowy',
  'zabezpieczenia',
  'dynamika',
  'akademickie',
];

export const ETYKIETA_RODZINY: Readonly<Record<RodzinaAnalizy, string>> = {
  rozplyw: 'Rozpływ',
  zwarcie: 'Zwarcia',
  fazowy: 'Stan fazowy',
  zabezpieczenia: 'Zabezpieczenia',
  dynamika: 'Dynamika',
  akademickie: 'Analizy akademickie',
};

/**
 * Rodzina analizy z rodzaju biegu rejestru (`ExecutionAnalysisType`, w tym biegi V12.6
 * `V126_*` listowane przez ten sam rejestr). Rodzaj spoza słownika → `null` (bieg
 * nie należy do żadnej rodziny — nie zgadujemy).
 */
export function rodzinaAnalizy(typ: string): RodzinaAnalizy | null {
  if (typ === 'LOAD_FLOW') return 'rozplyw';
  if (typ === 'SC_3F' || typ === 'SC_1F' || typ === 'SC_2F' || typ === 'SC_2F_G') return 'zwarcie';
  if (typ === 'PHASE_STATE_SN' || typ === 'PF_UNBALANCED') return 'fazowy';
  if (typ === 'PROTECTION') return 'zabezpieczenia';
  if (typ === 'DYNAMIKA_RMS') return 'dynamika';
  if (typ.startsWith('V126_')) return 'akademickie';
  return null;
}

/** Etykieta PL rodzaju biegu (słownik rejestru; rodzaj spoza słownika — jego kod). */
export function etykietaRodzajuBiegu(typ: string): string {
  return etykietaZeSlownika(ANALYSIS_TYPE_LABELS, typ);
}

// ---------------------------------------------------------------------------
// Porządek biegów i wybór aktywnego (czyste funkcje)
// ---------------------------------------------------------------------------

function znacznikCzasu(run: ExecutionRun): string {
  return run.finished_at ?? run.started_at ?? run.created_at ?? '';
}

/** Biegi od najnowszego (znacznik zakończenia → rozpoczęcia → utworzenia; remis: id). */
export function uporzadkujBiegi(runs: readonly ExecutionRun[]): ExecutionRun[] {
  return [...runs].sort((a, b) => {
    const roznica = znacznikCzasu(b).localeCompare(znacznikCzasu(a));
    return roznica !== 0 ? roznica : b.id.localeCompare(a.id);
  });
}

/** Zakończone (DONE) biegi rejestru, najnowszy na górze. */
export function biegiZakonczone(runs: readonly ExecutionRun[]): ExecutionRun[] {
  return uporzadkujBiegi(runs.filter((run) => run.status === 'DONE'));
}

/** Zakończone biegi jednej rodziny, najnowszy na górze. */
export function biegiRodziny(runs: readonly ExecutionRun[], rodzina: RodzinaAnalizy): ExecutionRun[] {
  return biegiZakonczone(runs).filter((run) => rodzinaAnalizy(run.analysis_type) === rodzina);
}
