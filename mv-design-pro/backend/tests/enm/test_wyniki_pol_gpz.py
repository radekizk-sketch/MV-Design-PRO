"""Pomiar zacisku pola GPZ i bilans GPZ w wyniku rozpływu (karta GPZ-PARYTET).

Schemat GPZ pokazuje przy polu P/Q/I/U, a w nagłówku stacji bilans i liczbę alarmów —
wyłącznie z backendu (front nie przeszukuje topologii i nie sumuje mocy). Testy:

* ścieżka produktu (API w procesie): sieć zbudowana operacjami domenowymi, bieg
  ``LOAD_FLOW``, ``GET …/results/v1`` — wiersz ``bay`` pola GPZ równy zaciskowi
  pierwszego odcinka korytarza, wiersz ``substation`` z bilansem i liczbą alarmów;
* iloczyn cech na funkcji czystej (migawka z tej samej sieci, wiersze wyniku podane
  jawnie): koniec gałęzi w punkcie pola {od, do, żaden} × rozstrzygnięcie elementu pola
  {jeden korytarz, dwa korytarze, pole wolne} × rola pola {liniowe, transformatorowe,
  pomiarowe} × bilans {kompletny, niekompletny} × źródła {jedno, dwa na jednej szynie} ×
  alarm {przeciążony odpływ, przeciążony transformator wieży, brak} × determinizm
  (permutacja wejścia).
"""

from __future__ import annotations

import copy
import logging
from typing import Any

import pytest
from enm.assembler import _graph_id_from_ref
from enm.wyniki_pol_gpz import wiersze_wynikow_gpz
from fastapi.testclient import TestClient

from tests.reference_networks.budowa_przez_api import KlientBudowy, segmenty_korytarza
from tests.utils.biegi import wykonaj_bieg

WSPOLNE = {"proof_ref": None, "proof_status": "complete", "reporting_status": None}


@pytest.fixture(scope="module")
def siec() -> Any:
    from api.main import app

    logging.getLogger("httpx").setLevel(logging.WARNING)
    with TestClient(app) as klient:
        b = KlientBudowy(klient, "Pomiar pól GPZ")
        b.gpz()
        b.odcinek_magistrali(120, "Odcinek 0")
        b.odcinek_magistrali(121, "Odcinek 1")
        b.szablon("tpl_sn_nn_1250kva", segmenty_korytarza(b.migawka())[1])
        bieg = klient.post(
            f"/api/execution/study-cases/{b.case_id}/runs",
            json={"analysis_type": "LOAD_FLOW", "solver_input": {}},
        ).json()
        assert wykonaj_bieg(klient, bieg["id"]).json()["status"] == "DONE"
        wynik = klient.get(f"/api/execution/runs/{bieg['id']}/results/v1").json()
        yield b.migawka(), wynik


def _gpz(migawka: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in migawka["substations"] if s.get("station_type") == "gpz")


def _pole_liniowe(migawka: dict[str, Any]) -> dict[str, Any]:
    stacja = _gpz(migawka)["ref_id"]
    return next(
        p
        for p in migawka["bays"]
        if p.get("substation_ref") == stacja and p["bay_role"] == "FEEDER"
    )


def _szyna_sn(migawka: dict[str, Any]) -> str:
    return next(r for r in _gpz(migawka)["bus_refs"] if r.endswith("/bus_sn"))


def _metryki(element: dict[str, Any]) -> dict[str, Any]:
    return {kod: m["value"] for kod, m in element["metrics"].items()}


# --- ścieżka produktu --------------------------------------------------------------


def test_bieg_rozplywu_niesie_pomiar_pola_gpz_rowny_zaciskowi_pierwszego_odcinka(
    siec: Any,
) -> None:
    migawka, wynik = siec
    elementy = wynik["overlay_payload"]["elements"]
    pole = _pole_liniowe(migawka)
    pierwszy = migawka["corridors"][0]["ordered_segment_refs"][0]
    wiersz_pola = elementy[pole["ref_id"]]
    assert wiersz_pola["kind"] == "bay"
    pomiar = _metryki(wiersz_pola)
    odcinek = _metryki(elementy[pierwszy])
    assert set(pomiar) == {"P_MW", "Q_Mvar", "I_A", "U_kV", "LOADING_PCT"}
    for kod in ("P_MW", "Q_Mvar", "I_A", "LOADING_PCT"):
        assert pomiar[kod] == odcinek[kod]
    assert pomiar["U_kV"] == _metryki(elementy[_szyna_sn(migawka)])["U_kV"]
    # Moc płynie z GPZ do sieci — dodatnia moc czynna zacisku pola.
    assert pomiar["P_MW"] > 0


