"""Station field validation tests — RUN #3G §2.

Tests for station field completeness, device requirements, catalog refs,
protection bindings, and PV/BESS variant A/B enforcement.

BINDING: any failure blocks merge.
"""

import pytest
from domain.readiness import (
    ReadinessAreaV1,
    ReadinessGateError,
    ReadinessIssueV1,
    ReadinessPriority,
    build_readiness_profile,
    require_pv_bess_transformer_rule,
)
from domain.station_field_validation import (
    DeviceBindingV1,
    FieldDeviceV1,
    StationFieldV1,
    StationValidationInputV1,
    validate_pv_bess_variant_a,
    validate_pv_bess_variant_b,
    validate_station_fields,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_device(
    device_id: str, device_type: str, catalog_ref: str | None = "cat_001"
) -> FieldDeviceV1:
    return FieldDeviceV1(
        device_id=device_id,
        aparat_type=device_type,
        device_type=device_type,
        catalog_ref=catalog_ref,
    )


def _make_field(
    field_id: str,
    field_role: str,
    devices: tuple[FieldDeviceV1, ...] = (),
    bindings: tuple[DeviceBindingV1, ...] = (),
) -> StationFieldV1:
    return StationFieldV1(
        field_id=field_id,
        field_name=f"Pole {field_id}",
        pole_type="POLE_LINIOWE_SN",
        field_role=field_role,
        station_id="st_001",
        devices=devices,
        bindings=bindings,
    )


def _make_binding(
    source_id: str,
    target_id: str,
    binding_type: str = "RELAY_TO_CB",
) -> DeviceBindingV1:
    return DeviceBindingV1(
        binding_id=f"bind_{source_id}_{target_id}",
        source_device_id=source_id,
        source_device_type="RELAY",
        target_device_id=target_id,
        target_device_type="CB",
        binding_type=binding_type,
    )


# ===========================================================================
# Station-level validation
# ===========================================================================


class TestStationWithNnBusRequiresTransformer:
    """Station with nN bus MUST have transformer field."""

    def test_nn_bus_without_transformer_fails(self) -> None:
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="RPZ Test",
            has_nn_bus=True,
            has_transformer_field=False,
        )
        issues = validate_station_fields(station)
        codes = [i.code for i in issues]
        assert "station.nn_without_transformer" in codes

    def test_nn_bus_with_transformer_passes(self) -> None:
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="RPZ Test",
            has_nn_bus=True,
            has_transformer_field=True,
        )
        issues = validate_station_fields(station)
        codes = [i.code for i in issues]
        assert "station.nn_without_transformer" not in codes

    def test_no_nn_bus_passes(self) -> None:
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="RPZ Test",
            has_nn_bus=False,
            has_transformer_field=False,
        )
        issues = validate_station_fields(station)
        codes = [i.code for i in issues]
        assert "station.nn_without_transformer" not in codes


# ===========================================================================
# Field device requirement validation
# ===========================================================================


class TestFieldDeviceRequirements:
    """Fields must have required devices per field role."""

    def test_line_in_requires_cb_and_ds(self) -> None:
        field = _make_field(
            "f_001",
            "LINE_IN",
            devices=(),  # No devices
        )
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field,),
        )
        issues = validate_station_fields(station)
        codes = [i.code for i in issues]
        assert "field.device_missing.cb" in codes
        assert "field.device_missing.ds" in codes

    def test_line_in_complete_passes(self) -> None:
        field = _make_field(
            "f_001",
            "LINE_IN",
            devices=(
                _make_device("dev_cb", "CB"),
                _make_device("dev_ds", "DS"),
            ),
        )
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field,),
        )
        issues = validate_station_fields(station)
        device_missing = [i for i in issues if i.code.startswith("field.device_missing.")]
        assert len(device_missing) == 0

    def test_pv_sn_requires_cb_ct_relay(self) -> None:
        field = _make_field("f_pv", "PV_SN", devices=())
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field,),
        )
        issues = validate_station_fields(station)
        codes = [i.code for i in issues]
        assert "field.device_missing.cb" in codes
        assert "field.device_missing.ct" in codes
        assert "field.device_missing.relay" in codes

    def test_main_nn_requires_acb(self) -> None:
        field = _make_field("f_nn", "MAIN_NN", devices=())
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field,),
        )
        issues = validate_station_fields(station)
        codes = [i.code for i in issues]
        assert "field.device_missing.acb" in codes

    def test_feeder_nn_requires_fuse(self) -> None:
        field = _make_field("f_feeder", "FEEDER_NN", devices=())
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field,),
        )
        issues = validate_station_fields(station)
        codes = [i.code for i in issues]
        assert "field.device_missing.fuse" in codes


