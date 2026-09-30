"""Niezmienniki chwili zero dla KAZDEJ rodziny urzadzen i odbioru ze stanem (O-58 pkt 1).

PO CO (karta AB-1b.3b-NA-CZUBKU, regula KLASA, NIE INSTANCJA). Spojna inicjalizacja algebry
`t = 0` z reinicjalizacja elementow w punkcie skorygowanym (decyzja O-58 pkt 1) byla
dowodzona na SMIB z maszyna klasyczna i szyna sztywna (`test_przenosnosc_estymaty_
niepewnosci.py`) oraz na scenie harnessu z przeksztaltnikiem GFL. Niezmiennik jest jednak
wlasnoscia KLASY elementow stanowych: kazda rodzina ma wlasny konstruktor `stan_poczatkowy(V, S)`,
a odbior ze stanem — `stan_poczatkowy_odbioru(V)`. Ten test sprawdza niezmiennik na calym
iloczynie.

ILOCZYN CECH: {rodzina: maszyna klasyczna, maszyna synchroniczna w siedmiu konfiguracjach
regulacji, GFL x4, GFM x4, magazyn x5, turbina x3} x {odbior: brak, czuly czestotliwosciowo na
szynie urzadzenia}; punkt pracy ZABURZONY (korekta musi sie wykonac). Niezmienniki: probka
`t = 0` spelnia tolerancje algebry biegu, stan `t = 0` jest rownowaga (`max |f|` poza
stanami jawnie dryfujacymi nie wieksze niz dziesieciokrotnosc normy bramki w punkcie
rozplywu), slad bramki na stanie `t = 0` zgodny ze stanem probki, odbior ze stanem ma
`x = arg V0`, czestotliwosc widziana `f_n`, a prad odbioru — prad rozmaitosci rownowagi.
"""

from __future__ import annotations

import dataclasses

import numpy as np
import pytest
from network_model.solvers.dynamika import HarmonogramDynamiki, OdbiorDynamiki, Urzadzenie
from network_model.solvers.dynamika.siec import residuum_algebry
from network_model.solvers.dynamika.tozsamosc import CYFRY_KWANTYZACJI
from network_model.solvers.dynamika.urzadzenia import zbuduj_maszyne_klasyczna

from tests.network_model.dynamika.biblioteka_urzadzen import (
    F_BAZOWA_HZ,
    S_BAZOWA_MVA,
    nastawy,
    zloz_uklad,
)
from tests.network_model.dynamika.test_biblioteka_urzadzen import wszystkie_konfiguracje
from tests.network_model.dynamika.uklady import charakterystyka_czula

from .test_przenosnosc_estymaty_niepewnosci import (
    _bieg_z_probka_zero,
    _norma_rownowagi,
    _sprawdz_odbiory_ze_stanem,
)

#: Zaburzenie wzgledne napiecia szyny urzadzenia — residuum ~1e-6 pu miesci sie w `eps_init`
#: 1e-4 tych biegow, a jest o rzedy ponad granica zaokraglen (korekta MUSI sie wykonac).
ZABURZENIE_WZGLEDNE = 1.0e-7
#: Moc odbioru czulego na szynie urzadzenia — mala, zeby moc urzadzenia (linia + odbior)
#: miescila sie w oknie mocy kazdej konfiguracji (GFL: tylko oddawanie do 0,3 pu).
MOC_ODBIORU_PU = complex(0.02, 0.005)


def _klasyczna() -> tuple[str, Urzadzenie, float]:
    return (
        "maszyna_klasyczna",
        zbuduj_maszyne_klasyczna(
            ident="G1",
            wezel="GEN",
            s_n_mva=S_BAZOWA_MVA,
            h_s=3.5,
            d_pu=1.0,
            x_prim_pu=0.3,
            ra_pu=0.0,
            s_bazowa_mva=S_BAZOWA_MVA,
            f_bazowa_hz=F_BAZOWA_HZ,
        ),
        0.8,
    )


KONFIGURACJE = [_klasyczna(), *wszystkie_konfiguracje()]


