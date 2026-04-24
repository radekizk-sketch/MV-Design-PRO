/**
 * bayRenderer.ts — Switchgear Bay Renderer (Computational Geometry)
 *
 * CANONICAL CONTRACT (BINDING):
 * - Version: V1
 * - COMPUTATIONAL LOGIC ONLY — no React components, no physics.
 * - Deterministic: sorted by ID, no randomness.
 * - Immutable interfaces (readonly).
 * - Imports types from fieldDeviceContracts.ts and layoutResult.ts.
 *
 * ARCHITECTURE:
 * - APPLICATION LAYER: visualization geometry only.
 * - NO physics calculations.
 * - NO model mutation.
 *
 * CANONICAL-GRADE bay layout algorithm:
 * - Fields sorted by canonical role priority.
 * - Devices placed vertically within bay by powerPathPosition.
 * - OFF_PATH devices offset horizontally.
 * - Busbar geometry spans all bays.
 * - LOCAL_SECTIONAL coupler geometry placed between bus sections.
 * - Internal connections: vertical lines for sequential power-path devices.
 * - All arrays sorted by ID for determinism.
 */

import type {
  StationBlockDetailV1,
  FieldV1,
  DeviceV1,
  EmbeddingRoleV1,
} from './fieldDeviceContracts';
import {
  DevicePowerPathPositionV1,
  DeviceElectricalRoleV1,
  DeviceTypeV1,
  FieldRoleV1,
} from './fieldDeviceContracts';
import type { PointV1, RectangleV1 } from './layoutResult';
import type { CanonicalSymbolId } from '../SymbolResolver';

// =============================================================================
// GEOMETRY CONSTANTS
// =============================================================================

/** Minimum bay width in pixels. */
const MIN_BAY_WIDTH = 60;

/** Height of busbar area at top of block. */
const BUSBAR_HEIGHT = 10;

/** Top and bottom margin inside block. */
const BLOCK_MARGIN = 10;

/** Vertical gap from busbar connection to first device (UPSTREAM). */
const DEVICE_Y_FROM_BUSBAR = 20;

/** Vertical step between sequential power-path devices. */
const DEVICE_VERTICAL_STEP = 34;

/** Horizontal offset for OFF_PATH devices (relative to bay center). */
const OFF_PATH_X_OFFSET = 36;

/** Default device size in pixels. */
const DEVICE_DEFAULT_WIDTH = 24;
const DEVICE_DEFAULT_HEIGHT = 24;

/** Larger device size for transformers and generators. */
const DEVICE_LARGE_WIDTH = 28;
const DEVICE_LARGE_HEIGHT = 28;

// =============================================================================
// FIELD ROLE PRIORITY ORDER (canonical, deterministic)
// =============================================================================

/**
 * Canonical sort order for field roles within a bay layout.
 *
 * Follows CANONICAL convention: primary supply bays on the left, then
 * transformers, then source bays, then couplers/ties, then LV bays.
 */
const FIELD_ROLE_PRIORITY: Record<string, number> = {
  GPZ_LINE_BAY: 0,
  LINE_IN: 1,
  LINE_OUT: 2,
  TRANSFORMER_SN_NN: 3,
  MEASUREMENT_SN: 4,
  COUPLER_SN: 5,
  LINE_BRANCH: 6,
  PV_SN: 7,
  BESS_SN: 8,
  FW_SN: 9,
  BUS_TIE: 10,
  MAIN_NN: 11,
  FEEDER_NN: 12,
  PV_NN: 13,
  BESS_NN: 14,
};

// =============================================================================
// DEVICE SIZE HELPERS
// =============================================================================

/**
 * Returns the rendered size for a given device type.
 * Large symbols are used for transformers and generators.
 */
