"""Przestrzeń katalogu z RODZAJU elementu — jedna mapa dla operacji, bramy API i przypisania.

Karta JEDEN-KLUCZ-KATALOGU, decyzja architekta: ``APARAT_NN``, ``APARAT_NN_MCB``,
``WKLADKA_NN`` i ``APARAT_NN_RCD`` to odrębne, prawowite przestrzenie katalogu
(``network_model/catalog/types.py`` ``CatalogNamespace``, materializacja
``network_model/catalog/materialization.py``). Dawny odczyt przypisywał rodzajowi elementu
JEDNĄ przestrzeń, więc wyłącznik instalacyjny z własnej przestrzeni był odmową
``catalog.namespace_mismatch`` (łańcuch nN ``tests/e2e/test_nn_full_chain.py``).

Jedyne źródło: ``enm.wiazanie_katalogowe.PRZESTRZENIE_RODZAJU``. ILOCZYN CECH:

* aparat nN operacji ``add_nn_switch_device``: klasa aparatu {wyłącznik, bezpiecznik} ×
  przestrzeń zadeklarowana {brak, każda przestrzeń aparatury nN i SN} × droga {operacja
  domenowa, brama API} — przyjęte (z przestrzenią zadeklarowaną albo domyślną) albo
  odmowa ``catalog.namespace_mismatch``, ten sam werdykt w obu drogach;
* przypisanie typu istniejącej gałęzi (``assign_catalog_to_element``): typ gałęzi ×
  przestrzeń — ta sama mapa;
* źródło przekształtnikowe nN: technologia {PV, BESS} × przestrzeń zadeklarowana
  {ZRODLO_NN_PV, ZRODLO_NN_BESS, CONVERTER} × droga — przestrzeń jest JEDNA (technologia).
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from api.domain_ops_policy import CatalogPolicyError, validate_and_materialize_catalog_binding
from enm.domain_operations import _namespace_pasuje_do_galezi, execute_domain_operation
from enm.wiazanie_katalogowe import (
    KOD_PRZESTRZENI_NIEZGODNEJ,
    PRZESTRZENIE_RODZAJU,
    przestrzenie_aparatu_nn,
)

from tests.enm.model_minimalny import model_minimalny

#: Pozycja katalogu w każdej przestrzeni aparatury (istniejąca w katalogu statycznym).
POZYCJA_W_PRZESTRZENI: dict[str, str] = {
    "APARAT_NN": "cb_nn_630a",
    "APARAT_NN_MCB": "mcb_nn_b10a",
    "WKLADKA_NN": "fuse_nn_gg_nh00_100a",
    "APARAT_NN_RCD": "rcd_nn_a_100a_100ma",
    "APARAT_SN": "sw-cb-abb-vd4-17kv-630a",
}

KLASY_APARATU_NN = ("switch", "fuse")
DEKLAROWANE = (None, *POZYCJA_W_PRZESTRZENI)


def _dwie_szyny_nn() -> dict[str, Any]:
    return model_minimalny(
        buses=[
            {"ref_id": "nn-a", "name": "Szyna nN A", "voltage_kv": 0.4},
            {"ref_id": "nn-b", "name": "Szyna nN B", "voltage_kv": 0.4},
        ]
    )


def _ladunek_aparatu(klasa: str, deklarowana: str | None) -> dict[str, Any]:
    przestrzen = deklarowana or przestrzenie_aparatu_nn(klasa)[0]
    wiazanie: dict[str, Any] = {"catalog_item_id": POZYCJA_W_PRZESTRZENI[przestrzen]}
    if deklarowana is not None:
        wiazanie["catalog_namespace"] = deklarowana
    return {
        "from_bus_ref": "nn-a",
        "to_bus_ref": "nn-b",
        "device_class": klasa,
        "catalog_binding": wiazanie,
    }


def test_mapa_aparatu_nn_zgodna_z_decyzja_architekta() -> None:
    """Wyłącznik nN: ogólny aparat albo wyłącznik instalacyjny; bezpiecznik: ogólny aparat
    albo wkładka; pierwsza przestrzeń — domyślna (wiązanie bez grupy)."""
    assert przestrzenie_aparatu_nn("switch") == ("APARAT_NN", "APARAT_NN_MCB")
    assert przestrzenie_aparatu_nn("fuse") == ("APARAT_NN", "WKLADKA_NN")
    assert przestrzenie_aparatu_nn(None) == przestrzenie_aparatu_nn("switch")
    # Każda przestrzeń mapy jest członem katalogu (zero fabrykacji nazw).
    from network_model.catalog.types import CatalogNamespace

    znane = {c.value for c in CatalogNamespace}
    assert {p for v in PRZESTRZENIE_RODZAJU.values() for p in v} <= znane


@pytest.mark.parametrize("deklarowana", DEKLAROWANE, ids=lambda d: d or "brak")
@pytest.mark.parametrize("klasa", KLASY_APARATU_NN)
def test_aparat_nn_przestrzen_deklarowana_x_klasa_x_droga(
    klasa: str, deklarowana: str | None
) -> None:
    dozwolone = przestrzenie_aparatu_nn(klasa)
    przyjete = deklarowana is None or deklarowana in dozwolone
    oczekiwana = deklarowana or dozwolone[0]
    ladunek = _ladunek_aparatu(klasa, deklarowana)

    # Droga 1: operacja domenowa.
    enm = _dwie_szyny_nn()
    przed = copy.deepcopy(enm)
    wynik = execute_domain_operation(enm, "add_nn_switch_device", ladunek)
    if przyjete:
        assert not wynik.get("error"), (klasa, deklarowana, wynik.get("error"))
        aparat = next(
            b for b in wynik["snapshot"]["branches"] if b.get("type") in ("switch", "fuse")
        )
        assert aparat["catalog_namespace"] == oczekiwana
        assert aparat["catalog_ref"] == POZYCJA_W_PRZESTRZENI[oczekiwana]
        assert aparat["materialized_params"]["catalog_item_id"] == aparat["catalog_ref"]
    else:
        assert wynik.get("error_code") == KOD_PRZESTRZENI_NIEZGODNEJ, (klasa, deklarowana)
        assert wynik.get("snapshot") is None
        assert enm == przed

    # Droga 2: brama API — ten sam werdykt z tej samej mapy.
    try:
        blad, _ = validate_and_materialize_catalog_binding("add_nn_switch_device", ladunek)
    except CatalogPolicyError as odmowa:
        blad = odmowa
    if przyjete:
        assert blad is None, (klasa, deklarowana, blad)
    else:
        assert blad is not None and blad.code == KOD_PRZESTRZENI_NIEZGODNEJ, (klasa, blad)


@pytest.mark.parametrize(
    "typ_galezi", ["cable", "line_overhead", "breaker", "switch", "bus_coupler", "fuse"]
)
@pytest.mark.parametrize(
    "przestrzen",
    [
        "KABEL_SN",
        "KABEL_NN",
        "LINIA_SN",
        "APARAT_SN",
        "APARAT_NN",
        "APARAT_NN_MCB",
        "WKLADKA_NN",
        "APARAT_NN_RCD",
    ],
)
def test_przypisanie_galezi_z_tej_samej_mapy(typ_galezi: str, przestrzen: str) -> None:
    """Typ gałęzi × przestrzeń: przypisanie typu korzysta z tej samej mapy co tworzenie."""
    oczekiwane = przestrzen in PRZESTRZENIE_RODZAJU[f"galaz.{typ_galezi}"]
    assert _namespace_pasuje_do_galezi({"type": typ_galezi}, przestrzen) is oczekiwane


@pytest.mark.parametrize("klasa", KLASY_APARATU_NN)
@pytest.mark.parametrize("przestrzen", list(POZYCJA_W_PRZESTRZENI))
def test_aparat_utworzony_przyjmuje_przypisanie_z_przestrzeni_rodzaju(
    klasa: str, przestrzen: str
) -> None:
    """Aparat utworzony operacją przyjmuje przypisanie pozycji z każdej przestrzeni dozwolonej
    dla jego typu gałęzi i odmawia pozostałych (ten sam kod odmowy)."""
    enm = execute_domain_operation(
        _dwie_szyny_nn(), "add_nn_switch_device", _ladunek_aparatu(klasa, None)
    )["snapshot"]
    aparat = next(b for b in enm["branches"] if b.get("type") in ("switch", "fuse"))
    wynik = execute_domain_operation(
        enm,
        "assign_catalog_to_element",
        {
            "element_ref": aparat["ref_id"],
            "catalog_binding": {
                "catalog_item_id": POZYCJA_W_PRZESTRZENI[przestrzen],
                "catalog_namespace": przestrzen,
            },
        },
    )
    if przestrzen in PRZESTRZENIE_RODZAJU[f"galaz.{aparat['type']}"]:
        assert wynik.get("error_code") != KOD_PRZESTRZENI_NIEZGODNEJ, wynik.get("error")
    else:
        assert wynik.get("error_code") == KOD_PRZESTRZENI_NIEZGODNEJ, wynik.get("error")


POZYCJE_ZRODLA = {"PV": "conv-pv-nn-0p5mw-0p4kv", "BESS": "conv-bess-nn-0p5mw-0p4kv"}


@pytest.mark.parametrize("deklarowana", ["ZRODLO_NN_PV", "ZRODLO_NN_BESS", "CONVERTER"])
@pytest.mark.parametrize("technologia", ["PV", "BESS"])
def test_zrodlo_nn_jedna_przestrzen_technologii(technologia: str, deklarowana: str) -> None:
    """Źródło PV/BESS bierze pozycję WYŁĄCZNIE z przestrzeni technologii — „CONVERTER"
    (dawny kreator OZE) i przestrzeń drugiej technologii to odmowa w operacji i w bramie."""
    from tests.enm.test_nn_source_catalog_provenance import (
        _base_enm_with_transformer,
        _converter_payload,
    )

    ladunek = _converter_payload(
        technologia,
        {
            "catalog_binding": {
                "catalog_namespace": deklarowana,
                "catalog_item_id": POZYCJE_ZRODLA[technologia],
            }
        },
    )
    przyjete = deklarowana == f"ZRODLO_NN_{technologia}"
    wynik = execute_domain_operation(_base_enm_with_transformer(), "add_converter_source", ladunek)
    try:
        blad, _ = validate_and_materialize_catalog_binding("add_converter_source", ladunek)
    except CatalogPolicyError as odmowa:
        blad = odmowa
    if przyjete:
        assert not wynik.get("error"), wynik.get("error")
        assert blad is None, blad
    else:
        assert wynik.get("error_code") == KOD_PRZESTRZENI_NIEZGODNEJ, wynik.get("error")
        assert blad is not None and blad.code == KOD_PRZESTRZENI_NIEZGODNEJ, blad


@pytest.mark.parametrize("rodzaj", ["KABEL", "LINIA_NAPOWIETRZNA"])
@pytest.mark.parametrize("deklarowana", ["KABEL_SN", "KABEL_NN", "LINIA_SN", "PRZEWOD_LINII_WN"])
def test_odcinek_sn_brama_i_operacja_z_tej_samej_mapy(rodzaj: str, deklarowana: str) -> None:
    """Odcinek SN: rodzaj odcinka × przestrzeń zadeklarowana. Brama API (``segment.rodzaj``)
    i operacje toru (typ gałęzi) biorą przestrzenie z tej samej mapy — przewód linii 110 kV
    (import XLSX, karta LINIA-110) jest przyjęty dla linii, kabel nN dla odcinka SN nie."""
    from api.domain_ops_policy import _segment_namespace
    from enm.wiazanie_katalogowe import odmowa_przestrzeni, przestrzenie_odcinka_sn

    typ = "cable" if rodzaj == "KABEL" else "line_overhead"
    z_bramy = _segment_namespace({"rodzaj": rodzaj})
    assert z_bramy == przestrzenie_odcinka_sn(typ) == PRZESTRZENIE_RODZAJU[f"odcinek_sn.{typ}"]
    oczekiwane = {"KABEL": {"KABEL_SN"}, "LINIA_NAPOWIETRZNA": {"LINIA_SN", "PRZEWOD_LINII_WN"}}
    odmowa = odmowa_przestrzeni(deklarowana, z_bramy, opis_pl="Odcinek")
    assert (odmowa is None) is (deklarowana in oczekiwane[rodzaj])
    if odmowa is not None:
        assert odmowa.kod_bledu == KOD_PRZESTRZENI_NIEZGODNEJ


def test_klucze_wiazan_der_skladaja_sie_z_dwoch_kanalow() -> None:
    """Predykaty parami: pola modelu zapisu wiązań DER (`DER_BINDING_KEYS`) to dokładnie pola
    z wiązań ról ładunku i klucze referencji wprost — handler czyta je dwoma kanałami."""
    from enm.domain_operations_v2 import (
        DER_BINDING_KEYS,
        DER_KLUCZE_REFERENCJI_LADUNKU,
        DER_WIAZANIA_LADUNKU,
    )

    assert DER_BINDING_KEYS == (*DER_WIAZANIA_LADUNKU.values(), *DER_KLUCZE_REFERENCJI_LADUNKU)
