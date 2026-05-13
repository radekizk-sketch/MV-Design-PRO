# MV-DESIGN-PRO SLD Station Switchgear Audit

Date: 2026-04-24
Scope: PR-C, station SN/nN structure in the active ENM -> SLD projection path.

## Runtime Boundary

This change does not add a static SLD screen and does not alter the detached
static-screen artifact rejected in PR-A. Station structure is enforced in:

- `frontend/src/ui/sld/core/stationBlockBuilder.ts`
- `frontend/src/ui/sld/core/fieldDeviceContracts.ts`
- `frontend/src/ui/sld/core/__tests__/stationBlockBuilder.test.ts`

## Contract Findings

Before PR-C, a station block could exist with a transformer field while the
station-level validation did not state the missing nN switchgear as a structural
problem. Also, `TRUNK_BRANCH` field role assignment used field order, so a
branch station could lose the distinction between main-line outgoing field and
branch field.

PR-C changes:

- station embedding now treats two incident SN network connections as a through
  station, even when the second segment is on a branch feeder;
- branch stations require at least three incident SN network connections before
  they are classified as branch stations;
- `TRUNK_BRANCH` line-field roles are assigned from trunk/branch segmentation,
  not from sorted field index;
- station-level validation now reports missing LINE_IN, LINE_OUT, LINE_BRANCH,
  transformer field, and nN switchgear with stable fix-action codes.

## Station Minimum Structure

Terminal station:

- required LINE_IN
- required TRANSFORMER_SN_NN
- nN switchgear is required when the transformer field exists

Through station:

- required LINE_IN
- required LINE_OUT
- required TRANSFORMER_SN_NN
- nN switchgear is required when the transformer field exists

Branch station:

- required LINE_IN
- required LINE_OUT
- required LINE_BRANCH
- required TRANSFORMER_SN_NN
- nN switchgear is required when the transformer field exists

Sectional station:

- required LINE_IN
- required LINE_OUT
- required COUPLER_SN
- required TRANSFORMER_SN_NN where the modeled station is SN/nN
- nN switchgear is required when the transformer field exists

## Evidence

Targeted PR-C test run:

```text
npm test -- src/ui/sld/core/__tests__/stationBlockBuilder.test.ts src/ui/sld/core/__tests__/fieldRendererContract.test.ts
Test Files: 2 passed
Tests: 53 passed
```

New/updated assertions confirm:

- inline station has LINE_IN, LINE_OUT, and TRANSFORMER_SN_NN;
- branch station has LINE_IN, LINE_OUT, LINE_BRANCH, and TRANSFORMER_SN_NN;
- sectional station has LINE_IN, LINE_OUT, COUPLER_SN, and TRANSFORMER_SN_NN;
- station validation reports `station.nn_switchgear_missing` when a station has
  a transformer field but no modeled nN switchgear.

## Deferred Work

This PR-C step does not implement PV/BESS variants, NOP modeling, public UI
language cleanup, export/report flows, or golden updates. Those remain in PR-D
through PR-G.
