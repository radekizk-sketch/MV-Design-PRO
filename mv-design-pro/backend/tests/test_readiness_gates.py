"""Readiness Gate tests — RUN #3E §3.

Tests that readiness gates block operations when BLOCKERs exist.
BINDING: any failure blocks merge.
"""

import pytest
from domain.readiness import (
    ReadinessAreaV1,
    ReadinessGateError,
    ReadinessIssueV1,
    ReadinessPriority,
    build_readiness_profile,
    require_export_ready,
    require_load_flow_ready,
    require_short_circuit_ready,
    require_sld_ready,
)


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


class TestSldReadinessGate:
    """SLD gate blocks when TOPOLOGY/STATIONS/GENERATORS have BLOCKERs."""

    def test_sld_ready_passes(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[],
        )
        require_sld_ready(profile)  # Should not raise

    def test_sld_blocked_by_topology(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[_make_issue("topo.missing", ReadinessAreaV1.TOPOLOGY)],
        )
        with pytest.raises(ReadinessGateError) as exc_info:
            require_sld_ready(profile)
        assert exc_info.value.gate == "sld_ready"
        assert len(exc_info.value.blockers) == 1

    def test_sld_blocked_by_generators(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[_make_issue("gen.variant_missing", ReadinessAreaV1.GENERATORS)],
        )
        with pytest.raises(ReadinessGateError):
            require_sld_ready(profile)

    def test_sld_not_blocked_by_catalogs(self) -> None:
        """Catalog issues don't block SLD rendering."""
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[_make_issue("cat.missing", ReadinessAreaV1.CATALOGS)],
        )
        # SLD should still be ready — catalogs don't block SLD
        assert profile.sld_ready is True
        require_sld_ready(profile)  # Should not raise

    def test_sld_warning_does_not_block(self) -> None:
        """WARNING issues don't block SLD."""
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue(
                    "topo.warn",
                    ReadinessAreaV1.TOPOLOGY,
                    ReadinessPriority.WARNING,
                ),
            ],
        )
        require_sld_ready(profile)  # Should not raise


class TestShortCircuitReadinessGate:
    """Short circuit gate blocks when TOPOLOGY/SOURCES/CATALOGS have BLOCKERs."""

    def test_sc_ready_passes(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[],
        )
        require_short_circuit_ready(profile)

    def test_sc_blocked_by_sources(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[_make_issue("src.missing", ReadinessAreaV1.SOURCES)],
        )
        with pytest.raises(ReadinessGateError) as exc_info:
            require_short_circuit_ready(profile)
        assert exc_info.value.gate == "short_circuit_ready"

    def test_sc_blocked_by_catalogs(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[_make_issue("cat.missing", ReadinessAreaV1.CATALOGS)],
        )
        with pytest.raises(ReadinessGateError):
            require_short_circuit_ready(profile)


class TestLoadFlowReadinessGate:
    """Load flow gate blocks when TOPOLOGY/SOURCES/CATALOGS have BLOCKERs."""

    def test_lf_ready_passes(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[],
        )
        require_load_flow_ready(profile)

    def test_lf_blocked_by_topology(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[_make_issue("topo.missing", ReadinessAreaV1.TOPOLOGY)],
        )
        with pytest.raises(ReadinessGateError):
            require_load_flow_ready(profile)


class TestExportReadinessGate:
    """Export gate blocks when ANY BLOCKERs exist."""

    def test_export_ready_passes(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[],
        )
        require_export_ready(profile)

    def test_export_blocked_by_any_blocker(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[_make_issue("protection.missing", ReadinessAreaV1.PROTECTION)],
        )
        with pytest.raises(ReadinessGateError) as exc_info:
            require_export_ready(profile)
        assert exc_info.value.gate == "export_ready"

    def test_export_warnings_do_not_block(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue("warn.1", ReadinessAreaV1.ANALYSIS, ReadinessPriority.WARNING),
                _make_issue("info.1", ReadinessAreaV1.ANALYSIS, ReadinessPriority.INFO),
            ],
        )
        require_export_ready(profile)  # Should not raise

    def test_export_multiple_blockers(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[
                _make_issue("topo.1", ReadinessAreaV1.TOPOLOGY),
                _make_issue("cat.1", ReadinessAreaV1.CATALOGS),
                _make_issue("gen.1", ReadinessAreaV1.GENERATORS),
            ],
        )
        with pytest.raises(ReadinessGateError) as exc_info:
            require_export_ready(profile)
        assert len(exc_info.value.blockers) == 3


class TestReadinessGateErrorMessage:
    """ReadinessGateError contains useful diagnostic info."""

    def test_error_message_contains_gate_name(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="s1",
            snapshot_fingerprint="fp1",
            issues=[_make_issue("test.code", ReadinessAreaV1.TOPOLOGY)],
        )
        with pytest.raises(ReadinessGateError) as exc_info:
            require_sld_ready(profile)
        assert "sld_ready" in str(exc_info.value)
        assert "test.code" in str(exc_info.value)
