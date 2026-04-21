"""
Testy Archive Diff — porownanie dwoch archiwow projektu.

Pokrycie:
- Identyczne archiwa -> IDENTICAL
- Rozne metadane projektu -> MODIFIED z field changes
- Dodane/usuniete wezly -> correct element diffs
- Zmodyfikowana galaz -> field-by-field changes
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
"""

from __future__ import annotations

import json

import pytest
from domain.archive_diff import (
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
    NetworkModelSection,
    ProjectArchive,
    ProjectMeta,
    ProofsSection,
    ResultsSection,
    RunsSection,
    SldSection,
    compute_archive_fingerprints,
)

# ============================================================================
# HELPER: tworzenie archiwum testowego
# ============================================================================


def _make_archive(
    *,
    project_name: str = "Projekt testowy",
    nodes: list[dict] | None = None,
    branches: list[dict] | None = None,
    sources: list[dict] | None = None,
    loads: list[dict] | None = None,
    study_cases: list[dict] | None = None,
    diagrams: list[dict] | None = None,
    node_symbols: list[dict] | None = None,
    design_specs: list[dict] | None = None,
) -> ProjectArchive:
    """Utworz archiwum testowe z podanymi danymi."""
    if nodes is None:
        nodes = [
            {"id": "bus-1", "name": "Szyna A", "voltage_level": 15.0},
            {"id": "bus-2", "name": "Szyna B", "voltage_level": 15.0},
        ]
    if branches is None:
        branches = [
            {
                "id": "branch-1",
                "name": "Linia L1",
                "from_node_id": "bus-1",
                "to_node_id": "bus-2",
                "r_ohm_per_km": 0.12,
                "x_ohm_per_km": 0.39,
                "length_km": 10.0,
            },
        ]
    if sources is None:
        sources = []
    if loads is None:
        loads = []
    if study_cases is None:
        study_cases = []
    if diagrams is None:
        diagrams = []
    if node_symbols is None:
        node_symbols = []
    if design_specs is None:
        design_specs = []

    pm_dict = {
        "id": "proj-001",
        "name": project_name,
        "description": "Opis testowy",
        "schema_version": ARCHIVE_SCHEMA_VERSION,
        "active_network_snapshot_id": None,
        "connection_node_id": None,
        "sources": [],
        "created_at": "2025-01-01T00:00:00",
        "updated_at": "2025-01-01T00:00:00",
    }
    nm_dict = {
        "nodes": nodes,
        "branches": branches,
        "sources": sources,
        "loads": loads,
        "snapshots": [],
    }
    sld_dict = {
        "diagrams": diagrams,
        "node_symbols": node_symbols,
        "branch_symbols": [],
        "annotations": [],
    }
    cases_dict = {
        "study_cases": study_cases,
        "operating_cases": [],
        "switching_states": [],
        "settings": None,
    }
    runs_dict = {
        "analysis_runs": [],
        "analysis_runs_index": [],
        "study_runs": [],
    }
    results_dict = {"study_results": []}
    proofs_dict = {
        "design_specs": design_specs,
        "design_proposals": [],
        "design_evidence": [],
    }
    interpretations_dict = {"cached": []}
    issues_dict = {"snapshot": []}

    fp = compute_archive_fingerprints(
        project_meta=pm_dict,
        network_model=nm_dict,
        sld=sld_dict,
        cases=cases_dict,
        runs=runs_dict,
        results=results_dict,
        proofs=proofs_dict,
        interpretations=interpretations_dict,
        issues=issues_dict,
    )

    return ProjectArchive(
        schema_version=ARCHIVE_SCHEMA_VERSION,
        format_id=ARCHIVE_FORMAT_ID,
        project_meta=ProjectMeta(**pm_dict),
        network_model=NetworkModelSection(**nm_dict),
        sld_diagrams=SldSection(**sld_dict),
        cases=CasesSection(**cases_dict),
        runs=RunsSection(**runs_dict),
        results=ResultsSection(**results_dict),
        proofs=ProofsSection(**proofs_dict),
        interpretations=InterpretationsSection(**interpretations_dict),
        issues=IssuesSection(**issues_dict),
        fingerprints=fp,
    )


