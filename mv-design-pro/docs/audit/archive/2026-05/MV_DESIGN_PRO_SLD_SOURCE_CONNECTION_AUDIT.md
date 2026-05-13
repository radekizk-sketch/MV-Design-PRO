# MV-DESIGN-PRO SLD Source Connection Audit

Date: 2026-04-24
Scope: PR-D, PV/BESS source connection variants and NOP semantics in the active
ENM -> SLD projection path.

## Runtime Boundary

This change does not add a demo screen or static topology. It changes the data
contract used by the existing projection and validation code.

Changed runtime areas:

- `frontend/src/types/enm.ts`
- `frontend/src/ui/sld/core/sourceConnectionVariant.ts`
- `frontend/src/ui/sld/core/topologyInputReader.ts`
- `frontend/src/ui/sld/core/stationBlockBuilder.ts`
- `frontend/src/ui/sld/core/pvBessValidation.ts`
- `backend/src/domain/generator_validation.py`
- `backend/src/domain/field_device.py`
- `backend/src/enm/models.py`
- `backend/src/enm/domain_ops_models.py`
- `backend/src/enm/domain_operations.py`
- `backend/src/enm/domain_operations_v2.py`

## Canonical Source Variants

The canonical connection variants are:

- `LV_BEHIND_STATION_TRANSFORMER`
- `DEDICATED_MV_CONNECTION`
- `SOURCE_CONNECTION_STATION`

Legacy aliases are still accepted on input:

- `nn_side` -> `LV_BEHIND_STATION_TRANSFORMER`
- `block_transformer` -> `DEDICATED_MV_CONNECTION`

The reader normalizes ENM data to the canonical values. Runtime rendering and
validation use helpers from `sourceConnectionVariant.ts`, so the renderer does
not infer the source variant from symbol placement.

## SLD Semantics

`LV_BEHIND_STATION_TRANSFORMER`:

- source is behind an existing station transformer;
- station builder assigns PV/BESS to `PV_NN` / `BESS_NN`;
- no separate SN source bay is created for this variant.

`DEDICATED_MV_CONNECTION`:

- source needs a dedicated MV connection and transformer reference;
- station builder keeps source role on SN (`PV_SN` / `BESS_SN`);
- missing transformer reference is a blocker/fix action.

`SOURCE_CONNECTION_STATION`:

- source belongs to a separate source connection station;
- station reference is required;
- station structure is validated outside the renderer.

## NOP Semantics

Normally-open ring segments remain visible in the topology and visual contract
as NOP/secondary connectors. PR-D also prevents a normally-open ring connection
from changing the station role in normal operation. This keeps a terminal
station terminal, while the NOP remains represented as topology state.

## Evidence

Frontend PR-D tests:

```text
npm test -- src/ui/sld/core/__tests__/topologyInputReader.test.ts src/ui/sld/core/__tests__/pvBessValidation.test.ts src/ui/sld/core/__tests__/stationBlockBuilder.test.ts src/ui/sld/core/__tests__/visualTopologyContract.test.ts src/ui/sld/core/__tests__/topologyAdapterV2.test.ts
Test Files: 5 passed
Tests: 138 passed
```

Frontend type-check:

```text
npm run type-check
passed
```

Backend PR-D tests:

```text
py -m pytest backend/tests/test_generator_validation.py backend/tests/test_field_device.py backend/tests/test_station_field_validation.py
80 passed, 1 existing pytest config warning: unknown asyncio_mode
```

## Deferred Work

This PR-D step does not update golden hashes, public UI wording, export/report
flows, or product navigation. Those remain in PR-E through PR-G.
