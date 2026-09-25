/*
 * Model danych WSPÓLNEGO WZORCA EKRANU ANALIZY (karta E8.1 / W-606).
 *
 * Fundament wszystkich okien wyników U3/U4 (rozpływ, zwarcia, analizy specjalne,
 * OZE). Wzorzec jest W PEŁNI STEROWANY PROPSAMI — te typy opisują PROJEKCJĘ
 * jednego wyniku analizy przekazywaną z zewnątrz (adaptera konkretnej analizy).
 * Zero fizyki, zero wyliczeń, zero wołań API/store'ów w tej warstwie.
 *
 * Struktura okna (W-606): nagłówek (analiza + świeżość + akcje) → ZAŁOŻENIA
 * (część wyniku, W-602) → TABELA wyników (kolumny deklaratywne) → WYKRES (slot).
 * Każda liczba niesie semantykę `ValueRow` (2× klik → dowód gdy `dowodRef`).
 */

import type { ReactNode } from 'react';
import type { ElementType } from '../../../ui/types';

/** Nagłówek ekranu analizy. */
export interface NaglowekAnalizy {
  /** Nazwa analizy po polsku (pierwszy plan). */
  analizaPL: string;
  /**
   * Identyfikator przebiegu — metadana produkcyjna: WYŁĄCZNIE w „Informacjach
   * audytowych" (tryb ekspercki, zwinięte), nigdy w nagłówku (karta #145).
   */
  runId?: string;
  /** Bieżąca rewizja modelu (do oceny świeżości wyników). */
  rewizjaModelu?: number;
  /** Rewizja modelu, przy której policzono wyniki (świeżość — FreshnessBadge). */
  rewizjaDanych?: number;
  /**
   * Wariant pracy, do którego należy wynik (V12K-264). Z nim ekran potrafi
   * odpowiedzieć NA CO wynik jest nieaktualny — pobiera dziennik zmian modelu
   * i pokazuje listę przyczyn zamiast samej pary rewizji.
   */
  caseId?: string;
}

/**
 * Wiersz sekcji ZAŁOŻENIA — jedna dana wejściowa/parametr przebiegu.
 * „Założenia są częścią wyniku" (W-602): każda liczba wyniku ma tu swój kontekst.
 */
export interface WierszZalozenia {
  etykieta: string;
  wartosc: string | number;
  jednostka?: string;
  /** Pochodzenie/uwaga — pokazywane w dymku (`title`). */
  uwaga?: string;
  /**
   * Założenie wyrażone ZDANIEM (np. „Ocena jest interpretacją normatywną…"), a nie parą
   * wielkość–wartość. Zdanie czyta się jak tekst: wyrównane do lewej, zwykłą czcionką,
   * na całą szerokość — nie jak liczba (karta #145: założenia LoM wyrównane do prawej
   * czcionką maszynową czytały się jak zrzut kodu). `etykieta` jest wtedy pomijana.
   */
  zdanie?: boolean;
}

/**
 * Wartość pojedynczej komórki tabeli — semantyka `ValueRow`.
 * `wartosc` jest zwykle wstępnie sformatowanym łańcuchem (adapter formatuje
 * deterministycznie); `sortKey` daje poprawne sortowanie liczbowe mimo formatu.
 */
export interface WartoscKomorki {
  wartosc: string | number;
  jednostka?: string;
  /** Odwołanie do dowodu WHITE BOX (2× klik → onOtworzDowod). */
  dowodRef?: string;
  /** Przekroczony próg → tag ostrzegawczy (próg wyznacza adapter, nie wzorzec). */
  ostrzezenie?: boolean;
  /** Klucz sortowania liczbowego, gdy `wartosc` jest sformatowanym łańcuchem. */
  sortKey?: number;
}

/** Wyrównanie treści kolumny. */
export type WyrownanieKolumny = 'lewo' | 'prawo';

/** Deklaratywna definicja kolumny tabeli wyników (karta E8.1 §2). */
export interface DefinicjaKolumny {
  /** Klucz pola w wierszu danych (`WierszTabeli[klucz]`). */
  klucz: string;
  /** Etykieta nagłówka po polsku. */
  etykieta: string;
  /** Jednostka fizyczna (pokazywana w nagłówku, zawsze gdy dotyczy). */
  jednostka?: string;
  /** Wartości liczbowe → mono + tabular-nums (domyślnie wyrównanie do prawej). */
  mono?: boolean;
  /** Wyrównanie treści (domyślnie: `prawo` dla mono, `lewo` dla tekstu). */
  wyrownanie?: WyrownanieKolumny;
  /** Kolumna sortowalna (domyślnie true). */
  sortowalna?: boolean;
  /** Kolumna identyfikatora — widoczna WYŁĄCZNIE w trybie eksperckim. */
  tylkoEkspercki?: boolean;
}

