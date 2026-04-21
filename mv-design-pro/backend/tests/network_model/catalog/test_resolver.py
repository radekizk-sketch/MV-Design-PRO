"""
Contract tests for parameter precedence resolver.

Tests canonical precedence rules:
- Line/Cable: impedance_override > type_ref > instance
- Transformer: type_ref > instance

Tests backward compatibility (no type_ref = instance params).
Tests validation (type_ref not found = error).
"""

import pytest
from network_model.catalog import (
    CableType,
    CatalogRepository,
    LineType,
    ParameterSource,
    TransformerType,
    TypeNotFoundError,
    resolve_line_params,
    resolve_transformer_params,
)

# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture
def catalog_with_types():
    """Catalog with sample line, cable, and transformer types."""
    line_types = {
        "line_100": LineType(
            id="line_100",
            name="100mm2 Overhead Line",
            r_ohm_per_km=0.3,
            x_ohm_per_km=0.4,
            b_us_per_km=2.8,
            rated_current_a=300.0,
        ),
    }
    cable_types = {
        "cable_150": CableType(
            id="cable_150",
            name="150mm2 Cable",
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.08,
            c_nf_per_km=250.0,  # Converts to b_us_per_km
            rated_current_a=400.0,
        ),
    }
    transformer_types = {
        "trafo_630": TransformerType(
            id="trafo_630",
            name="630 kVA Transformer",
            rated_power_mva=0.63,
            voltage_hv_kv=20.0,
            voltage_lv_kv=0.4,
            uk_percent=4.0,
            pk_kw=6.5,
            i0_percent=1.2,
            p0_kw=1.4,
            vector_group="Dyn11",
            manufacturer=None,
        ),
    }
    return CatalogRepository(
        line_types=line_types,
        cable_types=cable_types,
        transformer_types=transformer_types,
        switch_equipment_types={},
        converter_types={},
        inverter_types={},
    )


@pytest.fixture
def empty_catalog():
    """Empty catalog for testing type_ref not found."""
    return CatalogRepository(
        line_types={},
        cable_types={},
        transformer_types={},
        switch_equipment_types={},
        converter_types={},
        inverter_types={},
    )


# ============================================================================
# LINE PRECEDENCE TESTS
# ============================================================================


def test_line_precedence_override_wins(catalog_with_types):
    """Test: impedance_override has highest precedence for Line."""
    result = resolve_line_params(
        type_ref="line_100",
        is_cable=False,
        impedance_override={
            "r_total_ohm": 1.0,
            "x_total_ohm": 2.0,
            "b_total_us": 3.0,
        },
        length_km=10.0,
        instance_r_ohm_per_km=0.5,
        instance_x_ohm_per_km=0.6,
        instance_b_us_per_km=1.0,
        instance_rated_current_a=250.0,
        catalog=catalog_with_types,
    )
    assert result.source == ParameterSource.OVERRIDE
    assert result.r_ohm_per_km == 0.1  # 1.0 / 10.0
    assert result.x_ohm_per_km == 0.2  # 2.0 / 10.0
    assert result.b_us_per_km == 0.3  # 3.0 / 10.0
    assert result.rated_current_a == 250.0  # instance value


def test_line_precedence_type_ref_wins(catalog_with_types):
    """Test: type_ref has precedence over instance params for Line."""
    result = resolve_line_params(
        type_ref="line_100",
        is_cable=False,
        impedance_override=None,
        length_km=10.0,
        instance_r_ohm_per_km=0.5,
        instance_x_ohm_per_km=0.6,
        instance_b_us_per_km=1.0,
        instance_rated_current_a=250.0,
        catalog=catalog_with_types,
    )
    assert result.source == ParameterSource.TYPE_REF
    assert result.r_ohm_per_km == 0.3  # from catalog
    assert result.x_ohm_per_km == 0.4  # from catalog
    assert result.b_us_per_km == 2.8  # from catalog
    assert result.rated_current_a == 300.0  # from catalog


def test_line_precedence_instance_fallback(catalog_with_types):
    """Test: instance params used when no override or type_ref."""
    result = resolve_line_params(
        type_ref=None,
        is_cable=False,
        impedance_override=None,
        length_km=10.0,
        instance_r_ohm_per_km=0.5,
        instance_x_ohm_per_km=0.6,
        instance_b_us_per_km=1.0,
        instance_rated_current_a=250.0,
        catalog=catalog_with_types,
    )
    assert result.source == ParameterSource.INSTANCE
    assert result.r_ohm_per_km == 0.5
    assert result.x_ohm_per_km == 0.6
    assert result.b_us_per_km == 1.0
    assert result.rated_current_a == 250.0


