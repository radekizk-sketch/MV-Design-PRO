> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# EnergyNetworkModel (ENM) — Specyfikacja v1.0

**Status:** BINDING
**Warstwa:** Domain
**Format:** Pydantic v2 (backend) + TypeScript interfaces (frontend)

---

## 1. Cel

ENM to **kanoniczny kontrakt modelu sieci elektroenergetycznej** — jedno źródło prawdy
dla każdego projektu (case-bound). Wszystkie moduły (Wizard, SLD, Solver, Proof Engine)
operują na ENM bezpośrednio lub przez deterministyczną transformację.

## 2. Struktura korzenia

```
EnergyNetworkModel
+── header: ENMHeader
+── buses: Bus[]
+── branches: Branch[]          # dyskryminowany union (OverheadLine | Cable | SwitchBranch | FuseBranch)
+── transformers: Transformer[]
+── sources: Source[]
+── loads: Load[]
└── generators: Generator[]
```

## 3. ENMHeader

| Pole | Typ | Opis |
|------|-----|------|
| enm_version | `"1.0"` | Wersja schematu |
| name | `str` | Nazwa projektu |
| description | `str?` | Opcjonalny opis |
| created_at | `datetime` | Data utworzenia (UTC) |
| updated_at | `datetime` | Data ostatniej modyfikacji (UTC) |
| revision | `int` | Monotonicznie rosnący numer rewizji |
| hash_sha256 | `str` | Hash kanoniczny zawartości |
| defaults | `ENMDefaults` | Domyślne parametry: `frequency_hz=50`, `unit_system="SI"` |

## 4. Elementy

### 4.1 Bus (szyna / węzeł)

| Pole | Typ | Obowiązkowe | Opis |
|------|-----|-------------|------|
| voltage_kv | `float` | tak | Napięcie znamionowe |
| phase_system | `"3ph"` | tak | System fazowy |
| zone | `str?` | nie | Strefa topologiczna |
| grounding | `GroundingConfig?` | nie | Konfiguracja uziemienia |
| nominal_limits | `BusLimits?` | nie | Limity U_min/U_max [pu] |

### 4.2 Branch (discriminated union na `type`)

**OverheadLine** (`type: "line_overhead"`): R/X/B [?/km, S/km], length_km, R0/X0/B0 opcjonalne.

**Cable** (`type: "cable"`): Jak linia + `insulation: XLPE|PVC|PAPER`.

**SwitchBranch** (`type: "switch"|"breaker"|"bus_coupler"|"disconnector"`): łącznik z opcjonalną impedancję R/X.

**FuseBranch** (`type: "fuse"`): Bezpiecznik z parametrami znamionowymi.

### 4.3 Transformer

| Pole | Typ | Obowiązkowe | Opis |
|------|-----|-------------|------|
| hv_bus_ref / lv_bus_ref | `str` | tak | Referencje do szyn HV/LV |
| sn_mva | `float` | tak | Moc znamionowa |
| uhv_kv / ulv_kv | `float` | tak | Napięcia znamionowe |
| uk_percent | `float` | tak | Napięcie zwarcia [%] |
| pk_kw | `float` | tak | Straty obciążeniowe |
| vector_group | `str?` | nie | Grupa połączeń (np. Dyn11) |
| tap_position | `int?` | nie | Pozycja zaczepów |

### 4.4 Source (punkt zasilania)

| Pole | Typ | Opis |
|------|-----|------|
| bus_ref | `str` | Szyna źródłowa |
| model | `"thevenin" \| "short_circuit_power" \| "external_grid"` | Model źródła |
| sk3_mva | `float?` | Moc zwarciowa trójfazowa |
| rx_ratio | `float?` | Stosunek R/X |
| r_ohm / x_ohm | `float?` | Impedancja bezpośrednia |
| r0_ohm / x0_ohm | `float?` | Impedancja zerowa |

### 4.5 Load / Generator