function deviceSize(deviceType: DeviceTypeV1): { width: number; height: number } {
  switch (deviceType) {
    case DeviceTypeV1.CB:
    case DeviceTypeV1.DS:
    case DeviceTypeV1.ES:
    case DeviceTypeV1.LOAD_SWITCH:
    case DeviceTypeV1.CABLE_HEAD:
      return { width: 28, height: 28 };
    case DeviceTypeV1.FUSE:
      return { width: 16, height: 28 };
    case DeviceTypeV1.CT:
    case DeviceTypeV1.VT:
      return { width: 24, height: 24 };
    case DeviceTypeV1.TRANSFORMER_DEVICE:
    case DeviceTypeV1.GENERATOR_PV:
    case DeviceTypeV1.GENERATOR_BESS:
    case DeviceTypeV1.PCS:
    case DeviceTypeV1.BATTERY:
      return { width: DEVICE_LARGE_WIDTH, height: DEVICE_LARGE_HEIGHT };
    default:
      return { width: DEVICE_DEFAULT_WIDTH, height: DEVICE_DEFAULT_HEIGHT };
  }
}

/**
 * Returns rotation (degrees) for a device in a vertical bay.
 * CT and VT are oriented horizontally (90°) when placed inline.
 * All others are 0° (vertical orientation).
 */
function deviceRotation(deviceType: DeviceTypeV1): number {
  switch (deviceType) {
    case DeviceTypeV1.CT:
    case DeviceTypeV1.VT:
      return 90;
    default:
      return 0;
  }
}

// =============================================================================
// DEVICE TYPE → CANONICAL SYMBOL ID MAPPING
// =============================================================================

/**
 * Maps DeviceTypeV1 to CanonicalSymbolId.
 *
 * BINDING: every DeviceTypeV1 must have a canonical symbol.
 * Fallback: 'circuit_breaker' for unrecognised types.
 */
export function mapDeviceTypeToSymbolId(deviceType: DeviceTypeV1): CanonicalSymbolId {
  switch (deviceType) {
    case DeviceTypeV1.CB:
      return 'circuit_breaker';
    case DeviceTypeV1.DS:
      return 'disconnector';
    case DeviceTypeV1.CT:
      return 'ct';
    case DeviceTypeV1.VT:
      return 'vt';
    case DeviceTypeV1.RELAY:
      return 'relay';
    case DeviceTypeV1.FUSE:
      return 'fuse';
    case DeviceTypeV1.ES:
      return 'earthing_switch';
    case DeviceTypeV1.TRANSFORMER_DEVICE:
      return 'transformer_2w';
    case DeviceTypeV1.GENERATOR_PV:
      return 'pv';
    case DeviceTypeV1.GENERATOR_BESS:
      return 'bess';
    case DeviceTypeV1.GENERATOR_FW:
      return 'fw';
    case DeviceTypeV1.ACB:
      return 'circuit_breaker';
    case DeviceTypeV1.CABLE_HEAD:
      return 'cable_head';
    case DeviceTypeV1.PCS:
      return 'inverter';
    case DeviceTypeV1.BATTERY:
      return 'bess';
    case DeviceTypeV1.LOAD_SWITCH:
      return 'circuit_breaker';
  }
}

// =============================================================================
// INTERFACE DEFINITIONS
// =============================================================================

/**
 * Geometry of a single device within a bay.
 *
 * All coordinates are in world pixels, absolute within the station block.
 */
export interface BayDeviceGeometryV1 {
  /** Stable device ID (= DeviceV1.id). */
  readonly deviceId: string;
  /** Device type. */
  readonly deviceType: DeviceTypeV1;
  /** CANONICAL symbol ID resolved from deviceType. */
  readonly symbolId: CanonicalSymbolId;
  /** Center position of the device within the bay (world coords). */
  readonly position: PointV1;
  /** Rendered size of the device symbol. */
  readonly size: { readonly width: number; readonly height: number };
  /** Rotation in degrees (0 = vertical, 90 = horizontal). */
  readonly rotation: number;
  /** Rola elektryczna urządzenia. */
  readonly electricalRole: DeviceElectricalRoleV1;
  /** Pozycja urządzenia w torze mocy. */
  readonly powerPathPosition: DevicePowerPathPositionV1;
  /** Slot układu pola wykorzystywany przez renderer SVG. */
  readonly layoutSlot: 'MAIN' | 'SIDE_RIGHT' | 'SIDE_LEFT' | 'MEASUREMENT_MAIN' | 'COUPLER_LEFT' | 'COUPLER_RIGHT';
  /**
   * Whether this device is on the main power path.
   * POWER_PATH, MEASUREMENT, and TERMINATION roles = true.
   * PROTECTION / OFF_PATH = false.
   */
  readonly isOnPowerPath: boolean;
  /**
   * Absolute connection points at top/bottom of device symbol center.
   * Used to draw internal connections between sequential devices.
   */
  readonly connectionPoints: {
    readonly top: PointV1;
    readonly bottom: PointV1;
  };
}

