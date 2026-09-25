"""
D-02 acceptance tests: CIM/CGMES EQ + TP export-import.

1. Round-trip on a golden ENM preserves semantic + input hashes.
2. Export bytes are deterministic (identical on repeat + across processes).
3. Catalog-mapping path (third-party EQ+TP, no side-car) -> CATALOG_MAPPING_REQUIRED.
4. No forbidden artifacts (PCC/BoundaryNode/ConnectionPoint) in the XML.
5. The exported ZIP carries the standard EQ + TP profile members.
"""

from __future__ import annotations

import io
import json
import math
import zipfile

import pytest
from application.cgmes.service import (
    export_cgmes,
    import_cgmes,
    verify_cgmes_integrity,
)
from enm.hash import compute_input_hash, compute_semantic_hash
from enm.mapping import impedancja_zrodla_sieciowego
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source
from enm.severity import STATUS_FAIL
from enm.zrodlo_zwarcie import TrybDanych, dane_zwarciowe_zrodla
from infrastructure.cgmes.cgmes_exporter import build_eq_tp_trees
from infrastructure.cgmes.cgmes_importer import CgmesImportStatus
from infrastructure.cgmes.profiles import NS_CIM

from .golden_enm import build_golden_enm

_EQ = "EQ.xml"
_TP = "TP.xml"
_REFMAP = "refmap.json"
_MANIFEST = "manifest.json"


def _members(archive: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(archive), "r") as zf:
        return {name: zf.read(name) for name in zf.namelist()}


# ---------------------------------------------------------------------------
# Acceptance 1: lossless internal round-trip (hash equality)
# ---------------------------------------------------------------------------


class TestRoundTrip:
    def test_semantic_and_input_hash_preserved(self) -> None:
        enm = build_golden_enm()
        sem0 = compute_semantic_hash(enm)
        inp0 = compute_input_hash(enm)

        archive = export_cgmes(enm)
        result = import_cgmes(archive)

        assert result.status == CgmesImportStatus.SUCCESS
        assert result.used_side_car is True
        assert result.enm is not None

        assert compute_semantic_hash(result.enm) == sem0
        assert compute_input_hash(result.enm) == inp0

    def test_roundtrip_model_passes_validator(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm))
        assert result.validation is not None
        assert result.validation.status != STATUS_FAIL

    def test_roundtrip_preserves_all_main_classes(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm))
        out = result.enm
        assert out is not None
        assert len(out.buses) == len(enm.buses)
        assert len(out.branches) == len(enm.branches)
        assert len(out.transformers) == len(enm.transformers)
        assert len(out.sources) == len(enm.sources)
        assert len(out.loads) == len(enm.loads)
        assert len(out.generators) == len(enm.generators)
        assert len(out.substations) == len(enm.substations)

    def test_double_roundtrip_stable(self) -> None:
        enm = build_golden_enm()
        first = import_cgmes(export_cgmes(enm)).enm
        assert first is not None
        second = import_cgmes(export_cgmes(first)).enm
        assert second is not None
        assert compute_input_hash(first) == compute_input_hash(second)


# ---------------------------------------------------------------------------
# Acceptance 2: deterministic bytes
# ---------------------------------------------------------------------------


