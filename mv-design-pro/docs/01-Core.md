# Core Layer — Model Sieci Elektroenergetycznej

## 1. Lokalizacja

```
backend/src/network_model/core/
├── __init__.py
├── bus.py           # Bus (alias dla Node)
├── node.py          # Node, NodeType (legacy implementation)
├── branch.py        # Branch, LineBranch, TransformerBranch, BranchType
├── graph.py         # NetworkGraph
├── inverter.py      # InverterSource
├── snapshot.py      # NetworkSnapshot, SnapshotMeta
├── action_envelope.py # ActionEnvelope, ActionResult
├── action_apply.py  # apply_action_to_snapshot
└── ybus.py          # AdmittanceMatrixBuilder
```

## 2. Zasady Warstwy Core

### 2.1 Odpowiedzialność

- **Modelowanie topologii** sieci elektroenergetycznej
- **Przechowywanie parametrów fizycznych** (impedancje, napięcia, moce)
- **Analiza spójności** grafu (wyspy, komponenty)
- **Budowa macierzy admitancji** (Y-bus) dla solverów

### 2.2 Zakazy (Prohibitions)

- **Brak interpretacji** - Bus (Node) nie wie czy napięcie jest "za wysokie"
- **Brak regulacji** - NetworkGraph nie wie o OSD ani kodeksach
- **Brak analiz** - Core nie wykonuje obliczeń rozpływu ani zwarć
- **Brak persystencji** - Core nie zna bazy danych
- **Brak BoundaryNode w modelu** - BoundaryNode – węzeł przyłączenia NIE występuje w NetworkGraph; jest identyfikowany w warstwie analysis przez BoundaryIdentifier

### 2.3 Snapshot Store (Persistence)

- **Co zapisujemy:** pełny `NetworkSnapshot` (meta + graph) w formie deterministycznego JSON, wraz z `snapshot_id`, `parent_snapshot_id`, `created_at`, `schema_version`.
- **Jak odczytujemy:** snapshot jest odtwarzany tylko do odczytu z `snapshot_json` i metadanych w bazie; brak mutacji in-place.
- **Lineage i audyt:** `parent_snapshot_id` buduje łańcuch pochodzenia snapshotów, który można listować dla potrzeb audytu i historii zmian.

### 2.4 Read-Only Snapshot API + Submit Actions

Minimalne API backendu wspiera pełny przepływ:
**snapshot → action → validate → apply → new snapshot → persist → fetch**.

**GET /snapshots/{snapshot_id}** zwraca pełny `NetworkSnapshot` z metadanymi:

```json
{
  "meta": {
    "snapshot_id": "snap-1",
    "parent_snapshot_id": null,
    "created_at": "2024-01-01T00:00:00+00:00",
    "schema_version": "v1"
  },
  "graph": {
    "nodes": [],
    "branches": [],
    "inverter_sources": []
  }
}
```

> **Uwaga:** BoundaryNode – węzeł przyłączenia nie jest przechowywany w NetworkGraph.
> BoundaryNode – węzeł przyłączenia jest identyfikowany w warstwie interpretacji/analysis przez BoundaryIdentifier.
> Zobacz SYSTEM_SPEC.md § 18.3.4.

**POST /snapshots/{snapshot_id}/actions** przyjmuje `ActionEnvelope`, waliduje go i zwraca
`ActionResult` wraz z `new_snapshot_id` tylko dla akcji zaakceptowanych:

```json
{
  "result": {
    "status": "accepted",
    "action_id": "action-1",
    "parent_snapshot_id": "snap-1",
    "errors": [],
    "warnings": []
  },
  "new_snapshot_id": "action-1"
}
```

### 2.5 Batch Actions (Transaction)

Batch actions pozwalają na transakcyjne zastosowanie listy akcji do jednego snapshotu.
Backend waliduje listę w podanej kolejności na „working snapshot” i tworzy dokładnie
jeden nowy snapshot dopiero po pełnym sukcesie wszystkich akcji. Jeśli dowolna akcja
jest niepoprawna, cały batch jest odrzucony (atomiczność) i nie powstaje żaden nowy snapshot.

**POST /snapshots/{snapshot_id}/actions:batch** przyjmuje listę `ActionEnvelope`:

```json
{
  "actions": [
    {
      "action_id": "batch-action-1",
      "parent_snapshot_id": "snap-1",
      "action_type": "create_node",
      "payload": {
        "id": "node-3",
        "name": "Node 3",
        "node_type": "PQ",
        "voltage_level": 15.0,
        "active_power": 2.0,
        "reactive_power": 1.0
      },
      "created_at": "2024-01-02T00:00:00+00:00"
    }
  ]
}
```

