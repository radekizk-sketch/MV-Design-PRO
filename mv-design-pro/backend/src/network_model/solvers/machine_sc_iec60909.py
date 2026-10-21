"""
Rotating-machine short-circuit contributions — IEC 60909-0:2016 §6.6.

This module is the "full machine model" layer on top of the (UNTOUCHED, frozen)
short-circuit core. The machine impedances are already in the Y-bus (see
``ybus.AdmittanceMatrixBuilder._add_machine_shunts``), so the frozen core already
yields the correct initial symmetrical current I″k, peak ip, and thermal ith for any
network containing machines. What the frozen core does NOT do — and what this module
adds — is the PER-MACHINE breakdown and the symmetrical BREAKING current i_b, which
requires the machine-specific decay factors μ (§6.6.1) and, for asynchronous motors,
q (§6.6.3). It also applies the small-motor omission rule.

WHITE BOX: every partial current is derived from the Z-bus by superposition —
    I_partial,m = c · Z_mk / (Z_kk · Z_m)   (referred to the fault-bus current base)
— which for a machine AT the fault bus reduces exactly to the terminal value c·Un/
(√3·Z″). All intermediate values (Z_mk, Z_kk, Z_m, μ, q) are exposed and auditable.

This file is NEW (not one of the 7 frozen solver files); it CALLS the frozen
``build_zbus`` read-only and never mutates the core.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from network_model.core.graph import NetworkGraph
from network_model.core.impedancja_przejscia import (
    OPISY_ODMOW_IMPEDANCJI,
    impedancja_przejscia_obliczeniowa,
    kod_odmowy_impedancji,
)
from network_model.core.machine import AsynchronousMachineSource, SynchronousMachineSource
from network_model.core.ybus import S_BASE_MVA
from network_model.nazwy import opis_rodzaju_i_nazwy
from network_model.odmowa_danych import (
    RODZAJ_WEZEL,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
    odmowa_rdzenia_b01,
)
from network_model.solvers.short_circuit_core import (
    build_zbus,
    odmowa_wezla_zwarcia_spoza_grafu,
)

_SQRT3 = math.sqrt(3.0)


_MU_CURVE_LATEX = (
    (0.035, r"\mu = 0.84 + 0.26\,e^{-0.26\,I''_k/I_r}", (0.84, 0.26, 0.26)),
    (0.075, r"\mu = 0.71 + 0.51\,e^{-0.30\,I''_k/I_r}", (0.71, 0.51, 0.30)),
    (0.175, r"\mu = 0.62 + 0.72\,e^{-0.32\,I''_k/I_r}", (0.62, 0.72, 0.32)),
    (float("inf"), r"\mu = 0.56 + 0.94\,e^{-0.38\,I''_k/I_r}", (0.56, 0.94, 0.38)),
)

_Q_CURVE_LATEX = (
    (0.035, r"q = 1.03 + 0.12\,\ln m", (1.03, 0.12)),
    (0.075, r"q = 0.79 + 0.12\,\ln m", (0.79, 0.12)),
    (0.175, r"q = 0.57 + 0.12\,\ln m", (0.57, 0.12)),
    (float("inf"), r"q = 0.26 + 0.10\,\ln m", (0.26, 0.10)),
)


def wspolczynniki_krzywej_mu(t_min_s: float) -> tuple[float, float, float]:
    """(a, b, w) krzywej μ = a + b·e^(−w·I''_k/I_r) dla t_min — JEDYNA tablica krzywych μ
    w programie (solver i dowód SC3F czytają ją stąd; karta SC-IB-ITH-ZRODLA)."""
    return _krzywa(t_min_s, _MU_CURVE_LATEX)[1]


def wspolczynniki_krzywej_q(t_min_s: float) -> tuple[float, float]:
    """(a, b) krzywej q = a + b·ln m dla t_min — JEDYNA tablica krzywych q w programie."""
    return _krzywa(t_min_s, _Q_CURVE_LATEX)[1]


def mu_factor(ratio_ik_ir: float, t_min_s: float) -> float:
    """AC-component decay factor μ for the symmetrical breaking current of a
    synchronous machine / motor (IEC 60909-0:2016 §6.6.1). ``ratio_ik_ir`` =
    I″k,source / I_r,source (oba prądy na zaciskach maszyny). μ = 1 for ratio ≤ 2
    (far-from-generator). The four curves are selected by the minimum time delay t_min
    (0.02 / 0.05 / 0.10 / ≥0.25 s).

    ``t_min_s`` — t_b punktu zwarcia z pochodzeniem rozstrzygniętym poza rdzeniem (karta
    TB-WARTOSC-ROBOCZA: scenariusz projektanta, najkrótszy czas wyłączenia pól lokalnych albo
    wartość robocza `network_model.core.czas_wylaczenia`); zawsze liczba dodatnia.
    """
    if ratio_ik_ir <= 2.0:
        return 1.0
    a, b, w = wspolczynniki_krzywej_mu(t_min_s)
    mu = a + b * math.exp(-w * ratio_ik_ir)
    return min(1.0, max(0.0, mu))


def q_factor(p_per_pole_mw: float, t_min_s: float) -> float:
    """Additional decay factor q for asynchronous motors (IEC 60909-0:2016 §6.6.3).
    m = active power per pole pair [MW]; the curve is selected by t_min; q ≤ 1.
    """
    if p_per_pole_mw <= 0.0:
        return 1.0
    ln_m = math.log(p_per_pole_mw)
    a, b = wspolczynniki_krzywej_q(t_min_s)
    q = a + b * ln_m
    return min(1.0, max(0.0, q))


def _krzywa(t_min_s: float, krzywe: tuple) -> tuple[str, tuple]:
    for prog, latex, wsp in krzywe:
        if t_min_s <= prog:
            return latex, wsp
    return krzywe[-1][1], krzywe[-1][2]


@dataclass(frozen=True)
class MachinePartialContribution:
    """One machine's partial short-circuit contribution at the fault bus."""

    source_id: str
    source_name: str
    machine_type: str  # "SYNCHRONOUS" | "ASYNCHRONOUS" | "DFIG"
    node_id: str
    z_internal_ohm: complex
    ir_a: float
    ikss_partial_a: float  # partial I″k from this machine
    ratio_ik_ir: float
    # μ, q, i_b = μ·q·I″k_partial (q = 1 dla synchronicznej) przy t_min = t_b punktu zwarcia
    # (karta TB-WARTOSC-ROBOCZA: t_b zawsze rozstrzygnięte, z pochodzeniem poza rdzeniem).
    mu: float
    q: float
    ib_a: float
    is_synchronous_machine: bool
    p_per_pole_mw: float = 0.0  # active power per pole pair m (drives q, §6.6.3; 0 for sync)
    # Karta SC-IB-ITH-ZRODLA: prąd początkowy maszyny NA JEJ ZACISKACH [A] (w poziomie napięcia
    # maszyny — podstawa krotności I″k/I_r krzywej μ; `ikss_partial_a` jest odniesiony do miejsca
    # zwarcia) oraz ΔU″/(c·U_n/√3) — spadek na reaktancji podprzejściowej maszyny odniesiony
    # do napięcia źródła zastępczego (waga zaniku maszyny w I_b sieci oczkowej, rozdz. 9).
    ikss_zaciski_a: float = 0.0
    delta_u_wzgledne: float = 0.0
    # WHITE BOX (zasada wywodow 2026-07-22): pelny wywod dyplomowy per maszyna —
    # kazdy krok {tekst, latex}: wzor ogolny -> podstawienie liczbowe -> wynik.
    # Budowany W SOLVERZE z wartosci posrednich tego biegu (audytowalnosc 1:1).
    wywod: tuple = ()

    def to_dict(self) -> dict:
        return {
            "source_id": self.source_id,
            "source_name": self.source_name,
            "machine_type": self.machine_type,
            "node_id": self.node_id,
            "z_internal_ohm": {"re": self.z_internal_ohm.real, "im": self.z_internal_ohm.imag},
            "ir_a": float(self.ir_a),
            "ikss_partial_a": float(self.ikss_partial_a),
            "ratio_ik_ir": float(self.ratio_ik_ir),
            "mu": float(self.mu),
            "q": float(self.q),
            "ib_a": float(self.ib_a),
            "is_synchronous_machine": self.is_synchronous_machine,
            "p_per_pole_mw": float(self.p_per_pole_mw),
            "ikss_zaciski_a": float(self.ikss_zaciski_a),
            "delta_u_wzgledne": float(self.delta_u_wzgledne),
            "wywod": list(self.wywod),
        }


