/**
 * Klient trasy `POST /api/solver/trunk-sizing-assessment` — ocena doboru przekroju odcinka
 * i ciągu magistrali SN (karta MAGISTRALA-OCENA).
 *
 * Backend czyta R, X i obciążalność z katalogu po `catalog_ref`, liczy spadek odcinka
 * i ciągu solverem, bierze limit z jednego źródła kryteriów napięciowych i zwraca rekordy
 * werdyktu wyjaśnialnego (`OcenaKryterium`). Interfejs NIE porównuje, NIE sumuje i NIE zna
 * progu — renderuje rekordy kartą werdyktu i liczby podglądu.
 */

import type { OcenaKryterium } from '../../wyniki/wzorzec/werdykt';

export type RodzajOdcinkaOceny = 'KABEL' | 'LINIA';

/** Odcinek w żądaniu: dane z formularza; `null` = projektant nie podał wartości. */
export interface OdcinekOcenyRequest {
  rodzaj: RodzajOdcinkaOceny;
  catalog_ref: string | null;
  dlugosc_m: number | null;
  prad_roboczy_a: number | null;
  cos_phi: number;
  nazwa: string | null;
}

export interface OcenaDoboruMagistraliRequest {
  napiecie_kv: number;
  odcinek: OdcinekOcenyRequest;
  /** Odcinki zapisane wcześniej w tej sesji kreatora, w kolejności od startu ciągu. */
  odcinki_zbudowane: OdcinekOcenyRequest[];
}

/** Spadek napięcia odcinka bieżącego (WHITE BOX solvera). */
export interface SpadekOdcinkaMagistrali {
  prad_obliczeniowy_a: number;
  /** Prąd obliczeniowy przyjęty równy obciążalności typu (projektant nie podał prądu). */
  prad_z_obciazalnosci: boolean;
  delta_u_v: number;
  delta_u_pct: number;
  r_total_ohm: number;
  x_total_ohm: number;
  delta_u_resistive_v: number;
  delta_u_reactive_v: number;
  formula_ref: string;
  assumptions: string[];
}

/** Ciąg budowany w kreatorze; `null` = nie policzono (braki nazywa rekord oceny ciągu). */
export interface CiagMagistrali {
  liczba_odcinkow: number;
  dlugosc_m: number | null;
  delta_u_v: number | null;
  delta_u_pct: number | null;
  formula_ref: string | null;
  assumptions: string[];
}

export interface OcenaDoboruMagistraliResponse {
  spadek_odcinka: SpadekOdcinkaMagistrali | null;
  ciag: CiagMagistrali;
  /** Obciążalność długotrwała i spadek napięcia odcinka bieżącego (rekordy K). */
  oceny_odcinka: OcenaKryterium[];
  /** Spadek skumulowany ciągu (rekord K). */
  ocena_ciagu: OcenaKryterium;
}

export async function fetchOcenaDoboruMagistrali(
  payload: OcenaDoboruMagistraliRequest,
  options: { signal?: AbortSignal } = {},
): Promise<OcenaDoboruMagistraliResponse> {
  const response = await fetch('/api/solver/trunk-sizing-assessment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(await opisBledu(response));
  }
  return response.json() as Promise<OcenaDoboruMagistraliResponse>;
}

async function opisBledu(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string' && data.detail.trim().length > 0) {
      return `Ocena doboru odcinka odrzuciła dane: ${data.detail}`;
    }
  } catch {
    // Treść błędu jest opcjonalna; komunikat poniżej wystarcza projektantowi.
  }
  return 'Ocena doboru odcinka niedostępna — backend nie odpowiedział.';
}
