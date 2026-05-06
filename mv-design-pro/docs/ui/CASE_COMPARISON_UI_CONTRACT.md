# Case / Variant Comparison UI Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 2.x.6  
**Reference:** SYSTEM_SPEC.md, ARCHITECTURE.md, PLANS.md, CANONICAL_COMPLIANCE.md  
**Standard:** DIgSILENT benchmark / benchmark parity

---

## 1. Cel dokumentu

Niniejszy dokument definiuje **kanoniczny interfejs porĂłwnywania Case / Variant / Study**,
umoĹĽliwiający **inĹĽynierską analizę rĂłĹĽnic** zgodnie z praktyką DIgSILENT benchmark oraz benchmark.

**Pytanie fundamentalne:**
> **CO się zmieniĹ‚o, GDZIE, o ILE i DLACZEGO?**

---

## 2. Definicje pojęć (BINDING)

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

**Variant** to Case z modyfikacjami topologii lub parametrĂłw względem Case bazowego.

| Atrybut | Opis |
|---------|------|
| `base_case_id` | UUID przypadku bazowego |
| `variant_name` | Nazwa wariantu |
| `topology_changes` | Lista zmian topologii (dodane/usunięte/zmienione elementy) |
| `parameter_changes` | Lista zmian parametrĂłw (setpointy, stany, type_ref) |

**INVARIANT:** Variant MUSI mieć powiązanie z Case bazowym. Brak orphan Variants.

### 2.3 Study (Studium)

**Study** to zbiĂłr powiązanych Cases/Variants analizowanych wspĂłlnie.

| Atrybut | Opis |
|---------|------|
| `study_id` | UUID studium |
| `study_name` | Nazwa studium |
| `cases` | Lista UUID Cases naleĹĽących do studium |
| `comparison_config` | Konfiguracja porĂłwnaĹ„ (elementy, metryki) |

---

## 3. Zakres porĂłwnaĹ„ (MUST)

### 3.1 ObsĹ‚ugiwane typy porĂłwnaĹ„

| Typ porĂłwnania | Opis | Status |
|----------------|------|--------|
| Case A vs Case B | PorĂłwnanie dwĂłch przypadkĂłw | MUST |
| Case A vs Case B vs Case C | PorĂłwnanie wielokrotne (A/B/C/...) | MUST |
| Variant vs Base Case | PorĂłwnanie wariantu z bazą | MUST |
| Cross-Study Comparison | PorĂłwnanie Cases z rĂłĹĽnych studiĂłw | SHOULD |

### 3.2 PorĂłwnywane wielkoĹ›ci — Power Flow (PF)

| WielkoĹ›ć | Symbol | Jednostka | Element | FormuĹ‚a rĂłĹĽnicy |
|----------|--------|-----------|---------|-----------------|
| Napięcie węzĹ‚a | U | kV / p.u. | BUS | ΔU = U_B - U_A |
| Moc czynna przepĹ‚ywu | P | MW | LINE / TRAFO | ΔP = P_B - P_A |
| Moc bierna przepĹ‚ywu | Q | Mvar | LINE / TRAFO | ΔQ = Q_B - Q_A |
| Prąd linii | I | A | LINE / TRAFO | ΔI = I_B - I_A |
| ObciąĹĽenie termiczne | Loading | % | LINE / TRAFO | ΔLoading = Loading_B - Loading_A |
| Straty | P_loss | kW | LINE / TRAFO | ΔP_loss = P_loss_B - P_loss_A |

### 3.3 PorĂłwnywane wielkoĹ›ci — Short Circuit (SC)

| WielkoĹ›ć | Symbol | Jednostka | Element | FormuĹ‚a rĂłĹĽnicy |
|----------|--------|-----------|---------|-----------------|
| Prąd zwarciowy początkowy | Ikâ€ł | kA | BUS | ΔIkâ€ł = Ikâ€ł_B - Ikâ€ł_A |
| Prąd udarowy | ip | kA | BUS | Δip = ip_B - ip_A |
| Prąd cieplny | Ith | kA | BUS | ΔIth = Ith_B - Ith_A |
| Impedancja Thevenina | Z_th | Ω | BUS | ΔZ_th = Z_th_B - Z_th_A |
| WspĂłĹ‚czynnik Îş | Îş | - | BUS | ΔÎş = Îş_B - Îş_A |

