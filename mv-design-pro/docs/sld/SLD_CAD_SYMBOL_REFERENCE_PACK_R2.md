# SLD nN — CAD SYMBOL REFERENCE PACK (R2 / R2.1) + PRZEGLĄD INŻYNIERSKI

**Kontekst:** odrzucenie B-02 R2 (właściciel, 2026-09-02, ocena 5/10: symbolika 3,5 / język
CAD 3 / czytelność gęsta 4 / polska praktyka SLD 4). Mandat §21/§27: „Najpierw zaprojektuj
i zatwierdź pełny CAD SYMBOL REFERENCE PACK. Dopiero potem migruj renderer."

**R2.1 (2026-09-02):** właściciel przekazał SCHEMAT REFERENCYJNY (schemat ideowy zasilania
instalacji PV 149,5 kWp, arkusz A2, notacja IEC 60617 / IEC 81346 — lokalizacje +ZK1/+ZPV1,
oznaczenia -Q1/-F1/-T11) z poleceniem „przyjmij symbole ze schematu z załącznika". Geometria
pakietu została odczytana z tego schematu WEKTOROWO (dump rysunku PDF, nie „na oko") i
przeniesiona do rejestru; pomiary w §12. Pytania §9 a, b, f są tym samym rozstrzygnięte.

**Ten dokument = krok 1.** Pakiet zaprojektowany, wyrenderowany i przejrzany wielosoczewkowo
przez wykonawcę. **Zatwierdzenie pakietu należy do właściciela** — dopóki nie padnie,
pakiet ma status „przegląd inżynierski wykonawcy", nie „zatwierdzony". Migracja renderera
(krok 2) jest prowadzona na tym pakiecie w tej samej gałęzi lokalnej, żeby werdykt
właściciela mógł objąć symbole i ich użycie na scenie razem; każda uwaga do pakietu
wraca jako karta naprawcza do rejestru i do sceny.

Rejestr normatywny (pola per symbol): `docs/sld/SLD_SYMBOL_NORMATIVE_REGISTRY.md`.
Kod: `frontend/src/ui/sld/v3/cad/cadSymbolRegistry.ts`, renderer `cad/CadSymbol.tsx`.
Harness: `frontend/sld-symbol-pack-harness.html` (`?tryb=pakiet|rozpoznanie`, `?theme`,
`?mono=1`). Spec: `frontend/e2e/sld-symbol-pack-screenshot.spec.ts`.

## 1. Kadry pakietu (`docs/audit/visual/cad/`)

| Plik | Treść |
|---|---|
| `pakiet_dark.png` | tablica 19 symboli: obecny → proponowany (ZAMKNIĘTY / OTWARTY / NIEZNANY), motyw ciemny |
| `pakiet_light.png` | jw., motyw jasny techniczny |
| `pakiet_mono.png` | jw., jeden tusz na białym (§23) |
| `rozpoznanie_mono.png` | tablica rozpoznawalności bez etykiet, 26 pozycji (§22) |

Każda komórka „proponowany" pokazuje siatkę co 4 u, obrys gabarytu nominalnego (kreska
przerywana) i kwadraciki zacisków — do przeglądu §16 (kotwice na siatce).

## 2. Źródła i to, czego NIE użyto

- **Użyto (R2.1, rozstrzygające):** schemat referencyjny właściciela — geometria aparatów
  (nóż, kwalifikatory, wkładka, wyzwalacze), przekładnika, falownika, modułu PV, baterii,
  uziemienia, kropki połączenia; odczyt wektorowy §12.
