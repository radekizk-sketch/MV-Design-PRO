/**
 * TOPOLOGICAL AUTO-LAYOUT ENGINE — Phase 2-4: Geometric Skeleton
 *
 * Faza 2: Global Orientation (top-down / left-right)
 * Faza 3: Geometric Skeleton (spine, tiers, levels)
 * Faza 4: Slot System (modules, sections, rhythm)
 *
 * ZASADY:
 * - Orientacja globalna stala dla calego projektu
 * - Spine (os glowna zasilania) wyznaczona z topologii
 * - Szyny = poziome struktury
 * - Odpływy = pionowe sloty z szyny
 * - Przewody lamane wylacznie pod 90 stopni
 * - Staly rytm (spacing) sekcji i slotow
 *
 * DETERMINIZM: Ten sam model -> identyczny szkielet
 */

import type { AnySldSymbol, Position, BranchSymbol } from '../../types';
import type {
  RoleAssignment,
  VoltageLevel,
  CanonicalLayer,
  GlobalOrientation,
  OrientationConfig,
  SkeletonTier,
  FeederSlot,
  BusbarSection,
  BusbarLayout,
  GeometricSkeleton,
  LayoutGeometryConfig,
} from './types';
import { CANONICAL_GEOMETRY } from '../../../sld/sldCanonicalStyle';

// =============================================================================
// DEFAULT GEOMETRY CONFIG
// =============================================================================

export const DEFAULT_GEOMETRY_CONFIG: LayoutGeometryConfig = {
  gridSize: CANONICAL_GEOMETRY.layout.gridSize,
  padding: CANONICAL_GEOMETRY.layout.padding,
  tierSpacing: CANONICAL_GEOMETRY.canonicalLayerSpacing,
  slotWidth: CANONICAL_GEOMETRY.bay.spacing,
  slotGap: CANONICAL_GEOMETRY.bay.minSpacing - CANONICAL_GEOMETRY.bay.spacing,
  sectionGap: CANONICAL_GEOMETRY.busbarSection.sectionGap,
  minBusbarWidth: CANONICAL_GEOMETRY.busbar.minWidth,
  sourceHeight: CANONICAL_GEOMETRY.source.symbolHeight,
  sourceOffset: CANONICAL_GEOMETRY.source.offsetAboveBusbar,
  transformerHeight: CANONICAL_GEOMETRY.transformer.symbolHeight,
  transformerOffsetFromWN: CANONICAL_GEOMETRY.transformer.offsetFromWN,
  transformerOffsetToSN: CANONICAL_GEOMETRY.transformer.offsetToSN,
  busbarHeight: CANONICAL_GEOMETRY.busbar.height,
  feederElementSpacing: CANONICAL_GEOMETRY.bay.elementSpacing,
  switchWidth: 40,
  switchHeight: 50,
  branchWidth: 60,
  branchHeight: 40,
  loadWidth: 30,
  loadHeight: 30,
  symbolClearance: 24,
};

// =============================================================================
// GLOBAL ORIENTATION
// =============================================================================

/**
 * Resolve global orientation config.
 * DETERMINISTIC: Pure function.
 */
export function resolveOrientation(
  orientation: GlobalOrientation = 'top-down'
): OrientationConfig {
  // KANON SN/GPZ: szyna SN jest pozioma, a pola/odejścia schodzą pionowo w dół.
  // Dlatego nawet żądanie "left-right" nie może odwrócić osi szyny GPZ.
  // Zachowujemy API wejściowe dla kompatybilności, ale geometria jest zawsze top-down.
  const canonicalOrientation: GlobalOrientation = orientation === 'left-right' ? 'top-down' : orientation;
  return {
    orientation: canonicalOrientation,
    mainAxis: 'vertical',
    busbarAxis: 'horizontal',
    feederDirection: 'down',
  };
}

// =============================================================================
// SNAP TO GRID
// =============================================================================

