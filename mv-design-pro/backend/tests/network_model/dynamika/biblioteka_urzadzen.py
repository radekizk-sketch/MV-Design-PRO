"""Zestawy parametrow i uklady odniesienia dla PIECIU rodzin urzadzen (karta W6-3A).

DLACZEGO OSOBNY MODUL. Kazda rodzina ma inny komplet parametrow, ale ten sam
uklad odniesienia: urzadzenie na szynie `GEN`, szyna sztywna na `SYS`, jedna
gałąź o czystej reaktancji. Punkt pracy jest liczony DOKLADNIE z fazorow (dwa
wezly, jedna reaktancja), a nie brany z rozpływu numerycznego — dzieki temu
bramka rownowagi rdzenia ma sie o co oprzec z dokladnoscia maszynowa, a test nie
mierzy przy okazji bledu innego solvera.

PARAMETRY SA REALISTYCZNE, ale dobrane tak, zeby BADANA WLASNOSC byla widoczna w
krotkim przebiegu (np. mod skretny turbiny przesuniety do ~0,5 Hz przez waski
zakres kata lopat). Kazde takie dostrojenie jest nazwane przy zestawie — fikstura,
ktora „przypadkiem" pokazuje wlasnosc, jest gorsza niz brak testu.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass

from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    NastawySolvera,
    PunktPracy,
    Urzadzenie,
    WejscieDynamiki,
    WezelDynamiki,
)
from network_model.solvers.dynamika.urzadzenia import (
    Magazyn,
    MaszynaSynchroniczna,
    NastawyCrowbar,
    PrzeksztaltnikGFL,
    PrzeksztaltnikGFM,
    RdzenGFL,
    RdzenGFM,
    SzynaSztywna,
    TurbinaWiatrowa,
    okno_symetryczne,
    okno_tylko_oddawanie,
    zbuduj_magazyn,
    zbuduj_maszyne_synchroniczna,
    zbuduj_rdzen_gfl,
    zbuduj_rdzen_gfm,
    zbuduj_regulator_napiecia,
    zbuduj_regulator_obrotow,
    zbuduj_stabilizator,
    zbuduj_szyne_sztywna,
    zbuduj_turbine_wiatrowa,
    zbuduj_zasobnik,
)

S_BAZOWA_MVA = 100.0
F_BAZOWA_HZ = 50.0
U_N_KV = 15.0

#: Reaktancja polaczenia z systemem i reaktancja wewnetrzna systemu.
X_LINII_PU = 0.3
X_SYSTEMU_PU = 0.05


@dataclass(frozen=True)
class UkladDwuwezlowy:
    """Urzadzenie badane + szyna sztywna, z DOKLADNIE policzonym punktem pracy."""

    wezly: tuple[WezelDynamiki, ...]
    galezie: tuple[GalazDynamiki, ...]
    urzadzenie: Urzadzenie
    szyna: SzynaSztywna
    punkt_pracy: PunktPracy

    def wejscie(self, harmonogram: HarmonogramDynamiki, nastawy: NastawySolvera) -> WejscieDynamiki:
        return WejscieDynamiki(
            wezly=self.wezly,
            galezie=self.galezie,
            odsprzegi=(),
            odbiory=(),
            urzadzenia=(self.urzadzenie, self.szyna),
            punkt_pracy=self.punkt_pracy,
            harmonogram=harmonogram,
            nastawy=nastawy,
            s_bazowa_mva=S_BAZOWA_MVA,
            f_bazowa_hz=F_BAZOWA_HZ,
        )

    @property
    def napiecie_gen_pu(self) -> complex:
        return self.punkt_pracy.napiecia_pu["GEN"]

    @property
    def moc_gen_pu(self) -> complex:
        return self.punkt_pracy.moce_zrodel_pu[self.urzadzenie.ident]


def zloz_uklad(
    urzadzenie: Urzadzenie,
    *,
    p_pu: float,
    u_gen_pu: float = 1.05,
    x_linii_pu: float = X_LINII_PU,
) -> UkladDwuwezlowy:
    """Uklad dwuwezlowy o punkcie pracy wyliczonym z fazorow (bez rozpływu)."""
    kat = math.asin(p_pu * x_linii_pu / u_gen_pu)
    napiecie_gen = u_gen_pu * cmath.exp(1j * kat)
    napiecie_sys = complex(1.0, 0.0)
    prad = (napiecie_gen - napiecie_sys) / complex(0.0, x_linii_pu)
    szyna = zbuduj_szyne_sztywna(
        ident="SYS1",
        wezel="SYS",
        s_zwarciowa_mva=S_BAZOWA_MVA,
        r_pu=0.0,
        x_pu=X_SYSTEMU_PU,
        s_bazowa_mva=S_BAZOWA_MVA,
    )
    return UkladDwuwezlowy(
        wezly=(WezelDynamiki("GEN", U_N_KV), WezelDynamiki("SYS", U_N_KV)),
        galezie=(
            GalazDynamiki(
                ident="LINIA",
                wezel_od="GEN",
                wezel_do="SYS",
                y_szeregowa_pu=1.0 / complex(0.0, x_linii_pu),
                b_poprzeczna_pu=0.0,
                przekladnia=complex(1.0, 0.0),
                aktywna_na_starcie=True,
                rodzaj="linia",
            ),
        ),
        urzadzenie=urzadzenie,
        szyna=szyna,
        punkt_pracy=PunktPracy(
            napiecia_pu={"GEN": napiecie_gen, "SYS": napiecie_sys},
            moce_zrodel_pu={
                urzadzenie.ident: napiecie_gen * prad.conjugate(),
                "SYS1": napiecie_sys * (-prad).conjugate(),
            },
        ),
    )


def nastawy(
    *,
    dt_s: float = 0.002,
    horyzont_s: float = 2.0,
    krok_wyjscia_s: float = 0.01,
    eps_init: float = 1.0e-8,
) -> NastawySolvera:
    """Nastawy testowe — krok STALY, trapez niejawny."""
    return NastawySolvera(
        dt_s=dt_s,
        dt_min_s=dt_s,
        dt_max_s=dt_s,
        tolerancja=1.0e-11,
        tolerancja_kroku=1.0e-6,
        eps_init=eps_init,
        max_iteracji_newtona=40,
        max_nawrotow=30,
        horyzont_s=horyzont_s,
        krok_wyjscia_s=krok_wyjscia_s,
        integrator="trapez_niejawny",
    )


# ---------------------------------------------------------------------------
# Maszyna synchroniczna 6. rzedu
# ---------------------------------------------------------------------------

#: Parametry maszyny SN o mocy rownej bazie ukladu — wartosci typowe dla turbo-
#: generatora (Kundur, tab. 3.2): Xd = 1,8, X'd = 0,3, X''d = 0,22, H = 3,5 s.
PARAMETRY_MASZYNY: dict[str, float] = {
    "s_n_mva": 100.0,
    "h_s": 3.5,
    "d_pu": 2.0,
    "xd_pu": 1.8,
    "xq_pu": 1.7,
    "xd_prim_pu": 0.3,
    "xq_prim_pu": 0.55,
    "xd_bis_pu": 0.22,
    "xq_bis_pu": 0.25,
    "xl_pu": 0.15,
    "ra_pu": 0.005,
    "td0_prim_s": 6.0,
    "tq0_prim_s": 0.9,
    "td0_bis_s": 0.04,
    "tq0_bis_s": 0.08,
    "nasycenie_s10": 0.1,
    "nasycenie_s12": 0.35,
}


def maszyna(
    *,
    z_wzbudzeniem: bool = False,
    z_turbina: bool = False,
    z_stabilizatorem: bool = False,
    ident: str = "G1",
    wezel: str = "GEN",
    tb_s: float = 1.0,
    tc_s: float = 0.2,
    t1_turbiny_s: float = 0.4,
    t2_turbiny_s: float = 1.5,
    t3_turbiny_s: float = 5.0,
    t1_pss_s: float = 0.15,
    t2_pss_s: float = 0.03,
    t3_pss_s: float = 0.15,
    t4_pss_s: float = 0.03,
    **nadpisania: float,
) -> MaszynaSynchroniczna:
    """Maszyna 6. rzedu w wybranej konfiguracji regulacji."""
    pola = dict(PARAMETRY_MASZYNY)
    pola.update(nadpisania)
    return zbuduj_maszyne_synchroniczna(
        ident=ident,
        wezel=wezel,
        wzbudzenie=(
            zbuduj_regulator_napiecia(
                wariant="SEXS",
                ka=200.0,
                ta_s=0.05,
                tb_s=tb_s,
                tc_s=tc_s,
                efd_min_pu=-4.0,
                efd_max_pu=6.0,
            )
            if z_wzbudzeniem
            else None
        ),
        turbina=(
            zbuduj_regulator_obrotow(
                wariant="TGOV1",
                r_pu=0.05,
                t1_s=t1_turbiny_s,
                t2_s=t2_turbiny_s,
                t3_s=t3_turbiny_s,
                p_min_pu=0.0,
                p_max_pu=1.1,
            )
            if z_turbina
            else None
        ),
        stabilizator=(
            zbuduj_stabilizator(
                wariant="PSS1A",
                ks=10.0,
                tw_s=10.0,
                t1_s=t1_pss_s,
                t2_s=t2_pss_s,
                t3_s=t3_pss_s,
                t4_s=t4_pss_s,
                limit_min_pu=-0.1,
                limit_max_pu=0.1,
            )
            if z_stabilizatorem
            else None
        ),
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
        **pola,
    )


# ---------------------------------------------------------------------------
# Przeksztaltnik nadazny (GFL)
# ---------------------------------------------------------------------------

#: Parametry przeksztaltnika 30 MVA. PLL celowo WOLNIEJSZY niz w aparacie
#: przemyslowym (kp = 6, ki = 60 zamiast kilkudziesieciu/kilku tysiecy), zeby mod
#: synchronizacji lezal w okolicy 1-2 Hz i dal sie ODCZYTAC z przebiegu przy
#: kroku 2 ms — przy pasmie 30 Hz mod bylby na granicy rozdzielczosci probek i
#: test porownywalby szum, nie czestotliwosc.
PARAMETRY_GFL: dict[str, float | str] = {
    "s_n_mva": 30.0,
    "i_max_pu": 1.2,
    "priorytet_ogranicznika": "bierna",
    "pll_kp": 6.0,
    "pll_ki": 60.0,
    "k_frt": 2.0,
    "prog_frt_pu": 0.9,
    "tp_s": 0.02,
    "tiq_s": 0.01,
    "p_odbudowa_pu_na_s": 1.0,
    "p_odbudowa_opoznienie_s": 0.05,
    "droop_p_f_pu": 0.04,
    "martwa_strefa_f_hz": 0.02,
    "droop_q_u_pu": 0.05,
    "martwa_strefa_u_pu": 0.01,
    "u_min_ciagle_pu": 0.85,
    "u_max_ciagle_pu": 1.1,
}


def rdzen_gfl(**nadpisania: float | str) -> RdzenGFL:
    pola = dict(PARAMETRY_GFL)
    pola.update(nadpisania)
    return zbuduj_rdzen_gfl(
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
        **pola,  # type: ignore[arg-type]
    )


def przeksztaltnik_gfl(
    *, ident: str = "PV1", wezel: str = "GEN", **nadpisania: float | str
) -> PrzeksztaltnikGFL:
    rdzen = rdzen_gfl(**nadpisania)
    moc_znamionowa = float(nadpisania.get("s_n_mva", PARAMETRY_GFL["s_n_mva"]))
    return PrzeksztaltnikGFL(
        ident=ident,
        wezel=wezel,
        rdzen=rdzen,
        okno_mocy=okno_tylko_oddawanie(moc_znamionowa / S_BAZOWA_MVA),
    )


# ---------------------------------------------------------------------------
# Przeksztaltnik tworzacy siec (GFM)
# ---------------------------------------------------------------------------

PARAMETRY_GFM: dict[str, float | str] = {
    "s_n_mva": 40.0,
    "tryb": "droop",
    "mp_pu": 0.04,
    "mq_pu": 0.05,
    "h_wirtualne_s": 4.0,
    "d_wirtualne_pu": 20.0,
    "r_wirtualne_pu": 0.02,
    "x_wirtualne_pu": 0.15,
    "i_max_pu": 1.2,
    "strategia_ograniczenia": "impedancja_wirtualna",
    "tp_s": 0.05,
    "tiq_s": 0.05,
}


def rdzen_gfm(**nadpisania: float | str) -> RdzenGFM:
    pola = dict(PARAMETRY_GFM)
    pola.update(nadpisania)
    return zbuduj_rdzen_gfm(
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
        **pola,  # type: ignore[arg-type]
    )


def przeksztaltnik_gfm(
    *, ident: str = "GFM1", wezel: str = "GEN", **nadpisania: float | str
) -> PrzeksztaltnikGFM:
    rdzen = rdzen_gfm(**nadpisania)
    moc_znamionowa = float(nadpisania.get("s_n_mva", PARAMETRY_GFM["s_n_mva"]))
    return PrzeksztaltnikGFM(
        ident=ident,
        wezel=wezel,
        rdzen=rdzen,
        okno_mocy=okno_symetryczne(moc_znamionowa / S_BAZOWA_MVA),
    )


# ---------------------------------------------------------------------------
# Magazyn
# ---------------------------------------------------------------------------

#: Magazyn 30 MVA / 20 MWh. Pojemnosc celowo MALA wobec mocy (2/3 h), zeby dryf
#: stanu naladowania byl mierzalny w przebiegu sekundowym.
PARAMETRY_MAGAZYNU: dict[str, float] = {
    "e_n_kwh": 20_000.0,
    "p_ladowania_max_kw": 25_000.0,
    "p_rozladowania_max_kw": 25_000.0,
    "sprawnosc_ladowania": 0.95,
    "sprawnosc_rozladowania": 0.93,
    "soc_min": 0.10,
    "soc_max": 0.90,
    "soc_poczatkowy": 0.50,
}


def magazyn(
    *,
    ident: str = "BESS1",
    wezel: str = "GEN",
    rdzen: RdzenGFL | RdzenGFM | None = None,
    s_n_przeksztaltnika_mva: float = 30.0,
    p_rezerwa_pu: float = 0.0,
    **nadpisania: float,
) -> Magazyn:
    pola = dict(PARAMETRY_MAGAZYNU)
    pola.update(nadpisania)
    return zbuduj_magazyn(
        ident=ident,
        wezel=wezel,
        rdzen=rdzen if rdzen is not None else rdzen_gfl(),
        zasobnik=zbuduj_zasobnik(
            p_rezerwa_pu=p_rezerwa_pu,
            s_n_przeksztaltnika_mva=s_n_przeksztaltnika_mva,
            s_bazowa_mva=S_BAZOWA_MVA,
            **pola,
        ),
    )


# ---------------------------------------------------------------------------
# Turbina wiatrowa
# ---------------------------------------------------------------------------

#: Turbina 30 MVA. Zakres kata lopat jest WASKI (0-1 stopnia) i tempo maksymalne,
#: zeby petla predkosc-kat miala okres okolo 2 s i dala sie zmierzyc w przebiegu
#: czterosekundowym. Przy zakresie 0-25 stopni ten sam mod ma okres ~40 s, wiec
#: test musialby calkowac minute na jedna asercje.
PARAMETRY_TURBINY: dict[str, float] = {
    "h_calkowite_s": 1.0,
    "pitch_tempo_deg_s": 30.0,
    "pitch_min_deg": 0.0,
    "pitch_max_deg": 1.0,
}


def turbina(
    *,
    ident: str = "WT1",
    wezel: str = "GEN",
    typ: str = "wiatr_typ_4",
    crowbar: NastawyCrowbar | None = None,
    s_n_mva: float = 30.0,
    rdzen: RdzenGFL | None = None,
    **nadpisania: float,
) -> TurbinaWiatrowa:
    pola = dict(PARAMETRY_TURBINY)
    pola.update(nadpisania)
    return zbuduj_turbine_wiatrowa(
        ident=ident,
        wezel=wezel,
        typ=typ,
        rdzen=rdzen if rdzen is not None else rdzen_gfl(s_n_mva=s_n_mva),
        crowbar=crowbar,
        okno_mocy=okno_tylko_oddawanie(s_n_mva / S_BAZOWA_MVA),
        s_n_mva=s_n_mva,
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
        **pola,
    )


def crowbar_typowy(
    *, prog_pradu_pu: float = 1.05, czas_zwloki_s: float = 0.02, czas_trwania_s: float = 0.15
) -> NastawyCrowbar:
    return NastawyCrowbar(
        prog_pradu_pu=prog_pradu_pu,
        czas_zwloki_s=czas_zwloki_s,
        czas_trwania_s=czas_trwania_s,
    )


__all__ = [
    "F_BAZOWA_HZ",
    "PARAMETRY_GFL",
    "PARAMETRY_GFM",
    "PARAMETRY_MAGAZYNU",
    "PARAMETRY_MASZYNY",
    "PARAMETRY_TURBINY",
    "S_BAZOWA_MVA",
    "U_N_KV",
    "X_LINII_PU",
    "UkladDwuwezlowy",
    "crowbar_typowy",
    "magazyn",
    "maszyna",
    "nastawy",
    "przeksztaltnik_gfl",
    "przeksztaltnik_gfm",
    "rdzen_gfl",
    "rdzen_gfm",
    "turbina",
    "zloz_uklad",
]
