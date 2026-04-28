/**
 * Action Menu Builders — testy kompletnosci menu kontekstowego nN.
 *
 * CANONICAL ALIGNMENT:
 * - UI_UX_10_10_ABSOLUTE_PLUS_ACTIONS_AND_MODALS_CANONICAL.md
 * - wizard_screens.md § 4: Menu Kontekstowe specifications
 * - sld_rules.md § E.2, § E.3: Context Menu (Edit Mode) and (Result Mode)
 *
 * Zasady:
 * - Kazde menu musi miec co najmniej ACTION_MENU_MINIMUM_OPTIONS opcji.
 * - Etykiety 100% PL — brak anglicyzmow.
 * - Wymagane akcje bazowe: properties, show_tree, show_diagram, history.
 * - MODEL_EDIT wlacza akcje edycyjne, RESULT_VIEW wlacza akcje wynikowe.
 */

import { describe, it, expect } from 'vitest';
import {
  buildBusNNContextMenu,
  buildFeederNNContextMenu,
  buildSourceFieldNNContextMenu,
  buildPVInverterContextMenu,
  buildBESSInverterContextMenu,
  buildGensetContextMenu,
  buildUPSContextMenu,
  buildLoadNNContextMenu,
  buildSwitchSNContextMenu,
  buildStationContextMenu,
  buildEnergyMeterContextMenu,
  buildSegmentSNContextMenu,
  buildRelaySNContextMenu,
  buildMeasurementSNContextMenu,
  buildNOPContextMenu,
  buildEnergyStorageContextMenu,
  buildSourceSNContextMenu,
  buildBranchPoleContextMenu,
  buildBusSNContextMenu,
  buildZksnContextMenu,
  buildBaySNContextMenu,
  buildTransformerContextMenu,
  buildSwitchNNContextMenu,
  ACTION_MENU_MINIMUM_OPTIONS,
} from '../actionMenuBuilders';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Non-separator actions (real menu items). */
function realActions<T extends { separator?: boolean; label: string }>(items: T[]): T[] {
  return items.filter((a) => !a.separator && a.label !== '');
}

function actionTokens(items: { id: string; actionKey?: string; separator?: boolean }[]) {
  return items.filter((a) => !a.separator).map((a) => a.actionKey ?? a.id);
}

const CANONICAL_MENU_BUILDERS = new Set([
  'buildPVInverterContextMenu',
  'buildBESSInverterContextMenu',
  'buildBaySNContextMenu',
  'buildEnergyStorageContextMenu',
  'buildStationContextMenu',
  'buildSegmentSNContextMenu',
]);

/**
 * Forbidden English words that must NOT appear in any label.
 * Technical abbreviations (PV, BESS, UPS, CT, VT, SN, nN, SOC, NOP) are
 * acceptable as domain terms used internationally.
 */
const FORBIDDEN_ENGLISH_WORDS = [
  'Delete',
  'Edit',
  'Add',
  'Remove',
  'Properties',
  'Show',
  'View',
  'Open',
  'Close',
  'Save',
  'Cancel',
  'Settings',
  'Options',
  'History',
  'Export',
  'Import',
  'Toggle',
  'Switch',
  'Change',
  'Select',
  'Create',
  'Copy',
  'Paste',
  'Insert',
  'Configure',
  'Assign',
  'Clear',
];

function assertPolishLabels(
  items: { separator?: boolean; label: string }[],
  contextName: string,
) {
  for (const item of realActions(items)) {
    for (const eng of FORBIDDEN_ENGLISH_WORDS) {
      // Case-sensitive match for standalone words — skip domain acronyms
      const regex = new RegExp(`\\b${eng}\\b`, 'i');
      if (eng.toLowerCase() === 'open' || eng.toLowerCase() === 'close') {
        // 'OPEN' / 'CLOSED' can appear as switch state in labels like 'Otwórz' but not standalone English
        // We check that the label does not START with the English word
        if (item.label.startsWith(eng + ' ') || item.label === eng) {
          throw new Error(
            `[${contextName}] Label "${item.label}" contains forbidden English word "${eng}"`,
          );
        }
        continue;
      }
      if (regex.test(item.label)) {
        throw new Error(
          `[${contextName}] Label "${item.label}" contains forbidden English word "${eng}"`,
        );
      }
    }
  }
}

