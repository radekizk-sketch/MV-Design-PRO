"""Solver zwarć doziemnych SN — sondy ręczne, tożsamości fizyczne i parytet z IEC 60909 SC_1F
(karta EWALUATORY-ZIEMNOZWARCIOWE).

WEJŚCIE. Scena zwarć doziemnych zbudowana operacjami projektanta
(``tests/reference_networks/scena_doziemienia.py``) i wejście solvera złożone tą samą funkcją,
którą woła bieg oceny zabezpieczeń (``oblicz_siec_doziemna``). Liczby sond są liczone w teście
z danych modelu (długości i B′ kabli, X_N i R_N dławika, I_W wymuszenia, R_N rezystora).

ILOCZYN CECH: sposób pracy punktu neutralnego {izolowany, kompensowany, kompensowany z AWSC,
rezystor} × miejsce zwarcia {w strefie pola, poza strefą (szyny GPZ), linia sąsiednia (strefa
zagnieżdżona ST1)} × stan wymuszenia {przed, po AWSC} × wielkość {I_C, I_L, 3I0, Y0, G0}.

TOŻSAMOŚCI (nie przykłady):
* prawo Kirchhoffa sieci zerowej: Σ 3I0 pól GPZ + Σ prądów punktów neutralnych + I_F·[zwarcie
  poza strefami pól] = 0 w każdym punkcie, stanie i sposobie pracy;
* admitancja zerowa pola zdrowego = −(własna admitancja pola) — niezależna od sposobu pracy
  punktu neutralnego;
* wymuszenie AWSC dodaje do konduktancji pola uszkodzonego dokładnie I_W/(U_n/√3);
  rezystor — 1/R_N.
"""

from __future__ import annotations

import json
import math
from functools import cache
from typing import Any

import numpy as np
import pytest
from application.analyses.protection.ocena_ziemnozwarciowa import (
    FunkcjaZiemnozwarciowa,
    ObliczenieDoziemne,
    funkcje_ziemnozwarciowe,
    oblicz_siec_doziemna,
)
from enm.mapping import map_enm_to_network_graph
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source, Transformer
from network_model.odmowa_danych import OdmowaDanychError
from network_model.solvers.doziemienie_sn import (
    STAN_PO_AWSC,
    STAN_PRZED,
    BocznikZerowy,
    DaneUziomuStacji,
    PunktDoziemienia,
    WejscieDoziemienia,
    oblicz_doziemienie,
    uziemienia_stacji,
)

from tests.application.analyses.protection import test_vector_group_earth_fault_chain as lancuch
from tests.reference_networks.scena_doziemienia import (
    PRAD_AWSC_A,
    R_DLAWIKA_OHM,
    R_REZYSTORA_OHM,
    SPOSOBY_PRACY,
    X_DLAWIKA_OHM,
    SposobPracy,
    pola_liniowe,
    scena_z_nastawami,
    sterownik_pola,
)

U_N_V = 15_000.0
U_F_V = U_N_V / math.sqrt(3)


@cache
def _scena(sposob: SposobPracy) -> tuple[dict[str, Any], list[FunkcjaZiemnozwarciowa], ObliczenieDoziemne]:
    enm = scena_z_nastawami(sposob)
    model = EnergyNetworkModel.model_validate(enm)
    graph = map_enm_to_network_graph(model)
    funkcje = funkcje_ziemnozwarciowe(model, graph)
    return enm, funkcje, oblicz_siec_doziemna(model, graph, funkcje)


def _pola_gpz(sposob: SposobPracy) -> list[FunkcjaZiemnozwarciowa]:
    """Funkcja 51N każdego pola liniowego GPZ (strefa pola = przekładnik pola)."""
    enm, funkcje, _ = _scena(sposob)
    sterowniki = {sterownik_pola(enm, p["ref_id"])["ref_id"] for p in pola_liniowe(enm)}
    pola = [f for f in funkcje if f.kod == "51N" and f.urzadzenie_ref in sterowniki]
    assert len(pola) == 3
    return sorted(pola, key=lambda f: f.urzadzenie_ref)


def _suma_b_kabli_s(enm: dict[str, Any]) -> float:
    return sum(
        g["b_siemens_per_km"] * g["length_km"] for g in enm["branches"] if g["type"] == "cable"
    )


