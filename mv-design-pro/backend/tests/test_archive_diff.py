"""
Testy Archive Diff — porownanie dwoch archiwow projektu.

W1-B-ARCH: sekcje `network_model`/`sld_diagrams`/`proofs` skasowane razem z
tabelami ORM, ktore je zasilaly (W1) — `compare_archives` porownuje ZAWSZE dwa
juz zaimportowane `ProjectArchive` (format 3.0.0), wiec te sekcje nie maja juz
zadnego zrodla danych. Testy element-diffow uzywaja teraz `cases.study_cases`/
`runs.canonical_runs` (sekcje, ktore ZOSTAJA i maja zdefiniowane list_keys) w
miejsce dawnych `network_model.nodes`/`network_model.branches`.

Pokrycie:
- Identyczne archiwa -> IDENTICAL
- Rozne metadane projektu -> MODIFIED z field changes
- Dodane/usuniete przypadki obliczeniowe -> correct element diffs
- Zmodyfikowany przypadek -> field-by-field changes
- Puste vs niepuste sekcje
- Sygnatura deterministyczna
- Szybka sciezka (ten sam hash archiwum)
- Format raportu PL
- Podsumowanie (summary counts)
- Wiele sekcji zmienionych jednoczesnie
- Serializacja roundtrip diff result
- compare_element_lists niezaleznie
- compare_sections niezaleznie
- diff_summary
- Format field change labels
- §0.1/§0.5: sekcje skasowane NIE są diffowane (kontrakt przypięty testem)
"""

from __future__ import annotations

import json

import pytest
from domain.archive_diff import _SECTION_HASH_MAP as SECTION_HASH_MAP
from domain.archive_diff import _SECTION_LABELS_PL as SECTION_LABELS_PL
from domain.archive_diff import (
    SECTION_LIST_KEYS,
    DiffStatus,
    ElementDiff,
    FieldChange,
    SectionDiff,
    compare_archives,
    compare_element_lists,
    compare_sections,
    diff_summary,
    format_diff_report_pl,
)
from domain.project_archive import (
    ARCHIVE_FORMAT_ID,
    ARCHIVE_SCHEMA_VERSION,
    CasesSection,
    InterpretationsSection,
    IssuesSection,
    ProjectArchive,
    ProjectMeta,
    ResultsSection,
    RunsSection,
    compute_archive_fingerprints,
)

# ============================================================================
# HELPER: tworzenie archiwum testowego (format 3.0.0)
# ============================================================================


def _make_archive(
    *,
    project_name: str = "Projekt testowy",
    study_cases: list[dict] | None = None,
    operating_cases: list[dict] | None = None,
    canonical_runs: list[dict] | None = None,
) -> ProjectArchive:
    """Utworz archiwum testowe z podanymi danymi."""
    if study_cases is None:
        study_cases = [
            {"id": "sc-1", "name": "Przypadek bazowy", "revision": 1},
        ]
    if operating_cases is None:
        operating_cases = []
    if canonical_runs is None:
        canonical_runs = []

    pm_dict = {
        "id": "proj-001",
        "name": project_name,
        "description": "Opis testowy",
        "schema_version": ARCHIVE_SCHEMA_VERSION,
        "connection_node_id": None,
        "sources": [],
        "created_at": "2025-01-01T00:00:00",
        "updated_at": "2025-01-01T00:00:00",
    }
    cases_dict = {
        "study_cases": study_cases,
        "operating_cases": operating_cases,
        "settings": None,
    }
    # CV-3.3-B: jedyny rejestr biegow w archiwum to `canonical_runs` (R1);
    # `results` jest pustym kontenerem (wynik biegu siedzi w samym biegu jako
    # `raw_result`), klucz zostaje w strukturze i odcisku.
    runs_dict = {"canonical_runs": canonical_runs, "analysis_runs_index": []}
    results_dict: dict = {}
    interpretations_dict = {"cached": []}
    issues_dict = {"snapshot": []}

    fp = compute_archive_fingerprints(
        project_meta=pm_dict,
        cases=cases_dict,
        runs=runs_dict,
        results=results_dict,
        interpretations=interpretations_dict,
        issues=issues_dict,
    )

    return ProjectArchive(
        schema_version=ARCHIVE_SCHEMA_VERSION,
        format_id=ARCHIVE_FORMAT_ID,
        project_meta=ProjectMeta(**pm_dict),
        cases=CasesSection(**cases_dict),
        runs=RunsSection(**runs_dict),
        results=ResultsSection(),
        interpretations=InterpretationsSection(**interpretations_dict),
        issues=IssuesSection(**issues_dict),
        fingerprints=fp,
    )