## SLD (PR-08) — Deterministic Projection

SLD jest deterministyczną projekcją snapshotu sieci (NetworkSnapshot). Nie jest solverem, nie wykonuje obliczeń elektrycznych i nie stosuje heurystyk layoutu w PR-08.

Zasada dostępu CASE-aware:

**Case → active_snapshot_id → SLD**

SLD jest tylko do odczytu, w pełni odtwarzalny dla identycznych wejść, a elementy `in_service=false` są wykluczane z projekcji (bez placeholderów).

Odpowiedź zawiera wynik batcha i listę wyników dla każdej akcji:

```json
{
  "status": "accepted",
  "parent_snapshot_id": "snap-1",
  "new_snapshot_id": "snap-2",
  "action_results": [
    {
      "status": "accepted",
      "action_id": "batch-action-1",
      "parent_snapshot_id": "snap-1",
      "errors": [],
      "warnings": []
    }
  ],
  "errors": []
}
```

W przypadku błędu cały batch jest odrzucony, a akcje oznaczane są jako `rejected`
z kodem `batch_aborted`, natomiast akcja błędna zawiera własne kody i ścieżki błędów.

### 2.6 DesignSynth (Projektant) — artefakty poziomu przypadku

DesignSynth przechowuje artefakty poziomu przypadku (bez mutacji domeny Core): **DesignSpec**, **DesignProposal** oraz **DesignEvidence**. Są one zapisywane w tabelach `design_specs`, `design_proposals`, `design_evidence` i służą jako audytowalne, deterministycznie serializowane (JSON-safe) wejścia/wyjścia dla procesu projektowania na poziomie OperatingCase (case_id + snapshot_id). W Core nie ma logiki solverów ani fizyki powiązanej z tymi artefaktami.

DesignSynth M2 rozszerza to o deterministyczny pipeline „connection study” (spec → proposal → evidence → report). Pipeline działa w warstwie application jako orkiestracja (bez solverów), zapisuje artefakty poziomu przypadku oraz generuje raport JSON z sekcją **„BoundaryNode – węzeł przyłączenia”**, założeniami i ograniczeniami. Raport zawiera fingerprint wyliczony z kanonicznego JSON, co zapewnia powtarzalność i audytowalność.

## 3. Komponenty

### 3.1 Bus (`bus.py`, alias dla Node)

Reprezentacja węzła sieci elektroenergetycznej (benchmark: Bus).
`Node` pozostaje implementacją legacy, a `Bus` jest aliasem zgodnym z PF.

```python
class NodeType(Enum):
    SLACK = "SLACK"   # Węzeł bilansujący (referencyjny)
    PQ = "PQ"         # Węzeł obciążeniowy (moc P i Q zadane)
    PV = "PV"         # Węzeł generatorowy (P i |U| zadane)

@dataclass
class Node:
    id: str
    name: str
    node_type: NodeType
    voltage_level: float           # [kV] - napięcie znamionowe
    voltage_magnitude: float | None # [pu] - amplituda napięcia
    voltage_angle: float | None    # [rad] - kąt fazowy
    active_power: float | None     # [MW] - moc czynna
    reactive_power: float | None   # [MVAr] - moc bierna
```

**Walidacja wewnętrzna:**
- SLACK wymaga `voltage_magnitude` i `voltage_angle`
- PQ wymaga `active_power` i `reactive_power`
- PV wymaga `active_power` i `voltage_magnitude`

**Serializacja:**
- `to_dict()` / `from_dict()` - JSON-ready (Node/Bus kompatybilne)

### 3.2 Branch (`branch.py`)

Gałąź sieci - linia, kabel lub transformator.

```python
class BranchType(Enum):
    LINE = "LINE"
    CABLE = "CABLE"
    TRANSFORMER = "TRANSFORMER"

@dataclass
class Branch:
    id: str
    name: str
    branch_type: BranchType
    from_node_id: str
    to_node_id: str
    in_service: bool = True
```

#### LineBranch

Linia napowietrzna lub kabel z modelem PI.

```python
@dataclass
class LineBranch(Branch):
    r_ohm_per_km: float    # Rezystancja [Ω/km]
    x_ohm_per_km: float    # Reaktancja [Ω/km]
    b_us_per_km: float     # Susceptancja [μS/km]
    length_km: float       # Długość [km]
    rated_current_a: float # Prąd znamionowy [A]
```

**Metody obliczeniowe:**
- `get_total_impedance()` → `complex` [Ω]
- `get_series_admittance()` → `complex` [S]
- `get_shunt_admittance()` → `complex` [S]

#### TransformerBranch

Transformator dwuuzwojeniowy.

