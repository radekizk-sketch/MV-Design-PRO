> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Rozdział 8 — Typ vs Instancja + Katalogi Typów (Type Library)

**Wersja:** 1.1
**Status:** AS-IS (z sekcjami TO-BE jawnie oznaczonymi)
**Warstwa:** ENM Domain + Catalog + Resolver + Application (Kreator)
**Zależności:** Rozdział 2 (ENM Domain Model), Rozdział 5 (§5.13–§5.19 — Kontrakty katalogowe), Rozdział 6 (Solver Contracts), Rozdział 7 (Source/Generator/Load)
**Decision Matrix:** Decyzje #15, #16, #17, #18, #39, #40, #41, #42 (AUDIT_SPEC_VS_CODE.md)
**Kod źródłowy:** `network_model/catalog/types.py`, `network_model/catalog/resolver.py`, `network_model/catalog/repository.py`, `network_model/catalog/governance.py`, `network_model/core/branch.py`, `enm/models.py`, `enm/mapping.py`

---

## §8.0 — Zakres i cel rozdziału

### §8.0.1 Cel

Niniejszy rozdział definiuje **kanoniczne rozróżnienie: TYP vs INSTANCJA** w MV-DESIGN-PRO oraz rolę **katalogów typów** jako jedynego źródła parametrów znamionowych.

