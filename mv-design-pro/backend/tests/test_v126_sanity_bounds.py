"""Testy sanity-bounds analiz V12.6 (D-14 / K-08) + fix benchmarku (K-09)."""

from __future__ import annotations

from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126TransformerInput,
)


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