**BINDING (IEC 60909):** PorĂłwnania zwarciowe MUSZĄ być wykonywane **PER BUS**, NIE per linia.

### 3.4 PorĂłwnywane statusy

| Status | Opis | Prezentacja rĂłĹĽnicy |
|--------|------|---------------------|
| `in_service` | Element w eksploatacji | `True → False`, `False → True` |
| `Switch.state` | Stan Ĺ‚ącznika | `OPEN → CLOSED`, `CLOSED → OPEN` |
| `type_ref` | Referencja typu katalogowego | `TypeA → TypeB`, `None → TypeA` |

---

## 4. Widoki porĂłwnawcze (PF-grade)

### 4.1 Tabela porĂłwnaĹ„ (Comparison Table)

**Struktura tabeli:**

```
â”Ś─────────────────────────────────────────────────────────────────────────────────â”
│                        TABELA PORĂ“WNAĹ: Case A vs Case B                         │
â”ś─────────────┬───────────┬────────────┬────────────┬──────────┬─────────┬────────┤
│ Element     │ Parametr  │  Case A    │  Case B    │    Δ     │   %Δ    │ Status │
â”ś─────────────â”Ľ───────────â”Ľ────────────â”Ľ────────────â”Ľ──────────â”Ľ─────────â”Ľ────────┤
│ BUS_001     │ U [kV]    │   15.00    │   14.85    │  -0.15   │  -1.0%  │   â–Ľ    │
│ BUS_002     │ U [kV]    │   15.00    │   15.12    │  +0.12   │  +0.8%  │   â–˛    │
â”ś─────────────â”Ľ───────────â”Ľ────────────â”Ľ────────────â”Ľ──────────â”Ľ─────────â”Ľ────────┤
│ LINE_001    │ I [A]     │   125.3    │   142.7    │  +17.4   │ +13.9%  │   â–˛    │
│ LINE_001    │ P [MW]    │    2.45    │    2.78    │  +0.33   │ +13.5%  │   â–˛    │
│ LINE_001    │ Q [Mvar]  │    0.82    │    0.94    │  +0.12   │ +14.6%  │   â–˛    │
â”ś─────────────â”Ľ───────────â”Ľ────────────â”Ľ────────────â”Ľ──────────â”Ľ─────────â”Ľ────────┤
│ TRAFO_001   │ Loading % │   72.5     │   85.3     │  +12.8   │ +17.7%  │   âš     │
â”ś─────────────â”Ľ───────────â”Ľ────────────â”Ľ────────────â”Ľ──────────â”Ľ─────────â”Ľ────────┤
│ SW_001      │ State     │   OPEN     │  CLOSED    │    —     │    —    │ ZMIANA │
└─────────────┴───────────┴────────────┴────────────┴──────────┴─────────┴────────â”
```

**Kolumny OBOWIĄZKOWE:**

| Kolumna | Opis | Sortowanie |
|---------|------|------------|
| Element | Identyfikator elementu (nazwa + typ) | Alfabetycznie |
| Parametr | Nazwa wielkoĹ›ci + jednostka | StaĹ‚a kolejnoĹ›ć |
| Case A | WartoĹ›ć w Case A | - |
| Case B | WartoĹ›ć w Case B | - |
| Δ | RĂłĹĽnica absolutna (B - A) | Malejąco wg |Δ| |
| %Δ | RĂłĹĽnica procentowa ((B-A)/A Ă— 100%) | Malejąco wg |%Δ| |
| Status | Indykator kierunku zmiany | - |

**Indykatory statusu:**