/** Assert required base actions exist in menu. */
function assertRequiredActions(
  items: { id: string; separator?: boolean; section?: string }[],
  contextName: string,
) {
  const ids = items.map((a) => a.id);
  if (CANONICAL_MENU_BUILDERS.has(contextName)) {
    expect(ids).toContain('open_inspector');
    expect(realActions(items).some((a) => Boolean(a.section))).toBe(true);
    return;
  }
  const required = ['properties', 'show_tree', 'show_diagram', 'history'];
  for (const req of required) {
    expect(ids).toContain(req);
  }
}

function isEditAction(
  action: { id: string; separator?: boolean; section?: string },
  builderName: string,
): boolean {
  if (action.separator) return false;
  if (CANONICAL_MENU_BUILDERS.has(builderName)) {
    return ['Edytuj', 'Dodaj', 'Operacje', 'Usuń'].includes(action.section ?? '');
  }
  return (
    action.id.startsWith('add_') ||
    action.id.startsWith('edit_') ||
    action.id.startsWith('assign_') ||
    action.id === 'delete' ||
    action.id === 'toggle_service'
  );
}

// ---------------------------------------------------------------------------
// ACTION_MENU_MINIMUM_OPTIONS map completeness
// ---------------------------------------------------------------------------

describe('ACTION_MENU_MINIMUM_OPTIONS', () => {
  it('should define minimum option counts for all nN source types', () => {
    const nnTypes = [
      'BusNN',
      'FeederNN',
      'SourceFieldNN',
      'PVInverter',
      'BESSInverter',
      'Genset',
      'UPS',
      'LoadNN',
      'EnergyMeter',
      'EnergyStorage',
      'SwitchNN',
    ];
    for (const t of nnTypes) {
      expect(ACTION_MENU_MINIMUM_OPTIONS).toHaveProperty(t);
      expect(ACTION_MENU_MINIMUM_OPTIONS[t]).toBeGreaterThanOrEqual(10);
    }
  });

  it('should define minimum option counts for all SN types', () => {
    const snTypes = [
      'Source',
      'Bus',
      'Station',
      'BranchPole',
      'ZKSN',
      'BaySN',
      'Switch',
      'TransformerBranch',
      'Relay',
      'Measurement',
      'NOP',
    ];
    for (const t of snTypes) {
      expect(ACTION_MENU_MINIMUM_OPTIONS).toHaveProperty(t);
      expect(ACTION_MENU_MINIMUM_OPTIONS[t]).toBeGreaterThanOrEqual(9);
    }
  });

  it('should have all values >= 9 (absolute minimum for any context menu)', () => {
    for (const [key, val] of Object.entries(ACTION_MENU_MINIMUM_OPTIONS)) {
      expect(val, `${key} minimum options should be >= 9`).toBeGreaterThanOrEqual(9);
    }
  });

  it('should have all nN source values >= 10', () => {
    const nnSourceTypes = ['BusNN', 'FeederNN', 'SourceFieldNN', 'PVInverter', 'BESSInverter', 'Genset', 'UPS'];
    for (const t of nnSourceTypes) {
      expect(ACTION_MENU_MINIMUM_OPTIONS[t], `${t} should have >= 10 options`).toBeGreaterThanOrEqual(10);
    }
  });
});

// ---------------------------------------------------------------------------
// Shared builder assertion suites
// ---------------------------------------------------------------------------

/**
 * Generic builder test suite factory.
 * Runs common checks on any menu builder.
 */
