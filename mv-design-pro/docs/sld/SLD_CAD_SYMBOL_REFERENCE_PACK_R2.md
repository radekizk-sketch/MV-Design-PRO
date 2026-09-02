# SLD nN — CAD SYMBOL REFERENCE PACK (R2) + PRZEGLĄD INŻYNIERSKI

**Kontekst:** odrzucenie B-02 R2 (właściciel, 2026-09-02, ocena 5/10: symbolika 3,5 / język
CAD 3 / czytelność gęsta 4 / polska praktyka SLD 4). Mandat §21/§27: „Najpierw zaprojektuj
i zatwierdź pełny CAD SYMBOL REFERENCE PACK. Dopiero potem migruj renderer."

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
| `pakiet_dark.png` | tablica 18 symboli: obecny → proponowany (ZAMKNIĘTY / OTWARTY / NIEZNANY), motyw ciemny |
| `pakiet_light.png` | jw., motyw jasny techniczny |
| `pakiet_mono.png` | jw., jeden tusz na białym (§23) |
| `rozpoznanie_mono.png` | tablica rozpoznawalności bez etykiet, 24 pozycje (§22) |

Każda komórka „proponowany" pokazuje siatkę co 4 u, obrys gabarytu nominalnego (kreska
przerywana) i kwadraciki zacisków — do przeglądu §16 (kotwice na siatce).

## 2. Źródła i to, czego NIE użyto

