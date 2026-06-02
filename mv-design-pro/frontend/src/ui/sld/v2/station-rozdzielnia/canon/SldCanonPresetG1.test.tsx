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

  it('SN U readout is the consistent nominal placeholder (15,75 kV · 1,00 pu) pending §5', () => {
    const txt = renderG1().container.textContent ?? '';
    // U shows the NOMINAL voltage at the solved pu (rounded) — internally consistent;
    // the real value (possible export voltage rise) arrives from the solver in §5.
    expect(txt).toContain('15,75 kV · 1,00 pu');
    expect(txt).toContain('0,80 kV · 1,00 pu');
  });

  it('§5 readouts: ip beside Icw (dynamic withstand) + Ik″1f-z from OSD neutral earthing + IMD-IT', () => {
    const txt = renderG1().container.textContent ?? '';
    const sn = G1.short_circuit.buses['SN_PCC'];
    const nn = G1.short_circuit.buses['NN_800'];
    const e = G1.source.grid_earthing!;
    const w = G1.source.withstand!;
    expect(e, 'G1 carries the §5 OSD neutral-earthing model').toBeTruthy();
    // P1 — ip (peak) checked against the equipment dynamic withstand (idyn), beside Icw.
    expect(txt).toContain(`${pl(sn.max.ip_ka)} kA · idyn ${w.sn_idyn_ka.toFixed(0)}`);
    expect(txt).toContain(`${pl(nn.max.ip_ka)} kA · idyn ${w.nn_idyn_ka.toFixed(0)}`);
    // P0 — Ik″1f-z (SN) bound to the OSD neutral-point earthing parameter (not hardcoded).
    expect(txt).toContain(`${e.ik_1f_ka.toFixed(2).replace('.', ',')} kA · ${e.neutral_point}`);
    // P0 — IT nN: 1st earth fault signalled by the IMD (current ≈ 0, no trip).
    expect(txt).toContain('≈0 (IT) · IMD');
  });

  it('LAYOUT INVARIANT: no annotation text overlaps a canonical glyph (bounding-box §POZYCJE)', () => {
    // Hard rule: zero text-on-glyph overlap. Every canonical symbol carries a
    // data-keepout box; every annotation text (not inside a glyph group) must clear
    // them. Locked here so the POLE-1 relay/uziemnik collision cannot recur in G2–G9.
    const svg = renderG1().container.querySelector('svg')!;
    const keepouts = Array.from(svg.querySelectorAll('[data-keepout]')).map((el) => {
      const [x, y, w, h] = (el.getAttribute('data-keepout') ?? '').split(',').map(Number);
      return { x0: x, y0: y, x1: x + w, y1: y + h };
    });
    expect(keepouts.length).toBeGreaterThan(10);

    const CHAR = 0.62; // monospace advance ≈ 0.6·fontSize (slight over-estimate)
    const BAND = [130, 820]; // schematic band (excludes header + legend)
    const offenders: string[] = [];
    for (const t of Array.from(svg.querySelectorAll('text'))) {
      if (t.closest('[data-keepout]')) continue; // a symbol's own internal label
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      const size = Number(t.getAttribute('font-size'));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size)) continue;
      if (y < BAND[0] || y > BAND[1]) continue;
      const anchor = t.getAttribute('text-anchor') ?? 'start';
      const w = (t.textContent ?? '').length * size * CHAR;
      const tx0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
      const box = { x0: tx0, x1: tx0 + w, y0: y - size, y1: y + 2 };
      for (const k of keepouts) {
        if (box.x0 < k.x1 && box.x1 > k.x0 && box.y0 < k.y1 && box.y1 > k.y0) {
          offenders.push(`"${t.textContent}" @(${x},${y}) ∩ keepout(${k.x0},${k.y0},${k.x1},${k.y1})`);
          break;
        }
      }
    }
    expect(offenders, `text-on-glyph collisions:\n${offenders.join('\n')}`).toEqual([]);
  });
});
