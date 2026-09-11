"""Pole nN tworzone operacją może WSKAZAĆ aparat z katalogu — obie role.

DEFEKT, ZMIERZONY NA ŻYWYM BACKENDZIE (2026-09-11). Promocja pól nN
(`enm/migrations/nn_field_specs_promocja.migruj`) CZYTA z meta wpisu
`nn_field_specs` klucz ``catalog_binding``/``catalog_bindings`` i buduje z niego
`SwitchBranch` z ``catalog_ref``, ``source_mode: KATALOG`` i
``materialized_params``. CZYTELNIK ISTNIAŁ — ale w klasie CZTERECH pisarzy
`nn_field_specs` tylko DWA go karmiły:

===================================================  ==================
Pisarz                                               wiązanie w meta?
===================================================  ==================
`domain_operations._build_nn_field_specs`            TAK (wyłącznik główny nN)
`_append_converter_field_if_needed`                  TAK (pole przekształtnika)
`_add_nn_outgoing_field_internal`  (rola FEEDER)     **NIE**
`_append_nn_source_meta_field`     (rola SOURCE)     **NIE**
===================================================  ==================

Oba brakujące siedzą za JEDYNYM publicznym write-pathem pola nN
(`add_nn_outgoing_field`), więc projektant tworzący odpływ nN nie miał ŻADNEJ
drogi związania jego aparatu z katalogiem. Zmierzone przed naprawą po
``add_nn_outgoing_field`` na świeżej stacji: `engineering-readiness` meldowało
``ready = False`` z kodami ``['W002', 'W061', 'switch.catalog_ref_missing']`` na
elemencie ``nn/<seed>/feeder_device`` — blokada bez operacji, którą dałoby się
ją zdjąć przy tworzeniu pola.

To ta sama KLASA co naprawiony wcześniej wyłącznik główny nN
(`nn_block.main_breaker_catalog_bindings`): wtedy naprawiono INSTANCJĘ z karty,
nie klasę. Ten plik zamyka klasę i pilnuje jej PARAMI: dla każdej roli pola
sprawdzamy tor pozytywny (wiązanie dociera do aparatu) i negatywny (martwa
pozycja jest ODRZUCANA, a nie stemplowana „KATALOG").
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.migrations.nn_field_specs_promocja import (
    META_KLUCZ_GALAZ_ZRODLO_FIELD_REF,
)
from enm.migrations.nn_field_specs_promocja import migruj as promuj_nn_field_specs
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.validator import ENMValidator

CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"
CATALOG_FIELD_APPARATUS = "sw-cb-abb-vd4-17kv-630a"
#: Aparat nN istniejący w katalogu (przestrzeń APARAT_NN).
APARAT_NN = "cb_nn_400a"
#: Referencja, której w katalogu NIE MA — tor negatywny obu ról.
APARAT_MARTWY = "cb_nn_nie_istnieje"


def _op(snap: dict[str, Any], name: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(snap, name, payload)
    assert not wynik.get(
        "error"
    ), f"Operacja '{name}' zwróciła błąd: {wynik.get('error')} (code={wynik.get('error_code')})"
    return wynik["snapshot"]


def _stacja_sn_nn() -> tuple[dict[str, Any], str, str]:
    """Sieć: GPZ → 2 odcinki → stacja SN/nN. Zwraca ``(migawka, station, bus_nn)``."""
    snap = EnergyNetworkModel(
        header=ENMHeader(name="Pole nN", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    snap = _op(
        snap,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": CATALOG_ZRODLO_250},
    )
    for _ in range(2):
        snap = _op(
            snap,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 500.0,
                    "catalog_ref": CATALOG_LINE_70,
                }
            },
        )
    segment_id = next(b["ref_id"] for b in snap["branches"] if b.get("type") == "line_overhead")
    snap = _op(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": segment_id,
            "field_apparatus_catalog_ref": CATALOG_FIELD_APPARATUS,
            "station": {"name": "Stacja S1", "station_type": "inline", "nn_voltage_kv": 0.4},
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
            "nn_voltage_kv": 0.4,
        },
    )
    station_ref = next(s["ref_id"] for s in snap["substations"] if s["ref_id"].startswith("stn/"))
    bus_nn_ref = next(
        b["ref_id"]
        for b in snap["buses"]
        if b.get("voltage_kv") is not None and b["voltage_kv"] < 1.0
    )
    return snap, station_ref, bus_nn_ref


def _wiazanie(item_id: str) -> dict[str, Any]:
    return {
        "catalog_namespace": "APARAT_NN",
        "catalog_item_id": item_id,
        "catalog_item_version": "2024.1",
    }


def _spec_pola(snap: dict[str, Any], field_ref: str) -> dict[str, Any]:
    for substation in snap["substations"]:
        for spec in (substation.get("meta") or {}).get("nn_field_specs") or []:
            if spec.get("field_ref") == field_ref:
                return spec
    raise AssertionError(f"Wpis pola {field_ref} nie powstał w nn_field_specs.")


def _aparaty_po_promocji(snap: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Uruchom promocję (to samo, co robi `enm.store`) i zmapuj aparaty PO WPISIE POLA.

    Selekcja idzie po `META_KLUCZ_GALAZ_ZRODLO_FIELD_REF` — tym samym kluczu,
    którym promocja znakuje pochodzenie gałęzi. Wybór „po kształcie ``ref_id``"
    byłby błędny: stacja SN/nN ma WŁASNE pole nN (wyłącznik główny) i jego aparat
    ma dokładnie taki sam kształt referencji, więc test mierzyłby cudzy element.
    """
    zmigrowany, _ = promuj_nn_field_specs(EnergyNetworkModel.model_validate(snap))
    return {
        (b.meta or {})[META_KLUCZ_GALAZ_ZRODLO_FIELD_REF]: b.model_dump(mode="json")
        for b in zmigrowany.branches
        if (b.meta or {}).get(META_KLUCZ_GALAZ_ZRODLO_FIELD_REF)
    }