# ============================================================================
# TESTY
# ============================================================================


class TestFormat300Contract:
    """§0.1/§0.5: sekcje skasowane NIE są diffowane — kontrakt przypięty testem
    (KLASA NIE INSTANCJA §4 — deklaracja bez testu jest fałszywą pewnością)."""

    def test_deleted_sections_are_not_in_section_list_keys(self):
        deleted = {"network_model", "sld_diagrams", "proofs"}
        assert deleted.isdisjoint(SECTION_LIST_KEYS)

    def test_deleted_sections_are_not_in_hash_map(self):
        deleted = {"network_model", "sld_diagrams", "proofs"}
        assert deleted.isdisjoint(SECTION_HASH_MAP)
        assert set(SECTION_HASH_MAP) == {
            "project_meta",
            "cases",
            "runs",
            "results",
            "interpretations",
            "issues",
        }

    def test_deleted_sections_are_not_in_labels(self):
        deleted = {"network_model", "sld_diagrams", "proofs"}
        assert deleted.isdisjoint(SECTION_LABELS_PL)


class TestIdenticalArchives:
    """Testy identycznych archiwow."""

    def test_identical_archives_return_identical_status(self):
        archive_a = _make_archive()
        archive_b = _make_archive()
        result = compare_archives(archive_a, archive_b)
        assert result.overall_status == DiffStatus.IDENTICAL

    def test_identical_archives_no_section_diffs(self):
        archive_a = _make_archive()
        archive_b = _make_archive()
        result = compare_archives(archive_a, archive_b)
        assert len(result.section_diffs) == 0

    def test_identical_archives_same_hashes(self):
        archive_a = _make_archive()
        archive_b = _make_archive()
        result = compare_archives(archive_a, archive_b)
        assert result.archive_hash_a == result.archive_hash_b


class TestFastPath:
    """Testy szybkiej sciezki (identyczne hashe archiwow)."""

    def test_fast_path_returns_immediately(self):
        archive_a = _make_archive()
        archive_b = _make_archive()
        result = compare_archives(archive_a, archive_b)
        assert result.overall_status == DiffStatus.IDENTICAL
        assert result.section_diffs == ()

    def test_fast_path_summary_all_zeros(self):
        archive_a = _make_archive()
        result = compare_archives(archive_a, archive_a)
        assert result.summary["sections_total"] == 0
        assert result.summary["total_elements_added"] == 0
        assert result.summary["total_elements_removed"] == 0
        assert result.summary["total_elements_modified"] == 0


class TestModifiedProjectMeta:
    """Testy zmian w metadanych projektu."""

    def test_different_project_name_detected(self):
        archive_a = _make_archive(project_name="Projekt A")
        archive_b = _make_archive(project_name="Projekt B")
        result = compare_archives(archive_a, archive_b)
        assert result.overall_status == DiffStatus.MODIFIED

        pm_diffs = [sd for sd in result.section_diffs if sd.section_name == "project_meta"]
        assert len(pm_diffs) == 1
        assert pm_diffs[0].status == DiffStatus.MODIFIED


