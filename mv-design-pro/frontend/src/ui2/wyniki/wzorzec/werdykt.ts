/*
 * Typy rekordu WERDYKTU WYJAŚNIALNEGO — lustro 1:1 `backend/src/werdykt/kontrakt.py`
 * (kanon: `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md` §1, §4, §5, §7, §9).
 *
 * Kształt = `model_dump(mode="json")` modelu pydantic: te same nazwy pól (snake_case),
 * słowniki zamknięte jako unie literałów w tej samej kolejności co `Literal[...]` backendu,
 * krotki jako tablice tylko do odczytu, `None` jako `null` (pole zawsze obecne — backend nie
 * serializuje z `exclude_none`). Osie `EvidenceTier` / `FieldQuality` / `ClaimKind` są
 * lustrem `backend/src/werdykt/proweniencja.py` (JEDYNE definicje, re-eksportowane przez
 * `solver_input.provenance`; wartości `StrEnum` jako napisy).
 *
 * ZERO LOGIKI DECYZYJNEJ: ten moduł nie zna reguł K/W (§2.2, §2.3), nie liczy statusu,
 * kompletności ani etykiety — wszystko to przychodzi W REKORDZIE z backendu
 * (`werdykt/decyzja.py`, `werdykt/etykiety.py`). Jedyna funkcja to rozróżnienie poziomu
 * rekordu (K albo W) po obecności pola `wymaganie_id` — kształt, nie ocena.
 */

// ---------------------------------------------------------------------------
// Słowniki zamknięte (kontrakt §1, §2.1, §4) — kolejność jak w `kontrakt.py`
// ---------------------------------------------------------------------------

/** Status maszynowy oceny (§2.1) — enum wewnętrzny, NIGDY samodzielny komunikat. */
export type StatusWerdyktu =
  | 'SPELNIA'
  | 'NIE_SPELNIA'
  | 'NIEJEDNOZNACZNY'
  | 'NIE_OCENIONO'
  | 'BRAK_PODSTAWY'
  | 'BRAK_DOWODU'
  | 'NIE_DOTYCZY';

/** Oś kompletności dowodu (§3), niezależna od statusu kryterium. */
export type KompletnoscDowodu = 'PELNY' | 'NIEPELNY' | 'NIE_DOTYCZY';

/** Rodzaj źródła podstawy wymagania (warstwa normatywna). */
export type RodzajPodstawy =
  | 'ROZPORZADZENIE_UE'
  | 'NORMA'
  | 'PRAWO_KRAJOWE'
  | 'WOS'
  | 'PROCEDURA_PTPIREE'
  | 'WIPWC'
  | 'OSD'
  | 'KATALOG_PRODUCENTA'
  | 'ZALOZENIE_PROJEKTOWE'
  | 'NIEUSTALONA';

/** Stan źródła podstawy — od najmocniejszego. */
export type StanZrodla = 'ZWERYFIKOWANE' | 'WSKAZANE' | 'NIEUSTALONE';

/** Relacja wyniku do limitu. */
export type Relacja =
  | 'NIE_WIECEJ'
  | 'NIE_MNIEJ'
  | 'PASMO'
  | 'OBWIEDNIA_DOLNA'
  | 'OBWIEDNIA_GORNA'
  | 'LOGICZNE';

/** Status walidacji modelu KONKRETNEGO urządzenia (oś inna niż `EvidenceTier` narzędzia). */
export type StatusModelu =
  | 'UNVALIDATED_MODEL'
  | 'VALIDATED_AGAINST_TEST'
  | 'CERTIFIED_MODEL'
  | 'NIE_DOTYCZY';

/** Status danych wejściowych oceny. */
export type StanDanych = 'ZWALIDOWANE' | 'UNVALIDATED_INPUT';

/** Dziedzina fizyki, w której wynik jest ważny (zakres ważności §7). */
export type DziedzinaFizyki =
  | 'POWER_FLOW'
  | 'SHORT_CIRCUIT'
  | 'RMS_DYNAMICS'
  | 'SEQUENCE_DOMAIN'
  | 'HARMONIC_FREQUENCY_DOMAIN'
  | 'SUPRAHARMONIC_FREQUENCY_DOMAIN';

/**
 * JEDEN słownik metody dowodu — używany w `WynikKryterium.metoda`, `StatusDowodu.metoda`
 * i `WynikWymagania.sposob_wykazania` (podzbiory pilnują walidatory backendu).
 */
