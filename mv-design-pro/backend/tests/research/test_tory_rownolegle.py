"""Tożsamość gałęzi i zdarzeń topologicznych — NIEZALEŻNA OD KOLEJNOŚCI REKORDÓW.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

DEFEKT PIERWSZY (odtworzony, nie wydedukowany). Przy dwóch gałęziach 0,40 p.u.
między tymi samymi szynami wywołanie „wyłącz gałąź GEN–SYS" wyłączało OBIE:
``Ybus[0,0]`` przechodziło z ``−5j`` prosto na ``0j``, czyli maszyna zostawała
ODCIĘTA od systemu zamiast stracić jeden tor. Skutek był CICHY i wyglądał
wiarygodnie: przebieg pokazywał utratę synchronizmu po „wyłączeniu linii".

DEFEKT DRUGI — W SAMEJ NAPRAWIE PIERWSZEGO (audyt niezależny, plan naprawy §6).
Naprawa nadawała brakującym tożsamościom postać ``"<od>-<do>#<n>"``, gdzie ``n``
było NUMEREM WYSTĄPIENIA W KOLEJNOŚCI PODANIA. Tożsamość zależała więc od
kolejności rekordów: permutacja listy gałęzi zamieniała ``GEN-SYS#1`` z
``GEN-SYS#2``, a harmonogram „wyłącz GEN-SYS#1" po permutacji wyłączał DRUGI tor.
Numer pozycji w liście nie jest tożsamością komponentu.

REGUŁA PO NAPRAWIE:
1. gałąź JEDYNA między swoją parą szyn dostaje ``"<od>-<do>"`` (bez numeru),
2. tor równoległy MUSI mieć ``ident`` podany jawnie — z identyfikatora komponentu,
3. powtórzony ``ident`` jest błędem głośnym.

Ten sam wzorzec został już raz naprawiony dla BOCZNIKÓW (`bez_bocznika_o_zrodle`
zastąpiło kasowanie wszystkiego na szynie, defekt E1 audytu).
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.zdarzenia import HarmonogramZdarzen, WylaczenieGalezi

X_TORU_PU = 0.40
#: Identyfikatory komponentów — tak samo jak w projekcie: oznaczenie kabla, nie
#: numer wiersza w tabeli.
TOR_A = "KABEL-A"
TOR_B = "KABEL-B"


def _korytarz_dwutorowy(*, odwroc: bool = False) -> TopologiaSieci:
    """Dwa tory równoległe — układ zwyczajny w sieci SN, nie przypadek egzotyczny.

    ``odwroc`` podaje te same gałęzie w ODWROTNEJ kolejności. Służy do badania
    niezależności tożsamości od kolejności rekordów — czyli dokładnie tego, co
    audyt wskazał jako defekt poprzedniej naprawy.
    """
    galezie = [
        Galaz("GEN", "SYS", r_pu=0.0, x_pu=X_TORU_PU, ident=TOR_A),
        Galaz("GEN", "SYS", r_pu=0.0, x_pu=X_TORU_PU, ident=TOR_B),
    ]
    if odwroc:
        galezie.reverse()
    return TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=galezie,
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )


def _zalaczone(topo: TopologiaSieci) -> dict[str, bool]:
    """Stan załączenia PER TOŻSAMOŚĆ — nie per pozycja w liście.

    Porównywanie listy ``[True, False]`` wiązałoby test z kolejnością, czyli
    powtarzałoby błąd, który ten moduł bada.
    """
    return {g.ident: g.zalaczona for g in topo.galezie}


# ---------------------------------------------------------------------------
# §6 — tożsamość pochodzi z komponentu, nie z kolejności
# ---------------------------------------------------------------------------


def test_tozsamosci_pochodza_z_identyfikatorow_komponentow() -> None:
    """Dwa tory MUSZĄ być rozróżnialne — inaczej zdarzenia nie da się zaadresować."""
    topo = _korytarz_dwutorowy()
    assert set(topo.identy_galezi) == {TOR_A, TOR_B}


def test_permutacja_rekordow_NIE_ZMIENIA_znaczenia_zdarzenia() -> None:
    """SEDNO ZARZUTU AUDYTU: to samo zdarzenie musi trafić w ten sam komponent.

    Przy numeracji po kolejności podania ``GEN-SYS#1`` wskazywało PIERWSZY rekord
    listy — więc po permutacji to samo zdarzenie wyłączało drugi tor, cicho i bez
    błędu. Tożsamość wzięta z komponentu nie ma tej własności.
    """
    zdarzenie = WylaczenieGalezi(czas_s=1.0, ident=TOR_A)
    po_naturalnej = zdarzenie.zastosuj(_korytarz_dwutorowy())
    po_odwroconej = zdarzenie.zastosuj(_korytarz_dwutorowy(odwroc=True))
    assert _zalaczone(po_naturalnej) == {TOR_A: False, TOR_B: True}
    assert _zalaczone(po_odwroconej) == {TOR_A: False, TOR_B: True}


def test_permutacja_rekordow_nie_zmienia_ybusa() -> None:
    """Kontrola liczbowa do powyższego: ta sama sieć = ta sama macierz.

    Wartości są WYPROWADZONE, nie odczytane z poprzedniego biegu: dwa tory po
    ``X = 0,40`` dają ``B = 2/0,40 = 5`` (``Ybus[0,0] = −5j``), jeden tor ``2,5``.
    """
    assert _korytarz_dwutorowy().zbuduj_ybus()[0, 0] == pytest.approx(complex(0.0, -5.0))
    assert _korytarz_dwutorowy(odwroc=True).zbuduj_ybus()[0, 0] == pytest.approx(complex(0.0, -5.0))
    zdarzenie = WylaczenieGalezi(czas_s=1.0, ident=TOR_B)
    assert zdarzenie.zastosuj(_korytarz_dwutorowy()).zbuduj_ybus()[0, 0] == pytest.approx(
        complex(0.0, -2.5)
    )
    assert zdarzenie.zastosuj(_korytarz_dwutorowy(odwroc=True)).zbuduj_ybus()[
        0, 0
    ] == pytest.approx(complex(0.0, -2.5))


def test_tory_rownolegle_bez_jawnej_tozsamosci_sa_odrzucane() -> None:
    """Laboratorium NIE MA PRAWA wymyślić numeru kabla.

    Milczące ponumerowanie po kolejności było poprzednią naprawą i właśnie ono
    okazało się defektem. Brak danej musi być głośny.
    """
    with pytest.raises(ValueError, match="bez jawnej tożsamości"):
        TopologiaSieci(
            szyny=("GEN", "SYS"),
            galezie=[
                Galaz("GEN", "SYS", 0.0, X_TORU_PU),
                Galaz("GEN", "SYS", 0.0, X_TORU_PU),
            ],
            szyny_sztywne={"SYS": complex(1.0, 0.0)},
        )


def test_tory_rownolegle_zapisane_w_obu_kierunkach_tez_wymagaja_tozsamosci() -> None:
    """``A→B`` i ``B→A`` to TA SAMA para fizyczna, więc też są torami równoległymi.

    Para uporządkowana przepuściłaby ten układ (dwie różne pary), a fizycznie są
    to dwie ścieżki między tymi samymi rozdzielniami — czyli dokładnie sytuacja,
    w której „wyłącz gałąź GEN–SYS" jest niejednoznaczne.
    """
    with pytest.raises(ValueError, match="bez jawnej tożsamości"):
        TopologiaSieci(
            szyny=("GEN", "SYS"),
            galezie=[
                Galaz("GEN", "SYS", 0.0, X_TORU_PU),
                Galaz("SYS", "GEN", 0.0, X_TORU_PU),
            ],
            szyny_sztywne={"SYS": complex(1.0, 0.0)},
        )


def test_jedyna_galaz_pary_dostaje_tozsamosc_bez_numeru() -> None:
    """DRUGA STRONA PREDYKATU — układ jednotorowy nie wymaga niczego nowego.

    Bez tego przypadku naprawa mogłaby polegać na wymuszeniu ``ident`` wszędzie,
    co zepsułoby każdy istniejący scenariusz jednotorowy.
    """
    topo = TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[Galaz("GEN", "SYS", r_pu=0.0, x_pu=X_TORU_PU)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    assert topo.identy_galezi == ("GEN-SYS",)


# ---------------------------------------------------------------------------
# §6 — adresowanie zdarzeń
# ---------------------------------------------------------------------------


def test_wylaczenie_jednego_toru_zostawia_drugi() -> None:
    """DEFEKT PIERWSZY: po wyłączeniu jednego toru korytarz NADAL przewodzi."""
    topo = _korytarz_dwutorowy()
    po = topo.z_wylaczona_galezia_po_id(TOR_A)
    assert po.zbuduj_ybus()[0, 0] == pytest.approx(
        complex(0.0, -2.5)
    ), "Wyłączenie JEDNEGO toru rozpięło cały korytarz — to jest dokładnie ten defekt."
    assert _zalaczone(po) == {TOR_A: False, TOR_B: True}


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
    """DRUGA STRONA PREDYKATU: jednoznaczna para szyn nadal jest poprawną drogą."""
    topo = TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[Galaz("GEN", "SYS", r_pu=0.0, x_pu=X_TORU_PU)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    po = topo.z_wylaczona_galezia("GEN", "SYS")
    assert po.zbuduj_ybus()[0, 0] == pytest.approx(0j)


def test_powtorne_wylaczenie_tego_samego_toru_jest_bledem() -> None:
    """Scenariusz wyłączający dwa razy ten sam tor opisuje inną sieć niż liczona."""
    topo = _korytarz_dwutorowy().z_wylaczona_galezia_po_id(TOR_A)
    with pytest.raises(ValueError, match="już wyłączona"):
        topo.z_wylaczona_galezia_po_id(TOR_A)


def test_wylaczenie_nieistniejacej_galezi_wymienia_dostepne() -> None:
    """Komunikat ma prowadzić do naprawy scenariusza, nie tylko sygnalizować błąd."""
    topo = _korytarz_dwutorowy()
    with pytest.raises(ValueError, match=TOR_A):
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


def test_zdarzenie_bez_adresu_jest_odrzucane_przy_budowie() -> None:
    """Zdarzenie, które nie wskazuje CZEGO dotyczy, nie ma prawa powstać."""
    with pytest.raises(ValueError, match="wymaga"):
        WylaczenieGalezi(czas_s=1.0)


def test_ybus_po_wylaczeniu_obu_torow_jest_rozpiety() -> None:
    """Kontrola przeciwna: wyłączenie OBU torów faktycznie rozpina korytarz.

    Potrzebna, żeby test wyżej nie przechodził dlatego, że wyłączanie w ogóle
    przestało działać.
    """
    po = _korytarz_dwutorowy().z_wylaczona_galezia_po_id(TOR_A).z_wylaczona_galezia_po_id(TOR_B)
    assert po.zbuduj_ybus()[0, 0] == pytest.approx(0j)
    assert not np.any(po.zbuduj_ybus())


# ---------------------------------------------------------------------------
# §6 — zdarzenia równoczesne i poza horyzontem
# ---------------------------------------------------------------------------


def test_dwa_zdarzenia_w_TEJ_SAMEJ_chwili_wylaczaja_oba_wskazane_tory() -> None:
    """Równoczesność nie może gubić zdarzenia ani zmieniać jego adresu.

    Zdarzenia o identycznym czasie są rozróżnialne WYŁĄCZNIE tożsamością celu —
    gdyby harmonogram sortował je po kolejności dodania i adresował numerem
    pozycji, wynik zależałby od kolejności wpisywania.
    """
    harmonogram = HarmonogramZdarzen(
        [
            WylaczenieGalezi(czas_s=1.0, ident=TOR_B),
            WylaczenieGalezi(czas_s=1.0, ident=TOR_A),
        ]
    )
    w_oknie = harmonogram.do_chwili(0.0, 2.0)
    assert len(w_oknie) == 2
    topo = _korytarz_dwutorowy()
    for zdarzenie in w_oknie:
        topo = zdarzenie.zastosuj(topo)
    assert _zalaczone(topo) == {TOR_A: False, TOR_B: False}

    # ODWROTNA kolejność WPISANIA tych samych dwóch zdarzeń daje TEN SAM skutek.
    odwrotny = HarmonogramZdarzen(
        [
            WylaczenieGalezi(czas_s=1.0, ident=TOR_A),
            WylaczenieGalezi(czas_s=1.0, ident=TOR_B),
        ]
    )
    topo_odwrotna = _korytarz_dwutorowy()
    for zdarzenie in odwrotny.do_chwili(0.0, 2.0):
        topo_odwrotna = zdarzenie.zastosuj(topo_odwrotna)
    assert _zalaczone(topo_odwrotna) == _zalaczone(topo)


def test_zdarzenie_poza_horyzontem_nie_zmienia_topologii() -> None:
    """Zdarzenie zaplanowane po końcu okna obliczeniowego nie może zadziałać.

    Sprawdzamy CHWILE ZADZIAŁANIA harmonogramu, a nie sam fakt istnienia
    zdarzenia: zdarzenie poza horyzontem ma zostać w scenariuszu (jest częścią
    tożsamości biegu), ale nie ma prawa dotknąć modelu.
    """
    harmonogram = HarmonogramZdarzen([WylaczenieGalezi(czas_s=5.0, ident=TOR_A)])
    assert harmonogram.do_chwili(0.0, 2.0) == []
    assert len(harmonogram.do_chwili(0.0, 6.0)) == 1
    # Zdarzenie ZOSTAJE w scenariuszu (jest częścią tożsamości biegu) — sprawdzamy
    # to jawnie, żeby naprawa nie mogła polegać na wycinaniu zdarzeń z harmonogramu.
    assert harmonogram.czasy() == (5.0,)

    topo = _korytarz_dwutorowy()
    for zdarzenie in harmonogram.do_chwili(0.0, 2.0):
        topo = zdarzenie.zastosuj(topo)
    assert _zalaczone(topo) == {TOR_A: True, TOR_B: True}


# ---------------------------------------------------------------------------
# §6 — przeładowanie modelu i serializacja
# ---------------------------------------------------------------------------


def test_tozsamosci_przezywaja_przeladowanie_modelu() -> None:
    """Model zbudowany PONOWNIE z tych samych danych ma te same tożsamości.

    To jest warunek, żeby harmonogram zapisany raz mógł zostać odtworzony:
    scenariusz „wyłącz KABEL-A" ma po przeładowaniu wskazywać ten sam komponent.
    Przy numeracji po kolejności rekordów warunek trzymał się TYLKO wtedy, gdy
    kolejność zapisu i odczytu była identyczna — czego nikt nie gwarantował.
    """
    pierwotna = _korytarz_dwutorowy()
    przeladowana = TopologiaSieci(
        szyny=pierwotna.szyny,
        galezie=[
            Galaz(
                g.od_szyny,
                g.do_szyny,
                r_pu=g.r_pu,
                x_pu=g.x_pu,
                b_poprzeczna_pu=g.b_poprzeczna_pu,
                zalaczona=g.zalaczona,
                ident=g.ident,
            )
            # Odczyt w ODWROTNEJ kolejności — tak, jak może zwrócić baza bez
            # zadeklarowanego porządku.
            for g in reversed(pierwotna.galezie)
        ],
        szyny_sztywne=dict(pierwotna.szyny_sztywne),
    )
    assert set(przeladowana.identy_galezi) == set(pierwotna.identy_galezi)
    zdarzenie = WylaczenieGalezi(czas_s=1.0, ident=TOR_A)
    assert _zalaczone(zdarzenie.zastosuj(przeladowana)) == _zalaczone(zdarzenie.zastosuj(pierwotna))


def test_odcisk_topologii_nie_zalezy_od_kolejnosci_rekordow_galezi() -> None:
    """Ta sama sieć zapisana w innej kolejności to TEN SAM bieg.

    Odcisk topologii wchodzi do tożsamości wyniku. Gdyby zależał od kolejności
    rekordów, ten sam model wczytany dwa razy dawałby DWA różne biegi — a
    porównanie wyników między nimi byłoby porównaniem rzeczy nieporównywalnych.
    """
    from dynamic_lab.tozsamosc import odcisk_topologii

    naturalna = odcisk_topologii(_korytarz_dwutorowy(), s_bazowa_mva=100.0)
    odwrocona = odcisk_topologii(_korytarz_dwutorowy(odwroc=True), s_bazowa_mva=100.0)
    assert naturalna == odwrocona


def test_odcisk_topologii_ROZNICUJE_sieci_o_roznych_galeziach() -> None:
    """DRUGA STRONA PREDYKATU — odcisk niewrażliwy na wszystko byłby bezużyteczny."""
    from dynamic_lab.tozsamosc import odcisk_topologii

    bazowa = _korytarz_dwutorowy()
    zmieniona = TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[
            Galaz("GEN", "SYS", r_pu=0.0, x_pu=X_TORU_PU, ident=TOR_A),
            Galaz("GEN", "SYS", r_pu=0.0, x_pu=X_TORU_PU * 2.0, ident=TOR_B),
        ],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    assert odcisk_topologii(bazowa, s_bazowa_mva=100.0) != odcisk_topologii(
        zmieniona, s_bazowa_mva=100.0
    )


def test_odcisk_topologii_nie_zalezy_od_kolejnosci_bocznikow() -> None:
    """Ta sama klasa defektu co przy gałęziach — boczniki też są sumowane.

    Kolejność boczników nie ma znaczenia fizycznego (``Ybus`` sumuje ich
    admitancje), więc nie może zmieniać tożsamości biegu. Przypadek jest osobny,
    bo naprawa uporządkowania gałęzi nie dotyka listy boczników — i bez tego
    testu druga połowa defektu zostałaby otwarta.
    """
    from dynamic_lab.siec import Bocznik
    from dynamic_lab.tozsamosc import odcisk_topologii

    def topologia(*, odwroc: bool) -> TopologiaSieci:
        boczniki = [
            Bocznik(szyna="GEN", g_pu=0.0, b_pu=0.10, zrodlo="bateria"),
            Bocznik(szyna="SYS", g_pu=0.0, b_pu=0.20, zrodlo="dlawik"),
        ]
        if odwroc:
            boczniki.reverse()
        return TopologiaSieci(
            szyny=("GEN", "SYS"),
            galezie=[Galaz("GEN", "SYS", r_pu=0.0, x_pu=X_TORU_PU, ident=TOR_A)],
            boczniki=boczniki,
            szyny_sztywne={"SYS": complex(1.0, 0.0)},
        )

    assert odcisk_topologii(topologia(odwroc=False), s_bazowa_mva=100.0) == odcisk_topologii(
        topologia(odwroc=True), s_bazowa_mva=100.0
    )
