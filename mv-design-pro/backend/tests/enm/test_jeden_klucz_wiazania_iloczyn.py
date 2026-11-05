"""Jeden klucz wiązania katalogowego — iloczyn cech na realnym łańcuchu operacji.

Karta JEDEN-KLUCZ-KATALOGU. Pozycję katalogu w ładunku wskazuje wyłącznie wiązanie
(``catalog_binding`` / ``<rola>_catalog_binding``); jedyny odczyt to
``enm.wiazanie_katalogowe.odczytaj_wiazanie`` — wspólny dla bramy API i operacji.

ILOCZYN CECH: operacja (KAŻDY krok łańcucha przykładów kontraktu operacji
``tests/ci/dokument_operacji_enm.py`` z wiązaniem w ładunku — operacje V1 i V2, wiązania na
wierzchu, w rolach i zagnieżdżone) × wiązanie (każda ścieżka wiązania w ładunku) × wariant
{poprawne, zamiennik klucza obok wiązania, zamiennik pola w wiązaniu, pozycja nieistniejąca,
przestrzeń niezgodna z rodzajem elementu} × droga {API — produkcyjna końcówka ``domain-ops``,
wewnętrzna — dyspozytor ``execute_domain_operation``}. Odmowa nie zmienia modelu (skrót
migawki przed i po próbie jest ten sam).
"""

from __future__ import annotations

import copy
import logging
from collections.abc import Iterator
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.wiazanie_katalogowe import (
    KOD_PRZESTRZENI_NIEZGODNEJ,
    KOD_ZAMIENNIKA_KLUCZA,
    zamienniki_klucza,
)

from tests.ci.dokument_operacji_enm import KROKI, Kontekst

#: Przestrzeń podstawiana w wariancie „niezgodna” — istniejąca kategoria katalogu inna niż
#: przestrzeń rodzaju elementu.
_INNA_PRZESTRZEN = {"KABEL_SN": "TRAFO_SN_NN"}


def _jest_kluczem_wiazania(klucz: str) -> bool:
    return klucz == "catalog_binding" or klucz.endswith("_catalog_binding")


def _sciezki_wiazan(wezel: Any, sciezka: tuple = ()) -> Iterator[tuple]:
    if isinstance(wezel, dict):
        for k, v in wezel.items():
            if _jest_kluczem_wiazania(k) and isinstance(v, dict) and v.get("catalog_item_id"):
                yield (*sciezka, k)
            else:
                yield from _sciezki_wiazan(v, (*sciezka, k))
    elif isinstance(wezel, list):
        for i, v in enumerate(wezel):
            yield from _sciezki_wiazan(v, (*sciezka, i))


def _wezel(ladunek: dict, sciezka: tuple) -> dict:
    w: Any = ladunek
    for k in sciezka[:-1]:
        w = w[k]
    return w


def _warianty(ladunek: dict) -> Iterator[tuple[str, str, dict, str | None]]:
    """(wariant, ścieżka, ładunek, oczekiwany kod | None = dowolna odmowa nazwana)."""
    for sciezka in _sciezki_wiazan(ladunek):
        klucz = sciezka[-1]
        opis = ".".join(str(s) for s in sciezka)
        pozycja = _wezel(ladunek, sciezka)[klucz]["catalog_item_id"]

        z = copy.deepcopy(ladunek)
        _wezel(z, sciezka)[zamienniki_klucza(klucz)[0]] = pozycja
        yield "zamiennik_klucza", opis, z, KOD_ZAMIENNIKA_KLUCZA

        z = copy.deepcopy(ladunek)
        _wezel(z, sciezka)[klucz]["catalog_ref"] = pozycja
        yield "zamiennik_pola", opis, z, KOD_ZAMIENNIKA_KLUCZA

        z = copy.deepcopy(ladunek)
        _wezel(z, sciezka)[klucz]["catalog_item_id"] = "POZYCJA-NIEISTNIEJACA-KLUCZ"
        yield "pozycja_nieistniejaca", opis, z, None

        z = copy.deepcopy(ladunek)
        wiazanie = _wezel(z, sciezka)[klucz]
        wiazanie["catalog_namespace"] = _INNA_PRZESTRZEN.get(
            str(wiazanie.get("catalog_namespace")), "KABEL_SN"
        )
        yield "przestrzen_niezgodna", opis, z, KOD_PRZESTRZENI_NIEZGODNEJ


def _kod_api(odpowiedz: Any) -> str | None:
    tresc = odpowiedz.json()
    if odpowiedz.status_code == 422:
        szczegoly = tresc.get("detail") or {}
        return szczegoly.get("code") if isinstance(szczegoly, dict) else None
    return tresc.get("error_code")


