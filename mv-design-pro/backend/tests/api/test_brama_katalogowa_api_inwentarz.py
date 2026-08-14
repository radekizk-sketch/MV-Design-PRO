"""Brama katalogowa API — PEŁNY INWENTARZ referencji operacji (dług 1 z V12K-316).

DŁUG, KTÓRY TO ZAMYKA. Brama `validate_and_materialize_catalog_binding` znała
WYŁĄCZNIE „główne" wiązanie operacji, bo `extract_catalog_binding` zwraca JEDNO.
Pozostałe referencje tej samej operacji odrzucała dopiero warstwa domenowa,
meldując `HTTP 200` z kodem błędu w treści zamiast 422 — czyli dla TEJ SAMEJ
literówki projektant dostawał inny kontrakt odpowiedzi w zależności od tego,
KTÓRĄ referencję pomylił. Poza bramą były:

* `add_converter_source.source_field.catalog_binding` (aparat pola źródłowego nN,
  przestrzeń APARAT_NN) — pozycja nazwana w rejestrze;
* cały tor DER-SN: TR blokowy, kabel SN przyłączeniowy, aparat pola źródłowego SN;
* `add_shunt_compensator_sn` i `add_surge_arrester_sn` — operacje spoza
  `CATALOG_REQUIRED_OPERATIONS`, więc brama kończyła na nich pracę natychmiast;
* `set_der_catalog_bindings` — trzy wiązania wytwórcy (zabezpieczenie, CT, VT);
* `add_grid_source_sn`: transformator WN/SN GPZ, aparat pól liniowych GPZ
  (dług 7 rejestru V12K-315 — czytany, nigdy nieweryfikowany) i przełącznik
  zaczepów (nieistniejąca pozycja była CICHO ignorowana, więc żądana regulacja
  znikała bez śladu);
* przełącznik zaczepów transformatora stacji i transformatora wolnostojącego.

Pilnowane własności:
(a) PARYTET KODU — literówka w KAŻDEJ bramkowanej pozycji inwentarza daje
    `catalog.item_not_found` (ten sam kod, ten sam kształt odpowiedzi,
    niezależnie od operacji i przestrzeni katalogu);
(b) PARYTET KONTRAKTU HTTP — produkcyjna droga zapisu (`POST
    /api/cases/{id}/enm/domain-ops`) kończy takie żądanie kodem 422, a nie
    `HTTP 200` z kodem w treści, i nie zmienia modelu;
(c) KLASA — inwentarz API obejmuje W CAŁOŚCI inwentarze warstwy domenowej
    (`V2_CATALOG_GATE_INVENTORY`, `STATION_CATALOG_REF_INVENTORY`), skan obu
    modułów operacji nie znajduje klucza katalogowego spoza zbiorów
    wyprowadzonych z inwentarza, a każda pozycja bramkowana ma iniekcję;
(d) UCZCIWOŚĆ — pozycja świadomie niebramkowana ma uzasadnienie MERYTORYCZNE
    i nie deklaruje przestrzeni katalogu.
"""

from __future__ import annotations

import ast
import copy
import inspect
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from api.domain_ops_policy import (
    API_CATALOG_BINDING_KEYS,
    API_CATALOG_GATE_INVENTORY,
    API_CATALOG_REF_PAYLOAD_KEYS,
    CATALOG_REQUIRED_OPERATIONS,
    STATION_CATALOG_REF_INVENTORY,
    validate_and_materialize_catalog_binding,
)
from api.main import app
from enm import domain_operations, domain_operations_v2
from enm.domain_operations import execute_domain_operation
from enm.domain_operations_v2 import V2_CATALOG_GATE_INVENTORY
from enm.dziennik_zmian import wyczysc_dziennik
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient

# Pozycje katalogowe RZECZYWISTE (test bramy nie może opierać się na wymyślonych
# referencjach — dokładnie taki błąd wrósł w testy przy defekcie G).
REF_ZRODLO = "src-gpz-15kv-250mva-rx010"
REF_KABEL = "cable-tfk-yakxs-3x120"
REF_LINIA = "line-base-al-150"
REF_TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
REF_TRAFO_WN_SN = "tr-wn-sn-110-15-25mva-yd11"
REF_TRAFO_BLOKOWY = "tr-sn-nn-15-04-1000kva-dyn11"
REF_KABEL_DER = "cable-base-epr-al-1c-240"
REF_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
REF_APARAT_NN = "cb_nn_630a"
REF_KABEL_NN = "kab_nn_4x120_al"
REF_CT = "ct_400_5_5p20_15va_abb"
REF_VT = "vt_15kv_100v_3p_abb"
REF_PRZEKAZNIK = "ACME_REX100_v1"
REF_ODBIOR = "load_mieszk_15kw"
REF_KOMPENSATOR = "KOMP_SN_1V2_15KV"
REF_OGRANICZNIK = "arrester-abb-polim-d-24kv-10ka"
REF_FALOWNIK_PV = "conv-pv-nn-0p5mw-0p4kv"
REF_ZKSN = "ZKSN-2P-630A"
REF_SLUP_ODG = "SLUP-ODG-12"
REF_ZACZEPY = "tc_oltc_110sn_19_125"
#: Punkt pośredni SN ma WŁASNY katalog (poza `CatalogNamespace`) — kreator podaje
#: jego nazwę jawnie w `catalog_namespace`, bo brama nie zgaduje kategorii.
PRZESTRZEN_PUNKTU_POSREDNIEGO = "mv_branch_points"

LITEROWKA = "-literowka-ktorej-nie-ma"

OPERACJE_STACYJNE = ("insert_station_on_segment_sn", "append_station_on_endpoint")


def _wiazanie(przestrzen: str, ref: str) -> dict[str, Any]:
    return {
        "catalog_namespace": przestrzen,
        "catalog_item_id": ref,
        "catalog_item_version": "2024.1",
        "materialize": True,
    }


# ---------------------------------------------------------------------------
# Iniekcje na poziomie bramy — po jednej dla KAŻDEJ pozycji bramkowanej
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IniekcjaBramy:
    """Pozycja inwentarza + payload z poprawnym refem + sposób jego popsucia."""

    operacja: str
    sciezka: str
    zbuduj: Callable[[], dict[str, Any]]
    zepsuj: Callable[[dict[str, Any]], None]


def _zepsuj_klucz(payload: dict[str, Any], *sciezka: Any) -> None:
    """Doklej literówkę do wartości pod wskazaną ścieżką (ostatni człon = klucz/indeks)."""
    kontener: Any = payload
    for czlon in sciezka[:-1]:
        kontener = kontener[czlon]
    kontener[sciezka[-1]] = str(kontener[sciezka[-1]]) + LITEROWKA


def _zepsuj_wiazanie(payload: dict[str, Any], *sciezka: Any) -> None:
    """Doklej literówkę do `catalog_item_id` wiązania pod wskazaną ścieżką."""
    kontener: Any = payload
    for czlon in sciezka:
        kontener = kontener[czlon]
    kontener = kontener["catalog_binding"] if "catalog_binding" in kontener else kontener
    kontener["catalog_item_id"] = str(kontener["catalog_item_id"]) + LITEROWKA


def _payload_zrodla(**nadpisania: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "voltage_kv": 15.0,
        "sk3_mva": 250.0,
        "catalog_ref": REF_ZRODLO,
    }
    payload.update(nadpisania)
    return payload


def _payload_odcinka(rodzaj: str, ref: str, przestrzen: str) -> dict[str, Any]:
    return {
        "segment": {
            "rodzaj": rodzaj,
            "dlugosc_m": 500.0,
            "catalog_ref": ref,
            "catalog_binding": _wiazanie(przestrzen, ref),
        }
    }


