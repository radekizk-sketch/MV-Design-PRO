# H — PLAN IMPLEMENTACJI PLIK-PO-PLIKU (P0 → P1 → P2)

Mapowanie na P0.1–P0.12 zlecenia (§72). Każdy pakiet = pełny łańcuch DoD (§79):
MODEL → VALIDATION → SOLVER → RESULT → TRACE → SLD → REVISION → DOCUMENT → TEST.
Kolejność wewnątrz P0 jest zależnościowa — nie podlega zrównolegleniu bez zachowania bramek.

## P0.0 — Przedpole: dług blokujący (Zero-Debt, przed funkcjami)

| Krok | Pliki | Treść |
|---|---|---|
| Archiwum ENM (N-D1/G-02) | `application/project_archive/service.py`, `domain/project_archive.py` (+`EnmSection`), testy `tests/application/project_archive/` | serializacja pełnego ENM per case (z `.enm_store`), fingerprint sekcji, round-trip bajt-deterministyczny |
| Usunięcie fantomu kreatora (N-D3) | `frontend/src/ui/network-build/station-wizard-v2/**` (delete), `ui2/legacy/LegacyWarsztat.tsx`, `legacyRegistry.ts` | usunięcie trasy `#kreator-stacji-v2` i plików (w tym hardcoded katalogu TS) |
| Porządek fault-loop (N-D2) | `application/analysis_run/service.py` (392-404 + walidacja 822-897 + typy), `domain/analysis_run.py`, `application/analyses/fault_loop/envelope_adapter.py`, `frontend/src/ui/sld/v2/fault-loop/**` | usunięcie martwego stubu `fault_loop_nn` + osieroconych: adapter zostaje TYLKO jeśli wpięty w P0.7, panel usunięty |
| Guard operacji (N-D8) | `scripts/canonical_ops_guard.py`, `domain/canonical_operations.py` | rejestracja 9 brakujących ops (w tym `append_station_on_endpoint`), usunięcie 2 wpisów bez handlera, guard dwukierunkowy twardy |
| Guard ui2 (N-D9) | `scripts/forbidden_ui_terms_guard.py` | `SCAN_DIRS += ui2` + naprawa ewentualnych trafień |
| Korekta stale docs (N-D12) | `CLAUDE.md` | usunięcie widm: `fault_scenario_executor.py`, `proof-inspector/`, `results-browser/` itd. |

**Bramka:** pełna regresja backend+frontend zielona; guardy zielone; FROZEN nietknięte.

## P0.1 — Model grafowy nN + operacje (P0.1, P0.2 zlecenia)

| Warstwa | Pliki | Treść |
|---|---|---|
| Model | `enm/models.py` (`NnSection`, `station_type+="rozdzielnica_nn"`), `enm/hash.py` (projekcje), `enm/element_kind.py` | C §2.1 |
| Operacje | `enm/domain_operations_v2.py` (+handlery `add_nn_cable_segment`, `add_nn_distribution_board`, `add_nn_switch_device`, `split_nn_segment`, `merge_nn_segments`, `add_nn_section_coupler`, `set_nn_cable_laying_conditions`, `remove_nn_element`, `copy_nn_feeder`), `domain/canonical_operations.py` (kategoria `NN_NETWORK`), `backend/schemas/*_schema.json` | C §4.1; catalog-binding obowiązkowy |
| Migracja | `enm/domain_operations_v2.py` (promocja `nn_field_specs` → `SwitchBranch`; `add_nn_load` za aparat) + migrator odczytu w `enm/store.py` | C §4.2, LV-INV-12 |
| Walidator | `enm/validator.py` (E060–E064, W060, W062) | C §5 |
| Mapping | `enm/mapping.py` (gałęzie nN → NetworkGraph; KABEL_NN w materializacji impedancji) | jedna prawda grafu |
| Inwalidacja | dispatcher `execute_domain_operation` → `ResultInvalidator` | D §6.2 |
| Testy | `tests/enm/test_nn_topology_ops.py`, `tests/enm/test_nn_validator.py`, aktualizacja `tests/enm/test_ports.py` | I §2 |

