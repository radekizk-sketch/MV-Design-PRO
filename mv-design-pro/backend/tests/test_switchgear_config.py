"""
Tests for SwitchgearConfigV1 — kontrakt domenowy konfiguracji rozdzielnicy.

RUN #3I COMMIT 1:
- Immutability (frozen dataclasses).
- Deterministic hashing (SHA-256, permutation invariant).
- Canonical serialization (sorted keys, sorted items).
- Validation (stable PL codes, no heuristics, no auto-fills).
- Round-trip: to_dict -> from_dict = identity (hash-stable).
"""

import random

import pytest
from domain.field_device import (
    AparatTypeV1,
    DeviceTypeV1,
    FieldRoleV1,
    PoleTypeV1,
)
from domain.switchgear_config import (
    SWITCHGEAR_CONFIG_VERSION,
    CatalogBindingV1,
    ConfigIssueSeverity,
    DeviceConfigV1,
    FieldConfigV1,
    FixActionType,
    ProtectionBindingV1,
    SwitchgearConfigV1,
    SwitchgearConfigValidationCode,
    canonicalize_config,
    compute_config_hash,
    validate_switchgear_config,
)

# =============================================================================
# HELPERS
# =============================================================================


def _make_minimal_line_in_config() -> SwitchgearConfigV1:
    """Minimal valid LINE_IN config (CB + CABLE_HEAD + catalog bindings)."""
    return SwitchgearConfigV1(
        station_id="station_1",
        fields=(
            FieldConfigV1(
                field_id="field_1",
                pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                field_role=FieldRoleV1.LINE_IN,
                bus_section_id="bus_1",
            ),
        ),
        devices=(
            DeviceConfigV1(
                device_id="dev_cb_1",
                field_id="field_1",
                device_type=DeviceTypeV1.CB,
                aparat_type=AparatTypeV1.WYLACZNIK,
            ),
            DeviceConfigV1(
                device_id="dev_ch_1",
                field_id="field_1",
                device_type=DeviceTypeV1.CABLE_HEAD,
                aparat_type=AparatTypeV1.GLOWICA_KABLOWA,
            ),
        ),
        catalog_bindings=(
            CatalogBindingV1(
                device_id="dev_cb_1",
                catalog_id="cat_cb_001",
                catalog_name="Wylacznik ABB 24kV",
            ),
            CatalogBindingV1(
                device_id="dev_ch_1",
                catalog_id="cat_ch_001",
                catalog_name="Glowica kablowa 24kV",
            ),
        ),
    )


def _make_transformer_config_with_relay() -> SwitchgearConfigV1:
    """Transformer field with CB + CT + Relay + TR + CABLE_HEAD, all bound."""
    return SwitchgearConfigV1(
        station_id="station_2",
        fields=(
            FieldConfigV1(
                field_id="field_tr",
                pole_type=PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN,
                field_role=FieldRoleV1.TRANSFORMER_SN_NN,
            ),
        ),
        devices=(
            DeviceConfigV1(
                device_id="dev_cb_tr",
                field_id="field_tr",
                device_type=DeviceTypeV1.CB,
                aparat_type=AparatTypeV1.WYLACZNIK,
            ),
            DeviceConfigV1(
                device_id="dev_ct_tr",
                field_id="field_tr",
                device_type=DeviceTypeV1.CT,
                aparat_type=AparatTypeV1.PRZEKLADNIK_PRADOWY,
            ),
            DeviceConfigV1(
                device_id="dev_relay_tr",
                field_id="field_tr",
                device_type=DeviceTypeV1.RELAY,
                aparat_type=AparatTypeV1.ZABEZPIECZENIE,
            ),
            DeviceConfigV1(
                device_id="dev_tr",
                field_id="field_tr",
                device_type=DeviceTypeV1.TRANSFORMER_DEVICE,
                aparat_type=AparatTypeV1.TRANSFORMATOR,
            ),
            DeviceConfigV1(
                device_id="dev_ch_tr",
                field_id="field_tr",
                device_type=DeviceTypeV1.CABLE_HEAD,
                aparat_type=AparatTypeV1.GLOWICA_KABLOWA,
            ),
        ),
        catalog_bindings=(
            CatalogBindingV1(
                device_id="dev_cb_tr",
                catalog_id="cat_cb_001",
                catalog_name="Wylacznik ABB 24kV",
            ),
            CatalogBindingV1(
                device_id="dev_ct_tr",
                catalog_id="cat_ct_001",
                catalog_name="Przekladnik MBS 100/5",
            ),
            CatalogBindingV1(
                device_id="dev_relay_tr",
                catalog_id="cat_relay_001",
                catalog_name="Zabezpieczenie Siemens 7SJ82",
            ),
            CatalogBindingV1(
                device_id="dev_tr",
                catalog_id="cat_tr_001",
                catalog_name="Transformator 630kVA",
            ),
            CatalogBindingV1(
                device_id="dev_ch_tr",
                catalog_id="cat_ch_001",
                catalog_name="Glowica kablowa 24kV",
            ),
        ),
        protection_bindings=(
            ProtectionBindingV1(
                relay_device_id="dev_relay_tr",
                cb_device_id="dev_cb_tr",
            ),
        ),
    )


