"""
FaultLoopInputBuilder — P0.5 step 3 scaffolding.

Helper łączący NetworkGraph + manual overrides w FaultLoopInput gotowy do
przekazania do compute_fault_loop().

STATUS: SCAFFOLDING (MVP — caller dostarcza komponenty explicit;
auto-extract z catalog deferred do P0.5b).

Reference:
- network_model/solvers/fault_loop_iec60364.py — solver
- application/analysis_run/service.py:368-380 — stub do zastąpienia w P0.5b
- Audyt specjalisty: step 3 z 5-step MVP plan

DLACZEGO scaffolding, nie full auto-extract:
- Pełna ekstrakcja R+X z NetworkGraph wymaga: catalog cable types lookup,
  rozróżnienia TN-S vs TN-C-S (current data model ENM nie rozdziela jawnie),
  oraz mapowania transformer.uk_percent → Z_TR_LV. To 4-5 OD pełnego rozwoju.
- Ten module dostarcza minimalny scaffolding gotowy do podpięcia w
  service.py kiedy ENM warstwa będzie ready.

INVARIANTS:
- Pure function: NetworkGraph + manual params → FaultLoopInput
- NO physics calculations (tylko transformacje danych)
- NO heuristics — caller dostarcza wszystkie wymagane komponenty
- Determinizm
"""

from __future__ import annotations

from dataclasses import dataclass

from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopInput,
    LoopImpedanceComponent,
    NetworkType,
    ProtectionArrangement,
)


@dataclass(frozen=True)
class FaultLoopBuildRequest:
    """
    Request dla builder'a — caller dostarcza identyfikator + komponenty.

    MVP: caller explicit dostarcza wszystkie komponenty. Auto-extract z
    NetworkGraph + catalog deferred do P0.5b.
    """

    fault_node_id: str
    u_nom_v: float  # napięcie znamionowe fazowe LV [V]
    network_type: NetworkType
    protection_arrangement: ProtectionArrangement

    # Komponenty obowiązkowe (3) — caller dostarcza po extract'cie z catalog
    phase_conductor_r_ohm: float
    phase_conductor_x_ohm: float
    return_conductor_r_ohm: float
    return_conductor_x_ohm: float
    transformer_r_ohm: float
    transformer_x_ohm: float

    # Opcjonalna upstream impedancja (SN side Thevenin)
    upstream_r_ohm: float | None = None
    upstream_x_ohm: float | None = None

    # Opisowe labelki (po polsku) dla audytu — opcjonalne, defaults bezpieczne
    phase_label: str = "Przewód fazowy L"
    return_label: str = "Przewód powrotny (PE/PEN)"
    transformer_label: str = "Transformator SN/NN"
    upstream_label: str = "Sieć SN (upstream Thevenin)"


def build_fault_loop_input(request: FaultLoopBuildRequest) -> FaultLoopInput:
    """
    Konstruuje FaultLoopInput z deterministycznych komponentów dostarczonych
    przez caller'a.

    NO HEURISTICS — caller dostarcza wszystkie liczby explicit. Builder tylko
    układa je w wymaganą strukturę (LoopImpedanceComponent + FaultLoopInput).

    Returns:
        FaultLoopInput gotowy do przekazania do compute_fault_loop().

    Raises:
        ValueError: gdy nie ustawione obie liczby upstream (R i X) jednocześnie.
                   Albo OBIE są None (no upstream), albo OBIE są float (upstream).
    """
    upstream: LoopImpedanceComponent | None = None
    has_r = request.upstream_r_ohm is not None
    has_x = request.upstream_x_ohm is not None
    if has_r != has_x:
        raise ValueError(
            "upstream_r_ohm i upstream_x_ohm MUSZĄ być oba None (no upstream) "
            "lub oba ustawione na float. Brak konsystencji w danych."
        )
    if has_r and has_x:
        upstream = LoopImpedanceComponent(
            label=request.upstream_label,
            r_ohm=request.upstream_r_ohm,  # type: ignore[arg-type]
            x_ohm=request.upstream_x_ohm,  # type: ignore[arg-type]
        )

    return FaultLoopInput(
        fault_node_id=request.fault_node_id,
        u_nom_v=request.u_nom_v,
        phase_conductor=LoopImpedanceComponent(
            label=request.phase_label,
            r_ohm=request.phase_conductor_r_ohm,
            x_ohm=request.phase_conductor_x_ohm,
        ),
        return_conductor=LoopImpedanceComponent(
            label=request.return_label,
            r_ohm=request.return_conductor_r_ohm,
            x_ohm=request.return_conductor_x_ohm,
        ),
        transformer_impedance=LoopImpedanceComponent(
            label=request.transformer_label,
            r_ohm=request.transformer_r_ohm,
            x_ohm=request.transformer_x_ohm,
        ),
        upstream_impedance=upstream,
        network_type=request.network_type,
        protection_arrangement=request.protection_arrangement,
    )
