# UI Canonical Parity Guidelines

**Reference:** SYSTEM_SPEC.md Section 18, ARCHITECTURE.md Section 14, **wizard_screens.md (KANONICZNY)**  
**Status:** CANONICAL

> **UWAGA:** Niniejszy dokument jest spójny z `wizard_screens.md` (wersja 2.0) i nie duplikuje jego treści.
> Szczegółowe specyfikacje ekranów, formularzy i pól znajdują się w dokumencie kanonicznym Wizard.

---

## A. Tryby Pracy (Operating Modes)

**Referencja:** wizard_screens.md § 1.2

System operuje w trzech rozłącznych trybach pracy. Przełączanie między trybami jest jawne.

| Tryb | Identyfikator | Stan modelu | Stan przypadku | Stan wyników | Dozwolone akcje |
|------|---------------|-------------|----------------|--------------|-----------------|
| **Edycja Modelu** | MODEL_EDIT | MUTOWALNY | N/A | NIEAKTYWNE (UKRYTE) | Dodawanie, edycja, usuwanie elementów |
| **Konfiguracja Przypadku** | CASE_CONFIG | TYLKO DO ODCZYTU | MUTOWALNY | UKRYTE | Parametryzacja przypadku, obliczenia |
| **Wyniki** | RESULT_VIEW | TYLKO DO ODCZYTU | TYLKO DO ODCZYTU | WIDOCZNE | Przeglądanie, eksport, porównanie |

### A.1 Blokady i przejścia

| Przejście | Warunek | Efekt uboczny |
|-----------|---------|---------------|
| MODEL_EDIT → CASE_CONFIG | Model zwalidowany (brak ERROR) | — |
| CASE_CONFIG → MODEL_EDIT | Jawna akcja użytkownika | Ostrzeżenie: wyniki mogą stać się OUTDATED |
| CASE_CONFIG → RESULT_VIEW | Obliczenia zakończone sukcesem | — |
| RESULT_VIEW → MODEL_EDIT | Jawna akcja użytkownika | Wyniki zachowują stan OUTDATED |

### A.2 Pasek stanu aktywnego przypadku

**Referencja:** wizard_screens.md § 1.3

Pasek stanu przypadku jest ZAWSZE widoczny i pokazuje:
- Nazwę i typ aktywnego przypadku
- Stan wyników (NONE / FRESH / OUTDATED)
- Przyciski: [Zmień przypadek ▼] [Oblicz] [Wyniki]

**REGUŁA BLOKADY:** Brak aktywnego przypadku → przycisk [Oblicz] NIEAKTYWNY.

---

## B. Lifecycle obliczeń (Calculation Lifecycle)

### B.1 Jawny krok obliczeniowy (Explicit Calculate Step)

Calculations MUST be explicitly triggered by the user:

```text
User clicks "Calculate"
        │
        ▼
NetworkValidator.validate()
        │
        ├── INVALID → Display errors, BLOCK solver
        │
        └── VALID
              │
              ▼
        Solver.solve()
              │
              ▼
        Results stored, state = FRESH
```

**Rules:**
- Solver MUST NOT run automatically on model change
- User MUST explicitly initiate calculation
- Invalid model MUST block solver execution (no override)

### B.2 Stany świeżości wyników (Result Freshness States)

| State | Description | User Action Required |
|-------|-------------|---------------------|
| **NONE** | Never computed | Run calculation |
| **FRESH** | Results current with model | None |
| **OUTDATED** | Model changed since computation | Re-run calculation |

**State Transitions:**

```text
NONE ────────────► FRESH (after successful calculation)
                      │
                      │ (model change)
                      ▼
                  OUTDATED ────────► FRESH (after re-calculation)
                      │
                      │ (model change)
                      └──────────────► OUTDATED (stays outdated)
```

### B.3 Blokada obliczeń przy błędach walidacji

When NetworkValidator reports errors:

| Condition | Solver State | User Message |
|-----------|--------------|--------------|
| Validation ERROR | BLOCKED | "Model invalid. Fix errors before calculation." |
| Validation WARNING only | ALLOWED | "Warnings present. Proceed with calculation?" |
| Valid (no issues) | ALLOWED | (no message) |

---

## C. Semantyka `in_service` (In Service Semantics)

### C.1 Definicja

The `in_service` flag determines element participation in calculations:

| `in_service` Value | Solver Behavior | SLD Appearance |
|--------------------|-----------------|----------------|
| `True` | Element INCLUDED in calculation | Normal display |
| `False` | Element EXCLUDED from calculation | Grayed out, dashed |

### C.2 Wyświetlanie elementów wyłączonych

Elements with `in_service = False`:

```text
┌─────────────────────────────────────────┐
│ In Service (normal):                    │
│                                         │
│   ════════════════════  (solid line)    │
│                                         │
│ Out of Service:                         │
│                                         │
│   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  (dashed, gray)  │
│                                         │
└─────────────────────────────────────────┘
```

**Rules:**
- Out-of-service elements MUST remain visible in SLD
- Out-of-service elements MUST be visually distinguished (grayed)
- Out-of-service elements MUST be excluded from solver input

### C.3 Rozróżnienie: `in_service` vs stan łącznika (Switch.state)

| Property | Meaning | Affects Topology |
|----------|---------|------------------|
| `in_service = False` | Element does not exist for solver | Yes (removed) |
| `Switch.state = OPEN` | Connection interrupted | Yes (disconnected) |
| `Switch.state = CLOSED` | Connection active | No |

**Critical Distinction:**
- `in_service` removes the element entirely from solver consideration
- `Switch.OPEN` only interrupts the topological path (switch still exists)

---

## D. Siatka Właściwości (Property Grid)

**Referencja:** wizard_screens.md § 2.4, § 3

### D.1 Kanoniczna struktura pól

Each element type has a canonical, fixed set of fields:

| Field Category | Examples | Source |
|----------------|----------|--------|
| Identity | id, name | User input |
| Topology | from_bus_id, to_bus_id | User input |
| Electrical (direct) | length_km | User input |
| Electrical (from Type) | r_ohm_per_km, x_ohm_per_km | Catalog (read-only) |
| Status | in_service | User input |

### D.2 Wyświetlanie jednostek

**OBOWIĄZKOWE:** Każde pole numeryczne MUSI wyświetlać jednostkę:

| Field | Display Format |
|-------|----------------|
| Length | `0.350 km` |
| Resistance | `0.206 Ω/km` |
| Reactance | `0.080 Ω/km` |
| Current | `270 A` |
| Voltage | `15.0 kV` |
| Power | `10.0 MVA` |

### D.3 Deterministyczna kolejność pól

**OBOWIĄZKOWE:** Kolejność wyświetlania pól MUSI być deterministyczna:

1. **Identyfikacja** (nazwa, id, UUID)
2. **Stan** (w eksploatacji, cykl życia)
3. **Topologia** (szyna początkowa, szyna końcowa)
4. **Referencja typu** (`type_ref` → Katalog) — **TYLKO DO ODCZYTU**
5. **Parametry elektryczne z typu** (R', X', Sn, Un z katalogu) — **TYLKO DO ODCZYTU**
6. **Parametry lokalne** (długość, pozycja zaczepu) — edytowalne
7. **Wartości obliczeniowe** — **TYLKO DO ODCZYTU**, źródło: wyniki analizy
8. **Stan walidacji** — komunikaty błędów/ostrzeżeń
9. **Metadane audytowe** — **TYLKO DO ODCZYTU**

### D.4 Atrybut `type_ref` i parametry typu

**Referencja:** wizard_screens.md § 6.8.6

| Źródło parametru | Edytowalność w Property Grid | Przykład |
|------------------|------------------------------|----------|
| `type_ref` → Katalog | TYLKO DO ODCZYTU | Sn, Un, R', X' z typu przewodu |
| Lokalne (instancja) | Edytowalne | długość, pozycja zaczepu, setpointy P/Q |

