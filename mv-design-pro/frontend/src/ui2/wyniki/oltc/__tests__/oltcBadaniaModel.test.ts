/** Model badań OLTC (H2): budowa solver_input + parsowanie wyniku. */

import { describe, expect, it } from 'vitest';

import {
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
