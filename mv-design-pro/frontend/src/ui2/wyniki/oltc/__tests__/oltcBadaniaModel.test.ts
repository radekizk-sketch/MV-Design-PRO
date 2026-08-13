/** Model badań OLTC (H2): budowa solver_input + parsowanie wyniku. */

import { describe, expect, it } from 'vitest';

import {
  fmtDopuszczalna,
  fmtLiczbaPrzelaczen,
  fmtZnacznikTrojstanowy,
  opisKryterium,
  PARAMETRY_DOMYSLNE,
  parsujWynik,
  zbudujSolverInput,
  type ParametryBadania,
} from '../oltcBadaniaModel';

function params(nadpisz: Partial<ParametryBadania> = {}): ParametryBadania {
  return { ...PARAMETRY_DOMYSLNE, ...nadpisz };
}

describe('zbudujSolverInput', () => {
  it('sweep → tylko oltc_study', () => {
    expect(zbudujSolverInput(params({ rodzaj: 'sweep' }))).toEqual({ oltc_study: 'sweep' });
  });

  it('annual_profile → niesie profil obciążeń', () => {
    const input = zbudujSolverInput(
      params({ rodzaj: 'annual_profile', profil: [{ label: 'Noc', load_scale: 0.4 }] }),
    );
    expect(input).toEqual({
      oltc_study: 'annual_profile',
      oltc_load_profile: [{ label: 'Noc', load_scale: 0.4 }],
    });
  });

  it('optimize minimalizacja strat → bez napięcia docelowego', () => {
    const input = zbudujSolverInput(params({ rodzaj: 'optimize', cel: 'minimize_losses' }));
    expect(input).toEqual({ oltc_study: 'optimize', oltc_objective: 'minimize_losses' });
  });

  it('optimize utrzymanie napięcia → niesie oltc_target_kv', () => {
    const input = zbudujSolverInput(
      params({ rodzaj: 'optimize', cel: 'maintain_voltage', napiecieCelKv: 15.3 }),
    );
    expect(input).toMatchObject({ oltc_objective: 'maintain_voltage', oltc_target_kv: 15.3 });
  });
});

describe('parsujWynik', () => {
  it('wyciąga sweep z global_results', () => {
    const w = parsujWynik('sweep', { oltc_sweep: { branch_id: 'TR1', controlled_bus_id: 'b', points: [] } });
    expect(w.sweep?.branch_id).toBe('TR1');
    expect(w.profil).toBeUndefined();
  });

  it('wyciąga profil i optymalizację po rodzaju', () => {
    expect(parsujWynik('annual_profile', { oltc_annual_profile: { steps: [], total_switch_count: 0, steps_outside_deadband: 0 } }).profil).toBeDefined();
    expect(parsujWynik('optimize', { oltc_optimization: { branch_id: 'TR1', objective: 'minimize_losses', best_position: 0, initial_position: 0, switch_count: 0, candidates: [] } }).optymalizacja).toBeDefined();
  });

  it('brak klucza → pusty wynik', () => {
    expect(parsujWynik('sweep', {})).toEqual({});
  });
});

describe('opisKryterium — wartość i źródło kryterium dopuszczalności', () => {
  it('pasmo regulatora: pokazuje cel, połowę pasma i pełne pasmo z modelu', () => {
    const { tresc, zrodlo } = opisKryterium({
      kind: 'voltage_deadband',
      available: true,
      source: 'tap_changer_deadband',
      target_kv: 15.75,
      band_kv: 0.2,
      half_band_kv: 0.1,
    });
    expect(tresc).toContain('15.750 kV');
    expect(tresc).toContain('0.100 kV');
    expect(tresc).toContain('0.200 kV');
    expect(zrodlo).toContain('pasmo nieczułości przełącznika zaczepów z modelu');
  });

  it('odchyłka od napięcia docelowego: bez dodatkowego pasma', () => {
    const { tresc, zrodlo } = opisKryterium({
      kind: 'voltage_deviation',
      available: true,
      source: 'study_target_kv',
      target_kv: 15,
    });
    expect(tresc).toContain('15.000 kV');
    expect(zrodlo).toBe('napięcie docelowe podane w badaniu');
  });

  it('zbieżność rozpływu: źródłem jest wynik rozpływu', () => {
    const { tresc, zrodlo } = opisKryterium({
      kind: 'convergence',
      available: true,
      source: 'power_flow_convergence',
    });
    expect(tresc).toContain('rozpływ mocy');
    expect(zrodlo).toBe('wynik rozpływu mocy');
  });

  it('kryterium niedostępne → uczciwy stan bez wymyślonej wartości i bez źródła', () => {
    const { tresc, zrodlo } = opisKryterium({
      kind: 'voltage_deadband',
      available: false,
      readiness_codes: ['oltc.deadband_missing'],
    });
    expect(tresc).toContain('Nieustalone');
    expect(tresc).not.toContain('kV');
    expect(zrodlo).toBeNull();
    // Brak kryterium w odpowiedzi = ten sam uczciwy stan (starsza odpowiedź backendu).
    expect(opisKryterium(undefined).zrodlo).toBeNull();
  });
});

describe('formatery uczciwego braku', () => {
  it('liczba przełączeń: null → kreska (nie zero)', () => {
    expect(fmtLiczbaPrzelaczen(3)).toBe('3');
    expect(fmtLiczbaPrzelaczen(0)).toBe('0');
    expect(fmtLiczbaPrzelaczen(null)).toBe('—');
  });

  it('dopuszczalność: null to nie „nie" — to brak oceny', () => {
    expect(fmtDopuszczalna(true)).toBe('tak');
    expect(fmtDopuszczalna(false)).toBe('nie');
    expect(fmtDopuszczalna(null)).toBe('—');
  });

  it('znacznik trójstanowy: brak klucza w odpowiedzi (undefined) to kreska, nie „nie"', () => {
    // Kolumna „W paśmie" czyta pole OPCJONALNE kontraktu: gdy backend nie ma z
    // czego zbudować kryterium, klucza nie ma. Render dwustanowy zamieniał to
    // milcząco na „nie" (znalezisko N3).
    const bezOceny: Record<string, boolean | undefined> = {};
    expect(fmtZnacznikTrojstanowy(bezOceny.TR1)).toBe('—');
    expect(fmtZnacznikTrojstanowy(true)).toBe('tak');
    expect(fmtZnacznikTrojstanowy(false)).toBe('nie');
  });

  it('liczniki profilu: null (niedostępne) przechodzą przez formater na kreskę', () => {
    // Podsumowanie profilu bierze SFORMATOWANY tekst, więc „0" nie może się
    // pojawić tam, gdzie wielkości nie ma.
    expect(fmtLiczbaPrzelaczen(null)).toBe('—');
    expect(fmtLiczbaPrzelaczen(7)).toBe('7');
  });
});