class TestCasesChanges:
    """Testy zmian w przypadkach obliczeniowych (`cases.study_cases`) — miejsce
    dawnych testow `network_model.nodes`/`branches` (sekcja skasowana, W1)."""

    def test_added_study_case_detected(self):
        cases_a = [{"id": "sc-1", "name": "Przypadek A"}]
        cases_b = [
            {"id": "sc-1", "name": "Przypadek A"},
            {"id": "sc-2", "name": "Przypadek B"},
        ]
        archive_a = _make_archive(study_cases=cases_a)
        archive_b = _make_archive(study_cases=cases_b)
        result = compare_archives(archive_a, archive_b)

        cases_diffs = [sd for sd in result.section_diffs if sd.section_name == "cases"]
        assert len(cases_diffs) == 1
        assert cases_diffs[0].elements_added == 1

        added = [ed for ed in cases_diffs[0].element_diffs if ed.status == DiffStatus.ADDED]
        assert len(added) == 1
        assert added[0].element_id == "sc-2"

    def test_removed_study_case_detected(self):
        cases_a = [
            {"id": "sc-1", "name": "Przypadek A"},
            {"id": "sc-2", "name": "Przypadek B"},
        ]
        cases_b = [{"id": "sc-1", "name": "Przypadek A"}]
        archive_a = _make_archive(study_cases=cases_a)
        archive_b = _make_archive(study_cases=cases_b)
        result = compare_archives(archive_a, archive_b)

        cases_diffs = [sd for sd in result.section_diffs if sd.section_name == "cases"]
        assert cases_diffs[0].elements_removed == 1

        removed = [ed for ed in cases_diffs[0].element_diffs if ed.status == DiffStatus.REMOVED]
        assert len(removed) == 1
        assert removed[0].element_id == "sc-2"

    def test_modified_study_case_field_by_field(self):
        cases_a = [{"id": "sc-1", "name": "Przypadek A", "revision": 1}]
        cases_b = [{"id": "sc-1", "name": "Przypadek A zmieniony", "revision": 2}]
        archive_a = _make_archive(study_cases=cases_a)
        archive_b = _make_archive(study_cases=cases_b)
        result = compare_archives(archive_a, archive_b)

        cases_diffs = [sd for sd in result.section_diffs if sd.section_name == "cases"]
        assert cases_diffs[0].elements_modified >= 1

        modified = [
            ed
            for ed in cases_diffs[0].element_diffs
            if ed.status == DiffStatus.MODIFIED and ed.element_id == "sc-1"
        ]
        assert len(modified) == 1
        field_names = {fc.field_name for fc in modified[0].field_changes}
        assert "name" in field_names
        assert "revision" in field_names

    def test_added_canonical_run_detected(self):
        """`runs.canonical_runs` — druga sekcja z zachowanymi list_keys."""
        archive_a = _make_archive(canonical_runs=[])
        archive_b = _make_archive(canonical_runs=[{"id": "run-1", "analysis_type": "power_flow"}])
        result = compare_archives(archive_a, archive_b)

        runs_diffs = [sd for sd in result.section_diffs if sd.section_name == "runs"]
        assert len(runs_diffs) == 1
        assert runs_diffs[0].elements_added == 1


class TestEmptyVsNonEmpty:
    """Testy pustych vs niepustych sekcji."""

    def test_empty_vs_nonempty_study_cases(self):
        archive_a = _make_archive(study_cases=[])
        archive_b = _make_archive(study_cases=[{"id": "sc-1", "name": "Przypadek"}])
        result = compare_archives(archive_a, archive_b)
        assert result.overall_status == DiffStatus.MODIFIED

        cases_diffs = [sd for sd in result.section_diffs if sd.section_name == "cases"]
        assert cases_diffs[0].elements_added == 1

    def test_nonempty_vs_empty_study_cases(self):
        archive_a = _make_archive(study_cases=[{"id": "sc-1", "name": "Przypadek"}])
        archive_b = _make_archive(study_cases=[])
        result = compare_archives(archive_a, archive_b)

        cases_diffs = [sd for sd in result.section_diffs if sd.section_name == "cases"]
        assert cases_diffs[0].elements_removed == 1


