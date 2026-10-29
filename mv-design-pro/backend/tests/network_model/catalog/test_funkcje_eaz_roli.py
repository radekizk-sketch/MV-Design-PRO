"""Funkcje EAZ roli pola — dokładnie jedno źródło dla każdej roli modelu.

Scalenie kart UX-04/POLE-LINIOWE-WZORZEC (funkcje EAZ jako część szablonu kanonicznego roli)
i UX-04/POLE-BKR-MODEL (rola `BKR` bez szablonu kanonicznego, zestaw z IRiESD II.4.5.4.4.1).
Predykaty parami: tablica szablonów kanonicznych ról i tablica ról bez szablonu są ROZŁĄCZNE,
a ich suma to KAŻDA rola modelu — rola nie dostaje zestawu z dwóch miejsc i żadna nie zostaje
bez źródła. Endpoint odczytu (`GET /api/catalog/bay-protection-codes`) zwraca ten sam zestaw
dla każdej roli modelu, co operacja domenowa budująca pole bez szablonu.
"""

from __future__ import annotations

from api.catalog import list_bay_protection_codes
from enm.rola_pola_sn import ROLE_POLA_MODELU
from network_model.catalog.bay_templates import (
    FUNKCJE_EAZ_ROLI_BEZ_SZABLONU,
    SZABLON_KANONICZNY_ROLI,
    funkcje_eaz_roli,
)
from network_model.catalog.funkcje_eaz import kody_spoza_slownika


def test_tablice_rol_rozlaczne_i_pokrywaja_kazda_role_modelu() -> None:
    z_szablonu = set(SZABLON_KANONICZNY_ROLI)
    bez_szablonu = set(FUNKCJE_EAZ_ROLI_BEZ_SZABLONU)
    assert z_szablonu.isdisjoint(bez_szablonu)
    assert z_szablonu | bez_szablonu == set(ROLE_POLA_MODELU)


def test_zestaw_roli_z_jednego_miejsca_dla_kazdej_roli() -> None:
    for rola in ROLE_POLA_MODELU:
        szablon = SZABLON_KANONICZNY_ROLI.get(rola)
        oczekiwany = (
            list(szablon.funkcje_eaz)
            if szablon is not None
            else list(FUNKCJE_EAZ_ROLI_BEZ_SZABLONU[rola])
        )
        assert funkcje_eaz_roli(rola) == oczekiwany, rola
        assert kody_spoza_slownika(funkcje_eaz_roli(rola)) == [], rola


def test_pole_baterii_kondensatorow_ma_zestaw_wg_iriesd() -> None:
    # IRiESD II.4.5.4.4.1 + Zeszyt 1 Zał. 16: I>, I>>, Io>, Ir> (niezrównoważenie), U>, LRW.
    assert funkcje_eaz_roli("BKR") == ["51", "50", "51N", "60N", "59", "50BF"]


def test_rola_spoza_modelu_bez_funkcji() -> None:
    assert funkcje_eaz_roli("XYZ") == []


def test_endpoint_odczytu_zwraca_kazda_role_modelu_z_tego_samego_zrodla() -> None:
    odczyt = list_bay_protection_codes()
    assert list(odczyt) == list(ROLE_POLA_MODELU)
    for rola, kody in odczyt.items():
        assert kody == funkcje_eaz_roli(rola), rola