# =============================================================================
# IMMUTABILITY TESTS
# =============================================================================


class TestImmutability:
    """Frozen dataclasses — mutation raises TypeError."""

    def test_switchgear_config_frozen(self) -> None:
        config = _make_minimal_line_in_config()
        with pytest.raises(AttributeError):
            config.station_id = "other"  # type: ignore[misc]

    def test_field_config_frozen(self) -> None:
        field = FieldConfigV1(
            field_id="f1",
            pole_type=PoleTypeV1.POLE_LINIOWE_SN,
            field_role=FieldRoleV1.LINE_IN,
        )
        with pytest.raises(AttributeError):
            field.field_id = "other"  # type: ignore[misc]

    def test_device_config_frozen(self) -> None:
        device = DeviceConfigV1(
            device_id="d1",
            field_id="f1",
            device_type=DeviceTypeV1.CB,
            aparat_type=AparatTypeV1.WYLACZNIK,
        )
        with pytest.raises(AttributeError):
            device.device_id = "other"  # type: ignore[misc]

    def test_catalog_binding_frozen(self) -> None:
        binding = CatalogBindingV1(
            device_id="d1",
            catalog_id="c1",
            catalog_name="test",
        )
        with pytest.raises(AttributeError):
            binding.device_id = "other"  # type: ignore[misc]

    def test_protection_binding_frozen(self) -> None:
        binding = ProtectionBindingV1(
            relay_device_id="r1",
            cb_device_id="c1",
        )
        with pytest.raises(AttributeError):
            binding.relay_device_id = "other"  # type: ignore[misc]


# =============================================================================
# SERIALIZATION / ROUND-TRIP
# =============================================================================


class TestSerialization:
    """to_dict -> from_dict round-trip preserves data and hash."""

    def test_round_trip_minimal(self) -> None:
        config = _make_minimal_line_in_config()
        data = config.to_dict()
        restored = SwitchgearConfigV1.from_dict(data)

        assert restored.station_id == config.station_id
        assert len(restored.fields) == len(config.fields)
        assert len(restored.devices) == len(config.devices)
        assert len(restored.catalog_bindings) == len(config.catalog_bindings)
        assert compute_config_hash(config) == compute_config_hash(restored)

    def test_round_trip_transformer(self) -> None:
        config = _make_transformer_config_with_relay()
        data = config.to_dict()
        restored = SwitchgearConfigV1.from_dict(data)

        assert restored.station_id == config.station_id
        assert len(restored.protection_bindings) == 1
        assert compute_config_hash(config) == compute_config_hash(restored)

    def test_round_trip_empty(self) -> None:
        config = SwitchgearConfigV1(station_id="empty_station")
        data = config.to_dict()
        restored = SwitchgearConfigV1.from_dict(data)

        assert restored.station_id == "empty_station"
        assert len(restored.fields) == 0
        assert len(restored.devices) == 0
        assert compute_config_hash(config) == compute_config_hash(restored)