## P0.2 — Katalog nN (rozszerzenia schematów + dane)

| Pliki | Treść |
|---|---|
| `network_model/catalog/types.py` | pola addytywne `LVCableType`/`LVApparatusType` (C §2.2), klasy `LVBreakerMcbType`, `LVFuseLinkType`; namespace'y `APARAT_NN_MCB`, `WKLADKA_NN`; kontrakty materializacji (breaking_capacity/icu wchodzą do solver_fields) |
| `network_model/catalog/mv_auxiliary_catalog.py` (lub nowy `lv_catalog.py`) | uzupełnienie 17 kabli o r0/x0/Ith/Jth/temperatury/żyłę powrotną (dane producenta z proweniencją); seed MCB (rodziny B/C/D 6–125 A); seed wkładek gG (ratingi; bramki po G-D2) |
| `network_model/catalog/lv_ampacity_iec60364_5_52.py` (NOWY, danych) | zestawy współczynników z proweniencją (G-D1); struktura + „warunki katalogowe" działa od razu |
| `api/catalog.py` | trasy nowych namespace'ów (wzorzec `/lv-cable-types`) |
| Testy | `tests/network_model/test_lv_catalog.py`; guardy katalogu przechodzą automatycznie |

## P0.3 — Integracja TR / zwarcia nN (P0.3, P0.6 zlecenia)

| Pliki | Treść |
|---|---|
| `network_model/core/voltage_factor.py` (NOWY, mały) | `c_for_node(voltage_kv, scenario)` — Tabela 1 IEC 60909 (przeniesienie logiki z `TransformerBranch`, jedna prawda) |
| `application/solvers/short_circuit_binding.py` | c per węzeł zwarcia + tryb MIN/MAX (czyta `c_factor_min`); override jawny z trace |
| `solver_input/builder.py`, `solver_input/contracts.py` | pole scenariusza + c per pasmo w payload |
| Dekoracja MIN | `enm/mapping.py`/builder: R_θ dla gałęzi w scenariuszu MIN (θ z katalogu; G-04) — **rdzeń FROZEN nietknięty** |
| `application/analysis_dispatch/` + `domain/analysis_kind.py` | `SHORT_CIRCUIT_MIN` jako wariant wejścia (lub parametr scenariusza w input_hash) |
| `application/eligibility_service.py` | wpisy dla biegów nN |
| Testy | golden **MV+LV**: sieć GPZ→SN→TR 630 kVA→szyna nN→kable nN; asercje Ik″max/min na szynie i końcu obwodu (wartości ręcznie policzone z IEC 60909); reuse `golden_network_terrain` + nowy fixture; test LV-INV-05/06 |

## P0.4 — Rozpływ nN (P0.4, P0.5 zlecenia)

| Pliki | Treść |
|---|---|
| brak zmian solverów | NR/GS/FD + `_base_scale` działają — wymagany DOWÓD testowy |
| `tests/network_model/solvers/test_power_flow_lv.py` (NOWY) | zbieżność na promieniowym feederze 0,4 kV z R/X≥1 (20 odcinków szeregowo), MV+LV w jednym modelu, reverse flow od PV nN; parytet NR/GS/FD; w razie problemów zbieżności → decyzja o wpięciu BFS (eskalacja, nie obejście) |
| `analysis/voltage_profile/` | dekompozycja ΔU per odcinek wzdłuż ścieżki (interpretacja z PF: ΔU_i=U_i−U_{i+1}), najgorsza ścieżka auto | 
| Wynik | etykieta reverse-flow w ResultSet (pole pochodne, nie fabrykowane) |

## P0.5 — Iz′, ΔU-dowód, I²t (P0.8 zlecenia — dobór przewodu, część obliczeniowa)