class TestDeterminism:
    def test_double_export_identical_bytes(self) -> None:
        enm = build_golden_enm()
        assert export_cgmes(enm) == export_cgmes(enm)

    def test_eq_tp_member_bytes_identical(self) -> None:
        enm = build_golden_enm()
        a = _members(export_cgmes(enm))
        b = _members(export_cgmes(enm))
        assert a[_EQ] == b[_EQ]
        assert a[_TP] == b[_TP]
        assert a[_REFMAP] == b[_REFMAP]
        assert a[_MANIFEST] == b[_MANIFEST]

    def test_export_identical_across_processes(self) -> None:
        # Hash from a fresh subprocess must equal the in-process export hash.
        import hashlib
        import subprocess
        import sys

        local = hashlib.sha256(export_cgmes(build_golden_enm())).hexdigest()
        code = (
            "import hashlib;"
            "from cgmes.golden_enm import build_golden_enm;"
            "from application.cgmes.service import export_cgmes;"
            "print(hashlib.sha256(export_cgmes(build_golden_enm())).hexdigest())"
        )
        out = subprocess.run(
            [sys.executable, "-c", code],
            cwd=".",
            env={"PYTHONPATH": "src:tests", "PYTHONHASHSEED": "0", "PATH": "/usr/bin:/bin"},
            capture_output=True,
            text=True,
        )
        assert out.returncode == 0, out.stderr
        assert out.stdout.strip() == local

    def test_verify_integrity_passes(self) -> None:
        archive = export_cgmes(build_golden_enm())
        assert verify_cgmes_integrity(archive) == []

    def test_verify_integrity_detects_tamper(self) -> None:
        archive = export_cgmes(build_golden_enm())
        members = _members(archive)
        # Corrupt the EQ member but keep the manifest's stored hash.
        tampered = io.BytesIO()
        with zipfile.ZipFile(tampered, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, data in members.items():
                if name == _EQ:
                    data = data + b"<!-- tampered -->"
                zf.writestr(name, data)
        errors = verify_cgmes_integrity(tampered.getvalue())
        assert errors
        assert any(_EQ in e for e in errors)


# ---------------------------------------------------------------------------
# Acceptance 3: catalog-mapping path (third-party EQ+TP, no side-car)
# ---------------------------------------------------------------------------


class TestCatalogMappingPath:
    def test_third_party_import_requires_catalog_mapping(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm), prefer_side_car=False)

        assert result.status == CgmesImportStatus.CATALOG_MAPPING_REQUIRED
        assert result.used_side_car is False
        assert result.catalog_mapping_required is True
        assert result.elements_without_catalog  # populated

    def test_third_party_model_loads_and_validates(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm), prefer_side_car=False)
        assert result.enm is not None
        # Model loads and the validator runs (status produced, not crash).
        assert result.validation is not None

    def test_third_party_uses_migracja_path(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm), prefer_side_car=False)
        out = result.enm
        assert out is not None
        # Catalog-bound elements use the sanctioned legacy path.
        from enm.models import Cable, OverheadLine

        for branch in out.branches:
            if isinstance(branch, OverheadLine | Cable):
                assert branch.catalog_ref is None
                assert branch.source_mode == "MIGRACJA"
                assert branch.parameter_source == "MANUAL_EQUIVALENT"

    def test_third_party_recovers_per_km_via_length(self) -> None:
        enm = build_golden_enm()
        result = import_cgmes(export_cgmes(enm), prefer_side_car=False)
        out = result.enm
        assert out is not None
        # The cable's per-km R/X are recovered (total / length) within tolerance.
        original = next(b for b in enm.branches if b.ref_id == "cab_main_b")
        imported = next(b for b in out.branches if b.ref_id == "cab_main_b")
        assert imported.length_km == pytest.approx(original.length_km)
        assert imported.r_ohm_per_km == pytest.approx(original.r_ohm_per_km)
        assert imported.x_ohm_per_km == pytest.approx(original.x_ohm_per_km)


# ---------------------------------------------------------------------------
# Acceptance 4: no forbidden artifacts in the exported XML
# ---------------------------------------------------------------------------


class TestNoForbiddenArtifacts:
    def test_no_pcc_boundary_connectionpoint_tags(self) -> None:
        members = _members(export_cgmes(build_golden_enm()))
        xml = members[_EQ].decode("utf-8") + members[_TP].decode("utf-8")
        # Forbidden core-model concepts must never leak into the CIM export.
        for forbidden in ("BoundaryNode", "ConnectionPoint", "P" "CC"):
            assert forbidden not in xml

    def test_only_standard_cim_namespace(self) -> None:
        members = _members(export_cgmes(build_golden_enm()))
        eq = members[_EQ].decode("utf-8")
        assert "http://iec.ch/TC57/CIM100#" in eq
        assert "xmlns:cim=" in eq
        assert "xmlns:rdf=" in eq


