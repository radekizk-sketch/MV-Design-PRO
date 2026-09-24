/*
 * Klient archiwum projektu (ZIP) dla przestrzeni „Projekt".
 *
 * Kontrakt backendu 1:1 (routery wpięte pod `prefix="/api"`):
 *  `backend/src/api/project_archive.py`:
 *  - POST /api/projects/{project_id}/export?zapisz_do_magazynu=… → ZIP (attachment),
 *  - POST /api/projects/import           (multipart: file, new_name?, verify_integrity?),
 *  - POST /api/projects/import/preview   (multipart: file);
 *  `backend/src/api/archive_diff.py`:
 *  - POST /api/archives/diff             (multipart: file_a, file_b) → `ArchiveDiffResponse`,
 *  - POST /api/archives/diff/projects/{a}/{b}                        → `ArchiveDiffResponse`;
 *  `backend/src/api/incremental_archive.py`:
 *  - POST /api/projects/{project_id}/export/incremental (multipart: base_file) → ZIP paczki,
 *  - POST /api/projects/import/incremental (multipart: base_file, delta_file, new_name?).
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

/**
 * Podsumowanie zawartości archiwum (`ArchiveSummary`, format 3.0.0 — W1 2026-09-09):
 * archiwum niesie przypadki, biegi kanoniczne i zapisy modelu ENM; sekcje legacy
 * (węzły/gałęzie/źródła/odbiory/migawki/schematy/dowody) zeszły razem z tabelami ORM.
 */
