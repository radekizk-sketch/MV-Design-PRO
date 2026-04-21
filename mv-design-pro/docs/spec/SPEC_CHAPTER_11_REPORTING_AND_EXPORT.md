> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Rozdział 11 — Raportowanie, Cross-Reference, Trace & Export (benchmark-Grade)

**Wersja:** 1.0
**Data:** 2026-02-09
**Status:** AS-IS (z sekcjami TO-BE jawnie oznaczonymi)
**Warstwa:** Presentation (Reporting) + White Box (Trace) + Infrastructure (Export)
**Zależności:** Rozdział 6 (Solver Contracts, Frozen API), Rozdział 9 (Protection Trace, Comparison), Rozdział 10 (StudyCase, AnalysisRun, input_hash)
**Decision Matrix:** Nowe decyzje #87–#93
**Kod źródłowy:** `application/proof_engine/types.py`, `application/proof_engine/proof_pack.py`, `application/proof_engine/proof_inspector/exporters.py`, `application/analysis_run/export_service.py`, `application/sld/cross_reference.py`, `application/sld/overlay.py`, `network_model/reporting/docx_determinism.py`, `network_model/reporting/short_circuit_export.py`, `network_model/reporting/short_circuit_report_pdf.py`, `network_model/reporting/short_circuit_report_docx.py`, `domain/results.py`, `api/comparison.py`

---

## §11.0 — Zakres i cel rozdziału

### §11.0.1 Cel

Niniejszy rozdział definiuje **kanoniczny system raportowania MV-DESIGN-PRO** na poziomie benchmark-grade, obejmujący:
- klasy raportów (PRIMARY, COMPARATIVE, AUDIT),
- strukturę kanoniczną raportu (nagłówek, kontekst, wyniki, cross-reference),
- architekturę Proof Pack (ProofDocument, ProofStep, ProofPackBuilder),
- White Box Trace jako integralną część raportu,
- formaty wyjścia (JSON, PDF, DOCX, LaTeX, CSV/XLSX),
- determinizm i reprodukowalność na poziomie bitowym,
- walidacje raportów,
- API raportowe.

### §11.0.2 Zasada nadrzędna (BINDING — Decyzja #87)

> **Każdy raport jest projekcją jednego lub wielu AnalysisRun,
> posiada jednoznaczne referencje do ENM i StudyCase
> oraz jest w pełni odtwarzalny bez dostępu do UI.**

Raport:
- **nie zawiera** logiki obliczeniowej (NOT-A-SOLVER rule),
- **nie zawiera** danych „z ręki" — każda wartość pochodzi z frozen result lub trace,
- **jest** deterministycznym artefaktem: te same dane wejściowe → identyczny raport.

### §11.0.3 Granica warstwy raportowej (BINDING)

Warstwa raportowa = warstwa prezentacji. Czyta zamrożone wyniki, **NIGDY** nie modyfikuje ENM, Solver ani Case.

```
Solver → Results (frozen) → Warstwa raportowa → Artefakty eksportu
                                   ↑                    ↓
                           ENM + Case (read-only)   PDF / DOCX / JSON / LaTeX / CSV
```

benchmark 11 **NICZEGO nie zmienia w obliczeniach** — wyłącznie formalizuje, standaryzuje i rozszerza kontrakty raportowe.

### §11.0.4 Parytet benchmark / benchmark (BINDING)

| Cecha | benchmark | benchmark | MV-DESIGN-PRO | Status |
|-------|------|--------------|---------------|--------|
| Hierarchiczne drzewo wyników | ✓ | ✓ | ✓ | ✅ FULL |
| Widok wieloscenariuszowy (Multi-Case) | ✓ | ✓ | ✓ | ✅ FULL |
| Porównanie delta (Δ) | ✗ | ✓ | ✓ + Auto trend | ➕ SUPERIOR |
| Trend highlighting | ✗ | ✓ | ✓ + Auto | ➕ SUPERIOR |
| Eksport CSV/Excel | ✓ | ✓ | ✓ | ✅ FULL |
| Eksport PDF | ✓ | ✗ | ✓ (deterministyczny) | ➕ SUPERIOR |
| Synchronizacja z SLD | ✓ | ✓ | ✓ + Focus Lock | ➕ SUPERIOR |
| White Box Trace w raporcie | ✗ | ✗ | ✓ (obowiązkowy) | ➕ SUPERIOR |
| Deterministyczny eksport (byte-identical) | ✗ | ✗ | ✓ (SHA-256 weryfikowalny) | ➕ SUPERIOR |

**Konkluzja:** MV-DESIGN-PRO Reporting ≥ benchmark ≥ benchmark.

---

## §11.1 — Klasy raportów (BINDING — Decyzja #88)

### §11.1.1 Raporty obliczeniowe (PRIMARY)

Typy:
- **Power Flow** — rozpływ mocy (Newton-Raphson)
- **Short Circuit** — prądy zwarciowe (IEC 60909)
- **Protection / Coordination** — koordynacja zabezpieczeń
- **Voltage Profile** — profil napięciowy (BUS-centric)
- **Loading / Thermal** — obciążalność i analiza cieplna

Każdy raport PRIMARY:
- jest przypisany do **jednego AnalysisRun** (`analysis_run_id`),
- posiada pełny zestaw metadanych (ReportHeader),
- zawiera cross-reference do elementów ENM (ref_id per wiersz),
- zawiera referencję do White Box trace.

### §11.1.2 Raporty porównawcze (COMPARATIVE)

