"""Odmowa braku tolerancji sieci nN nazywa element modelu — partia integracji 11.

DLACZEGO. Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK wprowadziła odmowę `fault.c_tolerancja_nn_brak`
(wiersz nN tabeli 1 IEC 60909-0 wymaga deklaracji +6 % albo +10 %). Po scaleniu na czubek
partii 9 (zdania odmów z nazwami z modelu, nigdy z identyfikatorem) bieg zwarciowy sieci bez
deklaracji kończył się zdaniem rdzenia „Węzeł nN (0.4 kV) … (otrzymano None)" — bez nazwy
elementu i z reprezentacją Pythona w treści. Naprawa: `OdmowaToleranciiNnError.dotyczy(nazwa)`
(wzorzec `enm.zdania_odmow_rdzenia`: treść i „Dotyczy: <nazwa>.") dołożone w każdym miejscu,
które zna element: węzeł zwarcia (`enm.tolerancja_nn.dobierz_c_wezla` — bieg kanoniczny,
wiązanie zwarcia, koperta wejścia solvera), transformator przy K_T, maszyna przy K_G (c_max
i jego podstawa), źródło sieciowe na szynie nN przy Z_Q, szyna strony górnej ekwiwalentu
sieci zasilającej.

ILOCZYN CECH: {węzeł zwarcia, koperta wejścia, transformator K_T, maszyna K_G c_max, maszyna
K_G podstawa, źródło nN Z_Q w biegu, transformator w biegu MAX i MIN} × {deklaracja: brak,
wartość spoza tabeli — tam, gdzie obiekt przyjmuje dowolną wartość} × {treść: kod, nazwa
elementu, brak identyfikatora, brak „None"}.
"""

from __future__ import annotations

import dataclasses

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.store import reset_enm_store, set_enm
from enm.tolerancja_nn import dobierz_c_wezla
from network_model.core.branch import TransformerBranch
from network_model.core.voltage_factor import KOD_TOLERANCJA_NN_BRAK, OdmowaToleranciiNnError
from solver_input.builder import _build_bus_payloads

from tests.enm.test_canonical_sc_c_per_pasmo import N1, N2, N3, _build_mv_lv_enm
from tests.enm.test_tolerancja_nn_iloczyn_cech import (
    _NN_K,
    _enm_wyspy_zrodla_nn,
    _enm_z_agregatem,
)

#: Deklaracje, których tabela 1 nie zna: brak oraz wartość spoza słownika.
_DEKLARACJE_BEZ_WIERSZA: tuple[str | None, ...] = (None, "PLUS_7")


@pytest.fixture(autouse=True)
def _czysty_stan():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _sprawdz_tresc(tresc: str, *, nazwa: str, identyfikatory: tuple[str, ...]) -> None:
    assert KOD_TOLERANCJA_NN_BRAK in tresc, tresc
    assert f"Dotyczy: {nazwa}." in tresc, tresc
    assert "None" not in tresc, tresc
    assert "otrzymano" not in tresc, tresc
    for identyfikator in identyfikatory:
        assert identyfikator not in tresc, (identyfikator, tresc)


@pytest.mark.parametrize("deklaracja", _DEKLARACJE_BEZ_WIERSZA)
@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
def test_wezel_zwarcia_nazywa_szyne(deklaracja: str | None, scenariusz: str) -> None:
    graf = map_enm_to_network_graph(_build_mv_lv_enm("Sieć", tolerancja=None))
    wezel = dataclasses.replace(graf.nodes[ref_to_graph_id(N2)], tolerancja_nn=deklaracja)
    with pytest.raises(OdmowaToleranciiNnError) as blad:
        dobierz_c_wezla(wezel, scenariusz)  # type: ignore[arg-type]
    _sprawdz_tresc(str(blad.value), nazwa="Szyna nN", identyfikatory=(N2, wezel.id))
    if deklaracja is not None:
        assert f"„{deklaracja}”" in str(blad.value)


