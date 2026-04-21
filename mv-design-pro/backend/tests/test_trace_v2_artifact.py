"""
Tests for TraceArtifactV2 — PR-33 contract verification.

Tests:
- Serialization stability
- Ordering stability (sorted keys)
- Permutation invariance (inputs in different order → same signature)
- run_hash independence (does NOT depend on trace content)
- Canonical float consistency
"""

from __future__ import annotations

from domain.trace_v2.artifact import (
    AnalysisTypeV2,
    TraceArtifactV2,
    TraceEquationStep,
    TraceValue,
    build_trace_artifact_v2,
    canonical_float,
    compute_run_hash,
    compute_trace_signature,
)


def _make_step(step_id: str, substituted: str = "x = 1") -> TraceEquationStep:
    return TraceEquationStep(
        step_id=step_id,
        subject_id="node_1",
        eq_id="SC_IKSS",
        label_pl="Test step",
        symbolic_latex="I = U/Z",
        substituted_latex=substituted,
        inputs_used=("u", "z"),
        intermediate_values={
            "u": TraceValue(name="u", value=1000.0, unit="V", label_pl="Napięcie"),
        },
        result=TraceValue(name="i", value=100.0, unit="A", label_pl="Prąd"),
        origin="solver",
    )


def _make_artifact(
    substituted: str = "x = 1",
    extra_input: dict[str, TraceValue] | None = None,
) -> TraceArtifactV2:
    inputs = {
        "un_v": TraceValue(name="un_v", value=20000.0, unit="V", label_pl="Napięcie znamionowe"),
        "c_factor": TraceValue(name="c_factor", value=1.1, unit="—", label_pl="Współczynnik c"),
    }
    if extra_input:
        inputs.update(extra_input)

    return build_trace_artifact_v2(
        trace_id="test-trace-001",
        analysis_type=AnalysisTypeV2.SC,
        math_spec_version="1.0.0",
        snapshot_hash="abc123",
        run_hash=compute_run_hash("abc123", {"fault": "node1"}, "1.0.0"),
        inputs=inputs,
        equation_steps=[_make_step("SC_ZK_001", substituted)],
        outputs={
            "ikss_a": TraceValue(name="ikss_a", value=5000.0, unit="A", label_pl="Ik''"),
        },
    )


class TestSerializationStability:
    def test_to_dict_and_back(self) -> None:
        artifact = _make_artifact()
        d = artifact.to_dict()
        restored = TraceArtifactV2.from_dict(d)
        assert restored.trace_id == artifact.trace_id
        assert restored.analysis_type == artifact.analysis_type
        assert restored.trace_signature == artifact.trace_signature
        assert len(restored.equation_steps) == len(artifact.equation_steps)

    def test_signature_stable_across_serialization(self) -> None:
        a1 = _make_artifact()
        d = a1.to_dict()
        a2 = TraceArtifactV2.from_dict(d)
        # Rebuild signature for a2
        sig2 = compute_trace_signature(a2.to_canonical_dict())
        assert a1.trace_signature == sig2


class TestOrderingStability:
    def test_inputs_sorted(self) -> None:
        artifact = _make_artifact()
        d = artifact.to_dict()
        input_keys = list(d["inputs"].keys())
        assert input_keys == sorted(input_keys)

    def test_outputs_sorted(self) -> None:
        artifact = _make_artifact()
        d = artifact.to_dict()
        output_keys = list(d["outputs"].keys())
        assert output_keys == sorted(output_keys)

    def test_steps_sorted_by_step_id(self) -> None:
        steps = [_make_step("SC_ZK_003"), _make_step("SC_ZK_001"), _make_step("SC_ZK_002")]
        artifact = build_trace_artifact_v2(
            trace_id="test",
            analysis_type=AnalysisTypeV2.SC,
            math_spec_version="1.0.0",
            snapshot_hash="abc",
            run_hash="hash",
            inputs={},
            equation_steps=steps,
            outputs={},
        )
        ids = [s.step_id for s in artifact.equation_steps]
        assert ids == ["SC_ZK_001", "SC_ZK_002", "SC_ZK_003"]


class TestPermutationInvariance:
    def test_input_order_does_not_change_signature(self) -> None:
        inputs_a = {
            "z": TraceValue(name="z", value=1.0, unit="Ω", label_pl="Z"),
            "a": TraceValue(name="a", value=2.0, unit="V", label_pl="A"),
        }
        inputs_b = {
            "a": TraceValue(name="a", value=2.0, unit="V", label_pl="A"),
            "z": TraceValue(name="z", value=1.0, unit="Ω", label_pl="Z"),
        }

        a = build_trace_artifact_v2(
            trace_id="t1",
            analysis_type=AnalysisTypeV2.SC,
            math_spec_version="1.0.0",
            snapshot_hash="s",
            run_hash="r",
            inputs=inputs_a,
            equation_steps=[],
            outputs={},
        )
        b = build_trace_artifact_v2(
            trace_id="t1",
            analysis_type=AnalysisTypeV2.SC,
            math_spec_version="1.0.0",
            snapshot_hash="s",
            run_hash="r",
            inputs=inputs_b,
            equation_steps=[],
            outputs={},
        )
        assert a.trace_signature == b.trace_signature


class TestRunHashIndependence:
    def test_substituted_latex_change_does_not_change_run_hash(self) -> None:
        """Changing substituted_latex must NOT change run_hash but MAY change trace_signature."""
        a1 = _make_artifact(substituted="x = 1")
        a2 = _make_artifact(substituted="x = 999")
        assert a1.run_hash == a2.run_hash
        assert a1.trace_signature != a2.trace_signature

    def test_run_hash_deterministic(self) -> None:
        h1 = compute_run_hash("snap1", {"fault": "n1"}, "1.0.0")
        h2 = compute_run_hash("snap1", {"fault": "n1"}, "1.0.0")
        assert h1 == h2

    def test_run_hash_changes_with_input(self) -> None:
        h1 = compute_run_hash("snap1", {"fault": "n1"}, "1.0.0")
        h2 = compute_run_hash("snap1", {"fault": "n2"}, "1.0.0")
        assert h1 != h2


class TestCanonicalFloat:
    def test_consistency(self) -> None:
        assert canonical_float(0.1 + 0.2) == canonical_float(0.3)

    def test_precision(self) -> None:
        # 11 digits after decimal → rounds away at precision=10
        assert canonical_float(1.00000000001) == canonical_float(1.0)

    def test_zero(self) -> None:
        assert canonical_float(0.0) == 0.0

    def test_negative(self) -> None:
        assert canonical_float(-1.5) == -1.5
