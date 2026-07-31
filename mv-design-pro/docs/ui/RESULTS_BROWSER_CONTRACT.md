# Results Browser Contract

**Version:** 1.0  
**Status:** CANONICAL  
**Phase:** 1.z  
**Reference:** SYSTEM_SPEC.md, ARCHITECTURE.md, benchmark/benchmark UI Standards  
**Standard:** DIgSILENT benchmark / benchmark UI Parity

---

## 1. Cel dokumentu

Niniejszy dokument definiuje **kanoniczny kontrakt Results Browser** — centralnego narzędzia eksploracji wyników obliczeń jako alternatywy dla nawigacji SLD.

**Filozofia:** Results Browser + SLD = dwa równorzędne okna do tych samych danych.

---

## 2. Definicje pojęć (BINDING)

### 2.1 Results Browser

**Results Browser** to dedykowany panel UI umożliwiający eksplorację wyników obliczeń w strukturze hierarchicznej, niezależnie od układu graficznego SLD.

| Atrybut | Opis |
|---------|------|
| Panel ID | Unikalny identyfikator panelu w UI |
| View Mode | TABLE / TREE / HYBRID |
| Active Filters | Lista aktywnych filtrów (violations, zone, voltage) |
| Sort Order | Aktywna kolumna i kierunek sortowania |
| Selected Element | Aktualnie zaznaczony element (sync z SLD) |

### 2.2 Result Tree Hierarchy

```
PROJECT
  └── STUDY
        └── CASE
              └── SNAPSHOT
                    └── ANALYSIS RUN
                          ├── BUSES (node results)
                          ├── VOLTAGE PROFILE (BUS-centric)
                          ├── LINES (branch results)
                          ├── TRANSFORMERS (branch results)
                          ├── SOURCES (source results)
                          ├── LOADS (load results)
                          └── PROTECTIONS (P11 Proof available)
```

---

## 3. Hierarchia drzewa wyników (BINDING)

### 3.1 Poziomy hierarchii

| Poziom | Opis | Expandable | Default State |
|--------|------|------------|---------------|
| Project | Projekt główny | ✓ | Expanded |
| Study | Studium (grupa Cases) | ✓ | Expanded |
| Case | Przypadek obliczeniowy | ✓ | Expanded |
| Snapshot | Zamrożony stan modelu | ✓ | Collapsed |
| Analysis Run | Pojedynczy run obliczeń | ✓ | Collapsed |
| Target Category | BUS/LINE/TRAFO/SOURCE/LOAD | ✓ | Collapsed |
| Element | Konkretny element sieci | — | N/A |

### 3.2 Metadata na każdym poziomie

**Case Level:**
| Pole | Opis |
|------|------|
| Case Name | Nazwa przypadku |
| Case Type | SHORT_CIRCUIT / POWER_FLOW |
| Result Status | NONE / FRESH / OUTDATED |
| Last Computed | Timestamp ostatniego obliczenia |
| Violations Count | Liczba przekroczeń norm |

**Run Level:**
| Pole | Opis |
|------|------|
| Run ID | UUID biegu obliczeń |
| Run Timestamp | Data i czas uruchomienia |
| Solver Version | Wersja solvera |
| Duration [ms] | Czas obliczeń |
| Status | SUCCESS / WARNING / ERROR |

---

## 4. Tabele wyników (benchmark-grade)

### 4.1 Tabela wyników zwarciowych (SC Results Table)

**Kolumny OBOWIĄZKOWE:**

| Kolumna | Opis | Format | Sortowalna |
|---------|------|--------|------------|
| Bus ID | Identyfikator węzła | UUID | ✓ |
| Bus Name | Nazwa węzła | String | ✓ |
| Voltage [kV] | Napięcie znamionowe | Float, 2 dec | ✓ |
| Fault Type | Typ zwarcia | 3PH / 1PH / 2PH | ✓ |
| Ik_max [kA] | Prąd zwarciowy max | Float, 2 dec | ✓ |
| Ik_min [kA] | Prąd zwarciowy min | Float, 2 dec | ✓ |
| ip [kA] | Prąd udarowy | Float, 2 dec | ✓ |
| Ith [kA] | Prąd cieplny | Float, 2 dec | ✓ |
| Sk [MVA] | Moc zwarciowa | Float, 1 dec | ✓ |
| X/R | Stosunek X/R | Float, 2 dec | ✓ |
| Status | OK / WARNING / VIOLATION | Enum | ✓ |

### 4.2 Tabela wyników rozpływu mocy (PF Results Table)

**Kolumny OBOWIĄZKOWE:**

| Kolumna | Opis | Format |
|---------|------|--------|
| Element ID | Identyfikator elementu | UUID |
| Element Name | Nazwa elementu | String |
| Element Type | BUS / LINE / TRAFO | Enum |
| U [kV] | Napięcie (BUS) | Float, 3 dec |
| U [p.u.] | Napięcie per unit (BUS) | Float, 3 dec |
| P [MW] | Moc czynna | Float, 3 dec |
| Q [Mvar] | Moc bierna | Float, 3 dec |
| I [A] | Prąd (LINE/TRAFO) | Float, 1 dec |
| Loading [%] | Obciążenie termiczne | Float, 1 dec |
| P_loss [kW] | Straty mocy czynnej | Float, 2 dec |
| Status | OK / OVERLOAD / UNDERVOLTAGE | Enum |

