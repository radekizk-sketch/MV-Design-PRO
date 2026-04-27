/**
 * PV/BESS Connection Validation Tests — RUN #3G §2.
 *
 * HARD CONTRACT: PV/BESS NIGDY bez transformatora.
 *
 * Coverage:
 * - Rule 1: connectionVariant MUST exist
 * - Rule 2: nn_side requires stationRef + TRANSFORMER_SN_NN field
 * - Rule 3: block_transformer requires blockingTransformerRef + catalog
 * - canSavePvBessGenerator() UI gate
 * - Determinism: same input → same output (50× stability)
 * - Edge cases: non-PV/BESS generators ignored, empty inputs
 */

import { describe, it, expect } from 'vitest';
import {
  validatePvBessConnections,
  canSavePvBessGenerator,
} from '../pvBessValidation';
import type {
  PvBessConnectionInputV1,
  PvBessValidationResultV1,
} from '../pvBessValidation';
import type { StationBlockDetailV1 } from '../fieldDeviceContracts';
import { FieldRoleV1, FieldDeviceFixCodes } from '../fieldDeviceContracts';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/** Station with TRANSFORMER_SN_NN field — valid for nn_side variant */
const STATION_WITH_TR: StationBlockDetailV1 = {
  blockId: 'station_001',
  stationRef: 'station_001',
  stationType: 'transformatorowa',
  fields: [
    {
      fieldId: 'field_line_in',
      fieldRole: FieldRoleV1.LINE_IN as any,
      fieldIndex: 0,
      busSectionRef: 'bus_sn',
      devices: [],
      terminals: { upstream: 'bus_sn', downstream: null },
    },
    {
      fieldId: 'field_tr',
      fieldRole: FieldRoleV1.TRANSFORMER_SN_NN as any,
      fieldIndex: 1,
      busSectionRef: 'bus_sn',
      devices: [],
      terminals: { upstream: 'bus_sn', downstream: 'bus_nn' },
    },
  ],
  busSections: [{ busSectionId: 'bus_sn', busRef: 'bus_sn', voltage_kV: 15, sectionIndex: 0 }],
  ports: { upstream: [], downstream: [] },
};

/** Station WITHOUT transformer field — invalid for nn_side */
const STATION_NO_TR: StationBlockDetailV1 = {
  blockId: 'station_002',
  stationRef: 'station_002',
  stationType: 'rozdzielcza',
  fields: [
    {
      fieldId: 'field_line_in_2',
      fieldRole: FieldRoleV1.LINE_IN as any,
      fieldIndex: 0,
      busSectionRef: 'bus_sn_2',
      devices: [],
      terminals: { upstream: 'bus_sn_2', downstream: null },
    },
  ],
  busSections: [{ busSectionId: 'bus_sn_2', busRef: 'bus_sn_2', voltage_kV: 15, sectionIndex: 0 }],
  ports: { upstream: [], downstream: [] },
};

/** Valid PV with nn_side variant */
const PV_NN_SIDE_VALID: PvBessConnectionInputV1 = {
  generatorId: 'gen_pv_01',
  generatorType: 'PV',
  connectionVariant: 'nn_side',
  stationRef: 'station_001',
  blockingTransformerRef: null,
  blockingTransformerHasCatalog: false,
};

/** Valid BESS with block_transformer variant */
const BESS_BLOCK_TR_VALID: PvBessConnectionInputV1 = {
  generatorId: 'gen_bess_01',
  generatorType: 'BESS',
  connectionVariant: 'block_transformer',
  stationRef: null,
  blockingTransformerRef: 'block_tr_01',
  blockingTransformerHasCatalog: true,
};

const PV_LV_BEHIND_STATION_VALID: PvBessConnectionInputV1 = {
  generatorId: 'gen_pv_lv_01',
  generatorType: 'PV',
  connectionVariant: 'LV_BEHIND_STATION_TRANSFORMER',
  stationRef: 'station_001',
  blockingTransformerRef: null,
  blockingTransformerHasCatalog: false,
};