def test_line_type_not_found_raises_error(empty_catalog):
    """Test: TypeNotFoundError raised when type_ref not in catalog."""
    with pytest.raises(TypeNotFoundError) as exc_info:
        resolve_line_params(
            type_ref="nonexistent_line",
            is_cable=False,
            impedance_override=None,
            length_km=10.0,
            instance_r_ohm_per_km=0.5,
            instance_x_ohm_per_km=0.6,
            instance_b_us_per_km=1.0,
            instance_rated_current_a=250.0,
            catalog=empty_catalog,
        )
    assert exc_info.value.type_ref == "nonexistent_line"
    assert exc_info.value.equipment_type == "Line"


# ============================================================================
# CABLE PRECEDENCE TESTS
# ============================================================================


def test_cable_precedence_override_wins(catalog_with_types):
    """Test: impedance_override has highest precedence for Cable."""
    result = resolve_line_params(
        type_ref="cable_150",
        is_cable=True,
        impedance_override={
            "r_total_ohm": 0.5,
            "x_total_ohm": 0.1,
            "b_total_us": 5.0,
        },
        length_km=5.0,
        instance_r_ohm_per_km=0.3,
        instance_x_ohm_per_km=0.1,
        instance_b_us_per_km=2.0,
        instance_rated_current_a=350.0,
        catalog=catalog_with_types,
    )
    assert result.source == ParameterSource.OVERRIDE
    assert result.r_ohm_per_km == 0.1  # 0.5 / 5.0
    assert result.x_ohm_per_km == 0.02  # 0.1 / 5.0
    assert result.b_us_per_km == 1.0  # 5.0 / 5.0


def test_cable_precedence_type_ref_wins(catalog_with_types):
    """Test: type_ref has precedence over instance params for Cable."""
    result = resolve_line_params(
        type_ref="cable_150",
        is_cable=True,
        impedance_override=None,
        length_km=5.0,
        instance_r_ohm_per_km=0.3,
        instance_x_ohm_per_km=0.1,
        instance_b_us_per_km=2.0,
        instance_rated_current_a=350.0,
        catalog=catalog_with_types,
    )
    assert result.source == ParameterSource.TYPE_REF
    assert result.r_ohm_per_km == 0.2  # from catalog
    assert result.x_ohm_per_km == 0.08  # from catalog
    # CableType converts c_nf_per_km=250.0 to b_us_per_km
    assert result.b_us_per_km == pytest.approx(250.0 * 2 * 3.14159 * 50 / 1000, rel=0.01)
    assert result.rated_current_a == 400.0  # from catalog


def test_cable_type_not_found_raises_error(empty_catalog):
    """Test: TypeNotFoundError raised when cable type_ref not in catalog."""
    with pytest.raises(TypeNotFoundError) as exc_info:
        resolve_line_params(
            type_ref="nonexistent_cable",
            is_cable=True,
            impedance_override=None,
            length_km=5.0,
            instance_r_ohm_per_km=0.3,
            instance_x_ohm_per_km=0.1,
            instance_b_us_per_km=2.0,
            instance_rated_current_a=350.0,
            catalog=empty_catalog,
        )
    assert exc_info.value.type_ref == "nonexistent_cable"
    assert exc_info.value.equipment_type == "Cable"


# ============================================================================
# TRANSFORMER PRECEDENCE TESTS
# ============================================================================


def test_transformer_precedence_type_ref_wins(catalog_with_types):
    """Test: type_ref has precedence over instance params for Transformer."""
    result = resolve_transformer_params(
        type_ref="trafo_630",
        instance_rated_power_mva=0.4,
        instance_voltage_hv_kv=10.0,
        instance_voltage_lv_kv=0.4,
        instance_uk_percent=5.0,
        instance_pk_kw=5.0,
        instance_i0_percent=2.0,
        instance_p0_kw=2.0,
        instance_vector_group="Yy0",
        catalog=catalog_with_types,
    )
    assert result.source == ParameterSource.TYPE_REF
    assert result.rated_power_mva == 0.63  # from catalog
    assert result.voltage_hv_kv == 20.0  # from catalog
    assert result.voltage_lv_kv == 0.4  # from catalog
    assert result.uk_percent == 4.0  # from catalog
    assert result.pk_kw == 6.5  # from catalog
    assert result.i0_percent == 1.2  # from catalog
    assert result.p0_kw == 1.4  # from catalog
    assert result.vector_group == "Dyn11"  # from catalog


def test_transformer_precedence_instance_fallback(catalog_with_types):
    """Test: instance params used when no type_ref."""
    result = resolve_transformer_params(
        type_ref=None,
        instance_rated_power_mva=0.4,
        instance_voltage_hv_kv=10.0,
        instance_voltage_lv_kv=0.4,
        instance_uk_percent=5.0,
        instance_pk_kw=5.0,
        instance_i0_percent=2.0,
        instance_p0_kw=2.0,
        instance_vector_group="Yy0",
        catalog=catalog_with_types,
    )
    assert result.source == ParameterSource.INSTANCE
    assert result.rated_power_mva == 0.4
    assert result.voltage_hv_kv == 10.0
    assert result.voltage_lv_kv == 0.4
    assert result.uk_percent == 5.0
    assert result.pk_kw == 5.0
    assert result.i0_percent == 2.0
    assert result.p0_kw == 2.0
    assert result.vector_group == "Yy0"


