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

/**
 * Rodzaj źródła danych kryterium (biegi albo model). Karta AB-1a D2/D7: pozycje
 * adapterów wyników FROZEN — testy NC RfG (`ncrfg_ptpiree`) i analizy V12.6
 * (`v126:*`) — mają ten sam kształt co pozycje oceny technicznej.
 */
export type ZrodloKryterium =
  | 'PF'
  | 'short_circuit_sn'
  | 'model'
  | 'ncrfg_ptpiree'
  | 'v126:neutral_earthing_design'
  | 'v126:benchmark_validation';

/**
 * Karta AB-1a D2 — domena fizyczna biegu kryterium (`PozycjaWerdyktu.physics_domain`),
 * `null` dla źródeł, które nie są biegiem jednej domeny (model, deklaracje NC RfG).
 * Wartości = nazwy członów `PhysicsDomain` rejestru zdolności backendu.
 */
export type DomenaFizyczna =
  | 'POWER_FLOW'
  | 'SHORT_CIRCUIT'
  | 'RMS_DYNAMICS'
  | 'SEQUENCE_DOMAIN'
  | 'HARMONIC_FREQUENCY_DOMAIN'
  | 'SUPRAHARMONIC_FREQUENCY_DOMAIN';

/** Status źródła podstawy wymagania (bez wartości domyślnej w backendzie). */
export type ZrodloStatusPodstawy = 'UNVERIFIED_SOURCE' | 'VERIFIED_SOURCE';

/** Podstawa strukturalna wymagania (`PodstawaNormatywna.to_dict`). */
export interface PodstawaNormatywnaOdpowiedz {
  readonly dokument: string | null;
  readonly wersja: string | null;
  readonly klauzula: string | null;
  readonly zrodlo_status: ZrodloStatusPodstawy;
  /** Czego brakuje do potwierdzenia podstawy (dokument, wersja, klauzula, okno). */
  readonly uwaga_pl: string | null;
}

/** Jeden kształt odwołania do dowodu: bieg, element, krok śladu (`null` = brak). */
export interface DowodWyniku {
  readonly run_id: string | null;
  readonly element_id: string | null;
  readonly trace_ref: string | null;
}

/** Punkt krytyczny wyniku: element i opcjonalna współrzędna czasu albo częstotliwości. */
export interface PunktKrytycznyOdpowiedz {
  readonly element_ref: string | null;
  readonly wspolrzedna: { readonly t_s?: number; readonly f_hz?: number } | null;
}

/** Rodzaj przyczyny ograniczenia wyniku (`RodzajPrzyczyny` backendu). */
export type RodzajPrzyczyny = 'element' | 'regulator' | 'ogranicznik' | 'zrodlo_emisji' | 'rezonans';

/** Strukturalna przyczyna wyniku. */
export interface PrzyczynaOgraniczeniaOdpowiedz {
  readonly rodzaj: RodzajPrzyczyny;
  readonly ref: string | null;
  readonly opis_pl: string;
}

/** Oś równań statusu modelu (`StatusRownan` — `solver_input/status_modelu.py`). */
export type StatusRownanKod = 'VALIDATED' | 'UNVALIDATED' | 'UNKNOWN';
/** Oś parametrów statusu modelu (`StatusParametrow`). */
export type StatusParametrowKod =
  | 'MODEL_ZWALIDOWANY_POMIAREM'
  | 'KARTA_KATALOGOWA'
  | 'OSZACOWANE'
  | 'UNKNOWN';

/** Dwie osie statusu modelu urządzenia (`StatusModelu.to_dict`). */
export interface StatusModeluOdpowiedz {
  readonly rownania: StatusRownanKod;
  readonly rownania_pl: string;
  readonly parametry: StatusParametrowKod;
  readonly parametry_pl: string;
}

/** Jakość danych wejściowych wyniku (`FieldQuality`). */
export type StatusWejsciaKod = 'DATASHEET' | 'ESTIMATED' | 'SYSTEM_DEFAULT';

/** Niepewność wyniku z metodą jej wyznaczenia. */
export interface NiepewnoscOdpowiedz {
  readonly wartosc: number;
  readonly jednostka: string;
  readonly metoda_pl: string;
}

/** Zakres ważności modelu/metody wyniku. */
export interface ZakresWaznosciOdpowiedz {
  readonly opis_pl: string;
  readonly granice: Readonly<Record<string, number>>;
}

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
  /** Karta V12.7 §0.1/§0.8 — zapis LaTeX wzoru marginesu (`MathInline`), obok
   *  liczby. Pusty, gdy `margines` jest `null` (pasmo, zgodność, brak podstaw)
   *  albo gdy dostawca podał margines już policzony (formuła nieznana tutaj). */
  readonly margines_wzor_latex: string;
  /** Uwaga przy wyniku SPEŁNIA (np. zapas w paśmie ostrzegawczym). */
  readonly uwaga_pl: string | null;
  /** Uzasadnienie dostawcy (dlaczego tak oceniono). */
  readonly uzasadnienie_pl: string | null;
  /** Wniosek projektowy — 1–2 zdania w języku formalnym. */
  readonly wniosek_pl: string;
  /** Odwołanie do dowodu (karta AB-1a D2 — jeden kształt `DowodWyniku`: bieg, element,
   *  krok śladu); `null` = brak biegu i brak śladu. */
  readonly dowod: DowodWyniku | null;
  /** Karta AB-1a D2 — pola wyjaśnialności (`null` = brak danej u dostawcy, kreska). */
  readonly punkt_krytyczny: PunktKrytycznyOdpowiedz | null;
  readonly przyczyna: PrzyczynaOgraniczeniaOdpowiedz | null;
  readonly status_modelu: StatusModeluOdpowiedz | null;
  readonly status_wejscia: StatusWejsciaKod | null;
  readonly niepewnosc: NiepewnoscOdpowiedz | null;
  readonly zakres_waznosci: ZakresWaznosciOdpowiedz | null;
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
  /** Karta AB-1a D2 — domena fizyczna biegu kryterium (`null` = źródło bez biegu). */
  readonly physics_domain: DomenaFizyczna | null;
  /** Karta AB-1a D2 — podstawa strukturalna; gdy jest, `norma_pl` = jej zapis (jedno źródło). */
  readonly podstawa: PodstawaNormatywnaOdpowiedz | null;
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