# ---------------------------------------------------------------------------
# Acceptance 5: standard profile members present
# ---------------------------------------------------------------------------


class TestArchiveStructure:
    def test_zip_contains_eq_tp_refmap_manifest(self) -> None:
        members = _members(export_cgmes(build_golden_enm()))
        assert set(members) == {_EQ, _TP, _REFMAP, _MANIFEST}

    def test_manifest_declares_profiles_and_lossy_boundary(self) -> None:
        members = _members(export_cgmes(build_golden_enm()))
        manifest = json.loads(members[_MANIFEST])
        assert manifest["cim_version"] == "CIM100"
        assert "EQ" in manifest["profiles"]
        assert "TP" in manifest["profiles"]
        assert manifest["deferred_profiles"]  # SSH/SV/DL documented
        assert manifest["lossy_boundary"]  # honest lossy boundary surfaced

    def test_manifest_has_no_wall_clock_timestamp(self) -> None:
        members = _members(export_cgmes(build_golden_enm()))
        manifest = json.loads(members[_MANIFEST])
        # No timestamp anywhere -> determinism (acceptance #2).
        assert "exported_at" not in manifest


# ---------------------------------------------------------------------------
# Tolerant import: malformed archive handling
# ---------------------------------------------------------------------------


class TestTolerantImport:
    def test_missing_profiles_fail_gracefully(self) -> None:
        empty = io.BytesIO()
        with zipfile.ZipFile(empty, "w") as zf:
            zf.writestr("readme.txt", "no profiles here")
        result = import_cgmes(empty.getvalue())
        assert result.status == CgmesImportStatus.FAILED
        assert result.errors

    def test_bad_zip_fails_gracefully(self) -> None:
        result = import_cgmes(b"not a zip")
        assert result.status == CgmesImportStatus.FAILED


# ---------------------------------------------------------------------------
# Acceptance 6 (CV-4.3 K7): ExternalNetworkInjection MIN scenario current
# ---------------------------------------------------------------------------
#
# CIM ``ExternalNetworkInjection`` carries BOTH ``maxInitialSymShCCurrent`` and
# ``minInitialSymShCCurrent`` -- stan PRZED tej karty pisal do OBU tę SAMĄ wartość
# (MAX), więc eksport twierdził min=max nawet gdy model tej równości nie deklarował.
# Iloczyn cech: {Sk''/Ik'' obecne, brak danych MIN} x {dane MIN obecne} x
# {tryb Sk'' / tryb Ik''} x {napięcie szyny znane / nieznane}.


def _bus_source_enm(*, bus_kv: float | None, **zrodlo: object) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="cgmes-k7-src"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=bus_kv or 0.0)],
        sources=[
            Source(
                ref_id="s1",
                name="Zrodlo",
                bus_ref="b1",
                model="short_circuit_power",
                **zrodlo,  # type: ignore[arg-type]
            )
        ],
    )


def _injection_prop(enm: EnergyNetworkModel, prop: str) -> str | None:
    eq, _tp = build_eq_tp_trees(enm)
    inj = eq.find(f"{{{NS_CIM}}}ExternalNetworkInjection")
    assert inj is not None, "ExternalNetworkInjection missing from EQ tree"
    node = inj.find(f"{{{NS_CIM}}}{prop}")
    return node.text if node is not None else None


