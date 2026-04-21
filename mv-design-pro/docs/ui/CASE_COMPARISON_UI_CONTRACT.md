# Case / Variant Comparison UI Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 2.x.6  
**Reference:** SYSTEM_SPEC.md, ARCHITECTURE.md, PLANS.md, CANONICAL_COMPLIANCE.md  
**Standard:** DIgSILENT benchmark / benchmark parity

---

## 1. Cel dokumentu

Niniejszy dokument definiuje **kanoniczny interfejs porĂłwnywania Case / Variant / Study**,
umoĹĽliwiajÄ…cy **inĹĽynierskÄ… analizÄ™ rĂłĹĽnic** zgodnie z praktykÄ… DIgSILENT benchmark oraz benchmark.

**Pytanie fundamentalne:**
> **CO siÄ™ zmieniĹ‚o, GDZIE, o ILE i DLACZEGO?**

---

## 2. Definicje pojÄ™Ä‡ (BINDING)

### 2.1 Case (Przypadek obliczeniowy)

**Case** to zamroĹĽony zestaw parametrĂłw obliczeniowych + snapshot modelu + wyniki.

| Atrybut | Opis |
|---------|------|
| `case_id` | UUID przypadku |
| `case_name` | Nazwa czytelna dla uĹĽytkownika |
| `case_type` | Typ analizy: `SHORT_CIRCUIT` / `POWER_FLOW` |
| `network_snapshot_id` | UUID zamroĹĽonego stanu modelu |
| `parameters` | Parametry obliczeniowe (c_max, fault_type, etc.) |
| `result_state` | Stan wynikĂłw: `NONE` / `FRESH` / `OUTDATED` |
| `created_at` | Timestamp utworzenia |
| `computed_at` | Timestamp ostatniego obliczenia |

### 2.2 Variant (Wariant)

**Variant** to Case z modyfikacjami topologii lub parametrĂłw wzglÄ™dem Case bazowego.

| Atrybut | Opis |
|---------|------|
| `base_case_id` | UUID przypadku bazowego |
| `variant_name` | Nazwa wariantu |
| `topology_changes` | Lista zmian topologii (dodane/usuniÄ™te/zmienione elementy) |
| `parameter_changes` | Lista zmian parametrĂłw (setpointy, stany, type_ref) |

**INVARIANT:** Variant MUSI mieÄ‡ powiÄ…zanie z Case bazowym. Brak orphan Variants.

### 2.3 Study (Studium)

**Study** to zbiĂłr powiÄ…zanych Cases/Variants analizowanych wspĂłlnie.

| Atrybut | Opis |
|---------|------|
| `study_id` | UUID studium |
| `study_name` | Nazwa studium |
| `cases` | Lista UUID Cases naleĹĽÄ…cych do studium |
| `comparison_config` | Konfiguracja porĂłwnaĹ„ (elementy, metryki) |

---

## 3. Zakres porĂłwnaĹ„ (MUST)

### 3.1 ObsĹ‚ugiwane typy porĂłwnaĹ„

| Typ porĂłwnania | Opis | Status |
|----------------|------|--------|
| Case A vs Case B | PorĂłwnanie dwĂłch przypadkĂłw | MUST |
| Case A vs Case B vs Case C | PorĂłwnanie wielokrotne (A/B/C/...) | MUST |
| Variant vs Base Case | PorĂłwnanie wariantu z bazÄ… | MUST |
| Cross-Study Comparison | PorĂłwnanie Cases z rĂłĹĽnych studiĂłw | SHOULD |

### 3.2 PorĂłwnywane wielkoĹ›ci â€” Power Flow (PF)

