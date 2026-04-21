> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Rozdział 12 — Walidacje Systemowe, QA, Reguły Blokujące (benchmark-GRADE)

**Wersja:** 1.0
**Status:** AS-IS + TO-BE (jawnie oznaczone)
**Warstwa:** Application + Validation + Analysis
**Zależności:** Rozdział 2 (ENM), 5 (Kontrakty), 6 (Solvery), 9 (Zabezpieczenia), 10 (Study Cases), 11 (Raportowanie)
**Decision Matrix:** Decyzje #94–#101

---

## §12.0 Zakres i cel

### §12.0.1 Zasada nadrzędna

> **Żadne obliczenie w MV-DESIGN-PRO nie może zostać uruchomione bez przejścia
> pełnego łańcucha walidacji. Reguły blokujące (BLOCKER/ERROR) BEZWZGLĘDNIE
> zatrzymują pipeline obliczeniowy.**

Walidacja:
- nie jest solverem — nie wykonuje obliczeń fizycznych,
- nie jest raportem — nie interpretuje wyników,
- jest **bramką jakości** (quality gate) na każdym etapie przetwarzania.

### §12.0.2 Granica warstwy

```
┌────────────────────────────────────────────────────────────────┐
│              WARSTWA WALIDACJI — NIE-SOLVER                     │
│                                                                  │
│  Walidacja ∈ Application Layer + Analysis Layer                  │
│  Walidacja ∉ Solver Layer (zakaz fizyki)                         │
│  Walidacja ∉ Presentation Layer (zakaz generowania danych)       │
│                                                                  │
│  Walidacja BLOKUJE solver, ale NIE go zastępuje.                │
│  Walidacja INTERPRETUJE wyniki (post-solver), ale NIE oblicza.  │
└────────────────────────────────────────────────────────────────┘
```

### §12.0.3 Parytet benchmark / benchmark

| Funkcja | benchmark | benchmark | MV-DESIGN-PRO |
|---------|------|--------------|---------------|
| Pre-solver validation gate | ✓ | ✓ (Check Network Data) | ✓ (ENMValidator + NetworkValidator) |
| Severity levels | 3 | 3 | 3 (BLOCKER/IMPORTANT/INFO) |
| Polish messages | — | — | ✓ (100% PL) |
| Wizard step validation | ✓ | ✓ (Task Automation) | ✓ (K1–K10 evaluation) |
| Post-solver energy QA | ✓ | ✓ | ✓ (EnergyValidationBuilder) |
| Protection sanity checks | ✓ | ✓ | ✓ (16 coded rules) |
| Analysis readiness matrix | — | — | ✓ (SC3F/SC1F/LoadFlow) |
| Deterministic validation | — | — | ✓ (same ENM → identical result) |

---

## §12.1 Architektura walidacji — 6 warstw kanonicznych

System walidacji MV-DESIGN-PRO składa się z 6 odrębnych warstw, uruchamianych
w ściśle określonej kolejności. Każda warstwa ma własny zbiór reguł, kodów
i kontraktów danych.

```
ENM (edytowalny)
  │
  ▼
┌──────────────────────────────────────────────┐
│ W1: ENMValidator (enm/validator.py)           │  ← Warstwa strukturalno-parametryczna ENM
│     E001–E008 (BLOCKER)                       │
│     W001–W008 (IMPORTANT)                     │
│     I001–I005 (INFO)                          │
│     → ValidationResult (status + availability)│
└──────────────────────────────────────────────┘
  │ (jeśli OK/WARN)
  ▼
┌──────────────────────────────────────────────┐
│ W2: NetworkValidator (network_model/          │  ← Warstwa grafowa pre-solver
│     validation/validator.py)                  │
│     13 reguł (ERROR/WARNING)                  │
│     → ValidationReport (is_valid, issues)     │
└──────────────────────────────────────────────┘
  │ (jeśli is_valid=True)
  ▼
┌──────────────────────────────────────────────┐
│ W3: WizardValidator (application/             │  ← Warstwa kompletności kreatora
│     network_wizard/validator.py)              │
│     K1–K10 step evaluation                    │
│     IssueSeverity: BLOCKER/IMPORTANT/INFO     │
│     → WizardStateResponse (overall_status)    │
└──────────────────────────────────────────────┘
  │ (jeśli overall_status ≠ "blocked")
  ▼
┌──────────────────────────────────────────────┐
│ W4: ProtectionSanityChecks (application/      │  ← Warstwa walidacji zabezpieczeń
│     analyses/protection/sanity_checks/)       │
│     16 coded rules (ERROR/WARN/INFO)          │
│     → ProtectionSanityCheckResult[]           │
└──────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────┐
│ W5: Pre-Calculation Checks (Rozdział 10)      │  ← Warstwa pre-run (E-SC/W-SC/B-SC)
│     AnalysisRun state machine gate            │
│     → CREATED → VALIDATED → RUNNING           │
└──────────────────────────────────────────────┘
  │ (po zakończeniu obliczeń)
  ▼
┌──────────────────────────────────────────────┐
│ W6: EnergyValidationBuilder (analysis/        │  ← Warstwa post-solver QA
│     energy_validation/builder.py)             │
│     5 typów sprawdzeń (PASS/WARNING/FAIL)     │
│     → EnergyValidationView                    │
└──────────────────────────────────────────────┘
```