export interface BayAuxiliaryConnectionV1 {
  readonly from: PointV1;
  readonly to: PointV1;
  readonly kind: 'BUS_TAP' | 'MAIN_EXIT' | 'SIDE_BRANCH' | 'COUPLER_LINK';
}

/**
 * Geometry of a single switchgear bay (= FieldV1).
 *
 * A bay is a vertical column within the station block, containing one field's
 * devices arranged top-to-bottom from busbar to cable exit.
 */
export interface BayGeometryV1 {
  /** Bay ID equals the FieldV1.id. */
  readonly bayId: string;
  /** Parent station ID. */
  readonly stationId: string;
  /** Field role of this bay. */
  readonly fieldRole: FieldRoleV1;
  /** Bounding box of the bay within the station block (world coords). */
  readonly bounds: RectangleV1;
  /** Y-coordinate of the busbar connection point for this bay. */
  readonly busbarY: number;
  /** Devices within this bay, sorted by deviceId for determinism. */
  readonly devices: readonly BayDeviceGeometryV1[];
  /** Point where the line/cable connects to this bay (bottom of bay). */
  readonly cableExitPoint: PointV1;
  /** Incoming trunk port position (null if not applicable). */
  readonly portIn: PointV1 | null;
  /** Outgoing trunk port position (null if not applicable). */
  readonly portOut: PointV1 | null;
}

/**
 * Geometry of the busbar running across the station block.
 *
 * For LOCAL_SECTIONAL stations there are two bus sections; for all others
 * there is a single section spanning all bays.
 */
export interface BusbarGeometryV1 {
  /** Y-coordinate of the busbar in world coords. */
  readonly y: number;
  /** Left x-coordinate of the busbar span. */
  readonly x1: number;
  /** Right x-coordinate of the busbar span. */
  readonly x2: number;
  /** Bus sections (one per BusSectionV1, sorted by sectionId). */
  readonly sections: readonly {
    readonly x1: number;
    readonly x2: number;
    readonly sectionId: string;
  }[];
}

/**
 * Geometry of the bus coupler device for LOCAL_SECTIONAL stations.
 *
 * The coupler is placed centrally between the two bus sections.
 */
export interface CouplerGeometryV1 {
  /** ID of the coupler field (= StationBlockDetailV1.couplerFieldId). */
  readonly couplerFieldId: string;
  /** Center position of the coupler device. */
  readonly position: PointV1;
  /** Rendered size of the coupler. */
  readonly size: { readonly width: number; readonly height: number };
  /** Y-coordinate of busbar section 1 (left). */
  readonly busbar1Y: number;
  /** Y-coordinate of busbar section 2 (right). */
  readonly busbar2Y: number;
}

/**
 * Complete bay layout result for a station block.
 *
 * Top-level output of computeBayLayout(). Consumed by the SLD renderer
 * to draw station internals. Contains no physics — geometry only.
 */
export interface StationBayLayoutV1 {
  /** Station ID (= StationBlockDetailV1.blockId). */
  readonly stationId: string;
  /** Embedding role determining layout variant. */
  readonly embeddingRole: EmbeddingRoleV1;
  /** Total bounding box of the station block. */
  readonly totalBounds: RectangleV1;
  /** Busbar geometry. */
  readonly busbarGeometry: BusbarGeometryV1;
  /** All bays, sorted by bayId for determinism. */
  readonly bays: readonly BayGeometryV1[];
  /** Coupler geometry for LOCAL_SECTIONAL stations; null otherwise. */
  readonly couplerGeometry: CouplerGeometryV1 | null;
  /**
   * Internal vertical connections between sequential power-path devices
   * within each bay. Sorted by from.x, then from.y for determinism.
   */
  readonly internalConnections: readonly { readonly from: PointV1; readonly to: PointV1 }[];
  /** Dodatkowe połączenia: doprowadzenie z szyny, odgałęzienia boczne, U sprzęgła. */
  readonly auxiliaryConnections: readonly BayAuxiliaryConnectionV1[];
}