Typy:
- **Case vs Case** — porównanie dwóch scenariuszy obliczeniowych
- **Run vs Run** — porównanie dwóch przebiegów
- **„z OZE / bez OZE"** — wpływ generacji rozproszonej
- **„stan normalny / N-1"** — analiza wariantowa

Kontrakt:
- raport porównawczy **NIGDY nie miesza solverów** (SC vs PF = ZABRONIONE),
- **ZAWSZE** porównuje ten sam ENM snapshot,
- używa `NumericDelta` i `ComplexDelta` do kodowania różnic.

**NumericDelta (frozen, AS-IS):**

```python
# domain/results.py
@dataclass(frozen=True)
class NumericDelta:
    value_a: float            # Wartość z Run A
    value_b: float            # Wartość z Run B
    delta: float              # Różnica bezwzględna (B - A)
    percent: float | None     # Różnica procentowa ((B-A)/A × 100), None jeśli A=0
    sign: int                 # Kierunek zmiany: -1, 0, +1
```

**ComplexDelta (frozen, AS-IS):**

```python
# domain/results.py
@dataclass(frozen=True)
class ComplexDelta:
    re_a: float               # Część rzeczywista Run A
    im_a: float               # Część urojona Run A
    re_b: float               # Część rzeczywista Run B
    im_b: float               # Część urojona Run B
    delta_re: float           # Różnica części rzeczywistej
    delta_im: float           # Różnica części urojonej
    magnitude_a: float        # Moduł Run A
    magnitude_b: float        # Moduł Run B
    delta_magnitude: float    # Różnica modułów
    percent_magnitude: float | None  # Różnica procentowa modułów
```

**Porównanie Protection:** wykorzystuje `StateChange` i `IssueCode` z Rozdziału 9 (§9.10).

### §11.1.3 Raporty audytowe (AUDIT / WHITE BOX)

Typy:
- **Trace obliczeń** — ProofDocument (łańcuch: wzór → dane → podstawienie → wynik)
- **„Kto zadziałał pierwszy"** — ProtectionTrace (sekwencja chronologiczna)
- **Macierze efektów** — wpływ zmian na wyniki
- **Lista decyzji i inwariantów** — audit trail konfiguracji

Raporty audytowe generowane z istniejących danych trace/result — **czysta interpretacja**, bez ponownych obliczeń.

---

## §11.2 — Struktura kanoniczna raportu (OBOWIĄZKOWA — Decyzja #89)

Każdy raport MUSI zawierać sekcje §11.2.1–§11.2.4.

### §11.2.1 Nagłówek normowy (ReportHeader)

```python
# TO-BE — kontrakt kanoniczny
@dataclass(frozen=True)
class ReportHeader:
    report_id: str                # UUID
    report_type: ReportType       # Typ raportu (enum)
    project_id: str               # UUID projektu
    project_name: str             # Nazwa projektu
    study_case_id: str            # UUID Study Case
    study_case_name: str          # Nazwa scenariusza
    analysis_run_id: str          # UUID AnalysisRun
    solver_name: str              # np. "IEC60909_SC3F", "Newton_PF"
    solver_version: str           # Wersja solvera
    solver_standard: str          # np. "PN-EN 60909-0:2016"
    created_at: datetime          # Timestamp generowania raportu
    enm_hash: str                 # SHA-256 fingerprint ENM snapshot
    case_hash: str                # SHA-256 konfiguracji Case
    input_hash: str               # SHA-256 kanonicznego wejścia (z AnalysisRun)
    mv_design_pro_version: str    # Wersja systemu
```

> **TO-BE** — `ReportHeader` jako samodzielna klasa nie jest zaimplementowany. AS-IS: nagłówek zawarty w `ProofHeader` (proof_engine/types.py) oraz w bundlu `AnalysisRunExportService`.

**ReportType (enum):**

| Wartość | Opis |
|---------|------|
| `POWER_FLOW` | Raport rozpływu mocy |
| `SHORT_CIRCUIT` | Raport prądów zwarciowych |
| `PROTECTION` | Raport koordynacji zabezpieczeń |
| `VOLTAGE_PROFILE` | Raport profilu napięciowego |
| `LOADING_THERMAL` | Raport obciążalności cieplnej |
| `COMPARATIVE` | Raport porównawczy (Case vs Case, Run vs Run) |
| `AUDIT_TRACE` | Raport audytowy (White Box trace) |

### §11.2.2 Sekcja kontekstu (ReportContext)

```python
# TO-BE — kontrakt kanoniczny
@dataclass(frozen=True)
class ReportContext:
    scenario_description: str           # Opis scenariusza
    boundary_conditions: dict           # Warunki brzegowe
    active_sources: list[str]           # ref_id aktywnych źródeł
    active_loads: list[str]             # ref_id aktywnych odbiorów
    bess_modes: dict[str, str]          # ref_id → tryb BESS (DISCHARGE/CHARGE/IDLE)
    protection_config_summary: dict     # Podsumowanie konfiguracji zabezpieczeń
    enm_snapshot_fingerprint: str       # SHA-256 fingerprint snapshotu
```

> **TO-BE** — `ReportContext` nie zaimplementowany jako samodzielna klasa. AS-IS: kontekst zawarty w `input_snapshot` i `operating_case` w bundlu eksportowym.

### §11.2.3 Część wynikowa

