# Zasady SLD (schemat jednokreskowy)

**Referencja:** SYSTEM_SPEC.md § 9 i § 18, **wizard_screens.md (KANONICZNY)**
**Status:** KANONICZNY

> **UWAGA:** Niniejszy dokument jest spójny z `wizard_screens.md` (wersja 2.0) i `ui_canonical_parity.md`.
> Tryby pracy SLD są 1:1 zmapowane na tryby systemowe opisane w Wizard.

---

## A. Zasady SLD

### A.1 Bijekcja: symbol ↔ obiekt modelu

**INWARIANT:** Każdy symbol SLD odpowiada dokładnie JEDNEMU obiektowi NetworkModel.

```
┌─────────────────────────────────────────────────────────────┐
│                     NetworkModel                             │
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐        │
│  │ Bus_1 │ │ Bus_2 │ │Line_1 │ │Trafo_1│ │Source1│        │
│  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘        │
│      ↕         ↕         ↕         ↕         ↕             │
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐        │
│  │Symbol │ │Symbol │ │Symbol │ │Symbol │ │Symbol │        │
│  │ Bus_1 │ │ Bus_2 │ │Line_1 │ │Trafo_1│ │Source1│        │
│  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘        │
│                        SLD Layer                            │
└─────────────────────────────────────────────────────────────┘
```

### A.2 Typy symboli

| Obiekt modelu | Symbol SLD | Reprezentacja wizualna |
|--------------|------------|------------------------|
| Bus | BusSymbol | Pozioma szyna (busbar) |
| LineBranch | LineSymbol | Pojedyncza linia ze znacznikami |
| TransformerBranch | TransformerSymbol | Okrąg(i) z uzwojeniami |
| Switch | SwitchSymbol | Symbol rozłącznika (otwarty/zamknięty) |
| Source | SourceSymbol | Okrąg ze strzałką (sieć) |
| Load | LoadSymbol | Trójkąt (pobór) |

### A.3 Brak obiektów pomocniczych

**ZAKAZANE:**
- Punkty połączeń bez odpowiadającej im szyny (Bus)
- Linie połączeń bez odpowiadającej im gałęzi (Branch)
- Symbole adnotacyjne z ukrytym znaczeniem elektrycznym
- Ramki grupujące z znaczeniem elektrycznym

**DOZWOLONE:**
- Etykiety tekstowe (czysta adnotacja, bez semantyki)
- Współrzędne położenia (tylko layout)
- Warstwy/grupowanie dla porządku wizualnego (bez znaczenia elektrycznego)

### A.4 Brak symboli wirtualnych

**ZAKAZANE:**

| Symbol wirtualny | Dlaczego zakazany | Poprawne podejście |
|------------------|------------------|-------------------|
| "Virtual Bus" | Brak obiektu modelu | Dodaj rzeczywisty Bus do modelu |
| "BoundaryNode Marker" | BoundaryNode – węzeł przyłączenia jest interpretacją | Nakładka z warstwy Analysis |
| "Boundary Line" | Brak znaczenia fizycznego | Nakładka z warstwy Analysis |
| "Aggregated Feeder" | Ukrywa topologię | Pokazuj elementy indywidualnie |

---

## B. Wyniki (prezentacja)

### B.1 Wyniki jako nakładka

Wyniki solvera MUSZĄ być prezentowane jako nakładka na SLD, a NIE jako modyfikacje symboli:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Warstwa bazowa (symbole SLD):                             │
│                                                             │
│   ════╦════════════════════╦════                           │
│       ║                    ║                                │
│                                                             │
│   Warstwa nakładki (wyniki):                                │
│                                                             │
│      [I=125A]           [I=98A]                            │
│      [U=14.8kV]         [U=15.1kV]                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### B.2 Nakładka = warstwa Analysis

Nakładki wyników są generowane przez warstwę Analysis, nie przez Solver:

| Źródło danych | Typ nakładki | Zawartość |
|---------------|--------------|-----------|
| PowerFlowResult | Adnotacje prądów | Wartości I na gałęziach |
| PowerFlowResult | Adnotacje napięć | Wartości U na szynach |
| ThermalAnalysis | Kolory obciążenia | Czerwony/żółty/zielony |
| VoltageAnalysis | Markery przekroczeń | Przekroczenie/obniżenie napięcia |
| BoundaryIdentifier | Znak BoundaryNode | Wskaźnik granicy |