def _payload_pola_sn() -> dict[str, Any]:
    return {
        "field_role": "LINIA_OUT",
        "apparatus_catalog_ref": REF_APARAT_SN,
        "equipment": {
            "ct": {
                "catalog_ref": REF_CT,
                "ratio_primary_a": 400.0,
                "ratio_secondary_a": 5.0,
            },
            "vt": {"catalog_ref": REF_VT},
            "relay": {"catalog_ref": REF_PRZEKAZNIK},
        },
    }


def _payload_stacji() -> dict[str, Any]:
    return {
        "segment_id": "seg-1",
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {"name_pl": "ST", "station_type": "STACJA_SN_NN", "sn_voltage_kv": 15.0},
        "transformer": {
            "transformer_catalog_ref": REF_TRAFO,
            "transformer_regulation_type": "OLTC",
            "transformer_tap_changer_catalog_ref": REF_ZACZEPY,
        },
        "field_apparatus_catalog_ref": REF_APARAT_SN,
        "sn_fields": [_payload_pola_sn()],
        "nn_block": {
            "nn_configuration": "PV_INVERTER",
            "source_converter_catalog_ref": REF_FALOWNIK_PV,
            "source_protection": {"device_catalog_ref": REF_PRZEKAZNIK},
        },
    }


def _payload_konwertera_der_sn() -> dict[str, Any]:
    return {
        "station_ref": "st-1",
        "source_technology": "PV",
        "connection_variant": "block_transformer",
        "catalog_ref": REF_FALOWNIK_PV,
        "source_field": {"catalog_binding": _wiazanie("APARAT_NN", REF_APARAT_NN)},
        "der_topology": {
            "connection_level": "sn",
            "has_block_transformer": True,
            "block_transformer": {
                "catalog_ref": REF_TRAFO_BLOKOWY,
                "catalog_binding": _wiazanie("TRAFO_SN_NN", REF_TRAFO_BLOKOWY),
            },
            "mv_field_configuration": {
                "switching_device": "CB",
                "apparatus_catalog_binding": _wiazanie("APARAT_SN", REF_APARAT_SN),
                "cable_catalog_ref": REF_KABEL_DER,
                "cable_catalog_binding": _wiazanie("KABEL_SN", REF_KABEL_DER),
                "cable_length_km": 0.05,
            },
        },
    }


def _iniekcje_odcinka(operacja: str) -> tuple[IniekcjaBramy, ...]:
    """Odcinek SN — obie drogi wskazania pozycji i OBA rodzaje odcinka.

    Iloczyn cech: kabel (KABEL_SN) × linia napowietrzna (LINIA_SN) × referencja
    jawna × wiązanie. Przestrzeń odcinka wynika z jego RODZAJU, więc pomyłka
    w rodzaju byłaby widoczna tylko przy obu wariantach naraz.
    """
    return (
        IniekcjaBramy(
            operacja,
            "segment.catalog_ref",
            lambda: _payload_odcinka("KABEL", REF_KABEL, "KABEL_SN"),
            lambda p: _zepsuj_klucz(p, "segment", "catalog_ref"),
        ),
        IniekcjaBramy(
            operacja,
            "segment.catalog_binding",
            lambda: _payload_odcinka("LINIA_NAPOWIETRZNA", REF_LINIA, "LINIA_SN"),
            lambda p: _zepsuj_wiazanie(p, "segment"),
        ),
    )


def _iniekcje_stacji(operacja: str) -> tuple[IniekcjaBramy, ...]:
    """Iniekcje wspólne obu operacjom stacyjnym.

    `transformer.catalog_ref` jest POZA tym zestawem, bo czyta go wyłącznie
    `append_station_on_endpoint` — brama jest lustrem tej różnicy, a nie fikcją
    parytetu (patrz komentarz przy inwentarzu).
    """
    return (
        IniekcjaBramy(
            operacja,
            "transformer.transformer_catalog_ref",
            _payload_stacji,
            lambda p: _zepsuj_klucz(p, "transformer", "transformer_catalog_ref"),
        ),
        IniekcjaBramy(
            operacja,
            "transformer.transformer_tap_changer_catalog_ref",
            _payload_stacji,
            lambda p: _zepsuj_klucz(p, "transformer", "transformer_tap_changer_catalog_ref"),
        ),
        IniekcjaBramy(
            operacja,
            "sn_fields[].apparatus_catalog_ref",
            _payload_stacji,
            lambda p: _zepsuj_klucz(p, "sn_fields", 0, "apparatus_catalog_ref"),  # type: ignore[arg-type]
        ),
        IniekcjaBramy(
            operacja,
            "field_apparatus_catalog_ref",
            lambda: {**_payload_stacji(), "sn_fields": []},
            lambda p: _zepsuj_klucz(p, "field_apparatus_catalog_ref"),
        ),
        IniekcjaBramy(
            operacja,
            "sn_fields[].equipment.ct",
            _payload_stacji,
            lambda p: _zepsuj_klucz(p, "sn_fields", 0, "equipment", "ct", "catalog_ref"),  # type: ignore[arg-type]
        ),
        IniekcjaBramy(
            operacja,
            "sn_fields[].equipment.vt",
            _payload_stacji,
            lambda p: _zepsuj_klucz(p, "sn_fields", 0, "equipment", "vt", "catalog_ref"),  # type: ignore[arg-type]
        ),
        IniekcjaBramy(
            operacja,
            "sn_fields[].equipment.relay",
            _payload_stacji,
            lambda p: _zepsuj_klucz(p, "sn_fields", 0, "equipment", "relay", "catalog_ref"),  # type: ignore[arg-type]
        ),
        IniekcjaBramy(
            operacja,
            "nn_block.source_converter_catalog_ref",
            _payload_stacji,
            lambda p: _zepsuj_klucz(p, "nn_block", "source_converter_catalog_ref"),
        ),
        IniekcjaBramy(
            operacja,
            "nn_block.source_protection.device_catalog_ref",
            _payload_stacji,
            lambda p: _zepsuj_klucz(p, "nn_block", "source_protection", "device_catalog_ref"),
        ),
    )


