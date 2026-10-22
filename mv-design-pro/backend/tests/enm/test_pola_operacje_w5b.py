"""Operacje domenowe na typowanym polu `Bay` — iloczyn cech karty W5-B/A.

DLACZEGO. Do karty W5-B operacje budowały pole w trzech nietypowanych słownikach
(pola SN i nN w `meta` stacji, pola ZKSN w parametrach punktu rozgałęzienia), a operacja
stacji końca ciągu dopisywała obok wpisu rekord `bays` tego samego pola. Ogólne operacje (zmiana nazwy,
etykiety, parametrów, typu, usunięcie) na polu odmawiały kodem `field.legacy_write_disabled`.
Od W5-B każde pole jest JEDNYM rekordem `bays` budowanym `enm.pola.zbuduj_pole` i zapisywanym
`dodaj_pole`, a ogólne operacje działają na nim przez `zmien_pole`/`usun_pole`.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA):
{rola: LINIA_IN, LINIA_OUT, LINIA_ODG, TR, SPRZĘGŁO, POMIAR, OZE, rezerwa}
× {poziom: SN, nN, ZKSN}
× {operacja: utwórz (drogi budowy), edytuj (rename/set_label/update/assign_catalog),
   usuń (puste / z zależnościami / kaskada), wczytaj z archiwum (dawne klucze → migracja)}.
Każdy przypadek idzie ścieżką natywną: payload → `execute_domain_operation` → migawka.
"""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.kompilator_grafu import pusty_enm
from enm.migrations.field_specs_promocja import (
    KLUCZ_FIELD_SPECS as KLUCZ_SN,
)
from enm.migrations.field_specs_promocja import (
    KLUCZ_NN_FIELD_SPECS as KLUCZ_NN,
)
from enm.migrations.field_specs_promocja import (
    KLUCZ_SWITCHGEAR_FIELD_SPECS as KLUCZ_ZKSN,
)
from enm.models import EnergyNetworkModel
from enm.pola import (
    czy_pole_nn,
    dodaj_pole,
    pola,
    pola_nn_stacji,
    pola_sn_stacji,
    pola_stacji,
    pola_zksn,
    pole,
    zbuduj_pole,
)
from enm.store import przygotuj_model_po_odczycie
from enm.zajetosc_pol import KOD_POLE_ZAJETE

from tests.enm.test_branch_point_sn import _seed_with_cable_segment
from tests.enm.test_station_field_equipment_atomic import (
    CT_REF,
    RELAY_REF,
    VT_REF,
    _build_trunk_with_segment,
    _insert_payload,
    _op,
    _wyposazenie,
)

APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
APARAT_NN = "cb_nn_630a"
CATALOG_TRAFO = "tr-sn-nn-15-04-630kva-dyn11"

#: Skład pól stacji obejmujący KAŻDĄ rolę kanoniczną SN (wcięcie w odcinek: tranzyt
#: IN → OUT, odgałęzienie, transformator, sprzęgło nie wchodzi do stacji jednosekcyjnej).
SKLAD_POL = [
    {"field_role": "LINIA_IN"},
    {"field_role": "LINIA_OUT"},
    {"field_role": "LINIA_ODG"},
    {"field_role": "TRANSFORMATOROWE"},
]


def _stacja(snap: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in snap["substations"] if s.get("station_type") != "gpz")


def _bez_id(rekordy: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{k: v for k, v in r.items() if k != "id"} for r in rekordy]


def _wstawiona_stacja(sn_fields: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    snap, segment_ref, _ = _build_trunk_with_segment()
    return _op(
        snap, "insert_station_on_segment_sn", _insert_payload(segment_ref, sn_fields or SKLAD_POL)
    )


def _stacja_konca(sn_fields: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    snap, _segment_ref, koniec = _build_trunk_with_segment()
    return _op(
        snap,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": koniec,
            "station": {"name": "Stacja końca", "station_type": "terminal", "nn_voltage_kv": 0.4},
            "sn_fields": sn_fields or [{"field_role": "LINIA_IN"}, {"field_role": "POMIAROWE"}],
            "field_apparatus_catalog_ref": APARAT_SN,
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO},
            "nn_block": {"outgoing_feeders_nn_count": 2},
        },
    )


# ---------------------------------------------------------------------------
# Rdzeń: rekord zbudowany operacją nie niesie losowego identyfikatora technicznego
# ---------------------------------------------------------------------------


def test_rekord_pola_bez_id_nie_dostaje_losowego_uuid() -> None:
    """Determinizm migawki: `ENMElement.id` ma fabrykę uuid4 — rekord zbudowany bez `id`
    zostaje bez `id` (dwie identyczne budowy dają bajtowo ten sam rekord); rekord z `id`
    (odczyt z magazynu) zachowuje je."""
    pierwszy = zbuduj_pole(ref_id="p1", bay_role="IN", bus_ref="b1", substation_ref="s1")
    drugi = zbuduj_pole(ref_id="p1", bay_role="IN", bus_ref="b1", substation_ref="s1")
    assert "id" not in pierwszy
    assert pierwszy == drugi
    z_id = dodaj_pole({"bays": []}, {**pierwszy, "id": "00000000-0000-0000-0000-000000000001"})
    assert z_id["id"] == "00000000-0000-0000-0000-000000000001"


@pytest.mark.parametrize("droga", ["wciecie", "koniec_ciagu"])
def test_ta_sama_operacja_daje_bajtowo_te_same_pola(droga: str) -> None:
    budowa = _wstawiona_stacja if droga == "wciecie" else _stacja_konca
    a, b = budowa(), budowa()
    assert json.dumps(a["bays"], sort_keys=True) == json.dumps(b["bays"], sort_keys=True)


# ---------------------------------------------------------------------------
# Utwórz — każda rola × poziom, jeden rekord na pole
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("droga", ["wciecie", "koniec_ciagu"])
def test_kazde_pole_stacji_to_jeden_rekord_bays(droga: str) -> None:
    snap = _wstawiona_stacja() if droga == "wciecie" else _stacja_konca(SKLAD_POL)
    stacja = _stacja(snap)
    sn = pola_sn_stacji(snap, stacja["ref_id"])
    nn = pola_nn_stacji(snap, stacja["ref_id"])
    assert {p["field_role"] for p in sn} == {
        "LINIA_IN",
        "LINIA_OUT",
        "LINIA_ODG",
        "TRANSFORMATOROWE",
    }
    # Para (rola modelu, rola kanoniczna) z JEDNEJ tablicy ról.
    pary = {(p["bay_role"], p["field_role"]) for p in sn}
    assert pary == {
        ("IN", "LINIA_IN"),
        ("OUT", "LINIA_OUT"),
        ("FEEDER", "LINIA_ODG"),
        ("TR", "TRANSFORMATOROWE"),
    }
    # Pole SN ma własny zacisk i aparat w torze.
    for p in sn:
        assert p["terminal_bus_ref"] and p["terminal_bus_ref"] != p["bus_ref"]
        assert p["equipment_refs"]
    # Pola nN: na szynie nN (jeden predykat poziomu), BEZ roli kanonicznej linii SN
    # (walidator E021 uznałby je za pola liniowe SN), z nazwą z klasy napięciowej.
    assert nn and all(czy_pole_nn(snap, p) for p in nn)
    assert all(p["field_role"] is None for p in nn)
    assert {p["bay_role"] for p in nn} >= {"IN", "FEEDER"}
    # Brak dubli identyfikatorów i dawnych kluczy.
    refy = [p["ref_id"] for p in pola(snap)]
    assert len(refy) == len(set(refy))
    assert KLUCZ_SN not in stacja.get("meta", {})
    assert KLUCZ_NN not in stacja.get("meta", {})
    EnergyNetworkModel.model_validate(snap)


def test_stacja_konca_ciagu_identyfikatory_pol_i_transformator_na_zacisku_pola_tr() -> None:
    wynik = execute_domain_operation(
        _build_trunk_with_segment()[0],
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": _build_trunk_with_segment()[2],
            "station": {"name": "Stacja K", "station_type": "terminal", "nn_voltage_kv": 0.4},
            "sn_fields": [{"field_role": "LINIA_IN"}, {"field_role": "LINIA_ODG"}],
            "field_apparatus_catalog_ref": APARAT_SN,
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO},
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    snap = wynik["snapshot"]
    stacja = _stacja(snap)
    sn = pola_sn_stacji(snap, stacja["ref_id"])
    refy = [p["ref_id"] for p in sn]
    # Pola z payloadu: field/{seed}/{n}; pole TR domknięte operacją: field/{seed}/tr.
    assert all(r.startswith("field/") for r in refy)
    assert any(r.endswith("/tr") for r in refy)
    assert not any(str(b["ref_id"]).startswith("bay/") for b in snap["bays"])
    pole_tr = next(p for p in sn if p["field_role"] == "TRANSFORMATOROWE")
    transformator = next(
        t for t in snap["transformers"] if t["ref_id"] in pole_tr["equipment_refs"]
    )
    assert transformator["hv_bus_ref"] == pole_tr["terminal_bus_ref"]
    # Zdarzenia utworzenia pól wskazują identyfikatory pól (jedno zdarzenie na pole SN).
    zdarzenia = [
        e["element_id"] for e in wynik["domain_events"] if e["event_type"] == "FIELDS_CREATED_SN"
    ]
    assert sorted(zdarzenia) == sorted(refy)


def test_pola_zksn_jako_rekordy_punktu_rozgalezienia() -> None:
    snap, segment_ref = _seed_with_cable_segment()
    wynik = execute_domain_operation(
        snap,
        "insert_zksn_on_segment_sn",
        {
            "segment_id": segment_ref,
            "catalog_ref": "ZKSN-2P-630A",
            "branch_ports_count": 1,
            "switch_state": "closed",
            "insert_at": {"mode": "RATIO", "value": 0.5},
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    nowy = wynik["snapshot"]
    punkt = nowy["branch_points"][0]
    zksn = pola_zksn(nowy, punkt["ref_id"])
    assert [p["branch_point_port_id"] for p in zksn] == ["MAIN_IN", "MAIN_OUT", "BRANCH"]
    assert all(p["substation_ref"] is None for p in zksn)
    assert KLUCZ_ZKSN not in punkt["materialized_params"]
    assert KLUCZ_ZKSN not in punkt["runtime_inputs"]
    assert {p["ref_id"] for p in zksn} <= set(wynik["changes"]["created_element_ids"])


# ---------------------------------------------------------------------------
# Edytuj — rename / set_label / update / assign_catalog × SN / nN
# ---------------------------------------------------------------------------


def _pole_sn(snap: dict[str, Any], rola: str) -> dict[str, Any]:
    return next(p for p in pola_sn_stacji(snap, _stacja(snap)["ref_id"]) if p["field_role"] == rola)


def _pole_nn_odplyw(snap: dict[str, Any]) -> dict[str, Any]:
    return next(
        p for p in pola_nn_stacji(snap, _stacja(snap)["ref_id"]) if p["bay_role"] == "FEEDER"
    )


@pytest.mark.parametrize("poziom", ["SN", "nN"])
def test_rename_i_etykieta_pola_przez_jedynego_pisarza(poziom: str) -> None:
    snap = _wstawiona_stacja()
    rekord = _pole_sn(snap, "LINIA_OUT") if poziom == "SN" else _pole_nn_odplyw(snap)
    po_nazwie = _op(
        snap, "rename_element", {"element_ref": rekord["ref_id"], "new_name": "Pole Sady"}
    )
    assert pole(po_nazwie, rekord["ref_id"])["name"] == "Pole Sady"
    po_etykiecie = _op(po_nazwie, "set_label", {"element_ref": rekord["ref_id"], "label": "SADY"})
    assert pole(po_etykiecie, rekord["ref_id"])["feeder_short_name"] == "SADY"
    # Rekord po zmianach dalej przechodzi kontrakt `Bay` (pisarz waliduje).
    EnergyNetworkModel.model_validate(po_etykiecie)


#: Kolekcje modelu, których elementy schemat opisuje NAZWĄ — etykietę (krótką nazwę
#: odpływu) ma wyłącznie pole rozdzielnicy (`Bay.feeder_short_name`).
KOLEKCJE_BEZ_ETYKIETY = ("buses", "branches", "transformers", "sources", "substations")


@pytest.mark.parametrize("kolekcja", KOLEKCJE_BEZ_ETYKIETY)
def test_etykieta_elementu_bez_etykiety_to_odmowa_bez_skutku(kolekcja: str) -> None:
    """Dawniej `set_label` zapisywał klucz `label` na rekordzie elementu spoza pól i meldował
    sukces, a walidacja modelu gubiła ten klucz (kontrakt `ENMElement` go nie ma) — fałszywy
    sukces bez skutku. Teraz: nazwana odmowa, model nietknięty."""
    snap = _wstawiona_stacja()
    element = snap[kolekcja][0]
    wynik = execute_domain_operation(
        snap, "set_label", {"element_ref": element["ref_id"], "label": "ETYKIETA"}
    )
    assert wynik["error_code"] == "label.element_without_label"
    assert element["ref_id"] not in (wynik.get("error") or "")
    assert "nazwę" in (wynik.get("error") or "")
    assert "ETYKIETA" not in str(wynik.get("snapshot") or {})


@pytest.mark.parametrize("poziom", ["SN", "nN"])
def test_update_parametrow_pola(poziom: str) -> None:
    snap = _wstawiona_stacja()
    rekord = _pole_sn(snap, "LINIA_OUT") if poziom == "SN" else _pole_nn_odplyw(snap)
    nowy = _op(
        snap,
        "update_element_parameters",
        {"element_ref": rekord["ref_id"], "parameters": {"name": "Pole 7", "bay_number": "7"}},
    )
    assert pole(nowy, rekord["ref_id"])["bay_number"] == "7"
    # Parametr topologiczny i klucz meta z typowanym odpowiednikiem — odmowa bez skutku.
    for parametry, kod in (
        ({"bay_role": "TR"}, "params.key_not_allowed"),
        ({"terminal_bus_ref": "x"}, "params.key_not_allowed"),
        ({"meta": {"terminal_bus_ref": "x"}}, "params.invalid_value"),
    ):
        wynik = execute_domain_operation(
            copy.deepcopy(snap),
            "update_element_parameters",
            {"element_ref": rekord["ref_id"], "parameters": parametry},
        )
        assert wynik.get("error_code") == kod, (parametry, wynik.get("error"))
        assert wynik.get("snapshot") is None


def test_przypisanie_katalogu_polu_sn_idzie_na_aparat_pola() -> None:
    snap = _wstawiona_stacja()
    rekord = _pole_sn(snap, "LINIA_OUT")
    aparat_ref = rekord["equipment_refs"][0]
    wynik = execute_domain_operation(
        snap,
        "assign_catalog_to_element",
        {"element_ref": rekord["ref_id"], "catalog_item_id": APARAT_SN},
    )
    assert not wynik.get("error"), wynik.get("error")
    nowy = wynik["snapshot"]
    po = pole(nowy, rekord["ref_id"])
    assert po["apparatus_catalog_ref"] == APARAT_SN
    assert po["meta"]["catalog_binding"]["catalog_namespace"] == "APARAT_SN"
    aparat = next(b for b in nowy["branches"] if b["ref_id"] == aparat_ref)
    assert aparat["catalog_ref"] == APARAT_SN
    assert set(wynik["changes"]["updated_element_ids"]) == {rekord["ref_id"], aparat_ref}


@pytest.mark.parametrize(
    ("poziom", "przestrzen", "pozycja", "kod"),
    [
        ("SN", "APARAT_NN", APARAT_NN, "catalog.namespace_mismatch"),
        ("nN", "APARAT_SN", APARAT_SN, "catalog.namespace_mismatch"),
        ("nN", "APARAT_NN", "cb-nie-istnieje", "catalog.item_not_found"),
    ],
)
def test_przypisanie_katalogu_polu_odmowy(
    poziom: str, przestrzen: str, pozycja: str, kod: str
) -> None:
    snap = _wstawiona_stacja()
    rekord = _pole_sn(snap, "LINIA_OUT") if poziom == "SN" else _pole_nn_odplyw(snap)
    wynik = execute_domain_operation(
        snap,
        "assign_catalog_to_element",
        {
            "element_ref": rekord["ref_id"],
            "catalog_item_id": pozycja,
            "catalog_namespace": przestrzen,
        },
    )
    assert wynik.get("error_code") == kod, wynik.get("error")
    assert wynik.get("snapshot") is None


def test_przypisanie_katalogu_polu_nn_bez_aparatu_trafia_do_promocji() -> None:
    """Pole nN przed promocją aparatów nie ma aparatu — wiązanie na polu (`meta.catalog_binding`)
    bierze promocja: aparat powstaje Z POZYCJĄ katalogu (bez ostrzeżenia W061)."""
    snap = _wstawiona_stacja()
    rekord = _pole_nn_odplyw(snap)
    assert rekord["equipment_refs"] == []
    nowy = _op(
        snap,
        "assign_catalog_to_element",
        {"element_ref": rekord["ref_id"], "catalog_item_id": APARAT_NN},
    )
    assert pole(nowy, rekord["ref_id"])["meta"]["catalog_binding"]["catalog_item_id"] == APARAT_NN
    model, _ = przygotuj_model_po_odczycie(EnergyNetworkModel.model_validate(nowy))
    po_promocji = model.model_dump(mode="json")
    pole_po = pole(po_promocji, rekord["ref_id"])
    assert pole_po["equipment_refs"], "promocja nie zapisała aparatu na polu"
    aparat = next(b for b in po_promocji["branches"] if b["ref_id"] == pole_po["equipment_refs"][0])
    assert aparat["catalog_ref"] == APARAT_NN
    assert pole_po["terminal_bus_ref"] == aparat["to_bus_ref"]


@pytest.mark.parametrize("rola", ["FEEDER", "SOURCE"])
def test_add_nn_outgoing_field_z_catalog_ref_zapisuje_wiazanie_dla_promocji(rola: str) -> None:
    """Szablon stacji (`apply.py`) dokłada odpływy z `catalog_ref` — dawniej operacja gubiła
    wskazanie i aparat po promocji był bez wiązania (W061). Iloczyn: rola pola nN × promocja."""
    snap = _wstawiona_stacja()
    stacja = _stacja(snap)
    szyna_nn = next(p["bus_ref"] for p in pola_nn_stacji(snap, stacja["ref_id"]))
    wynik = execute_domain_operation(
        snap,
        "add_nn_outgoing_field",
        {
            "station_ref": stacja["ref_id"],
            "bus_nn_ref": szyna_nn,
            "field_role": rola,
            "catalog_ref": APARAT_NN,
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    ref_pola = wynik["changes"]["created_element_ids"][0]
    nowe = pole(wynik["snapshot"], ref_pola)
    assert nowe["apparatus_catalog_ref"] == APARAT_NN
    assert nowe["meta"]["catalog_binding"] == {
        "catalog_namespace": "APARAT_NN",
        "catalog_item_id": APARAT_NN,
        "catalog_item_version": "2024.1",
    }
    model, _ = przygotuj_model_po_odczycie(EnergyNetworkModel.model_validate(wynik["snapshot"]))
    po = model.model_dump(mode="json")
    aparat = next(b for b in po["branches"] if b["ref_id"] in pole(po, ref_pola)["equipment_refs"])
    assert aparat["catalog_ref"] == APARAT_NN


# ---------------------------------------------------------------------------
# Usuń — pole puste / z zależnościami / kaskada
# ---------------------------------------------------------------------------


def test_usuniecie_pustego_pola_nn() -> None:
    snap = _wstawiona_stacja()
    stacja = _stacja(snap)
    szyna_nn = next(p["bus_ref"] for p in pola_nn_stacji(snap, stacja["ref_id"]))
    snap = _op(
        snap, "add_nn_outgoing_field", {"station_ref": stacja["ref_id"], "bus_nn_ref": szyna_nn}
    )
    rezerwa = pola_nn_stacji(snap, stacja["ref_id"])[-1]
    assert rezerwa["equipment_refs"] == []
    wynik = execute_domain_operation(snap, "delete_element", {"element_ref": rezerwa["ref_id"]})
    assert not wynik.get("error"), wynik.get("error")
    assert pole(wynik["snapshot"], rezerwa["ref_id"]) is None
    assert rezerwa["ref_id"] in wynik["changes"]["deleted_element_ids"]


@pytest.mark.parametrize("zaleznosc", ["aparat", "przekladnik", "zksn"])
def test_usuniecie_pola_z_zaleznosciami_to_odmowa(zaleznosc: str) -> None:
    if zaleznosc == "zksn":
        snap, segment_ref = _seed_with_cable_segment()
        snap = _op(
            snap,
            "insert_zksn_on_segment_sn",
            {
                "segment_id": segment_ref,
                "catalog_ref": "ZKSN-2P-630A",
                "branch_ports_count": 1,
                "switch_state": "closed",
                "insert_at": {"mode": "RATIO", "value": 0.5},
            },
        )
        ref = pola_zksn(snap, snap["branch_points"][0]["ref_id"])[-1]["ref_id"]
    elif zaleznosc == "aparat":
        snap = _wstawiona_stacja()
        ref = _pole_sn(snap, "LINIA_ODG")["ref_id"]
    else:
        snap = _wstawiona_stacja()
        stacja = _stacja(snap)
        szyna_nn = next(p["bus_ref"] for p in pola_nn_stacji(snap, stacja["ref_id"]))
        snap = _op(
            snap, "add_nn_outgoing_field", {"station_ref": stacja["ref_id"], "bus_nn_ref": szyna_nn}
        )
        ref = pola_nn_stacji(snap, stacja["ref_id"])[-1]["ref_id"]
        snap["measurements"] = [
            {
                "ref_id": "ct-x",
                "name": "CT",
                "measurement_type": "CT",
                "bus_ref": szyna_nn,
                "bay_ref": ref,
                "rating": {"ratio_primary": 400.0, "ratio_secondary": 5.0},
            }
        ]
    wynik = execute_domain_operation(snap, "delete_element", {"element_ref": ref})
    assert wynik.get("error_code") == "field.has_dependencies", wynik.get("error")
    assert ref not in str(wynik.get("error"))  # komunikat nazwami, nie identyfikatorem


def test_kaskada_usuniecia_czysci_rekordy_pol() -> None:
    snap = _wstawiona_stacja()
    stacja = _stacja(snap)
    rekord = _pole_sn(snap, "LINIA_ODG")
    aparat_ref = rekord["equipment_refs"][0]
    # Aparat skasowany → wypada z `equipment_refs` pola, pole zostaje.
    po_aparacie = _op(snap, "delete_element", {"element_ref": aparat_ref})
    assert pole(po_aparacie, rekord["ref_id"])["equipment_refs"] == []
    # Zacisk skasowany → pole przestaje wskazywać szynę, której nie ma.
    po_zacisku = _op(po_aparacie, "delete_element", {"element_ref": rekord["terminal_bus_ref"]})
    assert pole(po_zacisku, rekord["ref_id"])["terminal_bus_ref"] is None
    # Stacja skasowana → wszystkie jej pola znikają (pole nie istnieje bez właściciela).
    po_stacji = execute_domain_operation(
        po_zacisku, "delete_element", {"element_ref": stacja["ref_id"]}
    )
    assert not po_stacji.get("error"), po_stacji.get("error")
    assert pola_stacji(po_stacji["snapshot"], stacja["ref_id"]) == []
    EnergyNetworkModel.model_validate(po_stacji["snapshot"])


def test_kaskada_punktu_rozgalezienia_zabiera_pola_zksn() -> None:
    snap, segment_ref = _seed_with_cable_segment()
    snap = _op(
        snap,
        "insert_zksn_on_segment_sn",
        {
            "segment_id": segment_ref,
            "catalog_ref": "ZKSN-2P-630A",
            "branch_ports_count": 2,
            "switch_state": "closed",
            "insert_at": {"mode": "RATIO", "value": 0.5},
        },
    )
    punkt = snap["branch_points"][0]["ref_id"]
    assert len(pola_zksn(snap, punkt)) == 4
    wynik = execute_domain_operation(snap, "delete_element", {"element_ref": punkt})
    assert not wynik.get("error"), wynik.get("error")
    assert pola_zksn(wynik["snapshot"], punkt) == []


# ---------------------------------------------------------------------------
# Pole źródła przekształtnika na szynie SN — pole SN z aparatem w torze
# ---------------------------------------------------------------------------


def test_pole_zrodla_przeksztaltnika_na_szynie_sn_ma_aparat_w_torze() -> None:
    """Rozstrzygnięcie integratora W5-B: falownik SN za transformatorem blokowym dostaje pole SN
    z zaciskiem i aparatem (ta sama droga co pole źródłowe DER-SN), źródło stoi na zacisku.

    Transformator stacji 1250 kVA: kontrola mocy źródeł za wspólnym transformatorem
    (integracja PR477-481) liczy dwa źródła po 550 kVA = 1100 kVA — przy 630 kVA drugie
    źródło jest słusznie odmówione, a test ćwiczy numerację drugiego, DOPUSZCZALNEGO źródła."""
    baza, segment_ref, _ = _build_trunk_with_segment()
    ladunek = _insert_payload(segment_ref, SKLAD_POL)
    ladunek["transformer"]["transformer_catalog_ref"] = "tr-sn-nn-15-04-1250kva-dyn11"
    snap = _op(baza, "insert_station_on_segment_sn", ladunek)
    stacja = _stacja(snap)
    transformator = next(
        t for t in snap["transformers"] if t["ref_id"] in stacja["transformer_refs"]
    )
    wynik = execute_domain_operation(
        snap,
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "block_transformer",
            "catalog_ref": "conv-pv-0.5mw-15kv",
            "station_ref": stacja["ref_id"],
            "blocking_transformer_ref": transformator["ref_id"],
            "bus_nn_ref": transformator["hv_bus_ref"],
            "placement": "NEW_FIELD",
        },
    )
    assert not wynik.get("error"), f"{wynik.get('error_code')}: {wynik.get('error')}"
    nowy = wynik["snapshot"]
    generator = nowy["generators"][-1]
    pole_zrodla = pole(nowy, generator["meta"]["field_ref"])
    assert not czy_pole_nn(nowy, pole_zrodla)
    assert pole_zrodla["terminal_bus_ref"] and pole_zrodla["equipment_refs"]
    assert generator["bus_ref"] == pole_zrodla["terminal_bus_ref"]
    aparat = next(b for b in nowy["branches"] if b["ref_id"] == pole_zrodla["equipment_refs"][0])
    assert aparat["from_bus_ref"] == pole_zrodla["bus_ref"]
    assert aparat["to_bus_ref"] == pole_zrodla["terminal_bus_ref"]
    # Drugie identyczne źródło: kolejny numer liczony po szynie pola — bez dubli refów.
    drugi = execute_domain_operation(
        nowy,
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "block_transformer",
            "catalog_ref": "conv-pv-0.5mw-15kv",
            "station_ref": stacja["ref_id"],
            "blocking_transformer_ref": transformator["ref_id"],
            "bus_nn_ref": transformator["hv_bus_ref"],
            "placement": "NEW_FIELD",
        },
    )
    assert not drugi.get("error"), drugi.get("error")
    refy = [g["ref_id"] for g in drugi["snapshot"]["generators"]]
    assert len(refy) == len(set(refy)) == 2
    refy_pol = [p["ref_id"] for p in drugi["snapshot"]["bays"]]
    assert len(refy_pol) == len(set(refy_pol))


# ---------------------------------------------------------------------------
# Wczytaj z archiwum — dawne klucze → migracja → te same rekordy co świeża budowa
# ---------------------------------------------------------------------------


def _do_dawnych_kluczy(snap: dict[str, Any]) -> dict[str, Any]:
    """Odwzorowanie świeżo zbudowanej migawki na kształt sprzed W5-B: pola stacji jako wpisy
    dawnych słowników pól SN i nN w `meta` stacji (klucze dawnego wpisu, zacisk w `meta`)."""
    dawna = copy.deepcopy(snap)
    stacje = {s["ref_id"]: s for s in dawna["substations"]}
    pozostale = []
    for rekord in dawna["bays"]:
        stacja = stacje.get(rekord.get("substation_ref") or "")
        if stacja is None:
            pozostale.append(rekord)
            continue
        wpis: dict[str, Any] = {
            "field_ref": rekord["ref_id"],
            "name": rekord["name"],
            "bay_role": rekord["bay_role"],
            "bus_ref": rekord["bus_ref"],
            "equipment_refs": rekord["equipment_refs"],
            "protection_ref": rekord["protection_ref"],
            "tags": rekord["tags"],
            "meta": {
                **rekord["meta"],
                **(
                    {"terminal_bus_ref": rekord["terminal_bus_ref"]}
                    if rekord["terminal_bus_ref"]
                    else {}
                ),
                **({"field_role": rekord["field_role"]} if rekord["field_role"] else {}),
            },
        }
        for klucz in (
            "gpz_section_id",
            "protection_codes",
            "bay_template_ref",
            "switchgear_family_ref",
            "manufacturer_ref",
            "apparatus_catalog_ref",
            "config_id",
            "primary_devices",
            "funkcja_pomiaru",
            "rodzaj_pomiaru",
            "catalog_bindings",
            "surge_arresters",
        ):
            if rekord.get(klucz) not in (None, [], {}):
                wpis[klucz] = rekord[klucz]
        if rekord.get("metadane_pochodzenia"):
            wpis.update({k: v for k, v in rekord["metadane_pochodzenia"].items() if v})
        if rekord.get("wybor_bloku"):
            wpis.update({k: v for k, v in rekord["wybor_bloku"].items() if v is not None})
        klucz_stacji = KLUCZ_NN if czy_pole_nn(snap, rekord) else KLUCZ_SN
        stacja.setdefault("meta", {}).setdefault(klucz_stacji, []).append(wpis)
    dawna["bays"] = pozostale
    return dawna


@pytest.mark.parametrize("droga", ["wciecie", "koniec_ciagu"])
def test_archiwum_z_dawnymi_kluczami_daje_te_same_rekordy_co_swieza_budowa(droga: str) -> None:
    swieza = _wstawiona_stacja() if droga == "wciecie" else _stacja_konca()
    dawna = _do_dawnych_kluczy(swieza)
    # Model z dawnymi kluczami wczytany przez TĘ SAMĄ funkcję wejścia, którą biegnie magazyn.
    z_archiwum, zmieniono = przygotuj_model_po_odczycie(EnergyNetworkModel.model_validate(dawna))
    ze_swiezej, _ = przygotuj_model_po_odczycie(EnergyNetworkModel.model_validate(swieza))
    assert zmieniono is True
    a = sorted(_bez_id(z_archiwum.model_dump(mode="json")["bays"]), key=lambda r: r["ref_id"])
    b = sorted(_bez_id(ze_swiezej.model_dump(mode="json")["bays"]), key=lambda r: r["ref_id"])
    assert a == b
    for stacja in z_archiwum.model_dump(mode="json")["substations"]:
        assert KLUCZ_SN not in stacja["meta"] and KLUCZ_NN not in stacja["meta"]


def test_wyposazenie_pola_wskazuje_rekord_pola() -> None:
    """Przekładniki i zabezpieczenie pola z kreatora stacji wskazują rekord pola (`bay_ref`
    = `Bay.ref_id`), a pole niesie referencję zabezpieczenia."""
    snap, segment_ref, _ = _build_trunk_with_segment()
    snap = _op(
        snap,
        "insert_station_on_segment_sn",
        _insert_payload(
            segment_ref,
            [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT", "equipment": _wyposazenie()},
                {"field_role": "TRANSFORMATOROWE"},
            ],
        ),
    )
    rekord = _pole_sn(snap, "LINIA_OUT")
    assert all(m["bay_ref"] == rekord["ref_id"] for m in snap["measurements"])
    assert rekord["protection_ref"] in {p["ref_id"] for p in snap["protection_assignments"]}


# ---------------------------------------------------------------------------
# GPZ w paśmie nN (sieć CIGRE LV 0,4 kV) × odejście magistrali × zajętość pola
# ---------------------------------------------------------------------------


def _gpz_04kv() -> dict[str, Any]:
    """GPZ ekwiwalentu ręcznego 0,4 kV — tak samo jak bliźniak CIGRE LV (`kompilator_grafu`)."""
    snap = pusty_enm(name="GPZ 0,4 kV", sn_nominal_kv=0.4)
    return _op(
        snap,
        "add_grid_source_sn",
        {
            "voltage_kv": 0.4,
            "manual_equivalent": {
                "sn_voltage_kv": 0.4,
                "sk3_mva": 5.0,
                "rx_ratio": 0.1,
            },
            "line_fields_count": 2,
            "source_name": "LV MAIN",
        },
    )


def _odejscie(snap: dict[str, Any], field_ref: str, nazwa: str) -> dict[str, Any]:
    return execute_domain_operation(
        enm_dict=snap,
        op_name="continue_trunk_segment_sn",
        payload={
            "field_ref": field_ref,
            "segment": {
                "rodzaj": "LINIA",
                "dlugosc_m": 35.0,
                "name": nazwa,
                "catalog_ref": "bench_cigrelv_l-main-01",
                "bus_name": nazwa,
            },
        },
    )


def test_pola_gpz_w_pasmie_nn_sa_polami_magistrali_nie_nn() -> None:
    """Dawna kolekcja dawny słownik pól nN nigdy nie zawierała pól GPZ; predykat poziomu musi
    zachować tę równoważność także dla GPZ 0,4 kV — inaczej odejście magistrali, zajętość pól,
    walidator i scena traktowałyby pola GPZ jako odpływy nN."""
    snap = _gpz_04kv()
    gpz = next(s for s in snap["substations"] if s.get("station_type") == "gpz")
    pola_gpz = pola_stacji(snap, gpz["ref_id"])
    assert pola_gpz, "GPZ musi mieć pola"
    szyny_nn = {b["ref_id"] for b in snap["buses"] if 0 < float(b["voltage_kv"]) <= 1.0}
    assert {p["bus_ref"] for p in pola_gpz} <= szyny_nn, "warunek iloczynu: szyna w paśmie nN"
    assert not any(czy_pole_nn(snap, p) for p in pola_gpz)
    assert pola_sn_stacji(snap, gpz["ref_id"]) == pola_gpz
    assert pola_nn_stacji(snap, gpz["ref_id"]) == []


def test_odejscie_z_pola_gpz_04kv_i_odmowa_drugiego_kabla_z_tego_samego_pola() -> None:
    snap = _gpz_04kv()
    linia = next(p for p in pola(snap) if "gpz_line_field" in (p.get("tags") or []))
    pierwsze = _odejscie(snap, linia["ref_id"], "BUS-LV-01")
    assert pierwsze.get("error") is None, pierwsze.get("error")
    drugie = _odejscie(pierwsze["snapshot"], linia["ref_id"], "BUS-LV-02")
    assert drugie.get("error_code") == KOD_POLE_ZAJETE, drugie


@pytest.mark.parametrize("usuwany", ["stacja", "aparat_pola"])
def test_kaskada_usuniecia_zabiera_przekladniki_i_zabezpieczenia_pola(usuwany: str) -> None:
    """Przekładnik stoi na szynie i wskazuje pole, zabezpieczenie działa na wyłącznik pola —
    usunięcie stacji (szyny i pola) albo aparatu pola nie zostawia odwołań do elementów, których
    nie ma (KLASA odwołań: `Measurement.bus_ref`/`bay_ref`, `ProtectionAssignment.breaker_ref`)."""
    snap = _wstawiona_stacja()
    stacja = _stacja(snap)
    rekord = _pole_sn(snap, "LINIA_ODG")
    for op, ladunek in (
        ("add_ct", {"catalog_ref": CT_REF, "ratio_primary_a": 400.0, "ratio_secondary_a": 5.0}),
        ("add_vt", {"catalog_ref": VT_REF, "ratio_primary_v": 15000.0, "ratio_secondary_v": 100.0}),
        ("add_relay", {"catalog_ref": RELAY_REF, "relay_type": "NADPRADOWY"}),
    ):
        snap = _op(snap, op, {"bay_ref": rekord["ref_id"], **ladunek})
    assert snap["measurements"] and snap["protection_assignments"]
    cel = stacja["ref_id"] if usuwany == "stacja" else rekord["equipment_refs"][0]
    wynik = execute_domain_operation(snap, "delete_element", {"element_ref": cel})
    assert not wynik.get("error"), wynik.get("error")
    po = wynik["snapshot"]
    szyny = {b["ref_id"] for b in po["buses"]}
    galezie = {b["ref_id"] for b in po["branches"]}
    pola_po = {b["ref_id"] for b in po["bays"]}
    for m in po.get("measurements", []):
        assert m["bus_ref"] in szyny, m
        assert m.get("bay_ref") is None or m["bay_ref"] in pola_po, m
    for pa in po.get("protection_assignments", []):
        assert pa["breaker_ref"] in galezie, pa
    if usuwany == "aparat_pola":
        assert po["protection_assignments"] == []
    EnergyNetworkModel.model_validate(po)
