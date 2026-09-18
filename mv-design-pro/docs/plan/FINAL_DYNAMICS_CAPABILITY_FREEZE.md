# FINAL DYNAMICS CAPABILITY FREEZE — zamrożenie DOCELOWEJ zdolności użytkownika

**Zlecenie:** korekta właściciela z 2026-09-18 „OWNER CORRECTION — FINAL DYNAMICS CAPABILITY
FREEZE". Dokument powstaje PRZED jakąkolwiek kolejną kartą implementacyjną i przed powierzchnią
docelową.

**Zasada nadrzędna tego dokumentu (cytat wiążący):** *„The architecture must be derived from
required engineering capabilities. The required capabilities must NOT be derived from the
capabilities of the current solver."* Kolumna CURRENT STATE opisuje więc stan zastany, ale
kolumna TARGET STATE **nie jest z niego wyprowadzona** — pochodzi z wymagania inżynierskiego.

**Co ten dokument zastępuje:** sekcję **I** dokumentu `docs/plan/W6_3C_DYNAMICS_PRODUCT_FREEZE.md`
(wycinki W6-3C…W6-4). Tamten podział był wyprowadzony ze stanu kodu i jest **UNIEWAŻNIONY**.
Sekcje A–H i J–L tamtego dokumentu (rozpoznanie, klasyfikacja wejść/wyjść, nadużycia semantyczne,
zamrożenie §25) pozostają w mocy jako materiał dowodowy. Macierz stanu zastanego:
`docs/audit/CURRENT_DYNAMIC_CAPABILITY_MATRIX.md`.

**Baza pomiarowa:** HEAD `131a5586` (rozpoznanie wykonane na `957e2a5f`, bez zmian kodu od tego
czasu — oba commity dokumentacyjne).

---

## 0. CEL PRODUKTU (zamrożony)

MV-DESIGN-PRO ma docelowo pozwolić projektantowi sieci SN:

1. wybrać **rzeczywisty, rozwiązany punkt pracy**;
2. przypisać **zwalidowane modele dynamiczne** do maszyn synchronicznych, PV/GFL, GFM, magazynów
   i turbin wiatrowych;
3. zdefiniować **deterministyczny scenariusz wielozdarzeniowy**;
4. wykonać **symulację RMS/DAE**;
5. obejrzeć **rzeczywiste trajektorie sieci i urządzeń**;
6. ocenić zachowanie **napięciowe, częstotliwościowe i kątowe**;
7. ocenić **zachowanie FRT**;
8. wskazać **ograniczające zdarzenie / urządzenie / kryterium**;
9. **automatycznie wyznaczyć margines stabilności** (np. CCT) tam, gdzie jest to fizycznie zasadne;
10. **porównać warianty inżynierskie**;
11. wykonać **studia parametryczne**;
12. prześledzić **działania zabezpieczeń i automatyki**;
13. zrozumieć **DLACZEGO** wynik jest taki — przez dowód White-Box;
14. **utworzyć i przeliczyć wariant alternatywny**.

**Tego celu nie wolno zredukować dlatego, że bieżąca implementacja nie wystawia wymaganej
obserwabli.** Brakująca obserwabla docelowa staje się jawną pozycją GAP, nie znika z celu.

### 0.1 Scenariusz odniesienia SO-1 (bramka akceptacji całości)

> Instalacja PV 2,75 MW i magazyn energii pracują w miejscu przyłączenia. W chwili t = 1 s
> występuje zwarcie na szynie SN. Zabezpieczenie otwiera wyłącznik po 180 ms. Po 1 s następuje
> ponowne załączenie. Zbadaj zachowanie sieci przez 10 s.

Łańcuch, który program ma przeprowadzić **sam**:

```
ENM → rozpływ → inicjalizacja dynamiki → zdarzenia → RMS/DAE → trajektorie
    → metryki → kryteria → wnioski
```

Użytkownik **nie wpisuje** `U_post`, `f_post` ani `δ_fault`. Program je wyznacza.

*Uwaga terminologiczna:* właściciel użył w opisie skrótu „PCC". W modelu i w kodzie obowiązuje
zakaz tego terminu (`scripts/pcc_zero_guard.py`, lista terminów zakazanych w rdzeniu), więc w całym
dokumencie i w produkcie używamy sformułowania **„miejsce przyłączenia"**. Zmiana jest wyłącznie
nazewnicza — treść scenariusza nietknięta.

**Stan wykonalności SO-1 na HEAD `131a5586`:** scenariusz **NIE JEST dziś wykonalny w całości**.
Wykonalne: zwarcie 3F w t = 1 s z usunięciem w t = 1,18 s, ponowne załączenie gałęzi w t = 2,18 s,
horyzont 10 s (limit kontraktu to 600 s, `enm/scenariusze.py:169`). Niewykonalne: **czas 180 ms ma
wynikać z zadziałania zabezpieczenia, a nie z ręcznego wpisu projektanta** — dziś projektant musi
sam zaplanować chwilę otwarcia. To jest luka klasy EVENT-ENGINE, nie luka interfejsu.

---

## 1. Słowniki kolumn

