from __future__ import annotations

from application.analyses.protection.catalog.catalog_store import list_devices

# Legacy V0 series (NIEWERYFIKOWANY/ANALITYCZNY_V1, IEC_NI only, basic functions)
LEGACY_V0_RATED = [400, 600, 800, 1000, 1250, 1600, 2000]

# K30-16 expansion: comprehensive E2Tango z extended functions, multiple curves,
# CZESCIOWO_ZWERYFIKOWANY (production-grade reference). User-requested per
# explicit feedback: "rodzina E2Tango conajmniej modele 450, 600, 800, 1000, 1200".
COMPREHENSIVE_E2_RATED = [450, 600, 800, 1000, 1200]


def test_elektrometal_etango_legacy_v0_series_remains_intact() -> None:
    """Legacy V0 catalog (analityczny) preserved for backward compatibility."""
    devices = list_devices(vendor="ELEKTROMETAL")
    v0_devices = [d for d in devices if d.device_id.endswith("_V0")]
    rated_values = sorted(d.meta.get("rated") for d in v0_devices)
    assert rated_values == LEGACY_V0_RATED, "Legacy V0 series must stay complete"
    for device in v0_devices:
        assert device.meta.get("series") == "e2TANGO"
        assert device.meta.get("catalog_status") == "ANALITYCZNY_V1"
        assert device.meta.get("unverified") is True


def test_elektrometal_e2tango_comprehensive_expansion_present() -> None:
    """K30-16 user-requested E2Tango family: 450/600/800/1000/1200 musi być.

    Comprehensive entries: extended functions (27/59/79/87/etc.), multiple
    curves (IEC + IEEE + custom), referencyjny catalog status.
    """
    devices = list_devices(vendor="ELEKTROMETAL")
    e2_devices = [d for d in devices if d.device_id.startswith("EM_E2TANGO_")]
    rated_values = sorted(d.meta.get("rated") for d in e2_devices)
    assert rated_values == COMPREHENSIVE_E2_RATED, (
        f"K30-16 E2Tango comprehensive family incomplete: got {rated_values}, "
        f"expected {COMPREHENSIVE_E2_RATED}"
    )
    for device in e2_devices:
        assert device.meta.get("series") == "e2TANGO"
        # Comprehensive entries are referenced, not just analytical
        assert device.meta.get("catalog_status") == "REFERENCYJNY_V1"
        # Extended function support per model tier
        assert "50" in device.functions_supported
        assert "51" in device.functions_supported
        assert "79" in device.functions_supported  # autoreclose
    # Top-tier 1200 must support full IEC + IEEE curves
    e2_1200 = next(d for d in e2_devices if d.meta.get("rated") == 1200)
    assert "IEC_NI" in e2_1200.curves_supported
    assert "IEC_VI" in e2_1200.curves_supported
    assert "IEEE_MI" in e2_1200.curves_supported
    # 1200 flagship: includes 87L (line differential), 21 (distance), PMU-ready
    assert "87L" in e2_1200.functions_supported
    assert "21" in e2_1200.functions_supported


def test_elektrometal_devices_sorted_deterministic() -> None:
    devices = list_devices(vendor="ELEKTROMETAL")
    ids = [d.device_id for d in devices]
    assert ids == sorted(ids), "Devices must be sorted deterministically by ID"
