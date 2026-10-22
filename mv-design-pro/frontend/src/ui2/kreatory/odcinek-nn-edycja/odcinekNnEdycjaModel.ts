/**
 * Model kreatorów edycji ISTNIEJĄCEGO odcinka kabla nN (menu kontekstowe kabla na schemacie
 * nN stacji): podział (`split_nn_segment`) i warunki ułożenia (`set_nn_cable_laying_conditions`).
 *
 * Odcinek wskazuje kontekst operacji (`segment_ref`); jego długość i zapisane warunki
 * ułożenia czytamy z bieżącej migawki modelu. ZERO fizyki — ładunki niosą wyłącznie pola,
 * które operacje czytają.
 */

import type { EnergyNetworkModel } from '../../../types/enm';
import {
  WARUNKI_KATALOGOWE_NN,
  type NNCableLayingConditionsDescription,
  type SetNNCableLayingConditionsPayload,
  type SplitNNSegmentPayload,
} from '../../../types/domainOps';

export interface OdcinekNn {
  readonly ref: string;
  readonly nazwa: string;
  readonly dlugoscM: number | null;
  readonly warunkiUlozenia: Readonly<Record<string, unknown>> | null;
}

/** Odcinek kablowy z migawki albo `null` (brak odcinka albo gałąź innego rodzaju). */
export function odcinekZMigawki(
  snapshot: EnergyNetworkModel | null,
  segmentRef: string | null | undefined,
): OdcinekNn | null {
  if (!snapshot || !segmentRef) return null;
  const galaz = snapshot.branches.find((b) => b.ref_id === segmentRef);
  if (!galaz || galaz.type !== 'cable') return null;
  const warunki = galaz.meta?.cable_laying_conditions;
  return {
    ref: galaz.ref_id,
    nazwa: galaz.name || 'Odcinek nN',
    dlugoscM: Number.isFinite(galaz.length_km) ? Math.round(galaz.length_km * 1000 * 1000) / 1000 : null,
    warunkiUlozenia: warunki && typeof warunki === 'object' ? (warunki as Record<string, unknown>) : null,
  };
}

/** Komunikat błędu miejsca podziału albo `null` — ten sam przedział otwarty co backend. */
export function bladMiejscaPodzialu(splitAtM: number | null, dlugoscM: number | null): string | null {
  if (splitAtM === null || !Number.isFinite(splitAtM)) return 'Podaj odległość miejsca podziału od początku odcinka.';
  if (dlugoscM !== null && !(splitAtM > 0 && splitAtM < dlugoscM)) {
    return `Miejsce podziału musi leżeć wewnątrz odcinka: w przedziale (0; ${String(dlugoscM).replace('.', ',')}) m.`;
  }
  if (splitAtM <= 0) return 'Miejsce podziału musi leżeć wewnątrz odcinka.';
  return null;
}

export function zbudujPayloadPodzialu(segmentRef: string, splitAtM: number): SplitNNSegmentPayload {
  return { segment_ref: segmentRef, split_at_m: splitAtM };
}

/** Ładunek warunków ułożenia: opis albo jawny powrót do warunków katalogowych. */
export function zbudujPayloadUlozenia(
  segmentRef: string,
  opis: NNCableLayingConditionsDescription | null,
): SetNNCableLayingConditionsPayload {
  return { segment_ref: segmentRef, cable_laying_conditions: opis ?? WARUNKI_KATALOGOWE_NN };
}
