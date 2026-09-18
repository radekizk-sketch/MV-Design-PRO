"""Wynik biegu: ladunek MUSI pasowac do kontraktu `resultset_dynamic_v1`.

To jest test WIAZANIA rdzenia z kontraktem wyniku. Rdzen nie moze importowac
warstwy aplikacyjnej (granica pakietu, SS0 p.1), wiec buduje SLOWNIK o polach
1:1 z modelem `ResultSetDynamicV1`. Zgodnosc tego slownika z modelem jest tu
sprawdzana WYKONANIEM — `model_validate` na ladunku z prawdziwego biegu — a nie
deklaracja w docstringu. Test jest jedynym miejscem, w ktorym obie strony
spotykaja sie w jednym procesie, i dlatego kazdy rozjazd pol wywraca wlasnie tu.
"""

from __future__ import annotations

import math

import pytest
from application.contracts.resultset_dynamic_v1 import (
    RESULTSET_DYNAMIC_CONTRACT,
    ResultSetDynamicV1,
    zbuduj_resultset_dynamiczny_v1,
)
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    SilnikDynamiki,
    ZwarcieWezla,
    ladunek_resultset_dynamic_v1,
)
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
        ),
    )
)


@pytest.fixture(scope="module")
def ladunek() -> dict:
    uklad = zbuduj_smib()
    wynik = SilnikDynamiki(
        uklad.wejscie(HARMONOGRAM, nastawy(dt_s=0.002, horyzont_s=0.5, krok_wyjscia_s=0.01))
    ).uruchom()
    return ladunek_resultset_dynamic_v1(wynik, run_id=RUN_ID)


def test_ladunek_waliduje_sie_kontraktem_wyniku(ladunek: dict) -> None:
    wynik = ResultSetDynamicV1.model_validate(ladunek)
    assert wynik.kontrakt == RESULTSET_DYNAMIC_CONTRACT
    assert wynik.analysis_type == "dynamika_rms"
    assert wynik.run_id == RUN_ID
    assert wynik.wlasnosci_biegu.zbiegl is True
    assert wynik.tozsamosc.wersja_solvera == "DYNAMIKA_RMS_DAE_V1"


def test_kanaly_maja_dozwolona_przestrzen_i_jednostke(ladunek: dict) -> None:
    wynik = ResultSetDynamicV1.model_validate(ladunek)
    assert wynik.kanaly
    for kanal in wynik.kanaly:
        assert kanal.przestrzen in {"siec", "urzadzenie", "regulator", "magazyn"}
        assert kanal.jednostka
        assert kanal.opis_pl


def test_zdarzenia_wykonane_niosa_pomiar_reinicjalizacji(ladunek: dict) -> None:
    wynik = ResultSetDynamicV1.model_validate(ladunek)
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
    wynik = ResultSetDynamicV1.model_validate(ladunek)
    bez_probek = zbuduj_resultset_dynamiczny_v1(wynik, z_probkami=False)
    z_probkami = zbuduj_resultset_dynamiczny_v1(wynik, z_probkami=True)
    assert bez_probek["os_czasu_s"] == []
    assert bez_probek["probki"] == {}
    assert len(z_probkami["os_czasu_s"]) == len(wynik.os_czasu_s) > 0
    assert set(z_probkami["probki"]) == {kanal.klucz for kanal in wynik.kanaly}


def test_stopien_dowodowy_wychodzi_pusty_z_rdzenia(ladunek: dict) -> None:
    """Solver nie nadaje sam sobie mocy dowodowej — to rejestr proweniencji, nie rdzen."""
    assert ladunek["stopien_dowodowy"] == []


def test_metryki_maja_odniesienie_do_wzoru(ladunek: dict) -> None:
    wynik = ResultSetDynamicV1.model_validate(ladunek)
    assert wynik.metryki
    for metryka in wynik.metryki:
        assert metryka.wzor_ref, f"metryka {metryka.klucz} bez odniesienia do wzoru"
        assert metryka.jednostka


def test_zalozenia_sa_przeniesione_do_ladunku(ladunek: dict) -> None:
    wynik = ResultSetDynamicV1.model_validate(ladunek)
    assert wynik.zalozenia
    assert any("zgodnej" in zalozenie for zalozenie in wynik.zalozenia)


def test_dwa_biegi_daja_IDENTYCZNY_ladunek() -> None:
    """Determinizm na granicy kontraktu: ten sam wejscie => ten sam slownik."""
    uklad = zbuduj_smib()
    wejscie = uklad.wejscie(HARMONOGRAM, nastawy(dt_s=0.002, horyzont_s=0.4, krok_wyjscia_s=0.02))
    pierwszy = ladunek_resultset_dynamic_v1(SilnikDynamiki(wejscie).uruchom(), run_id=RUN_ID)
    drugi = ladunek_resultset_dynamic_v1(SilnikDynamiki(wejscie).uruchom(), run_id=RUN_ID)
    # `czas_obliczen_s` jest POMIAREM ZEGARA, wiec z natury sie rozni — to jedyne
    # pole wylaczone z porownania determinizmu (i jedyne, ktore nie wchodzi do
    # zadnego odcisku tozsamosci).
    for ladunek_biegu in (pierwszy, drugi):
        ladunek_biegu["wlasnosci_biegu"].pop("czas_obliczen_s")
    assert pierwszy == drugi
