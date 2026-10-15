/**
 * Model kreatora „Słup rozgałęźny SN" — ui2, kreatory/rama.
 *
 * Wstawia słup rozgałęźny (węzeł odgałęzienia) na odcinku LINII NAPOWIETRZNEJ SN,
 * dzieląc go i tworząc punkt odczepu (T-off). Byt ODRĘBNY od „Odgałęzienia SN"
 * (start_branch_segment_sn), które startuje nowy ciąg od szyny — tu wstawiamy
 * węzeł na istniejącym odcinku. Katalog-first (mv_branch_points, kategoria
 * BRANCH_POLE). Zapis = operacja domenowa `insert_branch_pole_on_segment_sn`.
 * Kontrakt payloadu bez zmian względem legacy `InsertBranchPoleForm`.
 */

import { normalizeCatalogBinding, normalizeSwitchState } from '../../../ui/network-build/forms/catalogPayload';

export interface SlupOdgaleznyFormData {
  catalog_ref: string | null;
  /**
   * Położenie na odcinku 0..1 (RATIO) — dzieli długość, a z nią impedancje obu części linii,
   * więc bez wartości domyślnej (kontrakt prowadzenia projektanta, reguła 4): z miejsca
   * wskazania (AUTO_PRZYJETE) albo jawnie od projektanta.
   */
  polozenie: number | null;
  nazwa: string;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: SlupOdgaleznyFormData = {
  catalog_ref: null,
  polozenie: null,
  nazwa: '',
};

export interface KontekstSlupa {
  segment_id?: string;
  segment_label?: string;
  /** Typ odcinka z modelu — słup wolno wstawić tylko na linii napowietrznej. */
  segment_type?: string;
  /** Stan łącznika słupa z kontekstu operacji (open/closed). */
  switch_state?: unknown;
  /** Położenie wskazane przez miejsce wywołania (RATIO w (0, 1)). */
  polozenie?: number;
}

export function maOdcinek(kontekst: KontekstSlupa): boolean {
  return Boolean(kontekst.segment_id?.trim());
}

/**
 * Kontrola torowości: słup rozgałęźny SN jest węzłem linii napowietrznej — na
 * kablu SN należy użyć ZKSN. Zwraca komunikat PL albo null, gdy odcinek pasuje.
 */
export function problemTorowosci(kontekst: KontekstSlupa): string | null {
  if (!maOdcinek(kontekst)) return null;
  const typ = kontekst.segment_type?.trim();
  if (!typ) return null;
  if (typ !== 'line_overhead') {
    return 'Słup rozgałęźny SN można wstawić tylko na linii napowietrznej SN. '
      + 'Dla kabla SN wybierz ZKSN albo stację z polem liniowym.';
  }
  return null;
}

/** KONFLIKT_TECHNICZNY — widoczny od razu przy polu: położenie spoza odcinka. */
export function konfliktyFormularza(data: SlupOdgaleznyFormData): BladPola[] {
  if (data.polozenie !== null && !(data.polozenie > 0 && data.polozenie < 1)) {
    return [{ field: 'polozenie', message: 'Położenie na odcinku musi być w zakresie (0, 1).' }];
  }
  return [];
}

/** BRAK_DO_OPERACJI — w kolejności pracy; pokazywany dopiero przy zapisie. */
export function brakiFormularza(data: SlupOdgaleznyFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    errors.push({
      field: 'catalog_ref',
      message:
        'Wybierz typ słupa rozgałęźnego z katalogu — łącznik słupa i liczba odczepów wynikają z typu.',
    });
  }
  if (data.polozenie === null) {
    errors.push({
      field: 'polozenie',
      message:
        'Podaj położenie słupa na odcinku (0–1) — dzieli długość linii, a z nią impedancje obu części.',
    });
  }
  return errors;
}

/** Komplet kontroli przed zapisem: konflikty, potem braki. */
export function walidujFormularz(data: SlupOdgaleznyFormData): BladPola[] {
  return [...konfliktyFormularza(data), ...brakiFormularza(data)];
}

export function zbudujPayload(
  data: SlupOdgaleznyFormData,
  kontekst: KontekstSlupa,
): Record<string, unknown> {
  const nazwa = data.nazwa.trim() || 'Słup rozgałęźny SN';
  return {
    segment_id: kontekst.segment_id?.trim(),
    name: nazwa,
    switch_state: normalizeSwitchState(kontekst.switch_state),
    insert_at: { mode: 'RATIO', value: data.polozenie },
    catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'mv_branch_points'),
  };
}

export function fmtPct01(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)} %`;
}