# ============================================================================
# TESTY
# ============================================================================


class TestIdenticalArchives:
    """Testy identycznych archiwow."""

    def test_identical_archives_return_identical_status(self):
        """Identyczne archiwa -> IDENTICAL status."""
        archive_a = _make_archive()
        archive_b = _make_archive()
        result = compare_archives(archive_a, archive_b)
        assert result.overall_status == DiffStatus.IDENTICAL

    def test_identical_archives_no_section_diffs(self):
        """Identyczne archiwa -> brak roznic sekcji."""
        archive_a = _make_archive()
        archive_b = _make_archive()
        result = compare_archives(archive_a, archive_b)
        assert len(result.section_diffs) == 0

    def test_identical_archives_same_hashes(self):
        """Identyczne archiwa -> te same hashe."""
        archive_a = _make_archive()
        archive_b = _make_archive()
        result = compare_archives(archive_a, archive_b)
        assert result.archive_hash_a == result.archive_hash_b


class TestFastPath:
    """Testy szybkiej sciezki (identyczne hashe archiwow)."""

    def test_fast_path_returns_immediately(self):
        """Szybka sciezka nie generuje sekcji diff."""
        archive_a = _make_archive()
        archive_b = _make_archive()
        result = compare_archives(archive_a, archive_b)
        assert result.overall_status == DiffStatus.IDENTICAL
        assert result.section_diffs == ()

    def test_fast_path_summary_all_zeros(self):
        """Szybka sciezka — podsumowanie z zerami."""
        archive_a = _make_archive()
        result = compare_archives(archive_a, archive_a)
        assert result.summary["sections_total"] == 0
        assert result.summary["total_elements_added"] == 0
        assert result.summary["total_elements_removed"] == 0
        assert result.summary["total_elements_modified"] == 0


class TestModifiedProjectMeta:
    """Testy zmian w metadanych projektu."""

    def test_different_project_name_detected(self):
        """Rozna nazwa projektu -> MODIFIED z field changes."""
        archive_a = _make_archive(project_name="Projekt A")
        archive_b = _make_archive(project_name="Projekt B")
        result = compare_archives(archive_a, archive_b)
        assert result.overall_status == DiffStatus.MODIFIED

        # Znajdz sekcje project_meta
        pm_diffs = [sd for sd in result.section_diffs if sd.section_name == "project_meta"]
        assert len(pm_diffs) == 1
        assert pm_diffs[0].status == DiffStatus.MODIFIED


class TestNetworkModelChanges:
    """Testy zmian w modelu sieci."""

    def test_added_node_detected(self):
        """Dodany wezel -> ADDED element diff."""
        nodes_a = [
            {"id": "bus-1", "name": "Szyna A", "voltage_level": 15.0},
        ]
        nodes_b = [
            {"id": "bus-1", "name": "Szyna A", "voltage_level": 15.0},
            {"id": "bus-2", "name": "Szyna B", "voltage_level": 15.0},
        ]
        archive_a = _make_archive(nodes=nodes_a, branches=[])
        archive_b = _make_archive(nodes=nodes_b, branches=[])
        result = compare_archives(archive_a, archive_b)

        nm_diffs = [sd for sd in result.section_diffs if sd.section_name == "network_model"]
        assert len(nm_diffs) == 1
        assert nm_diffs[0].elements_added == 1

        added = [ed for ed in nm_diffs[0].element_diffs if ed.status == DiffStatus.ADDED]
        assert len(added) == 1
        assert added[0].element_id == "bus-2"

    def test_removed_node_detected(self):
        """Usuniety wezel -> REMOVED element diff."""
        nodes_a = [
            {"id": "bus-1", "name": "Szyna A", "voltage_level": 15.0},
            {"id": "bus-2", "name": "Szyna B", "voltage_level": 15.0},
        ]
        nodes_b = [
            {"id": "bus-1", "name": "Szyna A", "voltage_level": 15.0},
        ]
        archive_a = _make_archive(nodes=nodes_a, branches=[])
        archive_b = _make_archive(nodes=nodes_b, branches=[])
        result = compare_archives(archive_a, archive_b)

        nm_diffs = [sd for sd in result.section_diffs if sd.section_name == "network_model"]
        assert nm_diffs[0].elements_removed == 1

        removed = [ed for ed in nm_diffs[0].element_diffs if ed.status == DiffStatus.REMOVED]
        assert len(removed) == 1
        assert removed[0].element_id == "bus-2"

    def test_modified_branch_field_by_field(self):
        """Zmodyfikowana galaz -> field-by-field changes."""
        branches_a = [
            {
                "id": "br-1",
                "name": "Linia L1",
                "length_km": 10.0,
                "r_ohm_per_km": 0.12,
            },
        ]
        branches_b = [
            {
                "id": "br-1",
                "name": "Linia L1",
                "length_km": 15.0,  # zmienione
                "r_ohm_per_km": 0.15,  # zmienione
            },
        ]
        archive_a = _make_archive(branches=branches_a)
        archive_b = _make_archive(branches=branches_b)
        result = compare_archives(archive_a, archive_b)

        nm_diffs = [sd for sd in result.section_diffs if sd.section_name == "network_model"]
        assert nm_diffs[0].elements_modified >= 1

        modified = [
            ed
            for ed in nm_diffs[0].element_diffs
            if ed.status == DiffStatus.MODIFIED and ed.element_id == "br-1"
        ]
        assert len(modified) == 1
        field_names = {fc.field_name for fc in modified[0].field_changes}
        assert "length_km" in field_names
        assert "r_ohm_per_km" in field_names


