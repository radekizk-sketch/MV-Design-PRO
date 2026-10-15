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
  /**
   * Rodzaj aparatu — przyjmowany z wybranej pozycji katalogowej (`device_kind`), edytowalny.
   * `null` = jeszcze nie wybrano (BRAK_DO_OPERACJI przy zapisie, nigdy domysł).
   */
  switch_type: SwitchType | null;
  normal_state: NormalState;
  /**
   * Położenie na odcinku 0..1 (RATIO). Dzieli długość odcinka, a z nią impedancje obu
   * sekcji — więc NIE ma wartości domyślnej (kontrakt prowadzenia projektanta, reguła 4):
   * z miejsca wskazania na schemacie (AUTO_PRZYJETE) albo jawnie od projektanta.
   */
  polozenie: number | null;
  nazwa: string;
}

export interface BladPola {
  field: string;
  message: string;
}

/**
 * Stan startowy. Stan normalny `closed` NIE jest zgadywaną wartością fizyczną: łącznik
 * sekcyjny z definicji pracuje normalnie zamknięty, a punkt podziału (NOP) jest jawną
 * decyzją projektanta w tym samym kroku.
 */
export const DANE_DOMYSLNE: LacznikFormData = {
  catalog_ref: null,
  switch_type: null,
  normal_state: 'closed',
  polozenie: null,
  nazwa: '',
};

/** Rodzaje aparatu katalogu APARAT_SN, które są rodzajem łącznika sekcyjnego. */
export const RODZAJE_LACZNIKA: readonly SwitchType[] = ['ROZLACZNIK', 'WYLACZNIK', 'ODLACZNIK'];

/** Rodzaj łącznika wynikający z pozycji katalogowej albo `null` (pozycja innego rodzaju). */
export function rodzajZKatalogu(deviceKind: string | null | undefined): SwitchType | null {
  return deviceKind && (RODZAJE_LACZNIKA as readonly string[]).includes(deviceKind)
    ? (deviceKind as SwitchType)
    : null;
}

/**
 * KONFLIKT_TECHNICZNY — widoczny od razu, przy polu (niezależnie od tego, czy praca jest
 * skończona): położenie spoza odcinka, rodzaj aparatu niezgodny z pozycją katalogową.
 */
export function konfliktyFormularza(
  data: LacznikFormData,
  deviceKindKatalogu: string | null = null,
): BladPola[] {
  const errors: BladPola[] = [];
  if (data.polozenie !== null && !(data.polozenie > 0 && data.polozenie < 1)) {
    errors.push({ field: 'polozenie', message: 'Położenie na odcinku musi być w zakresie (0, 1).' });
  }
  const zKatalogu = rodzajZKatalogu(deviceKindKatalogu);
  if (data.switch_type && zKatalogu && data.switch_type !== zKatalogu) {
    errors.push({
      field: 'switch_type',
      message: 'Rodzaj aparatu różni się od rodzaju wybranej pozycji katalogowej — wybierz zgodny.',
    });
  }
  return errors;
}

/** BRAK_DO_OPERACJI — w kolejności pracy w kreatorze; pokazywany dopiero przy zapisie. */
export function brakiFormularza(data: LacznikFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    errors.push({
      field: 'catalog_ref',
      message:
        'Wybierz aparat łącznika z katalogu SN — jego prąd znamionowy i zdolność łączeniowa '
        + 'wchodzą do oceny obciążalności i zwarć.',
    });
  }
  if (!data.switch_type) {
    errors.push({
      field: 'switch_type',
      message:
        'Wybierz rodzaj aparatu — od niego zależy, czy łącznik przerywa prąd zwarciowy.',
    });
  }
  if (data.polozenie === null) {
    errors.push({
      field: 'polozenie',
      message:
        'Podaj położenie łącznika na odcinku (0–1) — dzieli długość, a z nią impedancje obu sekcji.',
    });
  }
  return errors;
}

/** Komplet kontroli przed zapisem: konflikty (widoczne od razu), potem braki. */
export function walidujFormularz(
  data: LacznikFormData,
  deviceKindKatalogu: string | null = null,
): BladPola[] {
  return [...konfliktyFormularza(data, deviceKindKatalogu), ...brakiFormularza(data)];
}

export interface KontekstLacznika {
  segment_id?: string;
  segment_label?: string;
  /** Położenie wskazane na schemacie (RATIO 0..1), gdy kontekst je niesie. */
  polozenie?: number;
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
    switch_type: data.switch_type ?? undefined,
    normal_state: normalizeSwitchState(data.normal_state),
    catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'APARAT_SN'),
    // Kontrakt operacji `insert_section_switch_sn`: nazwa łącznika to `switch_name` (backend
    // `enm/domain_operations.py`). Dawny klucz `name` backend pomijał — wpisana nazwa znikała
    // i łącznik dostawał nazwę domyślną (kontrolka-fantom).
    ...(data.nazwa.trim() ? { switch_name: data.nazwa.trim() } : {}),
  };
}

export function fmtPct01(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)} %`;
}
