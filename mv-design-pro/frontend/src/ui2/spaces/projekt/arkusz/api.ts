/*
 * Klient importu sieci z arkusza XLSX dla przestrzeni „Projekt".
 *
 * Kontrakt backendu 1:1 (`backend/src/api/xlsx_import.py`, router z prefiksem
 * `/api/import`):
 *  - POST /api/import/xlsx/preview (multipart: file) → podgląd BEZ zapisu
 *    (model zbudowany w pamięci: liczby z ENM, zastrzeżenia, typy z arkusza),
 *  - POST /api/import/xlsx         (multipart: file, nazwa_projektu?) → nowy projekt
 *    + pierwszy przypadek obliczeniowy + model sieci projektu (`enm_hash`).
 *
 * ZERO fabrykacji i ZERO parsowania modelu w przeglądarce: wszystkie liczby
 * („ile czego weszło do modelu") i wszystkie zastrzeżenia do wierszy pochodzą
 * z odpowiedzi backendu. Front nie otwiera arkusza — wysyła plik i pokazuje,
 * co powiedział serwer.
 */

/** Zastrzeżenie do zawartości arkusza (kontrakt `BladArkuszaModel`);
 *  `arkusz === 'model'` = zastrzeżenie kompilatora/walidatora do całej sieci. */
export interface ZastrzezenieArkusza {
  readonly arkusz: string;
  readonly wiersz: number | null;
  readonly kolumna: string | null;
  readonly komunikat: string;
}

/** Liczby elementów MODELU zbudowanego z arkusza (kontrakt `PodsumowanieArkuszaModel`). */
export interface PodsumowanieArkusza {
  readonly szyny: number;
  readonly odcinki: number;
  readonly transformatory: number;
  readonly zrodla: number;
  readonly odbiory: number;
}

/** Odpowiedź podglądu (`PodgladArkuszaResponse`). */
export interface PodgladArkusza {
  readonly poprawny: boolean;
  readonly podsumowanie: PodsumowanieArkusza | null;
  readonly bledy: readonly ZastrzezenieArkusza[];
  readonly ostrzezenia: readonly string[];
  /** Elementy, których typ powstał z tabliczki arkusza (pozycja katalogu projektu
   *  o statusie „niezweryfikowany") — do weryfikacji przez projektanta. */
  readonly elementy_typow_projektu: readonly string[];
}

/** Status importu wg backendu. */
export type StatusImportuArkusza = 'ZAIMPORTOWANO' | 'ODRZUCONO';

/** Odpowiedź importu (`ImportArkuszaResponse`). */
export interface WynikImportuArkusza {
  readonly status: StatusImportuArkusza;
  readonly project_id: string | null;
  readonly case_id: string | null;
  readonly enm_hash: string | null;
  readonly podsumowanie: PodsumowanieArkusza | null;
  readonly bledy: readonly ZastrzezenieArkusza[];
  readonly ostrzezenia: readonly string[];
  readonly elementy_typow_projektu: readonly string[];
}

const BAZA = '/api/import';

/** Odrzucenie walidacyjne backendu (422) niosące zastrzeżenia per wiersz. */
export class OdrzucenieArkusza extends Error {
  readonly zastrzezenia: readonly ZastrzezenieArkusza[];

  constructor(komunikat: string, zastrzezenia: readonly ZastrzezenieArkusza[]) {
    super(komunikat);
    this.name = 'OdrzucenieArkusza';
    this.zastrzezenia = zastrzezenia;
  }
}

interface TrescBledu {
  readonly detail?:
    | string
    | { readonly message?: string; readonly bledy?: readonly ZastrzezenieArkusza[] };
}

async function bladOdpowiedzi(response: Response, domyslny: string): Promise<Error> {
  try {
    const dane = (await response.json()) as TrescBledu;
    const detal = dane?.detail;
    if (typeof detal === 'string') return new Error(detal);
    if (detal && Array.isArray(detal.bledy)) {
      return new OdrzucenieArkusza(detal.message ?? domyslny, detal.bledy);
    }
    if (detal?.message) return new Error(detal.message);
  } catch {
    // Odpowiedź bez treści JSON — zostaje komunikat domyślny z kodem stanu.
  }
  return new Error(`${domyslny} (${response.status})`);
}

/** Podgląd zawartości arkusza — backend niczego nie zapisuje. */
export async function podejrzyjArkusz(plik: File): Promise<PodgladArkusza> {
  const dane = new FormData();
  dane.append('file', plik);
  const response = await fetch(`${BAZA}/xlsx/preview`, { method: 'POST', body: dane });
  if (!response.ok) throw await bladOdpowiedzi(response, 'Nie udało się odczytać arkusza');
  return (await response.json()) as PodgladArkusza;
}

/** Import arkusza do NOWEGO projektu. */
export async function importujArkusz(
  plik: File,
  nazwaProjektu?: string,
): Promise<WynikImportuArkusza> {
  const dane = new FormData();
  dane.append('file', plik);
  if (nazwaProjektu) dane.append('nazwa_projektu', nazwaProjektu);
  const response = await fetch(`${BAZA}/xlsx`, { method: 'POST', body: dane });
  if (!response.ok) throw await bladOdpowiedzi(response, 'Nie udało się zaimportować arkusza');
  return (await response.json()) as WynikImportuArkusza;
}