class TestEmptyVsNonEmpty:
    """Testy pustych vs niepustych sekcji."""

    def test_empty_vs_nonempty_nodes(self):
        """Pusta lista wezlow vs niepusta -> roznice wykryte."""
        archive_a = _make_archive(nodes=[], branches=[])
        archive_b = _make_archive(
            nodes=[{"id": "bus-1", "name": "Szyna", "voltage_level": 15.0}],
            branches=[],
        )
        result = compare_archives(archive_a, archive_b)
        assert result.overall_status == DiffStatus.MODIFIED

        nm_diffs = [sd for sd in result.section_diffs if sd.section_name == "network_model"]
        assert nm_diffs[0].elements_added == 1

    def test_nonempty_vs_empty_nodes(self):
        """Niepusta lista wezlow vs pusta -> roznice wykryte."""
        archive_a = _make_archive(
            nodes=[{"id": "bus-1", "name": "Szyna", "voltage_level": 15.0}],
            branches=[],
        )
        archive_b = _make_archive(nodes=[], branches=[])
        result = compare_archives(archive_a, archive_b)

        nm_diffs = [sd for sd in result.section_diffs if sd.section_name == "network_model"]
        assert nm_diffs[0].elements_removed == 1


class TestDeterministicSignature:
    """Testy deterministycznosci sygnatury."""

    def test_same_input_same_signature(self):
        """Ten sam input -> ta sama sygnatura."""
        archive_a = _make_archive(project_name="A")
        archive_b = _make_archive(project_name="B")
        result_1 = compare_archives(archive_a, archive_b)
        result_2 = compare_archives(archive_a, archive_b)
        assert result_1.deterministic_signature == result_2.deterministic_signature

    def test_signature_is_sha256(self):
        """Sygnatura ma format SHA-256 (64 znaki hex)."""
        archive_a = _make_archive(project_name="A")
        archive_b = _make_archive(project_name="B")
        result = compare_archives(archive_a, archive_b)
        assert len(result.deterministic_signature) == 64
        assert all(c in "0123456789abcdef" for c in result.deterministic_signature)

    def test_different_input_different_signature(self):
        """Rozne inputy -> rozne sygnatury."""
        archive_a = _make_archive(project_name="A")
        archive_b1 = _make_archive(project_name="B")
        archive_b2 = _make_archive(project_name="C")
        result_1 = compare_archives(archive_a, archive_b1)
        result_2 = compare_archives(archive_a, archive_b2)
        assert result_1.deterministic_signature != result_2.deterministic_signature