# ===========================================================================
# Catalog ref validation
# ===========================================================================


class TestCatalogRefRequired:
    """All devices must have catalogRef."""

    def test_device_without_catalog_fails(self) -> None:
        field = _make_field(
            "f_001",
            "LINE_IN",
            devices=(
                _make_device("dev_cb", "CB", catalog_ref=None),
                _make_device("dev_ds", "DS", catalog_ref="cat_002"),
            ),
        )
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field,),
        )
        issues = validate_station_fields(station)
        catalog_issues = [i for i in issues if i.code == "catalog.ref_missing"]
        assert len(catalog_issues) == 1
        assert catalog_issues[0].element_id == "dev_cb"

    def test_all_devices_with_catalog_passes(self) -> None:
        field = _make_field(
            "f_001",
            "LINE_IN",
            devices=(
                _make_device("dev_cb", "CB", catalog_ref="cat_001"),
                _make_device("dev_ds", "DS", catalog_ref="cat_002"),
            ),
        )
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field,),
        )
        issues = validate_station_fields(station)
        catalog_issues = [i for i in issues if i.code == "catalog.ref_missing"]
        assert len(catalog_issues) == 0


# ===========================================================================
# Protection binding validation
# ===========================================================================


class TestProtectionBindings:
    """CB + Relay without binding → protection.binding_missing."""

    def test_cb_relay_without_binding_fails(self) -> None:
        field = _make_field(
            "f_001",
            "PV_SN",
            devices=(
                _make_device("dev_cb", "CB"),
                _make_device("dev_ct", "CT"),
                _make_device("dev_relay", "RELAY"),
            ),
            bindings=(),  # No binding
        )
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field,),
        )
        issues = validate_station_fields(station)
        prot_issues = [i for i in issues if i.code == "protection.binding_missing"]
        assert len(prot_issues) == 1

    def test_cb_relay_with_binding_passes(self) -> None:
        field = _make_field(
            "f_001",
            "PV_SN",
            devices=(
                _make_device("dev_cb", "CB"),
                _make_device("dev_ct", "CT"),
                _make_device("dev_relay", "RELAY"),
            ),
            bindings=(_make_binding("dev_relay", "dev_cb"),),
        )
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field,),
        )
        issues = validate_station_fields(station)
        prot_issues = [i for i in issues if i.code == "protection.binding_missing"]
        assert len(prot_issues) == 0


# ===========================================================================
# PV/BESS variant validation
# ===========================================================================


class TestPvBessVariantA:
    """Variant A (nn_side) requires station transformer."""

    def test_variant_a_without_transformer_fails(self) -> None:
        issues = validate_pv_bess_variant_a(
            generator_id="gen_001",
            generator_name="PV 100kW",
            station_id="st_001",
            station_has_transformer=False,
        )
        assert len(issues) == 1
        assert issues[0].code == "generator.nn_variant_requires_station_transformer"

    def test_variant_a_with_transformer_passes(self) -> None:
        issues = validate_pv_bess_variant_a(
            generator_id="gen_001",
            generator_name="PV 100kW",
            station_id="st_001",
            station_has_transformer=True,
        )
        assert len(issues) == 0

    def test_variant_a_no_station_passes(self) -> None:
        """No station_id → handled by generator_validation, not here."""
        issues = validate_pv_bess_variant_a(
            generator_id="gen_001",
            generator_name="PV 100kW",
            station_id=None,
            station_has_transformer=False,
        )
        assert len(issues) == 0


