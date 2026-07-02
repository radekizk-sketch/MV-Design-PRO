# KROK 2 — Recon ENM dla źródeł OZE (krok 0) + Runda 2a (PV G1-G3)

Recon przed budową archetypów źródeł OZE. Zasada: buduj z modelu lub rozszerz, nigdy nie maluj
nad pustką. Solver READ-ONLY (B-01).

## Co ENM/solver JUŻ modeluje (buduj z tego)

| Pojęcie OZE | Model ENM / solver | Plik |
|---|---|---|
| Falownik PV/BESS/FW (IBG) | `NNSourceType.{PV,BESS,FW}_INVERTER`, `NNSourceFieldSpec.source_field_kind ∈ {PV,BESS,AGREGAT,UPS,FW}`, `AddConverterSourcePayload(source_technology, control_mode, cos_phi)` | `enm/domain_ops_models.py` |
| Parametry źródła | `MaterializedSourceParams(sn_mva, pmax_mw, un_kv, k_sc, cos_phi_min/max, e_kwh)` | `enm/domain_ops_models.py` |
| Agregat (maszyna) | `GensetSpec(rated_power_kw, power_factor, operation_mode, fuel_type)` | `enm/domain_ops_models.py` |
| Źródło sieciowe SN | `AddGridSourceSNPayload(sk3_mva, ik3_ka, rx_ratio)` | `enm/domain_ops_models.py` |
| **Wkład zwarciowy IBG** | `InverterSource(node_id, in_rated_a, k_sc, contributes_negative/zero_sequence)` → `ik_sc_a = k_sc·in_rated_a` (źródło prądowe OGRANICZONE, IEC 60909-0:2016 §6.7) | `network_model/core/inverter.py` |
| Wkład IBG (solver) | `graph.add_inverter_source()` / `get_inverter_sources()` → `_compute_inverter_contribution()` sumuje ograniczony prąd | `solvers/short_circuit_iec60909.py:462` |
| **Wkład maszyny** (synchr./asynchr.) | `core/generator.py` (`k_sc`, `ik_sc_a`, `get_ik_sc_a(voltage_kv)`) — pełny model maszynowy, ŚCIEŻKA ODRĘBNA od falownika | `network_model/core/generator.py` |
| Bay SC contribution | `BayShortCircuitSourceContribution(source_kind ∈ {GPZ,TRANSFORMATOR,PV,BESS,FW,INNE}, direction, ikss_ka)` | `enm/models.py:1057` |
| Pole/generator źródłowy | `BayBaseModel.bay_role ∈ {PV_SN,BESS_SN,FW_SN}`; `BayPrimaryDevice.kind ∈ {GENERATOR_PV/BESS/FW, PCS, BATTERY}` | `enm/models.py` |

`NodeType` = SLACK/PQ/PV (rozpływ). Falownik/maszyna NIE są węzłami — to osobne źródła wkładu zwarciowego.

## Dowód rozróżnienia wkładu (gate J) — zweryfikowany probem na zamrożonym solverze

Graf GPZ → linia SN → szyna SN → trafo SN/nN → szyna nN 0,4 kV, `ShortCircuitIEC60909Solver`:
- **bez falownika:** nN Ik'' = **15 996 A**
- **z `InverterSource`** (250 kVA, k_sc=1,2 → I_rated 360,8 A): Ik'' = **16 429 A** (Δ = **+433 A** = dokładnie k_sc·I_rated)

IBG dodaje OGRANICZONY prąd (źródło prądowe §6.7), NIE pełny wkład maszynowy. Maszyna synchroniczna
(ścieżka `generator.py` / pełna Thevenin Z) dodałaby wkład podprzejściowy istotnie większy. Rozróżnienie
jest REALNE i solver-derived — gate J ma pokrycie fizyczne.

## Runda 2a — PV (G1-G3): wartości zweryfikowane (zamrożony NR + IEC 60909)

| Arch | Topologia | PCC | Tryb NC | U PCC | Eksport (IN) | Ik''max PCC | IBG wkład | ≤Icw | hierarchia |
|---|---|---|---|---|---|---|---|---|---|
| **G1** PV prosumencka nN | GPZ→SN→trafo→nN+PV | NN_BUS | A / cosφ=const | 0,400 kV (1,00005 pu) | **−35 kW reverse** | 16,08 kA (nN) | 87 A | ✓ | ✓ 55≥50≥50≥45 |
| **G2** Farma PV nN+trafo | GPZ→PCC_SN→trafo→nN kolektor+PV | PCC_SN | C / Q(U) | 15,03 kV | **−0,89 MW reverse** | 11,18 kA (SN) | 1,72 kA | ✓ (nN board 31,5 kA) | ✓ 1100≥990≥990≥900 |
| **G3** Farma PV SN bezpośr. | GPZ→PCC_SN→blok PV SN | PCC_SN | C / cosφ(P) | 15,04 kV | **−1,35 MW reverse** | 9,54 kA (SN) | 69 A | ✓ | ✓ 1650≥1500≥1500≥1350 |

