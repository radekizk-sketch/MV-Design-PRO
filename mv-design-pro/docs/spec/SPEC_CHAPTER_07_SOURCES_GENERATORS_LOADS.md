> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Rozdział 7 — Model Źródeł, Generatorów i Odbiorów (Source / Generator / Load)

**Wersja:** 1.1
**Status:** AS-IS (z sekcjami TO-BE jawnie oznaczonymi)
**Warstwa:** ENM Domain + Solver Mapping + Validation
**Zależności:** Rozdział 2 (ENM Domain Model), Rozdział 5 (Kontrakty Kanoniczne), Rozdział 6 (Solver Contracts & Mapping)
**Decision Matrix:** Decyzje #3, #11, #12, #13, #14, #15, #17, #19 (AUDIT_SPEC_VS_CODE.md)
**Kod źródłowy:** `enm/models.py`, `enm/mapping.py`, `enm/validator.py`, `network_model/core/inverter.py`, `network_model/catalog/types.py`, `network_model/solvers/short_circuit_iec60909.py`

---

## §7.0 — Zakres i cel rozdziału

### §7.0.1 Cel

Niniejszy rozdział definiuje **kanoniczny kontrakt trzech bytów energetycznych ENM** odpowiedzialnych za bilans mocy w sieci:

| Byt ENM | Rola fizyczna | Konwencja znaku P/Q |
|---------|---------------|---------------------|
| **Source** | Zasilanie zewnętrzne (sieć nadrzędna) | Nie dotyczy (SLACK) |
| **Generator** | Źródło generacji wewnętrznej (synchroniczna, OZE, BESS) | P > 0, Q > 0 (oddaje) |
| **Load** | Odbiór mocy czynnej i biernej | P > 0, Q > 0 (pobiera) |

Rozdział opisuje:
- Pełną definicję Pydantic v2 każdego bytu (1:1 z kodem)
- Semantykę fizyczną pól i jednostek
- Reguły mapowania na model obliczeniowy (NetworkGraph)
- Kontrakt solverowy (co solver widzi i jak interpretuje)
- Reguły walidacji (kody E/W/I)
- Inwarianty architektoniczne i zakazy

### §7.0.2 Zasada fundamentalna: Source ≠ Generator ≠ Load

**Decyzja #3 — BINDING:**

> Source, Generator i Load są **trzema rozłącznymi bytami ENM**. Żaden byt nie może pełnić roli innego.

| Cecha | Source | Generator | Load |
|-------|--------|-----------|------|
| Natura fizyczna | Sieć zewnętrzna (Thevenin / grid) | Maszyna wytwórcza | Odbiór |
| Model solverowy | Impedancja źródłowa + SLACK | P/Q injection (PF) / InverterSource (SC) | P/Q consumption |
| Mapowanie na Node | Bus → NodeType.SLACK | P/Q addition na Node | P/Q subtraction na Node |
| Y-bus | Virtual Ground Node + LineBranch(Z_source) | Brak w Y-bus (addytywny) | Brak w Y-bus (addytywny) |
| Wymagane do SC | TAK (impedancja źródłowa) | Opcjonalnie (InverterSource) | NIE |
| Wymagane do PF | TAK (referencja napięciowa) | Opcjonalnie (P/Q) | Opcjonalnie (P/Q) |

### §7.0.3 Referencje do wcześniejszych rozdziałów

- **Rozdział 6 §6.3** — byty obliczeniowe (Node, LineBranch, InverterSource)
- **Rozdział 6 §6.4** — reguły mapowania ENM → NetworkGraph
- **Rozdział 6 §6.5** — budowa macierzy Y-bus
- **Rozdział 6 §6.6** — Frozen Result API (pola `ik_thevenin_a`, `ik_inverters_a`, `ik_total_a`)
- **Rozdział 5 §5.13–§5.19** — katalogi typów (ConverterType, InverterType)

---

## §7.1 — Zasada kanoniczna

### §7.1.1 Trzy byty, trzy role, zero nakładania

System MV-DESIGN-PRO modeluje bilans energetyczny sieci przez trzy niezależne byty:

```
Source (zasilanie)      Generator (generacja)      Load (odbiór)
       │                        │                        │
       ▼                        ▼                        ▼
   Bus (SLACK)              Bus (PQ)                 Bus (PQ)
       │                        │                        │
       ▼                        ▼                        ▼
  Z_source → Y-bus      P/Q → Node (PF)         P/Q → Node (PF)
  Virtual GND Node      InverterSource (SC)      — (brak roli SC)
```

### §7.1.2 Konwencja znaków (BINDING)

Mapowanie `enm/mapping.py` stosuje następującą konwencję znaków na węźle:

```python
# Load: P/Q ODEJMOWANE od węzła (odbiór = ujemne injection)
bus_p[load.bus_ref] = bus_p.get(load.bus_ref, 0.0) - load.p_mw
bus_q[load.bus_ref] = bus_q.get(load.bus_ref, 0.0) - load.q_mvar

# Generator: P/Q DODAWANE do węzła (generacja = dodatnie injection)
bus_p[gen.bus_ref] = bus_p.get(gen.bus_ref, 0.0) + gen.p_mw
bus_q[gen.bus_ref] = bus_q.get(gen.bus_ref, 0.0) + (gen.q_mvar or 0.0)
```

**Kod AS-IS:** `enm/mapping.py:54–59`

### §7.1.3 Akumulacja P/Q na węźle

Na jednym Bus może być wiele Load i/lub Generator. Mapowanie akumuluje P/Q addytywnie:

$$P_{node} = \sum_{g \in G} P_g - \sum_{l \in L} P_l$$

$$Q_{node} = \sum_{g \in G} Q_g - \sum_{l \in L} Q_l$$

gdzie $G$ = zbiór generatorów na danym Bus, $L$ = zbiór odbiorów na danym Bus.

---

## §7.2 — Source (Sieć Zewnętrzna)

### §7.2.1 Definicja

Source modeluje **punkt zasilania z sieci nadrzędnej** (external grid). W terminologii IEC 60909 jest to **zastępcze źródło napięciowe** o impedancji $Z_Q$ wyznaczonej z mocy zwarciowej $S''_k$ lub bezpośrednio z $R + jX$.

**Odpowiednik benchmark:** External Grid (ElmXnet)

### §7.2.2 Kontrakt Pydantic v2 — AS-IS

```python
class Source(ENMElement):
    bus_ref: str
    model: Literal["thevenin", "short_circuit_power", "external_grid"]
    sk3_mva: float | None = None
    ik3_ka: float | None = None
    r_ohm: float | None = None
    x_ohm: float | None = None
    rx_ratio: float | None = None
    r0_ohm: float | None = None
    x0_ohm: float | None = None
    z0_z1_ratio: float | None = None
    c_max: float | None = None
    c_min: float | None = None
```

**Kod AS-IS:** `enm/models.py:180–192`
**Dziedziczy z:** `ENMElement` (id: UUID, ref_id: str, name: str, tags: list[str], meta: dict)

### §7.2.3 Semantyka pól

| Pole | Typ | Jednostka | Opis | Wymagalność |
|------|-----|-----------|------|-------------|
| `bus_ref` | str | — | Referencja do Bus, na którym Source jest przyłączony | **OBOWIĄZKOWE** |
| `model` | Literal | — | Typ modelu impedancyjnego (patrz §7.2.4) | **OBOWIĄZKOWE** |
| `sk3_mva` | float? | MVA | Moc zwarciowa trójfazowa $S''_{k3}$ | Wymagane jeśli brak R/X |
| `ik3_ka` | float? | kA | Prąd zwarciowy trójfazowy $I''_{k3}$ | Alternatywa do $S''_k$ |
| `r_ohm` | float? | Ω | Rezystancja zastępcza źródła $R_Q$ | Wymagane jeśli brak $S''_k$ |
| `x_ohm` | float? | Ω | Reaktancja zastępcza źródła $X_Q$ | Wymagane jeśli brak $S''_k$ |
| `rx_ratio` | float? | — | Stosunek $R/X$ impedancji źródła | Opcjonalne (default: 0.1) |
| `r0_ohm` | float? | Ω | Rezystancja zerowa źródła $R_{0Q}$ | Opcjonalne |
| `x0_ohm` | float? | Ω | Reaktancja zerowa źródła $X_{0Q}$ | Opcjonalne |
| `z0_z1_ratio` | float? | — | Stosunek impedancji zerowej do składowej dodatniej | Opcjonalne |
| `c_max` | float? | — | Współczynnik napięciowy IEC 60909 (max) | Opcjonalne |
| `c_min` | float? | — | Współczynnik napięciowy IEC 60909 (min) | Opcjonalne |

