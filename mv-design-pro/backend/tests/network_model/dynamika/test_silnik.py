"""Silnik: bramka inicjalizacji, siatka probek, slad WHITE BOX, odmowy wejscia."""

from __future__ import annotations

from dataclasses import dataclass

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
from network_model.solvers.dynamika.kontrakty import (
    KOD_INICJALIZACJA_NIEZBIEZNA,
    KOD_WARTOSC_NIESKONCZONA,
    Urzadzenie,
)
from network_model.solvers.dynamika.silnik import ZALOZENIA_RDZENIA, jednostka_stanu
from network_model.solvers.dynamika.urzadzenia.fabryka import RODZINY_OBSLUGIWANE

from tests.network_model.dynamika.uklady import (
    F_BAZOWA_HZ,
    S_BAZOWA_MVA,
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


def test_zalozenia_wymieniaja_dokladnie_rodziny_fabryki() -> None:
    """Deklaracja o urzadzeniach zgodna z rejestrem W OBIE STRONY.

    DEFEKT, KTORY TO USUWA (pomiar 2026-09-18): wiersz zalozen mowil „maszyna
    klasyczna 2. rzedu i szyna sztywna" jeszcze po karcie W6-3A, ktora dolozyla
    piec rodzin — a `zalozenia` ida do pola wyniku czytanego przez projektanta.
    Deklaracja bez pinu to falszywa pewnosc: gorsza niz brak zdania, bo wylacza
    czujnosc. Test sprawdza OBA kierunki (zadna rodzina nie ginie, zadna nie jest
    dopisana z palca), wiec kolejne rozszerzenie fabryki nie moze przejsc po cichu.
    """
    wiersze = [w for w in ZALOZENIA_RDZENIA if w.startswith("Rodziny urzadzen skladane")]
    assert len(wiersze) == 1, ZALOZENIA_RDZENIA
    wymienione = {
        nazwa.strip()
        for nazwa in wiersze[0].split(":", 1)[1].rstrip(".").split(",")
        if nazwa.strip()
    }
    assert wymienione == set(RODZINY_OBSLUGIWANE)
    # Rejestr nie moze zostac pusty — pusty zbior spelnilby rownosc wyzej trywialnie.
    assert len(RODZINY_OBSLUGIWANE) >= 5


def test_zaden_kanal_wyniku_nie_wpuszcza_NaN_ani_Inf_jako_wartosci_inzynierskiej() -> None:
    """CALY ResultSet, nie wybrane kanaly — bieg ze zwarciem i jego zdjeciem.

    Straznik skonczonosci stoi przy pochodnych i przy napieciach, a obserwabla
    czestotliwosci ma wlasny stan NIEDOSTEPNA. To sa jednak trzy rozne mechanizmy w
    trzech miejscach; zdanie „zaden kanal wyniku nie niesie NaN ani Inf" jest ich
    WSPOLNA konsekwencja i dlatego wymaga wlasnego sprawdzenia — na wszystkich
    kanalach naraz, wlacznie z tymi, ktore ktos doda jutro.

    Uwaga do czytania wyniku: liczba skonczona NIE znaczy „wiarygodna". Kanal
    `jakosc_f@<wezel>` niesie osobny stan dostepnosci i to on, a nie sama
    skonczonosc, jest warunkiem czytania czestotliwosci jako wielkosci inzynierskiej.
    """
    uklad = zbuduj_smib_z_odbiorem()
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.1,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_PLYTKIEGO_OHM,
                t_usuniecia_s=0.2,
            ),
            SkokObciazenia(t_s=0.5, odbior="ODB1", delta_p_pu=0.15, delta_q_pu=0.05),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=0.002, horyzont_s=1.0, krok_wyjscia_s=0.005))
    ).uruchom()

    assert len(wynik.kanaly) > 10, "Bieg bez kanalow nie sprawdzilby niczego"
    for kanal in wynik.kanaly:
        szereg = np.asarray(wynik.probki[kanal.klucz], dtype=float)
        assert szereg.size == len(wynik.os_czasu_s), f"{kanal.klucz}: dlugosc szeregu"
        assert bool(np.all(np.isfinite(szereg))), (
            f"{kanal.klucz}: wartosc nieskonczona w probkach "
            f"{np.flatnonzero(~np.isfinite(szereg)).tolist()}"
        )
    assert bool(np.all(np.isfinite(np.asarray(wynik.os_czasu_s, dtype=float))))