### §12.1.1 Inwariant kolejności

> **INV-VAL-01:** Warstwy W1→W2→W3→W4→W5 MUSZĄ być wykonane PRZED uruchomieniem
> solvera. Warstwa W6 wykonywana jest PO zakończeniu obliczeń.

> **INV-VAL-02:** Reguły blokujące (BLOCKER/ERROR) na dowolnej warstwie W1–W5
> BEZWZGLĘDNIE zatrzymują pipeline. Solver NIE MOŻE być uruchomiony.

---

## §12.2 W1: ENMValidator — walidacja strukturalno-parametryczna ENM

### §12.2.1 Kontrakt AS-IS

```python
# enm/validator.py

class ValidationIssue(BaseModel):          # Pydantic v2
    code: str                              # "E001"–"I005"
    severity: Literal["BLOCKER", "IMPORTANT", "INFO"]
    message_pl: str                        # 100% Polish
    element_refs: list[str] = []           # ref_id elementów
    wizard_step_hint: str = ""             # "K2"–"K7"
    suggested_fix: str | None = None       # sugestia naprawy (PL)

class AnalysisAvailability(BaseModel):
    short_circuit_3f: bool = False
    short_circuit_1f: bool = False
    load_flow: bool = False

class ValidationResult(BaseModel):
    status: Literal["OK", "WARN", "FAIL"]
    issues: list[ValidationIssue] = []
    analysis_available: AnalysisAvailability = AnalysisAvailability()
```

### §12.2.2 Tabela reguł BLOCKER (E001–E008)

| Kod | Reguła | Severity | message_pl | wizard_step_hint |
|-----|--------|----------|------------|------------------|
| E001 | Brak źródła zasilania | BLOCKER | „Brak źródła zasilania w modelu sieci." | K2 |
| E002 | Brak szyn (węzłów) | BLOCKER | „Brak szyn (węzłów) w modelu sieci." | K3 |
| E003 | Graf niespójny — wyspa odcięta od źródła | BLOCKER | „Wyspa sieci odcięta od źródła zasilania: {refs}" | K4 |
| E004 | Szyna bez napięcia znamionowego (voltage_kv ≤ 0) | BLOCKER | „Szyna '{ref_id}' nie ma napięcia znamionowego…" | K3 |
| E005 | Gałąź z zerową impedancją (R=0 i X=0 Ω/km) | BLOCKER | „Gałąź '{ref_id}' ma zerową impedancję…" | K4 |
| E006 | Transformator bez napięcia zwarcia (uk% ≤ 0) | BLOCKER | „Transformator '{ref_id}' nie ma napięcia zwarcia…" | K5 |
| E007 | Transformator: HV = LV na tej samej szynie | BLOCKER | „Transformator '{ref_id}': strona HV i LV podłączone do tej samej szyny…" | K5 |
| E008 | Źródło bez parametrów zwarciowych (brak Sk″, Ik″, R/X) | BLOCKER | „Źródło '{ref_id}' nie ma parametrów zwarciowych…" | K2 |

### §12.2.3 Tabela reguł IMPORTANT (W001–W008)

| Kod | Reguła | Severity | message_pl | wizard_step_hint |
|-----|--------|----------|------------|------------------|
| W001 | Gałąź bez impedancji zerowej Z₀ | IMPORTANT | „Gałąź '{ref_id}' nie ma składowej zerowej (Z₀) — zwarcia 1F/2F-Z niedostępne." | K7 |
| W002 | Źródło bez impedancji zerowej Z₀ | IMPORTANT | „Źródło '{ref_id}' nie ma składowej zerowej (Z₀) — zwarcia 1F/2F-Z niedostępne." | K2 |
| W003 | Brak odbiorów i generatorów | IMPORTANT | „Brak odbiorów i generatorów — rozpływ mocy będzie pusty." | K6 |
| W004 | Transformator bez grupy połączeń | IMPORTANT | „Transformator '{ref_id}' nie ma grupy połączeń (vector_group)." | K5 |
| W005 | Stacja — referencja do nieistniejącej szyny/trafo | IMPORTANT | „Stacja '{ref_id}' zawiera referencję do nieistniejącej szyny/trafo '{br}'." | K3/K5 |
| W006 | Pole (Bay) — referencja do nieistniejącej stacji/szyny | IMPORTANT | „Pole '{ref_id}' referencja do nieistniejącej stacji/szyny." | K3 |
| W007 | Węzeł T z < 3 gałęziami lub nieistniejącą gałęzią | IMPORTANT | „Węzeł T '{ref_id}' ma {n} gałęzi — wymagane minimum 3." | K4 |
| W008 | Magistrala (Corridor) z nieistniejącym segmentem | IMPORTANT | „Magistrala '{ref_id}' referencja do nieistniejącego segmentu." | K4 |

### §12.2.4 Tabela reguł INFO (I001–I005)

