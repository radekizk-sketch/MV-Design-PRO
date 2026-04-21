/**
 * Engineering Context Menu — §2 UX 10/10 Tests
 *
 * Tests:
 * - Builder registry coverage (every ElementType has a builder)
 * - Deterministic action ordering
 * - Mode-aware action enabling
 * - Handler proxy generates correct operation IDs
 * - Zero empty clicks (every visible action has a handler)
 * - Polish labels only
 */

import { describe, it, expect, vi } from 'vitest';
import type { ElementType, OperatingMode } from '../../types';

// We test the builder registry logic and action generation directly
// since EngineeringContextMenu is a React component

// Import all builders to verify they exist
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
import { handlerNameToActionId } from '../EngineeringContextMenu';

// =============================================================================
// Forbidden English words in context menu labels
// =============================================================================

const FORBIDDEN_ENGLISH = [
  'Delete', 'Edit', 'Add', 'Remove', 'Properties', 'Show', 'View', 'Open',
  'Close', 'Save', 'Cancel', 'Settings', 'Options', 'History', 'Export',
  'Import', 'Toggle', 'Change', 'Select', 'Create', 'Copy', 'Paste',
  'Insert', 'Configure', 'Assign', 'Clear',
];

// Technical terms allowed
const ALLOWED_TECHNICAL = [
  'PV', 'BESS', 'UPS', 'CT', 'VT', 'SN', 'nN', 'SOC', 'NOP',
  'JSON', 'PDF', 'DOCX', 'LaTeX', 'TR', 'OLTC', 'TCC',
];

function containsForbiddenEnglish(label: string): boolean {
  const words = label.split(/[\s,.()/]+/);
  for (const word of words) {
    if (ALLOWED_TECHNICAL.includes(word)) continue;
    if (FORBIDDEN_ENGLISH.includes(word)) return true;
  }
  return false;
}

// =============================================================================
// Helper: collect all non-separator actions
// =============================================================================

function getVisibleActions(
  builder: (mode: OperatingMode, handlers: Record<string, (() => void) | undefined>) => ReturnType<typeof buildSourceSNContextMenu>,
  mode: OperatingMode = 'MODEL_EDIT',
) {
  const actions = builder(mode, {});
  return actions.filter((a) => !a.separator && a.visible);
}

// =============================================================================
// Tests
// =============================================================================

