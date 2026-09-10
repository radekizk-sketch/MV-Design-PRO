/*
 * Klient API ekranu „Ocena techniczna wyników" (karta B-02 / W3-E; następca
 * ekranu „Werdykt projektowy" z karty F-K3 i huba „Analizy techniczne").
 *
 * Kształty odwzorowane 1:1 z backendu:
 * - `GET /api/quality/design-verdict?case_id=`:
 *   `backend/src/api/quality_analysis_runs.py` → `get_design_verdict` →
 *   `application/analyses/werdykt_projektowy.py::build_werdykt_projektowy_view`
 *   (`WerdyktProjektowy.to_dict`: werdykt / case_id / model_hash / pozycje /
 *   zrodla / podsumowanie / zakres_poza_automatem / ocena / grupy;
 *   `PozycjaWerdyktu.to_dict` + `OcenaElementu.to_dict`).
 *
 * Parametrem jest PRZYPADEK, nie przebieg — ocena zestawia kryteria z wielu
 * biegów (rozpływ + zwarcia) i danych modelu. Warstwa PREZENTACJI: wyłącznie
 * odczyt (GET), zero fizyki, zero ocen własnych — WYNIK OCENY każdego elementu
 * (SPEŁNIA / NIE SPEŁNIA / BRAK PODSTAW) przychodzi z backendu.
 */

/** Stan kryterium (agregat pozycji). Czwarty stan NIE_DOTYCZY nie zastępuje żadnego z trzech. */
export type StanKryterium = 'SPELNIONE' | 'NARUSZONE' | 'NIESPRAWDZONE' | 'NIE_DOTYCZY';

/** Rodzaj źródła danych kryterium (biegi albo model). */
export type ZrodloKryterium = 'PF' | 'short_circuit_sn' | 'model';

/** Wynik oceny JEDNEGO elementu — trzy stany, nigdy dwa (`WYNIK_*` backendu). */
export type WynikOceny = 'SPELNIA' | 'NIE_SPELNIA' | 'BRAK_PODSTAW';

/** Warunek kryterium (`WARUNEK_*` backendu) — steruje zapisem odniesienia. */
export type WarunekKryterium = 'nie_wiecej_niz' | 'nie_mniej_niz' | 'w_pasmie' | 'zgodnosc';

/** Semantyka elementu wiodącego z domeny (`ELEMENT_*` backendu). */
export type RodzajElementuOceny = 'szyna' | 'galaz_liniowa' | 'transformator' | 'zrodlo';

/** Ocena jednego elementu wobec kryterium (`OcenaElementu.to_dict`). */
export interface OcenaElementu {
  readonly element_id: string | null;
  readonly element_nazwa: string | null;
  readonly element_rodzaj: RodzajElementuOceny | null;
  readonly wynik: WynikOceny;
  readonly wartosc: number | null;
  readonly odniesienie: number | null;
  /** Druga granica pasma (wiarygodność Ik″) albo próg ostrzegawczy (walidacja). */
  readonly odniesienie_dolne: number | null;
  readonly odniesienie_ostrzegawcze: number | null;
  readonly jednostka: string;
  /** Zapas do granicy: dodatni = w granicy. Jednostka zapasu w `margines_jednostka`. */
  readonly margines: number | null;
  readonly margines_jednostka: string;
  /** Uwaga przy wyniku SPEŁNIA (np. zapas w paśmie ostrzegawczym). */
  readonly uwaga_pl: string | null;
  /** Uzasadnienie dostawcy (dlaczego tak oceniono). */
  readonly uzasadnienie_pl: string | null;
  /** Wniosek projektowy — 1–2 zdania w języku formalnym. */
  readonly wniosek_pl: string;
  /** Odwołanie do dowodu obliczeniowego: bieg + element (`null` = brak biegu). */
  readonly dowod: { readonly run_id: string; readonly element_id: string } | null;
}

