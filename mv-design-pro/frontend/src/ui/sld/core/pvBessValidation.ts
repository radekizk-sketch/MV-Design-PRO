/**
 * PV/BESS Connection Validation — RUN #3G §2.
 *
 * HARD CONTRACT: PV/BESS NIGDY bez transformatora.
 *
 * Wariant A (nn_side): PV/BESS po stronie nN stacji → stacja MUSI miec
 *   pole TRANSFORMER_SN_NN z katalogiem.
 * Wariant B (block_transformer): PV/BESS do SN → MUSI istniećtransformator
 *   blokowy z referencją i katalogiem.
 *
 * Brak wariantu (connectionVariant=null): ZABRONIONE → FixAction BLOCKER.
 * Bezpośrednie podłączenie PV/BESS do SN bez transformatora: ZABRONIONE.
 *
 * DETERMINISTIC: same input → same output.
 * BINDING: Polish FixAction messages, stable codes.
 */

import type {
  StationBlockDetailV1,
  FieldDeviceFixActionV1,
} from './fieldDeviceContracts';

import {
  FieldRoleV1,
  FieldDeviceFixCodes,
} from './fieldDeviceContracts';
import {
  type SourceConnectionVariantInputV1,
  isDedicatedMvConnectionVariant,
  isLvBehindStationTransformerVariant,
  isSourceConnectionStationVariant,
} from './sourceConnectionVariant';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Generator connection data for PV/BESS validation.
 */
export interface PvBessConnectionInputV1 {
  /** Stable generator ID */
  readonly generatorId: string;
  /** Generator type */
  readonly generatorType: 'PV' | 'BESS' | 'pv_inverter' | 'bess';
  /** Connection variant: nn_side or block_transformer (null = forbidden) */
  readonly connectionVariant: SourceConnectionVariantInputV1 | null;
  /** Station ref (required for nn_side) */
  readonly stationRef: string | null;
  /** Blocking transformer ref (required for block_transformer) */
  readonly blockingTransformerRef: string | null;
  /** Whether blocking transformer has catalog assigned */
  readonly blockingTransformerHasCatalog: boolean;
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface PvBessValidationResultV1 {
  /** Whether all PV/BESS connections are valid */
  readonly valid: boolean;
  /** FixActions for invalid connections (all BLOCKER severity) */
  readonly fixActions: readonly FieldDeviceFixActionV1[];
  /** Number of generators validated */
  readonly generatorCount: number;
}

// ---------------------------------------------------------------------------
// Core validation function
// ---------------------------------------------------------------------------

/**
 * Validate PV/BESS generator connections against hard transformer contract.
 *
 * RULES:
 * 1. connectionVariant MUST be present (nn_side or block_transformer)
 * 2. nn_side: stationRef MUST be present AND station MUST have TRANSFORMER_SN_NN field
 * 3. block_transformer: blockingTransformerRef MUST be present AND have catalog
 * 4. Direct SN connection without transformer: FORBIDDEN
 *
 * @returns PvBessValidationResultV1 with fixActions (all BLOCKER)
 */
export function validatePvBessConnections(
  generators: readonly PvBessConnectionInputV1[],
  stationBlocks: readonly StationBlockDetailV1[],
): PvBessValidationResultV1 {
  const fixActions: FieldDeviceFixActionV1[] = [];

  for (const gen of generators) {
    // Only validate PV/BESS generators
    const isPvBess = gen.generatorType === 'PV' || gen.generatorType === 'BESS'
      || gen.generatorType === 'pv_inverter' || gen.generatorType === 'bess';
    if (!isPvBess) continue;

    // Rule 1: connectionVariant must exist
    if (gen.connectionVariant === null) {
      fixActions.push({
        code: FieldDeviceFixCodes.GENERATOR_CONNECTION_VARIANT_MISSING,
        message: `Generator ${gen.generatorId}: brak wariantu przyłączenia (nn_side lub block_transformer)`,
        elementId: gen.generatorId,
        fixHint: 'Wybierz wariant przyłączenia PV/BESS w kreatorze (K6)',
      });
      continue;
    }

    // Rule 2: Variant A (nn_side)
    if (
      isLvBehindStationTransformerVariant(gen.connectionVariant)
      || isSourceConnectionStationVariant(gen.connectionVariant)
    ) {
      if (!gen.stationRef) {
        fixActions.push({
          code: FieldDeviceFixCodes.GENERATOR_STATION_REF_MISSING,
          message: `Generator ${gen.generatorId}: brak referencji stacji dla wariantu nn_side`,
          elementId: gen.generatorId,
          fixHint: 'Przypisz stację z transformatorem SN/nN do generatora',
        });
      } else {
        // Check station has TRANSFORMER_SN_NN field
        const stationBlock = stationBlocks.find(b => b.blockId === gen.stationRef);
        const hasTransformerField = stationBlock?.fields.some(
          f => f.fieldRole === FieldRoleV1.TRANSFORMER_SN_NN,
        ) ?? false;

        if (!hasTransformerField) {
          fixActions.push({
            code: FieldDeviceFixCodes.GENERATOR_NN_VARIANT_REQUIRES_STATION_TR,
            message: `Generator ${gen.generatorId}: stacja ${gen.stationRef} nie ma pola transformatorowego SN/nN`,
            elementId: gen.generatorId,
            fixHint: 'Dodaj pole TRANSFORMER_SN_NN do stacji lub zmień wariant na block_transformer',
          });
        }
      }
    }

    // Rule 3: Variant B (block_transformer)
    if (isDedicatedMvConnectionVariant(gen.connectionVariant)) {
      if (!gen.blockingTransformerRef) {
        fixActions.push({
          code: FieldDeviceFixCodes.GENERATOR_BLOCK_VARIANT_REQUIRES_BLOCK_TR,
          message: `Generator ${gen.generatorId}: brak transformatora blokowego dla wariantu block_transformer`,
          elementId: gen.generatorId,
          fixHint: 'Dodaj transformator blokowy i przypisz referencję do generatora',
        });
      } else if (!gen.blockingTransformerHasCatalog) {
        fixActions.push({
          code: FieldDeviceFixCodes.GENERATOR_BLOCK_TR_MISSING,
          message: `Generator ${gen.generatorId}: transformator blokowy ${gen.blockingTransformerRef} nie ma katalogu`,
          elementId: gen.generatorId,
          fixHint: 'Przypisz katalog do transformatora blokowego',
        });
      }
    }
  }

  return {
    valid: fixActions.length === 0,
    fixActions,
    generatorCount: generators.length,
  };
}

/**
 * Check if a single PV/BESS generator can be saved.
 *
 * This is a UI-level gate: returns false if the generator would produce BLOCKERs.
 * Used by the wizard to block the save button.
 */
export function canSavePvBessGenerator(
  gen: PvBessConnectionInputV1,
  stationBlocks: readonly StationBlockDetailV1[],
): { canSave: boolean; blockerMessage: string | null } {
  const result = validatePvBessConnections([gen], stationBlocks);
  if (result.valid) {
    return { canSave: true, blockerMessage: null };
  }
  return {
    canSave: false,
    blockerMessage: result.fixActions[0]?.message ?? 'Konfiguracja PV/BESS jest niepoprawna',
  };
}
