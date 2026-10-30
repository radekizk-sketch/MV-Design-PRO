/**
 * Wiersze danych katalogowych karty szczegółów przeglądarki typów — jedno miejsce, w którym
 * kategorie z dedykowaną kartą (linia, kabel, transformator, łącznik, minimum źródła
 * systemowego) zamieniają rekord z serwera na etykietę, wartość i jednostkę.
 */
import { etykietaZeSlownika } from '../../ui2/wyniki/wzorzec/slownikWyliczen';
import {
  BRAK_DANYCH_PL,
  NAZWA_RODZAJU_LACZNIKA_KATALOGU_PL,
  pradLacznikaKatalogu,
} from './pradZwarciowyKatalogu';
import type {
  CableType,
  LineType,
  SourceSystemCatalogType,
  SwitchEquipmentType,
  TransformerType,
} from './types';

export function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(3).replace(/\.?0+$/, '');
}

/**
 * Wiersz danych katalogowych karty szczegółów. Dane przychodzą z serwera i mogą nie nieść
 * pola (np. 25 typów transformatorów bez prądu jałowego i0) — brak liczby albo tekstu to
 * uczciwy stan „brak danych” bez jednostki, nigdy wyjątek renderowania (karta komunikatów,
 * commit 5: `type.i0_percent.toFixed` wywracał kartę szczegółów transformatora).
 */
export interface WierszKatalogu {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}

export function liczbaKatalogu(
  label: string,
  wartosc: number | null | undefined,
  miejsca: number,
  unit?: string,
): WierszKatalogu {
  return typeof wartosc === 'number' && Number.isFinite(wartosc)
    ? { label, value: wartosc.toFixed(miejsca), unit }
    : { label, value: BRAK_DANYCH_PL };
}

export function tekstKatalogu(label: string, wartosc: string | null | undefined): WierszKatalogu {
  return typeof wartosc === 'string' && wartosc.trim() !== ''
    ? { label, value: wartosc }
    : { label, value: BRAK_DANYCH_PL };
}

export function wierszeLinii(type: LineType): WierszKatalogu[] {
  return [
    liczbaKatalogu('Rezystancja R', type.r_ohm_per_km, 3, 'Ohm/km'),
    liczbaKatalogu('Reaktancja X', type.x_ohm_per_km, 3, 'Ohm/km'),
    liczbaKatalogu('Susceptancja B', type.b_us_per_km, 3, 'uS/km'),
    liczbaKatalogu('Prąd znamionowy', type.rated_current_a, 0, 'A'),
    liczbaKatalogu('Napięcie znamionowe', type.voltage_rating_kv, 1, 'kV'),
    tekstKatalogu('Materiał przewodu', type.conductor_material),
    liczbaKatalogu('Przekrój', type.cross_section_mm2, 0, 'mm2'),
    liczbaKatalogu('Maks. temperatura', type.max_temperature_c, 0, 'C'),
  ];
}

/**
 * CV-4.3 K7: trzy pola scenariusza MIN (warunki przyłączenia OSD) dla ZRODLO_SN —
 * „brak danych” gdy null. Dokładane OBOK generycznego panelu (Sk3/Ik3/R-X MAKS. już
 * renderują tamtędy).
 */
export function wierszeZrodlaSystemowegoMin(type: SourceSystemCatalogType): WierszKatalogu[] {
  const liczba = (label: string, wartosc: number | null | undefined, unit?: string) =>
    typeof wartosc === 'number' && Number.isFinite(wartosc)
      ? { label, value: formatNumber(wartosc), unit }
      : { label, value: BRAK_DANYCH_PL };
  return [
    liczba('Moc zwarciowa Sk3 min', type.sk3_min_mva, 'MVA'),
    liczba('Prąd zwarciowy Ik3 min', type.ik3_min_ka, 'kA'),
    liczba('Stosunek R/X min', type.rx_ratio_min),
  ];
}

export function wierszeKabla(type: CableType): WierszKatalogu[] {
  return [
    liczbaKatalogu('Rezystancja R', type.r_ohm_per_km, 3, 'Ohm/km'),
    liczbaKatalogu('Reaktancja X', type.x_ohm_per_km, 3, 'Ohm/km'),
    liczbaKatalogu('Pojemność C', type.c_nf_per_km, 0, 'nF/km'),
    liczbaKatalogu('Prąd znamionowy', type.rated_current_a, 0, 'A'),
    liczbaKatalogu('Napięcie znamionowe', type.voltage_rating_kv, 1, 'kV'),
    tekstKatalogu('Izolacja', type.insulation_type),
    tekstKatalogu('Materiał przewodu', type.conductor_material),
    liczbaKatalogu('Przekrój', type.cross_section_mm2, 0, 'mm2'),
  ];
}

export function wierszeTransformatora(type: TransformerType): WierszKatalogu[] {
  const zaczepy =
    Number.isInteger(type.tap_min) && Number.isInteger(type.tap_max)
      ? { label: 'Zakres zaczepów', value: `${type.tap_min} … ${type.tap_max}` }
      : { label: 'Zakres zaczepów', value: BRAK_DANYCH_PL };
  return [
    liczbaKatalogu('Moc znamionowa', type.rated_power_mva, 1, 'MVA'),
    liczbaKatalogu('Napięcie HV', type.voltage_hv_kv, 1, 'kV'),
    liczbaKatalogu('Napięcie LV', type.voltage_lv_kv, 1, 'kV'),
    liczbaKatalogu('uk', type.uk_percent, 2, '%'),
    liczbaKatalogu('Straty zwarcia Pk', type.pk_kw, 1, 'kW'),
    liczbaKatalogu('Prąd jałowy i0', type.i0_percent, 2, '%'),
    liczbaKatalogu('Straty jałowe P0', type.p0_kw, 1, 'kW'),
    tekstKatalogu('Grupa połączeń', type.vector_group),
    tekstKatalogu('Chłodzenie', type.cooling_class),
    zaczepy,
    liczbaKatalogu('Krok zaczepu', type.tap_step_percent, 2, '%'),
  ];
}

export function wierszeLacznika(type: SwitchEquipmentType): WierszKatalogu[] {
  const rekord = type as unknown as Record<string, unknown>;
  // Brak liczby prądu: „nie dotyczy” (rodzaj aparatu tej wielkości nie ma) albo „brak
  // danych” (wielkość właściwa rodzajowi, karta jej nie podaje) — rozstrzyga rodzaj.
  const prad = (label: string, pole: 'ik_ka' | 'icw_ka'): WierszKatalogu => {
    const wartosc = type[pole];
    return typeof wartosc === 'number' && Number.isFinite(wartosc)
      ? { label, value: wartosc.toFixed(1), unit: 'kA' }
      : { label, value: pradLacznikaKatalogu(rekord, pole) };
  };
  return [
    {
      label: 'Rodzaj aparatu',
      value:
        typeof type.equipment_kind === 'string' && type.equipment_kind !== ''
          ? etykietaZeSlownika(NAZWA_RODZAJU_LACZNIKA_KATALOGU_PL, type.equipment_kind)
          : BRAK_DANYCH_PL,
    },
    liczbaKatalogu('Napięcie znamionowe', type.un_kv, 1, 'kV'),
    liczbaKatalogu('Prąd znamionowy', type.in_a, 0, 'A'),
    prad('Prąd wyłączalny Ik', 'ik_ka'),
    prad('Prąd wytrzymałości Icw', 'icw_ka'),
    tekstKatalogu('Ośrodek gaszący', type.medium),
  ];
}
