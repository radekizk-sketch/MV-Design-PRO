> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# ROZDZIAŁ 6 — KONTRAKTY SOLVERÓW & MAPOWANIE ENM → MODEL OBLICZENIOWY

**Wersja:** 1.1 SUPPLEMENT
**Data:** 2026-02-09
**Status:** AS-IS (1:1 z kodem) + TO-BE (sekcje oznaczone)
**Warstwa:** Solver + Mapping + Results API
**Zależności:** Rozdział 2 (§2.3–§2.14 — byty ENM), Rozdział 4 (§4.1–§4.19 — linie/kable), Rozdział 5 (§5.2–§5.4 — kompozycja, katalog, resolver), AUDIT §9 (Decyzje #1–#5, #14, #43–#48)
**Autor:** System Architect + PhD Energetyki

---

## 6.1 Cel i zakres rozdziału

Niniejszy rozdział definiuje **kontrakty warstwy obliczeniowej** MV-DESIGN-PRO:

1. Architekturę transformacji ENM → Model Obliczeniowy (NetworkGraph)
2. Kontrakty bytów obliczeniowych solvera (Node, LineBranch, TransformerBranch, Switch, InverterSource)
3. Deterministyczne reguły mapowania `map_enm_to_network_graph()`
4. Budowę macierzy admitancyjnej Y-bus (AdmittanceMatrixBuilder)
5. Kontrakty wejściowe i wyjściowe solverów (SC IEC 60909, PF Newton-Raphson)
6. Frozen Result API — `ShortCircuitResult`, `PowerFlowNewtonSolution`
7. Inwarianty architektoniczne warstwy Solver

**Granica rozdziału:** Opisuje kontrakty i reguły mapowania. NIE powtarza modelu ENM (→ Rozdział 2), NIE powtarza katalogów/resolwera (→ Rozdział 5 §5.4–§5.6). NIE zawiera pełnych specyfikacji matematycznych solverów (→ SPEC_10_SOLVER_SC_IEC60909.md, SPEC_11_SOLVER_PF_NEWTON.md).

---

## 6.2 Architektura warstwowa — przepływ danych (Decyzja #2)

### 6.2.1 Trzy warstwy danych (BINDING)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  1. WARSTWA ENM (edytowalna)                                            │
│     EnergyNetworkModel: Bus, Branch, Transformer, Source, Load,         │
│     Generator, Junction, Substation, Bay, Corridor                      │
│     Edycja: Kreator (K1-K10) + Drzewo ENM                              │
│     Persystencja: enm/models.py (Pydantic v2)                          │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
                 map_enm_to_network_graph(enm)
                 (deterministyczna, pure function)
                 Plik: enm/mapping.py
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  2. WARSTWA SOLVER (read-only)                                          │
│     NetworkGraph: Node, LineBranch, TransformerBranch, Switch,           │
│     InverterSource, Station                                             │
│     Produkowany wyłącznie przez mapping — solver NIGDY nie modyfikuje   │
│     ENM. Solver operuje na NetworkGraph + Y-bus.                        │
│     Plik: network_model/core/*.py                                       │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
              solve(graph, case_config) → Result
              (pure: ten sam graf → ten sam wynik)
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  3. WARSTWA RESULTS (frozen, immutable)                                 │
│     ShortCircuitResult (frozen dataclass)                               │
│     PowerFlowNewtonSolution (frozen dataclass)                          │
│     WhiteBoxTrace (lista kroków obliczeniowych)                         │
│     Raz wyprodukowane — nie mogą być zmienione.                         │
│     Plik: network_model/solvers/*.py                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.2.2 Inwarianty przepływu (BINDING)

| # | Inwarinat | Opis |
|---|-----------|------|
| INV-S01 | ENM → Solver jednokierunkowy | Solver NIGDY nie modyfikuje ENM. Dane płyną wyłącznie: ENM → NetworkGraph → Result. |
| INV-S02 | Mapowanie deterministyczne | Ten sam ENM = ten sam NetworkGraph (sortowanie po `ref_id`, UUID5 deterministyczne). |
| INV-S03 | Solver pure function | Ten sam NetworkGraph + ten sam Case Config = ten sam Result (determinizm wyników). |
| INV-S04 | Result immutable | `ShortCircuitResult` i `PowerFlowNewtonSolution` są frozen dataclasses — brak mutacji po utworzeniu. |
| INV-S05 | White Box obowiązkowy | Każdy solver MUSI produkować `white_box_trace` z pełnym śladem obliczeniowym. |
| INV-S06 | Walidacja przed solverem | Solver WYMAGA przejścia walidacji ENM (brak BLOCKER) — `AnalysisAvailability` jest bramą. |
| INV-S07 | Jedna warstwa fizyki | Fizyka (impedancje, prądy, napięcia) obliczana WYŁĄCZNIE w warstwie Solver. Żaden inny komponent nie wykonuje obliczeń fizycznych. |

---

## 6.3 Byty modelu obliczeniowego (NetworkGraph)

### 6.3.1 Node — węzeł obliczeniowy (AS-IS)

**Plik:** `network_model/core/node.py`

```python
@dataclass
class Node:
    id: str                                    # UUID (deterministyczny, uuid5)
    name: str
    node_type: NodeType                        # SLACK | PQ | PV
    voltage_level: float                       # kV (napięcie znamionowe)
    voltage_magnitude: Optional[float]         # pu (wymagane dla SLACK, PV)
    voltage_angle: Optional[float]             # rad (wymagane dla SLACK)
    active_power: Optional[float]              # MW (wymagane dla PQ, PV)
    reactive_power: Optional[float]            # MVAr (wymagane dla PQ)
```

**Wymagania per NodeType:**

| NodeType | voltage_magnitude | voltage_angle | active_power | reactive_power |
|----------|-------------------|---------------|--------------|----------------|
| **SLACK** | wymagane (=1.0 pu) | wymagane (=0.0 rad) | — | — |
| **PQ** | — | — | wymagane | wymagane |
| **PV** | wymagane | — | wymagane | — |

**Walidacja (post_init):**
- `voltage_level` ≥ 0
- `voltage_magnitude` (jeśli podane) > 0
- `voltage_angle` (jeśli podane) ∈ [-π, π]
- SLACK wymaga `voltage_magnitude` i `voltage_angle`
- PQ wymaga `active_power` i `reactive_power`
- PV wymaga `active_power` i `voltage_magnitude`

**Inwarinat:** Dokładnie JEDEN Node typu SLACK w NetworkGraph (walidacja w `NetworkGraph.add_node()`).

**Mapowanie z ENM:** Patrz §6.4.

---

### 6.3.2 LineBranch — gałąź liniowa/kablowa (AS-IS)

**Plik:** `network_model/core/branch.py`

```python
@dataclass
class LineBranch(Branch):
    branch_type: BranchType = LINE | CABLE
    r_ohm_per_km: float                        # Ω/km
    x_ohm_per_km: float                        # Ω/km
    b_us_per_km: float                         # μS/km (susceptancja)
    length_km: float
    rated_current_a: float
    type_ref: Optional[str]                    # Referencja do katalogu
    impedance_override: Optional[LineImpedanceOverride]
```

**Metody obliczeniowe (schemat π):**

| Metoda | Wzór | Jednostka |
|--------|------|-----------|
| `get_total_impedance()` | Z = (R' + jX') × L | Ω (complex) |
| `get_series_admittance()` | Y_s = 1 / Z | S (complex) |
| `get_shunt_admittance()` | Y_sh = jB' × L × 10⁻⁶ | S (complex) |
| `get_shunt_admittance_per_end()` | Y_sh/2 | S (complex) |

**Schemat zastępczy π:**

```
       Y_sh/2          Z_series          Y_sh/2
  ┌──────┤────────────┤─────────┤────────┤──────┐
  │      │            │ R + jX  │        │      │
  from   ▼            └─────────┘        ▼      to
  node  jB·L/2                          jB·L/2  node
  │      │                               │      │
  └──────┴───────────────────────────────┴──────┘
                     GND
```

**Konwersja jednostek (BINDING):**
- ENM `b_siemens_per_km` → Solver `b_us_per_km`: mnożenie × 10⁶
- Susceptancja w macierzy Y-bus: `b_us_per_km × 10⁻⁶ × length_km` → Siemens

**Precedencja parametrów (resolver):**
1. `impedance_override` (R_total, X_total, B_total — wartości całkowite, nie per km)
2. `type_ref` → `LineType` / `CableType` z katalogu
3. Parametry instancji (fallback)

**Walidacja:**
- `length_km` > 0
- `r_ohm_per_km`, `x_ohm_per_km`, `b_us_per_km` ≥ 0
- R + jX ≠ 0 (impedancja niezerowa, chyba że override)
- Wszystkie wartości skończone (brak NaN/Inf)

---

### 6.3.3 TransformerBranch — gałąź transformatorowa (AS-IS)

**Plik:** `network_model/core/branch.py`

```python
@dataclass
class TransformerBranch(Branch):
    branch_type: BranchType = TRANSFORMER
    rated_power_mva: float                     # Sn [MVA]
    voltage_hv_kv: float                       # Napięcie strony WN [kV]
    voltage_lv_kv: float                       # Napięcie strony nN [kV]
    uk_percent: float                          # Napięcie zwarcia [%]
    pk_kw: float                               # Straty miedzi [kW]
    i0_percent: float                          # Prąd jałowy [%]
    p0_kw: float                               # Straty żelaza [kW]
    vector_group: str                          # Grupa połączeń, np. "Dyn11"
    tap_position: int                          # Pozycja zaczepowa
    tap_step_percent: float                    # Krok zaczepowy [%]
    type_ref: Optional[str]
```

**Metody obliczeniowe:**

| Metoda | Wzór | Opis |
|--------|------|------|
| `get_short_circuit_impedance_pu(base_mva)` | z_pu = uk%/100; r_pu = (Pk/1000)/Sn; x_pu = √(z²−r²); skalowanie: Z × (base_mva/Sn) | Impedancja zwarcia [pu] |
| `get_turns_ratio()` | n = U_HV / U_LV | Przekładnia znamionowa |
| `get_tap_ratio()` | t = 1 + tap_position × tap_step/100 | Współczynnik przełożenia z zaczepem |
| `get_voltage_factor_c_max()` | c_max = 1.10 (SN) | Współczynnik napięciowy IEC 60909 |
| `get_voltage_factor_c_min()` | c_min = 0.95 (SN) | Współczynnik napięciowy IEC 60909 |

**Schemat zastępczy (uproszczony — bez gałęzi magnesującej w Y-bus):**

```
           R_T + jX_T (pu)
  HV ──────┤─────────┤────── LV
  node     └─────────┘       node
           (impedancja zwarcia)
```

**Walidacja:**
- `rated_power_mva` > 0, `uk_percent` > 0
- `voltage_hv_kv` > 0, `voltage_lv_kv` > 0, `voltage_hv_kv` ≠ `voltage_lv_kv`
- `pk_kw` ≥ 0, `i0_percent` ≥ 0, `p0_kw` ≥ 0
- Dyskryminanta: (uk/100)² − ((Pk/1000)/Sn)² ≥ 0

---

### 6.3.4 Switch — łącznik (AS-IS)

**Plik:** `network_model/core/switch.py`

```python
@dataclass
class Switch:
    id: str
    name: str
    from_node_id: str
    to_node_id: str
    switch_type: SwitchType                    # BREAKER | DISCONNECTOR | LOAD_SWITCH | FUSE | RECLOSER | EARTH_SWITCH
    state: SwitchState                         # OPEN | CLOSED
    in_service: bool = True
    rated_current_a: float = 0.0               # Tylko metadata (BEZ impedancji)
    rated_voltage_kv: float = 0.0
    equipment_type_ref: Optional[str]
```

**INWARINAT KRYTYCZNY: Łącznik ma ZEROWĄ impedancję.**

Łączniki wpływają WYŁĄCZNIE na topologię:
- **CLOSED:** połączenie zeroimpedancyjne → węzły scalane w macierzy Y-bus (Union-Find)
- **OPEN:** brak krawędzi w grafie → rozłączenie topologiczne

**Metody:**
- `is_closed` → bool
- `is_open` → bool
- `open()`, `close()`, `toggle()` → nowa instancja Switch (immutable)

---

### 6.3.5 InverterSource — źródło falownikowe (AS-IS)

**Plik:** `network_model/core/inverter.py`

```python
@dataclass
class InverterSource:
    id: str
    name: str
    node_id: str                               # Węzeł przyłączenia
    type_ref: Optional[str]                    # Referencja do ConverterType/InverterType
    converter_kind: Optional[ConverterKind]    # Typ z katalogu
    in_rated_a: float                          # Prąd znamionowy [A]
    k_sc: float = 1.1                          # Współczynnik wkładu zwarciowego
    contributes_negative_sequence: bool = False
    contributes_zero_sequence: bool = False
    in_service: bool = True
```

**Prąd zwarciowy (property):**

```
Ik_sc = k_sc × In_rated    [A]
```

**Rola w solverze SC:** Model uproszczonego źródła prądowego — wkład RMS do prądu zwarciowego. Brak impedancji (nie wpływa na macierz Y-bus). Wkład addytywny do `Ik_total`.

**Rola w solverze PF:** Nie uczestniczy bezpośrednio — falownik w PF jest reprezentowany przez P/Q adjustment na węźle (przez mapowanie Generator → Node.active_power/reactive_power).

**INWARINAT KANONICZNY:**
> InverterSource (źródło energoelektroniczne) NIE wchodzi do macierzy Y-bus
> w żadnym solverze stacjonarnym (Power Flow, Short Circuit).
> InverterSource jest modelowany jako źródło prądowe o ograniczonej amplitudzie (k_sc × In),
> dodawane ADDYTYWNIE do wyniku obliczenia prądu zwarciowego z sieci Thévenina.

**DOPRECYZOWANIE ZAKRESU:**
> Modele dynamiczne (EMT, RMS-dynamic) są POZA ZAKRESEM niniejszej specyfikacji
> i nie wpływają na kontrakty solverów opisane w Rozdziale 6.

> **TO-BE** — Decyzja #14: Pełne mapowanie `Generator(gen_type=pv_inverter|wind_inverter|bess)` → `InverterSource` w `enm/mapping.py`. Stan AS-IS: Generator falownikowy mapowany jako P/Q adjustment na Node (jak generator synchroniczny), brak tworzenia InverterSource w mapping.

---

### 6.3.6 NetworkGraph — graf obliczeniowy (AS-IS)

**Plik:** `network_model/core/graph.py`

```python
class NetworkGraph:
    nodes: Dict[str, Node]
    branches: Dict[str, Branch]
    switches: Dict[str, Switch]
    inverter_sources: Dict[str, InverterSource]
    stations: Dict[str, Station]
    _graph: nx.MultiGraph                      # Prywatny graf topologiczny
```

**Zasady budowy krawędzi:**
- Gałęzie: krawędź jeśli `in_service=True`
- Łączniki: krawędź jeśli `in_service=True` AND `state=CLOSED`
- Graf nieskierowany (`MultiGraph`) — kierunek przepływu mocy wyznacza solver
- Równoległe gałęzie między tymi samymi węzłami dozwolone (`key=branch_id`)

**Metody kluczowe:**

| Metoda | Opis | Walidacja |
|--------|------|-----------|
| `add_node(node)` | Dodaje węzeł; waliduje dokładnie 1 SLACK | Raises jeśli >1 SLACK |
| `add_branch(branch)` | Dodaje gałąź; tworzy krawędź jeśli in_service | — |
| `add_switch(switch)` | Dodaje łącznik; krawędź jeśli CLOSED i in_service | — |
| `get_slack_node()` | Zwraca jedyny węzeł SLACK | Raises jeśli ≠1 |
| `is_connected()` | Czy graf spójny (nx.is_connected) | — |
| `find_islands()` | Lista komponentów spójnych, sortowane rozmiarem | — |

**Station (kontener logiczny):**
- Grupuje węzły i transformatory — BEZ wpływu na obliczenia
- Solver NIE widzi Station w macierzy Y-bus
- Warstwa organizacyjna / wizualizacyjna

**ZAKAZ KANONICZNY — Station / Substation:**
> Byt Station / Substation jako kontener logiczny:
> - NIE wpływa na wybór węzła SLACK,
> - NIE wpływa na bazę napięciową,
> - NIE wpływa na konfigurację solvera,
> - NIE jest uwzględniany w walidacji grafu obliczeniowego.

**INWARINAT:**
> Station istnieje WYŁĄCZNIE jako struktura organizacyjna ENM/UI.
> Solver widzi wyłącznie: Node, Branch (LineBranch, TransformerBranch), Switch, InverterSource.
> Żaden parametr Station (station_type, bus_ids, branch_ids) NIE jest wejściem do jakiegokolwiek solvera.

---

## 6.4 Mapowanie ENM → NetworkGraph (Decyzja #2, #14)

### 6.4.1 Kontrakt mapowania (AS-IS)

**Plik:** `enm/mapping.py`
**Sygnatura:**

```python
def map_enm_to_network_graph(enm: EnergyNetworkModel) -> NetworkGraph
```

**Właściwości (BINDING):**
- **Pure function** — brak efektów ubocznych, brak mutacji ENM
- **Deterministyczna** — ten sam ENM → identyczny NetworkGraph
- **Sortowanie po ref_id** — iteracja po elementach w kolejności `ref_id` (stabilność)
- **UUID5** — identyfikatory solverowe generowane przez `uuid.uuid5(NAMESPACE_DNS, ref_id)` (determinizm)

### 6.4.2 Reguły mapowania per element (AS-IS)

#### Bus → Node

| Pole ENM (Bus) | Pole Solver (Node) | Reguła |
|---|---|---|
| `ref_id` | `id` | `uuid5(NAMESPACE_DNS, ref_id)` |
| `name` | `name` | 1:1 |
| `voltage_kv` | `voltage_level` | 1:1 [kV] |
| — | `node_type` | SLACK jeśli bus jest Source bus; PQ w przeciwnym razie |
| — | `voltage_magnitude` | 1.0 pu dla SLACK; None dla PQ |
| — | `voltage_angle` | 0.0 rad dla SLACK; None dla PQ |
| — | `active_power` | 0.0 MW dla PQ (akumulowane z Load/Generator) |
| — | `reactive_power` | 0.0 MVAr dla PQ (akumulowane z Load/Generator) |

**Reguła SLACK (BINDING):** Bus przyłączony do Source → NodeType.SLACK (v_mag=1.0 pu, θ=0 rad).
Wszystkie pozostałe bus-y → NodeType.PQ z P=Q=0 (startowo).

**Pola ENM ignorowane przez solver:** `grounding`, `zone`, `frequency_hz`, `phase_system`, `nominal_limits`.

#### OverheadLine / Cable → LineBranch

| Pole ENM | Pole Solver (LineBranch) | Reguła |
|---|---|---|
| `ref_id` | `id` | `uuid5(NAMESPACE_DNS, ref_id)` |
| `from_bus_ref` / `to_bus_ref` | `from_node_id` / `to_node_id` | Mapowanie bus ref → node id |
| `r_ohm_per_km` | `r_ohm_per_km` | Przez resolver (precedencja §6.3.2) |
| `x_ohm_per_km` | `x_ohm_per_km` | Przez resolver |
| `b_siemens_per_km` | `b_us_per_km` | **× 10⁶** (konwersja S/km → μS/km) |
| `length_km` | `length_km` | 1:1 |
| `rating.in_a` | `rated_current_a` | 1:1 (lub z typu katalogowego) |
| `status` | `in_service` | `"closed"` → True, `"open"` → False |
| `type` | `branch_type` | `"line_overhead"` → LINE, `"cable"` → CABLE |

**Pola ENM ignorowane:** `r0_ohm_per_km`, `x0_ohm_per_km`, `b0_siemens_per_km` (składowe zerowe — nie używane przez solver składowej symetrycznej dodatniej AS-IS).

#### Transformer → TransformerBranch

| Pole ENM (Transformer) | Pole Solver (TransformerBranch) | Reguła |
|---|---|---|
| `ref_id` | `id` | `uuid5(NAMESPACE_DNS, ref_id)` |
| `hv_bus_ref` | `from_node_id` | Mapowanie HV bus ref → node id |
| `lv_bus_ref` | `to_node_id` | Mapowanie LV bus ref → node id |
| `sn_mva` | `rated_power_mva` | Przez resolver (typ > instancja) |
| `uhv_kv` | `voltage_hv_kv` | Przez resolver |
| `ulv_kv` | `voltage_lv_kv` | Przez resolver |
| `uk_percent` | `uk_percent` | Przez resolver |
| `pk_kw` | `pk_kw` | Przez resolver |
| `i0_percent` | `i0_percent` | Przez resolver (0.0 jeśli brak) |
| `p0_kw` | `p0_kw` | Przez resolver (0.0 jeśli brak) |
| `vector_group` | `vector_group` | 1:1 (lub "" jeśli brak) |
| `tap_position` | `tap_position` | 1:1 (lub 0 jeśli brak) |
| `tap_step_percent` | `tap_step_percent` | 1:1 (lub 0.0 jeśli brak) |

**Pola ENM ignorowane:** `hv_neutral`, `lv_neutral` (uziemienie — nie modelowane w solverze składowej dodatniej AS-IS).

#### SwitchBranch / FuseBranch → Switch

| Pole ENM | Pole Solver (Switch) | Reguła |
|---|---|---|
| `ref_id` | `id` | `uuid5(NAMESPACE_DNS, ref_id)` |
| `from_bus_ref` / `to_bus_ref` | `from_node_id` / `to_node_id` | Mapowanie bus ref → node id |
| `type` | `switch_type` | Tabela konwersji (patrz niżej) |
| `status` | `state` | `"closed"` → CLOSED, `"open"` → OPEN |
| `status` | `in_service` | `"closed"` → True, `"open"` → True (łącznik otwarty jest in_service, ale OPEN) |

**Tabela konwersji typów łączników:**

| ENM `type` | Solver `SwitchType` |
|---|---|
| `"switch"` | LOAD_SWITCH |
| `"breaker"` | BREAKER |
| `"disconnector"` | DISCONNECTOR |
| `"bus_coupler"` | LOAD_SWITCH |
| `"fuse"` | FUSE |

#### Source → Węzeł wirtualny + Gałąź impedancyjna

Source NIE jest mapowany bezpośrednio na Node. Zamiast tego generuje **dwa elementy solverowe:**

1. **Węzeł wirtualny (Ground Node):** Node z `node_type=PQ`, P=Q=0, napięcie = `source.bus_ref.voltage_kv`
2. **Gałąź impedancyjna:** LineBranch łączący węzeł wirtualny z Bus źródłowym

**Obliczanie impedancji źródła (BINDING):**

```
Jeśli r_ohm i x_ohm podane bezpośrednio:
    R = r_ohm,  X = x_ohm

W przeciwnym razie (z Sk'' i rx_ratio):
    Z_abs = Un² / Sk3_mva                [Ω]
    X = Z_abs / √(1 + rx_ratio²)         [Ω]
    R = X × rx_ratio                      [Ω]
```

Bus źródłowy (Bus z przyłączonym Source) → NodeType.SLACK (v_mag=1.0 pu, θ=0.0 rad).

**INWARINAT KANONICZNY — Węzeł wirtualny źródła (Source internal node):**
> Węzeł wirtualny źródła:
> - istnieje WYŁĄCZNIE w warstwie NetworkGraph (produkowany przez `map_enm_to_network_graph()`),
> - NIE jest eksponowany do ENM, UI ani SLD,
> - NIE posiada `ref_id` widocznego poza solverem,
> - jego identyfikator generowany jest deterministycznie przez UUID5 z `source.ref_id` + suffix.
>
> Węzeł wirtualny nie jest elementem modelu użytkownika — jest artefaktem obliczeniowym
> wymaganym do poprawnego modelowania impedancji źródła zasilania w macierzy Y-bus.

#### Load → Akumulacja P/Q na Node

Load NIE tworzy osobnego elementu solverowego. Zamiast tego modyfikuje P/Q na Node odpowiadającym `bus_ref`:

```
node.active_power  -= load.p_mw        (ujemny znak: odbiór)
node.reactive_power -= load.q_mvar     (ujemny znak: odbiór)
```

#### Generator → Akumulacja P/Q na Node (AS-IS)

Generator (wszystkie typy) NIE tworzy osobnego elementu solverowego. Modyfikuje P/Q na Node odpowiadającym `bus_ref`:

```
node.active_power  += gen.p_mw         (dodatni znak: generacja)
node.reactive_power += gen.q_mvar      (dodatni znak: generacja)
```

> **TO-BE** — Decyzja #14: Generator z `gen_type ∈ {pv_inverter, wind_inverter, bess}` powinien być mapowany na `InverterSource` (dla solvera SC). Obecne mapowanie (P/Q adjustment) jest poprawne dla PF, ale niepoprawne dla SC — falownik powinien być źródłem prądowym (k_sc × In), nie impedancyjnym.

#### Elementy ENM POMIJANE przy mapowaniu

| Element ENM | Powód pominięcia |
|---|---|
| Substation | Kontener logiczny — brak wpływu na obliczenia |
| Bay | Kontener logiczny zabezpieczeń — solver nie widzi |
| Corridor | Warstwa SLD Layout — organizacja wizualna |
| Junction | Mapowany jako Bus (przez `bus_ref` elementów łączących) |

### 6.4.3 Diagram mapowania (BINDING)

```
ENM                          mapping.py                    NetworkGraph
─────────────────────────────────────────────────────────────────────────

Bus ───────────────────────────────────────────────────► Node
  voltage_kv ──────────────────────────────────────────► voltage_level
  (Source attached?) ──────────────────────────────────► node_type=SLACK

OverheadLine ──────── resolver ────────────────────────► LineBranch(LINE)
  r/x/b per km ──── precedencja: override>type>inst ──► r/x/b per km
  b_siemens ──────── × 10⁶ ───────────────────────────► b_us_per_km
  length_km ───────────────────────────────────────────► length_km

Cable ─────────────── resolver ────────────────────────► LineBranch(CABLE)
  (jak OverheadLine)

Transformer ───────── resolver ────────────────────────► TransformerBranch
  sn/uhv/ulv/uk/pk ─ precedencja: type>inst ──────────► rated/voltage/uk/pk
  tap_position ────────────────────────────────────────► tap_position

SwitchBranch ──────────────────────────────────────────► Switch
  type ────────────── tabela konwersji ────────────────► switch_type
  status ──────────── closed→CLOSED, open→OPEN ────────► state

FuseBranch ────────────────────────────────────────────► Switch(FUSE)

Source ────────────── Z obliczone ──────────────────────► Virtual Node + LineBranch
  sk3/rx_ratio ────── Un²/Sk, R=X×rx ─────────────────► impedancja gałęzi
  bus_ref ─────────── → SLACK ─────────────────────────► node_type=SLACK

Load ──────────────── akumulacja ──────────────────────► Node.P -= p_mw
                                                         Node.Q -= q_mvar

Generator ─────────── akumulacja ──────────────────────► Node.P += p_mw
                                                         Node.Q += q_mvar
```

---

## 6.5 Budowa macierzy admitancyjnej Y-bus (AS-IS)

### 6.5.1 AdmittanceMatrixBuilder

**Plik:** `network_model/core/ybus.py`

```python
class AdmittanceMatrixBuilder:
    def __init__(self, graph: NetworkGraph): ...
    def build() -> np.ndarray:                 # Shape (n, n), dtype=complex, pu
```

### 6.5.2 System jednostek odniesienia (per-unit)

| Wielkość bazowa | Wzór | Wartość |
|---|---|---|
| S_base | stała | 100 MVA |
| V_base(i) | napięcie znamionowe węzła i | `node.voltage_level` [kV] |
| Z_base(i) | V_base² / S_base | [Ω] |
| Y_base(i) | 1 / Z_base | [S] |
| I_base(i) | S_base / (√3 × V_base) | [kA] |

### 6.5.3 Scalanie węzłów (zamknięte łączniki)

Łączniki zamknięte (CLOSED) mają zerową impedancję → scalanie węzłów:

1. **Union-Find:** Struktura zbiorów rozłącznych scala węzły połączone zamkniętymi łącznikami
2. Węzły połączone zamkniętym łącznikiem → jeden węzeł reprezentatywny w macierzy Y-bus
3. Wymiar macierzy Y-bus = liczba węzłów reprezentatywnych (< liczba Node)

### 6.5.4 Budowa macierzy Y-bus

Dla każdej aktywnej gałęzi (in_service=True):

**Linia/Kabel (schemat π):**

```
Y_series = 1 / Z_total                    [pu]
Y_shunt  = j × B' × L × 10⁻⁶ / Y_base   [pu]

Y[i,j] -= Y_series                        (element pozadiagonalny)
Y[j,i] -= Y_series                        (symetria)
Y[i,i] += Y_series + Y_shunt/2            (element diagonalny)
Y[j,j] += Y_series + Y_shunt/2            (element diagonalny)
```

**Transformator:**

```
Z_pu = impedancja zwarcia [pu] (z TransformerBranch.get_short_circuit_impedance_pu)
Y_trafo = 1 / Z_pu

Y[i,j] -= Y_trafo
Y[j,i] -= Y_trafo
Y[i,i] += Y_trafo
Y[j,j] += Y_trafo
```

**Węzeł SLACK (referencja napięciowa):**

```
Y[slack, slack] += Y_ground ≈ 10⁶          [pu] (duża admitancja uziemienia)
```

### 6.5.5 Elementy NIE wchodzące do macierzy Y-bus

| Element | Powód |
|---|---|
| Łącznik OPEN | Brak krawędzi — rozłączenie topologiczne |
| Gałąź out-of-service | `in_service=False` → pominięta |
| Station | Kontener logiczny |
| InverterSource | Model prądowy (addytywny) — brak impedancji w Y-bus |

---

## 6.6 Kontrakty solverów

### 6.6.1 Solver zwarciowy IEC 60909 — kontrakt wejściowy

**Plik:** `network_model/solvers/short_circuit_iec60909.py`

**Wejście:**

| Parametr | Typ | Opis |
|---|---|---|
| `graph` | `NetworkGraph` | Pełny graf obliczeniowy |
| `fault_node_id` | `str` | Węzeł zwarcia |
| `short_circuit_type` | `ShortCircuitType` | Typ zwarcia: `ThreePhase`, `TwoPhase`, `OnePhase`, `TwoPhasePlus0` |
| `c_factor` | `float` | Współczynnik napięciowy c (0.95–1.10) |
| `tk_s` | `float` | Czas trwania zwarcia [s] |
| `tb_s` | `float` | Czas do obliczenia Ib [s] |

**Preconditions:**
- `fault_node_id` MUSI istnieć w `graph.nodes`
- Graf MUSI być spójny (wcześniejsza walidacja ENM)
- Dokładnie 1 węzeł SLACK

### 6.6.2 Solver zwarciowy IEC 60909 — kontrakt wyjściowy (Frozen API)

```python
@dataclass(frozen=True)
class ShortCircuitResult:
    # ── METADATA ZWARCIA ──
    short_circuit_type: ShortCircuitType       # Typ zwarcia
    fault_node_id: str                         # Węzeł zwarcia
    c_factor: float                            # Współczynnik napięciowy c
    un_v: float                                # Napięcie znamionowe w węźle zwarcia [V]
    zkk_ohm: complex                           # Impedancja zastępcza Zkk [Ω]
    rx_ratio: float                            # Stosunek R/X impedancji zastępczej
    kappa: float                               # Współczynnik udaru κ
    tk_s: float                                # Czas trwania zwarcia [s]
    tb_s: float                                # Czas do obliczenia Ib [s]

    # ── PRĄDY ZWARCIOWE [A] (NIE kA!) ──
    ikss_a: float                              # Początkowy prąd zwarcia Ik'' [A]
    ip_a: float                                # Prąd udarowy ip [A]
    ith_a: float                               # Prąd cieplny równoważny Ith [A]
    ib_a: float                                # Prąd wyłączalny Ib [A]

    # ── MOC ZWARCIOWA ──
    sk_mva: float                              # Moc zwarciowa Sk'' [MVA]

    # ── ANALIZA WKŁADÓW ──
    ik_thevenin_a: float                       # Wkład sieci (Thevenin) [A]
    ik_inverters_a: float                      # Wkład źródeł falownikowych [A]
    ik_total_a: float                          # Prąd całkowity = Thevenin + falowniki [A]

    # ── SZCZEGÓŁOWA TRACEABILITY ──
    contributions: list[ShortCircuitSourceContribution]
    branch_contributions: list[ShortCircuitBranchContribution] | None
    white_box_trace: list[dict]                # Pełny ślad obliczeniowy
```

**Jednostki (BINDING):** Prądy w **A** (amperach), NIE kA. Moce w MVA. Impedancje w Ω. Czasy w s.

**Stałe IEC 60909:**
- `C_MIN = 0.95` (napięcia minimalne, sieci SN)
- `C_MAX = 1.10` (napięcia maksymalne, sieci SN)

**Aliasy wstecznej kompatybilności:**

| Alias | Pole kanoniczne |
|---|---|
| `ik_a` | `ikss_a` |
| `ip` | `ip_a` |
| `ith` | `ith_a` |
| `ib` | `ib_a` |
| `sk` | `sk_mva` |

**EXPECTED_SHORT_CIRCUIT_RESULT_KEYS** — gwarantowany zestaw kluczy w `to_dict()`:

```python
EXPECTED_SHORT_CIRCUIT_RESULT_KEYS = [
    "short_circuit_type", "fault_node_id", "c_factor", "un_v",
    "zkk_ohm", "rx_ratio", "kappa", "tk_s", "tb_s",
    "ikss_a", "ip_a", "ith_a", "ib_a", "sk_mva",
    "ik_thevenin_a", "ik_inverters_a", "ik_total_a",
    "contributions", "branch_contributions", "white_box_trace"
]
```

**Serializacja (`to_dict()`):**
- `complex` → `{"re": float, "im": float}`
- `Enum` → wartość string
- `numpy` types → Python native

### 6.6.3 ShortCircuitSourceContribution (AS-IS)

```python
@dataclass(frozen=True)
class ShortCircuitSourceContribution:
    source_id: str                             # ID źródła
    source_name: str                           # Nazwa
    source_type: str                           # "grid" | "generator" | "inverter"
    ikss_a: float                              # Wkład prądowy Ik'' [A]
    percentage: float                          # Udział procentowy [%]
```

### 6.6.4 ShortCircuitBranchContribution (AS-IS)

```python
@dataclass(frozen=True)
class ShortCircuitBranchContribution:
    branch_id: str
    branch_name: str
    from_node_id: str
    to_node_id: str
    current_a: float                           # Prąd w gałęzi [A]
    direction: str                             # "from→to" | "to→from"
```

### 6.6.5 Solver rozpływowy Newton-Raphson — kontrakt wejściowy

**Plik:** `network_model/solvers/power_flow_newton.py`

```python
@dataclass
class PowerFlowInput:
    graph: NetworkGraph                        # Graf obliczeniowy

    # ── SPECYFIKACJA WĘZŁÓW ──
    slack: SlackSpec                            # Węzeł referencyjny
        node_id: str
        u_pu: float = 1.0                     # |U| [pu]
        angle_rad: float = 0.0                # θ [rad]

    pq: list[PQNodeSpec]                       # Węzły PQ (odbiory/iniekcje)
        node_id: str
        p_mw: float
        q_mvar: float

    pv: list[PVNodeSpec]                       # Węzły PV (generatory z regulacją U)
        node_id: str
        p_mw: float
        u_pu: float                            # Nastawa napięcia [pu]
        q_min_mvar: float
        q_max_mvar: float

    # ── ELEMENTY STERUJĄCE ──
    taps: list[TapSpec]                        # Pozycje zaczepowe transformatorów
    shunts: list[ShuntSpec]                    # Admitancje bocznikowe

    # ── KONFIGURACJA ──
    base_mva: float = 100.0
    options: SolverOptions
        max_iter: int = 20
        tolerance: float = 1e-6               # Kryterium zbieżności
        damping: float = 1.0                   # Pod-relaksacja
        validate: bool = True
        trace_level: str = "basic"             # "none" | "basic" | "full"
```

### 6.6.6 Solver rozpływowy Newton-Raphson — kontrakt wyjściowy (Frozen API)

```python
@dataclass(frozen=True)
class PowerFlowNewtonSolution:
    # ── STATUS ZBIEŻNOŚCI ──
    converged: bool                            # Czy algorytm zbiegł
    iterations: int                            # Liczba iteracji NR
    max_mismatch: float                        # Maksymalna niezgodność P/Q [pu]

    # ── NAPIĘCIA WĘZŁOWE ──
    node_voltage: dict[str, complex]           # Napięcie zespolone [pu]
    node_u_mag: dict[str, float]               # |U| [pu]
    node_angle: dict[str, float]               # θ [rad]
    node_voltage_kv: dict[str, float]          # Napięcie [kV]

    # ── PRZEPŁYWY W GAŁĘZIACH ──
    branch_current: dict[str, complex]         # Prąd [pu]
    branch_s_from: dict[str, complex]          # Moc od strony "from" [pu]
    branch_s_to: dict[str, complex]            # Moc od strony "to" [pu]
    branch_current_ka: dict[str, float]        # Prąd [kA]
    branch_s_from_mva: dict[str, complex]      # Moc [MVA]
    branch_s_to_mva: dict[str, complex]        # Moc [MVA]

    # ── BILANS SYSTEMOWY ──
    losses_total: complex                      # Sumaryczne straty [pu / MVA]
    slack_power: complex                       # Moc bilansowa SLACK [pu]
    sum_pq_spec: complex                       # Suma specyfikowanych P+jQ [pu]

    # ── DIAGNOSTYKA ──
    branch_flow_note: str                      # Uwagi / ostrzeżenia
    missing_voltage_base_nodes: list[str]      # Węzły bez voltage_level
    validation_warnings: list[str]
    validation_errors: list[str]
    slack_island_nodes: list[str]              # Komponent spójny z SLACK
    not_solved_nodes: list[str]                # Węzły odłączone

    # ── WHITE BOX TRACE ──
    ybus_trace: dict[str, object]              # Szczegóły budowy Y-bus
    nr_trace: list[dict[str, object]]          # Iteracje Newton-Raphson
    applied_taps: list[dict[str, object]]      # Zastosowane zaczepy
    applied_shunts: list[dict[str, object]]    # Zastosowane boczniki
    pv_to_pq_switches: list[dict[str, object]] # Przełączenia PV→PQ (Q-limit)
    init_state: dict | None                    # Stan początkowy (jeśli trace_level=full)

    # ── METADATA ──
    solver_method: Literal["newton-raphson", "gauss-seidel", "fast-decoupled"]
    fallback_info: dict[str, str] | None       # Informacja o fallback solvera
```

### 6.6.7 benchmarky solvera PF Newton-Raphson

```
1. Walidacja     → sprawdzenie spójności grafu, typów węzłów
2. Detekcja wysp → identyfikacja komponentu z SLACK (slack_island_nodes)
3. Budowa Y-bus  → build_ybus_pu() ze scalaniem łączników, zaczepami, bocznikami
4. Start NR      → build_initial_voltage() — U₀=1.0∠0° dla wszystkich węzłów
5. Iteracja NR   → newton_raphson_solve_v2() z Q-limit checking na węzłach PV
6. Przepływy     → compute_branch_flows() → S_from, S_to, I dla każdej gałęzi
7. Konwersja     → przeliczenie z pu → kV, kA, MVA
8. White Box     → zapis ybus_trace, nr_trace, init_state
```

### 6.6.8 Granica odpowiedzialności solverów — ochrona / zabezpieczenia (BINDING)

**ZAKAZ KANONICZNY:**
> Solvery obliczeniowe (Load Flow, Short Circuit) NIE implementują logiki zabezpieczeniowej
> i NIE podejmują decyzji selektywnych.

**DOPRECYZOWANIE:**
> Solvery dostarczają WYŁĄCZNIE dane wejściowe do warstwy Protection, w szczególności:
> - prądy zwarciowe (Ik'', Ip, Ith),
> - napięcia węzłów,
> - kierunki przepływów.
>
> Koordynacja zabezpieczeń jest realizowana w ODRĘBNEJ warstwie analitycznej (→ SPEC_12_PROTECTION.md).
> Solver NIE ZNA: nastaw zabezpieczeń, charakterystyk czasowych (DT/IDMT), logiki selektywności,
> aparatury łączeniowej (CB, LS), ani przekładników (CT/VT). Są to wyłącznie dane warstwy Analysis.

---

## 6.7 Frozen Result API — zasady (Decyzje #4, #5)

### 6.7.1 Definicja (BINDING)

**Frozen Result API** oznacza, że:

1. `ShortCircuitResult` i `PowerFlowNewtonSolution` są `@dataclass(frozen=True)` — immutable po utworzeniu
2. Zestaw pól (`EXPECTED_SHORT_CIRCUIT_RESULT_KEYS`) jest **gwarantowany** — konsumenci API mogą polegać na ich obecności
3. Zmiana zestawu pól wymaga **major version bump** (semantyczne wersjonowanie)
4. Aliasy wstecznej kompatybilności (`ik_a` → `ikss_a`) zapewniają ciągłość
5. Serializacja `to_dict()` jest deterministyczna — ten sam wynik → identyczny JSON

### 6.7.2 Zakazy (BINDING)

- **ZAKAZ** usuwania pól z Frozen API bez major version bump
- **ZAKAZ** zmiany jednostek (prądy w A, moce w MVA, impedancje w Ω)
- **ZAKAZ** zmiany semantyki serializacji (`complex` → `{"re", "im"}`)
- **ZAKAZ** dodawania pól do `EXPECTED_*_KEYS` bez aktualizacji konsumentów
- **ZAKAZ** mutacji instancji Result po jej utworzeniu

### 6.7.3 Mapowanie na istniejący SYSTEM_SPEC.md §5.4

Specyfikacja §5.4 opisywała uproszczoną wersję (4 pola na ShortCircuitResult). Niniejszy rozdział zastępuje §5.4 pełnym kontraktem AS-IS (21 pól SC, 30+ pól PF).

---

## 6.8 White Box Trace — kontrakt solvera (AS-IS)

### 6.8.1 Zasada (BINDING)

Każdy solver MUSI produkować `white_box_trace` — listę kroków obliczeniowych w formacie:

```python
{
    "step": str,               # Nazwa kroku (np. "Z_thevenin", "Y_bus_build")
    "formula": str,            # Wzór LaTeX (blokowy: $$...$$)
    "data": dict,              # Dane wejściowe kroku
    "substitution": str,       # Podstawienie numeryczne LaTeX
    "result": Any,             # Wynik numeryczny
    "unit": str                # Jednostka wyniku
}
```

### 6.8.2 Kroki White Box — solver SC IEC 60909

| Krok | Opis | Wzór |
|---|---|---|
| `Y_bus_build` | Budowa macierzy admitancyjnej | Y[i,j], Y[i,i] |
| `Z_bus_invert` | Inwersja Y → Z (Z_bus = Y⁻¹) | Z_bus = Y_bus⁻¹ |
| `Z_thevenin` | Impedancja zastępcza Thévenina | Z_kk = Z_bus[k,k] |
| `Ikss_calc` | Prąd początkowy Ik'' | Ik'' = c·Un / (√3·|Zkk|) |
| `kappa_calc` | Współczynnik udaru κ | κ = 1.02 + 0.98·e^(-3R/X) |
| `Ip_calc` | Prąd udarowy ip | ip = κ·√2·Ik'' |
| `Ith_calc` | Prąd cieplny Ith | Ith = Ik''·√tk |
| `Ib_calc` | Prąd wyłączalny Ib | Ib wg IEC 60909 |
| `Sk_calc` | Moc zwarciowa Sk'' | Sk'' = √3·Un·Ik'' |
| `inverter_contrib` | Wkład falowników | Ik_inv = Σ(k_sc·In) |
| `total_current` | Prąd całkowity | Ik_total = Ik_thevenin + Ik_inv |

### 6.8.3 Kroki White Box — solver PF Newton-Raphson

| Krok | Opis | Umiejscowienie |
|---|---|---|
| `ybus_trace` | Macierz Y-bus — struktura, wartości, wymiar | dict z Y-bus per-unit |
| `nr_trace[n]` | Iteracja n: mismatch ΔP/ΔQ, korekty ΔU/Δθ | lista dict per iteracja |
| `applied_taps` | Zaczepy transformatorów zastosowane | lista dict |
| `applied_shunts` | Boczniki zastosowane | lista dict |
| `pv_to_pq_switches` | Przełączenia PV→PQ (naruszenie Q-limit) | lista dict |
| `init_state` | Stan początkowy (U₀, θ₀) — jeśli trace_level=full | dict per węzeł |

---

## 6.9 Inwarianty architektoniczne warstwy Solver (BINDING)

### 6.9.1 Dziesięć kanonicznych inwariantów

| # | Inwarinat | Uzasadnienie | Plik referencyjny |
|---|-----------|-------------|-------------------|
| INV-S01 | **Jeden SLACK** | Dokładnie 1 węzeł SLACK w NetworkGraph | `graph.py` (add_node) |
| INV-S02 | **Łącznik = zero impedancji** | Switch scalany w Y-bus przez Union-Find | `ybus.py` |
| INV-S03 | **Frozen Results** | ShortCircuitResult i PowerFlowNewtonSolution immutable | `short_circuit_iec60909.py`, `power_flow_newton.py` |
| INV-S04 | **White Box obowiązkowy** | Każdy solver produkuje `white_box_trace` | Wszystkie solvery |
| INV-S05 | **S_base = 100 MVA** | Jednolity system per-unit | `ybus.py` |
| INV-S06 | **Scalanie węzłów** | Zamknięte łączniki → Union-Find → zredukowana macierz | `ybus.py` |
| INV-S07 | **Deterministyczne mapowanie** | Sortowanie po ref_id, UUID5 → stabilne identyfikatory | `mapping.py` |
| INV-S08 | **Precedencja parametrów** | override > type_ref > instance (resolver) | `catalog/resolver.py` |
| INV-S09 | **NOT-A-SOLVER** | Warstwa Application (Wizard, SLD, Validation) NIE może wykonywać obliczeń fizycznych | Architektura |
| INV-S10 | **Falownik = źródło prądowe** | InverterSource: k_sc × In (addytywny), bez impedancji w Y-bus | `inverter.py` |

### 6.9.2 Zakazy warstwy Solver (BINDING)

| Zakaz | Opis |
|---|---|
| Z-S01 | Solver NIE MOŻE modyfikować ENM |
| Z-S02 | Solver NIE MOŻE uruchomić się bez przejścia walidacji (AnalysisAvailability) |
| Z-S03 | Solver NIE MOŻE produkować wyników bez white_box_trace |
| Z-S04 | Solver NIE MOŻE używać danych solverowych zapisanych w ENM (ENM nie przechowuje danych solvera — Decyzja #1) |
| Z-S05 | Solver NIE MOŻE tworzyć/modyfikować elementów topologicznych (Bus, Branch, Switch) poza mapowaniem |
| Z-S06 | Solver NIE MOŻE pomijać kroków obliczeniowych (black-box = zakazany) |
| Z-S07 | Solver NIE MOŻE stosować niejawnych korekcji lub uproszczeń (wymóg dokumentacji) |

---

## 6.10 Mapowanie na kod — tabela referencji (AS-IS)

| Kontrakt | Plik Python | Klasa/Funkcja | Status |
|---|---|---|---|
| Mapowanie ENM→NetworkGraph | `enm/mapping.py` | `map_enm_to_network_graph()` | STABLE |
| Node | `network_model/core/node.py` | `Node`, `NodeType` | STABLE |
| LineBranch | `network_model/core/branch.py` | `LineBranch`, `LineImpedanceOverride` | STABLE |
| TransformerBranch | `network_model/core/branch.py` | `TransformerBranch` | STABLE |
| Switch | `network_model/core/switch.py` | `Switch`, `SwitchType`, `SwitchState` | STABLE |
| InverterSource | `network_model/core/inverter.py` | `InverterSource`, `ConverterKind` | STABLE |
| NetworkGraph | `network_model/core/graph.py` | `NetworkGraph` | STABLE |
| Y-bus Builder | `network_model/core/ybus.py` | `AdmittanceMatrixBuilder` | STABLE |
| SC Solver | `network_model/solvers/short_circuit_iec60909.py` | `ShortCircuitResult`, `EXPECTED_SHORT_CIRCUIT_RESULT_KEYS` | STABLE (Frozen API) |
| SC Contributions | `network_model/solvers/short_circuit_contributions.py` | `ShortCircuitSourceContribution`, `ShortCircuitBranchContribution` | STABLE |
| PF Solver | `network_model/solvers/power_flow_newton.py` | `PowerFlowNewtonSolution`, `PowerFlowInput` | STABLE (Frozen API) |
| Catalog Resolver | `network_model/catalog/resolver.py` | `resolve_line_params()`, `resolve_transformer_params()`, `ParameterSource` | STABLE |

---

## 6.11 Luki i sekcje TO-BE

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji.

### 6.11.1 GAP: Mapowanie Generator(falownik) → InverterSource (Decyzja #14)

- **Stan AS-IS:** Generator z `gen_type ∈ {pv_inverter, wind_inverter, bess}` mapowany jako P/Q adjustment na Node (jak synchroniczny)
- **Stan docelowy:** Generator falownikowy → `InverterSource` w NetworkGraph (dla SC), z parametrami z katalogu `ConverterType`/`InverterType`
- **Wpływ:** Solver SC nie otrzymuje wkładu falownikowego z ENM — `InverterSource` tworzone wyłącznie programowo (testy, API)
- **Plik do modyfikacji:** `enm/mapping.py`

### 6.11.2 GAP: Scenariusz dual z/bez OZE w solverze SC (Decyzja #22)

- **Stan AS-IS:** Solver SC nie posiada jawnego mechanizmu scenariusza „z OZE" vs „bez OZE"
- **Stan docelowy:** Dwa przebiegi SC: (1) z wkładem InverterSource, (2) bez (falownik odłączony)
- **Plik do modyfikacji:** `short_circuit_iec60909.py`

### 6.11.3 GAP: Składowe zerowe (Z₀) w solverze zwarciowym (Decyzja #43)

- **Stan AS-IS:** Parametry zerowe (`r0`, `x0`, `b0`) mapowane z ENM, ale ignorowane przez solver składowej dodatniej
- **Stan docelowy:** Solver zwarć asymetrycznych (1F, 2F+G) wymaga macierzy Y₀ i Z₀
- **Wpływ:** Wymaga nowego `AdmittanceMatrixBuilder` dla składowej zerowej

**DOPRECYZOWANIE ZAKRESU:**
> Brak obsługi składowych zerowych (Z₀, Y₀, uziemień) jest ŚWIADOMYM ograniczeniem
> aktualnego zakresu solverów. Solver AS-IS operuje wyłącznie na składowej symetrycznej
> dodatniej (Y₁, Z₁). Wyniki zwarć asymetrycznych (1F, 2F+G) są poprawne wyłącznie
> w zakresie składowej dodatniej — pełna analiza wymaga implementacji TO-BE.

**ZASADA ROZWOJOWA:**
> Implementacja składowych zerowych będzie realizowana jako osobny etap specyfikacji
> i NIE MOŻE być częściowa ani domyślna. Wymaga:
> - osobnej macierzy Y₀ z uwzględnieniem grup połączeń transformatorów i uziemień,
> - osobnej macierzy Y₂ (dla większości elementów SN: Y₂ = Y₁),
> - rozszerzenia kontraktu wynikowego o prądy składowych (I₁, I₂, I₀),
> - ADR przed implementacją.

### 6.11.4 GAP: Gałąź magnesująca transformatora w Y-bus (Decyzja #44)

- **Stan AS-IS:** Transformator modelowany wyłącznie impedancją zwarcia (bez `i0_percent`, `p0_kw` w Y-bus)
- **Stan docelowy:** Pełny model T/π transformatora z gałęzią magnesującą (Y_m = G_Fe + jB_μ)
- **Wpływ:** Dokładniejsze obliczenia PF (straty jałowe transformatora)

---

## 6.12 Podsumowanie rozdziału

| Aspekt | Status | Pokrycie |
|---|---|---|
| Byty obliczeniowe (Node, LineBranch, TransformerBranch, Switch, InverterSource) | AS-IS | 100% |
| Mapowanie ENM → NetworkGraph | AS-IS | ~90% (brak Generator→InverterSource) |
| Macierz admitancyjna Y-bus | AS-IS | 100% (składowa dodatnia) |
| Frozen API — ShortCircuitResult (21 pól) | AS-IS | 100% |
| Frozen API — PowerFlowNewtonSolution (30+ pól) | AS-IS | 100% |
| White Box Trace | AS-IS | 100% |
| Składowe zerowe (Z₀) | TO-BE | 0% |
| Generator → InverterSource mapping | TO-BE | 0% |
| Scenariusz dual SC (z/bez OZE) | TO-BE | 0% |

---

## 6.13 Definition of Done — kryteria domknięcia rozdziału (BINDING)

Rozdział 6 jest kanonicznie domknięty, jeżeli spełnione są WSZYSTKIE poniższe warunki:

1. **Solver ≠ Protection:** Nie istnieje żadna interpretacja, w której solver „wie" cokolwiek o zabezpieczeniach — solver NIE zna nastaw, charakterystyk, logiki selektywności ani aparatury łączeniowej.
2. **InverterSource ∉ Y-bus:** InverterSource nigdy nie trafia do macierzy admitancyjnej Y-bus w żadnym solverze stacjonarnym — jest wyłącznie addytywnym źródłem prądowym.
3. **Station ∉ Solver:** Station / Substation nie wpływa na żadne obliczenie — nie determinuje SLACK, bazy napięciowej, konfiguracji solvera ani walidacji grafu.
4. **White Box kompletny:** Każdy element solverowy (Node, LineBranch, TransformerBranch, Switch, InverterSource) jest audytowalny przez White Box — ślad obliczeniowy zawiera wszystkie kroki od danych wejściowych do wyniku.
5. **Węzeł wirtualny ukryty:** Węzeł wirtualny źródła istnieje wyłącznie w warstwie NetworkGraph i nie jest eksponowany do ENM, UI ani SLD.
6. **Frozen API gwarantowane:** Zbiory `EXPECTED_SHORT_CIRCUIT_RESULT_KEYS` i pola `PowerFlowNewtonSolution` są zamrożone — zmiana wymaga major version bump.

**DOMENA KONTRAKTÓW SOLVERÓW I MAPOWANIA ENM→MODEL OBLICZENIOWY W ROZDZIALE 6 JEST ZAMKNIĘTA (v1.1 SUPPLEMENT).**

---

**KONIEC ROZDZIAŁU 6**

