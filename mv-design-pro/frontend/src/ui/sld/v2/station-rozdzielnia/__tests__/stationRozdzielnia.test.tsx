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
        // Every field rendered.
        const { model } = buildArchetype(archetype);
        for (const f of model.fields) {
          expect(container.querySelector(`[data-testid="sr-field-${f.fieldId}"]`)).toBeTruthy();
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

  it('reverse branch → arrow flips (network field, down)', () => {
    // T4 OUT branch is solver-signed 'reverse'.
    const { model, companion } = buildT4();
    const { container } = render(
      <svg>
        <StationRozdzielniaSN model={model} companion={companion} detail="closer" />
      </svg>,
    );
    const flow = container.querySelector('[data-testid="sr-flow-sr-t4-out"]');
    expect(flow).toBeTruthy();
    expect(flow!.getAttribute('data-flow-direction')).toBe('reverse');
    expect(flow!.getAttribute('data-flow-points')).toBe('down');
  });

  it('open / de-energized branch (NOP coupler) → NO arrow', () => {
    const { model, companion } = buildT4();
    const { container } = render(
      <svg>
        <StationRozdzielniaSN model={model} companion={companion} detail="closer" />
      </svg>,
    );
    // The coupler branch is in open_point_branch_refs with direction 'none'.
    expect(container.querySelector('[data-testid="sr-flow-sr-t4-coupler"]')).toBeFalsy();
    // And the NOP marker is shown.
    expect(container.querySelector('[data-testid="sr-field-nop-sr-t4-coupler"]')).toBeTruthy();
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
  it('closed CB renders with data-state="closed"; open NOP coupler with open path', () => {
    const { container } = renderUnit('T4', 'close');
    const inField = container.querySelector('[data-testid="sr-field-sr-t4-in"]');
    expect(inField!.getAttribute('data-switch-state')).toBe('closed');
    const coupler = container.querySelector('[data-testid="sr-field-sr-t4-coupler"]');
    expect(coupler!.getAttribute('data-switch-state')).toBe('open');
    expect(coupler!.getAttribute('data-is-nop')).toBe('true');
  });

  it('directional feeder (T3 ODG) renders 67/67N protection chips at close zoom', () => {
    const { container } = renderUnit('T3', 'close');
    const prot = container.querySelector('[data-testid="sr-protection-sr-t3-odg"]');
    expect(prot).toBeTruthy();
    expect(prot!.querySelector('[data-protection-code="50"]')).toBeTruthy();
    expect(prot!.querySelector('[data-protection-code="67"]')).toBeTruthy();
    expect(prot!.querySelector('[data-protection-code="67N"]')).toBeTruthy();
  });

  it('protection chips appear only at close zoom (responsive detail)', () => {
    expect(renderUnit('T1', 'far').container.querySelector('[data-testid^="sr-protection-"]')).toBeFalsy();
    expect(renderUnit('T1', 'closer').container.querySelector('[data-testid^="sr-protection-"]')).toBeFalsy();
    expect(renderUnit('T1', 'close').container.querySelector('[data-testid^="sr-protection-"]')).toBeTruthy();
  });
});
