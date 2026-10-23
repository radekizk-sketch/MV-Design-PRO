"""Wartość robocza tolerancji sieci nN — oznaczenie w każdym miejscu, które zna element.

DLACZEGO. Karta TOLERANCJA-NN-WARTOSC-ROBOCZA (zasada nr 4, V12K-351) skasowała odmowę
``fault.c_tolerancja_nn_brak``: brak deklaracji tolerancji sieci nN nie blokuje zwarć — wyspa
nN dostaje wartość roboczą rejestru (+10 %, c 1,10/0,90). Dawny plik pilnował, że odmowa
nazywa element modelu (partia integracji 11). Ta sama klasa miejsc — węzeł zwarcia (bieg
kanoniczny, wiązanie zwarcia, koperta wejścia solvera), transformator przy K_T, maszyna przy
K_G (c_max i jego podstawa), źródło sieciowe na szynie nN przy Z_Q, bieg zwarciowy MAX i MIN —
teraz LICZY i nazywa wartość roboczą: podstawa c mówi „wartość robocza", a założenie biegu
nazywa sieć i jej elementy z modelu (nigdy identyfikatorem).

ILOCZYN CECH: {węzeł zwarcia, koperta wejścia, transformator K_T, maszyna K_G c_max, maszyna
K_G podstawa, źródło nN Z_Q w biegu, transformator w biegu MAX i MIN} × {deklaracja: brak,
sprzeczna} × {podstawa „wartość robocza", nazwa elementu w założeniu, brak identyfikatora,
brak „None"}; do tego klasa nierozstrzygnięta w węźle (brak, wartość spoza tabeli) jako błąd
PROGRAMU, nie odmowa dziedziny.
"""

from __future__ import annotations

import dataclasses

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.models import Bus, EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from enm.tolerancja_nn import KOD_TOLERANCJA_NN_ROBOCZA, dobierz_c_wezla, zalozenia_tolerancji_nn
from network_model.core.branch import TransformerBranch
from network_model.odmowa_danych import OdmowaDanychError
from solver_input.builder import _build_bus_payloads

from tests.enm.test_canonical_sc_c_per_pasmo import N1, N2, N3, _build_mv_lv_enm
from tests.enm.test_tolerancja_nn_iloczyn_cech import (
    _NN_K,
    _NN_Q,
    _enm_wyspy_zrodla_nn,
    _enm_z_agregatem,
)

_PODSTAWA_ROBOCZA = "IEC 60909-0 tab. 1, pasmo nN, tolerancja +10 % (wartość robocza), {}"
_NAZWA_TR = "TR 15/0,4 kV 630 kVA Dyn11"


@pytest.fixture(autouse=True)
def _czysty_stan():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _sprawdz_tresc(tresc: str, *, nazwy: tuple[str, ...], identyfikatory: tuple[str, ...]) -> None:
    for nazwa in nazwy:
        assert nazwa in tresc, (nazwa, tresc)
    assert "None" not in tresc, tresc
    for identyfikator in identyfikatory:
        assert identyfikator not in tresc, (identyfikator, tresc)


def _siec_sprzeczna() -> EnergyNetworkModel:
    enm = _build_mv_lv_enm("Sieć", tolerancja="PLUS_6")
    drugi = enm.transformers[0].model_copy(
        update={"ref_id": "TR2", "name": "TR rezerwowy", "lv_voltage_tolerance": "PLUS_10"}
    )
    return enm.model_copy(update={"transformers": [*enm.transformers, drugi]})


_SIECI = {"brak": lambda: _build_mv_lv_enm("Sieć", tolerancja=None), "sprzeczna": _siec_sprzeczna}


@pytest.mark.parametrize("siec", sorted(_SIECI))
@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
def test_wezel_zwarcia_podstawa_robocza(siec: str, scenariusz: str) -> None:
    graf = map_enm_to_network_graph(_SIECI[siec]())
    for ref in (N2, N3):
        dobor = dobierz_c_wezla(graf.nodes[ref_to_graph_id(ref)], scenariusz)  # type: ignore[arg-type]
        assert dobor.wartosc == {"MAX": 1.10, "MIN": 0.90}[scenariusz]
        assert dobor.zrodlo == _PODSTAWA_ROBOCZA.format(scenariusz)
    # Węzeł SN tej samej sieci: wiersz SN, bez dopisku.
    dobor_sn = dobierz_c_wezla(graf.nodes[ref_to_graph_id(N1)], scenariusz)  # type: ignore[arg-type]
    assert "wartość robocza" not in dobor_sn.zrodlo


@pytest.mark.parametrize("deklaracja", [None, "PLUS_7"])
@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
def test_wezel_bez_rozstrzygnietej_klasy_to_blad_programu(
    deklaracja: str | None, scenariusz: str
) -> None:
    """Węzeł nN poza mapowaniem (klasa nierozstrzygnięta albo spoza tabeli) — błąd PROGRAMU
    wołającego, nie odmowa dziedziny i nie wiersz tabeli wybrany po cichu."""
    graf = map_enm_to_network_graph(_build_mv_lv_enm("Sieć", tolerancja=None))
    wezel = dataclasses.replace(graf.nodes[ref_to_graph_id(N2)], tolerancja_nn=deklaracja)
    with pytest.raises(ValueError) as blad:
        dobierz_c_wezla(wezel, scenariusz)  # type: ignore[arg-type]
    assert not isinstance(blad.value, OdmowaDanychError)