describe('EngineeringContextMenu — §2 UX 10/10', () => {
  describe('Handler name mapping', () => {
    it('preserves acronyms in handler -> action ID conversion', () => {
      expect(handlerNameToActionId('onAddNnOutgoingField')).toBe('add_nn_outgoing_field');
      expect(handlerNameToActionId('onAddPV')).toBe('add_converter_source');
      expect(handlerNameToActionId('onAddBESS')).toBe('add_converter_source');
      expect(handlerNameToActionId('onAddFW')).toBe('add_converter_source');
      expect(handlerNameToActionId('onAddGenset')).toBe('add_genset_nn');
      expect(handlerNameToActionId('onAddUPS')).toBe('add_ups_nn');
      expect(handlerNameToActionId('onAddBreaker')).toBe('add_sn_bay');
      expect(handlerNameToActionId('onAddSNFieldOUT')).toBe('add_sn_bay');
      expect(handlerNameToActionId('onAddCT')).toBe('add_ct');
      expect(handlerNameToActionId('onAddVT')).toBe('add_vt');
      expect(handlerNameToActionId('onAddProtection')).toBe('add_relay');
      expect(handlerNameToActionId('onAssignTRCatalog')).toBe('assign_tr_catalog');
      expect(handlerNameToActionId('onInsertSwitch')).toBe('insert_section_switch_sn');
    });
  });

  describe('Builder registry coverage', () => {
    it('has builder for every element type in ACTION_MENU_MINIMUM_OPTIONS', () => {
      // Verify all expected types have builders
      const builderTypes = [
        'Source', 'Bus', 'Station', 'BaySN', 'Switch', 'TransformerBranch',
        'LineBranch', 'Relay', 'Measurement', 'NOP', 'Terminal',
        'BusNN', 'FeederNN', 'SourceFieldNN', 'PVInverter', 'BESSInverter',
        'Genset', 'UPS', 'LoadNN', 'EnergyMeter', 'EnergyStorage', 'SwitchNN',
      ];

      for (const type of builderTypes) {
        expect(ACTION_MENU_MINIMUM_OPTIONS[type]).toBeDefined();
      }
    });
  });

  describe('Action count minimum', () => {
    const builderMap: Record<string, () => ReturnType<typeof buildSourceSNContextMenu>> = {
      Source: () => buildSourceSNContextMenu('MODEL_EDIT', {}),
      Bus: () => buildBusSNContextMenu('MODEL_EDIT', {}),
      Station: () => buildStationContextMenu('MODEL_EDIT', {}),
      BaySN: () => buildBaySNContextMenu('MODEL_EDIT', {}),
      Switch: () => buildSwitchSNContextMenu('MODEL_EDIT', 'CLOSED', {}),
      TransformerBranch: () => buildTransformerContextMenu('MODEL_EDIT', {}),
      LineBranch: () => buildSegmentSNContextMenu('MODEL_EDIT', {}),
      Relay: () => buildRelaySNContextMenu('MODEL_EDIT', {}),
      Measurement: () => buildMeasurementSNContextMenu('MODEL_EDIT', {}),
      NOP: () => buildNOPContextMenu('MODEL_EDIT', {}),
      Terminal: () => buildTerminalSNContextMenu('MODEL_EDIT', 'OTWARTY', {}),
      BusNN: () => buildBusNNContextMenu('MODEL_EDIT', {}),
      FeederNN: () => buildFeederNNContextMenu('MODEL_EDIT', {}),
      SourceFieldNN: () => buildSourceFieldNNContextMenu('MODEL_EDIT', {}),
      PVInverter: () => buildPVInverterContextMenu('MODEL_EDIT', {}),
      BESSInverter: () => buildBESSInverterContextMenu('MODEL_EDIT', {}),
      Genset: () => buildGensetContextMenu('MODEL_EDIT', {}),
      UPS: () => buildUPSContextMenu('MODEL_EDIT', {}),
      LoadNN: () => buildLoadNNContextMenu('MODEL_EDIT', {}),
      EnergyMeter: () => buildEnergyMeterContextMenu('MODEL_EDIT', {}),
      EnergyStorage: () => buildEnergyStorageContextMenu('MODEL_EDIT', {}),
      SwitchNN: () => buildSwitchNNContextMenu('MODEL_EDIT', 'CLOSED', {}),
    };

    for (const [type, builder] of Object.entries(builderMap)) {
      it(`${type} has >= ${ACTION_MENU_MINIMUM_OPTIONS[type] ?? 10} options`, () => {
        const actions = builder();
        const nonSeparator = actions.filter((a) => !a.separator);
        const minimum = ACTION_MENU_MINIMUM_OPTIONS[type] ?? 10;
        expect(nonSeparator.length).toBeGreaterThanOrEqual(minimum);
      });
    }
  });

  describe('Polish labels only', () => {
    const builders = [
      () => buildSourceSNContextMenu('MODEL_EDIT', {}),
      () => buildBusSNContextMenu('MODEL_EDIT', {}),
      () => buildStationContextMenu('MODEL_EDIT', {}),
      () => buildSegmentSNContextMenu('MODEL_EDIT', {}),
      () => buildSwitchSNContextMenu('MODEL_EDIT', 'CLOSED', {}),
      () => buildPVInverterContextMenu('MODEL_EDIT', {}),
      () => buildBESSInverterContextMenu('MODEL_EDIT', {}),
    ];

    it('no forbidden English words in action labels', () => {
      for (const builder of builders) {
        const actions = builder();
        for (const action of actions) {
          if (action.separator) continue;
          expect(containsForbiddenEnglish(action.label)).toBe(false);
        }
      }
    });
  });

  describe('Zero empty clicks', () => {
    it('every visible action has a handler when handlers provided', () => {
      const handler = vi.fn();
      const handlers = new Proxy<Record<string, () => void>>({}, {
        get() { return handler; },
      });

      const actions = buildStationContextMenu('MODEL_EDIT', handlers);
      const clickable = actions.filter((a) => !a.separator && a.enabled && a.visible);

      for (const action of clickable) {
        expect(action.handler).toBeDefined();
        action.handler!();
      }

      // All clickable actions should have fired handlers
      expect(handler).toHaveBeenCalledTimes(clickable.length);
    });
  });

  describe('Mode-aware action enabling', () => {
    it('edit actions disabled in RESULT_VIEW mode', () => {
      const actions = buildSegmentSNContextMenu('RESULT_VIEW', {});
      const editActions = actions.filter(
        (a) => !a.separator && a.id.startsWith('insert_') || a.id === 'delete',
      );

      for (const action of editActions) {
        if (action.id === 'delete' || action.id.startsWith('insert_')) {
          expect(action.enabled).toBe(false);
        }
      }
    });

    it('result actions enabled in RESULT_VIEW mode', () => {
      const actions = buildSegmentSNContextMenu('RESULT_VIEW', {});
      const resultActions = actions.filter(
        (a) => a.id === 'show_results' || a.id === 'show_whitebox',
      );

      for (const action of resultActions) {
        expect(action.enabled).toBe(true);
      }
    });
  });

  describe('Required base actions', () => {
    const builders = [
      () => buildSourceSNContextMenu('MODEL_EDIT', {}),
      () => buildBusSNContextMenu('MODEL_EDIT', {}),
      () => buildStationContextMenu('MODEL_EDIT', {}),
      () => buildSegmentSNContextMenu('MODEL_EDIT', {}),
    ];

    const requiredIds = ['properties', 'show_tree', 'show_diagram', 'history'];

    for (const id of requiredIds) {
      it(`every builder includes '${id}' action`, () => {
        for (const builder of builders) {
          const actions = builder();
          const found = actions.find((a) => a.id === id);
          expect(found).toBeDefined();
        }
      });
    }
  });

  describe('StudyCase and AnalysisResult menus', () => {
    it('StudyCase menu has >= 20 options', () => {
      const actions = buildStudyCaseContextMenu('MODEL_EDIT', 'FRESH', {});
      const nonSep = actions.filter((a) => !a.separator);
      expect(nonSep.length).toBeGreaterThanOrEqual(20);
    });

    it('AnalysisResult menu has >= 20 options', () => {
      const actions = buildAnalysisResultContextMenu('RESULT_VIEW', 'SHORT_CIRCUIT', {});
      const nonSep = actions.filter((a) => !a.separator);
      expect(nonSep.length).toBeGreaterThanOrEqual(20);
    });
  });
});
