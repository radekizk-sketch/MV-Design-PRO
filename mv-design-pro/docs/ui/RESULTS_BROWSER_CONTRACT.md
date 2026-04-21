# Results Browser Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 1.z  
**Reference:** SYSTEM_SPEC.md, ARCHITECTURE.md, benchmark/benchmark UI Standards  
**Standard:** DIgSILENT benchmark / benchmark UI Parity

---

## 1. Cel dokumentu

Niniejszy dokument definiuje **kanoniczny kontrakt Results Browser** â€” centralnego narzÄ™dzia eksploracji wynikĂłw obliczeĹ„ jako alternatywy dla nawigacji SLD.

**Filozofia:** Results Browser + SLD = dwa rĂłwnorzÄ™dne okna do tych samych danych.

---

## 2. Definicje pojÄ™Ä‡ (BINDING)

### 2.1 Results Browser

**Results Browser** to dedykowany panel UI umoĹĽliwiajÄ…cy eksploracjÄ™ wynikĂłw obliczeĹ„ w strukturze hierarchicznej, niezaleĹĽnie od ukĹ‚adu graficznego SLD.

| Atrybut | Opis |
|---------|------|
| Panel ID | Unikalny identyfikator panelu w UI |
| View Mode | TABLE / TREE / HYBRID |
| Active Filters | Lista aktywnych filtrĂłw (violations, zone, voltage) |
| Sort Order | Aktywna kolumna i kierunek sortowania |
| Selected Element | Aktualnie zaznaczony element (sync z SLD) |

### 2.2 Result Tree Hierarchy

```
PROJECT
  â””â”€â”€ STUDY
        â””â”€â”€ CASE
              â””â”€â”€ SNAPSHOT
                    â””â”€â”€ ANALYSIS RUN
                          â”śâ”€â”€ BUSES (node results)
                          â”śâ”€â”€ VOLTAGE PROFILE (BUS-centric)
                          â”śâ”€â”€ LINES (branch results)
                          â”śâ”€â”€ TRANSFORMERS (branch results)
                          â”śâ”€â”€ SOURCES (source results)
                          â”śâ”€â”€ LOADS (load results)
                          â””â”€â”€ PROTECTIONS (P11 Proof available)
```

---

## 3. Hierarchia drzewa wynikĂłw (BINDING)

### 3.1 Poziomy hierarchii

| Poziom | Opis | Expandable | Default State |
|--------|------|------------|---------------|
| Project | Projekt gĹ‚Ăłwny | âś“ | Expanded |
| Study | Studium (grupa Cases) | âś“ | Expanded |
| Case | Przypadek obliczeniowy | âś“ | Expanded |
| Snapshot | ZamroĹĽony stan modelu | âś“ | Collapsed |
| Analysis Run | Pojedynczy run obliczeĹ„ | âś“ | Collapsed |
| Target Category | BUS/LINE/TRAFO/SOURCE/LOAD | âś“ | Collapsed |
| Element | Konkretny element sieci | â€” | N/A |

### 3.2 Metadata na kaĹĽdym poziomie

**Case Level:**
| Pole | Opis |
|------|------|
| Case Name | Nazwa przypadku |
| Case Type | SHORT_CIRCUIT / POWER_FLOW |
| Result Status | NONE / FRESH / OUTDATED |
| Last Computed | Timestamp ostatniego obliczenia |
| Violations Count | Liczba przekroczeĹ„ norm |

**Run Level:**
| Pole | Opis |
|------|------|
| Run ID | UUID biegu obliczeĹ„ |
| Run Timestamp | Data i czas uruchomienia |
| Solver Version | Wersja solvera |
| Duration [ms] | Czas obliczeĹ„ |
| Status | SUCCESS / WARNING / ERROR |

---

## 4. Tabele wynikĂłw (benchmark-grade)

### 4.1 Tabela wynikĂłw zwarciowych (SC Results Table)

**Kolumny OBOWIÄ„ZKOWE:**

| Kolumna | Opis | Format | Sortowalna |
|---------|------|--------|------------|
| Bus ID | Identyfikator wÄ™zĹ‚a | UUID | âś“ |
| Bus Name | Nazwa wÄ™zĹ‚a | String | âś“ |
| Voltage [kV] | NapiÄ™cie znamionowe | Float, 2 dec | âś“ |
| Fault Type | Typ zwarcia | 3PH / 1PH / 2PH | âś“ |
| Ik_max [kA] | PrÄ…d zwarciowy max | Float, 2 dec | âś“ |
| Ik_min [kA] | PrÄ…d zwarciowy min | Float, 2 dec | âś“ |
| ip [kA] | PrÄ…d udarowy | Float, 2 dec | âś“ |
| Ith [kA] | PrÄ…d cieplny | Float, 2 dec | âś“ |
| Sk [MVA] | Moc zwarciowa | Float, 1 dec | âś“ |
| X/R | Stosunek X/R | Float, 2 dec | âś“ |
| Status | OK / WARNING / VIOLATION | Enum | âś“ |

