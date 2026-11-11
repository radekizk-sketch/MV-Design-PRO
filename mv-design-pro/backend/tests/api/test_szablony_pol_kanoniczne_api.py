"""`GET /api/catalog/bay-templates` — filtr szablonów pola SN z backendu (karta UX-04/POLE-LINIOWE-
WZORZEC, rozszerzenia 2–3).

PO CO. Picker szablonu pola (`ui/field/EdytorWyposazeniaPola.tsx`) pokazywał wyłącznie szablony
producenckie (`/complete-bay-templates`) — dziewięć szablonów pola liniowego GPZ wg ENEA (Z.10,
Z.11.1, Z.11 × trzy wykonania łączników) było nieosiągalnych z interfejsu, a szablon niedopuszczony
w polu (wykonanie trójpołożeniowe w rozdzielnicy powietrznej, wzorzec GPZ poza GPZ, Z.10 w polu
z generacją) projektant poznawał dopiero z odmowy zapisu. Końcówka ocenia każdy szablon w polu
o podanych cechach TĄ SAMĄ regułą co strażnik operacji, a odmowa niesie kod i zdanie z podstawą.

ILOCZYN CECH: szablon (każdy z rejestru) × pole GPZ {tak, nie} × izolacja rodziny {brak rodziny,
powietrzna, stało-powietrzna, gazowa bez F, SF₆} × klasa pola {brak, odbiorcze, mieszane,
dedykowane wytwórcy}. Wyrocznia to jawne reguły standardu zapisane w teście (§13, Z.10–Z.11,
IRiESD II.4.5.4.2), nie wywołanie funkcji produkcyjnej. Parytet z operacją: ten sam szablon
odrzucony przez końcówkę jest odrzucony przez `set_bay_equipment` tym samym kodem.
"""

from __future__ import annotations

import itertools

import pytest
from network_model.catalog.bay_templates import BAY_TEMPLATE_REGISTRY, funkcje_eaz_szablonu
from network_model.catalog.funkcje_eaz import opis_funkcji_eaz_pl

RODZINY = {
    None: None,
    "TYP_OGOLNY_OSD__GPZ_AIS": "air",
    "TYP_OGOLNY_OSD__GPZ_SSIS": "ssis",
    "TYP_OGOLNY_OSD__GPZ_GAZ_BEZ_F": "gaz_bez_f",
    "SIEMENS__8DJH": "sf6",
}
KLASY = [None, "ODBIORCZE", "MIESZANE", "DEDYKOWANE_WYTWORCY"]


def _oczekiwane_kody(szablon, pole_gpz: bool, izolacja: str | None, klasa: str | None) -> list:
    kody = []
    # ENEA Zeszyt 1, §13: izolacja powietrzna — wyłącznie wyłącznik stały z odłącznikiem albo
    # wysuwny; łącznik trójpołożeniowy wymaga izolacji gazowej albo stało-powietrznej.
    if izolacja == "air" and szablon.wykonanie_lacznikow == "TROJPOLOZENIOWY":
        kody.append("pole.wykonanie_lacznikow_niezgodne_z_izolacja")
    # Wzorce Z.10/Z.11.1/Z.11 opisują pola rozdzielni SN stacji 110 kV/SN.
    if szablon.tylko_gpz and not pole_gpz:
        kody.append("pole.szablon_tylko_gpz")
    # IRiESD II.4.5.4.2.2–2.3: pole z generacją wymaga przekładnika napięciowego od strony linii
    # (Z.11.1, Z.11); Z.10 go nie ma.
    if klasa in {"MIESZANE", "DEDYKOWANE_WYTWORCY"} and szablon.wykonanie_pola == "Z10":
        kody.append("pole.klasa_pola_niezgodna_z_wykonaniem")
    return kody


@pytest.mark.parametrize(
    "pole_gpz,rodzina,klasa", list(itertools.product([True, False], RODZINY, KLASY))
)
def test_ocena_kazdego_szablonu_w_iloczynie_cech_pola(app_client, pole_gpz, rodzina, klasa):
    parametry: dict[str, str] = {}
    if pole_gpz:
        parametry["pole_gpz"] = "true"
    if rodzina:
        parametry["switchgear_family_ref"] = rodzina
    if klasa:
        parametry["klasa_pola"] = klasa
    odpowiedz = app_client.get("/api/catalog/bay-templates", params=parametry)
    assert odpowiedz.status_code == 200, odpowiedz.text
    wpisy = odpowiedz.json()
    assert [w["template_ref"] for w in wpisy] == sorted(BAY_TEMPLATE_REGISTRY)
    for wpis in wpisy:
        szablon = BAY_TEMPLATE_REGISTRY[wpis["template_ref"]]
        oczekiwane = _oczekiwane_kody(szablon, pole_gpz, RODZINY[rodzina], klasa)
        assert [o["kod"] for o in wpis["odmowy"]] == oczekiwane, wpis["template_ref"]
        assert wpis["dopuszczony"] is (not oczekiwane)
        # Odmowa = zdanie z podstawą i akcją, nie sam kod.
        for odmowa in wpis["odmowy"]:
            assert "ENEA" in odmowa["komunikat_pl"] or "IRiESD" in odmowa["komunikat_pl"]
            assert any(slowo in odmowa["komunikat_pl"] for slowo in ("Wybierz", "zmień"))
        # Zestaw EAZ w KLASIE pola = zestaw, który operacja zapisze w `Bay.protection_codes`.
        assert wpis["funkcje_eaz"] == funkcje_eaz_szablonu(szablon.template_id, klasa)
        assert wpis["funkcje_eaz_pl"] == [opis_funkcji_eaz_pl(k) for k in wpis["funkcje_eaz"]]
        assert wpis["podstawa"] == szablon.podstawa
        assert wpis["tylko_gpz"] is szablon.tylko_gpz