INIEKCJE: tuple[IniekcjaBramy, ...] = (
    # --- Źródło systemowe GPZ ----------------------------------------------
    IniekcjaBramy(
        "add_grid_source_sn",
        "catalog_ref",
        _payload_zrodla,
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "add_grid_source_sn",
        "catalog_binding",
        lambda: _payload_zrodla(catalog_binding=_wiazanie("ZRODLO_SN", REF_ZRODLO)),
        lambda p: _zepsuj_wiazanie(p),
    ),
    IniekcjaBramy(
        "add_grid_source_sn",
        "transformer_catalog_ref",
        lambda: _payload_zrodla(transformer_catalog_ref=REF_TRAFO_WN_SN),
        lambda p: _zepsuj_klucz(p, "transformer_catalog_ref"),
    ),
    IniekcjaBramy(
        "add_grid_source_sn",
        "transformer_catalog_binding",
        lambda: _payload_zrodla(
            transformer_catalog_binding=_wiazanie("TRAFO_SN_NN", REF_TRAFO_WN_SN)
        ),
        lambda p: p["transformer_catalog_binding"].update(
            {"catalog_item_id": REF_TRAFO_WN_SN + LITEROWKA}
        ),
    ),
    IniekcjaBramy(
        "add_grid_source_sn",
        "transformer_tap_changer_catalog_ref",
        lambda: _payload_zrodla(
            transformer_regulation_type="OLTC",
            transformer_tap_changer_catalog_ref=REF_ZACZEPY,
        ),
        lambda p: _zepsuj_klucz(p, "transformer_tap_changer_catalog_ref"),
    ),
    IniekcjaBramy(
        "add_grid_source_sn",
        "gpz_line_field_apparatus.catalog_binding",
        lambda: _payload_zrodla(
            gpz_line_field_apparatus={
                "apparatus_kind": "BREAKER",
                "catalog_binding": _wiazanie("APARAT_SN", REF_APARAT_SN),
            }
        ),
        lambda p: _zepsuj_wiazanie(p, "gpz_line_field_apparatus"),
    ),
    IniekcjaBramy(
        "add_grid_source_sn",
        "gpz_line_field_apparatus.catalog_ref",
        lambda: _payload_zrodla(
            gpz_line_field_apparatus={
                "apparatus_kind": "BREAKER",
                "catalog_ref": REF_APARAT_SN,
            }
        ),
        lambda p: _zepsuj_klucz(p, "gpz_line_field_apparatus", "catalog_ref"),
    ),
    # --- Odcinki ciągu SN ---------------------------------------------------
    *_iniekcje_odcinka("continue_trunk_segment_sn"),
    *_iniekcje_odcinka("start_branch_segment_sn"),
    *_iniekcje_odcinka("connect_secondary_ring_sn"),
    # --- Punkty pośrednie i łącznik sekcyjny SN -----------------------------
    IniekcjaBramy(
        "insert_branch_pole_on_segment_sn",
        "catalog_ref",
        lambda: {
            "segment_id": "seg-1",
            "catalog_ref": REF_SLUP_ODG,
            "catalog_namespace": PRZESTRZEN_PUNKTU_POSREDNIEGO,
        },
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "insert_zksn_on_segment_sn",
        "catalog_ref",
        lambda: {
            "segment_id": "seg-1",
            "catalog_ref": REF_ZKSN,
            "catalog_namespace": PRZESTRZEN_PUNKTU_POSREDNIEGO,
        },
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "insert_section_switch_sn",
        "catalog_ref",
        lambda: {"bus_ref": "bus-1", "catalog_ref": REF_APARAT_SN},
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "insert_section_switch_sn",
        "catalog_binding",
        lambda: {"bus_ref": "bus-1", "catalog_binding": _wiazanie("APARAT_SN", REF_APARAT_SN)},
        lambda p: _zepsuj_wiazanie(p),
    ),
    # --- Transformator SN/nN wolnostojący ------------------------------------
    IniekcjaBramy(
        "add_transformer_sn_nn",
        "transformer_catalog_ref",
        lambda: {"bus_sn_ref": "bus-1", "transformer_catalog_ref": REF_TRAFO},
        lambda p: _zepsuj_klucz(p, "transformer_catalog_ref"),
    ),
    IniekcjaBramy(
        "add_transformer_sn_nn",
        "catalog_ref",
        lambda: {"bus_sn_ref": "bus-1", "catalog_ref": REF_TRAFO},
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "add_transformer_sn_nn",
        "transformer_tap_changer_catalog_ref",
        lambda: {
            "bus_sn_ref": "bus-1",
            "transformer_catalog_ref": REF_TRAFO,
            "transformer_regulation_type": "OLTC",
            "transformer_tap_changer_catalog_ref": REF_ZACZEPY,
        },
        lambda p: _zepsuj_klucz(p, "transformer_tap_changer_catalog_ref"),
    ),
    # --- Operacje stacyjne ---------------------------------------------------
    *_iniekcje_stacji("insert_station_on_segment_sn"),
    *_iniekcje_stacji("append_station_on_endpoint"),
    IniekcjaBramy(
        "append_station_on_endpoint",
        "transformer.catalog_ref",
        lambda: {**_payload_stacji(), "transformer": {"catalog_ref": REF_TRAFO}},
        lambda p: _zepsuj_klucz(p, "transformer", "catalog_ref"),
    ),
    # --- Wyposażenie pól i odbiory ------------------------------------------
    IniekcjaBramy(
        "add_ct",
        "catalog_ref",
        lambda: {"field_ref": "f-1", "catalog_ref": REF_CT},
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "add_ct",
        "catalog_binding",
        lambda: {"field_ref": "f-1", "catalog_binding": _wiazanie("CT", REF_CT)},
        lambda p: _zepsuj_wiazanie(p),
    ),
    IniekcjaBramy(
        "add_vt",
        "catalog_ref",
        lambda: {"field_ref": "f-1", "catalog_ref": REF_VT},
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "add_vt",
        "catalog_binding",
        lambda: {"field_ref": "f-1", "catalog_binding": _wiazanie("VT", REF_VT)},
        lambda p: _zepsuj_wiazanie(p),
    ),
    IniekcjaBramy(
        "add_relay",
        "catalog_ref",
        lambda: {"field_ref": "f-1", "catalog_ref": REF_PRZEKAZNIK},
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "add_relay",
        "protection.catalog_item_id",
        lambda: {"field_ref": "f-1", "protection": {"catalog_item_id": REF_PRZEKAZNIK}},
        lambda p: _zepsuj_klucz(p, "protection", "catalog_item_id"),
    ),
    IniekcjaBramy(
        "add_sn_bay",
        "catalog_binding",
        lambda: {"bus_ref": "bus-1", "catalog_binding": _wiazanie("APARAT_SN", REF_APARAT_SN)},
        lambda p: _zepsuj_wiazanie(p),
    ),
    IniekcjaBramy(
        "add_nn_load",
        "catalog_binding",
        lambda: {"feeder_ref": "nn-1", "catalog_binding": _wiazanie("OBCIAZENIE", REF_ODBIOR)},
        lambda p: _zepsuj_wiazanie(p),
    ),
    # `add_nn_outgoing_field` NIE MA tu iniekcji — karta NAPRAWA-B, znalezisko #2:
    # usunięta z `API_CATALOG_GATE_INVENTORY` (operacja nie czyta `catalog_ref`
    # w żadnej gałęzi; dawna pozycja bramkowała referencję, której materializacja
    # nigdzie nie trafiała). Parytet pinuje
    # `test_add_nn_outgoing_field_bez_catalog_ref_przechodzi_brame` niżej.
    # --- Źródło przekształtnikowe: tor nN i tor DER-SN -----------------------
    IniekcjaBramy(
        "add_converter_source",
        "catalog_ref",
        lambda: {
            "station_ref": "st-1",
            "bus_nn_ref": "nn-bus-1",
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "catalog_ref": REF_FALOWNIK_PV,
        },
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "add_converter_source",
        "source_field.catalog_binding",
        _payload_konwertera_der_sn,
        lambda p: _zepsuj_wiazanie(p, "source_field"),
    ),
    IniekcjaBramy(
        "add_converter_source",
        "der_topology.block_transformer.catalog_ref",
        _payload_konwertera_der_sn,
        lambda p: _zepsuj_klucz(p, "der_topology", "block_transformer", "catalog_ref"),
    ),
    IniekcjaBramy(
        "add_converter_source",
        "der_topology.block_transformer.catalog_binding",
        lambda: {
            **_payload_konwertera_der_sn(),
            "der_topology": {
                **_payload_konwertera_der_sn()["der_topology"],
                "block_transformer": {
                    "catalog_binding": _wiazanie("TRAFO_SN_NN", REF_TRAFO_BLOKOWY)
                },
            },
        },
        lambda p: _zepsuj_wiazanie(p, "der_topology", "block_transformer"),
    ),
    IniekcjaBramy(
        "add_converter_source",
        "der_topology.mv_field_configuration.cable_catalog_ref",
        _payload_konwertera_der_sn,
        lambda p: _zepsuj_klucz(p, "der_topology", "mv_field_configuration", "cable_catalog_ref"),
    ),
    IniekcjaBramy(
        "add_converter_source",
        "der_topology.mv_field_configuration.cable_catalog_binding",
        lambda: {
            **_payload_konwertera_der_sn(),
            "der_topology": {
                **_payload_konwertera_der_sn()["der_topology"],
                "mv_field_configuration": {
                    **_payload_konwertera_der_sn()["der_topology"]["mv_field_configuration"],
                    "cable_catalog_ref": None,
                },
            },
        },
        lambda p: p["der_topology"]["mv_field_configuration"]["cable_catalog_binding"].update(
            {"catalog_item_id": REF_KABEL_DER + LITEROWKA}
        ),
    ),
    IniekcjaBramy(
        "add_converter_source",
        "der_topology.mv_field_configuration.apparatus_catalog_binding",
        _payload_konwertera_der_sn,
        lambda p: p["der_topology"]["mv_field_configuration"]["apparatus_catalog_binding"].update(
            {"catalog_item_id": REF_APARAT_SN + LITEROWKA}
        ),
    ),
    # --- Kompensacja, ograniczniki, wiązania DER ----------------------------
    IniekcjaBramy(
        "add_shunt_compensator_sn",
        "catalog_binding",
        lambda: {
            "bus_ref": "bus-1",
            "catalog_binding": _wiazanie("KOMPENSATOR_SN", REF_KOMPENSATOR),
        },
        lambda p: _zepsuj_wiazanie(p),
    ),
    IniekcjaBramy(
        "add_surge_arrester_sn",
        "catalog_binding",
        lambda: {
            "field_ref": "f-1",
            "catalog_binding": _wiazanie("OGRANICZNIK_SN", REF_OGRANICZNIK),
        },
        lambda p: _zepsuj_wiazanie(p),
    ),
    IniekcjaBramy(
        "set_der_catalog_bindings",
        "protection_catalog_ref",
        lambda: {"generator_ref": "gen-1", "protection_catalog_ref": REF_PRZEKAZNIK},
        lambda p: _zepsuj_klucz(p, "protection_catalog_ref"),
    ),
    IniekcjaBramy(
        "set_der_catalog_bindings",
        "ct_catalog_ref",
        lambda: {"generator_ref": "gen-1", "ct_catalog_ref": REF_CT},
        lambda p: _zepsuj_klucz(p, "ct_catalog_ref"),
    ),
    IniekcjaBramy(
        "set_der_catalog_bindings",
        "vt_catalog_ref",
        lambda: {"generator_ref": "gen-1", "vt_catalog_ref": REF_VT},
        lambda p: _zepsuj_klucz(p, "vt_catalog_ref"),
    ),
    # --- P0.1 nN — topologia obwodów nN (karta P0.1, C §4.1) -----------------
    IniekcjaBramy(
        "add_nn_cable_segment",
        "catalog_ref",
        lambda: {"from_bus_ref": "bus-nn-1", "length_m": 20.0, "catalog_ref": REF_KABEL_NN},
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "add_nn_cable_segment",
        "catalog_binding",
        lambda: {
            "from_bus_ref": "bus-nn-1",
            "length_m": 20.0,
            "catalog_binding": _wiazanie("KABEL_NN", REF_KABEL_NN),
        },
        lambda p: _zepsuj_wiazanie(p),
    ),
    IniekcjaBramy(
        "add_nn_switch_device",
        "catalog_ref",
        lambda: {
            "from_bus_ref": "bus-nn-1",
            "to_bus_ref": "bus-nn-2",
            "catalog_ref": REF_APARAT_NN,
        },
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "add_nn_switch_device",
        "catalog_binding",
        lambda: {
            "from_bus_ref": "bus-nn-1",
            "to_bus_ref": "bus-nn-2",
            "catalog_binding": _wiazanie("APARAT_NN", REF_APARAT_NN),
        },
        lambda p: _zepsuj_wiazanie(p),
    ),
    IniekcjaBramy(
        "add_nn_section_coupler",
        "catalog_ref",
        lambda: {"station_ref": "st-nn-1", "catalog_ref": REF_APARAT_NN},
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
    IniekcjaBramy(
        "add_nn_section_coupler",
        "catalog_binding",
        lambda: {
            "station_ref": "st-nn-1",
            "catalog_binding": _wiazanie("APARAT_NN", REF_APARAT_NN),
        },
        lambda p: _zepsuj_wiazanie(p),
    ),
)

PRZYPADKI = [pytest.param(i, id=f"{i.operacja}|{i.sciezka}") for i in INIEKCJE]


# ---------------------------------------------------------------------------
# (a) PARYTET KODU — literówka w KAŻDEJ bramkowanej pozycji inwentarza
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("iniekcja", PRZYPADKI)
def test_literowka_w_kazdej_pozycji_daje_ten_sam_kod(iniekcja: IniekcjaBramy) -> None:
    """Zła referencja = `catalog.item_not_found`, niezależnie od operacji i przestrzeni.

    Brama jest BEZSTANOWA (kontrakt `(operacja, payload)`), więc iniekcja nie
    potrzebuje modelu — sprawdzamy DOKŁADNIE ten predykat, który stoi przed
    operacją domenową na produkcyjnej drodze zapisu.
    """
    poprawny = iniekcja.zbuduj()
    bez_bledu, _ = validate_and_materialize_catalog_binding(iniekcja.operacja, poprawny)
    assert bez_bledu is None, f"{iniekcja.sciezka}: poprawny payload odrzucony ({bez_bledu})"

    zepsuty = copy.deepcopy(poprawny)
    iniekcja.zepsuj(zepsuty)
    assert zepsuty != poprawny, f"{iniekcja.sciezka}: iniekcja nie zmieniła payloadu"

    blad, pola = validate_and_materialize_catalog_binding(iniekcja.operacja, zepsuty)

    assert blad is not None, f"{iniekcja.sciezka}: brama przyjęła nieistniejącą pozycję"
    assert blad.code == "catalog.item_not_found", blad
    assert blad.errors and blad.errors[0]["code"] == "catalog.item_not_found", blad
    assert pola == {}


# ---------------------------------------------------------------------------
# (b) PARYTET KONTRAKTU HTTP — produkcyjna droga zapisu kończy się 422
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IniekcjaHttp:
    """Iniekcja przeprowadzona PRODUKCYJNĄ drogą zapisu (`POST .../domain-ops`)."""

    operacja: str
    sciezka: str
    #: (migawka) → payload operacji z POPRAWNYMI referencjami.
    zbuduj: Callable[[dict[str, Any]], dict[str, Any]]
    zepsuj: Callable[[dict[str, Any]], None]
    #: Czy przypadek wymaga wcześniej zbudowanego ciągu SN (GPZ + odcinek).
    wymaga_ciagu: bool = True


def _pusty_enm() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name="brama_api", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")


@pytest.fixture()
def klient(tmp_path, monkeypatch) -> TestClient:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    yield TestClient(app)
    reset_enm_store()
    wyczysc_dziennik()


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


#: Iniekcje NOWO bramkowanych pozycji, przeprowadzone produkcyjną drogą zapisu.
#: Pozostałe pozycje inwentarza mają dowód HTTP w `tests/enm/
#: test_brama_katalogowa_operacji_v2.py` i `tests/api/
#: test_brama_katalogowa_stacji_inwentarz.py` — tu badamy to, czego tamte pliki
#: nie znały, bo brama tych referencji nie czytała.
INIEKCJE_HTTP: tuple[IniekcjaHttp, ...] = (
    IniekcjaHttp(
        "add_grid_source_sn",
        "transformer_catalog_ref",
        lambda _s: _payload_zrodla(transformer_catalog_ref=REF_TRAFO_WN_SN),
        lambda p: _zepsuj_klucz(p, "transformer_catalog_ref"),
        wymaga_ciagu=False,
    ),
    IniekcjaHttp(
        "add_grid_source_sn",
        "transformer_tap_changer_catalog_ref",
        lambda _s: _payload_zrodla(
            transformer_regulation_type="OLTC",
            transformer_tap_changer_catalog_ref=REF_ZACZEPY,
        ),
        lambda p: _zepsuj_klucz(p, "transformer_tap_changer_catalog_ref"),
        wymaga_ciagu=False,
    ),
    IniekcjaHttp(
        "add_grid_source_sn",
        "gpz_line_field_apparatus.catalog_binding",
        lambda _s: _payload_zrodla(
            gpz_line_field_apparatus={
                "apparatus_kind": "BREAKER",
                "catalog_binding": _wiazanie("APARAT_SN", REF_APARAT_SN),
            }
        ),
        lambda p: _zepsuj_wiazanie(p, "gpz_line_field_apparatus"),
        wymaga_ciagu=False,
    ),
    IniekcjaHttp(
        "append_station_on_endpoint",
        "transformer.transformer_tap_changer_catalog_ref",
        lambda snapshot: {
            "endpoint_bus_ref": str(snapshot["branches"][-1]["to_bus_ref"]),
            "station": {"name_pl": "ST", "station_type": "STACJA_SN_NN"},
            "transformer": {
                "transformer_catalog_ref": REF_TRAFO,
                "transformer_regulation_type": "OLTC",
                "transformer_tap_changer_catalog_ref": REF_ZACZEPY,
            },
            "field_apparatus_catalog_ref": REF_APARAT_SN,
            "sn_fields": [],
        },
        lambda p: _zepsuj_klucz(p, "transformer", "transformer_tap_changer_catalog_ref"),
    ),
    IniekcjaHttp(
        "insert_zksn_on_segment_sn",
        "catalog_ref",
        lambda snapshot: {
            "segment_id": str(snapshot["branches"][-1]["ref_id"]),
            "catalog_ref": REF_ZKSN,
            "catalog_namespace": PRZESTRZEN_PUNKTU_POSREDNIEGO,
            "insert_at": {"mode": "RATIO", "value": 0.5},
        },
        lambda p: _zepsuj_klucz(p, "catalog_ref"),
    ),
)


@pytest.mark.parametrize(
    "iniekcja", [pytest.param(i, id=f"{i.operacja}|{i.sciezka}") for i in INIEKCJE_HTTP]
)
def test_produkcyjna_droga_zapisu_konczy_zle_referencje_kodem_422(
    klient: TestClient, iniekcja: IniekcjaHttp
) -> None:
    """422 `catalog.item_not_found`, model bez zmian — nie `HTTP 200` z kodem w treści."""
    case_id = f"brama-api-{abs(hash((iniekcja.operacja, iniekcja.sciezka)))}"
    snapshot: dict[str, Any] = {}
    if iniekcja.wymaga_ciagu:
        snapshot = _operacja_api(
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
    else:
        klient.get(f"/api/cases/{case_id}/enm")

    payload = iniekcja.zbuduj(snapshot)
    iniekcja.zepsuj(payload)
    hash_przed = klient.get(f"/api/cases/{case_id}/enm").json()["header"]["hash_sha256"]

    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": iniekcja.operacja, "payload": payload}},
    )

    assert odpowiedz.status_code == 422, odpowiedz.text
    szczegol = odpowiedz.json()["detail"]
    assert szczegol["code"] == "catalog.item_not_found", szczegol
    assert klient.get(f"/api/cases/{case_id}/enm").json()["header"]["hash_sha256"] == hash_przed


# ---------------------------------------------------------------------------
# (c) KLASA — inwentarz kompletny, zbiory z jednego źródła, skan modułów
# ---------------------------------------------------------------------------


def _pozycje_bramkowane() -> set[str]:
    return {f"{p.operacja}|{p.sciezka}" for p in API_CATALOG_GATE_INVENTORY if p.bramkowana}


def test_kazda_pozycja_bramkowana_ma_iniekcje() -> None:
    """Asercja NA LIŚCIE: żadna bramkowana pozycja inwentarza nie zostaje bez dowodu."""
    z_iniekcji = {f"{i.operacja}|{i.sciezka}" for i in INIEKCJE}
    z_inwentarza = _pozycje_bramkowane()
    assert z_inwentarza - z_iniekcji == set(), (
        "Pozycje inwentarza bez iniekcji: " f"{sorted(z_inwentarza - z_iniekcji)}"
    )
    assert z_iniekcji - z_inwentarza == set(), (
        "Iniekcje odnoszą się do pozycji spoza inwentarza: " f"{sorted(z_iniekcji - z_inwentarza)}"
    )


def test_inwentarz_api_obejmuje_inwentarz_operacji_v2() -> None:
    """Brama API zna KAŻDĄ pozycję, którą zna warstwa domenowa V2.

    Bez tego wiązania nowa pozycja `V2_CATALOG_GATE_INVENTORY` (karta G) wróciłaby
    do stanu sprzed tej karty: warstwa domenowa by ją znała, brama nie — i literówka
    znów kończyłaby się `HTTP 200` z kodem w treści.
    """
    z_v2 = {f"{p.operacja}|{p.sciezka}" for p in V2_CATALOG_GATE_INVENTORY}
    z_api = {f"{p.operacja}|{p.sciezka}" for p in API_CATALOG_GATE_INVENTORY}
    assert z_v2 <= z_api, f"Pozycje V2 nieznane bramie API: {sorted(z_v2 - z_api)}"


def test_inwentarz_api_obejmuje_inwentarz_operacji_stacyjnych() -> None:
    """To samo dla inwentarza stacyjnego (karta F).

    Porównanie idzie po ŚCIEŻKACH, nie po parach (operacja, ścieżka), bo inwentarz
    stacyjny jest wspólny dla obu operacji, a jedna z jego pozycji
    (`transformer.catalog_ref`) jest czytana tylko przez
    `append_station_on_endpoint` — brama jest lustrem operacji, a nie deklaracją
    parytetu, którego w warstwie domenowej nie ma.
    """
    sciezki_api = {p.sciezka for p in API_CATALOG_GATE_INVENTORY if p.operacja in OPERACJE_STACYJNE}
    oczekiwane = {sciezka for sciezka, _ in STATION_CATALOG_REF_INVENTORY}
    assert (
        oczekiwane <= sciezki_api
    ), f"Pozycje stacyjne nieznane bramie API: {sorted(oczekiwane - sciezki_api)}"


def test_zbiory_kluczy_pochodza_z_inwentarza() -> None:
    """Klucze wyprowadzone z inwentarza = zbiory używane przez skan klasy.

    Predykat wejścia (inwentarz) i predykat wyjścia (zbiory kluczy) muszą mieć
    JEDNO źródło — dwa niezależne zapisy „dziś zgodne" są defektem czekającym na
    pierwszą nową referencję.
    """
    klucze = {p.sciezka.split(".")[-1] for p in API_CATALOG_GATE_INVENTORY}
    referencje = {k for k in klucze if k.endswith("catalog_ref")}
    wiazania = {k for k in klucze if "catalog_binding" in k or k == "catalog_item_id"}

    assert referencje <= API_CATALOG_REF_PAYLOAD_KEYS, sorted(
        referencje - API_CATALOG_REF_PAYLOAD_KEYS
    )
    assert wiazania <= API_CATALOG_BINDING_KEYS, sorted(wiazania - API_CATALOG_BINDING_KEYS)
    # Reszta to pozycje nazwane wprost (wyposażenie pola, tabliczki, specyfikacje) —
    # zbiór ZAMKNIĘTY, żeby nowa nazwa nie przeszła niezauważona.
    pozostale = klucze - referencje - wiazania
    assert pozostale == {
        "ct",
        "vt",
        "relay",
        "materialized_params",
        "genset_spec",
        "ups_spec",
    }, sorted(pozostale)


def test_skan_obu_modulow_nie_znajduje_klucza_spoza_inwentarza() -> None:
    """Skan klasy: żaden klucz katalogowy operacji domenowych nie omija inwentarza API.

    Skanujemy DRZEWA SKŁADNIOWE obu modułów operacji (V1 i V2). Każdy literał
    kończący się na `catalog_ref` jest kluczem payloadu albo polem zapisywanym do
    migawki; każdy literał o kształcie wiązania jest DRUGĄ drogą wskazania pozycji.
    Operacja, która zacznie czytać NOWĄ referencję, zapali ten test, zanim
    referencja trafi do modelu bez kontroli po stronie API.
    """
    referencje: set[str] = set()
    wiazania: set[str] = set()
    liczba_funkcji = 0
    for modul in (domain_operations, domain_operations_v2):
        zrodlo = Path(inspect.getfile(modul)).read_text(encoding="utf-8")
        drzewo = ast.parse(zrodlo)
        funkcje = [w for w in ast.walk(drzewo) if isinstance(w, ast.FunctionDef)]
        liczba_funkcji += len(funkcje)
        for funkcja in funkcje:
            for wezel in ast.walk(funkcja):
                if not (isinstance(wezel, ast.Constant) and isinstance(wezel.value, str)):
                    continue
                wartosc = wezel.value
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

    assert liczba_funkcji > 100, "Skan stracił kotwicę — moduły bez funkcji do przejrzenia"
    poza = referencje - API_CATALOG_REF_PAYLOAD_KEYS
    assert not poza, (
        f"Operacja domenowa czyta/zapisuje referencję katalogową spoza inwentarza API: "
        f"{sorted(poza)}. Dopisz ją do API_CATALOG_GATE_INVENTORY i obejmij bramą."
    )
    poza_wiazania = wiazania - API_CATALOG_BINDING_KEYS
    assert (
        not poza_wiazania
    ), f"Operacja domenowa czyta wiązanie spoza dopuszczonego zbioru: {sorted(poza_wiazania)}."
    # Kontrola żywotności skanu: zbiory nie mogą być martwą literą.
    assert "transformer_tap_changer_catalog_ref" in referencje
    assert "apparatus_catalog_binding" in wiazania


def test_pozycje_niebramkowane_maja_uzasadnienie_merytoryczne() -> None:
    """Miejsce świadomie zostawione poza bramą wymaga uzasadnienia, nie milczenia."""
    niebramkowane = [p for p in API_CATALOG_GATE_INVENTORY if not p.bramkowana]
    assert niebramkowane, "Inwentarz bez ani jednej pozycji niebramkowanej jest podejrzany"
    for pozycja in niebramkowane:
        assert len(pozycja.uzasadnienie) > 60, (
            f"{pozycja.operacja}|{pozycja.sciezka}: pozycja niebramkowana bez "
            "uzasadnienia merytorycznego"
        )
        assert not pozycja.przestrzen, (
            f"{pozycja.operacja}|{pozycja.sciezka}: pozycja niebramkowana nie może "
            "deklarować przestrzeni katalogu (skoro nie ma pozycji do sprawdzenia)"
        )


def test_predykat_wiazan_der_jest_ten_sam_co_w_warstwie_domenowej() -> None:
    """Brama i operacja rozstrzygają zabezpieczenie wytwórcy TĄ SAMĄ funkcją.

    Zabezpieczenia żyją w DWÓCH zbiorach: repozytorium katalogu MV (12 wpisów)
    i katalog analityczny producentów (kilkadziesiąt), a picker wystawia ten drugi.
    Brama pytająca samej materializacji odrzucałaby urządzenia, które projektant
    widzi na liście — dlatego pyta predykatem operacji domenowej. Ten test pilnuje,
    żeby oba tory nie rozjechały się w ciszy.
    """
    from application.analyses.protection.catalog.catalog_store import list_devices

    tylko_analityczne = [
        urzadzenie.device_id
        for urzadzenie in list_devices()
        if not urzadzenie.device_id.startswith("ACME_")
    ]
    assert tylko_analityczne, "Katalog analityczny zabezpieczeń jest pusty — skan bez kotwicy"

    ref = tylko_analityczne[0]
    payload = {"generator_ref": "gen-1", "protection_catalog_ref": ref}

    blad, _ = validate_and_materialize_catalog_binding("set_der_catalog_bindings", payload)
    assert (
        blad is None
    ), f"Brama odrzuciła urządzenie '{ref}' widoczne w pickerze — rozjazd predykatów: {blad}"

    wynik = execute_domain_operation(_pusty_enm(), "set_der_catalog_bindings", payload)
    # Operacja odrzuca z powodu BRAKU wytwórcy w modelu, nie z powodu katalogu —
    # to dowód, że predykat katalogowy przepuścił tę samą referencję.
    assert wynik.get("error_code") == "der_bindings.generator_not_found", wynik


# ---------------------------------------------------------------------------
# Karta NAPRAWA-B, znalezisko #2 — rozjazd kontraktu catalog_ref
# `add_nn_outgoing_field`. Pomiar: operacja domenowa nie czyta
# `catalog_ref`/`catalog_binding` z payloadu w ŻADNEJ gałęzi (FEEDER ani
# SOURCE) — usunięta z `CATALOG_REQUIRED_OPERATIONS` i z
# `API_CATALOG_GATE_INVENTORY`. Testy niżej pinują naprawę I pilnują, żeby
# WHOLE rejestr (`CATALOG_REQUIRED_OPERATIONS` × frontendowy odpowiednik
# `catalogFirstRules.ts`) nie rozjechał się po cichu w przyszłości.
# ---------------------------------------------------------------------------


def test_add_nn_outgoing_field_poza_wymaganymi_operacjami_katalogowymi() -> None:
    """Pin rejestru: operacja, która nie konsumuje catalog_ref, nie może go wymagać."""
    assert "add_nn_outgoing_field" not in CATALOG_REQUIRED_OPERATIONS


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(
            {
                "station_ref": "st-1",
                "bus_nn_ref": "nn-bus-1",
                "field_role": "FEEDER",
                "field_name": "Odpływ nN",
            },
            id="FEEDER",
        ),
        pytest.param(
            {
                "station_ref": "st-1",
                "bus_nn_ref": "nn-bus-1",
                "field_role": "SOURCE",
                "source_field_kind": "PV",
                "field_name": "Pole przyłączeniowe nN",
            },
            id="SOURCE",
        ),
    ],
)
def test_add_nn_outgoing_field_bez_catalog_ref_przechodzi_brame(payload: dict[str, Any]) -> None:
    """Dokładny payload PRODUKCYJNEGO kreatora (`KreatorPolaNn.tsx`) — bez `catalog_ref`,
    bo formularz świadomie go nie pokazuje. Przed naprawą: `422 catalog.ref_required`
    na KAŻDE żądanie (dla obu ról, FEEDER i SOURCE). Iloczyn cech: rola pola ×
    obecność/brak `catalog_ref` — nie tylko przykład z karty.
    """
    blad, pola = validate_and_materialize_catalog_binding("add_nn_outgoing_field", payload)
    assert blad is None, f"Kreator 'Pole odpływowe nN' zostałby odrzucony bramą: {blad}"
    assert pola == {}

    # Payload z JAWNIE podanym (niepoprawnym) catalog_ref też przechodzi bramę —
    # operacja go i tak nie czyta, więc bramkowanie byłoby fikcją kontroli.
    z_bledna_referencja = {**payload, "catalog_ref": "nie-istnieje-w-katalogu"}
    blad2, _ = validate_and_materialize_catalog_binding(
        "add_nn_outgoing_field", z_bledna_referencja
    )
    assert blad2 is None, f"Nieużywana referencja nie powinna nic bramkować: {blad2}"


