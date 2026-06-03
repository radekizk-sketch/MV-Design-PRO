/**
 * DoD §8 — formal acceptance for the canonical OZE preset family. Every preset on the
 * shared skeleton/kit is held to the same criteria: IEC symbol canon (§8.1), node
 * readouts bound to the FROZEN solver (§8.3), the OSD safety data model present (§8.4 —
 * OSD neutral earthing + dynamic withstand), and a clean render with zero text-on-glyph
 * overlap (§8.5, bounding-box). Z2: a ✓ here means the data + layout were verified, not
 * assumed. New presets (G3…G9) add a row and inherit the whole checklist.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG1 } from './SldCanonPresetG1';
import { SldCanonPresetG2 } from './SldCanonPresetG2';
import { SldCanonPresetG3 } from './SldCanonPresetG3';
import { SldCanonPresetG4 } from './SldCanonPresetG4';
import { SldCanonPresetG5 } from './SldCanonPresetG5';

const f1 = (v: number) => v.toFixed(1).replace('.', ',');

const PRESETS = [
  {
    name: 'G1 — PV 1 MW (SN)',
    companion: OZE_ARCHETYPES_2A['G4-PVTR'],
    bus: 'SN_PCC',
    band: [130, 820] as [number, number],
    render: () => <SldCanonPresetG1 companion={OZE_ARCHETYPES_2A['G4-PVTR']} />,
  },
  {
    name: 'G2 — PV nN (prosument)',
    companion: OZE_ARCHETYPES_2A['G1'],
    bus: 'NN_BUS',
    band: [110, 600] as [number, number],
    render: () => <SldCanonPresetG2 companion={OZE_ARCHETYPES_2A['G1']} />,
  },
  {
    name: 'G3 — BESS (4Q)',
    companion: OZE_ARCHETYPES_2A['G5-BESS'],
    bus: 'SN_PCC',
    band: [130, 800] as [number, number],
    render: () => <SldCanonPresetG3 companion={OZE_ARCHETYPES_2A['G5-BESS']} />,
  },
  {
    name: 'G4 — PV+BESS hybryda (wspólna szyna SN)',
    companion: OZE_ARCHETYPES_2A['G4-PVBESS-BUS'],
    bus: 'SN_PCC',
    band: [130, 640] as [number, number],
    render: () => <SldCanonPresetG4 companion={OZE_ARCHETYPES_2A['G4-PVBESS-BUS']} />,
  },
  {
    name: 'G4 — PV+BESS hybryda (AC-coupled)',
    companion: OZE_ARCHETYPES_2A['G4-PVBESS-AC'],
    bus: 'SN_PCC',
    band: [130, 640] as [number, number],
    render: () => <SldCanonPresetG4 companion={OZE_ARCHETYPES_2A['G4-PVBESS-AC']} />,
  },
  {
    name: 'G5 — Wiatr (Typ 4)',
    companion: OZE_ARCHETYPES_2A['G6-WIND'],
    bus: 'SN_PCC',
    band: [130, 640] as [number, number],
    render: () => <SldCanonPresetG5 companion={OZE_ARCHETYPES_2A['G6-WIND']} />,
  },
];

describe('DoD §8 — canonical OZE preset acceptance', () => {
  for (const p of PRESETS) {
    describe(p.name, () => {
      const svg = () => render(<svg>{p.render()}</svg>).container.querySelector('svg')!;

      it('§8.1 — IEC symbol canon (legend) present', () => {
        expect(svg().textContent ?? '').toContain('LEGENDA — symbole IEC');
      });

      it('§8.3 — node readout bound to the FROZEN solver (Ik″ 3f from the companion)', () => {
        const sc = p.companion.short_circuit.buses[p.bus];
        expect(svg().textContent ?? '').toContain(`${f1(sc.max.ikss_ka)} / ${f1(sc.min.ikss_ka)} kA`);
      });

      it('§8.4 — data model: OSD neutral earthing + dynamic withstand', () => {
        expect(p.companion.source.grid_earthing, 'grid_earthing — OSD neutral earthing').toBeTruthy();
        expect(p.companion.source.withstand, 'withstand — ip beside Icw').toBeTruthy();
      });

      it('§8.5 — render clean: no annotation text overlaps a canonical glyph', () => {
        expect(glyphTextCollisions(svg(), p.band), 'text-on-glyph collisions').toEqual([]);
      });
    });
  }
});
