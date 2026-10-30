# ADR — Otwarty katalog i kompletność funkcjonalna MV-DESIGN-PRO

**Data:** 2026-10-30  
**Status:** PROPOZYCJA ARCHITEKTONICZNA DO WDROŻENIA; NIE ZMIENIA SAMODZIELNIE BRAMEK DOMENOWYCH.  
**Zakres:** cały produkt: SN/nN, CT/VT, Ferranti, kable, linie, transformatory,
aparatura, zabezpieczenia, GPZ, PV/BESS/FW, stacje odbiorców i obiekty istniejące.

## 1. Decyzja produktowa

**Katalog i projekt są zawsze dostępne**: żadnej blokady wyboru,
konfiguracji, zapisu, importu, widoku SLD lub edycji dlatego, że
producent nie opublikował jednego parametru.

**Analiza jest dostępna jako proces**, ale *konkretny wniosek liczbowy*
można oznaczyć jako potwierdzony tylko wtedy, gdy ma wystarczające
dane i poprawny model. W innych przypadkach pokaż wynik częściowy,
wariant z jawnie przyjętymi założeniami, granice/zakres wyniku — jeśli
są matematycznie uzasadnione — albo „nie wyznaczono tej wielkości”.
Nigdy nie wolno zgadywać danych i raportować wyniku jako zweryfikowanego.

To nie jest zgoda na wykonywanie zwarć z fikcyjnym R/X/uk ani na
nadanie fałszywej pozytywnej oceny obciążalności.

Oddzielne oceny:
1. **Dostępność typu** — aparat można znaleźć, utworzyć lub opisać;
2. **Kompletność opisu** — które parametry potwierdzono, a których brak;
3. **Gotowość danej analizy** — zależy od jej własnych wymagań, nie od
   globalnej liczby niewypełnionych pól;
4. **Ocena zgodności** — zależy od aplikowalności normy/OSD, daty,
   obiektu, stanu istniejącego i formalnego odstępstwa, a nie od obecności SKU.

Nie wprowadzać osobnego alternatywnego modelu grafu, SLD lub solvera.

## 2. Dlaczego dotychczasowa strategia jest niewystarczająca

