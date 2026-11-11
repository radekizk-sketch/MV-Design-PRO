"""Kody funkcji EAZ pola wyłącznie ze słownika funkcji EAZ.

Słownik `network_model.catalog.funkcje_eaz` deklaruje: „każdy kod zapisany w modelu albo
w szablonie musi mieć tu wpis — kod spoza słownika jest błędem szablonu i operacji”. Znalezisko
karty UX-04/POLE-LINIOWE-WZORZEC (bieg e2e 2026-11-05): operacja `update_element_parameters`
zapisywała kody 46 i 49 polu liniowemu GPZ, a walidacja gotowości po operacji (ocena pola
liniowego GPZ → `opis_funkcji_eaz_pl`) kończyła się `KeyError` — błąd serwera 500.

Scalenie z kartą OCHRONA-JEDNO-ZRODLO (ADR-022, drzewo integracji 2026-11-11): kody funkcji
nie są już polem rekordu pola — żyją w sterowniku pola (`protection_assignments`,
`enm.zabezpieczenie`). Intencja testu zostaje na nowej strukturze, w każdym pisarzu zestawu
funkcji pola:
  * `update_element_parameters` na polu nie przyjmuje kodów funkcji w ogóle (parametr spoza
    listy edytowalnej) — odmowa nazwana bez skutku w modelu;
  * budowa pola z zestawem funkcji szablonu (`zbuduj_pole(funkcje_eaz=…)`) i zmiana zestawu
    (`zmien_pole(funkcje_eaz=…)`) — kod spoza słownika = `BladPola` z nazwanym kodem
    (`enm.pola.kody_funkcji_pola_ze_slownika`);
  * kontrakt modelu przyjmuje sterownik z kodem spoza słownika (odmowa przy odczycie magazynu
    zastąpiłaby zapisany projekt modelem domyślnym), a regułę rejestru stosuje kontrola
    sterownika (`enm.nastawy_zabezpieczen.bledy_sterownika`).

Iloczyn cech: pisarz {operacja, budowa pola, zmiana pola} × zestaw kodów {wyłącznie
słownikowe, wyłącznie spoza słownika, mieszany} × pole {pole liniowe GPZ z szablonem ENEA
i powiązaniami obwodów wtórnych (ścieżka oceny, która padała), pole bez szablonu}.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.nastawy_zabezpieczen import bledy_sterownika
from enm.pola import KLUCZ_STEROWNIKA_POLA, BladPola, zbuduj_pole, zmien_pole
from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ

from tests.reference_networks.sceny_zajetosci_pol import _gpz

ZESTAWY: dict[str, list[str]] = {
    "slownikowe": ["50", "51", "51N", "79"],
    # Kody spoza rejestru (dawne 46 i 49 są w rejestrze funkcji sterownika karty
    # OCHRONA-JEDNO-ZRODLO — iniekcja potrzebuje kodów, których słownik nie zna).
    "spoza_slownika": ["46X", "Q99"],
    "mieszany": ["51", "46X"],
}


def _pole_liniowe_gpz(enm: dict[str, Any]) -> dict[str, Any]:
    gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
    return next(
        b
        for b in enm["bays"]
        if b.get("substation_ref") == gpz["ref_id"] and b.get("bay_role") in ("OUT", "FEEDER")
    )


def _sterownik(enm: dict[str, Any], bay_ref: str) -> dict[str, Any]:
    return next(p for p in enm["protection_assignments"] if p.get("bay_ref") == bay_ref)


@pytest.fixture(scope="module")
def siec_gpz() -> dict[str, Any]:
    return _gpz(z_zaciskami=True, sekcje=1)


def test_slownik_nie_zna_kodow_iniekcji() -> None:
    # Warunek iloczynu: zestaw „spoza słownika” rzeczywiście jest spoza słownika.
    assert not set(ZESTAWY["spoza_slownika"]) & set(FUNKCJE_EAZ)
    assert set(ZESTAWY["slownikowe"]) <= set(FUNKCJE_EAZ)


@pytest.mark.parametrize("zestaw", sorted(ZESTAWY))
def test_operacja_na_polu_liniowym_gpz_nie_przyjmuje_kodow(
    siec_gpz: dict[str, Any], zestaw: str
) -> None:
    enm = copy.deepcopy(siec_gpz)
    pole = _pole_liniowe_gpz(enm)
    # Pole wzorca ENEA z powiązaniami obwodów wtórnych — ścieżka oceny pola liniowego GPZ.
    assert pole.get("bay_template_ref")
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="update_element_parameters",
        payload={
            "element_ref": pole["ref_id"],
            "parameters": {"protection_codes": ZESTAWY[zestaw]},
        },
    )
    assert wynik["error_code"] == "params.key_not_allowed"
    # Bez skutku w modelu: wejście nietknięte.
    assert enm == siec_gpz


@pytest.mark.parametrize("zestaw", sorted(ZESTAWY))
@pytest.mark.parametrize("z_szablonem", [True, False])
def test_budowa_rekordu_pola(zestaw: str, z_szablonem: bool) -> None:
    argumenty: dict[str, Any] = {
        "ref_id": "pole/test",
        "bay_role": "OUT",
        "bus_ref": "szyna/test",
        "substation_ref": "stacja/test",
        "funkcje_eaz": ZESTAWY[zestaw],
        "stan_obiektu": "PROJEKTOWANY",
    }
    if z_szablonem:
        argumenty["bay_template_ref"] = "bay_template_gpz_line_enea_z10_trojpolozeniowy"
    if zestaw == "slownikowe":
        rekord = zbuduj_pole(**argumenty)
        assert rekord[KLUCZ_STEROWNIKA_POLA] == {"kody": ZESTAWY[zestaw]}
        return
    with pytest.raises(BladPola, match="spoza słownika: 46X"):
        zbuduj_pole(**argumenty)


@pytest.mark.parametrize("zestaw", sorted(ZESTAWY))
def test_zmiana_zestawu_funkcji_pola(siec_gpz: dict[str, Any], zestaw: str) -> None:
    enm = copy.deepcopy(siec_gpz)
    pole = _pole_liniowe_gpz(enm)
    if zestaw == "slownikowe":
        zmien_pole(enm, pole["ref_id"], funkcje_eaz=ZESTAWY[zestaw])
        kody = [f["kod"] for f in _sterownik(enm, pole["ref_id"])["funkcje"]]
        assert set(ZESTAWY[zestaw]) <= set(kody)
        return
    with pytest.raises(BladPola, match="spoza słownika: 46X"):
        zmien_pole(enm, pole["ref_id"], funkcje_eaz=ZESTAWY[zestaw])
    # Odmowa przed zapisem: model nietknięty.
    assert enm == siec_gpz


@pytest.mark.parametrize("zestaw", sorted(ZESTAWY))
def test_kontrakt_sterownika_odrzuca_kod_spoza_rejestru(
    siec_gpz: dict[str, Any], zestaw: str
) -> None:
    # Kanon karty OCHRONA-JEDNO-ZRODLO (ADR-022): spójność sterownika (`bledy_sterownika`, w tym
    # kod z rejestru funkcji) jest regułą kontraktu `ProtectionAssignment` — ta sama reguła
    # w operacjach i przy wczytaniu. Dawna decyzja karty pola liniowego („kontrakt `Bay` przyjmuje
    # kod spoza słownika”) dotyczyła skasowanego pola `Bay.protection_codes`; przy scaleniu
    # zgłoszona architektowi jako punkt do decyzji (odczyt magazynu z kodem usuniętym
    # z rejestru zastępuje migawkę modelem domyślnym).
    enm = copy.deepcopy(siec_gpz)
    sterownik = _sterownik(enm, _pole_liniowe_gpz(enm)["ref_id"])
    sterownik["funkcje"] = [
        *sterownik["funkcje"],
        *({"ref": f"{kod}-t", "kod": kod, "wlaczona": True} for kod in ZESTAWY[zestaw]),
    ]
    assert bool([b for b in bledy_sterownika(sterownik) if "spoza rejestru" in b]) is (
        zestaw != "slownikowe"
    )
    if zestaw == "slownikowe":
        EnergyNetworkModel.model_validate(enm)
        return
    with pytest.raises(ValueError, match="spoza rejestru funkcji"):
        EnergyNetworkModel.model_validate(enm)
