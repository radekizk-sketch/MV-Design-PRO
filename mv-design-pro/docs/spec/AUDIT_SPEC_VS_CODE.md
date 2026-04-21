> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# AUDYT SPÓJNOŚCI: SYSTEM_SPEC.md vs KOD ŹRÓDŁOWY

**Data audytu:** 2026-02-08
**Wersja specyfikacji:** SYSTEM_SPEC.md v3.0
**Repozytorium:** MV-Design-PRO (commit HEAD)
**Audytor:** System Architect + PhD Energetyki

---

## 1. TABELA ZGODNOŚCI — BYTY ENM (Spec §2 vs Kod)

### 1.1 Byty zdefiniowane w specyfikacji vs implementacja

| Byt (Spec) | Klasa Python (Backend) | Interfejs TypeScript (Frontend) | Plik Python | Plik TS | Zgodność |
|---|---|---|---|---|---|
| Bus | `Bus(ENMElement)` | `Bus extends ENMElement` | `enm/models.py:85` | `types/enm.ts:72` | ✅ Zgodne |
| LineBranch (Line) | `OverheadLine(BranchBase)` | `OverheadLine extends BranchBase` | `enm/models.py:106` | `types/enm.ts:92` | ⚠️ Nazewnictwo |
| Cable | `Cable(BranchBase)` | `Cable extends BranchBase` | `enm/models.py:118` | `types/enm.ts:104` | ✅ Zgodne |
| Transformer2W | `Transformer(ENMElement)` | `Transformer extends ENMElement` | `enm/models.py:155` | `types/enm.ts:135` | ⚠️ Nazewnictwo |
| Transformer3W | ❌ Brak | ❌ Brak | — | — | ❌ Brak impl. |
| Switch/Breaker | `SwitchBranch(BranchBase)` | `SwitchBranch extends BranchBase` | `enm/models.py:131` | `types/enm.ts:117` | ✅ Zgodne |
| Source | `Source(ENMElement)` | `Source extends ENMElement` | `enm/models.py:180` | `types/enm.ts:159` | ✅ Zgodne |
| Load | `Load(ENMElement)` | `Load extends ENMElement` | `enm/models.py:200` | `types/enm.ts:178` | ✅ Zgodne |
| Station | `Substation(ENMElement)` | `Substation extends ENMElement` | `enm/models.py:225` | `types/enm.ts:201` | ✅ Zgodne |

### 1.2 Byty obecne w kodzie, BRAK w specyfikacji

| Byt (Kod) | Klasa/Interfejs | Plik | Status w Spec |
|---|---|---|---|
| **FuseBranch** | `FuseBranch(BranchBase)` | `enm/models.py:138` | ❌ Brak w SYSTEM_SPEC §2 |
| **Generator** | `Generator(ENMElement)` | `enm/models.py:212` | ⚠️ Wymieniony ogólnie w Source, brak dedykowanego opisu |
| **Bay** | `Bay(ENMElement)` | `enm/models.py:239` | ❌ Brak w SYSTEM_SPEC §2 |
| **Junction** | `Junction(ENMElement)` | `enm/models.py:254` | ❌ Brak w SYSTEM_SPEC §2 |
| **Corridor** | `Corridor(ENMElement)` | `enm/models.py:266` | ❌ Brak w SYSTEM_SPEC §2 |
| **GroundingConfig** | `GroundingConfig(BaseModel)` | `enm/models.py:22` | ❌ Brak w SYSTEM_SPEC |
| **BusLimits** | `BusLimits(BaseModel)` | `enm/models.py:28` | ❌ Brak w SYSTEM_SPEC |
| **BranchRating** | `BranchRating(BaseModel)` | `enm/models.py:33` | ❌ Brak w SYSTEM_SPEC |
| **GenLimits** | `GenLimits(BaseModel)` | `enm/models.py:39` | ❌ Brak w SYSTEM_SPEC |
| **ENMHeader** | `ENMHeader(BaseModel)` | `enm/models.py:69` | ❌ Brak w SYSTEM_SPEC |
| **ENMDefaults** | `ENMDefaults(BaseModel)` | `enm/models.py:64` | ❌ Brak w SYSTEM_SPEC |
| **InverterSource** | `InverterSource` | `network_model/core/inverter.py` | ❌ Brak w SYSTEM_SPEC |

### 1.3 Byty warstwy solverowej (network_model.core vs Spec)

| Byt Solver | Klasa | Plik | Spec §2 | Uwagi |
|---|---|---|---|---|
| Node | `Node(id, name, node_type, voltage_level, ...)` | `network_model/core/node.py` | ⚠️ Opisane jako Bus | ENM Bus mapowane na solver Node |
| LineBranch | `LineBranch(id, r_ohm_per_km, x_ohm_per_km, ...)` | `network_model/core/branch.py` | ✅ | Solver-level gałąź |
| TransformerBranch | `TransformerBranch(id, rated_power_mva, ...)` | `network_model/core/branch.py` | ✅ | Solver-level transformator |
| Switch | `Switch(id, switch_type, state)` | `network_model/core/switch.py` | ✅ | Solver-level łącznik |
| NetworkGraph | `NetworkGraph(nodes, branches, switches)` | `network_model/core/graph.py` | §2.4 | Częściowy opis |
| AdmittanceMatrixBuilder | `AdmittanceMatrixBuilder` | `network_model/core/ybus.py` | ❌ Brak | Kluczowy byt solvera |
| InverterSource | `InverterSource(id, ik_sc_a, ...)` | `network_model/core/inverter.py` | ❌ Brak | Źródła falownikowe |

---

## 2. ROZBIEŻNOŚCI KRYTYCZNE

### ROZBIEŻNOŚĆ #1: Transformer3W brak implementacji
- **Spec mówi:** §2.1 — "Transformer3W | Three-winding transformer | Yes"
- **Kod robi:** Brak klasy Transformer3W — ani w ENM, ani w solver
- **Wpływ:** P1 (ważne, ale nie blokujące — 3W trafo rzadkie w SN)
- **Rozwiązanie:** Usunąć z Spec lub oznaczyć jako PLANNED

### ROZBIEŻNOŚĆ #2: Spec opisuje Bus z polami solvera
- **Spec mówi:** §2.3 — "Bus: node_type: SLACK|PQ|PV, voltage_magnitude_pu, voltage_angle_rad, active_power_mw, reactive_power_mvar"
- **Kod robi:** ENM `Bus` NIE ma tych pól. To pola solvera `Node`, a nie modelu ENM. Mapowanie odbywa się w `enm/mapping.py`.
- **Wpływ:** P0 (krytyczne — mylące dla implementatorów)
- **Rozwiązanie:** Rozdzielić w specyfikacji byty ENM od bytów solvera. Bus ENM = `voltage_kv, grounding, zone`. Node Solver = `node_type, voltage_magnitude, ...`

### ROZBIEŻNOŚĆ #3: Spec nie rozróżnia warstw modelu
- **Spec mówi:** §2.3 — opisuje elementy jednolicie
- **Kod robi:** Dwie odrębne warstwy: ENM (`enm/models.py`) i Solver (`network_model/core/`), z deterministycznym mapowaniem (`enm/mapping.py`)
- **Wpływ:** P0 (architektura krytyczna)
- **Rozwiązanie:** Specyfikacja musi jasno definiować: (1) ENM model, (2) Solver model, (3) Mapowanie ENM→Solver

### ROZBIEŻNOŚĆ #4: Brak FuseBranch w spec
- **Spec mówi:** §2.1 — "Switch/Breaker" jako typ łącznika, brak "Fuse"
- **Kod robi:** `FuseBranch(BranchBase)` z `type="fuse"`, mapowany na `Switch(FUSE)` w solverze
- **Wpływ:** P1 (bezpiecznik to powszechny element SN)
- **Rozwiązanie:** Dodać FuseBranch do specyfikacji

### ROZBIEŻNOŚĆ #5: Generator jako osobny byt
- **Spec mówi:** §2.1 — Generator wymieniony pod "Source"
- **Kod robi:** `Generator` jest osobnym bytem ENM (osobna lista w `EnergyNetworkModel.generators`), niezależnym od `Source`
- **Wpływ:** P0 (architektura modelu)
- **Rozwiązanie:** Specyfikacja musi odzwierciedlać: Source ≠ Generator w ENM

### ROZBIEŻNOŚĆ #6: Brak elementów topologicznych w spec
- **Spec mówi:** §2.2 — "Station containers store no physics (logical grouping only)"
- **Kod robi:** Istnieją Bay, Junction, Corridor jako pełne byty ENM z walidacjami (W005-W008, I003-I005)
- **Wpływ:** P1 (te byty są zaimplementowane i używane)
- **Rozwiązanie:** Dodać pełne definicje Bay, Junction, Corridor do specyfikacji

### ROZBIEŻNOŚĆ #7: Brak opisu macierzy admitancyjnej (Y-bus)
- **Spec mówi:** §5.3 — "Expose calculation steps (Y-bus, Z-thevenin, Jacobian)"
- **Kod robi:** `AdmittanceMatrixBuilder` w `network_model/core/ybus.py` — pełna implementacja budowy Y-bus
- **Wpływ:** P1 (kluczowy element solvera, brak opisu matematycznego)
- **Rozwiązanie:** Dodać pełny opis budowy Y-bus z wzorami

### ROZBIEŻNOŚĆ #8: Spec nie opisuje mapowania ENM → NetworkGraph
- **Spec mówi:** Brak wzmianki o mapowaniu
- **Kod robi:** `enm/mapping.py` — deterministyczna funkcja `map_enm_to_network_graph(enm) → NetworkGraph`
- **Wpływ:** P0 (kluczowy komponent architektury)
- **Rozwiązanie:** Dodać pełny opis mapowania: reguły, kolejność, deterministyka

### ROZBIEŻNOŚĆ #9: ShortCircuitResult API rozbudowane vs Spec
- **Spec mówi:** §5.4 — `ShortCircuitResult: ikss_ka, ip_ka, ith_ka, white_box_trace`
- **Kod robi:** 20+ pól: `ikss_a, ip_a, ith_a, ib_a, sk_mva, kappa, rx_ratio, tk_s, tb_s, c_factor, un_v, zkk_ohm, contributions, branch_contributions, ik_thevenin_a, ik_inverters_a, ik_total_a, ...` (jednostki w A, nie kA)
- **Wpływ:** P0 (frozen API nie odpowiada specyfikacji)
- **Rozwiązanie:** Zaktualizować spec do aktualnego kontraktu API

### ROZBIEŻNOŚĆ #10: PowerFlowResult API rozbudowane vs Spec
- **Spec mówi:** §5.4 — `PowerFlowResult: bus_voltages, branch_flows, losses, white_box_trace`
- **Kod robi:** `PowerFlowNewtonSolution` z 30+ polami: `converged, iterations, max_mismatch, node_voltage, node_u_mag, node_angle, node_voltage_kv, branch_current, branch_s_from, branch_s_to, losses_total, slack_power, ybus_trace, nr_trace, applied_taps, applied_shunts, pv_to_pq_switches, init_state, solver_method, fallback_info, ...`
- **Wpływ:** P0 (frozen API nie odpowiada specyfikacji)
- **Rozwiązanie:** Zaktualizować spec do aktualnego kontraktu API

---

## 3. ROZBIEŻNOŚCI TERMINOLOGICZNE

| Spec | Kod Python | Kod TypeScript | Uwagi |
|---|---|---|---|
| LineBranch | OverheadLine | OverheadLine | Spec używa "LineBranch", kod "OverheadLine" |
| Transformer2W | Transformer | Transformer | Spec mówi "Transformer2W", kod "Transformer" |
| Bus.node_type | Brak w ENM | Brak w ENM | Pole solvera, nie ENM |
| Bus.voltage_level_kv | Bus.voltage_kv | Bus.voltage_kv | Spec: `voltage_level_kv`, kod: `voltage_kv` |
| Branch.from_bus_id | Branch.from_bus_ref | Branch.from_bus_ref | Spec: `_id`, kod: `_ref` |
| Source.p_mw, q_mvar | Brak w ENM Source | Brak w ENM Source | Spec dodaje p/q do Source, kod ich nie ma |
| Source.sk_mva | Source.sk3_mva | Source.sk3_mva | Spec: `sk_mva`, kod: `sk3_mva` |
| Switch.state: OPEN/CLOSED | Branch.status: open/closed | Branch.status: 'open'/'closed' | Case różni się, wartości małe litery |
| Station.elements | Substation.bus_refs + transformer_refs | Substation.bus_refs + transformer_refs | Różna struktura |

---

## 4. WALIDACJE — SPEC vs KOD

### 4.1 Walidacje zaimplementowane (ENMValidator)

| Kod | Poziom | Opis | W Spec §8? |
|---|---|---|---|
| E001 | BLOCKER | Brak źródła zasilania | ✅ (network.source_present) |
| E002 | BLOCKER | Brak szyn | ⚠️ Częściowo |
| E003 | BLOCKER | Graf niespójny (wyspy bez źródła) | ✅ (network.connected) |
| E004 | BLOCKER | Szyna bez napięcia znamionowego | ✅ (bus.voltage_valid) |
| E005 | BLOCKER | Gałąź bez impedancji (R=0, X=0) | ❌ Brak w spec |
| E006 | BLOCKER | Transformator bez uk% | ❌ Brak w spec |
| E007 | BLOCKER | Transformator HV=LV | ✅ (transformer.hv_lv_different) |
| E008 | BLOCKER | Źródło bez parametrów zwarciowych | ❌ Brak w spec |
| W001 | IMPORTANT | Brak Z₀ na linii | ❌ Brak w spec |
| W002 | IMPORTANT | Brak Z₀ źródła | ❌ Brak w spec |
| W003 | IMPORTANT | Brak odbiorów i generatorów | ❌ Brak w spec |
| W004 | IMPORTANT | Transformator bez grupy połączeń | ❌ Brak w spec |
| W005 | IMPORTANT | Stacja — referencja do nieistniejącego elementu | ❌ Brak w spec |
| W006 | IMPORTANT | Pole — referencja do nieistniejącej stacji/szyny | ❌ Brak w spec |
| W007 | IMPORTANT | Junction z <3 gałęziami | ❌ Brak w spec |
| W008 | IMPORTANT | Corridor z nieistniejącymi segmentami | ❌ Brak w spec |
| I001 | INFO | Łącznik otwarty | ❌ Brak w spec |
| I002 | INFO | Gałąź bez katalogu | ❌ Brak w spec |
| I003 | INFO | Stacja bez pól | ❌ Brak w spec |
| I004 | INFO | Pusta magistrala | ❌ Brak w spec |
| I005 | INFO | Pierścień bez punktu NO | ❌ Brak w spec |

**Wniosek:** Spec opisuje 6 reguł walidacyjnych, kod implementuje **21 reguł** (8 BLOCKER, 8 IMPORTANT, 5 INFO).

### 4.2 Walidacje w Spec, BRAK w kodzie

| Reguła Spec | Status implementacji |
|---|---|
| network.no_dangling | ❌ Brak osobnej reguły (częściowo pokryte przez E003 connectivity) |
| branch.endpoints_exist | ❌ Brak explicit walidacji (mapping.py pomija brakujące) |

---

## 5. API ENDPOINTS — SPEC vs KOD

### 5.1 Endpointy ENM

| Spec | Kod | Plik | Status |
|---|---|---|---|
| Brak | `GET /api/cases/{id}/enm` | `api/enm.py:71` | ✅ Impl, ❌ brak w spec |
| Brak | `PUT /api/cases/{id}/enm` | `api/enm.py:78` | ✅ Impl, ❌ brak w spec |
| Brak | `GET /api/cases/{id}/enm/validate` | `api/enm.py:85` | ✅ Impl, ❌ brak w spec |
| Brak | `GET /api/cases/{id}/enm/topology` | `api/enm.py:94` | ✅ Impl, ❌ brak w spec |
| Brak | `GET /api/cases/{id}/enm/readiness` | `api/enm.py:110` | ✅ Impl, ❌ brak w spec |
| Brak | `POST /api/cases/{id}/runs/short-circuit` | `api/enm.py:160` | ✅ Impl, ❌ brak w spec |

### 5.2 Inne endpointy (w kodzie, brak w spec)

| Endpoint | Plik | Opis |
|---|---|---|
| `/api/projects/*` | `api/projects.py` | CRUD projektów |
| `/api/study-cases/*` | `api/study_cases.py` | Study Cases |
| `/api/cases/*` | `api/cases.py` | Cases legacy |
| `/api/analysis-runs/*` | `api/analysis_runs.py` | Analiza uruchomienia |
| `/api/power-flow-runs/*` | `api/power_flow_runs.py` | Rozpływ mocy |
| `/api/protection-runs/*` | `api/protection_runs.py` | Zabezpieczenia |
| `/api/proof-packs/*` | `api/proof_pack.py` | Pakiety dowodowe |
| `/api/catalog/*` | `api/catalog.py` | Katalog typów |
| `/api/snapshots/*` | `api/snapshots.py` | Snapshoty |
| `/api/sld/*` | `api/sld.py` | SLD |
| `/api/design-synth/*` | `api/design_synth.py` | Synteza projektu |
| `/api/diagnostics/*` | `api/diagnostics.py` | Diagnostyka |
| `/api/comparison/*` | `api/comparison.py` | Porównania |
| `/api/reference-patterns/*` | `api/reference_patterns.py` | Wzorce referencyjne |
| `/api/equipment-proof-packs/*` | `api/equipment_proof_pack.py` | Dowody wyposażenia |
| `/api/xlsx-import/*` | `api/xlsx_import.py` | Import XLSX |

**Wniosek:** Spec NIE opisuje żadnych konkretnych endpointów API. Kod implementuje **30+ endpointów**.

---

## 6. SOLVERY — SPEC vs KOD

### 6.1 Short Circuit IEC 60909

| Aspekt | Spec | Kod | Zgodność |
|---|---|---|---|
| Lokalizacja | `network_model.solvers.short_circuit_iec60909` | `network_model/solvers/short_circuit_iec60909.py` | ✅ |
| Typy zwarć | Brak specyfikacji | 3F, 2F, 1F, 2F+G (`ShortCircuitType` enum) | ❌ Brak w spec |
| Wzory Ik'' | Brak | `Ik'' = c·Un·kU / |Zk|` | ❌ Brak w spec |
| Wzory ip | Brak | `ip = κ·√2·Ik'', κ = 1.02 + 0.98·e^(-3R/X)` | ❌ Brak w spec |
| Wzory Ith | Brak | `Ith = Ik''·√tk` | ❌ Brak w spec |
| Wzory Ib | Brak | `Ib = Ik''·√(1 + ((κ-1)·e^(-tb/ta))²)` | ❌ Brak w spec |
| Wzory Sk | Brak | `Sk = √3·Un·Ik'' / 10⁶` | ❌ Brak w spec |
| White Box trace | "Expose calculation steps" | Pełny tracer: Zk, Ikss, kappa, Ip, Ib, Ith, Sk | ✅ |
| Wkłady falowników | Brak | `_compute_inverter_contribution()` | ❌ Brak w spec |
| Wkłady źródeł | Brak | `ShortCircuitSourceContribution` | ❌ Brak w spec |
| Wkłady gałęzi | Brak | `ShortCircuitBranchContribution` | ❌ Brak w spec |
| Macierz Z-bus | Wymieniona ogólnie | `build_zbus(graph) → (builder, z_bus)` | ⚠️ Brak szczegółów |

### 6.2 Power Flow Newton-Raphson

| Aspekt | Spec | Kod | Zgodność |
|---|---|---|---|
| Lokalizacja | `network_model.solvers.power_flow_newton` | `network_model/solvers/power_flow_newton.py` | ✅ |
| Równania mocy | Brak | `compute_power_injections(ybus, v)` | ❌ Brak w spec |
| Macierz Jacobiego | Wymieniona ogólnie | `newton_raphson_solve()` w internal | ⚠️ Brak szczegółów |
| Typy węzłów | Brak opisu mapowania | PQ → Load, PV → Generator, SLACK → Source bus | ❌ Brak w spec |
| Zbieżność | Brak | `max(|ΔP|, |ΔQ|) < ε` | ❌ Brak w spec |
| Opcje solvera | Brak | `max_iter, tolerance, damping, trace_level` | ❌ Brak w spec |

### 6.3 Dodatkowe solvery

| Solver | Spec | Kod | Status |
|---|---|---|---|
| Gauss-Seidel PF | ✅ Wymieniony | `power_flow_gauss_seidel.py` | ✅ Impl |
| Fast-Decoupled PF | ✅ Wymieniony | `power_flow_fast_decoupled.py` | ✅ Impl |

---

## 7. ELEMENTY BRAKUJĄCE W SPECYFIKACJI

### 7.1 Brakujące opisy modeli matematycznych
- [ ] Składowe symetryczne (Z₁, Z₂, Z₀) — parametry zerowe linii/kabli/trafo
- [ ] Budowa macierzy admitancyjnej Y-bus (wzory Yii, Yij)
- [ ] Budowa macierzy impedancyjnej Z-bus (Z = Y⁻¹)
- [ ] Schemat zastępczy π linii/kabla (R+jX, B/2)
- [ ] Schemat zastępczy transformatora (RT+jXT, gałąź magnesująca)
- [ ] Korekta impedancji transformatora wg PN-EN 60909 (KT)
- [ ] Korekta impedancji generatora wg PN-EN 60909 (KG)
- [ ] Tabela współczynników napięciowych c (cmin, cmax) wg PN-EN 60909
- [ ] Napięcie źródła zastępczego c·Un/√3
- [ ] Równania mocowo-napięciowe (P-Q) w formie biegunowej
- [ ] Macierz Jacobiego (H, N, K, L)
- [ ] Kryterium zbieżności Newton-Raphson
- [ ] Model ZIP odbioru (stałomocowy, stałoprądowy, stałoimpedancyjny)