export type MetodaDowodu =
  | 'CERTYFIKAT'
  | 'RAPORT_Z_TESTU'
  | 'SYMULACJA'
  | 'OBLICZENIE'
  | 'DEKLARACJA'
  | 'POMIAR'
  | 'OCENA_OPERATORA'
  | 'DOWOD_LACZONY'
  | 'BRAK_METODY';

/** Semantyka koloru etykiety (§9) — interfejs mapuje WYŁĄCZNIE semantykę na kolor. */
export type SemantykaKoloru = 'pozytywna' | 'negatywna' | 'ostrzegawcza' | 'neutralna';

/**
 * Pomocniczy alias z karty AB-1a (Pakiet D1) — ta sama unia co `SemantykaKoloru`
 * backendu; klucz jedynej mapy „semantyka → kolor" (`KartaWerdyktu.SEMANTYKA_KOLOR`).
 */
export type SemantykaEtykiety = SemantykaKoloru;

/** Rodzaj skali marginesu względnego (§2.4). */
export type RodzajSkali = 'TOLERANCJA' | 'LIMIT' | 'NIEPEWNOSC';

/** Pokrycie zbioru scenariuszy programu badań przez biegi wykazujące wymaganie (§2.3 pkt 8). */
export type PokrycieProgramu = 'PELNE' | 'CZESCIOWE' | 'NIE_DOTYCZY';

/** Poziom rekordu: K — ocena kryterium, W — wynik wymagania (etykieta zależy od poziomu, §9). */
export type PoziomRekordu = 'K' | 'W';

/** Lustro `werdykt.proweniencja.EvidenceTier` — poziom dowodowy zdolności narzędzia. */
export type EvidenceTier =
  | 'VALIDATED_SIMULATION'
  | 'TYPE_TEST_CERTIFICATE'
  | 'DECLARATION'
  | 'UNVALIDATED_MODEL'
  | 'NOT_SIMULATED';

/** Lustro `werdykt.proweniencja.FieldQuality` — jakość wartości wejściowej. */
export type FieldQuality = 'DATASHEET' | 'ESTIMATED' | 'SYSTEM_DEFAULT';

/**
 * Lustro `werdykt.proweniencja.ClaimKind` — rodzaj twierdzenia wspieranego wynikiem
 * (`STATIC_CALCULATION` — twierdzenie z obliczenia statycznego, karta A2).
 */
export type ClaimKind = 'DYNAMIC_PERFORMANCE' | 'DECLARED_CONFIGURATION' | 'STATIC_CALCULATION';

// ---------------------------------------------------------------------------
// Proweniencja, wielkości, dane
// ---------------------------------------------------------------------------

/** Podstawa wymagania albo wartości (§1): skąd pochodzi i w jakim stanie jest źródło. */
export interface PodstawaWymagania {
  readonly rodzaj: RodzajPodstawy;
  readonly dokument: string;
  readonly wydanie: string | null;
  readonly jednostka_redakcyjna: string | null;
  readonly status: StanZrodla;
  readonly uwagi_pl: string | null;
}

/** Liczba z jednostką (T3); jednostka bezwymiarowa jawnie („1", „%", „p.u. (<baza>)"). */
export interface Wielkosc {
  readonly wartosc: number;
  readonly jednostka: string;
}

/** Dana przyjęta do oceny bez pełnej walidacji (wartość, powód, jakość danej). */
export interface DanaPrzyjeta {
  readonly nazwa_pl: string;
  readonly wartosc: Wielkosc | null;
  readonly powod_pl: string;
  readonly jakosc: FieldQuality | null;
}

/** Status danych wejściowych: `UNVALIDATED_INPUT` ⇔ lista danych przyjętych niepusta. */
export interface StatusDanych {
  readonly stan: StanDanych;
  readonly dane_przyjete: readonly DanaPrzyjeta[];
}

/**
 * Dowód stojący za wynikiem. `przydatnosc_dowodowa` backendu jest WŁAŚCIWOŚCIĄ modelu
 * (`@property`), nie polem — `model_dump` jej nie serializuje, więc nie ma jej w rekordzie.
 * `w_domenie_walidacji` (§3b, karta A2) — predykat „bieg należy do zadeklarowanej domeny
 * walidacji silnika"; `null` dla dowodu bez biegu (metoda inna niż symulacja i obliczenie)
 * albo bez zadeklarowanej domeny. `domena_pl` towarzyszy każdej rozstrzygniętej wartości
 * predykatu (oba pola razem albo wcale — walidator backendu).
 */