| Pliki | Treść |
|---|---|
| `network_model/solvers/cable_ampacity_derating.py` | rozszerzenie o zestawy nN (G-D1) + wejście z `LVCableType`+`laying_conditions` |
| `application/analyses/wytrzymalosc_cieplna_przewodow.py` | przebieg gałęzi nN (Ith/Jth z KABEL_NN po P0.2); czas z krzywej aparatu nN (po P0.9) — do tego czasu jawne źródło „założenie przypadku" |
| `application/proof_engine/proof_generator.py:2112-2116`, `packs/vdrop.py` | multi-segment VDROP + konsumpcja wyników `cable_voltage_drop`/PF (likwidacja drugiej formuły — N-D6) + ZIP builder + API + wpięcie UI |
| Testy | wartości referencyjne Iz′ (ręcznie z tablic), ΔU łańcucha 3-odcinkowego, I²t graniczny |

## P0.6 — Pętla zwarcia z grafu + SWZ (P0.7 zlecenia) — **serce modułu**

| Pliki | Treść |
|---|---|
| `network_model/solvers/fault_loop_builder.py` | P0.5b: ekstrakcja trasy z grafu (BFS od punktu do TR), R/X żyły fazowej (suma odcinków, n_parallel) + żyły powrotnej PE/PEN z KABEL_NN wg `nn_earthing_system`; upstream Thevenin z grafu SN (Zk w punkcie HV z istniejącego Zbus) |
| `application/analyses/fault_loop/service.py` | rozszerzenie: pętla w DOWOLNYM punkcie nN + „najdalszy punkt obwodu" per odpływ; wynik do ResultSet v1 (koniec `AnalysisRunEnvelope`-only) |
| `application/analyses/swz/` (NOWY pakiet) | tabela czasów (G-D3), Ia z krzywej aparatu przy t_wym (P0.9), werdykt 3-stanowy + dowód liczbowy; wariant przypadku (TR/agregat) |
| `api/enm.py` / router analiz | endpointy: pętla per punkt, SWZ per obwód/heatmapa |
| Test krzyżowy | Ik1 z pętli vs Ik1 z IEC 60909 (Z0 Dyn11) na tej samej sieci — spójność rzędu wartości i przyczyny różnic udokumentowane w trace |

## P0.7 — Krzywe aparatów nN + jedna ścieżka krzywych (P0.9 zlecenia — dobór zabezpieczeń)

| Pliki | Treść |
|---|---|
| Scalenie N-D4 | `network_model/solvers/protection_iec60255.py` zostaje JEDYNĄ fizyką krzywych; `protection/curves/{iec,ieee}_curves.py` przepięte na solver (thin re-export) albo odwrotnie — decyzja: fizyka w `network_model/solvers/` (warstwa solvera), `protection/curves` = adapter |
| `network_model/solvers/protection_lv_curves.py` (NOWY) | rodziny `MCB_THERMAL_MAGNETIC` (G-D4), `MCCB_ELECTRONIC` (Ir/Isd/Ii/tr/tsd), `FUSE_GG` (G-D2), pasma tolerancji; White Box |
| `application/analyses/protection/` | fantom FUSE → jawny błąd do czasu danych (N-D5); wariant nN `czas_wylaczenia_galezi` |
| Analiza doboru | `application/analyses/nn_device_selection.py` (NOWY): Ib≤In≤Iz′, I2≤1,45·Iz′, Icu≥Ik″max, SWZ przy Ik_min; ranking kandydatów |
| Testy | punkty krzywych vs wartości normatywne; dobór na obwodzie referencyjnym |

## P0.8 — SLD nN (P0.10 zlecenia)

| Pliki | Treść |
|---|---|
| `ui/sld/v2/canvas/enmToSldAdapter.ts` | struktura per-szyna/per-odpływ (seam A8 §9.2.1) |
| `ui/sld/v3/compose/station.ts` | emisja symbol+segment+ownerRef per element nN (wzorzec DER) |
| `ui/sld/v3/symbols/defs.ts`, `glyphs.tsx` | symbole: rozdzielnica nN, wyłącznik nN/MCB, rozłącznik bezp. nN, licznik nN |
| `ui/sld/v3/layout/measure.ts` | rezerwacje szerokości N odpływów (wzorzec DER-row) |
| Overlay | zero zmian kontraktu — warstwy U/ΔU/I/loading/Ik/SWZ przez istniejący `SldV3Overlay` (SWZ = nowa metryka w payload) |
| Testy | contract testy v3 (buildScene/symbols/layout) + substrate z siecią nN; **werdykt wizualny = bramka B-02 właściciela (zrzuty, oba motywy)** |