| Kod | Reguła | Severity | message_pl | wizard_step_hint |
|-----|--------|----------|------------|------------------|
| I001 | Łącznik w stanie „open" | INFO | „Łącznik '{ref_id}' w stanie 'open' — odcina część sieci." | K3 |
| I002 | Gałąź bez referencji katalogowej | INFO | „Gałąź '{ref_id}' bez katalogu — parametry wprowadzone ręcznie." | K4 |
| I003 | Stacja bez pól rozdzielczych (bayów) | INFO | „Stacja '{ref_id}' nie ma przypisanych pól rozdzielczych." | K3 |
| I004 | Magistrala bez segmentów | INFO | „Magistrala '{ref_id}' nie ma segmentów." | K4 |
| I005 | Pierścień bez punktu NO | INFO | „Magistrala pierścieniowa '{ref_id}' nie ma zdefiniowanego punktu NO." | K4 |

### §12.2.5 Logika AnalysisAvailability

```
has_blockers = any(issue.severity == "BLOCKER" for issue in issues)

if has_blockers:
    → SC3F=False, SC1F=False, LoadFlow=False

else:
    SC3F = True  (zawsze jeśli brak blokerów)
    SC1F = not any(issue.code in ("W001", "W002") for issue in issues)
    LoadFlow = bool(enm.loads) or bool(enm.generators)
```

### §12.2.6 Sprawdzenie spójności grafu

ENMValidator buduje graf NetworkX z:
- szyn → węzły,
- gałęzi (closed) → krawędzie,
- transformatorów → krawędzie.

Identyfikuje wyspy bez źródła zasilania → E003 (BLOCKER).

---

## §12.3 W2: NetworkValidator — walidacja grafowa pre-solver

### §12.3.1 Kontrakt AS-IS

```python
# network_model/validation/validator.py

class Severity(Enum):
    ERROR = "ERROR"      # Blocking — solver cannot run
    WARNING = "WARNING"  # Non-blocking — solver can run with caution

@dataclass
class ValidationIssue:
    code: str                          # "network.empty", "branch.self_loop", etc.
    message: str                       # Polish
    severity: Severity = Severity.ERROR
    element_id: Optional[str] = None
    field: Optional[str] = None
    suggested_fix: Optional[str] = None

@dataclass
class ValidationReport:
    issues: tuple = field(default_factory=tuple)

    @property
    def is_valid(self) -> bool:                     # True jeśli brak ERROR
        return not any(i.severity == Severity.ERROR for i in self.issues)

    def with_error(self, issue) -> "ValidationReport":   # immutable builder
    def with_warning(self, issue) -> "ValidationReport":
```

### §12.3.2 Tabela 13 reguł NetworkValidator

| # | Reguła | Severity | Kod | Opis |
|---|--------|----------|-----|------|
| 1 | Empty network | ERROR | `network.empty` | Sieć bez szyn |
| 2 | Connectivity | ERROR | `network.disconnected` | Niespójna topologia (n wysp) |
| 3 | Source presence | ERROR | `network.no_source` | Brak SLACK lub falownikowego źródła |
| 4 | Dangling endpoints | ERROR | `branch.dangling_from/to` | Gałąź z nieistniejącą szyną |
| 5 | Bus voltages | ERROR | `bus.voltage_invalid` | voltage_level ≤ 0 |
| 6 | Branch endpoints | ERROR | `branch.from_missing/to_missing/self_loop` | Brak szyny lub pętla |
| 7 | Transformer voltages | ERROR | `transformer.voltage_equal/hv_invalid/lv_invalid` | HV=LV lub ≤0 |
| 8 | SLACK node | ERROR | `network.no_slack/multiple_slack` | Brak lub > 1 SLACK |
| 9 | Switch endpoints | ERROR | `switch.from_missing/to_missing/self_loop` | Łącznik z nieistniejącą szyną |
| 10 | Inverter source buses | ERROR | `source.bus_missing` | Falownik na nieistniejącej szynie |
| 11 | Branch impedance | WARNING | `branch.impedance_zero/length_zero` | R=X=0 lub length ≤ 0 |
| 12 | Transformer polarity | WARNING | `transformer.polarity_reversed` | GN podłączone do niższego napięcia |
| 13 | Voltage consistency | WARNING | `branch.voltage_mismatch` | Linia/kabel łączy szyny o różnych U_nom |

### §12.3.3 Relacja W1 vs W2

| Aspekt | W1 (ENMValidator) | W2 (NetworkValidator) |
|--------|-------------------|----------------------|
| Warstwa | Application (ENM dict) | Network Model (NetworkGraph) |
| Input | raw ENM JSON | zmapowany graf solvera |
| Severity | BLOCKER/IMPORTANT/INFO | ERROR/WARNING |
| Kody | E001–I005 | `network.*`, `branch.*`, `transformer.*`, `switch.*`, `source.*` |
| Cel | readiness gate + UI | solver pre-check |
| Output | ValidationResult (Pydantic) | ValidationReport (dataclass, immutable) |

> **INV-VAL-03:** W1 i W2 są komplementarne — W1 waliduje surowy ENM (na etapie edycji),
> W2 waliduje zmapowany graf obliczeniowy (bezpośrednio przed solverem).

---

## §12.4 W3: Wizard Validator — kompletność i readiness

### §12.4.1 Kontrakt AS-IS