# =============================================================================
# DETERMINISTIC HASHING
# =============================================================================


class TestDeterministicHash:
    """SHA-256 hash is deterministic and permutation invariant."""

    def test_hash_deterministic_100x(self) -> None:
        """Same config -> same hash 100 times."""
        config = _make_transformer_config_with_relay()
        reference_hash = compute_config_hash(config)

        for _ in range(100):
            assert compute_config_hash(config) == reference_hash

    def test_hash_permutation_invariance_fields_50x(self) -> None:
        """Fields in different order -> same hash."""
        for _ in range(50):
            fields = [
                FieldConfigV1(
                    field_id=f"f_{i}",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.LINE_IN,
                )
                for i in range(5)
            ]
            random.shuffle(fields)
            config_a = SwitchgearConfigV1(
                station_id="s1",
                fields=tuple(fields),
            )

            fields_reversed = list(reversed(fields))
            config_b = SwitchgearConfigV1(
                station_id="s1",
                fields=tuple(fields_reversed),
            )

            assert compute_config_hash(config_a) == compute_config_hash(config_b)

    def test_hash_permutation_invariance_devices_50x(self) -> None:
        """Devices in different order -> same hash."""
        for _ in range(50):
            devices = [
                DeviceConfigV1(
                    device_id=f"d_{i}",
                    field_id="f_0",
                    device_type=DeviceTypeV1.CB,
                    aparat_type=AparatTypeV1.WYLACZNIK,
                )
                for i in range(5)
            ]
            random.shuffle(devices)
            config_a = SwitchgearConfigV1(
                station_id="s1",
                devices=tuple(devices),
            )

            devices_reversed = list(reversed(devices))
            config_b = SwitchgearConfigV1(
                station_id="s1",
                devices=tuple(devices_reversed),
            )

            assert compute_config_hash(config_a) == compute_config_hash(config_b)

    def test_hash_permutation_invariance_bindings_50x(self) -> None:
        """Catalog bindings in different order -> same hash."""
        for _ in range(50):
            bindings = [
                CatalogBindingV1(
                    device_id=f"d_{i}",
                    catalog_id=f"c_{i}",
                    catalog_name=f"name_{i}",
                )
                for i in range(5)
            ]
            random.shuffle(bindings)
            config_a = SwitchgearConfigV1(
                station_id="s1",
                catalog_bindings=tuple(bindings),
            )

            bindings_reversed = list(reversed(bindings))
            config_b = SwitchgearConfigV1(
                station_id="s1",
                catalog_bindings=tuple(bindings_reversed),
            )

            assert compute_config_hash(config_a) == compute_config_hash(config_b)

    def test_hash_differs_for_different_data(self) -> None:
        """Different data -> different hash."""
        config_a = _make_minimal_line_in_config()
        config_b = _make_transformer_config_with_relay()
        assert compute_config_hash(config_a) != compute_config_hash(config_b)

    def test_hash_is_64_hex(self) -> None:
        """SHA-256 produces 64-char hex string."""
        config = _make_minimal_line_in_config()
        h = compute_config_hash(config)
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


# =============================================================================
# CANONICALIZATION
# =============================================================================


