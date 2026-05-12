# MV-DESIGN-PRO SLD GPZ Contract Audit

Date: 2026-04-24

Scope: PR-B only. This audit covers GPZ line bay, bus measurement bay, section coupler, CT/VT/earthing/cable-head/relay positioning, and the frontend/backend switchgear contract touched by those roles.

Out of scope: station SN/nN cubicle redesign, PV/BESS connection variants, public UI language cleanup, report/export flow, and golden updates.

Visual parity note, 2026-05-08: this audit validates the frontend/backend switchgear
contract and apparatus semantics. It does not validate pixel-level parity with an
external SCADA system. Visual evidence and reference screenshot requirements are
tracked in `docs/sld/SLD_VISUAL_PARITY_EVIDENCE.md` and
`docs/sld/SLD_VISUAL_PARITY_CHECKLIST.md`.

## Baseline Findings

- GPZ feeder field specs for `StationKind.MAIN_SUBSTATION` were resolved as `LINE_IN`, which reused the station line cubicle contract.
- `LINE_IN`, `LINE_OUT`, and `LINE_BRANCH` intentionally had lighter station-line requirements: CB and cable head required, CT conditional, relay optional, earthing optional.
- Frontend had `MEASUREMENT_SN`, but backend field-device/switchgear contract did not accept `MEASUREMENT_SN`.
- Backend coupler and bus-tie required-device lists treated coupler/tie as CB-only, while the frontend renderer contract already expected DS-CB-DS semantics.
- Off-path apparatus could still be flagged as on the power path by geometry metadata when its electrical role was `POWER_PATH`, which made side earthing semantically ambiguous.

## Implemented Contract Changes

- Added `GPZ_LINE_BAY` as a distinct field role in frontend and backend.
- Mapped `GPZ_LINE_BAY` to `POLE_LINIOWE_SN` without changing the generic station line roles.
- Resolved explicit GPZ feeder specs from `MAIN_SUBSTATION` to `GPZ_LINE_BAY`.
- Defined the canonical `GPZ_LINE_BAY` apparatus contract:
  - `DS` required, upstream.
  - `CB` required, midstream.
  - `CT` required, midstream.
  - `RELAY` required, off-path.
  - `ES` required, off-path.
  - `CABLE_HEAD` required, downstream.
- Kept station line cubicles separate:
  - `LINE_OUT` still has CT as `REQUIRED_IF`.
  - `LINE_OUT` still has relay and earthing switch as optional.
- Added backend support for `MEASUREMENT_SN` and `POLE_POMIAROWE_SN`.
- Kept bus measurement as VT-only required apparatus; it does not require CB or cable head.
- Updated backend coupler and bus-tie required lists to require `DS` and `CB`.
- Updated bay geometry so `OFF_PATH` devices are not reported as `isOnPowerPath`.
- Ensured ES from ENM/device mapping is positioned `OFF_PATH`, so earthing switch is side-mounted by layout.

## Regression Evidence

Frontend SLD/switchgear contract:

```text
npm test -- src/ui/sld/core/__tests__/fieldRendererContract.test.ts src/ui/sld/core/__tests__/fieldDevicePolish.test.ts src/ui/sld/core/__tests__/stationBlockBuilder.test.ts src/ui/sld/core/__tests__/switchgearConfig.test.ts src/ui/sld/core/__tests__/switchgearConfig.hashParity.test.ts
Result: 5 files passed, 115 tests passed.
```

Frontend type-check:

```text
npm run type-check
Result: passed.
```

Backend switchgear contract:

```text
py -m pytest backend/tests/test_field_device.py backend/tests/test_switchgear_config.py backend/tests/test_switchgear_config_hash_parity.py
Result: 76 tests passed, 1 existing pytest config warning about asyncio_mode.
```

PR-A guard package after PR-B changes:

```text
npm test -- src/__tests__/App.routes.test.tsx src/ui/sld/__tests__/sldCanonicalHygiene.test.ts src/ui/sld/__tests__/enmSnapshotToSldSymbols.test.ts src/ui/sld/core/__tests__/determinism.test.ts src/ui/sld/core/__tests__/layoutPipeline.test.ts src/ui/sld/core/__tests__/switchgearConfig.hashParity.test.ts
Result: 6 files passed, 80 tests passed.
```

## Tests Added Or Strengthened

- `fieldRendererContract.test.ts`
  - `GPZ_LINE_BAY` requires DS, CB, CT, relay, side ES, and cable head.
  - Station line cubicle contracts are not upgraded to GPZ requirements.
  - Missing GPZ apparatus returns explicit missing-device fix codes.
  - GPZ layout keeps CT in main axis and relay/earthing switch off-path.
  - Coupler requirements exclude transformer and cable head.
  - Bus measurement bay requires off-path VT only.
- `stationBlockBuilder.test.ts`
  - Explicit GPZ field specs now resolve to `GPZ_LINE_BAY`.
- `test_switchgear_config.py`
  - Backend validates full `GPZ_LINE_BAY` requirements.
  - Backend validates coupler as DS+CB, not CB-only.
  - Backend validates `MEASUREMENT_SN` as VT-only required apparatus.

## Remaining Debt

- PR-C: station SN/nN renderer still needs a dedicated cubicle contract review; this PR intentionally did not redesign station blocks.
- PR-D: PV/BESS connection variants remain separate and must not be inferred by renderer.
- PR-E: public UI language and mojibake cleanup remain separate.
- Cleanup PR: backend still has older generator wording (`blocking_transformer`) in comments/messages; not changed here to avoid mixing PV/BESS scope.
- Contract alignment debt: frontend has `FW_SN`/`GENERATOR_FW`; backend does not yet mirror that wind-source role. This was not part of PR-B.
