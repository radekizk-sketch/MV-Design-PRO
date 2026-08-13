# Element Inspector Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 1.z  
**Reference:** SYSTEM_SPEC.md, ARCHITECTURE.md, benchmark/benchmark UI Standards  
**Standard:** DIgSILENT benchmark / benchmark UI Parity

---

## 1. Cel dokumentu

Niniejszy dokument definiuje **kanoniczny kontrakt Element Inspector** — centralnego panelu inspekcji dowolnego elementu sieci (BUS, LINE, TRAFO, SOURCE, LOAD, SWITCH, PROTECTION).

**Filozofia:** Jeden punkt dostępu do WSZYSTKICH informacji o elemencie — parametry, wyniki, kontrybutorzy, limity, dowody.

---

## 2. Definicje pojęć (BINDING)

### 2.1 Element Inspector

**Element Inspector** to dedykowany panel boczny UI prezentujący pełne informacje o wybranym elemencie sieci.

| Atrybut | Opis |
|---------|------|
| Panel Position | RIGHT (domyślnie) / BOTTOM / FLOATING |
| Panel Width | 400px (min) / 600px (max) / resizable |
| Active Element | Aktualnie inspekcjonowany element |
| Active Tab | Aktywna zakładka (Overview / Parameters / Results / ...) |
| Edit Mode | READ_ONLY (default) / EDIT (Designer Mode) |

### 2.2 Obsługiwane typy elementów

| Typ | Opis | Zakładki dostępne |
|-----|------|-------------------|
| BUS | Węzeł sieci | All 6 tabs |
| LINE | Linia / kabel | All except Contributions (limited) |
| TRAFO | Transformator | All 6 tabs |
| SOURCE | Źródło (Grid/Gen/PV/BESS) | All 6 tabs |
| LOAD | Obciążenie | Overview, Parameters, Results |
| SWITCH | Łącznik | Overview, Parameters, Switching History |
| PROTECTION | Zabezpieczenie | All 6 tabs + Proof P11 |

---

## 3. Zakładki Element Inspector (BINDING)

### 3.1 Tab: Overview

**Cel:** Szybki przegląd kluczowych informacji o elemencie.

| Sekcja | Zawartość |
|--------|-----------|
| **Identity** | Element ID, Name, Type, Subtype |
| **Location** | Station, Voltage Level, Feeder, Zone |
| **Status** | in_service, State (OPEN/CLOSED), Connection Status |
| **Key Values** | Voltage [kV/p.u.], Power [MW/Mvar], Current [A] |
| **Violations** | Lista naruszeń norm (czerwone badges) |
| **Quick Actions** | Open in SLD, Compare, Export |

### 3.2 Tab: Parameters

**Cel:** Edycja i przegląd parametrów technicznych elementu.

| Sekcja | Zawartość | Edytowalne |
|--------|-----------|------------|
| **Catalog Reference** | Type ID, Type Name, Manufacturer | ✗ (read-only, see Catalog Browser) |
| **Rated Values** | U_n, I_n, S_n, P_n | ✗ (from Type) |
| **Impedance** | R, X, B, G (per phase) | ✗ (from Type) |
| **Operational** | in_service, tap_position | ✓ (Designer Mode) |
| **Setpoints** | P_setpoint, Q_setpoint, U_setpoint | ✓ (Case-specific) |
| **Limits** | I_max, U_min, U_max | ✓ (Designer Mode) |
| **Protection Settings** | I_trip, t_trip, curve_type | ✓ (Protection only) |

**Visual Distinction:**

| Pole | Style | Znaczenie |
|------|-------|-----------|
| Editable | White background + border | Można edytować (w Designer Mode) |
| Read-only (from Type) | Gray background | Z katalogu typów |
| Calculated | Blue italic | Obliczone przez solver |
| Case-specific | Yellow border | Wartość zależna od Case |

### 3.3 Tab: Results

**Cel:** Prezentacja wyników obliczeń dla elementu.

**Struktura (Multi-Case View):**

