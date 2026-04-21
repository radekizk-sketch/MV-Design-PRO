# Element Inspector Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 1.z  
**Reference:** SYSTEM_SPEC.md, ARCHITECTURE.md, benchmark/benchmark UI Standards  
**Standard:** DIgSILENT benchmark / benchmark UI Parity

---

## 1. Cel dokumentu

Niniejszy dokument definiuje **kanoniczny kontrakt Element Inspector** â€” centralnego panelu inspekcji dowolnego elementu sieci (BUS, LINE, TRAFO, SOURCE, LOAD, SWITCH, PROTECTION).

**Filozofia:** Jeden punkt dostÄ™pu do WSZYSTKICH informacji o elemencie â€” parametry, wyniki, kontrybutorzy, limity, dowody.

---

## 2. Definicje pojÄ™Ä‡ (BINDING)

### 2.1 Element Inspector

**Element Inspector** to dedykowany panel boczny UI prezentujÄ…cy peĹ‚ne informacje o wybranym elemencie sieci.

| Atrybut | Opis |
|---------|------|
| Panel Position | RIGHT (domyĹ›lnie) / BOTTOM / FLOATING |
| Panel Width | 400px (min) / 600px (max) / resizable |
| Active Element | Aktualnie inspekcjonowany element |
| Active Tab | Aktywna zakĹ‚adka (Overview / Parameters / Results / ...) |
| Edit Mode | READ_ONLY (default) / EDIT (Designer Mode) |

### 2.2 ObsĹ‚ugiwane typy elementĂłw

| Typ | Opis | ZakĹ‚adki dostÄ™pne |
|-----|------|-------------------|
| BUS | WÄ™zeĹ‚ sieci | All 6 tabs |
| LINE | Linia / kabel | All except Contributions (limited) |
| TRAFO | Transformator | All 6 tabs |
| SOURCE | ĹąrĂłdĹ‚o (Grid/Gen/PV/BESS) | All 6 tabs |
| LOAD | ObciÄ…ĹĽenie | Overview, Parameters, Results |
| SWITCH | ĹÄ…cznik | Overview, Parameters, Switching History |
| PROTECTION | Zabezpieczenie | All 6 tabs + Proof P11 |

---

## 3. ZakĹ‚adki Element Inspector (BINDING)

### 3.1 Tab: Overview

**Cel:** Szybki przeglÄ…d kluczowych informacji o elemencie.

| Sekcja | ZawartoĹ›Ä‡ |
|--------|-----------|
| **Identity** | Element ID, Name, Type, Subtype |
| **Location** | Station, Voltage Level, Feeder, Zone |
| **Status** | in_service, State (OPEN/CLOSED), Connection Status |
| **Key Values** | Voltage [kV/p.u.], Power [MW/Mvar], Current [A] |
| **Violations** | Lista naruszeĹ„ norm (czerwone badges) |
| **Quick Actions** | Open in SLD, Compare, Export |

### 3.2 Tab: Parameters

**Cel:** Edycja i przeglÄ…d parametrĂłw technicznych elementu.

| Sekcja | ZawartoĹ›Ä‡ | Edytowalne |
|--------|-----------|------------|
| **Catalog Reference** | Type ID, Type Name, Manufacturer | âś— (read-only, see Catalog Browser) |
| **Rated Values** | U_n, I_n, S_n, P_n | âś— (from Type) |
| **Impedance** | R, X, B, G (per phase) | âś— (from Type) |
| **Operational** | in_service, tap_position | âś“ (Designer Mode) |
| **Setpoints** | P_setpoint, Q_setpoint, U_setpoint | âś“ (Case-specific) |
| **Limits** | I_max, U_min, U_max | âś“ (Designer Mode) |
| **Protection Settings** | I_trip, t_trip, curve_type | âś“ (Protection only) |

**Visual Distinction:**

| Pole | Style | Znaczenie |
|------|-------|-----------|
| Editable | White background + border | MoĹĽna edytowaÄ‡ (w Designer Mode) |
| Read-only (from Type) | Gray background | Z katalogu typĂłw |
| Calculated | Blue italic | Obliczone przez solver |
| Case-specific | Yellow border | WartoĹ›Ä‡ zaleĹĽna od Case |

### 3.3 Tab: Results

**Cel:** Prezentacja wynikĂłw obliczeĹ„ dla elementu.

