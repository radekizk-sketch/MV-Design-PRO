"""Brak wiązania katalogowego aparatu pola nN po automigracji blokuje WYŁĄCZNIE oś analiz,
które czytają parametry tego aparatu (karta SLD-SUBSTRAT, kontynuacja; doprecyzowanie
integratora partii 6).

Model budowany ŚCIEŻKĄ PRODUKTU (API w procesie): stacja wstawiona operacją domenową z
blokiem nN (jak kreator stacji — bez wiązań aparatów nN); automigracja promocji pól nN
wprowadza aparat każdego pola nN (wyłącznik główny + odpływ), oba BEZ katalogu —
pozycje gotowości W061 z akcją naprawczą.

Iloczyn cech: oś analizy {rozpływ, zwarcia 3F/2F/1F — nie czytają parametrów łącznika
(zamknięty łącznik ma zerową impedancję); SWZ nN — czyta aparat obwodu} × aparat
{bez wiązania, z wiązaniem przypisanym akcją naprawczą}.
"""

from __future__ import annotations

import logging
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.reference_networks.budowa_przez_api import (
    KlientBudowy,
    segmenty_korytarza,
    wiazanie,
)

OSIE_BEZ_PARAMETROW_APARATU = ("SC_3F", "SC_2F", "SC_1F", "LOAD_FLOW")


@pytest.fixture(scope="module")
def siec() -> Any:
    from api.main import app

    logging.getLogger("httpx").setLevel(logging.WARNING)
    with TestClient(app) as klient:
        b = KlientBudowy(klient, "Brak katalogu aparatu nN")
        b.gpz()
        b.odcinek_magistrali(300, "Odcinek 0")
        b.stacja_b(segmenty_korytarza(b.migawka())[0], "Stacja B", nn_odplywy=1)
        yield klient, b


def _aparat_glowny(migawka: dict[str, Any]) -> dict[str, Any]:
    return next(
        g
        for g in migawka["branches"]
        if (g.get("meta") or {}).get("nn_field_migrowana_rola") == "IN"
    )


def _aparaty_nn(migawka: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        (g for g in migawka["branches"] if (g.get("meta") or {}).get("nn_field_migrowany_z")),
        key=lambda g: g["ref_id"],
    )


def _macierz(klient: TestClient, case_id: str) -> dict[str, Any]:
    wynik = klient.get(f"/api/cases/{case_id}/analysis-eligibility").json()
    return {pozycja["analysis_type"]: pozycja for pozycja in wynik["matrix"]}


def test_aparaty_nn_po_migracji_sa_bez_katalogu_i_kazdy_nazwany_w061(siec: Any) -> None:
    klient, b = siec
    aparaty = _aparaty_nn(b.migawka())
    assert len(aparaty) == 2
    assert all(a["catalog_ref"] is None for a in aparaty)
    assert all(a["meta"]["nn_promocja_bez_wiazania_katalogowej"] is True for a in aparaty)
    gotowosc = klient.get(f"/api/cases/{b.case_id}/enm/validate").json()
    w061 = sorted(
        (i for i in gotowosc["issues"] if i["code"] == "W061"), key=lambda i: i["element_refs"]
    )
    assert [i["element_refs"] for i in w061] == [[a["ref_id"]] for a in aparaty]
    for issue, aparat in zip(w061, aparaty, strict=True):
        assert issue["fix_action"]["element_ref"] == aparat["ref_id"]
        assert issue["fix_action"]["payload_hint"]["field_ref"] == (
            aparat["meta"]["nn_field_migrowany_z"]
        )


def test_rozplyw_i_zwarcia_nie_sa_blokowane_brakiem_katalogu_aparatu_nn(siec: Any) -> None:
    klient, b = siec
    aparaty = {a["ref_id"] for a in _aparaty_nn(b.migawka())}
    macierz = _macierz(klient, b.case_id)
    for os_analizy in OSIE_BEZ_PARAMETROW_APARATU:
        pozycja = macierz[os_analizy]
        refy_blokad = {blokada.get("element_ref") for blokada in pozycja["blockers"]}
        assert not (aparaty & refy_blokad), os_analizy
        # Globalna bramka gotowości też nie może spaść z powodu tego braku (W061 jest
        # ostrzeżeniem); zwarcia 2F/1F mają WŁASNE, niezwiązane braki (Z2/Z0 sieci
        # fikstury), więc o ich statusie rozstrzyga co innego — pilnujemy, że żadna
        # blokada nie pochodzi od aparatu nN.
        assert "ELIG_NOT_READY" not in {blokada["code"] for blokada in pozycja["blockers"]}
    for os_analizy in ("SC_3F", "LOAD_FLOW"):
        assert macierz[os_analizy]["status"] == "ELIGIBLE", macierz[os_analizy]["blockers"]


def test_swz_obwodu_z_aparatem_bez_katalogu_ma_nazwany_brak_danych_aparatu(siec: Any) -> None:
    klient, b = siec
    migawka = b.migawka()
    aparat = _aparat_glowny(migawka)
    stacja = next(s for s in migawka["substations"] if s["name"] == "Stacja B")
    wynik = klient.get(
        f"/api/cases/{b.case_id}/enm/swz",
        params={
            "station_ref": stacja["ref_id"],
            "bus_ref": aparat["to_bus_ref"],
            "breaker_ref": aparat["ref_id"],
        },
    ).json()
    assert wynik["status"] == "brak danych"
    assert wynik["missing_data"] == ["breaker_catalog_binding"]


def test_akcja_naprawcza_zdejmuje_w061(siec: Any) -> None:
    klient, b = siec
    for aparat in _aparaty_nn(b.migawka()):
        pozycja = (
            "cb_nn_1000a" if aparat["meta"]["nn_field_migrowana_rola"] == "IN" else "cb_nn_250a"
        )
        b.operacja(
            "assign_catalog_to_element",
            {"element_ref": aparat["ref_id"], "catalog_binding": wiazanie("APARAT_NN", pozycja)},
        )
    for aparat in _aparaty_nn(b.migawka()):
        assert aparat["catalog_ref"] in {"cb_nn_1000a", "cb_nn_250a"}
        assert "nn_promocja_bez_wiazania_katalogowej" not in aparat["meta"]
    gotowosc = klient.get(f"/api/cases/{b.case_id}/enm/validate").json()
    assert not [i for i in gotowosc["issues"] if i["code"] == "W061"]
