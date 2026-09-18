"""Straznik skonczonosci: NaN/Inf lapane z ADRESEM, w chwili powstania."""

from __future__ import annotations

import numpy as np
import pytest
from network_model.solvers.dynamika import OdmowaDynamiki
from network_model.solvers.dynamika.kontrakty import KOD_WARTOSC_NIESKONCZONA
from network_model.solvers.dynamika.skonczonosc import sprawdz_napiecia, sprawdz_wektor


@pytest.mark.parametrize("wartosc", [float("nan"), float("inf"), float("-inf")])
def test_niekonczona_skladowa_wektora_stanu_ma_adres(wartosc: float) -> None:
    """Komunikat niesie NAZWE stanu, indeks i chwile — nie „wynik zawiera nan"."""
    wektor = np.array([0.1, wartosc, 0.3])
    with pytest.raises(OdmowaDynamiki) as blad:
        sprawdz_wektor(wektor, ("G1.delta_rad", "G1.omega_pu", "G1.p_mechaniczna_pu"), "krok", 0.75)
    assert blad.value.kod == KOD_WARTOSC_NIESKONCZONA
    assert "G1.omega_pu[1]" in str(blad.value)
    assert blad.value.szczegoly["adresy"] == ("G1.omega_pu",)
    assert blad.value.szczegoly["indeksy"] == (1,)
    assert blad.value.szczegoly["t_s"] == 0.75


def test_wiele_niekonczonych_skladowych_jest_wymienionych_razem() -> None:
    wektor = np.array([float("nan"), 0.2, float("inf")])
    with pytest.raises(OdmowaDynamiki) as blad:
        sprawdz_wektor(wektor, ("a_pu", "b_pu", "c_pu"), "pochodne", 1.0)
    assert blad.value.szczegoly["indeksy"] == (0, 2)


def test_wektor_skonczony_przechodzi_bez_wyjatku() -> None:
    sprawdz_wektor(np.array([0.0, -1e12, 1e-12]), ("a_pu", "b_pu", "c_pu"), "krok", 0.0)


def test_niezgodnosc_dlugosci_adresow_jest_bledem_programisty() -> None:
    """Adres bez pokrycia bylby zmysleniem — to `AssertionError`, nie odmowa dziedzinowa."""
    with pytest.raises(AssertionError, match="adresow"):
        sprawdz_wektor(np.array([0.0, 1.0]), ("a_pu",), "krok", 0.0)


@pytest.mark.parametrize(
    "napiecie",
    [complex(float("nan"), 0.0), complex(0.0, float("inf")), complex(float("inf"), float("nan"))],
)
def test_niekonczone_napiecie_ma_ident_wezla(napiecie: complex) -> None:
    napiecia = np.array([complex(1.0, 0.0), napiecie], dtype=complex)
    with pytest.raises(OdmowaDynamiki) as blad:
        sprawdz_napiecia(napiecia, ("GEN", "SYS"), 0.25)
    assert blad.value.kod == KOD_WARTOSC_NIESKONCZONA
    assert blad.value.szczegoly["adresy"] == ("SYS",)
    assert blad.value.szczegoly["kontekst"] == "napiecia_wezlow"


def test_niezgodnosc_dlugosci_napiec_jest_bledem_programisty() -> None:
    with pytest.raises(AssertionError, match="wezlow"):
        sprawdz_napiecia(np.array([complex(1.0, 0.0)], dtype=complex), ("GEN", "SYS"), 0.0)