```
┌─────────────────────────────────────────────────────────────────┐
│                    RESULTS — BUS_007                             │
├─────────────────────────────────────────────────────────────────┤
│ Analysis: Short-Circuit (IEC 60909)                             │
├─────────────────────────────────────────────────────────────────┤
│ Case          │ Ik_max [kA] │ Ik_min [kA] │ ip [kA] │ Status   │
├───────────────┼─────────────┼─────────────┼─────────┼──────────┤
│ SC_BASE       │   12.50     │    8.20     │  28.50  │   OK     │
│ SC_VARIANT_A  │   14.35     │    9.10     │  32.70  │ VIOLATION│
│ SC_VARIANT_B  │   11.80     │    7.95     │  26.90  │   OK     │
├───────────────┼─────────────┼─────────────┼─────────┼──────────┤
│ Δ (A vs BASE) │   +1.85     │   +0.90     │  +4.20  │   ▲      │
│ Δ (B vs BASE) │   -0.70     │   -0.25     │  -1.60  │   ▼      │
└─────────────────────────────────────────────────────────────────┘
```

**Multi-Case View Features:**
- Wyniki dla WSZYSTKICH Cases z aktywnego Study
- Kolumna Delta (porównanie z baseline Case)
- Trend indicators (▲/▼/=)
- Filtrowanie po Case, Analysis
- Eksport pojedynczej tabeli

### 3.4 Tab: Contributions

**Cel:** Analiza kontrybutorów do prądu zwarciowego (Bus) lub obciążenia (Line/Trafo).

**Dla BUS (Short-Circuit Contributions):**

| Contributor | Type | Ik" [kA] | % Total | Direction |
|-------------|------|----------|---------|-----------|
| Grid_Source | GRID | 8.50 | 68.0% | → BUS_007 |
| Gen_01 | GENERATOR | 2.10 | 16.8% | → BUS_007 |
| PV_Park_01 | PV_INVERTER | 0.85 | 6.8% | → BUS_007 |
| Line_12 (backfeed) | LINE | 1.05 | 8.4% | → BUS_007 |
| **TOTAL** | — | **12.50** | **100%** | — |

**Dla LINE/TRAFO (Load Flow Contributions):**

| Load | P [MW] | Q [Mvar] | % of Total |
|------|--------|----------|------------|
| Load_A | 1.50 | 0.45 | 35.0% |
| Load_B | 2.10 | 0.62 | 49.0% |
| Load_C | 0.68 | 0.20 | 16.0% |
| **TOTAL** | **4.28** | **1.27** | **100%** |

### 3.5 Tab: Limits

**Cel:** Prezentacja limitów normatywnych i marginesów.

**Struktura:**

| Parameter | Limit | Current Value | Margin | Status |
|-----------|-------|---------------|--------|--------|
| U_min [p.u.] | 0.95 | 0.97 | +0.02 (+2.1%) | ✅ OK |
| U_max [p.u.] | 1.05 | 0.97 | -0.08 (-7.6%) | ✅ OK |
| Ik_max [kA] | 25.0 | 12.5 | -12.5 (-50%) | ✅ OK |
| I_loading [%] | 100% | 85.3% | -14.7% | ⚠️ WARNING |
| THD [%] | 8.0% | 3.2% | -4.8% | ✅ OK |

**Źródła norm:**
- PN-EN 50160 (jakość napięcia)
- IEC 60909 (prądy zwarciowe)
- IEC 60076 (transformatory)
- IEEE 519 (harmoniczne)

### 3.6 Tab: Proof (P11)

**Cel:** Dostęp do dowodu matematycznego P11 dla elementu.

**Dostępność:** BUS, PROTECTION (gdzie dowód P11 jest generowany)

**Zawartość:**

| Sekcja | Opis |
|--------|------|
| Proof Summary | Tytuł, Case, Run, Solver Version |
| Proof Steps | Lista kroków dowodu (collapsible) |
| Navigation | Spis treści, Prev/Next |
| Export | PDF, LaTeX, DOCX |

**Link:** → Proof Inspector (P11_1d_PROOF_UI_EXPORT.md)

---

## 4. Multi-Case View (SUPERIOR Feature)

### 4.1 Zasada

**Multi-Case View** = Element Inspector pokazuje wyniki dla WSZYSTKICH Cases w jednej tabeli.

**Powód:** Użytkownik chce porównać wartości bez przełączania między Cases.

### 4.2 Implementacja

