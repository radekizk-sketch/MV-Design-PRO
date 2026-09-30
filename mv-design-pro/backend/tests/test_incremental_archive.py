"""
Testy eksportu przyrostowego (Incremental Archive Export).

W1-B-ARCH: `network_model`/`sld_diagrams`/`proofs` skasowane razem z sekcjami
`ProjectArchive` formatu 3.0.0, którym odpowiadały (W1 skasował tabele ORM,
które je zasilały). `SECTION_NAMES` niesie odtąd siedem sekcji (`project_meta`,
`cases`, `runs`, `results`, `interpretations`, `issues`, `enm`) — testy zmian
sekcji używają `cases.study_cases`/`runs.canonical_runs` (sekcje, które ZOSTAJĄ)
w miejsce dawnych `network_model.nodes`/`proofs.design_specs`.

Pokrycie:
- Brak zmian → pusta delta (wszystkie UNCHANGED)
- Jedna sekcja zmieniona → tylko ta sekcja w delta
- Wiele sekcji zmienionych
- Nowa sekcja dodana
- Nałożenie delty → rekonstrukcja pełnego archiwum
- Deterministyczna sygnatura
- Roundtrip serializacji
- Oszczędność rozmiaru (delta < full)
- Wykrywanie niezgodności hash bazowego
- Łańcuch delt (baza → delta1 → delta2)
- Pusta delta bez danych sekcji
- Typ eksportu DELTA
- Weryfikacja fingerprints po apply
- Serializacja/deserializacja z nieprawidłowym ZIP
- Deserializacja z brakującym polem
- §0.1/§0.5: kontrakt siedmiu sekcji jest przypięty testem
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest
from domain.incremental_archive import (
    INCREMENTAL_FORMAT_ID,
    INCREMENTAL_SCHEMA_VERSION,
    SECTION_NAMES,
    BaseHashMismatchError,
    IncrementalExportResult,
    IncrementalExportType,
    IncrementalStructureError,
    SectionChangeStatus,
    SectionDelta,
    apply_incremental_archive,
    build_incremental_archive,
    compute_export_result,
    compute_section_deltas,
    deserialize_incremental,
    serialize_incremental,
)
from domain.project_archive import (
    ARCHIVE_FORMAT_ID,
    ARCHIVE_SCHEMA_VERSION,
    ArchiveFingerprints,
    CasesSection,
    InterpretationsSection,
    IssuesSection,
    ProjectArchive,
    ProjectMeta,
    ResultsSection,
    RunsSection,
    archive_to_dict,
    compute_archive_fingerprints,
)

# ============================================================================
# FIXTURES — tworzenie archiwum testowych (format 3.0.0)
# ============================================================================


def _make_fingerprints(
    project_meta: dict,
    cases: dict,
    runs: dict,
    results: dict,
    interpretations: dict | None = None,
    issues: dict | None = None,
) -> ArchiveFingerprints:
    """Pomocnicza fabryka fingerprints."""
    return compute_archive_fingerprints(
        project_meta=project_meta,
        cases=cases,
        runs=runs,
        results=results,
        interpretations=interpretations or {"cached": []},
        issues=issues or {"snapshot": []},
    )


def _make_archive(
    study_cases: list | None = None,
    canonical_runs: list | None = None,
    project_name: str = "TestProject",
) -> ProjectArchive:
    """Fabryka pełnego archiwum testowego z opcjonalnymi nadpisaniami."""
    pm_dict = {
        "id": "proj-001",
        "name": project_name,
        "description": "Projekt testowy",
        "schema_version": ARCHIVE_SCHEMA_VERSION,
        "connection_node_id": None,
        "sources": [],
        "created_at": "2025-01-01T00:00:00",
        "updated_at": "2025-01-01T00:00:00",
    }
    cases_dict = {
        "study_cases": study_cases or [],
        "operating_cases": [],
        "settings": None,
    }
    # CV-3.3-B: wyniki biegow zyja w sekcji `runs` (`canonical_runs`, R1,
    # kazdy bieg niesie `raw_result`); `results` to pusty kontener, ktory
    # zostaje w strukturze i odcisku archiwum.
    runs_dict = {"canonical_runs": canonical_runs or [], "analysis_runs_index": []}
    results_dict: dict = {}
    interp_dict = {"cached": []}
    issues_dict = {"snapshot": []}

    fp = _make_fingerprints(pm_dict, cases_dict, runs_dict, results_dict, interp_dict, issues_dict)

    return ProjectArchive(
        schema_version=ARCHIVE_SCHEMA_VERSION,
        format_id=ARCHIVE_FORMAT_ID,
        project_meta=ProjectMeta(**pm_dict),
        cases=CasesSection(**cases_dict),
        runs=RunsSection(**runs_dict),
        results=ResultsSection(),
        interpretations=InterpretationsSection(**interp_dict),
        issues=IssuesSection(**issues_dict),
        fingerprints=fp,
    )


# ============================================================================
# TESTY
# ============================================================================


class TestFormat300Contract:
    """§0.1/§0.5: siedem sekcji formatu 3.0.0 — kontrakt przypięty testem
    (KLASA NIE INSTANCJA §4 — deklaracja bez testu jest fałszywą pewnością)."""

    def test_section_names_has_no_deleted_sections(self):
        deleted = {"network_model", "sld_diagrams", "proofs"}
        assert deleted.isdisjoint(SECTION_NAMES)
        assert set(SECTION_NAMES) == {
            "project_meta",
            "cases",
            "runs",
            "results",
            "interpretations",
            "issues",
            "enm",
        }

    def test_section_names_has_seven_entries(self):
        assert len(SECTION_NAMES) == 7


class TestComputeSectionDeltas:
    """Testy compute_section_deltas."""

    def test_no_changes_all_unchanged(self) -> None:
        """Brak zmian → wszystkie sekcje UNCHANGED."""
        archive = _make_archive()
        deltas = compute_section_deltas(archive.fingerprints, archive)

        assert len(deltas) == len(SECTION_NAMES)
        for d in deltas:
            assert d.status == SectionChangeStatus.UNCHANGED
            assert d.data is None

    def test_single_section_changed(self) -> None:
        """Zmiana jednej sekcji (cases) → tylko ta sekcja MODIFIED."""
        base = _make_archive()
        modified = _make_archive(
            study_cases=[
                {"id": "sc1", "name": "Przypadek 1"},
                {"id": "sc2", "name": "Przypadek 2"},
            ]
        )

        deltas = compute_section_deltas(base.fingerprints, modified)
        delta_map = {d.section_name: d for d in deltas}

        assert delta_map["cases"].status == SectionChangeStatus.MODIFIED
        assert delta_map["cases"].data is not None
        assert len(delta_map["cases"].data["study_cases"]) == 2

        # Inne sekcje powinny być UNCHANGED
        for name in ("runs", "results", "interpretations", "issues", "enm"):
            assert delta_map[name].status == SectionChangeStatus.UNCHANGED
            assert delta_map[name].data is None

    def test_multiple_sections_changed(self) -> None:
        """Zmiana wielu sekcji → odpowiednie sekcje MODIFIED."""
        base = _make_archive()
        modified = _make_archive(
            study_cases=[{"id": "sc1", "name": "Przypadek 1"}],
            canonical_runs=[
                {"id": "r1", "analysis_type": "power_flow", "raw_result": {"value": 42}}
            ],
        )

        deltas = compute_section_deltas(base.fingerprints, modified)
        delta_map = {d.section_name: d for d in deltas}

        assert delta_map["cases"].status == SectionChangeStatus.MODIFIED
        assert delta_map["runs"].status == SectionChangeStatus.MODIFIED

        # Inne sekcje powinny być UNCHANGED
        unchanged_names = {"results", "interpretations", "issues", "enm"}
        for name in unchanged_names:
            assert delta_map[name].status == SectionChangeStatus.UNCHANGED

    def test_section_with_empty_old_hash_is_added(self) -> None:
        """Sekcja z pustym hash w bazie → status ADDED."""
        archive = _make_archive()

        # Stwórz fingerprints z pustym hash interpretations
        base_fp = ArchiveFingerprints(
            archive_hash=archive.fingerprints.archive_hash,
            project_meta_hash=archive.fingerprints.project_meta_hash,
            cases_hash=archive.fingerprints.cases_hash,
            runs_hash=archive.fingerprints.runs_hash,
            results_hash=archive.fingerprints.results_hash,
            interpretations_hash="",  # pusty = sekcja nie istniała
            issues_hash=archive.fingerprints.issues_hash,
        )

        deltas = compute_section_deltas(base_fp, archive)
        delta_map = {d.section_name: d for d in deltas}

        assert delta_map["interpretations"].status == SectionChangeStatus.ADDED
        assert delta_map["interpretations"].data is not None
        assert delta_map["interpretations"].old_hash is None


class TestBuildIncrementalArchive:
    """Testy build_incremental_archive."""

    def test_build_empty_delta(self) -> None:
        """Brak zmian → IncrementalArchive z pustą deltą."""
        archive = _make_archive()
        incr = build_incremental_archive(
            archive.fingerprints, archive, base_timestamp="2025-06-01T00:00:00Z"
        )

        assert incr.format_id == INCREMENTAL_FORMAT_ID
        assert incr.schema_version == INCREMENTAL_SCHEMA_VERSION
        assert incr.export_type == IncrementalExportType.DELTA
        assert incr.base_archive_hash == archive.fingerprints.archive_hash
        assert incr.base_timestamp == "2025-06-01T00:00:00Z"
        assert len(incr.deltas) == len(SECTION_NAMES)

        for d in incr.deltas:
            assert d.status == SectionChangeStatus.UNCHANGED

    def test_build_with_changes(self) -> None:
        """Zmiany w sekcjach → IncrementalArchive z deltami."""
        base = _make_archive()
        modified = _make_archive(
            study_cases=[
                {"id": "sc1", "name": "Przypadek 1"},
                {"id": "sc3", "name": "Przypadek 3"},
            ]
        )
        incr = build_incremental_archive(base.fingerprints, modified)

        delta_map = {d.section_name: d for d in incr.deltas}
        assert delta_map["cases"].status == SectionChangeStatus.MODIFIED
        assert delta_map["cases"].data is not None

    def test_deterministic_signature_consistency(self) -> None:
        """Ta sama delta → taka sama sygnatura (determinizm)."""
        base = _make_archive()
        modified = _make_archive(study_cases=[{"id": "sc1", "name": "Przypadek 1"}])

        ts = "2025-06-01T12:00:00Z"
        incr1 = build_incremental_archive(base.fingerprints, modified, base_timestamp=ts)
        incr2 = build_incremental_archive(base.fingerprints, modified, base_timestamp=ts)

        assert incr1.deterministic_signature == incr2.deterministic_signature

    def test_different_changes_different_signature(self) -> None:
        """Różne zmiany → różna sygnatura."""
        base = _make_archive()
        mod_a = _make_archive(study_cases=[{"id": "sc1", "name": "X"}])
        mod_b = _make_archive(study_cases=[{"id": "sc1", "name": "Y"}])

        ts = "2025-06-01T12:00:00Z"
        incr_a = build_incremental_archive(base.fingerprints, mod_a, base_timestamp=ts)
        incr_b = build_incremental_archive(base.fingerprints, mod_b, base_timestamp=ts)

        assert incr_a.deterministic_signature != incr_b.deterministic_signature


class TestApplyIncrementalArchive:
    """Testy apply_incremental_archive."""

    def test_apply_empty_delta_returns_same(self) -> None:
        """Pusta delta → wynik identyczny z bazą."""
        archive = _make_archive()
        incr = build_incremental_archive(archive.fingerprints, archive)
        result = apply_incremental_archive(archive, incr)

        assert result.fingerprints.archive_hash == archive.fingerprints.archive_hash
        result_dict = archive_to_dict(result)
        base_dict = archive_to_dict(archive)
        assert result_dict == base_dict

    def test_apply_delta_reconstructs_modified(self) -> None:
        """Nałożenie delty → rekonstrukcja zmodyfikowanego archiwum."""
        base = _make_archive()
        modified = _make_archive(
            study_cases=[
                {"id": "sc1", "name": "Przypadek A"},
                {"id": "sc2", "name": "Przypadek B"},
            ]
        )

        incr = build_incremental_archive(base.fingerprints, modified)
        result = apply_incremental_archive(base, incr)

        result_dict = archive_to_dict(result)
        expected_dict = archive_to_dict(modified)

        assert result_dict == expected_dict
        assert result.fingerprints.archive_hash == modified.fingerprints.archive_hash

    def test_apply_base_hash_mismatch_raises(self) -> None:
        """Niezgodność hash bazowego → BaseHashMismatchError."""
        base = _make_archive()
        other_base = _make_archive(study_cases=[{"id": "sc99", "name": "Inny"}])
        modified = _make_archive(
            canonical_runs=[{"id": "r1", "analysis_type": "power_flow", "raw_result": {"val": 100}}]
        )

        incr = build_incremental_archive(base.fingerprints, modified)

        with pytest.raises(BaseHashMismatchError):
            apply_incremental_archive(other_base, incr)

    def test_chain_of_deltas(self) -> None:
        """Łańcuch delt: baza → delta1 → delta2 → finalne archiwum."""
        # Krok 0: baza
        base = _make_archive()

        # Krok 1: dodajemy przypadek
        step1 = _make_archive(
            study_cases=[
                {"id": "sc1", "name": "Przypadek 1"},
                {"id": "sc2", "name": "Przypadek 2"},
            ]
        )
        delta1 = build_incremental_archive(base.fingerprints, step1)
        reconstructed1 = apply_incremental_archive(base, delta1)

        assert archive_to_dict(reconstructed1) == archive_to_dict(step1)

        # Krok 2: dodajemy bieg kanoniczny
        step2 = _make_archive(
            study_cases=[
                {"id": "sc1", "name": "Przypadek 1"},
                {"id": "sc2", "name": "Przypadek 2"},
            ],
            canonical_runs=[{"id": "r1", "analysis_type": "power_flow", "raw_result": {}}],
        )
        delta2 = build_incremental_archive(reconstructed1.fingerprints, step2)
        reconstructed2 = apply_incremental_archive(reconstructed1, delta2)

        assert archive_to_dict(reconstructed2) == archive_to_dict(step2)
        assert reconstructed2.fingerprints.archive_hash == step2.fingerprints.archive_hash


class TestSerializationRoundtrip:
    """Testy serializacji i deserializacji."""

    def test_roundtrip_empty_delta(self) -> None:
        """Roundtrip serializacji pustej delty."""
        archive = _make_archive()
        incr = build_incremental_archive(archive.fingerprints, archive)

        data = serialize_incremental(incr)
        restored = deserialize_incremental(data)

        assert restored.format_id == incr.format_id
        assert restored.schema_version == incr.schema_version
        assert restored.base_archive_hash == incr.base_archive_hash
        assert restored.export_type == incr.export_type
        assert restored.deterministic_signature == incr.deterministic_signature
        assert len(restored.deltas) == len(incr.deltas)

    def test_roundtrip_with_changes(self) -> None:
        """Roundtrip serializacji delty ze zmianami."""
        base = _make_archive()
        modified = _make_archive(
            study_cases=[
                {"id": "sc1", "name": "Przypadek 1"},
                {"id": "sc2", "name": "Nowy przypadek"},
            ],
            canonical_runs=[{"id": "r1", "analysis_type": "short_circuit", "raw_result": {}}],
        )

        incr = build_incremental_archive(base.fingerprints, modified)
        data = serialize_incremental(incr)
        restored = deserialize_incremental(data)

        # Zweryfikuj delty
        orig_map = {d.section_name: d for d in incr.deltas}
        rest_map = {d.section_name: d for d in restored.deltas}

        for name in orig_map:
            assert orig_map[name].status == rest_map[name].status
            assert orig_map[name].old_hash == rest_map[name].old_hash
            assert orig_map[name].new_hash == rest_map[name].new_hash

        # Zweryfikuj fingerprints
        assert restored.fingerprints.archive_hash == incr.fingerprints.archive_hash

    def test_roundtrip_then_apply(self) -> None:
        """Serializacja → deserializacja → nałożenie delty → poprawny wynik."""
        base = _make_archive()
        modified = _make_archive(
            canonical_runs=[
                {"id": "r1", "analysis_type": "short_circuit", "raw_result": {"ik3": 12.5}}
            ]
        )

        incr = build_incremental_archive(base.fingerprints, modified)
        data = serialize_incremental(incr)
        restored_incr = deserialize_incremental(data)

        result = apply_incremental_archive(base, restored_incr)
        assert archive_to_dict(result) == archive_to_dict(modified)

    def test_serialized_is_valid_zip(self) -> None:
        """Wynik serializacji to prawidłowy plik ZIP z incremental.json."""
        archive = _make_archive()
        incr = build_incremental_archive(archive.fingerprints, archive)
        data = serialize_incremental(incr)

        buf = io.BytesIO(data)
        with zipfile.ZipFile(buf, "r") as zf:
            assert "incremental.json" in zf.namelist()
            content = json.loads(zf.read("incremental.json").decode("utf-8"))
            assert content["format_id"] == INCREMENTAL_FORMAT_ID


class TestSizeSavings:
    """Testy weryfikacji oszczędności rozmiaru."""

    def test_delta_smaller_than_full(self) -> None:
        """Delta powinna być mniejsza niż pełne archiwum."""
        base = _make_archive(
            study_cases=[{"id": f"sc{i}", "name": f"Przypadek {i}"} for i in range(50)],
            canonical_runs=[
                {"id": f"r{i}", "analysis_type": "power_flow", "raw_result": {"value": i * 1.1}}
                for i in range(30)
            ],
        )

        # Niewielka zmiana — tylko wyniki biegow (sekcja `runs`)
        modified = _make_archive(
            study_cases=[{"id": f"sc{i}", "name": f"Przypadek {i}"} for i in range(50)],
            canonical_runs=[
                {"id": f"r{i}", "analysis_type": "power_flow", "raw_result": {"value": i * 2.2}}
                for i in range(30)  # zmienione wyniki biegow
            ],
        )

        incr = build_incremental_archive(base.fingerprints, modified)
        delta_bytes = serialize_incremental(incr)

        # Serializuj pełne archiwum dla porównania
        full_json = json.dumps(archive_to_dict(modified), sort_keys=True, indent=2)
        full_buf = io.BytesIO()
        with zipfile.ZipFile(full_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("archive.json", full_json)
        full_bytes = full_buf.getvalue()

        assert len(delta_bytes) < len(full_bytes)

    def test_compute_export_result_metrics(self) -> None:
        """compute_export_result zwraca poprawne metryki."""
        # Duże, NIEZMIENIONE `canonical_runs` w obu archiwach — pełny rozmiar
        # rośnie, ale delta ich pomija (sekcja `runs` nie zmieniła się), więc
        # oszczędność jest widoczna dopiero przy realnym rozmiarze archiwum
        # (jak przy dużej sieci — usuniętej razem z network_model, W1).
        niezmienione_biegi = [
            {
                "id": f"r{i}",
                "analysis_type": "power_flow",
                "raw_result": {"value": i, "pad": "x" * 200},
            }
            for i in range(100)
        ]
        base = _make_archive(
            study_cases=[{"id": f"sc{i}", "name": f"Przypadek {i}"} for i in range(100)],
            canonical_runs=niezmienione_biegi,
        )
        modified = _make_archive(
            study_cases=[{"id": f"sc{i}", "name": f"Przypadek zmieniony {i}"} for i in range(100)],
            canonical_runs=niezmienione_biegi,
        )

        incr = build_incremental_archive(base.fingerprints, modified)
        delta_bytes = serialize_incremental(incr)

        full_json = json.dumps(archive_to_dict(modified), sort_keys=True)
        full_buf = io.BytesIO()
        with zipfile.ZipFile(full_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("archive.json", full_json)
        full_bytes = full_buf.getvalue()

        result = compute_export_result(modified, incr, full_bytes, delta_bytes)

        assert result.success is True
        assert result.size_full_bytes == len(full_bytes)
        assert result.size_delta_bytes == len(delta_bytes)
        assert result.sections_changed >= 0
        assert result.sections_unchanged >= 0
        assert result.sections_changed + result.sections_unchanged == len(SECTION_NAMES)
        assert result.savings_percent > 0.0


class TestErrorHandling:
    """Testy obsługi błędów."""

    def test_deserialize_invalid_zip(self) -> None:
        """Nieprawidłowy ZIP → IncrementalStructureError."""
        with pytest.raises(IncrementalStructureError, match="ZIP"):
            deserialize_incremental(b"not a zip file at all")

    def test_deserialize_zip_without_incremental_json(self) -> None:
        """ZIP bez incremental.json → IncrementalStructureError."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("other.txt", "hello")
        with pytest.raises(IncrementalStructureError, match="incremental.json"):
            deserialize_incremental(buf.getvalue())

    def test_deserialize_invalid_json(self) -> None:
        """Nieprawidłowy JSON → IncrementalStructureError."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("incremental.json", "{invalid json")
        with pytest.raises(IncrementalStructureError, match="JSON"):
            deserialize_incremental(buf.getvalue())

    def test_deserialize_missing_field(self) -> None:
        """Brakujące pole w JSON → IncrementalStructureError."""
        incomplete = {"format_id": INCREMENTAL_FORMAT_ID}
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("incremental.json", json.dumps(incomplete))
        with pytest.raises(IncrementalStructureError, match="Brak wymaganego pola"):
            deserialize_incremental(buf.getvalue())

    def test_deserialize_wrong_format_id(self) -> None:
        """Nieprawidłowy format_id → IncrementalStructureError."""
        data = {
            "format_id": "WRONG-FORMAT",
            "schema_version": INCREMENTAL_SCHEMA_VERSION,
            "base_archive_hash": "abc",
            "base_timestamp": "2025-01-01",
            "export_type": "DELTA",
            "deltas": [],
            "fingerprints": {},
            "deterministic_signature": "xyz",
        }
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("incremental.json", json.dumps(data))
        with pytest.raises(IncrementalStructureError, match="identyfikator"):
            deserialize_incremental(buf.getvalue())


class TestFingerprintsAfterApply:
    """Testy weryfikacji fingerprints po nałożeniu delty."""

    def test_fingerprints_match_after_apply(self) -> None:
        """Fingerprints po apply powinny odpowiadać fingerprints zmodyfikowanego archiwum."""
        base = _make_archive()
        modified = _make_archive(
            study_cases=[
                {"id": "sc1", "name": "Przypadek 1"},
                {"id": "sc2", "name": "Test"},
            ],
            canonical_runs=[{"id": "r1", "analysis_type": "power_flow", "raw_result": {}}],
        )

        incr = build_incremental_archive(base.fingerprints, modified)
        result = apply_incremental_archive(base, incr)

        assert result.fingerprints.archive_hash == modified.fingerprints.archive_hash
        assert result.fingerprints.cases_hash == modified.fingerprints.cases_hash
        assert result.fingerprints.runs_hash == modified.fingerprints.runs_hash

    def test_unchanged_sections_preserve_hash(self) -> None:
        """Sekcje UNCHANGED zachowują hash po nałożeniu delty."""
        base = _make_archive()
        modified = _make_archive(study_cases=[{"id": "sc1", "name": "Zmieniony"}])

        incr = build_incremental_archive(base.fingerprints, modified)
        result = apply_incremental_archive(base, incr)

        # results/interpretations nie zmieniło się — hash powinien być taki sam jak w bazie
        assert result.fingerprints.results_hash == base.fingerprints.results_hash
        assert result.fingerprints.interpretations_hash == base.fingerprints.interpretations_hash
        # runs nie zmieniło się
        assert result.fingerprints.runs_hash == base.fingerprints.runs_hash


class TestExportType:
    """Testy typu eksportu."""

    def test_export_type_is_always_delta(self) -> None:
        """build_incremental_archive zawsze zwraca typ DELTA."""
        archive = _make_archive()
        incr = build_incremental_archive(archive.fingerprints, archive)
        assert incr.export_type == IncrementalExportType.DELTA

    def test_incremental_export_type_enum_values(self) -> None:
        """IncrementalExportType ma wartości FULL i DELTA."""
        assert IncrementalExportType.FULL.value == "FULL"
        assert IncrementalExportType.DELTA.value == "DELTA"

    def test_section_change_status_enum_values(self) -> None:
        """SectionChangeStatus ma oczekiwane wartości."""
        assert SectionChangeStatus.UNCHANGED.value == "UNCHANGED"
        assert SectionChangeStatus.MODIFIED.value == "MODIFIED"
        assert SectionChangeStatus.ADDED.value == "ADDED"
        assert SectionChangeStatus.REMOVED.value == "REMOVED"


class TestFrozenDataclasses:
    """Testy niezmienności (frozen dataclasses)."""

    def test_section_delta_is_frozen(self) -> None:
        """SectionDelta jest frozen — nie można zmieniać pól."""
        delta = SectionDelta(
            section_name="test",
            status=SectionChangeStatus.UNCHANGED,
            old_hash="abc",
            new_hash="abc",
            data=None,
        )
        with pytest.raises(AttributeError):
            delta.status = SectionChangeStatus.MODIFIED  # type: ignore[misc]

    def test_incremental_archive_is_frozen(self) -> None:
        """IncrementalArchive jest frozen."""
        archive = _make_archive()
        incr = build_incremental_archive(archive.fingerprints, archive)
        with pytest.raises(AttributeError):
            incr.base_archive_hash = "new_hash"  # type: ignore[misc]

    def test_export_result_is_frozen(self) -> None:
        """IncrementalExportResult jest frozen."""
        result = IncrementalExportResult(
            success=True,
            archive_bytes=b"",
            sections_changed=1,
            sections_unchanged=6,
            size_full_bytes=100,
            size_delta_bytes=50,
            savings_percent=50.0,
        )
        with pytest.raises(AttributeError):
            result.success = False  # type: ignore[misc]
