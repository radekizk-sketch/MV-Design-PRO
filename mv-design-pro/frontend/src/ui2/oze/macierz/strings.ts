/*
 * Teksty i deterministyczne formatery okna „Macierz wymogów NC RfG per moduł" (karta P39;
 * kontrakt V2 — karta AB-1a Pakiet D2) — wyłącznie polski język techniczny pierwszoplanowy.
 * Formatery są CZYSTE (wejście→wyjście), bez `Date.now`/losowości; przecinek dziesiętny PL.
 *
 * Żadnych etykiet statusu werdyktu ani klas koloru po statusie: etykietę i semantykę niesie
 * rekord backendu (`ocena.etykieta`), a kolor nadaje `EtykietaWerdyktu`/`KartaWerdyktu`
 * (jedyna mapa semantyka → kolor). Dawne mapy werdykt/status → tekst/klasa są skasowane.
 */

import type { FormatDokumentu } from '../ncrfg/api';
import type { PochodzenieDanej, PoleZdolnosci, PowodBlokady } from './macierzModel';

export const MACIERZ_STRINGS = {
  // Nagłówek
  tytul: 'Macierz wymogów NC RfG per moduł',
  podtytul:
    'Rekordy oceny testów procedury PTPiREE dla wszystkich modułów wytwórczych projektu naraz — ' +
    'każda komórka prowadzi do pełnej oceny (kryterium, wynik, limit, podstawa, dowód).',
  operator: 'Operator sieci (profil wymagań)',
  wersjaProcedury: 'Wersja procedury',
  przeprowadz: 'Przeprowadź bieg „co-jeśli"',
  wTrakcie: 'Trwa bieg „co-jeśli"…',
  opisBiegu:
    'Bieg „co-jeśli" liczy się z danych formularza modułów (dane bez walidacji w modelu), więc ' +
    'dowód każdego rekordu jest niepełny, a certyfikatu urządzenia bieg nie niesie. Zgodność ' +
    'zatwierdzonego modelu (z dowodem certyfikatu wyprowadzonym przez serwer) pokazuje sekcja ' +
    '„Zgodność przypadku" — z niej powstaje certyfikat zgodności.',

  // Stan pusty / błędy / blokady
  brakModulow: 'Brak modułów wytwórczych do oceny',
  brakModulowOpis:
    'Dodaj układ PV, magazyn energii albo farmę wiatrową z katalogu urządzeń, a następnie ' +
    'przypisz moc, punkt przyłączenia i profil operatora. Ocena zgodności jest ' +
    'niedostępna bez danych wejściowych — to nie jest błąd solvera, tylko brak modelu.',
  brakModulowGotowych:
    'Żaden moduł nie ma kompletu danych modelu (moc i napięcie przyłączenia) — uzupełnij model.',
  brakPrzypadkuWejsc:
    'Wybierz przypadek obliczeniowy — formularz biegu startuje z danych zatwierdzonego modelu przypadku.',
  wczytywanieWejsc: 'Trwa odczyt danych modułów z zatwierdzonego modelu…',
  bladWejsc: 'Nie udało się odczytać danych modułów z zatwierdzonego modelu',
  brakOperatora: 'Wybierz operatora sieci (profil wymagań) — bez niego bieg nie ma podstawy wymagań.',
  bledyFormularza: 'Popraw pola formularza modułu',
  brakBieguOpis:
    'Użyj przycisku „Przeprowadź bieg „co-jeśli"", aby wypełnić macierz rekordami oceny testów.',
  bladBiegu: 'Nie udało się przeprowadzić biegu',
  bladKatalogu: 'Nie udało się pobrać katalogu wymogów procedury',

  // Macierz
  naglowekTestu: 'Test procedury',
  filtr: 'Pokaż komórki',
  filtrWszystkie: 'wszystkie rekordy',
  rodzajTwierdzenia: 'Rodzaj twierdzenia',
  zdolnosc: 'Zdolność dowodowa',
  pokazModul: 'Wybierz moduł',

  // Moduł (kolumna, panel wyniku)
  klasaModulu: 'Typ modułu',
  ponizejProgu: 'poniżej progu',
  wynikModuluTytul: 'Wynik biegu modułu',
  wymaganiaModuluTytul: 'Wymagania profilu — rekordy oceny modułu',
  wynikModuluBrak: 'Moduł nie był objęty ostatnim biegiem.',
  // Stan oceny FRT/HVRT zapisany z okna „Walidacja modelu falownika" (tekst z rekordu).
  wynikFrtLvrt: 'Walidacja LVRT',
  wynikFrtHvrt: 'Walidacja HVRT',

  // Szczegół komórki
  szczegolTytul: 'Ocena komórki macierzy',
  szczegolWybierz:
    'Wybierz komórkę macierzy, aby zobaczyć pełną ocenę testu: kryterium, wynik, limit, podstawę, dowód i ślad.',
  wymaganie: 'Stosowalność testu',
  podstawaProcedury: 'Podstawa w procedurze',
  warunekTestu: 'Warunek testu',
  metryki: 'Wartości biegu',
  slad: 'Ślad obliczeń',
  otworzSlad: 'Pokaż ślad obliczeń',
  ukryjSlad: 'Ukryj ślad obliczeń',
  sladPusty: 'Bieg nie zawiera kroków śladu dla tego testu.',
  sladWzor: 'Wzór',
  sladDane: 'Dane wejściowe',
  sladPodstawienie: 'Podstawienie',
  sladWynik: 'Wynik',
  sladJednostki: 'Weryfikacja jednostek',
  brakMetryk: 'Bieg nie podaje wartości liczbowych dla tego testu.',
  brakWyniku: 'brak wyniku',

  // Certyfikat zgodności (z zatwierdzonego modelu przypadku)
  certyfikatPrzycisk: 'Certyfikat zgodności',
  certyfikatTytulNieaktywny:
    'Certyfikat powstaje z zatwierdzonego modelu aktywnego przypadku — wybierz przypadek i operatora.',
  certyfikatTytulAktywny: 'Zbuduj certyfikat zgodności z zatwierdzonego modelu przypadku',
  certyfikatNaglowek: 'Certyfikat zgodności NC RfG',
  certyfikatProjekt: 'Projekt',
  certyfikatPrzypadek: 'Przypadek',
  certyfikatProcedura: 'Procedura',
  certyfikatNarzedzie: 'Wersja narzędzia',
  certyfikatZalozenia: 'Założenia i źródła',
  certyfikatPobierzDocx: 'Pobierz DOCX',
  certyfikatPobierzPdf: 'Pobierz PDF',
  certyfikatBrakiTytul: 'Czego brakuje do certyfikatu',
  certyfikatLadowanie: 'Buduję certyfikat…',
  certyfikatBlad: 'Nie udało się zbudować certyfikatu zgodności',
  certyfikatZamknij: 'Zamknij podgląd certyfikatu',
  projektBezNazwy: 'Projekt bez nazwy',
  odciskWejscia: 'Odcisk wejścia (SHA-256)',
  odciskWyniku: 'Odcisk wyniku (SHA-256)',
  wersjaSolvera: 'Wersja solvera',
  odciskBiegu: 'Odcisk deterministyczny biegu',
  odciskWejsciaBiegu: 'Odcisk wejścia biegu',

  // Zgodność przypadku (z zatwierdzonego modelu)
  zgodnoscPrzekrojowaTytul: 'Zgodność przypadku (zatwierdzony model)',
  zgodnoscPrzekrojowaOpis:
    'Rekordy oceny liczone z bieżącego zatwierdzonego modelu dla wszystkich źródeł naraz — ten ' +
    'sam solver i ta sama ocena wymagań co certyfikat; dowód certyfikatu urządzenia wyprowadza ' +
    'serwer z tabliczki i wykazu PTPiREE. Brak danej w modelu = ocena niewykonana z nazwanym ' +
    'brakiem, nigdy wartość domyślna.',
  zgodnoscPrzekrojowaOdswiez: 'Odśwież',
  zgodnoscPrzekrojowaLadowanie: 'Sprawdzam zgodność…',
  zgodnoscPrzekrojowaBrakPrzypadku: 'Wybierz aktywny przypadek, aby sprawdzić zgodność modelu.',
  zgodnoscPrzekrojowaBrakOperatora:
    'Wybierz operatora sieci (profil wymagań), aby sprawdzić zgodność modelu.',
  zgodnoscPrzekrojowaBrakDer:
    'Model nie zawiera żadnego źródła przekształtnikowego (PV/BESS/FW) — dodaj układ ' +
    'wytwórczy, aby zobaczyć zgodność NC RfG.',
  zgodnoscPrzekrojowaBlad: 'Nie udało się sprawdzić zgodności przypadku',
  zgodnoscPrzekrojowaPokazWMacierzy: 'Pokaż w macierzy',
  zgodnoscPrzekrojowaPominieteTytul: 'Źródła modelu nieobjęte oceną',

  // Panel modułu (formularz biegu „co-jeśli")
  panelTytul: 'Dane wejściowe modułu (bieg „co-jeśli")',
  panelOpis:
    'Wartości odczytane z zatwierdzonego modelu przypadku (wiązania krzywych i modelu dynamicznego, ' +
    'statyzm, martwa strefa, cos φ i zakres mocy biernej z danych źródła, deklaracje modułu, art. 4, ' +
    'data umowy, nastawy) są oznaczone „z modelu"; pozostałe wartości deklaruje projektant — nie ' +
    'modyfikują modelu sieci. Pole puste = brak danej (ocena niewykonana z nazwanym brakiem), nigdy ' +
    'wartość typowa.',
  kolMoc: 'Moc maksymalna',
  kolNapiecie: 'Napięcie przyłączenia',
  zdolnosci: 'Zdolności techniczne',
  parametry: 'Parametry modułu',
  art4: 'Moduł istniejący (art. 4 ust. 1 rozporządzenia 2016/631)',
  art4Nieustalone: 'nieustalone — oceniany jak nowy, z zastrzeżeniem',
  art4Tak: 'tak — moduł istniejący',
  art4Nie: 'nie — moduł nowy',
  dataUmowy: 'Data umowy przyłączeniowej (wersje warstw profilu)',
  nastawyTytul: 'Nastawy zabezpieczeń modułu (koordynacja statyczna)',
  nastawyOpis:
    'Nastawy z karty nastaw albo nastawnika; źródło jest obowiązkowe, gdy podano choć jedną wartość.',
  nastawyZrodlo: 'Źródło nastaw',
  brakNapiecia:
    'Brak danych: napięcie przyłączenia. Uzupełnij poziom napięcia szyny przyłączenia w karcie źródła — moduł nie zostanie objęty biegiem bez tej danej.',
  brakMocy:
    'Brak danych: moc znamionowa. Wybierz urządzenie z katalogu — moduł nie zostanie objęty biegiem bez tej danej.',
  brakWejsciaModelu:
    'Brak danych modułu z zatwierdzonego modelu przypadku (przypadek i operator niewybrane, odczyt ' +
    'w toku albo nieudany, albo model przypadku nie obejmuje tego źródła) — formularz biegu ' +
    'startuje wyłącznie z danych modelu.',
} as const;

