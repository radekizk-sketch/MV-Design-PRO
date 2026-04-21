from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.solvers.short_circuit_contributions import (
    ShortCircuitBranchContribution,
    ShortCircuitSourceContribution,
    SourceType,
)
from network_model.solvers.short_circuit_core import (
    OMEGA_50HZ,
    ShortCircuitPostProcessResult,
    ShortCircuitType,
    compute_equivalent_impedance,
    compute_ikss,
    compute_post_fault_quantities,
    voltage_factor_for_fault,
)
from network_model.whitebox.tracer import WhiteBoxTracer

C_MIN: float = 0.95
C_MAX: float = 1.10


# -----------------------------------------------------------------------------
# Result API Contract - Stabilne pola wyniku IEC 60909
# Poniższa lista definiuje gwarantowany kontrakt pól w to_dict().
# -----------------------------------------------------------------------------
EXPECTED_SHORT_CIRCUIT_RESULT_KEYS: list[str] = [
    "short_circuit_type",
    "fault_node_id",
    "c_factor",
    "un_v",
    "zkk_ohm",
    "rx_ratio",
    "kappa",
    "tk_s",
    "tb_s",
    "ikss_a",
    "ip_a",
    "ith_a",
    "ib_a",
    "sk_mva",
    "ik_thevenin_a",
    "ik_inverters_a",
    "ik_total_a",
    "contributions",
    "branch_contributions",
    "white_box_trace",
]


@dataclass(frozen=True)
class ShortCircuitResult:
    """
    Wynik obliczeń zwarciowych IEC 60909.

    Canonical API fields (jednostki SI / branżowe):
        short_circuit_type: ShortCircuitType - typ zwarcia (3F/2F/1F/2F+G)
        fault_node_id: str - identyfikator węzła zwarcia
        c_factor: float - współczynnik napięciowy c (0.95–1.10)
        un_v: float - napięcie znamionowe w punkcie zwarcia [V]
        zkk_ohm: complex - impedancja zastępcza w punkcie zwarcia Zk [Ω]
        rx_ratio: float - stosunek R/X impedancji zastępczej [-]
        kappa: float - współczynnik udaru κ [-]
        tk_s: float - czas trwania zwarcia [s]
        tb_s: float - czas do obliczenia prądu Ib [s]
        ikss_a: float - prąd zwarciowy początkowy Ik'' [A]
        ip_a: float - prąd udarowy Ip [A]
        ith_a: float - prąd zastępczy cieplny Ith [A]
        ib_a: float - prąd zwarciowy do obliczeń cieplnych Ib [A]
        sk_mva: float - moc zwarciowa Sk'' [MVA]
        ik_thevenin_a: float - wkład sieci Thevenina [A]
        ik_inverters_a: float - wkład źródeł falownikowych [A]
        ik_total_a: float - całkowity prąd zwarciowy [A]
        contributions: list[ShortCircuitSourceContribution] - wkłady źródeł
        branch_contributions: list[ShortCircuitBranchContribution] | None - wkłady gałęzi
        white_box_trace: list[dict] - szczegółowy ślad obliczeń

    Aliasy (dla kompatybilności):
        ik_a -> ikss_a
        ip -> ip_a
        ith -> ith_a
        ib -> ib_a
        sk -> sk_mva
    """

    short_circuit_type: ShortCircuitType
    fault_node_id: str
    c_factor: float
    un_v: float
    zkk_ohm: complex
    ikss_a: float
    ip_a: float
    ith_a: float
    sk_mva: float
    rx_ratio: float
    kappa: float
    tk_s: float
    ib_a: float
    tb_s: float
    ik_thevenin_a: float = 0.0
    ik_inverters_a: float = 0.0
    ik_total_a: float = 0.0
    contributions: list[ShortCircuitSourceContribution] = field(default_factory=list)
    branch_contributions: list[ShortCircuitBranchContribution] | None = None
    white_box_trace: list[dict] = field(default_factory=list)

    # -------------------------------------------------------------------------
    # Aliasy dla kompatybilności wstecznej (preferuj canonical: ikss_a, ip_a, ...)
    # -------------------------------------------------------------------------
    @property
    def ik_a(self) -> float:
        """Alias dla ikss_a (canonical)."""
        return self.ikss_a

    @property
    def ip(self) -> float:
        """Alias dla ip_a (canonical)."""
        return self.ip_a

    @property
    def ith(self) -> float:
        """Alias dla ith_a (canonical)."""
        return self.ith_a

    @property
    def ib(self) -> float:
        """Alias dla ib_a (canonical)."""
        return self.ib_a

    @property
    def sk(self) -> float:
        """Alias dla sk_mva (canonical)."""
        return self.sk_mva

    # -------------------------------------------------------------------------
    # Serializacja JSON-ready
    # -------------------------------------------------------------------------
    def to_dict(self) -> dict:
        """
        Zwraca wynik jako dict z czystymi typami JSON.

        complex -> {"re": float, "im": float}
        Enum -> str (value)
        dataclass contributions -> list[dict]
        numpy types -> native Python types
        """

        def serialize_complex(c: complex) -> dict:
            return {"re": float(c.real), "im": float(c.imag)}

        def serialize_contribution(contrib: ShortCircuitSourceContribution) -> dict:
            return contrib.to_dict()

        def serialize_branch_contribution(
            contrib: ShortCircuitBranchContribution,
        ) -> dict:
            return contrib.to_dict()

        def serialize_value(val):
            """Rekurencyjnie konwertuje wartości do typów JSON-ready."""
            if isinstance(val, complex):
                return serialize_complex(val)
            if hasattr(val, "item"):  # numpy scalar
                return val.item()
            if isinstance(val, dict):
                return {k: serialize_value(v) for k, v in val.items()}
            if isinstance(val, list):
                return [serialize_value(v) for v in val]
            return val

        return {
            "short_circuit_type": self.short_circuit_type.value,
            "fault_node_id": self.fault_node_id,
            "c_factor": float(self.c_factor),
            "un_v": float(self.un_v),
            "zkk_ohm": serialize_complex(self.zkk_ohm),
            "rx_ratio": float(self.rx_ratio),
            "kappa": float(self.kappa),
            "tk_s": float(self.tk_s),
            "tb_s": float(self.tb_s),
            "ikss_a": float(self.ikss_a),
            "ip_a": float(self.ip_a),
            "ith_a": float(self.ith_a),
            "ib_a": float(self.ib_a),
            "sk_mva": float(self.sk_mva),
            "ik_thevenin_a": float(self.ik_thevenin_a),
            "ik_inverters_a": float(self.ik_inverters_a),
            "ik_total_a": float(self.ik_total_a),
            "contributions": [serialize_contribution(c) for c in self.contributions],
            "branch_contributions": (
                [serialize_branch_contribution(c) for c in self.branch_contributions]
                if self.branch_contributions is not None
                else None
            ),
            "white_box_trace": serialize_value(list(self.white_box_trace)),
        }