class TestPolishReport:
    """Testy raportu w jezyku polskim."""

    def test_identical_report(self):
        """Raport identycznych archiwow."""
        archive = _make_archive()
        result = compare_archives(archive, archive)
        report = format_diff_report_pl(result)
        assert "IDENTYCZNY" in report
        assert "Brak roznic" in report

    def test_modified_report_contains_section_info(self):
        """Raport zmodyfikowanych archiwow zawiera informacje o sekcjach."""
        archive_a = _make_archive(project_name="A")
        archive_b = _make_archive(project_name="B")
        result = compare_archives(archive_a, archive_b)
        report = format_diff_report_pl(result)
        assert "RAPORT ROZNIC ARCHIWOW" in report
        assert "ZMODYFIKOWANY" in report
        assert "Podsumowanie" in report

    def test_report_contains_element_details(self):
        """Raport zawiera szczegoly elementow."""
        nodes_a = [
            {"id": "bus-1", "name": "Szyna A", "voltage_level": 15.0},
        ]
        nodes_b = [
            {"id": "bus-1", "name": "Szyna B", "voltage_level": 15.0},
        ]
        archive_a = _make_archive(nodes=nodes_a, branches=[])
        archive_b = _make_archive(nodes=nodes_b, branches=[])
        result = compare_archives(archive_a, archive_b)
        report = format_diff_report_pl(result)
        assert "bus-1" in report
        assert "Szyna A" in report or "Szyna B" in report


class TestSummaryCounts:
    """Testy podsumowania (summary counts)."""

    def test_summary_all_zeros_for_identical(self):
        """Podsumowanie identycznych archiwow — same zera."""
        archive = _make_archive()
        result = compare_archives(archive, archive)
        summary = diff_summary(result)
        assert summary["overall_status"] == "IDENTICAL"
        assert summary["by_status"]["ADDED"] == 0
        assert summary["by_status"]["REMOVED"] == 0
        assert summary["by_status"]["MODIFIED"] == 0

    def test_summary_counts_added(self):
        """Podsumowanie — zlicza dodane elementy."""
        archive_a = _make_archive(nodes=[], branches=[])
        archive_b = _make_archive(
            nodes=[
                {"id": "bus-1", "name": "A", "voltage_level": 15.0},
                {"id": "bus-2", "name": "B", "voltage_level": 15.0},
            ],
            branches=[],
        )
        result = compare_archives(archive_a, archive_b)
        summary = diff_summary(result)
        assert summary["by_status"]["ADDED"] == 2

    def test_summary_counts_mixed(self):
        """Podsumowanie — zlicza mieszane zmiany."""
        nodes_a = [
            {"id": "bus-1", "name": "A", "voltage_level": 15.0},
            {"id": "bus-2", "name": "B", "voltage_level": 15.0},
        ]
        nodes_b = [
            {"id": "bus-1", "name": "A zmienione", "voltage_level": 15.0},
            {"id": "bus-3", "name": "C", "voltage_level": 15.0},
        ]
        archive_a = _make_archive(nodes=nodes_a, branches=[])
        archive_b = _make_archive(nodes=nodes_b, branches=[])
        result = compare_archives(archive_a, archive_b)
        summary = diff_summary(result)
        assert summary["by_status"]["MODIFIED"] >= 1  # bus-1 zmieniony
        assert summary["by_status"]["REMOVED"] >= 1  # bus-2 usuniety
        assert summary["by_status"]["ADDED"] >= 1  # bus-3 dodany


class TestMultipleSectionsChanged:
    """Testy zmian w wielu sekcjach jednoczesnie."""

    def test_multiple_sections_modified(self):
        """Zmiany w wielu sekcjach jednoczesnie."""
        archive_a = _make_archive(
            project_name="A",
            nodes=[{"id": "bus-1", "name": "Szyna", "voltage_level": 15.0}],
            branches=[],
            study_cases=[],
        )
        archive_b = _make_archive(
            project_name="B",
            nodes=[
                {"id": "bus-1", "name": "Szyna", "voltage_level": 15.0},
                {"id": "bus-2", "name": "Nowa", "voltage_level": 15.0},
            ],
            branches=[],
            study_cases=[{"id": "case-1", "name": "Przypadek 1"}],
        )
        result = compare_archives(archive_a, archive_b)
        assert result.overall_status == DiffStatus.MODIFIED

        modified_sections = [
            sd.section_name for sd in result.section_diffs if sd.status == DiffStatus.MODIFIED
        ]
        # project_meta (nazwa), network_model (nowy wezel), cases (nowy case)
        assert "project_meta" in modified_sections
        assert "network_model" in modified_sections
        assert "cases" in modified_sections