# ---------------------------------------------------------------------------
# Sondy ręczne: prąd pojemnościowy z długości kabli, prąd dławika
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("sposob", SPOSOBY_PRACY)
def test_prad_pojemnosciowy_z_dlugosci_kabli(sposob: SposobPracy) -> None:
    enm, _, obliczenie = _scena(sposob)
    (skladowa,) = obliczenie.wynik_min.skladowe
    dlugosc_km = sum(g["length_km"] for g in enm["branches"] if g["type"] == "cable")
    assert dlugosc_km == pytest.approx(33.0)
    # I_C = √3·U_n·B′·l — z B′ kabli modelu i, niezależnie, z pojemności katalogowej 390 nF/km.
    assert skladowa.prad_pojemnosciowy_a == pytest.approx(
        math.sqrt(3) * U_N_V * _suma_b_kabli_s(enm), rel=1e-9
    )
    assert skladowa.prad_pojemnosciowy_a == pytest.approx(
        math.sqrt(3) * U_N_V * 2 * math.pi * 50 * 390e-9 * 33.0, rel=1e-6
    )
    assert skladowa.prad_pojemnosciowy_a == pytest.approx(105.05, abs=0.01)


@pytest.mark.parametrize("sposob", ["KOMPENSOWANY", "KOMPENSOWANY_AWSC"])
def test_prad_dlawika_i_rozstrojenie(sposob: SposobPracy) -> None:
    _, _, obliczenie = _scena(sposob)
    (skladowa,) = obliczenie.wynik_min.skladowe
    i_l = U_F_V * X_DLAWIKA_OHM / (R_DLAWIKA_OHM**2 + X_DLAWIKA_OHM**2)
    assert skladowa.prad_dlawikow_a == pytest.approx(i_l, rel=1e-9)
    assert skladowa.rozstrojenie == pytest.approx(
        (i_l - skladowa.prad_pojemnosciowy_a) / skladowa.prad_pojemnosciowy_a, rel=1e-9
    )
    assert skladowa.ma_awsc is (sposob == "KOMPENSOWANY_AWSC")


@pytest.mark.parametrize("sposob", SPOSOBY_PRACY)
def test_prad_zwarcia_sieci_izolowanej_rowny_pojemnosciowemu(sposob: SposobPracy) -> None:
    """c_min = 1,0: prąd zwarcia doziemnego na szynach GPZ wg sposobu pracy — izolowana I_C,
    kompensowana prąd resztkowy (≪ I_C), rezystor ≈ √(I_R² + I_C²)."""
    _, _, obliczenie = _scena(sposob)
    (skladowa,) = obliczenie.wynik_min.skladowe
    szyna = next(p for p in obliczenie.wynik_min.punkty if p.nazwa_pl.startswith("Szyna GPZ"))
    i_f = abs(szyna.prad_doziemny_a)
    i_c = skladowa.prad_pojemnosciowy_a
    if sposob == "IZOLOWANY":
        assert i_f == pytest.approx(i_c, rel=0.02)
    elif sposob == "REZYSTOR":
        i_r = U_F_V / R_REZYSTORA_OHM
        assert i_f == pytest.approx(math.hypot(i_r, i_c), rel=0.03)
    else:
        assert i_f < 0.15 * i_c


# ---------------------------------------------------------------------------
# Tożsamości: Kirchhoff sieci zerowej, admitancje pól
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("sposob", SPOSOBY_PRACY)
@pytest.mark.parametrize("wariant", ["wynik_min", "wynik_max"])
def test_kirchhoff_sieci_zerowej_w_kazdym_punkcie(sposob: SposobPracy, wariant: str) -> None:
    _, _, obliczenie = _scena(sposob)
    pola = _pola_gpz(sposob)
    wynik = getattr(obliczenie, wariant)
    stany = {p.stan for p in wynik.punkty}
    assert stany == ({STAN_PRZED, STAN_PO_AWSC} if sposob == "KOMPENSOWANY_AWSC" else {STAN_PRZED})
    miejsca = {"w_strefie": 0, "poza_strefa": 0}
    for punkt in wynik.punkty:
        wielkosci = [punkt.pole(f.klucz) for f in pola]
        w_strefie = any(w.zwarcie_w_strefie for w in wielkosci)
        miejsca["w_strefie" if w_strefie else "poza_strefa"] += 1
        bilans = (
            sum(w.prad_3i0_a for w in wielkosci)
            + sum(prad for _, prad in punkt.prady_punktow_neutralnych_a)
            + (0 if w_strefie else punkt.prad_doziemny_a)
        )
        assert abs(bilans) <= 1e-6 * abs(punkt.prad_doziemny_a), (punkt.nazwa_pl, punkt.stan)
    assert miejsca["w_strefie"] and miejsca["poza_strefa"]