function describeBuilder(
  builderName: string,
  buildFn: (mode: 'MODEL_EDIT' | 'RESULT_VIEW') => { id: string; label: string; enabled: boolean; separator?: boolean; section?: string; actionKey?: string }[],
  minOptionsKey: string,
  expectedMinCount: number,
) {
  describe(builderName, () => {
    it(`should return at least ${expectedMinCount} non-separator options (ACTION_MENU_MINIMUM_OPTIONS["${minOptionsKey}"])`, () => {
      const items = buildFn('MODEL_EDIT');
      const real = realActions(items);
      expect(real.length).toBeGreaterThanOrEqual(expectedMinCount);
    });

    it('should have all labels in Polish (no forbidden English words)', () => {
      const items = buildFn('MODEL_EDIT');
      assertPolishLabels(items, builderName);
    });

    it('should contain required base actions (properties, show_tree, show_diagram, history)', () => {
      const items = buildFn('MODEL_EDIT');
      assertRequiredActions(items, builderName);
    });

    it('should enable edit actions in MODEL_EDIT mode', () => {
      const items = buildFn('MODEL_EDIT');
      const editIds = items.filter((a) => isEditAction(a, builderName));
      for (const editAction of editIds) {
        expect(
          editAction.enabled,
          `${builderName} / MODEL_EDIT: "${editAction.id}" should be enabled`,
        ).toBe(true);
      }
    });

    it('should disable edit actions in RESULT_VIEW mode', () => {
      const items = buildFn('RESULT_VIEW');
      const editIds = items.filter((a) => isEditAction(a, builderName));
      for (const editAction of editIds) {
        expect(
          editAction.enabled,
          `${builderName} / RESULT_VIEW: "${editAction.id}" should be disabled`,
        ).toBe(false);
      }
    });

    it('should enable result-view actions (show_results, show_whitebox) in RESULT_VIEW mode', () => {
      const items = buildFn('RESULT_VIEW');
      const resultAction = items.find((a) => a.id === 'show_results');
      if (resultAction) {
        expect(resultAction.enabled).toBe(true);
      }
      const whiteboxAction = items.find((a) => a.id === 'show_whitebox');
      if (whiteboxAction) {
        expect(whiteboxAction.enabled).toBe(true);
      }
    });

    it('should disable show_results in MODEL_EDIT mode', () => {
      const items = buildFn('MODEL_EDIT');
      const resultAction = items.find((a) => a.id === 'show_results');
      if (resultAction) {
        expect(resultAction.enabled).toBe(false);
      }
    });

    it('should always enable navigation actions (show_tree, show_diagram)', () => {
      for (const mode of ['MODEL_EDIT', 'RESULT_VIEW'] as const) {
        const items = buildFn(mode);
        if (CANONICAL_MENU_BUILDERS.has(builderName)) {
          const openInspector = items.find((a) => a.id === 'open_inspector');
          expect(openInspector?.enabled, `${mode}: open_inspector should be enabled`).toBe(true);
          continue;
        }
        const treeAction = items.find((a) => a.id === 'show_tree');
        const diagramAction = items.find((a) => a.id === 'show_diagram');
        expect(treeAction?.enabled, `${mode}: show_tree should be enabled`).toBe(true);
        expect(diagramAction?.enabled, `${mode}: show_diagram should be enabled`).toBe(true);
      }
    });

    it('should always enable history action', () => {
      for (const mode of ['MODEL_EDIT', 'RESULT_VIEW'] as const) {
        const items = buildFn(mode);
        if (CANONICAL_MENU_BUILDERS.has(builderName)) {
          const reportAction = items.find((a) => a.section === 'Raport');
          if (reportAction) {
            expect(reportAction.enabled, `${mode}: report action should be enabled`).toBe(true);
          } else {
            const openInspector = items.find((a) => a.id === 'open_inspector');
            expect(openInspector?.enabled, `${mode}: open_inspector should be enabled`).toBe(true);
          }
          continue;
        }
        const historyAction = items.find((a) => a.id === 'history');
        expect(historyAction?.enabled, `${mode}: history should be enabled`).toBe(true);
      }
    });

    it('should have unique action IDs (no duplicates except separators)', () => {
      const items = buildFn('MODEL_EDIT');
      const nonSepIds = items.filter((a) => !a.separator).map((a) => a.actionKey ?? a.id);
      const uniqueIds = new Set(nonSepIds);
      expect(uniqueIds.size).toBe(nonSepIds.length);
    });

    it('should match ACTION_MENU_MINIMUM_OPTIONS count', () => {
      const expected = ACTION_MENU_MINIMUM_OPTIONS[minOptionsKey];
      expect(expected).toBeDefined();
      const items = buildFn('MODEL_EDIT');
      const real = realActions(items);
      expect(real.length).toBeGreaterThanOrEqual(expected);
    });
  });
}

// ---------------------------------------------------------------------------
// M) Szyna nN — buildBusNNContextMenu
// ---------------------------------------------------------------------------

describeBuilder(
  'buildBranchPoleContextMenu',
  (mode) => buildBranchPoleContextMenu(mode),
  'BranchPole',
  9,
);

