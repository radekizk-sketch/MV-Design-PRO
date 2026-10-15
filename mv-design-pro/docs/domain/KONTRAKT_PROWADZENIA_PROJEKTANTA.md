# Kontrakt prowadzenia projektanta — filozofia walidacji MV-DESIGN-PRO

Status: WIĄŻĄCY (dyrektywa właściciela 2026-10-15). Obowiązuje wszystkie kreatory,
konfiguratory, panele powłoki, kanwę SLD i moduły obliczeniowe. Podporządkowany kanonowi
V12.xx; współistnieje z `KONTRAKT_WERDYKTU_WYJASNIALNEGO.md` (wynik oceny bez danych dalej
mówi uczciwie „brak podstawy / brak dowodu” — to jest WYNIK, nie szum edycji).

**Zasada nadrzędna: aplikacja myśli jak doświadczony projektant SN, a nie jak walidator
formularzy.**

## 1. Klasy sygnałów

Każdy komunikat, odznaka, licznik, kolor stanu i blokada przycisku należy do dokładnie jednej
klasy. Klasa decyduje, czy i kiedy sygnał jest widoczny.

| Klasa | Znaczenie | Przykład | Kiedy widoczny |
|---|---|---|---|
| `KONFLIKT_TECHNICZNY` | Model jest fizycznie albo topologicznie sprzeczny niezależnie od tego, czy praca jest skończona | pola przelotowe na dwóch różnych szynach SN; transformator, którego napięcia nie pasują do szyn; pętla zamknięta łącznikami bez zamiaru pierścienia | zawsze, przy obiekcie, z akcją naprawczą |
| `NARUSZENIE_OGRANICZENIA` | Wynik albo nastawa przekracza ograniczenie techniczne lub normowe | przeciążenie kabla, prąd zwarciowy ponad wytrzymałość aparatu, nastawa poza zakresem przekaźnika, spadek napięcia ponad limit | zawsze — jako wynik z werdyktem wyjaśnialnym |
| `BRAK_DO_OPERACJI` | Brak parametru niezbędnego do konkretnej operacji (zapis elementu, obliczenie, eksport) | brak tabliczki transformatora przy uruchomieniu rozpływu; brak nastaw przy ocenie zabezpieczeń | DOPIERO przy próbie tej operacji: jedno wskazanie konkretnego parametru (co, gdzie, po co) z akcją, która do niego prowadzi; nigdy ogólne „uzupełnij dane” |
| `KONFIGURACJA_W_TOKU` | Stan pośredni pracy, którą użytkownik jeszcze buduje | stacja bez odbiorów w trakcie budowy; pole bez wybranej pozycji katalogu przed zapisem kreatora; deklaracja rodzaju stacji przed dodaniem pól | nigdy jako ostrzeżenie; postęp pokazuje tok pracy (krok kreatora, następny krok), nie lista braków |
| `AUTO_PRZYJETE` | Wartość dobrana automatycznie z szablonu, katalogu producenta, wartości domyślnej albo zależności | rodzina rozdzielnicy z szablonu stacji; napięcie nN z transformatora; przekrój z katalogu dla wybranej rodziny | widoczna dyskretnie jako „przyjęto: X (źródło)” przy polu, zawsze edytowalna; nigdy jako ostrzeżenie |

## 2. Reguły

1. **Prowadzenie zamiast listy braków.** Kreator startuje z sensownym kompletem: szablon,
   pierwsza zgodna pozycja katalogu, zależności (napięcie szyny → katalog, transformator →
   napięcie nN, rodzina rozdzielnicy → pola). Brak do wyboru = wybór podany, nie komunikat.
2. **Cisza o pracy w toku.** Nie wyświetlamy ostrzeżeń o konfiguracji, której użytkownik nie
   zakończył (kreator otwarty, krok niezakończony, element dopiero wstawiony). Licznik
   „Kontrola: N” i paski gotowości liczą wyłącznie `KONFLIKT_TECHNICZNY` i
   `NARUSZENIE_OGRANICZENIA`.
