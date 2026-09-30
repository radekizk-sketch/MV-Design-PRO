"""Końcówki kart widmowych i sekcji modelu urządzenia (karta AB-H0 §0.7, §0.9, §0.3.7).

Cechy, w których defekt mógłby się schować (ILOCZYN CECH):

* źródło danych: katalog STATYCZNY (dziś bez kart — pomiar 2026-09-23 — więc pozytywny tor
  z kartą idzie na katalogu podmienionym w teście) × katalog MODELU (karta projektu dodana
  produkcyjną drogą zapisu `POST …/enm/domain-ops`);
* adresat: typ katalogowy (każda z 12 przestrzeni z widokiem sekcji) × element ENM;
* odmowa: każda przestrzeń bez widoku (422 z powodem), przestrzeń nieznana (404), typ
  nieznany (404), element nieznany (404), typ usunięty z katalogu (422), karta usunięta po
  materializacji (422) — mapa kod → status HTTP pokrywa KAŻDY kod adaptera elementu (skan AST);
* parytet: odpowiedź HTTP = wynik funkcji domenowej (`sekcje_typu`, `sekcje_elementu`,
  `rejestr_kart_widmowych`) — jedna funkcja statusu, zero drugiej implementacji w API.
"""

from __future__ import annotations

import ast
import dataclasses
import inspect
from collections.abc import Iterator
from typing import Any

import pytest
from api import karty_widmowe as modul_api
from api.main import app
from application.model_urzadzenia import sekcje_elementu as modul_sekcji_elementu
from application.model_urzadzenia.sekcje_elementu import sekcje_elementu
from dziedziny.karta_widmowa import KartaWidmowa
from enm.dziennik_zmian import wyczysc_dziennik
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.sekcje_modelu import (
    PRZESTRZENIE_BEZ_SEKCJI,
    PRZESTRZENIE_Z_SEKCJAMI,
    rejestr_kart_widmowych,
    sekcje_typu,
)

from tests.dziedziny import fabryki as f
from tests.enm import test_brama_katalogowa_operacji_v2 as h
from tests.network_model.catalog.test_sekcje_modelu import POLE_REPOZYTORIUM

TYP_PV = "conv-pv-card-huawei-sun2000-215ktl"


@pytest.fixture()
def klient(tmp_path, monkeypatch, uow_factory) -> Iterator[TestClient]:  # type: ignore[no-untyped-def]
    from api.dependencies import get_uow_factory

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    app.dependency_overrides[get_uow_factory] = lambda: uow_factory
    app.state.uow_factory = uow_factory
    yield TestClient(app)
    app.dependency_overrides.pop(get_uow_factory, None)
    app.state.uow_factory = None
    reset_enm_store()
    wyczysc_dziennik()


@pytest.fixture()
def katalog_z_karta(monkeypatch: pytest.MonkeyPatch) -> KartaWidmowa:
    """Katalog statyczny końcówek z jedną kartą typu PV (dziś statyczny nie ma kart)."""
    karta = f.karta(id="karta-stat-1", urzadzenie_ref=TYP_PV, verification_status="REFERENCYJNY")
    podmieniony = dataclasses.replace(get_default_mv_catalog(), karty_widmowe={karta.id: karta})
    monkeypatch.setattr(modul_api, "get_default_mv_catalog", lambda: podmieniony)
    return karta


def _json(obiekty: Any) -> Any:
    return [o.model_dump(mode="json") for o in obiekty]


# ---------------------------------------------------------------------------
# Karty i rejestr katalogu statycznego
# ---------------------------------------------------------------------------


