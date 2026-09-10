/**
 * Model kreatora „Wyprowadź magistralę SN" (V12K-047, G-MAG).
 *
 * Krok flow po GPZ: prowadzi ciąg SN (odcinek kabla/linii) z pola odpływowego.
 * ZERO fizyki w UI — ΔU i prąd liczy backend (R1: cable-voltage-drop-preview);
 * parametry R/X/Iznam pochodzą z katalogu. Zapis = realna operacja domenowa
 * `continue_trunk_segment_sn` (kontrakt zachowany 1:1 z retirowanego ContinueTrunkForm),
 * po zapisie flow łańcuchuje realną KOLEJNĄ operację (następny krok).
 */

import { normalizeCatalogBinding, normalizeSegmentNamespace } from '../../../ui/network-build/forms/catalogPayload';
import type { CableVoltageDropRequest } from '../../../ui/network-build/forms/cableVoltageDropApi';
import type { TrunkBranchKind } from '../../../ui/network-build/semanticValidator';
import type { TrunkNextStep } from '../../../ui/network-build/trunkContinuation';
import type { CableType, LineType } from '../../../ui/catalog/types';

export type RodzajOdcinka = 'KABEL' | 'LINIA';

export interface MagistralaFormData {
  rodzaj: RodzajOdcinka;
  catalog_ref: string | null;
  dlugosc_m: number | null;
  nazwa: string;
  /** Prąd obciążenia do podglądu ΔU [A] (domyślnie prąd znamionowy wybranego typu). */
  prad_a: number | null;
  cos_phi: number;
  /** Napięcie międzyfazowe ciągu [kV] — z kontekstu GPZ, domyślnie 15. */
  napiecie_kv: number;
  /** Następny krok flow po zapisie (realna operacja domenowa). */
  next_step: TrunkNextStep;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: MagistralaFormData = {
  rodzaj: 'KABEL',
  catalog_ref: null,
  dlugosc_m: 500,
  nazwa: '',
  prad_a: null,
  cos_phi: 0.95,
  napiecie_kv: 15,
  next_step: 'station',
};

/**
 * Eksportowana (S9-5, `karta_e2e_s95.md`): reużyta wprost przez komponent
 * kreatora do sygnału gotowości zapisu — jedno źródło prawdy dla walidacji
 * przy zapisie (`walidujFormularz`) i dla bramki `disabled`/`data-status`,
 * zamiast duplikować ten sam warunek dwoma niezależnymi wyrażeniami.
 */
export function isPositive(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Rodzaj kreatora → kanoniczny segment_kind kontraktu domenowego. */
export function segmentKindZRodzaju(rodzaj: RodzajOdcinka): 'KABEL' | 'LINIA_NAPOWIETRZNA' {
  return rodzaj === 'LINIA' ? 'LINIA_NAPOWIETRZNA' : 'KABEL';
}

/** Rodzaj kreatora → typ gałęzi walidacji semantycznej. */
export function branchKindZRodzaju(rodzaj: RodzajOdcinka): TrunkBranchKind {
  return rodzaj === 'LINIA' ? 'overhead_line_sn' : 'cable_sn';
}

/** Słup rozgałęźny wymaga odcinka napowietrznego SN. */
export function nextStepDozwolony(step: TrunkNextStep, rodzaj: RodzajOdcinka): boolean {
  if (step === 'branch_pole') return rodzaj === 'LINIA';
  return true;
}

export function walidujFormularz(data: MagistralaFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Wybierz typ odcinka z katalogu (kabel lub linia).' });
  }
  if (!isPositive(data.dlugosc_m)) {
    errors.push({ field: 'dlugosc_m', message: 'Długość odcinka musi być dodatnia.' });
  }
  if (data.cos_phi <= 0 || data.cos_phi > 1) {
    errors.push({ field: 'cos_phi', message: 'Współczynnik mocy cosφ musi być w zakresie (0, 1].' });
  }
  if (!nextStepDozwolony(data.next_step, data.rodzaj)) {
    errors.push({
      field: 'next_step',
      message: 'Słup rozgałęźny wymaga odcinka napowietrznego SN. Dla kabla wybierz ZK SN albo zmień rodzaj odcinka.',
    });
  }
  return errors;
}

/**
 * Parametry normowe wybranej pozycji katalogowej (V12K-070, M1). Zestaw zależy od rodzaju:
 * kabel niesie pojemność C i żyłę powrotną (Ith — zwarcie doziemne) + izolację; linia
 * napowietrzna niesie susceptancję B i nie ma żyły powrotnej. Wartości z katalogu — wynik
 * (ΔU/straty/Ik) liczy solver.
 */
export interface ParametryOdcinka {
  r_ohm_per_km: number;
  x_ohm_per_km: number;
  rated_current_a: number;
  voltage_rating_kv: number | null;
  cross_section_mm2: number | null;
  conductor_material: string | null;
  standard: string | null;
  max_temperature_c: number | null;
  /** Kabel: pojemność doziemna [nF/km] (prąd ładowania). */
  c_nf_per_km: number | null;
  /** Linia: susceptancja poprzeczna [µS/km]. */
  b_us_per_km: number | null;
  /** Kabel: izolacja (XLPE/PVC/EPR) — wyznacza temperaturę dopuszczalną. */
  insulation_type: string | null;
  /** Kabel: prąd cieplny 1 s żyły powrotnej [A] — zwarcie doziemne (ekran). */
  return_conductor_ith_1s_a: number | null;
}

export function parametryZKatalogu(
  rodzaj: RodzajOdcinka,
  catalogRef: string | null,
  kable: readonly CableType[],
  linie: readonly LineType[],
): ParametryOdcinka | null {
  if (!catalogRef) return null;
  if (rodzaj === 'KABEL') {
    const it = kable.find((c) => c.id === catalogRef);
    if (!it) return null;
    return {
      r_ohm_per_km: it.r_ohm_per_km,
      x_ohm_per_km: it.x_ohm_per_km,
      rated_current_a: it.rated_current_a,
      voltage_rating_kv: it.voltage_rating_kv ?? null,
      cross_section_mm2: it.cross_section_mm2 ?? null,
      conductor_material: it.conductor_material ?? null,
      standard: it.standard ?? null,
      max_temperature_c: it.max_temperature_c ?? null,
      c_nf_per_km: it.c_nf_per_km ?? null,
      b_us_per_km: null,
      insulation_type: it.insulation_type ?? null,
      return_conductor_ith_1s_a: it.return_conductor_ith_1s_a ?? null,
    };
  }
  const it = linie.find((l) => l.id === catalogRef);
  if (!it) return null;
  return {
    r_ohm_per_km: it.r_ohm_per_km,
    x_ohm_per_km: it.x_ohm_per_km,
    rated_current_a: it.rated_current_a,
    voltage_rating_kv: it.voltage_rating_kv ?? null,
    cross_section_mm2: it.cross_section_mm2 ?? null,
    conductor_material: it.conductor_material ?? null,
    standard: it.standard ?? null,
    max_temperature_c: it.max_temperature_c ?? null,
    c_nf_per_km: null,
    b_us_per_km: it.b_us_per_km ?? null,
    insulation_type: null,
    return_conductor_ith_1s_a: null,
  };
}

/** Buduje żądanie podglądu ΔU (R1) lub null, gdy brak kompletu danych. */
export function zbudujZapytaniePodgladu(
  data: MagistralaFormData,
  params: ParametryOdcinka | null,
): CableVoltageDropRequest | null {
  if (!params || !isPositive(data.dlugosc_m) || data.cos_phi <= 0) return null;
  const current = isPositive(data.prad_a) ? data.prad_a : params.rated_current_a;
  if (!isPositive(current) || !isPositive(data.napiecie_kv)) return null;
  return {
    current_a: current,
    length_km: data.dlugosc_m / 1000,
    r_ohm_per_km: params.r_ohm_per_km,
    x_ohm_per_km: params.x_ohm_per_km,
    cos_phi: data.cos_phi,
    line_voltage_v: data.napiecie_kv * 1000,
  };
}

/** Kontekst operacji (z SLD/huba/selekcji): terminal/pole źródłowe ciągu. */
export interface KontekstMagistrali {
  trunk_id?: string;
  from_terminal_id?: string;
  field_ref?: string;
  terminal_voltage_label?: string;
}

/** Zapłon startu: czy istnieje głowica pola SN albo wolny koniec ciągu. */
export function maStartCiagu(kontekst: KontekstMagistrali): boolean {
  return Boolean(kontekst.from_terminal_id?.trim() || kontekst.field_ref?.trim());
}

export function zbudujPayload(
  data: MagistralaFormData,
  kontekst: KontekstMagistrali,
): Record<string, unknown> {
  const segmentKind = segmentKindZRodzaju(data.rodzaj);
  const namespace = normalizeSegmentNamespace(segmentKind);
  const payload: Record<string, unknown> = {
    segment: {
      rodzaj: segmentKind,
      dlugosc_m: data.dlugosc_m,
      catalog_binding: normalizeCatalogBinding(data.catalog_ref, namespace),
      ...(data.nazwa.trim() ? { name: data.nazwa.trim() } : {}),
    },
  };
  if (kontekst.trunk_id?.trim()) payload.trunk_id = kontekst.trunk_id.trim();
  if (kontekst.field_ref?.trim()) payload.field_ref = kontekst.field_ref.trim();
  if (kontekst.from_terminal_id?.trim()) payload.from_terminal_id = kontekst.from_terminal_id.trim();
  return payload;
}

// --------------------------------------------------- Builder realnej sieci (M2, V12K-071)

/** Odcinek dodany do magistrali w bieżącej sesji budowy (podsumowanie do listy). */
export interface OdcinekBudowy {
  rodzaj: RodzajOdcinka;
  typLabel: string;
  cross_section_mm2: number | null;
  dlugosc_m: number;
  /** Spadek napięcia odcinka [%] z podglądu backendu w chwili dodania (null = brak podglądu). */
  delta_u_pct: number | null;
}

/** Podsumuj właśnie dodany odcinek na podstawie formularza i parametrów katalogowych. */
export function podsumujOdcinek(
  data: MagistralaFormData,
  params: ParametryOdcinka | null,
  typLabel: string,
  deltaUPct: number | null = null,
): OdcinekBudowy {
  return {
    rodzaj: data.rodzaj,
    typLabel,
    cross_section_mm2: params?.cross_section_mm2 ?? null,
    dlugosc_m: isPositive(data.dlugosc_m) ? data.dlugosc_m : 0,
    delta_u_pct: typeof deltaUPct === 'number' && Number.isFinite(deltaUPct) ? deltaUPct : null,
  };
}

/** Łączna długość magistrali [m] z listy odcinków. */
export function lacznaDlugosc(odcinki: readonly OdcinekBudowy[]): number {
  return odcinki.reduce((sum, o) => sum + o.dlugosc_m, 0);
}

/**
 * Skumulowany spadek napięcia magistrali (radialny ciąg) wraz z KOMPLETNOŚCIĄ.
 *
 * DLACZEGO Z KOMPLETNOŚCIĄ (defekt, który to wymusił — V12K-227). Funkcja zwracała
 * samą liczbę i sumowała `delta_u_pct ?? 0`, a `delta_u_pct` jest jawnie
 * `number | null` (null, gdy backend nie policzył spadku tego odcinka). Odcinek bez
 * wyniku wnosił więc ZERO, przez co suma była ZANIŻONA — a kreator porównuje ją z
 * limitem 5% i ostrzega tylko po jego przekroczeniu. Niepełne dane wyciszały
 * ostrzeżenie: projektant dostawał milczący PASS na kryterium, którego nikt nie
 * sprawdził. Suma nieznanych składników nie jest sumą — dlatego brak jest teraz
 * LICZONY i wystawiony, a nie zamieniany w zero.
 */
export interface SkumulowanySpadek {
  /** Suma spadków odcinków, dla których backend podał wynik [%]. */
  readonly sumaZnanychPct: number;
  /** Liczba odcinków z policzonym spadkiem. */
  readonly odcinkiZeSpadkiem: number;
  /** Liczba odcinków BEZ policzonego spadku — składniki pominięte w sumie. */
  readonly odcinkiBezSpadku: number;
  /** Czy każdy odcinek ma wynik. Tylko wtedy suma jest spadkiem magistrali. */
  readonly kompletny: boolean;
}

export function lacznySpadekPct(odcinki: readonly OdcinekBudowy[]): SkumulowanySpadek {
  let sumaZnanychPct = 0;
  let odcinkiZeSpadkiem = 0;
  let odcinkiBezSpadku = 0;
  for (const odcinek of odcinki) {
    if (typeof odcinek.delta_u_pct === 'number') {
      sumaZnanychPct += odcinek.delta_u_pct;
      odcinkiZeSpadkiem += 1;
    } else {
      odcinkiBezSpadku += 1;
    }
  }
  return {
    sumaZnanychPct,
    odcinkiZeSpadkiem,
    odcinkiBezSpadku,
    kompletny: odcinkiBezSpadku === 0,
  };
}

// --------------------------------------------------- Asystent doboru przekroju (M3, V12K-072)

/** Typowy dopuszczalny spadek napięcia na magistrali SN [%] (dobra praktyka OSD). */
export const LIMIT_SPADKU_PCT = 5;

export type StanOceny = 'ok' | 'ostrzezenie' | 'brak';

export interface OcenaDoboru {
  /** Obciążalność: prąd roboczy ≤ obciążalność Iz. */
  obciazalnosc: StanOceny;
  /** Spadek napięcia ≤ limit. */
  spadek: StanOceny;
  obciazenieA: number | null;
  izA: number | null;
  spadekPct: number | null;
  limitPct: number;
}

/**
 * Interpretacja doboru przekroju z wartości policzonych przez backend (ΔU) i katalogu (Iz).
 * ZERO fizyki: nie liczy prądu ani ΔU — porównuje wartości backendu/katalogu z kryteriami.
 */
export function ocenaDoboru(
  params: ParametryOdcinka | null,
  deltaUPct: number | null,
  pradRoboczy: number | null,
  limitPct: number = LIMIT_SPADKU_PCT,
): OcenaDoboru {
  const izA = params?.rated_current_a ?? null;
  const obciazalnosc: StanOceny =
    izA == null || pradRoboczy == null ? 'brak' : pradRoboczy > izA ? 'ostrzezenie' : 'ok';
  const spadek: StanOceny =
    deltaUPct == null ? 'brak' : deltaUPct > limitPct ? 'ostrzezenie' : 'ok';
  return {
    obciazalnosc,
    spadek,
    obciazenieA: pradRoboczy,
    izA,
    spadekPct: deltaUPct,
    limitPct,
  };
}

/** Kontekst kontynuacji ciągu z końca właśnie dodanego odcinka (builder trzyma to w stanie). */
export function kontekstKontynuacji(
  endpointBusRef: string,
  trunkId: string | undefined,
  voltageLabel: string | undefined,
): KontekstMagistrali {
  return {
    trunk_id: trunkId || undefined,
    from_terminal_id: endpointBusRef || undefined,
    terminal_voltage_label: voltageLabel || undefined,
  };
}

// ------------------------------------------------------------- Formatery

/** Długość w metrach lub km (dla większych). */
export function fmtDlugosc(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;
}

export function fmtV(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} V` : '—';
}

export function fmtPct(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} %` : '—';
}

export function fmtA(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(0)} A` : '—';
}
