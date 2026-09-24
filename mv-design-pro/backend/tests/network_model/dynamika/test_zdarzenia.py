"""Harmonogram zdarzen: kolejnosc kanoniczna, dokladny czas, odmowy, przemiennosc."""

from __future__ import annotations

import math

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    OdlaczenieZrodla,
    OdmowaDynamiki,
    SilnikDynamiki,
    SkokObciazenia,
    ZmianaGalezi,
    ZwarcieWezla,
    zloz_model_sieci,
)
from network_model.solvers.dynamika.kontrakty import (
    KOD_ZDARZENIE_BEZ_ELEMENTU,
    KOD_ZWARCIE_NIESYMETRYCZNE,
    WezelDynamiki,
)
from network_model.solvers.dynamika.zdarzenia import (
    odbiory_po_zdarzeniach,
    stan_poczatkowy_scenariusza,
    zastosuj,
    zbuduj_harmonogram,
)

from tests.network_model.dynamika.uklady import (
    X_ZWARCIA_OHM,
    X_ZWARCIA_PLYTKIEGO_OHM,
    nastawy,
    zbuduj_smib,
    zbuduj_smib_dwutorowy,
    zbuduj_smib_z_odbiorem,
)


def _buduj(uklad, zdarzenia, horyzont_s: float = 2.0):
    return zbuduj_harmonogram(
        HarmonogramDynamiki(tuple(zdarzenia)),
        wezly=uklad.wezly,
        galezie=uklad.galezie,
        odsprzegi=(),
        odbiory=uklad.odbiory,
        urzadzenia=(uklad.maszyna, uklad.szyna),
        s_bazowa_mva=100.0,
        horyzont_s=horyzont_s,
    )


def test_zwarcie_rozwija_sie_na_zalozenie_i_zdjecie() -> None:
    uklad = zbuduj_smib()
    wpisy = _buduj(
        uklad,
        [
            ZwarcieWezla(
                t_s=0.2,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_OHM,
                t_usuniecia_s=0.35,
                sposob_usuniecia="samoczynne",
            )
        ],
    )
    assert [(wpis.t_s, wpis.rodzaj) for wpis in wpisy] == [
        (0.2, "zwarcie"),
        (0.35, "zdjecie_zwarcia"),
    ]
    assert wpisy[0].admitancja_pu is not None
    assert wpisy[1].admitancja_pu is None


def test_kolejnosc_kanoniczna_jest_stabilna_po_czasie() -> None:
    """Sort STABILNY po `t_s`: remis zachowuje kolejnosc ZAPISU."""
    uklad = zbuduj_smib_dwutorowy()
    wpisy = _buduj(
        uklad,
        [
            ZmianaGalezi(t_s=0.5, galaz="LINIA2", zalaczona=False),
            ZmianaGalezi(t_s=0.1, galaz="LINIA1", zalaczona=False),
            ZmianaGalezi(t_s=0.5, galaz="LINIA1", zalaczona=True),
        ],
    )
    assert [(wpis.t_s, wpis.ref) for wpis in wpisy] == [
        (0.1, "LINIA1"),
        (0.5, "LINIA2"),
        (0.5, "LINIA1"),
    ]


def test_zwarcie_niesymetryczne_jest_odmawiane_nazwanym_kodem() -> None:
    """2F/1F/2FZ wymaga skladowych symetrycznych — odmowa, nie liczenie jak 3F."""
    uklad = zbuduj_smib()
    for typ in ("2F", "1F", "2FZ"):
        with pytest.raises(OdmowaDynamiki) as blad:
            _buduj(
                uklad,
                [
                    ZwarcieWezla(
                        t_s=0.1,
                        wezel="GEN",
                        typ=typ,
                        r_f_ohm=0.0,
                        x_f_ohm=X_ZWARCIA_OHM,
                        t_usuniecia_s=None,
                        sposob_usuniecia=None,
                    )
                ],
            )
        assert blad.value.kod == KOD_ZWARCIE_NIESYMETRYCZNE
        assert blad.value.szczegoly["typ"] == typ