def _punkt(obliczenie: ObliczenieDoziemne, nazwa: str, stan: str = STAN_PRZED):
    return next(
        p for p in obliczenie.wynik_min.punkty if p.nazwa_pl == nazwa and p.stan == stan
    )


@pytest.mark.parametrize(
    "miejsce", ["Zacisk końcowy Kabel pola 1", "Zacisk końcowy Kabel odejścia ST1"]
)
def test_admitancja_pola_zdrowego_niezalezna_od_sposobu_pracy(miejsce: str) -> None:
    """Zwarcie w strefie pola 1 (także na linii sąsiedniej — odejście ST1 w strefie pola 1):
    pola 2 i 3 mierzą własny prąd pojemnościowy, Y0 = −Y0 własne — ta sama liczba w każdym
    sposobie pracy punktu neutralnego."""
    admitancje: dict[str, list[complex]] = {}
    for sposob in SPOSOBY_PRACY:
        _, _, obliczenie = _scena(sposob)
        punkt = _punkt(obliczenie, miejsce)
        wielkosci = [punkt.pole(f.klucz) for f in _pola_gpz(sposob)]
        assert [w.zwarcie_w_strefie for w in wielkosci] == [True, False, False]
        admitancje[sposob] = [w.admitancja_y0_s for w in wielkosci[1:]]
    wzor = admitancje["IZOLOWANY"]
    for sposob, wartosci in admitancje.items():
        for a, b in zip(wartosci, wzor, strict=True):
            assert abs(a - b) <= 1e-9 * abs(b), sposob
    for y0 in wzor:
        assert y0.imag < 0 and abs(y0.real) < 0.01 * abs(y0.imag)


def test_awsc_dodaje_konduktancje_wymuszenia_w_polu_uszkodzonym() -> None:
    _, _, obliczenie = _scena("KOMPENSOWANY_AWSC")
    pole1 = _pola_gpz("KOMPENSOWANY_AWSC")[0]
    przed = _punkt(obliczenie, "Zacisk końcowy Kabel pola 1", STAN_PRZED).pole(pole1.klucz)
    po = _punkt(obliczenie, "Zacisk końcowy Kabel pola 1", STAN_PO_AWSC).pole(pole1.klucz)
    assert przed.zwarcie_w_strefie and po.zwarcie_w_strefie
    assert (po.admitancja_y0_s - przed.admitancja_y0_s).real == pytest.approx(
        PRAD_AWSC_A / U_F_V, rel=1e-3
    )
    assert (po.admitancja_y0_s - przed.admitancja_y0_s).imag == pytest.approx(0.0, abs=1e-9)
    assert po.moc_p0_w > 3 * przed.moc_p0_w > 0


def test_rezystor_dodaje_konduktancje_1_przez_rn_w_polu_uszkodzonym() -> None:
    wartosci = {}
    for sposob in ("IZOLOWANY", "REZYSTOR"):
        _, _, obliczenie = _scena(sposob)
        punkt = _punkt(obliczenie, "Zacisk końcowy Kabel pola 1")
        wartosci[sposob] = punkt.pole(_pola_gpz(sposob)[0].klucz).admitancja_y0_s
    assert (wartosci["REZYSTOR"] - wartosci["IZOLOWANY"]).real == pytest.approx(
        1 / R_REZYSTORA_OHM, rel=1e-3
    )