def test_rejestr_to_ta_sama_funkcja_co_miernik_i_mierzy_caly_katalog(klient: TestClient) -> None:
    katalog = get_default_mv_catalog()
    odpowiedz = klient.get("/api/catalog/karty-widmowe/rejestr")
    assert odpowiedz.status_code == 200, odpowiedz.text
    tresc = odpowiedz.json()
    assert tresc == rejestr_kart_widmowych(katalog).model_dump(mode="json")
    assert tresc["liczba_typow"] == len(katalog.converter_types)
    assert [p["typ_id"] for p in tresc["pozycje"]] == sorted(katalog.converter_types)
    # Typ bez karty: emisja harmoniczna NIEZNANA z powodem — nigdy cichy status.
    for pozycja in tresc["pozycje"]:
        if pozycja["karty"]:
            continue
        emisja = {s["nazwa"]: s for s in pozycja["harmonic"]["skladniki"]}["emisja"]
        assert emisja["status"] == "UNKNOWN", pozycja["typ_id"]
        assert "karty widmowej" in emisja["powod_pl"], pozycja["typ_id"]
        assert pozycja["harmonic"]["status"] == "UNKNOWN", pozycja["typ_id"]


def test_lista_i_karta_katalogu_bez_kart(klient: TestClient) -> None:
    assert klient.get("/api/catalog/karty-widmowe").json() == _json(
        get_default_mv_catalog().list_karty_widmowe()
    )
    odpowiedz = klient.get("/api/catalog/karty-widmowe/karta-ktorej-nie-ma")
    assert odpowiedz.status_code == 404
    assert odpowiedz.json()["detail"]["code"] == "karta_widmowa.nieznana"


def test_karta_katalogu_statycznego_lista_filtr_odczyt_i_rejestr(
    klient: TestClient, katalog_z_karta: KartaWidmowa
) -> None:
    karta = katalog_z_karta.model_dump(mode="json")
    assert klient.get("/api/catalog/karty-widmowe").json() == [karta]
    assert klient.get(f"/api/catalog/karty-widmowe?urzadzenie_ref={TYP_PV}").json() == [karta]
    assert klient.get("/api/catalog/karty-widmowe?urzadzenie_ref=conv-inny").json() == []
    odczyt = klient.get(f"/api/catalog/karty-widmowe/{katalog_z_karta.id}")
    assert odczyt.status_code == 200 and odczyt.json() == karta

    rejestr = klient.get("/api/catalog/karty-widmowe/rejestr").json()
    assert rejestr["typy_z_karta"] == 1 and rejestr["liczba_kart"] == 1
    assert rejestr["karty_wg_statusu"] == [["REFERENCYJNY", 1]]
    assert rejestr["karty_bez_typu"] == []
    pozycja = next(p for p in rejestr["pozycje"] if p["typ_id"] == TYP_PV)
    assert pozycja["karty"] == [katalog_z_karta.id]
    emisja = {s["nazwa"]: s for s in pozycja["harmonic"]["skladniki"]}["emisja"]
    assert emisja["status"] != "UNKNOWN"


# ---------------------------------------------------------------------------
# Sekcje typu — każda przestrzeń
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("przestrzen", sorted(PRZESTRZENIE_Z_SEKCJAMI))
def test_sekcje_typu_kazdej_przestrzeni_rowne_funkcji_domenowej(
    klient: TestClient, przestrzen: str
) -> None:
    katalog: CatalogRepository = get_default_mv_catalog()
    typ_id = sorted(getattr(katalog, POLE_REPOZYTORIUM[przestrzen]))[0]
    odpowiedz = klient.get(f"/api/catalog/sekcje-modelu/{przestrzen}/{typ_id}")
    assert odpowiedz.status_code == 200, odpowiedz.text
    tresc = odpowiedz.json()
    assert tresc["sekcje"] == _json(sekcje_typu(katalog, przestrzen, typ_id))
    assert len(tresc["sekcje"]) == 8
    assert tresc["klasa"] == PRZESTRZENIE_Z_SEKCJAMI[przestrzen][0]
    assert (tresc["przestrzen"], tresc["typ_id"], tresc["element_ref"]) == (
        przestrzen,
        typ_id,
        None,
    )
    assert tresc["zrodla_modeli_widmowych"] == []


