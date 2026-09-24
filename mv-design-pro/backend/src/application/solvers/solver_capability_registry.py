from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

from application.stability.dynamic_stability import WERSJA_KONTRAKTU_ECHA
from network_model.solvers.phase_state_sn import PHASE_STATE_SN_SOLVER_VERSION
from network_model.solvers.power_flow_trace import POWER_FLOW_SOLVER_VERSION
from network_model.solvers.power_flow_unbalanced import UNBALANCED_PF_SOLVER_VERSION
from network_model.solvers.v126_academic import V126_SOLVER_VERSION

AnalysisCapability = Literal[
    "SC_3F",
    "SC_1F",
    "SC_2F",
    "SC_2F_G",
    "LOAD_FLOW_NR",
    "LOAD_FLOW_GS_DIAGNOSTIC",
    "LOAD_FLOW_FD_PERFORMANCE",
    "LOAD_FLOW_UNBALANCED_BFS",
    "PHASE_STATE_SN",
    "DYNAMIC_STABILITY",
    "POWER_QUALITY_HARMONICS",
    "SSCI_IMPEDANCE",
    "VOLTAGE_STABILITY",
    "RELIABILITY_CONTINGENCY",
    "EARTHING_SAFETY",
    "NEUTRAL_EARTHING_DESIGN",
    "INSULATION_COORDINATION",
    "EARTH_FAULT_DETECTION",
    "TRANSIENT_TRV",
    "MOTOR_STARTING",
    "HOSTING_CAPACITY",
    "OPF_LOSS_LCC",
    "BENCHMARK_VALIDATION",
    "UNCERTAINTY_SENSITIVITY",
]


@dataclass(frozen=True)
class SolverCapability:
    capability: AnalysisCapability
    analysis_type: str
    # Karta W3-E: "withdrawn" dla `HOSTING_CAPACITY`/`OPF_LOSS_LCC` — solver
    # zdolność ma i wykonuje (`implementation_status` zostaje "implemented"),
    # ale API odmawia URUCHOMIENIA nowego biegu (410, duplikuje kanon liczony
    # gdzie indziej). "available" znaczyłoby TU nieprawdę: rodzaj przestał być
    # dostępny do nowych biegów, choć pozostaje odtwarzalny z biegów
    # historycznych i uruchamialny wprost w testach solvera.
    availability: Literal["available", "withdrawn"]
    # "UNVALIDATED" (uczciwość natychmiastowa, audyty harmonicznych i dynamiki
    # 2026-09-23): zdolność jest wykonywana, ale jej wynik NIE jest oceną inżynierską —
    # solver bez wyroczni (jakość energii, SSCI) albo tor bez rozwiązania sieci
    # (stabilność z kątów wpisanych przez użytkownika). Powierzchnia takiej zdolności
    # niesie ocenę niewykonaną, a wpis nie jest raportowalny.
    implementation_status: Literal["implemented", "UNVALIDATED"]
    # Wersja solvera z JEGO stałej (import), nie osobna etykieta rejestru — wyjątek:
    # zwarcia IEC 60909, których solver FROZEN (B-01) nie wystawia stałej wersji.
    solver_version: str
    required_inputs: tuple[str, ...]
    output_contract: str
    proof_support: bool
    reportable: bool
    # Test odniesienia ISTNIEJĄCY w `backend/tests` (ścieżka względem katalogu testów,
    # `plik.py::funkcja` albo `plik.py::Klasa::metoda`) — przypięte testem rejestru.
    reference_test: str
    applicability: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