class TestDeterministicSignature:
    """Testy deterministycznosci sygnatury."""

    def test_same_input_same_signature(self):
        archive_a = _make_archive(project_name="A")
        archive_b = _make_archive(project_name="B")
        result_1 = compare_archives(archive_a, archive_b)
        result_2 = compare_archives(archive_a, archive_b)
        assert result_1.deterministic_signature == result_2.deterministic_signature

    def test_signature_is_sha256(self):
        archive_a = _make_archive(project_name="A")
        archive_b = _make_archive(project_name="B")
        result = compare_archives(archive_a, archive_b)
        assert len(result.deterministic_signature) == 64
        assert all(c in "0123456789abcdef" for c in result.deterministic_signature)

    def test_different_input_different_signature(self):
        archive_a = _make_archive(project_name="A")
        archive_b1 = _make_archive(project_name="B")
        archive_b2 = _make_archive(project_name="C")
        result_1 = compare_archives(archive_a, archive_b1)
        result_2 = compare_archives(archive_a, archive_b2)
        assert result_1.deterministic_signature != result_2.deterministic_signature


class TestPolishReport:
    """Testy raportu w jezyku polskim."""

    def test_identical_report(self):
        archive = _make_archive()
        result = compare_archives(archive, archive)
        report = format_diff_report_pl(result)
        assert "IDENTYCZNY" in report
        assert "Brak roznic" in report

    def test_modified_report_contains_section_info(self):
        archive_a = _make_archive(project_name="A")
        archive_b = _make_archive(project_name="B")
        result = compare_archives(archive_a, archive_b)
        report = format_diff_report_pl(result)
        assert "RAPORT ROZNIC ARCHIWOW" in report
        assert "ZMODYFIKOWANY" in report
        assert "Podsumowanie" in report

    def test_report_contains_element_details(self):
        cases_a = [{"id": "sc-1", "name": "Przypadek A"}]
        cases_b = [{"id": "sc-1", "name": "Przypadek B"}]
        archive_a = _make_archive(study_cases=cases_a)
        archive_b = _make_archive(study_cases=cases_b)
        result = compare_archives(archive_a, archive_b)
        report = format_diff_report_pl(result)
        assert "sc-1" in report
        assert "Przypadek A" in report or "Przypadek B" in report


class TestSummaryCounts:
    """Testy podsumowania (summary counts)."""

    def test_summary_all_zeros_for_identical(self):
        archive = _make_archive()
        result = compare_archives(archive, archive)
        summary = diff_summary(result)
        assert summary["overall_status"] == "IDENTICAL"
        assert summary["by_status"]["ADDED"] == 0
        assert summary["by_status"]["REMOVED"] == 0
        assert summary["by_status"]["MODIFIED"] == 0

    def test_summary_counts_added(self):
        archive_a = _make_archive(study_cases=[])
        archive_b = _make_archive(
            study_cases=[
                {"id": "sc-1", "name": "A"},
                {"id": "sc-2", "name": "B"},
            ]
        )
        result = compare_archives(archive_a, archive_b)
        summary = diff_summary(result)
        assert summary["by_status"]["ADDED"] == 2

    def test_summary_counts_mixed(self):
        cases_a = [
            {"id": "sc-1", "name": "A"},
            {"id": "sc-2", "name": "B"},
        ]
        cases_b = [
            {"id": "sc-1", "name": "A zmienione"},
            {"id": "sc-3", "name": "C"},
        ]
        archive_a = _make_archive(study_cases=cases_a)
        archive_b = _make_archive(study_cases=cases_b)
        result = compare_archives(archive_a, archive_b)
        summary = diff_summary(result)
        assert summary["by_status"]["MODIFIED"] >= 1  # sc-1 zmieniony
        assert summary["by_status"]["REMOVED"] >= 1  # sc-2 usuniety
        assert summary["by_status"]["ADDED"] >= 1  # sc-3 dodany


