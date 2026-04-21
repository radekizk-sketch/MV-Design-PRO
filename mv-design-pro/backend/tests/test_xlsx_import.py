"""Tests for XLSX Network Importer — Import sieci SN z arkuszy."""

import pytest
from application.xlsx_import.importer import (
    XlsxImportResult,
    XlsxNetworkImporter,
)


def _make_buses():
    return [
        {"id": "B1", "nazwa": "Szyna główna 15kV", "napięcie_kV": 15.0},
        {"id": "B2", "nazwa": "Szyna odbiorcza", "napięcie_kV": 15.0},
    ]


def _make_lines(from_id="B1", to_id="B2"):
    return [
        {
            "id": "L1",
            "szyna_pocz": from_id,
            "szyna_kon": to_id,
            "typ": "YAKY 3x120",
            "długość_km": 5.0,
            "R_ohm_km": 0.253,
            "X_ohm_km": 0.081,
        },
    ]


def _make_data(**overrides):
    """Create minimal valid import dict."""
    data = {
        "Szyny": _make_buses(),
        "Linie": _make_lines(),
    }
    data.update(overrides)
    return data


class TestXlsxImporterFromDict:
    """Tests for import_from_dict (no openpyxl dependency)."""

    def test_minimal_import_success(self):
        importer = XlsxNetworkImporter()
        result = importer.import_from_dict(_make_data())
        assert result.success is True
        assert result.bus_count == 2
        assert result.branch_count == 1
        assert result.graph is not None

    def test_missing_required_sheet_szyny(self):
        importer = XlsxNetworkImporter()
        result = importer.import_from_dict({"Linie": _make_lines()})
        assert result.success is False
        assert any("Szyny" in e for e in result.errors)

    def test_missing_required_sheet_linie(self):
        importer = XlsxNetworkImporter()
        result = importer.import_from_dict({"Szyny": _make_buses()})
        assert result.success is False
        assert any("Linie" in e for e in result.errors)

    def test_cross_reference_error_line_to_nonexistent_bus(self):
        importer = XlsxNetworkImporter()
        data = {
            "Szyny": _make_buses(),
            "Linie": _make_lines(from_id="INVALID"),
        }
        result = importer.import_from_dict(data)
        assert result.success is False
        assert any("szyna_pocz" in e for e in result.errors)

    def test_negative_voltage_rejected(self):
        importer = XlsxNetworkImporter()
        data = {
            "Szyny": [
                {"id": "B1", "nazwa": "S1", "napięcie_kV": -5.0},
                {"id": "B2", "nazwa": "S2", "napięcie_kV": 15.0},
            ],
            "Linie": _make_lines(),
        }
        result = importer.import_from_dict(data)
        assert result.success is False
        assert any("napięcie_kV" in e for e in result.errors)

    def test_negative_line_length_rejected(self):
        importer = XlsxNetworkImporter()
        data = {
            "Szyny": _make_buses(),
            "Linie": [
                {
                    "id": "L1",
                    "szyna_pocz": "B1",
                    "szyna_kon": "B2",
                    "typ": "YAKY",
                    "długość_km": -1.0,
                    "R_ohm_km": 0.1,
                    "X_ohm_km": 0.1,
                },
            ],
        }
        result = importer.import_from_dict(data)
        assert result.success is False
        assert any("długość_km" in e for e in result.errors)

    def test_duplicate_bus_ids_rejected(self):
        importer = XlsxNetworkImporter()
        data = {
            "Szyny": [
                {"id": "B1", "nazwa": "S1", "napięcie_kV": 15.0},
                {"id": "B1", "nazwa": "S2", "napięcie_kV": 15.0},
            ],
            "Linie": _make_lines(),
        }
        result = importer.import_from_dict(data)
        assert result.success is False
        assert any("Duplikaty" in e for e in result.errors)


