# Core Layer â€” Model Sieci Elektroenergetycznej

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

### 2.1 OdpowiedzialnoĹ›Ä‡

- **Modelowanie topologii** sieci elektroenergetycznej
- **Przechowywanie parametrĂłw fizycznych** (impedancje, napiÄ™cia, moce)
- **Analiza spĂłjnoĹ›ci** grafu (wyspy, komponenty)
- **Budowa macierzy admitancji** (Y-bus) dla solverĂłw

### 2.2 Zakazy (Prohibitions)

- **Brak interpretacji** - Bus (Node) nie wie czy napiÄ™cie jest "za wysokie"
- **Brak regulacji** - NetworkGraph nie wie o OSD ani kodeksach
- **Brak analiz** - Core nie wykonuje obliczeĹ„ rozpĹ‚ywu ani zwarÄ‡
- **Brak persystencji** - Core nie zna bazy danych
- **Brak BoundaryNode w modelu** - BoundaryNode â€“ wÄ™zeĹ‚ przyĹ‚Ä…czenia NIE wystÄ™puje w NetworkGraph; jest identyfikowany w warstwie analysis przez BoundaryIdentifier

### 2.3 Snapshot Store (Persistence)

- **Co zapisujemy:** peĹ‚ny `NetworkSnapshot` (meta + graph) w formie deterministycznego JSON, wraz z `snapshot_id`, `parent_snapshot_id`, `created_at`, `schema_version`.
- **Jak odczytujemy:** snapshot jest odtwarzany tylko do odczytu z `snapshot_json` i metadanych w bazie; brak mutacji in-place.
- **Lineage i audyt:** `parent_snapshot_id` buduje Ĺ‚aĹ„cuch pochodzenia snapshotĂłw, ktĂłry moĹĽna listowaÄ‡ dla potrzeb audytu i historii zmian.

### 2.4 Read-Only Snapshot API + Submit Actions

Minimalne API backendu wspiera peĹ‚ny przepĹ‚yw:
**snapshot â†’ action â†’ validate â†’ apply â†’ new snapshot â†’ persist â†’ fetch**.

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

> **Uwaga:** BoundaryNode â€“ wÄ™zeĹ‚ przyĹ‚Ä…czenia nie jest przechowywany w NetworkGraph.
> BoundaryNode â€“ wÄ™zeĹ‚ przyĹ‚Ä…czenia jest identyfikowany w warstwie interpretacji/analysis przez BoundaryIdentifier.
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

Batch actions pozwalajÄ… na transakcyjne zastosowanie listy akcji do jednego snapshotu.
Backend waliduje listÄ™ w podanej kolejnoĹ›ci na â€žworking snapshotâ€ť i tworzy dokĹ‚adnie
jeden nowy snapshot dopiero po peĹ‚nym sukcesie wszystkich akcji. JeĹ›li dowolna akcja
jest niepoprawna, caĹ‚y batch jest odrzucony (atomicznoĹ›Ä‡) i nie powstaje ĹĽaden nowy snapshot.

**POST /snapshots/{snapshot_id}/actions:batch** przyjmuje listÄ™ `ActionEnvelope`:

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

## SLD (PR-08) â€” Deterministic Projection

SLD jest deterministycznÄ… projekcjÄ… snapshotu sieci (NetworkSnapshot). Nie jest solverem, nie wykonuje obliczeĹ„ elektrycznych i nie stosuje heurystyk layoutu w PR-08.

Zasada dostÄ™pu CASE-aware:

**Case â†’ active_snapshot_id â†’ SLD**

SLD jest tylko do odczytu, w peĹ‚ni odtwarzalny dla identycznych wejĹ›Ä‡, a elementy `in_service=false` sÄ… wykluczane z projekcji (bez placeholderĂłw).

OdpowiedĹş zawiera wynik batcha i listÄ™ wynikĂłw dla kaĹĽdej akcji:

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

W przypadku bĹ‚Ä™du caĹ‚y batch jest odrzucony, a akcje oznaczane sÄ… jako `rejected`
z kodem `batch_aborted`, natomiast akcja bĹ‚Ä™dna zawiera wĹ‚asne kody i Ĺ›cieĹĽki bĹ‚Ä™dĂłw.

