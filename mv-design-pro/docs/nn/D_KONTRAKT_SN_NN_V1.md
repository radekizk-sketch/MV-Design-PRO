# D — KONTRAKT DANYCH SN↔nN (V1, WIĄŻĄCY)

**Cel:** gwarancja ONE ELECTRICAL SOURCE OF TRUTH — strona nN jest zasilana danymi strony SN
przez transformator BEZ ręcznego przepisywania; wpływ działa w obu kierunkach.

## 1. Element wspólny: transformator

Transformator stacji (`enm.models.Transformer`, `hv_bus_ref`/`lv_bus_ref`) jest **jedynym
złączem** SN↔nN. Kontrakt:

1. **Źródłem parametrów TR jest wyłącznie katalog `TRAFO_SN_NN`** (materializacja
   `rated_power_mva, voltage_hv_kv, voltage_lv_kv, uk_percent, p0_kw, pk_kw, i0_percent,
   vector_group`) + instancyjne `tap_changer`/`lv_neutral`.
2. **Zakaz ponownego wprowadzania** Sn/uk/przekładni/grupy/zaczepu w JAKIMKOLWIEK ekranie,
   solverze czy raporcie nN. Każdy konsument czyta z ENM (wzorzec już zrealizowany:
   `application/analyses/fault_loop/service.py` czyta TR z ENM).
3. Napięcie szyny nN = `Transformer.ulv_kv` z katalogu (`_transformer_lv_voltage_kv`,
   `application/station_templates/apply.py:464-485`) — jedyne źródło `voltageLevel` strony nN.

## 2. Kierunek SN → nN (co automatycznie wpływa na obliczenia nN)

| Zmiana po stronie SN | Mechanizm propagacji | Wyniki nN unieważnione |
|---|---|---|
| Sn, uk, Pk, grupa połączeń TR | ENM `input_hash` (parametry TR w projekcji hash) → dedup dispatchu | Ik nN, ΔU, SWZ, Zs, selektywność, dobór aparatów, loading TR |
| Zaczep/OLTC | `switching/case`-zależnie: pozycja zaczepu w wejściu PF; SC używa przekładni znamionowej + K_T (poprawne wg IEC 60909) | U/ΔU nN (PF), profil U |
| Poziom zwarciowy SN (Sk″ źródła, impedancje sieci SN) | pełny Zbus jednego grafu — upstream Thevenin wchodzi do Ik nN przez sieć, nie przez przepisany parametr | Ik max/min nN, Icu check, SWZ (Ik_min rośnie/maleje) |
| Topologia SN (przełączenia, nowy odcinek) | `semantic_hash`/`switching_snapshot_hash` | jak wyżej |
| `lv_neutral` (uziemienie punktu N) | wejście pętli zwarcia + Z0 (grupa połączeń) | Zs, SWZ, Ik1 nN |

**Zakaz:** solver nN liczący „od idealnego transformatora". Pętla zwarcia MUSI dostawać
`upstream_impedance` z grafu SN (ekwiwalent Thevenina w punkcie HV transformatora) — dzisiejsze
pominięcie (silne źródło ∞) jest częścią luki P0.7, nie kontraktem.

## 3. Kierunek nN → SN

| Zmiana po stronie nN | Mechanizm | Wpływ na SN |
|---|---|---|
| Odbiory nN (P/Q, ZIP) | agregacja per szyna w `enm/mapping.py` → PF wspólnego grafu | P/Q i loading TR, rozpływ SN, profil U SN, straty |
| PV/BESS nN (generacja, Q(U)) | `InverterControl` w PF; znak mocy nieograniczony | reverse power TR→SN, wzrost napięcia, bilans |
| Kompensacja nN (P1) | `ShuntCapacitor` na szynie nN | cosφ w punkcie TR, odciążenie TR |
| Wkłady zwarciowe źródeł nN | transfer przez Zbus z korektą przekładni (`_inverter_transfer_factors`, V12K-184) | Ik na szynach SN |

## 4. Współczynniki obliczeniowe per pasmo napięcia (IEC 60909 Tab. 1)

Kontrakt: **c dobierane per WĘZEŁ ZWARCIA** z pasma napięcia węzła, nie per studium:
- pasmo nN (≤1 kV): c_max=1,05 (system 230/400 V ±6%), c_min=0,95;
- pasmo SN/WN: c_max=1,10, c_min=1,00.
Źródło logiki: `TransformerBranch.get_voltage_factor_c_max/min` — przenoszone do wspólnego
helpera używanego przez `short_circuit_binding` i `solver_input/builder`. `StudyCaseConfig.
c_factor_max/min` przechodzą w tryb override (jawny, logowany w trace) — domyślnie AUTO per
pasmo. Scenariusz MIN dodatkowo stosuje korektę temperaturową R przewodów
(R_θ = R20·[1+0,004·(θ_k−20°C)], θ_k z katalogu przewodu) w budowie wejścia — rdzeń FROZEN
nietknięty.