Reguły tabel wynikowych (BINDING):
- kolumny z jednostkami w nagłówku (np. `Ik″ [kA]`, `U [pu]`),
- każdy wiersz identyfikowany przez `ref_id` + nazwa elementu,
- **zakaz** agregatów bez wskazania składników,
- **zakaz** „średnich" bez definicji formalnej,
- sortowanie deterministyczne: po `ref_id` (domyślnie) lub po severity+margines (w raportach normatywnych).

### §11.2.4 Cross-reference do SLD (BINDING — Decyzja #90)

**CrossReference (frozen, AS-IS):**

```python
# application/sld/cross_reference.py
@dataclass(frozen=True)
class CrossReference:
    enm_ref_id: str           # Identyfikator elementu ENM
    enm_element_type: str     # Typ: bus, branch, source, transformer, load, generator
    enm_element_name: str     # Nazwa elementu
    sld_symbol_id: str | None # ID symbolu na SLD (None jeśli brak SLD)
    wizard_step_hint: str     # Krok kreatora (K2, K3, K4, K5, K6)
    report_section: str       # Sekcja raportu (Topologia, Zasilanie, Linie, ...)
```

**CrossReferenceTable (frozen, AS-IS):**

```python
@dataclass(frozen=True)
class CrossReferenceTable:
    entries: tuple[CrossReference, ...]
    total_elements: int       # Łączna liczba elementów
    mapped_to_sld: int        # Liczba elementów zmapowanych na SLD
    coverage_percent: float   # Pokrycie w %
```

**Funkcja budowania (AS-IS):**
`build_cross_reference_table(enm, sld) → CrossReferenceTable`

Źródło: `application/sld/cross_reference.py`

Kontrakt:
- czysta funkcja: ten sam ENM + SLD → identyczna tabela,
- sortowanie per typ elementu: buses → sources → branches → transformers → loads → generators → substations → corridors,
- sortowanie wewnątrz typu: po `ref_id` (alfabetycznie),
- każdy wiersz tabeli wynikowej raportu MUSI zawierać `ref_id` umożliwiający nawigację Focus na SLD.

---

## §11.3 — Tabele wyników per typ analizy

### §11.3.1 Tabela wyników Short Circuit — BUS-centric (AS-IS)

| Kolumna | Format | Sortowalna | Opis |
|---------|--------|------------|------|
| Bus ID | UUID | ✓ | Identyfikator szyny |
| Bus Name | String | ✓ | Nazwa szyny |
| Un [kV] | Float, 1 dec | ✓ | Napięcie znamionowe |
| Fault Type | 3PH / 1PH / 2PH | ✓ | Typ zwarcia |
| Ik″ [kA] | Float, 2 dec | ✓ | Prąd początkowy zwarciowy |
| ip [kA] | Float, 2 dec | ✓ | Prąd udarowy |
| Ith [kA] | Float, 2 dec | ✓ | Prąd cieplny równoważny |
| Sk″ [MVA] | Float, 1 dec | ✓ | Moc zwarciowa |
| X/R | Float, 2 dec | ✓ | Stosunek reaktancji do rezystancji |
| Case | String | ✓ | Nazwa scenariusza |
| Status | OK / WARNING / VIOLATION | ✓ | Status normatywny |

**Reguły formatowania:** Prądy — 2 miejsca po przecinku, napięcia i moce — 1 miejsce, bezwymiarowe — 2 miejsca.

### §11.3.2 Tabela wkładów źródłowych (Contributions)

| Kolumna | Opis |
|---------|------|
| Source | Identyfikator elementu źródłowego (ref_id) |
| Type | SOURCE / LINE / TRAFO / INVERTER |
| Ik_contrib [kA] | Wkład prądowy |
| % Total | Udział procentowy w prądzie całkowitym |

### §11.3.3 Tabela wyników Power Flow

**Tabela szyn:**

| Kolumna | Format | Opis |
|---------|--------|------|
| Bus ID | UUID | Identyfikator szyny |
| Bus Name | String | Nazwa |
| U [kV] | Float, 2 dec | Napięcie fazowe |
| U [pu] | Float, 4 dec | Napięcie w jednostkach względnych |
| δ [°] | Float, 2 dec | Kąt napięcia |
| P_load [MW] | Float, 3 dec | Moc czynna obciążenia |
| Q_load [Mvar] | Float, 3 dec | Moc bierna obciążenia |

**Tabela gałęzi:**

| Kolumna | Format | Opis |
|---------|--------|------|
| Branch ID | UUID | Identyfikator gałęzi |
| Branch Name | String | Nazwa |
| I [A] | Float, 1 dec | Prąd |
| P_from [MW] | Float, 3 dec | Moc czynna (nadawcza) |
| Q_from [Mvar] | Float, 3 dec | Moc bierna (nadawcza) |
| P_to [MW] | Float, 3 dec | Moc czynna (odbiorcza) |
| Q_to [Mvar] | Float, 3 dec | Moc bierna (odbiorcza) |
| Losses [MW] | Float, 4 dec | Straty |

### §11.3.4 Tabela porównawcza (Delta View)

| Kolumna | Opis |
|---------|------|
| Element | ref_id + nazwa |
| Metric | Wielkość porównywana (Ik″, U, P, I) |
| Value_A | Wartość z Run A |
| Value_B | Wartość z Run B |
| Δ (abs) | Różnica bezwzględna |
| Δ% | Różnica procentowa |
| Trend | ↑ / ↓ / = (kierunek zmiany) |

### §11.3.5 Tabela Protection Coordination