### 2.6 DesignSynth (Projektant) â€” artefakty poziomu przypadku

DesignSynth przechowuje artefakty poziomu przypadku (bez mutacji domeny Core): **DesignSpec**, **DesignProposal** oraz **DesignEvidence**. SÄ… one zapisywane w tabelach `design_specs`, `design_proposals`, `design_evidence` i sĹ‚uĹĽÄ… jako audytowalne, deterministycznie serializowane (JSON-safe) wejĹ›cia/wyjĹ›cia dla procesu projektowania na poziomie OperatingCase (case_id + snapshot_id). W Core nie ma logiki solverĂłw ani fizyki powiÄ…zanej z tymi artefaktami.

DesignSynth M2 rozszerza to o deterministyczny pipeline â€žconnection studyâ€ť (spec â†’ proposal â†’ evidence â†’ report). Pipeline dziaĹ‚a w warstwie application jako orkiestracja (bez solverĂłw), zapisuje artefakty poziomu przypadku oraz generuje raport JSON z sekcjÄ… **â€žBoundaryNode â€“ wÄ™zeĹ‚ przyĹ‚Ä…czeniaâ€ť**, zaĹ‚oĹĽeniami i ograniczeniami. Raport zawiera fingerprint wyliczony z kanonicznego JSON, co zapewnia powtarzalnoĹ›Ä‡ i audytowalnoĹ›Ä‡.

## 3. Komponenty

### 3.1 Bus (`bus.py`, alias dla Node)

Reprezentacja wÄ™zĹ‚a sieci elektroenergetycznej (benchmark: Bus).
`Node` pozostaje implementacjÄ… legacy, a `Bus` jest aliasem zgodnym z PF.

```python
class NodeType(Enum):
    SLACK = "SLACK"   # WÄ™zeĹ‚ bilansujÄ…cy (referencyjny)
    PQ = "PQ"         # WÄ™zeĹ‚ obciÄ…ĹĽeniowy (moc P i Q zadane)
    PV = "PV"         # WÄ™zeĹ‚ generatorowy (P i |U| zadane)

@dataclass
class Node:
    id: str
    name: str
    node_type: NodeType
    voltage_level: float           # [kV] - napiÄ™cie znamionowe
    voltage_magnitude: float | None # [pu] - amplituda napiÄ™cia
    voltage_angle: float | None    # [rad] - kÄ…t fazowy
    active_power: float | None     # [MW] - moc czynna
    reactive_power: float | None   # [MVAr] - moc bierna
```

**Walidacja wewnÄ™trzna:**
- SLACK wymaga `voltage_magnitude` i `voltage_angle`
- PQ wymaga `active_power` i `reactive_power`
- PV wymaga `active_power` i `voltage_magnitude`

**Serializacja:**
- `to_dict()` / `from_dict()` - JSON-ready (Node/Bus kompatybilne)

### 3.2 Branch (`branch.py`)

GaĹ‚Ä…Ĺş sieci - linia, kabel lub transformator.

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
    length_km: float       # DĹ‚ugoĹ›Ä‡ [km]
    rated_current_a: float # PrÄ…d znamionowy [A]
```

**Metody obliczeniowe:**
- `get_total_impedance()` â†’ `complex` [Î©]
- `get_series_admittance()` â†’ `complex` [S]
- `get_shunt_admittance()` â†’ `complex` [S]

#### TransformerBranch

Transformator dwuuzwojeniowy.

```python
@dataclass
class TransformerBranch(Branch):
    rated_power_mva: float   # Moc znamionowa [MVA]
    voltage_hv_kv: float     # NapiÄ™cie strony WN [kV]
    voltage_lv_kv: float     # NapiÄ™cie strony DN [kV]
    uk_percent: float        # NapiÄ™cie zwarciowe [%]
    pk_kw: float             # Straty zwarciowe [kW]
    i0_percent: float        # PrÄ…d jaĹ‚owy [%]
    p0_kw: float             # Straty jaĹ‚owe [kW]
    vector_group: str        # Grupa poĹ‚Ä…czeĹ„ (np. "Dyn11")
    tap_position: int        # Pozycja zaczepĂłw
    tap_step_percent: float  # Krok zaczepĂłw [%]