- Licznik `181 CT` (po PR #513) to **liczba wpisów**, nie miara pokrycia
  rzeczywistych odmian i obliczeń. 78 kombinacji to jedynie szablony
  2-rdzeniowe, 1 A; nie są „katalogiem wszystkich przekładników”.
- `completeness_report.MINIMUM["ct_types"]` sprawdza wyłącznie
  `ratio_primary_a`, `ratio_secondary_a`, `accuracy_class`;
  nie sprawdza obsługi 1–4 rdzeni, różnych I2, zaczepów, ALF/FS, Ith,
  DTR i gotowości EAZ. Również kompletność innych rodzin jest obecnie
  tylko jednolitym minimum typu, nie macierzą zastosowań.
- `enm/katalog_projektu.py` ma prawidłowy mechanizm nakładki
  `PROJEKTOWY_V1` z `catalog_ref`, snapshotem i proweniencją,
  ale obsługuje dziś `line_types`, `cable_types`,
  `transformer_types` i `karty_widmowe` — nie CT/VT.
- Istnieją `domain/readiness.py`, `AnalysisEligibilityMatrix`,
  `partial` w `docs/sld/CALCULATION_READINESS.md`,
  ale agregacja blokujących spraw do obszaru `CATALOGS` może
  wyłączyć więcej analiz niż wymaga dany brak.
- Obecne kanony `READINESS_FIXACTIONS_KATALOGI.md` i
  `CATALOG_FIRST_UI_WORKFLOW_SPEC.md` wymagają bramki katalogowej.
  **Nie usuwać reguły catalog-first**; zmienić doświadczenie użytkownika:
  „nie ma typu” → „utwórz typ projektowy w katalogu”,
  a nie „nie możesz utworzyć obiektu”.

## 3. Architektura katalogu — bez eksplozji kombinatorycznej

KATALOG = **rodzina producenta + konfigurator typu + rekord istniejącego
wyrobu + biblioteka profili OSD + typ projektowy użytkownika**.

- **Rodzina:** publikowane zakresy i ograniczenia (np. Um,
  dostępne konstrukcje, Ipn/I2, geometria); nie udaje SKU.
- **Potwierdzona konfiguracja producenta:** dokładna karta/DTR
  z przekładnią, rdzeniami, Ith i źródłem. Nie mnożyć fikcyjnych SKU.
- **Profil OSD/ENEA:** wymagany układ dla konkretnego zastosowania,
  nie tożsamy z aparatem producenta.
- **Typ projektowy:** dowolne rzeczywiście stosowane rozwiązanie,
  także starsze, specjalne, wielordzeniowe, wieloprzekładniowe,
  udokumentowane przez projektanta lub import. Posiada lokalne ID,
  źródło i status.
- **Wariant konfigurowany:** tworzony na żądanie ze znormalizowanych
  wymiarów/klas i ograniczeń rodziny, a następnie zapisany w snapshot;
  wariant doborowy nie staje się potwierdzonym produktem.

**Nie generować masowo iloczynu** producentów × prądów × rdzeni × klas
× mocy × zaczepów, aby zwiększać licznik rekordów. Zapewnić konfigurator
dla wariantów dozwolonych przez daną rodzinę i swobodną pozycję
projektową dla rzeczywistych aparatów nieobecnych w bibliotece.

## 4. Karta parametru i proweniencja (rozszerzenie bez duplikacji ENM)

Każdy istotny parametr może mieć:
- `value` + `unit` (lub `unknown`, jeśli rzeczywiście nieznany);
- `source_kind`: `MANUFACTURER`, `NAMEPLATE`, `ENEA_REQUIREMENT`,
  `USER_PROJECT`, `NORM_DERIVED`, `EXPLICIT_ASSUMPTION`;
- `source_reference` (PDF/rysunek/strona/wersja/data, o ile istnieją);
- `applicability`: rdzeń nr X, zaczep I1, wariant kabla, zakres temperatur,
  sposób uziemienia, obciążenie itp.;
- `confidence/status`: zweryfikowany, projektowy, założony, nieznany;
- `derivation` z wzorem i warunkami stosowalności, gdy wyliczony.

Pochodzenie pola uzupełnia istniejące statusy `CatalogStatus` i
`CatalogVerificationStatus`; nie zastępuje ich nowym równoległym bytem.
Względem wymagań ENEA **typ producenta**, **odstępstwo** i **stan istniejący**
muszą być rozstrzygane odrębnie.

## 5. Matryca zdolności analiz — zamiast globalnej odmowy

| Brak lub niepewność | Dostępne bez zmiany | Uściślenia/oceny, których nie wolno poświadczać |
|---|---|---|
| CT 200/5 bez karty Rct | schemat; przekładnia 40:1; dobór obwodu wtórnego w znanym zakresie | dokładny model nasycenia/opór uzwojenia wymagający Rct |
| CT 200–400/5 bez wybranego zaczepu | katalog, edycja, schemat pełnego zakresu | nastawa EAZ oparta na jednej konkretnej przekładni bez wyboru |
| CT nieznane Ith | model sieci; obliczony Ik'' sieci | potwierdzenie wytrzymałości samego CT na zwarcie |
| Brak C0/Z0 kabla | projekt, rozpływ dla znanego modelu składowej dodatniej, zwarcie 3f | wiarygodne 1f-doziemne bez modelu składowej zerowej |
| TR brak P0 | topologia; wybrane analizy wymagające tylko poprawnie określonej impedancji | dokładne straty jałowe i ocena efektywności |
| PV bez pełnej charakterystyki LVRT | SLD, dobór pola, rozpływ przy znanym P/Q | potwierdzenie LVRT/HVRT zgodnie z właściwymi testami |
| Brak nastaw zabezpieczenia | zwarcie sieci przy kompletnym modelu zwarciowym | selektywność, czasy i koordynacja EAZ |

Matryca powyżej jest **przykładem rozdzielenia zależności**, nie
wyjątkiem od równań solvera. Dla każdej analizy potrzebna jest formalna
lista używanych pól i precyzyjnych warunków. Nigdy nie zastępować
nieznanej fizyki stałą zerową lub „bezpieczną wartością domyślną”.

Status wykonania pojedynczego wyniku:
- `POTWIERDZONY` — komplet potwierdzonych/ważnych wyprowadzonych danych;
- `WARUNKOWY` — jawne dopuszczalne założenia i oznaczona ich wrażliwość;
- `CZĘŚCIOWY` — pozostałe wielkości policzone, ta oznaczona jako niewyznaczona;
- `NIEWYZNACZONY` — brak podstaw do policzenia tej konkretnej wielkości.

**Żaden z powyższych stanów nie blokuje nawigacji ani pracy nad projektem.**
Solver może odmówić policzenia konkretnej wielkości, gdy nie ma
matematycznie uzasadnionych danych; UI i inne analizy pozostają dostępne.

## 6. Konfiguracje aparatów dla realnych projektów

### CT
- I1/I2 niezależnie, również 1 A i 5 A; 1, 2, 3, 4 i więcej
  rdzeni, jeśli wykonanie to potwierdza;
- pomiarowe 0,2S / 0,5S / 0,2 / 0,5, zabezpieczeniowe 5P/10P/PX
  tylko z określonymi parametrami, gdy są znane;
- oddzielne VA, FS, ALF, Rct **dla właściwego rdzenia i zaczepu**;
- jednozakresowe `200/5` oraz wieloprzekładniowe `200–400/5`
  równorzędnie wybieralne, bez nazwy `LEGACY`;
- aktywny zaczep jest cechą **instancji**, nie sztywnego typu;
  inspektor i podkreślenie SLD pozostają zakresem prac Opusa.

### VT
- każde uzwojenie oddzielnie z U2, klasą, VA, schematem połączenia;
- uzwojenie resztkowe `100/3 V` tylko potwierdzone; 3P nie
  dowodzi otwartego trójkąta;
- napięcie znamionowe sieci, Um i współczynnik napięciowy
  odrębnie, bez fikcyjnych danych.

### Pozostałe rodziny
Kable i linie: R/X/B składowej dodatniej, Z0, powrót, Iz,
warunki ułożenia i temperatura. Transformator: Sn, uk, Pk,
P0, I0, grupa, zaczepy, Z0, tryby uziemienia. Aparatura: Un,
In, zdolności łączeniowe, Icw, elektryczne stany i wyposażenie
pola. EAZ: urządzenia, funkcje i rzeczywiste nastawy. DER:
dane znamionowe, przyłączanie SN przez pole i TR blokowy,
P/Q, modele zwarcia, właściwości NC RfG. Osobno Ferranti
3I0, LPCT/LPVT i pełne CT fazowe. Nie mieszać domen SN/nN
na jednym rzucie SLD.

## 7. Zachowanie interfejsu

1. Szukam aparatu → zawsze mogę go znaleźć w bibliotece, wybrać
   **wariant konfigurowany** albo utworzyć **własny typ projektowy**.
2. Wprowadzam znane parametry; nieznane oznaczam „do ustalenia”,
   zamiast wpisywać 0 lub fałszywe wartości.
3. Typ jest widoczny w inspektorze i katalogu projektu;
   można go zapisać/odczytać, przekazać i eksportować z proweniencją.
4. Obliczenia próbują wyznaczyć dostępne wielkości; dla konkretnego
   niewyznaczonego parametru wyświetlają „brak danych: Rct rdzenia 2”
   z akcją prowadzącą do jego edycji.
5. Raport techniczny pokazuje zakres wyników potwierdzonych,
   warunkowych i niewyznaczonych, bez globalnego „projekt zablokowany”.

Punktem integracyjnym pozostają `catalog_ref`, `CatalogRepository`,
`katalog_dla_modelu(enm)` i istniejący `ReadinessProfileV1`.
Nie uruchamiać nowego resolvera ani duplikatu ENM.

## 8. Plan wdrożenia bez dużego refaktoringu

**P0 — natychmiastowa poprawa pokrycia bez regresji**
- Zostawić istniejące rekordy, ID i projekty bez automatycznych migracji.
- Pozostawić 78 wariantów PR #513 jako przykłady, **nie skończony katalog**.
- Udostępnić jawne tworzenie własnego typu CT/VT w `katalog_projektu`,
  analogicznie do istniejących linii/kabli/TR (z testami round-trip).
- Utrzymać catalog-first przez lokalny typ i `catalog_ref` —
  nie wstrzykiwać parametrów do ENM poza rejestrem.

**P1 — pokrycie konfiguracji i wyniki**
- Konfigurator rzeczywistych rodzin: zakresy prądów i rdzeni bez
  materializacji tysięcy fikcyjnych SKU.
- Matryca pól per analiza i wynik — bez globalnej odmowy wszystkim
  obliczeniom przez pojedyncze pole.
- Rozszerzyć raport kompletności: pokrycie zastosowań, proweniencja,
  liczba typów rzeczywistych/profili/szablonów, braki per analiza,
  zamiast samego licznika `len(ct_types)`.

**P2 — integracja ENEA i odbiór projektowy**
- Oddzielne reguły dla nowych i istniejących obiektów, różnych
  funkcji pomiarowych i formalnych odstępstw.
- Testy rzeczywistych studiów: GPZ → linia SN → stacja SN/nN,
  CT pomiar + EAZ, VT, PV/BESS/FW przez TR blokowy.
- Weryfikacja SLD L0/L1/L2, odtworzenia snapshotu, eksportu,
  wyników częściowych i migracji bez regresji.

## 9. Kryteria odbioru

- Brak w bibliotece producenta nie uniemożliwia utworzenia
  własnego typu w katalogu projektu.
- Typ CT 200/5 A może pozostać jednozakresowy i być zapisany/
  odczytany bez zmiany na 200–400/5.
- Typ z trzema rdzeniami nie dostaje trzech „zaczepów”.
- Brak Rct CT nie odbiera zdolności obliczenia zwarcia w modelu sieci
  z kompletem danych impedancyjnych.
- Brak Z0 kabla nie odbiera zdolności wyznaczenia zwarcia trójfazowego
  przy kompletnych danych składowej dodatniej.
- Wynik bez niezbędnej wartości ma status `NIEWYZNACZONY`,
  nie `0`, nie `PASS`, nie `ZWERYFIKOWANY`.
- Każdy wariant/uzgodnienie/dane projektanta zachowuje proweniencję,
  nie zmienia katalogu producenta i ma deterministyczny snapshot.
- Import/eksport i istniejący projekt nie tracą danych aparatu.
- Lokalny katalog CT/VT przechodzi testy CI i `catalog_audit_ubuntu.sh`.

## 10. Ograniczenia decyzji

Ta ADR nie znosi obowiązujących kanonów bezpieczeństwa obliczeń ani
obecnych twardych bramek produkcyjnych. Ich zmiana wymaga jawnej
implementacji, migracji testów, testów domenowych i akceptacji
równoważności fizycznej. Nie ogłaszać „brak blokad wdrożony”, dopóki
formularz, backend, import/eksport i ścieżki analiz nie przejdą E2E.

**Kluczowy kompromis:** wolność projektowania nigdy nie jest równoznaczna
z prawem do otrzymania pozornie dokładnego, zmyślonego wyniku.