@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
def test_koperta_wejscia_solvera_nazywa_szyne(scenariusz: str) -> None:
    graf = map_enm_to_network_graph(_build_mv_lv_enm("Sieć", tolerancja=None))
    with pytest.raises(OdmowaToleranciiNnError) as blad:
        _build_bus_payloads(graf, scenario=scenariusz, z_c=True)  # type: ignore[arg-type]
    # Kolejność szyn w kopercie: po identyfikatorze grafu — pierwsza szyna nN odmawia.
    nazwy_nn = {"Szyna nN", "Koniec obwodu nN"}
    tresc = str(blad.value)
    assert any(f"Dotyczy: {nazwa}." in tresc for nazwa in nazwy_nn), tresc
    _sprawdz_tresc(
        tresc,
        nazwa=next(n for n in nazwy_nn if f"Dotyczy: {n}." in tresc),
        identyfikatory=(N2, N3, ref_to_graph_id(N2), ref_to_graph_id(N3)),
    )
    # Rozpływ (z_c=False) nie czyta c — brak deklaracji go nie blokuje.
    assert all(p.c_factor_iec60909 is None for p in _build_bus_payloads(graf, z_c=False))


@pytest.mark.parametrize("deklaracja", _DEKLARACJE_BEZ_WIERSZA)
def test_k_t_nazywa_transformator(deklaracja: str | None) -> None:
    graf = map_enm_to_network_graph(_build_mv_lv_enm("Sieć", tolerancja=None))
    (galaz,) = (g for g in graf.branches.values() if isinstance(g, TransformerBranch))
    galaz = dataclasses.replace(galaz, tolerancja_nn_dolna=deklaracja)
    with pytest.raises(OdmowaToleranciiNnError) as blad:
        galaz.get_kt_correction_factor()
    _sprawdz_tresc(
        str(blad.value), nazwa="TR 15/0,4 kV 630 kVA Dyn11", identyfikatory=("TR1", galaz.id)
    )


@pytest.mark.parametrize("odczyt", ["c_max", "c_max_zrodlo", "k_g"])
def test_k_g_nazywa_maszyne(odczyt: str) -> None:
    graf = map_enm_to_network_graph(_enm_z_agregatem(None, N3))
    (maszyna,) = graf.get_synchronous_machine_sources()
    with pytest.raises(OdmowaToleranciiNnError) as blad:
        getattr(maszyna, odczyt)
    _sprawdz_tresc(str(blad.value), nazwa="Agregat", identyfikatory=("GEN",))


def test_k_g_wartosc_spoza_tabeli_nazywa_maszyne() -> None:
    graf = map_enm_to_network_graph(_enm_z_agregatem("PLUS_6", N3))
    (maszyna,) = graf.get_synchronous_machine_sources()
    maszyna = dataclasses.replace(maszyna, tolerancja_nn="PLUS_7")  # type: ignore[arg-type]
    with pytest.raises(OdmowaToleranciiNnError) as blad:
        _ = maszyna.c_max
    _sprawdz_tresc(str(blad.value), nazwa="Agregat", identyfikatory=("GEN",))


@pytest.mark.parametrize("scenariusz", ["max", "min"])
def test_bieg_zwarciowy_nazywa_transformator(scenariusz: str) -> None:
    set_enm("tol-nazwy", _build_mv_lv_enm("Sieć", tolerancja=None))
    run = create_run(
        case_id="tol-nazwy",
        klucz_twin="tol-nazwy",
        analysis_type="short_circuit_sn",
        options={"scenario": scenariusz},
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FAILED"
    _sprawdz_tresc(
        wynik.error_message or "",
        nazwa="TR 15/0,4 kV 630 kVA Dyn11",
        identyfikatory=("TR1", N1, N2, N3),
    )


def test_bieg_zwarciowy_wyspy_zrodla_nn_nazywa_zrodlo() -> None:
    set_enm("tol-zrodlo", _enm_wyspy_zrodla_nn(None))
    run = create_run(
        case_id="tol-zrodlo", klucz_twin="tol-zrodlo", analysis_type="short_circuit_sn"
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FAILED"
    _sprawdz_tresc(
        wynik.error_message or "",
        nazwa="Sieć zasilająca nN",
        identyfikatory=("Q_SIEC_NN", _NN_K),
    )
