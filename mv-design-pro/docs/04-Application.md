# Application Layer — Orkiestracja i Workflow

## 1. Lokalizacja

```
backend/src/application/
â”śâ”€â”€ network_wizard/
â”‚   â”śâ”€â”€ service.py              # NetworkWizardService
â”‚   â”śâ”€â”€ dtos.py                 # DTO (payloads, inputs)
â”‚   â”śâ”€â”€ errors.py               # NotFound, Conflict, ValidationFailed
â”‚   â”śâ”€â”€ importers/              # JSON/CSV importers
â”‚   â””â”€â”€ exporters/              # JSON exporter
â”‚
â”śâ”€â”€ analysis_run/
â”‚   â””â”€â”€ service.py              # AnalysisRunService
â”‚
â””â”€â”€ sld/
    â”śâ”€â”€ layout.py               # Auto-layout SLD
    â””â”€â”€ overlay.py              # Budowanie nakĹ‚adek wynikĂłw
```

## 2. Zasady Warstwy Application

### 2.1 OdpowiedzialnoĹ›ć

- **Orkiestracja** - koordynacja operacji między warstwami
- **Workflow** - sekwencje operacji biznesowych
- **CRUD** - tworzenie, odczyt, aktualizacja, usuwanie encji
- **Import/Export** - wymiana danych z zewnętrznymi systemami
- **Walidacja biznesowa** - sprawdzenie kompletnoĹ›ci danych

### 2.2 Zakazy

- **Brak obliczeĹ„ fizycznych** - delegowane do solverĂłw
- **Brak bezpoĹ›redniego SQL** - przez UnitOfWork/Repositories
- **Brak logiki HTTP** - to naleĹĽy do API layer

## 3. NetworkWizardService

### 3.1 Rola

`NetworkWizardService` to gĹ‚Ăłwny serwis orkiestracyjny dla zarządzania siecią elektroenergetyczną.

### 3.2 Operacje CRUD

#### Projekty
```python
create_project(name, description) -> Project
get_project(project_id) -> Project
list_projects() -> list[Project]
update_project(project_id, patch) -> Project
delete_project(project_id) -> None
```

#### WęzĹ‚y
```python
add_node(project_id, payload) -> dict
update_node(project_id, node_id, patch) -> dict
remove_node(project_id, node_id) -> None
```

#### GaĹ‚ęzie
```python
add_branch(project_id, payload) -> dict
update_branch(project_id, branch_id, patch) -> dict
remove_branch(project_id, branch_id) -> None
```

#### Sources (ĹąrĂłdĹ‚a)
```python
add_source(project_id, payload) -> dict
update_source(project_id, source_id, patch) -> dict
remove_source(project_id, source_id) -> None
get_sources(project_id) -> list[SourcePayload]
set_sources(project_id, sources) -> None
```

#### Loads (ObciąĹĽenia)
```python
add_load(project_id, payload) -> dict
update_load(project_id, load_id, patch) -> dict
remove_load(project_id, load_id) -> None
list_loads(project_id) -> list[LoadPayload]
```

#### Cases (Scenariusze)
```python
create_operating_case(project_id, name, payload) -> OperatingCase
update_operating_case(project_id, case_id, patch) -> OperatingCase
list_operating_cases(project_id) -> list[OperatingCase]
clone_operating_case(project_id, case_id, new_name) -> OperatingCase
create_study_case(project_id, name, payload) -> StudyCase
list_study_cases(project_id) -> list[StudyCase]
```

#### Konfiguracja (Application-Layer Settings)
```python
set_connection_node(project_id, node_id) -> None
get_connection_node(project_id) -> UUID | None
set_grounding(project_id, payload) -> None
get_grounding(project_id) -> GroundingPayload
set_limits(project_id, payload) -> None
get_limits(project_id) -> LimitsPayload
```

> **WAĹ»NE (benchmark Alignment):** `set_connection_node()` i `get_connection_node()` obsĹ‚ugują **hint uĹĽytkownika**
> przechowywany w ustawieniach aplikacji/projektu. BoundaryNode – węzeĹ‚ przyĹ‚ączenia **NIE**
> jest przechowywany w NetworkModel/NetworkGraph. Faktyczna identyfikacja BoundaryNode – punktu wspĂłlnego
> przyĹ‚ączenia jest wykonywana przez BoundaryIdentifier w warstwie analysis, ktĂłra moĹĽe uĹĽyć
> tego hintu jako wejĹ›cia.
> Zobacz SYSTEM_SPEC.md Â§ 18.3.4.

