/**
 * PRESET G3 (BESS, 4Q) — canonical template contract. SN+TR skeleton with a bidirectional
 * PCS source; SoC/BMS live state in the module (not on the canvas); metering via CT/VT on
 * the SN busbar (= boundary, no ⊟, no PCC); node readouts bound to the FROZEN solver.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG3 } from './SldCanonPresetG3';

const G3 = OZE_ARCHETYPES_2A['G5-BESS']; // BESS companion (solver-bound, bidirectional)

function renderG3() {
  return render(
    <svg>
      <SldCanonPresetG3 companion={G3} />
    </svg>,
  );
}

const pl = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

describe('SldCanonPresetG3 — canonical BESS (G3, 4Q)', () => {
  it('SN+TR skeleton with bidirectional PCS + own needs', () => {
    const { container } = renderG3();
    const txt = container.textContent ?? '';
    expect(container.querySelector('[data-testid="sld-canon-g3"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g3-pcs-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g3-pcs-1"]')).toBeTruthy();
    expect(txt).toContain('POLE · Transformatorowe');
    expect(txt).toContain('POLE · Liniowe');
    expect(txt).toContain('PCS 1 · 500 kW');
    expect(txt).toContain('4Q'); // bidirectional / four-quadrant
    expect(txt).toContain('pot. własne (HVAC/BMS)');
  });

  it('SoC/BMS live state points to the module — NOT a value painted on the canvas', () => {
    const txt = renderG3().container.textContent ?? '';
    expect(txt).toContain('SoC');
    expect(txt).toContain('moduł magazynu');
    expect(txt).not.toMatch(/SoC\s*[:=]\s*\d/); // no SoC value on the canvas
  });

  it('readouts bound to the FROZEN solver; metering = boundary (no ⊟ marker, no PCC)', () => {
    const txt = renderG3().container.textContent ?? '';
    const snSc = G3.short_circuit.buses['SN_PCC'];
    const nnSc = G3.short_circuit.buses['NN'];
    expect(txt).toContain(`${pl(snSc.max.ikss_ka)} / ${pl(snSc.min.ikss_ka)} kA`);
    expect(txt).toContain(`${pl(nnSc.max.ikss_ka)} / ${pl(nnSc.min.ikss_ka)} kA`);
    expect(txt).toContain('pomiar rozliczeniowy');
    expect(txt).toContain('granica = układ pomiarowy');
    expect(txt).not.toContain('PCC');
  });

  it('LAYOUT INVARIANT: no annotation text overlaps a canonical glyph (shared check)', () => {
    const svg = renderG3().container.querySelector('svg')!;
    expect(glyphTextCollisions(svg, [130, 800]), 'G3 text-on-glyph collisions').toEqual([]);
  });
});