### §7.2.4 Modele impedancji Source

Source posiada trzy warianty modelu (`model` field):

| Model | Opis | Parametry wymagane |
|-------|------|--------------------|
| `thevenin` | Zastępczy obwód Thevenina z jawną impedancją | `r_ohm`, `x_ohm` |
| `short_circuit_power` | Obliczenie impedancji z mocy zwarciowej | `sk3_mva` + opcjonalnie `rx_ratio` |
| `external_grid` | Ogólny model sieci zewnętrznej | `sk3_mva` lub (`r_ohm`, `x_ohm`) |

**Uwaga AS-IS:** W obecnej implementacji mappera (`enm/mapping.py:209–217`) rozróżnienie między modelami nie wpływa na algorytm obliczenia impedancji — mapper zawsze sprawdza najpierw `r_ohm`/`x_ohm`, a jeśli brak — oblicza z `sk3_mva`.

### §7.2.5 Obliczenie impedancji źródła — algorytm AS-IS

Mapper (`enm/mapping.py:209–217`) realizuje następujący algorytm obliczania impedancji:

```
JEŚLI source.r_ohm ≠ None AND source.x_ohm ≠ None:
    R = source.r_ohm
    X = source.x_ohm
W PRZECIWNYM RAZIE JEŚLI source.sk3_mva > 0:
    Z = Un² / Sk''₃                    [Ω]
    rx = source.rx_ratio (default 0.1)
    X = Z / √(1 + rx²)                [Ω]
    R = X × rx                         [Ω]
W PRZECIWNYM RAZIE:
    Source POMIJANY (R=0, X=0 → brak gałęzi)
```

Gdzie:
- $U_n$ = `bus.voltage_kv` (napięcie znamionowe szyny przyłączenia) [kV]
- $S''_{k3}$ = `source.sk3_mva` [MVA]

**Wzory IEC 60909:**

$$Z_Q = \frac{U_n^2}{S''_{k3}} \quad [\Omega]$$

$$X_Q = \frac{Z_Q}{\sqrt{1 + (R/X)^2}} \quad [\Omega]$$

$$R_Q = X_Q \cdot \frac{R}{X} \quad [\Omega]$$

### §7.2.6 Mapowanie Source → NetworkGraph (AS-IS)

Source jest mapowany na **dwa elementy** modelu obliczeniowego:

```
┌─────────────────────┐
│  Virtual Ground Node │   Node(id=UUID5("_gnd_{ref_id}"),
│  (GND)               │        type=PQ, P=0, Q=0,
│                      │        voltage_level=bus.voltage_kv)
└──────────┬──────────┘
           │
    LineBranch(Z_source)     LineBranch(id=UUID5("_zsrc_{ref_id}"),
           │                        R=r_ohm, X=x_ohm,
           │                        B=0, length_km=1.0)
           │
┌──────────▼──────────┐
│  Bus (SLACK)         │   Node(id=UUID5(bus.ref_id),
│  Source Bus           │        type=SLACK,
│                      │        v_mag=1.0 pu, θ=0.0 rad)
└─────────────────────┘
```