SOLVER_CAPABILITY_REGISTRY: dict[AnalysisCapability, SolverCapability] = {
    "SC_3F": SolverCapability(
        capability="SC_3F",
        analysis_type="short_circuit_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="iec60909-sn-v1",
        required_inputs=("snapshot", "fault_node_id", "voltage_level_kv"),
        output_contract="ShortCircuitResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_short_circuit_iec60909.py::test_ikss_3ph_transformer_only_matches_formula",
        applicability="Zwarcie trojfazowe na wezle SN zgodnie z IEC 60909.",
    ),
    "SC_1F": SolverCapability(
        capability="SC_1F",
        analysis_type="short_circuit_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="iec60909-sn-v1",
        required_inputs=("snapshot", "fault_node_id", "zero_sequence_network", "grounding_model"),
        output_contract="ShortCircuitResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_short_circuit_iec60909.py::test_unbalanced_fault_currents_are_ordered",
        applicability="Zwarcie jednofazowe doziemne z siecia zerowa, pojemnosciami doziemnymi i uziemieniem.",
    ),
    "SC_2F": SolverCapability(
        capability="SC_2F",
        analysis_type="short_circuit_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="iec60909-sn-v1",
        required_inputs=(
            "snapshot",
            "fault_node_id",
            "positive_sequence_network",
            "negative_sequence_network",
        ),
        output_contract="ShortCircuitResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_short_circuit_iec60909.py::test_unbalanced_fault_currents_are_ordered",
        applicability="Zwarcie dwufazowe bez udzialu ziemi.",
    ),
    "SC_2F_G": SolverCapability(
        capability="SC_2F_G",
        analysis_type="short_circuit_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="iec60909-sn-v1",
        required_inputs=("snapshot", "fault_node_id", "zero_sequence_network", "grounding_model"),
        output_contract="ShortCircuitResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_short_circuit_iec60909.py::test_2ph_ground_depends_on_z0_and_requires_it",
        applicability="Zwarcie dwufazowe z ziemia z uwzglednieniem toru zerowego.",
    ),
    "LOAD_FLOW_NR": SolverCapability(
        capability="LOAD_FLOW_NR",
        analysis_type="PF",
        availability="available",
        implementation_status="implemented",
        solver_version=POWER_FLOW_SOLVER_VERSION,
        required_inputs=("snapshot", "slack_node", "pq_nodes", "branch_admittance"),
        output_contract="PowerFlowResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_power_flow_v2.py::test_pv_stays_pv_when_q_within_limits",
        applicability="Kanoniczny rozpływ mocy Newtona-Raphsona.",
    ),
    "LOAD_FLOW_GS_DIAGNOSTIC": SolverCapability(
        capability="LOAD_FLOW_GS_DIAGNOSTIC",
        analysis_type="PF",
        availability="available",
        implementation_status="implemented",
        solver_version=POWER_FLOW_SOLVER_VERSION,
        required_inputs=("snapshot", "slack_node", "pq_nodes", "branch_admittance"),
        output_contract="PowerFlowResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_power_flow_gauss_seidel.py::TestGaussSeidelBasic::test_two_bus_converges",
        applicability="Tryb diagnostyczny Gaussa-Seidla dla przypadkow zbieznosciowo kontrolowanych.",
    ),
    "LOAD_FLOW_FD_PERFORMANCE": SolverCapability(
        capability="LOAD_FLOW_FD_PERFORMANCE",
        analysis_type="PF",
        availability="available",
        implementation_status="implemented",
        solver_version=POWER_FLOW_SOLVER_VERSION,
        required_inputs=(
            "snapshot",
            "slack_node",
            "pq_nodes",
            "branch_admittance",
            "xd_ratio_applicability",
        ),
        output_contract="PowerFlowResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_power_flow_fast_decoupled.py::TestFastDecoupledBasic::test_two_bus_converges",
        applicability="Tryb wydajnosciowy fast-decoupled przy spelnionych warunkach stosowalnosci.",
    ),
    # Karta W5-D (F-1): rozpływ niesymetryczny jako bieg produktu — solver FROZEN
    # `power_flow_unbalanced.py` (BFS) przez assembler `zloz_wejscie_rozplywu_niesymetrycznego`.
    "LOAD_FLOW_UNBALANCED_BFS": SolverCapability(
        capability="LOAD_FLOW_UNBALANCED_BFS",
        analysis_type="rozplyw_niesymetryczny",
        availability="available",
        implementation_status="implemented",
        solver_version=UNBALANCED_PF_SOLVER_VERSION,
        required_inputs=(
            "snapshot",
            "slack_node",
            "radial_topology",
            "branch_sequence_impedances_z1_z0",
            "load_phases",
        ),
        output_contract="ResultSetPowerFlowUnbalancedV1",
        proof_support=True,
        reportable=True,
        reference_test="enm/test_rozplyw_niesymetryczny_bieg.py::test_dwa_biegi_tej_samej_migawki_sa_bit_w_bit",
        applicability=(
            "Rozplyw niesymetryczny sieci promieniowej z odbiorami per faza "
            "(faza-N) — napiecia/prady per faza, VUF wg IEC 61000-4-30."
        ),
    ),
    "PHASE_STATE_SN": SolverCapability(
        capability="PHASE_STATE_SN",
        analysis_type="phase_state_sn",
        availability="available",
        implementation_status="implemented",
        solver_version=PHASE_STATE_SN_SOLVER_VERSION,
        required_inputs=("snapshot", "phase_loads", "open_phase_flags"),
        output_contract="PhaseStateSNResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_phase_state_sn_solver.py::test_phase_state_sn_solver_balanced_reference_case",
        applicability="Analiza stanu fazowego SN dla asymetrii, przerw fazowych i niezrownowazenia.",
    ),
    # USUNIETE (karta W3-D, 2026-09-09): "SOURCE_FRT_LVRT_HVRT" i "SOURCE_COMPLIANCE"
    # (obie analysis_type="source_compliance", `application/compliance/source_compliance.py`,
    # skasowany). Kanon fizyki regulacji: `network_model/solvers/power_flow_inverter.py`
    # (FROZEN); kanon testu zgodnosci typu NC RfG: `network_model/solvers/ncrfg_ptpiree/
    # engine.py` (FROZEN, 5 profili operatorow) przez `POST /api/ncrfg-tests/run` i
    # `GET /api/ncrfg-tests/cases/{case_id}/compliance` — poza tym rejestrem
    # (dyspozycja `analysis_type`-owa `canonical_analysis.py`), wiec nowej pozycji
    # capability nie dopisano.
    "DYNAMIC_STABILITY": SolverCapability(
        capability="DYNAMIC_STABILITY",
        analysis_type="dynamic_stability",
        availability="available",
        implementation_status="UNVALIDATED",
        solver_version=WERSJA_KONTRAKTU_ECHA,
        required_inputs=("source_state", "fault_clear_scenario", "clearing_time_ms"),
        output_contract="DynamicStabilityEchoV2",
        proof_support=True,
        reportable=False,
        reference_test="uczciwosc/test_stabilnosc_katow_bez_werdyktu.py::test_wiersz_wyniku_nie_niesie_werdyktu_stabilnosci",
        applicability=(
            "Echo scenariusza wylaczenia zwarcia wpisanego przez uzytkownika (katy, napiecie i "
            "czestotliwosc po zwarciu, czas wylaczenia) — bez werdyktu stabilnosci: tor nie "
            "rozwiazuje sieci; ocena niewykonana do czasu biegu dynamiki RMS z wyrocznia."
        ),
    ),
    "POWER_QUALITY_HARMONICS": SolverCapability(
        capability="POWER_QUALITY_HARMONICS",
        analysis_type="power_quality_harmonics",
        availability="available",
        implementation_status="UNVALIDATED",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "harmonic_sources", "branch_admittance"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=False,
        reference_test="uczciwosc/test_jakosc_energii_bez_werdyktu.py::test_wynik_e40_niesie_ocene_niewykonana_i_zero_liczb_poza_audytem",
        applicability=(
            "Rozplyw harmoniczny solvera niezwalidowanego (bez przekladni transformatora, siec "
            "nadrzedna jako admitancja 1e6 S, 18 zaszytych rzedow, bez wyroczni) — ocena "
            "kompatybilnosci niewykonana, liczby THD/TDD/K/U_h/skan Z wylacznie w sekcji "
            "audytowej."
        ),
    ),
    "SSCI_IMPEDANCE": SolverCapability(
        capability="SSCI_IMPEDANCE",
        analysis_type="ssci_impedance",
        availability="available",
        implementation_status="UNVALIDATED",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "converter_card", "fault_level"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=False,
        reference_test="uczciwosc/test_ssci_bez_werdyktu.py::test_widok_ssci_na_realnym_biegu_nie_niesie_werdyktu_stabilnosci",
        applicability=(
            "Tablice impedancji SSCI (Sun 2011/Wen 2016): Z_grid(f)/Z_conv(f) i wzmocnienie "
            "petli mniejszej L(f) — Z_grid(f) liczone bez przekladni transformatora, wiec "
            "ocena kryterium Nyquista niewykonana; metryki L(f) wylacznie jako material "
            "audytowy, wskaznik strefy ujemnej rezystancji przeksztaltnika jako informacja."
        ),
    ),
    "VOLTAGE_STABILITY": SolverCapability(
        capability="VOLTAGE_STABILITY",
        analysis_type="voltage_stability",
        availability="available",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "load_generation_balance", "fault_level"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_voltage_stability_returns_modal_contract",
        applicability="P-V, Q-V, modalny wskaznik krytyczny i L-Index dla wezlow SN.",
    ),
    "RELIABILITY_CONTINGENCY": SolverCapability(
        capability="RELIABILITY_CONTINGENCY",
        analysis_type="reliability_contingency",
        availability="available",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "failure_rates", "mttr", "customer_counts"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_reliability_indices_are_reportable",
        applicability="Ranking N-1/N-2 oraz SAIDI/SAIFI/CAIDI/MAIFI.",
    ),
    "EARTHING_SAFETY": SolverCapability(
        capability="EARTHING_SAFETY",
        analysis_type="earthing_safety",
        availability="available",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "soil_model", "grid_geometry", "fault_current"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_earthing_uses_ieee80_contract",
        applicability="IEEE 80 / PN-EN 50522: Rg, GPR, napiecie dotykowe i krokowe.",
    ),
    "NEUTRAL_EARTHING_DESIGN": SolverCapability(
        capability="NEUTRAL_EARTHING_DESIGN",
        analysis_type="neutral_earthing_design",
        availability="available",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "line_to_earth_capacitance_b0", "neutral_earthing_type"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_neutral_earthing_design.py::TestPetersenResonanceTuning::test_coil_inductance_matches_resonance_formula",
        applicability=(
            "Projekt uziemienia punktu neutralnego: dlawik Petersena (kompensacja "
            "rezonansowa Ic) albo rezystor NER (dobor R i sprawdzenie cieplne)."
        ),
    ),
    "INSULATION_COORDINATION": SolverCapability(
        capability="INSULATION_COORDINATION",
        analysis_type="insulation_coordination",
        availability="available",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "u_m", "arrester", "tov"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_bil_parytet.py::test_bil_solvera_rowny_bil_katalogu",
        applicability="IEC 60071/60099: BIL, MCOV, TOV i margines ogranicznika.",
    ),
    "EARTH_FAULT_DETECTION": SolverCapability(
        capability="EARTH_FAULT_DETECTION",
        analysis_type="earth_fault_detection",
        availability="available",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("neutral_grounding", "relay_methods"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_each_v126_analysis_has_deterministic_proof_and_report_artifacts",
        applicability="Dobor watometrycznej, admitancyjnej, transient directional albo 5 harmonicznej.",
    ),
    "TRANSIENT_TRV": SolverCapability(
        capability="TRANSIENT_TRV",
        analysis_type="transient_trv",
        availability="available",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "breaker_rated_voltage", "trv_envelope"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_each_v126_analysis_has_deterministic_proof_and_report_artifacts",
        applicability="TRV, inrush transformatora i alert ferrorezonansu.",
    ),
    "MOTOR_STARTING": SolverCapability(
        capability="MOTOR_STARTING",
        analysis_type="motor_starting",
        availability="available",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "motor_cards", "source_impedance"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_each_v126_analysis_has_deterministic_proof_and_report_artifacts",
        applicability="Zapad napiecia rozruchowego, moment-poslizg i termika I2t.",
    ),
    "HOSTING_CAPACITY": SolverCapability(
        capability="HOSTING_CAPACITY",
        analysis_type="hosting_capacity",
        availability="withdrawn",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "stochastic_profiles", "limits"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_hosting_rng_izolacja.py::test_t3_determinizm_ten_sam_model_i_szyna_daje_identyczny_wynik",
        applicability=(
            "Stochastyczna hosting capacity OZE z deterministycznym Monte Carlo — "
            "wycofana z powierzchni nowych biegów (karta W3-E, 2026-09-09): lokalna "
            "impedancja Thevenina bez sprzężenia sieci, duplikuje kanon "
            "`GET /api/oze-analysis/hosting-capacity` (pełny rozpływ)."
        ),
    ),
    "OPF_LOSS_LCC": SolverCapability(
        capability="OPF_LOSS_LCC",
        analysis_type="opf_loss_lcc",
        availability="withdrawn",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "branch_limits", "cost_profile"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_each_v126_analysis_has_deterministic_proof_and_report_artifacts",
        applicability=(
            "Minimalizacja strat, energia strat, LCC i emisja CO2 — wycofana z "
            "powierzchni nowych biegów (karta W3-E, 2026-09-09): β = 0,45 zaszyte, "
            "zaczep 0, prąd gałęzi z jednej szyny; duplikuje kanon "
            "`POST /api/solver/transformer-losses` + badania OLTC."
        ),
    ),
    "BENCHMARK_VALIDATION": SolverCapability(
        capability="BENCHMARK_VALIDATION",
        analysis_type="benchmark_validation",
        availability="available",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("benchmark_references",),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_each_v126_analysis_has_deterministic_proof_and_report_artifacts",
        applicability="Regresja IEEE 9/14/39 oraz CIGRE MV.",
    ),
    "UNCERTAINTY_SENSITIVITY": SolverCapability(
        capability="UNCERTAINTY_SENSITIVITY",
        analysis_type="uncertainty_sensitivity",
        availability="available",
        implementation_status="implemented",
        solver_version=V126_SOLVER_VERSION,
        required_inputs=("committed_enm", "catalog_tolerances"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_each_v126_analysis_has_deterministic_proof_and_report_artifacts",
        applicability="Niepewnosc k=2 i ranking wrazliwosci parametrow.",
    ),
}


def list_solver_capabilities() -> list[SolverCapability]:
    return [SOLVER_CAPABILITY_REGISTRY[key] for key in sorted(SOLVER_CAPABILITY_REGISTRY)]


def get_solver_capability(capability: AnalysisCapability | str) -> SolverCapability:
    key = str(capability)
    if key not in SOLVER_CAPABILITY_REGISTRY:
        raise KeyError(f"Unknown solver capability: {key}")
    return SOLVER_CAPABILITY_REGISTRY[key]  # type: ignore[index]


def solver_capabilities_by_analysis_type(analysis_type: str) -> list[SolverCapability]:
    return [
        capability
        for capability in list_solver_capabilities()
        if capability.analysis_type == analysis_type
    ]


def solver_capabilities_contract() -> dict[str, object]:
    capabilities = [capability.to_dict() for capability in list_solver_capabilities()]
    return {
        "contract": "SolverCapabilityRegistryV1",
        "capabilities": capabilities,
        "all_available": all(item["availability"] == "available" for item in capabilities),
        "all_implemented": all(
            item["implementation_status"] == "implemented" for item in capabilities
        ),
        "all_proof_supported": all(bool(item["proof_support"]) for item in capabilities),
        "all_reportable": all(bool(item["reportable"]) for item in capabilities),
    }