- **Użyto:** oficjalny wykaz identyfikatorów IEC 60617 z tytułami (podgląd IEC webstore
  „IEC 60617 — Graphical symbols for diagrams"), z którego pochodzą numery S00xxx w
  rejestrze; konwencje dokumentacji stacji i rozdzielnic (schematy jednokreskowe
  producentów rozdzielnic nN/SN, praktyka PowerFactory w zakresie dyscypliny: symbol z
  danych, stan z geometrii, tabliczka tekstem).
- **Nie użyto:** przypadkowych symboli z internetu, ikon Material/Lucide, piktogramów
  aplikacji, grafik z historycznych arkuszy PN-EN 60617 (wycofane).
- **Nie zadeklarowano** zgodności „PN-EN"/„IEC" bez porównania z bazą IEC 60617 — patrz
  statusy w rejestrze (0 × NORMATIVE_VERIFIED, 17 × ENGINEERING_REVIEWED, 2 × DRAFT).

## 3. Kanon geometrii (skrót; pełny w rejestrze §0)

Jednostka u; aparat 16×24 u, oś toru x = 8; styk stały y = 7; przegub (8, 17); nóż 11,5 u
obracany wokół przegubu: 0° ZAMKNIĘTY (końcówka zachodzi na przewód styku stałego), −30°
OTWARTY (końcówka w górę-LEWO, na wysokości styku stałego — jak w pierwowzorze), −15° +
kreska przerywana noża = NIEZNANY. Kwalifikatory funkcji IEC NIERUCHOME na styku stałym:
„×" na końcu przewodu styku stałego (wyłącznik), poprzeczka (odłącznik), poprzeczka + okrąg
zawieszony POD poprzeczką (rozłącznik); wkładka na nożu (rozłącznik bezpiecznikowy, przegub
(8, 20), nóż 17 u, −20°); wyzwalacze termiczny + elektromagnetyczny przy nożu, obracane z
nim (wyłącznik instalacyjny — bez „×"). Przekształtnik: AC u góry („3~"), DC u dołu („=");
PV / bateria PONIŻEJ przekształtnika. Orientacja pozioma: +90°, otwarty nóż w górę. Kreska
nieskalowana z kamerą; hierarchia BUS 3,0 / PRIMARY 1,6 / symbol 1,4 / SECONDARY 1,0 /
HIGHLIGHT 6,0 px. Zero wypełnienia jako nośnika stanu; zero tekstu w symbolu poza znakami
normatywnymi (G, „~", „3" przy „~" przekształtnika) i znakami funkcji IEC w prostokącie
zabezpieczenia.

## 4. Tablica pakietu — 19 symboli

| Lp | Symbol CAD | OBECNY (odrzucony) | PROPONOWANY (R2.1) | Typ domenowy | IEC | Nazwa polska | Status |
|---|---|---|---|---|---|---|---|
| 01 | `cad.wylacznik` | prostokąt z dźwignią, wypełnienie = zamknięty | „×" na styku stałym + nóż na przegubie u dołu, otwiera w górę-lewo | branch.breaker (APARAT_NN); bus_coupler+WYLACZNIK_* | S00287 (S00227+S00219) | WYŁĄCZNIK | ENGINEERING_REVIEWED |
| 02 | `cad.wylacznikInstalacyjny` | ten sam prostokąt co 01 | nóż bez „×" + wyzwalacz termiczny („hak") i elektromagnetyczny (strzałka) obracane z nożem | branch.breaker (APARAT_NN_MCB) | S00227 + kwalifikatory wyzwalaczy | WYŁĄCZNIK INSTALACYJNY | ENGINEERING_REVIEWED |
| 03 | `cad.odlacznik` | nóż 45°, poprzeczka przy przegubie | poprzeczka styku stałego + nóż | branch.disconnector; bus_coupler+ODLACZNIK | S00288 (S00227+S00220) | ODŁĄCZNIK | ENGINEERING_REVIEWED |
| 04 | `cad.rozlacznik` | nóż + poprzeczka na końcu noża | poprzeczka + okrąg POD poprzeczką + nóż | branch.switch; bus_coupler+ROZLACZNIK | S00290 (S00227+S00220+S00221) | ROZŁĄCZNIK | ENGINEERING_REVIEWED |
| 05 | `cad.lacznik` | pusty/pełny prostokąt „QBC" | styk + nóż bez kwalifikatora | bus_coupler bez device_kind (+NN-AUD-18) | S00227 | ŁĄCZNIK (szyn, funkcja nieokreślona) | ENGINEERING_REVIEWED |
| 06 | `cad.uziemnik` | nóż + uziemienie (biblioteka SN) | przegub na przewodzie, nóż na poprzeczkę, uziemienie 12:9:6 | brak elementu ENM w nN | S00288 + S00200 | UZIEMNIK | DRAFT |
| 07 | `cad.bezpiecznik` | sześciokąt kasety | prostokąt z przewodem na wylot | branch.fuse | S00362 | BEZPIECZNIK | ENGINEERING_REVIEWED |
| 08 | `cad.rozlacznikBezpiecznikowy` | ten sam sześciokąt co 07 | poprzeczka + okrąg u góry, nóż 17 u z wkładką na dolnej części, przegub u dołu | branch.switch+ROZLACZNIK_BEZPIECZNIKOWY | S00370 | ROZŁĄCZNIK BEZPIECZNIKOWY | ENGINEERING_REVIEWED |
| 09 | `cad.transformator2u` | dwa okręgi 32×40 | dwa okręgi 16×28, hv/lv | transformer | S00841 | TRANSFORMATOR | ENGINEERING_REVIEWED |
| 10 | `cad.przekladnikPradowy` | okrąg na przewodzie | okrąg na torze z przewodem ukrytym w okręgu | measurement CT | S00850 | PRZEKŁADNIK PRĄDOWY | ENGINEERING_REVIEWED |
| 11 | `cad.przekladnikNapieciowy` | dwa okręgi bez wyprowadzenia | odgałęzienie, dwa uzwojenia, wtórne otwarte | measurement VT | S00878 | PRZEKŁADNIK NAPIĘCIOWY | ENGINEERING_REVIEWED |
| 12 | `cad.przeksztaltnik` | brak (ukryty w ikonie PV) | kwadrat z przekątną, „3~" u góry (AC), „=" u dołu (DC) | ogniwo złożeń 13/14 | S00896 (S00213) | FALOWNIK | ENGINEERING_REVIEWED |
| 13 | `cad.zrodloPvZPrzeksztaltnikiem` | ikona w ramce 32×32 | falownik NAD ramką pola z modułem PV (szewron) | generator pv_inverter | S00896 + S00908 | GENERATOR PV Z FALOWNIKIEM | ENGINEERING_REVIEWED |
| 14 | `cad.magazynZPrzeksztaltnikiem` | ikona baterii w ramce | przekształtnik NAD ramką z ogniwem | generator bess | S00897 + S01342 | MAGAZYN ENERGII Z PRZEKSZTAŁTNIKIEM | ENGINEERING_REVIEWED |
| 15 | `cad.generator` | okrąg z G 32×32 | maszyna G~ 16×24 | generator synchronous/wind/fw_* | S00819 | GENERATOR | ENGINEERING_REVIEWED |
| 16 | `cad.odplywOdbior` | strzałka | strzałka przepływu od szyn | load | S00104 | ODBIÓR | ENGINEERING_REVIEWED |
| 17 | `cad.zabezpieczenie` | okrąg z kodami wewnątrz (plakietka) | prostokąt urządzenia + znaki IEC (I>, I0>) | protection_assignment | konwencja | ZABEZPIECZENIE | DRAFT |
| 18 | `cad.zacisk` | kropka pełna z widoku | okrąg pusty | bus stopnia ≠ 2 / granica | S00017 | ZACISK | ENGINEERING_REVIEWED |
| 19 | `cad.wezel` | kropka pełna | kropka pełna (∅ ≈ 7× kreski) | bus stopnia ≥ 3 | S00020/S00021 | WĘZEŁ | ENGINEERING_REVIEWED |

## 5. Przegląd wielosoczewkowy (dyrektywa właściciela nr 5)

Soczewki: projektant sieci (A), zwarciowiec (B), zabezpieczeniowiec (C), rozdzielnie/
aparatura (D), katalogi/ENM (E), CAD/dokumentacja (F), UX/IA (G). Zapis: ustalenie →
decyzja. Wszystkie decyzje wdrożone w rejestrze przed renderem kadrów w §1. Punkty 1–3
z R2 zostały ZASTĄPIONE przez pierwowzór właściciela (R2.1, pkt 13–19).

1. **(D, F) Krzyżyk funkcji wyłącznika** — R2: „×" na końcówce noża. **Zastąpione (R2.1):
   pierwowzór rysuje „×" NIERUCHOMO na końcu przewodu styku stałego, w osi** — patrz 13.
2. **(D) Strona odchylenia noża** — R2: w prawo. **Zastąpione (R2.1): w lewo (w górę-lewo),
   jednolicie dla całej rodziny** — patrz 14.
3. **(D) Poprzeczka odłącznika** — poprzednia biblioteka kładła poprzeczkę przy przegubie
   (zła strona); w IEC to znak STYKU STAŁEGO → poprawione. Rozłącznik: R2 kładł okrąg na
   przegubie. **Zastąpione (R2.1): okrąg ZAWIESZONY POD poprzeczką styku stałego** — 15.
4. **(A, E, G) Zamknięty łącznik ogólny (05)** — w IEC zamknięty styk bez kwalifikatora jest
   kreską. Zamiast dorysowywać funkcję, której model nie zna: (i) identyfikację daje
   HIERARCHIA GRUBOŚCI (kreska symbolu 1,4 px między szynami 3,0 px) + tabliczka
   „QBC · ZAMKNIĘTY", (ii) audyt NN-AUD-18 (INFO) nazywa brak klasy funkcjonalnej,
   (iii) z `device_kind` sprzęgło dostaje symbol REALNEGO aparatu (01/02/03/04/08).
   Scenariusze danych zostają zróżnicowane, żeby wszystkie trzy ścieżki były na kadrach
   (reguła KLASA, nie instancja).
5. **(C) Zabezpieczenie (17)** — pusty prostokąt nie jest rozpoznawalny bez etykiety, a
   plakietka z numerami ANSI była odrzucona. Polska/europejska praktyka: prostokąt
   urządzenia ze ZNAKAMI wielkości charakterystycznej IEC (I>, I>>, I0>, U<, f<, df/dt,
   Δφ) → wdrożone: znaki z danych przypisania nanosi renderer (`wnetrze`), numery ANSI w
   panelu odpływu. Pierwowzór potwierdza konwencję (blok wyzwalacza LSI z „I>", „I>>").
   Status DRAFT (brak identyfikatora IEC w wykazie podglądowym).
6. **(B, C) Przekładniki** — CT = okrąg NA torze (dwa zaciski), VT = odgałęzienie z dwoma
   uzwojeniami i otwartym wyprowadzeniem wtórnym (jeden zacisk). Różnica rozmiaru i
   liczby zacisków odróżnia VT od transformatora mocy. Przekładnia/klasa/rdzenie/moc
   pomiarowa — tekstem obok (kontrakt projekcji: `accuracy_class`, `burden_va`,
   `ct_cores`, `ct_arrangement`). R2.1: przewód pierwotny UKRYTY w okręgu (pierwowzór).
7. **(A, E) PV / BESS** — ENM modeluje PV+falownik i magazyn+przekształtnik jako JEDEN
   element `generator`; symbol jest złożeniem obu ogniw, nie dorysowuje osobnego
   urządzenia. R2.1: kolejność z pierwowzoru — kabel AC → falownik → tor DC → moduły /
   bateria (R2 miał źródło NAD przekształtnikiem — zastąpione, bo kabel z góry trafiał w
   ogniwo PV zamiast w falownik). Tor za symbolem (aparat, kabel, punkt przyłączenia,
   CT, LoM) pochodzi z realnych elementów ENM (scenariusz 12).
8. **(A) Odbiór** — Load ENM nie ma typu odbiornika; strzałka przepływu od szyn jest
   uczciwym nośnikiem (R2 §12). Pierwowzór rysuje odbiorniki jawne (gniazdo 1/N/PE) —
   pojawią się w rejestrze razem z typem odbiornika w ENM, nie wcześniej.
9. **(F) Tekst w symbolach** — dozwolone WYŁĄCZNIE: kod literowy maszyny „G" + „~", „3"
   przy „~" przekształtnika (część symbolu IEC, pierwowzór) i znaki funkcji IEC w
   prostokącie zabezpieczenia. Żadnych numerów, nazw, jednostek wewnątrz symboli;
   tabliczki tekstem obok, w hierarchii typograficznej sceny.
10. **(F) Stan NIEZNANY** — kąt pośredni −15° i kreska przerywana TYLKO noża (kwalifikatory
    ciągłe) — bez znaku „?" w symbolu; słowo „STAN NIEZNANY" niesie tabliczka.
11. **(G) Symbol CAD vs piktogram** — w harnessie i kanwie L2 renderuje wyłącznie
    `CadSymbol`; piktogramy kreatorów/inspektora nie mają dostępu do warstwy L2 (guard w
    testach rejestru: brak `<image>`, `<foreignObject>`, ikon czcionek).
12. **(B) Zwarciowiec** — symbol nie koduje parametrów zwarciowych; Ik″, ip, Ith i
    wytrzymałość aparatu są nakładką wynikową z solvera (pochodzenie: `result_snapshot`),
    nie geometrią. Bez zmian względem kontraktu 3.0.0.
13. **(D, F) R2.1 — „×" wyłącznika** na końcu przewodu styku stałego, w osi, NIERUCHOMY
    (pierwowzór -QPV1, każdy wyłącznik mocy schematu): pomiar §12. Test klasowy pina, że
    krzyżyk leży poza grupą przegubu i w środku ma koniec przewodu górnego.
14. **(D) R2.1 — kierunek otwarcia** w górę-lewo, końcówka na wysokości styku stałego
    (przesunięcie ≈ 0,47 długości noża); jednolicie: wyłącznik, MCB, odłącznik, rozłącznik,
    łącznik ogólny, rozłącznik bezpiecznikowy, uziemnik (lustrzanie: końcówka dolna w lewo).
    Poziomo (sprzęgło) = w górę od osi szyny (obrót +90°).
15. **(D) R2.1 — rozłącznik**: okrąg r = 1,4 u zawieszony pod poprzeczką styku stałego,
    wypełniony papierem i rysowany na wierzchu (zamknięty nóż przechodzi przez okrąg);
    bez okręgu na przegubie.
16. **(D, E) R2.1 — wyłącznik instalacyjny (02)** jako OSOBNY symbol: pierwowzór rysuje
    każdy aparat modułowy (B10, B16A, C16A) nożem z wyzwalaczem termicznym („hak"
    bimetalu) i elektromagnetycznym (strzałka) prostopadle do noża, obracanymi z nim, bez
    „×". Wybór z DANYCH: `catalog_namespace = APARAT_NN_MCB` (aparat modułowy IEC 60898-1,
    ≤ 125 A) vs `APARAT_NN` (wyłącznik mocy IEC 60947-2) — pole `devices[].catalog_namespace`
    dodane addytywnie do kontraktu (lustro `branches[]`). Reguła obejmuje KAŻDĄ rolę z
    funkcją wyłącznika (breaker, sprzęgło z klasą WYLACZNIK_*), nie tylko odpływ.
17. **(D) R2.1 — rozłącznik bezpiecznikowy (08)**: poprzeczka + okrąg u góry (y = 4),
    przegub u dołu (8, 20), nóż 17 u z prostokątem wkładki 4,4×9 u na dolnej części
    (nóż przechodzi przez wkładkę), otwarcie −20° (dłuższy nóż → mniejszy kąt, ta sama
    wysokość końcówki; pierwowzór 7,2 / 25,8 pt ≈ 16°).
18. **(A) R2.1 — przekształtnik**: przekątna lewy-dół → prawy-góra, „3~" w trójkącie
    górnym-lewym (AC ku szynie), „=" w dolnym-prawym (DC); zacisk AC u góry.
19. **(F) R2.1 — uziemienie i kropka**: trzy kreski 12 : 9 : 6 u (pierwowzór
    11,3 : 8,4 : 5,7 pt); kropka połączenia r = 2,2 u (pierwowzór ∅ ≈ 7× grubości kreski).

## 6. Test rozpoznawalności §22 — klucz odpowiedzi (`rozpoznanie_mono.png`)

| Poz. | Symbol | Stan | Poz. | Symbol | Stan |
|---|---|---|---|---|---|
| 1 | przekładnik prądowy | — | 14 | odłącznik | ZAMKNIĘTY |
| 2 | odłącznik | OTWARTY | 15 | generator | — |
| 3 | bezpiecznik | — | 16 | rozłącznik | ZAMKNIĘTY |
| 4 | wyłącznik (mocy) | ZAMKNIĘTY | 17 | falownik | — |
| 5 | przekładnik napięciowy | — | 18 | uziemnik | ZAMKNIĘTY |
| 6 | rozłącznik | OTWARTY | 19 | generator PV z falownikiem | — |
| 7 | transformator | — | 20 | rozłącznik bezpiecznikowy | OTWARTY |
| 8 | uziemnik | OTWARTY | 21 | węzeł | — |
| 9 | wyłącznik (mocy) | OTWARTY | 22 | łącznik ogólny | OTWARTY |
| 10 | magazyn z przekształtnikiem | — | 23 | odbiór | — |
| 11 | łącznik ogólny | ZAMKNIĘTY | 24 | zabezpieczenie (I>, I0>) | — |
| 12 | rozłącznik bezpiecznikowy | ZAMKNIĘTY | 25 | wyłącznik instalacyjny | ZAMKNIĘTY |
| 13 | zacisk | — | 26 | wyłącznik instalacyjny | OTWARTY |

Samoocena wykonawcy (NIE werdykt): wyłącznik mocy / wyłącznik instalacyjny / odłącznik /
rozłącznik / rozłącznik bezpiecznikowy / bezpiecznik / CT / VT / transformator / uziemnik
rozróżnialne po kwalifikatorach, wkładce, wyzwalaczach i liczbie zacisków; jedyna świadoma
słabość to poz. 11 (zamknięty łącznik ogólny = kreska), rozstrzygnięta w §5 pkt 4.

## 7. Test mono §23

Tablica mono (`pakiet_mono.png`, `rozpoznanie_mono.png`) używa jednego tuszu; stan wynika z
kąta noża i kreski przerywanej, kwalifikatory z geometrii — żaden fakt nie wymaga koloru.
Renderer nie ma ścieżki „kolor stanu" w symbolu (kolor jest nakładką kanwy: energizacja,
werdykty).

