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

import math
from collections.abc import Sequence
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


@dataclass(frozen=True)
class TransformerLoopImpedance:
    """Impedancja transformatora sprowadzona do strony nN (R+jX) [Ω]."""

    r_ohm: float
    x_ohm: float


def transformer_lv_impedance_ohm(
    *, sn_mva: float, uk_percent: float, ulv_kv: float, pk_kw: float | None
) -> TransformerLoopImpedance:
    """Impedancja transformatora sprowadzona do strony nN (G-STK-4).

    IEC 60909 / model transformatora dwuuzwojeniowego:
        Z_base = U_lv² / S_n            [Ω]  (U_lv w kV, S_n w MVA)
        z_pu = uk% / 100
        r_pu = P_k / (S_n · 1000)       (P_k w kW, S_n·1000 = S_n w kVA)
        x_pu = sqrt(max(z_pu² − r_pu², 0))
        R = r_pu · Z_base ; X = x_pu · Z_base

    Gdy ``pk_kw`` brak/0 → przyjmujemy R=0, X=Z (transformator czysto reaktancyjny —
    jawny, bez zgadywania stratności). Funkcja czysta (warstwa solvera, WHITE BOX).
    """
    if sn_mva <= 0 or ulv_kv <= 0 or uk_percent <= 0:
        raise ValueError(
            "sn_mva, ulv_kv i uk_percent muszą być dodatnie do wyznaczenia Z transformatora."
        )
    z_base = (ulv_kv**2) / sn_mva
    z_pu = uk_percent / 100.0
    r_pu = (pk_kw / (sn_mva * 1000.0)) if pk_kw and pk_kw > 0 else 0.0
    r_pu = min(r_pu, z_pu)  # R nie może przekroczyć |Z|
    x_pu = math.sqrt(max(z_pu**2 - r_pu**2, 0.0))
    return TransformerLoopImpedance(r_ohm=r_pu * z_base, x_ohm=x_pu * z_base)


# ---------------------------------------------------------------------------
# P0.6 — pętla zwarcia z REALNEJ trasy grafu (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md
# §P0.6, luka G-05). Warstwa aplikacji (application/analyses/fault_loop/route.py)
# wykonuje BFS po topologii ENM i wylawia surowe dane odcinkow (bez fizyki —
# tylko odczyt pol galezi); PONIZSZE funkcje sa jedynym miejscem, gdzie te
# surowe dane skladaja sie w impedancje (sumowanie, dzielenie przez n_parallel,
# przeliczenie pu->Ω, przeliczenie przez przekladnie) — zgodnie z regula
# solvera (PHYSICS HERE ONLY).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RouteSegmentImpedance:
    """Jeden odcinek trasy (kabel nN) — dane SUROWE, nieprzeskalowane.

    ``*_total_r_ohm``/``*_total_x_ohm`` to R/X CAŁEGO odcinka (już
    ``r_ohm_per_km * length_km``, PRZED podziałem przez ``n_parallel``) — samo
    mnożenie przez długość jest odczytem danych (warstwa aplikacji), nie
    fizyką; dzielenie N identycznych torów równoległych na Z/n JEST fizyką
    (ta sama zasada co ``Transformer.n_parallel`` — patrz
    ``enm/mapping.py::map_enm_to_network_graph``) i zostaje TU.
    """

    label: str
    branch_ref: str
    phase_total_r_ohm: float
    phase_total_x_ohm: float
    return_total_r_ohm: float
    return_total_x_ohm: float
    n_parallel: int = 1

    def __post_init__(self) -> None:
        if self.n_parallel < 1:
            raise ValueError(
                f"Odcinek '{self.branch_ref}': n_parallel musi być ≥ 1, "
                f"otrzymano {self.n_parallel}."
            )
        for name, value in (
            ("phase_total_r_ohm", self.phase_total_r_ohm),
            ("phase_total_x_ohm", self.phase_total_x_ohm),
            ("return_total_r_ohm", self.return_total_r_ohm),
            ("return_total_x_ohm", self.return_total_x_ohm),
        ):
            if value < 0:
                raise ValueError(
                    f"Odcinek '{self.branch_ref}': {name} musi być ≥ 0, otrzymano {value}."
                )


