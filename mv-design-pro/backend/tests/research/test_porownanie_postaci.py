"""§11.3/9 — ile ZMIENIA wybór postaci ogranicznika. Pomiar, nie wybór.

KOD BADAWCZY — patrz `backend/research/README.md`.

Badana jest postać o najszerszym zasięgu w inwentarzu ryzyka: PRIORYTET
SKŁADOWEJ w ograniczniku prądu przekształtnika (bierna vs czynna). Ta jedna
reguła obsługuje pięć pozycji inwentarza naraz, bo jest wspólna dla falownika
GFL, jednostki sterowanej PQ i magazynu.
"""

from __future__ import annotations

import pytest
from dynamic_lab.benchmarki import harmonogram_zwarcia
from dynamic_lab.porownanie_postaci import (
    KanalPorownania,
    WariantPostaci,
    porownaj_postacie,
)
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import FalownikGFL, OdbiorStalejMocy
from dynamic_lab.wynik import PrzestrzenSygnalu, WynikDynamiczny

MOCE = {"DER1": complex(0.6, 0.0), "DER2": complex(0.4, 0.0), "ODB": complex(-0.5, -0.15)}

KANALY = (
    KanalPorownania("u_pu", "DER2"),
    KanalPorownania("u_pu", "SN2"),
    KanalPorownania("p_pu", "DER2"),
    KanalPorownania("q_pu", "DER2"),
    KanalPorownania("i_pu", "DER2"),
)

_PAMIEC: dict[tuple[bool, float], WynikDynamiczny] = {}


def _bieg(priorytet_biernej: bool, x_f_pu: float) -> WynikDynamiczny:
    klucz = (priorytet_biernej, x_f_pu)
    if klucz not in _PAMIEC:
        topologia = TopologiaSieci(
            szyny=("GPZ", "SN1", "SN2", "DER1", "DER2"),
            galezie=[
                Galaz("GPZ", "SN1", 0.02, 0.08),
                Galaz("SN1", "SN2", 0.04, 0.10),
                Galaz("SN1", "DER1", 0.03, 0.09),
                Galaz("SN2", "DER2", 0.05, 0.12),
            ],
            szyny_sztywne={"GPZ": complex(1.0, 0.0)},
        )
        model = ModelDynamiczny(
            topologia=topologia,
            urzadzenia=[
                FalownikGFL(
                    ref="DER1",
                    szyna="DER1",
                    i_max_pu=1.2,
                    k_frt=2.0,
                    t_p_s=0.05,
                    t_q_s=0.05,
                    priorytet_biernej=priorytet_biernej,
                ),
                FalownikGFL(
                    ref="DER2",
                    szyna="DER2",
                    i_max_pu=1.2,
                    k_frt=2.0,
                    t_p_s=0.08,
                    t_q_s=0.08,
                    priorytet_biernej=priorytet_biernej,
                ),
                OdbiorStalejMocy(ref="ODB", szyna="SN2", p_pu=-0.5, q_pu=-0.15),
            ],
        )
        silnik = SilnikRMS(model, integrator="trapez_niejawny", krok_s=0.002)
        x0 = silnik.inicjalizuj(MOCE)
        _PAMIEC[klucz] = silnik.symuluj(
            x0,
            czas_koncowy_s=2.0,
            harmonogram=harmonogram_zwarcia(
                szyna="SN2", chwila_s=0.5, czas_trwania_s=0.15, x_f_pu=x_f_pu
            ),
        )
    return _PAMIEC[klucz]


def _warianty(x_f_pu: float) -> tuple[WariantPostaci, WariantPostaci]:
    return (
        WariantPostaci(
            identyfikator="priorytet_biernej",
            opis_pl="przy nasyceniu ustępuje składowa CZYNNA (wsparcie napięcia)",
            bieg=lambda: _bieg(True, x_f_pu),
        ),
        WariantPostaci(
            identyfikator="priorytet_czynnej",
            opis_pl="przy nasyceniu ustępuje składowa BIERNA (utrzymanie mocy)",
            bieg=lambda: _bieg(False, x_f_pu),
        ),
    )


def test_zapad_PLYTKI_nie_odroznia_postaci_i_uprzaz_MOWI_TO_WPROST() -> None:
    """Ogranicznik nieaktywny ⇒ postacie nierozróżnialne BIT W BIT.

    To jest cały mechanizm ryzyka postaci: test napisany na płytkim zakłóceniu
    przechodzi identycznie dla obu postaci i NICZEGO o nich nie orzeka. Uprząż
    ma to nazywać brakiem dowodu różnicy, a nie dowodem równoważności.
    """
    a, b = _warianty(0.30)
    wynik = porownaj_postacie(
        a, b, kanaly=KANALY, opis_zadania_pl="zwarcie x_f = 0,30 p.u. na SN2 (zapad płytki)"
    )
    assert wynik.postacie_nierozroznialne is True
    assert wynik.najwieksza.maks_roznica == 0.0
    assert "NIE ODRÓŻNIA" in wynik.raport_pl()
    assert "brak dowodu różnicy" in wynik.raport_pl()


