/**
 * PRESET G9 (GPO WIELOPOLOWE) — canonical template contract, the family culmination. DIFFERENT
 * source types on ONE 15 kV busbar: PV (IBG), synchronous genset (◯GS) and asynchronous wind
 * (◯G∼) — each bay with its own glyph + protection. SC at the busbar = sieć + maszyny (Z-bus) +
 * IBG (referred, F-1); the share is broken out per type. Reuses the validated conventions only.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { busbarDanglingConductors, glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG9 } from './SldCanonPresetG9';

const G9 = OZE_ARCHETYPES_2A['G9-GPO']; // multi-bay GPO companion (solver-bound, mixed sources)

const pl = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

function renderG9() {
  return render(
    <svg>
      <SldCanonPresetG9 companion={G9} />
    </svg>,
  );
}

describe('SldCanonPresetG9 — GPO wielopolowe (mixed sources on one busbar)', () => {
  it('one SN busbar + line/metering bays + N source bays of DIFFERENT kinds', () => {
    const { container } = renderG9();
    const txt = container.textContent ?? '';
    expect(container.querySelector('[data-testid="sld-canon-g9"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g9-src-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g9-src-2"]')).toBeTruthy();
    expect(txt).toContain('GPO');
    expect(txt).toContain('szyna GPO · 15 kV');
    expect(txt).not.toContain('30 kV');
    expect(txt).not.toContain('PCC');
    // the 3 distinct source kinds are bound to the field data (no glyph hard-coded by position).
    const kinds = Array.from(container.querySelectorAll('[data-source-kind]')).map((g) => g.getAttribute('data-source-kind'));
    expect(new Set(kinds)).toEqual(new Set(['IBG', 'SYNCHRONOUS', 'ASYNCHRONOUS']));
    // all three machine/IBG glyph marks are rendered.
    expect(txt).toContain('GS'); // synchronous ◯GS
    expect(txt).toContain('G∼'); // asynchronous ◯G∼
  });

  it('SC = sieć + maszyny (Z-bus) + IBG (referred); F-1 holds (IBG ≤ machine on the common bus)', () => {
    const sc = G9.short_circuit.buses['SN_PCC'].source_contribution;
    expect(sc.machine_type).toBe('MIXED');
    expect(sc.ibg_ka, 'IBG share').toBeGreaterThan(0);
    expect(sc.machine_ka, 'machine share').toBeGreaterThan(0);
    expect(sc.ibg_ka!).toBeLessThanOrEqual(sc.machine_ka!); // F-1 direction on a common busbar
    expect(sc.machines!.length).toBeGreaterThanOrEqual(2); // synchronous + asynchronous
    const txt = renderG9().container.textContent ?? '';
    expect(txt).toContain('sieć'); // sieć + masz + IBG breakdown in the readout
    expect(txt).toContain('IBG');
  });

  it('multi-band: PV/wind sources sit behind block transformers (damped), synchronous direct on SN', () => {
    // PV 0,4 kV + wind 0,69 kV LV buses exist (block transformers in the SC path).
    expect(G9.short_circuit.buses['PV_NN']?.un_kv).toBe(0.4);
    expect(G9.short_circuit.buses['WIND_NN']?.un_kv).toBe(0.69);
    // The source fields are bound to their bus: PV/wind on the LV bus, synchronous on SN.
    const onBus = (k: string) => G9.fields.find((f) => f.source_kind === k)?.on_bus_ref;
    expect(onBus('IBG')).toBe('PV_NN');
    expect(onBus('ASYNCHRONOUS')).toBe('WIND_NN');
    expect(onBus('SYNCHRONOUS')).toBe('SN_PCC'); // MV machine directly on the 15 kV busbar
    const txt = renderG9().container.textContent ?? '';
    expect(txt).toContain('TR 15/0,40 kV'); // PV block transformer rendered
    expect(txt).toContain('TR 15/0,69 kV'); // wind block transformer rendered
  });

  it('protection split per type: NC RfG interface; each bay carries its own machine/IBG set', () => {
    const iface = G9.fields.find((f) => f.interface_protection)?.protection_codes ?? [];
    expect(iface).toContain('anti-islanding');
    expect(iface).not.toContain('87G'); // no machine functions on the interface
    expect(iface).not.toContain('46');
    const byKind = (k: string) => G9.fields.find((f) => f.source_kind === k)?.protection_codes ?? [];
    expect(byKind('SYNCHRONOUS')).toEqual(expect.arrayContaining(['87G', '40', '32', '64']));
    expect(byKind('ASYNCHRONOUS')).toEqual(expect.arrayContaining(['46', '47', '49', '51']));
    expect(byKind('IBG')).toContain('anti-islanding');
  });

  it('readout bound to the FROZEN solver; metering = boundary; κ physical; ≤ Icw', () => {
    const txt = renderG9().container.textContent ?? '';
    const snSc = G9.short_circuit.buses['SN_PCC'];
    expect(txt).toContain(`${pl(snSc.max.ikss_ka)} / ${pl(snSc.min.ikss_ka)} kA`);
    expect(txt).toContain('POMIAR rozliczeniowy');
    expect(txt).toContain('granica = układ pomiarowy');
    expect(snSc.max.kappa).toBeGreaterThan(1.5); // grid-dominated busbar (X/R≈7, common _GRID_INFEED)
    expect(snSc.verification.passed).toBe(true); // Ik″ ≤ Icw
  });

  it('LAYOUT: no text-on-glyph overlap + no hanging conductor (continuity guard)', () => {
    const svg = renderG9().container.querySelector('svg')!;
    expect(glyphTextCollisions(svg, [130, 545]), 'G9 text-on-glyph collisions').toEqual([]);
    expect(busbarDanglingConductors(svg), 'G9 hanging conductors').toEqual([]);
  });
});
