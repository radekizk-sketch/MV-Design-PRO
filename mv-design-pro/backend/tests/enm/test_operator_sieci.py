"""Operator sieci — jedna dana modelu i profil NC RfG efektywny źródła (dodatek karty
GPZ-DANE-ANALIZ).

Decyzja architekta: operator sieci (OSD/OSP) jest JEDNĄ daną ENM na poziomie sieci —
``header.connection_conditions.operator_sieci`` (nośnik umownego punktu przyłączenia, ADR-027),
pisarz ``set_connection_conditions`` z walidacją wobec katalogu profili NC RfG. Profil NC RfG
źródła DZIEDZICZY operatora sieci; jawne nadpisanie per źródło tylko z powodem
(``profiles.nc_rfg_profile_powod``), walidator ostrzega przy rozbieżności. Jedna funkcja
backendu ``enm.operator_sieci.efektywny_profil_ncrfg`` — czytają ją: ocena NC RfG (most
modelu), gotowość DER, bramka regulacji napięcia walidatora, raport zgodności referencyjnej.

Iloczyn cech (KLASA NIE INSTANCJA): operator sieci {ustawiony, brak} × źródło {bez profilu,
z profilem} × profil {zgodny z operatorem, różny} × powód {podany, brak} — dla KAŻDEGO
konsumenta (most NC RfG, gotowość DER, bramka regulacji napięcia, ostrzeżenie walidatora) oraz
pisarz {wiązania DER, warunki przyłączenia} × wartość {znana, nieznana, wyczyszczenie}. Sonda:
istniejące projekty z profilem per źródło (bez operatora sieci) dają ten sam wynik NC RfG co
dawna ścieżka jawnego operatora. Regresja magazynu: zapis warunków przyłączenia (pole poza
odciskiem modelu) przez HTTP jest trwały.
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from application.ncrfg_compliance import (
    build_ncrfg_module_inputs_from_enm,
    zgodnosc_ncrfg_przypadku,
)
from catalog.profiles.nc_rfg import list_available_operators, load_nc_rfg_profile
from domain.der_readiness import wejscie_z_generatora
from enm.domain_operations import execute_domain_operation
from enm.hash import POLA_NAGLOWKA_TRESCI_POZA_HASHEM, compute_enm_hash
from enm.models import Bus, ConnectionConditions, EnergyNetworkModel, ENMHeader, Generator
from enm.operator_sieci import (
    KONSUMENCI_OPERATORA_SIECI,
    efektywny_profil_ncrfg,
    nazwa_operatora_pl,
    operator_sieci_modelu,
    operatorzy_katalogu,
    opis_pola_operatora_sieci,
    wymaga_powodu_nadpisania,
)
from enm.rozdzielnica_gpz import eksport_parytetu_rozdzielnicy
from enm.validator import ENMValidator

_OPERATORZY = list_available_operators()
_SIEC = "enea"
_INNY = "pse"
_POWOD = "Przyłączenie do sieci 110 kV PSE"
assert _SIEC in _OPERATORZY and _INNY in _OPERATORZY

_UUID_GEN = "00000000-0000-0000-0000-0000000000b1"


def _generator(
    *,
    profil: str | None = None,
    powod: str | None = None,
    ref_id: str = "pv-1",
    control_mode: str | None = None,
) -> Generator:
    profile: dict[str, Any] = {}
    if profil is not None:
        profile["nc_rfg_profile_ref"] = profil
    if powod is not None:
        profile["nc_rfg_profile_powod"] = powod
    return Generator(
        ref_id=ref_id,
        name=f"Źródło {ref_id}",
        bus_ref="bus-sn",
        p_mw=2.0,
        gen_type="pv_inverter",
        meta={"control_mode": control_mode} if control_mode else {},
        materialized_params={"profiles": profile} if profile else None,
    )


def _model(*generatory: Generator, operator_sieci: str | None = None) -> EnergyNetworkModel:
    header = ENMHeader(name="Operator sieci — test")
    if operator_sieci is not None:
        header = header.model_copy(
            update={"connection_conditions": ConnectionConditions(operator_sieci=operator_sieci)}
        )
    return EnergyNetworkModel(
        header=header,
        buses=[Bus(ref_id="bus-sn", name="Szyna SN", voltage_kv=15.0)],
        generators=list(generatory),
    )


def _kody(enm: EnergyNetworkModel) -> list[str]:
    return [i.code for i in ENMValidator().validate(enm).issues]


def _oczekiwany_profil(profil: str | None, operator: str | None) -> str | None:
    """Reguła z decyzji architekta, zapisana wprost (wyrocznia testu, nie kopia kodu)."""
    return profil if profil is not None else operator


# Iloczyn: operator sieci {brak, enea} × profil źródła {brak, enea (zgodny), pse (różny)}
# × powód {brak, podany}.
_ILOCZYN = list(itertools.product((None, _SIEC), (None, _SIEC, _INNY), (None, _POWOD)))


# ---------------------------------------------------------------------------
# Funkcja jedna: profil efektywny
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("operator", "profil", "powod"), _ILOCZYN)
def test_profil_efektywny_iloczyn(operator: str | None, profil: str | None, powod: str | None):
    efektywny = efektywny_profil_ncrfg(_generator(profil=profil, powod=powod), operator)
    assert efektywny.operator_id == _oczekiwany_profil(profil, operator)
    assert efektywny.zrodlo == (
        "PROFIL_ZRODLA" if profil is not None else "OPERATOR_SIECI" if operator else "BRAK"
    )
    nadpisanie = profil is not None and operator is not None and profil != operator
    assert efektywny.nadpisanie is nadpisanie
    assert efektywny.nadpisanie_bez_powodu is (nadpisanie and powod is None)
    # Predykat parami: pisarz i walidator czytają TEN SAM warunek nadpisania.
    assert wymaga_powodu_nadpisania(profil, operator) is nadpisanie


def test_profil_pusty_i_z_bialymi_znakami_nie_jest_profilem() -> None:
    assert efektywny_profil_ncrfg(_generator(profil="  "), _SIEC).operator_id == _SIEC
    assert efektywny_profil_ncrfg(_generator(profil=f"  {_INNY} "), _SIEC).operator_id == _INNY
    model = _model(operator_sieci=f" {_SIEC} ")
    assert operator_sieci_modelu(model) == _SIEC


# ---------------------------------------------------------------------------
# Konsumenci: most NC RfG, gotowość DER, bramka regulacji napięcia, ostrzeżenie walidatora
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("operator", "profil", "powod"), _ILOCZYN)
def test_most_ncrfg_ocenia_modul_wg_profilu_efektywnego(
    operator: str | None, profil: str | None, powod: str | None
) -> None:
    wejscia = build_ncrfg_module_inputs_from_enm(
        _model(_generator(profil=profil, powod=powod), operator_sieci=operator)
    )
    oczekiwany = _oczekiwany_profil(profil, operator)
    if oczekiwany is None:
        assert wejscia.modules == []
        assert [(p.der_ref, p.powod) for p in wejscia.pominiete] == [
            ("pv-1", "brak_profilu_operatora")
        ]
    else:
        assert [m.operator_id for m in wejscia.modules] == [oczekiwany]
        assert wejscia.pominiete == []


def test_most_jawny_operator_ocenia_wszystkie_moduly_wobec_wyboru() -> None:
    model = _model(
        _generator(profil=_INNY, powod=_POWOD, ref_id="a"),
        _generator(ref_id="b"),
        operator_sieci=_SIEC,
    )
    assert [m.operator_id for m in build_ncrfg_module_inputs_from_enm(model).modules] == [
        _INNY,
        _SIEC,
    ]
    jawnie = build_ncrfg_module_inputs_from_enm(model, operator_id="tauron")
    assert [m.operator_id for m in jawnie.modules] == ["tauron", "tauron"]


@pytest.mark.parametrize(("operator", "profil", "powod"), _ILOCZYN)
def test_gotowosc_der_czyta_profil_efektywny(
    operator: str | None, profil: str | None, powod: str | None
) -> None:
    gen = _generator(profil=profil, powod=powod).model_dump(mode="json")
    we = wejscie_z_generatora(gen, operator_sieci=operator)
    assert we.nc_rfg_profile_ref == _oczekiwany_profil(profil, operator)


@pytest.mark.parametrize(("operator", "profil", "powod"), _ILOCZYN)
def test_bramka_regulacji_napiecia_czyta_profil_efektywny(
    operator: str | None, profil: str | None, powod: str | None
) -> None:
    kody = _kody(
        _model(
            _generator(profil=profil, powod=powod, control_mode="REGULACJA_NAPIECIA"),
            operator_sieci=operator,
        )
    )
    oczekiwany = _oczekiwany_profil(profil, operator)
    brak = "generators.voltage_control_profile_missing" in kody
    assert brak is (oczekiwany is None)
    if oczekiwany is not None:
        dopuszcza = (
            "voltage_control"
            in load_nc_rfg_profile(oczekiwany).reactive_power.voltage_control_modes
        )
        assert ("generators.voltage_control_not_permitted" in kody) is (not dopuszcza)


@pytest.mark.parametrize(("operator", "profil", "powod"), _ILOCZYN)
def test_walidator_ostrzega_przy_rozbieznosci_z_wyjasnieniem(
    operator: str | None, profil: str | None, powod: str | None
) -> None:
    wynik = ENMValidator().validate(
        _model(_generator(profil=profil, powod=powod), operator_sieci=operator)
    )
    rozbieznosci = [i for i in wynik.issues if i.code == "generators.nc_rfg_operator_mismatch"]
    if not (profil is not None and operator is not None and profil != operator):
        assert rozbieznosci == []
        return
    (problem,) = rozbieznosci
    assert problem.severity == "IMPORTANT"
    assert problem.element_refs == ["pv-1"]
    # Wyjaśnienie: obaj operatorzy z nazwy katalogu i powód (albo jego brak) — nie identyfikatory.
    assert nazwa_operatora_pl(profil) in problem.message_pl
    assert nazwa_operatora_pl(operator) in problem.message_pl
    if powod is not None:
        assert powod in problem.message_pl
    else:
        assert "powodu nie podano" in problem.message_pl


def test_walidator_operator_spoza_katalogu() -> None:
    assert "connection.operator_sieci_unknown" in _kody(_model(operator_sieci="nieistnieje"))
    for operator in (None, *_OPERATORZY):
        assert "connection.operator_sieci_unknown" not in _kody(_model(operator_sieci=operator))


# ---------------------------------------------------------------------------
# Pisarze: wiązania DER (nadpisanie tylko z powodem) i warunki przyłączenia
# ---------------------------------------------------------------------------


def _enm_dict(operator: str | None, profil: str | None = None) -> dict[str, Any]:
    gen = _generator(profil=profil).model_dump(mode="json")
    gen["id"] = _UUID_GEN
    model = _model(operator_sieci=operator).model_dump(mode="json")
    model["generators"] = [gen]
    return model


def _profile_po(wynik: dict[str, Any]) -> dict[str, Any]:
    return (wynik["snapshot"]["generators"][0].get("materialized_params") or {}).get(
        "profiles"
    ) or {}


@pytest.mark.parametrize(
    ("operator", "profil", "powod"),
    [(o, p, w) for o, p, w in _ILOCZYN if p is not None],
)
def test_pisarz_wiazan_nadpisanie_tylko_z_powodem(
    operator: str | None, profil: str, powod: str | None
) -> None:
    payload: dict[str, Any] = {"generator_ref": "pv-1", "nc_rfg_profile_ref": profil}
    if powod is not None:
        payload["nc_rfg_profile_powod"] = powod
    wynik = execute_domain_operation(
        enm_dict=_enm_dict(operator), op_name="set_der_catalog_bindings", payload=payload
    )
    if operator is not None and profil != operator and powod is None:
        assert wynik.get("error_code") == "der_bindings.nc_rfg_override_reason_missing"
        assert nazwa_operatora_pl(profil) in wynik["error"]
        assert nazwa_operatora_pl(operator) in wynik["error"]
        return
    assert wynik.get("error") is None, wynik.get("error")
    profile = _profile_po(wynik)
    assert profile["nc_rfg_profile_ref"] == profil
    assert profile.get("nc_rfg_profile_powod") == powod


def test_pisarz_wiazan_wyczyszczenie_profilu_czysci_powod() -> None:
    enm = _enm_dict(_SIEC)
    enm["generators"][0]["materialized_params"] = {
        "profiles": {"nc_rfg_profile_ref": _INNY, "nc_rfg_profile_powod": _POWOD}
    }
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="set_der_catalog_bindings",
        payload={"generator_ref": "pv-1", "nc_rfg_profile_ref": None},
    )
    assert wynik.get("error") is None, wynik.get("error")
    assert "nc_rfg_profile_powod" not in _profile_po(wynik)
    assert "nc_rfg_profile_ref" not in _profile_po(wynik)


@pytest.mark.parametrize("operator", _OPERATORZY)
def test_pisarz_warunkow_zapisuje_operatora_z_katalogu(operator: str) -> None:
    wynik = execute_domain_operation(
        enm_dict=_enm_dict(None),
        op_name="set_connection_conditions",
        payload={"operator_sieci": operator},
    )
    assert wynik.get("error") is None, wynik.get("error")
    assert wynik["snapshot"]["header"]["connection_conditions"]["operator_sieci"] == operator


def test_pisarz_warunkow_odmawia_operatora_spoza_katalogu_i_czysci_nullem() -> None:
    odmowa = execute_domain_operation(
        enm_dict=_enm_dict(_SIEC),
        op_name="set_connection_conditions",
        payload={"operator_sieci": "nieistnieje"},
    )
    assert odmowa.get("error_code") == "connection_conditions.operator_unknown"
    # Identyfikator spoza katalogu nie jest nazwą — odmowa mówi słowami i wylicza katalog.
    assert "nieistnieje" not in odmowa["error"]
    assert nazwa_operatora_pl(_SIEC) in odmowa["error"]
    wyczyszczone = execute_domain_operation(
        enm_dict=_enm_dict(_SIEC),
        op_name="set_connection_conditions",
        payload={"operator_sieci": None},
    )
    assert wyczyszczone.get("error") is None, wyczyszczone.get("error")
    warunki = wyczyszczone["snapshot"]["header"].get("connection_conditions") or {}
    assert warunki.get("operator_sieci") is None


def test_operator_sieci_nie_zmienia_odcisku_modelu() -> None:
    """Warunki przyłączenia są poza odciskiem (determinizm: istniejące hasze bez zmian)."""
    assert "connection_conditions" in POLA_NAGLOWKA_TRESCI_POZA_HASHEM
    assert compute_enm_hash(_model(_generator())) == compute_enm_hash(
        _model(_generator(), operator_sieci=_SIEC)
    )


# ---------------------------------------------------------------------------
# Sonda: projekty z profilem per źródło dają ten sam wynik NC RfG
# ---------------------------------------------------------------------------


def _bez_odcisku_przypadku(odpowiedz: Any) -> dict[str, Any]:
    tresc = odpowiedz.model_dump(mode="json")
    tresc.pop("zrodlo_operatora")
    return tresc


@pytest.mark.parametrize("profil", _OPERATORZY)
@pytest.mark.parametrize("operator_sieci", [None, "zgodny"])
def test_sonda_profil_per_zrodlo_ten_sam_wynik_co_jawny_operator(
    profil: str, operator_sieci: str | None
) -> None:
    """Dawna ścieżka ekranu: wspólny profil modułów wysłany jawnie jako ``operator_id``.
    Nowa: bez operatora — moduły oceniane wg profilu efektywnego. Bieg identyczny (z odciskiem),
    różni się wyłącznie ``zrodlo_operatora``; dotyczy też modelu z operatorem sieci zgodnym."""
    model = _model(
        _generator(profil=profil, ref_id="a"),
        _generator(profil=profil, ref_id="b"),
        operator_sieci=profil if operator_sieci else None,
    )
    z_modelu = zgodnosc_ncrfg_przypadku(model, operator_id=None, case_id="sonda")
    jawnie = zgodnosc_ncrfg_przypadku(model, operator_id=profil, case_id="sonda")
    assert z_modelu.zrodlo_operatora == "MODEL"
    assert jawnie.zrodlo_operatora == "WYBOR_PROJEKTANTA"
    assert z_modelu.operator_id == jawnie.operator_id == profil
    assert _bez_odcisku_przypadku(z_modelu) == _bez_odcisku_przypadku(jawnie)


def test_sonda_rozni_operatorzy_per_modul_bez_wspolnego_operatora() -> None:
    model = _model(
        _generator(profil=_INNY, powod=_POWOD, ref_id="a"),
        _generator(ref_id="b"),
        operator_sieci=_SIEC,
    )
    wynik = zgodnosc_ncrfg_przypadku(model, operator_id=None, case_id="sonda")
    assert wynik.operator_id is None
    assert wynik.zrodlo_operatora == "MODEL"
    assert wynik.der_count == 2


# ---------------------------------------------------------------------------
# Definicja pola rejestru GPZ
# ---------------------------------------------------------------------------


def test_definicja_pola_operatora_sieci_w_tablicy_parytetu_gpz() -> None:
    pole = eksport_parytetu_rozdzielnicy()["pole_operatora_sieci"]
    assert pole == opis_pola_operatora_sieci()
    assert pole["klucz"] in ConnectionConditions.model_fields
    assert pole["dozwolone"] == list(operatorzy_katalogu())
    assert pole["konsumenci"] == list(KONSUMENCI_OPERATORA_SIECI)
    # Pisarz i kod odmowy są realne: operacja przyjmuje pole i odmawia wartości spoza słownika.
    odmowa = execute_domain_operation(
        enm_dict=_enm_dict(None), op_name=pole["operacja"], payload={pole["klucz"]: "x"}
    )
    assert odmowa.get("error_code") == pole["kod_bledu"]
    sciezka = pole["sciezka_w_modelu"].split(".")
    zapis = execute_domain_operation(
        enm_dict=_enm_dict(None), op_name=pole["operacja"], payload={pole["klucz"]: _SIEC}
    )
    wartosc: Any = zapis["snapshot"]
    for klucz in sciezka:
        wartosc = wartosc[klucz]
    assert wartosc == _SIEC


# ---------------------------------------------------------------------------
# Ścieżka HTTP: trwałość zapisu warunków przyłączenia + ocena z modelu
# ---------------------------------------------------------------------------


def _przypadek_http(client: Any, model: EnergyNetworkModel) -> str:
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import set_enm

    projekt = client.post("/api/projects", json={"name": "Operator sieci — test"})
    assert projekt.status_code == 201, projekt.text
    przypadek = client.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Wariant"}
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = str(przypadek.json()["id"])
    set_enm(klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory), model)
    return case_id


def test_http_zapis_operatora_sieci_jest_trwaly_i_steruje_ocena() -> None:
    """Regresja magazynu: zapis różniący się WYŁĄCZNIE treścią poza odciskiem (warunki
    przyłączenia) był uznawany za równoważny i gubiony — 200 bez zapisu."""
    from api.main import app
    from enm.store import reset_enm_store
    from fastapi.testclient import TestClient

    reset_enm_store()
    with TestClient(app) as app_client:
        _scenariusz_http(app_client)


def _scenariusz_http(app_client: Any) -> None:
    case_id = _przypadek_http(app_client, _model(_generator()))
    przed = app_client.get(f"/api/ncrfg-tests/cases/{case_id}/compliance")
    assert przed.status_code == 200, przed.text
    assert przed.json()["der_count"] == 0
    assert [p["powod"] for p in przed.json()["pominiete"]] == ["brak_profilu_operatora"]

    zapis = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "set_connection_conditions",
                "payload": {"operator_sieci": _SIEC},
            }
        },
    )
    assert zapis.status_code == 200, zapis.text
    assert zapis.json().get("error") is None, zapis.text
    model = app_client.get(f"/api/cases/{case_id}/enm")
    assert model.status_code == 200, model.text
    assert model.json()["header"]["connection_conditions"]["operator_sieci"] == _SIEC

    po = app_client.get(f"/api/ncrfg-tests/cases/{case_id}/compliance")
    assert po.status_code == 200, po.text
    cialo = po.json()
    assert (cialo["der_count"], cialo["operator_id"], cialo["zrodlo_operatora"]) == (
        1,
        _SIEC,
        "MODEL",
    )
    jawnie = app_client.get(
        f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": _SIEC}
    ).json()
    assert jawnie["zrodlo_operatora"] == "WYBOR_PROJEKTANTA"
    assert {**jawnie, "zrodlo_operatora": "MODEL"} == cialo
