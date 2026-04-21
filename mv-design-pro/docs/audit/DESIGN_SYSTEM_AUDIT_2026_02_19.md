# Raport audytu automatycznego — DESIGN SYSTEM SETUP
# Data: 2026-02-19
# Wersja: 1.0

## A) UI — Audyt SLD i modali

### A.1 Pipeline SLD (adapter → graf wizualny → układ → render → overlay)
| Etap | Plik | Status |
|------|------|--------|
| TopologyAdapter | `frontend/src/ui/sld/core/topologyAdapterV2.ts` | OK |
| VisualGraph | `frontend/src/ui/sld/core/visualGraph.ts` | OK |
| LayoutPipeline | `frontend/src/ui/sld/core/layoutPipeline.ts` | OK |
| StationBlockBuilder | `frontend/src/ui/sld/core/stationBlockBuilder.ts` | OK |
| SwitchgearConfig | `frontend/src/ui/sld/core/switchgearConfig.ts` | OK |
| SwitchgearRenderer | `frontend/src/ui/sld/core/switchgearRenderer.ts` | OK |
| UnifiedSymbolRenderer | `frontend/src/ui/sld/symbols/UnifiedSymbolRenderer.tsx` | OK |
| SLDView | `frontend/src/ui/sld/SLDView.tsx` | OK |
| ResultsOverlay | `frontend/src/ui/sld/ResultsOverlay.tsx` | OK |
| OverlayEngine | `frontend/src/ui/sld-overlay/OverlayEngine.ts` | OK |

### A.2 Lista target_kind — kliki i efekty
| Klik na SLD | Handler | Test | Efekt |
|-------------|---------|------|-------|
| Bus (węzeł) | SymbolResolver | OK | Zaznaczenie + inspektor |
| Branch (gałąź) | ConnectionRenderer | OK | Zaznaczenie |
| Transformer | SymbolResolver | OK | Zaznaczenie + inspektor |
| Switch | SymbolResolver | OK | Toggle state |
| Source | SymbolResolver | OK | Zaznaczenie |
| Load | SymbolResolver | OK | Zaznaczenie |
| Generator (OZE) | SymbolResolver | OK | Zaznaczenie |
| Station | StationBlockBuilder | OK | Rozwinięcie bloku |

### A.3 Lista modali
| Modal | Komponent | Handler | Endpoint | Test |
|-------|-----------|---------|----------|------|
| GridSourceModal | `topology/modals/GridSourceModal.tsx` | OK | add_grid_source_sn | OK |
| TrunkContinueModal | `topology/modals/TrunkContinueModal.tsx` | OK | continue_trunk_segment_sn | OK |
| TransformerStationModal | `topology/modals/TransformerStationModal.tsx` | OK | insert_station_on_segment_sn | OK |
| BranchModal | `topology/modals/BranchModal.tsx` | OK | start_branch_segment_sn | OK |
| RingCloseModal | `topology/modals/RingCloseModal.tsx` | OK | connect_secondary_ring_sn | OK |
| NodeModal | `topology/modals/NodeModal.tsx` | OK | update_element_parameters | OK |
| LoadDERModal | `topology/modals/LoadDERModal.tsx` | OK | add_nn_load | OK |
| PVInverterModal | `topology/modals/PVInverterModal.tsx` | OK | add_converter_source | OK |
| BESSInverterModal | `topology/modals/BESSInverterModal.tsx` | OK | add_converter_source | OK |
| GensetModal | `topology/modals/GensetModal.tsx` | OK | add_genset_nn | OK |
| UPSModal | `topology/modals/UPSModal.tsx` | OK | add_ups_nn | OK |
| ProtectionModal | `topology/modals/ProtectionModal.tsx` | OK | add_relay | OK |
| MeasurementModal | `topology/modals/MeasurementModal.tsx` | OK | add_ct / add_vt | OK |
| CatalogPicker | `topology/modals/CatalogPicker.tsx` | OK | assign_catalog_to_element | OK |
| BRAK: SectionSwitchModal | — | BRAK | insert_section_switch_sn | BRAK |
| BRAK: NOPModal | — | BRAK | set_normal_open_point | BRAK |

## B) Backend — Operacje domenowe i katalogi

### B.1 Operacje domenowe (39 kanonicznych)
| Kategoria | Operacje | Status |
|-----------|----------|--------|
| SN_NETWORK (7) | add_grid_source_sn, continue_trunk_segment_sn, insert_station_on_segment_sn, start_branch_segment_sn, insert_section_switch_sn, connect_secondary_ring_sn, set_normal_open_point | OK |
| STATION_NN (3) | add_transformer_sn_nn, add_nn_outgoing_field, add_nn_load | OK |
| OZE_NN (5) | add_converter_source, add_genset_nn, add_ups_nn, set_source_operating_mode, set_dynamic_profile | OK |
| PROTECTION (8) | add_ct, add_vt, add_relay, update_relay_settings, link_relay_to_field, calculate_tcc_curve, validate_selectivity, run_protection_study | OK |
| STUDY_CASE (9) | create_study_case, set_case_switch_state, set_case_normal_state, set_case_source_mode, set_case_time_profile, run_short_circuit, run_power_flow, run_time_series_power_flow, compare_study_cases | OK |
| UNIVERSAL (6) | assign_catalog_to_element, update_element_parameters, delete_element, rename_element, set_label, export_project_artifacts | OK |

