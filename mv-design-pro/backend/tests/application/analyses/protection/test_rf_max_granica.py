"""R_F,max — granica wykrywania doziemienia wysokooporowego sprawdzona biegami solvera
(wymaganie właściciela 2 przy przekazaniu karty EKRANY-EAZ-ZIEMNOZWARCIOWE).

Zapas równy 1 na granicy wynika z definicji R_F,max, więc nie jest walidacją. Walidacją są
NIEZALEŻNE biegi solvera doziemień SN z rezystancją przejścia po obu stronach granicy:

ILOCZYN CECH:
* funkcja {51N, 67N} × sposób pracy punktu neutralnego {izolowany, skompensowany, uziemiony
  przez rezystor} × rezystancja przejścia {0,9·R_F,max — działa w każdym punkcie strefy,
  1,1·R_F,max — w co najmniej jednym punkcie strefy nie działa}; działanie z JEDNEJ listy
  warunków (``rusza``), bieg solvera z ``r_f_ohm`` (nie przeliczenie mnożnikiem);
* monotoniczność: najmniejszy zapas względny warunków progowych strefy (U0, próg, kryterium
  trybu) nie rośnie z R_F na siatce 0…1,5·R_F,max (biegi solvera);
* przypadek ręczny: punkt syntetyczny o znanej impedancji pętli, R_F,max przeliczone wzorem
  w komentarzu, porównane z ewaluatorem z jawną tolerancją.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import replace
from functools import cache

import pytest
from application.analyses.protection.ocena_nadpradowa import StopienNastaw
from application.analyses.protection.ocena_ziemnozwarciowa import (
    FunkcjaZiemnozwarciowa,
    WynikOcenyZiemnozwarciowej,
    _rf_max_pola,
    ocen_zabezpieczenia_ziemnozwarciowe,
    przygotuj_funkcje,
    rusza,
    warunki_dzialania,
)
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.solvers.doziemienie_sn import (
    STAN_PRZED,
    WielkosciPola,
    WynikPunktuDoziemienia,
    oblicz_doziemienie,
)

from tests.reference_networks.scena_doziemienia import scena_z_nastawami

SPOSOBY = ("IZOLOWANY", "KOMPENSOWANY", "REZYSTOR")
KODY = ("51N", "67N")


@cache
def _ocena(sposob: str) -> WynikOcenyZiemnozwarciowej:
    enm = EnergyNetworkModel.model_validate(scena_z_nastawami(sposob))  # type: ignore[arg-type]
    return ocen_zabezpieczenia_ziemnozwarciowe(
        enm, map_enm_to_network_graph(enm), odniesienie="test"
    )


def _wiersze(sposob: str, kod: str) -> list[tuple[FunkcjaZiemnozwarciowa, float]]:
    """Funkcje ``kod`` z R_F,max (po wartościach roboczych nastaw ewaluatora)."""
    wynik = _ocena(sposob)
    assert wynik.obliczenie is not None
    gotowe = {
        f.klucz: f
        for f in przygotuj_funkcje(
            [f for f in wynik.funkcje if not f.braki and f.wezel_pomiaru], wynik.obliczenie
        )
    }
    pary = []
    for w in wynik.wiersze:
        if w["kod"] != kod:
            continue
        r_f_max = w["wartosci"]["r_f_max"]["wartosc"]
        assert r_f_max is not None and 0 < r_f_max < 1e5, (sposob, kod, r_f_max)
        pary.append((gotowe[f"{w['urzadzenie_ref']}/{w['funkcja_ref']}"], r_f_max))
    assert pary, (sposob, kod)
    return pary


def _strefa_przy(sposob: str, f: FunkcjaZiemnozwarciowa, r_f: float) -> list[WielkosciPola]:
    """Wielkości pola przy zwarciu w każdym punkcie strefy — NIEZALEŻNY bieg solvera z R_F."""
    obliczenie = _ocena(sposob).obliczenie
    assert obliczenie is not None
    rozw = oblicz_doziemienie(replace(obliczenie.wejscie_max, c=obliczenie.c_min, r_f_ohm=r_f))
    return [
        p.pole(f.klucz)
        for p in rozw.punkty
        if p.stan == STAN_PRZED and p.pole(f.klucz).zwarcie_w_strefie
    ]


@pytest.mark.parametrize("kod", KODY)
@pytest.mark.parametrize("sposob", SPOSOBY)
def test_dziala_ponizej_i_nie_dziala_powyzej_granicy(sposob: str, kod: str) -> None:
    for f, r_f_max in _wiersze(sposob, kod):
        ponizej = _strefa_przy(sposob, f, 0.9 * r_f_max)
        powyzej = _strefa_przy(sposob, f, 1.1 * r_f_max)
        assert ponizej and all(rusza(f, pole) for pole in ponizej), (sposob, kod, r_f_max)
        assert not all(rusza(f, pole) for pole in powyzej), (sposob, kod, r_f_max)


def _zapas_progowy(f: FunkcjaZiemnozwarciowa, strefa: list[WielkosciPola]) -> float:
    return min(
        w.zapas_wzgledny
        for pole in strefa
        for w in warunki_dzialania(f, pole)
        if w.klucz in ("U0", "PROG", "TRYB")
    )


@pytest.mark.parametrize("kod", KODY)
@pytest.mark.parametrize("sposob", SPOSOBY)
def test_zapas_maleje_monotonicznie_z_rf(sposob: str, kod: str) -> None:
    for f, r_f_max in _wiersze(sposob, kod):
        siatka = [k * r_f_max for k in (0.0, 0.25, 0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5)]
        zapasy = [_zapas_progowy(f, _strefa_przy(sposob, f, r)) for r in siatka]
        for a, b in zip(zapasy, zapasy[1:], strict=False):
            assert b <= a + 1e-12, (sposob, kod, zapasy)
        # Granica: zapas przechodzi przez zero dokładnie przy R_F,max (bieg solvera).
        assert zapasy[siatka.index(r_f_max)] == pytest.approx(0.0, abs=1e-9)


# --- przypadek ręczny -------------------------------------------------------------------------


def _stopien(prog: float) -> StopienNastaw:
    return StopienNastaw(
        funkcja="51N",
        krzywa="DT",
        wartosc_progu=prog,
        jednostka_progu="A_PIERWOTNY",
        prog_wtorny_a=prog,
        prog_pierwotny_a=prog,
        tms=None,
        zwloka_s=0.5,
        slad={},
    )


def _funkcja(kod: str, prog: float, **nastawy: object) -> FunkcjaZiemnozwarciowa:
    return FunkcjaZiemnozwarciowa(
        urzadzenie_ref="r",
        nazwa_urzadzenia_pl="r",
        funkcja_ref="f",
        kod=kod,
        nastawy={"prog": prog, "jednostka_progu": "A_PIERWOTNY", "krzywa": "DT", **nastawy},
        breaker_ref="b",
        strefa=None,
        wezel_pomiaru="w",
        stopien=_stopien(prog),
        przekladnia_3i0=None,
        braki=(),
    )


def _punkt(modul: float, kat_deg: float, u0_proc: float) -> WynikPunktuDoziemienia:
    pole = WielkosciPola(
        strefa_ref="r/f",
        zwarcie_w_strefie=True,
        prad_3i0_a=cmath.rect(modul, math.radians(kat_deg)),
        u0_v=complex(-5000.0, 0.0),
        u0_proc=u0_proc,
        admitancja_y0_s=None,
        moc_p0_w=0.0,
        kat_phi0_deg=kat_deg,
    )
    return WynikPunktuDoziemienia(
        punkt_ref="k",
        nazwa_pl="k",
        stan=STAN_PRZED,
        skladowa=0,
        prad_doziemny_a=0j,
        u0_punktu_v=0j,
        u0_punktu_proc=u0_proc,
        pola=(pole,),
        prady_punktow_neutralnych_a=(),
        z_petli_pu=complex(0.3, 4.0),
        z_base_ohm=2.25,
        r_f_ohm=0.0,
    )


def test_rf_max_recznie_51n_i_67n() -> None:
    """Punkt: Z_p = Z1,kk + Z2,kk + Z0,kk = 0,3 + j4 p.u., Z_b = 2,25 Ω, wynik przy R_F = 0.
    Wzory solvera: m(R_F) = |Z_p| / |Z_p + 3R_F/Z_b|; dla m: ρ = |Z_p|/m,
    3R_F/Z_b = −Re Z_p + √(ρ² − (Im Z_p)²). |Z_p| = √(0,09 + 16) = 4,011234.

    51N, I0> = 4 A, |3I0| = 10 A: m = 4/10 = 0,4; ρ = 4,011234/0,4 = 10,028086;
    ρ² − 16 = 84,562388, √ = 9,195781; 3R_F/Z_b = 8,895781 → R_F,max = 8,895781·2,25/3
    = 6,67184 Ω.

    67N (sin φ, φ_ch = 90°, do linii, ±80°), I0> = 2 A, U0> = 15 %, |3I0| = 10 A pod kątem 110°
    (20° od osi), U0 = 60 %: rzut 10·cos 20° = 9,396926 A → m_rzut = 2/9,396926 = 0,212836;
    m_U0 = 15/60 = 0,25 (rozstrzyga U0); ρ = 4,011234/0,25 = 16,044937; ρ² − 16 = 241,439999,
    √ = 15,538340; 3R_F/Z_b = 15,238340 → R_F,max = 15,238340·2,25/3 = 11,42876 Ω.
    Tolerancja względna 1e-5 (sześć cyfr znaczących ręcznego rachunku)."""
    f51 = _funkcja("51N", 4.0, zwloka_s=0.5)
    assert _rf_max_pola(f51, _punkt(10.0, 0.0, 60.0)) == pytest.approx(6.67184, rel=1e-5)
    f67 = _funkcja(
        "67N",
        2.0,
        zwloka_s=0.5,
        kierunek="DO_LINII",
        kat_charakterystyczny_deg=90.0,
        tryb_kryterium="RZUT",
        polowa_sektora_deg=80.0,
        prog_u0_proc=15.0,
    )
    assert _rf_max_pola(f67, _punkt(10.0, 110.0, 60.0)) == pytest.approx(11.42876, rel=1e-5)
    # Poza sektorem (120° od osi) — warunek kątowy nie zależy od R_F: brak R_F,max.
    assert _rf_max_pola(f67, _punkt(10.0, 210.0, 60.0)) is None