| Indykator | Znaczenie |
|-----------|-----------|
| â–˛ | Wzrost wartoĹ›ci |
| â–Ľ | Spadek wartoĹ›ci |
| âš  | Przekroczenie progu ostrzeĹĽenia |
| âś– | Przekroczenie progu bĹ‚ędu |
| = | Brak zmiany (opcjonalnie ukryte) |
| ZMIANA | Zmiana stanu binarnego |
| N/A | Brak porĂłwnywalnoĹ›ci |

### 4.2 Tabela porĂłwnaĹ„ wielokrotnych (A/B/C/...)

```
â”Ś────────────────────────────────────────────────────────────────────────────────────────────â”
│                    TABELA PORĂ“WNAĹ: Case A vs Case B vs Case C                              │
â”ś─────────────┬───────────┬──────────┬──────────┬──────────┬──────────┬──────────┬───────────┤
│ Element     │ Parametr  │  Case A  │  Case B  │  Case C  │ ΔA→B     │ ΔA→C     │ Range     │
â”ś─────────────â”Ľ───────────â”Ľ──────────â”Ľ──────────â”Ľ──────────â”Ľ──────────â”Ľ──────────â”Ľ───────────┤
│ BUS_001     │ U [kV]    │  15.00   │  14.85   │  15.20   │  -0.15   │  +0.20   │ 0.35 kV   │
│ LINE_001    │ I [A]     │  125.3   │  142.7   │  118.2   │  +17.4   │   -7.1   │ 24.5 A    │
└─────────────┴───────────┴──────────┴──────────┴──────────┴──────────┴──────────┴───────────â”
```

**Kolumna Range:** Zakres wartoĹ›ci max - min dla danego elementu/parametru.

### 4.3 Overlay rĂłĹĽnic na SLD (Difference Overlay)

**Zasada:** RĂłĹĽnice są prezentowane jako **nakĹ‚adka** na diagramie SLD, **BEZ modyfikacji warstwy CAD**.

```
â”Ś─────────────────────────────────────────────────────────────────â”
│                    SLD — OVERLAY PORĂ“WNANIA                      │
│                                                                 │
│   Warstwa bazowa (SLD):                                         │
│   â•â•â•â•â•¦â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•¦â•â•â•â•                               │
│       â•‘                    â•‘                                    │
│                                                                 │
│   Warstwa overlay (rĂłĹĽnice):                                    │
│                                                                 │
│      [ΔU=-0.15kV]       [ΔU=+0.12kV]                           │
│         â–Ľ                   â–˛                                   │
│      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•                                 │
│           [ΔI=+17.4A â–˛]                                        │
│                                                                 │
│   Legenda kolorĂłw:                                             │
│   â–¬â–¬â–¬ Zielony: zmiana ≤5%                                      │
│   â–¬â–¬â–¬ Ĺ»ĂłĹ‚ty:   zmiana 5-15%                                    │
│   â–¬â–¬â–¬ Czerwony: zmiana >15%                                    │
└─────────────────────────────────────────────────────────────────â”
```

**BINDING:** Overlay rĂłĹĽnic NIE modyfikuje symboli SLD ani NetworkModel.

**Kodowanie kolorystyczne overlay:**

| PrĂłg %Δ | Kolor | Znaczenie |
|---------|-------|-----------|
| |%Δ| ≤ 5% | Zielony | Zmiana minimalna |
| 5% < |%Δ| ≤ 15% | Ĺ»ĂłĹ‚ty | Zmiana umiarkowana |
| |%Δ| > 15% | Czerwony | Zmiana istotna |
| N/A | Szary | Brak porĂłwnywalnoĹ›ci |

### 4.4 Panel przyczyn (WHY Panel)

**Cel:** OdpowiedĹş na pytanie **DLACZEGO** wartoĹ›ci się rĂłĹĽnią.