class ShortCircuitIEC60909Solver:
    @staticmethod
    def _compute_fault_result(
        *,
        short_circuit_type: ShortCircuitType,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        tb_s: float,
        un_v: float,
        z_equiv: complex,
        ikss_thevenin: float,
        ik_inverters: float,
        contributions: list[ShortCircuitSourceContribution],
        branch_contributions: list[ShortCircuitBranchContribution] | None,
        white_box_trace: list[dict],
    ) -> ShortCircuitResult:
        ik_total = ikss_thevenin + ik_inverters
        post = compute_post_fault_quantities(
            ikss=ik_total,
            un_v=un_v,
            z_equiv=z_equiv,
            tk_s=tk_s,
            tb_s=tb_s,
        )

        return ShortCircuitResult(
            short_circuit_type=short_circuit_type,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            un_v=un_v,
            zkk_ohm=z_equiv,
            ikss_a=ik_total,
            ip_a=post.ip_a,
            ith_a=post.ith_a,
            sk_mva=post.sk_mva,
            rx_ratio=post.rx_ratio,
            kappa=post.kappa,
            tk_s=tk_s,
            ib_a=post.ib_a,
            tb_s=tb_s,
            ik_thevenin_a=ikss_thevenin,
            ik_inverters_a=ik_inverters,
            ik_total_a=ik_total,
            contributions=contributions,
            branch_contributions=branch_contributions,
            white_box_trace=white_box_trace,
        )

    @staticmethod
    def _format_complex(value: complex) -> str:
        real = f"{value.real:.6g}"
        imag = f"{abs(value.imag):.6g}"
        sign = "+" if value.imag >= 0 else "-"
        return f"{real}{sign}j{imag}"

    @staticmethod
    def _format_float(value: float) -> str:
        return f"{value:.6g}"

    @staticmethod
    def _format_complex_latex(value: complex) -> str:
        real = f"{value.real:.6g}"
        imag = f"{abs(value.imag):.6g}"
        sign = "+" if value.imag >= 0 else "-"
        return f"\\left({real} {sign} j {imag}\\right)"

    @staticmethod
    def _build_white_box_trace(
        *,
        short_circuit_type: ShortCircuitType,
        fault_node_id: str,
        c_factor: float,
        un_v: float,
        tk_s: float,
        tb_s: float,
        z_equiv: complex,
        z1: complex,
        z2: complex,
        z0: complex | None,
        ikss_a: float,
        post: ShortCircuitPostProcessResult,
    ) -> list[dict]:
        tracer = WhiteBoxTracer()
        z_equiv_abs = abs(z_equiv)
        voltage_factor = voltage_factor_for_fault(short_circuit_type)

        z_inputs = {
            "z1_ohm": z1,
            "z2_ohm": z2,
            "fault_node_id": fault_node_id,
            "short_circuit_type": short_circuit_type.value,
        }
        if z0 is not None:
            z_inputs["z0_ohm"] = z0

        if short_circuit_type == ShortCircuitType.THREE_PHASE:
            formula = r"Z_k = Z_1"
            substitution = ShortCircuitIEC60909Solver._format_complex_latex(z1)
        elif short_circuit_type == ShortCircuitType.TWO_PHASE:
            formula = r"Z_k = Z_1 + Z_2"
            substitution = (
                f"{ShortCircuitIEC60909Solver._format_complex_latex(z1)}"
                f" + {ShortCircuitIEC60909Solver._format_complex_latex(z2)}"
            )
        elif short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND:
            formula = r"Z_k = Z_1 + Z_2 + Z_0"
            substitution = (
                f"{ShortCircuitIEC60909Solver._format_complex_latex(z1)}"
                f" + {ShortCircuitIEC60909Solver._format_complex_latex(z2)}"
                f" + {ShortCircuitIEC60909Solver._format_complex_latex(z0 or 0)}"
            )
        else:
            formula = r"Z_k = Z_1 + \frac{Z_2 \cdot Z_0}{Z_2 + Z_0}"
            denominator = z2 + (z0 or 0)
            substitution = (
                f"{ShortCircuitIEC60909Solver._format_complex_latex(z1)}"
                f" + \\frac{{{ShortCircuitIEC60909Solver._format_complex_latex(z2)}"
                f" \\cdot {ShortCircuitIEC60909Solver._format_complex_latex(z0 or 0)}}}"
                f"{{{ShortCircuitIEC60909Solver._format_complex_latex(denominator)}}}"
            )

        tracer.add(
            key="Zk",
            title="Impedancja zastępcza w punkcie zwarcia",
            formula_latex=formula,
            inputs=z_inputs,
            substitution=substitution,
            substitution_latex=substitution,
            result={"z_equiv_ohm": z_equiv},
        )

        tracer.add(
            key="Ikss",
            title="Prąd zwarciowy początkowy symetryczny",
            formula_latex=r"I_{k}'' = \frac{c \cdot U_n \cdot k_U}{\left|Z_k\right|}",
            inputs={
                "c_factor": c_factor,
                "un_v": un_v,
                "voltage_factor": voltage_factor,
                "z_equiv_abs_ohm": z_equiv_abs,
            },
            substitution=(
                f"\\frac{{{ShortCircuitIEC60909Solver._format_float(c_factor)} \\cdot "
                f"{ShortCircuitIEC60909Solver._format_float(un_v)} \\cdot "
                f"{ShortCircuitIEC60909Solver._format_float(voltage_factor)}}}"
                f"{{{ShortCircuitIEC60909Solver._format_float(z_equiv_abs)}}}"
            ),
            substitution_latex=(
                f"\\frac{{{ShortCircuitIEC60909Solver._format_float(c_factor)} \\cdot "
                f"{ShortCircuitIEC60909Solver._format_float(un_v)} \\cdot "
                f"{ShortCircuitIEC60909Solver._format_float(voltage_factor)}}}"
                f"{{{ShortCircuitIEC60909Solver._format_float(z_equiv_abs)}}}"
            ),
            result={"ikss_a": ikss_a},
        )

        r_ohm = z_equiv.real
        x_ohm = z_equiv.imag
        rx_ratio = post.rx_ratio
        tracer.add(
            key="kappa",
            title="Współczynnik udaru",
            formula_latex=r"\kappa = 1.02 + 0.98 \cdot e^{-3 R/X}",
            inputs={"r_ohm": r_ohm, "x_ohm": x_ohm, "rx_ratio": rx_ratio},
            substitution=(
                f"1.02 + 0.98 \\cdot e^{{-3 \\cdot {ShortCircuitIEC60909Solver._format_float(rx_ratio)}}}"
            ),
            substitution_latex=(
                f"1.02 + 0.98 \\cdot e^{{-3 \\cdot {ShortCircuitIEC60909Solver._format_float(rx_ratio)}}}"
            ),
            result={"kappa": post.kappa},
        )

        tracer.add(
            key="Ip",
            title="Prąd udarowy",
            formula_latex=r"I_p = \kappa \cdot \sqrt{2} \cdot I_{k}''",
            inputs={"kappa": post.kappa, "ikss_a": ikss_a},
            substitution=(
                f"{ShortCircuitIEC60909Solver._format_float(post.kappa)}"
                f" \\cdot \\sqrt{{2}} \\cdot {ShortCircuitIEC60909Solver._format_float(ikss_a)}"
            ),
            substitution_latex=(
                f"{ShortCircuitIEC60909Solver._format_float(post.kappa)}"
                f" \\cdot \\sqrt{{2}} \\cdot {ShortCircuitIEC60909Solver._format_float(ikss_a)}"
            ),
            result={"ip_a": post.ip_a},
        )

        ta_s = 0.0 if r_ohm <= 0 or x_ohm <= 0 else x_ohm / (OMEGA_50HZ * r_ohm)
        exp_factor = 0.0 if ta_s <= 0 else np.exp(-tb_s / ta_s)
        tracer.add(
            key="Ib",
            title="Prąd zwarciowy do obliczeń cieplnych",
            formula_latex=r"I_b = I_{k}'' \cdot \sqrt{1 + \left((\kappa - 1)\cdot e^{-t_b/t_a}\right)^2}",
            inputs={
                "ikss_a": ikss_a,
                "kappa": post.kappa,
                "tb_s": tb_s,
                "ta_s": ta_s,
                "exp_factor": exp_factor,
            },
            substitution=(
                f"{ShortCircuitIEC60909Solver._format_float(ikss_a)}"
                f" \\cdot \\sqrt{{1 + \\left(({ShortCircuitIEC60909Solver._format_float(post.kappa)}"
                f" - 1) \\cdot {ShortCircuitIEC60909Solver._format_float(exp_factor)}\\right)^2}}"
            ),
            substitution_latex=(
                f"{ShortCircuitIEC60909Solver._format_float(ikss_a)}"
                f" \\cdot \\sqrt{{1 + \\left(({ShortCircuitIEC60909Solver._format_float(post.kappa)}"
                f" - 1) \\cdot {ShortCircuitIEC60909Solver._format_float(exp_factor)}\\right)^2}}"
            ),
            result={"ib_a": post.ib_a},
        )

        tracer.add(
            key="Ith",
            title="Prąd zastępczy cieplny",
            formula_latex=r"I_{th} = I_{k}'' \cdot \sqrt{t_k}",
            inputs={"ikss_a": ikss_a, "tk_s": tk_s},
            substitution=(
                f"{ShortCircuitIEC60909Solver._format_float(ikss_a)}"
                f" \\cdot \\sqrt{{{ShortCircuitIEC60909Solver._format_float(tk_s)}}}"
            ),
            substitution_latex=(
                f"{ShortCircuitIEC60909Solver._format_float(ikss_a)}"
                f" \\cdot \\sqrt{{{ShortCircuitIEC60909Solver._format_float(tk_s)}}}"
            ),
            result={"ith_a": post.ith_a},
        )

        tracer.add(
            key="Sk",
            title="Moc zwarciowa",
            formula_latex=r"S_k = \sqrt{3} \cdot U_n \cdot I_{k}'' / 10^6",
            inputs={"un_v": un_v, "ikss_a": ikss_a},
            substitution=(
                f"\\sqrt{{3}} \\cdot {ShortCircuitIEC60909Solver._format_float(un_v)}"
                f" \\cdot {ShortCircuitIEC60909Solver._format_float(ikss_a)} / 10^6"
            ),
            substitution_latex=(
                f"\\sqrt{{3}} \\cdot {ShortCircuitIEC60909Solver._format_float(un_v)}"
                f" \\cdot {ShortCircuitIEC60909Solver._format_float(ikss_a)} / 10^6"
            ),
            result={"sk_mva": post.sk_mva},
        )

        return tracer.to_list()

    @staticmethod
    def _compute_inverter_contribution(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
    ) -> float:
        """
        Sumuje wkład prądowy źródeł falownikowych zgodnie z IEC 60909 (model uproszczony).
        """
        sources = graph.get_inverter_sources()
        if not sources:
            return 0.0
        total = 0.0
        for source in sources:
            total += ShortCircuitIEC60909Solver._inverter_contribution_for_type(
                source, short_circuit_type
            )
        return total

    @staticmethod
    def _inverter_contribution_for_type(
        source: InverterSource,
        short_circuit_type: ShortCircuitType,
    ) -> float:
        if short_circuit_type == ShortCircuitType.THREE_PHASE:
            return source.ik_sc_a
        if short_circuit_type == ShortCircuitType.TWO_PHASE:
            return source.ik_sc_a if source.contributes_negative_sequence else 0.0
        if short_circuit_type in {
            ShortCircuitType.SINGLE_PHASE_GROUND,
            ShortCircuitType.TWO_PHASE_GROUND,
        }:
            return source.ik_sc_a if source.contributes_zero_sequence else 0.0
        return 0.0

    @staticmethod
    def _build_source_contributions(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
        ik_thevenin_a: float,
        ik_total_a: float,
    ) -> list[ShortCircuitSourceContribution]:
        """
        Buduje listę wkładów prądowych źródeł do prądu zwarcia.
        """
        contributions: list[ShortCircuitSourceContribution] = []
        base = ik_total_a if ik_total_a > 0 else 0.0
        grid_share = ik_thevenin_a / base if base > 0 else 0.0
        contributions.append(
            ShortCircuitSourceContribution(
                source_id="THEVENIN_GRID",
                source_name="Thevenin Grid",
                source_type=SourceType.GRID,
                node_id=None,
                i_contrib_a=ik_thevenin_a,
                share=grid_share,
            )
        )

        for source in graph.get_inverter_sources():
            i_contrib = ShortCircuitIEC60909Solver._inverter_contribution_for_type(
                source, short_circuit_type
            )
            share = i_contrib / base if base > 0 else 0.0
            contributions.append(
                ShortCircuitSourceContribution(
                    source_id=source.id,
                    source_name=source.name,
                    source_type=SourceType.INVERTER,
                    node_id=source.node_id,
                    i_contrib_a=i_contrib,
                    share=share,
                )
            )

        contributions.sort(key=lambda item: (item.source_type != SourceType.GRID, item.source_id))
        return contributions

    @staticmethod
    def _get_series_admittance(branch: object) -> complex | None:
        if hasattr(branch, "get_series_admittance"):
            return branch.get_series_admittance()
        if hasattr(branch, "get_short_circuit_impedance_ohm_lv"):
            z_ohm = branch.get_short_circuit_impedance_ohm_lv()
            if z_ohm == 0:
                return None
            return 1.0 / z_ohm
        return None

    @staticmethod
    def _build_branch_contributions_for_inverters(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
    ) -> list[ShortCircuitBranchContribution]:
        """
        Przybliżone wkłady falowników do prądów gałęzi (superpozycja, moduły RMS).
        """
        sources = graph.get_inverter_sources()
        if not sources:
            return []

        from network_model.solvers.short_circuit_core import build_zbus

        builder, z_bus = build_zbus(graph)
        contributions: list[ShortCircuitBranchContribution] = []

        fault_index = builder.node_id_to_index.get(fault_node_id)
        if fault_index is None:
            return []

        for source in sources:
            i_contrib = ShortCircuitIEC60909Solver._inverter_contribution_for_type(
                source, short_circuit_type
            )
            if i_contrib <= 0:
                continue
            source_index = builder.node_id_to_index.get(source.node_id)
            if source_index is None or source_index == fault_index:
                continue

            i_inj = np.zeros(len(builder.node_id_to_index), dtype=complex)
            i_inj[source_index] = complex(i_contrib, 0.0)
            i_inj[fault_index] = complex(-i_contrib, 0.0)
            v_nodes = z_bus @ i_inj

            for branch_id, branch in graph.branches.items():
                if not getattr(branch, "in_service", True):
                    continue
                y_series = ShortCircuitIEC60909Solver._get_series_admittance(branch)
                if y_series is None:
                    continue
                from_index = builder.node_id_to_index.get(branch.from_node_id)
                to_index = builder.node_id_to_index.get(branch.to_node_id)
                if from_index is None or to_index is None:
                    continue
                v_from = v_nodes[from_index]
                v_to = v_nodes[to_index]
                i_branch = (v_from - v_to) * y_series
                i_mag = abs(i_branch)
                if i_mag <= 0:
                    continue
                direction = "from_to" if abs(v_from) >= abs(v_to) else "to_from"
                contributions.append(
                    ShortCircuitBranchContribution(
                        source_id=source.id,
                        branch_id=branch_id,
                        from_node_id=branch.from_node_id,
                        to_node_id=branch.to_node_id,
                        i_contrib_a=i_mag,
                        direction=direction,
                    )
                )

        contributions.sort(key=lambda item: (item.source_id, item.branch_id))
        return contributions

    @staticmethod
    def compute_3ph_short_circuit(
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        tb_s: float = 0.1,
        include_branch_contributions: bool = False,
    ) -> ShortCircuitResult:
        """
        IEC 60909: 3-phase short-circuit currents (Ik'', Ip, Ith) and Sk''.

        Ik'' = (c * Un) / (sqrt(3) * |Zkk|)
        where Zkk is diagonal element of Zbus = inv(Ybus).

        kappa = 1.02 + 0.98 * exp(-3 * R/X)
        Ip = kappa * sqrt(2) * Ik''
        Ith = Ik'' * sqrt(tk)
        Sk'' = sqrt(3) * Un * Ik''
        """
        if fault_node_id not in graph.nodes:
            raise ValueError(f"Fault node '{fault_node_id}' does not exist in graph")
        if c_factor <= 0:
            raise ValueError("c_factor must be > 0")
        if tk_s <= 0:
            raise ValueError("tk_s must be > 0")
        if tb_s <= 0:
            raise ValueError("tb_s must be > 0")

        core = compute_equivalent_impedance(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.THREE_PHASE,
        )
        un_v = graph.nodes[fault_node_id].voltage_level * 1000.0
        ikss = compute_ikss(
            un_v=un_v,
            c_factor=c_factor,
            short_circuit_type=ShortCircuitType.THREE_PHASE,
            z_equiv=core.z_equiv,
        )
        ik_inverters = ShortCircuitIEC60909Solver._compute_inverter_contribution(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.THREE_PHASE,
        )
        ik_total = ikss + ik_inverters
        post = compute_post_fault_quantities(
            ikss=ik_total,
            un_v=un_v,
            z_equiv=core.z_equiv,
            tk_s=tk_s,
            tb_s=tb_s,
        )
        white_box_trace = ShortCircuitIEC60909Solver._build_white_box_trace(
            short_circuit_type=ShortCircuitType.THREE_PHASE,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            un_v=un_v,
            tk_s=tk_s,
            tb_s=tb_s,
            z_equiv=core.z_equiv,
            z1=core.z1,
            z2=core.z2,
            z0=core.z0,
            ikss_a=ik_total,
            post=post,
        )
        contributions = ShortCircuitIEC60909Solver._build_source_contributions(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.THREE_PHASE,
            ik_thevenin_a=ikss,
            ik_total_a=ik_total,
        )
        branch_contributions = (
            ShortCircuitIEC60909Solver._build_branch_contributions_for_inverters(
                graph=graph,
                fault_node_id=fault_node_id,
                short_circuit_type=ShortCircuitType.THREE_PHASE,
            )
            if include_branch_contributions
            else None
        )
        return ShortCircuitIEC60909Solver._compute_fault_result(
            short_circuit_type=ShortCircuitType.THREE_PHASE,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
            tb_s=tb_s,
            un_v=un_v,
            z_equiv=core.z_equiv,
            ikss_thevenin=ikss,
            ik_inverters=ik_inverters,
            contributions=contributions,
            branch_contributions=branch_contributions,
            white_box_trace=white_box_trace,
        )

    @staticmethod
    def compute_ikss_3ph(
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        include_branch_contributions: bool = False,
    ) -> ShortCircuitResult:
        """
        IEC 60909: initial symmetrical short-circuit current Ik'' for 3-phase fault.

        Ik'' = (c * Un) / (sqrt(3) * |Zkk|)
        where Zkk is diagonal element of Zbus = inv(Ybus).
        """
        return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=1.0,
            include_branch_contributions=include_branch_contributions,
        )

    @staticmethod
    def compute_ikss_3ph_min(
        graph: NetworkGraph, fault_node_id: str, include_branch_contributions: bool = False
    ) -> ShortCircuitResult:
        return ShortCircuitIEC60909Solver.compute_ikss_3ph(
            graph, fault_node_id, C_MIN, include_branch_contributions
        )

    @staticmethod
    def compute_ikss_3ph_max(
        graph: NetworkGraph, fault_node_id: str, include_branch_contributions: bool = False
    ) -> ShortCircuitResult:
        return ShortCircuitIEC60909Solver.compute_ikss_3ph(
            graph, fault_node_id, C_MAX, include_branch_contributions
        )

    @staticmethod
    def compute_1ph_short_circuit(
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        tb_s: float = 0.1,
        z0_bus: np.ndarray | None = None,
        include_branch_contributions: bool = False,
    ) -> ShortCircuitResult:
        """
        IEC 60909: single-phase-to-ground fault using Z1, Z2, Z0.

        Ik'' = (c * Un) / |Z1 + Z2 + Z0|
        """
        if z0_bus is None:
            raise ValueError("Z0 bus matrix is required for 1F fault computation")
        if fault_node_id not in graph.nodes:
            raise ValueError(f"Fault node '{fault_node_id}' does not exist in graph")
        if c_factor <= 0:
            raise ValueError("c_factor must be > 0")
        if tk_s <= 0:
            raise ValueError("tk_s must be > 0")
        if tb_s <= 0:
            raise ValueError("tb_s must be > 0")

        core = compute_equivalent_impedance(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
            z0_bus=z0_bus,
        )
        un_v = graph.nodes[fault_node_id].voltage_level * 1000.0
        ikss = compute_ikss(
            un_v=un_v,
            c_factor=c_factor,
            short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
            z_equiv=core.z_equiv,
        )
        ik_inverters = ShortCircuitIEC60909Solver._compute_inverter_contribution(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
        )
        ik_total = ikss + ik_inverters
        post = compute_post_fault_quantities(
            ikss=ik_total,
            un_v=un_v,
            z_equiv=core.z_equiv,
            tk_s=tk_s,
            tb_s=tb_s,
        )
        white_box_trace = ShortCircuitIEC60909Solver._build_white_box_trace(
            short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            un_v=un_v,
            tk_s=tk_s,
            tb_s=tb_s,
            z_equiv=core.z_equiv,
            z1=core.z1,
            z2=core.z2,
            z0=core.z0,
            ikss_a=ik_total,
            post=post,
        )
        contributions = ShortCircuitIEC60909Solver._build_source_contributions(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
            ik_thevenin_a=ikss,
            ik_total_a=ik_total,
        )
        branch_contributions = (
            ShortCircuitIEC60909Solver._build_branch_contributions_for_inverters(
                graph=graph,
                fault_node_id=fault_node_id,
                short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
            )
            if include_branch_contributions
            else None
        )
        return ShortCircuitIEC60909Solver._compute_fault_result(
            short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
            tb_s=tb_s,
            un_v=un_v,
            z_equiv=core.z_equiv,
            ikss_thevenin=ikss,
            ik_inverters=ik_inverters,
            contributions=contributions,
            branch_contributions=branch_contributions,
            white_box_trace=white_box_trace,
        )

    @staticmethod
    def compute_2ph_short_circuit(
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        tb_s: float = 0.1,
        include_branch_contributions: bool = False,
    ) -> ShortCircuitResult:
        """
        IEC 60909: two-phase fault using Z1 and Z2.

        Ik'' = (c * Un) / |Z1 + Z2|
        """
        if fault_node_id not in graph.nodes:
            raise ValueError(f"Fault node '{fault_node_id}' does not exist in graph")
        if c_factor <= 0:
            raise ValueError("c_factor must be > 0")
        if tk_s <= 0:
            raise ValueError("tk_s must be > 0")
        if tb_s <= 0:
            raise ValueError("tb_s must be > 0")

        core = compute_equivalent_impedance(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.TWO_PHASE,
        )
        un_v = graph.nodes[fault_node_id].voltage_level * 1000.0
        ikss = compute_ikss(
            un_v=un_v,
            c_factor=c_factor,
            short_circuit_type=ShortCircuitType.TWO_PHASE,
            z_equiv=core.z_equiv,
        )
        ik_inverters = ShortCircuitIEC60909Solver._compute_inverter_contribution(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.TWO_PHASE,
        )
        ik_total = ikss + ik_inverters
        post = compute_post_fault_quantities(
            ikss=ik_total,
            un_v=un_v,
            z_equiv=core.z_equiv,
            tk_s=tk_s,
            tb_s=tb_s,
        )
        white_box_trace = ShortCircuitIEC60909Solver._build_white_box_trace(
            short_circuit_type=ShortCircuitType.TWO_PHASE,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            un_v=un_v,
            tk_s=tk_s,
            tb_s=tb_s,
            z_equiv=core.z_equiv,
            z1=core.z1,
            z2=core.z2,
            z0=core.z0,
            ikss_a=ik_total,
            post=post,
        )
        contributions = ShortCircuitIEC60909Solver._build_source_contributions(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.TWO_PHASE,
            ik_thevenin_a=ikss,
            ik_total_a=ik_total,
        )
        branch_contributions = (
            ShortCircuitIEC60909Solver._build_branch_contributions_for_inverters(
                graph=graph,
                fault_node_id=fault_node_id,
                short_circuit_type=ShortCircuitType.TWO_PHASE,
            )
            if include_branch_contributions
            else None
        )
        return ShortCircuitIEC60909Solver._compute_fault_result(
            short_circuit_type=ShortCircuitType.TWO_PHASE,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
            tb_s=tb_s,
            un_v=un_v,
            z_equiv=core.z_equiv,
            ikss_thevenin=ikss,
            ik_inverters=ik_inverters,
            contributions=contributions,
            branch_contributions=branch_contributions,
            white_box_trace=white_box_trace,
        )

    @staticmethod
    def compute_2ph_ground_short_circuit(
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        tb_s: float = 0.1,
        z0_bus: np.ndarray | None = None,
        include_branch_contributions: bool = False,
    ) -> ShortCircuitResult:
        """
        IEC 60909: two-phase-to-ground fault using Z1, Z2, Z0.

        Ik'' = (c * Un) / |Z1 + Z2 + Z0|
        """
        if z0_bus is None:
            raise ValueError("Z0 bus matrix is required for 2F+G fault computation")
        if fault_node_id not in graph.nodes:
            raise ValueError(f"Fault node '{fault_node_id}' does not exist in graph")
        if c_factor <= 0:
            raise ValueError("c_factor must be > 0")
        if tk_s <= 0:
            raise ValueError("tk_s must be > 0")
        if tb_s <= 0:
            raise ValueError("tb_s must be > 0")

        core = compute_equivalent_impedance(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.TWO_PHASE_GROUND,
            z0_bus=z0_bus,
        )
        un_v = graph.nodes[fault_node_id].voltage_level * 1000.0
        ikss = compute_ikss(
            un_v=un_v,
            c_factor=c_factor,
            short_circuit_type=ShortCircuitType.TWO_PHASE_GROUND,
            z_equiv=core.z_equiv,
        )
        ik_inverters = ShortCircuitIEC60909Solver._compute_inverter_contribution(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.TWO_PHASE_GROUND,
        )
        ik_total = ikss + ik_inverters
        post = compute_post_fault_quantities(
            ikss=ik_total,
            un_v=un_v,
            z_equiv=core.z_equiv,
            tk_s=tk_s,
            tb_s=tb_s,
        )
        white_box_trace = ShortCircuitIEC60909Solver._build_white_box_trace(
            short_circuit_type=ShortCircuitType.TWO_PHASE_GROUND,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            un_v=un_v,
            tk_s=tk_s,
            tb_s=tb_s,
            z_equiv=core.z_equiv,
            z1=core.z1,
            z2=core.z2,
            z0=core.z0,
            ikss_a=ik_total,
            post=post,
        )
        contributions = ShortCircuitIEC60909Solver._build_source_contributions(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.TWO_PHASE_GROUND,
            ik_thevenin_a=ikss,
            ik_total_a=ik_total,
        )
        branch_contributions = (
            ShortCircuitIEC60909Solver._build_branch_contributions_for_inverters(
                graph=graph,
                fault_node_id=fault_node_id,
                short_circuit_type=ShortCircuitType.TWO_PHASE_GROUND,
            )
            if include_branch_contributions
            else None
        )
        return ShortCircuitIEC60909Solver._compute_fault_result(
            short_circuit_type=ShortCircuitType.TWO_PHASE_GROUND,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
            tb_s=tb_s,
            un_v=un_v,
            z_equiv=core.z_equiv,
            ikss_thevenin=ikss,
            ik_inverters=ik_inverters,
            contributions=contributions,
            branch_contributions=branch_contributions,
            white_box_trace=white_box_trace,
        )


ShortCircuitResult3PH = ShortCircuitResult