/** Jedna pozycja rejestru kryteriów projektu (`PozycjaWerdyktu.to_dict`). */
export interface PozycjaOceny {
  readonly kryterium_id: string;
  /** Etap toku pracy projektanta (E1…E6) — kolejność łańcucha, nie nazwa modułu. */
  readonly etap: string;
  readonly nazwa_pl: string;
  /** Warunek/wzór kryterium (wzory inline `$…$`). */
  readonly warunek_pl: string;
  readonly norma_pl: string;
  readonly zrodlo: ZrodloKryterium;
  readonly element_rodzaj: RodzajElementuOceny | null;
  readonly stan: StanKryterium;
  readonly liczba_ocenionych: number;
  readonly liczba_naruszen: number;
  readonly liczba_niesprawdzonych: number;
  readonly liczba_ostrzezen: number;
  readonly wiodacy_element_id: string | null;
  readonly wiodacy_opis_pl: string | null;
  /** Kanoniczny kod powodu braku oceny (`verdict.*` albo kod dostawcy). */
  readonly powod_kod: string | null;
  readonly powod_pl: string | null;
  readonly run_id: string | null;
  /** Grupa znaczeniowa kryterium (kod z `grupy` odpowiedzi). */
  readonly grupa: string;
  readonly wielkosc_pl: string;
  readonly symbol: string;
  readonly jednostka: string;
  readonly warunek: WarunekKryterium;
  /** Oceny per element — pozycja bez elementów = brak podstawy do oceny (patrz `powod_pl`). */
  readonly elementy: readonly OcenaElementu[];
}

/** Metadane biegu/modelu, z którego pochodzą kryteria danego rodzaju. */
export interface ZrodloOceny {
  readonly rodzaj: ZrodloKryterium;
  readonly run_id: string | null;
  readonly wykonano: string | null;
  readonly snapshot_hash: string | null;
  /** False ⇒ model zmienił się po biegu (reguła 4 kanonu — wynik unieważniony). */
  readonly aktualny: boolean;
  readonly dostepny: boolean;
  readonly powod_pl: string | null;
}

/** Podsumowanie kryteriów: NIESPRAWDZONE nigdy nie dolicza się do spełnionych. */
export interface PodsumowanieKryteriow {
  readonly spelnione: number;
  readonly naruszone: number;
  readonly niesprawdzone: number;
  readonly nie_dotyczy: number;
  readonly razem: number;
}

/** Liczniki PER ELEMENT (nagłówek ekranu): OCENIONO = SPEŁNIA + NIE SPEŁNIA. */
export interface LicznikiOceny {
  readonly oceniono: number;
  readonly spelnia: number;
  readonly nie_spelnia: number;
  readonly brak_podstaw: number;
}

/** Kryterium BEZ automatycznego dostawcy — jawny zakres weryfikacji. */
export interface WpisZakresu {
  readonly kryterium_pl: string;
  readonly etap: string;
  readonly powod_pl: string;
}

/** Pełna odpowiedź `GET /api/quality/design-verdict`. */
export interface OdpowiedzOceny {
  readonly werdykt: 'SPELNIONE' | 'NARUSZONE' | 'NIESPRAWDZONE';
  readonly case_id: string;
  readonly model_hash: string;
  readonly pozycje: readonly PozycjaOceny[];
  readonly zrodla: readonly ZrodloOceny[];
  readonly podsumowanie: PodsumowanieKryteriow;
  readonly zakres_poza_automatem: readonly WpisZakresu[];
  readonly ocena: LicznikiOceny;
  readonly grupy: readonly { readonly kod: string; readonly nazwa_pl: string }[];
}

/** Pobiera ocenę techniczną wyników przypadku obliczeniowego (agregat kryteriów). */
export async function fetchOcenaTechniczna(caseId: string): Promise<OdpowiedzOceny> {
  const url = `/api/quality/design-verdict?case_id=${encodeURIComponent(caseId)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Zapytanie ${url} nie powiodło się: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as OdpowiedzOceny;
}
