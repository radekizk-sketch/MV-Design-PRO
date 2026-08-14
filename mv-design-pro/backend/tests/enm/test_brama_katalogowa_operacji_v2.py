"""Brama katalogowa operacji V2 — PEŁNY INWENTARZ referencji i tabliczek (defekt G).

Defekt (przegląd fali audytu 2026-08-01, znalezisko P12 + długi 8/9 rejestru
V12K-315): `add_converter_source` przyjmowała `materialized_params` z payloadu
i ZWRACAŁA JE WPROST, zanim materializacja katalogu zdążyła cokolwiek ustalić —
tabliczka podana przez klienta wygrywała z katalogiem, a migawka i tak
deklarowała `source_mode: KATALOG`. Po stronie API wynik bramy katalogowej był
wyrzucany (`policy_error, _ = ...`), więc brama znała prawdziwe napięcie pozycji
i milczała. Klasa defektu obejmowała też:

* atomowe `add_ct`/`add_vt`/`add_relay` (i `add_sn_bay`, `add_nn_load`, aparaty
  pól źródłowych) — sprawdzały OBECNOŚĆ referencji, nigdy jej ISTNIENIA;
* materializator magazynu energii — wyprowadzał moc pozorną z mocy rozładowania
  i gubił katalogowe 2,2 MVA (liczył 2,0), więc ta sama pozycja katalogowa
  dawała inne liczby w torze stacyjnym i atomowym.

Pilnowane własności:
(a) KLASA — inwentarz `V2_CATALOG_GATE_INVENTORY` jest kompletny (skan AST modułu:
    żadna referencja katalogowa czytana z payloadu nie omija inwentarza) i każda
    jego pozycja ma przypadek iniekcji;
(b) PARYTET KODU BŁĘDU — zła referencja daje `catalog.item_not_found` w torze
    atomowym (operacja domenowa) ORAZ 422 z tym kodem w torze payloadu (brama API);
(c) PARYTET LICZBOWY — ta sama pozycja katalogowa daje TE SAME liczby w torze
    atomowym i stacyjnym (w tym magazyn 2,2 MVA);
(d) KATALOG WYGRYWA — `materialized_params` z payloadu nie zmienia wyniku, a
    tabliczka sprzeczna z katalogiem kończy operację `catalog.nameplate_mismatch`;
(e) WYNIK BRAMY NIE JEST WYRZUCANY — to, co polityka katalogowa zmaterializowała
    przed operacją, musi zgadzać się z tym, co operacja zapisała do migawki.
"""

from __future__ import annotations

import ast
import copy
import inspect
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from api.domain_ops_policy import validate_and_materialize_catalog_binding
from api.enm import rozbieznosc_wobec_bramy
from api.main import app
from enm import domain_operations_v2
from enm.domain_operations import execute_domain_operation
from enm.domain_operations_v2 import (
    ALL_V2_HANDLERS,
    V2_CATALOG_BINDING_KEYS,
    V2_CATALOG_GATE_INVENTORY,
    V2_CATALOG_REF_PAYLOAD_KEYS,
)
from enm.dziennik_zmian import wyczysc_dziennik
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.store import reset_enm_store
from fastapi.testclient import TestClient

REF_ZRODLO = "src-gpz-15kv-250mva-rx010"
REF_KABEL = "cable-tfk-yakxs-3x120"
#: Transformator stacji 2,5 MVA — mieści magazyn 2,2 MVA (kontrola mocy toru
#: atomowego jest odrębnym ogniwem i nie może przesłonić badanego parytetu).
REF_TRAFO = "tr-sn-nn-15-04-2500kva-dyn11"
REF_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
REF_APARAT_NN = "cb_nn_630a"
REF_KABEL_NN = "kab_nn_4x120_al"
REF_CT = "ct_400_5_5p20_15va_abb"
REF_VT = "vt_15kv_100v_3p_abb"
REF_PRZEKAZNIK = "ACME_REX100_v1"
REF_ODBIOR = "load_mieszk_15kw"

#: Magazyn energii nN 2 MW / 0,4 kV: katalog deklaruje 2000 kW rozładowania
#: i 2200 kVA mocy pozornej — dokładnie ta pozycja rozjeżdżała oba tory.
REF_BESS = "conv-bess-nn-2mw-0p4kv"
BESS_PMAX_MW = 2.0
BESS_SN_MVA = 2.2
BESS_E_KWH = 4000.0

#: Falownik PV nN 0,5 MW / 0,4 kV (Sn 550 kVA) i turbina wiatrowa nN 2 MW.
REF_PV = "conv-pv-nn-0p5mw-0p4kv"
PV_PMAX_MW = 0.5
PV_SN_MVA = 0.55
REF_FW = "conv-wind-nn-2mw-0p4kv"
FW_PMAX_MW = 2.0
FW_SN_MVA = 2.2

#: Magazyn 15 kV — pozycja katalogowa, którą payload z `un_kv: 0.4` przepychał
#: dotąd na szynę 0,4 kV z `error: None` (scenariusz 1 znaleziska P12).
REF_BESS_SN = "conv-bess-0.5mw-1mwh-15kv"

#: Tor DER-SN (TR blokowy + kabel przyłączeniowy) oraz aparaty pomocnicze SN.
REF_TRAFO_BLOKOWY = "tr-sn-nn-15-04-1000kva-dyn11"
REF_KABEL_DER = "cable-base-epr-al-1c-240"
REF_KOMPENSATOR = "KOMP_SN_1V2_15KV"
REF_OGRANICZNIK = "arrester-abb-polim-d-24kv-10ka"

LITEROWKA = "-literowka-ktorej-nie-ma"


# ---------------------------------------------------------------------------
# Budowa modelu
# ---------------------------------------------------------------------------


def _pusty_enm() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name="brama_v2", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")