### 3.3 Walidacja

```python
validate_network(project_id, case_id=None) -> ValidationReport
```

Sprawdza:
- Istnienie węzĹ‚Ăłw i gaĹ‚ęzi
- PoprawnoĹ›ć BoundaryNode hint (czy wskazany węzeĹ‚ istnieje w projekcie)
- KompletnoĹ›ć sources
- KompletnoĹ›ć loads
- PoprawnoĹ›ć parametrĂłw gaĹ‚ęzi
- Istnienie węzĹ‚a SLACK

### 3.4 Budowanie Modelu

```python
build_network_graph(project_id, case_id=None) -> NetworkGraph
build_power_flow_input(project_id, case_id, options) -> PowerFlowInput
build_short_circuit_input(project_id, case_id, fault_spec, options) -> ShortCircuitInput
```

Metody te:
1. Walidują sieć
2. Pobierają dane z persystencji
3. Tworzą obiekty core (NetworkGraph)
4. Stosują specyfikacje nakĹ‚adek (stany Ĺ‚ączeniowe, limity)

### 3.5 Import/Export

#### Export
```python
export_network(project_id) -> dict  # JSON payload
```

#### Import
```python
import_network(project_id, payload, mode="merge") -> ImportReport
import_nodes_branches_from_csv(project_id, nodes_csv, branches_csv, mode) -> ImportReport
```

**Tryby importu:**
- `merge` - Ĺ‚ączy z istniejącymi danymi
- `replace` - zastępuje wszystkie dane

### 3.6 SLD

```python
create_sld(project_id, name, mode="auto") -> UUID
auto_layout_sld(project_id, diagram_id) -> dict
bind_sld(project_id, diagram_id) -> dict
export_sld(project_id, diagram_id) -> dict
import_sld(project_id, payload) -> UUID
```

## 4. AnalysisRunService

### 4.1 Rola

Orkiestracja tworzenia i wykonywania analiz (Power Flow, Short Circuit).

### 4.2 Tworzenie RunĂłw

```python
create_power_flow_run(project_id, operating_case_id, options) -> AnalysisRun
create_short_circuit_run(project_id, operating_case_id, fault_spec, options) -> AnalysisRun
```

**Determinizm:** JeĹ›li run z tym samym `input_hash` juĹĽ istnieje, zwracany jest istniejący.

### 4.3 Wykonywanie

```python
execute_run(run_id) -> AnalysisRun
```

Logika:
1. SprawdĹş status (nie wykonuj jeĹ›li juĹĽ RUNNING/FINISHED/FAILED)
2. Zwaliduj dane wejĹ›ciowe
3. Ustaw status RUNNING
4. WywoĹ‚aj odpowiedni solver
5. Zapisz wyniki
6. Ustaw status FINISHED lub FAILED

### 4.4 Odczyt WynikĂłw

```python
get_run(run_id) -> AnalysisRun
list_runs(project_id, filters) -> list[AnalysisRun]
get_results(run_id) -> list[dict]
get_sld_overlay_for_run(project_id, diagram_id, run_id) -> dict
```

## 5. DTO (Data Transfer Objects)

### 5.1 Lokalizacja

`application/network_wizard/dtos.py`

### 5.2 Kluczowe DTO

```python
@dataclass
class BusPayload:
    name: str
    bus_type: str  # alias of node_type (legacy)
    base_kv: float
    attrs: dict = field(default_factory=dict)
    id: UUID | None = None

@dataclass
class BranchPayload:
    name: str
    branch_type: str
    from_node_id: UUID
    to_node_id: UUID
    in_service: bool = True
    params: dict = field(default_factory=dict)
    id: UUID | None = None

@dataclass
class SourcePayload:
    node_id: UUID
    source_type: str
    name: str = ""
    payload: dict = field(default_factory=dict)
    in_service: bool = True
    id: UUID | None = None

@dataclass
class LoadPayload:
    node_id: UUID
    name: str = ""
    payload: dict = field(default_factory=dict)
    in_service: bool = True
    id: UUID | None = None

@dataclass
class ShortCircuitInput:
    graph: NetworkGraph
    base_mva: float
    connection_node_id: str  # Application-layer hint, NOT from NetworkGraph
    sources: list[dict]
    loads: list[dict]
    grounding: dict
    limits: dict
    fault_spec: dict
    options: dict
```

