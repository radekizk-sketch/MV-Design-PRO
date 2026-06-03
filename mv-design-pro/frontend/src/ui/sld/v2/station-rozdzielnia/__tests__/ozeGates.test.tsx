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
// GATE J′ — rotating-machine SC contribution: the FULL machine model (not IBG).
//   biogaz (synchroniczna, §6.3 Z″ + μ §6.6) · wiatr async (Z_M §6.7 + μ·q §6.6.3)
// ---------------------------------------------------------------------------

describe('GATE J′ — rotating machines: machine-typed SC contribution (not IBG)', () => {
  it('G8-BIOGAZ source is SYNCHRONOUS with synchronous-machine protection', () => {
    const c = OZE_ARCHETYPES_2A['G8-BIOGAZ'];
    expect(c, 'G8-BIOGAZ template must exist').toBeTruthy();
    expect(c.source.machine_type).toBe('SYNCHRONOUS');
    const conn = c.fields.find((f) => f.role === 'connection')!;
    expect(conn.protection_codes).toContain('25'); // synchro-check — synchronous only
  });

  it('G8-BIOGAZ breaks out the synchronous-machine contribution (Z″, μ) at every bus', () => {
    const c = OZE_ARCHETYPES_2A['G8-BIOGAZ'];
    for (const bus of Object.values(c.short_circuit.buses)) {
      const sc = bus.source_contribution;
      expect(sc.machine_type).toBe('SYNCHRONOUS');
      expect(sc.is_synchronous_machine).toBe(true);
      expect(sc.ik_contribution_ka).toBeGreaterThan(0);
      expect(sc.ib_contribution_ka!).toBeGreaterThan(0);
      expect(sc.model).toMatch(/6\.3|6\.6|maszyna synchroniczna/i);
      expect(sc.machines!.length).toBeGreaterThan(0);
      for (const m of sc.machines!) {
        expect(m.q).toBe(1); // q = 1 for synchronous machines (μ only)
        expect(m.mu).toBeGreaterThan(0);
        expect(m.mu).toBeLessThanOrEqual(1);
      }
      expect(bus.verification.passed).toBe(true);
    }
  });

  it('G7-WIND-ASYNC breaks out the asynchronous-machine contribution (Z_M, μ·q)', () => {
    const c = OZE_ARCHETYPES_2A['G7-WIND-ASYNC'];
    expect(c, 'G7-WIND-ASYNC template must exist').toBeTruthy();
    expect(c.source.machine_type).toBe('ASYNCHRONOUS');
    for (const bus of Object.values(c.short_circuit.buses)) {
      const sc = bus.source_contribution;
      expect(sc.machine_type).toBe('ASYNCHRONOUS');
      expect(sc.is_synchronous_machine).toBe(false);
      expect(sc.ik_contribution_ka).toBeGreaterThan(0);
      expect(sc.model).toMatch(/6\.7|6\.6|asynchroniczna/i);
      expect(typeof sc.motors_negligible).toBe('boolean');
      for (const m of sc.machines!) {
        expect(m.q).toBeGreaterThan(0);
        expect(m.q).toBeLessThanOrEqual(1); // q ≤ 1 (asynchronous decay)
      }
      expect(bus.verification.passed).toBe(true);
    }
  });

  it('G6-WIND-DFIG models a DFIG via crowbar → asynchronous machine (Z_M, μ·q)', () => {
    const c = OZE_ARCHETYPES_2A['G6-WIND-DFIG'];
    expect(c, 'G6-WIND-DFIG template must exist').toBeTruthy();
    expect(c.source.machine_type).toBe('DFIG');
    const conn = c.fields.find((f) => f.role === 'connection')!;
    // Audit #5: 46/47 (neg-seq) are MACHINE functions — NOT on the grid interface (connection field).
    expect(conn.protection_codes).not.toContain('46'); // moved off the interface set
    expect(conn.protection_codes).toContain('67'); // interface = directional OC (NC RfG)
    expect(conn.protection_codes).not.toContain('25'); // no synchro-check (not synchronous)
    expect(c.source.protection!.machine).toContain('46'); // neg-seq lives on the machine set
    expect(c.source.protection!.converter).toContain('64R'); // rotor earth-fault named (DFIG)
    for (const bus of Object.values(c.short_circuit.buses)) {
      const sc = bus.source_contribution;
      expect(sc.machine_type).toBe('DFIG');
      expect(sc.is_synchronous_machine).toBe(false);
      expect(sc.ik_contribution_ka).toBeGreaterThan(0);
      expect(sc.model).toMatch(/DFIG|crowbar/i); // documented crowbar assumption
      expect(sc.model).toMatch(/6\.7|6\.6/);
      for (const m of sc.machines!) {
        expect(m.q).toBeGreaterThan(0);
        expect(m.q).toBeLessThanOrEqual(1); // q ≤ 1 (induction-machine decay during crowbar)
      }
      expect(bus.verification.passed).toBe(true);
    }
  });

  it('renders the contribution as "maszyna" (not "ograniczony") for both machine types', () => {
    for (const [a, mt] of [
      ['G8-BIOGAZ', 'SYNCHRONOUS'],
      ['G7-WIND-ASYNC', 'ASYNCHRONOUS'],
      ['G6-WIND-DFIG', 'DFIG'],
    ] as const) {
      const { container } = renderOze(a, 'close');
      const contrib = container.querySelector('[data-testid="oze-sc-contrib-SN_PCC"]')!;
      expect(contrib, `${a} must render an SN_PCC SC contribution`).toBeTruthy();
      expect(contrib.getAttribute('data-machine-type')).toBe(mt);
      expect(contrib.textContent).toContain('maszyna');
      expect(contrib.textContent).not.toContain('ograniczony');
    }
  });

  it('renders the per-machine WHITE-BOX breakdown (I″k·i_b·μ·q) at close detail', () => {
    // G7 biogaz — 2 synchronous gensets on SN_PCC: 2 lines, μ shown, no q.
    const g7 = renderOze('G8-BIOGAZ', 'close');
    const g7m = g7.container.querySelectorAll('[data-testid^="oze-sc-machine-SN_PCC-"]');
    expect(g7m.length).toBe(2);
    expect(g7m[0].textContent).toContain('μ=');
    expect(g7m[0].textContent).not.toContain('q=');

    // G8 wind async — 3 induction generators at the turbine terminal: 3 lines with q;
    // the faulted turbine decays (μ<1), the remote turbines do not (μ=1).
    const g8 = renderOze('G7-WIND-ASYNC', 'close');
    const g8m = g8.container.querySelectorAll('[data-testid^="oze-sc-machine-WTG_LV_1-"]');
    expect(g8m.length).toBe(3);
    expect(g8m[0].textContent).toContain('q=');
    const mus = Array.from(g8m).map((e) => Number(e.getAttribute('data-machine-mu')));
    expect(Math.min(...mus)).toBeLessThan(1);
    expect(Math.max(...mus)).toBe(1);

    // IBG (G2) carries no per-machine breakdown.
    const g2 = renderOze('G2', 'close');
    expect(g2.container.querySelectorAll('[data-testid^="oze-sc-machine-"]').length).toBe(0);
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

  it('Buk 1 structure: SN POLE 1 (VCB line) + POLE 2 (SŁ2+U transformer field) + nN Q1 + ≥3 inverters + RPW-PV', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    expect(c, 'G4-PVTR template must exist').toBeTruthy();
    // Terminal station: one LINE field (VCB → OSD cable) + one TRANSFORMER field
    // (SŁ2+U → transformer), an nN main breaker Q1, three inverter source feeders
    // (NOT one block), and the own-needs (RPW-PV) load.
    expect(c.fields.filter((f) => f.role === 'connection').length).toBe(1);
    expect(c.fields.filter((f) => f.role === 'transformer').length).toBe(1);
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

  it('TERMINAL station: ONE OSD line (POLE 1) + a transformer field (POLE 2, no SN output); ZKSN on the cable', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    // Exactly ONE SN field is the line to the OSD (carries the sn_input cable);
    // POLE 2 is the TRANSFORMER field and has NO outgoing SN port — the bay
    // terminates at the transformer (not a second line to nowhere).
    const osdLines = c.fields.filter((f) => f.port?.kind === 'sn_input');
    expect(osdLines.length).toBe(1);
    expect(osdLines[0].role).toBe('connection');
    const trafo = c.fields.find((f) => f.role === 'transformer')!;
    expect(trafo, 'POLE 2 must be the transformer field').toBeTruthy();
    expect(trafo.port ?? null, 'the transformer field has NO outgoing SN port').toBeNull();
    expect(c.fields.some((f) => f.port?.kind === 'sn_output'), 'no second line to nowhere').toBe(false);
    // Render: the ZKSN boundary sits on the OSD cable (inside the line field's
    // stack); there is NO busbar-edge OSD stub; the transformer + nN tier hangs
    // under the transformer field.
    const { container } = render(
      <svg><OzeSourceArchetype companion={c} stationCode="PV-1MW" name="Buk 1" detail="close" /></svg>,
    );
    const lineStack = container.querySelector('[data-testid="oze-field-stack-g4-vcb"]')!;
    expect(lineStack.querySelector('[data-testid="oze-boundary-marker"]'), 'ZKSN must sit on the OSD cable').toBeTruthy();
    expect(container.querySelector('[data-testid="oze-grid-stub"]'), 'no busbar-edge OSD stub for a terminal station').toBeFalsy();
    expect(container.querySelector('[data-testid="oze-field-transformer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="oze-nn-tier"]')).toBeTruthy();
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
    // SN: connection (POLE 1 VCB line) + transformer field (POLE 2 SŁ2+U).
    expect(container.querySelector('[data-testid="oze-field-connection"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="oze-field-transformer"]')).toBeTruthy();
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
    const sn = c.fields.filter((f) => f.on_bus_ref === c.pcc_bus_ref && (f.role === 'connection' || f.role === 'transformer'));
    expect(sn.length).toBe(2);
    const p1 = c.fields.find((f) => f.role === 'connection')!;
    const p1kinds = new Set((p1.apparatus ?? []).map((a) => a.kind));
    for (const k of ['DS', 'CB', 'CT', 'VT', 'SURGE_ARRESTER', 'CABLE_HEAD', 'ES']) {
      expect(p1kinds.has(k), `POLE 1 missing ${k}`).toBe(true);
    }
    const p2 = c.fields.find((f) => f.role === 'transformer')!;
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

  it('U3 — power flow renders THROUGH the POLE 1 stack; on the OSD line export points DOWN (toward the OSD)', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const { container } = render(
      <svg><OzeSourceArchetype companion={c} stationCode="PV-1MW" name="Buk 1" detail="close" /></svg>,
    );
    const flow = container.querySelector('[data-testid="oze-flow-g4-vcb"]');
    expect(flow, 'POLE 1 must carry a power-flow arrow through its stack').toBeTruthy();
    // Export: the incomer branch is solver-signed reverse; on the OSD LINE the grid
    // is DOWN the cable, so the export arrow points DOWN toward the OSD.
    expect(c.voltage_flow.branches['sr/branch/in'].direction).toBe('reverse');
    expect(flow!.getAttribute('data-flow-direction')).toBe('reverse');
    expect(flow!.getAttribute('data-flow-points')).toBe('down');
  });

  it('U4 — POLE 1 carries the SN relay (G0>/3U0/I0>); POLE 2 (transformer field) carries none', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const p1 = c.fields.find((f) => f.role === 'connection')!;
    const p2 = c.fields.find((f) => f.role === 'transformer')!;
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

// ---------------------------------------------------------------------------
// K1-K6 — CABLE ENTRY on the cable head (PORT, axis 7). The cable docks to the
// PORT on the head — never to the middle of the field — entering from
// `entry_side` (DOL/BOK-L/BOK-P/GORA). This is the docking contract that keeps
// the network orthogonal across the 53-station composition (KROK 4).
// ---------------------------------------------------------------------------

describe('K-gates — cable entry on the cable head (PORT, axis 7)', () => {
  const G4 = 'G4-PVTR';
  const renderClose = () =>
    render(
      <svg>
        <OzeSourceArchetype companion={OZE_ARCHETYPES_2A[G4]} stationCode="PV-1MW" name="Buk 1" detail="close" />
      </svg>,
    );

  // Vertical span along a group's DOMINANT axis x (the tor mocy), merging gaps
  // ≤7 px (the port node bridges a ~6 px gap). Returns the merged intervals so a
  // single continuous interval proves an unbroken conductor.
  function mainAxisSpan(group: Element): { intervals: Array<[number, number]>; top: number; bottom: number } {
    const verts = Array.from(group.querySelectorAll('line')).filter(
      (ln) => Math.abs(Number(ln.getAttribute('x1')) - Number(ln.getAttribute('x2'))) < 1e-6,
    );
    const lenByX = new Map<number, number>();
    for (const ln of verts) {
      const x = Math.round(Number(ln.getAttribute('x1')));
      lenByX.set(x, (lenByX.get(x) ?? 0) + Math.abs(Number(ln.getAttribute('y2')) - Number(ln.getAttribute('y1'))));
    }
    let axisX = 0;
    let best = -1;
    for (const [x, len] of lenByX) if (len > best) { best = len; axisX = x; }
    const segs = verts
      .filter((ln) => Math.round(Number(ln.getAttribute('x1'))) === axisX)
      .map((ln) => {
        const a = Number(ln.getAttribute('y1'));
        const b = Number(ln.getAttribute('y2'));
        return [Math.min(a, b), Math.max(a, b)] as [number, number];
      })
      .sort((p, q) => p[0] - q[0]);
    const merged: Array<[number, number]> = [];
    for (const [a, b] of segs) {
      const last = merged[merged.length - 1];
      if (last && a - last[1] <= 7) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    return { intervals: merged, top: merged[0]?.[0] ?? NaN, bottom: merged[merged.length - 1]?.[1] ?? NaN };
  }

  it('K1 — the OSD line field carries a cable PORT (sn_input), pinned; the transformer field has NO SN port', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const p1 = c.fields.find((f) => f.role === 'connection')!;
    const p2 = c.fields.find((f) => f.role === 'transformer')!;
    expect(p1.port, 'POLE 1 (OSD line) must carry a cable port').toBeTruthy();
    expect(p1.port!.kind).toBe('sn_input');
    expect(p1.port!.source_ref).toMatch(/^enm:Port/);
    expect(p1.port!.cable).not.toMatch(/niekompletne/);
    expect(p1.port!.nominal_voltage_kv).toBe(15.75);
    // The transformer field feeds the transformer internally — no docking port.
    expect(p2.port ?? null, 'the transformer field must NOT carry a docking port').toBeNull();
  });

  it('K2 — the cable docks ON the cable head: the port renders in the SAME stack as the CABLE_HEAD, as a square node', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const p1 = c.fields.find((f) => f.role === 'connection')!;
    expect((p1.apparatus ?? []).some((a) => a.kind === 'CABLE_HEAD'), 'supply field must own a cable head').toBe(true);
    const { container } = renderClose();
    const stack = container.querySelector('[data-testid="oze-field-stack-g4-vcb"]')!;
    expect(stack.querySelector('[data-apparatus-kind="CABLE_HEAD"]'), 'cable-head glyph must render').toBeTruthy();
    const port = stack.querySelector('[data-testid="oze-port-g4-vcb"]');
    expect(port, 'port must render in the SAME stack as the head (cable docks on the head)').toBeTruthy();
    expect(port!.querySelector('rect'), 'port node is a square cable-connection point').toBeTruthy();
  });

  it('K3 — entry side (axis 7) honoured: the OSD line enters from BOK-L; the elbow turns left to the ZKSN', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const SIDES = ['DOL', 'BOK-L', 'BOK-P', 'GORA'];
    const p1 = c.fields.find((f) => f.role === 'connection')!;
    expect(SIDES).toContain(p1.port!.entry_side);
    expect(p1.port!.entry_side).toBe('BOK-L');
    const { container } = renderClose();
    const port = container.querySelector('[data-testid="oze-port-g4-vcb"]')!;
    expect(port.getAttribute('data-entry-side')).toBe('BOK-L');
    // The horizontal elbow turns toward the corridor (BOK-L → left).
    const horiz = Array.from(port.querySelectorAll('line')).find(
      (ln) => Math.abs(Number(ln.getAttribute('y1')) - Number(ln.getAttribute('y2'))) < 1e-6,
    )!;
    expect(Number(horiz.getAttribute('x2'))).toBeLessThan(Number(horiz.getAttribute('x1')));
    // The ZKSN boundary docks at the cable end (the single point of connection).
    expect(port.querySelector('[data-testid="oze-boundary-marker"]'), 'ZKSN must dock on the OSD cable end').toBeTruthy();
  });

  it('K4 — tor mocy ciągły: the conductor runs unbroken from the busbar through the stack into the cable', () => {
    const { container } = renderClose();
    const stack = container.querySelector('[data-testid="oze-field-stack-g4-vcb"]')!;
    const span = mainAxisSpan(stack);
    // ONE continuous interval (the port node bridges its 6 px), from the busbar
    // (~0) down past every apparatus, through the head/port, into the cable.
    expect(span.intervals.length, `axis broken into ${span.intervals.length} pieces`).toBe(1);
    expect(span.top).toBeLessThanOrEqual(2); // starts at the busbar
    expect(span.bottom).toBeGreaterThan(120); // continues past the port node INTO the cable
    // …and the flow continues in the solver-decided direction (export ⇒ reverse).
    const flow = container.querySelector('[data-testid="oze-flow-g4-vcb"]')!;
    expect(flow.getAttribute('data-flow-direction')).toBe('reverse');
  });

  it('K5 — occupied_by records the docking cable segment (the contract for the 53-station net)', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const p1 = c.fields.find((f) => f.role === 'connection')!;
    expect(p1.port!.occupied_by.length).toBeGreaterThan(0);
    const { container } = renderClose();
    expect(container.querySelector('[data-testid="oze-port-g4-vcb"]')!.getAttribute('data-occupied-by')).toBe(p1.port!.occupied_by);
  });

  it('K6 — the port + cable are orthogonal and the node is a square (cable-connection point)', () => {
    const { container } = renderClose();
    const port = container.querySelector('[data-testid="oze-port-g4-vcb"]')!;
    expect(port.querySelector('rect'), 'port node must be a square').toBeTruthy();
    for (const ln of Array.from(port.querySelectorAll('line'))) {
      const x1 = Number(ln.getAttribute('x1'));
      const y1 = Number(ln.getAttribute('y1'));
      const x2 = Number(ln.getAttribute('x2'));
      const y2 = Number(ln.getAttribute('y2'));
      expect(Math.abs(x1 - x2) < 1e-6 || Math.abs(y1 - y2) < 1e-6, `diagonal cable ${x1},${y1}->${x2},${y2}`).toBe(true);
    }
  });

  it('K-tripwire — without the OSD-line port there is NO cable entry on the head (the gate is real, red→green)', () => {
    const c = OZE_ARCHETYPES_2A[G4];
    const stripped = {
      ...c,
      fields: c.fields.map((f) => (f.role === 'connection' ? { ...f, port: null } : f)),
    };
    const { container } = render(
      <svg>
        <OzeSourceArchetype companion={stripped} stationCode="X" name="X" detail="close" />
      </svg>,
    );
    expect(container.querySelector('[data-testid="oze-port-g4-vcb"]')).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// G5-BESS — magazyn energii (IBG, DWUKIERUNKOWY) + oś energii (kWh). Generyczny,
// przypięty do norm (source_ref = std:/norma:/enm:). Stacja końcowa (jak G4).
// ---------------------------------------------------------------------------

describe('G5-BESS — magazyn energii (IBG dwukierunkowy + oś energii kWh)', () => {
  const G5 = 'G5-BESS';
  const renderClose = () =>
    render(
      <svg>
        <OzeSourceArchetype companion={OZE_ARCHETYPES_2A[G5]} stationCode="BESS-1MW" name="BESS 1 MW" detail="close" />
      </svg>,
    );

  it('B1 — IBG dwukierunkowy: technology=BESS, machine=IBG, bidirectional flag + tryb 2-kier.', () => {
    const c = OZE_ARCHETYPES_2A[G5];
    expect(c, 'G5-BESS must exist').toBeTruthy();
    expect(c.source.machine_type).toBe('IBG');
    expect(c.source.technology).toMatch(/BESS/);
    expect(c.source.bidirectional).toBe(true);
    expect(c.source.control_mode).toMatch(/2-kier/);
  });

  it('B2 — oś ENERGII: storage (moc kW + pojemność kWh + czas + ładuj⇄rozładuj), przypięta', () => {
    const st = OZE_ARCHETYPES_2A[G5].source.storage!;
    expect(st, 'BESS must carry the storage spec').toBeTruthy();
    expect(st.source_ref).toMatch(/^(std:|enm:)/);
    expect(st.power_kw).toBeGreaterThan(0);
    expect(st.capacity_kwh).toBeGreaterThan(0);
    expect(st.duration_h).toBeCloseTo(st.capacity_kwh / st.power_kw, 1);
    expect(st.n_pcs).toBeGreaterThanOrEqual(2);
    expect(st.bidirectional).toBe(true);
    expect(st.charge_kw).toBeGreaterThan(0);
    expect(st.discharge_kw).toBeGreaterThan(0);
  });

  it('B3 — GENERYCZNY wg norm: każdy field/aparat source_ref ∈ std/norma/enm; brak schemat: i brak rejestru rysunku', () => {
    const c = OZE_ARCHETYPES_2A[G5];
    for (const f of c.fields) {
      expect(f.source_ref, `${f.field_id} unpinned`).toMatch(/^(enm:|std:|norma:)/);
      for (const a of f.apparatus ?? []) expect(a.source_ref).toMatch(/^(enm:|std:|norma:)/);
    }
    expect(c.fields.every((f) => !/schemat:/.test(f.source_ref)), 'no real-drawing pin on a generic archetype').toBe(true);
    expect(c.source.schematic ?? null, 'a generic archetype carries no real schematic register').toBeNull();
  });

  it('B4 — TERMINAL: 1 pole liniowe (sn_input) + pole transformatorowe (bez wyjścia SN) + Q1 + ≥2 PCS + potrzeby własne', () => {
    const c = OZE_ARCHETYPES_2A[G5];
    expect(c.fields.filter((f) => f.role === 'connection').length).toBe(1);
    expect(c.fields.filter((f) => f.role === 'transformer').length).toBe(1);
    expect(c.fields.filter((f) => f.role === 'breaker').length).toBe(1);
    expect(c.fields.filter((f) => f.role === 'source').length).toBeGreaterThanOrEqual(2);
    expect(c.fields.some((f) => f.role === 'load')).toBe(true);
    expect(c.fields.filter((f) => f.port?.kind === 'sn_input').length).toBe(1);
    expect(c.fields.some((f) => f.port?.kind === 'sn_output'), 'terminal: no SN output').toBe(false);
    expect(c.fields.find((f) => f.role === 'transformer')!.port ?? null).toBeNull();
    for (const pcs of c.fields.filter((f) => f.role === 'source')) {
      expect(pcs.on_bus_ref).not.toBe(c.pcc_bus_ref); // PCS behind the transformer
    }
  });

  it('B5 — rozładowanie (eksport) z solvera: incomer reverse, p<0; strzałka W DÓŁ do OSD', () => {
    const c = OZE_ARCHETYPES_2A[G5];
    const incomer = c.voltage_flow.branches['sr/branch/in'];
    expect(incomer.direction).toBe('reverse');
    expect(incomer.p_mw).toBeLessThan(0);
    const { container } = renderClose();
    const flow = container.querySelector('[data-testid="oze-flow-g5-line"]')!;
    expect(flow.getAttribute('data-flow-direction')).toBe('reverse');
    expect(flow.getAttribute('data-flow-points')).toBe('down');
  });

  it('B6 — zwarcie IBG (prąd ograniczony, NIE maszyna) i ≤Icw na każdej szynie', () => {
    for (const bus of Object.values(OZE_ARCHETYPES_2A[G5].short_circuit.buses)) {
      expect(bus.source_contribution.machine_type).toBe('IBG');
      expect(bus.source_contribution.is_synchronous_machine).toBe(false);
      expect(bus.verification.passed).toBe(true);
    }
  });

  it('B7 — render: stacja końcowa + PCS + bateria + MAGAZYN + ZKSN-na-kablu; ortogonalnie', () => {
    const { container } = renderClose();
    expect(container.querySelector('[data-testid="oze-field-connection"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="oze-field-transformer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="oze-nn-tier"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="oze-field-inv-"]').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-testid="oze-battery-0"]'), 'battery glyph on PCS distinguishes BESS from PV').toBeTruthy();
    const storageBlk = container.querySelector('[data-testid="oze-storage"]')!;
    expect(storageBlk, 'MAGAZYN energy register').toBeTruthy();
    expect(storageBlk.getAttribute('data-source-ref')).toMatch(/^(std:|enm:)/);
    expect(storageBlk.textContent ?? '').toMatch(/kWh/);
    expect(container.querySelector('[data-testid="oze-schematic"]'), 'no real-drawing register on a generic BESS').toBeFalsy();
    const lineStack = container.querySelector('[data-testid="oze-field-stack-g5-line"]')!;
    expect(lineStack.querySelector('[data-testid="oze-boundary-marker"]'), 'ZKSN on the OSD cable').toBeTruthy();
    expect(container.querySelector('[data-testid="oze-grid-stub"]'), 'no busbar-edge OSD stub (terminal)').toBeFalsy();
    const unit = container.querySelector('[data-testid="oze-source-G5-BESS"]')!;
    for (const ln of Array.from(unit.querySelectorAll('line'))) {
      const x1 = Number(ln.getAttribute('x1')); const y1 = Number(ln.getAttribute('y1'));
      const x2 = Number(ln.getAttribute('x2')); const y2 = Number(ln.getAttribute('y2'));
      expect(Math.abs(x1 - x2) < 1e-6 || Math.abs(y1 - y2) < 1e-6).toBe(true);
    }
  });

  it('B8 — ochrona = zestaw interfejsowy IBG (NIE kody maszyny synchronicznej)', () => {
    const conn = OZE_ARCHETYPES_2A[G5].fields.find((f) => f.role === 'connection')!;
    expect(conn.interface_protection).toBe(true);
    expect(conn.protection_codes).toContain('anti-islanding');
    expect(conn.protection_codes).toContain('81U');
    expect(conn.protection_codes).not.toContain('25'); // synchro-check — synchronous only
    expect(conn.protection_codes).not.toContain('40'); // loss of field — synchronous only
  });
});

// ---------------------------------------------------------------------------
// G5-WIND-T4 — Wiatr Typ 4 (pełnoprzekształtnikowy): IBG + wewnętrzna SIEĆ KOLEKTOROWA
// SN (n turbin, KAŻDA z własnym trafem turbinowym). Generyczny, przypięty do norm.
// ---------------------------------------------------------------------------

describe('G5-WIND-T4 — wiatr Typ 4 (IBG + sieć kolektorowa SN)', () => {
  const G6 = 'G5-WIND-T4';
  const renderClose = () =>
    render(
      <svg>
        <OzeSourceArchetype companion={OZE_ARCHETYPES_2A[G6]} stationCode="WIND-T4" name="Wiatr T4" detail="close" />
      </svg>,
    );

  it('W1 — IBG pełnoprzekształtnikowy: technology=Wiatr Typ 4, machine=IBG', () => {
    const c = OZE_ARCHETYPES_2A[G6];
    expect(c, 'G5-WIND-T4 must exist').toBeTruthy();
    expect(c.source.machine_type).toBe('IBG');
    expect(c.source.technology).toMatch(/Wiatr|Typ 4/);
  });

  it('W2 — sieć KOLEKTOROWA: collector spec (kV + n turbin + moc + trafo turbiny + topologia), przypięta', () => {
    const col = OZE_ARCHETYPES_2A[G6].source.collector!;
    expect(col, 'wind must carry the collector spec').toBeTruthy();
    expect(col.source_ref).toMatch(/^(std:|enm:)/);
    expect(col.collector_kv).toBeGreaterThan(0);
    expect(col.n_turbines).toBeGreaterThanOrEqual(2);
    expect(col.turbine_kw).toBeGreaterThan(0);
    expect(col.turbine_transformer).toMatch(/kV/);
    expect(col.turbine_lv_kv).toBeGreaterThan(0);
    expect(col.topology.length).toBeGreaterThan(0);
  });

  it('W3 — GENERYCZNY wg norm: każdy field source_ref ∈ std/norma/enm; brak schemat: i rejestru rysunku', () => {
    const c = OZE_ARCHETYPES_2A[G6];
    for (const f of c.fields) {
      expect(f.source_ref, `${f.field_id} unpinned`).toMatch(/^(enm:|std:|norma:)/);
      for (const a of f.apparatus ?? []) expect(a.source_ref).toMatch(/^(enm:|std:|norma:)/);
    }
    expect(c.fields.every((f) => !/schemat:/.test(f.source_ref))).toBe(true);
    expect(c.source.schematic ?? null).toBeNull();
  });

  it('W4 — TOPOLOGIA kolektora: n×bay turbiny NA szynie kolektora (PCC) + 1 pole liniowe (sn_input); brak trafa-pola/nN/wyjścia SN', () => {
    const c = OZE_ARCHETYPES_2A[G6];
    const turbines = c.fields.filter((f) => f.role === 'source');
    expect(turbines.length).toBeGreaterThanOrEqual(2);
    for (const t of turbines) expect(t.on_bus_ref).toBe(c.pcc_bus_ref); // bays on the collector
    expect(c.fields.filter((f) => f.role === 'connection').length).toBe(1);
    expect(c.fields.some((f) => f.role === 'transformer'), 'no transformer FIELD (per-feeder instead)').toBe(false);
    expect(c.fields.some((f) => f.role === 'breaker'), 'no shared nN main breaker').toBe(false);
    expect(c.fields.filter((f) => f.port?.kind === 'sn_input').length).toBe(1);
    expect(c.fields.some((f) => f.port?.kind === 'sn_output')).toBe(false);
  });

  it('W5 — generacja (eksport) z solvera: każda turbina p<0; incomer reverse + strzałka W DÓŁ do OSD', () => {
    const c = OZE_ARCHETYPES_2A[G6];
    const col = c.source.collector!;
    for (let i = 1; i <= col.n_turbines; i++) {
      const br = c.voltage_flow.branches[`sr/branch/wtg-tr${i}`];
      expect(br, `turbine ${i} branch`).toBeTruthy();
      expect(br.p_mw).toBeLessThan(0); // export
    }
    expect(c.voltage_flow.branches['sr/branch/in'].direction).toBe('reverse');
    const { container } = renderClose();
    const flow = container.querySelector('[data-testid="oze-flow-g6-line"]')!;
    expect(flow.getAttribute('data-flow-direction')).toBe('reverse');
    expect(flow.getAttribute('data-flow-points')).toBe('down');
  });

  it('W6 — zwarcie IBG ograniczone (NIE maszyna) i ≤Icw na każdej szynie', () => {
    for (const bus of Object.values(OZE_ARCHETYPES_2A[G6].short_circuit.buses)) {
      expect(bus.source_contribution.machine_type).toBe('IBG');
      expect(bus.source_contribution.is_synchronous_machine).toBe(false);
      expect(bus.verification.passed).toBe(true);
    }
  });

  it('W7 — render: pole liniowe + KOLEKTOR (≥2 WTG z rotorem + trafo turbiny) + blok SIEĆ KOLEKTOROWA + ZKSN-na-kablu; bez nN; ortogonalnie', () => {
    const { container } = renderClose();
    expect(container.querySelector('[data-testid="oze-field-connection"]')).toBeTruthy();
    const tier = container.querySelector('[data-testid="oze-collector-tier"]')!;
    expect(tier, 'collector tier').toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="oze-field-wtg-"]').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('[data-testid="oze-wtg-symbol"]').length).toBeGreaterThanOrEqual(2);
    const block = container.querySelector('[data-testid="oze-collector"]')!;
    expect(block, 'SIEĆ KOLEKTOROWA register').toBeTruthy();
    expect(block.getAttribute('data-source-ref')).toMatch(/^(std:|enm:)/);
    expect(block.textContent ?? '').toMatch(/kV/);
    expect(container.querySelector('[data-testid="oze-nn-tier"]'), 'no shared nN tier').toBeFalsy();
    expect(container.querySelector('[data-testid="oze-grid-stub"]'), 'no busbar-edge OSD stub').toBeFalsy();
    const lineStack = container.querySelector('[data-testid="oze-field-stack-g6-line"]')!;
    expect(lineStack.querySelector('[data-testid="oze-boundary-marker"]')).toBeTruthy();
    const unit = container.querySelector('[data-testid="oze-source-G5-WIND-T4"]')!;
    for (const ln of Array.from(unit.querySelectorAll('line'))) {
      const x1 = Number(ln.getAttribute('x1')); const y1 = Number(ln.getAttribute('y1'));
      const x2 = Number(ln.getAttribute('x2')); const y2 = Number(ln.getAttribute('y2'));
      expect(Math.abs(x1 - x2) < 1e-6 || Math.abs(y1 - y2) < 1e-6, `diagonal line ${x1},${y1}→${x2},${y2}`).toBe(true);
    }
  });

  it('W8 — ochrona = zestaw interfejsowy IBG (nie kody maszyny synchronicznej)', () => {
    const conn = OZE_ARCHETYPES_2A[G6].fields.find((f) => f.role === 'connection')!;
    expect(conn.interface_protection).toBe(true);
    expect(conn.protection_codes).toContain('anti-islanding');
    expect(conn.protection_codes).not.toContain('25');
    expect(conn.protection_codes).not.toContain('40');
  });
});