### B.2 Pipeline analiz
| Analiza | Solver | Interpretacja | WhiteBox | Eksport |
|---------|--------|--------------|----------|---------|
| Zwarcie IEC 60909 | short_circuit_iec60909.py | analysis/boundary | Tak (TraceArtifact) | PDF/DOCX/JSON |
| Rozpływ Newton-Raphson | power_flow_newton.py | power_flow_interpretation | Tak | PDF/DOCX/JSON |
| Rozpływ Gauss-Seidel | power_flow_gauss_seidel.py | power_flow_interpretation | Tak | PDF/DOCX/JSON |
| Rozpływ Fast Decoupled | power_flow_fast_decoupled.py | power_flow_interpretation | Tak | PDF/DOCX/JSON |
| Ochrona IEC 60255 | protection_iec60255.py | protection_insight | Tak | PDF/DOCX |

### B.3 Walidacje i gotowość
- ENMValidator: 9 blokerów (E001–E009), 8 ostrzeżeń (W001–W008), 5 info (I001–I005)
- ReadinessProfileV1: 7 obszarów, 8 bramek gotowości
- READINESS_CODES: 26 kodów z priorytetami i mapowaniem FixActions

## C) Katalogi — Analiza braków

### C.1 Istniejące namespace'y
| Namespace | Typ Python | Wpisy | Status |
|-----------|-----------|-------|--------|
| LINE (napowietrzna SN) | LineType | ~20 | OK |
| CABLE (kabel SN) | CableType | ~40 | OK |
| TRANSFORMER (SN/nN) | TransformerType | ~25 | OK |
| SWITCH_EQUIPMENT (SN) | SwitchEquipmentType | ~15 | OK |
| CONVERTER (PV/WIND/BESS) | ConverterType | ~10 | OK |
| INVERTER | InverterType | 0 (puste) | BRAK DANYCH |
| PROTECTION_DEVICE | ProtectionDeviceType | 0 (puste) | BRAK DANYCH |
| PROTECTION_CURVE | ProtectionCurve | 0 (puste) | BRAK DANYCH |
| PROTECTION_SETTING_TEMPLATE | ProtectionSettingTemplate | 0 (puste) | BRAK DANYCH |

### C.2 Brakujące namespace'y (wymagane przez specyfikację)
| Namespace | Cel | Priorytet |
|-----------|-----|-----------|
| KABEL_NN | Kable niskiego napięcia (0.4 kV) | WYSOKI |
| OBCIAZENIE | Typy obciążeń (PQ, cosφ) | WYSOKI |
| APARAT_SN | Aparaty łączeniowe SN (wyłącznik/rozłącznik) | WYSOKI |
| APARAT_NN | Aparaty łączeniowe nN (wyłącznik główny/odpływowy) | WYSOKI |
| CT | Przekładniki prądowe | SREDNI |
| VT | Przekładniki napięciowe | SREDNI |
| ZABEZPIECZENIE | Przekaźniki zabezpieczeniowe | SREDNI |
| NASTAWY_ZABEZPIECZEN | Szablony nastaw | SREDNI |
| ZRODLO_NN_PV | Falowniki PV (dedykowane nN) | WYSOKI |
| ZRODLO_NN_BESS | Falowniki BESS (dedykowane nN) | WYSOKI |

### C.3 Mapowanie materializacji (brakujące)
Brak formalnej definicji `solver_materialization` i `ui_preview` w typach katalogowych.
Typ obecny zawiera parametry techniczne, ale nie ma jawnego kontraktu materializacji do Snapshot.

## D) Testy/CI

### D.1 Złote sieci
| Złota sieć | Backend | Frontend | Status |
|------------|---------|----------|--------|
| golden_network_5bus | tests/golden/ | sld/core/__tests__/goldenNetworkE2E.test.ts | OK |
| switchgear golden | tests/golden/ | sld/core/__tests__/switchgearConfigGolden.test.ts | OK |

### D.2 Deterministyka
| Test | Powtórzeń | Status |
|------|-----------|--------|
| SLD layout determinism | 100× | OK (vitest) |
| Switchgear hash parity | 50× | OK (vitest) |
| Render golden | SLD CI | OK |

### D.3 Strażnicy CI
| Strażnik | Status |
|----------|--------|
| pcc_zero_guard.py | OK (grep-zero PCC) |
| no_codenames_guard.py | OK |
| domain_no_guessing_guard.py | OK |
| canonical_ops_guard.py | OK |
| sld_determinism_guards.py | OK |
| arch_guard.py | OK |

## CHECKLISTA BRAKÓW → Fazy 1–11

| # | Brak | Faza | Priorytet |
|---|------|------|-----------|
| 1 | Brak typów katalogowych: KABEL_NN, OBCIAZENIE, APARAT_SN, APARAT_NN, CT, VT, ZRODLO_NN_PV, ZRODLO_NN_BESS | 1 | KRYTYCZNY |
| 2 | Brak kontraktu materializacji (solver_materialization + ui_preview) | 1 | KRYTYCZNY |
| 3 | Brak rozszerzenia CatalogRepository o nowe kolekcje | 1 | KRYTYCZNY |
| 4 | Brak aliasu attach_protection_to_cb w kanonicznych operacjach | 2 | WYSOKI |
| 5 | Brak aliasu add_nn_feeder w kanonicznych operacjach | 2 | WYSOKI |
| 6 | Brak JSON Schema dla payloadów operacji | 2 | WYSOKI |
| 7 | Brak SectionSwitchModal (frontend) | 6 | SREDNI |
| 8 | Brak NOPModal (frontend) | 6 | SREDNI |
| 9 | Brak pełnych modeli CatalogBinding z version + materialize flags | 3–5 | WYSOKI |
| 10 | Brak frontend types dla nowych namespace'ów katalogowych | 6 | WYSOKI |
| 11 | Brak tabeli walidacji z priorytetami i mapowaniem FixActions (pełna) | 8 | SREDNI |
| 12 | Brak złotej sieci 11-krokowej E2E | 9 | SREDNI |