@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
def test_koperta_wejscia_solvera_liczy_na_wartosci_roboczej(scenariusz: str) -> None:
    graf = map_enm_to_network_graph(_build_mv_lv_enm("Sieć", tolerancja=None))
    koperta = _build_bus_payloads(graf, scenario=scenariusz, z_c=True)  # type: ignore[arg-type]
    c = {p.ref_id: p.c_factor_iec60909 for p in koperta}
    for ref in (N2, N3):
        assert c[ref_to_graph_id(ref)] == {"MAX": 1.10, "MIN": 0.90}[scenariusz]
    # Rozpływ (z_c=False) nie czyta c.
    assert all(p.c_factor_iec60909 is None for p in _build_bus_payloads(graf, z_c=False))


@pytest.mark.parametrize("siec", sorted(_SIECI))
def test_k_t_czyta_wartosc_robocza_kazdego_transformatora(siec: str) -> None:
    graf = map_enm_to_network_graph(_SIECI[siec]())
    galezie = [g for g in graf.branches.values() if isinstance(g, TransformerBranch)]
    assert galezie
    for galaz in galezie:
        assert galaz.tolerancja_nn_dolna == "PLUS_10"
        assert galaz.get_voltage_factor_c_max() == 1.10


@pytest.mark.parametrize("odczyt", ["c_max", "c_max_zrodlo", "k_g"])
def test_k_g_maszyny_na_wartosci_roboczej(odczyt: str) -> None:
    graf = map_enm_to_network_graph(_enm_z_agregatem(None, N3))
    (maszyna,) = graf.get_synchronous_machine_sources()
    assert maszyna.tolerancja_nn_robocza is True
    wartosc = getattr(maszyna, odczyt)
    if odczyt == "c_max":
        assert wartosc == 1.10
    elif odczyt == "c_max_zrodlo":
        assert wartosc == _PODSTAWA_ROBOCZA.format("MAX")
    else:
        assert wartosc > 0.0


@pytest.mark.parametrize("scenariusz", ["max", "min"])
@pytest.mark.parametrize("siec", sorted(_SIECI))
def test_bieg_zwarciowy_zalozenie_nazywa_transformatory(siec: str, scenariusz: str) -> None:
    set_enm("tol-nazwy", _SIECI[siec]())
    run = create_run(
        case_id="tol-nazwy",
        klucz_twin="tol-nazwy",
        analysis_type="short_circuit_sn",
        options={"scenario": scenariusz},
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    (zalozenie,) = (
        z for z in wynik.raw_result["zalozenia"] if z["code"] == KOD_TOLERANCJA_NN_ROBOCZA
    )
    assert zalozenie["element_ref"] == "TR1"
    assert zalozenie["element_type"] == "Transformer"
    assert zalozenie["parametr"] == "lv_voltage_tolerance"
    assert zalozenie["scenariusz"] == scenariusz.upper()
    nazwy: tuple[str, ...] = (_NAZWA_TR, "Szyna nN", "Koniec obwodu nN", "+10 %")
    if siec == "sprzeczna":
        nazwy += ("TR rezerwowy", "deklaruje +6 %", "deklaruje +10 %")
    else:
        nazwy += ("bez deklaracji",)
    _sprawdz_tresc(zalozenie["message_pl"], nazwy=nazwy, identyfikatory=("TR1", "TR2", N1, N2, N3))


def test_bieg_zwarciowy_wyspy_zrodla_nn_podstawa_z_q_robocza() -> None:
    set_enm("tol-zrodlo", _enm_wyspy_zrodla_nn(None))
    run = create_run(
        case_id="tol-zrodlo", klucz_twin="tol-zrodlo", analysis_type="short_circuit_sn"
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    (zrodlo,) = wynik.raw_result["zrodla_sieciowe"]
    assert zrodlo["c_zrodlo"] == _PODSTAWA_ROBOCZA.format("MAX")
    (zalozenie,) = (
        z for z in wynik.raw_result["zalozenia"] if z["code"] == KOD_TOLERANCJA_NN_ROBOCZA
    )
    _sprawdz_tresc(
        zalozenie["message_pl"],
        nazwy=("Sieć zasilająca nN", "Szyna nN przyłącza"),
        identyfikatory=("Q_SIEC_NN", _NN_Q, _NN_K),
    )


def test_wyspa_bez_elementu_zasilajacego_zalozenie_na_szynie_bez_pola() -> None:
    """Wyspa nN bez transformatora i źródła: założenie wskazuje jej pierwszą szynę i NIE
    wskazuje pola zmiany (deklaracji nie ma na czym położyć) — zdanie mówi, kto ją przyjmuje."""
    enm = _build_mv_lv_enm("Sieć", tolerancja="PLUS_6")
    wydzielona = Bus(ref_id="NN_WYDZ", name="Szyna nN wydzielona", voltage_kv=0.4)
    enm = enm.model_copy(update={"buses": [*enm.buses, wydzielona]})
    (zalozenie,) = zalozenia_tolerancji_nn(enm, "MAX")
    assert zalozenie["element_ref"] == "NN_WYDZ"
    assert "parametr" not in zalozenie
    assert "element_type" not in zalozenie
    _sprawdz_tresc(
        zalozenie["message_pl"],
        nazwy=("Szyna nN wydzielona", "brak elementu zasilającego", "transformator albo źródło"),
        identyfikatory=("NN_WYDZ",),
    )


@pytest.mark.parametrize("deklaracja", ["PLUS_6", "PLUS_10"])
def test_siec_zadeklarowana_bez_zalozenia(deklaracja: str) -> None:
    assert zalozenia_tolerancji_nn(_build_mv_lv_enm("Sieć", tolerancja=deklaracja), "MAX") == ()
