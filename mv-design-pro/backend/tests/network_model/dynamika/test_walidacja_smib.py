"""Bramka odbioru rdzenia: wyrocznie analityczne SMIB (karta W6-2 SS0 p.7 a/b/d).

CZTERY NIEZALEZNE MIARY tego samego rdzenia, kazda inna droga:

a) **Krytyczny czas usuniecia zwarcia (CCT).** Bisekcja na SILNIKU (calkowanie w
   czasie, zdarzenia, re-inicjalizacja) wobec kryterium RÓWNYCH PÓL (calka
   pierwsza rownania ruchu na ukladzie zredukowanym Kronem). Zaden wspolny kod
   poza opisem sieci.
b) **Czestotliwosc modu elektromechanicznego.** Odczytana z PRZEBIEGU (przejscia
   przez wartosc srednia) wobec WARTOSCI WLASNYCH macierzy stanu w punkcie pracy.
c) **Calka pierwsza przy D = 0.** Dryf funkcji energii i jego malenie z krokiem
   jak `dt^2` (rzad trapezu).
d) **Bilans energii przy D > 0.** Przyrost energii kinetycznej wobec calki z mocy
   niezbilansowanej, liczonej na siatce probek.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    OdmowaDynamiki,
    SilnikDynamiki,
    ZwarcieWezla,
    zloz_model_sieci,
)
from network_model.solvers.dynamika.calkowanie import KontekstKroku
from network_model.solvers.dynamika.konwencje import admitancja_zwarcia_pu
from network_model.solvers.dynamika.walidacja import (
    UkladNieprzystajeDoWyroczni,
    charakterystyka_mocy,
    czas_krytyczny_rownych_pol,
    dryf_calki_pierwszej,
    kat_szyny,
    mod_oscylacyjny,
    mody,
    niezbilansowanie_bilansu_energii,
    parametry_calki_pierwszej,
)

from tests.network_model.dynamika.uklady import (
    S_BAZOWA_MVA,
    U_N_KV,
    X_ZWARCIA_OHM,
    nastawy,
    zbuduj_smib,
    zbuduj_smib_z_odbiorem,
)

#: Kryterium odbioru CCT z karty: blad wzgledny bisekcji wobec rownych pol <= 2 %.
TOLERANCJA_CCT = 0.02
#: Kryterium odbioru czestotliwosci modu z karty: <= 1 %.
TOLERANCJA_CZESTOTLIWOSCI = 0.01


def _stany_i_charakterystyka(uklad, admitancje_zwarc=()):
    model = zloz_model_sieci(uklad.wezly, uklad.galezie, (), admitancje_zwarc=admitancje_zwarc)
    stan_maszyny = uklad.maszyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["GEN"], uklad.punkt_pracy.moce_zrodel_pu["G1"]
    )
    stan_szyny = uklad.szyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["SYS"], uklad.punkt_pracy.moce_zrodel_pu["SYS1"]
    )
    charakterystyka = charakterystyka_mocy(
        model, (), uklad.maszyna, uklad.szyna, stan_maszyny, stan_szyny
    )
    return model, stan_maszyny, stan_szyny, charakterystyka


def test_redukcja_kronem_odtwarza_moc_punktu_pracy() -> None:
    """`P_max sin(delta12)` w punkcie pracy == moc czynna generatora z rozpływu."""
    uklad = zbuduj_smib()
    _, stan_maszyny, stan_szyny, charakterystyka = _stany_i_charakterystyka(uklad)
    delta12 = float(stan_maszyny[0]) - kat_szyny(stan_szyny)
    moc = charakterystyka.moc_elektryczna_pu(float(stan_maszyny[0]), kat_szyny(stan_szyny))
    assert charakterystyka.theta_12_rad == pytest.approx(math.pi / 2.0, abs=1e-12)
    assert charakterystyka.g11_pu == pytest.approx(0.0, abs=1e-15)
    assert moc == pytest.approx(uklad.punkt_pracy.moce_zrodel_pu["G1"].real, abs=1e-12)
    assert charakterystyka.p_max_pu * math.sin(delta12) == pytest.approx(moc, abs=1e-12)


def test_wyrocznia_odmawia_ukladu_z_odbiorem_stalej_mocy() -> None:
    """Redukcja Krona jest dokladna TYLKO dla stalych admitancji — zero „przyblizenia"."""
    uklad = zbuduj_smib_z_odbiorem()
    model = zloz_model_sieci(uklad.wezly, uklad.galezie, ())
    stan_maszyny = uklad.maszyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["GEN"], uklad.punkt_pracy.moce_zrodel_pu["G1"]
    )
    stan_szyny = uklad.szyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["SYS"], uklad.punkt_pracy.moce_zrodel_pu["SYS1"]
    )
    with pytest.raises(UkladNieprzystajeDoWyroczni, match="stalych admitancjach"):
        charakterystyka_mocy(
            model, uklad.odbiory, uklad.maszyna, uklad.szyna, stan_maszyny, stan_szyny
        )