**CURRENT STATE / TARGET STATE:** `CURRENT` (jest i działa) · `PARTIAL` (część łańcucha) ·
`GAP` (brak). Tam, gdzie dzisiejszy brak jest **jawną odmową** rdzenia, piszemy
`GAP (odmowa jawna)` — odmowa jest zachowaniem pożądanym, ale zdolności nie zastępuje.

**Kolumny luk** (`PHYSICS` / `NUMERICAL` / `VALIDATION` / `EVENT-ENGINE` / `API` / `UI`):
`—` oznacza brak luki w tym wymiarze; opis oznacza lukę i jej treść.

**PLANNED WAVE:** fala wyprowadzona z TEJ macierzy w sekcji 5, nie odwrotnie.

**ACCEPTANCE EVIDENCE:** co musi zaistnieć, żeby uznać zdolność za domkniętą — zawsze
obserwowalny artefakt (bieg, test, porównanie z wyrocznią), nigdy „zaimplementowano".

---

## 2. MACIERZ — tablica A (wartość, stan, obserwable, fala)

Klucz łączący z tablicą B: kolumna **ZDOLNOŚĆ**.

| ZDOLNOŚĆ | WARTOŚĆ DLA UŻYTKOWNIKA | CURRENT | TARGET | OBSERWABLE DOSTĘPNE | OBSERWABLE BRAKUJĄCE | FALA |
|---|---|---|---|---|---|---|
| **A1** Wybór rozwiązanego punktu pracy | badanie startuje ze stanu, który projektant sam policzył i rozpoznaje | CURRENT | CURRENT | `pf_run_id`, zbieżność, rewizja modelu, scenariusz ruchowy | — | — |
| **A2** Przypisanie modeli dynamicznych do 5 rodzin | projektant wie, jaki model fizyczny stoi za wynikiem | PARTIAL | CURRENT | rodzina, rząd modelu, obecne bloki regulacji, pochodzenie parametrów | brak turbin typu 1 i 2 | W6-J |
| **A3** Deterministyczny scenariusz wielozdarzeniowy | badanie odwzorowuje rzeczywistą sekwencję ruchową | PARTIAL | CURRENT | oś `(t_s, indeks)`, 6 rodzajów wykonywanych | 9 z 15 klas zakłóceń (patrz D) | W6-B, W6-C |
| **A4** Wykonanie symulacji RMS/DAE | odpowiedź „co się stanie" zamiast domysłu | CURRENT | CURRENT | `WlasnosciBieguV1`, zbieżność, kroki, residua | — | — |
| **A5** Powtarzalność i tożsamość biegu | ten sam wynik u projektanta i u weryfikatora | CURRENT | CURRENT | 5 odcisków + wersja solvera | — | — |
| **B1** `U_i(t)`, `θ_i(t)` na szynach | podstawowy obraz zachowania napięciowego | CURRENT | CURRENT | `u_pu@`, `kat_deg@` | — | — |
| **B2** `f_i(t)` częstotliwość węzła | stabilność częstotliwościowa w ogóle możliwa do oceny | GAP | CURRENT | — | **cała** | **W6-A** |
| **B3** `ROCOF_i(t)` | ocena szybkości zmian, kryteria LOM i NC RfG | GAP | CURRENT | — | **cała** | **W6-A** |
| **B4** `P_ij(t)`, `Q_ij(t)`, `I_ij(t)` gałęzi | przepływy dynamiczne, wejście dla zabezpieczeń w pętli | GAP | CURRENT | `p_pu@`/`q_pu@` urządzenia (to NIE są przepływy gałęzi) | **cała** | **W6-A** |
| **C1** Maszyna: `δ`, `ω`, `E'`, `E''`, `E_fd`, `P_m`, AVR/GOV/PSS | stabilność kątowa i praca regulatorów | CURRENT | CURRENT | komplet stanów rodziny | — | — |
| **C2** PV/GFL: PLL, `I_d`/`I_q`, ogranicznik, FRT, odbudowa `P` | zachowanie falownika po zapadzie — sedno sieci SN z OZE | PARTIAL | CURRENT | `pll_kat_rad`, `pll_calka_pu`, `i_czynny_pu`, `i_bierny_pu`, zadania, `odbudowa_zwolnienie_pu` | `I_q` jako **wielkość wtrysku wsparcia** (osobno od składowej stanu), jawny sygnał aktywności ogranicznika | W6-A |
| **C3** GFM: odpowiedź `U`/`f`, statyzm / bezwładność wirtualna | ocena pracy wyspowej i wsparcia sieci | PARTIAL | CURRENT | `kat_rad`, `omega_pu` (tryb maszyny wirtualnej), filtry `P`/`Q`, zadania | częstotliwość wytwarzana przez GFM jako obserwabla węzła (zależy od B2) | W6-A |
| **C4** BESS: `P`, `Q`, `I`, `SOC`, `P-f`, `Q-U`, limit prądu | ocena magazynu jako środka zaradczego | PARTIAL | CURRENT | stany przekształtnika + `soc_pu` | prąd jako obserwabla, jawny sygnał limitu, odpowiedź `P-f` wymaga B2 | W6-A |
| **C5** Wiatr: wirnik, crowbar, `P`, `Q`, odbudowa | zachowanie farmy po zwarciu | PARTIAL | CURRENT | `omega_wirnika_pu`, `pitch_rad`, `p_aerodynamiczna_odniesienia_pu`, `crowbar_pu` | typy 1 i 2 (dziś odmowa), prąd jako obserwabla | W6-A, W6-J |
| **D1** Zwarcie trójfazowe | podstawowa klasa zakłócenia | CURRENT | CURRENT | — | — | — |
| **D2** Zwarcie niesymetryczne | większość zwarć w sieci SN to zwarcia niesymetryczne | GAP (odmowa jawna) | CURRENT | — | składowe symetryczne w torze czasowym | **W6-K** |
| **D3** Sekwencje wyłączania | rzeczywisty przebieg likwidacji zwarcia | PARTIAL | CURRENT | zdjęcie zwarcia jako osobny wpis z własnym czasem | chwila wyłączenia z **decyzji zabezpieczenia**, nie z wpisu | **W6-C** |
| **D4** Operacje łącznikowe | manewry ruchowe | CURRENT | CURRENT | otwarcie/zamknięcie gałęzi | — | — |
| **D5** Wyłączenie źródła rozproszonego | reakcja sieci na utratę generacji OZE | CURRENT | CURRENT | `odlaczenie_zrodla` | — | — |
| **D6** Wyłączenie generatora | j.w. dla maszyn | CURRENT | CURRENT | `odlaczenie_zrodla` | — | — |
| **D7** Odłączenie odbioru | zrzut obciążenia, w tym automatyczny | PARTIAL | CURRENT | skok obciążenia o pełną moc | odłączenie jako **nazwane** zdarzenie (nie skok) | W6-B |
| **D8** Skok obciążenia | badanie odpowiedzi regulacyjnej | CURRENT | CURRENT | `skok_obciazenia` (wyłącznie odbiór) | — | — |
| **D9** Wyłączenie linii | typowa kontyngencja | CURRENT | CURRENT | `wylaczenie_galezi` | — | — |
| **D10** Wyłączenie transformatora | j.w. | CURRENT | CURRENT | `wylaczenie_galezi` | — | — |
| **D11** Wydzielenie wyspy | praca wyspowa z GFM/BESS — kluczowa dla sieci SN z OZE | GAP | CURRENT | (składalne z otwarć gałęzi, ale bez nazwania i bez wykrycia) | rozpoznanie wyspy w trakcie biegu, warunek brzegowy wyspy | **W6-B** |
| **D12** Ponowne załączenie | SPZ, powrót do sieci | PARTIAL | CURRENT | zamknięcie gałęzi | synchronizacja źródła (dziś odmowa), warunki załączenia | **W6-B** |
| **D13** Skoki zadań `P`/`Q`/`U` | badanie regulatorów i wsparcia sieci | GAP (odmowa jawna) | CURRENT | — | wykonanie `komenda_regulacji` w rdzeniu | **W6-B** |
| **D14** Działanie zabezpieczenia | „co naprawdę zadziała i kiedy" | GAP | CURRENT | prawo czasowe IEC 60255 istnieje osobno (`compute_curve_trip_time`) | zdarzenie **warunkowe**: pomiar w pętli → krzywa → wyzwolenie | **W6-C** |
| **D15** Działanie automatyki | SPZ, SZR, automatyka odciążająca | GAP | CURRENT | — | j.w. + logika automatyki | **W6-C** |
| **E1** Dynamika napięciowa: minima, maksima, czas odbudowy | ocena zapadów i powrotu | PARTIAL | CURRENT | `u_min_pu`, `t_u_min_s` | maksimum, czas odbudowy do pasma, czas ustalenia | **W6-D** |
| **E2** Ocena LVRT/HVRT wobec obwiedni | wymaganie przyłączeniowe | GAP | CURRENT | obwiednia NC RfG jako dane (dwie **sprzeczne** kopie, patrz §4 N-8) | ocena **rzeczywistego** przebiegu wobec jednej obwiedni | **W6-D** |
| **E3** Dynamika częstotliwości: nadir, zenith, ROCOF, czas ustalenia | ocena bilansu mocy i bezwładności | GAP | CURRENT | — | wszystko (zależy od B2, B3) | **W6-D** |
| **E4** Stabilność kątowa: trajektorie, kryterium synchronizmu | podstawowe pytanie stabilności | PARTIAL | CURRENT | `delta_max_rad@`, `omega_min/max_pu@` | **formalne kryterium synchronizmu** Φ, nie sama wartość maksymalna | **W6-D** |
| **E5** CCT wyznaczany przez solver + margines | granica, nie próg | GAP | CURRENT | bisekcja istnieje **wyłącznie w teście** wyroczni SMIB | Φ + wyszukiwanie w produkcie | **W6-E** |
| **E6** Dynamika przekształtnikowa: PLL, prąd, ogranicznik, wtrysk `I_q`, odbudowa `P` | ocena falowników po zapadzie | PARTIAL | CURRENT | stany GFL/GFM | metryki odbudowy `P`, czas wtrysku `I_q`, aktywność ogranicznika | **W6-D** |
| **E7** BESS: odpowiedź `P`/`Q`, limity, SOC, wsparcie `f`/`U` | ocena magazynu jako środka zaradczego | PARTIAL | CURRENT | stany + SOC | metryki wsparcia (zależy od B2) | **W6-D** |
| **E8** Wiatr: wirnik, crowbar, `P`/`Q`, odbudowa | ocena farmy | PARTIAL | CURRENT | stany | metryki odbudowy, czas pracy crowbar | **W6-D** |
| **F1** Automatyczne wyszukiwanie granicy stabilności | odpowiedź „gdzie jest granica", nie „czy ten jeden przypadek przeszedł" | GAP | CURRENT | — | Φ z definicją fizyczną + wyszukiwanie na solverze | **W6-E** |
| **F2** Porównanie wariantów inżynierskich | decyzja projektowa zamiast pojedynczego przebiegu | GAP | CURRENT | rejestr serii biegów istnieje (`run_batches`) | porównanie trajektorii i metryk biegów czasowych | **W6-G** |
| **F3** Studia parametryczne | mapa wrażliwości zamiast pojedynczego punktu | GAP | CURRENT | j.w. | mapowanie PARAMETR → BIEG → TRAJEKTORIA → METRYKA → KRYTERIUM | **W6-G** |
| **G1** Diagnoza: ograniczające urządzenie / zdarzenie / kryterium | „dlaczego" zamiast „ile" | GAP | CURRENT | `limiting_factor` toru progowego (nie z przebiegu) | wywód z rzeczywistych trajektorii i metryk | **W6-H** |
| **G2** Wariant → ponowna symulacja → porównanie | projektowanie, nie tylko sprawdzanie | GAP | CURRENT | scenariusze ruchowe i rewizje modelu | pętla wariantowa na biegach czasowych | **W6-H** |
| **H1** White-Box A–D dla biegu czasowego | audytowalność wyniku | PARTIAL | CURRENT | ślad rdzenia (inicjalizacja, sieć, kroki szczególne, zdarzenia) | warstwy A/B/D w postaci czytelnej dla inżyniera | **W6-F** |
| **H2** Równania w KaTeX/LaTeX | dowód czytelny jak w dokumentacji projektowej | GAP | CURRENT | mechanizm prezentacji istnieje w produkcie | równania modeli dynamicznych jako pola kontraktu | **W6-F** |
| **H3** Trójstopniowy status walidacji | uczciwość wobec projektanta i weryfikatora | PARTIAL | CURRENT | `UNVALIDATED_MODEL` w rejestrze proweniencji | rozdzielenie: wykonywalne / zwalidowane / kwalifikowane | **W6-F** |
| **H4** Wyrocznie niezależne per rodzina | jedyna droga awansu z `UNVALIDATED_MODEL` | PARTIAL | CURRENT | ANDES + 3 wyrocznie analityczne dla maszyny | wyrocznie dla GFL, GFM, magazynu, wiatru | **W6-F** |
| **I1** Przestrzeń robocza dynamiki | jedno miejsce całego badania | GAP | CURRENT | — | cała powierzchnia | **W6-I** |
| **I2** Przeglądarka przebiegów klasy inżynierskiej | odczyt wyniku bez eksportu do arkusza | GAP | CURRENT | — | wspólna oś, kursor, znaczniki zdarzeń, hierarchia wyboru | **W6-I** |
| **I3** Powiązanie przebiegów ze schematem | orientacja w sieci, nie w liście identyfikatorów | GAP | CURRENT | mechanizm zaznaczenia i nakładki istnieje | wpięcie przebiegów | **W6-I** |
| **I4** Oś czasu zdarzeń wykonanych | „co i kiedy faktycznie zaszło" | GAP | CURRENT | `ZdarzenieWykonaneV1` w kontrakcie | prezentacja | **W6-I** |

