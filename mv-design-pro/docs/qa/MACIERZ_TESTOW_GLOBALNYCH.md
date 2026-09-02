# MACIERZ_TESTOW_GLOBALNYCH

Status: wiazacy dla aktualnego zestawu testow w repo.

Backend katalog-first i ENM:
- `backend/tests/api/test_domain_ops_policy.py`
- `backend/tests/enm/test_catalog_gate.py`
- `backend/tests/enm/test_catalog_first_validation.py`
- `backend/tests/enm/test_catalog_materialization_persistence.py`
- `backend/tests/enm/test_update_element_parameters_catalog_guards.py`
- `backend/tests/enm/test_nn_source_catalog_provenance.py`
- `backend/tests/enm/test_branch_point_sn.py`
- `backend/tests/enm/test_enm_validator.py`

Backend analiza i topologia:
- `backend/tests/enm/test_enm_mapping.py`
- `backend/tests/enm/test_golden_network_enm.py`
- `backend/tests/enm/test_golden_network_v1_e2e.py`
- `backend/tests/enm/test_mv_general_workflow_e2e.py`
- `backend/tests/enm/test_enm_topology.py`
- `backend/tests/enm/test_enm_topology_api.py`
- `backend/tests/test_canonical_analysis_api.py`
- `backend/tests/enm/test_canonical_analysis_trace_catalog_context.py`
- `backend/tests/application/analysis_run/test_catalog_context.py`
- `backend/tests/test_p11a_results_inspector.py`

Frontend katalog-first i workflow:
- `frontend/src/ui/network-build/__tests__/catalogBrowser.test.tsx`
- `frontend/src/ui/network-build/__tests__/catalogFirstRules.test.ts`
- `frontend/src/ui/network-build/__tests__/workflowIntegration.test.ts`

Frontend SLD v2 (po wygaszeniu starego SLD — PR-5c; konsolidacja martwego
silnika layoutu builder/{Hierarchical,Corridor,...} — 2026-07):
- `frontend/src/ui/sld/v2/geometry/__tests__/layoutEngine.substrate.test.ts`
- `frontend/src/ui/sld/v2/geometry/__tests__/portAnchoredGeometry.substrate.test.ts`
- `frontend/src/ui/sld/v2/__tests__/renderers.test.tsx`
- `frontend/src/ui/sld/v2/__tests__/ViewportController.test.ts`
- `frontend/src/ui/sld/v2/__tests__/LodPolicy.test.ts`
- `frontend/src/ui/sld/v3/canvas/__tests__/lvDomainPortal.test.tsx` (następca skasowanego `StationInternalView.test.tsx` — portal domeny nN, slice E 2026-09-01)
- `frontend/src/ui/sld/v2/command/__tests__/SldCommandService.test.ts`
- `frontend/src/ui/sld/v2/core/__tests__/ports.test.ts`

Frontend SLD v3 (SLD_CAD_REBUILD_PLAN_V3 F1-F8 — domyślna ścieżka renderu od
F8a; v2 pozostaje fallbackiem, patrz §F8c w planie — usunięcie ZABLOKOWANE do
pełnego parytetu §10):
- `frontend/src/ui/sld/v3/symbols/__tests__/symbols.test.tsx`
- `frontend/src/ui/sld/v3/layout/__tests__/layout.test.ts`
- `frontend/src/ui/sld/v3/layout/__tests__/route.test.ts`
- `frontend/src/ui/sld/v3/layout/__tests__/labels.test.ts`
- `frontend/src/ui/sld/v3/scene/__tests__/buildScene.test.ts` (F9.7: + port_probe/symbol_wire_probe/vertical_length_probe, §11.3/§11.4/§15.1)
- `frontend/src/ui/sld/v3/canvas/__tests__/camera.test.ts`
- `frontend/src/ui/sld/v3/canvas/__tests__/sldCanvasV3.test.tsx` (F9.7: + r1, test ścieżki fallbacku placementu etykiet przepływu)
- `frontend/src/ui/sld/v3/compose/__tests__/sourceKind.test.ts` (F9.7, NOWY — `source_symbol_probe`, spec §13.2)
- `frontend/src/ui/sld/v3/canvas/__tests__/mobileCamera.test.tsx` (F12-C: kamera mobilna E15/E16 — dawny wpis `SldRenderHost.test.tsx` [cutover v2/v3 + pomost split-preview] usunięty razem ze skasowaną ścieżką renderu v2, spec §10.1 ARCH-4)
- `frontend/src/ui/workspace/__tests__/routerExtensionSurfaces.test.tsx` (drugi punkt osadzenia — `WorkspaceSurfaceRouter` E-01)
- `frontend/scripts/sld_v3_acceptance.mjs` (`npm run accept:sld-v3` — render-odbiór wyroczni §11/§9/§12-§15/§16 na `sldSubstrate52s`, AKTYWNY w `.github/workflows/sld-determinism.yml`; F9.7: domknięcie audytu kompletności §12-§15 — port_probe/symbol_wire_probe/vertical_length_probe/lod_path_probe/source_symbol_probe dopięte, patrz `docs/sld/SLD_V3_ACCEPTANCE.md`)
- `scripts/sld_determinism_guards.py` (GUARD 6 — testy v3 obecne)

Frontend White Box i eksport sladu:
- `frontend/src/ui/proof/__tests__/TraceViewer.test.tsx`
- `frontend/src/ui/proof/__tests__/traceCatalogContextExport.spec.tsx`

CI i guardy katalog-first:
- `.github/workflows/docs-guard.yml`
- `.github/workflows/arch-guard.yml`
- `.github/workflows/python-tests.yml`
- `backend/tests/ci/test_catalog_first_repo_guards.py`
- `backend/tests/ci/test_catalog_first_repo_hygiene.py`
- `scripts/docs_guard.py`
- `scripts/repo_hygiene_guard.py`
- `scripts/pcc_zero_guard.py`
- `scripts/domain_no_guessing_guard.py`
- `scripts/catalog_binding_guard.py`
- `scripts/catalog_enforcement_guard.py`
- `scripts/catalog_gate_guard.py`
- `scripts/transformer_catalog_voltage_guard.py`
- `scripts/fix_action_completeness_guard.py`
- `scripts/audit_contract_guard.py`

Luki testowe potwierdzone w kodzie:
- brak dowodu testowego, ze legacy mutujace endpointy katalogowe poza `domain-ops` zostaly produkcyjnie wygaszone; w aktualnym kodzie nadal sa montowane w `backend/src/api/catalog.py`,
- brak pelnego testu `insert_section_switch_sn` z utrwaleniem `materialized_params`,
- brak backendowego testu eksportow `power-flow-runs/{run_id}/export/json|docx|pdf` z jawna proweniencja `catalog -> materialized_params -> solver input`; obecne dowody obejmuja rozszerzony White Box i frontendowe eksporty sladu.

Luki higieny repo potwierdzone guardem:
- `scripts/repo_hygiene_guard.py` wykrywa nadal legacy payload aliases w `frontend/src/types/domainOps.ts` oraz aktywnych specach `frontend/e2e/*.spec.ts`,
- obecny stan FE nie jest jeszcze grep-zero dla `catalog_ref`, `transformer_catalog_ref` i `from_bus_ref` w warstwie typow i scenariuszy E2E.
