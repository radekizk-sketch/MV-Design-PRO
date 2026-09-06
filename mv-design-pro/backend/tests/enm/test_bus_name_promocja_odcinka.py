"""Promocja nowej szyny magistrali/odgałęzienia SN (`segment.bus_name`, CV-4.3 K1).

`continue_trunk_segment_sn`/`start_branch_segment_sn` domyślnie tagują nową
szynę "downstream"/"branch_end" jako `helper_bus` — anonimowy, ukryty
(`render_on_sld=False`, `show_in_project_tree=False`) punkt techniczny
WYKLUCZONY z celów zwarcia (`enm/assembler.py::skip_short_circuit_target`).
To poprawne dla przyrostowej edycji kreatora SLD, ale BŁĘDNE, gdy wołający
od razu wie, że ta szyna jest realnym, nazwanym punktem sieci (np. builder
sieci benchmarkowej `application/reference_networks/enm_builders/`, gdzie
KAŻDA szyna jest gotowym punktem literatury) — znalezisko: sieć czysto
zwarciowa `iec60909_example` miała szynę BUS-MV wykluczoną z celów zwarcia,
co czyniło ją NIE-weryfikowalną wyrocznią (b)/(c) tej karty.

`segment.bus_name` (opcjonalne, obie operacje — KLASA NIE INSTANCJA, ta sama
naprawa w obu miejscach tworzących "gołą" szynę jako efekt uboczny dodania
gałęzi): gdy podane, nowa szyna dostaje TĘ nazwę, traci tag `helper_bus` i
odzyskuje widoczność (`render_on_sld=True`, `show_in_project_tree=True`) —
dokładnie ten sam zestaw zmian co promocja szyny końcowej do szyny stacyjnej
w `append_station_on_endpoint` (Step 5). Bez `bus_name` — ZERO zmiany
zachowania (test pary bez/z, reguła KLASA §3 "predykaty parami": oba stany
z JEDNEGO źródła prawdy — `is_named_bus = bool(bus_name)`).

Testy pokrywają iloczyn cech: (continue_trunk × start_branch) × (bez bus_name
× z bus_name) × (tagowanie × raportowalność zwarcia rzeczywistym torem
kanonicznym, nie tylko odczyt tagu).
"""

from __future__ import annotations

from typing import Any

from application.reference_networks.enm_builders._kernel import (
    dodaj_zrodlo_slack,
    kontynuuj_z_pola,
    kontynuuj_z_szyny,
    rozpocznij_z_pola,
)
from enm.assembler import zloz_wejscie_zwarcia
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_LINE = "line-base-al-st-70"


def _pusty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="bus_name_promocja", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def _bus(enm: dict[str, Any], ref_id: str) -> dict[str, Any]:
    return next(b for b in enm["buses"] if b["ref_id"] == ref_id)


def _siec_z_gpz(*, line_fields_count: int) -> tuple[dict[str, Any], str]:
    """GPZ (15 kV, Sk3=250 MVA) z `line_fields_count` polami liniowymi wolnymi."""
    enm, bus_gpz = dodaj_zrodlo_slack(
        _pusty_enm(),
        voltage_kv=15.0,
        sk3_mva=250.0,
        rx_ratio=0.1,
        line_fields_count=line_fields_count,
    )
    return enm, bus_gpz


def _gpz_pole(enm: dict[str, Any], index: int) -> dict[str, Any]:
    substation = next(s for s in enm["substations"] if str(s["ref_id"]).startswith("gpz/"))
    fields = [
        spec
        for spec in substation["meta"]["field_specs"]
        if "gpz_line_field" in (spec.get("tags") or [])
    ]
    fields.sort(key=lambda f: f["meta"]["gpz_line_field_index"])
    return fields[index]


# ---------------------------------------------------------------------------
# continue_trunk_segment_sn
# ---------------------------------------------------------------------------


def test_continue_trunk_bez_bus_name_zachowuje_domyslny_scaffold() -> None:
    enm, _bus_gpz = _siec_z_gpz(line_fields_count=1)
    pole = _gpz_pole(enm, 0)
    enm, downstream_ref = kontynuuj_z_pola(
        enm, field_ref=pole["field_ref"], catalog_ref=CATALOG_LINE, dlugosc_m=500.0, name="L1"
    )
    bus = _bus(enm, downstream_ref)
    assert sorted(bus["tags"]) == ["helper_bus", "topology_terminal"]
    assert bus["meta"]["render_on_sld"] is False
    assert bus["meta"]["show_in_project_tree"] is False
    assert bus["name"] == "Zacisk końcowy L1"


