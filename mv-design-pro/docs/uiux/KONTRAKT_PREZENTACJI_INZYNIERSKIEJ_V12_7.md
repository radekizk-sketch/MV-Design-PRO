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
