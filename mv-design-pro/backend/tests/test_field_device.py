"""Field & Device domain tests — RUN #3F §5.

Tests for Polish taxonomy (PoleV1/AparatV1), bidirectional mappings,
generator field validation, and field/device readiness gates.

BINDING: any failure blocks merge.
"""

import pytest
from domain.field_device import (
    APARAT_TO_DEVICE_TYPE,
    APARAT_TYPE_LABELS_PL,
    DEVICE_TYPE_TO_APARAT,
    FIELD_ROLE_TO_POLE,
    POLE_TO_FIELD_ROLE,
    POLE_TYPE_LABELS_PL,
    AparatTypeV1,
    DeviceTypeV1,
    FieldRoleV1,
    PoleTypeV1,
    validate_generator_field_connection,
)
from domain.readiness import (
    ReadinessAreaV1,
    ReadinessGateError,
    ReadinessIssueV1,
    ReadinessPriority,
    build_readiness_profile,
    require_devices_parametrized,
    require_fields_complete,
    require_protection_bindings,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_issue(
    code: str,
    area: ReadinessAreaV1,
    priority: ReadinessPriority = ReadinessPriority.BLOCKER,
) -> ReadinessIssueV1:
    return ReadinessIssueV1(
        code=code,
        area=area,
        priority=priority,
        message_pl=f"Test issue: {code}",
        element_id="elem_001",
    )


# ===========================================================================
# PoleTypeV1 ↔ FieldRoleV1 bidirectional mapping
# ===========================================================================


class TestPoleToFieldRoleMapping:
    """Polish field types map bijectively to FieldRole."""

    def test_all_pole_types_have_field_role(self) -> None:
        for pole in PoleTypeV1:
            assert pole in POLE_TO_FIELD_ROLE, f"Missing mapping for {pole}"

    def test_all_field_roles_have_pole_type(self) -> None:
        for role in FieldRoleV1:
            assert role in FIELD_ROLE_TO_POLE, f"Missing mapping for {role}"

    def test_roundtrip_pole_to_role_to_pole(self) -> None:
        """PoleType → FieldRole → PoleType roundtrip (many-to-one allowed)."""
        for _pole, role in POLE_TO_FIELD_ROLE.items():
            assert FIELD_ROLE_TO_POLE[role] is not None

    def test_sn_poles_map_to_sn_roles(self) -> None:
        """SN field types map to SN roles (not nN)."""
        sn_poles = [p for p in PoleTypeV1 if p.value.endswith("_SN") or "_SN_" in p.value]
        nn_roles = {
            FieldRoleV1.MAIN_NN,
            FieldRoleV1.FEEDER_NN,
            FieldRoleV1.PV_NN,
            FieldRoleV1.BESS_NN,
        }
        for pole in sn_poles:
            assert POLE_TO_FIELD_ROLE[pole] not in nn_roles, f"{pole} maps to nN role"

    def test_nn_poles_map_to_nn_roles(self) -> None:
        """Pure nN field types (POLE_*_NN without SN_NN) map to nN roles."""
        nn_poles = [p for p in PoleTypeV1 if p.value.endswith("_NN") and "SN_NN" not in p.value]
        nn_roles = {
            FieldRoleV1.MAIN_NN,
            FieldRoleV1.FEEDER_NN,
            FieldRoleV1.PV_NN,
            FieldRoleV1.BESS_NN,
        }
        for pole in nn_poles:
            assert POLE_TO_FIELD_ROLE[pole] in nn_roles, f"{pole} does not map to nN role"


# ===========================================================================
# AparatTypeV1 ↔ DeviceTypeV1 bidirectional mapping
# ===========================================================================


class TestAparatToDeviceTypeMapping:
    """Polish apparatus types map bijectively to DeviceType."""

    def test_all_aparat_types_have_device_type(self) -> None:
        for aparat in AparatTypeV1:
            assert aparat in APARAT_TO_DEVICE_TYPE, f"Missing mapping for {aparat}"

    def test_all_device_types_have_aparat_type(self) -> None:
        for device in DeviceTypeV1:
            assert device in DEVICE_TYPE_TO_APARAT, f"Missing mapping for {device}"

    def test_wylacznik_maps_to_cb(self) -> None:
        assert APARAT_TO_DEVICE_TYPE[AparatTypeV1.WYLACZNIK] == DeviceTypeV1.CB

    def test_cb_maps_to_wylacznik(self) -> None:
        assert DEVICE_TYPE_TO_APARAT[DeviceTypeV1.CB] == AparatTypeV1.WYLACZNIK

    def test_roundtrip_aparat_to_device_to_aparat(self) -> None:
        """AparatType → DeviceType → AparatType roundtrip (bijective)."""
        for aparat, device in APARAT_TO_DEVICE_TYPE.items():
            assert DEVICE_TYPE_TO_APARAT[device] == aparat


# ===========================================================================
# Polish labels completeness
# ===========================================================================


class TestPolishLabels:
    """Every enum member has a Polish label."""

    def test_all_pole_types_have_label(self) -> None:
        for pole in PoleTypeV1:
            assert pole in POLE_TYPE_LABELS_PL, f"Missing label for {pole}"
            assert len(POLE_TYPE_LABELS_PL[pole]) > 0

    def test_all_aparat_types_have_label(self) -> None:
        for aparat in AparatTypeV1:
            assert aparat in APARAT_TYPE_LABELS_PL, f"Missing label for {aparat}"
            assert len(APARAT_TYPE_LABELS_PL[aparat]) > 0


# ===========================================================================
# Generator field validation (PV/BESS through transformer)
# ===========================================================================


class TestGeneratorFieldValidation:
    """PV/BESS always through transformer — variant A or B."""

    def test_pv_nn_side_valid(self) -> None:
        result = validate_generator_field_connection(
            generator_id="gen_001",
            generator_type="pv_inverter",
            connection_variant="nn_side",
            blocking_transformer_ref=None,
            station_ref="station_001",
        )
        assert result.is_valid is True
        assert result.fix_code is None

    def test_pv_block_transformer_valid(self) -> None:
        result = validate_generator_field_connection(
            generator_id="gen_002",
            generator_type="PV",
            connection_variant="block_transformer",
            blocking_transformer_ref="tr_block_001",
            station_ref=None,
        )
        assert result.is_valid is True
        assert result.fix_code is None

    def test_pv_missing_variant_invalid(self) -> None:
        result = validate_generator_field_connection(
            generator_id="gen_003",
            generator_type="pv_inverter",
            connection_variant=None,
            blocking_transformer_ref=None,
            station_ref=None,
        )
        assert result.is_valid is False
        assert result.fix_code == "generator.connection_variant_missing"

    def test_pv_nn_side_missing_station_invalid(self) -> None:
        result = validate_generator_field_connection(
            generator_id="gen_004",
            generator_type="PV",
            connection_variant="nn_side",
            blocking_transformer_ref=None,
            station_ref=None,
        )
        assert result.is_valid is False
        assert result.fix_code == "generator.station_ref_missing"

    def test_pv_block_transformer_missing_ref_invalid(self) -> None:
        result = validate_generator_field_connection(
            generator_id="gen_005",
            generator_type="PV",
            connection_variant="block_transformer",
            blocking_transformer_ref=None,
            station_ref=None,
        )
        assert result.is_valid is False
        assert result.fix_code == "generator.block_transformer_missing"

    def test_bess_nn_side_valid(self) -> None:
        result = validate_generator_field_connection(
            generator_id="bess_001",
            generator_type="bess",
            connection_variant="nn_side",
            blocking_transformer_ref=None,
            station_ref="station_002",
        )
        assert result.is_valid is True

    def test_bess_missing_variant_invalid(self) -> None:
        result = validate_generator_field_connection(
            generator_id="bess_002",
            generator_type="BESS",
            connection_variant=None,
            blocking_transformer_ref=None,
            station_ref=None,
        )
        assert result.is_valid is False
        assert result.fix_code == "generator.connection_variant_missing"

    def test_synchronous_generator_skips_validation(self) -> None:
        """Non-PV/BESS generators always pass (no transformer enforcement)."""
        result = validate_generator_field_connection(
            generator_id="sync_001",
            generator_type="synchronous",
            connection_variant=None,
            blocking_transformer_ref=None,
            station_ref=None,
        )
        assert result.is_valid is True
        assert result.fix_code is None

    def test_result_is_frozen(self) -> None:
        result = validate_generator_field_connection(
            generator_id="gen_f",
            generator_type="PV",
            connection_variant="nn_side",
            blocking_transformer_ref=None,
            station_ref="st_001",
        )
        with pytest.raises(AttributeError):
            result.is_valid = False  # type: ignore[misc]

    def test_deterministic_output(self) -> None:
        """Same input → same output (determinism)."""
        kwargs = {
            "generator_id": "gen_det",
            "generator_type": "PV",
            "connection_variant": "nn_side",
            "blocking_transformer_ref": None,
            "station_ref": "st_det",
        }
        r1 = validate_generator_field_connection(**kwargs)
        r2 = validate_generator_field_connection(**kwargs)
        assert r1 == r2


# ===========================================================================
# Field/Device readiness gates (RUN #3F §3)
# ===========================================================================


class TestRequireFieldsComplete:
    """Gate: field.device_missing.* BLOCKERs block fields_complete."""

    def test_passes_when_no_issues(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[],
        )
        require_fields_complete(profile)

    def test_blocked_by_device_missing(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue("field.device_missing.cb", ReadinessAreaV1.STATIONS),
            ],
        )
        with pytest.raises(ReadinessGateError) as exc_info:
            require_fields_complete(profile)
        assert exc_info.value.gate == "fields_complete"
        assert len(exc_info.value.blockers) == 1

    def test_not_blocked_by_unrelated_issue(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue("topo.missing_bus", ReadinessAreaV1.TOPOLOGY),
            ],
        )
        require_fields_complete(profile)

    def test_warning_does_not_block(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue(
                    "field.device_missing.es",
                    ReadinessAreaV1.STATIONS,
                    ReadinessPriority.WARNING,
                ),
            ],
        )
        require_fields_complete(profile)


