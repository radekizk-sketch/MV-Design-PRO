"""
Test schema lock for solver-input contract.

INVARIANT: JSON schema of the envelope and payloads is locked.
Changes require an explicit version bump + test update.

This test snapshots the Pydantic model_json_schema() output
and verifies it has not changed.
"""

import json

from solver_input.contracts import (
    SOLVER_INPUT_CONTRACT_VERSION,
    EligibilityMap,
    LoadFlowPayload,
    ShortCircuitPayload,
    SolverInputEnvelope,
)


def _normalize_schema(schema: dict) -> str:
    """Normalize schema to deterministic JSON for comparison."""
    return json.dumps(schema, sort_keys=True, indent=2)


class TestSchemaLock:
    """Schema snapshot tests for solver-input contract v1.0."""

    def test_contract_version_is_1_0(self):
        """Contract version is 1.0."""
        assert SOLVER_INPUT_CONTRACT_VERSION == "1.0"

    def test_envelope_schema_has_required_fields(self):
        """SolverInputEnvelope schema has all required top-level fields."""
        schema = SolverInputEnvelope.model_json_schema()
        props = schema.get("properties", {})

        required_fields = [
            "solver_input_version",
            "case_id",
            "enm_revision",
            "analysis_type",
            "eligibility",
            "provenance_summary",
            "payload",
            "trace",
        ]
        for field in required_fields:
            assert field in props, f"Missing required field '{field}' in envelope schema"

    def test_short_circuit_payload_schema_fields(self):
        """ShortCircuitPayload schema has all required fields."""
        schema = ShortCircuitPayload.model_json_schema()
        props = schema.get("properties", {})

        required_fields = [
            "buses",
            "branches",
            "transformers",
            "inverter_sources",
            "switches",
            "c_factor",
            "thermal_time_seconds",
            "include_inverter_contribution",
        ]
        for field in required_fields:
            assert field in props, f"Missing field '{field}' in ShortCircuitPayload schema"

    def test_load_flow_payload_schema_fields(self):
        """LoadFlowPayload schema has all required fields."""
        schema = LoadFlowPayload.model_json_schema()
        props = schema.get("properties", {})

        required_fields = [
            "buses",
            "branches",
            "transformers",
            "inverter_sources",
            "switches",
            "base_mva",
            "max_iterations",
            "tolerance",
        ]
        for field in required_fields:
            assert field in props, f"Missing field '{field}' in LoadFlowPayload schema"

    def test_envelope_schema_stability(self):
        """Envelope schema must not change without version bump."""
        schema = SolverInputEnvelope.model_json_schema()
        props = set(schema.get("properties", {}).keys())

        # Frozen set of expected properties for v1.0 (audit2_extensions added in Phase 52)
        expected_props = {
            "solver_input_version",
            "case_id",
            "enm_revision",
            "analysis_type",
            "eligibility",
            "provenance_summary",
            "payload",
            "trace",
            "audit2_extensions",
        }
        assert props == expected_props, (
            f"Envelope schema changed. "
            f"Added: {props - expected_props}. "
            f"Removed: {expected_props - props}. "
            f"This requires a version bump in SOLVER_INPUT_CONTRACT_VERSION."
        )

    def test_short_circuit_payload_schema_stability(self):
        """ShortCircuitPayload schema must not change without version bump."""
        schema = ShortCircuitPayload.model_json_schema()
        props = set(schema.get("properties", {}).keys())

        expected_props = {
            "buses",
            "branches",
            "transformers",
            "inverter_sources",
            "switches",
            "c_factor",
            "thermal_time_seconds",
            "include_inverter_contribution",
            # K3 wizard "Uproszczony" mode (P0.9 V12K K3 toggle): Sk_SN + R/X
            # zamiast pelnego 110 kV + TR + GPZ modelu. Optional field.
            "simplified_grid_source",
            # Karta P0.3 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md): MAX (default) |
            # MIN scenario selector for c per pasmo — additive, backward
            # compatible (same precedent as simplified_grid_source above).
            "scenario",
        }
        assert props == expected_props, (
            f"ShortCircuitPayload schema changed. "
            f"Added: {props - expected_props}. "
            f"Removed: {expected_props - props}. "
            f"This requires a version bump."
        )

    def test_load_flow_payload_schema_stability(self):
        """LoadFlowPayload schema must not change without version bump."""
        schema = LoadFlowPayload.model_json_schema()
        props = set(schema.get("properties", {}).keys())

        expected_props = {
            "buses",
            "branches",
            "transformers",
            "inverter_sources",
            "switches",
            "base_mva",
            "max_iterations",
            "tolerance",
        }
        assert props == expected_props, (
            f"LoadFlowPayload schema changed. "
            f"Added: {props - expected_props}. "
            f"Removed: {expected_props - props}. "
            f"This requires a version bump."
        )

    def test_eligibility_map_schema_stability(self):
        """EligibilityMap schema must not change without version bump."""
        schema = EligibilityMap.model_json_schema()
        props = set(schema.get("properties", {}).keys())

        expected_props = {"entries"}
        assert props == expected_props

    def test_schema_is_json_serializable(self):
        """All schemas are JSON-serializable."""
        for model in [
            SolverInputEnvelope,
            ShortCircuitPayload,
            LoadFlowPayload,
            EligibilityMap,
        ]:
            schema = model.model_json_schema()
            # Should not raise
            json_str = json.dumps(schema, sort_keys=True)
            assert len(json_str) > 0

    def test_default_c_factor(self):
        """Default c_factor in ShortCircuitPayload is 1.10 (IEC 60909 MV max)."""
        payload = ShortCircuitPayload()
        assert payload.c_factor == 1.10

    def test_default_base_mva(self):
        """Default base_mva in LoadFlowPayload is 100.0."""
        payload = LoadFlowPayload()
        assert payload.base_mva == 100.0