@pytest.fixture(scope="module")
def przebieg() -> dict[str, Any]:
    """Łańcuch przez produkcyjną końcówkę; przed każdym krokiem — warianty na obu drogach."""
    from api.main import app
    from fastapi.testclient import TestClient

    logging.getLogger("httpx").setLevel(logging.WARNING)
    wyniki: list[dict[str, Any]] = []
    kroki_z_wiazaniem: set[str] = set()
    with TestClient(app) as klient:
        projekt = klient.post(
            "/api/projects",
            json={
                "name": "Jeden klucz",
                "description": "",
                "mode": "TO-BE",
                "voltage_level_kv": 15.0,
                "frequency_hz": 50.0,
            },
        ).json()
        przypadek = klient.post(
            "/api/study-cases",
            json={
                "project_id": projekt["id"],
                "name": "Iloczyn",
                "description": "",
                "config": {},
                "set_active": True,
            },
        ).json()
        url = f"/api/cases/{przypadek['id']}/enm"
        kontekst = Kontekst(enm=klient.get(url).json(), odpowiedzi={})
        for numer, krok in enumerate(KROKI, start=1):
            ladunek = krok.ladunek(kontekst)
            if krok.odmowa is None:
                for wariant, sciezka, zly, oczekiwany in _warianty(ladunek):
                    kroki_z_wiazaniem.add(krok.operacja)
                    skrot = kontekst.enm["header"]["hash_sha256"]
                    odp = klient.post(
                        f"{url}/domain-ops",
                        json={
                            "project_id": projekt["id"],
                            "snapshot_base_hash": skrot,
                            "operation": {
                                "name": krok.operacja,
                                "idempotency_key": f"wariant-{numer}-{wariant}-{sciezka}",
                                "payload": zly,
                            },
                        },
                    )
                    po = klient.get(url).json()["header"]["hash_sha256"]
                    wew = execute_domain_operation(
                        enm_dict=copy.deepcopy(kontekst.enm),
                        op_name=krok.operacja,
                        payload=copy.deepcopy(zly),
                    )
                    wyniki.append(
                        {
                            "operacja": krok.operacja,
                            "wariant": wariant,
                            "sciezka": sciezka,
                            "oczekiwany": oczekiwany,
                            "kod_api": _kod_api(odp),
                            "model_bez_zmian": po == skrot,
                            "kod_wewnetrzny": wew.get("error_code"),
                        }
                    )
            odpowiedz = klient.post(
                f"{url}/domain-ops",
                json={
                    "project_id": projekt["id"],
                    "snapshot_base_hash": kontekst.enm["header"]["hash_sha256"],
                    "operation": {
                        "name": krok.operacja,
                        "idempotency_key": f"krok-{numer:02d}",
                        "payload": ladunek,
                    },
                },
            )
            kontekst.odpowiedzi[krok.etykieta] = odpowiedz.json()
            if krok.odmowa is None:
                assert odpowiedz.status_code == 200, (krok.operacja, odpowiedz.json())
                assert not odpowiedz.json().get("error_code"), (
                    krok.operacja,
                    odpowiedz.json(),
                )
            kontekst.enm = klient.get(url).json()
    return {"wyniki": wyniki, "operacje": kroki_z_wiazaniem}


def test_lancuch_pokrywa_operacje_z_wiazaniem(przebieg: dict[str, Any]) -> None:
    """Pokrycie iloczynu: operacje V1 i V2, wiązanie na wierzchu, w roli i zagnieżdżone."""
    operacje = przebieg["operacje"]
    for op in (
        "add_grid_source_sn",
        "continue_trunk_segment_sn",
        "insert_station_on_segment_sn",
        "add_transformer_sn_nn",
        "add_ct",
        "add_nn_load",
        "assign_catalog_to_element",
    ):
        assert op in operacje, (op, sorted(operacje))
    sciezki = {w["sciezka"] for w in przebieg["wyniki"]}
    assert any(s.endswith("transformer_catalog_binding") and "." in s for s in sciezki)
    assert any(s.startswith("segment.") for s in sciezki)


@pytest.mark.parametrize(
    "wariant",
    [
        "zamiennik_klucza",
        "zamiennik_pola",
        "pozycja_nieistniejaca",
        "przestrzen_niezgodna",
    ],
)
def test_wariant_odrzucony_na_obu_drogach_bez_zmiany_modelu(
    przebieg: dict[str, Any], wariant: str
) -> None:
    rozjazdy = []
    for w in przebieg["wyniki"]:
        if w["wariant"] != wariant:
            continue
        oczekiwany = w["oczekiwany"]
        ok_api = w["kod_api"] == oczekiwany if oczekiwany else bool(w["kod_api"])
        ok_wew = w["kod_wewnetrzny"] == oczekiwany if oczekiwany else bool(w["kod_wewnetrzny"])
        if not (ok_api and ok_wew and w["model_bez_zmian"]):
            rozjazdy.append(
                f"{w['operacja']} {w['sciezka']}: API={w['kod_api']} "
                f"wewnętrzna={w['kod_wewnetrzny']} model_bez_zmian={w['model_bez_zmian']}"
            )
    assert rozjazdy == []
