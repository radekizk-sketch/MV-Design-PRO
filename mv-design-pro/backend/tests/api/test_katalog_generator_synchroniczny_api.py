"""Końcówka katalogu generatorów synchronicznych SN — źródło tabliczki kreatora generatora SN.

Karta MENU-KANON (V12K-351): `add_generator_sn` dostała okno (`KreatorGeneratoraSn`), które
czyta tabliczkę znamionową z `GET /api/catalog/synchronous-generator-types`. Kanoniczny katalog
SN nie niesie dziś typów referencyjnych generatorów synchronicznych (lista pusta — brak danych
producenta nie jest fabrykowany); kreator przechodzi wtedy na tabliczkę ręczną (ZASADA NR 4,
`tests/enm/test_generator_sn_tabliczka_reczna.py`). Test przypina oba stany katalogu:
  - stan rzeczywisty: odpowiedź = lista z kanonicznego katalogu (dziś pusta), deterministyczna;
  - katalog z typem: wpis niesie pola, z których kreator buduje podgląd tabliczki i wiązanie.
"""

from __future__ import annotations

from typing import Any

import pytest
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import SynchronousGeneratorType

KONCOWKA = "/api/catalog/synchronous-generator-types"


def test_lista_rowna_katalogowi_kanonicznemu(app_client) -> None:
    resp = app_client.get(KONCOWKA)
    assert resp.status_code == 200
    oczekiwane = [t.to_dict() for t in get_default_mv_catalog().list_synchronous_generator_types()]
    assert resp.json() == oczekiwane


def test_odpowiedz_deterministyczna(app_client) -> None:
    assert app_client.get(KONCOWKA).json() == app_client.get(KONCOWKA).json()


class _KatalogZTypem:
    def list_synchronous_generator_types(self) -> list[SynchronousGeneratorType]:
        return [
            SynchronousGeneratorType(
                id="gen-sn-test-2mva",
                name="Generator testowy 2 MVA",
                rated_mva=2.0,
                rated_kv=6.3,
                q_min_mvar=-0.6,
                q_max_mvar=1.2,
            )
        ]


def test_wpis_niesie_pola_tabliczki_kreatora(app_client, monkeypatch: pytest.MonkeyPatch) -> None:
    import api.catalog as modul

    monkeypatch.setattr(modul, "get_default_mv_catalog", lambda: _KatalogZTypem())
    wpisy: list[dict[str, Any]] = app_client.get(KONCOWKA).json()
    assert [w["id"] for w in wpisy] == ["gen-sn-test-2mva"]
    wpis = wpisy[0]
    assert wpis["name"] == "Generator testowy 2 MVA"
    assert (wpis["rated_mva"], wpis["rated_kv"]) == (2.0, 6.3)
    assert (wpis["q_min_mvar"], wpis["q_max_mvar"]) == (-0.6, 1.2)
