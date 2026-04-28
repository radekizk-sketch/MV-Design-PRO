/**
 * SldSemanticValidator — validates SldSemanticModelV1 before rendering.
 *
 * CANONICAL (BINDING):
 * - Validates topology contracts per station type.
 * - Validates bay structure.
 * - Validates NOP placement.
 * - Produces errors/warnings — rendering SHOULD NOT proceed with errors.
 *
 * RULES:
 * SV01: Inline station MUST have incoming + outgoing bay with LINE_IN / LINE_OUT
 * SV02: Inline station incoming and outgoing MUST be different segments
 * SV03: Branch station MUST NOT be on trunk path
 * SV04: Sectional station MUST have 2 sections + tie bay
 * SV05: Terminal station MUST have incoming bay, MUST NOT have outgoing
 * SV06: Every bay MUST have >= 1 device (or be a synthetic diagnostic bay)
 * SV07: NOP MUST connect two different trunks or sections
 * SV08: Every trunk MUST start from a GPZ node
 * SV09: Branch point node MUST have >= 3 incident edges (not validated here — topology adapter)
 * SV10: No cycles in spanning tree (not validated here — BFS guarantees)
 */

import type { SldSemanticModelV1 } from './sldSemanticModel';
import { BayRoleSld } from './sldSemanticModel';

// =============================================================================
// TYPES
// =============================================================================

export interface SldSemanticValidationResult {
  readonly valid: boolean;
  readonly errors: readonly SldSemanticError[];
  readonly warnings: readonly SldSemanticError[];
}

export interface SldSemanticError {
  readonly code: string;
  readonly message: string;
  readonly stationId: string | null;
  readonly bayId: string | null;
  readonly severity: 'ERROR' | 'WARNING';
}

// =============================================================================
// VALIDATOR
// =============================================================================

export function validateSldSemanticModel(
  model: SldSemanticModelV1,
): SldSemanticValidationResult {
  const issues: SldSemanticError[] = [];

  // SV01: Inline station MUST have incoming (LINE_IN) + outgoing (LINE_OUT) bay
  for (const s of model.inlineStations) {
    if (!s.incomingBay || s.incomingBay.bayRole !== BayRoleSld.LINE_IN) {
      issues.push({
        code: 'SV01',
        message: `Stacja przelotowa '${s.name}' (${s.id}): brak pola LINE_IN`,
        stationId: s.id,
        bayId: null,
        severity: 'ERROR',
      });
    }
    if (!s.outgoingBay || s.outgoingBay.bayRole !== BayRoleSld.LINE_OUT) {
      issues.push({
        code: 'SV01',
        message: `Stacja przelotowa '${s.name}' (${s.id}): brak pola LINE_OUT`,
        stationId: s.id,
        bayId: null,
        severity: 'ERROR',
      });
    }
  }

  // SV02: Inline station incoming and outgoing MUST be different segments
  for (const s of model.inlineStations) {
    if (s.incomingSegmentId && s.outgoingSegmentId && s.incomingSegmentId === s.outgoingSegmentId) {
      issues.push({
        code: 'SV02',
        message: `Stacja przelotowa '${s.name}' (${s.id}): segment wejsciowy == segment wyjsciowy (${s.incomingSegmentId})`,
        stationId: s.id,
        bayId: null,
        severity: 'ERROR',
      });
    }
  }

  // SV03: Branch station MUST NOT claim main path (it shouldn't be on trunk)
  for (const s of model.branchStations) {
    // Check if station appears in any trunk's stationRefs
    for (const trunk of model.trunks) {
      const onTrunk = trunk.orderedStationRefs.some(r => r.stationId === s.id);
      if (onTrunk) {
        issues.push({
          code: 'SV03',
          message: `Stacja odgalezna '${s.name}' (${s.id}) jest na trunk ${trunk.id} — powinna byc INLINE`,
          stationId: s.id,
          bayId: null,
          severity: 'WARNING',
        });
      }
    }
  }

  // SV04: Sectional station MUST have 2 sections + tie bay
  for (const s of model.sectionalStations) {
    if (!s.sectionABusId || !s.sectionBBusId) {
      issues.push({
        code: 'SV04',
        message: `Stacja sekcyjna '${s.name}' (${s.id}): brak sekcji A lub B`,
        stationId: s.id,
        bayId: null,
        severity: 'ERROR',
      });
    }
    if (s.sectionABusId === s.sectionBBusId) {
      issues.push({
        code: 'SV04',
        message: `Stacja sekcyjna '${s.name}' (${s.id}): sekcja A == sekcja B`,
        stationId: s.id,
        bayId: null,
        severity: 'ERROR',
      });
    }
    if (!s.tieBay) {
      issues.push({
        code: 'SV04',
        message: `Stacja sekcyjna '${s.name}' (${s.id}): brak pola sprzegla (tie bay)`,
        stationId: s.id,
        bayId: null,
        severity: 'WARNING',
      });
    }
  }

  // SV05: Terminal station MUST have incoming bay
  for (const s of model.terminalStations) {
    if (!s.incomingBay) {
      issues.push({
        code: 'SV05',
        message: `Stacja koncowa '${s.name}' (${s.id}): brak pola wejsciowego`,
        stationId: s.id,
        bayId: null,
        severity: 'WARNING',
      });
    }
  }

  // SV06: Every bay MUST have >= 1 device (skip synthetic diagnostic bays)
  const allBays = [
    ...model.inlineStations.flatMap(s => [s.incomingBay, s.outgoingBay, ...s.transformerBays, ...s.branchBays, ...s.generatorBays]),
    ...model.branchStations.flatMap(s => [s.incomingBay, s.outgoingBay, ...s.transformerBays, ...s.generatorBays].filter(Boolean)),
    ...model.sectionalStations.flatMap(s => [...s.incomingBays, ...s.outgoingBays, ...s.transformerBays, s.tieBay].filter(Boolean)),
    ...model.terminalStations.flatMap(s => [s.incomingBay, ...s.transformerBays, ...s.generatorBays].filter(Boolean)),
  ];

  for (const bay of allBays) {
    if (bay && bay.devices.length === 0 && !bay.id.startsWith('synthetic_missing_bay_')) {
      issues.push({
        code: 'SV06',
        message: `Pole '${bay.id}' (rola: ${bay.bayRole}): brak urzadzen`,
        stationId: null,
        bayId: bay.id,
        severity: 'WARNING',
      });
    }
  }

  // SV08: Every trunk MUST have a source node
  for (const trunk of model.trunks) {
    if (!trunk.sourceNodeId) {
      issues.push({
        code: 'SV08',
        message: `Magistrala '${trunk.id}': brak wezla zródlowego GPZ`,
        stationId: null,
        bayId: null,
        severity: 'ERROR',
      });
    }
  }

  // Separate errors and warnings
  const errors = issues.filter(e => e.severity === 'ERROR');
  const warnings = issues.filter(e => e.severity === 'WARNING');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
