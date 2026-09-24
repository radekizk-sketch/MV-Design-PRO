"""Wynik biegu: ladunek MUSI pasowac do kontraktu `resultset_dynamic_v2`.

To jest test WIAZANIA rdzenia z kontraktem wyniku. Rdzen nie moze importowac
warstwy aplikacyjnej (granica pakietu, SS0 p.1), wiec buduje SLOWNIK o polach
1:1 z modelem `ResultSetDynamicV2`. Zgodnosc tego slownika z modelem jest tu
sprawdzana WYKONANIEM — `model_validate` na ladunku z prawdziwego biegu — a nie
deklaracja w docstringu. Test jest jedynym miejscem, w ktorym obie strony
spotykaja sie w jednym procesie, i dlatego kazdy rozjazd pol wywraca wlasnie tu.

Dziedzina fizyki NIE pochodzi z rdzenia (rdzen nie zna mapy produktu) — dokleja ja
wykonawca biegu z `dziedzina_fizyki_dynamiki()`; test robi to samo.
"""

from __future__ import annotations

import math
from typing import get_args

import pytest
from application.contracts.resultset_dynamic_v2 import (
    RESULTSET_DYNAMIC_CONTRACT,
    PrzestrzenKanalu,
    ResultSetDynamicV2,
    dziedzina_fizyki_dynamiki,
    zbuduj_resultset_dynamiczny_v2,
)
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    SilnikDynamiki,
    ZwarcieWezla,
    ladunek_resultset_dynamic_v2,
)
from network_model.solvers.dynamika.obserwable import JAKOSC_CHWILA_ZDARZENIA
from network_model.solvers.dynamika.tozsamosc import CYFRY_KWANTYZACJI

from tests.network_model.dynamika.uklady import X_ZWARCIA_OHM, nastawy, zbuduj_smib

RUN_ID = "11111111-2222-3333-4444-555555555555"
HARMONOGRAM = HarmonogramDynamiki(
    (
        ZwarcieWezla(
            t_s=0.1,
            wezel="GEN",
            typ="3F",
            r_f_ohm=0.0,
            x_f_ohm=X_ZWARCIA_OHM,
            t_usuniecia_s=0.2,
            sposob_usuniecia="samoczynne",
        ),
    )
)


@pytest.fixture(scope="module")
def ladunek() -> dict:
    uklad = zbuduj_smib()
    wynik = SilnikDynamiki(
        uklad.wejscie(HARMONOGRAM, nastawy(dt_s=0.002, horyzont_s=0.5, krok_wyjscia_s=0.01))
    ).uruchom()
    return ladunek_resultset_dynamic_v2(wynik, run_id=RUN_ID)


def _kontrakt(ladunek: dict) -> ResultSetDynamicV2:
    return ResultSetDynamicV2.model_validate(
        {**ladunek, "dziedzina_fizyki": list(dziedzina_fizyki_dynamiki())}
    )


def test_ladunek_waliduje_sie_kontraktem_wyniku(ladunek: dict) -> None:
    wynik = _kontrakt(ladunek)
    assert wynik.kontrakt == RESULTSET_DYNAMIC_CONTRACT
    assert wynik.analysis_type == "dynamika_rms"
    assert wynik.run_id == RUN_ID
    assert wynik.wlasnosci_biegu.zbiegl is True
    assert wynik.tozsamosc.wersja_solvera == "DYNAMIKA_RMS_DAE_V1"


def test_kanaly_maja_dozwolona_przestrzen_i_jednostke(ladunek: dict) -> None:
    """Zbior dozwolonych przestrzeni czytany z KONTRAKTU, nie przepisany recznie.

    Poprzednia wersja powtarzala czworke nazw w tekscie testu. Gdy karta W6-A dolozyla
    przestrzen `obserwabla` (wielkosci wyprowadzone: czestotliwosc wezla, wielkosci
    zaciskow galezi), test padal na WLASNEJ kopii zbioru, nie na defekcie produktu —
    czyli pilnowal czegos innego, niz deklaruje. Warunek pochodzi teraz z jednego zrodla
    prawdy: literalu kontraktu.
    """
    dozwolone = set(get_args(PrzestrzenKanalu))
    wynik = _kontrakt(ladunek)
    assert wynik.kanaly
    for kanal in wynik.kanaly:
        assert kanal.przestrzen in dozwolone
        assert kanal.jednostka
        assert kanal.opis_pl