**Struktura (Multi-Case View):**

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    RESULTS â€” BUS_007                             â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Analysis: Short-Circuit (IEC 60909)                             â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Case          â”‚ Ik_max [kA] â”‚ Ik_min [kA] â”‚ ip [kA] â”‚ Status   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ SC_BASE       â”‚   12.50     â”‚    8.20     â”‚  28.50  â”‚   OK     â”‚
â”‚ SC_VARIANT_A  â”‚   14.35     â”‚    9.10     â”‚  32.70  â”‚ VIOLATIONâ”‚
â”‚ SC_VARIANT_B  â”‚   11.80     â”‚    7.95     â”‚  26.90  â”‚   OK     â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Î” (A vs BASE) â”‚   +1.85     â”‚   +0.90     â”‚  +4.20  â”‚   â–˛      â”‚
â”‚ Î” (B vs BASE) â”‚   -0.70     â”‚   -0.25     â”‚  -1.60  â”‚   â–Ľ      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

**Multi-Case View Features:**
- Wyniki dla WSZYSTKICH Cases z aktywnego Study
- Kolumna Delta (porĂłwnanie z baseline Case)
- Trend indicators (â–˛/â–Ľ/=)
- Filtrowanie po Case, Analysis
- Eksport pojedynczej tabeli

### 3.4 Tab: Contributions

**Cel:** Analiza kontrybutorĂłw do prÄ…du zwarciowego (Bus) lub obciÄ…ĹĽenia (Line/Trafo).

**Dla BUS (Short-Circuit Contributions):**

| Contributor | Type | Ik" [kA] | % Total | Direction |
|-------------|------|----------|---------|-----------|
| Grid_Source | GRID | 8.50 | 68.0% | â†’ BUS_007 |
| Gen_01 | GENERATOR | 2.10 | 16.8% | â†’ BUS_007 |
| PV_Park_01 | PV_INVERTER | 0.85 | 6.8% | â†’ BUS_007 |
| Line_12 (backfeed) | LINE | 1.05 | 8.4% | â†’ BUS_007 |
| **TOTAL** | â€” | **12.50** | **100%** | â€” |

**Dla LINE/TRAFO (Load Flow Contributions):**

| Load | P [MW] | Q [Mvar] | % of Total |
|------|--------|----------|------------|
| Load_A | 1.50 | 0.45 | 35.0% |
| Load_B | 2.10 | 0.62 | 49.0% |
| Load_C | 0.68 | 0.20 | 16.0% |
| **TOTAL** | **4.28** | **1.27** | **100%** |

### 3.5 Tab: Limits

**Cel:** Prezentacja limitĂłw normatywnych i marginesĂłw.

**Struktura:**

| Parameter | Limit | Current Value | Margin | Status |
|-----------|-------|---------------|--------|--------|
| U_min [p.u.] | 0.95 | 0.97 | +0.02 (+2.1%) | âś… OK |
| U_max [p.u.] | 1.05 | 0.97 | -0.08 (-7.6%) | âś… OK |
| Ik_max [kA] | 25.0 | 12.5 | -12.5 (-50%) | âś… OK |
| I_loading [%] | 100% | 85.3% | -14.7% | âš ď¸Ź WARNING |
| THD [%] | 8.0% | 3.2% | -4.8% | âś… OK |

**ĹąrĂłdĹ‚a norm:**
- PN-EN 50160 (jakoĹ›Ä‡ napiÄ™cia)
- IEC 60909 (prÄ…dy zwarciowe)
- IEC 60076 (transformatory)
- IEEE 519 (harmoniczne)

### 3.6 Tab: Proof (P11)

**Cel:** DostÄ™p do dowodu matematycznego P11 dla elementu.

**DostÄ™pnoĹ›Ä‡:** BUS, PROTECTION (gdzie dowĂłd P11 jest generowany)

**ZawartoĹ›Ä‡:**

| Sekcja | Opis |
|--------|------|
| Proof Summary | TytuĹ‚, Case, Run, Solver Version |
| Proof Steps | Lista krokĂłw dowodu (collapsible) |
| Navigation | Spis treĹ›ci, Prev/Next |
| Export | PDF, LaTeX, DOCX |

**Link:** â†’ Proof Inspector (P11_1d_PROOF_UI_EXPORT.md)

---

## 4. Multi-Case View (SUPERIOR Feature)

