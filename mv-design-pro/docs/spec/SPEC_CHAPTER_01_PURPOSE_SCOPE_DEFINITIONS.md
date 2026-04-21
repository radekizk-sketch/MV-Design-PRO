> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# SPECYFIKACJA KANONICZNA MV-DESIGN-PRO
# ROZDZIAŁ 1: CEL, ZAKRES I DEFINICJE KANONICZNE

**Wersja:** 1.0
**Status:** CANONICAL & BINDING
**Data:** 2026-02-08
**Język:** Polski (terminologia normowa, inżynierska; nazwy techniczne angielskie w kodzie)
**Bazowy dokument:** `SYSTEM_SPEC.md` v3.0, `ARCHITECTURE.md` v3.0
**Decision Matrix:** `AUDIT_SPEC_VS_CODE.md` §9

---

## 1.1 Cel rozdziału

Niniejszy rozdział ustanawia **kanoniczny i wiążący** zapis celu, zakresu i terminologii systemu MV-DESIGN-PRO.

Rozdział ten:
- formalizuje i uszczegóławia pojęcia już obecne w systemie,
- potwierdza istniejący kierunek architektoniczny,
- eliminuje możliwość interpretacji skrótowych, niejednoznacznych lub sprzecznych,
- stanowi punkt odniesienia dla wszystkich kolejnych rozdziałów specyfikacji.

**Zakazy niniejszego rozdziału:**
- ZAKAZ redefiniowania funkcji systemu wykraczającej poza istniejący zakres.
- ZAKAZ cofania lub modyfikowania decyzji przyjętych w Decision Matrix (`AUDIT_SPEC_VS_CODE.md` §9).
- ZAKAZ zmiany zakresu systemu bez formalnego ADR (Architecture Decision Record).
- ZAKAZ wprowadzania terminów niezdefiniowanych w §1.5.

---

## 1.2 Cel systemu MV-DESIGN-PRO

### 1.2.1 Definicja kanoniczna

MV-DESIGN-PRO jest profesjonalnym narzędziem inżynierskim klasy **benchmark / DIgSILENT benchmark**, przeznaczonym do:

1. **Modelowania fizycznego sieci elektroenergetycznych** na poziomach napięcia SN (średnie napięcie), nn (niskie napięcie) oraz transformacji WN/SN (wysokie napięcie / średnie napięcie).

2. **Wykonywania analiz obliczeniowych** opartych na jednoznacznym modelu fizycznym sieci:
   - analiz zwarciowych zgodnych z normą IEC 60909 (PN-EN 60909-0),
   - analiz rozpływowych (power flow) metodą Newton-Raphson, Gauss-Seidel i Fast Decoupled,
   - analiz zabezpieczeniowych (koordynacja zabezpieczeń nadprądowych) zgodnych z IEC 60255 (PN-EN 60255).

3. **Projektowania i weryfikacji** struktur sieciowych, w tym:
   - topologii sieci SN (magistrale, pierścienie, odgałęzienia),
   - przyłączania źródeł OZE (odnawialnych źródeł energii) do sieci SN przez transformatory nn/SN,
   - przyłączania odbiorów do sieci SN przez pola odpływowe,
   - doboru aparatury rozdzielczej (łączniki, zabezpieczenia).

4. **Generowania audytowalnych wyników obliczeń** (White Box):
   - każdy wynik obliczeniowy posiada pełny ślad obliczeniowy (trace),
   - każda wartość pośrednia jest jawna i weryfikowalna,
   - dowody obliczeniowe (Proof Documents) są generowane w formatach: JSON, LaTeX, PDF, DOCX.

5. **Tworzenia dokumentacji technicznej i obliczeniowej:**
   - schematów jednokreskowych (SLD — Single Line Diagram),
   - raportów obliczeniowych,
   - dowodów zabezpieczeniowych,
   - dokumentacji projektowej.

### 1.2.2 Zgodność architektoniczna

System jest architektonicznie zgodny z wzorcem **DIgSILENT benchmark**:

| Zasada benchmark | Odpowiednik w MV-DESIGN-PRO |
|---|---|
| Jeden jawny model sieci per projekt | ENM (EnergyNetworkModel) — singleton |
| Wiele przypadków obliczeniowych | Study Case — scenariusze obliczeniowe |
| Brak fikcyjnych bytów w solverach | Solver operuje wyłącznie na bytach fizycznych ENM (po mapowaniu) |
| Audytowalność obliczeń | White Box — pełny ślad obliczeniowy |
| Separacja warstw | Solver / Analysis / Application / Presentation |
| Biblioteka typów | Catalog — niemutowalne typy urządzeń |
| Walidacja przed obliczeniami | NetworkValidator — blokada solvera przy błędach |