def _wyrocznia_cct(uklad):
    _, stan_maszyny, _, przed = _stany_i_charakterystyka(uklad)
    admitancja = admitancja_zwarcia_pu(0.0, X_ZWARCIA_OHM, U_N_KV, S_BAZOWA_MVA)
    _, _, _, w_zwarciu = _stany_i_charakterystyka(uklad, admitancje_zwarc=(("GEN", admitancja),))
    return czas_krytyczny_rownych_pol(
        p_mechaniczna_pu=float(stan_maszyny[2]),
        p_max_przed_pu=przed.p_max_pu,
        p_max_w_zwarciu_pu=w_zwarciu.p_max_pu,
        p_max_po_pu=przed.p_max_pu,
        h_s=uklad.maszyna.h_s,
        omega_bazowa_rad_s=uklad.maszyna.omega_bazowa_rad_s,
    )


def _stabilny(uklad, czas_trwania_s: float) -> bool:
    """Czy maszyna utrzymuje synchronizm przy zwarciu o zadanym czasie trwania.

    Utrata synchronizmu objawia sie przekroczeniem kata `pi` (wirnik ucieka) albo
    brakiem rozwiazania algebry — oba przypadki sa NIESTABILNOSCIA, nie awaria
    narzedzia, i oba sa tu liczone tak samo.
    """
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.1,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_OHM,
                t_usuniecia_s=0.1 + czas_trwania_s,
                sposob_usuniecia="samoczynne",
            ),
        )
    )
    try:
        wynik = SilnikDynamiki(
            uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=2.0, krok_wyjscia_s=0.01))
        ).uruchom()
    except OdmowaDynamiki:
        return False
    return max(wynik.probki["delta_rad@G1"]) < math.pi


def test_cct_z_bisekcji_zgadza_sie_z_kryterium_rownych_pol() -> None:
    """(a) CCT z SILNIKA wobec CCT ANALITYCZNEGO — kryterium odbioru <= 2 %."""
    uklad = zbuduj_smib(d_pu=0.0)
    wyrocznia = _wyrocznia_cct(uklad)
    assert 0.1 < wyrocznia.czas_krytyczny_s < 0.5
    assert wyrocznia.delta_0_rad < wyrocznia.delta_krytyczny_rad < wyrocznia.delta_max_rad

    dolna, gorna = 0.05, 0.6
    assert _stabilny(uklad, dolna)
    assert not _stabilny(uklad, gorna)
    for _ in range(12):
        srodek = 0.5 * (dolna + gorna)
        if _stabilny(uklad, srodek):
            dolna = srodek
        else:
            gorna = srodek
    cct_bisekcji = 0.5 * (dolna + gorna)
    blad = abs(cct_bisekcji - wyrocznia.czas_krytyczny_s) / wyrocznia.czas_krytyczny_s
    assert blad <= TOLERANCJA_CCT, (
        f"CCT bisekcja {cct_bisekcji:.6f} s vs rowne pola "
        f"{wyrocznia.czas_krytyczny_s:.6f} s — blad {blad * 100:.3f} %"
    )