// =============================================================================
// MAIN ALGORITHM
// =============================================================================

/**
 * Sort fields by canonical role priority, then by field ID as stable tiebreak.
 */
function sortFieldsByRolePriority(fields: readonly FieldV1[]): readonly FieldV1[] {
  return [...fields].sort((a, b) => {
    const pa = FIELD_ROLE_PRIORITY[a.fieldRole] ?? 99;
    const pb = FIELD_ROLE_PRIORITY[b.fieldRole] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Returns the power-path ordering index for a device position.
 * Used to sort devices top-to-bottom within a bay.
 */
function powerPathOrder(pos: string): number {
  switch (pos) {
    case DevicePowerPathPositionV1.UPSTREAM:
      return 0;
    case DevicePowerPathPositionV1.MIDSTREAM:
      return 1;
    case DevicePowerPathPositionV1.DOWNSTREAM:
      return 2;
    case DevicePowerPathPositionV1.OFF_PATH:
      return 3;
    default:
      return 9;
  }
}

/**
 * Returns true if the device is considered "on the power path" for the
 * purpose of isOnPowerPath and internal connection drawing.
 */
function isDeviceOnPowerPath(device: DeviceV1): boolean {
  return (
    device.powerPathPosition !== DevicePowerPathPositionV1.OFF_PATH &&
    (
      device.electricalRole === DeviceElectricalRoleV1.POWER_PATH ||
      device.electricalRole === DeviceElectricalRoleV1.MEASUREMENT ||
      device.electricalRole === DeviceElectricalRoleV1.TERMINATION
    )
  );
}

function isCouplerFieldRole(fieldRole: FieldRoleV1): boolean {
  return fieldRole === FieldRoleV1.COUPLER_SN || fieldRole === FieldRoleV1.BUS_TIE;
}

function isMeasurementFieldRole(fieldRole: FieldRoleV1): boolean {
  return fieldRole === FieldRoleV1.MEASUREMENT_SN;
}

/**
 * Build BayDeviceGeometryV1 for all devices in a single field.
 *
 * Devices are placed vertically:
 *   UPSTREAM   → busbarY + DEVICE_Y_FROM_BUSBAR
 *   MIDSTREAM  → previous + DEVICE_VERTICAL_STEP
 *   DOWNSTREAM → previous + DEVICE_VERTICAL_STEP
 *   OFF_PATH   → same y as MIDSTREAM slot, but x offset by OFF_PATH_X_OFFSET
 *
 * All positions are world coordinates within the station block.
 */
function buildBayDevices(
  fieldRole: FieldRoleV1,
  fieldDevices: readonly DeviceV1[],
  bayCenterX: number,
  busbarY: number,
): readonly BayDeviceGeometryV1[] {
  // Sort devices: by power-path position order, then stable by device ID.
  const sorted = [...fieldDevices].sort((a, b) => {
    const pa = powerPathOrder(a.powerPathPosition);
    const pb = powerPathOrder(b.powerPathPosition);
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });

  const devices: BayDeviceGeometryV1[] = [];
  const baseY = busbarY + DEVICE_Y_FROM_BUSBAR + 2;
  const onPathDevices = sorted.filter((device) => device.powerPathPosition !== DevicePowerPathPositionV1.OFF_PATH);
  const offPathDevices = sorted.filter((device) => device.powerPathPosition === DevicePowerPathPositionV1.OFF_PATH);

  const pushGeometry = (
    device: DeviceV1,
    cx: number,
    cy: number,
    layoutSlot: BayDeviceGeometryV1['layoutSlot'],
  ) => {
    const size = deviceSize(device.deviceType);
    const position: PointV1 = { x: cx, y: cy };

    devices.push({
      deviceId: device.id,
      deviceType: device.deviceType,
      symbolId: mapDeviceTypeToSymbolId(device.deviceType),
      position,
      size,
      rotation: deviceRotation(device.deviceType),
      electricalRole: device.electricalRole,
      powerPathPosition: device.powerPathPosition,
      layoutSlot,
      isOnPowerPath: isDeviceOnPowerPath(device),
      connectionPoints: {
        top: { x: cx, y: cy - size.height / 2 },
        bottom: { x: cx, y: cy + size.height / 2 },
      },
    });
  };

  if (isCouplerFieldRole(fieldRole)) {
    const leftX = bayCenterX - OFF_PATH_X_OFFSET / 1.35;
    const rightX = bayCenterX + OFF_PATH_X_OFFSET / 1.35;
    const leftChainCount = onPathDevices.length >= 3 ? 2 : 1;
    const leftChain = onPathDevices.slice(0, leftChainCount);
    const rightChain = onPathDevices.slice(leftChainCount);

    leftChain.forEach((device, index) => {
      pushGeometry(device, leftX, baseY + index * DEVICE_VERTICAL_STEP, 'COUPLER_LEFT');
    });

    rightChain.forEach((device, index) => {
      pushGeometry(device, rightX, baseY + index * DEVICE_VERTICAL_STEP, 'COUPLER_RIGHT');
    });

    offPathDevices.forEach((device, index) => {
      pushGeometry(
        device,
        rightX + OFF_PATH_X_OFFSET * 0.85,
        baseY + index * DEVICE_VERTICAL_STEP,
        'SIDE_RIGHT',
      );
    });
  } else {
    onPathDevices.forEach((device, index) => {
      pushGeometry(
        device,
        bayCenterX,
        baseY + index * DEVICE_VERTICAL_STEP,
        isMeasurementFieldRole(fieldRole) ? 'MEASUREMENT_MAIN' : 'MAIN',
      );
    });

    const branchBaseY =
      baseY
      + Math.max(onPathDevices.length - 1, 0) * DEVICE_VERTICAL_STEP
      + Math.max(DEVICE_VERTICAL_STEP * 0.65, 18);

    offPathDevices.forEach((device, index) => {
      pushGeometry(
        device,
        bayCenterX + OFF_PATH_X_OFFSET,
        branchBaseY + index * DEVICE_VERTICAL_STEP,
        'SIDE_RIGHT',
      );
    });
  }

  // Sort result by deviceId for determinism.
  return [...devices].sort((a, b) => a.deviceId.localeCompare(b.deviceId));
}

/**
 * Build internal connections (vertical lines) between sequential power-path
 * devices within a single bay. Connections run from the bottom connection
 * point of device[i] to the top connection point of device[i+1], where
 * both devices are on the power path, ordered by powerPathPosition.
 */
function buildInternalConnections(
  fieldRole: FieldRoleV1,
  bayDevices: readonly BayDeviceGeometryV1[],
): readonly { readonly from: PointV1; readonly to: PointV1 }[] {
  const connections: { from: PointV1; to: PointV1 }[] = [];

  const chains = isCouplerFieldRole(fieldRole)
    ? [
        bayDevices
          .filter((device) => device.layoutSlot === 'COUPLER_LEFT')
          .sort((left, right) => left.position.y - right.position.y),
        bayDevices
          .filter((device) => device.layoutSlot === 'COUPLER_RIGHT')
          .sort((left, right) => left.position.y - right.position.y),
      ]
    : [
        bayDevices
          .filter((device) => device.layoutSlot === 'MAIN' || device.layoutSlot === 'MEASUREMENT_MAIN')
          .sort((left, right) => left.position.y - right.position.y),
      ];

  for (const chain of chains) {
    for (let index = 0; index < chain.length - 1; index += 1) {
      const from = chain[index].connectionPoints.bottom;
      const to = chain[index + 1].connectionPoints.top;
      if (to.y > from.y) {
        connections.push({ from, to });
      }
    }
  }

  return connections;
}

function buildAuxiliaryConnections(
  fieldRole: FieldRoleV1,
  bayCenterX: number,
  busbarY: number,
  cableExitPoint: PointV1,
  bayDevices: readonly BayDeviceGeometryV1[],
): readonly BayAuxiliaryConnectionV1[] {
  const connections: BayAuxiliaryConnectionV1[] = [];

  if (isCouplerFieldRole(fieldRole)) {
    const leftChain = bayDevices
      .filter((device) => device.layoutSlot === 'COUPLER_LEFT')
      .sort((left, right) => left.position.y - right.position.y);
    const rightChain = bayDevices
      .filter((device) => device.layoutSlot === 'COUPLER_RIGHT')
      .sort((left, right) => left.position.y - right.position.y);

    if (leftChain[0]) {
      connections.push({
        from: { x: leftChain[0].position.x, y: busbarY },
        to: leftChain[0].connectionPoints.top,
        kind: 'BUS_TAP',
      });
    }
    if (rightChain[0]) {
      connections.push({
        from: { x: rightChain[0].position.x, y: busbarY },
        to: rightChain[0].connectionPoints.top,
        kind: 'BUS_TAP',
      });
    }

    const leftBottom = leftChain[leftChain.length - 1]?.connectionPoints.bottom ?? null;
    const rightBottom = rightChain[rightChain.length - 1]?.connectionPoints.bottom ?? null;
    if (leftBottom && rightBottom) {
      const uBottomY = Math.max(leftBottom.y, rightBottom.y) + 18;
      connections.push(
        { from: leftBottom, to: { x: leftBottom.x, y: uBottomY }, kind: 'COUPLER_LINK' },
        { from: { x: leftBottom.x, y: uBottomY }, to: { x: rightBottom.x, y: uBottomY }, kind: 'COUPLER_LINK' },
        { from: { x: rightBottom.x, y: uBottomY }, to: rightBottom, kind: 'COUPLER_LINK' },
      );
    }

    return connections;
  }

  const mainChain = bayDevices
    .filter((device) => device.layoutSlot === 'MAIN' || device.layoutSlot === 'MEASUREMENT_MAIN')
    .sort((left, right) => left.position.y - right.position.y);
  const sideDevices = bayDevices
    .filter((device) => device.layoutSlot === 'SIDE_RIGHT' || device.layoutSlot === 'SIDE_LEFT')
    .sort((left, right) => left.position.y - right.position.y);

  const firstMain = mainChain[0];
  const lastMain = mainChain[mainChain.length - 1];

  if (firstMain) {
    connections.push({
      from: { x: firstMain.position.x, y: busbarY },
      to: firstMain.connectionPoints.top,
      kind: 'BUS_TAP',
    });
  }

  if (lastMain) {
    connections.push({
      from: lastMain.connectionPoints.bottom,
      to: cableExitPoint,
      kind: 'MAIN_EXIT',
    });
  }

  sideDevices.forEach((device) => {
    const branchY = device.connectionPoints.top.y - 8;
    const trunkX = lastMain?.position.x ?? bayCenterX;
    connections.push(
      {
        from: { x: trunkX, y: branchY },
        to: { x: device.position.x, y: branchY },
        kind: 'SIDE_BRANCH',
      },
      {
        from: { x: device.position.x, y: branchY },
        to: device.connectionPoints.top,
        kind: 'SIDE_BRANCH',
      },
    );
  });

  return connections;
}

/**
 * Compute trunk port positions from the station block's port declarations
 * and the bay's cable exit point.
 *
 * Port directions:
 * - trunkInPort → top center of the bay (aligned with busbar).
 * - trunkOutPort → bottom center of the bay (cable exit).
 * - branchPort → bottom center (same as cable exit for branch fields).
 *
 * Only LINE_IN / LINE_OUT / LINE_BRANCH fields carry trunk ports.
 */
function resolveBayPorts(
  field: FieldV1,
  blockPorts: StationBlockDetailV1['ports'],
  bayCenterX: number,
  busbarY: number,
  cableExitY: number,
): { portIn: PointV1 | null; portOut: PointV1 | null } {
  let portIn: PointV1 | null = null;
  let portOut: PointV1 | null = null;

  if (field.fieldRole === 'LINE_IN' && blockPorts.trunkInPort) {
    portIn = { x: bayCenterX, y: busbarY };
  }
  if (field.fieldRole === 'LINE_OUT' && blockPorts.trunkOutPort) {
    portOut = { x: bayCenterX, y: cableExitY };
  }
  if (field.fieldRole === 'LINE_BRANCH' && blockPorts.branchPort) {
    portOut = { x: bayCenterX, y: cableExitY };
  }
  if (field.fieldRole === 'GPZ_LINE_BAY' && blockPorts.trunkOutPort) {
    portOut = { x: bayCenterX, y: cableExitY };
  }

  return { portIn, portOut };
}

/**
 * Compute the full bay layout for a station block.
 *
 * Algorithm (deterministic, CANONICAL-grade):
 *
 * 1. Sort fields by role priority (LINE_IN, LINE_OUT, TRANSFORMER_SN_NN, ...).
 * 2. Compute bay width = blockBounds.width / max(fields.length, 1), min 60px.
 * 3. Busbar Y = blockBounds.y + BLOCK_MARGIN.
 * 4. For each field:
 *    a. Bay bounds = (blockBounds.x + i * bayWidth, blockBounds.y, bayWidth, bayHeight).
 *    b. bayCenterX = bayBounds.x + bayWidth / 2.
 *    c. Build devices vertically within bay.
 *    d. cableExitPoint = bottom of bay center.
 *    e. Resolve trunk ports.
 * 5. Busbar geometry spans all bays at busbarY.
 * 6. For LOCAL_SECTIONAL: compute coupler geometry between bus sections.
 * 7. Collect all internal connections.
 * 8. Sort bays by bayId, internalConnections by from.x then from.y.
 *
 * @param detail - StationBlockDetailV1 with full field/device/anchor data.
 * @param blockBounds - Bounding box of the station block in world coords.
 * @returns StationBayLayoutV1 — immutable, deterministic layout result.
 */
export function computeBayLayout(
  detail: StationBlockDetailV1,
  blockBounds: RectangleV1,
): StationBayLayoutV1 {
  const sortedFields = sortFieldsByRolePriority(detail.fields);
  const fieldCount = Math.max(sortedFields.length, 1);

  // Bay dimensions
  const rawBayWidth = blockBounds.width / fieldCount;
  const bayWidth = Math.max(rawBayWidth, MIN_BAY_WIDTH);

  const busbarY = blockBounds.y + BLOCK_MARGIN;
  const bayAreaHeight = blockBounds.height - BUSBAR_HEIGHT - BLOCK_MARGIN * 2;
  const cableExitY = blockBounds.y + blockBounds.height - BLOCK_MARGIN;

  // Build a map of deviceId → DeviceV1 for efficient lookup.
  const deviceById = new Map<string, DeviceV1>(detail.devices.map(d => [d.id, d]));

  // Build bays (unsorted; sort at end).
  const bays: BayGeometryV1[] = [];
  const allInternalConnections: { from: PointV1; to: PointV1 }[] = [];

  sortedFields.forEach((field, idx) => {
    const bayX = blockBounds.x + idx * bayWidth;
    const bayCenterX = bayX + bayWidth / 2;

    const bayBounds: RectangleV1 = {
      x: bayX,
      y: blockBounds.y,
      width: bayWidth,
      height: bayAreaHeight + BUSBAR_HEIGHT + BLOCK_MARGIN * 2,
    };

    // Collect devices belonging to this field.
    const fieldDevices: DeviceV1[] = field.deviceIds
      .map(id => deviceById.get(id))
      .filter((d): d is DeviceV1 => d !== undefined);

    const deviceGeometries = buildBayDevices(field.fieldRole, fieldDevices, bayCenterX, busbarY);

    const cableExitPoint: PointV1 = { x: bayCenterX, y: cableExitY };

    const { portIn, portOut } = resolveBayPorts(
      field,
      detail.ports,
      bayCenterX,
      busbarY,
      cableExitY,
    );

    // Internal connections for this bay.
    const bayConnections = buildInternalConnections(field.fieldRole, deviceGeometries);
    allInternalConnections.push(...bayConnections);
    bays.push({
      bayId: field.id,
      stationId: detail.blockId,
      fieldRole: field.fieldRole,
      bounds: bayBounds,
      busbarY,
      devices: deviceGeometries,
      cableExitPoint,
      portIn,
      portOut,
    });
  });

  // Sort bays by bayId for determinism.
  const sortedBays = [...bays].sort((a, b) => a.bayId.localeCompare(b.bayId));

  // --- Busbar geometry ---
  // The busbar spans from the leftmost to rightmost bay edge.
  const busbarX1 = blockBounds.x;
  const busbarX2 = blockBounds.x + sortedFields.length * bayWidth;

  // Build bus sections from detail.busSections (sorted by id).
  const sortedBusSections = [...detail.busSections].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  let busSections: { x1: number; x2: number; sectionId: string }[];
  if (sortedBusSections.length <= 1) {
    // Single bus section spanning all bays.
    busSections = [
      {
        x1: busbarX1,
        x2: busbarX2,
        sectionId: sortedBusSections[0]?.id ?? detail.blockId,
      },
    ];
  } else {
    // Multiple bus sections: distribute evenly across available width.
    const totalWidth = busbarX2 - busbarX1;
    const sectionWidth = totalWidth / sortedBusSections.length;
    busSections = sortedBusSections.map((sec, i) => ({
      x1: busbarX1 + i * sectionWidth,
      x2: busbarX1 + (i + 1) * sectionWidth,
      sectionId: sec.id,
    }));
  }

  const busbarGeometry: BusbarGeometryV1 = {
    y: busbarY,
    x1: busbarX1,
    x2: busbarX2,
    sections: busSections,
  };

  // --- Coupler geometry (LOCAL_SECTIONAL only) ---
  let couplerGeometry: CouplerGeometryV1 | null = null;

  if (
    detail.embeddingRole === 'LOCAL_SECTIONAL' &&
    detail.couplerFieldId !== null &&
    busSections.length >= 2
  ) {
    const couplerFieldId = detail.couplerFieldId;
    const sec1 = busSections[0];
    const sec2 = busSections[1];

    // Position coupler at the midpoint between the two sections.
    const couplerX = (sec1.x2 + sec2.x1) / 2;
    const couplerY = busbarY + DEVICE_Y_FROM_BUSBAR;

    couplerGeometry = {
      couplerFieldId,
      position: { x: couplerX, y: couplerY },
      size: { width: DEVICE_DEFAULT_WIDTH, height: DEVICE_DEFAULT_HEIGHT },
      busbar1Y: busbarY,
      busbar2Y: busbarY,
    };
  }

  // Sort internal connections by from.x then from.y for determinism.
  const sortedConnections = [...allInternalConnections].sort((a, b) => {
    if (a.from.x !== b.from.x) return a.from.x - b.from.x;
    return a.from.y - b.from.y;
  });
  const auxiliaryConnections = sortedFields
    .flatMap((field) => {
      const bay = bays.find((candidate) => candidate.bayId === field.id);
      if (!bay) {
        return [];
      }
      return buildAuxiliaryConnections(field.fieldRole, bay.bounds.x + bay.bounds.width / 2, busbarY, bay.cableExitPoint, bay.devices);
    })
    .sort((left, right) => {
      if (left.from.x !== right.from.x) return left.from.x - right.from.x;
      if (left.from.y !== right.from.y) return left.from.y - right.from.y;
      if (left.to.x !== right.to.x) return left.to.x - right.to.x;
      return left.to.y - right.to.y;
    });

  return {
    stationId: detail.blockId,
    embeddingRole: detail.embeddingRole,
    totalBounds: blockBounds,
    busbarGeometry,
    bays: sortedBays,
    couplerGeometry,
    internalConnections: sortedConnections,
    auxiliaryConnections,
  };
}