| Kolumna | Opis |
|---------|------|
| Device ID | ref_id urządzenia |
| Device Name | Nazwa zabezpieczenia |
| Function | ANSI (50 / 51 / 50N / 51N) |
| I_pickup [A] | Prąd rozruchowy |
| TMS/TD | Mnożnik czasu / czas definiowany |
| t_trip [s] | Czas zadziałania |
| Verdict | PASS / MARGINAL / FAIL |
| Event Class | TECHNOLOGICAL / NETWORK |

---

## §11.4 — White Box Trace — raportowanie (BINDING)

### §11.4.1 Łańcuch śladu

Każdy raport White Box MUSI prezentować łańcuch:

```
ENM → StudyCase → AnalysisRun → Solver → Wynik → Decyzja → Skutek
```

Każdy krok: jawny, numerowany, z parametrami wejścia/wyjścia.

**ProtectionTraceStep (frozen, AS-IS):**

```python
# domain/protection_analysis.py
@dataclass(frozen=True)
class ProtectionTraceStep:
    step: int                    # Numer kroku (1-9)
    description_pl: str          # Deterministyczny opis PL
    inputs: dict                 # Dane wejściowe kroku
    outputs: dict                # Dane wyjściowe kroku
```

**ProtectionTrace (frozen, AS-IS):**

```python
@dataclass(frozen=True)
class ProtectionTrace:
    run_id: str                  # UUID przebiegu
    sc_run_id: str               # Referencja do SC run
    snapshot_id: str             # ID snapshotu ENM
    template_ref: str | None     # Referencja do szablonu
    overrides: dict              # Nadpisania konfiguracji
    steps: tuple[ProtectionTraceStep, ...]  # Immutable audit trail (9 kroków)
```

### §11.4.2 Raport „kto zadziałał pierwszy" (BINDING)

Obowiązkowy dla:
- zwarć (wszystkie typy),
- koordynacji zabezpieczeń.

