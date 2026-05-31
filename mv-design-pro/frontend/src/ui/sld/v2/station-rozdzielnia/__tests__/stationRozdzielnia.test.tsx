/**
 * STACJA-ROZDZIELNIA SN — acceptance tests (KROK 1).
 *
 * Verifies (HONESTLY — these can go red on regression):
 *   - the four archetypes carry the canonical roles the task requires;
 *   - the ONE geometry source is deterministic (N-7);
 *   - the component renders all 4 archetypes × 3 detail levels without crashing;
 *   - the power-flow arrow direction THROUGH the apparatus matches the FROZEN
 *     solver companion (one truth) — flips when the companion sign flips, and
 *     vanishes for a normally-open / de-energized branch.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StationRozdzielniaSN } from '../StationRozdzielniaSN';
import {
  ALL_ARCHETYPES,
  buildArchetype,
  buildT1,
  buildT4,
} from '../archetypes';
import { computeStationGeometry, type StationDetailLevel } from '../geometry';
import type { StationArchetype } from '../contract';

const DETAILS: readonly StationDetailLevel[] = ['far', 'closer', 'close'];

function renderUnit(
  archetype: StationArchetype,
  detail: StationDetailLevel,
  overrides?: { onFieldClick?: (id: string) => void },
) {
  const { model, companion } = buildArchetype(archetype);
  return render(
    <svg>
      <StationRozdzielniaSN
        model={model}
        companion={companion}
        detail={detail}
        onFieldClick={overrides?.onFieldClick}
      />
    </svg>,
  );
}

// ---------------------------------------------------------------------------
// Archetype roles (recon-backed: built from ENM BayCanonicalRole)
// ---------------------------------------------------------------------------

describe('archetypes — canonical roles per the task spec', () => {
  it('T1 PRZELOTOWA has LINIA_IN + LINIA_OUT (+ TRANSFORMATOROWE)', () => {
    const roles = buildArchetype('T1').model.fields.map((f) => f.role);
    expect(roles).toContain('LINIA_IN');
    expect(roles).toContain('LINIA_OUT');
    expect(roles).toContain('TRANSFORMATOROWE');
  });

  it('T2 KOŃCOWA has LINIA_IN + TRANSFORMATOROWE and NO LINIA_OUT', () => {
    const roles = buildArchetype('T2').model.fields.map((f) => f.role);
    expect(roles).toContain('LINIA_IN');
    expect(roles).toContain('TRANSFORMATOROWE');
    expect(roles).not.toContain('LINIA_OUT');
  });

  it('T3 ODGAŁĘŹNA has LINIA_IN + LINIA_OUT + LINIA_ODG', () => {
    const roles = buildArchetype('T3').model.fields.map((f) => f.role);
    expect(roles).toContain('LINIA_IN');
    expect(roles).toContain('LINIA_OUT');
    expect(roles).toContain('LINIA_ODG');
  });

  it('T4 SEKCYJNA has SPRZEGLO with a normally-open point', () => {
    const { model } = buildArchetype('T4');
    const coupler = model.fields.find((f) => f.role === 'SPRZEGLO');
    expect(coupler).toBeTruthy();
    expect(coupler!.isNormallyOpen).toBe(true);
  });

  it('every archetype field role is an ENM BayCanonicalRole value', () => {
    const canonical = new Set([
      'LINIA_IN',
      'LINIA_OUT',
      'TRANSFORMATOROWE',
      'LINIA_ODG',
      'SPRZEGLO',
      'POMIAROWE',
    ]);
    for (const a of ALL_ARCHETYPES) {
      for (const f of buildArchetype(a).model.fields) {
        expect(canonical.has(f.role)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Geometry determinism (N-7) — one source
// ---------------------------------------------------------------------------

describe('geometry — deterministic (N-7)', () => {
  it('same fields + detail → byte-identical geometry across runs', () => {
    const { model } = buildT1();
    for (const detail of DETAILS) {
      const a = computeStationGeometry(model.fields, detail);
      const b = computeStationGeometry(model.fields, detail);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('field columns are centred and ordered left→right by dispatcher order', () => {
    const { model } = buildArchetype('T3');
    const geom = computeStationGeometry(model.fields, 'close');
    const xs = geom.fields.map((f) => f.x);
    // Strictly increasing (deterministic pitch).
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
    // Centred about 0.
    expect(xs[0] + xs[xs.length - 1]).toBeCloseTo(0, 6);
  });

  it('apparatus slots appear only at closer/close (far is compact)', () => {
    const { model } = buildT1();
    expect(computeStationGeometry(model.fields, 'far').fields[0].apparatus.length).toBe(0);
    expect(computeStationGeometry(model.fields, 'closer').fields[0].apparatus.length).toBeGreaterThan(0);
    expect(computeStationGeometry(model.fields, 'close').fields[0].apparatus.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Render smoke — all 4 archetypes × 3 detail levels, no crash
// ---------------------------------------------------------------------------

describe('render — all archetypes × all detail levels without crash', () => {
  for (const archetype of ALL_ARCHETYPES) {
    for (const detail of DETAILS) {
      it(`${archetype} @ ${detail} renders busbar + every field`, () => {
        const { container } = renderUnit(archetype, detail);
        const root = container.querySelector(`[data-testid="station-rozdzielnia-sr-${archetype.toLowerCase()}"]`);
        expect(root).toBeTruthy();
        expect(root!.getAttribute('data-archetype')).toBe(archetype);
        expect(root!.getAttribute('data-detail')).toBe(detail);
        // Busbar present.
        expect(container.querySelector('[data-testid^="sr-busbar-"]')).toBeTruthy();
        // Every field rendered. The SPRZEGLO field of a sectioned bus (T4) is
        // drawn as the horizontal SMC coupler, not a vertical field column.
        const { model } = buildArchetype(archetype);
        for (const f of model.fields) {
          if (model.sectionedBus && f.role === 'SPRZEGLO') {
            expect(container.querySelector(`[data-testid="sr-coupler-${f.fieldId}"]`)).toBeTruthy();
          } else {
            expect(container.querySelector(`[data-testid="sr-field-${f.fieldId}"]`)).toBeTruthy();
          }
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Clickable fields → stub handler
// ---------------------------------------------------------------------------

describe('fields are clickable → onFieldClick (stub config handler)', () => {
  it('clicking a field invokes onFieldClick with the field id', () => {
    const onFieldClick = vi.fn();
    const { container } = renderUnit('T1', 'close', { onFieldClick });
    const field = container.querySelector('[data-testid="sr-field-sr-t1-in"]') as SVGGElement;
    expect(field).toBeTruthy();
    field.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onFieldClick).toHaveBeenCalledWith('sr-t1-in');
  });
});

// ---------------------------------------------------------------------------
// POWER-FLOW DIRECTION = COMPANION (one truth, render-based, can go RED)
// ---------------------------------------------------------------------------

describe('power-flow arrow direction matches the FROZEN-solver companion', () => {
  it('forward branch → arrow points toward the busbar (network field, up)', () => {
    const { model, companion } = buildT1();
    const { container } = render(
      <svg>
        <StationRozdzielniaSN model={model} companion={companion} detail="closer" />
      </svg>,
    );
    // T1 IN branch is 'forward' → network field points up.
    const flow = container.querySelector('[data-testid="sr-flow-sr-t1-in"]');
    expect(flow).toBeTruthy();
    expect(flow!.getAttribute('data-flow-direction')).toBe('forward');
    expect(flow!.getAttribute('data-flow-points')).toBe('up');
  });

  it('reverse branch (T1 PV backfeed) → nN feeder arrow points UP into the bus', () => {
    // The PV nN feeder is solver-signed 'reverse' (injection backfeeds the bus).
    // This is REAL solver truth (negative P from the frozen substrate), not a
    // fabricated sign — the renderer reads it from the companion.
    const { model, companion } = buildT1();
    const { container } = render(
      <svg>
        <StationRozdzielniaSN model={model} companion={companion} detail="closer" />
      </svg>,
    );
    const pvFeeder = container.querySelector('[data-testid="sr-nn-feeder-sr-t1-nn-pv"]');
    expect(pvFeeder).toBeTruthy();
    expect(pvFeeder!.getAttribute('data-flow-direction')).toBe('reverse');
    // A load feeder on the same bus flows the other way (forward = down to load).
    const loadFeeder = container.querySelector('[data-testid="sr-nn-feeder-sr-t1-nn-f1"]');
    expect(loadFeeder!.getAttribute('data-flow-direction')).toBe('forward');
  });

  it('open / de-energized branch (NOP coupler) → NO arrow; NOP on the breaker', () => {
    const { model, companion } = buildT4();
    const { container } = render(
      <svg>
        <StationRozdzielniaSN model={model} companion={companion} detail="closer" />
      </svg>,
    );
    // The coupler branch is in open_point_branch_refs with direction 'none' — no
    // through-flow arrow on the coupler.
    expect(container.querySelector('[data-testid="sr-flow-sr-t4-coupler"]')).toBeFalsy();
    // The NOP marker sits on the coupler BREAKER (SMC), not an abstract field X.
    expect(container.querySelector('[data-testid="sr-coupler-nop"]')).toBeTruthy();
    const coupler = container.querySelector('[data-testid="sr-coupler-sr-t4-coupler"]');
    expect(coupler!.getAttribute('data-is-nop')).toBe('true');
  });

  it('REGRESSION TRIPWIRE: arrow direction is READ from the companion, not the role', () => {
    // Flip the companion sign for the IN branch and assert the rendered arrow
    // flips too — proves the SLD does not re-derive direction from topology.
    const { model } = buildT1();
    const flipped = {
      ...buildT1().companion,
      branch_flow: {
        ...buildT1().companion.branch_flow,
        'sr/branch/in': { direction: 'reverse' as const, p_from_mw: -6.4 },
      },
    };
    const { container } = render(
      <svg>
        <StationRozdzielniaSN model={model} companion={flipped} detail="closer" />
      </svg>,
    );
    const flow = container.querySelector('[data-testid="sr-flow-sr-t1-in"]');
    expect(flow!.getAttribute('data-flow-direction')).toBe('reverse');
    // network field + reverse → points down (opposite of the forward case above).
    expect(flow!.getAttribute('data-flow-points')).toBe('down');
  });

  it('no companion → no arrows (no solver truth = no direction)', () => {
    const { model } = buildT1();
    const { container } = render(
      <svg>
        <StationRozdzielniaSN model={model} companion={null} detail="closer" />
      </svg>,
    );
    expect(container.querySelector('[data-testid^="sr-flow-"]')).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Switch states + protection rendered from the model (recon-backed)
// ---------------------------------------------------------------------------

describe('switch states + protection are rendered from the (ENM-derived) model', () => {
  it('closed CB field renders data-state="closed"; SMC coupler breaker is open (NOP)', () => {
    const { container } = renderUnit('T4', 'close');
    const inField = container.querySelector('[data-testid="sr-field-sr-t4-in"]');
    expect(inField!.getAttribute('data-switch-state')).toBe('closed');
    // The coupler is the horizontal SMC; its breaker carries the open NOP state.
    const couplerBreaker = container.querySelector('[data-testid="sr-coupler-breaker"]');
    expect(couplerBreaker!.getAttribute('data-state')).toBe('open');
    const coupler = container.querySelector('[data-testid="sr-coupler-sr-t4-coupler"]');
    expect(coupler!.getAttribute('data-is-nop')).toBe('true');
  });

  it('ABB protection is TYPE-CORRECT: CBC field carries the relay, SDC/SDF do not', () => {
    // v2 rule (owner): SDF→bezpiecznik (the fuse IS the protection), CBC→przekaźnik.
    // T2 has a CBC incomer (relay) and an SDF transformer field (fuse, no relay).
    const { container } = renderUnit('T2', 'close');
    // CBC incomer → 50/51 overcurrent relay chips.
    const cbc = container.querySelector('[data-testid="sr-protection-sr-t2-in"]');
    expect(cbc).toBeTruthy();
    expect(cbc!.querySelector('[data-protection-code="50"]')).toBeTruthy();
    expect(cbc!.querySelector('[data-protection-code="51"]')).toBeTruthy();
    // SDF transformer field → NO relay chips (protected by HV fuses).
    expect(container.querySelector('[data-testid="sr-protection-sr-t2-tr"]')).toBeFalsy();
    // And the SDF field actually renders a fuse symbol.
    expect(container.querySelector('[data-testid="sr-apparatus-sr-t2-tr/f1"]')).toBeTruthy();
  });

  it('T4 SMC coupler carries the bus-tie relay; T3 ZKSN (SDC) carries none', () => {
    const t4 = renderUnit('T4', 'close').container;
    expect(t4.querySelector('[data-testid="sr-protection-sr-t4-coupler"]')).toBeTruthy();
    // T3 is a ZKSN cable junction: SDC line fields only → no relay chips at all.
    const t3 = renderUnit('T3', 'close').container;
    expect(t3.querySelector('[data-testid^="sr-protection-"]')).toBeFalsy();
  });

  it('protection chips appear only at close zoom (responsive detail)', () => {
    // T2 CBC incomer carries the relay → only visible at close zoom.
    expect(renderUnit('T2', 'far').container.querySelector('[data-testid^="sr-protection-"]')).toBeFalsy();
    expect(renderUnit('T2', 'closer').container.querySelector('[data-testid^="sr-protection-"]')).toBeFalsy();
    expect(renderUnit('T2', 'close').container.querySelector('[data-testid^="sr-protection-"]')).toBeTruthy();
  });
});
