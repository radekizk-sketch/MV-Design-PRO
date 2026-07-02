/**
 * Canon CT/VT — "ONE TRUTH" guard (audit: ZERO LITERAŁÓW, WSZYSTKO Z MODELU).
 *
 * The SLD is a VIEW: every instrument ratio it shows MUST trace to a companion field, never a
 * hard-coded literal. The station wizard (separate module, IEC 61869) does the SELECTION and
 * fills these fields — here we only prove the render reads them:
 *   • the rendered CT/VT label EQUALS the companion-composed ratio;
 *   • the ratio is DATA-BOUND — mutating metering.ct.ipn_a (CT) or the bus Un (VT) changes the
 *     render, which a literal could not do;
 *   • a missing field → explicit "—" (no literal substitution); the VT primary still derives
 *     from Un (deterministic, Un/√3), so it falls back to "—" only when Un itself is absent;
 *   • view sanity: CT primary ≥ incomer I_load (the proper selection is the wizard's job).
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import type { SldOzeArchetypeCompanion } from '../companions/ozeTypes';
import { ctRatioLabel, vtRatioLabel } from './sldCanonKit';
import { SldCanonPresetG1 } from './SldCanonPresetG1';
import { SldCanonPresetG3 } from './SldCanonPresetG3';
import { SldCanonPresetG4 } from './SldCanonPresetG4';
import { SldCanonPresetG5 } from './SldCanonPresetG5';
import { SldCanonPresetG6 } from './SldCanonPresetG6';
import { SldCanonPresetG7 } from './SldCanonPresetG7';
import { SldCanonPresetG8 } from './SldCanonPresetG8';
import { SldCanonPresetG9 } from './SldCanonPresetG9';

type Preset = (props: { companion: SldOzeArchetypeCompanion }) => JSX.Element;

interface Case {
  readonly name: string;
  readonly key: string; // OZE_ARCHETYPES_2A archetype key feeding the preset
  readonly Comp: Preset;
  readonly snBus: string; // SN collector/metering busbar id
}

// Every canon preset that draws an SN measurement bay (G2 is a pure-nN PV → no SN CT/VT).
const CASES: readonly Case[] = [
  { name: 'G1 (PV 1 MW)', key: 'G4-PVTR', Comp: SldCanonPresetG1, snBus: 'SN_PCC' },
  { name: 'G3 (BESS)', key: 'G5-BESS', Comp: SldCanonPresetG3, snBus: 'SN_PCC' },
  { name: 'G4 (PV+BESS · bus)', key: 'G4-PVBESS-BUS', Comp: SldCanonPresetG4, snBus: 'SN_PCC' },
  { name: 'G4 (PV+BESS · ac)', key: 'G4-PVBESS-AC', Comp: SldCanonPresetG4, snBus: 'SN_PCC' },
  { name: 'G5 (Wind Typ 4)', key: 'G5-WIND-T4', Comp: SldCanonPresetG5, snBus: 'SN_PCC' },
  { name: 'G6 (Wind DFIG)', key: 'G6-WIND-DFIG', Comp: SldCanonPresetG6, snBus: 'SN_PCC' },
  { name: 'G7 (Wind Typ 1 async)', key: 'G7-WIND-ASYNC', Comp: SldCanonPresetG7, snBus: 'SN_PCC' },
  { name: 'G8 (synchr. cogen)', key: 'G8-BIOGAZ', Comp: SldCanonPresetG8, snBus: 'SN_PCC' },
  { name: 'G9 (GPO wielopolowe)', key: 'G9-GPO', Comp: SldCanonPresetG9, snBus: 'SN_PCC' },
];

const INCOMER = 'sr/branch/in'; // the GPZ→SN connection branch (export to OSD) the CT measures

const clone = (c: SldOzeArchetypeCompanion): SldOzeArchetypeCompanion =>
  JSON.parse(JSON.stringify(c)) as SldOzeArchetypeCompanion;
const renderText = (el: JSX.Element): string => render(<svg>{el}</svg>).container.textContent ?? '';

describe('canon CT/VT — rendered from companion fields, never a literal', () => {
  for (const { name, key, Comp, snBus } of CASES) {
    const base = OZE_ARCHETYPES_2A[key];
    const unKv = base.voltage_flow.buses[snBus].un_kv;

    it(`${name}: every preset carries structured metering (ct.ipn_a/isn_a, vt.usn_v/fv)`, () => {
      const m = base.source.metering;
      expect(m?.ct?.ipn_a, 'metering.ct.ipn_a').toBeGreaterThan(0);
      expect(m?.ct?.isn_a, 'metering.ct.isn_a').toBeGreaterThan(0);
      expect(m?.ct?.cores, 'metering.ct.cores').toBeGreaterThanOrEqual(1);
      expect(m?.vt?.usn_v, 'metering.vt.usn_v').toBeGreaterThan(0);
      expect(m?.vt?.fv, 'metering.vt.fv').toBeGreaterThan(0);
    });

    it(`${name}: rendered CT/VT labels equal the companion-composed ratio`, () => {
      const txt = renderText(<Comp companion={base} />);
      expect(txt).toContain(ctRatioLabel(base.source.metering?.ct));
      expect(txt).toContain(vtRatioLabel(unKv));
    });

    it(`${name}: CT ratio is DATA-BOUND — mutating ipn_a moves the render (no literal)`, () => {
      const ct0 = base.source.metering?.ct;
      expect(ct0, 'preset must carry metering.ct').toBeTruthy();
      const m = clone(base);
      (m.source.metering!.ct as { ipn_a: number }).ipn_a = 1234; // sentinel primary
      const mutated = ctRatioLabel(m.source.metering?.ct);
      expect(mutated).not.toEqual(ctRatioLabel(ct0)); // the change is observable…
      expect(renderText(<Comp companion={m} />)).toContain(mutated); // …and the render follows it
    });

    it(`${name}: VT primary is DATA-BOUND to Un — mutating un_kv moves the render`, () => {
      const m = clone(base);
      m.voltage_flow.buses[snBus].un_kv = 21; // sentinel (≠ the real collector kV)
      expect(renderText(<Comp companion={m} />)).toContain(vtRatioLabel(21));
    });

    it(`${name}: missing metering → "CT · —"; VT primary still derives from Un`, () => {
      const m = clone(base);
      m.source.metering = undefined;
      const txt = renderText(<Comp companion={m} />);
      expect(txt).toContain('CT · —'); // CT has no Un fallback → explicit placeholder
      expect(txt).toContain(`${vtRatioLabel(unKv)}`); // VT primary still "VT · Un/√3"
      expect(txt).not.toContain('VT · —');
    });

    it(`${name}: view sanity — CT primary ≥ incomer I_load (real selection is the wizard's)`, () => {
      const ipn = base.source.metering?.ct?.ipn_a ?? 0;
      const inc = base.voltage_flow.branches[INCOMER];
      expect(inc, `${INCOMER} present`).toBeTruthy();
      expect(ipn).toBeGreaterThanOrEqual(Math.abs(inc.i_a));
    });
  }
});