```python
# application/network_wizard/schema.py

class StepStatus(str, Enum):
    EMPTY = "empty"        # Krok pusty
    PARTIAL = "partial"    # Krok częściowo wypełniony
    COMPLETE = "complete"  # Krok ukończony
    ERROR = "error"        # Krok z blokerem

class IssueSeverity(str, Enum):
    BLOCKER = "BLOCKER"
    IMPORTANT = "IMPORTANT"
    INFO = "INFO"

class WizardIssue(BaseModel):
    code: str                      # "K2_NO_SOURCE", "K5_UK_ZERO", etc.
    severity: IssueSeverity
    message_pl: str                # 100% Polish
    element_ref: str | None = None
    wizard_step_hint: str | None = None
    suggested_fix: str | None = None

class StepState(BaseModel):
    step_id: str                   # "K1"–"K10"
    status: StepStatus
    completion_percent: int        # 0–100
    issues: list[WizardIssue]

class ReadinessMatrix(BaseModel):
    short_circuit_3f: AnalysisReadiness
    short_circuit_1f: AnalysisReadiness
    load_flow: AnalysisReadiness

class WizardStateResponse(BaseModel):
    steps: list[StepState]
    overall_status: str            # "empty" | "incomplete" | "ready" | "blocked"
    readiness_matrix: ReadinessMatrix
    element_counts: ElementCounts
```

### §12.4.2 Kody walidacyjne kreatora

| Kod | Krok | Severity | Reguła |
|-----|------|----------|--------|
| K1_NO_NAME | K1 | BLOCKER | Brak nazwy projektu |
| K2_NO_SOURCE_BUS | K2 | BLOCKER | Brak szyny źródłowej |
| K2_NO_SOURCE | K2 | BLOCKER | Brak źródła zasilania |
| K3_NO_BUSES | K3 | BLOCKER | Brak szyn w modelu |
| K4_DANGLING_FROM | K4 | BLOCKER | Gałąź: szyna źródłowa nie istnieje |
| K4_DANGLING_TO | K4 | BLOCKER | Gałąź: szyna docelowa nie istnieje |
| K5_UK_ZERO | K5 | BLOCKER | Trafo: uk% = 0 |
| K5_SN_ZERO | K5 | BLOCKER | Trafo: Sn = 0 |
| K6_LOAD_DANGLING | K6 | BLOCKER | Odbiór: szyna nie istnieje |
| K7_LINES_NO_Z0 | K7 | INFO | N gałęzi bez impedancji zerowej Z₀ |
| K7_SRC_NO_Z0 | K7 | INFO | N źródeł bez impedancji zerowej Z₀ |
| K8_HAS_BLOCKERS | K8 | BLOCKER | N kroków z blokerami |

### §12.4.3 ReadinessMatrix — logika

```
SC3F: available = brak blokerów AND szyny AND źródła AND gałęzie/trafo
SC1F: available = SC3F available AND wszystkie linie mają Z₀ AND wszystkie źródła mają Z₀
LoadFlow: available = szyny AND źródła AND (odbiory OR generatory) AND brak blokerów
```

### §12.4.4 Overall status

```
has_blockers → "blocked"
required_complete AND optional_ok → "ready"
any_data → "incomplete"
else → "empty"
```

Determinizm: ten sam ENM → identyczna WizardStateResponse.

---

## §12.5 W4: Protection Sanity Checks — walidacja parametrów zabezpieczeń

### §12.5.1 Kontrakt AS-IS

```python
# application/analyses/protection/sanity_checks/models.py

class SanityCheckSeverity(str, Enum):
    ERROR = "ERROR"    # Konfiguracja nieprawidłowa
    WARN = "WARN"      # Konfiguracja problematyczna
    INFO = "INFO"      # Brak danych do pełnej analizy

class SanityCheckCode(str, Enum):
    # 16 stabilnych kodów reguł
    VOLT_MISSING_UN = "VOLT_MISSING_UN"
    VOLT_OVERLAP = "VOLT_OVERLAP"
    VOLT_U_LT_TOO_LOW = "VOLT_U_LT_TOO_LOW"
    VOLT_U_GT_TOO_HIGH = "VOLT_U_GT_TOO_HIGH"
    FREQ_OVERLAP = "FREQ_OVERLAP"
    FREQ_F_LT_TOO_LOW = "FREQ_F_LT_TOO_LOW"
    FREQ_F_GT_TOO_HIGH = "FREQ_F_GT_TOO_HIGH"
    ROCOF_NON_POSITIVE = "ROCOF_NON_POSITIVE"
    ROCOF_TOO_HIGH = "ROCOF_TOO_HIGH"
    OC_MISSING_IN = "OC_MISSING_IN"
    OC_OVERLAP = "OC_OVERLAP"
    OC_I_GT_TOO_LOW = "OC_I_GT_TOO_LOW"
    OC_I_INST_TOO_LOW = "OC_I_INST_TOO_LOW"
    SPZ_NO_TRIP_FUNCTION = "SPZ_NO_TRIP_FUNCTION"
    SPZ_MISSING_CYCLE_DATA = "SPZ_MISSING_CYCLE_DATA"
    GEN_NEGATIVE_SETPOINT = "GEN_NEGATIVE_SETPOINT"
    GEN_PARTIAL_ANALYSIS = "GEN_PARTIAL_ANALYSIS"

@dataclass(frozen=True)
class ProtectionSanityCheckResult:
    severity: SanityCheckSeverity
    code: SanityCheckCode
    message_pl: str                    # 100% Polish
    element_id: str
    element_type: str
    function_ansi: str | None = None   # kod ANSI (np. "27", "50")
    function_code: str | None = None   # kod wewnętrzny
    evidence: dict[str, Any] | None = None  # dane wejściowe jako dowód
```