const BESS_DEDICATED_MV_VALID: PvBessConnectionInputV1 = {
  generatorId: 'gen_bess_mv_01',
  generatorType: 'BESS',
  connectionVariant: 'DEDICATED_MV_CONNECTION',
  stationRef: null,
  blockingTransformerRef: 'block_tr_04',
  blockingTransformerHasCatalog: true,
};

const PV_SOURCE_STATION_VALID: PvBessConnectionInputV1 = {
  generatorId: 'gen_pv_source_station_01',
  generatorType: 'PV',
  connectionVariant: 'SOURCE_CONNECTION_STATION',
  stationRef: 'station_001',
  blockingTransformerRef: null,
  blockingTransformerHasCatalog: false,
};

/** PV with no connection variant — FORBIDDEN */
const PV_NO_VARIANT: PvBessConnectionInputV1 = {
  generatorId: 'gen_pv_02',
  generatorType: 'PV',
  connectionVariant: null,
  stationRef: null,
  blockingTransformerRef: null,
  blockingTransformerHasCatalog: false,
};

/** PV nn_side missing stationRef */
const PV_NN_NO_STATION: PvBessConnectionInputV1 = {
  generatorId: 'gen_pv_03',
  generatorType: 'PV',
  connectionVariant: 'nn_side',
  stationRef: null,
  blockingTransformerRef: null,
  blockingTransformerHasCatalog: false,
};

/** PV nn_side pointing to station without TR field */
const PV_NN_STATION_NO_TR: PvBessConnectionInputV1 = {
  generatorId: 'gen_pv_04',
  generatorType: 'PV',
  connectionVariant: 'nn_side',
  stationRef: 'station_002',
  blockingTransformerRef: null,
  blockingTransformerHasCatalog: false,
};

/** BESS block_transformer missing ref */
const BESS_BLOCK_NO_REF: PvBessConnectionInputV1 = {
  generatorId: 'gen_bess_02',
  generatorType: 'BESS',
  connectionVariant: 'block_transformer',
  stationRef: null,
  blockingTransformerRef: null,
  blockingTransformerHasCatalog: false,
};

/** BESS block_transformer no catalog */
const BESS_BLOCK_NO_CATALOG: PvBessConnectionInputV1 = {
  generatorId: 'gen_bess_03',
  generatorType: 'BESS',
  connectionVariant: 'block_transformer',
  stationRef: null,
  blockingTransformerRef: 'block_tr_02',
  blockingTransformerHasCatalog: false,
};

/** pv_inverter type — should also be validated */
const PV_INVERTER_VALID: PvBessConnectionInputV1 = {
  generatorId: 'gen_pvinv_01',
  generatorType: 'pv_inverter',
  connectionVariant: 'nn_side',
  stationRef: 'station_001',
  blockingTransformerRef: null,
  blockingTransformerHasCatalog: false,
};

/** bess type — should also be validated */
const BESS_LOWER_VALID: PvBessConnectionInputV1 = {
  generatorId: 'gen_bess_low_01',
  generatorType: 'bess',
  connectionVariant: 'block_transformer',
  stationRef: null,
  blockingTransformerRef: 'block_tr_03',
  blockingTransformerHasCatalog: true,
};

const ALL_STATIONS = [STATION_WITH_TR, STATION_NO_TR];

// =============================================================================
// TESTS
// =============================================================================