/** Etykiety flag zdolności (nazwy pól kontraktu → opis PL; klucze nie są statusem). */
export const ETYKIETY_ZDOLNOSCI: Readonly<Record<PoleZdolnosci, string>> = {
  has_lvrt_curve: 'Krzywa LVRT',
  has_hvrt_curve: 'Krzywa HVRT',
  has_pf_droop: 'Statyzm P(f)',
  has_qu_curve: 'Charakterystyka Q(U)',
  has_dynamic_model: 'Model dynamiczny',
  has_scada_communication: 'Łączność SCADA operatora',
  has_disturbance_recorder: 'Rejestrator zakłóceń',
  active_power_control_enabled: 'Regulacja mocy czynnej',
  stop_generation_enabled: 'Zaprzestanie generacji na polecenie',
  reduction_generation_enabled: 'Zmniejszenie generacji na polecenie',
  island_operation_required: 'Wymagana praca wyspowa',
  island_operation_capable: 'Zdolność pracy wyspowej',
  black_start_required: 'Wymagany rozruch autonomiczny',
  black_start_capable: 'Zdolność rozruchu autonomicznego',
  power_oscillation_damping_required: 'Wymagane tłumienie kołysań mocy',
  power_oscillation_damping_enabled: 'Tłumienie kołysań mocy aktywne',
};

