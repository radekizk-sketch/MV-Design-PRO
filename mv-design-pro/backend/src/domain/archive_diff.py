"""
Archive Diff — porownanie dwoch archiwow projektu.

Pozwala na:
- Porownanie dwoch pelnych archiwow (np. wersja A vs wersja B)
- Identyfikacje zmian na poziomie sekcji i elementow
- Generowanie raportu roznic

KANON:
- NOT-A-SOLVER — zero obliczen fizycznych
- Deterministyczny — ten sam input = ten sam diff
- Raport w formacie strukturalnym (JSON) + czytelnym (PL)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from enum import Enum
from typing import Any

from domain.project_archive import (
    ArchiveFingerprints,
    ProjectArchive,
    archive_to_dict,
    canonicalize,
    compute_hash,
)

# ============================================================================
# STALE
# ============================================================================

# Mapowanie sekcji na ich listy elementow i pola ID
SECTION_LIST_KEYS: dict[str, dict[str, str]] = {
    "network_model": {
        "nodes": "id",
        "branches": "id",
        "sources": "id",
        "loads": "id",
    },
    "sld_diagrams": {
        "diagrams": "id",
        "node_symbols": "id",
        "branch_symbols": "id",
    },
    "cases": {
        "study_cases": "id",
        "operating_cases": "id",
    },
    "runs": {
        "analysis_runs": "id",
        "study_runs": "id",
    },
    "results": {
        "study_results": "id",
    },
    "proofs": {
        "design_specs": "id",
        "design_proposals": "id",
        "design_evidence": "id",
    },
}

# Mapowanie nazw sekcji na atrybuty fingerprints
_SECTION_HASH_MAP: dict[str, str] = {
    "project_meta": "project_meta_hash",
    "network_model": "network_model_hash",
    "sld_diagrams": "sld_hash",
    "cases": "cases_hash",
    "runs": "runs_hash",
    "results": "results_hash",
    "proofs": "proofs_hash",
    "interpretations": "interpretations_hash",
    "issues": "issues_hash",
}

# Mapowanie nazw sekcji na etykiety PL
_SECTION_LABELS_PL: dict[str, str] = {
    "project_meta": "Metadane projektu",
    "network_model": "Model sieci",
    "sld_diagrams": "Diagramy SLD",
    "cases": "Przypadki obliczeniowe",
    "runs": "Wykonania analiz",
    "results": "Wyniki",
    "proofs": "Dowody",
    "interpretations": "Interpretacje",
    "issues": "Problemy",
}


# ============================================================================
# TYPY STATUSOW
# ============================================================================


class DiffStatus(str, Enum):
    """Status roznic miedzy elementami."""

    IDENTICAL = "IDENTICAL"
    MODIFIED = "MODIFIED"
    ADDED = "ADDED"
    REMOVED = "REMOVED"


# ============================================================================
# MODELE DANYCH DIFF
# ============================================================================


@dataclass(frozen=True)
class FieldChange:
    """Zmiana wartosci pola elementu."""

    field_name: str
    old_value: object
    new_value: object
    label_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do slownika."""
        return {
            "field_name": self.field_name,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "label_pl": self.label_pl,
        }


@dataclass(frozen=True)
class ElementDiff:
    """Roznica na poziomie pojedynczego elementu."""

    element_id: str
    element_type: str
    status: DiffStatus
    field_changes: tuple[FieldChange, ...]

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do slownika."""
        return {
            "element_id": self.element_id,
            "element_type": self.element_type,
            "status": self.status.value,
            "field_changes": [fc.to_dict() for fc in self.field_changes],
        }


@dataclass(frozen=True)
class SectionDiff:
    """Roznica na poziomie sekcji archiwum."""

    section_name: str
    status: DiffStatus
    hash_a: str
    hash_b: str
    elements_added: int
    elements_removed: int
    elements_modified: int
    element_diffs: tuple[ElementDiff, ...]

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do slownika."""
        return {
            "section_name": self.section_name,
            "status": self.status.value,
            "hash_a": self.hash_a,
            "hash_b": self.hash_b,
            "elements_added": self.elements_added,
            "elements_removed": self.elements_removed,
            "elements_modified": self.elements_modified,
            "element_diffs": [ed.to_dict() for ed in self.element_diffs],
        }