def _wykonaj(snapshot: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(snapshot, nazwa, payload)
    assert not wynik.get("error"), f"{nazwa}: {wynik.get('error')} ({wynik.get('error_code')})"
    return wynik["snapshot"]


def _blok_nn(**nadpisania: Any) -> dict[str, Any]:
    blok: dict[str, Any] = {"outgoing_feeders_nn_count": 1}
    blok.update(nadpisania)
    return blok


def _payload_stacji(endpoint_bus_ref: str, nn_block: dict[str, Any]) -> dict[str, Any]:
    return {
        "endpoint_bus_ref": endpoint_bus_ref,
        "station": {"name": "Stacja końcowa", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
        "sn_fields": [{"field_role": "LINIA_IN"}, {"field_role": "TRANSFORMATOROWE"}],
        "field_apparatus_catalog_ref": REF_APARAT_SN,
        "transformer": {"create": True, "transformer_catalog_ref": REF_TRAFO},
        "nn_block": nn_block,
    }


def _siec_ze_stacja(nn_block: dict[str, Any] | None = None) -> dict[str, Any]:
    """GPZ → kabel 500 m → stacja 15/0,4 kV z transformatorem 2,5 MVA."""
    snapshot = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": REF_ZRODLO},
    )
    snapshot = _wykonaj(
        snapshot,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": REF_KABEL}},
    )
    odcinek = snapshot["branches"][-1]
    return _wykonaj(
        snapshot,
        "append_station_on_endpoint",
        _payload_stacji(str(odcinek["to_bus_ref"]), nn_block or _blok_nn()),
    )


def _stacja_ref(snapshot: dict[str, Any]) -> str:
    stacje = [s for s in snapshot["substations"] if s.get("station_type") != "gpz"]
    assert len(stacje) == 1, f"Oczekiwano jednej stacji SN/nN, jest {len(stacje)}"
    return str(stacje[0]["ref_id"])


def _szyna_nn_ref(snapshot: dict[str, Any]) -> str:
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") != "gpz")
    for bus_ref in stacja.get("bus_refs") or []:
        szyna = next((b for b in snapshot["buses"] if b.get("ref_id") == bus_ref), None)
        if szyna and abs(float(szyna.get("voltage_kv") or 0.0) - 0.4) < 1e-9:
            return str(bus_ref)
    raise AssertionError("Stacja nie ma szyny nN 0,4 kV")


def _szyna_sn_ref(snapshot: dict[str, Any]) -> str:
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") != "gpz")
    for bus_ref in stacja.get("bus_refs") or []:
        szyna = next((b for b in snapshot["buses"] if b.get("ref_id") == bus_ref), None)
        if szyna and abs(float(szyna.get("voltage_kv") or 0.0) - 15.0) < 1e-9:
            return str(bus_ref)
    raise AssertionError("Stacja nie ma szyny SN 15 kV")


def _pole_sn_ref(snapshot: dict[str, Any]) -> str:
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") != "gpz")
    specyfikacje = (stacja.get("meta") or {}).get("field_specs") or []
    assert specyfikacje, "Stacja nie ma pól SN"
    return str(specyfikacje[0]["field_ref"])


def _pole_nn_ref(snapshot: dict[str, Any]) -> str:
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") != "gpz")
    specyfikacje = (stacja.get("meta") or {}).get("nn_field_specs") or []
    assert specyfikacje, "Stacja nie ma odpływów nN"
    return str(specyfikacje[0]["field_ref"])


def _payload_zrodla(
    snapshot: dict[str, Any],
    *,
    catalog_ref: str,
    technologia: str = "BESS",
    **nadpisania: Any,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "source_technology": technologia,
        "connection_variant": "nn_side",
        "station_ref": _stacja_ref(snapshot),
        "bus_nn_ref": _szyna_nn_ref(snapshot),
        "source_name": f"Źródło {technologia}",
        "catalog_ref": catalog_ref,
    }
    payload.update(nadpisania)
    return payload


def _generator(snapshot: dict[str, Any]) -> dict[str, Any]:
    generatory = snapshot["generators"]
    assert len(generatory) == 1, f"Oczekiwano jednego generatora, jest {len(generatory)}"
    return dict(generatory[0])


# ---------------------------------------------------------------------------
# Inwentarz iniekcji: JEDNA pozycja inwentarza = JEDNA referencja katalogowa
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PrzypadekIniekcji:
    """Pozycja inwentarza + sposób wstrzyknięcia w nią literówki."""

    sciezka: str
    operacja: str
    #: (migawka) → payload operacji z POPRAWNYMI referencjami.
    zbuduj: Callable[[dict[str, Any]], dict[str, Any]]
    #: payload → payload z JEDNĄ zepsutą referencją.
    zepsuj: Callable[[dict[str, Any]], None]
    #: Czy operacja wymaga wcześniejszego CT w polu (dobór zabezpieczenia).
    wymaga_ct: bool = False
    #: Kod odrzucenia W WARSTWIE DOMENOWEJ (operacja wołana wprost). Operacje
    #: wiążące katalog przez wspólny materializator zwracają kanoniczne
    #: `catalog.item_not_found`; bateria kondensatorów, ogranicznik i wiązania DER
    #: pytają katalog wprost i mają własne kody — jawnie wypisane, żeby test nie
    #: udawał parytetu, którego w tej warstwie nie ma.
    oczekiwany_kod: str = "catalog.item_not_found"


def _payload_ct(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "field_ref": _pole_sn_ref(snapshot),
        "catalog_ref": REF_CT,
        "ratio_primary_a": 400.0,
        "ratio_secondary_a": 5.0,
    }


def _payload_ct_binding(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "field_ref": _pole_sn_ref(snapshot),
        "catalog_binding": {
            "catalog_namespace": "CT",
            "catalog_item_id": REF_CT,
            "catalog_item_version": "2024.1",
        },
        "ratio_primary_a": 400.0,
        "ratio_secondary_a": 5.0,
    }


def _payload_vt(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "field_ref": _pole_sn_ref(snapshot),
        "catalog_ref": REF_VT,
        "ratio_primary_v": 15000.0,
        "ratio_secondary_v": 100.0,
    }


def _payload_vt_binding(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "field_ref": _pole_sn_ref(snapshot),
        "catalog_binding": {
            "catalog_namespace": "VT",
            "catalog_item_id": REF_VT,
            "catalog_item_version": "2024.1",
        },
        "ratio_primary_v": 15000.0,
        "ratio_secondary_v": 100.0,
    }


def _payload_relay(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "field_ref": _pole_sn_ref(snapshot),
        "catalog_ref": REF_PRZEKAZNIK,
        "relay_type": "NADPRADOWY",
    }


def _payload_relay_protection(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "field_ref": _pole_sn_ref(snapshot),
        "protection": {"catalog_item_id": REF_PRZEKAZNIK},
        "relay_type": "NADPRADOWY",
    }


def _payload_sn_bay(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "station_ref": _stacja_ref(snapshot),
        "bus_ref": _szyna_sn_ref(snapshot),
        "bay_role": "LINIA_OUT",
        "apparatus_kind": "BREAKER",
        "catalog_ref": REF_APARAT_SN,
    }


#: Katalogowe pole rodziny MODULOWEJ obslugujacej 15 kV (fikstura jest siecia
#: 15 kV) — materializacja pola stacji z katalogu rozdzielnic (etap S5).
POLE_KATALOGOWE_SN = "ZPUE_WLOSZCZOWA__ROTOBLOK__TRANSFORMER"


def _payload_sn_bay_z_katalogu(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "station_ref": _stacja_ref(snapshot),
        "bus_ref": _szyna_sn_ref(snapshot),
        "complete_bay_template_ref": POLE_KATALOGOWE_SN,
        "catalog_ref": REF_APARAT_SN,
    }


def _payload_nn_load(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "feeder_ref": _pole_nn_ref(snapshot),
        "active_power_kw": 30.0,
        "catalog_ref": REF_ODBIOR,
    }


def _payload_konwerter(snapshot: dict[str, Any]) -> dict[str, Any]:
    return _payload_zrodla(snapshot, catalog_ref=REF_BESS)


def _payload_konwerter_tabliczka(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Payload kreatora OZE ui2: tabliczka ZGODNA z katalogiem (deklaracja)."""
    return _payload_zrodla(
        snapshot,
        catalog_ref=REF_BESS,
        materialized_params={
            "catalog_item_id": REF_BESS,
            "catalog_item_version": "2024.1",
            "sn_mva": BESS_SN_MVA,
            "pmax_mw": BESS_PMAX_MW,
            "un_kv": 0.4,
            "e_kwh": BESS_E_KWH,
        },
    )


def _payload_konwerter_pole(snapshot: dict[str, Any]) -> dict[str, Any]:
    return _payload_zrodla(
        snapshot,
        catalog_ref=REF_BESS,
        placement="NEW_FIELD",
        source_field={
            "source_field_kind": "BESS",
            "field_name": "Pole magazynu nN",
            "catalog_binding": {
                "catalog_namespace": "APARAT_NN",
                "catalog_item_id": REF_APARAT_NN,
                "catalog_item_version": "2024.1",
            },
        },
    )


def _payload_konwerter_der_sn(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Tor DER-SN: szyna nN producenta → TR blokowy → kabel SN → pole SN stacji."""
    return _payload_zrodla(
        snapshot,
        catalog_ref=REF_PV,
        technologia="PV",
        connection_variant="block_transformer",
        power_setpoint_mw=0.5,
        der_topology={
            "connection_level": "sn",
            "inverter_output_voltage_kv": 0.4,
            "has_manufacturer_lv_switchgear": True,
            "lv_switchgear_variant": "multi-feeder",
            "has_block_transformer": True,
            "block_transformer": {
                "rated_power_mva": 1.0,
                "primary_voltage_kv": 15.0,
                "secondary_voltage_kv": 0.4,
                "catalog_ref": REF_TRAFO_BLOKOWY,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": REF_TRAFO_BLOKOWY,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                },
            },
            "has_dedicated_mv_field": True,
            "mv_bus_ref": _szyna_sn_ref(snapshot),
            "mv_field_configuration": {
                "switching_device": "CB",
                "ct": True,
                "vt": False,
                "earthing_switch": True,
                "surge_arrester": False,
                "protection_relay": True,
                "cable_head": True,
                "apparatus_catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": REF_APARAT_SN,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                },
                "cable_catalog_ref": REF_KABEL_DER,
                "cable_catalog_binding": {
                    "catalog_namespace": "KABEL_SN",
                    "catalog_item_id": REF_KABEL_DER,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                },
                "cable_length_km": 0.05,
            },
        },
    )


def _payload_kompensator(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "station_ref": _stacja_ref(snapshot),
        "bus_ref": _szyna_sn_ref(snapshot),
        "catalog_binding": {
            "catalog_namespace": "KOMPENSATOR_SN",
            "catalog_item_id": REF_KOMPENSATOR,
            "catalog_item_version": "2024.1",
        },
    }


def _payload_ogranicznik(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "station_ref": _stacja_ref(snapshot),
        "field_ref": _pole_sn_ref(snapshot),
        "catalog_binding": {
            "catalog_namespace": "OGRANICZNIK_SN",
            "catalog_item_id": REF_OGRANICZNIK,
            "catalog_item_version": "2024.1",
        },
    }


def _payload_kabel_nn(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "from_bus_ref": _szyna_nn_ref(snapshot),
        "length_m": 25.0,
        "catalog_ref": REF_KABEL_NN,
    }


def _payload_kabel_nn_binding(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "from_bus_ref": _szyna_nn_ref(snapshot),
        "length_m": 25.0,
        "catalog_binding": {
            "catalog_namespace": "KABEL_NN",
            "catalog_item_id": REF_KABEL_NN,
            "catalog_item_version": "2024.1",
        },
    }


def _druga_szyna_nn_ref(snapshot: dict[str, Any]) -> str:
    """Druga szyna nN dołożona przez prep `add_nn_cable_segment` (`_przygotowana_siec`)."""
    kandydaci = [
        b for b in snapshot["buses"] if (b.get("meta") or {}).get("visual_role") == "NN_CABLE_END"
    ]
    assert (
        kandydaci
    ), "Sieć testowa nie ma drugiej szyny nN (prep add_nn_cable_segment nie wykonany)"
    return str(kandydaci[-1]["ref_id"])


def _payload_aparat_nn(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "from_bus_ref": _szyna_nn_ref(snapshot),
        "to_bus_ref": _druga_szyna_nn_ref(snapshot),
        "catalog_ref": REF_APARAT_NN,
    }


def _payload_aparat_nn_binding(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "from_bus_ref": _szyna_nn_ref(snapshot),
        "to_bus_ref": _druga_szyna_nn_ref(snapshot),
        "catalog_binding": {
            "catalog_namespace": "APARAT_NN",
            "catalog_item_id": REF_APARAT_NN,
            "catalog_item_version": "2024.1",
        },
    }


def _rozdzielnica_nn_ref(snapshot: dict[str, Any]) -> str:
    """Rozdzielnica nN dołożona przez prep `add_nn_distribution_board` (`_przygotowana_siec`)."""
    stacje = [s for s in snapshot["substations"] if s.get("station_type") == "rozdzielnica_nn"]
    assert (
        stacje
    ), "Sieć testowa nie ma rozdzielnicy nN (prep add_nn_distribution_board nie wykonany)"
    return str(stacje[0]["ref_id"])


def _payload_sprzeglo_nn(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {"station_ref": _rozdzielnica_nn_ref(snapshot), "catalog_ref": REF_APARAT_NN}


def _payload_sprzeglo_nn_binding(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "station_ref": _rozdzielnica_nn_ref(snapshot),
        "catalog_binding": {
            "catalog_namespace": "APARAT_NN",
            "catalog_item_id": REF_APARAT_NN,
            "catalog_item_version": "2024.1",
        },
    }


def _payload_wiazan_der(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Aktualizacja wiązań katalogowych utworzonego już źródła (klucze na wierzchu)."""
    return {
        "generator_ref": _generator(snapshot)["ref_id"],
        "protection_catalog_ref": REF_PRZEKAZNIK,
        "ct_catalog_ref": REF_CT,
        "vt_catalog_ref": REF_VT,
    }


def _zepsuj_klucz(payload: dict[str, Any], klucz: str) -> None:
    payload[klucz] = str(payload[klucz]) + LITEROWKA


INIEKCJE: tuple[PrzypadekIniekcji, ...] = (
    PrzypadekIniekcji(
        "catalog_ref", "add_ct", _payload_ct, lambda p: _zepsuj_klucz(p, "catalog_ref")
    ),
    PrzypadekIniekcji(
        "catalog_binding",
        "add_ct",
        _payload_ct_binding,
        lambda p: p["catalog_binding"].update({"catalog_item_id": REF_CT + LITEROWKA}),
    ),
    PrzypadekIniekcji(
        "catalog_ref", "add_vt", _payload_vt, lambda p: _zepsuj_klucz(p, "catalog_ref")
    ),
    PrzypadekIniekcji(
        "catalog_binding",
        "add_vt",
        _payload_vt_binding,
        lambda p: p["catalog_binding"].update({"catalog_item_id": REF_VT + LITEROWKA}),
    ),
    PrzypadekIniekcji(
        "catalog_ref",
        "add_relay",
        _payload_relay,
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
        wymaga_ct=True,
    ),
    PrzypadekIniekcji(
        "protection.catalog_item_id",
        "add_relay",
        _payload_relay_protection,
        lambda p: p["protection"].update({"catalog_item_id": REF_PRZEKAZNIK + LITEROWKA}),
        wymaga_ct=True,
    ),
    PrzypadekIniekcji(
        "catalog_binding", "add_sn_bay", _payload_sn_bay, lambda p: _zepsuj_klucz(p, "catalog_ref")
    ),
    PrzypadekIniekcji(
        "catalog_binding",
        "add_sn_bay_from_catalog",
        _payload_sn_bay_z_katalogu,
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    PrzypadekIniekcji(
        "catalog_binding",
        "add_nn_load",
        _payload_nn_load,
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    PrzypadekIniekcji(
        "catalog_ref",
        "add_converter_source",
        _payload_konwerter,
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    PrzypadekIniekcji(
        "source_field.catalog_binding",
        "add_converter_source",
        _payload_konwerter_pole,
        lambda p: p["source_field"]["catalog_binding"].update(
            {"catalog_item_id": REF_APARAT_NN + LITEROWKA}
        ),
    ),
    PrzypadekIniekcji(
        "der_topology.block_transformer.catalog_ref",
        "add_converter_source",
        _payload_konwerter_der_sn,
        lambda p: p["der_topology"]["block_transformer"].update(
            {"catalog_ref": REF_TRAFO_BLOKOWY + LITEROWKA, "catalog_binding": None}
        ),
    ),
    PrzypadekIniekcji(
        "der_topology.mv_field_configuration.cable_catalog_ref",
        "add_converter_source",
        _payload_konwerter_der_sn,
        lambda p: p["der_topology"]["mv_field_configuration"].update(
            {"cable_catalog_ref": REF_KABEL_DER + LITEROWKA, "cable_catalog_binding": None}
        ),
    ),
    PrzypadekIniekcji(
        "der_topology.mv_field_configuration.apparatus_catalog_binding",
        "add_converter_source",
        _payload_konwerter_der_sn,
        lambda p: p["der_topology"]["mv_field_configuration"]["apparatus_catalog_binding"].update(
            {"catalog_item_id": REF_APARAT_SN + LITEROWKA}
        ),
    ),
    PrzypadekIniekcji(
        "catalog_binding",
        "add_shunt_compensator_sn",
        _payload_kompensator,
        lambda p: p["catalog_binding"].update({"catalog_item_id": REF_KOMPENSATOR + LITEROWKA}),
        oczekiwany_kod="shunt.catalog_not_found",
    ),
    PrzypadekIniekcji(
        "catalog_binding",
        "add_surge_arrester_sn",
        _payload_ogranicznik,
        lambda p: p["catalog_binding"].update({"catalog_item_id": REF_OGRANICZNIK + LITEROWKA}),
        oczekiwany_kod="spd.catalog_not_found",
    ),
    # P0.1 nN (karta P0.1, C §4.1): wiązanie katalogowe OBOWIĄZKOWE.
    PrzypadekIniekcji(
        "catalog_ref",
        "add_nn_cable_segment",
        _payload_kabel_nn,
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    PrzypadekIniekcji(
        "catalog_binding",
        "add_nn_cable_segment",
        _payload_kabel_nn_binding,
        lambda p: p["catalog_binding"].update({"catalog_item_id": REF_KABEL_NN + LITEROWKA}),
    ),
    PrzypadekIniekcji(
        "catalog_ref",
        "add_nn_switch_device",
        _payload_aparat_nn,
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    PrzypadekIniekcji(
        "catalog_binding",
        "add_nn_switch_device",
        _payload_aparat_nn_binding,
        lambda p: p["catalog_binding"].update({"catalog_item_id": REF_APARAT_NN + LITEROWKA}),
    ),
    PrzypadekIniekcji(
        "catalog_ref",
        "add_nn_section_coupler",
        _payload_sprzeglo_nn,
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    PrzypadekIniekcji(
        "catalog_binding",
        "add_nn_section_coupler",
        _payload_sprzeglo_nn_binding,
        lambda p: p["catalog_binding"].update({"catalog_item_id": REF_APARAT_NN + LITEROWKA}),
    ),
)

#: Iniekcje na modelu, w którym stoi JUŻ utworzone źródło (aktualizacja wiązań DER).
INIEKCJE_WIAZAN_DER: tuple[PrzypadekIniekcji, ...] = tuple(
    PrzypadekIniekcji(
        klucz,
        "set_der_catalog_bindings",
        _payload_wiazan_der,
        (lambda k: lambda p: p.update({k: p[k] + LITEROWKA}))(klucz),
        oczekiwany_kod="der_bindings.catalog_ref_unknown",
    )
    for klucz in ("protection_catalog_ref", "ct_catalog_ref", "vt_catalog_ref")
)

#: Pozycje inwentarza pokryte NIE iniekcją referencji, lecz osobnym dowodem —
#: każda z uzasadnieniem, żeby zbiór pozostał domknięty i policzalny.
POKRYCIE_POZA_INIEKCJAMI: dict[str, str] = {
    "add_converter_source|materialized_params": (
        "tabliczka z payloadu — nie jest REFERENCJĄ, więc dowodem jest iloczyn cech: "
        "zgodna (bez zmiany wyniku), sprzeczna liczbowo, sprzeczna napięciowo, "
        "pod obcym refem (testy `tabliczka_*`)"
    ),
    "add_genset_nn|genset_spec": (
        "pozycja NIEBRAMKOWANA — brak kategorii katalogu dla agregatu; "
        "uzasadnienie pilnowane testem `pozycje_niebramkowane_maja_uzasadnienie`"
    ),
    "add_ups_nn|ups_spec": (
        "pozycja NIEBRAMKOWANA — brak kategorii katalogu dla UPS; "
        "uzasadnienie pilnowane testem `pozycje_niebramkowane_maja_uzasadnienie`"
    ),
}


def _operacja_api(
    klient: TestClient, case_id: str, nazwa: str, payload: dict[str, Any]
) -> dict[str, Any]:
    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": nazwa, "payload": payload}},
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    tresc = odpowiedz.json()
    assert tresc.get("error") is None, tresc.get("error")
    return dict(tresc["snapshot"])


def _zasiej_siec_przez_api(klient: TestClient, case_id: str) -> dict[str, Any]:
    """Ta sama sieć co `_siec_ze_stacja`, ale zbudowana PRODUKCYJNĄ drogą zapisu.

    `PUT /enm` jest wyłączony z routera produkcyjnego, a test bramy nie może
    omijać drogi, której broni — model powstaje więc operacjami domenowymi.
    """
    _operacja_api(
        klient,
        case_id,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": REF_ZRODLO},
    )
    snapshot = _operacja_api(
        klient,
        case_id,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": REF_KABEL}},
    )
    odcinek = snapshot["branches"][-1]
    return _operacja_api(
        klient,
        case_id,
        "append_station_on_endpoint",
        _payload_stacji(str(odcinek["to_bus_ref"]), _blok_nn()),
    )


@pytest.fixture()
def klient(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    yield TestClient(app)
    reset_enm_store()
    wyczysc_dziennik()


# ---------------------------------------------------------------------------
# (a) KLASA — inwentarz kompletny i pilnowany skanem modułu
# ---------------------------------------------------------------------------


def test_kazda_pozycja_inwentarza_ma_pokrycie() -> None:
    """Asercja NA LIŚCIE: żadna pozycja inwentarza nie zostaje bez dowodu."""
    z_iniekcji = {f"{p.operacja}|{p.sciezka}" for p in (*INIEKCJE, *INIEKCJE_WIAZAN_DER)}
    z_inwentarza = {f"{p.operacja}|{p.sciezka}" for p in V2_CATALOG_GATE_INVENTORY}
    pokryte = z_iniekcji | set(POKRYCIE_POZA_INIEKCJAMI)
    assert z_inwentarza <= pokryte, (
        "Pozycje inwentarza bez pokrycia: " f"{sorted(z_inwentarza - pokryte)}"
    )
    assert pokryte <= z_inwentarza, (
        "Pokrycie odnosi się do pozycji spoza inwentarza: " f"{sorted(pokryte - z_inwentarza)}"
    )


def test_inwentarz_i_zbiory_kluczy_pochodza_z_jednego_zrodla() -> None:
    """Klucze wyprowadzone z inwentarza = zbiory używane przez skan klasy.

    Bez tego wiązania inwentarz i skan mogłyby się rozjechać w ciszy: nowa
    referencja dostałaby wiersz w inwentarzu, a skan nadal by jej nie widział
    (albo odwrotnie — skan dopuszczałby klucz, którego inwentarz nie zna).
    """
    klucze_inwentarza = {p.sciezka.split(".")[-1] for p in V2_CATALOG_GATE_INVENTORY}
    referencje = {k for k in klucze_inwentarza if k.endswith("catalog_ref")}
    wiazania = {k for k in klucze_inwentarza if "catalog_binding" in k or k == "catalog_item_id"}

    assert referencje <= V2_CATALOG_REF_PAYLOAD_KEYS, sorted(
        referencje - V2_CATALOG_REF_PAYLOAD_KEYS
    )
    assert wiazania <= V2_CATALOG_BINDING_KEYS, sorted(wiazania - V2_CATALOG_BINDING_KEYS)
    # Każda pozycja inwentarza jest albo referencją, albo wiązaniem, albo jawnie
    # nazwaną tabliczką/specyfikacją (te dwie ostatnie nie są kanałem wskazania).
    pozostale = klucze_inwentarza - referencje - wiazania
    assert pozostale == {"materialized_params", "genset_spec", "ups_spec"}, sorted(pozostale)


def test_operacje_v2_nie_czytaja_referencji_spoza_inwentarza() -> None:
    """Skan klasy: żadna referencja katalogowa modułu V2 nie omija inwentarza.

    Skanujemy DRZEWO SKŁADNIOWE wszystkich FUNKCJI `domain_operations_v2` (sam
    inwentarz jest stałą modułu i do skanu nie wchodzi — inaczej test badałby
    własny zapis zamiast kodu). Każdy literał kończący się na `catalog_ref` jest
    kluczem payloadu albo polem zapisywanym do migawki — musi należeć do zbioru
    wyprowadzonego z inwentarza. Dopisanie operacji czytającej NOWĄ referencję
    (np. ogranicznik przepięć pola nN) zapali ten test, ZANIM referencja trafi do
    modelu bez kontroli istnienia.
    """
    zrodlo = Path(inspect.getfile(domain_operations_v2)).read_text(encoding="utf-8")
    drzewo = ast.parse(zrodlo)

    referencje: set[str] = set()
    wiazania: set[str] = set()
    funkcje = [w for w in ast.walk(drzewo) if isinstance(w, ast.FunctionDef)]
    assert len(funkcje) > 50, "Skan stracił kotwicę — moduł nie ma funkcji do przejrzenia"
    for funkcja in funkcje:
        for wezel in ast.walk(funkcja):
            if not (isinstance(wezel, ast.Constant) and isinstance(wezel.value, str)):
                continue
            wartosc = wezel.value
            # Klucz payloadu nie ma spacji ani łamań wiersza — to odsiewa
            # dokumentację i komunikaty, zostawiając same nazwy pól.
            if not wartosc or any(znak.isspace() for znak in wartosc):
                continue
            if wartosc.endswith("catalog_ref"):
                referencje.add(wartosc)
            elif "catalog_binding" in wartosc or wartosc in {
                "catalog_item_id",
                "catalog_item_version",
                "catalog_namespace",
            }:
                wiazania.add(wartosc)

    poza = referencje - V2_CATALOG_REF_PAYLOAD_KEYS
    assert not poza, (
        f"Operacja V2 czyta/zapisuje referencję katalogową spoza inwentarza: {sorted(poza)}. "
        "Dopisz ją do V2_CATALOG_GATE_INVENTORY i obejmij bramą istnienia."
    )
    poza_wiazania = wiazania - V2_CATALOG_BINDING_KEYS
    assert not poza_wiazania, (
        "Operacja V2 czyta wiązanie katalogowe spoza dopuszczonego zbioru: "
        f"{sorted(poza_wiazania)}."
    )
    # Kontrola żywotności skanu: zbiory nie mogą być martwą literą.
    assert "catalog_ref" in referencje
    assert "catalog_binding" in wiazania


def test_kazdy_handler_v2_z_referencja_katalogowa_ma_werdykt() -> None:
    """Handler czytający referencję katalogową MUSI mieć wiersz w inwentarzu.

    Iloczyn cech, nie przykład: skanujemy CIAŁA wszystkich handlerów V2, nie samą
    operację z karty. Handler, który zacznie czytać katalog bez wpisu inwentarza,
    zapali ten test — dokładnie ten mechanizm, którego zabrakło, gdy `add_ct`,
    `add_nn_load` i aparaty pól zostały poza bramą.
    """
    zrodlo = Path(inspect.getfile(domain_operations_v2)).read_text(encoding="utf-8")
    drzewo = ast.parse(zrodlo)
    z_inwentarza = {p.operacja for p in V2_CATALOG_GATE_INVENTORY}

    nazwy_handlerow = set(ALL_V2_HANDLERS)
    znalezione: set[str] = set()
    czytajace_katalog: set[str] = set()
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.FunctionDef) or wezel.name not in nazwy_handlerow:
            continue
        znalezione.add(wezel.name)
        for potomek in ast.walk(wezel):
            if not (isinstance(potomek, ast.Constant) and isinstance(potomek.value, str)):
                continue
            if potomek.value.endswith("catalog_ref") or "catalog_binding" in potomek.value:
                czytajace_katalog.add(wezel.name)
                break

    assert znalezione == nazwy_handlerow, (
        "Skan stracił kotwicę — handlery bez definicji w module: "
        f"{sorted(nazwy_handlerow - znalezione)}"
    )
    bez_werdyktu = czytajace_katalog - z_inwentarza
    assert (
        not bez_werdyktu
    ), f"Handler V2 czyta katalog bez wiersza w inwentarzu: {sorted(bez_werdyktu)}"


def test_pozycje_niebramkowane_maja_uzasadnienie_merytoryczne() -> None:
    """Miejsce świadomie zostawione poza bramą wymaga uzasadnienia, nie milczenia."""
    for pozycja in V2_CATALOG_GATE_INVENTORY:
        if pozycja.bramkowana:
            continue
        assert len(pozycja.uzasadnienie) > 60, (
            f"{pozycja.operacja}|{pozycja.sciezka}: pozycja niebramkowana bez "
            "uzasadnienia merytorycznego"
        )
        assert not pozycja.przestrzen, (
            f"{pozycja.operacja}|{pozycja.sciezka}: pozycja niebramkowana nie może "
            "deklarować przestrzeni katalogu (skoro nie ma pozycji do sprawdzenia)"
        )


# ---------------------------------------------------------------------------
# (b) PARYTET KODU BŁĘDU — literówka odrzucona w OBU torach
# ---------------------------------------------------------------------------


PRZYPADKI = [
    pytest.param(p, id=f"{p.operacja}|{p.sciezka}") for p in (*INIEKCJE, *INIEKCJE_WIAZAN_DER)
]


def _przygotowana_siec(przypadek: PrzypadekIniekcji) -> dict[str, Any]:
    """Sieć ze stacją; dla zabezpieczenia — CT w polu, dla wiązań DER — źródło.

    P0.1 nN: `add_nn_switch_device` potrzebuje DRUGIEJ szyny nN (dokładamy
    odcinek kabla — jego szyna docelowa ma znacznik `NN_CABLE_END`, czytany
    przez `_druga_szyna_nn_ref`); `add_nn_section_coupler` potrzebuje
    rozdzielnicy nN (`station_type="rozdzielnica_nn"`).
    """
    snapshot = _siec_ze_stacja()
    if przypadek.wymaga_ct:
        snapshot = _wykonaj(snapshot, "add_ct", _payload_ct(snapshot))
    if przypadek.operacja == "set_der_catalog_bindings":
        snapshot = _wykonaj(snapshot, "add_converter_source", _payload_konwerter(snapshot))
    if przypadek.operacja == "add_nn_switch_device":
        snapshot = _wykonaj(
            snapshot,
            "add_nn_cable_segment",
            {
                "from_bus_ref": _szyna_nn_ref(snapshot),
                "length_m": 20.0,
                "catalog_ref": REF_KABEL_NN,
            },
        )
    if przypadek.operacja == "add_nn_section_coupler":
        snapshot = _wykonaj(
            snapshot, "add_nn_distribution_board", {"voltage_kv": 0.4, "name": "RGnN testowa"}
        )
    return snapshot


@pytest.mark.parametrize("przypadek", PRZYPADKI)
def test_literowka_odrzucona_w_torze_domenowym(przypadek: PrzypadekIniekcji) -> None:
    """Operacja atomowa wołana wprost: odrzucenie kodem pozycji, migawka pusta."""
    snapshot = _przygotowana_siec(przypadek)
    payload = przypadek.zbuduj(snapshot)
    przypadek.zepsuj(payload)

    wynik = execute_domain_operation(copy.deepcopy(snapshot), przypadek.operacja, payload)

    assert wynik.get("error"), f"{przypadek.sciezka}: operacja przyjęła nieistniejącą pozycję"
    assert wynik.get("error_code") == przypadek.oczekiwany_kod, wynik.get("error")
    assert wynik.get("snapshot") is None
    if przypadek.oczekiwany_kod == "catalog.item_not_found":
        # Wspólny materializator dokłada AKCJĘ NAPRAWCZĄ, nie samo „nie ma".
        assert "Wskaż pozycję istniejącą w katalogu" in str(wynik.get("error"))


@pytest.mark.parametrize("przypadek", PRZYPADKI)
def test_literowka_odrzucona_w_torze_payloadu(
    klient: TestClient, przypadek: PrzypadekIniekcji
) -> None:
    """Produkcyjna droga zapisu: 422 `catalog.item_not_found`, model bez zmian.

    KANON PO KARCIE U1 (dług 1 z V12K-316). Do czasu tej karty brama API znała
    tylko „główne" wiązanie operacji, więc część pozycji inwentarza
    (`source_field.catalog_binding`, cały tor DER-SN, kompensator, ogranicznik,
    wiązania DER) zatrzymywała dopiero warstwa domenowa — projektant dostawał
    `HTTP 200` z kodem błędu w treści zamiast 422, czyli INNY kontrakt dla tej
    samej pomyłki. Teraz brama zna KAŻDĄ referencję z inwentarza, więc forma
    odrzucenia jest jedna: 422 z kanonicznym `catalog.item_not_found`.
    Kod właściwy operacji (`shunt.catalog_not_found`, `spd.catalog_not_found`,
    `der_bindings.catalog_ref_unknown`) zostaje kodem WARSTWY DOMENOWEJ i jest
    pilnowany osobnym testem wyżej.
    """
    case_id = f"v2-brama-{abs(hash((przypadek.operacja, przypadek.sciezka)))}"
    snapshot = _zasiej_siec_przez_api(klient, case_id)
    if przypadek.wymaga_ct:
        snapshot = _operacja_api(klient, case_id, "add_ct", _payload_ct(snapshot))
    if przypadek.operacja == "set_der_catalog_bindings":
        snapshot = _operacja_api(
            klient, case_id, "add_converter_source", _payload_konwerter(snapshot)
        )
    if przypadek.operacja == "add_nn_switch_device":
        snapshot = _operacja_api(
            klient,
            case_id,
            "add_nn_cable_segment",
            {
                "from_bus_ref": _szyna_nn_ref(snapshot),
                "length_m": 20.0,
                "catalog_ref": REF_KABEL_NN,
            },
        )
    if przypadek.operacja == "add_nn_section_coupler":
        snapshot = _operacja_api(
            klient,
            case_id,
            "add_nn_distribution_board",
            {"voltage_kv": 0.4, "name": "RGnN testowa"},
        )
    payload = przypadek.zbuduj(snapshot)
    przypadek.zepsuj(payload)

    hash_przed = klient.get(f"/api/cases/{case_id}/enm").json()["header"]["hash_sha256"]

    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": przypadek.operacja, "payload": payload}},
    )

    assert odpowiedz.status_code == 422, odpowiedz.text
    szczegol = odpowiedz.json()["detail"]
    assert szczegol["code"] == "catalog.item_not_found", szczegol
    assert klient.get(f"/api/cases/{case_id}/enm").json()["header"]["hash_sha256"] == hash_przed


@pytest.mark.parametrize("przypadek", PRZYPADKI)
def test_komplet_poprawnych_referencji_przechodzi_oba_tory(przypadek: PrzypadekIniekcji) -> None:
    """Kontrola bramy: poprawna referencja przechodzi bramę API i operację."""
    snapshot = _przygotowana_siec(przypadek)
    payload = przypadek.zbuduj(snapshot)

    blad, _ = validate_and_materialize_catalog_binding(przypadek.operacja, payload)
    assert blad is None, blad

    wynik = execute_domain_operation(copy.deepcopy(snapshot), przypadek.operacja, payload)
    assert not wynik.get("error"), f"{wynik.get('error')} ({wynik.get('error_code')})"


# ---------------------------------------------------------------------------
# (c) PARYTET LICZBOWY — ta sama pozycja, te same liczby w obu torach
# ---------------------------------------------------------------------------


WARIANTY_ZRODLA: tuple[tuple[str, str, str, float, float], ...] = (
    ("BESS", REF_BESS, "BESS_INVERTER", BESS_PMAX_MW, BESS_SN_MVA),
    ("PV", REF_PV, "PV_INVERTER", PV_PMAX_MW, PV_SN_MVA),
    ("FW", REF_FW, "FW_INVERTER", FW_PMAX_MW, FW_SN_MVA),
)


@pytest.mark.parametrize(
    ("technologia", "ref_katalogu", "konfiguracja", "pmax_mw", "sn_mva"), WARIANTY_ZRODLA
)
def test_tor_atomowy_i_stacyjny_daja_te_same_liczby(
    technologia: str,
    ref_katalogu: str,
    konfiguracja: str,
    pmax_mw: float,
    sn_mva: float,
) -> None:
    """Ta sama pozycja katalogowa = ta sama tabliczka w obu torach.

    Magazyn `conv-bess-nn-2mw-0p4kv` liczył w torze atomowym 2,0 MVA (moc pozorna
    wyprowadzana z mocy rozładowania), a w stacyjnym 2,2 MVA (`s_n_kva` pozycji) —
    jedna pozycja katalogu, dwie różne liczby w modelu.
    """
    stacyjnie = _siec_ze_stacja(
        _blok_nn(
            nn_configuration=konfiguracja,
            source_converter_catalog_ref=ref_katalogu,
            source_converter_kind=technologia,
        )
    )
    generator_stacyjny = _generator(stacyjnie)

    atomowo = _wykonaj(
        _siec_ze_stacja(),
        "add_converter_source",
        _payload_zrodla(_siec_ze_stacja(), catalog_ref=ref_katalogu, technologia=technologia),
    )
    generator_atomowy = _generator(atomowo)

    assert generator_atomowy["p_mw"] == pytest.approx(pmax_mw)
    assert generator_stacyjny["p_mw"] == pytest.approx(pmax_mw)
    for gen in (generator_atomowy, generator_stacyjny):
        tabliczka = gen["materialized_params"]
        assert tabliczka["catalog_item_id"] == ref_katalogu
        assert tabliczka["un_kv"] == pytest.approx(0.4)
        assert tabliczka["pmax_mw"] == pytest.approx(pmax_mw)
        assert tabliczka["sn_mva"] == pytest.approx(sn_mva)
        assert gen["source_mode"] == "KATALOG"


def test_magazyn_energii_bierze_moc_pozorna_z_katalogu() -> None:
    """Dług 8 rejestru V12K-315 wprost: 2,2 MVA z `s_n_kva`, nie 2,0 z rozładowania."""
    snapshot = _siec_ze_stacja()
    wynik = _wykonaj(
        snapshot,
        "add_converter_source",
        _payload_zrodla(snapshot, catalog_ref=REF_BESS),
    )
    tabliczka = _generator(wynik)["materialized_params"]

    assert tabliczka["discharge_power_kw"] == pytest.approx(2000.0)
    assert tabliczka["sn_mva"] == pytest.approx(2.2)
    assert tabliczka["sn_mva"] != pytest.approx(tabliczka["discharge_power_kw"] / 1000.0)
    assert tabliczka["e_kwh"] == pytest.approx(BESS_E_KWH)


# ---------------------------------------------------------------------------
# (d) KATALOG WYGRYWA — tabliczka z payloadu nie zmienia wyniku
# ---------------------------------------------------------------------------


def test_tabliczka_zgodna_z_katalogiem_nie_zmienia_wyniku() -> None:
    """Payload kreatora OZE (tabliczka = kopia rekordu) daje TEN SAM model."""
    bez_tabliczki = _wykonaj(
        _siec_ze_stacja(),
        "add_converter_source",
        _payload_konwerter(_siec_ze_stacja()),
    )
    z_tabliczka = _wykonaj(
        _siec_ze_stacja(),
        "add_converter_source",
        _payload_konwerter_tabliczka(_siec_ze_stacja()),
    )

    assert _generator(bez_tabliczki)["materialized_params"] == (
        _generator(z_tabliczka)["materialized_params"]
    )
    assert _generator(bez_tabliczki)["p_mw"] == _generator(z_tabliczka)["p_mw"]


def test_tabliczka_z_zawyzona_moca_jest_odrzucana() -> None:
    """Scenariusz 2 znaleziska P12: 4× moc katalogowa pod prawdziwym refem.

    Przed naprawą `p_mw` generatora brało się z payloadu i wchodziło WPROST do
    bilansu rozpływu pod referencją znacznie mniejszej pozycji katalogowej.
    """
    snapshot = _siec_ze_stacja()
    payload = _payload_zrodla(
        snapshot,
        catalog_ref=REF_BESS,
        materialized_params={
            "catalog_item_id": REF_BESS,
            "un_kv": 0.4,
            "pmax_mw": 8.0,
            "sn_mva": 8.8,
            "e_kwh": 99999.0,
        },
    )

    wynik = execute_domain_operation(copy.deepcopy(snapshot), "add_converter_source", payload)

    assert wynik.get("error_code") == "catalog.nameplate_mismatch", wynik.get("error")
    assert wynik.get("snapshot") is None
    assert "pmax_mw" in str(wynik.get("error"))


def test_tabliczka_nie_obchodzi_kontroli_zgodnosci_napiec() -> None:
    """Scenariusz 1 znaleziska P12: magazyn 15 kV na szynie 0,4 kV.

    BEZ tabliczki operacja odrzucała ten ref (`converter.voltage_mismatch`).
    Z tabliczką deklarującą `un_kv: 0.4` kończyła się `error: None` — kontrola
    zgodności napięć przestawała istnieć, bo liczyła się na danej z payloadu.
    """
    snapshot = _siec_ze_stacja()

    bez_tabliczki = execute_domain_operation(
        copy.deepcopy(snapshot),
        "add_converter_source",
        _payload_zrodla(snapshot, catalog_ref=REF_BESS_SN),
    )
    assert bez_tabliczki.get("error_code") == "converter.voltage_mismatch"

    z_tabliczka = execute_domain_operation(
        copy.deepcopy(snapshot),
        "add_converter_source",
        _payload_zrodla(
            snapshot,
            catalog_ref=REF_BESS_SN,
            materialized_params={
                "catalog_item_id": REF_BESS_SN,
                "un_kv": 0.4,
                "pmax_mw": 0.5,
                "sn_mva": 0.55,
                "e_kwh": 1000.0,
            },
        ),
    )
    assert z_tabliczka.get("error"), "Tabliczka z payloadu obeszła kontrolę napięć"
    assert z_tabliczka.get("error_code") == "catalog.nameplate_mismatch", z_tabliczka.get("error")
    assert z_tabliczka.get("snapshot") is None


def test_tabliczka_pod_obcym_refem_jest_odrzucana() -> None:
    """`materialized_params.catalog_item_id` sprzeczny z `catalog_ref` = błąd."""
    snapshot = _siec_ze_stacja()
    payload = _payload_zrodla(
        snapshot,
        catalog_ref=REF_BESS,
        materialized_params={"catalog_item_id": REF_BESS_SN, "un_kv": 0.4},
    )

    wynik = execute_domain_operation(copy.deepcopy(snapshot), "add_converter_source", payload)

    assert wynik.get("error_code") == "catalog.nameplate_mismatch", wynik.get("error")


def test_przekladnia_ct_pochodzi_z_katalogu_a_nie_z_formularza() -> None:
    """CT deklarujący `source_mode: KATALOG` nie może nieść przekładni z formularza."""
    snapshot = _siec_ze_stacja()
    payload = _payload_ct(snapshot)
    payload["ratio_primary_a"] = 300.0

    wynik = execute_domain_operation(copy.deepcopy(snapshot), "add_ct", payload)

    assert wynik.get("error_code") == "catalog.nameplate_mismatch", wynik.get("error")
    assert wynik.get("snapshot") is None

    poprawny = _wykonaj(copy.deepcopy(snapshot), "add_ct", _payload_ct(snapshot))
    pomiar = next(m for m in poprawny["measurements"] if m["measurement_type"] == "CT")
    assert pomiar["materialized_params"]["ratio_primary_a"] == pytest.approx(400.0)
    # Klasa dokładności pochodzi z rekordu katalogu, choć formularz jej nie podał.
    assert pomiar["materialized_params"]["accuracy_class"] == "5P20"


def test_zabezpieczenie_niesie_tozsamosc_z_katalogu() -> None:
    """`source_mode: KATALOG` bez ani jednej wartości z katalogu było deklaracją bez pokrycia."""
    snapshot = _siec_ze_stacja()
    z_ct = _wykonaj(copy.deepcopy(snapshot), "add_ct", _payload_ct(snapshot))
    wynik = _wykonaj(z_ct, "add_relay", _payload_relay(z_ct))

    przypisanie = wynik["protection_assignments"][0]
    assert przypisanie["source_mode"] == "KATALOG"
    assert przypisanie["materialized_params"]["vendor"] == "ABB"
    assert przypisanie["materialized_params"]["catalog_item_id"] == REF_PRZEKAZNIK


def test_aparat_pola_sn_z_toru_atomowego_ma_tabliczke_z_katalogu() -> None:
    """`add_sn_bay` — parytet z torem stacyjnym: aparat ma materializację."""
    snapshot = _siec_ze_stacja()
    wynik = _wykonaj(copy.deepcopy(snapshot), "add_sn_bay", _payload_sn_bay(snapshot))

    aparaty = [
        b
        for b in wynik["branches"]
        if b.get("catalog_ref") == REF_APARAT_SN and "gpz_field_device" in (b.get("tags") or [])
    ]
    assert aparaty, "add_sn_bay nie utworzyła aparatu pola"
    tabliczka = aparaty[-1]["materialized_params"]
    assert tabliczka is not None, "Aparat deklaruje katalog bez materializacji"
    assert tabliczka["catalog_item_id"] == REF_APARAT_SN
    assert tabliczka["i_n_a"] == pytest.approx(630.0)


# ---------------------------------------------------------------------------
# (e) WYNIK BRAMY NIE JEST WYRZUCANY
# ---------------------------------------------------------------------------


def test_brama_api_porownuje_swoja_materializacje_z_modelem() -> None:
    """Rozjazd bramy i modelu = 422, nie cichy zapis.

    Kontrola jest OSTATNIM ogniwem: gdyby kiedykolwiek brama i operacja czytały
    katalog inaczej (dwa niezależne odczyty, które „dziś się zgadzają"), model
    dostałby liczbę, której brama nie zna. Iniekcja: podmieniamy tabliczkę
    w migawce po operacji — dokładnie to, czego kontrola ma nie przepuścić.
    """
    snapshot = _siec_ze_stacja()
    payload = _payload_konwerter(snapshot)
    wynik = execute_domain_operation(copy.deepcopy(snapshot), "add_converter_source", payload)
    assert not wynik.get("error"), wynik.get("error")

    _, pola_bramy = validate_and_materialize_catalog_binding("add_converter_source", payload)
    assert pola_bramy, "Brama nie zmaterializowała pozycji — kontrola byłaby pusta"
    wiazanie = {"catalog_item_id": REF_BESS}
    utworzone = wynik["changes"]["created_element_ids"]

    assert rozbieznosc_wobec_bramy(pola_bramy, wiazanie, wynik["snapshot"], utworzone) is None

    skazona = copy.deepcopy(wynik["snapshot"])
    skazona["generators"][0]["materialized_params"]["un_kv"] = 15.0
    rozbieznosc = rozbieznosc_wobec_bramy(pola_bramy, wiazanie, skazona, utworzone)
    assert rozbieznosc is not None
    assert rozbieznosc["code"] == "catalog.gate_result_mismatch"
    assert "un_kv" in rozbieznosc["message_pl"]

    # ZAKRES: ten sam skażony element POZA listą zmian tej operacji nie może
    # blokować zapisu — kontrola pilnuje bieżącego zapisu, nie długu rewizji.
    assert rozbieznosc_wobec_bramy(pola_bramy, wiazanie, skazona, []) is None


def test_koncowka_domain_ops_odrzuca_rozjazd_bramy_i_modelu(
    klient: TestClient, monkeypatch
) -> None:
    """WIĄZANIE kontroli z końcówką: samo istnienie funkcji nic nie daje.

    Poprzedni test bada FUNKCJĘ; ten bada, czy końcówka `POST /enm/domain-ops`
    naprawdę ją woła i czy odrzucenie jest bezskutkowe. Bez tego usunięcie
    wywołania z końcówki (dokładnie ten defekt: wynik bramy wyrzucany) przeszłoby
    na zielono.

    Rozjazd dwóch odczytów katalogu nie da się dziś wywołać danymi — oba czytają
    ten sam katalog. Symulujemy więc ODCZYT BRAMY zwracający inne napięcie, czyli
    stan, przed którym kontrola ma bronić; reszta drogi (operacja, zapis, migawka)
    jest prawdziwa.
    """
    case_id = "v2-brama-rozjazd"
    snapshot = _zasiej_siec_przez_api(klient, case_id)
    hash_przed = klient.get(f"/api/cases/{case_id}/enm").json()["header"]["hash_sha256"]

    import api.enm as api_enm

    prawdziwa = api_enm.validate_and_materialize_catalog_binding

    def brama_z_innym_napieciem(operacja: str, payload: dict[str, Any]):
        blad, pola = prawdziwa(operacja, payload)
        if operacja == "add_converter_source" and pola:
            pola = {**pola, "un_kv": 15.0}
        return blad, pola

    monkeypatch.setattr(
        api_enm, "validate_and_materialize_catalog_binding", brama_z_innym_napieciem
    )

    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_converter_source",
                "payload": _payload_konwerter(snapshot),
            }
        },
    )

    assert odpowiedz.status_code == 422, odpowiedz.text
    szczegol = odpowiedz.json()["detail"]
    assert szczegol["code"] == "catalog.gate_result_mismatch", szczegol
    assert "un_kv" in szczegol["message_pl"]
    # Odrzucenie BEZ SKUTKU: model nie drgnął.
    po = klient.get(f"/api/cases/{case_id}/enm").json()
    assert po["header"]["hash_sha256"] == hash_przed
    assert po["generators"] == []


def test_produkcyjna_droga_zapisu_utrwala_tabliczke_katalogowa(klient: TestClient) -> None:
    """`POST /enm/domain-ops` — jedyna produkcyjna droga zapisu — zapisuje katalog."""
    case_id = "v2-brama-produkcyjna"
    snapshot = _zasiej_siec_przez_api(klient, case_id)

    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_converter_source",
                "payload": _payload_konwerter_tabliczka(snapshot),
            }
        },
    )

    assert odpowiedz.status_code == 200, odpowiedz.text
    assert odpowiedz.json().get("error") is None
    migawka = klient.get(f"/api/cases/{case_id}/enm").json()
    generator = _generator(migawka)
    assert generator["p_mw"] == pytest.approx(BESS_PMAX_MW)
    assert generator["materialized_params"]["sn_mva"] == pytest.approx(BESS_SN_MVA)
    assert generator["source_mode"] == "KATALOG"