```
┌─────────────────────────────────────────────────────────────────┐
│ Element: BUS_007                          [Switch to Single Case]│
├─────────────────────────────────────────────────────────────────┤
│ ● Multi-Case View (3 cases)               ○ Single Case View    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [SC_BASE]  [SC_VARIANT_A]  [SC_VARIANT_B]                      │
│    ✓ Baseline       Compare→         Compare→                   │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ Case          │ Ik_max │ ip    │ Ith   │ Status │          ││
│ ├───────────────┼────────┼───────┼───────┼────────┼──────────┤│
│ │ SC_BASE       │ 12.50  │ 28.50 │ 14.20 │   OK   │ baseline ││
│ │ SC_VARIANT_A  │ 14.35  │ 32.70 │ 16.30 │VIOLATE │ +14.8%   ││
│ │ SC_VARIANT_B  │ 11.80  │ 26.90 │ 13.40 │   OK   │  -5.6%   ││
│ └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Interakcje

| Akcja | Reakcja |
|-------|---------|
| Klik "Baseline" | Ustawia Case jako baseline dla porównań |
| Klik "Compare→" | Aktywuje Delta view dla tego Case |
| Toggle Single/Multi | Przełącza między widokami |
| Hover nad Case | Tooltip z metadanymi (Run, Timestamp) |

---

## 5. Tryby edycji (BINDING)

### 5.1 READ_ONLY Mode (Default)

- Wszystkie pola read-only
- Brak przycisków "Save"
- Dostępne dla Operator, Analyst, Auditor

### 5.2 EDIT Mode (Designer only)

- Pola Operational i Setpoints edytowalne
- Przyciski "Save" i "Revert"
- Walidacja przy zapisie (NetworkValidator)
- Automatyczne oznaczenie wyników jako OUTDATED

### 5.3 Przełączanie trybów

```
[Designer Mode] → Element Inspector → Parameters tab → EDIT mode aktywny
[Operator Mode] → Element Inspector → Parameters tab → READ_ONLY (no edit)
```

---

## 6. Synchronizacja (BINDING)

### 6.1 Single Global Focus

Element Inspector MUSI reagować na zmiany Global Focus:

| Źródło zmiany | Reakcja Element Inspector |
|---------------|---------------------------|
| Klik w SLD | Zmiana Active Element, refresh content |
| Klik w Results Browser | Zmiana Active Element, scroll to element |
| Klik w Topology Tree | Zmiana Active Element, refresh content |
| Zmiana Active Case | Refresh Results tab |
| Zmiana Active Analysis | Refresh Results tab |

### 6.2 Outgoing synchronization

| Akcja w Element Inspector | Propagacja |
|---------------------------|------------|
| Klik "Open in SLD" | SLD centruje i podświetla element |
| Klik wiersz w Contributions | SLD podświetla contributor |
| Edycja parametru | Wyniki → OUTDATED, banner w SLD |

---

## 7. Accessibility (a11y)

### 7.1 Screen Reader

| Komponent | ARIA Label |
|-----------|------------|
| Panel | "Element Inspector for {Element Name}, {Element Type}" |
| Tab | "Tab: {Tab Name}, {N} of 6" |
| Field | "{Field Name}, {Value}, {Unit}, {Status}" |
| Table | "Results table, {N} cases, {M} columns" |

### 7.2 Keyboard Navigation

| Klawisz | Akcja |
|---------|-------|
| Tab | Przejdź do następnego pola |
| Shift+Tab | Przejdź do poprzedniego pola |
| Ctrl+1..6 | Przełącz na zakładkę 1..6 |
| Escape | Zamknij inspector / Revert changes |
| Ctrl+S | Save changes (EDIT mode) |
| F5 | Refresh content |

---

## 8. benchmark / benchmark Parity

### 8.1 Feature Comparison

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Multi-tab Inspector | ✓ | ✓ | ✓ | ✅ FULL |
| Overview Tab | ✓ | ✓ | ✓ | ✅ FULL |
| Parameters Tab | ✓ | ✓ | ✓ | ✅ FULL |
| Results Tab | ✓ | ✓ | ✓ | ✅ FULL |
| Contributions Tab | ✗ | ✓ | ✓ | ✅ FULL |
| Limits Tab | ✓ (partial) | ✓ | ✓ + Margin % | ➕ SUPERIOR |
| Proof Tab (P11) | ✗ | ✗ | ✓ | ➕ SUPERIOR |
| Multi-Case View | ✗ | ✗ | ✓ | ➕ SUPERIOR |
| Delta Comparison | ✗ | ✓ | ✓ + Trend | ➕ SUPERIOR |
| Inline Edit (Designer) | ✓ | ✓ | ✓ + Validation | ➕ SUPERIOR |
| Sync with SLD | ✓ | ✓ | ✓ + Focus Lock | ➕ SUPERIOR |
| Sync with Results Browser | ✗ | ✓ | ✓ | ✅ FULL |
| Read-only protection | ✗ | ✓ | ✓ + Expert Modes | ➕ SUPERIOR |

### 8.2 Ocena końcowa

**MV-DESIGN-PRO Element Inspector ≥ benchmark Inspector ≥ benchmark Element Dialog** ✅

---

## 9. Scenariusze poprawne (ALLOWED)

### 9.1 Scenariusz: Inspekcja Bus z wieloma Cases

```
USER: Klika Bus_007 na SLD
SYSTEM: Element Inspector otwiera się z Bus_007
USER: Przechodzi do zakładki Results
SYSTEM: Multi-Case View pokazuje wyniki dla wszystkich Cases
USER: Klika "SC_VARIANT_A" jako Compare target
SYSTEM: Kolumna Delta pojawia się z % zmian
USER: Eksportuje tabelę do PDF
```

### 9.2 Scenariusz: Edycja parametrów (Designer)

```
USER: W Designer Mode klika Line_001 na SLD
SYSTEM: Element Inspector otwiera się, Parameters tab edytowalne
USER: Zmienia in_service → False
SYSTEM: Walidacja OK, przycisk "Save" aktywny
USER: Klika "Save"
SYSTEM: Model zaktualizowany, Results → OUTDATED
```

---

## 10. Scenariusze zabronione (FORBIDDEN)

### 10.1 Edycja w trybie Operator

**FORBIDDEN:**
```
❌ Operator może edytować parametry (np. R, X linii)
```

**CORRECT:**
```
✓ Element Inspector w READ_ONLY dla Operator/Analyst/Auditor
✓ Edycja tylko w Designer Mode
```

### 10.2 Brak Multi-Case View

**FORBIDDEN:**
```
❌ Element Inspector pokazuje wyniki tylko dla Active Case
❌ Użytkownik musi przełączać Case, żeby zobaczyć różnice
```

**CORRECT:**
```
✓ Multi-Case View domyślnie włączone
✓ Wszystkie Cases widoczne w jednej tabeli
✓ Delta column automatycznie
```

### 10.3 Brak zakładki Proof P11

**FORBIDDEN:**
```
❌ Element Inspector dla Bus/Protection nie ma zakładki Proof
```

**CORRECT:**
```
✓ Zakładka Proof (P11) dostępna dla Bus i Protection
✓ Link do pełnego Proof Inspector
✓ Eksport do PDF/LaTeX
```

---

## 11. Compliance Checklist

**Implementacja zgodna z ELEMENT_INSPECTOR_CONTRACT.md, jeśli:**

- [ ] Element Inspector ma 6 zakładek (Overview, Parameters, Results, Contributions, Limits, Proof)
- [ ] Multi-Case View implementuje tabelę z wszystkimi Cases
- [ ] Delta Comparison z trend indicators (▲/▼/=)
- [ ] Contributions tab dla Bus (SC) i Line/Trafo (PF)
- [ ] Limits tab z Margin % i status
- [ ] Proof tab (P11) dla Bus i Protection
- [ ] READ_ONLY mode dla Operator/Analyst/Auditor
- [ ] EDIT mode tylko dla Designer
- [ ] Synchronizacja z SLD, Results Browser, Topology Tree (Single Global Focus)
- [ ] Keyboard navigation (Tab, Ctrl+1..6, Escape, Ctrl+S)
- [ ] Screen reader support (ARIA labels)

---

## 12. Changelog

| Data | Wersja | Zmiany |
|------|--------|--------|
| 2026-01-28 | 1.0 | Utworzenie dokumentu — Phase 1.z |

---

**KONIEC KONTRAKTU ELEMENT INSPECTOR**