def test_filtr_roli_pola(app_client):
    wpisy = app_client.get("/api/catalog/bay-templates", params={"bay_role": "OUT"}).json()
    assert {w["bay_role"] for w in wpisy} == {"OUT"}
    # Szablon bazowy pola odpływowego + dziewięć szablonów pola liniowego GPZ.
    assert sum(1 for w in wpisy if w["wykonanie_pola"]) == 9


def test_zestaw_eaz_zalezy_od_klasy(app_client):
    """Ten sam szablon Z.11 w klasie mieszanej ma kierunkowe 67, a dedykowanej — bez SPZ i SCO."""

    def eaz(klasa: str) -> list[str]:
        wpisy = app_client.get(
            "/api/catalog/bay-templates", params={"pole_gpz": "true", "klasa_pola": klasa}
        ).json()
        return next(
            w["funkcje_eaz"]
            for w in wpisy
            if w["template_ref"] == "bay_template_gpz_line_enea_z11_staly_z_odlacznikiem"
        )

    mieszane, dedykowane = eaz("MIESZANE"), eaz("DEDYKOWANE_WYTWORCY")
    assert "67" in mieszane and "SCO" not in mieszane
    assert "79" not in dedykowane and "SPZE" not in dedykowane and "SCO" not in dedykowane


def test_odmowy_wejscia(app_client):
    zla_klasa = app_client.get("/api/catalog/bay-templates", params={"klasa_pola": "INNA"})
    assert zla_klasa.status_code == 422
    assert "Klasa pola liniowego" in zla_klasa.json()["detail"]
    zla_rodzina = app_client.get(
        "/api/catalog/bay-templates", params={"switchgear_family_ref": "NIEZNANA"}
    )
    assert zla_rodzina.status_code == 404


def test_deterministyczna_odpowiedz(app_client):
    parametry = {"pole_gpz": "true", "switchgear_family_ref": "TYP_OGOLNY_OSD__GPZ_AIS"}
    pierwsza = app_client.get("/api/catalog/bay-templates", params=parametry).json()
    druga = app_client.get("/api/catalog/bay-templates", params=parametry).json()
    assert pierwsza == druga


@pytest.mark.parametrize(
    "rodzina,klasa",
    list(
        itertools.product(
            [None, "TYP_OGOLNY_OSD__GPZ_AIS", "TYP_OGOLNY_OSD__GPZ_SSIS"],
            KLASY,
        )
    ),
)
def test_parytet_odmowy_konczowki_i_operacji(app_client, rodzina, klasa):
    """Szablon odrzucony przez końcówkę jest odrzucony przez `set_bay_equipment` TYM SAMYM kodem
    (pierwsza reguła), a dopuszczony — zapisywany (jedna reguła `odmowy_szablonu_dla_pola`)."""
    from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
    from network_model.catalog.bay_templates import BAY_TEMPLATES_GPZ_LINE

    from tests.reference_networks.sceny_zajetosci_pol import APARAT, ZRODLO, ok, op

    pusty = EnergyNetworkModel(header=ENMHeader(name="PARYTET", defaults=ENMDefaults()))
    payload = {
        "voltage_kv": 15.0,
        "sk3_mva": 250.0,
        "catalog_ref": ZRODLO,
        "line_fields_per_section": 1,
        "gpz_line_field_apparatus": {"catalog_ref": APARAT},
    }
    if rodzina:
        payload["switchgear_family_ref"] = rodzina
    enm = ok(op(pusty.model_dump(mode="json"), "add_grid_source_sn", payload))
    pole = next(b for b in enm["bays"] if "gpz_line_field" in (b.get("tags") or []))
    parametry = {"pole_gpz": "true", "bay_role": "OUT"}
    if rodzina:
        parametry["switchgear_family_ref"] = rodzina
    if klasa:
        parametry["klasa_pola"] = klasa
    wpisy = {
        w["template_ref"]: w
        for w in app_client.get("/api/catalog/bay-templates", params=parametry).json()
    }
    for szablon in BAY_TEMPLATES_GPZ_LINE:
        zadanie = {
            "bay_ref": pole["ref_id"],
            "mode": "szablon",
            "bay_template_ref": szablon.template_id,
        }
        if klasa:
            zadanie["klasa_pola"] = klasa
        wynik = op(enm, "set_bay_equipment", zadanie)
        wpis = wpisy[szablon.template_id]
        if wpis["dopuszczony"]:
            assert not wynik.get("error"), (szablon.template_id, wynik.get("error"))
        else:
            assert wynik.get("error_code") == wpis["odmowy"][0]["kod"], szablon.template_id