### 7.2 Brakujące opisy funkcjonalności
- [ ] Kreator K1-K10 — kroki, walidacje, przejścia
- [ ] Drzewo ENM — struktura, nawigacja, selekcja
- [ ] SLD auto-layout — algorytm 5-fazowy, konfiguracja
- [ ] Synchronizacja selekcji (SLD ↔ Drzewo ↔ Inspektor)
- [ ] Proof Engine — format ABCD, pakiety dowodowe
- [ ] Zabezpieczenia — funkcje I>/I>>, model ProtectionDevice
- [ ] Przekładniki CT/VT — model, klasy dokładności
- [ ] SPZ (samoczynne powtórne załączenie)
- [ ] Topologia wysp — algorytm detekcji BFS/DFS
- [ ] Snapshoty i wersjonowanie — immutable run storage
- [ ] Katalog typów — struktura, resolver, precendencja parametrów
- [ ] Uziemienie — typy (izolowany, Petersena, rezystor, bezpośredni)
- [ ] Persystencja — in-memory store → PostgreSQL/MongoDB

### 7.3 Brakujące kontrakty API
- [ ] Pełna tabela endpointów REST z request/response
- [ ] Kontrakty WebSocket (jeśli istnieją)
- [ ] Kody błędów HTTP (422, 404, 500)
- [ ] Format odpowiedzi (envelope, pagination)

### 7.4 Brakujące opisy testów
- [ ] Kryteria akceptacyjne per byt ENM
- [ ] Tolerancje numeryczne solverów
- [ ] Golden tests — dane referencyjne
- [ ] Testy regresji frozen API

---

## 8. PODSUMOWANIE AUDYTU

### 8.1 Statystyki zgodności

| Kategoria | Spec | Kod | Pokrycie |
|---|---|---|---|
| Byty ENM | 8 typów | 13 typów + 6 supporting | **62%** |
| Walidacje | 6 reguł | 21 reguł | **29%** |
| Solvery | 4 wymienione | 4 zaimplementowane | **100%** (nazwy) / **~10%** (szczegóły) |
| API Endpoints | 0 opisanych | 30+ zaimplementowanych | **0%** |
| Modele matematyczne | 0 wzorów | Pełne impl. w kodzie | **0%** |
| Testy | Brak opisu | 100+ plików testowych | **0%** |

### 8.2 Priorytetyzacja rozbieżności

| Priorytet | Opis | Ilość |
|---|---|---|
| **P0 — Krytyczne** | Architektura, frozen API, warstwa ENM vs Solver | **5** |
| **P1 — Ważne** | Brakujące byty, nazewnictwo, walidacje | **5** |
| **P2 — Kosmetyczne** | Nazewnictwo, formatowanie | **~10** |

### 8.3 Rekomendacja

Specyfikacja SYSTEM_SPEC.md v3.0 pokrywa ~**15-20%** rzeczywistego systemu. Konieczna jest:

1. **Pełna rozbudowa** specyfikacji do ≥18 plików modułowych
2. **Rozdzielenie** warstwy ENM i warstwy Solver
3. **Dodanie** modeli matematycznych z wzorami i przykładami
4. **Dodanie** pełnych kontraktów API
5. **Dodanie** walidacji z kodami błędów
6. **Dodanie** testów akceptacyjnych z danymi referencyjnymi
7. **Aktualizacja** frozen API do aktualnego stanu kodu

---

## 9. DECISION MATRIX (BINDING)

Poniższe decyzje architektoniczne są **wiążące** dla całego procesu rozbudowy specyfikacji.
Każda rozbieżność z §2 otrzymuje jednoznaczną dyspozycję.

### 9.1 Klasyfikacja decyzji

| Status | Znaczenie |
|---|---|
| **BINDING** | Decyzja podjęta — MUSI być odzwierciedlona w specyfikacji AS-IS |
| **DO-NOT-SPECIFY** | Celowo pominięte — NIE podlega specyfikacji w danej warstwie |
| **REQUIRES-DECISION** | Wymaga osobnej decyzji architektonicznej przed specyfikacją |

### 9.2 Macierz decyzji

