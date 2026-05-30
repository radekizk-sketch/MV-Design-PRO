/**
 * STACJA-ROZDZIELNIA SN — the ONE geometry source (N-5).
 *
 * This is the single, deterministic (N-7) source of layout for the responsive
 * station-rozdzielnia unit. It is typed per field role and detail level — a
 * CONTROLLED internal layout (the structural fix for the old L2 tangle), NOT a
 * content-driven free-for-all. The component renders strictly what this emits.
 *
 * Coordinate frame: local, origin at the station centre. The SN busbar is a
 * horizontal line at y = BUS_Y; fields are evenly pitched columns hanging off
 * the busbar. The "power path" of each field runs vertically through its
 * apparatus stack; the power-flow arrow is placed ON that path (the arrow runs
 * THROUGH the apparatus, never between boxes).
 *
 * Determinism: pure function of (archetype-ordered fields, detail). No Math.random,
 * no Date, no map iteration order dependence — fields are consumed in their given
 * (dispatcher) order and positions are computed arithmetically.
 */

import type { StationFieldDescriptor, StationFieldRole } from './contract';

// =============================================================================
// Detail levels (responsive — detail accretes INSIDE the ordered rozdzielnia)
// =============================================================================

/**
 * - 'far'    (daleko):  compact rozdzielnia — busbar + field symbols + switch state.
 * - 'closer' (bliżej):  field apparatus visible, role tags, power-flow direction.
 * - 'close'  (blisko):  full IEC 60617 symbols, protection functions, catalog labels.
 */
export type StationDetailLevel = 'far' | 'closer' | 'close';

// =============================================================================
// Geometry constants (world-space px; multiples kept on a clean grid)
// =============================================================================

const FIELD_PITCH: Readonly<Record<StationDetailLevel, number>> = {
  far: 56,
  closer: 84,
  close: 108,
};

/** Vertical span available below the busbar for the field's apparatus stack. */
const STACK_SPAN: Readonly<Record<StationDetailLevel, number>> = {
  far: 34,
  closer: 90,
  close: 150,
};

/** Apparatus symbol pitch within a field column (centre-to-centre). */
const APPARATUS_PITCH: Readonly<Record<StationDetailLevel, number>> = {
  far: 0, // far: no individual apparatus, only a state diamond
  closer: 26,
  close: 30,
};

const BUS_Y = 0;
/** Horizontal busbar overhang past the outermost field column. */
const BUS_OVERHANG = 22;
/** Drop from the busbar to the first apparatus on the field path. */
const FIRST_APPARATUS_DROP = 22;

// =============================================================================
// Output shapes (the component consumes these verbatim)
// =============================================================================

export interface ApparatusSlot {
  readonly deviceRef: string;
  /** Centre of the apparatus symbol on the field power path. */
  readonly x: number;
  readonly y: number;
}

export interface FieldGeometry {
  readonly fieldId: string;
  readonly role: StationFieldRole;
  /** X of the field's vertical power path (centre of the column). */
  readonly x: number;
  /** Y where the field path joins the busbar. */
  readonly busY: number;
  /** Y of the bottom of the field path (cable exit / TR / open point). */
  readonly pathBottomY: number;
  /** Per-apparatus slot positions (empty at 'far'). */
  readonly apparatus: readonly ApparatusSlot[];
  /**
   * The power-flow arrow anchor — a point ON the power path, between the busbar
   * and the breaker, where the through-flow arrow is drawn. The DIRECTION is
   * decided by the companion at render time (this only fixes the geometry).
   */
  readonly flowAnchor: { readonly x: number; readonly y: number };
  /** Whether the field path points up to the network (IN/OUT/ODG/COUPLER) or down to TR/load. */
  readonly pathOrientation: 'network' | 'transformer' | 'lateral';
}

export interface StationGeometry {
  readonly detail: StationDetailLevel;
  readonly busbar: { readonly x1: number; readonly x2: number; readonly y: number };
  readonly fields: readonly FieldGeometry[];
  /** Tight content bounds (local frame) for harness auto-fit. */
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

// =============================================================================
// Path orientation per role (model-derived, deterministic)
// =============================================================================

function pathOrientationForRole(role: StationFieldRole): FieldGeometry['pathOrientation'] {
  switch (role) {
    case 'TRANSFORMATOROWE':
      return 'transformer';
    case 'POMIAROWE':
      return 'lateral';
    case 'LINIA_IN':
    case 'LINIA_OUT':
    case 'LINIA_ODG':
    case 'SPRZEGLO':
    default:
      return 'network';
  }
}

// =============================================================================
// The geometry function (one source)
// =============================================================================

export function computeStationGeometry(
  fields: readonly StationFieldDescriptor[],
  detail: StationDetailLevel,
): StationGeometry {
  const pitch = FIELD_PITCH[detail];
  const span = STACK_SPAN[detail];
  const apparatusPitch = APPARATUS_PITCH[detail];
  const count = Math.max(1, fields.length);

  // Centre the row of field columns about x = 0.
  const totalWidth = (count - 1) * pitch;
  const firstX = -totalWidth / 2;

  const fieldGeoms: FieldGeometry[] = fields.map((field, index) => {
    const x = firstX + index * pitch;
    const orientation = pathOrientationForRole(field.role);
    const pathBottomY = BUS_Y + span;

    // Apparatus slots: stack downward from just below the busbar. Far level
    // shows no individual apparatus (only a state diamond near the busbar).
    const apparatus: ApparatusSlot[] =
      detail === 'far'
        ? []
        : field.apparatus.map((dev, slot) => ({
            deviceRef: dev.deviceRef,
            x,
            y: BUS_Y + FIRST_APPARATUS_DROP + slot * apparatusPitch,
          }));

    // Flow anchor sits between the busbar and the FIRST apparatus (the breaker
    // is the topmost switching apparatus on the path) — the arrow runs through it.
    const flowAnchor = { x, y: BUS_Y + FIRST_APPARATUS_DROP * 0.5 };

    return {
      fieldId: field.fieldId,
      role: field.role,
      x,
      busY: BUS_Y,
      pathBottomY,
      apparatus,
      flowAnchor,
      pathOrientation: orientation,
    };
  });

  const busX1 = firstX - BUS_OVERHANG;
  const busX2 = firstX + totalWidth + BUS_OVERHANG;

  // Bounds: busbar width × (label headroom above + deepest field path below).
  // Headroom must clear BOTH the station header (top) AND the per-field role
  // tags below it — hence generous, level-aware headroom (avoids the header
  // colliding with WE/WY/TR tags at the compact 'far' level).
  const headroom = detail === 'close' ? 72 : detail === 'closer' ? 60 : 52;
  const footroom = detail === 'close' ? 60 : detail === 'closer' ? 40 : 30;
  const top = BUS_Y - headroom;
  const bottom = BUS_Y + span + footroom;

  return {
    detail,
    busbar: { x1: busX1, x2: busX2, y: BUS_Y },
    fields: fieldGeoms,
    bounds: {
      x: busX1 - 8,
      y: top,
      width: busX2 - busX1 + 16,
      height: bottom - top,
    },
  };
}
