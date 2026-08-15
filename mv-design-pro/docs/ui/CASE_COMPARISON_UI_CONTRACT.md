# Case / Variant Comparison UI Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 2.x.6  
**Reference:** SYSTEM_SPEC.md, ARCHITECTURE.md, PLANS.md, CANONICAL_COMPLIANCE.md  
**Standard:** DIgSILENT benchmark / benchmark parity

---

## 1. Cel dokumentu

Niniejszy dokument definiuje **kanoniczny interfejs porównywania Case / Variant / Study**,
umożliwiający **inżynierską analizę różnic** zgodnie z praktyką DIgSILENT benchmark oraz benchmark.

**Pytanie fundamentalne:**
> **CO się zmieniło, GDZIE, o ILE i DLACZEGO?**

---

## 2. Definicje pojęć (BINDING)

### 2.1 Case (Przypadek obliczeniowy)

**Case** to zamrożony zestaw parametrów obliczeniowych + snapshot modelu + wyniki.

| Atrybut | Opis |
|---------|------|
| `case_id` | UUID przypadku |
| `case_name` | Nazwa czytelna dla użytkownika |
| `case_type` | Typ analizy: `SHORT_CIRCUIT` / `POWER_FLOW` |
| `network_snapshot_id` | UUID zamrożonego stanu modelu |
| `parameters` | Parametry obliczeniowe (c_max, fault_type, etc.) |
| `result_state` | Stan wyników: `NONE` / `FRESH` / `OUTDATED` |
| `created_at` | Timestamp utworzenia |
| `computed_at` | Timestamp ostatniego obliczenia |

### 2.2 Variant (Wariant)

**Variant** to Case z modyfikacjami topologii lub parametrów względem Case bazowego.

| Atrybut | Opis |
|---------|------|
| `base_case_id` | UUID przypadku bazowego |
| `variant_name` | Nazwa wariantu |
| `topology_changes` | Lista zmian topologii (dodane/usunięte/zmienione elementy) |
| `parameter_changes` | Lista zmian parametrów (setpointy, stany, type_ref) |

**INVARIANT:** Variant MUSI mieć powiązanie z Case bazowym. Brak orphan Variants.

### 2.3 Study (Studium)

**Study** to zbiór powiązanych Cases/Variants analizowanych wspólnie.

| Atrybut | Opis |
|---------|------|
| `study_id` | UUID studium |
| `study_name` | Nazwa studium |
| `cases` | Lista UUID Cases należących do studium |
| `comparison_config` | Konfiguracja porównań (elementy, metryki) |

---

## 3. Zakres porównań (MUST)

### 3.1 Obsługiwane typy porównań

| Typ porównania | Opis | Status |
|----------------|------|--------|
| Case A vs Case B | Porównanie dwóch przypadków | MUST |
| Case A vs Case B vs Case C | Porównanie wielokrotne (A/B/C/...) | MUST |
| Variant vs Base Case | Porównanie wariantu z bazą | MUST |
| Cross-Study Comparison | Porównanie Cases z różnych studiów | SHOULD |

### 3.2 Porównywane wielkości — Power Flow (PF)

| Wielkość | Symbol | Jednostka | Element | Formuła różnicy |
|----------|--------|-----------|---------|-----------------|
| Napięcie węzła | U | kV / p.u. | BUS | ΔU = U_B - U_A |
| Moc czynna przepływu | P | MW | LINE / TRAFO | ΔP = P_B - P_A |
| Moc bierna przepływu | Q | Mvar | LINE / TRAFO | ΔQ = Q_B - Q_A |
| Prąd linii | I | A | LINE / TRAFO | ΔI = I_B - I_A |
| Obciążenie termiczne | Loading | % | LINE / TRAFO | ΔLoading = Loading_B - Loading_A |
| Straty | P_loss | kW | LINE / TRAFO | ΔP_loss = P_loss_B - P_loss_A |

### 3.3 Porównywane wielkości — Short Circuit (SC)

