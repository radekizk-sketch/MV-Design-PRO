"""Silnik: bramka inicjalizacji, siatka probek, slad WHITE BOX, odmowy wejscia."""

from __future__ import annotations

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    OdmowaDynamiki,
    PunktPracy,
    SilnikDynamiki,
    SkokObciazenia,
    WejscieDynamiki,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.kontrakty import KOD_INICJALIZACJA_NIEZBIEZNA
from network_model.solvers.dynamika.silnik import ZALOZENIA_RDZENIA, jednostka_stanu

from tests.network_model.dynamika.uklady import (
    X_ZWARCIA_OHM,
    X_ZWARCIA_PLYTKIEGO_OHM,
    nastawy,
    zbuduj_smib,
    zbuduj_smib_z_odbiorem,
)

BEZ_ZDARZEN = HarmonogramDynamiki(())


def test_stan_ustalony_jest_DOKLADNIE_ustalony() -> None:
    """Bieg bez zdarzen z punktu pracy nie moze sie ruszyc — zero „artefaktu rozruchu"."""
    uklad = zbuduj_smib()
    wynik = SilnikDynamiki(
        uklad.wejscie(BEZ_ZDARZEN, nastawy(dt_s=0.001, horyzont_s=1.0, krok_wyjscia_s=0.01))
    ).uruchom()
    assert float(np.ptp(wynik.probki["delta_rad@G1"])) < 1e-13
    assert float(np.ptp(wynik.probki["omega_pu@G1"])) < 1e-13
    assert float(np.ptp(wynik.probki["u_pu@GEN"])) < 1e-13
    assert wynik.wlasnosci.max_residuum_f < 1e-11
    assert wynik.wlasnosci.max_residuum_g < 1e-11
    assert wynik.wlasnosci.zbiegl is True


def test_siatka_probek_jest_dokladna_i_kompletna() -> None:
    """Probki leza DOKLADNIE na siatce `k * krok_wyjscia_s`, z probka zerowa wlacznie."""
    uklad = zbuduj_smib()
    wynik = SilnikDynamiki(
        uklad.wejscie(BEZ_ZDARZEN, nastawy(dt_s=0.001, horyzont_s=0.5, krok_wyjscia_s=0.05))
    ).uruchom()
    assert len(wynik.os_czasu_s) == 11
    for indeks, chwila in enumerate(wynik.os_czasu_s):
        assert chwila == pytest.approx(indeks * 0.05, abs=1e-12)
    for kanal in wynik.kanaly:
        assert len(wynik.probki[kanal.klucz]) == len(wynik.os_czasu_s)


def test_krok_wyjscia_niewspolmierny_z_krokiem_calkowania() -> None:
    """Siatka probek NIE musi byc wielokrotnoscia kroku — krok jest do niej skracany."""
    uklad = zbuduj_smib()
    wynik = SilnikDynamiki(
        uklad.wejscie(BEZ_ZDARZEN, nastawy(dt_s=0.003, horyzont_s=0.2, krok_wyjscia_s=0.007))
    ).uruchom()
    for indeks, chwila in enumerate(wynik.os_czasu_s):
        assert chwila == pytest.approx(indeks * 0.007, abs=1e-12)
    assert wynik.os_czasu_s[-1] <= 0.2


def test_zdarzenie_w_chwili_zero_jest_w_probce_zerowej() -> None:
    """Regula: probka w chwili `t` to stan PO zdarzeniach tej chwili — takze dla t = 0."""
    uklad = zbuduj_smib()
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.0,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_PLYTKIEGO_OHM,
                t_usuniecia_s=0.1,
            ),
        )
    )
    bez = SilnikDynamiki(
        uklad.wejscie(BEZ_ZDARZEN, nastawy(dt_s=0.001, horyzont_s=0.3, krok_wyjscia_s=0.01))
    ).uruchom()
    ze_zwarciem = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.001, horyzont_s=0.3, krok_wyjscia_s=0.01))
    ).uruchom()
    assert ze_zwarciem.probki["u_pu@GEN"][0] < bez.probki["u_pu@GEN"][0]
    assert ze_zwarciem.zdarzenia_wykonane[0].t_wykonany_s == 0.0


