"""Obszar beznapieciowy i wiersz ograniczenia napiecia (karta AB-1b.1, P3, twierdzenie D-16).

CO SIE ZMIENILO. Wyspa, w ktorej ZADNE urzadzenie nie wnosi nic do algebry (ani pradu,
ani pochodnej pradu po napieciu), konczyla bieg odmowa `dynamika.reinicjalizacja_
niezbiezna` (przyczyna `dynamika.wyspa_bez_zrodla`), a izolowany wezel bez bocznika —
osobliwym jakobianem. Fizycznie taki obszar jest ODCIETY: V = 0 dokladnie, odbiory bez
zamknietego obwodu nie pobieraja pradu, a bieg trwa. Rdzen reprezentuje to JEDNYM
mechanizmem wiersza ograniczenia (`V_k - E_k(x) = 0` zamiast KCL), wspolnym dla:

* wezla obszaru beznapieciowego (`E = 0`),
* zwarcia metalicznego w wezle (`E = 0`, `R_f = X_f = 0`),
* urzadzenia o sprzezeniu napieciowym (`E = E(x)`, np. idealne zrodlo testowe).

Odmowa na poziomie ALGEBRY (`rozwiaz_algebre` -> `sprawdz_zasilanie_wysp`, bramka G13,
twierdzenie D-07) zostaje bez zmian — silnik nie podaje algebrze obszarow odcietych.

ILOCZYN CECH (CLAUDE.md „KLASA, NIE INSTANCJA" p. 2): {obszar z odbiorem, bez odbioru} x
{z urzadzeniem odlaczonym, bez urzadzen} x {z odsprzegiem, bez — wezel bez bocznika} x
{samo powstanie obszaru, powstanie i ponowne zasilenie} x {trapez, RK4} x {krok staly,
adaptacyjny} = 64 biegi; do tego wiersz ograniczenia x {odbior PQ, GFL, maszyna} w wezle
zwartym metalicznie oraz urzadzenie o sprzezeniu napieciowym (atrapa zrodla o SEM
liniowej w czasie — calkowanej przez trapez BEZ bledu dyskretyzacji).
"""

from __future__ import annotations

import cmath
import dataclasses
import itertools
from typing import Any, ClassVar

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    OdlaczenieZrodla,
    OdmowaDynamiki,
    OdsprzegDynamiki,
    PunktPracy,
    SilnikDynamiki,
    WejscieDynamiki,
    WezelDynamiki,
    ZmianaGalezi,
    ZwarcieWezla,
    zloz_model_sieci,
)
from network_model.solvers.dynamika.calkowanie import KontekstKroku, _jakobian_sprzezony
from network_model.solvers.dynamika.kontrakty import (
    KOD_NAPIECIE_NARZUCONE_SPRZECZNE,
    KOD_ODBIOR_STALEJ_MOCY_PRZY_ZEROWYM_NAPIECIU,
    KOD_WARTOSC_NIESKONCZONA,
)
from network_model.solvers.dynamika.obserwable import JAKOSC_NIEDOSTEPNA
from network_model.solvers.dynamika.odbiory import charakterystyka_stalej_mocy
from network_model.solvers.dynamika.siec import (
    prad_wezla_ograniczonego,
    residuum_algebry,
)
from network_model.solvers.dynamika.siec import (
    zloz_model_sieci as _zloz,
)
from network_model.solvers.dynamika.urzadzenia import zbuduj_maszyne_klasyczna

from tests.network_model.dynamika import biblioteka_urzadzen as biblioteka
from tests.network_model.dynamika import uklady

#: Odbior STALEJ MOCY bez zadeklarowanego napiecia przejscia (karta modeli odbiorow):
#: dokladnie dotychczasowy model tego wzorca — charakterystyka przy kazdym |V| > 0.
STALA_MOC = charakterystyka_stalej_mocy(u_min_pu=None)


def _indeks_probki_p(wynik, t_s: float) -> int:
    """Indeks probki `P` chwili zdarzenia (stan po zdarzeniu; `L` stoi tuz przed nia).

    Os czasu ma w chwili zdarzenia DWIE probki (karta AB-1b.1 par. 0 pkt 6), wiec
    `os_czasu_s.index(t)` wskazaloby probke `L` — strona jest tu wybierana jawnie.
    """
    return next(
        i
        for i, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True))
        if t == t_s and strona == "P"
    )


T_ODCIECIA_S = 0.05
T_ZASILENIA_S = 0.12
Y_LINII_B = 1.0 / complex(0.02, 0.1)


