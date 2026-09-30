"""Jedna materializacja pól karty przekształtnika niezależnie od toru (AB-H0 §0.8).

Iloczyn cech: technologia z kartą referencyjną (PV, BESS) × tor utworzenia źródła
(atomowy nN ``add_converter_source``, stacyjny ``nn_block`` → ``_materialize_nn_source``,
DER-SN ``_add_converter_source_der_sn``). Predykat parami: klucze pól karty w
``materialized_params`` generatora = ``pola_karty_obecne`` typu projekcji (to samo źródło
prawdy dla kontraktu materializacji i dla każdego toru), a wartości są identyczne we
wszystkich torach. Przed kartą AB-H0 projekcje PV/BESS gubiły ``flicker_c``, pola SSCI,
filtr, krzywą P-Q i ``card_field_status``.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import POLA_KARTY_MATERIALIZOWANE_GDY_OBECNE, pola_karty_obecne

from tests.enm import test_brama_katalogowa_operacji_v2 as h
from tests.enm.test_karty_widmowe_modelu import _siec, _szyna_nn

KARTY: dict[str, tuple[str, str, float, str, str]] = {
    # technologia: (typ, przestrzeń projekcji, U_nN, trafo stacji, trafo blokowe DER-SN)
    "PV": (
        "conv-pv-card-huawei-sun2000-215ktl",
        "ZRODLO_NN_PV",
        0.8,
        "tr-sn-nn-15-0p8-2p5mva-dyn11-inverter",
        "tr-sn-nn-15-0p8-1mva-dyn11-inverter",
    ),
    "BESS": (
        "conv-bess-card-sungrow-sc2000ud-mv",
        "ZRODLO_NN_BESS",
        0.69,
        "tr-sn-nn-15-0p69-2p5mva-dyn11-inverter",
        "tr-sn-nn-15-0p69-2p5mva-dyn11-inverter",
    ),
}
KONFIGURACJA_STACYJNA = {"PV": "PV_INVERTER", "BESS": "BESS_INVERTER"}


def _tor_atomowy(technologia: str) -> dict[str, Any]:
    typ, _, napiecie, trafo, _ = KARTY[technologia]
    snapshot = _siec(napiecie, trafo)
    return h._wykonaj(
        snapshot,
        "add_converter_source",
        {
            "source_technology": technologia,
            "connection_variant": "nn_side",
            "station_ref": h._stacja_ref(snapshot),
            "bus_nn_ref": _szyna_nn(snapshot, napiecie),
            "source_name": f"Źródło {technologia}",
            "catalog_ref": typ,
        },
    )


def _tor_stacyjny(technologia: str) -> dict[str, Any]:
    typ, _, napiecie, trafo, _ = KARTY[technologia]
    snapshot = h._wykonaj(
        h._pusty_enm(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": h.REF_ZRODLO,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    snapshot = h._wykonaj(
        snapshot,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": h.REF_KABEL}},
    )
    payload = h._payload_stacji(
        str(snapshot["branches"][-1]["to_bus_ref"]),
        h._blok_nn(
            nn_configuration=KONFIGURACJA_STACYJNA[technologia],
            source_converter_catalog_ref=typ,
            source_converter_kind=technologia,
        ),
    )
    payload["nn_voltage_kv"] = napiecie
    payload["transformer"]["transformer_catalog_ref"] = trafo
    return h._wykonaj(snapshot, "append_station_on_endpoint", payload)


def _tor_der_sn(technologia: str) -> dict[str, Any]:
    typ, _, napiecie, _, trafo_blokowe = KARTY[technologia]
    snapshot = h._siec_ze_stacja()
    payload = copy.deepcopy(h._payload_konwerter_der_sn(snapshot))
    payload["catalog_ref"] = typ
    payload["source_technology"] = technologia
    payload.pop("power_setpoint_mw", None)
    topologia = payload["der_topology"]
    topologia["inverter_output_voltage_kv"] = napiecie
    blokowy = topologia["block_transformer"]
    katalog_trafo = get_default_mv_catalog().get_transformer_type(trafo_blokowe)
    assert katalog_trafo is not None
    blokowy["catalog_ref"] = trafo_blokowe
    blokowy["catalog_binding"]["catalog_item_id"] = trafo_blokowe
    blokowy["secondary_voltage_kv"] = napiecie
    blokowy["rated_power_mva"] = katalog_trafo.rated_power_mva
    return h._wykonaj(snapshot, "add_converter_source", payload)


TORY = {"atomowy_nn": _tor_atomowy, "stacyjny_nn_block": _tor_stacyjny, "der_sn": _tor_der_sn}


@pytest.mark.parametrize("technologia", sorted(KARTY))
def test_pola_karty_w_parametrach_generatora_identyczne_we_wszystkich_torach(
    technologia: str,
) -> None:
    typ, przestrzen, *_ = KARTY[technologia]
    katalog = get_default_mv_catalog()
    projekcja = (
        katalog.get_pv_inverter_type(typ)
        if przestrzen == "ZRODLO_NN_PV"
        else katalog.get_bess_inverter_type(typ)
    )
    oczekiwane = pola_karty_obecne(projekcja.to_dict())
    assert {"flicker_c", "pq_curve", "card_field_status", "pll_bandwidth_hz"} <= set(oczekiwane)
    widziane: dict[str, dict[str, Any]] = {}
    for nazwa_toru, tor in TORY.items():
        generator = tor(technologia)["generators"][-1]
        assert generator["catalog_namespace"] == przestrzen, nazwa_toru
        parametry = generator["materialized_params"]
        pola_karty = {
            k: v for k, v in parametry.items() if k in POLA_KARTY_MATERIALIZOWANE_GDY_OBECNE
        }
        assert pola_karty == oczekiwane, nazwa_toru
        widziane[nazwa_toru] = pola_karty
    assert len({repr(sorted(v.items())) for v in widziane.values()}) == 1


def test_pozycja_bez_danych_karty_nie_dostaje_kluczy_karty() -> None:
    """Druga strona predykatu: pozycja bez pól karty — zero nowych kluczy (tabliczka
    elementu bajtowo jak przed kartą)."""
    snapshot = h._siec_ze_stacja()
    wynik = h._wykonaj(snapshot, "add_converter_source", h._payload_konwerter(snapshot))
    parametry = wynik["generators"][-1]["materialized_params"]
    assert not set(parametry) & set(POLA_KARTY_MATERIALIZOWANE_GDY_OBECNE)
