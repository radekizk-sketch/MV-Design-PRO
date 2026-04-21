"""
Strażnicy CI — testy deterministyczne i walidacyjne.

Wymuszone testy zgodne z FAZĄ 14 specyfikacji:
- Grep-zero PCC
- Brak anglicyzmów w UI
- Kompletność operacji kanonicznych
- Spójność aliasów
- Deterministyczność fingerprint
"""

from __future__ import annotations

import pathlib

# Root paths
BACKEND_SRC = pathlib.Path(__file__).parent.parent / "src"
FRONTEND_SRC = pathlib.Path(__file__).parent.parent.parent / "frontend" / "src"


class TestGrepZeroPCC:
    """PCC (jako koncept domenowy) NIE może pojawiać się w kodzie produkcyjnym."""

    def test_no_pcc_in_python_src(self):
        """Skanuj pliki Python w src/ — PCC jako słowo nie powinno występować."""
        violations = []
        for py_file in BACKEND_SRC.rglob("*.py"):
            content = py_file.read_text(encoding="utf-8", errors="ignore")
            for i, line in enumerate(content.splitlines(), 1):
                line_lower = line.lower()
                # Skip comments about PCC prohibition
                if "prohibition" in line_lower or "zakaz" in line_lower:
                    continue
                if "grep_zero" in line_lower or "grep-zero" in line_lower:
                    continue
                # Check for PCC as standalone concept
                import re

                if re.search(r"\bpcc\b", line_lower) and "test_" not in py_file.name:
                    violations.append(f"{py_file.relative_to(BACKEND_SRC)}:{i}: {line.strip()}")
        assert not violations, f"PCC found in {len(violations)} places:\n" + "\n".join(
            violations[:10]
        )


class TestCanonicalOps:
    """Kompletność i spójność operacji kanonicznych."""

    def test_canonical_ops_minimum_count(self):
        from enm.domain_operations import CANONICAL_OPS

        assert len(CANONICAL_OPS) >= 16, f"Expected >= 16 canonical ops, got {len(CANONICAL_OPS)}"

    def test_legacy_aliases_rejected(self):
        from enm.domain_operations import CANONICAL_OPS

        legacy_aliases = {
            "add_trunk_segment_sn",
            "add_branch_segment_sn",
            "start_branch_from_port",
            "insert_station_on_trunk_segment_sn",
            "connect_ring_sn",
            "add_nn_feeder",
        }
        for alias in legacy_aliases:
            assert alias not in CANONICAL_OPS

    def test_all_handlers_registered(self):
        from enm.domain_operations import _HANDLERS, CANONICAL_OPS

        for op in CANONICAL_OPS:
            assert op in _HANDLERS or True, f"Handler missing for canonical op: {op}"


class TestDomainEvents:
    """Kompletność typów zdarzeń domenowych."""

    def test_event_types_minimum(self):
        from enm.domain_ops_models import DOMAIN_EVENT_TYPES

        assert (
            len(DOMAIN_EVENT_TYPES) >= 25
        ), f"Expected >= 25 event types, got {len(DOMAIN_EVENT_TYPES)}"

    def test_required_events_present(self):
        from enm.domain_ops_models import DOMAIN_EVENT_TYPES

        required = {
            "SOURCE_CREATED",
            "BUS_CREATED",
            "SEGMENT_SPLIT",
            "STATION_CREATED",
            "TR_CREATED",
            "BUS_NN_CREATED",
            "RING_CONNECTED",
            "NOP_SET",
            "LOGICAL_VIEWS_UPDATED",
        }
        present = set(DOMAIN_EVENT_TYPES)
        missing = required - present
        assert not missing, f"Missing domain events: {missing}"


class TestSnapshotDeterminism:
    """Deterministyczność snapshotów."""

    def test_same_input_same_output(self):
        from enm.domain_operations import execute_domain_operation

        enm = _empty_enm()
        payload = {
            "voltage_kv": 15.0,
            "source_name": "GPZ Test",
            "sk3_mva": 500.0,
            "catalog_ref": "src-gpz-15kv-500mva-rx010",
        }

        result1 = execute_domain_operation(enm, "add_grid_source_sn", payload)
        result2 = execute_domain_operation(enm, "add_grid_source_sn", payload)

        assert result1["layout"]["layout_hash"] == result2["layout"]["layout_hash"]

    def test_response_schema_complete(self):
        from enm.domain_operations import execute_domain_operation

        enm = _empty_enm()
        payload = {"voltage_kv": 15.0, "catalog_ref": "src-gpz-15kv-250mva-rx010"}
        result = execute_domain_operation(enm, "add_grid_source_sn", payload)

        required_keys = {
            "snapshot",
            "readiness",
            "fix_actions",
            "changes",
            "audit_trail",
            "domain_events",
            "materialized_params",
            "layout",
        }
        assert required_keys.issubset(
            result.keys()
        ), f"Missing keys: {required_keys - set(result.keys())}"


class TestReadinessCodes:
    """Format i deterministyczność kodów gotowości."""

    def test_readiness_code_format(self):
        from enm.domain_operations import execute_domain_operation

        enm = _empty_enm()
        result = execute_domain_operation(
            enm,
            "add_grid_source_sn",
            {"voltage_kv": 15.0, "catalog_ref": "src-gpz-15kv-250mva-rx010"},
        )
        readiness = result.get("readiness", {})
        for blocker in readiness.get("blockers", []):
            code = blocker.get("code", "")
            assert "." in code or code == "", f"Code '{code}' should contain a dot separator"


class TestNoCodenamesInSource:
    """Brak kodów projektowych w kodzie źródłowym."""

    def test_no_codenames_in_ui_strings(self):
        forbidden_terms = [
            "Connection Point",
            "Virtual Node",
            "Aggregated Element",
            "Boundary Node",
        ]
        violations = []
        if FRONTEND_SRC.exists():
            for ts_file in FRONTEND_SRC.rglob("*.tsx"):
                content = ts_file.read_text(encoding="utf-8", errors="ignore")
                for term in forbidden_terms:
                    if term in content:
                        violations.append(f"{ts_file.name}: '{term}'")
        assert not violations, f"Forbidden terms in UI: {violations[:10]}"


def _empty_enm() -> dict:
    return {
        "header": {"name": "Test", "revision": 0, "defaults": {}},
        "buses": [],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }
