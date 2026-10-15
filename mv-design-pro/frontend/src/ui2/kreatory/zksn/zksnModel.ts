/**
 * Model kreatora „Złącze kablowe SN (ZKSN)" — ui2, kreatory/rama.
 *
 * Wstawia ZKSN (rozdzielnicę kablową SN z polami) na odcinku KABLOWYM SN,
 * dzieląc go i tworząc węzeł odgałęzienia. Liczba portów odgałęzienia wynika z
 * wybranego wariantu katalogowego (branch_ports_count). Katalog-first
 * (mv_branch_points / ZKSN). Zapis = operacja domenowa
 * `insert_zksn_on_segment_sn`. Kontrakt payloadu bez zmian względem legacy
 * `InsertZksnForm`.
 */

import { normalizeCatalogBinding, normalizeSwitchState } from '../../../ui/network-build/forms/catalogPayload';

export interface ZksnFormData {
  catalog_ref: string | null;
  /** Liczba portów odgałęzienia — z wariantu katalogowego. */
  branch_ports_count: number;
  /**
   * Położenie na odcinku 0..1 (RATIO) — dzieli długość kabla, a z nią impedancje obu części,
   * więc bez wartości domyślnej (kontrakt prowadzenia projektanta, reguła 4).
   */
  polozenie: number | null;
  nazwa: string;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: ZksnFormData = {
  catalog_ref: null,
  branch_ports_count: 1,
  polozenie: null,
  nazwa: '',
};

export interface KontekstZksn {
  segment_id?: string;
  segment_label?: string;
  /** Typ odcinka z modelu — ZKSN wolno wstawić tylko na kablu SN. */
  segment_type?: string;
  /** Stan łącznika pola z kontekstu operacji (open/closed). */
  switch_state?: unknown;
  /** Położenie wskazane przez miejsce wywołania (RATIO w (0, 1)). */
  polozenie?: number;
}

export function maOdcinek(kontekst: KontekstZksn): boolean {
  return Boolean(kontekst.segment_id?.trim());
}

/**
 * Kontrola torowości: ZKSN jest rozdzielnicą toru KABLOWEGO — na linii
 * napowietrznej należy użyć słupa rozgałęźnego. Zwraca komunikat PL albo null.
 */
export function problemTorowosci(kontekst: KontekstZksn): string | null {
  if (!maOdcinek(kontekst)) return null;
  const typ = kontekst.segment_type?.trim();
  if (!typ) return null;
  if (typ !== 'cable') {
    return 'ZKSN można wstawić tylko na kablu SN. Dla linii napowietrznej wybierz słup '
      + 'rozgałęźny albo przejście kablowo-napowietrzne.';
  }
  return null;
}

/** Opis wariantu ZKSN wg liczby portów odgałęzienia. */
export function opisWariantu(branchPortsCount: number): string {
  return branchPortsCount >= 2 ? 'Odgałęźny (2 porty)' : 'Przelotowy (1 port)';
}

/** KONFLIKT_TECHNICZNY — widoczny od razu przy polu: położenie spoza odcinka. */
export function konfliktyFormularza(data: ZksnFormData): BladPola[] {
  if (data.polozenie !== null && !(data.polozenie > 0 && data.polozenie < 1)) {
    return [{ field: 'polozenie', message: 'Położenie na odcinku musi być w zakresie (0, 1).' }];
  }
  return [];
}

/** BRAK_DO_OPERACJI — w kolejności pracy; pokazywany dopiero przy zapisie. */
export function brakiFormularza(data: ZksnFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    errors.push({
      field: 'catalog_ref',
      message: 'Wybierz wariant ZKSN z katalogu — liczba portów odgałęzienia wynika z wariantu.',
    });
  }
  if (data.polozenie === null) {
    errors.push({
      field: 'polozenie',
      message:
        'Podaj położenie ZKSN na odcinku (0–1) — dzieli długość kabla, a z nią impedancje obu części.',
    });
  }
  return errors;
}

/** Komplet kontroli przed zapisem: konflikty, potem braki. */
export function walidujFormularz(data: ZksnFormData): BladPola[] {
  return [...konfliktyFormularza(data), ...brakiFormularza(data)];
}

export function zbudujPayload(
  data: ZksnFormData,
  kontekst: KontekstZksn,
): Record<string, unknown> {
  const nazwa = data.nazwa.trim() || 'ZKSN SN';
  return {
    segment_id: kontekst.segment_id?.trim(),
    name: nazwa,
    branch_ports_count: data.branch_ports_count,
    switch_state: normalizeSwitchState(kontekst.switch_state),
    insert_at: { mode: 'RATIO', value: data.polozenie },
    catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'mv_branch_points'),
  };
}

export function fmtPct01(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)} %`;
}
