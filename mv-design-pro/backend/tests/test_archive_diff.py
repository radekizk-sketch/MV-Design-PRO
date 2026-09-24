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
- Rozbicie każdej sekcji z producentem (karta porównania archiwów 2026-09-23):
  model sieci `enm` element po elemencie (model projektu, archiwum z modelami
  per przypadek, wpis-sentinel, brak modelu, tożsamość `ref_id`/`id`, obiekty
  zagnieżdżone), `project_meta` i `cases.settings` pole po polu,
  `runs.analysis_runs_index` po `run_id`
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
    EnmSection,
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
    analysis_runs_index: list[dict] | None = None,
    settings: dict | None = None,
    enm_models: list[dict] | None = None,
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
        "settings": settings,
    }
    # CV-3.3-B: jedyny rejestr biegow w archiwum to `canonical_runs` (R1);
    # `results` jest pustym kontenerem (wynik biegu siedzi w samym biegu jako
    # `raw_result`), klucz zostaje w strukturze i odcisku.
    runs_dict = {
        "canonical_runs": canonical_runs,
        "analysis_runs_index": analysis_runs_index or [],
    }
    results_dict: dict = {}
    interpretations_dict = {"cached": []}
    issues_dict = {"snapshot": []}
    enm_dict = {"models": enm_models or []}

    fp = compute_archive_fingerprints(
        project_meta=pm_dict,
        cases=cases_dict,
        runs=runs_dict,
        results=results_dict,
        interpretations=interpretations_dict,
        issues=issues_dict,
        enm=enm_dict,
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
        enm=EnmSection(**enm_dict),
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
        # Intencja: porównywane są DOKŁADNIE sekcje formatu 3.0.0 — łącznie z
        # modelem sieci `enm` (jedyny nośnik sieci od W1-B-ARCH). Przed kartą
        # porównania archiwów (2026-09-23) `enm` tu brakowało: archiwa różniące
        # się wyłącznie siecią dawały „zmienione" przy sześciu sekcjach identycznych.
        assert set(SECTION_HASH_MAP) == {
            "project_meta",
            "cases",
            "runs",
            "results",
            "interpretations",
            "issues",
            "enm",
        }
        assert set(SECTION_LABELS_PL) == set(SECTION_HASH_MAP)

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


# ============================================================================
# ROZBICIE SEKCJI: model sieci, obiekty pojedyncze, indeks biegow
# ============================================================================


def _model(
    *,
    buses: list[dict] | None = None,
    line_runs: list[dict] | None = None,
    header: dict | None = None,
    katalog_projektu: dict | None = None,
) -> dict:
    """Zrzut modelu sieci w ksztalcie `EnergyNetworkModel.model_dump(mode="json")`."""
    return {
        "header": header or {"name": "Siec", "revision": 1, "defaults": {"frequency_hz": 50.0}},
        "buses": buses or [],
        "branches": [],
        "line_runs": line_runs or [],
        "katalog_projektu": katalog_projektu,
    }


def _szyna(ref_id: str, voltage_kv: float, **pola: object) -> dict:
    return {
        "id": f"uuid-{ref_id}",
        "ref_id": ref_id,
        "name": ref_id,
        "voltage_kv": voltage_kv,
        **pola,
    }


def _enm(section_diffs: tuple[SectionDiff, ...]) -> SectionDiff:
    return next(sd for sd in section_diffs if sd.section_name == "enm")


def _klucze(sd: SectionDiff) -> set[tuple[str, str, DiffStatus]]:
    return {(ed.element_type, ed.element_id, ed.status) for ed in sd.element_diffs}


class TestModelSieci:
    """Sekcja `enm` — iloczyn cech: {jeden model projektu, modele per przypadek,
    sentinel bez przypadku, brak modelu} x {zmiana elementu, element dodany/usuniety,
    obiekt zagniezdzony, tozsamosc `ref_id` / `id`}."""

    def test_zmiana_tylko_sieci_daje_jedna_zmieniona_sekcje(self):
        model_a = _model(buses=[_szyna("SN-1", 15.0)])
        model_b = _model(buses=[_szyna("SN-1", 20.0), _szyna("NN-2", 0.4)])
        a = _make_archive(enm_models=[{"case_id": "sc-1", "snapshot": model_a}])
        b = _make_archive(enm_models=[{"case_id": "sc-1", "snapshot": model_b}])

        wynik = compare_archives(a, b)

        zmienione = [
            sd.section_name for sd in wynik.section_diffs if sd.status == DiffStatus.MODIFIED
        ]
        assert zmienione == ["enm"]
        assert wynik.summary["sections_modified"] == 1
        assert _klucze(_enm(wynik.section_diffs)) == {
            ("buses", "SN-1", DiffStatus.MODIFIED),
            ("buses", "NN-2", DiffStatus.ADDED),
        }
        raport = format_diff_report_pl(wynik)
        assert "--- Model sieci ---" in raport
        # Etykieta pola z pełnymi polskimi znakami i wartości w czytelnej postaci PL
        # (`tekst_wartosci_pl`: liczba całkowita bez „.0") — ekran i raport ją pokazują.
        assert "Napięcie znamionowe [kV]: 15 -> 20" in raport

    def test_ten_sam_model_pod_innymi_przypadkami_to_brak_zmiany_sieci(self):
        """Dwa projekty z ta sama siecia: wpisy pod roznymi przypadkami, hash sekcji
        rozny, siec identyczna — sekcja sieci IDENTYCZNA (przypadki w `cases`)."""
        model = _model(buses=[_szyna("SN-1", 15.0)])
        a = _make_archive(enm_models=[{"case_id": "sc-1", "snapshot": model}])
        b = _make_archive(
            study_cases=[{"id": "sc-9", "name": "Inny"}],
            enm_models=[
                {"case_id": "sc-9", "snapshot": model},
                {"case_id": "sc-10", "snapshot": model},
            ],
        )

        wynik = compare_archives(a, b)

        siec = _enm(wynik.section_diffs)
        assert siec.hash_a != siec.hash_b
        assert siec.status == DiffStatus.IDENTICAL
        assert siec.element_diffs == ()

    def test_sentinel_bez_przypadku_porownywany_jak_model_projektu(self):
        a = _make_archive(enm_models=[{"case_id": None, "snapshot": _model()}])
        b = _make_archive(
            enm_models=[{"case_id": "sc-1", "snapshot": _model(buses=[_szyna("SN-1", 15.0)])}]
        )

        assert _klucze(_enm(compare_archives(a, b).section_diffs)) == {
            ("buses", "SN-1", DiffStatus.ADDED)
        }

    @pytest.mark.parametrize("kierunek", ["dodany", "usuniety"])
    def test_brak_modelu_po_jednej_stronie(self, kierunek):
        z_modelem = _make_archive(
            enm_models=[{"case_id": "sc-1", "snapshot": _model(buses=[_szyna("SN-1", 15.0)])}]
        )
        bez_modelu = _make_archive()
        a, b = (bez_modelu, z_modelem) if kierunek == "dodany" else (z_modelem, bez_modelu)
        status = DiffStatus.ADDED if kierunek == "dodany" else DiffStatus.REMOVED

        assert _klucze(_enm(compare_archives(a, b).section_diffs)) == {("model", "model", status)}

    def test_modele_per_przypadek_porownywane_przypadek_po_przypadku(self):
        """Archiwum sprzed jednego modelu projektu: rozne modele pod przypadkami —
        bez wyboru „ktory wazniejszy", porownanie po przypadkach."""
        a = _make_archive(
            enm_models=[
                {"case_id": "sc-1", "snapshot": _model(buses=[_szyna("SN-1", 15.0)])},
                {"case_id": "sc-2", "snapshot": _model(buses=[_szyna("SN-1", 20.0)])},
            ]
        )
        b = _make_archive(
            enm_models=[
                {"case_id": "sc-1", "snapshot": _model(buses=[_szyna("SN-1", 15.0)])},
                {"case_id": "sc-2", "snapshot": _model(buses=[_szyna("SN-1", 30.0)])},
                {"case_id": "sc-3", "snapshot": _model()},
            ]
        )

        assert _klucze(_enm(compare_archives(a, b).section_diffs)) == {
            ("przypadek:sc-2.buses", "SN-1", DiffStatus.MODIFIED),
            ("przypadek:sc-3", "przypadek:sc-3", DiffStatus.ADDED),
        }

    def test_tozsamosc_id_dla_kolekcji_bez_ref_id(self):
        """`LineRun`/`ConnectionNode` nie maja `ref_id` — tozsamosc po `id`."""
        run_a = {"id": "RUN-1", "name": "Magistrala", "run_kind": "main_trunk", "segments": []}
        run_b = {**run_a, "run_kind": "ring"}
        a = _make_archive(enm_models=[{"case_id": "sc-1", "snapshot": _model(line_runs=[run_a])}])
        b = _make_archive(enm_models=[{"case_id": "sc-1", "snapshot": _model(line_runs=[run_b])}])

        siec = _enm(compare_archives(a, b).section_diffs)

        assert _klucze(siec) == {("line_runs", "RUN-1", DiffStatus.MODIFIED)}
        assert [fc.field_name for fc in siec.element_diffs[0].field_changes] == ["run_kind"]

    def test_obiekty_zagniezdzone_pole_po_polu(self):
        naglowek_a = {"name": "Siec", "revision": 1, "defaults": {"frequency_hz": 50.0}}
        naglowek_b = {"name": "Siec", "revision": 2, "defaults": {"frequency_hz": 60.0}}
        katalog = {"line_types": [{"id": "AFL-70", "r_ohm_per_km": 0.4}], "cable_types": []}
        a = _make_archive(enm_models=[{"case_id": "sc-1", "snapshot": _model(header=naglowek_a)}])
        b = _make_archive(
            enm_models=[
                {
                    "case_id": "sc-1",
                    "snapshot": _model(header=naglowek_b, katalog_projektu=katalog),
                }
            ]
        )

        siec = _enm(compare_archives(a, b).section_diffs)

        assert _klucze(siec) == {
            ("header", "header", DiffStatus.MODIFIED),
            ("header.defaults", "header.defaults", DiffStatus.MODIFIED),
            ("katalog_projektu", "katalog_projektu", DiffStatus.ADDED),
        }
        naglowek = next(ed for ed in siec.element_diffs if ed.element_id == "header")
        assert [fc.field_name for fc in naglowek.field_changes] == ["revision"]

    def test_sygnatura_obejmuje_siec(self):
        a = _make_archive(enm_models=[{"case_id": "sc-1", "snapshot": _model()}])
        b1 = _make_archive(
            enm_models=[{"case_id": "sc-1", "snapshot": _model(buses=[_szyna("SN-1", 15.0)])}]
        )
        b2 = _make_archive(
            enm_models=[{"case_id": "sc-1", "snapshot": _model(buses=[_szyna("SN-2", 15.0)])}]
        )
        sygnatura_1 = compare_archives(a, b1).deterministic_signature
        assert compare_archives(a, b1).deterministic_signature == sygnatura_1
        assert compare_archives(a, b2).deterministic_signature != sygnatura_1


class TestObiektyPojedyncze:
    """`project_meta` i `cases.settings` — zmiana wskazuje pola, nie sama sekcje."""

    def test_metadane_projektu_pole_po_polu(self):
        wynik = compare_archives(
            _make_archive(project_name="Projekt A"), _make_archive(project_name="Projekt B")
        )

        metadane = next(sd for sd in wynik.section_diffs if sd.section_name == "project_meta")
        assert _klucze(metadane) == {("project_meta", "project_meta", DiffStatus.MODIFIED)}
        zmiana = metadane.element_diffs[0].field_changes
        assert [(fc.field_name, fc.old_value, fc.new_value, fc.label_pl) for fc in zmiana] == [
            ("name", "Projekt A", "Projekt B", "Nazwa")
        ]

    def test_ustawienia_przypadkow_pole_po_polu(self):
        a = _make_archive(settings={"active_case_id": "sc-1", "limits_jsonb": {"u_min": 0.9}})
        b = _make_archive(settings={"active_case_id": "sc-2", "limits_jsonb": {"u_min": 0.95}})

        przypadki = next(
            sd for sd in compare_archives(a, b).section_diffs if sd.section_name == "cases"
        )

        assert _klucze(przypadki) == {
            ("settings", "settings", DiffStatus.MODIFIED),
            ("settings.limits_jsonb", "settings.limits_jsonb", DiffStatus.MODIFIED),
        }

    @pytest.mark.parametrize("kierunek", ["dodane", "usuniete"])
    def test_ustawienia_obecne_po_jednej_stronie(self, kierunek):
        z_ustawieniami = _make_archive(settings={"active_case_id": "sc-1"})
        bez = _make_archive()
        a, b = (bez, z_ustawieniami) if kierunek == "dodane" else (z_ustawieniami, bez)
        status = DiffStatus.ADDED if kierunek == "dodane" else DiffStatus.REMOVED

        przypadki = next(
            sd for sd in compare_archives(a, b).section_diffs if sd.section_name == "cases"
        )
        assert _klucze(przypadki) == {("settings", "settings", status)}


class TestIndeksBiegow:
    def test_indeks_biegow_po_run_id(self):
        wpis = {"run_id": "R-1", "analysis_type": "protection", "status": "FINISHED"}
        a = _make_archive(analysis_runs_index=[wpis])
        b = _make_archive(
            analysis_runs_index=[{**wpis, "status": "FAILED"}, {**wpis, "run_id": "R-2"}]
        )

        biegi = next(sd for sd in compare_archives(a, b).section_diffs if sd.section_name == "runs")

        assert _klucze(biegi) == {
            ("analysis_runs_index", "R-1", DiffStatus.MODIFIED),
            ("analysis_runs_index", "R-2", DiffStatus.ADDED),
        }


class TestKazdaZmienionaSekcjaMaRozbicie:
    """Deklaracja z `domain/archive_diff.py` („sekcja zmieniona MUSI mowic, co sie
    zmienilo") przypieta: dla KAZDEJ sekcji z producentem zmiana jednego pola daje
    niepusta liste elementow."""

    @pytest.mark.parametrize(
        ("sekcja", "a", "b"),
        [
            ("project_meta", {"project_name": "A"}, {"project_name": "B"}),
            (
                "cases",
                {"study_cases": [{"id": "s", "name": "A"}]},
                {"study_cases": [{"id": "s", "name": "B"}]},
            ),
            (
                "cases",
                {"operating_cases": [{"id": "o", "name": "A"}]},
                {"operating_cases": [{"id": "o", "name": "B"}]},
            ),
            ("cases", {"settings": {"x": 1}}, {"settings": {"x": 2}}),
            (
                "runs",
                {"canonical_runs": [{"id": "r", "status": "A"}]},
                {"canonical_runs": [{"id": "r", "status": "B"}]},
            ),
            (
                "runs",
                {"analysis_runs_index": [{"run_id": "r", "status": "A"}]},
                {"analysis_runs_index": [{"run_id": "r", "status": "B"}]},
            ),
            (
                "enm",
                {"enm_models": [{"case_id": "s", "snapshot": _model(buses=[_szyna("B", 1.0)])}]},
                {"enm_models": [{"case_id": "s", "snapshot": _model(buses=[_szyna("B", 2.0)])}]},
            ),
        ],
    )
    def test_zmieniona_sekcja_ma_elementy(self, sekcja, a, b):
        wynik = compare_archives(_make_archive(**a), _make_archive(**b))
        sd = next(s for s in wynik.section_diffs if s.section_name == sekcja)
        assert sd.status == DiffStatus.MODIFIED
        assert sd.element_diffs, f"sekcja {sekcja} zmieniona bez wskazania elementu"


# ============================================================================
# ODWOŁANIA DO ELEMENTÓW PO NAZWACH (karta ARCHIWUM PROJEKTU, 2026-09-24)
# ============================================================================


def _ciag(ref_id: str, nazwa: str, **pola: object) -> dict:
    return {"ref_id": ref_id, "name": nazwa, **pola}


def _zmiany_pol(sd: SectionDiff, element_id: str) -> dict[str, object]:
    ed = next(e for e in sd.element_diffs if e.element_id == element_id)
    return {fc.field_name: fc for fc in ed.field_changes}


class TestOdwolaniaPoNazwach:
    """Wartości pól-odwołań (`*_ref`, listy odwołań, obiekty z odwołaniem) w czytelnej
    postaci PL z NAZWAMI elementów — iloczyn cech: {skalar, lista, obiekt w liście} x
    {element nazwany w obu wersjach, przemianowany między wersjami, bez nazwy,
    odwołanie wiszące} x {jeden model projektu, modele per przypadek}. Surowe
    wartości bez zmian (audyt); pole tożsamości nigdy nie jest podstawiane."""

    @staticmethod
    def _porownaj():
        szyny_a = [
            _szyna("b1", 15.0, name="Szyna GPZ"),
            _szyna("b2", 15.0, name="Szyna stara"),
            _szyna("b3", 15.0, name=""),
        ]
        szyny_b = [
            _szyna("b1", 15.0, name="Szyna GPZ"),
            _szyna("b2", 15.0, name="Szyna nowa"),
            _szyna("b3", 15.0, name=""),
        ]
        ciag_a = _ciag(
            "run-1",
            "Ciąg 1",
            from_bus_ref="b1",
            stations=["b1"],
            segments=[{"order": 1, "segment_ref": "b1"}],
        )
        ciag_b = _ciag(
            "run-1",
            "Ciąg 1",
            from_bus_ref="b2",
            stations=["b1", "b2", "b3", "wiszace-odwolanie"],
            segments=[{"order": 1, "segment_ref": "b1"}, {"order": 2, "segment_ref": "b2"}],
        )
        a = _make_archive(
            enm_models=[{"case_id": "sc-1", "snapshot": _model(buses=szyny_a, line_runs=[ciag_a])}]
        )
        b = _make_archive(
            enm_models=[{"case_id": "sc-1", "snapshot": _model(buses=szyny_b, line_runs=[ciag_b])}]
        )
        return compare_archives(a, b)

    def test_skalar_przemianowany_element_nazwa_z_wlasnej_wersji(self):
        pola = _zmiany_pol(_enm(self._porownaj().section_diffs), "run-1")
        zmiana = pola["from_bus_ref"]
        assert (zmiana.old_value, zmiana.new_value) == ("b1", "b2")
        assert (zmiana.old_value_pl, zmiana.new_value_pl) == ("Szyna GPZ", "Szyna nowa")

    def test_lista_bez_nazwy_i_wiszace_odwolanie_zostaja_identyfikatorem(self):
        pola = _zmiany_pol(_enm(self._porownaj().section_diffs), "run-1")
        zmiana = pola["stations"]
        assert zmiana.old_value_pl == "Szyna GPZ"
        assert zmiana.new_value_pl == "Szyna GPZ, Szyna nowa, b3, wiszace-odwolanie"
        assert zmiana.new_value == ["b1", "b2", "b3", "wiszace-odwolanie"]

    def test_obiekty_w_liscie(self):
        pola = _zmiany_pol(_enm(self._porownaj().section_diffs), "run-1")
        zmiana = pola["segments"]
        assert zmiana.old_value_pl == "1) Kolejność: 1, Odcinek: Szyna GPZ"
        assert zmiana.new_value_pl == (
            "1) Kolejność: 1, Odcinek: Szyna GPZ; 2) Kolejność: 2, Odcinek: Szyna nowa"
        )

    def test_wartosc_bez_odwolan_to_tekst_wprost(self):
        pola = _zmiany_pol(_enm(self._porownaj().section_diffs), "b2")
        zmiana = pola["name"]
        assert (zmiana.old_value, zmiana.new_value) == ("Szyna stara", "Szyna nowa")
        assert (zmiana.old_value_pl, zmiana.new_value_pl) == ("Szyna stara", "Szyna nowa")

    def test_pole_tozsamosci_nie_jest_podstawiane_i_jest_audytowe(self):
        a = _make_archive(
            enm_models=[{"case_id": "sc-1", "snapshot": _model(buses=[_szyna("b1", 15.0)])}]
        )
        b = _make_archive(
            enm_models=[
                {
                    "case_id": "sc-1",
                    "snapshot": _model(buses=[_szyna("b1", 15.0, id="b1")]),
                }
            ]
        )
        zmiana = _zmiany_pol(_enm(compare_archives(a, b).section_diffs), "b1")["id"]
        # `b1` jest też nazwą szyny — pole tożsamości zostaje identyfikatorem.
        assert (zmiana.new_value, zmiana.new_value_pl, zmiana.audytowe) == ("b1", "b1", True)

    def test_modele_per_przypadek_biora_nazwy_z_wlasnego_przypadku(self):
        def _wpis(case_id: str, nazwa: str, ref: str | None) -> dict:
            return {
                "case_id": case_id,
                "snapshot": _model(
                    buses=[_szyna("b1", 15.0, name=nazwa)],
                    line_runs=[_ciag("run-1", "Ciąg", from_bus_ref=ref)],
                ),
            }

        a = _make_archive(
            enm_models=[_wpis("sc-1", "Nazwa sc-1", None), _wpis("sc-2", "Nazwa sc-2", None)]
        )
        b = _make_archive(
            enm_models=[_wpis("sc-1", "Nazwa sc-1", "b1"), _wpis("sc-2", "Nazwa sc-2", "b1")]
        )
        sd = _enm(compare_archives(a, b).section_diffs)
        zmiany = {
            ed.element_type: ed.field_changes[0]
            for ed in sd.element_diffs
            if ed.element_id == "run-1"
        }
        assert {typ: fc.new_value_pl for typ, fc in zmiany.items()} == {
            "przypadek:sc-1.line_runs": "Nazwa sc-1",
            "przypadek:sc-2.line_runs": "Nazwa sc-2",
        }
        assert {fc.old_value_pl for fc in zmiany.values()} == {"—"}

    def test_raport_tekstowy_nazywa_elementy_i_odwolania(self):
        raport = format_diff_report_pl(self._porownaj())
        assert "[ZMODYFIKOWANY] Ciągi linii 'Ciąg 1' (run-1)" in raport
        assert "Szyna GPZ -> Szyna nowa" in raport
        assert "[ZMODYFIKOWANY] Szyny 'Szyna nowa' (b2)" in raport
        assert "[" + '{"' not in raport  # zero surowego JSON-a

    def test_odpowiedz_serializuje_postac_pl_i_flage_audytowa(self):
        slownik = self._porownaj().to_dict()
        enm = next(s for s in slownik["section_diffs"] if s["section_name"] == "enm")
        ciag = next(e for e in enm["element_diffs"] if e["element_id"] == "run-1")
        pole = next(f for f in ciag["field_changes"] if f["field_name"] == "from_bus_ref")
        assert (pole["old_value_pl"], pole["new_value_pl"]) == ("Szyna GPZ", "Szyna nowa")
        assert pole["audytowe"] is False
        assert ciag["identyfikator_audytowy"] is False


# ============================================================================
# WARTOŚCI ZŁOŻONE PO POLSKU (karta ARCHIWUM PROJEKTU, odbiór 2026-09-24)
# ============================================================================

_SLOWNIK = {"u_max_pu": 1.1, "u_min_pu": 0.9}
_LISTA_SKALAROW = [0.4, 15, True]
_LISTA_OBIEKTOW = [{"order": 2, "segment_ref": "b2"}, {"order": 1, "segment_ref": "b1"}]
_ZAGNIEZDZENIE = {"limits": {"in_a": 250.5}, "tags": ["a", "b"], "overrides": []}
_NAZWY = {"b1": "Szyna GPZ", "b2": "Szyna nowa"}


class TestWartosciZlozonePoPolsku:
    """Czytelna postać PL wartości złożonych (`tekst_wartosci_pl`) — iloczyn cech:
    {słownik, lista skalarów, lista obiektów, zagnieżdżenie} x {strona A, strona B}.
    Nigdy surowy JSON; surowa wartość zostaje w `old_value`/`new_value`."""

    @pytest.mark.parametrize(
        ("wartosc", "oczekiwane"),
        [
            (_SLOWNIK, "Napięcie maksymalne [p.u.]: 1,1, Napięcie minimalne [p.u.]: 0,9"),
            (_LISTA_SKALAROW, "0,4, 15, tak"),
            (
                _LISTA_OBIEKTOW,
                "1) Kolejność: 2, Odcinek: Szyna nowa; 2) Kolejność: 1, Odcinek: Szyna GPZ",
            ),
            (
                _ZAGNIEZDZENIE,
                "Granice: (Prąd znamionowy [A]: 250,5), Nadpisania parametrów: brak, "
                "Znaczniki: (a, b)",
            ),
        ],
        ids=["slownik", "lista_skalarow", "lista_obiektow", "zagniezdzenie"],
    )
    @pytest.mark.parametrize("strona", ["A", "B"])
    def test_postac_pl_po_stronie(self, wartosc, oczekiwane, strona):
        from domain.archive_diff import tekst_wartosci_pl

        wezel = {"ref_id": "x", "name": "Obiekt", "pole": wartosc}
        pusty = {"ref_id": "x", "name": "Obiekt", "pole": None}
        a, b = (wezel, pusty) if strona == "A" else (pusty, wezel)
        model_a = _model(
            buses=[_szyna("b1", 15.0, name="Szyna GPZ"), _szyna("b2", 15.0, name="Szyna nowa")]
        )
        model_b = _model(
            buses=[_szyna("b1", 15.0, name="Szyna GPZ"), _szyna("b2", 15.0, name="Szyna nowa")]
        )
        model_a["line_runs"] = [a]
        model_b["line_runs"] = [b]
        wynik = compare_archives(
            _make_archive(enm_models=[{"case_id": "sc-1", "snapshot": model_a}]),
            _make_archive(enm_models=[{"case_id": "sc-1", "snapshot": model_b}]),
        )
        zmiana = _zmiany_pol(_enm(wynik.section_diffs), "x")["pole"]
        po_stronie = zmiana.old_value_pl if strona == "A" else zmiana.new_value_pl
        druga = zmiana.new_value_pl if strona == "A" else zmiana.old_value_pl
        assert po_stronie == oczekiwane
        assert druga == "—"
        assert "{" not in po_stronie and '"' not in po_stronie
        # Surowa wartość bez zmian (audyt).
        assert (zmiana.old_value if strona == "A" else zmiana.new_value) == wartosc
        # Funkcja wprost daje to samo co ścieżka porównania.
        assert tekst_wartosci_pl(wartosc, _NAZWY) == oczekiwane

    def test_obiekt_z_nazwa_pomija_identyfikatory(self):
        from domain.archive_diff import tekst_wartosci_pl

        assert tekst_wartosci_pl([{"id": "u-1", "ref_id": "b1", "name": "Szyna GPZ"}]) == (
            "1) Nazwa: Szyna GPZ"
        )
        assert tekst_wartosci_pl({"ref_id": "b9"}) == "Identyfikator elementu: b9"

    @pytest.mark.parametrize(
        ("wartosc", "oczekiwane"),
        [
            (None, "—"),
            ("", "—"),
            (False, "nie"),
            (3.0, "3"),
            (0.125, "0,125"),
            ([], "brak"),
            ({}, "brak"),
        ],
    )
    def test_wartosci_proste_i_puste(self, wartosc, oczekiwane):
        from domain.archive_diff import tekst_wartosci_pl

        assert tekst_wartosci_pl(wartosc) == oczekiwane

    def test_sekcje_poza_modelem_tez_maja_postac_pl(self):
        """Ustawienia przypadków (słownik) — ta sama postać PL poza sekcją modelu."""
        wynik = compare_archives(
            _make_archive(settings={"c_factor_max": 1.1, "tryb": {"a": 1}}),
            _make_archive(settings={"c_factor_max": 1.05, "tryb": {"a": 2}}),
        )
        sd = next(s for s in wynik.section_diffs if s.section_name == "cases")
        teksty = {
            fc.field_name: (fc.old_value_pl, fc.new_value_pl)
            for ed in sd.element_diffs
            for fc in ed.field_changes
        }
        assert teksty["c_factor_max"] == ("1,1", "1,05")


class TestMetadaneAudytowe:
    """Metadane produkcyjne (odciski, wersje, rewizje, znaczniki czasu,
    identyfikatory techniczne) oznaczone `audytowe` — ekran nie pokazuje ich na
    pierwszym planie (kontrakt prezentacji V12.7 §0.3)."""

    @pytest.mark.parametrize(
        "pole",
        [
            "hash_sha256",
            "schema_version",
            "enm_version",
            "revision",
            "created_at",
            "updated_at",
            "id",
            "ref_id",
            "run_id",
            "solver_version",
            "snapshot_hash",
            "input_hash",
        ],
    )
    def test_pole_audytowe(self, pole):
        from domain.archive_diff import pole_audytowe

        assert pole_audytowe(pole)
        assert FieldChange(pole, "a", "b", pole).audytowe

    @pytest.mark.parametrize("pole", ["name", "voltage_kv", "bus_ref", "segments", "p_mw"])
    def test_pole_inzynierskie(self, pole):
        from domain.archive_diff import pole_audytowe

        assert not pole_audytowe(pole)

    def test_naglowek_modelu_odcisk_i_rewizja_audytowe(self):
        a = _make_archive(
            enm_models=[
                {
                    "case_id": "sc-1",
                    "snapshot": _model(header={"name": "S", "revision": 2, "hash_sha256": "aa"}),
                }
            ]
        )
        b = _make_archive(
            enm_models=[
                {
                    "case_id": "sc-1",
                    "snapshot": _model(header={"name": "S2", "revision": 4, "hash_sha256": "bb"}),
                }
            ]
        )
        pola = _zmiany_pol(_enm(compare_archives(a, b).section_diffs), "header")
        assert {k: fc.audytowe for k, fc in pola.items()} == {
            "hash_sha256": True,
            "revision": True,
            "name": False,
        }

    def test_przebieg_ma_tozsamosc_audytowa(self):
        wynik = compare_archives(
            _make_archive(canonical_runs=[]),
            _make_archive(canonical_runs=[{"id": "run-7", "status": "DONE"}]),
        )
        sd = next(s for s in wynik.section_diffs if s.section_name == "runs")
        assert [ed.identyfikator_audytowy for ed in sd.element_diffs] == [True]
        assert sd.element_diffs[0].to_dict()["identyfikator_audytowy"] is True
