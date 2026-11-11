"""Kody funkcji EAZ pola (`Bay.protection_codes`) wyłącznie ze słownika funkcji EAZ.

Słownik `network_model.catalog.funkcje_eaz` deklaruje: „każdy kod zapisany w modelu albo
w szablonie musi mieć tu wpis — kod spoza słownika jest błędem szablonu i operacji”. Znalezisko
karty UX-04/POLE-LINIOWE-WZORZEC (bieg e2e 2026-11-05): operacja `update_element_parameters`
zapisywała kody 46 i 49 polu liniowemu GPZ, a walidacja gotowości po operacji (ocena pola
liniowego GPZ → `opis_funkcji_eaz_pl`) kończyła się `KeyError` — błąd serwera 500, operacja
padała. Naprawa w JEDYNYM pisarzu rekordu pola (`enm.pola.waliduj_rekord_pola`, wołany przez
`zbuduj_pole` i `zmien_pole`): kod spoza słownika = `BladPola`, w operacji odmowa nazwana
`params.invalid_value` bez skutku w modelu.

Reguła stoi w pisarzu, NIE w kontrakcie `Bay` — świadomie i przypięte
(`test_kontrakt_modelu_nie_odrzuca_kodu`): magazyn zastępuje migawkę, która nie przechodzi
walidacji modelu, modelem domyślnym (`enm.store._load_persisted_enm`), więc reguła kontraktu
zamieniłaby zapisany projekt z kodem spoza słownika w cichą utratę danych.

Iloczyn cech: pisarz {operacja `update_element_parameters` (`zmien_pole`), budowa rekordu
`zbuduj_pole`, automigracja dawnych słowników pól (`enm.migrations.field_specs_promocja` —
klucze-nazwy sprzed karty jednej nomenklatury przepisane na numery słownika; przypięte
w `test_field_specs_promocja.py::test_substrat_52_stacji_migruje_sie_w_calosci`)} × zestaw
kodów {wyłącznie słownikowe, wyłącznie spoza słownika, mieszany} × pole {pole liniowe GPZ
z szablonem ENEA i powiązaniami obwodów wtórnych (ścieżka oceny, która padała), pole bez
szablonu}.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.migrations.field_specs_promocja import DAWNE_KLUCZE_FUNKCJI_EAZ
from enm.models import EnergyNetworkModel
from enm.pola import BladPola, zbuduj_pole
from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ

from tests.reference_networks.sceny_zajetosci_pol import _gpz

ZESTAWY: dict[str, list[str]] = {
    "slownikowe": ["50", "51", "51N", "79"],
    "spoza_slownika": ["46", "49"],
    "mieszany": ["51", "46"],
}


def _pole_liniowe_gpz(enm: dict[str, Any]) -> dict[str, Any]:
    gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
    return next(
        b
        for b in enm["bays"]
        if b.get("substation_ref") == gpz["ref_id"] and b.get("bay_role") in ("OUT", "FEEDER")
    )


@pytest.fixture(scope="module")
def siec_gpz() -> dict[str, Any]:
    return _gpz(z_zaciskami=True, sekcje=1)


def test_slownik_nie_zna_kodow_iniekcji() -> None:
    # Warunek iloczynu: zestaw „spoza słownika” rzeczywiście jest spoza słownika.
    assert not set(ZESTAWY["spoza_slownika"]) & set(FUNKCJE_EAZ)
    assert set(ZESTAWY["slownikowe"]) <= set(FUNKCJE_EAZ)


def test_dawne_klucze_migracji_parami_ze_slownikiem() -> None:
    # Predykaty parami: klucz dawny nie jest kodem słownika (inaczej przepisanie zmieniałoby
    # kod poprawny), a jego numer jest (inaczej migracja tworzyłaby rekord odrzucany przez
    # kontrakt `Bay`).
    assert not set(DAWNE_KLUCZE_FUNKCJI_EAZ) & set(FUNKCJE_EAZ)
    assert set(DAWNE_KLUCZE_FUNKCJI_EAZ.values()) <= set(FUNKCJE_EAZ)


@pytest.mark.parametrize("zestaw", sorted(ZESTAWY))
def test_operacja_na_polu_liniowym_gpz(siec_gpz: dict[str, Any], zestaw: str) -> None:
    enm = copy.deepcopy(siec_gpz)
    pole = _pole_liniowe_gpz(enm)
    # Pole wzorca ENEA z powiązaniami obwodów wtórnych — ścieżka oceny pola liniowego GPZ.
    assert pole.get("bay_template_ref")
    kody = ZESTAWY[zestaw]
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="update_element_parameters",
        payload={"element_ref": pole["ref_id"], "parameters": {"protection_codes": kody}},
    )
    if zestaw == "slownikowe":
        assert not wynik.get("error"), wynik.get("error")
        po = next(b for b in wynik["snapshot"]["bays"] if b["ref_id"] == pole["ref_id"])
        assert po["protection_codes"] == kody
        return
    assert wynik["error_code"] == "params.invalid_value"
    assert "46" in wynik["error"]
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
        "protection_codes": ZESTAWY[zestaw],
        "stan_obiektu": "PROJEKTOWANY",
    }
    if z_szablonem:
        argumenty["bay_template_ref"] = "bay_template_gpz_line_enea_z10_trojpolozeniowy"
    if zestaw == "slownikowe":
        rekord = zbuduj_pole(**argumenty)
        assert rekord["protection_codes"] == ZESTAWY[zestaw]
        return
    with pytest.raises(BladPola, match="spoza słownika: 46"):
        zbuduj_pole(**argumenty)


@pytest.mark.parametrize("zestaw", sorted(ZESTAWY))
def test_kontrakt_modelu_nie_odrzuca_kodu(siec_gpz: dict[str, Any], zestaw: str) -> None:
    # Przypięta decyzja: walidacja całego modelu (odczyt magazynu, import archiwum) przyjmuje
    # kod spoza słownika — odmowa w tym miejscu oznaczałaby zastąpienie zapisanego projektu
    # modelem domyślnym (`enm.store._load_persisted_enm`). Kod spoza słownika zatrzymuje
    # pisarz rekordu pola (testy wyżej).
    enm = copy.deepcopy(siec_gpz)
    _pole_liniowe_gpz(enm)["protection_codes"] = ZESTAWY[zestaw]
    model = EnergyNetworkModel.model_validate(enm)
    pole = next(b for b in model.bays if b.ref_id == _pole_liniowe_gpz(enm)["ref_id"])
    assert pole.protection_codes == ZESTAWY[zestaw]
