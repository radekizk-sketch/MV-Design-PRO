"""Testy sanity-bounds analiz V12.6 (D-14 / K-08) + fix benchmarku (K-09)."""

from __future__ import annotations

from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126EarthingInput,
    V126HarmonicSourceInput,
    V126InsulationInput,
    V126MotorInput,
    V126TransformerInput,
)

_VALID_STATUSES = {"zweryfikowany", "poza zakresem wiarygodności", "dane niekompletne"}


def _input() -> V126AcademicInput:
    return V126AcademicInput(
        buses=[
            V126BusInput(
                ref="B1", name="GPZ", nominal_kv=15.0, fault_level_mva=250.0, customer_count=0
            ),
            V126BusInput(
                ref="B2",
                name="S1",
                nominal_kv=15.0,
                load_mw=1.2,
                customer_count=150,
                fault_level_mva=80.0,
            ),
        ],
        branches=[
            V126BranchInput(
                ref="K1",
                from_bus_ref="B1",
                to_bus_ref="B2",
                kind="cable",
                length_km=4.0,
                r_ohm_per_km=0.206,
                x_ohm_per_km=0.118,
                b_siemens_per_km=2.5e-6,
                ampacity_a=260.0,
            )
        ],
        transformers=[
            V126TransformerInput(
                ref="TR1",
                hv_bus_ref="B1",
                lv_bus_ref="B2",
                sn_mva=16.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=10.5,
                pk_kw=90.0,
            )
        ],
    )


def _run(analysis: V126AnalysisType, params: dict | None = None) -> dict:
    model = _input()
    if params is not None:
        model = model.model_copy(update={"parameters": {**model.parameters, **params}})
    return V126AcademicSolver().run(analysis, model)["result"]


class TestV126SanityBlocks:
    def test_reliability_has_sanity_block_credible(self) -> None:
        res = _run(V126AnalysisType.RELIABILITY_CONTINGENCY)
        assert "sanity" in res
        assert res["sanity"]["status"] in {"zweryfikowany", "poza zakresem wiarygodności"}
        assert res["sanity"]["checks_total"] >= 4

    def test_opf_has_sanity_block(self) -> None:
        res = _run(V126AnalysisType.OPF_LOSS_LCC)
        assert "sanity" in res
        assert res["sanity"]["status"] == "zweryfikowany"  # straty nieujemne, skończone

    def test_uncertainty_has_sanity_block(self) -> None:
        res = _run(V126AnalysisType.UNCERTAINTY_SENSITIVITY)
        assert "sanity" in res
        assert res["sanity"]["status"] in {
            "zweryfikowany",
            "poza zakresem wiarygodności",
            "dane niekompletne",
        }


class TestBenchmarkSilentFalseFix:
    def test_no_references_is_incomplete_not_fake_pass(self) -> None:
        # K-09: bez referencji NIE może zwracać PASS (cichy fałsz).
        res = _run(V126AnalysisType.BENCHMARK_VALIDATION)
        assert res["status"] == "dane niekompletne"
        assert res["references_provided"] is False
        assert res["validation_report"] == []

    def test_with_real_references_validates(self) -> None:
        refs = [
            {
                "network": "IEEE_9_bus",
                "test": "PF",
                "reference": 1.04,
                "calculated": 1.041,
                "tolerance_percent": 0.5,
            },
            {
                "network": "IEEE_14_bus",
                "test": "PF",
                "reference": 1.06,
                "calculated": 1.10,
                "tolerance_percent": 0.5,
            },
        ]
        res = _run(V126AnalysisType.BENCHMARK_VALIDATION, {"benchmark_references": refs})
        assert res["references_provided"] is True
        # pierwszy w tolerancji (PASS), drugi poza (FAIL) → ogólnie FAIL
        assert res["status"] == "FAIL"
        statuses = {row["network"]: row["status"] for row in res["validation_report"]}
        assert statuses["IEEE_9_bus"] == "PASS"
        assert statuses["IEEE_14_bus"] == "FAIL"

    def test_all_references_in_tolerance_pass(self) -> None:
        refs = [
            {
                "network": "CIGRE_MV",
                "test": "PF",
                "reference": 1.0,
                "calculated": 1.002,
                "tolerance_percent": 0.5,
            }
        ]
        res = _run(V126AnalysisType.BENCHMARK_VALIDATION, {"benchmark_references": refs})
        assert res["status"] == "PASS"


def _run_model(analysis: V126AnalysisType, model: V126AcademicInput) -> dict:
    return V126AcademicSolver().run(analysis, model)["result"]