class TestSourceShortCircuitCurrentMinMax:
    def test_sk_only_max_present_min_omitted(self) -> None:
        """Bez danych MIN: max obecny, min POMINIĘTY -- nie zdublowany z max."""
        enm = _bus_source_enm(bus_kv=15.0, sk3_mva=250.0, rx_ratio=0.1)
        maks = _injection_prop(enm, "ExternalNetworkInjection.maxInitialSymShCCurrent")
        assert maks is not None
        assert float(maks) == pytest.approx(250.0e6 / (math.sqrt(3.0) * 15.0e3))
        assert _injection_prop(enm, "ExternalNetworkInjection.minInitialSymShCCurrent") is None

    def test_sk_min_present_differs_from_max(self) -> None:
        """Z danymi MIN: min policzony z sk3_min_mva, RÓŻNY od max (nie duplikat)."""
        enm = _bus_source_enm(
            bus_kv=15.0, sk3_mva=250.0, sk3_min_mva=150.0, rx_ratio=0.1, rx_ratio_min=0.2
        )
        maks = _injection_prop(enm, "ExternalNetworkInjection.maxInitialSymShCCurrent")
        minn = _injection_prop(enm, "ExternalNetworkInjection.minInitialSymShCCurrent")
        assert maks is not None and minn is not None
        assert float(maks) == pytest.approx(250.0e6 / (math.sqrt(3.0) * 15.0e3))
        assert float(minn) == pytest.approx(150.0e6 / (math.sqrt(3.0) * 15.0e3))
        assert float(minn) != pytest.approx(float(maks))

    def test_ik_only_current_mode_max_present_min_omitted(self) -> None:
        """Tryb prądowy (samo Ik'', brak Sk''): max z ik3_ka (kA -> A), min pominięty."""
        enm = _bus_source_enm(bus_kv=15.0, ik3_ka=9.6, rx_ratio=0.1)
        maks = _injection_prop(enm, "ExternalNetworkInjection.maxInitialSymShCCurrent")
        assert maks is not None
        assert float(maks) == pytest.approx(9.6 * 1000.0)
        assert _injection_prop(enm, "ExternalNetworkInjection.minInitialSymShCCurrent") is None

    def test_ik_min_current_mode_both_present(self) -> None:
        """Tryb prądowy z danymi MIN: oba atrybuty z ik3_ka/ik3_min_ka (kA -> A)."""
        enm = _bus_source_enm(bus_kv=15.0, ik3_ka=9.6, ik3_min_ka=5.0, rx_ratio=0.1)
        maks = _injection_prop(enm, "ExternalNetworkInjection.maxInitialSymShCCurrent")
        minn = _injection_prop(enm, "ExternalNetworkInjection.minInitialSymShCCurrent")
        assert maks is not None and minn is not None
        assert float(maks) == pytest.approx(9.6 * 1000.0)
        assert float(minn) == pytest.approx(5.0 * 1000.0)

    def test_unknown_bus_voltage_omits_current_not_fabricates_zero(self) -> None:
        """Sk'' bez znanego napięcia szyny: właściwość POMINIĘTA, nie zapisane 0."""
        enm = _bus_source_enm(bus_kv=None, sk3_mva=250.0, rx_ratio=0.1)
        assert _injection_prop(enm, "ExternalNetworkInjection.maxInitialSymShCCurrent") is None
        assert _injection_prop(enm, "ExternalNetworkInjection.minInitialSymShCCurrent") is None

    def test_impedance_only_source_has_no_current_properties(self) -> None:
        """Impedancja jawna (R+jX): maxR1/maxX1 obecne, ale ŻADEN prąd -- bez zmian."""
        enm = _bus_source_enm(bus_kv=15.0, r_ohm=0.5, x_ohm=5.0)
        maxr1 = _injection_prop(enm, "ExternalNetworkInjection.maxR1")
        assert maxr1 is not None and float(maxr1) == pytest.approx(0.5)
        assert _injection_prop(enm, "ExternalNetworkInjection.maxInitialSymShCCurrent") is None
        assert _injection_prop(enm, "ExternalNetworkInjection.minInitialSymShCCurrent") is None

    def test_golden_source_min_still_omitted(self) -> None:
        """Zrodlo zlote (impedancja + Sk'' MAX, bez danych MIN): min nadal pominięty."""
        enm = build_golden_enm()
        assert _injection_prop(enm, "ExternalNetworkInjection.maxInitialSymShCCurrent") is not None
        assert _injection_prop(enm, "ExternalNetworkInjection.minInitialSymShCCurrent") is None