```python
@dataclass
class TransformerBranch(Branch):
    rated_power_mva: float   # Moc znamionowa [MVA]
    voltage_hv_kv: float     # Napięcie strony WN [kV]
    voltage_lv_kv: float     # Napięcie strony DN [kV]
    uk_percent: float        # Napięcie zwarciowe [%]
    pk_kw: float             # Straty zwarciowe [kW]
    i0_percent: float        # Prąd jałowy [%]
    p0_kw: float             # Straty jałowe [kW]
    vector_group: str        # Grupa połączeń (np. "Dyn11")
    tap_position: int        # Pozycja zaczepów
    tap_step_percent: float  # Krok zaczepów [%]
```

**Metody obliczeniowe (IEC 60909):**
- `get_short_circuit_impedance_pu()` → `complex`
- `get_short_circuit_impedance_ohm_lv()` → `complex`
- `get_ikss_lv_ka(c_factor)` → `float` [kA]
- `get_impedance_pu(base_mva)` → `complex`
- `get_turns_ratio()` → `float`
- `get_tap_ratio()` → `float`

### 3.3 NetworkGraph (`graph.py`)

Graf sieci elektroenergetycznej oparty na NetworkX.

```python
class NetworkGraph:
    nodes: Dict[str, Node]
    branches: Dict[str, Branch]
    inverter_sources: Dict[str, InverterSource]
    _graph: nx.MultiGraph  # Wewnętrzny graf NetworkX
```

**Operacje CRUD:**
- `add_node(node)`, `remove_node(node_id)`, `get_node(node_id)`
- `add_branch(branch)`, `remove_branch(branch_id)`, `get_branch(branch_id)`
- `add_inverter_source(source)`, `remove_inverter_source(source_id)`

**Analiza topologii:**
- `is_connected()` → `bool` - czy graf jest spójny
- `find_islands()` → `List[List[str]]` - komponenty spójności
- `get_connected_nodes(node_id)` → `List[Node]` - sąsiedzi węzła
- `get_slack_node()` → `Node` - jedyny węzeł SLACK

**Constrainty:**
- Maksymalnie 1 węzeł SLACK w sieci
- Gałąź nie może łączyć węzła samego ze sobą
- `from_node_id` i `to_node_id` muszą istnieć w `nodes`

### 3.4 InverterSource (`inverter.py`)

Źródło falownikowe OZE dla obliczeń IEC 60909.

```python
@dataclass
class InverterSource:
    id: str
    name: str
    node_id: str
    in_rated_a: float      # Prąd znamionowy [A]
    k_sc: float = 1.1      # Współczynnik zwarciowy
    contributes_negative_sequence: bool = False
    contributes_zero_sequence: bool = False
    in_service: bool = True

    @property
    def ik_sc_a(self) -> float:
        """Wkład prądowy do zwarcia: Ik = k_sc * In"""
        return self.k_sc * self.in_rated_a
```

### 3.5 AdmittanceMatrixBuilder (`ybus.py`)

Budowa macierzy admitancji nodowej (Y-bus).

```python
class AdmittanceMatrixBuilder:
    def __init__(self, graph: NetworkGraph): ...
    def build(self) -> np.ndarray: ...

    # Mapowania indeksów
    node_id_to_index: Dict[str, int]
```

## 4. Niemutowalność

### 4.1 Dataclasses

Większość klas core używa `@dataclass` z domyślną mutowalnością dla wygody operacji CRUD. Jednak:

- **Wyniki obliczeń** używają `@dataclass(frozen=True)` (np. ShortCircuitResult)
- **Encje domenowe** używają `frozen=True` (np. Project, AnalysisRun)

## 5. Action Envelope (Edycje domeny)

Core udostępnia kanoniczny **Action Envelope** jako append-only opis intencjonalnych zmian w domenie.
Akcje są wiązane z `parent_snapshot_id` i podlegają **deterministycznej walidacji strukturalnej**.
Brak tu fizyki i norm — tylko struktura oraz referencje do encji snapshotu.

### 5.1 Pola Action Envelope

- `action_id` (UUID string)
- `parent_snapshot_id` (string)
- `action_type` (enumerated string)
- `payload` (dict)
- `created_at` (ISO 8601)
- `actor` (optional string)
- `schema_version` (optional string/int)

### 5.2 MVP Action Types

- `create_node` — minimalny payload: `node_type` + wymagane pola zależne od typu
- `create_branch` — `from_node_id`, `to_node_id`, `branch_kind`
- `set_in_service` — `entity_id`, `in_service` (bool)

> **Uwaga:** Akcja `set_connection_node` została usunięta z warstwy Core w ramach Phase 2 Task 2.1.
> Hint BoundaryNode – punktu wspólnego przyłączenia jest zarządzany w warstwie ustawień application/wizard, a nie w NetworkGraph.