def _v_b(y_bb: complex, y_bg: complex, v_gen: complex, s_netto: complex) -> complex:
    """Napiecie wezla B z jednej rownosci KCL (iteracja prosta do zbieznosci maszynowej).

    `y_bb V + y_bg V_gen = -conj(S_netto)/conj(V)` — lekki odbior, wiec odwzorowanie jest
    zwezajace; to NIE jest wyrocznia (ta zyje w `walidacja_fizyczna`), tylko dokladny
    punkt pracy fikstury, ktory bramka rownowagi silnika sprawdzi do `eps_init`.
    """
    v = v_gen
    for _ in range(200):
        nowe = (-s_netto.conjugate() / v.conjugate() - y_bg * v_gen) / y_bb
        if abs(nowe - v) == 0.0:
            break
        v = nowe
    return v


def _uklad(*, odbior: bool, urzadzenie: bool, odsprzeg: bool, b_linii: float) -> dict[str, Any]:
    smib = uklady.zbuduj_smib()
    wezly = (*smib.wezly, WezelDynamiki("B", uklady.U_N_KV))
    galezie = (
        *smib.galezie,
        GalazDynamiki("LB", "GEN", "B", Y_LINII_B, b_linii, 1 + 0j, True, "linia"),
    )
    odsprzegi = (OdsprzegDynamiki("BAT_B", "B", 0.0, 0.01, True),) if odsprzeg else ()
    odbiory = (
        (OdbiorDynamiki("ODB_B", "B", 0.1, 0.02, charakterystyka=STALA_MOC),) if odbior else ()
    )
    model = zloz_model_sieci(wezly, galezie, odsprzegi)
    y = model.ybus.toarray()
    ig, is_, ib = (model.indeks_wezla[w] for w in ("GEN", "SYS", "B"))
    v_gen = smib.punkt_pracy.napiecia_pu["GEN"]
    v_sys = smib.punkt_pracy.napiecia_pu["SYS"]
    s_g2 = complex(0.05, 0.01) if urzadzenie else 0j
    s_odb = complex(0.1, 0.02) if odbior else 0j
    v_b = _v_b(y[ib, ib], y[ib, ig], v_gen, s_odb - s_g2)
    v = np.zeros(3, dtype=complex)
    v[ig], v[is_], v[ib] = v_gen, v_sys, v_b
    prady = y @ v
    urzadzenia: list[Any] = [smib.maszyna, smib.szyna]
    moce = {"G1": v_gen * prady[ig].conjugate(), "SYS1": v_sys * prady[is_].conjugate()}
    if urzadzenie:
        urzadzenia.append(
            zbuduj_maszyne_klasyczna(
                ident="G2",
                wezel="B",
                s_n_mva=10.0,
                h_s=2.0,
                d_pu=1.0,
                x_prim_pu=0.25,
                ra_pu=0.0,
                s_bazowa_mva=uklady.S_BAZOWA_MVA,
                f_bazowa_hz=uklady.F_BAZOWA_HZ,
            )
        )
        moce["G2"] = s_g2
    return {
        "wezly": wezly,
        "galezie": galezie,
        "odsprzegi": odsprzegi,
        "odbiory": odbiory,
        "urzadzenia": tuple(urzadzenia),
        "punkt": PunktPracy({"GEN": v_gen, "SYS": v_sys, "B": v_b}, moce),
    }


def _bieg(uklad: dict[str, Any], zdarzenia: tuple[Any, ...], nastawy: Any):
    return SilnikDynamiki(
        WejscieDynamiki(
            wezly=uklad["wezly"],
            galezie=uklad["galezie"],
            odsprzegi=uklad["odsprzegi"],
            odbiory=uklad["odbiory"],
            urzadzenia=uklad["urzadzenia"],
            punkt_pracy=uklad["punkt"],
            harmonogram=HarmonogramDynamiki(zdarzenia),
            nastawy=nastawy,
            s_bazowa_mva=uklady.S_BAZOWA_MVA,
            f_bazowa_hz=uklady.F_BAZOWA_HZ,
        )
    ).uruchom()


def _nastawy(integrator: str, adaptacyjny: bool, horyzont_s: float):
    dt = 0.001 if integrator == "rk4_jawny" else 0.002
    return uklady.nastawy(
        dt_s=dt,
        horyzont_s=horyzont_s,
        krok_wyjscia_s=0.01,
        integrator=integrator,
        dt_min_s=dt / 8.0 if adaptacyjny else None,
        dt_max_s=dt * 2.0 if adaptacyjny else None,
    )


ILOCZYN = list(
    itertools.product(
        (True, False),  # odbior w obszarze
        (True, False),  # urzadzenie (odlaczane razem z otwarciem)
        (True, False),  # odsprzeg w obszarze
        (False, True),  # ponowne zasilenie
        ("trapez_niejawny", "rk4_jawny"),
        (False, True),  # krok adaptacyjny
    )
)