def _aparat_po_promocji(snap: dict[str, Any], field_ref: str) -> dict[str, Any]:
    aparaty = _aparaty_po_promocji(snap)
    assert (
        field_ref in aparaty
    ), f"Promocja nie zbudowała aparatu dla pola {field_ref} (są: {sorted(aparaty)})."
    return aparaty[field_ref]


# ---------------------------------------------------------------------------
# Rola FEEDER (odpływ nN)
# ---------------------------------------------------------------------------


def test_odplyw_nn_ze_wskazanym_aparatem_niesie_wiazanie_do_promocji() -> None:
    """Wiązanie z payloadu ląduje w meta wpisu — TAM, gdzie czyta je promocja."""
    snap, station, bus = _stacja_sn_nn()
    wynik = execute_domain_operation(
        snap,
        "add_nn_outgoing_field",
        {"station_ref": station, "bus_nn_ref": bus, "catalog_binding": _wiazanie(APARAT_NN)},
    )
    assert not wynik.get("error"), wynik.get("error")
    field_ref = (wynik.get("selection_hint") or {})["element_id"]

    meta = _spec_pola(wynik["snapshot"], field_ref).get("meta") or {}
    assert meta["apparatus_catalog_ref"] == APARAT_NN
    assert meta["catalog_binding"]["catalog_item_id"] == APARAT_NN
    assert (
        meta["catalog_binding"]["catalog_namespace"] == "APARAT_NN"
    ), "Przestrzeń zapisana do pola musi być tą, w której sprawdzono ISTNIENIE."


def test_aparat_odplywu_po_promocji_deklaruje_KATALOG_a_nie_MIGRACJE() -> None:
    """Skutek końcowy: gałąź w modelu ma `catalog_ref`, nie pustkę po migracji.

    Bez tego testu naprawa mogłaby zapisać wiązanie do meta i nigdy nie sprawdzić,
    czy CZYTELNIK po drugiej stronie łańcucha faktycznie je widzi — a to ten
    właśnie rozjazd (pisarz bez czytelnika / czytelnik bez pisarza) jest sednem
    defektu.
    """
    snap, station, bus = _stacja_sn_nn()
    wynik = execute_domain_operation(
        snap,
        "add_nn_outgoing_field",
        {"station_ref": station, "bus_nn_ref": bus, "catalog_binding": _wiazanie(APARAT_NN)},
    )
    field_ref = (wynik.get("selection_hint") or {})["element_id"]

    aparat = _aparat_po_promocji(wynik["snapshot"], field_ref)
    assert aparat["catalog_ref"] == APARAT_NN
    assert aparat["catalog_namespace"] == "APARAT_NN"
    assert aparat["source_mode"] == "KATALOG"
    assert aparat["parameter_source"] == "CATALOG"
    assert aparat["materialized_params"], "Aparat z katalogu bez tabliczki to pusta deklaracja."


def test_odplyw_nn_bez_wiazania_jest_NADAL_kanoniczny() -> None:
    """Pole bez wskazanego aparatu to poprawny stan pośredni — parytet ze stroną SN.

    PREDYKATY PARAMI: warunek WEJŚCIA (czy wolno utworzyć pole) nie zmienia się
    przez naprawę; zmienia się tylko to, że istnieje DROGA podania wiązania.
    Gdyby naprawa uczyniła wiązanie obowiązkowym, kreator pola nN przestałby
    działać dla projektanta, który dobiera aparat później.
    """
    snap, station, bus = _stacja_sn_nn()
    wynik = execute_domain_operation(
        snap, "add_nn_outgoing_field", {"station_ref": station, "bus_nn_ref": bus}
    )
    assert not wynik.get("error")
    field_ref = (wynik.get("selection_hint") or {})["element_id"]
    meta = _spec_pola(wynik["snapshot"], field_ref).get("meta") or {}
    assert "catalog_binding" not in meta
    assert "apparatus_catalog_ref" not in meta