```
â”Ś─────────────────────────────────────────────────────────────────â”
│                    PANEL PRZYCZYN RĂ“Ĺ»NIC                         │
â”ś─────────────────────────────────────────────────────────────────┤
│ Element: LINE_001                                               │
│ Parametr: I [A]                                                 │
│ Δ = +17.4 A (+13.9%)                                           │
â”ś─────────────────────────────────────────────────────────────────┤
│ PRZYCZYNY ZIDENTYFIKOWANE:                                      │
│                                                                 │
│ 1. ZMIANA TOPOLOGII                                             │
│    └─ SW_003 (Ĺącznik): OPEN → CLOSED                          │
│       WpĹ‚yw: Zmiana przepĹ‚ywu mocy na alternatywnej Ĺ›cieĹĽce    │
│                                                                 │
│ 2. ZMIANA STANU ELEMENTU                                        │
│    └─ LOAD_005: in_service True → False                        │
│       WpĹ‚yw: Zmniejszenie obciąĹĽenia na feederze               │
│                                                                 │
│ 3. ZMIANA PARAMETRĂ“W                                            │
│    └─ SOURCE_001: P_setpoint 5.0 MW → 6.2 MW                   │
│       WpĹ‚yw: Wzrost generacji wpĹ‚ywa na przepĹ‚yw               │
│                                                                 │
│ 4. ZMIANA TYPU KATALOGOWEGO                                     │
│    └─ Brak zmian typu                                          │
â”ś─────────────────────────────────────────────────────────────────┤
│ DIAGNOSTYKA:                                                    │
│ • GĹ‚Ăłwna przyczyna: zmiana topologii (SW_003)                  │
│ • WspĂłĹ‚czynnik korelacji: 0.87                                 │
└─────────────────────────────────────────────────────────────────â”
```

**Kategorie przyczyn (MUST):**

| Kategoria | Opis | PrzykĹ‚ady |
|-----------|------|-----------|
| **ZMIANA TOPOLOGII** | Zmiana struktury sieci | Switch OPEN→CLOSED, dodanie/usunięcie elementu |
| **ZMIANA STANU ELEMENTU** | Zmiana in_service | Element wĹ‚ączony/wyĹ‚ączony |
| **ZMIANA PARAMETRĂ“W** | Zmiana setpointĂłw | P, Q, tap_position, voltage setpoint |
| **ZMIANA TYPU KATALOGOWEGO** | Zmiana type_ref | Inny typ linii/transformatora |

---

## 5. ReguĹ‚y porĂłwnaĹ„ inĹĽynierskich (BINDING)

### 5.1 ReguĹ‚y IEC 60909 (Short Circuit)

| ReguĹ‚a | Opis | Konsekwencja |
|--------|------|--------------|
| SC-CMP-001 | PorĂłwnania zwarciowe WYĹĄCZNIE per BUS | PorĂłwnywanie Ikâ€ł na linii = ZABRONIONE |
| SC-CMP-002 | Zwarcie musi mieć ten sam typ | 3-fazowe vs 1-fazowe = NOT COMPARABLE |
| SC-CMP-003 | WspĂłĹ‚czynnik c musi być identyczny | c_max vs c_min = NOT COMPARABLE |
| SC-CMP-004 | Metoda obliczeniowa musi być identyczna | IEC-B vs IEC-C = NOT COMPARABLE |

### 5.2 ReguĹ‚y Power Flow (PF)

| ReguĹ‚a | Opis | Konsekwencja |
|--------|------|--------------|
| PF-CMP-001 | PrzepĹ‚ywy liniowe per instancja (LINE/TRAFO) | ΔI, ΔP, ΔQ wzdĹ‚uĹĽ konkretnej linii |
| PF-CMP-002 | Napięcia per BUS | ΔU zawsze na węĹşle |
| PF-CMP-003 | Kierunek przepĹ‚ywu musi być uwzględniony | P > 0 (od), P < 0 (do) |
| PF-CMP-004 | RĂłĹĽne topologie = jawne oznaczenie | DIFFERENT TOPOLOGY w kolumnie Status |