def test_bieg_rozplywu_niesie_bilans_gpz_z_wtrysku_zrodla_i_sumy_odplywow(siec: Any) -> None:
    migawka, wynik = siec
    elementy = wynik["overlay_payload"]["elements"]
    stacja = _gpz(migawka)["ref_id"]
    bilans = _metryki(elementy[stacja])
    assert elementy[stacja]["kind"] == "substation"
    zrodlo = next(z for z in migawka["sources"] if z.get("substation_ref") == stacja)
    wtrysk = _metryki(elementy[zrodlo["ref_id"]])
    assert bilans["P_SUPPLY_MW"] == wtrysk["P_MW"]
    assert bilans["Q_SUPPLY_Mvar"] == wtrysk["Q_Mvar"]
    pole = _metryki(elementy[_pole_liniowe(migawka)["ref_id"]])
    assert bilans["P_FEEDERS_MW"] == pole["P_MW"]
    assert bilans["Q_FEEDERS_Mvar"] == pole["Q_Mvar"]
    assert bilans["ALARM_COUNT"] == 0
    assert elementy[stacja]["metrics"]["ALARM_COUNT"]["format_hint"] == "fixed0"


# --- iloczyn cech na funkcji czystej ---------------------------------------------------


def _galaz(
    ref: str,
    od: str,
    do: str,
    *,
    p: float = 1.0,
    q: float = 0.5,
    i: float = 40.0,
    p_do: float = -0.99,
    q_do: float = -0.49,
    i_do: float = 39.0,
    obciazenie: float = 20.0,
    flagi: tuple[str, ...] = (),
) -> dict[str, Any]:
    return {
        "element_ref": ref,
        "element_type": "Branch",
        "values": {
            "from_bus": _graph_id_from_ref(od),
            "to_bus": _graph_id_from_ref(do),
            "p_mw": p,
            "q_mvar": q,
            "i_a": i,
            "p_to_mw": p_do,
            "q_to_mvar": q_do,
            "i_do_a": i_do,
            "loading_pct": obciazenie,
            "flags": list(flagi),
        },
    }


def _szyna(ref: str, u_kv: float) -> dict[str, Any]:
    return {"element_ref": ref, "element_type": "Bus", "values": {"u_kv": u_kv}}


def _zrodlo(ref: str, p: float | None, q: float | None) -> dict[str, Any]:
    return {
        "element_ref": ref,
        "element_type": "Source",
        "values": {"p_injected_mw": p, "q_injected_mvar": q},
    }


