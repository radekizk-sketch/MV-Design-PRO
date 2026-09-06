"""
Domain model dla Project Archive — P31.

Project Import/Export jako funkcja pierwszej klasy:
- pełny projekt (model + SLD + cases + runs + results + proof + interpretation)
- deterministyczny format
- gotowy do archiwizacji i przenoszenia

KANON:
- Import/Export = NOT-A-SOLVER
- Zero nowych obliczeń
- Determinizm absolutny
- 100% PL
- Kompatybilność wsteczna (versioned format)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

# ============================================================================
# STAŁE WERSJI
# ============================================================================

# CV-3.3-B: bump MAJOR — sekcje `runs`/`results` zmieniają kształt (R2 `analysis_runs`
# + R3 `study_runs`/`study_results` usunięte, `canonical_runs` R1 dodane). Archiwa
# 1.x pozostają WCZYTYWALNE (`_is_compatible_version`: major <= current_major) —
# ich `analysis_runs`/`study_runs`/`study_results` są po prostu pomijane przy
# imporcie (`.get(...)` bez tych kluczy), zgodnie z „usuń, nie migruj".
ARCHIVE_SCHEMA_VERSION = "2.0.0"
ARCHIVE_FORMAT_ID = "MV-DESIGN-PRO-ARCHIVE"


# ============================================================================
# BŁĘDY ARCHIWUM
# ============================================================================


class ArchiveError(Exception):
    """Bazowy błąd archiwum projektu."""

    pass


class ArchiveVersionError(ArchiveError):
    """Błąd wersji schematu archiwum."""

    def __init__(self, expected: str, got: str) -> None:
        self.expected = expected
        self.got = got
        super().__init__(
            f"Nieobsługiwana wersja schematu archiwum: oczekiwano {expected}, otrzymano {got}"
        )


class ArchiveIntegrityError(ArchiveError):
    """Błąd integralności archiwum (hash mismatch)."""

    def __init__(self, section: str, expected: str, got: str) -> None:
        self.section = section
        self.expected = expected
        self.got = got
        super().__init__(
            f"Błąd integralności sekcji '{section}': oczekiwano {expected}, otrzymano {got}"
        )


class ArchiveStructureError(ArchiveError):
    """Błąd struktury archiwum (brakujące sekcje)."""

    def __init__(self, message: str) -> None:
        super().__init__(f"Błąd struktury archiwum: {message}")


# ============================================================================
# TYPY STATUSÓW
# ============================================================================


class ArchiveImportStatus(StrEnum):
    """Status importu archiwum."""

    SUCCESS = "SUCCESS"
    PARTIAL = "PARTIAL"  # Częściowy import (np. starsza wersja)
    FAILED = "FAILED"
    CATALOG_MAPPING_REQUIRED = (
        "CATALOG_MAPPING_REQUIRED"  # Import OK, ale wymagane mapowanie katalogowe
    )


# ============================================================================
# MODELE DANYCH ARCHIWUM
# ============================================================================


@dataclass(frozen=True)
class ProjectMeta:
    """Metadane projektu w archiwum."""

    id: str
    name: str
    description: str | None
    schema_version: str
    active_network_snapshot_id: str | None
    connection_node_id: str | None
    sources: list[dict[str, Any]]
    created_at: str  # ISO 8601
    updated_at: str  # ISO 8601
    # NOTE: exported_at is in manifest.json only (not in project.json for determinism)


@dataclass(frozen=True)
class NetworkModelSection:
    """Sekcja modelu sieci w archiwum."""

    nodes: list[dict[str, Any]]
    branches: list[dict[str, Any]]
    sources: list[dict[str, Any]]
    loads: list[dict[str, Any]]
    snapshots: list[dict[str, Any]]


@dataclass(frozen=True)
class SldSection:
    """Sekcja diagramów SLD w archiwum."""

    diagrams: list[dict[str, Any]]
    node_symbols: list[dict[str, Any]]
    branch_symbols: list[dict[str, Any]]
    annotations: list[dict[str, Any]]


@dataclass(frozen=True)
class CasesSection:
    """Sekcja przypadków obliczeniowych w archiwum."""

    study_cases: list[dict[str, Any]]
    operating_cases: list[dict[str, Any]]
    switching_states: list[dict[str, Any]]
    settings: dict[str, Any] | None


@dataclass(frozen=True)
class RunsSection:
    """Sekcja wykonań analiz w archiwum.

    CV-3.3-B: `analysis_runs` (R2) + `study_runs` (R3) usunięte razem z torem,
    który je pisał (`AnalysisRunService`, legacy `study_runs`/`study_results`) —
    JEDYNY rejestr biegów to odtąd `canonical_runs` (R1, `enm.canonical_analysis
    .CanonicalRun`), pełny zrzut pól (patrz `application/project_archive/service
    .py::_collect_runs`). `analysis_runs_index` ZOSTAJE bez zmian: to
    NIEZALEŻNA tabela (`AnalysisRunIndexORM`) obsługująca ekran koordynacji
    zabezpieczeń (`application/analyses/protection/{catalog,overcurrent}
    /pipeline.py`, `api/protection_overcurrent_settings.py`) — żywy konsument
    produkcyjny (`ui2/wyniki/koordynacja`), niezwiązany z R2/R3.
    """

    canonical_runs: list[dict[str, Any]]
    analysis_runs_index: list[dict[str, Any]]


@dataclass(frozen=True)
class ResultsSection:
    """Sekcja wyników w archiwum.

    CV-3.3-B: `study_results` (R3, `StudyResultORM`) usunięty razem z torem,
    który go pisał — wynik biegu jest odtąd częścią samego `canonical_runs`
    (`CanonicalRun.raw_result`), nie osobnym rekordem. Sekcja zostaje jako
    pusty kontener: klucz `results` jest częścią WYMAGANEJ struktury archiwum
    (`required_keys` w `archive_from_dict`), a hash sekcji (`results_hash`)
    zostaje stabilnym polem odcisku nawet bez zawartości.
    """


@dataclass(frozen=True)
class ProofsSection:
    """Sekcja dowodów w archiwum."""

    design_specs: list[dict[str, Any]]
    design_proposals: list[dict[str, Any]]
    design_evidence: list[dict[str, Any]]


@dataclass(frozen=True)
class InterpretationsSection:
    """Sekcja interpretacji w archiwum."""

    # Interpretacje są generowane dynamicznie z wyników
    # Ta sekcja może przechowywać cached interpretations
    cached: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class IssuesSection:
    """Sekcja problemów/walidacji w archiwum."""

    # Issues są generowane dynamicznie
    # Ta sekcja może przechowywać snapshot issues w momencie eksportu
    snapshot: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class EnmSection:
    """Sekcja modeli ENM (EnergyNetworkModel) per przypadek w archiwum.

    Każdy wpis: {"case_id": str, "snapshot": dict} — pełny zrzut modelu ENM
    (model_dump) dla przypadku, posortowane po case_id dla determinizmu.
    ENM jest jedynym nośnikiem stacji/transformatorów/strony nN — bez tej
    sekcji dane ENM znikały przy eksporcie/imporcie projektu (dług N-D1).
    """

    models: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class ArchiveFingerprints:
    """Fingerprints (hashe) wszystkich sekcji archiwum."""

    archive_hash: str  # Hash całego archiwum
    project_meta_hash: str
    network_model_hash: str
    sld_hash: str
    cases_hash: str
    runs_hash: str
    results_hash: str
    proofs_hash: str
    interpretations_hash: str
    issues_hash: str
    enm_hash: str = ""  # puste w archiwach sprzed sekcji ENM


@dataclass(frozen=True)
class ProjectArchive:
    """
    Pełne archiwum projektu MV-DESIGN PRO.

    Format:
    - schema_version: wersja schematu archiwum
    - format_id: identyfikator formatu (MV-DESIGN-PRO-ARCHIVE)
    - project_meta: metadane projektu
    - network_model: model sieci
    - sld_diagrams: diagramy SLD
    - cases: przypadki obliczeniowe
    - runs: wykonania analiz
    - results: wyniki
    - interpretations: interpretacje
    - proofs: dowody
    - issues: problemy/walidacje
    - fingerprints: hashe wszystkich sekcji
    """

    schema_version: str
    format_id: str
    project_meta: ProjectMeta
    network_model: NetworkModelSection
    sld_diagrams: SldSection
    cases: CasesSection
    runs: RunsSection
    results: ResultsSection
    proofs: ProofsSection
    interpretations: InterpretationsSection
    issues: IssuesSection
    fingerprints: ArchiveFingerprints
    enm: EnmSection = field(default_factory=EnmSection)


# ============================================================================
# NARZĘDZIA DO HASHOWANIA (DETERMINISTYCZNE)
# ============================================================================


def _stable_sort_key(value: Any) -> str:
    """Klucz sortowania dla stabilnego porządku."""
    if isinstance(value, dict):
        for key in ("id", "snapshot_id", "node_id", "branch_id", "run_id", "name"):
            if key in value and value[key] is not None:
                return str(value[key])
    return str(value)


def canonicalize(value: Any) -> Any:
    """Kanonizacja wartości dla deterministycznego JSON."""
    if isinstance(value, dict):
        return {key: canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [canonicalize(item) for item in value]
    if isinstance(value, tuple):
        return [canonicalize(item) for item in value]
    if isinstance(value, set):
        return sorted((canonicalize(item) for item in value), key=_stable_sort_key)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def compute_hash(data: Any) -> str:
    """Oblicz deterministyczny hash SHA-256 dla danych."""
    canonical = canonicalize(data)
    json_str = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


def compute_archive_fingerprints(
    project_meta: dict[str, Any],
    network_model: dict[str, Any],
    sld: dict[str, Any],
    cases: dict[str, Any],
    runs: dict[str, Any],
    results: dict[str, Any],
    proofs: dict[str, Any],
    interpretations: dict[str, Any],
    issues: dict[str, Any],
    enm: dict[str, Any] | None = None,
) -> ArchiveFingerprints:
    """Oblicz fingerprints dla wszystkich sekcji archiwum."""
    project_meta_hash = compute_hash(project_meta)
    network_model_hash = compute_hash(network_model)
    sld_hash = compute_hash(sld)
    cases_hash = compute_hash(cases)
    runs_hash = compute_hash(runs)
    results_hash = compute_hash(results)
    proofs_hash = compute_hash(proofs)
    interpretations_hash = compute_hash(interpretations)
    issues_hash = compute_hash(issues)
    enm_hash = compute_hash(enm if enm is not None else {"models": []})

    # Hash całego archiwum to hash wszystkich hash'y
    archive_hash = compute_hash(
        {
            "project_meta": project_meta_hash,
            "network_model": network_model_hash,
            "sld": sld_hash,
            "cases": cases_hash,
            "runs": runs_hash,
            "results": results_hash,
            "proofs": proofs_hash,
            "interpretations": interpretations_hash,
            "issues": issues_hash,
            "enm": enm_hash,
        }
    )

    return ArchiveFingerprints(
        archive_hash=archive_hash,
        project_meta_hash=project_meta_hash,
        network_model_hash=network_model_hash,
        sld_hash=sld_hash,
        cases_hash=cases_hash,
        runs_hash=runs_hash,
        results_hash=results_hash,
        proofs_hash=proofs_hash,
        interpretations_hash=interpretations_hash,
        issues_hash=issues_hash,
        enm_hash=enm_hash,
    )


# ============================================================================
# SERIALIZACJA / DESERIALIZACJA
# ============================================================================


def archive_to_dict(archive: ProjectArchive) -> dict[str, Any]:
    """Konwersja archiwum do słownika (do JSON)."""
    return canonicalize(
        {
            "schema_version": archive.schema_version,
            "format_id": archive.format_id,
            "project_meta": {
                "id": archive.project_meta.id,
                "name": archive.project_meta.name,
                "description": archive.project_meta.description,
                "schema_version": archive.project_meta.schema_version,
                "active_network_snapshot_id": archive.project_meta.active_network_snapshot_id,
                "connection_node_id": archive.project_meta.connection_node_id,
                "sources": archive.project_meta.sources,
                "created_at": archive.project_meta.created_at,
                "updated_at": archive.project_meta.updated_at,
            },
            "network_model": {
                "nodes": archive.network_model.nodes,
                "branches": archive.network_model.branches,
                "sources": archive.network_model.sources,
                "loads": archive.network_model.loads,
                "snapshots": archive.network_model.snapshots,
            },
            "sld_diagrams": {
                "diagrams": archive.sld_diagrams.diagrams,
                "node_symbols": archive.sld_diagrams.node_symbols,
                "branch_symbols": archive.sld_diagrams.branch_symbols,
                "annotations": archive.sld_diagrams.annotations,
            },
            "cases": {
                "study_cases": archive.cases.study_cases,
                "operating_cases": archive.cases.operating_cases,
                "switching_states": archive.cases.switching_states,
                "settings": archive.cases.settings,
            },
            "runs": {
                "canonical_runs": archive.runs.canonical_runs,
                "analysis_runs_index": archive.runs.analysis_runs_index,
            },
            "results": {},
            "proofs": {
                "design_specs": archive.proofs.design_specs,
                "design_proposals": archive.proofs.design_proposals,
                "design_evidence": archive.proofs.design_evidence,
            },
            "interpretations": {
                "cached": archive.interpretations.cached,
            },
            "issues": {
                "snapshot": archive.issues.snapshot,
            },
            "enm": {
                "models": archive.enm.models,
            },
            "fingerprints": {
                "archive_hash": archive.fingerprints.archive_hash,
                "project_meta_hash": archive.fingerprints.project_meta_hash,
                "network_model_hash": archive.fingerprints.network_model_hash,
                "sld_hash": archive.fingerprints.sld_hash,
                "cases_hash": archive.fingerprints.cases_hash,
                "runs_hash": archive.fingerprints.runs_hash,
                "results_hash": archive.fingerprints.results_hash,
                "proofs_hash": archive.fingerprints.proofs_hash,
                "interpretations_hash": archive.fingerprints.interpretations_hash,
                "issues_hash": archive.fingerprints.issues_hash,
                "enm_hash": archive.fingerprints.enm_hash,
            },
        }
    )


def dict_to_archive(data: dict[str, Any]) -> ProjectArchive:
    """Konwersja słownika (z JSON) do archiwum."""
    # Walidacja podstawowej struktury
    required_keys = [
        "schema_version",
        "format_id",
        "project_meta",
        "network_model",
        "sld_diagrams",
        "cases",
        "runs",
        "results",
        "proofs",
        "fingerprints",
    ]
    for key in required_keys:
        if key not in data:
            raise ArchiveStructureError(f"Brak wymaganej sekcji: {key}")

    # Walidacja format_id
    if data["format_id"] != ARCHIVE_FORMAT_ID:
        raise ArchiveStructureError(f"Nieprawidłowy identyfikator formatu: {data['format_id']}")

    # Walidacja wersji (obsługujemy migracje)
    schema_version = data["schema_version"]
    if not _is_compatible_version(schema_version):
        raise ArchiveVersionError(ARCHIVE_SCHEMA_VERSION, schema_version)

    pm = data["project_meta"]
    nm = data["network_model"]
    sld = data["sld_diagrams"]
    cases = data["cases"]
    runs = data["runs"]
    proofs = data["proofs"]
    interpretations = data.get("interpretations", {"cached": []})
    issues = data.get("issues", {"snapshot": []})
    enm = data.get("enm", {"models": []})
    fp = data["fingerprints"]

    return ProjectArchive(
        schema_version=schema_version,
        format_id=data["format_id"],
        project_meta=ProjectMeta(
            id=pm["id"],
            name=pm["name"],
            description=pm.get("description"),
            schema_version=pm["schema_version"],
            active_network_snapshot_id=pm.get("active_network_snapshot_id"),
            connection_node_id=pm.get("connection_node_id"),
            sources=pm.get("sources", []),
            created_at=pm["created_at"],
            updated_at=pm["updated_at"],
        ),
        network_model=NetworkModelSection(
            nodes=nm.get("nodes", []),
            branches=nm.get("branches", []),
            sources=nm.get("sources", []),
            loads=nm.get("loads", []),
            snapshots=nm.get("snapshots", []),
        ),
        sld_diagrams=SldSection(
            diagrams=sld.get("diagrams", []),
            node_symbols=sld.get("node_symbols", []),
            branch_symbols=sld.get("branch_symbols", []),
            annotations=sld.get("annotations", []),
        ),
        cases=CasesSection(
            study_cases=cases.get("study_cases", []),
            operating_cases=cases.get("operating_cases", []),
            switching_states=cases.get("switching_states", []),
            settings=cases.get("settings"),
        ),
        runs=RunsSection(
            canonical_runs=runs.get("canonical_runs", []),
            analysis_runs_index=runs.get("analysis_runs_index", []),
        ),
        results=ResultsSection(),
        proofs=ProofsSection(
            design_specs=proofs.get("design_specs", []),
            design_proposals=proofs.get("design_proposals", []),
            design_evidence=proofs.get("design_evidence", []),
        ),
        interpretations=InterpretationsSection(
            cached=interpretations.get("cached", []),
        ),
        issues=IssuesSection(
            snapshot=issues.get("snapshot", []),
        ),
        enm=EnmSection(
            models=enm.get("models", []),
        ),
        fingerprints=ArchiveFingerprints(
            archive_hash=fp["archive_hash"],
            project_meta_hash=fp["project_meta_hash"],
            network_model_hash=fp["network_model_hash"],
            sld_hash=fp["sld_hash"],
            cases_hash=fp["cases_hash"],
            runs_hash=fp["runs_hash"],
            results_hash=fp["results_hash"],
            proofs_hash=fp["proofs_hash"],
            interpretations_hash=fp.get("interpretations_hash", ""),
            issues_hash=fp.get("issues_hash", ""),
            enm_hash=fp.get("enm_hash", ""),
        ),
    )


def _is_compatible_version(version: str) -> bool:
    """Sprawdź czy wersja schematu jest kompatybilna."""
    # Parsowanie wersji semantycznej
    try:
        parts = version.split(".")
        major = int(parts[0])
        # Kompatybilność w ramach tej samej wersji major
        current_parts = ARCHIVE_SCHEMA_VERSION.split(".")
        current_major = int(current_parts[0])
        return major <= current_major
    except (ValueError, IndexError):
        return False


def verify_archive_integrity(archive: ProjectArchive) -> list[str]:
    """
    Weryfikacja integralności archiwum.

    Zwraca listę błędów (pusta = OK).
    """
    errors: list[str] = []

    # Przelicz hashe i porównaj
    archive_dict = archive_to_dict(archive)

    computed = compute_archive_fingerprints(
        project_meta=archive_dict["project_meta"],
        network_model=archive_dict["network_model"],
        sld=archive_dict["sld_diagrams"],
        cases=archive_dict["cases"],
        runs=archive_dict["runs"],
        results=archive_dict["results"],
        proofs=archive_dict["proofs"],
        interpretations=archive_dict.get("interpretations", {"cached": []}),
        issues=archive_dict.get("issues", {"snapshot": []}),
        enm=archive_dict.get("enm", {"models": []}),
    )

    checks = [
        ("project_meta", computed.project_meta_hash, archive.fingerprints.project_meta_hash),
        ("network_model", computed.network_model_hash, archive.fingerprints.network_model_hash),
        ("sld", computed.sld_hash, archive.fingerprints.sld_hash),
        ("cases", computed.cases_hash, archive.fingerprints.cases_hash),
        ("runs", computed.runs_hash, archive.fingerprints.runs_hash),
        ("results", computed.results_hash, archive.fingerprints.results_hash),
        ("proofs", computed.proofs_hash, archive.fingerprints.proofs_hash),
    ]

    # Opcjonalne sekcje (mogą mieć pusty hash w starszych wersjach)
    if archive.fingerprints.interpretations_hash:
        checks.append(
            (
                "interpretations",
                computed.interpretations_hash,
                archive.fingerprints.interpretations_hash,
            )
        )
    if archive.fingerprints.issues_hash:
        checks.append(("issues", computed.issues_hash, archive.fingerprints.issues_hash))
    if archive.fingerprints.enm_hash:
        checks.append(("enm", computed.enm_hash, archive.fingerprints.enm_hash))

    for section, computed_hash, stored_hash in checks:
        if computed_hash != stored_hash:
            errors.append(
                f"Błąd integralności sekcji '{section}': "
                f"oczekiwano {stored_hash}, obliczono {computed_hash}"
            )

    return errors


# ============================================================================
# WYNIK IMPORTU
# ============================================================================


@dataclass
class ArchiveImportResult:
    """Wynik operacji importu archiwum."""

    status: ArchiveImportStatus
    project_id: str | None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    migrated_from_version: str | None = None
    # Bramka katalogowa po imporcie — lista elementow bez catalog_ref
    elements_without_catalog: list[str] = field(default_factory=list)
    catalog_mapping_required: bool = False