class TestCanonicalization:
    """canonicalize_config sorts all sub-lists deterministically."""

    def test_fields_sorted_by_id(self) -> None:
        config = SwitchgearConfigV1(
            station_id="s1",
            fields=(
                FieldConfigV1(
                    field_id="field_z",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.LINE_IN,
                ),
                FieldConfigV1(
                    field_id="field_a",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.LINE_OUT,
                ),
            ),
        )
        canonical = canonicalize_config(config)
        assert canonical.fields[0].field_id == "field_a"
        assert canonical.fields[1].field_id == "field_z"

    def test_devices_sorted_by_id(self) -> None:
        config = SwitchgearConfigV1(
            station_id="s1",
            devices=(
                DeviceConfigV1(
                    device_id="dev_z",
                    field_id="f1",
                    device_type=DeviceTypeV1.CB,
                    aparat_type=AparatTypeV1.WYLACZNIK,
                ),
                DeviceConfigV1(
                    device_id="dev_a",
                    field_id="f1",
                    device_type=DeviceTypeV1.CT,
                    aparat_type=AparatTypeV1.PRZEKLADNIK_PRADOWY,
                ),
            ),
        )
        canonical = canonicalize_config(config)
        assert canonical.devices[0].device_id == "dev_a"
        assert canonical.devices[1].device_id == "dev_z"

    def test_catalog_bindings_sorted_by_device_id(self) -> None:
        config = SwitchgearConfigV1(
            station_id="s1",
            catalog_bindings=(
                CatalogBindingV1(device_id="dev_z", catalog_id="c1", catalog_name="Z"),
                CatalogBindingV1(device_id="dev_a", catalog_id="c2", catalog_name="A"),
            ),
        )
        canonical = canonicalize_config(config)
        assert canonical.catalog_bindings[0].device_id == "dev_a"
        assert canonical.catalog_bindings[1].device_id == "dev_z"

    def test_protection_bindings_sorted(self) -> None:
        config = SwitchgearConfigV1(
            station_id="s1",
            protection_bindings=(
                ProtectionBindingV1(relay_device_id="r_z", cb_device_id="cb_1"),
                ProtectionBindingV1(relay_device_id="r_a", cb_device_id="cb_2"),
            ),
        )
        canonical = canonicalize_config(config)
        assert canonical.protection_bindings[0].relay_device_id == "r_a"
        assert canonical.protection_bindings[1].relay_device_id == "r_z"


# =============================================================================
# VALIDATION
# =============================================================================


