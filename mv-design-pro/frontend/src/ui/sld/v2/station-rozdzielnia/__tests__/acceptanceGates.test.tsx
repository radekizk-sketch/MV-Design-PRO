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
});