---

## 3. MACIERZ — tablica B (luki, zależności, dowód odbioru)

Ta sama kolumna kluczowa **ZDOLNOŚĆ**. `—` = brak luki w tym wymiarze.

| ZDOLNOŚĆ | LUKA FIZYKI | LUKA NUMERYCZNA | LUKA WALIDACJI | LUKA SILNIKA ZDARZEŃ | LUKA API | LUKA UI | ZALEŻNOŚCI | DOWÓD ODBIORU |
|---|---|---|---|---|---|---|---|---|
| **A1** | — | — | — | — | — | brak wyboru punktu pracy w interfejsie | — | bieg czasowy uruchomiony z interfejsu z jawnie wskazanego biegu rozpływu |
| **A2** | modele turbin typu 1 i 2 | — | brak wyroczni dla 4 z 5 rodzin | — | — | brak inwentarza modeli w interfejsie | H4 | ekran wymienia rodzinę, rząd modelu, obecne bloki i pochodzenie parametrów dla każdego urządzenia biegu |
| **A3** | — | — | — | 9 klas zakłóceń (D2, D7, D11–D15) | — | brak edytora osi czasu | D-* | scenariusz SO-1 złożony w interfejsie bez wpisywania chwili otwarcia wyłącznika |
| **A4** | — | — | `UNVALIDATED_MODEL` | — | — | brak uruchomienia z interfejsu | A1–A3 | bieg SO-1 kończy się wynikiem albo nazwaną odmową |
| **A5** | — | — | — | — | — | brak prezentacji tożsamości | — | dwa biegi tej samej piątki odcisków dają identyczny wynik (test) |
| **B1** | — | — | jak A4 | — | — | brak przeglądarki | — | przebieg `U(t)` widoczny z kursorem i znacznikami zdarzeń |
| **B2** | **definicja częstotliwości węzła** (OD-30) i jej wyprowadzenie z rozwiązania | różniczkowanie/filtracja kąta: metoda, próbkowanie, brzegi | wyrocznia dla `f(t)` (porównanie z narzędziem zewnętrznym) | — | kanał w kontrakcie wyniku | przebieg i metryki | A4 | `f(t)` z biegu SO-1 zgodna z wyrocznią zewnętrzną w zadanej tolerancji |
| **B3** | pochodna częstotliwości jako wielkość fizyczna, nie różnica próbek | **metoda różniczkowania, okno, filtr, obsługa nieciągłości zdarzeń, jednostka** | wyrocznia | — | kanał/metryka | prezentacja z jawną metodą | B2 | ROCOF liczony w rdzeniu, z udokumentowaną metodą, odtwarzalny; zdarzenie nieciągłe **nie** produkuje impulsu numerycznego udającego fizykę |
| **B4** | prądy i przepływy gałęzi z rozwiązania sieci w każdej chwili próbkowania | koszt: pełny zestaw gałęzi × próbki — wymaga wyboru zakresu | — | — | kanały | wybór gałęzi | A4 | `I_ij(t)` z biegu zgodny z prądem zwarciowym ustalonym z niezależnego toru w chwili zwarcia |
| **C1** | — | — | ANDES pokrywa SMIB, nie sieć rzeczywistą | — | — | prezentacja | — | trajektorie `δ`, `ω`, `E_fd`, `P_m` widoczne i opisane |
| **C2** | `I_q` wsparcia jako wielkość wyniku; jawny stan ogranicznika | — | **brak wyroczni GFL** | — | kanały | prezentacja | B4, H4 | odpowiedź falownika na zapad porównana z wyrocznią zewnętrzną |
| **C3** | częstotliwość wytwarzana przez GFM jako obserwabla | — | **brak wyroczni GFM** | — | kanały | prezentacja | B2, H4 | odpowiedź GFM w obu trybach porównana z wyrocznią |
| **C4** | prąd jako obserwabla, jawny stan limitu | — | **brak wyroczni magazynu** | — | kanały | prezentacja | B2, B4, H4 | odpowiedź `P-f` i `Q-U` magazynu porównana z prawem kontraktu i wyrocznią |
| **C5** | typy 1 i 2; prąd jako obserwabla | — | **brak wyroczni turbiny** | — | kanały | prezentacja | B4, H4 | zachowanie crowbar i odbudowa `P` po zwarciu porównane z wyrocznią |
| **D1** | — | — | — | — | — | edytor zdarzeń | — | zwarcie 3F w SO-1 |
| **D2** | **składowe symetryczne w torze czasowym** | układ równań dla składowej przeciwnej i zerowej | wyrocznia dla zwarcia 1F | rodzaj zdarzenia wykonywany zamiast odmawiany | — | wybór typu bez ślepej uliczki | model fazowy (W5) | zwarcie 1F i 2F policzone i porównane z wyrocznią |
| **D3** | — | — | — | **chwila wyłączenia z decyzji zabezpieczenia** | — | — | D14 | w SO-1 projektant podaje nastawy, nie chwilę otwarcia; program wyznacza 180 ms |
| **D4**, **D5**, **D6**, **D8**, **D9**, **D10** | — | — | — | — | — | edytor zdarzeń | — | każda klasa użyta w biegu i widoczna na osi zdarzeń wykonanych |
| **D7** | — | — | — | odłączenie odbioru jako nazwane zdarzenie | — | — | — | zdarzenie widoczne pod własną nazwą, nie jako skok o pełną moc |
| **D11** | warunek brzegowy wyspy (kto trzyma napięcie i częstotliwość) | rozpoznanie rozspójnienia grafu **w trakcie** biegu, re-inicjalizacja wyspy | wyrocznia dla przejścia w wyspę | zdarzenie i jego wykrycie | — | prezentacja stanu wyspy | B2, C3 | wydzielenie wyspy z GFM/magazynem: przebieg `f` i `U` wyspy zgodny z wyrocznią |
| **D12** | warunki synchronizacji (różnica kąta, napięcia, częstotliwości) | re-inicjalizacja przy załączeniu źródła | — | `synchronizacja` wykonywana zamiast odmawianej | — | — | D11 | ponowne załączenie w SO-1 z jawnym warunkiem synchronizacji |
| **D13** | — | re-inicjalizacja przy skoku zadania | — | `komenda_regulacji` wykonywana zamiast odmawianej | — | — | — | skok zadania `P` magazynu widoczny w przebiegu i na osi zdarzeń |
| **D14** | prawo czasowe istnieje (IEC 60255), brak **sprzężenia z pętlą czasu** | zdarzenie **warunkowe**: lokalizacja chwili przekroczenia z tą samą dokładnością co zdarzenie planowane | wyrocznia dla sekwencji zadziałań | **cały mechanizm zdarzeń warunkowych** | kontrakt nastaw zabezpieczeń w scenariuszu | prezentacja sekwencji | B4 (prądy gałęzi!) | w SO-1 zabezpieczenie samo wyznacza chwilę otwarcia; ta chwila jest w `zdarzenia_wykonane` |
| **D15** | logika automatyki (SPZ, SZR) | j.w. | wyrocznia | j.w. + stany automatyki | kontrakt automatyki | prezentacja | D14 | cykl SPZ odtworzony w biegu, z czasami z nastaw |
| **E1** | — | — | — | — | metryki: maksimum, czas odbudowy, czas ustalenia | prezentacja | B1 | metryki liczone w rdzeniu, nie w przeglądarce |
| **E2** | — | — | **dwie sprzeczne obwiednie w repozytorium** (§4 N-8) | — | ocena jako pole wyniku | wykres przebieg + obwiednia | B1, jedna obwiednia | przebieg `U(t)` z biegu oceniony wobec JEDNEJ obwiedni; ocena z backendu |
| **E3** | — | — | — | — | metryki: nadir, zenith, ROCOF max, czas ustalenia | prezentacja | B2, B3 | metryki z biegu SO-1 |
| **E4** | **formalne kryterium synchronizmu** Φ (definicja fizyczna, nie próg na maksimum) | — | walidacja Φ na układzie o znanym rozwiązaniu | — | Φ jako pole wyniku | prezentacja werdyktu z uzasadnieniem | C1 | Φ orzeka utratę synchronizmu tam, gdzie orzeka ją wyrocznia |
| **E5** | Φ jak w E4 | wyszukiwanie: bracket, klasyfikacja, bisekcja, tolerancja, warunek stopu | walidacja CCT wobec kryterium równych pól (istnieje w teście) | wielokrotne wykonanie scenariusza z jednym zmienianym czasem | kontrakt studium granicznego | prezentacja `t_CCT`, `t_wył`, `Δt` | E4, F1 | `t_CCT` z produktu równy `t_CCT` z wyroczni analitycznej w tolerancji; `max_clearing_time_ms` **przestaje** udawać CCT |
| **E6** | `I_q`, stan ogranicznika | — | wyrocznia GFL/GFM | — | metryki odbudowy | prezentacja | C2, C3 | metryki odbudowy `P` i czasu wtrysku `I_q` z biegu |
| **E7** | — | — | wyrocznia magazynu | — | metryki wsparcia | prezentacja | B2, C4 | odpowiedź magazynu na zaburzenie częstotliwości z biegu |
| **E8** | — | — | wyrocznia turbiny | — | metryki | prezentacja | C5 | odbudowa farmy po zwarciu z biegu |
| **F1** | Φ (E4) | **wielobieg sterowany wynikiem poprzedniego biegu** | walidacja procedury wyszukiwania | powtarzalne wykonanie scenariusza z parametrem | kontrakt studium | prezentacja przebiegu wyszukiwania | E4, E5 | protokół wyszukiwania widoczny: każdy bieg, jego werdykt, przedział, wynik |
| **F2** | — | — | — | — | porównanie biegów czasowych | ekran porównania | rejestr serii biegów | porównanie „GFL vs GFM" i „100 vs 200 ms" na **rzeczywistych** biegach |
| **F3** | — | koszt: liczba biegów × koszt biegu | — | — | kontrakt przemiatania | mapa wyników | F2 | mapa PARAMETR → BIEG → TRAJEKTORIA → METRYKA → KRYTERIUM |
| **G1** | — | — | — | — | wywód diagnostyczny jako pole wyniku | prezentacja | E1–E8 | diagnoza wskazuje element/zdarzenie/kryterium **z dowodem z trajektorii**, nie z reguły ogólnej |
| **G2** | — | — | — | — | pętla wariantowa | ekran wariantu | G1, F2 | wariant utworzony, przeliczony i porównany bez opuszczania badania |
| **H1** | — | — | — | — | warstwy A/B/D w kontrakcie | prezentacja | — | dowód biegu czytelny bez znajomości implementacji |
| **H2** | — | — | — | — | równania modeli jako pola `*_latex` | render | H1 | równania modeli dynamicznych renderowane, zero zapisu tekstowego wzorów |
| **H3** | — | — | rozdzielenie trzech stopni | — | trzy pola zamiast jednego | trzy stany zamiast jednej odznaki | — | ekran pokazuje rozłącznie: wykonywalne / zwalidowane / kwalifikowane |
| **H4** | — | — | **wyrocznie dla 4 rodzin** | — | — | — | — | dla każdej rodziny porównanie trajektorii z niezależnym odniesieniem, z miarą `e_∞ = max_t |x_MV(t) − x_ref(t)|` i tolerancją wyprowadzoną inżyniersko |
| **I1–I4** | — | — | — | — | — | **cała powierzchnia** | B1–B4, E1–E8 | werdykt wizualny właściciela (B-02) |