def test_bramka_rownowagi_odmawia_z_wektorem_residuow() -> None:
    """Punkt pracy niespojny = odmowa z residuami PER URZADZENIE i PER WEZEL."""
    uklad = zbuduj_smib()
    zle_moce = dict(uklad.punkt_pracy.moce_zrodel_pu)
    zle_moce["G1"] = zle_moce["G1"] + complex(0.3, 0.0)
    wejscie = WejscieDynamiki(
        wezly=uklad.wezly,
        galezie=uklad.galezie,
        odsprzegi=(),
        odbiory=(),
        urzadzenia=(uklad.maszyna, uklad.szyna),
        punkt_pracy=PunktPracy(
            napiecia_pu=dict(uklad.punkt_pracy.napiecia_pu), moce_zrodel_pu=zle_moce
        ),
        harmonogram=BEZ_ZDARZEN,
        nastawy=nastawy(),
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(wejscie).uruchom()
    assert blad.value.kod == KOD_INICJALIZACJA_NIEZBIEZNA
    residua_urzadzen = dict(blad.value.szczegoly["residua_urzadzen"])
    assert set(residua_urzadzen) == {"G1", "SYS1"}
    assert dict(blad.value.szczegoly["residua_wezlow"]).keys() == {"GEN", "SYS"}
    assert blad.value.szczegoly["residuum_g"] > blad.value.szczegoly["eps_init"]


def test_bramka_rownowagi_przepuszcza_punkt_z_rozplywu() -> None:
    """Predykat pary: punkt SPOJNY przechodzi bramke z residuami ponizej eps."""
    uklad = zbuduj_smib_z_odbiorem()
    wynik = SilnikDynamiki(
        uklad.wejscie(BEZ_ZDARZEN, nastawy(dt_s=0.002, horyzont_s=0.2, krok_wyjscia_s=0.05))
    ).uruchom()
    inicjalizacja = wynik.slad_white_box["inicjalizacja"]
    assert inicjalizacja["residuum_f"] <= inicjalizacja["eps_init"]
    assert inicjalizacja["residuum_g"] <= inicjalizacja["eps_init"]
    assert {wpis["urzadzenie"] for wpis in inicjalizacja["urzadzenia"]} == {"G1", "SYS1"}


def test_brak_napiecia_wezla_w_punkcie_pracy_jest_odmowa_nazwana() -> None:
    uklad = zbuduj_smib()
    bez_sys = {"GEN": uklad.punkt_pracy.napiecia_pu["GEN"]}
    wejscie = WejscieDynamiki(
        wezly=uklad.wezly,
        galezie=uklad.galezie,
        odsprzegi=(),
        odbiory=(),
        urzadzenia=(uklad.maszyna, uklad.szyna),
        punkt_pracy=PunktPracy(
            napiecia_pu=bez_sys, moce_zrodel_pu=dict(uklad.punkt_pracy.moce_zrodel_pu)
        ),
        harmonogram=BEZ_ZDARZEN,
        nastawy=nastawy(),
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(wejscie).uruchom()
    assert blad.value.kod == "dynamika.punkt_pracy_napiecie_missing"


def test_brak_mocy_zrodla_w_punkcie_pracy_jest_odmowa_nazwana() -> None:
    uklad = zbuduj_smib()
    bez_maszyny = {"SYS1": uklad.punkt_pracy.moce_zrodel_pu["SYS1"]}
    wejscie = WejscieDynamiki(
        wezly=uklad.wezly,
        galezie=uklad.galezie,
        odsprzegi=(),
        odbiory=(),
        urzadzenia=(uklad.maszyna, uklad.szyna),
        punkt_pracy=PunktPracy(
            napiecia_pu=dict(uklad.punkt_pracy.napiecia_pu), moce_zrodel_pu=bez_maszyny
        ),
        harmonogram=BEZ_ZDARZEN,
        nastawy=nastawy(),
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(wejscie).uruchom()
    assert blad.value.kod == "dynamika.punkt_pracy_moc_missing"


def test_slad_white_box_niesie_siec_nastawy_i_kroki_szczegolne() -> None:
    """Slad ma dowodzic biegu: odcisk Ybus, nastawy, KAZDY krok ze zdarzeniem."""
    uklad = zbuduj_smib()
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.1,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_OHM,
                t_usuniecia_s=0.2,
            ),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=0.5, krok_wyjscia_s=0.01))
    ).uruchom()
    slad = wynik.slad_white_box
    assert set(slad) == {
        "inicjalizacja",
        "siec",
        "nastawy",
        "kroki_szczegolne",
        "podsumowanie_krokow",
    }
    assert len(slad["siec"]["odcisk_ybus"]) == 64
    assert slad["siec"]["liczba_wezlow"] == 2
    assert slad["nastawy"]["integrator"] == "trapez_niejawny"
    zdarzeniowe = [wpis for wpis in slad["kroki_szczegolne"] if wpis["powod"] == "zdarzenie"]
    assert [wpis["rodzaje"] for wpis in zdarzeniowe] == [["zwarcie"], ["zdjecie_zwarcia"]]
    assert all(wpis["residuum_kcl_max"] < 1e-9 for wpis in zdarzeniowe)
    assert slad["podsumowanie_krokow"]["kroki"] == wynik.wlasnosci.kroki
    assert "os_czasu_s" not in slad and "probki" not in slad


