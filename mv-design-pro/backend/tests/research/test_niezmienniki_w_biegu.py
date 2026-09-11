"""Niezmienniki stanu urządzeń DZIAŁAJĄ W BIEGU SILNIKA, nie tylko w testach.

PO CO TEN PLIK. Ograniczniki stanu (`OgraniczenieStanu`) i nakładka
`IntegratorZNiezmiennikami` powstały wcześniej, ale nie były wpięte w
`SilnikRMS`: integrator biegu nie znał ograniczników urządzeń. Niezmiennik żył
więc wyłącznie w testach warstwy numerycznej — czyli był deklaracją, nie
własnością biegu. Zmierzone wtedy na układzie sprzężonym: ``Efd`` sięgało
``+115`` p.u. przy suficie ``5,0`` p.u.

Ten plik pilnuje TRZECH rzeczy naraz, bo każda z osobna da się spełnić pozornie:
  1. ograniczniki są ZEBRANE z urządzeń i policzone na indeksach globalnych,
  2. przyjęty stan NIGDY nie wychodzi poza zadeklarowany przedział,
  3. rzutowanie jest ZAPISANE w wyniku (nie cicho poprawione).

TEST JAKO ILOCZYN CECH, nie przykład z karty: krok × integrator × urządzenie.
Defekt, który chowa się przed pojedynczym scenariuszem, ma tu wszystkie
kombinacje, w których mógłby przetrwać.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.calkowanie import INTEGRATORY
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import (
    FalownikGFL,
    FalownikGFM,
    MaszynaSynchroniczna4Rzedu,
    OdbiorStalejMocy,
    ZespolSynchroniczny,
)
from dynamic_lab.urzadzenia_oze import (
    JednostkaSterowanaPQ,
    MagazynEnergiiBESS,
    RegulatorElektrowniPPC,
)
from dynamic_lab.wynik import PrzestrzenSygnalu, WynikDynamiczny
from dynamic_lab.zdarzenia import HarmonogramZdarzen, ZdjecieZwarcia, ZwarcieTrojfazowe

S_BAZOWA_MVA = 100.0

INTEGRATORY_TESTOWANE = ("euler_jawny", "rk4", "euler_niejawny", "trapez_niejawny")


def _topologia_smib() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("GEN", "MID", "SYS"),
        galezie=[Galaz("GEN", "MID", 0.01, 0.08), Galaz("MID", "SYS", 0.01, 0.05)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )


def _zespol() -> ZespolSynchroniczny:
    return ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(ref="G1", szyna="GEN", h_s=4.0, d_tlumienie=1.0),
        avr=RegulatorNapiecia(),
        governor=RegulatorTurbiny(),
    )


def _bieg_zespolu(integrator: str, krok_s: float) -> tuple[SilnikRMS, WynikDynamiczny]:
    model = ModelDynamiczny(topologia=_topologia_smib(), urzadzenia=[_zespol()])
    silnik = SilnikRMS(model, integrator=integrator, krok_s=krok_s)
    x0 = silnik.inicjalizuj({"G1": complex(0.6, 0.2)})
    harmonogram = HarmonogramZdarzen(
        [ZwarcieTrojfazowe(0.2, "MID", x_f_pu=0.02), ZdjecieZwarcia(0.32, "MID")]
    )
    return silnik, silnik.symuluj(x0, czas_koncowy_s=2.0, harmonogram=harmonogram)


# ---------------------------------------------------------------------------
# 1. INWENTARZ: co deklaruje ograniczniki, a co świadomie nie
# ---------------------------------------------------------------------------


def test_inwentarz_urzadzen_deklarujacych_ograniczniki() -> None:
    """Lista urządzeń z ogranicznikami jest ZAMKNIĘTA i przypięta.

    Deklaracja bez testu jest fałszywą pewnością, więc inwentarz z karty
    naprawczej ma tu swoje odbicie w kodzie. Nowe urządzenie z ogranicznikami
    wymaga dopisania go tutaj — i to jest cel, nie uciążliwość.
    """
    z_ogranicznikami = {
        ZespolSynchroniczny,
        FalownikGFL,
        JednostkaSterowanaPQ,
        MagazynEnergiiBESS,
        RegulatorElektrowniPPC,
    }
    # Świadomie BEZ ograniczników — każde z własnym powodem merytorycznym:
    #  * FalownikGFM: moce filtrowane śledzą MIERZONE wstrzyknięcie, którego kres
    #    |V|*i_max nie jest stały (zależy od rozwiązania sieci),
    #  * MaszynaSynchroniczna4Rzedu: brak ogranicznika urządzenia; E' jest
    #    ograniczone przez Efd RÓWNANIEM, a nie stałym przedziałem,
    #  * OdbiorStalejMocy: nie ma stanów.
    bez_ogranicznikow = {FalownikGFM, MaszynaSynchroniczna4Rzedu, OdbiorStalejMocy}
    for klasa in z_ogranicznikami:
        assert hasattr(klasa, "ograniczniki_stanu"), f"{klasa.__name__} straciła ograniczniki"
    for klasa in bez_ogranicznikow:
        assert not hasattr(klasa, "ograniczniki_stanu"), (
            f"{klasa.__name__} zaczęła deklarować ograniczniki — uzasadnienie w "
            "`SilnikRMS._zbierz_ograniczniki` przestało być prawdziwe."
        )


def test_silnik_zbiera_ograniczniki_na_indeksach_globalnych() -> None:
    """Ogranicznik urządzenia trafia pod jego pozycję w wektorze GLOBALNYM."""
    model = ModelDynamiczny(
        topologia=_topologia_smib(),
        urzadzenia=[
            _zespol(),  # 6 stanów: 0..5, efd=4, pm=5
            FalownikGFL(ref="D", szyna="MID", s_zn_pu=0.8),  # 2 stany: 6, 7
        ],
    )
    silnik = SilnikRMS(model)
    wg_nazwy = {(o.nazwa, o.indeks): (o.dol, o.gora) for o in silnik.ograniczenia_stanu}
    assert wg_nazwy[("efd_pu", 4)] == (0.0, 5.0)
    assert wg_nazwy[("pm_pu", 5)] == (0.0, 1.2)
    assert wg_nazwy[("p_pu", 6)] == (-0.8, 0.8)
    assert wg_nazwy[("q_pu", 7)] == (-0.8, 0.8)


def test_ogranicznik_wskazujacy_poza_wlasny_wycinek_jest_odrzucany() -> None:
    """Urządzenie nie może ograniczać stanu sąsiada — to byłby cichy zapis w cudzy model."""

    class ZlyZespol(ZespolSynchroniczny):
        def ograniczniki_stanu(self, przesuniecie: int):  # type: ignore[override]
            return super().ograniczniki_stanu(przesuniecie + 100)

    model = ModelDynamiczny(
        topologia=_topologia_smib(),
        urzadzenia=[
            ZlyZespol(
                maszyna=MaszynaSynchroniczna4Rzedu(ref="G1", szyna="GEN", h_s=4.0),
                avr=RegulatorNapiecia(),
            )
        ],
    )
    with pytest.raises(ValueError, match="poza własnym wycinkiem"):
        SilnikRMS(model)


# ---------------------------------------------------------------------------
# 2. NIEZMIENNIK W BIEGU: iloczyn (integrator × krok)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("integrator", INTEGRATORY_TESTOWANE)
@pytest.mark.parametrize("krok_s", (0.001, 0.005, 0.02))
def test_efd_i_pm_nigdy_nie_wychodza_poza_ogranicznik(integrator: str, krok_s: float) -> None:
    """Żadna PRZYJĘTA próbka Efd/Pm nie leży poza zakresem urządzenia.

    Iloczyn cech: cztery integratory × trzy kroki. Przed wpięciem niezmiennika
    zmierzono ``Efd`` do ``+115`` p.u. przy suficie ``5,0`` p.u. — i to we
    WSZYSTKICH ośmiu badanych przebiegach, więc jeden scenariusz by nie wystarczył
    do wykrycia regresji.
    """
    silnik, wynik = _bieg_zespolu(integrator, krok_s)
    granice = {o.nazwa: (o.dol, o.gora) for o in silnik.ograniczenia_stanu}
    for nazwa in ("efd_pu", "pm_pu"):
        dol, gora = granice[nazwa]
        wartosci = np.array(wynik.sygnal(nazwa, "G1", PrzestrzenSygnalu.STAN).wartosci)
        assert wartosci.min() >= dol, f"{nazwa} spadł do {wartosci.min()} < {dol}"
        assert wartosci.max() <= gora, f"{nazwa} wyszedł na {wartosci.max()} > {gora}"


def _efd(wynik: WynikDynamiczny) -> np.ndarray:
    return np.array(wynik.sygnal("efd_pu", "G1", PrzestrzenSygnalu.STAN).wartosci)


def _bieg_bez_niezmiennikow(integrator: str, krok_s: float) -> WynikDynamiczny:
    """Ten sam bieg z WYŁĄCZONĄ nakładką — punkt odniesienia „co by było".

    Wyłączenie jest jawne i lokalne dla tego pomiaru; produkcyjna ścieżka
    laboratorium zawsze zbiera ograniczniki z urządzeń.
    """
    model = ModelDynamiczny(topologia=_topologia_smib(), urzadzenia=[_zespol()])
    silnik = SilnikRMS(model, integrator=integrator, krok_s=krok_s)
    silnik.ograniczenia_stanu = ()
    x0 = silnik.inicjalizuj({"G1": complex(0.6, 0.2)})
    return silnik.symuluj(
        x0,
        czas_koncowy_s=2.0,
        harmonogram=HarmonogramZdarzen(
            [ZwarcieTrojfazowe(0.2, "MID", x_f_pu=0.02), ZdjecieZwarcia(0.32, "MID")]
        ),
    )


# Kombinacje, w których krok jest DŁUŻSZY od stałej czasowej wzbudnicy
# (``T_a = 0,05`` s), więc dyskretyzacja wyprowadza stan poza zbiór niezmienniczy
# przepływu ścisłego. Zmierzone BEZ nakładki (Efd, sufit [0; 5] p.u.):
#   euler_jawny  dt=0,06  ->  [ -0,147 ;      6,001]
#   euler_jawny  dt=0,10  ->  [ -4,932 ;     14,932]
#   euler_jawny  dt=0,20  ->  [-1273,463 ;  431,155]
#   rk4          dt=0,20  ->  [ -0,590 ;      4,032]
#   trapez       dt=0,20  ->  [  0,332 ;      5,297]
# Metody niejawne przy dt <= 0,10 niezmiennik TRZYMAJĄ SAME — to potwierdza, że
# samo ograniczenie żądania wystarcza im, a rzutowanie jest siatką bezpieczeństwa
# dla metod jawnych i dużych kroków.
NARUSZAJACE = (
    ("euler_jawny", 0.06),
    ("euler_jawny", 0.10),
    ("euler_jawny", 0.20),
    ("rk4", 0.20),
    ("trapez_niejawny", 0.20),
)


@pytest.mark.parametrize(("integrator", "krok_s"), NARUSZAJACE)
def test_bez_niezmiennika_stan_wychodzi_poza_sufit_wzbudnicy(
    integrator: str, krok_s: float
) -> None:
    """Defekt JEST realny w każdej z tych kombinacji — inaczej naprawa niczego nie broni.

    Ten test celowo mierzy ZŁE zachowanie: gdyby zniknęło (np. ktoś zmieni model
    tak, że krok nigdy nie wychodzi poza przedział), test poniżej przestałby
    cokolwiek sprawdzać, a my byśmy o tym nie wiedzieli.
    """
    efd = _efd(_bieg_bez_niezmiennikow(integrator, krok_s))
    assert efd.min() < 0.0 or efd.max() > 5.0, (
        f"{integrator}/dt={krok_s}: bez nakładki Efd zmieścił się w [0; 5] "
        f"([{efd.min():.4f}; {efd.max():.4f}]) — scenariusz przestał być testem naprawy."
    )


@pytest.mark.parametrize(("integrator", "krok_s"), NARUSZAJACE)
def test_niezmiennik_domyka_sufit_i_zapisuje_kazde_rzutowanie(
    integrator: str, krok_s: float
) -> None:
    """W tych samych kombinacjach nakładka trzyma przedział — i ZAPISUJE, że musiała."""
    silnik, wynik = _bieg_zespolu(integrator, krok_s)
    d = wynik.diagnostyka
    assert d.niezmienniki_stanu_egzekwowane == 2
    assert "niezmienniki" in d.integrator
    efd = _efd(wynik)
    assert 0.0 <= efd.min() and efd.max() <= 5.0

    assert d.rzutowania_stanu, (
        "Stan wyszedł poza sufit bez nakładki, a z nakładką nie ma ANI JEDNEGO "
        "zapisu rzutowania — znaczyłoby to, że przedział trzyma coś innego niż "
        "niezmiennik, i że dziennik nie opisuje biegu."
    )
    for z in d.rzutowania_stanu:
        assert z.nazwa in ("efd_pu", "pm_pu")
        assert z.znaczenie.strip(), "rzutowanie bez znaczenia fizycznego"
        assert z.nadmiar > 0.0
        assert z.granica in ("dol", "gora")
        assert (
            (z.wartosc_po == 0.0 and z.granica == "dol")
            or (z.wartosc_po == 5.0 and z.granica == "gora")
            or z.nazwa == "pm_pu"
        )


def test_bieg_bez_ogranicznikow_nie_zaklada_nakladki() -> None:
    """Model bez ograniczników biegnie na czystym integratorze — nakładka bez treści kłamie."""
    model = ModelDynamiczny(
        topologia=_topologia_smib(),
        urzadzenia=[FalownikGFM(ref="D", szyna="GEN", h_wirtualna_s=4.0)],
    )
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    assert silnik.ograniczenia_stanu == ()
    x0 = silnik.inicjalizuj({"D": complex(0.5, 0.1)})
    wynik = silnik.symuluj(x0, czas_koncowy_s=0.5)
    assert wynik.diagnostyka.integrator == INTEGRATORY["rk4"].nazwa
    assert wynik.diagnostyka.niezmienniki_stanu_egzekwowane == 0
    assert wynik.diagnostyka.rzutowania_stanu == ()


# ---------------------------------------------------------------------------
# 3. PROPAGACJA: elektrownia wnosi granice swoich modułów
# ---------------------------------------------------------------------------


def test_ppc_propaguje_ograniczniki_swoich_modulow() -> None:
    """Regulator elektrowni nie kopiuje granic modułów — pyta o nie moduły."""
    ppc = RegulatorElektrowniPPC(
        ref="PPC",
        szyna="MID",
        jednostki=[
            JednostkaSterowanaPQ(ref="PV1", s_zn_pu=0.4),
            MagazynEnergiiBESS(
                ref="BAT",
                szyna="MID",
                e_pojemnosc_mwh=10.0,
                s_bazowa_mva=S_BAZOWA_MVA,
                s_falownika_pu=0.3,
            ),
        ],
        limit_eksportu_pu=0.5,
    )
    model = ModelDynamiczny(topologia=_topologia_smib(), urzadzenia=[ppc])
    silnik = SilnikRMS(model)
    wg_nazwy = {(o.nazwa, o.indeks): (o.dol, o.gora) for o in silnik.ograniczenia_stanu}
    # polecenia elektrowni: moc zainstalowana 0,7 p.u., eksport ograniczony do 0,5
    assert wg_nazwy[("p_polecenie_pu", 0)] == (-0.7, 0.5)
    assert wg_nazwy[("q_polecenie_pu", 1)] == (-0.7, 0.7)
    # moduł PV pod przesunięciem 2, magazyn pod 4
    assert wg_nazwy[("p_wyjscia_pu", 2)] == (-0.4, 0.4)
    assert wg_nazwy[("p_wyjscia_pu", 4)] == (-0.3, 0.3)
    assert wg_nazwy[("soc", 6)] == (0.0, 1.0)


def test_soc_nie_wychodzi_poza_zero_jeden_w_biegu() -> None:
    """Stan naładowania jest z definicji w [0, 1] — także po kroku całkowania."""
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="GEN",
        e_pojemnosc_mwh=0.05,
        s_bazowa_mva=S_BAZOWA_MVA,
        s_falownika_pu=1.0,
        soc_poczatkowy=0.12,
        p_ref_pu=0.9,
    )
    model = ModelDynamiczny(
        topologia=_topologia_smib(),
        urzadzenia=[magazyn, OdbiorStalejMocy(ref="ODB", szyna="MID", p_pu=-0.9, q_pu=-0.2)],
    )
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.01)
    x0 = silnik.inicjalizuj({"BAT": complex(0.9, 0.0), "ODB": complex(-0.9, -0.2)})
    wynik = silnik.symuluj(x0, czas_koncowy_s=6.0)
    soc = np.array(wynik.sygnal("soc", "BAT", PrzestrzenSygnalu.STAN).wartosci)
    assert soc.min() >= 0.0
    assert soc.max() <= 1.0
