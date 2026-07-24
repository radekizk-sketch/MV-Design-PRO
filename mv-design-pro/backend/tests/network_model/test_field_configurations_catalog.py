"""W1c — katalog konfiguracji pól (macierz generatywna, RECENZJA_MACIERZ_
WYPOSAZENIA_2026-07 uwagi 10/15/16/17/18). Wyrocznie SILNIKA katalogu: kolejność
aparatów == kolejność kanoniczna, aparaty boczne (ES/VT/SA) poza torem głównym,
determinizm, stabilny `config_ref` (uwaga 10) oraz ANTY-DRYF komitowanego JSON
(jedno źródło logiki — enumeracja backendu, frontend tylko konsumuje).
"""

from __future__ import annotations

import json
from pathlib import Path

from network_model.catalog.bay_templates import (
    config_ref_for_template,
    enumerate_canonical_configurations,
    functional_group_for_role,
)
from reference_engine.field_configuration_catalog import (
    enumerate_field_configurations,
    producer_cell_primary_devices,
)

_LATERAL = {"ES", "VT", "SURGE_ARRESTER"}
_MAIN_ORDER = ["DS", "LOAD_SWITCH", "CB", "FUSE", "CT", "DS", "CABLE_HEAD", "TRANSFORMER_DEVICE"]

CATALOG_JSON = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "ui"
    / "sld"
    / "v3"
    / "scene"
    / "__tests__"
    / "fixtures"
    / "fieldConfigurationsCatalog.json"
)


def _is_subsequence(seq: list[str], template: list[str]) -> bool:
    it = iter(template)
    return all(any(item == t for t in it) for item in seq)


def test_canonical_enumeration_covers_registry() -> None:
    """Każdy kanoniczny szablon pola staje się przypadkiem macierzy (uwaga 16)."""
    configs = enumerate_canonical_configurations()
    refs = {c["config_ref"] for c in configs}
    # 10 szablonów + 2 warianty pola źródłowego SN (W2b).
    assert config_ref_for_template("bay_template_line_in") in refs
    assert config_ref_for_template("bay_template_transformer") in refs
    assert "kanoniczny:mv_source_cb" in refs
    assert "kanoniczny:mv_source_lbs" in refs
    assert len(configs) == 12


def test_enumeration_is_deterministic() -> None:
    """Ten sam katalog ⇒ identyczny wynik (uwaga 16, Determinism Rule)."""
    assert enumerate_field_configurations() == enumerate_field_configurations()


def test_config_ref_stable_and_prefixed() -> None:
    """Stabilny identyfikator konfiguracji (uwaga 10): prefiks źródła, bez stanu."""
    catalog = enumerate_field_configurations()
    for c in catalog["canonical"]:
        assert c["config_ref"].startswith("kanoniczny:")
    for c in catalog["producer"]:
        assert c["config_ref"].startswith("producent:")


def test_main_path_order_is_canonical() -> None:
    """WYROCZNIA (uwaga 18): kolejność aparatów TORU GŁÓWNEGO == podciąg kanonicznej
    kolejności; aparaty boczne (ES/VT/SA) NIGDY w torze głównym (§18.1)."""
    catalog = enumerate_field_configurations()
    for c in catalog["canonical"] + catalog["producer"]:
        devices = c["primary_devices"]
        main = [d["kind"] for d in devices if d["placement"] not in ("GROUND_BRANCH", "OFF_PATH")]
        assert _is_subsequence(main, _MAIN_ORDER), c["config_ref"]
        # Aparaty boczne poza osią toru głównego.
        for d in devices:
            if d["kind"] in _LATERAL:
                assert d["placement"] in ("GROUND_BRANCH", "OFF_PATH"), c["config_ref"]


def test_ground_branch_devices_have_earthing_role() -> None:
    """ES/SA jako odgałęzienie doziemne (uwaga 6) niosą `earthing_role` (§12.5)."""
    catalog = enumerate_field_configurations()
    for c in catalog["canonical"] + catalog["producer"]:
        for d in c["primary_devices"]:
            if d["kind"] == "ES":
                assert d.get("earthing_role") == "field_earth", c["config_ref"]
            if d["kind"] == "SURGE_ARRESTER":
                assert d.get("earthing_role") == "surge_ground", c["config_ref"]


def test_producer_bridge_orders_unordered_apparatus() -> None:
    """Most producencki porządkuje NIEUPORZĄDKOWANY zbiór aparatów wg toru (uwaga 3).
    Wejście świadomie w złej kolejności — wyjście kanoniczne."""
    devices = producer_cell_primary_devices(
        ["ES", "CABLE_HEAD", "CT", "CB", "DS", "VT"], config_ref="test:cell"
    )
    main = [d["kind"] for d in devices if d["placement"] not in ("GROUND_BRANCH", "OFF_PATH")]
    assert main == ["DS", "CB", "CT", "CABLE_HEAD"]
    lateral = [d["kind"] for d in devices if d["placement"] in ("GROUND_BRANCH", "OFF_PATH")]
    assert lateral == ["ES", "VT"]


def test_producer_double_ds_gets_distinct_designations() -> None:
    """Celka z DWOMA odłącznikami: szynowy Q1 (UPSTREAM), liniowy Q2 (DOWNSTREAM)."""
    devices = producer_cell_primary_devices(
        ["DS", "CB", "CT", "DS", "CABLE_HEAD"], config_ref="test:cell2"
    )
    ds = [d for d in devices if d["kind"] == "DS"]
    assert len(ds) == 2
    assert (ds[0]["placement"], ds[0]["designation"]) == ("UPSTREAM", "Q1")
    assert (ds[1]["placement"], ds[1]["designation"]) == ("DOWNSTREAM", "Q2")


def test_gap_register_is_honest() -> None:
    """Rejestr braków JAWNY (uwagi 9/16): packi bez celek, typy pól bez szablonu,
    celki bez toru głównego — zero cichych pominięć."""
    gaps = enumerate_field_configurations()["gaps"]
    assert "elektrometal_e2alpha" in gaps["manufacturer_packs_without_cell_configurations"]
    assert "bateria_kondensatorow" in gaps["field_types_without_template"]
    assert "generator_synchroniczny" in gaps["field_types_without_template"]
    # Celki złożone wyłącznie z aparatów bocznych (np. moduł uziemnika szyn).
    assert all(ref.startswith("producent:") for ref in gaps["producer_cells_without_main_path"])


def test_functional_grouping_from_role() -> None:
    """Grupowanie funkcjonalne (uwaga 15) z roli pola — dana katalogowa."""
    assert functional_group_for_role("IN") == "liniowe"
    assert functional_group_for_role("TR") == "transformatorowe"
    assert functional_group_for_role("OZE") == "OZE"
    assert functional_group_for_role("COUPLER") == "sprzeglowe"
    assert functional_group_for_role("MEASUREMENT") == "pomiarowe"
    assert functional_group_for_role("FEEDER") == "specjalne"


def test_committed_json_matches_enumeration() -> None:
    """ANTY-DRYF: komitowany artefakt frontendu == żywy wynik enumeracji backendu.
    Regeneruj `scripts/gen_field_configurations_catalog.py` po zmianie katalogu."""
    assert CATALOG_JSON.exists(), f"Brak artefaktu {CATALOG_JSON} — uruchom generator."
    on_disk = json.loads(CATALOG_JSON.read_text(encoding="utf-8"))
    live = json.loads(json.dumps(enumerate_field_configurations()))
    assert on_disk == live, "Artefakt katalogu rozjechał się z enumeracją — regeneruj JSON."
