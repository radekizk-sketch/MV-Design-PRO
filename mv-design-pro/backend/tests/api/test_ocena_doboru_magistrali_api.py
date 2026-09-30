"""Trasa `POST /api/solver/trunk-sizing-assessment` (karta MAGISTRALA-OCENA) — warstwa API
iloczynu cech: kryterium {obciążalność, spadek odcinka, spadek ciągu} × stan {spełnia, nie
spełnia, na granicy, brak danych} × napięcie {15 kV, 20 kV}.

Trasa zwraca WYŁĄCZNIE rekordy werdyktu (`OcenaKryterium`) i liczby podglądu — żadnego pola
lakonicznego werdyktu (`ok`, `status`, `verdict`) obok liczb.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from analysis.normative import kryteria_napiecia
from application.analyses import ocena_doboru_magistrali as modul
from network_model.catalog.repository import get_default_mv_catalog
from werdykt import OcenaKryterium

TRASA = "/api/solver/trunk-sizing-assessment"
KABEL = "cable-nkt-n2xs2y-1x150"
COS_PHI = 0.95
KRYTERIA = (
    "magistrala_sn.obciazalnosc_odcinka",
    "magistrala_sn.spadek_napiecia_odcinka",
    "magistrala_sn.spadek_napiecia_ciagu",
)
OCZEKIWANY = {
    "spelnia": "SPELNIA",
    "nie_spelnia": "NIE_SPELNIA",
    "granica": "SPELNIA",
    "brak_danych": "NIE_OCENIONO",
}


@pytest.fixture()
def podstawa_spadku_wskazana(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(modul, "KRYTERIUM_SPADKU_CIAGU_SN_WYDANIE", "wydanie testowe")
    monkeypatch.setattr(modul, "KRYTERIUM_SPADKU_CIAGU_SN_JEDNOSTKA_REDAKCYJNA", "pkt testowy")
    monkeypatch.setattr(modul, "KRYTERIUM_SPADKU_CIAGU_SN_STAN_ZRODLA", "WSKAZANE")


def _odcinek(**zmiany: Any) -> dict[str, Any]:
    return {
        "rodzaj": "KABEL",
        "catalog_ref": KABEL,
        "dlugosc_m": 500.0,
        "prad_roboczy_a": 100.0,
        "cos_phi": COS_PHI,
        **zmiany,
    }


def _dlugosc_graniczna_m(prad_a: float, napiecie_kv: float) -> float:
    typ = get_default_mv_catalog().get_cable_type(KABEL)
    assert typ is not None
    sin_phi = math.sqrt(1.0 - COS_PHI * COS_PHI)
    na_km = math.sqrt(3.0) * prad_a * (typ.r_ohm_per_km * COS_PHI + typ.x_ohm_per_km * sin_phi)
    limit = kryteria_napiecia.KRYTERIUM_SPADKU_CIAGU_SN_PROCENT
    return limit / 100.0 * napiecie_kv * 1000.0 / na_km * 1000.0


def _zadanie(kryterium_id: str, stan: str, napiecie_kv: float) -> dict[str, Any]:
    typ = get_default_mv_catalog().get_cable_type(KABEL)
    assert typ is not None
    if kryterium_id == KRYTERIA[0]:
        iz = typ.rated_current_a
        prad = {"spelnia": 0.6 * iz, "nie_spelnia": 1.2 * iz, "granica": iz, "brak_danych": None}
        return {"napiecie_kv": napiecie_kv, "odcinek": _odcinek(prad_roboczy_a=prad[stan])}
    granica = _dlugosc_graniczna_m(150.0, napiecie_kv)
    if kryterium_id == KRYTERIA[1]:
        dl = {"spelnia": 0.5, "nie_spelnia": 1.3, "granica": 1.0, "brak_danych": None}[stan]
        return {
            "napiecie_kv": napiecie_kv,
            "odcinek": _odcinek(
                prad_roboczy_a=150.0, dlugosc_m=None if dl is None else granica * dl
            ),
        }
    udzial = {"spelnia": 0.25, "nie_spelnia": 0.65, "granica": 0.5, "brak_danych": 0.25}[stan]
    return {
        "napiecie_kv": napiecie_kv,
        "odcinek": _odcinek(prad_roboczy_a=150.0, dlugosc_m=granica * udzial),
        "odcinki_zbudowane": [
            _odcinek(
                prad_roboczy_a=150.0,
                dlugosc_m=None if stan == "brak_danych" else granica * udzial,
            )
        ],
    }


@pytest.mark.usefixtures("podstawa_spadku_wskazana")
@pytest.mark.parametrize("napiecie_kv", [15.0, 20.0])
@pytest.mark.parametrize("stan", list(OCZEKIWANY))
@pytest.mark.parametrize("kryterium_id", KRYTERIA)
def test_trasa_iloczyn_cech(app_client, kryterium_id: str, stan: str, napiecie_kv: float) -> None:
    odpowiedz = app_client.post(TRASA, json=_zadanie(kryterium_id, stan, napiecie_kv))
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()
    rekordy = {r["kryterium_id"]: r for r in [*dane["oceny_odcinka"], dane["ocena_ciagu"]]}
    assert set(rekordy) == set(KRYTERIA)
    rekord = rekordy[kryterium_id]
    assert rekord["status_maszynowy"] == OCZEKIWANY[stan]
    # Rekord z odpowiedzi HTTP jest pełnym rekordem kontraktu (walidator par przyjmuje go).
    OcenaKryterium.model_validate(rekord)
    assert rekord["wyjasnienie"]["zdanie_pl"]
    assert rekord["etykieta"]["etykieta_pl"]
    if stan == "brak_danych":
        assert rekord["wynik"] is None
        assert rekord["wyjasnienie"]["czego_brakuje"]


def test_trasa_bez_lakonicznego_werdyktu_obok_liczb(app_client) -> None:
    dane = app_client.post(TRASA, json={"napiecie_kv": 15.0, "odcinek": _odcinek()}).json()
    zakazane = {"ok", "status", "verdict", "werdykt", "spelnia"}
    assert not zakazane & set(dane)
    assert not zakazane & set(dane["spadek_odcinka"])
    assert not zakazane & set(dane["ciag"])
    assert dane["spadek_odcinka"]["prad_z_obciazalnosci"] is False
    assert dane["ciag"]["liczba_odcinkow"] == 1


@pytest.mark.parametrize(
    ("zadanie", "fragment"),
    [
        ({"napiecie_kv": 0.0, "odcinek": _odcinek()}, "napiecie_kv"),
        ({"napiecie_kv": 15.0, "odcinek": _odcinek(cos_phi=1.5)}, "cos_phi"),
        ({"napiecie_kv": 15.0, "odcinek": _odcinek(dlugosc_m=-5.0)}, "dlugosc_m"),
        ({"napiecie_kv": 15.0, "odcinek": _odcinek(prad_roboczy_a=0.0)}, "prad_roboczy_a"),
        ({"napiecie_kv": 15.0, "odcinek": _odcinek(rodzaj="SLUP")}, "rodzaj"),
    ],
)
def test_trasa_odrzuca_dane_poza_dziedzina(app_client, zadanie: dict, fragment: str) -> None:
    odpowiedz = app_client.post(TRASA, json=zadanie)
    assert odpowiedz.status_code == 422
    assert fragment in odpowiedz.text


def test_trasa_w_kontrakcie_openapi(app_client) -> None:
    schemat = app_client.get("/openapi.json").json()
    assert "post" in schemat["paths"][TRASA]
    odpowiedz = schemat["components"]["schemas"]["OcenaDoboruMagistraliResponse"]
    assert set(odpowiedz["required"]) == {"spadek_odcinka", "ciag", "oceny_odcinka", "ocena_ciagu"}