### B.3 Brak wyników w modelu

**BINDING:** Wyniki solvera NIE MOGĄ być zapisywane do NetworkModel:

| Zabronione | Poprawne podejście |
|-----------|--------------------|
| `Bus.calculated_voltage = 14.8` | Zapisz w PowerFlowResult |
| `Branch.calculated_current = 125` | Zapisz w PowerFlowResult |
| `Bus.is_connection_node = True` | Nakładka BoundaryIdentifier |

**Uzasadnienie:** NetworkModel opisuje topologię fizyczną. Wyniki są ulotnymi rezultatami obliczeń.

---

## C. Tryby pracy SLD (Operating Modes)

**Referencja:** wizard_screens.md § 1.2, § 2.3

Tryby SLD są **1:1 zmapowane** na tryby systemowe Wizard:

| Tryb systemowy | Tryb SLD | Opis |
|----------------|----------|------|
| MODEL_EDIT | Tryb edycji | Pełna edycja topologii |
| CASE_CONFIG | Tryb edycji (model read-only) | Brak zmian topologii, konfiguracja przypadku |
| RESULT_VIEW | Tryb wyników | Tylko przeglądanie, nakładki aktywne |

### C.1 Tryb edycji (MODEL_EDIT / CASE_CONFIG)

W Trybie edycji SLD pozwala na modyfikację modelu (MODEL_EDIT) lub tylko przeglądanie (CASE_CONFIG):

| Akcja użytkownika | MODEL_EDIT | CASE_CONFIG |
|-------------------|------------|-------------|
| Kliknięcie symbolu | Zaznaczenie elementu | Zaznaczenie elementu |
| Podwójne kliknięcie | Otwórz Siatka Właściwości | Otwórz Siatka Właściwości (read-only) |
| Przeciąganie symbolu | Aktualizacja pozycji (tylko layout) | ZABLOKOWANE |
| Klawisz Delete | Usuń element z modelu | ZABLOKOWANE |
| Prawy przycisk | Menu kontekstowe (Dodaj/Edytuj/Usuń) | Menu kontekstowe (tylko Właściwości) |

**Stan w MODEL_EDIT:**
- Model: MUTOWALNY
- Wyniki: NIEAKTYWNE (unieważnione przy każdej zmianie)
- Nakładki: UKRYTE lub wyszarzone

### C.2 Tryb wyników (RESULT_VIEW)

W Trybie wyników SLD wyświetla wyniki bez możliwości edycji:

| Akcja użytkownika | Odpowiedź systemu |
|-------------------|-------------------|
| Kliknięcie symbolu | Pokaż szczegóły wyniku (tooltip/panel) |
| Podwójne kliknięcie | Otwórz Siatka Właściwości (TYLKO DO ODCZYTU) |
| Przeciąganie symbolu | ZABLOKOWANE |
| Klawisz Delete | ZABLOKOWANE |
| Prawy przycisk | Menu kontekstowe tylko do odczytu |

**Stan:**
- Model: TYLKO DO ODCZYTU
- Wyniki: WYŚWIETLANE (nakładki aktywne)
- Nakładki: Widoczne z adnotacjami

### C.3 Przełączanie trybów

```
MODEL_EDIT ◄─────────► CASE_CONFIG ◄─────────► RESULT_VIEW
     │                      │                       │
     │ Walidacja OK         │ Obliczenia sukces     │
     └──────────────────────┴───────────────────────┘
                    │
                    │ Użytkownik klika [Edytuj model]
                    └───────────────────────────────►
                         Ostrzeżenie: wyniki OUTDATED
```

**Reguły:**
- Przełączenie do MODEL_EDIT MOŻE unieważnić wyniki (ostrzeżenie dla użytkownika)
- Przełączenie do RESULT_VIEW WYMAGA prawidłowych wyników (stan FRESH)
- Jeśli wyniki są OUTDATED, poproś użytkownika o ponowne obliczenie

---

## D. Kodowanie stanu wizualnego

### D.1 Stany elementów

| Stan | Kodowanie wizualne |
|------|---------------------|
| Normalny (`in_service=True`) | Standardowe kolory, linie ciągłe |
| Wyłączony (`in_service=False`) | Szary, linie przerywane |
| Zaznaczony | Podświetlona ramka, widoczne uchwyty |
| Hover | Delikatne podświetlenie |
| Błąd (walidacja) | Czerwona ramka/podświetlenie |

