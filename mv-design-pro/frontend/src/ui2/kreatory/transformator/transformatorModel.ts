/**
 * Model kreatora „Dodaj transformator SN/nN" (V12K-048, G-TRF).
 *
 * Katalog-first (TRAFO_SN_NN); prądy I1/I2 liczy backend (R2). Opcja MAX: pełna
 * konfiguracja regulacji zaczepów (DETC/OLTC) mapująca 1:1 na kanoniczny
 * TapChanger (V12K-045), którą operacja `add_transformer_sn_nn` materializuje
 * (G-TRF domknął łańcuch — wcześniej regulację dało się ustawić tylko na GPZ).
 * ZERO fizyki w UI.
 */

import { voltageMatches } from '../../../ui/network-build/forms/InsertStationFormHelpers';
import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { TransformerRatedCurrentsRequest } from '../../../ui/network-build/forms/transformerRatedCurrentsApi';
import type { TransformerType } from '../../../ui/catalog/types';

export type RegulationType = 'NONE' | 'DETC' | 'OLTC';
export type RegulatedWinding = 'HV' | 'LV';
export type ControlMode = 'MANUAL' | 'AUTOMATIC';

export interface TransformatorFormData {
  hv_bus_ref: string;
  lv_bus_ref: string;
  catalog_ref: string | null;
  /** W5-A (F-4): grupa połączeń wybrana JAWNIE ze słownika IEC 60076-1; `null` = z katalogu. */
  vector_group: string | null;
  nazwa: string;
  regulation_type: RegulationType;
  regulated_winding: RegulatedWinding;
  /**
   * Zaczepy — WYŁĄCZNIE z tabliczki wybranej pozycji katalogowej (AUTO_PRZYJETE) albo od
   * projektanta; `null` = jeszcze nieznane (dawniej stałe −9…9 × 1,25 % niezależnie od
   * transformatora — inne niż w kreatorze stacji, ±2 × 2,5 %).
   */
  tap_neutral_position: number | null;
  tap_current_position: number | null;
  tap_min_position: number | null;
  tap_max_position: number | null;
  tap_step_percent: number | null;
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
  vector_group: null,
  nazwa: '',
  regulation_type: 'NONE',
  regulated_winding: 'HV',
  tap_neutral_position: null,
  tap_current_position: null,
  tap_min_position: null,
  tap_max_position: null,
  tap_step_percent: null,
  control_mode: 'MANUAL',
  voltage_setpoint_kv: null,
  deadband_kv: null,
};

/**
 * KONFLIKT_TECHNICZNY — widoczny od razu przy polu (niezależnie od tego, czy praca jest
 * skończona): ta sama szyna po obu stronach, napięcia tabliczki niezgodne z szynami,
 * zaczep min ≥ max, krok niedodatni, napięcie zadane niedodatnie, pozycja poza zakresem.
 */
export function konfliktyFormularza(
  data: TransformatorFormData,
  params: ParametryTransformatora | null = null,
  napiecieHvKv: number | null = null,
  napiecieLvKv: number | null = null,
): BladPola[] {
  const errors: BladPola[] = [];
  if (data.hv_bus_ref && data.hv_bus_ref === data.lv_bus_ref) {
    errors.push({ field: 'lv_bus_ref', message: 'Szyna SN i nN muszą być różne.' });
  }
  if (params) {
    if (napiecieHvKv !== null && Math.abs(params.voltage_hv_kv - napiecieHvKv) > TOLERANCJA_NAPIECIA_KV) {
      errors.push({
        field: 'catalog_ref',
        message: `Napięcie górne tabliczki (${params.voltage_hv_kv} kV) nie pasuje do szyny SN (${napiecieHvKv} kV).`,
      });
    } else if (napiecieLvKv !== null && Math.abs(params.voltage_lv_kv - napiecieLvKv) > TOLERANCJA_NAPIECIA_KV) {
      errors.push({
        field: 'catalog_ref',
        message: `Napięcie dolne tabliczki (${params.voltage_lv_kv} kV) nie pasuje do szyny nN (${napiecieLvKv} kV).`,
      });
    }
  }
  if (data.regulation_type !== 'NONE') {
    const { tap_min_position: min, tap_max_position: max, tap_current_position: biezacy } = data;
    if (min !== null && max !== null && min >= max) {
      errors.push({ field: 'tap_min_position', message: 'Zaczep minimalny musi być mniejszy od maksymalnego.' });
    } else if (min !== null && max !== null && biezacy !== null && (biezacy < min || biezacy > max)) {
      errors.push({ field: 'tap_current_position', message: 'Pozycja bieżąca musi leżeć w zakresie zaczepów.' });
    }
    if (data.tap_step_percent !== null && data.tap_step_percent <= 0) {
      errors.push({ field: 'tap_step_percent', message: 'Krok zaczepu musi być dodatni.' });
    }
    if (
      data.regulation_type === 'OLTC'
      && data.control_mode === 'AUTOMATIC'
      && data.voltage_setpoint_kv !== null
      && !(data.voltage_setpoint_kv > 0)
    ) {
      errors.push({ field: 'voltage_setpoint_kv', message: 'Napięcie zadane musi być dodatnie.' });
    }
  }
  return errors;
}

