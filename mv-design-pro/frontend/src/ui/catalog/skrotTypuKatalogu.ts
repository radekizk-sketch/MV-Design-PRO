/**
 * SKRÓT PARAMETRÓW POZYCJI KATALOGU — jedna funkcja dla wykazu przeglądarki typów
 * (`TypeLibraryBrowser`) i okna wyboru typu (`TypePicker`).
 *
 * Wcześniej każde z tych miejsc miało własny skrót tych samych pozycji: inne pola (kabel nN —
 * napięcie albo liczba żył), inny zapis braku (`—` albo `-`), surowy kod rodzaju łącznika
 * punktu rozgałęzienia (`ROZLACZNIK`) i ciche przyjęcie „fazowy” dla przewodu linii 110 kV
 * o przeznaczeniu spoza dwóch znanych. Teraz: liczba — `formatNumber`, brak — jeden znak braku
 * (`MISSING_DASH`, pełna nazwa „brak danych” w `title` komórki), wartość kodowa — nazwa
 * z jednego słownika (`wartosciKodoweKarty.ts`), wielkość zwarciowa aparatu — rozróżnienie
 * „nie dotyczy” / „brak danych” (`pradZwarciowyKatalogu.ts`).
 */
import type { CatalogListItem } from './api';
import type { BranchPointCatalogType, TypeCategory } from './types';
import {
  pradAparatuSnKatalogu,
  pradKaLubBrakDanych,
  pradLacznikaKatalogu,
} from './pradZwarciowyKatalogu';
import { nazwaWartosciKodowej } from './wartosciKodoweKarty';
import { formatNumber } from './wierszeKartyKatalogu';
import { MISSING_DASH } from '../shared/formatPolishValue';

/** Wartość skrótu: liczba sformatowana, tekst wprost, brak — znak braku. */
function w(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value) : MISSING_DASH;
  if (typeof value === 'boolean') return value ? 'tak' : 'nie';
  if (typeof value === 'string' && value.trim() !== '') return value;
  return MISSING_DASH;
}

/** Wartość pola kodowego skrótu: kod — nazwa z jednego słownika; inna wartość jak `w`. */
function k(pole: string, value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? nazwaWartosciKodowej(pole, value) : w(value);
}

function liczba(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** Skrót parametrów pozycji katalogu kategorii przeglądarki. */
export function skrotParametrowTypu(type: CatalogListItem, category: TypeCategory): string {
  const r = type as unknown as Record<string, unknown>;
  switch (category) {
    case 'LINE':
      return `R=${w(r.r_ohm_per_km)} Ohm/km · X=${w(r.x_ohm_per_km)} Ohm/km · $I_n$ = ${w(r.rated_current_a)} A`;
    case 'HV_OVERHEAD_CONDUCTOR':
      return `${w(r.oznaczenie)} · ${k('przeznaczenie', r.przeznaczenie)} · $R_{20}$ = ${w(r.r20_dc_ohm_per_km)} Ohm/km · d=${w(r.srednica_mm)} mm`;
    case 'CABLE':
      return `R=${w(r.r_ohm_per_km)} Ohm/km · X=${w(r.x_ohm_per_km)} Ohm/km · C=${w(r.c_nf_per_km)} nF/km · $I_n$ = ${w(r.rated_current_a)} A`;
    case 'TRANSFORMER':
      return `${w(r.rated_power_mva)} MVA · ${w(r.voltage_hv_kv)}/${w(r.voltage_lv_kv)} kV · $u_k$ = ${w(r.uk_percent)}%`;
    case 'SWITCH_EQUIPMENT':
      return `${w(r.un_kv)} kV · ${w(r.in_a)} A · $I_k$ ${pradLacznikaKatalogu(r, 'ik_ka')}`;
    case 'SYSTEM_SOURCE':
      return `${w(r.voltage_rating_kv)} kV · $S''_{k3}$ = ${w(r.sk3_mva)} MVA · R/X=${w(r.rx_ratio)}`;
    case 'MV_APPARATUS':
      return `${w(r.u_n_kv)} kV · ${w(r.i_n_a)} A · $I_k$ ${pradAparatuSnKatalogu(r, 'breaking_capacity_ka')}`;
    case 'LV_APPARATUS':
      return `${w(r.u_n_kv)} kV · ${w(r.i_n_a)} A · $I_k$ ${pradKaLubBrakDanych(r.breaking_capacity_ka)}`;
    case 'LV_RCD':
      return `$I_{\\Delta n}$ = ${w(r.i_delta_n_a)} A · typ ${k('rcd_type', r.rcd_type)} · $I_n$ = ${w(r.in_a)} A · $t_a$ = ${w(r.t_a_s)} s`;
    case 'LV_CABLE':
      return `${w(r.u_n_kv)} kV · ${w(r.cross_section_mm2)} mm² · ${w(r.number_of_cores)} żył · ${w(r.i_max_a)} A`;
    case 'LOAD':
      return `P=${w(r.p_kw)} kW · $\\cos\\varphi$ = ${w(r.cos_phi)} (${k('cos_phi_mode', r.cos_phi_mode)}) · model=${w(r.model)}`;
    case 'CT':
      return `${w(r.ratio_primary_a)}/${w(r.ratio_secondary_a)} A · klasa=${w(r.accuracy_class)}`;
    case 'VT':
      return `${w(r.ratio_primary_v)}/${w(r.ratio_secondary_v)} V · klasa=${w(r.accuracy_class)}`;
    case 'MEASUREMENT_TRANSFORMER':
      // Kategoria złożona = CT ∪ VT (`fetchTypesByCategory`); serwer wysyła przekładnię
      // prądową wyłącznie w pozycji przekładnika prądowego (wyrocznia `pola_kart_katalogu`).
      return 'ratio_primary_a' in r
        ? `Przekładnik prądowy · ${skrotParametrowTypu(type, 'CT')}`
        : `Przekładnik napięciowy · ${skrotParametrowTypu(type, 'VT')}`;
    case 'PV_INVERTER':
      return `$S_n$ = ${w(r.s_n_kva)} kVA · $P_{max}$ = ${w(r.p_max_kw)} kW · sterowanie: ${k('control_mode', r.control_mode)}`;
    case 'BESS_INVERTER':
      return `rozładowanie ${w(r.p_discharge_kw)} kW · ładowanie ${w(r.p_charge_kw)} kW · energia ${w(r.e_kwh)} kWh`;
    case 'CONVERTER':
      // Kategoria złożona = PV ∪ BESS (`fetchTypesByCategory`); pojemność energii serwer
      // wysyła wyłącznie w pozycji magazynu (wyrocznia `pola_kart_katalogu`).
      return 'e_kwh' in r
        ? `Falownik magazynu energii · ${skrotParametrowTypu(type, 'BESS_INVERTER')}`
        : `Falownik PV · ${skrotParametrowTypu(type, 'PV_INVERTER')}`;
    case 'PROTECTION_DEVICE':
      return `${w(r.vendor ?? r.manufacturer)} · ${w(r.series)} · funkcje=${liczba(r.functions_supported)} · krzywe=${liczba(r.curves_supported)}`;
    case 'BRANCH_POLE':
    case 'ZKSN': {
      // Parametry punktu serwer wysyła w `params` pozycji (`{id, name, params}`).
      const p = ((type as BranchPointCatalogType).params ?? {}) as unknown as Record<string, unknown>;
      return `${k('switch_device_kind', p.switch_device_kind)} · ${w(p.switch_rated_current_a)} A · porty odgałęzienia=${w(p.branch_ports_count)}`;
    }
    default:
      return 'Brak zdefiniowanego skrótu parametrów.';
  }
}