@pytest.mark.parametrize(
    "zdarzenie",
    [
        ZwarcieWezla(
            t_s=0.1,
            wezel="NIE_MA",
            typ="3F",
            r_f_ohm=0.0,
            x_f_ohm=0.1,
            t_usuniecia_s=None,
            sposob_usuniecia=None,
        ),
        ZmianaGalezi(t_s=0.1, galaz="NIE_MA", zalaczona=False),
        OdlaczenieZrodla(t_s=0.1, zrodlo="NIE_MA"),
        SkokObciazenia(t_s=0.1, odbior="NIE_MA", delta_p_pu=0.1, delta_q_pu=0.0),
    ],
)
def test_zdarzenie_bez_elementu_jest_odmawiane(zdarzenie) -> None:
    """Cichy skip zamienialby „wylaczenie X" w „stan normalny" bez sladu."""
    uklad = zbuduj_smib_z_odbiorem()
    with pytest.raises(OdmowaDynamiki) as blad:
        _buduj(uklad, [zdarzenie])
    assert blad.value.kod == KOD_ZDARZENIE_BEZ_ELEMENTU


def test_zdarzenie_poza_horyzontem_jest_odmawiane() -> None:
    uklad = zbuduj_smib()
    with pytest.raises(OdmowaDynamiki) as blad:
        _buduj(uklad, [OdlaczenieZrodla(t_s=5.0, zrodlo="G1")], horyzont_s=1.0)
    assert blad.value.kod == KOD_ZDARZENIE_BEZ_ELEMENTU


def test_zdjecie_zwarcia_poza_horyzontem_jest_odmawiane() -> None:
    """Predykat pary: nie tylko `t_s`, takze `t_usuniecia_s` musi miescic sie w horyzoncie."""
    uklad = zbuduj_smib()
    with pytest.raises(OdmowaDynamiki) as blad:
        _buduj(
            uklad,
            [
                ZwarcieWezla(
                    t_s=0.5,
                    wezel="GEN",
                    typ="3F",
                    r_f_ohm=0.0,
                    x_f_ohm=X_ZWARCIA_OHM,
                    t_usuniecia_s=3.0,
                    sposob_usuniecia="samoczynne",
                )
            ],
            horyzont_s=1.0,
        )
    assert blad.value.kod == KOD_ZDARZENIE_BEZ_ELEMENTU


def test_zwarcie_zalozone_i_zdjete_wraca_do_stanu_wyjsciowego() -> None:
    """Predykaty PARY z jednego zrodla prawdy: zdjecie usuwa DOKLADNIE ten wpis."""
    uklad = zbuduj_smib()
    wpisy = _buduj(
        uklad,
        [
            ZwarcieWezla(
                t_s=0.1,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_OHM,
                t_usuniecia_s=0.2,
                sposob_usuniecia="samoczynne",
            )
        ],
    )
    stan = stan_poczatkowy_scenariusza(uklad.galezie, (), uklad.odbiory)
    po_zalozeniu = zastosuj(wpisy[0], stan)
    assert po_zalozeniu.admitancje_zwarc != ()
    po_zdjeciu = zastosuj(wpisy[1], po_zalozeniu)
    assert po_zdjeciu == stan


def test_skoki_obciazenia_sumuja_sie() -> None:
    uklad = zbuduj_smib_z_odbiorem(p_odbioru_pu=0.2)
    wpisy = _buduj(
        uklad,
        [
            SkokObciazenia(t_s=0.1, odbior="ODB1", delta_p_pu=0.1, delta_q_pu=0.05),
            SkokObciazenia(t_s=0.2, odbior="ODB1", delta_p_pu=-0.3, delta_q_pu=0.0),
        ],
    )
    stan = stan_poczatkowy_scenariusza(uklad.galezie, (), uklad.odbiory)
    for wpis in wpisy:
        stan = zastosuj(wpis, stan)
    odbiory = odbiory_po_zdarzeniach(uklad.odbiory, stan)
    assert odbiory[0].p_pu == pytest.approx(0.0)
    assert odbiory[0].q_pu == pytest.approx(0.05)