class TestMultipleSectionsChanged:
    """Testy zmian w wielu sekcjach jednoczesnie."""

    def test_multiple_sections_modified(self):
        archive_a = _make_archive(
            project_name="A",
            study_cases=[{"id": "sc-1", "name": "Przypadek"}],
            canonical_runs=[],
        )
        archive_b = _make_archive(
            project_name="B",
            study_cases=[
                {"id": "sc-1", "name": "Przypadek"},
                {"id": "sc-2", "name": "Nowy"},
            ],
            canonical_runs=[{"id": "run-1", "analysis_type": "power_flow"}],
        )
        result = compare_archives(archive_a, archive_b)
        assert result.overall_status == DiffStatus.MODIFIED

        modified_sections = [
            sd.section_name for sd in result.section_diffs if sd.status == DiffStatus.MODIFIED
        ]
        # project_meta (nazwa), cases (nowy przypadek), runs (nowy bieg)
        assert "project_meta" in modified_sections
        assert "cases" in modified_sections
        assert "runs" in modified_sections


class TestSerializationRoundtrip:
    """Testy serializacji roundtrip."""

    def test_diff_result_to_dict_roundtrip(self):
        archive_a = _make_archive(project_name="A")
        archive_b = _make_archive(project_name="B")
        result = compare_archives(archive_a, archive_b)

        d = result.to_dict()

        assert "archive_hash_a" in d
        assert "archive_hash_b" in d
        assert "overall_status" in d
        assert "section_diffs" in d
        assert "summary" in d
        assert "deterministic_signature" in d

        json_str = json.dumps(d, ensure_ascii=False)
        parsed = json.loads(json_str)
        assert parsed["overall_status"] == "MODIFIED"
        assert len(parsed["section_diffs"]) > 0

    def test_section_diff_to_dict(self):
        sd = SectionDiff(
            section_name="cases",
            status=DiffStatus.MODIFIED,
            hash_a="abc",
            hash_b="def",
            elements_added=1,
            elements_removed=2,
            elements_modified=3,
            element_diffs=(
                ElementDiff(
                    element_id="sc-1",
                    element_type="study_cases",
                    status=DiffStatus.MODIFIED,
                    field_changes=(
                        FieldChange(
                            field_name="name",
                            old_value="A",
                            new_value="B",
                            label_pl="Nazwa",
                        ),
                    ),
                ),
            ),
        )
        d = sd.to_dict()
        assert d["section_name"] == "cases"
        assert d["status"] == "MODIFIED"
        assert len(d["element_diffs"]) == 1
        assert len(d["element_diffs"][0]["field_changes"]) == 1

    def test_identical_result_to_dict(self):
        archive = _make_archive()
        result = compare_archives(archive, archive)
        d = result.to_dict()
        assert d["overall_status"] == "IDENTICAL"
        assert d["section_diffs"] == []


class TestCompareElementListsIndependent:
    """Testy compare_element_lists jako niezaleznej funkcji."""

    def test_empty_lists(self):
        diffs = compare_element_lists([], [])
        assert len(diffs) == 0

    def test_added_elements(self):
        list_a: list[dict] = []
        list_b = [{"id": "e1", "name": "Element 1"}]
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 1
        assert diffs[0].status == DiffStatus.ADDED
        assert diffs[0].element_id == "e1"

    def test_removed_elements(self):
        list_a = [{"id": "e1", "name": "Element 1"}]
        list_b: list[dict] = []
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 1
        assert diffs[0].status == DiffStatus.REMOVED

    def test_modified_element_field_change(self):
        list_a = [{"id": "e1", "name": "Stara", "value": 10}]
        list_b = [{"id": "e1", "name": "Nowa", "value": 20}]
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 1
        assert diffs[0].status == DiffStatus.MODIFIED
        field_names = {fc.field_name for fc in diffs[0].field_changes}
        assert "name" in field_names
        assert "value" in field_names

    def test_identical_elements_no_diff(self):
        list_a = [{"id": "e1", "name": "A", "value": 10}]
        list_b = [{"id": "e1", "name": "A", "value": 10}]
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 0


