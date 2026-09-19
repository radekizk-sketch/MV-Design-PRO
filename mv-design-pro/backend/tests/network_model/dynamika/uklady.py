"""Uklady odniesienia testow rdzenia dynamiki (karta W6-2).

SMIB (maszyna klasyczna + szyna sztywna przez reaktancje) jest ukladem, dla
ktorego istnieja ROZWIAZANIA ANALITYCZNE uzywane jako wyrocznie: kryterium
rownych pol (CCT), analiza malosygnalowa (czestotliwosc modu) i calka pierwsza
przy `D = 0`. Punkt pracy jest tu liczony DOKLADNIE (dwa wezly, jedna galaz o
czystej reaktancji), a nie brany z rozpływu numerycznego — dzieki temu bramka
rownowagi rdzenia ma sie o co oprzec z dokladnoscia maszynowa, a test nie mierzy
przy okazji bledu innego solvera.

Uklad z odbiorem (`zbuduj_smib_z_odbiorem`) sluzy przypadkom, w ktorych
wyrocznia analityczna NIE obowiazuje (odbior o stalej mocy nie ma rownowaznej
admitancji) — testy uzywaja go do sprawdzania sciezek odmowy i zachowania sieci,
nie do porownan z rozwiazaniem zamknietym.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass

from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    NastawySolvera,
    OdbiorDynamiki,
    PunktPracy,
    WejscieDynamiki,
    WezelDynamiki,
)
from network_model.solvers.dynamika.urzadzenia import (
    MaszynaKlasyczna,
    SzynaSztywna,
    zbuduj_maszyne_klasyczna,
    zbuduj_szyne_sztywna,
)

S_BAZOWA_MVA = 100.0
F_BAZOWA_HZ = 50.0
U_N_KV = 15.0

#: Parametry ukladu odniesienia — wartosci typowe dla maszyny srednicy SN
#: (H = 3,5 s, X'd = 0,3 pu) i sieci nadrzednej o mocy zwarciowej rownej bazie.
X_LINII_PU = 0.3
X_SYSTEMU_PU = 0.05
U_GENERATORA_PU = 1.05
P_GENERATORA_PU = 0.8
H_MASZYNY_S = 3.5
X_PRIM_MASZYNY_PU = 0.3


@dataclass(frozen=True)
class UkladSmib:
    """Uklad SMIB wraz z urzadzeniami i punktem pracy (do budowy wejsc biegu)."""

    wezly: tuple[WezelDynamiki, ...]
    galezie: tuple[GalazDynamiki, ...]
    odbiory: tuple[OdbiorDynamiki, ...]
    maszyna: MaszynaKlasyczna
    szyna: SzynaSztywna
    punkt_pracy: PunktPracy

    def wejscie(self, harmonogram: HarmonogramDynamiki, nastawy: NastawySolvera) -> WejscieDynamiki:
        return WejscieDynamiki(
            wezly=self.wezly,
            galezie=self.galezie,
            odsprzegi=(),
            odbiory=self.odbiory,
            urzadzenia=(self.maszyna, self.szyna),
            punkt_pracy=self.punkt_pracy,
            harmonogram=harmonogram,
            nastawy=nastawy,
            s_bazowa_mva=S_BAZOWA_MVA,
            f_bazowa_hz=F_BAZOWA_HZ,
        )


def _maszyna(d_pu: float, ra_pu: float = 0.0) -> MaszynaKlasyczna:
    return zbuduj_maszyne_klasyczna(
        ident="G1",
        wezel="GEN",
        s_n_mva=S_BAZOWA_MVA,
        h_s=H_MASZYNY_S,
        d_pu=d_pu,
        x_prim_pu=X_PRIM_MASZYNY_PU,
        ra_pu=ra_pu,
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
    )


def _szyna() -> SzynaSztywna:
    return zbuduj_szyne_sztywna(
        ident="SYS1",
        wezel="SYS",
        s_zwarciowa_mva=S_BAZOWA_MVA,
        r_pu=0.0,
        x_pu=X_SYSTEMU_PU,
        s_bazowa_mva=S_BAZOWA_MVA,
    )


def zbuduj_smib(*, d_pu: float = 0.0, ra_pu: float = 0.0) -> UkladSmib:
    """SMIB o DOKLADNIE policzonym punkcie pracy (dwa wezly, jedna reaktancja)."""
    kat = math.asin(P_GENERATORA_PU * X_LINII_PU / U_GENERATORA_PU)
    napiecie_gen = U_GENERATORA_PU * cmath.exp(1j * kat)
    napiecie_sys = complex(1.0, 0.0)
    prad = (napiecie_gen - napiecie_sys) / complex(0.0, X_LINII_PU)
    return UkladSmib(
        wezly=(WezelDynamiki("GEN", U_N_KV), WezelDynamiki("SYS", U_N_KV)),
        galezie=(
            GalazDynamiki(
                ident="LINIA",
                wezel_od="GEN",
                wezel_do="SYS",
                y_szeregowa_pu=1.0 / complex(0.0, X_LINII_PU),
                b_poprzeczna_pu=0.0,
                przekladnia=complex(1.0, 0.0),
            ),
        ),
        odbiory=(),
        maszyna=_maszyna(d_pu, ra_pu),
        szyna=_szyna(),
        punkt_pracy=PunktPracy(
            napiecia_pu={"GEN": napiecie_gen, "SYS": napiecie_sys},
            moce_zrodel_pu={
                "G1": napiecie_gen * prad.conjugate(),
                "SYS1": napiecie_sys * (-prad).conjugate(),
            },
        ),
    )


def zbuduj_smib_dwutorowy(*, d_pu: float = 0.0) -> UkladSmib:
    """SMIB z DWOMA rownoleglymi torami linii — uklad do zdarzen galeziowych.

    Kazdy tor ma reaktancje `2 * X_LINII_PU`, wiec rownolegle daja dokladnie te
    sama impedancje, co uklad jednotorowy: punkt pracy jest IDENTYCZNY, a
    wylaczenie jednego toru podwaja reaktancje przesylu. Dzieki temu test
    zdarzenia galeziowego porownuje sie z ukladem jednotorowym bez zadnej
    poprawki.
    """
    podstawa = zbuduj_smib(d_pu=d_pu)
    tory = tuple(
        GalazDynamiki(
            ident=f"LINIA{numer}",
            wezel_od="GEN",
            wezel_do="SYS",
            y_szeregowa_pu=1.0 / complex(0.0, 2.0 * X_LINII_PU),
            b_poprzeczna_pu=0.0,
            przekladnia=complex(1.0, 0.0),
        )
        for numer in (1, 2)
    )
    return UkladSmib(
        wezly=podstawa.wezly,
        galezie=tory,
        odbiory=podstawa.odbiory,
        maszyna=podstawa.maszyna,
        szyna=podstawa.szyna,
        punkt_pracy=podstawa.punkt_pracy,
    )


def zbuduj_smib_z_odbiorem(*, p_odbioru_pu: float = 0.2, d_pu: float = 0.0) -> UkladSmib:
    """SMIB z odbiorem o stalej mocy na szynie generatora.

    Punkt pracy liczony dokladnie: prad linii wyznacza sie z napiec, a moc
    generatora jest suma mocy linii i mocy odbioru (bilans wezla GEN).
    """
    podstawa = zbuduj_smib(d_pu=d_pu)
    napiecie_gen = podstawa.punkt_pracy.napiecia_pu["GEN"]
    napiecie_sys = podstawa.punkt_pracy.napiecia_pu["SYS"]
    prad_linii = (napiecie_gen - napiecie_sys) / complex(0.0, X_LINII_PU)
    moc_odbioru = complex(p_odbioru_pu, 0.0)
    prad_odbioru = moc_odbioru.conjugate() / napiecie_gen.conjugate()
    moc_generatora = napiecie_gen * (prad_linii + prad_odbioru).conjugate()
    return UkladSmib(
        wezly=podstawa.wezly,
        galezie=podstawa.galezie,
        odbiory=(OdbiorDynamiki(ident="ODB1", wezel="GEN", p_pu=p_odbioru_pu, q_pu=0.0),),
        maszyna=podstawa.maszyna,
        szyna=podstawa.szyna,
        punkt_pracy=PunktPracy(
            napiecia_pu={"GEN": napiecie_gen, "SYS": napiecie_sys},
            moce_zrodel_pu={
                "G1": moc_generatora,
                "SYS1": podstawa.punkt_pracy.moce_zrodel_pu["SYS1"],
            },
        ),
    )


def nastawy(
    *,
    dt_s: float = 0.001,
    horyzont_s: float = 1.0,
    krok_wyjscia_s: float = 0.01,
    integrator: str = "trapez_niejawny",
    dt_min_s: float | None = None,
    dt_max_s: float | None = None,
    tolerancja_kroku: float = 1.0e-6,
    eps_init: float = 1.0e-8,
) -> NastawySolvera:
    """Nastawy testowe — krok STALY, dopoki wolajacy nie poda granic adaptacji."""
    return NastawySolvera(
        dt_s=dt_s,
        dt_min_s=dt_s if dt_min_s is None else dt_min_s,
        dt_max_s=dt_s if dt_max_s is None else dt_max_s,
        tolerancja=1.0e-11,
        tolerancja_kroku=tolerancja_kroku,
        eps_init=eps_init,
        max_iteracji_newtona=40,
        max_nawrotow=30,
        horyzont_s=horyzont_s,
        krok_wyjscia_s=krok_wyjscia_s,
        integrator=integrator,  # type: ignore[arg-type]
    )


#: Reaktancja zwarcia [Ohm] dajaca gleboka, ale rozwiazywalna zapade na szynie
#: 15 kV przy bazie 100 MVA (Z_b = 2,25 Ohm, wiec 0,0225 Ohm = 0,01 pu).
X_ZWARCIA_OHM = 0.0225
#: Reaktancja zwarcia dajaca PLYTKA zapade (0,5 Ohm = 0,222 pu).
X_ZWARCIA_PLYTKIEGO_OHM = 0.5