def _frontend_catalog_first_operations() -> set[str]:
    """Operacje wymagające katalogu wg FRONTENDOWEGO odpowiednika bramy
    (`frontend/src/ui/network-build/forms/catalogFirstRules.ts`) — czytane
    WPROST z `case`'ów `switch` w `validateCatalogFirst` (predykat REALNIE
    wykonywany przy zapisie), nie z komentarzy ani z klucza słownika komunikatów.
    """
    plik = (
        Path(__file__).resolve().parents[3]
        / "frontend"
        / "src"
        / "ui"
        / "network-build"
        / "forms"
        / "catalogFirstRules.ts"
    )
    assert plik.is_file(), f"catalogFirstRules.ts nie znaleziony pod {plik}"
    tresc = plik.read_text(encoding="utf-8")
    dopasowanie = re.search(r"export function validateCatalogFirst\b.*?\n\}\n", tresc, re.DOTALL)
    assert dopasowanie, "Nie znaleziono funkcji validateCatalogFirst w catalogFirstRules.ts"
    return set(re.findall(r"case '([a-zA-Z_]+)':", dopasowanie.group(0)))


#: Operacje, dla których `CATALOG_REQUIRED_OPERATIONS` (backend) wymaga katalogu,
#: ale `catalogFirstRules.ts` (frontend) go NIE wymaga — lista ZAMKNIĘTA i JAWNA,
#: każda pozycja z osobnym pomiarem (nowa pozycja wymaga TEGO SAMEGO pomiaru, nie
#: ciszy):
#:
#: * `add_nn_load` — NAPRAWIONE (karta D4, rekonsyliacja rozjazdu). Manualny
#:   odbiór nN bez pozycji katalogowej — kanoniczny `EKSPERCKI_RECZNY` w
#:   `enm.domain_operations_v2.add_nn_load`, patrz `tests/enm/
#:   test_znacznik_pochodzenia_katalogowego_v2.py::
#:   test_odbior_ekspercki_nie_deklaruje_kategorii_katalogu` — jest teraz
#:   osiągalny z produkcyjnego API, JAWNIE, przez deklarację
#:   `source_mode: "EKSPERCKI_RECZNY"` w payloadzie (`_uses_manual_nn_load` w
#:   `api/domain_ops_policy.py`) — DOKŁADNIE ten sam wyróżnik, którym operacja
#:   domenowa już znakuje odbiór w migawce i którym `add_grid_source_sn` już
#:   rozpoznaje ręczny ekwiwalent (`_uses_manual_grid_source_equivalent`). Brak
#:   deklaracji i brak katalogu nadal daje 422 (katalog-first pozostaje
#:   domyślne) — pin: `test_add_nn_load_ekspercki_reczny_wymaga_jawnej_deklaracji`
#:   i `test_add_nn_load_bez_deklaracji_i_bez_katalogu_daje_422` niżej.
#:   `catalogFirstRules.ts` dostał LUSTRZANY case (`hasManualNnLoad` —
#:   `payload.source_mode === 'EKSPERCKI_RECZNY'`), więc pozycja NIE jest już w
#:   tym zbiorze; kreator (`KreatorOdbioruNn.tsx`/`odbiorModel.ts`) ma teraz
#:   JAWNY przełącznik trybu (katalog / ręczny), ten sam wzorzec co
#:   `KreatorZrodloZasilania.tsx`.
#: * `add_sn_bay`, `append_station_on_endpoint` — POZA zakresem tej karty (SN, nie
#:   nN; ZAKAZY §"Frontend: tylko kreatory nN"). Zmierzone: OBA kreatory
#:   (`ui2/kreatory/pole/KreatorPolaSn.tsx`+`polaSnModel.ts`,
#:   `ui2/kreatory/stacja/stacjaModel.ts`) i tak wysyłają katalog przez WŁASNĄ
#:   lokalną walidację formularza (`polaSnModel.ts` linia ~159: „Wybierz aparat
#:   pola z katalogu SN.") — to luka w SPOLECZONYM, drugorzędnym helperze
#:   pre-flight (`catalogFirstRules.ts` przestał być aktualizowany dla tych dwóch
#:   operacji), NIE martwa/złamana ścieżka kreatora jak przy #2. `append_station_
#:   on_endpoint` ma DODATKOWO warunek („transformator OPCJONALNY" —
#:   `_append_station_tworzy_transformator` w `domain_ops_policy.py`), którego
#:   naiwne dopisanie do switcha bez powtórzenia TEGO SAMEGO warunku zrobiłoby
#:   frontend SUROWSZY od backendu (nowy defekt, nie naprawa) — zgłoszone do
#:   osobnej karty, nie naprawiane tu bez pełnego pomiaru tego warunku.
ROZJAZD_WYMOGU_KATALOGU_ZNANY: frozenset[str] = frozenset(
    {"add_sn_bay", "append_station_on_endpoint"}
)


