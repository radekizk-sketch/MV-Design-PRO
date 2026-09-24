"""Tozsamosc urzadzen w odcisku migawki i jawne wlasciwosci protokolu (karta AB-1b.1, P1).

DEFEKT, KTORY TO ZAMYKA (pomiar 2026-09-23, sonda 11 karty). `odcisk_migawki`
deklarowal „urzadzenia (z parametrami i wymiarem stanu)", a haszowal WYLACZNIE
`ident`, `wezel` i nazwy stanow. Dwie maszyny rozniace sie tylko stala bezwladnosci
H dawaly IDENTYCZNA piatke odciskow przy ROZNYCH przebiegach — kontrakt tozsamosci
„ta sama piatka => ten sam wynik" byl falszywy dla bezposredniego uzycia rdzenia.

ILOCZYN CECH, NIE PRZYKLAD (CLAUDE.md „KLASA, NIE INSTANCJA" p. 2): kazda rodzina
urzadzen biblioteki (w tym opakowanie urzadzenia odlaczonego) x kazde pole kazdej
zagniezdzonej dataklasy parametrow. Lista pol pochodzi z `dataclasses.fields` W
TESCIE (refleksja wolno tutaj, nie w produkcie), wiec nowe pole dopisane do klasy
bez dopisania go do `parametry_tozsamosci` albo do jawnej listy wylaczen wywraca
test zamiast zostac przemilczane.
"""

from __future__ import annotations

import copy
import dataclasses
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from network_model.solvers.dynamika.tozsamosc import odcisk_migawki
from network_model.solvers.dynamika.urzadzenia.odlaczone import UrzadzenieOdlaczone

from tests.network_model.dynamika import biblioteka_urzadzen as b
from tests.network_model.dynamika import uklady

#: Kazda rodzina urzadzen, ktora rdzen umie zbudowac, plus opakowanie odlaczenia.
URZADZENIA: dict[str, Callable[[], Any]] = {
    "maszyna_klasyczna": lambda: uklady._maszyna(2.0, 0.01),
    "szyna_sztywna": uklady._szyna,
    "synchroniczna_AVR_TGOV1_PSS": lambda: b.maszyna(
        z_wzbudzeniem=True, z_turbina=True, z_stabilizatorem=True
    ),
    "synchroniczna_bez_regulatorow": lambda: b.maszyna(),
    "przeksztaltnik_gfl": lambda: b.przeksztaltnik_gfl(),
    "przeksztaltnik_gfm_statyzm": lambda: b.przeksztaltnik_gfm(tryb="droop"),
    "przeksztaltnik_gfm_vsm": lambda: b.przeksztaltnik_gfm(tryb="vsm"),
    "magazyn_gfl": lambda: b.magazyn(),
    "magazyn_gfm": lambda: b.magazyn(rdzen=b.rdzen_gfm(tryb="vsm")),
    "wiatr_typ_3_z_crowbarem": lambda: b.turbina(typ="wiatr_typ_3", crowbar=b.crowbar_typowy()),
    "wiatr_typ_4": lambda: b.turbina(),
    "odlaczone_maszyna": lambda: UrzadzenieOdlaczone(uklady._maszyna(2.0, 0.01)),
}


def _odcisk(urzadzenie: Any) -> str:
    return odcisk_migawki(wezly=(), galezie=(), odsprzegi=(), odbiory=(), urzadzenia=(urzadzenie,))


def _wylaczone(obiekt: Any) -> dict[str, str]:
    return dict(type(obiekt).POLA_POZA_ODCISKIEM)


def _liscie(obiekt: Any, sciezka: tuple[str, ...] = ()) -> Iterator[tuple[str, ...]]:
    """Sciezki do KAZDEGO pola-liscia (nie-dataklasy) objetego odciskiem."""
    wylaczone = _wylaczone(obiekt)
    for pole in dataclasses.fields(obiekt):
        if pole.name in wylaczone:
            continue
        wartosc = getattr(obiekt, pole.name)
        if dataclasses.is_dataclass(wartosc) and not isinstance(wartosc, type):
            yield from _liscie(wartosc, (*sciezka, pole.name))
        elif wartosc is not None:
            # `None` to NIEOBECNY blok regulacji (AVR, turbina, crowbar) — jego
            # obecnosc rozroznia para rodzin z blokiem i bez niego w `URZADZENIA`.
            yield (*sciezka, pole.name)