def test_transformer_type_not_found_raises_error(empty_catalog):
    """Test: TypeNotFoundError raised when transformer type_ref not in catalog."""
    with pytest.raises(TypeNotFoundError) as exc_info:
        resolve_transformer_params(
            type_ref="nonexistent_trafo",
            instance_rated_power_mva=0.4,
            instance_voltage_hv_kv=10.0,
            instance_voltage_lv_kv=0.4,
            instance_uk_percent=5.0,
            instance_pk_kw=5.0,
            instance_i0_percent=2.0,
            instance_p0_kw=2.0,
            instance_vector_group="Yy0",
            catalog=empty_catalog,
        )
    assert exc_info.value.type_ref == "nonexistent_trafo"
    assert exc_info.value.equipment_type == "Transformer"


# ============================================================================
# BACKWARD COMPATIBILITY TEST (NO NUMERIC CHANGE)
# ============================================================================


def test_no_type_ref_preserves_legacy_behavior():
    """
    Test: Models without type_ref produce identical results (backward compatibility).

    This is the "no numeric change" regression test. Models created before
    type_ref feature must behave identically.
    """
    # Legacy line (no type_ref, no override)
    legacy_line_result = resolve_line_params(
        type_ref=None,
        is_cable=False,
        impedance_override=None,
        length_km=12.5,
        instance_r_ohm_per_km=0.5,
        instance_x_ohm_per_km=0.35,
        instance_b_us_per_km=2.7,
        instance_rated_current_a=280.0,
        catalog=None,
    )
    assert legacy_line_result.source == ParameterSource.INSTANCE
    assert legacy_line_result.r_ohm_per_km == 0.5
    assert legacy_line_result.x_ohm_per_km == 0.35
    assert legacy_line_result.b_us_per_km == 2.7
    assert legacy_line_result.rated_current_a == 280.0

    # Legacy transformer (no type_ref)
    legacy_trafo_result = resolve_transformer_params(
        type_ref=None,
        instance_rated_power_mva=0.63,
        instance_voltage_hv_kv=20.0,
        instance_voltage_lv_kv=0.4,
        instance_uk_percent=4.5,
        instance_pk_kw=7.0,
        instance_i0_percent=1.5,
        instance_p0_kw=1.8,
        instance_vector_group="Dyn11",
        catalog=None,
    )
    assert legacy_trafo_result.source == ParameterSource.INSTANCE
    assert legacy_trafo_result.rated_power_mva == 0.63
    assert legacy_trafo_result.voltage_hv_kv == 20.0
    assert legacy_trafo_result.voltage_lv_kv == 0.4
    assert legacy_trafo_result.uk_percent == 4.5
    assert legacy_trafo_result.pk_kw == 7.0


# ============================================================================
# DETERMINISM TESTS
# ============================================================================


def test_resolve_line_params_is_deterministic(catalog_with_types):
    """Test: resolve_line_params produces identical results on multiple calls."""
    for _ in range(3):
        result = resolve_line_params(
            type_ref="line_100",
            is_cable=False,
            impedance_override=None,
            length_km=10.0,
            instance_r_ohm_per_km=0.5,
            instance_x_ohm_per_km=0.6,
            instance_b_us_per_km=1.0,
            instance_rated_current_a=250.0,
            catalog=catalog_with_types,
        )
        assert result.source == ParameterSource.TYPE_REF
        assert result.r_ohm_per_km == 0.3
        assert result.x_ohm_per_km == 0.4
        assert result.b_us_per_km == 2.8
        assert result.rated_current_a == 300.0


def test_resolve_transformer_params_is_deterministic(catalog_with_types):
    """Test: resolve_transformer_params produces identical results on multiple calls."""
    for _ in range(3):
        result = resolve_transformer_params(
            type_ref="trafo_630",
            instance_rated_power_mva=0.4,
            instance_voltage_hv_kv=10.0,
            instance_voltage_lv_kv=0.4,
            instance_uk_percent=5.0,
            instance_pk_kw=5.0,
            instance_i0_percent=2.0,
            instance_p0_kw=2.0,
            instance_vector_group="Yy0",
            catalog=catalog_with_types,
        )
        assert result.source == ParameterSource.TYPE_REF
        assert result.rated_power_mva == 0.63
        assert result.voltage_hv_kv == 20.0
        assert result.voltage_lv_kv == 0.4
        assert result.uk_percent == 4.0
        assert result.pk_kw == 6.5