### §12.5.2 Tabela 16 reguł protection sanity

| Grupa | Kod | Severity | Reguła |
|-------|-----|----------|--------|
| Napięciowe (27/59) | VOLT_MISSING_UN | ERROR | Brak wartości Un dla nastawy napięciowej |
| | VOLT_OVERLAP | ERROR | Nakładanie się progów U< i U> (U< ≥ U>) |
| | VOLT_U_LT_TOO_LOW | WARN | Próg U< zbyt niski (< 0,5×Un) |
| | VOLT_U_GT_TOO_HIGH | WARN | Próg U> zbyt wysoki (> 1,2×Un) |
| Częstotliwościowe (81) | FREQ_OVERLAP | ERROR | f< ≥ f> |
| | FREQ_F_LT_TOO_LOW | WARN | f< < 45 Hz |
| | FREQ_F_GT_TOO_HIGH | WARN | f> > 55 Hz |
| ROCOF (81R) | ROCOF_NON_POSITIVE | WARN | df/dt ≤ 0 |
| | ROCOF_TOO_HIGH | WARN | df/dt > 10 Hz/s |
| Nadprądowe (50/51) | OC_MISSING_IN | ERROR | Brak wartości In dla nastawy prądowej |
| | OC_OVERLAP | ERROR | I> ≥ I>> |
| | OC_I_GT_TOO_LOW | WARN | I> < 1,0×In |
| | OC_I_INST_TOO_LOW | WARN | I>> < 1,5×In |
| SPZ (79) | SPZ_NO_TRIP_FUNCTION | WARN | SPZ aktywne bez funkcji wyzwalających |
| | SPZ_MISSING_CYCLE_DATA | INFO | Brak danych cyklu SPZ |
| Ogólne | GEN_NEGATIVE_SETPOINT | ERROR | Nastawa niefizyczna (ujemna) |
| | GEN_PARTIAL_ANALYSIS | INFO | Brak danych bazowych — analiza częściowa |

### §12.5.3 API kanoniczne

```python
def run_sanity_checks(
    functions: list[ProtectionFunctionSummary],
    base_values: BaseValues,
    element_context: ElementContext,
) -> list[ProtectionSanityCheckResult]
```

Determinizm: wyniki sortowane po `(element_id, severity_order, code)`.

### §12.5.4 Protection Catalog Validator

Osobny walidator sprawdza zgodność wymagań z możliwościami urządzenia:

```python
# application/analyses/protection/catalog/validator.py

def validate_requirement(
    req: ProtectionRequirementV0,
    cap: DeviceCapability,
) -> tuple[bool, tuple[str, ...]]
# Violations: UNSUPPORTED_CURVE, UNSUPPORTED_FUNCTION_*, *_OUT_OF_RANGE
```

Sprawdzane: krzywe, funkcje 50/51/50N/51N, zakresy nastaw (pickup, TMS, inst).

---

## §12.6 W5: Pre-Calculation Checks — bramka AnalysisRun

Walidacje pre-calculation zdefiniowane w Rozdziale 10 (§10.18). Podsumowanie
dla kompletności:

### §12.6.1 Kody ERROR (E-SC-01..05)

| Kod | Reguła |
|-----|--------|
| E-SC-01 | Brak konfiguracji obliczeniowej |
| E-SC-02 | c_factor ≤ 0 |
| E-SC-03 | tolerance ≤ 0 |
| E-SC-04 | Brak aktywnego Study Case |
| E-SC-05 | ENM zawiera blokery (FAIL z W1) |

### §12.6.2 Kody WARNING (W-SC-01..02)

| Kod | Reguła |
|-----|--------|
| W-SC-01 | Wyniki OUTDATED (ENM zmieniony po ostatnim run) |
| W-SC-02 | Brak trace z poprzedniego runu |

### §12.6.3 Kody BLOCKER strict (B-SC-01)

| Kod | Reguła |
|-----|--------|
| B-SC-01 | Brak White Box (tryb strict — wymaga trace) |

### §12.6.4 State machine gate

```
AnalysisRun: CREATED → [walidacja W1+W2+W3+W5] → VALIDATED → RUNNING → FINISHED/FAILED
```

Przejście CREATED→VALIDATED wymaga: E-SC-* = 0 blokerów.

---

## §12.7 W6: Energy Validation — post-solver QA

### §12.7.1 Kontrakt AS-IS

