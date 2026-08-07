/*
 * Klient importu sieci z arkusza XLSX dla przestrzeni „Projekt".
 *
 * Kontrakt backendu 1:1 (`backend/src/api/xlsx_import.py`, router z prefiksem
 * `/api/import`):
 *  - POST /api/import/xlsx/preview (multipart: file) → podgląd BEZ zapisu,
 *  - POST /api/import/xlsx         (multipart: file, nazwa_projektu?) → nowy projekt.
 *
 * ZERO fabrykacji i ZERO parsowania modelu w przeglądarce: wszystkie liczby
 * („ile czego wejdzie do modelu") i wszystkie zastrzeżenia do wierszy pochodzą
 * z odpowiedzi backendu. Front nie otwiera arkusza — wysyła plik i pokazuje,
 * co powiedział serwer.
 *
 * DEFEKT ZASTANY (karta XLSX-IMPORT, pomiar 2026-08-07): w całym froncie nie
 * było ANI JEDNEGO odwołania do `/api/import`; końcówka istniała, była wpięta
 * w `main.py` i nie miała konsumenta — a sama zwracała 422 „Brak biblioteki
 * openpyxl" i niczego nie zapisywała.
 */

/** Zastrzeżenie do zawartości arkusza (kontrakt `BladArkuszaModel`). */
export interface ZastrzezenieArkusza {
  readonly arkusz: string;
  readonly wiersz: number | null;
  readonly kolumna: string | null;
  readonly komunikat: string;
}

/** Liczby elementów rozpoznanych w arkuszu (kontrakt `PodsumowanieArkuszaModel`). */
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
  readonly elementy_bez_katalogu: readonly string[];
  readonly mapowanie_katalogowe_wymagane: boolean;
}

/** Status importu wg backendu. */
export type StatusImportuArkusza = 'ZAIMPORTOWANO' | 'WYMAGA_MAPOWANIA_KATALOGU' | 'ODRZUCONO';

/** Odpowiedź importu (`ImportArkuszaResponse`). */
export interface WynikImportuArkusza {
  readonly status: StatusImportuArkusza;
  readonly project_id: string | null;
  readonly snapshot_id: string | null;
  readonly odcisk_migawki: string | null;
  readonly podsumowanie: PodsumowanieArkusza | null;
  readonly bledy: readonly ZastrzezenieArkusza[];
  readonly ostrzezenia: readonly string[];
  readonly elementy_bez_katalogu: readonly string[];
  readonly mapowanie_katalogowe_wymagane: boolean;
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
