/*
 * Klient archiwum projektu (ZIP) dla przestrzeni „Projekt".
 *
 * Kontrakt backendu 1:1 (`backend/src/api/project_archive.py`, router wpiety
 * pod `prefix="/api"`):
 *  - POST /api/projects/{project_id}/export?zapisz_do_magazynu=… → ZIP (attachment),
 *  - POST /api/projects/import           (multipart: file, new_name?, verify_integrity?),
 *  - POST /api/projects/import/preview   (multipart: file).
 *
 * ZERO fabrykacji: każde pole poniżej pochodzi z modeli odpowiedzi backendu
 * (`ImportResponse`, `PreviewResponse`) — łącznie z bramką katalogową po
 * imporcie (`elements_without_catalog`, `catalog_mapping_required`), której
 * klient warstwy zastanej nie znał.
 *
 * `zapisz_do_magazynu=true` przy eksporcie domyka łańcuch dokumentacji: backend
 * przechwytuje paczkę do magazynu dokumentów jako typ „ARCHIWUM", więc karta
 * „Archiwum projektu (ZIP)" w hubie dokumentacji pokazuje realny rekord z
 * akcjami Pobierz/Podgląd (mapowanie `TYP_DOKUMENTU_KARTY` w hubie istniało,
 * ale nie miało wołającego — nikt nie prosił o zapis do magazynu).
 */

/** Status importu wg backendu (`ImportStatus` + bramka katalogowa). */
export type StatusImportu = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CATALOG_MAPPING_REQUIRED';

/** Podsumowanie zawartości archiwum (`ArchiveSummary`). */
export interface ZawartoscArchiwum {
  readonly nodes_count: number;
  readonly branches_count: number;
  readonly sources_count: number;
  readonly loads_count: number;
  readonly snapshots_count: number;
  readonly sld_diagrams_count: number;
  readonly study_cases_count: number;
  readonly operating_cases_count: number;
  readonly analysis_runs_count: number;
  readonly study_runs_count: number;
  readonly results_count: number;
  readonly proofs_count: number;
}

/** Podgląd archiwum bez importu (`PreviewResponse`). */
export interface PodgladArchiwum {
  readonly valid: boolean;
  readonly error?: string | null;
  readonly format_id?: string | null;
  readonly schema_version?: string | null;
  readonly project_name?: string | null;
  readonly project_description?: string | null;
  readonly exported_at?: string | null;
  readonly archive_hash?: string | null;
  readonly summary?: ZawartoscArchiwum | null;
}

/** Wynik importu (`ImportResponse`). */
export interface WynikImportu {
  readonly status: StatusImportu;
  readonly project_id: string | null;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly migrated_from_version: string | null;
  readonly elements_without_catalog?: readonly string[];
  readonly catalog_mapping_required?: boolean;
}

const BAZA = '/api/projects';

/** Treść błędu z odpowiedzi backendu (pole `detail`) albo kod stanu. */
async function bladOdpowiedzi(response: Response, domyslny: string): Promise<Error> {
  try {
    const dane = (await response.json()) as { detail?: string };
    if (dane?.detail) return new Error(dane.detail);
  } catch {
    // Odpowiedź bez treści JSON — zostaje komunikat domyślny z kodem stanu.
  }
  return new Error(`${domyslny} (${response.status})`);
}

export interface OpcjeEksportu {
  /** Zapis paczki do magazynu dokumentów projektu (widoczna w hubie dokumentacji). */
  readonly zapiszDoMagazynu?: boolean;
}

/** Eksport projektu do archiwum ZIP; zwraca treść paczki. */
export async function eksportujArchiwum(
  projectId: string,
  opcje: OpcjeEksportu = {},
): Promise<Blob> {
  const zapytanie = opcje.zapiszDoMagazynu ? '?zapisz_do_magazynu=true' : '';
  const response = await fetch(
    `${BAZA}/${encodeURIComponent(projectId)}/export${zapytanie}`,
    { method: 'POST' },
  );
  if (!response.ok) throw await bladOdpowiedzi(response, 'Nie udało się wyeksportować projektu');
  return response.blob();
}

export interface OpcjeImportu {
  /** Nowa nazwa projektu (puste = nazwa z archiwum). */
  readonly nowaNazwa?: string;
  /** Weryfikacja sumy kontrolnej archiwum przed zapisem. */
  readonly weryfikujIntegralnosc?: boolean;
}

/** Import projektu z archiwum ZIP. */
export async function importujArchiwum(
  plik: File,
  opcje: OpcjeImportu = {},
): Promise<WynikImportu> {
  const dane = new FormData();
  dane.append('file', plik);
  if (opcje.nowaNazwa) dane.append('new_name', opcje.nowaNazwa);
  if (opcje.weryfikujIntegralnosc !== undefined) {
    dane.append('verify_integrity', String(opcje.weryfikujIntegralnosc));
  }
  const response = await fetch(`${BAZA}/import`, { method: 'POST', body: dane });
  if (!response.ok) throw await bladOdpowiedzi(response, 'Nie udało się zaimportować archiwum');
  return (await response.json()) as WynikImportu;
}

/** Podgląd zawartości archiwum bez zapisu do bazy. */
export async function podejrzyjArchiwum(plik: File): Promise<PodgladArchiwum> {
  const dane = new FormData();
  dane.append('file', plik);
  const response = await fetch(`${BAZA}/import/preview`, { method: 'POST', body: dane });
  if (!response.ok) throw await bladOdpowiedzi(response, 'Nie udało się odczytać archiwum');
  return (await response.json()) as PodgladArchiwum;
}