def test_odplyw_nn_z_MARTWA_pozycja_jest_odrzucany() -> None:
    """Wskazana pozycja musi ISTNIEĆ — inaczej migawka stempluje KATALOG na nicość."""
    snap, station, bus = _stacja_sn_nn()
    wynik = execute_domain_operation(
        snap,
        "add_nn_outgoing_field",
        {"station_ref": station, "bus_nn_ref": bus, "catalog_binding": _wiazanie(APARAT_MARTWY)},
    )
    assert wynik.get("error"), "Martwa pozycja katalogu przeszła — stempel KATALOG na nicość."
    assert APARAT_MARTWY in str(wynik["error"])


# ---------------------------------------------------------------------------
# Rola SOURCE (pole źródłowe nN) — DRUGI pisarz tej samej klasy
# ---------------------------------------------------------------------------


def test_pole_zrodlowe_nn_ze_wskazanym_aparatem_niesie_wiazanie() -> None:
    """Ta sama operacja, druga rola — naprawa musi obejmować OBIE, nie jedną."""
    snap, station, bus = _stacja_sn_nn()
    wynik = execute_domain_operation(
        snap,
        "add_nn_outgoing_field",
        {
            "station_ref": station,
            "bus_nn_ref": bus,
            "field_role": "SOURCE",
            "source_field_kind": "PV",
            "catalog_binding": _wiazanie(APARAT_NN),
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    field_ref = (wynik.get("selection_hint") or {})["element_id"]

    meta = _spec_pola(wynik["snapshot"], field_ref).get("meta") or {}
    assert meta["apparatus_catalog_ref"] == APARAT_NN
    assert meta["catalog_binding"]["catalog_namespace"] == "APARAT_NN"
    assert meta["source_field_kind"] == "PV", "Naprawa nie może wyprzeć własnych kluczy roli."


def test_pole_zrodlowe_nn_z_MARTWA_pozycja_jest_odrzucane() -> None:
    """Tor negatywny drugiej roli — bramka istnienia działa po obu stronach."""
    snap, station, bus = _stacja_sn_nn()
    wynik = execute_domain_operation(
        snap,
        "add_nn_outgoing_field",
        {
            "station_ref": station,
            "bus_nn_ref": bus,
            "field_role": "SOURCE",
            "source_field_kind": "PV",
            "catalog_binding": _wiazanie(APARAT_MARTWY),
        },
    )
    assert wynik.get("error")
    assert APARAT_MARTWY in str(wynik["error"])


# ---------------------------------------------------------------------------
# Skutek dla projektanta: gotowość inżynierska
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rola", ["FEEDER", "SOURCE"])
def test_wskazany_aparat_zdejmuje_blokade_gotowosci_w_OBU_rolach(rola: str) -> None:
    """Zmierzony skutek defektu: `W061` + `switch.catalog_ref_missing` na aparacie pola.

    Test sprawdza DOKŁADNIE te dwa kody na DOKŁADNIE tym elemencie — nie samo
    `ready`, bo `ready` zależy też od innych kontroli sieci i mogłoby zafałszować
    wynik w obie strony.
    """
    snap, station, bus = _stacja_sn_nn()
    payload: dict[str, Any] = {"station_ref": station, "bus_nn_ref": bus}
    if rola == "SOURCE":
        payload.update({"field_role": "SOURCE", "source_field_kind": "PV"})

    wynik_bez = execute_domain_operation(snap, "add_nn_outgoing_field", dict(payload))
    wynik_ze = execute_domain_operation(
        snap, "add_nn_outgoing_field", {**payload, "catalog_binding": _wiazanie(APARAT_NN)}
    )
    bez, ref_bez = wynik_bez["snapshot"], wynik_bez["selection_hint"]["element_id"]
    ze, ref_ze = wynik_ze["snapshot"], wynik_ze["selection_hint"]["element_id"]

    def _kody_aparatu(migawka: dict[str, Any], field_ref: str) -> set[str]:
        """Kody DOKŁADNIE tego aparatu — nie wszystkich aparatów nN stacji.

        Stacja ma własne pole nN (wyłącznik główny) bez wiązania w tej fiksturze,
        więc zbiór „wszystkie gałęzie `_device`" niósłby jego W061 i test byłby
        czerwony niezależnie od naprawy.
        """
        zmigrowany, _ = promuj_nn_field_specs(EnergyNetworkModel.model_validate(migawka))
        badany = next(
            b.ref_id
            for b in zmigrowany.branches
            if (b.meta or {}).get(META_KLUCZ_GALAZ_ZRODLO_FIELD_REF) == field_ref
        )
        wynik = ENMValidator().validate(zmigrowany)
        return {issue.code for issue in wynik.issues if badany in issue.element_refs}

    kody_bez = _kody_aparatu(bez, ref_bez)
    kody_ze = _kody_aparatu(ze, ref_ze)
    assert "W061" in kody_bez, "Fikstura nie odtwarza defektu — bramka nic nie pilnuje."
    assert "W061" not in kody_ze, "Wskazany aparat nie zdjął W061."
    assert not (kody_ze & {"switch.catalog_ref_missing"})