| WielkoĹ›Ä‡ | Symbol | Jednostka | Element | FormuĹ‚a rĂłĹĽnicy |
|----------|--------|-----------|---------|-----------------|
| NapiÄ™cie wÄ™zĹ‚a | U | kV / p.u. | BUS | Î”U = U_B - U_A |
| Moc czynna przepĹ‚ywu | P | MW | LINE / TRAFO | Î”P = P_B - P_A |
| Moc bierna przepĹ‚ywu | Q | Mvar | LINE / TRAFO | Î”Q = Q_B - Q_A |
| PrÄ…d linii | I | A | LINE / TRAFO | Î”I = I_B - I_A |
| ObciÄ…ĹĽenie termiczne | Loading | % | LINE / TRAFO | Î”Loading = Loading_B - Loading_A |
| Straty | P_loss | kW | LINE / TRAFO | Î”P_loss = P_loss_B - P_loss_A |

### 3.3 PorĂłwnywane wielkoĹ›ci â€” Short Circuit (SC)

| WielkoĹ›Ä‡ | Symbol | Jednostka | Element | FormuĹ‚a rĂłĹĽnicy |
|----------|--------|-----------|---------|-----------------|
| PrÄ…d zwarciowy poczÄ…tkowy | Ikâ€ł | kA | BUS | Î”Ikâ€ł = Ikâ€ł_B - Ikâ€ł_A |
| PrÄ…d udarowy | ip | kA | BUS | Î”ip = ip_B - ip_A |
| PrÄ…d cieplny | Ith | kA | BUS | Î”Ith = Ith_B - Ith_A |
| Impedancja Thevenina | Z_th | Î© | BUS | Î”Z_th = Z_th_B - Z_th_A |
| WspĂłĹ‚czynnik Îş | Îş | - | BUS | Î”Îş = Îş_B - Îş_A |

**BINDING (IEC 60909):** PorĂłwnania zwarciowe MUSZÄ„ byÄ‡ wykonywane **PER BUS**, NIE per linia.

### 3.4 PorĂłwnywane statusy

| Status | Opis | Prezentacja rĂłĹĽnicy |
|--------|------|---------------------|
| `in_service` | Element w eksploatacji | `True â†’ False`, `False â†’ True` |
| `Switch.state` | Stan Ĺ‚Ä…cznika | `OPEN â†’ CLOSED`, `CLOSED â†’ OPEN` |
| `type_ref` | Referencja typu katalogowego | `TypeA â†’ TypeB`, `None â†’ TypeA` |

---

## 4. Widoki porĂłwnawcze (PF-grade)

### 4.1 Tabela porĂłwnaĹ„ (Comparison Table)

