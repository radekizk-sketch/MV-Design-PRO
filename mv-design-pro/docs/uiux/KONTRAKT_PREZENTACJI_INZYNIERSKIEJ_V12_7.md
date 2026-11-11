# KONTRAKT PREZENTACJI INŻYNIERSKIEJ V12.7 (kanon, 2026-09-16)

**Status:** KANONICZNY, ŻYWY. Karta źródłowa: V12.7 „PROFESSIONAL ENGINEERING
PRESENTATION PASS" (B-02 / W3-E, werdykt właściciela 8,5/10 na kierunku ekranów
„Analizy specjalistyczne" i „Ocena techniczna wyników", 2026-09-16). Podlega
`mv-design-pro/docs/plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md`.

## Zakres

Ten dokument jest wiążącym kontraktem PREZENTACJI INŻYNIERSKIEJ dla ekranów
warsztatu Wyników — nie zmienia nawigacji, nazw sekcji ani solverów FROZEN
(`network_model/solvers/**`, B-01). Obowiązuje przy KAŻDEJ nowej analizie,
kryterium albo śladzie WHITE BOX dodawanym do warstwy prezentacji.

## 1. Matematyka = KaTeX, nigdy ASCII

Każda zależność matematyczna widoczna dla projektanta (symbol wielkości,
warunek/nierówność kryterium, wzór granicy, wzór podstawienia, wzór kroku
śladu) renderuje się przez `ui/proof/MathRenderer.tsx` (`MathInline` dla
zapisów liniowych, `MathBlock` dla wzorów złożonych — THD, Sverak, niepewność).
Zakaz: `<=`, `>=`, `sqrt(`, `^-1`, `^2` poza LaTeX, ` * ` między symbolami,
podkreślnik bez `\mathrm{}`/`\text{}` w tekście widocznym.

Źródło zapisu LaTeX jest WYŁĄCZNIE backend, dodane ADDYTYWNIE do kontraktów:

- `application/analyses/v126_katalog.py`: `WielkoscGlowna.symbol_latex`
  (wymagane); `PodstawaOceny.symbol_latex`/`warunek_latex` (wymagane),
  `wzor_latex`/`wzor_opis_pl` (gdy `wartosc_graniczna` jest napisem — granica
  wyznaczana wzorem, nie literałem). Test kompletności:
  `tests/test_v126_katalog_analiz.py::test_katalog_latex_bez_pustych_symboli_i_warunkow`
  — zero pustych `*_latex` w komplecie 14 kart.
- `application/analyses/v126_wzory.py` (nowy rejestr warstwy aplikacji):
  `step.key → {formula_latex, substitution_latex?}`, WIERNY wzorowi solvera
  FROZEN (`network_model/solvers/v126_academic.py`, cytat linii przy każdym
  wpisie). `substitution_latex` jest OPCJONALNY — budowany WYŁĄCZNIE z liczb
  kroku (`step["data"]`), nigdy fabrykowany. Widok API (`api/v126_academic.py`
  — trasy `/trace`, `/proof`) dokłada te pola do KOPII kroku w odpowiedzi,
  nigdy nie mutuje `result["white_box_trace"]` solvera ani zapisanego pakietu
  dowodowego — `deterministic_hash`/`proof_hash`/`report_hash` liczone są
  PRZED tym wzbogaceniem i zostają nietknięte. Test kompletności: uruchamia
  wszystkie rodzaje PREZENTOWANE V12.6 na sieci złotej i sprawdza, że każdy
  zmierzony `step.key` ma wpis (`tests/application/analyses/test_v126_wzory.py`,
  pin liczby kluczy z pomiaru).
- `application/analyses/werdykt_projektowy.py`: `DefinicjaKryterium.symbol_latex`/
  `warunek_latex` (puste WYŁĄCZNIE dla `WARUNEK_ZGODNOSC`); `OcenaElementu.
  margines_wzor_latex` — z JEDNEGO źródła co arytmetyka marginesu (`_zapas`,
  reguła KLASA §3: predykaty parami), zapis generyczny („wartość"/„granica",
  nie nazwa konkretnej wielkości), pusty gdy margines pochodzi od dostawcy,
  który nie ujawnia własnej formuły.