@pytest.mark.parametrize(
    ("odbior", "urzadzenie", "odsprzeg", "zasilenie", "integrator", "adaptacyjny"),
    ILOCZYN,
    ids=[
        f"odb{int(a)}-urz{int(b)}-bat{int(c)}-zas{int(d)}-{e[:4]}-{'ad' if f else 'st'}"
        for a, b, c, d, e, f in ILOCZYN
    ],
)
def test_obszar_beznapieciowy_iloczyn_cech(
    odbior: bool,
    urzadzenie: bool,
    odsprzeg: bool,
    zasilenie: bool,
    integrator: str,
    adaptacyjny: bool,
) -> None:
    uklad = _uklad(odbior=odbior, urzadzenie=urzadzenie, odsprzeg=odsprzeg, b_linii=0.0)
    zdarzenia: list[Any] = [ZmianaGalezi(T_ODCIECIA_S, "LB", False)]
    if urzadzenie:
        zdarzenia.append(OdlaczenieZrodla(T_ODCIECIA_S, "G2"))
    if zasilenie:
        zdarzenia.append(ZmianaGalezi(T_ZASILENIA_S, "LB", True))
    wynik = _bieg(uklad, tuple(zdarzenia), _nastawy(integrator, adaptacyjny, 0.2))

    czas = wynik.os_czasu_s
    strony = wynik.strona_probki

    def po_zdarzeniu(i: int, t_zdarzenia: float) -> bool:
        # Strona probki rozstrzyga w chwili zdarzenia: `L` przed nim, `P` po nim.
        return czas[i] > t_zdarzenia or (czas[i] == t_zdarzenia and strony[i] == "P")

    w_obszarze = [
        i
        for i in range(len(czas))
        if po_zdarzeniu(i, T_ODCIECIA_S) and not (zasilenie and po_zdarzeniu(i, T_ZASILENIA_S))
    ]
    assert w_obszarze, "fikstura bez probek w oknie odciecia nie sprawdzilaby niczego"
    for i in w_obszarze:
        assert wynik.probki["u_pu@B"][i] == 0.0, f"t={czas[i]}: V w obszarze odcietym != 0"
        # Wezel bez napiecia ma czestotliwosc niedostepna z WLASNA przyczyna (kod 4 w probce
        # siatki, kod 3 w chwili zdarzenia) — nigdy liczba.
        assert wynik.probki["f_hz@B"][i] is None
        # Brak zatrucia: wezly zywe nie dostaja stanu „nieokreslona numerycznie", gdy B ma
        # V = 0; w probkach siatki ich czestotliwosc jest liczba.
        for wezel in ("GEN", "SYS"):
            assert wynik.probki[f"jakosc_f@{wezel}"][i] != JAKOSC_NIEDOSTEPNA
            if strony[i] == "C":
                assert wynik.probki[f"f_hz@{wezel}"][i] is not None
    zdarzenie_odciecia = next(z for z in wynik.zdarzenia_wykonane if z.t_wykonany_s == T_ODCIECIA_S)
    assert zdarzenie_odciecia.obszary_odciete == ("B",)
    if odbior:
        ((ident, moc),) = zdarzenie_odciecia.odbiory_odciete
        assert ident == "ODB_B" and moc == complex(0.1, 0.02)
    else:
        assert zdarzenie_odciecia.odbiory_odciete == ()
    if zasilenie:
        zdarzenie_zasilenia = next(
            z for z in wynik.zdarzenia_wykonane if z.t_wykonany_s == T_ZASILENIA_S
        )
        assert zdarzenie_zasilenia.obszary_zasilone_ponownie == ("B",)
        po = [i for i in range(len(czas)) if po_zdarzeniu(i, T_ZASILENIA_S)]
        assert all(wynik.probki["u_pu@B"][i] > 0.5 for i in po)
    assert wynik.wlasnosci.max_residuum_g < 1e-8


def test_wezel_izolowany_bez_bocznika_nie_konczy_sie_osobliwym_jakobianem() -> None:
    """Dzis (przed karta): `dynamika.algebra_niezbiezna` z osobliwego jakobianu."""
    uklad = _uklad(odbior=False, urzadzenie=False, odsprzeg=False, b_linii=0.0)
    wynik = _bieg(
        uklad,
        (ZmianaGalezi(T_ODCIECIA_S, "LB", False),),
        _nastawy("trapez_niejawny", False, 0.1),
    )
    assert wynik.probki["u_pu@B"][-1] == 0.0