def test_czestotliwosc_modu_z_przebiegu_zgadza_sie_z_wartosciami_wlasnymi() -> None:
    """(b) Czestotliwosc z PRZEBIEGU wobec WARTOSCI WLASNYCH — kryterium <= 1 %."""
    uklad = zbuduj_smib(d_pu=0.0)
    model, stan_maszyny, stan_szyny, _ = _stany_i_charakterystyka(uklad)
    kontekst = KontekstKroku(model, (), (uklad.maszyna, uklad.szyna), nastawy())
    napiecia = np.array(
        [uklad.punkt_pracy.napiecia_pu[ident] for ident in model.identy_wezlow], dtype=complex
    )
    mod = mod_oscylacyjny(mody(kontekst, (stan_maszyny, stan_szyny), napiecia))
    assert mod.wspolczynnik_tlumienia == pytest.approx(0.0, abs=1e-9)

    # Male zaburzenie: zwarcie o duzej impedancji na krotko — wychylenie male, wiec
    # nieliniowosc wahadla nie przesuwa czestotliwosci istotnie (przy duzym
    # wychyleniu okres ROSNIE, co jest fizyka, nie bledem metody).
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.05,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=50.0,
                t_usuniecia_s=0.06,
                sposob_usuniecia="samoczynne",
            ),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.0005, horyzont_s=4.0, krok_wyjscia_s=0.0005))
    ).uruchom()
    czas = np.array(wynik.os_czasu_s)
    delta = np.array(wynik.probki["delta_rad@G1"])
    maska = czas >= 0.06
    czas_po, delta_po = czas[maska], delta[maska]
    srednia = float(delta_po.mean())
    przejscia = [
        czas_po[i]
        + (czas_po[i + 1] - czas_po[i]) * (srednia - delta_po[i]) / (delta_po[i + 1] - delta_po[i])
        for i in range(len(czas_po) - 1)
        if (delta_po[i] - srednia) * (delta_po[i + 1] - srednia) < 0
    ]
    assert len(przejscia) >= 5, f"za malo przejsc przez srednia: {len(przejscia)}"
    okres = 2.0 * (przejscia[-1] - przejscia[0]) / (len(przejscia) - 1)
    czestotliwosc_przebiegu = 1.0 / okres
    blad = abs(czestotliwosc_przebiegu - mod.czestotliwosc_hz) / mod.czestotliwosc_hz
    assert blad <= TOLERANCJA_CZESTOTLIWOSCI, (
        f"f_przebieg = {czestotliwosc_przebiegu:.6f} Hz vs f_mod = "
        f"{mod.czestotliwosc_hz:.6f} Hz — blad {blad * 100:.4f} %"
    )


def test_tlumienie_z_wartosci_wlasnych_rosnie_z_wspolczynnikiem_D() -> None:
    """Predykat pary: `D = 0` daje `zeta = 0`, `D > 0` daje `zeta > 0`."""
    tlumienia = []
    for d_pu in (0.0, 2.0, 8.0):
        uklad = zbuduj_smib(d_pu=d_pu)
        model, stan_maszyny, stan_szyny, _ = _stany_i_charakterystyka(uklad)
        kontekst = KontekstKroku(model, (), (uklad.maszyna, uklad.szyna), nastawy())
        napiecia = np.array(
            [uklad.punkt_pracy.napiecia_pu[ident] for ident in model.identy_wezlow],
            dtype=complex,
        )
        tlumienia.append(
            mod_oscylacyjny(
                mody(kontekst, (stan_maszyny, stan_szyny), napiecia)
            ).wspolczynnik_tlumienia
        )
    assert tlumienia[0] == pytest.approx(0.0, abs=1e-9)
    assert tlumienia[0] < tlumienia[1] < tlumienia[2]


def _dryf_energii(uklad, dt_s: float) -> float:
    _, stan_maszyny, stan_szyny, charakterystyka = _stany_i_charakterystyka(uklad)
    delta_szyny = kat_szyny(stan_szyny)
    parametry = parametry_calki_pierwszej(
        charakterystyka, uklad.maszyna, stan_maszyny, float(stan_maszyny[0]) - delta_szyny
    )
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.1,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_OHM,
                t_usuniecia_s=0.18,
                sposob_usuniecia="samoczynne",
            ),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=dt_s, horyzont_s=2.0, krok_wyjscia_s=0.02))
    ).uruchom()
    czas = np.array(wynik.os_czasu_s)
    maska = czas >= 0.18
    return dryf_calki_pierwszej(
        np.array(wynik.probki["delta_rad@G1"])[maska] - delta_szyny,
        np.array(wynik.probki["omega_pu@G1"])[maska],
        parametry,
    )