### 5.3 ReguĹ‚y porĂłwnywalnoĹ›ci (Comparability)

| Sytuacja | Status | DziaĹ‚anie |
|----------|--------|-----------|
| Element istnieje w obu Cases | COMPARABLE | Oblicz Δ, %Δ |
| Element istnieje tylko w Case A | NOT IN B | WyĹ›wietl "Element usunięty" |
| Element istnieje tylko w Case B | NOT IN A | WyĹ›wietl "Element dodany" |
| RĂłĹĽna topologia (wyspy) | DIFFERENT TOPOLOGY | WyĹ›wietl ostrzeĹĽenie, Δ = N/A |
| RĂłĹĽny typ analizy | NOT COMPARABLE | Blokada porĂłwnania, komunikat bĹ‚ędu |
| Brak wynikĂłw (NONE/OUTDATED) | RESULTS REQUIRED | Wymagaj obliczenia przed porĂłwnaniem |

---

## 6. Kontekst i spĂłjnoĹ›ć (MUST)

### 6.1 NagĹ‚Ăłwek porĂłwnania

**KaĹĽde porĂłwnanie MUSI jawnie pokazywać kontekst:**

```
â”Ś─────────────────────────────────────────────────────────────────â”
│ PORĂ“WNANIE PRZYPADKĂ“W                                           │
â”ś─────────────────────────────────────────────────────────────────┤
│ Case A:    SC_CASE_001 (Zwarcie na BUS_BoundaryNode)                     │
│ Case B:    SC_CASE_002 (Zwarcie na BUS_BoundaryNode — wariant bez SW_003)│
│ Run:       2026-01-28 19:45:12 / 2026-01-28 19:52:33           │
│ Analysis:  Short Circuit (IEC 60909, c_max=1.1)                │
│ Target:    BUS (Ikâ€ł, ip, Ith)                                  │
│ Snapshot:  snap_abc123 / snap_def456                           │
└─────────────────────────────────────────────────────────────────â”
```

**Pola kontekstu OBOWIĄZKOWE:**

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
| Kliknięcie "PorĂłwnaj" | Otwarcie widoku porĂłwnawczego |

### 6.3 Integracja z Element Inspector

| Akcja w Comparison Table | Reakcja Element Inspector |
|--------------------------|---------------------------|
| Kliknięcie wiersza elementu | Otwarcie Property Grid dla elementu |
| Kliknięcie "WHY" | Otwarcie panelu przyczyn dla elementu |

### 6.4 Integracja z Topology Tree

| Akcja w drzewie | Reakcja Comparison UI |
|-----------------|----------------------|
| Zaznaczenie elementu | PodĹ›wietlenie wiersza w tabeli |
| Rozwinięcie kategorii | Filtrowanie tabeli do kategorii |

---

## 7. Scenariusze poprawne (ALLOWED)

### 7.1 Scenariusz: PorĂłwnanie wpĹ‚ywu stanu Ĺ‚ącznika

```
DANE WEJĹšCIOWE:
- Case A: SC_CASE_BASE (SW_003 = OPEN)
- Case B: SC_CASE_VARIANT (SW_003 = CLOSED)
- Analiza: Short Circuit na BUS_007

WYNIK:
- Tabela pokazuje ΔIkâ€ł na BUS_007
- WHY Panel wskazuje: "Zmiana topologii: SW_003 OPEN → CLOSED"
- Overlay na SLD koloruje BUS_007 i SW_003
```

### 7.2 Scenariusz: PorĂłwnanie wielokrotne scenariuszy obciąĹĽenia

```
DANE WEJĹšCIOWE:
- Case A: PF_WINTER_PEAK (obciąĹĽenie zimowe szczytowe)
- Case B: PF_SUMMER_MIN (obciąĹĽenie letnie minimalne)
- Case C: PF_MAINTENANCE (z wyĹ‚ączoną linią L5)
- Analiza: Power Flow

WYNIK:
- Tabela A/B/C z kolumną Range
- WHY Panel per element pokazuje rĂłĹĽnice obciąĹĽeĹ„ i topologii
```

