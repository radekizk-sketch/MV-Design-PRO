"""Spójność punktu startowego z rozpływem oraz stany zasobowe (pakiet D audytu).

PO CO TEN PLIK. Inicjalizacja sprawdzała JEDEN warunek — ``||f(x0)|| <= tol`` —
i traktowała go jak dowód, że punkt startowy odpowiada rozpływowi. Nie jest.

  D1. Falownik z ogranicznikiem prądu, dla którego ``|S/V| > i_max``, ustawiał
      swoje stany na wartość ZADANĄ, więc ``ẋ = 0``, a wstrzyknięcie do sieci
      było PRZYCIĘTE. Punkt startowy przechodził kontrolę, choć urządzenie nie
      oddawało mocy, którą rozpływ przyjął — dalszy przebieg opisywał inny punkt
      pracy niż deklarowany, bez jednego ostrzeżenia.
  D3. ``norma_pochodnej`` brała ``max|f(x)|`` po WSZYSTKICH stanach, w tym po
      SOC magazynu. Magazyn oddający moc ma ``d(soc)/dt != 0`` z definicji
      bilansu energii, więc NIE MÓGŁ być punktem startowym — czyli model był
      bezużyteczny dokładnie w swoim normalnym punkcie pracy. Podniesienie
      tolerancji „żeby przeszło" uciszyłoby też realny brak równowagi toru
      elektrycznego; rozwiązaniem jest rozróżnienie stanów, nie rozluźnienie.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.benchmarki import siec_sn_z_der
from dynamic_lab.konwencje import stany_zasobowe
from dynamic_lab.silnik import (
    ModelDynamiczny,
    PunktPracyNiespojnyZRozplywemError,
    SilnikRMS,
)
from dynamic_lab.urzadzenia import FalownikGFL
from dynamic_lab.urzadzenia_oze import MagazynEnergiiBESS

S_BAZOWA_MVA = 100.0


def _model_z(urzadzenie, moc: complex):
    baza, moce = siec_sn_z_der()
    inne = [u for u in baza.urzadzenia if u.ref != "DER1"]
    moce_inne = {k: v for k, v in moce.items() if k != "DER1"}
    model = ModelDynamiczny(topologia=baza.topologia, urzadzenia=[*inne, urzadzenie])
    return model, {**moce_inne, urzadzenie.ref: moc}


# ---------------------------------------------------------------------------
# D1/D2 — zgodność wstrzyknięcia z punktem rozpływu
# ---------------------------------------------------------------------------


def test_ogranicznik_pradu_przycinajacy_moc_odrzuca_punkt_startowy() -> None:
    """``ẋ = 0`` NIE wystarcza: liczy się to, co urządzenie oddaje do sieci.

    ``i_max = 0,30`` p.u. przy dyspozycji 0,60 p.u. wymusza przycięcie. Przed
    naprawą punkt przechodził, bo stany falownika stały na wartości zadanej.
    """
    model, moce = _model_z(FalownikGFL(ref="DER1", szyna="DER1", i_max_pu=0.30), complex(0.60, 0.0))
    silnik = SilnikRMS(model)
    with pytest.raises(PunktPracyNiespojnyZRozplywemError, match="S_rzeczywiste"):
        silnik.inicjalizuj(moce)


def test_ogranicznik_nieaktywny_daje_punkt_spojny() -> None:
    """Strona pozytywna — inaczej test wyżej przechodziłby też przy odrzucaniu WSZYSTKIEGO."""
    model, moce = _model_z(FalownikGFL(ref="DER1", szyna="DER1", i_max_pu=1.5), complex(0.60, 0.0))
    silnik = SilnikRMS(model)
    x0 = silnik.inicjalizuj(moce)
    v0 = silnik.rozwiaz_siec(x0)
    assert silnik.residua_mocy(x0, v0, moce)["DER1"] < 1.0e-9


def test_residuum_mocy_jest_liczone_dla_kazdego_urzadzenia_z_dyspozycja() -> None:
    """Wspólny inwariant, nie wyjątek per typ urządzenia."""
    model, moce = _model_z(FalownikGFL(ref="DER1", szyna="DER1", i_max_pu=1.5), complex(0.60, 0.0))
    silnik = SilnikRMS(model)
    x0 = silnik.inicjalizuj(moce)
    residua = silnik.residua_mocy(x0, silnik.rozwiaz_siec(x0), moce)
    assert set(residua) == {ref for ref in moce if ref in {u.ref for u in model.urzadzenia}}
    assert all(np.isfinite(v) for v in residua.values())


# ---------------------------------------------------------------------------
# D3 — stany zasobowe
# ---------------------------------------------------------------------------


def test_magazyn_deklaruje_soc_jako_stan_zasobowy() -> None:
    magazyn = MagazynEnergiiBESS(
        ref="BAT", szyna="DER1", e_pojemnosc_mwh=1.0, s_bazowa_mva=S_BAZOWA_MVA
    )
    assert stany_zasobowe(magazyn) == frozenset({"soc"})


def test_model_bez_deklaracji_ma_wszystkie_stany_szybkie() -> None:
    """Domyślna odpowiedź jest OSTRZEJSZA: brak deklaracji = pełny rygor równowagi."""
    assert stany_zasobowe(FalownikGFL(ref="D", szyna="DER1")) == frozenset()


def test_dryf_soc_nie_psuje_rownowagi_ale_jest_raportowany() -> None:
    """Rozróżnienie, nie rozluźnienie: tor szybki w równowadze, zasobowy dryfuje.

    Zmierzone (P = 0,30 p.u., 100 MVA, 1 MWh):
        ||f_szybkich||   = 0,000e+00
        ||f_zasobowych|| = 8,333e-03 1/s = −P·S/(3600·E)
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT", szyna="DER1", e_pojemnosc_mwh=1.0, s_bazowa_mva=S_BAZOWA_MVA
    )
    model, moce = _model_z(magazyn, complex(0.30, 0.0))
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.01)
    x0 = silnik.inicjalizuj(moce)

    assert silnik.norma_pochodnej(x0) < 1.0e-6
    dryf = silnik.norma_pochodnej_zasobowej(x0)
    oczekiwany = 0.30 * S_BAZOWA_MVA / (3600.0 * 1.0)
    assert dryf == pytest.approx(oczekiwany, rel=1.0e-6)


def test_brak_rownowagi_toru_szybkiego_nadal_odrzuca_punkt() -> None:
    """Wyłączenie SOC z warunku NIE może uciszyć realnego braku równowagi.

    Gdyby naprawa D3 była zrobiona przez podniesienie tolerancji, ten test
    przechodziłby mimo rozsynchronizowanego toru — dlatego tu jest.
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT", szyna="DER1", e_pojemnosc_mwh=1.0, s_bazowa_mva=S_BAZOWA_MVA
    )
    model, moce = _model_z(magazyn, complex(0.30, 0.0))
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.01)
    x0 = silnik.inicjalizuj(moce)

    zepsuty = x0.copy()
    wycinek = silnik.uklad.wycinki["BAT"]
    zepsuty[wycinek.start] += 0.25  # p_wyjscia_pu poza punktem pracy — stan SZYBKI
    assert silnik.norma_pochodnej(zepsuty) > 1.0e-6
