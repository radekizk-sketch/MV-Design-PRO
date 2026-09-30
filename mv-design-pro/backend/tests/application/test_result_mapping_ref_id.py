"""V12S-011 — ``element_ref_id`` w ``ResultSetV1`` na ŻYWYM producencie kontraktu.

Karta RESULTSET-MARTWE-MAPPERY (2026-09-30, zgoda B-01 w decyzji O-59): jedynym
producentem ``ResultSetV1`` jest ``application/result_mapping/canonical_run_to_resultset_v1.py``.
Dawny wypełniacz pola (martwy ``short_circuit_to_resultset_v1.py``, 0 importerów w
``src``) skasowany; ten plik przypina inwariant tam, gdzie wynik naprawdę powstaje.

Inwariant (jedno źródło prawdy dla wejścia i wyjścia — migawka ENM biegu):
``element_ref_id == element_ref`` ⇔ migawka zna element o tym ``ref_id``; w przeciwnym
razie ``None`` (nigdy zgadywany identyfikator).

Iloczyn cech: {zwarcia, rozpływ, zabezpieczenia} × {ref_id obecny w modelu, brak}.
Zwarcia i rozpływ liczone realnym biegiem kanonicznym; bieg zabezpieczeń dostaje
wynik w kształcie ``protection_result`` (gałąź ``protection_sn`` projekcji czyta go
wprost), bo inwariant dotyczy mappera, nie silnika zabezpieczeń.

Intencje skasowanych testów martwego mappera zachowane tutaj: determinizm podpisu
(ten sam bieg → ta sama sygnatura), sortowanie wyników po ``element_ref``, pole
opcjonalne z domyślnym ``None`` i jego przejście przez serializację kontraktu.
"""

from __future__ import annotations

import dataclasses
from typing import Any

import pytest
from application.result_mapping.canonical_run_to_resultset_v1 import (
    build_resultset_v1_from_canonical_run,
    ref_id_modelu,
)
from domain.result_contract_v1 import ElementResultV1, ResultSetV1
from enm.canonical_analysis import (
    CanonicalRun,
    _execute_power_flow,
    _execute_short_circuit,
)

from tests.application.analyses.lv_domain.scenariusze_nn import SCENARIUSZE
from tests.golden.parytet_assemblera.harness import _bieg

