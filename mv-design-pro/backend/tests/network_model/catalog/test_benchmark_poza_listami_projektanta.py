"""Klasa: rekord benchmarku literaturowego (``bench_*``, K1.2) jako propozycja projektanta.

Odbior W5-A (2026-09-16): kreator zrodla GPZ oferowal jako PIERWSZA pozycje
``bench_ieee14bus_br15`` (135/14 kV, Yy0, P_k = 0), a wyprowadzenie Z0 z opisu punktu
neutralnego slusznie odmawialo (brak P_k). Rekordy benchmarkowe istnieja wylacznie dla
budowniczych sieci wzorcowych (``catalog_ref`` -> ``get_*_type``); zadna lista widoczna
dla projektanta (``CatalogRepository.list_*``, API ``/api/catalog/*-types``) ich nie niesie.

Iloczyn cech: {4 rodzaje z benchmarkami: linia, transformator, kondensator, generator
synchroniczny} x {lista, odczyt po id, API}.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.mv_benchmark_catalog import (
    PREFIKS_BENCHMARKU,
    get_all_benchmark_line_records,
    get_all_benchmark_shunt_capacitor_records,
    get_all_benchmark_synchronous_generator_records,
    get_all_benchmark_transformer_records,
    jest_rekordem_benchmarku,
)

_RODZAJE = {
    "line": (get_all_benchmark_line_records, "list_line_types", "get_line_type"),
    "transformer": (
        get_all_benchmark_transformer_records,
        "list_transformer_types",
        "get_transformer_type",
    ),
    "shunt_capacitor": (
        get_all_benchmark_shunt_capacitor_records,
        "list_shunt_capacitor_types",
        "get_shunt_capacitor_type",
    ),
    "synchronous_generator": (
        get_all_benchmark_synchronous_generator_records,
        "list_synchronous_generator_types",
        "get_synchronous_generator_type",
    ),
}


def _id(rekord: dict) -> str:
    return str(rekord.get("id") or rekord.get("type_id"))


@pytest.mark.parametrize("rodzaj", sorted(_RODZAJE))
def test_kazdy_rekord_benchmarku_nosi_prefiks_k12(rodzaj: str) -> None:
    getter, _, _ = _RODZAJE[rodzaj]
    rekordy = getter()
    assert rekordy, rodzaj
    for rekord in rekordy:
        assert jest_rekordem_benchmarku(_id(rekord)), _id(rekord)


@pytest.mark.parametrize("rodzaj", sorted(_RODZAJE))
def test_lista_projektanta_bez_benchmarkow_a_odczyt_po_id_dziala(rodzaj: str) -> None:
    getter, lista, odczyt = _RODZAJE[rodzaj]
    katalog = get_default_mv_catalog()
    widoczne = [str(item.id) for item in getattr(katalog, lista)()]
    assert not any(jest_rekordem_benchmarku(i) for i in widoczne), rodzaj
    for rekord in getter():
        assert getattr(katalog, odczyt)(_id(rekord)) is not None, _id(rekord)


def test_zaden_rekord_producencki_nie_nosi_prefiksu_benchmarku() -> None:
    katalog = get_default_mv_catalog()
    for _, lista, _ in _RODZAJE.values():
        for item in getattr(katalog, lista)():
            assert not str(item.id).startswith(PREFIKS_BENCHMARKU), item.id


def test_api_transformer_types_bez_benchmarkow_i_z_p_k() -> None:
    from api.main import app

    with TestClient(app) as client:
        odpowiedz = client.get("/api/catalog/transformer-types")
    assert odpowiedz.status_code == 200
    rekordy = odpowiedz.json()
    assert rekordy
    assert not any(jest_rekordem_benchmarku(r["id"]) for r in rekordy)
    # Kazdy transformator WN/SN widoczny dla projektanta niesie straty obciazeniowe
    # (dana wejsciowa wyprowadzenia Z0 rownowaznika, W5-A) — zero sentineli P_k = 0.
    wn_sn = [r for r in rekordy if float(r.get("voltage_hv_kv") or 0) >= 60]
    assert wn_sn
    assert all(float(r.get("pk_kw") or 0) > 0 for r in wn_sn), [
        r["id"] for r in wn_sn if not float(r.get("pk_kw") or 0) > 0
    ]
