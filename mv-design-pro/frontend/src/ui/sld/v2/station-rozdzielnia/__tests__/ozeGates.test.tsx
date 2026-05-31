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
      expect(container.querySelector('[data-testid="oze-field-source"]')).toBeTruthy();
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