def test_bramka_i_frontend_zgadzaja_sie_co_do_wymogu_katalogu() -> None:
    """Iloczyn cech: KAŻDA operacja z `CATALOG_REQUIRED_OPERATIONS` ma frontendowy
    odpowiednik w `catalogFirstRules.ts` ALBO jest na jawnej, uzasadnionej liście
    wyjątków (`ROZJAZD_WYMOGU_KATALOGU_ZNANY`) — nigdy cicho. Odwrotny kierunek też:
    frontend nie może wymagać katalogu dla operacji spoza rejestru backendu.
    """
    frontend = _frontend_catalog_first_operations()
    assert frontend, "Skan catalogFirstRules.ts stracił kotwicę — brak case'ów switcha"

    backend_bez_frontendu = CATALOG_REQUIRED_OPERATIONS - frontend
    nieudokumentowane = backend_bez_frontendu - ROZJAZD_WYMOGU_KATALOGU_ZNANY
    assert not nieudokumentowane, (
        "Operacje wymagające katalogu w API, ale nie w catalogFirstRules.ts, bez "
        f"udokumentowanego uzasadnienia: {sorted(nieudokumentowane)}"
    )

    juz_niepotrzebne = ROZJAZD_WYMOGU_KATALOGU_ZNANY - backend_bez_frontendu
    assert not juz_niepotrzebne, (
        "Wpisy na liście wyjątków, które przestały być rozjazdem (rozjazd naprawiony "
        f"po obu stronach — usuń z listy): {sorted(juz_niepotrzebne)}"
    )

    frontend_bez_backendu = frontend - CATALOG_REQUIRED_OPERATIONS
    assert not frontend_bez_backendu, (
        "catalogFirstRules.ts wymaga katalogu dla operacji spoza "
        f"CATALOG_REQUIRED_OPERATIONS (frontend surowszy od backendu): "
        f"{sorted(frontend_bez_backendu)}"
    )

    # `add_nn_outgoing_field`: NIE MA w żadnym z dwóch zbiorów (naprawa #2) — pin
    # jawny, żeby regresja (przywrócenie do CATALOG_REQUIRED_OPERATIONS bez
    # równoczesnej naprawy operacji/frontu) zapaliła ten test od razu.
    assert "add_nn_outgoing_field" not in CATALOG_REQUIRED_OPERATIONS
    assert "add_nn_outgoing_field" not in frontend


