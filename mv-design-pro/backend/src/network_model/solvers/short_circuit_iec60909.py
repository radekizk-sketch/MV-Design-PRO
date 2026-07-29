from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

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

# Identyfikator źródła zastępczego (Thevenin / sieć nadrzędna) w wkładach.
# LUSTRO konwencji `_build_source_contributions` (source_id="THEVENIN_GRID").
THEVENIN_GRID_SOURCE_ID: str = "THEVENIN_GRID"


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

# -----------------------------------------------------------------------------
# Delta FROZEN V12K-128 (zatwierdzona przez właściciela 2026-07-22) — składowe
# symetryczne Z1/Z2/Z0 jako pola ADDYTYWNE wyniku. Obecne w to_dict() WYŁĄCZNIE
# gdy solver je policzył: z1_ohm/z2_ohm dla wszystkich typów zwarcia, z0_ohm
# tylko dla zwarć doziemnych (1F, 2F+G). Starsze wyniki odtworzone bez tych pól
# (domyślnie None) serializują się BAJT-W-BAJT identycznie z kontraktem sprzed
# delty — patrz testy additywności w tests/test_result_api_contract.py.
# -----------------------------------------------------------------------------
OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS: list[str] = [
    "z1_ohm",
    "z2_ohm",
    "z0_ohm",
    # V12K-132 (pkt 7 karty właściciela): ślad WHITE BOX rozpływu prądu
    # zwarciowego od źródła zastępczego (Thevenin) w gałęziach. Obecny w
    # to_dict() WYŁĄCZNIE gdy policzono wkłady gałęziowe
    # (include_branch_contributions=True), sprzężony z `branch_contributions`.
    # None (opcja wyłączona / starszy wynik) → pominięty, payload bajt-w-bajt
    # jak sprzed delty (dowód: testy addytywności).
    "branch_flow_trace",
    # Audyt fizyki fala G (2026-07): wspolczynniki cieplne m/n faktycznie
    # uzyte w ith_a = ikss*sqrt(m+n) (IEC 60909-0 §4.7/§12). Obecne w
    # to_dict() ZAWSZE dla wynikow policzonych PO tej delcie (solver je
    # zawsze liczy); None tylko dla wynikow zrekonstruowanych z payloadu
    # sprzed delty (kompatybilnosc wsteczna).
    "m_factor",
    "n_factor",
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
    # Delta FROZEN V12K-128 (addytywna): składowe symetryczne impedancji
    # zastępczej wyliczone przez solver (Z1/Z2 zawsze; Z0 dla zwarć doziemnych).
    # None = wielkość nieobliczana dla tego typu / wynik sprzed delty.
    z1_ohm: complex | None = None
    z2_ohm: complex | None = None
    z0_ohm: complex | None = None
    # V12K-132 (pkt 7 karty właściciela, addytywnie): ślad WHITE BOX rozpływu
    # prądu zwarciowego od źródła zastępczego (Thevenin/sieć nadrzędna) po
    # gałęziach — kroki i wartości pośrednie podziału prądu z macierzy Z-bus.
    # None = wkłady gałęziowe nieliczone (opcja wyłączona) / wynik sprzed delty.
    branch_flow_trace: list[dict] | None = None
    # Audyt fizyki fala G (2026-07, addytywnie): wspolczynniki cieplne m
    # (skladowa DC) i n (skladowa AC) FAKTYCZNIE uzyte w ith_a = ikss*sqrt(m+n)
    # (IEC 60909-0 §4.7/§12; ta sama norma jest juz udokumentowana i uzywana
    # w proof_generator.py dla SC1/SC3F — patrz EQ_SC3F_008/EQ_SC1_011).
    # None = wynik sprzed delty (rekonstrukcja bez tych pol) — payload
    # bajt-w-bajt jak przed delta (dowod: testy addytywnosci kontraktu).
    m_factor: float | None = None
    n_factor: float | None = None

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

        def serialize_value(val: Any) -> Any:
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

        data: dict = {
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
        # Delta FROZEN V12K-128 (addytywna): składowe symetryczne dołączane tylko
        # gdy solver je policzył. Pominięcie None gwarantuje bajt-w-bajt zgodność
        # payloadu wyników odtworzonych bez tych pól z kontraktem sprzed delty.
        if self.z1_ohm is not None:
            data["z1_ohm"] = serialize_complex(self.z1_ohm)
        if self.z2_ohm is not None:
            data["z2_ohm"] = serialize_complex(self.z2_ohm)
        if self.z0_ohm is not None:
            data["z0_ohm"] = serialize_complex(self.z0_ohm)
        # V12K-132 (addytywnie, exclude-None): ślad WHITE BOX rozpływu Thevenina
        # dołączany WYŁĄCZNIE gdy policzony (wielkości zespolone pośrednie →
        # {re, im} przez serialize_value). Pominięcie None gwarantuje bajt-w-bajt
        # zgodność payloadu wyników bez tego pola z kontraktem sprzed delty.
        if self.branch_flow_trace is not None:
            data["branch_flow_trace"] = serialize_value(list(self.branch_flow_trace))
        # Audyt fizyki fala G (2026-07, addytywnie, exclude-None): m_factor/n_factor
        # dolaczane WYLACZNIE gdy solver je policzyl — pominiecie None gwarantuje
        # bajt-w-bajt zgodnosc payloadu wynikow sprzed delty.
        if self.m_factor is not None:
            data["m_factor"] = float(self.m_factor)
        if self.n_factor is not None:
            data["n_factor"] = float(self.n_factor)
        return data


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
        z1: complex | None = None,
        z2: complex | None = None,
        z0: complex | None = None,
        branch_flow_trace: list[dict] | None = None,
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
            z1_ohm=z1,
            z2_ohm=z2,
            z0_ohm=z0,
            branch_flow_trace=branch_flow_trace,
            m_factor=post.m_factor,
            n_factor=post.n_factor,
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
    def _append_transformer_kt_trace(tracer: WhiteBoxTracer, graph: NetworkGraph) -> None:
        """WHITE BOX (IEC 60909-0 §3.3.3): jawny ślad korekcji impedancji K_T dla
        każdego transformatora sieciowego w modelu. Kolejność deterministyczna
        (sort po id gałęzi). Bez ukrytych korekcji — K_T ze wzorem i podstawieniem
        liczb; Z_T i Z_TK w per-unit na wartościach znamionowych TR."""
        from network_model.core.branch import TransformerBranch

        fmt = ShortCircuitIEC60909Solver._format_float
        fmt_c = ShortCircuitIEC60909Solver._format_complex_latex
        for branch_id in sorted(graph.branches.keys()):
            branch = graph.branches[branch_id]
            if not isinstance(branch, TransformerBranch):
                continue
            if not getattr(branch, "in_service", True):
                continue
            x_t = branch.get_relative_reactance_xt()
            c_max = branch.get_voltage_factor_c_max()
            k_t = branch.get_kt_correction_factor()
            z_t = branch.get_short_circuit_impedance_pu()
            z_tk = branch.get_short_circuit_impedance_pu_corrected()
            # X_T on the HV side [Ω] = x_T · (U_rT,HV² / S_rT) (rated base ohm).
            z_base_hv_ohm = (
                (branch.voltage_hv_kv**2) / branch.rated_power_mva
                if branch.rated_power_mva > 0
                else 0.0
            )
            x_t_ohm_hv = x_t * z_base_hv_ohm
            tracer.add(
                key=f"KT[{branch_id}]",
                title=f"Korekcja impedancji transformatora sieciowego {branch.name or branch_id}",
                formula_latex=r"K_T = 0.95 \cdot \frac{c_{max}}{1 + 0.6 \cdot x_T}",
                inputs={
                    "branch_id": branch_id,
                    "s_rt_mva": branch.rated_power_mva,
                    "u_rt_hv_kv": branch.voltage_hv_kv,
                    "u_rt_lv_kv": branch.voltage_lv_kv,
                    "x_t_pu": x_t,
                    "x_t_ohm_hv": x_t_ohm_hv,
                    "c_max": c_max,
                },
                substitution=(f"0.95 \\cdot \\frac{{{fmt(c_max)}}}{{1 + 0.6 \\cdot {fmt(x_t)}}}"),
                substitution_latex=(
                    f"0.95 \\cdot \\frac{{{fmt(c_max)}}}{{1 + 0.6 \\cdot {fmt(x_t)}}}"
                ),
                result={
                    "k_t": k_t,
                    "z_t_pu": z_t,
                    "z_tk_pu": z_tk,
                    "z_tk_formula_latex": (
                        f"Z_{{TK}} = K_T \\cdot Z_T = {fmt(k_t)} \\cdot {fmt_c(z_t)}"
                        f" = {fmt_c(z_tk)}"
                    ),
                },
            )

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
        graph: NetworkGraph | None = None,
    ) -> list[dict]:
        tracer = WhiteBoxTracer()
        if graph is not None:
            ShortCircuitIEC60909Solver._append_transformer_kt_trace(tracer, graph)
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
            result={
                "z_equiv_ohm": z_equiv,
                "r_ohm": z_equiv.real,
                "x_ohm": z_equiv.imag,
                "z_equiv_abs_ohm": z_equiv_abs,
            },
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
            formula_latex=(
                "I_b = I_{k}'' \\cdot \\sqrt{1 + ((\\kappa - 1)" " \\cdot e^{-t_b/t_a})^2}"
            ),
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
            formula_latex=r"I_{th} = I_{k}'' \cdot \sqrt{m + n}",
            inputs={"ikss_a": ikss_a, "m_factor": post.m_factor, "n_factor": post.n_factor},
            substitution=(
                f"{ShortCircuitIEC60909Solver._format_float(ikss_a)}"
                f" \\cdot \\sqrt{{{ShortCircuitIEC60909Solver._format_float(post.m_factor)}"
                f" + {ShortCircuitIEC60909Solver._format_float(post.n_factor)}}}"
            ),
            substitution_latex=(
                f"{ShortCircuitIEC60909Solver._format_float(ikss_a)}"
                f" \\cdot \\sqrt{{{ShortCircuitIEC60909Solver._format_float(post.m_factor)}"
                f" + {ShortCircuitIEC60909Solver._format_float(post.n_factor)}}}"
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
    def _inverter_transfer_factors(
        graph: NetworkGraph,
        fault_node_id: str,
        *,
        builder: object | None = None,
        z_bus: object | None = None,
    ) -> dict[str, float]:
        """
        Współczynniki przeniesienia wkładu falowników do węzła zwarcia.

        Falownik (IEC 60909-0 §6.8, źródło z pełnowymiarowym przekształtnikiem)
        jest źródłem PRĄDOWYM I_skPF = k·I_rN na SWOICH zaciskach. Prąd, który z
        tego wstrzyknięcia dopływa do zwarcia w węźle k, wynika z superpozycji na
        macierzy Z-bus:

            I_k = I_j · Z_kj / Z_kk

        Dodatkowo prąd znamionowy falownika jest wyrażony przy napięciu jego
        węzła, więc do węzła zwarcia przenosi się przekładnią U_j/U_k (rachunek
        w per-unit: I_pu = I_A / I_base, I_base = S_base/(√3·U_n)).

        Bez tego przeniesienia wkład falownika wchodził do zwarcia 1:1 w amperach,
        niezależnie od poziomu napięcia i odległości elektrycznej (V12K-184):
        15 mikroźródeł 0,4 kV dawało 21,5 kA na szynie 15 kV, czyli 559 MVA mocy
        zwarciowej z kilkunastu MW przyłączonej generacji.

        Dla falownika stojącego W węźle zwarcia współczynnik wynosi dokładnie 1
        (Z_kk/Z_kk = 1, U_j/U_k = 1) — sieci z DER na szynie zwarcia zachowują
        dotychczasowe wyniki co do bitu.
        """
        from network_model.solvers.short_circuit_core import build_zbus

        sources = graph.get_inverter_sources()
        if not sources:
            return {}
        if builder is None or z_bus is None:
            builder, z_bus = build_zbus(graph)

        index_map = builder.node_id_to_index  # type: ignore[union-attr]
        fault_index = index_map.get(fault_node_id)
        if fault_index is None:
            return {}
        z_kk = z_bus[fault_index, fault_index]  # type: ignore[index]
        un_k = graph.nodes[fault_node_id].voltage_level
        if z_kk == 0 or un_k <= 0:
            return {}

        factors: dict[str, float] = {}
        for source in sources:
            source_index = index_map.get(source.node_id)
            node = graph.nodes.get(source.node_id)
            if source_index is None or node is None or node.voltage_level <= 0:
                continue
            z_kj = z_bus[fault_index, source_index]  # type: ignore[index]
            factors[source.id] = abs(z_kj / z_kk) * (node.voltage_level / un_k)
        return factors

    @staticmethod
    def _inverter_contributions_by_source(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
    ) -> dict[str, float]:
        """Wkład prądowy [A] każdego falownika, przeniesiony do węzła zwarcia."""
        sources = graph.get_inverter_sources()
        if not sources:
            return {}
        factors = ShortCircuitIEC60909Solver._inverter_transfer_factors(graph, fault_node_id)
        contributions: dict[str, float] = {}
        for source in sources:
            i_terminal = ShortCircuitIEC60909Solver._inverter_contribution_for_type(
                source, short_circuit_type
            )
            contributions[source.id] = i_terminal * factors.get(source.id, 0.0)
        return contributions

    @staticmethod
    def _compute_inverter_contribution(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
    ) -> float:
        """
        Sumuje wkład prądowy źródeł falownikowych zgodnie z IEC 60909 (model uproszczony).
        """
        return float(
            sum(
                ShortCircuitIEC60909Solver._inverter_contributions_by_source(
                    graph, fault_node_id, short_circuit_type
                ).values()
            )
        )

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

        # Wkłady przeniesione do węzła zwarcia (V12K-184) — te same wartości, które
        # sumują się do ik_inverters_a, więc udziały (share) sumują się do 1.
        referred = ShortCircuitIEC60909Solver._inverter_contributions_by_source(
            graph, fault_node_id, short_circuit_type
        )
        for source in graph.get_inverter_sources():
            i_contrib = referred.get(source.id, 0.0)
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
    def _build_branch_contributions_for_inverters(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
    ) -> list[ShortCircuitBranchContribution]:
        """
        Wkłady falowników do prądów gałęzi (superpozycja Z-bus, moduły RMS).

        Metoda identyczna z torem Thevenina: iniekcja JEDNOSTKOWA (+1 w węźle
        źródła, −1 w węźle zwarcia) daje bezwymiarowe współczynniki podziału
        ``f = (V_i − V_j)·y_ij`` (admitancja szeregowa w per-unit, SPÓJNA z
        macierzą Y-bus), a prąd gałęzi ``I = |f| · I_wkład``. ``I_wkład`` to
        wkład falownika PRZENIESIONY do węzła zwarcia (V12K-184).
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
        factors = ShortCircuitIEC60909Solver._inverter_transfer_factors(
            graph, fault_node_id, builder=builder, z_bus=z_bus
        )

        for source in sources:
            i_terminal = ShortCircuitIEC60909Solver._inverter_contribution_for_type(
                source, short_circuit_type
            )
            if i_terminal <= 0:
                continue
            source_index = builder.node_id_to_index.get(source.node_id)
            if source_index is None or source_index == fault_index:
                continue
            i_contrib = i_terminal * factors.get(source.id, 0.0)
            if i_contrib <= 0:
                continue

            # FIX (karta W-C, Zero-Debt): wektor iniekcji MUSI mieć wymiar macierzy
            # Z-bus (liczba węzłów REPREZENTATYWNYCH po scaleniu zamkniętych
            # łączników), nie liczbę wszystkich węzłów — `node_id_to_index` mapuje
            # KAŻDY węzeł na indeks reprezentanta, więc przy scaleniach
            # len(node_id_to_index) > z_bus.shape[0] i mnożenie pękało (matmul
            # mismatch) dla każdej sieci z zamkniętym łącznikiem. Defekt
            # pre-existing toru `include_branch_contributions` (scenariusze).
            i_inj = np.zeros(z_bus.shape[0], dtype=complex)
            i_inj[source_index] = complex(1.0, 0.0)
            i_inj[fault_index] = complex(-1.0, 0.0)
            v_nodes = z_bus @ i_inj

            for branch_id, branch in graph.branches.items():
                if not getattr(branch, "in_service", True):
                    continue
                # Admitancja w PER-UNIT — Z-bus też jest w pu; wcześniej ten tor
                # mieszał pu z omami (SI), co dawało niespójne moduły prądów.
                admittance = ShortCircuitIEC60909Solver._series_admittance_pu(builder, branch)
                if admittance is None:
                    continue
                y_series, ratio = admittance
                from_index = builder.node_id_to_index.get(branch.from_node_id)
                to_index = builder.node_id_to_index.get(branch.to_node_id)
                if from_index is None or to_index is None:
                    continue
                v_from = v_nodes[from_index]
                v_to = v_nodes[to_index]
                # Prąd po stronie `from` w modelu z przekładnią poza-znamionową
                # (V12K-186); dla a = 1 redukuje się do (V_from − V_to)·y.
                i_branch = (v_from / (ratio * ratio) - v_to / ratio) * y_series * i_contrib
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
    def _series_admittance_pu(builder: object, branch: object) -> tuple[complex, float] | None:
        """Admitancja szeregowa gałęzi w per-unit + przekładnia — SPÓJNE z Y-bus.

        Reużywa `AdmittanceMatrixBuilder._get_branch_admittances_pu` (ten sam
        buider co `build_zbus`), dzięki czemu prawo Kirchhoffa (KCL) domyka się
        w napięciach węzłowych z Z-bus — warunek konieczny dokładnego bilansu
        rozpływu Thevenina z Ik'' w węźle zwarcia. Gałąź o nieobsługiwanym typie
        albo zerowej impedancji → None (pomijana, jak w torze superpozycji).

        Zwraca `(y_series_pu, a)`, gdzie `a` to przekładnia poza-znamionowa
        gałęzi (1.0 dla linii i kabli). Prąd po stronie `from` liczy się wtedy
        jako `(V_from/a² − V_to/a)·y` — przy `a = 1` to zwykłe `(V_from−V_to)·y`.
        """
        getter = getattr(builder, "_get_branch_admittances_pu", None)
        if getter is None:
            return None
        try:
            y_series_pu, _shunt, ratio = getter(branch)
        except (ValueError, ZeroDivisionError):
            return None
        return y_series_pu, float(ratio)

    @staticmethod
    def _build_branch_contributions_for_thevenin(
        graph: NetworkGraph,
        fault_node_id: str,
        ik_thevenin_a: float,
    ) -> tuple[list[ShortCircuitBranchContribution], list[dict]]:
        """Rozpływ prądu zwarciowego źródła zastępczego (Thevenin / sieć
        nadrzędna) po gałęziach — WHITE BOX (V12K-132, pkt 7 karty właściciela).

        Metoda (ZERO heurystyk, wyłącznie algebra Z-bus — standardowy podział
        prądów): iniekcja jednostkowa -1 (pu) w węźle zwarcia daje napięcia
        węzłowe ze zwarcia ``V = Z_bus · i_inj``. Współczynnik podziału gałęzi
        ``f = (V_i − V_j) · y_ij`` (admitancja szeregowa pu SPÓJNA z Y-bus), a
        prąd gałęzi ``I = |f| · Ik''(Thevenin)``. Z KCL suma modułów
        współczynników gałęzi wchodzących do węzła zwarcia = 1, więc
        ``Σ I_gałęzi(→ węzeł) = Ik''(Thevenin)`` — bilans dokładny (dowód
        testem). Topologia podziału z sieci zgodnej (``build_zbus`` — TA SAMA
        macierz co istniejący tor superpozycji falownikowej); moduł prądu z
        ``Ik''(Thevenin)`` zależnego od typu zwarcia (spójnie z torem
        superpozycji, który też skaluje jeden podział pu wielkością per typ).

        Zwraca (wkłady per gałąź, ślad WHITE BOX). ``ik_thevenin_a <= 0`` (brak
        źródła zastępczego) → ([], []) — uczciwy brak, jak tor superpozycji dla
        sieci bez falowników.
        """
        if ik_thevenin_a <= 0:
            return [], []

        from network_model.solvers.short_circuit_core import build_zbus

        builder, z_bus = build_zbus(graph)
        fault_index = builder.node_id_to_index.get(fault_node_id)
        if fault_index is None:
            return [], []

        # Iniekcja jednostkowa w węźle zwarcia (współczynniki podziału prądu).
        i_inj = np.zeros(z_bus.shape[0], dtype=complex)
        i_inj[fault_index] = complex(-1.0, 0.0)
        v_nodes = z_bus @ i_inj

        contributions: list[ShortCircuitBranchContribution] = []
        tracer = WhiteBoxTracer()
        tracer.add(
            key="thevenin_flow_setup",
            title="Podział prądu Thevenina — iniekcja jednostkowa w węźle zwarcia",
            formula_latex=(
                r"\underline{V} = \underline{Z}_{bus} \cdot \underline{i}_{inj},"
                r"\quad \underline{i}_{inj,k} = -1"
            ),
            inputs={
                "fault_node_id": fault_node_id,
                "fault_index": fault_index,
                "ik_thevenin_a": ik_thevenin_a,
                "n_nodes": int(z_bus.shape[0]),
            },
            substitution=f"i_inj[{fault_index}] = -1 (pu); V = Z_bus @ i_inj",
            substitution_latex=f"\\underline{{i}}_{{inj,{fault_index}}} = -1",
            result={"v_nodes_pu": [complex(v) for v in v_nodes]},
            notes=(
                "Napięcia węzłowe ze zwarcia z macierzy Z-bus sieci zgodnej "
                "(build_zbus, ta sama macierz co tor superpozycji falownikowej)."
            ),
        )

        fraction_sum_into_fault = 0.0
        for branch_id, branch in graph.branches.items():
            if not getattr(branch, "in_service", True):
                continue
            admittance = ShortCircuitIEC60909Solver._series_admittance_pu(builder, branch)
            if admittance is None:
                continue
            y_series_pu, ratio = admittance
            from_index = builder.node_id_to_index.get(branch.from_node_id)
            to_index = builder.node_id_to_index.get(branch.to_node_id)
            if from_index is None or to_index is None or from_index == to_index:
                continue
            v_from = v_nodes[from_index]
            v_to = v_nodes[to_index]
            # Jak wyżej (V12K-186): prąd strony `from` przy przekładni a.
            fraction = (v_from / (ratio * ratio) - v_to / ratio) * y_series_pu
            f_mag = float(abs(fraction))
            i_a = f_mag * ik_thevenin_a
            if i_a <= 0:
                continue
            # Kierunek: prąd zwarciowy płynie DO węzła zwarcia. W iniekcji
            # jednostkowej |V| rośnie w stronę zwarcia (największe |V| = węzeł
            # zwarcia), więc prąd płynie do węzła o większym |V|: "from_to" gdy
            # koniec "to" jest bliżej zwarcia (|V_to| >= |V_from|).
            direction = "from_to" if abs(v_to) >= abs(v_from) else "to_from"
            # Bilans KCL: licz udział gałęzi WCHODZĄCEJ do węzła zwarcia.
            if branch.to_node_id == fault_node_id and direction == "from_to":
                fraction_sum_into_fault += f_mag
            elif branch.from_node_id == fault_node_id and direction == "to_from":
                fraction_sum_into_fault += f_mag
            contributions.append(
                ShortCircuitBranchContribution(
                    source_id=THEVENIN_GRID_SOURCE_ID,
                    branch_id=branch_id,
                    from_node_id=branch.from_node_id,
                    to_node_id=branch.to_node_id,
                    i_contrib_a=i_a,
                    direction=direction,
                )
            )
            tracer.add(
                key=f"thevenin_flow_{branch_id}",
                title=f"Prąd zwarciowy Thevenina w gałęzi {branch_id}",
                formula_latex=(
                    r"I_{ga\l} = \left| (\underline{V}_i - \underline{V}_j)\,"
                    r"\underline{y}_{ij} \right| \cdot I_k''^{(Th)}"
                ),
                inputs={
                    "branch_id": branch_id,
                    "from_node_id": branch.from_node_id,
                    "to_node_id": branch.to_node_id,
                    "v_from_pu": complex(v_from),
                    "v_to_pu": complex(v_to),
                    "y_series_pu": complex(y_series_pu),
                    "ik_thevenin_a": ik_thevenin_a,
                },
                substitution=(
                    f"|({ShortCircuitIEC60909Solver._format_complex(complex(v_from))} - "
                    f"{ShortCircuitIEC60909Solver._format_complex(complex(v_to))}) * "
                    f"{ShortCircuitIEC60909Solver._format_complex(complex(y_series_pu))}| * "
                    f"{ShortCircuitIEC60909Solver._format_float(ik_thevenin_a)}"
                ),
                substitution_latex=(
                    f"\\left| \\left("
                    f"{ShortCircuitIEC60909Solver._format_complex_latex(complex(v_from))}"
                    f" - {ShortCircuitIEC60909Solver._format_complex_latex(complex(v_to))}"
                    f"\\right) \\cdot "
                    f"{ShortCircuitIEC60909Solver._format_complex_latex(complex(y_series_pu))}"
                    f"\\right| \\cdot "
                    f"{ShortCircuitIEC60909Solver._format_float(ik_thevenin_a)}"
                ),
                result={
                    "fraction": f_mag,
                    "i_contrib_a": i_a,
                    "direction": direction,
                },
            )

        contributions.sort(key=lambda item: (item.source_id, item.branch_id))
        tracer.add(
            key="thevenin_flow_balance",
            title="Suma kontrolna bilansu prądu w węźle zwarcia (KCL)",
            formula_latex=r"\sum_{ga\l \to k} I_{ga\l} = I_k''^{(Th)}",
            inputs={
                "fault_node_id": fault_node_id,
                "ik_thevenin_a": ik_thevenin_a,
            },
            substitution=(
                f"Σ = {ShortCircuitIEC60909Solver._format_float(fraction_sum_into_fault * ik_thevenin_a)}"
                f" ≈ {ShortCircuitIEC60909Solver._format_float(ik_thevenin_a)}"
            ),
            substitution_latex=(
                f"\\sum = {ShortCircuitIEC60909Solver._format_float(fraction_sum_into_fault * ik_thevenin_a)}"
                f" \\approx {ShortCircuitIEC60909Solver._format_float(ik_thevenin_a)}"
            ),
            result={
                "sum_into_fault_a": fraction_sum_into_fault * ik_thevenin_a,
                "fraction_sum": fraction_sum_into_fault,
            },
            notes=(
                "KCL: suma modułów współczynników gałęzi wchodzących do węzła "
                "zwarcia = 1, więc Σ prądów gałęziowych = Ik''(Thevenin)."
            ),
        )
        return contributions, tracer.to_list()

    @staticmethod
    def _build_branch_contributions(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
        ik_thevenin_a: float,
    ) -> tuple[list[ShortCircuitBranchContribution], list[dict]]:
        """Łączy wkłady gałęziowe: superpozycja falownikowa (istniejąca,
        BEZ ZMIAN) + rozpływ Thevenina (V12K-132, addytywnie). Deterministyczny
        sort ``(source_id, branch_id)`` — wpisy falownikowe zachowują swoje
        wartości bajt-w-bajt (source_id inwertera vs "THEVENIN_GRID")."""
        inverter = ShortCircuitIEC60909Solver._build_branch_contributions_for_inverters(
            graph, fault_node_id, short_circuit_type
        )
        thevenin, trace = ShortCircuitIEC60909Solver._build_branch_contributions_for_thevenin(
            graph, fault_node_id, ik_thevenin_a
        )
        combined = sorted(inverter + thevenin, key=lambda item: (item.source_id, item.branch_id))
        return combined, trace

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
            graph=graph,
        )
        contributions = ShortCircuitIEC60909Solver._build_source_contributions(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.THREE_PHASE,
            ik_thevenin_a=ikss,
            ik_total_a=ik_total,
        )
        branch_contributions, branch_flow_trace = (
            ShortCircuitIEC60909Solver._build_branch_contributions(
                graph=graph,
                fault_node_id=fault_node_id,
                short_circuit_type=ShortCircuitType.THREE_PHASE,
                ik_thevenin_a=ikss,
            )
            if include_branch_contributions
            else (None, None)
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
            z1=core.z1,
            z2=core.z2,
            z0=core.z0,
            branch_flow_trace=branch_flow_trace,
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
            graph=graph,
        )
        contributions = ShortCircuitIEC60909Solver._build_source_contributions(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
            ik_thevenin_a=ikss,
            ik_total_a=ik_total,
        )
        branch_contributions, branch_flow_trace = (
            ShortCircuitIEC60909Solver._build_branch_contributions(
                graph=graph,
                fault_node_id=fault_node_id,
                short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
                ik_thevenin_a=ikss,
            )
            if include_branch_contributions
            else (None, None)
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
            z1=core.z1,
            z2=core.z2,
            z0=core.z0,
            branch_flow_trace=branch_flow_trace,
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
            graph=graph,
        )
        contributions = ShortCircuitIEC60909Solver._build_source_contributions(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.TWO_PHASE,
            ik_thevenin_a=ikss,
            ik_total_a=ik_total,
        )
        branch_contributions, branch_flow_trace = (
            ShortCircuitIEC60909Solver._build_branch_contributions(
                graph=graph,
                fault_node_id=fault_node_id,
                short_circuit_type=ShortCircuitType.TWO_PHASE,
                ik_thevenin_a=ikss,
            )
            if include_branch_contributions
            else (None, None)
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
            z1=core.z1,
            z2=core.z2,
            z0=core.z0,
            branch_flow_trace=branch_flow_trace,
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
            graph=graph,
        )
        contributions = ShortCircuitIEC60909Solver._build_source_contributions(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=ShortCircuitType.TWO_PHASE_GROUND,
            ik_thevenin_a=ikss,
            ik_total_a=ik_total,
        )
        branch_contributions, branch_flow_trace = (
            ShortCircuitIEC60909Solver._build_branch_contributions(
                graph=graph,
                fault_node_id=fault_node_id,
                short_circuit_type=ShortCircuitType.TWO_PHASE_GROUND,
                ik_thevenin_a=ikss,
            )
            if include_branch_contributions
            else (None, None)
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
            z1=core.z1,
            z2=core.z2,
            z0=core.z0,
            branch_flow_trace=branch_flow_trace,
        )


ShortCircuitResult3PH = ShortCircuitResult
