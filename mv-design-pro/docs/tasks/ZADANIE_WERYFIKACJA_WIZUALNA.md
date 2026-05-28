# ZADANIE BIEŻĄCE — WERYFIKACJA WIZUALNA (ZASADA NR 2)

**Typ:** efemeryczny work package · **Priorytet:** najwyższy (przed dosypywaniem nowych modułów)
**Kanon:** `PROMPT_MV_DESIGN_PRO_PRZEBUDOWA.md` §7.9, §7B.9, ZASADA NR 2
**Stan wejściowy:** `STAN_REPO.md` (audyt 2026-05-28) — backend zielony (5249 testów), V12.6 wdrożone, render NIEZWERYFIKOWANY
**Dlaczego najpierw to:** dosypywanie modułów do interfejsu, którego nikt nie wyrenderował, powtarza błąd V12.2 (kod się zmieniał, SLD pozostawał nieczytelny przez wiele iteracji). Najpierw zobacz prawdę na ekranie.

---

## 0. WARUNEK WYKONALNOŚCI — środowisko z renderem (krytyczny)

Audyt Fazy 0 ustalił wprost: **ZASADA NR 2 jest niewykonalna w bezgłowym kontenerze bez stacku i przeglądarki.** To zadanie MUSI być uruchomione w środowisku z pełnym stosem. Nie wolno deklarować żadnego kryterium wizualnego (K-07, K-19, K-20, K-21, J-01…J-05) „z kodu" — to jest dokładnie antypattern, który kanon piętnuje.

**Wymagane środowisko:**
```
docker-compose up           # PostgreSQL + MongoDB + Redis + backend
npm run dev                 # frontend
# przeglądarka sterowana (Playwright/headed) do zrzutów, np.:
npm run test:e2e:real       # jeśli istnieje harness e2e-real
```

Jeśli harness e2e-real nie istnieje lub nie robi zrzutów — pierwszym krokiem jest **dodanie skryptu zrzutowego** (Playwright): nawigacja po wszystkich surface'ach przy realnym projekcie i zapis PNG. To też jest część zadania.

---

## 1. PRZYGOTOWANIE DANYCH TESTOWYCH (render na realnej złożoności, nie na pustym stanie)

Zrzuty wykonujesz na **sieci o realnej, dużej skali**, bo dopiero przy gęstości ujawniają się nachodzenia, mikroskala, błędy routingu połączeń i problemy wydajności (defekty z V12.2 i V-01…V-10). Mały, 1-stacyjny przykład **ukrywa** te problemy i jest zakazany jako jedyna podstawa oceny.

