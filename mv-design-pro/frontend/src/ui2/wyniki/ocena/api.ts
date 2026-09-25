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
 * (SPEŁNIA / NIE SPEŁNIA / WYNIK NIEJEDNOZNACZNY / BRAK PODSTAW) przychodzi z backendu.
 */

/**
 * Stan kryterium (agregat pozycji = stan najgorszego elementu wg §2.3 kontraktu werdyktu:
 * NARUSZONE → NIEJEDNOZNACZNE → NIESPRAWDZONE → SPELNIONE). NIE_DOTYCZY nie zastępuje
 * żadnego z nich.
 */
export type StanKryterium =
  | 'SPELNIONE'
  | 'NARUSZONE'
  | 'NIEJEDNOZNACZNE'
  | 'NIESPRAWDZONE'
  | 'NIE_DOTYCZY';

/** Rodzaj źródła danych kryterium (biegi albo model). */
export type ZrodloKryterium = 'PF' | 'short_circuit_sn' | 'model';

/**
 * Wynik oceny JEDNEGO elementu (`WYNIK_*` backendu). `NIEJEDNOZNACZNY` — ostrzeżenie
 * dostawcy bez wniosku binarnego (kontrakt werdyktu §2.1), nigdy spełnienie.
 */
export type WynikOceny = 'SPELNIA' | 'NIE_SPELNIA' | 'NIEJEDNOZNACZNY' | 'BRAK_PODSTAW';

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
  /** Karta V12.7 §0.1/§0.8 — zapis LaTeX wzoru marginesu (`MathInline`), obok
   *  liczby. Pusty, gdy `margines` jest `null` (pasmo, zgodność, brak podstaw)
   *  albo gdy dostawca podał margines już policzony (formuła nieznana tutaj). */
  readonly margines_wzor_latex: string;
  /** Uwaga przy wyniku SPEŁNIA (np. zapas w paśmie ostrzegawczym) — wyłącznie SPEŁNIA. */
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
  /** Elementy z wynikiem NIEJEDNOZNACZNY (wyprowadzone z elementów po stronie backendu). */
  readonly liczba_niejednoznacznych: number;
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
  /** Karta V12.7 §0.1 — zapis LaTeX symbolu (`MathInline`); pusty dla kryteriów
   *  bez symbolu liczbowego (`symbol === '-'`, `warunek === 'zgodnosc'`). */
  readonly symbol_latex: string;
  /** Karta V12.7 §0.1 — pełny warunek jako LaTeX (`MathInline`/`MathBlock`);
   *  pusty dla `warunek === 'zgodnosc'`. */
  readonly warunek_latex: string;
  /** Karta V12.7 §0.7 — zakres, jaki werdykt tego kryterium wolno nazwać:
   *  `"kryterium"` (WYŁĄCZNIE tę wielkość) albo `"uklad"` (komplet kryteriów
   *  oceny wykonany — wolno nazwać cały obiekt). UI czyta pole, nie zgaduje. */
  readonly zakres_oceny: 'kryterium' | 'uklad';
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

/** Podsumowanie kryteriów: NIEJEDNOZNACZNE i NIESPRAWDZONE nigdy nie doliczają się do spełnionych. */
export interface PodsumowanieKryteriow {
  readonly spelnione: number;
  readonly naruszone: number;
  readonly niejednoznaczne: number;
  readonly niesprawdzone: number;
  readonly nie_dotyczy: number;
  readonly razem: number;
}

/**
 * Liczniki PER ELEMENT (nagłówek ekranu): OCENIONO = SPEŁNIA + NIE SPEŁNIA + WYNIK
 * NIEJEDNOZNACZNY; OCENIONO + BRAK PODSTAW = wszystkie elementy.
 */
export interface LicznikiOceny {
  readonly oceniono: number;
  readonly spelnia: number;
  readonly nie_spelnia: number;
  readonly niejednoznaczny: number;
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
  readonly werdykt: 'SPELNIONE' | 'NARUSZONE' | 'NIEJEDNOZNACZNE' | 'NIESPRAWDZONE';
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