### 7.3 Scenariusz: PorĂłwnanie wariantu z bazą

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

### 8.2 PorĂłwnywanie zwarć na linii zamiast na BUS

**FORBIDDEN:**
```
âťŚ PorĂłwnanie Ikâ€ł na LINE_001 (linia nie ma Ikâ€ł — zwarcie jest na BUS)
```

**CORRECT:**
```
âś“ PorĂłwnanie Ikâ€ł na BUS_FROM (początek linii) lub BUS_TO (koniec linii)
```

### 8.3 PorĂłwnywanie Cases rĂłĹĽnych typĂłw

**FORBIDDEN:**
```
âťŚ PorĂłwnanie Power Flow Case z Short Circuit Case
   Status: NOT COMPARABLE — rĂłĹĽne typy analiz
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
âťŚ "WartoĹ›ci się rĂłĹĽnią" (bez wskazania przyczyny)
```

**CORRECT:**
```
âś“ WHY Panel zawsze dostępny z listą zidentyfikowanych przyczyn
```

---

## 9. Wydruk i audyt (MUST)

### 9.1 Raport porĂłwnawczy (Comparison Report)

**Widok porĂłwnawczy MUSI być drukowalny jako PDF zawierający:**

| Sekcja | ZawartoĹ›ć |
|--------|-----------|
| NagĹ‚Ăłwek | Data, wersja obliczeĹ„, nazwy Cases |
| Kontekst | Typ analizy, snapshot IDs, parametry |
| Tabela rĂłĹĽnic | PeĹ‚na tabela z Δ i %Δ |
| Legenda kolorĂłw | WyjaĹ›nienie progĂłw kolorystycznych |
| Podsumowanie przyczyn | Agregat WHY Panel dla top zmian |
| Stopka | Timestamp generowania, checksum |

### 9.2 ReguĹ‚a: Ekran = PDF

**BINDING:** ZawartoĹ›ć ekranu MUSI być identyczna z zawartoĹ›cią PDF.

| Aspekt | Ekran | PDF |
|--------|-------|-----|
| Tabela | 100% zawartoĹ›ci | 100% zawartoĹ›ci |
| Kolumny | Wszystkie widoczne | Wszystkie widoczne |
| Overlay | Widoczny | Widoczny (screenshot lub render) |
| Legenda | Widoczna | Widoczna |

### 9.3 Metadane audytowe

**KaĹĽdy raport MUSI zawierać:**

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

### 10.1 benchmark — Output Window

| Funkcja PF | Odpowiednik MV-DESIGN-PRO |
|------------|---------------------------|
| Study Case Comparison | Case Comparison Table |
| Result Diff View | ΔColumn + %ΔColumn |
| Highlight Changes | Overlay rĂłĹĽnic na SLD |
| Cross-reference | WHY Panel |

### 10.2 benchmark — Study Manager

| Funkcja benchmark | Odpowiednik MV-DESIGN-PRO |
|--------------|---------------------------|
| Scenario Comparison | Multi-Case Comparison (A/B/C) |
| What-If Analysis | Variant vs Base Case |
| Comparison Report | PDF Export |

### 10.3 WspĂłlny paradygmat

**ZarĂłwno benchmark jak i benchmark stosują:**
1. PorĂłwnania per-element (nie agregowane)
2. Jasne wskazanie ĹşrĂłdĹ‚a rĂłĹĽnic
3. Integrację z diagramem jednokreskowym
4. Eksport do raportu z peĹ‚nym kontekstem

---

## 11. PrzejĹ›cia trybĂłw (Mode Gating)

### 11.1 DostępnoĹ›ć porĂłwnaĹ„ w trybach

| Tryb systemowy | DostępnoĹ›ć Comparison UI |
|----------------|--------------------------|
| MODEL_EDIT | ZABLOKOWANE — brak wynikĂłw do porĂłwnania |
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