### 1.2.3 Czym system NIE jest

MV-DESIGN-PRO **NIE jest i NIE będzie**:
- systemem czasu rzeczywistego (SCADA, EMS, DMS),
- systemem sterowania siecią elektroenergetyczną,
- systemem prognozowania obciążeń lub generacji,
- narzędziem do autonomicznego projektowania sieci elektroenergetycznych ani systemem podejmującym decyzje inżynierskie bez udziału człowieka.

MV-DESIGN-PRO **JEST** narzędziem do generowania i weryfikacji projektów elektroenergetycznych z **AKTYWNYM** udziałem inżyniera, który:
- wybiera topologię,
- dobiera urządzenia,
- zatwierdza założenia,
- interpretuje wyniki,
- ponosi odpowiedzialność projektową.

### 1.2.4 Rola automatyzacji w MV-DESIGN-PRO

Automatyzacja w systemie **dotyczy** (BINDING):
- walidacji formalnej (kody E/W/I, NetworkValidator, ENMValidator),
- generowania wariantów technicznych (Study Cases, scenariusze obliczeniowe),
- obliczeń fizycznych (solvery IEC 60909, Newton-Raphson, Gauss-Seidel, FDLF),
- raportowania (Proof Documents, raporty PDF/DOCX/JSON/LaTeX),
- kontroli spójności normatywnej (guard tests, arch guard, golden tests).

Automatyzacja **NIE dotyczy** (BINDING):
- decyzji projektowych — każda decyzja wymaga zatwierdzenia inżyniera,
- odpowiedzialności technicznej — odpowiedzialność ponosi projektant, nie system,
- zatwierdzania rozwiązań — status Approved/Frozen wymaga jawnej akceptacji użytkownika.

---

## 1.3 Zakres systemu

### 1.3.1 Zakres pozytywny — co system robi

#### A. Klasy modelowanych obiektów fizycznych

System modeluje następujące klasy obiektów w ramach ENM (EnergyNetworkModel):

| Klasa obiektu | Byt ENM | Wpływ na solver | Warstwa |
|---|---|---|---|
| Węzeł elektryczny (punkt o jednym potencjale) | Bus | TAK — poziom napięcia | ENM Core |
| Linia napowietrzna | OverheadLine (Branch) | TAK — impedancja R/X/B | ENM Core |
| Kabel | Cable (Branch) | TAK — impedancja R/X/C | ENM Core |
| Łącznik (wyłącznik, rozłącznik, separator) | SwitchBranch (Branch) | NIE — topologia (OPEN/CLOSED) | ENM Core |
| Bezpiecznik | FuseBranch (Branch) | NIE — topologia + prąd znamionowy | ENM Core |
| Transformator dwuuzwojeniowy | Transformer | TAK — transformacja impedancji | ENM Core |
| Źródło zasilania (sieć zewnętrzna) | Source | TAK — iniekcja mocy | ENM Core |
| Generator | Generator | TAK — iniekcja mocy / źródło prądowe | ENM Core |
| Odbiór | Load | TAK — pobór mocy | ENM Core |
| Rozgałęzienie magistrali | Junction | TAK — topologia | ENM Core |
| Rozdzielnia (kontener logiczny) | Substation | NIE — organizacja | ENM Meta |
| Pole rozdzielcze | Bay | NIE — organizacja | ENM Meta |
| Magistrala wizualna | Corridor | NIE — wizualizacja | SLD Layout |

#### B. Klasy wspieranych analiz

| Analiza | Norma / Metoda | Solver | Status |
|---|---|---|---|
| Zwarcie symetryczne trójfazowe (SC3F) | IEC 60909-0 | `short_circuit_iec60909` | STABLE |
| Rozpływ mocy (Power Flow) | Newton-Raphson | `power_flow_newton` | STABLE |
| Rozpływ mocy | Gauss-Seidel | `power_flow_gauss_seidel` | STABLE |
| Rozpływ mocy | Fast Decoupled | `power_flow_fast_decoupled` | STABLE |
| Koordynacja zabezpieczeń nadprądowych | IEC 60255 | Analysis layer | STABLE |
| Analiza napięciowa (violations, profile) | Normy operatora | Analysis layer | STABLE |
| Analiza termiczna (obciążalność) | — | Analysis layer | STABLE |
| Dowody obliczeniowe (Proof Packs) | — | Proof Engine | STABLE |