# ---------------------------------------------------------------------------
# Karta D4 — rekonsyliacja rozjazdu `add_nn_load`. Domena już gwarantuje tryb
# EKSPERCKI_RECZNY bez katalogu (`enm.domain_operations_v2.add_nn_load`,
# przypięte `tests/enm/test_znacznik_pochodzenia_katalogowego_v2.py::
# test_odbior_ekspercki_nie_deklaruje_kategorii_katalogu`). Testy niżej
# pilnują, że brama API (`_uses_manual_nn_load` w `api/domain_ops_policy.py`)
# przepuszcza TEN SAM przypadek — JAWNIE zadeklarowany, nigdy po cichu.
# ---------------------------------------------------------------------------


def _enm_z_odplywem_nn() -> tuple[dict[str, Any], str]:
    """Minimalny model ze stacją, szyną nN i odpływem (feeder) — TEN SAM
    przepis co `tests/enm/test_add_nn_load_cosphi.py::_enm_with_feeder`,
    z dopisanym `header`/`station_type`, których wymaga walidacja Pydantic
    (`EnergyNetworkModel`) przy zapisie do store'a — `execute_domain_operation`
    ich nie wymaga, ale `set_enm` przyjmuje wyłącznie zwalidowany model.

    Zwraca (migawka, feeder_ref) — `feeder_ref` pochodzi z `selection_hint`
    operacji, TAK SAMO jak w `_enm_with_feeder`, bo miejsce przechowania pola
    w migawce (`bays` czy `substations[].meta.nn_field_specs`) jest szczegółem
    implementacyjnym `_field_ref_exists`, nie kontraktem tego testu.
    """
    enm: dict[str, Any] = {
        "header": {"name": "brama-api-nn-load"},
        "buses": [{"ref_id": "bus-nn", "name": "Szyna nN", "voltage_kv": 0.4}],
        "substations": [
            {
                "ref_id": "st-1",
                "name": "ST-1",
                "station_type": "mv_lv",
                "bus_refs": ["bus-nn"],
                "field_specs": [],
            }
        ],
    }
    feeder = execute_domain_operation(
        enm, "add_nn_outgoing_field", {"station_ref": "st-1", "bus_nn_ref": "bus-nn"}
    )
    assert not feeder.get("error"), feeder
    return feeder["snapshot"], str(feeder["selection_hint"]["element_id"])