## P0.9 — nN STUDIO UI (F) 

Wg F §1–§5: adapter drzewa, zakładki, kreatory `odcinek-nn`/`rozdzielnica-nn`/`aparat-nn`,
tabela odcinków (edytowalna — nowy byt w `ui2/shared`), wykresy (profil U, Ik(l), margines SWZ,
koordynacja doboru), heatmapa; rejestr okien W-620+; `dialog_completeness_guard` wpisy.

## P0.10 — Trace + proof + raport (P0.11, P0.12 zlecenia)

| Pliki | Treść |
|---|---|
| `application/proof_engine/` | pak `LV_CIRCUIT_VERIFICATION` wg 10-krokowej procedury (A10 §9): równania (reuse EQ_LC/EQ_VDROP + nowe In≤Iz′/SWZ/I²t), generator konsumuje WYNIKI solverów (zero trzeciej fizyki), ZIP builder, API `POST /api/nn-proof/circuit/pack`, wpięcie UI (naprawa martwego `ProofPacksPanel` przy okazji dotykania mount-site) |
| Raport | `api/analysis_run_exports.py` sekcje nN (P0: minimalny zakres — dane źródłowe, TR, odcinki, ΔU, Ik, SWZ, dobór; pełny spis §63 w P1) |
| Provenance | każdy wynik: runId+revisionId+przypadek decydujący |

## Bramka końcowa P0 — scenariusz E2E (§80 zlecenia)

Test `tests/e2e/test_nn_full_chain.py` + substrate: GPZ 15 kV → sieć SN → ST-03 → TR 15/0,4 →
RGnN → K1 → R1 → K2 silnik (jako odbiór P0) → K3 odbiór → K4 PV → K5 BESS. Wykonuje: load-flow
SN+nN, profil U, ΔU, Ik max/min, SWZ, dobór kabli, dobór zabezpieczeń, zmianę kabla → stale
detection → przeliczenie, trace, raport. Kroki agregat+SZR+TCC dochodzą w P1 (rozszerzenie
TEGO SAMEGO testu, nie osobny). Jeżeli którykolwiek krok nie działa na jednym modelu —
integracja nN NIE JEST GOTOWA.

## P1 (po P0, ta sama dyscyplina DoD)

TCC SN+nN (G-11) · RCD (G-13) · silniki/rozruch (G-14) · agregat/UPS/SZR + przypadki wyspy
(G-15) · TT/IT (G-12) · kompensacja nN (G-16) · asymetria: pole fazy + BFS w pipeline (G-17)
· ranking wariantów pełny (§47) · ochrona przeciwporażeniowa zagregowana (§23) · eksport
XLSX/CSV (G-20) · pełny raport §63 · szablony stacji multi-voltage (N-D10) · pełne sekcje/
sprzęgła/SZR w kreatorze RGnN · wykres marginesu SWZ dla wszystkich odbiorów.

## P2

Harmoniczne (G-19, jawny gap do zdefiniowania) · pełny model fazowy · profile 24h/8760 (G-18)
· optymalizacja techniczno-ekonomiczna · energia strat · automatyczne równoważenie faz
(propozycja bez auto-zmiany).

## Reguły wykonania

1. Rdzenie FROZEN (SC/PF) nietknięte — wszystkie zmiany w bindingu/builderach/analizach;
   `solver_diff_guard`/`solver_boundary_guard` zielone po każdym pakiecie.
2. Każdy pakiet kończy się pełną regresją właściwej warstwy + guardami + determinizmem.
3. Dane normatywne wyłącznie z proweniencją (G §2); brak danych = jawny stan, nigdy wynik.
4. Ekrany nN po każdym scalonym etapie → zrzuty żywej aplikacji do oceny właściciela (B-02).