**Wymagana sieć referencyjna — co najmniej 50 stacji:**
- GPZ 15 kV (dane_OSD: Sk''/Ik'', R/X, uziemienie punktu neutralnego),
- magistrala SN + **liczne odgałęzienia**, odcinki kabel + napowietrzna, **≥ 50 stacji SN/nN**,
- ZKSN na kablach, słupy rozgałęźne na liniach napowietrznych, sprzęgła,
- **wszystkie łańcuchy przyłączenia OZE rozmieszczone w sieci (V-10):** PV przez transformator nN/SN → PCC; OZE bezpośrednio w pole SN; BESS dwukierunkowy; FW; oraz min. jedna stacja z układem mieszanym (kilka źródeł + odbiory),
- każde połączenie zaczepione o głowice/terminale (V-07); każdy element klikalny (V-08),
- wybrany `case_ref` = ZWARCIOWY_MAKS z policzonymi wynikami; drugi `case_ref` = ZWARCIOWY_MIN (test przełączania/„drugiej prawdy").

Jeśli repo nie ma seeda o tej skali — **wygenerowanie sieci testowej ≥ 50 stacji jest częścią zadania** (proceduralnie, z realnymi katalogami). To na niej dowodzisz auto-layoutu (Sugiyama) i czytelności.

---

## 2. ZAKRES ZRZUTÓW — wszystkie powierzchnie, w kluczowych stanach

Dla **każdego** surface z `screenCanonRegistry.ts` (źródło prawdy o ekranach) zrób zrzut w realnym stanie. Priorytetowo (te najczęściej oglądane i historycznie najsłabsze):

| Grupa | Surface'y | Stany do uchwycenia |
|---|---|---|
| **SLD (krytyczny)** | płótno schematu | gotowy z wynikami · z zaznaczonym obiektem · tryb prezentacyjny/eksport · duża sieć (>50 węzłów) |
| App shell | wszystkie 5 stref naraz | render pełnego okna 1920×1080 i na mniejszym laptopie (~1440×900) |
| Inspektor | karta obiektu + White Box | rozwinięty wywód do poziomu audytowego |
| Analizy V12.6 | E-35…E-45 | wynik gotowy + wykres (nie pusty!) |
| Zabezpieczenia | E-28 TCC + macierz selektywności | krzywe TCC narysowane |
| NC RfG / PTPiREE | E-30 + NcRfgTestsTab | bateria testów z werdyktami |
| Raport OSD | drzewo raportu | statusy rozdziałów |
| Kreator stacji | wszystkie kroki | każdy etap |
| Stany brzegowe | dowolny surface | pusty · ładowanie · liczę · błąd · poza zakresem · dane niekompletne |

---

## 3. CHECKLISTA OCENY — test odbioru SLD (§7.9), 8 warunków

Dla każdego zrzutu SLD oceń wzrokowo i zaznacz PASS/FAIL z uzasadnieniem:

- [ ] **A-01** Żadna etykieta/tooltip/legenda nie zasłania symbolu topologii.
- [ ] **A-02** Legenda zakotwiczona do ramki, nie pływa, nie nachodzi.
- [ ] **A-03** Każda wartość wyniku występuje na schemacie dokładnie raz (brak duplikatów Ik'').
- [ ] **A-04** Żaden komunikat diagnostyczny backendu (`brak w śladzie` itp.) nie pojawia się na płótnie.
- [ ] **A-05** Wyraźna trójstopniowa hierarchia: topologia > wynik > stan.
- [ ] **A-06** Etykiety segmentów to sformatowane obiekty z katalogu (nie surowe „Kabel SN · AI").
- [ ] **A-07** Hit-box pokrywa się z symbolem; hover/klik spójne.
- [ ] **§7.9.7–8** Tryb prezentacyjny zdatny do operatu; legenda+skala+kierunek przepływu obecne.

**Szczególna uwaga (regresja z V12.2):** sprawdź, czy schemat nie jest mikroskopijny w pustym płótnie i czy etykieta kabla oraz GPZ nie nachodzą — to defekty, które przeżyły wiele iteracji kodu, bo nikt nie patrzył na render.

---

## 4. CHECKLISTA OCENY — test odbioru frontendu (§7B.9), 9 warunków

- [ ] **1. Spójność** — dwa dowolne surface'y rozpoznawalne jako ten sam produkt (tokeny, komponenty, typografia liczb).
- [ ] **2. Kręgosłup** — widoczny jeden jasny „następny krok", klikalny i prowadzący poprawnie.
- [ ] **3. Synchronizacja** — zaznaczenie w drzewie/SLD/inspektorze synchronizuje pozostałe + jeden case_ref rządzi całością.
- [ ] **4. Stany** — każdy surface ma 9 stanów; zero pustych ekranów bez komunikatu.
- [ ] **5. Nieaktualność** — edycja w BUDOWIE oznacza wyniki `do przeliczenia` + „przelicz dotknięte".
- [ ] **6. Power-user** — klawiatura/command palette działają; duża sieć (>100 węzłów) nie zamula.
- [ ] **7. Mapa przejść** — brak sierot (każdy surface ma wejście i wyjście).
- [ ] **8. Brak AI-slopu** — typografia/kolory/komponenty celowe i profesjonalne (EDA/SCADA).
- [ ] **9. Onboarding** — pusty projekt prowadzi do pierwszego sensownego kroku.

---

## 5. DOKUMENTACJA WYNIKU — PRZED/PO i raport (produkt zadania)

Dla każdego wykrytego defektu wizualnego:
1. **Zrzut PRZED** + opis defektu + który warunek (A-xx / §7B.9-y) łamie.
2. Poprawka w kodzie (jeden defekt = jedna zmiana, kontrolowana iteracja).
3. **Zrzut PO** dowodzący usunięcia.
4. Wpis do `STAN_REPO.md`: status warunku zmieniony na PASS z linkiem do zrzutu PO.

**Produkt zadania:** katalog zrzutów `docs/audit/visual/{surface}_{before|after}.png` + tabela wyników 8+9 warunków z werdyktami + aktualizacja K-07, K-19, K-20, K-21 (i wstępna ocena J-01, J-04) w `STAN_REPO.md`.

---

## 6. KRYTERIUM ZAKOŃCZENIA ZADANIA

Zadanie skończone, gdy:
- każdy surface ma komplet zrzutów w realnych stanach, **na sieci ≥ 50 stacji** (V-09),
- wszystkie 8 warunków §7.9 i 9 warunków §7B.9 mają werdykt PASS udowodniony zrzutem PO (lub jawnie zarejestrowany dług wizualny z planem naprawy),
- **wszystkie 11 warunków progu §7.3 spełnione**, w tym: zero przewodów wiszących w powietrzu (V-07, każde połączenie z głowicy/terminala), wszystkie elementy klikalne (V-08), wszystkie łańcuchy OZE/BESS/FW pokazane i poprawne (V-10),
- **werdykt eksperta SLD ≥ 8/10** udokumentowany zrzutem,
- `STAN_REPO.md` zaktualizowany: K-07, K-19, K-20, K-21 przestają być „niezweryfikowane wizualnie",
- zero otwartych defektów A-01…A-07 oraz V-01…V-10.

**Dopiero po domknięciu weryfikacji wizualnej** wracamy do dosypywania modułów funkcjonalnych (D-04 ZIP → D-01 Arc Flash → …) wg `STAN_REPO.md`.

---

## 7. ⛔ KOREKTA WERDYKTU — SLD NADAL JEST 1/10, NIE „KLASA INDUSTRIALNA" (WIĄŻĄCE)

**Werdykt sesji 2026-05-28, że SLD jest „klasą industrialną, nie 0/10", jest ODRZUCONY.** Ocena właściciela na podstawie zrzutu `sld_canvas_detail.png`: **1/10 jako schemat dokumentacyjny.** Naprawa crashu (DEF-VIS-01) była słuszna, ale **„aplikacja renderuje się bez wywalenia" ≠ „schemat jest dobry"**. Poprawne symbole IEC nie czynią schematu dobrym, jeśli kompozycja, skala, hierarchia i spójność są złe — a są.

### 7.1. Błąd metodologiczny do uniknięcia

Poprzednia sesja oceniła pojedyncze elementy (symbole, etykiety katalogowe, chrome) i z ich poprawności wywiodła jakość całości. **To jest błąd.** Jakość schematu = jakość KOMPOZYCJI (skala, wykorzystanie kadru, hierarchia, spójność języka wizualnego, czytanie od źródła), nie suma poprawnych ikon. Schemat z idealnymi symbolami może być 1/10. Oceniaj kompozycję, nie inwentarz elementów.

### 7.2. Defekty PODNIESIONE z „drobnego długu" do BLOKUJĄCYCH (muszą zniknąć)

| Kod | Defekt | Dlaczego blokujący |
|---|---|---|
| **V-01** | Schemat zajmuje ~30% płótna, wciśnięty w lewy róg, ~60% kadru to czarna pustka | To NIE „fit-to-content" jako drobiazg — to główny powód nieczytelności. Schemat ma wypełniać kadr z marginesem, auto-fit przy otwarciu i po zmianach. Pierwsza rzecz, którą widać, i pierwsza dyskwalifikująca |
| **V-02** | Dwa różne języki wizualne: precyzyjna pionowa góra (GPZ/TR/pole) vs grube prymitywne zielone magistrale u dołu — wyglądają jak sklejone z dwóch programów | Jeden spójny język wizualny na całym płótnie. Magistrale SN i aparatura stacji muszą należeć do tego samego systemu graficznego (ta sama waga linii, skala, estetyka) |
| **V-03** | Brak hierarchii i czytania „od źródła w dół"; oko gubi się między ramką pola a luźnymi magistralami | Wyraźny przepływ wizualny źródło → sieć → stacje; hierarchia prowadząca wzrok |
| **V-04** | „Pole liniow…" ucięte; „GPZ 15 kV" pojawia się 3× (badge + nagłówek + pudło) — „druga prawda" wizualna; drobny tekst na granicy czytelności | Etykiety pełne, nieucięte, jedna instancja nazwy obiektu, czytelny rozmiar |
| **V-05** | Magistrale jako grube zielone markery zamiast cienkich precyzyjnych linii szyn z oznaczeniem napięcia/kierunku (kanon miniSCADA) | Linia szyny/magistrali = cienka, precyzyjna, z oznaczeniem; grubość nie może krzyczeć i psuć subtelności reszty |
| **V-06** | Brak ramki rysunku, metryczki (tabelki rysunkowej), wyraźnej skali, legendy w kadrze | §7.9.7 wymaga trybu prezentacyjnego zdatnego do operatu — to jest widok roboczy, nie dokument |
| **V-07** ⛔ | **BŁĄD FIZYCZNY/TOPOLOGICZNY:** trzy linie wychodzą z dołu ramki pola i WISZĄ W POWIETRZU, nie zaczepione o nic | **Najpoważniejszy defekt — schemat jest technicznie FAŁSZYWY.** Każdy przewód SN wychodzi z konkretnego punktu przyłączenia: **głowicy kablowej pola odpływowego**, i kończy się na terminalu pola wejściowego następnego obiektu (stacja/ZKSN/słup). Połączenie NIE może zaczynać się „pod ramką" — musi wychodzić bezpośrednio z głowicy/terminala. Wymaga jawnego modelu punktów przyłączenia (connection points / terminals) i routingu krawędzi od terminala do terminala, z węzłem w punkcie rozgałęzienia |
| **V-08** ⛔ | Elementy nie są nawigowalne — schemat jest martwym obrazkiem | **Każdy element klikalny i prowadzący do właściwego miejsca:** pole/głowica/odcinek/węzeł/stacja/transformator/źródło OZE/łącznik → klik otwiera konfigurację obiektu LUB jego wyniki+wywód White Box. To realizacja rdzenia (§7B.8, §7.8: SLD = interfejs do silnika dowodowego). Hit-box pokrywa się z symbolem (A-07) |
| **V-09** ⛔ | Schemat testowany na karykaturalnie małej sieci (1 stacja) — ukrywa nachodzenia, skalę, wydajność, routing | **Test wyłącznie na dużej sieci ≥ 50 stacji** z magistralą, wieloma odgałęzieniami, ZKSN, słupami rozgałęźnymi. Auto-layout (Sugiyama), czytelność, brak nachodzeń, wydajność renderu — dowiedzione na realnej skali, nie na zabawce |
| **V-10** ⛔ | Nie pokazano wszystkich łańcuchów przyłączenia OZE | **Wszystkie konfiguracje wpięcia przetestowane wizualnie na dużej sieci:** (a) PV przez transformator nN/SN → pole SN → PCC; (b) OZE bezpośrednio w pole SN → PCC; (c) BESS dwukierunkowy; (d) FW; (e) układy mieszane (kilka źródeł + odbiory w jednej stacji). Każdy z poprawnym, zaczepionym połączeniem (V-07) i klikalny (V-08) |

### 7.3. MIERZALNY PRÓG JAKOŚCI (nie do obejścia kosmetyką)

SLD przechodzi dopiero, gdy zrzut PO spełnia jednocześnie:

1. **Wypełnienie kadru ≥ 75%** — bounding box schematu zajmuje ≥75% użytecznej powierzchni płótna (auto-fit z marginesem), zero wielkich pustych obszarów.
2. **Jeden język wizualny** — waga linii, skala symboli i estetyka identyczne dla góry (aparatura) i dołu (magistrale); ekspert nie rozpozna „dwóch programów".
3. **Czytanie od źródła** — jednoznaczny przepływ wizualny GPZ → magistrala → odgałęzienia → stacje, z hierarchią prowadzącą wzrok.
4. **Etykiety** — zero ucięć, jedna instancja nazwy obiektu, czytelny rozmiar przy 100% zoomu.
5. **Magistrale** — cienkie precyzyjne linie z oznaczeniem napięcia i kierunku (nie grube markery).
6. **Tryb prezentacyjny** — ramka rysunku + metryczka + skala + legenda; zrzut nadaje się do wklejenia do operatu bez wstydu.
7. **Połączenia zaczepione (V-07)** — KAŻDY przewód wychodzi z konkretnej głowicy/terminala i kończy na terminalu następnego obiektu; ZERO linii wiszących w powietrzu; węzeł w każdym punkcie rozgałęzienia. Weryfikacja: prześledź wzrokiem każde połączenie od końca do końca — oba muszą być zaczepione o punkt przyłączenia.
8. **Klikalność (V-08)** — każdy element (pole/głowica/odcinek/węzeł/stacja/transformator/OZE/łącznik) klikalny, prowadzi do konfiguracji lub wyników+wywodu; hit-box = symbol.
9. **Duża sieć (V-09)** — wszystkie powyższe dowiedzione na sieci **≥ 50 stacji** z odgałęzieniami; brak nachodzeń, czytelność i wydajność renderu utrzymane przy tej skali.
10. **Wszystkie łańcuchy OZE (V-10)** — PV-przez-trafo, OZE-bezpośrednio, BESS, FW, układy mieszane — każdy poprawnie zaczepiony i klikalny, pokazany na zrzucie.
11. **Werdykt eksperta CAD/SCADA ≥ 8/10** (J-01) na zrzucie PO — udokumentowany, nie zadeklarowany.

### 7.4. Procedura wymuszenia (iteruj aż próg osiągnięty)

Dla SLD obowiązuje pętla z ZASADY NR 2, ale z **wysokim progiem wyjścia**: poprawiaj → zrzut → oceń wg 7.3 → jeśli którykolwiek z 7 warunków FAIL, popraw dalej. **Zakaz zamknięcia SLD przy ocenie < 8/10.** Porównuj każdy zrzut PO z `sld_canvas_detail.png` (stan 1/10) — różnica musi być ewidentna, nie kosmetyczna. Referencja docelowa: panel Elektrometal miniSCADA + schemat jednokreskowy z operatu (kanon §7.3).

### 7.5. Reguła uczciwości oceny

Oceniaj surowo, jak audytor OSD, który odrzuci operat za nieczytelny schemat. **Nie zawyżaj.** „Renderuje się", „symbole są poprawne", „testy zielone" to NIE są argumenty za jakością schematu. Jedynym argumentem jest zrzut, na którym schemat wygląda jak profesjonalny załącznik dokumentacyjny. Dopóki nie wygląda — jest 1/10 i praca trwa.

---

*Work package efemeryczny. Po wykonaniu zarchiwizować; trwałym śladem jest aktualizacja `STAN_REPO.md` i katalog zrzutów. Sekcja 7 (korekta werdyktu SLD) jest WIĄŻĄCA do osiągnięcia progu 7.3.*
