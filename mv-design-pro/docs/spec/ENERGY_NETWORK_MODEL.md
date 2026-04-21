> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# EnergyNetworkModel (ENM) � Specyfikacja v1.0

**Status:** BINDING
**Warstwa:** Domain
**Format:** Pydantic v2 (backend) + TypeScript interfaces (frontend)

---

## 1. Cel

ENM to **kanoniczny kontrakt modelu sieci elektroenergetycznej** � jedno �r�d�o prawdy
dla ka�dego projektu (case-bound). Wszystkie modu�y (Wizard, SLD, Solver, Proof Engine)
operuj� na ENM bezpo�rednio lub przez deterministyczn� transformacj�.

## 2. Struktura korzenia

```
EnergyNetworkModel
+�� header: ENMHeader
+�� buses: Bus[]
+�� branches: Branch[]          # dyskryminowany union (OverheadLine | Cable | SwitchBranch | FuseBranch)
+�� transformers: Transformer[]
+�� sources: Source[]
+�� loads: Load[]
L�� generators: Generator[]
```

## 3. ENMHeader

| Pole | Typ | Opis |
|------|-----|------|
| enm_version | `"1.0"` | Wersja schematu |
| name | `str` | Nazwa projektu |
| description | `str?` | Opcjonalny opis |
| created_at | `datetime` | Data utworzenia (UTC) |
| updated_at | `datetime` | Data ostatniej modyfikacji (UTC) |
| revision | `int` | Monotonicznie rosn�cy numer rewizji |
| hash_sha256 | `str` | Hash kanoniczny zawarto�ci |
| defaults | `ENMDefaults` | Domy�lne parametry: `frequency_hz=50`, `unit_system="SI"` |

## 4. Elementy

### 4.1 Bus (szyna / w�ze�)

| Pole | Typ | Obowi�zkowe | Opis |
|------|-----|-------------|------|
| voltage_kv | `float` | tak | Napi�cie znamionowe |
| phase_system | `"3ph"` | tak | System fazowy |
| zone | `str?` | nie | Strefa topologiczna |
| grounding | `GroundingConfig?` | nie | Konfiguracja uziemienia |
| nominal_limits | `BusLimits?` | nie | Limity U_min/U_max [pu] |

### 4.2 Branch (discriminated union na `type`)

**OverheadLine** (`type: "line_overhead"`): R/X/B [?/km, S/km], length_km, R0/X0/B0 opcjonalne.

**Cable** (`type: "cable"`): Jak linia + `insulation: XLPE|PVC|PAPER`.

**SwitchBranch** (`type: "switch"|"breaker"|"bus_coupler"|"disconnector"`): ��cznik z opcjonaln� impedancj� R/X.

**FuseBranch** (`type: "fuse"`): Bezpiecznik z parametrami znamionowymi.

### 4.3 Transformer

| Pole | Typ | Obowi�zkowe | Opis |
|------|-----|-------------|------|
| hv_bus_ref / lv_bus_ref | `str` | tak | Referencje do szyn HV/LV |
| sn_mva | `float` | tak | Moc znamionowa |
| uhv_kv / ulv_kv | `float` | tak | Napi�cia znamionowe |
| uk_percent | `float` | tak | Napi�cie zwarcia [%] |
| pk_kw | `float` | tak | Straty obci��eniowe |
| vector_group | `str?` | nie | Grupa po��cze� (np. Dyn11) |
| tap_position | `int?` | nie | Pozycja zaczep�w |

### 4.4 Source (punkt zasilania)

| Pole | Typ | Opis |
|------|-----|------|
| bus_ref | `str` | Szyna �r�d�owa |
| model | `"thevenin" \| "short_circuit_power" \| "external_grid"` | Model �r�d�a |
| sk3_mva | `float?` | Moc zwarciowa tr�jfazowa |
| rx_ratio | `float?` | Stosunek R/X |
| r_ohm / x_ohm | `float?` | Impedancja bezpo�rednia |
| r0_ohm / x0_ohm | `float?` | Impedancja zerowa |

### 4.5 Load / Generator

**Load:** `bus_ref`, `p_mw`, `q_mvar`, `model: "pq"|"zip"`.
**Generator:** `bus_ref`, `p_mw`, `q_mvar?`, `gen_type`, `limits`.

## 5. Hash kanoniczny

```
SHA-256(json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",",":")))
```

**Pola wykluczone z hash:** `created_at`, `updated_at`, `hash_sha256`, element `.id` (UUID).

Cel: ten sam model logiczny � ten sam hash niezale�nie od porz�dku element�w i timestamp'�w.

## 6. ENM � NetworkGraph (mapping)

Deterministyczna transformacja do formatu solver�w:

| ENM | NetworkGraph | Uwagi |
|-----|-------------|-------|
| Bus | Node | SLACK je�li source_bus, PQ w.p.p. |
| OverheadLine/Cable | LineBranch | R_total = r * l, X_total = x * l |
| SwitchBranch | Switch | OPEN/CLOSED state |
| FuseBranch | Switch(FUSE) | |
| Transformer | TransformerBranch | sn, uhv, ulv, uk%, pk |
| Source (Sk'') | Virtual GND + LineBranch | Z = Un2/Sk'', R/X decomposition |
| Load | P/Q na Node | Konwencja ujemna (odbi�r) |

### 6.1 Impedancja �r�d�a (IEC 60909)

```
Z_abs = Un2 / Sk'' [?]
X = Z_abs / ?(1 + (R/X)2)
R = X � (R/X)
```

Modelowana jako wirtualny w�ze� GND (PQ, P=Q=0) + ga��� impedancyjna do szyny �r�d�owej.

## 7. ENMValidator

### Blokery (E001-E008)

| Kod | Opis | Krok |
|-----|------|------|
| E001 | Brak �r�d�a zasilania | K2 |
| E002 | Brak szyn | K3 |
| E003 | Wyspy odci�te od �r�d�a | K4 |
| E004 | Szyna z napi�ciem ? 0 | K3 |
| E005 | Ga��� z R=0 i X=0 | K4 |
| E006 | Transformator z uk% ? 0 | K5 |
| E007 | Transformator HV = LV szyna | K5 |
| E008 | �r�d�o bez parametr�w zwarciowych | K2 |

### Ostrze�enia (W001-W004)

| Kod | Opis | Krok |
|-----|------|------|
| W001 | Ga��� bez Z0 | K7 |
| W002 | �r�d�o bez Z0 | K2 |
| W003 | Brak odbior�w/generator�w | K6 |
| W004 | Transformator bez grupy po��cze� | K5 |

### AnalysisAvailability

| Analiza | Warunek |
|---------|---------|
| short_circuit_3f | Brak bloker�w |
| short_circuit_1f | Brak bloker�w + brak W001/W002 |
| load_flow | Brak bloker�w + odbiory/generatory |

## 8. API

| Metoda | �cie�ka | Opis |
|--------|---------|------|
| GET | `/api/cases/{case_id}/enm` | Pobranie ENM (lub domy�lny pusty) |
| PUT | `/api/cases/{case_id}/enm` | Autosave: revision++, hash przeliczony |
| GET | `/api/cases/{case_id}/enm/validate` | Walidacja energetyczna |
| POST | `/api/cases/{case_id}/runs/short-circuit` | ENM � NetworkGraph � SC 3F � wyniki |

PUT jest idempotentny: identyczny hash � brak zmian (no-op).

## 9. Plik �r�d�owy

| Modu� | �cie�ka |
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