### 4.1 Zasada

**Multi-Case View** = Element Inspector pokazuje wyniki dla WSZYSTKICH Cases w jednej tabeli.

**PowĂłd:** UĹĽytkownik chce porĂłwnaÄ‡ wartoĹ›ci bez przeĹ‚Ä…czania miÄ™dzy Cases.

### 4.2 Implementacja

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Element: BUS_007                          [Switch to Single Case]â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â—Ź Multi-Case View (3 cases)               â—‹ Single Case View    â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                 â”‚
â”‚ [SC_BASE]  [SC_VARIANT_A]  [SC_VARIANT_B]                      â”‚
â”‚    âś“ Baseline       Compareâ†’         Compareâ†’                   â”‚
â”‚                                                                 â”‚
â”‚ â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â”‚ â”‚ Case          â”‚ Ik_max â”‚ ip    â”‚ Ith   â”‚ Status â”‚          â”‚â”‚
â”‚ â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤â”‚
â”‚ â”‚ SC_BASE       â”‚ 12.50  â”‚ 28.50 â”‚ 14.20 â”‚   OK   â”‚ baseline â”‚â”‚
â”‚ â”‚ SC_VARIANT_A  â”‚ 14.35  â”‚ 32.70 â”‚ 16.30 â”‚VIOLATE â”‚ +14.8%   â”‚â”‚
â”‚ â”‚ SC_VARIANT_B  â”‚ 11.80  â”‚ 26.90 â”‚ 13.40 â”‚   OK   â”‚  -5.6%   â”‚â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 4.3 Interakcje

| Akcja | Reakcja |
|-------|---------|
| Klik "Baseline" | Ustawia Case jako baseline dla porĂłwnaĹ„ |
| Klik "Compareâ†’" | Aktywuje Delta view dla tego Case |
| Toggle Single/Multi | PrzeĹ‚Ä…cza miÄ™dzy widokami |
| Hover nad Case | Tooltip z metadanymi (Run, Timestamp) |

---

## 5. Tryby edycji (BINDING)

### 5.1 READ_ONLY Mode (Default)

- Wszystkie pola read-only
- Brak przyciskĂłw "Save"
- DostÄ™pne dla Operator, Analyst, Auditor

### 5.2 EDIT Mode (Designer only)

- Pola Operational i Setpoints edytowalne
- Przyciski "Save" i "Revert"
- Walidacja przy zapisie (NetworkValidator)
- Automatyczne oznaczenie wynikĂłw jako OUTDATED

### 5.3 PrzeĹ‚Ä…czanie trybĂłw

```
[Designer Mode] â†’ Element Inspector â†’ Parameters tab â†’ EDIT mode aktywny
[Operator Mode] â†’ Element Inspector â†’ Parameters tab â†’ READ_ONLY (no edit)
```

---

## 6. Synchronizacja (BINDING)

### 6.1 Single Global Focus

Element Inspector MUSI reagowaÄ‡ na zmiany Global Focus:

| ĹąrĂłdĹ‚o zmiany | Reakcja Element Inspector |
|---------------|---------------------------|
| Klik w SLD | Zmiana Active Element, refresh content |
| Klik w Results Browser | Zmiana Active Element, scroll to element |
| Klik w Topology Tree | Zmiana Active Element, refresh content |
| Zmiana Active Case | Refresh Results tab |
| Zmiana Active Analysis | Refresh Results tab |

### 6.2 Outgoing synchronization

| Akcja w Element Inspector | Propagacja |
|---------------------------|------------|
| Klik "Open in SLD" | SLD centruje i podĹ›wietla element |
| Klik wiersz w Contributions | SLD podĹ›wietla contributor |
| Edycja parametru | Wyniki â†’ OUTDATED, banner w SLD |

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
| Tab | PrzejdĹş do nastÄ™pnego pola |
| Shift+Tab | PrzejdĹş do poprzedniego pola |
| Ctrl+1..6 | PrzeĹ‚Ä…cz na zakĹ‚adkÄ™ 1..6 |
| Escape | Zamknij inspector / Revert changes |
| Ctrl+S | Save changes (EDIT mode) |
| F5 | Refresh content |

---

## 8. benchmark / benchmark Parity