@pytest.mark.parametrize("przestrzen", sorted(PRZESTRZENIE_BEZ_SEKCJI))
def test_przestrzen_bez_widoku_sekcji_422_z_powodem(klient: TestClient, przestrzen: str) -> None:
    odpowiedz = klient.get(f"/api/catalog/sekcje-modelu/{przestrzen}/dowolny")
    assert odpowiedz.status_code == 422
    szczegol = odpowiedz.json()["detail"]
    assert szczegol["code"] == "sekcje.brak_widoku"
    assert PRZESTRZENIE_BEZ_SEKCJI[przestrzen] in szczegol["message_pl"]


def test_przestrzen_i_typ_nieznane_404(klient: TestClient) -> None:
    przestrzen = klient.get("/api/catalog/sekcje-modelu/PRZESTRZEN_X/dowolny")
    assert przestrzen.status_code == 404
    assert przestrzen.json()["detail"]["code"] == "sekcje.przestrzen_nieznana"
    typ = klient.get("/api/catalog/sekcje-modelu/CONVERTER/conv-nie-istnieje")
    assert typ.status_code == 404
    assert typ.json()["detail"]["code"] == "sekcje.typ_nieznany"


# ---------------------------------------------------------------------------
# Sekcje elementu — produkcyjna droga zapisu
# ---------------------------------------------------------------------------


def _siec_z_magazynem(klient: TestClient) -> tuple[str, dict[str, Any]]:
    case_id = h._nowy_przypadek(klient)
    snapshot = h._zasiej_siec_przez_api(klient, case_id)
    snapshot = h._operacja_api(
        klient, case_id, "add_converter_source", h._payload_konwerter(snapshot)
    )
    return case_id, snapshot


def _sekcje_elementu(klient: TestClient, case_id: str, ref: str) -> Any:
    return klient.get(f"/api/cases/{case_id}/enm/elementy/{ref}/sekcje-modelu")


def test_element_z_karta_projektu_przez_api(klient: TestClient) -> None:
    case_id, snapshot = _siec_z_magazynem(klient)
    ref = h._generator(snapshot)["ref_id"]

    przed = _sekcje_elementu(klient, case_id, ref)
    assert przed.status_code == 200, przed.text
    assert przed.json()["zrodla_modeli_widmowych"] == []
    assert przed.json()["sekcje"] == _json(sekcje_elementu(snapshot, ref))
    assert {s["sekcja"]: s["status"] for s in przed.json()["sekcje"]}["harmonic"] == "UNKNOWN"

    h._operacja_api(
        klient, case_id, "dodaj_karte_widmowa_projektu", h._payload_karty_projektu(snapshot)
    )
    zwiazany = h._operacja_api(
        klient, case_id, "set_der_catalog_bindings", h._payload_wiazania_kart(snapshot)
    )
    assert h._generator(zwiazany)["modele_widmowe"] is not None

    po = _sekcje_elementu(klient, case_id, ref)
    assert po.status_code == 200, po.text
    tresc = po.json()
    assert tresc["sekcje"] == _json(sekcje_elementu(zwiazany, ref))
    assert {s["sekcja"]: s["status"] for s in tresc["sekcje"]}["harmonic"] != "UNKNOWN"
    karta = next(
        k for k in zwiazany["katalog_projektu"]["karty_widmowe"] if k["id"] == h.KARTA_PROJEKTU
    )
    odcisk = KartaWidmowa.model_validate(karta).odcisk()
    assert [
        (z["karta_id"], z["przestrzen"], z["odcisk_karty"])
        for z in tresc["zrodla_modeli_widmowych"]
    ] == [(h.KARTA_PROJEKTU, "PROJEKT", odcisk)]
    generator = h._generator(zwiazany)
    assert (tresc["przestrzen"], tresc["typ_id"], tresc["element_ref"]) == (
        generator["catalog_namespace"],
        generator["catalog_ref"],
        ref,
    )


