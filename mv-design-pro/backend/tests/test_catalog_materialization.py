"""
Tests for catalog materialization engine.

Covers:
- MaterializationContract completeness
- CatalogBinding validation
- Materialization of catalog items to solver_fields
- Transformer voltage_lv_kv enforcement
- Determinism (100× identical results)
- Error handling for missing items
"""

import pytest
from network_model.catalog.materialization import (
    materialization_hash,
    materialize_catalog_binding,
    validate_catalog_binding,
)
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.types import (
    MATERIALIZATION_CONTRACTS,
    CatalogBinding,
    CatalogNamespace,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def catalog() -> CatalogRepository:
    """Get default MV catalog."""
    return get_default_mv_catalog()


# ---------------------------------------------------------------------------
# MaterializationContract tests
# ---------------------------------------------------------------------------


class TestMaterializationContracts:
    """Test MaterializationContract coverage and correctness."""

    def test_all_namespaces_have_contracts(self) -> None:
        """Every CatalogNamespace (except CONVERTER/INVERTER) has a contract."""
        exempt = {"CONVERTER", "INVERTER"}
        for ns in CatalogNamespace:
            if ns.value in exempt:
                continue
            assert (
                ns.value in MATERIALIZATION_CONTRACTS
            ), f"Missing MaterializationContract for {ns.value}"

    def test_trafo_sn_nn_includes_voltage_fields(self) -> None:
        """TRAFO_SN_NN contract MUST include voltage_hv_kv and voltage_lv_kv."""
        contract = MATERIALIZATION_CONTRACTS["TRAFO_SN_NN"]
        assert "voltage_hv_kv" in contract.solver_fields
        assert "voltage_lv_kv" in contract.solver_fields

    def test_trafo_sn_nn_includes_uk_percent(self) -> None:
        """TRAFO_SN_NN contract MUST include uk_percent."""
        contract = MATERIALIZATION_CONTRACTS["TRAFO_SN_NN"]
        assert "uk_percent" in contract.solver_fields

    def test_kabel_sn_includes_impedance_fields(self) -> None:
        """KABEL_SN contract MUST include impedance fields."""
        contract = MATERIALIZATION_CONTRACTS["KABEL_SN"]
        assert "r_ohm_per_km" in contract.solver_fields
        assert "x_ohm_per_km" in contract.solver_fields
        assert "r0_ohm_per_km" in contract.solver_fields
        assert "x0_ohm_per_km" in contract.solver_fields
        assert "return_conductor_cross_section_mm2" in contract.solver_fields
        assert "return_conductor_r_ohm_per_km_20c" in contract.solver_fields
        assert "return_conductor_ith_1s_a" in contract.solver_fields

    def test_linia_sn_includes_zero_sequence_fields(self) -> None:
        """LINIA_SN contract MUST include zero-sequence impedance fields."""
        contract = MATERIALIZATION_CONTRACTS["LINIA_SN"]
        assert "r0_ohm_per_km" in contract.solver_fields
        assert "x0_ohm_per_km" in contract.solver_fields

    def test_contracts_have_nonempty_solver_fields(self) -> None:
        """Every contract has at least one solver field."""
        for ns, contract in MATERIALIZATION_CONTRACTS.items():
            assert len(contract.solver_fields) > 0, f"Contract for {ns} has empty solver_fields"

    def test_contracts_have_ui_fields(self) -> None:
        """Every contract has at least one UI field."""
        for ns, contract in MATERIALIZATION_CONTRACTS.items():
            assert len(contract.ui_fields) > 0, f"Contract for {ns} has empty ui_fields"


# ---------------------------------------------------------------------------
# CatalogBinding validation tests
# ---------------------------------------------------------------------------


class TestCatalogBindingValidation:
    """Test CatalogBinding validation."""

    def test_valid_binding_passes(self) -> None:
        """Valid binding has no errors."""
        binding_data = {
            "catalog_namespace": "KABEL_SN",
            "catalog_item_id": "test_id",
            "catalog_item_version": "2026.01",
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        }
        errors = validate_catalog_binding(binding_data)
        assert len(errors) == 0

    def test_missing_binding_fails(self) -> None:
        """None binding produces error."""
        errors = validate_catalog_binding(None, element_id="elem_1")
        assert len(errors) == 1
        assert errors[0].code == "catalog.binding_required"

    def test_missing_version_fails(self) -> None:
        """Binding without version produces error."""
        binding_data = {
            "catalog_namespace": "KABEL_SN",
            "catalog_item_id": "test_id",
            "catalog_item_version": "",
            "materialize": True,
        }
        errors = validate_catalog_binding(binding_data, require_version=True)
        assert any(e.code == "catalog.binding_version_missing" for e in errors)

    def test_materialize_false_fails(self) -> None:
        """Binding with materialize=False produces error."""
        binding_data = {
            "catalog_namespace": "KABEL_SN",
            "catalog_item_id": "test_id",
            "catalog_item_version": "2026.01",
            "materialize": False,
        }
        errors = validate_catalog_binding(binding_data)
        assert any(e.code == "catalog.materialization_required" for e in errors)

    def test_unknown_namespace_fails(self) -> None:
        """Unknown namespace produces error."""
        binding_data = {
            "catalog_namespace": "UNKNOWN_NS",
            "catalog_item_id": "test_id",
            "catalog_item_version": "2026.01",
            "materialize": True,
        }
        errors = validate_catalog_binding(binding_data)
        assert any(e.code == "catalog.unknown_namespace" for e in errors)


# ---------------------------------------------------------------------------
# Materialization execution tests
# ---------------------------------------------------------------------------


class TestMaterialization:
    """Test actual materialization of catalog items."""

    def test_materialize_cable_type(self, catalog: CatalogRepository) -> None:
        """Materialize a cable type and verify solver_fields."""
        cable_types = catalog.list_cable_types()
        if not cable_types:
            pytest.skip("No cable types in catalog")

        cable = cable_types[0]
        binding = CatalogBinding(
            catalog_namespace="KABEL_SN",
            catalog_item_id=cable.id,
            catalog_item_version="2026.01",
            materialize=True,
        )

        result = materialize_catalog_binding(binding, catalog)
        assert result.success
        assert "r_ohm_per_km" in result.solver_fields
        assert "x_ohm_per_km" in result.solver_fields
        assert result.solver_fields["r_ohm_per_km"] == cable.r_ohm_per_km
        assert "return_conductor_cross_section_mm2" in result.solver_fields

    def test_materialize_cable_return_conductor_from_catalog(self, catalog: CatalogRepository) -> None:
        """Zyla powrotna kabla jest materializowana z rekordu katalogowego."""
        binding = CatalogBinding(
            catalog_namespace="KABEL_SN",
            catalog_item_id="cable-enea-operator-na2xs2y-1x150",
            catalog_item_version="2026.01",
            materialize=True,
        )

        result = materialize_catalog_binding(binding, catalog)

        assert result.success
        assert result.solver_fields["trade_name"] == "NA2XS2Y 1x150/25"
        assert result.solver_fields["return_conductor_cross_section_mm2"] == 25
        assert result.solver_fields["return_conductor_material"] == "CU"
        assert result.solver_fields["return_conductor_r_ohm_per_km_20c"] == pytest.approx(
            17.241 / 25,
            rel=1e-6,
        )
        assert result.solver_fields["return_conductor_ith_1s_a"] == pytest.approx(
            143.0 * 25,
            rel=1e-6,
        )
        assert result.solver_fields["r0_ohm_per_km"] == pytest.approx(
            result.solver_fields["r_ohm_per_km"]
            + result.solver_fields["return_conductor_r_ohm_per_km_20c"],
            rel=1e-6,
        )
        assert result.solver_fields["x0_ohm_per_km"] == pytest.approx(
            3.0 * result.solver_fields["x_ohm_per_km"],
            rel=1e-6,
        )

    def test_materialize_overhead_line_zero_sequence_from_catalog(
        self, catalog: CatalogRepository
    ) -> None:
        """Linia napowietrzna materializuje katalogowe R0/X0."""
        binding = CatalogBinding(
            catalog_namespace="LINIA_SN",
            catalog_item_id="line-base-al-150",
            catalog_item_version="2026.01",
            materialize=True,
        )

        result = materialize_catalog_binding(binding, catalog)

        assert result.success
        assert result.solver_fields["r0_ohm_per_km"] == pytest.approx(
            3.0 * result.solver_fields["r_ohm_per_km"],
            rel=1e-6,
        )
        assert result.solver_fields["x0_ohm_per_km"] == pytest.approx(
            3.0 * result.solver_fields["x_ohm_per_km"],
            rel=1e-6,
        )

    def test_materialize_transformer_type(self, catalog: CatalogRepository) -> None:
        """Materialize a transformer and verify voltage_lv_kv in solver_fields."""
        trafo_types = catalog.list_transformer_types()
        if not trafo_types:
            pytest.skip("No transformer types in catalog")

        trafo = trafo_types[0]
        binding = CatalogBinding(
            catalog_namespace="TRAFO_SN_NN",
            catalog_item_id=trafo.id,
            catalog_item_version="2026.01",
            materialize=True,
        )

        result = materialize_catalog_binding(binding, catalog)
        assert result.success
        assert "voltage_lv_kv" in result.solver_fields
        assert "voltage_hv_kv" in result.solver_fields
        assert result.solver_fields["voltage_lv_kv"] == trafo.voltage_lv_kv
        assert result.solver_fields["voltage_hv_kv"] == trafo.voltage_hv_kv

    def test_materialize_nonexistent_item_fails(self, catalog: CatalogRepository) -> None:
        """Materialize with nonexistent item returns error."""
        binding = CatalogBinding(
            catalog_namespace="KABEL_SN",
            catalog_item_id="NONEXISTENT_ITEM_12345",
            catalog_item_version="2026.01",
            materialize=True,
        )

        result = materialize_catalog_binding(binding, catalog)
        assert not result.success
        assert result.error_code == "catalog.item_not_found"

    def test_materialize_false_returns_error(self, catalog: CatalogRepository) -> None:
        """Materialize with materialize=False returns error."""
        binding = CatalogBinding(
            catalog_namespace="KABEL_SN",
            catalog_item_id="test",
            catalog_item_version="2026.01",
            materialize=False,
        )

        result = materialize_catalog_binding(binding, catalog)
        assert not result.success
        assert result.error_code == "catalog.materialization_required"

    def test_materialize_audit_trail(self, catalog: CatalogRepository) -> None:
        """Materialization produces audit trail entries."""
        cable_types = catalog.list_cable_types()
        if not cable_types:
            pytest.skip("No cable types in catalog")

        cable = cable_types[0]
        binding = CatalogBinding(
            catalog_namespace="KABEL_SN",
            catalog_item_id=cable.id,
            catalog_item_version="2026.01",
            materialize=True,
        )

        result = materialize_catalog_binding(binding, catalog)
        assert result.success
        assert len(result.audit) > 0
        for entry in result.audit:
            assert entry.catalog_item_id == cable.id
            assert entry.catalog_item_version == "2026.01"
            assert entry.namespace == "KABEL_SN"


# ---------------------------------------------------------------------------
# Determinism tests
# ---------------------------------------------------------------------------


class TestMaterializationDeterminism:
    """Test that materialization is 100% deterministic."""

    def test_100x_same_result(self, catalog: CatalogRepository) -> None:
        """Same binding → identical result 100×."""
        cable_types = catalog.list_cable_types()
        if not cable_types:
            pytest.skip("No cable types in catalog")

        cable = cable_types[0]
        binding = CatalogBinding(
            catalog_namespace="KABEL_SN",
            catalog_item_id=cable.id,
            catalog_item_version="2026.01",
            materialize=True,
        )

        first_result = materialize_catalog_binding(binding, catalog)
        first_hash = materialization_hash(first_result.solver_fields)

        for i in range(99):
            result = materialize_catalog_binding(binding, catalog)
            h = materialization_hash(result.solver_fields)
            assert h == first_hash, f"Materialization not deterministic at iteration {i + 2}"

    def test_hash_stability(self) -> None:
        """Materialization hash is stable for known input."""
        fields = {"r_ohm_per_km": 0.12, "x_ohm_per_km": 0.39}
        h1 = materialization_hash(fields)
        h2 = materialization_hash(fields)
        assert h1 == h2


# ---------------------------------------------------------------------------
# Transformer voltage_lv_kv enforcement
# ---------------------------------------------------------------------------


class TestTransformerVoltageEnforcement:
    """Transformer types MUST have voltage_lv_kv > 0."""

    def test_all_catalog_transformers_have_voltage_lv(self, catalog: CatalogRepository) -> None:
        """Every transformer in catalog has voltage_lv_kv > 0."""
        for trafo in catalog.list_transformer_types():
            assert trafo.voltage_lv_kv > 0, (
                f"TransformerType '{trafo.id}' ({trafo.name}) "
                f"has voltage_lv_kv={trafo.voltage_lv_kv}"
            )

    def test_all_catalog_transformers_have_voltage_hv(self, catalog: CatalogRepository) -> None:
        """Every transformer in catalog has voltage_hv_kv > 0."""
        for trafo in catalog.list_transformer_types():
            assert trafo.voltage_hv_kv > 0, (
                f"TransformerType '{trafo.id}' ({trafo.name}) "
                f"has voltage_hv_kv={trafo.voltage_hv_kv}"
            )

    def test_materialized_trafo_has_voltage_lv(self, catalog: CatalogRepository) -> None:
        """Materialized transformer solver_fields include voltage_lv_kv."""
        for trafo in catalog.list_transformer_types()[:3]:
            binding = CatalogBinding(
                catalog_namespace="TRAFO_SN_NN",
                catalog_item_id=trafo.id,
                catalog_item_version="2026.01",
                materialize=True,
            )
            result = materialize_catalog_binding(binding, catalog)
            assert result.success
            assert result.solver_fields.get("voltage_lv_kv") == trafo.voltage_lv_kv
