"""
Test klasy: KAŻDY z sześciu konsumentów `wymagalnosc_katalogu` FAKTYCZNIE ją
czyta (monkeypatch poziomu -> zmiana zachowania konsumenta), nie tylko
przypadkiem daje dziś ten sam wynik — karta W3-I (2026-09-09), decyzja §0
pkt 3 („po jednym teście na konsumenta dowodzącym, że czyta tabelę").

Sześć miejsc nazwanych w karcie W3-I „Po co": `enm/validator.py` (E009 dla
gałęzi, W010 dla generatorów), `application/project_archive/service.py`
(bramka ZIP), `infrastructure/cgmes/cgmes_importer.py` (`_elements_without_
catalog`), `application/xlsx_import/importer.py` (asercja `_waliduj_typy`),
`enm/v2_projection.py` (ostrzeżenie migracji generatora), `application/
calculation_readiness/service.py` (`inverter.k_sc_missing`) — plus SIÓDME,
znalezione podczas weryfikacji DoD tej karty (grep dosłownego predykatu w
całym `backend/src` po naprawie sześciu nazwanych miejsc nie wracał zera):
`application/eligibility_service.py::_check_catalog_refs` (bramka eligibility
SC_3F/SC_1F/SC_2F/LOAD_FLOW/FAULT_LOOP_NN/SWZ_NN) — trzeci dosłowny powielacz
warunku `isinstance(branch, OverheadLine | Cable) and not branch.catalog_ref`
obok E009 i (dawniej) bramki ZIP, nienazwany w treści karty.

Każdy test patchuje `wymagalnosc_katalogu` W PRZESTRZENI NAZW KONSUMENTA
(`from ... import wymagalnosc_katalogu` wiąże NOWĄ nazwę lokalną — patch na
`network_model.catalog.governance.wymagalnosc_katalogu` NIE wystarczy).
"""

from __future__ import annotations

import pytest
from network_model.catalog.governance import Poziom, WymagalnoscKatalogu


def _zawsze_nie(*_args: object, **_kwargs: object) -> WymagalnoscKatalogu:
    return WymagalnoscKatalogu(Poziom.NIE, Poziom.NIE, Poziom.NIE, None)


# ---------------------------------------------------------------------------
# 1. enm/validator.py — E009 (gałęzie)
# ---------------------------------------------------------------------------


def test_walidator_e009_czyta_tabele(monkeypatch: pytest.MonkeyPatch) -> None:
    from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader
    from enm.validator import ENMValidator

    enm = EnergyNetworkModel(
        header=ENMHeader(name="test-e009"),
        buses=[
            Bus(ref_id="b1", name="B1", voltage_kv=15.0),
            Bus(ref_id="b2", name="B2", voltage_kv=15.0),
        ],
        branches=[
            Cable(
                ref_id="cab1",
                name="cab1",
                from_bus_ref="b1",
                to_bus_ref="b2",
                length_km=0.5,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                catalog_ref=None,
            )
        ],
    )

    kody_przed = {i.code for i in ENMValidator().validate(enm).issues}
    assert "E009" in kody_przed

    monkeypatch.setattr("enm.validator.wymagalnosc_katalogu", _zawsze_nie)
    kody_po = {i.code for i in ENMValidator().validate(enm).issues}
    assert "E009" not in kody_po


# ---------------------------------------------------------------------------
# 2. enm/validator.py — W010 (generator przekształtnikowy), kod NOWY
# ---------------------------------------------------------------------------


def test_walidator_w010_czyta_tabele(monkeypatch: pytest.MonkeyPatch) -> None:
    from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator
    from enm.validator import ENMValidator

    enm = EnergyNetworkModel(
        header=ENMHeader(name="test-w010"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=0.4)],
        generators=[
            Generator(
                ref_id="gen1",
                name="gen1",
                bus_ref="b1",
                p_mw=0.1,
                gen_type="pv_inverter",
                catalog_ref=None,
            )
        ],
    )

    kody_przed = {i.code for i in ENMValidator().validate(enm).issues}
    assert "W010" in kody_przed

    monkeypatch.setattr("enm.validator.wymagalnosc_katalogu", _zawsze_nie)
    kody_po = {i.code for i in ENMValidator().validate(enm).issues}
    assert "W010" not in kody_po


