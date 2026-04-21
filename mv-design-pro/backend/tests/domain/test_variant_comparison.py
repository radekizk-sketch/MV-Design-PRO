"""
Tests for variant comparison domain model.

Covers:
- Configuration delta computation
- Result metric delta computation
- Direction detection (INCREASED/DECREASED/UNCHANGED)
- Deterministic hash generation
- Topology summary construction
- Edge cases (None values, zero division)
"""

import pytest
from domain.variant_comparison import (
    DeltaDirection,
    VariantConfigDelta,
    VariantTopologySummary,
    build_variant_comparison,
    compute_config_deltas,
    compute_result_delta,
)


class TestComputeConfigDeltas:
    """Test configuration delta computation."""

    def test_no_differences(self):
        config = {"c_factor_max": 1.10, "base_mva": 100.0}
        deltas = compute_config_deltas(config, config)
        assert deltas == ()

    def test_single_difference(self):
        config_a = {"c_factor_max": 1.10, "base_mva": 100.0}
        config_b = {"c_factor_max": 1.05, "base_mva": 100.0}
        deltas = compute_config_deltas(config_a, config_b)
        assert len(deltas) == 1
        assert deltas[0].field_name == "c_factor_max"
        assert deltas[0].value_a == 1.10
        assert deltas[0].value_b == 1.05
        assert deltas[0].label_pl == "Współczynnik c (max)"

    def test_multiple_differences_sorted(self):
        config_a = {"c_factor_max": 1.10, "base_mva": 100.0, "tolerance": 1e-6}
        config_b = {"c_factor_max": 1.05, "base_mva": 200.0, "tolerance": 1e-6}
        deltas = compute_config_deltas(config_a, config_b)
        assert len(deltas) == 2
        # Sorted by field_name
        assert deltas[0].field_name == "base_mva"
        assert deltas[1].field_name == "c_factor_max"

    def test_extra_keys_in_b(self):
        config_a = {"c_factor_max": 1.10}
        config_b = {"c_factor_max": 1.10, "new_field": 42}
        deltas = compute_config_deltas(config_a, config_b)
        assert len(deltas) == 1
        assert deltas[0].field_name == "new_field"
        assert deltas[0].value_a is None
        assert deltas[0].value_b == 42


class TestComputeResultDelta:
    """Test result metric delta computation."""

    def test_increased(self):
        delta = compute_result_delta("ik3f_max_ka", "Ik'' maks", 10.0, 12.0, "kA")
        assert delta.direction == DeltaDirection.INCREASED
        assert delta.delta_abs == pytest.approx(2.0)
        assert delta.delta_percent == pytest.approx(20.0)

    def test_decreased(self):
        delta = compute_result_delta("v_min_pu", "U min", 0.95, 0.90, "pu")
        assert delta.direction == DeltaDirection.DECREASED
        assert delta.delta_abs == pytest.approx(0.05)

    def test_unchanged(self):
        delta = compute_result_delta("p_loss_kw", "Straty", 5.0, 5.0, "kW")
        assert delta.direction == DeltaDirection.UNCHANGED
        assert delta.delta_abs == 0.0

    def test_not_comparable_none_a(self):
        delta = compute_result_delta("ik3f_max_ka", "Ik''", None, 10.0, "kA")
        assert delta.direction == DeltaDirection.NOT_COMPARABLE
        assert delta.delta_abs is None

    def test_not_comparable_none_b(self):
        delta = compute_result_delta("ik3f_max_ka", "Ik''", 10.0, None, "kA")
        assert delta.direction == DeltaDirection.NOT_COMPARABLE

    def test_zero_division_percent(self):
        delta = compute_result_delta("p_loss_kw", "Straty", 0.0, 5.0, "kW")
        assert delta.direction == DeltaDirection.INCREASED
        assert delta.delta_percent is None  # can't divide by zero


class TestBuildVariantComparison:
    """Test full variant comparison building."""

    def test_build_with_all_sections(self):
        config_deltas = (VariantConfigDelta("c_factor_max", "Współczynnik c", 1.10, 1.05),)
        topology = VariantTopologySummary(
            elements_added=2,
            elements_removed=0,
            elements_modified=1,
            added_element_ids=("elem_a", "elem_b"),
            modified_element_ids=("elem_c",),
        )
        result_deltas = (compute_result_delta("ik3f_max_ka", "Ik'' maks", 10.0, 12.0, "kA"),)
        result = build_variant_comparison(
            case_a_id="case-1",
            case_b_id="case-2",
            case_a_name="Wariant bazowy",
            case_b_name="Wariant OZE",
            config_deltas=config_deltas,
            topology_summary=topology,
            result_deltas=result_deltas,
        )

        assert result.has_config_changes
        assert result.has_topology_changes
        assert result.has_result_changes
        assert result.comparison_hash != ""

    def test_deterministic_hash(self):
        config_deltas = (VariantConfigDelta("c_factor_max", "c", 1.1, 1.05),)
        topology = VariantTopologySummary()
        result_deltas = ()

        result_1 = build_variant_comparison(
            "a", "b", "A", "B", config_deltas, topology, result_deltas
        )
        result_2 = build_variant_comparison(
            "a", "b", "A", "B", config_deltas, topology, result_deltas
        )

        assert result_1.comparison_hash == result_2.comparison_hash

    def test_different_inputs_different_hash(self):
        topology = VariantTopologySummary()
        result_1 = build_variant_comparison(
            "a", "b", "A", "B", (VariantConfigDelta("c_factor_max", "c", 1.1, 1.05),), topology, ()
        )
        result_2 = build_variant_comparison(
            "a", "b", "A", "B", (VariantConfigDelta("c_factor_max", "c", 1.1, 1.10),), topology, ()
        )

        assert result_1.comparison_hash != result_2.comparison_hash

    def test_empty_comparison(self):
        result = build_variant_comparison("a", "b", "A", "B", (), VariantTopologySummary(), ())
        assert not result.has_config_changes
        assert not result.has_topology_changes
        assert not result.has_result_changes

    def test_to_dict_completeness(self):
        result = build_variant_comparison("a", "b", "A", "B", (), VariantTopologySummary(), ())
        d = result.to_dict()
        assert "case_a_id" in d
        assert "case_b_id" in d
        assert "comparison_hash" in d
        assert "has_config_changes" in d
        assert "has_topology_changes" in d
        assert "has_result_changes" in d