#### C. Decyzje projektowe wspierane przez system

System wspiera inżyniera w podejmowaniu następujących decyzji projektowych:
- dobór parametrów elementów sieciowych (z katalogu typów lub w trybie ekspert),
- dobór konfiguracji topologicznej sieci (magistrala, pierścień, drzewo),
- weryfikacja warunków zwarciowych na szynach i aparaturze,
- weryfikacja rozpływu mocy i profili napięciowych,
- weryfikacja selektywności i koordynacji zabezpieczeń,
- ocena dopuszczalności przyłączenia źródeł OZE do sieci SN.

#### D. Warunki konieczne do wykonania analiz

Solver NIE MOŻE zostać uruchomiony, jeśli:
- model ENM jest niekompletny (brak Source, brak Bus, brak połączeń),
- model ENM zawiera błędy blokujące (kody E001–E010 z NetworkValidator),
- nie istnieje aktywny przypadek obliczeniowy (Study Case).

System **NIE zgaduje** brakujących danych. Każdy parametr wejściowy musi być jawnie podany przez użytkownika lub wynikać z wybranego typu katalogowego.

### 1.3.2 Zakres negatywny — czego system NIE robi

System MV-DESIGN-PRO jednoznacznie **NIE realizuje** następujących funkcji:

| Funkcja wyłączona | Uzasadnienie |
|---|---|
| Sterowanie siecią w czasie rzeczywistym (SCADA/EMS/DMS) | System jest narzędziem projektowym, nie systemem operacyjnym |
| Automatyczne uzupełnianie brakujących parametrów | Każdy parametr musi być jawnie podany lub wynikać z katalogu typów |
| Obliczenia przy niekompletnym modelu | NetworkValidator blokuje solver przy błędach E-class |
| Prognozowanie obciążeń lub generacji | System operuje na danych statycznych, nie prognozach |
| Wymiarowanie fundamentów, obudów, tras kablowych | System modeluje obwód elektryczny, nie infrastrukturę fizyczną |
| Generowanie kosztorysów | Poza zakresem — system dotyczy analizy elektrotechnicznej |
| Autonomiczne projektowanie lub podejmowanie decyzji inżynierskich bez udziału człowieka | System wspiera i automatyzuje obliczenia/walidację, ale decyzje projektowe, zatwierdzenia i odpowiedzialność techniczną ponosi inżynier (§1.2.4) |

**Zasada fundamentalna:** Jeśli model jest niekompletny, system MUSI to jawnie wskazać (kody walidacji E/W/I) i MUSI zablokować obliczenia (kody E — blocker). System NIGDY nie domyśla się brakujących danych, nie stosuje wartości domyślnych w obliczeniach i nie kompensuje braków w modelu.

---

## 1.4 Hierarchia źródeł prawdy

System MV-DESIGN-PRO posiada jednoznaczną hierarchię źródeł prawdy. Każda warstwa ma ściśle określoną odpowiedzialność i zakres. Przesuwanie odpowiedzialności między warstwami jest **NIEDOZWOLONE**.

### 1.4.1 Hierarchia (BINDING)

```
1. ENM (EnergyNetworkModel)
   └── Jedyne źródło prawdy fizycznej modelu sieci.
       Wszystkie elementy sieci, ich parametry, topologia i połączenia
       istnieją WYŁĄCZNIE w ENM.

2. Katalog typów (Catalog)
   └── Jedyne źródło parametrów znamionowych urządzeń.
       Typy są niemutowalne. Instancje referencjonują typy.

3. Kreator (Wizard)
   └── Kontrolowany proces budowy i edycji ENM.
       Kreator operuje BEZPOŚREDNIO na ENM — brak pośredniego magazynu danych.

4. Solvery
   └── Interpretacja fizyczna ENM (po mapowaniu na NetworkGraph).
       Solver NIGDY nie modyfikuje ENM. Solver produkuje wyniki (frozen)
       i ślad obliczeniowy (White Box).

5. White Box / Proof Engine
   └── Dowód obliczeń. Interpretacja wyników solvera.
       Proof Engine NIE modyfikuje solverów ani wyników.

6. SLD (Single Line Diagram)
   └── Projekcja wizualna ENM. Mapowanie 1:1: jeden symbol SLD = jeden byt ENM.
       SLD NIE wpływa na solver. SLD NIE wpływa na fizykę sieci.
       Edycja SLD = edycja ENM (przez te same API).

7. UI (warstwa interakcji)
   └── Prezentacja danych użytkownikowi. Brak logiki domenowej.
       Brak fizyki. Brak mutacji modelu poza zdefiniowanymi API.
```