Raport MUSI:
- rozróżniać `event_class`: TECHNOLOGICAL vs NETWORK (Decyzja #80, §9.A.1),
- pokazywać czasy zadziałań posortowane chronologicznie po $t_{trip}$,
- wskazywać element decydujący (urządzenie z najkrótszym $t_{trip}$),
- referencować `ProtectionComparisonResult` dla porównania A/B (§9.10).

Format raportu:
1. Sekwencja zadziałań: urządzenie → funkcja → nastawa → czas → skutek
2. Dla każdego zadziałania: `event_class` + `event_scope`
3. Element decydujący wyróżniony

### §11.4.3 White Box per AnalysisRun (AS-IS)

`AnalysisRunExportService.export_run_bundle()` produkuje kompletny bundle:

```python
# application/analysis_run/export_service.py — bundle structure
bundle = {
    "report_type": "analysis_run",
    "project": {"id": str, "name": str},
    "operating_case": {"id": str, "name": str},
    "run": {
        "id": str,
        "deterministic_id": str,        # build_deterministic_id(run)
        "analysis_type": str,
        "status": str,
        "result_status": str,
        "created_at": str,              # ISO 8601
        "started_at": str,
        "finished_at": str,
        "duration_seconds": float,
        "queue_seconds": float,
        "input_hash": str,              # SHA-256
    },
    "input_snapshot": dict,             # Canonical (sorted keys)
    "result_summary": dict,             # Canonical
    "white_box_trace": list[dict],      # Kroki trace (key, title, notes, severity, metrics, data)
    "results": list[dict],              # Posortowane per (result_type, id)
    "overlay": dict | None,             # SLD overlay (nodes, branches, switches)
}
```

Źródło: `application/analysis_run/export_service.py`

---

## §11.5 — Proof Pack — architektura pakietu dowodowego (AS-IS — Decyzja #91)

### §11.5.1 ProofDocument (frozen, AS-IS)

```python
# application/proof_engine/types.py
@dataclass(frozen=True)
class ProofDocument:
    document_id: UUID              # Unikalny identyfikator dokumentu
    artifact_id: UUID              # Powiązanie z TraceArtifact
    created_at: datetime           # Data i czas utworzenia
    proof_type: ProofType          # Typ dowodu (enum)
    title_pl: str                  # Tytuł dokumentu po polsku
    header: ProofHeader            # Nagłówek dokumentu
    steps: tuple[ProofStep, ...]   # Kroków dowodu (immutable)
    summary: ProofSummary          # Podsumowanie wyników
```

Właściwości:
- `json_representation` → kanoniczny JSON (sort_keys=True, indent=2)
- `latex_representation` → LaTeX przez `LaTeXRenderer.render()`

### §11.5.2 ProofType (enum, AS-IS)

| Wartość | Opis | Kod pakietu |
|---------|------|-------------|
| `SC3F_IEC60909` | Zwarcie trójfazowe IEC 60909 | SC3F_IEC60909 |
| `SC1F_IEC60909` | Zwarcie jednofazowe | SC1_ASYM |
| `SC2F_IEC60909` | Zwarcie dwufazowe | SC1_ASYM |
| `SC2FG_IEC60909` | Zwarcie dwufazowe z ziemią | SC1_ASYM |
| `VDROP` | Spadek napięcia | VDROP |
| `LOAD_FLOW_VOLTAGE` | Napięcia z rozpływu | LOAD_FLOW_VOLTAGE |
| `Q_U_REGULATION` | Regulacja Q(U) | QU_REGULATION |
| `EQUIPMENT_PROOF` | Dobór aparatury (P12) | P12 |
| `LOAD_CURRENTS_OVERLOAD` | Prądy robocze i przeciążenia (P15) | LOAD_CURRENTS_OVERLOAD |
| `LOSSES_ENERGY` | Energia strat (P17) | LOSSES_ENERGY |
| `PROTECTION_OVERCURRENT` | Zabezpieczenia nadprądowe (P18) | PROTECTION_OVERCURRENT |
| `EARTHING_GROUND_FAULT_SN` | Doziemienia SN (P19) | EARTHING_GROUND_FAULT_SN |

Źródło: `application/proof_engine/types.py`

### §11.5.3 ProofStep (frozen, AS-IS)

```python
@dataclass(frozen=True)
class ProofStep:
    step_id: str                           # np. "SC3F_STEP_004"
    step_number: int                       # Numer porządkowy (1, 2, 3, ...)
    title_pl: str                          # Tytuł po polsku
    equation: EquationDefinition           # Definicja równania z rejestru
    input_values: tuple[ProofValue, ...]   # Wartości wejściowe do podstawienia
    substitution_latex: str                # Wzór z podstawionymi wartościami (LaTeX)
    result: ProofValue                     # Wynik obliczenia
    unit_check: UnitCheckResult            # Weryfikacja spójności jednostek
    source_keys: dict[str, str]            # symbol → klucz w trace/result
```

Format kroku: **Wzór → Dane → Podstawienie → Wynik → Weryfikacja jednostek**

### §11.5.4 ProofValue (frozen, AS-IS)

```python
@dataclass(frozen=True)
class ProofValue:
    symbol: str                # Symbol matematyczny (np. "I_k''")
    value: float | complex | str  # Wartość numeryczna
    unit: str                  # Jednostka (np. "kA")
    formatted: str             # Sformatowana wartość (np. "12.45 kA")
    source_key: str            # Klucz w trace/result (np. "ikss_ka")
```

### §11.5.5 ProofSummary (frozen, AS-IS)

```python
@dataclass(frozen=True)
class ProofSummary:
    key_results: dict[str, ProofValue]      # Główne wyniki z jednostkami
    unit_check_passed: bool                 # Czy wszystkie jednostki OK
    total_steps: int                        # Liczba kroków dowodu
    warnings: tuple[str, ...] = ()          # Ostrzeżenia
    overall_status: str | None = None       # "VALID" | "INVALID" | "PARTIAL"
    failed_checks: tuple[str, ...] = ()     # Lista niespełnionych warunków
    counterfactual_diff: dict[str, ProofValue] = {}  # Różnice A vs B
```

### §11.5.6 ProofHeader (frozen, AS-IS)

```python
@dataclass(frozen=True)
class ProofHeader:
    project_name: str                  # Nazwa projektu
    case_name: str                     # Nazwa przypadku obliczeniowego
    run_timestamp: datetime            # Czas uruchomienia
    solver_version: str                # Wersja solvera
    target_id: str | None = None       # Identyfikator elementu (LINE/TR/BUS)
    element_kind: str | None = None    # Rodzaj elementu
    fault_location: str | None = None  # Lokalizacja zwarcia (dla SC)
    fault_type: str | None = None      # Typ zwarcia
    voltage_factor: float | None = None  # Współczynnik c (dla SC)
    source_bus: str | None = None      # Szyna źródłowa (dla VDROP)
    target_bus: str | None = None      # Szyna docelowa (dla VDROP)
```

### §11.5.7 ProofPackBuilder — deterministyczny pakiet ZIP (AS-IS)

Proces budowania (`application/proof_engine/proof_pack.py`):

1. **Eksport do JSON** — kanoniczny (sort_keys=True, LF newlines)
2. **Eksport do LaTeX** — blokowy format `$$...$$`, siunitx, amsmath
3. **Eksport do PDF** — pdflatex (2 przebiegi), jeśli dostępny
4. **Budowanie manifest.json** — SHA-256 per plik, toolchain info
5. **Budowanie signature.json** — pack_fingerprint (SHA-256 konkatenowanych hashy)
6. **Pakowanie ZIP** — posortowane wpisy, stały timestamp (1980-01-01)

**ProofPackContext (frozen, AS-IS):**

```python
@dataclass(frozen=True)
class ProofPackContext:
    project_id: str
    case_id: str
    run_id: str
    snapshot_id: str
    mv_design_pro_version: str | None = None
```

**Struktura pakietu:**

```
proof_pack_{run_id}.zip
├── assets/
├── proof_pack/
│   ├── manifest.json          ← SHA-256 per plik, toolchain, determinism info
│   ├── signature.json         ← pack_fingerprint, schema_version, algorithm
│   ├── proof.json             ← Canonical JSON (sort_keys, LF)
│   ├── proof.tex              ← LaTeX source (block $$...$$)
│   └── proof.pdf              ← Compiled PDF (opcjonalny, jeśli pdflatex dostępny)
```

**Pola manifestu:**

```json
{
    "pack_version": "1.0",
    "created_at_utc": "ISO8601",
    "project_id": "...",
    "case_id": "...",
    "run_id": "...",
    "snapshot_id": "...",
    "proof_type": "SC3F_IEC60909",
    "proof_fingerprint": "sha256:...",
    "files": [{"path": "...", "sha256": "...", "bytes": 1234}],
    "toolchain": {
        "mv_design_pro_version": "...",
        "python_version": "3.11.x",
        "latex_engine": "pdflatex"
    },
    "determinism": {
        "canonical_json": true,
        "sorted_zip_entries": true,
        "stable_newlines": "LF"
    }
}
```

### §11.5.8 InspectorExporter (AS-IS)

```python
# application/proof_engine/proof_inspector/exporters.py
class InspectorExporter:
    def __init__(self, document: ProofDocument) -> None: ...
    def export_json(self) -> ExportResult   # Canonical, deterministic
    def export_tex(self) -> ExportResult    # LaTeX block format
    def export_pdf(self) -> ExportResult    # 2-pass pdflatex compilation
    def export_all(self) -> dict[str, ExportResult]
```

**ExportResult (frozen, AS-IS):**

```python
@dataclass(frozen=True)
class ExportResult:
    format: str               # "json" | "tex" | "pdf"
    content: str | bytes      # String (json/tex) lub bytes (pdf)
    success: bool             # Czy eksport się powiódł
    error_message: str | None = None
    filename_hint: str = "proof"
```

Nazwa pliku: `proof_{proof_type}_{timestamp}.{ext}` (deterministyczna)

---

## §11.6 — Formaty wyjścia (benchmark-Grade — Decyzja #92)

### §11.6.1 Matryca formatów (BINDING)

| Format | Użycie | Determinizm | Biblioteka | Status |
|--------|--------|-------------|------------|--------|
| JSON | Integracje, CI, archiwum | TAK (sort_keys, canonical) | json (stdlib) | AS-IS |
| JSONL | Streaming, batch export | TAK (per-line sort_keys) | json (stdlib) | AS-IS |
| PDF | Raport czytelny, druk | TAK (reportlab, A4, fixed layout) | reportlab | AS-IS |
| DOCX | Raport formalny, edycja | TAK (make_docx_deterministic) | python-docx | AS-IS |
| LaTeX | Dowody matematyczne | TAK (block `$$...$$`, siunitx) | pdflatex | AS-IS |
| CSV/XLSX | Analiza danych | TAK (sorted rows, fixed header) | csv / openpyxl | AS-IS |

Wymóg: **wszystkie formaty zawierają TE SAME dane logiczne** — różnią się wyłącznie prezentacją.

### §11.6.2 Determinizm DOCX (AS-IS)

Trzy źródła niedeterminizmu w DOCX (ZIP):
1. **Timestamps** wpisów ZIP (zależne od systemu)
2. **Kolejność** wpisów ZIP (zależna od systemu plików)
3. **Metadane XML** (docProps/core.xml — created/modified)

Rozwiązanie (`network_model/reporting/docx_determinism.py`):

```python
def make_docx_deterministic(path: Path) -> None:
    # 1. Stały timestamp ZIP: (1980, 1, 1, 0, 0, 0)
    # 2. Sortowanie wpisów leksykograficznie
    # 3. Normalizacja core.xml: fixed timestamps + revision=1
    # Wynik: identyczne wejście → byte-identical DOCX (SHA-256)
```

Wariant in-memory: `make_docx_bytes_deterministic(docx_bytes) → bytes`

### §11.6.3 Determinizm PDF (AS-IS)

- Biblioteka: `reportlab.pdfgen.canvas`
- Rozmiar strony: A4
- Layout: nagłówek (projekt/case/strona), treść (tabele), stopka (run_id + timestamp + hash)
- Formatowanie liczb zespolonych: `r + j*x` (np. `1.23 + j*4.56`)
- Formatowanie wartości: float → `:.6g`, bool → `Tak`/`Nie`, lista → `[N elementów]`

### §11.6.4 Determinizm JSON (AS-IS)

```python
# Canonical form (for hashing):
json.dumps(data, sort_keys=True, separators=(",", ":"))

# Human-readable form (for export):
json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True)
```

- Newlines: LF (`_normalize_newlines()` — zamiana `\r\n` → `\n`)
- Complex: `{"re": float, "im": float}`
- UUID: `str(uuid)`
- datetime: ISO 8601
- Enum: `.value`

### §11.6.5 Determinizm JSONL (AS-IS)

```python
# Jeden obiekt JSON per linia, sort_keys=True:
for result in results:
    line = json.dumps(result.to_dict(), ensure_ascii=False, sort_keys=True)
    lines.append(line)
output = "\n".join(lines) + "\n"
```

Źródło: `network_model/reporting/short_circuit_export.py`

### §11.6.6 Nazwa pliku eksportu (deterministyczna)

Format: `{project}_{case}_{analysis}_{timestamp}.{ext}`

Przykład: `MV_Network_SC_MAX_2026-01-28_1930.xlsx`

---

## §11.7 — Reprodukowalność i determinizm (KANON)

### §11.7.1 Łańcuch integralności (BINDING)

```
NetworkModel (zmiana)
    ↓
NetworkSnapshot.fingerprint (SHA-256 posortowanych nodes/branches)
    ↓
StudyCase.result_status = OUTDATED (invalidacja)
    ↓
Nowy AnalysisRun
    ↓
AnalysisRun.input_hash (SHA-256 kanonicznego input_snapshot)
    ↓
white_box_trace generowany przez solver
    ↓
ProofDocument.integrity_hash (SHA-256 proof JSON)
    ↓
ProofPack.pack_fingerprint (SHA-256 konkatenowanych hashy plików)
    ↓
Report.report_hash (SHA-256 kanonicznego bundla raportu)
```

### §11.7.2 Gwarancja reprodukowalności (BINDING)

Raport MUSI być możliwy do:
- **odtworzenia offline** — wszystkie dane zawarte w bundlu,
- **weryfikacji hashy** — SHA-256 na każdym poziomie łańcucha,
- **ponownego wygenerowania bit-po-bicie** — deterministyczny eksport.

### §11.7.3 Zakazy raportowe

| Kod | Opis |
|-----|------|
| Z-RPT-01 | Zakaz raportów zależnych od stanu UI |
| Z-RPT-02 | Zakaz raportów bez jawnego źródła danych |
| Z-RPT-03 | Zakaz raportów bez input_hash |
| Z-RPT-04 | Zakaz agregatów bez wskazania składników |
| Z-RPT-05 | Zakaz mieszania solverów w raporcie porównawczym |

### §11.7.4 RunComparisonResult (frozen, AS-IS)

```python
# domain/results.py
@dataclass(frozen=True)
class RunComparisonResult:
    run_a_id: UUID
    run_b_id: UUID
    project_id: UUID
    analysis_type: str
    compared_at: datetime
    # ... dodatkowe pola porównania
```

Źródło: `domain/results.py`

### §11.7.5 SLD Overlay (AS-IS)

`ResultSldOverlayBuilder` (`application/sld/overlay.py`) buduje nakładki wynikowe na SLD:

```python
class ResultSldOverlayBuilder:
    def build_short_circuit_overlay(
        self, sld_payload, result_payload, result_status=ResultStatus.NONE
    ) -> dict:
        # nodes: [{node_id, ik_a, ib_a, sz_mva}]
        # branches: [...]
        # switches: [...]
        # result_status: NONE | FRESH | OUTDATED

    def build_power_flow_overlay(
        self, sld_payload, result_payload, result_status=ResultStatus.NONE
    ) -> dict:
        # nodes: [{node_id, u_pu, u_kv, p_mw, q_mvar}]
        # branches: [{branch_id, i_a, p_mw, q_mvar, loading_pct}]
```

Overlay jest WYŁĄCZNIE wizualizacją — **nigdy nie zapisuje danych do modelu**.

---

## §11.8 — Walidacje raportów (BINDING — Decyzja #93)

### §11.8.1 Walidacje ERROR (blokujące generowanie)

| Kod | Severity | Opis |
|-----|----------|------|
| E-RPT-01 | ERROR | Brak `ref_id` w wierszu wynikowym |
| E-RPT-02 | ERROR | Brak hash (`enm_hash` / `case_hash` / `input_hash`) w nagłówku |
| E-RPT-03 | ERROR | Niespójność Case vs Run (`run.operating_case_id ≠ case.id`) |
| E-RPT-04 | ERROR | Brak `solver_name` / `solver_version` w nagłówku |
| E-RPT-05 | ERROR | Pusty result set (brak wyników do raportowania) |

### §11.8.2 Walidacje WARNING

| Kod | Severity | Opis |
|-----|----------|------|
| W-RPT-01 | WARNING | Brak White Box trace przy wyniku obliczeniowym |
| W-RPT-02 | WARNING | Coverage cross-reference < 90% (elementy bez mapowania SLD) |
| W-RPT-03 | WARNING | Raport z wynikami OUTDATED (`result_status ≠ FRESH`) |

### §11.8.3 Walidacje INFO

| Kod | Severity | Opis |
|-----|----------|------|
| I-RPT-01 | INFO | PDF export niedostępny (brak pdflatex) |
| I-RPT-02 | INFO | Raport porównawczy z jednym Run (delta = 0 wszędzie) |

---

## §11.9 — API raportowe (AS-IS + TO-BE)

### §11.9.1 Endpointy eksportu wyników (AS-IS)

| Method | Path | Response | Opis |
|--------|------|----------|------|
| GET | `/api/runs/{run_id}/export/bundle` | JSON | Pełny bundle wynikowy z trace |
| GET | `/api/runs/{run_id}/export/pdf` | bytes (PDF) | Raport PDF |
| GET | `/api/runs/{run_id}/export/docx` | bytes (DOCX) | Raport DOCX |

Źródło: `AnalysisRunExportService` (`application/analysis_run/export_service.py`)

### §11.9.2 Endpointy Proof Pack (AS-IS)

| Method | Path | Response | Opis |
|--------|------|----------|------|
| GET | `/api/proof-packs/{run_id}` | bytes (ZIP) | Pełny Proof Pack |
| GET | `/api/proof-packs/{run_id}/manifest` | JSON | Manifest pakietu |
| GET | `/api/proof/{proof_id}/json` | JSON | Pojedynczy dowód |
| GET | `/api/proof/{proof_id}/tex` | text/latex | LaTeX dowodu |
| GET | `/api/proof/{proof_id}/pdf` | bytes (PDF) | PDF dowodu |

### §11.9.3 Endpointy porównawcze (AS-IS)

| Method | Path | Response | Opis |
|--------|------|----------|------|
| POST | `/api/comparison/runs` | RunComparisonResponse | Porównanie dwóch runów |
| GET | `/api/comparison/{comparison_id}` | RunComparisonResponse | Wynik porównania |

### §11.9.4 Endpointy SLD overlay (AS-IS)

| Method | Path | Response | Opis |
|--------|------|----------|------|
| GET | `/api/runs/{run_id}/overlay/sc` | JSON | Short Circuit overlay na SLD |
| GET | `/api/runs/{run_id}/overlay/pf` | JSON | Power Flow overlay na SLD |

Źródło: `ResultSldOverlayBuilder` (`application/sld/overlay.py`)

### §11.9.5 Endpointy raportowe (TO-BE)

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji.

| Method | Path | Response | Opis |
|--------|------|----------|------|
| GET | `/api/reports/{run_id}/full` | JSON | Pełny raport kanoniczny (P24+) |
| GET | `/api/reports/{run_id}/full/pdf` | bytes (PDF) | Raport P24+ PDF |
| GET | `/api/reports/compare/{run_a}/{run_b}` | JSON | Raport porównawczy |
| GET | `/api/cross-reference/{run_id}` | JSON | Tabela cross-reference |

---

## §11.10 — Inwarianty raportowe (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-RPT-01 | Raport jest WYŁĄCZNIE projekcją danych — nie zawiera logiki obliczeniowej |
| INV-RPT-02 | Raport porównawczy NIGDY nie miesza różnych solverów |
| INV-RPT-03 | Raport porównawczy wymaga identycznego ENM snapshot |
| INV-RPT-04 | Każdy wiersz tabeli wynikowej zawiera `ref_id` elementu ENM |
| INV-RPT-05 | Każdy raport zawiera pełny nagłówek normowy (ReportHeader) |
| INV-RPT-06 | Każdy raport jest deterministyczny: te same dane → identyczny artefakt |
| INV-RPT-07 | ProofPack jest samowystarczalny: manifest + signature + proof + trace |
| INV-RPT-08 | Hash chain: ENM fingerprint → input_hash → proof_fingerprint → pack_fingerprint |
| INV-RPT-09 | DOCX export: byte-identical po `make_docx_deterministic` |
| INV-RPT-10 | JSON export: canonical (sort_keys, LF, brak trailing whitespace) |
| INV-RPT-11 | Raport NIGDY nie zależy od stanu UI |
| INV-RPT-12 | Cross-reference table jest deterministyczna: ten sam ENM + SLD → identyczna tabela |

---

## §11.11 — Mapowanie na kod (AS-IS)

| Komponent specyfikacji | Plik źródłowy | Status |
|------------------------|---------------|--------|
| ProofDocument, ProofStep, ProofType, ProofValue, ProofSummary, ProofHeader | `application/proof_engine/types.py` | AS-IS |
| EquationDefinition, SymbolDefinition, UnitCheckResult | `application/proof_engine/types.py` | AS-IS |
| SemanticAlias, SEMANTIC_ALIASES | `application/proof_engine/types.py` | AS-IS |
| ProofPackBuilder, ProofPackContext | `application/proof_engine/proof_pack.py` | AS-IS |
| InspectorExporter, ExportResult | `application/proof_engine/proof_inspector/exporters.py` | AS-IS |
| AnalysisRunExportService | `application/analysis_run/export_service.py` | AS-IS |
| CrossReference, CrossReferenceTable, build_cross_reference_table | `application/sld/cross_reference.py` | AS-IS |
| ResultSldOverlayBuilder, ResultStatus | `application/sld/overlay.py` | AS-IS |
| make_docx_deterministic, make_docx_bytes_deterministic | `network_model/reporting/docx_determinism.py` | AS-IS |
| export_short_circuit_result_to_json, _to_jsonl | `network_model/reporting/short_circuit_export.py` | AS-IS |
| export_short_circuit_result_to_pdf | `network_model/reporting/short_circuit_report_pdf.py` | AS-IS |
| export_short_circuit_result_to_docx | `network_model/reporting/short_circuit_report_docx.py` | AS-IS |
| export_analysis_run_to_pdf | `network_model/reporting/analysis_run_report_pdf.py` | AS-IS |
| export_analysis_run_to_docx | `network_model/reporting/analysis_run_report_docx.py` | AS-IS |
| power_flow_report_pdf | `network_model/reporting/power_flow_report_pdf.py` | AS-IS |
| power_flow_report_docx | `network_model/reporting/power_flow_report_docx.py` | AS-IS |
| protection_report_pdf | `network_model/reporting/protection_report_pdf.py` | AS-IS |
| protection_report_docx | `network_model/reporting/protection_report_docx.py` | AS-IS |
| NumericDelta, ComplexDelta, RunComparisonResult | `domain/results.py` | AS-IS |
| P24+ full report | `analysis/reporting/pdf/p24_plus_report.py` | AS-IS (partial) |
| ReportHeader, ReportContext, ReportType | — | TO-BE |

---

## §11.12 — Definition of Done — Rozdział 11

1. ✅ Każdy wynik obliczeniowy = raport (klasy PRIMARY zdefiniowane)
2. ✅ Każdy raport = trace + cross-reference (łańcuch śladu + CrossReferenceTable)
3. ✅ Każdy raport = reprodukowalny (deterministic export, hash chain)
4. ✅ Parytet benchmark osiągnięty (feature matrix ≥ benchmark)
5. ✅ ProofPack architektura = AS-IS (ProofPackBuilder, manifest, signature)
6. ✅ Formaty: JSON, JSONL, PDF, DOCX, LaTeX, CSV/XLSX
7. ✅ Walidacje: E-RPT-01..05, W-RPT-01..03, I-RPT-01..02
8. ✅ Inwarianty: INV-RPT-01..12
9. ✅ Zakazy: Z-RPT-01..05
10. ✅ API endpointy: 14 (AS-IS) + 4 (TO-BE)
11. ✅ Mapowanie na kod kompletne (21 komponentów)

**DOMENA RAPORTOWANIA I EKSPORTU W ROZDZIALE 11 JEST ZAMKNIĘTA (v1.0).**

