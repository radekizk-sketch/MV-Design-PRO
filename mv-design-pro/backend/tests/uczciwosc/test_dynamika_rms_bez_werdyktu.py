"""Bieg kanoniczny `dynamika_rms` w trybie sieci nie wydaje werdyktu (karta AB-P1 §0.2).

Test odniesienia zdolności `DYNAMIKA_RMS` w rejestrze zdolności solverów: ścieżka
użytkownika (rozpływ -> bieg czasowy ze scenariuszem nazwanym -> odczyt wyniku) daje
rekordy kontraktu werdyktu wyjaśnialnego WYŁĄCZNIE o statusie ``NIE_OCENIONO``, każdy
z powodem i listą braków, a stopień dowodowy biegu pochodzi z rejestru proweniencji
(`UNVALIDATED_MODEL`, bez dopuszczalności regulacyjnej).
"""

from __future__ import annotations

import pytest
from api.main import app
from fastapi.testclient import TestClient

pytest.importorskip("sqlalchemy")

from tests.api.test_dynamika_api import (  # noqa: E402
    REFY,
    SCENARIUSZ_IZOLACJI,
    _bieg,
    _siec_bez_modelu_pv,
)
from tests.golden.enm_builders.dynamika_projektanta import PROFIL_ODBIORU  # noqa: E402
from tests.test_dynamika_rms_run import (  # noqa: E402
    _nowy_przypadek,
    _reset_backend_state,
    _uruchom_rozplyw,
)
from tests.uczciwosc.pomocnicze import braki_tekstem, sprawdz_ocene_niewykonana  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def test_bieg_niesie_oceny_niewykonane_z_powodem(client: TestClient) -> None:
    case_id = _nowy_przypadek(client)
    _siec_bez_modelu_pv(client, case_id)
    wiazanie = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": "set_der_catalog_bindings",
                "idempotency_key": "uczciwosc-dynamika",
                "payload": {"generator_ref": REFY.pv, "dynamic_model_ref": "default_pv_gfl"},
            },
        },
    )
    assert wiazanie.status_code == 200 and wiazanie.json().get("error") is None
    # Karta modeli odbiorów: każdy odbiór biegu ma model dynamiczny z katalogu profili
    # odbiorów — wiązany tą samą operacją, co akcja naprawcza ekranu dynamiki.
    wiazanie_odbioru = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": "set_load_dynamic_binding",
                "idempotency_key": "uczciwosc-dynamika-odbior",
                "payload": {"load_ref": REFY.odbior, "dynamic_model_ref": PROFIL_ODBIORU},
            },
        },
    )
    assert wiazanie_odbioru.status_code == 200 and wiazanie_odbioru.json().get("error") is None
    scenariusz = client.post(
        f"/api/dynamika/study-cases/{case_id}/scenariusze",
        json={"name": "Zwarcie w odcinku", "dynamika": SCENARIUSZ_IZOLACJI},
    ).json()
    bieg = _bieg(client, case_id, scenariusz["scenario_id"], _uruchom_rozplyw(client, case_id))
    assert bieg["status"] == "DONE", bieg["error_message"]

    wynik = client.get(f"/api/analysis-runs/{bieg['run_id']}/results/dynamika").json()
    oceny = wynik["oceny"]
    assert len(oceny) == 2
    for ocena in oceny:
        sprawdz_ocene_niewykonana(ocena)
        assert ocena["dowod"]["status_modelu"] == "UNVALIDATED_MODEL"
    assert "NC RfG" in oceny[0]["podstawa"]["dokument"]
    assert "czasu krytycznego" in braki_tekstem(oceny[1])
    # Parametry dynamiczne z profilu TYPOWEGO katalogu to dane przyjęte bez walidacji —
    # rekord mówi to wprost (stan danych i lista z nazwą elementu), nie „zwalidowane".
    # Karta modeli odbiorów: model dynamiczny ODBIORU z profilu typowego katalogu odbiorów
    # jest daną przyjętą tak samo jak profil wytwórcy (KLASA: każdy blok z katalogu typowego).
    for ocena in oceny:
        status_danych = ocena["dowod"]["status_danych"]
        assert status_danych["stan"] == "UNVALIDATED_INPUT"
        zrodlo, odbior = status_danych["dane_przyjete"]
        assert zrodlo["nazwa_pl"].startswith("Parametry dynamiczne źródła ")
        assert odbior["nazwa_pl"].startswith("Parametry dynamiczne odbioru ")
        for dana in (zrodlo, odbior):
            assert dana["jakosc"] == "ESTIMATED"
            assert "profilu katalogowego" in dana["powod_pl"]
    (stopien,) = wynik["stopien_dowodowy"]
    assert stopien["tier"] == "UNVALIDATED_MODEL"
    assert stopien["regulatory_evidence_eligible"] is False
    # Żadnego pola werdyktu obok kontraktu: tylko rekordy oceny niewykonanej.
    assert not {"werdykt", "status", "verdict"} & set(wynik)
