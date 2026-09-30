"""Odbiory w BIEGU rdzenia: przejscie PQ -> Z pod zwarciem, kanaly, tryby, zdarzenia, odmowy.

UKLAD DWUWEZLOWY (postac zamknieta, wyrocznia bez importow z rdzenia). Szyna sztywna o SEM
`E` za impedancja `Z_s` w wezle S, linia `z_l` S-L, odbior w L. Z bilansu wezla L:

    y E - (y + Y_f) V = conj(S(|V|)) / conj(V) ,    y = 1/(Z_s + z_l)

* galaz impedancyjna (`|V| < U_min`): `V = y E / (y + Y_f + Y_eq)`, `Y_eq = conj(S(U_min))/U_min^2`,
* galaz charakterystyki: rownanie skalarne na modul `|y E| m = |(y + Y_f) m^2 + conj(S(m))|`
  (gorny pierwiastek, `brentq`), kat z `conj(V) = ((y + Y_f) m^2 + conj(S))/(y E)`,
* zwarcie metaliczne: `V = 0` dokladnie, pobor odbioru zero dokladnie.

Iloczyn cech: ksztalt {stala moc, czysty Z, czysty I, mieszany ZIP} x glebokosc {plytka — galaz
charakterystyki, gleboka — galaz impedancyjna, metaliczna} x integrator {trapez, RK4} x krok
{staly, adaptacyjny}.
"""

from __future__ import annotations

import cmath
import dataclasses
import math

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    PunktPracy,
    SilnikDynamiki,
    SkokObciazenia,
    WejscieDynamiki,
    WezelDynamiki,
    ZmianaGalezi,
    ZmianaOdbioru,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.kontrakty import (
    KOD_ODBIOR_CZULY_CZESTOTLIWOSCIOWO,
    KOD_ODBIOR_PONIZEJ_NAPIECIA_PRZEJSCIA,
    KOD_ODBIOR_STALEJ_MOCY_PRZY_ZEROWYM_NAPIECIU,
    KOD_PARAMETRY_ODBIORU_SPRZECZNE,
    CharakterystykaOdbioru,
    OdbiorDynamiki,
    OdmowaDynamiki,
)
from network_model.solvers.dynamika.odbiory import (
    charakterystyka_stalej_mocy,
    charakterystyka_z_wielomianu,
)
from network_model.solvers.dynamika.siec import rozwiaz_algebre, zloz_model_sieci
from network_model.solvers.dynamika.silnik import ZALOZENIA_RDZENIA
from network_model.solvers.dynamika.tozsamosc import odcisk_migawki
from network_model.solvers.dynamika.urzadzenia import zbuduj_szyne_sztywna
from scipy.optimize import brentq

from tests.walidacja_fizyczna import stanowisko

S_B = 100.0
F_B = 50.0
U_N = 15.0
Z_BAZOWA = U_N**2 / S_B
Z_S = complex(0.01, 0.10)
Z_L = complex(0.02, 0.08)
Y = 1.0 / (Z_S + Z_L)
E = complex(1.0, 0.0)
P0 = 0.3
Q0 = 0.1
U_MIN = 0.7
V0 = 1.0
T_ZWARCIA = 0.05
T_USUNIECIA = 0.15

KSZTALTY: dict[str, tuple[float, float, float]] = {
    "stala_moc": (0.0, 0.0, 1.0),
    "czysty_z": (1.0, 0.0, 0.0),
    "czysty_i": (0.0, 1.0, 0.0),
    "mieszany_zip": (0.5, 0.25, 0.25),
}
#: Ksztalty z przejsciem PQ -> Z (odbior czysto impedancyjny nie ma napiecia przejscia —
#: jego charakterystyka JEST impedancja przy kazdym napieciu, `U_min` bylby fantomem).
Z_PRZEJSCIEM: tuple[str, ...] = tuple(sorted(k for k in KSZTALTY if k != "czysty_z"))
#: Glebokosc zwarcia: reaktancja zwarcia [Ohm] (None = metaliczne).
GLEBOKOSCI: dict[str, float | None] = {"plytka": 2.0, "gleboka": 0.05, "metaliczna": None}


