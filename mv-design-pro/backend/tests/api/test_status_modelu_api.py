"""Trasa „status modelu" wytwórcy — dwie osie statusu (karta AB-1a D3).

`GET /api/projects/{p}/cases/{c}/generators/{ref}/status-modelu` jest jedynym
konsumentem produkcyjnym rejestru `solver_input/status_modelu.py` w ścieżce
użytkownika (sekcja „Model dynamiczny" inspektora). Iloczyn cech:
{brak parametrów dynamicznych | rodzina przekształtnikowa | maszyna synchroniczna}
× {status parametrów: brak (UNKNOWN) | podany (pomiar)} × {wytwórca nieistniejący}.
Wynik nigdy nie jest wartością zastępczą: brak bloku dynamiki = `None`, brak
statusu parametrów = `UNKNOWN`, nie „karta katalogowa" z domysłu.
"""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")

from enm.dynamika_modele import (  # noqa: E402
    MaszynaSynchroniczna,
    ProweniencjaParametrow,
    PrzeksztaltnikGFL,
)
from enm.store import get_enm, set_enm  # noqa: E402
from solver_input.status_modelu import StatusParametrow  # noqa: E402

from tests.api.test_generators_api import _utworz_wytworce  # noqa: E402
from tests.enm.test_dynamika_modele import _gfl_komplet, _sm_komplet  # noqa: E402
from tests.test_execution_api import _klucz_modelu  # noqa: E402


def _adres(project_id: str, case_id: str, ref: str) -> str:
    return f"/api/projects/{project_id}/cases/{case_id}/generators/{ref}/status-modelu"


def _ustaw_dynamike(case_id: str, ref: str, dynamika: object) -> None:
    klucz = _klucz_modelu(case_id)
    enm = get_enm(klucz)
    generatory = [
        g.model_copy(update={"dynamika": dynamika}) if g.ref_id == ref else g
        for g in enm.generators
    ]
    set_enm(klucz, enm.model_copy(update={"generators": generatory}))


def test_wytworca_bez_parametrow_dynamicznych_nie_dostaje_statusu(app_client) -> None:
    project_id, case_id, ref = _utworz_wytworce(app_client)
    odpowiedz = app_client.get(_adres(project_id, case_id, ref))
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()
    assert dane["generator_ref"] == ref
    assert dane["status_modelu"] is None
    assert dane["rodzina"] is None and dane["proweniencja"] is None


def test_przeksztaltnik_bez_statusu_parametrow_to_niezwalidowany_i_nieznany(app_client) -> None:
    project_id, case_id, ref = _utworz_wytworce(app_client)
    _ustaw_dynamike(case_id, ref, PrzeksztaltnikGFL(**_gfl_komplet()))
    dane = app_client.get(_adres(project_id, case_id, ref)).json()
    assert dane["rodzina"] == "przeksztaltnikowa_gfl"
    assert dane["status_modelu"]["rownania"] == "UNVALIDATED"
    # Brak statusu w proweniencji = NIEZNANY, nie domysł z nazwy źródła.
    assert dane["status_modelu"]["parametry"] == "UNKNOWN"
    assert dane["status_rownan_uzasadnienie_pl"]
    assert dane["status_rownan_audit_ref"]
    assert dane["proweniencja"]["zrodlo"] == _gfl_komplet()["proweniencja"].zrodlo


def test_maszyna_synchroniczna_z_parametrami_zmierzonymi(app_client) -> None:
    project_id, case_id, ref = _utworz_wytworce(app_client)
    sm = _sm_komplet()
    sm["proweniencja"] = ProweniencjaParametrow(
        zrodlo="karta_producenta",
        odniesienie="DS-0001",
        data="2026-01-01",
        status_walidacji=StatusParametrow.MODEL_ZWALIDOWANY_POMIAREM,
    )
    _ustaw_dynamike(case_id, ref, MaszynaSynchroniczna(**sm))
    dane = app_client.get(_adres(project_id, case_id, ref)).json()
    assert dane["rodzina"] == "synchroniczna"
    # Rodzina ENM `synchroniczna` NIE dziedziczy statusu wyroczni maszyny klasycznej.
    assert dane["status_modelu"]["rownania"] == "UNVALIDATED"
    assert dane["status_modelu"]["parametry"] == "MODEL_ZWALIDOWANY_POMIAREM"


def test_nieistniejacy_wytworca_to_404_z_kodem(app_client) -> None:
    project_id, case_id, _ref = _utworz_wytworce(app_client)
    odpowiedz = app_client.get(_adres(project_id, case_id, "gen/brak"))
    assert odpowiedz.status_code == 404
    assert odpowiedz.json()["detail"]["code"] == "generator.not_found"