## 8. Odwzorowanie ENM → symbol (wdrożone w R2-3, rozszerzone w R2.1)

| Element ENM | `device_kind` (materialized_params) | `catalog_namespace` | Symbol |
|---|---|---|---|
| SwitchBranch `breaker` | dowolny / brak | `APARAT_NN_MCB` | 02 wyłącznik instalacyjny |
| SwitchBranch `breaker` | dowolny / brak | inna / brak | 01 wyłącznik |
| SwitchBranch `disconnector` | dowolny / brak | dowolna | 03 odłącznik |
| SwitchBranch `switch` | brak / ROZLACZNIK | dowolna | 04 rozłącznik |
| SwitchBranch `switch` | ROZLACZNIK_BEZPIECZNIKOWY | dowolna | 08 rozłącznik bezpiecznikowy |
| SwitchBranch `bus_coupler` | WYLACZNIK / WYLACZNIK_GLOWNY / WYLACZNIK_ODPLYWOWY / REKLOZER | `APARAT_NN_MCB` | 02 (orientacja pozioma) |
| SwitchBranch `bus_coupler` | WYLACZNIK / WYLACZNIK_GLOWNY / WYLACZNIK_ODPLYWOWY / REKLOZER | inna / brak | 01 (pozioma) |
| SwitchBranch `bus_coupler` | ROZLACZNIK | dowolna | 04 (pozioma) |
| SwitchBranch `bus_coupler` | ROZLACZNIK_BEZPIECZNIKOWY | dowolna | 08 (pozioma) |
| SwitchBranch `bus_coupler` | ODLACZNIK | dowolna | 03 (pozioma) |
| SwitchBranch `bus_coupler` | brak / spoza listy | dowolna | 05 łącznik ogólny (pozioma) + NN-AUD-18 INFO |
| FuseBranch | — | — | 07 bezpiecznik |
| Transformer2W | — | — | 09 |
| Measurement CT / VT | — | — | 10 / 11 |
| Generator pv_inverter / bess | — | — | 13 / 14 |
| Generator synchronous / wind_* / fw_* | — | — | 15 |
| Load | — | — | 16 |
| protection_assignment | — | — | 17 (znaki IEC z `function_codes`) |
| bus stopnia ≠ 2 / ≥ 3 | — | — | 18 / 19 |

