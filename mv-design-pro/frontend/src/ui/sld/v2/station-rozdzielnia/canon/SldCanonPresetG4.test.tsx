/**
 * PRESET G4 (Wind Type 4) — canonical template contract. ONE 30 kV collector busbar with a
 * connection bay to OSD, a metering bay (CT in the current path on the busbar + VT/meter =
 * boundary, no ⊟, no PCC), and N turbine feeders — each with its own turbine transformer +
 * full converter (~/=) + generator (◯G). Node readouts bound to the FROZEN solver.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG4 } from './SldCanonPresetG4';

const G4 = OZE_ARCHETYPES_2A['G6-WIND']; // wind Type-4 companion (solver-bound, IBG)

function renderG4() {
  return render(
    <svg>
      <SldCanonPresetG4 companion={G4} />
    </svg>,
  );
}

const pl = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

describe('SldCanonPresetG4 — canonical wind Type 4 (G4)', () => {
  it('collector busbar + connection/metering bays + N turbine feeders (TR · ~/= · ◯G)', () => {
    const { container } = renderG4();
    const txt = container.textContent ?? '';
    expect(container.querySelector('[data-testid="sld-canon-g4"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g4-wtg-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g4-wtg-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g4-wtg-2"]')).toBeTruthy();
    expect(txt).toContain('POLE 1 · Liniowe');
    expect(txt).toContain('POLE 2 · Pomiarowe');
    expect(txt).toContain('POLE turbinowe');
    expect(txt).toContain('kolektor SN · 30 kV');
    expect(txt).toContain('Typ 4'); // full converter
    expect(txt).toContain('GENERATOR ◯G'); // WTG generator symbol in the legend
  });

  it('full-converter SC source = IBG (NOT a machine), stated on the canvas', () => {
    const txt = renderG4().container.textContent ?? '';
    expect(txt).toContain('IBG');
    expect(txt).toContain('NIE maszyna');
    expect(txt).toContain('~/=');
  });

  it('readouts bound to the FROZEN solver; metering = boundary (no ⊟ marker, no PCC)', () => {
    const txt = renderG4().container.textContent ?? '';
    const snSc = G4.short_circuit.buses['SN_PCC'];
    const lvSc = G4.short_circuit.buses['WTG_LV_1'];
    expect(txt).toContain(`${pl(snSc.max.ikss_ka)} / ${pl(snSc.min.ikss_ka)} kA`);
    expect(txt).toContain(`${pl(lvSc.max.ikss_ka)} / ${pl(lvSc.min.ikss_ka)} kA`);
    expect(txt).toContain('POMIAR rozliczeniowy');
    expect(txt).toContain('granica = układ pomiarowy');
    expect(txt).not.toContain('PCC');
  });

  it('LAYOUT INVARIANT: no annotation text overlaps a canonical glyph (shared check)', () => {
    const svg = renderG4().container.querySelector('svg')!;
    expect(glyphTextCollisions(svg, [130, 640]), 'G4 text-on-glyph collisions').toEqual([]);
  });
});