Front NIE konwertuje tekstu na LaTeX żadnym parserem/regexem — czyta pole
`*_latex`, renderuje wprost. Pola tekstowe (`symbol`, `warunek_pl`, `zrodlo_pl`,
`norma_pl`) zostają w kontrakcie dla audytu/eksportu, NIE są renderowane jako
matematyka.

Kontrakt pól KROKU ŚLADU (karta DOWOD-CIEPLNY, 2026-09-25): zapis matematyczny
kroku idzie WYŁĄCZNIE do pól `*_latex` (`formula_latex`, `substitution_latex`)
jako LaTeX GOŁY, bez ograniczników `$$`/`$` (pomiar: 1384 pola `*_latex` kroków w
fiksturach, 0 z ogranicznikami; eksport LaTeX biegu wstawia pole w `\[ … \]`, w
którym `$$` łamie dokument). Pola prozy kroku (`substitution`, `notes`, `title`,
`unit_check`, `symbol`, każde `*_pl`) nie niosą znaczników LaTeX. Rdzeń IEC 60909
(B-01) kopiuje LaTeX do `substitution` — granica aplikacji zdejmuje tę kopię po
kluczu kroku (`application/slad_kroku.py`). Pilnują: strażnik
`scripts/slad_proza_bez_latex_guard.py` (korpus fikstur, lista dozwolona pusta),
`backend/tests/ci/test_slad_proza_bez_latex.py` (przebieg producentów) i bramka
treści specy zrzutowych `frontend/e2e/trescMatematyczna.ts` (wzór przez KaTeX,
zero `math-fallback` i surowego LaTeX-u na pierwszym planie).

## 2. Metadane produkcyjne poza pierwszym planem

`run_id`, `deterministic_hash`, `input_hash`, `solver_version`, `model_hash`,
`snapshot_hash`, `proof_hash`, `report_hash` NIE są pierwszym planem żadnego
ekranu wyników. Jeden komponent, `InformacjeAudytowe`
(`frontend/src/ui2/wyniki/wzorzec/InformacjeAudytowe.tsx`), pokazuje je:

- zwinięte, WYŁĄCZNIE w `trybZaawansowania === 'expert'` — na każdym ekranie,
  które dziś niesie takie metadane w pierwszym planie (inwentarz: `EkranAnaliz
  Akademickich.tsx` — sekcja „Przebieg" i „Przedmiot analizy"; `EkranOceny.tsx`
  — nagłówek „Podstawa oceny");
- ORAZ zawsze dostępne w sekcji „Pakiet dowodowy" (`wyniki/dowod/PakietDowodowy
  .tsx`, `akademickie` `PanelDowodu`) — TA sekcja NIE jest ukrywana, bo to
  właśnie jest jej treść (audyt, reprodukowalność).

Metadane NIE są usuwane z kontraktów API ani z eksportu — wyłącznie z
pierwszego planu ekranu.

## 3. Formularz bez duplikacji kontraktu

`FormularzParametrow.tsx` (akademickie): tryb formularza pokazuje pole +
odznakę WYMAGANE/OPCJONALNE przy etykiecie (`OdznakaWymagania`, dopasowanie
`DefinicjaPola.klucz` → `ParametrUzytkownika.klucz` katalogu przez PEŁNY klucz
kontraktu `V126RunRequest.parameters`) i podsumowanie „Dane wymagane: n/m ·
Dane opcjonalne: l dostępnych · Gotowość: potwierdzona/niepotwierdzona" — `n`/`m`
liczone z ODPOWIEDZI GOTOWOŚCI backendu (`braki[].klucz_parametru`), NIGDY z
wartości aktualnie wpisanych w polach (DOM). Pełna tabela kontraktu (klucz,
nazwa, jednostka, wymagane, opis) żyje w rozwijanej sekcji „Kontrakt danych
analizy" — nic nie usuwa się z istniejącej sekcji „Od użytkownika" (opis
źródła danej zostaje).

## 4. Stan danych karty katalogu

Karta analizy w katalogu (`KartaAnalizy`, ekran „Analizy specjalistyczne")
pokazuje DOKŁADNIE dwa stany, różny wygląd (klasa CSS `--ok`/`--brak`) i różny
tekst:

- `DANE KOMPLETNE · GOTOWOŚĆ POTWIERDZONA` + akcja „Uruchom analizę";
- `BRAKUJE n DANYCH WYMAGANYCH` (odmiana PL po „brakuje" — dopełniacz: 1 DANEJ
  WYMAGANEJ / n≥2 DANYCH WYMAGANYCH) + akcja „Uzupełnij dane".

Liczba `n` = `gotowosc.braki.length` z odpowiedzi backendu, nigdy licznik z
frontu. Obie akcje otwierają TEN SAM widok analizy (formularz + lista braków
żyją tam) — zmienia się WYŁĄCZNIE etykieta przycisku.

## 5. Werdykt nie szerszy niż zakres

Pole addytywne `zakres_oceny: "kryterium" | "uklad"` (domyślnie `"kryterium"`)
na `KartaAnalizy` (katalog V12.6) i na `DefinicjaKryterium` (werdykt
projektowy). UI CZYTA pole, nie zgaduje:

- `"kryterium"` → werdykt nazywa WYŁĄCZNIE sprawdzoną wielkość („NIE SPEŁNIA
  KRYTERIUM DOPUSZCZALNEGO NAPIĘCIA DOTYKOWEGO", nie „uziom niezgodny");
- `"uklad"` → wolno nazwać cały obiekt/układ (jedyny dziś przypadek:
  `dobor.tor_der_sn` — `raport_zgodnosci.py` sam jest kontrolą KOMPLETU trzech
  kryteriów toru źródła i wystawia jeden werdykt dla całego toru).

Naprawione instancje (inwentarz przed/po w meldunku karty): `earthing_safety`
(„uziom (nie)bezpieczny" → „spełnia/nie spełnia kryteria dopuszczalnych napięć
rażenia"), `transient_trv` (generyczne „spełnione/niespełnione" bez nazwania
kryterium → „spełnia/nie spełnia kryterium marginesu napięcia powrotnego").

Ekran „Ocena techniczna wyników" (`EkranOceny.tsx`) pokazuje znacznik „ocena
całego układu" (`mvd-ocena-znacznik-uklad`, testid
`mvd-ocena-zakres-uklad-{kryterium_id}`) przy nagłówku pozycji WYŁĄCZNIE gdy
`pozycja.zakres_oceny === 'uklad'` — w obu miejscach, gdzie nagłówek pozycji
się renderuje (tabela z wynikami elementów i lista „bez podstaw"). Znacznik
NIGDY nie zgaduje z liczby elementów ani z nazwy kryterium.

## 6. Trójka wartość–granica–margines

Wszędzie, gdzie backend niesie WSZYSTKIE TRZY liczby (wartość obliczona,
wartość graniczna/odniesienia, margines) dla jednej wielkości, ekran pokazuje
je razem, z wzorem marginesu obok (`MathInline`). Ekran „Ocena techniczna
wyników" ma to już w kontrakcie (`OcenaElementu.wartosc/odniesienie/margines`)
— karta V12.7 dołożyła `margines_wzor_latex`. Ekran „Analizy specjalistyczne"
pokazuje wartość + odniesienie tam, gdzie solver niesie oba
(`WielkoscGlowna.odniesienieSciezka`, np. napięcie dotykowe/krokowe i granica
dopuszczalna, energia rezystora i wartość znamionowa) — margines NIE jest
liczony na froncie, gdy backend go nie zwraca (zero fizyki w UI, zero
fabrykacji trzeciej liczby).

## 6a. Werdykt wyjaśnialny (rozszerzenie 2026-09-22)

Trójka wartość–granica–margines (§6), zakres werdyktu (§5) i osie wiarygodności (§7) są
podzbiorem kontraktu przekrojowego `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`: każdy
werdykt pokazany człowiekowi niesie przedmiot, kryterium (`MathInline`), wynik z jednostką, limit
z podstawą i stanem źródła, margines, przyczynę, wyjaśnienie, dowód (metoda, status modelu, status
danych), zakres ważności i ślad; status maszynowy nie jest samodzielnym wynikiem. Jedno miejsce
mapowania statusu na etykietę/kolor: karta werdyktu w `ui2/wyniki/wzorzec`.

## 7. Wiarygodność ≠ spełnienie

Dwie NIEZALEŻNE osie: blok `sanity`/wiarygodność (czy liczbom można ufać —
`MAPA_WIARYGODNOSCI`) i werdykt kryterium (czy projekt spełnia wymaganie).
Wynik wiarygodny może być jednocześnie NIE SPEŁNIA (liczby dobre, projekt zły)
albo BRAK PODSTAW DO OCENY (liczby dobre, brak kryterium/normy) — te dwa stany
nigdy nie zlewają się w jeden.

## 8. Hierarchia jawności

Kolejność sekcji wyniku (nazwy sekcji BEZ zmian):

1. **„Pełna jawność obliczeń"** (`PanelSladu`) — wzór → dane → podstawienie →
   wynik → jednostki, dla inżyniera, zwinięta ale zawsze osiągalna.
2. **„Pakiet dowodowy"** (`PanelDowodu`, `wyniki/dowod/PakietDowodowy.tsx`) —
   audyt, reprodukowalność, metadane — dla audytu.
3. **„Surowy zapis odpowiedzi solvera"** (`PanelZapisuTechnicznego`) —
   WYŁĄCZNIE tryb ekspercki, zwinięty, NA KOŃCU.

## 9. Typografia obu motywów

Kolory wyłącznie tokenami `--mvd-*`; liczby `mvd-num` (`font-variant-numeric:
tabular-nums`). KaTeX (`node_modules/katex/dist/katex.min.css`) nie ustawia
własnego koloru na `.katex` — dziedziczy `color` z rodzica, więc każdy
kontener KaTeX musi siedzieć wewnątrz elementu z `color: var(--mvd-ink)` (albo
pochodnej) — NIGDY z kolorem zaszytym inline. Zrzuty obu motywów są dowodem
(nie kod) — werdykt wizualny wydaje właściciel (B-02).

## 10. Standard warsztatu inżyniera — ekran referencyjny KD6 (decyzja właściciela 2026-11-04)

**Zakres: CAŁA aplikacja** (nie tylko warsztat Wyników). Ekran „Wytrzymałość
aparatury w punkcie zwarcia” (KD6, oba motywy;
`docs/audit/visual/flow-ekspert/kd6-ogniwo-model-{light,dark}.png`, karta
APARATURA-TABELA) jest referencyjnym kierunkiem wizualnym i funkcjonalnym.
Nie kopiuje się jego układu na każdy ekran — stosuje się konsekwentnie te same
zasady. Cel nadrzędny: wygodny warsztat inżyniera elektroenergetyka, nie
rozbudowany panel demonstracyjny.

**Zasady:**

1. Maksimum informacji inżynierskiej przy minimum zajętego miejsca — bez pustych
   przestrzeni, nadmiernych odstępów i rozbudowanych bloków opisowych.
2. Wyniki przede wszystkim: wartości obliczone, znamionowe, jednostki, różnice
   i marginesy na pierwszym planie.
3. Tabele zamiast powtarzalnych kart wszędzie, gdzie inżynier porównuje
   urządzenia, warianty lub wyniki (jeden obiekt = jeden wiersz, rozwinięcie na
   żądanie).
4. Jedna informacja w jednym miejscu — bez powtarzania danych wejściowych,
   nagłówków i objaśnień (wspólna wartość raz, nad tabelą; uzasadnienie raz,
   w pozostałych miejscach odwołanie).
5. Szczegóły na żądanie: wzory, założenia, źródła danych i uzasadnienia
   w sekcjach rozwijanych (jeden przycisk „Szczegóły obliczeń” na obiekt, nie
   na każde kryterium).
6. Ograniczone komunikaty opisowe — wyniku nie zastępuje się oceną słowną;
   plakietki statusu nie powtarzają się przy każdym kryterium (status
   i kompletność dowodu zostają w szczegółach, §6a bez zmian).
7. Spójna typografia: jednolita hierarchia nagłówków, liczby wyrównane
   (`mvd-num`), jednostki w nagłówkach kolumn, konsekwentna precyzja (prądy
   i zapasy 2 miejsca, czasy 3; wartości znamionowe całkowite bez zbędnych zer)
   — jeden formater liczb, nie lokalne.
8. Kolor wyłącznie z konkretnym znaczeniem — przy wartości wymagającej uwagi
   (zapas ujemny, brak limitu/zapasu, czas nieustalony), nigdy tło całego
   obszaru.
9. Pełna spójność motywu jasnego i ciemnego: identyczny układ, kontrast
   i hierarchia (§9).
10. Polskie nazewnictwo techniczne zgodne z terminologią elektroenergetyczną
    (np. I_sc dla wyłączników SN wg IEC 62271-100, I_cu tylko dla nN).

**Zastosowanie w modułach** (każdy zachowuje właściwy sobie sposób prezentacji):
SLD — kompaktowe pola, czytelne symbole, ograniczone opisy, szczegóły zależne od
LOD; obliczenia — zwarte tabele, wyeksponowane wyniki, wyprowadzenia po
rozwinięciu; aparatura — bezpośrednie porównanie parametrów znamionowych
i obliczonych; zabezpieczenia — czytelne nastawy i funkcje bez powielania
informacji katalogowych; mapy i profile — maksymalna powierzchnia robocza,
ograniczone panele zasłaniające projekt; inspektory — logicznie pogrupowane
parametry, edycja bez zbędnych przejść i okien.

**Granice:** brak globalnej przebudowy interfejsu i osobnego programu. Standard
wdraża się stopniowo przy planowanych pracach nad modułami (wiersze
`PLANS.md` część A §C). Zachowana architektura i działające funkcje; bez
przepisywania ekranów wyłącznie dla ujednolicenia wyglądu; bez nowego systemu
komponentów, gdy istniejące wystarczają (`ui2/wyniki/wzorzec`, `ui2/shared`);
bez zmian ENM, obliczeń i kontraktów danych z powodów estetycznych.

**Kryterium odbioru każdego zmienionego ekranu** (ocena na rzeczywistym ekranie,
zrzuty obu motywów; werdykt wizualny — właściciel, B-02): bardziej czytelny,
bardziej kompaktowy, szybszy w obsłudze, bez zbędnych powtórzeń, spójny
wizualnie z KD6. Zmiana, która zwiększa liczbę kliknięć, przewijanie lub ilość
tekstu bez rzeczywistej korzyści dla inżyniera, jest odrzucana. Meldunek karty
podaje pomiar przed/po (wysokość ekranu w px, liczba kliknięć do wyniku).

## Strażnik klasy

`scripts/ui_math_guard.py` — skan `frontend/src/ui2/**` i
`backend/src/application/analyses/v126_katalog.py`/`werdykt_projektowy.py` na
ASCII-matematykę w tekstach użytkownika, z zapadką (pin z pomiaru, tylko w
dół). Self-test: `scripts/test_ui_math_guard.py`. Wpięty do
`.github/workflows/frontend-checks.yml` i `scripts/guardy_z_ci.py`.

## Dodawanie nowej analizy/kryterium — dwa zdania

Każda nowa wielkość/kryterium/krok śladu dostaje `*_latex` w KONTRAKCIE
BACKENDU (nie w UI) w tej samej karcie, co sama wielkość — bez wpisu test
kompletności właściwego kontraktu jest czerwony. Metadane produkcyjne nowego
ekranu idą przez `InformacjeAudytowe` (wzorzec/wspólny komponent), nie przez
nowy, osobny blok.