/** BRAK_DO_OPERACJI — w kolejności pracy w kreatorze; pokazywany dopiero przy zapisie. */
export function brakiFormularza(data: TransformatorFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.hv_bus_ref) {
    errors.push({ field: 'hv_bus_ref', message: 'Wskaż szynę SN — do niej przyłączy się strona górnego napięcia.' });
  }
  if (!data.lv_bus_ref) {
    errors.push({ field: 'lv_bus_ref', message: 'Wskaż szynę nN — do niej przyłączy się strona dolnego napięcia.' });
  }
  if (!data.catalog_ref?.trim()) {
    errors.push({
      field: 'catalog_ref',
      message: 'Wybierz transformator z katalogu — bez tabliczki nie da się policzyć rozpływu ani zwarć.',
    });
  }
  if (data.regulation_type !== 'NONE') {
    const pola: ReadonlyArray<[keyof TransformatorFormData, string]> = [
      ['tap_min_position', 'Podaj zaczep minimalny — zakres zaczepów pochodzi z tabliczki transformatora.'],
      ['tap_max_position', 'Podaj zaczep maksymalny — zakres zaczepów pochodzi z tabliczki transformatora.'],
      ['tap_step_percent', 'Podaj krok zaczepu [%] — wyznacza zmianę przekładni na jeden zaczep.'],
      ['tap_neutral_position', 'Podaj zaczep neutralny — przy nim przekładnia jest znamionowa.'],
      ['tap_current_position', 'Podaj pozycję bieżącą zaczepu — od niej zależy przekładnia w rozpływie.'],
    ];
    for (const [pole, komunikat] of pola) {
      if (data[pole] === null) errors.push({ field: pole, message: komunikat });
    }
    if (data.regulation_type === 'OLTC' && data.control_mode === 'AUTOMATIC' && data.voltage_setpoint_kv === null) {
      errors.push({
        field: 'voltage_setpoint_kv',
        message: 'Podaj napięcie zadane regulatora — automatyka OLTC reguluje zaczep do tej wartości.',
      });
    }
  }
  return errors;
}

/** Komplet kontroli przed zapisem: konflikty (widoczne od razu), potem braki. */
export function walidujFormularz(
  data: TransformatorFormData,
  params: ParametryTransformatora | null = null,
  napiecieHvKv: number | null = null,
  napiecieLvKv: number | null = null,
): BladPola[] {
  return [...konfliktyFormularza(data, params, napiecieHvKv, napiecieLvKv), ...brakiFormularza(data)];
}

/** Tolerancja zgodności napięcia tabliczki z napięciem szyny [kV]. */
const TOLERANCJA_NAPIECIA_KV = 0.01;

/** Czy tabliczka pasuje napięciowo do szyn (nieznane napięcie szyny nie wyklucza). */
export function tabliczkaZgodnaZSzynami(
  typ: Pick<TransformerType, 'voltage_hv_kv' | 'voltage_lv_kv'>,
  napiecieHvKv: number | null,
  napiecieLvKv: number | null,
): boolean {
  // Ten sam predykat zgodności napięcia, którym kreator stacji dobiera transformatory
  // (`voltageMatches`) — jedno źródło porównania tabliczki z szyną.
  return (
    (napiecieHvKv === null || voltageMatches(typ.voltage_hv_kv, napiecieHvKv, TOLERANCJA_NAPIECIA_KV))
    && (napiecieLvKv === null || voltageMatches(typ.voltage_lv_kv, napiecieLvKv, TOLERANCJA_NAPIECIA_KV))
  );
}

export interface ParametryTransformatora {
  rated_power_mva: number;
  voltage_hv_kv: number;
  voltage_lv_kv: number;
  uk_percent: number;
  /** Grupa połączeń z rekordu katalogu (`null`, gdy rekord jej nie deklaruje). */
  vector_group: string | null;
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
    vector_group: typeof it.vector_group === 'string' && it.vector_group ? it.vector_group : null,
    tap_min: it.tap_min,
    tap_max: it.tap_max,
    tap_step_percent: it.tap_step_percent,
  };
}

/**
 * Zaczepy z tabliczki wybranej pozycji katalogowej (JEDNO źródło zakresu i kroku — to samo
 * w kreatorze transformatora i w kreatorze stacji). Pozycja neutralna i bieżąca: zaczep
 * znamionowy 0, gdy zakres go obejmuje (numeracja symetryczna tabliczki); inaczej `null`
 * (projektant poda). Brak pozycji katalogowej albo krok niedodatni = `null` (bez domysłu).
 */
export interface ZaczepyZTabliczki {
  tap_min_position: number;
  tap_max_position: number;
  tap_step_percent: number;
  tap_neutral_position: number | null;
  tap_current_position: number | null;
}

export function zaczepyZTabliczki(
  params: Pick<ParametryTransformatora, 'tap_min' | 'tap_max' | 'tap_step_percent'> | null,
): ZaczepyZTabliczki | null {
  if (!params || !(0 < params.tap_step_percent) || !(params.tap_min < params.tap_max)) return null;
  const znamionowy = params.tap_min <= 0 && params.tap_max >= 0 ? 0 : null;
  return {
    tap_min_position: params.tap_min,
    tap_max_position: params.tap_max,
    tap_step_percent: params.tap_step_percent,
    tap_neutral_position: znamionowy,
    tap_current_position: znamionowy,
  };
}

/** Wypełnia zaczepy z tabliczki (włączenie regulacji albo zmiana pozycji katalogowej). */
export function seedRegulacjiZKatalogu(
  data: TransformatorFormData,
  params: ParametryTransformatora | null,
): TransformatorFormData {
  const zaczepy = zaczepyZTabliczki(params);
  return zaczepy ? { ...data, ...zaczepy } : data;
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
    ...(data.vector_group ? { vector_group: data.vector_group } : {}),
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
    if (data.regulation_type === 'OLTC' && data.control_mode === 'AUTOMATIC') {
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