3. **Brak pokazuje się w chwili, gdy blokuje.** `BRAK_DO_OPERACJI` pojawia się przy próbie
   operacji, która go wymaga, z wskazaniem jednego konkretnego parametru i przejściem do niego.
   Bramka gotowości przed obliczeniem działa jak dotąd (walidator ENM + CalculationReadiness,
   ADR-025) — zmienia się wyłącznie chwila i forma pokazania, nie reguła.
4. **Zero zgadywania wartości bezpieczeństwa i wyników.** Tabliczki, nastawy zabezpieczeń,
   przekładnie, parametry zwarciowe źródeł, impedancje — tylko z katalogu, szablonu
   producenta albo jawnego wyboru projektanta (Catalog Binding Rule,
   `domain_no_guessing_guard`). Gdy nie ma jednoznacznego źródła, wartość pozostaje pusta i
   staje się `BRAK_DO_OPERACJI` dopiero dla operacji, która jej potrzebuje.
5. **Jawność przyjętego.** Każda wartość `AUTO_PRZYJETE` niesie pochodzenie (szablon / katalog /
   zależność / wartość domyślna z podstawą) widoczne przy polu i w danych modelu (znacznik
   pochodzenia), jest edytowalna, a edycja zdejmuje znacznik „przyjęto”.
6. **Topologia, nie heurystyka.** Rodzaj stacji i poprawność konfiguracji wynikają z
   rzeczywistej topologii ENM (`enm/rodzaj_stacji.py` i jego lustro `ui/shared/rodzajStacji.ts`),
   liczonej na zapisanym modelu — nie z deklaracji formularza ani z przedwczesnej reguły
   w kreatorze. Kreator może pokazać rodzaj wynikowy, ale nie ostrzega o niezgodności,
   zanim konfiguracja pól nie jest zakończona.
7. **Wynik to nie szum.** Ekrany wyników zachowują pełny kontrakt werdyktu wyjaśnialnego
   (status + kryterium + wartość + limit + przyczyna). Stan „nie obliczono” to jedna akcja
   („Uruchom …”), nie akapit objaśnień.

## 3. Strażnicy

- Klasa każdego kodu gotowości i walidatora jest zapisana w jednym rejestrze (rejestr kodów
  `READINESS_CODES` — pole klasy) i przypięta testem: każdy kod ma klasę; licznik kontroli
  i paski gotowości czytają wyłącznie klasy widoczne zawsze.
- Teksty „uzupełnij”, „niekompletne dane” i pokrewne są zakazane w tekstach UI poza
  wskazaniem konkretnego parametru przy próbie operacji (strażnik tekstów UI).

## 4. Rejestr wdrożenia

Inwentarz klasy (pomiar 2026-10-15) i karty wykonawcze: §5 (uzupełniany przy wdrożeniu).

## 5. Inwentarz i karty

Pomiar 2026-10-15 (cztery inwentarze tylko do odczytu, HEAD `940a3fe0e`):

- **Źródło szumu.** `enm/domain_operations.py::_response` dokleja pełny wynik walidatora ENM
  (`_build_readiness`) do każdej odpowiedzi operacji domenowej (50 punktów `return _response(`);
  z tej jednej listy żyje ok. 15 stale widocznych liczników i pasków frontu („Kontrola: N”,
  „Gotowość: N blokad”, „Model: w budowie”, odznaki drzew, panel „Następna akcja”, sekcja
  „Kontrola” inspektora, ogłoszenie po każdej operacji).
- **Brak precyzji bramek.** Każdy BLOCKER blokuje każdą analizę (`validator.py::_compute_availability`,
  `canonical_analysis.py:979`, globalne `ELIG_NOT_READY` w `eligibility_service.py`) — np. brak
  układu uziemienia nN blokuje zwarcia SN. Predykat „gotowe” odpowiedzi operacji ≠ predykat
  bramki biegu (7 kodów spoza walidatora i rejestru). Poziomy walidatora ≠ kanon dla 4 kodów.