---

## 4. Znaleziska dopisane przy tym rozpoznaniu

Do siedmiu nadużyć semantycznych z `docs/audit/CURRENT_DYNAMIC_CAPABILITY_MATRIX.md` §7 dochodzi ósme:

**N-8 — dwie sprzeczne obwiednie FRT dla tej samej normy, jedna z nich w warstwie prezentacji.**

| | backend `application/stability/voltage_trajectory.py:129-139` | frontend `ui/network-build/station-der/frtEnvelopeValidator.ts:52-65` |
|---|---|---|
| `t = 0` | `U_min = 0,00` | `U_min = 0,05` |
| `t = 0,15 s` | `0,00` → `0,30` (skok) | `0,05` |
| `t = 0,50 s` | (interpolacja do 0,70 przy 0,7 s) | `0,30` |
| `t = 3,0 s` | `0,90` | `0,85` |
| `t = 60 s` | `0,90` | `0,95` |

Wersja frontowa ma **własną interpolację** (`interpolateEnvelope`, `:67`) — czyli ocenę kryterium
normatywnego w warstwie prezentacji — i **zero konsumentów produkcyjnych**: jedynym miejscem, które
ją importuje, jest jej własny test. Dwa zestawy liczb normatywnych, z których żaden nie ma w
repozytorium przypiętego cytatu wydania normy, to fałszywa pewność w czystej postaci: ocena LVRT
zależałaby od tego, która kopia zostanie użyta.

