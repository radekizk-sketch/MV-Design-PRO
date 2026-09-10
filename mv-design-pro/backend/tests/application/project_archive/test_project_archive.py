"""
Tests for Project Archive domain module — P31 / W1-B-ARCH.

KANON:
- Import/Export = NOT-A-SOLVER
- Zero nowych obliczeń
- Determinizm absolutny
- Kompatybilność wsteczna (archiwa 2.x wczytywalne, format 3.0.0 na wyjściu)

Testy:
- export → import → stan identyczny (format 3.0.0)
- determinism: 2× export = identyczne archiwum (hash)
- import starszej wersji (2.x, z sekcjami network_model/sld_diagrams/proofs) → działa,
  te sekcje są IGNOROWANE przez `dict_to_archive` (§0.1: klasy dla nich skasowane)
- `verify_archive_integrity` na SUROWYM słowniku, DOKŁADNA dla formatu 3.0.0 i 2.x (§0.3) —
  fikstura 2.x jest zbudowana NIEZALEŻNIE od kodu produkcyjnego (replika historycznej
  formuły `compute_archive_fingerprints`, opisanej w §0.2 karty W1-B-ARCH; nie ma jej
  już w repo — była w `domain/project_archive.py` przed tą kartą)
- kontrakt §0.1 jest PRZYPIĘTY testem: `NetworkModelSection`/`SldSection`/`ProofsSection`
  nie istnieją, `ProjectMeta`/`ArchiveFingerprints`/`CasesSection` nie mają skasowanych pól
  (reguła KLASA NIE INSTANCJA §4 — deklaracja bez testu jest fałszywą pewnością)
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from domain.project_archive import (
    ARCHIVE_FORMAT_ID,
    ARCHIVE_SCHEMA_VERSION,
    ArchiveFingerprints,
    ArchiveStructureError,
    ArchiveVersionError,
    CasesSection,
    EnmSection,
    InterpretationsSection,
    IssuesSection,
    ProjectArchive,
    ProjectMeta,
    ResultsSection,
    RunsSection,
    archive_to_dict,
    canonicalize,
    compute_archive_fingerprints,
    compute_hash,
    dict_to_archive,
    verify_archive_integrity,
)

# =============================================================================
# Fixtures — format 3.0.0 (produkcyjny kontrakt bieżący)
# =============================================================================


@pytest.fixture
def sample_project_meta() -> ProjectMeta:
    """Sample project metadata (format 3.0.0 — bez active_network_snapshot_id)."""
    return ProjectMeta(
        id=str(uuid4()),
        name="Projekt Testowy",
        description="Opis testowego projektu",
        schema_version="1.0.0",
        connection_node_id=str(uuid4()),
        sources=[{"type": "GRID", "ssc_mva": 100.0}],
        created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC).isoformat(),
        updated_at=datetime(2024, 1, 15, 12, 0, 0, tzinfo=UTC).isoformat(),
    )


@pytest.fixture
def sample_cases_section() -> CasesSection:
    """Sample cases section (format 3.0.0 — bez switching_states)."""
    return CasesSection(
        study_cases=[
            {
                "id": str(uuid4()),
                "name": "Przypadek 1",
                "description": "Opis przypadku",
                "study_jsonb": {},
                "is_active": True,
                "result_status": "NONE",
                "result_refs_jsonb": [],
                "revision": 1,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ],
        operating_cases=[],
        settings=None,
    )


@pytest.fixture
def sample_runs_section() -> RunsSection:
    """Sample runs section.

    CV-3.3-B: `RunsSection` niesie `canonical_runs` (R1) + `analysis_runs_index`
    (niezależna tabela koordynacji nastaw, zostaje) — `analysis_runs`/`study_runs`
    (R2/R3) skasowane razem z torem, który je pisał.
    """
    return RunsSection(
        canonical_runs=[],
        analysis_runs_index=[],
    )


@pytest.fixture
def sample_enm_dict() -> dict[str, Any]:
    return {"models": [{"case_id": str(uuid4()), "snapshot": {"buses": []}}]}


@pytest.fixture
def sample_archive(
    sample_project_meta,
    sample_cases_section,
    sample_runs_section,
    sample_enm_dict,
) -> ProjectArchive:
    """Create a complete sample archive (format 3.0.0)."""
    project_meta_dict = {
        "id": sample_project_meta.id,
        "name": sample_project_meta.name,
        "description": sample_project_meta.description,
        "schema_version": sample_project_meta.schema_version,
        "connection_node_id": sample_project_meta.connection_node_id,
        "sources": sample_project_meta.sources,
        "created_at": sample_project_meta.created_at,
        "updated_at": sample_project_meta.updated_at,
    }
    cases_dict = {
        "study_cases": sample_cases_section.study_cases,
        "operating_cases": sample_cases_section.operating_cases,
        "settings": sample_cases_section.settings,
    }
    runs_dict = {
        "canonical_runs": sample_runs_section.canonical_runs,
        "analysis_runs_index": sample_runs_section.analysis_runs_index,
    }
    # `archive_to_dict` zawsze pisze `"results": {}` (ResultsSection ma zero
    # pól) — fingerprint MUSI liczyć się z tego samego kształtu, inaczej
    # `verify_archive_integrity` zgłosiłby rozjazd hasha.
    results_dict: dict[str, Any] = {}
    interpretations_dict = {"cached": []}
    issues_dict = {"snapshot": []}

    fingerprints = compute_archive_fingerprints(
        project_meta=project_meta_dict,
        cases=cases_dict,
        runs=runs_dict,
        results=results_dict,
        interpretations=interpretations_dict,
        issues=issues_dict,
        enm=sample_enm_dict,
    )

    return ProjectArchive(
        schema_version=ARCHIVE_SCHEMA_VERSION,
        format_id=ARCHIVE_FORMAT_ID,
        project_meta=sample_project_meta,
        cases=sample_cases_section,
        runs=sample_runs_section,
        results=ResultsSection(),
        interpretations=InterpretationsSection(cached=[]),
        issues=IssuesSection(snapshot=[]),
        enm=EnmSection(models=sample_enm_dict["models"]),
        fingerprints=fingerprints,
    )


# =============================================================================
# Helper — fikstura archiwum FORMATU 2.x (§0.2), zbudowana NIEZALEŻNIE od kodu
# produkcyjnego (replika historycznej formuły `compute_archive_fingerprints`,
# usuniętej z `domain/project_archive.py` przez tę kartę). Karta W1-B-ARCH §2:
# „Fikstury 2.x budujesz z opisu kształtu w §0.2 (nie ma ich w repo)".
# =============================================================================


def _compute_hash_2x(data: Any) -> str:
    canonical = canonicalize(data)
    json_str = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


def _archiwum_2x(
    *,
    project_name: str = "Projekt 2.x",
    nodes: list[dict] | None = None,
) -> dict[str, Any]:
    """Archiwum RAW (surowy słownik) formatu 2.0.0 — dziesięć sekcji hashowanych
    (`network_model`/`sld_diagrams`(→sld_hash)/`proofs` WŁĄCZNIE), dokładnie jak
    liczyła je formuła sprzed W1-B-ARCH."""
    pm = {
        "id": "legacy-proj-1",
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
        "nodes": (
            nodes
            if nodes is not None
            else [
                {
                    "id": "n1",
                    "name": "GPZ",
                    "node_type": "SLACK",
                    "base_kv": 15.0,
                    "attrs_jsonb": {},
                },
            ]
        ),
        "branches": [],
        "sources": [],
        "loads": [],
        "snapshots": [],
    }
    sld = {"diagrams": [], "node_symbols": [], "branch_symbols": [], "annotations": []}
    cases = {
        "study_cases": [],
        "operating_cases": [],
        "switching_states": [],
        "settings": None,
    }
    runs = {"canonical_runs": [], "analysis_runs_index": []}
    results: dict[str, Any] = {}
    proofs = {"design_specs": [], "design_proposals": [], "design_evidence": []}
    interpretations = {"cached": []}
    issues = {"snapshot": []}
    enm = {"models": []}

    section_hashes = {
        "project_meta": _compute_hash_2x(pm),
        "network_model": _compute_hash_2x(nm),
        "sld": _compute_hash_2x(sld),
        "cases": _compute_hash_2x(cases),
        "runs": _compute_hash_2x(runs),
        "results": _compute_hash_2x(results),
        "proofs": _compute_hash_2x(proofs),
        "interpretations": _compute_hash_2x(interpretations),
        "issues": _compute_hash_2x(issues),
        "enm": _compute_hash_2x(enm),
    }
    archive_hash = _compute_hash_2x(section_hashes)

    return {
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
        "enm": enm,
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
            "enm_hash": section_hashes["enm"],
        },
    }


# =============================================================================
# Test: Canonicalization and Hashing
# =============================================================================


class TestCanonicalization:
    """Tests for canonicalization and hashing."""

    def test_canonicalize_dict_sorts_keys(self):
        data = {"z": 1, "a": 2, "m": 3}
        result = canonicalize(data)
        assert list(result.keys()) == ["a", "m", "z"]

    def test_canonicalize_nested_dict(self):
        data = {"b": {"z": 1, "a": 2}, "a": 1}
        result = canonicalize(data)
        assert list(result.keys()) == ["a", "b"]
        assert list(result["b"].keys()) == ["a", "z"]

    def test_canonicalize_list(self):
        data = [{"b": 1, "a": 2}, {"d": 3, "c": 4}]
        result = canonicalize(data)
        assert list(result[0].keys()) == ["a", "b"]
        assert list(result[1].keys()) == ["c", "d"]

    def test_compute_hash_deterministic(self):
        data = {"name": "test", "value": 123}
        assert compute_hash(data) == compute_hash(data)

    def test_compute_hash_different_for_different_data(self):
        assert compute_hash({"name": "test1"}) != compute_hash({"name": "test2"})

    def test_compute_hash_order_independent(self):
        assert compute_hash({"a": 1, "b": 2}) == compute_hash({"b": 2, "a": 1})


# =============================================================================
# Test: §0.1 — kontrakt formatu 3.0.0 jest PRZYPIĘTY (KLASA NIE INSTANCJA §4)
# =============================================================================


class TestFormat300Contract:
    """`network_model`/`sld_diagrams`/`proofs` NIE ISTNIEJĄ w formacie 3.0.0."""

    def test_schema_version_is_3xx(self):
        assert ARCHIVE_SCHEMA_VERSION.startswith("3.")

    def test_deleted_section_classes_are_gone(self):
        import domain.project_archive as mod

        assert not hasattr(mod, "NetworkModelSection")
        assert not hasattr(mod, "SldSection")
        assert not hasattr(mod, "ProofsSection")

    def test_project_meta_has_no_active_network_snapshot_id(self):
        assert "active_network_snapshot_id" not in ProjectMeta.__dataclass_fields__
        assert "connection_node_id" in ProjectMeta.__dataclass_fields__

    def test_cases_section_has_no_switching_states(self):
        assert "switching_states" not in CasesSection.__dataclass_fields__
        assert set(CasesSection.__dataclass_fields__) == {
            "study_cases",
            "operating_cases",
            "settings",
        }

    def test_fingerprints_has_no_deleted_hash_fields(self):
        deleted = {"network_model_hash", "sld_hash", "proofs_hash"}
        assert deleted.isdisjoint(ArchiveFingerprints.__dataclass_fields__)
        assert set(ArchiveFingerprints.__dataclass_fields__) == {
            "archive_hash",
            "project_meta_hash",
            "cases_hash",
            "runs_hash",
            "results_hash",
            "interpretations_hash",
            "issues_hash",
            "enm_hash",
        }

    def test_project_archive_has_no_deleted_section_fields(self):
        deleted = {"network_model", "sld_diagrams", "proofs"}
        assert deleted.isdisjoint(ProjectArchive.__dataclass_fields__)

    def test_archive_to_dict_omits_deleted_sections(self, sample_archive):
        d = archive_to_dict(sample_archive)
        assert "network_model" not in d
        assert "sld_diagrams" not in d
        assert "proofs" not in d
        assert "enm" in d and "cases" in d and "runs" in d


# =============================================================================
# Test: Roundtrip (export → import → identical state)
# =============================================================================


class TestRoundtrip:
    """Tests for export → import roundtrip (format 3.0.0)."""

    def test_archive_to_dict_and_back(self, sample_archive):
        archive_dict = archive_to_dict(sample_archive)
        restored_archive = dict_to_archive(archive_dict)

        assert restored_archive.schema_version == sample_archive.schema_version
        assert restored_archive.format_id == sample_archive.format_id
        assert restored_archive.project_meta.name == sample_archive.project_meta.name
        assert restored_archive.project_meta.id == sample_archive.project_meta.id

    def test_roundtrip_preserves_cases(self, sample_archive):
        archive_dict = archive_to_dict(sample_archive)
        restored = dict_to_archive(archive_dict)

        assert len(restored.cases.study_cases) == len(sample_archive.cases.study_cases)
        assert restored.cases.study_cases[0]["name"] == sample_archive.cases.study_cases[0]["name"]

    def test_roundtrip_preserves_enm(self, sample_archive):
        archive_dict = archive_to_dict(sample_archive)
        restored = dict_to_archive(archive_dict)

        assert restored.enm.models == sample_archive.enm.models

    def test_roundtrip_preserves_fingerprints(self, sample_archive):
        archive_dict = archive_to_dict(sample_archive)
        restored = dict_to_archive(archive_dict)

        assert restored.fingerprints.archive_hash == sample_archive.fingerprints.archive_hash
        assert restored.fingerprints.enm_hash == sample_archive.fingerprints.enm_hash

    def test_roundtrip_export_import_export_is_bit_identical(self, sample_archive):
        """Eksport → import → eksport daje BIT W BIT ten sam project.json (§0.3)."""
        first = archive_to_dict(sample_archive)
        restored = dict_to_archive(first)
        second = archive_to_dict(restored)
        assert first == second
        assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


# =============================================================================
# Test: Import archiwum 2.x — sekcje skasowane są IGNOROWANE, nie fabrykowane
# =============================================================================


class TestLegacyImportIgnoresDeletedSections:
    def test_dict_to_archive_accepts_2x_and_ignores_network_model(self):
        legacy = _archiwum_2x()
        archive = dict_to_archive(legacy)

        assert archive.schema_version == "2.0.0"
        assert not hasattr(archive, "network_model")
        assert not hasattr(archive, "sld_diagrams")
        assert not hasattr(archive, "proofs")
        # Sekcje, które format 3.0.0 zna, zostały poprawnie odczytane.
        assert archive.cases.study_cases == []
        assert archive.enm.models == []

    def test_reexport_of_legacy_archive_is_pure_300(self):
        """Zaimportowane archiwum 2.x, wyeksportowane ponownie, jest CZYSTYM 3.0.0
        (żadnej sekcji „dla zgodności")."""
        archive = dict_to_archive(_archiwum_2x())
        # `archive_to_dict` pisze schema_version z obiektu — symulujemy pełny
        # cykl importu (assembler zawsze zapisuje ARCHIVE_SCHEMA_VERSION bieżący,
        # nie wersję pliku źródłowego — to sprawdza service.py; tu sprawdzamy
        # wyłącznie kształt sekcji, niezależnie od wersji na obiekcie).
        d = archive_to_dict(archive)
        assert "network_model" not in d
        assert "sld_diagrams" not in d
        assert "proofs" not in d


# =============================================================================
# Test: verify_archive_integrity — SUROWY słownik, DOKŁADNA dla obu wersji (§0.3)
# =============================================================================


class TestVerifyArchiveIntegrityRawDict:
    """`verify_archive_integrity` bierze SUROWY dict — działa PRZED `dict_to_archive`,
    identycznie dla formatu 3.0.0 i 2.x (iloczyn cech: {3.0.0, 2.x} × {nietknięte,
    zmanipulowane})."""

    def test_valid_300_archive_has_no_errors(self, sample_archive):
        data = archive_to_dict(sample_archive)
        assert verify_archive_integrity(data) == []

    def test_valid_2x_archive_has_no_errors(self):
        """Fikstura 2.x zbudowana NIEZALEŻNIE (formuła sprzed karty) weryfikuje
        się DOKŁADNIE — dowód, że nowa `verify_archive_integrity` odtwarza bit
        w bit historyczny `archive_hash` (dziesięć sekcji, nazwa „sld" wewnątrz
        hasha-hashy)."""
        assert verify_archive_integrity(_archiwum_2x()) == []

    def test_tampered_300_project_meta_detected(self, sample_archive):
        data = archive_to_dict(sample_archive)
        data["project_meta"]["name"] = "ZMANIPULOWANE"
        errors = verify_archive_integrity(data)
        assert any("project_meta" in e for e in errors)
        assert any("archiwum" in e.lower() for e in errors)  # archive_hash też pęka

    def test_tampered_2x_network_model_detected(self):
        """Manipulacja sekcji, której format 3.0.0 już nie zna (`network_model`),
        MUSI zostać wykryta — inaczej weryfikacja 2.x byłaby „w przybliżeniu"."""
        data = _archiwum_2x()
        data["network_model"]["nodes"].append(
            {"id": "n2", "name": "Dopisany", "node_type": "PQ", "base_kv": 15.0, "attrs_jsonb": {}}
        )
        errors = verify_archive_integrity(data)
        assert any("network_model" in e for e in errors)

    def test_tampered_2x_sld_detected_under_sld_diagrams_key(self):
        data = _archiwum_2x()
        data["sld_diagrams"]["diagrams"].append({"id": "d1", "name": "X"})
        errors = verify_archive_integrity(data)
        assert any("sld_diagrams" in e for e in errors)

    def test_archive_hash_itself_is_verified_not_only_sections(self, sample_archive):
        """Sekcje owszem zgadzają się z ich hashami, ale `archive_hash` jest
        celowo podmieniony — MUSI być wykryty (poprzednia implementacja tego
        nie sprawdzała w ogóle)."""
        data = archive_to_dict(sample_archive)
        data["fingerprints"]["archive_hash"] = "0" * 64
        errors = verify_archive_integrity(data)
        assert any("archiwum" in e.lower() and "0" * 16 in e for e in errors)

    def test_missing_fingerprints_section_is_named_error_not_crash(self):
        errors = verify_archive_integrity({"project_meta": {}})
        assert errors and "fingerprints" in errors[0]

    def test_fingerprints_not_a_dict_is_named_error_not_crash(self):
        errors = verify_archive_integrity({"fingerprints": "not-a-dict"})
        assert errors and "fingerprints" in errors[0]


# =============================================================================
# Test: Determinism (2× export = identical archive)
# =============================================================================


class TestDeterminism:
    def test_double_export_identical_dict(self, sample_archive):
        dict1 = archive_to_dict(sample_archive)
        dict2 = archive_to_dict(sample_archive)
        assert json.dumps(dict1, sort_keys=True) == json.dumps(dict2, sort_keys=True)

    def test_double_export_identical_hash(self, sample_archive):
        assert compute_hash(archive_to_dict(sample_archive)) == compute_hash(
            archive_to_dict(sample_archive)
        )

    def test_fingerprints_deterministic(self):
        data = {"project_meta": {"id": "123", "name": "Test"}, "cases": {"study_cases": []}}

        fp1 = compute_archive_fingerprints(
            project_meta=data["project_meta"],
            cases=data["cases"],
            runs={},
            results={},
            interpretations={},
            issues={},
        )
        fp2 = compute_archive_fingerprints(
            project_meta=data["project_meta"],
            cases=data["cases"],
            runs={},
            results={},
            interpretations={},
            issues={},
        )

        assert fp1.archive_hash == fp2.archive_hash
        assert fp1.project_meta_hash == fp2.project_meta_hash

    def test_fingerprints_enm_defaults_to_empty_models(self):
        """`enm=None` (parametr domyślny) liczy się jak `{"models": []}` —
        zachowanie NIEZMIENIONE od formatu 2.x (żeby archiwa bez ENM miały
        stabilny, nie-pusty `enm_hash`)."""
        fp_none = compute_archive_fingerprints(
            project_meta={}, cases={}, runs={}, results={}, interpretations={}, issues={}
        )
        fp_explicit = compute_archive_fingerprints(
            project_meta={},
            cases={},
            runs={},
            results={},
            interpretations={},
            issues={},
            enm={"models": []},
        )
        assert fp_none.enm_hash == fp_explicit.enm_hash
        assert fp_none.enm_hash == compute_hash({"models": []})


# =============================================================================
# Test: Version Compatibility
# =============================================================================


class TestVersionCompatibility:
    def test_reject_incompatible_future_version(self):
        archive_dict = {
            "schema_version": "99.0.0",
            "format_id": ARCHIVE_FORMAT_ID,
            "project_meta": {},
            "cases": {},
            "runs": {},
            "results": {},
            "fingerprints": {},
        }

        with pytest.raises(ArchiveVersionError) as exc_info:
            dict_to_archive(archive_dict)

        assert "99.0.0" in str(exc_info.value)

    def test_accept_compatible_older_version(self, sample_archive):
        archive_dict = archive_to_dict(sample_archive)
        archive_dict["schema_version"] = "1.0.0"

        restored = dict_to_archive(archive_dict)
        assert restored.schema_version == "1.0.0"

    def test_accept_2x_version(self):
        restored = dict_to_archive(_archiwum_2x())
        assert restored.schema_version == "2.0.0"

    def test_reject_invalid_format_id(self, sample_archive):
        archive_dict = archive_to_dict(sample_archive)
        archive_dict["format_id"] = "INVALID-FORMAT"

        with pytest.raises(ArchiveStructureError) as exc_info:
            dict_to_archive(archive_dict)

        assert "INVALID-FORMAT" in str(exc_info.value)


# =============================================================================
# Test: Structure Validation
# =============================================================================


class TestStructureValidation:
    def test_reject_missing_required_section(self):
        archive_dict = {
            "schema_version": ARCHIVE_SCHEMA_VERSION,
            "format_id": ARCHIVE_FORMAT_ID,
            # Missing: project_meta, cases, etc.
        }

        with pytest.raises(ArchiveStructureError) as exc_info:
            dict_to_archive(archive_dict)

        assert "Brak wymaganej sekcji" in str(exc_info.value)

    def test_missing_required_section_does_not_mention_deleted_sections(self):
        """`network_model`/`sld_diagrams`/`proofs` NIE są już wymagane — format
        3.0.0 ich nie zna. Same siedem sekcji (z minimalną treścią `project_meta`
        — pola bez `.get()` w `dict_to_archive`) wystarcza, nic więcej."""
        archive_dict = {
            "schema_version": ARCHIVE_SCHEMA_VERSION,
            "format_id": ARCHIVE_FORMAT_ID,
            "project_meta": {
                "id": "p1",
                "name": "N",
                "schema_version": "1.0.0",
                "created_at": "2025-01-01T00:00:00",
                "updated_at": "2025-01-01T00:00:00",
            },
            "cases": {},
            "runs": {},
            "results": {},
            "fingerprints": {
                "archive_hash": "x",
                "project_meta_hash": "x",
                "cases_hash": "x",
                "runs_hash": "x",
                "results_hash": "x",
            },
        }
        # Nie brakuje żadnej wymaganej sekcji — nie powinno się rzucić.
        restored = dict_to_archive(archive_dict)
        assert restored.schema_version == ARCHIVE_SCHEMA_VERSION

    def test_accept_missing_optional_sections(self, sample_archive):
        archive_dict = archive_to_dict(sample_archive)
        del archive_dict["interpretations"]
        del archive_dict["issues"]

        restored = dict_to_archive(archive_dict)
        assert restored.interpretations.cached == []
        assert restored.issues.snapshot == []


# =============================================================================
# Test: Edge Cases
# =============================================================================


class TestEdgeCases:
    def test_empty_archive(self):
        empty_meta = ProjectMeta(
            id=str(uuid4()),
            name="Pusty projekt",
            description=None,
            schema_version="1.0.0",
            connection_node_id=None,
            sources=[],
            created_at=datetime.now(UTC).isoformat(),
            updated_at=datetime.now(UTC).isoformat(),
        )

        fingerprints = compute_archive_fingerprints(
            project_meta={"id": empty_meta.id, "name": empty_meta.name},
            cases={"study_cases": [], "operating_cases": [], "settings": None},
            runs={"canonical_runs": [], "analysis_runs_index": []},
            results={},
            interpretations={"cached": []},
            issues={"snapshot": []},
        )

        empty_archive = ProjectArchive(
            schema_version=ARCHIVE_SCHEMA_VERSION,
            format_id=ARCHIVE_FORMAT_ID,
            project_meta=empty_meta,
            cases=CasesSection([], [], None),
            runs=RunsSection([], []),
            results=ResultsSection(),
            interpretations=InterpretationsSection([]),
            issues=IssuesSection([]),
            fingerprints=fingerprints,
        )

        archive_dict = archive_to_dict(empty_archive)
        restored = dict_to_archive(archive_dict)

        assert restored.project_meta.name == "Pusty projekt"
        assert len(restored.cases.study_cases) == 0
        # NOTE: fingerprints powyżej celowo liczą się z SKRÓCONEGO project_meta
        # (tylko id/name) — `verify_archive_integrity` na PEŁNYM `archive_dict`
        # (wszystkie pola ProjectMeta) tu więc NIE zgadza się z zamysłem; pełne
        # pokrycie integralności niesie `TestVerifyArchiveIntegrityRawDict`.

    def test_unicode_in_names(self):
        meta = ProjectMeta(
            id=str(uuid4()),
            name="Projekt z polskimi znakami: ąęćżźółń",
            description="Opis z emoji: 🔌⚡",
            schema_version="1.0.0",
            connection_node_id=None,
            sources=[],
            created_at=datetime.now(UTC).isoformat(),
            updated_at=datetime.now(UTC).isoformat(),
        )

        fingerprints = compute_archive_fingerprints(
            project_meta={"id": meta.id, "name": meta.name, "description": meta.description},
            cases={},
            runs={},
            results={},
            interpretations={},
            issues={},
        )

        archive = ProjectArchive(
            schema_version=ARCHIVE_SCHEMA_VERSION,
            format_id=ARCHIVE_FORMAT_ID,
            project_meta=meta,
            cases=CasesSection([], [], None),
            runs=RunsSection([], []),
            results=ResultsSection(),
            interpretations=InterpretationsSection([]),
            issues=IssuesSection([]),
            fingerprints=fingerprints,
        )

        archive_dict = archive_to_dict(archive)
        json_str = json.dumps(archive_dict, ensure_ascii=False)
        parsed = json.loads(json_str)
        restored = dict_to_archive(parsed)

        assert "ąęćżźółń" in restored.project_meta.name
        assert "🔌" in (restored.project_meta.description or "")

    def test_large_cases_list(self):
        """Should handle large przypadków lists efficiently (zamiennik dawnego
        testu dużej sieci — sieć żyje teraz w ENM, nie w tej sekcji)."""
        study_cases = [
            {
                "id": str(uuid4()),
                "name": f"Przypadek {i}",
                "description": "",
                "study_jsonb": {},
                "is_active": i == 0,
                "result_status": "NONE",
                "result_refs_jsonb": [],
                "revision": 1,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
            for i in range(100)
        ]
        cases = {"study_cases": study_cases, "operating_cases": [], "settings": None}

        fingerprints = compute_archive_fingerprints(
            project_meta={"id": "test", "name": "Large"},
            cases=cases,
            runs={},
            results={},
            interpretations={},
            issues={},
        )

        archive = ProjectArchive(
            schema_version=ARCHIVE_SCHEMA_VERSION,
            format_id=ARCHIVE_FORMAT_ID,
            project_meta=ProjectMeta(
                id=str(uuid4()),
                name="Large Cases",
                description=None,
                schema_version="1.0.0",
                connection_node_id=None,
                sources=[],
                created_at=datetime.now(UTC).isoformat(),
                updated_at=datetime.now(UTC).isoformat(),
            ),
            cases=CasesSection(study_cases, [], None),
            runs=RunsSection([], []),
            results=ResultsSection(),
            interpretations=InterpretationsSection([]),
            issues=IssuesSection([]),
            fingerprints=fingerprints,
        )

        archive_dict = archive_to_dict(archive)
        restored = dict_to_archive(archive_dict)

        assert len(restored.cases.study_cases) == 100
