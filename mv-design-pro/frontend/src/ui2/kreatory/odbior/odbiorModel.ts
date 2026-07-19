/**
 * Model kreatora „Dodaj odbiór nN" (V12K-050, G-NN).
 *
 * Odbiór na odpływie nN. Katalog OBCIAZENIE opcjonalny (dopuszczalny tryb ręczny).
 * ZERO fizyki w UI — prąd/moc pozorną liczy backend (R1: cable-rated-current);
 * moc bierną Q wyprowadza operacja domenowa z cosφ (P·tan(arccos cosφ)), gdy Q
 * nie podano jawnie. Zapis = operacja domenowa `add_nn_load`.
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { CableRatedCurrentRequest } from '../../../ui/network-build/forms/cableVoltageDropApi';
import type { LoadCatalogType } from '../../../ui/catalog/types';

export type LoadKind = 'SKUPIONY' | 'ROZPROSZONY';
export type ConnectionType = 'TROJFAZOWY' | 'JEDNOFAZOWY';

export interface OdbiorFormData {
  catalog_ref: string | null;
  nazwa: string;
  active_power_kw: number | null;
  cos_phi: number;
  /** Jawny override mocy biernej [kvar]; gdy null — backend wyprowadzi z cosφ. */
  reactive_power_kvar: number | null;
  load_kind: LoadKind;
  connection_type: ConnectionType;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: OdbiorFormData = {
  catalog_ref: null,
  nazwa: '',
  active_power_kw: 50,
  cos_phi: 0.93,
  reactive_power_kvar: null,
  load_kind: 'SKUPIONY',
  connection_type: 'TROJFAZOWY',
};

function isPositive(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

export function walidujFormularz(data: OdbiorFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!isPositive(data.active_power_kw)) {
    errors.push({ field: 'active_power_kw', message: 'Moc czynna odbioru musi być dodatnia.' });
  }
  if (data.cos_phi <= 0 || data.cos_phi > 1) {
    errors.push({ field: 'cos_phi', message: 'Współczynnik mocy cosφ musi być w zakresie (0, 1].' });
  }
  return errors;
}

/** Prefill z katalogu odbioru (opcjonalny). */
export function prefillZKatalogu(
  data: OdbiorFormData,
  catalogRef: string | null,
  typy: readonly LoadCatalogType[],
): OdbiorFormData {
  const it = catalogRef ? typy.find((t) => t.id === catalogRef) : undefined;
  if (!it) return { ...data, catalog_ref: catalogRef };
  return {
    ...data,
    catalog_ref: catalogRef,
    active_power_kw: isPositive(it.p_kw) ? it.p_kw : data.active_power_kw,
    cos_phi: typeof it.cos_phi === 'number' && it.cos_phi > 0 ? it.cos_phi : data.cos_phi,
    reactive_power_kvar: typeof it.q_kvar === 'number' ? it.q_kvar : data.reactive_power_kvar,
  };
}

/** Buduje żądanie podglądu prądu (R1 cable-rated-current) lub null. */
export function zbudujZapytaniePodgladu(
  data: OdbiorFormData,
  napiecie_v: number,
): CableRatedCurrentRequest | null {
  if (!isPositive(data.active_power_kw) || data.cos_phi <= 0 || !isPositive(napiecie_v)) {
    return null;
  }
  return {
    active_power_kw: data.active_power_kw,
    cos_phi: data.cos_phi,
    line_voltage_v: napiecie_v,
  };
}

export interface KontekstOdbioru {
  feeder_ref?: string;
  bus_nn_ref?: string;
  feeder_name?: string;
  bus_voltage_kv?: number;
}

export function maOdplyw(kontekst: KontekstOdbioru): boolean {
  return Boolean(kontekst.feeder_ref?.trim());
}

export function zbudujPayload(
  data: OdbiorFormData,
  kontekst: KontekstOdbioru,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    active_power_kw: data.active_power_kw,
    cos_phi: data.cos_phi,
    load_kind: data.load_kind,
    connection_type: data.connection_type,
    ...(data.nazwa.trim() ? { load_name: data.nazwa.trim() } : {}),
    ...(isPositive(data.reactive_power_kvar) ? { reactive_power_kvar: data.reactive_power_kvar } : {}),
    ...(data.catalog_ref?.trim()
      ? { catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'OBCIAZENIE') }
      : {}),
  };
  if (kontekst.feeder_ref?.trim()) payload.feeder_ref = kontekst.feeder_ref.trim();
  if (kontekst.bus_nn_ref?.trim()) payload.bus_nn_ref = kontekst.bus_nn_ref.trim();
  return payload;
}

// ------------------------------------------------------------- Formatery

export function fmtA(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} A` : '—';
}

export function fmtKva(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} kVA` : '—';
}

export function fmtKw(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} kW` : '—';
}