**Konsekwencja dla macierzy:** zdolność **E2** nie może wejść do produktu, dopóki obwiednia nie
jest JEDNA, po stronie backendu, z podanym źródłem normatywnym.

---

## 5. MAPA DRÓG WYPROWADZONA Z MACIERZY

Kolejność wynika z kolumny ZALEŻNOŚCI tablicy B, nie z wygody implementacji. Każda fala domyka
**wskazane wiersze macierzy** — to jest jej definicja ukończenia.

| Fala | Domyka wiersze | Dlaczego tu, a nie wcześniej/później |
|------|----------------|--------------------------------------|
| **W6-A — OBSERWABLE** | B2, B3, B4 + brakujące obserwable C2–C5 | Osiem wierszy grupy E i cztery grupy D nie mają dziś **czego czytać**. To nie jest „dodanie wykresu", to jest uzupełnienie wyniku solvera o wielkości, które produkt obiecuje. Bez tej fali każda następna albo fabrykuje, albo czeka. |
| **W6-B — SILNIK ZDARZEŃ** | D7, D11, D12, D13 | Zdarzenia bezwarunkowe: rdzeń już umie je lokalizować w czasie i re-inicjalizować, brakuje rodzajów. D11 (wyspa) wymaga B2 i C3, więc idzie po W6-A albo równolegle z jej końcem. |
| **W6-C — ZABEZPIECZENIA I AUTOMATYKA W PĘTLI** | D3, D14, D15 | Wymaga **prądów gałęzi** (B4) — zabezpieczenie mierzy prąd, nie moc urządzenia. Wprowadza nową klasę: **zdarzenie warunkowe**, lokalizowane w czasie z tą samą dokładnością co planowane. To jest warunek, żeby SO-1 działał tak, jak opisał właściciel (180 ms z nastaw, nie z wpisu). |
| **W6-D — KRYTERIA I METRYKI** | E1–E4, E6–E8 | Metryki liczone w rdzeniu, nigdy w przeglądarce. Zawiera **formalne kryterium synchronizmu Φ** — bez niego W6-E nie ma czego szukać. |
| **W6-E — GRANICA STABILNOŚCI** | E5, F1 | Wielobieg sterowany wynikiem poprzedniego biegu. Dopiero tu `t_CCT` staje się wielkością wyznaczaną; dopiero tu wolno przestać nazywać próg „maksymalnym czasem wyłączenia". |
| **W6-F — DOWÓD I WALIDACJA** | H1–H4 | Niezależna od pozostałych, idzie **równolegle od początku**: dopóki trwa, każda nowa wielkość powiększa powierzchnię `UNVALIDATED_MODEL`. |
| **W6-G — PORÓWNANIA I STUDIA PARAMETRYCZNE** | F2, F3 | Na istniejącym rejestrze serii biegów. Po W6-D, bo porównuje się metryki, nie surowe próbki. |
| **W6-H — WARSTWA DIAGNOSTYCZNA** | G1, G2 | Diagnoza z trajektorii i metryk; wariant i ponowna symulacja na mechanizmie W6-G. |
| **W6-I — POWIERZCHNIA DOCELOWA** | I1–I4 oraz UI wierszy A1–A3 | **Po akceptacji tego zamrożenia przez właściciela** i po W6-A…W6-E. Powierzchnia ma pokazywać prawdę; zbudowana wcześniej, zamroziłaby architekturę wokół braków. |
| **W6-J — TURBINY TYPU 1 I 2** | A2, część C5 | Niezależna, w dowolnym momencie. |
| **W6-K — ZWARCIA NIESYMETRYCZNE** | D2 | Po modelu fazowym (W5). Do tego czasu odmowa rdzenia zostaje i **nie wolno jej obchodzić w interfejsie**. |