```python
# analysis/energy_validation/models.py

class EnergyCheckType(str, Enum):
    BRANCH_LOADING = "BRANCH_LOADING"
    TRANSFORMER_LOADING = "TRANSFORMER_LOADING"
    VOLTAGE_DEVIATION = "VOLTAGE_DEVIATION"
    LOSS_BUDGET = "LOSS_BUDGET"
    REACTIVE_BALANCE = "REACTIVE_BALANCE"

class EnergyValidationStatus(str, Enum):
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"
    NOT_COMPUTED = "NOT_COMPUTED"

@dataclass(frozen=True)
class EnergyValidationItem:
    check_type: EnergyCheckType
    target_id: str
    target_name: str | None
    observed_value: float | None
    unit: str
    limit_warn: float | None
    limit_fail: float | None
    margin_pct: float | None
    status: EnergyValidationStatus
    why_pl: str                         # uzasadnienie po polsku

@dataclass(frozen=True)
class EnergyValidationConfig:
    loading_warn_pct: float = 80.0      # obciążenie: ostrzeżenie ≥ 80%
    loading_fail_pct: float = 100.0     # obciążenie: przekroczenie ≥ 100%
    voltage_warn_pct: float = 5.0       # napięcie: ostrzeżenie ≥ ±5%
    voltage_fail_pct: float = 10.0      # napięcie: przekroczenie ≥ ±10%
    loss_warn_pct: float = 5.0          # straty: ostrzeżenie ≥ 5% P_slack
    loss_fail_pct: float = 10.0         # straty: przekroczenie ≥ 10% P_slack

@dataclass(frozen=True)
class EnergyValidationSummary:
    pass_count: int
    warning_count: int
    fail_count: int
    not_computed_count: int
    worst_item_target_id: str | None
    worst_item_margin_pct: float | None

@dataclass(frozen=True)
class EnergyValidationView:
    context: EnergyValidationContext | None
    config: EnergyValidationConfig
    items: tuple[EnergyValidationItem, ...]
    summary: EnergyValidationSummary
```

### §12.7.2 Tabela 5 sprawdzeń energetycznych

| Typ | Co sprawdza | Limit WARN | Limit FAIL | Jednostka |
|-----|-------------|------------|------------|-----------|
| BRANCH_LOADING | I_branch / I_rated × 100% | 80% | 100% | % |
| TRANSFORMER_LOADING | S_trafo / S_rated × 100% | 80% | 100% | % |
| VOLTAGE_DEVIATION | \|U − U_nom\| / U_nom × 100% | 5% | 10% | % |
| LOSS_BUDGET | P_loss / P_slack × 100% | 5% | 10% | % |
| REACTIVE_BALANCE | cos(φ) na szynie SLACK | 0.9 | 0.8 | cos(φ) |

### §12.7.3 Logika progowa

```python
if value >= fail_limit:
    status = FAIL
elif value >= warn_limit:
    status = WARNING
else:
    status = PASS
```

Przypadki specjalne:
- Brak danych wejściowych → `NOT_COMPUTED` z `why_pl`.
- I_rated = 0 → `NOT_COMPUTED` (brak prądu znamionowego).
- P_slack ≈ 0 → `NOT_COMPUTED` (brak mocy bilansowej).

### §12.7.4 Determinizm

Sortowanie wyników: `(status_order, -margin, check_type, target_id)` — najgorsze elementy na górze.

### §12.7.5 Worst-item tracking

`EnergyValidationSummary.worst_item_target_id` — element z najgorszym marginesem
(największe przekroczenie powyżej `limit_fail`).

---

## §12.8 Domain Validation — kontrakt bazowy

### §12.8.1 Kontrakt AS-IS

```python
# domain/validation.py

@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message: str
    element_id: str | None = None
    field: str | None = None

@dataclass(frozen=True)
class ValidationReport:
    errors: tuple[ValidationIssue, ...] = field(default_factory=tuple)
    warnings: tuple[ValidationIssue, ...] = field(default_factory=tuple)

    @property
    def is_valid(self) -> bool:
        return not self.errors

    def with_error(self, issue) -> "ValidationReport":   # immutable
    def with_warning(self, issue) -> "ValidationReport":  # immutable
```

### §12.8.2 Wyjątek ValidationFailed

```python
# application/network_wizard/errors.py

class ValidationFailed(NetworkWizardError):
    def __init__(self, report: ValidationReport) -> None:
        super().__init__("Network validation failed")
        self.report = report
```

Rzucany gdy W2 (NetworkValidator) zwróci `is_valid=False` — blokuje edycję kreatora.

---

## §12.9 Macierz severity — unifikacja

System walidacji używa 3 osobnych enumów severity. Poniższa tabela definiuje
kanoniczne mapowanie:

| W1 (ENM) | W2 (Network) | W3 (Wizard) | W4 (Protection) | W6 (Energy) | Znaczenie |
|-----------|--------------|-------------|-----------------|-------------|-----------|
| BLOCKER | ERROR | BLOCKER | ERROR | FAIL | **Blokujące** — solver/akcja zablokowana |
| IMPORTANT | WARNING | IMPORTANT | WARN | WARNING | **Ostrzeżenie** — solver może działać, ale z ryzykiem |
| INFO | — | INFO | INFO | NOT_COMPUTED | **Informacja** — brak wpływu na solver |