# ---------------------------------------------------------------------------
# Wyrocznia (bez importow z rdzenia)
# ---------------------------------------------------------------------------


def _s(ksztalt: str, modul: float, p0: float = P0, q0: float = Q0) -> complex:
    a, b, c = KSZTALTY[ksztalt]
    r = modul / V0
    w = a * r * r + b * r + c
    return complex(p0 * w, q0 * w)


def _s_modelu(ksztalt: str, modul: float, p0: float = P0, q0: float = Q0) -> complex:
    if modul < U_MIN:
        return _s(ksztalt, U_MIN, p0, q0) * (modul / U_MIN) ** 2
    return _s(ksztalt, modul, p0, q0)


def _napiecie_wyroczni(
    ksztalt: str, y_f: complex | None, p0: float = P0, q0: float = Q0
) -> complex:
    if y_f is None:
        return 0j
    y_eq = _s(ksztalt, U_MIN, p0, q0).conjugate() / U_MIN**2
    liniowe = Y * E / (Y + y_f + y_eq)
    if abs(liniowe) < U_MIN:
        return liniowe

    def g(m: float) -> float:
        return abs((Y + y_f) * m * m + _s(ksztalt, m, p0, q0).conjugate()) - abs(Y * E) * m

    siatka = np.linspace(1.5, U_MIN, 3001)
    for gorna, dolna in zip(siatka[:-1], siatka[1:], strict=True):
        if g(gorna) * g(dolna) <= 0.0:
            modul = brentq(g, dolna, gorna, xtol=1e-15, rtol=1e-15)
            sprzezone = ((Y + y_f) * modul * modul + _s(ksztalt, modul, p0, q0).conjugate()) / (
                Y * E
            )
            return sprzezone.conjugate()
    raise AssertionError("Brak pierwiastka w galezi charakterystyki")


def _admitancja_zwarcia(x_f_ohm: float) -> complex:
    return 1.0 / (complex(0.0, x_f_ohm) / Z_BAZOWA)


# ---------------------------------------------------------------------------
# Uklad
# ---------------------------------------------------------------------------


def _charakterystyka(ksztalt: str, u_min: float | None = U_MIN) -> CharakterystykaOdbioru:
    a, b, c = KSZTALTY[ksztalt]
    if ksztalt not in Z_PRZEJSCIEM:
        u_min = None
    return charakterystyka_z_wielomianu(
        a_p=a,
        b_p=b,
        c_p=c,
        a_q=a,
        b_q=b,
        c_q=c,
        v0_pu=V0,
        k_pf=0.0,
        k_qf=0.0,
        f0_hz=F_B,
        u_min_pu=u_min,
    )


def _punkt_pracy(ksztalt: str, p0: float = P0, q0: float = Q0) -> PunktPracy:
    v_l = _napiecie_wyroczni(ksztalt, 0j, p0, q0)
    prad = Y * (E - v_l)
    v_s = E - Z_S * prad
    return PunktPracy({"S": v_s, "L": v_l}, {"SYS": v_s * prad.conjugate()})


def _wejscie(
    ksztalt: str,
    zdarzenia: tuple = (),
    *,
    odbior: OdbiorDynamiki | None = None,
    integrator: str = "trapez_niejawny",
    adaptacyjny: bool = False,
    horyzont_s: float = 0.25,
    linia_na_starcie: bool = True,
) -> WejscieDynamiki:
    odbior = odbior or OdbiorDynamiki("O", "L", P0, Q0, _charakterystyka(ksztalt))
    szyna = zbuduj_szyne_sztywna(
        ident="SYS", wezel="S", s_zwarciowa_mva=S_B, r_pu=Z_S.real, x_pu=Z_S.imag, s_bazowa_mva=S_B
    )
    punkt = (
        _punkt_pracy(ksztalt, odbior.p_pu, odbior.q_pu)
        if linia_na_starcie
        else PunktPracy({"S": E}, {"SYS": 0j})
    )
    return WejscieDynamiki(
        wezly=(WezelDynamiki("S", U_N), WezelDynamiki("L", U_N)),
        galezie=(
            GalazDynamiki("LSL", "S", "L", 1.0 / Z_L, 0.0, 1 + 0j, linia_na_starcie, "linia"),
        ),
        odsprzegi=(),
        odbiory=(odbior,),
        urzadzenia=(szyna,),
        punkt_pracy=punkt,
        harmonogram=HarmonogramDynamiki(tuple(zdarzenia)),
        nastawy=stanowisko.nastawy(
            dt_s=1e-3,
            horyzont_s=horyzont_s,
            krok_wyjscia_s=1e-2,
            integrator=integrator,
            adaptacyjny=adaptacyjny,
        ),
        s_bazowa_mva=S_B,
        f_bazowa_hz=F_B,
    )