/** Jeden wiersz tabeli: mapowanie klucz kolumny → wartość komórki. */
export type WierszTabeli = Record<string, WartoscKomorki>;

/** Kierunek sortowania kolumny. */
export type KierunekSortowania = 'rosnaco' | 'malejaco';

/** Aktywne sortowanie tabeli (null = kolejność źródłowa, stabilna). */
export interface StanSortowania {
  klucz: string;
  kierunek: KierunekSortowania;
}

/** Props głównego komponentu wzorca (karta E8.1 §2). */
export interface EkranAnalizyProps {
  naglowek: NaglowekAnalizy;
  zalozenia: WierszZalozenia[];
  kolumny: DefinicjaKolumny[];
  wiersze: WierszTabeli[];
  /** Slot wykresu (opcjonalny) — np. profil napięcia (Recharts). */
  wykres?: ReactNode;
  /**
   * Dostawca dowodu WHITE BOX elementu (2x klik w komorke z `dowodRef`).
   * BRAK propsa = ekran nie ma dowodow per element (afordancja sie nie pokazuje);
   * pusta funkcja jest ZAKAZANA — udawalaby zdolnosc, ktorej ekran nie ma.
   */
  onOtworzDowod?: (ref: string) => void;
  /** Eksport przez callback (stopka) — brak = brak przycisku. */
  onEksport?: () => void;
  /** Akcja przeliczenia (pokazywana przy nieaktualnych wynikach). */
  onPrzelicz?: () => void;
  /**
   * Klik w element dotknięty zmianą, która unieważniła wynik (V12K-264) —
   * ostatnie ogniwo drogi „werdykt → przyczyna → element modelu". Bez tej
   * funkcji lista przyczyn pozostaje czytelna, ale nieklikalna.
   */
  onPokazElement?: (elementRef: string) => void;
  trybZaawansowania: import('../../shell/modeModel').AdvancementMode;
  /**
   * Metadane produkcyjne TEGO wyniku (odciski danych wejściowych i modelu, wersje,
   * identyfikatory) — trafiają do JEDYNEGO miejsca na metadane, „Informacji
   * audytowych" pod nagłówkiem, obok identyfikatora przebiegu (karta #145).
   */
  informacjeAudytowe?: readonly import('./InformacjeAudytowe').WierszInformacjiAudytowych[];
  /**
   * Który klucz kolumny identyfikuje wiersz (klucz React, stabilny przy sortowaniu).
   * Domyślnie: klucz pierwszej kolumny.
   */
  kluczWiersza?: string;
  /**
   * Natywny wybór wiersza (delta API E8.2): klik/Enter na wierszu woła callback
   * z wartością klucza wiersza. Brak = tabela bez wyboru.
   */
  onWybierzWiersz?: (klucz: string) => void;
  /** Wartość klucza aktualnie wybranego wiersza (podświetlenie + aria-selected). */
  wybranyWiersz?: string | null;
  /**
   * Typ elementu sieci DANEGO wiersza (karta UI2 p.6) — gdy podany,
   * natywny wybór wiersza (klik/Enter) DODATKOWO zapisuje zaznaczenie w
   * JEDNYM store'ze zaznaczenia (`ui/selection`, `useGlobalSelectionSync().
   * selectFromResults`) — ta sama prawda synchronizacji SLD ↔ inspektor ↔
   * drzewo, którą używa reszta aplikacji; ZERO drugiego store'u zaznaczenia.
   * Zwraca `undefined`, gdy wiersz nie mapuje na pojedynczy element modelu
   * (agregat systemowy, typ niejednoznaczny w kontrakcie) — wtedy klik
   * NIE zapisuje nic do store'u (uczciwy brak, zero zgadywania typu elementu).
   * Brak propsa = zachowanie 1:1 (klik ustawia wyłącznie lokalne podświetlenie
   * wiersza przez `onWybierzWiersz`, jak dotąd).
   */
  typElementuWiersza?: (klucz: string) => ElementType | undefined;
  /**
   * Identyfikator REALNEGO elementu modelu dla wiersza (karta UI2 p.6,
   * poprawka KLASA NIE INSTANCJA) — gdy podany, zasila PIERWSZY argument
   * `selectFromResults(elementId, typ, nazwa)` ZAMIAST wartości kolumny-klucza
   * wiersza (`kluczWiersza`). WYMAGANY tam, gdzie kolumna-klucz jest kluczem
   * WIERSZA TABELI (React key + podświetlenie), nie identyfikatorem elementu —
   * jedyny dziś taki przypadek: walidacja energetyczna (`KLUCZ_WIERSZA_WALIDACJI`),
   * gdzie klucz wiersza jest KOMPOZYTEM `check_type::target_id::index` (bo jeden
   * element bywa oceniany kilkoma rodzajami kontroli — `target_id` sam w sobie
   * nie jest unikatowy). Bez tego resolvera klik zapisałby kompozyt jako
   * identyfikator zaznaczenia — SLD próbowałoby wycentrować się na elemencie,
   * którego w modelu NIE MA. Brak propsa → spadek na wartość kolumny-klucza
   * (poprawne wszędzie indziej, gdzie klucz wiersza JEST 1:1 refem elementu).
   */
  elementIdWiersza?: (klucz: string) => string | undefined;
  /**
   * Nazwa CZYTELNA DLA CZŁOWIEKA elementu danego wiersza (karta UI2 p.6,
   * poprawka KLASA NIE INSTANCJA po przeglądzie 2026-08-01) — zasila TRZECI
   * argument `selectFromResults(elementId, typ, nazwa)` RAZEM z `typElementuWiersza`.
   * WYMAGANA wszędzie, gdzie kolumna-klucz wiersza (`kluczWiersza`) jest
   * identyfikatorem TECHNICZNYM różnym od wyświetlanej nazwy (np. kontyngencje:
   * `element_ref` vs `element_name`; walidacja energetyczna: klucz złożony
   * `check_type::target_id::index` vs `target_name`; punkty zwarciowe:
   * `target_id` vs `target_name`) — bez niej panel właściwości/inspektor
   * pokazywałby po zaznaczeniu identyfikator techniczny zamiast nazwy
   * inżynierskiej. Brak propsa → spadek na wartość kolumny-klucza (poprawne
   * WYŁĄCZNIE tam, gdzie ta kolumna JUŻ JEST czytelną nazwą, np. `branch_id`
   * „L-1" w tabelach rozpływu — tam osobna nazwa nie istnieje).
   */
  nazwaElementuWiersza?: (klucz: string) => string | undefined;
  /**
   * Pętla decyzji (F-E6.1): akcja „Popraw w modelu" na wierszach z
   * przekroczeniem (dowolna komórka `ostrzezenie`). Wołana z kluczem wiersza
   * (= ref elementu). Brak = kolumna decyzji niepokazywana (zero zmiany
   * dzisiejszego zachowania ekranów nie-konsumujących).
   */
  onPoprawWModelu?: (klucz: string) => void;
  /**
   * Predykat decydujący, czy DANY wiersz z przekroczeniem jest „naprawialny
   * w modelu" (F-E6.2). Domyślnie (brak predykatu) przycisk pokazuje się na
   * KAŻDYM wierszu z ostrzeżeniem. Screeny, w których część przekroczeń dotyczy
   * agregatów systemowych bez elementu modelu (np. bilans strat `target_id=network`),
   * podają predykat, by NIE renderować martwego przycisku na tych wierszach.
   * Wołany z kluczem wiersza (tą samą wartością co `onPoprawWModelu`).
   */
  wierszDecyzyjny?: (klucz: string) => boolean;
  /**
   * Rodzaj przekroczenia DANEGO wiersza (K1 / F-E6.3): steruje etykietą i opisem
   * przycisku decyzji przez rejestr `akcjeNaprawcze.ts` (etykieta kontekstowa
   * wyłącznie tam, gdzie akcja różni się od generycznej — §0.5). Brak propsa
   * lub `undefined` dla wiersza = etykieta generyczna (zachowanie 1:1).
   */
  rodzajWiersza?: (klucz: string) => import('./akcjeNaprawcze').RodzajPrzekroczenia | undefined;
}
