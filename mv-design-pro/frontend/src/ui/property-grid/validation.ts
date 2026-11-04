/**
 * Property Grid Validation Rules (Client-side Syntactic)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md § D.4: Inline validation
 * - AGENTS.md: Frontend = NOT-A-SOLVER (no physics calculations)
 *
 * Karta JEDNA-SCIEZKA-EDYCJI: walidacja pola siatki to walidacja JEGO definicji w rejestrze pól
 * (`ui2/model/rejestrPol.ts`) — ta sama, której używa karta odcinka SN, konfigurator stacji
 * i kreator edycji parametrów. Dawna tablica reguł tego pliku dublowała definicje z innymi
 * granicami (długość ≤ 500 km tu, > 0 m w kreatorze magistrali, brak walidacji w karcie
 * odcinka) i trzymała reguły dla kluczy, których siatka nie edytuje (końce odcinka, parametry
 * znamionowe łącznika wpisane w kod) — skasowana. Pole spoza rejestru nie jest edytowalne
 * (siatka pokazuje je jako odczyt), więc nie ma czego walidować.
 *
 * Walidacja semantyczna i fizyczna pozostaje w backendzie (operacja domenowa odmawia
 * kodem błędu, np. zakres zaczepu `transformer.tap_changer_invalid`).
 */

import type { PropertyField, ValidationMessage } from '../types';
import { definicjaPolaSiatki } from '../../ui2/model/rejestrPol';

export interface ValidationResult {
  valid: boolean;
  message?: string;
  code?: string;
  severity?: 'ERROR' | 'WARNING';
}

/** Kod odmowy walidacji składniowej pola rejestru. */
export const KOD_ODMOWY_REJESTRU = 'E-VAL-01';

/**
 * Validate a single field value — reguła z definicji rejestru pól.
 */
export function validateField(
  elementType: string,
  field: PropertyField,
  value: unknown
): ValidationResult {
  const definicja = definicjaPolaSiatki(elementType, field.key);
  if (!definicja) return { valid: true };
  const odmowa = definicja.waliduj(value);
  if (odmowa === null) return { valid: true };
  return { valid: false, message: odmowa, code: KOD_ODMOWY_REJESTRU, severity: 'ERROR' };
}

/**
 * Validate all editable instance fields for an element.
 */
export function validateElement(
  elementType: string,
  fields: PropertyField[]
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  for (const field of fields) {
    if (!field.editable || field.source !== 'instance') {
      continue;
    }

    const result = validateField(elementType, field, field.value);
    if (!result.valid && result.message) {
      messages.push({
        code: result.code ?? KOD_ODMOWY_REJESTRU,
        severity: result.severity ?? 'ERROR',
        message: result.message,
        field: field.key,
      });
    }
  }

  return messages;
}

/**
 * Get validation rules for a field (for display purposes).
 */
export function getFieldValidationRules(elementType: string, fieldKey: string): string[] {
  return definicjaPolaSiatki(elementType, fieldKey) ? ['Walidacja syntaktyczna'] : [];
}

export default { validateField, validateElement, getFieldValidationRules };
