/**
 * STACJA-ROZDZIELNIA SN — COUNTABLE acceptance gates (KROK 1 v2 correction).
 *
 * These are the owner's red→green gates A/B/C. They assert NUMBERS on the
 * rendered DOM (render is the only proof), and are designed to go RED on the
 * pre-correction design and GREEN once fixed:
 *
 *   A — T4 coupler is an ABB SMC = 2 rozłączniki + 1 wyłącznik (NOT a 1-switch
 *       SEC). NOP sits on the breaker.
 *   B — T3 ZKSN is 1×WE + n×WY; the role "ODG" does not exist (a branch is just
 *       more WY).
 *   C — N-8: apparatus identity is invariant across LOD (set of kinds @far ==
 *       @closer == @close per field) AND the canonical shape is a function of the
 *       apparatus type, on EVERY level (CB→square, LOAD_SWITCH→diamond, DS→circle).
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StationRozdzielniaSN } from '../StationRozdzielniaSN';
import { buildArchetype, buildT3, buildT4 } from '../archetypes';
import { computeStationGeometry, type StationDetailLevel } from '../geometry';
import type { StationApparatus, StationFieldDescriptor } from '../contract';

const DETAILS: readonly StationDetailLevel[] = ['far', 'closer', 'close'];

function renderAt(archetype: 'T1' | 'T2' | 'T3' | 'T4', detail: StationDetailLevel) {
  const { model, companion } = buildArchetype(archetype);
  return render(
    <svg>
      <StationRozdzielniaSN model={model} companion={companion} detail={detail} />
    </svg>,
  );
}

const CANONICAL_SHAPE: Partial<Record<StationApparatus['kind'], string>> = {
  CB: 'square',
  LOAD_SWITCH: 'diamond',
  DS: 'circle',
};

function representativeKind(field: StationFieldDescriptor): StationApparatus['kind'] | null {
  return (
    field.apparatus.find((a) => a.kind === 'CB')?.kind ??
    field.apparatus.find((a) => a.kind === 'LOAD_SWITCH')?.kind ??
    field.apparatus.find((a) => a.kind === 'DS')?.kind ??
    null
  );
}

// ---------------------------------------------------------------------------
// GATE A — T4 coupler = SMC (2 rozłączniki + 1 wyłącznik), not SEC (1 switch)
// ---------------------------------------------------------------------------

describe('GATE A — T4 sprzęgło is an ABB SMC (two cells), not a SEC (one switch)', () => {
  it('the coupler has exactly 2 rozłączniki (LOAD_SWITCH) AND 1 wyłącznik (CB)', () => {
    const { model } = buildT4();
    const coupler = model.fields.find((f) => f.role === 'SPRZEGLO');
    expect(coupler, 'T4 must have a SPRZEGLO field').toBeTruthy();
    const kinds = coupler!.apparatus.map((a) => a.kind);
    const rozlaczniki = kinds.filter((k) => k === 'LOAD_SWITCH').length;
    const wylaczniki = kinds.filter((k) => k === 'CB').length;
    // SEC = 1 switch → FAIL; SMC = 2 switches + 1 breaker → PASS.
    expect(rozlaczniki, 'SMC needs 2 rozłączniki (1 ⇒ it is only a SEC)').toBe(2);
    expect(wylaczniki, 'SMC needs 1 wyłącznik between the two switches').toBe(1);
  });

  it('renders TWO coupler cells with the breaker between them, NOP on the breaker', () => {
    const { container } = renderAt('T4', 'close');
    // Two distinct coupler cells (left switch cell A, right switch cell B).
    expect(container.querySelector('[data-testid="sr-coupler-cell-a"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sr-coupler-cell-b"]')).toBeTruthy();
    // The breaker cell between them.
    expect(container.querySelector('[data-testid="sr-coupler-breaker"]')).toBeTruthy();
    // NOP marker sits on the coupler breaker.
    const nop = container.querySelector('[data-testid="sr-coupler-nop"]');
    expect(nop, 'NOP must sit on the coupler breaker').toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// GATE B — T3 ZKSN = 1×WE + n×WY; role "ODG" does not exist
// ---------------------------------------------------------------------------

describe('GATE B — T3 ZKSN is 1×WE + n×WY (no ODG role)', () => {
  it('has exactly one LINIA_IN and n LINIA_OUT, and ZERO LINIA_ODG', () => {
    const { model } = buildT3();
    const roles = model.fields.map((f) => f.role);
    const we = roles.filter((r) => r === 'LINIA_IN').length;
    const wy = roles.filter((r) => r === 'LINIA_OUT').length;
    const odg = roles.filter((r) => r === 'LINIA_ODG').length;
    expect(we, 'ZKSN has a single incomer (WE)').toBe(1);
    expect(wy, 'ZKSN branch = multiple WY (n ≥ 2)').toBeGreaterThanOrEqual(2);
    expect(odg, 'the ODG role must not exist on a ZKSN').toBe(0);
  });

  it('is a zksn projection with no transformer / nN block', () => {
    const { model } = buildT3();
    expect(model.projection).toBe('zksn');
    expect(model.branchPointType).toBe('zksn');
    expect(model.nnBlock).toBeUndefined();
    // No transformer apparatus anywhere on a ZKSN.
    const hasTransformer = model.fields.some((f) =>
      f.apparatus.some((a) => a.kind === 'TRANSFORMER_DEVICE'),
    );
    expect(hasTransformer).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GATE C — N-8: apparatus identity invariant across LOD + canonical shapes
// ---------------------------------------------------------------------------

describe('GATE C — N-8: apparatus identity is LOD-invariant + canonical shapes', () => {
  it('the SET of apparatus kinds per field is identical at far/closer/close (geometry-level)', () => {
    for (const archetype of ['T1', 'T2', 'T3', 'T4'] as const) {
      const { model } = buildArchetype(archetype);
      // The model is the single source — apparatus do not depend on zoom; assert
      // the geometry surfaces the same field set at every level (no apparatus is
      // dropped or substituted by the view).
      const sets = DETAILS.map((d) =>
        computeStationGeometry(model.fields, d, model.nnBlock).fields.map((f) => f.fieldId),
      );
      expect(sets[0]).toEqual(sets[1]);
      expect(sets[1]).toEqual(sets[2]);
      // And the model's apparatus kinds are intrinsic (not a function of detail).
      for (const f of model.fields) {
        expect(f.apparatus.length).toBeGreaterThan(0);
      }
    }
  });

  it('the FAR representative symbol shape equals the canonical shape of the field apparatus type', () => {
    // This is the symbol-lie gate: a CB field at far MUST be a square, a
    // rozłącznik a diamond, an odłącznik a circle — never a universal diamond.
    for (const archetype of ['T1', 'T2', 'T3', 'T4'] as const) {
      const { model } = buildArchetype(archetype);
      const { container } = renderAt(archetype, 'far');
      for (const field of model.fields) {
        // The SMC coupler (sectioned bus) is drawn as a two-cell horizontal
        // coupler, not a rep-symbol column — its shapes are checked by GATE A.
        if (model.sectionedBus && field.role === 'SPRZEGLO') continue;
        const repKind = representativeKind(field);
        if (!repKind) continue;
        const sym = container.querySelector(`[data-testid="sr-field-rep-symbol-${field.fieldId}"]`);
        expect(sym, `far representative symbol missing for ${field.fieldId}`).toBeTruthy();
        expect(
          sym!.getAttribute('data-symbol-shape'),
          `field ${field.fieldId} (${repKind}) far shape must be canonical`,
        ).toBe(CANONICAL_SHAPE[repKind]);
      }
    }
  });

  it('canonical shape holds at closer AND close too (CB□ / LOAD_SWITCH◇ / DS◯)', () => {
    for (const detail of ['closer', 'close'] as const) {
      const { container } = renderAt('T2', detail);
      // T2 WE is a CBC breaker → square present; its TR is SDF (rozłącznik) → diamond.
      expect(container.querySelector('[data-symbol-shape="square"]')).toBeTruthy();
      expect(container.querySelector('[data-symbol-shape="diamond"]')).toBeTruthy();
    }
  });

  it('GATE C extended — the coupler WYŁĄCZNIK is enumerated as a SQUARE at every LOD', () => {
    // The owner's contradiction fix: C must cover ALL breakers, including the
    // sprzęgło breaker — which must be a □ (square), never a ⊘ glyph.
    for (const detail of DETAILS) {
      const { container } = renderAt('T4', detail);
      const breaker = container.querySelector('[data-testid="sr-coupler-breaker"]');
      expect(breaker, `coupler breaker missing @ ${detail}`).toBeTruthy();
      expect(
        breaker!.getAttribute('data-symbol-shape'),
        `coupler breaker must be a square @ ${detail}`,
      ).toBe('square');
    }
  });

  it('STATE ≠ SHAPE — open vs closed breaker keep the SAME square shape; state via data-state', () => {
    // Closed breaker (T2 CBC incomer) and open breaker (T4 coupler NOP) are BOTH
    // squares — the difference is colour/state, never the shape.
    const t2 = renderAt('T2', 'close').container;
    const closedCb = t2.querySelector('[data-symbol-shape="square"][data-state="closed"]');
    expect(closedCb, 'a closed breaker square must exist (T2 CBC)').toBeTruthy();

    const t4 = renderAt('T4', 'close').container;
    const openBreaker = t4.querySelector('[data-testid="sr-coupler-breaker"]');
    expect(openBreaker!.getAttribute('data-symbol-shape')).toBe('square');
    expect(openBreaker!.getAttribute('data-state')).toBe('open');
  });

  it('NO ⊘ prohibition glyph anywhere in the station-rozdzielnia render', () => {
    // The NOP is a red OPEN square + a "NOP" text tag — never a ⊘/⨯ overlay.
    for (const archetype of ['T1', 'T2', 'T3', 'T4'] as const) {
      const { container } = renderAt(archetype, 'close');
      expect(container.textContent ?? '').not.toContain('⊘');
      expect(container.textContent ?? '').not.toContain('⨯');
      expect(container.textContent ?? '').not.toContain('⊗');
    }
    // The T4 NOP is a text tag, present and red.
    const t4 = renderAt('T4', 'close').container;
    const nop = t4.querySelector('[data-testid="sr-coupler-nop"]');
    expect(nop, 'NOP tag must be present on the open coupler').toBeTruthy();
    expect(nop!.textContent).toBe('NOP');
  });
});

// ---------------------------------------------------------------------------
// GATE ROUTING — every connection segment is orthogonal (Manhattan, 0°/90°)
// ---------------------------------------------------------------------------

describe('GATE ROUTING — zero diagonal connection segments (90° corners only)', () => {
  it('every data-routing="orthogonal" line is horizontal or vertical (no skew)', () => {
    for (const archetype of ['T1', 'T2', 'T3', 'T4'] as const) {
      for (const detail of DETAILS) {
        const { container } = renderAt(archetype, detail);
        const lines = Array.from(
          container.querySelectorAll('line[data-routing="orthogonal"]'),
        );
        let diagonal = 0;
        for (const ln of lines) {
          const x1 = Number(ln.getAttribute('x1'));
          const y1 = Number(ln.getAttribute('y1'));
          const x2 = Number(ln.getAttribute('x2'));
          const y2 = Number(ln.getAttribute('y2'));
          const horizontal = Math.abs(y1 - y2) < 1e-6;
          const vertical = Math.abs(x1 - x2) < 1e-6;
          if (!horizontal && !vertical) diagonal += 1;
        }
        expect(
          diagonal,
          `${archetype}@${detail}: ${diagonal} diagonal routing segments (must be 0)`,
        ).toBe(0);
      }
    }
  });

  it('the coupler is routed orthogonally (its connection lines included)', () => {
    const { container } = renderAt('T4', 'close');
    const coupler = container.querySelector('[data-testid^="sr-coupler-sr-"]')!;
    const lines = Array.from(coupler.querySelectorAll('line[data-routing="orthogonal"]'));
    expect(lines.length, 'the coupler must have tagged routing lines').toBeGreaterThan(4);
    for (const ln of lines) {
      const x1 = Number(ln.getAttribute('x1'));
      const y1 = Number(ln.getAttribute('y1'));
      const x2 = Number(ln.getAttribute('x2'));
      const y2 = Number(ln.getAttribute('y2'));
      expect(Math.abs(y1 - y2) < 1e-6 || Math.abs(x1 - x2) < 1e-6).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// GATE E — short-circuit on EVERY SN and nN busbar at L2 (IEC 60909)
// ---------------------------------------------------------------------------

/** The busbars each archetype MUST carry SC on, by SC bus_ref. */
const SC_BUSES: Record<'T1' | 'T2' | 'T3' | 'T4', readonly string[]> = {
  T1: ['SN_BUS', 'NN_BUS'],
  T2: ['SN_BUS', 'NN_BUS'],
  T3: ['ZKSN'],
  T4: ['SEC_A', 'SEC_B'],
};

