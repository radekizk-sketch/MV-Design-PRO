# Porty i endpointy — kontrakt kanoniczny

**Status:** kanon BINDING — implementacja w PR-3 i PR-4
**Wersja:** v1.0

---

## 1. Cel

Każdy odcinek elektryczny (kabel SN, linia napowietrzna SN, połączenie wewnętrzne stacji) musi mieć dwa **porty techniczne** jako endpointy. Endpoint = adres wewnątrz konkretnego obiektu (Bay, Substation, Source, Generator, Load), nie obiekt sam w sobie.

Bieżący stan: ENM ma model `Bay` i `BayPrimaryDevice`, ale nie ma jawnej klasy `Port`. Endpointy kabli czepiają się ikony stacji.

Cel rebuild-u: jawny `PortRef` w ENM i SLD, egzekwowany przez walidator i renderer.

---

## 2. Model portu (ENM, PR-3)

```python
# backend/src/enm/models.py (rozszerzenie addytywne)

class PortKind(str, Enum):
    SN_INPUT = "sn_input"            # wejście SN do stacji
    SN_OUTPUT = "sn_output"          # wyjście SN ze stacji
    SN_BRANCH = "sn_branch"          # odgałęzienie SN
    SN_TRANSFORMER = "sn_transformer"  # port pola transformatorowego
    SN_MEASUREMENT = "sn_measurement"  # port pola pomiarowego
    SN_DER_PV = "sn_der_pv"          # port pola PV po SN
    SN_DER_BESS = "sn_der_bess"      # port pola BESS po SN
    SN_DER_FW = "sn_der_fw"          # port pola FW po SN
    SN_COUPLER = "sn_coupler"        # port sprzęgła
    SN_RESERVE = "sn_reserve"        # pole rezerwowe
    NN_FEEDER = "nn_feeder"          # odpływ nN
    NN_LOAD = "nn_load"              # przyłącze odbiorcze nN
    NN_DER_PV = "nn_der_pv"          # PV po nN
    NN_DER_BESS = "nn_der_bess"      # BESS po nN
    NN_DER_FW = "nn_der_fw"          # FW po nN

class Port(BaseModel):
    id: str                          # 'sub_001:bay_3:sn_output'
    kind: PortKind
    nominal_voltage_kv: float
    bay_ref: str | None              # należy do pola
    substation_ref: str              # należy do stacji
    occupied_by: str | None          # ref do segmentu kabla/linii lub None

class PortRef(BaseModel):
    port_id: str                     # adres portu
```

W `Bay`:
```python
class Bay(BaseModel):
    ...
    ports: list[Port] = []           # lista portów pola
```

W `Substation`:
```python
class Substation(BaseModel):
    ...
    external_ports: list[Port] = []  # porty zewnętrzne stacji jako sumy portów pól
```

---

## 3. Endpointy odcinków

```python
class CableSegment(Branch):
    ...
    endpoint_a: PortRef
    endpoint_b: PortRef

class OverheadLineSegment(Branch):
    ...
    endpoint_a: PortRef
    endpoint_b: PortRef
```

**Inwariant:** każdy normalny odcinek ma `endpoint_a` i `endpoint_b`. Brak portu blokuje **gotowość obliczeń**, NIE blokuje renderingu — ghost line z markerem `missing_data_marker`.

---

## 4. Model portu w SLD (PR-4)

Plik: `frontend/src/ui/sld/core/ports.ts`.

```ts
export type PortKind =
  | 'sn_input' | 'sn_output' | 'sn_branch' | 'sn_transformer'
  | 'sn_measurement' | 'sn_der_pv' | 'sn_der_bess' | 'sn_der_fw'
  | 'sn_coupler' | 'sn_reserve'
  | 'nn_feeder' | 'nn_load' | 'nn_der_pv' | 'nn_der_bess' | 'nn_der_fw';

export interface SldPort {
  readonly id: string;
  readonly kind: PortKind;
  readonly nominalVoltageKv: number;
  readonly bayRef: string | null;
  readonly substationRef: string;
  /** Współrzędne portu względem stacji w world space (deterministyczne). */
  readonly anchor: { x: number; y: number };
}

export interface SldPortResolver {
  /** Zwraca listę portów dla obiektu domenowego. */
  getPorts(elementRef: ElementRef): readonly SldPort[];
  /** Rozwiązuje PortRef → SldPort (z anchor). */
  resolve(portRef: PortRef): SldPort;
}
```

---

## 5. Reguły walidacji (BINDING)

1. Każdy `CableSegment` / `OverheadLineSegment` musi mieć `endpoint_a` i `endpoint_b`.
2. Port może być `occupied_by` co najwyżej **jeden** segment (cykl pojedynczego przyłączenia, brak rozgałęzień na porcie).
3. Rozgałęzienie wymaga `BranchPoint` (punkt rozgałęzienia) jako węzła pośredniego z trzema portami.
4. Typ portu musi być spójny z typem pola (`sn_transformer` ↔ pole transformatorowe).
5. Napięcie portu musi być spójne z napięciem szyny i obiektem podłączonym (np. PV po nN ⇒ port `nn_der_pv` o `nominal_voltage_kv = U_nN`).
6. Zmiana typu pola = walidacja portów.

Walidator: `enm/validator.py` (rozszerzenie w PR-3) + `frontend/.../core/sldSemanticValidator.ts` (PR-4).

---

## 6. Typ topologiczny stacji wynika z portów

| Liczba i typ portów SN stacji | Typ topologiczny |
|---|---|
| 1× `sn_input` | końcowa |
| 1× `sn_input` + 1× `sn_output` | przelotowa |
| 1× `sn_input` + 1× `sn_output` + ≥1× `sn_branch` | odgałęźna |
| ≥2× porty z aktywnym sprzęgłem/NOP | sekcyjna |

Implementacja w `application/sld/topology_classifier.py` (PR-5).

---

## 7. Backward compatibility

Pola `ports` na `Bay` i `endpoint_a/b` na segmentach są **opcjonalne** w fazie migracji (PR-3 dodaje, PR-4 wymaga, PR-5 egzekwuje walidator).

Przed PR-4: brak portu → segment renderuje się w trybie ghost z markerem `missing_data_marker`, gotowość blokowana.

---

**Koniec dokumentu.**
