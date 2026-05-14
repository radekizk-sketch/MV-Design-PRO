"""
Fault Loop Impedance Solver for LV networks (IEC 60364-4-41).

P0.5 / V12K — MVP solver dla pętli zwarciowej po stronie nN.

Reference:
- IEC 60364-4-41:2017 — Protection against electric shock
- IEC 60909-0:2016 — Short-circuit currents in three-phase a.c. systems
- docs/audit/IMPLEMENTATION_GAP_ANALYSIS.md § 2.5 (Fault-loop NN gap)
- docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md § 3.3

STATUS: MVP (single station, TN-S, TN-C-S)
WHITE BOX: pełen trace dla każdej decyzji (audytowalne).

Scope MVP (krok 2 audytu):
- Wyłącznie TN-S, TN-C-S, TN-C (TT/IT deferred)
- Pojedyncza stacja SN→nN z jednym transformatorem
- Pojedynczy punkt zwarcia (jeden bus LV)
- Caller dostarcza LoopImpedanceComponent (R+X) explicit per kabel + transformator;
  Future P0.5b: auto-extract komponentów z NetworkGraph + catalog LV cable types

Co solver NIE robi:
- TT (oddzielne uziemienie) — deferred
- IT (izolowany neutral) — deferred
- Multi-transformer parallel — deferred
- Dynamic device behavior (RCD, MZO time-current curves) — read-only consumption
  (kiedy device data available, solver only oblicza Z_loop, NIE decyduje czy
  protection clear w czasie)

INVARIANTS:
- No heuristics (per V12.xx canon — patrz scripts/load_flow_no_heuristics_guard.py)
- Deterministyczne (same input → identical output)
- WHITE BOX trace dla każdego kroku
- Frozen dataclasses
- Polskie etykiety w komunikatach błędów
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class NetworkType(str, Enum):
    """Typ uziemienia sieci nN per IEC 60364-3."""

    TN_S = "TN-S"  # Separate neutral + protective conductors
    TN_C_S = "TN-C-S"  # Combined PEN, separated near load (typowy dla osiedli mieszkalnych w PL)
    TN_C = "TN-C"  # Combined PEN cały sposób (deprecated, ale legacy)
    TT = "TT"  # Separate earthing (deferred)
    IT = "IT"  # Isolated neutral (deferred)


class ProtectionArrangement(str, Enum):
    """Sposób ochrony przed dotykiem pośrednim."""

    PE = "PE"  # Oddzielny przewód ochronny (TN-S)
    PEN = "PEN"  # Łączony przewód neutralno-ochronny (TN-C-S)
    NONE = "NONE"  # Bez ochronnika (TT / IT — specific arrangements)


# Frozen impedance components (re/im in ohms)
@dataclass(frozen=True)
class LoopImpedanceComponent:
    """Impedancja składowa pętli zwarcia (Z = R + jX)."""

    label: str  # human-readable, polskie
    r_ohm: float
    x_ohm: float

    @property
    def magnitude_ohm(self) -> float:
        return math.sqrt(self.r_ohm**2 + self.x_ohm**2)

    @property
    def as_complex(self) -> complex:
        return complex(self.r_ohm, self.x_ohm)


@dataclass(frozen=True)
class FaultLoopResult:
    """
    Wynik analizy pętli zwarcia po stronie nN (IEC 60364-4-41).

    Frozen + WHITE BOX trace. Solver tylko liczy impedancje + Ik;
    decyzję o disconnection time podejmuje WARSTWA WYŻSZA (analyst lub
    protection coordination engine).
    """

    fault_node_id: str
    network_type: NetworkType
    protection_arrangement: ProtectionArrangement
    u_nom_v: float  # napięcie znamionowe fazowe [V]

    # Skladowe impedancji pętli
    components: tuple[LoopImpedanceComponent, ...]

    # Wyniki obliczeń
    z_loop_ohm: complex  # R + jX całkowite [Ω]
    ik_min_a: float  # min current per c_factor 0.95 (cold-system case)
    ik_max_a: float  # max current per c_factor 1.05 (hot-system case)

    # Determinizm + audyt
    white_box_trace: tuple[dict[str, Any], ...] = field(default_factory=tuple)

    @property
    def z_loop_magnitude_ohm(self) -> float:
        return abs(self.z_loop_ohm)

    def to_dict(self) -> dict[str, Any]:
        """Serialize per V12.xx canonical pattern (complex → re/im)."""
        return {
            "fault_node_id": self.fault_node_id,
            "network_type": self.network_type.value,
            "protection_arrangement": self.protection_arrangement.value,
            "u_nom_v": self.u_nom_v,
            "components": [
                {
                    "label": c.label,
                    "r_ohm": c.r_ohm,
                    "x_ohm": c.x_ohm,
                    "magnitude_ohm": c.magnitude_ohm,
                }
                for c in self.components
            ],
            "z_loop_ohm": {
                "re": self.z_loop_ohm.real,
                "im": self.z_loop_ohm.imag,
                "magnitude": self.z_loop_magnitude_ohm,
            },
            "ik_min_a": self.ik_min_a,
            "ik_max_a": self.ik_max_a,
            "white_box_trace": list(self.white_box_trace),
        }


# ---------------------------------------------------------------------------
# Solver
# ---------------------------------------------------------------------------


# c_factor per IEC 60909-0 § 5.3.2 — Table 1, low-voltage (≤ 1 kV) systems.
C_MIN_LV = 0.95
C_MAX_LV = 1.05


@dataclass(frozen=True)
class FaultLoopInput:
    """Input minimalny dla MVP — pojedyncza stacja, jeden bus LV."""

    fault_node_id: str  # bus LV gdzie zwarcie
    u_nom_v: float  # napięcie nominalne fazowe LV [V], typowo 230
    # Komponenty pętli — caller dostarcza, solver sumuje.
    # MVP: pre-computed; future: extracted z NetworkGraph
    phase_conductor: LoopImpedanceComponent  # R + jX przewodu fazowego (L)
    return_conductor: LoopImpedanceComponent  # R + jX PEN/PE
    transformer_impedance: LoopImpedanceComponent  # Z TR sprowadzony do LV
    upstream_impedance: LoopImpedanceComponent | None = None  # opcjonalna SN side
    network_type: NetworkType = NetworkType.TN_S
    protection_arrangement: ProtectionArrangement = ProtectionArrangement.PE


def _validate_input(data: FaultLoopInput) -> None:
    """Walidacja MVP — wymusza tylko bazowy sanity (no heuristics)."""
    if data.u_nom_v <= 0:
        raise ValueError(
            f"u_nom_v MUSI być > 0 V, otrzymano {data.u_nom_v}. "
            "Sprawdź wejście — brak nominal voltage z NetworkGraph."
        )
    if data.network_type in (NetworkType.TT, NetworkType.IT):
        raise NotImplementedError(
            f"Typ sieci {data.network_type.value} nie jest objęty MVP "
            "(deferred do P0.5b). MVP obsługuje TN-S, TN-C-S, TN-C."
        )
    for label, comp in (
        ("phase_conductor", data.phase_conductor),
        ("return_conductor", data.return_conductor),
        ("transformer_impedance", data.transformer_impedance),
    ):
        if comp.r_ohm < 0 or comp.x_ohm < 0:
            raise ValueError(
                f"Składowa '{label}' ma ujemną R lub X "
                f"(R={comp.r_ohm}, X={comp.x_ohm}). "
                "Impedancje fizyczne MUSZĄ być nieujemne."
            )


def compute_fault_loop(data: FaultLoopInput) -> FaultLoopResult:
    """
    Oblicz impedancję pętli zwarcia + Ik per IEC 60364-4-41.

    WHITE BOX: każdy krok obliczeniowy zapisany w white_box_trace.

    Equation (IEC 60364-4-41 § 411.4.4):
        Z_loop = Z_phase + Z_return + Z_transformer (+ Z_upstream optional)
        I_k = c * U_n / |Z_loop|

    gdzie:
        c — factor napięciowy IEC 60909-0 § 5.3.2 (LV: c_min=0.95, c_max=1.05)
        U_n — napięcie fazowe [V] (typowo 230 V dla 400/230 sieci 3F4W)
    """
    _validate_input(data)
    trace: list[dict[str, Any]] = []

    # Krok 1: zsumuj komponenty pętli (R i X osobno)
    components = [
        data.phase_conductor,
        data.return_conductor,
        data.transformer_impedance,
    ]
    if data.upstream_impedance is not None:
        components.append(data.upstream_impedance)

    z_loop_complex = sum(
        (c.as_complex for c in components),
        start=complex(0, 0),
    )

    trace.append(
        {
            "step": "sum_components",
            "method": "Z_loop = Σ(R_i + jX_i)",
            "components": [
                {"label": c.label, "r_ohm": c.r_ohm, "x_ohm": c.x_ohm}
                for c in components
            ],
            "result": {
                "r_total_ohm": z_loop_complex.real,
                "x_total_ohm": z_loop_complex.imag,
                "magnitude_ohm": abs(z_loop_complex),
            },
        }
    )

    z_magnitude = abs(z_loop_complex)
    # CR-FIX (code-review KRYTYCZNE #2): guard przeciw bardzo małemu Z.
    # Z_loop < 1 µΩ jest fizycznie niemożliwe dla realnej sieci nN
    # (PowerSCC dowolnego rozdzielacza ogranicza Ik do max ~100 kA).
    # Bez tego guard'a ekstremalnie małe Z dawały Ik daleko poza zakresem
    # IEEE 754 i nadawały overflow JSON.
    Z_MIN_OHM = 1e-6
    if z_magnitude < Z_MIN_OHM:
        raise ValueError(
            f"Z_loop = {z_magnitude:.3e} Ω < {Z_MIN_OHM:.0e} Ω — pętla zerowa lub "
            "fizycznie niemożliwa (degenerated case). Realna nN ma Z_loop "
            "≥ kilkudziesięciu mΩ. Sprawdź dane wejściowe."
        )

    # Krok 2: oblicz Ik z c_factor MIN/MAX
    ik_min = (C_MIN_LV * data.u_nom_v) / z_magnitude
    ik_max = (C_MAX_LV * data.u_nom_v) / z_magnitude

    trace.append(
        {
            "step": "compute_ik",
            "method": "I_k = c * U_n / |Z_loop|",
            "c_min": C_MIN_LV,
            "c_max": C_MAX_LV,
            "u_nom_v": data.u_nom_v,
            "z_magnitude_ohm": z_magnitude,
            "ik_min_a": ik_min,
            "ik_max_a": ik_max,
        }
    )

    return FaultLoopResult(
        fault_node_id=data.fault_node_id,
        network_type=data.network_type,
        protection_arrangement=data.protection_arrangement,
        u_nom_v=data.u_nom_v,
        components=tuple(components),
        z_loop_ohm=z_loop_complex,
        ik_min_a=ik_min,
        ik_max_a=ik_max,
        white_box_trace=tuple(trace),
    )
