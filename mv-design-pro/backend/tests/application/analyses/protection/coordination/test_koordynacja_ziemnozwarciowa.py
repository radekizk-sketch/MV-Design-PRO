"""Koordynacja zabezpieczeń z biegów niesie ocenę ziemnozwarciową i uziemienia stacji — ta sama
funkcja co bieg oceny zabezpieczeń (karta EWALUATORY-ZIEMNOZWARCIOWE).

PO CO. Funkcje ziemnozwarciowe (51N, 67N, 59N, admitancyjne) mają czułość, selektywność
i czas zadziałania z solvera doziemień SN. Projektant ogląda je w biegu oceny zabezpieczeń
(karta pola) i w analizie koordynacji (E-28) — dwie ścieżki liczące to samo różnie byłyby
dwiema prawdami. Test przypina, że koordynacja niesie WYNIK RÓWNY wynikowi biegu
``protection_sn`` na tej samej migawce, oraz drugą stronę predykatu odmowy: model, którego
sterowniki mają wyłącznie funkcje ziemnozwarciowe, NIE jest „modelem bez zabezpieczeń"
(odmowę ``BRAK_ZABEZPIECZEN_W_MODELU`` dla modelu bez żadnego sterownika przypinają
``test_overcurrent_coordination.py`` i ``tests/api/test_protection_coordination_api.py``).

ILOCZYN CECH: sposób pracy punktu neutralnego {izolowany, kompensowany, kompensowany z AWSC,
rezystor} × konsument {bieg ``protection_sn``, koordynacja z biegów} oraz zestaw funkcji
sterowników {fazowe i ziemnozwarciowe, wyłącznie ziemnozwarciowe}.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.analyses.protection.coordination.models import CoordinationConfig
from application.analyses.protection.coordination.z_biegow import koordynacja_z_biegow
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.models import EnergyNetworkModel
from enm.store import get_enm, reset_enm_store, set_enm

from tests.reference_networks.scena_doziemienia import (
    PRZEKAZNIK,
    SPOSOBY_PRACY,
    SposobPracy,
    scena_z_nastawami,
)
from tests.reference_networks.sceny_zajetosci_pol import ok, op

_KLUCZ = "case-koordynacja-ziemnozwarciowa"


def _biegi(model: EnergyNetworkModel) -> tuple[str, str, Any]:
    reset_canonical_runs()
    reset_enm_store()
    set_enm(_KLUCZ, model)
    ids: dict[str, str] = {}
    for scenariusz in ("max", "min"):
        bieg = execute_run(
            create_run(
                case_id=_KLUCZ,
                klucz_twin=_KLUCZ,
                analysis_type="short_circuit_sn",
                options={"scenario": scenariusz},
            ).id
        )
        assert bieg.status == "FINISHED", bieg.error_message
        ids[scenariusz] = str(bieg.id)
    ochrona = execute_run(
        create_run(
            case_id=_KLUCZ,
            klucz_twin=_KLUCZ,
            analysis_type="protection_sn",
            options={"sc_run_id": ids["max"]},
        ).id
    )
    assert ochrona.status == "FINISHED", ochrona.error_message
    return ids["max"], ids["min"], ochrona


def _koordynuj(sc_max: str, sc_min: str) -> dict[str, Any]:
    return koordynacja_z_biegow(
        model=get_enm(_KLUCZ),
        project_id="projekt",
        sc_run_id=sc_max,
        sc_run_id_min=sc_min,
        pf_run_id=None,
        pary_wskazane=None,
        config=CoordinationConfig(),
    ).to_dict()


@pytest.mark.parametrize("sposob", SPOSOBY_PRACY)
def test_koordynacja_niesie_ten_sam_wynik_co_bieg_oceny(sposob: SposobPracy) -> None:
    sc_max, sc_min, ochrona = _biegi(EnergyNetworkModel.model_validate(scena_z_nastawami(sposob)))
    ziemne = _koordynuj(sc_max, sc_min)["ziemnozwarciowe"]
    assert ziemne == ochrona.raw_result["protection_result"]["ziemnozwarciowe"]
    assert {"51N", "67N"} <= {r["kod"] for r in ziemne["oceny"]}
    assert ziemne["uziemienia"], "uziemienie GPZ oceniane razem z funkcjami"
    for rekord in [*ziemne["oceny"], *ziemne["odmowy"], *ziemne["uziemienia"]]:
        assert rekord["zdanie_pl"].strip()
        assert rekord["ocena"]["wyjasnienie"]["zdanie_pl"].strip()


def _tylko_ziemnozwarciowe(enm: dict[str, Any]) -> dict[str, Any]:
    """Każdy sterownik z funkcjami fazowymi dostaje zestaw bez 50/51 (operacja projektanta
    `add_relay` z listą funkcji) — nastawy funkcji ziemnozwarciowych zostają."""
    for sterownik in list(enm["protection_assignments"]):
        kody = [f["kod"] for f in sterownik["funkcje"]]
        if not {"50", "51"} & set(kody):
            continue
        zadanie: dict[str, Any] = {
            "funkcje": [k for k in kody if k not in {"50", "51"}],
            "catalog_ref": PRZEKAZNIK,
        }
        if sterownik.get("bay_ref"):
            zadanie["bay_ref"] = sterownik["bay_ref"]
        else:
            zadanie["breaker_ref"] = (sterownik.get("meta") or {})["breaker_ref"]
        enm = ok(op(enm, "add_relay", zadanie))
    return enm


def test_sterowniki_wylacznie_ziemnozwarciowe_to_nie_model_bez_zabezpieczen() -> None:
    enm = _tylko_ziemnozwarciowe(scena_z_nastawami("IZOLOWANY"))
    funkcje = {f["kod"] for s in enm["protection_assignments"] for f in s["funkcje"]}
    assert not {"50", "51"} & funkcje and {"51N", "67N"} <= funkcje
    sc_max, sc_min, ochrona = _biegi(EnergyNetworkModel.model_validate(enm))
    wynik = _koordynuj(sc_max, sc_min)
    # Ocena nadprądowa fazowa nie ma czego oceniać — każde urządzenie pominięte z przyczyną.
    assert not wynik["devices"]
    assert wynik["pominiete"] and all(p["powod_pl"].strip() for p in wynik["pominiete"])
    ziemne = wynik["ziemnozwarciowe"]
    assert ziemne == ochrona.raw_result["protection_result"]["ziemnozwarciowe"]
    assert {"51N", "67N"} <= {r["kod"] for r in ziemne["oceny"]}
