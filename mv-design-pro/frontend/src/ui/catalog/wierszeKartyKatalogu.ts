/**
 * Wiersze danych katalogowych karty szczegółów przeglądarki typów — jedno miejsce, w którym
 * kategorie z dedykowaną kartą (linia, kabel, transformator, łącznik, minimum źródła
 * systemowego) zamieniają rekord z serwera na etykietę, wartość i jednostkę.
 */
import { BRAK_DANYCH_PL, pradLacznikaKatalogu } from './pradZwarciowyKatalogu';
import { nazwaWartosciKodowej } from './wartosciKodoweKarty';
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

/** Wiersz pola kodowego karty: nazwa z jednego słownika wartości kodowych, nie kod. */
export function kodKatalogu(label: string, pole: string, wartosc: string | null | undefined): WierszKatalogu {
  return typeof wartosc === 'string' && wartosc.trim() !== ''
    ? { label, value: nazwaWartosciKodowej(pole, wartosc) }
    : { label, value: BRAK_DANYCH_PL };
}

export function wierszeLinii(type: LineType): WierszKatalogu[] {
  return [
    liczbaKatalogu('Rezystancja R', type.r_ohm_per_km, 3, 'Ohm/km'),
    liczbaKatalogu('Reaktancja X', type.x_ohm_per_km, 3, 'Ohm/km'),
    liczbaKatalogu('Susceptancja B', type.b_us_per_km, 3, 'uS/km'),
    liczbaKatalogu('Prąd znamionowy', type.rated_current_a, 0, 'A'),
    liczbaKatalogu('Napięcie znamionowe', type.voltage_rating_kv, 1, 'kV'),
    kodKatalogu('Materiał przewodu', 'conductor_material', type.conductor_material),
    liczbaKatalogu('Przekrój', type.cross_section_mm2, 0, 'mm²'),
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
    liczba("Moc zwarciowa minimalna $S''_{k3,min}$", type.sk3_min_mva, 'MVA'),
    liczba("Prąd zwarciowy minimalny $I''_{k3,min}$", type.ik3_min_ka, 'kA'),
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
    kodKatalogu('Izolacja', 'insulation_type', type.insulation_type),
    kodKatalogu('Materiał przewodu', 'conductor_material', type.conductor_material),
    liczbaKatalogu('Przekrój', type.cross_section_mm2, 0, 'mm²'),
  ];
}

/**
 * Impedancja zerowa na fazę po stronie SN — wiersze wyłącznie dla pozycji, które ją wysyłają
 * (transformator uziemiający ZNyn11: droga prądu zerowego zespołu uziemiającego). Wartość
 * robocza pozycji typowej (`wartosci_robocze`, jakość ESTIMATED — zasada nr 4) jest nazwana
 * w etykiecie, a jej podstawa stoi w osobnym wierszu; dana producenta — bez dopisku.
 */
function wierszeImpedancjiZerowej(type: TransformerType): WierszKatalogu[] {
  if (type.r0_ohm == null && type.x0_ohm == null) return [];
  const robocze = type.wartosci_robocze ?? {};
  const etykieta = (nazwa: string, klucz: 'r0_ohm' | 'x0_ohm') =>
    robocze[klucz] ? `${nazwa} (wartość robocza)` : nazwa;
  const podstawy = [...new Set([robocze.r0_ohm, robocze.x0_ohm].filter((p): p is string => !!p))];
  return [
    liczbaKatalogu(etykieta('Rezystancja zerowa $R_0$', 'r0_ohm'), type.r0_ohm, 3, 'Ω'),
    liczbaKatalogu(etykieta('Reaktancja zerowa $X_0$', 'x0_ohm'), type.x0_ohm, 3, 'Ω'),
    ...podstawy.map((podstawa) => ({ label: 'Podstawa wartości roboczej $Z_0$', value: podstawa })),
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
    liczbaKatalogu('Napięcie zwarcia $u_k$', type.uk_percent, 2, '%'),
    liczbaKatalogu('Straty zwarcia $P_k$', type.pk_kw, 1, 'kW'),
    liczbaKatalogu('Prąd jałowy $i_0$', type.i0_percent, 2, '%'),
    liczbaKatalogu('Straty jałowe $P_0$', type.p0_kw, 1, 'kW'),
    kodKatalogu('Grupa połączeń', 'vector_group', type.vector_group),
    tekstKatalogu('Chłodzenie', type.cooling_class),
    zaczepy,
    liczbaKatalogu('Krok zaczepu', type.tap_step_percent, 2, '%'),
    ...wierszeImpedancjiZerowej(type),
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
    kodKatalogu('Rodzaj aparatu', 'equipment_kind', type.equipment_kind),
    liczbaKatalogu('Napięcie znamionowe', type.un_kv, 1, 'kV'),
    liczbaKatalogu('Prąd znamionowy', type.in_a, 0, 'A'),
    prad('Prąd wyłączalny $I_k$', 'ik_ka'),
    prad('Prąd wytrzymałości $I_{cw}$', 'icw_ka'),
    tekstKatalogu('Ośrodek gaszący', type.medium),
  ];
}