### 5.1 RMS Explorer — instrument weryfikacyjny (dozwolony wcześniej, z twardymi ograniczeniami)

Właściciel dopuścił zbudowanie diagnostycznego „RMS Explorera" wcześniej, **wyłącznie** jako
narzędzia weryfikacji inżynierskiej, które **nie może zamrozić ani ograniczyć architektury
produktu docelowego**. Warunki, na jakich go dopuszczamy:

1. jest **narzędziem badawczym**, nie zdolnością produktu — nie wchodzi do toku pracy projektanta,
   nie pojawia się w nawigacji obok analiz i nie jest pozycją w katalogu badań;
2. czyta **wyłącznie** to, co rdzeń wystawia; nie liczy niczego sam (zero fizyki w narzędziu);
3. **nie tworzy kontraktu** — żadne jego pole nie staje się kontraktem produktu przez sam fakt użycia;
4. jego istnienie **nie zalicza** żadnego wiersza tej macierzy;
5. ma jawną etykietę narzędzia weryfikacyjnego, żeby nikt nie wziął go za produkt;
6. jest kasowalny w całości w chwili wejścia W6-I — i to jest warunek jego dopuszczenia, nie uwaga.

---

## 6. Trójstopniowy status walidacji (zamrożony)

Dla **każdej** zdolności osobno, nigdy zwinięte do jednej odznaki:

| Stopień | Pytanie | Co go ustanawia | Czego NIE ustanawia |
|---------|---------|-----------------|---------------------|
| **NUMERYCZNIE WYKONYWALNE** | czy bieg się wykonuje i zbiega | zbieżność, residua, kroki, powtarzalność | niczego o fizyce |
| **FIZYCZNIE ZWALIDOWANE** | czy model odwzorowuje rzeczywistość | porównanie z **niezależną wyrocznią**: `e_∞ = max_t |x_MV(t) − x_ref(t)|` z tolerancją wyprowadzoną inżyniersko, nie ze stałej przyjętej dla wygody | przejście wewnętrznej regresji |
| **KWALIFIKOWANE INŻYNIERSKO** | czy wynik nadaje się jako podstawa decyzji i dowodu | zwalidowany model + kryterium z podstawą normatywną + zakres stosowalności | sam fakt walidacji numerycznej |

**Zamrożone:** przejście wewnętrznych testów regresji **nie ustanawia** ważności fizycznej.
Awans wymaga dowodu z niezależnej wyroczni. Dziś wszystkie trzy żywe tory dynamiczne stoją na
`UNVALIDATED_MODEL` i tak mają być pokazywane.

---

## 7. Decyzje właściciela — aktualizacja

Decyzje **OD-28…OD-32** z `W6_3C_DYNAMICS_PRODUCT_FREEZE.md` §J pozostają w mocy, z jedną zmianą
wagi: **OD-30 (definicja częstotliwości węzła) przestaje być decyzją „na później" i staje się
warunkiem wejścia fali W6-A**, bo od niej zależy sześć wierszy macierzy (B2, B3, C3, C4, E3, E7).