- **Użyto:** oficjalny wykaz identyfikatorów IEC 60617 z tytułami (podgląd IEC webstore
  „IEC 60617 — Graphical symbols for diagrams"), z którego pochodzą numery S00xxx w
  rejestrze; konwencje dokumentacji stacji i rozdzielnic (schematy jednokreskowe
  producentów rozdzielnic nN/SN, praktyka PowerFactory w zakresie dyscypliny: symbol z
  danych, stan z geometrii, tabliczka tekstem).
- **Nie użyto:** przypadkowych symboli z internetu, ikon Material/Lucide, piktogramów
  aplikacji, grafik z historycznych arkuszy PN-EN 60617 (wycofane).
- **Nie zadeklarowano** zgodności „PN-EN"/„IEC" bez porównania z bazą IEC 60617 — patrz
  statusy w rejestrze (0 × NORMATIVE_VERIFIED, 16 × ENGINEERING_REVIEWED, 2 × DRAFT).

## 3. Kanon geometrii (skrót; pełny w rejestrze §0)

Jednostka u; aparat 16×24 u, oś toru x = 8; styk stały y = 7; przegub (8, 17); nóż 10 u
obracany wokół przegubu: 0° ZAMKNIĘTY, +30° OTWARTY (końcówka w prawo, przerwa ≈ 5 u),
+15° + kreska przerywana noża = NIEZNANY. Kwalifikatory funkcji IEC: „×" na końcówce noża
(wyłącznik), poprzeczka styku stałego (odłącznik), poprzeczka + okrąg na przegubie
(rozłącznik), wkładka jako nóż (rozłącznik bezpiecznikowy). Kreska nieskalowana z kamerą;
hierarchia BUS 3,0 / PRIMARY 1,6 / symbol 1,4 / SECONDARY 1,0 / HIGHLIGHT 6,0 px.
Zero wypełnienia jako nośnika stanu; zero tekstu w symbolu poza kodem literowym maszyny
(G, „~") i znakami funkcji IEC w prostokącie zabezpieczenia.

## 4. Tablica pakietu — 18 symboli

| Lp | Symbol CAD | OBECNY (odrzucony) | PROPONOWANY | Typ domenowy | IEC | Nazwa polska | Status |
|---|---|---|---|---|---|---|---|
| 01 | `cad.wylacznik` | prostokąt z dźwignią, wypełnienie = zamknięty | styk + nóż + „×" na końcówce noża | branch.breaker; bus_coupler+device_kind WYLACZNIK_* | S00287 (S00227+S00219) | WYŁĄCZNIK | ENGINEERING_REVIEWED |
| 02 | `cad.odlacznik` | nóż 45°, poprzeczka przy przegubie | poprzeczka styku stałego + nóż | branch.disconnector; bus_coupler+ODLACZNIK | S00288 (S00227+S00220) | ODŁĄCZNIK | ENGINEERING_REVIEWED |
| 03 | `cad.rozlacznik` | nóż + poprzeczka na końcu noża | poprzeczka + okrąg na przegubie + nóż | branch.switch; bus_coupler+ROZLACZNIK | S00290 (S00227+S00220+S00221) | ROZŁĄCZNIK | ENGINEERING_REVIEWED |
| 04 | `cad.lacznik` | pusty/pełny prostokąt „QBC" | styk + nóż bez kwalifikatora | bus_coupler bez device_kind (+NN-AUD-18) | S00227 | ŁĄCZNIK (szyn, funkcja nieokreślona) | ENGINEERING_REVIEWED |
| 05 | `cad.uziemnik` | nóż + uziemienie (biblioteka SN) | przegub na przewodzie, nóż na poprzeczkę, uziemienie | brak elementu ENM w nN | S00288 + S00200 | UZIEMNIK | DRAFT |
| 06 | `cad.bezpiecznik` | sześciokąt kasety | prostokąt z przewodem na wylot | branch.fuse | S00362 | BEZPIECZNIK | ENGINEERING_REVIEWED |
| 07 | `cad.rozlacznikBezpiecznikowy` | ten sam sześciokąt co 06 | wkładka jako nóż + poprzeczka + okrąg | branch.switch+ROZLACZNIK_BEZPIECZNIKOWY | S00370 | ROZŁĄCZNIK BEZPIECZNIKOWY | ENGINEERING_REVIEWED |
| 08 | `cad.transformator2u` | dwa okręgi 32×40 | dwa okręgi 16×28, hv/lv | transformer | S00841 | TRANSFORMATOR | ENGINEERING_REVIEWED |
| 09 | `cad.przekladnikPradowy` | okrąg na przewodzie | okrąg na torze pierwotnym | measurement CT | S00850 | PRZEKŁADNIK PRĄDOWY | ENGINEERING_REVIEWED |
| 10 | `cad.przekladnikNapieciowy` | dwa okręgi bez wyprowadzenia | odgałęzienie, dwa uzwojenia, wtórne otwarte | measurement VT | S00878 | PRZEKŁADNIK NAPIĘCIOWY | ENGINEERING_REVIEWED |
| 11 | `cad.przeksztaltnik` | brak (ukryty w ikonie PV) | kwadrat z przekątną, „=" / „~" | ogniwo złożeń 12/13 | S00896 (S00213) | FALOWNIK | ENGINEERING_REVIEWED |
| 12 | `cad.zrodloPvZPrzeksztaltnikiem` | ikona w ramce 32×32 | ogniwo PV ze strzałkami + falownik | generator pv_inverter | S00908 + S00896 | GENERATOR PV Z FALOWNIKIEM | ENGINEERING_REVIEWED |
| 13 | `cad.magazynZPrzeksztaltnikiem` | ikona baterii w ramce | płyty ogniwa + przekształtnik | generator bess | S01342 + S00897 | MAGAZYN ENERGII Z PRZEKSZTAŁTNIKIEM | ENGINEERING_REVIEWED |
| 14 | `cad.generator` | okrąg z G 32×32 | maszyna G~ 16×24 | generator synchronous/wind/fw_* | S00819 | GENERATOR | ENGINEERING_REVIEWED |
| 15 | `cad.odplywOdbior` | strzałka | strzałka przepływu od szyn | load | S00104 | ODBIÓR | ENGINEERING_REVIEWED |
| 16 | `cad.zabezpieczenie` | okrąg z kodami wewnątrz (plakietka) | prostokąt urządzenia + znaki IEC (I>, I0>) | protection_assignment | konwencja | ZABEZPIECZENIE | DRAFT |
| 17 | `cad.zacisk` | kropka pełna z widoku | okrąg pusty | bus stopnia ≠ 2 / granica | S00017 | ZACISK | ENGINEERING_REVIEWED |
| 18 | `cad.wezel` | kropka pełna | kropka pełna | bus stopnia ≥ 3 | S00020/S00021 | WĘZEŁ | ENGINEERING_REVIEWED |

## 5. Przegląd wielosoczewkowy (dyrektywa właściciela nr 5)

Soczewki: projektant sieci (A), zwarciowiec (B), zabezpieczeniowiec (C), rozdzielnie/
aparatura (D), katalogi/ENM (E), CAD/dokumentacja (F), UX/IA (G). Zapis: ustalenie →
decyzja. Wszystkie decyzje wdrożone w rejestrze przed renderem kadrów w §1.

1. **(D, F) Krzyżyk funkcji wyłącznika** — pierwsza wersja rysowała „×" na styku stałym
   (nieruchomo). W konwencji IEC kwalifikator należy do styku ruchomego → **„×" na
   końcówce noża, obraca się z nożem**; w stanie zamkniętym leży na styku stałym, więc
   odczyt „× na torze" pozostaje.
2. **(D) Strona odchylenia noża** — IEC dopuszcza lustro/obrót; przyjęto końcówkę W PRAWO
   (+30°) jednolicie dla całej rodziny (także uziemnik, z przegubem u góry). Otwarte
   pytanie do właściciela (§9 pkt a).
3. **(D) Poprzeczka odłącznika** — poprzednia biblioteka kładła poprzeczkę przy przegubie
   (zła strona); w IEC to znak STYKU STAŁEGO → poprawione. Rozłącznik dostaje dodatkowo
   okrąg na przegubie (zdolność łączenia prądu obciążenia); położenie okręgu do
   potwierdzenia w bazie IEC (status pozostaje ENGINEERING_REVIEWED).
4. **(A, E, G) Zamknięty łącznik ogólny (04)** — w IEC zamknięty styk bez kwalifikatora jest
   kreską. Zamiast dorysowywać funkcję, której model nie zna: (i) identyfikację daje
   HIERARCHIA GRUBOŚCI (kreska symbolu 1,4 px między szynami 3,0 px) + tabliczka
   „QBC · ZAMKNIĘTY", (ii) audyt NN-AUD-18 (INFO) nazywa brak klasy funkcjonalnej,
   (iii) z `device_kind` sprzęgło dostaje symbol REALNEGO aparatu (01/02/03/07).
   Scenariusze danych zostają zróżnicowane, żeby wszystkie trzy ścieżki były na kadrach
   (reguła KLASA, nie instancja).
5. **(C) Zabezpieczenie (16)** — pusty prostokąt nie jest rozpoznawalny bez etykiety, a
   plakietka z numerami ANSI była odrzucona. Polska/europejska praktyka: prostokąt
   urządzenia ze ZNAKAMI wielkości charakterystycznej IEC (I>, I>>, I0>, U<, f<, df/dt,
   Δφ) → wdrożone: znaki z danych przypisania nanosi renderer (`wnetrze`), numery ANSI w
   panelu odpływu. Status DRAFT (brak identyfikatora IEC w wykazie podglądowym).
6. **(B, C) Przekładniki** — CT = okrąg NA torze (dwa zaciski), VT = odgałęzienie z dwoma
   uzwojeniami i otwartym wyprowadzeniem wtórnym (jeden zacisk). Różnica rozmiaru i
   liczby zacisków odróżnia VT od transformatora mocy. Przekładnia/klasa/rdzenie/moc
   pomiarowa — tekstem obok (kontrakt projekcji dostaje `accuracy_class`, `burden_va`,
   `ct_cores`, `ct_arrangement` — migracja R2-3).
7. **(A, E) PV / BESS** — ENM modeluje PV+falownik i magazyn+przekształtnik jako JEDEN
   element `generator`; symbol jest złożeniem obu ogniw (źródło DC nad przekształtnikiem),
   nie dorysowuje osobnego urządzenia. Tor za symbolem (aparat, kabel, punkt przyłączenia,
   CT, LoM) pochodzi z realnych elementów ENM (scenariusz 12).
8. **(A) Odbiór** — Load ENM nie ma typu odbiornika; strzałka przepływu od szyn jest
   uczciwym nośnikiem (R2 §12). Jawne odbiorniki pojawią się w rejestrze razem z typem w
   ENM — nie wcześniej.
9. **(F) Tekst w symbolach** — dozwolone WYŁĄCZNIE: kod literowy maszyny „G" + „~"
   (część symbolu IEC) i znaki funkcji IEC w prostokącie zabezpieczenia. Żadnych
   numerów, nazw, jednostek wewnątrz symboli; tabliczki tekstem obok, w hierarchii
   typograficznej sceny.
10. **(F) Stan NIEZNANY** — kąt pośredni +15° i kreska przerywana TYLKO noża (kwalifikatory
    ciągłe) — bez znaku „?" w symbolu; słowo „STAN NIEZNANY" niesie tabliczka.
11. **(G) Symbol CAD vs piktogram** — w harnessie i kanwie L2 renderuje wyłącznie
    `CadSymbol`; piktogramy kreatorów/inspektora nie mają dostępu do warstwy L2 (guard w
    testach rejestru: brak `<image>`, `<foreignObject>`, ikon czcionek).
12. **(B) Zwarciowiec** — symbol nie koduje parametrów zwarciowych; Ik″, ip, Ith i
    wytrzymałość aparatu są nakładką wynikową z solvera (pochodzenie: `result_snapshot`),
    nie geometrią. Bez zmian względem kontraktu 3.0.0.

## 6. Test rozpoznawalności §22 — klucz odpowiedzi (`rozpoznanie_mono.png`)

| Poz. | Symbol | Stan | Poz. | Symbol | Stan |
|---|---|---|---|---|---|
| 1 | przekładnik prądowy | — | 13 | zacisk | — |
| 2 | odłącznik | OTWARTY | 14 | odłącznik | ZAMKNIĘTY |
| 3 | bezpiecznik | — | 15 | generator | — |
| 4 | wyłącznik | ZAMKNIĘTY | 16 | rozłącznik | ZAMKNIĘTY |
| 5 | przekładnik napięciowy | — | 17 | falownik | — |
| 6 | rozłącznik | OTWARTY | 18 | uziemnik | ZAMKNIĘTY |
| 7 | transformator | — | 19 | generator PV z falownikiem | — |
| 8 | uziemnik | OTWARTY | 20 | rozłącznik bezpiecznikowy | OTWARTY |
| 9 | wyłącznik | OTWARTY | 21 | węzeł | — |
| 10 | magazyn z przekształtnikiem | — | 22 | łącznik ogólny | OTWARTY |
| 11 | łącznik ogólny | ZAMKNIĘTY | 23 | odbiór | — |
| 12 | rozłącznik bezpiecznikowy | ZAMKNIĘTY | 24 | zabezpieczenie (I>, I0>) | — |

Samoocena wykonawcy (NIE werdykt): wyłącznik / odłącznik / rozłącznik / bezpiecznik / CT /
VT / transformator / uziemnik rozróżnialne po kwalifikatorach i liczbie zacisków; jedyna
świadoma słabość to poz. 11 (zamknięty łącznik ogólny = kreska), rozstrzygnięta w §5 pkt 4.

## 7. Test mono §23

Tablica mono (`pakiet_mono.png`, `rozpoznanie_mono.png`) używa jednego tuszu; stan wynika z
kąta noża i kreski przerywanej, kwalifikatory z geometrii — żaden fakt nie wymaga koloru.
Renderer nie ma ścieżki „kolor stanu" w symbolu (kolor jest nakładką kanwy: energizacja,
werdykty).

## 8. Odwzorowanie ENM → symbol (decyzja wdrażana w R2-3)

| Element ENM | `device_kind` (materialized_params) | Symbol |
|---|---|---|
| SwitchBranch `breaker` | dowolny / brak | 01 wyłącznik |
| SwitchBranch `disconnector` | dowolny / brak | 02 odłącznik |
| SwitchBranch `switch` | brak / ROZLACZNIK | 03 rozłącznik |
| SwitchBranch `switch` | ROZLACZNIK_BEZPIECZNIKOWY | 07 rozłącznik bezpiecznikowy |
| SwitchBranch `bus_coupler` | WYLACZNIK / WYLACZNIK_GLOWNY / WYLACZNIK_ODPLYWOWY | 01 wyłącznik (orientacja pozioma) |
| SwitchBranch `bus_coupler` | ROZLACZNIK | 03 rozłącznik (pozioma) |
| SwitchBranch `bus_coupler` | ROZLACZNIK_BEZPIECZNIKOWY | 07 (pozioma) |
| SwitchBranch `bus_coupler` | ODLACZNIK | 02 odłącznik (pozioma) |
| SwitchBranch `bus_coupler` | brak | 04 łącznik ogólny (pozioma) + NN-AUD-18 INFO |
| FuseBranch | — | 06 bezpiecznik |
| Transformer2W | — | 08 |
| Measurement CT / VT | — | 09 / 10 |
| Generator pv_inverter / bess | — | 12 / 13 |
| Generator synchronous / wind_* / fw_* | — | 14 |
| Load | — | 15 |
| protection_assignment | — | 16 (znaki IEC z `function_codes`) |
| bus stopnia ≠ 2 / ≥ 3 | — | 17 / 18 |

`device_kind` wchodzi do kontraktu projekcji jako pole ADDYTYWNE `devices[].device_kind`
(3.0.0 → bez zmiany wersji, `exclude_none`).

## 9. Pytania do właściciela (bramka zatwierdzenia pakietu)

a. Strona odchylenia noża: w prawo (przyjęte) czy w lewo?
b. „×" wyłącznika na końcówce noża (przyjęte, IEC) czy nieruchomo na styku stałym?
c. Zamknięty łącznik ogólny (04) jako kreska w grubości symbolu + tabliczka + NN-AUD-18 —
   akceptowalne, czy właściciel woli wymusić klasę funkcjonalną sprzęgła w modelu
   (walidacja BLOCKER zamiast INFO)?
d. Zabezpieczenie: znaki IEC (I>, I0>) w prostokącie — akceptowalne jako konwencja
   dokumentacji, czy wyłącznie tekst obok?
e. VT z krótkim otwartym wyprowadzeniem wtórnym — zostawić czy zakończyć na uzwojeniu?
f. Czy złożenia PV/BESS (jeden element ENM = dwa ogniwa symbolu) są zgodne z oczekiwaną
   ścieżką „PV SOURCE | INV | QF/FU/QS | KABEL | BUS"? (aparat, kabel i szyna są odrębnymi
   elementami ENM — symbol pokrywa tylko źródło+przekształtnik).