def _zwarcie(x_f_ohm: float | None) -> ZwarcieWezla:
    return ZwarcieWezla(
        t_s=T_ZWARCIA,
        wezel="L",
        typ="3F",
        r_f_ohm=0.0,
        x_f_ohm=0.0 if x_f_ohm is None else x_f_ohm,
        t_usuniecia_s=T_USUNIECIA,
        sposob_usuniecia="samoczynne",
    )


def _probki(wynik, klucz: str) -> list:
    return list(wynik.probki[klucz])


def _okno_zwarcia(wynik) -> list[int]:
    return [
        i
        for i, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True))
        if T_ZWARCIA < t < T_USUNIECIA and strona == "C"
    ] + [
        i
        for i, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True))
        if abs(t - T_ZWARCIA) < 1e-12 and strona == "P"
    ]


# ---------------------------------------------------------------------------
# Przejscie PQ -> Z pod zwarciem — iloczyn cech
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("ksztalt", sorted(KSZTALTY))
@pytest.mark.parametrize("glebokosc", sorted(GLEBOKOSCI))
@pytest.mark.parametrize("integrator", ["trapez_niejawny", "rk4_jawny"])
@pytest.mark.parametrize("adaptacyjny", [False, True])
def test_zapad_w_wezle_odbioru_wobec_postaci_zamknietej(
    ksztalt: str, glebokosc: str, integrator: str, adaptacyjny: bool
) -> None:
    x_f = GLEBOKOSCI[glebokosc]
    wynik = SilnikDynamiki(
        _wejscie(ksztalt, (_zwarcie(x_f),), integrator=integrator, adaptacyjny=adaptacyjny)
    ).uruchom()
    y_f = None if x_f is None else _admitancja_zwarcia(x_f)
    wyrocznia = _napiecie_wyroczni(ksztalt, y_f)
    modul = _probki(wynik, "u_pu@L")
    kat = _probki(wynik, "kat_deg@L")
    p = _probki(wynik, "p_pobor_pu@O")
    q = _probki(wynik, "q_pobor_pu@O")
    tryb = _probki(wynik, "tryb_odbioru@O")
    okno = _okno_zwarcia(wynik)
    assert okno
    for i in okno:
        napiecie = modul[i] * cmath.exp(1j * math.radians(kat[i])) if kat[i] is not None else 0j
        assert abs(napiecie - wyrocznia) <= 1e-10
        moc = _s_modelu(ksztalt, modul[i])
        if glebokosc == "metaliczna":
            assert (p[i], q[i], modul[i]) == (0.0, 0.0, 0.0)
        else:
            assert abs(complex(p[i], q[i]) - moc) <= 1e-12 * abs(complex(P0, Q0)) + 1e-12
        if ksztalt in Z_PRZEJSCIEM:
            assert tryb[i] == (1.0 if modul[i] < U_MIN else 0.0)
        else:
            # Czysta impedancja: charakterystyka przy kazdym napieciu (kod 0), takze przy
            # zwarciu metalicznym — bez odmowy, pobor dokladnie zero.
            assert tryb[i] == 0.0
    oczekiwany_tryb = {"plytka": 0.0, "gleboka": 1.0, "metaliczna": 1.0}[glebokosc]
    if ksztalt not in Z_PRZEJSCIEM:
        oczekiwany_tryb = 0.0
    assert {tryb[i] for i in okno} == {oczekiwany_tryb}
    # Po samoczynnym zdjeciu zwarcia wraca gorny pierwiastek punktu pracy.
    przed = _napiecie_wyroczni(ksztalt, 0j)
    assert abs(modul[-1] - abs(przed)) <= 1e-9


