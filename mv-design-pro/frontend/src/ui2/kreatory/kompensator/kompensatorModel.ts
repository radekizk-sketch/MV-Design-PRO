/**
 * Model kreatora „Dodaj baterię kondensatorów SN" (V12K-048, G-KOMP / GAP-1).
 *
 * Domyka istniejący łańcuch mocy biernej: katalog KOMPENSATOR_SN + solver PF
 * (+jB) + analiza reactive_adequacy istnieją; ta operacja to brakujący punkt
 * wejścia. ZERO fizyki w UI — susceptancję/prąd liczy backend
 * (`shunt-compensator-preview`); moc/napięcie znamionowe z katalogu.
 * Zapis = realna operacja domenowa `add_shunt_compensator_sn`.
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { ShuntCompensatorPreviewRequest } from '../../../ui/network-build/forms/shuntCompensatorPreviewApi';
import type { ShuntCapacitorCatalogType } from '../../../ui/catalog/types';

export type StatusBaterii = 'closed' | 'open';

export interface KompensatorFormData {
  catalog_ref: string | null;
  nazwa: string;
  status: StatusBaterii;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: KompensatorFormData = {
  catalog_ref: null,
  nazwa: '',
  status: 'closed',
};

export function walidujFormularz(data: KompensatorFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Wybierz typ baterii kondensatorów z katalogu.' });
  }
  return errors;
}

export interface ParametryBaterii {
  rated_mvar: number;
  rated_kv: number;
  loss_kw: number | null;
}

export function parametryZKatalogu(
  catalogRef: string | null,
  typy: readonly ShuntCapacitorCatalogType[],
): ParametryBaterii | null {
  if (!catalogRef) return null;
  const it = typy.find((t) => t.id === catalogRef);
  if (!it) return null;
  return { rated_mvar: it.rated_mvar, rated_kv: it.rated_kv, loss_kw: it.loss_kw ?? null };
}

/** Buduje żądanie podglądu (B, I_c) lub null, gdy brak parametrów. */
export function zbudujZapytaniePodgladu(
  params: ParametryBaterii | null,
): ShuntCompensatorPreviewRequest | null {
  if (!params || params.rated_mvar <= 0 || params.rated_kv <= 0) return null;
  return { rated_mvar: params.rated_mvar, rated_kv: params.rated_kv };
}

/** Kontekst operacji (z SLD/huba): szyna SN, do której dołączamy baterię. */
export interface KontekstKompensatora {
  bus_ref?: string;
  bus_name?: string;
  bus_voltage_kv?: number;
}

export function maSzyne(kontekst: KontekstKompensatora): boolean {
  return Boolean(kontekst.bus_ref?.trim());
}

/** Ostrzeżenie o niezgodności napięcia typu i szyny (backend blokuje twardo). */
export function napiecieNiezgodne(
  params: ParametryBaterii | null,
  kontekst: KontekstKompensatora,
): boolean {
  if (!params || typeof kontekst.bus_voltage_kv !== 'number' || kontekst.bus_voltage_kv <= 0) {
    return false;
  }
  return Math.abs(params.rated_kv - kontekst.bus_voltage_kv) > 0.5;
}

export function zbudujPayload(
  data: KompensatorFormData,
  kontekst: KontekstKompensatora,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status: data.status,
    catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'KOMPENSATOR_SN'),
    ...(data.nazwa.trim() ? { name: data.nazwa.trim() } : {}),
  };
  if (kontekst.bus_ref?.trim()) payload.bus_ref = kontekst.bus_ref.trim();
  return payload;
}

// ------------------------------------------------------------- Formatery

export function fmtMvar(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} Mvar` : '—';
}

export function fmtKv(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} kV` : '—';
}

export function fmtA(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(0)} A` : '—';
}

export function fmtSiemens(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${(v * 1e6).toFixed(2)} µS` : '—';
}

export function fmtKw(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} kW` : '—';
}