### 4.2 Tabela wynikĂłw rozpĹ‚ywu mocy (PF Results Table)

**Kolumny OBOWIÄ„ZKOWE:**

| Kolumna | Opis | Format |
|---------|------|--------|
| Element ID | Identyfikator elementu | UUID |
| Element Name | Nazwa elementu | String |
| Element Type | BUS / LINE / TRAFO | Enum |
| U [kV] | NapiÄ™cie (BUS) | Float, 3 dec |
| U [p.u.] | NapiÄ™cie per unit (BUS) | Float, 3 dec |
| P [MW] | Moc czynna | Float, 3 dec |
| Q [Mvar] | Moc bierna | Float, 3 dec |
| I [A] | PrÄ…d (LINE/TRAFO) | Float, 1 dec |
| Loading [%] | ObciÄ…ĹĽenie termiczne | Float, 1 dec |
| P_loss [kW] | Straty mocy czynnej | Float, 2 dec |
| Status | OK / OVERLOAD / UNDERVOLTAGE | Enum |

### 4.3 Filtrowanie

**Filtry dostÄ™pne:**

| Filtr | Opis | WartoĹ›ci |
|-------|------|----------|
| Violations Only | Tylko przekroczenia | Boolean |
| Voltage Range | Zakres napiÄ™Ä‡ | [U_min, U_max] kV |
| Zone | Strefa / feeder | Zone ID |
| Element Type | Typ elementu | BUS / LINE / TRAFO / ALL |
| Status | Status wyniku | OK / WARNING / VIOLATION |
| Case | Przypadek | Case ID |

### 4.4 Sortowanie

**ReguĹ‚y sortowania:**

1. KlikniÄ™cie nagĹ‚Ăłwka kolumny â†’ sortowanie rosnÄ…ce
2. Drugie klikniÄ™cie â†’ sortowanie malejÄ…ce
3. Trzecie klikniÄ™cie â†’ reset do domyĹ›lnego (unsorted / by name)
4. Wielokolumnowe sortowanie: SHIFT + klik

---

## 5. PorĂłwnania Case / Snapshot (MUST)

### 5.1 Delta View (Comparison Mode)

**Cel:** PorĂłwnanie wynikĂłw miÄ™dzy dwoma (lub trzema) Cases/Snapshots.

**Aktywacja:** 
- Przycisk "Compare" w toolbarze Results Browser
- WybĂłr Case A (baseline), Case B (comparison), opcjonalnie Case C

**Kolumny w trybie porĂłwnania:**

| Kolumna | Opis |
|---------|------|
| Element | Identyfikator elementu |
| Value A | WartoĹ›Ä‡ w Case A |
| Value B | WartoĹ›Ä‡ w Case B |
| Î” (B-A) | RĂłĹĽnica absolutna |
| %Î” | RĂłĹĽnica procentowa |
| Trend | â–˛ IMPROVED / â–Ľ REGRESSED / = NO_CHANGE |

### 5.2 Highlighting zmian

