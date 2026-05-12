# SLD Topology and Connections Canonical

**Status:** binding for SLD V2 operator-grade work
**Scope:** ENM topology -> electrical ports -> canonical geometry -> renderer -> interaction

## 1. Rule

SLD is a projection of the domain topology. It is not a second electrical model and it is not a decorative drawing layer.

Every visible production element must carry:

- `domain_ref`,
- `visual_ref` or deterministic renderer id,
- object kind,
- electrical ports or a direct binding to an object that owns ports,
- editor/readiness/report target when it is actionable.

## 2. Default Feeder Construction

The default engineering workflow is append-on-endpoint:

1. GPZ bay -> create first SN segment.
2. Segment endpoint B -> terminate in station, ZK SN, pole, NOP, or unfinished draft.
3. Station endpoint -> continue the feeder from the station output port.
4. Next segment starts at the station output port.

Reading order must be:

`GPZ bay -> segment 500 m -> station ST-01 -> segment 700 m -> station ST-02`

The default flow must not insert a station into the middle of an existing segment.

## 3. Conscious Split

Splitting an existing segment is a separate command:

`segment -> Wstaw obiekt w istniejącym odcinku`

Before applying the operation, UI must show:

- original segment A-B,
- new object X,
- new segment A-X,
- new segment X-B,
- inherited catalog and length policy,
- calculation/report invalidation impact.

Canceling split must leave no half-created objects.

## 4. Required Port Kinds

Station ports:

- `SN_WEJSCIE`,
- `SN_WYJSCIE`,
- `SN_ODGALEZIENIE`,
- `SN_POLE_TRANSFORMATOROWE`,
- `SN_PV`,
- `SN_BESS`,
- `SN_FW`,
- `NN_SZYNOWY`,
- `NN_ODBIOR`,
- `NN_PV`,
- `NN_BESS`,
- `NN_FW`,
- `PCC`.

Segment ports:

- endpoint A port,
- endpoint B port,
- voltage level,
- compatible connection kinds,
- occupancy status.

## 5. Compatibility

Connections are valid only when:

- both endpoints exist,
- both endpoints are compatible,
- voltage level is known and compatible,
- segment kind is SN cable or SN overhead line,
- DER has station context and PCC,
- route geometry attaches to port anchors, not to the center of a symbol.

## 6. Current Implementation Hook Points

- `frontend/src/ui/sld/v2/core/ports.ts` owns frontend port contracts.
- `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts` projects ENM/logical views into SLD props.
- `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx` routes SLD interactions.
- `frontend/src/ui/sld/v2/canvas/SldWorkspaceContainer.tsx` opens route surfaces and operation forms.
- Backend ENM port source: `backend/src/enm/models.py` and domain operations in `backend/src/enm/domain_operations.py`.

## 7. Test Requirements

- append station on endpoint does not split an existing segment,
- conscious split requires explicit command and preview,
- every segment has two endpoint ports,
- every station has input/output/branch ports according to topology,
- right-click build actions open real operation forms,
- field click selects `BaySN`, not whole GPZ.