**Reguły mapowania (BINDING, Decyzja #45):**

1. Bus z przyłączonym Source → `NodeType.SLACK` (v_mag=1.0, angle=0.0)
2. Tworzony jest wirtualny węzeł uziemienia `_gnd_{ref_id}` (PQ, P=0, Q=0)
3. Gałąź impedancyjna `_zsrc_{ref_id}` łączy GND → Bus (R=r_ohm, X=x_ohm, B=0)
4. `length_km=1.0` (impedancja absolutna, nie per-km)
5. Jeśli impedancja zerowa (R=0 AND X=0) → Source jest pomijany

**Kod AS-IS:** `enm/mapping.py:191–248`

### §7.2.7 Pola niewykorzystywane przez mapper (AS-IS)

| Pole | Status w mapperze | Komentarz |
|------|-------------------|-----------|
| `ik3_ka` | **NIEUŻYWANE** | Validator sprawdza jako alternatywę (E008), mapper nie przetwarza |
| `c_max` | **NIEUŻYWANE** | Solver SC sam stosuje c_factor z opcji obliczeń |
| `c_min` | **NIEUŻYWANE** | j.w. |
| `r0_ohm` | **NIEUŻYWANE** | Składowa zerowa — TO-BE (Decyzja #43) |
| `x0_ohm` | **NIEUŻYWANE** | j.w. |
| `z0_z1_ratio` | **NIEUŻYWANE** | j.w. |

> **GAP AS-IS:** `ik3_ka` jest walidowane (E008) ale nie jest używane do obliczenia impedancji w mapperze. Konwersja $I''_{k3}$ → $Z_Q$ (via $Z = c \cdot U_n / (\sqrt{3} \cdot I''_{k3})$) nie jest zaimplementowana.

### §7.2.8 Walidacja Source

| Kod | Severity | Warunek | Komunikat (pl) |
|-----|----------|---------|-----------------|
| **E001** | BLOCKER | `len(enm.sources) == 0` | Brak źródła zasilania w modelu sieci |
| **E008** | BLOCKER | Source bez $S''_k$, $I''_k$ ani $R+jX$ | Źródło '{ref_id}' nie ma parametrów zwarciowych |
| **W002** | IMPORTANT | Brak $Z_0$ (r0/x0 i z0_z1_ratio = None) | Źródło '{ref_id}' nie ma składowej zerowej — zwarcia 1F/2F-Z niedostępne |

**Kod AS-IS:** `enm/validator.py:84–91` (E001), `enm/validator.py:165–187` (E008), `enm/validator.py:211–227` (W002)

### §7.2.9 Inwarianty Source (BINDING)

| ID | Inwariant | Kod |
|----|-----------|-----|
| **INV-SRC-01** | Każdy model sieci MUSI mieć ≥1 Source | E001 |
| **INV-SRC-02** | Source MUSI mieć parametry impedancyjne ($S''_k$ lub $R+jX$ lub $I''_k$) | E008 |
| **INV-SRC-03** | Bus z Source → NodeType.SLACK (v_mag=1.0 pu) | `mapping.py:73–83` |
| **INV-SRC-04** | Source nie wnosi P/Q do węzła (SLACK bilansuje niezależnie) | `mapping.py:81–82` |
| **INV-SRC-05** | Source produkuje Virtual Ground Node + impedancyjny LineBranch w NetworkGraph | `mapping.py:222–248` |

---

## §7.3 — Generator (Źródło Generacji Wewnętrznej)

### §7.3.1 Definicja

Generator modeluje **wewnętrzne źródło generacji** przyłączone do sieci. Obejmuje zarówno maszyny synchroniczne jak i źródła energoelektroniczne (falownikowe).

**Odpowiednik benchmark:** Synchronous Machine (ElmSym) / Static Generator (ElmGenstat)

### §7.3.2 Kontrakt Pydantic v2 — AS-IS

```python
class Generator(ENMElement):
    bus_ref: str
    p_mw: float
    q_mvar: float | None = None
    gen_type: Literal["synchronous", "pv_inverter", "wind_inverter", "bess"] | None = None
    limits: GenLimits | None = None
```

**Kod AS-IS:** `enm/models.py:212–217`
**Dziedziczy z:** `ENMElement` (id: UUID, ref_id: str, name: str, tags: list[str], meta: dict)

### §7.3.3 Typ pomocniczy GenLimits

```python
class GenLimits(BaseModel):
    p_min_mw: float | None = None
    p_max_mw: float | None = None
    q_min_mvar: float | None = None
    q_max_mvar: float | None = None
```

**Kod AS-IS:** `enm/models.py:39–43`

### §7.3.4 Semantyka pól

| Pole | Typ | Jednostka | Opis | Wymagalność |
|------|-----|-----------|------|-------------|
| `bus_ref` | str | — | Referencja do Bus przyłączenia | **OBOWIĄZKOWE** |
| `p_mw` | float | MW | Moc czynna generowana | **OBOWIĄZKOWE** |
| `q_mvar` | float? | MVAr | Moc bierna generowana | Opcjonalne (default: 0.0) |
| `gen_type` | Literal? | — | Typ generatora (patrz §7.3.5) | Opcjonalne |
| `limits` | GenLimits? | — | Limity mocy czynnej i biernej | Opcjonalne |

### §7.3.5 Klasyfikacja typów generatora

| gen_type | Opis fizyczny | Model solverowy PF | Model solverowy SC |
|----------|---------------|--------------------|--------------------|
| `synchronous` | Maszyna synchroniczna | P/Q injection na Node | P/Q injection na Node (AS-IS) |
| `pv_inverter` | Falownik fotowoltaiczny | P/Q injection na Node | InverterSource (TO-BE, Decyzja #14) |
| `wind_inverter` | Falownik turbiny wiatrowej | P/Q injection na Node | InverterSource (TO-BE, Decyzja #14) |
| `bess` | Falownik magazynu energii (BESS) | P/Q injection na Node | InverterSource (TO-BE, Decyzja #14) |
| `None` | Niesklasyfikowany | P/Q injection na Node | P/Q injection na Node |

### §7.3.6 Mapowanie Generator → NetworkGraph (AS-IS)

W obecnej implementacji **WSZYSTKIE typy generatorów** są mapowane identycznie:

```python
# enm/mapping.py:57-59
for gen in enm.generators:
    bus_p[gen.bus_ref] = bus_p.get(gen.bus_ref, 0.0) + gen.p_mw
    bus_q[gen.bus_ref] = bus_q.get(gen.bus_ref, 0.0) + (gen.q_mvar or 0.0)
```

Generator wnosi P/Q jako **dodatnie injection** na węzeł Bus:

- `P_node += gen.p_mw`
- `Q_node += gen.q_mvar` (jeśli None → 0.0)

**Konsekwencja AS-IS:** Generator falownikowy (pv_inverter, wind_inverter, bess) jest traktowany w PF identycznie jak synchroniczny — jako P/Q injection. Rozróżnienie `gen_type` nie wpływa na algorytm mapowania.

### §7.3.7 Generator a InverterSource — relacja architektoniczna

System posiada **dwa niezależne modele** dla źródeł falownikowych:

| Warstwa | Byt | Lokalizacja |
|---------|-----|-------------|
| ENM (domena) | `Generator(gen_type=pv_inverter\|wind_inverter\|bess)` | `enm/models.py` |
| Solver (obliczenia) | `InverterSource` | `network_model/core/inverter.py` |

**Stan AS-IS:**
- Mapper (`enm/mapping.py`) NIE tworzy InverterSource z Generator
- InverterSource może być dodany do NetworkGraph ręcznie lub przez przyszły mapper
- Solver SC (`short_circuit_iec60909.py`) sprawdza `graph.get_inverter_sources()` niezależnie

> **TO-BE (Decyzja #14):** Mapper powinien rozpoznawać `gen_type ∈ {pv_inverter, wind_inverter, bess}` i tworzyć odpowiedni `InverterSource` w NetworkGraph. Wymaga rozszerzenia `mapping.py`.

### §7.3.8 InverterSource — kontrakt solverowy (AS-IS)

```python
@dataclass
class InverterSource:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = field(default="")
    node_id: str = field(default="")
    type_ref: str | None = field(default=None)
    converter_kind: ConverterKind | None = field(default=None)
    in_rated_a: float = field(default=0.0)
    k_sc: float = field(default=1.1)
    contributes_negative_sequence: bool = field(default=False)
    contributes_zero_sequence: bool = field(default=False)
    in_service: bool = field(default=True)

    @property
    def ik_sc_a(self) -> float:
        return self.k_sc * self.in_rated_a
```

**Kod AS-IS:** `network_model/core/inverter.py:12–36`

### §7.3.9 Semantyka pól InverterSource

| Pole | Typ | Jednostka | Opis |
|------|-----|-----------|------|
| `id` | str | — | UUID identyfikator |
| `name` | str | — | Nazwa wyświetlana |
| `node_id` | str | — | ID węzła (Node) przyłączenia w NetworkGraph |
| `type_ref` | str? | — | Referencja do ConverterType/InverterType w katalogu |
| `converter_kind` | ConverterKind? | — | Rodzaj konwertera: PV, WIND, BESS |
| `in_rated_a` | float | A | Prąd znamionowy falownika $I_n$ |
| `k_sc` | float | — | Współczynnik zwarciowy IEC 60909 (default: 1.1) |
| `contributes_negative_sequence` | bool | — | Czy falownik wytwarza składową ujemną |
| `contributes_zero_sequence` | bool | — | Czy falownik wytwarza składową zerową |
| `in_service` | bool | — | Czy falownik jest w eksploatacji |

### §7.3.10 Model zwarciowy InverterSource (AS-IS)

InverterSource jest modelowany jako **ograniczone źródło prądowe** zgodnie z IEC 60909:

$$I''_{k,inv} = k_{sc} \cdot I_n \quad [A]$$

Wkład prądowy jest **addytywny** do prądu zwarciowego Thevenina:

$$I''_{k,total} = I''_{k,Th} + \sum_{inv} I''_{k,inv}$$

**Reguły per typ zwarcia (AS-IS):**

| Typ zwarcia | Warunek wkładu | Kod |
|-------------|----------------|-----|
| 3F (THREE_PHASE) | Zawsze | `ik_sc_a` |
| 2F (TWO_PHASE) | `contributes_negative_sequence == True` | `ik_sc_a` jeśli True, else 0.0 |
| 1F (SINGLE_PHASE_GROUND) | `contributes_zero_sequence == True` | `ik_sc_a` jeśli True, else 0.0 |
| 2F+G (TWO_PHASE_GROUND) | `contributes_zero_sequence == True` | `ik_sc_a` jeśli True, else 0.0 |

**Kod AS-IS:** `short_circuit_iec60909.py:426–458`

### §7.3.11 Inwariant: InverterSource NIGDY w Y-bus

**Decyzja #48 — BINDING (Rozdział 6 §6.3.5):**

> InverterSource NIE jest elementem macierzy admitancyjnej Y-bus. Wkład falownikowy jest obliczany **poza Y-bus** jako addytywna korekcja prądu zwarciowego.

Uzasadnienie: Falownik jest źródłem prądowym ograniczonym elektroniką mocy — nie posiada impedancji wewnętrznej w sensie Y-bus.

### §7.3.12 Katalogowe typy konwerterów — AS-IS

#### ConverterKind (enum)

```python
class ConverterKind(Enum):
    PV = "PV"
    WIND = "WIND"
    BESS = "BESS"
```

**Kod AS-IS:** `network_model/catalog/types.py:457–460`

#### ConverterType (frozen dataclass, 13 pól)

```python
@dataclass(frozen=True)
class ConverterType:
    id: str
    name: str
    kind: ConverterKind
    un_kv: float
    sn_mva: float
    pmax_mw: float
    qmin_mvar: Optional[float] = None
    qmax_mvar: Optional[float] = None
    cosphi_min: Optional[float] = None
    cosphi_max: Optional[float] = None
    e_kwh: Optional[float] = None          # BESS only
    manufacturer: Optional[str] = None
    model: Optional[str] = None
```

**Kod AS-IS:** `network_model/catalog/types.py:463–497`

#### InverterType (frozen dataclass, 11 pól)

```python
@dataclass(frozen=True)
class InverterType:
    id: str
    name: str
    un_kv: float
    sn_mva: float
    pmax_mw: float
    qmin_mvar: Optional[float] = None
    qmax_mvar: Optional[float] = None
    cosphi_min: Optional[float] = None
    cosphi_max: Optional[float] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
```

**Kod AS-IS:** `network_model/catalog/types.py:561–591`

#### Różnice ConverterType vs InverterType

| Pole | ConverterType | InverterType |
|------|---------------|--------------|
| `kind` (ConverterKind) | **TAK** | NIE |
| `e_kwh` (pojemność BESS) | **TAK** | NIE |

ConverterType posiada jawne rozróżnienie PV/WIND/BESS. InverterType jest neutralny technologicznie.

### §7.3.13 Topologia OZE — kanoniczna struktura fizyczna (BINDING)

**Decyzja #11, #12 — BINDING (Rozdział 2 §2.17):**

Generator energoelektroniczny (gen_type ∈ {pv_inverter, wind_inverter, bess}) jest **ZAWSZE** elementem niskonapięciowym (nn). Przyłączenie do sieci SN wymaga jawnego transformatora:

```
N × Generator (falownik, nn)
│
Bus nn źródła (napięcie z typu katalogowego)
│
Pole źródłowe nn (łączniki + zabezpieczenia)
│
Bus nn stacji
│
Transformator nn/SN
│
Bus SN stacji
```

**Zakazy topologiczne:**
- Generator falownikowy na Bus SN (voltage_kv > 1 kV) → **NIEDOZWOLONE**
- Generator falownikowy bez toru fizycznego nn → transformator → SN → **NIEDOZWOLONE**

> **TO-BE:** Walidacja E009 (BLOCKER: falownik na szynie SN) i E010 (BLOCKER: brak transformatora nn/SN) — nie zaimplementowane w obecnym kodzie `validator.py`.

### §7.3.14 Jednostki równoległe (n_parallel)

**Decyzja #17 — TO-BE:**

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji.

Docelowo Generator falownikowy będzie posiadał pole `n_parallel: int` określające liczbę identycznych falowników pracujących równolegle.

Model solverowy:
- SC: $I''_{k,total} = n_{parallel} \cdot k_{sc} \cdot I_n$
- PF: $P_{total} = n_{parallel} \cdot P_{unit}$, $Q_{total} = n_{parallel} \cdot Q_{unit}$

**Stan AS-IS:** Brak pola `n_parallel` w klasie Generator. Wielokrotne falowniki modelowane jako osobne instancje Generator.

### §7.3.15 Generator.limits — semantyka i wykorzystanie

`GenLimits` definiuje zakres mocy czynnej i biernej generatora:

| Pole | Opis | Zastosowanie AS-IS |
|------|------|--------------------|
| `p_min_mw` | Minimalna moc czynna | **NIEUŻYWANE** przez solver |
| `p_max_mw` | Maksymalna moc czynna | **NIEUŻYWANE** przez solver |
| `q_min_mvar` | Minimalna moc bierna | **NIEUŻYWANE** przez solver |
| `q_max_mvar` | Maksymalna moc bierna | **NIEUŻYWANE** przez solver |

> **GAP AS-IS:** Limity nie są egzekwowane ani przez mapper, ani przez solver PF (brak PV→PQ switching opartego na GenLimits). Solver PF posiada mechanizm `pv_to_pq_switches` ale nie jest zasilany z GenLimits.

### §7.3.16 Brak catalog_ref na Generator (AS-IS)

**Stan AS-IS:** Klasa Generator NIE posiada pola `catalog_ref`. Brak referencji do ConverterType/InverterType.

> **TO-BE (Decyzja #15):** Dodanie `catalog_ref: str | None = None` do Generator, umożliwiające powiązanie z ConverterType/InverterType. Resolver powinien rozstrzygać parametry znamionowe z katalogu.

### §7.3.17 Konwencja znaku BESS (BINDING)

BESS (Battery Energy Storage System) może zarówno **oddawać** jak i **pobierać** moc:

| Tryb | P | Q | Konwencja |
|------|---|---|-----------|
| Rozładowanie (generacja) | P > 0 | Q dowolne | Standard generatorowy |
| Ładowanie (odbiór) | P < 0 | Q dowolne | Ujemne P = pobór |

**Stan AS-IS:** ENM nie rozróżnia trybu pracy BESS — pole `p_mw` może być ujemne. Mapper akumuluje `p_mw` addytywnie niezależnie od znaku.

### §7.3.18 Walidacja Generator

Obecny walidator NIE posiada dedykowanych reguł walidacji generatora.

| Kod | Severity | Warunek | Status |
|-----|----------|---------|--------|
| **W003** | IMPORTANT | `len(enm.loads) == 0 and len(enm.generators) == 0` | AS-IS |

**Kod AS-IS:** `enm/validator.py:230–237`

> **TO-BE:** Dodanie reguł E009 (falownik na SN), E010 (brak trafo nn/SN), walidacja GenLimits (p_min < p_max, q_min < q_max).

### §7.3.19 Inwarianty Generator (BINDING)

| ID | Inwariant | Status |
|----|-----------|--------|
| **INV-GEN-01** | Generator wnosi P/Q jako dodatnie injection na Node | AS-IS |
| **INV-GEN-02** | Generator z q_mvar=None → q_mvar traktowane jako 0.0 | AS-IS |
| **INV-GEN-03** | Generator falownikowy → ZAWSZE nn, NIGDY bezpośrednio na SN | BINDING (Decyzja #11) |
| **INV-GEN-04** | InverterSource NIGDY w Y-bus (model prądowy addytywny) | AS-IS (Decyzja #48) |
| **INV-GEN-05** | Generator(gen_type) NIE wpływa na algorytm mappera (AS-IS) | AS-IS |
| **INV-GEN-06** | Mapper Generator → InverterSource: TO-BE (Decyzja #14) | TO-BE |

---

## §7.4 — Load (Odbiór)

### §7.4.1 Definicja

Load modeluje **odbiór mocy czynnej i biernej** z sieci. W terminologii IEC jest to odbiór o znanej mocy znamionowej ($P$, $Q$) przyłączony do szyny.

**Odpowiednik benchmark:** General Load (ElmLod)

### §7.4.2 Kontrakt Pydantic v2 — AS-IS

```python
class Load(ENMElement):
    bus_ref: str
    p_mw: float
    q_mvar: float
    model: Literal["pq", "zip"] = "pq"
```

**Kod AS-IS:** `enm/models.py:200–204`
**Dziedziczy z:** `ENMElement` (id: UUID, ref_id: str, name: str, tags: list[str], meta: dict)

### §7.4.3 Semantyka pól

| Pole | Typ | Jednostka | Opis | Wymagalność |
|------|-----|-----------|------|-------------|
| `bus_ref` | str | — | Referencja do Bus przyłączenia | **OBOWIĄZKOWE** |
| `p_mw` | float | MW | Moc czynna pobierana | **OBOWIĄZKOWE** |
| `q_mvar` | float | MVAr | Moc bierna pobierana | **OBOWIĄZKOWE** |
| `model` | Literal | — | Model odbioru: PQ (stała moc) lub ZIP | Opcjonalne (default: pq) |

### §7.4.4 Model PQ vs ZIP

| Model | Opis | Status AS-IS |
|-------|------|-------------|
| `pq` | Stała moc — P i Q niezależne od napięcia | **ZAIMPLEMENTOWANY** |
| `zip` | Model impedancyjno-prądowo-mocowy (Z + I + P) | **NIEZAIMPLEMENTOWANY** |

**Stan AS-IS:** Mapper (`enm/mapping.py:54–56`) ignoruje pole `model` i zawsze traktuje Load jako PQ (stała moc):

```python
for load in enm.loads:
    bus_p[load.bus_ref] = bus_p.get(load.bus_ref, 0.0) - load.p_mw
    bus_q[load.bus_ref] = bus_q.get(load.bus_ref, 0.0) - load.q_mvar
```

> **GAP AS-IS:** Model ZIP jest zdefiniowany w Pydantic ale nie jest obsługiwany przez mapper ani solver. Brak parametrów ZIP (Zp, Zi, Pp — udziały procentowe). Jeśli użytkownik wybierze `model="zip"`, system zachowa się identycznie jak dla `model="pq"`.

### §7.4.5 Mapowanie Load → NetworkGraph (AS-IS)

Load jest mapowany jako **ujemne injection P/Q** na węzeł Bus:

```
Load(bus_ref="BUS_1", p_mw=2.5, q_mvar=1.2)
    ↓
Node("BUS_1").active_power   -= 2.5   [MW]
Node("BUS_1").reactive_power -= 1.2   [MVAr]
```

**Reguły:**
1. P Load jest **odejmowane** od P węzła (konwencja odbiornika)
2. Q Load jest **odejmowane** od Q węzła
3. Wielokrotne Load na tym samym Bus → akumulacja addytywna
4. Load NIE tworzy osobnego elementu w NetworkGraph — modyfikuje istniejący Node

### §7.4.6 Load a solver SC

Load **NIE wpływa** bezpośrednio na obliczenia zwarciowe IEC 60909:

- Solver SC operuje na macierzy Y-bus (impedancje) + wkłady InverterSource
- P/Q Load nie jest widoczne w macierzy Y-bus
- Norma IEC 60909 §1.5.2 zakłada pominięcie odbiorów w obliczeniach zwarciowych

### §7.4.7 Load a solver PF

Load jest **głównym elementem bilansu** w rozpływie mocy:

- Solver PF widzi Node z ujemnym P/Q (wynikającym z Load)
- Newton-Raphson iteruje do spełnienia bilansu mocowego na wszystkich węzłach PQ
- Straty kompensowane przez węzeł SLACK (Source)

### §7.4.8 Topologia przyłączenia odbioru (BINDING)

**Decyzja #13 — BINDING (Rozdział 2 §2.18):**

Normowa topologia przyłączenia odbioru:

```
Bus (szyna)
│
Łącznik / zabezpieczenie (SwitchBranch / FuseBranch)
│
Bus pola odpływowego
│
Load
```

**Stan AS-IS:** ENM pozwala na Load z `bus_ref` wskazującym na dowolny Bus — walidator NIE sprawdza kompletności toru przyłączenia.

> **TO-BE:** Walidacja W009 (IMPORTANT: odbiór bez kompletnego toru przyłączenia) — nie zaimplementowana.

### §7.4.9 Brak catalog_ref na Load (AS-IS)

**Stan AS-IS:** Klasa Load NIE posiada pola `catalog_ref`. Parametry odbioru (P, Q) są parametrami bilansowymi, nie konstrukcyjnymi.

**Uzasadnienie:** Load nie ma „typu katalogowego" w sensie fizycznym — moc odbioru wynika z bilansu energetycznego, nie z tabliczki znamionowej urządzenia. LoadType jest opcjonalny (nie obowiązkowy) — patrz Decyzja #40.

### §7.4.10 Walidacja Load

| Kod | Severity | Warunek | Status |
|-----|----------|---------|--------|
| **W003** | IMPORTANT | `len(enm.loads) == 0 and len(enm.generators) == 0` | AS-IS |

**Kod AS-IS:** `enm/validator.py:230–237`

### §7.4.11 Inwarianty Load (BINDING)

| ID | Inwariant | Status |
|----|-----------|--------|
| **INV-LOAD-01** | Load wnosi P/Q jako ujemne injection na Node (konwencja odbiornika) | AS-IS |
| **INV-LOAD-02** | Pole `model` jest ignorowane przez mapper (tylko PQ zaimplementowane) | AS-IS |
| **INV-LOAD-03** | Load NIE wpływa na macierz Y-bus | AS-IS |
| **INV-LOAD-04** | Load NIE wpływa na obliczenia zwarciowe SC | AS-IS |
| **INV-LOAD-05** | Wielokrotne Load na tym samym Bus → akumulacja addytywna | AS-IS |

---

## §7.5 — Relacje Source ↔ Generator ↔ Load — bilans i superpozycja

### §7.5.1 Zasada superpozycji P/Q na węźle

Na każdym węźle (Node) mapowanym z Bus, bilans P/Q wynika z superpozycji:

$$P_{node} = \underbrace{\sum_{g} P_{gen,g}}_{\text{generatory}} - \underbrace{\sum_{l} P_{load,l}}_{\text{odbiory}}$$

$$Q_{node} = \underbrace{\sum_{g} Q_{gen,g}}_{\text{generatory}} - \underbrace{\sum_{l} Q_{load,l}}_{\text{odbiory}}$$

Source NIE wnosi P/Q — SLACK bilansuje **niezależnie** przez solver.

### §7.5.2 Mapa wpływu na solver

| Byt | PF (Newton-Raphson) | SC (IEC 60909) |
|-----|---------------------|----------------|
| Source | SLACK node (v_mag, θ) + Z_source w Y-bus | Z_source → Z_bus → I''k |
| Generator (PQ) | P/Q injection na Node | Brak wpływu (AS-IS) |
| Generator (falownik) | P/Q injection na Node | InverterSource: I''k_inv = k_sc × In (TO-BE: auto-mapping) |
| Load | P/Q consumption na Node | Brak wpływu (norma IEC 60909 §1.5.2) |

### §7.5.3 Scenariusze brzegowe

| Scenariusz | Zachowanie systemu |
|------------|-------------------|
| Sieć bez Load i Generator | PF: trywialne (V=1.0 pu, P=Q=0 wszędzie). SC: poprawne (tylko Z_source). W003. |
| Sieć z wieloma Source | Każdy Source produkuje SLACK node + Z_source. Wiele referencji napięciowych. |
| Load na Bus z Source | Load modyfikuje P/Q na SLACK node. Solver PF: SLACK kompensuje. |
| Generator na Bus z Source | Generator modyfikuje P/Q na SLACK node. |
| Generator + Load na tym samym Bus | Wypadkowe: $P_{net} = P_{gen} - P_{load}$. Jeśli $P_{net} > 0$ → nadwyżka. |

---

## §7.6 — Łańcuch White Box: Source / Generator / Load

### §7.6.1 Łańcuch odtwarzalności parametrów

White Box MUSI umożliwiać pełne odtworzenie łańcucha od parametru domenowego do wyniku obliczeniowego:

```
┌─────────────────────────────────────────────────────────┐
│  1. PARAMETR DOMENOWY (ENM)                             │
│     Source: sk3_mva=250, rx_ratio=0.1                    │
│     Generator: p_mw=2.0, q_mvar=0.5, gen_type=pv_inverter│
│     Load: p_mw=3.5, q_mvar=1.8                          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  2. MAPOWANIE (mapping.py)                              │
│     Source → Z_source = R + jX (obliczone z Sk''/rx)     │
│     Source Bus → SLACK (v=1.0, θ=0.0)                    │
│     Generator → P/Q += (p_mw, q_mvar) na Node            │
│     Load → P/Q -= (p_mw, q_mvar) na Node                 │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  3. MODEL OBLICZENIOWY (NetworkGraph)                   │
│     Node(BUS_1): SLACK, v=1.0                            │
│     Node(BUS_2): PQ, P=-1.5, Q=-1.3                     │
│     LineBranch(Z_source): R=0.0176, X=0.1759             │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  4. SOLVER (SC / PF)                                    │
│     SC: Y-bus → Z-bus → Zkk → Ik'' = c·Un/√3/|Zkk|     │
│         + InverterSource: Ik_inv = k_sc × In             │
│     PF: Newton-Raphson → |V|, θ per node                 │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  5. WYNIK (Frozen API)                                  │
│     SC: ikss_a, ip_a, ith_a, ik_thevenin_a,             │
│         ik_inverters_a, ik_total_a                        │
│     PF: node_voltage, branch_current, losses_total       │
└─────────────────────────────────────────────────────────┘
```

### §7.6.2 Traceability per byt

| Byt | Widoczność w White Box SC | Widoczność w White Box PF |
|-----|--------------------------|--------------------------|
| Source | Z_source (R, X), c_factor, Un, Zkk | SLACK node, P_slack, Q_slack |
| Generator | — (brak wpływu AS-IS) lub InverterSource.ik_sc_a | P/Q injection, bilans |
| Load | — (brak wpływu) | P/Q consumption, bilans |

---

## §7.7 — Zakazy i anty-wzorce

### §7.7.1 Zakazy architektoniczne (BINDING)

| ID | Zakaz | Uzasadnienie |
|----|-------|-------------|
| **Z-SGL-01** | Source NIE MOŻE być używany jako Generator (i odwrotnie) | Decyzja #3: rozłączne byty |
| **Z-SGL-02** | Load NIE MOŻE mieć ujemnego P (to rola Generatora) | Konwencja odbiornika: Load.p_mw ≥ 0 |
| **Z-SGL-03** | Generator falownikowy NIE MOŻE być przyłączony do szyny SN (voltage_kv > 1 kV) | Decyzja #11: falownik = nn |
| **Z-SGL-04** | Source NIE MOŻE wnosić P/Q do bilansu węzła | SLACK bilansuje niezależnie |
| **Z-SGL-05** | InverterSource NIE MOŻE być elementem macierzy Y-bus | Decyzja #48: model prądowy |
| **Z-SGL-06** | Mapper NIE MOŻE rozróżniać gen_type dla algorytmu P/Q injection (AS-IS) | Mapowanie identyczne dla wszystkich typów |
| **Z-SGL-07** | Load.model="zip" NIE MOŻE wpływać na wynik (AS-IS — niezaimplementowane) | Mapper ignoruje pole model |

### §7.7.2 Anty-wzorce

| Anty-wzorzec | Dlaczego zabroniony |
|-------------|---------------------|
| Source z P/Q injection na Node | Source jest modelowany przez impedancję (Z_source), nie przez P/Q |
| Generator jako „ujemny Load" | Generator jest osobnym bytem ENM z własną semantyką znaku |
| Load z `model="zip"` oczekujący różnicy w wynikach | ZIP nie jest zaimplementowany — wynik identyczny z PQ |
| InverterSource z impedancją w Y-bus | Falownik jest źródłem prądowym, nie impedancyjnym |
| Generator bez bus_ref (wiszący) | Brak walidacji AS-IS, ale semantycznie niedopuszczalny |
| Source bez impedancji (R=0, X=0, Sk=None) | Blokowany przez E008 |

### §7.7.3 Uwaga o Load.p_mw < 0

**Stan AS-IS:** ENM NIE waliduje znaku `Load.p_mw`. Możliwe jest utworzenie Load z ujemnym P (co semantycznie oznacza generację).

> **TO-BE:** Walidacja W-LOAD-01 (IMPORTANT: Load z ujemnym P — czy zamierzone?) — nie zaimplementowana. Fizycznie dopuszczalne (kompensacja), ale wymaga ostrzeżenia.

---

## §7.8 — Macierz pokrycia: ENM → Solver per byt

### §7.8.1 Source — pokrycie pól

| Pole ENM | Mapper | Solver SC | Solver PF | White Box |
|----------|--------|-----------|-----------|-----------|
| bus_ref | ✅ SLACK | ✅ fault context | ✅ SLACK ref | ✅ |
| model | ⚠️ ignorowane | — | — | — |
| sk3_mva | ✅ Z calc | — | — | ✅ |
| ik3_ka | ❌ nieużywane | — | — | — |
| r_ohm | ✅ Z direct | — | — | ✅ |
| x_ohm | ✅ Z direct | — | — | ✅ |
| rx_ratio | ✅ Z calc | — | — | ✅ |
| r0_ohm | ❌ TO-BE | ❌ TO-BE | — | — |
| x0_ohm | ❌ TO-BE | ❌ TO-BE | — | — |
| z0_z1_ratio | ❌ TO-BE | ❌ TO-BE | — | — |
| c_max | ❌ nieużywane | ✅ (z opcji solvera) | — | ✅ |
| c_min | ❌ nieużywane | ✅ (z opcji solvera) | — | ✅ |

### §7.8.2 Generator — pokrycie pól

| Pole ENM | Mapper | Solver SC | Solver PF | White Box |
|----------|--------|-----------|-----------|-----------|
| bus_ref | ✅ P/Q accum | — | ✅ node ref | ✅ |
| p_mw | ✅ += P | — | ✅ injection | ✅ |
| q_mvar | ✅ += Q (0 if None) | — | ✅ injection | ✅ |
| gen_type | ❌ ignorowane | ❌ TO-BE (#14) | ❌ ignorowane | — |
| limits | ❌ nieużywane | ❌ nieużywane | ❌ nieużywane | — |

### §7.8.3 Load — pokrycie pól

| Pole ENM | Mapper | Solver SC | Solver PF | White Box |
|----------|--------|-----------|-----------|-----------|
| bus_ref | ✅ P/Q accum | — | ✅ node ref | ✅ |
| p_mw | ✅ -= P | — | ✅ consumption | ✅ |
| q_mvar | ✅ -= Q | — | ✅ consumption | ✅ |
| model | ❌ ignorowane | — | ❌ ignorowane | — |

### §7.8.4 InverterSource — pokrycie pól (solver layer)

| Pole Solver | Solver SC | Solver PF | White Box |
|-------------|-----------|-----------|-----------|
| id | ✅ contribution tracking | — | ✅ |
| name | ✅ display | — | ✅ |
| node_id | ✅ contribution routing | — | ✅ |
| type_ref | — (metadata) | — | ✅ |
| converter_kind | — (metadata) | — | ✅ |
| in_rated_a | ✅ ik_sc_a calc | — | ✅ |
| k_sc | ✅ ik_sc_a calc | — | ✅ |
| contributes_negative_sequence | ✅ 2F filter | — | ✅ |
| contributes_zero_sequence | ✅ 1F/2F+G filter | — | ✅ |
| in_service | ✅ active filter | — | ✅ |

---

## §7.9 — Zakazy i anty-wzorce (rozszerzone)

### §7.9.1 Zakaz: Solver NIE JEST Protection

**Referencja:** Rozdział 6 §6.6.8

Solver oblicza prądy zwarciowe. Koordynacja zabezpieczeń (selektywność, nastawy, czasy zadziałania) jest domeną warstwy Analysis — NIGDY solvera.

### §7.9.2 Zakaz: Station/Substation nie wpływa na solver

**Referencja:** Rozdział 6 §6.3.6

Substation i Bay są bytami organizacyjnymi (meta). Mapper pomija je:

```python
# enm/mapping.py — Substation, Bay, Junction, Corridor → POMIJANE
```

### §7.9.3 Zakaz: Source.c_max/c_min w mapperze

Source posiada pola `c_max` i `c_min` ale mapper ich NIE używa. Współczynnik napięciowy $c$ jest parametrem **opcji obliczeń** (Case), nie parametrem źródła. Solver SC samodzielnie stosuje c_factor z opcji.

---

## §7.10 — Definition of Done (Rozdział 7)

### §7.10.1 Kryteria akceptacji

| # | Kryterium | Status |
|---|-----------|--------|
| 1 | Kontrakt Source (13 pól) opisany 1:1 z `enm/models.py:180–192` | ✅ |
| 2 | Kontrakt Generator (5 pól + GenLimits) opisany 1:1 z `enm/models.py:212–217` | ✅ |
| 3 | Kontrakt Load (4 pola) opisany 1:1 z `enm/models.py:200–204` | ✅ |
| 4 | Mapowanie Source → Virtual GND Node + LineBranch opisane 1:1 z `mapping.py:191–248` | ✅ |
| 5 | Mapowanie Generator → P/Q addition opisane 1:1 z `mapping.py:57–59` | ✅ |
| 6 | Mapowanie Load → P/Q subtraction opisane 1:1 z `mapping.py:54–56` | ✅ |
| 7 | Kontrakt InverterSource (10 pól) opisany 1:1 z `inverter.py:12–36` | ✅ |
| 8 | Model zwarciowy InverterSource opisany 1:1 z `short_circuit_iec60909.py:426–458` | ✅ |
| 9 | Katalogowe typy (ConverterType, InverterType, ConverterKind) opisane 1:1 z `types.py` | ✅ |
| 10 | Walidacje E001, E008, W002, W003 opisane 1:1 z `validator.py` | ✅ |
| 11 | GAP-y zidentyfikowane i jawnie oznaczone jako TO-BE z referencją do Decision Matrix | ✅ |
| 12 | Zakazy architektoniczne Z-SGL-01..Z-SGL-07 sformułowane | ✅ |
| 13 | Inwarianty INV-SRC-01..05, INV-GEN-01..06, INV-LOAD-01..05 sformułowane | ✅ |
| 14 | Macierz pokrycia pól ENM → Solver per byt kompletna | ✅ |
| 15 | Łańcuch White Box (parametr → mapping → solver → wynik) opisany | ✅ |
| 16 | Sekcje TO-BE NIE blokują zatwierdzenia (zgodnie z SPEC_EXPANSION_PLAN §0) | ✅ |

### §7.10.2 Zidentyfikowane GAP-y (TO-BE)

| GAP | Decision | Opis | Wpływ |
|-----|----------|------|-------|
| Generator → InverterSource mapping | #14 | Mapper nie tworzy InverterSource z Generator(falownik) | SC nie widzi falowników z ENM |
| Generator.catalog_ref | #15 | Brak referencji do ConverterType/InverterType | Brak powiązania katalogowego |
| n_parallel | #17 | Brak pola liczby jednostek równoległych | Każdy falownik osobna instancja |
| Load.model="zip" | — | ZIP zdefiniowany ale niezaimplementowany | Brak różnicy PQ vs ZIP |
| Source.ik3_ka mapping | — | Walidowane ale nieużywane przez mapper | Alternatywna parametryzacja niedostępna |
| GenLimits enforcement | — | Limity nie egzekwowane przez solver PF | Brak PV→PQ switching opartego na limits |
| Walidacja E009/E010 | #11, #12 | Falownik na SN / brak trafo nn/SN | Brak wymuszenia topologii OZE |

---

## §7.A — Suplement v1.1: Domknięcie kontraktów TO-BE

> **Cel:** Domknięcie brakujących kontraktów zidentyfikowanych w §7.10.2 (GAP-y),
> przygotowanie systemu do benchmarku 10/18 (Study Cases & Scenarios).
> **Status:** Kontrakty BINDING. NIE cofają ustaleń v1.0 — wyłącznie doprecyzowują.

---

### §7.A.1 Agregacja jednostek równoległych (n_parallel) — kontrakt solverowy

#### §7.A.1.1 Zasada nadrzędna (BINDING — Decyzja #65)

> **Jeżeli instancja ENM reprezentuje N identycznych jednostek fizycznych
> (np. falowników PV, BESS, generatorów powtarzalnych),
> agregacja ich wpływu elektrycznego MUSI być jednoznaczna i jawna dla solvera.**

#### §7.A.1.2 Dopuszczalne strategie agregacji

| Strategia | Opis | Status v1 |
|-----------|------|-----------|
| **A. Agregacja parametryczna** | ENM przechowuje `quantity=N`, solver interpretuje: P_total=N×P_rated, Ik_total=N×(k_sc×In) | **Docelowa (TO-BE)** |
| **B. Multiplikacja logiczna** | ENM zawiera N osobnych instancji Generator, solver widzi N niezależnych bytów | **AS-IS (v1)** |

**BINDING (v1):** System stosuje **wyłącznie strategię B** (multiplikacja logiczna). Strategia A jest TO-BE.

#### §7.A.1.3 Stan AS-IS (v1)

- Brak pola `n_parallel` na Generator ENM (`enm/models.py`).
- Brak pola `n_parallel` na InverterSource (`inverter.py`).
- Użytkownik tworzy N osobnych instancji Generator w kreatorze.
- Mapper traktuje każdą instancję niezależnie (`mapping.py:57–59`).
- Każda instancja wnosi niezależne P/Q do bilansu węzłowego.

#### §7.A.1.4 Kontrakt docelowy — strategia A (TO-BE, Decyzja #17)

Docelowo ENM BĘDZIE posiadać:

```python
# enm/models.py — Generator (rozszerzenie)
n_parallel: int = 1       # Liczba identycznych jednostek (≥1)
```

Solver — reguły agregacji (TO-BE):

| Solver | Reguła agregacji |
|--------|-----------------|
| **Power Flow** | `P_node += n_parallel × p_mw`, `Q_node += n_parallel × q_mvar` |
| **Short Circuit** | `Ik_inv_total = n_parallel × k_sc × In_rated` |
| **Protection** | Prąd odniesiony do sumarycznej mocy `N × Sn` |

White Box MUSI raportować:
- `quantity = N` jako element śladu,
- `P_unit = p_mw` (per jednostka),
- `P_total = N × p_mw` (sumarycznie),
- `strategy = "PARAMETRIC_AGGREGATION"`.

#### §7.A.1.5 Zakazy (BINDING)

| ID | Zakaz | Uzasadnienie |
|----|-------|-------------|
| **Z-AGR-01** | Zakaz niejawnej agregacji — solver NIE MOŻE zakładać n_parallel bez jawnego pola | Deterministyczność |
| **Z-AGR-02** | Zakaz mieszania strategii A i B w jednym projekcie (docelowo) | Spójność modelu |
| **Z-AGR-03** | Zakaz n_parallel < 1 (walidacja ENM) | Integralność danych |

---

### §7.A.2 Model obciążenia ZIP — formalne zablokowanie w v1

#### §7.A.2.1 Decyzja normatywna (BINDING — Decyzja #66)

> **Model obciążenia ZIP jest zdefiniowany w ENM (pole `model` na Load),
> ale jest NIEAKTYWNY w solverach v1 i ZABLOKOWANY w kreatorze.**

#### §7.A.2.2 Stan AS-IS (v1)

| Komponent | Stan | Opis |
|-----------|------|------|
| `Load.model` | ✅ Zdefiniowany | Pydantic field: `"pq"` / `"zip"`, default `"pq"` |
| Mapper | ❌ Ignoruje | `mapping.py:54–56` traktuje KAŻDY Load jako PQ (`bus_p -= p_mw`) |
| Solver PF | ❌ Nie obsługuje | Newton-Raphson: tylko PQ specs, brak logiki ZIP |
| Kreator | ❌ Nie oferuje | Frontend nie wystawia opcji ZIP |
| White Box | ❌ Nie raportuje | Pole `model` nie jest elementem trace |

#### §7.A.2.3 Kontrakt blokujący (BINDING)

| ID | Zakaz | Uzasadnienie |
|----|-------|-------------|
| **Z-ZIP-01** | Zakaz użycia ZIP w solverze PF v1 — mapper MUSI ignorować `model` | Brak implementacji |
| **Z-ZIP-02** | Zakaz konfiguracji ZIP w kreatorze v1 — UI nie oferuje wyboru modelu | Brak backend |
| **Z-ZIP-03** | Zakaz walidacji `Load.model` w ENMValidator v1 — pole jest informacyjne | Backward compat |
| **Z-ZIP-04** | Aktywacja ZIP wymaga osobnej decyzji ADR z pełnym kontraktem solverowym | Governance |

#### §7.A.2.4 Kontrakt docelowy ZIP (TO-BE, osobna ADR)

Model ZIP definiuje moc obciążenia jako funkcję napięcia:

$$P(U) = P_0 \left[ a_P \left(\frac{U}{U_0}\right)^2 + b_P \left(\frac{U}{U_0}\right) + c_P \right]$$

$$Q(U) = Q_0 \left[ a_Q \left(\frac{U}{U_0}\right)^2 + b_Q \left(\frac{U}{U_0}\right) + c_Q \right]$$

Warunek normalizacji: $a + b + c = 1.0$.

| Składnik | Litera | Model fizyczny |
|----------|--------|---------------|
| Z (impedancyjny) | $a$ | Moc ∝ U² (grzejniki, oporniki) |
| I (prądowy) | $b$ | Moc ∝ U (prostowniki, LED) |
| P (mocowy) | $c$ | Moc = const (falowniki, zasilacze impulsowe) |

Aktywacja ZIP WYMAGA:
1. Rozszerzenia mappera o generację `LoadSpec` z typem ZIP i współczynnikami a/b/c.
2. Rozszerzenia solvera PF o zależność P(U)/Q(U) w iteracji Newton-Raphson.
3. Rozszerzenia White Box o ślad ZIP (współczynniki a/b/c, U₀, U_actual).
4. Rozszerzenia Study Case o możliwość wyboru modelu per Load.
5. Nowych testów walidujących zbieżność NR z obciążeniami ZIP.

---

### §7.A.3 BESS — tryby pracy (kanoniczna tabela)

#### §7.A.3.1 Zasada (BINDING — Decyzja #67)

> **BESS (Battery Energy Storage System) MUSI posiadać jawny tryb pracy
> determinujący zachowanie elektryczne instancji w danym Study Case.**

#### §7.A.3.2 Kanoniczna tabela trybów pracy

| Tryb | Znak P | Znak Q | Solver PF | Solver SC | Bilans mocy | White Box |
|------|--------|--------|-----------|-----------|-------------|-----------|
| **DISCHARGE** | P > 0 (generacja) | Q ≥ 0 lub < 0 | Generator: `bus_p += p_mw` | InverterSource: `Ik = k_sc × In` | Źródło mocy (+P) | `mode=DISCHARGE, P_inject=+p_mw` |
| **CHARGE** | P < 0 (pobór) | Q ≥ 0 lub < 0 | Load: `bus_p -= |p_mw|` | InverterSource: `Ik = k_sc × In` (contributes) | Odbiór mocy (−P) | `mode=CHARGE, P_absorb=−p_mw` |
| **IDLE** | P = 0 | Q = 0 | Niewidoczny (zerowy wkład) | `in_service=false` (brak wkładu SC) | Neutralny (0) | `mode=IDLE, P=0, Q=0` |

#### §7.A.3.3 Stan AS-IS (v1)

**v1 NIE posiada jawnego pola trybu pracy BESS.** Tryb jest implicitly wyznaczany przez znak `p_mw`:

```python
# enm/models.py — Generator
p_mw: float        # > 0 = discharge, < 0 = charge, 0 = idle
gen_type: "bess"   # Identyfikacja typu
```

Mapper (`mapping.py:57–59`) stosuje regułę uniwersalną:
- `bus_p += p_mw` — p_mw > 0 oznacza generację, p_mw < 0 oznacza pobór.
- Brak rozróżnienia trybów w logice mappera.
- Brak walidacji spójności znaku z trybem.

#### §7.A.3.4 Kontrakt docelowy (TO-BE)

Docelowo Generator(gen_type="bess") BĘDZIE posiadać jawne pole trybu:

```python
# Rozszerzenie Generator (TO-BE)
class BESSMode(str, Enum):
    DISCHARGE = "discharge"
    CHARGE = "charge"
    IDLE = "idle"

# Na Generator (gen_type="bess"):
bess_mode: BESSMode | None = None    # None = tryb wyznaczony z p_mw (backward compat)
```

Reguły:
- `bess_mode` jest parametrem **Study Case** (Rozdział 10), nie parametrem stałym ENM.
- Zmiana trybu NIE mutuje ENM — zmienia się wyłącznie konfiguracja Case.
- Mapper weryfikuje spójność: `bess_mode=CHARGE` wymaga `p_mw < 0`.
- White Box MUSI raportować: tryb, P, Q, oraz źródło trybu (jawny / implicit z p_mw).

#### §7.A.3.5 Zakazy (BINDING)

| ID | Zakaz | Uzasadnienie |
|----|-------|-------------|
| **Z-BESS-01** | Zakaz domyślnego przełączania trybów bez jawnego parametru instancji lub Study Case | Deterministyczność |
| **Z-BESS-02** | Zakaz ukrywania trybu pracy BESS w White Box — tryb MUSI być elementem śladu | Audytowalność |
| **Z-BESS-03** | Zakaz traktowania BESS jako czystego Generatora w trybie CHARGE (jest odbiorem) | Poprawność bilansu |

---

### §7.A.4 StudyCaseContext — kontrakt wejściowy obliczeniowy (BINDING — Decyzja #68)

#### §7.A.4.1 Definicja

> **StudyCaseContext = zamrożony kontekst obliczeniowy sieci,
> stanowiący jednoznaczne wejście do solverów.**

#### §7.A.4.2 Skład StudyCaseContext

| Składnik | Źródło AS-IS | Typ | Opis |
|----------|-------------|-----|------|
| ENM snapshot | `NetworkSnapshotORM.snapshot_json` | frozen dict | Pełny graf sieci (Bus, Branch, Switch, Source, Generator, Load) |
| Katalog typów snapshot | `CatalogRepository` (frozen) | frozen dataclass | Typy używane w projekcie z fingerprintem SHA-256 |
| StudyCaseConfig | `StudyCase.config` | frozen dataclass | c_factor_max/min, base_mva, max_iterations, tolerance, include_motor/inverter |
| ProtectionConfig | `StudyCase.protection_config` | frozen dataclass | template_ref, fingerprint, overrides |
| Aktywne źródła | ENM snapshot (status filter) | lista Source | Tylko Source z `in_service=true` |
| Aktywne obciążenia | ENM snapshot | lista Load | Aktywne Load z P/Q |
| Tryby generatorów | ENM snapshot + params | dict[gen_id, {p, q}] | P/Q per Generator (w tym BESS z implicit mode) |
| Stany łączników | ENM snapshot (field status) | dict[switch_id, OPEN/CLOSED] | Topologia operacyjna |

#### §7.A.4.3 Cel

- **Jednoznaczne wejście do solverów** — solver widzi wyłącznie StudyCaseContext + opcje solvera.
- **Deterministyczne wyniki** — ten sam StudyCaseContext + ten sam solver = identyczne wyniki.
- **Pełna reprodukowalność White Box** — trace odwołuje się do snapshotów, nie do stanu bieżącego.
- **Porównywalność** — dwa StudyCaseContext mogą być porównane pole-po-polu (diff).

#### §7.A.4.4 Realizacja AS-IS

W v1 StudyCaseContext jest realizowany przez:

| Mechanizm AS-IS | Plik | Opis |
|-----------------|------|------|
| `input_snapshot: dict` | `domain/analysis_run.py` | Kanonicalizowany JSON z pełnym grafem (na AnalysisRun) |
| `input_hash: str` (SHA-256) | `domain/analysis_run.py` | Deterministyczny hash inputu |
| `StudyCaseConfig` | `domain/study_case.py` | Parametry obliczeń (c_factor, base_mva, tolerance) |
| `network_snapshot_id` | `domain/study_case.py` (P10a) | Referencja do snapshotu ENM |
| `ProtectionConfig` | `domain/study_case.py` (P14c) | Konfiguracja zabezpieczeń |

Kanonicalizacja (`application/analysis_run/service.py`):
1. Rekursywne sortowanie kluczy JSON.
2. Deterministyczne sortowanie list (nodes, branches, sources, loads).
3. `json.dumps(snapshot, sort_keys=True, separators=(",", ":"))`.
4. `SHA-256(canonical_json) → input_hash`.

---

### §7.A.5 Definition of Done (Suplement v1.1)

| # | Kryterium | Status |
|---|-----------|--------|
| 1 | Strategia agregacji v1 (B — multiplikacja logiczna) jawnie udokumentowana | ✅ |
| 2 | Kontrakt docelowy strategii A (parametryczna) z polami ENM i regułami solvera | ✅ |
| 3 | ZIP formalnie zablokowany (Z-ZIP-01..04) z kontraktem docelowym (formuły ZIP) | ✅ |
| 4 | BESS: kanoniczna tabela trybów DISCHARGE/CHARGE/IDLE z P/Q/SC/White Box | ✅ |
| 5 | StudyCaseContext zdefiniowany jako zamrożone wejście obliczeniowe | ✅ |
| 6 | Zakazy Z-AGR-01..03, Z-ZIP-01..04, Z-BESS-01..03 sformułowane | ✅ |

---

**DOMENA ŹRÓDEŁ, GENERATORÓW I ODBIORÓW W ROZDZIALE 7 JEST ZAMKNIĘTA (v1.1).**

---

*Koniec Rozdziału 7*