@pytest.mark.parametrize("ksztalt", Z_PRZEJSCIEM)
@pytest.mark.parametrize("start", [1.0, 0.3])
def test_newton_zbiega_w_punkcie_dokladnie_u_min_z_obu_stron(ksztalt: str, start: float) -> None:
    """Sonda 4 karty: admitancja zwarcia `Y_f*` dajaca |V| = U_min dokladnie (z wyroczni).

    Funkcja jest polgladka (zalamanie w U_min) — Newton z globalizacja Armijo ma zbiec z
    gory i z dolu bez wygladzania.
    """
    y_eq = _s(ksztalt, U_MIN).conjugate() / U_MIN**2
    skala = brentq(
        lambda s: abs(Y * E / (Y + complex(0.0, -s) + y_eq)) - U_MIN, 0.0, 100.0, xtol=1e-15
    )
    y_f = complex(0.0, -skala)
    wyrocznia = Y * E / (Y + y_f + y_eq)
    assert abs(abs(wyrocznia) - U_MIN) <= 1e-12
    szyna = zbuduj_szyne_sztywna(
        ident="SYS", wezel="S", s_zwarciowa_mva=S_B, r_pu=Z_S.real, x_pu=Z_S.imag, s_bazowa_mva=S_B
    )
    punkt = _punkt_pracy(ksztalt)
    stan = szyna.stan_poczatkowy(punkt.napiecia_pu["S"], punkt.moce_zrodel_pu["SYS"])
    model = zloz_model_sieci(
        (WezelDynamiki("S", U_N), WezelDynamiki("L", U_N)),
        (GalazDynamiki("LSL", "S", "L", 1.0 / Z_L, 0.0, 1 + 0j, True, "linia"),),
        (),
        admitancje_zwarc=(("L", y_f),),
    )
    wynik = rozwiaz_algebre(
        model,
        (OdbiorDynamiki("O", "L", P0, Q0, _charakterystyka(ksztalt)),),
        (szyna,),
        (stan,),
        np.array([punkt.napiecia_pu["S"], complex(start, 0.0)], dtype=complex),
        tolerancja=1e-13,
        max_iteracji=60,
        max_nawrotow=40,
        t_s=0.0,
    )
    assert abs(complex(wynik.napiecia[1]) - wyrocznia) <= 1e-10
    assert wynik.iteracje <= 30


def test_dawna_granica_odmowy_odbioru_stalej_mocy_znika_z_napieciem_przejscia() -> None:
    """Dawna bramka G8 z ZADEKLAROWANYM U_min: kazda glebokosc zapadu — takze metaliczna — to
    BIEG, a pobor odbioru w galezi impedancyjnej jest dokladnie S(U_min)(|V|/U_min)^2.

    Odbior BEZ U_min zachowuje dawna granice (bramka G8 przypina jej ksztalt): to jest ten
    sam model z niezadeklarowanym przejsciem, nie osobna fizyka.
    """
    zadeklarowany = OdbiorDynamiki(
        "ODB1", "GEN", 0.4, 0.0, charakterystyka_stalej_mocy(u_min_pu=0.7)
    )
    for x_f_pu in (0.5, 0.2, 0.1, 0.05, 0.03, 0.0222, 0.01, 0.002, 0.0):
        uklad = stanowisko.zbuduj(odbior_p_pu=0.4)
        uklad["odbiory"] = (zadeklarowany,)
        wynik = stanowisko.uruchom(
            uklad,
            (
                ZwarcieWezla(
                    t_s=0.3,
                    wezel="GEN",
                    typ="3F",
                    r_f_ohm=0.0,
                    x_f_ohm=x_f_pu * stanowisko.Z_BAZOWA_OM,
                    t_usuniecia_s=None,
                    sposob_usuniecia=None,
                ),
            ),
            horyzont_s=0.45,
            dt_s=2.5e-4,
            krok_wyjscia_s=2.5e-4,
        )
        modul = np.array(wynik.probki["u_pu@GEN"], dtype=float)
        p = np.array(wynik.probki["p_pobor_pu@ODB1"], dtype=float)
        assert np.all(np.isfinite(modul))
        pod = modul < 0.7
        assert np.allclose(p[pod], 0.4 * (modul[pod] / 0.7) ** 2, rtol=1e-12, atol=1e-15)
        assert np.allclose(p[~pod], 0.4, rtol=0.0, atol=0.0)