class TestPvBessVariantB:
    """Variant B (block_transformer) requires transformer ref + catalog."""

    def test_variant_b_without_ref_fails(self) -> None:
        issues = validate_pv_bess_variant_b(
            generator_id="gen_002",
            generator_name="BESS 200kWh",
            blocking_transformer_ref=None,
            blocking_transformer_has_catalog=False,
        )
        assert len(issues) == 1
        assert issues[0].code == "generator.block_variant_requires_block_transformer"

    def test_variant_b_without_catalog_fails(self) -> None:
        issues = validate_pv_bess_variant_b(
            generator_id="gen_002",
            generator_name="BESS 200kWh",
            blocking_transformer_ref="tr_block_001",
            blocking_transformer_has_catalog=False,
        )
        assert len(issues) == 1
        assert issues[0].code == "generator.block_transformer_catalog_missing"

    def test_variant_b_complete_passes(self) -> None:
        issues = validate_pv_bess_variant_b(
            generator_id="gen_002",
            generator_name="BESS 200kWh",
            blocking_transformer_ref="tr_block_001",
            blocking_transformer_has_catalog=True,
        )
        assert len(issues) == 0


# ===========================================================================
# PV/BESS transformer readiness gate
# ===========================================================================


class TestRequirePvBessTransformerRule:
    """Gate blocks when generator.* BLOCKERs exist."""

    def test_passes_when_no_generator_issues(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[],
        )
        require_pv_bess_transformer_rule(profile)

    def test_blocked_by_generator_variant_missing(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                ReadinessIssueV1(
                    code="generator.connection_variant_missing",
                    area=ReadinessAreaV1.GENERATORS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl="Test",
                    element_id="gen_001",
                ),
            ],
        )
        with pytest.raises(ReadinessGateError) as exc_info:
            require_pv_bess_transformer_rule(profile)
        assert exc_info.value.gate == "pv_bess_transformer_rule"

    def test_blocked_by_station_ref_missing(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                ReadinessIssueV1(
                    code="generator.station_ref_missing",
                    area=ReadinessAreaV1.GENERATORS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl="Test",
                    element_id="gen_002",
                ),
            ],
        )
        with pytest.raises(ReadinessGateError):
            require_pv_bess_transformer_rule(profile)

    def test_not_blocked_by_non_generator_issue(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                ReadinessIssueV1(
                    code="topo.missing",
                    area=ReadinessAreaV1.TOPOLOGY,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl="Test",
                    element_id="bus_001",
                ),
            ],
        )
        require_pv_bess_transformer_rule(profile)


# ===========================================================================
# Determinism
# ===========================================================================


class TestDeterminism:
    """Same input → same output."""

    def test_station_validation_deterministic(self) -> None:
        field1 = _make_field("f_002", "LINE_IN", devices=())
        field2 = _make_field("f_001", "PV_SN", devices=())
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field1, field2),
        )
        r1 = validate_station_fields(station)
        r2 = validate_station_fields(station)
        assert [i.code for i in r1] == [i.code for i in r2]
        assert [i.element_id for i in r1] == [i.element_id for i in r2]

    def test_output_sorted_by_element_id(self) -> None:
        field_z = _make_field("z_field", "LINE_IN", devices=())
        field_a = _make_field("a_field", "PV_SN", devices=())
        station = StationValidationInputV1(
            station_id="st_001",
            station_name="Test",
            has_nn_bus=False,
            has_transformer_field=False,
            fields=(field_z, field_a),
        )
        issues = validate_station_fields(station)
        element_ids = [i.element_id for i in issues if i.element_id]
        assert element_ids == sorted(element_ids)