### 8.1 Feature Comparison

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Multi-tab Inspector | âś“ | âś“ | âś“ | âś… FULL |
| Overview Tab | âś“ | âś“ | âś“ | âś… FULL |
| Parameters Tab | âś“ | âś“ | âś“ | âś… FULL |
| Results Tab | âś“ | âś“ | âś“ | âś… FULL |
| Contributions Tab | âś— | âś“ | âś“ | âś… FULL |
| Limits Tab | âś“ (partial) | âś“ | âś“ + Margin % | âž• SUPERIOR |
| Proof Tab (P11) | âś— | âś— | âś“ | âž• SUPERIOR |
| Multi-Case View | âś— | âś— | âś“ | âž• SUPERIOR |
| Delta Comparison | âś— | âś“ | âś“ + Trend | âž• SUPERIOR |
| Inline Edit (Designer) | âś“ | âś“ | âś“ + Validation | âž• SUPERIOR |
| Sync with SLD | âś“ | âś“ | âś“ + Focus Lock | âž• SUPERIOR |
| Sync with Results Browser | âś— | âś“ | âś“ | âś… FULL |
| Read-only protection | âś— | âś“ | âś“ + Expert Modes | âž• SUPERIOR |

### 8.2 Ocena koĹ„cowa

**MV-DESIGN-PRO Element Inspector â‰Ą benchmark Inspector â‰Ą benchmark Element Dialog** âś…

---

## 9. Scenariusze poprawne (ALLOWED)

### 9.1 Scenariusz: Inspekcja Bus z wieloma Cases

```
USER: Klika Bus_007 na SLD
SYSTEM: Element Inspector otwiera siÄ™ z Bus_007
USER: Przechodzi do zakĹ‚adki Results
SYSTEM: Multi-Case View pokazuje wyniki dla wszystkich Cases
USER: Klika "SC_VARIANT_A" jako Compare target
SYSTEM: Kolumna Delta pojawia siÄ™ z % zmian
USER: Eksportuje tabelÄ™ do PDF
```

### 9.2 Scenariusz: Edycja parametrĂłw (Designer)

```
USER: W Designer Mode klika Line_001 na SLD
SYSTEM: Element Inspector otwiera siÄ™, Parameters tab edytowalne
USER: Zmienia in_service â†’ False
SYSTEM: Walidacja OK, przycisk "Save" aktywny
USER: Klika "Save"
SYSTEM: Model zaktualizowany, Results â†’ OUTDATED
```

---

## 10. Scenariusze zabronione (FORBIDDEN)

### 10.1 Edycja w trybie Operator

**FORBIDDEN:**
```
âťŚ Operator moĹĽe edytowaÄ‡ parametry (np. R, X linii)
```

**CORRECT:**
```
âś“ Element Inspector w READ_ONLY dla Operator/Analyst/Auditor
âś“ Edycja tylko w Designer Mode
```

### 10.2 Brak Multi-Case View

**FORBIDDEN:**
```
âťŚ Element Inspector pokazuje wyniki tylko dla Active Case
âťŚ UĹĽytkownik musi przeĹ‚Ä…czaÄ‡ Case, ĹĽeby zobaczyÄ‡ rĂłĹĽnice
```

**CORRECT:**
```
âś“ Multi-Case View domyĹ›lnie wĹ‚Ä…czone
âś“ Wszystkie Cases widoczne w jednej tabeli
âś“ Delta column automatycznie
```

### 10.3 Brak zakĹ‚adki Proof P11

**FORBIDDEN:**
```
âťŚ Element Inspector dla Bus/Protection nie ma zakĹ‚adki Proof
```

**CORRECT:**
```
âś“ ZakĹ‚adka Proof (P11) dostÄ™pna dla Bus i Protection
âś“ Link do peĹ‚nego Proof Inspector
âś“ Eksport do PDF/LaTeX
```

---

## 11. Compliance Checklist

**Implementacja zgodna z ELEMENT_INSPECTOR_CONTRACT.md, jeĹ›li:**

- [ ] Element Inspector ma 6 zakĹ‚adek (Overview, Parameters, Results, Contributions, Limits, Proof)
- [ ] Multi-Case View implementuje tabelÄ™ z wszystkimi Cases
- [ ] Delta Comparison z trend indicators (â–˛/â–Ľ/=)
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
| 2026-01-28 | 1.0 | Utworzenie dokumentu â€” Phase 1.z |

---

**KONIEC KONTRAKTU ELEMENT INSPECTOR**