Generacja = przepływ ZWROTNY (reverse), kierunek SOLVER-SIGNED (nie zakładany). IBG oznaczony
`is_synchronous_machine=False` na każdej szynie (gate J). Hierarchia mocy walidowana (gate H).
Mechanizm ≤Icw realny — G2 nN przy domyślnym board 25 kA dawał FAIL 26,5>25 (poprawnie); board 31,5 kA
(standardowy dla kolektora 1 MVA) → PASS. Weryfikacja nie jest sfałszowana.

## Luki (do rozszerzenia gdy potrzebne, additive/determinism-safe)
- `machine_type ∈ {IBG, SYNCHRONOUS, ASYNCHRONOUS}` jako first-class atrybut źródła — dziś wynika z typu
  (inverter vs generator); companiony OZE niosą go jawnie. Do dodania na modelu gdy oś T tego wymaga
  (jak `cell_type`).
- Maszyny wirujące (G10-G14, Runda 2d) użyją ścieżki `generator.py` — krytyczny test wkładu synchr.≠IBG.

## Plan rund (gate B-02 po każdej rodzinie)
2a PV (G1-G3) ← TERAZ (dane gotowe) · 2b BESS+hybryda (G4-G7) · 2c wiatr (G8-G9) · 2d wirujące (G10-G14).

## Recon v2 (po SPEC RODZIN OZE — anty-zmyślanie, idiom stacji)

Każdy element rodziny PRZYPIĘTY do ENM (source_ref), nie do wyobraźni:

| Element idiomu | Model ENM (source_ref) | Plik |
|---|---|---|
| **Typ maszyny** (oś 5) | `Generator.gen_type ∈ {synchronous, pv_inverter, wind_inverter, fw_pmsg, fw_dfig, fw_scig, bess}` — IBG vs synchr. vs asynchr. **first-class** | `enm/models.py:337` |
| **Granica/miejsce przyłączenia** (oś 6) | `Generator.connection_variant ∈ {LV_BEHIND_STATION_TRANSFORMER, DEDICATED_MV_CONNECTION, nn_side, block_transformer, SOURCE_CONNECTION_STATION}` + walidator spójności (station_ref/blocking_transformer_ref) | `enm/models.py:359` |
| **Transformator blokowy/podwyższający** | `Generator.blocking_transformer_ref` (wymagany dla block_transformer) | `enm/models.py:380` |
| **Pole źródłowe** | `BayBaseModel.bay_role ∈ {PV_SN, BESS_SN, FW_SN}` | `enm/models.py:1014` |
| **Pole przyłączeniowe** (ochrona interfejsowa TU) | `bay_role = LINIA_OUT` (patrzy w sieć) + `BayProtectionControlUnit.functions` | `enm/models.py` |
| **Pomiar na granicy SN** | `Measurement(purpose ∈ {protection, metering, combined})`; pole SDM-V/SDM-C | `enm/models.py:457` |
| **Ochrona (funkcje)** | `ProtectionFunctionState.code` (ANSI/IEC) — zestaw wg typu maszyny | `enm/models.py:861` |

**Mapowanie granica → wariant ENEA (oś 6):**
- G-ZALICZNIK → `LV_BEHIND_STATION_TRANSFORMER` / `nn_side` (prosument za trafo odbiorczym)
- G-GPZ / G-ZKSN / G-SŁUP / G-ZŁĄCZE-POM → `DEDICATED_MV_CONNECTION` (dedykowane przyłącze SN; głowica/ZKSN/słup/pomiar)
- Trafo podwyższający → `block_transformer` (+ `blocking_transformer_ref`)

**Wniosek:** idiom stacji (pole źródłowe + pole przyłączeniowe + szyna + znacznik granicy + ochrona
interfejsowa na polu przyłączeniowym) jest w PEŁNI pokryty modelem. Każdy element niesie `source_ref`
(ENM ścieżka / katalog / solver). Granica ∈ 5 wariantów (nie wymyślona). Model zwarciowy = `gen_type`
(IBG `inverter.py` vs synchr./asynchr. `generator.py`). Zero luzu do zmyślania.

**Luki (rozszerzenie additive, gdy potrzebne):** `machine_type ∈ {IBG,SYNCHRONOUS,ASYNCHRONOUS}` jako
etykieta prezentacyjna wyprowadzana z `gen_type` (IBG = *_inverter/bess/fw_*; SYNCHRONOUS = synchronous;
ASYNCHRONOUS = fw_scig / asynchroniczny hydro). Companiony OZE niosą ją jawnie + `source_ref` na elemencie.