def _wejscie(urzadzenie: Urzadzenie, p_pu: float, z_odbiorem: bool):  # type: ignore[no-untyped-def]
    uklad = zloz_uklad(urzadzenie, p_pu=p_pu)
    wejscie = uklad.wejscie(
        HarmonogramDynamiki(()),
        nastawy(dt_s=0.002, horyzont_s=0.004, krok_wyjscia_s=0.002, eps_init=1.0e-4),
    )
    napiecia = dict(wejscie.punkt_pracy.napiecia_pu)
    napiecia["GEN"] = napiecia["GEN"] * (1.0 + ZABURZENIE_WZGLEDNE)
    moce = dict(wejscie.punkt_pracy.moce_zrodel_pu)
    odbiory: tuple[OdbiorDynamiki, ...] = ()
    if z_odbiorem:
        # Urzadzenie szyny oddaje moc linii i moc odbioru (bilans wezla GEN dokladnie:
        # `V conj(conj(S_odb)/conj(V)) = S_odb`).
        moce[urzadzenie.ident] = moce[urzadzenie.ident] + MOC_ODBIORU_PU
        odbiory = (
            OdbiorDynamiki(
                "ODB1",
                "GEN",
                MOC_ODBIORU_PU.real,
                MOC_ODBIORU_PU.imag,
                charakterystyka=charakterystyka_czula(),
            ),
        )
    return dataclasses.replace(
        wejscie,
        odbiory=odbiory,
        punkt_pracy=dataclasses.replace(
            wejscie.punkt_pracy, napiecia_pu=napiecia, moce_zrodel_pu=moce
        ),
    )


@pytest.mark.parametrize("z_odbiorem", [False, True], ids=["bez_odbioru", "z_odbiorem_czulym"])
@pytest.mark.parametrize(
    ("opis", "urzadzenie", "p_pu"), KONFIGURACJE, ids=[opis for opis, _, _ in KONFIGURACJE]
)
def test_stan_t0_po_korekcie_jest_rownowaga_kazdej_rodziny(
    opis: str,
    urzadzenie: Urzadzenie,
    p_pu: float,
    z_odbiorem: bool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    wejscie = _wejscie(urzadzenie, p_pu, z_odbiorem)
    wynik, probka = _bieg_z_probka_zero(wejscie, monkeypatch)
    korekta = wynik.slad_white_box["inicjalizacja"]["korekta_algebry"]
    assert korekta["wykonana"] is True, f"{opis}: zaburzenie nie wyprowadzilo residuum ponad dno"

    reszta = residuum_algebry(
        probka.model, probka.odbiory, probka.urzadzenia, probka.stany, probka.napiecia
    )
    assert (
        float(np.linalg.norm(reszta)) <= wejscie.nastawy.tolerancja
    ), f"{opis}: probka t = 0 nie spelnia tolerancji algebry biegu"

    punkt = wejscie.punkt_pracy
    punkt_pracy = np.array(
        [complex(punkt.napiecia_pu[ident]) for ident in probka.model.identy_wezlow],
        dtype=complex,
    )
    # Stany PUNKTU ROZPLYWU (te same konstruktory, co inicjalizacja silnika).
    stany_punktu = (
        *(
            odbior.stan_poczatkowy_odbioru(
                complex(punkt_pracy[probka.model.indeks_wezla[odbior.wezel]])
            )
            for odbior in probka.odbiory
        ),
        *(
            u.stan_poczatkowy(punkt.napiecia_pu[u.wezel], punkt.moce_zrodel_pu[u.ident])
            for u in probka.urzadzenia
        ),
    )
    elementy = (*probka.odbiory, *probka.urzadzenia)
    norma = _norma_rownowagi(elementy, probka.stany, probka.napiecia, probka)
    # Odchylka od rownowagi, ktora korekta napiec wywolalaby BEZ reinicjalizacji elementow
    # (stany punktu rozplywu przy napieciach skorygowanych) — skala, wobec ktorej mierzymy.
    bez_reinicjalizacji = _norma_rownowagi(elementy, stany_punktu, probka.napiecia, probka)
    assert bez_reinicjalizacji > 0.0, f"{opis}: przypadek nie rozroznia reinicjalizacji"
    # KRYTERIUM: reinicjalizacja usuwa odchylke wywolana korekta do poziomu szumu obliczenia
    # pochodnych. Stala „10 x norma bramki w punkcie rozplywu" (test SMIB) jest tu za ciasna:
    # petla synchronizacji przeksztaltnikow i turbin ma w obu punktach `max |f|` rzedu
    # 1e-14...1e-13 1/s — kilka jednostek zaokraglenia kata razy wzmocnienie petli (pomiar
    # 2026-09-30: 2,6e-14 w punkcie rozplywu, 2,6e-13 po korekcie) — wiec rownowage
    # mierzymy wzgledem odchylki usuwanej: co najmniej milion razy mniej.
    assert norma <= 1.0e-6 * bez_reinicjalizacji, (
        f"{opis}: stan t = 0 nie jest rownowaga (max |f| {norma:.3e} wobec "
        f"{bez_reinicjalizacji:.3e} bez reinicjalizacji)"
    )
    assert korekta["residuum_f_po"] == pytest.approx(
        norma, rel=10.0 ** (1 - CYFRY_KWANTYZACJI), abs=0.0
    )
    assert korekta["max_zmiana_mocy_urzadzen_pu"] > 0.0
    _sprawdz_odbiory_ze_stanem(wynik, korekta, probka, stany_punktu, punkt_pracy, True)