def test_kompensowana_pole_zdrowe_mierzy_wiecej_niz_uszkodzone_a_g0_rozroznia() -> None:
    """Fizyka, dla której 51N w sieci kompensowanej nie jest selektywne, a 67N (cos φ) jest:
    3I0 pola zdrowego 3 > 3I0 pola uszkodzonego 1, a konduktancja G0 pola uszkodzonego jest
    dodatnia (straty dławika), pól zdrowych — bliska zeru i ujemna."""
    _, _, obliczenie = _scena("KOMPENSOWANY")
    punkt = _punkt(obliczenie, "Zacisk końcowy Kabel pola 1")
    uszkodzone, zdrowe2, zdrowe3 = (punkt.pole(f.klucz) for f in _pola_gpz("KOMPENSOWANY"))
    assert abs(zdrowe3.prad_3i0_a) > abs(uszkodzone.prad_3i0_a)
    assert uszkodzone.admitancja_y0_s.real > 0.5e-3
    for zdrowe in (zdrowe2, zdrowe3):
        assert zdrowe.admitancja_y0_s.real < 0 and zdrowe.moc_p0_w < 0


# ---------------------------------------------------------------------------
# Parytet z IEC 60909 SC_1F i grupa połączeń transformatora (prąd uziomowy)
# ---------------------------------------------------------------------------


def _siec_transformatora(grupa: str) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="parytet SC_1F"),
        buses=[
            Bus(ref_id="bhv", name="HV", voltage_kv=lancuch._UHV_KV),
            Bus(ref_id="blv", name="LV", voltage_kv=lancuch._ULV_KV),
        ],
        sources=[
            Source(
                ref_id="src",
                name="Sieć HV",
                bus_ref="bhv",
                model="thevenin",
                r_ohm=0.8,
                x_ohm=8.0,
                r0_ohm=lancuch._SRC_R0,
                x0_ohm=lancuch._SRC_X0,
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr1",
                name="TR",
                hv_bus_ref="bhv",
                lv_bus_ref="blv",
                sn_mva=lancuch._SN_MVA,
                uhv_kv=lancuch._UHV_KV,
                ulv_kv=lancuch._ULV_KV,
                uk_percent=lancuch._UK_PCT,
                pk_kw=lancuch._PK_KW,
                vector_group=grupa,
            )
        ],
    )


@pytest.mark.parametrize("grupa,ik1_a", [("Dyn11", 8849.00), ("YNyn0", 7932.23)])
def test_parytet_z_sc_1f_i_prad_uziomowy_wg_grupy_polaczen(grupa: str, ik1_a: float) -> None:
    """Sieć bez pojemności doziemnych, punkt neutralny uziemiony bezpośrednio: prąd zwarcia
    doziemnego solvera = I″k1 rdzenia IEC 60909 (ta sama Z1 i Z0 z grupą połączeń), a prąd
    uziomowy stacji = r·I″k1 (PN-EN 50522 tablica 1), napięcie uziomowe = R_E·I_E. Wartości
    I″k1 — odniesienie V12K-184 łańcucha grupy połączeń."""
    sc = lancuch._run_1ph_on_lv(grupa, c_factor=1.1)
    model = _siec_transformatora(grupa)
    graph = map_enm_to_network_graph(model)
    obliczenie = oblicz_siec_doziemna(model, graph, [])
    (punkt,) = obliczenie.wynik_max.punkty
    assert abs(punkt.prad_doziemny_a) == pytest.approx(sc.ikss_a, rel=1e-9)
    assert sc.ikss_a == pytest.approx(ik1_a, rel=1e-5)

    (uziemienie,) = uziemienia_stacji(
        obliczenie.wynik_max,
        obliczenie.wejscie_max,
        [
            DaneUziomuStacji(
                stacja_ref="st",
                nazwa_pl="Stacja",
                wezly=frozenset({obliczenie.wejscie_max.punkty[0].wezel}),
                rezystancja_ohm=10.0,
                wspolczynnik_r=0.6,
            )
        ],
    )
    assert uziemienie.sposob == "UZIEMIONA_MALA_IMPEDANCJA"
    assert uziemienie.prad_odniesienia_a == pytest.approx(sc.ikss_a, rel=1e-9)
    assert uziemienie.prad_uziomowy_a == pytest.approx(0.6 * sc.ikss_a, rel=1e-12)
    assert uziemienie.napiecie_uziomowe_v == pytest.approx(6.0 * ik1_a, rel=1e-5)


