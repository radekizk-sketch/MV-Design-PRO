/**
 * Miejsce prądu urządzenia koordynacji — rozstrzygnięcie BACKENDU (decyzja O-51, pkt 7).
 *
 * Gałąź z susceptancją albo z przekładnią ma na końcach różne prądy (klasa P9), więc
 * prąd roboczy urządzenia to prąd ZACISKU, przy którym urządzenie stoi. Rozstrzyga go
 * ten sam resolver co pakiet nastaw (`application/protection_settings/
 * zacisk_zabezpieczenia.py::miejsce_urzadzenia`) przez
 * `GET /api/cases/{case_id}/enm/zacisk-lokalizacji`:
 *  - łącznik jako lokalizacja → gałąź i zacisk z MODELU (łańcuch szeregowy, KCL),
 *  - gałąź jako lokalizacja → wymagane wskazanie `zacisk` (etykiety z nazwami szyn
 *    przychodzą z backendu), brak wskazania = odmowa nazwana z kodem kanonu,
 *  - szyna → brak zacisków (prąd gałęzi nie dotyczy tej lokalizacji).
 *
 * Czysty moduł klienta — interfejs niczego tu nie rozstrzyga ani nie liczy.
 */

/** Zacisk gałęzi: `od` — początkowy, `do` — końcowy (konwencja modelu). */
export type ZaciskUrzadzenia = 'od' | 'do';

export interface ZaciskMiejsca {
  readonly szyna_ref: string;
  readonly etykieta_pl: string;
}

export interface OdmowaMiejsca {
  readonly kod: string;
  readonly powod_pl: string;
}

/** Odpowiedź `GET /api/cases/{case_id}/enm/zacisk-lokalizacji` (1:1 z backendem). */
export interface MiejsceUrzadzenia {
  readonly lokalizacja_ref: string;
  readonly rodzaj_lokalizacji: 'galaz' | 'lacznik' | 'szyna' | 'brak';
  /** Zaciski gałęzi lokalizacji (gałąź) albo gałęzi rozstrzygniętej przez model (łącznik). */
  readonly zaciski: Readonly<Record<ZaciskUrzadzenia, ZaciskMiejsca>> | null;
  readonly galaz_ref: string | null;
  readonly zacisk: ZaciskUrzadzenia | null;
  readonly zrodlo_zacisku: 'model' | 'wskazanie' | null;
  readonly wymaga_wskazania_zacisku: boolean;
  readonly odmowa_zacisku: OdmowaMiejsca | null;
}

export async function fetchMiejsceUrzadzenia(
  caseId: string,
  lokalizacja: string,
  zacisk: ZaciskUrzadzenia | null | undefined,
  options: { signal?: AbortSignal } = {},
): Promise<MiejsceUrzadzenia> {
  const query = new URLSearchParams({ lokalizacja });
  if (zacisk) query.set('zacisk', zacisk);
  const response = await fetch(
    `/api/cases/${encodeURIComponent(caseId)}/enm/zacisk-lokalizacji?${query.toString()}`,
    { signal: options.signal },
  );
  if (!response.ok) {
    let komunikat = `Rozstrzygnięcie miejsca urządzenia nie powiodło się (${response.status}).`;
    try {
      const dane = (await response.json()) as { detail?: unknown };
      if (typeof dane.detail === 'string' && dane.detail.trim()) komunikat = dane.detail;
    } catch {
      // Brak treści JSON — zostaje komunikat ze statusem.
    }
    throw new Error(komunikat);
  }
  return (await response.json()) as MiejsceUrzadzenia;
}