@dataclass(frozen=True)
class ArchiveDiffResult:
    """Wynik porownania dwoch archiwow projektu."""

    archive_hash_a: str
    archive_hash_b: str
    overall_status: DiffStatus
    section_diffs: tuple[SectionDiff, ...]
    summary: dict[str, Any]
    deterministic_signature: str

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do slownika."""
        return {
            "archive_hash_a": self.archive_hash_a,
            "archive_hash_b": self.archive_hash_b,
            "overall_status": self.overall_status.value,
            "section_diffs": [sd.to_dict() for sd in self.section_diffs],
            "summary": self.summary,
            "deterministic_signature": self.deterministic_signature,
        }


# ============================================================================
# FUNKCJE POMOCNICZE
# ============================================================================


def _field_label_pl(field_name: str) -> str:
    """Etykieta PL dla nazwy pola."""
    labels: dict[str, str] = {
        "id": "Identyfikator",
        "name": "Nazwa",
        "description": "Opis",
        "voltage_level": "Poziom napiecia",
        "active_power": "Moc czynna",
        "reactive_power": "Moc bierna",
        "r_ohm_per_km": "Rezystancja [Ohm/km]",
        "x_ohm_per_km": "Reaktancja [Ohm/km]",
        "length_km": "Dlugosc [km]",
        "rated_current_a": "Prad znamionowy [A]",
        "from_node_id": "Wez.poczatkowy",
        "to_node_id": "Wez.koncowy",
        "status": "Status",
        "type": "Typ",
        "created_at": "Data utworzenia",
        "updated_at": "Data aktualizacji",
        "schema_version": "Wersja schematu",
    }
    return labels.get(field_name, field_name)


def _get_section_hash(fingerprints: ArchiveFingerprints, section_name: str) -> str:
    """Pobierz hash sekcji z fingerprints."""
    attr_name = _SECTION_HASH_MAP.get(section_name)
    if attr_name is None:
        return ""
    return getattr(fingerprints, attr_name, "")


def _compute_deterministic_signature(
    archive_hash_a: str,
    archive_hash_b: str,
    section_diffs: tuple[SectionDiff, ...],
) -> str:
    """Oblicz deterministyczna sygnature diff-a."""
    sig_data = {
        "archive_hash_a": archive_hash_a,
        "archive_hash_b": archive_hash_b,
        "sections": [
            {
                "name": sd.section_name,
                "status": sd.status.value,
                "added": sd.elements_added,
                "removed": sd.elements_removed,
                "modified": sd.elements_modified,
            }
            for sd in section_diffs
        ],
    }
    canonical = canonicalize(sig_data)
    json_str = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


# ============================================================================
# POROWNANIE ELEMENTOW
# ============================================================================


def compare_element_lists(
    list_a: list[dict[str, Any]],
    list_b: list[dict[str, Any]],
    id_field: str = "id",
    element_type: str = "element",
) -> list[ElementDiff]:
    """
    Porownaj dwie listy elementow wg pola ID.

    Zwraca liste ElementDiff z informacjami o dodanych, usunietych
    i zmodyfikowanych elementach.

    Args:
        list_a: Lista elementow z archiwum A
        list_b: Lista elementow z archiwum B
        id_field: Nazwa pola ID (domyslnie "id")
        element_type: Nazwa typu elementu (do etykiety)

    Returns:
        Lista ElementDiff posortowana wg element_id
    """
    index_a: dict[str, dict[str, Any]] = {str(el.get(id_field, "")): el for el in list_a}
    index_b: dict[str, dict[str, Any]] = {str(el.get(id_field, "")): el for el in list_b}

    all_ids = sorted(set(index_a.keys()) | set(index_b.keys()))
    diffs: list[ElementDiff] = []

    for eid in all_ids:
        in_a = eid in index_a
        in_b = eid in index_b

        if in_a and not in_b:
            # Usuniety
            diffs.append(
                ElementDiff(
                    element_id=eid,
                    element_type=element_type,
                    status=DiffStatus.REMOVED,
                    field_changes=(),
                )
            )
        elif not in_a and in_b:
            # Dodany
            diffs.append(
                ElementDiff(
                    element_id=eid,
                    element_type=element_type,
                    status=DiffStatus.ADDED,
                    field_changes=(),
                )
            )
        else:
            # Oba istnieja — porownaj pole po polu
            el_a = index_a[eid]
            el_b = index_b[eid]
            field_changes = _compare_fields(el_a, el_b)
            if field_changes:
                diffs.append(
                    ElementDiff(
                        element_id=eid,
                        element_type=element_type,
                        status=DiffStatus.MODIFIED,
                        field_changes=tuple(field_changes),
                    )
                )

    return diffs


def _compare_fields(
    el_a: dict[str, Any],
    el_b: dict[str, Any],
) -> list[FieldChange]:
    """Porownaj pola dwoch elementow."""
    all_keys = sorted(set(el_a.keys()) | set(el_b.keys()))
    changes: list[FieldChange] = []

    for key in all_keys:
        val_a = el_a.get(key)
        val_b = el_b.get(key)

        # Kanonizacja przed porownaniem
        canonical_a = canonicalize(val_a)
        canonical_b = canonicalize(val_b)

        if canonical_a != canonical_b:
            changes.append(
                FieldChange(
                    field_name=key,
                    old_value=val_a,
                    new_value=val_b,
                    label_pl=_field_label_pl(key),
                )
            )

    return changes


# ============================================================================
# POROWNANIE SEKCJI
# ============================================================================


def compare_sections(
    section_a_data: dict[str, Any],
    section_b_data: dict[str, Any],
    section_name: str,
    hash_a: str = "",
    hash_b: str = "",
) -> SectionDiff:
    """
    Porownaj dwie sekcje archiwum.

    Jesli sekcja ma zdefiniowane listy elementow w SECTION_LIST_KEYS,
    wykonuje gleboke porownanie element po elemencie.
    W przeciwnym razie porownuje calosciowo.

    Args:
        section_a_data: Dane sekcji z archiwum A
        section_b_data: Dane sekcji z archiwum B
        section_name: Nazwa sekcji
        hash_a: Hash sekcji A (jesli znany)
        hash_b: Hash sekcji B (jesli znany)

    Returns:
        SectionDiff z wynikiem porownania
    """
    # Oblicz hashe jesli nie podano
    if not hash_a:
        hash_a = compute_hash(section_a_data)
    if not hash_b:
        hash_b = compute_hash(section_b_data)

    # Szybka sciezka: identyczne hashe
    if hash_a == hash_b:
        return SectionDiff(
            section_name=section_name,
            status=DiffStatus.IDENTICAL,
            hash_a=hash_a,
            hash_b=hash_b,
            elements_added=0,
            elements_removed=0,
            elements_modified=0,
            element_diffs=(),
        )

    # Gleboka analiza — porownaj listy elementow
    list_keys = SECTION_LIST_KEYS.get(section_name, {})
    all_element_diffs: list[ElementDiff] = []

    for list_key, id_field in sorted(list_keys.items()):
        la = section_a_data.get(list_key, [])
        lb = section_b_data.get(list_key, [])
        element_diffs = compare_element_lists(la, lb, id_field=id_field, element_type=list_key)
        all_element_diffs.extend(element_diffs)

    elements_added = sum(1 for d in all_element_diffs if d.status == DiffStatus.ADDED)
    elements_removed = sum(1 for d in all_element_diffs if d.status == DiffStatus.REMOVED)
    elements_modified = sum(1 for d in all_element_diffs if d.status == DiffStatus.MODIFIED)

    return SectionDiff(
        section_name=section_name,
        status=DiffStatus.MODIFIED,
        hash_a=hash_a,
        hash_b=hash_b,
        elements_added=elements_added,
        elements_removed=elements_removed,
        elements_modified=elements_modified,
        element_diffs=tuple(all_element_diffs),
    )


# ============================================================================
# POROWNANIE ARCHIWOW
# ============================================================================


def compare_archives(
    archive_a: ProjectArchive,
    archive_b: ProjectArchive,
) -> ArchiveDiffResult:
    """
    Porownaj dwa pelne archiwa projektu.

    Algorytm:
    1. Szybka sciezka: jesli hashe archiwow sa identyczne -> IDENTICAL
    2. Dla kazdej sekcji: porownaj hashe sekcji
    3. Dla zmodyfikowanych sekcji: gleboka analiza element po elemencie
    4. Wygeneruj podsumowanie i sygnature deterministyczna

    Args:
        archive_a: Archiwum A (bazowe)
        archive_b: Archiwum B (porownywane)

    Returns:
        ArchiveDiffResult z pelnym wynikiem porownania
    """
    hash_a = archive_a.fingerprints.archive_hash
    hash_b = archive_b.fingerprints.archive_hash

    # Szybka sciezka: identyczne archiwa
    if hash_a == hash_b:
        section_diffs: tuple[SectionDiff, ...] = ()
        sig = _compute_deterministic_signature(hash_a, hash_b, section_diffs)
        return ArchiveDiffResult(
            archive_hash_a=hash_a,
            archive_hash_b=hash_b,
            overall_status=DiffStatus.IDENTICAL,
            section_diffs=section_diffs,
            summary=_build_summary(section_diffs),
            deterministic_signature=sig,
        )

    # Serializuj archiwa do dict
    dict_a = archive_to_dict(archive_a)
    dict_b = archive_to_dict(archive_b)

    # Porownaj sekcje
    section_names = sorted(_SECTION_HASH_MAP.keys())
    section_diffs_list: list[SectionDiff] = []

    for section_name in section_names:
        sec_hash_a = _get_section_hash(archive_a.fingerprints, section_name)
        sec_hash_b = _get_section_hash(archive_b.fingerprints, section_name)

        # Pobierz dane sekcji — obsluz aliasy
        section_data_key = section_name
        sec_data_a = dict_a.get(section_data_key, {})
        sec_data_b = dict_b.get(section_data_key, {})

        section_diff = compare_sections(
            sec_data_a,
            sec_data_b,
            section_name,
            hash_a=sec_hash_a,
            hash_b=sec_hash_b,
        )
        section_diffs_list.append(section_diff)

    result_section_diffs = tuple(section_diffs_list)
    summary = _build_summary(result_section_diffs)
    sig = _compute_deterministic_signature(hash_a, hash_b, result_section_diffs)

    return ArchiveDiffResult(
        archive_hash_a=hash_a,
        archive_hash_b=hash_b,
        overall_status=DiffStatus.MODIFIED,
        section_diffs=result_section_diffs,
        summary=summary,
        deterministic_signature=sig,
    )


# ============================================================================
# PODSUMOWANIE I RAPORT
# ============================================================================


def _build_summary(section_diffs: tuple[SectionDiff, ...]) -> dict[str, Any]:
    """Zbuduj podsumowanie diff-a."""
    sections_identical = sum(1 for sd in section_diffs if sd.status == DiffStatus.IDENTICAL)
    sections_modified = sum(1 for sd in section_diffs if sd.status == DiffStatus.MODIFIED)
    total_elements_added = sum(sd.elements_added for sd in section_diffs)
    total_elements_removed = sum(sd.elements_removed for sd in section_diffs)
    total_elements_modified = sum(sd.elements_modified for sd in section_diffs)

    return {
        "sections_total": len(section_diffs),
        "sections_identical": sections_identical,
        "sections_modified": sections_modified,
        "total_elements_added": total_elements_added,
        "total_elements_removed": total_elements_removed,
        "total_elements_modified": total_elements_modified,
    }


def diff_summary(diff_result: ArchiveDiffResult) -> dict[str, Any]:
    """
    Zwroc podsumowanie diff-a z licznikami per status.

    Args:
        diff_result: Wynik porownania archiwow

    Returns:
        Slownik z licznikami per status
    """
    by_status: dict[str, int] = {s.value: 0 for s in DiffStatus}

    for sd in diff_result.section_diffs:
        for ed in sd.element_diffs:
            by_status[ed.status.value] += 1

    return {
        "overall_status": diff_result.overall_status.value,
        "by_status": by_status,
        "sections_identical": diff_result.summary.get("sections_identical", 0),
        "sections_modified": diff_result.summary.get("sections_modified", 0),
    }


def format_diff_report_pl(diff_result: ArchiveDiffResult) -> str:
    """
    Wygeneruj czytelny raport roznic w jezyku polskim.

    Args:
        diff_result: Wynik porownania archiwow

    Returns:
        Sformatowany raport tekstowy (PL)
    """
    lines: list[str] = []
    lines.append("=" * 60)
    lines.append("RAPORT ROZNIC ARCHIWOW")
    lines.append("=" * 60)
    lines.append("")
    lines.append(f"Archiwum A: {diff_result.archive_hash_a[:16]}...")
    lines.append(f"Archiwum B: {diff_result.archive_hash_b[:16]}...")
    lines.append(f"Status ogolny: {_status_pl(diff_result.overall_status)}")
    lines.append("")

    if diff_result.overall_status == DiffStatus.IDENTICAL:
        lines.append("Archiwa sa identyczne. Brak roznic.")
        lines.append("")
        return "\n".join(lines)

    # Podsumowanie
    summary = diff_result.summary
    lines.append("--- Podsumowanie ---")
    lines.append(
        f"Sekcje: {summary['sections_total']} "
        f"(identyczne: {summary['sections_identical']}, "
        f"zmodyfikowane: {summary['sections_modified']})"
    )
    lines.append(
        f"Elementy: dodane={summary['total_elements_added']}, "
        f"usuniete={summary['total_elements_removed']}, "
        f"zmodyfikowane={summary['total_elements_modified']}"
    )
    lines.append("")

    # Szczegoly per sekcja
    for sd in diff_result.section_diffs:
        if sd.status == DiffStatus.IDENTICAL:
            continue

        section_label = _SECTION_LABELS_PL.get(sd.section_name, sd.section_name)
        lines.append(f"--- {section_label} ---")
        lines.append(f"  Status: {_status_pl(sd.status)}")
        if sd.elements_added:
            lines.append(f"  Dodane: {sd.elements_added}")
        if sd.elements_removed:
            lines.append(f"  Usuniete: {sd.elements_removed}")
        if sd.elements_modified:
            lines.append(f"  Zmodyfikowane: {sd.elements_modified}")

        for ed in sd.element_diffs:
            lines.append(f"    [{_status_pl(ed.status)}] " f"{ed.element_type} '{ed.element_id}'")
            for fc in ed.field_changes:
                lines.append(
                    f"      {fc.label_pl}: "
                    f"{_format_value(fc.old_value)} -> "
                    f"{_format_value(fc.new_value)}"
                )
        lines.append("")

    lines.append(f"Sygnatura: {diff_result.deterministic_signature[:16]}...")
    lines.append("")

    return "\n".join(lines)


def _status_pl(status: DiffStatus) -> str:
    """Etykieta PL dla statusu."""
    mapping: dict[DiffStatus, str] = {
        DiffStatus.IDENTICAL: "IDENTYCZNY",
        DiffStatus.MODIFIED: "ZMODYFIKOWANY",
        DiffStatus.ADDED: "DODANY",
        DiffStatus.REMOVED: "USUNIETY",
    }
    return mapping.get(status, status.value)


def _format_value(value: Any) -> str:
    """Sformatuj wartosc do czytelnej postaci."""
    if value is None:
        return "(brak)"
    if isinstance(value, str) and len(value) > 50:
        return f'"{value[:47]}..."'
    if isinstance(value, list | dict):
        s = json.dumps(value, ensure_ascii=False)
        if len(s) > 50:
            return f"{s[:47]}..."
        return s
    return str(value)
