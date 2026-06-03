/**
 * PRESET G8 (Biogazownia / kogeneracja SYNCHRONICZNA) — canonical template contract. The first
 * synchronous machine directly on the grid: N gensets on ONE 15 kV busbar, no LV tier, no
 * transformer. SC is classical (PN-EN 60909 §6.3) and SUSTAINED by excitation — it does NOT decay
 * to the grid-only like induction. Full synchronous-generator protection (87G/40/32/64…), split
 * from the NC RfG interface. Metering = boundary (no ⊟, no PCC).
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { busbarDanglingConductors, glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG8 } from './SldCanonPresetG8';

const G8 = OZE_ARCHETYPES_2A['G8-BIOGAZ']; // synchronous cogeneration companion (solver-bound, machine)

const pl = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

function renderG8() {
  return render(
    <svg>
      <SldCanonPresetG8 companion={G8} />
    </svg>,
  );
}

describe('SldCanonPresetG8 — synchronous cogeneration', () => {
  it('ONE SN busbar + line/metering bays + N genset feeders (machine directly on the grid)', () => {
    const { container } = renderG8();
    const txt = container.textContent ?? '';
    expect(container.querySelector('[data-testid="sld-canon-g8"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g8-gen-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g8-gen-1"]')).toBeTruthy();
    expect(txt).toContain('synchroniczn');
    expect(txt).toContain('GS'); // synchronous-machine glyph mark (distinct from async ◯G∼)
    expect(txt).toContain('szyna SN · 15 kV'); // ENEA-valid, single busbar
    expect(txt).not.toContain('30 kV');
    expect(txt).not.toContain('PCC');
    expect(txt).not.toContain('przekształtnik'); // no converter — machine straight on the grid
  });

  it('SC = SYNCHRONOUS machine (§6.3), SUSTAINED by excitation (not decaying like induction)', () => {
    const sc = G8.short_circuit.buses['SN_PCC'].source_contribution;
    expect(sc.machine_type).toBe('SYNCHRONOUS');
    expect(sc.is_synchronous_machine).toBe(true);
    const txt = renderG8().container.textContent ?? '';
    expect(txt).toContain('maszyna'); // sieć + maszyna decomposition
    expect(txt).toContain('wzbudzeni'); // sustained by excitation
    expect(txt).toContain('NIE zanika'); // the synchronous distinction vs induction
    expect(sc.ik_contribution_ka ?? 0).toBeGreaterThan(0);
  });

  it('protection: NC RfG interface (df/dt + anti-islanding, NO 87/40); FULL generator set separate', () => {
    const iface = G8.fields.find((f) => f.interface_protection)?.protection_codes ?? [];
    expect(iface).toContain('anti-islanding');
    expect(iface).toContain('df/dt');
    expect(iface).not.toContain('87'); // 87G is a MACHINE function, not interface
    expect(iface).not.toContain('40');
    const mach = G8.source.protection?.machine ?? [];
    expect(mach).toEqual(expect.arrayContaining(['87G', '40', '32', '64'])); // full generator set
    const txt = renderG8().container.textContent ?? '';
    expect(txt).toContain('zab. generatora'); // generator-protection note (split from interface)
    expect(txt).toContain('87G');
  });

  it('readout bound to the FROZEN solver; metering = boundary; κ physical', () => {
    const txt = renderG8().container.textContent ?? '';
    const snSc = G8.short_circuit.buses['SN_PCC'];
    expect(txt).toContain(`${pl(snSc.max.ikss_ka)} / ${pl(snSc.min.ikss_ka)} kA`);
    expect(txt).toContain('POMIAR rozliczeniowy');
    expect(txt).toContain('granica = układ pomiarowy');
    expect(snSc.max.kappa).toBeGreaterThan(1.5); // grid-dominated busbar (X/R≈7)
  });

  it('LAYOUT: no text-on-glyph overlap + no hanging conductor (continuity guard)', () => {
    const svg = renderG8().container.querySelector('svg')!;
    expect(glyphTextCollisions(svg, [130, 580]), 'G8 text-on-glyph collisions').toEqual([]);
    expect(busbarDanglingConductors(svg), 'G8 hanging conductors').toEqual([]);
  });
});
