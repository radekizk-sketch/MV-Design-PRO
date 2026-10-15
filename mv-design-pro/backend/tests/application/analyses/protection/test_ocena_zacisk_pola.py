"""Punkt zwarcia na ZACISKU POLA za wyłącznikiem — ocena nadprądowa z toru pola (karta
BIEG-ZABEZPIECZEN-NA-PARTII-6).

PO CO. Karta POLA-W-TORZE przyłącza element pola (kabel odpływu) do ZACISKU pola — szyny
pomocniczej za aparatem pola — a szyna pomocnicza nie jest celem zwarcia biegu SC (wynik
raportuje ją pod szyną pola: ``enm.tor_pola.szyna_raportowa``). Bez tej reguły ocena
zabezpieczenia pola widziała w strefie wyłącznie odległe szyny, a zwarcie tuż za
przekładnikiem (głowica kabla odpływu — punkt NAJWIĘKSZEGO prądu przekaźnika, rozstrzygający
dla I>>) znikało z oceny, koordynacji i znaczników TCC.

WYROCZNIA. Sieć promieniowa z jednym zasilaniem, bez źródeł w strefie: prąd przekaźnika przy
zwarciu na zacisku pola = Ik'' szyny pola (wkład ze strefy = 0), a czas = wzór IEC 60255-151
dla nastaw z modelu.

ILOCZYN CECH: kotwica zabezpieczenia {wyłącznik pola z własnym zaciskiem, wyłącznik liniowy
bez szyny raportowej poza strefą} × punkt {zacisk za wyłącznikiem, szyna strefy, zacisk
pomocniczy w strefie raportowany pod szyną strefy} × scenariusz {MAX, MIN} × konsument
{bieg ``protection_sn``, koordynacja E-28 (znaczniki TCC)}.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.domain_operations import execute_domain_operation
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel
from enm.store import get_enm, reset_enm_store, set_enm
from enm.tor_pola import szyna_raportowa

from tests.golden.enm_builders.zabezpieczenia_magistrali import (
    KATALOG_PRZEKAZNIKA,
    KATALOG_PRZEKLADNIKA,
    NASTAWY_Q1,
    NASTAWY_Q2,
    NAZWA_ZABEZPIECZENIA_Q1,
    NAZWA_ZABEZPIECZENIA_Q2,
    build_zabezpieczenia_magistrali_enm,
)

NAZWA_ZABEZPIECZENIA_POLA = "Zabezpieczenie pola odpływowego S01"
_PRZEKLADNIA = 600.0 / 5.0
_KLUCZ = "case-zacisk-pola"


def _z_zabezpieczeniem_pola_odplywowego() -> tuple[EnergyNetworkModel, str, str]:
    """G08 + zabezpieczenie w polu ODPŁYWOWYM (OUT) Stacji S01 — dwie operacje projektanta
    (``add_ct``, ``add_relay`` z ``field_ref``). Zwraca ``(model, zacisk pola, szyna pola)``."""
    enm = build_zabezpieczenia_magistrali_enm().model_dump(mode="json")
    stacja = next(s for s in enm["substations"] if s["name"] == "Stacja S01")
    pole = next(s for s in stacja["meta"]["field_specs"] if s["bay_role"] == "OUT")
    wynik = execute_domain_operation(
        enm,
        "add_ct",
        {
            "field_ref": pole["field_ref"],
            "catalog_ref": KATALOG_PRZEKLADNIKA,
            "ratio_primary_a": 600.0,
            "ratio_secondary_a": 5.0,
            "accuracy_class": "5P20",
            "burden_va": 15.0,
            "name": "Przekładnik pola odpływowego S01",
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    wynik = execute_domain_operation(
        wynik["snapshot"],
        "add_relay",
        {
            "field_ref": pole["field_ref"],
            "relay_type": "NADPRADOWY",
            "catalog_ref": KATALOG_PRZEKAZNIKA,
            "name": NAZWA_ZABEZPIECZENIA_POLA,
            "settings": NASTAWY_Q2,
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    migawka = wynik["snapshot"]
    (aparat_ref,) = pole["equipment_refs"]
    aparat = next(g for g in migawka["branches"] if g["ref_id"] == aparat_ref)
    zacisk = aparat["to_bus_ref"]
    szyna_pola = aparat["from_bus_ref"]
    assert szyna_raportowa(migawka, zacisk) == szyna_pola
    return EnergyNetworkModel.model_validate(migawka), zacisk, szyna_pola


def _biegi(model: EnergyNetworkModel, scenariusz: str | None) -> tuple[Any, Any]:
    reset_canonical_runs()
    reset_enm_store()
    set_enm(_KLUCZ, model)
    opcje = {"scenario": scenariusz} if scenariusz else None
    sc = execute_run(
        create_run(
            case_id=_KLUCZ, klucz_twin=_KLUCZ, analysis_type="short_circuit_sn", options=opcje
        ).id
    )
    assert sc.status == "FINISHED", sc.error_message
    zab = execute_run(
        create_run(
            case_id=_KLUCZ,
            klucz_twin=_KLUCZ,
            analysis_type="protection_sn",
            options={"sc_run_id": str(sc.id)},
        ).id
    )
    assert zab.status == "FINISHED", zab.error_message
    return sc, zab


def _czas_normy(nastawy: list[dict[str, Any]], prad_a: float) -> float | None:
    czasy: list[float] = []
    for n in nastawy:
        m = prad_a / (n["threshold_a"] * _PRZEKLADNIA)
        if m <= 1.0:
            continue
        if n["curve_type"] == "DT":
            czasy.append(n["time_delay_s"])
        else:
            czasy.append(n["time_multiplier"] * 0.14 / (math.pow(m, 0.02) - 1.0))
    return min(czasy) if czasy else None


@pytest.fixture(scope="module")
def siec() -> tuple[EnergyNetworkModel, str, str]:
    return _z_zabezpieczeniem_pola_odplywowego()


@pytest.mark.parametrize("scenariusz", [None, "min"])
def test_zacisk_pola_jest_punktem_oceny_z_wierszem_szyny_pola(
    siec: tuple[EnergyNetworkModel, str, str], scenariusz: str | None
) -> None:
    model, zacisk, szyna_pola = siec
    sc, zab = _biegi(model, scenariusz)
    wiersze = {w["fault_node_id"]: w for w in sc.raw_result["results"]}
    assert ref_to_graph_id(zacisk) not in wiersze, "zacisk pola nie jest celem zwarcia biegu"
    wynik = zab.raw_result["protection_result"]
    assert wynik["odmowy"] == []
    oceny_pola = [
        o for o in wynik["evaluations"] if o["nazwa_urzadzenia_pl"] == NAZWA_ZABEZPIECZENIA_POLA
    ]
    na_zacisku = [o for o in oceny_pola if o["fault_target_id"] == ref_to_graph_id(zacisk)]
    assert len(na_zacisku) == 1
    ocena = na_zacisku[0]
    bilans = ocena["bilans_pradu"]
    assert bilans["zwarcie_w_klastrze"] is True
    assert bilans["punkt_wyniku_ref"] == ref_to_graph_id(szyna_pola)
    ik_pola = wiersze[ref_to_graph_id(szyna_pola)]["ikss_a"]
    # Bilans klastra zacisku (White Box): Ik'' z wiersza SZYNY POLA + wypływy gałęzi klastra.
    assert bilans["ikss_punktu_a"] == ik_pola
    suma = ik_pola + sum(g["wyplyw_z_klastra_a"] for g in bilans["skladniki_galezi"])
    suma -= sum(z["prad_a"] for z in bilans["wplywy_zrodel_w_klastrze"])
    assert ocena["i_fault_a"] == pytest.approx(abs(suma), rel=1e-12)
    # Sieć promieniowa, strefa bez źródeł: I_Q = Ik'' szyny pola z dokładnością do prądów
    # pojemnościowych kabli strefy (< 0,01 %, jak dla wyłącznika liniowego sieci G08).
    assert ocena["i_fault_a"] == pytest.approx(ik_pola, rel=1e-4)
    assert ocena["t_trip_s"] == pytest.approx(_czas_normy(NASTAWY_Q2, ocena["i_fault_a"]), abs=1e-9)
    # Zacisk za wyłącznikiem to punkt NAJWIĘKSZEGO prądu przekaźnika w strefie.
    assert ocena["i_fault_a"] == max(o["i_fault_a"] for o in oceny_pola)


def test_zaciski_pomocnicze_w_strefie_nie_dublują_szyny_strefy(
    siec: tuple[EnergyNetworkModel, str, str],
) -> None:
    """Zacisk pola WE Stacji S02 i koniec odcinka leżą w strefie i raportują się pod szyną
    S02 (ten sam węzeł elektryczny) — oceniany jest raz, jako szyna S02."""
    model, zacisk, _szyna_pola = siec
    _sc, zab = _biegi(model, None)
    wynik = zab.raw_result["protection_result"]
    punkty = sorted(
        o["nazwa_punktu_pl"]
        for o in wynik["evaluations"]
        if o["nazwa_urzadzenia_pl"] == NAZWA_ZABEZPIECZENIA_POLA
    )
    nazwa_zacisku = next(
        o["nazwa_punktu_pl"]
        for o in wynik["evaluations"]
        if o["fault_target_id"] == ref_to_graph_id(zacisk)
    )
    assert punkty == sorted(["Stacja S02", nazwa_zacisku])


def test_wylaczniki_liniowe_bez_zmiany_punktow(
    siec: tuple[EnergyNetworkModel, str, str],
) -> None:
    """Druga kotwica iloczynu: zacisk wyłącznika liniowego jest szyną pomocniczą, której węzeł
    elektryczny nie ma szyny niepomocniczej po stronie zasilania — nie dostaje punktu, a
    punkty Q1 i Q2 są tymi samymi szynami stacji co na sieci G08 bez pola."""
    model, _zacisk, _szyna_pola = siec
    _sc, zab = _biegi(model, None)
    wynik = zab.raw_result["protection_result"]
    punkty: dict[str, set[str]] = {}
    for ocena in wynik["evaluations"]:
        punkty.setdefault(ocena["nazwa_urzadzenia_pl"], set()).add(ocena["nazwa_punktu_pl"])
    assert punkty[NAZWA_ZABEZPIECZENIA_Q1] == {"Stacja S01", "Stacja S02"}
    assert punkty[NAZWA_ZABEZPIECZENIA_Q2] == {"Stacja S02"}
    nastawy = {NAZWA_ZABEZPIECZENIA_Q1: NASTAWY_Q1, NAZWA_ZABEZPIECZENIA_Q2: NASTAWY_Q2}
    for ocena in wynik["evaluations"]:
        if ocena["nazwa_urzadzenia_pl"] in nastawy:
            assert ocena["bilans_pradu"]["punkt_wyniku_ref"] == ocena["fault_target_id"]
            assert ocena["t_trip_s"] == pytest.approx(
                _czas_normy(nastawy[ocena["nazwa_urzadzenia_pl"]], ocena["i_fault_a"]), abs=1e-6
            )


def test_koordynacja_ma_znacznik_tcc_na_zacisku_pola(
    siec: tuple[EnergyNetworkModel, str, str],
) -> None:
    """Konsument koordynacji: znacznik Ik'' TCC na zacisku pola czyta wiersz szyny pola —
    ten sam punkt wyniku co ocena (jedno źródło punktów, ``punkty_zwarcia_strefy``)."""
    from application.analyses.protection.coordination.models import CoordinationConfig
    from application.analyses.protection.coordination.z_biegow import koordynacja_z_biegow

    model, zacisk, szyna_pola = siec
    sc_max, _ = _biegi(model, None)
    sc_min = execute_run(
        create_run(
            case_id=_KLUCZ,
            klucz_twin=_KLUCZ,
            analysis_type="short_circuit_sn",
            options={"scenario": "min"},
        ).id
    )
    wynik = koordynacja_z_biegow(
        model=get_enm(_KLUCZ),
        project_id="projekt",
        sc_run_id=str(sc_max.id),
        sc_run_id_min=str(sc_min.id),
        pf_run_id=None,
        pary_wskazane=None,
        config=CoordinationConfig(),
    ).to_dict()
    wiersze_max = {w["fault_node_id"]: w for w in sc_max.raw_result["results"]}
    znaczniki = [z for z in wynik["fault_markers"] if z["location"] == ref_to_graph_id(zacisk)]
    assert {z["id"].rsplit("_", 1)[-1] for z in znaczniki} == {"max", "min"}
    znacznik_max = next(z for z in znaczniki if z["id"].endswith("_max"))
    assert znacznik_max["current_a"] == pytest.approx(
        wiersze_max[ref_to_graph_id(szyna_pola)]["ikss_a"], rel=1e-12
    )