### D.2 Stany łączników

| Stan | Symbol |
|------|--------|
| CLOSED | Symbol połączenia (──●──) |
| OPEN | Symbol rozłączenia (── ──) |

### D.3 Nakładki wyników

| Wynik analizy | Kodowanie wizualne |
|---------------|---------------------|
| Obciążenie 0-80% | Zielony |
| Obciążenie 80-100% | Żółty |
| Obciążenie >100% | Czerwony |
| Napięcie w normie | Brak markera |
| Przekroczenie napięcia | Czerwony marker |
| Granica BoundaryNode – punktu wspólnego przyłączenia | Linia przerywana (nakładka) |

---

## E. Wzorce interakcji

### E.1 Zaznaczanie

| Akcja | Rezultat |
|-------|----------|
| Pojedyncze kliknięcie | Zaznacz pojedynczy element |
| Ctrl+klik | Dodaj do zaznaczenia |
| Klik w pusty obszar | Odznacz wszystko |
| Przeciągnięcie prostokąta | Zaznacz elementy w obszarze |

### E.2 Menu kontekstowe (tryb edycji)

```
┌─────────────────────┐
│ Dodaj szynę         │
│ Dodaj linię         │
│ Dodaj transformator │
│ ─────────────────── │
│ Właściwości...      │
│ ─────────────────── │
│ W eksploatacji [✓]  │
│ ─────────────────── │
│ Usuń                │
└─────────────────────┘
```

### E.3 Menu kontekstowe (tryb wyników)

```
┌─────────────────────┐
│ Pokaż właściwości...│
│ ─────────────────── │
│ Pokaż szczegóły...  │
│ Eksportuj wyniki... │
└─────────────────────┘
```

---

## F. Źródła konwerterowe (PV/WIND/BESS) — zasady SLD

### F.1 Symbolika i mapowanie

Źródła konwerterowe (PV, WIND, BESS) są reprezentowane jako warianty symbolu Source:

| Typ źródła | Symbol SLD | Obiekt modelu | Opis |
|------------|------------|---------------|------|
| **PV** | SourceSymbol (wariant PV) | Source (converter_kind=PV) | Fotowoltaika |
| **WIND** | SourceSymbol (wariant WIND) | Source (converter_kind=WIND) | Elektrownia wiatrowa |
| **BESS** | SourceSymbol (wariant BESS) | Source (converter_kind=BESS) | Magazyn energii |

**INWARIANT (mapowanie 1:1):** Każdy symbol źródła konwerterowego odpowiada dokładnie jednemu obiektowi Source w NetworkModel. Brak obiektów pomocniczych.

### F.2 Etykieta symbolu (Symbol Label)

Etykieta źródła konwerterowego MUSI zawierać:

```
┌─────────────────────────────┐
│ [Nazwa] ([Typ])             │
│ Sn = [wartość] MVA          │
│ Un = [wartość] kV           │
└─────────────────────────────┘
```

| Element etykiety | Źródło danych | Przykład |
|------------------|---------------|----------|
| Nazwa | Source.name | "PV-DACH-01" |
| Typ | Source.converter_kind | "PV" / "WIND" / "BESS" |
| Sn | Catalog (type_ref) | "2.5 MVA" |
| Un | Catalog (type_ref) | "0.4 kV" |

**Determinizm:** Kolejność elementów etykiety jest stała. Kolejność legend i list źródeł MUSI być deterministyczna (np. alfabetycznie po nazwie).

### F.3 Stany i widoczność

#### F.3.1 Stan `in_service`

| `in_service` | Widoczność SLD | Solver | Opis |
|--------------|----------------|--------|------|
| `True` | Normalny wygląd | Uwzględniony | Element aktywny |
| `False` | Wyszarzony, linia przerywana | Pominięty | Element wyłączony z obliczeń |

**Reguła:** Element z `in_service = False` pozostaje widoczny na SLD, ale solver go nie widzi.

#### F.3.2 Brak impedancji w symbolu

Symbol źródła konwerterowego NIE zawiera impedancji. Parametry pracy (P, Q, cosφ) nie zmieniają topologii sieci — wpływają wyłącznie na bilans mocy.

### F.4 Nakładki wyników (RESULT_VIEW)

W trybie RESULT_VIEW overlay dla źródła konwerterowego pokazuje:

