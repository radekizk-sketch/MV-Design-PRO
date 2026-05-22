/**
 * TechCard redactor — ukrywanie identyfikatorów debugowych z domyślnego widoku.
 *
 * Wycina z UI: ref_id, content_hash, input_hash, result_hash, klucze z prefiksem seg_.
 * Ekspozycja takich wartości użytkownikowi końcowemu jest błędem produktowym.
 *
 * Sekcja "Diagnostyka" w TechCard renderuje się tylko gdy
 * import.meta.env.VITE_DEV_DIAGNOSTICS === '1' (build-time, tree-shake w prod).
 */

import type { CardField } from '../network-build/cards/ObjectCard';

const RAW_ID_KEYS = new Set([
  'ref_id',
  'content_hash',
  'input_hash',
  'result_hash',
  'snapshot_hash',
  'enm_hash',
]);

const SEG_PREFIX = 'seg_';

export function isRawIdField(key: string): boolean {
  if (RAW_ID_KEYS.has(key)) return true;
  if (key.startsWith(SEG_PREFIX)) return true;
  return false;
}

export interface RedactionResult {
  visibleFields: CardField[];
  diagnosticsFields: CardField[];
}

export function redactRawIds(fields: CardField[]): RedactionResult {
  const visibleFields: CardField[] = [];
  const diagnosticsFields: CardField[] = [];
  for (const field of fields) {
    if (isRawIdField(field.key)) {
      diagnosticsFields.push(field);
    } else {
      visibleFields.push(field);
    }
  }
  return { visibleFields, diagnosticsFields };
}

export function isDiagnosticsEnabled(): boolean {
  return import.meta.env?.VITE_DEV_DIAGNOSTICS === '1';
}