export interface ZawartoscArchiwum {
  readonly study_cases_count: number;
  readonly operating_cases_count: number;
  readonly canonical_runs_count: number;
  readonly enm_models_count: number;
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

// ---------------------------------------------------------------------------
// Porównanie archiwów (`ArchiveDiffResponse`)
// ---------------------------------------------------------------------------

/** Status różnicy wg backendu (`domain.archive_diff.DiffStatus`). */
export type StatusRoznicy = 'IDENTICAL' | 'MODIFIED' | 'ADDED' | 'REMOVED';

/**
 * Zmiana wartości pola elementu (`FieldChangeResponse`). `*_value_pl` — ta sama
 * wartość z odwołaniami do elementów podstawionymi ich nazwami (backend,
 * `domain.archive_diff._z_nazwami_referencji`); `null`, gdy wartość nie niesie
 * odwołania z nazwą — wtedy ekran pokazuje wartość surową.
 */
export interface ZmianaPola {
  readonly field_name: string;
  readonly old_value: unknown;
  readonly new_value: unknown;
  readonly label_pl: string;
  readonly old_value_pl: unknown;
  readonly new_value_pl: unknown;
}

/** Różnica elementu (`ElementDiffResponse`) — nazwa projektanta i etykieta PL rodzaju. */
export interface RoznicaElementu {
  readonly element_id: string;
  readonly element_name: string | null;
  readonly element_type: string;
  readonly element_type_label_pl: string;
  readonly status: StatusRoznicy;
  readonly field_changes: readonly ZmianaPola[];
}

/** Różnica sekcji archiwum (`SectionDiffResponse`). */
export interface RoznicaSekcji {
  readonly section_name: string;
  readonly section_label_pl: string;
  readonly status: StatusRoznicy;
  readonly hash_a: string;
  readonly hash_b: string;
  readonly elements_added: number;
  readonly elements_removed: number;
  readonly elements_modified: number;
  readonly element_diffs: readonly RoznicaElementu[];
}

/** Podsumowanie porównania (`DiffSummaryResponse`). */
export interface PodsumowaniePorownania {
  readonly sections_total: number;
  readonly sections_identical: number;
  readonly sections_modified: number;
  readonly total_elements_added: number;
  readonly total_elements_removed: number;
  readonly total_elements_modified: number;
}

/** Pełny wynik porównania dwóch archiwów (`ArchiveDiffResponse`). */
export interface WynikPorownania {
  readonly archive_hash_a: string;
  readonly archive_hash_b: string;
  readonly overall_status: StatusRoznicy;
  readonly section_diffs: readonly RoznicaSekcji[];
  readonly summary: PodsumowaniePorownania;
  readonly deterministic_signature: string;
  readonly report_pl: string;
}

/** Porównanie dwóch plików archiwum (A — wcześniejsze, B — późniejsze). */
export async function porownajArchiwa(plikA: File, plikB: File): Promise<WynikPorownania> {
  const dane = new FormData();
  dane.append('file_a', plikA);
  dane.append('file_b', plikB);
  const response = await fetch('/api/archives/diff', { method: 'POST', body: dane });
  if (!response.ok) throw await bladOdpowiedzi(response, 'Nie udało się porównać paczek');
  return (await response.json()) as WynikPorownania;
}

/** Porównanie bieżącego stanu dwóch projektów na serwerze (A — bazowy, B — porównywany). */
export async function porownajProjekty(
  projektA: string,
  projektB: string,
): Promise<WynikPorownania> {
  const response = await fetch(
    `/api/archives/diff/projects/${encodeURIComponent(projektA)}/${encodeURIComponent(projektB)}`,
    { method: 'POST' },
  );
  if (!response.ok) throw await bladOdpowiedzi(response, 'Nie udało się porównać projektów');
  return (await response.json()) as WynikPorownania;
}

// ---------------------------------------------------------------------------
// Paczka zmian (eksport i import przyrostowy)
// ---------------------------------------------------------------------------

/** Metryki paczki zmian z nagłówków odpowiedzi eksportu (`compute_export_result`). */
export interface MetrykiPaczki {
  readonly sekcjeZmienione: number;
  readonly sekcjeNiezmienione: number;
  readonly rozmiarPelnyB: number;
  readonly rozmiarPaczkiB: number;
  readonly oszczednoscProcent: number;
}

/** Wynik eksportu paczki zmian: treść pliku + metryki backendu. */
export interface WynikEksportuPaczki {
  readonly blob: Blob;
  readonly metryki: MetrykiPaczki;
}

/** Liczba z nagłówka odpowiedzi; brak nagłówka = błąd kontraktu, nie ciche zero. */
function liczbaZNaglowka(response: Response, nazwa: string): number {
  const surowa = response.headers.get(nazwa);
  const wartosc = surowa === null ? Number.NaN : Number(surowa);
  if (!Number.isFinite(wartosc)) {
    throw new Error(`Odpowiedź eksportu paczki zmian nie zawiera nagłówka ${nazwa}`);
  }
  return wartosc;
}

/** Paczka zmian otwartego projektu względem archiwum bazowego, które odbiorca już ma. */
export async function eksportujPaczkeZmian(
  projectId: string,
  archiwumBazowe: File,
): Promise<WynikEksportuPaczki> {
  const dane = new FormData();
  dane.append('base_file', archiwumBazowe);
  const response = await fetch(
    `${BAZA}/${encodeURIComponent(projectId)}/export/incremental`,
    { method: 'POST', body: dane },
  );
  if (!response.ok) throw await bladOdpowiedzi(response, 'Nie udało się przygotować paczki zmian');
  const metryki: MetrykiPaczki = {
    sekcjeZmienione: liczbaZNaglowka(response, 'X-Sections-Changed'),
    sekcjeNiezmienione: liczbaZNaglowka(response, 'X-Sections-Unchanged'),
    rozmiarPelnyB: liczbaZNaglowka(response, 'X-Size-Full'),
    rozmiarPaczkiB: liczbaZNaglowka(response, 'X-Size-Delta'),
    oszczednoscProcent: liczbaZNaglowka(response, 'X-Savings-Percent'),
  };
  return { blob: await response.blob(), metryki };
}

/** Wynik importu paczki zmian (`IncrementalImportResponse`) — kształt importu pełnego. */
export interface WynikImportuPaczki extends WynikImportu {
  readonly sections_applied: number;
}

/** Archiwum bazowe + paczka zmian → nowy projekt na serwerze. */
export async function importujPaczkeZmian(
  archiwumBazowe: File,
  paczka: File,
  opcje: { readonly nowaNazwa?: string } = {},
): Promise<WynikImportuPaczki> {
  const dane = new FormData();
  dane.append('base_file', archiwumBazowe);
  dane.append('delta_file', paczka);
  if (opcje.nowaNazwa) dane.append('new_name', opcje.nowaNazwa);
  const response = await fetch(`${BAZA}/import/incremental`, { method: 'POST', body: dane });
  if (!response.ok) throw await bladOdpowiedzi(response, 'Nie udało się nałożyć paczki zmian');
  return (await response.json()) as WynikImportuPaczki;
}
