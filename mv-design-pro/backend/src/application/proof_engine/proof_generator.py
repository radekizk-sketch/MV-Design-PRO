"""
Proof Generator — Generator dowodów matematycznych P11.1a

STATUS: CANONICAL & BINDING
Reference: P11_1a_MVP_SC3F_AND_VDROP.md, PROOF_SCHEMAS.md

Generuje ProofDocument na podstawie:
- ShortCircuitResult (dla SC3F)
- white_box_trace
- Equation Registry
"""

from __future__ import annotations

import math
from dataclasses import dataclass, fields, is_dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from application.proof_engine.equation_registry import (
    EQ_EARTH_001,
    EQ_EARTH_002,
    EQ_EARTH_003,
    EQ_LC_001,
    EQ_LC_002,
    EQ_LC_003,
    EQ_LC_004,
    EQ_LC_005,
    EQ_LC_006,
    EQ_LE_001,
    EQ_LE_002,
    EQ_LE_003,
    EQ_LE_004,
    EQ_LF_001,
    EQ_LF_002,
    EQ_LF_003,
    EQ_LF_004,
    EQ_LF_005,
    EQ_LF_006,
    EQ_LF_007,
    EQ_PR_001,
    EQ_PR_002,
    EQ_PR_003,
    EQ_PR_004,
    EQ_QU_001,
    EQ_QU_002,
    EQ_QU_003,
    EQ_QU_004,
    EQ_QU_005,  # P11.1c: VDROP link
    EQ_SC1_001,
    EQ_SC1_002,
    EQ_SC1_006,
    EQ_SC1_007,
    EQ_SC1_008,
    EQ_SC1_009,
    EQ_SC1_010,
    EQ_SC1_011,
    EQ_SC1_012,
    EQ_SC3F_003,
    EQ_SC3F_004,
    EQ_SC3F_005,
    EQ_SC3F_006,
    EQ_SC3F_007,
    EQ_SC3F_008,
    EQ_SC3F_011,
    EQ_SC3F_012,
    EQ_SC3F_013,
    EQ_VDROP_001,
    EQ_VDROP_002,
    EQ_VDROP_003,
    EQ_VDROP_004,
    EQ_VDROP_005,
    EQ_VDROP_006,
    EQ_VDROP_007,
    AntiDoubleCountingAudit,
    EQ_SC3F_008a,
    EquationRegistry,
)
from application.proof_engine.types import (
    EarthingGroundFaultInput,
    LoadCurrentsCounterfactualInput,
    LoadCurrentsInput,
    LoadElementKind,
    LossesEnergyInput,
    ProofDocument,
    ProofHeader,
    ProofStep,
    ProofSummary,
    ProofType,
    ProofValue,
    ProtectionProofInput,
    ProtectionSelectivityInput,
    QUCounterfactualInput,
    QUInput,
    UnitCheckResult,
)
from application.proof_engine.unit_verifier import UnitVerifier
from network_model.solvers.machine_sc_iec60909 import (
    MachinePartialContribution,
    MachineShortCircuitResult,
)
from network_model.solvers.short_circuit_asymmetrical_quantities import (
    SC1AsymmetricalQuantities,
    normalize_sc1_fault_type,
)

if TYPE_CHECKING:
    from network_model.catalog import CatalogRepository


@dataclass
class SC3FInput:
    """
    Dane wejściowe dla generatora dowodu SC3F.

    Mapowanie z ShortCircuitResult:
    - c_factor → c_factor
    - un_v → u_n_kv (konwersja V → kV)
    - zkk_ohm → z_thevenin_ohm
    - ikss_a → ikss_ka (konwersja A → kA)
    - ip_a → ip_ka (konwersja A → kA)
    - ith_a → ith_ka (konwersja A → kA)
    - sk_mva → sk_mva
    - kappa → kappa
    - rx_ratio → rx_ratio
    """

    # Identyfikacja
    project_name: str
    case_name: str
    fault_node_id: str
    fault_type: str
    run_timestamp: datetime
    solver_version: str

    # Wartości z solvera (już skonwertowane)
    c_factor: float
    u_n_kv: float
    z_thevenin_ohm: complex
    ikss_ka: float
    ip_ka: float
    ith_ka: float
    sk_mva: float
    kappa: float
    rx_ratio: float
    tk_s: float

    # Opcjonalne wartości pośrednie (z white_box_trace)
    m_factor: float = 1.0
    n_factor: float = 0.0

    # Opcjonalny rozkład maszynowy (IEC 60909 §6.6) — gdy sieć zawiera maszyny wirujące,
    # generator dołącza per-maszyna kroki μ / q / i_b. None ⇒ brak sekcji maszynowej.
    machine_result: MachineShortCircuitResult | None = None

    @classmethod
    def from_short_circuit_result(
        cls,
        result: Any,  # ShortCircuitResult
        project_name: str = "Projekt",
        case_name: str = "Przypadek",
        solver_version: str = "1.0.0",
    ) -> SC3FInput:
        """
        Tworzy SC3FInput z ShortCircuitResult.

        Konwersje jednostek:
        - V → kV: / 1000
        - A → kA: / 1000
        """
        return cls(
            project_name=project_name,
            case_name=case_name,
            fault_node_id=result.fault_node_id,
            fault_type=result.short_circuit_type.value,
            run_timestamp=datetime.utcnow(),
            solver_version=solver_version,
            c_factor=result.c_factor,
            u_n_kv=result.un_v / 1000.0,
            z_thevenin_ohm=result.zkk_ohm,
            ikss_ka=result.ikss_a / 1000.0,
            ip_ka=result.ip_a / 1000.0,
            ith_ka=result.ith_a / 1000.0,
            sk_mva=result.sk_mva,
            kappa=result.kappa,
            rx_ratio=result.rx_ratio,
            tk_s=result.tk_s,
        )


@dataclass
class VDROPSegmentInput:
    """Dane wejściowe dla pojedynczego odcinka VDROP."""

    segment_id: str
    from_bus_id: str
    to_bus_id: str
    r_ohm_per_km: float
    x_ohm_per_km: float
    length_km: float
    p_mw: float
    q_mvar: float
    u_n_kv: float


@dataclass
class VDROPInput:
    """Dane wejściowe dla generatora dowodu VDROP."""

    project_name: str
    case_name: str
    source_bus_id: str
    target_bus_id: str
    run_timestamp: datetime
    solver_version: str
    segments: list[VDROPSegmentInput]
    u_source_kv: float


@dataclass
class LoadFlowBusInput:
    """Dane wejściowe dla BUS w dowodzie P32."""

    bus_id: str
    u_ll_kv: float | None
    u_nom_kv: float | None


@dataclass
class LoadFlowElementInput:
    """Dane wejściowe dla elementu w dowodzie P32."""

    element_id: str
    element_kind: LoadElementKind
    from_bus_id: str | None
    to_bus_id: str | None
    length_km: float | None = None
    type_ref: str | None = None
    r_ohm: float | None = None
    x_ohm: float | None = None
    p_mw: float | None = None
    q_mvar: float | None = None
    u_nom_kv: float | None = None
    u_ll_kv: float | None = None


@dataclass
class LoadFlowVoltageInput:
    """Dane wejściowe dla generatora dowodu P32."""

    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_version: str
    buses: list[LoadFlowBusInput]
    elements: list[LoadFlowElementInput]
    catalog: CatalogRepository | None = None


@dataclass
class SC1Input:
    """Dane wejściowe dla generatora dowodu SC1 (P11.1c FULL + §4.1)."""

    # Identyfikacja
    project_name: str
    case_name: str
    fault_node_id: str
    fault_type: str
    run_timestamp: datetime
    solver_version: str

    # Dane znamionowe / prefault
    u_n_kv: float
    c_factor: float
    u_prefault_kv: float

    # Składowe impedancji
    z1_ohm: complex
    z2_ohm: complex
    z0_ohm: complex

    # Operator a (Fortescue)
    a_operator: complex

    # Post-fault quantities (§4.1 — I″k, ip, I_th, I_dyn mandatory)
    tk_s: float = 1.0
    m_factor: float = 1.0
    n_factor: float = 0.0

    # Wielkości POLICZONE w warstwie solverów (V12K-118, NOT-A-SOLVER):
    # komplet Z_ekw / prądów składowych i fazowych / I″k / κ / i_p / I_dyn / I_th
    # z compute_sc1_asymmetrical_quantities. Pole addytywne (default None dla
    # zgodności konstruktora), ale WYMAGANE przez generate_sc1_proof —
    # proof engine nie liczy fizyki, wyłącznie formatuje kroki dowodu.
    quantities: SC1AsymmetricalQuantities | None = None


