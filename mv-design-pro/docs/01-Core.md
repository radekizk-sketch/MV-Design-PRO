# Core Layer — Model Sieci Elektroenergetycznej

## 1. Lokalizacja

```
backend/src/network_model/core/
â”śâ”€â”€ __init__.py
â”śâ”€â”€ bus.py           # Bus (alias dla Node)
â”śâ”€â”€ node.py          # Node, NodeType (legacy implementation)
â”śâ”€â”€ branch.py        # Branch, LineBranch, TransformerBranch, BranchType
â”śâ”€â”€ graph.py         # NetworkGraph
â”śâ”€â”€ inverter.py      # InverterSource
â”śâ”€â”€ snapshot.py      # NetworkSnapshot, SnapshotMeta
â”śâ”€â”€ action_envelope.py # ActionEnvelope, ActionResult
â”śâ”€â”€ action_apply.py  # apply_action_to_snapshot
â””â”€â”€ ybus.py          # AdmittanceMatrixBuilder
```

## 2. Zasady Warstwy Core

### 2.1 OdpowiedzialnoĹ›ć

- **Modelowanie topologii** sieci elektroenergetycznej
- **Przechowywanie parametrĂłw fizycznych** (impedancje, napięcia, moce)
- **Analiza spĂłjnoĹ›ci** grafu (wyspy, komponenty)
- **Budowa macierzy admitancji** (Y-bus) dla solverĂłw

### 2.2 Zakazy (Prohibitions)

- **Brak interpretacji** - Bus (Node) nie wie czy napięcie jest "za wysokie"
- **Brak regulacji** - NetworkGraph nie wie o OSD ani kodeksach
- **Brak analiz** - Core nie wykonuje obliczeĹ„ rozpĹ‚ywu ani zwarć
- **Brak persystencji** - Core nie zna bazy danych
- **Brak BoundaryNode w modelu** - BoundaryNode – węzeĹ‚ przyĹ‚ączenia NIE występuje w NetworkGraph; jest identyfikowany w warstwie analysis przez BoundaryIdentifier

### 2.3 Snapshot Store (Persistence)

- **Co zapisujemy:** peĹ‚ny `NetworkSnapshot` (meta + graph) w formie deterministycznego JSON, wraz z `snapshot_id`, `parent_snapshot_id`, `created_at`, `schema_version`.
- **Jak odczytujemy:** snapshot jest odtwarzany tylko do odczytu z `snapshot_json` i metadanych w bazie; brak mutacji in-place.
- **Lineage i audyt:** `parent_snapshot_id` buduje Ĺ‚aĹ„cuch pochodzenia snapshotĂłw, ktĂłry moĹĽna listować dla potrzeb audytu i historii zmian.

### 2.4 Read-Only Snapshot API + Submit Actions

Minimalne API backendu wspiera peĹ‚ny przepĹ‚yw:
**snapshot → action → validate → apply → new snapshot → persist → fetch**.

**GET /snapshots/{snapshot_id}** zwraca peĹ‚ny `NetworkSnapshot` z metadanymi:

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

> **Uwaga:** BoundaryNode – węzeĹ‚ przyĹ‚ączenia nie jest przechowywany w NetworkGraph.
> BoundaryNode – węzeĹ‚ przyĹ‚ączenia jest identyfikowany w warstwie interpretacji/analysis przez BoundaryIdentifier.
> Zobacz SYSTEM_SPEC.md Â§ 18.3.4.

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
Backend waliduje listę w podanej kolejnoĹ›ci na â€žworking snapshotâ€ť i tworzy dokĹ‚adnie
jeden nowy snapshot dopiero po peĹ‚nym sukcesie wszystkich akcji. JeĹ›li dowolna akcja
jest niepoprawna, caĹ‚y batch jest odrzucony (atomicznoĹ›ć) i nie powstaje ĹĽaden nowy snapshot.

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

SLD jest deterministyczną projekcją snapshotu sieci (NetworkSnapshot). Nie jest solverem, nie wykonuje obliczeĹ„ elektrycznych i nie stosuje heurystyk layoutu w PR-08.

Zasada dostępu CASE-aware:

**Case → active_snapshot_id → SLD**

SLD jest tylko do odczytu, w peĹ‚ni odtwarzalny dla identycznych wejĹ›ć, a elementy `in_service=false` są wykluczane z projekcji (bez placeholderĂłw).

OdpowiedĹş zawiera wynik batcha i listę wynikĂłw dla kaĹĽdej akcji:

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

W przypadku bĹ‚ędu caĹ‚y batch jest odrzucony, a akcje oznaczane są jako `rejected`
z kodem `batch_aborted`, natomiast akcja bĹ‚ędna zawiera wĹ‚asne kody i Ĺ›cieĹĽki bĹ‚ędĂłw.