# ---------------------------------------------------------------------------
# Kanaly odbiorow: tryb 2 i 3, pary predykatow, prefiks listy kanalow
# ---------------------------------------------------------------------------


def test_tryb_odbioru_odlaczonego_i_odcietego_parami_ze_stanem_zasilania() -> None:
    """Kod 3 <=> `stan_zasilania@` wezla odbioru = 0 (TEN SAM predykat), kod 2 = odlaczony.

    Wezel L martwy od t = 0 (linia otwarta), zasilany w 0,05 s, odbior odlaczony w 0,1 s
    i zalaczony w 0,15 s, linia otwarta w 0,2 s (odciecie odbioru pobierajacego).
    """
    wejscie = _wejscie(
        "mieszany_zip",
        (
            ZmianaGalezi(0.05, "LSL", True),
            ZmianaOdbioru(0.10, "O", False),
            ZmianaOdbioru(0.15, "O", True),
            ZmianaGalezi(0.20, "LSL", False),
        ),
        linia_na_starcie=False,
    )
    wynik = SilnikDynamiki(wejscie).uruchom()
    tryb = _probki(wynik, "tryb_odbioru@O")
    zasilanie = _probki(wynik, "stan_zasilania@L")
    p = _probki(wynik, "p_pobor_pu@O")
    for kod_trybu, kod_zasilania, moc in zip(tryb, zasilanie, p, strict=True):
        assert (kod_trybu == 3.0) == (kod_zasilania == 0.0)
        if kod_trybu in (2.0, 3.0):
            assert moc == 0.0
    assert {2.0, 3.0, 0.0} <= set(tryb)
    # Odciecie w 0,2 s: „moc sprzed odciecia" = moc POBIERANA w probce L wg charakterystyki.
    (odciecie,) = (z for z in wynik.zdarzenia_wykonane if z.odbiory_odciete)
    ((ident, moc_odcieta),) = odciecie.odbiory_odciete
    indeks_l = next(
        i
        for i, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True))
        if abs(t - 0.20) < 1e-12 and strona == "L"
    )
    modul_l = wynik.probki["u_pu@L"][indeks_l]
    assert ident == "O"
    assert abs(moc_odcieta - _s_modelu("mieszany_zip", modul_l)) <= 1e-12


def test_kanaly_odbiorow_sa_dopisane_za_dawnymi_w_kolejnosci_wejscia() -> None:
    """Dawna lista kanalow jest PREFIKSEM nowej; kanaly odbiorow w kolejnosci wejscia.

    Odbiory o mocy zerowej — punkt pracy jest ten sam z nimi i bez nich (bramka rownowagi
    przechodzi w obu biegach), wiec roznica list kanalow wynika wylacznie z odbiorow.
    """
    odbiory = (
        OdbiorDynamiki("B2", "L", 0.0, 0.0, charakterystyka_stalej_mocy(u_min_pu=None)),
        OdbiorDynamiki("A1", "L", 0.0, 0.0, _charakterystyka("czysty_i")),
    )
    bez = dataclasses.replace(
        _wejscie("stala_moc", horyzont_s=0.02),
        odbiory=(),
        punkt_pracy=_punkt_pracy("stala_moc", 0.0, 0.0),
    )
    z_odbiorami = dataclasses.replace(bez, odbiory=odbiory)
    lista_bez = [kanal.klucz for kanal in SilnikDynamiki(bez).uruchom().kanaly]
    wynik = SilnikDynamiki(z_odbiorami).uruchom()
    lista = [kanal.klucz for kanal in wynik.kanaly]
    assert lista[: len(lista_bez)] == lista_bez
    assert lista[len(lista_bez) :] == [
        "p_pobor_pu@B2",
        "q_pobor_pu@B2",
        "tryb_odbioru@B2",
        "p_pobor_pu@A1",
        "q_pobor_pu@A1",
        "tryb_odbioru@A1",
    ]
    assert {kanal.przestrzen for kanal in wynik.kanaly[len(lista_bez) :]} == {"obserwabla"}


