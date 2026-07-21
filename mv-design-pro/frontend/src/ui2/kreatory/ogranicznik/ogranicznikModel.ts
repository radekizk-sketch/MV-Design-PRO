/**
 * Model kreatora „Dodaj ogranicznik przepięć SN" (V12K-085, G-STK-8) — SPD.
 *
 * Domyka stronę konfiguracyjną GAP-2: aparat trafia na field_spec pola przez
 * operację domenową `add_surge_arrester_sn`, skąd czytają go OBAJ konsumenci —
 * read-model pola (glif SLD `surge_arrester_10ka`) oraz most koordynacji
 * izolacji IEC 60071 (`build_v126_insulation_from_enm`, margines BIL).
 * Katalog-first (OGRANICZNIK_SN); ZERO fizyki w UI — parametry z karty katalogu,
 * margines BIL liczy solver w analizie koordynacji izolacji.
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { SurgeArresterCatalogType } from '../../../ui/catalog/types';

export interface OgranicznikFormData {
  catalog_ref: string | null;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: OgranicznikFormData = {
  catalog_ref: null,
};

export function walidujFormularz(data: OgranicznikFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Wybierz typ ogranicznika przepięć z katalogu.' });
  }
  return errors;
}

export interface ParametryOgranicznika {
  u_m_kv: number;
  mcov_kv: number;
  u_residual_at_10ka_kv: number;
  energy_class: number;
  bil_protected_kv: number;
}

export function parametryZKatalogu(
  catalogRef: string | null,
  typy: readonly SurgeArresterCatalogType[],
): ParametryOgranicznika | null {
  if (!catalogRef) return null;
  const it = typy.find((t) => t.id === catalogRef);
  if (!it) return null;
  return {
    u_m_kv: it.u_m_kv,
    mcov_kv: it.mcov_kv,
    u_residual_at_10ka_kv: it.u_residual_at_10ka_kv,
    energy_class: it.energy_class,
    bil_protected_kv: it.bil_protected_kv,
  };
}

/** Kontekst operacji (z SLD/huba): pole SN lub szyna SN, gdzie stawiamy ogranicznik. */
export interface KontekstOgranicznika {
  field_ref?: string;
  field_name?: string;
  bus_ref?: string;
  bus_name?: string;
  bus_voltage_kv?: number;
}

/** Miejsce postawienia znane, gdy wskazano pole lub szynę. */
export function maMiejsce(kontekst: KontekstOgranicznika): boolean {
  return Boolean(kontekst.field_ref?.trim() || kontekst.bus_ref?.trim());
}

/** Ostrzeżenie o niezgodności U_m ogranicznika z napięciem szyny (informacyjnie). */
export function napiecieNiezgodne(
  params: ParametryOgranicznika | null,
  kontekst: KontekstOgranicznika,
): boolean {
  if (!params || typeof kontekst.bus_voltage_kv !== 'number' || kontekst.bus_voltage_kv <= 0) {
    return false;
  }
  // U_m ogranicznika musi pokrywać napięcie znamionowe szyny (U_m ≥ U_n).
  return params.u_m_kv + 1e-6 < kontekst.bus_voltage_kv;
}

export function zbudujPayload(
  data: OgranicznikFormData,
  kontekst: KontekstOgranicznika,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'OGRANICZNIK_SN'),
  };
  if (kontekst.field_ref?.trim()) payload.field_ref = kontekst.field_ref.trim();
  if (kontekst.bus_ref?.trim()) payload.bus_ref = kontekst.bus_ref.trim();
  return payload;
}

// ------------------------------------------------------------- Formatery

export function fmtKv(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} kV` : '—';
}

export function fmtKlasa(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `Klasa ${v}` : '—';
}