def test_obszar_martwy_od_t0_przyjety_gdy_punkt_pracy_go_nie_obejmuje() -> None:
    """Wezel nierozwiazany przez rozplyw jest dopuszczalny WYLACZNIE jako obszar martwy t = 0."""
    uklad = _uklad(odbior=True, urzadzenie=False, odsprzeg=False, b_linii=0.0)
    galezie = tuple(
        dataclasses.replace(g, aktywna_na_starcie=False) if g.ident == "LB" else g
        for g in uklad["galezie"]
    )
    smib = uklady.zbuduj_smib()
    punkt = PunktPracy(
        {w: v for w, v in uklad["punkt"].napiecia_pu.items() if w != "B"},
        dict(smib.punkt_pracy.moce_zrodel_pu),
    )
    wynik = _bieg(
        {**uklad, "galezie": galezie, "punkt": punkt},
        (ZmianaGalezi(T_ZASILENIA_S, "LB", True),),
        _nastawy("trapez_niejawny", False, 0.2),
    )
    i = _indeks_probki_p(wynik, T_ZASILENIA_S)
    assert all(v == 0.0 for v in wynik.probki["u_pu@B"][:i])
    assert wynik.probki["u_pu@B"][-1] > 0.5
    assert wynik.slad_white_box["inicjalizacja"]["wezly_beznapieciowe"] == ["B"]


