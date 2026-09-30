"""
CGMES `_elements_without_catalog` czyta `catalog.governance.wymagalnosc_katalogu`
— karta W3-I (§0.15 karty konwergencji fizyki, 2026-09-09).

Defekt nazwany w meldunku karty: PRZED tą kartą `_elements_without_catalog`
(strona side-car, lossless round-trip) nie znała wyjątku `parameter_source ==
"MANUAL_EQUIVALENT"` (K1.2) — źródło z jawnym Sk''/RX, poprawne wg walidatora
E009, wracało z round-tripu CGMES oznaczone `CATALOG_MAPPING_REQUIRED`, mimo że
ten sam model przechodzi `ENMValidator` bez BLOCKER-a. Ten test przypina
naprawę: źródło MANUAL_EQUIVALENT z KOMPLETNYMI danymi zwarciowymi (Sk''/RX)
przeżywa round-trip CGMES jako `SUCCESS`, tak jak przeżywa walidację E009.
"""

from __future__ import annotations

from application.cgmes.service import export_cgmes, import_cgmes
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source
from enm.validator import ENMValidator
from infrastructure.cgmes.cgmes_importer import CgmesImportStatus, import_from_side_car
from infrastructure.cgmes.refmap import CgmesRefMap


def _enm_ze_zrodlem_manual_equivalent() -> EnergyNetworkModel:
    """Model z JEDNYM źródłem `MANUAL_EQUIVALENT`, `catalog_ref=None`, dane
    zwarciowe KOMPLETNE (Sk''/RX) — dokładnie ścieżka `add_grid_source_sn.
    manual_equivalent` (K1.2)."""
    return EnergyNetworkModel(
        header=ENMHeader(name="CGMES manual_equivalent"),
        buses=[Bus(ref_id="bus_gpz", name="GPZ", voltage_kv=15.0)],
        sources=[
            Source(
                ref_id="src_manual",
                name="Źródło ręczny ekwiwalent",
                bus_ref="bus_gpz",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
                catalog_ref=None,
                source_mode="EKSPERCKI_RECZNY",
                parameter_source="MANUAL_EQUIVALENT",
            )
        ],
    )


def test_zrodlo_manual_equivalent_przechodzi_walidator_e009() -> None:
    """Punkt odniesienia: E009 JUŻ dziś respektuje ten wyjątek (K1.2) — round-trip
    CGMES musi dawać TEN SAM werdykt."""
    enm = _enm_ze_zrodlem_manual_equivalent()
    wynik = ENMValidator().validate(enm)
    kody_blocker = {issue.code for issue in wynik.issues if issue.severity == "BLOCKER"}
    assert "E009" not in kody_blocker


def test_zrodlo_manual_equivalent_przezywa_round_trip_cgmes_side_car() -> None:
    """Naprawa karty W3-I: eksport -> import (side-car, lossless) NIE oznacza
    źródła `MANUAL_EQUIVALENT` jako wymagającego mapowania katalogowego."""
    enm = _enm_ze_zrodlem_manual_equivalent()

    archiwum = export_cgmes(enm)
    wynik = import_cgmes(archiwum, prefer_side_car=True)

    assert wynik.used_side_car is True
    assert wynik.status == CgmesImportStatus.SUCCESS
    assert "src_manual" not in wynik.elements_without_catalog
    assert wynik.catalog_mapping_required is False


def test_zrodlo_bez_wyjatku_dalej_oznaczone_wymaga_mapowania() -> None:
    """Predykaty parami: wyjątek dotyczy WYŁĄCZNIE `MANUAL_EQUIVALENT` — źródło
    bez katalogu i bez tego wyjątku nadal daje `CATALOG_MAPPING_REQUIRED`
    (side-car), zgodnie z E009."""
    enm = _enm_ze_zrodlem_manual_equivalent()
    enm.sources[0].parameter_source = "CATALOG"

    refmap = CgmesRefMap(enm=enm.model_dump(mode="json"), mrid_to_ref={})
    wynik = import_from_side_car(refmap)

    assert wynik.status == CgmesImportStatus.CATALOG_MAPPING_REQUIRED
    assert "src_manual" in wynik.elements_without_catalog