`device_kind` i `catalog_namespace` wchodzą do kontraktu projekcji jako pola ADDYTYWNE
`devices[].device_kind`, `devices[].catalog_namespace` (3.0.0 → bez zmiany wersji,
`exclude_none`). Jedno źródło prawdy dla symbolu = obiekt urządzenia (pin: test
`symbolRegistry.test.tsx` sprawdza, że `devices[].catalog_namespace` jest lustrem
`branches[]` w każdym scenariuszu). Scenariusze danych: wyłącznik ≤ 125 A = `APARAT_NN_MCB`
(odpływy), > 125 A = `APARAT_NN` + `device_kind` WYLACZNIK_GLOWNY (zasilanie z TR) /
WYLACZNIK_ODPLYWOWY + `i_n_a` (kontrakt SWZ dla tej przestrzeni).

## 9. Pytania do właściciela (bramka zatwierdzenia pakietu)

a. ~~Strona odchylenia noża~~ — **rozstrzygnięte pierwowzorem (R2.1): w górę-lewo.**
b. ~~„×" wyłącznika na końcówce noża czy nieruchomo na styku stałym~~ — **rozstrzygnięte
   pierwowzorem (R2.1): nieruchomo na końcu przewodu styku stałego, w osi.**
c. Zamknięty łącznik ogólny (05) jako kreska w grubości symbolu + tabliczka + NN-AUD-18 —
   akceptowalne, czy właściciel woli wymusić klasę funkcjonalną sprzęgła w modelu
   (walidacja BLOCKER zamiast INFO)?