@dataclass(frozen=True)
class MachineShortCircuitResult:
    """Per-machine SC breakdown + decayed breaking current (IEC 60909 §6.6)."""

    fault_node_id: str
    c_factor: float
    t_min_s: float
    contributions: list[MachinePartialContribution] = field(default_factory=list)
    ikss_machines_a: float = 0.0  # Σ partial I″k from all machines
    ib_machines_a: float = 0.0  # Σ partial breaking current (decayed, μ·q per maszyna)
    motors_negligible: bool = True  # §6.6 small-motor omission
    white_box: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "standard": "IEC 60909-0:2016 §6.6",
            "fault_node_id": self.fault_node_id,
            "c_factor": float(self.c_factor),
            "t_min_s": float(self.t_min_s),
            "contributions": [c.to_dict() for c in self.contributions],
            "ikss_machines_a": float(self.ikss_machines_a),
            "ib_machines_a": float(self.ib_machines_a),
            "motors_negligible": self.motors_negligible,
            "white_box": self.white_box,
        }


def _sprawdz_impedancje_przejscia(z_f_ohm: complex | None, fault_node_id: str) -> complex | None:
    """Z_f wkładów maszyn — ta sama reguła danych i ta sama normalizacja Z_f = 0 → metaliczne
    co rdzeń IEC 60909 (`network_model.core.impedancja_przejscia`, karta OD-14): wkłady
    maszyn tego samego biegu nie mogą przyjąć danej, której rdzeń odmawia."""
    if z_f_ohm is None:
        return None
    kod = kod_odmowy_impedancji(float(z_f_ohm.real), float(z_f_ohm.imag))
    if kod is not None:
        raise OdmowaWejsciaRdzenia(
            [
                RekordOdmowy(
                    kod,
                    OPISY_ODMOW_IMPEDANCJI[kod],
                    (OdwolanieElementu(RODZAJ_WEZEL, fault_node_id),),
                )
            ]
        )
    return impedancja_przejscia_obliczeniowa(float(z_f_ohm.real), float(z_f_ohm.imag))