class TestXlsxImporterWithOptionalSheets:
    """Tests with optional sheets: Trafo, Źródła, Odbiory."""

    def test_import_with_trafos(self):
        importer = XlsxNetworkImporter()
        data = _make_data()
        data["Szyny"].append({"id": "B3", "nazwa": "Szyna nN", "napięcie_kV": 0.4})
        data["Trafo"] = [
            {
                "id": "T1",
                "szyna_HV": "B1",
                "szyna_LV": "B3",
                "Sn_MVA": 0.4,
                "uk_pct": 6.0,
            },
        ]
        result = importer.import_from_dict(data)
        assert result.success is True
        assert result.trafo_count == 1
        assert result.branch_count == 2  # 1 line + 1 trafo

    def test_import_with_sources(self):
        importer = XlsxNetworkImporter()
        data = _make_data()
        data["Źródła"] = [
            {
                "id": "S1",
                "szyna": "B1",
                "typ": "system",
                "Sk_MVA": 500.0,
                "RX_ratio": 0.1,
            },
        ]
        result = importer.import_from_dict(data)
        assert result.success is True
        assert result.source_count == 1

    def test_import_with_loads(self):
        importer = XlsxNetworkImporter()
        data = _make_data()
        data["Odbiory"] = [
            {"id": "D1", "szyna": "B2", "P_MW": 1.5, "Q_Mvar": 0.3},
        ]
        result = importer.import_from_dict(data)
        assert result.success is True
        assert result.load_count == 1
        assert len(result.warnings) >= 1


class TestXlsxImportResultToDict:
    """Tests for result serialization."""

    def test_to_dict_contains_all_keys(self):
        result = XlsxImportResult(
            success=True,
            graph=None,
            bus_count=5,
            branch_count=3,
            source_count=1,
            load_count=2,
            trafo_count=1,
        )
        d = result.to_dict()
        assert d["success"] is True
        assert d["bus_count"] == 5
        assert d["branch_count"] == 3
        assert d["source_count"] == 1
        assert d["load_count"] == 2
        assert d["trafo_count"] == 1
        assert "warnings" in d
        assert "errors" in d

    def test_to_dict_with_errors(self):
        result = XlsxImportResult(
            success=False,
            graph=None,
            errors=["Brak arkusza", "Duplikat"],
        )
        d = result.to_dict()
        assert d["success"] is False
        assert len(d["errors"]) == 2


class TestXlsxGraphBuilding:
    """Tests for correct graph topology building."""

    def test_graph_has_correct_nodes(self):
        importer = XlsxNetworkImporter()
        result = importer.import_from_dict(_make_data())
        assert result.graph is not None
        assert "B1" in result.graph.nodes
        assert "B2" in result.graph.nodes

    def test_graph_has_correct_branches(self):
        importer = XlsxNetworkImporter()
        result = importer.import_from_dict(_make_data())
        assert result.graph is not None
        assert len(result.graph.branches) == 1

    def test_source_assigns_slack_node(self):
        importer = XlsxNetworkImporter()
        data = _make_data()
        data["Źródła"] = [
            {
                "id": "S1",
                "szyna": "B1",
                "typ": "system",
                "Sk_MVA": 500.0,
                "RX_ratio": 0.1,
            },
        ]
        result = importer.import_from_dict(data)
        assert result.graph is not None
        from network_model.core.node import NodeType

        b1 = result.graph.nodes["B1"]
        assert b1.node_type == NodeType.SLACK

    def test_load_aggregated_on_bus(self):
        importer = XlsxNetworkImporter()
        data = _make_data()
        data["Odbiory"] = [
            {"id": "D1", "szyna": "B2", "P_MW": 1.0, "Q_Mvar": 0.2},
            {"id": "D2", "szyna": "B2", "P_MW": 0.5, "Q_Mvar": 0.1},
        ]
        result = importer.import_from_dict(data)
        assert result.graph is not None
        b2 = result.graph.nodes["B2"]
        # Loads are negative injection on PQ node
        assert b2.active_power == pytest.approx(-1.5, rel=0.01)
        assert b2.reactive_power == pytest.approx(-0.3, rel=0.01)
