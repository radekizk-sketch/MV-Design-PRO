# MV-DESIGN-PRO — PRODUCT CAPABILITY CONSTITUTION (konstytucja produktu i koperta zdolności MAX)

**Status:** KANONICZNY — konstytucja produktu (prompt właściciela „FINAL PRODUCT CONSTITUTION, MAX-CAPABILITY ARCHITECTURE & CONVERGENCE AUDIT", 2026-09-04, §1–§4, §10–§27, §39). Zastępuje `PRODUCT_CAPABILITY_MODEL.md` (treść skonsolidowana tutaj i w `CAPABILITY_ARCHITECTURE_MATRIX.md`).
**Zestaw kanoniczny (jedyny):** `PRODUCT_CAPABILITY_CONSTITUTION.md` (ten dokument) · `CAPABILITY_ARCHITECTURE_MATRIX.md` (macierz §25) · `CANONICAL_TWIN_ARCHITECTURE.md` (twin, lifecycle, granica obliczeniowa) · `CONVERGENCE_ROADMAP.md` (kolejność migracji + stan i kontynuacja) · `DECISION_FREEZE_REGISTER.md` (decyzje, dowody, odrzucone alternatywy, warunki ponownego otwarcia) · `../reference-networks/REFERENCE_NETWORK_REGISTRY.md` · `../evidence/CONVERGENCE_EVIDENCE.md`. Dokumenty `../twin/*.md` (FAZA A–F) są materiałem wejściowym i dowodowym.
**Czego ten dokument NIE robi:** nie jest backlogiem. Zdolność wymieniona tu jest wymaganiem, którego fundament nie może zablokować — nie obietnicą wdrożenia w bieżącym wycinku (§27: szeroka koperta architektoniczna + wąskie, kompletne wycinki pionowe).

---

## 1. Misja i zasada MAX (§1–§2 konstytucji)

MV-DESIGN-PRO ma być **jednym kompletnym środowiskiem pracy inżyniera elektroenergetyka** obejmującym pełny cykl życia sieci: koncepcja → projektowanie i przyłączenie → modelowanie → analizy → zabezpieczenia i automatyka → OZE/BESS → optymalizacja → dokumentacja → eksploatacja → Digital Twin (§1). Nie jest kalkulatorem SN, kalkulatorem zwarć, edytorem SLD, systemem zabezpieczeń ani zbiorem ekranów.

**Test każdej decyzji fundamentalnej (§2):** „Czy ta granica architektoniczna pozostanie poprawna, gdy MV-DESIGN-PRO obejmie pełną dziedzinę elektroenergetyczną?" Odpowiedź „nie wiadomo" = decyzja niegotowa. Decyzja obsługująca tylko bieżący sprint, a wymuszająca późniejszą przebudowę modelu = odrzucona. Formalny test to `FUTURE_CAPABILITY_REVIEW.md`.

**Status zdolności (jedna skala, spójna z rejestrami zdolności solverów i zabezpieczeń):** `SUPPORTED` — pełna ścieżka użytkownika z testem i wyrocznią; `PARTIAL` — działa w jawnie nazwanym podzbiorze; `PLANNED` — zaprojektowane, twin nie blokuje, nieimplementowane; `NOT_IMPLEMENTED` — brak; `FABRICATED` — istnieje ekran/pole bez fizyki lub z fikcyjnymi danymi (stan do usunięcia natychmiast). Status pochodzi z pomiaru (audyty A1–A12, `docs/twin/MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md`), nie z deklaracji.

---


### 1.1 Trzy poziomy zobowiązania (§2 konstytucji) — obowiązkowe rozróżnienie

Każda zdolność w macierzy (`CAPABILITY_ARCHITECTURE_MATRIX.md`) ma dokładnie jeden poziom:

| Poziom | Znaczenie | Dowód |
|---|---|---|
| **ARCHITEKTURA WSPIERA TERAZ** | model informacji, granice i lifecycle muszą tę zdolność pomieścić bez przebudowy fundamentu; kod może nie istnieć | wpis w macierzy z werdyktem future-proof i pozycja w `DECISION_FREEZE_REGISTER.md` |
| **WDRAŻAMY TERAZ** | w aktywnym programie (wycinki CV-0…CV-6, G01) | wpis w `CONVERGENCE_ROADMAP.md` + dowód w `../evidence/CONVERGENCE_EVIDENCE.md` |
| **PRZYSZŁE ROZSZERZENIE** | poza aktywnym programem; architektura ma dowód, że nie blokuje | test „jaka zdolność zmusiłaby do złamania granicy?" w rejestrze decyzji |

Future-proof ≠ spekulatywne przeinżynierowanie: abstrakcję tworzy się tylko dla zidentyfikowanej zdolności inżynierskiej albo bezpośredniej potrzeby migracji; zakaz setek nieużywanych interfejsów i spekulatywnej fizyki (§27).

---

## 2. Taksonomia zdolności (koperta MAX — podłoga, nie sufit; §3, §10–§24 konstytucji)

| Rodzina | Zakres (minimum) | Poziom dziś |
|---|---|---|
| **A. Modelowanie sieci i assetów** | sieci zasilające/źródła zastępcze, GPZ/stacje, szyny SN i nN, sekcje, sprzęgła, odpływy, gałęzie, punkty łączeniowe, punkt przyłączenia (`GridConnectionPoint`), rozdzielnie SN, stacje SN/nN, rozdzielnice nN, sieci promieniowe, pierścienie, układy oczkowe, punkty NOP, wyspy, wiele zasilań, zasilanie awaryjne, mikrosieci | WSPIERA TERAZ (ENM); wyspy SN, oczka: WSPIERA TERAZ |
| **B. Urządzenia przewodzące** | kable SN/nN, linie napowietrzne, szyny, przewody fazowe, N, PEN, PE, ekrany/powłoki, tory powrotne ziemne (jawnie modelowane) | fazy, N/PEN/PE, ekrany: WSPIERA TERAZ (F-1, F-2); wdrożenie CV-5 |
| **C. Transformatory** | dwuuzwojeniowe, wielouzwojeniowe (przyszłość), grupy połączeń, przełączniki zaczepów, dostępność punktu neutralnego, uziemienie, zachowanie w składowej zerowej | WSPIERA TERAZ (T-2 lista terminali dla 3-uzw.); F-3/F-4 CV-5 |
| **D. Aparatura łączeniowa** | wyłączniki, odłączniki, rozłączniki, uziemniki, bezpieczniki, styczniki | uziemnik = `SwitchBranch.kind=EARTHING_SWITCH` + stan `EARTHED` (T-3) |
| **E. Odbiory i generacja** | odbiory, silniki, popyt zagregowany, PV, wiatr, generacja synchroniczna/asynchroniczna, BESS, ładowanie EV, hybrydy, DER sterowalne | dekompozycja DER, encja silnika, stan BESS: WSPIERA TERAZ; wdrożenie od G01 |
| **F. Pomiary i zabezpieczenia** | CT, VT, IED/przekaźnik, bezpiecznik, funkcje/stopnie, cele wyzwalania, kanały pomiarowe | `Measurement`, `ProtectionAssignment`, `Bay*` istnieją; ownership: WDRAŻAMY (po CV-5) |
| **G. Uziemienie** | sztywne, izolowane, rezystorowe, cewka Petersena/rezonansowe, rezystor/dławik w punkcie neutralnym, uziomy lokalne, układy punktu neutralnego TR | `NeutralGrounding`, `EarthingSystem` jako encje (F-2, F-3): WDRAŻAMY (CV-5, G01) |
| **H. Tożsamość** | stabilny identyfikator każdego obiektu inżynierskiego wymagającego trwałości | `ref_id` (T-4); jedna przestrzeń w IR: CV-4 |
| **I. Model fazowy i łączność** | A/B/C/N/PEN/PE, terminale fazowe, ciągłość faz, układy niesymetryczne, relacje fazowe TR, ekrany/tory ziemne; jedna prawda fizyczna dla domeny składowych SN i jawnej domeny ABCN nN | F-1, T-2: WDRAŻAMY (CV-5) |
| **J. Digital Twin i lifecycle** | rewizje, warianty strukturalne, scenariusze pracy, rewizje nastaw, wiązania katalogowe, założenia, proweniencja, historia konfiguracji; `StudyCase` odwołuje się do rewizji, nie posiada kopii sieci | WDRAŻAMY (CV-1…CV-3) |
| **K. Analizy** | rozpływ (BFS, NR, symetryczny/niesymetryczny, PQ/PV, regulacja U, zaczepy, shunty, DER Q(U)/cosφ(P)/P(f), limity, diagnostyka zbieżności); zwarcia IEC 60909 (3F/2F/1F-Z/2F-Z, max/min, I_k'', i_p, I_th, sieci składowych, udziały TR/generatorów/DER); zwarcia doziemne jako dyscyplina pierwszej klasy (izolowany, rezonansowy, cewka Petersena, R/X w punkcie neutralnym, sieć zerowa, pojemność doziemna, I_C, I_res, U0, rozdział prądu, R_f, lokalizacja, czułość, 67N); nN (ABCN, prąd N, ciągłość PEN/N, ΔU, Ik min/max, SWZ, obciążalność, asymetria, wkład DER); cieplne (I_z, ograniczenia, wytrzymałość krótkotrwała, I²t, korekty warunków); przyszłe: harmoniczne, PQ, rozruch silników, arc flash, dynamika, stabilność, częstotliwość, probabilistyka, hosting capacity, szeregi czasowe, estymacja stanu, niezawodność, kontyngencje, wrażliwość | LF/SC: WDRAŻAMY (G01); doziemne/nN: WDRAŻAMY (G01/CV-5); przyszłe: WSPIERA TERAZ |
| **L. Zabezpieczenia i automatyka** | IED, bezpieczniki, grupy nastaw, przypisania CT/VT, źródła pomiaru, cele wyzwalania, powiązania z wyłącznikami, wielkości kierunkowe, SPZ, logika, strefy; funkcje 50/51/50N/51N/67/67N/27/59/81/81R/78/21/21N/różnicowe/TR/szyn/generatora-DER/synchrocheck/SPZ/koordynacja bezpieczników; analizy TCC, stopniowanie, selektywność, czułość, rezerwa, koordynacja, ocena zależna od zwarcia; jedno ownership nastaw i lineage rewizji | `ProtectionCapabilityRegistry` (statusy jawne): WDRAŻAMY; silnik konsumuje projekcję, nie posiada prawdy |
| **M. DER / OZE / BESS / przyłączenie** | PV, wiatr, BESS, hybrydy, generatory, EV, `GridConnectionPoint`, sterowania wg kodeksu (P/Q, Q(U), cosφ(P), P(f), regulacja U/Q, LVRT/HVRT, ROCOF, vector shift, grid-following, grid-forming), limity import/eksport, hierarchia kontrolera elektrowni; NC RfG, profile OSD (IRiESD), macierze zgodności, dowody; zakaz zaszycia jednej konwencji OSD jako prawdy uniwersalnej | profile konfigurowalne z rejestru źródeł: WSPIERA TERAZ; G01 PV: WDRAŻAMY |
| **N. Projektowanie** | dobór kabli, przewodów, TR, wyłączników/rozłączników/bezpieczników, CT, VT, szyn; konfiguracja stacji/pola; projekt odpływów SN/nN; dobór i rekomendacja nastaw; limity ΔU, cieplne, wytrzymałość zwarciowa, SWZ, kompensacja, wzmocnienia, projekt punktu przyłączenia, rozbudowa, warianty, ograniczenia, DRC; każda rekomendacja audytowalna, bez ukrytych założeń | `ConstraintEngine`, `SizingRequest/Result`: WSPIERA TERAZ; wdrożenie po G01 |
| **O. Optymalizacja** | wielokryterialna: zgodność, CAPEX, OPEX, straty, jakość napięcia, N-1, niezawodność, rezerwa, wykorzystanie, standaryzacja, dostępność, utrzymanie, elastyczność rozbudowy, hosting; profile polityk i front Pareto; „najmniejsze zgodne + rezerwa" = tylko polityka domyślna | WSPIERA TERAZ; PRZYSZŁE ROZSZERZENIE |
| **P. Jakość energii / JEN** | EN 50160, IEC 61000, odchylenia U, flicker, asymetria, harmoniczne, THD, alokacja źródeł, poziomy kompatybilności/planowania, import pomiarów; statusy IMPLEMENTED/VALIDATED/PARTIAL/PLANNED/NOT SUPPORTED — bez fizyki „na pokaz" | WSPIERA TERAZ (IR(f) jako widok assemblera, widma z proweniencją); PRZYSZŁE |
| **Q. SLD / CAD / SCADA / GIS** | jeden asset w wielu reprezentacjach: SLD SN, SLD nN, widok wnętrza stacji, widok zabezpieczeń, widok geograficzny, nakładki wyników, widok operacyjny; backend = semantyka elektryczna, łączność, topologia, zasilenie, pasma U, wiązanie wyników, tożsamość rewizji; frontend = geometria deterministyczna, symbole, trasowanie, kolizje, rozmieszczenie, interakcja, stan prezentacji; IEC 60617, konfigurowalne oznaczenia, hierarchia CAD, pełne tory prądowe, zakończenia kabli, semantyka pola, czytelność gęstych sieci, zero rozjazdu diagram↔model; zachować projekcję nN 3.0.0; nie scalać nN z SN dla przestarzałych testów | WDRAŻAMY (SLD jako projekcja TV) |
| **R. GIS / import / interoperacyjność** | CSV, arkusze, GIS, współrzędne, topology healing, dopasowanie assetów, mapowanie katalogów, edycja masowa, walidacja, migracja, diagnostyka importu, eksport; CIM/formaty wymiany jako granica zewnętrzna, nie model wewnętrzny | import jako komendy domenowe (D-45): WDRAŻAMY (CV-4) |
| **S. Katalogi i dane inżynierskie** | producenci, rodziny, rewizje, dokumenty źródłowe, parametry zweryfikowane, zakresy stosowalności, jednostki, niepewność/założenia, archiwum wersji, nadpisania projektowe z uzasadnieniem; zero magicznych liczb, zero fabrykacji, jawne braki | proweniencja K-E/K-O/K-Q istnieje; fikcyjne nazwy producentów usuwane (FAB-A); rewizja katalogu w envelope: CV-2 |
| **T. Eksploatacja i łączenia** | stan łącznika, wyłączenia, in_service, łączenia planowane, izolacja, odbudowa, topologia operacyjna, sekwencje, blokady, praca bezpieczna — „bezpieczne do pracy" wyłącznie z pełnego dowodu elektrycznego i proceduralnego | WSPIERA TERAZ (stany, sekwencja = lista scenariuszy stanów); PRZYSZŁE |
| **U. Dokumentacja i dowody** | raporty obliczeniowe/projektowe, zestawienia techniczne, karty nastaw, raporty TCC, macierze zgodności, zestawienia kabli/urządzeń, eksporty SLD, raporty rewizji i porównań, założenia, załącznik proweniencji — z tego samego envelope | WDRAŻAMY (G01 REPORT) |
| **V. White Box / forensic** | INPUT → SOURCE → ASSUMPTIONS → REVISION ENVELOPE → TOPOLOGY → COMPUTATIONAL INPUT → INTERMEDIATE → EQUATIONS → RESULT → LIMITS → PASS/WARN/FAIL → PROVENANCE; zielona wartość w UI bez dowodu nie wystarcza; testy nie są dowodem fizyki | inwariant produktu; WDRAŻAMY (`trace_v2` wpięcie, wyrocznie rejestru) |
| **W. Normy i reguły** | fizyka ≠ norma ≠ polityka OSD/firmy ≠ założenie projektu; IEC/EN/PN-EN, NC RfG, profile OSD, zestawy reguł, kryteria projektu — bez rozproszonych literałów progów | rejestr źródeł normatywnych (klasy STANDARD/OSD_POLICY/MANUFACTURER/CATALOG/USER_ASSUMPTION/MEASUREMENT): WSPIERA TERAZ |
| **X. Inteligencja inżynierska** | sprawdzenia automatyczne, anomalie, DRC, diagnostyka topologii, rekomendacje doboru, alternatywy, ryzyka, asysta normowa, szkice raportów, orkiestracja workflow — podporządkowane deterministycznym dowodom; AI nigdy nie jest autorytetem inżynierskim | `VariantBranch(PROPOSED)`, komendy domenowe jako jedyny język zmian: WSPIERA TERAZ |
| **Y. Workflow produktu** | NOWE PRZYŁĄCZENIE, ANALIZA SIECI ISTNIEJĄCEJ, PROJEKT STACJI — kompletne łańcuchy bez podwójnych prawd między modułami | `../twin/MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md` (W1–W14) — materiał; G01 = pierwszy pełny łańcuch |

---

## 3. Koperta zdolności — stan dziś (pomiar) vs wymaganie architektoniczne

### 3.1 Inżynieria sieci (§3)
| Zdolność | Dziś (pomiar) | Wymaganie twin |
|---|---|---|
| Sieci SN promieniowe / pierścieniowe / wieloźródłowe | `SUPPORTED` (ENM: `Bus`, `Cable`, `OverheadLine`, `SwitchBranch`, `Transformer`, `Source`; ring z NOP w GN_03) | topologia wyprowadzana z łączności (§11); punkt podziału = stan łącznika |
| Sieci nN, obwody odbiorcze, rozdzielnice nN | `PARTIAL` (projekcja nN 3.0.0, `NnSection`, `Bay`; brak N/PEN, faz — A11-03/04) | model fazowy ABCN + PEN/PE (§7) |
| Struktury stacyjne: GPZ, rozdzielnica, pole, sekcja, sprzęgło | `PARTIAL` (`Substation`, `GPZSection`, `Bay` typowany istnieje; aktywna prawda o polach w `meta.field_specs` — A1-02) | typowane `Bay` → aparat → terminale → łączność (§19); kasacja `meta.field_specs` procedurą |
| Punkt przyłączenia (obiekt umowny), ZK SN | `PARTIAL` (12 rozproszonych ról — A5-06; `ConnectionConditions` w ENM) | `GridConnectionPoint` jako obiekt umowny wskazujący terminal (ADR-027) |
| Kable, linie napowietrzne, transformatory, odbiory, źródła | `SUPPORTED` (katalogowo) | tożsamość assetu + rewizja katalogu + proweniencja parametru (§20) |
| PV, wiatr, BESS, generatory, EV, mikrosieci | `PARTIAL` (`Generator` zlepia źródło+falownik+sterowanie — A5-01; BESS bez stanu — A5-04; EV `NOT_IMPLEMENTED`) | dekompozycja: jednostka pierwotna / przekształtnik / sterowanie / transformator blokowy; EV jako odbiór sterowalny z profilem |
| Wyspy, praca wyspowa | `PARTIAL` (silnik wysp tylko nN — A5-05) | `Island` wyprowadzana dla SN i nN, odniesienie grid-forming, bilans (§13 LF) |
| Wyższe poziomy napięć / nowe technologie | brak sztucznej blokady (poziom napięcia = liczba) | poziom napięcia jako encja `VoltageLevel` bez zamknięcia listy (A1-05) |

### 3.2 Platforma analiz (§13)
| Rodzina | Dziś | Wymaganie twin |
|---|---|---|
| Rozpływ mocy NR/GS/FD, PQ, zaczepy, OLTC | `SUPPORTED` (P1 kanoniczny) — ale szyny PV nigdy nie budowane (A3-04), wiele slacków (A3-05) | PV/PQ/slack z modelu, regulacja U, limity Q, DER Q(U)/cosφ(P)/P(f), tryby BESS, wyspy, status zbieżności, jakość wyniku |
| Zwarcia IEC 60909: 3F, 2F, 1F, 2F-Z, max/min, I_k'', i_p, I_th, Z0 | `SUPPORTED` (S1 kanoniczny, 4 typy, Z0) | udziały źródeł i DER, impedancja przejścia, sieci składowych jako ślad White Box |
| Zwarcia doziemne SN: izolowany, kompensowany (Petersen), rezystor, prąd pojemnościowy, U0, I0, stopień kompensacji, 67N/Y0> | `PARTIAL`/`FABRICATED` (detekcja w `v126_academic`; `GroundingConfig` w ENM jest fantomem dla fizyki — A11-02; 6 reprezentacji uziemienia) | **uziemienie punktu neutralnego jako encja pierwszej klasy** z fizyką w sieci zerowej; główny test jakości twin (§13 EARTH FAULTS, G01) |
| nN ABCN: A/B/C/N, PEN, asymetria, prąd N, SWZ, Ik min/max, ΔU, obciążalność | `PARTIAL` (pętla zwarcia nN i SWZ istnieją; rozpływ niesymetryczny odcięty — A11-11; dwie fizyki Ik1 nN — A11-05) | jawne fazy na terminalach, przewód N/PEN jako dane modelu, jeden solver 4-przewodowy (ADR-021) |
| Cieplne: obciążalność, przeciążenie, I²t, wytrzymałość krótkotrwała | `PARTIAL` (warunki ułożenia w `meta`, brak IEC 60287 — A11-07/08) | warunki ułożenia jako dane katalogowo-projektowe z proweniencją; sprzężenie let-through aparatu ↔ k²S² |
| Jakość energii: EN 50160, IEC 61000, harmoniczne, flicker, asymetria, rezonans | `FABRICATED`/`PARTIAL` (widma zaszyte — A5-08, A11-10) | źródła harmonicznych na elementach z proweniencją widma; impedancja harmoniczna z tej samej migawki; bez fabrykowanych widm |
| Dynamika: RMS, stabilność, odpowiedź częstotliwościowa, rozruch silników, grid-forming/following, LVRT/HVRT | `PARTIAL` (`test_dynamic_stability.py` na własnej sieci; rozruch na DTO bez encji silnika — A11-09) | odbiór silnikowy jako encja; parametry dynamiczne DER w katalogu; nie blokować: model musi nieść stałe czasowe i tryby |

### 3.3 Zabezpieczenia i automatyka (§14)
| Zdolność | Dziś | Wymaganie twin |
|---|---|---|
| 50/51, 50N/51N, krzywe IEC 60255, TCC, koordynacja | `SUPPORTED` (`protection_iec60255.py`, `protection_lv_curves.py`) | jedno kanoniczne ownership nastaw i urządzeń w modelu (`ProtectionAssignment`, `Bay*ProtectionControlUnit`) |
| 67/67N, admitancyjne Y0>, U0> | `NOT_IMPLEMENTED` (flaga `is_directional` bez fizyki — A4) | polaryzacja kierunkowa, sieć zerowa, CT/VT, wynik zwarcia doziemnego |
| 87T/87N, 21, 87BB, zabezpieczenia generatora/transformatora, 25, 79, 50BF, blokady, logika wyzwalania, grupy nastaw | `PLANNED` (rejestr `ProtectionCapabilityRegistry` — `docs/twin/MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md` §5a) | model: strefy, cele wyzwalania, łańcuch pomiarowy CT/VT, kanały; silnik konsumuje immutable projekcję |
| Provenance oceny: Twin → Scenario → wynik zwarcia/rozpływu → rewizja nastaw → ocena | `PARTIAL` (nastawy per case vs w modelu — dwie prawdy) | envelope rewizji obejmuje `protection_settings_revision` (§9) |

### 3.4 OZE / DER / BESS / przyłączenie (§15)
| Zdolność | Dziś | Wymaganie twin |
|---|---|---|
| Q(U), cosφ(P), P(f), zdolność bierna, ograniczanie P, LVRT/HVRT, ROCOF, vector shift | `PARTIAL` (tryby jako stringi w 12 wariantach — A5-03; katalogowe tryby Q nieme w rozpływie) | tryb sterowania jako typowana zdolność DER czytana przez rozpływ i dynamikę |
| NC RfG / IRiESD, macierze zgodności | `PARTIAL` (trzy silniki zgodności, fabrykowane domyślne — A5-07) | jeden silnik zgodności na profilach OSD z rejestru źródeł normatywnych |
| Hosting capacity, przeciążenia, limity eksportu/importu | `PARTIAL` (dwa silniki — A5-09) | threshold finder na jednej migawce, z ograniczeniami cieplnymi/napięciowymi/zabezpieczeniowymi/N-1/PQ |

### 3.5 Projektowanie, optymalizacja, prezentacja, katalogi, eksploatacja, dokumentacja, White Box, inteligencja (§16–§24)
| Rodzina | Dziś | Wymaganie twin |
|---|---|---|
| Dobór: kable, linie, TR, aparaty, rozdzielnice, stacje, pola, CT/VT, zabezpieczenia, uziemienia, kompensacja, wzmocnienia, warianty przyłączenia, DRC | `PARTIAL` (kreatory stacji/pola/OZE; brak `SizingRequest/Result` jako kontraktu) | `ConstraintEngine` + moduły doboru z kandydatami (`docs/twin/MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md` §3–§4) — system proponuje rozwiązania, nie tylko werdykt |
| Optymalizacja wielokryterialna (CAPEX, OPEX, straty, niezawodność, N-1, rezerwa, standaryzacja, utrzymanie, rozbudowa, jakość energii, hosting, wykonalność zabezpieczeń) — Pareto | `NOT_IMPLEMENTED` | `DEFAULT_DESIGN_POLICY` ≠ optimum; front Pareto (D-23) |
| SLD SN, SLD nN, schematy stacji, tory TR/odpływów, nakładki wyników i zabezpieczeń, widoki geograficzne/GIS/SCADA | `PARTIAL` (SLD v2/v3; frontend liczy własną topologię — A2-08; brak GIS) | backend jest autorytetem elektrycznym; frontend posiada layout/geometrię/prezentację (§18); IEC 60617; IEC 81346 tylko przez profil |
| Katalogi z proweniencją (producent/karta/norma/założenie/specyfikacja/pochodna) | `PARTIAL` (proweniencja katalogów K-E/K-O/K-Q; fikcyjne nazwy producentów — D-33, usuwane w karcie FAB-A) | każda wartość inżynierska z klasą źródła i rewizją (§20; `docs/twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §15.5) |
| Eksploatacja: stany łączeń, sekwencje, wyłączenia, izolacja, uziemniki, stany bezpiecznej pracy, odbudowa, blokady | `PARTIAL` (`BayEnergizationSafetyState`, `BayInterlockSet` w modelu; brak sekwencji i dowodu topologicznego) | „bezpieczne do pracy" WYŁĄCZNIE z pełnym dowodem topologicznym i operacyjnym (§21) |
| Dokumentacja: raporty obliczeniowe/projektowe, karty nastaw, studia przyłączeniowe, macierze RfG, JEN, zwarciowe, SLD, zestawienia, listy urządzeń, pakiety dowodowe, historia rewizji, porównania | `PARTIAL` (PDF/DOCX; 14 typów §124 częściowo) | z tego samego `RevisionEnvelope` co analiza (§22) |
| White Box / forensic: dane źródłowe → proweniencja → założenia → envelope → migawka → topologia → wejście solvera → wartości pośrednie → wynik → walidacja → interpretacja | `PARTIAL` (`CanonicalRun` zamraża migawkę; ślad inline; `trace_v2` martwe — A3-12; pola proweniencji stałe — A2 §1.5) | pełna droga wyniku, żaden test snapshotowy nie jest wyrocznią fizyki (§23, §32) |
| Inteligencja inżynierska: sprawdzenia automatyczne, silnik reguł, anomalie, rekomendacje, topology healing, warianty automatyczne, asystent, audyty spójności | `PARTIAL` (readiness/fix-actions, NBA w ui2/proces) | nie budować teraz; fundament nie może uniemożliwić (§24): komendy domenowe jako jedyny język zmian, `VariantBranch(PROPOSED)` dla agenta |

---


---

## 4. Reguły future-proof (§26, §30 konstytucji)

1. **Test każdej granicy fundamentalnej:** „Jaka poważna przyszła zdolność zmusiłaby nas do złamania tej granicy?" Jeśli przewidywalna zdolność z §2 wymaga przebudowy fundamentu — granica NIE jest przyjęta. Wynik per decyzja: `DECISION_FREEZE_REGISTER.md`.
2. **Pytania obowiązkowe** (minimum): model fazowy obsłuży nN ABCN bez przepisania? łączność obsłuży tor powrotny/zerowy SN bez konkurencyjnego modelu? rewizje obsłużą szeregi czasowe i stany operacyjne? model TR obsłuży bogatsze modele dynamiczne/zabezpieczeniowe? tożsamość przetrwa import GIS i aktualizację katalogu? jeden asset na wielu SLD? nastawy zmienne bez klonowania sieci? `StudyCase` skaluje się do LF, SC, dynamiki, harmonicznych, optymalizacji? proweniencja wyników spójna po tym wszystkim?
3. **Zakaz pętli architektonicznej (§30):** żadnego przemianowywania pojęć, drugiego modelu równoległego, trwałych duplikatów, warstw zgodności bez planu kasacji, restartu od zera, „czystszego stylu" jako powodu. Ponowne otwarcie granicy po bramce dowodowej TYLKO z: defektem inżynierskim, błędnym wynikiem numerycznym, niezdolnością do wymaganej fizyki, awarią spójności danych, awarią współbieżności/persystencji, defektem bezpieczeństwa, nieakceptowalną granicą wydajności, jawnym nowym wymaganiem właściciela. Preferencja agenta nie jest dowodem.
4. **Bramki właścicielskie pozostają osobne:** B-01 (fizyka rdzeni solverów: niezależna wyrocznia, jawne założenia, wielkości pośrednie, deterministyczne wejścia, jednostki, tolerancje, tożsamość starej fizyki, testy trybów awarii i brzegów; wartości oczekiwane wygenerowane z implementacji nie są walidacją) i B-02 (SLD: semantyka i jakość CAD oceniane osobno na rzeczywistych rysunkach; zakaz przywracania mieszanego SN/nN dla przestarzałych testów).

## 5. Nie-cele (jawne)
- MV-DESIGN-PRO nie jest systemem SCADA czasu rzeczywistego ani EMS/DMS dyspozytorskim — widok „SCADA-like" jest projekcją twin, nie sterowaniem obiektami.
- Nie jest systemem ERP/finansowym — koszty (CAPEX/OPEX) są danymi wejściowymi optymalizacji z proweniencją, nie księgowością.
- Nie zastępuje decyzji inżyniera: rekomendacje, DRC i asysta AI są podporządkowane deterministycznym dowodom; werdykt „bezpieczne do pracy" bez pełnego dowodu topologicznego i proceduralnego jest zakazany.
- Model wewnętrzny nie jest równy zewnętrznemu schematowi wymiany (CIM/CGMES, XLSX, GIS) — adaptery na granicy, nie kształt domeny.
- Żadna zdolność nie jest „udawana": brak fizyki = status `PLANNED`/`NOT SUPPORTED` widoczny przed uruchomieniem, nigdy wynik przybliżony ani fikcyjne dane.

## 6. Powiązania
Macierz §25: `CAPABILITY_ARCHITECTURE_MATRIX.md`. Architektura twin i granica obliczeniowa: `CANONICAL_TWIN_ARCHITECTURE.md`. Kolejność i stan: `CONVERGENCE_ROADMAP.md`. Decyzje i zamrożenia: `DECISION_FREEZE_REGISTER.md`. Dowody: `../evidence/CONVERGENCE_EVIDENCE.md`. Sieci wzorcowe: `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`.