Dochodzą dwie nowe:

| Id | Decyzja | Warianty | Rekomendacja |
|----|---------|----------|--------------|
| **OD-33** | Która obwiednia FRT jest normatywna (znalezisko N-8) | (a) obwiednia backendowa po potwierdzeniu wydania normy; (b) obwiednia frontowa; (c) obie zastąpione obwiednią z katalogu wymagań przyłączeniowych, wersjonowaną jak profile NC RfG | **(c)**, z (a) jako stanem przejściowym. Martwa kopia frontowa idzie do kasacji niezależnie od wyboru — to dług, nie wariant |
| **OD-34** | Skąd zabezpieczenie w pętli czasu bierze nastawy (wiersz D14) | (a) z modelu — nastawy pól z ENM, jedna prawda z torem koordynacji; (b) z osobnego kontraktu scenariusza dynamicznego | **(a)**. Wariant (b) tworzy drugą prawdę nastaw i wprost łamie zasadę jednego modelu |

---

## 8. Niezmiennik końcowy

> Nie budujemy ekranu wokół solvera. Budujemy środowisko badań dynamicznych, a solver, obserwable,
> walidacja, silnik zdarzeń, kryteria, diagnostyka i interfejs mają **łącznie** spełnić ten cel.

Konsekwencje operacyjne, wiążące dla każdej następnej karty:

1. Karta implementacyjna **wskazuje wiersze tej macierzy**, które domyka. Karta bez wskazania
   wierszy jest kartą bez definicji ukończenia i nie wchodzi do realizacji.
2. Zdolność uznaje się za domkniętą po **DOWODZIE ODBIORU** z tablicy B, nie po scaleniu kodu.
3. Brakująca obserwabla docelowa pozostaje w macierzy jako GAP i **nie znika przez to, że któraś
   fala jej nie objęła**.
4. Żadna fala nie ma prawa zawęzić celu z sekcji 0.
