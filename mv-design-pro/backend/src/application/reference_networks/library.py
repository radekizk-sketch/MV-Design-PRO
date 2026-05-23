"""Reference Network Registry — central catalog of validation networks."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal

EXPECTED_DIR = Path(__file__).parent / "expected"

# Type alias for supported solver names
SolverKind = Literal[
    "power_flow_newton",
    "power_flow_gauss_seidel",
    "power_flow_fast_decoupled",
    "power_flow_unbalanced_bfs",
    "short_circuit_iec60909",
    "dynamic_stability",
]


@dataclass(frozen=True)
class ReferenceNetwork:
    """Single reference network registry entry."""

    id: str
    name_pl: str
    description_pl: str
    source: str
    voltage_kv: float
    has_der: bool
    is_unbalanced: bool
    supported_solvers: tuple[SolverKind, ...]
    builder_fn: Callable[[], dict[str, Any]]
    expected_filename: str  # filename relative to EXPECTED_DIR

    @property
    def expected_path(self) -> Path:
        return EXPECTED_DIR / self.expected_filename

    def to_summary_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name_pl": self.name_pl,
            "description_pl": self.description_pl,
            "source": self.source,
            "voltage_kv": self.voltage_kv,
            "has_der": self.has_der,
            "is_unbalanced": self.is_unbalanced,
            "supported_solvers": list(self.supported_solvers),
        }


# Lazy import of builders to avoid circular deps during module init
def _ieee_4bus_builder() -> dict[str, Any]:
    from application.reference_networks.builders.ieee_4bus import build_ieee_4bus_network

    return build_ieee_4bus_network()


def _iec60909_example_builder() -> dict[str, Any]:
    from application.reference_networks.builders.iec60909_example import (
        build_iec60909_example_network,
    )

    return build_iec60909_example_network()


def _cigre_mv_builder() -> dict[str, Any]:
    from application.reference_networks.builders.cigre_mv import build_cigre_mv_network

    return build_cigre_mv_network()


def _pp_simple_4bus_builder() -> dict[str, Any]:
    from application.reference_networks.builders.pp_simple_four_bus import (
        build_pp_simple_four_bus_network,
    )

    return build_pp_simple_four_bus_network()


def _oze_pv_bess_builder() -> dict[str, Any]:
    from application.reference_networks.builders.oze_pv_bess import build_oze_pv_bess_network

    return build_oze_pv_bess_network()


def _ieee_13bus_builder() -> dict[str, Any]:
    from application.reference_networks.builders.ieee_13bus import build_ieee_13bus_network

    return build_ieee_13bus_network()


def _ieee_34bus_builder() -> dict[str, Any]:
    from application.reference_networks.builders.ieee_34bus import build_ieee_34bus_network

    return build_ieee_34bus_network()


def _cigre_lv_builder() -> dict[str, Any]:
    from application.reference_networks.builders.cigre_lv_benchmark import (
        build_cigre_lv_benchmark_network,
    )

    return build_cigre_lv_benchmark_network()


# Central registry. Order matters for UI display (priority).
REFERENCE_NETWORK_REGISTRY: dict[str, ReferenceNetwork] = {
    "ieee-4bus": ReferenceNetwork(
        id="ieee-4bus",
        name_pl="IEEE 4-bus",
        description_pl="Klasyczna sieć 4-węzłowa do walidacji rozpływu mocy NR. Pojedynczy slack, 2 PQ buses, jeden PV bus.",
        source="Stevenson, Elements of Power System Analysis (1982), Example 9.5, p.337",
        voltage_kv=132.0,
        has_der=False,
        is_unbalanced=False,
        supported_solvers=("power_flow_newton",),
        builder_fn=_ieee_4bus_builder,
        expected_filename="ieee_4bus.json",
    ),
    "iec60909-example": ReferenceNetwork(
        id="iec60909-example",
        name_pl="IEC 60909 Example",
        description_pl="Sieć 33/11 kV z normy IEC 60909-4, walidacja prądów zwarciowych Ik''/ip/ith dla 4 typów zwarć.",
        source="IEC 60909-4:2000 Examples for the calculation of short-circuit currents, Section 4",
        voltage_kv=11.0,
        has_der=False,
        is_unbalanced=False,
        supported_solvers=("short_circuit_iec60909",),
        builder_fn=_iec60909_example_builder,
        expected_filename="iec60909_example.json",
    ),
    "cigre-mv-14": ReferenceNetwork(
        id="cigre-mv-14",
        name_pl="CIGRE MV 14-bus",
        description_pl="Europejska sieć średniego napięcia 20 kV (14 węzłów) z PV. Benchmark CIGRE TF C6.04.02.",
        source="CIGRE TF C6.04.02 (2014), Benchmark Systems for Network Integration of DER, Section 6",
        voltage_kv=20.0,
        has_der=True,
        is_unbalanced=False,
        supported_solvers=("power_flow_newton", "short_circuit_iec60909"),
        builder_fn=_cigre_mv_builder,
        expected_filename="cigre_mv.json",
    ),
    "pp-simple-4bus": ReferenceNetwork(
        id="pp-simple-4bus",
        name_pl="Pandapower simple 4-bus",
        description_pl="Prosta sieć z pandapower.networks.example_simple() — cross-check NR solver vs pandapower offline.",
        source="pandapower.networks.example_simple() (deterministic Newton-Raphson)",
        voltage_kv=20.0,
        has_der=False,
        is_unbalanced=False,
        supported_solvers=("power_flow_newton",),
        builder_fn=_pp_simple_4bus_builder,
        expected_filename="pp_simple_four_bus.json",
    ),
    "oze-pv-bess": ReferenceNetwork(
        id="oze-pv-bess",
        name_pl="OZE PV+BESS",
        description_pl="Sieć z fotowoltaiką i magazynem energii — walidacja PF + SC + FRT trajectory z OZE.",
        source="Custom; expected via pandapower cross-check; NC RfG Annex II compliant",
        voltage_kv=15.0,
        has_der=True,
        is_unbalanced=False,
        supported_solvers=(
            "power_flow_newton",
            "short_circuit_iec60909",
            "dynamic_stability",
        ),
        builder_fn=_oze_pv_bess_builder,
        expected_filename="oze_pv_bess.json",
    ),
    "ieee-13bus": ReferenceNetwork(
        id="ieee-13bus",
        name_pl="IEEE 13-bus distribution feeder",
        description_pl="Standardowy unbalanced radial feeder 4.16 kV — IEEE PES Test Feeders WG. Test BFS solver.",
        source="Kersting W.H. (2001), 'Radial Distribution Test Feeders', IEEE Trans. PWRS 6(3) p.975",
        voltage_kv=4.16,
        has_der=False,
        is_unbalanced=True,
        supported_solvers=("power_flow_unbalanced_bfs",),
        builder_fn=_ieee_13bus_builder,
        expected_filename="ieee_13bus.json",
    ),
    "ieee-34bus": ReferenceNetwork(
        id="ieee-34bus",
        name_pl="IEEE 34-bus distribution feeder",
        description_pl="Dłuższy unbalanced radial feeder 24.9 kV z regulatorami. IEEE PES Test Feeders WG.",
        source="Kersting W.H. (2001), 'Radial Distribution Test Feeders', IEEE Trans. PWRS 6(3) p.975",
        voltage_kv=24.9,
        has_der=False,
        is_unbalanced=True,
        supported_solvers=("power_flow_unbalanced_bfs",),
        builder_fn=_ieee_34bus_builder,
        expected_filename="ieee_34bus.json",
    ),
    "cigre-lv-benchmark": ReferenceNetwork(
        id="cigre-lv-benchmark",
        name_pl="CIGRE LV residential",
        description_pl="Europejska sieć niskiego napięcia 0.4 kV z residential PV. Benchmark CIGRE TF C6.04.02 Section 7.",
        source="CIGRE TF C6.04.02 (2014), Benchmark Systems for Network Integration of DER, Section 7",
        voltage_kv=0.4,
        has_der=True,
        is_unbalanced=False,
        supported_solvers=("power_flow_newton",),
        builder_fn=_cigre_lv_builder,
        expected_filename="cigre_lv_benchmark.json",
    ),
}


def list_reference_networks() -> list[ReferenceNetwork]:
    """Return all reference networks (deterministic order = registry dict order)."""
    return list(REFERENCE_NETWORK_REGISTRY.values())


def get_reference_network(network_id: str) -> ReferenceNetwork:
    """Get single network by ID; raises KeyError if not found."""
    if network_id not in REFERENCE_NETWORK_REGISTRY:
        raise KeyError(f"Unknown reference network: {network_id}")
    return REFERENCE_NETWORK_REGISTRY[network_id]