### 1.4.2 Zakazy wynikające z hierarchii

- ENM jest JEDYNYM miejscem przechowywania danych o sieci — brak duplikacji.
- Kreator i SLD edytują TEN SAM model ENM (Wizard/SLD Unity) — brak rozwidlenia danych.
- Solver odczytuje ENM (po mapowaniu) — NIGDY nie zapisuje do ENM.
- White Box odczytuje wyniki solvera — NIGDY nie modyfikuje wyników.
- SLD odczytuje ENM do wizualizacji — NIGDY nie dodaje bytów fizycznych.
- UI odczytuje dane do prezentacji — NIGDY nie wykonuje obliczeń fizycznych.

### 1.4.3 Konsekwencja: modyfikacja fizyki sieci

Fizyka sieci (topologia, impedancje, iniekcje mocy, konfiguracja urządzeń) MOŻE być modyfikowana WYŁĄCZNIE przez:
- **Kreator (Wizard)** — sekwencyjny kontroler budowy modelu,
- **SLD (w trybie edycji)** — graficzna edycja modelu,
- **API edycji** — bezpośrednia modyfikacja ENM przez zdefiniowane endpointy.

Wszystkie powyższe ścieżki operują na TYM SAMYM obiekcie ENM.

---

## 1.5 Definicje kanoniczne

Poniższe definicje stanowią wiążący słownik pojęć systemu MV-DESIGN-PRO. Każde pojęcie posiada jednoznaczną definicję normową. Redefinicja tych pojęć w implementacji, dokumentacji lub specyfikacjach szczegółowych jest **NIEDOZWOLONA** bez formalnego ADR.

---

### System

**Definicja:** MV-DESIGN-PRO jako całość — oprogramowanie inżynierskie do modelowania i analizy sieci elektroenergetycznych SN/nn, obejmujące backend (Python), frontend (TypeScript/React), bazę danych i API.

**Obejmuje:** Wszystkie warstwy od ENM przez solvery, analizy, Proof Engine, aplikację (Wizard, SLD), aż po UI.

**Nie obejmuje:** Infrastruktury wdrożeniowej (serwery, CI/CD), narzędzi deweloperskich, dokumentacji poza specyfikacją kanoniczną.

---

### Projekt (Project)

**Definicja:** Jednostka organizacyjna najwyższego poziomu w systemie. Jeden projekt zawiera dokładnie jeden model sieci (ENM), zero lub więcej przypadków obliczeniowych (Case) oraz powiązane wyniki i dowody.

**Inwariant:** Jeden projekt = jeden ENM (singleton). Nie istnieje projekt bez ENM. Nie istnieje ENM poza projektem.

---

### Przypadek obliczeniowy (Study Case)

**Definicja:** Scenariusz obliczeniowy definiujący parametry wykonania analizy (typ zwarcia, lokalizacja, metoda obliczeniowa, współczynniki normowe). Case referencjonuje ENM w trybie tylko do odczytu.

**Inwarianty:**
- Case NIE MOŻE mutować ENM.
- Case przechowuje WYŁĄCZNIE parametry obliczeniowe — nie dane o sieci.
- Dokładnie JEDEN Case może być aktywny w projekcie w danym momencie.
- Klonowanie Case tworzy kopię konfiguracji ze statusem NONE (bez wyników).
- Zmiana ENM powoduje oznaczenie WSZYSTKICH Cases jako OUTDATED.
- Zmiana konfiguracji Case powoduje oznaczenie TYLKO TEGO Case jako OUTDATED.

**Cykl życia wyników:** `NONE → FRESH (po obliczeniu) → OUTDATED (po zmianie modelu/konfiguracji) → FRESH (po ponownym obliczeniu)`

---

### ENM (EnergyNetworkModel)

**Definicja:** Jedyny, kanoniczny model fizyczny sieci elektroenergetycznej w projekcie. Zawiera kompletny opis topologii i parametrów wszystkich elementów sieciowych.

**Struktura:** ENM składa się z:
- nagłówka (`ENMHeader` — metadane projektu),
- wartości domyślnych (`ENMDefaults` — globalne ustawienia),
- list elementów: `buses`, `branches` (OverheadLine, Cable, SwitchBranch, FuseBranch), `transformers`, `sources`, `loads`, `generators`, `junctions`, `substations`, `bays`, `corridors`.

