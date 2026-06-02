/**
 * PRESET G2 (PV nN, prosument) — canonical template contract. Reduced skeleton (direct
 * LV connection to the OSD network, no own SN tier/TR), shared symbol canon + readout,
 * node readout bound to the FROZEN solver. Pixel composition reviewed visually.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG2 } from './SldCanonPresetG2';

const G2 = OZE_ARCHETYPES_2A['G1']; // prosumer PV-nN companion (solver-bound)

function renderG2() {
  return render(
    <svg>
      <SldCanonPresetG2 companion={G2} />
    </svg>,
  );
}

const pl = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

describe('SldCanonPresetG2 — canonical PV nN prosumer (G2)', () => {
  it('reduced skeleton: nN busbar + OSD złącze + PV + odbiór, NO SN tier / step-up TR', () => {
    const txt = renderG2().container.textContent ?? '';
    expect(renderG2().container.querySelector('[data-testid="sld-canon-g2"]')).toBeTruthy();
    expect(txt).toContain('SIEĆ OSD nN');
    expect(txt).toContain('nN · 0,4 kV · TN');
    expect(txt).toContain('LICZNIK'); // bidirectional billing meter
    expect(txt).toContain('wyłącznik główny odbiorcy'); // RGB
    expect(txt).toContain('ODBIÓR');
    expect(txt).not.toContain('POLE 1'); // no SN bays
    expect(txt).not.toContain('Dyn5'); // the OSD MV/LV TR is upstream, not the prosumer's
  });

  it('the billing meter is the boundary AND sits BEFORE the consumer main breaker', () => {
    const txt = renderG2().container.textContent ?? '';
    // The meter = the ownership/operation boundary (no separate ⊟ marker).
    expect(txt).toContain('GRANICA własności/eksploatacji (= licznik)');
    // Render (top→down) order: the meter is rendered ABOVE (upstream of) the main breaker —
    // a meter behind the breaker would let the consumer stop being metered (metering nonsense).
    expect(txt.indexOf('LICZNIK')).toBeLessThan(txt.indexOf('wyłącznik główny odbiorcy'));
  });

  it('node readout bound to the FROZEN solver (Ik″/ip from companion; 1f-z = TN param)', () => {
    const txt = renderG2().container.textContent ?? '';
    const sc = G2.short_circuit.buses['NN_BUS'];
    const w = G2.source.withstand!;
    const e = G2.source.grid_earthing!;
    expect(txt).toContain(`${pl(sc.max.ikss_ka)} / ${pl(sc.min.ikss_ka)} kA`);
    expect(txt).toContain(`${pl(sc.max.ip_ka)} kA · idyn ${w.nn_idyn_ka.toFixed(0)}`);
    // TN system: 1st earth fault carries current (no IMD), from the OSD neutral earthing.
    expect(txt).toContain(`${e.ik_1f_ka.toFixed(2).replace('.', ',')} kA · ${e.neutral_point}`);
    expect(e.imd_it_nn).toBe(false);
  });

  it('LAYOUT INVARIANT: no annotation text overlaps a canonical glyph (shared check)', () => {
    const svg = renderG2().container.querySelector('svg')!;
    expect(glyphTextCollisions(svg, [110, 600]), 'G2 text-on-glyph collisions').toEqual([]);
  });
});