def _wiersze(migawka: dict[str, Any], wyniki: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {w["element_ref"]: w for w in wiersze_wynikow_gpz(migawka, wyniki, wspolne=WSPOLNE)}


def _dane(migawka: dict[str, Any]) -> tuple[str, str, str, str]:
    stacja = _gpz(migawka)
    pole = _pole_liniowe(migawka)
    pierwszy = migawka["corridors"][0]["ordered_segment_refs"][0]
    zrodlo = next(z for z in migawka["sources"] if z.get("substation_ref") == stacja["ref_id"])
    return stacja["ref_id"], pole["ref_id"], pierwszy, zrodlo["ref_id"]


@pytest.mark.parametrize("koniec", ["od", "do", "zaden"])
def test_zacisk_pola_z_konca_galezi_lezacego_w_punkcie_pola(siec: Any, koniec: str) -> None:
    migawka, _ = siec
    stacja, pole, pierwszy, zrodlo = _dane(migawka)
    szyna = _szyna_sn(migawka)
    inny = "inna/szyna"
    od, do = {"od": (szyna, inny), "do": (inny, szyna), "zaden": (inny, "trzecia/szyna")}[koniec]
    wyniki = [
        _szyna(szyna, 15.1),
        _galaz(pierwszy, od, do),
        _zrodlo(zrodlo, 2.0, 1.0),
    ]
    wiersze = _wiersze(migawka, wyniki)
    wartosci = wiersze[pole]["values"]
    assert wartosci["u_kv"] == 15.1
    if koniec == "od":
        assert (wartosci["p_from_mw"], wartosci["q_from_mvar"], wartosci["i_a"]) == (1.0, 0.5, 40.0)
        assert wartosci["feeder_ref"] == pierwszy
    elif koniec == "do":
        assert (wartosci["p_from_mw"], wartosci["q_from_mvar"], wartosci["i_a"]) == (
            -0.99,
            -0.49,
            39.0,
        )
    else:
        # Żaden koniec gałęzi nie leży w punkcie pola — brak wielkości toru, bez domysłu;
        # suma odpływów niekompletna (zajęte pole bez rozstrzygnięcia) — brak bilansu odpływów.
        assert set(wartosci) == {"u_kv"}
        assert "p_feeders_mw" not in wiersze[stacja]["values"]


@pytest.mark.parametrize("przylaczenie", ["fizyczne_1", "fizyczne_2", "korytarz_1", "korytarze_2"])
def test_element_pola_wylacznie_z_jednoznacznej_zajetosci(siec: Any, przylaczenie: str) -> None:
    """Pole → element rozstrzyga ``enm.zajetosc_pol`` (R1/R2 fizycznie, R3/R4 przez korytarz);
    niejednoznaczność (dwa odcinki, dwa korytarze) = brak wielkości toru i brak sumy odpływów."""
    migawka = copy.deepcopy(siec[0])
    stacja, pole, pierwszy, zrodlo = _dane(migawka)
    szyna = _szyna_sn(migawka)
    odcinek = next(g for g in migawka["branches"] if g["ref_id"] == pierwszy)
    if przylaczenie == "fizyczne_2":
        drugi = copy.deepcopy(odcinek)
        drugi["ref_id"] = f"{pierwszy}-drugi"
        migawka["branches"].append(drugi)
    if przylaczenie.startswith("korytar"):
        # Odcinek bez pochodzenia z pola — przyłączenie deklaratywne (R4: pole indeksu 0).
        odcinek["meta"] = {}
    if przylaczenie == "korytarze_2":
        drugi_korytarz = copy.deepcopy(migawka["corridors"][0])
        drugi_korytarz["ref_id"] = drugi_korytarz["ref_id"].replace("corridor_01", "corridor_02")
        migawka["corridors"].append(drugi_korytarz)
    wiersze = _wiersze(
        migawka,
        [_szyna(szyna, 15.0), _galaz(pierwszy, szyna, "x"), _zrodlo(zrodlo, 2.0, 1.0)],
    )
    wartosci = wiersze[pole]["values"]
    bilans = wiersze[stacja]["values"]
    if przylaczenie in ("fizyczne_1", "korytarz_1"):
        assert wartosci["feeder_ref"] == pierwszy
        assert bilans["p_feeders_mw"] == 1.0
    else:
        assert set(wartosci) == {"u_kv"}
        assert "p_feeders_mw" not in bilans and "q_feeders_mvar" not in bilans
    # Zasilanie nie zależy od rozstrzygnięcia odpływów.
    assert bilans["p_supply_mw"] == 2.0


def test_pole_wolne_nie_psuje_kompletnosci_bilansu_odplywow(siec: Any) -> None:
    migawka = copy.deepcopy(siec[0])
    stacja, pole, pierwszy, zrodlo = _dane(migawka)
    szyna = _szyna_sn(migawka)
    wolne = copy.deepcopy(_pole_liniowe(migawka))
    wolne["ref_id"] = f"{pole}-wolne"
    wolne["meta"] = {}
    wolne["bay_role"] = "OUT"
    migawka["bays"].append(wolne)
    wiersze = _wiersze(
        migawka,
        [
            _szyna(szyna, 15.0),
            _galaz(pierwszy, szyna, "x", p=3.0, q=1.5),
            _zrodlo(zrodlo, 3.1, 1.6),
        ],
    )
    assert set(wiersze[wolne["ref_id"]]["values"]) == {"u_kv"}
    assert wiersze[stacja]["values"]["p_feeders_mw"] == 3.0
    assert wiersze[stacja]["values"]["q_feeders_mvar"] == 1.5


@pytest.mark.parametrize("rola", ["TR", "MEASUREMENT"])
def test_pole_transformatorowe_i_pomiarowe(siec: Any, rola: str) -> None:
    migawka = copy.deepcopy(siec[0])
    stacja, pole, pierwszy, zrodlo = _dane(migawka)
    szyna = _szyna_sn(migawka)
    transformator = _gpz(migawka)["transformer_refs"][0]
    dodatkowe = copy.deepcopy(_pole_liniowe(migawka))
    dodatkowe.update(
        ref_id=f"{pole}-{rola}", bay_role=rola, meta={"transformer_ref": transformator}
    )
    migawka["bays"].append(dodatkowe)
    wiersze = _wiersze(
        migawka,
        [
            _szyna(szyna, 15.0),
            _galaz(pierwszy, szyna, "x"),
            _galaz(transformator, "gpz/wn", szyna, p_do=-5.0, q_do=-2.0, i_do=200.0),
            _zrodlo(zrodlo, 5.0, 2.0),
        ],
    )
    wartosci = wiersze[dodatkowe["ref_id"]]["values"]
    if rola == "TR":
        # Pole transformatorowe: zacisk transformatora po stronie szyny pola (koniec „do").
        assert wartosci["feeder_ref"] == transformator
        assert (wartosci["p_from_mw"], wartosci["q_from_mvar"], wartosci["i_a"]) == (
            -5.0,
            -2.0,
            200.0,
        )
    else:
        # Pole pomiarowe nie zasila elementu — wyłącznie napięcie szyny pola.
        assert set(wartosci) == {"u_kv"}
    # Pole transformatorowe nie jest odpływem — suma odpływów to tylko pole liniowe.
    assert wiersze[stacja]["values"]["p_feeders_mw"] == 1.0


def test_dwa_zrodla_na_jednej_szynie_licza_wtrysk_wezla_raz(siec: Any) -> None:
    migawka = copy.deepcopy(siec[0])
    stacja, _, pierwszy, zrodlo = _dane(migawka)
    szyna = _szyna_sn(migawka)
    drugie = copy.deepcopy(next(z for z in migawka["sources"] if z["ref_id"] == zrodlo))
    drugie["ref_id"] = f"{zrodlo}-drugie"
    migawka["sources"].append(drugie)
    wiersze = _wiersze(
        migawka,
        [
            _szyna(szyna, 15.0),
            _galaz(pierwszy, szyna, "x"),
            _zrodlo(zrodlo, 2.0, 1.0),
            _zrodlo(drugie["ref_id"], 2.0, 1.0),
        ],
    )
    assert wiersze[stacja]["values"]["p_supply_mw"] == 2.0
    assert wiersze[stacja]["values"]["q_supply_mvar"] == 1.0


def test_zrodlo_bez_mocy_biernej_daje_brak_zasilania_nie_zero(siec: Any) -> None:
    migawka, _ = siec
    stacja, _, pierwszy, zrodlo = _dane(migawka)
    szyna = _szyna_sn(migawka)
    wiersze = _wiersze(
        migawka, [_szyna(szyna, 15.0), _galaz(pierwszy, szyna, "x"), _zrodlo(zrodlo, 2.0, None)]
    )
    assert "p_supply_mw" not in wiersze[stacja]["values"]
    assert "q_supply_mvar" not in wiersze[stacja]["values"]


@pytest.mark.parametrize("przeciazony", ["odplyw", "transformator_wiezy", "brak"])
def test_alarmy_stacji_z_przeciazen_elementow_gpz(siec: Any, przeciazony: str) -> None:
    migawka, _ = siec
    stacja, _, pierwszy, zrodlo = _dane(migawka)
    szyna = _szyna_sn(migawka)
    transformator = _gpz(migawka)["transformer_refs"][0]
    flaga_odplywu = ("OVERLOADED",) if przeciazony == "odplyw" else ()
    flaga_tr = ("OVERLOADED",) if przeciazony == "transformator_wiezy" else ()
    wiersze = _wiersze(
        migawka,
        [
            _szyna(szyna, 15.0),
            _galaz(pierwszy, szyna, "x", obciazenie=120.0, flagi=flaga_odplywu),
            _galaz(transformator, "gpz/wn", szyna, flagi=flaga_tr),
            _zrodlo(zrodlo, 2.0, 1.0),
        ],
    )
    assert wiersze[stacja]["values"]["alarm_count"] == (0 if przeciazony == "brak" else 1)


def test_determinizm_niezalezny_od_kolejnosci_wejscia(siec: Any) -> None:
    migawka, _ = siec
    _, _, pierwszy, zrodlo = _dane(migawka)
    szyna = _szyna_sn(migawka)
    wyniki = [_szyna(szyna, 15.0), _galaz(pierwszy, szyna, "x"), _zrodlo(zrodlo, 2.0, 1.0)]
    odwrocona = copy.deepcopy(migawka)
    for kolekcja in ("bays", "sources", "corridors", "substations"):
        odwrocona[kolekcja] = list(reversed(odwrocona[kolekcja]))
    pierwszy_wynik = wiersze_wynikow_gpz(migawka, wyniki, wspolne=WSPOLNE)
    assert pierwszy_wynik == wiersze_wynikow_gpz(odwrocona, list(reversed(wyniki)), wspolne=WSPOLNE)
    assert [w["element_ref"] for w in pierwszy_wynik] == sorted(
        w["element_ref"] for w in pierwszy_wynik
    )


def test_siec_bez_gpz_nie_dostaje_wierszy(siec: Any) -> None:
    migawka = copy.deepcopy(siec[0])
    for stacja in migawka["substations"]:
        stacja["station_type"] = "mv_lv"
    assert wiersze_wynikow_gpz(migawka, [], wspolne=WSPOLNE) == []