def test_przestrzen_obserwabli_jest_w_kontrakcie_i_w_wyniku(ladunek: dict) -> None:
    """Deklaracja rozdzialu x/y/z ma przypiety test (regula KLASA par. 4).

    Rozdzial przestrzeni nie jest komentarzem: kontrakt MUSI znac `obserwabla`, a bieg
    MUSI wystawiac w niej kanaly — inaczej „rozdzielilismy semantycznie" bylo zdaniem
    bez pokrycia.
    """
    assert "obserwabla" in set(get_args(PrzestrzenKanalu))
    wynik = _kontrakt(ladunek)
    obserwable = [kanal for kanal in wynik.kanaly if kanal.przestrzen == "obserwabla"]
    assert obserwable, "bieg nie wystawil ani jednego kanalu przestrzeni obserwabli"
    klucze = {kanal.klucz.split("@", 1)[0] for kanal in obserwable}
    assert {"f_hz", "u_f_est_hz", "jakosc_f"} <= klucze
    assert {"i_od_pu", "i_do_pu", "p_od_pu", "q_od_pu", "p_do_pu", "q_do_pu"} <= klucze


def test_zdarzenia_wykonane_niosa_pomiar_reinicjalizacji(ladunek: dict) -> None:
    wynik = _kontrakt(ladunek)
    assert [zdarzenie.rodzaj for zdarzenie in wynik.zdarzenia_wykonane] == [
        "zwarcie",
        "zdjecie_zwarcia",
    ]
    for zdarzenie in wynik.zdarzenia_wykonane:
        assert zdarzenie.t_wykonany_s == zdarzenie.t_zaplanowany_s
        assert zdarzenie.delta_x_max == 0.0
        assert zdarzenie.delta_y_max > 0.0
        assert zdarzenie.residuum_kcl_max < 1e-9


def test_kazda_liczba_jest_skwantyzowana_i_skonczona(ladunek: dict) -> None:
    """Kwantyzacja do 9 cyfr znaczacych na GRANICY kontraktu, zero NaN/Inf."""

    def sprawdz(wartosc: object, sciezka: str) -> None:
        if isinstance(wartosc, bool):
            return
        if isinstance(wartosc, float):
            assert math.isfinite(wartosc), f"{sciezka} nie jest skonczone"
            assert (
                float(f"%.{CYFRY_KWANTYZACJI}g" % wartosc) == wartosc
            ), f"{sciezka} = {wartosc!r} nie jest skwantyzowane"
        elif isinstance(wartosc, dict):
            for klucz, pod in wartosc.items():
                sprawdz(pod, f"{sciezka}.{klucz}")
        elif isinstance(wartosc, list):
            for indeks, pod in enumerate(wartosc):
                sprawdz(pod, f"{sciezka}[{indeks}]")

    sprawdz(ladunek, "ladunek")


def test_szeregi_wychodza_z_wiersza_biegu_ale_zostaja_w_odpowiedzi(ladunek: dict) -> None:
    """`raw_result` biegu NIE niesie szeregow; endpoint szeregow niesie je w calosci."""
    wynik = _kontrakt(ladunek)
    bez_probek = zbuduj_resultset_dynamiczny_v2(wynik, z_probkami=False)
    z_probkami = zbuduj_resultset_dynamiczny_v2(wynik, z_probkami=True)
    assert bez_probek["os_czasu_s"] == []
    assert bez_probek["strona_probki"] == []
    assert bez_probek["probki"] == {}
    assert len(z_probkami["os_czasu_s"]) == len(wynik.os_czasu_s) > 0
    assert z_probkami["strona_probki"] == list(wynik.strona_probki)
    assert set(z_probkami["probki"]) == {kanal.klucz for kanal in wynik.kanaly}


