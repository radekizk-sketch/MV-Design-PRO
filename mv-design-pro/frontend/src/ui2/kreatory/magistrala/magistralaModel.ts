/**
 * Model kreatora „Wyprowadź magistralę SN" (V12K-047, G-MAG).
 *
 * Krok flow po GPZ: prowadzi ciąg SN (odcinek kabla/linii) z pola odpływowego.
 * ZERO fizyki w UI — spadek napięcia odcinka i ciągu, ocenę obciążalności i limit
 * spadku daje backend (`trunk-sizing-assessment`, karta MAGISTRALA-OCENA) jako rekordy
 * werdyktu; parametry R/X/Iz do odczytu pochodzą z katalogu. Zapis = realna operacja domenowa
 * `continue_trunk_segment_sn` (kontrakt zachowany 1:1 z retirowanego ContinueTrunkForm),
 * po zapisie flow łańcuchuje realną KOLEJNĄ operację (następny krok).
 */

import type { UziemienieEkranuKabla } from '../../../types/uziemienie';
import { normalizeCatalogBinding, normalizeSegmentNamespace } from '../../../ui/network-build/forms/catalogPayload';
import type { OcenaDoboruMagistraliRequest, OdcinekOcenyRequest } from './ocenaDoboruApi';
import type { TrunkBranchKind } from '../../../ui/network-build/semanticValidator';
import type { TrunkNextStep } from '../../../ui/network-build/trunkContinuation';
import type { CableType, LineType } from '../../../ui/catalog/types';

export type RodzajOdcinka = 'KABEL' | 'LINIA';

export interface MagistralaFormData {
  rodzaj: RodzajOdcinka;
  catalog_ref: string | null;
  /** W5-A: układ uziemienia ekranu kabla (pusty = nie zadeklarowano; tylko dla KABEL). */
  screen_bonding: UziemienieEkranuKabla | '';
  dlugosc_m: number | null;
  nazwa: string;
  /** Prąd roboczy odcinka I_B [A]; pusty = niepodany (ocenę obciążalności backend nazwie brakiem). */
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
  screen_bonding: '',
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

/** Odcinek formularza w żądaniu oceny — wartości wprost z pól, bez uzupełniania braków. */
export function odcinekOceny(data: MagistralaFormData): OdcinekOcenyRequest {
  return {
    rodzaj: data.rodzaj,
    catalog_ref: data.catalog_ref?.trim() ? data.catalog_ref.trim() : null,
    dlugosc_m: isPositive(data.dlugosc_m) ? data.dlugosc_m : null,
    prad_roboczy_a: isPositive(data.prad_a) ? data.prad_a : null,
    cos_phi: data.cos_phi,
    nazwa: data.nazwa.trim() ? data.nazwa.trim() : null,
  };
}

/**
 * Żądanie oceny doboru (karta MAGISTRALA-OCENA): odcinek bieżący + odcinki zapisane w tej
 * sesji. `null`, gdy formularz łamie dziedzinę żądania (cosφ poza (0, 1], napięcie
 * niedodatnie) — wtedy walidacja formularza nazywa błąd pola, a ocena nie jest wołana.
 * Brak typu, długości czy prądu NIE blokuje żądania: backend nazywa te braki w rekordach.
 */
export function zbudujZapytanieOceny(
  data: MagistralaFormData,
  zbudowane: readonly OdcinekBudowy[],
): OcenaDoboruMagistraliRequest | null {
  if (!isPositive(data.napiecie_kv) || data.cos_phi <= 0 || data.cos_phi > 1) return null;
  return {
    napiecie_kv: data.napiecie_kv,
    odcinek: odcinekOceny(data),
    odcinki_zbudowane: zbudowane.map((o) => o.zadanie),
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
      // W5-A: deklaracja ekranu tylko dla kabla i tylko gdy wybrana (zero fantomów).
      ...(segmentKind === 'KABEL' && data.screen_bonding ? { screen_bonding: data.screen_bonding } : {}),
    },
  };
  if (kontekst.trunk_id?.trim()) payload.trunk_id = kontekst.trunk_id.trim();
  if (kontekst.field_ref?.trim()) payload.field_ref = kontekst.field_ref.trim();
  if (kontekst.from_terminal_id?.trim()) payload.from_terminal_id = kontekst.from_terminal_id.trim();
  return payload;
}

// --------------------------------------------------- Builder realnej sieci (M2, V12K-071)

/**
 * Odcinek dodany do magistrali w bieżącej sesji budowy. `zadanie` to dane odcinka w postaci
 * żądania oceny — backend liczy z nich spadek skumulowany ciągu i łączną długość (karta
 * MAGISTRALA-OCENA: interfejs nie sumuje spadków ani długości).
 */
export interface OdcinekBudowy {
  rodzaj: RodzajOdcinka;
  typLabel: string;
  cross_section_mm2: number | null;
  /** Długość do wiersza listy [m] (etykieta; sumę liczy backend). */
  dlugosc_m: number;
  zadanie: OdcinekOcenyRequest;
}

/** Podsumuj właśnie dodany odcinek na podstawie formularza i parametrów katalogowych. */
export function podsumujOdcinek(
  data: MagistralaFormData,
  params: ParametryOdcinka | null,
  typLabel: string,
): OdcinekBudowy {
  return {
    rodzaj: data.rodzaj,
    typLabel,
    cross_section_mm2: params?.cross_section_mm2 ?? null,
    dlugosc_m: isPositive(data.dlugosc_m) ? data.dlugosc_m : 0,
    zadanie: odcinekOceny(data),
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