**Inwarianty:**
- ENM jest jedynym źródłem prawdy fizycznej.
- Każdy element ENM posiada unikatowy identyfikator (`id: UUID`).
- ENM nie zawiera danych solverowych (node_type, voltage_magnitude_pu, active_power_mw — to domena solvera).
- ENM nie zawiera danych obliczeniowych (wyniki, ślady) — to domena Results i White Box.

---

### Typ (Type)

**Definicja:** Niemutowalny zbiór parametrów znamionowych urządzenia, przechowywany w katalogu typów (Catalog). Typ definiuje właściwości klasy urządzenia, nie konkretnej instancji.

**Typy w systemie:** `LineType`, `CableType`, `TransformerType`, `SwitchEquipmentType`, `ConverterType`, `InverterType`.

**Inwarianty:**
- Typy są niemutowalne po utworzeniu.
- Typy są współdzielone między projektami.
- Parametry typu są źródłem parametrów znamionowych instancji (przez `catalog_ref`).
- Modyfikacja parametrów typu na poziomie instancji wymaga jawnego trybu EKSPERT (Decision #16).

---

### Instancja (Instance)

**Definicja:** Konkretny element sieciowy w ENM, będący realizacją typu z katalogu, uzupełnioną o parametry zmienne i opcjonalne nadpisania (override).

**Zasada kompozycji (BINDING, Decision #18):**
```
instancja ENM = TYP(katalog) + parametry_zmienne(kreator) + [override(tryb_ekspert)] + ilość
```

**Inwarianty:**
- Instancja referencjonuje typ przez `catalog_ref` (AS-IS dla Branch, Transformer; TO-BE dla Generator, Load).
- Parametry znamionowe instancji pochodzą z typu — są tylko do odczytu w trybie standardowym.
- Parametry zmienne (np. długość linii, pozycja zaczepu, moc odbioru) są podawane przez użytkownika w kreatorze.
- Override (tryb ekspert) nie modyfikuje typu w katalogu — dotyczy wyłącznie danej instancji.

---

### Parametry znamionowe (Rated Parameters)

**Definicja:** Parametry definiujące właściwości elektryczne urządzenia, wynikające z jego konstrukcji i typu. Pochodzą z katalogu typów.

**Przykłady:** impedancja jednostkowa linii (`r_ohm_per_km`, `x_ohm_per_km`), moc znamionowa transformatora (`sn_mva`), napięcie zwarcia (`uk_percent`), prąd znamionowy falownika (`in_rated_a`).

**Źródło:** Typ katalogowy (`catalog_ref` → Type). W trybie standardowym: tylko do odczytu. W trybie EKSPERT: dopuszczalny override per instancja (Decision #16).

---

### Parametry zmienne (Variable Parameters)

**Definicja:** Parametry instancji, które nie wynikają z typu, lecz z warunków eksploatacji, lokalizacji lub decyzji projektowej. Podawane przez użytkownika w kreatorze lub edytorze.

**Przykłady:** długość linii (`length_km`), pozycja zaczepu transformatora (`tap_position`), moc czynna odbioru (`p_mw`), moc bierna generatora (`q_mvar`), tryb pracy, konfiguracja uziemienia.

**Źródło:** Kreator (Wizard) lub edytor (SLD w trybie edycji). Nie pochodzą z katalogu.

---

### Ilość instancji równoległych (n_parallel)

**Definicja:** Liczba identycznych urządzeń tego samego typu pracujących równolegle w jednym punkcie przyłączenia. Dotyczy w szczególności falowników OZE.

**Inwarianty (Decision #17):**
- Użytkownik podaje TYP + LICZBĘ (`n_parallel`).
- Kreator tworzy N instancji w ENM lub przechowuje pole `n_parallel` z rozwinięciem przy mapowaniu na solver.
- Solver oblicza łączny wkład: `Ik_total = N × k_sc × In_rated`.
- White Box odtwarza relację: typ × ilość → parametry solvera.

---

### Bus (węzeł elektryczny)

**Definicja:** Punkt w sieci elektroenergetycznej o jednym potencjale elektrycznym. Podstawowy element topologiczny ENM.

**Parametry ENM:** `id`, `name`, `voltage_kv` (napięcie znamionowe), `grounding`, `limits`, `zone`.

**Czego Bus NIE zawiera:** `node_type`, `voltage_magnitude_pu`, `voltage_angle_rad`, `active_power_mw`, `reactive_power_mvar` — to parametry solverowe, przypisywane po mapowaniu ENM → NetworkGraph.

**Odpowiednik benchmark:** Terminal.

---

### Junction (rozgałęzienie magistrali)

**Definicja:** Element topologiczny ENM modelujący punkt rozgałęzienia magistrali — miejsce, w którym magistrala dzieli się na odgałęzienia.

**Parametry ENM:** `id`, `connected_branch_refs`, `junction_type` (T_node, sectionalizer, recloser_point, NO_point).

**Warstwa:** ENM Core (topologia fizyczna, Decision #8b).

---

### Pole rozdzielcze (Feeder / Bay)

**Definicja:** Logiczny kontener w ENM grupujący elementy funkcjonalnie przypisane do jednego toru zasilania, odpływu lub pomiaru w rozdzielni.

**Rola (Decision #17 — zasada pisania):** Pole jest jedynym dopuszczalnym punktem przyłączania źródeł, odbiorów i transformatorów do szyn zbiorczych. Pole jest jedynym miejscem przypisywania zabezpieczeń.

**Warstwa:** ENM Meta (organizacja logiczna, Decision #8a). Bay nie wpływa na solver.

**Parametry ENM:** `id`, `name`, `bay_role` (feeder, transformer, measurement, coupler, OZE), `elements`.

---

### Zabezpieczenie (Protection Device)

**Definicja:** Urządzenie elektroenergetyczne realizujące funkcję ochronną — automatyczne wyłączenie toru zasilania w warunkach zwarcia lub przeciążenia.

**Realizacja w ENM:** Zabezpieczenie jest reprezentowane w ENM jako:
- `FuseBranch` — bezpiecznik (topologicznie: gałąź z prądem znamionowym),
- `SwitchBranch` z parametrami zabezpieczeniowymi — wyłącznik z nastawami.

**Warstwa analizy:** Koordynacja zabezpieczeń, krzywe I-t, selektywność — realizowane w warstwie Analysis (Interpretation Layer). NIE w solverze.

---

### Solver

**Definicja:** Komponent systemu realizujący obliczenia fizyczne (zwarciowe, rozpływowe) na podstawie danych z modelu sieci (po mapowaniu ENM → NetworkGraph).

**Inwarianty:**
- Solver operuje WYŁĄCZNIE na danych z NetworkGraph (read-only snapshot ENM).
- Solver NIGDY nie modyfikuje ENM.
- Solver produkuje wyniki (frozen dataclass) i ślad obliczeniowy (White Box Trace).
- Solver MUSI być WHITE BOX — wszystkie wartości pośrednie jawne i weryfikowalne.
- Solver NIE interpretuje wyników — interpretacja należy do warstwy Analysis.

**Zaimplementowane solvery:** `short_circuit_iec60909`, `power_flow_newton`, `power_flow_gauss_seidel`, `power_flow_fast_decoupled`.

---

### White Box (ślad obliczeniowy)

**Definicja:** Pełny, deterministyczny zapis wszystkich kroków obliczeniowych solvera, umożliwiający ręczną weryfikację wyników.

**Zawartość:** Macierz admitancji (Y-bus), impedancja Thevenina (Z-th), macierz Jacobiego (Jacobian), wektory napięć i mocy, iteracje, wartości pośrednie, założenia.

**Inwarianty:**
- Ten sam ENM + ten sam Case → identyczny White Box (determinizm).
- Każda wartość w White Box posiada jawne źródło (parametr z ENM, wzór, norma).
- White Box jest niemutowalny po wygenerowaniu.
- Dowody obliczeniowe (Proof Documents) są generowane z White Box Trace.

**Łańcuch parametrów (Decision #15, #16, #18):** White Box MUSI odtwarzać pełny łańcuch:
```
typ katalogowy (snapshot) → override (jeśli tryb ekspert) → parametry zmienne → ilość → model solvera → wynik
```

---

### SLD (Single Line Diagram — schemat jednokreskowy)

**Definicja:** Graficzna, uproszczona reprezentacja topologii sieci elektroenergetycznej. W systemie MV-DESIGN-PRO SLD jest WYŁĄCZNIE projekcją wizualną ENM.

**Inwarianty:**
- Mapowanie 1:1: jeden symbol SLD = jeden byt ENM.
- SLD NIE tworzy bytów fizycznych — fizyka istnieje wyłącznie w ENM.
- SLD NIE wpływa na solver — solver odczytuje ENM, nie SLD.
- Edycja elementu w SLD = edycja odpowiadającego bytu w ENM (przez wspólne API).
- SLD wspiera nakładki wyników (overlays): zwarcia, rozpływy, zabezpieczenia.

**Tryby geometrii:** AUTO (automatyczny layout), CAD (ręczna geometria), HYBRID (auto + nadpisania CAD).

---

## 1.6 Zasady interpretacji dokumentu

### 1.6.1 Słowa kluczowe

Niniejsza specyfikacja stosuje następujące słowa kluczowe w znaczeniu zgodnym z RFC 2119:

| Słowo kluczowe | Znaczenie |
|---|---|
| **MUSI** / **MUST** | Wymaganie bezwzględne. Implementacja niezgodna jest błędem. |
| **NIE WOLNO** / **MUST NOT** | Zakaz bezwzględny. Naruszenie jest błędem. |
| **POWINIEN** / **SHOULD** | Zalecenie. Odstępstwo wymaga uzasadnienia w ADR. |
| **NIE POWINIEN** / **SHOULD NOT** | Zalecenie negatywne. Zastosowanie wymaga uzasadnienia. |
| **MOŻE** / **MAY** | Opcja. Implementacja lub brak implementacji nie stanowi błędu. |

### 1.6.2 Status zapisów

Każdy zapis w specyfikacji ma jeden z dwóch statusów:

| Status | Oznaczenie | Znaczenie |
|---|---|---|
| **BINDING** | Brak dodatkowego oznaczenia lub jawny tekst `(BINDING)` | Wiążący. Implementacja MUSI być zgodna. |
| **OPISOWY** | Kontekst, przykłady, uzasadnienia | Informacyjny. Pomaga w zrozumieniu, nie stanowi wymagania. |

W przypadku sprzeczności między zapisem BINDING a zapisem OPISOWYM, zapis BINDING jest nadrzędny.

### 1.6.3 Status AS-IS vs TO-BE

Zgodnie z polityką specyfikacyjną (SPEC_EXPANSION_PLAN §0):

| Status | Znaczenie |
|---|---|
| **AS-IS** | Odzwierciedla aktualny stan kodu 1:1. Podlega Definition of Done. |
| **TO-BE** | Planowana zmiana, jeszcze niezaimplementowana. NIE podlega DoD. Oznaczona etykietą: `> **TO-BE** — nie zaimplementowane.` |

ZAKAZ mieszania AS-IS i TO-BE w jednym kontrakcie.

### 1.6.4 Nadrzędność rozdziałów

W przypadku sprzeczności między rozdziałami specyfikacji obowiązuje następująca kolejność nadrzędności:

1. **Rozdział 1** (niniejszy) — cel, zakres, definicje kanoniczne
2. **SPEC_00** — warstwy architektury
3. **SPEC_02** — model ENM Core
4. **Rozdziały szczegółowe** — solvery, walidacja, kreator, SLD

Rozdział nadrzędny unieważnia sprzeczny zapis rozdziału podrzędnego.

### 1.6.5 Zakaz interpretacji implementacyjnych

Implementacja NIE MOŻE interpretować specyfikacji w sposób:
- rozszerzający zakres ponad jawnie zdefiniowany,
- zawężający wymagania BINDING,
- dodający funkcjonalność niezdefiniowaną w specyfikacji,
- pomijający walidacje wymagane przez specyfikację.

Wątpliwości interpretacyjne MUSZĄ być rozstrzygane przez Architecture Decision Record (ADR), nie przez decyzję implementacyjną.

---

## 1.7 Status dokumentu

### 1.7.1 Charakter dokumentu

Niniejszy dokument ma charakter **kanoniczny i wiążący**. Stanowi nadrzędne źródło prawdy dla:
- celu i zakresu systemu MV-DESIGN-PRO,
- definicji pojęć używanych w systemie,
- zasad interpretacji specyfikacji.

### 1.7.2 Zgodność implementacji

Każda implementacja (backend, frontend, API, testy) MUSI być zgodna z niniejszym rozdziałem. Niezgodność implementacji z Rozdziałem 1 stanowi defekt wymagający naprawy.

### 1.7.3 Procedura zmian

Zmiany w niniejszym rozdziale wymagają:
1. Formalnego Architecture Decision Record (ADR) z uzasadnieniem.
2. Aktualizacji Decision Matrix w `AUDIT_SPEC_VS_CODE.md`.
3. Weryfikacji spójności z pozostałymi rozdziałami specyfikacji.
4. Akceptacji przez System Architect.

---

## 1.8 Zakazy globalne

Poniższe zakazy obowiązują we WSZYSTKICH warstwach systemu i we WSZYSTKICH rozdziałach specyfikacji. Naruszenie któregokolwiek z nich stanowi defekt architektoniczny.

### 1.8.1 Zakaz zgadywania danych

System NIE MOŻE uzupełniać brakujących danych domyślnymi wartościami, heurystykami ani interpolacjami. Każdy parametr wejściowy MUSI być jawnie podany przez użytkownika lub wynikać z wybranego typu katalogowego.

Jeśli dane są niekompletne, system MUSI:
- wskazać brak (kod walidacji E/W/I),
- zablokować obliczenia (jeśli brak jest krytyczny — kod E),
- poinformować użytkownika o wymaganym uzupełnieniu.

### 1.8.2 Zakaz skrótów myślowych w ENM

Model ENM MUSI odzwierciedlać rzeczywistą topologię fizyczną sieci. Niedozwolone jest:
- pomijanie elementów toru zasilania (np. przyłączenie odbioru bezpośrednio do szyny bez pola odpływowego),
- tworzenie domyślnych/ukrytych elementów (np. transformator „w tle"),
- agregowanie elementów (np. „N generatorów jako jeden"),
- stosowanie skrótów topologicznych (np. bezpośrednie przyłączenie falownika do szyny SN z pominięciem transformatora nn/SN).

### 1.8.3 Zakaz edycji fizyki sieci z poziomu SLD

SLD jest projekcją wizualną ENM. Edycja elementu w SLD oznacza edycję odpowiadającego bytu w ENM. SLD NIE MOŻE:
- tworzyć bytów fizycznych nieistniejących w ENM,
- modyfikować parametrów fizycznych bez odzwierciedlenia w ENM,
- wpływać na wyniki solvera inaczej niż przez modyfikację ENM.

### 1.8.4 Zakaz mieszania danych projektowych z obliczeniowymi

Dane projektowe (ENM — topologia, parametry urządzeń) i dane obliczeniowe (wyniki solvera, ślad White Box) MUSZĄ być rozdzielone:
- ENM nie zawiera wyników obliczeń.
- Wyniki nie zawierają danych projektowych (poza referencjami do ENM).
- Case nie przechowuje danych o sieci — tylko konfigurację obliczeniową.

### 1.8.5 Zakaz niejawności źródła parametru

Każdy parametr używany w obliczeniach MUSI mieć jawne, audytowalne źródło:
- parametr znamionowy → typ katalogowy (`ParameterSource.TYPE_REF`),
- parametr nadpisany → tryb ekspert (`ParameterSource.OVERRIDE`),
- parametr zmiennej instancji → kreator / edytor (`ParameterSource.INSTANCE`).

White Box MUSI jednoznacznie wskazywać źródło każdego parametru w dowodzie obliczeniowym. Parametr bez jawnego źródła jest defektem.

---

## 1.9 Relacja do kolejnych rozdziałów

### 1.9.1 Zasada rozwijania

Kolejne rozdziały specyfikacji (SPEC_00 — SPEC_16) **rozwijają i uszczegóławiają** ustalenia niniejszego Rozdziału 1:
- SPEC_00 uszczegóławia hierarchię warstw (§1.4),
- SPEC_01 uszczegóławia terminologię (§1.5),
- SPEC_02 uszczegóławia model ENM (§1.5: ENM, Bus, Instancja, Typ),
- SPEC_07 uszczegóławia walidację (§1.3.1.D),
- SPEC_09 uszczegóławia White Box (§1.5: White Box),
- SPEC_10, SPEC_11 uszczegóławiają solvery (§1.5: Solver),
- SPEC_13 uszczegóławia kreator (§1.4: Kreator).

### 1.9.2 Zasada spójności

Niezgodność dowolnego rozdziału szczegółowego z Rozdziałem 1 unieważnia sprzeczny zapis rozdziału szczegółowego. W przypadku wykrycia niezgodności:
1. Implementacja MUSI stosować się do Rozdziału 1 (nadrzędny).
2. Niezgodność MUSI być zgłoszona jako defekt specyfikacji.
3. Rozwiązanie wymaga ADR.

### 1.9.3 Zakaz autonomii implementacyjnej

Żaden rozdział szczegółowy ani żadna implementacja NIE MOŻE wprowadzać:
- nowych bytów fizycznych nieopisanych w ENM (§1.5),
- nowych warstw nieopisanych w hierarchii (§1.4),
- nowych źródeł prawdy poza ENM (§1.4.1),
- nowych ścieżek modyfikacji fizyki sieci poza zdefiniowanymi (§1.4.3).

---

**KONIEC ROZDZIAŁU 1**

---

*Dokument kanoniczny. Wersja 1.0. Zatwierdzenie wymagane przed przejściem do kolejnych rozdziałów.*

