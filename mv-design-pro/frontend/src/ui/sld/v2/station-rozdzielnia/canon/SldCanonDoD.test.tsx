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
import { busbarDanglingConductors, glyphTextCollisions } from './sldCanonKit';
import { SldCanonPresetG1 } from './SldCanonPresetG1';
import { SldCanonPresetG2 } from './SldCanonPresetG2';
import { SldCanonPresetG3 } from './SldCanonPresetG3';
import { SldCanonPresetG4 } from './SldCanonPresetG4';
import { SldCanonPresetG5 } from './SldCanonPresetG5';
import { SldCanonPresetG6 } from './SldCanonPresetG6';
import { SldCanonPresetG7 } from './SldCanonPresetG7';
import { SldCanonPresetG8 } from './SldCanonPresetG8';
import { SldCanonPresetG9 } from './SldCanonPresetG9';

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
    companion: OZE_ARCHETYPES_2A['G5-WIND-T4'],
    bus: 'SN_PCC',
    band: [130, 640] as [number, number],
    render: () => <SldCanonPresetG5 companion={OZE_ARCHETYPES_2A['G5-WIND-T4']} />,
  },
  {
    name: 'G6 — Wiatr (Typ 3 DFIG)',
    companion: OZE_ARCHETYPES_2A['G6-WIND-DFIG'],
    bus: 'SN_PCC',
    band: [130, 640] as [number, number],
    render: () => <SldCanonPresetG6 companion={OZE_ARCHETYPES_2A['G6-WIND-DFIG']} />,
  },
  {
    name: 'G7 — Wiatr (Typ 1 async)',
    companion: OZE_ARCHETYPES_2A['G7-WIND-ASYNC'],
    bus: 'SN_PCC',
    band: [130, 640] as [number, number],
    render: () => <SldCanonPresetG7 companion={OZE_ARCHETYPES_2A['G7-WIND-ASYNC']} />,
  },
  {
    name: 'G8 — Kogeneracja (synchroniczna)',
    companion: OZE_ARCHETYPES_2A['G8-BIOGAZ'],
    bus: 'SN_PCC',
    band: [130, 580] as [number, number],
    render: () => <SldCanonPresetG8 companion={OZE_ARCHETYPES_2A['G8-BIOGAZ']} />,
  },
  {
    name: 'G9 — GPO wielopolowe',
    companion: OZE_ARCHETYPES_2A['G9-GPO'],
    bus: 'SN_PCC',
    band: [130, 545] as [number, number],
    render: () => <SldCanonPresetG9 companion={OZE_ARCHETYPES_2A['G9-GPO']} />,
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

      it('§8.4 — data model: OSD neutral earthing + per-bus dynamic withstand (Idyn ≥ ip)', () => {
        expect(p.companion.source.grid_earthing, 'grid_earthing — OSD neutral earthing').toBeTruthy();
        const sc = p.companion.short_circuit.buses[p.bus];
        expect(sc.idyn_ka, 'Idyn — per-bus dynamic withstand nameplate').toBeGreaterThan(0);
        expect(sc.max.ip_ka, 'ip ≤ Idyn (dynamic verdict)').toBeLessThanOrEqual(sc.idyn_ka);
      });

      it('§8.5 — render clean: no annotation text overlaps a canonical glyph', () => {
        expect(glyphTextCollisions(svg(), p.band), 'text-on-glyph collisions').toEqual([]);
      });

      it('§8.6 — render↔model continuity: no conductor dangles off a busbar', () => {
        expect(busbarDanglingConductors(svg()), 'hanging conductors').toEqual([]);
      });
    });
  }
});

// §8.5 — szerokość tekstu w teście kolizji to GÓRNA granica wg rodziny kroju (decyzja
// architekta §11.7 pkt 7, ta sama klasa co `v3/core/text.ts`): krój o stałej szerokości ma
// jeden posuw z definicji (0,62 em to granica), krój proporcjonalny — pełny kwadrat em.
// Iloczyn cech: {krój stały, krój proporcjonalny} × {znak wąski „1”, znak szeroki „①”, „W”}.
// Wstrzyknięta regresja (stały mnożnik 0,62 em dla każdego kroju) przepuszcza znak
// proporcjonalny nachodzący na symbol — wiersz „proporcjonalny × szeroki” robi się zielony
// zamiast meldować kolizję.
describe('§8.5 — górna granica szerokości tekstu wg rodziny kroju', () => {
  const NS = 'http://www.w3.org/2000/svg';
  // Symbol (keepout) zaczyna się 10 j. na prawo od początku tekstu o rozmiarze 12:
  // 0,62 em · 12 = 7,44 < 10 < 12 = 1 em · 12.
  function scena(rodzina: string, tekst: string): SVGSVGElement {
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    const glif = document.createElementNS(NS, 'g');
    glif.setAttribute('data-keepout', '110,190,20,20');
    svg.appendChild(glif);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', '100');
    t.setAttribute('y', '200');
    t.setAttribute('font-size', '12');
    t.setAttribute('font-family', rodzina);
    t.textContent = tekst;
    svg.appendChild(t);
    return svg;
  }
  const MONO_RODZINA = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';
  const SANS_RODZINA = 'Inter, system-ui, sans-serif';
  const PRZYPADKI: ReadonlyArray<{ rodzina: string; tekst: string; kolizja: boolean }> = [
    { rodzina: MONO_RODZINA, tekst: '1', kolizja: false },
    { rodzina: MONO_RODZINA, tekst: '①', kolizja: false },
    { rodzina: MONO_RODZINA, tekst: 'W', kolizja: false },
    { rodzina: SANS_RODZINA, tekst: '1', kolizja: true },
    { rodzina: SANS_RODZINA, tekst: '①', kolizja: true },
    { rodzina: SANS_RODZINA, tekst: 'W', kolizja: true },
  ];
  for (const p of PRZYPADKI) {
    it(`${p.rodzina.includes('monospace') ? 'krój stały' : 'krój proporcjonalny'} × „${p.tekst}” → ${p.kolizja ? 'kolizja' : 'brak kolizji'}`, () => {
      const wynik = glyphTextCollisions(scena(p.rodzina, p.tekst), [0, 1000]);
      expect(wynik.length > 0).toBe(p.kolizja);
    });
  }
});