def test_zdarzenie_wykonuje_sie_w_DOKLADNEJ_chwili_nie_na_siatce_kroku() -> None:
    """Chwila zdarzenia nie lezy na siatce kroku — krok MUSI zostac skrocony.

    `dt = 10 ms`, zwarcie w `t = 0,123 s`: gdyby krok nie byl skracany, zdarzenie
    wypadloby w `0,13 s` i czas krytyczny mialby rozdzielczosc kroku.
    """
    uklad = zbuduj_smib()
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.123,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_PLYTKIEGO_OHM,
                t_usuniecia_s=0.247,
                sposob_usuniecia="samoczynne",
            ),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.01, horyzont_s=0.5, krok_wyjscia_s=0.05))
    ).uruchom()
    czasy = [(zdarzenie.rodzaj, zdarzenie.t_wykonany_s) for zdarzenie in wynik.zdarzenia_wykonane]
    assert czasy == [("zwarcie", 0.123), ("zdjecie_zwarcia", 0.247)]
    assert all(
        zdarzenie.t_wykonany_s == zdarzenie.t_zaplanowany_s
        for zdarzenie in wynik.zdarzenia_wykonane
    )


def test_wylaczenie_toru_zmienia_ybus_i_przebieg() -> None:
    """Zdarzenie galeziowe naprawde zmienia siec (nie tylko wpis w wyniku)."""
    uklad = zbuduj_smib_dwutorowy()
    harmonogram = HarmonogramDynamiki((ZmianaGalezi(t_s=0.2, galaz="LINIA2", zalaczona=False),))
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=1.0, krok_wyjscia_s=0.01))
    ).uruchom()
    delty = np.array(wynik.probki["delta_rad@G1"])
    przed = delty[: int(0.2 / 0.01)]
    po = delty[int(0.2 / 0.01) :]
    assert float(np.ptp(przed)) < 1e-12
    assert float(np.ptp(po)) > 0.05
    assert [zdarzenie.rodzaj for zdarzenie in wynik.zdarzenia_wykonane] == ["wylaczenie_galezi"]


def test_zalaczenie_toru_przywraca_topologie() -> None:
    uklad = zbuduj_smib_dwutorowy()
    model_pelny = zloz_model_sieci(uklad.wezly, uklad.galezie, ())
    harmonogram = HarmonogramDynamiki(
        (
            ZmianaGalezi(t_s=0.1, galaz="LINIA2", zalaczona=False),
            ZmianaGalezi(t_s=0.4, galaz="LINIA2", zalaczona=True),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=1.0, krok_wyjscia_s=0.01))
    ).uruchom()
    assert [zdarzenie.rodzaj for zdarzenie in wynik.zdarzenia_wykonane] == [
        "wylaczenie_galezi",
        "zalaczenie_galezi",
    ]
    slad_sieci = wynik.slad_white_box["siec"]
    assert slad_sieci["liczba_galezi_aktywnych"] == len(model_pelny.galezie_aktywne)


def test_odlaczenie_zrodla_zeruje_jego_moc_a_nie_stan() -> None:
    """Odlaczone zrodlo znika z bilansu sieci, ale nadal ma wlasna dynamike."""
    uklad = zbuduj_smib()
    harmonogram = HarmonogramDynamiki((OdlaczenieZrodla(t_s=0.2, zrodlo="G1"),))
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=0.6, krok_wyjscia_s=0.01))
    ).uruchom()
    indeks = int(0.3 / 0.01)
    assert wynik.probki["p_pu@G1"][indeks] == pytest.approx(0.0, abs=1e-12)
    predkosci = np.array(wynik.probki["omega_pu@G1"])
    assert predkosci[-1] > predkosci[indeks] > 1.0


def test_zdarzenia_rownoczesne_dziela_jeden_pomiar_chwili() -> None:
    """Dwa zdarzenia w tej samej chwili: JEDNA re-inicjalizacja, ten sam pomiar."""
    uklad = zbuduj_smib_dwutorowy()
    harmonogram = HarmonogramDynamiki(
        (
            ZmianaGalezi(t_s=0.2, galaz="LINIA2", zalaczona=False),
            ZwarcieWezla(
                t_s=0.2,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_PLYTKIEGO_OHM,
                t_usuniecia_s=None,
                sposob_usuniecia=None,
            ),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=0.6, krok_wyjscia_s=0.01))
    ).uruchom()
    assert len(wynik.zdarzenia_wykonane) == 2
    pierwsze, drugie = wynik.zdarzenia_wykonane
    assert pierwsze.t_wykonany_s == drugie.t_wykonany_s == 0.2
    assert pierwsze.delta_y_max == drugie.delta_y_max
    assert pierwsze.residuum_kcl_max == drugie.residuum_kcl_max


