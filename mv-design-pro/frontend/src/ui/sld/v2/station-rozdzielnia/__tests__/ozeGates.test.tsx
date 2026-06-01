/**
 * OZE source archetypes — COUNTABLE acceptance gates (KROK 2, Runda 2a).
 *
 * Anti-fabrication contract (owner SPEC RODZIN OZE) + gates G/H/I/J, asserted on
 * the companion data AND the rendered DOM (render is the proof):
 *   A (anti-fab) — every field/boundary carries a source_ref (ENM/catalog/standard);
 *       boundary ∈ {G-GPZ,G-ZKSN,G-SLUP,G-ZLACZE-POM,G-ZALICZNIK}; ≥2 fields
 *       (source + connection) + busbar + boundary marker (no "block on empty bus").
 *   G — machine type (IBG/synchr./asynchr.) + NC RfG mode visible; bidirectional
 *       flow with the direction READ from the solver.
 *   H — power hierarchy Pzainst ≥ Pn,AC ≥ Pprzyłącz ≥ Posiągl + verdict flag.
 *   I — interface protection on the CONNECTION field (looking at the grid), NOT
 *       at the source; the set is a function of the machine type.
 *   J — SC contribution machine-typed: IBG ≠ synchronous machine.
 * Plus the inherited T1-T4 invariant: orthogonal routing (zero diagonal lines).
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OzeSourceArchetype } from '../OzeSourceArchetype';
import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';

const PV = ['G1', 'G2', 'G3'] as const;
const BOUNDARY_VARIANTS = ['G-GPZ', 'G-ZKSN', 'G-SLUP', 'G-ZLACZE-POM', 'G-ZALICZNIK'];

function renderOze(archetype: string, detail: 'far' | 'closer' | 'close') {
  const companion = OZE_ARCHETYPES_2A[archetype];
  return render(
    <svg>
      <OzeSourceArchetype companion={companion} stationCode={archetype} name={archetype} detail={detail} />
    </svg>,
  );
}

// ---------------------------------------------------------------------------
// GATE A (anti-fabrication) — every element pinned; boundary ∈ set; station idiom
// ---------------------------------------------------------------------------

describe('GATE A — anti-fabrication: every element pinned, boundary ∈ set, station idiom', () => {
  it('every field carries a source_ref (ENM/catalog/standard) — nothing painted', () => {
    for (const a of PV) {
      const c = OZE_ARCHETYPES_2A[a];
      expect(c.fields.length).toBeGreaterThanOrEqual(2);
      for (const f of c.fields) {
        expect(f.source_ref, `${a}/${f.field_id} has no source_ref`).toBeTruthy();
        expect(f.source_ref).toMatch(/^(enm:|catalog:|std:|solver:)/);
      }
      expect(c.boundary.source_ref).toBeTruthy();
    }
  });

  it('the boundary is one of the 5 ENEA variants (not an invented point)', () => {
    for (const a of PV) {
      expect(BOUNDARY_VARIANTS).toContain(OZE_ARCHETYPES_2A[a].boundary.variant);
    }
  });

  it('the station idiom is present: ≥2 fields (source + connection) + busbar + boundary marker', () => {
    for (const a of PV) {
      const c = OZE_ARCHETYPES_2A[a];
      const roles = c.fields.map((f) => f.role);
      expect(roles).toContain('connection');
      expect(roles).toContain('source');
      const { container } = renderOze(a, 'close');
      expect(container.querySelector('[data-testid="oze-field-connection"]')).toBeTruthy();
      // The source renders either as a PCC-bus source field (G1/G3) or as inverter
      // feeders on the nN tier (G2 behind the step-up transformer).
      const hasSource =
        container.querySelector('[data-testid="oze-field-source"]') ||
        container.querySelector('[data-testid^="oze-field-inv-"]');
      expect(hasSource, `${a}: source must render (field or nN inverter feeder)`).toBeTruthy();
      expect(container.querySelector(`[data-testid="oze-busbar-${c.pcc_bus_ref}"]`)).toBeTruthy();
      expect(container.querySelector('[data-testid="oze-boundary-marker"]')).toBeTruthy();
    }
  });

  it('the rendered fields expose their source_ref + ABB cell type', () => {
    const { container } = renderOze('G2', 'close');
    const conn = container.querySelector('[data-testid="oze-field-connection"]')!;
    expect(conn.getAttribute('data-source-ref')).toMatch(/^enm:/);
    expect(conn.getAttribute('data-abb-cell')).toBeTruthy();
    const boundary = container.querySelector('[data-testid="oze-boundary-marker"]')!;
    expect(BOUNDARY_VARIANTS).toContain(boundary.getAttribute('data-variant'));
    expect(boundary.getAttribute('data-enm-variant')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// GATE G — machine type + NC RfG mode visible; bidirectional flow from solver
// ---------------------------------------------------------------------------

describe('GATE G — source type/machine/mode visible + bidirectional flow (solver)', () => {
  it('every PV archetype is IBG with an NC RfG class + control mode', () => {
    for (const a of PV) {
      const s = OZE_ARCHETYPES_2A[a].source;
      expect(s.machine_type).toBe('IBG');
      expect(s.technology).toBe('PV');
      expect(['A', 'B', 'C', 'D']).toContain(s.nc_rfg_class);
      expect(s.control_mode.length).toBeGreaterThan(0);
    }
  });

  it('renders the machine-type + NC-mode badge at L2/L1', () => {
    const { container } = renderOze('G2', 'close');
    const badge = container.querySelector('[data-testid="oze-source-badge"]');
    expect(badge).toBeTruthy();
    expect(badge!.textContent ?? '').toMatch(/IBG/);
    expect(badge!.textContent ?? '').toMatch(/Q\(U\)/);
  });

  it('generation is reverse export — direction READ from the solver (not assumed)', () => {
    for (const a of ['G2', 'G3'] as const) {
      const incomer = OZE_ARCHETYPES_2A[a].voltage_flow.branches['sr/branch/in'];
      expect(incomer.direction).toBe('reverse');
      expect(incomer.p_mw).toBeLessThan(0);
    }
    const { container } = renderOze('G2', 'closer');
    const arrow = container.querySelector('[data-testid="oze-flow-incomer"]');
    expect(arrow!.getAttribute('data-flow-direction')).toBe('reverse');
    expect(arrow!.getAttribute('data-flow-points')).toBe('up');
  });
});

// ---------------------------------------------------------------------------
// GATE H — power hierarchy with a blocking verdict
// ---------------------------------------------------------------------------

describe('GATE H — power hierarchy validated with a blocking verdict', () => {
  it('every archetype satisfies Pzainst ≥ Pn,AC ≥ Pprzyłącz ≥ Posiągl (valid=true)', () => {
    for (const a of PV) {
      const h = OZE_ARCHETYPES_2A[a].source.power_hierarchy;
      expect(h.p_zainst_kw).toBeGreaterThanOrEqual(h.pn_ac_kw);
      expect(h.pn_ac_kw).toBeGreaterThanOrEqual(h.p_przylacz_kw);
      expect(h.p_przylacz_kw).toBeGreaterThanOrEqual(h.p_osiagalna_kw);
      expect(h.valid).toBe(true);
    }
  });

  it('renders the hierarchy with a verdict mark at L2', () => {
    const { container } = renderOze('G1', 'close');
    const hb = container.querySelector('[data-testid="oze-power-hierarchy"]');
    expect(hb!.getAttribute('data-valid')).toBe('true');
    expect(hb!.textContent ?? '').toMatch(/HIERARCHIA MOCY/);
  });

  it('TRIPWIRE: a violated hierarchy reports valid=false (the check is real)', () => {
    const good = OZE_ARCHETYPES_2A.G1;
    const broken = { ...good, source: { ...good.source, power_hierarchy: { ...good.source.power_hierarchy, valid: false } } };
    const { container } = render(
      <svg>
        <OzeSourceArchetype companion={broken} stationCode="X" name="X" detail="close" />
      </svg>,
    );
    expect(container.querySelector('[data-testid="oze-power-hierarchy"]')!.getAttribute('data-valid')).toBe('false');
    expect(container.querySelector('[data-testid="oze-power-hierarchy"]')!.textContent ?? '').toMatch(/✗/);
  });
});

// ---------------------------------------------------------------------------
// GATE I — interface protection on the CONNECTION field, machine-typed
// ---------------------------------------------------------------------------

describe('GATE I — interface protection on the connection field (not the source)', () => {
  it('the interface protection is flagged on the connection field, NOT the source', () => {
    for (const a of PV) {
      const c = OZE_ARCHETYPES_2A[a];
      const conn = c.fields.find((f) => f.role === 'connection')!;
      const srcF = c.fields.find((f) => f.role === 'source')!;
      expect(conn.interface_protection).toBe(true);
      expect(conn.protection_codes.length).toBeGreaterThan(0);
      expect(srcF.interface_protection).toBe(false);
      expect(srcF.protection_codes.length).toBe(0);
    }
  });

  it('IBG protection includes directional OC + anti-islanding + V/f; not synchro-only', () => {
    for (const a of PV) {
      const codes = OZE_ARCHETYPES_2A[a].fields.find((f) => f.role === 'connection')!.protection_codes;
      expect(codes).toContain('67');
      expect(codes).toContain('67N');
      expect(codes).toContain('anti-islanding');
      expect(codes).toContain('81U');
      expect(codes).toContain('59N');
      expect(codes).not.toContain('25'); // synchro-check is synchronous-only
      expect(codes).not.toContain('40');
    }
  });

  it('renders the relay box ON the connection field at L2', () => {
    const { container } = renderOze('G1', 'close');
    const prot = container.querySelector('[data-testid="oze-protection"]');
    expect(prot!.getAttribute('data-on-field')).toBe('connection');
    expect(prot!.getAttribute('data-machine-type')).toBe('IBG');
    expect(prot!.textContent ?? '').toMatch(/67/);
    // The connection field is marked as carrying interface protection.
    expect(container.querySelector('[data-testid="oze-field-connection"]')!.getAttribute('data-interface-protection')).toBe('true');
    expect(container.querySelector('[data-testid="oze-field-source"]')!.getAttribute('data-interface-protection')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// GATE J — SC contribution machine-typed: IBG ≠ synchronous machine
// ---------------------------------------------------------------------------

describe('GATE J — SC contribution is IBG (bounded current), NOT a machine', () => {
  it('every bus tags the source contribution as IBG, not synchronous', () => {
    for (const a of PV) {
      for (const bus of Object.values(OZE_ARCHETYPES_2A[a].short_circuit.buses)) {
        expect(bus.source_contribution.machine_type).toBe('IBG');
        expect(bus.source_contribution.is_synchronous_machine).toBe(false);
        expect(bus.source_contribution.ik_contribution_ka).toBeGreaterThan(0);
        expect(bus.source_contribution.model).toMatch(/6\.7|ograniczony/i);
      }
    }
  });

  it('renders the machine-typed contribution at L2 with synchronous=false', () => {
    const { container } = renderOze('G2', 'close');
    const contrib = container.querySelector('[data-testid="oze-sc-contrib-PCC_SN"]');
    expect(contrib!.getAttribute('data-machine-type')).toBe('IBG');
    expect(contrib!.getAttribute('data-synchronous')).toBe('false');
  });

  it('≤Icw verification is present and passes for every bus', () => {
    for (const a of PV) {
      for (const bus of Object.values(OZE_ARCHETYPES_2A[a].short_circuit.buses)) {
        expect(bus.verification.rule).toBe('ikss_max_le_icw');
        expect(bus.verification.passed).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Inherited T1-T4 — orthogonal routing (zero diagonal connection lines)
// ---------------------------------------------------------------------------

describe('inherited — OZE unit routing is orthogonal (no diagonal lines)', () => {
  it('every <line> in the source unit is horizontal or vertical', () => {
    for (const a of PV) {
      for (const detail of ['far', 'closer', 'close'] as const) {
        const { container } = renderOze(a, detail);
        const unit = container.querySelector(`[data-testid="oze-source-${a}"]`)!;
        for (const ln of Array.from(unit.querySelectorAll('line'))) {
          const x1 = Number(ln.getAttribute('x1'));
          const y1 = Number(ln.getAttribute('y1'));
          const x2 = Number(ln.getAttribute('x2'));
          const y2 = Number(ln.getAttribute('y2'));
          const ok = Math.abs(x1 - x2) < 1e-6 || Math.abs(y1 - y2) < 1e-6;
          expect(ok, `${a}@${detail}: diagonal line ${x1},${y1}->${x2},${y2}`).toBe(true);
        }
      }
    }
  });

  it('clicking the connection field fires the hook (future config/derivation panel)', () => {
    const onFieldClick = vi.fn();
    const companion = OZE_ARCHETYPES_2A.G1;
    const { container } = render(
      <svg>
        <OzeSourceArchetype companion={companion} stationCode="G1" name="G1" detail="close" onFieldClick={onFieldClick} />
      </svg>,
    );
    (container.querySelector('[data-testid="oze-field-connection"]') as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onFieldClick).toHaveBeenCalledWith('G1/g1-conn');
  });
});

// ---------------------------------------------------------------------------
// G4-PVTR — PV 1 MW through a CUSTOMER TR station (own load + PV behind the trafo)
// ---------------------------------------------------------------------------

describe('G4-PVTR — PV 1 MW via customer transformer station', () => {
  const G4 = 'G4-PVTR';

  it('Buk 1 structure: SN POLE 1 (VCB) + POLE 2 (SŁ2+U) + nN Q1 + ≥3 inverters + RPW-PV', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    expect(c, 'G4-PVTR template must exist').toBeTruthy();
    // Two SN fields (connection VCB + switch SŁ2+U), an nN main breaker Q1, three
    // inverter source feeders (NOT one block), and the own-needs (RPW-PV) load.
    expect(c.fields.filter((f) => f.role === 'connection').length).toBe(1);
    expect(c.fields.filter((f) => f.role === 'switch').length).toBe(1);
    expect(c.fields.filter((f) => f.role === 'breaker').length).toBe(1); // Q1 nN
    expect(c.fields.filter((f) => f.role === 'source').length).toBeGreaterThanOrEqual(3);
    const own = c.fields.find((f) => f.role === 'load')!;
    expect(own.source_ref).toMatch(/POTRZEBY_WLASNE/);
    // NO phantom standalone measurement field — metering is a function of POLE 1.
    expect(c.fields.some((f) => f.role === 'measurement')).toBe(false);
    // The inverters sit behind the step-up transformer (on the nN bus).
    for (const inv of c.fields.filter((f) => f.role === 'source')) {
      expect(inv.on_bus_ref).not.toBe(c.pcc_bus_ref);
    }
    // The nN main breaker Q1 is pinned to the 3WA1108 setting card.
    const q1 = c.fields.find((f) => f.role === 'breaker')!;
    expect(q1.source_ref).toMatch(/3WA1108|1\.18/);
  });

  it('protection function names are REAL (Buk 1 doc), not invented ANSI codes', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const codes = c.source.protection_codes;
    // SN relay (POLE 1) real functions.
    expect(codes).toContain('G0>');
    expect(codes).toContain('3U0');
    expect(codes).toContain('I0>');
    // The fabricated ANSI codes must NOT appear.
    expect(codes).not.toContain('67');
    expect(codes).not.toContain('67N');
    expect(codes).not.toContain('anti-islanding');
  });

  it('coordination matrix (12 rows) comes from dok. 1.18 — three levels, two philosophies', () => {
    const co = OZE_ARCHETYPES_2A[G4].source.coordination!;
    expect(co, 'G4 must carry the coordination matrix').toBeTruthy();
    expect(co.source_ref).toMatch(/1\.18/);
    expect(co.matrix.length).toBe(12);
    expect(co.levels.length).toBe(3);
    // Soft trips → nN Q1; hard trips → SN Q0.
    const f_high = co.matrix.find((r) => r.code === 'f>')!;
    expect(f_high.trips).toMatch(/nN Q1/);
    const i_short = co.matrix.find((r) => r.code === 'I>>')!;
    expect(i_short.trips).toMatch(/SN Q0/);
    // Real earth-fault functions present in the matrix.
    expect(co.matrix.some((r) => r.code === 'G0>')).toBe(true);
    expect(co.matrix.some((r) => r.code === 'SPZ')).toBe(true);
  });

  it('DC/AC ≈ 1.0 — Pzainst = 999.6 kWp (3×560×595), no oversizing', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const h = c.source.power_hierarchy;
    expect(Math.round(h.p_zainst_kw)).toBe(1000); // 999.6 → 1000 rounded
    expect(h.p_zainst_kw).toBeCloseTo(h.pn_ac_kw, 1); // DC ≈ AC
    expect(c.source.schematic!.dc_ac_ratio).toBeCloseTo(1.0, 2);
    expect(h.valid).toBe(true);
  });

  it('boundary is a dedicated MV connection (cable + głowica to OSD), metered', () => {
    // The schematic shows an SN cable connection (3×XRUHAKXS, głowice ITK 224)
    // to the OSD network → dedicated MV connection (G-ZKSN), SN-metered.
    const b = OZE_ARCHETYPES_2A[G4].boundary;
    expect(b.variant).toBe('G-ZKSN');
    expect(b.enm_connection_variant).toBe('DEDICATED_MV_CONNECTION');
    expect(b.metered).toBe(true);
  });

  it('net flow is solver-decided: PV 1 MW > own load → reverse export', () => {
    const incomer = OZE_ARCHETYPES_2A[G4].voltage_flow.branches['sr/branch/in'];
    expect(incomer.direction).toBe('reverse');
    expect(incomer.p_mw).toBeLessThan(0);
  });

  it('SC verdict ≤Icw passes on a correctly-specified board; IBG (not a machine)', () => {
    for (const bus of Object.values(OZE_ARCHETYPES_2A[G4].short_circuit.buses)) {
      expect(bus.verification.passed).toBe(true);
      expect(bus.source_contribution.is_synchronous_machine).toBe(false);
    }
  });

  it('renders the full Buk 1 idiom at L2: SN 2 pola + nN Q1 + 3 falowniki + RPW-PV', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const { container } = render(
      <svg>
        <OzeSourceArchetype companion={c} stationCode="PV-1MW" name="PV 1 MW „Buk 1”" detail="close" />
      </svg>,
    );
    // SN: connection (POLE 1 VCB) + switch (POLE 2 SŁ2+U).
    expect(container.querySelector('[data-testid="oze-field-connection"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="oze-field-switch"]')).toBeTruthy();
    // nN tier: main breaker Q1 + ≥3 inverter feeders + own-needs.
    expect(container.querySelector('[data-testid="oze-nn-tier"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="oze-field-breaker"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="oze-field-inv-"]').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector('[data-testid="oze-field-load"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="oze-boundary-marker"]')).toBeTruthy();
    // NO phantom standalone measurement field rendered.
    expect(container.querySelector('[data-testid="oze-field-measurement"]')).toBeFalsy();
    // Every <line> orthogonal (inherited invariant).
    const unit = container.querySelector('[data-testid="oze-source-G4-PVTR"]')!;
    for (const ln of Array.from(unit.querySelectorAll('line'))) {
      const x1 = Number(ln.getAttribute('x1')); const y1 = Number(ln.getAttribute('y1'));
      const x2 = Number(ln.getAttribute('x2')); const y2 = Number(ln.getAttribute('y2'));
      expect(Math.abs(x1 - x2) < 1e-6 || Math.abs(y1 - y2) < 1e-6).toBe(true);
    }
  });

  it('is a FAITHFUL projection of the schematic: nN=800V, CTM20 Ith/Idyn, IT grid', () => {
    const sch = OZE_ARCHETYPES_2A[G4].source.schematic!;
    expect(sch, 'G4 must carry the schematic register (source_ref = drawing)').toBeTruthy();
    expect(sch.source_ref).toMatch(/schemat:/);
    // nN = 800 V (NOT 400) — distilled from the 15.75/0.8 kV transformer.
    expect(sch.nn_kv).toBe(0.8);
    expect(sch.sn_kv).toBe(15.75);
    // Multi-core CTM 20 with the exact withstand from the drawing.
    expect(sch.ct.type).toBe('CTM 20');
    expect(sch.ct.ith_ka).toBe(16);
    expect(sch.ct.idyn_ka).toBe(40);
    expect(sch.ct.cores.length).toBe(3);
    // IT grid + the 3WA1108 nN main breaker.
    expect(sch.nn_grid).toBe('IT');
    expect(sch.nn_main_breaker).toMatch(/3WA1108/);
    // The nN busbar voltage shown is the real 800 V.
    expect(OZE_ARCHETYPES_2A[G4].voltage_flow.buses['NN_800'].un_kv).toBe(0.8);
  });

  it('renders the schematic equipment register at L2 (transformer/CT/VT/grid)', () => {
    const { container } = render(
      <svg>
        <OzeSourceArchetype companion={OZE_ARCHETYPES_2A[G4]} stationCode="PV-1MW" name="PV 1 MW" detail="close" />
      </svg>,
    );
    const block = container.querySelector('[data-testid="oze-schematic"]');
    expect(block).toBeTruthy();
    expect(block!.getAttribute('data-source-ref')).toMatch(/schemat:/);
    const txt = block!.textContent ?? '';
    expect(txt).toMatch(/15,75\/0,8/);
    expect(txt).toMatch(/CTM 20/);
    expect(txt).toMatch(/IT/);
  });
});

// ---------------------------------------------------------------------------
// U1-U6 — detailed SN switchgear: apparatus stacks + power flow through them
// ---------------------------------------------------------------------------

describe('U-gates — detailed SN switchgear (Buk 1)', () => {
  const G4 = 'G4-PVTR';

  it('U1 — 2 SN fields; POLE 1 stack = {DS,CB,CT,VT,SURGE_ARRESTER,CABLE_HEAD,ES}; POLE 2 = {LOAD_SWITCH,ES,CABLE_HEAD}', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const sn = c.fields.filter((f) => f.on_bus_ref === c.pcc_bus_ref && (f.role === 'connection' || f.role === 'switch'));
    expect(sn.length).toBe(2);
    const p1 = c.fields.find((f) => f.role === 'connection')!;
    const p1kinds = new Set((p1.apparatus ?? []).map((a) => a.kind));
    for (const k of ['DS', 'CB', 'CT', 'VT', 'SURGE_ARRESTER', 'CABLE_HEAD', 'ES']) {
      expect(p1kinds.has(k), `POLE 1 missing ${k}`).toBe(true);
    }
    const p2 = c.fields.find((f) => f.role === 'switch')!;
    const p2kinds = new Set((p2.apparatus ?? []).map((a) => a.kind));
    for (const k of ['LOAD_SWITCH', 'ES', 'CABLE_HEAD']) {
      expect(p2kinds.has(k), `POLE 2 missing ${k}`).toBe(true);
    }
  });

  it('U2 — POLE 1 on-path order is busbar→cable (UPSTREAM→MIDSTREAM→DOWNSTREAM)', () => {
    const p1 = OZE_ARCHETYPES_2A[G4].fields.find((f) => f.role === 'connection')!;
    const rank: Record<string, number> = { UPSTREAM: 0, MIDSTREAM: 1, DOWNSTREAM: 2 };
    const onPath = (p1.apparatus ?? []).filter((a) => a.placement in rank);
    for (let i = 1; i < onPath.length; i++) {
      expect(rank[onPath[i].placement]).toBeGreaterThanOrEqual(rank[onPath[i - 1].placement]);
    }
    // First on-path is the busbar disconnector (DS), last is the cable head.
    expect(onPath[0].kind).toBe('DS');
    expect(onPath[onPath.length - 1].kind).toBe('CABLE_HEAD');
  });

  it('U3 — power flow renders THROUGH the POLE 1 stack, direction == solver (export)', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const { container } = render(
      <svg><OzeSourceArchetype companion={c} stationCode="PV-1MW" name="Buk 1" detail="close" /></svg>,
    );
    const flow = container.querySelector('[data-testid="oze-flow-g4-vcb"]');
    expect(flow, 'POLE 1 must carry a power-flow arrow through its stack').toBeTruthy();
    // Export → the incomer branch is solver-signed reverse → arrow points up.
    expect(c.voltage_flow.branches['sr/branch/in'].direction).toBe('reverse');
    expect(flow!.getAttribute('data-flow-direction')).toBe('reverse');
  });

  it('U4 — POLE 1 carries the SN relay (G0>/3U0/I0>); POLE 2 carries none', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const p1 = c.fields.find((f) => f.role === 'connection')!;
    const p2 = c.fields.find((f) => f.role === 'switch')!;
    expect(p1.interface_protection).toBe(true);
    expect(p1.protection_codes).toContain('G0>');
    expect(p2.interface_protection).toBe(false);
    expect(p2.protection_codes.length).toBe(0);
  });

  it('U5 — apparatus glyphs render with canonical shapes; routing orthogonal', () => {
    const { container } = render(
      <svg><OzeSourceArchetype companion={OZE_ARCHETYPES_2A[G4]} stationCode="PV-1MW" name="Buk 1" detail="close" /></svg>,
    );
    const stack = container.querySelector('[data-testid="oze-field-stack-g4-vcb"]')!;
    expect(stack.querySelector('[data-apparatus-kind="CB"] [data-symbol-shape="square"]')).toBeTruthy();
    expect(stack.querySelector('[data-apparatus-kind="DS"] [data-symbol-shape="circle"]')).toBeTruthy();
    // every <line> in the stack is orthogonal.
    for (const ln of Array.from(stack.querySelectorAll('line'))) {
      const x1 = Number(ln.getAttribute('x1')); const y1 = Number(ln.getAttribute('y1'));
      const x2 = Number(ln.getAttribute('x2')); const y2 = Number(ln.getAttribute('y2'));
      expect(Math.abs(x1 - x2) < 1e-6 || Math.abs(y1 - y2) < 1e-6).toBe(true);
    }
  });

  it('U6 — every apparatus is pinned (source_ref) to ENM/schematic — nothing painted', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    for (const f of c.fields) {
      for (const a of f.apparatus ?? []) {
        expect(a.source_ref, `${f.field_id}/${a.device_ref} unpinned`).toBeTruthy();
        expect(a.source_ref).toMatch(/^(enm:|schemat:|dok:)/);
      }
    }
  });
});
