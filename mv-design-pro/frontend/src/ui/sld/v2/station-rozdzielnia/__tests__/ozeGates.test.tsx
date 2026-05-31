/**
 * OZE source archetypes — COUNTABLE acceptance gates G/H/I/J (KROK 2, Runda 2a).
 *
 * Assert NUMBERS on the companion data AND the rendered DOM (render is the proof):
 *   G — source: machine type (IBG/synchr./asynchr.) + NC RfG mode visible;
 *       generation is BIDIRECTIONAL with the direction READ from the solver.
 *   H — power hierarchy Pzainst ≥ Pn,AC ≥ Pprzyłącz ≥ Posiągl, with a verdict flag.
 *   I — protection set is a FUNCTION of the machine type.
 *   J — short-circuit contribution machine-typed: IBG ≠ synchronous machine.
 * Plus the inherited T1-T4 invariants relevant here (orthogonal routing, ≤Icw).
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OzeSourceArchetype } from '../OzeSourceArchetype';
import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';

const PV = ['G1', 'G2', 'G3'] as const;

function renderOze(archetype: string, detail: 'far' | 'closer' | 'close') {
  const companion = OZE_ARCHETYPES_2A[archetype];
  return render(
    <svg>
      <OzeSourceArchetype companion={companion} stationCode={archetype} name={archetype} detail={detail} />
    </svg>,
  );
}

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
    const txt = badge!.textContent ?? '';
    expect(txt).toMatch(/IBG/);
    expect(txt).toMatch(/Q\(U\)/);
  });

  it('generation is reverse export — direction READ from the solver (not assumed)', () => {
    // G2/G3 net-export to the grid: the incomer branch is solver-signed reverse.
    for (const a of ['G2', 'G3'] as const) {
      const incomer = OZE_ARCHETYPES_2A[a].voltage_flow.branches['sr/branch/in'];
      expect(incomer.direction).toBe('reverse');
      expect(incomer.p_mw).toBeLessThan(0);
    }
    // And the rendered arrow points UP (toward the grid) for the exporter.
    const { container } = renderOze('G2', 'closer');
    const arrow = container.querySelector('[data-testid="oze-flow-incomer"]');
    expect(arrow!.getAttribute('data-flow-direction')).toBe('reverse');
    expect(arrow!.getAttribute('data-flow-points')).toBe('up');
  });

  it('the PCC is explicitly marked', () => {
    const { container } = renderOze('G2', 'close');
    expect(container.querySelector('[data-testid="oze-pcc-marker"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// GATE H — power hierarchy Pzainst ≥ Pn,AC ≥ Pprzyłącz ≥ Posiągl + verdict
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
    expect(hb).toBeTruthy();
    expect(hb!.getAttribute('data-valid')).toBe('true');
    expect(hb!.textContent ?? '').toMatch(/HIERARCHIA MOCY/);
  });

  it('TRIPWIRE: a violated hierarchy reports valid=false (the check is real)', () => {
    const good = OZE_ARCHETYPES_2A.G1;
    const broken = {
      ...good,
      source: {
        ...good.source,
        // Pn,AC > Pzainst — a real violation.
        power_hierarchy: { ...good.source.power_hierarchy, valid: false },
      },
    };
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
// GATE I — protection set is a function of the machine type
// ---------------------------------------------------------------------------

describe('GATE I — protection set matches the machine type', () => {
  it('IBG protection includes directional OC + anti-islanding + V/f', () => {
    for (const a of PV) {
      const codes = OZE_ARCHETYPES_2A[a].source.protection_codes;
      expect(codes).toContain('67');
      expect(codes).toContain('67N');
      expect(codes).toContain('anti-islanding');
      expect(codes).toContain('81U');
      expect(codes).toContain('59N');
      // IBG must NOT carry synchronous-machine-only functions (25 synchro-check, 40).
      expect(codes).not.toContain('25');
      expect(codes).not.toContain('40');
    }
  });

  it('renders the protection codes at L2', () => {
    const { container } = renderOze('G1', 'close');
    const prot = container.querySelector('[data-testid="oze-protection"]');
    expect(prot).toBeTruthy();
    expect(prot!.getAttribute('data-machine-type')).toBe('IBG');
    expect(prot!.textContent ?? '').toMatch(/67/);
  });
});

// ---------------------------------------------------------------------------
// GATE J — short-circuit contribution machine-typed: IBG ≠ synchronous machine
// ---------------------------------------------------------------------------

describe('GATE J — SC contribution is IBG (bounded current), NOT a machine', () => {
  it('every bus tags the source contribution as IBG, not synchronous', () => {
    for (const a of PV) {
      const buses = OZE_ARCHETYPES_2A[a].short_circuit.buses;
      for (const bus of Object.values(buses)) {
        expect(bus.source_contribution.machine_type).toBe('IBG');
        expect(bus.source_contribution.is_synchronous_machine).toBe(false);
        expect(bus.source_contribution.ik_contribution_ka).toBeGreaterThan(0);
        // The model string names the IEC 60909 §6.7 current-source treatment.
        expect(bus.source_contribution.model).toMatch(/6\.7|ograniczony/i);
      }
    }
  });

  it('renders the machine-typed contribution at L2 with the synchronous=false flag', () => {
    const { container } = renderOze('G2', 'close');
    const contrib = container.querySelector('[data-testid="oze-sc-contrib-PCC_SN"]');
    expect(contrib).toBeTruthy();
    expect(contrib!.getAttribute('data-machine-type')).toBe('IBG');
    expect(contrib!.getAttribute('data-synchronous')).toBe('false');
    expect(contrib!.textContent ?? '').toMatch(/ograniczony/);
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
// Inherited T1-T4 invariant — orthogonal routing (zero diagonal segments)
// ---------------------------------------------------------------------------

describe('inherited — OZE unit routing is orthogonal (no diagonal connection lines)', () => {
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

  it('clicking the source breaker fires the hook (future config/derivation panel)', () => {
    const onFieldClick = vi.fn();
    const companion = OZE_ARCHETYPES_2A.G1;
    const { container } = render(
      <svg>
        <OzeSourceArchetype companion={companion} stationCode="G1" name="G1" detail="close" onFieldClick={onFieldClick} />
      </svg>,
    );
    (container.querySelector('[data-testid="oze-source-breaker"]') as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onFieldClick).toHaveBeenCalledWith('G1/breaker');
  });
});
