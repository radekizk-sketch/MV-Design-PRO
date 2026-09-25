"""Zrodlo testowe stanowiska badawczego i tryb stanowiska (karta AB-1b.1, P7).

ILOCZYN CECH: {Norton za impedancja, idealne} x {skok U, rampa U, skok f, rampa f, skok
fazy} — kazdy segment osobno i caly profil kolejno — wobec postaci zamknietej wyroczni
(`walidacja_fizyczna.wyrocznia_zdarzen.profil_zamkniety`, zero importow z rdzenia); do tego
{segmenty nakladajace sie tej samej wielkosci} — odmowa w rdzeniu i w kontrakcie danych
(predykaty parami), mieszanie trybow — odmowa, jakobiany wobec roznicy skonczonej.
Twierdzenie D-14 i bramka G15 — `tests/walidacja_fizyczna`.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    OdmowaDynamiki,
    PunktPracy,
    SilnikDynamiki,
    WejscieDynamiki,
    WezelDynamiki,
    ZmianaGalezi,
    ZwarcieWezla,
    zloz_model_sieci,
)
from network_model.solvers.dynamika.kontrakty import (
    KOD_PARAMETRY_SPRZECZNE,
    KOD_ZDARZENIE_SPRZECZNE,
)
from network_model.solvers.dynamika.odbiory import charakterystyka_stalej_mocy
from network_model.solvers.dynamika.silnik import TRYB_SIEC, TRYB_STANOWISKO
from network_model.solvers.dynamika.urzadzenia import (
    RampaCzestotliwosci,
    RampaNapiecia,
    SkokCzestotliwosci,
    SkokFazy,
    SkokNapiecia,
    rozwin_profil,
    sprawdz_profil,
    zbuduj_zrodlo_testowe,
)

from tests.network_model.dynamika import uklady
from tests.walidacja_fizyczna.wyrocznia_zdarzen import profil_zamkniety

#: Odbior STALEJ MOCY bez zadeklarowanego napiecia przejscia (karta modeli odbiorow):
#: dokladnie dotychczasowy model tego wzorca — charakterystyka przy kazdym |V| > 0.
STALA_MOC = charakterystyka_stalej_mocy(u_min_pu=None)

F_N_HZ = 50.0
Z_NORTONA_PU = complex(0.001, 0.02)


#: Segment rdzenia -> segment wyroczni (rodzaj, t, wartosc, czas trwania).
def _segment_wyroczni(segment) -> tuple[str, float, float, float]:
    if isinstance(segment, SkokNapiecia):
        return ("skok_u", segment.t_s, segment.u_pu, 0.0)
    if isinstance(segment, RampaNapiecia):
        return ("rampa_u", segment.t_s, segment.tempo_pu_na_s, segment.czas_trwania_s)
    if isinstance(segment, SkokCzestotliwosci):
        return ("skok_f", segment.t_s, segment.odchylka_hz, 0.0)
    if isinstance(segment, RampaCzestotliwosci):
        return ("rampa_f", segment.t_s, segment.tempo_hz_na_s, segment.czas_trwania_s)
    return ("skok_fazy", segment.t_s, segment.kat_deg, 0.0)


SEGMENTY = {
    "skok_U": (SkokNapiecia(0.2, 0.5),),
    "rampa_U": (RampaNapiecia(0.2, -0.3, 0.4),),
    "skok_f": (SkokCzestotliwosci(0.2, -0.4),),
    "rampa_f": (RampaCzestotliwosci(0.2, 0.5, 0.4),),
    "skok_fazy": (SkokFazy(0.2, 30.0),),
    "profil_kolejno": (
        SkokNapiecia(0.2, 0.5),
        RampaNapiecia(0.4, 0.4, 0.5),
        SkokFazy(0.5, 30.0),
        RampaCzestotliwosci(0.6, 0.5, 0.3),
        SkokCzestotliwosci(0.95, 0.1),
        SkokFazy(0.95, -15.0),
    ),
}


def _wejscie(impedancja: complex | None, zdarzenia: tuple, *, horyzont_s: float = 1.2):
    """Zrodlo testowe na SRC -> linia -> odbior stalej mocy na ODB (punkt pracy dokladny)."""
    wezly = (WezelDynamiki("SRC", 15.0), WezelDynamiki("ODB", 15.0))
    galezie = (
        GalazDynamiki("L", "SRC", "ODB", 1.0 / complex(0.01, 0.05), 0.0, 1 + 0j, True, "linia"),
    )
    odbiory = (OdbiorDynamiki("O1", "ODB", 0.3, 0.1, charakterystyka=STALA_MOC),)
    y = zloz_model_sieci(wezly, galezie, ()).ybus.toarray()
    v_src = complex(1.0, 0.0)
    v_odb = complex(1.0, 0.0)
    for _ in range(100):
        v_odb = (-(complex(0.3, 0.1)).conjugate() / v_odb.conjugate() - y[1, 0] * v_src) / y[1, 1]
    prad = y[0, 0] * v_src + y[0, 1] * v_odb
    zrodlo = zbuduj_zrodlo_testowe(
        ident="ZT", wezel="SRC", impedancja_pu=impedancja, f_bazowa_hz=F_N_HZ
    )
    return WejscieDynamiki(
        wezly=wezly,
        galezie=galezie,
        odsprzegi=(),
        odbiory=odbiory,
        urzadzenia=(zrodlo,),
        punkt_pracy=PunktPracy({"SRC": v_src, "ODB": v_odb}, {"ZT": v_src * prad.conjugate()}),
        harmonogram=HarmonogramDynamiki(zdarzenia),
        nastawy=uklady.nastawy(dt_s=0.01, horyzont_s=horyzont_s, krok_wyjscia_s=0.05),
        s_bazowa_mva=100.0,
        f_bazowa_hz=F_N_HZ,
    ), v_src + (0 if impedancja is None else impedancja * prad)


@pytest.mark.parametrize("impedancja", [None, Z_NORTONA_PU], ids=["idealne", "norton"])
@pytest.mark.parametrize("nazwa", sorted(SEGMENTY))
def test_profil_wobec_postaci_zamknietej(impedancja: complex | None, nazwa: str) -> None:
    """|E(t)|, theta(t) + phi(t) i dw(t) wobec postaci zamknietej odcinkami wielomianowej —
    blad na poziomie zaokraglen (rownania liniowe, trapez bez bledu dyskretyzacji)."""
    profil = SEGMENTY[nazwa]
    wejscie, sem_0 = _wejscie(impedancja, rozwin_profil("ZT", profil, f_bazowa_hz=F_N_HZ))
    wynik = SilnikDynamiki(wejscie).uruchom()
    segmenty = tuple(_segment_wyroczni(segment) for segment in profil)
    blad = 0.0
    for i, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True)):
        m, kat, odchylka = profil_zamkniety(
            segmenty,
            m_0=abs(sem_0),
            kat_0_rad=math.atan2(sem_0.imag, sem_0.real),
            f_n_hz=F_N_HZ,
            t_s=t,
            strona=strona,
        )
        kat_produktu = (
            wynik.probki["sem_kat_rad@ZT"][i] + wynik.probki["sem_przesuniecie_fazy_rad@ZT"][i]
        )
        blad = max(
            blad,
            abs(wynik.probki["sem_modul_pu@ZT"][i] - m) / abs(m),
            abs(kat_produktu - kat) / max(abs(kat), 1.0),
            abs(wynik.probki["odchylka_pulsacji_pu@ZT"][i] - odchylka),
        )
    assert blad <= 1e-12, blad
    assert wynik.tryb_scenariusza == TRYB_STANOWISKO
    assert any(zdanie.startswith("Tryb stanowiska badawczego") for zdanie in wynik.zalozenia)
    assert {z.delta_x_nieprzypisane_max for z in wynik.zdarzenia_wykonane} == {0.0}


@pytest.mark.parametrize("nazwa", ["skok_U", "rampa_U", "rampa_f", "profil_kolejno"])
def test_zrodlo_idealne_narzuca_napiecie_i_czestotliwosc_wezla(nazwa: str) -> None:
    """Z = 0: napiecie wezla = E(t) (wiersz ograniczenia), a `f_hz` probek C = f_n (1 + dw)
    — zamyka W6-A F-3 (narzucona odchylka czestotliwosci szyny)."""
    wejscie, _ = _wejscie(None, rozwin_profil("ZT", SEGMENTY[nazwa], f_bazowa_hz=F_N_HZ))
    wynik = SilnikDynamiki(wejscie).uruchom()
    for i, strona in enumerate(wynik.strona_probki):
        assert abs(wynik.probki["u_pu@SRC"][i] - wynik.probki["sem_modul_pu@ZT"][i]) <= 4e-16
        if strona == "C":
            oczekiwana = F_N_HZ * (1.0 + wynik.probki["odchylka_pulsacji_pu@ZT"][i])
            assert abs(wynik.probki["f_hz@SRC"][i] - oczekiwana) <= 1e-10
        else:
            assert wynik.probki["f_hz@SRC"][i] is None
    assert wynik.probki["stan_zasilania@SRC"][0] == 2.0  # napiecie narzucone


@pytest.mark.parametrize(
    ("profil", "fragment"),
    [
        ((SkokNapiecia(0.2, 0.5), SkokNapiecia(0.2, 0.7)), "dwa skoki amplitudy"),
        ((SkokCzestotliwosci(0.3, 0.1), SkokCzestotliwosci(0.3, 0.2)), "dwa skoki czestotliwosci"),
        ((RampaNapiecia(0.2, 0.1, 0.5), RampaNapiecia(0.6, 0.1, 0.2)), "rampy amplitudy"),
        ((RampaCzestotliwosci(0.2, 0.1, 0.5), RampaCzestotliwosci(0.3, 0.1, 0.1)), "rampy czest"),
        ((RampaNapiecia(0.2, 0.1, 0.5), SkokNapiecia(0.4, 0.9)), "wewnątrz rampy"),
        ((RampaCzestotliwosci(0.2, 0.1, 0.5), SkokCzestotliwosci(0.3, 0.1)), "wewnątrz rampy"),
        ((RampaNapiecia(0.2, 0.1, 0.0),), "czas trwania"),
        ((RampaNapiecia(0.2, 0.1, -1.0),), "czas trwania"),
        ((SkokNapiecia(0.2, -0.1),), "amplitude"),
        ((SkokFazy(-0.1, 10.0),), "przed t = 0"),
        ((SkokFazy(0.1, math.nan),), "liczbą skończoną"),
    ],
)
def test_profil_niespojny_to_odmowa_w_rdzeniu(profil: tuple, fragment: str) -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        sprawdz_profil(profil)
    assert blad.value.kod == KOD_ZDARZENIE_SPRZECZNE
    assert fragment in str(blad.value)


@pytest.mark.parametrize(
    "profil",
    [
        (RampaNapiecia(0.2, 0.1, 0.5), SkokNapiecia(0.2, 0.9)),  # skok w chwili poczatku rampy
        (RampaNapiecia(0.2, 0.1, 0.5), SkokNapiecia(0.7, 0.9)),  # skok w chwili konca rampy
        (RampaNapiecia(0.2, 0.1, 0.5), RampaNapiecia(0.7, -0.1, 0.5)),  # rampy styczne
        (SkokFazy(0.3, 10.0), SkokFazy(0.3, 5.0)),  # skoki fazy sumuja sie jednoznacznie
        (RampaNapiecia(0.2, 0.1, 0.5), RampaCzestotliwosci(0.2, 0.1, 0.5)),  # rozne wielkosci
    ],
)
def test_profil_spojny_na_granicach_segmentow_jest_przyjety(profil: tuple) -> None:
    sprawdz_profil(profil)


def test_rampy_styczne_konczy_zero_przed_nowym_tempem() -> None:
    """Koniec rampy i poczatek nastepnej w jednej chwili: tempo zero PRZED nowym tempem —
    kolejnosc przypisan jest trescia (inaczej druga rampa nigdy by nie ruszyla)."""
    przypisania = rozwin_profil(
        "ZT", (RampaNapiecia(0.2, 0.1, 0.5), RampaNapiecia(0.7, -0.2, 0.3)), f_bazowa_hz=F_N_HZ
    )
    w_chwili = [p.wartosc for p in przypisania if p.t_s == 0.7]
    assert w_chwili == [0.0, -0.2]


def test_skoki_fazy_przypisuja_sume_skumulowana() -> None:
    przypisania = rozwin_profil(
        "ZT", (SkokFazy(0.2, 30.0), SkokFazy(0.5, -10.0), SkokFazy(0.5, 5.0)), f_bazowa_hz=F_N_HZ
    )
    assert [p.stan for p in przypisania] == ["sem_przesuniecie_fazy_rad"] * 3
    assert [p.wartosc for p in przypisania] == [
        math.radians(30.0),
        math.radians(20.0),
        math.radians(25.0),
    ]


def test_profil_rdzenia_i_kontraktu_danych_przyjmuja_i_odrzucaja_te_same_profile() -> None:
    """PREDYKATY PARAMI: walidator `StanowiskoBadawcze` (dane) i `sprawdz_profil` (rdzen)
    rozstrzygaja nakladanie segmentow tak samo — dwie strony tej samej reguly."""
    from enm.scenariusze import StanowiskoBadawcze
    from pydantic import ValidationError

    przypadki = [
        (SkokNapiecia(0.2, 0.5), SkokNapiecia(0.2, 0.7)),
        (RampaNapiecia(0.2, 0.1, 0.5), RampaNapiecia(0.6, 0.1, 0.2)),
        (RampaNapiecia(0.2, 0.1, 0.5), SkokNapiecia(0.4, 0.9)),
        (RampaCzestotliwosci(0.2, 0.1, 0.5), SkokCzestotliwosci(0.3, 0.1)),
        (RampaNapiecia(0.2, 0.1, 0.5), SkokNapiecia(0.2, 0.9)),
        (RampaNapiecia(0.2, 0.1, 0.5), SkokNapiecia(0.7, 0.9)),
        (RampaNapiecia(0.2, 0.1, 0.5), RampaNapiecia(0.7, -0.1, 0.5)),
        (SkokFazy(0.3, 10.0), SkokFazy(0.3, 5.0)),
        (SkokCzestotliwosci(0.3, 0.1), RampaCzestotliwosci(0.3, 0.1, 0.5)),
    ]
    for profil in przypadki:
        try:
            sprawdz_profil(profil)
            rdzen = True
        except OdmowaDynamiki:
            rdzen = False
        dane_profilu = [
            {
                SkokNapiecia: lambda s: {"rodzaj": "skok_napiecia", "t_s": s.t_s, "u_pu": s.u_pu},
                RampaNapiecia: lambda s: {
                    "rodzaj": "rampa_napiecia",
                    "t_s": s.t_s,
                    "tempo_pu_na_s": s.tempo_pu_na_s,
                    "czas_trwania_s": s.czas_trwania_s,
                },
                SkokCzestotliwosci: lambda s: {
                    "rodzaj": "skok_czestotliwosci",
                    "t_s": s.t_s,
                    "odchylka_hz": s.odchylka_hz,
                },
                RampaCzestotliwosci: lambda s: {
                    "rodzaj": "rampa_czestotliwosci",
                    "t_s": s.t_s,
                    "tempo_hz_na_s": s.tempo_hz_na_s,
                    "czas_trwania_s": s.czas_trwania_s,
                },
                SkokFazy: lambda s: {"rodzaj": "skok_fazy", "t_s": s.t_s, "kat_deg": s.kat_deg},
            }[type(segment)](segment)
            for segment in profil
        ]
        try:
            StanowiskoBadawcze(zrodlo_ref="Q1", impedancja="idealna", profil=dane_profilu)
            dane = True
        except ValidationError:
            dane = False
        assert rdzen == dane, profil


@pytest.mark.parametrize(
    "zaklocenie",
    [
        ZwarcieWezla(0.3, "ODB", "3F", 0.0, 1.0, None, None),
        ZmianaGalezi(0.3, "L", False),
    ],
    ids=["zwarcie", "laczenie"],
)
def test_mieszanie_trybu_stanowiska_z_zakloceniem_sieci_to_odmowa(zaklocenie) -> None:
    profil = rozwin_profil("ZT", (SkokNapiecia(0.2, 0.9),), f_bazowa_hz=F_N_HZ)
    wejscie, _ = _wejscie(None, (*profil, zaklocenie))
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(wejscie).uruchom()
    assert blad.value.kod == KOD_ZDARZENIE_SPRZECZNE
    assert "stanowiska" in str(blad.value)


def test_bieg_bez_zrodla_testowego_jest_trybem_sieci() -> None:
    wynik = SilnikDynamiki(
        uklady.zbuduj_smib().wejscie(HarmonogramDynamiki(()), uklady.nastawy(horyzont_s=0.05))
    ).uruchom()
    assert wynik.tryb_scenariusza == TRYB_SIEC
    assert not any(zdanie.startswith("Tryb stanowiska") for zdanie in wynik.zalozenia)


def test_zerowa_impedancja_nortona_to_odmowa_nazwana() -> None:
    """Z = 0 jest wariantem `idealna` (wiersz ograniczenia), nie granicznym przypadkiem Nortona."""
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj_zrodlo_testowe(ident="ZT", wezel="SRC", impedancja_pu=0j, f_bazowa_hz=F_N_HZ)
    assert blad.value.kod == KOD_PARAMETRY_SPRZECZNE


@pytest.mark.parametrize("impedancja", [None, Z_NORTONA_PU], ids=["idealne", "norton"])
def test_jakobiany_zrodla_testowego_wobec_roznicy_skonczonej(impedancja: complex | None) -> None:
    zrodlo = zbuduj_zrodlo_testowe(
        ident="ZT", wezel="SRC", impedancja_pu=impedancja, f_bazowa_hz=F_N_HZ
    )
    stan = np.array([0.93, 0.2, 0.4, 0.1, 0.003, -0.02])
    napiecie = complex(0.97, 0.05)
    krok = 1e-7
    for kolumna in range(stan.size):
        plus, minus = stan.copy(), stan.copy()
        plus[kolumna] += krok
        minus[kolumna] -= krok
        roznica_f = (zrodlo.pochodne(plus, napiecie) - zrodlo.pochodne(minus, napiecie)) / (
            2 * krok
        )
        assert zrodlo.jakobian_stan_stan(stan, napiecie)[:, kolumna] == pytest.approx(
            roznica_f, abs=1e-7
        )
        e_plus, e_minus = zrodlo.sem(plus), zrodlo.sem(minus)
        roznica_e = (e_plus - e_minus) / (2 * krok)
        assert zrodlo.jakobian_napiecia_bez_obciazenia(stan)[:, kolumna] == pytest.approx(
            [roznica_e.real, roznica_e.imag], abs=1e-7
        )
        if impedancja is not None:
            i_plus = zrodlo.prad_pu(plus, napiecie)
            i_minus = zrodlo.prad_pu(minus, napiecie)
            roznica_i = (i_plus - i_minus) / (2 * krok)
            assert zrodlo.jakobian_prad_stan(stan, napiecie)[:, kolumna] == pytest.approx(
                [roznica_i.real, roznica_i.imag], abs=1e-6
            )
    assert zrodlo.sprzezenie == ("napieciowe" if impedancja is None else "pradowe")