def test_chwila_zdarzenia_ma_dwie_probki_L_i_P_a_siatka_C(ladunek: dict) -> None:
    """Os czasu niesie POWTORZONA chwile kazdego zdarzenia (probki `L` i `P`), a
    strona kazdej probki jest jawna — konsument nie zgaduje jej z kolejnosci."""
    wynik = _kontrakt(ladunek)
    pary = [
        (t, strona)
        for t, strona in zip(wynik.os_czasu_s, wynik.strona_probki, strict=True)
        if strona != "C"
    ]
    assert pary == [(0.1, "L"), (0.1, "P"), (0.2, "L"), (0.2, "P")]
    # Siatka wyjscia 0,01 s na horyzoncie 0,5 s: 51 chwil, z czego dwie (0,1 i 0,2)
    # sa chwilami zdarzen i niosa po dwie probki zamiast jednej.
    assert len(wynik.os_czasu_s) == 51 + 2
    assert all(b >= a for a, b in zip(wynik.os_czasu_s[:-1], wynik.os_czasu_s[1:], strict=True))


def test_czestotliwosc_w_chwili_zdarzenia_jest_None_z_kodem_3_w_obu_probkach(
    ladunek: dict,
) -> None:
    """Wartosc niedostepna to `None` z przyczyna w kanale jakosci — nigdy liczba."""
    wynik = _kontrakt(ladunek)
    for indeks, strona in enumerate(wynik.strona_probki):
        for wezel in ("GEN", "SYS"):
            f = wynik.probki[f"f_hz@{wezel}"][indeks]
            jakosc = wynik.probki[f"jakosc_f@{wezel}"][indeks]
            if strona == "C":
                assert f is not None and math.isfinite(f)
                assert jakosc != JAKOSC_CHWILA_ZDARZENIA
            else:
                assert f is None
                assert wynik.probki[f"u_f_est_hz@{wezel}"][indeks] is None
                assert jakosc == JAKOSC_CHWILA_ZDARZENIA


def test_probka_L_to_stan_przed_a_P_po_zdarzeniu(ladunek: dict) -> None:
    """`L` chwili zwarcia = napiecie sprzed zwarcia (ciaglosc z ostatnia probka C),
    `P` = napiecie po naniesieniu zwarcia (zapad)."""
    wynik = _kontrakt(ladunek)
    u = wynik.probki["u_pu@GEN"]
    indeks_l = wynik.strona_probki.index("L")
    assert u[indeks_l] == pytest.approx(u[indeks_l - 1], rel=1e-9)
    assert u[indeks_l + 1] < 0.5 * u[indeks_l]


def test_stopien_dowodowy_wychodzi_pusty_z_rdzenia(ladunek: dict) -> None:
    """Solver nie nadaje sam sobie mocy dowodowej — to rejestr proweniencji, nie rdzen."""
    assert ladunek["stopien_dowodowy"] == []


def test_metryki_maja_odniesienie_do_wzoru(ladunek: dict) -> None:
    wynik = _kontrakt(ladunek)
    assert wynik.metryki
    for metryka in wynik.metryki:
        assert metryka.wzor_ref, f"metryka {metryka.klucz} bez odniesienia do wzoru"
        assert metryka.jednostka


def test_zalozenia_sa_przeniesione_do_ladunku(ladunek: dict) -> None:
    wynik = _kontrakt(ladunek)
    assert wynik.zalozenia
    assert any("zgodnej" in zalozenie for zalozenie in wynik.zalozenia)


def test_dwa_biegi_daja_IDENTYCZNY_ladunek() -> None:
    """Determinizm na granicy kontraktu: ten sam wejscie => ten sam slownik."""
    uklad = zbuduj_smib()
    wejscie = uklad.wejscie(HARMONOGRAM, nastawy(dt_s=0.002, horyzont_s=0.4, krok_wyjscia_s=0.02))
    pierwszy = ladunek_resultset_dynamic_v2(SilnikDynamiki(wejscie).uruchom(), run_id=RUN_ID)
    drugi = ladunek_resultset_dynamic_v2(SilnikDynamiki(wejscie).uruchom(), run_id=RUN_ID)
    # `czas_obliczen_s` jest POMIAREM ZEGARA, wiec z natury sie rozni — to jedyne
    # pole wylaczone z porownania determinizmu (i jedyne, ktore nie wchodzi do
    # zadnego odcisku tozsamosci).
    for ladunek_biegu in (pierwszy, drugi):
        ladunek_biegu["wlasnosci_biegu"].pop("czas_obliczen_s")
    assert pierwszy == drugi
