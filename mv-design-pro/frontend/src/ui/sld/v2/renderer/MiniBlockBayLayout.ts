/**
 * MiniBlockBayLayout — K30-31 bay-column architecture layout engine.
 *
 * Replaces ad-hoc per-symbol Y positioning w MiniBlockRmuRenderer
 * (floating layout) z proper bay-column SLD model wzorowanym na
 * GpzSwitchgearLayout. Per IEC 60617:
 *   - SN busbar = horizontal line connecting tops of all bay columns
 *   - Each bay = vertical column z stacked apparatus (DS → CB → ES)
 *   - TR bay = dedicated column z transformer symbol + vertical droplines
 *   - LV bus = horizontal line below TR
 *   - LV feeder columns = N evenly-spaced columns below LV bus z CB each
 *
 * User K30-29 feedback (1/10): "układ klocków a nie schemat elektryczny" —
 * eliminated via explicit electrical connections per layout calculation.
 */

import { FIELD_ROLE, type FieldRole } from '../domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from './MiniBlockRmuRenderer';

export type ApparatusKind = 'DS' | 'CB' | 'ES' | 'CT' | 'VT' | 'FUSE' | 'TR' | 'SA' | 'SD';

export interface SnBayColumn {
  readonly bay: MiniBlockBayDescriptor;
  readonly x: number;
  readonly apparatusStack: readonly ApparatusKind[];
  readonly isTransformerBay: boolean;
}

export interface LvBayColumn {
  readonly index: number;
  readonly x: number;
  readonly cbCatalogRef?: string;
  readonly loadKw?: number;
}

export interface MiniBlockLayout {
  readonly variant: 'overview' | 'compact' | 'detail';
  readonly snColumns: readonly SnBayColumn[];
  readonly trColumn: SnBayColumn | null;
  readonly lvColumns: readonly LvBayColumn[];
  readonly busY: number;
  readonly lvBusY: number;
  readonly trCenterY: number | null;
  readonly totalWidth: number;
  readonly totalHeight: number;
  readonly busLeft: number;
  readonly busRight: number;
  readonly margin: number;
}

// =============================================================================
// Apparatus stack per role — IEC 60617 mapping
// =============================================================================

/**
 * Returns canonical apparatus stack dla danego bay role (per IEC 60617).
 * Order = top→bottom w bay column (closest to bus → outgoing).
 */
export function apparatusStackForRole(role: FieldRole): readonly ApparatusKind[] {
  switch (role) {
    case FIELD_ROLE.LINE_IN:
    case FIELD_ROLE.LINE_OUT:
    case FIELD_ROLE.LINE_BRANCH:
    case FIELD_ROLE.RMU_LINE:
    case FIELD_ROLE.GPZ_LINE_BAY:
      return ['DS', 'CB', 'ES'];
    case FIELD_ROLE.TRANSFORMER:
    case FIELD_ROLE.RMU_TRANSFORMER:
      // TR bay: DS + CB above; TransformerSymbol rendered separately below
      // via dedicated trColumn structure in MiniBlockLayout.
      return ['DS', 'CB'];
    case FIELD_ROLE.MEASUREMENT:
      // K30-120 audyt fix: per BAY_DEVICE_ORDER_POLICY[MEASUREMENT]
      // (bayDeviceOrder.ts) pole pomiarowe ma DS → FUSE → VT → ES.
      // CT renderowane jako optional, ale ES mandatory (safety BHP).
      return ['DS', 'VT', 'CT', 'ES'];
    case FIELD_ROLE.COUPLER:
      // Bus coupler — DS + CB + DS (no ES between sections).
      return ['DS', 'CB', 'DS'];
    default:
      return ['DS', 'CB'];
  }
}

// =============================================================================
// Layout dimensions per variant
// =============================================================================

interface VariantDims {
  readonly width: number;
  readonly height: number;
  readonly busYOffset: number;          // busY relative to mini-block center
  readonly apparatusHeight: number;     // single apparatus symbol size
  readonly apparatusGap: number;        // gap between apparatus
  readonly trGap: number;               // gap from last DS/CB do TR top
  readonly trRadius: number;            // TR circle radius
  readonly trToLvGap: number;           // gap from TR bottom do LV bus
  readonly lvFeederLength: number;      // total LV column height (CB + dropline)
  readonly margin: number;              // L/R margins
}