def compute_machine_contributions(
    graph: NetworkGraph,
    fault_node_id: str,
    *,
    c_factor: float,
    t_min_s: float,
    z_f_ohm: complex | None = None,
) -> MachineShortCircuitResult:
    """Per-machine partial I″k + breaking current i_b (μ/q) for a 3-phase fault.

    ``t_min_s`` — minimalny czas zwłoki t_min = t_b biegu (najkrótszy czas zabezpieczenia
    + najkrótszy czas własny wyłącznika), wybiera krzywe μ i q. Parametr WYMAGANY, bez
    wartości domyślnej w sygnaturze: wołający podaje t_b PUNKTU ZWARCIA rozstrzygnięte jedną
    regułą (karta TB-WARTOSC-ROBOCZA — scenariusz projektanta, najkrótszy czas wyłączenia pól
    lokalnych, inaczej wartość robocza z `network_model.core.czas_wylaczenia`).

    Reads the frozen Z-bus (``build_zbus``) READ-ONLY. Returns an empty result (no
    machines) deterministically. Partial currents follow the superposition identity
    I_partial,m = c·Z_mk/(Z_kk·Z_m) referred to the fault-bus base.

    ``z_f_ohm`` (karta OD-14, partia integracji 10): zwarcie trójfazowe przez impedancję
    przejścia Z_f — ta sama superpozycja z pętlą Z_kk + Z_f w mianowniku (rozkład prądu
    zwarciowego na źródła nie zależy od Z_f, zmienia się sam prąd w miejscu zwarcia). Wynik
    poza zakresem IEC 60909; ``None`` = zwarcie metaliczne, bit w bit.
    """
    # Reguła danych Z_f PRZED rozgałęzieniem „brak maszyn": niedopuszczalna Z_f jest odmową
    # niezależnie od tego, czy sieć ma maszyny (ta sama dana, ta sama odmowa co rdzeń).
    z_f_ohm = _sprawdz_impedancje_przejscia(z_f_ohm, fault_node_id)
    slad_z_f: dict[str, object] = (
        {"z_f_ohm": {"re": z_f_ohm.real, "im": z_f_ohm.imag}, "poza_zakresem_iec60909": True}
        if z_f_ohm is not None
        else {}
    )
    sync = graph.get_synchronous_machine_sources()
    asyn = graph.get_asynchronous_machine_sources()
    if not sync and not asyn:
        return MachineShortCircuitResult(
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            t_min_s=t_min_s,
            white_box={
                "note": "Brak maszyn wirujących — udział zerowy (model §6.6 nieaktywny).",
                **slad_z_f,
            },
        )

    # `build_zbus` jest rdzeniem B-01: osobliwa macierz Y (sieć bez drogi do odniesienia)
    # to jego odmowa danych zgłaszana gołym `ValueError` (karta ODMOWA-DANYCH-422).
    with odmowa_rdzenia_b01():
        builder, z_bus = build_zbus(graph)
    index = builder.node_id_to_index
    if fault_node_id not in index:
        raise odmowa_wezla_zwarcia_spoza_grafu(fault_node_id)
    k = index[fault_node_id]
    z_kk = z_bus[k, k]
    # Pętla zwarcia: Z_kk (metaliczne) albo Z_kk + Z_f (karta OD-14) w tej samej bazie pu.
    z_f_pu = None if z_f_ohm is None else z_f_ohm / builder.get_zbase_ohm(fault_node_id)
    z_petli = z_kk if z_f_pu is None else z_kk + z_f_pu
    vn_k_kv = graph.nodes[fault_node_id].voltage_level
    i_base_k = S_BASE_MVA * 1.0e3 / (_SQRT3 * vn_k_kv)  # A — fault-bus current base
    # Total I″k from the Z-bus (machines included): I_f_pu = c / Z_kk_pu.
    ikss_total_a = (c_factor / abs(z_petli)) * i_base_k

    def partial_a(node_id: str, z_internal_ohm: complex) -> tuple[float, float, float, dict]:
        """Prad czesciowy maszyny + wartosci posrednie do wywodu WHITE BOX.

        Zwraca (I″k,m w miejscu zwarcia [A], I″k,m na zaciskach maszyny [A],
        ΔU″/(c·U_n/√3) [-], detale wywodu). Maszyna spoza macierzy (węzeł bez połączenia
        z miejscem zwarcia) albo o Z″ = 0 nie oddaje prądu: trzy zera są wynikiem
        fizycznym (brak prądu = brak spadku), a puste detale pomijają krok wywodu.

        Prąd odniesiony do miejsca zwarcia (baza prądu węzła zwarcia) i ten sam prąd na
        zaciskach maszyny (baza prądu węzła maszyny) — krotność I″k/I_r krzywej μ liczy się
        z prądów na zaciskach (ten sam poziom napięcia co I_r); przy maszynie w poziomie
        napięcia węzła zwarcia obie liczby są identyczne. ΔU″/(c·U_n/√3) = X″_m·|I″_m|/c
        w jednostkach względnych (spadek na reaktancji podprzejściowej maszyny).
        """
        m_idx = index.get(node_id)
        if m_idx is None or abs(z_internal_ohm) == 0.0:
            return 0.0, 0.0, 0.0, {}
        z_m_pu = z_internal_ohm / builder.get_zbase_ohm(node_id)
        z_mk = z_bus[m_idx, k]
        i_pu = c_factor * z_mk / (z_petli * z_m_pu)
        i_base_m = S_BASE_MVA * 1.0e3 / (_SQRT3 * graph.nodes[node_id].voltage_level)
        detale = {
            "z_mk_pu": abs(z_mk),
            "z_kk_pu": abs(z_kk),
            "z_m_pu": abs(z_m_pu),
            "i_base_a": i_base_k,
            "i_zaciski_a": abs(i_pu) * i_base_m,
            "x_m_pu": z_m_pu.imag,
            "i_m_pu": abs(i_pu),
            "delta_u_wzgledne": z_m_pu.imag * abs(i_pu) / c_factor,
            **({"z_petli_pu": abs(z_petli)} if z_f_pu is not None else {}),
        }
        return abs(i_pu) * i_base_k, detale["i_zaciski_a"], detale["delta_u_wzgledne"], detale

    def wywod_maszyny(
        *,
        z_internal_ohm: complex,
        detale: dict,
        ip_a: float,
        ir_a: float,
        ratio: float,
        mu: float,
        q: float,
        ib_a: float,
        is_sync: bool,
        p_per_pole_mw: float,
        dfig: bool,
    ) -> tuple:
        """Pelny wywod dyplomowy {tekst, latex}: wzor -> podstawienie -> wynik.

        Kazda liczba w podstawieniach pochodzi z wartosci posrednich TEGO biegu
        (WHITE BOX); formaty stale (determinizm).
        """
        ip_ka = ip_a / 1000.0
        kroki: list[dict] = [
            {
                "tekst": (
                    f"Impedancja zastępcza maszyny: Z″m = "
                    f"{z_internal_ohm.real:.4f} + j{z_internal_ohm.imag:.4f} Ω"
                ),
                "latex": (
                    rf"Z''_m = {z_internal_ohm.real:.4f} + j\,{z_internal_ohm.imag:.4f}"
                    rf"\;\Omega,\qquad |Z''_m| = {abs(z_internal_ohm):.4f}\;\Omega"
                ),
            },
        ]
        if detale:
            kroki.append(
                {
                    "tekst": (
                        "Prąd częściowy maszyny (superpozycja macierzy impedancji węzłowych; przy zwarciu "
                        "na zaciskach równoważny c·Un/(√3·Z″))"
                    ),
                    "latex": (
                        (
                            rf"I''_{{k,m}} = \frac{{c\,|Z_{{mk}}|}}{{|Z_{{kk}}|\,|Z_m|}}\,"
                            rf"I_{{\mathrm{{base}}}} = "
                            rf"\frac{{{c_factor:.2f} \cdot {detale['z_mk_pu']:.4f}}}"
                            rf"{{{detale['z_kk_pu']:.4f} \cdot {detale['z_m_pu']:.4f}}}"
                        )
                        if "z_petli_pu" not in detale
                        else (
                            rf"I''_{{k,m}} = \frac{{c\,|Z_{{mk}}|}}{{|Z_{{kk}} + Z_f|\,|Z_m|}}\,"
                            rf"I_{{\mathrm{{base}}}} = "
                            rf"\frac{{{c_factor:.2f} \cdot {detale['z_mk_pu']:.4f}}}"
                            rf"{{{detale['z_petli_pu']:.4f} \cdot {detale['z_m_pu']:.4f}}}"
                        )
                    )
                    + (
                        rf" \cdot {detale['i_base_a']:.0f}\;\mathrm{{A}}"
                        rf" = {ip_ka:.3f}\;\mathrm{{kA}}"
                    ),
                }
            )
        if ir_a > 0:
            i_zaciski_ka = float(detale.get("i_zaciski_a", 0.0)) / 1000.0
            kroki.append(
                {
                    "tekst": (
                        f"Krotność prądu znamionowego (prądy na zaciskach maszyny): "
                        f"I″k/Ir = {ratio:.2f}"
                    ),
                    "latex": (
                        rf"\frac{{I''_{{k,m}}}}{{I_{{r,m}}}} = "
                        rf"\frac{{{i_zaciski_ka:.3f}}}{{{ir_a / 1000.0:.3f}}} = {ratio:.2f}"
                    ),
                }
            )
        if ratio <= 2.0:
            kroki.append(
                {
                    "tekst": (
                        "Współczynnik zaniku: I″k/Ir ≤ 2 → μ = 1 "
                        "(zwarcie odległe od generatora, § 6.6.1)"
                    ),
                    "latex": r"\mu = 1{,}0 \quad (I''_k/I_r \le 2)",
                }
            )
        else:
            mu_latex, (a, b, w) = _krzywa(t_min_s, _MU_CURVE_LATEX)
            mu_surowe = a + b * math.exp(-w * ratio)
            przyciecie = "" if abs(mu_surowe - mu) < 5e-4 else r" \rightarrow \mu = 1{,}0"
            kroki.append(
                {
                    "tekst": (
                        f"Współczynnik zaniku μ (krzywa t_min = {t_min_s:.2f} s, "
                        f"§ 6.6.1): μ = {mu:.3f}"
                    ),
                    "latex": (
                        mu_latex
                        + rf" = {a:.2f} + {b:.2f}\,e^{{-{w:.2f} \cdot {ratio:.2f}}}"
                        + rf" = {mu_surowe:.3f}"
                        + przyciecie
                    ),
                }
            )
        if not is_sync:
            if p_per_pole_mw <= 0.0:
                kroki.append(
                    {
                        "tekst": "Brak mocy na parę biegunów → q = 1 (§ 6.6.3)",
                        "latex": r"q = 1{,}0",
                    }
                )
            else:
                q_latex, (qa, qb) = _krzywa(t_min_s, _Q_CURVE_LATEX)
                q_surowe = qa + qb * math.log(p_per_pole_mw)
                przyciecie_q = "" if abs(q_surowe - q) < 5e-4 else rf" \rightarrow q = {q:.3f}"
                kroki.append(
                    {
                        "tekst": (
                            f"Współczynnik q silnika asynchronicznego (m = "
                            f"{p_per_pole_mw:.3f} MW na parę biegunów, § 6.6.3): q = {q:.3f}"
                        ),
                        "latex": (
                            q_latex
                            + rf" = {qa:.2f} + {qb:.2f}\,\ln({p_per_pole_mw:.3f})"
                            + rf" = {q_surowe:.3f}"
                            + przyciecie_q
                        ),
                    }
                )
        if dfig:
            kroki.append(
                {
                    "tekst": (
                        "Generator asynchroniczny dwustronnie zasilany (typ 3): założono zadziałanie "
                        "układu zwierającego wirnik → model maszyny asynchronicznej (§ 6.7), "
                        "zachowawczo dla I″k,max"
                    ),
                    "latex": None,
                }
            )
        if detale:
            kroki.append(
                {
                    "tekst": (
                        "Spadek napięcia na reaktancji podprzejściowej maszyny odniesiony do "
                        f"napięcia źródła zastępczego: ΔU″/(c·Un/√3) = "
                        f"{detale['delta_u_wzgledne']:.4f}"
                    ),
                    "latex": (
                        rf"\frac{{\Delta U''_m}}{{c\,U_n/\sqrt{{3}}}} = "
                        rf"\frac{{X''_m\,|I''_{{k,m}}|}}{{c}} = "
                        rf"\frac{{{detale['x_m_pu']:.4f} \cdot {detale['i_m_pu']:.4f}}}"
                        rf"{{{c_factor:.2f}}} = {detale['delta_u_wzgledne']:.4f}"
                    ),
                }
            )
        ib_ka = ib_a / 1000.0
        kroki.append(
            {
                "tekst": f"Prąd wyłączeniowy symetryczny: Ib = {ib_ka:.3f} kA",
                "latex": (
                    rf"I_b = \mu \cdot q \cdot I''_{{k,m}} = "
                    rf"{mu:.3f} \cdot {q:.3f} \cdot {ip_ka:.3f}\;\mathrm{{kA}}"
                    rf" = {ib_ka:.3f}\;\mathrm{{kA}}"
                ),
            }
        )
        return tuple(kroki)

    def wklad_maszyny(
        m: SynchronousMachineSource | AsynchronousMachineSource,
        *,
        is_sync: bool,
        p_per_pole_mw: float,
    ) -> MachinePartialContribution:
        """Wkład jednej maszyny: prąd częściowy, krotność na zaciskach, μ, q, i_b, ΔU″.

        ``p_per_pole_mw`` — moc czynna na parę biegunów m (krzywa q, § 6.6.3); maszyna
        synchroniczna nie ma krzywej q (q = 1) i wołający podaje 0.
        """
        ip_a, i_zaciski_a, delta_u_wzgledne, detale = partial_a(m.node_id, m.z_internal_ohm)
        ir_a = float(m.ir_a)
        if not ir_a > 0.0:
            # Dawne `ratio = ip / I_r if I_r > 0 else 0.0` wpychało krotność 0 do krzywej μ
            # (μ = 1 — „maszyna daleka") za NIEFIZYCZNY prąd znamionowy: dług nazwany
            # w zapadce `solver_input_substitute_guard`, zdjęty kartą SC-IB-ITH-ZRODLA.
            raise ValueError(
                f"{opis_rodzaju_i_nazwy('Maszyna', m.name)}: prąd znamionowy I_r = {ir_a!r} A nie jest "
                "dodatni — krotności I″k/I_r krzywej μ (IEC 60909-0:2016 § 6.6) nie da się "
                "wyznaczyć; popraw moc i napięcie znamionowe maszyny."
            )
        ratio = i_zaciski_a / ir_a
        mu = mu_factor(ratio, t_min_s)
        q = 1.0 if is_sync else q_factor(p_per_pole_mw, t_min_s)
        ib_a = mu * q * ip_a
        # DFIG (wind Type 3): on a severe fault the crowbar fires (rotor shorted), so
        # the machine is treated as a squirrel-cage induction generator — same §6.7/§6.6
        # μ·q math, only the label differs (the crowbar assumption is documented).
        if is_sync:
            mtype = "SYNCHRONOUS"
        else:
            mtype = "DFIG" if getattr(m, "wind_type_3", False) else "ASYNCHRONOUS"
        return MachinePartialContribution(
            source_id=m.id,
            source_name=m.name,
            machine_type=mtype,
            node_id=m.node_id,
            z_internal_ohm=m.z_internal_ohm,
            ir_a=ir_a,
            ikss_partial_a=ip_a,
            ratio_ik_ir=ratio,
            mu=mu,
            q=q,
            ib_a=ib_a,
            is_synchronous_machine=is_sync,
            p_per_pole_mw=p_per_pole_mw,
            ikss_zaciski_a=i_zaciski_a,
            delta_u_wzgledne=delta_u_wzgledne,
            wywod=wywod_maszyny(
                z_internal_ohm=m.z_internal_ohm,
                detale=detale,
                ip_a=ip_a,
                ir_a=ir_a,
                ratio=ratio,
                mu=mu,
                q=q,
                ib_a=ib_a,
                is_sync=is_sync,
                p_per_pole_mw=p_per_pole_mw,
                dfig=mtype == "DFIG",
            ),
        )

    contributions: list[MachinePartialContribution] = [
        wklad_maszyny(m, is_sync=True, p_per_pole_mw=0.0) for m in sync
    ] + [wklad_maszyny(m, is_sync=False, p_per_pole_mw=m.p_per_pole_mw) for m in asyn]

    ikss_machines = sum(c.ikss_partial_a for c in contributions)
    ib_machines = sum(c.ib_a for c in contributions)
    # Small-motor omission (IEC 60909-0:2016 §6.6): asynchronous motors may be
    # neglected if their combined contribution to I″k is ≤ 5 % of the total I″k.
    async_partial = sum(c.ikss_partial_a for c in contributions if not c.is_synchronous_machine)
    motors_negligible = bool(async_partial <= 0.05 * ikss_total_a) if ikss_total_a > 0 else True

    white_box = {
        "model": "IEC 60909-0:2016 §6.6 — prądy częściowe maszyn + zanik (μ, q)",
        "fault_node_id": fault_node_id,
        "z_kk_ohm": {
            "re": (z_kk * builder.get_zbase_ohm(fault_node_id)).real,
            "im": (z_kk * builder.get_zbase_ohm(fault_node_id)).imag,
        },
        "i_base_a": i_base_k,
        "ikss_total_a": ikss_total_a,
        "partial_formula": "I_partial,m = c·Z_mk/(Z_kk·Z_m) · I_base  (przy zwarciu na zaciskach → c·Un/(√3·Z″))",
        "n_synchronous": len(sync),
        "n_asynchronous": len(asyn),
        "n_dfig": sum(1 for m in asyn if getattr(m, "wind_type_3", False)),
        "small_motor_rule": "silniki pomijalne gdy ΣI″k,M ≤ 0.05·I″k (§6.6)",
        # WHITE BOX (ZWARCIA-PRO F3 pkt 9, addytywnie): liczby reguły małych
        # silników — wartość obliczona ΣI″k,M (asynchroniczne) i próg 0.05·I″k,
        # użyte w werdykcie `motors_negligible` powyżej (audyt 1:1).
        "ikss_async_machines_a": async_partial,
        "small_motor_limit_a": 0.05 * ikss_total_a,
        **slad_z_f,
        "dfig_assumption": (
            "DFIG (Typ 3): założono zadziałanie crowbar (rotor zwarty) → model maszyny "
            "asynchronicznej za Z_M (§6.7); udział przekształtnika pominięty (zachowawczo dla I″k,max)."
        ),
    }
    return MachineShortCircuitResult(
        fault_node_id=fault_node_id,
        c_factor=c_factor,
        t_min_s=t_min_s,
        contributions=contributions,
        ikss_machines_a=ikss_machines,
        ib_machines_a=ib_machines,
        motors_negligible=motors_negligible,
        white_box=white_box,
    )