# ---------------------------------------------------------------------------
# 3. application/project_archive/service.py — bramka ZIP
# ---------------------------------------------------------------------------


def test_bramka_zip_czyta_tabele(monkeypatch: pytest.MonkeyPatch) -> None:
    from application.project_archive.service import _find_elements_without_catalog
    from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader

    enm = EnergyNetworkModel(
        header=ENMHeader(name="test-zip"),
        buses=[
            Bus(ref_id="b1", name="B1", voltage_kv=15.0),
            Bus(ref_id="b2", name="B2", voltage_kv=15.0),
        ],
        branches=[
            Cable(
                ref_id="cab1",
                name="cab1",
                from_bus_ref="b1",
                to_bus_ref="b2",
                length_km=0.5,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                catalog_ref=None,
            )
        ],
    )

    assert "cab1" in _find_elements_without_catalog(enm)

    monkeypatch.setattr("application.project_archive.service.wymagalnosc_katalogu", _zawsze_nie)
    assert "cab1" not in _find_elements_without_catalog(enm)


# ---------------------------------------------------------------------------
# 4. infrastructure/cgmes/cgmes_importer.py — `_elements_without_catalog`
# ---------------------------------------------------------------------------


def test_cgmes_elements_without_catalog_czyta_tabele(monkeypatch: pytest.MonkeyPatch) -> None:
    from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader
    from infrastructure.cgmes.cgmes_importer import _elements_without_catalog

    enm = EnergyNetworkModel(
        header=ENMHeader(name="test-cgmes"),
        buses=[
            Bus(ref_id="b1", name="B1", voltage_kv=15.0),
            Bus(ref_id="b2", name="B2", voltage_kv=15.0),
        ],
        branches=[
            Cable(
                ref_id="cab1",
                name="cab1",
                from_bus_ref="b1",
                to_bus_ref="b2",
                length_km=0.5,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                catalog_ref=None,
            )
        ],
    )

    assert "cab1" in _elements_without_catalog(enm)

    monkeypatch.setattr("infrastructure.cgmes.cgmes_importer.wymagalnosc_katalogu", _zawsze_nie)
    assert "cab1" not in _elements_without_catalog(enm)


# ---------------------------------------------------------------------------
# 5. application/xlsx_import/importer.py — asercja w `_waliduj_typy`
# ---------------------------------------------------------------------------


def test_xlsx_waliduj_typy_czyta_tabele(monkeypatch: pytest.MonkeyPatch) -> None:
    from application.xlsx_import.importer import XlsxNetworkImporter

    importer = XlsxNetworkImporter()
    # Bez patcha: asercja zgadza się z tabelą (linia/kabel/transformator = import
    # BLOCKER) -> funkcja przechodzi nawet na PUSTYCH listach (asercje na
    # początku funkcji, przed pętlami).
    assert importer._waliduj_typy([], []) == []

    monkeypatch.setattr("application.xlsx_import.importer.wymagalnosc_katalogu", _zawsze_nie)
    with pytest.raises(AssertionError):
        importer._waliduj_typy([], [])


# ---------------------------------------------------------------------------
# 6. enm/v2_projection.py — ostrzeżenie migracji generatora (V12-MIG-GEN-002)
# ---------------------------------------------------------------------------


def test_v2_projection_ostrzezenie_generatora_czyta_tabele(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator
    from enm.v2_projection import project_enm_v1_to_v2

    enm = EnergyNetworkModel(
        header=ENMHeader(name="test-v2-proj"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=0.4)],
        generators=[
            Generator(
                ref_id="gen1",
                name="gen1",
                bus_ref="b1",
                p_mw=0.1,
                gen_type="pv_inverter",
                catalog_ref=None,
            )
        ],
    )

    kody_przed = {w.code for w in project_enm_v1_to_v2(enm).migration_warnings}
    assert "V12-MIG-GEN-002" in kody_przed

    monkeypatch.setattr("enm.v2_projection.wymagalnosc_katalogu", _zawsze_nie)
    kody_po = {w.code for w in project_enm_v1_to_v2(enm).migration_warnings}
    assert "V12-MIG-GEN-002" not in kody_po