class TestV126SanityCoverageAllAnalyses:
    """K-08: każda analiza V12.6 ma blok wiarygodności (sanity) — kompletna powłoka."""

    ALWAYS_COMPLETE = [
        V126AnalysisType.EARTH_FAULT_DETECTION,
        V126AnalysisType.TRANSIENT_TRV,
    ]
    NEEDS_INPUT = [
        V126AnalysisType.POWER_QUALITY_HARMONICS,
        V126AnalysisType.EARTHING_SAFETY,
        V126AnalysisType.INSULATION_COORDINATION,
        V126AnalysisType.MOTOR_STARTING,
    ]
    #: Analiza WSTRZYMANA (karta QU-FABRYKACJA) — melduje „dane niekompletne"
    #: NIEZALEŻNIE od wejścia, bo model nie niesie ani mocy zwarciowej węzłów,
    #: ani zdolności wytwórczej mocy biernej, a poprzednie wzory zastępowały te
    #: dane współczynnikami bez pokrycia. Zdjęta z ALWAYS_COMPLETE świadomie:
    #: „zweryfikowany" nad wynikiem, którego nie ma, byłby cichym fałszem —
    #: dokładnie tym, przed czym broni `test_missing_inputs_report_incomplete_not_fake_pass`.
    ALWAYS_INCOMPLETE = [
        V126AnalysisType.VOLTAGE_STABILITY,
    ]

    def test_every_analysis_has_sanity_block(self) -> None:
        for analysis in [
            *self.ALWAYS_COMPLETE,
            *self.ALWAYS_INCOMPLETE,
            *self.NEEDS_INPUT,
            V126AnalysisType.HOSTING_CAPACITY,
        ]:
            params = (
                {"hosting_monte_carlo_n": 30}
                if analysis == V126AnalysisType.HOSTING_CAPACITY
                else None
            )
            res = _run(analysis, params)
            assert "sanity" in res, f"{analysis.value} bez bloku sanity"
            assert res["sanity"]["status"] in _VALID_STATUSES
            assert res["sanity"]["checks_total"] >= 1

    def test_always_complete_analyses_are_verified(self) -> None:
        for analysis in self.ALWAYS_COMPLETE:
            res = _run(analysis)
            assert res["sanity"]["status"] == "zweryfikowany", analysis.value

    def test_always_incomplete_analyses_never_fake_verification(self) -> None:
        """Analiza wstrzymana melduje brak, a nie „zweryfikowany" nad pustką.

        Bez tego pinu przywrócenie dowolnego zaszytego współczynnika w
        `_voltage_stability` wróciłoby ze statusem „zweryfikowany" i nikt by tego
        nie zauważył — bo blok wiarygodności ocenia liczby, a nie ich rodowód.
        """
        for analysis in self.ALWAYS_INCOMPLETE:
            res = _run(analysis)
            assert res["sanity"]["status"] == "dane niekompletne", analysis.value
            assert res["sanity"]["checks_passed"] == 0, analysis.value
            assert res["sanity"]["checks_total"] >= 1, analysis.value

    def test_hosting_capacity_verified_and_within_scan(self) -> None:
        res = _run(V126AnalysisType.HOSTING_CAPACITY, {"hosting_monte_carlo_n": 30})
        assert res["sanity"]["status"] == "zweryfikowany"

    def test_missing_inputs_report_incomplete_not_fake_pass(self) -> None:
        # Bez danych wejściowych analiza NIE może udawać „zweryfikowany" (cichy fałsz).
        for analysis in self.NEEDS_INPUT:
            res = _run(analysis)
            assert res["sanity"]["status"] == "dane niekompletne", analysis.value
            assert res["sanity"]["checks_passed"] == 0


class TestV126SanityWithRealInputs:
    """Z poprawnymi danymi wejściowymi analizy raportują „zweryfikowany"."""

    def test_power_quality_with_harmonic_sources_verified(self) -> None:
        model = _input().model_copy(
            update={
                "harmonic_sources": [
                    V126HarmonicSourceInput(
                        bus_ref="B2",
                        source_ref="HS1",
                        base_current_a=50.0,
                        spectrum_percent={5: 20.0, 7: 14.0, 11: 9.0},
                    )
                ]
            }
        )
        res = _run_model(V126AnalysisType.POWER_QUALITY_HARMONICS, model)
        assert res["sanity"]["status"] == "zweryfikowany"
        assert res["sanity"]["checks_passed"] == res["sanity"]["checks_total"]

    def test_earthing_with_data_verified(self) -> None:
        model = _input().model_copy(update={"earthing": V126EarthingInput()})
        res = _run_model(V126AnalysisType.EARTHING_SAFETY, model)
        assert res["sanity"]["status"] == "zweryfikowany"
        assert res["r_g_ohm"] >= 0.0 and res["gpr_kv"] >= 0.0

    def test_insulation_with_arrester_verified(self) -> None:
        model = _input().model_copy(
            update={"insulation": [V126InsulationInput(location_bus_ref="B2", u_m_kv=17.5)]}
        )
        res = _run_model(V126AnalysisType.INSULATION_COORDINATION, model)
        assert res["sanity"]["status"] == "zweryfikowany"

    def test_motor_starting_credible_motor_verified(self) -> None:
        # Silnik 15 kV dopasowany do szyny B2 (15 kV) — zapad napięcia w granicach wiarygodności.
        model = _input().model_copy(
            update={
                "motors": [
                    V126MotorInput(ref="M1", bus_ref="B2", rated_kw=500.0, rated_voltage_kv=15.0)
                ]
            }
        )
        res = _run_model(V126AnalysisType.MOTOR_STARTING, model)
        assert res["sanity"]["status"] == "zweryfikowany"
        for row in res["motors"]:
            assert 0.0 <= row["voltage_dip_percent"] <= 100.0

    def test_sanity_block_is_deterministic(self) -> None:
        model = _input().model_copy(
            update={
                "harmonic_sources": [
                    V126HarmonicSourceInput(
                        bus_ref="B2",
                        source_ref="HS1",
                        base_current_a=50.0,
                        spectrum_percent={5: 20.0},
                    )
                ]
            }
        )
        first = _run_model(V126AnalysisType.POWER_QUALITY_HARMONICS, model)["sanity"]
        second = _run_model(V126AnalysisType.POWER_QUALITY_HARMONICS, model)["sanity"]
        assert first == second
