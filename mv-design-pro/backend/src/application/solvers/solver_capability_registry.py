"""Rejestr zdolnosci solverow — JEDNO zrodlo prawdy o rodzajach biegow i ich domenach.

Karta AB-1a D1 (`docs/plan/KARTA_AB_1A_FUNDAMENT_WYNIKOW_2026-09.md` §0 R-1):

* `PhysicsDomain` jest WYPROWADZANA z `analysis_type` biegu przez ten rejestr
  (`domena_fizyczna_biegu`), a nie dopisywana do kontraktow wynikow FROZEN.
  Nieznany `analysis_type` konczy sie wyjatkiem nazwanym, nie `None`.
* `reportable` NIE jest polem zapisywanym: kazdy wpis wskazuje jawnie swoj
  identyfikator w rejestrze dowodowym (`evidence_capability_id`), a
  raportowalnosc jest `regulatory_evidence_eligible` tej klasyfikacji
  (`solver_input.provenance.classify_capability`, fail-closed). Dwie prawdy o
  jednej zdolnosci (dotad: tu `reportable=True`, w proweniencji
  `UNVALIDATED_MODEL`) sa niemozliwe z konstrukcji.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Literal

from solver_input.provenance import CapabilityEvidence, classify_capability


class PhysicsDomain(StrEnum):
    """Domena fizyczna wyniku (W-07) — z JAKIEJ reprezentacji fizyki pochodzi liczba.

    Po co: fazor RMS 50 Hz, fazor harmonicznej, widmo i przebieg chwilowy to
    rozne obiekty fizyczne; wynik bez domeny pozwala porownac je ze soba albo
    ocenic wymaganiem z innej domeny. Czlony (W-07 minimum):

    - ``POWER_FLOW`` — ustalony stan pracy 50 Hz (fazory RMS), w tym rozplyw
      niesymetryczny w reprezentacji fazowej abc (patrz nota ponizej).
    - ``SHORT_CIRCUIT`` — wielkosci zwarciowe metody IEC 60909 (prad
      poczatkowy, udarowy, cieplny) i ich bezposredni konsumenci.
    - ``RMS_DYNAMICS`` — przebiegi czasowe fazorow RMS (uklad DAE, stabilnosc).
    - ``SEQUENCE_DOMAIN`` — skladowe symetryczne (zgodna, przeciwna, zerowa)
      jako WLASNA reprezentacja wyniku: stan fazowy SN, kompensacja i detekcja
      zwarc doziemnych, przepiecia dorywcze od zwarc doziemnych.
    - ``HARMONIC_FREQUENCY_DOMAIN`` — fazory w czestotliwosciach harmonicznych
      i skan impedancji w funkcji czestotliwosci.
    - ``SUPRAHARMONIC_FREQUENCY_DOMAIN`` — pasmo 2-150 kHz (metryki pasmowe).
    - ``ELECTROMAGNETIC_TRANSIENTS`` — przebiegi chwilowe w skali mikro- i
      milisekund (napiecie powrotne, prad zalaczania). W-07 wymienia zakaz
      mieszania EMT z pozostalymi domenami, a lista W-07 jest MINIMUM — rodzaj
      `transient_trv` nie pasuje do zadnej z szesciu domen bez zafalszowania,
      wiec domena EMT jest jawnym, siodmym czlonem.

    ROZSTRZYGNIECIE WYKONAWCY (karta AB-1a D1, jedyne rozstrzygane samodzielnie):
    rozplyw niesymetryczny (`rozplyw_niesymetryczny`, BFS per faza) ma domene
    ``POWER_FLOW`` z reprezentacja ``abc``, NIE ``SEQUENCE_DOMAIN``. Uzasadnienie:
    solver rozwiazuje rownania wezlowe ustalonego stanu 50 Hz dla KAZDEJ FAZY
    osobno (napiecia i prady faz a, b, c; odbiory faza-N) — to jest ta sama
    fizyka co rozplyw symetryczny, w pelniejszej reprezentacji. Skladowe
    symetryczne (i wskaznik VUF) sa tam WIELKOSCIA POCHODNA liczona z wyniku
    fazowego, nie przestrzenia, w ktorej zadanie jest rozwiazywane.
    ``SEQUENCE_DOMAIN`` zostaje zarezerwowana dla zadan formulowanych w
    skladowych symetrycznych (stan fazowy SN, doziemienia, kompensacja).
    Reprezentacje niesie pole ``SolverCapability.reprezentacja``.
    """

    POWER_FLOW = "POWER_FLOW"
    SHORT_CIRCUIT = "SHORT_CIRCUIT"
    RMS_DYNAMICS = "RMS_DYNAMICS"
    SEQUENCE_DOMAIN = "SEQUENCE_DOMAIN"
    HARMONIC_FREQUENCY_DOMAIN = "HARMONIC_FREQUENCY_DOMAIN"
    SUPRAHARMONIC_FREQUENCY_DOMAIN = "SUPRAHARMONIC_FREQUENCY_DOMAIN"
    ELECTROMAGNETIC_TRANSIENTS = "ELECTROMAGNETIC_TRANSIENTS"

    @property
    def label_pl(self) -> str:
        """Etykieta PL domeny (bez kodow projektowych)."""
        return _PHYSICS_DOMAIN_LABEL_PL[self]


_PHYSICS_DOMAIN_LABEL_PL: dict[PhysicsDomain, str] = {
    PhysicsDomain.POWER_FLOW: "stan ustalony 50 Hz (rozpływ mocy)",
    PhysicsDomain.SHORT_CIRCUIT: "zwarcia (IEC 60909)",
    PhysicsDomain.RMS_DYNAMICS: "dynamika RMS (przebiegi czasowe)",
    PhysicsDomain.SEQUENCE_DOMAIN: "składowe symetryczne",
    PhysicsDomain.HARMONIC_FREQUENCY_DOMAIN: "harmoniczne (dziedzina częstotliwości)",
    PhysicsDomain.SUPRAHARMONIC_FREQUENCY_DOMAIN: "supraharmoniczne (2–150 kHz)",
    PhysicsDomain.ELECTROMAGNETIC_TRANSIENTS: "stany przejściowe elektromagnetyczne",
}


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
    "PROTECTION_SN",
    "DYNAMIC_STABILITY",
    "DYNAMIKA_RMS",
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
    implementation_status: Literal["implemented"]
    solver_version: str
    required_inputs: tuple[str, ...]
    output_contract: str
    proof_support: bool
    reference_test: str
    applicability: str
    #: Domena fizyczna wyniku (W-07) — BEZ wartosci domyslnej: kazdy wpis
    #: deklaruje ja jawnie, z jednym zdaniem uzasadnienia w komentarzu wpisu.
    physics_domain: PhysicsDomain
    #: Reprezentacja w obrebie domeny: "abc" (fazy), "zgodna" (tylko skladowa
    #: zgodna), "skladowe" (zgodna/przeciwna/zerowa). Bez wartosci domyslnej.
    reprezentacja: Literal["abc", "zgodna", "skladowe"]
    #: Identyfikator zdolnosci w rejestrze dowodowym `solver_input/provenance.py`
    #: — JAWNE mapowanie, zrodlo `reportable`. Bez wartosci domyslnej.
    evidence_capability_id: str

    @property
    def ocena_dowodowa(self) -> CapabilityEvidence:
        """Klasyfikacja dowodowa z JEDYNEGO zrodla (fail-closed: nieznany id = UNVALIDATED_MODEL)."""
        return classify_capability(self.evidence_capability_id)

    @property
    def reportable(self) -> bool:
        """Czy wynik tej zdolnosci wolno raportowac jako dowod — WYPROWADZONE, nie zapisane."""
        return self.ocena_dowodowa.regulatory_evidence_eligible

    def to_dict(self) -> dict[str, Any]:
        ocena = self.ocena_dowodowa
        return {
            "capability": self.capability,
            "analysis_type": self.analysis_type,
            "availability": self.availability,
            "implementation_status": self.implementation_status,
            "solver_version": self.solver_version,
            "required_inputs": list(self.required_inputs),
            "output_contract": self.output_contract,
            "proof_support": self.proof_support,
            "reportable": ocena.regulatory_evidence_eligible,
            # Brak raportowalnosci jest NAZWANY: konsument dostaje stopien, jego
            # etykiete, uzasadnienie i odniesienie do dowodu, nie sam `false`.
            "ocena_dowodowa": ocena.to_dict(),
            "reference_test": self.reference_test,
            "applicability": self.applicability,
            "physics_domain": self.physics_domain.value,
            "physics_domain_pl": self.physics_domain.label_pl,
            "reprezentacja": self.reprezentacja,
        }


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
        reference_test="short-circuit-all-fault-types.test.py::test_short_circuit_three_phase_reportable",
        applicability="Zwarcie trojfazowe na wezle SN zgodnie z IEC 60909.",
        # Domena: Prad zwarciowy IEC 60909 w sieci skladowej zgodnej — domena zwarc.
        physics_domain=PhysicsDomain.SHORT_CIRCUIT,
        reprezentacja="zgodna",
        evidence_capability_id="short_circuit_iec60909.sc_3f",
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
        reference_test="short-circuit-all-fault-types.test.py::test_short_circuit_single_phase_reportable",
        applicability="Zwarcie jednofazowe doziemne z siecia zerowa, pojemnosciami doziemnymi i uziemieniem.",
        # Domena: Prad zwarcia doziemnego IEC 60909 ze skladowych symetrycznych — wynik jest wielkoscia zwarciowa, wiec domena zwarc (skladowe to reprezentacja).
        physics_domain=PhysicsDomain.SHORT_CIRCUIT,
        reprezentacja="skladowe",
        evidence_capability_id="short_circuit_iec60909.sc_1f",
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
        reference_test="short-circuit-all-fault-types.test.py::test_short_circuit_two_phase_reportable",
        applicability="Zwarcie dwufazowe bez udzialu ziemi.",
        # Domena: Prad zwarcia dwufazowego IEC 60909 ze skladowej zgodnej i przeciwnej — domena zwarc.
        physics_domain=PhysicsDomain.SHORT_CIRCUIT,
        reprezentacja="skladowe",
        evidence_capability_id="short_circuit_iec60909.sc_2f",
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
        reference_test="short-circuit-all-fault-types.test.py::test_short_circuit_two_phase_ground_reportable",
        applicability="Zwarcie dwufazowe z ziemia z uwzglednieniem toru zerowego.",
        # Domena: Prad zwarcia dwufazowego z ziemia IEC 60909 ze skladowych symetrycznych — domena zwarc.
        physics_domain=PhysicsDomain.SHORT_CIRCUIT,
        reprezentacja="skladowe",
        evidence_capability_id="short_circuit_iec60909.sc_2f_g",
    ),
    "LOAD_FLOW_NR": SolverCapability(
        capability="LOAD_FLOW_NR",
        analysis_type="PF",
        availability="available",
        implementation_status="implemented",
        solver_version="load-flow-nr-v1",
        required_inputs=("snapshot", "slack_node", "pq_nodes", "branch_admittance"),
        output_contract="PowerFlowResultV1",
        proof_support=True,
        reference_test="load-flow-nr-reference.test.py::test_newton_result_contract",
        applicability="Kanoniczny rozpływ mocy Newtona-Raphsona.",
        # Domena: Ustalony stan pracy 50 Hz sieci symetrycznej — rozplyw mocy.
        physics_domain=PhysicsDomain.POWER_FLOW,
        reprezentacja="zgodna",
        evidence_capability_id="load_flow.newton_raphson",
    ),
    "LOAD_FLOW_GS_DIAGNOSTIC": SolverCapability(
        capability="LOAD_FLOW_GS_DIAGNOSTIC",
        analysis_type="PF",
        availability="available",
        implementation_status="implemented",
        solver_version="load-flow-gs-v1",
        required_inputs=("snapshot", "slack_node", "pq_nodes", "branch_admittance"),
        output_contract="PowerFlowResultV1",
        proof_support=True,
        reference_test="load-flow-gs-diagnostic.test.py::test_gauss_seidel_trace_and_report_status",
        applicability="Tryb diagnostyczny Gaussa-Seidla dla przypadkow zbieznosciowo kontrolowanych.",
        # Domena: Ten sam ustalony stan 50 Hz, inna metoda iteracyjna — rozplyw mocy.
        physics_domain=PhysicsDomain.POWER_FLOW,
        reprezentacja="zgodna",
        evidence_capability_id="load_flow.gauss_seidel",
    ),
    "LOAD_FLOW_FD_PERFORMANCE": SolverCapability(
        capability="LOAD_FLOW_FD_PERFORMANCE",
        analysis_type="PF",
        availability="available",
        implementation_status="implemented",
        solver_version="load-flow-fd-v1",
        required_inputs=(
            "snapshot",
            "slack_node",
            "pq_nodes",
            "branch_admittance",
            "xd_ratio_applicability",
        ),
        output_contract="PowerFlowResultV1",
        proof_support=True,
        reference_test="load-flow-fast-decoupled.test.py::test_fast_decoupled_trace_and_applicability",
        applicability="Tryb wydajnosciowy fast-decoupled przy spelnionych warunkach stosowalnosci.",
        # Domena: Ten sam ustalony stan 50 Hz, metoda rozprzezona — rozplyw mocy.
        physics_domain=PhysicsDomain.POWER_FLOW,
        reprezentacja="zgodna",
        evidence_capability_id="load_flow.fast_decoupled",
    ),
    # Karta W5-D (F-1): rozpływ niesymetryczny jako bieg produktu — solver FROZEN
    # `power_flow_unbalanced.py` (BFS) przez assembler `zloz_wejscie_rozplywu_niesymetrycznego`.
    "LOAD_FLOW_UNBALANCED_BFS": SolverCapability(
        capability="LOAD_FLOW_UNBALANCED_BFS",
        analysis_type="rozplyw_niesymetryczny",
        availability="available",
        implementation_status="implemented",
        solver_version="load-flow-unbalanced-bfs-v1",
        required_inputs=(
            "snapshot",
            "slack_node",
            "radial_topology",
            "branch_sequence_impedances_z1_z0",
            "load_phases",
        ),
        output_contract="ResultSetPowerFlowUnbalancedV1",
        proof_support=True,
        reference_test="tests/enm/test_rozplyw_niesymetryczny_bieg.py::test_bieg_deterministyczny",
        applicability=(
            "Rozplyw niesymetryczny sieci promieniowej z odbiorami per faza "
            "(faza-N) — napiecia/prady per faza, VUF wg IEC 61000-4-30."
        ),
        # Domena: Ustalony stan 50 Hz rozwiazywany per faza abc; skladowe symetryczne i VUF sa pochodna wyniku (rozstrzygniecie w docstringu PhysicsDomain).
        physics_domain=PhysicsDomain.POWER_FLOW,
        reprezentacja="abc",
        evidence_capability_id="load_flow_unbalanced.bfs",
    ),
    "PHASE_STATE_SN": SolverCapability(
        capability="PHASE_STATE_SN",
        analysis_type="phase_state_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="phase-state-sn-v1",
        required_inputs=("snapshot", "phase_loads", "open_phase_flags"),
        output_contract="PhaseStateSNResultV1",
        proof_support=True,
        reference_test="phase-state-sn-reference.test.py::test_phase_state_has_proof",
        applicability="Analiza stanu fazowego SN dla asymetrii, przerw fazowych i niezrownowazenia.",
        # Domena: Stan fazowy SN ocenia asymetrie napiec i pradow faz wskaznikami skladowych symetrycznych — domena skladowych.
        physics_domain=PhysicsDomain.SEQUENCE_DOMAIN,
        reprezentacja="skladowe",
        evidence_capability_id="phase_state_sn.radial",
    ),
    # Karta AB-1a D1: bieg `protection_sn` (ocena zabezpieczen nadpradowych IEC 60255
    # na wyniku biegu zwarciowego) jest obslugiwany przez dyspozytor
    # `enm/canonical_analysis.py`, a nie mial wpisu w rejestrze — test parytetu
    # dyspozytor <-> rejestr (fail-closed w obie strony) go wymaga.
    "PROTECTION_SN": SolverCapability(
        capability="PROTECTION_SN",
        analysis_type="protection_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="protection-iec60255-v1",
        required_inputs=("sc_run_id", "study_case_protection_config", "protection_template"),
        output_contract="ProtectionResult",
        proof_support=True,
        reference_test="tests/test_protection_iec60255.py",
        applicability=(
            "Czasy zadzialania i selektywnosc zabezpieczen nadpradowych (charakterystyki "
            "IEC 60255-151) na pradach zwarciowych biegu IEC 60909."
        ),
        # Domena: czasy zadzialania sa funkcja pradow zwarciowych IEC 60909 — domena zwarc.
        physics_domain=PhysicsDomain.SHORT_CIRCUIT,
        reprezentacja="zgodna",
        evidence_capability_id="protection_sn.iec60255",
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
        implementation_status="implemented",
        solver_version="dynamic-stability-v1",
        required_inputs=("source_state", "fault_clear_scenario", "critical_clear_time"),
        output_contract="DynamicStabilityResultV1",
        proof_support=True,
        reference_test="dynamic-stability-reference.test.py::test_fault_clear_stability_reportable",
        applicability="Ocena stabilnosci w zdefiniowanym zakresie zaklocen i czasu wylaczenia.",
        # Domena: Stabilnosc przejsciowa po wylaczeniu zwarcia to zjawisko dynamiki RMS (tor progowy, bez calkowania — stopien dowodowy w proweniencji).
        physics_domain=PhysicsDomain.RMS_DYNAMICS,
        reprezentacja="zgodna",
        evidence_capability_id="dynamic_stability.fault_clear",
    ),
    # Karta AB-1a D1 (przeglad adwersarialny §5.2): bieg `dynamika_rms` (rdzen DAE
    # `network_model/solvers/dynamika/**`, adapter `enm/adapter_dynamiki.py`) byl
    # obslugiwany przez dyspozytor, ale NIE mial wpisu w rejestrze zdolnosci.
    "DYNAMIKA_RMS": SolverCapability(
        capability="DYNAMIKA_RMS",
        analysis_type="dynamika_rms",
        availability="available",
        implementation_status="implemented",
        solver_version="DYNAMIKA_RMS_DAE_V1",
        required_inputs=(
            "snapshot",
            "pf_run_id",
            "dynamika",
            "nastawy_solvera",
            "generator_dynamika",
        ),
        output_contract="resultset_dynamic_v1",
        proof_support=True,
        reference_test=(
            "tests/e2e/test_so1a_scenariusz_odniesienia.py::"
            "test_powtorzony_bieg_daje_identyczny_wynik"
        ),
        applicability=(
            "Przebiegi czasowe fazorow RMS ukladu DAE (skladowa zgodna) od punktu pracy "
            "z rozplywu: zwarcia 3F, przelaczenia galezi, odlaczenia zrodel, skoki obciazen."
        ),
        # Domena: calkowanie rownan ruchu ukladu DAE w czasie na fazorach RMS 50 Hz.
        physics_domain=PhysicsDomain.RMS_DYNAMICS,
        reprezentacja="zgodna",
        evidence_capability_id="dynamika_rms.przebieg_czasowy",
    ),
    "POWER_QUALITY_HARMONICS": SolverCapability(
        capability="POWER_QUALITY_HARMONICS",
        analysis_type="power_quality_harmonics",
        # Karta AB-1d_min krok 3 (audyt F1-F9, `docs/evidence/OPUS_AUDYT_HARMONICZNE_
        # SUPRAHARMONICZNE_2026-09-23.md` §0.1): model Y(f) bez zaleznosci elementow od
        # czestotliwosci, cichy `pinv`, impedancja zrodla 0,15/0,99 z powietrza, limity
        # 8/5/5 % zaszyte — wynik nie jest fizyka sieci. Ten sam mechanizm co W3-E:
        # `withdrawn` + 410 na POST (`api/v126_academic.py`), nastepca = rodzaj biegu
        # `harmoniczne` (`RODZAJE_BIEGOW`). Zdolnosc solvera FROZEN zostaje (OD-15(d)).
        availability="withdrawn",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "harmonic_sources", "branch_admittance"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_power_quality_trace_and_hash_are_deterministic",
        applicability=(
            "Wycofana z powierzchni nowych biegów (audyt harmonicznych F1–F9): Y(f) bez "
            "modeli elementów zależnych od częstotliwości, ciche pseudoodwrócenie, impedancja "
            "źródła z założenia, limity THD/TDD zaszyte. Następca: rodzaj biegu `harmoniczne`."
        ),
        # Domena: Rozplyw harmonicznych i skan Z(f) — fazory w czestotliwosciach harmonicznych.
        physics_domain=PhysicsDomain.HARMONIC_FREQUENCY_DOMAIN,
        reprezentacja="zgodna",
        evidence_capability_id="v126_academic.power_quality_harmonics",
    ),
    "SSCI_IMPEDANCE": SolverCapability(
        capability="SSCI_IMPEDANCE",
        analysis_type="ssci_impedance",
        # Karta AB-1d_min krok 3 (przeglad adwersarialny §6.4, audyt #10/#21/#22/#49 —
        # KEEP_RESEARCH_ONLY): werdykt Nyquista z zaszytym zapasem fazy 30° i Z_grid(f)
        # z odrzuconej impedancji zrodla 0,15/0,99 nie jest dowodem — `withdrawn` + 410,
        # bez tokenu werdyktu na zadnym ekranie. Etykieta badawcza; powrot po poprawnym
        # Z_grid(f) z rdzenia harmonicznego.
        availability="withdrawn",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "converter_card", "fault_level"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_ssci_impedance.py::test_ssci_envelope_shape_and_arrays",
        applicability=(
            "Analiza badawcza, wycofana z powierzchni nowych biegów: werdykt Nyquista "
            "(Sun 2011/Wen 2016) z zapasem fazy 30° zaszytym i impedancją sieci Z_grid(f) "
            "z impedancji źródła przyjętej z założenia — bez werdyktu na ekranie."
        ),
        # Domena: Impedancje Z_grid(f)/Z_conv(f) i petla L(f) w funkcji czestotliwosci — domena czestotliwosci harmonicznych.
        physics_domain=PhysicsDomain.HARMONIC_FREQUENCY_DOMAIN,
        reprezentacja="zgodna",
        evidence_capability_id="v126_academic.ssci_impedance",
    ),
    "VOLTAGE_STABILITY": SolverCapability(
        capability="VOLTAGE_STABILITY",
        analysis_type="voltage_stability",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "load_generation_balance", "fault_level"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_voltage_stability_returns_modal_contract",
        applicability="P-V, Q-V, modalny wskaznik krytyczny i L-Index dla wezlow SN.",
        # Domena: Krzywe P-V/Q-V i wskaznik modalny to ciag ustalonych stanow 50 Hz — rozplyw mocy.
        physics_domain=PhysicsDomain.POWER_FLOW,
        reprezentacja="zgodna",
        evidence_capability_id="v126_academic.voltage_stability",
    ),
    "RELIABILITY_CONTINGENCY": SolverCapability(
        capability="RELIABILITY_CONTINGENCY",
        analysis_type="reliability_contingency",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "failure_rates", "mttr", "customer_counts"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_reliability_indices_are_reportable",
        applicability="Ranking N-1/N-2 oraz SAIDI/SAIFI/CAIDI/MAIFI.",
        # Domena: Ocena N-1 i wskaznikow niezawodnosci opiera sie na ustalonym stanie obciazen 50 Hz — rozplyw mocy.
        physics_domain=PhysicsDomain.POWER_FLOW,
        reprezentacja="zgodna",
        evidence_capability_id="v126_academic.reliability_contingency",
    ),
    "EARTHING_SAFETY": SolverCapability(
        capability="EARTHING_SAFETY",
        analysis_type="earthing_safety",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "soil_model", "grid_geometry", "fault_current"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_earthing_uses_ieee80_contract",
        applicability="IEEE 80 / PN-EN 50522: Rg, GPR, napiecie dotykowe i krokowe.",
        # Domena: Napiecia dotykowe i krokowe wynikaja z pradu zwarcia doziemnego wplywajacego do uziomu — domena zwarc.
        physics_domain=PhysicsDomain.SHORT_CIRCUIT,
        reprezentacja="zgodna",
        evidence_capability_id="v126_academic.earthing_safety",
    ),
    "NEUTRAL_EARTHING_DESIGN": SolverCapability(
        capability="NEUTRAL_EARTHING_DESIGN",
        analysis_type="neutral_earthing_design",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "line_to_earth_capacitance_b0", "neutral_earthing_type"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test=(
            "test_v126_neutral_earthing_design.py::"
            "TestPetersenResonanceTuning::test_coil_inductance_matches_resonance_formula"
        ),
        applicability=(
            "Projekt uziemienia punktu neutralnego: dlawik Petersena (kompensacja "
            "rezonansowa Ic) albo rezystor NER (dobor R i sprawdzenie cieplne)."
        ),
        # Domena: Dobor dlawika/rezystora punktu neutralnego opiera sie na pojemnosci skladowej zerowej sieci — domena skladowych.
        physics_domain=PhysicsDomain.SEQUENCE_DOMAIN,
        reprezentacja="skladowe",
        evidence_capability_id="v126_academic.neutral_earthing_design",
    ),
    "INSULATION_COORDINATION": SolverCapability(
        capability="INSULATION_COORDINATION",
        analysis_type="insulation_coordination",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "u_m", "arrester", "tov"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_insulation_margin_is_computed",
        applicability="IEC 60071/60099: BIL, MCOV, TOV i margines ogranicznika.",
        # Domena: Przepiecia dorywcze od zwarcia doziemnego wynikaja ze wspolczynnika zwarcia doziemnego (stosunek impedancji skladowych) — domena skladowych.
        physics_domain=PhysicsDomain.SEQUENCE_DOMAIN,
        reprezentacja="skladowe",
        evidence_capability_id="v126_academic.insulation_coordination",
    ),
    "EARTH_FAULT_DETECTION": SolverCapability(
        capability="EARTH_FAULT_DETECTION",
        analysis_type="earth_fault_detection",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("neutral_grounding", "relay_methods"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_earth_fault_method_decision_table",
        applicability="Dobor watometrycznej, admitancyjnej, transient directional albo 5 harmonicznej.",
        # Domena: Metody detekcji doziemien dzialaja na wielkosciach skladowej zerowej (U0, I0) — domena skladowych.
        physics_domain=PhysicsDomain.SEQUENCE_DOMAIN,
        reprezentacja="skladowe",
        evidence_capability_id="v126_academic.earth_fault_detection",
    ),
    "TRANSIENT_TRV": SolverCapability(
        capability="TRANSIENT_TRV",
        analysis_type="transient_trv",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "breaker_rated_voltage", "trv_envelope"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_transient_trv_contract",
        applicability="TRV, inrush transformatora i alert ferrorezonansu.",
        # Domena: Napiecie powrotne i prad zalaczania to przebiegi chwilowe w skali mikrosekund — domena stanow przejsciowych elektromagnetycznych.
        physics_domain=PhysicsDomain.ELECTROMAGNETIC_TRANSIENTS,
        reprezentacja="abc",
        evidence_capability_id="v126_academic.transient_trv",
    ),
    "MOTOR_STARTING": SolverCapability(
        capability="MOTOR_STARTING",
        analysis_type="motor_starting",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "motor_cards", "source_impedance"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_motor_starting_voltage_dip",
        applicability="Zapad napiecia rozruchowego, moment-poslizg i termika I2t.",
        # Domena: Zapad napiecia przy rozruchu liczony jako quasi-ustalony stan 50 Hz — rozplyw mocy.
        physics_domain=PhysicsDomain.POWER_FLOW,
        reprezentacja="zgodna",
        evidence_capability_id="v126_academic.motor_starting",
    ),
    "HOSTING_CAPACITY": SolverCapability(
        capability="HOSTING_CAPACITY",
        analysis_type="hosting_capacity",
        availability="withdrawn",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "stochastic_profiles", "limits"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_hosting_capacity_is_seeded",
        applicability=(
            "Stochastyczna hosting capacity OZE z deterministycznym Monte Carlo — "
            "wycofana z powierzchni nowych biegów (karta W3-E, 2026-09-09): lokalna "
            "impedancja Thevenina bez sprzężenia sieci, duplikuje kanon "
            "`GET /api/oze-analysis/hosting-capacity` (pełny rozpływ)."
        ),
        # Domena: Zdolnosc przylaczeniowa ograniczana wzrostem napiecia i obciazalnoscia w stanie ustalonym — rozplyw mocy.
        physics_domain=PhysicsDomain.POWER_FLOW,
        reprezentacja="zgodna",
        evidence_capability_id="v126_academic.hosting_capacity",
    ),
    "OPF_LOSS_LCC": SolverCapability(
        capability="OPF_LOSS_LCC",
        analysis_type="opf_loss_lcc",
        availability="withdrawn",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "branch_limits", "cost_profile"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_opf_losses_lcc_contract",
        applicability=(
            "Minimalizacja strat, energia strat, LCC i emisja CO2 — wycofana z "
            "powierzchni nowych biegów (karta W3-E, 2026-09-09): β = 0,45 zaszyte, "
            "zaczep 0, prąd gałęzi z jednej szyny; duplikuje kanon "
            "`POST /api/solver/transformer-losses` + badania OLTC."
        ),
        # Domena: Straty i koszt cyklu zycia z ustalonego stanu pracy 50 Hz — rozplyw mocy.
        physics_domain=PhysicsDomain.POWER_FLOW,
        reprezentacja="zgodna",
        evidence_capability_id="v126_academic.opf_loss_lcc",
    ),
    "BENCHMARK_VALIDATION": SolverCapability(
        capability="BENCHMARK_VALIDATION",
        analysis_type="benchmark_validation",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("benchmark_references",),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_benchmark_validation_passes_reference_contract",
        applicability="Regresja IEEE 9/14/39 oraz CIGRE MV.",
        # Domena: Porownanie rozplywu produkcyjnego z wartosciami odniesienia IEEE/CIGRE — rozplyw mocy.
        physics_domain=PhysicsDomain.POWER_FLOW,
        reprezentacja="zgodna",
        evidence_capability_id="v126_academic.benchmark_validation",
    ),
    "UNCERTAINTY_SENSITIVITY": SolverCapability(
        capability="UNCERTAINTY_SENSITIVITY",
        analysis_type="uncertainty_sensitivity",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "catalog_tolerances"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reference_test="test_v126_academic_solver.py::test_uncertainty_contract",
        applicability="Niepewnosc k=2 i ranking wrazliwosci parametrow.",
        # Domena: Wrazliwosc liczona dla parametrow wyznaczajacych moc zwarciowa (u_k, |Z|, S_k) — domena zwarc.
        physics_domain=PhysicsDomain.SHORT_CIRCUIT,
        reprezentacja="zgodna",
        evidence_capability_id="v126_academic.uncertainty_sensitivity",
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


def solver_capabilities_contract() -> dict[str, Any]:
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
        # Karta AB-1a D1: brak raportowalnosci NAZWANY na poziomie rejestru —
        # lista zdolnosci, ktorych wynik nie jest dowodem, zamiast samego
        # `all_reportable: false`.
        "not_reportable": sorted(
            item["capability"] for item in capabilities if not item["reportable"]
        ),
    }


# ---------------------------------------------------------------------------
# Domena fizyczna BIEGU (karta AB-1a D1, §0 R-1)
# ---------------------------------------------------------------------------

#: Prefiks biegow V12.6 w dyspozytorze (`enm/canonical_analysis.py`).
PREFIKS_BIEGU_V126 = "v126:"

#: JAWNA tabela: `analysis_type` biegu V12.6 w dyspozytorze -> zdolnosc rejestru.
#: Dyspozytor przyjmuje `"v126:<rodzaj>"`, a rejestr trzyma rodzaj bez prefiksu —
#: mapowanie jest wypisane, nie zgadywane regula tekstowa (karta D1: „tabela
#: jawna, nie regex-zgadywanie"). Kompletnosc wobec `V126AnalysisType` pinuje
#: `tests/application/test_rejestr_domen_fizycznych.py`.
BIEGI_V126: dict[str, AnalysisCapability] = {
    "v126:power_quality_harmonics": "POWER_QUALITY_HARMONICS",
    "v126:ssci_impedance": "SSCI_IMPEDANCE",
    "v126:voltage_stability": "VOLTAGE_STABILITY",
    "v126:reliability_contingency": "RELIABILITY_CONTINGENCY",
    "v126:earthing_safety": "EARTHING_SAFETY",
    "v126:insulation_coordination": "INSULATION_COORDINATION",
    "v126:earth_fault_detection": "EARTH_FAULT_DETECTION",
    "v126:transient_trv": "TRANSIENT_TRV",
    "v126:motor_starting": "MOTOR_STARTING",
    "v126:hosting_capacity": "HOSTING_CAPACITY",
    "v126:opf_loss_lcc": "OPF_LOSS_LCC",
    "v126:benchmark_validation": "BENCHMARK_VALIDATION",
    "v126:uncertainty_sensitivity": "UNCERTAINTY_SENSITIVITY",
    "v126:neutral_earthing_design": "NEUTRAL_EARTHING_DESIGN",
}


# ---------------------------------------------------------------------------
# JEDNA lista zrodlowa rodzajow biegow (karta AB-1d_min krok 1, przeglad
# adwersarialny §5.3)
# ---------------------------------------------------------------------------

#: Kod odmowy biegu rodzaju zarejestrowanego BEZ solvera (AB-1d_min krok 2).
KOD_SOLVER_NIEOBECNY = "domena.solver_nieobecny"


@dataclass(frozen=True)
class SolverNieobecny:
    """Rodzaj biegu zarejestrowany, zanim istnieje jego solver — odmowa NAZWANA.

    ZASADA NR 1: rodzaj bez solvera nie jest zaslepka w UI (nie jest nigdzie
    oferowany — pin `tests/application/test_rodzaje_biegow_jedna_lista.py`), a jego
    bieg konczy sie odmowa `domena.solver_nieobecny`, ktora mowi CZEGO brakuje
    (`brak_pl`) i KTORY kamien programu A/B to dostarcza (`kamien`). Domena
    fizyczna rodzaju jest tu (jedyne zrodlo domeny rodzaju bez wpisu zdolnosci —
    wpis zdolnosci opisuje solver, ktorego nie ma).
    """

    physics_domain: PhysicsDomain
    brak_pl: str
    kamien: str


@dataclass(frozen=True)
class RodzajBiegu:
    """Rodzaj biegu dyspozytora `enm/canonical_analysis.py` — JEDNO zrodlo prawdy.

    Z tego wpisu WYPROWADZANE sa: mapowanie typu wykonawczego API
    (`ExecutionAnalysisType` <-> `analysis_type`, `api/execution_runs.py`,
    `enm/canonical_analysis.py::_execution_analysis_type_for_run`), trzy pola
    odtwarzalnosci koperty (`api/v125_contracts.py::build_analysis_case_reproducibility`)
    i etykieta gotowosci rodzajow bedacych biegami
    (`application/calculation_readiness/service.py`). Listy, ktorych nie da sie
    wyprowadzic (FROZEN `ExecutionAnalysisType`, galezie dyspozytora, legacy
    `domain/analysis_run.py::AnalysisType`), sa PRZYPIETE do tej tabeli testem
    parytetu.

    ``solver_family``/``formula_set_version``/``standard_basis_ref`` = ``None``
    znaczy „koperta odtwarzalnosci podaje wartosc ogolna" (sam rodzaj /
    ``canonical_run_v1`` / ``CANONICAL_ANALYSIS``) — dokladnie zachowanie trzech
    slownikow sprzed karty (pin bitowy w tescie parytetu).
    """

    analysis_type: str
    etykieta_pl: str
    #: Czlony `ExecutionAnalysisType` (FROZEN, `domain/execution.py`) tego rodzaju.
    typy_wykonawcze: tuple[str, ...]
    solver_family: str | None
    formula_set_version: str | None
    standard_basis_ref: str | None
    #: Klucze opcji biegu walidowane kontraktem przy UTWORZENIU biegu
    #: (`enm/biegi_czestotliwosciowe.py`); brak klucza = odmowa nazwana (422).
    wymagane_opcje: tuple[str, ...]
    solver_nieobecny: SolverNieobecny | None


#: Klucze opcji biegow dziedziny czestotliwosci (kontrakty `network_model/solvers/harmoniczne/`).
OPCJA_OS_CZESTOTLIWOSCI = "os_czestotliwosci"
OPCJA_PASMO_SUPRAHARMONICZNE = "pasmo_supraharmoniczne"

RODZAJE_BIEGOW: dict[str, RodzajBiegu] = {
    "PF": RodzajBiegu(
        analysis_type="PF",
        etykieta_pl="Rozpływ mocy",
        typy_wykonawcze=("LOAD_FLOW",),
        solver_family="power_flow_newton",
        formula_set_version="pf_result_v1",
        standard_basis_ref="NR_POWER_FLOW",
        wymagane_opcje=(),
        solver_nieobecny=None,
    ),
    "rozplyw_niesymetryczny": RodzajBiegu(
        analysis_type="rozplyw_niesymetryczny",
        etykieta_pl="Rozpływ niesymetryczny",
        typy_wykonawcze=("PF_UNBALANCED",),
        solver_family="power_flow_unbalanced_bfs",
        formula_set_version="power_flow_unbalanced_v1",
        standard_basis_ref="PF_UNBALANCED_BFS_V1",
        wymagane_opcje=(),
        solver_nieobecny=None,
    ),
    "short_circuit_sn": RodzajBiegu(
        analysis_type="short_circuit_sn",
        etykieta_pl="Zwarcia (IEC 60909)",
        typy_wykonawcze=("SC_3F", "SC_1F", "SC_2F", "SC_2F_G"),
        solver_family="iec60909_short_circuit",
        formula_set_version="iec60909_v1",
        standard_basis_ref="IEC_60909",
        wymagane_opcje=(),
        solver_nieobecny=None,
    ),
    "phase_state_sn": RodzajBiegu(
        analysis_type="phase_state_sn",
        etykieta_pl="Stan fazowy SN",
        typy_wykonawcze=("PHASE_STATE_SN",),
        solver_family="phase_state_sn_radial",
        formula_set_version="phase_state_sn_v1",
        standard_basis_ref="PHASE_STATE_SN_RADIAL_V1",
        wymagane_opcje=(),
        solver_nieobecny=None,
    ),
    "dynamic_stability": RodzajBiegu(
        analysis_type="dynamic_stability",
        etykieta_pl="Stabilność dynamiczna (tor progowy)",
        typy_wykonawcze=("DYNAMIC_STABILITY",),
        solver_family="dynamic_stability_fault_clear",
        formula_set_version="dynamic_stability_fault_clear_v1",
        standard_basis_ref="DYNAMIC_STABILITY_FAULT_CLEAR_V1",
        wymagane_opcje=(),
        solver_nieobecny=None,
    ),
    "dynamika_rms": RodzajBiegu(
        analysis_type="dynamika_rms",
        etykieta_pl="Dynamika czasowa (DAE)",
        typy_wykonawcze=("DYNAMIKA_RMS",),
        solver_family="dynamika_rms_dae",
        formula_set_version="resultset_dynamic_v1",
        standard_basis_ref="DYNAMIKA_RMS_DAE_V1",
        wymagane_opcje=(),
        solver_nieobecny=None,
    ),
    # Bieg zabezpieczen ma osobna trase utworzenia (V12K-025, `POST .../protection-runs`);
    # trzy pola koperty odtwarzalnosci nigdy nie mialy dla niego wpisu (wartosci ogolne).
    "protection_sn": RodzajBiegu(
        analysis_type="protection_sn",
        etykieta_pl="Zabezpieczenia nadprądowe",
        typy_wykonawcze=("PROTECTION",),
        solver_family=None,
        formula_set_version=None,
        standard_basis_ref=None,
        wymagane_opcje=(),
        solver_nieobecny=None,
    ),
    # --- Karta AB-1d_min krok 2: rodzaje dziedziny czestotliwosci BEZ solvera ---
    # Kontrakty wejscia istnieja (`network_model/solvers/harmoniczne/`), fizyki nie ma:
    # bieg konczy sie odmowa `domena.solver_nieobecny`. `supraharmoniczne` odmawia do
    # AB-4H (nie AB-2H): ogolny Y(f) z AB-2H dalby wynik 2-150 kHz na modelach
    # elementow waznych przy 50 Hz (program §6.10).
    "harmoniczne": RodzajBiegu(
        analysis_type="harmoniczne",
        etykieta_pl="Rozpływ harmonicznych",
        typy_wykonawcze=("HARMONICZNE",),
        solver_family=None,
        formula_set_version=None,
        standard_basis_ref=None,
        wymagane_opcje=(OPCJA_OS_CZESTOTLIWOSCI,),
        solver_nieobecny=SolverNieobecny(
            physics_domain=PhysicsDomain.HARMONIC_FREQUENCY_DOMAIN,
            brak_pl=(
                "brak rdzenia rozpływu harmonicznych — admitancji sieci Y(f) z modeli "
                "elementów zależnych od częstotliwości, rozwiązania Y(f)·V(f) = I(f), "
                "modeli źródeł harmonicznych i tła sieci"
            ),
            kamien="AB-2H",
        ),
    ),
    "skan_czestotliwosciowy": RodzajBiegu(
        analysis_type="skan_czestotliwosciowy",
        etykieta_pl="Skan impedancji w funkcji częstotliwości",
        typy_wykonawcze=("SKAN_CZESTOTLIWOSCIOWY",),
        solver_family=None,
        formula_set_version=None,
        standard_basis_ref=None,
        wymagane_opcje=(OPCJA_OS_CZESTOTLIWOSCI,),
        solver_nieobecny=SolverNieobecny(
            physics_domain=PhysicsDomain.HARMONIC_FREQUENCY_DOMAIN,
            brak_pl=(
                "brak rdzenia skanu impedancji — Z_ii(f) i Z_ij(f) z admitancji sieci Y(f) "
                "oraz wyznaczenia rezonansów i antyrezonansów"
            ),
            kamien="AB-2H",
        ),
    ),
    "supraharmoniczne": RodzajBiegu(
        analysis_type="supraharmoniczne",
        etykieta_pl="Supraharmoniczne (propagacja w paśmie)",
        typy_wykonawcze=("SUPRAHARMONICZNE",),
        solver_family=None,
        formula_set_version=None,
        standard_basis_ref=None,
        wymagane_opcje=(OPCJA_PASMO_SUPRAHARMONICZNE,),
        solver_nieobecny=SolverNieobecny(
            physics_domain=PhysicsDomain.SUPRAHARMONIC_FREQUENCY_DOMAIN,
            brak_pl=(
                "brak modeli emisji przekształtników E(f) z impedancją Z_conv(f), modeli "
                "elementów ważnych w paśmie kHz i propagacji I_s(f) → Y(f) → V(f)"
            ),
            kamien="AB-4H",
        ),
    ),
}

#: Rodzaje biegow zarejestrowane bez solvera — WYPROWADZONE z `RODZAJE_BIEGOW`.
RODZAJE_BIEGOW_BEZ_SOLVERA: frozenset[str] = frozenset(
    klucz for klucz, rodzaj in RODZAJE_BIEGOW.items() if rodzaj.solver_nieobecny is not None
)


def rodzaje_biegow() -> frozenset[str]:
    """Komplet `analysis_type` biegow dyspozytora: `RODZAJE_BIEGOW` + biegi V12.6."""
    return frozenset(RODZAJE_BIEGOW) | frozenset(BIEGI_V126)


def rodzaj_biegu_z_typu_wykonawczego(typ_wykonawczy: str) -> RodzajBiegu:
    """Rodzaj biegu dla czlonu `ExecutionAnalysisType` (KeyError = typ spoza tabeli)."""
    for rodzaj in RODZAJE_BIEGOW.values():
        if typ_wykonawczy in rodzaj.typy_wykonawcze:
            return rodzaj
    raise KeyError(f"Typ wykonawczy {typ_wykonawczy!r} nie ma rodzaju biegu w RODZAJE_BIEGOW")


class SolverNieobecnyError(ValueError):
    """Bieg rodzaju zarejestrowanego bez solvera — odmowa `domena.solver_nieobecny`.

    Komunikat niesie: rodzaj biegu, CZEGO brakuje, jakie wejscie przyjeto
    (os/pasmo z kontraktu) i KTORY kamien dostarcza solver. `execute_run` zapisuje
    go jako status FAILED z tym komunikatem — bez wyniku, bez liczb zastepczych.
    """

    kod = KOD_SOLVER_NIEOBECNY

    def __init__(self, analysis_type: str, *, wejscie_pl: str) -> None:
        rodzaj = RODZAJE_BIEGOW[analysis_type]
        nieobecny = rodzaj.solver_nieobecny
        if nieobecny is None:
            raise AssertionError(f"Rodzaj {analysis_type!r} ma solver — to nie jest odmowa")
        self.analysis_type = analysis_type
        self.kamien = nieobecny.kamien
        self.brak_pl = nieobecny.brak_pl
        super().__init__(
            f"[{KOD_SOLVER_NIEOBECNY}] Rodzaj biegu {analysis_type!r} "
            f"({rodzaj.etykieta_pl}) nie ma solvera: {nieobecny.brak_pl}. "
            f"Wejście przyjęte: {wejscie_pl}. Solver dostarcza kamień {nieobecny.kamien} "
            "programu A/B — do tego czasu bieg kończy się tą odmową, bez wyniku."
        )


class NieznanyRodzajBieguError(ValueError):
    """`analysis_type` biegu bez wpisu w rejestrze zdolnosci — odmowa nazwana.

    Fail-closed (karta AB-1a §0 R-1): rodzaj biegu, ktorego rejestr nie zna, NIE
    dostaje domeny `None` ani domeny „najblizszej" — wolajacy dostaje wyjatek z
    nazwa rodzaju, bo wynik bez domeny moglby zostac porownany z wynikiem innej
    fizyki.
    """

    def __init__(self, analysis_type: str) -> None:
        super().__init__(
            f"Rodzaj biegu {analysis_type!r} nie ma wpisu w rejestrze zdolnosci solverow "
            "(application/solvers/solver_capability_registry.py) — domena fizyczna "
            "nieznana, wynik nie moze zostac opisany."
        )
        self.analysis_type = analysis_type


def zdolnosci_biegu(analysis_type: str) -> list[SolverCapability]:
    """Zdolnosci rejestru, ktore obsluguje bieg o danym `analysis_type` dyspozytora.

    Bieg V12.6 (`"v126:<rodzaj>"`) — przez jawna tabele `BIEGI_V126`; pozostale —
    po polu `SolverCapability.analysis_type`. Pusta lista = rodzaj nieznany.
    """
    if analysis_type.startswith(PREFIKS_BIEGU_V126):
        klucz = BIEGI_V126.get(analysis_type)
        return [SOLVER_CAPABILITY_REGISTRY[klucz]] if klucz is not None else []
    # Rodzaj V12.6 BEZ prefiksu (np. "power_quality_harmonics") jest polem rejestru,
    # nie rodzajem biegu — dyspozytor go nie zna, wiec nie dostaje domeny.
    zdolnosci_v126 = set(BIEGI_V126.values())
    return [
        zdolnosc
        for zdolnosc in solver_capabilities_by_analysis_type(analysis_type)
        if zdolnosc.capability not in zdolnosci_v126
    ]


def domena_fizyczna_biegu(analysis_type: str) -> PhysicsDomain:
    """Domena fizyczna biegu wyprowadzona z rejestru (JEDYNE miejsce tego wiazania).

    Rodzaj obslugiwany przez kilka zdolnosci (np. `short_circuit_sn`: 3F/1F/2F/2F+Z,
    `PF`: NR/GS/FD) musi miec JEDNA domene we wszystkich — rozjazd konczy sie
    `AssertionError` (defekt rejestru, nie przypadek wejscia). Nieznany rodzaj —
    `NieznanyRodzajBieguError` (fail-closed).
    """
    rodzaj = RODZAJE_BIEGOW.get(analysis_type)
    if rodzaj is not None and rodzaj.solver_nieobecny is not None:
        # Rodzaj bez solvera (AB-1d_min): domena z wpisu rodzaju — wpisu zdolnosci
        # nie ma, bo nie ma solvera (para pilnowana testem: odmowa <=> brak zdolnosci).
        return rodzaj.solver_nieobecny.physics_domain
    zdolnosci = zdolnosci_biegu(analysis_type)
    if not zdolnosci:
        raise NieznanyRodzajBieguError(analysis_type)
    domeny = {zdolnosc.physics_domain for zdolnosc in zdolnosci}
    if len(domeny) != 1:
        raise AssertionError(
            f"Rodzaj biegu {analysis_type!r} ma w rejestrze rozne domeny: "
            f"{sorted(domena.value for domena in domeny)}"
        )
    return domeny.pop()


def domena_fizyczna_biegu_dict(analysis_type: str) -> dict[str, str]:
    """Pola koperty API biegu: `physics_domain` + `physics_domain_pl` (fail-closed)."""
    domena = domena_fizyczna_biegu(analysis_type)
    return {"physics_domain": domena.value, "physics_domain_pl": domena.label_pl}