def test_calka_pierwsza_jest_zachowana_i_dryf_maleje_jak_kwadrat_kroku() -> None:
    """(c) `D = 0`: dryf funkcji energii maly i malejacy jak `dt^2` (rzad trapezu).

    Odcinek pomiarowy zaczyna sie PO zdjeciu zwarcia, bo dopiero wtedy
    charakterystyka mocy wraca do tej, dla ktorej funkcja energii jest calka
    pierwsza. Wartosci Z POMIARU (2026-09-17): dryf 6,0e-07 / 1,5e-07 / 3,8e-08
    dla dt = 0,002 / 0,001 / 0,0005, ilorazy 4,000 i 4,000.
    """
    uklad = zbuduj_smib(d_pu=0.0)
    dryfy = [_dryf_energii(uklad, dt) for dt in (0.002, 0.001, 0.0005)]
    assert dryfy[0] < 1.0e-5
    assert dryfy[0] > dryfy[1] > dryfy[2] > 0.0
    for wiekszy, mniejszy in zip(dryfy, dryfy[1:], strict=False):
        assert 3.6 <= wiekszy / mniejszy <= 4.4, f"iloraz {wiekszy / mniejszy} poza rzedem 2"


def test_bilans_energii_domyka_sie_takze_przy_tlumieniu() -> None:
    """(d) `D > 0`: przyrost energii kinetycznej == calka z mocy niezbilansowanej."""
    uklad = zbuduj_smib(d_pu=4.0)
    _, stan_maszyny, stan_szyny, charakterystyka = _stany_i_charakterystyka(uklad)
    parametry = parametry_calki_pierwszej(
        charakterystyka,
        uklad.maszyna,
        stan_maszyny,
        float(stan_maszyny[0]) - kat_szyny(stan_szyny),
    )
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.1,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_OHM,
                t_usuniecia_s=0.18,
                sposob_usuniecia="samoczynne",
            ),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.0005, horyzont_s=2.0, krok_wyjscia_s=0.002))
    ).uruchom()
    czas = np.array(wynik.os_czasu_s)
    maska = czas >= 0.18
    niezbilansowanie = niezbilansowanie_bilansu_energii(
        czas[maska],
        np.array(wynik.probki["omega_pu@G1"])[maska],
        np.array(wynik.probki["p_pu@G1"])[maska],
        parametry,
        uklad.maszyna.d_pu,
    )
    energia_szczytowa = float(
        np.max(np.abs(np.array(wynik.probki["omega_pu@G1"])[maska] - 1.0))
        * parametry.omega_bazowa_rad_s
    )
    assert niezbilansowanie < 1.0e-4 * max(energia_szczytowa, 1.0)


def test_tlumienie_wygasza_kolysania_a_jego_brak_nie() -> None:
    """Predykat pary: ten sam bieg z `D = 0` i `D > 0` — amplituda maleje tylko z D."""
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.1,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_OHM,
                t_usuniecia_s=0.18,
                sposob_usuniecia="samoczynne",
            ),
        )
    )
    amplitudy = []
    for d_pu in (0.0, 6.0):
        wynik = SilnikDynamiki(
            zbuduj_smib(d_pu=d_pu).wejscie(
                harmonogram, nastawy(dt_s=0.001, horyzont_s=4.0, krok_wyjscia_s=0.01)
            )
        ).uruchom()
        delta = np.array(wynik.probki["delta_rad@G1"])
        polowa = len(delta) // 2
        amplitudy.append((float(np.ptp(delta[:polowa])), float(np.ptp(delta[polowa:]))))
    bez_tlumienia, z_tlumieniem = amplitudy
    assert bez_tlumienia[1] == pytest.approx(bez_tlumienia[0], rel=0.02)
    assert z_tlumieniem[1] < 0.5 * z_tlumieniem[0]