**Struktura tabeli:**

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        TABELA PORĂ“WNAĹ: Case A vs Case B                         â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Element     â”‚ Parametr  â”‚  Case A    â”‚  Case B    â”‚    Î”     â”‚   %Î”    â”‚ Status â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ BUS_001     â”‚ U [kV]    â”‚   15.00    â”‚   14.85    â”‚  -0.15   â”‚  -1.0%  â”‚   â–Ľ    â”‚
â”‚ BUS_002     â”‚ U [kV]    â”‚   15.00    â”‚   15.12    â”‚  +0.12   â”‚  +0.8%  â”‚   â–˛    â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ LINE_001    â”‚ I [A]     â”‚   125.3    â”‚   142.7    â”‚  +17.4   â”‚ +13.9%  â”‚   â–˛    â”‚
â”‚ LINE_001    â”‚ P [MW]    â”‚    2.45    â”‚    2.78    â”‚  +0.33   â”‚ +13.5%  â”‚   â–˛    â”‚
â”‚ LINE_001    â”‚ Q [Mvar]  â”‚    0.82    â”‚    0.94    â”‚  +0.12   â”‚ +14.6%  â”‚   â–˛    â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ TRAFO_001   â”‚ Loading % â”‚   72.5     â”‚   85.3     â”‚  +12.8   â”‚ +17.7%  â”‚   âš     â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ SW_001      â”‚ State     â”‚   OPEN     â”‚  CLOSED    â”‚    â€”     â”‚    â€”    â”‚ ZMIANA â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”
```

**Kolumny OBOWIÄ„ZKOWE:**

| Kolumna | Opis | Sortowanie |
|---------|------|------------|
| Element | Identyfikator elementu (nazwa + typ) | Alfabetycznie |
| Parametr | Nazwa wielkoĹ›ci + jednostka | StaĹ‚a kolejnoĹ›Ä‡ |
| Case A | WartoĹ›Ä‡ w Case A | - |
| Case B | WartoĹ›Ä‡ w Case B | - |
| Î” | RĂłĹĽnica absolutna (B - A) | MalejÄ…co wg |Î”| |
| %Î” | RĂłĹĽnica procentowa ((B-A)/A Ă— 100%) | MalejÄ…co wg |%Î”| |
| Status | Indykator kierunku zmiany | - |

**Indykatory statusu:**

| Indykator | Znaczenie |
|-----------|-----------|
| â–˛ | Wzrost wartoĹ›ci |
| â–Ľ | Spadek wartoĹ›ci |
| âš  | Przekroczenie progu ostrzeĹĽenia |
| âś– | Przekroczenie progu bĹ‚Ä™du |
| = | Brak zmiany (opcjonalnie ukryte) |
| ZMIANA | Zmiana stanu binarnego |
| N/A | Brak porĂłwnywalnoĹ›ci |

### 4.2 Tabela porĂłwnaĹ„ wielokrotnych (A/B/C/...)

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    TABELA PORĂ“WNAĹ: Case A vs Case B vs Case C                              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Element     â”‚ Parametr  â”‚  Case A  â”‚  Case B  â”‚  Case C  â”‚ Î”Aâ†’B     â”‚ Î”Aâ†’C     â”‚ Range     â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ BUS_001     â”‚ U [kV]    â”‚  15.00   â”‚  14.85   â”‚  15.20   â”‚  -0.15   â”‚  +0.20   â”‚ 0.35 kV   â”‚
â”‚ LINE_001    â”‚ I [A]     â”‚  125.3   â”‚  142.7   â”‚  118.2   â”‚  +17.4   â”‚   -7.1   â”‚ 24.5 A    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

**Kolumna Range:** Zakres wartoĹ›ci max - min dla danego elementu/parametru.

### 4.3 Overlay rĂłĹĽnic na SLD (Difference Overlay)

**Zasada:** RĂłĹĽnice sÄ… prezentowane jako **nakĹ‚adka** na diagramie SLD, **BEZ modyfikacji warstwy CAD**.

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    SLD â€” OVERLAY PORĂ“WNANIA                      â”‚
â”‚                                                                 â”‚
â”‚   Warstwa bazowa (SLD):                                         â”‚
â”‚   â•â•â•â•â•¦â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•¦â•â•â•â•                               â”‚
â”‚       â•‘                    â•‘                                    â”‚
â”‚                                                                 â”‚
â”‚   Warstwa overlay (rĂłĹĽnice):                                    â”‚
â”‚                                                                 â”‚
â”‚      [Î”U=-0.15kV]       [Î”U=+0.12kV]                           â”‚
â”‚         â–Ľ                   â–˛                                   â”‚
â”‚      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•                                 â”‚
â”‚           [Î”I=+17.4A â–˛]                                        â”‚
â”‚                                                                 â”‚
â”‚   Legenda kolorĂłw:                                             â”‚
â”‚   â–¬â–¬â–¬ Zielony: zmiana â‰¤5%                                      â”‚
â”‚   â–¬â–¬â–¬ Ĺ»ĂłĹ‚ty:   zmiana 5-15%                                    â”‚
â”‚   â–¬â–¬â–¬ Czerwony: zmiana >15%                                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

**BINDING:** Overlay rĂłĹĽnic NIE modyfikuje symboli SLD ani NetworkModel.

**Kodowanie kolorystyczne overlay:**

| PrĂłg %Î” | Kolor | Znaczenie |
|---------|-------|-----------|
| |%Î”| â‰¤ 5% | Zielony | Zmiana minimalna |
| 5% < |%Î”| â‰¤ 15% | Ĺ»ĂłĹ‚ty | Zmiana umiarkowana |
| |%Î”| > 15% | Czerwony | Zmiana istotna |
| N/A | Szary | Brak porĂłwnywalnoĹ›ci |

### 4.4 Panel przyczyn (WHY Panel)

**Cel:** OdpowiedĹş na pytanie **DLACZEGO** wartoĹ›ci siÄ™ rĂłĹĽniÄ….

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    PANEL PRZYCZYN RĂ“Ĺ»NIC                         â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Element: LINE_001                                               â”‚
â”‚ Parametr: I [A]                                                 â”‚
â”‚ Î” = +17.4 A (+13.9%)                                           â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ PRZYCZYNY ZIDENTYFIKOWANE:                                      â”‚
â”‚                                                                 â”‚
â”‚ 1. ZMIANA TOPOLOGII                                             â”‚
â”‚    â””â”€ SW_003 (ĹÄ…cznik): OPEN â†’ CLOSED                          â”‚
â”‚       WpĹ‚yw: Zmiana przepĹ‚ywu mocy na alternatywnej Ĺ›cieĹĽce    â”‚
â”‚                                                                 â”‚
â”‚ 2. ZMIANA STANU ELEMENTU                                        â”‚
â”‚    â””â”€ LOAD_005: in_service True â†’ False                        â”‚
â”‚       WpĹ‚yw: Zmniejszenie obciÄ…ĹĽenia na feederze               â”‚
â”‚                                                                 â”‚
â”‚ 3. ZMIANA PARAMETRĂ“W                                            â”‚
â”‚    â””â”€ SOURCE_001: P_setpoint 5.0 MW â†’ 6.2 MW                   â”‚
â”‚       WpĹ‚yw: Wzrost generacji wpĹ‚ywa na przepĹ‚yw               â”‚
â”‚                                                                 â”‚
â”‚ 4. ZMIANA TYPU KATALOGOWEGO                                     â”‚
â”‚    â””â”€ Brak zmian typu                                          â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ DIAGNOSTYKA:                                                    â”‚
â”‚ â€˘ GĹ‚Ăłwna przyczyna: zmiana topologii (SW_003)                  â”‚
â”‚ â€˘ WspĂłĹ‚czynnik korelacji: 0.87                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

**Kategorie przyczyn (MUST):**

| Kategoria | Opis | PrzykĹ‚ady |
|-----------|------|-----------|
| **ZMIANA TOPOLOGII** | Zmiana struktury sieci | Switch OPENâ†’CLOSED, dodanie/usuniÄ™cie elementu |
| **ZMIANA STANU ELEMENTU** | Zmiana in_service | Element wĹ‚Ä…czony/wyĹ‚Ä…czony |
| **ZMIANA PARAMETRĂ“W** | Zmiana setpointĂłw | P, Q, tap_position, voltage setpoint |
| **ZMIANA TYPU KATALOGOWEGO** | Zmiana type_ref | Inny typ linii/transformatora |

---

## 5. ReguĹ‚y porĂłwnaĹ„ inĹĽynierskich (BINDING)

### 5.1 ReguĹ‚y IEC 60909 (Short Circuit)

| ReguĹ‚a | Opis | Konsekwencja |
|--------|------|--------------|
| SC-CMP-001 | PorĂłwnania zwarciowe WYĹÄ„CZNIE per BUS | PorĂłwnywanie Ikâ€ł na linii = ZABRONIONE |
| SC-CMP-002 | Zwarcie musi mieÄ‡ ten sam typ | 3-fazowe vs 1-fazowe = NOT COMPARABLE |
| SC-CMP-003 | WspĂłĹ‚czynnik c musi byÄ‡ identyczny | c_max vs c_min = NOT COMPARABLE |
| SC-CMP-004 | Metoda obliczeniowa musi byÄ‡ identyczna | IEC-B vs IEC-C = NOT COMPARABLE |

### 5.2 ReguĹ‚y Power Flow (PF)

| ReguĹ‚a | Opis | Konsekwencja |
|--------|------|--------------|
| PF-CMP-001 | PrzepĹ‚ywy liniowe per instancja (LINE/TRAFO) | Î”I, Î”P, Î”Q wzdĹ‚uĹĽ konkretnej linii |
| PF-CMP-002 | NapiÄ™cia per BUS | Î”U zawsze na wÄ™Ĺşle |
| PF-CMP-003 | Kierunek przepĹ‚ywu musi byÄ‡ uwzglÄ™dniony | P > 0 (od), P < 0 (do) |
| PF-CMP-004 | RĂłĹĽne topologie = jawne oznaczenie | DIFFERENT TOPOLOGY w kolumnie Status |

### 5.3 ReguĹ‚y porĂłwnywalnoĹ›ci (Comparability)

| Sytuacja | Status | DziaĹ‚anie |
|----------|--------|-----------|
| Element istnieje w obu Cases | COMPARABLE | Oblicz Î”, %Î” |
| Element istnieje tylko w Case A | NOT IN B | WyĹ›wietl "Element usuniÄ™ty" |
| Element istnieje tylko w Case B | NOT IN A | WyĹ›wietl "Element dodany" |
| RĂłĹĽna topologia (wyspy) | DIFFERENT TOPOLOGY | WyĹ›wietl ostrzeĹĽenie, Î” = N/A |
| RĂłĹĽny typ analizy | NOT COMPARABLE | Blokada porĂłwnania, komunikat bĹ‚Ä™du |
| Brak wynikĂłw (NONE/OUTDATED) | RESULTS REQUIRED | Wymagaj obliczenia przed porĂłwnaniem |

---

## 6. Kontekst i spĂłjnoĹ›Ä‡ (MUST)

### 6.1 NagĹ‚Ăłwek porĂłwnania

**KaĹĽde porĂłwnanie MUSI jawnie pokazywaÄ‡ kontekst:**

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PORĂ“WNANIE PRZYPADKĂ“W                                           â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Case A:    SC_CASE_001 (Zwarcie na BUS_BoundaryNode)                     â”‚
â”‚ Case B:    SC_CASE_002 (Zwarcie na BUS_BoundaryNode â€” wariant bez SW_003)â”‚
â”‚ Run:       2026-01-28 19:45:12 / 2026-01-28 19:52:33           â”‚
â”‚ Analysis:  Short Circuit (IEC 60909, c_max=1.1)                â”‚
â”‚ Target:    BUS (Ikâ€ł, ip, Ith)                                  â”‚
â”‚ Snapshot:  snap_abc123 / snap_def456                           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

**Pola kontekstu OBOWIÄ„ZKOWE:**

| Pole | Opis |
|------|------|
| Case A / Case B | Nazwy porĂłwnywanych przypadkĂłw |
| Run | Timestamp ostatniego obliczenia |
| Analysis | Typ analizy (PF / SC) + parametry |
| Target | Typ elementĂłw porĂłwnywanych (BUS / LINE) |
| Snapshot | Identyfikatory snapshotĂłw modelu |

### 6.2 Integracja z Results Browser

| Akcja w Results Browser | Reakcja Comparison UI |
|-------------------------|----------------------|
| WybĂłr Case A | Ustawienie jako baza porĂłwnania |
| WybĂłr Case B | Ustawienie jako cel porĂłwnania |
| KlikniÄ™cie "PorĂłwnaj" | Otwarcie widoku porĂłwnawczego |

### 6.3 Integracja z Element Inspector

| Akcja w Comparison Table | Reakcja Element Inspector |
|--------------------------|---------------------------|
| KlikniÄ™cie wiersza elementu | Otwarcie Property Grid dla elementu |
| KlikniÄ™cie "WHY" | Otwarcie panelu przyczyn dla elementu |

### 6.4 Integracja z Topology Tree

| Akcja w drzewie | Reakcja Comparison UI |
|-----------------|----------------------|
| Zaznaczenie elementu | PodĹ›wietlenie wiersza w tabeli |
| RozwiniÄ™cie kategorii | Filtrowanie tabeli do kategorii |

---

## 7. Scenariusze poprawne (ALLOWED)

### 7.1 Scenariusz: PorĂłwnanie wpĹ‚ywu stanu Ĺ‚Ä…cznika

```
DANE WEJĹšCIOWE:
- Case A: SC_CASE_BASE (SW_003 = OPEN)
- Case B: SC_CASE_VARIANT (SW_003 = CLOSED)
- Analiza: Short Circuit na BUS_007