export interface StatusDowodu {
  readonly metoda: MetodaDowodu;
  readonly poziom: EvidenceTier;
  readonly rodzaj_twierdzenia: ClaimKind;
  readonly status_modelu: StatusModelu;
  readonly status_danych: StatusDanych;
  readonly odniesienie: string | null;
  readonly w_domenie_walidacji: boolean | null;
  readonly domena_pl: string | null;
}

/** Niepewność: wartość z metodą oszacowania ALBO jawny powód braku (§6). */
export interface Niepewnosc {
  readonly wartosc: Wielkosc | null;
  readonly metoda_pl: string | null;
  readonly nie_dotyczy: boolean;
  readonly powod_pl: string | null;
}

// ---------------------------------------------------------------------------
// Kryterium, przedmiot, wynik, limit, margines
// ---------------------------------------------------------------------------

/**
 * Kryterium: opis, warunek w LaTeX (pusty dozwolony wyłącznie dla relacji `LOGICZNE`),
 * warunek wstępny uruchomienia i jego podstawa (karta A2; np. obwiednia FRT jako warunek
 * wstępny z własną podstawą, §5.1) — oba pola razem albo wcale (walidator backendu).
 */
export interface Kryterium {
  readonly opis_pl: string;
  readonly warunek_latex: string;
  readonly relacja: Relacja;
  readonly warunek_wstepny_pl: string | null;
  readonly warunek_wstepny_podstawa: PodstawaWymagania | null;
}

/** CO oceniono: odnośnik elementu, nazwa i zdanie opisujące przedmiot oceny. */
export interface Przedmiot {
  readonly element_ref: string | null;
  readonly nazwa_pl: string;
  readonly opis_pl: string;
}

/** Wielkość zmierzona albo obliczona z punktem krytycznym i metodą. */
export interface WynikKryterium {
  readonly wielkosc_pl: string;
  readonly symbol_latex: string;
  readonly wartosc: Wielkosc;
  readonly punkt_krytyczny_pl: string | null;
  readonly chwila_s: number | null;
  readonly metoda: MetodaDowodu;
}

/** Punkt obwiedni limitu: chwila [s] i wartość w jednostce obwiedni. */
export interface PunktObwiedni {
  readonly t_s: number;
  readonly wartosc: number;
}

/** Limit w DOKŁADNIE jednej postaci (wartość, pasmo albo obwiednia) z podstawą (T4). */
export interface LimitKryterium {
  readonly wartosc: Wielkosc | null;
  readonly pasmo: readonly [Wielkosc, Wielkosc] | null;
  readonly obwiednia: readonly PunktObwiedni[] | null;
  readonly jednostka_obwiedni: string | null;
  readonly podstawa: PodstawaWymagania;
  readonly zakres_stosowalnosci_pl: string | null;
  readonly wersja_profilu: string | null;
}

/** Margines: wartość z definicją i skalą ALBO jawnie niedefiniowalny z powodem (§2.4). */
export interface Margines {
  readonly wartosc: Wielkosc | null;
  readonly definicja_latex: string | null;
  readonly punkt_pl: string | null;
  readonly skala: Wielkosc | null;
  readonly skala_rodzaj: RodzajSkali | null;
  readonly wzgledny: number | null;
  readonly niedefiniowalny: boolean;
  readonly powod_pl: string | null;
}

// ---------------------------------------------------------------------------
// Zakres, ślad, wyjaśnienie, stosowalność, etykieta
// ---------------------------------------------------------------------------

/** Zakres ważności wyniku (§7): wynik NIGDY nie jest opisany szerzej niż ten zakres. */
export interface ZakresWaznosci {
  readonly rodzaj_analizy: DziedzinaFizyki | null;
  readonly opis_pl: string;
  readonly technologia: string | null;
  readonly model_urzadzenia: string | null;
  readonly symetria_zaklocenia: string | null;
  readonly parametry_sieci: readonly DanaPrzyjeta[];
  readonly regulator: string | null;
  readonly ograniczniki: readonly string[];
  readonly wykluczenia: readonly string[];
}

/** Odnośnik do kroku śladu WHITE BOX (§8). */
export interface OdnosnikSladu {
  readonly run_id: string | null;
  readonly wersja_silnika: string | null;
  readonly krok: string;
  readonly opis_pl: string;
}

