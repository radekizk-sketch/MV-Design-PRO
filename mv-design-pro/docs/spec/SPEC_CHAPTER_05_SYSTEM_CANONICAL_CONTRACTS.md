> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# ROZDZIAŁ 5 — KONTRAKTY KANONICZNE SYSTEMU: KREATOR, KATALOGI, STACJE, ZABEZPIECZENIA, MODELE NIEDOZWOLONE

**Wersja:** 1.1 SUPPLEMENT
**Data:** 2026-02-09
**Status:** AS-IS (1:1 z kodem) + TO-BE (sekcje oznaczone)
**Warstwa:** Application + Catalog + ENM Meta + Validation + White Box
**Zależności:** Rozdział 2 (§2.3–§2.21), Rozdział 3 (§3.1–§3.11), Rozdział 4 (§4.1–§4.19), AUDIT §9 (Decyzje #15–#33, #34–#42)
**Autor:** System Architect + PhD Energetyki

---

## 5.1 Cel i zakres rozdziału

Niniejszy rozdział definiuje **kontrakty kanoniczne na poziomie całego systemu** MV-DESIGN-PRO. Obejmuje:

1. Zasadę kompozycji: TYP × parametry zmienne × ilość × override = obiekt ENM
2. Kreator (Wizard) jako jedyną ścieżkę tworzenia modelu
3. Katalog typów jako jedyne źródło parametrów znamionowych
4. Parametry zmienne i tryb EKSPERT (override)
5. Źródła, odbiory, falowniki — kanon fizyczny
6. Stacje SN/nn i stacje zasilane liniowo
7. Powiązanie zabezpieczeń z ENM (Bay → Protection → Branch)
8. Study Case — architektura scenariuszy obliczeniowych
9. Modele niedozwolone (illegal models) — reguły blokujące
10. Spójność ENM → Solver → White Box → Raporty

**Granica rozdziału:** Rozdział definiuje kontrakty systemowe integrujące wszystkie warstwy. NIE powtarza treści z Rozdziałów 1–4 — referencuje je. NIE opisuje solverów (→ SPEC_10, SPEC_11).

---

## 5.2 Zasada kompozycji — kanon systemu (Decyzja #18, Rozdział 2 §2.19)

### 5.2.1 Reguła fundamentalna (BINDING)

Każdy element sieciowy w MV-DESIGN-PRO jest wynikiem relacji:

```
TYP (katalog, READ-ONLY)
+ PARAMETRY ZMIENNE (instancja, kreator)
+ ILOŚĆ (jeżeli dotyczy)
+ OVERRIDE EKSPERT (jeżeli użyty, audytowalny)
= OBIEKT ENM
```

### 5.2.2 Priorytet danych (3-poziomowa precedencja)

```
OVERRIDE EKSPERT (najwyższy priorytet)
> TYP (katalog)
> PARAMETR INSTANCJI (fallback — backward compatibility)
```

**Implementacja:** `ParameterSource` enum + `resolve_line_params()` / `resolve_transformer_params()` w `catalog/resolver.py` (AS-IS, Rozdział 4 §4.6).

### 5.2.3 Tabela kompozycji per element (BINDING)

| Element ENM | Typ katalogowy | Parametry zmienne (kreator) | Override (EKSPERT) | Ilość | Status |
|-------------|---------------|----------------------------|-------------------|-------|--------|
| OverheadLine | `LineType` | `length_km`, `status` | `impedance_override` | — | AS-IS |
| Cable | `CableType` | `length_km`, `status`, `insulation` | `impedance_override` | — | AS-IS |
| Transformer | `TransformerType` | `tap_position`, `hv_neutral`, `lv_neutral` | `uk_percent`, `pk_kw` (TO-BE) | — | AS-IS (resolver) |
| SwitchBranch | `SwitchEquipmentType` | `status` (open/closed) | — | — | AS-IS (typ), TO-BE (resolver) |
| FuseBranch | — (brak typu) | `rated_current_a`, `rated_voltage_kv` | — | — | AS-IS |
| Generator (falownik) | `ConverterType` / `InverterType` | `p_mw`, `q_mvar`, tryb pracy | limity, `k_sc` (TO-BE) | `n_parallel` (TO-BE) | AS-IS (typy w katalogu), TO-BE (resolver, `catalog_ref`) |
| Generator (synchroniczny) | — (brak typu) | `p_mw`, `q_mvar` | — | — | AS-IS |
| Load | — (brak typu) | `p_mw`, `q_mvar`, `model` | — | — | AS-IS |
| Source | — (brak typu) | `sk3_mva`, `r_ohm`/`x_ohm`, `rx_ratio` | — | — | AS-IS |
| ProtectionDevice | `ProtectionDeviceType` + `ProtectionCurve` + `ProtectionSettingTemplate` | nastawy, `location_element_id` | override nastaw (TO-BE) | — | AS-IS (typy), TO-BE (template binding) |

### 5.2.4 Zakazy (BINDING)

- **ZAKAZ** ręcznego wpisywania parametrów znamionowych w trybie standardowym — kreator wymusza wybór z katalogu
- **ZAKAZ** tworzenia obiektów ENM bez referencji do katalogu (tryb standardowy; backward compatibility: `ParameterSource.INSTANCE` dozwolony jako fallback, ale raportowany jako WARNING I002)
- **ZAKAZ** tworzenia obiektów „wiszących" poza topologią (walidacja E003: connectivity)
- **ZAKAZ** niejawnych/cichych modyfikacji parametrów typu — zmiana wymaga jawnego trybu EKSPERT

---

## 5.3 Kreator (Wizard) — kontrakt kanoniczny (Decyzja #34)

### 5.3.1 Rola kreatora (BINDING)

Kreator:
- **JEST** prowadzącym mechanizmem modelowania — sekwencyjnym kontrolerem edycji ENM
- **JEST** jedyną dozwoloną ścieżką tworzenia kompletnego modelu sieci (pierwsza sesja)
- **NIE JEST** edytorem dowolnym — wymusza kompletność danych per krok
- **NIE JEST** osobnym modelem danych — operuje BEZPOŚREDNIO na ENM
- **NIE JEST** drzewem ENM — drzewo ENM umożliwia pełną edycję po zakończeniu kreatora

Kreator:
- wymusza kompletność danych,
- blokuje przejście dalej przy brakach,
- gwarantuje fizyczną poprawność modelu.

**Plik źródłowy (frontend):** `frontend/src/ui/wizard/WizardPage.tsx`
**Plik źródłowy (backend):** `application/wizard_runtime/service.py`, `application/wizard_actions/service.py`

### 5.3.2 Architektura: frontend = kroki, backend = akcje

| Warstwa | Mechanizm | Opis |
|---------|-----------|------|
| **Frontend** | 10 kroków K1–K10 (`WizardPage.tsx`) | Sekwencja wizualna z walidacją per krok |
| **Backend** | Action-based (`wizard_runtime/service.py`) | Sesja → akcje → snapshot → commit/abort |

**Backend NIE definiuje** jawnych kroków K1–K10 — jest action-based. Frontend mapuje wizualną sekwencję na atomowe akcje backendowe.

### 5.3.3 Sekwencja kanoniczna — 10 kroków (AS-IS)

| Krok | ID | Nazwa (PL) | Tworzy w ENM | Status kroku |
|------|----|-----------|-------------|-------------|
| 1 | K1 | Parametry modelu | ENMHeader (nazwa, częstotliwość, opis) | `empty \| partial \| complete` |
| 2 | K2 | Punkt zasilania | Bus SN (główny) + Source (sieć zasilająca) | `empty \| partial \| complete \| error` |
| 3 | K3 | Struktura szyn i sekcji | Dodatkowe Bus SN, SwitchBranch(bus_coupler) | `empty \| partial \| complete` |
| 4 | K4 | Gałęzie (linie / kable) | OverheadLine, Cable (z `catalog_ref`, `length_km`) | `empty \| partial \| complete \| error` |
| 5 | K5 | Transformatory | Transformer (z `catalog_ref` lub parametrami) | `empty \| partial \| complete \| error` |
| 6 | K6 | Odbiory i generacja | Load, Generator (w tym OZE/falowniki) | `empty \| partial \| complete` |
| 7 | K7 | Uziemienia i składowe zerowe | Przegląd i uzupełnienie Z₀ (r0, x0, grounding) | `empty \| partial \| complete` |
| 8 | K8 | Walidacja | — (brama walidacyjna, wyświetla issues) | `empty \| blocked \| ready` |
| 9 | K9 | Schemat jednokreskowy | — (podgląd SLD z referencjami ENM) | — |
| 10 | K10 | Uruchom analizy | — (uruchomienie SC 3F / Power Flow) | — |

**Plik źródłowy:** `frontend/src/ui/wizard/WizardPage.tsx` (StepK1–StepK10)

### 5.3.4 Maszyna stanów kreatora (AS-IS)

```python
# frontend/src/ui/wizard/wizardStateMachine.ts
computeWizardState(enm) → WizardState  # Deterministyczny: ten sam ENM = ten sam stan
getStepForElement(enm, elementRefId) → step_id  # Mapuje kliknięcie SLD → krok kreatora
```

| Stan kroku | Znaczenie |
|-----------|-----------|
| `empty` | Brak danych w kroku |
| `partial` | Dane niekompletne |
| `complete` | Dane kompletne |
| `error` | Dane błędne (walidacja negatywna) |

| Stan globalny | Znaczenie |
|--------------|-----------|
| `empty` | Brak danych w modelu |
| `incomplete` | Dane niekompletne |
| `ready` | Model gotowy do analiz |
| `blocked` | BLOCKER(y) uniemożliwiają analizy |

### 5.3.5 Backend: sesja → akcje → snapshot (AS-IS)

**WizardSession** (`application/wizard_runtime/session.py`):

| Pole | Typ | Opis |
|------|-----|------|
| `wizard_session_id` | UUID | Identyfikator sesji |
| `project_id` | UUID | Projekt |
| `base_snapshot_id` | str | Snapshot bazowy |
| `working_snapshot_id` | str \| None | Snapshot roboczy |
| `status` | `OPEN \| COMMITTED \| ABORTED` | Status sesji |
| `action_ids` | list[str] | Lista zaakceptowanych akcji |

**Cykl życia sesji:**

```
start_session(project_id) → WizardSession(status=OPEN)
    │
    ├── submit_action(session_id, action) → walidacja + zastosowanie
    ├── submit_batch(session_id, actions) → atomowy batch (fail-fast)
    ├── preview(session_id) → snapshot roboczy
    │
    ├── commit(session_id) → nowy snapshot (uuid5 deterministyczny) → status=COMMITTED
    └── abort(session_id) → reset → status=OPEN
```

**Akcje ENM** (`network_model/core/action_envelope.py`):

| Typ akcji | Payload | Opis |
|-----------|---------|------|
| `create_node` | `node_type: SLACK\|PQ\|PV` | Tworzenie Bus/Source |
| `create_branch` | `from_node_id, to_node_id, branch_kind: LINE\|CABLE\|TRANSFORMER\|SWITCH` | Tworzenie gałęzi |
| `set_in_service` | `entity_id, in_service: bool` | Przełączenie stanu |

**Invalidacja wyników:** Po zatwierdzeniu batch akcji, `ResultInvalidator` oznacza wszystkie wyniki projektu jako OUTDATED.

### 5.3.6 Powiązanie kreator → SLD (BINDING)

SLD:
- jest **wyłącznie wizualizacją** ENM (Rozdział 2 §2.1; `docs/ui/SLD_UI_ARCHITECTURE.md`)
- **NIE może** tworzyć relacji nieistniejących w ENM
- każda zmiana w kreatorze **natychmiast** odzwierciedla się w SLD
- bijekcja 1:1: jeden element ENM = jeden symbol SLD

### 5.3.7 Zakazy kreatora (BINDING — konsolidacja)

| Zakaz | Uzasadnienie | Ref |
|-------|-------------|-----|
| Kreator NIE MOŻE pozwolić na `Generator(falownik) → Bus SN` | Falownik = nn (Decyzja #11) | §2.17, §5.6.1 |
| Kreator NIE MOŻE tworzyć linii/kabla bez `length_km > 0` | Impedancja zerowa = BLOCKER | §4.12.3 |
| Kreator NIE MOŻE tworzyć linii/kabla bez Bay | Bay = punkt pomiarowy + zabezpieczenia | §4.15, §4.19.3 |
| Kreator NIE MOŻE tworzyć odbioru bez pola odpływowego | Kompletność toru (Decyzja #13) | §2.18 |
| Kreator NIE MOŻE „cicho" modyfikować parametrów typu | Override = tryb EKSPERT (Decyzja #16) | §5.5 |
| Kreator NIE MOŻE pomijać etapów | Sekwencja K1→K10 jest obowiązkowa | §5.3.3 |
| Kreator NIE MOŻE tworzyć transformatorów z `hv_bus == lv_bus` | BLOCKER E007 | §5.10 |

---

## 5.4 Katalog typów — jedyne źródło parametrów znamionowych (Decyzja #35)

### 5.4.1 Katalog typów — 9 klas (AS-IS)

Wszystkie typy katalogowe są **frozen dataclasses** (immutable). Zdefiniowane w `network_model/catalog/types.py`:

| # | Klasa | Warstwa | Parametry kluczowe | AS-IS |
|---|-------|---------|-------------------|-------|
| 1 | `LineType` | ENM Core | R′, X′, B′, In, jth, materiał, przekrój | ✅ |
| 2 | `CableType` | ENM Core | R′, X′, C′, In, jth, izolacja, żyły | ✅ |
| 3 | `TransformerType` | ENM Core | Sn, Uhv, Ulv, uk%, Pk, i0%, P0, grupa | ✅ |
| 4 | `SwitchEquipmentType` | ENM Core | Un, In, Ik (łamanie), Icw, medium | ✅ |
| 5 | `ConverterType` | ENM Core | kind(PV/WIND/BESS), Un, Sn, Pmax, Q limits, E(kWh) | ✅ |
| 6 | `InverterType` | ENM Core | Un, Sn, Pmax, Q limits (bez kind, bez E) | ✅ |
| 7 | `ProtectionDeviceType` | Protection | name_pl, vendor, seria, In, notes_pl | ✅ |
| 8 | `ProtectionCurve` | Protection | name_pl, standard, curve_kind, parameters | ✅ |
| 9 | `ProtectionSettingTemplate` | Protection | device_type_ref, curve_ref, setting_fields | ✅ |

**Plik źródłowy:** `network_model/catalog/types.py` (~800 linii)

### 5.4.2 CatalogRepository — repozytorium typów (AS-IS)

```python
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

**Plik źródłowy:** `network_model/catalog/repository.py:20–234`

**Metody lookup:** `get_line_type(id)`, `get_cable_type(id)`, `get_transformer_type(id)`, `get_switch_equipment_type(id)`, `get_converter_type(id)`, `get_inverter_type(id)`, `get_protection_device_type(id)`, `get_protection_curve(id)`, `get_protection_setting_template(id)`

**Metody list:** deterministyczne sortowanie per typ; `list_converter_types(kind)` z filtrem PV/WIND/BESS.

**Factory:** `get_default_mv_catalog()` — wbudowany katalog zawierający:
- Kable bazowe (XLPE/EPR, Cu/Al, 1c/3c, 70–400mm²) + NKT + Tele-Fonika
- Linie napowietrzne (Al/Al-St, 25–150mm²)
- Transformatory mocy (110/15kV, 110/20kV, 16–63MVA)
- Transformatory rozdzielcze (15/0.4kV, 20/0.4kV, 63–1000kVA)
- Aparaty łączeniowe (wyłączniki, rozłączniki, odłączniki, reklozery, bezpieczniki)
- Przetwornice (PV, wiatr, BESS)

### 5.4.3 Frontend — UI katalogu (AS-IS)

| Komponent | Plik | Funkcja |
|-----------|------|---------|
| `TypePicker` | `ui/catalog/TypePicker.tsx` | Modal wyboru typu (szukanie, parametry, selekcja) |
| `TypeLibraryBrowser` | `ui/catalog/TypeLibraryBrowser.tsx` | Przeglądarka katalogu (4 zakładki: LINE, CABLE, TRANSFORMER, SWITCH) |

**API katalogu** (`ui/catalog/api.ts`):

| Endpoint | Opis |
|----------|------|
| `GET /api/catalog/line-types` | Lista typów linii |
| `GET /api/catalog/cable-types` | Lista typów kabli |
| `GET /api/catalog/transformer-types` | Lista typów transformatorów |
| `GET /api/catalog/switch-equipment-types` | Lista typów aparatów |
| `assignTypeToBranch(projectId, branchId, typeId)` | Przypisanie typu do gałęzi |
| `assignTypeToTransformer(projectId, transformerId, typeId)` | Przypisanie typu do transformatora |
| `clearTypeFromBranch(projectId, branchId)` | Usunięcie przypisania typu |
| `exportTypeLibrary()` / `importTypeLibrary(data, mode)` | Eksport/import katalogu |

### 5.4.4 Zasada READ-ONLY (BINDING)

Parametry katalogowe są **READ-ONLY** w trybie standardowym:
- Użytkownik wybiera typ z katalogu przez `TypePicker`
- `catalog_ref` na elemencie ENM wskazuje wybrany typ
- Resolver odczytuje parametry z katalogu (`ParameterSource.TYPE_REF`)
- Edycja parametrów typu wymaga trybu EKSPERT (§5.5)

---

## 5.5 Tryb EKSPERT — override kontrolowany (Decyzja #16)

### 5.5.1 Definicja trybu (BINDING)

Tryb EKSPERT:
- pozwala nadpisać **WYBRANE** parametry typu katalogowego na poziomie instancji
- **NIE zmienia** typu katalogowego w repozytorium
- **NIE usuwa** relacji z katalogiem (`catalog_ref` pozostaje)
- wymaga **jawnego potwierdzenia** przez użytkownika

### 5.5.2 Priorytet danych (identyczny z §5.2.2)

```
OVERRIDE EKSPERT (ParameterSource.OVERRIDE)
> TYP (ParameterSource.TYPE_REF)
> PARAMETR INSTANCJI (ParameterSource.INSTANCE — fallback)
```

### 5.5.3 Implementacja AS-IS

| Element | Override AS-IS | Mechanizm |
|---------|--------------|-----------|
| OverheadLine / Cable | `impedance_override: LineImpedanceOverride` | `r_total_ohm, x_total_ohm, b_total_us` — wartości sumaryczne |
| Transformer | Brak override (TO-BE) | — |
| Generator (falownik) | Brak override (TO-BE) | — |
| ProtectionDevice | `ProtectionConfig.overrides: dict` | Nadpisanie nastaw per pole |

### 5.5.4 Audyt override (BINDING)

Każdy override:
1. Jest jawnie oznaczony w modelu ENM
2. Jest raportowany w White Box z identyfikatorem `ParameterSource.OVERRIDE`
3. White Box odtwarza: `TYP(snapshot) → OVERRIDE(delta) → parametry finalne → model solvera → wynik`
4. Raport eksportu (LaTeX, PDF, DOCX) wyświetla override z jawnym oznaczeniem

### 5.5.5 Zakazy (BINDING)

- **ZAKAZ** niejawnego override — użytkownik MUSI świadomie aktywować tryb EKSPERT
- **ZAKAZ** modyfikacji katalogu przez override — override dotyczy wyłącznie instancji
- **ZAKAZ** override bez snapshotu typu — brak możliwości audytu odstępstwa → WARNING W010 (TO-BE)
- **ZAKAZ** automatycznego override przez system — override MUSI pochodzić od użytkownika

---

## 5.6 Źródła, odbiory, falowniki — kanon fizyczny

### 5.6.1 Falownik — zasady fizyczne (Decyzja #11, #12, #14)

**Reguły (BINDING — Rozdział 2 §2.17):**
1. Falownik (`Generator.gen_type ∈ {pv_inverter, wind_inverter, bess}`) jest **zawsze** urządzeniem nn
2. Falownik **NIE zna** poziomu SN — SN osiągane wyłącznie przez transformator nn/SN
3. Napięcie znamionowe falownika wynika z **typu katalogowego** (`ConverterType.un_kv` / `InverterType.un_kv`)
4. Integracja z SN: `N × Generator(nn) → Bus nn → Transformer nn/SN → Bus SN`
5. Zakaz `Generator(falownik) → Bus(voltage_kv > 1 kV)` — walidacja E009 (TO-BE)

### 5.6.2 Ilość falowników (Decyzja #17)

Kreator MUSI umożliwiać:
1. Wybór typu falownika z katalogu (`ConverterType` / `InverterType`)
2. Podanie liczby falowników równoległych (`n_parallel`)

**Mapowanie na solver** (Decyzja #14 — TO-BE):
- Wariant A: N instancji Generator → N instancji InverterSource w solverze
- Wariant B: 1 Generator z `n_parallel=N` → 1 InverterSource z `in_rated_a × N`

> **Stan AS-IS:** Generator nie posiada pola `n_parallel` ani `catalog_ref`. ConverterType i InverterType istnieją w katalogu ale nie są powiązane z Generator przez resolver. GAP: pola TO-BE.

### 5.6.3 Transformator nn/SN (BINDING)

- Napięcie dolnej strony transformatora pochodzi z `TransformerType.voltage_lv_kv`
- Musi być spójne z napięciem Bus nn źródła (determinowanym przez typ falownika)
- **ZAKAZ** ręcznego wpisywania napięć — napięcia z katalogów typów
- Kreator WYMUSZA dodanie transformatora nn/SN przy integracji OZE z SN (§5.3.7)

### 5.6.4 Odbiory (Decyzja #13)

| Reguła | Opis | Ref |
|--------|------|-----|
| Odbiór ma `bus_ref` | Load przypisany do konkretnego Bus | `enm/models.py:201` |
| Odbiór wymaga pola odpływowego | Bay(FEEDER) + SwitchBranch/FuseBranch | Rozdział 2 §2.18 |
| Parametry zmienne z kreatora | `p_mw`, `q_mvar`, `model` (pq/zip) | K6 |
| Brak katalogu typów (AS-IS) | Load nie posiada `catalog_ref` | GAP |
| **ZAKAZ** odbioru „wiszącego" | Load bez toru do Source = BLOCKER E003 | `validator.py` |

### 5.6.5 Source — punkt zasilania (AS-IS)

Source modeluje sieć zasilającą (grid equivalent):
- Nie posiada `catalog_ref` — parametry (`sk3_mva`, `r_ohm`/`x_ohm`, `rx_ratio`) wprowadzane bezpośrednio w K2
- Mapowanie: Source → virtual ground node + impedance branch (`mapping.py:191–248`)
- Brak Source w modelu = BLOCKER E001

---

## 5.7 Stacje — model logiczny (Decyzja #36)

### 5.7.1 Substation w ENM (AS-IS)

```python
class Substation(ENMElement):
    station_type: Literal["gpz", "mv_lv", "switching", "customer"]
    bus_refs: list[str] = []
    transformer_refs: list[str] = []
    entry_point_ref: str | None = None
```

**Plik źródłowy:** `enm/models.py:225–231`

### 5.7.2 Station w solverze (AS-IS)

```python
class Station:
    id: str
    name: str
    station_type: StationType  # GPZ | RPZ | TRAFO | SWITCHING
    voltage_level_kv: float = 0.0  # Informacyjne
    bus_ids: List[str]
    branch_ids: List[str]
    switch_ids: List[str]
```

**Plik źródłowy:** `network_model/core/station.py:36–262`

**KLUCZOWE:** Station jest **WYŁĄCZNIE logiczna** — NIE ma wpływu na obliczenia. Odpowiednik benchmark Substation folder.

### 5.7.3 Typy stacji (BINDING)

| Typ | ENM `station_type` | Solver `StationType` | Opis |
|-----|-------|------|------|
| GPZ | `"gpz"` | `GPZ` | Główny Punkt Zasilający — zawiera Source, Bus WN/SN, Trafo WN/SN |
| Stacja rozdzielcza | — (TO-BE) | `RPZ` | Rozdzielnia SN (bez transformacji) |
| Stacja SN/nn | `"mv_lv"` | `TRAFO` | Stacja transformatorowa z Trafo SN/nn |
| Punkt rozłącznikowy | `"switching"` | `SWITCHING` | Stacja bez transformacji (SwitchBranch) |
| Stacja klienta | `"customer"` | — | Stacja odbiorcza |

### 5.7.4 Stacja SN/nn — wzorzec kanoniczny

```
Bus SN (z magistrali)
│
Bay SN (IN) — łącznik + zabezpieczenia
│
Bus SN stacji
│
Bay SN (TR) — pole transformatorowe
│
Transformer SN/nn (catalog_ref → TransformerType)
│
Bus nn stacji
│
Bay nn (FEEDER) — pola odpływowe nn
│
Load (odbiory) / Generator (OZE nn)
```

### 5.7.5 Stacja zasilana liniowo — stacja oddziałowa (Decyzja #28)

**Reguły (BINDING — Rozdział 3 §3.6):**
1. Stacja oddziałowa **NIE posiada Source** — zasilanie z linii SN z GPZ/stacji nadrzędnej
2. `Bus SN` stacji oddziałowej jest **niezależnym węzłem** obliczeniowym (własne `voltage_kv`)
3. Stacja oddziałowa MOŻE posiadać:
   - lokalne sekcjonowanie (Bus SN sekcji + SwitchBranch bus_coupler)
   - transformatory SN/nn
   - odbiory nn / źródła OZE nn
4. Stacja oddziałowa MOŻE być elementem ringu SN (NO point na jednym z feedów)

### 5.7.6 Solver — stacja NIE wpływa na obliczenia (BINDING)

Solver widzi wyłącznie:
- **Bus** (węzły) z `voltage_kv`
- **Branch** (gałęzie) z impedancjami
- **Switch** (łączniki) ze stanem
- **Transformer** z parametrami znamionowymi

Solver **NIE widzi** Substation, Bay, Corridor, Station — to byty warstwy meta/organizacyjnej.

---

## 5.8 Powiązanie zabezpieczeń z ENM (Rozdział 2 §2.15–§2.21, Rozdział 4 §4.15–§4.16)

### 5.8.1 Schemat kanoniczny (BINDING — konsolidacja)

```
Bay (bay_role="OUT" / "FEEDER")
├── SwitchBranch (łącznik — w equipment_refs)
├── CT / VT (punkt pomiarowy — TO-BE)
├── ProtectionDevice (Bay.protection_ref → PD.id)
│       └── location_element_id → Branch.ref_id (obiekt chroniony)
│       └── settings: OvercurrentProtectionSettings
│       └── device_type: RELAY | FUSE | RECLOSER | CIRCUIT_BREAKER
│
Branch (OverheadLine / Cable — w equipment_refs)
```

### 5.8.2 Stan AS-IS vs TO-BE

| Aspekt | AS-IS | TO-BE |
|--------|-------|-------|
| `ProtectionDevice.location_element_id` → Branch | ✅ Bezpośrednia referencja | Referencja przez Bay |
| `Bay.protection_ref` | Flaga readiness | Pełny link do PD |
| `Bay.equipment_refs` → Branch | Pole istnieje, brak walidacji | Walidowany kontrakt 1:1 |
| White Box: Bay identyfikacja | Brak | Pełny łańcuch Bay→Branch→PD |
| Kreator: wymuszanie zabezpieczeń | Brak | Blokada braku konfiguracji |

### 5.8.3 Kreator → zabezpieczenia (TO-BE — Decyzja #37)

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji implementacyjnej.

Kreator POWINIEN:
1. Wymuszać dobór zabezpieczenia przy tworzeniu pola liniowego (Bay OUT/FEEDER)
2. Oferować wybór z katalogu `ProtectionDeviceType` + `ProtectionCurve`
3. Blokować brak konfiguracji zabezpieczeń (lub jawnie raportować jako ograniczenie)
4. Zapewniać komplet danych pomiarowych (CT/VT — TO-BE)

> **Stan AS-IS:** Zabezpieczenia są konfigurowane **po** kreatorze, w dedykowanym module Protection Coordination (`ui/protection-coordination/`). Kreator NIE wymusza konfiguracji zabezpieczeń — model bez zabezpieczeń jest dozwolony.

---

## 5.9 Study Case — architektura scenariuszy obliczeniowych

### 5.9.1 Definicja (AS-IS)

Study Case (scenariusz obliczeniowy) przechowuje **WYŁĄCZNIE** parametry obliczeń — **NIE** dane modelu.

```python
@dataclass(frozen=True)
class StudyCase:
    id: UUID
    project_id: UUID
    name: str
    network_snapshot_id: str | None  # Referencja do snapshotu ENM
    config: StudyCaseConfig           # Parametry obliczeń
    protection_config: ProtectionConfig  # Konfiguracja zabezpieczeń
    result_status: StudyCaseResultStatus  # NONE | FRESH | OUTDATED
    is_active: bool                   # Jeden aktywny per projekt
    result_refs: tuple[StudyCaseResult, ...]  # Metadane wyników
```

**Plik źródłowy:** `domain/study_case.py:173–488`

### 5.9.2 StudyCaseConfig — parametry obliczeń (AS-IS)

| Parametr | Typ | Domyślnie | Opis |
|----------|-----|-----------|------|
| `c_factor_max` | float | 1.10 | Współczynnik napięciowy cmax (IEC 60909) |
| `c_factor_min` | float | 0.95 | Współczynnik napięciowy cmin |
| `base_mva` | float | 100.0 | Baza MVA per-unit |
| `max_iterations` | int | 50 | Iteracje Newton-Raphson |
| `tolerance` | float | 1e-6 | Kryterium zbieżności |
| `include_motor_contribution` | bool | True | Wkład silników |
| `include_inverter_contribution` | bool | True | Wkład falowników |
| `thermal_time_seconds` | float | 1.0 | Czas dla Ith |

### 5.9.3 Cykl życia wyników (BINDING)

```
NONE ──(obliczenia)──→ FRESH ──(zmiana modelu/config)──→ OUTDATED
                         │                                    │
                         └──────── (re-run) ───────────────→ FRESH
```

| Status | Znaczenie |
|--------|-----------|
| `NONE` | Brak obliczeń (po utworzeniu lub klonowaniu) |
| `FRESH` | Wyniki aktualne (obliczone po ostatniej zmianie) |
| `OUTDATED` | Wyniki nieaktualne (model lub config zmieniony) |

### 5.9.4 Reguły immutability (BINDING)

1. **Case NIE mutuje ENM** — Case przechowuje WYŁĄCZNIE konfigurację obliczeń
2. **Zmiana modelu** (nowy snapshot) → status OUTDATED na WSZYSTKICH Case'ach
3. **Zmiana config** → status OUTDATED (jeśli był FRESH)
4. **Clone** → kopiuje config i `network_snapshot_id`, **status=NONE**, **is_active=False**
5. **Jeden aktywny** Case per projekt w danym momencie
6. Case zwraca **nową instancję** przy każdej modyfikacji (frozen dataclass)

---

## 5.10 Modele niedozwolone (Illegal Models) — reguły blokujące (Decyzja #38)

### 5.10.1 Istniejące BLOCKERy (AS-IS)

| Kod | Opis | Krok kreatora | Plik |
|-----|------|--------------|------|
| E001 | Brak Source w modelu | K2 | `validator.py:87` |
| E002 | Brak Bus w modelu | K3 | `validator.py:96` |
| E003 | Graf niespójny (wyspa bez Source) | K4 | `validator.py:142` |
| E004 | Bus z `voltage_kv ≤ 0` | K3 | `validator.py:105` |
| E005 | Branch z impedancją zerową (R=0 AND X=0) | K4 | `validator.py:115` |
| E006 | Transformer z `uk_percent ≤ 0` | K5 | `validator.py:123` |
| E007 | Transformer z `hv_bus == lv_bus` | K5 | `validator.py:131` |
| E008 | Source bez parametrów zwarciowych | K2 | `validator.py:139` |

### 5.10.2 AnalysisAvailability — brama obliczeniowa (AS-IS)

```python
# validator.py:489-512
if has_blockers:
    → SC_3F=False, SC_1F=False, LF=False  (WSZYSTKO zablokowane)

SC_1F = not has_z0_warnings  # Wymaga Z₀ na wszystkich liniach i źródłach
LF = has_loads or has_generators  # Wymaga co najmniej 1 load/generator
SC_3F = True  # Dostępne jeśli brak blockerów
```

### 5.10.3 Modele niedozwolone — konsolidacja systemowa (BINDING)

| Model niedozwolony | Blokada | Walidacja | Status |
|-------------------|---------|-----------|--------|
| Falownik na szynie SN | Kreator + walidacja | E009 (TO-BE) | TO-BE |
| Falownik bez transformatora nn/SN | Kreator + walidacja | E010 (TO-BE) | TO-BE |
| Branch bez Bay | Kreator (TO-BE) | W-BAY-01 (TO-BE) | TO-BE |
| Odbiór bez pola odpływowego | Kreator (TO-BE) | W009 (TO-BE) | TO-BE |
| Override bez śladu audytowego | System | W010 (TO-BE) | TO-BE |
| SLD nieizomorficzne z ENM | System (bijekcja 1:1) | Gwarancja architektoniczna | AS-IS |
| Graf niespójny | Walidacja | E003 (AS-IS) | AS-IS |
| Source brak parametrów | Walidacja | E008 (AS-IS) | AS-IS |
| Transformer hv=lv | Walidacja | E007 (AS-IS) | AS-IS |
| Branch impedancja zerowa | Walidacja | E005 (AS-IS) | AS-IS |

### 5.10.4 Zakaz obejścia (BINDING)

- Walidacja ENM jest **bramą pre-solver** — solver NIE może być uruchomiony przy obecności BLOCKER
- `AnalysisAvailability` jest **deterministyczna** — ten sam ENM → te same dostępne analizy
- Kreator blokuje przejście dalej przy stanach `error` / `blocked`
- **ZAKAZ** wyłączania walidacji, pomijania blockerów, lub uruchamiania solvera na modelu z E-issues

---

## 5.11 Spójność systemu — ENM → Solver → White Box → Raporty

### 5.11.1 Łańcuch deterministyczny (BINDING)

```
ENM (edytowalny)
    │
    ├── Kreator → atomowe akcje → snapshot
    │
    ↓
Resolver (catalog + override + instance)
    │
    ↓
map_enm_to_network_graph() — deterministyczny
    │
    ↓
NetworkGraph (read-only)
    │
    ├── Solver SC (IEC 60909) → ShortCircuitResult (frozen)
    ├── Solver PF (Newton-Raphson) → PowerFlowNewtonSolution (frozen)
    │
    ↓
White Box Trace (immutable)
    │
    ├── TraceArtifact → ProofDocument → ProofStep
    ├── ProtectionTrace → ProtectionTraceStep
    │
    ↓
Raporty (LaTeX, PDF, DOCX, JSON)
```

### 5.11.2 Gwarancje deterministyczne (BINDING)

| Gwarancja | Opis |
|-----------|------|
| Ten sam ENM → ten sam NetworkGraph | `mapping.py` sortuje po `ref_id` |
| Ten sam NetworkGraph → te same wyniki | Solvery są deterministyczne |
| Ten sam wynik → ten sam White Box | Trace jest immutable |
| Ten sam White Box → ten sam raport | Eksport jest deterministyczny |
| Ten sam ENM → ten sam stan kreatora | `computeWizardState()` jest pure function |
| Ten sam ENM → ten sam SLD | Layout jest deterministyczny |

### 5.11.3 White Box — pełny ślad per obiekt (BINDING)

Każdy obiekt ENM uczestniczący w obliczeniach MUSI mieć pełny ślad w White Box:

```
TYP (snapshot parametrów z katalogu, identyfikator typu)
→ OVERRIDE (delta: parametr → wartość, jeśli tryb EKSPERT)
→ PARAMETRY ZMIENNE (z kreatora: długość, tap, P/Q, n_parallel)
→ ILOŚĆ (jeśli dotyczy)
→ MODEL SOLVERA (parametry finalne po resolwerze + mapowaniu)
→ WYNIK OBLICZENIOWY (ikss, ip, ith, napięcia, przepływy)
```

Każdy parametr MUSI być oznaczony: `ParameterSource.TYPE_REF` / `ParameterSource.OVERRIDE` / `ParameterSource.INSTANCE`.

### 5.11.4 Invalidacja wyników (BINDING)

| Zdarzenie | Skutek |
|-----------|--------|
| Zmiana ENM (nowy snapshot) | WSZYSTKIE Case'y → OUTDATED |
| Zmiana StudyCaseConfig | Dany Case → OUTDATED |
| Zmiana ProtectionConfig | Dany Case → OUTDATED (ochrona) |
| Clone Case | Nowy Case → NONE |
| Commit sesji Wizard | `ResultInvalidator` → wszystkie wyniki projektu |

---

## 5.12 Definition of Done — Kontrakty Kanoniczne Systemu

### Kryteria akceptacji (ALL MUST PASS)

| # | Kryterium | Status |
|---|----------|--------|
| 1 | Zasada kompozycji: TYP × parametry zmienne × ilość × override = obiekt ENM | ✅ Dokumentacja (§5.2) |
| 2 | Kreator K1–K10 zdefiniowany z sekwencją, rolą per krok, stanami | ✅ AS-IS (§5.3) |
| 3 | Backend: action-based z sesją, snapshotem, commit/abort | ✅ AS-IS (§5.3.5) |
| 4 | Katalog typów: 9 klas frozen w `types.py`, CatalogRepository | ✅ AS-IS (§5.4) |
| 5 | Frontend: TypePicker + TypeLibraryBrowser + API assign/clear | ✅ AS-IS (§5.4.3) |
| 6 | Resolver: 3-poziomowa precedencja (OVERRIDE > TYPE_REF > INSTANCE) | ✅ AS-IS (§5.2.2) |
| 7 | Falownik = nn, transformator nn/SN obowiązkowy przy integracji z SN | ✅ Dokumentacja (§5.6.1) |
| 8 | Stacja: Substation (ENM) + Station (solver) = logiczne kontenery, brak wpływu na obliczenia | ✅ AS-IS (§5.7) |
| 9 | Stacja oddziałowa: bez Source, zasilanie liniowe, niezależne Bus SN | ✅ Dokumentacja (§5.7.5) |
| 10 | Study Case: config only, NONE→FRESH→OUTDATED, 1 active per project | ✅ AS-IS (§5.9) |
| 11 | BLOCKERy E001-E008: brama pre-solver, AnalysisAvailability | ✅ AS-IS (§5.10) |
| 12 | Modele niedozwolone: konsolidacja systemowa (9 reguł AS-IS + 5 TO-BE) | ✅ Dokumentacja (§5.10.3) |
| 13 | Łańcuch deterministyczny: ENM→Resolver→Mapping→Solver→WhiteBox→Raport | ✅ AS-IS (§5.11) |
| 14 | Invalidacja wyników: zmiana ENM → OUTDATED na wszystkich Case | ✅ AS-IS (§5.11.4) |
| 15 | White Box: pełny ślad per obiekt (TYP→OVERRIDE→PARAMS→SOLVER→WYNIK) | ✅ Dokumentacja (§5.11.3) |

### Zamknięcie domeny (v1.0)

**DOMENA KONTRAKTÓW KANONICZNYCH SYSTEMU (§5.1–§5.12) JEST ZAMKNIĘTA.**

Sekcje §5.1–§5.12 definiują kompletny kanon kontraktów systemowych MV-DESIGN-PRO na poziomie benchmark/benchmark.
Sekcje §5.13–§5.19 (SUPPLEMENT v1.1) formalizują warstwę katalogów typów jako jedyne źródło parametrów znamionowych.

Dalsze modyfikacje wymagają ADR i wpisu do Macierzy Decyzji (AUDIT §9).

---

## 5.13 Zasada nadrzędna katalogów — żaden parametr znamionowy nie jest wpisywany ręcznie (Decyzja #39)

### 5.13.1 Kanon (BINDING)

> **Żaden parametr znamionowy w MV-DESIGN-PRO nie jest wpisywany ręcznie.**
> **Wszystkie parametry znamionowe pochodzą z katalogów typów.**

Parametr znamionowy to wartość wynikająca z konstrukcji urządzenia:
- impedancja (R′, X′, B′), prąd znamionowy (In), napięcie znamionowe (Un), moc znamionowa (Sn),
- uk%, pk, i0%, P0, grupa połączeń (transformatory),
- Ik (zwarciowy), Icw (wytrzymałość), medium gaszące (aparaty łączeniowe),
- charakterystyki czasowo-prądowe, zakresy nastaw (zabezpieczenia),
- przekładnie, klasy dokładności (przekładniki CT/VT).

Parametr zmienny to wartość ustalana per instancja w projekcie:
- długość linii/kabla (`length_km`),
- pozycja zaczepu transformatora (`tap_position`),
- moc czynna/bierna odbioru (`p_mw`, `q_mvar`),
- stan łącznika (`status`: open/closed),
- parametry sieci zasilającej Source (`sk3_mva`, `r_ohm`/`x_ohm`).

### 5.13.2 Konsekwencje (BINDING)

| Warstwa | Reguła |
|---------|--------|
| **Kreator** | NIE posiada pól do ręcznego wpisu parametrów znamionowych; wymusza wybór z katalogu |
| **ENM** | Przechowuje `type_id` (referencję), NIE duplikuje danych katalogowych |
| **Resolver** | Odczytuje parametry znamionowe z katalogu (`ParameterSource.TYPE_REF`) |
| **Solver** | Operuje na parametrach finalnych (po resolwerze) — NIE zna katalogu |
| **White Box** | Odtwarza pełny łańcuch: TYP(snapshot) → OVERRIDE(delta) → parametry finalne |
| **SLD** | Wizualizuje elementy z referencjami do typów; NIE edytuje parametrów znamionowych |

### 5.13.3 Stan AS-IS — zakres pokrycia

| Element ENM | Posiada `catalog_ref` | Typ katalogowy | Pokrycie |
|-------------|----------------------|---------------|----------|
| OverheadLine | ✅ `BranchBase.catalog_ref` | `LineType` | AS-IS |
| Cable | ✅ `BranchBase.catalog_ref` | `CableType` | AS-IS |
| Transformer | ✅ `Transformer.catalog_ref` | `TransformerType` | AS-IS |
| SwitchBranch | ✅ `BranchBase.catalog_ref` | `SwitchEquipmentType` | AS-IS (przypisanie przez API) |
| FuseBranch | ✅ `BranchBase.catalog_ref` | — (brak dedykowanego FuseType) | AS-IS (częściowe — parametry ręczne) |
| Generator | ❌ Brak `catalog_ref` | `ConverterType` / `InverterType` (istnieją w katalogu, ale niepowiązane) | **GAP** — TO-BE |
| Load | ❌ Brak `catalog_ref` | — (brak `LoadType`) | **GAP** — TO-BE |
| Source | ❌ Brak `catalog_ref` | — (brak `SourceType`) | **Celowe** — Source = sieć zasilająca (parametry projektowe, nie katalogowe) |
| ProtectionDevice | Referencja przez `device_type_ref` | `ProtectionDeviceType` + `ProtectionCurve` + `ProtectionSettingTemplate` | AS-IS (warstwa domenowa) |

### 5.13.4 Wyjątek: Source (sieć zasilająca)

Source modeluje **sieć zasilającą** (grid equivalent), nie urządzenie fizyczne. Parametry Source (`sk3_mva`, `r_ohm`/`x_ohm`, `rx_ratio`, `c_max/c_min`) są danymi projektowymi wynikającymi z warunków przyłączenia (decyzja OSD), NIE z katalogu producenta.

**Source NIE wymaga katalogu typów** — jest wyjątkiem od zasady §5.13.1. Parametry Source są wpisywane ręcznie w kreatorze (K2) na podstawie warunków przyłączenia / decyzji OSD.

> **BINDING:** Wyjątek dotyczy WYŁĄCZNIE Source. Żaden inny element sieciowy (poza Source) NIE MOŻE mieć ręcznie wpisywanych parametrów znamionowych w trybie standardowym.

---

## 5.14 Zakres katalogów — 7 domen obowiązkowych (Decyzja #40)

### 5.14.1 Domeny katalogowe (BINDING)

System MUSI posiadać katalogi typów w następujących domenach:

| # | Domena | Klasa(y) AS-IS | Plik | Status |
|---|--------|---------------|------|--------|
| 1 | **Linie napowietrzne** | `LineType` | `catalog/types.py:33` | ✅ AS-IS (14+ typów bazowych, Al/Al-St, 25–150mm²) |
| 2 | **Kable SN/nn** | `CableType` | `catalog/types.py:166` | ✅ AS-IS (90+ typów: XLPE/EPR, Cu/Al, 1c/3c, 70–400mm², typy producenckie NKT/Tele-Fonika) |
| 3 | **Transformatory** | `TransformerType` | `catalog/types.py:317` | ✅ AS-IS (WN/SN 16–63MVA + SN/nn 63–1000kVA) |
| 4 | **Falowniki i przetwornice** | `ConverterType`, `InverterType` | `catalog/types.py:464, 562` | ✅ AS-IS (typy istnieją, ale Generator nie posiada `catalog_ref` — GAP) |
| 5 | **Aparaty łączeniowe** | `SwitchEquipmentType` | `catalog/types.py:399` | ✅ AS-IS (wyłączniki, rozłączniki, odłączniki, reklozery, bezpieczniki) |
| 6 | **Zabezpieczenia** | `ProtectionDeviceType`, `ProtectionCurve`, `ProtectionSettingTemplate` | `catalog/types.py:648, 704, 753` | ✅ AS-IS (typy + krzywe + szablony nastaw) |
| 7 | **Przekładniki CT/VT** | — | — | ❌ **BRAK** — TO-BE |

### 5.14.2 Domena 7: Przekładniki CT/VT (TO-BE — Decyzja #40)

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji implementacyjnej.

Przekładniki prądowe (CT) i napięciowe (VT) są **niezbędne** do:
- koordynacji zabezpieczeń (punkt pomiarowy, nasycenie CT),
- analizy White Box Protection (§2.17 — „źródło sygnału: CT/VT"),
- walidacji kompatybilności zabezpieczenie ↔ przekładnik,
- raportów benchmark-grade (kolumna „Źródło sygnału" w tabeli zabezpieczeń, §2.18).

**Wymagane pola CT (TO-BE):**

| Pole | Typ | Opis |
|------|-----|------|
| `id` | str | Identyfikator typu |
| `name` | str | Nazwa producenta/modelu |
| `manufacturer` | str \| None | Producent |
| `ratio_primary_a` | float | Prąd pierwotny znamionowy [A] |
| `ratio_secondary_a` | float | Prąd wtórny znamionowy [A] (1 lub 5) |
| `accuracy_class` | str | Klasa dokładności (0.2, 0.5, 1, 5P, 10P) |
| `burden_va` | float | Obciążalność znamionowa [VA] |
| `saturation_factor` | float \| None | Współczynnik nasycenia ALF/FS |
| `voltage_rating_kv` | float | Napięcie znamionowe izolacji [kV] |
| `thermal_rating_ka_1s` | float \| None | Wytrzymałość cieplna Ith (1s) [kA] |

**Wymagane pola VT (TO-BE):**

| Pole | Typ | Opis |
|------|-----|------|
| `id` | str | Identyfikator typu |
| `name` | str | Nazwa producenta/modelu |
| `manufacturer` | str \| None | Producent |
| `ratio_primary_kv` | float | Napięcie pierwotne znamionowe [kV] |
| `ratio_secondary_v` | float | Napięcie wtórne znamionowe [V] (100 lub 100/√3) |
| `accuracy_class` | str | Klasa dokładności (0.2, 0.5, 1, 3P) |
| `burden_va` | float | Obciążalność znamionowa [VA] |
| `voltage_factor` | float \| None | Współczynnik napięciowy (1.2/1.5/1.9) |

**Stan AS-IS:** CT/VT istnieją WYŁĄCZNIE jako symbole SVG na schemacie SLD (`frontend/src/ui/sld/canonical_symbols/ct.svg`, `vt.svg`) — brak jakiejkolwiek reprezentacji danych.

### 5.14.3 Domena uzupełniająca: Odbiory / LoadType (TO-BE)

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji implementacyjnej.

Load (`enm/models.py:200`) NIE posiada `catalog_ref` i NIE istnieje `LoadType` w katalogu. Parametry odbioru (`p_mw`, `q_mvar`, `model`) są wpisywane ręcznie w kreatorze (K6).

**Decyzja architektoniczna (BINDING — Decyzja #40):**

W trybie standardowym odbiory MOGĄ nie posiadać katalogu typów, ponieważ:
- parametry odbioru (`P`, `Q`, `cosφ`) są danymi projektowymi (bilans mocy), nie konstrukcyjnymi,
- odbiory w sieciach SN są zazwyczaj agregowane (moc stacji transformatorowej), nie modelowane per urządzenie,
- benchmark / benchmark modelują odbiory przez moc + model (PQ/ZIP), nie przez typ katalogowy.

Opcjonalny `LoadType` (TO-BE) jest dopuszczalny jako rozszerzenie — np. dla powtarzalnych profili odbiorów w projektach typowych.

### 5.14.4 Macierz pokrycia katalogowego (BINDING)

| Domena | Klasy AS-IS | catalog_ref na ENM | Resolver | Frontend UI | Pokrycie |
|--------|------------|-------------------|---------|------------|----------|
| Linie | `LineType` | ✅ `BranchBase.catalog_ref` | ✅ `resolve_line_params()` | ✅ TypePicker + TypeLibraryBrowser | **100%** |
| Kable | `CableType` | ✅ `BranchBase.catalog_ref` | ✅ `resolve_line_params()` | ✅ TypePicker + TypeLibraryBrowser | **100%** |
| Transformatory | `TransformerType` | ✅ `Transformer.catalog_ref` | ✅ `resolve_transformer_params()` | ✅ TypePicker + TypeLibraryBrowser | **100%** |
| Aparaty | `SwitchEquipmentType` | ✅ `BranchBase.catalog_ref` | ❌ Brak resolver | ✅ TypePicker + TypeLibraryBrowser | **75%** (brak resolver) |
| Falowniki | `ConverterType`, `InverterType` | ❌ Brak `catalog_ref` na Generator | ❌ Brak resolver | ❌ Brak w frontend UI | **25%** (typy istnieją, reszta GAP) |
| Zabezpieczenia | `PD Type` + `Curve` + `Template` | ✅ Referencja domenowa | ❌ Brak resolver | ❌ Brak w frontend catalog UI | **50%** (backend OK, frontend GAP) |
| CT/VT | — | — | — | ❌ Tylko symbole SVG | **0%** |

---

## 5.15 Struktura kanoniczna typu (Decyzja #41)

### 5.15.1 Pola obowiązkowe — wspólne dla wszystkich typów (BINDING)

Każdy typ w katalogu MUSI zawierać:

| Pole | Typ | Opis | Status |
|------|-----|------|--------|
| `id` | str | Jednoznaczny identyfikator (UUID lub slug) | ✅ AS-IS (wszystkie 9 klas) |
| `name` | str | Nazwa typu (producent + model + parametry) | ✅ AS-IS (wszystkie 9 klas) |
| `manufacturer` | str \| None | Producent urządzenia | ✅ AS-IS (LineType, CableType, TransformerType, SwitchEquipmentType, ConverterType, InverterType) |

### 5.15.2 Pola obowiązkowe — TO-BE (wymagane rozszerzenie)

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji implementacyjnej.

| Pole | Typ | Opis | Status |
|------|-----|------|--------|
| `version` | str | Wersja definicji typu (np. „1.0", „2024.1") | ❌ BRAK — TO-BE |
| `status` | `Literal["active", "retired"]` | Status aktywności typu | ❌ BRAK — TO-BE |
| `created_at` | str (ISO 8601) | Data wprowadzenia do katalogu | ❌ BRAK — TO-BE |

**Uzasadnienie:** benchmark i benchmark posiadają zarządzanie wersjami typów. Typ „wycofany" (retired) pozostaje dostępny w istniejących projektach, ale NIE jest oferowany przy tworzeniu nowych instancji. Pozwala to na migrację bez utraty danych historycznych.

### 5.15.3 Pola domenowe — per kategoria (AS-IS)

**LineType / CableType — parametry impedancyjne:**

| Pole | LineType | CableType | Opis |
|------|----------|-----------|------|
| `r_ohm_per_km` | ✅ | ✅ | Rezystancja czynna [Ω/km] |
| `x_ohm_per_km` | ✅ | ✅ | Reaktancja [Ω/km] |
| `b_us_per_km` / `c_nf_per_km` | ✅ b_us | ✅ c_nf (→ b_us via property) | Susceptancja / pojemność |
| `rated_current_a` | ✅ | ✅ | Obciążalność długotrwała [A] |
| `voltage_rating_kv` | ✅ | ✅ | Napięcie znamionowe izolacji [kV] |
| `conductor_material` | ✅ | ✅ | Materiał przewodzący (Cu/Al/Al-St) |
| `cross_section_mm2` | ✅ | ✅ | Przekrój [mm²] |
| `ith_1s_a` | ✅ | ✅ | Prąd cieplny 1s [A] |
| `jth_1s_a_per_mm2` | ✅ | ✅ | Gęstość prądu cieplnego [A/mm²] |
| `base_type_id` | ✅ | ✅ | Typ bazowy (dla typów producenckich) |
| `trade_name` | ✅ | ✅ | Nazwa handlowa producenta |
| `insulation_type` | — | ✅ | Typ izolacji (XLPE/EPR/PVC/PAPER) |
| `number_of_cores` | — | ✅ | Liczba żył (1c/3c) |

**TransformerType — parametry znamionowe:**

| Pole | Opis |
|------|------|
| `rated_power_mva` | Moc znamionowa [MVA] |
| `voltage_hv_kv` | Napięcie górne [kV] |
| `voltage_lv_kv` | Napięcie dolne [kV] |
| `uk_percent` | Napięcie zwarcia [%] |
| `pk_kw` | Straty obciążeniowe [kW] |
| `i0_percent` | Prąd jałowy [%] |
| `p0_kw` | Straty jałowe [kW] |
| `vector_group` | Grupa połączeń (Dyn11, Yyn0, ...) |
| `cooling_class` | Klasa chłodzenia (ONAN, ONAF) |
| `tap_min`, `tap_max`, `tap_step_percent` | Parametry regulatora zaczepów |

**ConverterType / InverterType — parametry falownika:**

| Pole | ConverterType | InverterType | Opis |
|------|--------------|-------------|------|
| `kind` | ✅ (PV/WIND/BESS) | — | Rodzaj przetwornika |
| `un_kv` | ✅ | ✅ | Napięcie znamionowe nn [kV] |
| `sn_mva` | ✅ | ✅ | Moc pozorna znamionowa [MVA] |
| `pmax_mw` | ✅ | ✅ | Moc czynna maksymalna [MW] |
| `qmin_mvar`, `qmax_mvar` | ✅ | ✅ | Zakres mocy biernej [Mvar] |
| `cosphi_min`, `cosphi_max` | ✅ | ✅ | Zakres cosφ |
| `e_kwh` | ✅ (BESS) | — | Pojemność magazynu [kWh] |

**SwitchEquipmentType — parametry łącznikowe:**

| Pole | Opis |
|------|------|
| `equipment_kind` | Rodzaj: CIRCUIT_BREAKER / LOAD_SWITCH / DISCONNECTOR / RECLOSER / FUSE |
| `un_kv` | Napięcie znamionowe [kV] |
| `in_a` | Prąd znamionowy [A] |
| `ik_ka` | Zdolność łączeniowa zwarciowa [kA] |
| `icw_ka` | Prąd wytrzymywany krótkotrwale [kA] |
| `medium` | Medium gaszące (SF6, próżnia, powietrze, olej) |

**ProtectionDeviceType — parametry zabezpieczenia:**

| Pole | Opis |
|------|------|
| `name_pl` | Nazwa polska |
| `vendor` | Producent |
| `series` | Seria urządzenia |
| `revision` | Rewizja |
| `rated_current_a` | Prąd znamionowy [A] |
| `notes_pl` | Uwagi |

### 5.15.4 Zakaz typów niekompletnych (BINDING)

- **ZAKAZ** tworzenia typu bez pól impedancyjnych (LineType/CableType bez R′, X′)
- **ZAKAZ** tworzenia TransformerType bez uk_percent lub rated_power_mva
- **ZAKAZ** tworzenia SwitchEquipmentType bez un_kv lub in_a
- **ZAKAZ** tworzenia ConverterType/InverterType bez un_kv lub sn_mva

**Implementacja AS-IS:** Typy są `@dataclass(frozen=True)` z obowiązkowymi polami — Python wymusza kompletność przy konstrukcji. Brak walidacji na poziomie danych wejściowych importu.

---

## 5.16 Relacja katalog ↔ kreator — formalizacja (Decyzja #39)

### 5.16.1 Sekwencja kanoniczna per krok kreatora (BINDING)

| Krok | Element | Katalog | Sekwencja |
|------|---------|---------|-----------|
| K2 | Source | **Brak katalogu** (wyjątek §5.13.4) | Użytkownik wpisuje sk3_mva, rx_ratio ręcznie |
| K3 | Bus SN | **Brak katalogu** | Użytkownik podaje voltage_kv |
| K4 | OverheadLine / Cable | `LineType` / `CableType` | 1. Wybór typu z TypePicker → 2. Parametry READ-ONLY → 3. Podanie length_km |
| K5 | Transformer | `TransformerType` | 1. Wybór typu z TypePicker → 2. Parametry READ-ONLY → 3. Podanie tap_position, uziemienie |
| K6 | Generator (falownik) | `ConverterType` / `InverterType` (TO-BE) | 1. Wybór typu → 2. Napięcie nn z katalogu → 3. n_parallel → 4. P, Q, tryb pracy |
| K6 | Load | **Brak katalogu** (dopuszczalne §5.14.3) | Użytkownik podaje p_mw, q_mvar, model |
| K6 | SwitchBranch | `SwitchEquipmentType` | 1. Wybór typu → 2. Podanie status (open/closed) |

### 5.16.2 Zachowanie TypePicker (AS-IS)

`TypePicker` (`ui/catalog/TypePicker.tsx`):
1. Wyświetla listę dostępnych typów z filtrami (nazwa, producent, parametry)
2. Użytkownik wybiera typ → `assignTypeToBranch()` / `assignTypeToTransformer()` / `assignEquipmentTypeToSwitch()`
3. Parametry znamionowe wypełniane automatycznie (READ-ONLY)
4. Użytkownik widzi WYŁĄCZNIE parametry zmienne instancji do edycji

### 5.16.3 Blokada braku typu (TO-BE — wzmocnienie)

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji implementacyjnej.

Kreator POWINIEN blokować przejście dalej przy braku wybranego typu dla elementów z §5.13.3 (z wyjątkiem Source i Load).

**Stan AS-IS:** Kreator NIE blokuje braku `catalog_ref` — element bez typu jest tworzony z `ParameterSource.INSTANCE` i raportowany jako INFO I002. System jest tolerancyjny wobec braku typu (backward compatibility).

**Docelowo (TO-BE):** Brak typu → WARNING (IMPORTANT), nie BLOCKER. Uzasadnienie: projekty migrowane z wcześniejszych wersji mogą nie mieć typów; BLOCKER uniemożliwiłby pracę na istniejących danych.

---

## 5.17 Relacja katalog ↔ ENM — przechowywanie i rekonstrukcja

### 5.17.1 Zasada minimalizacji danych (BINDING)

ENM przechowuje per instancja:

| Dane | Przykład | Źródło |
|------|---------|--------|
| `type_id` (catalog_ref) | `"nkt_yaky_3x240"` | Referencja do katalogu |
| Parametry zmienne | `length_km=3.5`, `tap_position=0`, `status="closed"` | Kreator |
| Override (tryb ekspert) | `{r_total_ohm: 0.45}` | Użytkownik |

ENM **NIE duplikuje** danych katalogowych (R′, X′, In, uk%, itd.). Resolver odczytuje je z katalogu w momencie obliczeń.

### 5.17.2 Rekonstrukcja pełna (BINDING)

Każda instancja ENM MUSI być możliwa do pełnej rekonstrukcji:

```
type_id → CatalogRepository.get_*(type_id) → parametry znamionowe
+ parametry zmienne (z ENM)
+ override (z ENM, jeśli tryb ekspert)
= parametry finalne (input do resolver → mapping → solver)
```

**Konsekwencja:** Usunięcie typu z katalogu przy istniejących instancjach → `TypeNotFoundError` z resolver (`catalog/resolver.py:116–125`). System MUSI zachowywać typy używane w istniejących projektach.

### 5.17.3 Snapshot a rekonstrukcja

White Box MUSI odtwarzać parametry użyte w obliczeniach **niezależnie** od aktualnego stanu katalogu. Dwa podejścia (BINDING — decyzja implementacyjna do podjęcia):

| Podejście | Opis | Zalety | Wady |
|-----------|------|--------|------|
| **A. Snapshot per obliczenie** | White Box zapisuje snapshot parametrów typu w momencie obliczenia | Niezależny od zmian katalogu | Większy rozmiar danych |
| **B. Wersjonowanie katalogu** | Katalog posiada wersje; White Box referencjonuje wersję | Kompaktowy, czytelny | Wymaga infrastruktury wersjonowania |

**Stan AS-IS:** Brak jawnego mechanizmu — resolver odczytuje z aktualnego katalogu. White Box trace (`WhiteBoxTracer`) NIE zapisuje snapshotów typów.

---

## 5.18 Wersjonowanie i zarządzanie katalogami (Decyzja #42)

### 5.18.1 Poziomy wersjonowania (BINDING)

| Poziom | Mechanizm | Status |
|--------|-----------|--------|
| **Biblioteka** (zbiór typów) | `TypeLibraryManifest`: `library_id`, `revision`, `vendor`, `series`, `fingerprint` (SHA-256), `created_at` | ✅ AS-IS (P13b) |
| **Indywidualny typ** | Pola `version`, `status`, `created_at` per typ | ❌ TO-BE |

### 5.18.2 TypeLibraryManifest — governance (AS-IS)

System AS-IS posiada mechanizm governance bibliotek typów na poziomie eksportu/importu:

```python
# Governance manifest (P13b)
TypeLibraryManifest:
    library_id: UUID
    library_name_pl: str
    vendor: str | None
    series: str | None
    revision: str
    schema_version: str
    description_pl: str | None
    fingerprint: str  # SHA-256
    created_at: str   # ISO 8601
```

**Import API:** `POST /api/catalog/import?mode=merge|replace`
- `merge` — dodaje nowe typy, nie nadpisuje istniejących
- `replace` — zastępuje cały katalog

**Export API:** `GET /api/catalog/export` — eksportuje z manifestem

### 5.18.3 Status typu — active / retired (TO-BE)

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji implementacyjnej.

**Reguły (BINDING):**
1. Typ z `status="active"` jest oferowany w TypePicker przy tworzeniu nowych instancji
2. Typ z `status="retired"` NIE jest oferowany przy nowych instancjach, ALE:
   - pozostaje dostępny w istniejących projektach (instancje zachowują referencję),
   - resolver odczytuje parametry normalnie,
   - White Box raportuje: „typ wycofany" (informacja audytowa)
3. Zmiana statusu `active → retired` **NIE wpływa** na istniejące projekty
4. Zmiana typu (modyfikacja parametrów) wymaga nowej wersji — typy są immutable (frozen)

### 5.18.4 Migracja i kompatybilność (BINDING)

| Scenariusz | Zachowanie |
|-----------|-----------|
| Import nowej wersji katalogu | Nowe typy dodawane; istniejące NIE nadpisywane (mode=merge) |
| Typ w katalogu usunięty | `TypeNotFoundError` przy próbie obliczenia → BLOCKER |
| Typ zmodyfikowany (parametry zmienione) | NIE DOPUSZCZALNE — typy immutable. Nowy typ z nowym `id` |
| Projekt z innego katalogu | Import + mapowanie `type_id` → typy w docelowym katalogu |

### 5.18.5 Wieloprojekowość (BINDING)

Katalog jest **niezależny od projektu** — jeden CatalogRepository jest współdzielony przez wszystkie projekty. Zmiana katalogu wpływa na WSZYSTKIE projekty (resolver odczytuje z jednego źródła).

**Konsekwencja:** ResultInvalidator MUSI invalidować wyniki WSZYSTKICH projektów po zmianie katalogu (import/replace).

> **Stan AS-IS:** `get_default_mv_catalog()` zwraca wbudowany katalog. Brak persystencji zmian — import jest per sesja. TO-BE: persystencja katalogu w bazie danych.

---

## 5.19 Walidacje systemowe katalogów (Decyzja #40)

### 5.19.1 Walidacje AS-IS

| Kod | Poziom | Warunek | Plik | Status |
|-----|--------|---------|------|--------|
| I002 | INFO | Branch bez `catalog_ref` | `validator.py:273` | ✅ AS-IS — TYLKO OverheadLine/Cable |
| — | — | Transformer bez `catalog_ref` | — | ❌ Brak walidacji |
| — | — | Generator bez `catalog_ref` | — | ❌ Brak walidacji (brak pola) |
| — | — | Niezgodność `voltage_rating_kv` ↔ `voltage_kv` | — | ❌ Brak walidacji |

### 5.19.2 Walidacje docelowe (TO-BE)

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji implementacyjnej.

| Kod | Poziom | Warunek | Opis |
|-----|--------|---------|------|
| I002 | INFO | Branch bez `catalog_ref` | **Rozszerzenie**: objąć Transformer, SwitchBranch (AS-IS: tylko linie/kable) |
| W-C01 | IMPORTANT | `catalog_ref` wskazuje na typ z `status="retired"` | Typ wycofany — instancja zachowuje dane, ale raportowany audyt |
| W-C02 | IMPORTANT | `voltage_rating_kv` typu ≠ `voltage_kv` szyny | Niezgodność napięciowa (spójne z §4.17 W-L04/W-L05) |
| W-C03 | IMPORTANT | Override bez snapshotu typu (brak możliwości audytu) | Spójne z §5.5.5 W010 |
| E-C01 | BLOCKER | `catalog_ref` wskazuje na nieistniejący typ | `TypeNotFoundError` z resolver |

### 5.19.3 Walidacja kompatybilności typ ↔ element (TO-BE)

| Kompatybilność | Reguła |
|----------------|--------|
| `LineType` → OverheadLine | `type.conductor_material ∈ {AL, AL_ST}` (linie napowietrzne = aluminium) |
| `CableType` → Cable | `type.insulation_type` musi być zgodny z `Cable.insulation` |
| `TransformerType` → Transformer | `type.voltage_hv_kv` musi odpowiadać `Bus(hv_bus_ref).voltage_kv` |
| `SwitchEquipmentType` → SwitchBranch | `type.equipment_kind` musi być zgodny z `SwitchBranch.type` |
| `ConverterType` → Generator(falownik) | `type.kind` musi odpowiadać `Generator.gen_type` (pv→PV, wind→WIND, bess→BESS) |

---

## 5.12a Definition of Done — UZUPEŁNIENIE (v1.1 SUPPLEMENT)

### Dodatkowe kryteria akceptacji (ALL MUST PASS with §5.12)

| # | Kryterium | Status |
|---|----------|--------|
| 16 | Zasada nadrzędna: żaden parametr znamionowy nie jest wpisywany ręcznie (z wyjątkiem Source) | ✅ Dokumentacja (§5.13) |
| 17 | Macierz pokrycia katalogowego: 7 domen ze statusem AS-IS/TO-BE/GAP | ✅ Dokumentacja (§5.14) |
| 18 | Struktura kanoniczna typu: pola obowiązkowe (id, name, manufacturer) + domenowe | ✅ AS-IS (§5.15) |
| 19 | Relacja katalog ↔ kreator: TypePicker per krok, blokada braku typu (TO-BE) | ✅ Dokumentacja (§5.16) |
| 20 | Relacja katalog ↔ ENM: type_id + parametry zmienne + override, bez duplikacji | ✅ Dokumentacja (§5.17) |
| 21 | Wersjonowanie: TypeLibraryManifest (AS-IS) + indywidualny status active/retired (TO-BE) | ✅ Dokumentacja (§5.18) |
| 22 | Walidacje systemowe: I002 (AS-IS), W-C01/W-C02/W-C03/E-C01 (TO-BE) | ✅ Dokumentacja (§5.19) |
| 23 | CT/VT: wymagane pola zdefiniowane (TO-BE) | ✅ Dokumentacja (§5.14.2) |
| 24 | Source = wyjątek od katalogu (parametry projektowe OSD, nie katalogowe) | ✅ Dokumentacja (§5.13.4) |
| 25 | Load = dopuszczalny bez katalogu (parametry projektowe, bilansowe) | ✅ Dokumentacja (§5.14.3) |

### Zamknięcie domeny (AKTUALIZACJA)

**DOMENA KONTRAKTÓW KANONICZNYCH SYSTEMU W ROZDZIALE 5 JEST ZAMKNIĘTA (v1.1 SUPPLEMENT).**

Sekcje §5.1–§5.12 definiują kanon kontraktów systemowych. Sekcje §5.13–§5.19 (SUPPLEMENT v1.1) formalizują warstwę katalogów typów jako jedyne źródło parametrów znamionowych, definiują 7 domen katalogowych, strukturę kanonicznych typów, relacje katalog↔kreator i katalog↔ENM, wersjonowanie bibliotek, oraz walidacje systemowe.

Dalsze modyfikacje wymagają ADR i wpisu do Macierzy Decyzji (AUDIT §9).

---

**KONIEC ROZDZIAŁU 5**