- **Klasyfikacja kodów.** 66 kodów walidatora + 146 `READINESS_CODES` — każdy w jednej z klas §1
  (tabela w meldunku karty PROWADZENIE-GOTOWOSC-BACKEND).
- **Kreatory (24).** Trzy wzorce; czerwone „Brak / Do konfiguracji” od pierwszego renderu we
  wszystkich; ogólne „Uzupełnij wymagane pola” bez przejścia do kroku z błędem; ciche
  auto-dobory „pierwszej pozycji” bez znacznika; zgadywanie wartości wynikowych (GPZ: Sk″ 310 MVA,
  R/X 0,12, Z0/Z1 3,2, R_N 12 Ω, OLTC; długości 500 m / 1 km; odbiór 50 kW / 0,93; CT/VT bez
  katalogu; ukryte cosφ 0,9; niespójne domyślne zaczepy); heurystyka rodzaju stacji
  (`normalizujTypStacji` → `branch`).
- **Konfiguratory i powłoka.** Front sam liczy kompletność w ≥ 11 miejscach, w tym fizyka w UI
  (`AddDerWizard.tsx`: `P / 0.9` jako wymagana moc transformatora) i fabrykacje („Uzależnienia
  łączeniowe: do konfiguracji” zawsze, status pól SN zawsze „kompletne”, pusta macierz statusów,
  lista `missingFields` zaszyta dla każdego DER); `InspectorEngineeringView` podmienia każdą pustą
  wartość na „do konfiguracji”; marker „!” na transformatorze SLD dla konfiguracji w toku; wiele
  martwych komponentów z komunikatami braków.
- **Moduły obliczeniowe.** Gotowość wyświetlana proaktywnie (analizy specjalistyczne „BRAKUJE n
  DANYCH”, dynamika, macierz NC RfG, panel diagnozy), cztery nałożone stany zerowe koordynacji
  z czterema definicjami „biegu zwarciowego” (20 filtrów `status === 'DONE'` we froncie),
  przyciski „Uruchom …” wykonujące nawigację, powody blokady tylko w dymkach, `uruchomObliczenie`
  pokazuje pierwszy globalny blocker zamiast braków danej analizy.
- **Pochodzenie.** Brak modelowego znacznika „przyjęto automatycznie” widocznego w UI
  (`meta.completion_source` ma 0 konsumentów); szablony stacji wybierają „pierwszą pozycję”,
  dopasowanie podciągiem, sztywne progi 60/25 kW, `connection_variant_options[0]`; completion
  dopisuje odbiór 30 kW.

Karty (2026-10-15):

| Karta | Zakres | Klasa reguł |
|---|---|---|
| PROWADZENIE-GOTOWOSC-BACKEND | klasa sygnału każdego kodu, zbiór blokowanych analiz, bramka biegu per analiza, jeden predykat odpowiedzi/bramki/eligibility, jeden poziom kanonu | 2, 3 |
| PROWADZENIE-AUTO-BACKEND | znacznik pochodzenia w modelu, zero zgadywania w szablonach i completion, rodzaj stacji z topologii (deklaracja = topologia, W043 znika) | 1, 4, 5, 6 |
| PROWADZENIE-KREATORY | 24 kreatory: cisza o pracy w toku, brak wskazywany przy zapisie z przejściem do pola, auto-przyjęcia jawne, zero zgadywania, rodzaj stacji bez przedwczesnych ostrzeżeń | 1–6 |
| PROWADZENIE-OBLICZENIA | ekrany obliczeń: braki właściwe dla analizy przy próbie, jedna akcja zamiast akapitów, jedno źródło „biegu wejściowego” | 3, 7 |
| PROWADZENIE-POWLOKA (po kartach backendu) | liczniki i paski powłoki tylko KT/NO, konfiguratory bez heurystyk i fizyki, inspektor, SLD, kasacja martwych komponentów | 2, 3, 5 |