### 4.3 Filtrowanie

**Filtry dostępne:**

| Filtr | Opis | Wartości |
|-------|------|----------|
| Violations Only | Tylko przekroczenia | Boolean |
| Voltage Range | Zakres napięć | [U_min, U_max] kV |
| Zone | Strefa / feeder | Zone ID |
| Element Type | Typ elementu | BUS / LINE / TRAFO / ALL |
| Status | Status wyniku | OK / WARNING / VIOLATION |
| Case | Przypadek | Case ID |

### 4.4 Sortowanie

**Reguły sortowania:**

1. Kliknięcie nagłówka kolumny → sortowanie rosnące
2. Drugie kliknięcie → sortowanie malejące
3. Trzecie kliknięcie → reset do domyślnego (unsorted / by name)
4. Wielokolumnowe sortowanie: SHIFT + klik

---

## 5. Porównania Case / Snapshot (MUST)

### 5.1 Delta View (Comparison Mode)

**Cel:** Porównanie wyników między dwoma (lub trzema) Cases/Snapshots.

**Aktywacja:** 
- Przycisk "Compare" w toolbarze Results Browser
- Wybór Case A (baseline), Case B (comparison), opcjonalnie Case C

**Kolumny w trybie porównania:**

| Kolumna | Opis |
|---------|------|
| Element | Identyfikator elementu |
| Value A | Wartość w Case A |
| Value B | Wartość w Case B |
| Δ (B-A) | Różnica absolutna |
| %Δ | Różnica procentowa |
| Trend | ▲ IMPROVED / ▼ REGRESSED / = NO_CHANGE |

### 5.2 Highlighting zmian

