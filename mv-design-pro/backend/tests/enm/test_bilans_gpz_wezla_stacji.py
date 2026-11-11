"""Bilans GPZ: znak zasilania i kompletność odpływów (karta GPZ-PARYTET cz. 2, pkt 5).

Bilans stacji GPZ w wyniku rozpływu (wiersz ``Substation`` z ``enm/wyniki_pol_gpz.py``)
liczy granica WĘZŁA ELEKTRYCZNEGO stacji: szyny stacji scalone zamkniętymi łącznikami.
Odpływy to KAŻDY element w ruchu z jednym końcem w tym węźle (nie tylko elementy
przypisane do pól), zasilanie — wtrysk netto szyn węzła z wierszy ``Source``. Tożsamość
bilansu: zasilanie − odpływy = straty wnętrza stacji (transformatory, odcinki szyn)
w granicach tolerancji solvera — sprawdzana na REALNYM biegu sceny ``oltc_scena``
(sieć złota z regulatorem OLTC, ta sama funkcja, która zapisuje fixturę harnessu).

Iloczyn cech na biegu solvera: kierunek mocy {oddawanie do sieci nadrzędnej (scena),
pobór z sieci nadrzędnej (generator synchroniczny bez mocy)} × granica {zamknięty łącznik
sprzęgła poszerza węzeł (scena), łącznik otwarty — granicą jest kabel} × kompletność
{komplet, odbiór na szynie stacji bez wiersza wyniku → jawny brak}. Funkcja czysta:
granica pusta (stacja bez odpływów) → jawny brak, nie 0,0; element granicy bez wiersza
wyniku → brak; determinizm (permutacja kolekcji migawki).
"""

from __future__ import annotations