d. Zabezpieczenie: znaki IEC (I>, I0>) w prostokącie — akceptowalne jako konwencja
   dokumentacji (pierwowzór rysuje tak blok LSI), czy wyłącznie tekst obok?
e. VT z krótkim otwartym wyprowadzeniem wtórnym — zostawić czy zakończyć na uzwojeniu?
   (brak VT w pierwowzorze).
f. ~~Złożenia PV/BESS~~ — **rozstrzygnięte pierwowzorem (R2.1): falownik nad polem DC z
   modułami; ścieżka „PV | INV | aparat | kabel | szyna" — aparat, kabel i szyna są
   odrębnymi elementami ENM, symbol pokrywa źródło+przekształtnik.**
g. (nowe) Elementy pierwowzoru BEZ odpowiednika w ENM — ogranicznik przepięć (SPD), licznik
   energii (Wh), gniazdo 1/N/PE, analizator sieci, symbol sieci zasilającej: czy rozszerzać
   ENM o te elementy (wtedy rejestr dostaje symbole), czy pozostają poza modelem?
h. (nowe) Próg aparatu modułowego 125 A (IEC 60898-1) w scenariuszach danych — w realnych
   projektach przestrzeń katalogu jest wyborem projektanta; próg dotyczy WYŁĄCZNIE fikstur.