def test_wezel_bez_napiecia_w_punkcie_pracy_w_wyspie_ZYWEJ_jest_odmowa() -> None:
    """Brak napiecia wezla zasilanego to nadal odmowa `punkt_pracy_napiecie_missing`."""
    uklad = _uklad(odbior=True, urzadzenie=False, odsprzeg=False, b_linii=0.0)
    punkt = PunktPracy(
        {w: v for w, v in uklad["punkt"].napiecia_pu.items() if w != "B"},
        dict(uklad["punkt"].moce_zrodel_pu),
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg({**uklad, "punkt": punkt}, (), _nastawy("trapez_niejawny", False, 0.05))
    assert blad.value.kod == "dynamika.punkt_pracy_napiecie_missing"


# --------------------------------------------------------------------------- zwarcie metaliczne
def _zwarcie_metaliczne(t_usuniecia: float | None) -> ZwarcieWezla:
    return ZwarcieWezla(
        t_s=T_ODCIECIA_S,
        wezel="GEN",
        typ="3F",
        r_f_ohm=0.0,
        x_f_ohm=0.0,
        t_usuniecia_s=t_usuniecia,
        sposob_usuniecia=None if t_usuniecia is None else "samoczynne",
    )


def test_zwarcie_metaliczne_przy_maszynie_liczy_sie_z_V_rownym_zero() -> None:
    smib = uklady.zbuduj_smib()
    wynik = SilnikDynamiki(
        smib.wejscie(
            HarmonogramDynamiki((_zwarcie_metaliczne(0.1),)),
            uklady.nastawy(dt_s=0.001, horyzont_s=0.2, krok_wyjscia_s=0.01),
        )
    ).uruchom()
    czas, strony = wynik.os_czasu_s, wynik.strona_probki
    w_zwarciu = [
        i
        for i, (t, strona) in enumerate(zip(czas, strony, strict=True))
        # Okno zwarcia po STRONIE probki: od `P` chwili zwarcia do `L` chwili zdjecia.
        if (T_ODCIECIA_S < t < 0.1)
        or (t == T_ODCIECIA_S and strona == "P")
        or (t == 0.1 and strona == "L")
    ]
    assert len(w_zwarciu) >= 3
    for i in w_zwarciu:
        assert wynik.probki["u_pu@GEN"][i] == 0.0
        # Maszyna oddaje prad (E - 0) y, ale moc CZYNNA przy V = 0 jest zerowa.
        assert wynik.probki["p_pu@G1"][i] == 0.0
    assert wynik.probki["u_pu@GEN"][-1] > 0.5


def test_odbior_stalej_mocy_w_wezle_zwartym_metalicznie_to_odmowa_nazwana() -> None:
    uklad = uklady.zbuduj_smib_z_odbiorem()
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(
            uklad.wejscie(
                HarmonogramDynamiki((_zwarcie_metaliczne(None),)),
                uklady.nastawy(dt_s=0.001, horyzont_s=0.1, krok_wyjscia_s=0.01),
            )
        ).uruchom()
    assert blad.value.kod == KOD_ODBIOR_STALEJ_MOCY_PRZY_ZEROWYM_NAPIECIU
    assert blad.value.szczegoly["wezel"] == "GEN"
    assert blad.value.szczegoly["odbiory"] == ("ODB1",)


def test_przeksztaltnik_nadazny_w_wezle_zwartym_metalicznie_to_odmowa_nazwana() -> None:
    urzadzenie = biblioteka.przeksztaltnik_gfl()
    uklad = biblioteka.zloz_uklad(urzadzenie, p_pu=0.25)
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(
            uklad.wejscie(
                HarmonogramDynamiki((_zwarcie_metaliczne(None),)),
                biblioteka.nastawy(dt_s=0.002, horyzont_s=0.1, krok_wyjscia_s=0.01),
            )
        ).uruchom()
    assert blad.value.kod == KOD_WARTOSC_NIESKONCZONA
    assert blad.value.szczegoly["wezel"] == "GEN"
    assert blad.value.szczegoly["urzadzenie"] == urzadzenie.ident


# --------------------------------------------------------------------------- sprzezenie napieciowe
@dataclasses.dataclass(frozen=True)
class _ZrodloLiniowe:
    """Atrapa idealnego zrodla napieciowego: SEM `E(t) = E0 + r t` jako DWA stany.

    Rownanie stanu jest liniowe (`dE/dt = r`), wiec trapez calkuje je DOKLADNIE; wezel
    przylaczenia dostaje wiersz ograniczenia `V - E(x) = 0`. Prad urzadzenia nie ma
    wzoru lokalnego — wyprowadza go bilans wezla (`siec.prad_wezla_ograniczonego`).
    """

    ident: str
    wezel: str
    tempo_re_pu_na_s: float
    tempo_im_pu_na_s: float

    POLA_POZA_ODCISKIEM: ClassVar[tuple[tuple[str, str], ...]] = ()

    @property
    def sprzezenie(self) -> str:
        return "napieciowe"

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return ("sem_re_pu", "sem_im_pu")

    @property
    def granice_stanow(self) -> tuple[None, None]:
        return (None, None)

    @property
    def zakresy_waznosci(self) -> tuple[None, None]:
        return (None, None)

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        return ("sem_re_pu", "sem_im_pu")

    def parametry_tozsamosci(self) -> dict[str, Any]:
        return {
            "ident": self.ident,
            "wezel": self.wezel,
            "tempo_re_pu_na_s": self.tempo_re_pu_na_s,
            "tempo_im_pu_na_s": self.tempo_im_pu_na_s,
        }

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        del moc_pu
        return np.array([napiecie_pu.real, napiecie_pu.imag])

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del stan, napiecie_pu
        return np.array([self.tempo_re_pu_na_s, self.tempo_im_pu_na_s])

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return np.zeros((2, 2))

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return np.zeros((2, 2))

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        return complex(float(stan[0]), float(stan[1]))

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        return np.eye(2)

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        raise AssertionError("sprzezenie napieciowe: prad wyprowadza bilans wezla")

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        raise AssertionError("sprzezenie napieciowe: brak bloku pradowego")

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        raise AssertionError("sprzezenie napieciowe: brak bloku pradowego")


def _uklad_zrodla(tempo: complex) -> WejscieDynamiki:
    """Zrodlo liniowe na SRC -> linia -> odbior stalej mocy na ODB."""
    wezly = (WezelDynamiki("SRC", 15.0), WezelDynamiki("ODB", 15.0))
    galezie = (
        GalazDynamiki("L", "SRC", "ODB", 1.0 / complex(0.01, 0.05), 0.0, 1 + 0j, True, "linia"),
    )
    odbiory = (OdbiorDynamiki("O1", "ODB", 0.3, 0.1, charakterystyka=STALA_MOC),)
    model = zloz_model_sieci(wezly, galezie, ())
    y = model.ybus.toarray()
    v_src = complex(1.0, 0.0)
    v_odb = _v_b(y[1, 1], y[1, 0], v_src, complex(0.3, 0.1))
    prad_src = y[0, 0] * v_src + y[0, 1] * v_odb
    return WejscieDynamiki(
        wezly=wezly,
        galezie=galezie,
        odsprzegi=(),
        odbiory=odbiory,
        urzadzenia=(_ZrodloLiniowe("Z1", "SRC", tempo.real, tempo.imag),),
        punkt_pracy=PunktPracy({"SRC": v_src, "ODB": v_odb}, {"Z1": v_src * prad_src.conjugate()}),
        harmonogram=HarmonogramDynamiki(()),
        nastawy=uklady.nastawy(dt_s=0.01, horyzont_s=0.5, krok_wyjscia_s=0.05),
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )


def test_wezel_zrodla_napieciowego_niesie_E_od_t_bez_bledu_calkowania() -> None:
    tempo = complex(-0.2, 0.05)
    wynik = SilnikDynamiki(_uklad_zrodla(tempo)).uruchom()
    for i, t in enumerate(wynik.os_czasu_s):
        oczekiwane = complex(1.0, 0.0) + tempo * t
        assert wynik.probki["u_pu@SRC"][i] == pytest.approx(abs(oczekiwane), rel=1e-12)
        assert wynik.probki["sem_re_pu@Z1"][i] == pytest.approx(oczekiwane.real, abs=1e-13)


def test_prad_zrodla_napieciowego_z_bilansu_wezla_rowna_sie_pradowi_galezi() -> None:
    wynik = SilnikDynamiki(_uklad_zrodla(complex(-0.2, 0.05))).uruchom()
    for i in range(len(wynik.os_czasu_s)):
        moc_galezi = complex(wynik.probki["p_od_pu@L"][i], wynik.probki["q_od_pu@L"][i])
        moc_zrodla = complex(wynik.probki["p_pu@Z1"][i], wynik.probki["q_pu@Z1"][i])
        assert moc_zrodla == pytest.approx(moc_galezi, abs=1e-12)


def test_jakobian_sprzezony_wiersza_ograniczenia_zgodny_z_roznica_skonczona() -> None:
    """Blok `dR_y/dx` wiersza ograniczenia to `-dE/dx` (detektor mutacji M37)."""
    wejscie = _uklad_zrodla(complex(-0.2, 0.05))
    model = _zloz(wejscie.wezly, wejscie.galezie, ())
    kontekst = KontekstKroku(model, wejscie.odbiory, wejscie.urzadzenia, wejscie.nastawy)
    stan = (np.array([1.01, 0.02]),)
    napiecia = np.array([1.01 + 0.02j, 0.97 - 0.03j])
    jakobian = _jakobian_sprzezony(kontekst, stan, napiecia, 0.01).toarray()

    def reszta(x: np.ndarray) -> np.ndarray:
        return residuum_algebry(model, wejscie.odbiory, wejscie.urzadzenia, (x,), napiecia)

    krok = 1e-7
    for kolumna in range(2):
        plus = stan[0].copy()
        minus = stan[0].copy()
        plus[kolumna] += krok
        minus[kolumna] -= krok
        roznica = (reszta(plus) - reszta(minus)) / (2 * krok)
        assert jakobian[2:, kolumna] == pytest.approx(roznica, abs=1e-8)


def test_prad_wezla_ograniczonego_jest_bilansem_wezla() -> None:
    wejscie = _uklad_zrodla(complex(0.0, 0.0))
    model = _zloz(wejscie.wezly, wejscie.galezie, ())
    napiecia = np.array([1.0 + 0.0j, wejscie.punkt_pracy.napiecia_pu["ODB"]])
    prad = prad_wezla_ograniczonego(
        model, wejscie.odbiory, wejscie.urzadzenia, (np.array([1.0, 0.0]),), napiecia, "SRC"
    )
    assert prad == pytest.approx((model.ybus @ napiecia)[0], abs=1e-15)


def test_dwa_warunki_napiecia_w_jednym_wezle_to_odmowa_nazwana() -> None:
    wejscie = _uklad_zrodla(complex(0.0, 0.0))
    zwarcie = ZwarcieWezla(0.1, "SRC", "3F", 0.0, 0.0, None, None)
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(
            dataclasses.replace(wejscie, harmonogram=HarmonogramDynamiki((zwarcie,)))
        ).uruchom()
    assert blad.value.kod == KOD_NAPIECIE_NARZUCONE_SPRZECZNE


def test_f_i_kat_wezla_zrodla_rowne_postaci_zamknietej() -> None:
    """E(t) liniowe: `theta_dot = Im(Edot/E)` dokladnie, bez rozniczkowania numerycznego."""
    tempo = complex(0.0, 0.1)
    wynik = SilnikDynamiki(_uklad_zrodla(tempo)).uruchom()
    for i, t in enumerate(wynik.os_czasu_s):
        e = complex(1.0, 0.0) + tempo * t
        oczekiwana = 50.0 + (tempo / e).imag / (2.0 * np.pi)
        assert wynik.probki["f_hz@SRC"][i] == pytest.approx(oczekiwana, abs=1e-12)
        assert wynik.probki["kat_deg@SRC"][i] == pytest.approx(
            np.degrees(cmath.phase(e)), abs=1e-10
        )


# --------------------------------------------------------------------------- predykat wysp
@pytest.mark.parametrize(
    "wariant", ["brak_urzadzen", "urzadzenie_odlaczone", "maszyna", "zrodlo_napieciowe"]
)
def test_predykaty_parami_klasyfikacja_silnika_i_odmowa_algebry(wariant: str) -> None:
    """Wyspa z odbiorem: `klasyfikuj_wyspy` mowi „martwa" <=> `sprawdz_zasilanie_wysp` odmawia.

    CLAUDE.md „KLASA, NIE INSTANCJA" pkt 3: silnik odcina wyspe, ktora algebra
    odrzucilaby jako „bez zrodla" — i ZADNA inna. Dwa poziomy czytaja jeden predykat;
    test pilnuje, zeby rozjazd byl niemozliwy dla kazdej rodziny wkladu do algebry.
    """
    from network_model.solvers.dynamika.kontrakty import KOD_WYSPA_BEZ_ZRODLA
    from network_model.solvers.dynamika.urzadzenia.odlaczone import UrzadzenieOdlaczone
    from network_model.solvers.dynamika.wyspy import klasyfikuj_wyspy, sprawdz_zasilanie_wysp

    maszyna = zbuduj_maszyne_klasyczna(
        ident="G",
        wezel="A",
        s_n_mva=10.0,
        h_s=2.0,
        d_pu=0.0,
        x_prim_pu=0.25,
        ra_pu=0.0,
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )
    napiecie = complex(1.0, 0.1)
    urzadzenia: tuple[Any, ...] = {
        "brak_urzadzen": (),
        "urzadzenie_odlaczone": (UrzadzenieOdlaczone(maszyna),),
        "maszyna": (maszyna,),
        "zrodlo_napieciowe": (_ZrodloLiniowe("Z", "A", 0.0, 0.0),),
    }[wariant]
    stany = tuple(
        (
            np.array([napiecie.real, napiecie.imag])
            if isinstance(urzadzenie, _ZrodloLiniowe)
            else maszyna.stan_poczatkowy(napiecie, complex(0.05, 0.01))
        )
        for urzadzenie in urzadzenia
    )
    odbiory = (OdbiorDynamiki("O", "A", 0.05, 0.01, charakterystyka=STALA_MOC),)
    napiecia = np.array([napiecie])
    zywe, martwe = klasyfikuj_wyspy((0,), {"A": 0}, urzadzenia, stany, napiecia)
    assert zywe | martwe == frozenset({0}) and not zywe & martwe
    assert (0 in zywe) == (wariant in ("maszyna", "zrodlo_napieciowe"))
    if 0 in martwe:
        with pytest.raises(OdmowaDynamiki) as blad:
            sprawdz_zasilanie_wysp(
                ("A",), {"A": 0}, (0,), odbiory, urzadzenia, stany, napiecia, 0.0
            )
        assert blad.value.kod == KOD_WYSPA_BEZ_ZRODLA
    else:
        sprawdz_zasilanie_wysp(("A",), {"A": 0}, (0,), odbiory, urzadzenia, stany, napiecia, 0.0)


def test_niezerowe_napiecie_wezla_martwego_w_punkcie_pracy_to_niespojnosc_wejscia() -> None:
    """Napiecie PODANE dla wezla martwego nie jest nadpisywane — bramka rownowagi je sprawdza."""
    uklad = _uklad(odbior=True, urzadzenie=False, odsprzeg=False, b_linii=0.0)
    galezie = tuple(
        dataclasses.replace(g, aktywna_na_starcie=False) if g.ident == "LB" else g
        for g in uklad["galezie"]
    )
    smib = uklady.zbuduj_smib()
    punkt = PunktPracy(dict(uklad["punkt"].napiecia_pu), dict(smib.punkt_pracy.moce_zrodel_pu))
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(
            {**uklad, "galezie": galezie, "punkt": punkt},
            (),
            _nastawy("trapez_niejawny", False, 0.05),
        )
    assert blad.value.kod == "dynamika.inicjalizacja_niezbiezna"
    residua = dict(blad.value.szczegoly["residua_wezlow"])
    assert residua["B"] == pytest.approx(abs(uklad["punkt"].napiecia_pu["B"]), rel=1e-6)


@pytest.mark.parametrize("z_odbiorem_zerowej_mocy", [False, True])
def test_wezel_bez_sasiada_zywego_startuje_od_sem_urzadzenia(z_odbiorem_zerowej_mocy: bool) -> None:
    """Jedyny wezel sieci (maszyna) po zdjeciu zwarcia metalicznego: brak sasiada zywego.

    `_napiecia_startowe` nie ma skad wziac napiecia sasiada, wiec wezel startuje od SEM
    maszyny (napiecie jalowe), a nie od zera. Wariant z odbiorem o mocy ZEROWEJ jest
    detektorem klasy „start od zera w wezle odbioru": przed ta regula konczyl sie surowym
    `ZeroDivisionError` z `prad_odbioru_pu` (0/0), a nie wynikiem ani nazwana odmowa.
    """
    from network_model.solvers.dynamika.silnik import ZALOZENIE_STARTU_PONOWNEGO_ZASILENIA

    maszyna = zbuduj_maszyne_klasyczna(
        ident="G",
        wezel="GEN",
        s_n_mva=10.0,
        h_s=2.0,
        d_pu=0.0,
        x_prim_pu=0.25,
        ra_pu=0.0,
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )
    napiecie = complex(1.02, 0.05)
    wejscie = WejscieDynamiki(
        wezly=(WezelDynamiki("GEN", 15.0),),
        galezie=(),
        odsprzegi=(),
        odbiory=(
            (OdbiorDynamiki("O0", "GEN", 0.0, 0.0, charakterystyka=STALA_MOC),)
            if z_odbiorem_zerowej_mocy
            else ()
        ),
        urzadzenia=(maszyna,),
        punkt_pracy=PunktPracy({"GEN": napiecie}, {"G": 0j}),
        harmonogram=HarmonogramDynamiki(
            (ZwarcieWezla(0.05, "GEN", "3F", 0.0, 0.0, 0.1, "samoczynne"),)
        ),
        nastawy=uklady.nastawy(dt_s=0.005, horyzont_s=0.2, krok_wyjscia_s=0.05),
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )
    wynik = SilnikDynamiki(wejscie).uruchom()
    # Os: 0 (C), 0,05 (L, P), 0,1 (L, P), 0,15 (C), 0,2 (C) — probka `P` chwili zwarcia
    # i `L` chwili zdjecia opisuja wezel zwarty metalicznie.
    assert wynik.strona_probki == ("C", "L", "P", "L", "P", "C", "C")
    assert wynik.probki["u_pu@GEN"][1] == pytest.approx(abs(napiecie), rel=1e-12)
    assert wynik.probki["u_pu@GEN"][2] == 0.0
    assert wynik.probki["u_pu@GEN"][3] == 0.0
    assert wynik.probki["u_pu@GEN"][-1] == pytest.approx(abs(napiecie), rel=1e-12)
    zdjecie = [krok for krok in wynik.slad_white_box["kroki_szczegolne"] if krok.get("t_s") == 0.1]
    assert zdjecie and zdjecie[0]["wezly_start_od_sasiada"] == []
    assert zdjecie[0]["wezly_start_od_sem_urzadzenia"] == ["GEN"]
    assert ZALOZENIE_STARTU_PONOWNEGO_ZASILENIA in wynik.zalozenia


def test_zerowy_start_w_wezle_odbioru_to_odmowa_nazwana_a_nie_dzielenie_przez_zero() -> None:
    """`rozwiaz_algebre` z V = 0 w wezle odbioru o stalej mocy: kod, nie `ZeroDivisionError`."""
    from network_model.solvers.dynamika.kontrakty import KOD_ALGEBRA_NIEZBIEZNA
    from network_model.solvers.dynamika.siec import rozwiaz_algebre

    wejscie = _uklad_zrodla(complex(0.0, 0.0))
    model = _zloz(wejscie.wezly, wejscie.galezie, ())

    def rozwiaz(odbior: OdbiorDynamiki):
        return rozwiaz_algebre(
            model,
            (odbior,),
            wejscie.urzadzenia,
            (np.array([1.0, 0.0]),),
            np.array([1.0 + 0.0j, 0.0j]),
            tolerancja=1e-11,
            max_iteracji=20,
            max_nawrotow=10,
            t_s=0.3,
        )

    with pytest.raises(OdmowaDynamiki) as blad:
        rozwiaz(OdbiorDynamiki("O1", "ODB", 0.3, 0.1, charakterystyka=STALA_MOC))
    assert blad.value.kod == KOD_ALGEBRA_NIEZBIEZNA
    assert blad.value.szczegoly["wezly"] == ("ODB",)
    # Przepisane z intencja (karta modeli odbiorow): odmowa dotyczy WYLACZNIE odbioru, ktorego
    # prad w V = 0 nie istnieje (`odbiory.wymaga_napiecia_niezerowego`). Odbior o mocy
    # zerowej ma prad zero dokladnie, a odbior z zadeklarowanym U_min jest w V = 0 w galezi
    # impedancyjnej (prad zero, jakobian skonczony) — oba startuja Newtona bez odmowy.
    for odbior in (
        OdbiorDynamiki("O1", "ODB", 0.0, 0.0, charakterystyka=STALA_MOC),
        OdbiorDynamiki("O1", "ODB", 0.3, 0.1, charakterystyka_stalej_mocy(u_min_pu=0.7)),
    ):
        wynik = rozwiaz(odbior)
        assert wynik.residuum <= 1e-11