describeBuilder(
  'buildZksnContextMenu',
  (mode) => buildZksnContextMenu(mode),
  'ZKSN',
  9,
);

describeBuilder(
  'buildBusNNContextMenu',
  (mode) => buildBusNNContextMenu(mode),
  'BusNN',
  22,
);

describe('buildBusNNContextMenu — specific', () => {
  it('should include shared and dispatchable source actions: converter, genset, ups', () => {
    const items = buildBusNNContextMenu('MODEL_EDIT');
    const ids = actionTokens(items);
    expect(ids).toContain('bus_nn_add_converter_source_pv');
    expect(ids).toContain('bus_nn_add_converter_source_bess');
    expect(ids).toContain('bus_nn_add_converter_source_fw');
    expect(ids).toContain('add_genset_nn');
    expect(ids).toContain('add_ups_nn');
  });

  it('should include bus infrastructure actions', () => {
    const items = buildBusNNContextMenu('MODEL_EDIT');
    const ids = actionTokens(items);
    expect(ids).toContain('bus_nn_add_feeder');
    expect(ids).toContain('bus_nn_add_load');
  });

  it('should include feeder and source field actions', () => {
    const items = buildBusNNContextMenu('MODEL_EDIT');
    const ids = actionTokens(items);
    expect(ids).toContain('bus_nn_add_feeder');
    expect(ids).toContain('bus_nn_source_field');
  });

  it('should include voltage edit and catalog assignment', () => {
    const items = buildBusNNContextMenu('MODEL_EDIT');
    const ids = items.map((a) => a.id);
    expect(ids).toContain('edit_voltage');
    expect(ids).toContain('assign_bus_catalog');
    expect(ids).toContain('assign_catalog');
  });

  it('should have delete action for the bus', () => {
    const items = buildBusNNContextMenu('MODEL_EDIT');
    const deleteAction = items.find((a) => a.id === 'delete');
    expect(deleteAction).toBeDefined();
    expect(deleteAction!.label).toContain('szynę nN');
    expect(deleteAction!.enabled).toBe(true);
  });

  it('should show "Pokaż właściwości..." in RESULT_VIEW', () => {
    const items = buildBusNNContextMenu('RESULT_VIEW');
    const props = items.find((a) => a.id === 'properties');
    expect(props).toBeDefined();
    expect(props!.label).toBe('Pokaż właściwości...');
  });
});

// ---------------------------------------------------------------------------
// O) Odpływ nN — buildFeederNNContextMenu
// ---------------------------------------------------------------------------

describeBuilder(
  'buildFeederNNContextMenu',
  (mode) => buildFeederNNContextMenu(mode),
  'FeederNN',
  22,
);

describe('buildFeederNNContextMenu — specific', () => {
  it('should include add_nn_load and converter source actions', () => {
    const items = buildFeederNNContextMenu('MODEL_EDIT');
    const ids = actionTokens(items);
    expect(ids).toContain('feeder_nn_add_load');
    expect(ids).toContain('feeder_nn_add_converter_source_pv');
    expect(ids).toContain('feeder_nn_add_converter_source_bess');
    expect(ids).toContain('feeder_nn_add_converter_source_fw');
  });

  it('should include apparatus and cable actions', () => {
    const items = buildFeederNNContextMenu('MODEL_EDIT');
    const ids = actionTokens(items);
    expect(ids).toContain('feeder_nn_add_breaker');
    expect(ids).toContain('feeder_nn_add_disconnector');
    expect(ids).toContain('assign_switch_catalog');
    expect(ids).toContain('assign_cable_catalog');
  });

  it('should include segment and protection actions', () => {
    const items = buildFeederNNContextMenu('MODEL_EDIT');
    const ids = items.map((a) => a.id);
    expect(ids).toContain('edit_segment_length');
    expect(ids).toContain('add_relay');
  });

  it('should include change_role action', () => {
    const items = buildFeederNNContextMenu('MODEL_EDIT');
    const roleAction = items.find((a) => a.id === 'change_role');
    expect(roleAction).toBeDefined();
    expect(roleAction!.label).toContain('Zmień rolę odpływu');
  });
});

// ---------------------------------------------------------------------------
// U) Pole źródłowe nN — buildSourceFieldNNContextMenu
// ---------------------------------------------------------------------------

describeBuilder(
  'buildSourceFieldNNContextMenu',
  (mode) => buildSourceFieldNNContextMenu(mode),
  'SourceFieldNN',
  15,
);

