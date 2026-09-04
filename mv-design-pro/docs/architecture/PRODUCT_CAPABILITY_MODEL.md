# MV-DESIGN-PRO — PRODUCT CAPABILITY MODEL (koperta zdolności platformy MAX)

**Status:** KANONICZNY (kontrakt właściciela „MAX PLATFORM ARCHITECTURE & CONVERGENCE CONTRACT", 2026-09-04, §1–§3, §13–§26).
**Rola dokumentu:** jedyne źródło prawdy o tym, CO platforma ma być zdolna obsłużyć w horyzoncie 5–10 lat, i JAKICH pojęć domenowych, danych, topologii/fizyki, usług, analiz, wyjść i proweniencji każda zdolność wymaga (§25). Dokumenty `docs/twin/*.md` (FAZA A–F, 2026-09-02) są materiałem wejściowym i dowodowym; przy rozbieżności obowiązuje ten dokument.
**Czego NIE robi:** nie jest backlogiem implementacyjnym. Zdolność wymieniona tu nie jest obietnicą wdrożenia w bieżącym wycinku — jest wymaganiem, którego fundament (Canonical Project Twin, granica obliczeniowa, envelope rewizji) nie może zablokować (§2: „szeroka architektura domenowa + wąskie, kompletne vertical slices").

---

## 1. Misja i zasada MAX

MV-DESIGN-PRO ma być **jednym kompletnym środowiskiem pracy inżyniera elektroenergetyka** obejmującym pełny cykl życia sieci: koncepcja → projektowanie i przyłączenie → modelowanie → analizy → zabezpieczenia i automatyka → OZE/BESS → optymalizacja → dokumentacja → eksploatacja → Digital Twin (§1). Nie jest kalkulatorem SN, kalkulatorem zwarć, edytorem SLD, systemem zabezpieczeń ani zbiorem ekranów.

**Test każdej decyzji fundamentalnej (§2):** „Czy ta granica architektoniczna pozostanie poprawna, gdy MV-DESIGN-PRO obejmie pełną dziedzinę elektroenergetyczną?" Odpowiedź „nie wiadomo" = decyzja niegotowa. Decyzja obsługująca tylko bieżący sprint, a wymuszająca późniejszą przebudowę modelu = odrzucona. Formalny test to `FUTURE_CAPABILITY_REVIEW.md`.

**Status zdolności (jedna skala, spójna z rejestrami zdolności solverów i zabezpieczeń):** `SUPPORTED` — pełna ścieżka użytkownika z testem i wyrocznią; `PARTIAL` — działa w jawnie nazwanym podzbiorze; `PLANNED` — zaprojektowane, twin nie blokuje, nieimplementowane; `NOT_IMPLEMENTED` — brak; `FABRICATED` — istnieje ekran/pole bez fizyki lub z fikcyjnymi danymi (stan do usunięcia natychmiast). Status pochodzi z pomiaru (audyty A1–A12, `docs/twin/MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md`), nie z deklaracji.

---

## 2. Koperta zdolności (capability envelope) — stan dziś vs wymaganie architektoniczne

### 2.1 Inżynieria sieci (§3)
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

### 2.2 Platforma analiz (§13)
| Rodzina | Dziś | Wymaganie twin |
|---|---|---|
| Rozpływ mocy NR/GS/FD, PQ, zaczepy, OLTC | `SUPPORTED` (P1 kanoniczny) — ale szyny PV nigdy nie budowane (A3-04), wiele slacków (A3-05) | PV/PQ/slack z modelu, regulacja U, limity Q, DER Q(U)/cosφ(P)/P(f), tryby BESS, wyspy, status zbieżności, jakość wyniku |
| Zwarcia IEC 60909: 3F, 2F, 1F, 2F-Z, max/min, I_k'', i_p, I_th, Z0 | `SUPPORTED` (S1 kanoniczny, 4 typy, Z0) | udziały źródeł i DER, impedancja przejścia, sieci składowych jako ślad White Box |
| Zwarcia doziemne SN: izolowany, kompensowany (Petersen), rezystor, prąd pojemnościowy, U0, I0, stopień kompensacji, 67N/Y0> | `PARTIAL`/`FABRICATED` (detekcja w `v126_academic`; `GroundingConfig` w ENM jest fantomem dla fizyki — A11-02; 6 reprezentacji uziemienia) | **uziemienie punktu neutralnego jako encja pierwszej klasy** z fizyką w sieci zerowej; główny test jakości twin (§13 EARTH FAULTS, G01) |
| nN ABCN: A/B/C/N, PEN, asymetria, prąd N, SWZ, Ik min/max, ΔU, obciążalność | `PARTIAL` (pętla zwarcia nN i SWZ istnieją; rozpływ niesymetryczny odcięty — A11-11; dwie fizyki Ik1 nN — A11-05) | jawne fazy na terminalach, przewód N/PEN jako dane modelu, jeden solver 4-przewodowy (ADR-021) |
| Cieplne: obciążalność, przeciążenie, I²t, wytrzymałość krótkotrwała | `PARTIAL` (warunki ułożenia w `meta`, brak IEC 60287 — A11-07/08) | warunki ułożenia jako dane katalogowo-projektowe z proweniencją; sprzężenie let-through aparatu ↔ k²S² |
| Jakość energii: EN 50160, IEC 61000, harmoniczne, flicker, asymetria, rezonans | `FABRICATED`/`PARTIAL` (widma zaszyte — A5-08, A11-10) | źródła harmonicznych na elementach z proweniencją widma; impedancja harmoniczna z tej samej migawki; bez fabrykowanych widm |
| Dynamika: RMS, stabilność, odpowiedź częstotliwościowa, rozruch silników, grid-forming/following, LVRT/HVRT | `PARTIAL` (`test_dynamic_stability.py` na własnej sieci; rozruch na DTO bez encji silnika — A11-09) | odbiór silnikowy jako encja; parametry dynamiczne DER w katalogu; nie blokować: model musi nieść stałe czasowe i tryby |

### 2.3 Zabezpieczenia i automatyka (§14)
| Zdolność | Dziś | Wymaganie twin |
|---|---|---|
| 50/51, 50N/51N, krzywe IEC 60255, TCC, koordynacja | `SUPPORTED` (`protection_iec60255.py`, `protection_lv_curves.py`) | jedno kanoniczne ownership nastaw i urządzeń w modelu (`ProtectionAssignment`, `Bay*ProtectionControlUnit`) |
| 67/67N, admitancyjne Y0>, U0> | `NOT_IMPLEMENTED` (flaga `is_directional` bez fizyki — A4) | polaryzacja kierunkowa, sieć zerowa, CT/VT, wynik zwarcia doziemnego |
| 87T/87N, 21, 87BB, zabezpieczenia generatora/transformatora, 25, 79, 50BF, blokady, logika wyzwalania, grupy nastaw | `PLANNED` (rejestr `ProtectionCapabilityRegistry` — `docs/twin/MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md` §5a) | model: strefy, cele wyzwalania, łańcuch pomiarowy CT/VT, kanały; silnik konsumuje immutable projekcję |
| Provenance oceny: Twin → Scenario → wynik zwarcia/rozpływu → rewizja nastaw → ocena | `PARTIAL` (nastawy per case vs w modelu — dwie prawdy) | envelope rewizji obejmuje `protection_settings_revision` (§9) |

### 2.4 OZE / DER / BESS / przyłączenie (§15)
| Zdolność | Dziś | Wymaganie twin |
|---|---|---|
| Q(U), cosφ(P), P(f), zdolność bierna, ograniczanie P, LVRT/HVRT, ROCOF, vector shift | `PARTIAL` (tryby jako stringi w 12 wariantach — A5-03; katalogowe tryby Q nieme w rozpływie) | tryb sterowania jako typowana zdolność DER czytana przez rozpływ i dynamikę |
| NC RfG / IRiESD, macierze zgodności | `PARTIAL` (trzy silniki zgodności, fabrykowane domyślne — A5-07) | jeden silnik zgodności na profilach OSD z rejestru źródeł normatywnych |
| Hosting capacity, przeciążenia, limity eksportu/importu | `PARTIAL` (dwa silniki — A5-09) | threshold finder na jednej migawce, z ograniczeniami cieplnymi/napięciowymi/zabezpieczeniowymi/N-1/PQ |

### 2.5 Projektowanie, optymalizacja, prezentacja, katalogi, eksploatacja, dokumentacja, White Box, inteligencja (§16–§24)
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

## 3. Mapa zdolności → wymagania (§25): CAPABILITY → pojęcia → dane → topologia/fizyka → usługi → analizy → wyjścia → proweniencja

Skróty: **T** = Canonical Project Twin (rozwinięty ENM), **ES** = `EffectiveNetworkSnapshot`, **TV** = wyprowadzona topologia (`TopologyView`), **IR** = Computational IR (`network_model` jako pochodna), **RE** = `RevisionEnvelope`, **RS** = `ResultSet` + provenance, **NS** = rejestr źródeł normatywnych/danych.

| # | Zdolność | Pojęcia domenowe (T) | Dane wymagane | Topologia / fizyka | Usługi | Analizy zależne | Wyjścia | Proweniencja |
|---|---|---|---|---|---|---|---|---|
| C01 | Rozpływ mocy (składowa zgodna) | Bus≡CN, gałęzie, TR z zaczepami, Source (slack/PV), Load, Generator (PQ/PV), Shunt, Island | Z gałęzi, S odbiorów, limity Q, zaczepy, tryby DER | TV (TN, wyspy, slack per wyspa) → IR Ybus | assembler ES→IR, orkiestrator, readiness | straty, ΔU, obciążenia, hosting, N-1, QSTS, WLS | RS (U, kąty, przepływy, straty, zbieżność) | RE + wersja solvera + `settings_hash` |
| C02 | Zwarcia 3F/2F/1F/2F-Z (IEC 60909) | jak C01 + `GroundingConfig` (Z0), grupa połączeń TR, Source Sk''/R/X, DER wkład | c-factor z NS (norma/OSD), R_θ, impedancje zerowe, Z_f | TV → IR Z1/Z2/Z0 (Zbus) | jak C01 | cieplne, dobór aparatów, zabezpieczenia, arc flash, uziemienia | RS (I_k'', i_p, I_th, I_b, udziały) | RE + NS (wydanie normy, c) |
| C03 | Zwarcia doziemne SN (izolowany / kompensowany / rezystor) | **`NeutralGrounding`** (encja: rodzaj, L cewki, R, dostrojenie), pojemności doziemne linii/kabli, TR grupa, `BayEarthFaultPath` | C0 (pojemność doziemna) per gałąź z katalogu, parametry cewki/rezystora, tłumienie | sieć składowej zerowej na TV; prąd pojemnościowy I_C, I_L, stopień kompensacji, U0, I0 per odpływ | jak C01 + `NeutralGroundingService` (dostrojenie) | 67N/Y0>/U0>, dobór cewki, ocena bezpieczeństwa (U dotykowe) | RS (I_C, I_res, U0, rozdział I0) | RE + NS (metoda, wydanie) + proweniencja C0 |
| C04 | nN ABCN (rozpływ 4-przewodowy, asymetria, prąd N) | **`Terminal.phases`** (A/B/C/N/PEN/PE), Load fazowy, Cable z żyłą N/PEN, TR z grupą i przesunięciem, `EarthingSystem` (TN-C/TN-S/TN-C-S/TT/IT) | Z fazowe i N kabli, obciążenia per faza, punkt rozdziału PEN→PE | TV fazowa (ciągłość faz i N) → IR 4-przewodowy | assembler fazowy | VUF, prąd N, ΔU per faza, SWZ, EN 50160 | RS fazowy | RE |
| C05 | Pętla zwarcia nN / SWZ / Ik min-max nN | jak C04 + aparaty nN (`FuseBranch`, wyłączniki) z charakterystykami | impedancje pętli, charakterystyki aparatów (katalog) | jedna fizyka Ik1 nN (kasacja drugiej — A11-05) | — | dobór zabezpieczeń nN, I²t | RS (Z_pętli, I_k1, t_wył) | RE + katalog aparatu |
| C06 | Cieplne (obciążalność, przeciążenie, I²t, wytrzymałość) | Cable/Line/TR z ratingiem, warunki ułożenia jako dane projektowe | I_z z katalogu i metody ułożenia (IEC 60287/60364-5-52), k, S, t_wył | z C01/C02/C05 | — | dobór, DRC | RS (obciążenie %, I²t margines) | RE + NS (tablice, metoda) |
| C07 | Jakość energii (harmoniczne, flicker, asymetria, rezonans) | źródła harmonicznych na DER/odbiorach (widmo z proweniencją), baterie, filtry | widma (producent/pomiar), impedancje częstotliwościowe | impedancja harmoniczna na TV → IR(f) | skan częstotliwości | EN 50160, IEC 61000 alokacja emisji | RS (THD, Pst, VUF, Z(f)) | RE + NS + proweniencja widma |
| C08 | Dynamika (RMS, FRT, częstotliwość, rozruch, grid-forming) | DER z parametrami dynamicznymi, silnik jako encja, regulatory | stałe czasowe, ograniczniki, krzywe FRT (profil OSD) | IR dynamiczny na TV | symulator RMS | RfG FRT, stabilność, mikrosieć | RS szeregi | RE + NS |
| C09 | Zabezpieczenia nadprądowe/kierunkowe/różnicowe/odległościowe, SPZ, CBF, blokady, grupy nastaw | `ProtectionAssignment`, `Bay*ProtectionControlUnit`, `Measurement` (CT/VT), strefy, cele wyzwalania | nastawy per grupa, charakterystyki, CT/VT (przekładnia, klasa, nasycenie) | z C02/C03 (prądy, kierunki, sieć zerowa) | silnik oceny na immutable projekcji | koordynacja, TCC, selektywność | karty nastaw | RE (`protection_settings_revision`) |
| C10 | CT/VT dobór i łańcuch pomiarowy | `Measurement` (przekładnik) → kanał → jednostka | przekładnia, klasa, moc, obciążenie wtórne, ALF | z C02 (I_k'' max) | dobór | C09 | zestawienie CT/VT | RE + katalog |
| C11 | DER sterowanie: Q(U), cosφ(P), P(f), ograniczanie, zdolność bierna | Generator zdekomponowany: jednostka / przekształtnik / sterowanie; `GridConnectionPoint` | krzywe zdolności, parametry sterowania z profilu OSD | C01 z regulacją DER (iteracja) | — | hosting, RfG | RS | RE + NS (profil OSD) |
| C12 | BESS tryby (ładowanie/rozładowanie, SOC, sprawność, P/Q) | BESS jako encja stanu (nie `meta`) | E, P, SOC, sprawność, tryby | C01/C08 | — | QSTS, mikrosieć | RS | RE |
| C13 | Zgodność przyłączeniowa NC RfG / IRiESD | `GridConnectionPoint`, klasy A–D, profile OSD z NS | wymagania profilu, wyniki C01/C02/C08 | — | jeden silnik zgodności | macierz RfG | dokument zgodności | RE + NS (wersja profilu) |
| C14 | Hosting capacity / przeciążenia / limity | scenariusze obciążenia/generacji jako `OperatingScenario` | limity cieplne/napięciowe/zabezpieczeniowe/PQ | C01 (+C02, N-1) na ES z deltami | threshold finder | rekomendacje | RS | RE (scenariusz) |
| C15 | N-1, kontyngencje | `OperatingScenario` (wyłączenie elementu), `Island` | kryteria (obciążenie, U, zabezpieczenia, wyspy) | TV per kontyngencja → C01/C02 | wsad scenariuszy (`ExecutionBackend`) | niezawodność | RS zbiorczy | RE per scenariusz |
| C16 | Dobór kabli/linii/TR/aparatów/rozdzielnic/stacji/pól | `SizingRequest/Result`, kandydaci z katalogu, `ConstraintEngine` | katalog z rewizją, ograniczenia PHYSICS/NORMATIVE/POLICY/PROJECT | z C01/C02/C05/C06 | moduły doboru | DRC | rekomendacja z alternatywami | RE + katalog + NS |
| C17 | Projekt uziemienia | `NeutralGrounding`, `EarthingSystem`, rezystancja uziemienia, U dotykowe | R_E, czas wyłączenia, prąd doziemny z C03/C05 | z C03 | dobór | bezpieczeństwo | raport | RE + NS |
| C18 | Kompensacja mocy biernej / regulacja napięcia | `ShuntCapacitor`, zaczepy, tryby Q DER | koszt, limity | C01 | Volt/VAr | optymalizacja | rekomendacja | RE |
| C19 | Optymalizacja wielokryterialna (Pareto) | `OptimizationProblem`, `ObjectiveAxis` ×8, `CostCatalog`, `OutageData` | koszty, λ/r, horyzont rozbudowy z założeń | wiele biegów C01/C02/C15 na deltach | silnik strategii jawnych (bez losowości) | — | front Pareto + rekomendacja | RE + założenia |
| C20 | Warianty strukturalne sieci (stacja, kabel, TR, pole, BESS, modernizacja) | **`NetworkVariation`** = typowana delta na rewizji bazowej | komendy domenowe | ES per wariant | rewizje + warianty | porównania A/B/C | raport porównawczy | RE (`variation_revision`) |
| C21 | Scenariusze pracy (MAX/MIN, MAX PV, N-1, łącznik OPEN, TR niedostępny, BESS, wyspa) | **`OperatingScenario`** = typowane nadpisania stanu | stany łączników, in_service, skalowanie P/Q, tryby DER, zaczepy | ES = T(rev) ⊕ variation ⊕ scenario | jedna funkcja `apply_scenario` | wszystkie | — | RE (`scenario_revision`) |
| C22 | SLD SN/nN, schematy stacji, nakładki, GIS/SCADA | scena semantyczna z backendu (łączność, TV, energizacja, pasma U, fazy, wiązanie wyników, tożsamość rewizji) | geometria/layout po stronie klienta | TV, energizacja z TV | projekcje SN/nN | — | arkusze CAD, DXF jako jawny adapter | RE w scenie |
| C23 | Eksploatacja: sekwencje łączeń, izolacja, uziemniki, safe-work, odbudowa | stany łączników z rozszerzeniem EARTHED, uziemniki, blokady, sekwencja jako lista komend | — | TV z dowodem odizolowania/uziemienia | walidator sekwencji | — | protokół | RE + aktor + czas |
| C24 | Dokumentacja i pakiety dowodowe | rejestr dokumentów ze świeżością, 14+ typów | wszystko powyżej | — | generator z tego samego RE | — | PDF/A, XLSX, wektor, DXF | RE + hash dokumentu |
| C25 | White Box / forensic | `TraceArtifact`, wartości pośrednie (Ybus, Zbus, jakobian, sieci składowych) | — | — | proof engine (formatuje, nie liczy) | — | dowody | RE + hash biegu |
| C26 | Import/eksport danych (XLSX, CGMES/CIM, GIS) | komendy domenowe jako jedyny język importu; CIM = wymiana danych | — | topology healing na TV | adaptery | — | — | RE (import jako aktor) |
| C27 | Audyty spójności modelu, silnik reguł, rekomendacje, asystent | reguły na T/TV/RS, `VariantBranch(PROPOSED)` | — | — | — | — | — | RE + aktor=agent |

---

## 4. Wymagania na Canonical Project Twin wynikające z §3 (suma kolumn „Pojęcia domenowe")

Fundament MUSI nieść (§6–§7, §19–§20) — z oznaczeniem stanu w ENM dziś:

| Pojęcie | W ENM dziś | Luka | Wycinek konwergencji |
|---|---|---|---|
| stabilna tożsamość assetu | `ref_id` (`ENMElement`); `id: uuid4` bez funkcji (A1-14) | tłumaczenie na uuid5 w 4 przestrzeniach (A1-06) | CV-4 (jedna przestrzeń w IR) |
| hierarchia: stacja / sekcja / pole / aparat | `Substation`, `GPZSection`, `NnSection`, `Bay`, `BayPrimaryDevice` | aktywna prawda w `meta.field_specs` (A1-02) | CV-5 (typowany `Bay` → kasacja `meta.field_specs` procedurą) |
| urządzenia przewodzące + terminale + ConnectivityNode | `Bus` (≡ CN, patrz `CANONICAL_DIGITAL_TWIN.md` §3), `Port`/`PortRef`/`ConnectionNode` jako metadane bez egzekwowania (A1-03) | terminale nie są kontraktem łączności | CV-5 (terminale addytywne, egzekwowane walidatorem) |
| łączność fizyczna vs stan łącznika vs in_service | `SwitchBranch.status`, `BaySwitchState`, 8 reprezentacji stanu (A1-07) | brak EARTHED/TRIPPED; stan w 8 miejscach | CV-3 (`EffectiveState` + `OperatingScenario`) |
| poziom napięcia, przynależność fazowa, N, PEN, PE | `Bus.voltage_kv` (liczba); brak faz; „żyła powrotna" bez N/PE (A11-04) | model fazowy | CV-5 (`Terminal.phases`, `EarthingSystem`) |
| uziemienie: punkt neutralny TR/źródła, uziemienie szyny, ekrany | `GroundingConfig` na `Bus`, `Transformer.hv_neutral/lv_neutral`; `earthing_role` w `Bay`; 6 reprezentacji (A11-02) | fizyka nie czyta żadnej z nich | CV-5 + G01 (`NeutralGrounding` jako encja z fizyką w sieci zerowej) |
| grupa połączeń TR, dostępność punktu neutralnego | `Transformer.vector_group` (opcjonalny string) | brak walidacji i użycia w Z0 | CV-5 |
| ekrany/powłoki kabli | brak (A11-14) | — | PLANNED (katalog + C03) |
| CT, VT, aparatura zabezpieczeniowa, pomiary | `Measurement`, `MeasurementRating`, `ProtectionAssignment`, `BayMeasurementChain`, `BayProtectionControlUnit` | zapis typowanych kolekcji wyłączony (`LEGACY_FIELD_COLLECTIONS` — A1 §2) | CV-5 / zabezpieczenia |
| zdolności sterowania DER | `Generator` (zlepek — A5-01), tryby jako stringi (A5-03) | dekompozycja | CV-6 (G01 PV) |
| wiązania katalogowe + proweniencja producenta | `catalog_ref`/materializacja parametrów; proweniencja K-E/K-O/K-Q | brak rewizji katalogu przypiętej do projektu (A1-13) | CV-2 (`catalog_revision_set` w RE) |
| założenia, nadpisania | `ParameterOverride`, `ENMDefaults`, `ConnectionConditions` | brak rejestru założeń z rewizją | CV-2 |
| rewizje / warianty / scenariusze / przypadki | `ENMHeader.revision` (licznik per case), 6 modeli scenariusza (A2 §1.4) | brak magazynu rewizji projektu; per-case ENM | CV-1, CV-2, CV-3 |

---

## 5. Rejestr luk fundamentu (co dziś BLOKUJE zdolności z §2–§3)

| Luka | Blokuje | Dowód | Zamknięcie |
|---|---|---|---|
| ENM per `case_id` (plik `sha256(case_id)`), nie per projekt | C20, C21, C24, każdy lineage | `enm/store.py:82`, `api/enm.py:151-156` | CV-1 |
| brak `RevisionEnvelope`; pola proweniencji stałe | C24, C25, porównania | `domain/analysis_run.py:195,227-229`; `result_contract_v1.py:307-328` | CV-2 |
| 6 modeli scenariusza + 4 delty in-memory, brak `EffectiveNetworkSnapshot` jako funkcji | C14, C15, C19, C20, C21 | A2 §1.4 | CV-3 |
| 10 builderów PF / 7 ścieżek SC; własny NR w `reference_networks/computation.py` | C25, determinizm, parity | A3 §2.1–§2.2 | CV-4 |
| topologia liczona w 20 miejscach, frontend liczy własną | C22, C23 | A2-01, A2-08 | CV-4 |
| brak faz, N/PEN/PE, `NeutralGrounding` jako encji z fizyką | C03, C04, C05, C09 (67N), C17 | A11-02/03/04, A1-04 | CV-5, G01 |
| `Generator` jako zlepek; tryby DER stringami | C11, C12, C13, C08 | A5-01/03/04 | CV-6 |
| fikcyjne dane (katalog przekaźników, fantom nastaw, widma) | C07, C09, zaufanie | D-33; A5-08 | CV-0 (karty FAB-A/B), C07 przy wdrożeniu |

Każda luka ma wycinek w `CANONICAL_DIGITAL_TWIN.md` §7 / `REVISION_SCENARIO_EXECUTION_MODEL.md` / `COMPUTATIONAL_BOUNDARY.md`; dowody zamknięcia w `../evidence/CONVERGENCE_EVIDENCE.md`.
