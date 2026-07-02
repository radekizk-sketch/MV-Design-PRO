/**
 * PRESET G7 (Wind Type 1 / asynchronous) — canonical template contract. The shared wind skeleton
 * with a SQUIRREL-CAGE induction generator wired directly to the grid (no power-electronic
 * converter, reactive compensation by a capacitor bank). SC is classical (PN-EN 60909 §6.7) — an
 * asynchronous machine behind Z_M, the share referred per-bus by the solver. Metering = boundary
 * (no ⊟, no PCC). κ physical.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { busbarDanglingConductors, glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG7 } from './SldCanonPresetG7';

const G7 = OZE_ARCHETYPES_2A['G7-WIND-ASYNC']; // wind Type-1 induction companion (solver-bound, machine)

const pl = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

function renderG7() {
  return render(
    <svg>
      <SldCanonPresetG7 companion={G7} />
    </svg>,
  );
}

describe('SldCanonPresetG7 — wind Type 1 (asynchronous)', () => {
  it('collector + line/metering bays + N turbine feeders (induction machine, no converter)', () => {
    const { container } = renderG7();
    const txt = container.textContent ?? '';
    expect(container.querySelector('[data-testid="sld-canon-g7"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g7-wtg-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g7-wtg-2"]')).toBeTruthy();
    expect(txt).toContain('Typ 1'); // induction, not Typ 4/3
    expect(txt).toContain('indukcyjny');
    expect(txt).toContain('kolektor SN · 15 kV'); // ENEA-valid
    expect(txt).not.toContain('30 kV');
    expect(txt).not.toContain('PCC');
    expect(txt).not.toContain('crowbar'); // DFIG-only — Typ 1 has no rotor converter
    expect(txt).not.toContain('DFIG');
  });

  it('SC = ASYNCHRONOUS machine (PN-EN 60909 §6.7), NOT IBG; share referred per-bus', () => {
    for (const bus of Object.values(G7.short_circuit.buses)) {
      expect(bus.source_contribution.machine_type).toBe('ASYNCHRONOUS');
      expect(bus.source_contribution.is_synchronous_machine).toBe(false);
    }
    const txt = renderG7().container.textContent ?? '';
    expect(txt).toContain('maszyna'); // sieć + maszyna decomposition (not an IBG "WTG" tag)
    expect(txt).toContain('klatkow'); // squirrel-cage
    const snMach = G7.short_circuit.buses['SN_PCC'].source_contribution.ik_contribution_ka ?? 0;
    const lvMach = G7.short_circuit.buses['WTG_LV_1'].source_contribution.ik_contribution_ka ?? 0;
    expect(snMach).toBeGreaterThan(0); // referred to the collector through the turbine TR
    expect(lvMach).toBeGreaterThan(snMach); // terminal share is the LOCAL machine (large)
  });

  it('protection split matches G6: NC RfG interface (df/dt + anti-islanding, NO 46/47); machine separate', () => {
    // Interface (connection bay, NC RfG) — directional OC + U/f + RoCoF + anti-islanding; the
    // 46/47 neg-seq are MACHINE functions and MUST NOT sit on the interface (audit #5).
    const iface = G7.fields.find((f) => f.interface_protection)?.protection_codes ?? [];
    expect(iface).toContain('df/dt');
    expect(iface).toContain('anti-islanding'); // critical — self-excitation from the Q-comp bank
    expect(iface).not.toContain('46');
    expect(iface).not.toContain('47');
    // Machine functions live on source.protection (split), no rotor converter for Typ 1.
    const mach = G7.source.protection?.machine ?? [];
    expect(mach).toEqual(expect.arrayContaining(['46', '47', '49', '51', '37', '32']));
    expect(G7.source.protection?.converter).toEqual([]);
    const txt = renderG7().container.textContent ?? '';
    expect(txt).toContain('anti-islanding'); // rendered on the interface zone
    expect(txt).toContain('zab. maszyny'); // machine-protection note (split from interface)
  });

  it('readouts bound to the FROZEN solver; metering = boundary; κ physical', () => {
    const txt = renderG7().container.textContent ?? '';
    const snSc = G7.short_circuit.buses['SN_PCC'];
    expect(txt).toContain(`${pl(snSc.max.ikss_ka)} / ${pl(snSc.min.ikss_ka)} kA`);
    expect(txt).toContain('POMIAR rozliczeniowy');
    expect(txt).toContain('granica = układ pomiarowy');
    expect(snSc.max.kappa).toBeGreaterThan(1.5); // grid-dominated collector (X/R≈7)
  });

  it('LAYOUT: no text-on-glyph overlap + no hanging conductor (continuity guard)', () => {
    const svg = renderG7().container.querySelector('svg')!;
    expect(glyphTextCollisions(svg, [130, 640]), 'G7 text-on-glyph collisions').toEqual([]);
    expect(busbarDanglingConductors(svg), 'G7 hanging conductors').toEqual([]);
  });
});