| Wielkość | Symbol | Jednostka | Element | Formuła różnicy |
|----------|--------|-----------|---------|-----------------|
| Prąd zwarciowy początkowy | Ik″ | kA | BUS | ΔIk″ = Ik″_B - Ik″_A |
| Prąd udarowy | ip | kA | BUS | Δip = ip_B - ip_A |
| Prąd cieplny | Ith | kA | BUS | ΔIth = Ith_B - Ith_A |
| Impedancja Thevenina | Z_th | Ω | BUS | ΔZ_th = Z_th_B - Z_th_A |
| Współczynnik κ | κ | - | BUS | Δκ = κ_B - κ_A |

**BINDING (IEC 60909):** Porównania zwarciowe MUSZĄ być wykonywane **PER BUS**, NIE per linia.

### 3.4 Porównywane statusy

| Status | Opis | Prezentacja różnicy |
|--------|------|---------------------|
| `in_service` | Element w eksploatacji | `True → False`, `False → True` |
| `Switch.state` | Stan łącznika | `OPEN → CLOSED`, `CLOSED → OPEN` |
| `type_ref` | Referencja typu katalogowego | `TypeA → TypeB`, `None → TypeA` |

---

## 4. Widoki porównawcze (PF-grade)

### 4.1 Tabela porównań (Comparison Table)

**Struktura tabeli:**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        TABELA PORÓWNAŃ: Case A vs Case B                         │
├─────────────┬───────────┬────────────┬────────────┬──────────┬─────────┬────────┤
│ Element     │ Parametr  │  Case A    │  Case B    │    Δ     │   %Δ    │ Status │
├─────────────┼───────────┼────────────┼────────────┼──────────┼─────────┼────────┤
│ BUS_001     │ U [kV]    │   15.00    │   14.85    │  -0.15   │  -1.0%  │   ▼    │
│ BUS_002     │ U [kV]    │   15.00    │   15.12    │  +0.12   │  +0.8%  │   ▲    │
├─────────────┼───────────┼────────────┼────────────┼──────────┼─────────┼────────┤
│ LINE_001    │ I [A]     │   125.3    │   142.7    │  +17.4   │ +13.9%  │   ▲    │
│ LINE_001    │ P [MW]    │    2.45    │    2.78    │  +0.33   │ +13.5%  │   ▲    │
│ LINE_001    │ Q [Mvar]  │    0.82    │    0.94    │  +0.12   │ +14.6%  │   ▲    │
├─────────────┼───────────┼────────────┼────────────┼──────────┼─────────┼────────┤
│ TRAFO_001   │ Loading % │   72.5     │   85.3     │  +12.8   │ +17.7%  │   ⚠    │
├─────────────┼───────────┼────────────┼────────────┼──────────┼─────────┼────────┤
│ SW_001      │ State     │   OPEN     │  CLOSED    │    —     │    —    │ ZMIANA │
└─────────────┴───────────┴────────────┴────────────┴──────────┴─────────┴────────┘
```

**Kolumny OBOWIĄZKOWE:**

| Kolumna | Opis | Sortowanie |
|---------|------|------------|
| Element | Identyfikator elementu (nazwa + typ) | Alfabetycznie |
| Parametr | Nazwa wielkości + jednostka | Stała kolejność |
| Case A | Wartość w Case A | - |
| Case B | Wartość w Case B | - |
| Δ | Różnica absolutna (B - A) | Malejąco wg |Δ| |
| %Δ | Różnica procentowa ((B-A)/A × 100%) | Malejąco wg |%Δ| |
| Status | Indykator kierunku zmiany | - |

**Indykatory statusu:**

| Indykator | Znaczenie |
|-----------|-----------|
| ▲ | Wzrost wartości |
| ▼ | Spadek wartości |
| ⚠ | Przekroczenie progu ostrzeżenia |
| ✖ | Przekroczenie progu błędu |
| = | Brak zmiany (opcjonalnie ukryte) |
| ZMIANA | Zmiana stanu binarnego |
| N/A | Brak porównywalności |

### 4.2 Tabela porównań wielokrotnych (A/B/C/...)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                    TABELA PORÓWNAŃ: Case A vs Case B vs Case C                              │
├─────────────┬───────────┬──────────┬──────────┬──────────┬──────────┬──────────┬───────────┤
│ Element     │ Parametr  │  Case A  │  Case B  │  Case C  │ ΔA→B     │ ΔA→C     │ Range     │
├─────────────┼───────────┼──────────┼──────────┼──────────┼──────────┼──────────┼───────────┤
│ BUS_001     │ U [kV]    │  15.00   │  14.85   │  15.20   │  -0.15   │  +0.20   │ 0.35 kV   │
│ LINE_001    │ I [A]     │  125.3   │  142.7   │  118.2   │  +17.4   │   -7.1   │ 24.5 A    │
└─────────────┴───────────┴──────────┴──────────┴──────────┴──────────┴──────────┴───────────┘
```