class ProofGenerator:
    """
    Generator dowodów matematycznych P11.1a.

    Generuje:
    - Dowody SC3F (zwarcia trójfazowe IEC 60909)
    - Dowody VDROP (spadki napięć)

    Gwarantuje:
    - Determinizm (ten sam input → identyczny output)
    - Kompletność (wszystkie kroki z rejestru)
    - Weryfikację jednostek (automatyczna)
    """

    # =========================================================================
    # P32: Load Flow & Voltage Drop (post-hoc)
    # =========================================================================

    @classmethod
    def generate_load_flow_voltage_proof(
        cls,
        data: LoadFlowVoltageInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód P32: Load Flow i spadki napięć.

        Braki danych → ostrzeżenia + NOT COMPUTED (BINDING).
        """
        if artifact_id is None:
            artifact_id = uuid4()

        warnings: list[str] = []
        steps: list[ProofStep] = []
        step_number = 0

        element_count = 0
        bus_count = 0
        missing_sections = 0

        for element in sorted(data.elements, key=lambda item: item.element_id):
            element_count += 1
            resolved = cls._resolve_lf_element_params(element, data.catalog)
            missing = cls._missing_lf_element_inputs(resolved)
            if missing:
                missing_sections += 1
                warnings.append(
                    cls._format_missing_warning(
                        scope=f"ELEMENT {element.element_id}",
                        missing=missing,
                    )
                )

            s_mva = None
            if resolved.p_mw is not None and resolved.q_mvar is not None:
                s_mva = math.sqrt(resolved.p_mw**2 + resolved.q_mvar**2)

            i_ka = None
            u_ll_kv = resolved.u_ll_kv or resolved.u_nom_kv
            if s_mva is not None and u_ll_kv:
                i_ka = s_mva / (math.sqrt(3.0) * u_ll_kv)

            delta_u_r = None
            if resolved.r_ohm is not None and resolved.p_mw is not None and resolved.u_nom_kv:
                delta_u_r = (resolved.r_ohm * resolved.p_mw) / resolved.u_nom_kv

            delta_u_x = None
            if resolved.x_ohm is not None and resolved.q_mvar is not None and resolved.u_nom_kv:
                delta_u_x = (resolved.x_ohm * resolved.q_mvar) / resolved.u_nom_kv

            delta_u = None
            if delta_u_r is not None and delta_u_x is not None:
                delta_u = delta_u_r + delta_u_x

            step_number += 1
            steps.append(
                cls._create_lf_apparent_power_step(
                    step_number=step_number,
                    element=resolved,
                    s_mva=s_mva,
                )
            )

            step_number += 1
            steps.append(
                cls._create_lf_current_step(
                    step_number=step_number,
                    element=resolved,
                    s_mva=s_mva,
                    u_ll_kv=u_ll_kv,
                    i_ka=i_ka,
                )
            )

            step_number += 1
            steps.append(
                cls._create_lf_delta_u_r_step(
                    step_number=step_number,
                    element=resolved,
                    delta_u_r=delta_u_r,
                )
            )

            step_number += 1
            steps.append(
                cls._create_lf_delta_u_x_step(
                    step_number=step_number,
                    element=resolved,
                    delta_u_x=delta_u_x,
                )
            )

            step_number += 1
            steps.append(
                cls._create_lf_delta_u_step(
                    step_number=step_number,
                    element=resolved,
                    delta_u_r=delta_u_r,
                    delta_u_x=delta_u_x,
                    delta_u=delta_u,
                )
            )

        for bus in sorted(data.buses, key=lambda item: item.bus_id):
            bus_count += 1
            missing = cls._missing_lf_bus_inputs(bus)
            if missing:
                missing_sections += 1
                warnings.append(
                    cls._format_missing_warning(
                        scope=f"BUS {bus.bus_id}",
                        missing=missing,
                    )
                )

            u_pu = None
            if bus.u_ll_kv is not None and bus.u_nom_kv:
                u_pu = bus.u_ll_kv / bus.u_nom_kv

            delta_pct = None
            if bus.u_ll_kv is not None and bus.u_nom_kv:
                delta_pct = 100.0 * (bus.u_ll_kv - bus.u_nom_kv) / bus.u_nom_kv

            step_number += 1
            steps.append(
                cls._create_lf_bus_pu_step(
                    step_number=step_number,
                    bus=bus,
                    u_pu=u_pu,
                )
            )

            step_number += 1
            steps.append(
                cls._create_lf_bus_delta_step(
                    step_number=step_number,
                    bus=bus,
                    delta_pct=delta_pct,
                )
            )

        unit_checks_passed = all(step.unit_check.passed for step in steps)
        total_sections = element_count + bus_count
        if missing_sections == 0:
            computed_status = "COMPUTED"
        elif missing_sections >= total_sections and total_sections > 0:
            computed_status = "NOT COMPUTED"
        else:
            computed_status = "PARTIAL"

        key_results = {
            "bus_count": ProofValue.create("N_{bus}", bus_count, "—", "bus_count"),
            "element_count": ProofValue.create("N_{el}", element_count, "—", "element_count"),
            "computed_status": cls._status_value(
                r"\text{status obliczeń}",
                computed_status,
                "computed_status",
            ),
        }

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=tuple(warnings),
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
            element_kind="LOAD_FLOW_VOLTAGE",
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.LOAD_FLOW_VOLTAGE,
            title_pl="Dowód: Load Flow i spadki napięć (P32)",
            header=header,
            steps=steps,
            summary=summary,
        )

    # =========================================================================
    # SC3F Generator
    # =========================================================================

    @classmethod
    def generate_sc3f_proof(
        cls,
        data: SC3FInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód SC3F (zwarcie trójfazowe IEC 60909).

        Model Anti-Double-Counting: A1 (c tylko w EQ_SC3F_004)

        Kroki obowiązkowe (BINDING):
        1. Impedancja Thevenina (z solvera)
        2. Początkowy prąd zwarciowy I_k'' (c TUTAJ — jedyne miejsce)
        3. Współczynnik udaru κ
        4. Prąd udarowy i_p
        5. Prąd dynamiczny I_dyn (OBOWIĄZKOWY)
        6. Prąd cieplny I_th (OBOWIĄZKOWY)
        7. Moc zwarciowa S_k''

        Args:
            data: Dane wejściowe SC3FInput
            artifact_id: Opcjonalny ID artefaktu

        Returns:
            ProofDocument z pełnym dowodem
        """
        # Weryfikacja anti-double-counting przed generacją
        assert AntiDoubleCountingAudit.verify(), "Anti-Double-Counting audit failed!"

        if artifact_id is None:
            artifact_id = uuid4()

        steps: list[ProofStep] = []
        step_number = 0

        # Wartości pośrednie do reużycia
        z_abs = abs(data.z_thevenin_ohm)
        r_th = data.z_thevenin_ohm.real
        x_th = data.z_thevenin_ohm.imag

        # =====================================================================
        # Krok 1: Impedancja Thevenina (prezentacja wartości z solvera)
        # =====================================================================
        step_number += 1
        step_1 = cls._create_sc3f_step_z_th(
            step_number=step_number,
            z_thevenin_ohm=data.z_thevenin_ohm,
            r_th=r_th,
            x_th=x_th,
        )
        steps.append(step_1)

        # =====================================================================
        # Krok 2: Początkowy prąd zwarciowy I_k'' (c TUTAJ — jedyne miejsce)
        # =====================================================================
        step_number += 1
        step_2 = cls._create_sc3f_step_ikss(
            step_number=step_number,
            c_factor=data.c_factor,
            u_n_kv=data.u_n_kv,
            z_th_abs=z_abs,
            ikss_ka=data.ikss_ka,
        )
        steps.append(step_2)

        # =====================================================================
        # Krok 3: Współczynnik udaru κ
        # =====================================================================
        step_number += 1
        step_3 = cls._create_sc3f_step_kappa(
            step_number=step_number,
            r_th=r_th,
            x_th=x_th,
            kappa=data.kappa,
        )
        steps.append(step_3)

        # =====================================================================
        # Krok 4: Prąd udarowy i_p
        # =====================================================================
        step_number += 1
        step_4 = cls._create_sc3f_step_ip(
            step_number=step_number,
            kappa=data.kappa,
            ikss_ka=data.ikss_ka,
            ip_ka=data.ip_ka,
        )
        steps.append(step_4)

        # =====================================================================
        # Krok 5: Prąd dynamiczny I_dyn (OBOWIĄZKOWY)
        # =====================================================================
        step_number += 1
        idyn_ka = data.ip_ka  # I_dyn = i_p
        step_5 = cls._create_sc3f_step_idyn(
            step_number=step_number,
            ip_ka=data.ip_ka,
            idyn_ka=idyn_ka,
        )
        steps.append(step_5)

        # =====================================================================
        # Krok 6: Prąd cieplny I_th (OBOWIĄZKOWY)
        # =====================================================================
        step_number += 1
        step_6 = cls._create_sc3f_step_ith(
            step_number=step_number,
            ikss_ka=data.ikss_ka,
            m_factor=data.m_factor,
            n_factor=data.n_factor,
            ith_ka=data.ith_ka,
        )
        steps.append(step_6)

        # =====================================================================
        # Krok 7: Moc zwarciowa S_k''
        # =====================================================================
        step_number += 1
        step_7 = cls._create_sc3f_step_sk(
            step_number=step_number,
            u_n_kv=data.u_n_kv,
            ikss_ka=data.ikss_ka,
            sk_mva=data.sk_mva,
        )
        steps.append(step_7)

        # =====================================================================
        # Sekcja maszynowa (IEC 60909 §6.6) — per-maszyna μ / q / i_b, gdy sieć
        # zawiera maszyny wirujące. Synchroniczne: μ + i_b (q = 1, krok q pominięty);
        # asynchroniczne / DFIG: μ + q + i_b. Kolejność = deterministyczna z solvera.
        # =====================================================================
        ib_machines_ka = 0.0
        if data.machine_result is not None and data.machine_result.contributions:
            t_min_s = data.machine_result.t_min_s
            for machine in data.machine_result.contributions:
                step_number += 1
                steps.append(cls._create_sc3f_step_machine_mu(step_number, machine, t_min_s))
                if not machine.is_synchronous_machine:
                    step_number += 1
                    steps.append(cls._create_sc3f_step_machine_q(step_number, machine, t_min_s))
                step_number += 1
                steps.append(cls._create_sc3f_step_machine_ib(step_number, machine))
            ib_machines_ka = data.machine_result.ib_machines_a / 1000.0

        # =====================================================================
        # Podsumowanie
        # =====================================================================
        unit_checks_passed = all(s.unit_check.passed for s in steps)

        key_results = {
            "ikss_ka": ProofValue.create("I_k''", data.ikss_ka, "kA", "ikss_ka"),
            "ip_ka": ProofValue.create("i_p", data.ip_ka, "kA", "ip_ka"),
            "idyn_ka": ProofValue.create("I_{dyn}", idyn_ka, "kA", "idyn_ka"),
            "ith_ka": ProofValue.create("I_{th}", data.ith_ka, "kA", "ith_ka"),
            "sk_mva": ProofValue.create("S_k''", data.sk_mva, "MVA", "sk_mva"),
            "kappa": ProofValue.create("\\kappa", data.kappa, "—", "kappa"),
        }
        if data.machine_result is not None and data.machine_result.contributions:
            key_results["ib_machines_ka"] = ProofValue.create(
                "i_{b,maszyny}", ib_machines_ka, "kA", "ib_machines_ka"
            )

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=(),
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
            fault_location=data.fault_node_id,
            fault_type=data.fault_type,
            voltage_factor=data.c_factor,
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.SC3F_IEC60909,
            title_pl="Dowód obliczeń zwarciowych IEC 60909 — zwarcie trójfazowe",
            header=header,
            steps=steps,
            summary=summary,
        )

    # =========================================================================
    # SC1 Generator (P11.1c FULL)
    # =========================================================================

    @classmethod
    def generate_sc1_proof(
        cls,
        data: SC1Input,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód SC1 (zwarcia asymetryczne) — czysty formatter (§4.1).

        Zawiera OBOWIĄZKOWE wyniki (§4.1):
        - I″k (początkowy prąd zwarciowy)
        - ip (prąd udarowy)
        - I_th (prąd cieplny równoważny)
        - I_dyn (prąd dynamiczny)

        NOT-A-SOLVER (V12K-118): wszystkie wielkości fizyczne pochodzą z
        ``data.quantities`` policzonych w warstwie solverów
        (``network_model/solvers/short_circuit_asymmetrical_quantities``);
        generator wyłącznie buduje kroki dowodu (wzór → podstawienie → wynik).
        """
        if artifact_id is None:
            artifact_id = uuid4()

        fault_type = cls._normalize_sc1_fault_type(data.fault_type)
        proof_type = cls._map_sc1_proof_type(fault_type)
        step_order = EquationRegistry.get_sc1_step_order(fault_type)

        if data.quantities is None:
            raise ValueError(
                "SC1Input.quantities jest wymagane — proof engine nie liczy fizyki "
                "(NOT-A-SOLVER); wielkości zwarciowe SC1 liczy solver "
                "network_model/solvers/short_circuit_asymmetrical_quantities."
            )
        quantities = data.quantities
        if quantities.fault_type != fault_type:
            raise ValueError(
                f"SC1Input.quantities policzone dla typu {quantities.fault_type}, "
                f"a dowód dotyczy typu {fault_type}"
            )

        z_equiv = quantities.z_equiv_ohm
        i1, i2, i0 = quantities.i1_ka, quantities.i2_ka, quantities.i0_ka
        ia, ib, ic = quantities.ia_ka, quantities.ib_ka, quantities.ic_ka
        ikss_ka = quantities.ikss_ka
        r_equiv = quantities.r_equiv_ohm
        x_equiv = quantities.x_equiv_ohm
        kappa = quantities.kappa
        ip_ka = quantities.ip_ka
        idyn_ka = quantities.idyn_ka
        ith_ka = quantities.ith_ka

        steps: list[ProofStep] = []
        step_number = 0

        for eq_id in step_order:
            equation = EquationRegistry.get_equation(eq_id)
            if equation is None:
                raise ValueError(f"Missing equation definition for {eq_id}")
            step_number += 1

            if eq_id == "EQ_SC1_001":
                step = cls._create_sc1_step_z_sequence(
                    step_number=step_number,
                    z1=data.z1_ohm,
                    z2=data.z2_ohm,
                    z0=data.z0_ohm,
                )
            elif eq_id == "EQ_SC1_002":
                step = cls._create_sc1_step_a_operator(
                    step_number=step_number,
                    a_operator=data.a_operator,
                )
            elif eq_id in {"EQ_SC1_003", "EQ_SC1_004", "EQ_SC1_005"}:
                step = cls._create_sc1_step_equiv_impedance(
                    step_number=step_number,
                    equation_id=eq_id,
                    z1=data.z1_ohm,
                    z2=data.z2_ohm,
                    z0=data.z0_ohm,
                    z_equiv=z_equiv,
                )
            elif eq_id == "EQ_SC1_006":
                step = cls._create_sc1_step_sequence_currents(
                    step_number=step_number,
                    fault_type=fault_type,
                    u_prefault_kv=data.u_prefault_kv,
                    z_equiv=z_equiv,
                    z2=data.z2_ohm,
                    z0=data.z0_ohm,
                    i1=i1,
                    i2=i2,
                    i0=i0,
                )
            elif eq_id == "EQ_SC1_007":
                step = cls._create_sc1_step_phase_currents(
                    step_number=step_number,
                    a_operator=data.a_operator,
                    i0=i0,
                    i1=i1,
                    i2=i2,
                    ia=ia,
                    ib=ib,
                    ic=ic,
                )
            elif eq_id == "EQ_SC1_008":
                step = cls._create_sc1_step_ikss(
                    step_number=step_number,
                    fault_type=fault_type,
                    c_factor=data.c_factor,
                    u_n_kv=data.u_n_kv,
                    z_equiv=z_equiv,
                    ikss_ka=ikss_ka,
                )
            elif eq_id == "EQ_SC1_009":
                step = cls._create_sc1_step_kappa(
                    step_number=step_number,
                    r_equiv=r_equiv,
                    x_equiv=x_equiv,
                    kappa=kappa,
                )
            elif eq_id == "EQ_SC1_010":
                step = cls._create_sc1_step_ip(
                    step_number=step_number,
                    kappa=kappa,
                    ikss_ka=ikss_ka,
                    ip_ka=ip_ka,
                )
            elif eq_id == "EQ_SC1_011":
                step = cls._create_sc1_step_ith(
                    step_number=step_number,
                    ikss_ka=ikss_ka,
                    m_factor=data.m_factor,
                    n_factor=data.n_factor,
                    ith_ka=ith_ka,
                )
            elif eq_id == "EQ_SC1_012":
                step = cls._create_sc1_step_idyn(
                    step_number=step_number,
                    ip_ka=ip_ka,
                    idyn_ka=idyn_ka,
                )
            else:
                raise ValueError(f"Unsupported SC1 equation in step order: {eq_id}")
            steps.append(step)

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
            fault_location=data.fault_node_id,
            fault_type=fault_type,
            voltage_factor=data.c_factor,
        )

        unit_checks_passed = all(s.unit_check.passed for s in steps)
        key_results = {
            "z_equiv_ohm": ProofValue.create("Z_k", z_equiv, "Ω", "z_equiv_ohm"),
            "i1_ka": ProofValue.create("I_1", i1, "kA", "i1_ka"),
            "i2_ka": ProofValue.create("I_2", i2, "kA", "i2_ka"),
            "i0_ka": ProofValue.create("I_0", i0, "kA", "i0_ka"),
            "ia_ka": ProofValue.create("I_a", ia, "kA", "ia_ka"),
            "ib_ka": ProofValue.create("I_b", ib, "kA", "ib_ka"),
            "ic_ka": ProofValue.create("I_c", ic, "kA", "ic_ka"),
            "ikss_ka": ProofValue.create("I_k''", ikss_ka, "kA", "ikss_ka"),
            "ip_ka": ProofValue.create("i_p", ip_ka, "kA", "ip_ka"),
            "ith_ka": ProofValue.create("I_{th}", ith_ka, "kA", "ith_ka"),
            "idyn_ka": ProofValue.create("I_{dyn}", idyn_ka, "kA", "idyn_ka"),
            "kappa": ProofValue.create("\\kappa", kappa, "—", "kappa"),
        }

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=(),
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=proof_type,
            title_pl="Dowód obliczeń zwarciowych IEC 60909 — zwarcie asymetryczne",
            header=header,
            steps=steps,
            summary=summary,
        )

    @staticmethod
    def _map_sc1_proof_type(fault_type: str) -> ProofType:
        if fault_type == "SC1FZ":
            return ProofType.SC1F_IEC60909
        if fault_type == "SC2F":
            return ProofType.SC2F_IEC60909
        if fault_type == "SC2FZ":
            return ProofType.SC2FG_IEC60909
        raise ValueError(f"Unsupported SC1 fault type: {fault_type}")

    @staticmethod
    def _normalize_sc1_fault_type(fault_type: str) -> str:
        # Mapowanie nazw (nie fizyka) — jedno źródło w module solverowym SC1.
        return normalize_sc1_fault_type(fault_type)

    # =========================================================================
    # SC1 Post-Fault Step Builders (§4.1 — MANDATORY)
    # =========================================================================

    @classmethod
    def _create_sc1_step_ikss(
        cls,
        *,
        step_number: int,
        fault_type: str,
        c_factor: float,
        u_n_kv: float,
        z_equiv: complex,
        ikss_ka: float,
    ) -> ProofStep:
        """Step: I″k (initial SC current for asymmetrical faults). c TUTAJ."""
        equation = EQ_SC1_008
        z_abs = abs(z_equiv)

        input_values = (
            ProofValue.create("c", c_factor, "—", "c_factor"),
            ProofValue.create("U_n", u_n_kv, "kV", "u_n_kv"),
            ProofValue.create("Z_k", z_equiv, "Ω", "z_equiv_ohm"),
        )

        if fault_type == "SC1FZ":
            sqrt3 = math.sqrt(3.0)
            substitution = (
                f"I_k'' = \\frac{{\\sqrt{{3}} \\cdot {c_factor:.4f} \\cdot {u_n_kv:.4f}}}"
                f"{{|Z_k|}} = "
                f"\\frac{{{sqrt3:.4f} \\cdot {c_factor * u_n_kv:.4f}}}"
                f"{{{z_abs:.4f}}} = "
                f"{ikss_ka:.4f}\\,\\text{{kA}}"
            )
        else:
            substitution = (
                f"I_k'' = \\frac{{{c_factor:.4f} \\cdot {u_n_kv:.4f}}}"
                f"{{|Z_k|}} = "
                f"\\frac{{{c_factor * u_n_kv:.4f}}}"
                f"{{{z_abs:.4f}}} = "
                f"{ikss_ka:.4f}\\,\\text{{kA}}"
            )

        result = ProofValue.create("I_k''", ikss_ka, "kA", "ikss_ka")
        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"c": "—", "U_n": "kV", "Z_k": "Ω"},
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC1", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "c": "c_factor",
                "U_n": "u_n_kv",
                "Z_k": "z_equiv_ohm",
                "I_k''": "ikss_ka",
            },
        )

    @classmethod
    def _create_sc1_step_kappa(
        cls,
        *,
        step_number: int,
        r_equiv: float,
        x_equiv: float,
        kappa: float,
    ) -> ProofStep:
        """Step: κ (impact coefficient)."""
        equation = EQ_SC1_009
        rx_ratio = r_equiv / x_equiv if x_equiv != 0 else 0.0
        exp_term = math.exp(-3 * rx_ratio)

        input_values = (
            ProofValue.create("R_k", r_equiv, "Ω", "r_equiv_ohm"),
            ProofValue.create("X_k", x_equiv, "Ω", "x_equiv_ohm"),
        )

        substitution = (
            f"\\kappa = 1.02 + 0.98 \\cdot e^{{-3 \\cdot {rx_ratio:.4f}}} = "
            f"1.02 + 0.98 \\cdot {exp_term:.4f} = {kappa:.4f}"
        )

        result = ProofValue.create("\\kappa", kappa, "—", "kappa")
        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"R_k": "Ω", "X_k": "Ω"},
            "—",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC1", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "R_k": "r_equiv_ohm",
                "X_k": "x_equiv_ohm",
                "κ": "kappa",
            },
        )

    @classmethod
    def _create_sc1_step_ip(
        cls,
        *,
        step_number: int,
        kappa: float,
        ikss_ka: float,
        ip_ka: float,
    ) -> ProofStep:
        """Step: ip (peak impulse current)."""
        equation = EQ_SC1_010
        sqrt2 = math.sqrt(2.0)

        input_values = (
            ProofValue.create("\\kappa", kappa, "—", "kappa"),
            ProofValue.create("I_k''", ikss_ka, "kA", "ikss_ka"),
        )

        substitution = (
            f"i_p = {kappa:.4f} \\cdot \\sqrt{{2}} \\cdot {ikss_ka:.4f} = "
            f"{kappa:.4f} \\cdot {sqrt2:.4f} \\cdot {ikss_ka:.4f} = "
            f"{ip_ka:.4f}\\,\\text{{kA}}"
        )

        result = ProofValue.create("i_p", ip_ka, "kA", "ip_ka")
        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"κ": "—", "I_k''": "kA"},
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC1", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"κ": "kappa", "I_k''": "ikss_ka", "i_p": "ip_ka"},
        )

    @classmethod
    def _create_sc1_step_idyn(
        cls,
        *,
        step_number: int,
        ip_ka: float,
        idyn_ka: float,
    ) -> ProofStep:
        """Step: I_dyn (dynamic current — MANDATORY)."""
        equation = EQ_SC1_012

        input_values = (ProofValue.create("i_p", ip_ka, "kA", "ip_ka"),)

        substitution = f"I_{{dyn}} = i_p = {idyn_ka:.4f}\\,\\text{{kA}}"

        result = ProofValue.create("I_{dyn}", idyn_ka, "kA", "idyn_ka")
        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"i_p": "kA"},
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC1", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"i_p": "ip_ka", "I_dyn": "idyn_ka"},
        )

    @classmethod
    def _create_sc1_step_ith(
        cls,
        *,
        step_number: int,
        ikss_ka: float,
        m_factor: float,
        n_factor: float,
        ith_ka: float,
    ) -> ProofStep:
        """Step: I_th (thermal equivalent current — MANDATORY)."""
        equation = EQ_SC1_011
        sqrt_mn = math.sqrt(m_factor + n_factor)

        input_values = (
            ProofValue.create("I_k''", ikss_ka, "kA", "ikss_ka"),
            ProofValue.create("m", m_factor, "—", "m_factor"),
            ProofValue.create("n", n_factor, "—", "n_factor"),
        )

        substitution = (
            f"I_{{th}} = {ikss_ka:.4f} \\cdot \\sqrt{{{m_factor:.4f} + {n_factor:.4f}}} = "
            f"{ikss_ka:.4f} \\cdot {sqrt_mn:.4f} = {ith_ka:.4f}\\,\\text{{kA}}"
        )

        result = ProofValue.create("I_{th}", ith_ka, "kA", "ith_ka")
        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"I_k''": "kA", "m": "—", "n": "—"},
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC1", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "I_k''": "ikss_ka",
                "m": "m_factor",
                "n": "n_factor",
                "I_th": "ith_ka",
            },
        )

    # =========================================================================
    # SC3F Step Builders
    # =========================================================================

    @staticmethod
    def _format_complex_latex(value: complex, unit: str) -> str:
        real = value.real
        imag = value.imag
        sign = "+" if imag >= 0 else "-"
        return f"{real:.4f} {sign} j{abs(imag):.4f}\\,\\text{{{unit}}}"

    @classmethod
    def _create_sc1_step_z_sequence(
        cls,
        *,
        step_number: int,
        z1: complex,
        z2: complex,
        z0: complex,
    ) -> ProofStep:
        equation = EQ_SC1_001
        input_values = (
            ProofValue.create("Z_1", z1, "Ω", "z1_ohm"),
            ProofValue.create("Z_2", z2, "Ω", "z2_ohm"),
            ProofValue.create("Z_0", z0, "Ω", "z0_ohm"),
        )

        substitution = (
            f"Z_1 = {cls._format_complex_latex(z1, 'Ω')}, \\quad "
            f"Z_2 = {cls._format_complex_latex(z2, 'Ω')}, \\quad "
            f"Z_0 = {cls._format_complex_latex(z0, 'Ω')}"
        )

        result = ProofValue.create("Z_1", z1, "Ω", "z1_ohm")
        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("Z_1", "Ω"), ("Z_2", "Ω"), ("Z_0", "Ω")],
            "Ω",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC1", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "Z_1": "z1_ohm",
                "Z_2": "z2_ohm",
                "Z_0": "z0_ohm",
            },
        )

    @classmethod
    def _create_sc1_step_a_operator(
        cls,
        *,
        step_number: int,
        a_operator: complex,
    ) -> ProofStep:
        equation = EQ_SC1_002
        input_values: tuple[ProofValue, ...] = ()
        substitution = r"a = e^{j 120^\circ} = " f"{cls._format_complex_latex(a_operator, '—')}"
        result = ProofValue.create("a", a_operator, "—", "a_operator")
        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [],
            "—",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC1", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"a": "a_operator"},
        )

    @classmethod
    def _create_sc1_step_equiv_impedance(
        cls,
        *,
        step_number: int,
        equation_id: str,
        z1: complex,
        z2: complex,
        z0: complex,
        z_equiv: complex,
    ) -> ProofStep:
        equation = EquationRegistry.get_equation(equation_id)
        if equation is None:
            raise ValueError(f"Missing equation definition for {equation_id}")

        input_values: tuple[ProofValue, ...]
        if equation_id == "EQ_SC1_003":
            substitution = (
                f"Z_k = {cls._format_complex_latex(z1, 'Ω')} + "
                f"{cls._format_complex_latex(z2, 'Ω')} + "
                f"{cls._format_complex_latex(z0, 'Ω')} = "
                f"{cls._format_complex_latex(z_equiv, 'Ω')}"
            )
            input_symbols = [("Z_1", "Ω"), ("Z_2", "Ω"), ("Z_0", "Ω")]
            input_values = (
                ProofValue.create("Z_1", z1, "Ω", "z1_ohm"),
                ProofValue.create("Z_2", z2, "Ω", "z2_ohm"),
                ProofValue.create("Z_0", z0, "Ω", "z0_ohm"),
            )
            source_keys = {
                "Z_k": "z_equiv_ohm",
                "Z_1": "z1_ohm",
                "Z_2": "z2_ohm",
                "Z_0": "z0_ohm",
            }
        elif equation_id == "EQ_SC1_004":
            substitution = (
                f"Z_k = {cls._format_complex_latex(z1, 'Ω')} + "
                f"{cls._format_complex_latex(z2, 'Ω')} = "
                f"{cls._format_complex_latex(z_equiv, 'Ω')}"
            )
            input_symbols = [("Z_1", "Ω"), ("Z_2", "Ω")]
            input_values = (
                ProofValue.create("Z_1", z1, "Ω", "z1_ohm"),
                ProofValue.create("Z_2", z2, "Ω", "z2_ohm"),
            )
            source_keys = {
                "Z_k": "z_equiv_ohm",
                "Z_1": "z1_ohm",
                "Z_2": "z2_ohm",
            }
        else:
            denominator = z2 + z0
            substitution = (
                f"Z_k = {cls._format_complex_latex(z1, 'Ω')} + "
                f"({cls._format_complex_latex(z2, 'Ω')} \\cdot "
                f"{cls._format_complex_latex(z0, 'Ω')}) / "
                f"{cls._format_complex_latex(denominator, 'Ω')} = "
                f"{cls._format_complex_latex(z_equiv, 'Ω')}"
            )
            input_symbols = [("Z_1", "Ω"), ("Z_2", "Ω"), ("Z_0", "Ω")]
            input_values = (
                ProofValue.create("Z_1", z1, "Ω", "z1_ohm"),
                ProofValue.create("Z_2", z2, "Ω", "z2_ohm"),
                ProofValue.create("Z_0", z0, "Ω", "z0_ohm"),
            )
            source_keys = {
                "Z_k": "z_equiv_ohm",
                "Z_1": "z1_ohm",
                "Z_2": "z2_ohm",
                "Z_0": "z0_ohm",
            }
        result = ProofValue.create("Z_k", z_equiv, "Ω", "z_equiv_ohm")
        unit_check = UnitVerifier.verify_step(
            equation_id,
            input_symbols,
            "Ω",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC1", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys=source_keys,
        )

    @classmethod
    def _create_sc1_step_sequence_currents(
        cls,
        *,
        step_number: int,
        fault_type: str,
        u_prefault_kv: float,
        z_equiv: complex,
        z2: complex,
        z0: complex,
        i1: complex,
        i2: complex,
        i0: complex,
    ) -> ProofStep:
        equation = EQ_SC1_006
        input_values = (
            ProofValue.create("U_f", u_prefault_kv, "kV", "u_prefault_kv"),
            ProofValue.create("Z_k", z_equiv, "Ω", "z_equiv_ohm"),
            ProofValue.create("Z_2", z2, "Ω", "z2_ohm"),
            ProofValue.create("Z_0", z0, "Ω", "z0_ohm"),
        )

        if fault_type == "SC1FZ":
            substitution = (
                f"I_1 = I_2 = I_0 = {u_prefault_kv:.4f} / "
                f"{cls._format_complex_latex(z_equiv, 'Ω')} = "
                f"{cls._format_complex_latex(i1, 'kA')}"
            )
        elif fault_type == "SC2F":
            substitution = (
                f"I_1 = {u_prefault_kv:.4f} / {cls._format_complex_latex(z_equiv, 'Ω')} = "
                f"{cls._format_complex_latex(i1, 'kA')}, \\quad "
                f"I_2 = -I_1 = {cls._format_complex_latex(i2, 'kA')}, \\quad "
                r"I_0 = 0"
            )
        else:
            denominator = z2 + z0
            substitution = (
                f"I_1 = {u_prefault_kv:.4f} / {cls._format_complex_latex(z_equiv, 'Ω')} = "
                f"{cls._format_complex_latex(i1, 'kA')}, \\quad "
                f"I_2 = -\\frac{{Z_0}}{{Z_2 + Z_0}} I_1 = "
                f"{cls._format_complex_latex(i2, 'kA')}, \\quad "
                f"I_0 = -\\frac{{Z_2}}{{Z_2 + Z_0}} I_1 = "
                f"{cls._format_complex_latex(i0, 'kA')}, \\quad "
                f"Z_2 + Z_0 = {cls._format_complex_latex(denominator, 'Ω')}"
            )

        result = ProofValue.create("I_1", i1, "kA", "i1_ka")
        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("U_f", "kV"), ("Z_k", "Ω")],
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC1", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "U_f": "u_prefault_kv",
                "Z_k": "z_equiv_ohm",
                "Z_2": "z2_ohm",
                "Z_0": "z0_ohm",
                "I_1": "i1_ka",
                "I_2": "i2_ka",
                "I_0": "i0_ka",
            },
        )

    @classmethod
    def _create_sc1_step_phase_currents(
        cls,
        *,
        step_number: int,
        a_operator: complex,
        i0: complex,
        i1: complex,
        i2: complex,
        ia: complex,
        ib: complex,
        ic: complex,
    ) -> ProofStep:
        equation = EQ_SC1_007
        input_values = (
            ProofValue.create("I_0", i0, "kA", "i0_ka"),
            ProofValue.create("I_1", i1, "kA", "i1_ka"),
            ProofValue.create("I_2", i2, "kA", "i2_ka"),
            ProofValue.create("a", a_operator, "—", "a_operator"),
        )

        substitution = (
            f"I_a = I_0 + I_1 + I_2 = {cls._format_complex_latex(ia, 'kA')}, \\quad "
            f"I_b = I_0 + a^2 I_1 + a I_2 = {cls._format_complex_latex(ib, 'kA')}, \\quad "
            f"I_c = I_0 + a I_1 + a^2 I_2 = {cls._format_complex_latex(ic, 'kA')}"
        )

        result = ProofValue.create("I_a", ia, "kA", "ia_ka")
        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("I_0", "kA"), ("I_1", "kA"), ("I_2", "kA")],
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC1", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "I_0": "i0_ka",
                "I_1": "i1_ka",
                "I_2": "i2_ka",
                "I_a": "ia_ka",
                "I_b": "ib_ka",
                "I_c": "ic_ka",
                "a": "a_operator",
            },
        )

    @classmethod
    def _create_sc3f_step_z_th(
        cls,
        step_number: int,
        z_thevenin_ohm: complex,
        r_th: float,
        x_th: float,
    ) -> ProofStep:
        """Krok 1: Impedancja Thevenina (z solvera)."""
        equation = EQ_SC3F_003

        z_abs = abs(z_thevenin_ohm)

        input_values = (ProofValue.create("Z_{th}", z_thevenin_ohm, "Ω", "z_thevenin_ohm"),)

        substitution = (
            f"Z_{{th}} = {r_th:.4f} + j{x_th:.4f}\\,\\Omega, "
            f"\\quad |Z_{{th}}| = {z_abs:.4f}\\,\\Omega"
        )

        result = ProofValue.create("|Z_{th}|", z_abs, "Ω", "z_thevenin_abs_ohm")

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="Ω",
            computed_unit="Ω",
            input_units={"Z_th": "Ω"},
            derivation="Ω = Ω ✓",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC3F", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"Z_th": "z_thevenin_ohm"},
        )

    @classmethod
    def _create_sc3f_step_ikss(
        cls,
        step_number: int,
        c_factor: float,
        u_n_kv: float,
        z_th_abs: float,
        ikss_ka: float,
    ) -> ProofStep:
        """Krok 2: Początkowy prąd zwarciowy I_k'' (c TUTAJ — jedyne miejsce)."""
        equation = EQ_SC3F_004

        sqrt3 = math.sqrt(3)

        input_values = (
            ProofValue.create("c", c_factor, "—", "c_factor"),
            ProofValue.create("U_n", u_n_kv, "kV", "u_n_kv"),
            ProofValue.create("|Z_{th}|", z_th_abs, "Ω", "z_thevenin_abs_ohm"),
        )

        substitution = (
            f"I_k'' = \\frac{{{c_factor:.4f} \\cdot {u_n_kv:.4f}}}"
            f"{{\\sqrt{{3}} \\cdot {z_th_abs:.4f}}} = "
            f"\\frac{{{c_factor * u_n_kv:.4f}}}{{{sqrt3:.4f} \\cdot {z_th_abs:.4f}}} = "
            f"{ikss_ka:.4f}\\,\\text{{kA}}"
        )

        result = ProofValue.create("I_k''", ikss_ka, "kA", "ikss_ka")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"c": "—", "U_n": "kV", "Z_th": "Ω"},
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC3F", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "c": "c_factor",
                "U_n": "u_n_kv",
                "Z_th": "z_thevenin_ohm",
                "I_k''": "ikss_ka",
            },
        )

    # --- Maszyny wirujące: zanik prądu wyłączeniowego μ / q / i_b (§6.6) ----------
    @staticmethod
    def _mu_curve_coeffs(t_min_s: float) -> tuple[float, float, float]:
        """(a, b, c) dla μ = a + b·e^(−c·I″k/I_r), wg t_min (IEC 60909 §6.6.1)."""
        if t_min_s <= 0.035:
            return (0.84, 0.26, 0.26)
        if t_min_s <= 0.075:
            return (0.71, 0.51, 0.30)
        if t_min_s <= 0.175:
            return (0.62, 0.72, 0.32)
        return (0.56, 0.94, 0.38)

    @staticmethod
    def _q_curve_coeffs(t_min_s: float) -> tuple[float, float]:
        """(a, b) dla q = a + b·ln(m), wg t_min (IEC 60909 §6.6.3)."""
        if t_min_s <= 0.035:
            return (1.03, 0.12)
        if t_min_s <= 0.075:
            return (0.79, 0.12)
        if t_min_s <= 0.175:
            return (0.57, 0.12)
        return (0.26, 0.10)

    @classmethod
    def _create_sc3f_step_machine_mu(
        cls,
        step_number: int,
        machine: MachinePartialContribution,
        t_min_s: float,
    ) -> ProofStep:
        """Krok maszynowy: współczynnik zanikania μ (§6.6.1)."""
        equation = EQ_SC3F_011
        ratio = machine.ratio_ik_ir
        ikss_p = machine.ikss_partial_a / 1000.0
        ir = machine.ir_a / 1000.0
        if ratio <= 2.0:
            substitution = (
                f"\\mu = 1 \\quad (I_k''/I_r = {ratio:.3f} \\leq 2,\\ "
                f"\\text{{z dala od generatora}})"
            )
        else:
            a, b, c = cls._mu_curve_coeffs(t_min_s)
            raw = a + b * math.exp(-c * ratio)
            substitution = f"\\mu = {a} + {b} \\cdot e^{{-{c} \\cdot {ratio:.3f}}} = {raw:.4f}"
            if abs(raw - machine.mu) > 5e-4:
                substitution += f" \\rightarrow {machine.mu:.4f}\\ (0 \\leq \\mu \\leq 1)"
        return ProofStep(
            step_id=ProofStep.generate_step_id("SC3F", step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} — {machine.source_name}",
            equation=equation,
            input_values=(
                ProofValue.create("I_k''", ikss_p, "kA", "ikss_partial_ka"),
                ProofValue.create("I_r", ir, "kA", "ir_ka"),
            ),
            substitution_latex=substitution,
            result=ProofValue.create("\\mu", machine.mu, "—", "mu_factor"),
            unit_check=UnitVerifier.verify_equation(
                equation.equation_id, {"I_k''": "kA", "I_r": "kA"}, "—"
            ),
            source_keys={"I_k''": "ikss_partial_ka", "I_r": "ir_ka", "μ": "mu_factor"},
        )

    @classmethod
    def _create_sc3f_step_machine_q(
        cls,
        step_number: int,
        machine: MachinePartialContribution,
        t_min_s: float,
    ) -> ProofStep:
        """Krok maszynowy: dodatkowy współczynnik zanikania q dla maszyny asynchronicznej (§6.6.3)."""
        equation = EQ_SC3F_012
        m_val = machine.p_per_pole_mw
        if m_val <= 0.0:
            substitution = "q = 1 \\quad (m \\leq 0)"
        else:
            a, b = cls._q_curve_coeffs(t_min_s)
            raw = a + b * math.log(m_val)
            substitution = f"q = {a} + {b} \\cdot \\ln({m_val:.4f}) = {raw:.4f}"
            if abs(raw - machine.q) > 5e-4:
                substitution += f" \\rightarrow {machine.q:.4f}\\ (q \\leq 1)"
        return ProofStep(
            step_id=ProofStep.generate_step_id("SC3F", step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} — {machine.source_name}",
            equation=equation,
            input_values=(ProofValue.create("m", m_val, "MW", "p_per_pole_mw"),),
            substitution_latex=substitution,
            result=ProofValue.create("q", machine.q, "—", "q_factor"),
            unit_check=UnitVerifier.verify_equation(equation.equation_id, {"m": "MW"}, "—"),
            source_keys={"m": "p_per_pole_mw", "q": "q_factor"},
        )

    @classmethod
    def _create_sc3f_step_machine_ib(
        cls,
        step_number: int,
        machine: MachinePartialContribution,
    ) -> ProofStep:
        """Krok maszynowy: prąd wyłączeniowy symetryczny i_b = μ·q·I″k (§6.6)."""
        equation = EQ_SC3F_013
        ikss_p = machine.ikss_partial_a / 1000.0
        ib = machine.ib_a / 1000.0
        substitution = (
            f"i_b = {machine.mu:.4f} \\cdot {machine.q:.4f} \\cdot {ikss_p:.4f} = "
            f"{ib:.4f}\\,\\text{{kA}}"
        )
        return ProofStep(
            step_id=ProofStep.generate_step_id("SC3F", step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} — {machine.source_name}",
            equation=equation,
            input_values=(
                ProofValue.create("\\mu", machine.mu, "—", "mu_factor"),
                ProofValue.create("q", machine.q, "—", "q_factor"),
                ProofValue.create("I_k''", ikss_p, "kA", "ikss_partial_ka"),
            ),
            substitution_latex=substitution,
            result=ProofValue.create("i_{b}", ib, "kA", "ib_partial_ka"),
            unit_check=UnitVerifier.verify_equation(
                equation.equation_id, {"μ": "—", "q": "—", "I_k''": "kA"}, "kA"
            ),
            source_keys={
                "μ": "mu_factor",
                "q": "q_factor",
                "I_k''": "ikss_partial_ka",
                "i_b": "ib_partial_ka",
            },
        )

    @classmethod
    def _create_sc3f_step_kappa(
        cls,
        step_number: int,
        r_th: float,
        x_th: float,
        kappa: float,
    ) -> ProofStep:
        """Krok 3: Współczynnik udaru κ."""
        equation = EQ_SC3F_005

        rx_ratio = r_th / x_th if x_th != 0 else 0
        exp_term = math.exp(-3 * rx_ratio)

        input_values = (
            ProofValue.create("R_{th}", r_th, "Ω", "r_thevenin_ohm"),
            ProofValue.create("X_{th}", x_th, "Ω", "x_thevenin_ohm"),
        )

        substitution = (
            f"\\kappa = 1.02 + 0.98 \\cdot e^{{-3 \\cdot {rx_ratio:.4f}}} = "
            f"1.02 + 0.98 \\cdot {exp_term:.4f} = {kappa:.4f}"
        )

        result = ProofValue.create("\\kappa", kappa, "—", "kappa")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"R_th": "Ω", "X_th": "Ω"},
            "—",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC3F", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "R_th": "r_thevenin_ohm",
                "X_th": "x_thevenin_ohm",
                "κ": "kappa",
            },
        )

    @classmethod
    def _create_sc3f_step_ip(
        cls,
        step_number: int,
        kappa: float,
        ikss_ka: float,
        ip_ka: float,
    ) -> ProofStep:
        """Krok 4: Prąd udarowy i_p."""
        equation = EQ_SC3F_006

        sqrt2 = math.sqrt(2)

        input_values = (
            ProofValue.create("\\kappa", kappa, "—", "kappa"),
            ProofValue.create("I_k''", ikss_ka, "kA", "ikss_ka"),
        )

        substitution = (
            f"i_p = {kappa:.4f} \\cdot \\sqrt{{2}} \\cdot {ikss_ka:.4f} = "
            f"{kappa:.4f} \\cdot {sqrt2:.4f} \\cdot {ikss_ka:.4f} = "
            f"{ip_ka:.4f}\\,\\text{{kA}}"
        )

        result = ProofValue.create("i_p", ip_ka, "kA", "ip_ka")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"κ": "—", "I_k''": "kA"},
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC3F", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"κ": "kappa", "I_k''": "ikss_ka", "i_p": "ip_ka"},
        )

    @classmethod
    def _create_sc3f_step_idyn(
        cls,
        step_number: int,
        ip_ka: float,
        idyn_ka: float,
    ) -> ProofStep:
        """Krok 5: Prąd dynamiczny I_dyn (OBOWIĄZKOWY)."""
        equation = EQ_SC3F_008a

        input_values = (ProofValue.create("i_p", ip_ka, "kA", "ip_ka"),)

        substitution = f"I_{{dyn}} = i_p = {idyn_ka:.4f}\\,\\text{{kA}}"

        result = ProofValue.create("I_{dyn}", idyn_ka, "kA", "idyn_ka")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"i_p": "kA"},
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC3F", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"i_p": "ip_ka", "I_dyn": "idyn_ka"},
        )

    @classmethod
    def _create_sc3f_step_ith(
        cls,
        step_number: int,
        ikss_ka: float,
        m_factor: float,
        n_factor: float,
        ith_ka: float,
    ) -> ProofStep:
        """Krok 6: Prąd cieplny I_th (OBOWIĄZKOWY)."""
        equation = EQ_SC3F_008

        sqrt_mn = math.sqrt(m_factor + n_factor)

        input_values = (
            ProofValue.create("I_k''", ikss_ka, "kA", "ikss_ka"),
            ProofValue.create("m", m_factor, "—", "m_factor"),
            ProofValue.create("n", n_factor, "—", "n_factor"),
        )

        substitution = (
            f"I_{{th}} = {ikss_ka:.4f} \\cdot \\sqrt{{{m_factor:.4f} + {n_factor:.4f}}} = "
            f"{ikss_ka:.4f} \\cdot {sqrt_mn:.4f} = {ith_ka:.4f}\\,\\text{{kA}}"
        )

        result = ProofValue.create("I_{th}", ith_ka, "kA", "ith_ka")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"I_k''": "kA", "m": "—", "n": "—"},
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC3F", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "I_k''": "ikss_ka",
                "m": "m_factor",
                "n": "n_factor",
                "I_th": "ith_ka",
            },
        )

    @classmethod
    def _create_sc3f_step_sk(
        cls,
        step_number: int,
        u_n_kv: float,
        ikss_ka: float,
        sk_mva: float,
    ) -> ProofStep:
        """Krok 7: Moc zwarciowa S_k''."""
        equation = EQ_SC3F_007

        sqrt3 = math.sqrt(3)

        input_values = (
            ProofValue.create("U_n", u_n_kv, "kV", "u_n_kv"),
            ProofValue.create("I_k''", ikss_ka, "kA", "ikss_ka"),
        )

        substitution = (
            f"S_k'' = \\sqrt{{3}} \\cdot {u_n_kv:.4f} \\cdot {ikss_ka:.4f} = "
            f"{sqrt3:.4f} \\cdot {u_n_kv:.4f} \\cdot {ikss_ka:.4f} = "
            f"{sk_mva:.4f}\\,\\text{{MVA}}"
        )

        result = ProofValue.create("S_k''", sk_mva, "MVA", "sk_mva")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"U_n": "kV", "I_k''": "kA"},
            "MVA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("SC3F", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"U_n": "u_n_kv", "I_k''": "ikss_ka", "S_k''": "sk_mva"},
        )

    # =========================================================================
    # VDROP Generator
    # =========================================================================

    @classmethod
    def generate_vdrop_proof(
        cls,
        data: VDROPInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód VDROP (spadki napięć).

        Kroki obowiązkowe (BINDING):
        1. Rezystancja odcinka R
        2. Reaktancja odcinka X
        3. Składowa czynna ΔU_R
        4. Składowa bierna ΔU_X
        5. Spadek na odcinku ΔU
        6. Suma spadków ΔU_total
        7. Napięcie w punkcie U

        Args:
            data: Dane wejściowe VDROPInput
            artifact_id: Opcjonalny ID artefaktu

        Returns:
            ProofDocument z pełnym dowodem
        """
        if artifact_id is None:
            artifact_id = uuid4()

        if not data.segments:
            raise ValueError("VDROP proof requires at least one segment.")
        if len(data.segments) != 1:
            raise ValueError("VDROP MVP requires exactly one segment.")

        segment = data.segments[0]

        r_ohm = segment.r_ohm_per_km * segment.length_km
        x_ohm = segment.x_ohm_per_km * segment.length_km
        delta_u_r = (r_ohm * segment.p_mw) / (segment.u_n_kv**2) * 100
        delta_u_x = (x_ohm * segment.q_mvar) / (segment.u_n_kv**2) * 100
        delta_u = delta_u_r + delta_u_x
        segment_drops = [delta_u]
        delta_u_total = sum(segment_drops)
        u_kv = data.u_source_kv * (1 - delta_u_total / 100)

        step_builders = {
            "EQ_VDROP_001": lambda step_number: cls._create_vdrop_step_r(
                step_number,
                segment.r_ohm_per_km,
                segment.length_km,
                r_ohm,
                segment.segment_id,
            ),
            "EQ_VDROP_002": lambda step_number: cls._create_vdrop_step_x(
                step_number,
                segment.x_ohm_per_km,
                segment.length_km,
                x_ohm,
                segment.segment_id,
            ),
            "EQ_VDROP_003": lambda step_number: cls._create_vdrop_step_du_r(
                step_number,
                r_ohm,
                segment.p_mw,
                segment.u_n_kv,
                delta_u_r,
                segment.segment_id,
            ),
            "EQ_VDROP_004": lambda step_number: cls._create_vdrop_step_du_x(
                step_number,
                x_ohm,
                segment.q_mvar,
                segment.u_n_kv,
                delta_u_x,
                segment.segment_id,
            ),
            "EQ_VDROP_005": lambda step_number: cls._create_vdrop_step_du(
                step_number,
                delta_u_r,
                delta_u_x,
                delta_u,
                segment.segment_id,
            ),
            "EQ_VDROP_006": lambda step_number: cls._create_vdrop_step_total(
                step_number,
                segment_drops,
                delta_u_total,
            ),
            "EQ_VDROP_007": lambda step_number: cls._create_vdrop_step_u(
                step_number,
                data.u_source_kv,
                delta_u_total,
                u_kv,
            ),
        }

        steps: list[ProofStep] = []
        for step_number, equation_id in enumerate(EquationRegistry.VDROP_STEP_ORDER, start=1):
            steps.append(step_builders[equation_id](step_number))

        # Podsumowanie
        unit_checks_passed = all(s.unit_check.passed for s in steps)

        key_results = {
            "delta_u_total_percent": ProofValue.create(
                "\\Delta U_{total}", delta_u_total, "%", "delta_u_total_percent"
            ),
            "u_kv": ProofValue.create("U", u_kv, "kV", "u_kv"),
        }

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=(),
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
            source_bus=data.source_bus_id,
            target_bus=data.target_bus_id,
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.VDROP,
            title_pl="Dowód obliczeń spadków napięć",
            header=header,
            steps=steps,
            summary=summary,
        )

    # =========================================================================
    # VDROP Step Builders
    # =========================================================================

    @classmethod
    def _create_vdrop_step_r(
        cls,
        step_number: int,
        r_per_km: float,
        length_km: float,
        r_ohm: float,
        segment_id: str,
    ) -> ProofStep:
        """Rezystancja odcinka R."""
        equation = EQ_VDROP_001

        input_values = (
            ProofValue.create("r", r_per_km, "Ω/km", "r_ohm_per_km"),
            ProofValue.create("l", length_km, "km", "length_km"),
        )

        substitution = f"R = {r_per_km:.4f} \\cdot {length_km:.4f} = {r_ohm:.4f}\\,\\Omega"

        result = ProofValue.create("R", r_ohm, "Ω", "r_ohm")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"r": "Ω/km", "l": "km"},
            "Ω",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("VDROP", step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (odcinek {segment_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"r": "r_ohm_per_km", "l": "length_km", "R": "r_ohm"},
        )

    @classmethod
    def _create_vdrop_step_x(
        cls,
        step_number: int,
        x_per_km: float,
        length_km: float,
        x_ohm: float,
        segment_id: str,
    ) -> ProofStep:
        """Reaktancja odcinka X."""
        equation = EQ_VDROP_002

        input_values = (
            ProofValue.create("x", x_per_km, "Ω/km", "x_ohm_per_km"),
            ProofValue.create("l", length_km, "km", "length_km"),
        )

        substitution = f"X = {x_per_km:.4f} \\cdot {length_km:.4f} = {x_ohm:.4f}\\,\\Omega"

        result = ProofValue.create("X", x_ohm, "Ω", "x_ohm")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"x": "Ω/km", "l": "km"},
            "Ω",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("VDROP", step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (odcinek {segment_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"x": "x_ohm_per_km", "l": "length_km", "X": "x_ohm"},
        )

    @classmethod
    def _create_vdrop_step_du_r(
        cls,
        step_number: int,
        r_ohm: float,
        p_mw: float,
        u_n_kv: float,
        delta_u_r: float,
        segment_id: str,
    ) -> ProofStep:
        """Składowa czynna spadku ΔU_R."""
        equation = EQ_VDROP_003

        input_values = (
            ProofValue.create("R", r_ohm, "Ω", "r_ohm"),
            ProofValue.create("P", p_mw, "MW", "p_mw"),
            ProofValue.create("U_n", u_n_kv, "kV", "u_n_kv"),
        )

        substitution = (
            f"\\Delta U_R = \\frac{{{r_ohm:.4f} \\cdot {p_mw:.4f}}}"
            f"{{{u_n_kv:.4f}^2}} \\cdot 100\\% = {delta_u_r:.4f}\\%"
        )

        result = ProofValue.create("\\Delta U_R", delta_u_r, "%", "delta_u_r_percent")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"R": "Ω", "P": "MW", "U_n": "kV"},
            "%",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("VDROP", step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (odcinek {segment_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "R": "r_ohm",
                "P": "p_mw",
                "U_n": "u_n_kv",
                "ΔU_R": "delta_u_r_percent",
            },
        )

    @classmethod
    def _create_vdrop_step_du_x(
        cls,
        step_number: int,
        x_ohm: float,
        q_mvar: float,
        u_n_kv: float,
        delta_u_x: float,
        segment_id: str,
    ) -> ProofStep:
        """Składowa bierna spadku ΔU_X."""
        equation = EQ_VDROP_004

        input_values = (
            ProofValue.create("X", x_ohm, "Ω", "x_ohm"),
            ProofValue.create("Q", q_mvar, "Mvar", "q_mvar"),
            ProofValue.create("U_n", u_n_kv, "kV", "u_n_kv"),
        )

        substitution = (
            f"\\Delta U_X = \\frac{{{x_ohm:.4f} \\cdot {q_mvar:.4f}}}"
            f"{{{u_n_kv:.4f}^2}} \\cdot 100\\% = {delta_u_x:.4f}\\%"
        )

        result = ProofValue.create("\\Delta U_X", delta_u_x, "%", "delta_u_x_percent")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"X": "Ω", "Q": "Mvar", "U_n": "kV"},
            "%",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("VDROP", step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (odcinek {segment_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "X": "x_ohm",
                "Q": "q_mvar",
                "U_n": "u_n_kv",
                "ΔU_X": "delta_u_x_percent",
            },
        )

    @classmethod
    def _create_vdrop_step_du(
        cls,
        step_number: int,
        delta_u_r: float,
        delta_u_x: float,
        delta_u: float,
        segment_id: str,
    ) -> ProofStep:
        """Spadek na odcinku ΔU."""
        equation = EQ_VDROP_005

        input_values = (
            ProofValue.create("\\Delta U_R", delta_u_r, "%", "delta_u_r_percent"),
            ProofValue.create("\\Delta U_X", delta_u_x, "%", "delta_u_x_percent"),
        )

        substitution = f"\\Delta U = {delta_u_r:.4f} + {delta_u_x:.4f} = {delta_u:.4f}\\%"

        result = ProofValue.create("\\Delta U", delta_u, "%", "delta_u_percent")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"ΔU_R": "%", "ΔU_X": "%"},
            "%",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("VDROP", step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (odcinek {segment_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "ΔU_R": "delta_u_r_percent",
                "ΔU_X": "delta_u_x_percent",
                "ΔU": "delta_u_percent",
            },
        )

    @classmethod
    def _create_vdrop_step_total(
        cls,
        step_number: int,
        segment_drops: list[float],
        delta_u_total: float,
    ) -> ProofStep:
        """Suma spadków ΔU_total."""
        equation = EQ_VDROP_006

        input_values = tuple(
            ProofValue.create("\\Delta U_i", drop, "%", "delta_u_segments")
            for i, drop in enumerate(segment_drops)
        )

        drops_str = " + ".join(f"{d:.4f}" for d in segment_drops)
        substitution = f"\\Delta U_{{total}} = {drops_str} = {delta_u_total:.4f}\\%"

        result = ProofValue.create("\\Delta U_{total}", delta_u_total, "%", "delta_u_total_percent")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"ΔU_i": "%"},
            "%",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("VDROP", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "ΔU_i": "delta_u_segments",
                "ΔU_total": "delta_u_total_percent",
            },
        )

    @classmethod
    def _create_vdrop_step_u(
        cls,
        step_number: int,
        u_source_kv: float,
        delta_u_total: float,
        u_kv: float,
    ) -> ProofStep:
        """Napięcie w punkcie po uwzględnieniu spadku."""
        equation = EQ_VDROP_007

        input_values = (
            ProofValue.create("U_{source}", u_source_kv, "kV", "u_source_kv"),
            ProofValue.create("\\Delta U_{total}", delta_u_total, "%", "delta_u_total_percent"),
        )

        substitution = (
            f"U = {u_source_kv:.4f} \\cdot \\left(1 - \\frac{{{delta_u_total:.4f}}}{{100}}\\right) = "
            f"{u_kv:.4f}\\,\\text{{kV}}"
        )

        result = ProofValue.create("U", u_kv, "kV", "u_kv")

        unit_check = UnitVerifier.verify_equation(
            equation.equation_id,
            {"U_{source}": "kV", "ΔU_{total}": "%"},
            "kV",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("VDROP", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "U_{source}": "u_source_kv",
                "ΔU_{total}": "delta_u_total_percent",
                "U": "u_kv",
            },
        )

    # =========================================================================
    # Q(U) Generator — P11.1b
    # =========================================================================

    @classmethod
    def generate_qu_proof(
        cls,
        data: QUInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód Q(U) (regulacja mocy biernej).

        Kroki obowiązkowe (BINDING):
        1. Odchylenie napięcia ΔU = U_meas - U_ref
        2. Funkcja martwej strefy s(U)
        3. Surowa moc bierna Q_raw = k_Q · s(U)
        4. Końcowa moc bierna Q_cmd z limitami

        Args:
            data: Dane wejściowe QUInput
            artifact_id: Opcjonalny ID artefaktu

        Returns:
            ProofDocument z pełnym dowodem
        """
        if artifact_id is None:
            artifact_id = uuid4()

        # Obliczenia
        delta_u_kv = data.u_meas_kv - data.u_ref_kv

        # Deadband: określenie gałęzi
        if delta_u_kv > data.u_dead_kv:
            s_u_kv = delta_u_kv - data.u_dead_kv
            deadband_branch = "above"
        elif delta_u_kv < -data.u_dead_kv:
            s_u_kv = delta_u_kv + data.u_dead_kv
            deadband_branch = "below"
        else:
            s_u_kv = 0.0
            deadband_branch = "inside"

        q_raw_mvar = data.k_q_mvar_per_kv * s_u_kv
        q_cmd_mvar = min(max(q_raw_mvar, data.q_min_mvar), data.q_max_mvar)

        steps: list[ProofStep] = []

        # Krok 1: ΔU
        steps.append(
            cls._create_qu_step_delta_u(
                step_number=1,
                u_meas_kv=data.u_meas_kv,
                u_ref_kv=data.u_ref_kv,
                delta_u_kv=delta_u_kv,
            )
        )

        # Krok 2: s(U) deadband
        steps.append(
            cls._create_qu_step_deadband(
                step_number=2,
                delta_u_kv=delta_u_kv,
                u_dead_kv=data.u_dead_kv,
                s_u_kv=s_u_kv,
                deadband_branch=deadband_branch,
            )
        )

        # Krok 3: Q_raw
        steps.append(
            cls._create_qu_step_q_raw(
                step_number=3,
                k_q_mvar_per_kv=data.k_q_mvar_per_kv,
                s_u_kv=s_u_kv,
                q_raw_mvar=q_raw_mvar,
            )
        )

        # Krok 4: Q_cmd z limitami
        steps.append(
            cls._create_qu_step_q_cmd(
                step_number=4,
                q_raw_mvar=q_raw_mvar,
                q_min_mvar=data.q_min_mvar,
                q_max_mvar=data.q_max_mvar,
                q_cmd_mvar=q_cmd_mvar,
            )
        )

        # Krok 5: P11.1c — Wpływ Q_cmd na napięcie U (VDROP link)
        # Tylko jeśli podano dane VDROP (opcjonalne)
        has_vdrop_link = (
            data.vdrop_delta_u_x_percent is not None
            and data.vdrop_delta_u_percent is not None
            and data.vdrop_u_kv is not None
        )

        if has_vdrop_link:
            steps.append(
                cls._create_qu_step_vdrop_link(
                    step_number=5,
                    q_cmd_mvar=q_cmd_mvar,
                    delta_u_x_percent=data.vdrop_delta_u_x_percent,
                    delta_u_percent=data.vdrop_delta_u_percent,
                    u_kv=data.vdrop_u_kv,
                )
            )

        # Podsumowanie
        unit_checks_passed = all(s.unit_check.passed for s in steps)

        key_results = {
            "delta_u_kv": ProofValue.create("\\Delta U", delta_u_kv, "kV", "delta_u_kv"),
            "s_u_kv": ProofValue.create("s(U)", s_u_kv, "kV", "s_u_kv"),
            "q_raw_mvar": ProofValue.create("Q_{raw}", q_raw_mvar, "Mvar", "q_raw_mvar"),
            "q_cmd_mvar": ProofValue.create("Q_{cmd}", q_cmd_mvar, "Mvar", "q_cmd_mvar"),
        }

        # P11.1c: Dodaj wyniki VDROP do key_results jeśli dostępne
        if has_vdrop_link:
            key_results["vdrop_delta_u_x_percent"] = ProofValue.create(
                "\\Delta U_X",
                data.vdrop_delta_u_x_percent,
                "%",
                "vdrop_delta_u_x_percent",
            )
            key_results["vdrop_delta_u_percent"] = ProofValue.create(
                "\\Delta U", data.vdrop_delta_u_percent, "%", "vdrop_delta_u_percent"
            )
            key_results["vdrop_u_kv"] = ProofValue.create("U", data.vdrop_u_kv, "kV", "vdrop_u_kv")

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=(),
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version="Q(U) P11.1b",
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.Q_U_REGULATION,
            title_pl="Dowód regulacji mocy biernej Q(U)",
            header=header,
            steps=steps,
            summary=summary,
        )

    @classmethod
    def generate_qu_counterfactual(
        cls,
        cf: QUCounterfactualInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód porównawczy (counterfactual) A vs B dla Q(U).

        Args:
            cf: Dane wejściowe QUCounterfactualInput z dwoma scenariuszami
            artifact_id: Opcjonalny ID artefaktu

        Returns:
            ProofDocument z porównaniem A vs B i różnicami w summary
        """
        if artifact_id is None:
            artifact_id = uuid4()

        # Generuj proof A i B wewnętrznie
        proof_a = cls.generate_qu_proof(cf.a)
        proof_b = cls.generate_qu_proof(cf.b)

        # Wyciągnij wartości końcowe
        k_q_a = cf.a.k_q_mvar_per_kv
        k_q_b = cf.b.k_q_mvar_per_kv
        q_raw_a = proof_a.summary.key_results["q_raw_mvar"].value
        q_raw_b = proof_b.summary.key_results["q_raw_mvar"].value
        q_cmd_a = proof_a.summary.key_results["q_cmd_mvar"].value
        q_cmd_b = proof_b.summary.key_results["q_cmd_mvar"].value

        # Oblicz delty
        delta_k_q = k_q_b - k_q_a
        delta_q_raw = q_raw_b - q_raw_a
        delta_q_cmd = q_cmd_b - q_cmd_a

        # Połącz kroki z obu dowodów (A jako kroki 1-4, B jako kroki 5-8)
        steps: list[ProofStep] = []

        # Kroki z proof A (renumerowane)
        for i, step in enumerate(proof_a.steps, start=1):
            new_step = ProofStep(
                step_id=f"QU_CF_A_STEP_{i:03d}",
                step_number=i,
                title_pl=f"[A] {step.title_pl}",
                equation=step.equation,
                input_values=step.input_values,
                substitution_latex=step.substitution_latex,
                result=step.result,
                unit_check=step.unit_check,
                source_keys=step.source_keys,
            )
            steps.append(new_step)

        # Kroki z proof B (renumerowane)
        offset = len(proof_a.steps)
        for i, step in enumerate(proof_b.steps, start=1):
            new_step = ProofStep(
                step_id=f"QU_CF_B_STEP_{i:03d}",
                step_number=offset + i,
                title_pl=f"[B] {step.title_pl}",
                equation=step.equation,
                input_values=step.input_values,
                substitution_latex=step.substitution_latex,
                result=step.result,
                unit_check=step.unit_check,
                source_keys=step.source_keys,
            )
            steps.append(new_step)

        # Podsumowanie z counterfactual_diff
        unit_checks_passed = all(s.unit_check.passed for s in steps)

        key_results = {
            "delta_k_q": ProofValue.create("\\Delta k_Q", delta_k_q, "Mvar/kV", "delta_k_q"),
            "delta_q_raw": ProofValue.create("\\Delta Q_{raw}", delta_q_raw, "Mvar", "delta_q_raw"),
            "delta_q_cmd": ProofValue.create("\\Delta Q_{cmd}", delta_q_cmd, "Mvar", "delta_q_cmd"),
            "q_cmd_a": ProofValue.create("Q_{cmd,A}", q_cmd_a, "Mvar", "q_cmd_a"),
            "q_cmd_b": ProofValue.create("Q_{cmd,B}", q_cmd_b, "Mvar", "q_cmd_b"),
        }

        # P11.1c: Dodaj U_A, U_B, delta_u_kv jeśli dane VDROP są dostępne
        has_vdrop_a = cf.a.vdrop_u_kv is not None
        has_vdrop_b = cf.b.vdrop_u_kv is not None

        if has_vdrop_a and has_vdrop_b:
            u_a = cf.a.vdrop_u_kv
            u_b = cf.b.vdrop_u_kv
            delta_u_voltage = u_b - u_a

            key_results["u_a_kv"] = ProofValue.create("U_A", u_a, "kV", "u_a_kv")
            key_results["u_b_kv"] = ProofValue.create("U_B", u_b, "kV", "u_b_kv")
            key_results["delta_u_voltage_kv"] = ProofValue.create(
                "\\Delta U_{(B-A)}", delta_u_voltage, "kV", "delta_u_voltage_kv"
            )

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=(),
        )

        header = ProofHeader(
            project_name=f"{cf.a.project_name} vs {cf.b.project_name}",
            case_name=f"{cf.a.case_name} vs {cf.b.case_name}",
            run_timestamp=cf.a.run_timestamp,
            solver_version="Q(U) Counterfactual P11.1b + P11.1c",
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.Q_U_REGULATION,
            title_pl="Dowód porównawczy (counterfactual) Q(U): A vs B",
            header=header,
            steps=steps,
            summary=summary,
        )

    # =========================================================================
    # Q(U) Step Builders
    # =========================================================================

    @classmethod
    def _create_qu_step_delta_u(
        cls,
        step_number: int,
        u_meas_kv: float,
        u_ref_kv: float,
        delta_u_kv: float,
    ) -> ProofStep:
        """Krok 1: Odchylenie napięcia ΔU = U_meas - U_ref."""
        equation = EQ_QU_001

        input_values = (
            ProofValue.create("U_{meas}", u_meas_kv, "kV", "u_meas_kv"),
            ProofValue.create("U_{ref}", u_ref_kv, "kV", "u_ref_kv"),
        )

        substitution = (
            f"\\Delta U = {u_meas_kv:.4f} - {u_ref_kv:.4f} = {delta_u_kv:.4f}\\,\\text{{kV}}"
        )

        result = ProofValue.create("\\Delta U", delta_u_kv, "kV", "delta_u_kv")

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="kV",
            computed_unit="kV",
            input_units={"U_meas": "kV", "U_ref": "kV"},
            derivation="kV - kV = kV ✓",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("QU", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "U_meas": "u_meas_kv",
                "U_ref": "u_ref_kv",
                "ΔU": "delta_u_kv",
            },
        )

    # =========================================================================
    # P17: Losses Energy Profile
    # =========================================================================

    @classmethod
    def generate_losses_energy_proof(
        cls,
        data: LossesEnergyInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód P17: Energia strat (profil czasowy).

        Tryby:
        - A) Profil dyskretny (points)
        - B) Wariant stały (p_loss_const_kw + duration_h)
        """
        if artifact_id is None:
            artifact_id = uuid4()

        cls._validate_losses_energy_input(data)

        steps: list[ProofStep] = []
        step_number = 0

        if data.points:
            sorted_points = sorted(data.points, key=lambda p: p.t_h)
            if len(sorted_points) < 2:
                raise ValueError("Profil strat wymaga co najmniej 2 punktów.")

            for idx in range(1, len(sorted_points)):
                t_prev = sorted_points[idx - 1].t_h
                t_curr = sorted_points[idx].t_h
                if t_curr <= t_prev:
                    raise ValueError("Czasy t_h muszą być ściśle rosnące bez duplikatów.")

                delta_t = t_curr - t_prev
                p_loss = sorted_points[idx].p_loss_kw
                e_i = p_loss * delta_t

                step_number += 1
                steps.append(
                    cls._create_le_step_delta_t(
                        step_number=step_number,
                        t_prev=t_prev,
                        t_curr=t_curr,
                        delta_t=delta_t,
                    )
                )

                step_number += 1
                steps.append(
                    cls._create_le_step_energy(
                        step_number=step_number,
                        p_loss=p_loss,
                        delta_t=delta_t,
                        e_i=e_i,
                    )
                )

            e_loss = sum(
                step.result.value for step in steps if step.equation.equation_id == "EQ_LE_002"
            )
            step_number += 1
            steps.append(
                cls._create_le_step_sum(
                    step_number=step_number,
                    e_values=[
                        step.result.value
                        for step in steps
                        if step.equation.equation_id == "EQ_LE_002"
                    ],
                    e_loss=e_loss,
                )
            )
        else:
            if data.p_loss_const_kw is None or data.duration_h is None:
                raise ValueError("Brak danych profilu: podaj points lub wariant stały.")

            e_loss = data.p_loss_const_kw * data.duration_h
            step_number += 1
            steps.append(
                cls._create_le_step_constant(
                    step_number=step_number,
                    p_loss=data.p_loss_const_kw,
                    duration_h=data.duration_h,
                    e_loss=e_loss,
                )
            )

        unit_checks_passed = all(step.unit_check.passed for step in steps)

        key_results = {
            "e_loss_kwh": ProofValue.create("E_{loss}", e_loss, "kWh", "e_loss_kwh"),
        }

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=(),
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.LOSSES_ENERGY,
            title_pl="Energia strat (profil czasowy)",
            header=header,
            steps=steps,
            summary=summary,
        )

    # =========================================================================
    # P18: Protection Overcurrent & Selectivity
    # =========================================================================

    @classmethod
    def generate_protection_proof(
        cls,
        data: ProtectionProofInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód P18: zabezpieczenia nadprądowe i selektywność.

        Braki danych → ostrzeżenia zamiast FAIL (BINDING).
        """
        if artifact_id is None:
            artifact_id = uuid4()

        warnings: list[str] = []

        breaking_ok, breaking_margin = cls._compare_limit(
            data.ikss_ka,
            data.icu_ka,
            "Warunek wyłączalności: brak I_k'' lub I_cu.",
            warnings,
        )

        dynamic_ok, dynamic_margin = cls._compare_limit(
            data.ip_ka,
            data.idyn_ka,
            "Warunek dynamiczny: brak i_p lub I_dyn.",
            warnings,
        )

        fault_i2t = cls._resolve_fault_i2t(data)
        device_i2t = cls._resolve_device_i2t(data)

        thermal_ok, thermal_margin = cls._compare_limit(
            fault_i2t,
            device_i2t,
            "Warunek cieplny: brak danych ∫i²dt lub I_th.",
            warnings,
        )

        selectivity_ok, selectivity_margin = cls._compare_selectivity(
            data.selectivity,
            warnings,
        )

        steps = cls._build_protection_steps(
            data=data,
            fault_i2t=fault_i2t,
            device_i2t=device_i2t,
            breaking_ok=breaking_ok,
            dynamic_ok=dynamic_ok,
            thermal_ok=thermal_ok,
            selectivity_ok=selectivity_ok,
        )

        unit_checks_passed = all(step.unit_check.passed for step in steps)

        key_results: dict[str, ProofValue] = {
            "breaking_ok": cls._status_value("OK_{breaking}", breaking_ok, "breaking_ok"),
            "dynamic_ok": cls._status_value("OK_{dynamic}", dynamic_ok, "dynamic_ok"),
            "thermal_ok": cls._status_value("OK_{thermal}", thermal_ok, "thermal_ok"),
            "selectivity_ok": cls._status_value(
                "OK_{selectivity}", selectivity_ok, "selectivity_ok"
            ),
        }

        key_results["ikss_ka"] = cls._value_or_missing("I_k''", data.ikss_ka, "kA", "ikss_ka")
        key_results["icu_ka"] = cls._value_or_missing("I_{cu}", data.icu_ka, "kA", "icu_ka")
        key_results["ip_ka"] = cls._value_or_missing("i_p", data.ip_ka, "kA", "ip_ka")
        key_results["idyn_ka"] = cls._value_or_missing("I_{dyn}", data.idyn_ka, "kA", "idyn_ka")
        key_results["i2t_ka2s"] = cls._value_or_missing(
            "\\int i^{2} dt", fault_i2t, "kA²s", "i2t_ka2s"
        )
        key_results["ith_limit_ka2s"] = cls._value_or_missing(
            "I_{th}", device_i2t, "kA²s", "ith_limit_ka2s"
        )

        if breaking_margin is not None:
            key_results["breaking_margin_ka"] = ProofValue.create(
                "\\Delta I_{cu}", breaking_margin, "kA", "breaking_margin_ka"
            )
        if dynamic_margin is not None:
            key_results["dynamic_margin_ka"] = ProofValue.create(
                "\\Delta I_{dyn}", dynamic_margin, "kA", "dynamic_margin_ka"
            )
        if thermal_margin is not None:
            key_results["thermal_margin_ka2s"] = ProofValue.create(
                "\\Delta I_{th}", thermal_margin, "kA²s", "thermal_margin_ka2s"
            )

        if data.selectivity is not None:
            key_results["selectivity_current_ka"] = cls._value_or_missing(
                "I_{sel}",
                data.selectivity.current_ka,
                "kA",
                "selectivity_current_ka",
            )
            key_results["selectivity_downstream_max_s"] = cls._value_or_missing(
                "t_{down,max}",
                data.selectivity.downstream_max_s,
                "s",
                "selectivity_downstream_max_s",
            )
            key_results["selectivity_upstream_min_s"] = cls._value_or_missing(
                "t_{up,min}",
                data.selectivity.upstream_min_s,
                "s",
                "selectivity_upstream_min_s",
            )
            key_results["selectivity_margin_setting_s"] = ProofValue.create(
                "\\Delta t",
                data.selectivity.margin_s,
                "s",
                "selectivity_margin_setting_s",
            )
            if selectivity_margin is not None:
                key_results["selectivity_margin_s"] = ProofValue.create(
                    "\\Delta t_{sel}",
                    selectivity_margin,
                    "s",
                    "selectivity_margin_s",
                )

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=tuple(warnings),
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version="P18 Protection Overcurrent",
            target_id=data.target_id,
            element_kind="PROTECTION",
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.PROTECTION_OVERCURRENT,
            title_pl="Dowód: Zabezpieczenia nadprądowe i selektywność (P18)",
            header=header,
            steps=steps,
            summary=summary,
        )

    # =========================================================================
    # P19: Earthing / Ground Fault (SN)
    # =========================================================================

    @classmethod
    def generate_earthing_ground_fault_proof(
        cls,
        data: EarthingGroundFaultInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód P19: Doziemienia / uziemienia SN.

        Braki danych → ostrzeżenia + NOT COMPUTED (BINDING).
        """
        if artifact_id is None:
            artifact_id = uuid4()

        warnings: list[str] = []
        steps: list[ProofStep] = []
        step_number = 0

        i_earth_from_voltage = None
        if data.u0_v is None or data.z_e_ohm is None:
            warnings.append("Brak danych do obliczenia prądu doziemnego (U_0 lub Z_E).")
        elif data.z_e_ohm == 0:
            warnings.append("Impedancja uziemienia Z_E = 0 Ω — brak obliczeń I_E.")
        else:
            i_earth_from_voltage = data.u0_v / data.z_e_ohm

        i_earth_from_distribution = None
        if data.i_u_a is None or data.i_p_a is None:
            warnings.append("Brak danych do rozdziału prądu doziemnego (I_u lub I_p).")
        else:
            i_earth_from_distribution = data.i_u_a + data.i_p_a

        i_earth = i_earth_from_voltage
        if i_earth is None:
            i_earth = i_earth_from_distribution

        step_number += 1
        steps.append(
            cls._create_earth_current_step(
                step_number=step_number,
                u0_v=data.u0_v,
                z_e_ohm=data.z_e_ohm,
                i_earth=i_earth_from_voltage,
            )
        )

        step_number += 1
        steps.append(
            cls._create_earth_distribution_step(
                step_number=step_number,
                i_u_a=data.i_u_a,
                i_p_a=data.i_p_a,
                i_earth=i_earth_from_distribution,
            )
        )

        u_touch = None
        if data.i_u_a is None or data.r_u_ohm is None:
            warnings.append("Brak danych do obliczenia napięcia dotykowego (I_u lub R_u).")
        else:
            u_touch = data.i_u_a * data.r_u_ohm
            warnings.append("Napięcie dotykowe obliczone w trybie UPROSZCZONYM (informacyjnie).")
            step_number += 1
            steps.append(
                cls._create_earth_touch_step(
                    step_number=step_number,
                    i_u_a=data.i_u_a,
                    r_u_ohm=data.r_u_ohm,
                    u_touch=u_touch,
                )
            )

        unit_checks_passed = all(step.unit_check.passed for step in steps)

        computed_status = "COMPUTED" if i_earth is not None else "NOT COMPUTED"

        key_results: dict[str, ProofValue] = {
            "i_earth_a": cls._value_or_missing("I_{E}", i_earth, "A", "i_earth_a"),
            "earthing_mode": cls._status_value(
                r"\text{tryb uziemienia}",
                data.earthing_mode or "—",
                "earthing_mode",
            ),
            "computed_status": cls._status_value(
                r"\text{status obliczeń}",
                computed_status,
                "computed_status",
            ),
        }

        if u_touch is not None:
            key_results["u_touch_v"] = ProofValue.create("U_{d}", u_touch, "V", "u_touch_v")

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=tuple(warnings),
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
            fault_location=data.fault_location,
            fault_type=data.fault_type,
            element_kind="EARTHING_SN",
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.EARTHING_GROUND_FAULT_SN,
            title_pl="Dowód: Doziemienia / uziemienia SN (P19)",
            header=header,
            steps=steps,
            summary=summary,
        )

    @classmethod
    def _resolve_fault_i2t(cls, data: ProtectionProofInput) -> float | None:
        if data.i2t_ka2s is not None:
            return data.i2t_ka2s
        if data.ith_ka is None or data.tk_s is None:
            return None
        return data.ith_ka**2 * data.tk_s

    @classmethod
    def _resolve_device_i2t(cls, data: ProtectionProofInput) -> float | None:
        if data.ith_limit_ka2s is not None:
            return data.ith_limit_ka2s
        if data.ith_device_ka is None or data.t_th_s is None:
            return None
        return data.ith_device_ka**2 * data.t_th_s

    @classmethod
    def _compare_limit(
        cls,
        measured: float | None,
        limit: float | None,
        warning: str,
        warnings: list[str],
    ) -> tuple[str, float | None]:
        if measured is None or limit is None:
            warnings.append(warning)
            return "NOT_EVALUATED", None
        return ("OK" if measured <= limit else "NOT_OK"), (limit - measured)

    @classmethod
    def _compare_selectivity(
        cls,
        selectivity: ProtectionSelectivityInput | None,
        warnings: list[str],
    ) -> tuple[str, float | None]:
        if selectivity is None:
            warnings.append("Selektywność: brak danych charakterystyk.")
            return "NOT_EVALUATED", None
        if selectivity.downstream_max_s is None or selectivity.upstream_min_s is None:
            warnings.append("Selektywność: brak granic czasowych t_down/t_up.")
            return "NOT_EVALUATED", None
        margin = selectivity.upstream_min_s - (selectivity.downstream_max_s + selectivity.margin_s)
        return ("OK" if margin >= 0 else "NOT_OK"), margin

    @classmethod
    def _build_protection_steps(
        cls,
        data: ProtectionProofInput,
        fault_i2t: float | None,
        device_i2t: float | None,
        breaking_ok: str,
        dynamic_ok: str,
        thermal_ok: str,
        selectivity_ok: str,
    ) -> list[ProofStep]:
        steps: list[ProofStep] = []
        step_number = 0
        for eq_id in EquationRegistry.get_pr_step_order():
            step_number += 1
            if eq_id == "EQ_PR_001":
                steps.append(
                    cls._create_pr_step_breaking(
                        step_number=step_number,
                        ikss_ka=data.ikss_ka,
                        icu_ka=data.icu_ka,
                        status=breaking_ok,
                    )
                )
            elif eq_id == "EQ_PR_002":
                steps.append(
                    cls._create_pr_step_dynamic(
                        step_number=step_number,
                        ip_ka=data.ip_ka,
                        idyn_ka=data.idyn_ka,
                        status=dynamic_ok,
                    )
                )
            elif eq_id == "EQ_PR_003":
                steps.append(
                    cls._create_pr_step_thermal(
                        step_number=step_number,
                        i2t_ka2s=fault_i2t,
                        ith_limit_ka2s=device_i2t,
                        status=thermal_ok,
                    )
                )
            elif eq_id == "EQ_PR_004":
                steps.append(
                    cls._create_pr_step_selectivity(
                        step_number=step_number,
                        selectivity=data.selectivity,
                        status=selectivity_ok,
                    )
                )
        return steps

    @classmethod
    def _create_pr_step_breaking(
        cls,
        step_number: int,
        ikss_ka: float | None,
        icu_ka: float | None,
        status: str,
    ) -> ProofStep:
        equation = EQ_PR_001
        input_values = (
            cls._value_or_missing("I_k''", ikss_ka, "kA", "ikss_ka"),
            cls._value_or_missing("I_{cu}", icu_ka, "kA", "icu_ka"),
        )
        substitution = cls._protection_substitution(
            "OK_{breaking}",
            "I_k''",
            ikss_ka,
            "I_{cu}",
            icu_ka,
            status,
        )
        result = cls._status_value("OK_{breaking}", status, "breaking_ok")
        unit_check = UnitVerifier.verify_step(
            equation_id=equation.equation_id,
            inputs=[("I_k''", "kA"), ("I_{cu}", "kA")],
            result_unit="—",
        )
        return ProofStep(
            step_id=ProofStep.generate_step_id("PR", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"I_k''": "ikss_ka", "I_{cu}": "icu_ka"},
        )

    @classmethod
    def _create_pr_step_dynamic(
        cls,
        step_number: int,
        ip_ka: float | None,
        idyn_ka: float | None,
        status: str,
    ) -> ProofStep:
        equation = EQ_PR_002
        input_values = (
            cls._value_or_missing("i_p", ip_ka, "kA", "ip_ka"),
            cls._value_or_missing("I_{dyn}", idyn_ka, "kA", "idyn_ka"),
        )
        substitution = cls._protection_substitution(
            "OK_{dynamic}",
            "i_p",
            ip_ka,
            "I_{dyn}",
            idyn_ka,
            status,
        )
        result = cls._status_value("OK_{dynamic}", status, "dynamic_ok")
        unit_check = UnitVerifier.verify_step(
            equation_id=equation.equation_id,
            inputs=[("i_p", "kA"), ("I_{dyn}", "kA")],
            result_unit="—",
        )
        return ProofStep(
            step_id=ProofStep.generate_step_id("PR", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"i_p": "ip_ka", "I_{dyn}": "idyn_ka"},
        )

    @classmethod
    def _create_pr_step_thermal(
        cls,
        step_number: int,
        i2t_ka2s: float | None,
        ith_limit_ka2s: float | None,
        status: str,
    ) -> ProofStep:
        equation = EQ_PR_003
        input_values = (
            cls._value_or_missing("\\int i^{2} dt", i2t_ka2s, "kA²s", "i2t_ka2s"),
            cls._value_or_missing("I_{th}", ith_limit_ka2s, "kA²s", "ith_limit_ka2s"),
        )
        substitution = cls._protection_substitution(
            "OK_{thermal}",
            "\\int i^{2} dt",
            i2t_ka2s,
            "I_{th}",
            ith_limit_ka2s,
            status,
        )
        result = cls._status_value("OK_{thermal}", status, "thermal_ok")
        unit_check = UnitVerifier.verify_step(
            equation_id=equation.equation_id,
            inputs=[("\\int i^{2} dt", "kA²s"), ("I_{th}", "kA²s")],
            result_unit="—",
        )
        return ProofStep(
            step_id=ProofStep.generate_step_id("PR", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "\\int i^{2} dt": "i2t_ka2s",
                "I_{th}": "ith_limit_ka2s",
            },
        )

    @classmethod
    def _create_pr_step_selectivity(
        cls,
        step_number: int,
        selectivity: ProtectionSelectivityInput | None,
        status: str,
    ) -> ProofStep:
        equation = EQ_PR_004
        downstream_max = selectivity.downstream_max_s if selectivity else None
        upstream_min = selectivity.upstream_min_s if selectivity else None
        margin_s = selectivity.margin_s if selectivity else None

        input_values = (
            cls._value_or_missing(
                "t_{down,max}", downstream_max, "s", "selectivity_downstream_max_s"
            ),
            cls._value_or_missing("t_{up,min}", upstream_min, "s", "selectivity_upstream_min_s"),
            cls._value_or_missing(
                "\\Delta t",
                margin_s,
                "s",
                "selectivity_margin_setting_s",
            ),
        )
        substitution = cls._protection_substitution(
            "OK_{selectivity}",
            "t_{down,max}+\\Delta t",
            (None if downstream_max is None or margin_s is None else downstream_max + margin_s),
            "t_{up,min}",
            upstream_min,
            status,
        )
        result = cls._status_value("OK_{selectivity}", status, "selectivity_ok")
        unit_check = UnitVerifier.verify_step(
            equation_id=equation.equation_id,
            inputs=[("t_{down,max}", "s"), ("Δt", "s"), ("t_{up,min}", "s")],
            result_unit="—",
        )
        return ProofStep(
            step_id=ProofStep.generate_step_id("PR", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "t_{down,max}": "selectivity_downstream_max_s",
                "t_{up,min}": "selectivity_upstream_min_s",
                "Δt": "selectivity_margin_setting_s",
            },
        )

    @classmethod
    def _validate_losses_energy_input(cls, data: LossesEnergyInput) -> None:
        cls._ensure_mapping_keys(data)

    @classmethod
    def _ensure_mapping_keys(cls, obj: Any, path: str = "") -> None:
        if not is_dataclass(obj):
            return
        for f in fields(obj):
            mapping_key = f.metadata.get("mapping_key")
            if not mapping_key:
                raise ValueError(f"Brak mapping_key dla pola {path}{f.name}.")
            value = getattr(obj, f.name)
            if value is None:
                continue
            if isinstance(value, list):
                for idx, item in enumerate(value):
                    cls._ensure_mapping_keys(item, f"{path}{f.name}[{idx}].")
            elif is_dataclass(value):
                cls._ensure_mapping_keys(value, f"{path}{f.name}.")

    @classmethod
    def _create_le_step_delta_t(
        cls,
        step_number: int,
        t_prev: float,
        t_curr: float,
        delta_t: float,
    ) -> ProofStep:
        equation = EQ_LE_001

        input_values = (
            ProofValue.create("t_i", t_curr, "h", "t_h"),
            ProofValue.create("t_{i-1}", t_prev, "h", "t_h"),
        )

        substitution = f"\\Delta t_i = {t_curr:.4f} - {t_prev:.4f} = {delta_t:.4f}\\,\\text{{h}}"

        result = ProofValue.create("\\Delta t_i", delta_t, "h", "delta_t_h")

        unit_check = UnitVerifier.verify_step(
            equation_id=equation.equation_id,
            inputs=[("t_i", "h"), ("t_{i-1}", "h")],
            result_unit="h",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("LE", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "t_i": "t_h",
                "t_{i-1}": "t_h",
                "Δt_i": "delta_t_h",
            },
        )

    @classmethod
    def _create_le_step_energy(
        cls,
        step_number: int,
        p_loss: float,
        delta_t: float,
        e_i: float,
    ) -> ProofStep:
        equation = EQ_LE_002

        input_values = (
            ProofValue.create("P_{loss,i}", p_loss, "kW", "p_loss_kw"),
            ProofValue.create("\\Delta t_i", delta_t, "h", "delta_t_h"),
        )

        substitution = f"E_i = {p_loss:.4f}\\cdot {delta_t:.4f} = {e_i:.4f}\\,\\text{{kWh}}"

        result = ProofValue.create("E_i", e_i, "kWh", "e_i_kwh")

        unit_check = UnitVerifier.verify_step(
            equation_id=equation.equation_id,
            inputs=[("P_{loss,i}", "kW"), ("Δt_i", "h")],
            result_unit="kWh",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("LE", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "P_{loss,i}": "p_loss_kw",
                "Δt_i": "delta_t_h",
                "E_i": "e_i_kwh",
            },
        )

    @classmethod
    def _create_le_step_sum(
        cls,
        step_number: int,
        e_values: list[float],
        e_loss: float,
    ) -> ProofStep:
        equation = EQ_LE_003

        input_values = tuple(
            ProofValue.create("E_i", value, "kWh", "e_i_kwh") for value in e_values
        )

        sum_terms = " + ".join(f"{value:.4f}" for value in e_values)
        substitution = f"E_{{loss}} = \\sum_i E_i = {sum_terms} = {e_loss:.4f}\\,\\text{{kWh}}"

        result = ProofValue.create("E_{loss}", e_loss, "kWh", "e_loss_kwh")

        unit_check = UnitVerifier.verify_step(
            equation_id=equation.equation_id,
            inputs=[("E_i", "kWh")],
            result_unit="kWh",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("LE", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "E_i": "e_i_kwh",
                "E_{loss}": "e_loss_kwh",
            },
        )

    @classmethod
    def _create_le_step_constant(
        cls,
        step_number: int,
        p_loss: float,
        duration_h: float,
        e_loss: float,
    ) -> ProofStep:
        equation = EQ_LE_004

        input_values = (
            ProofValue.create("P_{loss}", p_loss, "kW", "p_loss_kw"),
            ProofValue.create("t", duration_h, "h", "t_h"),
        )

        substitution = (
            f"E_{{loss}} = {p_loss:.4f}\\cdot {duration_h:.4f} = {e_loss:.4f}\\,\\text{{kWh}}"
        )

        result = ProofValue.create("E_{loss}", e_loss, "kWh", "e_loss_kwh")

        unit_check = UnitVerifier.verify_step(
            equation_id=equation.equation_id,
            inputs=[("P_{loss}", "kW"), ("t", "h")],
            result_unit="kWh",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("LE", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "P_{loss}": "p_loss_kw",
                "t": "t_h",
                "E_{loss}": "e_loss_kwh",
            },
        )

    # =========================================================================
    # P15: Load Currents & Overload
    # =========================================================================

    @classmethod
    def generate_load_currents_proof(
        cls,
        data: LoadCurrentsInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód P15: Prądy robocze i przeciążenia.

        Reguły:
        - LINE/CABLE: wymagany in_a, liczone k_I i m_I.
        - TRANSFORMER: wymagany sn_mva, liczone k_S i m_S.
        - Brakujące pola → ValueError (PL).
        """
        if artifact_id is None:
            artifact_id = uuid4()

        if data.element_kind in (LoadElementKind.LINE, LoadElementKind.CABLE):
            if data.in_a is None:
                raise ValueError("Brak prądu znamionowego in_a dla linii/kabla.")
        elif data.element_kind == LoadElementKind.TRANSFORMER:
            if data.sn_mva is None:
                raise ValueError("Brak mocy znamionowej sn_mva dla transformatora.")
        else:
            raise ValueError(f"Nieobsługiwany element_kind: {data.element_kind}")

        if data.u_ll_kv is None:
            raise ValueError("Brak napięcia międzyfazowego u_ll_kv.")
        if data.p_mw is None or data.q_mvar is None:
            raise ValueError("Brak mocy czynnej/biernej p_mw/q_mvar.")

        s_mva = math.sqrt(data.p_mw**2 + data.q_mvar**2)

        compute_current = (
            data.element_kind in (LoadElementKind.LINE, LoadElementKind.CABLE)
            or data.in_a is not None
        )
        i_ka = s_mva / (math.sqrt(3) * data.u_ll_kv) if compute_current else None
        in_ka = data.in_a / 1000.0 if data.in_a is not None else None

        k_i_percent = 100.0 * (i_ka / in_ka) if i_ka is not None and in_ka is not None else None

        if i_ka is None or in_ka is None:
            m_i_percent = None
        elif i_ka == 0:
            m_i_percent = "+∞"
        else:
            m_i_percent = 100.0 * ((in_ka / i_ka) - 1.0)

        k_s_percent = 100.0 * (s_mva / data.sn_mva) if data.sn_mva is not None else None

        if data.sn_mva is None:
            m_s_percent = None
        elif s_mva == 0:
            m_s_percent = "+∞"
        else:
            m_s_percent = 100.0 * ((data.sn_mva / s_mva) - 1.0)

        steps: list[ProofStep] = []
        step_number = 0

        for eq_id in EquationRegistry.get_lc_step_order():
            if eq_id == "EQ_LC_001":
                step_number += 1
                steps.append(
                    cls._create_lc_step_s(
                        step_number=step_number,
                        p_mw=data.p_mw,
                        q_mvar=data.q_mvar,
                        s_mva=s_mva,
                    )
                )
            elif eq_id == "EQ_LC_002" and compute_current:
                step_number += 1
                steps.append(
                    cls._create_lc_step_i(
                        step_number=step_number,
                        s_mva=s_mva,
                        u_ll_kv=data.u_ll_kv,
                        i_ka=i_ka or 0.0,
                    )
                )
            elif eq_id == "EQ_LC_003" and in_ka is not None and i_ka is not None:
                step_number += 1
                steps.append(
                    cls._create_lc_step_k_i(
                        step_number=step_number,
                        i_ka=i_ka,
                        in_ka=in_ka,
                        k_i_percent=k_i_percent or 0.0,
                    )
                )
            elif eq_id == "EQ_LC_004" and in_ka is not None and i_ka is not None:
                step_number += 1
                steps.append(
                    cls._create_lc_step_m_i(
                        step_number=step_number,
                        i_ka=i_ka,
                        in_ka=in_ka,
                        m_i_percent=m_i_percent,
                    )
                )
            elif eq_id == "EQ_LC_005" and data.element_kind == LoadElementKind.TRANSFORMER:
                step_number += 1
                steps.append(
                    cls._create_lc_step_k_s(
                        step_number=step_number,
                        s_mva=s_mva,
                        sn_mva=data.sn_mva or 0.0,
                        k_s_percent=k_s_percent or 0.0,
                    )
                )
            elif eq_id == "EQ_LC_006" and data.element_kind == LoadElementKind.TRANSFORMER:
                step_number += 1
                steps.append(
                    cls._create_lc_step_m_s(
                        step_number=step_number,
                        s_mva=s_mva,
                        sn_mva=data.sn_mva or 0.0,
                        m_s_percent=m_s_percent,
                    )
                )

        unit_checks_passed = all(step.unit_check.passed for step in steps)

        key_results: dict[str, ProofValue] = {
            "s_mva": ProofValue.create("S", s_mva, "MVA", "s_mva"),
        }

        if i_ka is not None:
            key_results["i_ka"] = ProofValue.create("I", i_ka, "kA", "i_ka")
        if k_i_percent is not None:
            key_results["k_i_percent"] = ProofValue.create("k_I", k_i_percent, "%", "k_i_percent")
        if m_i_percent is not None:
            key_results["m_i_percent"] = cls._proof_value_from_maybe_string(
                symbol="m_I",
                value=m_i_percent,
                unit="%",
                source_key="m_i_percent",
            )
        if k_s_percent is not None:
            key_results["k_s_percent"] = ProofValue.create("k_S", k_s_percent, "%", "k_s_percent")
        if m_s_percent is not None:
            key_results["m_s_percent"] = cls._proof_value_from_maybe_string(
                symbol="m_S",
                value=m_s_percent,
                unit="%",
                source_key="m_s_percent",
            )

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=(),
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version="P15 Load Currents",
            target_id=data.target_id,
            element_kind=data.element_kind.value,
        )

        title = "Dowód: Prądy robocze i przeciążenia (P15)"

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            title_pl=title,
            header=header,
            steps=steps,
            summary=summary,
        )

    @classmethod
    def generate_load_currents_counterfactual(
        cls,
        cf: LoadCurrentsCounterfactualInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowód porównawczy A vs B dla P15.

        Do summary.counterfactual_diff trafiają wyłącznie różnice liczbowe.
        """
        if artifact_id is None:
            artifact_id = uuid4()

        proof_a = cls.generate_load_currents_proof(cf.a)
        proof_b = cls.generate_load_currents_proof(cf.b)

        steps: list[ProofStep] = []

        for i, step in enumerate(proof_a.steps, start=1):
            steps.append(
                ProofStep(
                    step_id=f"LC_CF_A_STEP_{i:03d}",
                    step_number=i,
                    title_pl=f"[A] {step.title_pl}",
                    equation=step.equation,
                    input_values=step.input_values,
                    substitution_latex=step.substitution_latex,
                    result=step.result,
                    unit_check=step.unit_check,
                    source_keys=step.source_keys,
                )
            )

        offset = len(proof_a.steps)
        for i, step in enumerate(proof_b.steps, start=1):
            steps.append(
                ProofStep(
                    step_id=f"LC_CF_B_STEP_{i:03d}",
                    step_number=offset + i,
                    title_pl=f"[B] {step.title_pl}",
                    equation=step.equation,
                    input_values=step.input_values,
                    substitution_latex=step.substitution_latex,
                    result=step.result,
                    unit_check=step.unit_check,
                    source_keys=step.source_keys,
                )
            )

        unit_checks_passed = all(step.unit_check.passed for step in steps)

        key_results: dict[str, ProofValue] = {}
        counterfactual_diff: dict[str, ProofValue] = {}

        def _add_pair(key: str, symbol: str) -> None:
            val_a = proof_a.summary.key_results.get(key)
            val_b = proof_b.summary.key_results.get(key)
            if not val_a or not val_b:
                return
            key_results[f"{key}_a"] = cls._clone_proof_value(val_a, f"{symbol}_A", f"{key}_a")
            key_results[f"{key}_b"] = cls._clone_proof_value(val_b, f"{symbol}_B", f"{key}_b")
            delta = cls._numeric_diff_value(
                val_a.value,
                val_b.value,
                f"\\Delta {symbol}",
                val_a.unit,
                f"delta_{key}",
            )
            if delta is not None:
                counterfactual_diff[f"delta_{key}"] = delta

        _add_pair("s_mva", "S")
        _add_pair("i_ka", "I")
        _add_pair("k_i_percent", "k_I")
        _add_pair("m_i_percent", "m_I")
        _add_pair("k_s_percent", "k_S")
        _add_pair("m_s_percent", "m_S")

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_checks_passed,
            total_steps=len(steps),
            warnings=(),
            counterfactual_diff=counterfactual_diff,
        )

        header = ProofHeader(
            project_name=f"{cf.a.project_name} vs {cf.b.project_name}",
            case_name=f"{cf.a.case_name} vs {cf.b.case_name}",
            run_timestamp=cf.a.run_timestamp,
            solver_version="P15 Counterfactual",
            target_id=f"{cf.a.target_id} vs {cf.b.target_id}",
            element_kind=f"{cf.a.element_kind.value} vs {cf.b.element_kind.value}",
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            title_pl="Dowód porównawczy (counterfactual) P15: A vs B",
            header=header,
            steps=steps,
            summary=summary,
        )

    @staticmethod
    def _proof_value_from_maybe_string(
        symbol: str,
        value: float | str,
        unit: str,
        source_key: str,
    ) -> ProofValue:
        if isinstance(value, str):
            formatted = f"{value} {unit}".strip()
            return ProofValue(
                symbol=symbol,
                value=value,
                unit=unit,
                formatted=formatted,
                source_key=source_key,
            )
        return ProofValue.create(symbol, value, unit, source_key)

    @staticmethod
    def _clone_proof_value(
        value: ProofValue,
        symbol: str,
        source_key: str,
    ) -> ProofValue:
        if isinstance(value.value, str):
            formatted = f"{value.value} {value.unit}".strip()
            return ProofValue(
                symbol=symbol,
                value=value.value,
                unit=value.unit,
                formatted=formatted,
                source_key=source_key,
            )
        return ProofValue.create(symbol, float(value.value), value.unit, source_key)

    @staticmethod
    def _numeric_diff_value(
        value_a: float | str,
        value_b: float | str,
        symbol: str,
        unit: str,
        source_key: str,
    ) -> ProofValue | None:
        if isinstance(value_a, int | float) and isinstance(value_b, int | float):
            return ProofValue.create(symbol, value_b - value_a, unit, source_key)
        return None

    @staticmethod
    def _format_missing_warning(scope: str, missing: list[str]) -> str:
        missing_sorted = ", ".join(sorted(missing))
        return (
            f"{scope}: NOT COMPUTED — brak danych: {missing_sorted} | "
            f"missing_data: [{missing_sorted}]"
        )

    @staticmethod
    def _missing_lf_bus_inputs(bus: LoadFlowBusInput) -> list[str]:
        missing: list[str] = []
        if bus.u_ll_kv is None:
            missing.append("u_ll_kv")
        if bus.u_nom_kv is None:
            missing.append("u_nom_kv")
        return missing

    @staticmethod
    def _missing_lf_element_inputs(element: LoadFlowElementInput) -> list[str]:
        missing: list[str] = []
        if element.r_ohm is None:
            missing.append("r_ohm")
        if element.x_ohm is None:
            missing.append("x_ohm")
        if element.p_mw is None:
            missing.append("p_mw")
        if element.q_mvar is None:
            missing.append("q_mvar")
        if element.u_nom_kv is None:
            missing.append("u_nom_kv")
        if element.u_ll_kv is None:
            missing.append("u_ll_kv")
        return missing

    @staticmethod
    def _resolve_lf_element_params(
        element: LoadFlowElementInput,
        catalog: CatalogRepository | None,
    ) -> LoadFlowElementInput:
        r_ohm = element.r_ohm
        x_ohm = element.x_ohm
        if (
            (r_ohm is None or x_ohm is None)
            and catalog is not None
            and element.length_km is not None
            and element.type_ref
        ):
            if element.element_kind == LoadElementKind.LINE:
                line_type = catalog.get_line_type(element.type_ref)
                if line_type:
                    r_ohm = line_type.r_ohm_per_km * element.length_km
                    x_ohm = line_type.x_ohm_per_km * element.length_km
            elif element.element_kind == LoadElementKind.CABLE:
                cable_type = catalog.get_cable_type(element.type_ref)
                if cable_type:
                    r_ohm = cable_type.r_ohm_per_km * element.length_km
                    x_ohm = cable_type.x_ohm_per_km * element.length_km
        return LoadFlowElementInput(
            element_id=element.element_id,
            element_kind=element.element_kind,
            from_bus_id=element.from_bus_id,
            to_bus_id=element.to_bus_id,
            length_km=element.length_km,
            type_ref=element.type_ref,
            r_ohm=r_ohm,
            x_ohm=x_ohm,
            p_mw=element.p_mw,
            q_mvar=element.q_mvar,
            u_nom_kv=element.u_nom_kv,
            u_ll_kv=element.u_ll_kv,
        )

    @classmethod
    def _create_lf_apparent_power_step(
        cls,
        *,
        step_number: int,
        element: LoadFlowElementInput,
        s_mva: float | None,
    ) -> ProofStep:
        equation = EQ_LF_001
        input_values = (
            cls._value_or_missing("P", element.p_mw, "MW", "p_mw"),
            cls._value_or_missing("Q", element.q_mvar, "Mvar", "q_mvar"),
        )

        if element.p_mw is None or element.q_mvar is None:
            substitution = r"S = \sqrt{P^{2} + Q^{2}}\quad\text{(brak danych)}"
            result = cls._value_or_missing("S", None, "MVA", "s_mva")
        else:
            substitution = (
                f"S = \\sqrt{{{element.p_mw:.4f}^{2} + {element.q_mvar:.4f}^{2}}}"
                f" = {s_mva:.4f}\\,\\text{{MVA}}"
            )
            result = ProofValue.create("S", s_mva, "MVA", "s_mva")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("P", "MW"), ("Q", "Mvar")],
            "MVA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.LOAD_FLOW_VOLTAGE.value, step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (element {element.element_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "P": "p_mw",
                "Q": "q_mvar",
                "S": "s_mva",
                "element_id": element.element_id,
                "element_kind": element.element_kind.value,
                "from_bus_id": element.from_bus_id or "—",
                "to_bus_id": element.to_bus_id or "—",
            },
        )

    @classmethod
    def _create_lf_current_step(
        cls,
        *,
        step_number: int,
        element: LoadFlowElementInput,
        s_mva: float | None,
        u_ll_kv: float | None,
        i_ka: float | None,
    ) -> ProofStep:
        equation = EQ_LF_002
        input_values = (
            cls._value_or_missing("S", s_mva, "MVA", "s_mva"),
            cls._value_or_missing("U_{LL}", u_ll_kv, "kV", "u_ll_kv"),
        )

        if s_mva is None or u_ll_kv is None or u_ll_kv == 0:
            substitution = r"I = \frac{S}{\sqrt{3}\,U_{LL}}\quad\text{(brak danych)}"
            result = cls._value_or_missing("I", None, "kA", "i_ka")
        else:
            substitution = (
                f"I = \\frac{{{s_mva:.4f}}}{{\\sqrt{{3}}\\cdot {u_ll_kv:.4f}}}"
                f" = {i_ka:.4f}\\,\\text{{kA}}"
            )
            result = ProofValue.create("I", i_ka, "kA", "i_ka")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("S", "MVA"), ("U_{LL}", "kV")],
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.LOAD_FLOW_VOLTAGE.value, step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (element {element.element_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "S": "s_mva",
                "U_{LL}": "u_ll_kv",
                "I": "i_ka",
                "element_id": element.element_id,
                "element_kind": element.element_kind.value,
                "from_bus_id": element.from_bus_id or "—",
                "to_bus_id": element.to_bus_id or "—",
            },
        )

    @classmethod
    def _create_lf_delta_u_r_step(
        cls,
        *,
        step_number: int,
        element: LoadFlowElementInput,
        delta_u_r: float | None,
    ) -> ProofStep:
        equation = EQ_LF_003
        input_values = (
            cls._value_or_missing("R", element.r_ohm, "Ω", "r_ohm"),
            cls._value_or_missing("P", element.p_mw, "MW", "p_mw"),
            cls._value_or_missing("U_{n}", element.u_nom_kv, "kV", "u_nom_kv"),
        )

        if element.r_ohm is None or element.p_mw is None or not element.u_nom_kv:
            substitution = r"\Delta U_{R} = \frac{R\cdot P}{U_{n}}\quad\text{(brak danych)}"
            result = cls._value_or_missing("\\Delta U_{R}", None, "kV", "delta_u_r_kv")
        else:
            substitution = (
                f"\\Delta U_{{R}} = \\frac{{{element.r_ohm:.4f}\\cdot {element.p_mw:.4f}}}"
                f"{{{element.u_nom_kv:.4f}}} = {delta_u_r:.4f}\\,\\text{{kV}}"
            )
            result = ProofValue.create("\\Delta U_{R}", delta_u_r, "kV", "delta_u_r_kv")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("R", "Ω"), ("P", "MW"), ("U_n", "kV")],
            "kV",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.LOAD_FLOW_VOLTAGE.value, step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (element {element.element_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "R": "r_ohm",
                "P": "p_mw",
                "U_n": "u_nom_kv",
                "ΔU_R": "delta_u_r_kv",
                "element_id": element.element_id,
                "element_kind": element.element_kind.value,
                "from_bus_id": element.from_bus_id or "—",
                "to_bus_id": element.to_bus_id or "—",
            },
        )

    @classmethod
    def _create_lf_delta_u_x_step(
        cls,
        *,
        step_number: int,
        element: LoadFlowElementInput,
        delta_u_x: float | None,
    ) -> ProofStep:
        equation = EQ_LF_004
        input_values = (
            cls._value_or_missing("X", element.x_ohm, "Ω", "x_ohm"),
            cls._value_or_missing("Q", element.q_mvar, "Mvar", "q_mvar"),
            cls._value_or_missing("U_{n}", element.u_nom_kv, "kV", "u_nom_kv"),
        )

        if element.x_ohm is None or element.q_mvar is None or not element.u_nom_kv:
            substitution = r"\Delta U_{X} = \frac{X\cdot Q}{U_{n}}\quad\text{(brak danych)}"
            result = cls._value_or_missing("\\Delta U_{X}", None, "kV", "delta_u_x_kv")
        else:
            substitution = (
                f"\\Delta U_{{X}} = \\frac{{{element.x_ohm:.4f}\\cdot {element.q_mvar:.4f}}}"
                f"{{{element.u_nom_kv:.4f}}} = {delta_u_x:.4f}\\,\\text{{kV}}"
            )
            result = ProofValue.create("\\Delta U_{X}", delta_u_x, "kV", "delta_u_x_kv")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("X", "Ω"), ("Q", "Mvar"), ("U_n", "kV")],
            "kV",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.LOAD_FLOW_VOLTAGE.value, step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (element {element.element_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "X": "x_ohm",
                "Q": "q_mvar",
                "U_n": "u_nom_kv",
                "ΔU_X": "delta_u_x_kv",
                "element_id": element.element_id,
                "element_kind": element.element_kind.value,
                "from_bus_id": element.from_bus_id or "—",
                "to_bus_id": element.to_bus_id or "—",
            },
        )

    @classmethod
    def _create_lf_delta_u_step(
        cls,
        *,
        step_number: int,
        element: LoadFlowElementInput,
        delta_u_r: float | None,
        delta_u_x: float | None,
        delta_u: float | None,
    ) -> ProofStep:
        equation = EQ_LF_005
        input_values = (
            cls._value_or_missing("\\Delta U_{R}", delta_u_r, "kV", "delta_u_r_kv"),
            cls._value_or_missing("\\Delta U_{X}", delta_u_x, "kV", "delta_u_x_kv"),
        )

        if delta_u is None or delta_u_r is None or delta_u_x is None:
            substitution = r"\Delta U = \Delta U_{R} + \Delta U_{X}\quad\text{(brak danych)}"
            result = cls._value_or_missing("\\Delta U", None, "kV", "delta_u_kv")
        else:
            substitution = (
                f"\\Delta U = {delta_u_r:.4f} + {delta_u_x:.4f}" f" = {delta_u:.4f}\\,\\text{{kV}}"
            )
            result = ProofValue.create("\\Delta U", delta_u, "kV", "delta_u_kv")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("ΔU_R", "kV"), ("ΔU_X", "kV")],
            "kV",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.LOAD_FLOW_VOLTAGE.value, step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (element {element.element_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "ΔU": "delta_u_kv",
                "ΔU_R": "delta_u_r_kv",
                "ΔU_X": "delta_u_x_kv",
                "element_id": element.element_id,
                "element_kind": element.element_kind.value,
                "from_bus_id": element.from_bus_id or "—",
                "to_bus_id": element.to_bus_id or "—",
            },
        )

    @classmethod
    def _create_lf_bus_pu_step(
        cls,
        *,
        step_number: int,
        bus: LoadFlowBusInput,
        u_pu: float | None,
    ) -> ProofStep:
        equation = EQ_LF_006
        input_values = (
            cls._value_or_missing("U", bus.u_ll_kv, "kV", "u_ll_kv"),
            cls._value_or_missing("U_{n}", bus.u_nom_kv, "kV", "u_nom_kv"),
        )

        if bus.u_ll_kv is None or not bus.u_nom_kv:
            substitution = r"U_{pu} = \frac{U}{U_{n}}\quad\text{(brak danych)}"
            result = cls._value_or_missing("U_{pu}", None, "p.u.", "u_pu")
        else:
            substitution = (
                f"U_{{pu}} = \\frac{{{bus.u_ll_kv:.4f}}}{{{bus.u_nom_kv:.4f}}}"
                f" = {u_pu:.4f}\\,\\text{{p.u.}}"
            )
            result = ProofValue.create("U_{pu}", u_pu, "p.u.", "u_pu")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("U", "kV"), ("U_n", "kV")],
            "p.u.",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.LOAD_FLOW_VOLTAGE.value, step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (BUS {bus.bus_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "U": "u_ll_kv",
                "U_n": "u_nom_kv",
                "U_pu": "u_pu",
                "bus_id": bus.bus_id,
            },
        )

    @classmethod
    def _create_lf_bus_delta_step(
        cls,
        *,
        step_number: int,
        bus: LoadFlowBusInput,
        delta_pct: float | None,
    ) -> ProofStep:
        equation = EQ_LF_007
        input_values = (
            cls._value_or_missing("U", bus.u_ll_kv, "kV", "u_ll_kv"),
            cls._value_or_missing("U_{n}", bus.u_nom_kv, "kV", "u_nom_kv"),
        )

        if bus.u_ll_kv is None or not bus.u_nom_kv:
            substitution = r"\delta_{U} = 100\cdot\frac{U - U_{n}}{U_{n}}\quad\text{(brak danych)}"
            result = cls._value_or_missing("\\delta_{U}", None, "%", "delta_pct")
        else:
            substitution = (
                f"\\delta_{{U}} = 100\\cdot\\frac{{{bus.u_ll_kv:.4f} - {bus.u_nom_kv:.4f}}}"
                f"{{{bus.u_nom_kv:.4f}}} = {delta_pct:.4f}\\%"
            )
            result = ProofValue.create("\\delta_{U}", delta_pct, "%", "delta_pct")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("U", "kV"), ("U_n", "kV")],
            "%",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(ProofType.LOAD_FLOW_VOLTAGE.value, step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} (BUS {bus.bus_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "U": "u_ll_kv",
                "U_n": "u_nom_kv",
                "δU": "delta_pct",
                "bus_id": bus.bus_id,
            },
        )

    @staticmethod
    def _status_value(symbol: str, status: str, source_key: str) -> ProofValue:
        return ProofValue(
            symbol=symbol,
            value=status,
            unit="—",
            formatted=status,
            source_key=source_key,
        )

    @staticmethod
    def _value_or_missing(
        symbol: str,
        value: float | None,
        unit: str,
        source_key: str,
    ) -> ProofValue:
        if value is None:
            formatted = f"— {unit}".strip()
            return ProofValue(
                symbol=symbol,
                value="—",
                unit=unit,
                formatted=formatted,
                source_key=source_key,
            )
        return ProofValue.create(symbol, value, unit, source_key)

    @staticmethod
    def _protection_substitution(
        result_symbol: str,
        left_symbol: str,
        left_value: float | None,
        right_symbol: str,
        right_value: float | None,
        status: str,
    ) -> str:
        if left_value is None or right_value is None:
            return (
                f"{result_symbol} = ({left_symbol} \\le {right_symbol})"
                r"\quad\text{(brak danych)}"
            )
        return (
            f"{result_symbol} = ({left_value:.4f} \\le {right_value:.4f})" rf" = \text{{{status}}}"
        )

    @classmethod
    def _create_earth_current_step(
        cls,
        *,
        step_number: int,
        u0_v: float | None,
        z_e_ohm: float | None,
        i_earth: float | None,
    ) -> ProofStep:
        equation = EQ_EARTH_001
        input_values = (
            cls._value_or_missing("U_{0}", u0_v, "V", "u0_v"),
            cls._value_or_missing("Z_{E}", z_e_ohm, "Ω", "z_e_ohm"),
        )

        if u0_v is None or z_e_ohm is None or z_e_ohm == 0:
            substitution = r"I_{E} = \frac{U_{0}}{Z_{E}}\quad\text{(brak danych)}"
            result = cls._value_or_missing("I_{E}", None, "A", "i_earth_a")
        else:
            substitution = (
                f"I_{{E}} = \\frac{{{u0_v:.4f}}}{{{z_e_ohm:.4f}}}" f" = {i_earth:.4f}\\,\\text{{A}}"
            )
            result = ProofValue.create("I_{E}", i_earth, "A", "i_earth_a")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("U_{0}", "V"), ("Z_{E}", "Ω")],
            "A",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(
                ProofType.EARTHING_GROUND_FAULT_SN.value, step_number
            ),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "U_{0}": "u0_v",
                "Z_{E}": "z_e_ohm",
                "I_{E}": "i_earth_a",
            },
        )

    @classmethod
    def _create_earth_distribution_step(
        cls,
        *,
        step_number: int,
        i_u_a: float | None,
        i_p_a: float | None,
        i_earth: float | None,
    ) -> ProofStep:
        equation = EQ_EARTH_002
        input_values = (
            cls._value_or_missing("I_{u}", i_u_a, "A", "i_u_a"),
            cls._value_or_missing("I_{p}", i_p_a, "A", "i_p_a"),
        )

        if i_u_a is None or i_p_a is None:
            substitution = r"I_{E} = I_{u} + I_{p}\quad\text{(brak danych)}"
            result = cls._value_or_missing("I_{E}", None, "A", "i_earth_a")
        else:
            substitution = f"I_{{E}} = {i_u_a:.4f} + {i_p_a:.4f}" f" = {i_earth:.4f}\\,\\text{{A}}"
            result = ProofValue.create("I_{E}", i_earth, "A", "i_earth_a")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("I_{u}", "A"), ("I_{p}", "A")],
            "A",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(
                ProofType.EARTHING_GROUND_FAULT_SN.value, step_number
            ),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "I_{u}": "i_u_a",
                "I_{p}": "i_p_a",
                "I_{E}": "i_earth_a",
            },
        )

    @classmethod
    def _create_earth_touch_step(
        cls,
        *,
        step_number: int,
        i_u_a: float,
        r_u_ohm: float,
        u_touch: float,
    ) -> ProofStep:
        equation = EQ_EARTH_003
        input_values = (
            ProofValue.create("I_{u}", i_u_a, "A", "i_u_a"),
            ProofValue.create("R_{u}", r_u_ohm, "Ω", "r_u_ohm"),
        )

        substitution = (
            f"U_{{d}} = {i_u_a:.4f}\\,\\text{{A}} \\cdot "
            f"{r_u_ohm:.4f}\\,\\text{{Ω}} = {u_touch:.4f}\\,\\text{{V}}"
        )

        result = ProofValue.create("U_{d}", u_touch, "V", "u_touch_v")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("I_{u}", "A"), ("R_{u}", "Ω")],
            "V",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(
                ProofType.EARTHING_GROUND_FAULT_SN.value, step_number
            ),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "I_{u}": "i_u_a",
                "R_{u}": "r_u_ohm",
                "U_{d}": "u_touch_v",
            },
        )

    @classmethod
    def _create_lc_step_s(
        cls,
        step_number: int,
        p_mw: float,
        q_mvar: float,
        s_mva: float,
    ) -> ProofStep:
        equation = EQ_LC_001

        input_values = (
            ProofValue.create("P", p_mw, "MW", "p_mw"),
            ProofValue.create("Q", q_mvar, "Mvar", "q_mvar"),
        )

        substitution = (
            f"S = \\sqrt{{{p_mw:.4f}^{{2}} + {q_mvar:.4f}^{{2}}}} = " f"{s_mva:.4f}\\,\\text{{MVA}}"
        )

        result = ProofValue.create("S", s_mva, "MVA", "s_mva")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("P", "MW"), ("Q", "Mvar")],
            "MVA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("LC", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"P": "p_mw", "Q": "q_mvar", "S": "s_mva"},
        )

    @classmethod
    def _create_lc_step_i(
        cls,
        step_number: int,
        s_mva: float,
        u_ll_kv: float,
        i_ka: float,
    ) -> ProofStep:
        equation = EQ_LC_002

        input_values = (
            ProofValue.create("S", s_mva, "MVA", "s_mva"),
            ProofValue.create("U_{LL}", u_ll_kv, "kV", "u_ll_kv"),
        )

        substitution = (
            f"I = \\frac{{{s_mva:.4f}}}{{\\sqrt{{3}} \\cdot {u_ll_kv:.4f}}} = "
            f"{i_ka:.4f}\\,\\text{{kA}}"
        )

        result = ProofValue.create("I", i_ka, "kA", "i_ka")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("S", "MVA"), ("U_{LL}", "kV")],
            "kA",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("LC", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"S": "s_mva", "U_{LL}": "u_ll_kv", "I": "i_ka"},
        )

    @classmethod
    def _create_lc_step_k_i(
        cls,
        step_number: int,
        i_ka: float,
        in_ka: float,
        k_i_percent: float,
    ) -> ProofStep:
        equation = EQ_LC_003

        input_values = (
            ProofValue.create("I", i_ka, "kA", "i_ka"),
            ProofValue.create("I_n", in_ka, "kA", "in_a"),
        )

        substitution = (
            f"k_I = 100 \\cdot \\frac{{{i_ka:.4f}}}{{{in_ka:.4f}}} = "
            f"{k_i_percent:.4f}\\,\\text{{\\%}}"
        )

        result = ProofValue.create("k_I", k_i_percent, "%", "k_i_percent")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("I", "kA"), ("I_n", "kA")],
            "%",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("LC", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"I": "i_ka", "I_n": "in_a", "k_I": "k_i_percent"},
        )

    @classmethod
    def _create_lc_step_m_i(
        cls,
        step_number: int,
        i_ka: float,
        in_ka: float,
        m_i_percent: float | str | None,
    ) -> ProofStep:
        equation = EQ_LC_004

        input_values = (
            ProofValue.create("I_n", in_ka, "kA", "in_a"),
            ProofValue.create("I", i_ka, "kA", "i_ka"),
        )

        if isinstance(m_i_percent, str):
            substitution = (
                f"m_I = 100 \\cdot \\left(\\frac{{{in_ka:.4f}}}{{0}} - 1\\right) = "
                f"+\\infty\\,\\text{{\\%}}"
            )
            result = cls._proof_value_from_maybe_string(
                symbol="m_I",
                value=m_i_percent,
                unit="%",
                source_key="m_i_percent",
            )
        else:
            substitution = (
                f"m_I = 100 \\cdot \\left(\\frac{{{in_ka:.4f}}}{{{i_ka:.4f}}} - 1\\right) = "
                f"{(m_i_percent or 0.0):.4f}\\,\\text{{\\%}}"
            )
            result = ProofValue.create("m_I", m_i_percent or 0.0, "%", "m_i_percent")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("I_n", "kA"), ("I", "kA")],
            "%",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("LC", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"I_n": "in_a", "I": "i_ka", "m_I": "m_i_percent"},
        )

    @classmethod
    def _create_lc_step_k_s(
        cls,
        step_number: int,
        s_mva: float,
        sn_mva: float,
        k_s_percent: float,
    ) -> ProofStep:
        equation = EQ_LC_005

        input_values = (
            ProofValue.create("S", s_mva, "MVA", "s_mva"),
            ProofValue.create("S_n", sn_mva, "MVA", "sn_mva"),
        )

        substitution = (
            f"k_S = 100 \\cdot \\frac{{{s_mva:.4f}}}{{{sn_mva:.4f}}} = "
            f"{k_s_percent:.4f}\\,\\text{{\\%}}"
        )

        result = ProofValue.create("k_S", k_s_percent, "%", "k_s_percent")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("S", "MVA"), ("S_n", "MVA")],
            "%",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("LC", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"S": "s_mva", "S_n": "sn_mva", "k_S": "k_s_percent"},
        )

    @classmethod
    def _create_lc_step_m_s(
        cls,
        step_number: int,
        s_mva: float,
        sn_mva: float,
        m_s_percent: float | str | None,
    ) -> ProofStep:
        equation = EQ_LC_006

        input_values = (
            ProofValue.create("S_n", sn_mva, "MVA", "sn_mva"),
            ProofValue.create("S", s_mva, "MVA", "s_mva"),
        )

        if isinstance(m_s_percent, str):
            substitution = (
                f"m_S = 100 \\cdot \\left(\\frac{{{sn_mva:.4f}}}{{0}} - 1\\right) = "
                f"+\\infty\\,\\text{{\\%}}"
            )
            result = cls._proof_value_from_maybe_string(
                symbol="m_S",
                value=m_s_percent,
                unit="%",
                source_key="m_s_percent",
            )
        else:
            substitution = (
                f"m_S = 100 \\cdot \\left(\\frac{{{sn_mva:.4f}}}{{{s_mva:.4f}}} - 1\\right) = "
                f"{(m_s_percent or 0.0):.4f}\\,\\text{{\\%}}"
            )
            result = ProofValue.create("m_S", m_s_percent or 0.0, "%", "m_s_percent")

        unit_check = UnitVerifier.verify_step(
            equation.equation_id,
            [("S_n", "MVA"), ("S", "MVA")],
            "%",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("LC", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={"S_n": "sn_mva", "S": "s_mva", "m_S": "m_s_percent"},
        )

    @classmethod
    def _create_qu_step_deadband(
        cls,
        step_number: int,
        delta_u_kv: float,
        u_dead_kv: float,
        s_u_kv: float,
        deadband_branch: str,
    ) -> ProofStep:
        """Krok 2: Funkcja martwej strefy s(U)."""
        equation = EQ_QU_002

        input_values = (
            ProofValue.create("\\Delta U", delta_u_kv, "kV", "delta_u_kv"),
            ProofValue.create("U_{dead}", u_dead_kv, "kV", "u_dead_kv"),
        )

        # Jawne wskazanie gałęzi deadband
        if deadband_branch == "above":
            branch_text = f"\\Delta U = {delta_u_kv:.4f} > U_{{dead}} = {u_dead_kv:.4f}"
            calc_text = f"s(U) = {delta_u_kv:.4f} - {u_dead_kv:.4f} = {s_u_kv:.4f}\\,\\text{{kV}}"
        elif deadband_branch == "below":
            branch_text = f"\\Delta U = {delta_u_kv:.4f} < -U_{{dead}} = -{u_dead_kv:.4f}"
            calc_text = f"s(U) = {delta_u_kv:.4f} + {u_dead_kv:.4f} = {s_u_kv:.4f}\\,\\text{{kV}}"
        else:  # inside
            branch_text = f"|\\Delta U| = {abs(delta_u_kv):.4f} \\le U_{{dead}} = {u_dead_kv:.4f}"
            calc_text = "s(U) = 0\\,\\text{kV}"

        substitution = f"\\text{{Branch: }} {branch_text}, \\quad {calc_text}"

        result = ProofValue.create("s(U)", s_u_kv, "kV", "s_u_kv")

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="kV",
            computed_unit="kV",
            input_units={"ΔU": "kV", "U_dead": "kV"},
            derivation="kV ± kV = kV ✓",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("QU", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "ΔU": "delta_u_kv",
                "U_dead": "u_dead_kv",
                "s(U)": "s_u_kv",
            },
        )

    @classmethod
    def _create_qu_step_q_raw(
        cls,
        step_number: int,
        k_q_mvar_per_kv: float,
        s_u_kv: float,
        q_raw_mvar: float,
    ) -> ProofStep:
        """Krok 3: Surowa moc bierna Q_raw = k_Q · s(U)."""
        equation = EQ_QU_003

        input_values = (
            ProofValue.create("k_Q", k_q_mvar_per_kv, "Mvar/kV", "k_q_mvar_per_kv"),
            ProofValue.create("s(U)", s_u_kv, "kV", "s_u_kv"),
        )

        substitution = (
            f"Q_{{raw}} = {k_q_mvar_per_kv:.4f} \\cdot {s_u_kv:.4f} = "
            f"{q_raw_mvar:.4f}\\,\\text{{Mvar}}"
        )

        result = ProofValue.create("Q_{raw}", q_raw_mvar, "Mvar", "q_raw_mvar")

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="Mvar",
            computed_unit="Mvar",
            input_units={"k_Q": "Mvar/kV", "s(U)": "kV"},
            derivation="Mvar/kV · kV = Mvar ✓",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("QU", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "k_Q": "k_q_mvar_per_kv",
                "s(U)": "s_u_kv",
                "Q_raw": "q_raw_mvar",
            },
        )

    @classmethod
    def _create_qu_step_q_cmd(
        cls,
        step_number: int,
        q_raw_mvar: float,
        q_min_mvar: float,
        q_max_mvar: float,
        q_cmd_mvar: float,
    ) -> ProofStep:
        """Krok 4: Końcowa moc bierna Q_cmd z limitami."""
        equation = EQ_QU_004

        input_values = (
            ProofValue.create("Q_{raw}", q_raw_mvar, "Mvar", "q_raw_mvar"),
            ProofValue.create("Q_{min}", q_min_mvar, "Mvar", "q_min_mvar"),
            ProofValue.create("Q_{max}", q_max_mvar, "Mvar", "q_max_mvar"),
        )

        substitution = (
            f"Q_{{cmd}} = \\min(\\max({q_raw_mvar:.4f}, {q_min_mvar:.4f}), {q_max_mvar:.4f}) = "
            f"{q_cmd_mvar:.4f}\\,\\text{{Mvar}}"
        )

        result = ProofValue.create("Q_{cmd}", q_cmd_mvar, "Mvar", "q_cmd_mvar")

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="Mvar",
            computed_unit="Mvar",
            input_units={"Q_raw": "Mvar", "Q_min": "Mvar", "Q_max": "Mvar"},
            derivation="Mvar = Mvar ✓",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("QU", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "Q_raw": "q_raw_mvar",
                "Q_min": "q_min_mvar",
                "Q_max": "q_max_mvar",
                "Q_cmd": "q_cmd_mvar",
            },
        )

    @classmethod
    def _create_qu_step_vdrop_link(
        cls,
        step_number: int,
        q_cmd_mvar: float,
        delta_u_x_percent: float,
        delta_u_percent: float,
        u_kv: float,
    ) -> ProofStep:
        """
        Krok 5: P11.1c — Wpływ Q_cmd na napięcie U (VDROP link).

        Ten krok NIE LICZY niczego nowego — tylko prezentuje wyniki VDROP
        pokazując zależność: Q_cmd → ΔU_X → ΔU → U

        LINK-ONLY: Referencja do EQ_VDROP_004..007, bez duplikowania wzorów.
        """
        equation = EQ_QU_005

        input_values = (ProofValue.create("Q_{cmd}", q_cmd_mvar, "Mvar", "q_cmd_mvar"),)

        # Prezentacja wyników VDROP (read-only, nie obliczamy)
        substitution = (
            f"Q_{{cmd}} = {q_cmd_mvar:.4f}\\,\\text{{Mvar}} "
            f"\\xrightarrow{{\\text{{EQ\\_VDROP\\_004}}}} "
            f"\\Delta U_X = {delta_u_x_percent:.4f}\\% "
            f"\\xrightarrow{{\\text{{EQ\\_VDROP\\_005..006}}}} "
            f"\\Delta U = {delta_u_percent:.4f}\\% "
            f"\\xrightarrow{{\\text{{EQ\\_VDROP\\_007}}}} "
            f"U = {u_kv:.4f}\\,\\text{{kV}}"
        )

        result = ProofValue.create("U", u_kv, "kV", "vdrop_u_kv")

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="kV",
            computed_unit="kV",
            input_units={"Q_cmd": "Mvar", "ΔU_X": "%", "ΔU": "%"},
            derivation="Mvar → % → kV (VDROP link) ✓",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("QU", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "Q_cmd": "q_cmd_mvar",
                "ΔU_X": "vdrop_delta_u_x_percent",
                "ΔU": "vdrop_delta_u_percent",
                "U": "vdrop_u_kv",
            },
        )