def _zaburz(obiekt: Any, sciezka: tuple[str, ...]) -> Any:
    """Kopia obiektu z JEDNYM polem zmienionym (z pominieciem walidacji konstruktora).

    Test mierzy czulosc ODCISKU, nie poprawnosc parametrow — dlatego zmiana idzie
    przez `object.__setattr__` na kopii, a nie przez konstruktor, ktory odrzucilby
    np. nieznany wariant regulatora.
    """
    kopia = copy.copy(obiekt)
    glowa, *reszta = sciezka
    wartosc = getattr(obiekt, glowa)
    if reszta:
        nowa = _zaburz(wartosc, tuple(reszta))
    elif isinstance(wartosc, bool):
        nowa = not wartosc
    elif isinstance(wartosc, int | float):
        nowa = float(wartosc) * 1.5 + 0.125
    elif isinstance(wartosc, str):
        nowa = wartosc + "_inny"
    else:  # pragma: no cover — typ pola spoza obslugi testu to blad testu
        raise AssertionError(f"Nieobslugiwany typ pola {sciezka}: {type(wartosc)!r}")
    object.__setattr__(kopia, glowa, nowa)
    return kopia


def _dataklasy(obiekt: Any) -> Iterator[Any]:
    yield obiekt
    wylaczone = _wylaczone(obiekt)
    for pole in dataclasses.fields(obiekt):
        if pole.name in wylaczone:
            continue
        wartosc = getattr(obiekt, pole.name)
        if dataclasses.is_dataclass(wartosc) and not isinstance(wartosc, type):
            yield from _dataklasy(wartosc)


@pytest.mark.parametrize("nazwa", sorted(URZADZENIA))
def test_parametry_tozsamosci_pokrywaja_kazde_pole_dataklasy(nazwa: str) -> None:
    """Kazde pole: w odcisku ALBO na jawnej liscie wylaczen z uzasadnieniem — nic pomiedzy."""
    for obiekt in _dataklasy(URZADZENIA[nazwa]()):
        pola = {pole.name for pole in dataclasses.fields(obiekt)}
        wylaczone = _wylaczone(obiekt)
        assert all(
            uzasadnienie.strip() for uzasadnienie in wylaczone.values()
        ), f"{type(obiekt).__name__}: wylaczenie bez uzasadnienia"
        assert set(wylaczone) <= pola, f"{type(obiekt).__name__}: wylaczenie pola, ktorego nie ma"
        parametry = obiekt.parametry_tozsamosci()
        assert set(parametry) == pola - set(wylaczone), (
            f"{type(obiekt).__name__}: odcisk obejmuje {sorted(parametry)}, pola bez "
            f"wylaczen {sorted(pola - set(wylaczone))}"
        )


@pytest.mark.parametrize("nazwa", sorted(URZADZENIA))
def test_odcisk_migawki_reaguje_na_kazdy_parametr_urzadzenia(nazwa: str) -> None:
    """Zmiana DOWOLNEGO parametru dowolnej rodziny zmienia odcisk migawki."""
    urzadzenie = URZADZENIA[nazwa]()
    bazowy = _odcisk(urzadzenie)
    sciezki = list(_liscie(urzadzenie))
    assert sciezki, "urzadzenie bez parametrow nie sprawdziloby niczego"
    nieczule = [
        ".".join(sciezka) for sciezka in sciezki if _odcisk(_zaburz(urzadzenie, sciezka)) == bazowy
    ]
    assert not nieczule, f"{nazwa}: odcisk migawki nie reaguje na {nieczule}"


def test_dwie_maszyny_rozne_tylko_H_maja_rozne_odciski_migawki() -> None:
    """Sonda 11 karty: przed naprawa oba odciski byly IDENTYCZNE."""
    pierwsza = uklady._maszyna(0.0)
    druga = dataclasses.replace(pierwsza, h_s=pierwsza.h_s * 2.0)
    assert _odcisk(pierwsza) != _odcisk(druga)


def test_urzadzenie_odlaczone_ma_inny_odcisk_niz_przylaczone() -> None:
    maszyna = uklady._maszyna(0.0)
    assert _odcisk(maszyna) != _odcisk(UrzadzenieOdlaczone(maszyna))


@pytest.mark.parametrize("nazwa", sorted(URZADZENIA))
def test_sprzezenie_jest_zadeklarowane_jawnie_w_klasie(nazwa: str) -> None:
    """Protokol nie ma domyslki sprzezenia — kazda klasa deklaruje je SAMA.

    Domyslka w protokole („pradowe") przepuscilaby przyszle zrodlo napieciowe jako
    pradowe bez jednego sladu: jego wiersz KCL nie zostalby zastapiony warunkiem
    napiecia i siec liczylaby inny uklad niz zbudowany.
    """
    urzadzenie = URZADZENIA[nazwa]()
    assert "sprzezenie" in vars(type(urzadzenie)), type(urzadzenie).__name__
    assert urzadzenie.sprzezenie in ("pradowe", "napieciowe")
    assert "parametry_tozsamosci" in vars(type(urzadzenie)), type(urzadzenie).__name__
    assert "POLA_POZA_ODCISKIEM" in vars(type(urzadzenie)), type(urzadzenie).__name__
