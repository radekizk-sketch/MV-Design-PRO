/**
 * Model kreatora „Dodaj transformator SN/nN" (V12K-048, G-TRF).
 *
 * Katalog-first (TRAFO_SN_NN); prądy I1/I2 liczy backend (R2). Opcja MAX: pełna
 * konfiguracja regulacji zaczepów (DETC/OLTC) mapująca 1:1 na kanoniczny
 * TapChanger (V12K-045), którą operacja `add_transformer_sn_nn` materializuje
 * (G-TRF domknął łańcuch — wcześniej regulację dało się ustawić tylko na GPZ).
 * ZERO fizyki w UI.
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { TransformerRatedCurrentsRequest } from '../../../ui/network-build/forms/transformerRatedCurrentsApi';
import type { TransformerType } from '../../../ui/catalog/types';

export type RegulationType = 'NONE' | 'DETC' | 'OLTC';
export type RegulatedWinding = 'HV' | 'LV';
export type ControlMode = 'MANUAL' | 'AUTO';

export interface TransformatorFormData {
  hv_bus_ref: string;
  lv_bus_ref: string;
  catalog_ref: string | null;
  nazwa: string;
  regulation_type: RegulationType;
  regulated_winding: RegulatedWinding;
  tap_neutral_position: number;
  tap_current_position: number;
  tap_min_position: number;
  tap_max_position: number;
  tap_step_percent: number;
  control_mode: ControlMode;
  voltage_setpoint_kv: number | null;
  deadband_kv: number | null;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: TransformatorFormData = {
  hv_bus_ref: '',
  lv_bus_ref: '',
  catalog_ref: null,
  nazwa: '',
  regulation_type: 'NONE',
  regulated_winding: 'HV',
  tap_neutral_position: 0,
  tap_current_position: 0,
  tap_min_position: -9,
  tap_max_position: 9,
  tap_step_percent: 1.25,
  control_mode: 'MANUAL',
  voltage_setpoint_kv: null,
  deadband_kv: null,
};

export function walidujFormularz(data: TransformatorFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.hv_bus_ref) errors.push({ field: 'hv_bus_ref', message: 'Wskaż szynę SN (górne napięcie).' });
  if (!data.lv_bus_ref) errors.push({ field: 'lv_bus_ref', message: 'Wskaż szynę nN (dolne napięcie).' });
  if (data.hv_bus_ref && data.hv_bus_ref === data.lv_bus_ref) {
    errors.push({ field: 'lv_bus_ref', message: 'Szyna SN i nN muszą być różne.' });
  }
  if (!data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Wybierz typ transformatora z katalogu.' });
  }
  if (data.regulation_type !== 'NONE') {
    if (data.tap_min_position >= data.tap_max_position) {
      errors.push({ field: 'tap_min_position', message: 'Zaczep minimalny musi być mniejszy od maksymalnego.' });
    }
    if (data.tap_step_percent <= 0) {
      errors.push({ field: 'tap_step_percent', message: 'Krok zaczepu musi być dodatni.' });
    }
    if (data.regulation_type === 'OLTC' && data.control_mode === 'AUTO') {
      if (!(typeof data.voltage_setpoint_kv === 'number' && data.voltage_setpoint_kv > 0)) {
        errors.push({ field: 'voltage_setpoint_kv', message: 'Regulacja automatyczna wymaga napięcia zadanego.' });
      }
    }
  }
  return errors;
}

export interface ParametryTransformatora {
  rated_power_mva: number;
  voltage_hv_kv: number;
  voltage_lv_kv: number;
  uk_percent: number;
  tap_min: number;
  tap_max: number;
  tap_step_percent: number;
}

export function parametryZKatalogu(
  catalogRef: string | null,
  typy: readonly TransformerType[],
): ParametryTransformatora | null {
  if (!catalogRef) return null;
  const it = typy.find((t) => t.id === catalogRef);
  if (!it) return null;
  return {
    rated_power_mva: it.rated_power_mva,
    voltage_hv_kv: it.voltage_hv_kv,
    voltage_lv_kv: it.voltage_lv_kv,
    uk_percent: it.uk_percent,
    tap_min: it.tap_min,
    tap_max: it.tap_max,
    tap_step_percent: it.tap_step_percent,
  };
}

/** Wypełnia zakres zaczepów z katalogu przy włączeniu regulacji. */
export function seedRegulacjiZKatalogu(
  data: TransformatorFormData,
  params: ParametryTransformatora | null,
): TransformatorFormData {
  if (!params) return data;
  return {
    ...data,
    tap_min_position: params.tap_min,
    tap_max_position: params.tap_max,
    tap_step_percent: params.tap_step_percent || data.tap_step_percent,
  };
}

/** Buduje żądanie podglądu prądów I1/I2 (R2) lub null. */
export function zbudujZapytaniePodgladu(
  params: ParametryTransformatora | null,
): TransformerRatedCurrentsRequest | null {
  if (!params || params.rated_power_mva <= 0 || params.voltage_hv_kv <= 0 || params.voltage_lv_kv <= 0) {
    return null;
  }
  return {
    rated_power_kva: params.rated_power_mva * 1000,
    primary_voltage_kv: params.voltage_hv_kv,
    secondary_voltage_kv: params.voltage_lv_kv,
  };
}

export interface KontekstTransformatora {
  hv_bus_ref?: string;
  lv_bus_ref?: string;
  station_ref?: string;
  station_name?: string;
  hv_bus_name?: string;
  lv_bus_name?: string;
  block_reason?: string;
}

export function zbudujPayload(
  data: TransformatorFormData,
  kontekst: KontekstTransformatora,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    hv_bus_ref: data.hv_bus_ref,
    lv_bus_ref: data.lv_bus_ref,
    catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'TRAFO_SN_NN'),
    ...(data.nazwa.trim() ? { name: data.nazwa.trim() } : {}),
    ...(kontekst.station_ref ? { station_ref: kontekst.station_ref } : {}),
  };
  if (data.regulation_type !== 'NONE') {
    payload.transformer_regulation_type = data.regulation_type;
    payload.transformer_regulated_winding = data.regulated_winding;
    payload.transformer_tap_neutral_position = data.tap_neutral_position;
    payload.transformer_tap_current_position = data.tap_current_position;
    payload.transformer_tap_min_position = data.tap_min_position;
    payload.transformer_tap_max_position = data.tap_max_position;
    payload.transformer_tap_step_percent = data.tap_step_percent;
    payload.transformer_control_mode = data.control_mode;
    if (data.regulation_type === 'OLTC' && data.control_mode === 'AUTO') {
      if (typeof data.voltage_setpoint_kv === 'number') {
        payload.transformer_voltage_setpoint_kv = data.voltage_setpoint_kv;
      }
      if (typeof data.deadband_kv === 'number') {
        payload.transformer_deadband_kv = data.deadband_kv;
      }
    }
  }
  return payload;
}

// ------------------------------------------------------------- Formatery

export function fmtA(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} A` : '—';
}

export function fmtMva(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} MVA` : '—';
}

export function fmtKv(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} kV` : '—';
}

export function fmtPct(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} %` : '—';
}
