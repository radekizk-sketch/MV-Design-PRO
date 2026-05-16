# MV-DESIGN-PRO End-to-End SLD Product Audit

Date: 2026-04-24

## Scope Completed

This audit closes the staged recovery path executed after rejecting the static SLD screen.

Completed stages:

- PR-A: detached the static SLD runtime path and restored the active SLD route to `SldEditorPage` / `SLDView` / `SLDViewCanvas`.
- PR-B: added explicit GPZ and field-device contracts for line bays, transformer bays, bus measurement bays, station fields, and section-coupler semantics.
- PR-C: changed station rendering contracts so SN/nN stations are modelled as switchgear blocks with fields, not transformer icons.
- PR-D: added canonical PV/BESS source-connection variants and validation so the renderer does not guess source topology.
- PR-E: cleaned public UI terminology and mojibake in active user-facing surfaces.
- PR-F: ran regression coverage for SLD projection, layout, station contracts, PV/BESS variants, determinism, UI terminology, type-check, and backend validation.
- PR-G: restored real-backend E2E startup and verified report/export plus main user flows.

## Runtime SLD Path

The active runtime path is:

`ENM -> projectEnmSnapshotToSld / topologyInputReader -> topologyAdapterV2 -> layoutPipeline -> SLDView / SLDViewCanvas -> SldEditorPage`

Static rejected files were detached from runtime in PR-A. Runtime hygiene is guarded by:

- `frontend/src/ui/sld/__tests__/sldCanonicalHygiene.test.ts`
- `docs/audit/MV_DESIGN_PRO_SLD_RUNTIME_AUDIT.md`

Canonical contract reference:

- `docs/sld/SLD_SYSTEM_SPEC_CANONICAL.md`

The rejected static-screen names `EngineeringSldScreen` and `canonicalSn*` are not product canon. If they appear in audit documents, they identify the removed historical artifact only.

## Electrical Contract Corrections

GPZ and station field contracts now distinguish:

- `GPZ_LINE_BAY`
- `GPZ_TRANSFORMER_BAY`
- `BUS_MEASUREMENT_BAY`
- `SECTION_COUPLER_BAY`
- station terminal / through / branch / sectional switchgear roles
- station line cubicles and transformer cubicles

The renderer is expected to map ENM/projection roles. It must not invent electrical meaning from geometry alone.

Evidence:

- `frontend/src/ui/sld/core/fieldDeviceContracts.ts`
- `frontend/src/ui/sld/core/stationBlockBuilder.ts`
- `frontend/src/ui/sld/core/bayRenderer.ts`
- `backend/src/domain/field_device.py`
- `backend/src/domain/switchgear_config.py`

## PV/BESS Source Connection Contract

Canonical source connection variants:

- `LV_BEHIND_STATION_TRANSFORMER`
- `DEDICATED_MV_CONNECTION`
- `SOURCE_CONNECTION_STATION`

Legacy aliases are normalized at the input boundary where needed. Missing or invalid source connection variants remain validation/model-readiness issues, not renderer heuristics.

Evidence:

- `frontend/src/ui/sld/core/sourceConnectionVariant.ts`
- `frontend/src/ui/sld/core/topologyInputReader.ts`
- `frontend/src/ui/sld/core/pvBessValidation.ts`
- `backend/src/domain/generator_validation.py`
- `docs/audit/MV_DESIGN_PRO_SLD_SOURCE_CONNECTION_AUDIT.md`

## Public UI Language

Public UI now uses:

- `wariant pracy` instead of visible `przypadek`
- `stan modelu` instead of visible `migawka`
- `obliczenia` instead of visible `uruchomienie`

Mojibake was corrected in active user-facing surfaces including the SLD editor, context menu, network build cards, inspector panels, results panels, active variant bar, study-case screens, and workspace panels.

Regression guard:

- `frontend/src/ui/__tests__/ui-terminology-guard.test.ts`
- `frontend/src/ui/__tests__/canon-polish-labels.test.ts`

## Test Evidence

Commands run successfully:

- `poetry run pytest`
  - Working directory: `backend`.
  - Result: 4231 passed, 6 skipped, 4 xpassed.
- `npm test`
  - Working directory: `frontend`.
  - Result: 302 test files passed; 4685 tests passed, 1 skipped.