> **INV-VAL-04:** Reguły na poziomie „Blokujące" (BLOCKER/ERROR/FAIL) MUSZĄ
> uniemożliwić uruchomienie solvera lub oznaczyć wynik jako nieprzydatny.

> **TO-BE:** Ujednolicenie enumów severity do jednego kanonicznego:
> `ValidationSeverity(BLOCKER, WARNING, INFO)`. Wymaga ADR.

---

## §12.10 Determinizm walidacji

### §12.10.1 Zasada fundamentalna

> **INV-VAL-05:** Ten sam ENM → identyczna lista issues (te same kody, ta sama
> kolejność, te same `element_refs`).

### §12.10.2 Gwarancje deterministyczne per warstwa

| Warstwa | Determinizm | Mechanizm |
|---------|-------------|-----------|
| W1 | ✓ | Iteracja po listach ENM w naturalnej kolejności |
| W2 | ✓ | Iteracja po `graph.nodes.keys()`, `graph.branches.keys()` (dict order) |
| W3 | ✓ | Jawnie: „same ENM → identical WizardStateResponse" |
| W4 | ✓ | Sortowanie wyników: `(element_id, severity_order, code)` |
| W5 | ✓ | Reguły statyczne na AnalysisRun config |
| W6 | ✓ | Iteracja po `sorted(graph.branches.keys())`, `sorted(graph.nodes.keys())` |

### §12.10.3 Zakazy

- **Z-VAL-01:** Walidacja NIE MOŻE zależeć od czasu, RNG ani kolejności HTTP requestów.
- **Z-VAL-02:** Walidacja NIE MOŻE modyfikować ENM ani NetworkGraph.
- **Z-VAL-03:** Walidacja NIE MOŻE wykonywać obliczeń fizycznych (NOT-A-SOLVER).
- **Z-VAL-04:** Walidacja NIE MOŻE generować danych wynikowych — tylko issues.
- **Z-VAL-05:** Reguły blokujące NIE MOGĄ być pominięte przez UI, API ani CI.

---

## §12.11 API walidacyjne

### §12.11.1 Endpointy AS-IS

| # | Method | Path | Warstwa | Response |
|---|--------|------|---------|----------|
| 1 | GET | `/api/cases/{case_id}/enm/validate` | W1 | `ValidationResult` |
| 2 | GET | `/api/cases/{case_id}/wizard/state` | W3 | `WizardStateResponse` |
| 3 | POST | `/api/cases/{case_id}/wizard/step` | W3 | `WizardStateResponse` |
| 4 | POST | `/api/cases/{case_id}/protection/sanity-checks` | W4 | `ProtectionSanityCheckResult[]` |
| 5 | GET | `/api/runs/{run_id}/energy-validation` | W6 | `EnergyValidationView` |

### §12.11.2 Endpointy TO-BE

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji.

| # | Method | Path | Warstwa | Response |
|---|--------|------|---------|----------|
| 6 | GET | `/api/cases/{case_id}/validation/full` | W1+W2+W3 | Unified ValidationReport |
| 7 | GET | `/api/cases/{case_id}/validation/readiness` | W1+W3 | ReadinessMatrix (extended) |
| 8 | POST | `/api/runs/{run_id}/validation/pre-check` | W5 | Pre-calculation check result |

---

## §12.12 Inwarianty walidacji (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-VAL-01 | Warstwy W1→W5 MUSZĄ być wykonane PRZED solverem. W6 PO solverze. |
| INV-VAL-02 | BLOCKER/ERROR na W1–W5 BEZWZGLĘDNIE blokuje solver. |
| INV-VAL-03 | W1 (ENM level) i W2 (graph level) są komplementarne, nie zamienne. |
| INV-VAL-04 | Reguły blokujące (BLOCKER/ERROR/FAIL) uniemożliwiają uruchomienie solvera. |
| INV-VAL-05 | Ten sam ENM → identyczna lista issues (determinizm). |
| INV-VAL-06 | Każda reguła ma unikalny, stabilny kod (nigdy nie zmienia się po publikacji). |
| INV-VAL-07 | Każdy issue ma `message_pl` (100% Polish) i opcjonalny `suggested_fix`. |
| INV-VAL-08 | ValidationReport (W2) jest immutable — builder pattern `with_error/with_warning`. |
| INV-VAL-09 | AnalysisAvailability mapuje wyniki walidacji na macierz dostępnych analiz. |
| INV-VAL-10 | EnergyValidation (W6) operuje WYŁĄCZNIE na frozen PowerFlowResult (nie modyfikuje). |
| INV-VAL-11 | Protection sanity checks wymagają evidence dict jako dowód (nie opinię). |
| INV-VAL-12 | WizardStateResponse zawiera overall_status ∈ {empty, incomplete, ready, blocked}. |

---

## §12.13 Mapowanie na kod

### §12.13.1 Warstwa W1 — ENMValidator