```

**Metody obliczeniowe (IEC 60909):**
- `get_short_circuit_impedance_pu()` â†’ `complex`
- `get_short_circuit_impedance_ohm_lv()` â†’ `complex`
- `get_ikss_lv_ka(c_factor)` â†’ `float` [kA]
- `get_impedance_pu(base_mva)` â†’ `complex`
- `get_turns_ratio()` â†’ `float`
- `get_tap_ratio()` â†’ `float`

### 3.3 NetworkGraph (`graph.py`)

Graf sieci elektroenergetycznej oparty na NetworkX.

```python
class NetworkGraph:
    nodes: Dict[str, Node]
    branches: Dict[str, Branch]
    inverter_sources: Dict[str, InverterSource]
    _graph: nx.MultiGraph  # WewnÄ™trzny graf NetworkX
```

**Operacje CRUD:**
- `add_node(node)`, `remove_node(node_id)`, `get_node(node_id)`
- `add_branch(branch)`, `remove_branch(branch_id)`, `get_branch(branch_id)`
- `add_inverter_source(source)`, `remove_inverter_source(source_id)`

**Analiza topologii:**
- `is_connected()` â†’ `bool` - czy graf jest spĂłjny
- `find_islands()` â†’ `List[List[str]]` - komponenty spĂłjnoĹ›ci
- `get_connected_nodes(node_id)` â†’ `List[Node]` - sÄ…siedzi wÄ™zĹ‚a
- `get_slack_node()` â†’ `Node` - jedyny wÄ™zeĹ‚ SLACK

**Constrainty:**
- Maksymalnie 1 wÄ™zeĹ‚ SLACK w sieci
- GaĹ‚Ä…Ĺş nie moĹĽe Ĺ‚Ä…czyÄ‡ wÄ™zĹ‚a samego ze sobÄ…
- `from_node_id` i `to_node_id` muszÄ… istnieÄ‡ w `nodes`

### 3.4 InverterSource (`inverter.py`)

ĹąrĂłdĹ‚o falownikowe OZE dla obliczeĹ„ IEC 60909.

```python
@dataclass
class InverterSource:
    id: str
    name: str
    node_id: str
    in_rated_a: float      # PrÄ…d znamionowy [A]
    k_sc: float = 1.1      # WspĂłĹ‚czynnik zwarciowy
    contributes_negative_sequence: bool = False
    contributes_zero_sequence: bool = False
    in_service: bool = True

    @property
    def ik_sc_a(self) -> float:
        """WkĹ‚ad prÄ…dowy do zwarcia: Ik = k_sc * In"""
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

## 4. NiemutowalnoĹ›Ä‡

### 4.1 Dataclasses

WiÄ™kszoĹ›Ä‡ klas core uĹĽywa `@dataclass` z domyĹ›lnÄ… mutowalnoĹ›ciÄ… dla wygody operacji CRUD. Jednak:

- **Wyniki obliczeĹ„** uĹĽywajÄ… `@dataclass(frozen=True)` (np. ShortCircuitResult)
- **Encje domenowe** uĹĽywajÄ… `frozen=True` (np. Project, AnalysisRun)

## 5. Action Envelope (Edycje domeny)

Core udostÄ™pnia kanoniczny **Action Envelope** jako append-only opis intencjonalnych zmian w domenie.
Akcje sÄ… wiÄ…zane z `parent_snapshot_id` i podlegajÄ… **deterministycznej walidacji strukturalnej**.
Brak tu fizyki i norm â€” tylko struktura oraz referencje do encji snapshotu.

### 5.1 Pola Action Envelope

- `action_id` (UUID string)
- `parent_snapshot_id` (string)
- `action_type` (enumerated string)
- `payload` (dict)
- `created_at` (ISO 8601)
- `actor` (optional string)
- `schema_version` (optional string/int)