- `npm run lint`
  - Result: passed.
- `npm run type-check`
  - Result: passed.
- `npm run build`
  - Result: passed; Vite reported a non-blocking large chunk warning for the existing application bundle.
- `npm run guard:ui-terminology`
  - Result: `ui-terminology-guard: OK (brak naruszen)`.
- `npm run guard:codenames`
  - Result: `no-codenames-guard: OK (brak naruszeń)`.
- `npm run verify:v12.5.1`
  - Result: `V12.5.1 verification passed.`
- `npm test -- src/ui/__tests__/ui-terminology-guard.test.ts src/ui/__tests__/canon-polish-labels.test.ts`
  - Result: 8 passed.
- `npm run type-check`
  - Result: passed.
- `npm test -- src/ui/sld/core/__tests__/topologyInputReader.test.ts src/ui/sld/core/__tests__/pvBessValidation.test.ts src/ui/sld/core/__tests__/stationBlockBuilder.test.ts src/ui/sld/core/__tests__/fieldRendererContract.test.ts src/ui/sld/core/__tests__/visualTopologyContract.test.ts src/ui/sld/core/__tests__/topologyAdapterV2.test.ts src/ui/sld/core/__tests__/determinism.test.ts src/ui/sld/core/__tests__/layoutPipeline.test.ts src/ui/sld/__tests__/sldCanonicalHygiene.test.ts src/ui/sld/__tests__/SldEmptyOverlay.test.tsx src/ui/active-case-bar/__tests__/ActiveCaseBar.test.tsx`
  - Result: 214 passed.
- `py -m pytest backend/tests/test_generator_validation.py backend/tests/test_field_device.py backend/tests/test_station_field_validation.py backend/tests/test_switchgear_config.py`
  - Result: 118 passed, 1 existing warning: `Unknown config option: asyncio_mode`.
- `npm test -- src/ui/results-inspector/__tests__/ResultsExport.test.tsx src/ui/results-inspector/__tests__/apiExports.test.ts src/ui/proof/__tests__/traceCatalogContextExport.spec.tsx src/ui/proof/__tests__/traceExportApi.test.ts src/ui/sld/export/__tests__/sld-export.test.ts src/ui/sld/core/__tests__/exportManifest.test.ts src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts src/ui/sld/core/__tests__/switchgearE2E.test.ts src/ui/network-build/__tests__/workflowIntegration.test.ts src/ui/network-build/__tests__/converterSourceFlow.test.ts src/ui/network-build/__tests__/cardAnalysisResults.test.ts`
  - Result: 157 passed.
- `npm run test:e2e -- e2e/create-first-case.spec.ts e2e/critical-run-flow.spec.ts e2e/happy-path.spec.ts`
  - Result: 7 passed with real backend.
- `npm test -- src/__tests__/App.routes.test.tsx src/ui/__tests__/ui-terminology-guard.test.ts src/ui/__tests__/canon-polish-labels.test.ts`
  - Result: 21 passed.

Snapshot/golden handling:

- PR-A did not update snapshots, golden files, or hashes.
- This documentation cleanup does not update snapshots, golden files, or hashes.
- The PR-A..PR-G evidence above records prior test results. Where earlier product stages changed expectations, the change was limited to affected runtime/test evidence:
  - PV/BESS manifest summary changed `polaSn` from 3 to 1 for `LV_BEHIND_STATION_TRANSFORMER`, because LV-behind-station sources no longer create synthetic SN source fields.
  - Public terminology snapshots were updated from visible `przypadek` / `migawka` / `uruchomienie` wording to `wariant pracy` / `stan modelu` / `obliczenia`.

## E2E Startup Repair

The real-backend Playwright command previously failed before executing tests because backend imports require both the repository root and `src` on Python import path. `frontend/playwright.config.ts` now starts the backend with `PYTHONPATH=src`.

The backend Poetry environment was missing installed locked dependencies such as `networkx`; `poetry install --with dev` was run before the final E2E pass.

## Remaining Product Work

Remaining work belongs in focused follow-up PRs:

- Full browser/manual review of all SLD editing flows after the text cleanup.
- Visual review by a qualified SN network designer for final symbol geometry and station diagrams.
- Cleanup PR for comment-only mojibake in older source comments if the team wants source comments normalized as well.