# ---------------------------------------------------------------------------
# Acceptance 7 (CV-4.3 K7): deklaracja zwarciowa źródła PRZEŻYWA tor obcy (EQ+TP)
# ---------------------------------------------------------------------------
#
# Stan PRZED: importer czytał z ``ExternalNetworkInjection`` wyłącznie R1/X1 — źródło
# zadeklarowane mocą/prądem zwarciowym wracało z toru obcego BEZ danych zwarciowych
# (niepoliczalne, E008), a stosunek R/X nie był w ogóle eksportowany (mapper liczyłby
# Z_Q z domyślnego R/X = 0,1 IEC 60909 — zmiana fizyki, której model nie zadeklarował).
# Iloczyn cech: tryb danych {Sk'', Ik'', R+jX} x dane MIN {brak, obecne} x
# rx_ratio_min {brak, obecny}. Dowód fizyczny: Z_Q mappera (scenariusz MAX i MIN)
# policzone z wartości PO imporcie równe Z_Q z modelu PRZED eksportem — Sk'' -> Ik''
# to ta sama impedancja (c·U²/S = c·U/(√3·I)); tolerancja 1e-9 = emisja CIM na
# 10 cyfrach znaczących (``units.fmt_float``), nie luz fizyczny.

_U_SZYNY_KV = 15.0


def _zrodlo_po_torze_obcym(enm: EnergyNetworkModel) -> Source:
    result = import_cgmes(export_cgmes(enm), prefer_side_car=False)
    assert result.enm is not None
    assert len(result.enm.sources) == 1
    return result.enm.sources[0]


def _z_q(source: Source, scenariusz: str) -> complex:
    wynik = impedancja_zrodla_sieciowego(source, _U_SZYNY_KV, scenariusz)  # type: ignore[arg-type]
    assert wynik is not None, "źródło niepoliczalne po torze obcym"
    return wynik[0]


def _z_q_rowne_przed_i_po(przed: Source, po: Source) -> None:
    for scenariusz in ("MAX", "MIN"):
        assert _z_q(po, scenariusz) == pytest.approx(_z_q(przed, scenariusz), rel=1e-9), scenariusz