def test_literowka_w_wiazaniu_kart_422_i_model_bez_zmian(klient: TestClient) -> None:
    case_id, snapshot = _siec_z_magazynem(klient)
    h._operacja_api(
        klient, case_id, "dodaj_karte_widmowa_projektu", h._payload_karty_projektu(snapshot)
    )
    hash_przed = klient.get(f"/api/cases/{case_id}/enm").json()["header"]["hash_sha256"]
    payload = h._payload_wiazania_kart(snapshot)
    h._zepsuj_liste_kart(payload)
    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": "set_der_catalog_bindings", "payload": payload}},
    )
    assert odpowiedz.status_code == 422, odpowiedz.text
    assert odpowiedz.json()["detail"]["code"] == "catalog.item_not_found"
    assert klient.get(f"/api/cases/{case_id}/enm").json()["header"]["hash_sha256"] == hash_przed


def test_element_nieznany_404_i_aparat_bez_widoku_422(klient: TestClient) -> None:
    case_id, snapshot = _siec_z_magazynem(klient)
    nieznany = _sekcje_elementu(klient, case_id, "element-ktorego-nie-ma")
    assert nieznany.status_code == 404
    assert nieznany.json()["detail"]["code"] == "sekcje.element_nieznany"

    aparat = next(b for b in snapshot["branches"] if b.get("catalog_namespace") == "APARAT_SN")
    odpowiedz = _sekcje_elementu(klient, case_id, aparat["ref_id"])
    assert odpowiedz.status_code == 422
    assert odpowiedz.json()["detail"]["code"] == "sekcje.brak_widoku"


def _zasiej_mimo_api(klient: TestClient, case_id: str, migawka: dict[str, Any]) -> None:
    """Stan nieosiągalny drogą operacji (karta usunięta po materializacji, typ usunięty
    z katalogu) — seedowany wprost do magazynu, żeby sprawdzić MAPOWANIE odmowy na HTTP."""
    from api.klucz_twin_dep import klucz_twin_z_uow

    klucz = klucz_twin_z_uow(case_id, app.state.uow_factory)
    set_enm(klucz, EnergyNetworkModel.model_validate(migawka))


def test_odmowy_stanu_modelu_422(klient: TestClient) -> None:
    case_id, snapshot = _siec_z_magazynem(klient)
    ref = h._generator(snapshot)["ref_id"]
    h._operacja_api(
        klient, case_id, "dodaj_karte_widmowa_projektu", h._payload_karty_projektu(snapshot)
    )
    zwiazany = h._operacja_api(
        klient, case_id, "set_der_catalog_bindings", h._payload_wiazania_kart(snapshot)
    )

    bez_karty = {**zwiazany, "katalog_projektu": {**zwiazany["katalog_projektu"]}}
    bez_karty["katalog_projektu"]["karty_widmowe"] = []
    _zasiej_mimo_api(klient, case_id, bez_karty)
    odpowiedz = _sekcje_elementu(klient, case_id, ref)
    assert odpowiedz.status_code == 422
    assert odpowiedz.json()["detail"]["code"] == "sekcje.karta_widmowa_niedostepna"

    bez_typu = {**snapshot, "generators": [dict(g) for g in snapshot["generators"]]}
    bez_typu["generators"][0]["catalog_ref"] = "typ-usuniety"
    _zasiej_mimo_api(klient, case_id, bez_typu)
    odpowiedz = _sekcje_elementu(klient, case_id, ref)
    assert odpowiedz.status_code == 422
    assert odpowiedz.json()["detail"]["code"] == "sekcje.typ_niedostepny"


def test_przypadek_nieznany_404(klient: TestClient) -> None:
    odpowiedz = _sekcje_elementu(klient, "00000000-0000-0000-0000-000000000000", "gen-1")
    assert odpowiedz.status_code == 404


def test_mapa_statusow_pokrywa_kazdy_kod_odmowy_adaptera() -> None:
    """Predykaty parami: kody podnoszone przez adapter = klucze mapy kod → HTTP w API."""
    drzewo = ast.parse(inspect.getsource(modul_sekcji_elementu))
    kody = {
        wezel.args[0].value
        for wezel in ast.walk(drzewo)
        if isinstance(wezel, ast.Call)
        and isinstance(wezel.func, ast.Name)
        and wezel.func.id == "OdmowaSekcjiElementu"
        and wezel.args
        and isinstance(wezel.args[0], ast.Constant)
    }
    assert kody == set(modul_api._STATUS_ODMOWY)
