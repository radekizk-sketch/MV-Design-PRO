# Rejestr sieci wzorcowych — tabela generowana

Źródło: `backend/tests/golden/registry.py` (generator `backend/scripts/generuj_rejestr_sieci.py`; test `backend/tests/golden/test_registry.py` pilnuje zgodności). Kanon i zasady: `REFERENCE_NETWORK_REGISTRY.md`. Nie edytować ręcznie.

| ID | Klasa przypadku | Status | Postać | Klasy wyroczni | Rodziny z wyrocznią | Budowniczowie | Konsumenci |
|---|---|---|---|---|---|---|---|
| G01 | sieć SN kompensowana / zwarcie doziemne / zabezpieczenia (pierwszy vertical slice §31) | NOT_BUILT | ENM | ANALYTICAL | EARTH_FAULT | — | solver, SLD SN, SLD nN, dokumenty, e2e |
| G02 | SN promieniowa: rozpływ + zwarcia | PARTIAL | ENM | REGRESSION_ONLY | — | `tests.reference_networks.builders:build_gn01_sn_promieniowa`<br>`tests.reference_networks.builders:build_gn02_sn_odgalezienie` | solver, SLD (test_sld_network_model) |
| G03 | SN pierścień / punkt podziału (NOP) / N-1 | PARTIAL | ENM | REGRESSION_ONLY | — | `tests.reference_networks.builders:build_gn03_sn_pierscien` | solver |
| G04 | stacja dwutransformatorowa ze sprzęgłem szyn | PARTIAL | ENM | REGRESSION_ONLY | — | `tests.application.analyses.lv_domain.scenariusze_nn:SCENARIUSZE` | projekcja nN, SLD nN (fixtury generowane) |
| G05 | nN ABCN / N / PEN / SWZ | PARTIAL | ENM | REGRESSION_ONLY | — | `tests.application.analyses.lv_domain.scenariusze_nn:SCENARIUSZE` | fault_loop, swz, projekcja nN |
| G06 | PV w punkcie przyłączenia / RfG | PARTIAL | ENM | REGRESSION_ONLY | — | — | ncrfg, source_compliance |
| G07 | BESS ładowanie / rozładowanie | PARTIAL | BENCHMARK_DICT | REGRESSION_ONLY | — | `application.reference_networks.builders.oze_pv_bess:build_oze_pv_bess_network` | solver |
| G08 | koordynacja zabezpieczeń / TCC | PARTIAL | ENM | NORMATIVE | PROTECTION | `tests.reference_networks.builders:build_gn05_sn_nn_oze_ochrona` | protection_iec60255 |
| G09 | CT/VT + zabezpieczenia kierunkowe | NOT_BUILT | ENM | REGRESSION_ONLY | — | — | — |
| G10 | jakość energii / architektura harmonicznych | NOT_BUILT | ENM | REGRESSION_ONLY | — | — | — |
| G11 | wariant strukturalny / rozbudowa sieci | NOT_BUILT | ENM | REGRESSION_ONLY | — | — | — |
| G12 | optymalizacja wielokryterialna | NOT_BUILT | ENM | REGRESSION_ONLY | — | — | — |
| G13 | GIS / import / topology healing | PARTIAL | ENM | REGRESSION_ONLY | — | `tests.cgmes.golden_enm:build_golden_enm` | cgmes, N-1 |
| G14 | katalog / dobór urządzeń | PARTIAL | ENM | REGRESSION_ONLY | — | — | catalog_* guardy |
| G15 | raportowanie / proweniencja / dowody | PARTIAL | ENM | REGRESSION_ONLY | — | — | proof packs |
| G00 | skala: sieć L ≈ 2 000 szyn (benchmark wydajności) | PARTIAL | ENM | REGRESSION_ONLY | — | `tests.reference_networks.sld_substrate_52s:build_sld_substrate_52s` | SLD v2/v3, jacobian, kopia graniczna |
| B-BENCH | benchmarki opublikowane IEEE / CIGRE / IEC 60909 / pandapower | SUPPORTED | BENCHMARK_DICT | INDEPENDENTLY_VERIFIED, PUBLISHED_BENCHMARK, NORMATIVE | LF, SC | `application.reference_networks.library:REFERENCE_NETWORK_REGISTRY` | solver_output_drift_guard, reference_networks_validation_guard |

## Pokrycie rodzin solverów niezależnymi wyroczniami

| Rodzina | Klasy wyroczni |
|---|---|
| LF | INDEPENDENTLY_VERIFIED, PUBLISHED_BENCHMARK |
| SC | INDEPENDENTLY_VERIFIED, NORMATIVE |
| EARTH_FAULT | ANALYTICAL |
| LV_ABCN | BRAK (luka pokrycia) |
| FAULT_LOOP_LV | BRAK (luka pokrycia) |
| THERMAL | BRAK (luka pokrycia) |
| PROTECTION | NORMATIVE |
| DYNAMICS | BRAK (luka pokrycia) |
| POWER_QUALITY | BRAK (luka pokrycia) |