class TestValidation:
    """validate_switchgear_config — stable PL codes, no heuristics."""

    def test_valid_minimal_config(self) -> None:
        config = _make_minimal_line_in_config()
        result = validate_switchgear_config(config)
        assert result.valid is True
        assert len(result.issues) == 0

    def test_valid_transformer_config(self) -> None:
        config = _make_transformer_config_with_relay()
        result = validate_switchgear_config(config)
        assert result.valid is True
        blocker_issues = [i for i in result.issues if i.severity == ConfigIssueSeverity.BLOCKER]
        assert len(blocker_issues) == 0

    def test_catalog_ref_missing(self) -> None:
        """Device without catalog binding -> CATALOG_REF_MISSING."""
        config = SwitchgearConfigV1(
            station_id="s1",
            fields=(
                FieldConfigV1(
                    field_id="f1",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.LINE_IN,
                ),
            ),
            devices=(
                DeviceConfigV1(
                    device_id="dev_cb",
                    field_id="f1",
                    device_type=DeviceTypeV1.CB,
                    aparat_type=AparatTypeV1.WYLACZNIK,
                ),
                DeviceConfigV1(
                    device_id="dev_ch",
                    field_id="f1",
                    device_type=DeviceTypeV1.CABLE_HEAD,
                    aparat_type=AparatTypeV1.GLOWICA_KABLOWA,
                ),
            ),
            # No catalog bindings!
        )
        result = validate_switchgear_config(config)
        assert result.valid is False
        catalog_issues = [
            i for i in result.issues if i.code == SwitchgearConfigValidationCode.CATALOG_REF_MISSING
        ]
        assert len(catalog_issues) == 2  # One per device
        # FixActions present
        catalog_fixes = [
            fa
            for fa in result.fix_actions
            if fa.code == SwitchgearConfigValidationCode.CATALOG_REF_MISSING
        ]
        assert len(catalog_fixes) == 2
        assert all(
            fa.action == FixActionType.NAVIGATE_TO_WIZARD_CATALOG_PICKER for fa in catalog_fixes
        )

    def test_field_missing_required_device(self) -> None:
        """LINE_IN field without CB -> FIELD_MISSING_REQUIRED_DEVICE."""
        config = SwitchgearConfigV1(
            station_id="s1",
            fields=(
                FieldConfigV1(
                    field_id="f1",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.LINE_IN,
                ),
            ),
            # No devices!
        )
        result = validate_switchgear_config(config)
        assert result.valid is False
        missing_issues = [
            i
            for i in result.issues
            if i.code == SwitchgearConfigValidationCode.FIELD_MISSING_REQUIRED_DEVICE
        ]
        # LINE_IN requires CB + CABLE_HEAD
        assert len(missing_issues) == 2

    def test_gpz_line_bay_requires_full_gpz_apparatus_contract(self) -> None:
        """GPZ_LINE_BAY requires switching, protection, CT, earthing, and cable head."""
        config = SwitchgearConfigV1(
            station_id="gpz1",
            fields=(
                FieldConfigV1(
                    field_id="gpz_line_1",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.GPZ_LINE_BAY,
                ),
            ),
        )
        result = validate_switchgear_config(config)
        missing_issues = [
            i
            for i in result.issues
            if i.code == SwitchgearConfigValidationCode.FIELD_MISSING_REQUIRED_DEVICE
        ]
        messages = "\n".join(issue.message_pl for issue in missing_issues)

        assert result.valid is False
        assert len(missing_issues) == 6
        for required_type in ("DS", "CB", "CT", "RELAY", "ES", "CABLE_HEAD"):
            assert required_type in messages

    def test_coupler_requires_disconnector_and_breaker(self) -> None:
        """Coupler is not a single-apparatus CB-only field."""
        config = SwitchgearConfigV1(
            station_id="station_sectional",
            fields=(
                FieldConfigV1(
                    field_id="coupler_1",
                    pole_type=PoleTypeV1.POLE_SPRZEGLOWE_SN,
                    field_role=FieldRoleV1.COUPLER_SN,
                ),
            ),
        )
        result = validate_switchgear_config(config)
        missing_issues = [
            i
            for i in result.issues
            if i.code == SwitchgearConfigValidationCode.FIELD_MISSING_REQUIRED_DEVICE
        ]
        messages = "\n".join(issue.message_pl for issue in missing_issues)

        assert result.valid is False
        assert len(missing_issues) == 2
        assert "DS" in messages
        assert "CB" in messages

    def test_measurement_sn_requires_vt(self) -> None:
        """Bus measurement bay requires VT, not a line-bay apparatus chain."""
        config = SwitchgearConfigV1(
            station_id="gpz1",
            fields=(
                FieldConfigV1(
                    field_id="measurement_1",
                    pole_type=PoleTypeV1.POLE_POMIAROWE_SN,
                    field_role=FieldRoleV1.MEASUREMENT_SN,
                ),
            ),
        )
        result = validate_switchgear_config(config)
        missing_issues = [
            i
            for i in result.issues
            if i.code == SwitchgearConfigValidationCode.FIELD_MISSING_REQUIRED_DEVICE
        ]
        messages = "\n".join(issue.message_pl for issue in missing_issues)

        assert result.valid is False
        assert len(missing_issues) == 1
        assert "VT" in messages
        assert "CB" not in messages
        assert "CABLE_HEAD" not in messages

    def test_protection_binding_missing(self) -> None:
        """Relay without protection binding -> PROTECTION_BINDING_MISSING."""
        config = SwitchgearConfigV1(
            station_id="s1",
            fields=(
                FieldConfigV1(
                    field_id="f1",
                    pole_type=PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN,
                    field_role=FieldRoleV1.TRANSFORMER_SN_NN,
                ),
            ),
            devices=(
                DeviceConfigV1(
                    device_id="dev_relay",
                    field_id="f1",
                    device_type=DeviceTypeV1.RELAY,
                    aparat_type=AparatTypeV1.ZABEZPIECZENIE,
                ),
                DeviceConfigV1(
                    device_id="dev_cb",
                    field_id="f1",
                    device_type=DeviceTypeV1.CB,
                    aparat_type=AparatTypeV1.WYLACZNIK,
                ),
                DeviceConfigV1(
                    device_id="dev_ct",
                    field_id="f1",
                    device_type=DeviceTypeV1.CT,
                    aparat_type=AparatTypeV1.PRZEKLADNIK_PRADOWY,
                ),
                DeviceConfigV1(
                    device_id="dev_tr",
                    field_id="f1",
                    device_type=DeviceTypeV1.TRANSFORMER_DEVICE,
                    aparat_type=AparatTypeV1.TRANSFORMATOR,
                ),
                DeviceConfigV1(
                    device_id="dev_ch",
                    field_id="f1",
                    device_type=DeviceTypeV1.CABLE_HEAD,
                    aparat_type=AparatTypeV1.GLOWICA_KABLOWA,
                ),
            ),
            catalog_bindings=(
                CatalogBindingV1(
                    device_id="dev_relay",
                    catalog_id="c_relay",
                    catalog_name="Relay",
                ),
                CatalogBindingV1(
                    device_id="dev_cb",
                    catalog_id="c_cb",
                    catalog_name="CB",
                ),
                CatalogBindingV1(
                    device_id="dev_ct",
                    catalog_id="c_ct",
                    catalog_name="CT",
                ),
                CatalogBindingV1(
                    device_id="dev_tr",
                    catalog_id="c_tr",
                    catalog_name="TR",
                ),
                CatalogBindingV1(
                    device_id="dev_ch",
                    catalog_id="c_ch",
                    catalog_name="CH",
                ),
            ),
            # No protection bindings!
        )
        result = validate_switchgear_config(config)
        assert result.valid is False
        prot_issues = [
            i
            for i in result.issues
            if i.code == SwitchgearConfigValidationCode.PROTECTION_BINDING_MISSING
        ]
        assert len(prot_issues) == 1
        assert prot_issues[0].device_id == "dev_relay"

    def test_pv_bess_transformer_blocker(self) -> None:
        """PV_SN field without transformer -> PV_BESS_TRANSFORMER_MISSING (BLOCKER)."""
        config = SwitchgearConfigV1(
            station_id="s1",
            fields=(
                FieldConfigV1(
                    field_id="f_pv",
                    pole_type=PoleTypeV1.POLE_ZRODLA_PV_SN,
                    field_role=FieldRoleV1.PV_SN,
                ),
            ),
            devices=(
                DeviceConfigV1(
                    device_id="dev_cb",
                    field_id="f_pv",
                    device_type=DeviceTypeV1.CB,
                    aparat_type=AparatTypeV1.WYLACZNIK,
                ),
                DeviceConfigV1(
                    device_id="dev_ct",
                    field_id="f_pv",
                    device_type=DeviceTypeV1.CT,
                    aparat_type=AparatTypeV1.PRZEKLADNIK_PRADOWY,
                ),
                DeviceConfigV1(
                    device_id="dev_relay",
                    field_id="f_pv",
                    device_type=DeviceTypeV1.RELAY,
                    aparat_type=AparatTypeV1.ZABEZPIECZENIE,
                ),
                DeviceConfigV1(
                    device_id="dev_pv",
                    field_id="f_pv",
                    device_type=DeviceTypeV1.GENERATOR_PV,
                    aparat_type=AparatTypeV1.GENERATOR_PV,
                ),
                DeviceConfigV1(
                    device_id="dev_ch",
                    field_id="f_pv",
                    device_type=DeviceTypeV1.CABLE_HEAD,
                    aparat_type=AparatTypeV1.GLOWICA_KABLOWA,
                ),
            ),
            catalog_bindings=tuple(
                CatalogBindingV1(
                    device_id=did,
                    catalog_id=f"c_{did}",
                    catalog_name=f"Cat {did}",
                )
                for did in ["dev_cb", "dev_ct", "dev_relay", "dev_pv", "dev_ch"]
            ),
            protection_bindings=(
                ProtectionBindingV1(
                    relay_device_id="dev_relay",
                    cb_device_id="dev_cb",
                ),
            ),
        )
        result = validate_switchgear_config(config)
        # Should now be invalid (BLOCKER)
        assert result.valid is False
        pv_issues = [
            i
            for i in result.issues
            if i.code == SwitchgearConfigValidationCode.PV_BESS_TRANSFORMER_MISSING
        ]
        assert len(pv_issues) == 1
        assert pv_issues[0].severity == ConfigIssueSeverity.BLOCKER
        # FixAction present
        pv_fixes = [
            fa
            for fa in result.fix_actions
            if fa.code == SwitchgearConfigValidationCode.PV_BESS_TRANSFORMER_MISSING
        ]
        assert len(pv_fixes) == 1
        assert pv_fixes[0].action == FixActionType.NAVIGATE_TO_WIZARD_FIELD

    def test_device_orphan(self) -> None:
        """Device referencing non-existent field -> DEVICE_ORPHAN."""
        config = SwitchgearConfigV1(
            station_id="s1",
            fields=(),
            devices=(
                DeviceConfigV1(
                    device_id="dev_cb",
                    field_id="nonexistent_field",
                    device_type=DeviceTypeV1.CB,
                    aparat_type=AparatTypeV1.WYLACZNIK,
                ),
            ),
        )
        result = validate_switchgear_config(config)
        assert result.valid is False
        orphan_issues = [
            i for i in result.issues if i.code == SwitchgearConfigValidationCode.DEVICE_ORPHAN
        ]
        assert len(orphan_issues) == 1

    def test_duplicate_field_ids(self) -> None:
        """Duplicate field IDs -> FIELD_DUPLICATE_ID."""
        config = SwitchgearConfigV1(
            station_id="s1",
            fields=(
                FieldConfigV1(
                    field_id="dup_field",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.LINE_IN,
                ),
                FieldConfigV1(
                    field_id="dup_field",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.LINE_OUT,
                ),
            ),
        )
        result = validate_switchgear_config(config)
        assert result.valid is False
        dup_issues = [
            i for i in result.issues if i.code == SwitchgearConfigValidationCode.FIELD_DUPLICATE_ID
        ]
        assert len(dup_issues) == 1

    def test_duplicate_device_ids(self) -> None:
        """Duplicate device IDs -> DEVICE_DUPLICATE_ID."""
        config = SwitchgearConfigV1(
            station_id="s1",
            fields=(
                FieldConfigV1(
                    field_id="f1",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.LINE_IN,
                ),
            ),
            devices=(
                DeviceConfigV1(
                    device_id="dup_dev",
                    field_id="f1",
                    device_type=DeviceTypeV1.CB,
                    aparat_type=AparatTypeV1.WYLACZNIK,
                ),
                DeviceConfigV1(
                    device_id="dup_dev",
                    field_id="f1",
                    device_type=DeviceTypeV1.CT,
                    aparat_type=AparatTypeV1.PRZEKLADNIK_PRADOWY,
                ),
            ),
        )
        result = validate_switchgear_config(config)
        assert result.valid is False
        dup_issues = [
            i for i in result.issues if i.code == SwitchgearConfigValidationCode.DEVICE_DUPLICATE_ID
        ]
        assert len(dup_issues) == 1

    def test_orphan_catalog_binding(self) -> None:
        """Catalog binding for non-existent device -> WARNING."""
        config = SwitchgearConfigV1(
            station_id="s1",
            catalog_bindings=(
                CatalogBindingV1(
                    device_id="nonexistent",
                    catalog_id="c1",
                    catalog_name="test",
                ),
            ),
        )
        result = validate_switchgear_config(config)
        # No blockers (no devices to validate)
        orphan_issues = [
            i
            for i in result.issues
            if i.code == SwitchgearConfigValidationCode.CATALOG_BINDING_ORPHAN
        ]
        assert len(orphan_issues) == 1
        assert orphan_issues[0].severity == ConfigIssueSeverity.WARNING

    def test_orphan_protection_binding(self) -> None:
        """Protection binding for non-existent device -> WARNING."""
        config = SwitchgearConfigV1(
            station_id="s1",
            protection_bindings=(
                ProtectionBindingV1(
                    relay_device_id="nonexistent_relay",
                    cb_device_id="nonexistent_cb",
                ),
            ),
        )
        result = validate_switchgear_config(config)
        orphan_issues = [
            i
            for i in result.issues
            if i.code == SwitchgearConfigValidationCode.PROTECTION_BINDING_ORPHAN
        ]
        assert len(orphan_issues) == 2  # Both relay and cb are orphans

    def test_issues_sorted_deterministically(self) -> None:
        """Issues are sorted by (severity, code, element_id)."""
        config = SwitchgearConfigV1(
            station_id="s1",
            fields=(
                FieldConfigV1(
                    field_id="f1",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.LINE_IN,
                ),
            ),
            devices=(
                DeviceConfigV1(
                    device_id="dev_b",
                    field_id="f1",
                    device_type=DeviceTypeV1.CB,
                    aparat_type=AparatTypeV1.WYLACZNIK,
                ),
                DeviceConfigV1(
                    device_id="dev_a",
                    field_id="f1",
                    device_type=DeviceTypeV1.CABLE_HEAD,
                    aparat_type=AparatTypeV1.GLOWICA_KABLOWA,
                ),
            ),
            # No catalog -> 2 BLOCKER issues, sorted by element_id
        )
        result = validate_switchgear_config(config)
        blocker_catalog = [
            i for i in result.issues if i.code == SwitchgearConfigValidationCode.CATALOG_REF_MISSING
        ]
        assert len(blocker_catalog) == 2
        # Should be sorted by element_id
        ids = [i.element_id for i in blocker_catalog]
        assert ids == sorted(ids)

    def test_empty_config_is_valid(self) -> None:
        """Empty config (no fields, no devices) is technically valid."""
        config = SwitchgearConfigV1(station_id="empty")
        result = validate_switchgear_config(config)
        assert result.valid is True
        assert len(result.issues) == 0

    def test_fix_actions_have_station_id(self) -> None:
        """All FixActions contain the station_id from config."""
        config = SwitchgearConfigV1(
            station_id="station_xyz",
            fields=(
                FieldConfigV1(
                    field_id="f1",
                    pole_type=PoleTypeV1.POLE_LINIOWE_SN,
                    field_role=FieldRoleV1.LINE_IN,
                ),
            ),
            devices=(
                DeviceConfigV1(
                    device_id="dev_1",
                    field_id="f1",
                    device_type=DeviceTypeV1.CB,
                    aparat_type=AparatTypeV1.WYLACZNIK,
                ),
            ),
        )
        result = validate_switchgear_config(config)
        for fa in result.fix_actions:
            assert fa.station_id == "station_xyz"

    def test_validation_result_serializable(self) -> None:
        """Validation result can be serialized to dict."""
        config = _make_minimal_line_in_config()
        result = validate_switchgear_config(config)
        d = result.to_dict()
        assert "valid" in d
        assert "issues" in d
        assert "fix_actions" in d


# =============================================================================
# VERSION
# =============================================================================


class TestVersion:
    """Config version is stable."""

    def test_default_version(self) -> None:
        config = SwitchgearConfigV1()
        assert config.config_version == SWITCHGEAR_CONFIG_VERSION

    def test_version_value(self) -> None:
        assert SWITCHGEAR_CONFIG_VERSION == "1.0"