function snap(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

// =============================================================================
// CANONICAL LAYER Y-OFFSETS
// =============================================================================

const LAYER_ORDER: CanonicalLayer[] = [
  'L0_SOURCE',
  'L1_WN_BUSBAR',
  'L2_TRANSFORMER',
  'L3_SN_BUSBAR',
  'L4_SN_FEEDER_SWITCH',
  'L5_SN_FEEDER_BRANCH',
  'L6_SN_CABLE',
  'L7_STATION_SWITCHGEAR',
  'L8_STATION_BREAKER',
  'L9_STATION_TRANSFORMER',
  'L10_NN_BUSBAR',
  'L11_NN_SWITCHGEAR',
  'L12_INVERTER_LOAD',
];

/**
 * Get canonical Y offset for a layer.
 */
function getLayerYOffset(layer: CanonicalLayer, config: LayoutGeometryConfig): number {
  const layerConfig = CANONICAL_GEOMETRY.canonicalLayers;
  const key = layer.replace('L2_TRANSFORMER', 'L2_WN_SN_TRANSFORMER')
    .replace('L4_SN_FEEDER_SWITCH', 'L4_SN_BAY')
    .replace('L5_SN_FEEDER_BRANCH', 'L5_SN_BRANCH_SWITCH')
    .replace('L7_STATION_SWITCHGEAR', 'L7_STATION_SN_SWITCHGEAR')
    .replace('L8_STATION_BREAKER', 'L8_STATION_SN_BREAKER')
    .replace('L9_STATION_TRANSFORMER', 'L9_SN_NN_TRANSFORMER');

  const entry = (layerConfig as any)[key];
  if (entry && typeof entry.yOffset === 'number') {
    return config.padding + entry.yOffset;
  }

  // Fallback: calculate from index
  const idx = LAYER_ORDER.indexOf(layer);
  return config.padding + idx * config.tierSpacing;
}

// =============================================================================
// BUSBAR WIDTH CALCULATION
// =============================================================================

/**
 * Calculate busbar width based on number of feeder slots.
 * DETERMINISTIC.
 */
function calculateBusbarWidth(
  slotCount: number,
  config: LayoutGeometryConfig
): number {
  const minWidth = config.minBusbarWidth;
  const sidePadding = CANONICAL_GEOMETRY.busbar.sidePadding;
  const bayWidth = CANONICAL_GEOMETRY.busbar.bayWidthIncrement;
  return Math.max(minWidth, sidePadding * 2 + slotCount * bayWidth);
}

// =============================================================================
// SECTION BUILDER
// =============================================================================

interface BusbarContext {
  busbarId: string;
  elementId: string;
  voltageLevel: VoltageLevel;
  feederSymbolIds: string[][]; // Each feeder chain: array of symbol IDs in order
  sectionCount: number;
  pairedBusbarId: string | null;
}

/**
 * Build sections for a busbar.
 */
function buildBusbarSections(
  ctx: BusbarContext,
  centerX: number,
  config: LayoutGeometryConfig
): { sections: BusbarSection[]; totalWidth: number } {
  const { feederSymbolIds, sectionCount } = ctx;
  const totalFeeders = feederSymbolIds.length;

  if (totalFeeders === 0) {
    const width = config.minBusbarWidth;
    return {
      sections: [
        {
          sectionId: `${ctx.busbarId}_sec_0`,
          busbarId: ctx.busbarId,
          sectionIndex: 0,
          slots: [],
          startPosition: centerX - width / 2,
          endPosition: centerX + width / 2,
          width,
        },
      ],
      totalWidth: width,
    };
  }

  if (sectionCount <= 1) {
    // Single section
    const width = calculateBusbarWidth(totalFeeders, config);
    const startX = centerX - width / 2;
    const slots = buildSlots(
      `${ctx.busbarId}_sec_0`,
      feederSymbolIds,
      startX,
      width,
      config
    );
    return {
      sections: [
        {
          sectionId: `${ctx.busbarId}_sec_0`,
          busbarId: ctx.busbarId,
          sectionIndex: 0,
          slots,
          startPosition: startX,
          endPosition: startX + width,
          width,
        },
      ],
      totalWidth: width,
    };
  }

  // Multiple sections: split feeders evenly
  const feedersPerSection = Math.ceil(totalFeeders / sectionCount);
  const sections: BusbarSection[] = [];
  let sectionStartIndex = 0;

  for (let si = 0; si < sectionCount; si++) {
    const sectionFeeders = feederSymbolIds.slice(
      sectionStartIndex,
      sectionStartIndex + feedersPerSection
    );
    sectionStartIndex += feedersPerSection;

    const sectionWidth = calculateBusbarWidth(sectionFeeders.length, config);
    sections.push({
      sectionId: `${ctx.busbarId}_sec_${si}`,
      busbarId: ctx.busbarId,
      sectionIndex: si,
      slots: [], // Will be filled after centering
      startPosition: 0, // Will be updated
      endPosition: 0, // Will be updated
      width: sectionWidth,
    });
  }

  // Calculate total width including gaps
  const totalWidthNoGaps = sections.reduce((sum, s) => sum + s.width, 0);
  const totalGaps = (sectionCount - 1) * config.sectionGap;
  const totalWidth = totalWidthNoGaps + totalGaps;

  // Position sections centered on centerX
  let currentX = centerX - totalWidth / 2;
  sectionStartIndex = 0;
  const finalSections: BusbarSection[] = [];

  for (let si = 0; si < sectionCount; si++) {
    const section = sections[si];
    const sectionFeeders = feederSymbolIds.slice(
      sectionStartIndex,
      sectionStartIndex + feedersPerSection
    );
    sectionStartIndex += feedersPerSection;

    const startPos = snap(currentX, config.gridSize);
    const endPos = snap(currentX + section.width, config.gridSize);
    const slots = buildSlots(
      section.sectionId,
      sectionFeeders,
      startPos,
      section.width,
      config
    );

    finalSections.push({
      ...section,
      startPosition: startPos,
      endPosition: endPos,
      slots,
    });

    currentX += section.width + config.sectionGap;
  }

  return { sections: finalSections, totalWidth };
}

/**
 * Build feeder slots within a section.
 */
function buildSlots(
  sectionId: string,
  feederChains: string[][],
  sectionStartX: number,
  sectionWidth: number,
  config: LayoutGeometryConfig
): FeederSlot[] {
  if (feederChains.length === 0) return [];

  const sidePadding = CANONICAL_GEOMETRY.busbar.sidePadding;
  const usableWidth = sectionWidth - sidePadding * 2;
  const slotSpacing =
    feederChains.length > 1
      ? Math.min(config.slotWidth, usableWidth / (feederChains.length - 1))
      : 0;

  const totalSlotsWidth =
    feederChains.length > 1 ? (feederChains.length - 1) * slotSpacing : 0;
  const startOffset = (usableWidth - totalSlotsWidth) / 2;

  return feederChains.map((chain, i) => {
    const busbarAxisPos = snap(
      sectionStartX + sidePadding + startOffset + i * slotSpacing,
      config.gridSize
    );
    return {
      slotId: `${sectionId}_slot_${i}`,
      sectionId,
      slotIndex: i,
      busbarAxisPosition: busbarAxisPos,
      symbolIds: chain,
    };
  });
}

// =============================================================================
// MAIN SKELETON BUILDER
// =============================================================================

/**
 * Build complete geometric skeleton from role assignments.
 *
 * DETERMINISTIC: Same assignments -> same skeleton.
 *
 * @param symbols - SLD symbols (sorted internally)
 * @param assignments - Role assignments from Phase 1
 * @param feederChainsByBusbar - Feeder chains per busbar
 * @param stationSymbolIds - Station symbol IDs
 * @param config - Geometry config
 * @param orientation - Global orientation
 */
export function buildGeometricSkeleton(
  symbols: readonly AnySldSymbol[],
  assignments: Map<string, RoleAssignment>,
  feederChainsByBusbar: Map<string, Array<{ allSymbolIds: string[] }>>,
  stationSymbolIds: Set<string>,
  config: LayoutGeometryConfig = DEFAULT_GEOMETRY_CONFIG,
  _orientation: GlobalOrientation = 'top-down'
): GeometricSkeleton {
  const sorted = [...symbols].sort((a, b) => a.id.localeCompare(b.id));
  const positions = new Map<string, Position>();

  // Group symbols by canonical layer
  const symbolsByLayer = new Map<CanonicalLayer, AnySldSymbol[]>();
  for (const s of sorted) {
    const role = assignments.get(s.id);
    if (!role) continue;
    const layer = role.canonicalLayer;
    if (!symbolsByLayer.has(layer)) symbolsByLayer.set(layer, []);
    symbolsByLayer.get(layer)!.push(s);
  }

  // Find busbars and their voltage levels
  const busbars = sorted.filter((s) => s.elementType === 'Bus');
  const wnBusbars = busbars.filter(
    (b) => assignments.get(b.id)?.voltageLevel === 'WN'
  );
  const snBusbars = busbars.filter(
    (b) =>
      assignments.get(b.id)?.voltageLevel === 'SN' &&
      assignments.get(b.id)?.role === 'BUSBAR'
  );
  const nnBusbars = busbars.filter(
    (b) => assignments.get(b.id)?.voltageLevel === 'nN'
  );

  // Detect section count per busbar
  const busbarSectionCounts = new Map<string, number>();
  for (const bus of busbars) {
    const role = assignments.get(bus.id);
    if (role?.role === 'SECTION') {
      // This bus is part of a sectioned pair
      const parentId = role.parentBusbarId;
      if (parentId) {
        busbarSectionCounts.set(parentId, (busbarSectionCounts.get(parentId) ?? 1) + 1);
      }
    } else {
      if (!busbarSectionCounts.has(bus.id)) busbarSectionCounts.set(bus.id, 1);
    }
  }

  // Calculate max bay count for spine position
  let maxBayCount = 1;
  for (const [busId] of feederChainsByBusbar) {
    const chains = feederChainsByBusbar.get(busId) ?? [];
    maxBayCount = Math.max(maxBayCount, chains.length);
  }

  const maxBusWidth = calculateBusbarWidth(maxBayCount, config);
  const spineX = snap(config.padding + maxBusWidth / 2, config.gridSize);

  // Build tiers
  const tiers: SkeletonTier[] = [];
  const busbarLayouts: BusbarLayout[] = [];

  // Collect all slots for flat list
  const allSlots: FeederSlot[] = [];

  // Transformers (need them for positioning)
  const transformers = sorted.filter((s) => s.elementType === 'TransformerBranch');
  const sources = sorted.filter((s) => s.elementType === 'Source');

  // ==========================================
  // TIER: L0_SOURCE
  // ==========================================
  if (sources.length > 0) {
    const y = snap(getLayerYOffset('L0_SOURCE', config), config.gridSize);
    const sourceSpacing = config.slotWidth;
    const totalWidth = (sources.length - 1) * sourceSpacing;
    const startX = spineX - totalWidth / 2;

    for (let i = 0; i < sources.length; i++) {
      const x = snap(startX + i * sourceSpacing, config.gridSize);
      positions.set(sources[i].id, { x, y });
    }

    tiers.push({
      tierId: 'tier_L0',
      layer: 'L0_SOURCE',
      axialPosition: y,
      symbolIds: sources.map((s) => s.id),
    });
  }

  // ==========================================
  // TIER: L1_WN_BUSBAR
  // ==========================================
  if (wnBusbars.length > 0) {
    const y = snap(getLayerYOffset('L1_WN_BUSBAR', config), config.gridSize);
    for (const bus of wnBusbars) {
      positions.set(bus.id, { x: spineX, y });

      const chains = feederChainsByBusbar.get(bus.id) ?? [];
      const feederSymbolIds = chains.map((c) => c.allSymbolIds);
      const ctx: BusbarContext = {
        busbarId: bus.id,
        elementId: bus.elementId,
        voltageLevel: 'WN',
        feederSymbolIds,
        sectionCount: busbarSectionCounts.get(bus.id) ?? 1,
        pairedBusbarId: null,
      };
      const { sections, totalWidth } = buildBusbarSections(ctx, spineX, config);
      busbarLayouts.push({
        busbarId: bus.id,
        elementId: bus.elementId,
        voltageLevel: 'WN',
        sections,
        totalWidth,
        centerPosition: spineX,
        axialPosition: y,
      });
      for (const sec of sections) allSlots.push(...sec.slots);

      // Busbar width stored in busbarLayout.totalWidth (IMMUTABLE — no symbol mutation)
      // BUG-01 FIX: Width is part of skeleton output, NOT mutated on input symbol
    }
    tiers.push({
      tierId: 'tier_L1',
      layer: 'L1_WN_BUSBAR',
      axialPosition: snap(getLayerYOffset('L1_WN_BUSBAR', config), config.gridSize),
      symbolIds: wnBusbars.map((s) => s.id),
    });
  }

  // ==========================================
  // TIER: L2_TRANSFORMER
  // ==========================================
  if (transformers.length > 0) {
    const y = snap(getLayerYOffset('L2_TRANSFORMER', config), config.gridSize);
    const trafoSpacing = CANONICAL_GEOMETRY.transformer.parallelSpacing;
    const totalWidth = (transformers.length - 1) * trafoSpacing;
    const startX = spineX - totalWidth / 2;

    for (let i = 0; i < transformers.length; i++) {
      const x = snap(startX + i * trafoSpacing, config.gridSize);
      positions.set(transformers[i].id, { x, y });
    }

    tiers.push({
      tierId: 'tier_L2',
      layer: 'L2_TRANSFORMER',
      axialPosition: y,
      symbolIds: transformers.map((s) => s.id),
    });
  }

  // ==========================================
  // TIER: L3_SN_BUSBAR + FEEDERS (L4, L5, L6)
  // ==========================================
  const mainBusbars = snBusbars.length > 0 ? snBusbars : busbars.filter(
    (b) => assignments.get(b.id)?.role === 'BUSBAR'
  );

  if (mainBusbars.length > 0) {
    const y = snap(getLayerYOffset('L3_SN_BUSBAR', config), config.gridSize);

    for (const bus of mainBusbars) {
      positions.set(bus.id, { x: spineX, y });

      const chains = feederChainsByBusbar.get(bus.id) ?? [];
      const feederSymbolIds = chains.map((c) => c.allSymbolIds);
      const ctx: BusbarContext = {
        busbarId: bus.id,
        elementId: bus.elementId,
        voltageLevel: assignments.get(bus.id)?.voltageLevel ?? 'SN',
        feederSymbolIds,
        sectionCount: busbarSectionCounts.get(bus.id) ?? 1,
        pairedBusbarId: null,
      };
      const { sections, totalWidth } = buildBusbarSections(ctx, spineX, config);

      busbarLayouts.push({
        busbarId: bus.id,
        elementId: bus.elementId,
        voltageLevel: ctx.voltageLevel,
        sections,
        totalWidth,
        centerPosition: spineX,
        axialPosition: y,
      });

      // Busbar width stored in busbarLayout.totalWidth (IMMUTABLE — no symbol mutation)
      // BUG-01 FIX: Width is part of skeleton output, NOT mutated on input symbol

      // Position feeder elements in slots
      for (const section of sections) {
        for (const slot of section.slots) {
          allSlots.push(slot);
          const slotX = slot.busbarAxisPosition;
          let currentY = y + CANONICAL_GEOMETRY.bay.verticalOffset;

          for (const symbolId of slot.symbolIds) {
            const symbolType = sorted.find((s) => s.id === symbolId)?.elementType;
            const snappedY = snap(currentY, config.gridSize);
            positions.set(symbolId, { x: slotX, y: snappedY });

            if (symbolType === 'Switch') {
              currentY += config.feederElementSpacing;
            } else if (symbolType === 'LineBranch') {
              currentY += config.feederElementSpacing;
            } else if (symbolType === 'Load') {
              currentY += config.loadHeight + 20;
            } else {
              currentY += config.feederElementSpacing;
            }
          }
        }
      }
    }

    tiers.push({
      tierId: 'tier_L3',
      layer: 'L3_SN_BUSBAR',
      axialPosition: y,
      symbolIds: mainBusbars.map((s) => s.id),
    });
  }

  // ==========================================
  // STATION STACKS (L7-L12)
  // ==========================================
  // Station elements that aren't already positioned get placed in station stack
  const stationTrafos = sorted.filter(
    (s) =>
      s.elementType === 'TransformerBranch' &&
      stationSymbolIds.has(s.id) &&
      !positions.has(s.id)
  );

  if (stationTrafos.length > 0) {
    const baseY = snap(getLayerYOffset('L9_STATION_TRANSFORMER', config), config.gridSize);
    const stackSpacing = CANONICAL_GEOMETRY.stationStack.parallelStackSpacing;
    const totalWidth = (stationTrafos.length - 1) * stackSpacing;
    const startX = spineX - totalWidth / 2;

    stationTrafos.forEach((trafo, i) => {
      const stackX = snap(startX + i * stackSpacing, config.gridSize);
      if (!positions.has(trafo.id)) {
        positions.set(trafo.id, { x: stackX, y: baseY });
      }

      // Position nn busbar below
      const branch = trafo as BranchSymbol;
      const nnBusId = sorted.find(
        (s) =>
          s.elementType === 'Bus' &&
          (s.elementId === branch.fromNodeId || s.elementId === branch.toNodeId) &&
          assignments.get(s.id)?.voltageLevel === 'nN'
      );
      if (nnBusId && !positions.has(nnBusId.id)) {
        positions.set(nnBusId.id, {
          x: stackX,
          y: snap(baseY + CANONICAL_GEOMETRY.stationStack.transformerToNnBusbar, config.gridSize),
        });
      }
    });
  }

  // ==========================================
  // REMAINING nN BUSBARS
  // ==========================================
  for (const bus of nnBusbars) {
    if (!positions.has(bus.id)) {
      const y = snap(getLayerYOffset('L10_NN_BUSBAR', config), config.gridSize);
      positions.set(bus.id, { x: spineX, y });
    }
  }

  // ==========================================
  // UNPOSITIONED SYMBOLS (fallback / quarantine)
  // ==========================================
  const unpositioned = sorted.filter((s) => !positions.has(s.id));
  if (unpositioned.length > 0) {
    // Try to position relative to connected elements
    for (const symbol of unpositioned) {
      const pos = findConnectedPosition(symbol, sorted, positions, assignments, config);
      if (pos) {
        positions.set(symbol.id, pos);
      }
    }

    // Quarantine remaining
    const stillUnpositioned = sorted.filter((s) => !positions.has(s.id));
    if (stillUnpositioned.length > 0) {
      let maxY = config.padding;
      positions.forEach((p) => {
        maxY = Math.max(maxY, p.y);
      });
      const quarantineY = snap(
        maxY + CANONICAL_GEOMETRY.quarantineZone.yOffsetFromLayout,
        config.gridSize
      );

      stillUnpositioned.forEach((s, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        positions.set(s.id, {
          x: snap(spineX + (col - 1.5) * config.slotWidth, config.gridSize),
          y: snap(quarantineY + row * config.tierSpacing, config.gridSize),
        });
      });
    }
  }

  return {
    spinePosition: spineX,
    tiers,
    busbars: busbarLayouts,
    allSlots,
    positions,
  };
}

// =============================================================================
// CONNECTED POSITION FINDER
// =============================================================================

function findConnectedPosition(
  symbol: AnySldSymbol,
  allSymbols: AnySldSymbol[],
  positions: Map<string, Position>,
  _assignments: Map<string, RoleAssignment>,
  config: LayoutGeometryConfig
): Position | null {
  const { gridSize } = config;

  // Branch: position between from and to nodes
  if (symbol.elementType === 'LineBranch' || symbol.elementType === 'TransformerBranch') {
    const b = symbol as BranchSymbol;
    const fromSym = allSymbols.find((s) => s.elementId === b.fromNodeId);
    const toSym = allSymbols.find((s) => s.elementId === b.toNodeId);
    const fromPos = fromSym ? positions.get(fromSym.id) : undefined;
    const toPos = toSym ? positions.get(toSym.id) : undefined;

    if (fromPos && toPos) {
      return {
        x: snap((fromPos.x + toPos.x) / 2, gridSize),
        y: snap((fromPos.y + toPos.y) / 2, gridSize),
      };
    }
    if (fromPos) {
      return { x: fromPos.x, y: snap(fromPos.y + config.feederElementSpacing, gridSize) };
    }
    if (toPos) {
      return { x: toPos.x, y: snap(toPos.y - config.feederElementSpacing, gridSize) };
    }
  }

  // Switch: position between connected nodes
  if (symbol.elementType === 'Switch') {
    const sw = symbol as any;
    const fromSym = allSymbols.find((s) => s.elementId === sw.fromNodeId);
    const toSym = allSymbols.find((s) => s.elementId === sw.toNodeId);
    const fromPos = fromSym ? positions.get(fromSym.id) : undefined;
    const toPos = toSym ? positions.get(toSym.id) : undefined;

    if (fromPos && toPos) {
      return {
        x: snap((fromPos.x + toPos.x) / 2, gridSize),
        y: snap((fromPos.y + toPos.y) / 2, gridSize),
      };
    }
    if (fromPos) {
      return { x: fromPos.x, y: snap(fromPos.y + config.feederElementSpacing, gridSize) };
    }
    if (toPos) {
      return { x: toPos.x, y: snap(toPos.y - config.feederElementSpacing, gridSize) };
    }
  }

  // Source/Load: position relative to connected bus
  if (symbol.elementType === 'Source' || symbol.elementType === 'Load') {
    const connId = (symbol as any).connectedToNodeId;
    if (connId) {
      const busSym = allSymbols.find((s) => s.elementId === connId);
      const busPos = busSym ? positions.get(busSym.id) : undefined;
      if (busPos) {
        const offset =
          symbol.elementType === 'Source'
            ? -config.sourceOffset
            : config.feederElementSpacing;
        return { x: busPos.x, y: snap(busPos.y + offset, gridSize) };
      }
    }
  }

  return null;
}
