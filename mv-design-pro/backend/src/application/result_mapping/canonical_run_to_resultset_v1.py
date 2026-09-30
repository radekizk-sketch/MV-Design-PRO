"""Kanoniczny przebieg -> zamrożony ``ResultSetV1``.

To jest jedyne miejsce, które składa publiczny kontrakt wynikowy z
``CanonicalRun``. Końcówka ogólna wyników i projekcje domenowe korzystają z
tego samego mappera, dzięki czemu żadna projekcja UI nie interpretuje surowego
wyniku solvera ani nie tworzy drugiej odmiany nakładki.

V12S-011 (``element_ref_id``, rejestr decyzji semantycznych): pole wypełnia TEN
mapper — jedyny producent ``ResultSetV1`` (karta RESULTSET-MARTWE-MAPPERY,
2026-09-30; dawny producent pola, martwy ``short_circuit_to_resultset_v1.py``,
skasowany). Reguła jest jedna dla każdego rodzaju biegu: ``element_ref_id`` to
``element_ref`` wtedy i tylko wtedy, gdy migawka ENM biegu zna element o tym
``ref_id``; wiersz o identyfikatorze bez odpowiednika w modelu (węzeł solvera)
dostaje ``None`` — nigdy zgadywany identyfikator.
"""

from __future__ import annotations

from typing import Any

from application.analyses.opis_przebiegu import stan_przebiegu_pl
from domain.result_builder_v1 import build_resultset_v1
from domain.result_contract_v1 import ResultSetV1
from enm.canonical_analysis import CanonicalRun, build_execution_result_set
from network_model.odmowa_danych import OdmowaDanychError


def ref_id_modelu(snapshot: dict[str, Any]) -> frozenset[str]:
    """Wszystkie ``ref_id`` elementów migawki ENM (każda kolekcja listowa modelu)."""
    return frozenset(
        str(element["ref_id"])
        for kolekcja in snapshot.values()
        if isinstance(kolekcja, list)
        for element in kolekcja
        if isinstance(element, dict) and element.get("ref_id")
    )


def build_resultset_v1_from_canonical_run(run: CanonicalRun) -> ResultSetV1:
    """Zbuduj zamrożony ``ResultSetV1`` dla zakończonego przebiegu."""
    if run.status != "FINISHED":
        raise OdmowaDanychError(f"Wyniki niedostępne — przebieg {stan_przebiegu_pl(run.status)}.")

    result_set = build_execution_result_set(run)
    znane_ref_id = ref_id_modelu(run.snapshot or {})
    element_results_raw = [
        {
            "element_ref": row["element_ref"],
            "element_type": row.get("element_type", "unknown"),
            "values": row.get("values", {}),
            "element_ref_id": (
                str(row["element_ref"]) if str(row["element_ref"]) in znane_ref_id else None
            ),
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
