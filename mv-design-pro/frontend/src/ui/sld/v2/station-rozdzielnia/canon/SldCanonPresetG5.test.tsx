/**
 * PRESET G5 (Wind Type 4) — canonical template contract. ONE 15 kV collector busbar (ENEA
 * SN — 30 kV nie istnieje) with a connection bay to OSD, a metering bay (CT in the current
 * path on the busbar + VT/meter = boundary, no ⊟, no PCC), and N turbine feeders — each with
 * its own turbine transformer + full converter (~/=) + generator (◯G). Readouts bound to the
 * FROZEN solver (re-levelling 30→15 kV doubles the collector Ik″ at constant S_k″).
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG5 } from './SldCanonPresetG5';

const G5 = OZE_ARCHETYPES_2A['G5-WIND-T4']; // wind Type-4 companion (solver-bound, IBG)

function renderG5() {
  return render(
    <svg>
      <SldCanonPresetG5 companion={G5} />
    </svg>,
  );
}

const pl = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

describe('SldCanonPresetG5 — canonical wind Type 4 (G5)', () => {
  it('collector busbar + connection/metering bays + N turbine feeders (TR · ~/= · ◯G)', () => {
    const { container } = renderG5();
    const txt = container.textContent ?? '';
    expect(container.querySelector('[data-testid="sld-canon-g5"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g5-wtg-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g5-wtg-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="g5-wtg-2"]')).toBeTruthy();
    expect(txt).toContain('POLE 1 · Liniowe');
    expect(txt).toContain('POLE 2 · Pomiarowe');
    expect(txt).toContain('POLE turbinowe');
    expect(txt).toContain('kolektor SN · 15 kV'); // ENEA-valid, no 30 kV
    expect(txt).not.toContain('30 kV');
    expect(txt).toContain('Typ 4'); // full converter
    expect(txt).toContain('GENERATOR ◯G'); // WTG generator symbol in the legend
  });

  it('full-converter SC source = IBG (NOT a machine), stated on the canvas', () => {
    const txt = renderG5().container.textContent ?? '';
    expect(txt).toContain('IBG');
    expect(txt).toContain('NIE maszyna');
    expect(txt).toContain('~/=');
  });

  it('readouts bound to the FROZEN solver; metering = boundary (no ⊟ marker, no PCC)', () => {
    const txt = renderG5().container.textContent ?? '';
    const snSc = G5.short_circuit.buses['SN_PCC'];
    const lvSc = G5.short_circuit.buses['WTG_LV_1'];
    expect(txt).toContain(`${pl(snSc.max.ikss_ka)} / ${pl(snSc.min.ikss_ka)} kA`);
    expect(txt).toContain(`${pl(lvSc.max.ikss_ka)} / ${pl(lvSc.min.ikss_ka)} kA`);
    expect(txt).toContain('POMIAR rozliczeniowy');
    expect(txt).toContain('granica = układ pomiarowy');
    expect(txt).not.toContain('PCC');
  });

  it('LAYOUT INVARIANT: no annotation text overlaps a canonical glyph (shared check)', () => {
    const svg = renderG5().container.querySelector('svg')!;
    expect(glyphTextCollisions(svg, [130, 640]), 'G5 text-on-glyph collisions').toEqual([]);
  });
});