**Kolumna Range:** Zakres wartości max - min dla danego elementu/parametru.

### 4.3 Overlay różnic na SLD (Difference Overlay)

**Zasada:** Różnice są prezentowane jako **nakładka** na diagramie SLD, **BEZ modyfikacji warstwy CAD**.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SLD — OVERLAY PORÓWNANIA                      │
│                                                                 │
│   Warstwa bazowa (SLD):                                         │
│   ════╦════════════════════╦════                               │
│       ║                    ║                                    │
│                                                                 │
│   Warstwa overlay (różnice):                                    │
│                                                                 │
│      [ΔU=-0.15kV]       [ΔU=+0.12kV]                           │
│         ▼                   ▲                                   │
│      ══════════════════════════                                 │
│           [ΔI=+17.4A ▲]                                        │
│                                                                 │
│   Legenda kolorów:                                             │
│   ▬▬▬ Zielony: zmiana ≤5%                                      │
│   ▬▬▬ Żółty:   zmiana 5-15%                                    │
│   ▬▬▬ Czerwony: zmiana >15%                                    │
└─────────────────────────────────────────────────────────────────┘
```

**BINDING:** Overlay różnic NIE modyfikuje symboli SLD ani NetworkModel.

**Kodowanie kolorystyczne overlay:**

| Próg %Δ | Kolor | Znaczenie |
|---------|-------|-----------|
| |%Δ| ≤ 5% | Zielony | Zmiana minimalna |
| 5% < |%Δ| ≤ 15% | Żółty | Zmiana umiarkowana |
| |%Δ| > 15% | Czerwony | Zmiana istotna |
| N/A | Szary | Brak porównywalności |

### 4.4 Panel przyczyn (WHY Panel)

**Cel:** Odpowiedź na pytanie **DLACZEGO** wartości się różnią.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PANEL PRZYCZYN RÓŻNIC                         │
├─────────────────────────────────────────────────────────────────┤
│ Element: LINE_001                                               │
│ Parametr: I [A]                                                 │
│ Δ = +17.4 A (+13.9%)                                           │
├─────────────────────────────────────────────────────────────────┤
│ PRZYCZYNY ZIDENTYFIKOWANE:                                      │
│                                                                 │
│ 1. ZMIANA TOPOLOGII                                             │
│    └─ SW_003 (Łącznik): OPEN → CLOSED                          │
│       Wpływ: Zmiana przepływu mocy na alternatywnej ścieżce    │
│                                                                 │
│ 2. ZMIANA STANU ELEMENTU                                        │
│    └─ LOAD_005: in_service True → False                        │
│       Wpływ: Zmniejszenie obciążenia na feederze               │
│                                                                 │
│ 3. ZMIANA PARAMETRÓW                                            │
│    └─ SOURCE_001: P_setpoint 5.0 MW → 6.2 MW                   │
│       Wpływ: Wzrost generacji wpływa na przepływ               │
│                                                                 │
│ 4. ZMIANA TYPU KATALOGOWEGO                                     │
│    └─ Brak zmian typu                                          │
├─────────────────────────────────────────────────────────────────┤
│ DIAGNOSTYKA:                                                    │
│ • Główna przyczyna: zmiana topologii (SW_003)                  │
│ • Współczynnik korelacji: 0.87                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Kategorie przyczyn (MUST):**

| Kategoria | Opis | Przykłady |
|-----------|------|-----------|
| **ZMIANA TOPOLOGII** | Zmiana struktury sieci | Switch OPEN→CLOSED, dodanie/usunięcie elementu |
| **ZMIANA STANU ELEMENTU** | Zmiana in_service | Element włączony/wyłączony |
| **ZMIANA PARAMETRÓW** | Zmiana setpointów | P, Q, tap_position, voltage setpoint |
| **ZMIANA TYPU KATALOGOWEGO** | Zmiana type_ref | Inny typ linii/transformatora |

---

## 5. Reguły porównań inżynierskich (BINDING)

### 5.1 Reguły IEC 60909 (Short Circuit)

| Reguła | Opis | Konsekwencja |
|--------|------|--------------|
| SC-CMP-001 | Porównania zwarciowe WYŁĄCZNIE per BUS | Porównywanie Ik″ na linii = ZABRONIONE |
| SC-CMP-002 | Zwarcie musi mieć ten sam typ | 3-fazowe vs 1-fazowe = NOT COMPARABLE |
| SC-CMP-003 | Współczynnik c musi być identyczny | c_max vs c_min = NOT COMPARABLE |
| SC-CMP-004 | Metoda obliczeniowa musi być identyczna | IEC-B vs IEC-C = NOT COMPARABLE |

### 5.2 Reguły Power Flow (PF)

| Reguła | Opis | Konsekwencja |
|--------|------|--------------|
| PF-CMP-001 | Przepływy liniowe per instancja (LINE/TRAFO) | ΔI, ΔP, ΔQ wzdłuż konkretnej linii |
| PF-CMP-002 | Napięcia per BUS | ΔU zawsze na węźle |
| PF-CMP-003 | Kierunek przepływu musi być uwzględniony | P > 0 (od), P < 0 (do) |
| PF-CMP-004 | Różne topologie = jawne oznaczenie | DIFFERENT TOPOLOGY w kolumnie Status |

### 5.3 Reguły porównywalności (Comparability)

| Sytuacja | Status | Działanie |
|----------|--------|-----------|
| Element istnieje w obu Cases | COMPARABLE | Oblicz Δ, %Δ |
| Element istnieje tylko w Case A | NOT IN B | Wyświetl "Element usunięty" |
| Element istnieje tylko w Case B | NOT IN A | Wyświetl "Element dodany" |
| Różna topologia (wyspy) | DIFFERENT TOPOLOGY | Wyświetl ostrzeżenie, Δ = N/A |
| Różny typ analizy | NOT COMPARABLE | Blokada porównania, komunikat błędu |
| Brak wyników (NONE/OUTDATED) | RESULTS REQUIRED | Wymagaj obliczenia przed porównaniem |

---

## 6. Kontekst i spójność (MUST)

### 6.1 Nagłówek porównania

**Każde porównanie MUSI jawnie pokazywać kontekst:**

```
┌─────────────────────────────────────────────────────────────────┐
│ PORÓWNANIE PRZYPADKÓW                                           │
├─────────────────────────────────────────────────────────────────┤
│ Case A:    SC_CASE_001 (Zwarcie na BUS_BoundaryNode)                     │
│ Case B:    SC_CASE_002 (Zwarcie na BUS_BoundaryNode — wariant bez SW_003)│
│ Run:       2026-01-28 19:45:12 / 2026-01-28 19:52:33           │
│ Analysis:  Short Circuit (IEC 60909, c_max=1.1)                │
│ Target:    BUS (Ik″, ip, Ith)                                  │
│ Snapshot:  snap_abc123 / snap_def456                           │
└─────────────────────────────────────────────────────────────────┘
```

**Pola kontekstu OBOWIĄZKOWE:**

| Pole | Opis |
|------|------|
| Case A / Case B | Nazwy porównywanych przypadków |
| Run | Timestamp ostatniego obliczenia |
| Analysis | Typ analizy (PF / SC) + parametry |
| Target | Typ elementów porównywanych (BUS / LINE) |
| Snapshot | Identyfikatory snapshotów modelu |

### 6.2 Integracja z Results Browser

| Akcja w Results Browser | Reakcja Comparison UI |
|-------------------------|----------------------|
| Wybór Case A | Ustawienie jako baza porównania |
| Wybór Case B | Ustawienie jako cel porównania |
| Kliknięcie "Porównaj" | Otwarcie widoku porównawczego |

### 6.3 Integracja z Element Inspector

| Akcja w Comparison Table | Reakcja Element Inspector |
|--------------------------|---------------------------|
| Kliknięcie wiersza elementu | Otwarcie Property Grid dla elementu |
| Kliknięcie "WHY" | Otwarcie panelu przyczyn dla elementu |

### 6.4 Integracja z Topology Tree

| Akcja w drzewie | Reakcja Comparison UI |
|-----------------|----------------------|
| Zaznaczenie elementu | Podświetlenie wiersza w tabeli |
| Rozwinięcie kategorii | Filtrowanie tabeli do kategorii |

---

## 7. Scenariusze poprawne (ALLOWED)

### 7.1 Scenariusz: Porównanie wpływu stanu łącznika

```
DANE WEJŚCIOWE:
- Case A: SC_CASE_BASE (SW_003 = OPEN)
- Case B: SC_CASE_VARIANT (SW_003 = CLOSED)
- Analiza: Short Circuit na BUS_007

