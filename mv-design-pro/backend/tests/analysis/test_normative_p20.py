from __future__ import annotations

from datetime import datetime
from uuid import UUID

from analysis.normative.evaluator import NormativeEvaluator
from analysis.normative.models import NormativeConfig, NormativeStatus
from analysis.normative.serializer import STATUS_ORDER
from application.proof_engine.types import (
    ProofDocument,
    ProofHeader,
    ProofSummary,
    ProofType,
    ProofValue,
)

RUN_TS = datetime(2024, 1, 1, 12, 0, 0)


def _make_proof(
    *,
    proof_type: ProofType,
    key_results: dict[str, ProofValue],
    target_id: str = "T1",
    document_id: str = "00000000-0000-0000-0000-000000000001",
    artifact_id: str = "00000000-0000-0000-0000-000000000010",
) -> ProofDocument:
    header = ProofHeader(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        solver_version="test",
        target_id=target_id,
    )
    summary = ProofSummary(
        key_results=key_results,
        unit_check_passed=True,
        total_steps=0,
        warnings=(),
    )
    return ProofDocument(
        document_id=UUID(document_id),
        artifact_id=UUID(artifact_id),
        created_at=RUN_TS,
        proof_type=proof_type,
        title_pl="Test",
        header=header,
        steps=(),
        summary=summary,
    )


def test_normative_report_determinism() -> None:
    proofs = [
        _make_proof(
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            key_results={
                "k_i_percent": ProofValue.create("k_I", 90.0, "%", "k_i_percent"),
            },
            target_id="L1",
            document_id="00000000-0000-0000-0000-000000000101",
        ),
        _make_proof(
            proof_type=ProofType.PROTECTION_OVERCURRENT,
            key_results={
                "breaking_ok": ProofValue(
                    symbol="OK_{breaking}",
                    value="OK",
                    unit="—",
                    formatted="OK",
                    source_key="breaking_ok",
                ),
            },
            target_id="SW1",
            document_id="00000000-0000-0000-0000-000000000102",
        ),
    ]
    evaluator = NormativeEvaluator()
    config = NormativeConfig()

    report_a = evaluator.evaluate(proofs, config)
    report_b = evaluator.evaluate(proofs, config)

    assert report_a.to_dict() == report_b.to_dict()


def test_p15_thresholds_and_missing_keys() -> None:
    proofs = [
        _make_proof(
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            key_results={
                "k_i_percent": ProofValue.create("k_I", 120.0, "%", "k_i_percent"),
            },
            target_id="L_FAIL",
            document_id="00000000-0000-0000-0000-000000000201",
        ),
        _make_proof(
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            key_results={
                "k_i_percent": ProofValue.create("k_I", 90.0, "%", "k_i_percent"),
            },
            target_id="L_WARN",
            document_id="00000000-0000-0000-0000-000000000202",
        ),
        _make_proof(
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            key_results={
                "k_i_percent": ProofValue.create("k_I", 50.0, "%", "k_i_percent"),
            },
            target_id="L_PASS",
            document_id="00000000-0000-0000-0000-000000000203",
        ),
        _make_proof(
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            key_results={},
            target_id="L_MISSING",
            document_id="00000000-0000-0000-0000-000000000204",
        ),
    ]
    evaluator = NormativeEvaluator()
    report = evaluator.evaluate(proofs, NormativeConfig())
    p15_items = {item.target_id: item for item in report.items if item.rule_id == "NR_P15_001"}

    assert p15_items["L_FAIL"].status == NormativeStatus.FAIL
    assert p15_items["L_WARN"].status == NormativeStatus.WARNING
    assert p15_items["L_PASS"].status == NormativeStatus.PASS
    assert p15_items["L_MISSING"].status == NormativeStatus.NOT_COMPUTED


def test_p18_boolean_statuses() -> None:
    proofs = [
        _make_proof(
            proof_type=ProofType.PROTECTION_OVERCURRENT,
            key_results={
                "breaking_ok": ProofValue(
                    symbol="OK_{breaking}",
                    value="NOT_OK",
                    unit="—",
                    formatted="NOT_OK",
                    source_key="breaking_ok",
                ),
            },
            target_id="SW_FAIL",
            document_id="00000000-0000-0000-0000-000000000301",
        ),
        _make_proof(
            proof_type=ProofType.PROTECTION_OVERCURRENT,
            key_results={},
            target_id="SW_MISSING",
            document_id="00000000-0000-0000-0000-000000000302",
        ),
    ]
    evaluator = NormativeEvaluator()
    report = evaluator.evaluate(proofs, NormativeConfig())
    p18_items = {item.target_id: item for item in report.items if item.rule_id == "NR_P18_001"}

    assert p18_items["SW_FAIL"].status == NormativeStatus.FAIL
    assert p18_items["SW_MISSING"].status == NormativeStatus.NOT_COMPUTED


def test_p19_limits_and_not_evaluated() -> None:
    proof = _make_proof(
        proof_type=ProofType.EARTHING_GROUND_FAULT_SN,
        key_results={
            "u_touch_v": ProofValue.create("U_d", 120.0, "V", "u_touch_v"),
        },
        target_id="EARTH",
        document_id="00000000-0000-0000-0000-000000000401",
    )
    evaluator = NormativeEvaluator()

    report_no_limits = evaluator.evaluate([proof], NormativeConfig())
    item_no_limits = next(item for item in report_no_limits.items if item.rule_id == "NR_P19_001")
    assert item_no_limits.status == NormativeStatus.NOT_EVALUATED

    report_warn = evaluator.evaluate(
        [proof],
        NormativeConfig(touch_voltage_warn_v=100.0, touch_voltage_fail_v=150.0),
    )
    item_warn = next(item for item in report_warn.items if item.rule_id == "NR_P19_001")
    assert item_warn.status == NormativeStatus.WARNING

    report_fail = evaluator.evaluate(
        [proof],
        NormativeConfig(touch_voltage_warn_v=100.0, touch_voltage_fail_v=110.0),
    )
    item_fail = next(item for item in report_fail.items if item.rule_id == "NR_P19_001")
    assert item_fail.status == NormativeStatus.FAIL


def test_sorting_is_deterministic() -> None:
    proofs = [
        _make_proof(
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            key_results={
                "k_i_percent": ProofValue.create("k_I", 120.0, "%", "k_i_percent"),
                "k_s_percent": ProofValue.create("k_S", 120.0, "%", "k_s_percent"),
            },
            target_id="L1",
            document_id="00000000-0000-0000-0000-000000000501",
        ),
        _make_proof(
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            key_results={
                "k_i_percent": ProofValue.create("k_I", 90.0, "%", "k_i_percent"),
                "k_s_percent": ProofValue.create("k_S", 90.0, "%", "k_s_percent"),
            },
            target_id="L2",
            document_id="00000000-0000-0000-0000-000000000502",
        ),
        _make_proof(
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            key_results={
                "k_i_percent": ProofValue.create("k_I", 50.0, "%", "k_i_percent"),
                "k_s_percent": ProofValue.create("k_S", 50.0, "%", "k_s_percent"),
            },
            target_id="L3",
            document_id="00000000-0000-0000-0000-000000000503",
        ),
    ]
    evaluator = NormativeEvaluator()
    report = evaluator.evaluate(proofs, NormativeConfig())

    order_values = [STATUS_ORDER[item.status] for item in report.items]
    assert order_values == sorted(order_values)

    same_status_items = [item for item in report.items if item.status == report.items[-1].status]
    rule_ids = [item.rule_id for item in same_status_items]
    assert rule_ids == sorted(rule_ids)