def test_continue_trunk_z_bus_name_promuje_szyne() -> None:
    enm, _bus_gpz = _siec_z_gpz(line_fields_count=1)
    pole = _gpz_pole(enm, 0)
    enm, downstream_ref = kontynuuj_z_pola(
        enm,
        field_ref=pole["field_ref"],
        catalog_ref=CATALOG_LINE,
        dlugosc_m=500.0,
        name="L1",
        bus_name="BUS-2",
    )
    bus = _bus(enm, downstream_ref)
    assert bus["tags"] == ["topology_terminal"]
    assert "helper_bus" not in bus["tags"]
    assert bus["meta"]["render_on_sld"] is True
    assert bus["meta"]["show_in_project_tree"] is True
    assert bus["name"] == "BUS-2"


# ---------------------------------------------------------------------------
# start_branch_segment_sn (KLASA NIE INSTANCJA — sama naprawa co powyżej)
# ---------------------------------------------------------------------------


def test_start_branch_bez_bus_name_zachowuje_domyslny_scaffold() -> None:
    enm, _bus_gpz = _siec_z_gpz(line_fields_count=1)
    pole = _gpz_pole(enm, 0)
    enm, branch_end_ref = rozpocznij_z_pola(
        enm, field_ref=pole["field_ref"], catalog_ref=CATALOG_LINE, dlugosc_m=300.0, name="BR1"
    )
    bus = _bus(enm, branch_end_ref)
    assert sorted(bus["tags"]) == ["helper_bus", "topology_terminal"]
    assert bus["meta"]["render_on_sld"] is False
    assert bus["meta"]["show_in_project_tree"] is False
    assert bus["name"] == "Szyna odgałęzienia"


def test_start_branch_z_bus_name_promuje_szyne() -> None:
    enm, _bus_gpz = _siec_z_gpz(line_fields_count=1)
    pole = _gpz_pole(enm, 0)
    enm, branch_end_ref = rozpocznij_z_pola(
        enm,
        field_ref=pole["field_ref"],
        catalog_ref=CATALOG_LINE,
        dlugosc_m=300.0,
        name="BR1",
        bus_name="BUS-3",
    )
    bus = _bus(enm, branch_end_ref)
    assert bus["tags"] == ["topology_terminal"]
    assert "helper_bus" not in bus["tags"]
    assert bus["meta"]["render_on_sld"] is True
    assert bus["meta"]["show_in_project_tree"] is True
    assert bus["name"] == "BUS-3"


# ---------------------------------------------------------------------------
# Skutek rzeczywisty: raportowalność dla zwarcia w torze kanonicznym
# (deklaracja bez testu = falszywa pewnosc — regula KLASA §4).
# ---------------------------------------------------------------------------


def test_bus_name_czyni_szyne_raportowalna_dla_zwarcia_w_torze_kanonicznym() -> None:
    """Para: bez `bus_name` wykluczona, z `bus_name` raportowalna — JEDNO źródło
    prawdy (`skip_short_circuit_target = "helper_bus" in tags`), oba stany
    zweryfikowane przez REALNY montaż wejścia zwarciowego, nie odczyt tagu."""
    enm, _bus_gpz = _siec_z_gpz(line_fields_count=2)
    pole0 = _gpz_pole(enm, 0)
    enm, anonimowa_ref = kontynuuj_z_pola(
        enm, field_ref=pole0["field_ref"], catalog_ref=CATALOG_LINE, dlugosc_m=500.0, name="L1"
    )
    pole1 = _gpz_pole(enm, 1)
    enm, nazwana_ref = rozpocznij_z_pola(
        enm,
        field_ref=pole1["field_ref"],
        catalog_ref=CATALOG_LINE,
        dlugosc_m=400.0,
        name="L2",
        bus_name="BUS-3",
    )

    wejscie = zloz_wejscie_zwarcia(enm, {"fault_type": "3F"})

    from enm.mapping import _ref_to_uuid

    anonimowy_node_id = _ref_to_uuid(anonimowa_ref)
    nazwany_node_id = _ref_to_uuid(nazwana_ref)
    assert (
        anonimowy_node_id not in wejscie.reportable_fault_node_ids
    ), "szyna BEZ bus_name musi zostac anonimowym scaffoldem — wykluczona z celow zwarcia"
    assert (
        nazwany_node_id in wejscie.reportable_fault_node_ids
    ), "szyna Z bus_name musi byc raportowalnym celem zwarcia"


def test_bus_name_z_kontynuuj_z_szyny_tez_promuje() -> None:
    """`kontynuuj_z_szyny` (odejście z DOWOLNEJ zwykłej szyny) dzieli mechanizm
    z `kontynuuj_z_pola` (ta sama operacja domenowa `continue_trunk_segment_sn`,
    inny sposób resolvowania `from_terminal_id`) — promocja musi działać tu też."""
    enm, _bus_gpz = _siec_z_gpz(line_fields_count=1)
    pole = _gpz_pole(enm, 0)
    enm, bus2_ref = kontynuuj_z_pola(
        enm,
        field_ref=pole["field_ref"],
        catalog_ref=CATALOG_LINE,
        dlugosc_m=500.0,
        name="L1",
        bus_name="BUS-2",
    )
    enm, bus3_ref = kontynuuj_z_szyny(
        enm,
        from_bus_ref=bus2_ref,
        catalog_ref=CATALOG_LINE,
        dlugosc_m=300.0,
        name="L2",
        bus_name="BUS-3",
    )
    bus3 = _bus(enm, bus3_ref)
    assert bus3["tags"] == ["topology_terminal"]
    assert bus3["meta"]["render_on_sld"] is True
    assert bus3["name"] == "BUS-3"


def test_bus_name_rozne_wywolania_z_tej_samej_szyny_bez_kolizji() -> None:
    """Dwa odejścia z TEJ SAMEJ szyny, IDENTYCZNY rodzaj/długość/katalog/nazwa
    odcinka, RÓŻNE `bus_name` — musi dać DWA różne ref_id (bus_name wchodzi do
    seed, dokładnie jak catalog_ref/segment_name naprawione wcześniej w tej
    karcie dla tej samej klasy kolizji)."""
    enm, _bus_gpz = _siec_z_gpz(line_fields_count=1)
    pole = _gpz_pole(enm, 0)
    enm, bus2_ref = kontynuuj_z_pola(
        enm, field_ref=pole["field_ref"], catalog_ref=CATALOG_LINE, dlugosc_m=500.0, name="L1"
    )
    result_a = execute_domain_operation(
        enm_dict=enm,
        op_name="continue_trunk_segment_sn",
        payload={
            "from_terminal_id": bus2_ref,
            "segment": {
                "rodzaj": "LINIA",
                "dlugosc_m": 250.0,
                "catalog_ref": CATALOG_LINE,
                "bus_name": "BUS-3A",
            },
        },
    )
    assert not result_a.get("error"), result_a.get("error")
    ref_a = result_a["snapshot"]["branches"][-1]["to_bus_ref"]
    # Drugie wywołanie ŁAŃCUCHOWANE na snapshot PIERWSZEGO (nie na wspólnym
    # przodku) — to jest rzeczywisty test braku kolizji: gdyby seed nie
    # uwzględniał bus_name, drugie wywołanie odrzuciłoby "ref_id już istnieje".
    result_b = execute_domain_operation(
        enm_dict=result_a["snapshot"],
        op_name="continue_trunk_segment_sn",
        payload={
            "from_terminal_id": bus2_ref,
            "segment": {
                "rodzaj": "LINIA",
                "dlugosc_m": 250.0,
                "catalog_ref": CATALOG_LINE,
                "bus_name": "BUS-3B",
            },
        },
    )
    assert not result_b.get("error"), result_b.get("error")
    ref_b = result_b["snapshot"]["branches"][-1]["to_bus_ref"]
    assert ref_a != ref_b
    assert _bus(result_b["snapshot"], ref_a)["name"] == "BUS-3A"
    assert _bus(result_b["snapshot"], ref_b)["name"] == "BUS-3B"