def _zasiej_odplyw_nn(case_id: str) -> str:
    """Zapisuje w store model z odpływem nN i zwraca jego `feeder_ref` —
    przygotowanie stanu POZA drogą HTTP (setup, nie przedmiot testu), żeby
    dalsze wywołanie `add_nn_load` w teście szło PRODUKCYJNĄ drogą zapisu
    (`POST .../enm/domain-ops`), a nie bezpośrednim `execute_domain_operation`.
    """
    snapshot, feeder_ref = _enm_z_odplywem_nn()
    model = EnergyNetworkModel.model_validate(snapshot)
    set_enm(case_id, model)
    return feeder_ref


def test_add_nn_load_ekspercki_reczny_wymaga_jawnej_deklaracji() -> None:
    """Iloczyn cech bramy (karta D4): katalog obecny × deklaracja obecna × żadne
    z nich, oraz OBIE naraz (poprawna/zepsuta referencja) — nie tylko przykład
    z karty. Deklaracja jest furtką WYŁĄCZNIE dla braku referencji, nigdy dla
    referencji, która akurat nie istnieje (predykat parzysty z priorytetem
    domeny — patrz komentarz przy bypassie w `api/domain_ops_policy.py`).
    """
    bazowy: dict[str, Any] = {"feeder_ref": "nn-1", "active_power_kw": 12.0}

    # (1) katalog obecny, brak deklaracji -> przechodzi (zachowanie sprzed karty).
    z_katalogiem = {**bazowy, "catalog_binding": _wiazanie("OBCIAZENIE", REF_ODBIOR)}
    blad, _ = validate_and_materialize_catalog_binding("add_nn_load", z_katalogiem)
    assert blad is None, blad

    # (2) deklaracja obecna, brak katalogu -> przechodzi (NAPRAWA karty D4).
    z_deklaracja = {**bazowy, "source_mode": "EKSPERCKI_RECZNY"}
    blad2, pola2 = validate_and_materialize_catalog_binding("add_nn_load", z_deklaracja)
    assert blad2 is None, blad2
    assert pola2 == {}

    # (3) INIEKCJA — ani katalog, ani deklaracja: 422 (katalog-first domyślne).
    # Ten przypadek jest dowodem, że bypass NIE jest bezwarunkowy: gdyby ktoś
    # usunął `_uses_manual_nn_load(...)` z warunku bramy (albo zrobił go zawsze
    # `True`), ten test zaczerwieniłby się jako pierwszy.
    blad3, _ = validate_and_materialize_catalog_binding("add_nn_load", bazowy)
    assert blad3 is not None, "brama przepuściła add_nn_load BEZ katalogu i BEZ deklaracji"
    assert blad3.code == "catalog.ref_required", blad3

    # (4) deklaracja + katalog ISTNIEJĄCY naraz -> nadal przechodzi (deklaracja
    # nie blokuje poprawnej pozycji, gdy klient poda obie rzeczy naraz).
    oba_poprawne = {
        **bazowy,
        "source_mode": "EKSPERCKI_RECZNY",
        "catalog_binding": _wiazanie("OBCIAZENIE", REF_ODBIOR),
    }
    blad4, _ = validate_and_materialize_catalog_binding("add_nn_load", oba_poprawne)
    assert blad4 is None, blad4

    # (5) deklaracja + katalog ZEPSUTY naraz -> WCIĄŻ 422. Priorytet domeny:
    # `add_nn_load` rozstrzyga tryb z OBECNOŚCI referencji, nie z deklarowanego
    # `source_mode` — deklaracja NIE jest furtką omijającą walidację istniejącej,
    # ale błędnej pozycji katalogu.
    oba_zepsute = {
        **bazowy,
        "source_mode": "EKSPERCKI_RECZNY",
        "catalog_binding": _wiazanie("OBCIAZENIE", REF_ODBIOR + LITEROWKA),
    }
    blad5, _ = validate_and_materialize_catalog_binding("add_nn_load", oba_zepsute)
    assert blad5 is not None, "deklaracja trybu eksperckiego omija walidację zepsutej referencji"
    assert blad5.code == "catalog.item_not_found", blad5

    # (6) deklaracja z INNĄ wartością niż dokładnie „EKSPERCKI_RECZNY" nie zwalnia
    # z katalogu — zero drugiego, niezależnego wyróżnika.
    for inna_wartosc in ("KATALOG", "MIGRACJA", "ekspercki_reczny", ""):
        blad6, _ = validate_and_materialize_catalog_binding(
            "add_nn_load", {**bazowy, "source_mode": inna_wartosc}
        )
        assert blad6 is not None, f"source_mode={inna_wartosc!r} nie powinno zwalniać z katalogu"
        assert blad6.code == "catalog.ref_required", blad6