| # | Rozbieżność | Decyzja | Warstwa | Plik docelowy | Uzasadnienie |
|---|---|---|---|---|---|
| 1 | Pola solverowe (`node_type`, `voltage_magnitude_pu`) opisane jako atrybuty Bus ENM | **DO-NOT-SPECIFY** | Solver | — | To nie jest fizyka ENM, lecz warstwa obliczeniowa. Bus ENM = `voltage_kv, grounding, zone`. Node solvera = `node_type, voltage_magnitude, ...`. Specyfikacja ENM MUSI opisywać wyłącznie kontrakt `enm/models.py`. Pola solvera należą do warstwy Solver i są produkowane przez deterministyczne mapowanie `map_enm_to_network_graph()`. |
| 2 | Brak rozróżnienia ENM vs Solver w specyfikacji | **BINDING** | Architecture | `SPEC_00_LAYERING.md` | System operuje na trzech odrębnych warstwach danych: (1) ENM — edytowalny model fizyczny, (2) NetworkGraph — read-only model solverowy, (3) Results — frozen wyniki obliczeń. Specyfikacja MUSI definiować granice warstw i kontrakt mapowania ENM→NetworkGraph. |
| 3 | `Generator` traktowany jak `Source` w spec | **BINDING** | ENM Core | `SPEC_02_ENM_CORE.md` | Generator ≠ Source. Różne warunki brzegowe (PV vs SLACK), różne parametry (`p_mw, q_mvar, gen_type, limits` vs `sk3_mva, r_ohm, x_ohm, c_max`), osobne listy w `EnergyNetworkModel`. Specyfikacja MUSI traktować Generator jako osobny byt ENM. |
| 4 | `ShortCircuitResult` (Frozen API) nieopisany — 20+ pól w kodzie, 4 w spec | **BINDING** | Results API | `SPEC_06_RESULTS_API.md` | Frozen API jest kontraktem publicznym. Specyfikacja MUSI zawierać kompletną listę pól 1:1 z `ShortCircuitResult` w `short_circuit_iec60909.py` oraz `EXPECTED_SHORT_CIRCUIT_RESULT_KEYS`. |
| 5 | `PowerFlowNewtonSolution` nieopisany — 30+ pól w kodzie, 4 w spec | **BINDING** | Results API | `SPEC_06_RESULTS_API.md` | Jak #4. Specyfikacja MUSI zawierać kompletną listę pól 1:1 z `PowerFlowNewtonSolution` w `power_flow_newton.py`. |
| 6 | `Transformer3W` w spec, brak implementacji | **REQUIRES-DECISION** | Future / Planned | — | Transformer3W nie istnieje w kodzie (ani ENM, ani solver). Nie implementować w specyfikacji AS-IS. Jeśli decyzja o implementacji zapadnie, powstanie osobny dokument TO-BE. W obecnej specyfikacji: usunąć z listy elementów rdzeniowych lub oznaczyć jawnie jako PLANNED/NOT-IMPLEMENTED. |
| 7 | `FuseBranch` zaimplementowany w kodzie, brak w spec | **BINDING** | ENM Core | `SPEC_02_ENM_CORE.md` | FuseBranch (`type="fuse"`) istnieje w `enm/models.py`, mapowany na `Switch(FUSE)` w solverze. Specyfikacja MUSI go opisywać jako element dyskryminowanej unii `Branch`. |
| 8a | `Bay` — pole rozdzielcze | **BINDING** | ENM Meta | `SPEC_03_ENM_META.md` | Bay jest bytem organizacyjnym ENM (logiczna struktura rozdzielni). Nie wpływa na solver. Specyfikacja MUSI go opisywać jako element ENM warstwy meta (organizacja, nie fizyka). |
| 8b | `Junction` — węzeł T | **BINDING** | ENM Core | `SPEC_02_ENM_CORE.md` | Junction modeluje rozgałęzienie magistrali — jest częścią topologii fizycznej ENM. Bus kind=JUNCTION w kontekście routingu. Specyfikacja MUSI go opisywać. |
| 8c | `Corridor` — magistrala | **DO-NOT-SPECIFY** w ENM Core | SLD Layout / Route | `SPEC_05_SLD_LAYOUT_ROUTE.md` | Corridor jest konceptem routingu SLD i organizacji wizualnej, NIE elementem fizycznym sieci. Nie wpływa na solver. Specyfikacja ENM Core NIE powinna go zawierać. Corridor należy do warstwy SLD Layout. |
| 9 | Walidacje (21 reguł w kodzie vs 6 w spec) | **BINDING** | Validation | `SPEC_07_VALIDATION.md` | Wszystkie 21 reguł ENMValidator (E001-E008, W001-W008, I001-I005) MUSZĄ być opisane w specyfikacji walidacji AS-IS, 1:1 z `enm/validator.py`. |
| 10 | API Endpoints (30+ w kodzie vs 0 w spec) | **BINDING** | Public API | `SPEC_08_PUBLIC_API.md` | Wszystkie publiczne endpointy z `api/*.py` MUSZĄ być opisane z kontraktami request/response. |
| 11 | Generator energoelektroniczny (falownik) — brak walidacji poziomu napięcia | **BINDING** | ENM Core + Validation | `SPEC_02_ENM_CORE.md`, `SPEC_07_VALIDATION.md` | Generator z `gen_type ∈ {pv_inverter, wind_inverter, bess}` jest ZAWSZE elementem niskonapięciowym (nn). Napięcie znamionowe falownika wynika wyłącznie z wybranego typu w katalogu — specyfikacja NIE definiuje sztywnych wartości napięć. W kodzie (`enm/models.py:216`) `gen_type` zawiera te wartości, ale brak walidacji w `enm/validator.py`: falownik może być przypisany do Bus SN (`voltage_kv > 1 kV`). Specyfikacja MUSI jawnie zakazać bezpośredniego przyłączenia generatora energoelektronicznego do szyny SN i opisać wymaganą walidację. |
| 12 | Brak wymuszenia transformatora przy integracji OZE z SN | **BINDING** | ENM Core + Wizard | `SPEC_02_ENM_CORE.md`, `SPEC_13_WIZARD.md` | Każda integracja źródła OZE (falownika nn) z siecią SN wymaga obecności transformatora nn/SN w ENM jako osobnego, jawnego elementu. Obecny kod tego nie wymusza — `mapping.py` mapuje Generator na P/Q adjustment bez sprawdzenia toru napięciowego. Specyfikacja MUSI definiować kanoniczną topologię: `Generator(nn) → Bus(nn) → Łącznik/Zabezpieczenie → Bus(nn stacji) → Transformator(nn/SN) → Bus(SN)`. Kreator MUSI wymuszać tę sekwencję. |
| 13 | Odbiory — brak wymuszenia kompletnego toru przyłączenia | **BINDING** | ENM Core + Wizard | `SPEC_02_ENM_CORE.md`, `SPEC_13_WIZARD.md` | Load jest przyłączany do Bus przez `bus_ref` (`enm/models.py:201`), ale brak wymuszenia kompletnego toru fizycznego (szyna → łącznik/zabezpieczenie → pole odpływowe → odbiór). Specyfikacja MUSI opisywać normową topologię przyłączenia odbioru. |
| 14 | InverterSource w solverze — brak mapowania z ENM Generator | **BINDING** | Layering + Solver | `SPEC_00_LAYERING.md`, `SPEC_10_SOLVER_SC_IEC60909.md` | `InverterSource` istnieje w warstwie solvera (`network_model/core/inverter.py`) i jest używany w SC solver (`_compute_inverter_contribution()` w `short_circuit_iec60909.py`), ale NIE jest mapowany z ENM `Generator(gen_type=pv_inverter|wind_inverter|bess)` w `enm/mapping.py`. Katalog zawiera `ConverterType` i `InverterType` (`catalog/types.py`). Specyfikacja MUSI opisać kontrakt mapowania Generator(falownik) → InverterSource. |
| 15 | Katalog typów — resolver istnieje, ale brak catalog_ref na Generator i Load | **BINDING** | ENM Core + Catalog | `SPEC_02_ENM_CORE.md`, `SPEC_00_LAYERING.md` | System posiada `catalog/resolver.py` z 3-poziomową precedencją (`impedance_override > type_ref > instance`) i typami `ParameterSource` (OVERRIDE, TYPE_REF, INSTANCE). `OverheadLine`, `Cable`, `Transformer` mają `catalog_ref` (AS-IS). `Generator` i `Load` NIE mają `catalog_ref` (GAP). Katalog zawiera `ConverterType`, `InverterType` (`catalog/types.py`), ale Generator ich nie referencjonuje. Specyfikacja MUSI opisać zasadę: katalog jest domyślnym i preferowanym źródłem parametrów znamionowych dla WSZYSTKICH elementów sieciowych, oraz zaplanować rozszerzenie `catalog_ref` na Generator (TO-BE). |
| 16 | Brak trybu EKSPERT — kontrolowana edycja parametrów typu | **BINDING** | Application + ENM | `SPEC_02_ENM_CORE.md`, `SPEC_13_WIZARD.md` | System NIE posiada trybu ekspert w kodzie. UI ma 3 tryby SLD: EDYCJA, WYNIKI, ZABEZPIECZENIA — żaden nie dotyczy parametrów typu. Istnieje `impedance_override` na `LineBranch` (`resolve_line_params()` w `resolver.py`), ale TYLKO dla linii/kabli. Specyfikacja MUSI zdefiniować jawny TRYB EKSPERT: (1) wyraźnie oznaczony w UI, (2) świadomie aktywowany, (3) override NIE modyfikuje katalogu, (4) override zapisywany per instancja, (5) audytowalny w White Box. Status: TO-BE. |
| 17 | Brak liczby instancji równoległych na Generator/InverterSource | **BINDING** | ENM Core + Solver | `SPEC_02_ENM_CORE.md`, `SPEC_10_SOLVER_SC_IEC60909.md` | `Generator` (`enm/models.py:212`) nie ma pola `n_parallel` ani `count`. `InverterSource` (`inverter.py`) również nie ma. Solver SC sumuje wkłady N osobnych obiektów `InverterSource`, ale kreator nie oferuje „N identycznych falowników równolegle". Specyfikacja MUSI zdefiniować obsługę wielu identycznych falowników: użytkownik podaje TYP + LICZBĘ → kreator tworzy N instancji w ENM (lub jedno pole `n_parallel` z rozwinięciem przy mapowaniu na solver). Status: TO-BE. |
| 18 | Zasada kompozycji: instancja = TYP × parametry zmienne × ilość | **BINDING** | Architecture | `SPEC_00_LAYERING.md`, `SPEC_02_ENM_CORE.md` | Specyfikacja MUSI definiować kanoniczną zasadę kompozycji elementów ENM: `instancja = TYP(katalog) + parametry_zmienne(kreator) + [override(tryb_ekspert)] + ilość`. Dotyczy wszystkich elementów: linia (LineType × długość), transformator (TransformerType × pozycja zaczepu × uziemienie), falownik (ConverterType × parametry eksploatacyjne × n_parallel), odbiór (LoadType × P,Q,cosφ). Zasada ta jest częściowo zaimplementowana (AS-IS: resolver.py, catalog_ref na Branch/Trafo) i częściowo planowana (TO-BE: catalog_ref na Generator, n_parallel, tryb ekspert). |
| 19 | Napięcie falownika = parametr typu katalogowego, nie reguła specyfikacji | **BINDING** | ENM Core + Catalog + Wizard | `SPEC_02_ENM_CORE.md`, `SPEC_13_WIZARD.md` | Specyfikacja NIE MOŻE definiować sztywnych wartości napięć falowników. Napięcie znamionowe falownika wynika WYŁĄCZNIE z wybranego typu w katalogu (`ConverterType` / `InverterType`). Bus nn źródła ma napięcie determinowane przez typ przyłączonego falownika — nie przez regułę systemową, nie przez decyzję użytkownika w kreatorze. Kreator odczytuje napięcie z katalogu i przypisuje je do Bus nn automatycznie. Specyfikacja zachowuje jedynie zasadę: falownik jest elementem nn, bezpośrednie przyłączenie do SN jest niedozwolone. |
| 20 | Granica ENM: zamknięta lista bytów obliczeniowych, zakaz danych solverowych | **BINDING** | ENM Core | `SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md` | ENM posiada zamkniętą listę 10 bytów obliczeniowych: Bus, Junction, OverheadLine, Cable, SwitchBranch, FuseBranch, Transformer, Source, Generator, Load. Solver widzi WYŁĄCZNIE te byty (po mapowaniu). Substation, Bay, Corridor NIE SĄ bytami obliczeniowymi — solver ich nie przetwarza (`mapping.py` ich nie importuje). ENM NIE MOŻE przechowywać danych solverowych (node_type, voltage_magnitude_pu, active_power_mw) ani wyników obliczeń. Dodanie nowego bytu obliczeniowego wymaga ADR. |
| 21 | Klasyfikacja funkcji zabezpieczeniowych: Technologiczne vs Sieciowe | **BINDING** | ENM Core + Protection + WhiteBox | `SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md`, `SPEC_12_PROTECTION.md` | ProtectionFunction dzieli się na dwie rozłączne klasy: (1) **Technologiczne** — wbudowane w falownik (LVRT, HVRT, 81U/81O/81R, anti-islanding), autonomiczne, ≤250 ms, BEZ koordynacji selektywnej, modelowane jako warunki brzegowe NC RfG / IRiESD; (2) **Sieciowe** — klasyczne IEC/benchmark (50, 51, 50N, 51N, 27, 59, 21, 67, 87, 79), nastawiane, selektywne, podlegające koordynacji. Klasy te NIE SĄ zamienne i NIE podlegają wzajemnej koordynacji — solver zabezpieczeń przetwarza WYŁĄCZNIE klasę Sieciowe, klasa Technologiczne jest warunkiem brzegowym. Każda ProtectionFunction MUSI mieć punkt pomiarowy (miejsce, źródło sygnału, aparatura sterowana). White Box MUSI rozróżniać zdarzenia TECHNOLOGICAL i NETWORK w `event_type`. Kod AS-IS (`sanity_checks/rules.py`) NIE klasyfikuje funkcji — wszystkie traktowane jednorodnie (GAP do usunięcia w SPEC_12). |
| 22 | Koordynacja falownik ↔ sieć SN: falownik = warunek brzegowy, nie uczestnik selektywności | **BINDING** | Protection + Solver SC | `SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md`, `SPEC_12_PROTECTION.md` | Projekt zabezpieczeń SN MUSI zakładać, że falownik odłączy się pierwszy (≤250 ms) przy przekroczeniu progów NC RfG — sieć NIE MOŻE „czekać" na falownik w logice selektywności. Po odłączeniu falownika solver SC MUSI uwzględniać zanik wkładu OZE (scenariusz „z OZE" vs „bez OZE"). Kod AS-IS: brak jawnego scenariusza dual (z/bez OZE) w `short_circuit_iec60909.py` — GAP do opisania w SPEC_10 i SPEC_12. |
| 23 | White Box Protection: deterministyczny łańcuch przyczynowy zadziałania | **BINDING** | WhiteBox + Protection | `SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md`, `SPEC_09_WHITE_BOX.md`, `SPEC_12_PROTECTION.md` | Każde zadziałanie zabezpieczenia MUSI być odtwarzalne jako deterministyczny łańcuch: ENM → scenariusz → wartości obliczone → funkcja → nastawa → porównanie → decyzja → aparat → skutek. Zakaz heurystyk i „automatycznych trip". Kod AS-IS: `ProtectionTrace` (`domain/protection_analysis.py`) z `ProtectionTraceStep` — implementuje łańcuch, ale NIE posiada pola `event_class` ∈ {TECHNOLOGICAL, NETWORK}. Frontend AS-IS: `TracePanel.tsx` wyświetla trace. GAP: brak rozróżnienia klasy zdarzenia i raportu „kto zadziałał pierwszy". |
| 24 | UI zabezpieczeń: projekcja ENM + Analysis, nie osobny model, tryb standardowy/ekspercki | **BINDING** | Presentation + Application | `SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md`, `SPEC_14_TREE_AND_SLD.md` | UI zabezpieczeń jest projekcją modelu ENM i wyników `ProtectionEvaluation` — NIE osobnym modelem danych. Tryb standardowy: edycja WYŁĄCZNIE zabezpieczeń sieciowych, walidacja selektywności, zabezpieczenia technologiczne niewidoczne. Tryb ekspercki: podgląd zabezpieczeń technologicznych (read-only), jawne oznaczenie „brak koordynacji". Zakaz edycji nastaw technologicznych w jakimkolwiek trybie. Kod AS-IS: `ProtectionSettingsEditor.tsx`, `TccChart.tsx`, `ProtectionCoordinationPage.tsx` — implementują edytor i wykresy, ale BEZ rozróżnienia trybu standardowy/ekspercki i BEZ klasyfikacji Technological/Network. |
| 25 | ProtectionDevice: byt logiczny ENM, kontener funkcji zabezpieczeniowych, domena ZAMKNIĘTA | **BINDING** | ENM Logical + Protection | `SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md`, `SPEC_12_PROTECTION.md` | `ProtectionDevice` jest bytem logicznym ENM (jak Bay, Substation) — NIE bytem obliczeniowym (NIE należy do zamkniętej listy 10 z §2.3). Przypisany do elementu ENM (Branch/Transformer/Bus) przez `location_element_id`. Kontener funkcji: jedno urządzenie = jedna klasa (Technological LUB Network, zakaz mieszania). `EnergyNetworkModel` root NIE zawiera `protection_devices` (AS-IS) — przechowywane w warstwie domenowej `domain/protection_device.py`. Punkt integracji: `Bay.protection_ref`. Solver mocy NIE widzi ProtectionDevice. Typy: RELAY, FUSE, RECLOSER, CIRCUIT_BREAKER. **ZAMKNIĘCIE DOMENY:** Sekcje §2.15–§2.21 Rozdziału 2 definiują kompletny kanon architektoniczny zabezpieczeń. Dalsze modyfikacje wymagają ADR. |
| 26 | Topologia sieci: dozwolone i zakazane połączenia, reguła poziomu napięcia | **BINDING** | ENM Core + Topology | `SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md`, `SPEC_07_VALIDATION.md` | Topologia sieci definiowana WYŁĄCZNIE przez byty ENM i ich połączenia elektryczne. Pojęcia organizacyjne (Substation, Bay, Corridor) NIE MAJĄ znaczenia obliczeniowego. Branch łączy Bus↔Bus (przez `from_bus_ref`/`to_bus_ref`), Transformer łączy Bus nn↔Bus SN (`hv_bus_ref`/`lv_bus_ref`). Jedynym elementem łączącym Bus o RÓŻNYCH napięciach jest Transformer. 10 reguł zakazanych połączeń (E-T01…E-T10). Kod AS-IS: `BranchBase.from_bus_ref/to_bus_ref`, `Transformer.hv_bus_ref/lv_bus_ref`, `E003` (connectivity) — poprawne. GAP: brak walidacji E-T01 (generator na SN), E-T08 (coupler różne U_n). |
| 27 | Sekcjonowanie szyn SN: każda sekcja = Bus SN, sprzęgło = SwitchBranch(bus_coupler) | **BINDING** | ENM Core + Topology | `SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md` | Każda sekcja szyny SN MUSI być modelowana jako osobny Bus SN z własnym `voltage_kv`. Sprzęgło sekcyjne = `SwitchBranch(type="bus_coupler")` łączący dwa Bus SN o tym samym napięciu. Stan couplera (open/closed) wpływa bezpośrednio na topologię obliczeniową (wyspy). Kod AS-IS: `SwitchBranch.type="bus_coupler"` zaimplementowany w `enm/models.py`, mapowany na `Switch(LOAD_SWITCH)` w `mapping.py` — poprawne. System obsługuje N sekcji. |
| 28 | Układ master–oddział: stacja oddziałowa bez Source, zasilanie liniowe SN | **BINDING** | ENM Core + Topology + Wizard | `SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md`, `SPEC_13_WIZARD.md` | Stacja zasilana liniowo (oddział) NIE MOŻE posiadać Source. Bus SN master ≠ Bus SN oddział — niezależne węzły obliczeniowe. Każdy Bus posiada własne `voltage_kv`, brak „dziedziczenia". Oddział MOŻE posiadać lokalne sekcjonowanie i transformatory SN/nn. Oddział MOŻE być elementem ringu SN (NO point = Branch/SwitchBranch z status="open", `Corridor.no_point_ref`). Kod AS-IS: `Corridor(corridor_type="ring", no_point_ref=...)`, `Bay(bay_role="IN")`, `Substation(entry_point_ref=...)` — częściowe wsparcie. GAP: brak walidacji E-T09 (oddział z Source). **ZAMKNIĘCIE DOMENY:** Rozdział 3 definiuje kompletny kanon topologii. Dalsze modyfikacje wymagają ADR. |
| 29 | Linia/kabel SN: dyskryminacja technologiczna, schemat π, katalog typów, resolver | **BINDING** | ENM Core + Catalog + Solver | `SPEC_CHAPTER_04_LINES_CABLES_SN.md`, `SPEC_02_ENM_CORE.md` | `OverheadLine` (type="line_overhead") i `Cable` (type="cable") są bytami obliczeniowymi ENM w dyskryminowanej unii Branch. Różnica: Cable posiada pole `insulation` (XLPE/PVC/PAPER) i dominującą pojemność. Schemat zastępczy π: Z=(R+jX)·L, Y_sh=jB·L, Y_sh/end=Y_sh/2. Katalog: `LineType` (14+ typów: AL, AL_ST, 25-150mm²) i `CableType` (90+ typów: XLPE/EPR, Cu/Al, 1c/3c, 70-400mm²) jako frozen dataclasses. Dane cieplne: `jth_1s_a_per_mm2 × cross_section_mm2 = Ith(1s)`. Resolver `resolve_line_params()` z 3-poziomową precedencją: `impedance_override > type_ref > instance`. `ParameterSource` (OVERRIDE, TYPE_REF, INSTANCE) identyfikuje źródło parametru. Mapowanie: `OverheadLine`→`LineBranch(LINE)`, `Cable`→`LineBranch(CABLE)`, konwersja `b_siemens_per_km × 1e6 → b_us_per_km`. Kod AS-IS: `enm/models.py:106-128`, `catalog/types.py:33-313`, `catalog/resolver.py:136-217`, `core/branch.py:212-470`, `enm/mapping.py:104-127` — kompletne. |
| 30 | Magistrale wielosegmentowe: każdy segment = osobny Branch, brak bytu „Feeder" | **BINDING** | ENM Core + Topology | `SPEC_CHAPTER_04_LINES_CABLES_SN.md`, `SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md` | Magistrala SN złożona z wielu odcinków linii/kabli jest modelowana jako sekwencja osobnych Branch ENM połączonych przez Bus SN lub Junction. System NIE posiada bytu „Feeder" ani „Multi-segment Line". Segmenty MOGĄ mieć różne typy katalogowe (linia/kabel, różne przekroje) i różne długości. Solver widzi każdy segment jako osobny element macierzy Y-bus. `Corridor.ordered_segment_refs` agreguje segmenty w warstwie SLD/meta — NIE w solverze. Impedancja feedera = suma impedancji segmentów (addytywna). Obciążalność = minimum po segmentach. Mieszane magistrale (linia + kabel) są dozwolone i powszechne w praktyce OSD. Kod AS-IS: `Corridor` (`enm/models.py:266`), `mapping.py` mapuje każdy segment osobno — poprawne. |
| 31 | Ring SN: Bus + Branch + SwitchBranch(open), brak bytu „Ring", punkt NO | **BINDING** | ENM Core + Topology + Solver | `SPEC_CHAPTER_04_LINES_CABLES_SN.md`, `SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md` | Ring SN jest modelowany WYŁĄCZNIE przez kombinację Bus, Branch i SwitchBranch/Branch z `status="open"` (punkt NO). System NIE posiada bytu „Ring" ani „Loop". Punkt NO = element z `status="open"` → `in_service=False` → wykluczony z macierzy Y-bus. `Corridor.no_point_ref` wskazuje element NO (warstwa meta). Ring otwarty = dwa radialne feedery. Ring zamknięty (all closed) = zamknięta pętla — solver Newton-Raphson oblicza naturalny podział obciążeń. Przełączenie punktu NO invaliduje wszystkie wyniki (Case immutability). Kod AS-IS: `SwitchBranch.status`, `Corridor.no_point_ref`, `mapping.py` (in_service z status) — poprawne. Decyzja spójna z #28 (master–oddział + ring). Punkt NO MUSI być SwitchBranch — nie Branch (kontrakt architektoniczny, §4.19.2). |
| 32 | Relacja Branch ↔ Bay: obowiązkowy kontrakt logiczny, Bay jako kontener zabezpieczeń liniowych | **BINDING** | ENM Meta + Protection | `SPEC_CHAPTER_04_LINES_CABLES_SN.md` (§4.15, §4.16), `SPEC_03_ENM_META.md` | Każda instancja OverheadLine/Cable MUSI być referencjonowana w `equipment_refs` dokładnie jednego Bay (`bay_role ∈ {OUT, FEEDER}`). Relacja 1:1 (jeden Branch w jednym Bay). Bay jest obowiązkowym kontenerem logicznym: aparaty, CT/VT, ProtectionDevice. Kierunek relacji: Bay → Branch (przez `equipment_refs`), NIE Branch → Bay (brak `bay_ref` na BranchBase). Solver NIE widzi Bay. Zabezpieczenia liniowe są przypisywane do Bay (Bay.protection_ref), nie do Branch. White Box MUSI raportować: Bay (zadziałanie), Branch (obiekt chroniony), ProtectionDevice (nastawy). Kod AS-IS: `Bay.equipment_refs: list[str] = []` istnieje ale **brak walidacji** — `equipment_refs` nigdy nie jest walidowane w `validator.py`. `BranchBase` NIE posiada `bay_ref`. `ProtectionDevice.location_element_id` referencjonuje Branch bezpośrednio (niezależnie od Bay). `Bay.protection_ref` jest tylko flagą readiness. GAP: pełny kontrakt Bay→Branch→Protection jest TO-BE. |
| 33 | Walidacja zgodności napięć typu katalogowego z napięciem szyny (TO-BE) | **BINDING** | Validation + Catalog | `SPEC_CHAPTER_04_LINES_CABLES_SN.md` (§4.17) | System MUSI weryfikować `LineType.voltage_rating_kv` / `CableType.voltage_rating_kv` vs `Bus.voltage_kv` (szyna from_bus). Niezgodność = WARNING (IMPORTANT), NIE BLOCKER. Uzasadnienie: tolerancje OSD (kabel 20 kV na szynie 15 kV dopuszczalny). Niezgodność odnotowywana w White Box jako założenie graniczne. Walidacja wymaga rozwiązania `catalog_ref` → typ. Brak `catalog_ref` → walidacja pominięta. Kod AS-IS: **brak walidacji** — nie istnieje reguła porównująca `voltage_rating_kv` z `voltage_kv`. TO-BE: walidacje W-L04 (linie), W-L05 (kable). |
| 34 | Kreator (Wizard) jako jedyna kanoniczna ścieżka modelowania | **BINDING** | Application + ENM | `SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md` (§5.3) | Kreator jest **prowadzącym mechanizmem modelowania** — sekwencyjnym kontrolerem edycji ENM. Jest jedyną dozwoloną ścieżką tworzenia kompletnego modelu sieci (pierwsza sesja). Frontend definiuje 10 kroków K1–K10 (`WizardPage.tsx`): K1 parametry, K2 punkt zasilania, K3 szyny, K4 gałęzie, K5 transformatory, K6 odbiory/generacja, K7 uziemienia/Z₀, K8 walidacja, K9 SLD, K10 uruchomienie analiz. Backend jest **action-based** (`wizard_runtime/service.py`, `wizard_actions/service.py`): sesja (OPEN→COMMITTED/ABORTED), atomowe akcje (`create_node`, `create_branch`, `set_in_service`), snapshot, `ResultInvalidator`. Backend NIE definiuje kroków — jest action-based. Frontend mapuje sekwencję wizualną na akcje. Maszyna stanów (`wizardStateMachine.ts`): `computeWizardState(enm)` jest pure function (deterministic). Stany kroków: `empty\|partial\|complete\|error`. Stany globalne: `empty\|incomplete\|ready\|blocked`. SLD jest wyłącznie wizualizacją ENM (bijekcja 1:1). Kreator NIE jest drzewem ENM — drzewo umożliwia pełną edycję po zakończeniu kreatora. Kod AS-IS: `WizardPage.tsx`, `wizardStateMachine.ts`, `wizard_runtime/session.py`, `wizard_runtime/service.py`, `wizard_actions/service.py`, `action_envelope.py` — kompletne. |
| 35 | Katalog typów jako jedyne źródło parametrów znamionowych, 9 klas frozen, READ-ONLY | **BINDING** | Catalog + ENM Core | `SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md` (§5.4) | Katalog typów (`catalog/types.py`) zawiera 9 klas frozen dataclasses: `LineType`, `CableType`, `TransformerType`, `SwitchEquipmentType`, `ConverterType`, `InverterType`, `ProtectionDeviceType`, `ProtectionCurve`, `ProtectionSettingTemplate`. `CatalogRepository` (`catalog/repository.py`) przechowuje 9 typowych słowników z metodami `get_*/list_*`. Factory `get_default_mv_catalog()` dostarcza wbudowany katalog MV (kable XLPE/EPR, linie Al/Al-St, transformatory, aparaty, przetwornice). Parametry katalogowe są **READ-ONLY** w trybie standardowym — edycja wymaga trybu EKSPERT (Decyzja #16). `catalog_ref` na elemencie ENM wskazuje wybrany typ. Resolver odczytuje parametry z katalogu (`ParameterSource.TYPE_REF`). Frontend: `TypePicker.tsx` (modal wyboru), `TypeLibraryBrowser.tsx` (przeglądarka, 4 zakładki), API `assign/clear/export/import`. Kod AS-IS: `catalog/types.py` (~800 linii), `catalog/repository.py` (~234 linii), `catalog/mv_cable_line_catalog.py` (~1384 linii), frontend `ui/catalog/` — kompletne. |
| 36 | Stacje jako kontenery czysto logiczne — brak wpływu na obliczenia | **BINDING** | ENM Meta + Solver | `SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md` (§5.7) | Stacja w MV-DESIGN-PRO istnieje na dwóch warstwach: (1) **Substation** (ENM, `enm/models.py:225`) — `station_type ∈ {gpz, mv_lv, switching, customer}`, `bus_refs`, `transformer_refs`, `entry_point_ref`; (2) **Station** (solver, `core/station.py:36`) — `StationType ∈ {GPZ, RPZ, TRAFO, SWITCHING}`, `bus_ids`, `branch_ids`, `switch_ids`. Obie warstwy są **WYŁĄCZNIE logiczne** — NIE wpływają na macierz Y-bus, nie modyfikują impedancji, nie zmieniają topologii obliczeniowej. Odpowiednik benchmark Substation folder. Solver widzi wyłącznie: Bus (węzły), Branch (gałęzie), Switch (łączniki), Transformer (parametry) — NIE widzi Substation, Bay, Corridor, Station. Stacja SN/nn: kanoniczny wzorzec `Bus SN → Bay(IN) → Bus SN stacji → Bay(TR) → Transformer SN/nn → Bus nn → Bay(FEEDER) → Load/Generator`. Stacja oddziałowa: brak Source, zasilanie liniowe, niezależne Bus SN (Decyzja #28). Kod AS-IS: `enm/models.py:225` (Substation), `core/station.py:36` (Station), `mapping.py` (NIE importuje Substation/Bay) — kompletne. |
| 37 | Kreator → zabezpieczenia: wymuszanie konfiguracji w kreatorze (TO-BE) | **BINDING** | Application + Protection | `SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md` (§5.8) | Schemat kanoniczny powiązania zabezpieczeń: `Bay(OUT/FEEDER) → ProtectionDevice → Branch(obiekt chroniony)`. Kreator POWINIEN wymuszać: (1) dobór zabezpieczenia przy tworzeniu pola (Bay OUT/FEEDER), (2) wybór z katalogu `ProtectionDeviceType + ProtectionCurve`, (3) blokadę braku konfiguracji zabezpieczeń lub jawny raport ograniczenia, (4) komplet danych pomiarowych CT/VT. **Stan AS-IS:** Zabezpieczenia konfigurowane **po** kreatorze, w module Protection Coordination (`ui/protection-coordination/`). Kreator NIE wymusza konfiguracji — model bez zabezpieczeń jest dozwolony. `ProtectionDevice.location_element_id` referencjonuje Branch bezpośrednio (niezależnie od Bay). `Bay.protection_ref` = flaga readiness. `Bay.equipment_refs` istnieje ale brak walidacji. **GAP:** Pełny kontrakt Wizard→Bay→Protection→Branch jest TO-BE. Wymaga osobnej decyzji implementacyjnej. |
| 38 | Modele niedozwolone (illegal models) — konsolidacja reguł blokujących | **BINDING** | Validation + Application | `SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md` (§5.10) | System definiuje modele niedozwolone blokowane na dwóch poziomach: (1) **ENMValidator** — 8 BLOCKERów AS-IS: E001 (brak Source), E002 (brak Bus), E003 (graf niespójny), E004 (U≤0), E005 (Z=0), E006 (uk≤0), E007 (hv=lv), E008 (Source bez Sk); (2) **AnalysisAvailability** — brama pre-solver (`SC_3F`, `SC_1F`, `LF`). Konsolidacja systemowa: 9 reguł AS-IS (E001-E008 + bijekcja SLD) + 5 TO-BE (E009 falownik na SN, E010 falownik bez trafo nn/SN, W-BAY-01 Branch bez Bay, W009 odbiór bez pola, W010 override bez audytu). **ZAKAZ** obejścia: solver NIE MOŻE być uruchomiony przy BLOCKER. Walidacja jest **deterministyczna** — ten sam ENM → te same issues. Kreator blokuje przejście przy `error`/`blocked`. **ZAKAZ** wyłączania walidacji, pomijania blockerów, uruchamiania solvera na modelu z E-issues. Kod AS-IS: `validator.py:87-512`, `AnalysisAvailability` — kompletne. TO-BE: E009, E010, W-BAY-01, W009, W010 — nie zaimplementowane. |
| 39 | Zasada nadrzędna katalogów — żaden parametr znamionowy nie jest wpisywany ręcznie | **BINDING** | Catalog + ENM + Application | `SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md` (§5.13) | **Kanon:** Wszystkie parametry znamionowe (impedancje, prądy/napięcia/moce znamionowe, uk%, charakterystyki) pochodzą WYŁĄCZNIE z katalogów typów. Kreator NIE posiada pól do ręcznego wpisu parametrów znamionowych. ENM przechowuje `type_id`, NIE duplikuje danych katalogowych. Resolver odczytuje parametry z katalogu (`ParameterSource.TYPE_REF`). **Wyjątek (BINDING):** Source (sieć zasilająca) — parametry `sk3_mva`, `r_ohm`/`x_ohm` są danymi projektowymi OSD, nie katalogowymi. Source NIE wymaga katalogu typów. Load — parametry `p_mw`, `q_mvar` są danymi bilansowymi, nie konstrukcyjnymi; LoadType jest opcjonalny. **Stan AS-IS:** `catalog_ref` istnieje na OverheadLine, Cable, Transformer, SwitchBranch — pokrycie 4/10 elementów obliczeniowych. Generator, Load, Source, FuseBranch — brak `catalog_ref`. Walidacja I002 (INFO) — TYLKO dla linii/kabli. Kreator NIE blokuje braku typu. **GAP:** Generator.catalog_ref (TO-BE), rozszerzenie I002 na Transformer/Switch (TO-BE), blokada braku typu w kreatorze (TO-BE). |
| 40 | Zakres katalogów — 7 domen obowiązkowych, CT/VT = TO-BE | **BINDING** | Catalog + Protection | `SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md` (§5.14) | System MUSI posiadać katalogi typów w 7 domenach: (1) Linie napowietrzne — `LineType` ✅ AS-IS, (2) Kable — `CableType` ✅ AS-IS, (3) Transformatory — `TransformerType` ✅ AS-IS, (4) Falowniki — `ConverterType`/`InverterType` ✅ AS-IS (typy istnieją, brak `catalog_ref` na Generator — GAP), (5) Aparaty łączeniowe — `SwitchEquipmentType` ✅ AS-IS, (6) Zabezpieczenia — `ProtectionDeviceType`/`ProtectionCurve`/`ProtectionSettingTemplate` ✅ AS-IS, (7) Przekładniki CT/VT — ❌ **BRAK** (TO-BE). CT/VT istnieją WYŁĄCZNIE jako symbole SVG (`ct.svg`, `vt.svg`), brak jakiejkolwiek reprezentacji danych. CT wymagany: ratio, accuracy_class, burden_va, saturation_factor, voltage_rating_kv, thermal_rating. VT wymagany: ratio, accuracy_class, burden_va, voltage_factor. LoadType — opcjonalny (parametry bilansowe, nie konstrukcyjne). Macierz pokrycia: Linie 100%, Kable 100%, Trafo 100%, Aparaty 75%, Falowniki 25%, Zabezpieczenia 50%, CT/VT 0%. |
| 41 | Struktura kanoniczna typu — pola obowiązkowe, zakaz typów niekompletnych | **BINDING** | Catalog | `SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md` (§5.15) | Każdy typ w katalogu MUSI zawierać: `id` (UUID/slug), `name` (producent+model), `manufacturer`. TO-BE: `version` (wersja definicji), `status` (active/retired), `created_at` (ISO 8601). Pola domenowe: LineType/CableType — R′, X′, B′/C′, In, voltage_rating_kv, conductor_material, cross_section_mm2, dane cieplne; TransformerType — Sn, Uhv, Ulv, uk%, Pk, i0%, P0, vector_group, tap_*; ConverterType/InverterType — un_kv, sn_mva, pmax_mw, Q limits; SwitchEquipmentType — kind, Un, In, Ik, Icw, medium; ProtectionDeviceType — vendor, series, In. **ZAKAZ** typów niekompletnych: brak R′/X′ na LineType, brak uk% na TransformerType, brak Un/In na SwitchEquipmentType → niedopuszczalne. Implementacja AS-IS: frozen dataclasses z obowiązkowymi polami (Python wymusza kompletność). Brak walidacji danych wejściowych importu. |
| 42 | Wersjonowanie katalogów — TypeLibraryManifest, status active/retired, migracja | **BINDING** | Catalog + Infrastructure | `SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md` (§5.18) | Wersjonowanie na dwóch poziomach: (1) **Biblioteka** — `TypeLibraryManifest` z `library_id`, `revision`, `vendor`, `series`, `fingerprint` (SHA-256), `created_at` — ✅ AS-IS (P13b); (2) **Indywidualny typ** — pola `version`, `status`, `created_at` — ❌ TO-BE. Typ `status="retired"` NIE jest oferowany przy nowych instancjach, ALE pozostaje dostępny w istniejących projektach. Typy są immutable (frozen) — modyfikacja parametrów = nowy typ z nowym `id`. Import: mode=merge (dodaje) / mode=replace (zastępuje). Usunięcie typu przy istniejących instancjach → `TypeNotFoundError` (BLOCKER). Katalog niezależny od projektu — jeden CatalogRepository współdzielony. Zmiana katalogu invaliduje wyniki WSZYSTKICH projektów. **Stan AS-IS:** TypeLibraryManifest na poziomie biblioteki (P13b), brak indywidualnych wersji/statusów, brak persystencji zmian katalogu (in-memory per sesja). |

### 9.3 Konsekwencje architektoniczne

**Z decyzji #1 i #2 wynika:**
- Specyfikacja ENM (SPEC_02) opisuje WYŁĄCZNIE kontrakt `enm/models.py` (Pydantic v2) i `types/enm.ts` (TypeScript mirror).
- Pola solverowe (`node_type`, `voltage_magnitude_pu`, `active_power_mw`) NIE pojawiają się w specyfikacji ENM.
- Mapowanie ENM→Solver (`enm/mapping.py`) jest opisane w SPEC_00_LAYERING jako kontrakt warstwy.

**Z decyzji #3 wynika:**
- `EnergyNetworkModel.generators` jest osobną listą, a nie częścią `sources`.
- Generator ma osobne warunki brzegowe solvera (PV node) vs Source (SLACK node).

**Z decyzji #8a–8c wynika:**
- Bay i Substation → warstwa ENM Meta (organizacja logiczna).
- Junction → warstwa ENM Core (topologia fizyczna).
- Corridor → warstwa SLD Layout (wizualizacja, routing).
- Solver NIE widzi Bay, Substation, Corridor — widzi tylko Bus, Branch, Transformer, Switch, Source.

**Z decyzji #11 i #12 wynika (źródła OZE — BINDING):**
- Generator energoelektroniczny (falownik) z `gen_type ∈ {pv_inverter, wind_inverter, bess}` jest ZAWSZE elementem niskonapięciowym (nn). Napięcie znamionowe falownika wynika wyłącznie z wybranego typu w katalogu — specyfikacja NIE definiuje sztywnych wartości napięć.
- Bezpośrednie przyłączenie falownika do szyny SN (Bus z `voltage_kv > 1 kV`) jest **NIEDOZWOLONE**.
- Jedyna dopuszczalna topologia fizyczna OZE → SN:
  ```
  N × Generator (falownik, nn)
  │
  Bus nn źródła (napięcie z typu katalogowego falownika)
  │
  Pole źródłowe nn (łączniki + zabezpieczenia)
  │
  Bus nn stacji
  │
  Transformator nn/SN
  │
  Bus SN stacji
  ```
- Bus nn źródła: napięcie determinowane przez typ przyłączonego falownika z katalogu, NIE przez regułę systemową ani decyzję użytkownika.
- Generator **nie zna** poziomu SN — poziom SN osiągany WYŁĄCZNIE przez transformator.
- Każdy element toru jest jawny w ENM — brak domyślnych/ukrytych transformatorów.
- Kreator MUSI wymuszać obecność transformatora nn/SN przy integracji OZE z SN.
- Walidator MUSI blokować uruchomienie solvera przy falowniku na szynie SN.

**Z decyzji #13 wynika (odbiory — BINDING):**
- Load jest przyłączany do konkretnego Bus przez `bus_ref`.
- Każdy odbiór powinien mieć kompletny tor fizyczny (szyna → łącznik/zabezpieczenie → pole odpływowe → odbiór).
- Kreator MUSI prowadzić użytkownika przez kompletne przyłączanie odbioru z polem odpływowym.
- System MUSI weryfikować, czy każdy Load ma pełny tor do źródła zasilania.

**Z decyzji #14 wynika (InverterSource — BINDING):**
- `InverterSource` (solver, `network_model/core/inverter.py`) MUSI być mapowany z ENM `Generator(gen_type=pv_inverter|wind_inverter|bess)`.
- Mapowanie w `enm/mapping.py` MUSI uwzględniać konwersję parametrów: `Generator.p_mw` → `InverterSource.in_rated_a` (przez napięcie szyny nn i konwersję mocy na prąd).
- Solver SC widzi wkład falownikowy TYLKO przez `InverterSource` (ograniczone źródło prądowe `Ik = k_sc · In`), NIE przez P/Q adjustment na węźle.
- Katalogowy `ConverterType` / `InverterType` (`catalog/types.py`) dostarcza parametry: `un_kv`, `sn_mva`, `pmax_mw`, `k_sc`.

**Z decyzji #15 i #18 wynika (katalog typów — BINDING):**
- Katalog typów (`catalog/types.py`) jest **domyślnym i preferowanym źródłem** parametrów znamionowych.
- Resolver (`catalog/resolver.py`) implementuje 3-poziomową precedencję: `impedance_override > type_ref > instance` (AS-IS).
- Każdy element sieciowy ENM POWINIEN posiadać `catalog_ref` referencjonujący typ katalogowy.
- AS-IS: `OverheadLine.catalog_ref`, `Cable.catalog_ref`, `Transformer.catalog_ref` — zaimplementowane.
- TO-BE: `Generator.catalog_ref` → `ConverterType` / `InverterType` — wymagane rozszerzenie.
- Parametry odczytane z katalogu są **tylko do odczytu** w trybie standardowym.
- `ParameterSource` (OVERRIDE, TYPE_REF, INSTANCE) jednoznacznie identyfikuje pochodzenie każdego parametru.

**Z decyzji #16 wynika (tryb EKSPERT — BINDING, TO-BE):**
- System MUSI przewidywać jawny **TRYB EKSPERT**, umożliwiający kontrolowaną edycję wybranych parametrów typu na poziomie instancji.
- Tryb EKSPERT: (1) wyraźnie oznaczony w UI, (2) świadomie aktywowany przez użytkownika, (3) każdy override NIE modyfikuje katalogu — dotyczy wyłącznie danej instancji.
- Override jest zapisywany jako **odstępstwo od danych katalogowych**: `{parameter_name: overridden_value}`.
- ENM MUSI przechowywać per instancja: `type_id`, snapshot parametrów typu, listę override'ów.
- White Box MUSI jednoznacznie wskazywać: które parametry pochodzą z katalogu, a które zostały nadpisane w trybie ekspert.
- Zakaz niejawnych modyfikacji: NIEDOZWOLONE jest automatyczne lub „ciche" zmienianie parametrów typu bez wiedzy użytkownika.

**Z decyzji #21 wynika (klasyfikacja zabezpieczeń — BINDING):**
- `ProtectionFunction` posiada dwie rozłączne klasy: **Technologiczne** i **Sieciowe**.
- Klasa **Technologiczne**: funkcje wbudowane w falownik (LVRT, HVRT, 81U/81O/81R, anti-islanding, ograniczenie prądu), autonomiczne (≤250 ms), NIE podlegają koordynacji selektywnej, modelowane jako warunki brzegowe NC RfG / IRiESD.
- Klasa **Sieciowe**: klasyczne funkcje IEC/benchmark (50, 51, 50N, 51N, 27, 59, 21, 67, 87, 79), nastawiane, selektywne, podlegające koordynacji — to jest wejście solvera zabezpieczeń.
- Solver zabezpieczeń przetwarza WYŁĄCZNIE klasę Sieciowe; klasę Technologiczne traktuje jako warunki brzegowe (czas działania, zachowanie przy zwarciu).
- Każda `ProtectionFunction` MUSI posiadać punkt pomiarowy: miejsce, źródło sygnału (CT/VT/bezpośredni), aparatura sterowana (CB/LS/fuse).
- White Box MUSI rozróżniać typ zdarzenia: `event_type ∈ {TECHNOLOGICAL, NETWORK}`.
- Kod AS-IS (`sanity_checks/rules.py`, `ProtectionFunctionSummary`) NIE posiada klasyfikacji — wszystkie 17 reguł sanity checks traktuje jednorodnie. To jest GAP opisany w SPEC_12 TO-BE.

**Z decyzji #22 wynika (koordynacja falownik ↔ sieć — BINDING):**
- Falownik jest **warunkiem brzegowym** analizy zabezpieczeń SN, NIE uczestnikiem selektywności.
- Projekt nastaw SN MUSI zakładać, że falownik odłączy się pierwszy (≤250 ms) przy przekroczeniu progów NC RfG.
- Solver SC MUSI uwzględniać dwa scenariusze: „z OZE" (przed odłączeniem falownika) i „bez OZE" (po odłączeniu).
- Po odłączeniu falownika prąd zwarciowy w torze maleje — nastawy I>> MUSZĄ zapewniać zadziałanie w OBU scenariuszach.
- Zakaz włączania zabezpieczeń technologicznych do stopniowania Δt, koordynowania LVRT z I> sieciowym, pomijania zaniku wkładu OZE.
- Kod AS-IS: `short_circuit_iec60909.py` nie posiada jawnego scenariusza dual (z/bez OZE) — GAP.

**Z decyzji #23 wynika (White Box Protection — BINDING):**
- Każde zadziałanie zabezpieczenia (TRIP/NO_TRIP) MUSI być odtwarzalne jako deterministyczny łańcuch przyczynowy.
- `ProtectionTrace` MUSI zawierać WSZYSTKIE kroki: od topologii ENM, przez wartości obliczone, po decyzję i aparat.
- White Box MUSI raportować zdarzenia technologiczne i sieciowe OSOBNO, z polem `event_class`.
- W scenariuszach równoczesnych (falownik + sieć reagują na to samo zdarzenie): raport „kto zadziałał pierwszy i dlaczego".
- Zakaz heurystyk, domyślnych trip, ukrywania kroków pośrednich.
- Kod AS-IS: `ProtectionTrace` i `ProtectionTraceStep` (frozen) istnieją, ale bez pola `event_class` — GAP.

**Z decyzji #24 wynika (UI zabezpieczeń — BINDING):**
- UI zabezpieczeń jest projekcją ENM + `ProtectionEvaluation` — NIE osobnym modelem.
- Widok tabelaryczny benchmark-style z kolumnami: Funkcja, ANSI, Nastawa, Czas, TMS, Kierunkowość, Aparat, Miejsce pomiaru, Klasa, Werdykt.
- Tryb standardowy: edycja zabezpieczeń sieciowych, walidacja selektywności, zabezpieczenia technologiczne niewidoczne.
- Tryb ekspercki: podgląd zabezpieczeń technologicznych (read-only), jawne oznaczenie „brak koordynacji".
- Zakaz: edycji nastaw technologicznych, ukrywania miejsca pomiaru, łączenia klas na jednym TCC bez rozróżnienia.
- Kod AS-IS: `ProtectionSettingsEditor.tsx` edytuje stopnie 50/51, `TccChart.tsx` rysuje krzywe TCC — ale bez trybu standardowy/ekspercki i bez klasyfikacji klas — GAP.

**Z decyzji #25 wynika (ProtectionDevice + zamknięcie domeny — BINDING):**
- `ProtectionDevice` jest bytem logicznym ENM — kontenerem funkcji zabezpieczeniowych.
- Przypisany do elementu sieci (Branch/Transformer/Bus) przez `location_element_id`.
- Jedno urządzenie = jedna klasa: Technological LUB Network, zakaz mieszania.
- Typy urządzeń: RELAY (przekaźnik), FUSE (bezpiecznik), RECLOSER (SPZ), CIRCUIT_BREAKER (wyłącznik).
- `ProtectionDevice` NIE jest bytem obliczeniowym — solver mocy go nie widzi, `map_enm_to_network_graph()` go nie przetwarza.
- Punkt integracji z ENM: `Bay.protection_ref` (AS-IS).
- `EnergyNetworkModel` root NIE zawiera listy `protection_devices` — urządzenia w warstwie domenowej.
- White Box MUSI klasyfikować zdarzenia dwuwymiarowo: `event_class` ∈ {TECHNOLOGICAL, NETWORK} × `event_scope` ∈ {LOCAL_DEVICE, NETWORK_SECTION}.
- UI MUSI prezentować kolumnę „Źródło sygnału" (CT/VT/INTERNAL) obok „Miejsca pomiaru".
- **DOMENA PROTECTION W ROZDZIALE 2 JEST ZAMKNIĘTA** — sekcje §2.15–§2.21 definiują kompletny kanon. Dalsze modyfikacje wymagają ADR i wpisu do Macierzy Decyzji.

**Z decyzji #26, #27, #28 wynika (topologia i łączność — BINDING):**
- Topologia definiowana WYŁĄCZNIE przez byty ENM i ich połączenia. Substation, Bay, Corridor NIE mają znaczenia obliczeniowego.
- Branch łączy Bus↔Bus przez `from_bus_ref`/`to_bus_ref`. Transformer łączy Bus nn↔Bus SN przez `hv_bus_ref`/`lv_bus_ref`. Jedynym mostem między poziomami napięć jest Transformer.
- 10 zakazanych połączeń (E-T01…E-T10): generator na SN, Load/Source/Transformer na Junction, Branch→Branch, coupler różne U_n, oddział z Source, sekcja jako Junction.
- Każda sekcja szyny SN = osobny Bus SN. Sprzęgło sekcyjne = `SwitchBranch(bus_coupler)`. Stan couplera wpływa na topologię obliczeniową.
- Stacja oddziałowa: brak Source, zasilanie przez linię SN z master. Bus SN master ≠ Bus SN oddział. Oddział może posiadać lokalne sekcjonowanie i być elementem ringu SN.
- Ring SN: NO point = Branch/SwitchBranch z `status="open"`, `Corridor.no_point_ref`.
- White Box MUSI raportować stan każdego couplera i identyfikację wysp.
- 14 walidacji topologicznych (E-T01…I-T02) niezależnych od walidacji ENM i Protection.
- **DOMENA TOPOLOGII W ROZDZIALE 3 JEST ZAMKNIĘTA.**

**Z decyzji #29, #30, #31 wynika (linie i kable SN — BINDING):**
- `OverheadLine` (type="line_overhead") i `Cable` (type="cable") są bytami obliczeniowymi ENM w dyskryminowanej unii Branch. Jedyna różnica strukturalna: Cable posiada pole `insulation` (XLPE/PVC/PAPER).
- Schemat zastępczy π: Z_total = (R′+jX′)·L, Y_shunt = jB′·L, Y_shunt_per_end = Y_shunt/2. Wszystkie wzory zaimplementowane w `LineBranch` (`core/branch.py`).
- **Katalog typów:** `LineType` (14+ typów bazowych: AL/AL_ST, 25-150mm²) i `CableType` (90+ typów: XLPE/EPR, Cu/Al, 1c/3c, 70-400mm² + typy producenckie NKT/Tele-Fonika). Frozen dataclasses w `catalog/types.py`.
- **Dane cieplne:** `Ith(1s) = jth × A` — gęstość prądu zwarciowego × przekrój. Stałe materiałowe: JTH_CU_XLPE=143, JTH_AL_XLPE=94, JTH_AL_OHL=94, JTH_AL_ST_OHL=88 A/mm².
- **Resolver:** `resolve_line_params()` z 3-poziomową precedencją `impedance_override > type_ref > instance`. `ParameterSource` identyfikuje źródło. `resolve_thermal_params()` dostarcza dane cieplne dla analizy zabezpieczeń.
- **Mapowanie:** `OverheadLine`→`LineBranch(LINE)`, `Cable`→`LineBranch(CABLE)`. Konwersja: `b_siemens_per_km × 1e6 → b_us_per_km`. Deterministyczne sortowanie po `ref_id`.
- **Magistrale wielosegmentowe:** każdy segment = osobny Branch. Brak bytu „Feeder". Segmenty mogą mieć różne typy i długości. `Corridor.ordered_segment_refs` = warstwa meta/SLD.
- **Ringi SN:** modelowane przez Bus + Branch + SwitchBranch(open). Brak bytu „Ring". Punkt NO = `status="open"` → wykluczone z macierzy Y-bus. `Corridor.no_point_ref` = warstwa meta.
- **Walidacje:** E005 (impedancja zerowa), E003 (connectivity), W001 (brak Z₀), I002 (brak catalog_ref), `LineBranch.validate()` (length>0, R/X≥0, finite).
- **SLD:** linia = solid stroke, kabel = dashed (8,4), kolory benchmark-style.
- **DOMENA LINII I KABLI SN W ROZDZIALE 4 JEST ZAMKNIĘTA (v1.0).**

**Z decyzji #32 wynika (Branch ↔ Bay — BINDING, TO-BE):**
- Każdy Branch typu linia/kabel MUSI być referencjonowany w `equipment_refs` dokładnie jednego Bay (relacja 1:1).
- Kierunek relacji: Bay → Branch (NIE Branch → Bay). `BranchBase` NIE otrzymuje `bay_ref`.
- Bay jest obowiązkowym kontenerem: aparaty łączeniowe, przekładniki CT/VT, ProtectionDevice.
- Zabezpieczenia liniowe przypisywane do Bay (`protection_ref`), nie do Branch.
- White Box raportuje pełny łańcuch: Bay (zadziałanie) → Branch (obiekt chroniony) → ProtectionDevice (nastawy).
- Stan AS-IS: `equipment_refs` istnieje ale brak walidacji, `ProtectionDevice.location_element_id` omija Bay.
- GAP: pełny kontrakt Bay→Branch→Protection wymaga implementacji.

**Z decyzji #33 wynika (walidacja napięć typu — BINDING, TO-BE):**
- System MUSI weryfikować `voltage_rating_kv` typu katalogowego vs `voltage_kv` szyny.
- Niezgodność = WARNING (IMPORTANT), NIE BLOCKER (tolerancje OSD).
- Walidacja wymaga rozwiązania `catalog_ref` → typ (użycie resolwera).
- Brak `catalog_ref` → walidacja pominięta.
- White Box odnotowuje niezgodność jako założenie graniczne.
- **DOMENA LINII I KABLI SN W ROZDZIALE 4 JEST ZAMKNIĘTA (v1.1 SUPPLEMENT).**

**Z decyzji #34 wynika (kreator jako ścieżka kanoniczna — BINDING):**
- Kreator jest **jedyną dozwoloną ścieżką** tworzenia kompletnego modelu sieci (pierwsza sesja).
- Frontend: 10 kroków K1–K10 (`WizardPage.tsx`), backend: action-based (`wizard_runtime/`).
- Architektura: frontend definiuje sekwencję wizualną, backend przetwarza atomowe akcje (create_node, create_branch, set_in_service).
- Sesja kreatora: OPEN → akcje → commit → snapshot (uuid5, deterministyczny) lub abort → reset.
- `ResultInvalidator` po commicie oznacza WSZYSTKIE wyniki projektu jako OUTDATED.
- Maszyna stanów (`computeWizardState(enm)`) jest pure function — ten sam ENM = ten sam stan kreatora.
- SLD jest wyłącznie wizualizacją ENM (bijekcja 1:1). Kreator NIE jest drzewem ENM.
- 7 zakazów kreatora (§5.3.7): falownik na SN, linia bez length, Branch bez Bay, odbiór bez pola, cichy override, pominięcie etapów, trafo hv=lv.

**Z decyzji #35 wynika (katalog typów — jedyne źródło nominałów — BINDING):**
- 9 klas frozen dataclasses w `catalog/types.py`: LineType, CableType, TransformerType, SwitchEquipmentType, ConverterType, InverterType, ProtectionDeviceType, ProtectionCurve, ProtectionSettingTemplate.
- `CatalogRepository` (frozen) z 9 słownikami typów, metodami `get_*/list_*`, factory `get_default_mv_catalog()`.
- Parametry katalogowe są **READ-ONLY** w trybie standardowym. Edycja wymaga trybu EKSPERT (Decyzja #16).
- Frontend: `TypePicker` (modal wyboru), `TypeLibraryBrowser` (4 zakładki), API `assign/clear/export/import`.
- `catalog_ref` na elemencie ENM wskazuje wybrany typ. Resolver odczytuje parametry (`ParameterSource.TYPE_REF`).
- Wbudowany katalog MV: kable XLPE/EPR (Cu/Al, 1c/3c, 70–400mm²) + NKT + Tele-Fonika, linie Al/Al-St (25–150mm²), transformatory mocy i rozdzielcze, aparaty łączeniowe, przetwornice PV/WIND/BESS.

**Z decyzji #36 wynika (stacje — kontenery logiczne — BINDING):**
- Substation (ENM) i Station (solver) są **WYŁĄCZNIE logiczne** — NIE wpływają na obliczenia.
- Solver widzi: Bus, Branch, Switch, Transformer. NIE widzi: Substation, Bay, Corridor, Station.
- `mapping.py` NIE importuje Substation/Bay — jawne potwierdzenie braku wpływu na solver.
- Stacja SN/nn: wzorzec `Bus SN → Bay(IN) → Bus SN stacji → Bay(TR) → Trafo SN/nn → Bus nn → Bay(FEEDER) → Load/Generator`.
- Stacja oddziałowa: brak Source, zasilanie liniowe, niezależne Bus SN (Decyzja #28).
- Typy stacji ENM: `gpz`, `mv_lv`, `switching`, `customer`. Typy solver: `GPZ`, `RPZ`, `TRAFO`, `SWITCHING`.

**Z decyzji #37 wynika (kreator → zabezpieczenia — BINDING, TO-BE):**
- Schemat kanoniczny: `Bay(OUT/FEEDER) → ProtectionDevice → Branch(obiekt chroniony)`.
- Kreator POWINIEN wymuszać dobór zabezpieczenia przy tworzeniu pola liniowego.
- Stan AS-IS: zabezpieczenia konfigurowane **po** kreatorze, w module Protection Coordination. Model bez zabezpieczeń jest dozwolony.
- GAP: `ProtectionDevice.location_element_id` omija Bay (bezpośrednia referencja do Branch). `Bay.equipment_refs` brak walidacji.
- Pełny kontrakt Wizard→Bay→Protection→Branch wymaga osobnej decyzji implementacyjnej.

**Z decyzji #38 wynika (modele niedozwolone — BINDING):**
- 8 BLOCKERów AS-IS (E001-E008) w `validator.py` — brama pre-solver.
- `AnalysisAvailability`: `SC_3F` = True jeśli brak blockerów, `SC_1F` wymaga Z₀, `LF` wymaga Load/Generator.
- Konsolidacja: 9 reguł AS-IS (E001-E008 + bijekcja SLD) + 5 TO-BE (E009, E010, W-BAY-01, W009, W010).
- **ZAKAZ** obejścia walidacji, pomijania blockerów, uruchamiania solvera na modelu z E-issues.
- Walidacja jest **deterministyczna** — ten sam ENM → te same issues.
- **DOMENA KONTRAKTÓW KANONICZNYCH SYSTEMU W ROZDZIALE 5 JEST ZAMKNIĘTA.**

**Z decyzji #17 wynika (falowniki równoległe — BINDING, TO-BE):**
- Kreator MUSI umożliwiać podanie **liczby identycznych falowników pracujących równolegle** przy dodawaniu źródła OZE.
- Podejście implementacyjne (do decyzji): albo (A) kreator tworzy N osobnych instancji Generator w ENM, albo (B) Generator posiada pole `n_parallel` z rozwinięciem przy mapowaniu na solver.
- Solver SC MUSI uwzględniać sumaryczny wkład wszystkich falowników równoległych: `Ik_total = N × k_sc × In_rated`.
- White Box MUSI odtwarzać: typ katalogowy → ilość → parametry per instancja → wkład sumaryczny.

**Z decyzji #39 wynika (żaden parametr znamionowy nie jest wpisywany ręcznie — BINDING):**
- Katalog typów jest **jedynym źródłem** parametrów znamionowych dla elementów sieciowych.
- Kreator NIE posiada pól do ręcznego wpisu parametrów znamionowych (R′, X′, In, uk%, itd.).
- ENM przechowuje `type_id` (referencję), NIE duplikuje danych katalogowych.
- Resolver odczytuje parametry z katalogu (`ParameterSource.TYPE_REF`).
- **Wyjątek:** Source (sieć zasilająca) — parametry projektowe OSD, nie katalogowe. Load — parametry bilansowe, LoadType opcjonalny.
- Stan AS-IS: `catalog_ref` na 4/10 elementów obliczeniowych (Branch, Transformer). Generator, Load, Source, FuseBranch — brak.
- GAP: Generator.catalog_ref, rozszerzenie I002, blokada braku typu w kreatorze — TO-BE.

**Z decyzji #40 wynika (7 domen katalogowych — BINDING):**
- 7 domen obowiązkowych: linie, kable, transformatory, falowniki, aparaty, zabezpieczenia, **przekładniki CT/VT** (TO-BE).
- CT/VT: ❌ brak (tylko symbole SVG). Wymagane: ratio, accuracy_class, burden_va, saturation_factor, voltage_rating_kv.
- Macierz pokrycia: Linie/Kable/Trafo = 100%, Aparaty = 75%, Falowniki = 25%, Zabezpieczenia = 50%, CT/VT = 0%.
- LoadType = opcjonalny (parametry bilansowe, nie konstrukcyjne).

**Z decyzji #41 wynika (struktura kanoniczna typu — BINDING):**
- Pola obowiązkowe: `id`, `name`, `manufacturer`. TO-BE: `version`, `status` (active/retired), `created_at`.
- ZAKAZ typów niekompletnych: brak pól krytycznych = niedopuszczalne.
- AS-IS: frozen dataclasses wymuszają kompletność pól przy konstrukcji; brak walidacji danych importu.

**Z decyzji #42 wynika (wersjonowanie katalogów — BINDING):**
- Dwa poziomy: biblioteka (`TypeLibraryManifest` AS-IS) + indywidualny typ (version/status TO-BE).
- Typ `retired` = nie oferowany w nowych instancjach, ale dostępny w istniejących projektach.
- Typy immutable — modyfikacja = nowy typ z nowym `id`.
- Import: merge (dodaje) / replace (zastępuje). Usunięcie przy instancjach → `TypeNotFoundError`.
- Katalog niezależny od projektu — zmiana invaliduje WSZYSTKIE projekty.
- **DOMENA KATALOGÓW TYPÓW W ROZDZIALE 5 JEST ZAMKNIĘTA (v1.1 SUPPLEMENT).**

| 43 | Składowe zerowe (Z₀) ignorowane przez solver — brak macierzy Y₀/Z₀ | **BINDING** | Solver + Mapping | `SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md` (§6.11.3) | Parametry zerowe (`r0_ohm_per_km`, `x0_ohm_per_km`, `b0_siemens_per_km`) są mapowane z ENM do NetworkGraph (AS-IS), ale solver składowej dodatniej ich NIE wykorzystuje. Macierz Y-bus budowana WYŁĄCZNIE dla składowej symetrycznej dodatniej. Solver zwarć asymetrycznych (1F, 2F+G) wymaga osobnych macierzy Y₁, Y₂, Y₀ — to jest GAP architektoniczny. Kod AS-IS: `enm/mapping.py` mapuje r0/x0/b0, ale `ybus.py` i `short_circuit_iec60909.py` ich nie przetwarzają. Status: TO-BE — wymaga implementacji `AdmittanceMatrixBuilder` dla składowej zerowej i ujemnej. |
| 44 | Gałąź magnesująca transformatora pominięta w Y-bus | **BINDING** | Solver | `SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md` (§6.11.4) | `TransformerBranch` posiada pola `i0_percent` i `p0_kw` (prąd jałowy, straty żelaza), ale `AdmittanceMatrixBuilder` NIE buduje gałęzi magnesującej (Y_m = G_Fe + jB_μ). Model AS-IS: wyłącznie impedancja zwarcia (R_T + jX_T). Konsekwencja: straty jałowe transformatora NIE są uwzględniane w PF. Wpływ na SC: pomijalny (impedancja magnesowania >> impedancja zwarcia). Status: TO-BE — pełny model T/π transformatora z Y_m. |
| 45 | Kontrakt mapowania ENM→NetworkGraph niezdefiniowany w specyfikacji | **BINDING** | Architecture + Mapping | `SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md` (§6.4) | Funkcja `map_enm_to_network_graph()` w `enm/mapping.py` jest kluczowym komponentem architektury — produkuje model obliczeniowy z modelu domenowego. SYSTEM_SPEC.md v3.0 nie wspomina o niej. Kontrakt: pure function, deterministyczna (sortowanie po ref_id, UUID5), jednokierunkowa (ENM → Solver, nigdy odwrotnie). Reguły mapowania per element (Bus→Node, Branch→LineBranch, Source→Virtual Node+impedance, Load/Generator→P/Q accumulation) są BINDING i opisane w §6.4.2. Kod AS-IS: `mapping.py` (~200 linii) — kompletny. |
| 46 | Frozen Result API — pełny kontrakt ShortCircuitResult (21 pól) vs 4 w spec | **BINDING** | Results API | `SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md` (§6.6.2) | Rozszerzenie Decyzji #4. SYSTEM_SPEC §5.4 opisuje 4 pola (`ikss_ka, ip_ka, ith_ka, white_box_trace`). Kod implementuje 21 pól kanonicznych (`EXPECTED_SHORT_CIRCUIT_RESULT_KEYS`): metadata zwarcia (type, node, c, Un, Zkk, R/X, κ, tk, tb), prądy (ikss_a, ip_a, ith_a, ib_a), moc (sk_mva), analiza wkładów (ik_thevenin_a, ik_inverters_a, ik_total_a), traceability (contributions, branch_contributions, white_box_trace). Jednostki: A (nie kA!). Aliasy wsteczne: ik_a→ikss_a, ip→ip_a, ith→ith_a, ib→ib_a, sk→sk_mva. Kontrakt pełny AS-IS opisany w §6.6.2. |
| 47 | Frozen Result API — pełny kontrakt PowerFlowNewtonSolution (30+ pól) vs 4 w spec | **BINDING** | Results API | `SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md` (§6.6.6) | Rozszerzenie Decyzji #5. SYSTEM_SPEC §5.4 opisuje 4 pola (`bus_voltages, branch_flows, losses, white_box_trace`). Kod implementuje 30+ pól: status zbieżności (converged, iterations, max_mismatch), napięcia węzłowe (4 formaty: complex pu, |U| pu, θ rad, kV), przepływy gałęziowe (6 formatów: pu/MVA/kA × from/to), bilans systemowy (losses, slack_power, sum_pq), diagnostyka (warnings, errors, slack_island, not_solved), White Box (ybus_trace, nr_trace, taps, shunts, pv_to_pq, init_state), metadata (solver_method, fallback_info). Kontrakt pełny AS-IS opisany w §6.6.6. |
| 48 | Y-bus Builder — węzeł SLACK modelowany dużą admitancją uziemienia | **BINDING** | Solver | `SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md` (§6.5.4) | `AdmittanceMatrixBuilder` (`ybus.py`) dodaje do elementu diagonalnego węzła SLACK dużą admitancję uziemienia (Y_ground ≈ 10⁶ pu) jako referencję napięciową. To zapewnia numeryczną stabilność inwersji Y→Z. Transformatory: brak gałęzi magnesującej w Y-bus (Decyzja #44). Linie/kable: schemat π z Y_shunt/2 na obu końcach. Łączniki zamknięte: Union-Find scalanie węzłów (zerowa impedancja, nie element macierzy). InverterSource: brak w Y-bus (model prądowy addytywny). Kod AS-IS: `ybus.py` — kompletny. |

**Z decyzji #43, #44 wynika (składowe zerowe i gałąź magnesująca — BINDING, TO-BE):**
- Solver AS-IS operuje WYŁĄCZNIE na składowej symetrycznej dodatniej (Y₁, Z₁).
- Parametry zerowe (r0, x0, b0) są mapowane z ENM ale NIE przetwarzane przez solver.
- Solver zwarć asymetrycznych (1F, 2F+G) wymaga osobnych macierzy Y₁, Y₂, Y₀ — TO-BE.
- Gałąź magnesująca transformatora (i0%, P0) jest pominięta w Y-bus — TO-BE.
- Wpływ na SC: pomijalny (Z_magnetizing >> Z_shortcircuit).
- Wpływ na PF: straty jałowe nie uwzględniane — wpływ na dokładność bilansu.

**Z decyzji #45 wynika (kontrakt mapowania — BINDING):**
- `map_enm_to_network_graph()` jest **pure function** — brak efektów ubocznych, brak mutacji ENM.
- Mapowanie jest **deterministyczne** — sortowanie po `ref_id`, UUID5 dla identyfikatorów solverowych.
- Source → Virtual Ground Node + LineBranch z impedancją obliczoną z `sk3_mva`/`rx_ratio` lub `r_ohm`/`x_ohm`.
- Load → P/Q accumulation (ujemny znak) na Node. Generator → P/Q accumulation (dodatni znak) na Node.
- Substation, Bay, Corridor, Junction → POMIJANE (brak wpływu na obliczenia).
- Bus z przyłączonym Source → NodeType.SLACK (v_mag=1.0 pu, θ=0.0 rad).

**Z decyzji #46, #47 wynika (pełne Frozen API — BINDING):**
- ShortCircuitResult: 21 pól kanonicznych, jednostki w A (nie kA), aliasy wstecznej kompatybilności.
- PowerFlowNewtonSolution: 30+ pól, 4 formaty napięć, 6 formatów przepływów, pełna diagnostyka.
- `EXPECTED_SHORT_CIRCUIT_RESULT_KEYS` — gwarantowany zbiór kluczy w `to_dict()`.
- Serializacja: `complex` → `{"re", "im"}`, `Enum` → string, `numpy` → Python native.
- Zmiana wymaga major version bump.

**Z decyzji #48 wynika (Y-bus — BINDING):**
- S_base = 100 MVA, V_base = voltage_level [kV], Z_base = V²/S.
- Zamknięte łączniki → Union-Find → scalanie węzłów → zredukowany wymiar macierzy.
- SLACK: duża admitancja uziemienia (Y ≈ 10⁶ pu) jako referencja napięciowa.
- InverterSource: model prądowy (k_sc × In) — BEZ impedancji w Y-bus.
- **DOMENA KONTRAKTÓW SOLVERÓW I MAPOWANIA W ROZDZIALE 6 JEST ZAMKNIĘTA (v1.0).**

| 49 | Source — kontrakt 13 pól, algorytm impedancji, mapowanie Virtual GND + Z_source | **BINDING** | ENM + Mapping | `SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md` (§7.2) | Source (`enm/models.py:180–192`) posiada 13 pól: bus_ref, model (thevenin/short_circuit_power/external_grid), sk3_mva, ik3_ka, r_ohm, x_ohm, rx_ratio, r0_ohm, x0_ohm, z0_z1_ratio, c_max, c_min. Mapper (`mapping.py:191–248`) oblicza impedancję: jeśli r_ohm/x_ohm podane → użyj bezpośrednio; jeśli sk3_mva > 0 → Z=Un²/Sk'', X=Z/√(1+rx²), R=X·rx (default rx=0.1). Source produkuje Virtual Ground Node + LineBranch(Z_source). Bus z Source → SLACK (v=1.0, θ=0.0). GAP: ik3_ka walidowane (E008) ale nieużywane przez mapper; c_max/c_min nieużywane (c_factor z opcji solvera); składowe zerowe (r0, x0, z0_z1_ratio) TO-BE. |
| 50 | Generator — kontrakt 5 pól, mapowanie P/Q addytywne, brak rozróżnienia gen_type | **BINDING** | ENM + Mapping | `SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md` (§7.3) | Generator (`enm/models.py:212–217`) posiada 5 pól: bus_ref, p_mw, q_mvar (None→0.0), gen_type (synchronous/pv_inverter/wind_inverter/bess/None), limits (GenLimits: p_min/max, q_min/max). Mapper (`mapping.py:57–59`) traktuje WSZYSTKIE typy generatorów identycznie: P/Q addition na Node (bus_p += p_mw, bus_q += q_mvar or 0.0). gen_type NIE wpływa na algorytm mapowania. GenLimits NIE są egzekwowane przez solver. GAP: Generator → InverterSource mapping TO-BE (Decyzja #14); catalog_ref TO-BE (Decyzja #15); n_parallel TO-BE (Decyzja #17). |
| 51 | Load — kontrakt 4 pola, model ZIP niezaimplementowany, P/Q subtraction | **BINDING** | ENM + Mapping | `SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md` (§7.4) | Load (`enm/models.py:200–204`) posiada 4 pola: bus_ref, p_mw, q_mvar, model (pq/zip, default pq). Mapper (`mapping.py:54–56`) ZAWSZE traktuje Load jako PQ: bus_p -= p_mw, bus_q -= q_mvar. Pole `model` jest IGNOROWANE — model ZIP jest zdefiniowany w Pydantic ale nie obsługiwany przez mapper ani solver. Load NIE wpływa na macierz Y-bus. Load NIE wpływa na obliczenia zwarciowe (IEC 60909 §1.5.2). Brak catalog_ref (LoadType opcjonalny, Decyzja #40). GAP: ZIP nie zaimplementowany; brak walidacji znaku p_mw. |
| 52 | InverterSource — model prądowy SC, reguły per typ zwarcia, addytywny wkład | **BINDING** | Solver | `SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md` (§7.3.8–§7.3.11) | InverterSource (`inverter.py:12–36`) posiada 10 pól (dataclass): id, name, node_id, type_ref, converter_kind, in_rated_a, k_sc (default 1.1), contributes_negative/zero_sequence, in_service. Property ik_sc_a = k_sc × in_rated_a. Solver SC (`short_circuit_iec60909.py:426–458`): 3F→zawsze, 2F→if negative_seq, 1F/2F+G→if zero_seq. Wkład addytywny: Ik_total = Ik_Thevenin + Σ Ik_inv. InverterSource NIGDY w Y-bus (Decyzja #48). Katalogowe typy: ConverterType (13 pól, frozen), InverterType (11 pól, frozen), ConverterKind (PV/WIND/BESS). |
| 53 | Konwencja znaków P/Q: Generator (+), Load (−), Source (SLACK) | **BINDING** | Mapping | `SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md` (§7.1.2) | Mapper (`mapping.py:54–59`) stosuje jednoznaczną konwencję: Load P/Q ODEJMOWANE od węzła (odbiór = ujemne injection), Generator P/Q DODAWANE do węzła (generacja = dodatnie injection). Source NIE wnosi P/Q — SLACK bilansuje niezależnie przez solver. Na jednym Bus może być wiele Load i/lub Generator — akumulacja addytywna. BESS: p_mw może być ujemne (ładowanie = pobór). Bilans: P_node = Σ P_gen − Σ P_load. |

**Z decyzji #49 wynika (Source — BINDING):**
- Source to zastępcze źródło napięciowe Thevenina z impedancją $Z_Q$ obliczaną z $S''_k$ lub z jawnych $R+jX$.
- Mapper produkuje Virtual Ground Node (PQ, P=Q=0) + LineBranch(Z_source, length_km=1.0).
- Bus z Source → NodeType.SLACK (v_mag=1.0 pu, θ=0.0 rad).
- ik3_ka jest walidowane (E008) ale NIE konwertowane na impedancję w mapperze — GAP.
- c_max/c_min NIE SĄ parametrami mappera — c_factor jest parametrem opcji solvera SC.
- Składowe zerowe (r0, x0, z0_z1_ratio): istnieją w ENM ale NIE przetwarzane — TO-BE (Decyzja #43).

**Z decyzji #50 wynika (Generator — BINDING):**
- Generator to osobny byt ENM (Decyzja #3), niezależny od Source i Load.
- Mapper: P/Q addition na Node, identyczne dla WSZYSTKICH gen_type (synchronous, pv_inverter, wind_inverter, bess).
- gen_type NIE wpływa na mapowanie AS-IS — Generator → InverterSource mapping = TO-BE (Decyzja #14).
- GenLimits (p_min/max, q_min/max) istnieją w ENM ale NIE są egzekwowane przez solver PF.
- Brak catalog_ref → brak powiązania z ConverterType/InverterType — TO-BE (Decyzja #15).
- Brak n_parallel → wielokrotne falowniki jako osobne instancje — TO-BE (Decyzja #17).

**Z decyzji #51 wynika (Load — BINDING):**
- Load to odbiór z ujemnym injection P/Q na Node.
- model="zip" jest zdefiniowany ale NIEZAIMPLEMENTOWANY — mapper ignoruje pole model.
- Load NIE wpływa na Y-bus, NIE wpływa na SC (IEC 60909 §1.5.2).
- LoadType jest opcjonalny (Decyzja #40) — parametry bilansowe, nie konstrukcyjne.

**Z decyzji #52 wynika (InverterSource — BINDING):**
- InverterSource to ograniczone źródło prądowe IEC 60909 na poziomie solver layer.
- Wkład: Ik = k_sc × In (default k_sc=1.1).
- Per typ zwarcia: 3F=zawsze, 2F=if negative_seq, 1F/2F+G=if zero_seq.
- NIGDY w Y-bus — wkład addytywny do Ik_Thevenin.
- Dwa typy katalogowe: ConverterType (z kind, e_kwh) i InverterType (neutralny technologicznie).

**Z decyzji #53 wynika (konwencja znaków — BINDING):**
- Generator: bus_p += p_mw, bus_q += (q_mvar or 0.0).
- Load: bus_p -= p_mw, bus_q -= q_mvar.
- Source: NIE wnosi P/Q — SLACK bilansuje niezależnie.
- BESS: p_mw < 0 oznacza ładowanie (pobór).
- **DOMENA ŹRÓDEŁ, GENERATORÓW I ODBIORÓW W ROZDZIALE 7 JEST ZAMKNIĘTA (v1.0).**

| 54 | Formuła TYP vs INSTANCJA: instancja = TYP(katalog) + parametry_zmienne + [override] + ilość | **BINDING** | ENM + Catalog | `SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md` (§8.1) | Zasada nadrzędna (Decyzja #39): żaden parametr znamionowy nie jest wpisywany ręcznie. TYP: frozen dataclass w katalogu, read-only, współdzielony, niezależny od topologii. INSTANCJA: pozycja w ENM, wskazuje typ przez `catalog_ref`, przechowuje parametry zmienne. Wyjątki: Source (parametry projektowe OSD), Load (parametry bilansowe), Bus (napięcie szyny). 9 klas typów AS-IS: LineType (16p), CableType (18p), TransformerType (14p), SwitchEquipmentType (9p), ConverterType (13p), InverterType (11p), ProtectionDeviceType (7p), ProtectionCurve (5p), ProtectionSettingTemplate (5p). |
| 55 | ParameterSource enum: OVERRIDE > TYPE_REF > INSTANCE — 3-poziomowa precedencja resolvera | **BINDING** | Catalog + Resolver | `SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md` (§8.6) | Resolver (`catalog/resolver.py:20–25`) definiuje `ParameterSource(Enum)`: OVERRIDE (impedance_override, najwyższy priorytet), TYPE_REF (catalog_ref → typ, domyślny), INSTANCE (parametry z instancji, fallback). 3 funkcje resolvera: `resolve_line_params()` (override>type_ref>instance), `resolve_transformer_params()` (type_ref>instance), `resolve_thermal_params()` (type_ref only, returns None). Zwracane typy frozen: ResolvedLineParams (5p), ResolvedTransformerParams (9p), ResolvedThermalParams (10p). TypeNotFoundError raised gdy type_ref nie znaleziony (linie, trafo); returns None (thermal). |
| 56 | CatalogRepository — frozen immutable repozytorium 9 kolekcji typów | **BINDING** | Catalog | `SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md` (§8.4.2) | CatalogRepository (`catalog/repository.py:20–201`): frozen=True dataclass, 9 kolekcji (line_types, cable_types, transformer_types, switch_equipment_types, converter_types, inverter_types, protection_device_types, protection_curves, protection_setting_templates). Fabrycznie: `from_records()` deserializacja. Domyślny katalog: `get_default_mv_catalog()` — 14+ typów linii, 90+ kabli, trafo WN/SN+SN/nn, łączniki, konwertery. Dostęp per typ: `get_line_type(id)`, `get_cable_type(id)`, etc. |
| 57 | TypeLibraryManifest + ImportMode (MERGE/REPLACE) + deterministyczny fingerprint SHA-256 | **BINDING** | Governance | `SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md` (§8.7) | TypeLibraryManifest (`catalog/governance.py:42–98`): library_id, name_pl, vendor, series, revision, schema_version, created_at, fingerprint (SHA-256). ImportMode: MERGE (dodaje, pomija istniejące) / REPLACE (zastępuje, blokowane jeśli typy w użyciu). TypeLibraryExport: deterministyczna serializacja (sorted keys) → fingerprint payload → SHA-256. Inwariant: ten sam katalog → identyczny fingerprint. Typ immutable — modyfikacja = nowy typ z nowym id (Decyzja #42). Usunięcie typu przy instancjach → TypeNotFoundError. |
| 58 | Tryb ekspercki: impedance_override na LineBranch — jedyny zaimplementowany override AS-IS | **BINDING** | ENM + Resolver | `SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md` (§8.5) | AS-IS: jedyny override = `impedance_override` na LineBranch (`branch.py:212`). Override = najwyższy priorytet w resolverze → ParameterSource.OVERRIDE. Override NIE zmienia typu w katalogu — dotyczy wyłącznie instancji. Override jest jawny (zapisany w modelu) i audytowalny (ParameterSource w White Box). TO-BE: rozszerzenie override na Transformer (uk%, pk — Decyzja #16), Generator falownikowy (k_sc, limity — Decyzja #16). Zakazy: cicha modyfikacja, brak ParameterSource, trwała zmiana katalogu z poziomu projektu. |

**Z decyzji #54 wynika (TYP vs INSTANCJA — BINDING):**
- Formuła: instancja ENM = TYP(katalog) + parametry_zmienne(kreator) + [override(ekspert)] + ilość.
- TYP: frozen=True, read-only w projekcie, 9 klas, wspólne pola (id, name, manufacturer) + domenowe.
- INSTANCJA: catalog_ref (opcjonalne AS-IS, docelowo obowiązkowe) + parametry zmienne (length_km, tap_position, p_mw, status, n_parallel).
- Wyjątki: Source (parametry OSD), Load (bilansowe), Bus (napięcie szyny).
- Zakaz duplikowania parametrów typu w instancji (docelowo — AS-IS: backward compatibility pozwala na oba).

**Z decyzji #55 wynika (ParameterSource + Resolver — BINDING):**
- ParameterSource: OVERRIDE > TYPE_REF > INSTANCE — 3-poziomowa precedencja, jednoznaczna.
- Resolver wywoływany PRZED solverem, PO mapperze (mapper przekazuje surowe parametry).
- Solver NIE zna katalogu, NIE wie o override — operuje na parametrach finalnych.
- ResolvedLineParams, ResolvedTransformerParams, ResolvedThermalParams — frozen, z polem `source`.

**Z decyzji #56 wynika (CatalogRepository — BINDING):**
- Frozen immutable repozytorium — po utworzeniu nie może być zmodyfikowane.
- 9 kolekcji typów z dostępem per id.
- Domyślny katalog MV z typami producenckimi (NKT, Tele-Fonika, etc.).

**Z decyzji #57 wynika (Governance — BINDING):**
- TypeLibraryManifest: wersjonowanie bibliotek z SHA-256 fingerprint.
- Import MERGE/REPLACE z ochroną istniejących instancji.
- Deterministyczny fingerprint: ten sam katalog → ten sam hash.

**Z decyzji #58 wynika (Override — BINDING):**
- AS-IS: jedyny override = impedance_override na LineBranch.
- Override = najwyższy priorytet w resolverze → ParameterSource.OVERRIDE.
- Override NIE zmienia katalogu — instancja only.
- TO-BE: rozszerzenie na Transformer i Generator (Decyzja #16).
- **DOMENA TYPU VS INSTANCJI ORAZ KATALOGÓW TYPÓW W ROZDZIALE 8 JEST ZAMKNIĘTA (v1.0).**

| 59 | ProtectionDevice — frozen model 11 pól, 5 stopni nadprądowych, NOT-A-SOLVER | **BINDING** | Domain (Protection) | `SPEC_CHAPTER_09_PROTECTION_SYSTEM.md` (§9.2) | ProtectionDevice (`domain/protection_device.py:256–288`): frozen dataclass, 11 pól (id, name, device_type, location_element_id, settings, manufacturer, model, location_description, ct_ratio, rated_current_a, created_at). ProtectionDeviceType(Enum): RELAY, FUSE, RECLOSER, CIRCUIT_BREAKER. OvercurrentProtectionSettings: 5 stopni nadprądowych (stage_51 I>, stage_50 I>>, stage_50_high I>>>, stage_51n I₀>, stage_50n I₀>>). OvercurrentStageSettings: enabled, pickup_current_a, time_s, curve_settings, directional (placeholder). ProtectionCurveSettings: 6 pól (standard IEC/IEEE/FUSE, variant, pickup_current_a, time_multiplier 0.05–10.0, definite_time_s, reset_time_s). Zabezpieczenie NIE jest elementem topologicznym ENM — jest logiką decyzyjną (NOT-A-SOLVER, Decyzja #25). Punkt pomiarowy: location_element_id + ct_ratio (jawny, bez domyślnych). |
| 60 | Krzywe IEC 60255 + IEEE C37.112 + krzywe producenckie — formuły, stałe, rejestr | **BINDING** | Solver Support | `SPEC_CHAPTER_09_PROTECTION_SYSTEM.md` (§9.5) | IEC 60255-151 (`protection/curves/iec_curves.py`): t = TMS × A/(M^B − 1) + C. Warianty: SI(A=0.14,B=0.02), VI(A=13.5,B=1.0), EI(A=80.0,B=2.0), LTI(A=120.0,B=1.0), DT(czas stały). IECTrippingResult: 7 pól frozen (tripping_time_s, current_multiple, time_multiplier, m_power_b, denominator, base_time_s, will_trip). IEEE C37.112 (`protection/curves/ieee_curves.py`): t = TD × (A/(M^p − 1) + B). Warianty: MI, VI, EI, STI, DT. IEEETrippingResult: frozen. Krzywe producenckie (`domain/protection_vendors.py`): Manufacturer(12 wartości: ABB, SIEMENS, SCHNEIDER, ETANGO, EATON, GE, SEL, AREVA, ALSTOM, NOJA, ORMAZABAL, GENERIC, OTHER). CurveOrigin: IEC_STANDARD, DERIVED_VENDOR, VENDOR_NATIVE. VENDOR_CURVE_REGISTRY: 8+ definicji. generate_iec_curve_points(n=50), generate_ieee_curve_points(n=50) — logarithmic spacing 1.1×–20× pickup. |
| 61 | Koordynacja: 3 kontrole kanoniczne + 4 kontrole I>> (FIX-12D), CoordinationVerdict | **BINDING** | Analysis | `SPEC_CHAPTER_09_PROTECTION_SYSTEM.md` (§9.6) | 3 kontrole kanoniczne: SensitivityCheck (I_fault_min/I_pickup ≥ 1.2 → margines ≥20%), SelectivityCheck (t_upstream − t_downstream ≥ Δt_wymagane), OverloadCheck (I_pickup/I_operating ≥ 1.2). Wszystkie frozen dataclasses z `domain/protection_device.py`. CoordinationVerdict(Enum): PASS, MARGINAL, FAIL, ERROR. 4 kontrole I>> (FIX-12D, `protection_device.py:592–774`): InstantaneousSelectivityCheck, InstantaneousSensitivityCheck, InstantaneousThermalCheck, SPZFromInstantaneousCheck. ProtectionCoordinationResult: frozen, agreguje devices + sensitivity + selectivity + overload + overall_verdict. Falownik NIE uczestniczy w selektywności sieciowej (Decyzja #22) — warunek brzegowy, t_tech ≤ 250ms < t_sieć. |
| 62 | White Box Protection Trace — 9-krokowy łańcuch przyczynowy, frozen audit trail | **BINDING** | White Box | `SPEC_CHAPTER_09_PROTECTION_SYSTEM.md` (§9.9) | ProtectionTrace (`domain/protection_analysis.py`): frozen dataclass (run_id, sc_run_id, snapshot_id, template_ref, overrides, steps). ProtectionTraceStep: frozen (step 1–9, description_pl, inputs, outputs). 9 kroków łańcucha: (1) ENM identyfikacja, (2) Scenariusz (typ zwarcia), (3) Wielkość (prąd SC), (4) Funkcja (51/50/50N), (5) Nastawa (Is, TMS), (6) Decyzja (TRIPS/NO_TRIP/INVALID), (7) Czas (t_trip), (8) Aparat (wykonawczy), (9) Skutek (wyłączenie). Raport „kto zadziałał pierwszy": sekwencja chronologiczna po t_trip. GAP: brak event_class ∈ {TECHNOLOGICAL, NETWORK} i event_scope ∈ {LOCAL_DEVICE, NETWORK_SECTION} — TO-BE (Decyzja #23). |
| 63 | Porównanie A/B — StateChange, IssueCode, severity ranking, ProtectionComparisonResult | **BINDING** | Analysis | `SPEC_CHAPTER_09_PROTECTION_SYSTEM.md` (§9.10) | ProtectionComparisonResult (`domain/protection_comparison.py`): frozen (comparison_id, run_a_id, run_b_id, project_id, rows, ranking, summary). StateChange(Enum): NO_CHANGE, TRIP_TO_NO_TRIP(=REGRESJA, severity 5), NO_TRIP_TO_TRIP(=ULEPSZENIE, severity 1), INVALID_CHANGE(severity 3). IssueCode(Enum): TRIP_LOST(5), TRIP_GAINED(1), DELAY_INCREASED(3), DELAY_DECREASED(2), INVALID_STATE(4), MARGIN_DECREASED(3), MARGIN_INCREASED(2). IssueSeverity: CRITICAL(5), MAJOR(4), MODERATE(3), MINOR(2), INFORMATIONAL(1). RankingIssue: deterministycznie posortowane per severity. API: 4 endpointy comparison (POST create, GET metadata, GET results, GET trace). |
| 64 | Sanity checks (16 reguł) + walidacje architektoniczne (E-P01..I-P02) — pre-analysis gate | **BINDING** | Validation | `SPEC_CHAPTER_09_PROTECTION_SYSTEM.md` (§9.11) | 16 reguł sanity checks (`application/analyses/protection/sanity_checks/`): VOLT_MISSING_UN, VOLT_OVERLAP, VOLT_U_LT_TOO_LOW, VOLT_U_GT_TOO_HIGH, FREQ_OVERLAP, FREQ_F_LT_TOO_LOW, FREQ_F_GT_TOO_HIGH, ROCOF_NON_POSITIVE, ROCOF_TOO_HIGH, OC_MISSING_IN, OC_OVERLAP, OC_I_GT_TOO_LOW, OC_I_INST_TOO_LOW, SPZ_NO_TRIP_FUNCTION, SPZ_MISSING_CYCLE_DATA, GEN_NEGATIVE_SETPOINT, GEN_PARTIAL_ANALYSIS. Severity: ERROR (blokuje), WARN (ostrzega), INFO (informuje). 10 walidacji architektonicznych: E-P01 (brak pomiaru), E-P02 (mieszanie klas), E-P03 (brak aparatu), E-P04 (brak SC run), W-P01 (t_sieć<t_falownik), W-P02 (brak trace), W-P03 (I>>< Ik_min), W-P04 (I>>In_trafo), I-P01 (info tech), I-P02 (info OZE). Niezależne od ENM Validator (§6.10). |

**Z decyzji #59 wynika (ProtectionDevice — BINDING):**
- ProtectionDevice to frozen dataclass z 11 polami, NIE jest elementem topologicznym ENM.
- 5 stopni nadprądowych: I> (51), I>> (50), I>>> (50_high), I₀> (51N), I₀>> (50N).
- ProtectionCurveSettings: IEC/IEEE/FUSE standard z parametrami (pickup, TMS/TD, DT).
- Punkt pomiarowy (location_element_id + ct_ratio) MUSI być jawny — zakaz implicit.
- NOT-A-SOLVER: zabezpieczenie = logika decyzyjna operująca na wynikach solverów.
- Dwie klasy TECHNOLOGICAL/NETWORK rozłączne (Decyzja #21) — zakaz mieszania w jednym urządzeniu.

**Z decyzji #60 wynika (Krzywe — BINDING):**
- IEC 60255: t = TMS × A/(M^B − 1) + C — 5 wariantów (SI, VI, EI, LTI, DT).
- IEEE C37.112: t = TD × (A/(M^p − 1) + B) — 5 wariantów (MI, VI, EI, STI, DT).
- Krzywe producenckie: 12 Manufacturer + 3 CurveOrigin + rejestr VENDOR_CURVE_REGISTRY.
- IECTrippingResult i IEEETrippingResult: frozen, White Box (m_power_b, denominator, base_time_s).

**Z decyzji #61 wynika (Koordynacja — BINDING):**
- 3 kontrole kanoniczne: czułość (≥20% margines), selektywność (Δt ≥ wymagane), przeciążalność (≥20%).
- 4 kontrole I>> (FIX-12D): instantaneous selectivity, sensitivity, thermal, SPZ.
- CoordinationVerdict: PASS/MARGINAL/FAIL/ERROR — deterministyczny.
- Falownik = warunek brzegowy (t_tech ≤ 250ms), NIE uczestnik selektywności sieciowej.

**Z decyzji #62 wynika (White Box Protection — BINDING):**
- ProtectionTrace: frozen audit trail z 9-krokowym łańcuchem przyczynowym.
- Raport „kto zadziałał pierwszy": sekwencja chronologiczna per t_trip.
- GAP: event_class (TECHNOLOGICAL/NETWORK) i event_scope (LOCAL_DEVICE/NETWORK_SECTION) — TO-BE.
- Deterministyczny: te same dane wejściowe → identyczny trace.

**Z decyzji #63 wynika (Porównanie A/B — BINDING):**
- StateChange: TRIP_TO_NO_TRIP = REGRESJA (severity 5 — CRITICAL).
- IssueCode: 7 kodów z deterministycznym severity ranking.
- ProtectionComparisonResult: frozen, rows + ranking + summary.
- API: 4 endpointy dla comparison (create, metadata, results, trace).

**Z decyzji #64 wynika (Sanity checks + Walidacje — BINDING):**
- 16 reguł sanity checks per funkcja: napięciowe (27/59), częstotliwościowe (81U/81O), ROCOF (81R), nadprądowe (50/51), SPZ (79), ogólne.
- 10 walidacji architektonicznych: E-P01..E-P04 (ERROR, blokujące), W-P01..W-P04 (WARNING), I-P01..I-P02 (INFO).
- Sanity checks niezależne od ENM Validator — dedykowana bramka pre-analysis.
- **DOMENA SYSTEMU ZABEZPIECZEŃ W ROZDZIALE 9 JEST ZAMKNIĘTA (v1.0).**

| 65 | Agregacja jednostek równoległych: v1 = strategia B (multiplikacja logiczna), docelowo A (parametryczna) | **BINDING** | ENM + Solver | `SPEC_CHAPTER_07…` (§7.A.1) | v1: brak pola n_parallel na Generator/InverterSource. Użytkownik tworzy N osobnych instancji (strategia B). Docelowo (Decyzja #17): n_parallel: int = 1 na Generator. Solver: PF: N×p_mw; SC: N×k_sc×In. White Box raportuje quantity + strategy. Z-AGR-01..03. |
| 66 | Model obciążenia ZIP: formalnie zablokowany w v1, wymaga osobnej ADR | **BINDING** | ENM + Solver | `SPEC_CHAPTER_07…` (§7.A.2) | Load.model="zip" zdefiniowany w Pydantic ale: mapper IGNORUJE (traktuje jako PQ), solver nie obsługuje, kreator nie oferuje. Formuła ZIP: P(U)=P₀[a(U/U₀)²+b(U/U₀)+c], a+b+c=1.0. Aktywacja wymaga: mapper, solver NR, White Box, Study Case, testy. Z-ZIP-01..04. |
| 67 | BESS tryby pracy: DISCHARGE/CHARGE/IDLE — kanoniczna tabela z P/Q/SC/White Box | **BINDING** | ENM + Solver + White Box | `SPEC_CHAPTER_07…` (§7.A.3) | v1: brak jawnego bess_mode, tryb implicit z p_mw (>0=discharge, <0=charge, 0=idle). Tabela: DISCHARGE(P>0, generacja, SC=k_sc×In), CHARGE(P<0, pobór, SC contributes), IDLE(P=0, neutralny). Docelowo: BESSMode enum + parametr StudyCase. Z-BESS-01..03. |
| 68 | StudyCaseContext: zamrożony kontekst obliczeniowy — jednoznaczne wejście do solverów | **BINDING** | Domain + Solver | `SPEC_CHAPTER_07…` (§7.A.4) | StudyCaseContext = ENM snapshot + katalog(fingerprint) + StudyCaseConfig + ProtectionConfig + aktywne źródła + obciążenia + generatory + stany łączników. v1: input_snapshot(dict) + input_hash(SHA-256) na AnalysisRun. Kanonicalizacja deterministyczna. Gwarancja: ten sam context + solver = identyczne wyniki. |
| 69 | Tryb ekspercki: AuditContract (7 pól) dla override parametrów typu | **BINDING** | Catalog + ENM + White Box | `SPEC_CHAPTER_08…` (§8.A.1) | v1: impedance_override na LineBranch, brak kontraktu audytowego. TO-BE: AuditContract: override_id(UUID), changed_by(str), changed_at(datetime), reason(str min 10), parameters_changed(dict), expert_flag(bool=True), impact_scope(list[str]). Rozszerzenie na Transformer i Generator = TO-BE (#16). Z-EXP-01..05. |
| 70 | CompatibilityMatrix: macierz kompatybilności typów katalogowych (WARNING) | **BINDING** | Catalog + Validation | `SPEC_CHAPTER_08…` (§8.A.2) | 5 relacji: InverterType↔TransformerType(Sn,Un), InverterType↔ProtectionDeviceType(In), TransformerType↔ProtectionDeviceType(In), CableType↔ProtectionDeviceType(In vs I_pickup), LineType↔ProtectionDeviceType. WARNING, nie ERROR. v1: NIEZAIMPLEMENTOWANA. TO-BE: CompatibilityCheck + CompatibilityMatrix frozen. |
| 71 | Macierz zmian między Cases: co zmienne (config), co stałe (topologia, typy) | **BINDING** | Domain + Case | `SPEC_CHAPTER_08…` (§8.A.3) | v1 zmienne: StudyCaseConfig + ProtectionConfig. Stałe BINDING: topologia, typy, parametry znamionowe. Stałe v1/zmienne TO-BE: łączniki, profile P/Q, BESS mode, źródła, override. Konsekwencja v1: zmiana łącznika = nowy snapshot → invalidacja ALL. TO-BE: StudyCaseOverlay. |
| 72 | Study Case = config-only, hierarchia Project→ENM→Case→Run→Result | **BINDING** | Architecture | `SPEC_CHAPTER_10…` (§10.1) | StudyCase(frozen, 13 pól): id, project_id, name, network_snapshot_id, config, protection_config, result_status(NONE/FRESH/OUTDATED), is_active, result_refs, revision, created_at, updated_at, study_payload. 1 ENM→N Cases, 1 Case→M Runs, 1 aktywny per projekt. Clone→NONE. Z-SC-01..09, INV-SC-01..09. |
| 73 | Scenariusze kanoniczne: PF(5) + SC(6) + U(2) + operacyjne(3 TO-BE) = 16 typów | **BINDING** | Domain + Case | `SPEC_CHAPTER_10…` (§10.3) | PF: normalny, min/max obciążenie, noc/dzień OZE. SC: 3F max/min, 2F, 1F, z/bez OZE. U: Umin/Umax. Operacyjne (TO-BE): normalna, N-1(overlay), rekonfiguracja(overlay). P10 ScenarioType: NORMAL, N_1, MAINTENANCE, EMERGENCY, USER_DEFINED. |
| 74 | Warunki brzegowe Case: jawne, bez domyślnych, bez dziedziczenia niejawnego | **BINDING** | Domain + Validation | `SPEC_CHAPTER_10…` (§10.4) | v1 jawne: Source.in_service(ENM), Switch.status(ENM), StudyCaseConfig, include_inverter/motor, fault_type/lokalizacja(per Run). Z ENM (nie per Case): profile P/Q, tryby BESS. Z-WB-01..03. |
| 75 | Kanonicalizacja + SHA-256: deterministyczny input_hash | **BINDING** | Infrastructure + Solver | `SPEC_CHAPTER_10…` (§10.6) | canonicalize(): sortuje klucze, stabilnie sortuje listy, UUID→str, datetime→ISO, Enum→str, complex→{re,im}. JSON: sort_keys=True, separators=(",",":") → SHA-256. Deduplikacja P20a: FINISHED run z tym samym hash → kopiuj wyniki. |
| 76 | Invalidacja wyników: 6 zdarzeń → macierz efektów | **BINDING** | Domain + Application | `SPEC_CHAPTER_10…` (§10.8) | (1) zmiana ENM → ALL OUTDATED, (2) zmiana Config → dany OUTDATED, (3) zmiana ProtectionConfig → dany OUTDATED, (4) Clone → NONE, (5) Commit Wizard → ALL OUTDATED, (6) obliczenie → FRESH. |
| 77 | Relacja Case→Solver: Case steruje, NIE ingeruje w algorytm | **BINDING** | Domain + Solver | `SPEC_CHAPTER_10…` (§10.9) | Config → c_factor/base_mva/tolerance/include_inverter → AnalysisRunService → Solver(input, options). PowerFlowOptions(6p): tolerance, max_iter, damping, flat_start, validate, trace_level. 7 Solver Input Specs. |
| 78 | White Box per AnalysisRun: ENM→Config→Input→Algorytm→Wynik | **BINDING** | White Box + Solver | `SPEC_CHAPTER_10…` (§10.10) | Trace: input_snapshot(dict), input_hash(str), trace_json(Proof Pack), white_box_trace(audit). Łańcuch deterministyczny. Z-WB-04..06: zakaz wyników bez run, run bez hash, scenariusza bez trace. |
| 79 | Walidacje pre-calculation: E-SC-01..05 + W-SC-01..02 + B-SC-01 | **BINDING** | Validation | `SPEC_CHAPTER_10…` (§10.18) | 5 ERROR: brak config, c_factor≤0, tolerance≤0, brak aktywnego Case, ENM blockers. 2 WARNING: OUTDATED, brak trace. 1 BLOCKER(strict): brak White Box. Spójność: c_max<c_min, brak solvera, brak snapshot, 2 aktywne Cases. |

**Z decyzji #65–#68 wynika (Suplementy R7 v1.1 — BINDING):**
- Agregacja v1: strategia B (multiplikacja). Docelowo: strategia A (parametryczna, n_parallel).
- ZIP: formalnie ZABLOKOWANY (Z-ZIP-01..04), wymaga ADR.
- BESS: 3 tryby kanoniczne (DISCHARGE/CHARGE/IDLE), v1 implicit z p_mw.
- StudyCaseContext: zamrożony kontekst = jednoznaczne wejście do solverów.
- **SUPLEMENTY ROZDZIAŁU 7 (v1.1) SĄ ZAMKNIĘTE.**

**Z decyzji #69–#71 wynika (Suplementy R8 v1.1 — BINDING):**
- AuditContract: 7 pól obowiązkowych dla override (kto, kiedy, dlaczego, co, wpływ).
- CompatibilityMatrix: 5 relacji WARNING, niezaimplementowana v1.
- Macierz zmian: v1 zmienne = Config + ProtectionConfig only. TO-BE: overlay.
- **SUPLEMENTY ROZDZIAŁU 8 (v1.1) SĄ ZAMKNIĘTE.**

**Z decyzji #72–#79 wynika (Rozdział 10 — BINDING):**
- StudyCase = config-only, frozen, 13 pól, hierarchia Project→ENM→Case→Run→Result.
- AnalysisRun = jednorazowy, frozen, state machine CREATED→VALIDATED→RUNNING→FINISHED/FAILED.
- Deterministyczna kanonicalizacja + SHA-256 + deduplikacja P20a.
- Invalidacja: 6 zdarzeń → macierz efektów (globalna/lokalna/NONE).
- 16 scenariuszy kanonicznych, walidacje E-SC/W-SC/B-SC, White Box per run.
- **DOMENA SCENARIUSZY OBLICZENIOWYCH W ROZDZIALE 10 JEST ZAMKNIĘTA (v1.0).**

| 80 | EventClass + EventScope na ProtectionTraceStep — klasyfikacja zdarzeń w łańcuchu przyczynowym | **BINDING** | Analysis + White Box | `SPEC_CHAPTER_09…` (§9.A.1) | EventClass: TECHNOLOGICAL (termiczna, Q>, COS>, f<, df/dt, FRT — zdarzenia wewnątrz urządzenia), NETWORK (50/51/50N/51N/67/67N — zdarzenia sieciowe). EventScope: LOCAL_DEVICE (jedno urządzenie), NETWORK_SECTION (odcinek sieci). Dodane do ProtectionTraceStep: event_class(EventClass), event_scope(EventScope). White Box MUSI raportować per step. Inwarianty INV-PROT-09..10. Walidacje W-P05..06. |
| 81 | Dual SC z/bez OZE: DualSCResult z parą V1(z OZE) / V2(bez OZE) + ΔIk | **BINDING** | Solver + Analysis | `SPEC_CHAPTER_09…` (§9.A.2) | v1: dwa osobne AnalysisRun (jeden z include_inverter=True, drugi False). TO-BE: DualSCResult(frozen): variant_with_oze(ShortCircuitResult), variant_without_oze(ShortCircuitResult), delta_ik_percent(float), delta_sk_percent(float), dominant_variant(str), assessment(str). Automatyczne parowanie per bus_id. Walidacje E-P05..06. Inwarianty INV-PROT-11..12. |
| 82 | CTType (11 pól) + VTType (10 pól) jako byty katalogowe | **BINDING** | Catalog + ENM | `SPEC_CHAPTER_09…` (§9.A.3) | CTType(frozen, 11 pól): id, manufacturer, model, ct_class(PN-EN 61869-2), rated_primary_a, rated_secondary_a(1/5), accuracy_class(0.2/0.2S/0.5/1.0/3/5P/10P), rated_burden_va, alf(ALF≥20 dla 5P), fs_factor, thermal_short_time_current_ka. VTType(frozen, 10 pól): id, manufacturer, model, vt_class(PN-EN 61869-3), rated_primary_kv, rated_secondary_v(100/√3), accuracy_class(0.2/0.5/1.0/3P/6P), rated_burden_va, rated_voltage_factor(1.2/1.5/1.9), thermal_rating_va. v1: brak implementacji, pole ct_ratio(float). TO-BE: ProtectionDevice → CTType + VTType. Walidacje W-P08..10. |
| 83 | DirectionMode: FORWARD/REVERSE/NON_DIRECTIONAL — tryb kierunkowy zabezpieczenia | **BINDING** | Domain + Analysis | `SPEC_CHAPTER_09…` (§9.A.4) | DirectionMode enum: FORWARD (przepływ od źródła do odbioru), REVERSE (przepływ od odbioru do źródła — generacja rozproszona), NON_DIRECTIONAL (brak rozróżnienia — domyślne w v1). ProtectionFunctionSummary rozszerzone o: direction_mode(DirectionMode=NON_DIRECTIONAL), reference_angle_deg(Optional[float]). v1: wszystkie zabezpieczenia NON_DIRECTIONAL. TO-BE: FORWARD/REVERSE dla 67/67N. Inwarianty INV-PROT-13..14. Walidacja I-P03. |
| 84 | StudyCaseOverlay: nakładka konfiguracyjna na ENM per Case (N-1, rekonfiguracja) | **BINDING** | Domain + Case | `SPEC_CHAPTER_10…` (§10.A.1) | StudyCaseOverlay(frozen): overlay_id(UUID), name(str), description(str), switch_overrides(list[SwitchOverride]), load_profiles(list[LoadProfile]), gen_profiles(list[GenProfile]), source_overrides(list[SourceOverride]). SwitchOverride: branch_ref_id + forced_status(open/closed). LoadProfile: load_ref_id + p_mw_override + q_mvar_override + scale_factor. GenProfile: gen_ref_id + p_mw_override + q_mvar_override + in_service. SourceOverride: source_ref_id + in_service. v1: NIEZAIMPLEMENTOWANE (zmiana łącznika = zmiana ENM → invalidacja ALL). Walidacje E-OV-01..05. Inwarianty INV-SC-10..12. |
| 85 | StudyCaseResultComparison: porównanie wyników między Cases (ΔU, ΔI, ΔP, ΔIk) | **BINDING** | Analysis + Case | `SPEC_CHAPTER_10…` (§10.A.2) | StudyCaseResultComparison(frozen): comparison_id(UUID), base_case_id, compare_case_id, timestamp, bus_diffs(list[BusResultDiff]), branch_diffs(list[BranchResultDiff]), sc_diffs(list[SCResultDiff]), summary(ComparisonSummary). BusResultDiff: bus_id + delta_u_pu + delta_u_percent + delta_p_mw + delta_q_mvar + severity. BranchResultDiff: branch_id + delta_i_a + delta_loading_percent + delta_p_loss_kw + severity. SCResultDiff: bus_id + delta_ik_a + delta_ik_percent + delta_sk_mva + severity. Severity: |Δ|>20%=HIGH, 5-20%=MEDIUM, <5%=LOW. Walidacje E-CMP-01..04. Inwarianty INV-SC-13..15. |
| 86 | BESSModeOverride: tryb BESS jako parametr Study Case, nie stała ENM | **BINDING** | Domain + Case + Solver | `SPEC_CHAPTER_10…` (§10.A.3) | v1: bess_mode implicit z p_mw na Generator (Decyzja #67). TO-BE: BESSModeOverride(frozen): gen_ref_id(str), forced_mode(BESSMode: DISCHARGE/CHARGE/IDLE), p_mw_override(Optional), q_mvar_override(Optional). Dodane do StudyCaseOverlay.bess_overrides: list[BESSModeOverride]. Solver korzysta z forced_mode ZAMIAST implicit z p_mw. White Box raportuje: bess_mode_source = OVERLAY vs IMPLICIT. Inwarianty INV-SC-16..17. |

**Z decyzji #80–#83 wynika (Suplementy R9 v1.1 — BINDING):**
- EventClass/EventScope: klasyfikacja per ProtectionTraceStep (TECHNOLOGICAL/NETWORK × LOCAL_DEVICE/NETWORK_SECTION).
- Dual SC: DualSCResult paruje V1(z OZE) + V2(bez OZE) z ΔIk%. v1: dwa osobne runy.
- CT/VT: pełne byty katalogowe (CTType 11 pól, VTType 10 pól) wg PN-EN 61869-2/3. v1: ct_ratio float.
- DirectionMode: FORWARD/REVERSE/NON_DIRECTIONAL. v1: wszystkie NON_DIRECTIONAL.
- **SUPLEMENTY ROZDZIAŁU 9 (v1.1) SĄ ZAMKNIĘTE.**

**Z decyzji #84–#86 wynika (Suplementy R10 v1.1 — BINDING):**
- StudyCaseOverlay: nakładka per Case (SwitchOverride, LoadProfile, GenProfile, SourceOverride). v1: NIEZAIMPLEMENTOWANE.
- StudyCaseResultComparison: porównanie ΔU/ΔI/ΔP/ΔIk z 3-stopniowym severity (HIGH/MEDIUM/LOW).
- BESSModeOverride: tryb BESS jako parametr overlay Case, nie stała ENM.
- **SUPLEMENTY ROZDZIAŁU 10 (v1.1) SĄ ZAMKNIĘTE.**

| 87 | Zasada nadrzędna raportowania: raport = projekcja AnalysisRun, deterministyczny artefakt | **BINDING** | Presentation | `SPEC_CHAPTER_11…` (§11.0) | Raport nie zawiera logiki obliczeniowej, nie zawiera danych „z ręki", jest deterministyczny (te same dane → identyczny raport). Raport czyta frozen results, NIGDY nie modyfikuje ENM/Solver/Case. Parytet benchmark: feature matrix ≥ benchmark ≥ benchmark. |
| 88 | Trzy klasy raportów: PRIMARY (1 run), COMPARATIVE (delta), AUDIT (trace) | **BINDING** | Presentation | `SPEC_CHAPTER_11…` (§11.1) | PRIMARY: PF, SC, Protection, VoltageProfile, Loading — 1 AnalysisRun, pełny nagłówek, cross-ref. COMPARATIVE: Case vs Case, Run vs Run, z/bez OZE — NIGDY nie miesza solverów, wymaga ten sam ENM snapshot. AUDIT: ProofDocument, ProtectionTrace, macierze efektów — czysta interpretacja. NumericDelta(5 pól), ComplexDelta(10 pól) frozen AS-IS. |
| 89 | Struktura kanoniczna raportu: ReportHeader + ReportContext + wyniki + cross-reference | **BINDING** | Presentation | `SPEC_CHAPTER_11…` (§11.2) | ReportHeader(TO-BE, 15 pól): report_id, report_type, project/case/run IDs, solver info, timestamps, enm_hash, case_hash, input_hash. ReportContext(TO-BE, 7 pól): scenario, boundary conditions, active sources/loads, BESS modes. Każdy wiersz wynikowy wymaga ref_id. Sortowanie deterministyczne. |
| 90 | Cross-reference SLD: CrossReference + CrossReferenceTable — mapowanie raport↔SLD↔ENM | **BINDING** | Presentation + SLD | `SPEC_CHAPTER_11…` (§11.2.4) | CrossReference(frozen, 6 pól): enm_ref_id, enm_element_type, enm_element_name, sld_symbol_id, wizard_step_hint, report_section. CrossReferenceTable(frozen, 4 pól): entries, total_elements, mapped_to_sld, coverage_percent. Czysta funkcja: build_cross_reference_table(enm, sld). AS-IS: application/sld/cross_reference.py. |
| 91 | ProofPack: deterministyczny ZIP z manifest + signature + proof (JSON/LaTeX/PDF) | **BINDING** | White Box + Infrastructure | `SPEC_CHAPTER_11…` (§11.5) | ProofDocument(frozen, 8 pól): document_id, artifact_id, created_at, proof_type(12 wariantów), title_pl, header, steps(ProofStep), summary. ProofPackBuilder: JSON canonical → LaTeX → PDF → manifest(SHA-256) → signature(pack_fingerprint) → ZIP(sorted entries, fixed timestamp 1980-01-01). ProofPackContext(frozen, 5 pól). InspectorExporter: export_json/tex/pdf/all. ExportResult(frozen, 5 pól). AS-IS. |
| 92 | Formaty eksportu: JSON/JSONL/PDF/DOCX/LaTeX/CSV — deterministic na każdym | **BINDING** | Infrastructure | `SPEC_CHAPTER_11…` (§11.6) | 6 formatów, wszystkie deterministyczne. DOCX: make_docx_deterministic (fixed ZIP timestamps, sorted entries, normalized core.xml). PDF: reportlab A4. JSON: sort_keys, LF newlines. ProofPack: pdflatex 2-pass. Nazwa pliku: {project}_{case}_{analysis}_{timestamp}.{ext}. Wymóg: wszystkie formaty = te same dane logiczne. |
| 93 | Walidacje raportów: E-RPT-01..05 (ERROR), W-RPT-01..03 (WARNING), I-RPT-01..02 (INFO) | **BINDING** | Validation + Presentation | `SPEC_CHAPTER_11…` (§11.8) | 5 ERROR: brak ref_id, brak hash, niespójność Case/Run, brak solver info, pusty result set. 3 WARNING: brak White Box, coverage<90%, OUTDATED results. 2 INFO: brak pdflatex, comparison z 1 Run. Inwarianty INV-RPT-01..12. Zakazy Z-RPT-01..05. API: 14 AS-IS + 4 TO-BE. |

**Z decyzji #87–#93 wynika (Rozdział 11 — BINDING):**
- Raport = deterministyczny artefakt, projekcja AnalysisRun, NIGDY nie zawiera logiki obliczeniowej.
- 3 klasy: PRIMARY (1 run), COMPARATIVE (delta z NumericDelta/ComplexDelta), AUDIT (trace).
- ProofPack: deterministyczny ZIP z manifest (SHA-256), signature (pack_fingerprint), proof (JSON/LaTeX/PDF).
- 6 formatów eksportu, wszystkie deterministyczne (DOCX: make_docx_deterministic, PDF: reportlab, JSON: canonical).
- Cross-reference: CrossReferenceTable mapuje raport ↔ SLD ↔ ENM (czysta funkcja, AS-IS).
- Hash chain: ENM → input_hash → proof_fingerprint → pack_fingerprint → report_hash.
- Walidacje: 5 ERROR + 3 WARNING + 2 INFO. Inwarianty INV-RPT-01..12. Zakazy Z-RPT-01..05.
- **DOMENA RAPORTOWANIA I EKSPORTU W ROZDZIALE 11 JEST ZAMKNIĘTA (v1.0).**

| 94 | 6 warstw walidacji: W1(ENMValidator) → W2(NetworkValidator) → W3(WizardValidator) → W4(ProtectionSanity) → W5(PreCalc) → W6(EnergyValidation) | **BINDING** | Validation + Application + Analysis | `SPEC_CHAPTER_12…` (§12.1) | Warstwy W1–W5 PRZED solverem (INV-VAL-01). W6 PO solverze. BLOCKER/ERROR na W1–W5 BEZWZGLĘDNIE blokuje pipeline (INV-VAL-02). Kolejność jest inwariantem architektonicznym. |
| 95 | ENMValidator: E001–E008 (BLOCKER), W001–W008 (IMPORTANT), I001–I005 (INFO) — 21 reguł na surowym ENM | **BINDING** | Validation | `SPEC_CHAPTER_12…` (§12.2) | ValidationIssue(Pydantic, 6 pól): code, severity(BLOCKER/IMPORTANT/INFO), message_pl, element_refs, wizard_step_hint, suggested_fix. ValidationResult: status(OK/WARN/FAIL), issues, analysis_available. AnalysisAvailability: SC3F(zawsze jeśli brak blokerów), SC1F(wymaga Z₀), LoadFlow(wymaga loads/gens). Graf connectivity via NetworkX. AS-IS: enm/validator.py. |
| 96 | NetworkValidator: 13 reguł grafowych (ERROR/WARNING) — pre-solver gate na NetworkGraph | **BINDING** | Validation | `SPEC_CHAPTER_12…` (§12.3) | Severity(ERROR/WARNING). ValidationIssue(dataclass, 6 pól): code, message, severity, element_id, field, suggested_fix. ValidationReport(immutable, builder pattern with_error/with_warning). 13 reguł: empty, connectivity, source, dangling, bus voltages, branch endpoints, transformer voltages, SLACK, switch endpoints, inverter buses, impedance, polarity, voltage consistency. W1 i W2 komplementarne (INV-VAL-03). AS-IS: network_model/validation/validator.py. |
| 97 | WizardValidator: K1–K10 step evaluation + ReadinessMatrix + overall_status | **BINDING** | Application | `SPEC_CHAPTER_12…` (§12.4) | StepStatus(empty/partial/complete/error). IssueSeverity(BLOCKER/IMPORTANT/INFO). WizardIssue(Pydantic, 6 pól). StepState(step_id, status, completion_percent, issues). ReadinessMatrix(SC3F/SC1F/LoadFlow). WizardStateResponse(steps, overall_status∈{empty,incomplete,ready,blocked}, readiness_matrix, element_counts). Deterministic: same ENM → identical response. 12 coded rules (K1_NO_NAME..K8_HAS_BLOCKERS). AS-IS: application/network_wizard/validator.py. |
| 98 | ProtectionSanityChecks: 16 coded rules (ERROR/WARN/INFO) — walidacja nastaw zabezpieczeń | **BINDING** | Analysis | `SPEC_CHAPTER_12…` (§12.5) | SanityCheckSeverity(ERROR/WARN/INFO). SanityCheckCode(16 enum: VOLT_*, FREQ_*, ROCOF_*, OC_*, SPZ_*, GEN_*). ProtectionSanityCheckResult(frozen, 8 pól): severity, code, message_pl, element_id, element_type, function_ansi, function_code, evidence. run_sanity_checks(): deterministic sort (element_id, severity, code). Protection catalog validator: validate_requirement(req, cap) → violations. AS-IS: sanity_checks/ + catalog/validator.py. |
| 99 | EnergyValidationBuilder: 5 post-solver QA checks (PASS/WARNING/FAIL/NOT_COMPUTED) | **BINDING** | Analysis | `SPEC_CHAPTER_12…` (§12.7) | EnergyCheckType(5): BRANCH_LOADING, TRANSFORMER_LOADING, VOLTAGE_DEVIATION, LOSS_BUDGET, REACTIVE_BALANCE. EnergyValidationStatus(4): PASS/WARNING/FAIL/NOT_COMPUTED. EnergyValidationConfig(frozen, 6 thresholds): loading 80%/100%, voltage 5%/10%, loss 5%/10%. EnergyValidationItem(frozen, 10 pól): check_type, target_id, observed_value, unit, limits, margin_pct, status, why_pl. Worst-item tracking. Deterministic sort. AS-IS: analysis/energy_validation/. |
| 100 | Macierz severity: BLOCKER/ERROR=blokada, IMPORTANT/WARNING/WARN=ostrzeżenie, INFO/NOT_COMPUTED=informacja | **BINDING** | Validation | `SPEC_CHAPTER_12…` (§12.9) | Unifikacja 5 osobnych enumów severity (W1: BLOCKER/IMPORTANT/INFO, W2: ERROR/WARNING, W3: BLOCKER/IMPORTANT/INFO, W4: ERROR/WARN/INFO, W6: PASS/WARNING/FAIL/NOT_COMPUTED). TO-BE: jeden kanoniczny ValidationSeverity(BLOCKER, WARNING, INFO) — wymaga ADR. |
| 101 | Determinizm walidacji: Z-VAL-01..05 — zakazy losowości, modyfikacji, fizyki w walidacji | **BINDING** | Validation | `SPEC_CHAPTER_12…` (§12.10) | Z-VAL-01: walidacja ≠ f(czas, RNG, kolejność HTTP). Z-VAL-02: walidacja NIE modyfikuje ENM/Graph. Z-VAL-03: walidacja ≠ solver (NOT-A-SOLVER). Z-VAL-04: walidacja produkuje TYLKO issues. Z-VAL-05: reguły blokujące NIE mogą być pominięte. INV-VAL-01..12 (12 inwariantów). |

**Z decyzji #94–#101 wynika (Rozdział 12 — BINDING):**
- 6 warstw walidacji: W1(ENM) → W2(Network) → W3(Wizard) → W4(Protection) → W5(PreCalc) → W6(Energy).
- W1–W5 PRZED solverem, W6 PO solverze. BLOCKER/ERROR = bezwzględna blokada.
- ENMValidator: 21 reguł (E001–I005), ValidationResult z AnalysisAvailability (SC3F/SC1F/LoadFlow).
- NetworkValidator: 13 reguł grafowych, immutable ValidationReport, builder pattern.
- WizardValidator: K1–K10 evaluation, ReadinessMatrix, deterministic.
- ProtectionSanityChecks: 16 coded rules z evidence dict, deterministyczne sortowanie.
- EnergyValidation: 5 post-solver checks z configurable thresholds i worst-item tracking.
- Macierz severity: 5 osobnych enumów → kanoniczne mapowanie BLOCKER/WARNING/INFO.
- Determinizm: Z-VAL-01..05, INV-VAL-01..12.
- **DOMENA WALIDACJI I QA W ROZDZIALE 12 JEST ZAMKNIĘTA (v1.0).**

| 102 | Zamknięta lista 6 typów raportów formalnych: PF, SC, Protection, Validation, Comparative, Audit | **BINDING** | Presentation | `SPEC_CHAPTER_13…` (§13.1) | Dodanie nowego typu = ADR (INV-RPT-13). Każdy typ mapowany na klasę (PRIMARY/COMPARATIVE/AUDIT z R11). Raport = artefakt „do podpisu". |
| 103 | Struktura kanoniczna raportu formalnego: metadane + zakres + snapshot + wyniki + interpretacja + White Box | **BINDING** | Presentation | `SPEC_CHAPTER_13…` (§13.2) | 6 sekcji obowiązkowych: §13.2.1 metadane (12 pól), §13.2.2 zakres obliczeń, §13.2.3 dane wejściowe (snapshot), §13.2.4 wyniki liczbowe (tabele, jednostki, oznaczenia normowe), §13.2.5 interpretacja inżynierska (violations, margins, status OK/WARNING/FAIL), §13.2.6 ślad White Box (trace_steps, validation_trace, solver_events, causality). |
| 104 | Pełny ślad audytowy: ENM → NetworkSnapshot → StudyCase → AnalysisRun → Solver → Result → Raport → ProofPack → Eksport | **BINDING** | Cross-cutting | `SPEC_CHAPTER_13…` (§13.3) | Łańcuch hashy: hash_enm → fingerprint → case_hash → input_hash → result_hash → proof_fingerprint → pack_fingerprint → report_hash. Każdy raport MUSI zawierać pełny łańcuch (INV-RPT-14). |
| 105 | Raport a UI: UI wyświetla, NIE modyfikuje. Raport a CI: automatyczne generowanie i porównanie | **BINDING** | Presentation + Infrastructure | `SPEC_CHAPTER_13…` (§13.5–§13.7) | INV-RPT-15: UI read-only. CI: generowanie raportów w pipeline, porównanie między commitami, archiwizacja jako artefakty. Audyt zewnętrzny: odtworzenie bez kodu źródłowego (LaTeX+PDF wystarczą). |
| 106 | Determinizm raportów: te same dane → identyczny raport bitowo (poza timestamp) | **BINDING** | Presentation | `SPEC_CHAPTER_13…` (§13.6) | Zmiana raportu tylko z: zmiany danych, zmiany solvera, zmiany specyfikacji. INV-RPT-16..18. |
| 107 | Relacja R13 vs R11: R11 = techniczne aspekty (ProofPack, exportery, formaty). R13 = formalizacja raportu jako artefaktu „do podpisu" | **BINDING** | Presentation | `SPEC_CHAPTER_13…` (§13.0.2) | Komplementarne, nie duplikujące. R13 dodaje: zamkniętą listę typów, kanoniczną strukturę, ślad audytowy, CI/audyt. |

**Z decyzji #102–#107 wynika (Rozdział 13 — BINDING):**
- 6 typów raportów formalnych. Dodanie nowego = ADR.
- Struktura kanoniczna: 6 sekcji obowiązkowych (metadane, zakres, snapshot, wyniki, interpretacja, White Box).
- Pełny ślad audytowy z łańcuchem hashy ENM → raport.
- UI read-only, CI: automatyczne generowanie i porównanie raportów.
- Komplementarność R11 (techniczne) i R13 (formalne).
- **DOMENA RAPORTÓW FORMALNYCH W ROZDZIALE 13 JEST ZAMKNIĘTA (v1.0).**

| 108 | Zasada nadrzędna determinizmu: ten sam ENM + Case + Solver = identyczny wynik bitowo | **BINDING** | Cross-cutting | `SPEC_CHAPTER_14…` (§14.0) | Odstępstwo = BŁĄD SYSTEMOWY. Przewaga nad benchmark/benchmark: pełny hash chain, offline reprodukcja, CI regresja. |
| 109 | Snapshoty danych: każdy AnalysisRun zapisuje frozen snapshot ENM, TypeLib, Case, Solver config, spec version | **BINDING** | Infrastructure | `SPEC_CHAPTER_14…` (§14.2) | Z-DET-01: zakaz „żywych referencji" do mutowalnych danych. AS-IS: AnalysisRun.input_snapshot, NetworkSnapshot.fingerprint. |
| 110 | Kanoniczne hashe: SHA-256, UTF-8, sort_keys, LF normalization, canonical JSON | **BINDING** | Infrastructure | `SPEC_CHAPTER_14…` (§14.3) | Hash chain: hash_enm → hash_types → hash_case → input_hash → result_hash → proof_fingerprint → pack_fingerprint → report_hash. INV-DET-01: propagacja. Deduplikacja P20a. |
| 111 | Solvery a determinizm: sorted IDs, no RNG, no hash(), no set iteration, deterministic Jacobian | **BINDING** | Solver | `SPEC_CHAPTER_14…` (§14.4) | Z-DET-02..04: zakazy random(), time(), Python hash(), set iteration. SC IEC 60909: algebraiczne formuły. PF Newton: sorted nodes. |
| 112 | White Box a reprodukcja: odtworzenie krok po kroku, identyfikacja rozbieżności, porównanie runów | **BINDING** | White Box | `SPEC_CHAPTER_14…` (§14.5) | ProofDocument: deterministic, self-contained, verifiable (SHA-256). TO-BE: per-step diff między ProofDocuments. |
| 113 | Zmiany systemowe: macierz co ZMIENIA wynik (ENM, Case, Solver) vs co NIE ZMIENIA (UI, SLD, locale) | **BINDING** | Cross-cutting | `SPEC_CHAPTER_14…` (§14.7) | 5 typów zmian → efekty. INV-DET-08: zmiana UI/SLD/locale NIE zmienia wyniku. |
| 114 | CI regresja determinizmu: golden tests, hash comparison per commit, ProofPack archiwizacja | **BINDING** | Infrastructure | `SPEC_CHAPTER_14…` (§14.8) | Pipeline: load golden → run solver → compare hash → fail if different. AS-IS: test_result_api_contract.py. |

**Z decyzji #108–#114 wynika (Rozdział 14 — BINDING):**
- Ten sam input = identyczny output (bitowo). Odstępstwo = błąd.
- Snapshoty: frozen per AnalysisRun. Zakaz żywych referencji (Z-DET-01).
- SHA-256 canonical hash chain z pełną propagacją.
- Solvery: sorted IDs, no RNG, no hash()/set iteration (Z-DET-02..04).
- White Box: odtworzenie, porównanie, self-contained ProofPack.
- CI: golden tests, hash regression, ProofPack artifacts.
- INV-DET-01..08.
- **DOMENA DETERMINIZMU I WERSJONOWANIA W ROZDZIALE 14 JEST ZAMKNIĘTA (v1.0).**

| 115 | 4 poziomy governance: DATA (snap/freeze), COMPUTATION (nowy run), SPEC (ADR), RESULT (approve/freeze) | **BINDING** | Governance | `SPEC_CHAPTER_15…` (§15.1) | INV-GOV-01..04. Dane niemutowalne po snap. Zmiana solvera = nowy run. Zmiana spec = ADR. Wynik bez zatwierdzenia = nieobowiązujący. |
| 116 | ADR obowiązkowy: zmiana kanonu, kontraktu solvera, aktywacja TO-BE, zmiana normy, nowy inwariant, zmiana frozen API | **BINDING** | Governance | `SPEC_CHAPTER_15…` (§15.2) | Struktura ADR: kontekst, decyzja, alternatywy odrzucone, konsekwencje, zakres wpływu, data+autor. Z-GOV-01..03. |
| 117 | Workflow zmiany: Draft → Review → Approved → Frozen. Edycja Frozen = nowa wersja | **BINDING** | Governance | `SPEC_CHAPTER_15…` (§15.4) | Z-GOV-04: nigdy edycja in-place na FROZEN. Mapowanie na obiekty: ENM(snapshot), Case(locked), Run(FINISHED), Raport(hash), Spec(tagged). |
| 118 | Role: Author, Reviewer, Approver, Auditor. Four-eyes: Author ≠ sole Approver | **BINDING** | Governance | `SPEC_CHAPTER_15…` (§15.3) | TO-BE: implementacja ról w systemie. v1: implicit (user = all roles). |
| 119 | Zatwierdzenia: ENM(snapshot+fingerprint), Case(hash), Run(result_hash), Raport(report_hash+APPROVED) | **BINDING** | Governance | `SPEC_CHAPTER_15…` (§15.5) | Każde zatwierdzenie: autor, timestamp, nieodwracalne. |
| 120 | CI governance: PR wymaga ADR (jeśli dotyczy), regression tests, hash verification | **BINDING** | Governance + Infrastructure | `SPEC_CHAPTER_15…` (§15.7) | Decision Matrix append-only (INV-GOV-07). Spec: tagged releases. ADR: inkrementalne numery. |

**Z decyzji #115–#120 wynika (Rozdział 15 — BINDING):**
- 4 poziomy governance (DATA/COMPUTATION/SPEC/RESULT).
- ADR obowiązkowy dla zmian kanonicznych. Struktura ADR: 7 sekcji.
- Workflow: Draft → Review → Approved → Frozen (Z-GOV-04: no in-place edit on Frozen).
- Role: Author/Reviewer/Approver/Auditor. Four-eyes principle.
- CI: PR + ADR + regression.
- INV-GOV-01..08, Z-GOV-01..04.
- **DOMENA GOVERNANCE W ROZDZIALE 15 JEST ZAMKNIĘTA (v1.0).**

| 121 | 3 klasy integracji: MODEL (ENM/TypeLib/ProjectArchive), RESULT (raporty/ProofPack/porównania), PROCESS (CI/API/webhook) | **BINDING** | Infrastructure | `SPEC_CHAPTER_16…` (§16.1) | Zamknięta lista. Każda klasa z kierunkami (export/import) i formatami. |
| 122 | Formaty wymiany: JSON/JSONL/CSV/XLSX/PDF/DOCX/ZIP — wszystkie z metadanymi | **BINDING** | Infrastructure | `SPEC_CHAPTER_16…` (§16.2) | Z-INT-01: zakaz binarnych bez specyfikacji. Z-INT-02: zakaz bez metadanych. Z-INT-03: zakaz importu bez walidacji. |
| 123 | Metadane integracyjne obowiązkowe: project_id, hash_enm, spec_version, timestamp, approval_status | **BINDING** | Infrastructure | `SPEC_CHAPTER_16…` (§16.3) | INV-INT-01: eksport bez metadanych = nieprawidłowy. 9 pól obowiązkowych. |
| 124 | Eksport OSD: Approved/Frozen status, brak modyfikacji po eksporcie (Z-INT-04) | **BINDING** | Infrastructure + Governance | `SPEC_CHAPTER_16…` (§16.4) | PDF do podpisu, White Box jako dowód, zgodność IEC 60909 (golden tests), archiwizacja (ProjectArchive). |
| 125 | Import: pipeline z walidacją W1+W2, oznaczenie EXTERNAL_IMPORT, mapowanie na Type Library | **BINDING** | Infrastructure + Validation | `SPEC_CHAPTER_16…` (§16.5) | AS-IS: XlsxNetworkImporter, ProjectArchive, verify_archive_integrity(). Z-INT-05..06. |
| 126 | API: wersjonowanie (/api/v1/), breaking change = ADR + major bump, logowanie dostępu (TO-BE) | **BINDING** | Infrastructure | `SPEC_CHAPTER_16…` (§16.6) | INV-INT-06: API breaking = ADR. TO-BE: JWT/API key auth, role-based access, audit log. |

**Z decyzji #121–#126 wynika (Rozdział 16 — BINDING):**
- 3 klasy integracji (MODEL/RESULT/PROCESS).
- Formaty: JSON/JSONL/CSV/XLSX/PDF/DOCX/ZIP — wszystkie z obowiązkowymi metadanymi.
- Eksport OSD: Approved/Frozen, brak modyfikacji (Z-INT-04).
- Import: pełny pipeline z walidacją W1+W2 (Z-INT-05).
- API: wersjonowanie, security TO-BE, audit log TO-BE.
- INV-INT-01..06, Z-INT-01..06.
- **DOMENA INTEGRACJI ZEWNĘTRZNYCH W ROZDZIALE 16 JEST ZAMKNIĘTA (v1.0).**

| 127 | Wielowarstwowa piramida testowa: Unit (1200+), Integration (300+), E2E (40+), Guard (compliance) | **BINDING** | QA | `SPEC_CHAPTER_17…` (§17.1) | ~237 plików testowych, ~2117 funkcji. Piramida: Unit (core physics) → Integration (API+DB) → E2E (determinism+browser) → Guard (CI gates). Z-TST-01..03. |
| 128 | Testy numeryczne solverów: pytest.approx(abs=1e-12), parametryzacja NR/GS/FDLF, referencyjne wartości | **BINDING** | QA + Solver | `SPEC_CHAPTER_17…` (§17.2) | test_branch.py, test_short_circuit_iec60909.py (784 linii), test_power_flow_v2.py, test_ybus.py. Każdy solver z dedykowanym zestawem testów. INV-TST-01. |
| 129 | Fixtures: łańcuch db_engine(tmp_path)→db_session_factory→uow_factory→app_client, izolacja per test | **BINDING** | QA + Infrastructure | `SPEC_CHAPTER_17…` (§17.3) | conftest.py: SQLite tmp_path (izolowany per test). api/conftest.py: FastAPI TestClient + dependency override. @pytest.mark.integration. INV-TST-02. |
| 130 | Golden tests: canonical JSON/LaTeX vs zatwierdzone pliki referencyjne, aktualizacja wymaga review | **BINDING** | QA + Determinism | `SPEC_CHAPTER_17…` (§17.5) | test_sc_asymmetrical_golden.py, golden_network_sn.py (20-station SN). _canonicalize_proof(): FIXED_DOC_ID, FIXED_CREATED_AT. Workflow: FAIL→review→update→commit. INV-TST-04. |
| 131 | Guard tests CI: codenames ban, alert ban, arch guard, polish labels — 4 workflows GitHub Actions | **BINDING** | QA + CI | `SPEC_CHAPTER_17…` (§17.6, §17.8) | python-tests.yml, frontend-e2e-smoke.yml, arch-guard.yml, no-codenames-guard.yml. Wszystkie MUSZĄ przejść przed merge. INV-TST-05, INV-TST-07. |
| 132 | Frontend tests: Vitest (jsdom, --no-file-parallelism) + Playwright (chromium, sequential, data-testid) | **BINDING** | QA + Frontend | `SPEC_CHAPTER_17…` (§17.7) | 72 pliki Vitest, 3 spec Playwright. fullyParallel:false, workers:1 CI, reducedMotion:'reduce'. INV-TST-03, INV-TST-06. |
| 133 | Determinizm testów: brak random, brak shared state, sorted output, sequential CI, xfail z reason | **BINDING** | QA + Determinism | `SPEC_CHAPTER_17…` (§17.9) | Bariety: timestamps→FIXED, UUIDs→FIXED, dict→sort_keys, float→approx. xfail(strict=False) dla PDF binary. INV-TST-08..10. |

**Z decyzji #127–#133 wynika (Rozdział 17 — BINDING):**
- Piramida testowa: Unit (1200+) → Integration (300+) → E2E (40+) → Guard (CI gates).
- ~237 plików, ~2117 funkcji testowych. Testy NIE zawierają physics (Z-TST-01).
- Fixtures: izolowane per test (SQLite tmp_path), łańcuch db_engine→uow_factory→app_client.
- Golden tests: canonical comparison, aktualizacja wymaga review (INV-TST-04).
- 4 CI workflows: pytest, Playwright smoke, arch guard, codenames guard — ALL must pass.
- Determinizm: brak random, sorted output, sequential CI, xfail z reason.
- INV-TST-01..10, Z-TST-01..03.
- **DOMENA TESTÓW SYSTEMOWYCH W ROZDZIALE 17 JEST ZAMKNIĘTA (v1.0).**

| 134 | Architektura wdrożeniowa: 6 usług Docker (backend, frontend, PostgreSQL, MongoDB, Redis, Celery) | **BINDING** | Infrastructure | `SPEC_CHAPTER_18…` (§18.1) | docker-compose.yml: python:3.11-slim, node:20-alpine, postgres:16-alpine, mongo:7.0, redis:7-alpine. Volumes: postgres_data, mongodb_data, redis_data. Network: mv-design-network (bridge). INV-PRD-01. |
| 135 | Konfiguracja ENV: SECRET_KEY, DATABASE_URL, REDIS_URL krytyczne; DEBUG=false w produkcji | **BINDING** | Infrastructure | `SPEC_CHAPTER_18…` (§18.2) | Z-PRD-01: zakaz domyślnego SECRET_KEY. Z-PRD-02: zakaz DEBUG=true. Z-PRD-03: zakaz commit credentials. |
| 136 | Baza danych: 9 migracji SQL, init_db() idempotentne, indeksy deterministyczne | **BINDING** | Infrastructure | `SPEC_CHAPTER_18…` (§18.3) | 001_initial→009_result_status. UNIQUE constraint na (project_id, case_id, analysis_type, input_hash). INV-PRD-02. |
| 137 | Celery: json serializer, task_acks_late=True, Europe/Warsaw, worker_prefetch_multiplier=1 | **BINDING** | Infrastructure | `SPEC_CHAPTER_18…` (§18.4) | Z-PRD-04: zakaz pickle. Z-PRD-05: zakaz task_acks_late=False. INV-PRD-03. |
| 138 | Logging: structured (timestamp+level+name+message), RequestIdMiddleware (X-Request-Id), 3 exception handlers | **BINDING** | Infrastructure | `SPEC_CHAPTER_18…` (§18.5) | Severity routing: 5xx→ERROR, 4xx→WARNING, 2xx→INFO. Full traceback z rid=. INV-PRD-04, INV-PRD-09. |
| 139 | Health checks 3-tier: /health (basic), /ready (readiness), /api/health (extended: DB+solver+uptime) | **BINDING** | Infrastructure | `SPEC_CHAPTER_18…` (§18.5.4) | Status: "ok" (all healthy) / "degraded" (component down). Version 4.0.0. Solvers: sc_iec60909, pf_newton, pf_gauss_seidel, pf_fast_decoupled. INV-PRD-04. |
| 140 | GO-LIVE Checklist: 14 kategorii (Core→Guards), AS-IS/TO-BE oznaczone, smoke test obowiązkowy | **BINDING** | Operations | `SPEC_CHAPTER_18…` (§18.11) | docs/GO-LIVE-CHECKLIST.md. Smoke: scripts/smoke_local.sh (6 checks). TO-BE: backup, rollback, auth/RBAC. INV-PRD-07, INV-PRD-08. |

**Z decyzji #134–#140 wynika (Rozdział 18 — BINDING):**
- 6 usług Docker (backend, frontend, PostgreSQL, MongoDB, Redis, Celery worker).
- SECRET_KEY, DATABASE_URL, REDIS_URL krytyczne; zakaz domyślnych wartości (Z-PRD-01..03).
- 9 migracji SQL, init_db() idempotentne, connection pooling TO-BE.
- Celery: json-only serializer, task_acks_late=True, Europe/Warsaw TZ.
- Logging: structured + request-ID correlation + severity routing.
- Health checks 3-tier: basic, readiness, extended (DB+solver+uptime).
- GO-LIVE Checklist: 14 kategorii, smoke test obowiązkowy post-deploy.
- INV-PRD-01..10, Z-PRD-01..07.
- **DOMENA WDROŻENIA PRODUKCYJNEGO W ROZDZIALE 18 JEST ZAMKNIĘTA (v1.0).**
- **SPECYFIKACJA ZAMKNIĘTA — ROZDZIAŁY 1–18 KOMPLETNE. 140 DECYZJI WIĄŻĄCYCH.**

| 141 | Zmiana ProtectionConfig kaskadowo unieważnia WSZYSTKIE powiązane ProtectionAnalysisRun (result_status→OUTDATED) | **BINDING** | Protection + Study Cases | `SPEC_GAP_SUPPLEMENT…` (§G1.2) | AS-IS: Case markowany OUTDATED, ALE brak kaskady do runów. TO-BE: kaskada invalidate_runs_for_case(case_id). INV-GAP1-01. Z-GAP1-01..02. |
| 142 | White Box nowego runu MUSI zawierać: previous/current config fingerprint, config_change_detected, invalidated_run_ids | **BINDING** | Protection + White Box | `SPEC_GAP_SUPPLEMENT…` (§G1.4) | Pełna audytowalność zmiany nastaw. Zgodne z R14 (hash chain). INV-GAP1-03. |
| 143 | ProtectionAnalysisRun z result_status=OUTDATED NIE MOŻE mieć statusu APPROVED | **BINDING** | Protection + Governance | `SPEC_GAP_SUPPLEMENT…` (§G1.5–§G1.6) | Zgodne z R15 §15.5 (zatwierdzenia). INV-GAP1-02. |
| 144 | WhiteBoxEventRegistry — kanoniczny, globalny rejestr klas zdarzeń White Box (singleton, niezależny od domeny) | **BINDING** | White Box (Cross-cutting) | `SPEC_GAP_SUPPLEMENT…` (§G2.2) | Rozszerzalny wyłącznie przez ADR. Protection korzysta z rejestru (nie definiuje lokalnie). INV-GAP2-01, Z-GAP2-01..03. |
| 145 | Taksonomia zdarzeń v1: event_domain (SOLVER/PROTECTION/VALIDATION/GOVERNANCE) × event_class (COMPUTATIONAL/TECHNOLOGICAL/NETWORK/SYSTEM) × event_scope (LOCAL_ELEMENT/LOCAL_DEVICE/NETWORK_SECTION/GLOBAL) × severity (TRACE/INFO/WARNING/ERROR) | **BINDING** | White Box (Cross-cutting) | `SPEC_GAP_SUPPLEMENT…` (§G2.3) | v1: opcjonalne pola (backward compat). v2: wymagane (po ADR). Protection event_class/scope z §9.A.1 = podzbiór rejestru. INV-GAP2-02..03. |
| 146 | Istniejące struktury trace (WhiteBoxStep, PowerFlowTrace, ShortCircuitResult) TO-BE: + opcjonalne pola event_domain/class/scope/severity | **BINDING** | Solver + White Box | `SPEC_GAP_SUPPLEMENT…` (§G2.5) | Backward compatible. Stają się wymagane w v2. INV-GAP2-05. |
| 147 | OperatingCase = byt LEGACY, NIE rozwijany, NIE dla nowych analiz; StudyCase = JEDYNY kanon | **BINDING** | Study Cases + Migration | `SPEC_GAP_SUPPLEMENT…` (§G3.2) | AS-IS: dual-model (OperatingCase dla solverów, StudyCase dla config). TO-BE: unifikacja na StudyCase. INV-GAP3-01..02, Z-GAP3-01..02. |
| 148 | Migracja OperatingCase→StudyCase: 3 fazy (M1: koegzystencja, M2: przekierowanie solverów, M3: usunięcie) | **BINDING** | Study Cases + Infrastructure | `SPEC_GAP_SUPPLEMENT…` (§G3.3) | Każda faza wymaga ADR. M2: AnalysisRun.case_id → study_cases. M3: archiwizacja operating_cases. INV-GAP3-03. |
| 149 | W fazie M1: solver execution via OperatingCase (kompatybilność), nowe features wyłącznie w StudyCase | **BINDING** | Study Cases | `SPEC_GAP_SUPPLEMENT…` (§G3.4) | Nowe typy analiz MUSZĄ korzystać z StudyCase. Z-GAP3-01..03. INV-GAP3-04..05. |

**Z decyzji #141–#149 wynika (Suplement GAP — BINDING):**
- **GAP 1:** Kaskadowa invalidacja ProtectionAnalysisRun przy zmianie ProtectionConfig. OUTDATED run ≠ APPROVED.
- **GAP 2:** WhiteBoxEventRegistry jako singleton specyfikacyjny. Taksonomia 4-wymiarowa (domain × class × scope × severity). v1 opcjonalne, v2 wymagane.
- **GAP 3:** OperatingCase = LEGACY (brak rozwoju). StudyCase = jedyny kanon. Migracja 3-fazowa (M1→M2→M3, każda wymaga ADR).
- Brak konfliktów z decyzjami #1–#140.
- INV-GAP1-01..03, INV-GAP2-01..05, INV-GAP3-01..05. Z-GAP1-01..02, Z-GAP2-01..03, Z-GAP3-01..03.
- **LUKI KONTRAKTOWE GAP 1–3 DOMKNIĘTE.**

---

**KONIEC AUDYTU — 149 DECYZJI WIĄŻĄCYCH**

