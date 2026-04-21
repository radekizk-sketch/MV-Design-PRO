"""
Tests for catalog drift detection — industrial grade.

Covers:
- Clean scenario (no drift)
- Version bump with solver field changes (BREAKING)
- Version bump with UI-only changes (INFORMATIONAL)
- Removed catalog item (REMOVED)
- Report determinism (same input → same hash)
- Empty bindings edge case
"""

from network_model.catalog.drift_detection import (
    DriftSeverity,
    ElementBinding,
    detect_drift,
    extract_bindings_from_snapshot,
)


class TestElementBinding:
    """Test ElementBinding extraction from snapshot dicts."""

    def test_extract_from_empty_snapshot(self):
        snapshot_dict = {"graph": {}}
        bindings = extract_bindings_from_snapshot(snapshot_dict)
        assert bindings == []

    def test_extract_bindings_with_catalog_binding(self):
        snapshot_dict = {
            "graph": {
                "branches": [
                    {
                        "id": "branch_1",
                        "name": "Kabel SN 1",
                        "catalog_binding": {
                            "catalog_namespace": "KABEL_SN",
                            "catalog_item_id": "kab_240",
                            "catalog_item_version": "2026.01",
                        },
                        "materialized_params": {
                            "r_ohm_per_km": 0.125,
                            "x_ohm_per_km": 0.088,
                        },
                    },
                ],
                "nodes": [
                    {"id": "node_1", "name": "Bus 1"},  # no binding
                ],
            },
        }
        bindings = extract_bindings_from_snapshot(snapshot_dict)
        assert len(bindings) == 1
        assert bindings[0].element_id == "branch_1"
        assert bindings[0].namespace == "KABEL_SN"
        assert bindings[0].catalog_item_id == "kab_240"
        assert bindings[0].materialized_values == {
            "r_ohm_per_km": 0.125,
            "x_ohm_per_km": 0.088,
        }

    def test_extract_bindings_sorted_by_id(self):
        snapshot_dict = {
            "graph": {
                "branches": [
                    {
                        "id": "z_branch",
                        "catalog_binding": {
                            "catalog_namespace": "KABEL_SN",
                            "catalog_item_id": "kab_1",
                            "catalog_item_version": "1.0",
                        },
                    },
                    {
                        "id": "a_branch",
                        "catalog_binding": {
                            "catalog_namespace": "KABEL_SN",
                            "catalog_item_id": "kab_2",
                            "catalog_item_version": "1.0",
                        },
                    },
                ],
            },
        }
        bindings = extract_bindings_from_snapshot(snapshot_dict)
        assert len(bindings) == 2
        assert bindings[0].element_id == "a_branch"
        assert bindings[1].element_id == "z_branch"


class TestDetectDrift:
    """Test drift detection logic."""

    def _make_binding(
        self,
        element_id: str = "elem_1",
        namespace: str = "KABEL_SN",
        item_id: str = "kab_240",
        version: str = "2026.01",
        materialized: dict | None = None,
    ) -> ElementBinding:
        return ElementBinding(
            element_id=element_id,
            element_label=f"Element {element_id}",
            namespace=namespace,
            catalog_item_id=item_id,
            catalog_item_version=version,
            materialized_values=materialized or {},
        )

    def test_no_drift_when_versions_match(self):
        bindings = [self._make_binding(version="2026.01")]
        catalog_items = {
            "KABEL_SN:kab_240": {"version": "2026.01", "r_ohm_per_km": 0.125},
        }
        report = detect_drift(bindings, catalog_items, {}, {})
        assert report.is_clean
        assert report.total_bindings_checked == 1
        assert len(report.drifts) == 0

    def test_breaking_drift_on_solver_field_change(self):
        bindings = [
            self._make_binding(
                version="2026.01",
                materialized={"r_ohm_per_km": 0.125, "x_ohm_per_km": 0.088},
            )
        ]
        catalog_items = {
            "KABEL_SN:kab_240": {
                "version": "2026.02",
                "r_ohm_per_km": 0.130,  # changed!
                "x_ohm_per_km": 0.088,
            },
        }
        solver_fields = {"KABEL_SN": ("r_ohm_per_km", "x_ohm_per_km")}
        report = detect_drift(bindings, catalog_items, solver_fields, {})

        assert not report.is_clean
        assert report.has_breaking_drifts
        assert report.breaking_count == 1
        assert report.drifts[0].severity == DriftSeverity.BREAKING
        assert "r_ohm_per_km" in report.drifts[0].changed_solver_fields

    def test_informational_drift_on_ui_only_change(self):
        bindings = [
            self._make_binding(
                version="2026.01",
                materialized={"r_ohm_per_km": 0.125, "name": "Old Name"},
            )
        ]
        catalog_items = {
            "KABEL_SN:kab_240": {
                "version": "2026.02",
                "r_ohm_per_km": 0.125,  # unchanged
                "name": "New Name",  # changed
            },
        }
        solver_fields = {"KABEL_SN": ("r_ohm_per_km",)}
        ui_fields = {"KABEL_SN": ("name",)}
        report = detect_drift(bindings, catalog_items, solver_fields, ui_fields)

        assert not report.is_clean
        assert not report.has_breaking_drifts
        assert report.informational_count == 1
        assert report.drifts[0].severity == DriftSeverity.INFORMATIONAL

    def test_removed_catalog_item(self):
        bindings = [self._make_binding()]
        catalog_items = {}  # item not in catalog
        report = detect_drift(bindings, catalog_items, {}, {})

        assert not report.is_clean
        assert report.removed_count == 1
        assert report.drifts[0].severity == DriftSeverity.REMOVED
        assert report.drifts[0].current_version is None

    def test_empty_bindings(self):
        report = detect_drift([], {}, {}, {})
        assert report.is_clean
        assert report.total_bindings_checked == 0


class TestDriftReportDeterminism:
    """Verify drift reports are deterministic."""

    def test_same_input_same_hash(self):
        bindings = [
            ElementBinding(
                element_id="elem_1",
                element_label="Element 1",
                namespace="KABEL_SN",
                catalog_item_id="kab_240",
                catalog_item_version="2026.01",
                materialized_values={"r_ohm_per_km": 0.125},
            ),
        ]
        catalog_items = {
            "KABEL_SN:kab_240": {"version": "2026.02", "r_ohm_per_km": 0.130},
        }
        solver_fields = {"KABEL_SN": ("r_ohm_per_km",)}

        report_1 = detect_drift(bindings, catalog_items, solver_fields, {})
        report_2 = detect_drift(bindings, catalog_items, solver_fields, {})

        assert report_1.report_hash == report_2.report_hash

    def test_different_input_different_hash(self):
        binding_a = [
            ElementBinding(
                element_id="elem_a",
                element_label="A",
                namespace="KABEL_SN",
                catalog_item_id="kab_1",
                catalog_item_version="1.0",
                materialized_values={},
            ),
        ]
        binding_b = [
            ElementBinding(
                element_id="elem_b",
                element_label="B",
                namespace="KABEL_SN",
                catalog_item_id="kab_2",
                catalog_item_version="1.0",
                materialized_values={},
            ),
        ]
        report_a = detect_drift(binding_a, {}, {}, {})
        report_b = detect_drift(binding_b, {}, {}, {})

        assert report_a.report_hash != report_b.report_hash