WYNIK:
- Tabela pokazuje Î”Ikâ€ł na BUS_007
- WHY Panel wskazuje: "Zmiana topologii: SW_003 OPEN â†’ CLOSED"
- Overlay na SLD koloruje BUS_007 i SW_003
```

### 7.2 Scenariusz: PorĂłwnanie wielokrotne scenariuszy obciÄ…ĹĽenia

```
DANE WEJĹšCIOWE:
- Case A: PF_WINTER_PEAK (obciÄ…ĹĽenie zimowe szczytowe)
- Case B: PF_SUMMER_MIN (obciÄ…ĹĽenie letnie minimalne)
- Case C: PF_MAINTENANCE (z wyĹ‚Ä…czonÄ… liniÄ… L5)
- Analiza: Power Flow

WYNIK:
- Tabela A/B/C z kolumnÄ… Range
- WHY Panel per element pokazuje rĂłĹĽnice obciÄ…ĹĽeĹ„ i topologii
```

### 7.3 Scenariusz: PorĂłwnanie wariantu z bazÄ…

```
DANE WEJĹšCIOWE:
- Base Case: PF_BASELINE
- Variant: PF_BASELINE + nowy kabel C12
- Analiza: Power Flow

WYNIK:
- Tabela pokazuje wpĹ‚yw nowego kabla na przepĹ‚ywy
- Nowe elementy oznaczone jako "NOT IN BASE"
- WHY Panel: "Element dodany: CABLE_012"
```

---

## 8. Scenariusze zabronione (FORBIDDEN)

### 8.1 PorĂłwnywanie wynikĂłw bez wskazania elementu

**FORBIDDEN:**
```
âťŚ "Ikâ€ł wzrosĹ‚o o 15%"  (Gdzie? Na jakim elemencie?)
```

**CORRECT:**
```
âś“ "BUS_007: Ikâ€ł wzrosĹ‚o o 15% (z 12.5 kA do 14.4 kA)"
```

### 8.2 PorĂłwnywanie zwarÄ‡ na linii zamiast na BUS

**FORBIDDEN:**
```
âťŚ PorĂłwnanie Ikâ€ł na LINE_001 (linia nie ma Ikâ€ł â€” zwarcie jest na BUS)
```

**CORRECT:**
```
âś“ PorĂłwnanie Ikâ€ł na BUS_FROM (poczÄ…tek linii) lub BUS_TO (koniec linii)
```

### 8.3 PorĂłwnywanie Cases rĂłĹĽnych typĂłw

**FORBIDDEN:**
```
âťŚ PorĂłwnanie Power Flow Case z Short Circuit Case
   Status: NOT COMPARABLE â€” rĂłĹĽne typy analiz