def test_permutacja_zdarzen_rownoczesnych_nie_zmienia_wyniku() -> None:
    """Niezmienniczosc wobec kolejnosci ZAPISU dla zdarzen rownoczesnych.

    To jest wlasnosc PRZEMIENNOSCI samych operacji (wylaczenie toru i zalozenie
    zwarcia dzialaja na rozlacznych czesciach stanu scenariusza) — zmierzona, a
    nie postulowana.
    """
    uklad = zbuduj_smib_dwutorowy()
    galaz = ZmianaGalezi(t_s=0.2, galaz="LINIA2", zalaczona=False)
    zwarcie = ZwarcieWezla(
        t_s=0.2,
        wezel="GEN",
        typ="3F",
        r_f_ohm=0.0,
        x_f_ohm=X_ZWARCIA_PLYTKIEGO_OHM,
        t_usuniecia_s=0.3,
        sposob_usuniecia="samoczynne",
    )
    przebiegi = []
    for kolejnosc in ((galaz, zwarcie), (zwarcie, galaz)):
        wynik = SilnikDynamiki(
            uklad.wejscie(
                HarmonogramDynamiki(kolejnosc),
                nastawy(dt_s=0.002, horyzont_s=0.8, krok_wyjscia_s=0.01),
            )
        ).uruchom()
        przebiegi.append(np.array(wynik.probki["delta_rad@G1"]))
    assert np.array_equal(przebiegi[0], przebiegi[1])


#: Czasy zdjecia zwarcia jako ILOCZYN CECH osi czasu (klasa defektu „cichy skip"):
#: (a) wartosc literalna lezaca na siatce probek, (b) ta sama chwila powstala z
#: DODAWANIA (`0,1 + 0,05` = 0,15000000000000002 != 15 * 0,01 = 0,15), (c) chwila
#: miedzy probkami, (d) chwila tuz przed probka, (e) chwila tuz po probce,
#: (f) chwila rowna horyzontowi.
CZASY_ZDJECIA = (
    0.15,
    0.1 + 0.05,
    0.1 + 0.2,
    0.137,
    0.15 - 1e-9,
    0.15 + 1e-9,
    0.3 - 1e-13,
)


@pytest.mark.parametrize("t_usuniecia_s", CZASY_ZDJECIA)
def test_zdarzenie_wykonuje_sie_niezaleznie_od_reprezentacji_chwili(
    t_usuniecia_s: float,
) -> None:
    """KAZDE zdarzenie w horyzoncie MUSI sie wykonac — takze gdy jego czas rozni
    sie od chwili probki o ostatni bit.

    KLASA DEFEKTU (pomiar 2026-09-17): `0,1 + 0,05` to `0,15000000000000002`, a
    `15 * 0,01` to `0,15`. Silnik szedl do chwili probki, nie znajdowal wpisu przez
    rownosc bitowa, a potem odrzucal go warunkiem „pozniej niz teraz" — zdjecie
    zwarcia NIE WYKONYWALO SIE NIGDY i maszyna „tracila synchronizm" (kat 63,5 rad
    zamiast 0,64 rad). Test obejmuje iloczyn cech osi czasu, a nie jeden przypadek.
    """
    uklad = zbuduj_smib()
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.1,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_OHM,
                t_usuniecia_s=t_usuniecia_s,
                sposob_usuniecia=None if t_usuniecia_s is None else "samoczynne",
            ),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=1.0, krok_wyjscia_s=0.01))
    ).uruchom()
    assert [zdarzenie.rodzaj for zdarzenie in wynik.zdarzenia_wykonane] == [
        "zwarcie",
        "zdjecie_zwarcia",
    ]
    zdjecie = wynik.zdarzenia_wykonane[1]
    assert zdjecie.t_zaplanowany_s == pytest.approx(t_usuniecia_s, abs=1e-15)
    assert zdjecie.t_wykonany_s == pytest.approx(t_usuniecia_s, abs=1e-9)
    # Zwarcie NIEZDJETE daje ucieczke wirnika (zmierzone 63,5 rad); zwarcie zdjete
    # zostawia kat pod katem krytycznym utraty synchronizmu. Prog `pi` rozdziela
    # oba przypadki o dwa rzedy wielkosci, wiec nie jest strojony pod jeden czas.
    assert max(wynik.probki["delta_rad@G1"]) < math.pi, "zwarcie nie zostalo zdjete"


