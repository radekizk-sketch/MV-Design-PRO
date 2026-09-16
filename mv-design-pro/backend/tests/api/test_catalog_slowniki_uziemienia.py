"""W5-A: końcówki słowników uziemienia i grup połączeń — jedno źródło dla modelu, OpenAPI i frontu."""

from __future__ import annotations

from enm.grupa_polaczen import GRUPY_POLACZEN_IEC60076
from enm.models import UKLADY_SIECI_NN
from network_model.core.uziemienie import (
    ROLE_UZIEMNIKA,
    TYPY_PUNKTU_NEUTRALNEGO,
    UZIEMIENIA_EKRANU_KABLA,
)


def test_grupy_polaczen_zamkniety_slownik(app_client) -> None:
    resp = app_client.get("/api/catalog/grupy-polaczen")
    assert resp.status_code == 200
    assert resp.json() == {"grupy": list(GRUPY_POLACZEN_IEC60076)}


def test_slowniki_uziemienia_rowne_literalom_modelu(app_client) -> None:
    resp = app_client.get("/api/catalog/slowniki-uziemienia")
    assert resp.status_code == 200
    assert resp.json() == {
        "typy_punktu_neutralnego": list(TYPY_PUNKTU_NEUTRALNEGO),
        "uklady_sieci_nn": list(UKLADY_SIECI_NN),
        "uziemienia_ekranu_kabla": list(UZIEMIENIA_EKRANU_KABLA),
        "role_uziemnika": list(ROLE_UZIEMNIKA),
    }


def test_openapi_niesie_enumy_slownikow(app_client) -> None:
    schemat = app_client.get("/openapi.json").json()
    wlasciwosci = schemat["components"]["schemas"]["SlownikiUziemienia"]["properties"]
    assert wlasciwosci["typy_punktu_neutralnego"]["items"]["enum"] == list(TYPY_PUNKTU_NEUTRALNEGO)
    assert wlasciwosci["uklady_sieci_nn"]["items"]["enum"] == list(UKLADY_SIECI_NN)
    assert wlasciwosci["uziemienia_ekranu_kabla"]["items"]["enum"] == list(UZIEMIENIA_EKRANU_KABLA)
    assert wlasciwosci["role_uziemnika"]["items"]["enum"] == list(ROLE_UZIEMNIKA)