_SC_3F = {"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0}
_REF_SPOZA_MODELU = "element-spoza-modelu"


def _snapshot() -> dict[str, Any]:
    return SCENARIUSZE[0].budowniczy().model_dump(mode="json")


def _bieg_zwarc() -> CanonicalRun:
    enm = SCENARIUSZE[0].budowniczy()
    run = _bieg(enm, klucz="ref-id-sc", analysis_type="short_circuit_sn", options=_SC_3F)
    _execute_short_circuit(run)
    return run


def _bieg_rozplywu() -> CanonicalRun:
    enm = SCENARIUSZE[0].budowniczy()
    run = _bieg(enm, klucz="ref-id-pf", analysis_type="PF", options={})
    _execute_power_flow(run)
    return run


def _bieg_zabezpieczen() -> CanonicalRun:
    """Bieg ``protection_sn``: ocena na gałęzi modelu i na elemencie spoza modelu."""
    enm = SCENARIUSZE[0].budowniczy()
    run = _bieg(enm, klucz="ref-id-prot", analysis_type="protection_sn", options={})
    galaz = str(_snapshot()["branches"][0]["ref_id"])
    run.raw_result = {
        "sc_run_id": "bieg-zwarc",
        "protection_result": {
            "evaluations": [
                {
                    "protected_element_ref": galaz,
                    "fault_target_id": "wezel-solvera-1",
                    "trip_state": "TRIPS",
                    "t_trip_s": 0.5,
                },
                {
                    "protected_element_ref": _REF_SPOZA_MODELU,
                    "fault_target_id": "wezel-solvera-2",
                    "trip_state": "NO_TRIP",
                    "t_trip_s": None,
                },
            ],
            "summary": {"trips_count": 1, "no_trip_count": 1, "invalid_count": 0},
        },
    }
    return run


_BIEGI = {
    "zwarcia": _bieg_zwarc,
    "rozplyw": _bieg_rozplywu,
    "zabezpieczenia": _bieg_zabezpieczen,
}


@pytest.fixture(scope="module", params=sorted(_BIEGI))
def bieg(request: pytest.FixtureRequest) -> tuple[str, CanonicalRun]:
    return request.param, _BIEGI[request.param]()


def _bez_elementu(run: CanonicalRun, ref_id: str) -> CanonicalRun:
    """Ten sam wynik na migawce, która NIE zna elementu ``ref_id`` (cecha „brak")."""
    snapshot = {
        klucz: (
            [e for e in wartosc if not (isinstance(e, dict) and e.get("ref_id") == ref_id)]
            if isinstance(wartosc, list)
            else wartosc
        )
        for klucz, wartosc in run.snapshot.items()
    }
    return dataclasses.replace(run, snapshot=snapshot)


def _predykat_parami(run: CanonicalRun, rs: ResultSetV1) -> None:
    znane = ref_id_modelu(run.snapshot)
    for er in rs.element_results:
        if er.element_ref in znane:
            assert er.element_ref_id == er.element_ref, er
        else:
            assert er.element_ref_id is None, er


class TestRefIdObecny:
    def test_element_z_modelu_niesie_ref_id(self, bieg: tuple[str, CanonicalRun]) -> None:
        rodzaj, run = bieg
        rs = build_resultset_v1_from_canonical_run(run)
        assert rs.element_results, rodzaj
        obecne = [er for er in rs.element_results if er.element_ref_id is not None]
        assert obecne, f"{rodzaj}: żaden wynik nie niesie ref_id modelu"
        _predykat_parami(run, rs)


class TestRefIdBrak:
    def test_element_spoza_modelu_ma_none(self, bieg: tuple[str, CanonicalRun]) -> None:
        rodzaj, run = bieg
        pierwszy = build_resultset_v1_from_canonical_run(run).element_results[0]
        assert pierwszy.element_ref_id == pierwszy.element_ref
        okrojony = _bez_elementu(run, pierwszy.element_ref)
        rs = build_resultset_v1_from_canonical_run(okrojony)
        wiersz = next(er for er in rs.element_results if er.element_ref == pierwszy.element_ref)
        assert wiersz.element_ref_id is None, rodzaj
        _predykat_parami(okrojony, rs)

    def test_zabezpieczenia_ref_spoza_modelu_bez_okrajania(self) -> None:
        run = _bieg_zabezpieczen()
        rs = build_resultset_v1_from_canonical_run(run)
        po_ref = {er.element_ref: er.element_ref_id for er in rs.element_results}
        assert po_ref[_REF_SPOZA_MODELU] is None
        assert sum(v is not None for v in po_ref.values()) == 1


class TestDeterminizmISortowanie:
    def test_ten_sam_bieg_ta_sama_sygnatura(self, bieg: tuple[str, CanonicalRun]) -> None:
        _, run = bieg
        pierwszy = build_resultset_v1_from_canonical_run(run)
        drugi = build_resultset_v1_from_canonical_run(run)
        assert pierwszy.deterministic_signature == drugi.deterministic_signature
        # `created_at` to znacznik chwili budowy — poza podpisem z definicji kontraktu.
        bez_czasu = {"created_at"}
        assert pierwszy.model_dump(mode="json", exclude=bez_czasu) == drugi.model_dump(
            mode="json", exclude=bez_czasu
        )

    def test_ref_id_wchodzi_do_sygnatury(self, bieg: tuple[str, CanonicalRun]) -> None:
        _, run = bieg
        pelny = build_resultset_v1_from_canonical_run(run)
        okrojony = build_resultset_v1_from_canonical_run(
            _bez_elementu(run, pelny.element_results[0].element_ref)
        )
        assert pelny.deterministic_signature != okrojony.deterministic_signature

    def test_wyniki_posortowane_po_element_ref(self, bieg: tuple[str, CanonicalRun]) -> None:
        _, run = bieg
        refy = [er.element_ref for er in build_resultset_v1_from_canonical_run(run).element_results]
        assert refy == sorted(refy)


class TestKontraktPola:
    def test_domyslnie_none(self) -> None:
        er = ElementResultV1(element_ref="B1", element_type="Bus")
        assert er.element_ref_id is None

    @pytest.mark.parametrize("ref_id", [None, "B1"])
    def test_przejscie_przez_serializacje(self, ref_id: str | None) -> None:
        run = _bieg_rozplywu()
        rs = build_resultset_v1_from_canonical_run(run)
        if ref_id is None:
            rs = build_resultset_v1_from_canonical_run(
                _bez_elementu(run, rs.element_results[0].element_ref)
            )
        dane = rs.model_dump(mode="json")
        odtworzony = ResultSetV1.model_validate(dane)
        assert odtworzony == rs
        assert "element_ref_id" in dane["element_results"][0]
        assert (dane["element_results"][0]["element_ref_id"] is None) == (ref_id is None)