**Load:** `bus_ref`, `p_mw`, `q_mvar`, `model: "pq"|"zip"`.
**Generator:** `bus_ref`, `p_mw`, `q_mvar?`, `gen_type`, `limits`.

## 5. Hash kanoniczny

```
SHA-256(json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",",":")))
```

**Pola wykluczone z hash:** `created_at`, `updated_at`, `hash_sha256`, element `.id` (UUID).

Cel: ten sam model logiczny — ten sam hash niezależnie od porządku elementów i timestamp'ów.

## 6. ENM — NetworkGraph (mapping)

Deterministyczna transformacja do formatu solverów:

| ENM | NetworkGraph | Uwagi |
|-----|-------------|-------|
| Bus | Node | SLACK jeśli source_bus, PQ w.p.p. |
| OverheadLine/Cable | LineBranch | R_total = r * l, X_total = x * l |
| SwitchBranch | Switch | OPEN/CLOSED state |
| FuseBranch | Switch(FUSE) | |
| Transformer | TransformerBranch | sn, uhv, ulv, uk%, pk |
| Source (Sk'') | Virtual GND + LineBranch | Z = Un2/Sk'', R/X decomposition |
| Load | P/Q na Node | Konwencja ujemna (odbiór) |

### 6.1 Impedancja źródła (IEC 60909)

```
Z_abs = Un2 / Sk'' [?]
X = Z_abs / ?(1 + (R/X)2)
R = X — (R/X)
```

Modelowana jako wirtualny węzeł GND (PQ, P=Q=0) + gałąź impedancyjna do szyny źródłowej.

## 7. ENMValidator

### Blokery (E001-E008)

| Kod | Opis | Krok |
|-----|------|------|
| E001 | Brak źródła zasilania | K2 |
| E002 | Brak szyn | K3 |
| E003 | Wyspy odcięte od źródła | K4 |
| E004 | Szyna z napięciem ? 0 | K3 |
| E005 | Ga─── z R=0 i X=0 | K4 |
| E006 | Transformator z uk% ? 0 | K5 |
| E007 | Transformator HV = LV szyna | K5 |
| E008 | źródło bez parametrów zwarciowych | K2 |

### Ostrzeżenia (W001-W004)

| Kod | Opis | Krok |
|-----|------|------|
| W001 | Ga─── bez Z0 | K7 |
| W002 | źródło bez Z0 | K2 |
| W003 | Brak odbiorów/generatorów | K6 |
| W004 | Transformator bez grupy połączeń | K5 |

### AnalysisAvailability

| Analiza | Warunek |
|---------|---------|
| short_circuit_3f | Brak blokerów |
| short_circuit_1f | Brak blokerów + brak W001/W002 |
| load_flow | Brak blokerów + odbiory/generatory |

## 8. API

| Metoda | ścieżka | Opis |
|--------|---------|------|
| GET | `/api/cases/{case_id}/enm` | Pobranie ENM (lub domyślny pusty) |
| PUT | `/api/cases/{case_id}/enm` | Autosave: revision++, hash przeliczony |
| GET | `/api/cases/{case_id}/enm/validate` | Walidacja energetyczna |
| POST | `/api/cases/{case_id}/runs/short-circuit` | ENM — NetworkGraph — SC 3F — wyniki |

PUT jest idempotentny: identyczny hash — brak zmian (no-op).

## 9. Plik źródłowy

| Moduł | ścieżka |
|-------|---------|
| Models (Pydantic) | `backend/src/enm/models.py` |
| Hash | `backend/src/enm/hash.py` |
| Mapping | `backend/src/enm/mapping.py` |
| Validator | `backend/src/enm/validator.py` |
| API | `backend/src/api/enm.py` |
| TypeScript types | `frontend/src/types/enm.ts` |
| Wizard UI | `frontend/src/ui/wizard/WizardPage.tsx` |

---

**END OF SPEC**
