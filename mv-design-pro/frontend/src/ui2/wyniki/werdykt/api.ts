/*
 * Klient API ekranu „Werdykt projektowy" (karta F-K3, znalezisko Z3 audytu FLOW).
 *
 * Kształty odwzorowane 1:1 z backendu (mapowanie plik:linia):
 * - `GET /api/quality/design-verdict?case_id=`:
 *   `backend/src/api/quality_analysis_runs.py` → `get_design_verdict` →
 *   `application/analyses/werdykt_projektowy.py:build_werdykt_projektowy_view`
 *   (kształt `werdykt`/`case_id`/`model_hash`/`pozycje`/`zrodla`/`podsumowanie`/
 *   `zakres_poza_automatem`).
 *
 * Parametrem jest PRZYPADEK, nie przebieg — werdykt zestawia kryteria z wielu
 * biegów (rozpływ + zwarcia) i danych modelu, więc pojedynczy `run_id` byłby
 * z definicji za wąski.
 *
 * Warstwa PREZENTACJI: wyłącznie odczyt (GET), zero fizyki, zero mutacji.
 */

/** Stan kryterium. Czwarty stan NIE_DOTYCZY nie zastępuje żadnego z trzech. */
export type StanKryterium = 'SPELNIONE' | 'NARUSZONE' | 'NIESPRAWDZONE' | 'NIE_DOTYCZY';

/** Rodzaj źródła danych kryterium (biegi albo model). */
export type ZrodloKryterium = 'PF' | 'short_circuit_sn' | 'model';

/** Jedna pozycja rejestru kryteriów projektu. */
export interface PozycjaWerdyktu {
  readonly kryterium_id: string;
  /** Etap flow projektanta (E1…E6) — kolejność łańcucha, nie nazwa modułu. */
  readonly etap: string;
  readonly nazwa_pl: string;
  /** Warunek/wzór kryterium (kontrakt ekranu prowadzącego, punkt 3). */
  readonly warunek_pl: string;
  readonly norma_pl: string;
  readonly zrodlo: ZrodloKryterium;
  /** Semantyka elementu wiodącego z domeny (mapowana na typ UI w modelu). */
  readonly element_rodzaj: 'szyna' | 'galaz_liniowa' | 'transformator' | null;
  readonly stan: StanKryterium;
  readonly liczba_ocenionych: number;
  readonly liczba_naruszen: number;
  readonly liczba_niesprawdzonych: number;
  /** Pozycje w granicy limitu (ostrzeżenie) — kryterium spełnione, margines mały. */
  readonly liczba_ostrzezen: number;
  readonly wiodacy_element_id: string | null;
  readonly wiodacy_opis_pl: string | null;
  /** Kanoniczny kod powodu braku oceny (`verdict.*` albo kod dostawcy). */
  readonly powod_kod: string | null;
  readonly powod_pl: string | null;
  readonly run_id: string | null;
}

/** Metadane biegu/modelu, z którego pochodzą kryteria danego rodzaju. */
export interface ZrodloWerdyktu {
  readonly rodzaj: ZrodloKryterium;
  readonly run_id: string | null;
  readonly wykonano: string | null;
  readonly snapshot_hash: string | null;
  /** False ⇒ model zmienił się po biegu (reguła 4 kanonu — wynik unieważniony). */
  readonly aktualny: boolean;
  readonly dostepny: boolean;
  readonly powod_pl: string | null;
}

/** Podsumowanie liczbowe: NIESPRAWDZONE nigdy nie dolicza się do spełnionych. */
export interface PodsumowanieWerdyktu {
  readonly spelnione: number;
  readonly naruszone: number;
  readonly niesprawdzone: number;
  readonly nie_dotyczy: number;
  readonly razem: number;
}

/** Kryterium BEZ automatycznego dostawcy — jawny zakres weryfikacji. */
export interface WpisZakresu {
  readonly kryterium_pl: string;
  readonly etap: string;
  readonly powod_pl: string;
}

/** Pełna odpowiedź `GET /api/quality/design-verdict`. */
export interface WerdyktResponse {
  readonly werdykt: 'SPELNIONE' | 'NARUSZONE' | 'NIESPRAWDZONE';
  readonly case_id: string;
  readonly model_hash: string;
  readonly pozycje: readonly PozycjaWerdyktu[];
  readonly zrodla: readonly ZrodloWerdyktu[];
  readonly podsumowanie: PodsumowanieWerdyktu;
  readonly zakres_poza_automatem: readonly WpisZakresu[];
}

/** Pobiera agregat werdyktu projektowego dla przypadku obliczeniowego. */
export async function fetchWerdyktProjektowy(caseId: string): Promise<WerdyktResponse> {
  const url = `/api/quality/design-verdict?case_id=${encodeURIComponent(caseId)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request ${url} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as WerdyktResponse;
}
