"""Tory RÓWNOLEGŁE — wyłączenie jednego toru nie może rozpiąć korytarza.

DEFEKT ODTWORZONY PRZED NAPRAWĄ (nie wydedukowany z lektury). Przy dwóch
gałęziach 0,40 p.u. między tymi samymi szynami wywołanie „wyłącz gałąź GEN–SYS"
wyłączało OBIE: ``Ybus[0,0]`` przechodziło z ``−5j`` prosto na ``0j``, czyli
maszyna zostawała ODCIĘTA od systemu zamiast stracić jeden tor. Pętla w
`z_wylaczona_galezia` nie miała przerwania, a `Galaz` nie miała żadnej
tożsamości, więc nie dało się nawet wskazać, który tor ma paść.

Skutek był CICHY i wyglądał wiarygodnie: przebieg pokazywał utratę synchronizmu
po „wyłączeniu linii" — czyli dokładnie to, czego badacz się spodziewa po
wyłączeniu OSTATNIEGO toru. Żaden istniejący test tego nie łapał, bo wszystkie
budowały układy z jedną gałęzią na parę szyn.

Ten sam wzorzec został już raz naprawiony w tym laboratorium dla BOCZNIKÓW
(`bez_bocznika_o_zrodle` zastąpiło kasowanie wszystkiego na szynie, defekt E1
audytu). Gałąź została wtedy pominięta — tu domykamy tę samą klasę.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.zdarzenia import WylaczenieGalezi

X_TORU_PU = 0.40


def _korytarz_dwutorowy() -> TopologiaSieci:
    """Dwa tory równoległe — układ zwyczajny w sieci SN, nie przypadek egzotyczny."""
    return TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[
            Galaz("GEN", "SYS", r_pu=0.0, x_pu=X_TORU_PU),
            Galaz("GEN", "SYS", r_pu=0.0, x_pu=X_TORU_PU),
        ],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )


def test_tozsamosci_nadane_deterministycznie_i_roznie() -> None:
    """Dwa tory MUSZĄ być rozróżnialne — inaczej zdarzenia nie da się zaadresować."""
    topo = _korytarz_dwutorowy()
    assert topo.identy_galezi == ("GEN-SYS#1", "GEN-SYS#2")
    # Determinizm: ta sama lista wejściowa daje te same tożsamości.
    assert _korytarz_dwutorowy().identy_galezi == topo.identy_galezi


def test_wylaczenie_jednego_toru_zostawia_drugi() -> None:
    """SEDNO DEFEKTU: po wyłączeniu jednego toru korytarz NADAL przewodzi.

    Wartości są wyprowadzone, nie zmierzone z poprzedniego biegu:
    dwa tory po ``X = 0,40`` dają ``B = 2/0,40 = 5`` (``Ybus[0,0] = −5j``),
    jeden tor daje ``B = 2,5`` (``−2,5j``).
    """
    topo = _korytarz_dwutorowy()
    assert topo.zbuduj_ybus()[0, 0] == pytest.approx(complex(0.0, -5.0))

    po = topo.z_wylaczona_galezia_po_id("GEN-SYS#1")
    assert po.zbuduj_ybus()[0, 0] == pytest.approx(
        complex(0.0, -2.5)
    ), "Wyłączenie JEDNEGO toru rozpięło cały korytarz — to jest dokładnie ten defekt."
    assert [g.zalaczona for g in po.galezie] == [False, True]


def test_para_szyn_przy_dwoch_torach_jest_bledem_a_nie_domyslem() -> None:
    """Niejednoznaczne polecenie MUSI być głośne.

    Ciche wybranie „pierwszej pasującej" byłoby równie złe jak wyłączenie obu:
    wynik zależałby od kolejności w liście, której nikt nie deklarował jako
    znaczącej.
    """
    topo = _korytarz_dwutorowy()
    with pytest.raises(ValueError, match="niejednoznaczne"):
        topo.z_wylaczona_galezia("GEN", "SYS")


def test_para_szyn_przy_jednym_torze_dziala_bez_zmian() -> None:
    """DRUGA STRONA PREDYKATU: jednoznaczna para szyn nadal jest poprawną drogą.

    Bez tego przypadku naprawa mogłaby polegać na zablokowaniu adresowania parą
    szyn w ogóle — a to zepsułoby wszystkie istniejące scenariusze jednotorowe.
    """
    topo = TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[Galaz("GEN", "SYS", r_pu=0.0, x_pu=X_TORU_PU)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    po = topo.z_wylaczona_galezia("GEN", "SYS")
    assert po.zbuduj_ybus()[0, 0] == pytest.approx(0j)


def test_powtorne_wylaczenie_tego_samego_toru_jest_bledem() -> None:
    """Scenariusz wyłączający dwa razy ten sam tor opisuje inną sieć niż liczona."""
    topo = _korytarz_dwutorowy().z_wylaczona_galezia_po_id("GEN-SYS#1")
    with pytest.raises(ValueError, match="już wyłączona"):
        topo.z_wylaczona_galezia_po_id("GEN-SYS#1")


def test_wylaczenie_nieistniejacej_galezi_wymienia_dostepne() -> None:
    """Komunikat ma prowadzić do naprawy scenariusza, nie tylko sygnalizować błąd."""
    topo = _korytarz_dwutorowy()
    with pytest.raises(ValueError, match=r"GEN-SYS#1"):
        topo.z_wylaczona_galezia_po_id("NIE_MA_TAKIEJ")


def test_powtorzona_tozsamosc_jawna_jest_bledem() -> None:
    """Dwie gałęzie o tej samej nazwie są nieodróżnialne dla zdarzeń."""
    with pytest.raises(ValueError, match="Powtórzone tożsamości"):
        TopologiaSieci(
            szyny=("GEN", "SYS"),
            galezie=[
                Galaz("GEN", "SYS", 0.0, X_TORU_PU, ident="TOR"),
                Galaz("GEN", "SYS", 0.0, X_TORU_PU, ident="TOR"),
            ],
            szyny_sztywne={"SYS": complex(1.0, 0.0)},
        )


def test_zdarzenie_po_tozsamosci_wylacza_dokladnie_jeden_tor() -> None:
    """Pełna droga: zdarzenie harmonogramu, nie samo API topologii."""
    topo = _korytarz_dwutorowy()
    po = WylaczenieGalezi(czas_s=1.0, ident="GEN-SYS#2").zastosuj(topo)
    assert [g.zalaczona for g in po.galezie] == [True, False]
    assert po.zbuduj_ybus()[0, 0] == pytest.approx(complex(0.0, -2.5))


def test_zdarzenie_bez_adresu_jest_odrzucane_przy_budowie() -> None:
    """Zdarzenie, które nie wskazuje CZEGO dotyczy, nie ma prawa powstać."""
    with pytest.raises(ValueError, match="wymaga"):
        WylaczenieGalezi(czas_s=1.0)


def test_ybus_po_wylaczeniu_obu_torow_jest_rozpiety() -> None:
    """Kontrola przeciwna: wyłączenie OBU torów faktycznie rozpina korytarz.

    Potrzebna, żeby test wyżej nie przechodził dlatego, że wyłączanie w ogóle
    przestało działać.
    """
    topo = _korytarz_dwutorowy()
    po = topo.z_wylaczona_galezia_po_id("GEN-SYS#1").z_wylaczona_galezia_po_id("GEN-SYS#2")
    assert po.zbuduj_ybus()[0, 0] == pytest.approx(0j)
    assert not np.any(po.zbuduj_ybus())