describe('buildSourceFieldNNContextMenu — specific', () => {
  it('should include all shared source type actions', () => {
    const items = buildSourceFieldNNContextMenu('MODEL_EDIT');
    const ids = actionTokens(items);
    expect(ids).toContain('source_field_nn_add_converter_source_pv');
    expect(ids).toContain('source_field_nn_add_converter_source_bess');
    expect(ids).toContain('source_field_nn_add_converter_source_fw');
    expect(ids).toContain('add_genset_nn');
    expect(ids).toContain('add_ups_nn');
  });

  it('should include change_kind for field type switching', () => {
    const items = buildSourceFieldNNContextMenu('MODEL_EDIT');
    const kindAction = items.find((a) => a.id === 'change_kind');
    expect(kindAction).toBeDefined();
    expect(kindAction!.label).toContain('Zmień rodzaj pola');
  });
});

// ---------------------------------------------------------------------------
// V) Źródło przekształtnikowe PV — buildPVInverterContextMenu
// ---------------------------------------------------------------------------

describeBuilder(
  'buildPVInverterContextMenu',
  (mode) => buildPVInverterContextMenu(mode),
  'PVInverter',
  14,
);

describe('buildPVInverterContextMenu — specific', () => {
  it('should include canonical source profile and compliance actions', () => {
    const items = buildPVInverterContextMenu('MODEL_EDIT');
    const ids = items.map((a) => a.id);
    expect(ids).toContain('edit_source');
    expect(ids).toContain('edit_connection_point');
    expect(ids).toContain('edit_operator_profile');
    expect(ids).toContain('edit_source_profile');
    expect(ids).toContain('edit_qu_profile');
    expect(ids).toContain('edit_cosphi_profile');
    expect(ids).toContain('edit_frt_profile');
    expect(ids).toContain('check_connection_compliance');
  });

  it('should use source compliance report instead of catalog-assignment menu', () => {
    const items = buildPVInverterContextMenu('MODEL_EDIT');
    const ids = items.map((a) => a.id);
    expect(ids).toContain('add_to_compliance_report');
    expect(ids).not.toContain('assign_catalog');
    expect(ids).not.toContain('clear_catalog');
  });

  it('should include engineering justification action', () => {
    const items = buildPVInverterContextMenu('RESULT_VIEW');
    const wb = items.find((a) => a.id === 'show_engineering_justification');
    expect(wb).toBeDefined();
    expect(wb!.enabled).toBe(true);
    expect(wb!.label).toContain('uzasadnienie inżynierskie');
  });
});

// ---------------------------------------------------------------------------
// W) Źródło przekształtnikowe BESS — buildBESSInverterContextMenu
// ---------------------------------------------------------------------------

describeBuilder(
  'buildBESSInverterContextMenu',
  (mode) => buildBESSInverterContextMenu(mode),
  'BESSInverter',
  14,
);

describe('buildBESSInverterContextMenu — specific', () => {
  it('should include canonical source profile and compliance actions', () => {
    const items = buildBESSInverterContextMenu('MODEL_EDIT');
    const ids = items.map((a) => a.id);
    expect(ids).toContain('edit_source');
    expect(ids).toContain('edit_connection_point');
    expect(ids).toContain('edit_operator_profile');
    expect(ids).toContain('edit_source_profile');
    expect(ids).toContain('edit_qu_profile');
    expect(ids).toContain('edit_cosphi_profile');
    expect(ids).toContain('edit_frt_profile');
    expect(ids).toContain('check_connection_compliance');
  });

  it('should use source compliance report instead of dual catalog-assignment menu', () => {
    const items = buildBESSInverterContextMenu('MODEL_EDIT');
    const ids = items.map((a) => a.id);
    expect(ids).toContain('add_to_compliance_report');
    expect(ids).not.toContain('assign_inverter_catalog');
    expect(ids).not.toContain('assign_storage_catalog');
    expect(ids).not.toContain('clear_catalog');
  });
});

// ---------------------------------------------------------------------------
// Y) Agregat — buildGensetContextMenu
// ---------------------------------------------------------------------------

describeBuilder(
  'buildGensetContextMenu',
  (mode) => buildGensetContextMenu(mode),
  'Genset',
  16,
);