| Komponent | Ścieżka | Status |
|-----------|---------|--------|
| ENMValidator | `enm/validator.py` | AS-IS |
| ValidationIssue (Pydantic) | `enm/validator.py:28` | AS-IS |
| ValidationResult | `enm/validator.py:43` | AS-IS |
| AnalysisAvailability | `enm/validator.py:37` | AS-IS |
| _check_blockers (E001–E008) | `enm/validator.py:82` | AS-IS |
| _check_warnings (W001–W004) | `enm/validator.py:193` | AS-IS |
| _check_info (I001–I002) | `enm/validator.py:258` | AS-IS |
| _check_topology_entities (W005–I005) | `enm/validator.py:291` | AS-IS |
| _check_graph_connectivity | `enm/validator.py:446` | AS-IS |
| _compute_availability | `enm/validator.py:489` | AS-IS |

### §12.13.2 Warstwa W2 — NetworkValidator

| Komponent | Ścieżka | Status |
|-----------|---------|--------|
| NetworkValidator | `network_model/validation/validator.py:145` | AS-IS |
| Severity enum | `network_model/validation/validator.py:26` | AS-IS |
| ValidationIssue (dataclass) | `network_model/validation/validator.py:33` | AS-IS |
| ValidationReport (immutable) | `network_model/validation/validator.py:65` | AS-IS |
| validate_network() convenience | `network_model/validation/validator.py:691` | AS-IS |

### §12.13.3 Warstwa W3 — Wizard Validator

| Komponent | Ścieżka | Status |
|-----------|---------|--------|
| validate_wizard_state() | `application/network_wizard/validator.py:247` | AS-IS |
| _eval_k1..k7 | `application/network_wizard/validator.py:26–185` | AS-IS |
| _compute_readiness | `application/network_wizard/validator.py:188` | AS-IS |
| WizardIssue, StepState | `application/network_wizard/schema.py:35–53` | AS-IS |
| ReadinessMatrix | `application/network_wizard/schema.py:65` | AS-IS |
| WizardStateResponse | `application/network_wizard/schema.py:82` | AS-IS |
| IssueSeverity | `application/network_wizard/schema.py:28` | AS-IS |

### §12.13.4 Warstwa W4 — Protection Sanity Checks

| Komponent | Ścieżka | Status |
|-----------|---------|--------|
| run_sanity_checks() | `application/analyses/protection/sanity_checks/__init__.py:49` | AS-IS |
| SanityCheckSeverity | `application/analyses/protection/sanity_checks/models.py:23` | AS-IS |
| SanityCheckCode (16 kodów) | `application/analyses/protection/sanity_checks/models.py:46` | AS-IS |
| ProtectionSanityCheckResult | `application/analyses/protection/sanity_checks/models.py:90` | AS-IS |
| ALL_RULES (7 grup) | `application/analyses/protection/sanity_checks/rules.py` | AS-IS |
| validate_requirement() | `application/analyses/protection/catalog/validator.py:9` | AS-IS |
| SANITY_CHECK_CODE_LABELS_PL | `application/analyses/protection/sanity_checks/models.py:153` | AS-IS |

### §12.13.5 Warstwa W6 — Energy Validation

| Komponent | Ścieżka | Status |
|-----------|---------|--------|
| EnergyValidationBuilder | `analysis/energy_validation/builder.py:27` | AS-IS |
| EnergyCheckType | `analysis/energy_validation/models.py:23` | AS-IS |
| EnergyValidationStatus | `analysis/energy_validation/models.py:31` | AS-IS |
| EnergyValidationItem | `analysis/energy_validation/models.py:38` | AS-IS |
| EnergyValidationConfig | `analysis/energy_validation/models.py:82` | AS-IS |
| EnergyValidationSummary | `analysis/energy_validation/models.py:52` | AS-IS |
| EnergyValidationView | `analysis/energy_validation/models.py:102` | AS-IS |
| _threshold_check | `analysis/energy_validation/builder.py:371` | AS-IS |

### §12.13.6 Domain Validation

| Komponent | Ścieżka | Status |
|-----------|---------|--------|
| ValidationIssue (frozen) | `domain/validation.py:8` | AS-IS |
| ValidationReport (frozen) | `domain/validation.py:16` | AS-IS |
| ValidationFailed exception | `application/network_wizard/errors.py:18` | AS-IS |

---

## §12.14 Definition of Done — Rozdział 12

- [ ] Wszystkie 6 warstw walidacji opisane z pełnymi kontraktami AS-IS.
- [ ] Kompletna tabela kodów: E001–E008, W001–W008, I001–I005 (W1); 13 reguł (W2); K1–K8 (W3); 16 kodów (W4); E-SC/W-SC/B-SC (W5); 5 sprawdzeń (W6).
- [ ] Severity mapping: BLOCKER/ERROR → blokada solvera, WARNING/IMPORTANT → ostrzeżenie, INFO → informacja.
- [ ] Determinizm: każda warstwa gwarantuje identyczne wyniki dla identycznego wejścia.
- [ ] API: 5 endpointów AS-IS, 3 TO-BE (wyraźnie oznaczone).
- [ ] Inwarianty INV-VAL-01..12, zakazy Z-VAL-01..05.
- [ ] Mapowanie na kod: 30+ komponentów z pełnymi ścieżkami.
- [ ] Parytet benchmark / benchmark osiągnięty.
- [ ] Decyzje #94–#101 zapisane w AUDIT_SPEC_VS_CODE.md.