| Trend | Kolor | Znaczenie |
|-------|-------|-----------|
| ▲ IMPROVED | Zielony (#22C55E) | Wartość poprawiła się (np. spadek Ik″) |
| ▼ REGRESSED | Czerwony (#EF4444) | Wartość pogorszyła się |
| = NO_CHANGE | Szary (#9CA3AF) | Brak istotnej zmiany (|%Δ| < 0.1%) |

### 5.3 Progi istotności

| Rodzaj zmiany | Próg |
|---------------|------|
| Nieistotna | |%Δ| < 0.1% |
| Mała | 0.1% ≤ |%Δ| < 5% |
| Znacząca | 5% ≤ |%Δ| < 15% |
| Duża | |%Δ| ≥ 15% |

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
| Include Metadata | Dołącz nagłówek z Case/Run info |

### 6.3 Nazwa pliku (deterministyczna)

Format: `{project}_{case}_{analysis}_{timestamp}.{ext}`

Przykład: `MV_Network_SC_MAX_2026-01-28_1930.xlsx`

---

## 7. Synchronizacja z SLD (BINDING)

### 7.1 Reguły synchronizacji

| Akcja w Results Browser | Reakcja w SLD |
|-------------------------|---------------|
| Kliknięcie wiersza | Podświetlenie elementu na SLD |
| Podwójne kliknięcie | Centrowanie SLD na elemencie |
| Hover nad wierszem | Tooltip z miniaturą SLD (opcjonalne) |

| Akcja w SLD | Reakcja w Results Browser |
|-------------|---------------------------|
| Kliknięcie elementu | Podświetlenie wiersza + scroll to |
| Hover nad elementem | Highlight wiersza (light background) |

### 7.2 Focus Lock

**Focus Lock** = Results Browser i SLD dzielą wspólny fokus.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SINGLE GLOBAL FOCUS                           │
│  Global Focus = (Target Element, Case, Run, Snapshot, Analysis) │
│                                                                  │
│       Results Browser ←───────────→ SLD Viewer                   │
│              │                           │                       │
│              └───────────────────────────┘                       │
│                        ↓                                         │
│                Element Inspector                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Integracje (MUST)

### 8.1 Element Inspector

| Akcja | Reakcja |
|-------|---------|
| Klik wiersza → Inspector | Otwarcie Element Inspector dla elementu |
| Double-click | Inspector + Results tab active |

### 8.2 Topology Tree

| Akcja | Reakcja |
|-------|---------|
| Klik w Tree | Scroll Results Browser do elementu |
| Expand/Collapse w Tree | Odzwierciedlenie w Results Browser |

### 8.3 Global Context Bar

| Pole w Context Bar | Źródło |
|--------------------|--------|
| Active Case | Results Browser selection |
| Active Snapshot | Results Browser selection |
| Active Analysis | Results Browser filter |

---

## 9. Tryby eksperckie (EXPERT MODES)

### 9.1 Widoczność kolumn per tryb

| Tryb | Domyślne kolumny |
|------|------------------|
| Operator | Name, Status, Voltage, Violation |
| Designer | Name, Status, Voltage, P, Q, I, Loading |
| Analyst | Wszystkie + X/R, Contributions |
| Auditor | Wszystkie + Metadata (Timestamp, User, Diff) |

### 9.2 Domyślne rozwinięcia drzewa per tryb

| Tryb | Domyślne rozwinięcie |
|------|----------------------|
| Operator | Case → Buses (violations only) |
| Designer | Case → Snapshot → All Categories |
| Analyst | Wszystko rozwinięte |
| Auditor | Wszystko rozwinięte + History visible |

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
| ↑/↓ | Nawigacja między wierszami |
| Enter | Otwórz Element Inspector |
| Ctrl+F | Focus na search box |
| Escape | Zamknij modal / reset filtrow |
| Tab | Przejdź do następnego focusable |

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
| Hierarchical Tree | ✓ | ✓ | ✓ | ✅ FULL |
| Multi-Case View | ✓ | ✓ | ✓ | ✅ FULL |
| Delta Comparison | ✗ | ✓ | ✓ | ✅ FULL |
| Trend Highlighting | ✗ | ✓ | ✓ + Auto | ➕ SUPERIOR |
| Export CSV/Excel | ✓ | ✓ | ✓ | ✅ FULL |
| Export PDF | ✓ | ✗ | ✓ | ➕ SUPERIOR |
| Sync with SLD | ✓ | ✓ | ✓ + Focus Lock | ➕ SUPERIOR |
| Virtual Scrolling | ✗ | ✓ | ✓ | ✅ FULL |
| Expert Modes | ✗ | ✗ | ✓ | ➕ SUPERIOR |
| Global Context Bar | ✗ | ✗ | ✓ | ➕ SUPERIOR |

### 12.2 Ocena końcowa

**MV-DESIGN-PRO Results Browser ≥ benchmark Results View ≥ benchmark Output Window** ✅

---

## 13. Scenariusze poprawne (ALLOWED)

### 13.1 Scenariusz: Eksploracja wyników zwarciowych

```
USER: Otwiera Results Browser
USER: Rozwija Case → Snapshot → Run → Buses
USER: Klika "Violations Only" filter
SYSTEM: Tabela pokazuje tylko Bus z Status = VIOLATION
USER: Sortuje po Ik_max (malejąco)
USER: Klika wiersz Bus_007
SYSTEM: SLD centruje na Bus_007, Element Inspector otwiera się
```

### 13.2 Scenariusz: Porównanie dwóch Cases

```
USER: Klika "Compare" w toolbarze
USER: Wybiera Case A = SC_BASE, Case B = SC_VARIANT
SYSTEM: Tabela przełącza w tryb Delta View
SYSTEM: Koloruje wiersze: zielone (improved), czerwone (regressed)
USER: Filtruje "REGRESSED only"
USER: Eksportuje do PDF
```

---

## 14. Scenariusze zabronione (FORBIDDEN)

### 14.1 Duplikacja danych

**FORBIDDEN:**
```
❌ Results Browser przechowuje kopię wyników (shadow store)
```

**CORRECT:**
```
✓ Results Browser czyta z Analysis Layer (read-only)
```

### 14.2 Brak synchronizacji

**FORBIDDEN:**
```
❌ Klik w Results Browser NIE aktualizuje SLD
```

**CORRECT:**
```
✓ Single Global Focus — klik → aktualizacja ALL widoków
```

### 14.3 Ukrywanie kolumn bez powodu

**FORBIDDEN:**
```
❌ "Basic Mode" ukrywa kolumny X/R, Contributions
```

**CORRECT:**
```
✓ Expert Modes zmieniają DOMYŚLNE widoczności, użytkownik może pokazać wszystko
```

---

## 15. Compliance Checklist

**Implementacja zgodna z RESULTS_BROWSER_CONTRACT.md, jeśli:**

- [ ] Results Browser implementuje hierarchię drzewa (Project → Study → Case → Snapshot → Run → Category → Element)
- [ ] Tabele SC i PF zawierają wszystkie OBOWIĄZKOWE kolumny
- [ ] Sortowanie, filtrowanie działa dla wszystkich kolumn
- [ ] Delta View (Compare) implementuje trend highlighting
- [ ] Eksport CSV/Excel/PDF zachowuje wszystkie kolumny i metadane
- [ ] Synchronizacja z SLD (klik → highlight, double-click → center)
- [ ] Focus Lock (Single Global Focus) działa między Results Browser, SLD, Element Inspector
- [ ] Expert Modes zmieniają domyślne widoczności, NIE ukrywają danych
- [ ] Screen reader support (ARIA labels)
- [ ] Virtual scrolling dla > 500 wierszy
- [ ] Performance: render < 500ms, sort < 200ms, filter < 300ms

---

## 16. Changelog

| Data | Wersja | Zmiany |
|------|--------|--------|
| 2026-01-28 | 1.0 | Utworzenie dokumentu — Phase 1.z |

---

**KONIEC KONTRAKTU RESULTS BROWSER**