### 2.6 DesignSynth (Projektant) — artefakty poziomu przypadku

DesignSynth przechowuje artefakty poziomu przypadku (bez mutacji domeny Core): **DesignSpec**, **DesignProposal** oraz **DesignEvidence**. Są one zapisywane w tabelach `design_specs`, `design_proposals`, `design_evidence` i sĹ‚uĹĽą jako audytowalne, deterministycznie serializowane (JSON-safe) wejĹ›cia/wyjĹ›cia dla procesu projektowania na poziomie OperatingCase (case_id + snapshot_id). W Core nie ma logiki solverĂłw ani fizyki powiązanej z tymi artefaktami.

DesignSynth M2 rozszerza to o deterministyczny pipeline â€žconnection studyâ€ť (spec → proposal → evidence → report). Pipeline dziaĹ‚a w warstwie application jako orkiestracja (bez solverĂłw), zapisuje artefakty poziomu przypadku oraz generuje raport JSON z sekcją **â€žBoundaryNode – węzeĹ‚ przyĹ‚ączeniaâ€ť**, zaĹ‚oĹĽeniami i ograniczeniami. Raport zawiera fingerprint wyliczony z kanonicznego JSON, co zapewnia powtarzalnoĹ›ć i audytowalnoĹ›ć.

## 3. Komponenty

### 3.1 Bus (`bus.py`, alias dla Node)

Reprezentacja węzĹ‚a sieci elektroenergetycznej (benchmark: Bus).
`Node` pozostaje implementacją legacy, a `Bus` jest aliasem zgodnym z PF.

```python
class NodeType(Enum):
    SLACK = "SLACK"   # WęzeĹ‚ bilansujący (referencyjny)
    PQ = "PQ"         # WęzeĹ‚ obciąĹĽeniowy (moc P i Q zadane)
    PV = "PV"         # WęzeĹ‚ generatorowy (P i |U| zadane)

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

GaĹ‚ąĹş sieci - linia, kabel lub transformator.

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
    r_ohm_per_km: float    # Rezystancja [Î©/km]
    x_ohm_per_km: float    # Reaktancja [Î©/km]
    b_us_per_km: float     # Susceptancja [ÎĽS/km]
    length_km: float       # DĹ‚ugoĹ›ć [km]
    rated_current_a: float # Prąd znamionowy [A]
```

**Metody obliczeniowe:**
- `get_total_impedance()` → `complex` [Î©]
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
    i0_percent: float        # Prąd jaĹ‚owy [%]
    p0_kw: float             # Straty jaĹ‚owe [kW]
    vector_group: str        # Grupa poĹ‚ączeĹ„ (np. "Dyn11")
    tap_position: int        # Pozycja zaczepĂłw
    tap_step_percent: float  # Krok zaczepĂłw [%]
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
- `is_connected()` → `bool` - czy graf jest spĂłjny
- `find_islands()` → `List[List[str]]` - komponenty spĂłjnoĹ›ci
- `get_connected_nodes(node_id)` → `List[Node]` - sąsiedzi węzĹ‚a
- `get_slack_node()` → `Node` - jedyny węzeĹ‚ SLACK

**Constrainty:**
- Maksymalnie 1 węzeĹ‚ SLACK w sieci
- GaĹ‚ąĹş nie moĹĽe Ĺ‚ączyć węzĹ‚a samego ze sobą
- `from_node_id` i `to_node_id` muszą istnieć w `nodes`

### 3.4 InverterSource (`inverter.py`)

ĹąrĂłdĹ‚o falownikowe OZE dla obliczeĹ„ IEC 60909.

```python
@dataclass
class InverterSource:
    id: str
    name: str
    node_id: str
    in_rated_a: float      # Prąd znamionowy [A]
    k_sc: float = 1.1      # WspĂłĹ‚czynnik zwarciowy
    contributes_negative_sequence: bool = False
    contributes_zero_sequence: bool = False
    in_service: bool = True

    @property
    def ik_sc_a(self) -> float:
        """WkĹ‚ad prądowy do zwarcia: Ik = k_sc * In"""
        return self.k_sc * self.in_rated_a
```

### 3.5 AdmittanceMatrixBuilder (`ybus.py`)

Budowa macierzy admitancji nodowej (Y-bus).

```python
class AdmittanceMatrixBuilder:
    def __init__(self, graph: NetworkGraph): ...
    def build(self) -> np.ndarray: ...

    # Mapowania indeksĂłw
    node_id_to_index: Dict[str, int]
```

## 4. NiemutowalnoĹ›ć

### 4.1 Dataclasses

WiększoĹ›ć klas core uĹĽywa `@dataclass` z domyĹ›lną mutowalnoĹ›cią dla wygody operacji CRUD. Jednak:

- **Wyniki obliczeĹ„** uĹĽywają `@dataclass(frozen=True)` (np. ShortCircuitResult)
- **Encje domenowe** uĹĽywają `frozen=True` (np. Project, AnalysisRun)

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

- `create_node` — minimalny payload: `node_type` + wymagane pola zaleĹĽne od typu
- `create_branch` — `from_node_id`, `to_node_id`, `branch_kind`
- `set_in_service` — `entity_id`, `in_service` (bool)

> **Uwaga:** Akcja `set_connection_node` zostaĹ‚a usunięta z warstwy Core w ramach Phase 2 Task 2.1.
> Hint BoundaryNode – punktu wspĂłlnego przyĹ‚ączenia jest zarządzany w warstwie ustawieĹ„ application/wizard, a nie w NetworkGraph.

### 5.3 ActionResult (zaakceptuj/odrzuć)

Walidator zwraca `ActionResult`:
- `status`: `"accepted"` lub `"rejected"`
- `action_id`, `parent_snapshot_id`
- `errors`: lista `{code, message, path}` (pusta dla accepted)
- `warnings`: opcjonalna lista (domyĹ›lnie pusta)

PrzykĹ‚adowe kody bĹ‚ędĂłw: `missing_field`, `invalid_type`, `unknown_action_type`,
`missing_payload_key`, `unknown_node`, `unknown_entity`.

### 5.4 PrzepĹ‚yw Action → Snapshot

PrzepĹ‚yw aplikacji akcji do nowego snapshotu:

1. **Wizard** generuje `ActionEnvelope` (intencja zmiany).
2. **Walidacja** wykonuje deterministyczną walidację strukturalną i zwraca `ActionResult`.
3. Dla `ActionResult.status == "accepted"` następuje **zastosowanie akcji** w backend core.
4. **Zastosowanie akcji** tworzy **NOWY** `NetworkSnapshot` z:
   - nowym `snapshot_id` (deterministycznym, powiązanym z akcją),
   - `parent_snapshot_id` wskazującym snapshot wejĹ›ciowy,
   - stabilną, deterministyczną serializacją (sortowanie encji po `id`).

Podsumowanie przepĹ‚ywu: **Wizard → ActionEnvelope → Walidacja → Zastosowanie akcji → Nowy Snapshot**.

### 4.2 Snapshot Pattern

Dla obliczeĹ„ stosujemy wzorzec snapshot:
1. `NetworkWizardService` buduje `NetworkGraph` z persystencji
2. `NetworkGraph` jest przekazywany do solvera jako snapshot tylko do odczytu
3. Solver nie modyfikuje grafu, tylko go czyta
4. Snapshot ma backendowe metadane (`snapshot_id`, opcjonalny `parent_snapshot_id`,
   `created_at`, opcjonalny `schema_version`) dla jednoznacznej identyfikacji i linii czasu

## 5. Granice OdpowiedzialnoĹ›ci

| FunkcjonalnoĹ›ć           | Core (TAK)      | Core (NIE)          |
|--------------------------|-----------------|---------------------|
| Przechowywanie węzĹ‚Ăłw    | âś“               |                     |
| Przechowywanie gaĹ‚ęzi    | âś“               |                     |
| Analiza spĂłjnoĹ›ci        | âś“               |                     |
| Budowa Y-bus             | âś“               |                     |
| Serializacja JSON        | âś“               |                     |
| Walidacja parametrĂłw     | âś“ (fizyczna)    | âś— (biznesowa)       |
| Obliczenia rozpĹ‚ywu      |                 | âś—                   |
| Obliczenia zwarciowe     |                 | âś—                   |
| Sprawdzanie limitĂłw      |                 | âś—                   |
| Logika OSD               |                 | âś—                   |

## 6. PrzykĹ‚ady UĹĽycia

### 6.1 Tworzenie sieci

```python
from network_model.core import Node, NodeType, NetworkGraph
from network_model.core.branch import LineBranch, BranchType

# Tworzenie grafu
graph = NetworkGraph()

# Dodawanie węzĹ‚Ăłw
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

# Dodawanie gaĹ‚ęzi
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
# Sprawdzenie spĂłjnoĹ›ci
if graph.is_connected():
    print("Sieć jest spĂłjna")

# Znajdowanie wysp
islands = graph.find_islands()
for i, island in enumerate(islands):
    print(f"Wyspa {i}: {island}")

# Pobieranie węzĹ‚a SLACK
slack = graph.get_slack_node()
```

## 7. Powiązane Dokumenty

- [00-System-Overview.md](./00-System-Overview.md) - architektura systemu
- [02-Solvers.md](./02-Solvers.md) - solvery korzystające z Core
- [ADR-001](./adr/ADR-001-power-flow-v2-overlay-vs-core.md) - overlay vs core