| Trend | Kolor | Znaczenie |
|-------|-------|-----------|
| â–˛ IMPROVED | Zielony (#22C55E) | WartoĹ›Ä‡ poprawiĹ‚a siÄ™ (np. spadek Ikâ€ł) |
| â–Ľ REGRESSED | Czerwony (#EF4444) | WartoĹ›Ä‡ pogorszyĹ‚a siÄ™ |
| = NO_CHANGE | Szary (#9CA3AF) | Brak istotnej zmiany (|%Î”| < 0.1%) |

### 5.3 Progi istotnoĹ›ci

| Rodzaj zmiany | PrĂłg |
|---------------|------|
| Nieistotna | |%Î”| < 0.1% |
| MaĹ‚a | 0.1% â‰¤ |%Î”| < 5% |
| ZnaczÄ…ca | 5% â‰¤ |%Î”| < 15% |
| DuĹĽa | |%Î”| â‰Ą 15% |

---

## 6. Eksport (MUST)

### 6.1 Formaty eksportu

| Format | Opis | Zachowanie |
|--------|------|------------|
| CSV | Comma-separated values | Wszystkie kolumny, UTF-8, separator ; |
| Excel | Microsoft Excel (.xlsx) | Worksheet per Category, formatowanie |
| PDF | Adobe PDF | Landscape, paginated, header/footer |

### 6.2 Opcje eksportu

| Opcja | Opis |
|-------|------|
| All Data | Wszystkie wiersze |
| Visible Only | Tylko widoczne (po filtrach) |
| Selected Only | Tylko zaznaczone |
| Include Metadata | DoĹ‚Ä…cz nagĹ‚Ăłwek z Case/Run info |

### 6.3 Nazwa pliku (deterministyczna)

Format: `{project}_{case}_{analysis}_{timestamp}.{ext}`

PrzykĹ‚ad: `MV_Network_SC_MAX_2026-01-28_1930.xlsx`

---

## 7. Synchronizacja z SLD (BINDING)

### 7.1 ReguĹ‚y synchronizacji

| Akcja w Results Browser | Reakcja w SLD |
|-------------------------|---------------|
| KlikniÄ™cie wiersza | PodĹ›wietlenie elementu na SLD |
| PodwĂłjne klikniÄ™cie | Centrowanie SLD na elemencie |
| Hover nad wierszem | Tooltip z miniaturÄ… SLD (opcjonalne) |

| Akcja w SLD | Reakcja w Results Browser |
|-------------|---------------------------|
| KlikniÄ™cie elementu | PodĹ›wietlenie wiersza + scroll to |
| Hover nad elementem | Highlight wiersza (light background) |

### 7.2 Focus Lock

**Focus Lock** = Results Browser i SLD dzielÄ… wspĂłlny fokus.

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    SINGLE GLOBAL FOCUS                           â”‚
â”‚  Global Focus = (Target Element, Case, Run, Snapshot, Analysis) â”‚
â”‚                                                                  â”‚
â”‚       Results Browser â†â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ SLD Viewer                   â”‚
â”‚              â”‚                           â”‚                       â”‚
â”‚              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                       â”‚
â”‚                        â†“                                         â”‚
â”‚                Element Inspector                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

## 8. Integracje (MUST)

### 8.1 Element Inspector

| Akcja | Reakcja |
|-------|---------|
| Klik wiersza â†’ Inspector | Otwarcie Element Inspector dla elementu |
| Double-click | Inspector + Results tab active |

### 8.2 Topology Tree

| Akcja | Reakcja |
|-------|---------|
| Klik w Tree | Scroll Results Browser do elementu |
| Expand/Collapse w Tree | Odzwierciedlenie w Results Browser |

### 8.3 Global Context Bar

| Pole w Context Bar | ĹąrĂłdĹ‚o |
|--------------------|--------|
| Active Case | Results Browser selection |
| Active Snapshot | Results Browser selection |
| Active Analysis | Results Browser filter |

---

## 9. Tryby eksperckie (EXPERT MODES)

### 9.1 WidocznoĹ›Ä‡ kolumn per tryb

| Tryb | DomyĹ›lne kolumny |
|------|------------------|
| Operator | Name, Status, Voltage, Violation |
| Designer | Name, Status, Voltage, P, Q, I, Loading |
| Analyst | Wszystkie + X/R, Contributions |
| Auditor | Wszystkie + Metadata (Timestamp, User, Diff) |

### 9.2 DomyĹ›lne rozwiniÄ™cia drzewa per tryb

| Tryb | DomyĹ›lne rozwiniÄ™cie |
|------|----------------------|
| Operator | Case â†’ Buses (violations only) |
| Designer | Case â†’ Snapshot â†’ All Categories |
| Analyst | Wszystko rozwiniÄ™te |
| Auditor | Wszystko rozwiniÄ™te + History visible |

---

## 10. Accessibility (a11y)

### 10.1 Screen Reader Support

| Element | ARIA Label |
|---------|------------|
| Results Table | "Results table for {Case Name}, {N} rows" |
| Column Header | "Sort by {Column}, currently {ascending/descending}" |
| Row | "{Element Name}, {Type}, {Status}" |
| Filter | "Filter by {Filter Type}, {N} active filters" |

### 10.2 Keyboard Navigation

| Klawisz | Akcja |
|---------|-------|
| â†‘/â†“ | Nawigacja miÄ™dzy wierszami |
| Enter | OtwĂłrz Element Inspector |
| Ctrl+F | Focus na search box |
| Escape | Zamknij modal / reset filtrow |
| Tab | PrzejdĹş do nastÄ™pnego focusable |

---

## 11. Performance

### 11.1 Wymagania

| Metryka | Target |
|---------|--------|
| Initial render (1000 rows) | < 500 ms |
| Sort (1000 rows) | < 200 ms |
| Filter (1000 rows) | < 300 ms |
| Scroll (virtual) | 60 FPS |
| Export CSV (10k rows) | < 2 s |

### 11.2 Virtual Scrolling

**Wymagane dla:** > 500 wierszy

**Implementacja:** Window size = 50 rows, buffer = 10 rows

---

## 12. benchmark / benchmark Parity

### 12.1 Feature Comparison

| Feature | benchmark | benchmark | MV-DESIGN-PRO | Status |
|---------|------|--------------|---------------|--------|
| Hierarchical Tree | âś“ | âś“ | âś“ | âś… FULL |
| Multi-Case View | âś“ | âś“ | âś“ | âś… FULL |
| Delta Comparison | âś— | âś“ | âś“ | âś… FULL |
| Trend Highlighting | âś— | âś“ | âś“ + Auto | âž• SUPERIOR |
| Export CSV/Excel | âś“ | âś“ | âś“ | âś… FULL |
| Export PDF | âś“ | âś— | âś“ | âž• SUPERIOR |
| Sync with SLD | âś“ | âś“ | âś“ + Focus Lock | âž• SUPERIOR |
| Virtual Scrolling | âś— | âś“ | âś“ | âś… FULL |
| Expert Modes | âś— | âś— | âś“ | âž• SUPERIOR |
| Global Context Bar | âś— | âś— | âś“ | âž• SUPERIOR |

### 12.2 Ocena koĹ„cowa

**MV-DESIGN-PRO Results Browser â‰Ą benchmark Results View â‰Ą benchmark Output Window** âś…

---

## 13. Scenariusze poprawne (ALLOWED)

### 13.1 Scenariusz: Eksploracja wynikĂłw zwarciowych

```
USER: Otwiera Results Browser
USER: Rozwija Case â†’ Snapshot â†’ Run â†’ Buses
USER: Klika "Violations Only" filter
SYSTEM: Tabela pokazuje tylko Bus z Status = VIOLATION
USER: Sortuje po Ik_max (malejÄ…co)
USER: Klika wiersz Bus_007
SYSTEM: SLD centruje na Bus_007, Element Inspector otwiera siÄ™
```

### 13.2 Scenariusz: PorĂłwnanie dwĂłch Cases

```
USER: Klika "Compare" w toolbarze
USER: Wybiera Case A = SC_BASE, Case B = SC_VARIANT
SYSTEM: Tabela przeĹ‚Ä…cza w tryb Delta View
SYSTEM: Koloruje wiersze: zielone (improved), czerwone (regressed)
USER: Filtruje "REGRESSED only"
USER: Eksportuje do PDF
```

---

## 14. Scenariusze zabronione (FORBIDDEN)

### 14.1 Duplikacja danych

**FORBIDDEN:**
```
âťŚ Results Browser przechowuje kopiÄ™ wynikĂłw (shadow store)
```

**CORRECT:**
```
âś“ Results Browser czyta z Analysis Layer (read-only)
```

### 14.2 Brak synchronizacji

**FORBIDDEN:**
```
âťŚ Klik w Results Browser NIE aktualizuje SLD
```

**CORRECT:**
```
âś“ Single Global Focus â€” klik â†’ aktualizacja ALL widokĂłw
```

### 14.3 Ukrywanie kolumn bez powodu

**FORBIDDEN:**
```
âťŚ "Basic Mode" ukrywa kolumny X/R, Contributions
```

**CORRECT:**
```
âś“ Expert Modes zmieniajÄ… DOMYĹšLNE widocznoĹ›ci, uĹĽytkownik moĹĽe pokazaÄ‡ wszystko
```

---

## 15. Compliance Checklist

**Implementacja zgodna z RESULTS_BROWSER_CONTRACT.md, jeĹ›li:**

- [ ] Results Browser implementuje hierarchiÄ™ drzewa (Project â†’ Study â†’ Case â†’ Snapshot â†’ Run â†’ Category â†’ Element)
- [ ] Tabele SC i PF zawierajÄ… wszystkie OBOWIÄ„ZKOWE kolumny
- [ ] Sortowanie, filtrowanie dziaĹ‚a dla wszystkich kolumn
- [ ] Delta View (Compare) implementuje trend highlighting
- [ ] Eksport CSV/Excel/PDF zachowuje wszystkie kolumny i metadane
- [ ] Synchronizacja z SLD (klik â†’ highlight, double-click â†’ center)
- [ ] Focus Lock (Single Global Focus) dziaĹ‚a miÄ™dzy Results Browser, SLD, Element Inspector
- [ ] Expert Modes zmieniajÄ… domyĹ›lne widocznoĹ›ci, NIE ukrywajÄ… danych
- [ ] Screen reader support (ARIA labels)
- [ ] Virtual scrolling dla > 500 wierszy
- [ ] Performance: render < 500ms, sort < 200ms, filter < 300ms

---

## 16. Changelog

| Data | Wersja | Zmiany |
|------|--------|--------|
| 2026-01-28 | 1.0 | Utworzenie dokumentu â€” Phase 1.z |

---

**KONIEC KONTRAKTU RESULTS BROWSER**