function variantDims(
  variant: 'overview' | 'compact' | 'detail',
  showPvCircuit: boolean,
): VariantDims {
  if (variant === 'overview') {
    return {
      width: 118,
      height: 72,
      busYOffset: 4,
      apparatusHeight: 9,
      apparatusGap: 3,
      trGap: 4,
      trRadius: 6,
      trToLvGap: 4,
      lvFeederLength: 18,
      margin: 14,
    };
  }
  if (variant === 'compact') {
    return {
      width: 190,
      height: 136,
      busYOffset: 4,
      apparatusHeight: 13,
      apparatusGap: 4,
      trGap: 6,
      trRadius: 8,
      trToLvGap: 6,
      lvFeederLength: 24,
      margin: 18,
    };
  }
  // detail (with optional PV expansion handled w outer wrap)
  return {
    width: showPvCircuit ? 340 : 220,
    height: showPvCircuit ? 280 : 164,
    busYOffset: 8,
    apparatusHeight: 16,
    apparatusGap: 6,
    trGap: 8,
    trRadius: 10,
    trToLvGap: 8,
    lvFeederLength: 32,
    margin: 24,
  };
}

// =============================================================================
// Layout computation
// =============================================================================

export function computeMiniBlockLayout(
  variant: 'overview' | 'compact' | 'detail',
  snBays: readonly MiniBlockBayDescriptor[],
  hasTransformer: boolean,
  nnFeedersCount: number,
  showPvCircuit: boolean,
): MiniBlockLayout {
  const dims = variantDims(variant, showPvCircuit);
  const halfW = dims.width / 2;
  const halfH = dims.height / 2;
  // busY is computed from top of mini-block + margin
  const busY = -halfH + dims.busYOffset + (showPvCircuit ? -12 : 0);

  // ---------- SN bay columns ----------
  // Filter visible bays per variant (overview limits to 4)
  const visibleBays = variant === 'overview' ? snBays.slice(0, 4) : snBays;
  const busLeft = -halfW + dims.margin;
  const busRight = halfW - dims.margin;
  const busSpan = busRight - busLeft;
  const totalSnCount = visibleBays.length;

  const snColumns: SnBayColumn[] = visibleBays.map((bay, idx) => {
    const x =
      totalSnCount === 1
        ? 0
        : busLeft + (busSpan * idx) / (totalSnCount - 1);
    const isTransformerBay =
      bay.fieldRole === FIELD_ROLE.TRANSFORMER ||
      bay.fieldRole === FIELD_ROLE.RMU_TRANSFORMER;
    return {
      bay,
      x,
      apparatusStack: apparatusStackForRole(bay.fieldRole),
      isTransformerBay,
    };
  });

  // ---------- TR bay column (dedicated, if hasTransformer + no TR bay in snBays) ----------
  const explicitTrBay = snColumns.find((c) => c.isTransformerBay) ?? null;
  let trColumn: SnBayColumn | null = explicitTrBay;
  let trCenterY: number | null = null;

  // ---------- Stack height (max across all bays) ----------
  const maxStackLen = Math.max(
    ...snColumns.map((c) => c.apparatusStack.length),
    1,
  );
  const stackTotalHeight =
    maxStackLen * dims.apparatusHeight + (maxStackLen - 1) * dims.apparatusGap;
  const stackBottomY = busY + 4 + stackTotalHeight;

  // ---------- TR symbol position (below stack of TR bay) ----------
  // TR symbol cy = stackBottomY + trGap + trRadius
  // TR connects to LV bus below.
  let lvBusY = stackBottomY + dims.trGap + dims.trRadius * 2 + dims.trToLvGap;
  if (hasTransformer && (trColumn || snColumns.length > 0)) {
    trCenterY = stackBottomY + dims.trGap + dims.trRadius;
    // Synthesize trColumn jeśli brak explicit TR bay (assumed last column)
    if (!trColumn && snColumns.length > 0) {
      trColumn = snColumns[snColumns.length - 1];
    }
  } else {
    lvBusY = stackBottomY + dims.trGap; // bez TR, LV directly below
  }

  // ---------- LV bay columns ----------
  const lvColumns: LvBayColumn[] = [];
  if (nnFeedersCount > 0) {
    const lvLeft = busLeft + busSpan * 0.18;
    const lvRight = busRight - busSpan * 0.18;
    const lvSpan = lvRight - lvLeft;
    for (let i = 0; i < nnFeedersCount; i++) {
      const x =
        nnFeedersCount === 1
          ? 0
          : lvLeft + (lvSpan * i) / (nnFeedersCount - 1);
      lvColumns.push({ index: i, x });
    }
  }

  return {
    variant,
    snColumns,
    trColumn,
    lvColumns,
    busY,
    lvBusY,
    trCenterY,
    totalWidth: dims.width,
    totalHeight: dims.height,
    busLeft,
    busRight,
    margin: dims.margin,
  };
}

// =============================================================================
// Variant dim accessors (re-exported dla bay column components)
// =============================================================================

export function getVariantApparatusHeight(
  variant: 'overview' | 'compact' | 'detail',
): number {
  return variantDims(variant, false).apparatusHeight;
}

export function getVariantApparatusGap(
  variant: 'overview' | 'compact' | 'detail',
): number {
  return variantDims(variant, false).apparatusGap;
}

export function getVariantTrRadius(
  variant: 'overview' | 'compact' | 'detail',
): number {
  return variantDims(variant, false).trRadius;
}
