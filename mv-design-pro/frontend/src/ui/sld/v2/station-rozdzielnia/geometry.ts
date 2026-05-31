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

import type { StationFieldDescriptor, StationFieldRole, StationNNBlock } from './contract';

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

// =============================================================================
// nN tier geometry (second voltage level — STEP 2)
// =============================================================================

export interface NNFeederGeometry {
  readonly feederId: string;
  readonly role: StationNNBlock['feeders'][number]['role'];
  /** X of the feeder's vertical drop off the nN busbar. */
  readonly x: number;
  /** Y where the feeder joins the nN busbar. */
  readonly busY: number;
  /** Y of the bottom of the feeder drop (load tap / PV inverter node). */
  readonly bottomY: number;
  /** Flow-arrow anchor on the feeder drop. */
  readonly flowAnchor: { readonly x: number; readonly y: number };
}

export interface NNGeometry {
  /** X of the transformer + nN-main vertical spine (under the TR field). */
  readonly spineX: number;
  /** Y where the SN field path bottom hands off to the transformer. */
  readonly snHandoffY: number;
  /** Centre Y of the SN/nN transformer symbol (the transformation boundary). */
  readonly transformerY: number;
  /** Centre Y of the nN main breaker. */
  readonly mainBreakerY: number;
  /** The nN busbar (second voltage level). */
  readonly busbar: { readonly x1: number; readonly x2: number; readonly y: number };
  /** Per-feeder columns hanging off the nN busbar. */
  readonly feeders: readonly NNFeederGeometry[];
}

export interface StationGeometry {
  readonly detail: StationDetailLevel;
  readonly busbar: { readonly x1: number; readonly x2: number; readonly y: number };
  readonly fields: readonly FieldGeometry[];
  /** nN tier (present only when an nN block is supplied AND detail !== 'far'). */
  readonly nn?: NNGeometry;
  /** Tight content bounds (local frame) for harness auto-fit. */
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/** Vertical drop from the SN field bottom to the transformer centre. */
const NN_TR_DROP: Readonly<Record<StationDetailLevel, number>> = {
  far: 0,
  closer: 30,
  close: 38,
};
/** Drop from the transformer centre to the nN busbar. */
const NN_BUS_DROP: Readonly<Record<StationDetailLevel, number>> = {
  far: 0,
  closer: 42,
  close: 54,
};
/** Vertical span of an nN feeder drop below the nN busbar. */
const NN_FEEDER_SPAN: Readonly<Record<StationDetailLevel, number>> = {
  far: 0,
  closer: 48,
  close: 64,
};
/** Horizontal pitch between nN feeder columns. */
const NN_FEEDER_PITCH: Readonly<Record<StationDetailLevel, number>> = {
  far: 0,
  closer: 60,
  close: 74,
};

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
  nnBlock?: StationNNBlock,
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

  // nN tier: hang the transformer + nN busbar + feeders below the SN
  // TRANSFORMATOROWE field. Only when an nN block is supplied and we are not at
  // the compact 'far' level (far stays a one-line SN overview). ONE source.
  let nn: NNGeometry | undefined;
  if (nnBlock && detail !== 'far') {
    const trField = fieldGeoms.find((f) => f.role === 'TRANSFORMATOROWE');
    const spineX = trField ? trField.x : 0;
    const snHandoffY = BUS_Y + span;
    const transformerY = snHandoffY + NN_TR_DROP[detail];
    const nnBusY = transformerY + NN_BUS_DROP[detail];
    const mainBreakerY = (transformerY + nnBusY) / 2;
    const fCount = Math.max(1, nnBlock.feeders.length);
    const nnPitch = NN_FEEDER_PITCH[detail];
    const nnTotalWidth = (fCount - 1) * nnPitch;
    // Centre the nN feeder row under the transformer spine.
    const nnFirstX = spineX - nnTotalWidth / 2;
    const feederGeoms: NNFeederGeometry[] = nnBlock.feeders.map((feeder, i) => {
      const x = nnFirstX + i * nnPitch;
      const bottomY = nnBusY + NN_FEEDER_SPAN[detail];
      return {
        feederId: feeder.feederId,
        role: feeder.role,
        x,
        busY: nnBusY,
        bottomY,
        flowAnchor: { x, y: nnBusY + NN_FEEDER_SPAN[detail] * 0.32 },
      };
    });
    const nnBusX1 = Math.min(nnFirstX, spineX) - BUS_OVERHANG;
    const nnBusX2 = Math.max(nnFirstX + nnTotalWidth, spineX) + BUS_OVERHANG;
    nn = {
      spineX,
      snHandoffY,
      transformerY,
      mainBreakerY,
      busbar: { x1: nnBusX1, x2: nnBusX2, y: nnBusY },
      feeders: feederGeoms,
    };
  }

  // Bounds: busbar width × (label headroom above + deepest field path below).
  // Headroom must clear BOTH the station header (top) AND the per-field role
  // tags below it — hence generous, level-aware headroom (avoids the header
  // colliding with WE/WY/TR tags at the compact 'far' level).
  const headroom = detail === 'close' ? 72 : detail === 'closer' ? 60 : 52;
  const footroom = detail === 'close' ? 60 : detail === 'closer' ? 40 : 30;
  const top = BUS_Y - headroom;
  // The nN tier extends the content downward; include its deepest feeder.
  const nnBottom = nn
    ? Math.max(...nn.feeders.map((f) => f.bottomY), nn.busbar.y) + footroom + 16
    : -Infinity;
  const bottom = Math.max(BUS_Y + span + footroom, nnBottom);
  const minX = nn ? Math.min(busX1, nn.busbar.x1) : busX1;
  const maxX = nn ? Math.max(busX2, nn.busbar.x2) : busX2;

  return {
    detail,
    busbar: { x1: busX1, x2: busX2, y: BUS_Y },
    fields: fieldGeoms,
    nn,
    bounds: {
      x: minX - 8,
      y: top,
      width: maxX - minX + 16,
      height: bottom - top,
    },
  };
}