/** Wyjaśnienie werdyktu (§5) — składane WYŁĄCZNIE przez generator backendu. */
export interface WyjasnienieWerdyktu {
  readonly zdanie_pl: string;
  readonly przyczyna_pl: string | null;
  readonly czego_brakuje: readonly string[];
  readonly zastrzezenia: readonly string[];
}

/** Stosowalność kryterium albo wymagania do przedmiotu; powód niepusty ZAWSZE (T10). */
export interface Stosowalnosc {
  readonly typ_modulu: string | null;
  readonly technologia: string | null;
  readonly modul_istniejacy: boolean | null;
  readonly dotyczy: boolean;
  readonly powod_pl: string;
  readonly podstawa: PodstawaWymagania | null;
  readonly warunek_wstepny_nieuruchomiony: boolean;
}

/** Etykieta PL i semantyka koloru statusu (§9) — liczona w backendzie, niesiona w rekordzie. */
export interface Etykieta {
  readonly etykieta_pl: string;
  readonly semantyka: SemantykaKoloru;
}

// ---------------------------------------------------------------------------
// Rekordy poziomu K i W
// ---------------------------------------------------------------------------

/** Rekord poziomu K: JEDNO kryterium na JEDNYM przedmiocie (§4.1). */
export interface OcenaKryterium {
  readonly kryterium_id: string;
  readonly przedmiot: Przedmiot;
  readonly kryterium: Kryterium;
  readonly podstawa: PodstawaWymagania;
  readonly stosowalnosc: Stosowalnosc;
  readonly wynik: WynikKryterium | null;
  readonly limit: LimitKryterium | null;
  readonly margines: Margines | null;
  readonly niepewnosc: Niepewnosc;
  readonly status_maszynowy: StatusWerdyktu;
  readonly kompletnosc_dowodu: KompletnoscDowodu;
  readonly powody_niepelnosci: readonly string[];
  readonly etykieta: Etykieta;
  readonly wyjasnienie: WyjasnienieWerdyktu;
  readonly dowod: StatusDowodu;
  readonly zakres_waznosci: ZakresWaznosci;
  readonly slad: readonly OdnosnikSladu[];
}

/**
 * Rekord poziomu W: JEDNO wymaganie dla JEDNEGO modułu/obiektu (§4.2). Agregat NIGDY nie
 * zastępuje składników — `oceny_skladowe` są częścią rekordu i każdej powierzchni, która
 * go pokazuje.
 */
export interface WynikWymagania {
  readonly wymaganie_id: string;
  readonly nazwa_pl: string;
  readonly podstawa: PodstawaWymagania;
  readonly stosowalnosc: Stosowalnosc;
  readonly sposob_wykazania: MetodaDowodu;
  /**
   * Podstawa REGUŁY czyniącej sposób wykazania właściwym (np. pokrycie wymagania certyfikatem
   * urządzenia z warstwy WiPWC); `null` — sposób bez osobnej reguły (zawsze przy `BRAK_METODY`).
   */
  readonly podstawa_sposobu_wykazania: PodstawaWymagania | null;
  readonly oceny_skladowe: readonly OcenaKryterium[];
  readonly pokrycie_programu: PokrycieProgramu;
  readonly pokrycie_programu_pl: string;
  readonly status_maszynowy: StatusWerdyktu;
  readonly kompletnosc_dowodu: KompletnoscDowodu;
  readonly powody_niepelnosci: readonly string[];
  readonly kryteria_naruszone: readonly string[];
  readonly kryterium_najblizej_granicy: string | null;
  readonly etykieta: Etykieta;
  readonly wyjasnienie: WyjasnienieWerdyktu;
  readonly dowod: StatusDowodu;
  readonly zakres_waznosci: ZakresWaznosci;
  readonly slad: readonly OdnosnikSladu[];
}

/** Rekord werdyktu dowolnego poziomu. */
export type RekordWerdyktu = OcenaKryterium | WynikWymagania;

/**
 * Rozróżnienie poziomu rekordu po KSZTAŁCIE (obecność `wymaganie_id` — pole wyłącznie
 * rekordu W). Nie czyta statusu ani żadnej wartości oceny.
 */
export function jestWynikiemWymagania(rekord: RekordWerdyktu): rekord is WynikWymagania {
  return 'wymaganie_id' in rekord;
}