describe('buildGensetContextMenu — specific', () => {
  it('should include genset-specific edit actions', () => {
    const items = buildGensetContextMenu('MODEL_EDIT');
    const ids = items.map((a) => a.id);
    expect(ids).toContain('edit_power');
    expect(ids).toContain('edit_voltage');
    expect(ids).toContain('edit_pf');
    expect(ids).toContain('edit_mode');
    expect(ids).toContain('edit_fuel');
    expect(ids).toContain('edit_switch');
  });

  it('should have fuel type label in Polish', () => {
    const items = buildGensetContextMenu('MODEL_EDIT');
    const fuelAction = items.find((a) => a.id === 'edit_fuel');
    expect(fuelAction).toBeDefined();
    expect(fuelAction!.label).toContain('paliwa');
  });
});

// ---------------------------------------------------------------------------
// Z) UPS — buildUPSContextMenu
// ---------------------------------------------------------------------------

describeBuilder(
  'buildUPSContextMenu',
  (mode) => buildUPSContextMenu(mode),
  'UPS',
  14,
);

describe('buildUPSContextMenu — specific', () => {
  it('should include UPS-specific edit actions', () => {
    const items = buildUPSContextMenu('MODEL_EDIT');
    const ids = items.map((a) => a.id);
    expect(ids).toContain('edit_power');
    expect(ids).toContain('edit_backup_time');
    expect(ids).toContain('edit_mode');
    expect(ids).toContain('edit_battery');
    expect(ids).toContain('edit_switch');
  });

  it('should have backup time label in Polish', () => {
    const items = buildUPSContextMenu('MODEL_EDIT');
    const backupAction = items.find((a) => a.id === 'edit_backup_time');
    expect(backupAction).toBeDefined();
    expect(backupAction!.label).toContain('podtrzymania');
  });
});

// ---------------------------------------------------------------------------
// S) Odbiór nN — buildLoadNNContextMenu
// ---------------------------------------------------------------------------

describeBuilder(
  'buildLoadNNContextMenu',
  (mode) => buildLoadNNContextMenu(mode),
  'LoadNN',
  12,
);

// ---------------------------------------------------------------------------
// AA) Licznik energii — buildEnergyMeterContextMenu
// ---------------------------------------------------------------------------

describeBuilder(
  'buildEnergyMeterContextMenu',
  (mode) => buildEnergyMeterContextMenu(mode),
  'EnergyMeter',
  11,
);

// ---------------------------------------------------------------------------
// AH) Łącznik nN — buildSwitchNNContextMenu
// ---------------------------------------------------------------------------