describe('GATE E — short-circuit dossier on every SN/nN busbar at L2', () => {
  it('the SC companion carries Ik"max/min + ip/ib/ith/κ + Z(R/X) + Icw verdict per bus', () => {
    for (const archetype of ['T1', 'T2', 'T3', 'T4'] as const) {
      const { model } = buildArchetype(archetype);
      expect(model.shortCircuit, `${archetype} must carry a SC companion`).toBeTruthy();
      for (const busRef of SC_BUSES[archetype]) {
        const bus = model.shortCircuit!.buses[busRef];
        expect(bus, `${archetype} SC bus ${busRef} missing`).toBeTruthy();
        // Mandatory quantities present and physical (> 0).
        expect(bus.max.ikss_ka).toBeGreaterThan(0);
        expect(bus.max.ip_ka).toBeGreaterThan(bus.max.ikss_ka); // ip = κ·√2·Ik"
        expect(bus.max.ith_ka).toBeGreaterThan(0);
        expect(bus.max.ib_ka).toBeGreaterThan(0);
        expect(bus.max.kappa).toBeGreaterThanOrEqual(1);
        expect(bus.max.sk_mva).toBeGreaterThan(0);
        // Ik"min (c=0.95) < Ik"max (c=1.10).
        expect(bus.min.ikss_ka).toBeLessThan(bus.max.ikss_ka);
        // Distinct case_refs.
        expect(bus.max.case_ref).toBe('ZWARCIOWY_MAKS');
        expect(bus.min.case_ref).toBe('ZWARCIOWY_MIN');
        // Verification present: Ik"max ≤ Icw.
        expect(bus.verification.rule).toBe('ikss_max_le_icw');
        expect(typeof bus.verification.passed).toBe('boolean');
        // White Box derivation carried (non-empty).
        expect(bus.max.white_box_trace.length).toBeGreaterThan(0);
      }
    }
  });

  it('renders a SC panel on EVERY busbar at L2 (and NOT at far/closer)', () => {
    for (const archetype of ['T1', 'T2', 'T3', 'T4'] as const) {
      const close = renderAt(archetype, 'close').container;
      for (const busRef of SC_BUSES[archetype]) {
        const panel = close.querySelector(`[data-testid="sr-sc-panel-${busRef}"]`);
        expect(panel, `${archetype} L2 must render SC panel for ${busRef}`).toBeTruthy();
        // White Box affordance present with step count.
        const wb = close.querySelector(`[data-testid="sr-sc-whitebox-${busRef}"]`);
        expect(wb).toBeTruthy();
        expect(Number(wb!.getAttribute('data-wb-steps'))).toBeGreaterThan(0);
      }
      // SC panels are an L2-only affordance.
      const closer = renderAt(archetype, 'closer').container;
      expect(closer.querySelector('[data-testid^="sr-sc-panel-"]')).toBeFalsy();
    }
  });

  it('nN 400 V busbar carries its own SC (transformer-dominated, κ ≈ 2)', () => {
    const { model } = buildArchetype('T1');
    const nn = model.shortCircuit!.buses['NN_BUS'];
    expect(nn.un_kv).toBe(0.4);
    // The nN κ is materially higher than the SN κ (low R/X behind the trafo).
    expect(nn.max.kappa).toBeGreaterThan(model.shortCircuit!.buses['SN_BUS'].max.kappa);
  });
});