| Parametr | Jednostka | Opis |
|----------|-----------|------|
| P | MW | Moc czynna (wynik obliczeń) |
| Q | Mvar | Moc bierna (wynik obliczeń) |
| I | A | Prąd wypływający |
| Kierunek | → / ← | Kierunek przepływu mocy |

#### F.4.1 BESS — interpretacja znaku P w overlay

| Wynik P | Oznaczenie overlay | Interpretacja |
|---------|-------------------|---------------|
| P > 0 | → (strzałka od BESS) | Rozładowanie — eksport do sieci |
| P < 0 | ← (strzałka do BESS) | Ładowanie — pobór z sieci |

#### F.4.2 Status wyników (aktualność)

Nakładka MUSI wskazywać status wyników:

| Status | Oznaczenie UX | Opis |
|--------|---------------|------|
| **VALID** | Normalny kolor | Wyniki aktualne względem modelu |
| **OUTDATED** | Wyszarzenie / ostrzeżenie | Model zmieniony od ostatniego obliczenia |

### F.5 Zakazy

#### F.5.1 BoundaryNode – węzeł przyłączenia

**BINDING:** BoundaryNode NIE istnieje w NetworkModel ani jako obiekt SLD.

| Warstwa | Status BoundaryNode |
|---------|------------|
| NetworkModel | ZABRONIONY |
| SLD (symbol) | ZABRONIONY |
| Analysis (overlay) | DOZWOLONY — wyłącznie jako wynik analizy |

BoundaryNode może być wyświetlony wyłącznie jako overlay pochodzący z warstwy Analysis (BoundaryIdentifier), nigdy jako obiekt modelu.

#### F.5.2 Regulatorów i trybów dynamicznych

**ZABRONIONE w SLD (tryb statyczny):**
- Volt-VAR, Volt-Watt, droop
- Modele dynamiczne (RMS/EMT)
- Regulatory napięcia/mocy biernej
- Parametry inercji i stałych czasowych

### F.6 Deterministyczna prezentacja

| Element | Reguła sortowania |
|---------|-------------------|
| Lista źródeł w panelu | Alfabetycznie po nazwie |
| Legenda typów | Kolejność: PV → WIND → BESS |
| Etykiety na diagramie | Stała pozycja względem symbolu |
| Nakładka wyników | Stała kolejność: P, Q, I |

**INWARIANT:** Identyczny model MUSI generować identyczny widok SLD przy każdym renderowaniu.

---

## G. Integracja SLD ↔ Wizard

**Referencja:** wizard_screens.md § 2.3, § 4

### G.1 Zaznaczenie obiektu

| Akcja w SLD | Reakcja Wizard |
|-------------|----------------|
| Kliknięcie symbolu | Zaznaczenie w Drzewie Projektu + Siatka Właściwości pokazuje obiekt |
| Podwójne kliknięcie symbolu | Fokus na Siatka Właściwości z możliwością edycji (tryb MODEL_EDIT) |
| Zaznaczenie w Drzewie Projektu | Podświetlenie symbolu na SLD |

### G.2 Menu kontekstowe — mapowanie trybów

| Tryb | Dostępne opcje menu kontekstowego |
|------|-----------------------------------|
| MODEL_EDIT | Dodaj szynę, Dodaj linię, Dodaj transformator, Właściwości..., W eksploatacji [✓], Usuń |
| CASE_CONFIG | Właściwości... (read-only) |
| RESULT_VIEW | Pokaż właściwości..., Pokaż szczegóły wyników, Eksportuj wyniki... |

### G.3 Zakaz symboli wirtualnych

**BINDING (zgodnie z wizard_screens.md § 6.8.6):**

| Element | Status w NetworkModel | Status w SLD |
|---------|----------------------|--------------|
| Szyna (Bus) | Obiekt modelu | Symbol obowiązkowy |
| Linia (LineBranch) | Obiekt modelu | Symbol obowiązkowy |
| BoundaryNode – węzeł przyłączenia | **ZABRONIONY** | **ZABRONIONY** — wyłącznie overlay z Analysis |
| Granica sieci (Boundary) | **ZABRONIONY** | **ZABRONIONY** — wyłącznie overlay |

**INWARIANT:** BoundaryNode – węzeł przyłączenia może być wyświetlony wyłącznie jako **nakładka wyników** pochodząca z warstwy Analysis (np. BoundaryIdentifier), nigdy jako obiekt NetworkModel ani symbol bazowy SLD.

---

**KONIEC SPECYFIKACJI REGUŁ SLD**