@dataclass(frozen=True)
class _UrzadzenieZeSkazonaPochodna:
    """Urzadzenie oddajace pochodne z NaN — atrapa do sprawdzenia STRAZNIKA, nie fizyki.

    Deleguje wszystko do prawdziwego urzadzenia i psuje DOKLADNIE jedna rzecz:
    wskazana skladowa pochodnej. Dzieki temu bieg dochodzi do straznika normalna
    droga (punkt pracy jest rownowaga, algebra sie skleja), a czerwien pochodzi od
    skazenia, a nie od rozsypanej fikstury.
    """

    bazowe: Urzadzenie
    skazony_stan: int

    @property
    def ident(self) -> str:
        return self.bazowe.ident

    @property
    def wezel(self) -> str:
        return self.bazowe.wezel

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return self.bazowe.nazwy_stanow

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        return self.bazowe.granice_stanow

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        return self.bazowe.zakresy_waznosci

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        return self.bazowe.stany_bez_rownowagi

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        return self.bazowe.stan_poczatkowy(napiecie_pu, moc_pu)

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        skazone = self.bazowe.pochodne(stan, napiecie_pu).copy()
        skazone[self.skazony_stan] = float("nan")
        return skazone

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return self.bazowe.jakobian_stan_stan(stan, napiecie_pu)

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return self.bazowe.jakobian_stan_napiecie(stan, napiecie_pu)

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        return self.bazowe.prad_pu(stan, napiecie_pu)

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return self.bazowe.jakobian_prad_napiecie(stan, napiecie_pu)

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return self.bazowe.jakobian_prad_stan(stan, napiecie_pu)

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        return self.bazowe.napiecie_bez_obciazenia(stan)

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        return self.bazowe.jakobian_napiecia_bez_obciazenia(stan)


def test_NaN_w_pochodnej_konczy_bieg_odmowa_z_adresem_zamiast_wejsc_do_wyniku() -> None:
    """Straznik skonczonosci ma dowod NA SCIEZCE BIEGU, nie tylko na samej funkcji.

    Testy jednostkowe `test_skonczonosc` sprawdzaja funkcje wolana wprost. To nie
    dowodzi, ze silnik ja WOLA — usuniecie wywolania z `pochodne_ukladu` zostawiloby
    je zielone, a NaN poszedlby przez caly bieg bez jednego wyjatku i wyladowal w
    szeregach wyniku. Ten test wola cala sciezke i zada odmowy Z ADRESEM: nazwa
    stanu, indeks w wektorze i chwila.
    """
    uklad = zbuduj_smib()
    skazona = _UrzadzenieZeSkazonaPochodna(bazowe=uklad.maszyna, skazony_stan=1)
    wejscie = WejscieDynamiki(
        wezly=uklad.wezly,
        galezie=uklad.galezie,
        odsprzegi=(),
        odbiory=(),
        urzadzenia=(skazona, uklad.szyna),
        punkt_pracy=uklad.punkt_pracy,
        harmonogram=BEZ_ZDARZEN,
        nastawy=nastawy(dt_s=0.002, horyzont_s=0.05),
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(wejscie).uruchom()
    assert blad.value.kod == KOD_WARTOSC_NIESKONCZONA
    assert blad.value.szczegoly["adresy"] == (f"{uklad.maszyna.ident}.omega_pu",)
    assert blad.value.szczegoly["indeksy"] == (1,)