## 5. Przypadki obliczeniowe (Study Case) — bez zmian mechanizmu

Przypadek przechowuje WYŁĄCZNIE konfigurację (stany łączników, obciążenia/generację per
scenariusz, tap, temperatury, tryb MIN/MAX) — nigdy topologię. Minimalny zestaw przypadków nN
(§49 zlecenia): NORMAL_MAX_LOAD, NORMAL_MIN_LOAD, PV_MAX, BESS_CHARGE, BESS_DISCHARGE,
GENERATOR_ISLAND, MAINTENANCE, SHORT_CIRCUIT_MAX, SHORT_CIRCUIT_MIN — realizowane jako
przypadki studium na wspólnym modelu. GENERATOR_ISLAND: źródło SN odłączone stanem łącznika
(LV-INV-09 — impedancja systemu SN nie uczestniczy).

**Dyscyplina MIN/MAX (§50):** każdy warunek normatywny deklaruje przypadek decydujący:
zdolność wyłączalna→SHORT_CIRCUIT_MAX; SWZ/czułość→SHORT_CIRCUIT_MIN (+wariant GENERATOR_ISLAND);
ΔU→NORMAL_MAX_LOAD; wzrost U→PV_MAX/BESS_DISCHARGE. UI wyświetla „który przypadek decyduje".

## 6. Rewizje i inwalidacja

1. Operacje nN przechodzą przez `execute_domain_operation` → `set_enm` → bump `ENMHeader.
   revision` + łańcuch 5 hashy → `compute_dispatch_input_hash` wykrywa nieaktualność
   automatycznie (mechanizm istniejący).
2. **Domknięcie N-D (P0.1):** dispatcher operacji domenowych wywołuje `ResultInvalidator`
   (flip `StudyCase.result_status` → OUTDATED) — dziś robi to tylko legacy wizard; bez tego
   plakietki świeżości UI kłamią po edycji nN.
3. Impact analysis (§59–60 zlecenia): zakres inwalidacji wg osi hashy — zmiana kabla nN zmienia
   `input_hash` (unieważnia PF/SC/SWZ), NIE zmienia `semantic_hash` konfiguracji stacji SN;
   prezentacja „co unieważni ta zmiana" = odczyt różnicy osi (P1).

## 7. Wyniki

Wyniki nN wchodzą w **ResultSet v1 bez zmiany kontraktu**: `analysis_type` np.
`"FAULT_LOOP_NN"`, `"SWZ_NN"`; `ElementResultV1` per `ref_id` (kind `bus`/`branch`/`load` —
istniejące); metryki overlay np. `ZLOOP_OHM`, `IK1_MIN_A`, `SWZ_STATUS`. Każdy wynik niesie
`runId + revisionId` (LV-INV-10). Pętla IEC 60364 zostaje przepięta z osieroconego
`AnalysisRunEnvelope` na ResultSet v1 (P0.7).

## 8. INWARIANTY LV-INV (egzekwowane walidatorem/testami/guardami)

| ID | Inwariant | Egzekucja |
|---|---|---|
| LV-INV-01 | każdy aktywny odbiór ma ciągłą ścieżkę do źródła | E060 + test topologii |
| LV-INV-02 | każdy przewód ma poziom napięcia (bus-y końcowe w jednym paśmie) | E020/E062 |
| LV-INV-03 | zabezpieczenie fizycznie umieszczone w konkretnym torze | E064 |
| LV-INV-04 | SWZ liczy na topologii AKTYWNEGO przypadku (stany łączników) | wejście solvera = graf przypadku; test |
| LV-INV-05 | Ik nN uwzględnia upstream SN + TR | jeden Zbus; test golden MV+LV |
| LV-INV-06 | zmiana uk TR unieważnia zależne wyniki nN | input_hash; test inwalidacji |
| LV-INV-07 | DER może powodować reverse flow | PF bez ograniczeń znaku; test + etykieta wyniku |
| LV-INV-08 | otwarty łącznik przerywa tor | `status="open"` filtrowany w adjacency (istnieje); test nN |
| LV-INV-09 | tryb wyspy: system SN nie jest aktywnym źródłem | przypadek GENERATOR_ISLAND; test |
| LV-INV-10 | każdy wynik ma runId+revisionId | ResultSet v1 + provenance |
| LV-INV-11 | zakaz łączenia poziomów napięcia bez transformatora | E020 (istnieje) + E062 |
| LV-INV-12 | UI i solver używają tego samego grafu nN (zero drugiej reprezentacji) | wygaszenie `nn_field_specs` jako źródła; guard grep |
