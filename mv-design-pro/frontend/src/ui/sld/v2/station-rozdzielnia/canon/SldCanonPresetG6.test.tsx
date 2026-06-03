/**
 * PRESET G6 (Wind Type 3 / DFIG) — canonical template contract. The G5 wind skeleton with a
 * ROTATING-MACHINE source: stator ◯ on the grid + a PARTIAL rotor converter ~/=. SC is
 * classical (PN-EN 60909) — a machine behind X″ (crowbar → cage), the share referred per-bus
 * by the solver and HIGHER than Typ-4's IBG. Metering = boundary (no ⊟, no PCC). κ physical.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { busbarDanglingConductors, glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG6 } from './SldCanonPresetG6';

const G6 = OZE_ARCHETYPES_2A['G6-WIND-DFIG']; // wind Type-3 DFIG companion (solver-bound, machine)

const pl = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

function renderG6() {
  return render(
    <svg>
      <SldCanonPresetG6 companion={G6} />
    </svg>,
  );
}

describe('SldCanonPresetG6 — wind Type 3 (DFIG)', () => {
  it('collector + line/metering bays + N turbine feeders (machine ◯ + partial converter)', () => {
    const { container } = renderG6();
    const txt = container.textContent ?? '';
    expect(container.querySelector('[data-testid="sld-canon-g6"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g6-wtg-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g6-wtg-2"]')).toBeTruthy();
    expect(txt).toContain('Typ 3'); // DFIG, not Typ 4
    expect(txt).toContain('DFIG');
    expect(txt).toContain('kolektor SN · 15 kV'); // ENEA-valid
    expect(txt).not.toContain('30 kV');
    expect(txt).not.toContain('PCC');
  });

  it('SC = MACHINE (PN-EN 60909), NOT IBG — crowbar; share referred per-bus, > Typ 4', () => {
    for (const bus of Object.values(G6.short_circuit.buses)) {
      expect(bus.source_contribution.machine_type).toBe('DFIG');
      expect(bus.source_contribution.is_synchronous_machine).toBe(false);
    }
    const txt = renderG6().container.textContent ?? '';
    expect(txt).toContain('maszyna'); // sieć + maszyna decomposition (not IBG "WTG")
    expect(txt).toContain('crowbar');
    expect(txt).toContain('stojan'); // DFIG stator on the grid
    const snMach = G6.short_circuit.buses['SN_PCC'].source_contribution.ik_contribution_ka ?? 0;
    const lvMach = G6.short_circuit.buses['WTG_LV_1'].source_contribution.ik_contribution_ka ?? 0;
    expect(snMach).toBeGreaterThan(0.5); // ~0.97 kA referred (vs a Typ-4 IBG ~0.28 kA)
    expect(lvMach).toBeGreaterThan(snMach); // terminal share is LOCAL machine (large)
  });

  it('readouts bound to the FROZEN solver; metering = boundary; κ physical (not inverted)', () => {
    const txt = renderG6().container.textContent ?? '';
    const snSc = G6.short_circuit.buses['SN_PCC'];
    expect(txt).toContain(`${pl(snSc.max.ikss_ka)} / ${pl(snSc.min.ikss_ka)} kA`);
    expect(txt).toContain('POMIAR rozliczeniowy');
    expect(txt).toContain('granica = układ pomiarowy');
    // collector κ physical (grid X/R≈7), terminal more inductive (machine X″) — DFIG signature
    expect(snSc.max.kappa).toBeGreaterThan(1.5);
    expect(G6.short_circuit.buses['WTG_LV_1'].max.kappa).toBeGreaterThan(snSc.max.kappa);
  });

  it('LAYOUT: no text-on-glyph overlap + no hanging conductor (continuity guard)', () => {
    const svg = renderG6().container.querySelector('svg')!;
    expect(glyphTextCollisions(svg, [130, 640]), 'G6 text-on-glyph collisions').toEqual([]);
    expect(busbarDanglingConductors(svg), 'G6 hanging conductors').toEqual([]);
  });
});
