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

function isPositive(v: number | null): v is number {
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

/** Parametry R/X/Iznam wybranej pozycji katalogowej (kabel lub linia). */
export interface ParametryOdcinka {
  r_ohm_per_km: number;
  x_ohm_per_km: number;
  rated_current_a: number;
  voltage_rating_kv: number | null;
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
    };
  }
  const it = linie.find((l) => l.id === catalogRef);
  if (!it) return null;
  return {
    r_ohm_per_km: it.r_ohm_per_km,
    x_ohm_per_km: it.x_ohm_per_km,
    rated_current_a: it.rated_current_a,
    voltage_rating_kv: it.voltage_rating_kv ?? null,
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

// ------------------------------------------------------------- Formatery

export function fmtV(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} V` : '—';
}

export function fmtPct(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} %` : '—';
}

export function fmtA(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(0)} A` : '—';
}