class TestCompareSectionsIndependent:
    """Testy compare_sections jako niezaleznej funkcji."""

    def test_identical_sections(self):
        data = {"study_cases": [{"id": "n1", "name": "A"}]}
        sd = compare_sections(data, data, "cases")
        assert sd.status == DiffStatus.IDENTICAL

    def test_modified_section(self):
        data_a = {"study_cases": [{"id": "n1", "name": "A"}]}
        data_b = {"study_cases": [{"id": "n1", "name": "B"}]}
        sd = compare_sections(data_a, data_b, "cases")
        assert sd.status == DiffStatus.MODIFIED
        assert sd.elements_modified == 1

    def test_section_without_list_keys(self):
        data_a = {"cached": [{"id": "c1", "text": "A"}]}
        data_b = {"cached": [{"id": "c1", "text": "B"}]}
        sd = compare_sections(data_a, data_b, "interpretations")
        assert sd.status == DiffStatus.MODIFIED
        # interpretations nie ma zdefiniowanych list_keys,
        # wiec element_diffs powinno byc puste
        assert len(sd.element_diffs) == 0

    def test_deleted_section_name_has_no_list_keys(self):
        """`network_model` nie jest już zdefiniowaną sekcją (§0.5) — porównanie
        WEDŁUG NAZWY nadal działa (hash całościowy), ale bez rozbicia na
        elementy — dokładnie jak dla dowolnej nieznanej nazwy sekcji."""
        data_a = {"nodes": [{"id": "n1", "name": "A"}]}
        data_b = {"nodes": [{"id": "n1", "name": "B"}]}
        sd = compare_sections(data_a, data_b, "network_model")
        assert sd.status == DiffStatus.MODIFIED
        assert sd.element_diffs == ()


class TestFieldChangeLabels:
    """Testy etykiet PL dla zmian pol."""

    def test_known_field_has_polish_label(self):
        list_a = [{"id": "e1", "name": "Stara"}]
        list_b = [{"id": "e1", "name": "Nowa"}]
        diffs = compare_element_lists(list_a, list_b)
        fc = diffs[0].field_changes[0]
        assert fc.label_pl == "Nazwa"

    def test_unknown_field_uses_field_name_as_label(self):
        list_a = [{"id": "e1", "custom_field": 1}]
        list_b = [{"id": "e1", "custom_field": 2}]
        diffs = compare_element_lists(list_a, list_b)
        fc = diffs[0].field_changes[0]
        assert fc.label_pl == "custom_field"


class TestEdgeCases:
    """Testy przypadkow brzegowych."""

    def test_element_with_none_vs_value(self):
        list_a = [{"id": "e1", "value": None}]
        list_b = [{"id": "e1", "value": 42}]
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 1
        assert diffs[0].status == DiffStatus.MODIFIED
        fc = diffs[0].field_changes[0]
        assert fc.old_value is None
        assert fc.new_value == 42

    def test_element_with_extra_field_in_b(self):
        list_a = [{"id": "e1", "name": "A"}]
        list_b = [{"id": "e1", "name": "A", "extra": "val"}]
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 1
        assert diffs[0].status == DiffStatus.MODIFIED
        field_names = {fc.field_name for fc in diffs[0].field_changes}
        assert "extra" in field_names

    def test_frozen_dataclasses(self):
        fc = FieldChange("name", "A", "B", "Nazwa")
        with pytest.raises(AttributeError):
            fc.field_name = "other"  # type: ignore[misc]

        ed = ElementDiff("e1", "nodes", DiffStatus.ADDED, ())
        with pytest.raises(AttributeError):
            ed.element_id = "e2"  # type: ignore[misc]