### 5.2 MVP Action Types

- `create_node` â€” minimalny payload: `node_type` + wymagane pola zaleĹĽne od typu
- `create_branch` â€” `from_node_id`, `to_node_id`, `branch_kind`
- `set_in_service` â€” `entity_id`, `in_service` (bool)

> **Uwaga:** Akcja `set_connection_node` zostaĹ‚a usuniÄ™ta z warstwy Core w ramach Phase 2 Task 2.1.
> Hint BoundaryNode â€“ punktu wspĂłlnego przyĹ‚Ä…czenia jest zarzÄ…dzany w warstwie ustawieĹ„ application/wizard, a nie w NetworkGraph.

### 5.3 ActionResult (zaakceptuj/odrzuÄ‡)

Walidator zwraca `ActionResult`:
- `status`: `"accepted"` lub `"rejected"`
- `action_id`, `parent_snapshot_id`
- `errors`: lista `{code, message, path}` (pusta dla accepted)
- `warnings`: opcjonalna lista (domyĹ›lnie pusta)

PrzykĹ‚adowe kody bĹ‚Ä™dĂłw: `missing_field`, `invalid_type`, `unknown_action_type`,
`missing_payload_key`, `unknown_node`, `unknown_entity`.

### 5.4 PrzepĹ‚yw Action â†’ Snapshot

PrzepĹ‚yw aplikacji akcji do nowego snapshotu:

1. **Wizard** generuje `ActionEnvelope` (intencja zmiany).
2. **Walidacja** wykonuje deterministycznÄ… walidacjÄ™ strukturalnÄ… i zwraca `ActionResult`.
3. Dla `ActionResult.status == "accepted"` nastÄ™puje **zastosowanie akcji** w backend core.
4. **Zastosowanie akcji** tworzy **NOWY** `NetworkSnapshot` z:
   - nowym `snapshot_id` (deterministycznym, powiÄ…zanym z akcjÄ…),
   - `parent_snapshot_id` wskazujÄ…cym snapshot wejĹ›ciowy,
   - stabilnÄ…, deterministycznÄ… serializacjÄ… (sortowanie encji po `id`).

Podsumowanie przepĹ‚ywu: **Wizard â†’ ActionEnvelope â†’ Walidacja â†’ Zastosowanie akcji â†’ Nowy Snapshot**.

### 4.2 Snapshot Pattern

Dla obliczeĹ„ stosujemy wzorzec snapshot:
1. `NetworkWizardService` buduje `NetworkGraph` z persystencji
2. `NetworkGraph` jest przekazywany do solvera jako snapshot tylko do odczytu
3. Solver nie modyfikuje grafu, tylko go czyta
4. Snapshot ma backendowe metadane (`snapshot_id`, opcjonalny `parent_snapshot_id`,
   `created_at`, opcjonalny `schema_version`) dla jednoznacznej identyfikacji i linii czasu

## 5. Granice OdpowiedzialnoĹ›ci

| FunkcjonalnoĹ›Ä‡           | Core (TAK)      | Core (NIE)          |
|--------------------------|-----------------|---------------------|
| Przechowywanie wÄ™zĹ‚Ăłw    | âś“               |                     |
| Przechowywanie gaĹ‚Ä™zi    | âś“               |                     |
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

# Dodawanie wÄ™zĹ‚Ăłw
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

# Dodawanie gaĹ‚Ä™zi
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
    print("SieÄ‡ jest spĂłjna")

# Znajdowanie wysp
islands = graph.find_islands()
for i, island in enumerate(islands):
    print(f"Wyspa {i}: {island}")

# Pobieranie wÄ™zĹ‚a SLACK
slack = graph.get_slack_node()
```

## 7. PowiÄ…zane Dokumenty

- [00-System-Overview.md](./00-System-Overview.md) - architektura systemu
- [02-Solvers.md](./02-Solvers.md) - solvery korzystajÄ…ce z Core
- [ADR-001](./adr/ADR-001-power-flow-v2-overlay-vs-core.md) - overlay vs core

