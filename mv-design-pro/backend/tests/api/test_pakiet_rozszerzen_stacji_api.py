"""Pakiet dowodow rozszerzen stacji na sciezce produktu (karty PROOFPACK-KONTRAKT,
JEDNA-SCIEZKA-EDYCJI).

Sciezka uzytkownika: projekt → przypadek → model sieci; dane rozszerzen stacji (tryby pracy
magazynu, przelacznik zaczepow transformatora, przekladnik napieciowy pola) projektant
wpisuje OPERACJAMI DOMENOWYMI (`POST /api/cases/{case_id}/enm/domain-ops`) — jedyna droga
edycji modelu — a pakiet sklada backend z modelu:
`POST /api/v1/projects/{id}/stations/_validate-all` → raport
`POST /api/v1/catalog/konfiguracja-stacji/generate-report` z pakietu zwroconego przez backend.

Intencja dawnego testu konfiguracji stacji (osobny magazyn obok modelu, skasowany): pakiet
nazywa rodzaje i elementy z modelu, stacja bez danych ma jawne braki, wynik jest
deterministyczny bajtowo, raport nie gubi brakow. Teraz te same dane zyja w ENM.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest

pytest.importorskip("fastapi")

from application.proof_engine.packs.pakiet_rozszerzen_stacji import (  # noqa: E402
    BRAK_MAGAZYNU,
    BRAK_PRZEKLADNIKOW,
    BRAK_PRZELACZNIKOW,
    STACJA_BEZ_SZYN_SN,
    STACJA_SPOZA_MODELU_UZIEMIENIE,
)

WYMAGANE_RODZAJE = {
    "BESS_OPERATION_MODES",
    "TAP_CHANGER_PLAN",
    "HOSTING_CAPACITY_EXPORT",
    "VT_GROUNDING_VALIDATION",
}
VT_19 = "vt_20kv_fz_100_3_05_3p_siemens"
PRZELACZNIK = "tc_detc_snnn_5_25"
TRYBY = ["mode_voltage_support"]


def _model():
    from enm.models import (
        Bay,
        Bus,
        EnergyNetworkModel,
        ENMHeader,
        Generator,
        Load,
        Substation,
        Transformer,
        ZespolUziemiajacy,
    )

    return EnergyNetworkModel(
        header=ENMHeader(name="Pakiet dowodow — sciezka produktu"),
        buses=[
            Bus(ref_id="bus-sn", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="bus-nn-1", name="Szyna nN 1", voltage_kv=0.4),
            Bus(ref_id="bus-nn-2", name="Szyna nN 2", voltage_kv=0.4),
        ],
        substations=[
            Substation(
                ref_id="stn/1",
                name="Stacja Łąkowa",
                station_type="mv_lv",
                bus_refs=["bus-sn", "bus-nn-1"],
            ),
            Substation(
                ref_id="stn/2", name="Stacja Polna", station_type="mv_lv", bus_refs=["bus-nn-2"]
            ),
        ],
        bays=[
            Bay(
                ref_id="bay-01",
                name="Pole 01",
                bay_number="Pole 01",
                bay_role="FEEDER",
                substation_ref="stn/1",
                bus_ref="bus-sn",
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr/1",
                name="T1 Łąkowa",
                hv_bus_ref="bus-sn",
                lv_bus_ref="bus-nn-1",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=6.0,
                pk_kw=6.5,
            ),
        ],
        generators=[
            Generator(
                ref_id="gen/bess-1",
                name="Magazyn Łąkowa",
                bus_ref="bus-nn-1",
                station_ref="stn/1",
                p_mw=0.5,
                gen_type="bess",
                catalog_ref="conv-bess-tesla-megapack-3p9mw-15kv",
            ),
            Generator(
                ref_id="gen/pv-2",
                name="PV Polna",
                bus_ref="bus-nn-2",
                station_ref="stn/2",
                p_mw=0.1,
                gen_type="pv_inverter",
            ),
        ],
        # Sposób uziemienia SN dowodu przekładników z modelu (karta UX-04/POLE-ZU-SKLADOWA-
        # ZEROWA): zespół uziemiający z dławikiem gaszącym na szynie SN stacji.
        zespoly_uziemiajace=[
            ZespolUziemiajacy(
                ref_id="zu/1",
                name="ZU Łąkowa",
                bus_ref="bus-sn",
                dlawik={"i_nastawy_a": 100.0},
            )
        ],
        loads=[
            Load(ref_id="ld-1", name="Odbiór 1", bus_ref="bus-nn-1", p_mw=0.5, q_mvar=0.0),
            Load(ref_id="ld-2", name="Odbiór 2", bus_ref="bus-nn-2", p_mw=0.1, q_mvar=0.0),
        ],
    )


def _operacja(app_client, case_id: str, nazwa: str, ladunek: dict[str, Any]) -> dict[str, Any]:
    res = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": nazwa, "payload": ladunek}},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert not body.get("error"), body.get("error")
    return body["snapshot"]


@pytest.fixture()
def projekt_i_przypadek(app_client):
    from enm.klucz_twin import klucz_twin_projektu
    from enm.store import set_enm

    res = app_client.post("/api/projects", json={"name": "Pakiet dowodow — produkt"})
    assert res.status_code == 201
    pid = res.json()["id"]
    przypadek = app_client.post(
        "/api/study-cases", json={"project_id": pid, "name": "Przypadek pakietu"}
    )
    assert przypadek.status_code == 201, przypadek.text
    set_enm(klucz_twin_projektu(UUID(pid)), _model())
    return pid, str(przypadek.json()["id"])


@pytest.fixture()
def projekt(app_client, projekt_i_przypadek):
    """Model z danymi rozszerzeń stacji wpisanymi operacjami domenowymi."""
    pid, case_id = projekt_i_przypadek
    _operacja(
        app_client,
        case_id,
        "set_der_catalog_bindings",
        {"generator_ref": "gen/bess-1", "bess_operation_mode_refs": TRYBY},
    )
    _operacja(
        app_client,
        case_id,
        "update_element_parameters",
        {
            "element_ref": "tr/1",
            "parameters": {"tap_changer": {"catalog_ref": PRZELACZNIK}},
        },
    )
    migawka = _operacja(
        app_client,
        case_id,
        "add_vt",
        {
            "bay_ref": "bay-01",
            "catalog_binding": {"catalog_item_id": VT_19},
            "ratio_primary_v": 11547.0,
            "ratio_secondary_v": 57.7,
        },
    )
    (vt,) = (m for m in migawka["measurements"] if m["measurement_type"] == "VT")
    assert (vt["bay_ref"], vt["catalog_ref"]) == ("bay-01", VT_19)
    return pid


def _pakiet(app_client, pid: str) -> dict[str, Any]:
    res = app_client.post(f"/api/v1/projects/{pid}/stations/_validate-all")
    assert res.status_code == 200, res.text
    return res.json()


def test_pakiet_projektu_cztery_rodzaje_nazwy_z_modelu_kazda_stacja(app_client, projekt):
    body = _pakiet(app_client, projekt)
    assert body["station_count"] == 2
    lakowa, polna = body["per_station"]
    assert (lakowa["station_id"], lakowa["station_nazwa"]) == ("stn/1", "Stacja Łąkowa")
    assert (polna["station_id"], polna["station_nazwa"]) == ("stn/2", "Stacja Polna")
    # Stacja z pełnymi danymi w modelu: cztery rodzaje uzasadnień, zero braków.
    assert {d["proof_type"] for d in lakowa["proofs"]} == WYMAGANE_RODZAJE
    assert lakowa["braki_danych"] == []
    assert lakowa["all_pass"] is True
    # Moc eksportu z modelu (`Generator.p_mw` = 0,5 MW), import z odbiorów stacji.
    eksport = next(d for d in lakowa["proofs"] if d["proof_type"] == "HOSTING_CAPACITY_EXPORT")
    assert eksport["details"]["p_export_kw"] == 500.0
    assert eksport["details"]["p_import_kw"] == 500.0
    # Stacja z samym źródłem: jeden dowód (bilans z jej odbiorów), trzy jawne braki.
    assert [d["proof_type"] for d in polna["proofs"]] == ["HOSTING_CAPACITY_EXPORT"]
    assert polna["proofs"][0]["details"]["p_import_kw"] == 100.0
    assert {b["proof_type"] for b in polna["braki_danych"]} == WYMAGANE_RODZAJE - {
        "HOSTING_CAPACITY_EXPORT"
    }
    teksty = " ".join(
        [d["summary_pl"] for s in body["per_station"] for d in s["proofs"]]
        + [b["przyczyna_pl"] for s in body["per_station"] for b in s["braki_danych"]]
    )
    for identyfikator in ("gen/bess-1", "tr/1", "stn/1", "stn/2"):
        assert identyfikator not in teksty
    assert all(d["rodzaj_pl"] for s in body["per_station"] for d in s["proofs"])
    vt = next(d for d in lakowa["proofs"] if d["proof_type"] == "VT_GROUNDING_VALIDATION")
    assert vt["details"]["grounding_type"] == "petersen_coil"


def test_pakiet_bez_danych_rozszerzen_ma_jawne_braki(app_client, projekt_i_przypadek):
    """Brak danych ≠ spełnia: model bez trybów, przełącznika i VT daje nazwane braki."""
    pid, _ = projekt_i_przypadek
    lakowa = _pakiet(app_client, pid)["per_station"][0]
    assert [d["proof_type"] for d in lakowa["proofs"]] == ["HOSTING_CAPACITY_EXPORT"]
    przyczyny = {b["proof_type"]: b["przyczyna_pl"] for b in lakowa["braki_danych"]}
    assert przyczyny["TAP_CHANGER_PLAN"] == BRAK_PRZELACZNIKOW
    assert przyczyny["VT_GROUNDING_VALIDATION"] == BRAK_PRZEKLADNIKOW
    assert "Magazyn Łąkowa" in przyczyny["BESS_OPERATION_MODES"]


def test_usuniecie_przekladnika_operacja_domenowa_wraca_brakiem(
    app_client, projekt_i_przypadek, projekt
):
    """Edycja i usunięcie idą tą samą drogą — pakiet czyta model po każdej operacji."""
    _, case_id = projekt_i_przypadek
    migawka = app_client.get(f"/api/cases/{case_id}/enm").json()
    (vt,) = (m for m in migawka["measurements"] if m["measurement_type"] == "VT")
    _operacja(app_client, case_id, "delete_element", {"element_ref": vt["ref_id"]})
    lakowa = _pakiet(app_client, projekt)["per_station"][0]
    assert "VT_GROUNDING_VALIDATION" not in {d["proof_type"] for d in lakowa["proofs"]}
    assert {b["proof_type"]: b["przyczyna_pl"] for b in lakowa["braki_danych"]} == {
        "VT_GROUNDING_VALIDATION": BRAK_PRZEKLADNIKOW
    }


def test_pakiet_projektu_deterministyczny_bajtowo(app_client, projekt):
    url = f"/api/v1/projects/{projekt}/stations/_validate-all"
    pierwszy = app_client.post(url)
    drugi = app_client.post(url)
    assert pierwszy.status_code == drugi.status_code == 200
    body = pierwszy.json()
    assert pierwszy.content.replace(projekt.encode(), b"") == drugi.content.replace(
        projekt.encode(), b""
    )
    assert all(
        d["generated_at"] == "1970-01-01T00:00:00Z"
        for s in body["per_station"]
        for d in s["proofs"]
    )


def test_raport_z_pakietu_backendu_nazywa_rodzaje_i_wymienia_braki(app_client, projekt):
    polna = _pakiet(app_client, projekt)["per_station"][1]
    res = app_client.post(
        "/api/v1/catalog/konfiguracja-stacji/generate-report",
        json={
            "project_name": "Pakiet dowodow — produkt",
            "station_id": polna["station_id"],
            "station_name": polna["station_nazwa"],
            "proof_pack": polna,
            "formats": ["json", "text_pl", "latex"],
        },
    )
    assert res.status_code == 200, res.text
    raport = res.json()
    tekst = raport["text_pl"]
    assert "Stacja: Stacja Polna" in tekst
    assert "Zdolność przyłączeniowa — eksport wobec importu" in tekst
    # Braki danych nie znikają z dokumentu (brak danych ≠ spełnia).
    assert "Braki danych" in tekst
    assert BRAK_MAGAZYNU in tekst
    assert len(raport["json"]["braki_danych"]) == 3
    assert r"\subsection{Braki danych}" in raport["latex"]


@pytest.mark.parametrize(
    "url",
    [
        "/api/v1/projects/{pid}/audit2-station-config/_validate-all",
        "/api/v1/projects/{pid}/audit2-station-config/stn%2F1",
        "/api/v1/catalog/audit2/generate-report",
        "/api/v1/catalog/audit2/generate-proof-pack",
    ],
)
def test_dawne_koncowki_konfiguracji_stacji_nie_istnieja(app_client, projekt_i_przypadek, url):
    """Osobny magazyn konfiguracji stacji obok modelu skasowany na amen (jedna ścieżka edycji)."""
    pid, _ = projekt_i_przypadek
    pelny = url.format(pid=pid)
    for metoda in ("get", "post", "put"):
        assert getattr(app_client, metoda)(pelny).status_code in {404, 405}


def test_uziemienie_sn_pol_stacji_z_modelu_i_nazwane_braki(app_client, projekt):
    """Konfigurator stacji czyta sposób uziemienia SN z modelu (karta UX-04/POLE-ZU):
    stacja z zespołem uziemiającym z dławikiem → ``petersen_coil``; stacja bez szyn SN
    i stacja spoza modelu → typ ``None`` z nazwaną przyczyną (nigdy domysł)."""
    odpowiedzi: dict[str, dict] = {}

    def zapytaj(stacja: str, pola: list[str]) -> list[dict]:
        res = app_client.post(
            f"/api/v1/projects/{projekt}/stations/{stacja.replace('/', '%2F')}/_uziemienie-sn",
            json={"pola": pola},
        )
        assert res.status_code == 200, res.text
        assert res.json()["station_id"] == stacja
        odpowiedzi[stacja] = res.json()
        return res.json()["pola"]

    assert zapytaj("stn/1", ["Pole 02", "Pole 01", "Pole 01"]) == [
        {
            "oznaczenie": "Pole 01",
            "typ_punktu_neutralnego": "petersen_coil",
            "przyczyna_braku": None,
        },
        {
            "oznaczenie": "Pole 02",
            "typ_punktu_neutralnego": "petersen_coil",
            "przyczyna_braku": None,
        },
    ]
    assert zapytaj("stn/2", ["Pole 01"]) == [
        {
            "oznaczenie": "Pole 01",
            "typ_punktu_neutralnego": None,
            "przyczyna_braku": STACJA_BEZ_SZYN_SN,
        }
    ]
    assert zapytaj("stn/obca", ["Pole 01"]) == [
        {
            "oznaczenie": "Pole 01",
            "typ_punktu_neutralnego": None,
            "przyczyna_braku": STACJA_SPOZA_MODELU_UZIEMIENIE,
        }
    ]

    # Opis sieci SN stacji: jedna sekcja z dławikiem (nastawa 100 A), opis po polsku.
    lakowa = odpowiedzi["stn/1"]
    assert lakowa["przyczyna_braku"] is None
    (sekcja,) = lakowa["sekcje"]
    assert sekcja["szyny"] == ["bus-sn"]
    assert (sekcja["wariant"], sekcja["typ_punktu_neutralnego"]) == ("dlawik", "petersen_coil")
    assert sekcja["prad_dlawikow_a"] == 100.0
    assert [p["element_ref"] for p in sekcja["punkty"]] == ["zu/1"]
    assert "ZU Łąkowa" in sekcja["opis_pl"]
    assert odpowiedzi["stn/2"]["sekcje"] == []
    assert odpowiedzi["stn/2"]["przyczyna_braku"] == STACJA_BEZ_SZYN_SN
    assert odpowiedzi["stn/obca"]["przyczyna_braku"] == STACJA_SPOZA_MODELU_UZIEMIENIE