/** Etykiety pochodzenia danej (uczciwość źródła danych). */
export const ETYKIETY_POCHODZENIA: Readonly<Record<PochodzenieDanej, string>> = {
  model: 'z modelu',
  deklarowane: 'dane deklarowane',
};

/** Etykiety powodu blokady modułu (jawny stan braku danych, bez zgadywania). */
export const ETYKIETY_BLOKADY: Readonly<Record<PowodBlokady, string>> = {
  brak_napiecia: 'brak danych: napięcie przyłączenia',
  brak_mocy: 'brak danych: moc znamionowa',
  brak_wejscia_modelu: 'brak danych modułu z modelu przypadku',
};

/** Nazwa pliku certyfikatu: `certyfikat-zgodnosci-RRRR-MM-DD.<docx|pdf>` (data jako argument). */
export function nazwaPlikuCertyfikatu(data: Date, format: FormatDokumentu): string {
  const rrrr = data.getFullYear().toString().padStart(4, '0');
  const mm = (data.getMonth() + 1).toString().padStart(2, '0');
  const dd = data.getDate().toString().padStart(2, '0');
  return `certyfikat-zgodnosci-${rrrr}-${mm}-${dd}.${format}`;
}

/** Deterministyczny format liczby z przecinkiem dziesiętnym (PL). */
export function formatLiczba(value: number, miejsca = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(miejsca).replace('.', ',').replace(/,00$/, '');
}

/** Format mocy [kW] → prezentacja w kW lub MW gdy ≥ 1000 kW. */
export function formatMoc(kw: number | null): string {
  if (kw === null || !Number.isFinite(kw)) return '—';
  if (kw >= 1000) return `${formatLiczba(kw / 1000, 3)} MW`;
  return `${formatLiczba(kw, 1)} kW`;
}

/** Format napięcia [kV]. */
export function formatNapiecie(kv: number | null): string {
  if (kv === null || !Number.isFinite(kv)) return '—';
  return `${formatLiczba(kv, 2)} kV`;
}

/** Deterministyczny podpis wartości biegu (klucz → wartość) — bez interpretacji. */
export function opiszMetryke(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return formatLiczba(value, 3);
  if (typeof value === 'boolean') return value ? 'tak' : 'nie';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
