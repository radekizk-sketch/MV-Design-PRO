"""Funkcje EAZ roli pola — dokładnie jedno źródło dla każdej roli modelu.

Scalenie kart UX-04/POLE-LINIOWE-WZORZEC (funkcje EAZ jako część szablonu kanonicznego roli)
i UX-04/POLE-BKR-MODEL (rola `BKR` bez szablonu kanonicznego, zestaw z IRiESD II.4.5.4.4.1).
Predykaty parami: tablica szablonów kanonicznych ról i tablica ról bez szablonu są ROZŁĄCZNE,
a ich suma to KAŻDA rola modelu — rola nie dostaje zestawu z dwóch miejsc i żadna nie zostaje
bez źródła. Endpoint odczytu (`GET /api/catalog/bay-protection-codes`) zwraca ten sam zestaw
dla każdej roli modelu, co operacja domenowa budująca pole bez szablonu.

Decyzja właściciela 2026-10-29 pkt 4 (karta UX-04/POLE-LINIOWE-WZORZEC): funkcja warunkowa
(`WARUNKI_FUNKCJI_EAZ` — 67N, warunek potwierdzonego źródła 3U₀) NIE wchodzi do zestawu roli bez
spełnionego warunku. Rola nie wie, czy pole ma przekładnik Ferrantiego i powiązane źródło 3U₀,
więc odczyt roli (endpoint, operacje budujące pole bez szablonu) nie niesie 67N; funkcję
przypisuje operacja wyposażenia pola po potwierdzeniu warunku w modelu.
"""

from __future__ import annotations

from api.catalog import list_bay_protection_codes
from enm.rola_pola_sn import ROLE_POLA_MODELU
from network_model.catalog.bay_templates import (
    FUNKCJE_EAZ_ROLI_BEZ_SZABLONU,
    SZABLON_KANONICZNY_ROLI,
    WARUNKI_FUNKCJI_EAZ,
    bez_niespelnionych_warunkow,
    funkcje_eaz_roli,
)
from network_model.catalog.funkcje_eaz import kody_spoza_slownika


def test_tablice_rol_rozlaczne_i_pokrywaja_kazda_role_modelu() -> None:
    z_szablonu = set(SZABLON_KANONICZNY_ROLI)
    bez_szablonu = set(FUNKCJE_EAZ_ROLI_BEZ_SZABLONU)
    assert z_szablonu.isdisjoint(bez_szablonu)
    assert z_szablonu | bez_szablonu == set(ROLE_POLA_MODELU)


def test_zestaw_roli_z_jednego_miejsca_dla_kazdej_roli() -> None:
    wszystkie_warunki = frozenset(WARUNKI_FUNKCJI_EAZ.values())
    for rola in ROLE_POLA_MODELU:
        szablon = SZABLON_KANONICZNY_ROLI.get(rola)
        pelny = (
            list(szablon.funkcje_eaz)
            if szablon is not None
            else list(FUNKCJE_EAZ_ROLI_BEZ_SZABLONU[rola])
        )
        # Warunki spełnione — zestaw źródła bez zmian (funkcja warunkowa NIE znika z szablonu).
        assert funkcje_eaz_roli(rola, wszystkie_warunki) == pelny, rola
        # Warunki niespełnione — ten sam zestaw bez funkcji warunkowych (jeden filtr).
        assert funkcje_eaz_roli(rola) == bez_niespelnionych_warunkow(pelny, frozenset()), rola
        assert kody_spoza_slownika(funkcje_eaz_roli(rola)) == [], rola


def test_67n_nie_trafia_do_zestawu_roli_bez_potwierdzonego_zrodla_u0() -> None:
    """Iniekcja „automatyczne 67N" (zdjęcie warunku z `WARUNKI_FUNKCJI_EAZ` albo pominięcie
    filtra w `funkcje_eaz_roli`) zapala ten test: role OUT, FEEDER i OZE niosą 67N
    w szablonie kanonicznym, a odczyt roli bez warunku nie może jej podać."""
    z_67n_w_szablonie = [
        rola for rola, szablon in SZABLON_KANONICZNY_ROLI.items() if "67N" in szablon.funkcje_eaz
    ]
    assert {"OUT", "FEEDER", "OZE"} <= set(z_67n_w_szablonie)
    for rola in ROLE_POLA_MODELU:
        assert "67N" not in funkcje_eaz_roli(rola), rola
    for rola in z_67n_w_szablonie:
        assert "67N" in funkcje_eaz_roli(rola, frozenset({WARUNKI_FUNKCJI_EAZ["67N"]})), rola


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
        assert "67N" not in kody, rola