class TestSerializationRoundtrip:
    """Testy serializacji roundtrip."""

    def test_diff_result_to_dict_roundtrip(self):
        """Serializacja ArchiveDiffResult do dict i z powrotem."""
        archive_a = _make_archive(project_name="A")
        archive_b = _make_archive(project_name="B")
        result = compare_archives(archive_a, archive_b)

        d = result.to_dict()

        # Sprawdz strukture
        assert "archive_hash_a" in d
        assert "archive_hash_b" in d
        assert "overall_status" in d
        assert "section_diffs" in d
        assert "summary" in d
        assert "deterministic_signature" in d

        # Sprawdz ze serializuje sie do JSON
        json_str = json.dumps(d, ensure_ascii=False)
        parsed = json.loads(json_str)
        assert parsed["overall_status"] == "MODIFIED"
        assert len(parsed["section_diffs"]) > 0

    def test_section_diff_to_dict(self):
        """Serializacja SectionDiff do dict."""
        sd = SectionDiff(
            section_name="network_model",
            status=DiffStatus.MODIFIED,
            hash_a="abc",
            hash_b="def",
            elements_added=1,
            elements_removed=2,
            elements_modified=3,
            element_diffs=(
                ElementDiff(
                    element_id="bus-1",
                    element_type="nodes",
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
        assert d["section_name"] == "network_model"
        assert d["status"] == "MODIFIED"
        assert len(d["element_diffs"]) == 1
        assert len(d["element_diffs"][0]["field_changes"]) == 1

    def test_identical_result_to_dict(self):
        """Serializacja identycznego wyniku."""
        archive = _make_archive()
        result = compare_archives(archive, archive)
        d = result.to_dict()
        assert d["overall_status"] == "IDENTICAL"
        assert d["section_diffs"] == []


class TestCompareElementListsIndependent:
    """Testy compare_element_lists jako niezaleznej funkcji."""

    def test_empty_lists(self):
        """Obie listy puste -> brak roznic."""
        diffs = compare_element_lists([], [])
        assert len(diffs) == 0

    def test_added_elements(self):
        """Elementy dodane."""
        list_a: list[dict] = []
        list_b = [{"id": "e1", "name": "Element 1"}]
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 1
        assert diffs[0].status == DiffStatus.ADDED
        assert diffs[0].element_id == "e1"

    def test_removed_elements(self):
        """Elementy usuniete."""
        list_a = [{"id": "e1", "name": "Element 1"}]
        list_b: list[dict] = []
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 1
        assert diffs[0].status == DiffStatus.REMOVED

    def test_modified_element_field_change(self):
        """Zmodyfikowany element — zmiana pola."""
        list_a = [{"id": "e1", "name": "Stara", "value": 10}]
        list_b = [{"id": "e1", "name": "Nowa", "value": 20}]
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 1
        assert diffs[0].status == DiffStatus.MODIFIED
        field_names = {fc.field_name for fc in diffs[0].field_changes}
        assert "name" in field_names
        assert "value" in field_names

    def test_identical_elements_no_diff(self):
        """Identyczne elementy -> brak roznic."""
        list_a = [{"id": "e1", "name": "A", "value": 10}]
        list_b = [{"id": "e1", "name": "A", "value": 10}]
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 0


class TestCompareSectionsIndependent:
    """Testy compare_sections jako niezaleznej funkcji."""

    def test_identical_sections(self):
        """Identyczne sekcje -> IDENTICAL."""
        data = {"nodes": [{"id": "n1", "name": "A"}]}
        sd = compare_sections(data, data, "network_model")
        assert sd.status == DiffStatus.IDENTICAL

    def test_modified_section(self):
        """Zmodyfikowana sekcja -> MODIFIED."""
        data_a = {"nodes": [{"id": "n1", "name": "A"}]}
        data_b = {"nodes": [{"id": "n1", "name": "B"}]}
        sd = compare_sections(data_a, data_b, "network_model")
        assert sd.status == DiffStatus.MODIFIED
        assert sd.elements_modified == 1

    def test_section_without_list_keys(self):
        """Sekcja bez zdefiniowanych list elementow."""
        data_a = {"cached": [{"id": "c1", "text": "A"}]}
        data_b = {"cached": [{"id": "c1", "text": "B"}]}
        sd = compare_sections(data_a, data_b, "interpretations")
        assert sd.status == DiffStatus.MODIFIED
        # interpretations nie ma zdefiniowanych list_keys,
        # wiec element_diffs powinno byc puste
        assert len(sd.element_diffs) == 0


class TestSldAndProofsChanges:
    """Testy zmian w sekcjach SLD i proofs."""

    def test_added_diagram_detected(self):
        """Dodany diagram SLD -> wykryty."""
        archive_a = _make_archive(diagrams=[], node_symbols=[])
        archive_b = _make_archive(
            diagrams=[{"id": "diag-1", "name": "SLD 1"}],
            node_symbols=[],
        )
        result = compare_archives(archive_a, archive_b)
        sld_diffs = [sd for sd in result.section_diffs if sd.section_name == "sld_diagrams"]
        assert len(sld_diffs) == 1
        assert sld_diffs[0].elements_added == 1

    def test_added_design_spec_detected(self):
        """Dodana specyfikacja projektowa -> wykryta."""
        archive_a = _make_archive(design_specs=[])
        archive_b = _make_archive(
            design_specs=[{"id": "spec-1", "title": "Specyfikacja 1"}],
        )
        result = compare_archives(archive_a, archive_b)
        proofs_diffs = [sd for sd in result.section_diffs if sd.section_name == "proofs"]
        assert len(proofs_diffs) == 1
        assert proofs_diffs[0].elements_added == 1


class TestFieldChangeLabels:
    """Testy etykiet PL dla zmian pol."""

    def test_known_field_has_polish_label(self):
        """Znane pole ma etykiete PL."""
        list_a = [{"id": "e1", "name": "Stara"}]
        list_b = [{"id": "e1", "name": "Nowa"}]
        diffs = compare_element_lists(list_a, list_b)
        fc = diffs[0].field_changes[0]
        assert fc.label_pl == "Nazwa"

    def test_unknown_field_uses_field_name_as_label(self):
        """Nieznane pole uzywa nazwy pola jako etykiety."""
        list_a = [{"id": "e1", "custom_field": 1}]
        list_b = [{"id": "e1", "custom_field": 2}]
        diffs = compare_element_lists(list_a, list_b)
        fc = diffs[0].field_changes[0]
        assert fc.label_pl == "custom_field"


class TestEdgeCases:
    """Testy przypadkow brzegowych."""

    def test_element_with_none_vs_value(self):
        """Element z None vs wartosc."""
        list_a = [{"id": "e1", "value": None}]
        list_b = [{"id": "e1", "value": 42}]
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 1
        assert diffs[0].status == DiffStatus.MODIFIED
        fc = diffs[0].field_changes[0]
        assert fc.old_value is None
        assert fc.new_value == 42

    def test_element_with_extra_field_in_b(self):
        """Element B ma dodatkowe pole."""
        list_a = [{"id": "e1", "name": "A"}]
        list_b = [{"id": "e1", "name": "A", "extra": "val"}]
        diffs = compare_element_lists(list_a, list_b)
        assert len(diffs) == 1
        assert diffs[0].status == DiffStatus.MODIFIED
        field_names = {fc.field_name for fc in diffs[0].field_changes}
        assert "extra" in field_names

    def test_frozen_dataclasses(self):
        """Modele diff sa frozen (immutable)."""
        fc = FieldChange("name", "A", "B", "Nazwa")
        with pytest.raises(AttributeError):
            fc.field_name = "other"  # type: ignore[misc]

        ed = ElementDiff("e1", "nodes", DiffStatus.ADDED, ())
        with pytest.raises(AttributeError):
            ed.element_id = "e2"  # type: ignore[misc]
