"""
Integration Tests for Project Archive Service — P31 / W1-B-ARCH.

Tests:
- Export project from database (siec = model ENM, jedyny nosnik od W1)
- Import project to database
- Roundtrip: export → import → state identical
- Determinism: 2× export = identical ZIP
- Bramka katalogowa liczy sie z modelu ENM (§0.4)
- Import archiwum 2.x BEZ sekcji `enm.models`, z surowa sekcja `network_model`
  (2.x) → kompilacja przez `application.migracja_legacy.graf_z_modelu_legacy`
  + `enm.kompilator_grafu.kompiluj_graf` (§0.2) — testy na REALNEJ sciezce
  (ZIP bajty → `service.import_project`), nie na atrapach (§2)
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from application.project_archive.service import ProjectArchiveService
from domain.project_archive import (
    ARCHIVE_FORMAT_ID,
    ARCHIVE_SCHEMA_VERSION,
    ArchiveImportStatus,
    canonicalize,
)
from enm.klucz_twin import klucz_twin_projektu
from enm.kompilator_grafu import (
    EdgeSpec,
    GrafDoKompilacji,
    OdbiorSpec,
    SzynaSpec,
    ZrodloSpec,
    kompiluj_graf,
)
from enm.store import get_enm, has_enm, reset_enm_store, set_enm
from infrastructure.persistence.models import ProjectORM, StudyCaseORM

# Typ katalogowy statyczny uzywany w fikturach sieci (linia napowietrzna Al 16 mm2)
LINIA_TYP = "line-base-al-16"


# =============================================================================
# Fixtures — model ENM (jedyny nosnik sieci od W1; NetworkNodeORM/BranchORM itd.
# skasowane) budowany TYM SAMYM kompilatorem grafu co arkusz XLSX i migracja
# legacy (`enm/kompilator_grafu.py`) — zero drugiej implementacji.
# =============================================================================


@pytest.fixture
def enm_store_tmp(tmp_path, monkeypatch):
    """Izolowany katalog flat-file store ENM na czas testu."""
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store(remove_persisted=False)
    yield
    reset_enm_store(remove_persisted=False)


def _model_dwoch_szyn() -> dict[str, Any]:
    """BUS-1 (zrodlo systemowe) --LINE-1--> BUS-2 (odbior). Surowy zrzut ENM."""
    graf = GrafDoKompilacji(
        name="Siec testowa eksportu",
        szyny=(
            SzynaSpec(lit="BUS-1", name="BUS-1", voltage_kv=15.0),
            SzynaSpec(lit="BUS-2", name="BUS-2", voltage_kv=15.0),
        ),
        odcinki=(EdgeSpec("LINE-1", "BUS-1", "BUS-2", LINIA_TYP, 1000.0, "LINIA"),),
        zrodla=(ZrodloSpec(lit="BUS-1", name="Zasilanie", rx_ratio=0.1, sk3_mva=500.0),),
        odbiory=(OdbiorSpec(lit="BUS-2", name="Odbior", p_mw=1.0, q_mvar=0.3),),
    )
    return kompiluj_graf(graf).enm


@pytest.fixture
def sample_project(test_db_session, enm_store_tmp):
    """Create a sample project (z modelem ENM) in the database."""
    project_id = uuid4()
    now = datetime.now(UTC)

    project = ProjectORM(
        id=project_id,
        name="Projekt Testowy Export",
        description="Opis projektu do testów eksportu",
        schema_version="1.0.0",
        connection_node_id=None,
        sources_jsonb=[{"type": "GRID", "ssc_mva": 100.0}],
        created_at=now,
        updated_at=now,
    )
    test_db_session.add(project)

    case = StudyCaseORM(
        id=uuid4(),
        project_id=project_id,
        name="Przypadek Testowy",
        description="Opis przypadku",
        study_jsonb={"c_factor_max": 1.1, "c_factor_min": 0.95},
        is_active=True,
        result_status="NONE",
        result_refs_jsonb=[],
        revision=1,
        created_at=now,
        updated_at=now,
    )
    test_db_session.add(case)
    test_db_session.commit()

    from enm.models import EnergyNetworkModel

    klucz = klucz_twin_projektu(project_id)
    model = EnergyNetworkModel.model_validate(_model_dwoch_szyn())
    set_enm(klucz, model)

    return project


# =============================================================================
# Test: Export
# =============================================================================


class TestExport:
    """Tests for project export."""

    def test_export_creates_valid_zip(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)

        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            assert "project.json" in zf.namelist()
            assert "manifest.json" in zf.namelist()

    def test_export_contains_project_data(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)

        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            project_json = json.loads(zf.read("project.json"))

        assert project_json["format_id"] == ARCHIVE_FORMAT_ID
        assert project_json["schema_version"] == ARCHIVE_SCHEMA_VERSION
        assert project_json["project_meta"]["name"] == "Projekt Testowy Export"

    def test_export_has_no_deleted_sections(self, test_db_session, sample_project):
        """W1-B-ARCH §0.1: format 3.0.0 nie niesie `network_model`/
        `sld_diagrams`/`proofs` — nie ma już dla nich źródła danych."""
        service = ProjectArchiveService(test_db_session)
        archive_bytes = service.export_project(sample_project.id)

        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            project_json = json.loads(zf.read("project.json"))

        assert "network_model" not in project_json
        assert "sld_diagrams" not in project_json
        assert "proofs" not in project_json
        for deleted_hash in ("network_model_hash", "sld_hash", "proofs_hash"):
            assert deleted_hash not in project_json["fingerprints"]

    def test_export_contains_enm_model(self, test_db_session, sample_project):
        """Sieć projektu żyje wyłącznie w ENM (W1) — eksport ją niesie w sekcji
        `enm`, nie w `network_model` (skasowana)."""
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)

        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            project_json = json.loads(zf.read("project.json"))

        models = project_json["enm"]["models"]
        assert len(models) == 1
        snapshot = models[0]["snapshot"]
        assert [b["name"] for b in snapshot["buses"]] == ["BUS-1", "BUS-2"]
        assert [b["name"] for b in snapshot["branches"]] == ["LINE-1"]

    def test_export_contains_cases(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)

        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            project_json = json.loads(zf.read("project.json"))

        cases = project_json["cases"]
        assert len(cases["study_cases"]) == 1
        assert cases["study_cases"][0]["name"] == "Przypadek Testowy"
        assert "switching_states" not in cases

    def test_export_includes_fingerprints(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)

        zip_buffer = io.BytesIO(archive_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            project_json = json.loads(zf.read("project.json"))

        fingerprints = project_json["fingerprints"]
        assert "archive_hash" in fingerprints
        assert len(fingerprints["archive_hash"]) == 64  # SHA-256 hex


# =============================================================================
# Test: Determinism
# =============================================================================


class TestExportDeterminism:
    """Tests for deterministic export."""

    def test_double_export_identical(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive1 = service.export_project(sample_project.id)
        archive2 = service.export_project(sample_project.id)

        def get_project_json(archive_bytes):
            zip_buffer = io.BytesIO(archive_bytes)
            with zipfile.ZipFile(zip_buffer, "r") as zf:
                return zf.read("project.json").decode("utf-8")

        assert get_project_json(archive1) == get_project_json(archive2)

    def test_double_export_identical_hash(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive1 = service.export_project(sample_project.id)
        archive2 = service.export_project(sample_project.id)

        def get_archive_hash(archive_bytes):
            zip_buffer = io.BytesIO(archive_bytes)
            with zipfile.ZipFile(zip_buffer, "r") as zf:
                project_json = json.loads(zf.read("project.json"))
            return project_json["fingerprints"]["archive_hash"]

        assert get_archive_hash(archive1) == get_archive_hash(archive2)


# =============================================================================
# Test: Import
# =============================================================================


class TestImport:
    """Tests for project import."""

    def test_import_creates_project(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)
        projects_before = test_db_session.query(ProjectORM).count()

        result = service.import_project(archive_bytes, new_project_name="Imported Project")

        assert result.status == ArchiveImportStatus.SUCCESS
        assert result.project_id is not None

        projects_after = test_db_session.query(ProjectORM).count()
        assert projects_after == projects_before + 1

    def test_import_preserves_enm_model(self, test_db_session, sample_project):
        """Import powinien odtworzyć model ENM (jedyny nośnik sieci)."""
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)
        result = service.import_project(archive_bytes)
        assert result.status == ArchiveImportStatus.SUCCESS

        klucz_nowego = klucz_twin_projektu(result.project_id)
        assert has_enm(klucz_nowego)
        model = get_enm(klucz_nowego)
        assert [b.name for b in model.buses] == ["BUS-1", "BUS-2"]
        assert [b.name for b in model.branches] == ["LINE-1"]

    def test_import_creates_new_ids(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)
        result = service.import_project(archive_bytes)
        assert result.status == ArchiveImportStatus.SUCCESS

        assert result.project_id != str(sample_project.id)

    def test_import_with_new_name(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)
        result = service.import_project(archive_bytes, new_project_name="Nowy Projekt")
        assert result.status == ArchiveImportStatus.SUCCESS

        imported = (
            test_db_session.query(ProjectORM).filter(ProjectORM.id == result.project_id).first()
        )
        assert imported is not None
        assert imported.name == "Nowy Projekt"


# =============================================================================
# Test: Roundtrip
# =============================================================================


class TestRoundtrip:
    """Tests for export → import → identical state."""

    def test_roundtrip_preserves_project_name(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)
        result = service.import_project(archive_bytes)
        assert result.status == ArchiveImportStatus.SUCCESS

        imported = (
            test_db_session.query(ProjectORM).filter(ProjectORM.id == result.project_id).first()
        )
        assert imported is not None
        assert imported.name == sample_project.name

    def test_roundtrip_preserves_enm_structure(self, test_db_session, sample_project):
        """Roundtrip should preserve the ENM network structure 1:1 (hash+revision)."""
        service = ProjectArchiveService(test_db_session)

        klucz_oryginalny = klucz_twin_projektu(sample_project.id)
        original_model = get_enm(klucz_oryginalny)

        archive_bytes = service.export_project(sample_project.id)
        result = service.import_project(archive_bytes)
        assert result.status == ArchiveImportStatus.SUCCESS

        klucz_nowego = klucz_twin_projektu(result.project_id)
        imported_model = get_enm(klucz_nowego)

        assert [b.name for b in imported_model.buses] == [b.name for b in original_model.buses]
        assert [b.name for b in imported_model.branches] == [
            b.name for b in original_model.branches
        ]
        assert imported_model.header.hash_sha256 == original_model.header.hash_sha256
        assert imported_model.header.revision == original_model.header.revision

    def test_export_import_export_bit_identical(self, test_db_session, sample_project):
        """§0.3: eksport → import → eksport daje BIT W BIT ten sam `enm_hash`
        i tę samą treść modelu (`header.hash_sha256`)."""
        service = ProjectArchiveService(test_db_session)

        first_bytes = service.export_project(sample_project.id)
        result = service.import_project(first_bytes)
        assert result.status == ArchiveImportStatus.SUCCESS

        second_bytes = service.export_project(result.project_id)

        def project_json(archive_bytes):
            with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
                return json.loads(zf.read("project.json"))

        first = project_json(first_bytes)
        second = project_json(second_bytes)
        # NOTE: `fingerprints.enm_hash` (odcisk CAŁEJ sekcji `enm`, w tym
        # `case_id`) legitymnie RÓŻNI SIĘ tu — import mintuje NOWY `case_id`
        # dla przypadku (`test_import_creates_new_ids`,
        # `test_enm_archive_section.py::test_roundtrip_restores_enm_one_to_one`
        # — „Import remapuje id przypadku", zachowanie SPRZED tej karty i poza
        # jej zakresem). Bit w bit tożsama jest TREŚĆ modelu (`snapshot`,
        # zawierająca `header.hash_sha256`) — to ona jest przedmiotem §0.3.
        assert first["enm"]["models"][0]["snapshot"] == second["enm"]["models"][0]["snapshot"]
        assert (
            first["enm"]["models"][0]["snapshot"]["header"]["hash_sha256"]
            == second["enm"]["models"][0]["snapshot"]["header"]["hash_sha256"]
        )


# =============================================================================
# Test: Preview
# =============================================================================


class TestPreview:
    """Tests for archive preview."""

    def test_preview_valid_archive(self, test_db_session, sample_project):
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)
        preview = service.preview_archive(archive_bytes)

        assert preview["valid"] is True
        assert preview["project_name"] == "Projekt Testowy Export"
        assert preview["format_id"] == ARCHIVE_FORMAT_ID

    def test_preview_shows_summary(self, test_db_session, sample_project):
        """W1-B-ARCH: podsumowanie liczy przypadki/biegi/wpisy ENM (jedyny
        nośnik sieci) — nie ma już `nodes_count`/`branches_count`."""
        service = ProjectArchiveService(test_db_session)

        archive_bytes = service.export_project(sample_project.id)
        preview = service.preview_archive(archive_bytes)

        summary = preview["summary"]
        assert summary["study_cases_count"] == 1
        assert summary["enm_models_count"] == 1
        assert "nodes_count" not in summary
        assert "branches_count" not in summary

    def test_preview_invalid_zip(self, test_db_session):
        service = ProjectArchiveService(test_db_session)

        preview = service.preview_archive(b"not a zip file")

        assert preview["valid"] is False
        assert "error" in preview


# =============================================================================
# Test: Error Handling
# =============================================================================


class TestErrorHandling:
    """Tests for error handling."""

    def test_export_nonexistent_project(self, test_db_session):
        service = ProjectArchiveService(test_db_session)

        with pytest.raises(Exception) as exc_info:
            service.export_project(uuid4())

        assert "nie istnieje" in str(exc_info.value)

    def test_import_invalid_zip(self, test_db_session):
        service = ProjectArchiveService(test_db_session)

        result = service.import_project(b"not a zip file")

        assert result.status == ArchiveImportStatus.FAILED
        assert len(result.errors) > 0

    def test_import_missing_project_json(self, test_db_session):
        service = ProjectArchiveService(test_db_session)

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w") as zf:
            zf.writestr("other_file.txt", "some content")

        result = service.import_project(zip_buffer.getvalue())

        assert result.status == ArchiveImportStatus.FAILED
        assert any("project.json" in err for err in result.errors)


# =============================================================================
# Test: bramka katalogowa liczy się z modelu ENM (§0.4)
# =============================================================================


class TestCatalogGateFromEnm:
    """`_find_elements_without_catalog` liczy się z modelu ENM (przywróconego
    albo skompilowanego) — gałęzie/transformatory bez `catalog_ref`."""

    def test_line_without_catalog_ref_blocks_import(self, test_db_session, enm_store_tmp):
        """Linia bez `catalog_ref` (materializacja ręczna, poza katalogiem) →
        CATALOG_MAPPING_REQUIRED przy imporcie."""
        from enm.models import EnergyNetworkModel

        project_id = uuid4()
        now = datetime.now(UTC)
        project = ProjectORM(
            id=project_id,
            name="Projekt bez katalogu",
            description=None,
            schema_version="1.0.0",
            connection_node_id=None,
            sources_jsonb=[],
            created_at=now,
            updated_at=now,
        )
        test_db_session.add(project)
        test_db_session.commit()

        model_dict = _model_dwoch_szyn()
        # Zdejmij catalog_ref z jedynej gałęzi — symulacja materializacji poza
        # katalogiem (bramka §0.4 musi to złapać z modelu ENM, nie z sekcji
        # network_model, której już nie ma).
        for branch in model_dict["branches"]:
            branch["catalog_ref"] = None
        model = EnergyNetworkModel.model_validate(model_dict)
        set_enm(klucz_twin_projektu(project_id), model)
        oczekiwany_ref_id = model.branches[0].ref_id
        assert model.branches[0].name == "LINE-1"  # etykieta czytelna dla człowieka

        service = ProjectArchiveService(test_db_session)
        archive_bytes = service.export_project(project_id)
        result = service.import_project(archive_bytes, new_project_name="Import bez katalogu")

        assert result.status == ArchiveImportStatus.CATALOG_MAPPING_REQUIRED
        assert result.catalog_mapping_required is True
        # Bramka zwraca ref_id (identyfikator systemowy), nie nazwę czytelną —
        # `_find_elements_without_catalog` docstring: „Zwraca listę ref_id".
        assert result.elements_without_catalog == [oczekiwany_ref_id]

    def test_import_without_any_model_has_empty_catalog_gate(self, test_db_session):
        """Import projektu bez modelu ENM w ogóle → bramka katalogowa pusta
        (zero fabrykacji), nie błąd."""
        project_id = uuid4()
        now = datetime.now(UTC)
        project = ProjectORM(
            id=project_id,
            name="Projekt bez sieci",
            description=None,
            schema_version="1.0.0",
            connection_node_id=None,
            sources_jsonb=[],
            created_at=now,
            updated_at=now,
        )
        test_db_session.add(project)
        test_db_session.commit()

        service = ProjectArchiveService(test_db_session)
        archive_bytes = service.export_project(project_id)
        result = service.import_project(archive_bytes, new_project_name="Import bez sieci")

        assert result.status == ArchiveImportStatus.SUCCESS
        assert result.elements_without_catalog == []
        assert result.catalog_mapping_required is False


# =============================================================================
# Test: import archiwum 2.x BEZ `enm.models`, z surową sekcją `network_model`
# (§0.2) — REALNA ścieżka: ZIP bajty → `import_project`.
# =============================================================================


def _hash_2x(data: Any) -> str:
    canonical = canonicalize(data)
    return hashlib.sha256(
        json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _zip_2x_bez_enm(
    *,
    project_name: str = "Projekt legacy 2.x",
    branch_params: dict[str, Any] | None = None,
    study_cases: list[dict[str, Any]] | None = None,
) -> bytes:
    """Archiwum 2.x (bez sekcji `enm.models`), z surową sekcją `network_model`
    w kształcie eksportu `_collect_network_model` z HEAD~ (§0.2 karty
    W1-B-ARCH) — dokładnie te klucze, które `graf_z_modelu_legacy` przyjmuje
    (patrz `tests/application/test_migracja_legacy.py`)."""
    if branch_params is None:
        branch_params = {
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.081,
            "b_us_per_km": 0.0,
            "length_km": 5.0,
            "rated_current_a": 315.0,
            "type_ref": None,
        }
    project_id = str(uuid4())
    pm = {
        "id": project_id,
        "name": project_name,
        "description": None,
        "schema_version": "2.0.0",
        "active_network_snapshot_id": None,
        "connection_node_id": None,
        "sources": [],
        "created_at": "2025-01-01T00:00:00",
        "updated_at": "2025-01-01T00:00:00",
    }
    nm = {
        "nodes": [
            {"id": "n1", "name": "GPZ", "node_type": "SLACK", "base_kv": 15.0, "attrs_jsonb": {}},
            {"id": "n2", "name": "Stacja", "node_type": "PQ", "base_kv": 15.0, "attrs_jsonb": {}},
        ],
        "branches": [
            {
                "id": "b1",
                "name": "AFL-6 120",
                "branch_type": "line",
                "from_node_id": "n1",
                "to_node_id": "n2",
                "in_service": True,
                "params_jsonb": branch_params,
            }
        ],
        "sources": [
            {
                "id": "s1",
                "node_id": "n1",
                "source_type": "GRID",
                "payload_jsonb": {
                    "name": "Z1",
                    "model": "short_circuit_power",
                    "sk3_mva": 500.0,
                    "rx_ratio": 0.1,
                },
            }
        ],
        "loads": [],
        "snapshots": [],
    }
    sld = {"diagrams": [], "node_symbols": [], "branch_symbols": [], "annotations": []}
    cases = {
        "study_cases": study_cases if study_cases is not None else [],
        "operating_cases": [],
        "switching_states": [],
        "settings": None,
    }
    runs = {"canonical_runs": [], "analysis_runs_index": []}
    results: dict[str, Any] = {}
    proofs = {"design_specs": [], "design_proposals": [], "design_evidence": []}
    interpretations = {"cached": []}
    issues = {"snapshot": []}

    section_hashes = {
        "project_meta": _hash_2x(pm),
        "network_model": _hash_2x(nm),
        "sld": _hash_2x(sld),
        "cases": _hash_2x(cases),
        "runs": _hash_2x(runs),
        "results": _hash_2x(results),
        "proofs": _hash_2x(proofs),
        "interpretations": _hash_2x(interpretations),
        "issues": _hash_2x(issues),
        # BRAK "enm" — archiwum sprzed sekcji ENM (§0.2: „archiwum 2.x BEZ enm.models").
    }
    archive_hash = _hash_2x(section_hashes)

    data = {
        "schema_version": "2.0.0",
        "format_id": ARCHIVE_FORMAT_ID,
        "project_meta": pm,
        "network_model": nm,
        "sld_diagrams": sld,
        "cases": cases,
        "runs": runs,
        "results": results,
        "proofs": proofs,
        "interpretations": interpretations,
        "issues": issues,
        "fingerprints": {
            "archive_hash": archive_hash,
            "project_meta_hash": section_hashes["project_meta"],
            "network_model_hash": section_hashes["network_model"],
            "sld_hash": section_hashes["sld"],
            "cases_hash": section_hashes["cases"],
            "runs_hash": section_hashes["runs"],
            "results_hash": section_hashes["results"],
            "proofs_hash": section_hashes["proofs"],
            "interpretations_hash": section_hashes["interpretations"],
            "issues_hash": section_hashes["issues"],
        },
    }

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "project.json",
            json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
        )
        zf.writestr(
            "manifest.json",
            json.dumps(
                {
                    "format_id": ARCHIVE_FORMAT_ID,
                    "schema_version": "2.0.0",
                    "project_name": project_name,
                    "exported_at": "2025-01-01T00:00:00+00:00",
                    "archive_hash": archive_hash,
                }
            ),
        )
    return zip_buffer.getvalue()


class TestImport2xLegacyNetworkModelCompilation:
    """Iloczyn cech (§2): {z przypadkami, bez} × {model odtwarzalny, nie do
    odtworzenia} — na REALNEJ ścieżce ZIP bajty → `import_project`."""

    def test_2x_bez_enm_z_przypadkami_kompiluje_model(self, test_db_session, enm_store_tmp):
        study_cases = [
            {
                "id": "sc-legacy-1",
                "name": "Przypadek legacy",
                "description": "",
                "network_snapshot_id": None,
                "study_jsonb": {},
                "is_active": True,
                "result_status": "NONE",
                "result_refs_jsonb": [],
                "revision": 1,
                "created_at": "2025-01-01T00:00:00",
                "updated_at": "2025-01-01T00:00:00",
            }
        ]
        archive_bytes = _zip_2x_bez_enm(study_cases=study_cases)

        service = ProjectArchiveService(test_db_session)
        result = service.import_project(archive_bytes, new_project_name="Import 2.x z siecia")

        assert result.status in {
            ArchiveImportStatus.SUCCESS,
            ArchiveImportStatus.CATALOG_MAPPING_REQUIRED,
        }, f"Import nie powiódł się: {result.errors}"
        assert result.migrated_from_version == "2.0.0"
        assert not any("nie został odtworzony" in w for w in result.warnings)

        # Projekt i przypadek zostały przywrócone.
        imported_cases = (
            test_db_session.query(StudyCaseORM)
            .filter(StudyCaseORM.project_id == result.project_id)
            .all()
        )
        assert len(imported_cases) == 1
        assert imported_cases[0].name == "Przypadek legacy"

        # Model skompilowany z sekcji `network_model` (§0.2) — GPZ + linia + odbiorca.
        # `graf_z_modelu_legacy` nazywa krawędź swoim `id` legacy (`b1`), nie
        # kolumną `name` legacy — dokładnie jak `tests/application/
        # test_migracja_legacy.py::test_model_zastany_kompiluje_sie_do_enm_bez_blokad`.
        klucz = klucz_twin_projektu(result.project_id)
        assert has_enm(klucz)
        model = get_enm(klucz)
        assert {b.name for b in model.buses} == {"GPZ", "Stacja"}
        assert [b.name for b in model.branches] == ["b1"]
        assert model.branches[0].catalog_ref is not None  # parametry wprost -> katalog projektu
        assert model.katalog_projektu is not None

    def test_2x_bez_enm_bez_przypadkow_wciaz_kompiluje_model(self, test_db_session, enm_store_tmp):
        """Sieć kompiluje się NIEZALEŻNIE od tego, czy archiwum niosło
        przypadki obliczeniowe — restore modelu nie jest bramkowany case'ami."""
        archive_bytes = _zip_2x_bez_enm(study_cases=[])

        service = ProjectArchiveService(test_db_session)
        result = service.import_project(archive_bytes, new_project_name="Import 2.x bez przypadkow")

        assert result.status in {
            ArchiveImportStatus.SUCCESS,
            ArchiveImportStatus.CATALOG_MAPPING_REQUIRED,
        }, f"Import nie powiódł się: {result.errors}"

        klucz = klucz_twin_projektu(result.project_id)
        assert has_enm(klucz)
        model = get_enm(klucz)
        assert {b.name for b in model.buses} == {"GPZ", "Stacja"}

    def test_2x_model_niedoodtwarzalny_daje_ostrzezenie_import_sukces(
        self, test_db_session, enm_store_tmp
    ):
        """`OdmowaMigracji` (obciążalność 0 A — placeholder dawnego importera,
        §0.2) → import KOŃCZY SIĘ powodzeniem, projekt/przypadek zostają, model
        NIE powstaje, a ostrzeżenie nazywa przyczynę (zero cichego pomijania)."""
        study_cases = [
            {
                "id": "sc-legacy-2",
                "name": "Przypadek bez sieci",
                "description": "",
                "network_snapshot_id": None,
                "study_jsonb": {},
                "is_active": True,
                "result_status": "NONE",
                "result_refs_jsonb": [],
                "revision": 1,
                "created_at": "2025-01-01T00:00:00",
                "updated_at": "2025-01-01T00:00:00",
            }
        ]
        archive_bytes = _zip_2x_bez_enm(
            branch_params={
                "r_ohm_per_km": 0.253,
                "x_ohm_per_km": 0.081,
                "b_us_per_km": 0.0,
                "length_km": 5.0,
                "rated_current_a": 0.0,  # placeholder — OdmowaMigracji
                "type_ref": None,
            },
            study_cases=study_cases,
        )

        service = ProjectArchiveService(test_db_session)
        result = service.import_project(
            archive_bytes, new_project_name="Import 2.x niedoodtwarzalny"
        )

        # Import KOŃCZY SIĘ powodzeniem — nigdy FAILED z powodu modelu 2.x.
        assert (
            result.status == ArchiveImportStatus.SUCCESS
        ), f"errors={result.errors} warnings={result.warnings}"
        assert any(
            "Model sieci z archiwum 2.x nie został odtworzony" in w for w in result.warnings
        ), result.warnings
        assert any("placeholder" in w for w in result.warnings), result.warnings

        # Projekt i przypadek ZOSTAJĄ mimo braku modelu (nic nie ginie po cichu).
        imported_cases = (
            test_db_session.query(StudyCaseORM)
            .filter(StudyCaseORM.project_id == result.project_id)
            .all()
        )
        assert len(imported_cases) == 1

        # Model NIE powstał.
        klucz = klucz_twin_projektu(result.project_id)
        assert not has_enm(klucz)
        assert result.elements_without_catalog == []
        assert result.catalog_mapping_required is False

    def test_2x_bez_enm_integrity_verification_off_still_migrates(
        self, test_db_session, enm_store_tmp
    ):
        """`verify_integrity=False` nie zmienia ścieżki migracji modelu legacy —
        obie flagi (weryfikacja wł./wył.) prowadzą przez ten sam kompilator."""
        archive_bytes = _zip_2x_bez_enm()

        service = ProjectArchiveService(test_db_session)
        result = service.import_project(
            archive_bytes, new_project_name="Import bez weryfikacji", verify_integrity=False
        )

        assert result.status in {
            ArchiveImportStatus.SUCCESS,
            ArchiveImportStatus.CATALOG_MAPPING_REQUIRED,
        }
        klucz = klucz_twin_projektu(result.project_id)
        assert has_enm(klucz)

    def test_reexport_of_migrated_2x_project_is_pure_300(self, test_db_session, enm_store_tmp):
        """Re-eksport projektu zaimportowanego z 2.x jest CZYSTYM formatem
        3.0.0 — żadnej sekcji „dla zgodności"."""
        archive_bytes = _zip_2x_bez_enm()
        service = ProjectArchiveService(test_db_session)
        result = service.import_project(archive_bytes, new_project_name="Import do re-eksportu")
        assert result.status in {
            ArchiveImportStatus.SUCCESS,
            ArchiveImportStatus.CATALOG_MAPPING_REQUIRED,
        }

        reexported = service.export_project(result.project_id)
        with zipfile.ZipFile(io.BytesIO(reexported), "r") as zf:
            project_json = json.loads(zf.read("project.json"))

        assert project_json["schema_version"] == ARCHIVE_SCHEMA_VERSION
        assert "network_model" not in project_json
        assert "sld_diagrams" not in project_json
        assert "proofs" not in project_json
        assert len(project_json["enm"]["models"]) == 1