def test_add_nn_load_ekspercki_reczny_znacznik_przez_pelne_api(klient: TestClient) -> None:
    """Znacznik pochodzenia w modelu PO ścieżce eksperckiej, PRZEZ PEŁNE API
    (`POST /api/cases/{id}/enm/domain-ops`) — nie tylko przez bezpośrednie
    wywołanie `execute_domain_operation`, jak w `tests/enm/
    test_znacznik_pochodzenia_katalogowego_v2.py`. Dowód, że ścieżka ekspercka
    jest osiągalna z produkcyjnej drogi zapisu, tak jak jest z domeny.
    """
    case_id = "brama-api-nn-load-ekspercki-ok"
    feeder_ref = _zasiej_odplyw_nn(case_id)

    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_nn_load",
                "payload": {
                    "feeder_ref": feeder_ref,
                    "active_power_kw": 12.0,
                    "source_mode": "EKSPERCKI_RECZNY",
                },
            }
        },
    )

    assert odpowiedz.status_code == 200, odpowiedz.text
    tresc = odpowiedz.json()
    assert tresc.get("error") is None, tresc.get("error")
    odbior = tresc["snapshot"]["loads"][-1]
    assert odbior.get("catalog_ref") is None
    assert odbior.get("catalog_namespace") is None
    assert odbior.get("source_mode") == "EKSPERCKI_RECZNY"


def test_add_nn_load_bez_deklaracji_i_bez_katalogu_daje_422(klient: TestClient) -> None:
    """PARYTET KONTRAKTU HTTP: bez katalogu i bez jawnej deklaracji — `422
    catalog.ref_required`, NIE `HTTP 200` z kodem błędu w treści, model bez
    zmian. Katalog-first pozostaje domyślne (§0 karty D4) — to jest ta sama
    iniekcja co przypadek (3) w teście funkcyjnym powyżej, przeprowadzona
    PRODUKCYJNĄ drogą zapisu.
    """
    case_id = "brama-api-nn-load-422"
    feeder_ref = _zasiej_odplyw_nn(case_id)
    hash_przed = klient.get(f"/api/cases/{case_id}/enm").json()["header"]["hash_sha256"]

    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_nn_load",
                "payload": {"feeder_ref": feeder_ref, "active_power_kw": 12.0},
            }
        },
    )

    assert odpowiedz.status_code == 422, odpowiedz.text
    szczegol = odpowiedz.json()["detail"]
    assert szczegol["code"] == "catalog.ref_required", szczegol
    assert klient.get(f"/api/cases/{case_id}/enm").json()["header"]["hash_sha256"] == hash_przed