def test_grupa_polaczen_zmienia_prad_uziomowy() -> None:
    prady = {}
    for grupa in ("Dyn11", "YNyn0"):
        model = _siec_transformatora(grupa)
        obliczenie = oblicz_siec_doziemna(model, map_enm_to_network_graph(model), [])
        prady[grupa] = abs(obliczenie.wynik_max.punkty[0].prad_doziemny_a)
    assert prady["Dyn11"] > 1.05 * prady["YNyn0"]


# ---------------------------------------------------------------------------
# Granice: brak drogi prądu zerowego, wiarygodność, determinizm, uziom
# ---------------------------------------------------------------------------


def test_siec_bez_drogi_pradu_zerowego_nazywa_punkty() -> None:
    """Źródło z izolowanym punktem neutralnym i szyna bez kabli: żadnego bocznika do ziemi —
    prąd zwarcia doziemnego nie ma drogi; punkt trafia do ``punkty_bez_drogi_zerowej``."""
    model = EnergyNetworkModel(
        header=ENMHeader(name="bez drogi zerowej"),
        buses=[Bus(ref_id="b1", name="Szyna SN", voltage_kv=15.0)],
        sources=[
            Source(ref_id="src", name="Źródło", bus_ref="b1", model="thevenin", r_ohm=0.1, x_ohm=1.0)
        ],
    )
    obliczenie = oblicz_siec_doziemna(model, map_enm_to_network_graph(model), [])
    assert obliczenie.wynik_min.punkty == ()
    assert [ref for ref, _ in obliczenie.wynik_min.punkty_bez_drogi_zerowej] == ["b1"]


def test_granica_wiarygodnosci_rezonans_szeregowy_to_odmowa() -> None:
    """Z0 ≈ −(Z1 + Z2): rezonans szeregowy daje |V0| ≫ 1,5·c — błąd danych, odmowa nazwana."""
    z0 = complex(0.001, -0.2)
    wejscie = WejscieDoziemienia(
        y0_pu=np.array([[1 / z0]], dtype=complex),
        boczniki=(
            BocznikZerowy(
                element_ref="bat",
                nazwa_pl="Bateria",
                rodzaj="BATERIA",
                wezel="n1",
                indeks=0,
                y_pu=1 / z0,
                i_base_a=1000.0,
            ),
        ),
        punkty=(
            PunktDoziemienia(
                punkt_ref="n1",
                nazwa_pl="Węzeł",
                wezel="n1",
                indeks=0,
                z1_pu=0.1j,
                z2_pu=0.1j,
                z_base_ohm=2.25,
                i_base_a=3849.0,
                u_n_kv=15.0,
            ),
        ),
        strefy=(),
        c=1.1,
    )
    with pytest.raises(OdmowaDanychError):
        oblicz_doziemienie(wejscie)


@pytest.mark.parametrize("sposob", SPOSOBY_PRACY)
def test_determinizm_dwa_biegi_identyczne(sposob: SposobPracy) -> None:
    enm = scena_z_nastawami(sposob)
    wyniki = []
    for _ in range(2):
        model = EnergyNetworkModel.model_validate(enm)
        graph = map_enm_to_network_graph(model)
        obliczenie = oblicz_siec_doziemna(model, graph, funkcje_ziemnozwarciowe(model, graph))
        wyniki.append(
            json.dumps(
                [obliczenie.wynik_min.to_dict(), obliczenie.wynik_max.to_dict()],
                sort_keys=True,
                allow_nan=False,
            )
        )
    assert wyniki[0] == wyniki[1]


def test_wspolczynnik_r_spoza_przedzialu_to_odmowa() -> None:
    _, _, obliczenie = _scena("IZOLOWANY")
    with pytest.raises(OdmowaDanychError):
        uziemienia_stacji(
            obliczenie.wynik_max,
            obliczenie.wejscie_max,
            [
                DaneUziomuStacji(
                    stacja_ref="st",
                    nazwa_pl="Stacja",
                    wezly=frozenset({obliczenie.wejscie_max.punkty[0].wezel}),
                    rezystancja_ohm=1.0,
                    wspolczynnik_r=1.2,
                )
            ],
        )