class TestSourceShortCircuitDeclarationSurvivesThirdPartyPath:
    def test_sk_mode_without_min(self) -> None:
        """Sk'' + R/X, bez MIN: wraca jako tryb prądowy z tym samym R/X, bez danych MIN."""
        enm = _bus_source_enm(bus_kv=_U_SZYNY_KV, sk3_mva=250.0, rx_ratio=0.1)
        po = _zrodlo_po_torze_obcym(enm)
        assert po.ik3_ka == pytest.approx(250.0 / (math.sqrt(3.0) * _U_SZYNY_KV), rel=1e-9)
        assert po.rx_ratio == pytest.approx(0.1)
        assert po.sk3_mva is None and po.ik3_min_ka is None and po.rx_ratio_min is None
        dane = dane_zwarciowe_zrodla(po)
        assert dane.tryb_max is TrybDanych.PRAD_ZWARCIOWY and dane.tryb_min is None
        _z_q_rowne_przed_i_po(enm.sources[0], po)

    def test_sk_mode_with_min_and_rx_min(self) -> None:
        """Sk'' + Sk''min + R/X + R/X_min: komplet czterech atrybutów wraca do ENM."""
        enm = _bus_source_enm(
            bus_kv=_U_SZYNY_KV, sk3_mva=250.0, sk3_min_mva=150.0, rx_ratio=0.1, rx_ratio_min=0.2
        )
        po = _zrodlo_po_torze_obcym(enm)
        assert po.ik3_min_ka == pytest.approx(150.0 / (math.sqrt(3.0) * _U_SZYNY_KV), rel=1e-9)
        assert po.rx_ratio_min == pytest.approx(0.2)
        dane = dane_zwarciowe_zrodla(po)
        assert dane.tryb_max is TrybDanych.PRAD_ZWARCIOWY
        assert dane.tryb_min is TrybDanych.PRAD_ZWARCIOWY
        _z_q_rowne_przed_i_po(enm.sources[0], po)

    def test_sk_mode_with_min_without_rx_min(self) -> None:
        """Sk''min bez własnego R/X: rx_ratio_min zostaje None (MIN dziedziczy R/X z MAX)."""
        enm = _bus_source_enm(bus_kv=_U_SZYNY_KV, sk3_mva=250.0, sk3_min_mva=150.0, rx_ratio=0.1)
        po = _zrodlo_po_torze_obcym(enm)
        assert po.rx_ratio_min is None and po.ik3_min_ka is not None
        assert _injection_prop(enm, "ExternalNetworkInjection.minR1ToX1Ratio") is None
        _z_q_rowne_przed_i_po(enm.sources[0], po)

    def test_ik_mode_with_min(self) -> None:
        """Tryb prądowy z MIN: ik3_ka/ik3_min_ka wracają co do wartości (kA -> A -> kA)."""
        enm = _bus_source_enm(bus_kv=_U_SZYNY_KV, ik3_ka=9.6, ik3_min_ka=5.0, rx_ratio=0.1)
        po = _zrodlo_po_torze_obcym(enm)
        assert po.ik3_ka == pytest.approx(9.6, rel=1e-9)
        assert po.ik3_min_ka == pytest.approx(5.0, rel=1e-9)
        assert po.rx_ratio == pytest.approx(0.1) and po.rx_ratio_min is None
        _z_q_rowne_przed_i_po(enm.sources[0], po)

    def test_impedance_mode_unchanged(self) -> None:
        """R+jX: impedancja jawna wraca jak dotąd, bez dorobionych prądów ani R/X."""
        enm = _bus_source_enm(bus_kv=_U_SZYNY_KV, r_ohm=0.5, x_ohm=5.0)
        po = _zrodlo_po_torze_obcym(enm)
        assert po.r_ohm == pytest.approx(0.5) and po.x_ohm == pytest.approx(5.0)
        assert po.ik3_ka is None and po.ik3_min_ka is None
        assert po.rx_ratio is None and po.rx_ratio_min is None
        assert dane_zwarciowe_zrodla(po).tryb_max is TrybDanych.IMPEDANCJA_JAWNA
        _z_q_rowne_przed_i_po(enm.sources[0], po)

    def test_exporter_emits_declared_rx_ratios_only(self) -> None:
        """Atrybuty R/X: obecne dokładnie wtedy, gdy model je deklaruje (bez domyślnego 0,1)."""
        z_obu = _bus_source_enm(
            bus_kv=_U_SZYNY_KV, sk3_mva=250.0, sk3_min_mva=150.0, rx_ratio=0.1, rx_ratio_min=0.2
        )
        assert float(
            _injection_prop(z_obu, "ExternalNetworkInjection.maxR1ToX1Ratio") or "nan"
        ) == pytest.approx(0.1)
        assert float(
            _injection_prop(z_obu, "ExternalNetworkInjection.minR1ToX1Ratio") or "nan"
        ) == pytest.approx(0.2)
        bez_rx = _bus_source_enm(bus_kv=_U_SZYNY_KV, r_ohm=0.5, x_ohm=5.0)
        assert _injection_prop(bez_rx, "ExternalNetworkInjection.maxR1ToX1Ratio") is None
        assert _injection_prop(bez_rx, "ExternalNetworkInjection.minR1ToX1Ratio") is None
