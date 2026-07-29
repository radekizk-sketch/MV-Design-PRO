/**
 * Model kreatora „Łącznik sekcyjny SN" (V12K-053, G-SEK).
 *
 * Wstawia łącznik na odcinku SN (dzieli odcinek na dwie sekcje). Stan normalny
 * (zamknięty/otwarty) steruje sekcjonowaniem i punktem normalnie otwartym (NOP) —
 * rozpływ mocy honoruje go realnie (otwarty łącznik = brak gałęzi, praca radialna).
 * Katalog-first (APARAT_SN). Zapis = operacja domenowa `insert_section_switch_sn`.
 */

import { normalizeCatalogBinding, normalizeSwitchState } from '../../../ui/network-build/forms/catalogPayload';

export type SwitchType = 'ROZLACZNIK' | 'WYLACZNIK' | 'ODLACZNIK';
export type NormalState = 'closed' | 'open';

export interface LacznikFormData {
  catalog_ref: string | null;
  switch_type: SwitchType;
  normal_state: NormalState;
  /** Położenie na odcinku 0..1 (RATIO). */
  polozenie: number;
  nazwa: string;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: LacznikFormData = {
  catalog_ref: null,
  switch_type: 'ROZLACZNIK',
  normal_state: 'closed',
  polozenie: 0.5,
  nazwa: '',
};

export function walidujFormularz(data: LacznikFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Wybierz aparat łącznika z katalogu SN.' });
  }
  if (!(data.polozenie > 0 && data.polozenie < 1)) {
    errors.push({ field: 'polozenie', message: 'Położenie na odcinku musi być w zakresie (0, 1).' });
  }
  return errors;
}

export interface KontekstLacznika {
  segment_id?: string;
  segment_label?: string;
}

export function maOdcinek(kontekst: KontekstLacznika): boolean {
  return Boolean(kontekst.segment_id?.trim());
}

export function zbudujPayload(
  data: LacznikFormData,
  kontekst: KontekstLacznika,
): Record<string, unknown> {
  return {
    segment_id: kontekst.segment_id?.trim(),
    insert_at: { mode: 'RATIO', value: data.polozenie },
    switch_type: data.switch_type,
    normal_state: normalizeSwitchState(data.normal_state),
    catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'APARAT_SN'),
    ...(data.nazwa.trim() ? { name: data.nazwa.trim() } : {}),
  };
}

export function fmtPct01(v: number): string {
  return `${Math.round(v * 100)} %`;
}
