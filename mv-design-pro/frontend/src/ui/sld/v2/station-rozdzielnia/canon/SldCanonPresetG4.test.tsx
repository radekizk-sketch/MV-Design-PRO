/**
 * PRESET G4 (PV+BESS hybrid) — canonical template contract for BOTH coupling variants:
 * SN_BUS (common 15 kV busbar, PV+BESS each behind their own transformer) and AC_LV (one
 * transformer → common nN bus). Both sources are IBG (PV inverters ~/= + bidirectional BESS
 * PCS 4Q); the SC share = the PV+BESS sum. Metering = boundary (no ⊟, no PCC). Readouts
 * bound to the FROZEN solver; collector voltage is ENEA-valid (15 kV, never 30 kV).
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { busbarDanglingConductors, glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG4 } from './SldCanonPresetG4';

const BUS = OZE_ARCHETYPES_2A['G4-PVBESS-BUS']; // SN-coupled hybrid (solver-bound, IBG)
const AC = OZE_ARCHETYPES_2A['G4-PVBESS-AC']; // AC-coupled hybrid (solver-bound, IBG)

const pl = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

function renderG4(c: typeof BUS) {
  return render(
    <svg>
      <SldCanonPresetG4 companion={c} />
    </svg>,
  );
}

describe('SldCanonPresetG4 — PV+BESS hybrid (both coupling variants)', () => {
  it('BUS: common SN busbar, two transformer bays, three node readouts (①②③)', () => {
    const { container } = renderG4(BUS);
    const txt = container.textContent ?? '';
    expect(container.querySelector('[data-testid="sld-canon-g4-bus"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g4bus-pv-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g4bus-pcs-1"]')).toBeTruthy();
    expect(txt).toContain('POLE · TR PV');
    expect(txt).toContain('POLE · TR BESS');
    expect(txt).toContain('szyna SN · 15 kV'); // ENEA-valid
    expect(txt).toContain('nN PV · 0,8 kV');
    expect(txt).toContain('nN BESS · 0,4 kV');
    expect(txt).not.toContain('30 kV');
    expect(txt).not.toContain('PCC');
  });

  it('AC: one transformer → common nN bus, two node readouts (①②)', () => {
    const { container } = renderG4(AC);
    const txt = container.textContent ?? '';
    expect(container.querySelector('[data-testid="sld-canon-g4-ac"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g4ac-pv-2"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g4ac-pcs-1"]')).toBeTruthy();
    expect(txt).toContain('AC-coupled');
    expect(txt).toContain('szyna SN · 15 kV');
    expect(txt).toContain('nN · 0,8 kV · IT');
    expect(txt).not.toContain('30 kV');
    expect(txt).not.toContain('PCC');
  });

  it('readouts bound to the FROZEN solver; metering = boundary (no PCC)', () => {
    for (const c of [BUS, AC]) {
      const txt = renderG4(c).container.textContent ?? '';
      const snSc = c.short_circuit.buses['SN_PCC'];
      expect(txt).toContain(`${pl(snSc.max.ikss_ka)} / ${pl(snSc.min.ikss_ka)} kA`);
      expect(txt).toContain('POMIAR rozliczeniowy');
      expect(txt).toContain('granica = układ pomiarowy');
      expect(txt).not.toContain('PCC');
    }
  });

  it('both PV (~/=) and BESS (4Q + battery) IBG sources are drawn + legended', () => {
    const txt = renderG4(BUS).container.textContent ?? '';
    expect(txt).toContain('FALOWNIK PV');
    expect(txt).toContain('PCS + bateria (4Q)');
    expect(txt).toContain('PV+BESS'); // SC share label = the PV + BESS sum
  });

  it('LAYOUT INVARIANT: no annotation text overlaps a canonical glyph (both variants)', () => {
    for (const c of [BUS, AC]) {
      const svg = renderG4(c).container.querySelector('svg')!;
      expect(glyphTextCollisions(svg, [130, 640]), 'G4 text-on-glyph collisions').toEqual([]);
    }
  });

  it('CONTINUITY: every transformer drop lands on its nN bus — no hanging conductor', () => {
    // The BESS-island defect: T-BESS dropping next to (not onto) the BESS nN bus.
    for (const c of [BUS, AC]) {
      const svg = renderG4(c).container.querySelector('svg')!;
      expect(busbarDanglingConductors(svg), 'G4 hanging conductors').toEqual([]);
    }
  });

  it('SC share at ① is the PV+BESS IBG REFERRED to SN (~0,09 kA), not the raw nN sum', () => {
    const txt = renderG4(BUS).container.textContent ?? '';
    const snIbg = BUS.short_circuit.buses['SN_PCC'].source_contribution.ik_contribution_ka ?? 0;
    expect(snIbg).toBeLessThan(0.2); // referred (~0.09), NOT ~2.6 kA
    expect(txt).toContain(`PV+BESS ${snIbg.toFixed(2).replace('.', ',')} kA`);
    // nN buses carry the larger LOCAL contribution (numerical share like ①).
    expect(BUS.short_circuit.buses['BESS_NN'].source_contribution.ik_contribution_ka).toBeGreaterThan(1);
  });
});
