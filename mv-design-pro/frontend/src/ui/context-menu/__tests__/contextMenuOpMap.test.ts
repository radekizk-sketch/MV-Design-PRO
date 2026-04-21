/**
 * Context Menu Operation Map — completeness guard.
 *
 * Verifies that ALL action IDs from ALL context menu builders have a mapping
 * in CONTEXT_MENU_OP_MAP, NAVIGATION_ACTIONS, or TOGGLE_ACTIONS.
 *
 * INVARIANT: Zero empty clicks — every action ID maps to an operation.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSourceSNContextMenu,
  buildBusSNContextMenu,
  buildStationContextMenu,
  buildBaySNContextMenu,
  buildSwitchSNContextMenu,
  buildTransformerContextMenu,
  buildBusNNContextMenu,
  buildFeederNNContextMenu,
  buildSourceFieldNNContextMenu,
  buildPVInverterContextMenu,
  buildBESSInverterContextMenu,
  buildGensetContextMenu,
  buildUPSContextMenu,
  buildLoadNNContextMenu,
  buildEnergyMeterContextMenu,
  buildSwitchNNContextMenu,
  buildSegmentSNContextMenu,
  buildRelaySNContextMenu,
  buildMeasurementSNContextMenu,
  buildNOPContextMenu,
  buildEnergyStorageContextMenu,
  buildTerminalSNContextMenu,
  buildStudyCaseContextMenu,
  buildAnalysisResultContextMenu,
  ACTION_MENU_MINIMUM_OPTIONS,
} from '../actionMenuBuilders';
import { sanitizeEngineeringActions } from '../EngineeringContextMenu';
import {
  CONTEXT_ACTION_TO_OPERATION,
  NAVIGATION_ACTIONS,
  TOGGLE_ACTIONS,
} from '../actionRouting';

// ---------------------------------------------------------------------------
// Collect ALL action IDs from ALL builders
// ---------------------------------------------------------------------------

function collectActionIds(
  actions: Array<{ id: string; separator?: boolean }>,
  elementType?: string,
): string[] {
  return sanitizeEngineeringActions(
    actions,
    elementType as Parameters<typeof sanitizeEngineeringActions>[1],
  )
    .filter((a) => !a.separator)
    .map((a) => a.id);
}

const ALL_BUILDER_ACTION_IDS = new Set<string>();

const MODE = 'MODEL_EDIT' as const;
const handlers = new Proxy<Record<string, () => void>>(
  {},
  { get: () => () => {} },
);

// SN builders
for (const ids of [
  collectActionIds(buildSourceSNContextMenu(MODE, handlers), 'Source'),
  collectActionIds(buildBusSNContextMenu(MODE, handlers), 'Bus'),
  collectActionIds(buildStationContextMenu(MODE, handlers), 'Station'),
  collectActionIds(buildBaySNContextMenu(MODE, handlers), 'BaySN'),
  collectActionIds(buildSwitchSNContextMenu(MODE, 'CLOSED', handlers), 'Switch'),
  collectActionIds(buildTransformerContextMenu(MODE, handlers), 'TransformerBranch'),
  collectActionIds(buildSegmentSNContextMenu(MODE, handlers), 'LineBranch'),
  collectActionIds(buildRelaySNContextMenu(MODE, handlers), 'Relay'),
  collectActionIds(buildMeasurementSNContextMenu(MODE, handlers), 'Measurement'),
  collectActionIds(buildNOPContextMenu(MODE, handlers), 'NOP'),
  collectActionIds(buildTerminalSNContextMenu(MODE, 'OTWARTY', handlers), 'Terminal'),
]) {
  for (const id of ids) ALL_BUILDER_ACTION_IDS.add(id);
}

// nN builders
for (const ids of [
  collectActionIds(buildBusNNContextMenu(MODE, handlers), 'BusNN'),
  collectActionIds(buildFeederNNContextMenu(MODE, handlers), 'FeederNN'),
  collectActionIds(buildSourceFieldNNContextMenu(MODE, handlers), 'SourceFieldNN'),
  collectActionIds(buildPVInverterContextMenu(MODE, handlers), 'PVInverter'),
  collectActionIds(buildBESSInverterContextMenu(MODE, handlers), 'BESSInverter'),
  collectActionIds(buildGensetContextMenu(MODE, handlers), 'Genset'),
  collectActionIds(buildUPSContextMenu(MODE, handlers), 'UPS'),
  collectActionIds(buildLoadNNContextMenu(MODE, handlers), 'LoadNN'),
  collectActionIds(buildEnergyMeterContextMenu(MODE, handlers), 'EnergyMeter'),
  collectActionIds(buildSwitchNNContextMenu(MODE, 'OPEN', handlers), 'SwitchNN'),
  collectActionIds(buildEnergyStorageContextMenu(MODE, handlers), 'EnergyStorage'),
]) {
  for (const id of ids) ALL_BUILDER_ACTION_IDS.add(id);
}

// Analysis builders
for (const ids of [
  collectActionIds(buildStudyCaseContextMenu(MODE, 'FRESH', handlers), 'StudyCase'),
  collectActionIds(buildAnalysisResultContextMenu(MODE, 'SHORT_CIRCUIT', handlers), 'AnalysisResult'),
]) {
  for (const id of ids) ALL_BUILDER_ACTION_IDS.add(id);
}

const KNOWN_NAVIGATION_ACTIONS = NAVIGATION_ACTIONS;
const KNOWN_TOGGLE_ACTIONS = TOGGLE_ACTIONS;
const KNOWN_OP_MAP_KEYS = new Set(Object.keys(CONTEXT_ACTION_TO_OPERATION));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CONTEXT_MENU_OP_MAP completeness', () => {
  it('should have at least 65 mappings in OP_MAP', () => {
    expect(KNOWN_OP_MAP_KEYS.size).toBeGreaterThanOrEqual(65);
  });

  it('should have at least 30 navigation actions', () => {
    expect(KNOWN_NAVIGATION_ACTIONS.size).toBeGreaterThanOrEqual(30);
  });

  it('should have at least 8 toggle actions', () => {
    expect(KNOWN_TOGGLE_ACTIONS.size).toBeGreaterThanOrEqual(8);
  });

  it('should cover kanoniczne operacje źródeł i pól w op map', () => {
    expect(KNOWN_OP_MAP_KEYS.has('add_converter_source')).toBe(true);
    expect(KNOWN_OP_MAP_KEYS.has('add_sn_bay')).toBe(true);
    expect(KNOWN_OP_MAP_KEYS.has('add_nn_outgoing_field')).toBe(true);
    expect(KNOWN_OP_MAP_KEYS.has('add_genset_nn')).toBe(true);
    expect(KNOWN_OP_MAP_KEYS.has('add_ups_nn')).toBe(true);
  });

  it('every action ID from builders should be handled (OP_MAP or NAVIGATION or TOGGLE)', () => {
    const unhandled: string[] = [];
    for (const actionId of ALL_BUILDER_ACTION_IDS) {
      const inOpMap = KNOWN_OP_MAP_KEYS.has(actionId);
      const inNav = KNOWN_NAVIGATION_ACTIONS.has(actionId);
      const inToggle = KNOWN_TOGGLE_ACTIONS.has(actionId);
      if (!inOpMap && !inNav && !inToggle) {
        unhandled.push(actionId);
      }
    }
    expect(unhandled).toEqual([]);
  });

  it('should handle all SN element actions', () => {
    const snActions = collectActionIds(buildSourceSNContextMenu(MODE, handlers));
    for (const id of snActions) {
      const handled =
        KNOWN_OP_MAP_KEYS.has(id) ||
        KNOWN_NAVIGATION_ACTIONS.has(id) ||
        KNOWN_TOGGLE_ACTIONS.has(id);
      expect(handled).toBe(true);
    }
  });

  it('should handle all Station actions (30+ items)', () => {
    const stationActions = collectActionIds(buildStationContextMenu(MODE, handlers));
    expect(stationActions.length).toBeGreaterThanOrEqual(30);
    for (const id of stationActions) {
      const handled =
        KNOWN_OP_MAP_KEYS.has(id) ||
        KNOWN_NAVIGATION_ACTIONS.has(id) ||
        KNOWN_TOGGLE_ACTIONS.has(id);
      expect(handled).toBe(true);
    }
  });

  it('should handle all Segment SN actions (24+ items)', () => {
    const segmentActions = collectActionIds(buildSegmentSNContextMenu(MODE, handlers));
    expect(segmentActions.length).toBeGreaterThanOrEqual(24);
    for (const id of segmentActions) {
      const handled =
        KNOWN_OP_MAP_KEYS.has(id) ||
        KNOWN_NAVIGATION_ACTIONS.has(id) ||
        KNOWN_TOGGLE_ACTIONS.has(id);
      expect(handled).toBe(true);
    }
  });

  it('should handle all PV inverter actions', () => {
    const pvActions = collectActionIds(buildPVInverterContextMenu(MODE, handlers));
    for (const id of pvActions) {
      const handled =
        KNOWN_OP_MAP_KEYS.has(id) ||
        KNOWN_NAVIGATION_ACTIONS.has(id) ||
        KNOWN_TOGGLE_ACTIONS.has(id);
      expect(handled).toBe(true);
    }
  });

  it('should handle all BESS inverter actions', () => {
    const bessActions = collectActionIds(buildBESSInverterContextMenu(MODE, handlers));
    for (const id of bessActions) {
      const handled =
        KNOWN_OP_MAP_KEYS.has(id) ||
        KNOWN_NAVIGATION_ACTIONS.has(id) ||
        KNOWN_TOGGLE_ACTIONS.has(id);
      expect(handled).toBe(true);
    }
  });

  it('should handle all Genset actions', () => {
    const gensetActions = collectActionIds(buildGensetContextMenu(MODE, handlers));
    for (const id of gensetActions) {
      const handled =
        KNOWN_OP_MAP_KEYS.has(id) ||
        KNOWN_NAVIGATION_ACTIONS.has(id) ||
        KNOWN_TOGGLE_ACTIONS.has(id);
      expect(handled).toBe(true);
    }
  });

  it('should handle all UPS actions', () => {
    const upsActions = collectActionIds(buildUPSContextMenu(MODE, handlers));
    for (const id of upsActions) {
      const handled =
        KNOWN_OP_MAP_KEYS.has(id) ||
        KNOWN_NAVIGATION_ACTIONS.has(id) ||
        KNOWN_TOGGLE_ACTIONS.has(id);
      expect(handled).toBe(true);
    }
  });

  it('ACTION_MENU_MINIMUM_OPTIONS should cover 24+ element types', () => {
    expect(Object.keys(ACTION_MENU_MINIMUM_OPTIONS).length).toBeGreaterThanOrEqual(24);
  });
});