def sum_phase_and_return_route(
    segments: Sequence[RouteSegmentImpedance],
    *,
    phase_label: str = "Przewód fazowy L (trasa)",
    return_label: str = "Przewód powrotny PE/PEN (trasa)",
) -> tuple[LoopImpedanceComponent, LoopImpedanceComponent]:
    """Sumuje odcinki trasy na dwie składowe pętli: fazową i powrotną.

    Dla każdego odcinka: ``R_eff = R_total / n_parallel`` (n identycznych
    torów równoległych na tej samej trasie — ta sama zasada co
    ``Transformer.n_parallel``, Z/n). Odcinki sumują się szeregowo (trasa
    promieniowa punkt→transformator).

    Pusta lista odcinków (zwarcie DOKŁADNIE na szynie nN transformatora,
    trasa zerodługościowa) zwraca składowe zerowe — zgodne z dotychczasowym
    zachowaniem ``build_station_fault_loop_view`` (phase=return=0 na źródle).
    """
    phase_r = 0.0
    phase_x = 0.0
    return_r = 0.0
    return_x = 0.0
    for seg in segments:
        phase_r += seg.phase_total_r_ohm / seg.n_parallel
        phase_x += seg.phase_total_x_ohm / seg.n_parallel
        return_r += seg.return_total_r_ohm / seg.n_parallel
        return_x += seg.return_total_x_ohm / seg.n_parallel
    return (
        LoopImpedanceComponent(label=phase_label, r_ohm=phase_r, x_ohm=phase_x),
        LoopImpedanceComponent(label=return_label, r_ohm=return_r, x_ohm=return_x),
    )


def zero_sequence_transformer_loop_impedance_ohm(
    *, z0_pu: complex, ulv_kv: float, s_base_mva: float
) -> TransformerLoopImpedance:
    """Impedancja zerowa transformatora (Ω, strona nN) z per-unit na S_base.

    Konwersja jednostek pu→Ω (Z_ohm = z0_pu · U_lv²/S_base) — WHITE BOX, żadna
    decyzja fizyczna (typ połączenia sekwencji zerowej, obecność drogi
    uziemienia) nie zapada tutaj: ``z0_pu`` pochodzi z
    ``enm.zero_sequence_transformer.build_transformer_zero_seq_model`` (reuse
    — zero własnej redukcji sieci sekwencji zerowej), warstwa aplikacji
    dostarcza już gotową wartość (albo odmawia liczenia pętli, gdy
    transformator nie ma lokalnej drogi uziemienia strony nN — zob.
    ``application/analyses/fault_loop/route.py``).
    """
    if ulv_kv <= 0 or s_base_mva <= 0:
        raise ValueError("ulv_kv i s_base_mva muszą być dodatnie do konwersji Z0 pu→Ω.")
    z_base = (ulv_kv**2) / s_base_mva
    z0_ohm = z0_pu * z_base
    return TransformerLoopImpedance(r_ohm=z0_ohm.real, x_ohm=z0_ohm.imag)


def refer_upstream_impedance_to_lv_ohm(
    *,
    z_hv_ohm: complex,
    uhv_kv: float,
    ulv_kv: float,
    label: str = "Sieć SN (upstream Thevenin, sprowadzone do nN)",
) -> LoopImpedanceComponent:
    """Sprowadza impedancję Thevenina zmierzoną w Ω na zaciskach HV transformatora
    do strony nN przez kwadrat przekładni: Z_LV = Z_HV · (U_LV / U_HV)².

    Standardowe przeliczenie impedancji przez idealny transformator (ta sama
    zasada co zmiana bazy napięciowej w ``AdmittanceMatrixBuilder`` —
    ``network_model/core/ybus.py``). ``z_hv_ohm`` pochodzi z Z-bus istniejącego
    solvera zwarciowego (``short_circuit_core.build_zbus`` — reuse, zero
    własnej redukcji sieci).
    """
    if uhv_kv <= 0 or ulv_kv <= 0:
        raise ValueError("uhv_kv i ulv_kv muszą być dodatnie do przeliczenia przekładni.")
    ratio_squared = (ulv_kv / uhv_kv) ** 2
    z_lv = z_hv_ohm * ratio_squared
    return LoopImpedanceComponent(label=label, r_ohm=z_lv.real, x_ohm=z_lv.imag)