import copy
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from enm.canonical_analysis import (
    build_execution_result_set,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel, Load
from enm.store import reset_enm_store, set_enm
from enm.topology import podziel_krawedzie
from enm.wyniki_pol_gpz import wiersze_wynikow_gpz
from network_model.solvers.power_flow_types import PowerFlowOptions

from scripts.eksport_fixtur_harnessu import (
    CASE_ID_HARNESSU,
    _enm_sceny_zbieznosc,
    oltc_scena_wynik,
)

#: Moc bazowa biegu (``enm.assembler``: ``options.get("base_mva", 100.0)``) — tolerancja
#: solvera jest niedopasowaniem mocy węzła w jednostkach względnych tej bazy.
MOC_BAZOWA_MVA = 100.0
WSPOLNE = {"proof_ref": None, "proof_status": "complete", "reporting_status": None}


def _wiersze(wynik: dict[str, Any], rodzaj: str) -> dict[str, dict[str, Any]]:
    return {
        w["element_ref"]: w["values"]
        for w in wynik["element_results"]
        if w["element_type"] == rodzaj
    }


@contextmanager
def _bieg(enm: EnergyNetworkModel) -> Iterator[dict[str, Any]]:
    reset_canonical_runs()
    reset_enm_store()
    try:
        set_enm(CASE_ID_HARNESSU, enm)
        bieg = execute_run(
            create_run(case_id=CASE_ID_HARNESSU, klucz_twin=CASE_ID_HARNESSU, analysis_type="PF").id
        )
        yield build_execution_result_set(bieg)
    finally:
        reset_canonical_runs()
        reset_enm_store()


def _sprawdz_tozsamosc(
    wynik: dict[str, Any], enm: EnergyNetworkModel, granica: set[str], wnetrze: set[str]
) -> dict[str, Any]:
    """Zasilanie − odpływy = straty wnętrza (tolerancja solvera × liczba szyn węzła);
    odpływy = suma zacisków elementów ``granica`` po stronie stacji."""
    bilans = _wiersze(wynik, "Substation")["sub_gpz"]
    galezie = _wiersze(wynik, "Branch")
    szyny_wezla = {
        szyna
        for ref in wnetrze
        for g in [*enm.branches, *enm.transformers]
        if g.ref_id == ref
        for szyna in (
            (g.hv_bus_ref, g.lv_bus_ref)
            if hasattr(g, "hv_bus_ref")
            else (g.from_bus_ref, g.to_bus_ref)
        )
    }
    oczekiwane_p = 0.0
    for ref in sorted(granica):
        g = next(e for e in [*enm.branches, *enm.transformers] if e.ref_id == ref)
        od = g.hv_bus_ref if hasattr(g, "hv_bus_ref") else g.from_bus_ref
        oczekiwane_p += galezie[ref]["p_mw"] if od in szyny_wezla else galezie[ref]["p_to_mw"]
    assert bilans["p_feeders_mw"] == oczekiwane_p
    straty = sum(galezie[ref]["losses_p_mw"] for ref in wnetrze)
    tolerancja = len(szyny_wezla) * PowerFlowOptions().tolerance * MOC_BAZOWA_MVA
    assert abs(bilans["p_supply_mw"] - bilans["p_feeders_mw"] - straty) <= tolerancja
    return bilans


def test_scena_oltc_bilans_domyka_sie_stratami_wnetrza_i_znakiem_oddawania() -> None:
    """Scena ``oltc_scena`` (fixtura harnessu): zamknięte sprzęgło ``sw_coupler`` scala szynę
    GPZ z szyną ``bus_sn_b`` — odpływami są linia ``line_b_c`` i transformator ``tr_sn_nn``,
    wnętrzem transformator ``tr_hv_sn`` i kabel ``cab_main_b`` równoległy do sprzęgła.
    Generacja (2,0 + 0,4 MW) przewyższa odbiór (1,65 MW) — GPZ ODDAJE moc do sieci
    nadrzędnej, więc zasilanie jest UJEMNE (konwencja: dodatnie = pobór z sieci)."""
    wynik = oltc_scena_wynik()
    enm = _enm_sceny_zbieznosc()
    bilans = _sprawdz_tozsamosc(
        wynik, enm, granica={"line_b_c", "tr_sn_nn"}, wnetrze={"tr_hv_sn", "cab_main_b"}
    )
    assert bilans["p_supply_mw"] < 0
    assert bilans["p_supply_mw"] == _wiersze(wynik, "Source")["src_gpz"]["p_injected_mw"]
    # Odpływy niezerowe przy odbiorach w scenie — nie 0,0 jak przed kartą.
    assert bilans["p_feeders_mw"] < 0


def test_otwarte_sprzeglo_granica_to_kabel_stacji() -> None:
    enm = _enm_sceny_zbieznosc()
    next(g for g in enm.branches if g.ref_id == "sw_coupler").status = "open"
    with _bieg(enm) as wynik:
        bilans = _sprawdz_tozsamosc(wynik, enm, granica={"cab_main_b"}, wnetrze={"tr_hv_sn"})
    assert bilans["p_supply_mw"] < 0


def test_pobor_z_sieci_nadrzednej_daje_dodatnie_zasilanie() -> None:
    enm = _enm_sceny_zbieznosc()
    generator = next(g for g in enm.generators if g.ref_id == "gen_sync")
    generator.p_mw = 0.0
    with _bieg(enm) as wynik:
        bilans = _sprawdz_tozsamosc(
            wynik, enm, granica={"line_b_c", "tr_sn_nn"}, wnetrze={"tr_hv_sn", "cab_main_b"}
        )
    assert bilans["p_supply_mw"] > 0
    assert bilans["p_feeders_mw"] > 0


def test_odbior_na_szynie_stacji_bez_wiersza_wyniku_daje_jawny_brak_odplywow() -> None:
    """Odbiór na szynie SN GPZ nie ma wiersza wyniku (szyna bez źródła) — jego moc w punkcie
    pracy nie jest znana z wyniku, więc bilans odpływów nie domyka się: metryka nieobecna,
    zasilanie zostaje."""
    enm = _enm_sceny_zbieznosc()
    enm.loads.append(
        Load(ref_id="load_gpz", name="Odbiór GPZ", bus_ref="bus_sn_main", p_mw=0.3, q_mvar=0.1)
    )
    with _bieg(enm) as wynik:
        bilans = _wiersze(wynik, "Substation")["sub_gpz"]
    assert "p_feeders_mw" not in bilans and "q_feeders_mvar" not in bilans
    assert "p_supply_mw" in bilans


# --- funkcja czysta: granica pusta, element bez wiersza, determinizm ------------------


def _migawka_i_wyniki() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    wynik = oltc_scena_wynik()
    return _enm_sceny_zbieznosc().model_dump(mode="json"), wynik["element_results"]


def _bilans(migawka: dict[str, Any], wyniki: list[dict[str, Any]]) -> dict[str, Any]:
    wiersze = {w["element_ref"]: w for w in wiersze_wynikow_gpz(migawka, wyniki, wspolne=WSPOLNE)}
    return wiersze["sub_gpz"]["values"]


def test_stacja_bez_odplywow_ma_jawny_brak_nie_zero() -> None:
    migawka, wyniki = _migawka_i_wyniki()
    for galaz in migawka["branches"]:
        if galaz["ref_id"] in {"cab_main_b", "sw_coupler"}:
            galaz["status"] = "open"
    granica = [
        k
        for k in podziel_krawedzie(migawka).w_ruchu
        if ("bus_sn_main" in (k.szyna_a, k.szyna_b)) and k.rodzaj != "transformator"
    ]
    assert granica == []
    bilans = _bilans(migawka, wyniki)
    assert "p_feeders_mw" not in bilans and "q_feeders_mvar" not in bilans


def test_element_granicy_bez_wiersza_wyniku_daje_brak() -> None:
    migawka, wyniki = _migawka_i_wyniki()
    bez_linii = [w for w in wyniki if w["element_ref"] != "line_b_c"]
    assert "p_feeders_mw" in _bilans(migawka, wyniki)
    assert "p_feeders_mw" not in _bilans(migawka, bez_linii)


def test_bilans_deterministyczny_wzgledem_kolejnosci_migawki() -> None:
    migawka, wyniki = _migawka_i_wyniki()
    odwrocona = copy.deepcopy(migawka)
    for kolekcja in ("branches", "transformers", "buses", "substations", "sources", "loads"):
        odwrocona[kolekcja] = list(reversed(odwrocona[kolekcja]))
    assert _bilans(migawka, wyniki) == _bilans(odwrocona, list(reversed(wyniki)))
