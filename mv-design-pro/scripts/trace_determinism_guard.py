#!/usr/bin/env python3
"""
Trace v2 Determinism Guard — PR-39 (RUN #2B).

Verifies:
1. run_hash independence from trace content
2. trace_signature determinism (same input → same signature)
3. Permutation invariance (input order does not affect hashes)

Exit codes:
  0 = clean (all invariants hold)
  1 = violation found
"""

import os
import sys

# Support running from project root or scripts dir
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_SRC = os.path.join(os.path.dirname(_SCRIPT_DIR), "backend", "src")
if not os.path.isdir(_BACKEND_SRC):
    _BACKEND_SRC = os.path.join(_SCRIPT_DIR, "..", "backend", "src")
sys.path.insert(0, os.path.abspath(_BACKEND_SRC))


def check_run_hash_independence() -> bool:
    """run_hash must NOT depend on substituted_latex."""
    from domain.trace_v2.artifact import (
        AnalysisTypeV2,
        TraceEquationStep,
        TraceValue,
        build_trace_artifact_v2,
        compute_run_hash,
    )

    run_hash = compute_run_hash("snap", {"fault": "n1"}, "1.0.0")

    def make_step(sub: str) -> TraceEquationStep:
        return TraceEquationStep(
            step_id="S1",
            subject_id="n1",
            eq_id="EQ1",
            label_pl="test",
            symbolic_latex="x=y",
            substituted_latex=sub,
            inputs_used=(),
            intermediate_values={},
            result=TraceValue(name="r", value=1.0, unit="A", label_pl="r"),
            origin="solver",
        )

    a1 = build_trace_artifact_v2(
        trace_id="t1",
        analysis_type=AnalysisTypeV2.SC,
        math_spec_version="1.0.0",
        snapshot_hash="snap",
        run_hash=run_hash,
        inputs={},
        equation_steps=[make_step("x=1")],
        outputs={},
    )
    a2 = build_trace_artifact_v2(
        trace_id="t1",
        analysis_type=AnalysisTypeV2.SC,
        math_spec_version="1.0.0",
        snapshot_hash="snap",
        run_hash=run_hash,
        inputs={},
        equation_steps=[make_step("x=999")],
        outputs={},
    )

    if a1.run_hash != a2.run_hash:
        print("FAIL: run_hash changed when substituted_latex changed")
        return False
    if a1.trace_signature == a2.trace_signature:
        print("FAIL: trace_signature should differ when substituted_latex differs")
        return False
    return True


def check_trace_signature_determinism() -> bool:
    """Same TraceArtifactV2 → same trace_signature."""
    from domain.trace_v2.artifact import (
        AnalysisTypeV2,
        TraceValue,
        build_trace_artifact_v2,
    )

    kwargs = {
        "trace_id": "t1",
        "analysis_type": AnalysisTypeV2.SC,
        "math_spec_version": "1.0.0",
        "snapshot_hash": "snap",
        "run_hash": "hash",
        "inputs": {"a": TraceValue(name="a", value=1.0, unit="V", label_pl="A")},
        "equation_steps": [],
        "outputs": {},
    }

    a1 = build_trace_artifact_v2(**kwargs)
    a2 = build_trace_artifact_v2(**kwargs)

    if a1.trace_signature != a2.trace_signature:
        print("FAIL: trace_signature not deterministic")
        return False
    return True


def check_permutation_invariance() -> bool:
    """Input order must not affect trace_signature."""
    from domain.trace_v2.artifact import (
        AnalysisTypeV2,
        TraceValue,
        build_trace_artifact_v2,
    )

    inp_a = {
        "z": TraceValue(name="z", value=1.0, unit="Ω", label_pl="Z"),
        "a": TraceValue(name="a", value=2.0, unit="V", label_pl="A"),
    }
    inp_b = {
        "a": TraceValue(name="a", value=2.0, unit="V", label_pl="A"),
        "z": TraceValue(name="z", value=1.0, unit="Ω", label_pl="Z"),
    }

    a = build_trace_artifact_v2(
        trace_id="t1",
        analysis_type=AnalysisTypeV2.SC,
        math_spec_version="1.0.0",
        snapshot_hash="s",
        run_hash="r",
        inputs=inp_a,
        equation_steps=[],
        outputs={},
    )
    b = build_trace_artifact_v2(
        trace_id="t1",
        analysis_type=AnalysisTypeV2.SC,
        math_spec_version="1.0.0",
        snapshot_hash="s",
        run_hash="r",
        inputs=inp_b,
        equation_steps=[],
        outputs={},
    )

    if a.trace_signature != b.trace_signature:
        print("FAIL: permutation of inputs changed trace_signature")
        return False
    return True


def main() -> int:
    print("=== Trace v2 Determinism Guard ===")
    checks = [
        ("run_hash independence", check_run_hash_independence),
        ("trace_signature determinism", check_trace_signature_determinism),
        ("permutation invariance", check_permutation_invariance),
    ]

    all_passed = True
    for name, check_fn in checks:
        try:
            passed = check_fn()
        except ImportError as e:
            # BRAK ZALEZNOSCI TO NIE JEST NARUSZENIE DETERMINIZMU (V12K-263).
            # Bez `pydantic` kazde sprawdzenie rzucalo ImportError, a guard konczyl
            # sie komunikatem „TRACE DETERMINISM GUARD: VIOLATION DETECTED" z kodem 1.
            # Regresja instalacji wygladala wiec identycznie jak regresja fizyki —
            # najgorszy mozliwy falszywy alarm w guardzie determinizmu, bo uczy
            # ignorowac jego czerwien. Kod 2 = problem srodowiska (konwencja
            # `vulture_guard`), kod 1 = REALNE naruszenie.
            print(
                f"BRAK ZALEZNOSCI: {name} — {e}\n"
                "Zainstaluj zaleznosci sprawdzenia (`pip install pydantic`) "
                "i uruchom ponownie. To NIE jest naruszenie determinizmu.",
                file=sys.stderr,
            )
            return 2
        except Exception as e:
            print(f"FAIL: {name} — {e}")
            passed = False

        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {name}")
        if not passed:
            all_passed = False

    if all_passed:
        print("\nAll trace determinism checks passed.")
        return 0
    else:
        print("\nTRACE DETERMINISM GUARD: VIOLATION DETECTED")
        return 1


if __name__ == "__main__":
    sys.exit(main())