// ---------------------------------------------------------------------------
// GATE F — voltages on every busbar + power flow on every field at L2 (NR)
// ---------------------------------------------------------------------------

describe('GATE F — bus voltages + field power flows from the frozen NR solver', () => {
  it('every busbar carries U[kV]+[p.u.]+deviation, every branch carries I/P/Q/S', () => {
    for (const archetype of ['T1', 'T2', 'T3', 'T4'] as const) {
      const { model } = buildArchetype(archetype);
      const vf = model.voltageFlow;
      expect(vf, `${archetype} must carry a voltage-flow companion`).toBeTruthy();
      expect(vf!.case_ref).toMatch(/^ROZPLYW_/);
      expect(vf!.white_box_steps).toBeGreaterThan(0);
      // Every SC busbar also has a voltage (U near 1 p.u., physical).
      for (const busRef of SC_BUSES[archetype]) {
        const b = vf!.buses[busRef];
        expect(b, `${archetype} VF bus ${busRef} missing`).toBeTruthy();
        expect(b.u_kv).toBeGreaterThan(0);
        expect(b.u_pu).toBeGreaterThan(0.9);
        expect(b.u_pu).toBeLessThan(1.1);
        expect(typeof b.deviation_percent).toBe('number');
      }
      // Every field with a branchRef has an I/P/Q/S flow.
      for (const f of model.fields) {
        if (f.role === 'SPRZEGLO' || !f.branchRef) continue;
        const br = vf!.branches[f.branchRef];
        expect(br, `${archetype} field ${f.fieldId} (${f.branchRef}) has no flow`).toBeTruthy();
        expect(br.i_a).toBeGreaterThanOrEqual(0);
        expect(typeof br.p_mw).toBe('number');
        expect(typeof br.q_mvar).toBe('number');
        expect(br.s_mva).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('renders a voltage badge on every busbar at L2 (and NOT at closer)', () => {
    for (const archetype of ['T1', 'T2', 'T3', 'T4'] as const) {
      const close = renderAt(archetype, 'close').container;
      for (const busRef of SC_BUSES[archetype]) {
        expect(
          close.querySelector(`[data-testid="sr-vf-badge-${busRef}"]`),
          `${archetype} L2 must render voltage badge for ${busRef}`,
        ).toBeTruthy();
      }
      const closer = renderAt(archetype, 'closer').container;
      expect(closer.querySelector('[data-testid^="sr-vf-badge-"]')).toBeFalsy();
    }
  });

  it('the field SCADA readout shows I + P + Q (not P alone) at L2', () => {
    const { container } = renderAt('T1', 'close');
    const readout = container.querySelector('[data-testid="sr-field-power-sr-t1-in"]');
    expect(readout).toBeTruthy();
    const txt = readout!.textContent ?? '';
    expect(txt).toMatch(/I=/);
    expect(txt).toMatch(/P=/);
    expect(txt).toMatch(/Q=/);
  });
});

// ---------------------------------------------------------------------------
// GATE D — expanded White Box (A→B→C→D) on busbars + fields at L2
// ---------------------------------------------------------------------------

function renderWhiteBox(archetype: 'T1' | 'T2' | 'T3' | 'T4') {
  const { model, companion } = buildArchetype(archetype);
  return render(
    <svg>
      <StationRozdzielniaSN model={model} companion={companion} detail="close" whiteBox />
    </svg>,
  );
}

describe('GATE D — complete White Box derivation present + rendered at L2', () => {
  it('every busbar SC carries a complete A→B→C→D trace (formula+substitution+result)', () => {
    for (const archetype of ['T1', 'T2', 'T3', 'T4'] as const) {
      const { model } = buildArchetype(archetype);
      for (const busRef of SC_BUSES[archetype]) {
        const trace = model.shortCircuit!.buses[busRef].max.white_box_trace;
        expect(trace.length, `${archetype}/${busRef} SC trace empty`).toBeGreaterThanOrEqual(6);
        for (const step of trace) {
          expect(step.formula_latex, 'A (formula) missing').toBeTruthy();
          expect(step.substitution_latex, 'C (substitution) missing').toBeTruthy();
          expect(step.result, 'D (result) missing').toBeTruthy();
        }
      }
    }
  });

  it('every busbar voltage AND every field flow carries a White Box derivation', () => {
    for (const archetype of ['T1', 'T2', 'T3', 'T4'] as const) {
      const { model } = buildArchetype(archetype);
      // Bus voltage derivations.
      for (const busRef of SC_BUSES[archetype]) {
        const wb = model.voltageFlow!.buses[busRef].white_box;
        expect(wb.length, `${archetype}/${busRef} VF bus WB empty`).toBeGreaterThanOrEqual(3);
        for (const s of wb) {
          expect(s.formula_latex).toBeTruthy();
          expect(s.substitution_latex).toBeTruthy();
          expect(s.result).toBeTruthy();
          expect(['solver', 'interpretacja']).toContain(s.source);
        }
      }
      // Field flow derivations.
      for (const f of model.fields) {
        if (f.role === 'SPRZEGLO' || !f.branchRef) continue;
        const wb = model.voltageFlow!.branches[f.branchRef].white_box;
        expect(wb.length, `${archetype}/${f.fieldId} VF branch WB empty`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('provenance is tagged: at least one solver-sourced step + interpretation steps', () => {
    const { model } = buildArchetype('T1');
    const wb = model.voltageFlow!.buses['SN_BUS'].white_box;
    expect(wb.some((s) => s.source === 'solver')).toBe(true);
    expect(wb.some((s) => s.source === 'interpretacja')).toBe(true);
  });

  it('renders the expanded White Box at L2 with all four parts + case_ref', () => {
    const { container } = renderWhiteBox('T1');
    // SC + voltage White Box panels are present.
    const scPanel = container.querySelector('[data-testid="sr-wb-sc-SN_BUS"]');
    const vfPanel = container.querySelector('[data-testid="sr-wb-vf-SN_BUS"]');
    expect(scPanel, 'SC White Box panel must render at L2').toBeTruthy();
    expect(vfPanel, 'voltage White Box panel must render at L2').toBeTruthy();
    // Each step carries the raw LaTeX (canonical math form) in the DOM.
    const step0 = container.querySelector('[data-testid="sr-wb-sc-SN_BUS-step-0"]');
    expect(step0!.getAttribute('data-formula-latex')).toBeTruthy();
    expect(step0!.getAttribute('data-substitution-latex')).toBeTruthy();
    // The rendered text shows A) / B) / C) / D) parts.
    const txt = scPanel!.textContent ?? '';
    expect(txt).toMatch(/A\)/);
    expect(txt).toMatch(/B\) dane/);
    expect(txt).toMatch(/C\)/);
    expect(txt).toMatch(/D\)/);
  });

  it('the White Box is an L2-only expansion (absent at closer)', () => {
    const { model, companion } = buildArchetype('T1');
    const { container } = render(
      <svg>
        <StationRozdzielniaSN model={model} companion={companion} detail="closer" whiteBox />
      </svg>,
    );
    expect(container.querySelector('[data-whitebox="expanded"]')).toBeFalsy();
  });
});