def test_zapad_GLEBOKI_odroznia_postacie_i_podaje_LICZBE() -> None:
    """Zmierzona różnica na zaciskach modułu — to jest produkt tej uprzęży.

    Wartości odniesienia pochodzą z pomiaru na tym SHA (trapez niejawny, krok
    2 ms). Tolerancja jest luźna, bo test pilnuje RZĘDU zjawiska, a nie cyfr:
    zaostrzenie jej zamieniłoby pomiar w zapadkę na zaokrąglenia.
    """
    a, b = _warianty(0.10)
    wynik = porownaj_postacie(
        a, b, kanaly=KANALY, opis_zadania_pl="zwarcie x_f = 0,10 p.u. na SN2 (zapad głęboki)"
    )
    assert wynik.postacie_nierozroznialne is False

    wg_kanalu = {(r.kanal.klucz, r.kanal.element_ref): r for r in wynik.roznice}
    napiecie = wg_kanalu[("u_pu", "DER2")]
    assert napiecie.maks_roznica == pytest.approx(0.0622, rel=0.05)
    assert 0.50 < napiecie.chwila_s < 0.65, "różnica ma wypadać W ZWARCIU, nie poza nim"

    prad = wg_kanalu[("i_pu", "DER2")]
    assert prad.maks_roznica == pytest.approx(0.195, rel=0.05)
    # Priorytet czynnej dobija do pełnego ogranicznika, priorytet biernej nie:
    assert prad.wartosc_b == pytest.approx(1.2, abs=1e-3)
    assert prad.wartosc_a < 1.2 - 1e-3


def test_roznica_ROSNIE_z_glebokoscia_zapadu() -> None:
    """Monotoniczność jest tu własnością mechanizmu, nie ozdobą.

    Ogranicznik działa tym mocniej, im głębszy zapad, więc różnica postaci musi
    rosnąć. Gdyby malała, znaczyłoby to, że mierzymy coś innego niż nasycenie.
    """
    plytki = porownaj_postacie(
        *_warianty(0.30), kanaly=KANALY, opis_zadania_pl="x_f = 0,30"
    ).najwieksza.maks_roznica
    glebki = porownaj_postacie(
        *_warianty(0.10), kanaly=KANALY, opis_zadania_pl="x_f = 0,10"
    ).najwieksza.maks_roznica
    assert glebki > plytki


def test_uprzaz_NIE_WYBIERA_postaci() -> None:
    """§11.3/9 zakazuje wyboru — sprawdzane KSZTAŁTEM typu, nie obietnicą.

    Wynik porównania nie ma pola „lepszy", „zalecany" ani „kanoniczny". Gdyby
    miał, uprząż podejmowałaby decyzję architektoniczną przy okazji pomiaru.
    """
    wynik = porownaj_postacie(*_warianty(0.10), kanaly=KANALY, opis_zadania_pl="x")
    pola = set(vars(wynik))
    assert not (pola & {"lepszy", "zalecany", "kanoniczny", "wybrany", "rekomendacja"})


def test_porownanie_biegow_o_ROZNYCH_zadaniach_jest_bledem() -> None:
    """Dwa różne scenariusze nazwane „różnicą postaci" byłyby fabrykacją wniosku."""
    a, _ = _warianty(0.30)
    inny = WariantPostaci(
        identyfikator="inne_zadanie",
        opis_pl="ten sam model, ale KRÓTSZY horyzont",
        bieg=lambda: _bieg(True, 0.10),
    )
    podmieniony = WariantPostaci(
        identyfikator="inne_zadanie",
        opis_pl=inny.opis_pl,
        bieg=lambda: _bieg_krotszy(),
    )
    with pytest.raises(ValueError, match="różną liczbę próbek|osie czasu|Osie czasu"):
        porownaj_postacie(a, podmieniony, kanaly=KANALY, opis_zadania_pl="x")


def _bieg_krotszy() -> WynikDynamiczny:
    topologia = TopologiaSieci(
        szyny=("GPZ", "SN1", "SN2", "DER1", "DER2"),
        galezie=[
            Galaz("GPZ", "SN1", 0.02, 0.08),
            Galaz("SN1", "SN2", 0.04, 0.10),
            Galaz("SN1", "DER1", 0.03, 0.09),
            Galaz("SN2", "DER2", 0.05, 0.12),
        ],
        szyny_sztywne={"GPZ": complex(1.0, 0.0)},
    )
    model = ModelDynamiczny(
        topologia=topologia,
        urzadzenia=[
            FalownikGFL(ref="DER1", szyna="DER1", t_p_s=0.05, t_q_s=0.05),
            FalownikGFL(ref="DER2", szyna="DER2", t_p_s=0.08, t_q_s=0.08),
            OdbiorStalejMocy(ref="ODB", szyna="SN2", p_pu=-0.5, q_pu=-0.15),
        ],
    )
    silnik = SilnikRMS(model, integrator="trapez_niejawny", krok_s=0.002)
    return silnik.symuluj(silnik.inicjalizuj(MOCE), czas_koncowy_s=1.0)


def test_porownanie_bez_kanalow_jest_bledem() -> None:
    with pytest.raises(ValueError, match="ani jednego kanału"):
        porownaj_postacie(*_warianty(0.30), kanaly=(), opis_zadania_pl="x")


def test_kanal_ze_STANU_tez_da_sie_porownac() -> None:
    """Przestrzeń sygnału jest częścią tożsamości kanału, także tutaj."""
    wynik = porownaj_postacie(
        *_warianty(0.10),
        kanaly=(KanalPorownania("q_pu", "DER2", PrzestrzenSygnalu.STAN),),
        opis_zadania_pl="stan q_pu",
    )
    assert wynik.najwieksza.maks_roznica > 0.0
