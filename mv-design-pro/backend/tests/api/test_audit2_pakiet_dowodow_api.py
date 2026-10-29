"""Pakiet dowodow walidacji rozszerzen na sciezce produktu (karta PROOFPACK-KONTRAKT).

Sciezka uzytkownika: projekt → model sieci → konfiguracja stacji zapisana przez API →
`POST /api/v1/projects/{id}/audit2-station-config/_validate-all` → raport
`POST /api/v1/catalog/audit2/generate-report` z pakietu zwroconego przez backend.

Na bazie karty (czubek `4199d528`) ta sama intencja konczyla sie HTTP 500
(`generate_bess_modes_proof() missing ... 'der_nazwa'`) na dawnej koncowce
`generate-proof-pack`, a `_validate-all` nie skladal dowodu trybow BESS wcale.
"""

from __future__ import annotations

from uuid import UUID

import pytest

pytest.importorskip("fastapi")

WYMAGANE_RODZAJE = {
    "AUDIT2_BESS_OPERATION_MODES",
    "AUDIT2_TAP_CHANGER_PLAN",
    "AUDIT2_HOSTING_CAPACITY_EXPORT",
    "AUDIT2_DEVICE_WITHSTAND",
    "AUDIT2_VT_GROUNDING_VALIDATION",
}


def _model():
    from enm.models import (
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
                p_mw=0.5,
                gen_type="bess",
                catalog_ref="conv-bess-tesla-megapack-3p9mw-15kv",
            ),
            Generator(ref_id="gen/pv-2", name="PV Polna", bus_ref="bus-nn-2", p_mw=0.1),
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


KONFIGURACJA_LAKOWA = {
    "tap_changer_refs": [],
    "der_specs": [
        {
            "der_id": "gen/bess-1",
            "der_kind": "BESS",
            "bess_operation_mode_refs": ["mode_voltage_support"],
            "nominal_power_kw": 600.0,
        }
    ],
    "transformer_tap_changers": {"tr/1": "tc_detc_snnn_5_25"},
    "bay_vts": {"Pole 01": "vt_20kv_fz_100_3_05_3p_siemens"},
    "bay_device_withstand": {
        "Pole 02": {
            "device_id": "wstd_breaker_vacuum_15_25",
            "i_peak_calculated_ka": 50,
            "i_thermal_calculated_ka": 20,
            "t_clearing_s": 1.0,
        }
    },
}
KONFIGURACJA_POLNA = {
    "der_specs": [{"der_id": "gen/pv-2", "der_kind": "PV", "nominal_power_kw": 100.0}],
}


@pytest.fixture()
def projekt(app_client):
    from enm.klucz_twin import klucz_twin_projektu
    from enm.store import set_enm

    res = app_client.post("/api/projects", json={"name": "Pakiet dowodow — produkt"})
    assert res.status_code == 201
    pid = res.json()["id"]
    set_enm(klucz_twin_projektu(UUID(pid)), _model())
    for stacja, konfiguracja in (("stn/1", KONFIGURACJA_LAKOWA), ("stn/2", KONFIGURACJA_POLNA)):
        put = app_client.put(
            f"/api/v1/projects/{pid}/audit2-station-config/{stacja.replace('/', '%2F')}",
            json=konfiguracja,
        )
        assert put.status_code == 200, put.text
    return pid


def test_pakiet_projektu_piec_rodzajow_nazwy_z_modelu_kazda_stacja(app_client, projekt):
    res = app_client.post(f"/api/v1/projects/{projekt}/audit2-station-config/_validate-all")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["station_count"] == 2
    lakowa, polna = body["per_station"]
    assert (lakowa["station_id"], lakowa["station_nazwa"]) == ("stn/1", "Stacja Łąkowa")
    assert (polna["station_id"], polna["station_nazwa"]) == ("stn/2", "Stacja Polna")
    # Stacja z pelna konfiguracja: piec rodzajow uzasadnien, zero brakow.
    assert {d["proof_type"] for d in lakowa["proofs"]} == WYMAGANE_RODZAJE
    assert lakowa["braki_danych"] == []
    assert lakowa["all_pass"] is True
    # Stacja z samym zrodlem: jeden dowod (bilans z jej odbiorow), cztery jawne braki.
    assert [d["proof_type"] for d in polna["proofs"]] == ["AUDIT2_HOSTING_CAPACITY_EXPORT"]
    assert polna["proofs"][0]["details"]["p_import_kw"] == 100.0
    assert {b["proof_type"] for b in polna["braki_danych"]} == WYMAGANE_RODZAJE - {
        "AUDIT2_HOSTING_CAPACITY_EXPORT"
    }
    teksty = " ".join(
        [d["summary_pl"] for s in body["per_station"] for d in s["proofs"]]
        + [b["przyczyna_pl"] for s in body["per_station"] for b in s["braki_danych"]]
    )
    for identyfikator in ("gen/bess-1", "tr/1", "stn/1", "stn/2"):
        assert identyfikator not in teksty
    assert all(d["rodzaj_pl"] for s in body["per_station"] for d in s["proofs"])
    vt = next(d for d in lakowa["proofs"] if d["proof_type"] == "AUDIT2_VT_GROUNDING_VALIDATION")
    assert vt["details"]["grounding_type"] == "petersen_coil"


def test_pakiet_projektu_deterministyczny_bajtowo(app_client, projekt):
    url = f"/api/v1/projects/{projekt}/audit2-station-config/_validate-all"
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
    body = app_client.post(f"/api/v1/projects/{projekt}/audit2-station-config/_validate-all").json()
    polna = body["per_station"][1]
    res = app_client.post(
        "/api/v1/catalog/audit2/generate-report",
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
    assert "AUDIT2_" not in tekst
    # Braki danych nie znikaja z dokumentu (brak danych ≠ spelnia).
    assert "Braki danych" in tekst
    assert "Konfiguracja stacji nie zawiera magazynu energii" in tekst
    assert len(raport["json"]["braki_danych"]) == 4
    assert r"\subsection{Braki danych}" in raport["latex"]


def test_dawna_koncowka_surowych_specyfikacji_nie_istnieje(app_client):
    """Koncowka z nietypowanymi specyfikacjami (`**spec` → HTTP 500) usunieta na amen."""
    res = app_client.post(
        "/api/v1/catalog/audit2/generate-proof-pack",
        json={"station_id": "s", "bess_modes_specs": [{"der_id": "d"}]},
    )
    assert res.status_code == 404


def test_uziemienie_sn_pol_stacji_z_modelu_i_nazwane_braki(app_client, projekt):
    """Konfigurator stacji czyta sposób uziemienia SN z modelu (karta UX-04/POLE-ZU):
    stacja z zespołem uziemiającym z dławikiem → ``petersen_coil``; stacja bez szyn SN
    i stacja spoza modelu → typ ``None`` z nazwaną przyczyną (nigdy domysł)."""
    from application.proof_engine.packs.audit2_skladanie import (
        STACJA_BEZ_SZYN_SN,
        STACJA_SPOZA_MODELU_UZIEMIENIE,
    )

    odpowiedzi: dict[str, dict] = {}

    def zapytaj(stacja: str, pola: list[str]) -> list[dict]:
        res = app_client.post(
            f"/api/v1/projects/{projekt}/audit2-station-config/"
            f"{stacja.replace('/', '%2F')}/_uziemienie-sn",
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
