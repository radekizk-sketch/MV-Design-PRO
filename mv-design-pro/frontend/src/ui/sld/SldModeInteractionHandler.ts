/**
 * SLD Mode Interaction Handler — K30-17 click-to-config dispatch.
 *
 * Resolves what should happen when an element is clicked, based on:
 *   - Current operational mode (NORMALNY / SERVICE / FAULT / REVIEW)
 *   - Element type (station, bay, switch, transformer, branch, source, load)
 *
 * Returns ClickActionResult { action, payload? } to the caller (SLDView).
 *
 * **Actions:**
 *   - SELECT      — standard selection (NORMALNY default)
 *   - OPEN_CONFIG — open StationConfigurator / element editor
 *   - TOGGLE_SERVICE — toggle in-service state (SERVICE mode + switch)
 *   - SET_FAULT_BUS — mark bus as fault location (FAULT mode + bus)
 *   - NONE        — ignore click (read-only mode, wrong element type)
 */

import type { OperationalMode } from './operationalModeStore';

export type ElementType =
  | 'bus'
  | 'branch'
  | 'transformer'
  | 'switch'
  | 'station'
  | 'source'
  | 'load'
  | 'der'
  | 'branch_point'
  | 'unknown';

export type ClickAction =
  | 'SELECT'
  | 'OPEN_CONFIG'
  | 'TOGGLE_SERVICE'
  | 'SET_FAULT_BUS'
  | 'NONE';

export interface ClickActionInput {
  readonly elementId: string;
  readonly elementType: ElementType | string;
}

export interface ClickActionResult {
  readonly action: ClickAction;
  readonly elementId: string;
  readonly elementType: string;
  readonly reason?: string;
}

const SWITCH_TYPES = new Set(['switch', 'breaker', 'disconnector', 'load_switch']);
const BUS_TYPES = new Set(['bus', 'busbar']);

/**
 * Resolve click action based on operational mode + element type.
 *
 * NORMALNY: default selection (SELECT)
 * SERVICE: TOGGLE_SERVICE for switches/breakers, NONE otherwise
 * FAULT: SET_FAULT_BUS for buses, NONE otherwise
 * REVIEW: SELECT only (read-only)
 */
export function resolveClickAction(
  mode: OperationalMode,
  input: ClickActionInput,
): ClickActionResult {
  const { elementId, elementType } = input;
  const typeNormalized = String(elementType).toLowerCase();

  if (mode === 'REVIEW') {
    return {
      action: 'SELECT',
      elementId,
      elementType: typeNormalized,
      reason: 'Tryb przeglądu — tylko selekcja',
    };
  }

  if (mode === 'SERVICE') {
    if (SWITCH_TYPES.has(typeNormalized)) {
      return {
        action: 'TOGGLE_SERVICE',
        elementId,
        elementType: typeNormalized,
      };
    }
    return {
      action: 'NONE',
      elementId,
      elementType: typeNormalized,
      reason: 'Tryb przełączania: kliknij łącznik aby przełączyć',
    };
  }

  if (mode === 'FAULT') {
    if (BUS_TYPES.has(typeNormalized)) {
      return {
        action: 'SET_FAULT_BUS',
        elementId,
        elementType: typeNormalized,
      };
    }
    return {
      action: 'NONE',
      elementId,
      elementType: typeNormalized,
      reason: 'Tryb zwarcia: kliknij szynę aby ustawić punkt zwarcia',
    };
  }

  // NORMALNY (default)
  return {
    action: 'SELECT',
    elementId,
    elementType: typeNormalized,
  };
}