# ---------------------------------------------------------------------------
# Skok obciazenia: zmiana MOCY BAZOWEJ, ta sama charakterystyka
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("ksztalt", sorted(KSZTALTY))
def test_skok_obciazenia_skaluje_baze_charakterystyki(ksztalt: str) -> None:
    wynik = SilnikDynamiki(
        _wejscie(ksztalt, (SkokObciazenia(t_s=0.05, odbior="O", delta_p_pu=0.1, delta_q_pu=-0.05),))
    ).uruchom()
    modul = _probki(wynik, "u_pu@L")
    p = _probki(wynik, "p_pobor_pu@O")
    q = _probki(wynik, "q_pobor_pu@O")
    for i, t in enumerate(wynik.os_czasu_s):
        if t > 0.06:
            moc = _s_modelu(ksztalt, modul[i], P0 + 0.1, Q0 - 0.05)
            assert abs(complex(p[i], q[i]) - moc) <= 1e-12
    assert (
        abs(complex(modul[-1], 0) - abs(_napiecie_wyroczni(ksztalt, 0j, P0 + 0.1, Q0 - 0.05)))
        <= 1e-9
    )


def test_skok_do_ujemnej_mocy_czynnej_bazowej_jest_odmowa_w_chwili_zdarzenia() -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(
            _wejscie(
                "mieszany_zip",
                (SkokObciazenia(t_s=0.05, odbior="O", delta_p_pu=-0.31, delta_q_pu=0.0),),
            )
        ).uruchom()
    assert blad.value.kod == KOD_PARAMETRY_ODBIORU_SPRZECZNE
    assert blad.value.szczegoly["t_s"] == 0.05


# ---------------------------------------------------------------------------
# Odmowy nazwane biegu
# ---------------------------------------------------------------------------


def test_punkt_pracy_ponizej_napiecia_przejscia_jest_odmowa_przed_bramka_rownowagi() -> None:
    v_l = abs(_napiecie_wyroczni("stala_moc", 0j))
    odbior = OdbiorDynamiki("O", "L", P0, Q0, _charakterystyka("stala_moc", u_min=0.99))
    assert v_l < 0.99
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(_wejscie("stala_moc", odbior=odbior)).uruchom()
    assert blad.value.kod == KOD_ODBIOR_PONIZEJ_NAPIECIA_PRZEJSCIA
    assert blad.value.szczegoly["modul_v_pu"] == pytest.approx(v_l, rel=1e-12)


def test_odbior_czuly_czestotliwosciowo_jest_odmowa_biegu() -> None:
    charakterystyka = dataclasses.replace(_charakterystyka("stala_moc"), k_pf=1.0, f0_hz=F_B)
    odbior = OdbiorDynamiki("O", "L", P0, Q0, charakterystyka)
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(_wejscie("stala_moc", odbior=odbior)).uruchom()
    assert blad.value.kod == KOD_ODBIOR_CZULY_CZESTOTLIWOSCIOWO