class TestRequireDevicesParametrized:
    """Gate: device.* and catalog.ref_missing BLOCKERs block devices_parametrized."""

    def test_passes_when_no_issues(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[],
        )
        require_devices_parametrized(profile)

    def test_blocked_by_device_issue(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue("device.cb.rating_missing", ReadinessAreaV1.STATIONS),
            ],
        )
        with pytest.raises(ReadinessGateError) as exc_info:
            require_devices_parametrized(profile)
        assert exc_info.value.gate == "devices_parametrized"

    def test_blocked_by_catalog_ref_missing(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue("catalog.ref_missing", ReadinessAreaV1.CATALOGS),
            ],
        )
        with pytest.raises(ReadinessGateError):
            require_devices_parametrized(profile)

    def test_not_blocked_by_topology_issue(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue("topo.branch_missing", ReadinessAreaV1.TOPOLOGY),
            ],
        )
        require_devices_parametrized(profile)


class TestRequireProtectionBindings:
    """Gate: protection.* BLOCKERs block protection_bindings."""

    def test_passes_when_no_issues(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[],
        )
        require_protection_bindings(profile)

    def test_blocked_by_relay_binding_missing(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue("protection.relay_binding_missing", ReadinessAreaV1.PROTECTION),
            ],
        )
        with pytest.raises(ReadinessGateError) as exc_info:
            require_protection_bindings(profile)
        assert exc_info.value.gate == "protection_bindings"

    def test_blocked_by_relay_cb_binding_missing(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue("protection.relay_cb_binding_missing", ReadinessAreaV1.PROTECTION),
            ],
        )
        with pytest.raises(ReadinessGateError):
            require_protection_bindings(profile)

    def test_not_blocked_by_station_issue(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue("station.field_missing", ReadinessAreaV1.STATIONS),
            ],
        )
        require_protection_bindings(profile)

    def test_warning_does_not_block(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue(
                    "protection.binding_incomplete",
                    ReadinessAreaV1.PROTECTION,
                    ReadinessPriority.WARNING,
                ),
            ],
        )
        require_protection_bindings(profile)