def test_zdarzenie_w_chwili_horyzontu_tez_sie_wykonuje() -> None:
    """Zdarzenie na samym koncu horyzontu nie moze wypasc poza petle czasu."""
    uklad = zbuduj_smib()
    harmonogram = HarmonogramDynamiki((OdlaczenieZrodla(t_s=0.5, zrodlo="G1"),))
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=0.5, krok_wyjscia_s=0.05))
    ).uruchom()
    assert [zdarzenie.rodzaj for zdarzenie in wynik.zdarzenia_wykonane] == ["odlaczenie_zrodla"]
    assert wynik.zdarzenia_wykonane[0].t_wykonany_s == 0.5


def test_zwarcie_metaliczne_idzie_wierszem_ograniczenia_a_nie_admitancja() -> None:
    """Zwarcie o zerowej impedancji: wpis BEZ admitancji i wezel w `zwarcia_metaliczne`.

    PRZEPISANY ŚWIADOMIE (karta AB-1b.1 §0 pkt 3). Dawna wersja przypinala odmowe
    `dynamika.zwarcie_metaliczne_bez_admitancji` — zabezpieczenie przed golym
    `ZeroDivisionError` (KOREKTA 2026-09-18, bramka SO-1A: kontrakt danych przyjmuje
    `r_f_ohm = x_f_ohm = 0`, wiec projektant mogl dostac blad 500). Intencja
    ZACHOWANA i wzmocniona: zadna sciezka nie dzieli przez zero — zwarcie metaliczne
    nie przechodzi przez `admitancja_zwarcia_pu`, tylko przez wiersz ograniczenia
    `V = 0` (IEC 60909 definiuje zwarcie bezimpedancyjne; „bardzo duza admitancja"
    bylaby fabrykacja). Bieg z takim zwarciem: `test_obszary_beznapieciowe.py`.
    """
    harmonogram = HarmonogramDynamiki(
        zdarzenia=(
            ZwarcieWezla(
                t_s=0.1,
                wezel="szyna",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=0.0,
                t_usuniecia_s=0.2,
                sposob_usuniecia="samoczynne",
            ),
        )
    )
    wpisy = zbuduj_harmonogram(
        harmonogram,
        wezly=(WezelDynamiki(ident="szyna", u_n_kv=15.0),),
        galezie=(),
        odsprzegi=(),
        odbiory=(),
        urzadzenia=(),
        s_bazowa_mva=100.0,
        horyzont_s=1.0,
    )
    assert [(wpis.rodzaj, wpis.admitancja_pu) for wpis in wpisy] == [
        ("zwarcie", None),
        ("zdjecie_zwarcia", None),
    ]
    stan = stan_poczatkowy_scenariusza((), (), ())
    po_zalozeniu = zastosuj(wpisy[0], stan)
    assert po_zalozeniu.zwarcia_metaliczne == frozenset({"szyna"})
    assert po_zalozeniu.admitancje_zwarc == ()
    # Para zalozenie/zdjecie z jednego zrodla prawdy: stan wraca DOKLADNIE do wyjsciowego.
    assert zastosuj(wpisy[1], po_zalozeniu) == stan


def test_zwarcie_o_niezerowej_impedancji_przechodzi_ta_sama_sciezka() -> None:
    """Predykat parami: warunek WEJSCIA (odmowa) i WYJSCIA (admitancja) z jednego
    zrodla — niezerowa impedancja ma dawac skonczona admitancje, nie druga odmowe."""
    harmonogram = HarmonogramDynamiki(
        zdarzenia=(
            ZwarcieWezla(
                t_s=0.1,
                wezel="szyna",
                typ="3F",
                r_f_ohm=0.5,
                x_f_ohm=0.0,
                t_usuniecia_s=None,
                sposob_usuniecia=None,
            ),
        )
    )
    wpisy = zbuduj_harmonogram(
        harmonogram,
        wezly=(WezelDynamiki(ident="szyna", u_n_kv=15.0),),
        galezie=(),
        odsprzegi=(),
        odbiory=(),
        urzadzenia=(),
        s_bazowa_mva=100.0,
        horyzont_s=1.0,
    )
    assert len(wpisy) == 1
    assert wpisy[0].admitancja_pu is not None
    assert abs(wpisy[0].admitancja_pu) == pytest.approx(15.0**2 / 100.0 / 0.5)