```

### 8.4 PorĂłwnywanie bez aktualnych wynikĂłw

**FORBIDDEN:**
```
âťŚ PorĂłwnanie Case z result_state = OUTDATED
   Wymagane: Ponowne obliczenie przed porĂłwnaniem
```

### 8.5 PorĂłwnywanie z ukryciem przyczyn

**FORBIDDEN:**
```
âťŚ "WartoĹ›ci siÄ™ rĂłĹĽniÄ…" (bez wskazania przyczyny)
```

**CORRECT:**
```
âś“ WHY Panel zawsze dostÄ™pny z listÄ… zidentyfikowanych przyczyn
```

---

## 9. Wydruk i audyt (MUST)

### 9.1 Raport porĂłwnawczy (Comparison Report)

**Widok porĂłwnawczy MUSI byÄ‡ drukowalny jako PDF zawierajÄ…cy:**

| Sekcja | ZawartoĹ›Ä‡ |
|--------|-----------|
| NagĹ‚Ăłwek | Data, wersja obliczeĹ„, nazwy Cases |
| Kontekst | Typ analizy, snapshot IDs, parametry |
| Tabela rĂłĹĽnic | PeĹ‚na tabela z Î” i %Î” |
| Legenda kolorĂłw | WyjaĹ›nienie progĂłw kolorystycznych |
| Podsumowanie przyczyn | Agregat WHY Panel dla top zmian |
| Stopka | Timestamp generowania, checksum |

### 9.2 ReguĹ‚a: Ekran = PDF

**BINDING:** ZawartoĹ›Ä‡ ekranu MUSI byÄ‡ identyczna z zawartoĹ›ciÄ… PDF.

| Aspekt | Ekran | PDF |
|--------|-------|-----|
| Tabela | 100% zawartoĹ›ci | 100% zawartoĹ›ci |
| Kolumny | Wszystkie widoczne | Wszystkie widoczne |
| Overlay | Widoczny | Widoczny (screenshot lub render) |
| Legenda | Widoczna | Widoczna |

### 9.3 Metadane audytowe

**KaĹĽdy raport MUSI zawieraÄ‡:**

| Pole | Opis |
|------|------|
| `report_id` | UUID raportu |
| `generated_at` | Timestamp generowania |
| `case_a_snapshot_fingerprint` | Hash snapshotu Case A |
| `case_b_snapshot_fingerprint` | Hash snapshotu Case B |
| `comparison_checksum` | Hash caĹ‚ego raportu |
| `system_version` | Wersja MV-DESIGN-PRO |

---

## 10. Odniesienia do benchmark / DIgSILENT benchmark

### 10.1 benchmark â€” Output Window

| Funkcja PF | Odpowiednik MV-DESIGN-PRO |
|------------|---------------------------|
| Study Case Comparison | Case Comparison Table |
| Result Diff View | Î”Column + %Î”Column |
| Highlight Changes | Overlay rĂłĹĽnic na SLD |
| Cross-reference | WHY Panel |

### 10.2 benchmark â€” Study Manager

| Funkcja benchmark | Odpowiednik MV-DESIGN-PRO |
|--------------|---------------------------|
| Scenario Comparison | Multi-Case Comparison (A/B/C) |
| What-If Analysis | Variant vs Base Case |
| Comparison Report | PDF Export |

### 10.3 WspĂłlny paradygmat

**ZarĂłwno benchmark jak i benchmark stosujÄ…:**
1. PorĂłwnania per-element (nie agregowane)
2. Jasne wskazanie ĹşrĂłdĹ‚a rĂłĹĽnic
3. IntegracjÄ™ z diagramem jednokreskowym
4. Eksport do raportu z peĹ‚nym kontekstem

---

## 11. PrzejĹ›cia trybĂłw (Mode Gating)

### 11.1 DostÄ™pnoĹ›Ä‡ porĂłwnaĹ„ w trybach

| Tryb systemowy | DostÄ™pnoĹ›Ä‡ Comparison UI |
|----------------|--------------------------|
| MODEL_EDIT | ZABLOKOWANE â€” brak wynikĂłw do porĂłwnania |
| CASE_CONFIG | ZABLOKOWANE â€” wyniki mogÄ… byÄ‡ nieaktualne |
| RESULT_VIEW | DOZWOLONE â€” wynik FRESH wymagany |

### 11.2 Warunki dostÄ™pu

| Warunek | Status |
|---------|--------|
| Case A: result_state = FRESH | WYMAGANY |
| Case B: result_state = FRESH | WYMAGANY |
| Case A.case_type = Case B.case_type | WYMAGANY |
| Snapshot A i B istniejÄ… | WYMAGANY |

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
                    "description": "SW_003: OPEN â†’ CLOSED"
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
| 2026-01-28 | 1.0 | Utworzenie dokumentu â€” PHASE 2.x.6 DOC-LOCKED |

---

**KONIEC KONTRAKTU CASE COMPARISON UI**

