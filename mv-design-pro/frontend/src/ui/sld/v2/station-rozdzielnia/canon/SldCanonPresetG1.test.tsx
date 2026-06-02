/**
 * PRESET G1 (PV 1 MW, IEC) — canonical template contract. Verifies the shared
 * skeleton, the IEC symbol canon (legend), and that node readouts are bound to the
 * FROZEN solver companion (never placeholders) — the DoD (§8) checks that can be
 * asserted on the render. Pixel composition is reviewed visually.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { SldCanonPresetG1 } from './SldCanonPresetG1';

const G1 = OZE_ARCHETYPES_2A['G4-PVTR']; // PV 1 MW companion (solver-bound)

function renderG1() {
  return render(
    <svg>
      <SldCanonPresetG1 companion={G1} />
    </svg>,
  );
}

const pl = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

describe('SldCanonPresetG1 — canonical PV 1 MW template (G1)', () => {
  it('renders the shared skeleton: SN busbar + 3 named bays + nN + 4 inverters', () => {
    const { container } = renderG1();
    expect(container.querySelector('[data-testid="sld-canon-g1"]')).toBeTruthy();
    for (const i of [0, 1, 2, 3]) {
      expect(container.querySelector(`[data-testid="g1-inv-${i}"]`), `inverter bay ${i}`).toBeTruthy();
    }
    const txt = container.textContent ?? '';
    expect(txt).toContain('POLE 1 · Transformatorowe');
    expect(txt).toContain('POLE 2 · Pomiarowe');
    expect(txt).toContain('POLE 3 · Liniowe');
    expect(txt).toContain('T1 · Dyn5');
  });

  it('binds node readouts ①② to the FROZEN solver (Ik″ 3f straight from the companion)', () => {
    const { container } = renderG1();
    const txt = container.textContent ?? '';
    const sn = G1.short_circuit.buses['SN_PCC'];
    const nn = G1.short_circuit.buses['NN_800'];
    expect(txt).toContain(`${pl(sn.max.ikss_ka)} / ${pl(sn.min.ikss_ka)} kA`); // 9,9 / 8,7
    expect(txt).toContain(`${pl(nn.max.ikss_ka)} / ${pl(nn.min.ikss_ka)} kA`); // 13,3 / 11,6
    expect(txt).toContain(`Icw`);
    expect(txt).toContain('≈0 (IT)'); // nN single-phase fault on an IT system
  });

  it('uses the IEC symbol canon — legend documents every glyph (§2)', () => {
    const { container } = renderG1();
    const txt = container.textContent ?? '';
    for (const s of [
      'LEGENDA — symbole IEC',
      'WYŁĄCZNIK',
      'ODŁĄCZNIK',
      'UZIEMNIK (IEC)',
      'CT — pierścień',
      'VT — bez ziemi',
      'GŁOWICA',
      'FALOWNIK',
    ]) {
      expect(txt).toContain(s);
    }
  });

  it('carries the metering bay (CT AD11 / VT FD11 / POMIAR) and the OSD boundary (GRANICA)', () => {
    const txt = (renderG1().container.textContent ?? '');
    expect(txt).toContain('CT AD11 · 40/5/5/5');
    expect(txt).toContain('VT FD11');
    expect(txt).toContain('POMIAR rozliczeniowy');
    expect(txt).toContain('GRANICA');
    expect(txt).toContain('G-ZKSN → OSD');
  });
});