WYNIK:
- Tabela pokazuje ΔIk″ na BUS_007
- WHY Panel wskazuje: "Zmiana topologii: SW_003 OPEN → CLOSED"
- Overlay na SLD koloruje BUS_007 i SW_003
```

### 7.2 Scenariusz: Porównanie wielokrotne scenariuszy obciążenia

```
DANE WEJŚCIOWE:
- Case A: PF_WINTER_PEAK (obciążenie zimowe szczytowe)
- Case B: PF_SUMMER_MIN (obciążenie letnie minimalne)
- Case C: PF_MAINTENANCE (z wyłączoną linią L5)
- Analiza: Power Flow

WYNIK:
- Tabela A/B/C z kolumną Range
- WHY Panel per element pokazuje różnice obciążeń i topologii
```

### 7.3 Scenariusz: Porównanie wariantu z bazą

```
DANE WEJŚCIOWE:
- Base Case: PF_BASELINE
- Variant: PF_BASELINE + nowy kabel C12
- Analiza: Power Flow

WYNIK:
- Tabela pokazuje wpływ nowego kabla na przepływy
- Nowe elementy oznaczone jako "NOT IN BASE"
- WHY Panel: "Element dodany: CABLE_012"
```

---

## 8. Scenariusze zabronione (FORBIDDEN)

### 8.1 Porównywanie wyników bez wskazania elementu

**FORBIDDEN:**
```
❌ "Ik″ wzrosło o 15%"  (Gdzie? Na jakim elemencie?)
```

**CORRECT:**
```
✓ "BUS_007: Ik″ wzrosło o 15% (z 12.5 kA do 14.4 kA)"
```

### 8.2 Porównywanie zwarć na linii zamiast na BUS

**FORBIDDEN:**
```
❌ Porównanie Ik″ na LINE_001 (linia nie ma Ik″ — zwarcie jest na BUS)
```

**CORRECT:**
```
✓ Porównanie Ik″ na BUS_FROM (początek linii) lub BUS_TO (koniec linii)
```

### 8.3 Porównywanie Cases różnych typów

**FORBIDDEN:**
```
❌ Porównanie Power Flow Case z Short Circuit Case
   Status: NOT COMPARABLE — różne typy analiz