Rozdział 8 formalizuje:
- czym jest TYP (parametry znamionowe, read-only w projekcie, współdzielony),
- czym jest INSTANCJA (pozycja w topologii, parametry zmienne, decyzje projektowe),
- jak działa resolver (mechanizm rozstrzygania precedencji),
- jaką rolę pełni tryb ekspercki (kontrolowane override'y),
- jak White Box odtwarza łańcuch: katalog → instancja → override → solver.

### §8.0.2 Granice rozdziału

Rozdział:
- **NIE** opisuje UI w szczegółach (to domena SPEC_04_SLD_PROJECTION, SPEC_13_WIZARD),
- **NIE** opisuje solverów (to domena Rozdziału 6),
- **NIE** definiuje algorytmów obliczeniowych,
- **NIE** duplikuje kontraktów poszczególnych typów z Rozdziału 5 (§5.14–§5.15),
- **definiuje WYŁĄCZNIE** kontrakty danych, inwarianty, zakazy i relacje architektoniczne.

### §8.0.3 Referencje do wcześniejszych rozdziałów

| Rozdział | Sekcja | Treść referencowana |
|----------|--------|---------------------|
| Rozdział 5 | §5.13 | Zasada nadrzędna: żaden parametr znamionowy nie jest wpisywany ręcznie |
| Rozdział 5 | §5.14 | 7 domen katalogowych (BINDING) |
| Rozdział 5 | §5.15 | Struktura kanoniczna typu (id, name, manufacturer + domenowe) |
| Rozdział 5 | §5.16 | Relacja katalog ↔ kreator (TypePicker, blokada braku typu) |
| Rozdział 5 | §5.17 | Relacja katalog ↔ ENM (type_id + snapshot + override) |
| Rozdział 5 | §5.18 | Wersjonowanie: TypeLibraryManifest + fingerprint |
| Rozdział 5 | §5.19 | Walidacje systemowe (I002, W-C01..C03, E-C01) |
| Rozdział 7 | §7.2 | Source — wyjątek od katalogu (parametry projektowe OSD) |
| Rozdział 7 | §7.3 | Generator — brak catalog_ref (GAP), InverterSource |
| Rozdział 7 | §7.4 | Load — brak catalog_ref (dopuszczalne) |

---

## §8.1 — Zasada nadrzędna (KANON)

### §8.1.1 Formuła kanoniczna (BINDING — Decyzja #39)

> **Instancja ENM = TYP(katalog) + parametry_zmienne(kreator) + [override(tryb_ekspert)] + ilość**

Żaden element ENM — z wyjątkiem Source (§8.1.3) — nie przechowuje „gołych" parametrów znamionowych. Każdy element ENM jest **instancją typu z katalogu**.

### §8.1.2 Definicja: parametr znamionowy vs parametr zmienny

| Kategoria | Definicja | Źródło | Przykłady |
|-----------|-----------|--------|-----------|
| **Parametr znamionowy** | Wartość wynikająca z konstrukcji urządzenia | Katalog (TYP) | R′ [Ω/km], X′ [Ω/km], In [A], Un [kV], Sn [MVA], uk%, pk, grupa połączeń |
| **Parametr zmienny** | Wartość ustalana per instancja w projekcie | Kreator / Użytkownik | length_km, tap_position, p_mw, q_mvar, status (open/closed), n_parallel |
| **Override** | Świadome odstępstwo od parametru znamionowego | Tryb ekspercki | impedance_override (R′, X′, B′ per instancja) |

### §8.1.3 Wyjątki od zasady (BINDING)

| Byt ENM | Katalog wymagany? | Uzasadnienie |
|---------|-------------------|-------------|
| **Source** | **NIE** (wyjątek §5.13.4) | Source modeluje sieć zasilającą (grid equivalent), nie urządzenie fizyczne. Parametry wynikają z warunków przyłączenia OSD. |
| **Load** | **NIE** (dopuszczalne §5.14.3) | Parametry odbioru (P, Q) są danymi bilansowymi, nie konstrukcyjnymi. LoadType jest TO-BE jako opcjonalne rozszerzenie. |
| **Bus** | **NIE** | Bus definiuje napięcie znamionowe szyny — nie jest urządzeniem z katalogu. |

> **BINDING (Decyzja #39):** Wyjątki dotyczą WYŁĄCZNIE Source, Load i Bus. Każdy inny element sieciowy (OverheadLine, Cable, Transformer, SwitchBranch, Generator falownikowy) MUSI posiadać referencję do katalogu typów.

---

## §8.2 — TYP (TYPE) — definicja kanoniczna

### §8.2.1 Czym jest TYP

**Typ** reprezentuje:
- rzeczywisty wyrób techniczny (producent, model, seria),
- normowy zestaw parametrów znamionowych (impedancje, prądy, napięcia, moce),
- dane producenta lub standardu (materiał, przekrój, izolacja, medium gaszące).

### §8.2.2 Właściwości typu (BINDING)

| Właściwość | Opis |
|-----------|------|
| **Immutable** | Typ jest `frozen=True` (dataclass) — po utworzeniu nie może być zmodyfikowany |
| **Read-only w projekcie** | Kreator i ENM NIE mogą modyfikować danych katalogowych |
| **Współdzielony** | Ten sam typ jest używany w wielu projektach |
| **Niezależny od topologii** | Typ NIE zależy od pozycji elementu w sieci |
| **Identyfikowalny** | Posiada unikalne `id: str` (UUID lub slug) |

### §8.2.3 Implementacja AS-IS — 9 klas typów katalogowych

| Klasa | Plik | frozen | Pola domenowe | Status |
|-------|------|--------|---------------|--------|
| `LineType` | `catalog/types.py:33–162` | ✅ | 16 (r, x, b, In, conductor, section, thermal, voltage) | AS-IS |
| `CableType` | `catalog/types.py:166–313` | ✅ | 18 (r, x, c→b, In, insulation, cores, thermal) | AS-IS |
| `TransformerType` | `catalog/types.py:317–395` | ✅ | 14 (Sn, UHV, ULV, uk%, pk, i0%, P0, vector, taps) | AS-IS |
| `SwitchEquipmentType` | `catalog/types.py:399–454` | ✅ | 9 (kind, Un, In, Ik, Icw, medium) | AS-IS |
| `ConverterType` | `catalog/types.py:464–558` | ✅ | 13 (kind, Un, Sn, Pmax, Q, cosφ, e_kwh) | AS-IS |
| `InverterType` | `catalog/types.py:562–639` | ✅ | 11 (Un, Sn, Pmax, Q, cosφ) | AS-IS |
| `ProtectionDeviceType` | `catalog/types.py:648–700` | ✅ | 7 (name_pl, vendor, series, In) | AS-IS |
| `ProtectionCurve` | `catalog/types.py:704–749` | ✅ | 5 (standard, curve_kind, parameters) | AS-IS |
| `ProtectionSettingTemplate` | `catalog/types.py:753–799` | ✅ | 5 (device_type_ref, curve_ref, setting_fields) | AS-IS |

### §8.2.4 Co należy do TYPU (zamknięta lista)

Do typu należą WYŁĄCZNIE:
- napięcia znamionowe (`un_kv`, `voltage_hv_kv`, `voltage_lv_kv`, `voltage_rating_kv`),
- moce znamionowe (`sn_mva`, `pmax_mw`, `rated_power_mva`),
- impedancje jednostkowe (`r_ohm_per_km`, `x_ohm_per_km`, `b_us_per_km`, `uk_percent`, `pk_kw`),
- prądy znamionowe i zwarciowe (`rated_current_a`, `in_a`, `ik_ka`, `icw_ka`),
- dane cieplne (`ith_1s_a`, `jth_1s_a_per_mm2`, `max_temperature_c`),
- dane konstrukcyjne (`conductor_material`, `cross_section_mm2`, `insulation_type`, `number_of_cores`, `medium`),
- dane katalogowe (`manufacturer`, `model`, `base_type_id`, `trade_name`),
- charakterystyki aparatów (`curve_kind`, `parameters`, `setting_fields`),
- grupy połączeń i schematy chłodzenia (`vector_group`, `cooling_class`).

### §8.2.5 ZAKAZ: dane projektowe w typie

> **BINDING:** Do typu **NIE** należą dane zależne od projektu lub topologii:
> - długości (length_km),
> - pozycje zaczepów (tap_position),
> - stany łączników (status: open/closed),
> - moce odbioru (p_mw, q_mvar),
> - przypisania topologiczne (bus_ref, from_bus_ref, to_bus_ref),
> - liczby jednostek równoległych (n_parallel).

---

## §8.3 — INSTANCJA — definicja kanoniczna

### §8.3.1 Czym jest instancja

**Instancja** reprezentuje:
- konkretne wystąpienie typu w projekcie (np. „kabel NA2XS(F)2Y 240 na odcinku GPZ→T1"),
- pozycję w topologii ENM (bus_ref, from_bus_ref, to_bus_ref),
- decyzje projektowe użytkownika (długość, moc, konfiguracja pracy).

### §8.3.2 Właściwości instancji (BINDING)

| Właściwość | Opis |
|-----------|------|
| **Zawsze wskazuje typ** | Pole `catalog_ref: str \| None` (AS-IS: None dopuszczalne, TO-BE: wymagane) |
| **Przechowuje parametry zmienne** | Wartości per projekt, per element |
| **Może posiadać override** | W trybie eksperckim, jawnie oznaczony |
| **Unikalny w projekcie** | Posiada `id: UUID` + `ref_id: str` |

### §8.3.3 Parametry instancji per element ENM (AS-IS)

| Element ENM | catalog_ref | Parametry zmienne instancji | Override AS-IS |
|-------------|-------------|---------------------------|----------------|
| **OverheadLine** | ✅ `BranchBase.catalog_ref` | `length_km`, `status` | `impedance_override` (R′, X′, B′) |
| **Cable** | ✅ `BranchBase.catalog_ref` | `length_km`, `status`, `insulation` | `impedance_override` (R′, X′, B′) |
| **Transformer** | ✅ `Transformer.catalog_ref` | `tap_position`, `hv_neutral`, `lv_neutral`, `status` | ❌ Brak (TO-BE) |
| **SwitchBranch** | ✅ `BranchBase.catalog_ref` | `status` (open/closed) | ❌ Brak |
| **FuseBranch** | ✅ `BranchBase.catalog_ref` | `rated_current_a`, `rated_voltage_kv` | ❌ Brak |
| **Generator** | ❌ **GAP** (TO-BE: Decyzja #15) | `p_mw`, `q_mvar`, `gen_type` | ❌ Brak (TO-BE: Decyzja #16) |
| **Source** | ❌ Celowe (§8.1.3) | `sk3_mva`, `r_ohm`, `x_ohm`, `rx_ratio`, `c_max`, `c_min` | — |
| **Load** | ❌ Dopuszczalne (§8.1.3) | `p_mw`, `q_mvar`, `model` | — |

### §8.3.4 ZAKAZ: duplikowanie parametrów typu w instancji

> **BINDING (Decyzja #18):** Instancja NIE duplikuje parametrów typu. Pole `catalog_ref` jest jedynym łącznikiem. Parametry znamionowe wynikają z resolvera.

**Stan AS-IS (GAP):** Klasy OverheadLine i Cable posiadają pola impedancyjne (`r_ohm_per_km`, `x_ohm_per_km`) ZARÓWNO na instancji ENM jak i w typie katalogowym. Resolver rozstrzyga precedencję — ale dane istnieją w dwóch miejscach (backward compatibility). Docelowo (TO-BE): instancja ENM przechowuje WYŁĄCZNIE `catalog_ref` + parametry zmienne; pola znamionowe usunięte z instancji.

### §8.3.5 Kontrakt ENM — pole catalog_ref

Pole `catalog_ref: str | None` na ENM:

```python
# enm/models.py:103
class BranchBase(ENMElement):
    from_bus_ref: str
    to_bus_ref: str
    status: Literal["closed", "open"] = "closed"
    catalog_ref: str | None = None

# enm/models.py:172
class Transformer(ENMElement):
    # ...parametry znamionowe...
    catalog_ref: str | None = None
```

**Semantyka:**
- `catalog_ref is not None` → resolver pobiera parametry z katalogu (`ParameterSource.TYPE_REF`)
- `catalog_ref is None` → resolver używa parametrów z instancji (`ParameterSource.INSTANCE`)
- Oba przypadki są obsługiwane (backward compatibility)

---

## §8.4 — Katalogi typów (Type Library)

### §8.4.1 Rola katalogów (BINDING)

Katalogi typów są:
- **jedynym źródłem parametrów znamionowych** (Decyzja #39),
- **podstawą spójności obliczeń** (solver operuje na parametrach z resolvera),
- **fundamentem audytu i White Box** (pełny łańcuch: typ → instancja → override → wynik),
- **współdzielone między projektami** (zmiana katalogu invaliduje WSZYSTKIE projekty).

### §8.4.2 CatalogRepository — immutable repozytorium (AS-IS)

```python
# catalog/repository.py:20
@dataclass(frozen=True)
class CatalogRepository:
    line_types: dict[str, LineType]
    cable_types: dict[str, CableType]
    transformer_types: dict[str, TransformerType]
    switch_equipment_types: dict[str, SwitchEquipmentType]
    converter_types: dict[str, ConverterType]
    inverter_types: dict[str, InverterType]
    protection_device_types: dict[str, ProtectionDeviceType]
    protection_curves: dict[str, ProtectionCurve]
    protection_setting_templates: dict[str, ProtectionSettingTemplate]
```

**Kod AS-IS:** `catalog/repository.py:20–201`

**Właściwości:**
- `frozen=True` — immutable po utworzeniu
- Dostęp per typ: `get_line_type(id)`, `get_cable_type(id)`, `get_transformer_type(id)`, etc.
- Fabrycznie: `from_records()` — deserializacja z dict
- Domyślny katalog: `get_default_mv_catalog()` — 14+ typów linii, 90+ typów kabli, transformatory WN/SN + SN/nn, łączniki, konwertery

### §8.4.3 Zakres katalogów — 7 domen obowiązkowych (Decyzja #40)

| # | Domena | Klasy AS-IS | Status pokrycia |
|---|--------|------------|-----------------|
| 1 | Linie napowietrzne | `LineType` (14+ typów bazowych) | **100%** (AS-IS) |
| 2 | Kable SN/nn | `CableType` (90+ typów) | **100%** (AS-IS) |
| 3 | Transformatory | `TransformerType` (WN/SN + SN/nn) | **100%** (AS-IS) |
| 4 | Falowniki/przetwornice | `ConverterType`, `InverterType` | **25%** (typy istnieją, brak catalog_ref na Generator — GAP) |
| 5 | Aparaty łączeniowe | `SwitchEquipmentType` | **75%** (brak dedykowanego resolvera — GAP) |
| 6 | Zabezpieczenia | `ProtectionDeviceType`, `ProtectionCurve`, `ProtectionSettingTemplate` | **50%** (backend OK, frontend GAP) |
| 7 | Przekładniki CT/VT | — | **0%** (TO-BE) |

**Referencja:** Rozdział 5 §5.14.1 — pełna definicja 7 domen.

### §8.4.4 Wybór typu w kreatorze — kanoniczna sekwencja (BINDING)

```
1. Użytkownik wchodzi do kroku kreatora (np. K4 — transformator)
2. TypePicker wyświetla dostępne typy z katalogu
3. Użytkownik wybiera TYP → catalog_ref przypisane do instancji
4. Parametry znamionowe wyświetlane jako READ-ONLY
5. Użytkownik uzupełnia WYŁĄCZNIE parametry zmienne instancji
   (np. tap_position, length_km, p_mw)
6. [Opcjonalnie] Tryb EKSPERT → override wybranych parametrów (§8.5)
```

**Kod AS-IS:** TypePicker UI jest zaimplementowany dla linii, kabli, transformatorów, łączników.

**Stan AS-IS kreator per krok:**

| Krok | Element | Katalog? | Zachowanie |
|------|---------|----------|-----------|
| K2 | Source | **NIE** (wyjątek) | Ręczne wpisanie sk3_mva, rx_ratio |
| K3 | Bus SN | **NIE** | Podanie voltage_kv |
| K4 | OverheadLine / Cable | **TAK** (`LineType`/`CableType`) | TypePicker → READ-ONLY → length_km |
| K5 | Transformer | **TAK** (`TransformerType`) | TypePicker → READ-ONLY → tap_position, uziemienie |
| K6 | SwitchBranch | **TAK** (`SwitchEquipmentType`) | TypePicker → status |
| K6 | Load | **NIE** (dopuszczalne) | Ręczne p_mw, q_mvar, model |
| K9 | Generator (falownik) | **TO-BE** (`ConverterType`/`InverterType`) | TO-BE: TypePicker → n_parallel → P, Q |

---

## §8.5 — Tryb ekspercki (DOPUSZCZALNY, ALE OGRANICZONY)

### §8.5.1 Definicja

Tryb ekspercki pozwala na **kontrolowane odstępstwa** od parametrów typu katalogowego na poziomie **konkretnej instancji** w projekcie.

### §8.5.2 Implementacja AS-IS: impedance_override (linie/kable)

Jedynym zaimplementowanym mechanizmem override jest `impedance_override` na `LineBranch`:

```python
# network_model/core/branch.py:212
@dataclass
class LineBranch(Branch):
    # ...
    impedance_override: Optional[LineImpedanceOverride] = None
```

Resolver sprawdza `impedance_override` jako **najwyższy priorytet**:

```
JEŚLI impedance_override ≠ None:
    → ParameterSource.OVERRIDE (używa wartości z override)
W PRZECIWNYM RAZIE JEŚLI type_ref ≠ None:
    → ParameterSource.TYPE_REF (używa wartości z katalogu)
W PRZECIWNYM RAZIE:
    → ParameterSource.INSTANCE (używa wartości z instancji, fallback)
```

**Kod AS-IS:** `catalog/resolver.py:170–217`

### §8.5.3 Inwarianty trybu eksperckiego (BINDING)

| ID | Inwariant | Status |
|----|-----------|--------|
| **INV-EXP-01** | Override NIE zmienia typu w katalogu — dotyczy wyłącznie danej instancji | BINDING |
| **INV-EXP-02** | Override NIE nadpisuje katalogu — katalog pozostaje intact | BINDING |
| **INV-EXP-03** | Każdy override jest jawny — zapisany w modelu, widoczny w UI | AS-IS (impedance_override) |
| **INV-EXP-04** | Każdy override jest audytowalny — `ParameterSource.OVERRIDE` w White Box | AS-IS |
| **INV-EXP-05** | Override wymaga jawnej aktywacji trybu eksperckiego w UI | TO-BE (UI nie rozróżnia trybu) |

### §8.5.4 Zakres override per element (AS-IS vs TO-BE)

| Element | Override AS-IS | Override TO-BE |
|---------|---------------|----------------|
| OverheadLine | ✅ `impedance_override` (R′, X′, B′) | — |
| Cable | ✅ `impedance_override` (R′, X′, B′) | — |
| Transformer | ❌ Brak | uk%, pk (Decyzja #16) |
| Generator (falownik) | ❌ Brak | limity prądu, k_sc (Decyzja #16) |
| SwitchBranch | ❌ Brak | — |
| FuseBranch | ❌ Brak | — |

---

## §8.6 — Resolver — mechanizm rozstrzygania parametrów

### §8.6.1 ParameterSource — enum źródła parametrów (AS-IS)

```python
# catalog/resolver.py:20
class ParameterSource(Enum):
    OVERRIDE = "override"   # impedance_override (Line/Cable only)
    TYPE_REF = "type_ref"   # Catalog type reference
    INSTANCE = "instance"   # Direct instance parameters (fallback)
```

**Kod AS-IS:** `catalog/resolver.py:20–25`

### §8.6.2 Precedencja resolvera (BINDING)

```
┌──────────────────────────────────────────────────┐
│  1. OVERRIDE (najwyższy priorytet)               │
│     impedance_override ≠ None                     │
│     → ParameterSource.OVERRIDE                    │
├──────────────────────────────────────────────────┤
│  2. TYPE_REF (domyślny)                          │
│     catalog_ref ≠ None AND typ znaleziony         │
│     → ParameterSource.TYPE_REF                    │
├──────────────────────────────────────────────────┤
│  3. INSTANCE (fallback)                          │
│     catalog_ref is None OR typ nieznaleziony      │
│     → ParameterSource.INSTANCE                    │
└──────────────────────────────────────────────────┘
```

### §8.6.3 Funkcje resolvera (AS-IS)

| Funkcja | Plik | Linie | Element | Precedencja | Return type |
|---------|------|-------|---------|-------------|-------------|
| `resolve_line_params()` | `resolver.py` | 136–217 | OverheadLine / Cable | override > type_ref > instance | `ResolvedLineParams` |
| `resolve_transformer_params()` | `resolver.py` | 220–280 | Transformer | type_ref > instance | `ResolvedTransformerParams` |
| `resolve_thermal_params()` | `resolver.py` | 283–334 | OverheadLine / Cable | type_ref only | `ResolvedThermalParams | None` |

### §8.6.4 ResolvedLineParams (AS-IS)

```python
# catalog/resolver.py:28
@dataclass(frozen=True)
class ResolvedLineParams:
    r_ohm_per_km: float
    x_ohm_per_km: float
    b_us_per_km: float
    rated_current_a: float
    source: ParameterSource
```

Pole `source` wskazuje jednoznacznie, skąd parametry pochodzą — fundament audytu White Box.

### §8.6.5 ResolvedTransformerParams (AS-IS)

```python
# catalog/resolver.py:101
@dataclass(frozen=True)
class ResolvedTransformerParams:
    rated_power_mva: float
    voltage_hv_kv: float
    voltage_lv_kv: float
    uk_percent: float
    pk_kw: float
    i0_percent: float
    p0_kw: float
    vector_group: str
    source: ParameterSource
```

### §8.6.6 ResolvedThermalParams (AS-IS)

```python
# catalog/resolver.py:40
@dataclass(frozen=True)
class ResolvedThermalParams:
    ith_1s_a: Optional[float]
    jth_1s_a_per_mm2: Optional[float]
    cross_section_mm2: float
    conductor_material: Optional[str]
    dane_cieplne_kompletne: bool
    source: ParameterSource
    type_id: Optional[str]
    type_name: Optional[str]
    is_manufacturer_type: bool
    base_type_id: Optional[str]
```

### §8.6.7 TypeNotFoundError (AS-IS)

```python
# catalog/resolver.py:116
class TypeNotFoundError(ValueError):
    def __init__(self, type_ref: str, equipment_type: str):
        self.type_ref = type_ref
        self.equipment_type = equipment_type
```

| Kontekst | Zachowanie |
|----------|-----------|
| `resolve_line_params()` | **Raises** `TypeNotFoundError` jeśli `type_ref` nie znaleziony |
| `resolve_transformer_params()` | **Raises** `TypeNotFoundError` jeśli `type_ref` nie znaleziony |
| `resolve_thermal_params()` | **Returns None** (non-raising — warstwa analizy) |

### §8.6.8 Integracja resolvera w pipeline obliczeniowym

```
ENM (editable)
    │
    ▼
map_enm_to_network_graph()     ← mapper NIE wywołuje resolvera (AS-IS)
    │                             mapper przekazuje surowe parametry instancji
    ▼
NetworkGraph (LineBranch, TransformerBranch)
    │
    ▼
branch.resolve_electrical_params(catalog)    ← resolver wywołany PRZED solverem
branch.resolve_nameplate(catalog)
    │
    ▼
Parametry finalne (po rozstrzygnięciu precedencji)
    │
    ▼
Solver (SC / PF)               ← solver NIE zna katalogu ani override'ów
    │
    ▼
Wynik (Frozen API)
```

**Kod AS-IS — resolver na LineBranch:**

```python
# network_model/core/branch.py:432
def resolve_electrical_params(
    self, catalog: CatalogRepository | None = None
) -> ResolvedLineParams:
    return resolve_line_params(
        type_ref=self.type_ref,
        is_cable=(self.branch_type == BranchType.CABLE),
        impedance_override=impedance_override_dict,
        length_km=self.length_km,
        instance_r_ohm_per_km=self.r_ohm_per_km,
        instance_x_ohm_per_km=self.x_ohm_per_km,
        instance_b_us_per_km=self.b_us_per_km,
        instance_rated_current_a=self.rated_current_a,
        catalog=catalog,
    )
```

**Kod AS-IS — resolver na TransformerBranch:**

```python
# network_model/core/branch.py:842
def resolve_nameplate(
    self, catalog: CatalogRepository | None = None
) -> TransformerType:
    resolved = resolve_transformer_params(
        type_ref=self.type_ref,
        instance_rated_power_mva=self.rated_power_mva,
        instance_voltage_hv_kv=self.voltage_hv_kv,
        instance_voltage_lv_kv=self.voltage_lv_kv,
        instance_uk_percent=self.uk_percent,
        instance_pk_kw=self.pk_kw,
        instance_i0_percent=self.i0_percent,
        instance_p0_kw=self.p0_kw,
        instance_vector_group=self.vector_group,
        catalog=catalog,
    )
    return TransformerType(...)
```

### §8.6.9 Inwariant: solver NIE widzi katalogu

> **BINDING (Decyzja #45, Rozdział 6 §6.4):** Solver widzi WYŁĄCZNIE wartości finalne po rozstrzygnięciu resolvera. Solver NIE wie, czy wartość pochodzi z katalogu, override czy instancji.

---

## §8.7 — Wersjonowanie katalogów i governance

### §8.7.1 TypeLibraryManifest (AS-IS)

```python
# catalog/governance.py:42
class TypeLibraryManifest:
    library_id: str              # Stabilny identyfikator
    name_pl: str                 # Polska nazwa
    vendor: str                  # Dostawca biblioteki
    series: str                  # Seria
    revision: str                # Wersja
    schema_version: str          # Wersja schematu
    created_at: str              # ISO 8601
    fingerprint: str             # SHA-256 hash
```

**Kod AS-IS:** `catalog/governance.py:42–98`

### §8.7.2 Import i eksport (AS-IS)

| Operacja | Tryb | Opis |
|----------|------|------|
| **Import MERGE** | `ImportMode.MERGE` | Dodaje nowe typy, pomija istniejące |
| **Import REPLACE** | `ImportMode.REPLACE` | Zastępuje całą bibliotekę (blokowane jeśli typy w użyciu) |
| **Export** | — | Deterministyczna serializacja (sorted keys) + SHA-256 fingerprint |

**Kod AS-IS:** `catalog/governance.py:34–256`

### §8.7.3 Deterministyczność fingerprint (BINDING)

```
TypeLibraryExport.to_canonical_json()
    → sorted keys, no whitespace
    → to_fingerprint_payload_dict()
    → excludes runtime fields
    → compute_fingerprint()
    → SHA-256
```

**Inwariant:** Ten sam katalog → identyczny fingerprint. Zmiana dowolnego parametru → inny fingerprint.

### §8.7.4 Katalog a projekt — semantyka zmian

| Zmiana | Wpływ na projekt |
|--------|-----------------|
| Dodanie nowego typu | Brak wpływu (nowy typ dostępny, stare instancje niezmienione) |
| Modyfikacja istniejącego typu | **Typ immutable** — modyfikacja = nowy typ z nowym `id` |
| Usunięcie typu przy istniejących instancjach | **TypeNotFoundError** — zablokowane |
| Import REPLACE | Dozwolony WYŁĄCZNIE jeśli żaden typ nie jest w użyciu |

> **BINDING (Decyzja #42):** Typy są immutable. Modyfikacja = nowy typ z nowym `id`. Usunięcie typu przy istniejących instancjach → `TypeNotFoundError`.

### §8.7.5 Status typu: active / retired (TO-BE)

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji.

Docelowo każdy typ powinien posiadać `status: Literal["active", "retired"]`:
- `active` → oferowany w nowych instancjach
- `retired` → NIE oferowany w nowych instancjach, ale dostępny w istniejących projektach

---

## §8.8 — Relacja Typ / Instancja a solvery

### §8.8.1 Zasada: solver widzi wyłącznie wartości finalne (BINDING)

```
Solver  ←──  ResolvedParams  ←──  Resolver  ←──  Catalog + Instance + Override
          (parametry finalne)    (precedencja)    (źródła danych)
```

Solver:
- NIE posiada referencji do katalogu,
- NIE wie, czy R′ pochodzi z LineType czy impedance_override,
- operuje na parametrach po rozstrzygnięciu (float, deterministic).

### §8.8.2 White Box — pełny łańcuch odtwarzalności (BINDING)

White Box MUSI umieć odtworzyć pełny łańcuch per instancja:

```
┌─────────────────────────────────────────────┐
│  1. TYP KATALOGOWY (snapshot)               │
│     LineType(id="nkt-240-xlpe",             │
│       r_ohm_per_km=0.125, x_ohm_per_km=0.09│
│       rated_current_a=410)                  │
├─────────────────────────────────────────────┤
│  2. OVERRIDE (jeśli tryb ekspercki)         │
│     impedance_override = {                   │
│       r_ohm_per_km: 0.130  ← zmieniony     │
│     }                                        │
│     → ParameterSource.OVERRIDE              │
├─────────────────────────────────────────────┤
│  3. PARAMETRY ZMIENNE INSTANCJI             │
│     length_km = 3.7                         │
│     status = "closed"                       │
├─────────────────────────────────────────────┤
│  4. RESOLVER (precedencja)                  │
│     r_ohm_per_km = 0.130 (OVERRIDE)        │
│     x_ohm_per_km = 0.09  (TYPE_REF)        │
│     rated_current_a = 410 (TYPE_REF)        │
├─────────────────────────────────────────────┤
│  5. MODEL OBLICZENIOWY                      │
│     R_total = 0.130 × 3.7 = 0.481 Ω       │
│     X_total = 0.09  × 3.7 = 0.333 Ω       │
├─────────────────────────────────────────────┤
│  6. SOLVER → WYNIK                          │
│     Z = 0.481 + j0.333 Ω                   │
│     → Y-bus → Z-bus → Ik''                  │
└─────────────────────────────────────────────┘
```

### §8.8.3 Tabela kompozycji per element (BINDING)

| Element ENM | Typ katalogowy | Parametry zmienne | Override (ekspert) | Ilość |
|-------------|---------------|-------------------|-------------------|-------|
| OverheadLine | `LineType` | `length_km` | `impedance_override` (AS-IS) | — |
| Cable | `CableType` | `length_km` | `impedance_override` (AS-IS) | — |
| Transformer | `TransformerType` | `tap_position`, uziemienie | `uk_percent`, `pk_kw` (TO-BE) | — |
| SwitchBranch | `SwitchEquipmentType` | `status` (open/closed) | — | — |
| Generator (falownik) | `ConverterType` / `InverterType` (TO-BE) | P, Q, tryb pracy | limity, k_sc (TO-BE) | `n_parallel` (TO-BE) |
| Load | — (brak katalogu) | `p_mw`, `q_mvar`, `model` | — | — |
| Source | — (brak katalogu) | `sk3_mva`, `r_ohm`/`x_ohm` | — | — |

---

## §8.9 — Zakazy i anty-wzorce (BINDING)

### §8.9.1 Zakazy architektoniczne

| ID | Zakaz | Uzasadnienie |
|----|-------|-------------|
| **Z-TI-01** | Zakaz ręcznego wpisywania parametrów znamionowych w trybie standardowym | Decyzja #39: katalog = jedyne źródło |
| **Z-TI-02** | Zakaz instancji bez typu (docelowo — TO-BE) | Instancja MUSI wskazywać typ; AS-IS: `catalog_ref=None` dopuszczalne (backward compatibility) |
| **Z-TI-03** | Zakaz modyfikacji katalogu z poziomu projektu | Typ immutable (frozen=True); zmiana = nowy typ z nowym id (Decyzja #42) |
| **Z-TI-04** | Zakaz mieszania parametrów typu i instancji | Resolver rozstrzyga jednoznacznie; solver nie wie o katalogu |
| **Z-TI-05** | Zakaz „domyślnych" typów bez wyboru użytkownika | Kreator MUSI oferować TypePicker; auto-przypisanie typu bez akceptacji użytkownika = NIEDOZWOLONE |
| **Z-TI-06** | Zakaz trwałej modyfikacji danych katalogowych z poziomu trybu eksperckiego | Override dotyczy WYŁĄCZNIE instancji, NIGDY katalogu |
| **Z-TI-07** | Zakaz niejawnych override'ów | Każdy override musi być jawnie oznaczony (`ParameterSource.OVERRIDE`) i widoczny w White Box |

### §8.9.2 Anty-wzorce

| Anty-wzorzec | Dlaczego zabroniony |
|-------------|---------------------|
| Kopiowanie parametrów typu do instancji ENM „na wszelki wypadek" | Duplikacja danych → ryzyko rozbieżności → zaburzenie White Box |
| Tworzenie „typów ad-hoc" per instancja | Typ powinien być współdzielony; typ jednorazowy = zagracenie katalogu |
| Bezpośrednie użycie instancji bez resolvera | Solver musi operować na parametrach rozstrzygniętych; bypass resolvera = utrata audytu |
| Resolver bez ParameterSource | Brak informacji o pochodzeniu parametru = brak White Box |
| Cicha modyfikacja parametrów typu w projekcie | Override musi być jawny — „cicha" zmiana łamie zasadę audytowalności |
| Usunięcie typu z katalogu przy istniejących instancjach | TypeNotFoundError — instancje stracą źródło parametrów |

---

## §8.10 — Macierz pokrycia: Typ ↔ Instancja ↔ Resolver ↔ Solver

### §8.10.1 Pełna macierz per element

| Element | Typ AS-IS | catalog_ref | Resolver | Override | Solver widzi | White Box |
|---------|-----------|-------------|----------|----------|-------------|-----------|
| OverheadLine | `LineType` ✅ | ✅ | ✅ `resolve_line_params()` | ✅ `impedance_override` | R, X, B (finalne) | ✅ ParameterSource |
| Cable | `CableType` ✅ | ✅ | ✅ `resolve_line_params()` | ✅ `impedance_override` | R, X, B (finalne) | ✅ ParameterSource |
| Transformer | `TransformerType` ✅ | ✅ | ✅ `resolve_transformer_params()` | ❌ (TO-BE) | Sn, uk%, pk (finalne) | ✅ ParameterSource |
| SwitchBranch | `SwitchEquipmentType` ✅ | ✅ | ❌ (brak resolver) | ❌ | Un, In, Ik (z instancji) | ❌ (brak ParameterSource) |
| Generator (falownik) | `ConverterType`/`InverterType` ✅ | ❌ (GAP) | ❌ (GAP) | ❌ (TO-BE) | P, Q (z instancji) | ❌ (brak łańcucha) |
| Source | — (wyjątek) | ❌ (celowe) | — | — | Z_source (z mappera) | ✅ (R, X, Sk'') |
| Load | — (opcjonalne) | ❌ (celowe) | — | — | P, Q (z mappera) | ✅ (p_mw, q_mvar) |
| FuseBranch | — (częściowe) | ✅ | ❌ (brak resolver) | ❌ | In, Un (z instancji) | ❌ |

### §8.10.2 Zidentyfikowane GAP-y

| GAP | Decision | Element | Brakujący komponent | Priorytet |
|-----|----------|---------|---------------------|-----------|
| Generator.catalog_ref | #15 | Generator | Pole `catalog_ref` na Generator ENM | WYSOKI |
| Generator resolver | #15 | Generator | Funkcja `resolve_generator_params()` | WYSOKI |
| Generator override | #16 | Generator | Mechanizm override (k_sc, limity) | ŚREDNI |
| n_parallel | #17 | Generator | Pole `n_parallel: int` | ŚREDNI |
| SwitchBranch resolver | — | SwitchBranch | Funkcja `resolve_switch_params()` | NISKI |
| FuseBranch resolver | — | FuseBranch | Brak dedykowanego FuseType + resolver | NISKI |
| Transformer override | #16 | Transformer | Override uk%, pk per instancja | NISKI |
| Type status active/retired | #41 | Katalog globalny | Pole `status` na wszystkich typach | NISKI |

---

## §8.11 — API katalogowe (AS-IS)

### §8.11.1 Endpointy REST

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/catalog/line-types` | Lista wszystkich typów linii |
| GET | `/catalog/cable-types` | Lista wszystkich typów kabli |
| GET | `/catalog/transformer-types` | Lista wszystkich typów transformatorów |
| GET | `/catalog/switch-equipment-types` | Lista wszystkich typów łączników |
| POST | `/catalog/branches/{element_id}/type` | Przypisanie type_ref do linii/kabla |
| POST | `/catalog/transformers/{element_id}/type` | Przypisanie type_ref do transformatora |
| POST | `/catalog/switches/{element_id}/type` | Przypisanie type_ref do łącznika |
| POST | `/catalog/import` | Import biblioteki typów (MERGE/REPLACE) |
| GET | `/catalog/export` | Eksport biblioteki z fingerprintem |

**Kod AS-IS:** `api/catalog.py`

---

## §8.12 — Definition of Done (Rozdział 8)

### §8.12.1 Kryteria akceptacji

| # | Kryterium | Status |
|---|-----------|--------|
| 1 | Zasada TYP vs INSTANCJA sformułowana (formularnie: §8.1.1) | ✅ |
| 2 | Definicja parametru znamionowego vs zmiennego (§8.1.2) | ✅ |
| 3 | Wyjątki od katalogu (Source, Load, Bus) jawnie udokumentowane (§8.1.3) | ✅ |
| 4 | 9 klas typów katalogowych opisanych 1:1 z `catalog/types.py` (§8.2.3) | ✅ |
| 5 | CatalogRepository (frozen, immutable) opisany 1:1 z `catalog/repository.py` (§8.4.2) | ✅ |
| 6 | Parametry instancji per element ENM opisane 1:1 z `enm/models.py` (§8.3.3) | ✅ |
| 7 | ParameterSource enum (OVERRIDE/TYPE_REF/INSTANCE) opisany 1:1 z `resolver.py` (§8.6.1) | ✅ |
| 8 | 3 funkcje resolvera z precedencją opisane 1:1 z `resolver.py` (§8.6.3) | ✅ |
| 9 | Resolved*Params (3 typy) opisane 1:1 z `resolver.py` (§8.6.4–§8.6.6) | ✅ |
| 10 | TypeNotFoundError semantyka opisana (§8.6.7) | ✅ |
| 11 | Integracja resolvera w pipeline (mapper → resolver → solver) opisana (§8.6.8) | ✅ |
| 12 | TypeLibraryManifest + ImportMode + fingerprint opisane 1:1 z `governance.py` (§8.7) | ✅ |
| 13 | Zakazy Z-TI-01..Z-TI-07 sformułowane (§8.9.1) | ✅ |
| 14 | Macierz pokrycia Typ↔Instancja↔Resolver↔Solver kompletna (§8.10.1) | ✅ |
| 15 | GAP-y zidentyfikowane z referencjami do Decision Matrix (§8.10.2) | ✅ |
| 16 | White Box łańcuch typ→override→instancja→solver→wynik opisany (§8.8.2) | ✅ |
| 17 | API katalogowe opisane (§8.11) | ✅ |
| 18 | Sekcje TO-BE NIE blokują zatwierdzenia (zgodnie z SPEC_EXPANSION_PLAN §0) | ✅ |

---

## §8.A — Suplement v1.1: Domknięcie kontraktów TO-BE

> **Cel:** Domknięcie kontraktów audytowych trybu eksperckiego i macierzy kompatybilności,
> przygotowanie systemu do benchmarku 10/18 (Study Cases & Scenarios).
> **Status:** Kontrakty BINDING. NIE cofają ustaleń v1.0 — wyłącznie doprecyzowują.

---

### §8.A.1 Tryb ekspercki — kontrakt audytowy (BINDING — Decyzja #69)

#### §8.A.1.1 Zasada nadrzędna

> **Override parametrów typu jest dozwolony WYŁĄCZNIE w trybie eksperckim
> i MUSI być w pełni audytowalny.**

#### §8.A.1.2 Stan AS-IS (v1)

Jedyny override AS-IS: `impedance_override` na `LineBranch` (`branch.py:212`).

Override jest zapisany w modelu ENM jako jawne pole:

```python
# core/branch.py — LineBranch
impedance_override: ImpedanceOverride | None  # (r_ohm_per_km, x_ohm_per_km, b_us_per_km)
```

Resolver (`resolve_line_params()`) uwzględnia override z najwyższym priorytetem:
- `ParameterSource.OVERRIDE > TYPE_REF > INSTANCE`

**Brak kontraktu audytowego AS-IS** — override jest zapisany w modelu, ale bez:
- identyfikacji autora,
- timestampu zmiany,
- uzasadnienia,
- śledzenia wpływu na wyniki.

#### §8.A.1.3 Minimalny AuditContract (TO-BE, BINDING)

Każdy override MUSI zapisywać:

| Pole | Typ | Opis | Wymagane |
|------|-----|------|----------|
| `override_id` | UUID | Identyfikator override | ✅ |
| `changed_by` | str | Identyfikator użytkownika / roli | ✅ |
| `changed_at` | datetime (ISO 8601) | Timestamp zmiany | ✅ |
| `reason` | str | Uzasadnienie tekstowe (min. 10 znaków) | ✅ |
| `parameters_changed` | dict[str, {old, new}] | Lista zmienionych parametrów z wartościami przed/po | ✅ |
| `expert_flag` | bool = True | Flaga trybu eksperckiego | ✅ |
| `impact_scope` | list[str] | Lista solverów, których wyniki są invalidowane | ✅ |

#### §8.A.1.4 Integracja z White Box

White Box MUSI raportować override jako element śladu:

```
[OVERRIDE] element_id=branch_42
  changed_by: "jan.kowalski"
  changed_at: "2025-01-15T14:30:00Z"
  reason: "Korekta impedancji na podstawie pomiarów terenowych"
  r_ohm_per_km: 0.320 → 0.345
  x_ohm_per_km: 0.370 → 0.385
  source: ParameterSource.OVERRIDE
```

#### §8.A.1.5 Rozszerzenie override (TO-BE, Decyzja #16)

| Element | Override docelowy | Parametry | Status |
|---------|-------------------|-----------|--------|
| LineBranch | `impedance_override` | R', X', B' | ✅ AS-IS |
| Transformer | `transformer_override` (TO-BE) | uk%, pk | TO-BE |
| Generator (falownik) | `inverter_override` (TO-BE) | k_sc, In, limity Q | TO-BE |

Każdy nowy override MUSI implementować AuditContract (§8.A.1.3).

#### §8.A.1.6 Zakazy (BINDING)

| ID | Zakaz | Uzasadnienie |
|----|-------|-------------|
| **Z-EXP-01** | Zakaz override bez śladu audytowego (AuditContract) | Audytowalność |
| **Z-EXP-02** | Zakaz override w trybie standardowym UI — wyłącznie tryb ekspercki | Bezpieczeństwo |
| **Z-EXP-03** | Zakaz override parametrów krytycznych bezpieczeństwa bez flagi `expert_flag=True` | Governance |
| **Z-EXP-04** | Zakaz override bez uzasadnienia (`reason` wymagane, min. 10 znaków) | Traceability |
| **Z-EXP-05** | Zakaz trwałej modyfikacji katalogu z poziomu override (override ≠ edycja typu) | Immutability katalogu |

---

### §8.A.2 CompatibilityMatrix — macierz kompatybilności typów (BINDING — Decyzja #70)

#### §8.A.2.1 Definicja

> **CompatibilityMatrix = macierz relacji kompatybilności między typami katalogowymi,
> służąca do walidacji konfiguracji i generowania ostrzeżeń.**

#### §8.A.2.2 Zakres

| Relacja | Kryterium | Severity | Opis |
|---------|-----------|----------|------|
| InverterType ↔ TransformerType | `Sn_inv ≤ Sn_trafo`, `Un_inv = Ulv_trafo` | WARNING | Zgodność mocy/napięcia falownika z transformatorem nn/SN |
| InverterType ↔ ProtectionDeviceType | `In_inv ≤ In_protection` | WARNING | Zgodność prądu znamionowego z nastaw zabezpieczenia |
| TransformerType ↔ ProtectionDeviceType | `In_trafo_lv ≤ In_protection` | WARNING | Zgodność prądu trafo z zabezpieczeniem |
| CableType ↔ ProtectionDeviceType | `In_cable ≥ I_pickup` | WARNING | Obciążalność kabla vs nastawa zabezpieczenia |
| LineType ↔ ProtectionDeviceType | `In_line ≥ I_pickup` | WARNING | Obciążalność linii vs nastawa zabezpieczenia |

#### §8.A.2.3 Charakter macierzy

- **Informacyjna** — NIE blokuje konfiguracji (generuje WARNING, nie ERROR).
- **Walidacyjna** — używana przez kreator i walidator pre-analysis.
- **Nie zmienia fizyki** — solver nie korzysta z CompatibilityMatrix.
- **White Box** — niezgodności raportowane jako ostrzeżenia w trace.
- **READ-ONLY** — macierz nie jest modyfikowalna przez użytkownika.

#### §8.A.2.4 Stan AS-IS (v1)

**CompatibilityMatrix nie jest zaimplementowana w v1.** Walidacja zgodności typów:
- Brak automatycznego sprawdzania InverterType ↔ TransformerType.
- Brak ostrzeżeń o niezgodności In/Un/Sn.
- Kreator nie weryfikuje zgodności typów między elementami.

#### §8.A.2.5 Kontrakt docelowy (TO-BE)

```python
@dataclass(frozen=True)
class CompatibilityCheck:
    type_a_id: str
    type_a_class: str             # np. "InverterType"
    type_b_id: str
    type_b_class: str             # np. "TransformerType"
    criterion: str                # np. "Sn_inv ≤ Sn_trafo"
    is_compatible: bool
    severity: str                 # WARNING
    message_pl: str               # Deterministyczny komunikat PL

@dataclass(frozen=True)
class CompatibilityMatrix:
    checks: tuple[CompatibilityCheck, ...]
    project_id: str
    evaluated_at: datetime
    all_compatible: bool          # True jeśli brak WARNING
```

---

### §8.A.3 Macierz zmian między Study Case'ami (BINDING — Decyzja #71)

#### §8.A.3.1 Zasada

> **Między Study Case'ami (na tym samym ENM snapshot) mogą się zmieniać WYŁĄCZNIE
> parametry konfiguracyjne — NIE topologia ani typy katalogowe.**

#### §8.A.3.2 Tabela: co zmienne, co stałe

| Kategoria | Przykłady | Zmienne między Cases? | Opis |
|-----------|-----------|----------------------|------|
| **StudyCaseConfig** | c_factor_max/min, base_mva, tolerance | ✅ TAK (v1) | Parametry obliczeń — jedyna zmienna v1 |
| **ProtectionConfig** | template_ref, overrides | ✅ TAK (v1) | Konfiguracja zabezpieczeń per Case |
| Stany łączników | Switch OPEN/CLOSED | ❌ NIE (v1) / ✅ TAK (TO-BE) | Wymaga nakładki Case (overlay) |
| Profile obciążeń | Load.p_mw, Load.q_mvar | ❌ NIE (v1) / ✅ TAK (TO-BE) | Wymaga profili per Case |
| Profile generacji | Generator.p_mw, Generator.q_mvar | ❌ NIE (v1) / ✅ TAK (TO-BE) | Wymaga profili per Case |
| Tryby BESS | bess_mode: CHARGE/DISCHARGE/IDLE | ❌ NIE (v1) / ✅ TAK (TO-BE) | Wymaga §7.A.3 |
| Aktywność źródeł | Source.in_service | ❌ NIE (v1) / ✅ TAK (TO-BE) | Wymaga nakładki Case |
| **Topologia ENM** | Bus, Branch, Switch — istnienie elementów | ❌ **NIE (BINDING)** | Wymaga nowego ENM snapshot |
| **Typy katalogowe** | LineType, TransformerType parametry | ❌ **NIE (BINDING)** | Typ = frozen immutable |
| **Parametry znamionowe** | R', X', uk%, Sn | ❌ **NIE (BINDING)** | Pochodzą z katalogu (read-only) |
| **Override ekspercki** | impedance_override | ❌ NIE (v1) / ✅ TAK (TO-BE) | Wymaga AuditContract §8.A.1 |

#### §8.A.3.3 Stan AS-IS (v1)

W v1 Study Case zmienia **WYŁĄCZNIE** `StudyCaseConfig` i `ProtectionConfig`. Wszystkie pozostałe parametry (stany łączników, profile P/Q, aktywność źródeł) są częścią ENM i NIE mogą być zmieniane per Case.

**Konsekwencja:** Zmiana stanu łącznika, profilu obciążenia lub trybu BESS wymaga nowego ENM snapshot → invalidacja WSZYSTKICH Case'ów.

#### §8.A.3.4 Kontrakt docelowy — nakładka Case (TO-BE, osobna ADR)

Docelowo Study Case BĘDZIE posiadać **warstwę nakładkową** (overlay):

```python
@dataclass(frozen=True)
class StudyCaseOverlay:
    switch_overrides: dict[str, str]            # {switch_id: "OPEN"/"CLOSED"}
    load_profiles: dict[str, dict]              # {load_id: {p_mw, q_mvar}}
    gen_profiles: dict[str, dict]               # {gen_id: {p_mw, q_mvar, bess_mode}}
    source_overrides: dict[str, dict]           # {source_id: {in_service: bool}}
```

Reguły nakładki:
- Overlay NIE mutuje ENM — nadpisuje parametry zmienne na etapie budowy `StudyCaseContext`.
- Overlay jest częścią Study Case (przechowywany obok config).
- Solver widzi finalny stan (ENM + overlay = StudyCaseContext).
- White Box raportuje overlay jako element śladu (`source: OVERLAY`).

---

### §8.A.4 Definition of Done (Suplement v1.1)

| # | Kryterium | Status |
|---|-----------|--------|
| 1 | AuditContract dla trybu eksperckiego zdefiniowany (7 pól obowiązkowych) | ✅ |
| 2 | Integracja override z White Box opisana (format trace) | ✅ |
| 3 | Rozszerzenie override na Transformer i Generator zarysowane (TO-BE) | ✅ |
| 4 | Zakazy Z-EXP-01..05 sformułowane | ✅ |
| 5 | CompatibilityMatrix zdefiniowana (5 relacji, WARNING severity) | ✅ |
| 6 | Kontrakt docelowy CompatibilityCheck opisany | ✅ |
| 7 | Macierz zmian między Cases (co zmienne, co stałe) zdefiniowana | ✅ |
| 8 | Kontrakt nakładki Case (overlay) zarysowany jako TO-BE | ✅ |

---

**DOMENA TYPU VS INSTANCJI ORAZ KATALOGÓW TYPÓW W ROZDZIALE 8 JEST ZAMKNIĘTA (v1.1).**

---

*Koniec Rozdziału 8*