### 5.3 ActionResult (zaakceptuj/odrzuć)

Walidator zwraca `ActionResult`:
- `status`: `"accepted"` lub `"rejected"`
- `action_id`, `parent_snapshot_id`
- `errors`: lista `{code, message, path}` (pusta dla accepted)
- `warnings`: opcjonalna lista (domyślnie pusta)

Przykładowe kody błędów: `missing_field`, `invalid_type`, `unknown_action_type`,
`missing_payload_key`, `unknown_node`, `unknown_entity`.

### 5.4 Przepływ Action → Snapshot

Przepływ aplikacji akcji do nowego snapshotu:

1. **Wizard** generuje `ActionEnvelope` (intencja zmiany).
2. **Walidacja** wykonuje deterministyczną walidację strukturalną i zwraca `ActionResult`.
3. Dla `ActionResult.status == "accepted"` następuje **zastosowanie akcji** w backend core.
4. **Zastosowanie akcji** tworzy **NOWY** `NetworkSnapshot` z:
   - nowym `snapshot_id` (deterministycznym, powiązanym z akcją),
   - `parent_snapshot_id` wskazującym snapshot wejściowy,
   - stabilną, deterministyczną serializacją (sortowanie encji po `id`).

Podsumowanie przepływu: **Wizard → ActionEnvelope → Walidacja → Zastosowanie akcji → Nowy Snapshot**.

### 4.2 Snapshot Pattern

Dla obliczeń stosujemy wzorzec snapshot:
1. `NetworkWizardService` buduje `NetworkGraph` z persystencji
2. `NetworkGraph` jest przekazywany do solvera jako snapshot tylko do odczytu
3. Solver nie modyfikuje grafu, tylko go czyta
4. Snapshot ma backendowe metadane (`snapshot_id`, opcjonalny `parent_snapshot_id`,
   `created_at`, opcjonalny `schema_version`) dla jednoznacznej identyfikacji i linii czasu

## 5. Granice Odpowiedzialności

| Funkcjonalność           | Core (TAK)      | Core (NIE)          |
|--------------------------|-----------------|---------------------|
| Przechowywanie węzłów    | ✓               |                     |
| Przechowywanie gałęzi    | ✓               |                     |
| Analiza spójności        | ✓               |                     |
| Budowa Y-bus             | ✓               |                     |
| Serializacja JSON        | ✓               |                     |
| Walidacja parametrów     | ✓ (fizyczna)    | ✗ (biznesowa)       |
| Obliczenia rozpływu      |                 | ✗                   |
| Obliczenia zwarciowe     |                 | ✗                   |
| Sprawdzanie limitów      |                 | ✗                   |
| Logika OSD               |                 | ✗                   |

## 6. Przykłady Użycia

### 6.1 Tworzenie sieci

```python
from network_model.core import Node, NodeType, NetworkGraph
from network_model.core.branch import LineBranch, BranchType

# Tworzenie grafu
graph = NetworkGraph()

# Dodawanie węzłów
slack = Node(
    id="slack-1",
    name="GPZ Centrum",
    node_type=NodeType.SLACK,
    voltage_level=110.0,
    voltage_magnitude=1.0,
    voltage_angle=0.0
)
graph.add_node(slack)

pq = Node(
    id="pq-1",
    name="Odbiorca A",
    node_type=NodeType.PQ,
    voltage_level=110.0,
    active_power=-10.0,
    reactive_power=-5.0
)
graph.add_node(pq)

# Dodawanie gałęzi
line = LineBranch(
    id="line-1",
    name="Linia 110kV",
    branch_type=BranchType.LINE,
    from_node_id="slack-1",
    to_node_id="pq-1",
    r_ohm_per_km=0.05,
    x_ohm_per_km=0.4,
    b_us_per_km=2.7,
    length_km=50.0,
    rated_current_a=600.0
)
graph.add_branch(line)
```

### 6.2 Analiza topologii

```python
# Sprawdzenie spójności
if graph.is_connected():
    print("Sieć jest spójna")

# Znajdowanie wysp
islands = graph.find_islands()
for i, island in enumerate(islands):
    print(f"Wyspa {i}: {island}")

# Pobieranie węzła SLACK
slack = graph.get_slack_node()
```

## 7. Powiązane Dokumenty

- [00-System-Overview.md](./00-System-Overview.md) - architektura systemu
- [02-Solvers.md](./02-Solvers.md) - solvery korzystające z Core
- [ADR-001](./adr/ADR-001-power-flow-v2-overlay-vs-core.md) - overlay vs core