> **Uwaga:** `connection_node_id` w ShortCircuitInput to parametr warstwy application
> (hint uĹĽytkownika z ustawieĹ„ projektu), a nie pole z NetworkGraph.
> NetworkGraph NIE zawiera BoundaryNode – punktu wspĂłlnego przyĹ‚ączenia (zobacz SYSTEM_SPEC.md Â§ 18.3.4).

> **Terminology:** Bus to kanoniczny termin benchmark. `NodePayload` pozostaje
> kompatybilnym aliasem wewnętrznym, a API akceptuje zarĂłwno `bus_type`, jak i `node_type`.
> Pola `node_id` / `from_node_id` / `to_node_id` pozostają bez zmian dla kompatybilnoĹ›ci.

## 6. BĹ‚ędy

### 6.1 Lokalizacja

`application/network_wizard/errors.py`

### 6.2 Typy BĹ‚ędĂłw

```python
class NotFound(Exception):
    """ZasĂłb nie znaleziony"""
    pass

class Conflict(Exception):
    """Konflikt operacji (np. usuwanie węzĹ‚a z gaĹ‚ęziami)"""
    pass

class ValidationFailed(Exception):
    """Walidacja nie powiodĹ‚a się"""
    def __init__(self, report: ValidationReport):
        self.report = report
```

## 7. Workflow - PrzykĹ‚ady

### 7.1 Tworzenie Sieci

```python
# 1. UtwĂłrz projekt
project = service.create_project("Sieć SN Centrum")

# 2. Dodaj busy (legacy: nodes)
slack = service.add_node(project.id, BusPayload(
    name="GPZ",
    bus_type="SLACK",
    base_kv=110.0,
    attrs={"voltage_magnitude_pu": 1.0, "voltage_angle_rad": 0.0}
))

# 3. Dodaj gaĹ‚ęzie
line = service.add_branch(project.id, BranchPayload(
    name="Linia 110kV",
    branch_type="LINE",
    from_node_id=slack["id"],
    to_node_id=pq["id"],
    params={"r_ohm_per_km": 0.05, "x_ohm_per_km": 0.4, "length_km": 50}
))

# 4. Ustaw hint BoundaryNode – punktu wspĂłlnego przyĹ‚ączenia (warstwa application, NIE w NetworkModel)
service.set_connection_node(project.id, slack["id"])  # Stores hint in project settings

# 5. Dodaj source
service.add_source(project.id, SourcePayload(
    node_id=slack["id"],
    source_type="GRID",
    payload={"skss_mva": 5000}
))

# 6. Waliduj
report = service.validate_network(project.id)
```

### 7.2 Wykonanie Analizy

```python
# 1. UtwĂłrz operating case
case = service.create_operating_case(project.id, "Przypadek bazowy", {
    "base_mva": 100.0
})

# 2. UtwĂłrz run
run = analysis_service.create_power_flow_run(
    project.id,
    case.id,
    options={"tolerance": 1e-8}
)

# 3. Wykonaj
run = analysis_service.execute_run(run.id)

# 4. Pobierz wyniki
results = analysis_service.get_results(run.id)
```

## 8. Granice OdpowiedzialnoĹ›ci

| FunkcjonalnoĹ›ć           | Application (TAK)    | Application (NIE)       |
|--------------------------|----------------------|------------------------|
| CRUD encji               | âś“                    |                        |
| Walidacja biznesowa      | âś“                    |                        |
| Orkiestracja workflow    | âś“                    |                        |
| Import/Export            | âś“                    |                        |
| Budowanie NetworkGraph   | âś“                    |                        |
| Obliczenia fizyczne      |                      | âś— (Solvers)            |
| SQL/ORM                  |                      | âś— (Infrastructure)     |
| HTTP/REST                |                      | âś— (API)                |
| Logika OSD               |                      | âś— (nie zaimplementowane)|

## 9. Powiązane Dokumenty

- [01-Core.md](./01-Core.md) - model budowany przez application
- [02-Solvers.md](./02-Solvers.md) - solvery wywoĹ‚ywane przez application
- [03-Analyses.md](./03-Analyses.md) - logika analityczna
- [ADR-002](./adr/ADR-002-network-wizard-service.md) - uzasadnienie architektury