describe('validatePvBessConnections', () => {
  // ---------------------------------------------------------------------------
  // Rule 1: connectionVariant MUST exist
  // ---------------------------------------------------------------------------
  describe('Rule 1: connectionVariant required', () => {
    it('produces BLOCKER when connectionVariant is null', () => {
      const result = validatePvBessConnections([PV_NO_VARIANT], ALL_STATIONS);
      expect(result.valid).toBe(false);
      expect(result.fixActions).toHaveLength(1);
      expect(result.fixActions[0].code).toBe(FieldDeviceFixCodes.GENERATOR_CONNECTION_VARIANT_MISSING);
      expect(result.fixActions[0].elementId).toBe('gen_pv_02');
    });

    it('uses stable Polish message', () => {
      const result = validatePvBessConnections([PV_NO_VARIANT], ALL_STATIONS);
      expect(result.fixActions[0].message).toContain('brak wariantu przyłączenia');
    });

    it('stops validation after variant-missing (no further errors for same gen)', () => {
      const result = validatePvBessConnections([PV_NO_VARIANT], ALL_STATIONS);
      // Only 1 fixAction, not chained errors
      expect(result.fixActions).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Rule 2: nn_side variant
  // ---------------------------------------------------------------------------
  describe('Rule 2: nn_side variant', () => {
    it('PASS when station has TRANSFORMER_SN_NN field', () => {
      const result = validatePvBessConnections([PV_NN_SIDE_VALID], ALL_STATIONS);
      expect(result.valid).toBe(true);
      expect(result.fixActions).toHaveLength(0);
    });

    it('PASS for canonical LV_BEHIND_STATION_TRANSFORMER when station has transformer field', () => {
      const result = validatePvBessConnections([PV_LV_BEHIND_STATION_VALID], ALL_STATIONS);
      expect(result.valid).toBe(true);
      expect(result.fixActions).toHaveLength(0);
    });

    it('FAIL when stationRef is missing', () => {
      const result = validatePvBessConnections([PV_NN_NO_STATION], ALL_STATIONS);
      expect(result.valid).toBe(false);
      expect(result.fixActions[0].code).toBe(FieldDeviceFixCodes.GENERATOR_STATION_REF_MISSING);
      expect(result.fixActions[0].elementId).toBe('gen_pv_03');
    });

    it('FAIL when station exists but has no transformer field', () => {
      const result = validatePvBessConnections([PV_NN_STATION_NO_TR], ALL_STATIONS);
      expect(result.valid).toBe(false);
      expect(result.fixActions[0].code).toBe(FieldDeviceFixCodes.GENERATOR_NN_VARIANT_REQUIRES_STATION_TR);
      expect(result.fixActions[0].elementId).toBe('gen_pv_04');
    });

    it('FAIL when stationRef points to non-existent station', () => {
      const gen: PvBessConnectionInputV1 = {
        ...PV_NN_SIDE_VALID,
        generatorId: 'gen_pv_ghost',
        stationRef: 'station_nonexistent',
      };
      const result = validatePvBessConnections([gen], ALL_STATIONS);
      expect(result.valid).toBe(false);
      expect(result.fixActions[0].code).toBe(FieldDeviceFixCodes.GENERATOR_NN_VARIANT_REQUIRES_STATION_TR);
    });
  });

  // ---------------------------------------------------------------------------
  // Rule 3: block_transformer variant
  // ---------------------------------------------------------------------------
  describe('Rule 3: block_transformer variant', () => {
    it('PASS when blockingTransformerRef exists and has catalog', () => {
      const result = validatePvBessConnections([BESS_BLOCK_TR_VALID], ALL_STATIONS);
      expect(result.valid).toBe(true);
      expect(result.fixActions).toHaveLength(0);
    });

    it('PASS for canonical DEDICATED_MV_CONNECTION when transformer ref and catalog exist', () => {
      const result = validatePvBessConnections([BESS_DEDICATED_MV_VALID], ALL_STATIONS);
      expect(result.valid).toBe(true);
      expect(result.fixActions).toHaveLength(0);
    });

    it('FAIL when blockingTransformerRef is missing', () => {
      const result = validatePvBessConnections([BESS_BLOCK_NO_REF], ALL_STATIONS);
      expect(result.valid).toBe(false);
      expect(result.fixActions[0].code).toBe(FieldDeviceFixCodes.GENERATOR_BLOCK_VARIANT_REQUIRES_BLOCK_TR);
      expect(result.fixActions[0].elementId).toBe('gen_bess_02');
    });

    it('FAIL when blockingTransformerRef exists but no catalog', () => {
      const result = validatePvBessConnections([BESS_BLOCK_NO_CATALOG], ALL_STATIONS);
      expect(result.valid).toBe(false);
      expect(result.fixActions[0].code).toBe(FieldDeviceFixCodes.GENERATOR_BLOCK_TR_MISSING);
      expect(result.fixActions[0].elementId).toBe('gen_bess_03');
    });
  });

  describe('Rule 4: SOURCE_CONNECTION_STATION variant', () => {
    it('PASS when source station exists and has transformer field', () => {
      const result = validatePvBessConnections([PV_SOURCE_STATION_VALID], ALL_STATIONS);
      expect(result.valid).toBe(true);
      expect(result.fixActions).toHaveLength(0);
    });

    it('FAIL when source station reference is missing', () => {
      const gen: PvBessConnectionInputV1 = {
        ...PV_SOURCE_STATION_VALID,
        generatorId: 'gen_pv_source_station_missing',
        stationRef: null,
      };
      const result = validatePvBessConnections([gen], ALL_STATIONS);
      expect(result.valid).toBe(false);
      expect(result.fixActions[0].code).toBe(FieldDeviceFixCodes.GENERATOR_STATION_REF_MISSING);
    });
  });

  // ---------------------------------------------------------------------------
  // Generator type coverage
  // ---------------------------------------------------------------------------
  describe('Generator type coverage', () => {
    it('validates pv_inverter type (lowercase)', () => {
      const result = validatePvBessConnections([PV_INVERTER_VALID], ALL_STATIONS);
      expect(result.valid).toBe(true);
    });

    it('validates bess type (lowercase)', () => {
      const result = validatePvBessConnections([BESS_LOWER_VALID], ALL_STATIONS);
      expect(result.valid).toBe(true);
    });

    it('skips non-PV/BESS generators', () => {
      const nonPvBess: PvBessConnectionInputV1 = {
        generatorId: 'gen_diesel_01',
        generatorType: 'PV', // Override below
        connectionVariant: null,
        stationRef: null,
        blockingTransformerRef: null,
        blockingTransformerHasCatalog: false,
      };
      // Cast to any to test non-PV/BESS type
      const diesel = { ...nonPvBess, generatorType: 'DIESEL' as any };
      const result = validatePvBessConnections([diesel], ALL_STATIONS);
      expect(result.valid).toBe(true);
      expect(result.fixActions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-generator scenarios
  // ---------------------------------------------------------------------------
  describe('Multi-generator', () => {
    it('validates all generators independently', () => {
      const result = validatePvBessConnections(
        [PV_NN_SIDE_VALID, BESS_BLOCK_TR_VALID],
        ALL_STATIONS,
      );
      expect(result.valid).toBe(true);
      expect(result.generatorCount).toBe(2);
    });

    it('collects errors from multiple generators', () => {
      const result = validatePvBessConnections(
        [PV_NO_VARIANT, BESS_BLOCK_NO_REF, PV_NN_STATION_NO_TR],
        ALL_STATIONS,
      );
      expect(result.valid).toBe(false);
      expect(result.fixActions).toHaveLength(3);
      expect(result.generatorCount).toBe(3);

      // Each error references the correct generator
      const ids = result.fixActions.map(fa => fa.elementId);
      expect(ids).toContain('gen_pv_02');
      expect(ids).toContain('gen_bess_02');
      expect(ids).toContain('gen_pv_04');
    });

    it('mixed valid + invalid returns valid=false', () => {
      const result = validatePvBessConnections(
        [PV_NN_SIDE_VALID, PV_NO_VARIANT],
        ALL_STATIONS,
      );
      expect(result.valid).toBe(false);
      expect(result.fixActions).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('Edge cases', () => {
    it('returns valid=true for empty generators array', () => {
      const result = validatePvBessConnections([], ALL_STATIONS);
      expect(result.valid).toBe(true);
      expect(result.fixActions).toHaveLength(0);
      expect(result.generatorCount).toBe(0);
    });

    it('returns valid=true for empty stations (block_transformer only)', () => {
      const result = validatePvBessConnections([BESS_BLOCK_TR_VALID], []);
      expect(result.valid).toBe(true);
    });

    it('nn_side fails with empty stations array', () => {
      const result = validatePvBessConnections([PV_NN_SIDE_VALID], []);
      expect(result.valid).toBe(false);
      expect(result.fixActions[0].code).toBe(FieldDeviceFixCodes.GENERATOR_NN_VARIANT_REQUIRES_STATION_TR);
    });
  });

  // ---------------------------------------------------------------------------
  // FixAction message quality
  // ---------------------------------------------------------------------------
  describe('FixAction messages (Polish, stable)', () => {
    it('all fixActions have elementId set', () => {
      const gens = [PV_NO_VARIANT, PV_NN_NO_STATION, PV_NN_STATION_NO_TR, BESS_BLOCK_NO_REF, BESS_BLOCK_NO_CATALOG];
      const result = validatePvBessConnections(gens, ALL_STATIONS);
      for (const fa of result.fixActions) {
        expect(fa.elementId).toBeTruthy();
      }
    });

    it('all fixActions have fixHint set', () => {
      const gens = [PV_NO_VARIANT, PV_NN_NO_STATION, BESS_BLOCK_NO_REF, BESS_BLOCK_NO_CATALOG];
      const result = validatePvBessConnections(gens, ALL_STATIONS);
      for (const fa of result.fixActions) {
        expect(fa.fixHint).toBeTruthy();
      }
    });

    it('fixAction codes are stable string constants', () => {
      expect(FieldDeviceFixCodes.GENERATOR_CONNECTION_VARIANT_MISSING).toBe('generator.connection_variant_missing');
      expect(FieldDeviceFixCodes.GENERATOR_NN_VARIANT_REQUIRES_STATION_TR).toBe('generator.nn_variant_requires_station_transformer');
      expect(FieldDeviceFixCodes.GENERATOR_BLOCK_VARIANT_REQUIRES_BLOCK_TR).toBe('generator.block_variant_requires_block_transformer');
      expect(FieldDeviceFixCodes.GENERATOR_DIRECT_SN_FORBIDDEN).toBe('generator.direct_sn_connection_forbidden');
    });
  });

  // ---------------------------------------------------------------------------
  // DETERMINISM: 50× stability
  // ---------------------------------------------------------------------------
  describe('Determinism (50× stability)', () => {
    it('same input always produces same output', () => {
      const generators = [PV_NN_SIDE_VALID, PV_NO_VARIANT, BESS_BLOCK_TR_VALID, BESS_BLOCK_NO_CATALOG];
      const first = validatePvBessConnections(generators, ALL_STATIONS);
      const firstJson = JSON.stringify(first);

      for (let i = 0; i < 50; i++) {
        const result = validatePvBessConnections(generators, ALL_STATIONS);
        expect(JSON.stringify(result)).toBe(firstJson);
      }
    });
  });
});

// =============================================================================
// canSavePvBessGenerator
// =============================================================================

describe('canSavePvBessGenerator', () => {
  it('canSave=true for valid nn_side generator', () => {
    const { canSave, blockerMessage } = canSavePvBessGenerator(PV_NN_SIDE_VALID, ALL_STATIONS);
    expect(canSave).toBe(true);
    expect(blockerMessage).toBeNull();
  });

  it('canSave=true for valid block_transformer generator', () => {
    const { canSave, blockerMessage } = canSavePvBessGenerator(BESS_BLOCK_TR_VALID, ALL_STATIONS);
    expect(canSave).toBe(true);
    expect(blockerMessage).toBeNull();
  });

  it('canSave=false with message for no variant', () => {
    const { canSave, blockerMessage } = canSavePvBessGenerator(PV_NO_VARIANT, ALL_STATIONS);
    expect(canSave).toBe(false);
    expect(blockerMessage).toBeTruthy();
    expect(blockerMessage).toContain('brak wariantu');
  });

  it('canSave=false with message for missing stationRef', () => {
    const { canSave, blockerMessage } = canSavePvBessGenerator(PV_NN_NO_STATION, ALL_STATIONS);
    expect(canSave).toBe(false);
    expect(blockerMessage).toContain('brak referencji stacji');
  });

  it('canSave=false with message for station without TR', () => {
    const { canSave, blockerMessage } = canSavePvBessGenerator(PV_NN_STATION_NO_TR, ALL_STATIONS);
    expect(canSave).toBe(false);
    expect(blockerMessage).toContain('nie ma pola transformatorowego');
  });

  it('canSave=false with message for missing block TR ref', () => {
    const { canSave, blockerMessage } = canSavePvBessGenerator(BESS_BLOCK_NO_REF, ALL_STATIONS);
    expect(canSave).toBe(false);
    expect(blockerMessage).toContain('brak transformatora blokowego');
  });

  it('canSave=false with message for block TR without catalog', () => {
    const { canSave, blockerMessage } = canSavePvBessGenerator(BESS_BLOCK_NO_CATALOG, ALL_STATIONS);
    expect(canSave).toBe(false);
    expect(blockerMessage).toContain('nie ma katalogu');
  });

  it('returns first blocker message (not all)', () => {
    // Generator with no variant — only gets variant_missing, not further errors
    const { blockerMessage } = canSavePvBessGenerator(PV_NO_VARIANT, ALL_STATIONS);
    expect(blockerMessage).toBeTruthy();
  });
});

// =============================================================================
// HARD CONTRACT: Definition of Done
// =============================================================================

describe('HARD CONTRACT: nie istnieje ścieżka PV/BESS bez transformatora', () => {
  it('PV nn_side bez transformatora w stacji → BLOCKER', () => {
    const gen: PvBessConnectionInputV1 = {
      generatorId: 'gen_hard_01',
      generatorType: 'PV',
      connectionVariant: 'nn_side',
      stationRef: 'station_002', // station_002 has no TR field
      blockingTransformerRef: null,
      blockingTransformerHasCatalog: false,
    };
    const result = validatePvBessConnections([gen], ALL_STATIONS);
    expect(result.valid).toBe(false);
  });

  it('BESS block_transformer bez ref → BLOCKER', () => {
    const gen: PvBessConnectionInputV1 = {
      generatorId: 'gen_hard_02',
      generatorType: 'BESS',
      connectionVariant: 'block_transformer',
      stationRef: null,
      blockingTransformerRef: null,
      blockingTransformerHasCatalog: false,
    };
    const result = validatePvBessConnections([gen], ALL_STATIONS);
    expect(result.valid).toBe(false);
  });

  it('BESS block_transformer bez katalogu → BLOCKER', () => {
    const gen: PvBessConnectionInputV1 = {
      generatorId: 'gen_hard_03',
      generatorType: 'BESS',
      connectionVariant: 'block_transformer',
      stationRef: null,
      blockingTransformerRef: 'block_tr_x',
      blockingTransformerHasCatalog: false,
    };
    const result = validatePvBessConnections([gen], ALL_STATIONS);
    expect(result.valid).toBe(false);
  });

  it('PV bez wariantu → BLOCKER', () => {
    const gen: PvBessConnectionInputV1 = {
      generatorId: 'gen_hard_04',
      generatorType: 'PV',
      connectionVariant: null,
      stationRef: null,
      blockingTransformerRef: null,
      blockingTransformerHasCatalog: false,
    };
    const result = validatePvBessConnections([gen], ALL_STATIONS);
    expect(result.valid).toBe(false);
  });

  it('TYLKO ścieżki z transformatorem przechodzą walidację', () => {
    // Valid nn_side (station has TR)
    const r1 = validatePvBessConnections([PV_NN_SIDE_VALID], ALL_STATIONS);
    expect(r1.valid).toBe(true);

    // Valid block_transformer (has ref + catalog)
    const r2 = validatePvBessConnections([BESS_BLOCK_TR_VALID], ALL_STATIONS);
    expect(r2.valid).toBe(true);
  });
});