## 10. Kadry sceny po migracji (dowód użycia pakietu; werdykt należy do właściciela)

`docs/audit/visual/nn/` — 20 kadrów §47 po migracji renderera na symbole CAD
(skala 2 px/u, hierarchia grubości, MIN_FIELD_WIDTH, etykiety poziome bez łamania):

| Kadr | Co pokazuje w kontekście pakietu |
|---|---|
| `01_single_tr_lod{0,1,2}_{dark,light}` | wyłącznik główny z CT i zabezpieczeniem (I>>, I>), trzy odpływy, podrozdzielnica z wkładką, PV+falownik w polu |
| `02_two_tr_qbc_open_*` | sprzęgło = WYŁĄCZNIK (device_kind) poziomo, nóż odchylony (OTWARTY) |
| `03_two_tr_qbc_closed_*` | sprzęgło = ROZŁĄCZNIK (device_kind) poziomo, poprzeczka + okrąg widoczne w stanie ZAMKNIĘTYM |
| `06_conflict_parallel_sources_*` | sprzęgło BEZ klasy → łącznik ogólny (kreska w grubości symbolu) + NN-AUD-18 w panelu audytu |
| `12_der_full_path_*` | wkładka FU, wyłączniki ×, CT na torze, przekaźniki z df/dt +2, generator G~, PV i magazyn jako złożenia |
| `13_loads_via_fields_*` | pięć rodzin aparatów obok siebie: wyłącznik / rozłącznik / odłącznik / wkładka / rozłącznik bezpiecznikowy |
| `15_many_feeders_lod2_*` | 12 odpływów przy MIN_FIELD_WIDTH 96 px, oznaczenia poziome, nazwy ≤ 2 wiersze z „…", kanwa przewijalna |
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