## 10. Kadry sceny po migracji (dowód użycia pakietu; werdykt należy do właściciela)

`docs/audit/visual/nn/` — 20 kadrów §47 po migracji renderera na symbole CAD
(skala 2 px/u, hierarchia grubości, MIN_FIELD_WIDTH, etykiety poziome bez łamania),
zregenerowane po R2.1:

| Kadr | Co pokazuje w kontekście pakietu |
|---|---|
| `01_single_tr_lod{0,1,2}_{dark,light}` | wyłącznik główny MOCY („×") z CT i zabezpieczeniem (I>>, I>), odpływy z wyłącznikami instalacyjnymi (wyzwalacze), podrozdzielnica z wkładką, PV+falownik w polu |
| `02_two_tr_qbc_open_*` | sprzęgło = WYŁĄCZNIK (device_kind) poziomo, nóż odchylony W GÓRĘ (OTWARTY) |
| `03_two_tr_qbc_closed_*` | sprzęgło = ROZŁĄCZNIK (device_kind) poziomo, poprzeczka + okrąg pod nią widoczne w stanie ZAMKNIĘTYM |
| `06_conflict_parallel_sources_*` | sprzęgło BEZ klasy → łącznik ogólny (kreska w grubości symbolu) + NN-AUD-18 w panelu audytu |
| `12_der_full_path_*` | wkładka FU, wyłączniki (mocy i instalacyjne), CT na torze, przekaźniki z df/dt +2, generator G~, PV i magazyn jako złożenia z falownikiem u góry |
| `13_loads_via_fields_*` | sześć rodzin aparatów obok siebie: wyłącznik mocy (zasilanie) / wyłącznik instalacyjny / rozłącznik / odłącznik / wkładka / rozłącznik bezpiecznikowy |
| `15_many_feeders_lod2_*` | 12 odpływów z wyłącznikami instalacyjnymi przy MIN_FIELD_WIDTH 96 px, oznaczenia poziome, nazwy ≤ 2 wiersze z „…", kanwa przewijalna |
| `19_mobile_overview_lod0_*` | przegląd na 390 px: próg 40 px na pole, przewijanie zamiast ściskania |
| `20_print_a3` | A3 poziomo, mono: stany z geometrii noża, jeden tusz |

Świadomie zarejestrowane ograniczenia po migracji: (i) zamknięty łącznik ogólny (06) =
kreska między szynami — rozstrzygnięcie §5 pkt 4 i pytanie §9 c; (ii) kolejność
odpływów na szynie = kolejność `ref_id` (FU-04 przed QF-01 w 13) — porządek z modelu, nie
z numeracji; (iii) opisy DER pod symbolem do 6 wierszy na poziomie pełnym (nazwa, moc,
technologia, zdolność) — zawinięte bez łamania słów.

## 11. Plan migracji renderera (R2-3; wykonany w tej samej gałęzi — stan: zrealizowany)

1. Kontrakt: `devices[].device_kind`, `measurements[].{accuracy_class,burden_va,ct_cores,
   ct_arrangement}`, audyt NN-AUD-18; fixtury regenerowane z backendu.
2. `lv-domain/symbolRegistry.ts` → wybór `CadSymbolId` wg §8; mapowanie kodów funkcji na
   znaki IEC; nazwy polskie (WYŁĄCZNIK / ROZŁĄCZNIK / ODŁĄCZNIK / …), QF/QS/FU/CT/VT jako
   identyfikatory.
3. `composeLvDomainScene.ts` → gabaryty z rejestru CAD (`gabarytCad`, `zaciskCad`),
   sprzęgło = realny aparat w orientacji poziomej, MIN_FIELD_WIDTH, bez ściskania.
4. `LvDomainView.tsx` → `CadSymbol` zamiast `SYMBOL_GLYPHS`, hierarchia grubości
   (nieskalowana), typografia bez łamania słów (≤ 2 wiersze + wielokropek, pełna nazwa w
   inspektorze), przewijanie/pan zamiast pomniejszania poniżej skali minimalnej, CT z
   klasą/rdzeniami tekstem obok, opisy PV/BESS.
5. Testy §22/§23/§24 + 20 kadrów + tablica pakietu; pełna regresja; raport R2 z osobną
   samooceną każdej bramki §25.
6. (R2.1) Geometria z pierwowzoru właściciela: rejestr przepisany, symbol 02 dodany,
   `devices[].catalog_namespace` w kontrakcie, odwzorowanie z przestrzenią katalogu,
   scenariusze z progiem MCB, kadry i tablice zregenerowane, testy klasowe pierwowzoru.

## 12. Pierwowzór właściciela — pomiary wektorowe (R2.1)

Źródło: `Schemat nn.pdf` (schemat ideowy zasilania, A2 poziomo, rysunek wektorowy —
geometria odczytana z dumpu ścieżek strony, jednostka pt). Przeniesienie do rejestru
zachowuje PROPORCJE (nóż = 11,5 u), nie wymiary bezwzględne.

| Element pierwowzoru | Pomiar [pt] | Rejestr [u] |
|---|---|---|
| nóż aparatu (-Q1, -F1, -QPV1, B16A) | długość 14,8; przegub u DOŁU na osi; końcówka otwarta przesunięta 7,0 w lewo, na wysokości końca przewodu styku stałego (≈ 28°) | 11,5 u od (8, 17), otwarty −30° |
| krzyżyk wyłącznika mocy (-QPV1 400 A) | 4,4 szerokości, środek na końcu przewodu styku stałego, w osi, nieruchomy | 4 u (±2), środek (8, 7) |
| poprzeczka odłącznika / rozłącznika | 5,7 na końcu przewodu styku stałego (≈ 0,4 długości noża) | 5 u w y = 7 |
| okrąg rozłącznika (-Q1/-Q2 400 A) | ∅ ≈ 3,3 (≈ 0,22 długości noża), zawieszony bezpośrednio pod poprzeczką | r = 1,4 u, środek (8; 8,4) |
| wyłącznik instalacyjny (B10 6 kA, B16A, C16A) | ten sam nóż, BEZ „×"; „hak" bimetalu i strzałka pełna prostopadle do noża po stronie zewnętrznej, w ok. połowie noża, obracane z nożem | `WYZWALACZE_MCB` w grupie przegubu: kreska 1,5 u, hak 1,5×1,5 u, kreska 2 u, strzałka 1,4×1,7 u |
| rozłącznik bezpiecznikowy (-FPV1 160 A gG63A; -Q1/-Q2 z gG200A) | nóż 25,8; końcówka otwarta przesunięta 7,2 w lewo (≈ 16°); prostokąt wkładki na dolnych ≈ 60 % noża; przegub u dołu; poprzeczka + okrąg u góry | nóż 17 u od (8, 20), −20° / −10°, wkładka 4,4×9 u (y 9–18 w układzie noża), poprzeczka + okrąg w y = 4 |
| wkładka topikowa (3× gG2A) | prostokąt na przewodzie, przewód przechodzi na wylot | 5×10 u |
| przekładnik prądowy (-T11…-T13 200/5 A/A) | okrąg na torze, przewód pierwotny niewidoczny wewnątrz okręgu, „P1"/„P2" tekstem przy zaciskach, wyprowadzenie wtórne tekstem | okrąg r = 7 u wypełniony papierem, przewód 0→5 / 19→24 u |
| falownik (-F1/-F2/-F3 SUN2000) | kwadrat, przekątna od lewego dolnego do prawego górnego rogu, „3~" w trójkącie górnym-lewym (strona AC), „=" w dolnym-prawym (DC); moduły PV pod falownikiem | kwadrat 12×12 u, przekątna, „3" (litera 3,6 u) + „~" u góry-lewo, „=" u dołu-prawo; zacisk AC u góry |
| moduł fotowoltaiczny (pole DC) | ramka 45×68; moduł 18×32 z szewronem „V" 17×11 u góry modułu | ramka 14×18 u, przewód 4 u, moduł 5×11 u, szewron 5×4 u |
| bateria (-G1 24 VDC) | ogniwo (płyta długa cienka + krótka gruba) w ramce urządzenia, przewód od góry | ramka 14×18 u, przewód 7 u, płyty 9 u / 5 u (gruba ×2,2), przewód 4 u |
| uziemienie | trzy kreski malejące 11,3 : 8,4 : 5,7 | 12 : 9 : 6 u |
| kropka połączenia | ∅ ≈ 7× grubości kreski | r = 2,2 u |
| blok wyzwalacza LSI przy -QPV1 | prostokąt urządzenia z „I>", „I>>" wewnątrz, połączony z aparatem | 17 `cad.zabezpieczenie` — znaki IEC w prostokącie (konwencja potwierdzona) |

Elementy pierwowzoru BEZ symbolu w rejestrze (brak elementu ENM — zero fabrykacji, pytanie
§9 g): ogranicznik przepięć (SPD, -F… typ 1+2), licznik energii (Wh), gniazdo 1/N/PE,
analizator sieci, symbol sieci zasilającej (kółko-krzyż), zaciski PE/N szyn wyrównawczych.
Decyzja o rozszerzeniu ENM należy do właściciela; do tego czasu warstwa L2 nie rysuje
urządzeń, których model nie ma.
