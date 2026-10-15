/**
 * Model kreatora „Domknięcie pierścienia SN + NOP" (V12K-055, G-RING).
 *
 * Dwa kroki = dwie realne operacje domenowe:
 *  1. `connect_secondary_ring_sn` — łączy dwa zaciski odcinkiem SN (kabel/linia),
 *     domykając pętlę (praca pierścieniowa).
 *  2. `set_normal_open_point` — wskazuje punkt normalnie otwarty (NOP), który
 *     przywraca pracę radialną (rozpływ mocy honoruje otwarty łącznik — brak gałęzi).
 * Katalog-first (KABEL_SN/LINIA_SN). Kontrakt payloadów 1:1 z retirowanym ConnectRingForm.
 */

import type { UziemienieEkranuKabla } from '../../../types/uziemienie';
import {
  normalizeCatalogBinding,
  normalizeSegmentKind,
  normalizeSegmentNamespace,
} from '../../../ui/network-build/forms/catalogPayload';

export type RodzajOdcinka = 'KABEL' | 'LINIA';

export interface PierscienFormData {
  rodzaj: RodzajOdcinka;
  catalog_ref: string | null;
  /** W5-A: układ uziemienia ekranu kabla (pusty = nie zadeklarowano; tylko dla KABEL). */
  screen_bonding: UziemienieEkranuKabla | '';
  dlugosc_m: number | null;
  /** Wybrany element punktu normalnie otwartego (ref łącznika). */
  nop_ref: string | null;
}

export interface BladPola {
  field: string;
  message: string;
}

export interface KandydatNop {
  id: string;
  label: string;
  elementType?: string;
}

export interface KontekstPierscienia {
  terminalA_id?: string;
  terminalA_label?: string;
  terminalB_id?: string;
  terminalB_label?: string;
  kandydaciNop: KandydatNop[];
}

/**
 * Stan startowy. Długość odcinka domykającego NIE ma wartości domyślnej (dawniej 500 m):
 * wyznacza impedancję pętli, więc pochodzi wyłącznie od projektanta (kontrakt prowadzenia
 * projektanta, reguła 4). Rodzaj „kabel” to filtr listy katalogowej, nie wartość obliczeniowa.
 */
export const DANE_DOMYSLNE: PierscienFormData = {
  rodzaj: 'KABEL',
  catalog_ref: null,
  screen_bonding: '',
  dlugosc_m: null,
  nop_ref: null,
};

function isPositive(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Rodzaj kreatora → wejście kanonicznego segment_kind (KABEL / LINIA_NAPOWIETRZNA). */
export function segmentKindZRodzaju(rodzaj: RodzajOdcinka): 'KABEL' | 'LINIA_NAPOWIETRZNA' {
  return rodzaj === 'LINIA' ? 'LINIA_NAPOWIETRZNA' : 'KABEL';
}

export function maZaciski(kontekst: KontekstPierscienia): boolean {
  return Boolean(kontekst.terminalA_id?.trim() && kontekst.terminalB_id?.trim());
}

/** KONFLIKT_TECHNICZNY — widoczny od razu przy polu: długość niedodatnia. */
export function konfliktyDomkniecia(data: PierscienFormData): BladPola[] {
  if (data.dlugosc_m !== null && !isPositive(data.dlugosc_m)) {
    return [{ field: 'dlugosc_m', message: 'Długość odcinka pierścienia musi być dodatnia.' }];
  }
  return [];
}

/** Kontrola domknięcia przed zapisem: konflikty, potem BRAK_DO_OPERACJI w kolejności pracy. */
export function walidujDomkniecie(data: PierscienFormData): BladPola[] {
  const errors: BladPola[] = [...konfliktyDomkniecia(data)];
  if (!data.catalog_ref?.trim()) {
    errors.push({
      field: 'catalog_ref',
      message:
        'Wybierz typ odcinka pierścienia z katalogu — R, X i obciążalność pętli pochodzą z pozycji katalogowej.',
    });
  }
  if (data.dlugosc_m === null) {
    errors.push({
      field: 'dlugosc_m',
      message: 'Podaj długość odcinka domykającego — wyznacza impedancję pętli i rozpływ w pierścieniu.',
    });
  }
  return errors;
}

export function walidujNop(data: PierscienFormData): BladPola[] {
  if (!data.nop_ref?.trim()) {
    return [{
      field: 'nop_ref',
      message:
        'Wskaż łącznik punktu normalnie otwartego (NOP) — bez niego sieć pracuje w pętli zamkniętej.',
    }];
  }
  return [];
}

export function zbudujPayloadDomkniecie(
  data: PierscienFormData,
  kontekst: KontekstPierscienia,
): Record<string, unknown> {
  const kindInput = segmentKindZRodzaju(data.rodzaj);
  const catalogBinding = normalizeCatalogBinding(
    data.catalog_ref,
    normalizeSegmentNamespace(kindInput),
  );
  return {
    from_bus_ref: kontekst.terminalA_id?.trim(),
    to_bus_ref: kontekst.terminalB_id?.trim(),
    segment: {
      rodzaj: normalizeSegmentKind(kindInput),
      dlugosc_m: data.dlugosc_m,
      catalog_binding: catalogBinding ?? undefined,
      // W5-A: deklaracja ekranu tylko dla kabla i tylko gdy wybrana (zero fantomów).
      ...(kindInput === 'KABEL' && data.screen_bonding ? { screen_bonding: data.screen_bonding } : {}),
    },
  };
}

export function zbudujPayloadNop(data: PierscienFormData): Record<string, unknown> {
  return { switch_ref: data.nop_ref?.trim() };
}

export function fmtDlugosc(v: number | null): string {
  return isPositive(v) ? `${v} m` : '—';
}
