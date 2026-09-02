"""Kanoniczny przebieg -> zamrożony ``ResultSetV1``.

To jest jedyne miejsce, które składa publiczny kontrakt wynikowy z
``CanonicalRun``. Końcówka ogólna wyników i projekcje domenowe korzystają z
tego samego mappera, dzięki czemu żadna projekcja UI nie interpretuje surowego
wyniku solvera ani nie tworzy drugiej odmiany nakładki.
"""

from __future__ import annotations

from domain.result_builder_v1 import build_resultset_v1
from domain.result_contract_v1 import ResultSetV1
from enm.canonical_analysis import CanonicalRun, build_execution_result_set


def build_resultset_v1_from_canonical_run(run: CanonicalRun) -> ResultSetV1:
    """Zbuduj zamrożony ``ResultSetV1`` dla zakończonego przebiegu."""
    if run.status != "FINISHED":
        raise ValueError(f"Wyniki niedostępne — status przebiegu: {run.status}")

    result_set = build_execution_result_set(run)
    element_results_raw = [
        {
            "element_ref": row["element_ref"],
            "element_type": row.get("element_type", "unknown"),
            "values": row.get("values", {}),
        }
        for row in result_set.get("element_results", [])
    ]
    return build_resultset_v1(
        run_id=str(run.id),
        analysis_type=result_set.get("analysis_type", ""),
        solver_input_hash=run.input_hash,
        validation=result_set.get("validation_snapshot", {}),
        readiness=result_set.get("readiness_snapshot", {}),
        element_results_raw=element_results_raw,
        global_results=result_set.get("global_results", {}),
        run_finished_at=run.finished_at.isoformat() if run.finished_at else None,
    )