@pytest.mark.parametrize(
    ("ksztalt", "zadeklarowane"),
    [
        ("stala_moc", False),
        ("stala_moc", True),
        ("czysty_i", False),
        ("czysty_i", True),
        ("mieszany_zip", False),
        ("mieszany_zip", True),
        # Czysta impedancja nie ma napiecia przejscia (fantom), a w V = 0 ma prad zero.
        ("czysty_z", False),
    ],
)
def test_zwarcie_metaliczne_w_wezle_odbioru_odmowa_tylko_bez_napiecia_przejscia(
    ksztalt: str, zadeklarowane: bool
) -> None:
    """Odmowa w wezle zwartym metalicznie <=> prad odbioru nie istnieje w V = 0: skladowa
    stalopradowa albo stalomocowa BEZ zadeklarowanego U_min. Odbior z U_min i odbior czysto
    impedancyjny licza sie bez odmowy z poborem dokladnie zero."""
    odbior = OdbiorDynamiki(
        "O", "L", P0, Q0, _charakterystyka(ksztalt, u_min=U_MIN if zadeklarowane else None)
    )
    wejscie = _wejscie(ksztalt, (_zwarcie(None),), odbior=odbior)
    if zadeklarowane or ksztalt not in Z_PRZEJSCIEM:
        wynik = SilnikDynamiki(wejscie).uruchom()
        assert {wynik.probki["p_pobor_pu@O"][i] for i in _okno_zwarcia(wynik)} == {0.0}
    else:
        with pytest.raises(OdmowaDynamiki) as blad:
            SilnikDynamiki(wejscie).uruchom()
        assert blad.value.kod == KOD_ODBIOR_STALEJ_MOCY_PRZY_ZEROWYM_NAPIECIU


# ---------------------------------------------------------------------------
# Tozsamosc, slad, zalozenia
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "pole",
    [pole.name for pole in dataclasses.fields(CharakterystykaOdbioru)],
)
def test_odcisk_migawki_obejmuje_kazde_pole_charakterystyki(pole: str) -> None:
    """KLASA pkt 4: kazde pole charakterystyki jest w odcisku — dwa odbiory rozne tylko
    wspolczynnikiem ZIP albo U_min mialy przed karta te sama piatke odciskow."""
    bazowa = charakterystyka_z_wielomianu(
        a_p=0.5,
        b_p=0.25,
        c_p=0.25,
        a_q=0.25,
        b_q=0.25,
        c_q=0.5,
        v0_pu=1.0,
        k_pf=1.0,
        k_qf=0.5,
        f0_hz=50.0,
        u_min_pu=0.7,
    )
    zmiany = {
        "a_p": {"a_p": 0.25, "c_p": 0.5},
        "b_p": {"b_p": 0.5, "c_p": 0.0},
        "c_p": {"c_p": 0.5, "a_p": 0.25},
        "a_q": {"a_q": 0.5, "c_q": 0.25},
        "b_q": {"b_q": 0.5, "c_q": 0.25},
        "c_q": {"c_q": 0.25, "a_q": 0.5},
        "v0_pu": {"v0_pu": 1.05},
        "k_pf": {"k_pf": 2.0},
        "k_qf": {"k_qf": 1.5},
        "f0_hz": {"f0_hz": 60.0},
        "u_min_pu": {"u_min_pu": 0.6},
    }
    inna = dataclasses.replace(bazowa, **zmiany[pole])

    def odcisk(charakterystyka: CharakterystykaOdbioru) -> str:
        return odcisk_migawki(
            wezly=(WezelDynamiki("L", U_N),),
            galezie=(),
            odsprzegi=(),
            odbiory=(OdbiorDynamiki("O", "L", P0, Q0, charakterystyka),),
            urzadzenia=(),
        )

    assert odcisk(bazowa) != odcisk(inna)


def test_slad_niesie_sekcje_odbiorow_i_zalozenia_opisuja_model() -> None:
    wynik = SilnikDynamiki(_wejscie("mieszany_zip", horyzont_s=0.02)).uruchom()
    (wpis,) = wynik.slad_white_box["odbiory"]
    v_l = _napiecie_wyroczni("mieszany_zip", 0j)
    moc = _s("mieszany_zip", abs(v_l))
    assert wpis["ident"] == "O" and wpis["u_min_pu"] == U_MIN
    assert wpis["wielomian_p"] == [0.5, 0.25, 0.25]
    assert wpis["tryb_t0"] == 0.0
    assert wpis["moc_w_punkcie_pracy_pu"] == pytest.approx([moc.real, moc.imag], rel=1e-8)
    assert wynik.zalozenia[: len(ZALOZENIA_RDZENIA)] == ZALOZENIA_RDZENIA
    assert any("napięcia przejścia U_min" in zdanie for zdanie in ZALOZENIA_RDZENIA)