# ---------------------------------------------------------------------------
# 7. application/calculation_readiness/service.py — `inverter.k_sc_missing`
# ---------------------------------------------------------------------------


def test_gotowosc_sc_inverter_k_sc_missing_czyta_tabele(monkeypatch: pytest.MonkeyPatch) -> None:
    from application.calculation_readiness.service import _check_short_circuit
    from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator, Source

    enm = EnergyNetworkModel(
        header=ENMHeader(name="test-gotowosc-sc"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=0.4)],
        sources=[
            Source(
                ref_id="src1",
                name="src1",
                bus_ref="b1",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
                catalog_ref="src-cat-1",
            )
        ],
        generators=[
            Generator(
                ref_id="gen1",
                name="gen1",
                bus_ref="b1",
                p_mw=0.1,
                gen_type="pv_inverter",
                catalog_ref=None,
            )
        ],
    )

    raport_przed = _check_short_circuit(enm)
    assert "gen1" in raport_przed.blocking_object_refs

    monkeypatch.setattr(
        "application.calculation_readiness.service.wymagalnosc_katalogu", _zawsze_nie
    )
    raport_po = _check_short_circuit(enm)
    assert "gen1" not in raport_po.blocking_object_refs


# ---------------------------------------------------------------------------
# 8. application/eligibility_service.py — `_check_catalog_refs` (SIÓDME
#    miejsce, znalezione podczas weryfikacji DoD tej karty, nienazwane w
#    treści karty — patrz nagłówek modułu)
# ---------------------------------------------------------------------------


def test_eligibility_check_catalog_refs_czyta_tabele(monkeypatch: pytest.MonkeyPatch) -> None:
    from application.eligibility_service import EligibilityService
    from domain.eligibility_models import AnalysisEligibilityIssue
    from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader

    enm = EnergyNetworkModel(
        header=ENMHeader(name="test-eligibility"),
        buses=[
            Bus(ref_id="b1", name="B1", voltage_kv=15.0),
            Bus(ref_id="b2", name="B2", voltage_kv=15.0),
        ],
        branches=[
            Cable(
                ref_id="cab1",
                name="cab1",
                from_bus_ref="b1",
                to_bus_ref="b2",
                length_km=0.5,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                catalog_ref=None,
            )
        ],
    )

    blockers_przed: list[AnalysisEligibilityIssue] = []
    EligibilityService._check_catalog_refs(enm, blockers_przed)
    assert any(b.element_ref == "cab1" for b in blockers_przed)

    monkeypatch.setattr("application.eligibility_service.wymagalnosc_katalogu", _zawsze_nie)
    blockers_po: list[AnalysisEligibilityIssue] = []
    EligibilityService._check_catalog_refs(enm, blockers_po)
    assert not any(b.element_ref == "cab1" for b in blockers_po)


def test_eligibility_check_catalog_refs_sprawdza_zrodla_z_wyjatkiem_manual_equivalent() -> None:
    """Naprawa karty W3-I: TA sama kontrola dziś obejmuje też źródła (wcześniej
    sprawdzała WYŁĄCZNIE gałęzie i transformatory), z tym samym wyjątkiem K1.2
    co E009/ZIP/CGMES."""
    from application.eligibility_service import EligibilityService
    from domain.eligibility_models import AnalysisEligibilityIssue
    from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source

    enm = EnergyNetworkModel(
        header=ENMHeader(name="test-eligibility-zrodlo"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=15.0)],
        sources=[
            Source(
                ref_id="src_bez_katalogu",
                name="src_bez_katalogu",
                bus_ref="b1",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
                catalog_ref=None,
                parameter_source="CATALOG",
            ),
            Source(
                ref_id="src_manual_equivalent",
                name="src_manual_equivalent",
                bus_ref="b1",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
                catalog_ref=None,
                parameter_source="MANUAL_EQUIVALENT",
            ),
        ],
    )

    blockers: list[AnalysisEligibilityIssue] = []
    EligibilityService._check_catalog_refs(enm, blockers)
    refs_zablokowane = {b.element_ref for b in blockers}
    assert "src_bez_katalogu" in refs_zablokowane
    assert "src_manual_equivalent" not in refs_zablokowane