**INVARIANT:** Parametry pochodzące z `type_ref` NIE MOGĄ być edytowane w Property Grid pojedynczego elementu — zmiana wymaga edycji typu w Katalogu.

---

## E. Filozofia walidacji (Validation Philosophy)

**Referencja:** wizard_screens.md § 6.10, § 11

### E.1 Poziomy ważności komunikatów

| Severity | Meaning | Solver Impact |
|----------|---------|---------------|
| **ERROR** | Critical issue | BLOCKS solver |
| **WARNING** | Non-critical issue | Solver allowed (with confirmation) |

### E.2 Zakaz automatycznej naprawy (No Auto-Repair)

**ZABRONIONE:**
- Automatyczna korekta nieprawidłowych wartości
- Ciche ustawianie wartości domyślnych dla brakujących parametrów
- „Inteligentne" poprawki bez zgody użytkownika

**WYMAGANE:**
- Wyświetlenie komunikatu błędu z opisem problemu
- Użytkownik MUSI ręcznie poprawić problem
- Ponowna walidacja po korekcie

**INVARIANT:** System NIGDY nie modyfikuje danych wejściowych użytkownika bez jawnej akcji.

### E.3 Format komunikatów walidacji

```text
[ERROR] bus.voltage_valid: Bus "Bus_001" voltage must be > 0 (current: 0.0 kV)
[ERROR] network.source_present: Network requires at least one Source
[WARNING] branch.high_loading: Line "Line_005" may exceed thermal rating
```

---

## F. Determinizm i audyt (Determinism and Audit)

**Referencja:** wizard_screens.md § 1.4

### F.1 Deterministyczne obliczenia

**INVARIANT:** Same input MUST produce same output, always.

```text
NetworkSnapshot_A + CaseParameters_A → Result_A

If NetworkSnapshot_A == NetworkSnapshot_B
   AND CaseParameters_A == CaseParameters_B
THEN Result_A == Result_B (identical)
```

### F.2 Zakaz losowości

**ZABRONIONE:**
- Generowanie liczb losowych w solverach
- Niedeterministyczny wybór algorytmów
- Zmienność obliczeń zależna od czasu
- Zachowanie zmiennoprzecinkowe zależne od platformy (gdzie możliwe do uniknięcia)

### F.3 Wymagania śladu audytowego

Każde obliczenie MUSI wytworzyć:

| Artifact | Content |
|----------|---------|
| Input Snapshot | Frozen NetworkModel state |
| Parameters | All solver configuration |
| Intermediate Values | Y-bus matrix, impedances, iterations |
| Output Results | Final calculated values |
| Trace | Step-by-step calculation log |

### F.4 Ręczna weryfikacja

**WYMAGANE:** Każdy krok obliczeniowy MUSI być możliwy do ręcznego odtworzenia:

```text
Given: WhiteBoxTrace with intermediate values
User can: Verify any step with calculator/spreadsheet
Result: Exact match between manual and solver computation
```

---

## G. Integracja z SLD

**Referencja:** sld_rules.md, wizard_screens.md § 2.3

Schemat jednokreskowy (SLD) jest zintegrowany z systemem trybów pracy:

| Tryb systemowy | Tryb SLD | Dozwolone akcje na SLD |
|----------------|----------|------------------------|
| MODEL_EDIT | Tryb edycji | Dodawanie, usuwanie, przeciąganie symboli |
| CASE_CONFIG | Tryb edycji (read-only model) | Brak edycji topologii |
| RESULT_VIEW | Tryb wyników | Tylko przeglądanie, nakładki wyników WIDOCZNE |

**BINDING:** Wyniki są wyświetlane jako **overlay** z warstwy Analysis — NIE modyfikują symboli SLD ani NetworkModel.

---

**KONIEC WYTYCZNYCH CANONICAL UI PARITY**
