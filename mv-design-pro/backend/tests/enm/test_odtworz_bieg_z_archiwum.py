"""Fabryka `odtworz_bieg_z_archiwum` (CV-3.3-B, odbiór): odtworzenie biegu z archiwum.

Klasa: JEDEN dom konstrukcji `CanonicalRun` poza `create_run`/`bieg_wariantu`
(R2 `scripts/scenario_copy_guard.py`). Test pinuje, że fabryka (a) przepisuje
pola historyczne 1:1, (b) podstawia WYŁĄCZNIE identyfikatory nadane przy
imporcie, (c) nie dotyka koperty ani migawki, (d) toleruje brak pól
opcjonalnych w starszym archiwum (domyślne jak w `CanonicalRun`).
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from enm.canonical_analysis import CanonicalRun, odtworz_bieg_z_archiwum

_DANE = {
    "id": "11111111-1111-1111-1111-111111111111",
    "case_id": "stary-case",
    "project_id": "stary-projekt",
    "analysis_type": "protection_sn",
    "status": "FINISHED",
    "created_at": "2026-09-05T10:00:00+00:00",
    "started_at": "2026-09-05T10:00:01+00:00",
    "finished_at": "2026-09-05T10:00:02+00:00",
    "snapshot_hash": "a" * 64,
    "input_hash": "b" * 64,
    "snapshot": {"buses": [{"ref_id": "b1"}]},
    "validation": {"errors": []},
    "readiness": {"codes": []},
    "options": {"sc_run_id": "22222222-2222-2222-2222-222222222222"},
    "error_message": None,
    "result_status": "STALE",
    "raw_result": {"devices": [{"ref": "r1"}]},
    "white_box_trace": [{"step": "1"}],
    "power_flow_trace": None,
    "envelope": {"project_id": "stary-projekt", "snapshot_hash": "a" * 64},
}


def test_pola_historyczne_1_do_1_a_identyfikatory_nowe() -> None:
    nowy_id = uuid4()
    opcje = {"sc_run_id": "33333333-3333-3333-3333-333333333333"}
    bieg = odtworz_bieg_z_archiwum(
        _DANE, run_id=nowy_id, case_id="nowy-case", project_id="nowy-projekt", options=opcje
    )
    assert isinstance(bieg, CanonicalRun)
    assert (bieg.id, bieg.case_id, bieg.project_id) == (nowy_id, "nowy-case", "nowy-projekt")
    assert bieg.options == opcje  # przemapowanie odwołań to obowiązek wołającego
    assert bieg.analysis_type == "protection_sn" and bieg.status == "FINISHED"
    assert bieg.created_at == datetime(2026, 9, 5, 10, 0, 0, tzinfo=UTC)
    assert bieg.started_at == datetime(2026, 9, 5, 10, 0, 1, tzinfo=UTC)
    assert bieg.finished_at == datetime(2026, 9, 5, 10, 0, 2, tzinfo=UTC)
    assert (bieg.snapshot_hash, bieg.input_hash) == ("a" * 64, "b" * 64)
    assert bieg.snapshot == _DANE["snapshot"] and bieg.snapshot is not _DANE["snapshot"]
    assert bieg.validation == _DANE["validation"] and bieg.readiness == _DANE["readiness"]
    assert bieg.result_status == "STALE"
    assert bieg.raw_result == _DANE["raw_result"]
    assert bieg.white_box_trace == [{"step": "1"}]
    assert bieg.power_flow_trace is None
    # koperta i migawka NIE są przemapowywane — zapis historyczny.
    assert bieg.envelope == {"project_id": "stary-projekt", "snapshot_hash": "a" * 64}


def test_brak_pol_opcjonalnych_daje_domyslne_canonical_run() -> None:
    dane = {
        k: v
        for k, v in _DANE.items()
        if k
        not in {
            "started_at",
            "finished_at",
            "error_message",
            "result_status",
            "raw_result",
            "white_box_trace",
            "power_flow_trace",
            "envelope",
        }
    }
    bieg = odtworz_bieg_z_archiwum(
        dane, run_id=UUID(int=7), case_id="c", project_id="p", options={}
    )
    assert bieg.started_at is None and bieg.finished_at is None
    assert bieg.error_message is None and bieg.result_status == "VALID"
    assert bieg.raw_result is None and bieg.white_box_trace == []
    assert bieg.power_flow_trace is None and bieg.envelope is None
    assert bieg.koperta is None