```

### 8.4 Porównywanie bez aktualnych wyników

**FORBIDDEN:**
```
❌ Porównanie Case z result_state = OUTDATED
   Wymagane: Ponowne obliczenie przed porównaniem
```

### 8.5 Porównywanie z ukryciem przyczyn

**FORBIDDEN:**
```
❌ "Wartości się różnią" (bez wskazania przyczyny)
```

**CORRECT:**
```
✓ WHY Panel zawsze dostępny z listą zidentyfikowanych przyczyn
```

---

## 9. Wydruk i audyt (MUST)

### 9.1 Raport porównawczy (Comparison Report)

**Widok porównawczy MUSI być drukowalny jako PDF zawierający:**

| Sekcja | Zawartość |
|--------|-----------|
| Nagłówek | Data, wersja obliczeń, nazwy Cases |
| Kontekst | Typ analizy, snapshot IDs, parametry |
| Tabela różnic | Pełna tabela z Δ i %Δ |
| Legenda kolorów | Wyjaśnienie progów kolorystycznych |
| Podsumowanie przyczyn | Agregat WHY Panel dla top zmian |
| Stopka | Timestamp generowania, checksum |

### 9.2 Reguła: Ekran = PDF

**BINDING:** Zawartość ekranu MUSI być identyczna z zawartością PDF.

| Aspekt | Ekran | PDF |
|--------|-------|-----|
| Tabela | 100% zawartości | 100% zawartości |
| Kolumny | Wszystkie widoczne | Wszystkie widoczne |
| Overlay | Widoczny | Widoczny (screenshot lub render) |
| Legenda | Widoczna | Widoczna |

### 9.3 Metadane audytowe

**Każdy raport MUSI zawierać:**

| Pole | Opis |
|------|------|
| `report_id` | UUID raportu |
| `generated_at` | Timestamp generowania |
| `case_a_snapshot_fingerprint` | Hash snapshotu Case A |
| `case_b_snapshot_fingerprint` | Hash snapshotu Case B |
| `comparison_checksum` | Hash całego raportu |
| `system_version` | Wersja MV-DESIGN-PRO |

---

## 10. Odniesienia do benchmark / DIgSILENT benchmark

### 10.1 benchmark — Output Window

| Funkcja PF | Odpowiednik MV-DESIGN-PRO |
|------------|---------------------------|
| Study Case Comparison | Case Comparison Table |
| Result Diff View | ΔColumn + %ΔColumn |
| Highlight Changes | Overlay różnic na SLD |
| Cross-reference | WHY Panel |

### 10.2 benchmark — Study Manager

| Funkcja benchmark | Odpowiednik MV-DESIGN-PRO |
|--------------|---------------------------|
| Scenario Comparison | Multi-Case Comparison (A/B/C) |
| What-If Analysis | Variant vs Base Case |
| Comparison Report | PDF Export |

### 10.3 Wspólny paradygmat

**Zarówno benchmark jak i benchmark stosują:**
1. Porównania per-element (nie agregowane)
2. Jasne wskazanie źródła różnic
3. Integrację z diagramem jednokreskowym
4. Eksport do raportu z pełnym kontekstem

---

## 11. Przejścia trybów (Mode Gating)

### 11.1 Dostępność porównań w trybach

| Tryb systemowy | Dostępność Comparison UI |
|----------------|--------------------------|
| MODEL_EDIT | ZABLOKOWANE — brak wyników do porównania |
| CASE_CONFIG | ZABLOKOWANE — wyniki mogą być nieaktualne |
| RESULT_VIEW | DOZWOLONE — wynik FRESH wymagany |

### 11.2 Warunki dostępu

| Warunek | Status |
|---------|--------|
| Case A: result_state = FRESH | WYMAGANY |
| Case B: result_state = FRESH | WYMAGANY |
| Case A.case_type = Case B.case_type | WYMAGANY |
| Snapshot A i B istnieją | WYMAGANY |

---

## 12. API Contract (Prospective)

### 12.1 Endpoint: Compare Cases

```
POST /api/comparison/cases
{
    "case_a_id": "uuid",
    "case_b_id": "uuid",
    "comparison_options": {
        "include_why_panel": true,
        "threshold_percent": 5.0,
        "element_filter": ["BUS", "LINE"]
    }
}

Response:
{
    "comparison_id": "uuid",
    "context": { ... },
    "differences": [
        {
            "element_id": "uuid",
            "element_name": "BUS_001",
            "element_type": "BUS",
            "parameter": "U_kV",
            "value_a": 15.00,
            "value_b": 14.85,
            "delta": -0.15,
            "delta_percent": -1.0,
            "status": "DECREASE"
        }
    ],
    "why_panel": [
        {
            "element_id": "uuid",
            "causes": [
                {
                    "category": "TOPOLOGY_CHANGE",
                    "source_element_id": "uuid",
                    "description": "SW_003: OPEN → CLOSED"
                }
            ]
        }
    ]
}
```

---

## 13. Changelog

| Data | Wersja | Zmiany |
|------|--------|--------|
| 2026-01-28 | 1.0 | Utworzenie dokumentu — PHASE 2.x.6 DOC-LOCKED |

---

**KONIEC KONTRAKTU CASE COMPARISON UI**