def test_kanaly_pokrywaja_wezly_stany_i_moce() -> None:
    uklad = zbuduj_smib()
    wynik = SilnikDynamiki(
        uklad.wejscie(BEZ_ZDARZEN, nastawy(dt_s=0.002, horyzont_s=0.1, krok_wyjscia_s=0.05))
    ).uruchom()
    klucze = {kanal.klucz for kanal in wynik.kanaly}
    assert {"u_pu@GEN", "kat_deg@GEN", "u_pu@SYS", "kat_deg@SYS"} <= klucze
    assert {
        "delta_rad@G1",
        "omega_pu@G1",
        "p_mechaniczna_pu@G1",
        "sem_modul_pu@G1",
        "p_pu@G1",
        "q_pu@G1",
    } <= klucze
    assert {"sem_re_pu@SYS1", "sem_im_pu@SYS1", "p_pu@SYS1", "q_pu@SYS1"} <= klucze
    assert set(wynik.probki) == klucze


def test_moc_kanalu_zgadza_sie_z_punktem_pracy() -> None:
    """Kanal `p_pu@G1` w chwili zero == moc generatora z rozpływu."""
    uklad = zbuduj_smib()
    wynik = SilnikDynamiki(
        uklad.wejscie(BEZ_ZDARZEN, nastawy(dt_s=0.002, horyzont_s=0.1, krok_wyjscia_s=0.05))
    ).uruchom()
    oczekiwana = uklad.punkt_pracy.moce_zrodel_pu["G1"]
    assert wynik.probki["p_pu@G1"][0] == pytest.approx(oczekiwana.real, abs=1e-12)
    assert wynik.probki["q_pu@G1"][0] == pytest.approx(oczekiwana.imag, abs=1e-12)


def test_metryki_wskazuja_minimum_napiecia_i_jego_chwile() -> None:
    uklad = zbuduj_smib()
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.1,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_OHM,
                t_usuniecia_s=0.2,
            ),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=0.5, krok_wyjscia_s=0.01))
    ).uruchom()
    metryki = {metryka.klucz: metryka for metryka in wynik.metryki}
    assert metryki["u_min_pu"].element_ref == "GEN"
    assert metryki["u_min_pu"].wartosc == pytest.approx(min(wynik.probki["u_pu@GEN"]))
    assert 0.1 <= metryki["t_u_min_s"].wartosc <= 0.2
    assert metryki["omega_max_pu@G1"].wartosc == pytest.approx(max(wynik.probki["omega_pu@G1"]))
    assert metryki["omega_min_pu@G1"].wartosc == pytest.approx(min(wynik.probki["omega_pu@G1"]))


def test_zalozenia_sa_dolaczone_do_wyniku() -> None:
    uklad = zbuduj_smib()
    wynik = SilnikDynamiki(
        uklad.wejscie(BEZ_ZDARZEN, nastawy(dt_s=0.002, horyzont_s=0.1, krok_wyjscia_s=0.05))
    ).uruchom()
    assert wynik.zalozenia == ZALOZENIA_RDZENIA
    assert any("skladowej zgodnej" in zalozenie for zalozenie in wynik.zalozenia)


def test_skok_obciazenia_zmienia_punkt_pracy_sieci() -> None:
    uklad = zbuduj_smib_z_odbiorem(p_odbioru_pu=0.2)
    harmonogram = HarmonogramDynamiki(
        (SkokObciazenia(t_s=0.1, odbior="ODB1", delta_p_pu=0.15, delta_q_pu=0.05),)
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=0.6, krok_wyjscia_s=0.01))
    ).uruchom()
    napiecia = wynik.probki["u_pu@GEN"]
    assert napiecia[int(0.05 / 0.01)] > napiecia[int(0.11 / 0.01)]
    assert wynik.zdarzenia_wykonane[0].rodzaj == "skok_obciazenia"
    assert wynik.zdarzenia_wykonane[0].delta_y_max > 0.0


@pytest.mark.parametrize(
    ("nazwa", "jednostka"),
    [("delta_rad", "rad"), ("omega_pu", "pu"), ("tau_s", "s")],
)
def test_jednostka_stanu_z_sufiksu_nazwy(nazwa: str, jednostka: str) -> None:
    assert jednostka_stanu(nazwa) == jednostka


def test_stan_bez_sufiksu_jednostki_jest_bledem_kontraktu() -> None:
    """Kanal bez jednostki bylby liczba bez znaczenia fizycznego — zero zgadywania."""
    with pytest.raises(AssertionError, match="sufiksu jednostki"):
        jednostka_stanu("cos_bez_jednostki")