describe('buildSwitchNNContextMenu', () => {
  it('should return at least ACTION_MENU_MINIMUM_OPTIONS["SwitchNN"] non-separator options', () => {
    const items = buildSwitchNNContextMenu('MODEL_EDIT', 'CLOSED');
    const real = realActions(items);
    expect(real.length).toBeGreaterThanOrEqual(ACTION_MENU_MINIMUM_OPTIONS['SwitchNN']);
  });

  it('should have all labels in Polish', () => {
    const items = buildSwitchNNContextMenu('MODEL_EDIT', 'OPEN');
    assertPolishLabels(items, 'buildSwitchNNContextMenu');
  });

  it('should contain required base actions', () => {
    const items = buildSwitchNNContextMenu('MODEL_EDIT', 'CLOSED');
    assertRequiredActions(items, 'buildSwitchNNContextMenu');
  });

  it('should show "Otwórz łącznik" for CLOSED switch', () => {
    const items = buildSwitchNNContextMenu('MODEL_EDIT', 'CLOSED');
    const toggle = items.find((a) => a.id === 'toggle_switch');
    expect(toggle).toBeDefined();
    expect(toggle!.label).toBe('Otwórz łącznik');
  });

  it('should show "Zamknij łącznik" for OPEN switch', () => {
    const items = buildSwitchNNContextMenu('MODEL_EDIT', 'OPEN');
    const toggle = items.find((a) => a.id === 'toggle_switch');
    expect(toggle).toBeDefined();
    expect(toggle!.label).toBe('Zamknij łącznik');
  });

  it('should disable toggle_switch in RESULT_VIEW', () => {
    const items = buildSwitchNNContextMenu('RESULT_VIEW', 'CLOSED');
    const toggle = items.find((a) => a.id === 'toggle_switch');
    expect(toggle).toBeDefined();
    expect(toggle!.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SN Builders — minimum option and Polish label checks
// ---------------------------------------------------------------------------

describeBuilder(
  'buildSourceSNContextMenu',
  (mode) => buildSourceSNContextMenu(mode),
  'Source',
  14,
);

describe('buildSourceSNContextMenu ??? specific', () => {
  it('prowadzi do pol GPZ zamiast wyprowadzac magistrale bezposrednio ze zrodla', () => {
    const items = buildSourceSNContextMenu('MODEL_EDIT');
    const action = items.find((candidate) => candidate.id === 'open_gpz_fields');
    expect(action).toBeDefined();
    expect(action?.label).toContain('pola GPZ');
    expect(action?.label).toContain('dodaj pole SN');
    expect(items.some((candidate) => candidate.id === 'continue_trunk_segment_sn')).toBe(false);
  });
});

describeBuilder(
  'buildBusSNContextMenu',
  (mode) => buildBusSNContextMenu(mode),
  'Bus',
  16,
);

describe('buildBusSNContextMenu — specific', () => {
  it('eksponuje dodanie pola SN jako kanoniczna akcje z wariantem aparatu', () => {
    const items = buildBusSNContextMenu('MODEL_EDIT');
    const addBreakerAction = items.find((candidate) => candidate.actionKey === 'bus_sn_add_breaker');
    const addDisconnectorAction = items.find((candidate) => candidate.actionKey === 'bus_sn_add_disconnector');

    expect(addBreakerAction).toBeDefined();
    expect(addBreakerAction?.label).toBe('Dodaj pole SN z wyłącznikiem...');
    expect(addDisconnectorAction).toBeDefined();
    expect(addDisconnectorAction?.label).toBe('Dodaj pole SN z rozłącznikiem...');
  });
});

describeBuilder(
  'buildStationContextMenu',
  (mode) => buildStationContextMenu(mode),
  'Station',
  20,
);

describeBuilder(
  'buildBaySNContextMenu',
  (mode) => buildBaySNContextMenu(mode),
  'BaySN',
  15,
);

describe('buildSwitchSNContextMenu', () => {
  it('should return at least ACTION_MENU_MINIMUM_OPTIONS["Switch"] non-separator options', () => {
    const items = buildSwitchSNContextMenu('MODEL_EDIT', 'CLOSED');
    const real = realActions(items);
    expect(real.length).toBeGreaterThanOrEqual(ACTION_MENU_MINIMUM_OPTIONS['Switch']);
  });

  it('should have all labels in Polish', () => {
    const items = buildSwitchSNContextMenu('MODEL_EDIT', 'OPEN');
    assertPolishLabels(items, 'buildSwitchSNContextMenu');
  });

  it('should contain required base actions', () => {
    const items = buildSwitchSNContextMenu('MODEL_EDIT', 'CLOSED');
    assertRequiredActions(items, 'buildSwitchSNContextMenu');
  });
});

describeBuilder(
  'buildTransformerContextMenu',
  (mode) => buildTransformerContextMenu(mode),
  'TransformerBranch',
  13,
);

describeBuilder(
  'buildSegmentSNContextMenu',
  (mode) => buildSegmentSNContextMenu(mode),
  'LineBranch',
  16,
);

describeBuilder(
  'buildRelaySNContextMenu',
  (mode) => buildRelaySNContextMenu(mode),
  'Relay',
  13,
);

describeBuilder(
  'buildMeasurementSNContextMenu',
  (mode) => buildMeasurementSNContextMenu(mode),
  'Measurement',
  11,
);

describeBuilder(
  'buildNOPContextMenu',
  (mode) => buildNOPContextMenu(mode),
  'NOP',
  9,
);

describeBuilder(
  'buildEnergyStorageContextMenu',
  (mode) => buildEnergyStorageContextMenu(mode),
  'EnergyStorage',
  14,
);

// ---------------------------------------------------------------------------
// G) Station — nN source actions in station menu
// ---------------------------------------------------------------------------

describe('buildStationContextMenu — nN source actions', () => {
  it('should include all nN source addition actions', () => {
    const items = buildStationContextMenu('MODEL_EDIT');
    const ids = actionTokens(items);
    expect(ids).toContain('station_add_converter_source_pv');
    expect(ids).toContain('station_add_converter_source_bess');
    expect(ids).toContain('station_add_converter_source_fw');
    expect(ids).toContain('add_genset_nn');
    expect(ids).toContain('add_ups_nn');
    expect(ids).toContain('station_add_nn_bus');
    expect(ids).toContain('station_add_feeder');
    expect(ids).toContain('station_source_field');
  });

  it('should disable nN source addition actions in RESULT_VIEW', () => {
    const items = buildStationContextMenu('RESULT_VIEW');
    const sourceActions = items.filter(
      (a) =>
        a.actionKey === 'station_add_converter_source_pv' ||
        a.actionKey === 'station_add_converter_source_bess' ||
        a.actionKey === 'station_add_converter_source_fw' ||
        a.id === 'add_genset_nn' ||
        a.id === 'add_ups_nn',
    );
    for (const sa of sourceActions) {
      expect(sa.enabled).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-builder consistency: all menus have properties as first real action
// ---------------------------------------------------------------------------

describe('Cross-builder consistency', () => {
  const builders: [string, () => { id: string; separator?: boolean }[]][] = [
    ['buildBusNNContextMenu', () => buildBusNNContextMenu('MODEL_EDIT')],
    ['buildFeederNNContextMenu', () => buildFeederNNContextMenu('MODEL_EDIT')],
    ['buildSourceFieldNNContextMenu', () => buildSourceFieldNNContextMenu('MODEL_EDIT')],
    ['buildPVInverterContextMenu', () => buildPVInverterContextMenu('MODEL_EDIT')],
    ['buildBESSInverterContextMenu', () => buildBESSInverterContextMenu('MODEL_EDIT')],
    ['buildGensetContextMenu', () => buildGensetContextMenu('MODEL_EDIT')],
    ['buildUPSContextMenu', () => buildUPSContextMenu('MODEL_EDIT')],
    ['buildLoadNNContextMenu', () => buildLoadNNContextMenu('MODEL_EDIT')],
    ['buildEnergyMeterContextMenu', () => buildEnergyMeterContextMenu('MODEL_EDIT')],
    ['buildEnergyStorageContextMenu', () => buildEnergyStorageContextMenu('MODEL_EDIT')],
    ['buildSourceSNContextMenu', () => buildSourceSNContextMenu('MODEL_EDIT')],
    ['buildBranchPoleContextMenu', () => buildBranchPoleContextMenu('MODEL_EDIT')],
    ['buildBusSNContextMenu', () => buildBusSNContextMenu('MODEL_EDIT')],
    ['buildZksnContextMenu', () => buildZksnContextMenu('MODEL_EDIT')],
    ['buildStationContextMenu', () => buildStationContextMenu('MODEL_EDIT')],
    ['buildBaySNContextMenu', () => buildBaySNContextMenu('MODEL_EDIT')],
    ['buildTransformerContextMenu', () => buildTransformerContextMenu('MODEL_EDIT')],
    ['buildSegmentSNContextMenu', () => buildSegmentSNContextMenu('MODEL_EDIT')],
    ['buildRelaySNContextMenu', () => buildRelaySNContextMenu('MODEL_EDIT')],
    ['buildMeasurementSNContextMenu', () => buildMeasurementSNContextMenu('MODEL_EDIT')],
    ['buildNOPContextMenu', () => buildNOPContextMenu('MODEL_EDIT')],
    ['buildSwitchSNContextMenu', () => buildSwitchSNContextMenu('MODEL_EDIT', 'CLOSED')],
    ['buildSwitchNNContextMenu', () => buildSwitchNNContextMenu('MODEL_EDIT', 'CLOSED')],
  ];

  it.each(builders)(
    '%s: first real action should follow canonical opening rule',
    (name, build) => {
      const items = build();
      const first = items.find((a) => !a.separator);
      expect(first).toBeDefined();
      expect(first!.id).toBe(CANONICAL_MENU_BUILDERS.has(name) ? 'open_inspector' : 'properties');
    },
  );

  it.each(builders)(
    '%s: last real action should be "delete" (if present)',
    (_name, build) => {
      const items = build();
      const real = items.filter((a) => !a.separator && a.id !== '');
      const last = real[real.length - 1];
      // Some menus (like NOP) may not have delete — that is acceptable
      if (items.some((a) => a.id === 'delete')) {
        expect(last.id).toBe('delete');
      }
    },
  );
});
